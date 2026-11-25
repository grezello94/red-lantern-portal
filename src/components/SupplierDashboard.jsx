import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
  Layers3,
  LoaderCircle,
  MessageCircle,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  Share2,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  createSupplier,
  deleteSupplier,
  formatOrderMessage,
  getAllStoreItemReferences,
  getVendorAssignedMessageIds,
  updateSupplier,
} from '../data';
import {
  analyzeWholeRackPhoto,
  compressImageToBase64,
  getStoredGeminiKey,
  saveStoredGeminiKey,
} from '../ai';
import { EmptyState, Field, Modal } from './ui';

const getSupplies = (supplier) => (Array.isArray(supplier?.supplies) ? supplier.supplies : []);
const getDraftCount = (supplier) => getSupplies(supplier).filter((item) => Number(item.quantity) > 0).length;
const getInitials = (name) => name?.trim().charAt(0).toUpperCase() || 'S';

export default function SupplierDashboard({
  storeId,
  isAdmin,
  suppliers = [],
  loading,
  error,
  onSelect,
  onRetry,
  orderMessages = [],
  showToast,
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [copied, setCopied] = useState(false);

  // Master Whole-Rack AI Scanner State
  const [showRackScanModal, setShowRackScanModal] = useState(false);
  const [rackAnalyzing, setRackAnalyzing] = useState(false);
  const [rackPhotoUrl, setRackPhotoUrl] = useState('');
  const [rackError, setRackError] = useState('');
  const [rackClarityIssue, setRackClarityIssue] = useState('');
  const [rackResults, setRackResults] = useState([]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState(() => getStoredGeminiKey());

  const rackFileInputRef = useRef(null);

  const filteredSuppliers = useMemo(() => suppliers.filter((supplier) => {
    const matchesSearch = String(supplier.name || '').toLowerCase().includes(search.toLowerCase().trim());
    return matchesSearch && (filter === 'all' || getDraftCount(supplier) > 0);
  }), [filter, search, suppliers]);

  const openEditor = (supplier = {}) => {
    setName(supplier.name || '');
    setPhone(supplier.phone || '');
    setFormError('');
    setEditing(supplier);
  };

  const closeEditor = () => {
    if (!pending) setEditing(null);
  };

  const saveSupplier = async (event) => {
    event.preventDefault();
    if (pending) return;
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const digits = trimmedPhone.replace(/\D/g, '');
    if (!trimmedName) {
      setFormError('Enter a supplier name.');
      return;
    }
    if (trimmedPhone && (/[^\d\s+().-]/.test(trimmedPhone) || digits.length < 7 || digits.length > 15)) {
      setFormError('Enter a WhatsApp number with 7–15 digits, including the country code.');
      return;
    }
    setFormError('');
    setPending(true);
    try {
      const data = { name: trimmedName, phone: digits };
      if (editing.id) {
        await updateSupplier(storeId, editing.id, data);
      } else {
        const defaultMessageId = orderMessages.some((message) => message.id === 'delivery-window-default')
          ? 'delivery-window-default'
          : orderMessages[0]?.id;
        await createSupplier(storeId, { ...data, supplies: [], assignedMessageIds: defaultMessageId ? [defaultMessageId] : [] });
      }
      showToast(editing.id ? 'Supplier updated.' : 'Supplier added. Add items to build your first order.');
      setEditing(null);
    } catch {
      setFormError('Could not save this supplier. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  const removeSupplier = async () => {
    if (!deleteTarget || pending) return;
    setPending(true);
    setFormError('');
    try {
      await deleteSupplier(storeId, deleteTarget.id);
      showToast('Supplier deleted.');
      setDeleteTarget(null);
    } catch {
      setFormError('Could not delete this supplier. Please try again.');
    } finally {
      setPending(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(storeId);
      setCopied(true);
      showToast('Workspace code copied.');
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      showToast('Could not copy the code. You can select and copy it below.');
    }
  };

  // Master Whole-Rack AI Scanner Triggers & Handlers
  const triggerRackScan = () => {
    const key = getStoredGeminiKey();
    if (!key) {
      setShowKeyModal(true);
      return;
    }
    if (suppliers.length === 0) {
      showToast('Add at least one supplier catalog before scanning the rack.');
      return;
    }
    rackFileInputRef.current?.click();
  };

  const handleRackPhotoSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file.');
      return;
    }

    if (rackPhotoUrl) {
      URL.revokeObjectURL(rackPhotoUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setRackPhotoUrl(objectUrl);
    setShowRackScanModal(true);
    setRackAnalyzing(true);
    setRackError('');
    setRackClarityIssue('');
    setRackResults([]);

    try {
      const [itemReferences, compressedBase64] = await Promise.all([
        getAllStoreItemReferences(storeId, suppliers.map((s) => s.id)),
        compressImageToBase64(file, 1280, 0.74),
      ]);
      const activeKey = getStoredGeminiKey();
      const analysis = await analyzeWholeRackPhoto({
        apiKey: activeKey,
        suppliers,
        currentPhotoBase64: compressedBase64,
        itemReferences,
      });

      if (analysis.isUnclear) {
        setRackClarityIssue(analysis.clarityIssue || 'Photo is too blurry or dark. Please retake.');
      }

      // Sanitize and partition suppliers with reorder needs and undetected items
      const analyzedSuppliers = (analysis.suppliers || []).map((supResult) => {
        const matchingSupplier = suppliers.find((s) => s.id === supResult.supplierId)
          || suppliers.find((s) => s.name?.toLowerCase() === supResult.supplierName?.toLowerCase());

        const items = (supResult.items || []).map((it) => ({
          id: it.id,
          name: it.name,
          level: it.level || 'Low',
          suggestedQuantity: Math.max(0, Number(it.suggestedQuantity) || 0),
          unit: it.unit || 'PIECES',
          reason: it.reason || '',
        }));

        const detectedIds = new Set(items.map((it) => it.id));
        const undetected = (matchingSupplier?.supplies || [])
          .filter((catItem) => !detectedIds.has(catItem.id))
          .map((catItem) => ({
            id: catItem.id,
            name: catItem.name,
            unit: catItem.unit || 'PIECES',
            targetQuantity: catItem.targetQuantity || null,
            orderQuantity: 0,
          }));

        return {
          supplierId: matchingSupplier ? matchingSupplier.id : supResult.supplierId,
          supplierName: matchingSupplier ? matchingSupplier.name : supResult.supplierName,
          phone: matchingSupplier ? matchingSupplier.phone : '',
          rawSupplier: matchingSupplier,
          items,
          undetected,
        };
      }).filter((s) => s.items.some((it) => it.suggestedQuantity > 0) || s.undetected.length > 0);

      setRackResults(analyzedSuppliers);
    } catch (err) {
      setRackError(err.message || 'Failed to analyze rack photo. Please try again.');
    } finally {
      setRackAnalyzing(false);
    }
  };

  const adjustMasterUndetectedQty = (supplierId, itemId, delta) => {
    setRackResults((prev) => prev.map((sup) => {
      if (sup.supplierId !== supplierId) return sup;
      const updated = (sup.undetected || []).map((item) => {
        if (item.id !== itemId) return item;
        return { ...item, orderQuantity: Math.max(0, (item.orderQuantity || 0) + delta) };
      });
      return { ...sup, undetected: updated };
    }));
  };

  const addMasterUndetectedToOrder = (supplierId, itemId) => {
    setRackResults((prev) => prev.map((sup) => {
      if (sup.supplierId !== supplierId) return sup;
      const updated = (sup.undetected || []).map((item) => {
        if (item.id !== itemId) return item;
        const defaultQty = Number(item.targetQuantity) > 0 ? Number(item.targetQuantity) : 1;
        return { ...item, orderQuantity: defaultQty };
      });
      return { ...sup, undetected: updated };
    }));
  };

  const adjustMasterItemQty = (supplierId, itemId, delta) => {
    setRackResults((prev) => prev.map((sup) => {
      if (sup.supplierId !== supplierId) return sup;
      const updatedItems = sup.items.map((item) => {
        if (item.id !== itemId) return item;
        const newQty = Math.max(0, (Number(item.suggestedQuantity) || 0) + delta);
        return { ...item, suggestedQuantity: newQty };
      });
      return { ...sup, items: updatedItems };
    }));
  };

  const removeMasterItem = (supplierId, itemId) => {
    setRackResults((prev) => prev.map((sup) => {
      if (sup.supplierId !== supplierId) return sup;
      return {
        ...sup,
        items: sup.items.filter((item) => item.id !== itemId),
      };
    }).filter((sup) => sup.items.length > 0));
  };

  const sendSupplierOrderWhatsApp = async (supplierGroup) => {
    const rawSupplier = supplierGroup.rawSupplier || suppliers.find((s) => s.id === supplierGroup.supplierId);
    if (!rawSupplier) {
      showToast('Supplier not found.');
      return;
    }

    const detectedToOrder = (supplierGroup.items || []).filter((it) => it.suggestedQuantity > 0).map((it) => ({
      id: it.id,
      name: it.name,
      quantity: it.suggestedQuantity,
      unit: it.unit,
    }));

    const undetectedToOrder = (supplierGroup.undetected || []).filter((it) => it.orderQuantity > 0).map((it) => ({
      id: it.id,
      name: it.name,
      quantity: it.orderQuantity,
      unit: it.unit,
    }));

    const itemsToOrder = [...detectedToOrder, ...undetectedToOrder];

    if (itemsToOrder.length === 0) {
      showToast(`No items to reorder for ${rawSupplier.name}.`);
      return;
    }

    const assignedIds = getVendorAssignedMessageIds(rawSupplier, orderMessages);
    const instructions = orderMessages.filter((m) => assignedIds.includes(m.id));

    const orderText = formatOrderMessage({
      supplier: rawSupplier,
      items: itemsToOrder,
      messages: instructions,
      date: new Date(),
    });

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(orderText);
      }
    } catch {
      // ignore
    }

    const cleanPhone = rawSupplier.phone ? String(rawSupplier.phone).replace(/\D/g, '') : '';
    const encoded = encodeURIComponent(orderText);
    const appUrl = cleanPhone
      ? `whatsapp://send?phone=${cleanPhone}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;

    showToast(`Order copied. Opening WhatsApp for ${rawSupplier.name}…`);
    window.location.href = appUrl;
  };

  const applyAllToDrafts = async () => {
    if (pending) return;
    setPending(true);
    try {
      let updatedCount = 0;
      for (const supGroup of rackResults) {
        const rawSupplier = supGroup.rawSupplier || suppliers.find((s) => s.id === supGroup.supplierId);
        if (!rawSupplier) continue;

        const currentSupplies = Array.isArray(rawSupplier.supplies) ? [...rawSupplier.supplies] : [];
        let modified = false;

        (supGroup.items || []).forEach((scannedItem) => {
          if (scannedItem.suggestedQuantity > 0) {
            const idx = currentSupplies.findIndex((s) => s.id === scannedItem.id || s.name?.toLowerCase() === scannedItem.name?.toLowerCase());
            if (idx >= 0) {
              currentSupplies[idx] = {
                ...currentSupplies[idx],
                quantity: scannedItem.suggestedQuantity,
              };
              modified = true;
            }
          }
        });

        (supGroup.undetected || []).forEach((undItem) => {
          if (undItem.orderQuantity > 0) {
            const idx = currentSupplies.findIndex((s) => s.id === undItem.id || s.name?.toLowerCase() === undItem.name?.toLowerCase());
            if (idx >= 0) {
              currentSupplies[idx] = {
                ...currentSupplies[idx],
                quantity: undItem.orderQuantity,
              };
              modified = true;
            }
          }
        });

        if (modified) {
          await updateSupplier(storeId, rawSupplier.id, { supplies: currentSupplies });
          updatedCount++;
        }
      }

      showToast(`Saved replenishment quantities to ${updatedCount} supplier ${updatedCount === 1 ? 'draft' : 'drafts'}.`);
      setShowRackScanModal(false);
    } catch {
      showToast('Could not save to drafts. Please try again.');
    } finally {
      setPending(false);
    }
  };

  const handleSaveKey = (e) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    saveStoredGeminiKey(trimmed);
    setShowKeyModal(false);
    showToast(trimmed ? 'Gemini API Key saved.' : 'Gemini API Key cleared.');
    if (trimmed) {
      setTimeout(() => {
        rackFileInputRef.current?.click();
      }, 250);
    }
  };

  return (
    <div className="dashboard">
      {isAdmin && (
        <button className="invite-card" onClick={copyCode} aria-label="Invite Staff: copy store code" title="Copy store code to invite staff">
          <span className="invite-icon"><Share2 size={22} /></span>
          <span className="invite-copy">
            <strong>Invite Staff</strong>
            <span className="invite-code">Code: <code>{storeId}</code></span>
          </span>
          <span className="invite-copy-button" aria-hidden="true">{copied ? <Check size={20} /> : <ChevronRight size={20} />}</span>
        </button>
      )}

      {/* MASTER WHOLE-RACK AI SCANNER BANNER */}
      <div className="master-rack-ai-banner">
        <div className="master-rack-left">
          <div className="master-rack-icon-bubble">
            <Camera size={20} />
          </div>
          <div className="master-rack-copy">
            <div className="master-rack-title-row">
              <strong>Master Whole-Rack AI Scanner</strong>
              <span className="badge badge-accent badge-master-tag"><Sparkles size={11} /> FREE GEMINI AI</span>
            </div>
            <p className="master-rack-subtitle">
              Snap 1 photo of the entire storage rack · AI cross-references all suppliers &amp; prepares WhatsApp orders
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary master-rack-scan-btn"
          onClick={triggerRackScan}
          disabled={rackAnalyzing}
        >
          {rackAnalyzing ? <LoaderCircle size={17} className="spin" /> : <Camera size={17} />}
          <span>{rackAnalyzing ? 'Analyzing…' : 'Scan Whole Rack'}</span>
        </button>
        <input
          ref={rackFileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleRackPhotoSelected}
        />
      </div>

      <section className="supplier-directory" aria-labelledby="supplier-directory-title">
        <div className="section-heading">
          <h1 id="supplier-directory-title" className="section-title">Your Suppliers <span className="section-count">{loading || error ? '—' : suppliers.length}</span></h1>
        </div>

        <div className="directory-toolbar">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search suppliers" placeholder="Search suppliers..." type="search" />
            {search && <button type="button" className="icon-button" aria-label="Clear supplier search" onClick={() => setSearch('')}><X size={15} /></button>}
          </label>
          <div className="segmented-control" aria-label="Filter suppliers">
            <button className={`segment ${filter === 'all' ? 'active' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
            <button className={`segment ${filter === 'drafts' ? 'active' : ''}`} aria-pressed={filter === 'drafts'} onClick={() => setFilter('drafts')}>With draft</button>
          </div>
        </div>

        {error ? (
          <EmptyState icon={Layers3} title="Your suppliers could not load" description={error} action={<button className="btn btn-secondary" onClick={onRetry}>Try again</button>} />
        ) : loading ? (
          <div className="supplier-list" aria-busy="true" aria-label="Loading suppliers">
            {[0, 1, 2].map((index) => <div className="supplier-card supplier-skeleton" key={index}><div className="skeleton skeleton-avatar" /><div className="supplier-row-copy"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /></div></div>)}
          </div>
        ) : suppliers.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Your supply network starts here" description={isAdmin ? 'Add your first supplier, set up their catalog, and prepare an order in minutes.' : 'Ask your workspace administrator to add suppliers so you can start placing orders.'} action={isAdmin ? <button className="btn btn-primary" onClick={() => openEditor()}><Plus size={16} /> Add your first supplier</button> : null} />
        ) : filteredSuppliers.length === 0 ? (
          <EmptyState icon={Search} title={search ? 'No matching suppliers' : 'A fresh start for your next order'} description={search ? `No suppliers match “${search}”. Try another name.` : 'Select a supplier and add quantities. Your order drafts will appear here.'} action={<button className="btn btn-secondary" onClick={() => { setSearch(''); setFilter('all'); }}>View all suppliers</button>} />
        ) : (
          <div className="supplier-list">
            {filteredSuppliers.map((supplier) => {
              const draftCount = getDraftCount(supplier);
              return (
                <article className="supplier-card" key={supplier.id}>
                  <button className="supplier-open" onClick={() => onSelect(supplier)} aria-label={`${draftCount ? 'Continue' : 'Create'} order for ${supplier.name}`}>
                    <span className="supplier-avatar" aria-hidden="true">{getInitials(supplier.name || 'Supplier')}</span>
                    <span className="supplier-row-copy">
                      <span className="supplier-row-name">{supplier.name}</span>
                      <span className="supplier-meta"><Package size={14} /> {getSupplies(supplier).length} catalog {getSupplies(supplier).length === 1 ? 'item' : 'items'}</span>
                      {draftCount > 0 && <span className="supplier-draft badge badge-accent">{draftCount} {draftCount === 1 ? 'item' : 'items'} in draft</span>}
                    </span>
                  </button>
                  {isAdmin && (
                    <div className="supplier-row-actions">
                      <button className="icon-button" aria-label={`Edit ${supplier.name}`} onClick={() => openEditor(supplier)} title="Edit supplier"><Pencil size={17} /></button>
                      <button className="icon-button danger-hover" aria-label={`Delete ${supplier.name}`} onClick={() => { setDeleteTarget(supplier); setFormError(''); }} title="Delete supplier"><Trash2 size={18} /></button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isAdmin && <button className="add-supplier-fab" onClick={() => openEditor()} aria-label="Add supplier" title="Add supplier"><Plus size={30} strokeWidth={2.5} /></button>}

      {/* MASTER WHOLE-RACK AI REVIEW MODAL */}
      {showRackScanModal && (
        <Modal
          title="Master Whole-Rack AI Analysis"
          description="Cross-referenced all shelves &amp; cubbies against registered supplier catalogs."
          onClose={() => {
            if (!rackAnalyzing) {
              setShowRackScanModal(false);
              if (rackPhotoUrl) URL.revokeObjectURL(rackPhotoUrl);
            }
          }}
        >
          <div className="master-scan-modal-body">
            {/* Rack Photo Preview */}
            {rackPhotoUrl && (
              <div className="master-scan-preview">
                <img src={rackPhotoUrl} alt="Snapped whole rack" className="master-preview-thumb" />
                <div className="master-preview-overlay">
                  <span className="master-privacy-tag">🔒 Memory-only scan · 0 MB saved in DB</span>
                </div>
              </div>
            )}

            {/* Analyzing State */}
            {rackAnalyzing && (
              <div className="ai-scanning-state">
                <LoaderCircle size={32} className="spin accent-icon" />
                <div className="ai-scanning-copy">
                  <strong>Analyzing Full Kitchen Rack…</strong>
                  <p>Inspecting multi-tier shelves, overlapping masala packets, and bottle rows across all suppliers.</p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {rackError && !rackAnalyzing && (
              <div className="form-error-box">
                <strong>Analysis Error</strong>
                <p>{rackError}</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => rackFileInputRef.current?.click()}
                >
                  <Camera size={16} /> Try another photo
                </button>
              </div>
            )}

            {/* Clarity Warning */}
            {rackClarityIssue && !rackAnalyzing && (
              <div className="ai-clarity-warning">
                <AlertTriangle size={18} className="warning-icon" />
                <div className="ai-clarity-copy">
                  <strong>Photo Clarity Alert</strong>
                  <p>{rackClarityIssue}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => rackFileInputRef.current?.click()}
                >
                  <Camera size={14} /> Retake Photo
                </button>
              </div>
            )}

            {/* Results Found */}
            {!rackAnalyzing && !rackError && rackResults.length > 0 && (
              <div className="master-results-container">
                <div className="master-results-summary">
                  <span className="master-found-badge">
                    <Sparkles size={14} /> Depleted items found across {rackResults.length} {rackResults.length === 1 ? 'supplier' : 'suppliers'}
                  </span>
                  <span className="master-sub-hint">Send each order directly to WhatsApp with 1 tap</span>
                </div>

                <div className="master-supplier-groups">
                  {rackResults.map((supGroup) => {
                    const activeCount = supGroup.items.filter((it) => it.suggestedQuantity > 0).length;
                    return (
                      <div className="master-supplier-card" key={supGroup.supplierId}>
                        <div className="master-supplier-header">
                          <div className="master-supplier-name-col">
                            <span className="master-supplier-avatar">
                              {getInitials(supGroup.supplierName)}
                            </span>
                            <div>
                              <strong className="master-supplier-name">{supGroup.supplierName}</strong>
                              <span className="master-supplier-item-count">
                                {activeCount} {activeCount === 1 ? 'item' : 'items'} to reorder
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="btn master-supplier-send-btn"
                            onClick={() => sendSupplierOrderWhatsApp(supGroup)}
                            title={`Send ${supGroup.supplierName} order via WhatsApp`}
                          >
                            <MessageCircle size={15} />
                            <span>Send WhatsApp</span>
                            <ArrowUpRight size={14} />
                          </button>
                        </div>

                        {/* List of items for this supplier */}
                        <div className="master-item-list">
                          {supGroup.items.map((item) => (
                            <div className="master-item-row" key={item.id}>
                              <div className="master-item-info">
                                <span className="master-item-name">{item.name}</span>
                                <div className="master-item-tags">
                                  <span className={`badge ${item.level?.toLowerCase().includes('empty') ? 'badge-danger' : 'badge-accent'}`}>
                                    {item.level}
                                  </span>
                                  {item.reason && <span className="master-item-reason">{item.reason}</span>}
                                </div>
                              </div>

                              <div className="master-stepper">
                                <button
                                  type="button"
                                  className="master-stepper-btn"
                                  onClick={() => adjustMasterItemQty(supGroup.supplierId, item.id, -1)}
                                  disabled={item.suggestedQuantity <= 0}
                                  aria-label="Decrease quantity"
                                >
                                  <Minus size={13} />
                                </button>
                                <span className="master-stepper-val">
                                  <strong>{item.suggestedQuantity}</strong>
                                  <small>{item.unit}</small>
                                </span>
                                <button
                                  type="button"
                                  className="master-stepper-btn"
                                  onClick={() => adjustMasterItemQty(supGroup.supplierId, item.id, 1)}
                                  aria-label="Increase quantity"
                                >
                                  <Plus size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="master-item-del-btn"
                                  onClick={() => removeMasterItem(supGroup.supplierId, item.id)}
                                  title="Remove item"
                                  aria-label="Remove item"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* USER-REQUESTED QUESTION: UNDETECTED CATALOG ITEMS */}
                        {supGroup.undetected && supGroup.undetected.length > 0 && (
                          <div className="master-undetected-box">
                            <div className="master-undetected-header">
                              <AlertTriangle size={15} className="ai-undetected-icon" />
                              <span>{supGroup.undetected.length} items from {supGroup.supplierName} not detected on rack. Add to order?</span>
                            </div>
                            <div className="master-undetected-list">
                              {supGroup.undetected.map((undItem) => (
                                <div className={`master-undetected-row ${undItem.orderQuantity > 0 ? 'is-included' : ''}`} key={undItem.id}>
                                  <div className="master-undetected-info">
                                    <span className="master-undetected-name">{undItem.name}</span>
                                    <span className="badge badge-undetected">Not seen</span>
                                  </div>
                                  {undItem.orderQuantity > 0 ? (
                                    <div className="ai-stepper">
                                      <button type="button" onClick={() => adjustMasterUndetectedQty(supGroup.supplierId, undItem.id, -1)} aria-label="Decrease">
                                        <Minus size={13} />
                                      </button>
                                      <span className="master-stepper-val-text">{undItem.orderQuantity} {undItem.unit}</span>
                                      <button type="button" onClick={() => adjustMasterUndetectedQty(supGroup.supplierId, undItem.id, 1)} aria-label="Increase">
                                        <Plus size={13} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm master-add-undetected-btn"
                                      onClick={() => addMasterUndetectedToOrder(supGroup.supplierId, undItem.id)}
                                    >
                                      <Plus size={12} /> Add to Order
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="master-footer-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => rackFileInputRef.current?.click()}
                  >
                    <Camera size={16} /> Retake Photo
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={applyAllToDrafts}
                    disabled={pending}
                  >
                    {pending ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
                    <span>Save All to Drafts</span>
                  </button>
                </div>
              </div>
            )}

            {/* All Stocked */}
            {!rackAnalyzing && !rackError && rackResults.length === 0 && (
              <div className="master-all-stocked">
                <div className="master-stocked-icon">
                  <Check size={28} />
                </div>
                <h3>All Shelves Fully Stocked!</h3>
                <p>AI did not detect any depleted items or low stock on the visible rack shelves.</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => rackFileInputRef.current?.click()}
                >
                  <Camera size={16} /> Scan another angle
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* GEMINI KEY MODAL */}
      {showKeyModal && (
        <Modal
          title="Google Gemini AI Key"
          description="Visual rack scanning uses Google Gemini Vision (100% free with 1,500 scans/day)."
          onClose={() => setShowKeyModal(false)}
        >
          <div className="ai-key-modal">
            <Field label="Gemini API Key" hint="Stored securely in this browser. Never shared or sold.">
              <input
                className="input"
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                autoFocus
              />
            </Field>
            <p className="hint" style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: '1.5' }}>
              Get a free key in 30 seconds at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Google AI Studio</a>. No credit card required.
            </p>
            <div className="modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-secondary" type="button" onClick={() => setShowKeyModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={handleSaveKey}>
                Save Key &amp; Scan
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit supplier' : 'Add a supplier'} description="Build your supply network. You can add catalog items after saving." onClose={closeEditor}>
          <form className="form-stack" onSubmit={saveSupplier}>
            <Field label="Supplier name"><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Fresh Market Produce" autoFocus required maxLength={120} disabled={pending} /></Field>
            <Field label="WhatsApp number (optional)" hint="Include the country code, e.g. +91 98765 43210. Used when sharing an order."><input className="input" type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" disabled={pending} maxLength={25} /></Field>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={closeEditor} disabled={pending}>Cancel</button><button className="btn btn-primary" type="submit" disabled={pending || !name.trim()}>{pending ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}{pending ? 'Saving...' : editing.id ? 'Save changes' : 'Add supplier'}</button></div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Delete this supplier?" description={`“${deleteTarget.name}” and their catalog will be permanently removed from this workspace.`} onClose={() => { if (!pending) setDeleteTarget(null); }}>
          <p className="danger-note">Any quantities in this supplier’s draft will also be removed.</p>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="form-actions"><button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={pending}>Keep supplier</button><button className="btn btn-danger" onClick={removeSupplier} disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}{pending ? 'Deleting...' : 'Delete supplier'}</button></div>
        </Modal>
      )}
    </div>
  );
}
