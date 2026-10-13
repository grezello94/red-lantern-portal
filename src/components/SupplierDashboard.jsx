import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, ClipboardList, Copy, Layers3, LoaderCircle, Package, Pencil, Plus, Search, ShoppingBag, Trash2, Users, X } from 'lucide-react';
import { createSupplier, deleteSupplier, updateSupplier } from '../data';
import { EmptyState, Field, Modal } from './ui';

const getSupplies = (supplier) => Array.isArray(supplier.supplies) ? supplier.supplies : [];
const getDraftCount = (supplier) => getSupplies(supplier).filter((item) => Number(item.quantity) > 0).length;
const getInitials = (name) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'S';
const tones = ['coral', 'mint', 'amber', 'violet'];

export default function SupplierDashboard({ storeId, isAdmin, suppliers = [], loading, error, onSelect, onRetry, orderMessages = [], showToast }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => ({
    suppliers: suppliers.length,
    items: suppliers.reduce((sum, supplier) => sum + getSupplies(supplier).length, 0),
    drafts: suppliers.filter((supplier) => getDraftCount(supplier) > 0).length,
  }), [suppliers]);

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

  return (
    <div className="dashboard">
      <header className="page-heading">
        <div className="page-heading-copy">
          <p className="eyebrow"><span /> WORKSPACE / PROCUREMENT</p>
          <h1 className="page-title">Your next order<br />starts here<span className="accent-text">.</span></h1>
          <p className="page-subtitle">Choose a supplier, build your order, and keep your shelves stocked.</p>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={() => openEditor()}><Plus size={17} /> Add supplier</button>}
      </header>

      <section className="stat-grid" aria-label="Workspace overview">
        <Stat icon={Users} tone="coral" label="SUPPLIERS" value={loading || error ? '—' : stats.suppliers} caption="Your supply network" />
        <Stat icon={Package} tone="mint" label="CATALOG ITEMS" value={loading || error ? '—' : stats.items} caption="Across all suppliers" />
        <Stat icon={ClipboardList} tone="violet" label="ORDER DRAFTS" value={loading || error ? '—' : stats.drafts} caption="Suppliers with selected items" />
      </section>

      <section className="supplier-directory" aria-labelledby="supplier-directory-title">
        <div className="section-heading">
          <div>
            <h2 id="supplier-directory-title" className="section-title">Supplier directory <span className="section-count">{loading || error ? '—' : stats.suppliers}</span></h2>
            <p className="section-description">Everything you need. One supplier at a time.</p>
          </div>
          <span className="directory-note"><span className="status-dot" /> Your workspace</span>
        </div>

        <div className="directory-toolbar">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search suppliers" placeholder="Search suppliers..." type="search" />
            {search && <button type="button" className="icon-button" aria-label="Clear supplier search" onClick={() => setSearch('')}><X size={15} /></button>}
          </label>
          <div className="segmented-control" aria-label="Filter suppliers">
            <button className={`segment ${filter === 'all' ? 'active' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All suppliers <span className="segment-count">{stats.suppliers}</span></button>
            <button className={`segment ${filter === 'drafts' ? 'active' : ''}`} aria-pressed={filter === 'drafts'} onClick={() => setFilter('drafts')}>With draft <span className="segment-count">{stats.drafts}</span></button>
          </div>
        </div>

        {error ? (
          <EmptyState icon={Layers3} title="Your suppliers could not load" description={error} action={<button className="btn btn-secondary" onClick={onRetry}>Try again</button>} />
        ) : loading ? (
          <div className="supplier-grid" aria-busy="true" aria-label="Loading suppliers">
            {[0, 1, 2, 3, 4, 5].map((index) => <div className="supplier-card supplier-skeleton" key={index}><div className="skeleton skeleton-avatar" /><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-button" /></div>)}
          </div>
        ) : suppliers.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Your supply network starts here" description={isAdmin ? 'Add your first supplier, set up their catalog, and prepare an order in minutes.' : 'Ask your workspace administrator to add suppliers so you can start placing orders.'} action={isAdmin ? <button className="btn btn-primary" onClick={() => openEditor()}><Plus size={16} /> Add your first supplier</button> : null} />
        ) : filteredSuppliers.length === 0 ? (
          <EmptyState icon={Search} title={search ? 'No matching suppliers' : 'A fresh start for your next order'} description={search ? `No suppliers match “${search}”. Try another name.` : 'Select a supplier and add quantities. Your order drafts will appear here.'} action={<button className="btn btn-secondary" onClick={() => { setSearch(''); setFilter('all'); }}>View all suppliers</button>} />
        ) : (
          <div className="supplier-grid">
            {filteredSuppliers.map((supplier) => {
              const draftCount = getDraftCount(supplier);
              const originalIndex = suppliers.findIndex((entry) => entry.id === supplier.id);
              return (
                <article className="supplier-card" key={supplier.id}>
                  <div className="supplier-card-top">
                    <div className={`supplier-avatar ${tones[originalIndex % tones.length]}`} aria-hidden="true">{getInitials(supplier.name || 'Supplier')}</div>
                    <div className="supplier-card-actions">
                      {isAdmin && <>
                        <button className="icon-button" aria-label={`Edit ${supplier.name}`} onClick={() => openEditor(supplier)} title="Edit supplier"><Pencil size={15} /></button>
                        <button className="icon-button danger-hover" aria-label={`Delete ${supplier.name}`} onClick={() => { setDeleteTarget(supplier); setFormError(''); }} title="Delete supplier"><Trash2 size={15} /></button>
                      </>}
                    </div>
                  </div>
                  <div className="supplier-card-body">
                    <p className="supplier-card-label">SUPPLIER / {String(originalIndex + 1).padStart(2, '0')}</p>
                    <h3>{supplier.name}</h3>
                    <p className="supplier-meta"><Package size={14} /> {getSupplies(supplier).length} catalog {getSupplies(supplier).length === 1 ? 'item' : 'items'}{supplier.phone && <span className="supplier-contact-dot" title="WhatsApp number saved" aria-label="WhatsApp number saved" />}</p>
                  </div>
                  <div className="supplier-card-footer">
                    <span className={`supplier-draft ${draftCount > 0 ? 'has-draft' : ''}`}><span className="supplier-draft-dot" />{draftCount > 0 ? `${draftCount} ${draftCount === 1 ? 'item' : 'items'} in draft` : 'Ready for your order'}</span>
                    <button className={`btn ${draftCount ? 'btn-primary' : 'btn-secondary'} supplier-order-button`} onClick={() => onSelect(supplier)}>{draftCount ? 'Continue order' : 'Create order'}<ArrowUpRight size={17} /></button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isAdmin && <section className="team-card" aria-labelledby="team-title">
        <div className="team-card-icon"><Users size={22} /></div>
        <div className="team-card-copy"><h3 id="team-title">Good orders are a team effort.</h3><p>Share your workspace code with staff so they can prepare orders.</p></div>
        <code className="team-code">{storeId}</code>
        <button className="btn btn-secondary" onClick={copyCode}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy code'}</button>
        <ArrowDownRight className="team-card-decoration" size={38} aria-hidden="true" />
      </section>}

      {editing && <Modal title={editing.id ? 'Edit supplier' : 'Add a supplier'} description="Build your supply network. You can add catalog items after saving." onClose={closeEditor}>
        <form className="form-stack" onSubmit={saveSupplier}>
          <Field label="Supplier name"><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Fresh Market Produce" autoFocus required maxLength={120} disabled={pending} /></Field>
          <Field label="WhatsApp number (optional)" hint="Include the country code, e.g. +91 98765 43210. Used when sharing an order."><input className="input" type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" disabled={pending} maxLength={25} /></Field>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={closeEditor} disabled={pending}>Cancel</button><button className="btn btn-primary" type="submit" disabled={pending || !name.trim()}>{pending ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}{pending ? 'Saving...' : editing.id ? 'Save changes' : 'Add supplier'}</button></div>
        </form>
      </Modal>}

      {deleteTarget && <Modal title="Delete this supplier?" description={`“${deleteTarget.name}” and their catalog will be permanently removed from this workspace.`} onClose={() => { if (!pending) setDeleteTarget(null); }}>
        <p className="danger-note">Any quantities in this supplier’s draft will also be removed.</p>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="form-actions"><button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={pending}>Keep supplier</button><button className="btn btn-danger" onClick={removeSupplier} disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}{pending ? 'Deleting...' : 'Delete supplier'}</button></div>
      </Modal>}
    </div>
  );
}

function Stat({ icon, tone, label, value, caption }) {
  const Icon = icon;
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={21} strokeWidth={1.8} /></div><div className="stat-copy"><p className="stat-label">{label}</p><p className="stat-value">{value}</p><p className="stat-caption">{caption}</p></div><ArrowUpRight className="stat-arrow" size={17} aria-hidden="true" /></div>;
}
