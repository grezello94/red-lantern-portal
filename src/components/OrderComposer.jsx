import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowUpRight, Camera, Check, CheckCircle2, Clipboard, CloudOff,
  CircleAlert, ChevronDown, LoaderCircle, MessageCircle, Minus, Package, Plus,
  Search, Send, ShoppingBag, Sparkles, Trash2, Truck,
} from 'lucide-react';
import {
  formatOrderMessage, getVendorAssignedMessageIds, ITEM_UNITS, normalizeItemUnit,
  normalizeItemUnits, normalizeSupplies, updateSupplier,
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
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [tempPhotoUrl, setTempPhotoUrl] = useState('');
  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState(() => getStoredGeminiKey());
  const [savingReference, setSavingReference] = useState(false);
  const [referencePhoto, setReferencePhoto] = useState(supplier.referencePhoto || null);

  const fileInputRef = useRef(null);
  const refInputRef = useRef(null);

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
    setAiSuggestions([]);

    try {
      const compressed = await compressImageToBase64(file, 960, 0.72);
      setTempPhotoUrl(compressed.dataUrl);

      const suggestions = await analyzeShelfPhoto({
        apiKey,
        supplier: { ...supplier, supplies: suppliesRef.current },
        currentPhotoBase64: compressed.base64,
        referencePhotoBase64: referencePhoto,
      });

      const mapped = suggestions.map((sug) => {
        const item = suppliesRef.current.find((it) => it.id === sug.id || it.name.toLowerCase() === String(sug.name).toLowerCase());
        return {
          id: item?.id || sug.id,
          name: item?.name || sug.name,
          unit: item?.unit || sug.unit || 'PIECES',
          level: sug.level || 'Low',
          suggestedQuantity: Number.isFinite(Number(sug.suggestedQuantity)) ? Math.max(0, Number(sug.suggestedQuantity)) : 0,
          reason: sug.reason || '',
        };
      });

      setAiSuggestions(mapped);
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

  const applyAISuggestions = () => {
    aiSuggestions.forEach((sug) => {
      if (sug.suggestedQuantity > 0) {
        changeQuantity(sug.id, sug.suggestedQuantity);
      }
    });
    setTempPhotoUrl('');
    setAiSuggestions([]);
    setShowAIScan(false);
    showToast?.('AI order suggestions applied to draft.');
  };

  const handleReferencePhotoSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSavingReference(true);
    try {
      const compressed = await compressImageToBase64(file, 960, 0.72);
      await updateSupplier(storeId, supplier.id, { referencePhoto: compressed.dataUrl });
      supplier.referencePhoto = compressed.dataUrl;
      setReferencePhoto(compressed.dataUrl);
      showToast?.('Benchmark reference photo saved.');
    } catch {
      showToast?.('Failed to save reference photo.');
    } finally {
      setSavingReference(false);
    }
  };

  const removeReferencePhoto = async () => {
    setSavingReference(true);
    try {
      await updateSupplier(storeId, supplier.id, { referencePhoto: null });
      delete supplier.referencePhoto;
      setReferencePhoto(null);
      showToast?.('Reference photo removed.');
    } catch {
      showToast?.('Failed to remove reference photo.');
    } finally {
      setSavingReference(false);
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
            <button className="btn btn-ai-scan" type="button" onClick={() => fileInputRef.current?.click()} title="Snap today's stock to suggest quantities">
              <Camera size={17} />
              <span>Scan crates with AI</span>
            </button>
            <button
              className={`btn btn-reference-photo ${referencePhoto ? 'has-photo' : ''}`}
              type="button"
              onClick={() => setShowReferenceModal(true)}
              title="View or update benchmark photo for this supplier"
            >
              <Sparkles size={15} />
              <span>{referencePhoto ? 'Reference set' : 'Set reference'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleScanPhotoSelected}
            />
            <input
              ref={refInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleReferencePhotoSelected}
            />
          </div>

          <div className="catalog-list">
            {visibleItems.map((item) => (
              <div className={`catalog-row ${item.quantity > 0 ? 'is-selected' : ''}`} key={item.id}>
                <div className="item-card-heading">
                  <div className="item-name-group">
                    <h2 className="item-name">{item.name}</h2>
                    {Number(item.targetQuantity) > 0 && <span className="item-target-badge" title="Standard target capacity">Target: {item.targetQuantity} {item.unit}</span>}
                  </div>
                  {isAdmin && <button className="icon-button item-delete" aria-label={`Delete ${item.name}`} onClick={() => setDeleteItem(item)}><Trash2 size={18} /></button>}
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
            ))}
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
                <LoaderCircle size={32} className="spin" />
                <strong>Analyzing crates with Gemini AI…</strong>
                <p>Estimating levels and calculating order suggestions.</p>
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

            {!aiAnalyzing && !aiError && aiSuggestions.length > 0 && (
              <>
                <div className="ai-scan-status">
                  <span>Found {aiSuggestions.filter((s) => s.suggestedQuantity > 0).length} items needing restock</span>
                  <span className="ai-scan-privacy">0 MB stored · photo discarded</span>
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

                <div className="modal-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => { setShowAIScan(false); setTempPhotoUrl(''); }}>Cancel</button>
                  <button className="btn btn-primary" type="button" onClick={applyAISuggestions}>
                    <Check size={16} /> Apply to Order
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {showReferenceModal && (
        <Modal
          title="Benchmark Reference Photo"
          description="Shows how this supplier's crates/shelves look when fully stocked. AI uses this as the benchmark."
          onClose={() => setShowReferenceModal(false)}
        >
          <div className="reference-modal-content">
            {referencePhoto ? (
              <div className="reference-photo-view">
                <img src={referencePhoto} alt="Supplier benchmark" className="reference-preview-image" />
                <p className="reference-photo-hint">This benchmark photo is kept in storage so the AI knows what a full shelf looks like for {supplier.name}.</p>
                <div className="modal-actions">
                  <button className="btn btn-secondary" type="button" disabled={savingReference} onClick={() => refInputRef.current?.click()}>
                    <Camera size={16} /> {savingReference ? 'Saving…' : 'Update photo'}
                  </button>
                  <button className="btn btn-danger" type="button" disabled={savingReference} onClick={removeReferencePhoto}>
                    <Trash2 size={16} /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Camera}
                title="No reference photo set"
                description={`Take a picture of ${supplier.name}'s crates or shelf when fully stocked. AI will use it as the benchmark to calculate how much to reorder.`}
                action={
                  <button className="btn btn-primary" type="button" disabled={savingReference} onClick={() => refInputRef.current?.click()}>
                    <Camera size={16} /> {savingReference ? 'Compressing & saving…' : 'Snap reference photo'}
                  </button>
                }
              />
            )}
          </div>
        </Modal>
      )}

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
