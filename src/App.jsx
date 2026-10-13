import { useState, useEffect, useRef } from 'react';
import { MessageSquareText, ArrowUpRight, Sun, Moon, LogOut, ChevronRight, Menu, X, RefreshCw, Check, CircleAlert, Plus, Trash2, Save, Store, ShoppingBag, ArrowLeft, Copy, Ruler } from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import SupplierDashboard from './components/SupplierDashboard';
import OrderComposer from './components/OrderComposer';
import OrderUnitSettings from './components/OrderUnitSettings';
import { BrandMark, Field, Modal } from './components/ui';
import { DEFAULT_ORDER_MESSAGES, ITEM_UNITS, normalizeItemUnits, normalizeOrderMessages, getVendorAssignedMessageIds, subscribeStore, subscribeSuppliers, saveStore, updateSupplier } from './data';

export default function App() {
  const [storeId, setStoreId] = useState(() => localStorage.getItem('store_id'));
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('is_admin') === 'true');
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light');
  const [page, setPage] = useState('suppliers');
  const [selectedId, setSelectedId] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [orderMessages, setOrderMessages] = useState(DEFAULT_ORDER_MESSAGES);
  const [itemUnits, setItemUnits] = useState(ITEM_UNITS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const directoryScroll = useRef(0);
  const unitSettingsScroll = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0a0a0a' : '#f7f7f9');
  }, [isDark]);

  useEffect(() => {
    if (!storeId) return;
    let received = false;
    const timeout = setTimeout(() => {
      if (!received) {
        setError('We’re having trouble connecting. Check your connection and try again.');
        setLoading(false);
      }
    }, 12000);
    const unsubscribe = subscribeSuppliers(storeId, (data) => {
      received = true;
      setSuppliers(data);
      setLoading(false);
      setError('');
    }, () => {
      received = true;
      setLoading(false);
      setError('Couldn’t load suppliers. Check your connection or store access and try again.');
    });
    const unsubscribeStore = subscribeStore(storeId,
      (data) => {
        setOrderMessages(normalizeOrderMessages(data.orderMessages));
        setItemUnits(normalizeItemUnits(data.itemUnits));
      },
      () => setError('Couldn’t load store settings. Please try refreshing.'));
    return () => { clearTimeout(timeout); unsubscribe(); unsubscribeStore(); };
  }, [storeId, retry]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (message) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  };
  const login = (id, admin) => {
    localStorage.setItem('store_id', id);
    localStorage.setItem('is_admin', String(admin));
    setSuppliers([]);
    setLoading(true);
    setError('');
    setPage('suppliers');
    setSelectedId(null);
    setItemUnits(ITEM_UNITS);
    setStoreId(id);
    setIsAdmin(admin);
    window.scrollTo(0, 0);
  };
  const logout = () => {
    localStorage.removeItem('store_id');
    localStorage.removeItem('is_admin');
    setStoreId(null);
    setSelectedId(null);
    setShowMenu(false);
    setOrderMessages(DEFAULT_ORDER_MESSAGES);
    setItemUnits(ITEM_UNITS);
  };
  const refresh = () => {
    if (loading) return;
    setLoading(true);
    setError('');
    setRetry((current) => current + 1);
  };
  const openSupplier = (entry) => {
    directoryScroll.current = window.scrollY;
    setSelectedId(entry.id);
    window.scrollTo(0, 0);
  };
  const backToSuppliers = () => {
    setPage('suppliers');
    setSelectedId(null);
    requestAnimationFrame(() => window.scrollTo(0, directoryScroll.current));
  };
  const openMessages = () => {
    setPage('messages');
    setSelectedId(null);
    setShowMenu(false);
    window.scrollTo(0, 0);
  };
  const openUnits = () => {
    if (!isAdmin) return;
    unitSettingsScroll.current = window.scrollY;
    setPage('units');
    setShowMenu(false);
    window.scrollTo(0, 0);
  };
  const closeUnits = () => {
    setPage('suppliers');
    requestAnimationFrame(() => window.scrollTo(0, unitSettingsScroll.current));
  };
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(storeId); showToast('Store code copied.'); }
    catch { showToast('Copy is unavailable. Select the store code to copy it.'); }
  };
  const supplier = suppliers.find((entry) => entry.id === selectedId);
  if (!storeId) return <LoginScreen onLogin={login} isDark={isDark} toggleTheme={() => setIsDark((current) => !current)}/>;

  return (
    <div className="app-shell">
      <header className="app-header">
        <BrandMark subtitle={<><span className="mode-icon">{isAdmin ? <Store size={10}/> : <ShoppingBag size={10}/>}</span>{isAdmin ? 'Admin Mode' : 'Staff Mode'}</>}/>
        <div className="header-actions">
          <button className="icon-button header-action refresh-action" onClick={refresh} disabled={loading} aria-label="Refresh workspace" title="Refresh workspace"><RefreshCw size={19} className={loading ? 'spin' : ''}/></button>
          <button className="icon-button header-action theme-action" onClick={() => setIsDark((current) => !current)} aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`} title={`Switch to ${isDark ? 'light' : 'dark'} theme`}>{isDark ? <Sun size={20}/> : <Moon size={20}/>}</button>
          <button className="icon-button header-action" onClick={() => setShowMenu(true)} aria-label="Open store settings" title="Store settings"><Menu size={20}/></button>
        </div>
      </header>

      {storeId === 'demo' && <div className="demo-banner"><span>Demo workspace · changes stay in this browser.</span><button onClick={logout}>Use your store <ArrowUpRight size={13}/></button></div>}

      <main className="main-content" key={storeId}>
        {page === 'units' && isAdmin ? (
          <OrderUnitSettings storeId={storeId} isAdmin={isAdmin} itemUnits={itemUnits} onBack={closeUnits} backLabel={selectedId ? 'Back to supplier order' : 'Back to suppliers'} showToast={showToast}/>
        ) : page === 'messages' && isAdmin ? (
          <OrderMessageSettings storeId={storeId} suppliers={suppliers} messages={orderMessages} showToast={showToast} onBack={backToSuppliers}/>
        ) : selectedId && supplier ? (
          <OrderComposer key={supplier.id} storeId={storeId} isAdmin={isAdmin} supplier={supplier} orderMessages={orderMessages} itemUnits={itemUnits} onBack={backToSuppliers} showToast={showToast}/>
        ) : selectedId ? (
          <div className="empty-state"><CircleAlert/><h3>This supplier is no longer available</h3><button className="btn btn-secondary" onClick={backToSuppliers}><ArrowLeft size={16}/>Back to suppliers</button></div>
        ) : (
          <SupplierDashboard storeId={storeId} isAdmin={isAdmin} suppliers={suppliers} loading={loading} error={error} orderMessages={orderMessages} onSelect={openSupplier} onRetry={refresh} showToast={showToast}/>
        )}
      </main>

      {!selectedId && <footer className="app-footer"><span>RED LANTERN SUPPLY PORTAL</span><span className={`sync-status ${error ? 'has-error' : ''}`}><span/>{storeId === 'demo' ? 'Demo mode' : loading ? 'Connecting…' : error ? 'Connection issue' : 'Workspace synced'}</span></footer>}

      {showMenu && <Modal title="Store settings" onClose={() => setShowMenu(false)}>
        <div className="store-settings">
          <div className="settings-store-code"><span>YOUR STORE CODE</span><div><code>{storeId}</code><button className="icon-button" onClick={copyCode} aria-label="Copy store code"><Copy size={18}/></button></div><p>Share this code with your team to prepare orders together.</p></div>
          {isAdmin && <button className="settings-menu-row" onClick={openMessages}><span className="settings-menu-icon"><MessageSquareText size={21}/></span><span><strong>Order messages</strong><small>Delivery instructions for each supplier</small></span><ChevronRight size={19}/></button>}
          {isAdmin && <button className="settings-menu-row" onClick={openUnits}><span className="settings-menu-icon"><Ruler size={21}/></span><span><strong>Order units</strong><small>Add units like CASE, BOTTLE, or PACK</small></span><ChevronRight size={19}/></button>}
          <button className="btn btn-danger sign-out-button" onClick={logout}><LogOut size={18}/>Sign out</button>
        </div>
      </Modal>}

      {toast && <div className="toast" role="status"><Check size={17}/><span>{toast}</span><button className="icon-button" onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
    </div>
  );
}

function OrderMessageSettings({ storeId, suppliers, messages, showToast, onBack }) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const current = draft || messages;
  const changed = draft && JSON.stringify(draft) !== JSON.stringify(messages);
  const changeText = (id, text) => setDraft(current.map((message) => message.id === id ? { ...message, text } : message));
  const save = async () => {
    if (current.some((message) => !message.text.trim())) { setError('Add text to every message before saving.'); return; }
    setSaving(true); setError('');
    try {
      const nextMessages = normalizeOrderMessages(current);
      await saveStore(storeId, { orderMessages: nextMessages });
      await Promise.all(suppliers.map((supplier) => {
        const assigned = getVendorAssignedMessageIds(supplier, messages);
        const remaining = assigned.filter((id) => nextMessages.some((message) => message.id === id));
        return assigned.length !== remaining.length ? updateSupplier(storeId, supplier.id, { assignedMessageIds: remaining }) : Promise.resolve();
      }));
      setDraft(null); showToast('Order messages saved');
    } catch { setError('Couldn’t save your messages. Try again.'); }
    finally { setSaving(false); }
  };
  const assign = async (supplier, id, checked) => {
    setSavingId(supplier.id); setError('');
    const ids = getVendorAssignedMessageIds(supplier, messages);
    try { await updateSupplier(storeId, supplier.id, { assignedMessageIds: checked ? [...ids, id] : ids.filter((entry) => entry !== id) }); }
    catch { setError('Couldn’t update supplier instructions. Try again.'); }
    finally { setSavingId(null); }
  };
  return <div className="settings-page"><div className="settings-heading"><button className="icon-button back-button" onClick={onBack} aria-label="Back to suppliers"><ArrowLeft size={21}/></button><div><h1>Order messages</h1><p>Delivery instructions for your suppliers.</p></div></div><div className="settings-grid"><section className="settings-panel"><div className="panel-heading"><div><h2>Message templates</h2><p>Included in the order you share on WhatsApp.</p></div><MessageSquareText size={20}/></div><div className="settings-templates">{current.map((message, index) => <div key={message.id} className="message-template"><Field label={`Instruction ${String(index + 1).padStart(2, '0')}`}><textarea className="input" rows={3} value={message.text} onChange={(event) => changeText(message.id, event.target.value)} disabled={saving}/></Field><button className="icon-button danger" aria-label={`Delete instruction ${index + 1}`} disabled={current.length <= 1 || saving} onClick={() => setDraft(current.filter((entry) => entry.id !== message.id))}><Trash2 size={17}/></button></div>)}<button className="btn btn-secondary" disabled={saving} onClick={() => setDraft([...current, { id: crypto.randomUUID(), text: '' }])}><Plus size={16}/>Add instruction</button>{error && <p className="form-error" role="alert">{error}</p>}<div className="settings-save"><span>{changed ? 'You have unsaved changes' : 'All changes saved'}</span><button className="btn btn-primary" disabled={!changed || saving} onClick={save}>{saving ? <RefreshCw size={16} className="spin"/> : <Save size={16}/>} {saving ? 'Saving…' : 'Save messages'}</button></div></div></section><section className="settings-panel"><div className="panel-heading"><div><h2>Assign to suppliers</h2><p>Choose the right instructions for each supplier.</p></div><Store size={20}/></div><div className="assignment-list">{suppliers.length === 0 ? <p className="muted">Add a supplier to assign delivery instructions.</p> : suppliers.map((supplier) => <details key={supplier.id} className="assignment"><summary><span className="assignment-avatar">{supplier.name?.charAt(0) || 'S'}</span><div><strong>{supplier.name}</strong><small>{getVendorAssignedMessageIds(supplier, messages).length} instructions assigned</small></div><ChevronRight size={17}/></summary><div className="assignment-options">{messages.map((message) => <label key={message.id}><input type="checkbox" checked={getVendorAssignedMessageIds(supplier, messages).includes(message.id)} disabled={savingId === supplier.id || saving || Boolean(changed)} onChange={(event) => assign(supplier, message.id, event.target.checked)}/><span>{message.text}</span></label>)}</div></details>)}{changed && <p className="field-hint">Save your templates before changing assignments.</p>}</div></section></div></div>;
}
