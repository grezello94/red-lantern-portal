import { useMemo, useState } from 'react';
import { Check, ChevronRight, Layers3, LoaderCircle, Package, Pencil, Plus, Search, Share2, ShoppingBag, Trash2, X } from 'lucide-react';
import { createSupplier, deleteSupplier, updateSupplier } from '../data';
import { EmptyState, Field, Modal } from './ui';

const getSupplies = (supplier) => Array.isArray(supplier.supplies) ? supplier.supplies : [];
const getDraftCount = (supplier) => getSupplies(supplier).filter((item) => Number(item.quantity) > 0).length;
const getInitials = (name) => name.trim().charAt(0).toUpperCase() || 'S';

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
      {isAdmin && <button className="invite-card" onClick={copyCode} aria-label="Invite Staff: copy store code" title="Copy store code to invite staff">
        <span className="invite-icon"><Share2 size={22} /></span>
        <span className="invite-copy">
          <strong>Invite Staff</strong>
          <span className="invite-code">Code: <code>{storeId}</code></span>
        </span>
        <span className="invite-copy-button" aria-hidden="true">{copied ? <Check size={20} /> : <ChevronRight size={20} />}</span>
      </button>}

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
                  {isAdmin && <div className="supplier-row-actions">
                    <button className="icon-button" aria-label={`Edit ${supplier.name}`} onClick={() => openEditor(supplier)} title="Edit supplier"><Pencil size={17} /></button>
                    <button className="icon-button danger-hover" aria-label={`Delete ${supplier.name}`} onClick={() => { setDeleteTarget(supplier); setFormError(''); }} title="Delete supplier"><Trash2 size={18} /></button>
                  </div>}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isAdmin && <button className="add-supplier-fab" onClick={() => openEditor()} aria-label="Add supplier" title="Add supplier"><Plus size={30} strokeWidth={2.5} /></button>}

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
