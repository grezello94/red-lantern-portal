import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, Camera, Check, CheckCircle2, ChevronDown,
  ChevronLeft, ChevronRight, CircleAlert, Clipboard, CloudOff, Image as ImageIcon,
  LoaderCircle, MessageCircle, Minus, Package, Plus, Search, Send, ShoppingBag,
  Sparkles, Trash2, Truck,
} from 'lucide-react';
import {
  formatOrderMessage, getItemReferencePhotos, getSupplierItemReferences,
  getVendorAssignedMessageIds, ITEM_UNITS, normalizeItemUnit,
  normalizeItemUnits, normalizeSupplies, saveItemReferencePhotos, updateSupplier,
} from '../data.js';
import { EmptyState, Field, Modal } from './ui.jsx';
import {
  analyzeShelfPhoto, compressImageToBase64, getStoredGeminiKey, saveStoredGeminiKey,
} from '../ai.js';

const displayQuantity = (quantity) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(quantity);

function readDraftBackup(key) {
  try {
    const draft = JSON.parse(localStorage.getItem(key));
    if (!draft || typeof draft !== 'object') return null;
    return {
      note: typeof draft.note === 'string' ? draft.note : '',
      pending: draft.pending === true && Array.isArray(draft.supplies),
      supplies: Array.isArray(draft.supplies) ? draft.supplies : [],
    };
  } catch { return null; }
}

function saveDraftBackup(key, supplies, note, pending) {
  try {
    localStorage.setItem(key, JSON.stringify({ note, pending, ...(pending ? { supplies } : {}) }));
  } catch {
    // Remote persistence still works when browser storage is unavailable.
  }
}

function clearSavedBackup(key, supplies) {
  const stored = readDraftBackup(key);
  // A previous mounted composer must never clear a newer local draft or note.
  if (stored?.pending && JSON.stringify(normalizeSupplies(stored.supplies)) === JSON.stringify(supplies)) {
    saveDraftBackup(key, supplies, stored.note, false);
  }
}

export default function OrderComposer({ storeId, isAdmin, supplier, orderMessages = [], itemUnits = ITEM_UNITS, onBack, showToast }) {
  const draftKey = `red_lantern_draft_v1:${storeId}:${supplier.id}`;
  const [initialDraft] = useState(() => readDraftBackup(draftKey));
  const [supplies, setSupplies] = useState(() => normalizeSupplies(initialDraft?.pending ? initialDraft.supplies : supplier.supplies));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [note, setNote] = useState(initialDraft?.note || '');
  const [saveState, setSaveState] = useState(initialDraft?.pending ? 'pending' : 'saved');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('PIECES');
  const [newTargetQuantity, setNewTargetQuantity] = useState('');
  const [itemError, setItemError] = useState('');
  const [deleteItem, setDeleteItem] = useState(null);
  const [showClear, setShowClear] = useState(false);
  const [reviewMessage, setReviewMessage] = useState(null);
  const [copied, setCopied] = useState(false);

  const [showAIScan, setShowAIScan] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiClarityIssue, setAiClarityIssue] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiUndetectedItems, setAiUndetectedItems] = useState([]);
  const [tempPhotoUrl, setTempPhotoUrl] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState(() => getStoredGeminiKey());
  const referencePhotos = useMemo(() => {
    if (Array.isArray(supplier.referencePhotos)) return supplier.referencePhotos;
    if (supplier.referencePhoto) return [supplier.referencePhoto];
    return [];
  }, [supplier.referencePhoto, supplier.referencePhotos]);

  // Item-level Benchmark References State
  const [itemReferences, setItemReferences] = useState({});
  const [activeItemRef, setActiveItemRef] = useState(null);
  const [itemRefPhotosDraft, setItemRefPhotosDraft] = useState([]);
  const [savingItemRef, setSavingItemRef] = useState(false);

  const fileInputRef = useRef(null);
  const itemRefInputRef = useRef(null);
  const itemRefReplaceInputRef = useRef(null);
  const targetItemReplaceIndexRef = useRef(null);

  const suppliesRef = useRef(supplies);
  const dirtyRef = useRef(Boolean(initialDraft?.pending));
  const noteRef = useRef(note);
  const revisionRef = useRef(0);
  const timerRef = useRef(null);
  const inFlightRef = useRef(null);
  const mountedRef = useRef(true);
  const toastRef = useRef(showToast);
  const lastRemoteRef = useRef(JSON.stringify(normalizeSupplies(supplier.supplies)));
  const holdTimeoutRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const holdTicksRef = useRef(0);
  const suppressPointerClickRef = useRef(null);
  const lastHapticRef = useRef(0);
  const isDemo = storeId === 'demo';

  const stopAdjustPress = useCallback(() => {
    clearTimeout(holdTimeoutRef.current);
    clearInterval(holdIntervalRef.current);
    holdTimeoutRef.current = null;
    holdIntervalRef.current = null;
    holdTicksRef.current = 0;
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', stopAdjustPress);
    window.addEventListener('pointercancel', stopAdjustPress);
    window.addEventListener('blur', stopAdjustPress);
    document.addEventListener('visibilitychange', stopAdjustPress);
    return () => {
      stopAdjustPress();
      window.removeEventListener('pointerup', stopAdjustPress);
      window.removeEventListener('pointercancel', stopAdjustPress);
      window.removeEventListener('blur', stopAdjustPress);
      document.removeEventListener('visibilitychange', stopAdjustPress);
    };
  }, [stopAdjustPress]);

  useEffect(() => { toastRef.current = showToast; }, [showToast]);

  const flushDraft = useCallback(async function persistDraft() {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    if (inFlightRef.current) {
      await inFlightRef.current;
      if (dirtyRef.current) return persistDraft();
      return;
    }
    if (!dirtyRef.current) return;

    const revision = revisionRef.current;
    const nextSupplies = suppliesRef.current;
    if (mountedRef.current) setSaveState(navigator.onLine || isDemo ? 'saving' : 'offline');
    const save = Promise.resolve()
      .then(() => updateSupplier(storeId, supplier.id, { supplies: nextSupplies }))
      .then(() => {
        if (revisionRef.current === revision) {
          dirtyRef.current = false;
          clearSavedBackup(draftKey, nextSupplies);
          if (mountedRef.current) setSaveState('saved');
        }
      })
      .catch(() => {
        if (mountedRef.current) setSaveState(navigator.onLine ? 'error' : 'offline');
        toastRef.current?.('Your draft could not be saved. Retry when you are connected.');
      });
    inFlightRef.current = save;
    await save;
    inFlightRef.current = null;
  }, [storeId, supplier.id, isDemo, draftKey]);

  useEffect(() => {
    mountedRef.current = true;
    if (dirtyRef.current) timerRef.current = setTimeout(() => { void flushDraft(); }, 450);
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      void flushDraft();
    };
  }, [flushDraft]);

  useEffect(() => {
    const remote = normalizeSupplies(supplier.supplies);
    const signature = JSON.stringify(remote);
    if (signature === lastRemoteRef.current) return;
    lastRemoteRef.current = signature;
    let cancelled = false;
    // Coalesce realtime snapshots; pending local edits retain priority until saved.
    queueMicrotask(() => {
      if (cancelled || dirtyRef.current) return;
      suppliesRef.current = remote;
      setSupplies(remote);
    });
    return () => { cancelled = true; };
  }, [supplier.supplies]);

  useEffect(() => {
    let mounted = true;
    getSupplierItemReferences(storeId, supplier.id).then((refs) => {
      if (mounted && refs) {
        setItemReferences(refs);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [storeId, supplier.id]);

  const trainedCount = useMemo(() => supplies.filter((it) => {
    const photos = itemReferences[it.id];
    return (Array.isArray(photos) && photos.length > 0) || (Number(it.referenceCount) > 0);
  }).length, [supplies, itemReferences]);

  useEffect(() => {
    const connectionChanged = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine && dirtyRef.current) void flushDraft();
    };
    window.addEventListener('online', connectionChanged);
    window.addEventListener('offline', connectionChanged);
    const flushOnExit = () => { void flushDraft(); };
    window.addEventListener('pagehide', flushOnExit);
    return () => {
      window.removeEventListener('online', connectionChanged);
      window.removeEventListener('offline', connectionChanged);
      window.removeEventListener('pagehide', flushOnExit);
    };
  }, [flushDraft]);

  const changeSupplies = (updater) => {
    const next = updater(suppliesRef.current);
    if (JSON.stringify(next) === JSON.stringify(suppliesRef.current)) return;
    suppliesRef.current = next;
    dirtyRef.current = true;
    revisionRef.current += 1;
    saveDraftBackup(draftKey, next, noteRef.current, true);
    setSupplies(next);
    setSaveState('pending');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flushDraft(); }, 450);
  };

  const forgetQuantityDraft = (id) => {
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const changeQuantity = (id, quantity) => {
    if (!Number.isFinite(quantity)) return;
    const safeQuantity = Math.max(0, Math.round(quantity * 10000) / 10000);
    changeSupplies((current) => current.map((item) => item.id === id ? { ...item, quantity: safeQuantity } : item));
  };

  const adjustQuantity = (id, direction, step = 1) => {
    const item = suppliesRef.current.find((entry) => entry.id === id);
    if (!item || (direction < 0 && item.quantity === 0)) { stopAdjustPress(); return false; }
    forgetQuantityDraft(id);
    changeQuantity(id, item.quantity + direction * step);
    if (typeof navigator.vibrate === 'function' && Date.now() - lastHapticRef.current > 90) {
      lastHapticRef.current = Date.now();
      navigator.vibrate(12);
    }
    return true;
  };

  const startAdjustPress = (event, id, direction) => {
    if (event.button !== 0 || !event.isPrimary) return;
    stopAdjustPress();
    if (!adjustQuantity(id, direction)) return;
    suppressPointerClickRef.current = { id, direction };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        holdTicksRef.current += 1;
        adjustQuantity(id, direction, holdTicksRef.current > 18 ? 10 : holdTicksRef.current > 8 ? 5 : 1);
      }, 120);
    }, 350);
  };

  const handleStepperClick = (event, id, direction) => {
    const pointerPress = suppressPointerClickRef.current;
    suppressPointerClickRef.current = null;
    if (event.detail !== 0 && pointerPress?.id === id && pointerPress.direction === direction) return;
    adjustQuantity(id, direction);
  };

  const selectedItems = useMemo(() => supplies.filter((item) => item.quantity > 0), [supplies]);
  const availableUnits = useMemo(() => normalizeItemUnits([
    ...(Array.isArray(itemUnits) ? itemUnits : ITEM_UNITS),
    ...supplies.map((item) => item.unit),
  ]), [itemUnits, supplies]);
  const visibleItems = useMemo(() => supplies.filter((item) => (
    (filter === 'all' || item.quantity > 0) && item.name.toLowerCase().includes(query.trim().toLowerCase())
  )), [supplies, filter, query]);
  const assignedIds = getVendorAssignedMessageIds(supplier, orderMessages);
  const instructions = orderMessages.filter((message) => assignedIds.includes(message.id));
  const quantityTotals = [...new Set(selectedItems.map((item) => normalizeItemUnit(item.unit)))].map((unit) => ({
    unit,
    quantity: selectedItems.filter((item) => normalizeItemUnit(item.unit) === unit)
      .reduce((total, item) => total + item.quantity, 0),
  })).filter((total) => total.quantity > 0);
  const effectiveSaveState = !online && !isDemo ? 'offline' : saveState;
  const SaveIcon = effectiveSaveState === 'saving' ? LoaderCircle
    : effectiveSaveState === 'offline' ? CloudOff
      : effectiveSaveState === 'error' ? CircleAlert : CheckCircle2;
  const saveLabel = effectiveSaveState === 'saving' ? 'Saving draft…'
    : effectiveSaveState === 'pending' ? 'Unsaved changes'
      : effectiveSaveState === 'offline' ? 'Offline · draft may not be synced'
        : effectiveSaveState === 'error' ? 'Save failed · retry' : isDemo ? 'Saved locally' : 'Draft saved';

  const handleBack = () => {
    void flushDraft();
    onBack();
  };

  const addItem = (event) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) { setItemError('Enter an item name.'); return; }
    if (supplies.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      setItemError('An item with this name is already in the catalog.');
      return;
    }
    const targetQty = Number(newTargetQuantity);
    changeSupplies((current) => [...current, {
      id: `item-${crypto.randomUUID()}`,
      name,
      quantity: 0,
      unit: normalizeItemUnit(newUnit),
      targetQuantity: Number.isFinite(targetQty) && targetQty > 0 ? targetQty : null,
    }]);
    setNewName('');
    setNewUnit('PIECES');
    setNewTargetQuantity('');
    setItemError('');
    setShowAdd(false);
    setFilter('all');
    setQuery('');
    showToast?.('Item added to the catalog.');
  };

  const handleScanPhotoSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const apiKey = getStoredGeminiKey();
    if (!apiKey) {
      setShowKeyModal(true);
      return;
    }

    setShowAIScan(true);
    setAiAnalyzing(true);
    setAiError('');
    setAiClarityIssue('');
    setAiSuggestions([]);
    setAiUndetectedItems([]);

    try {
      const compressed = await compressImageToBase64(file, 1200, 0.74);
      setTempPhotoUrl(compressed.dataUrl);

      const analysisResult = await analyzeShelfPhoto({
        apiKey,
        supplier: { ...supplier, supplies: suppliesRef.current },
        currentPhotoBase64: compressed.base64,
        referencePhotos,
        itemReferences,
      });

      if (analysisResult?.isUnclear) {
        setAiClarityIssue(analysisResult.clarityIssue || 'Photo is blurry or too dark to verify stock with 100% accuracy.');
      } else {
        setAiClarityIssue('');
      }

      const rawList = Array.isArray(analysisResult?.suggestions) ? analysisResult.suggestions : (Array.isArray(analysisResult) ? analysisResult : []);
      const allCatalog = suppliesRef.current;
      const detected = [];
      const undetected = [];

      allCatalog.forEach((catItem) => {
        const found = rawList.find((sug) => sug.id === catItem.id || String(sug.name || '').toLowerCase() === catItem.name.toLowerCase());
        const levelStr = String(found?.level || '').toLowerCase();
        const isNotVisible = !found || levelStr.includes('not visible') || levelStr.includes('unknown');

        if (isNotVisible) {
          undetected.push({
            id: catItem.id,
            name: catItem.name,
            unit: catItem.unit || 'PIECES',
            targetQuantity: catItem.targetQuantity || null,
            orderQuantity: 0,
            reason: found?.reason || 'Not detected on scanned shelves or crates.',
          });
        } else {
          detected.push({
            id: catItem.id,
            name: catItem.name,
            unit: catItem.unit || 'PIECES',
            level: found.level || 'Low',
            suggestedQuantity: Number.isFinite(Number(found.suggestedQuantity)) ? Math.max(0, Number(found.suggestedQuantity)) : 0,
            reason: found.reason || '',
          });
        }
      });

      setAiSuggestions(detected);
      setAiUndetectedItems(undetected);
    } catch (err) {
      setAiError(err.message || 'Failed to analyze shelf photo.');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const adjustAiSuggestionQty = (id, delta) => {
    setAiSuggestions((prev) => prev.map((item) => {
      if (item.id === id) {
        return { ...item, suggestedQuantity: Math.max(0, Number((item.suggestedQuantity + delta).toFixed(2))) };
      }
      return item;
    }));
  };

  const adjustUndetectedItemQty = (id, delta) => {
    setAiUndetectedItems((prev) => prev.map((item) => {
      if (item.id === id) {
        const currentQty = item.orderQuantity || 0;
        const newQty = Math.max(0, currentQty + delta);
        return { ...item, orderQuantity: newQty };
      }
      return item;
    }));
  };

  const addUndetectedToOrder = (id) => {
    setAiUndetectedItems((prev) => prev.map((item) => {
      if (item.id === id) {
        const defaultQty = Number(item.targetQuantity) > 0 ? Number(item.targetQuantity) : 1;
        return { ...item, orderQuantity: defaultQty };
      }
      return item;
    }));
  };

  const applyAISuggestions = () => {
    let appliedCount = 0;
    aiSuggestions.forEach((sug) => {
      if (sug.suggestedQuantity > 0) {
        changeQuantity(sug.id, sug.suggestedQuantity);
        appliedCount += 1;
      }
    });
    aiUndetectedItems.forEach((undetected) => {
      if (undetected.orderQuantity > 0) {
        changeQuantity(undetected.id, undetected.orderQuantity);
        appliedCount += 1;
      }
    });
    setTempPhotoUrl('');
    setAiSuggestions([]);
    setAiUndetectedItems([]);
    setShowAIScan(false);
    showToast?.(`Applied ${appliedCount} items to order draft.`);
  };

  const openItemRefModal = async (item) => {
    setActiveItemRef(item);
    const existing = itemReferences[item.id] || [];
    setItemRefPhotosDraft(existing);
    if (!existing.length) {
      try {
        const fetched = await getItemReferencePhotos(storeId, supplier.id, item.id);
        if (fetched.length) {
          setItemRefPhotosDraft(fetched);
          setItemReferences((prev) => ({ ...prev, [item.id]: fetched }));
        }
      } catch {
        // ignore
      }
    }
  };

  const activeItemIndex = useMemo(() => {
    if (!activeItemRef) return -1;
    return supplies.findIndex((it) => it.id === activeItemRef.id);
  }, [activeItemRef, supplies]);

  const prevItem = activeItemIndex > 0 ? supplies[activeItemIndex - 1] : null;
  const nextItem = activeItemIndex >= 0 && activeItemIndex < supplies.length - 1 ? supplies[activeItemIndex + 1] : null;

  const handleItemRefPhotoSelected = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || !activeItemRef) return;
    const remainingSlots = 5 - itemRefPhotosDraft.length;
    if (remainingSlots <= 0) {
      showToast?.('Maximum 5 reference angles reached for this item.');
      return;
    }
    const filesToProcess = files.slice(0, remainingSlots);
    setSavingItemRef(true);
    try {
      const compressedList = await Promise.all(
        filesToProcess.map((f) => compressImageToBase64(f, 480, 0.70))
      );
      const newUrls = compressedList.map((c) => c.dataUrl);
      const updated = [...itemRefPhotosDraft, ...newUrls];
      setItemRefPhotosDraft(updated);
      setItemReferences((prev) => ({ ...prev, [activeItemRef.id]: updated }));
      await saveItemReferencePhotos(storeId, supplier.id, activeItemRef.id, updated);

      const updatedSupplies = suppliesRef.current.map((it) => (it.id === activeItemRef.id ? { ...it, referenceCount: updated.length } : it));
      suppliesRef.current = updatedSupplies;
      setSupplies(updatedSupplies);
      void updateSupplier(storeId, supplier.id, { supplies: updatedSupplies });

      showToast?.(`${newUrls.length} reference ${newUrls.length === 1 ? 'photo' : 'photos'} saved for ${activeItemRef.name}.`);
    } catch {
      showToast?.('Failed to save item reference photos.');
    } finally {
      setSavingItemRef(false);
    }
  };

  const handleItemReplacePhotoSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const idx = targetItemReplaceIndexRef.current;
    if (!file || !activeItemRef || idx === null || idx === undefined || idx < 0 || idx >= itemRefPhotosDraft.length) return;
    setSavingItemRef(true);
    try {
      const compressed = await compressImageToBase64(file, 480, 0.70);
      const updated = [...itemRefPhotosDraft];
      updated[idx] = compressed.dataUrl;
      setItemRefPhotosDraft(updated);
      setItemReferences((prev) => ({ ...prev, [activeItemRef.id]: updated }));
      await saveItemReferencePhotos(storeId, supplier.id, activeItemRef.id, updated);

      showToast?.(`Angle #${idx + 1} updated with new photo for ${activeItemRef.name}.`);
    } catch {
      showToast?.('Failed to update reference photo.');
    } finally {
      setSavingItemRef(false);
      targetItemReplaceIndexRef.current = null;
    }
  };

  const removeItemRefAtIndex = async (idx) => {
    if (!activeItemRef) return;
    const updated = itemRefPhotosDraft.filter((_, i) => i !== idx);
    setItemRefPhotosDraft(updated);
    setItemReferences((prev) => ({ ...prev, [activeItemRef.id]: updated }));
    setSavingItemRef(true);
    try {
      await saveItemReferencePhotos(storeId, supplier.id, activeItemRef.id, updated);
      const updatedSupplies = suppliesRef.current.map((it) => (it.id === activeItemRef.id ? { ...it, referenceCount: updated.length } : it));
      suppliesRef.current = updatedSupplies;
      setSupplies(updatedSupplies);
      void updateSupplier(storeId, supplier.id, { supplies: updatedSupplies });
      showToast?.('Angle removed.');
    } catch {
      showToast?.('Failed to delete angle.');
    } finally {
      setSavingItemRef(false);
    }
  };

  const resetAllItemRefs = async () => {
    if (!activeItemRef) return;
    setItemRefPhotosDraft([]);
    setItemReferences((prev) => {
      const next = { ...prev };
      delete next[activeItemRef.id];
      return next;
    });
    setSavingItemRef(true);
    try {
      await saveItemReferencePhotos(storeId, supplier.id, activeItemRef.id, []);
      const updatedSupplies = suppliesRef.current.map((it) => (it.id === activeItemRef.id ? { ...it, referenceCount: 0 } : it));
      suppliesRef.current = updatedSupplies;
      setSupplies(updatedSupplies);
      void updateSupplier(storeId, supplier.id, { supplies: updatedSupplies });
      showToast?.(`All reference photos cleared for ${activeItemRef.name}.`);
    } catch {
      showToast?.('Failed to reset reference photos.');
    } finally {
      setSavingItemRef(false);
    }
  };

  const saveApiKey = () => {
    saveStoredGeminiKey(keyInput);
    setShowKeyModal(false);
    showToast?.('Gemini API key saved.');
  };

  const reviewOrder = () => {
    if (!selectedItems.length) return;
    void flushDraft();
    setCopied(false);
    setReviewMessage(formatOrderMessage({
      supplier, items: selectedItems, messages: instructions, note: note.trim(), date: new Date(),
    }));
  };

  const copyOrder = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(reviewMessage);
      setCopied(true);
      showToast?.('Order copied. Paste it into your supplier conversation.');
    } catch {
      showToast?.('Copy is unavailable. Select and copy the message in the preview.');
    }
  };

  const supplierPhone = supplier.phone ? String(supplier.phone).trim() : '';
  const supplierPhoneDigits = supplierPhone.replace(/\D/g, '');
  const hasSupplierPhone = supplierPhoneDigits.length >= 7;

  const sendToWhatsApp = (targetPhone = null) => {
    if (!reviewMessage) return;
    void flushDraft();
    try {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(reviewMessage);
        setCopied(true);
      }
    } catch {
      // Clipboard write is an optional convenience; failure is non-fatal.
    }
    showToast?.('Opening WhatsApp…');

    const cleanPhone = targetPhone ? String(targetPhone).replace(/\D/g, '') : '';
    const encoded = encodeURIComponent(reviewMessage);
    const appUrl = cleanPhone
      ? `whatsapp://send?phone=${cleanPhone}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;

    window.location.href = appUrl;
  };

  const openWhatsAppWeb = async (targetPhone = null) => {
    if (!reviewMessage) return;
    void flushDraft();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reviewMessage);
        setCopied(true);
      }
    } catch {
      // Clipboard write is an optional convenience; failure is non-fatal.
    }
    const cleanPhone = targetPhone ? String(targetPhone).replace(/\D/g, '') : '';
    const encoded = encodeURIComponent(reviewMessage);
    const url = cleanPhone
      ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`
      : `https://web.whatsapp.com/`;
    showToast?.('Order copied. Select your contact in WhatsApp Web and paste.');
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="order-composer">
      <div className="composer-header">
        <button className="icon-button composer-back" aria-label="All suppliers" onClick={handleBack}><ArrowLeft size={21} /></button>
        <div className="composer-heading">
          <h1>{supplier.name}</h1>
          <p className="composer-item-count">{supplies.length} registered items</p>
          <button className={`save-status is-${effectiveSaveState}`} disabled={effectiveSaveState !== 'error'} onClick={() => { void flushDraft(); }} aria-live="polite">
            <SaveIcon size={14} /> {saveLabel}
          </button>
        </div>
      </div>

      <div className="composer-workspace">
        <section className="catalog-panel" aria-label="Supplier catalog">
          <div className="catalog-toolbar">
            <div className="search-field"><Search size={17} /><input aria-label="Search supplier items" placeholder="Search items…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            <div className="catalog-tabs" aria-label="Filter catalog">
              <button className={filter === 'all' ? 'active' : ''} aria-label="All items" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All <span>{supplies.length}</span></button>
              <button className={filter === 'selected' ? 'active' : ''} aria-pressed={filter === 'selected'} onClick={() => setFilter('selected')}>Selected <span>{selectedItems.length}</span></button>
            </div>
          </div>

          <div className="catalog-ai-banner">
            <button
              className="ai-banner-scan-action"
              type="button"
              onClick={() => {
                const key = getStoredGeminiKey();
                if (!key) {
                  setShowKeyModal(true);
                  return;
                }
                fileInputRef.current?.click();
              }}
              title="Snap crate or shelf photo to detect low stock"
            >
              <div className="ai-banner-icon-bubble">
                <Camera size={18} />
              </div>
              <div className="ai-banner-info">
                <div className="ai-banner-title-row">
                  <strong className="ai-banner-title">Scan Stock with AI</strong>
                  <span className="badge badge-accent badge-master-tag"><Sparkles size={11} /> GEMINI AI</span>
                </div>
                <p className="ai-banner-desc">Snap crates or shelves · auto-detects low items</p>
              </div>
            </button>

            <div className="ai-banner-right-status">
              <button
                type="button"
                className={`ai-banner-ref-status-btn ${trainedCount === supplies.length && supplies.length > 0 ? 'is-complete' : trainedCount > 0 ? 'is-trained' : ''}`}
                onClick={() => {
                  const firstUntrained = supplies.find((it) => (itemReferences[it.id]?.length || it.referenceCount || 0) === 0);
                  openItemRefModal(firstUntrained || supplies[0]);
                }}
                title="Click to train or review benchmark photos for each item"
              >
                <Sparkles size={13} />
                <span>
                  {trainedCount === supplies.length && supplies.length > 0
                    ? `All ${supplies.length} items trained (4-5 refs)`
                    : `${trainedCount} of ${supplies.length} items trained`}
                </span>
                <ChevronRight size={13} />
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleScanPhotoSelected}
            />
          </div>

          <div className="catalog-list">
            {visibleItems.map((item) => {
              const itemRefs = itemReferences[item.id];
              const refCount = (Array.isArray(itemRefs) && itemRefs.length > 0)
                ? itemRefs.length
                : (Number(item.referenceCount) || 0);

              return (
                <div className={`catalog-row ${item.quantity > 0 ? 'is-selected' : ''}`} key={item.id}>
                  <div className="item-card-heading">
                    <div className="item-name-group">
                      <h2 className="item-name">{item.name}</h2>
                      {Number(item.targetQuantity) > 0 && <span className="item-target-badge" title="Standard target capacity">Target: {item.targetQuantity} {item.unit}</span>}
                    </div>
                    <div className="item-header-actions">
                      <button
                        type="button"
                        className={`item-ref-pill ${refCount > 0 ? 'has-refs' : 'no-refs'}`}
                        onClick={() => openItemRefModal(item)}
                        title={refCount > 0 ? `${refCount} benchmark photos set. Click to view or edit.` : `Add 3-5 benchmark photos (standing, lying flat, tilted) for ${item.name}`}
                        aria-label={`Benchmark photos for ${item.name}`}
                      >
                        <Camera size={13} />
                        <span>{refCount > 0 ? `${refCount}/5 refs` : '+Ref'}</span>
                      </button>
                      {isAdmin && <button className="icon-button item-delete" aria-label={`Delete ${item.name}`} onClick={() => setDeleteItem(item)}><Trash2 size={18} /></button>}
                    </div>
                  </div>
                <div className="quantity-control">
                  <button className="icon-button" aria-label={`Decrease ${item.name} quantity`} disabled={item.quantity === 0} onPointerDown={(event) => startAdjustPress(event, item.id, -1)} onPointerUp={stopAdjustPress} onPointerCancel={stopAdjustPress} onLostPointerCapture={stopAdjustPress} onClick={(event) => handleStepperClick(event, item.id, -1)}><Minus size={21} /></button>
                  <input className="quantity-input" aria-label={`Quantity for ${item.name}`} type="number" inputMode="decimal" min="0" step="any" value={quantityDrafts[item.id] ?? item.quantity} onChange={(event) => {
                    const raw = event.target.value;
                    setQuantityDrafts((current) => ({ ...current, [item.id]: raw }));
                    changeQuantity(item.id, Number(raw));
                  }} onBlur={() => forgetQuantityDraft(item.id)} />
                  <button className="icon-button" aria-label={`Increase ${item.name} quantity`} onPointerDown={(event) => startAdjustPress(event, item.id, 1)} onPointerUp={stopAdjustPress} onPointerCancel={stopAdjustPress} onLostPointerCapture={stopAdjustPress} onClick={(event) => handleStepperClick(event, item.id, 1)}><Plus size={21} /></button>
                  {isAdmin ? <select className="item-unit-select" aria-label={`Unit for ${item.name}`} title={normalizeItemUnit(item.unit)} value={normalizeItemUnit(item.unit)} onChange={(event) => changeSupplies((current) => current.map((entry) => entry.id === item.id ? { ...entry, unit: normalizeItemUnit(event.target.value) } : entry))}>
                    {availableUnits.map((unit) => <option value={unit} key={unit}>{unit}</option>)}
                  </select> : <span className="item-unit-badge" title={normalizeItemUnit(item.unit)}>{normalizeItemUnit(item.unit)}</span>}
                </div>
              </div>
            );
          })}
            {visibleItems.length === 0 && <EmptyState icon={Package} title={query ? 'No matching items' : filter === 'selected' ? 'Your selection is empty' : 'Your catalog starts here'} description={query ? 'Try a different item name.' : filter === 'selected' ? 'Switch to All items and add a quantity to start your order.' : isAdmin ? 'Add the items you regularly order from this supplier.' : 'Ask your store admin to add items for this supplier.'} action={query ? <button className="btn btn-secondary" onClick={() => setQuery('')}>Clear search</button> : filter === 'selected' ? <button className="btn btn-secondary" onClick={() => setFilter('all')}>View all items</button> : null} />}
          </div>
          {isAdmin && <button className="catalog-add-item" onClick={() => { setItemError(''); setShowAdd(true); }}><Plus size={20} /> Add item</button>}
          {supplies.length > 0 && <p className="catalog-hold-hint">Hold + or − to adjust faster. Tap the number to enter a quantity.</p>}
        </section>

        <details className="order-panel" open>
          <summary className="order-panel-heading"><ShoppingBag size={18} /><h2>Order details</h2><span className="order-item-count">{selectedItems.length}</span><ChevronDown size={17} className="order-details-chevron" /></summary>
          <div className="order-summary-caption"><span>{supplier.name}</span><button className="btn btn-ghost btn-small" disabled={!selectedItems.length} onClick={() => setShowClear(true)}>Clear</button></div>
          {selectedItems.length ? <div className="order-line-list" aria-live="polite">
            {selectedItems.map((item) => <div className="order-line" key={item.id}><div className="order-line-detail"><span>{item.name}</span><span className="item-unit">{normalizeItemUnit(item.unit)}</span></div><strong className="order-line-quantity">{displayQuantity(item.quantity)}</strong><button className="icon-button order-remove" aria-label={`Remove ${item.name} from order`} onClick={() => { forgetQuantityDraft(item.id); changeQuantity(item.id, 0); }}><Minus size={14} /></button></div>)}
          </div> : <div className="order-empty"><ShoppingBag size={28} /><strong>A fresh start.</strong><p>Add quantities from the catalog.<br />Your order will appear here.</p></div>}
          {instructions.length > 0 && <div className="order-instructions"><div className="order-section-label"><Truck size={15} /> Delivery instructions</div>{instructions.map((message) => <p className="instruction-item" key={message.id}>{message.text}</p>)}</div>}
          <div className="order-note"><Field label="Order note" hint="Optional · included in the supplier message"><textarea className="input" aria-label="Order note" placeholder="Anything your supplier should know?" rows={3} maxLength={1000} value={note} onChange={(event) => {
            const nextNote = event.target.value;
            noteRef.current = nextNote;
            setNote(nextNote);
            saveDraftBackup(draftKey, suppliesRef.current, nextNote, dirtyRef.current);
          }} /></Field></div>
          <div className="order-totals"><span>Line items</span><strong>{String(selectedItems.length).padStart(2, '0')}</strong>{quantityTotals.length > 0 && <p>{quantityTotals.map((total) => `${displayQuantity(total.quantity)} ${total.unit}`).join(' · ')}</p>}</div>
          <p className="handoff-hint order-detail-hint"><MessageCircle size={13} /> Review first. Send through WhatsApp.</p>
        </details>
      </div>

      {selectedItems.length > 0 && <div className="order-send-bar">
        <button className="btn order-send-button" onClick={reviewOrder}><Send size={21} /><span>Review &amp; send</span><span className="order-send-count">{selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'}</span></button>
      </div>}

      {showAdd && <Modal title="Add catalog item" description="Create an item you can include in future supplier orders." onClose={() => setShowAdd(false)}>
        <form onSubmit={addItem} className="modal-form">
          <Field label="Item name"><input autoFocus className="input" aria-label="Item name" placeholder="e.g. Fresh tomatoes" maxLength={120} required value={newName} onChange={(event) => { setNewName(event.target.value); setItemError(''); }} /></Field>
          <Field label="Order unit"><select className="input" aria-label="Order unit" value={newUnit} onChange={(event) => setNewUnit(event.target.value)}>{availableUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></Field>
          <Field label="Standard full capacity / Par (optional)" hint="Standard full shelf amount. Helps AI suggest order quantities.">
            <input className="input" type="number" inputMode="decimal" min="0" step="any" placeholder="e.g. 10" value={newTargetQuantity} onChange={(event) => setNewTargetQuantity(event.target.value)} />
          </Field>
          {itemError && <p className="form-error" role="alert">{itemError}</p>}
          <div className="modal-actions"><button className="btn btn-secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary" type="submit"><Plus size={16} /> Add item</button></div>
        </form>
      </Modal>}

      {deleteItem && <Modal title="Remove catalog item?" description={`“${deleteItem.name}” will be removed from this supplier’s catalog and current draft.`} onClose={() => setDeleteItem(null)}><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setDeleteItem(null)}>Keep item</button><button className="btn btn-primary" onClick={() => { changeSupplies((current) => current.filter((item) => item.id !== deleteItem.id)); setDeleteItem(null); }}>Remove item</button></div></Modal>}
      {showClear && <Modal title="Clear this draft?" description="All quantities will return to zero. Your catalog and order note will stay available." onClose={() => setShowClear(false)}><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowClear(false)}>Keep draft</button><button className="btn btn-primary" onClick={() => { changeSupplies((current) => current.map((item) => ({ ...item, quantity: 0 }))); setQuantityDrafts({}); setShowClear(false); }}>Clear quantities</button></div></Modal>}

      {showAIScan && (
        <Modal
          wide
          title="AI Crate Scan"
          description="Visual stock analysis. Photos are processed in memory and never saved to storage."
          onClose={() => { if (!aiAnalyzing) { setShowAIScan(false); setTempPhotoUrl(''); } }}
        >
          <div className="ai-scan-modal">
            {tempPhotoUrl && (
              <div className="ai-scan-preview">
                <img src={tempPhotoUrl} alt="Today's stock scan" className="ai-preview-thumb" />
                <span className="badge badge-accent">Scanned just now · In-memory only</span>
              </div>
            )}

            {aiAnalyzing && (
              <div className="ai-scanning-state">
                <LoaderCircle size={34} className="spin" />
                <strong>Analyzing stock with Gemini AI…</strong>
                <div className="ai-scan-step-pill">
                  <Sparkles size={13} />
                  <span>Matching {referencePhotos.length || 1} reference angles · checking clarity &amp; par levels</span>
                </div>
                <p>Processing in memory · 0 MB stored</p>
              </div>
            )}

            {aiError && (
              <div className="form-error-box" role="alert">
                <p><strong>Analysis failed:</strong> {aiError}</p>
                <div className="modal-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => setShowAIScan(false)}>Close</button>
                  <button className="btn btn-primary" type="button" onClick={() => { setShowAIScan(false); setShowKeyModal(true); }}>Check AI Key</button>
                </div>
              </div>
            )}

            {!aiAnalyzing && aiClarityIssue && (
              <div className="ai-unclear-card" role="alert">
                <div className="ai-unclear-header">
                  <div className="ai-unclear-icon">
                    <AlertTriangle size={22} />
                  </div>
                  <div className="ai-unclear-info">
                    <strong>Photo Unclear / Not Analyzable</strong>
                    <p className="ai-unclear-reason">{aiClarityIssue}</p>
                  </div>
                </div>
                <p className="ai-unclear-instruction">
                  To guarantee 100% ordering accuracy, please hold the camera steady in good kitchen lighting and snap the crates again.
                </p>
                <div className="modal-actions" style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera size={16} /> Retake Photo
                  </button>
                  {aiSuggestions.length > 0 && (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => setAiClarityIssue('')}
                    >
                      View partial detections
                    </button>
                  )}
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => { setShowAIScan(false); setTempPhotoUrl(''); setAiClarityIssue(''); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!aiAnalyzing && !aiError && !aiClarityIssue && (aiSuggestions.length > 0 || aiUndetectedItems.length > 0) && (
              <>
                {aiSuggestions.filter((s) => s.suggestedQuantity > 0).length > 0 && (
                  <div className="ai-detected-section">
                    <div className="ai-scan-status">
                      <span>Detected on shelves ({aiSuggestions.filter((s) => s.suggestedQuantity > 0).length} need restock)</span>
                      <span className="ai-scan-privacy">100% verified against references</span>
                    </div>

                    <div className="ai-suggestion-list">
                      {aiSuggestions.map((item) => {
                        const levelStr = String(item.level || '').toLowerCase();
                        const levelClass = levelStr.includes('empty')
                          ? 'empty'
                          : levelStr.includes('low')
                            ? 'low'
                            : levelStr.includes('half')
                              ? 'half'
                              : 'plenty';
                        return (
                          <div className={`ai-suggestion-card ${item.suggestedQuantity > 0 ? 'is-ordering' : ''}`} key={item.id}>
                            <div className="ai-suggestion-header">
                              <strong>{item.name}</strong>
                              <span className={`ai-suggestion-badge ${levelClass}`}>{item.level}</span>
                            </div>
                            {item.reason && <p className="ai-suggestion-reason">{item.reason}</p>}
                            <div className="ai-suggestion-control">
                              <span>Order quantity ({item.unit}):</span>
                              <div className="ai-stepper">
                                <button
                                  type="button"
                                  aria-label={`Decrease suggested ${item.name}`}
                                  disabled={item.suggestedQuantity === 0}
                                  onClick={() => adjustAiSuggestionQty(item.id, -1)}
                                >
                                  <Minus size={15} />
                                </button>
                                <span>{displayQuantity(item.suggestedQuantity)}</span>
                                <button
                                  type="button"
                                  aria-label={`Increase suggested ${item.name}`}
                                  onClick={() => adjustAiSuggestionQty(item.id, 1)}
                                >
                                  <Plus size={15} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {aiSuggestions.length > 0 && aiSuggestions.filter((s) => s.suggestedQuantity > 0).length === 0 && (
                  <div className="ai-all-full-note">
                    <CheckCircle2 size={20} className="accent-mint" />
                    <span>All detected shelf items appear well stocked.</span>
                  </div>
                )}

                {/* USER-REQUESTED QUESTION: UNDETECTED ITEMS PROMPT */}
                {aiUndetectedItems.length > 0 && (
                  <div className="ai-undetected-box">
                    <div className="ai-undetected-header">
                      <div className="ai-undetected-title-row">
                        <AlertTriangle size={18} className="ai-undetected-icon" />
                        <strong>Items Not Detected in Photo ({aiUndetectedItems.length})</strong>
                      </div>
                      <p className="ai-undetected-question">
                        The following {aiUndetectedItems.length === 1 ? 'item was' : 'items were'} not seen or detected on the scanned shelves.
                        <strong> Do you want to place an order for any of them as well?</strong>
                      </p>
                    </div>

                    <div className="ai-undetected-list">
                      {aiUndetectedItems.map((item) => (
                        <div className={`ai-undetected-row ${item.orderQuantity > 0 ? 'is-included' : ''}`} key={item.id}>
                          <div className="ai-undetected-info">
                            <span className="ai-undetected-name">{item.name}</span>
                            <div className="ai-undetected-sub">
                              <span className="badge badge-undetected">Not seen on shelf</span>
                              {item.targetQuantity && <span className="ai-undetected-target">Par: {item.targetQuantity} {item.unit}</span>}
                            </div>
                          </div>

                          {item.orderQuantity > 0 ? (
                            <div className="ai-stepper">
                              <button
                                type="button"
                                aria-label={`Decrease ${item.name}`}
                                onClick={() => adjustUndetectedItemQty(item.id, -1)}
                              >
                                <Minus size={15} />
                              </button>
                              <span className="ai-stepper-val-text">{displayQuantity(item.orderQuantity)} {item.unit}</span>
                              <button
                                type="button"
                                aria-label={`Increase ${item.name}`}
                                onClick={() => adjustUndetectedItemQty(item.id, 1)}
                              >
                                <Plus size={15} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm ai-add-undetected-btn"
                              onClick={() => addUndetectedToOrder(item.id)}
                            >
                              <Plus size={13} />
                              <span>Add to Order</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="modal-actions" style={{ marginTop: 18 }}>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Retake or scan another angle"
                  >
                    <Camera size={15} /> Retake
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={() => { setShowAIScan(false); setTempPhotoUrl(''); }}>Cancel</button>
                  <button className="btn btn-primary" type="button" onClick={applyAISuggestions}>
                    <Check size={16} /> Apply {aiSuggestions.filter((s) => s.suggestedQuantity > 0).length + aiUndetectedItems.filter((s) => s.orderQuantity > 0).length > 0 ? `(${aiSuggestions.filter((s) => s.suggestedQuantity > 0).length + aiUndetectedItems.filter((s) => s.orderQuantity > 0).length})` : ''} to Order
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {activeItemRef && (
        <Modal
          wide
          title={`[Item ${activeItemIndex + 1} of ${supplies.length}] ${activeItemRef.name}`}
          description={`Teach AI how "${activeItemRef.name}" looks when stocked. Add 4 to 5 photos (standing upright, lying flat, front label, crate view). AI uses these for 100% precision.`}
          onClose={() => { if (!savingItemRef) setActiveItemRef(null); }}
        >
          <div className="reference-modal-wrap">
            <div className="reference-status-card">
              <div className="reference-status-info">
                <div className="reference-count-badge">
                  <Sparkles size={14} />
                  <span>{itemRefPhotosDraft.length} of 5 angles saved</span>
                </div>
                <p className="reference-status-desc">
                  {itemRefPhotosDraft.length === 0
                    ? 'No benchmark photos yet. Add 4-5 photos showing packets standing, lying flat, and crate views (you can select multiple photos at once!).'
                    : itemRefPhotosDraft.length < 4
                      ? `Saved ${itemRefPhotosDraft.length} angles. Add ${4 - itemRefPhotosDraft.length} more to reach 4-5 references.`
                      : '✅ Benchmark complete! AI can recognize this item across any angle or orientation.'}
                </p>
              </div>
              {itemRefPhotosDraft.length > 0 && (
                <button
                  type="button"
                  className="reference-reset-btn"
                  onClick={resetAllItemRefs}
                  disabled={savingItemRef}
                >
                  <Trash2 size={13} />
                  <span>Reset all</span>
                </button>
              )}
            </div>

            <div className="reference-grid">
              {itemRefPhotosDraft.map((photoUrl, index) => (
                <div className="reference-card" key={index}>
                  <div className="reference-img-container">
                    <img src={photoUrl} alt={`Angle ${index + 1}`} className="reference-thumbnail" />
                    <div className="reference-card-overlay">
                      <span className="reference-angle-tag">Angle #{index + 1}</span>
                      <button
                        type="button"
                        className="icon-button reference-delete-btn"
                        title="Delete this angle"
                        disabled={savingItemRef}
                        onClick={() => removeItemRefAtIndex(index)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="reference-card-footer">
                    <span className="reference-angle-hint">
                      {index === 0 ? 'Front / Standing' : index === 1 ? 'Lying flat / Side' : index === 2 ? 'Front label / Brand' : index === 3 ? 'Crate / Shelf view' : 'Alternate view'}
                    </span>
                    <button
                      type="button"
                      className="reference-retake-btn"
                      disabled={savingItemRef}
                      onClick={() => {
                        targetItemReplaceIndexRef.current = index;
                        itemRefReplaceInputRef.current?.click();
                      }}
                    >
                      Change
                    </button>
                  </div>
                </div>
              ))}

              {itemRefPhotosDraft.length < 5 && (
                <button
                  type="button"
                  className="reference-add-slot"
                  disabled={savingItemRef}
                  onClick={() => itemRefInputRef.current?.click()}
                >
                  <div className="reference-add-icon">
                    {savingItemRef ? <LoaderCircle size={22} className="spin" /> : <Plus size={24} />}
                  </div>
                  <strong>Add Angle #{itemRefPhotosDraft.length + 1}</strong>
                  <span>
                    {itemRefPhotosDraft.length === 0
                      ? 'Standing upright'
                      : itemRefPhotosDraft.length === 1
                        ? 'Lying flat / tilted'
                        : itemRefPhotosDraft.length === 2
                          ? 'Front label / Brand'
                          : itemRefPhotosDraft.length === 3
                            ? 'Crate / shelf view'
                            : 'Alternate angle'}
                  </span>
                  <small style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
                    Select 1 or multiple photos
                  </small>
                </button>
              )}
            </div>

            <div className="reference-package-hint">
              <Sparkles size={16} className="accent-icon" />
              <div>
                <strong>Packets or bottle design changed?</strong>
                <p>
                  Whenever a brand changes their bottle shape, pouch, or label, simply tap the trash icon on the old photo (or tap &ldquo;Change&rdquo;) to snap the new one. AI will instantly switch to the new benchmark!
                </p>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <button className="btn btn-secondary" type="button" onClick={() => setActiveItemRef(null)}>
                Close
              </button>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {prevItem && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openItemRefModal(prevItem)}
                    disabled={savingItemRef}
                    title={`Previous item: ${prevItem.name}`}
                  >
                    <ChevronLeft size={16} /> Prev Item
                  </button>
                )}
                {nextItem ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => openItemRefModal(nextItem)}
                    disabled={savingItemRef}
                    title={`Train next item: ${nextItem.name}`}
                  >
                    <span>Next Item ({nextItem.name})</span>
                    <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setActiveItemRef(null)}
                  >
                    <Check size={16} /> All {supplies.length} Items Done
                  </button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      <input
        ref={itemRefInputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleItemRefPhotoSelected}
      />
      <input
        ref={itemRefReplaceInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleItemReplacePhotoSelected}
      />

      {showKeyModal && (
        <Modal
          title="Google Gemini AI Key"
          description="Visual stock scanning uses Google Gemini Vision (100% free with 1,500 scans/day)."
          onClose={() => setShowKeyModal(false)}
        >
          <div className="ai-key-modal">
            <Field label="Gemini API Key" hint="Stored in this browser. Never shared or sold.">
              <input
                className="input"
                type="password"
                placeholder="AIzaSy..."
                value={keyInput}
                onChange={(event) => setKeyInput(event.target.value)}
              />
            </Field>
            <p className="field-hint" style={{ marginTop: 8 }}>
              Get your free key in 10 seconds: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Google AI Studio (free) <ArrowUpRight size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /></a>
            </p>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" type="button" onClick={() => setShowKeyModal(false)}>Cancel</button>
              <button className="btn btn-primary" type="button" disabled={!keyInput.trim()} onClick={saveApiKey}>
                <Check size={16} /> Save Key
              </button>
            </div>
          </div>
        </Modal>
      )}

      {reviewMessage !== null && (
        <Modal
          wide
          title="Ready for your supplier"
          description="Check your order message below. Tap Send to WhatsApp to open WhatsApp on your phone and choose who to send to."
          onClose={() => setReviewMessage(null)}
        >
          <div className="review-meta">
            <span className="badge badge-accent">{selectedItems.length} line items</span>
            <span>Choose recipient in WhatsApp</span>
          </div>
          <pre className="review-message" tabIndex={0} aria-label="Exact supplier order message">{reviewMessage}</pre>
          <div className="review-actions">
            <button className="btn btn-secondary" type="button" onClick={copyOrder}>
              {copied ? <Check size={16} /> : <Clipboard size={16} />}
              {copied ? 'Copied' : 'Copy message'}
            </button>
            {hasSupplierPhone && (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => sendToWhatsApp(supplierPhoneDigits)}
                title={`Send directly to ${supplierPhone}`}
              >
                Send to {supplierPhone}
              </button>
            )}
            <button
              className="btn order-whatsapp-button"
              type="button"
              onClick={() => sendToWhatsApp(null)}
            >
              <MessageCircle size={17} />
              Send to WhatsApp
              <ArrowUpRight size={15} />
            </button>
          </div>
          <p className="handoff-hint">Your draft stays saved. WhatsApp opens directly on your phone so you can choose who to send to.</p>
          <button
            type="button"
            className="review-web-link"
            onClick={() => openWhatsAppWeb(null)}
          >
            Need WhatsApp Web in browser? Open here
          </button>
        </Modal>
      )}
    </div>
  );
}
