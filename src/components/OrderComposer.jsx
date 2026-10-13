import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowUpRight, Check, CheckCircle2, Clipboard, CloudOff,
  CircleAlert, ChevronDown, LoaderCircle, MessageCircle, Minus, Package, Plus,
  Search, Send, ShoppingBag, Trash2, Truck,
} from 'lucide-react';
import {
  formatOrderMessage, getVendorAssignedMessageIds, ITEM_UNITS, normalizeItemUnit,
  normalizeItemUnits, normalizeSupplies, updateSupplier,
} from '../data.js';
import { EmptyState, Field, Modal } from './ui.jsx';

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
  const [itemError, setItemError] = useState('');
  const [deleteItem, setDeleteItem] = useState(null);
  const [showClear, setShowClear] = useState(false);
  const [reviewMessage, setReviewMessage] = useState(null);
  const [copied, setCopied] = useState(false);

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
    changeSupplies((current) => [...current, {
      id: `item-${crypto.randomUUID()}`, name, quantity: 0, unit: normalizeItemUnit(newUnit),
    }]);
    setNewName('');
    setNewUnit('PIECES');
    setItemError('');
    setShowAdd(false);
    setFilter('all');
    setQuery('');
    showToast?.('Item added to the catalog.');
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

  const openWhatsApp = () => {
    if (isDemo || !reviewMessage) return;
    const phone = String(supplier.phone || '').replace(/\D/g, '');
    const target = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(reviewMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(reviewMessage)}`;
    window.open(target, '_blank', 'noopener,noreferrer');
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
          <div className="catalog-list">
            {visibleItems.map((item) => (
              <div className={`catalog-row ${item.quantity > 0 ? 'is-selected' : ''}`} key={item.id}>
                <div className="item-card-heading">
                  <h2 className="item-name">{item.name}</h2>
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
          <p className="handoff-hint order-detail-hint"><MessageCircle size={13} /> {isDemo ? 'Preview mode · compose and copy an order' : 'Review first. Send through WhatsApp.'}</p>
        </details>
      </div>

      {selectedItems.length > 0 && <div className="order-send-bar">
        <button className="btn order-send-button" onClick={reviewOrder}><Send size={21} /><span>Review &amp; send</span><span className="order-send-count">{selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'}</span></button>
      </div>}

      {showAdd && <Modal title="Add catalog item" description="Create an item you can include in future supplier orders." onClose={() => setShowAdd(false)}>
        <form onSubmit={addItem} className="modal-form">
          <Field label="Item name"><input autoFocus className="input" aria-label="Item name" placeholder="e.g. Fresh tomatoes" maxLength={120} required value={newName} onChange={(event) => { setNewName(event.target.value); setItemError(''); }} /></Field>
          <Field label="Order unit"><select className="input" aria-label="Order unit" value={newUnit} onChange={(event) => setNewUnit(event.target.value)}>{availableUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></Field>
          {itemError && <p className="form-error" role="alert">{itemError}</p>}
          <div className="modal-actions"><button className="btn btn-secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary" type="submit"><Plus size={16} /> Add item</button></div>
        </form>
      </Modal>}

      {deleteItem && <Modal title="Remove catalog item?" description={`“${deleteItem.name}” will be removed from this supplier’s catalog and current draft.`} onClose={() => setDeleteItem(null)}><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setDeleteItem(null)}>Keep item</button><button className="btn btn-primary" onClick={() => { changeSupplies((current) => current.filter((item) => item.id !== deleteItem.id)); setDeleteItem(null); }}>Remove item</button></div></Modal>}
      {showClear && <Modal title="Clear this draft?" description="All quantities will return to zero. Your catalog and order note will stay available." onClose={() => setShowClear(false)}><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowClear(false)}>Keep draft</button><button className="btn btn-primary" onClick={() => { changeSupplies((current) => current.map((item) => ({ ...item, quantity: 0 }))); setQuantityDrafts({}); setShowClear(false); }}>Clear quantities</button></div></Modal>}

      {reviewMessage !== null && <Modal wide title="Ready for your supplier" description="Check the exact message below. WhatsApp opens with it prefilled, and you send it there." onClose={() => setReviewMessage(null)}>
        <div className="review-meta"><span className="badge badge-accent">{selectedItems.length} line items</span><span>{supplier.phone ? `To ${supplier.phone}` : 'Choose the recipient in WhatsApp'}</span></div>
        <pre className="review-message" tabIndex={0} aria-label="Exact supplier order message">{reviewMessage}</pre>
        {isDemo && <p className="form-hint">This is a preview workspace. You can copy the message; WhatsApp handoff is available in your store.</p>}
        <div className="review-actions"><button className="btn btn-secondary" onClick={copyOrder}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? 'Copied' : 'Copy message'}</button><button className="btn order-whatsapp-button" disabled={isDemo} onClick={openWhatsApp}><MessageCircle size={17} /> Open WhatsApp <ArrowUpRight size={15} /></button></div>
        <p className="handoff-hint">Your draft stays available after opening WhatsApp.</p>
      </Modal>}
    </div>
  );
}
