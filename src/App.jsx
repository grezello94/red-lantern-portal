import { useState, useEffect, useRef } from 'react';
import { LayoutGrid, MessageSquareText, ArrowUpRight, Sun, Moon, LogOut, ChevronRight, Menu, X, RefreshCw, Check, CircleAlert, Plus, Trash2, Save, Store, ArrowLeft } from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import SupplierDashboard from './components/SupplierDashboard';
import OrderComposer from './components/OrderComposer';
import { BrandMark, Field } from './components/ui';
import { DEFAULT_ORDER_MESSAGES, normalizeOrderMessages, getVendorAssignedMessageIds, subscribeStore, subscribeSuppliers, saveStore, updateSupplier } from './data';

export default function App() {
  const [storeId, setStoreId] = useState(() => localStorage.getItem('store_id'));
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('is_admin') === 'true');
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light');
  const [page, setPage] = useState('suppliers');
  const [selectedId, setSelectedId] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [orderMessages, setOrderMessages] = useState(DEFAULT_ORDER_MESSAGES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#101114' : '#f4f5f7');
  }, [isDark]);
  useEffect(() => {
    if (!storeId) return;
    let received = false;
    const timeout = setTimeout(() => {
      if (!received) { setError('We’re having trouble connecting to your workspace. Check your connection and try again.'); setLoading(false); }
    }, 12000);
    const unsubscribe = subscribeSuppliers(storeId, (data) => { received = true; setSuppliers(data); setLoading(false); setError(''); }, () => { received = true; setLoading(false); setError('Couldn’t load suppliers. Check your connection or store access and try again.'); });
    const unsubscribeStore = subscribeStore(storeId, (data) => setOrderMessages(normalizeOrderMessages(data.orderMessages)), () => setError('Couldn’t load delivery instructions. Check your connection and try again.'));
    return () => { clearTimeout(timeout); unsubscribe(); unsubscribeStore(); };
  }, [storeId, retry]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const showToast = (message) => {
    clearTimeout(toastTimer.current); setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  };
  const login = (id, admin) => {
    localStorage.setItem('store_id', id); localStorage.setItem('is_admin', String(admin));
    setSuppliers([]); setLoading(true); setError(''); setPage('suppliers'); setSelectedId(null);
    setStoreId(id); setIsAdmin(admin);
  };
  const logout = () => {
    localStorage.removeItem('store_id'); localStorage.removeItem('is_admin');
    setStoreId(null); setSelectedId(null); setMobileMenu(false); setOrderMessages(DEFAULT_ORDER_MESSAGES);
  };
  const navigate = (target) => { setPage(target); setSelectedId(null); setMobileMenu(false); };
  const supplier = suppliers.find((entry) => entry.id === selectedId);
  const currentTitle = page === 'messages' ? 'Order messages' : selectedId ? 'Create order' : 'Suppliers';
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (!storeId) return <LoginScreen onLogin={login} isDark={isDark} toggleTheme={() => setIsDark((current) => !current)}/>;

  return <div className="app-shell">
    {mobileMenu && <div className="sidebar-overlay" onClick={() => setMobileMenu(false)}/>}
    <aside className={`sidebar ${mobileMenu ? 'is-open' : ''}`} aria-label="Main navigation">
      <div className="sidebar-brand"><BrandMark/><button className="icon-button mobile-menu-close" onClick={() => setMobileMenu(false)} aria-label="Close navigation"><X size={20}/></button></div>
      <div className="workspace-switch"><span className="workspace-icon"><Store size={18}/></span><div><strong>{storeId === 'demo' ? 'Demo workspace' : 'Your restaurant'}</strong><span>{storeId === 'demo' ? 'Explore the ordering flow' : storeId}</span></div><span className="workspace-indicator"/></div>
      <span className="sidebar-label">WORKSPACE</span>
      <nav className="sidebar-nav"><button className={page === 'suppliers' ? 'active' : ''} onClick={() => navigate('suppliers')}><LayoutGrid size={18}/><span>Suppliers</span>{!loading && <span className="nav-count">{suppliers.length}</span>}</button>{isAdmin && <button className={page === 'messages' ? 'active' : ''} onClick={() => navigate('messages')}><MessageSquareText size={18}/><span>Order messages</span></button>}</nav>
      <div className="sidebar-guide"><span className="guide-icon"><ArrowUpRight size={19}/></span><strong>Ready. Set. Restock.</strong><p>Choose your supplier, build an order, and share it on WhatsApp.</p><span className="guide-line"/></div>
      <div className="sidebar-bottom"><div className="theme-control"><span>Appearance</span><button className="icon-button" onClick={() => setIsDark((current) => !current)} aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}>{isDark ? <Sun size={17}/> : <Moon size={17}/>}</button></div><div className="sidebar-account"><span className="account-avatar">RL</span><div><strong>{isAdmin ? 'Store admin' : 'Team member'}</strong><span>{isAdmin ? 'Manage & order' : 'Ordering access'}</span></div><button className="icon-button" onClick={logout} aria-label="Sign out"><LogOut size={17}/></button></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-breadcrumb"><button className="icon-button mobile-menu-toggle" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><Menu size={21}/></button><span className="breadcrumb-root">Workspace</span><ChevronRight size={14}/><strong>{currentTitle}</strong></div><div className="topbar-right"><span className={`connection-badge ${error ? 'has-error' : ''}`}><span/>{storeId === 'demo' ? 'Demo mode' : loading ? 'Connecting' : error ? 'Connection issue' : 'Workspace connected'}</span><span className="topbar-date">{date}</span></div></header>
      {storeId === 'demo' && <div className="demo-banner"><span><strong>You’re in the demo workspace.</strong> Try a sample order. Changes stay in this browser.</span><button onClick={logout}>Use your store <ArrowUpRight size={14}/></button></div>}
      <main className="main-content" key={storeId}>
        {page === 'messages' && isAdmin ? <OrderMessageSettings storeId={storeId} suppliers={suppliers} messages={orderMessages} showToast={showToast}/> : selectedId && supplier ? <OrderComposer key={supplier.id} storeId={storeId} isAdmin={isAdmin} supplier={supplier} orderMessages={orderMessages} onBack={() => setSelectedId(null)} showToast={showToast}/> : selectedId ? <div className="empty-state"><CircleAlert/><h3>This supplier is no longer available</h3><button className="btn btn-secondary" onClick={() => setSelectedId(null)}><ArrowLeft size={16}/>Back to suppliers</button></div> : <SupplierDashboard storeId={storeId} isAdmin={isAdmin} suppliers={suppliers} loading={loading} error={error} orderMessages={orderMessages} onSelect={(entry) => setSelectedId(entry.id)} onRetry={() => { setLoading(true); setError(''); setRetry((current) => current + 1); }} showToast={showToast}/>}
      </main>
      <footer className="app-footer"><span>RED LANTERN <span className="footer-separator">/</span> SUPPLY PORTAL</span><span>Thoughtfully ordered.</span></footer>
    </div>
    {toast && <div className="toast" role="status"><Check size={17}/><span>{toast}</span><button className="icon-button" onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </div>;
}

function OrderMessageSettings({ storeId, suppliers, messages, showToast }) {
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
  return <div className="settings-page"><div className="page-heading"><div><span className="eyebrow">THE DETAILS MAKE THE DIFFERENCE</span><h1 className="page-title">Every order. Clearly communicated.</h1><p className="page-subtitle">Create delivery instructions and choose which suppliers receive them.</p></div></div><div className="settings-grid"><section className="settings-panel"><div className="panel-heading"><div><h2>Message templates</h2><p>Included in the order you share on WhatsApp.</p></div><MessageSquareText size={20}/></div><div className="settings-templates">{current.map((message, index) => <div key={message.id} className="message-template"><Field label={`Instruction ${String(index + 1).padStart(2, '0')}`}><textarea className="input" rows={3} value={message.text} onChange={(event) => changeText(message.id, event.target.value)} disabled={saving}/></Field><button className="icon-button danger" aria-label={`Delete instruction ${index + 1}`} disabled={current.length <= 1 || saving} onClick={() => setDraft(current.filter((entry) => entry.id !== message.id))}><Trash2 size={17}/></button></div>)}<button className="btn btn-secondary" disabled={saving} onClick={() => setDraft([...current, { id: crypto.randomUUID(), text: '' }])}><Plus size={16}/>Add instruction</button>{error && <p className="form-error" role="alert">{error}</p>}<div className="settings-save"><span>{changed ? 'You have unsaved changes' : 'All changes saved'}</span><button className="btn btn-primary" disabled={!changed || saving} onClick={save}>{saving ? <RefreshCw size={16} className="spin"/> : <Save size={16}/>} {saving ? 'Saving…' : 'Save messages'}</button></div></div></section><section className="settings-panel"><div className="panel-heading"><div><h2>Assign to suppliers</h2><p>Choose the right instructions for each supplier.</p></div><Store size={20}/></div><div className="assignment-list">{suppliers.length === 0 ? <p className="muted">Add a supplier to assign delivery instructions.</p> : suppliers.map((supplier) => <details key={supplier.id} className="assignment"><summary><span className="assignment-avatar">{supplier.name?.charAt(0) || 'S'}</span><div><strong>{supplier.name}</strong><small>{getVendorAssignedMessageIds(supplier, messages).length} instructions assigned</small></div><ChevronRight size={17}/></summary><div className="assignment-options">{messages.map((message) => <label key={message.id}><input type="checkbox" checked={getVendorAssignedMessageIds(supplier, messages).includes(message.id)} disabled={savingId === supplier.id || saving || Boolean(changed)} onChange={(event) => assign(supplier, message.id, event.target.checked)}/><span>{message.text}</span></label>)}</div></details>)}{changed && <p className="field-hint">Save your templates before changing assignments.</p>}</div></section></div></div>;
}
