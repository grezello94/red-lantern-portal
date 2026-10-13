import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ClipboardList, LoaderCircle, Moon, Package, Plus, Send, Store, Sun } from 'lucide-react';
import { createStore } from '../data.js';
import { BrandMark, Field } from './ui.jsx';

function SupplyNetwork() {
  return (
    <div className="supply-network" aria-hidden="true">
      <div className="network-grid" />
      <div className="network-orbit orbit-one" />
      <div className="network-orbit orbit-two" />
      <div className="network-core"><Package size={32} strokeWidth={1.4} /></div>
      <div className="network-node node-store">
        <span className="network-node-icon"><Store size={19} /></span>
        <div className="network-node-copy"><small>YOUR WORKSPACE</small><strong>Everything in one place</strong></div>
      </div>
      <div className="network-node node-order">
        <span className="network-node-icon"><ClipboardList size={19} /></span>
        <div className="network-node-copy"><small>YOUR ORDER</small><strong>Prepared with precision</strong></div>
        <Check size={15} className="network-node-check" />
      </div>
      <div className="network-node node-supplier">
        <span className="network-node-icon"><Send size={18} /></span>
        <div className="network-node-copy"><small>YOUR SUPPLIER</small><strong>One message away</strong></div>
      </div>
      <span className="network-connection connection-one" />
      <span className="network-connection connection-two" />
    </div>
  );
}

export default function LoginScreen({ onLogin, isDark, toggleTheme }) {
  const [code, setCode] = useState('');
  const [role, setRole] = useState('staff');
  const [view, setView] = useState('login');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const openWorkspace = (event) => {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length < 6 || normalizedCode.includes('/')) {
      setError('Enter your store code, such as RL-ABC123.');
      return;
    }
    setError('');
    onLogin(normalizedCode, role === 'admin');
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const storeId = await createStore();
      onLogin(storeId, true);
    } catch {
      setError('Your store could not be created. Check your connection and try again.');
    } finally {
      setCreating(false);
    }
  };

  const changeView = (nextView) => {
    setView(nextView);
    setError('');
  };

  return (
    <main className={`login-page ${isDark ? 'is-dark' : 'is-light'}`}>
      <header className="login-topbar">
        <div className="login-brand"><BrandMark /></div>
        <div className="login-topbar-right">
          <span className="login-topbar-note">A better way to order.</span>
          <button className="icon-button" onClick={toggleTheme} aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`} title={`Switch to ${isDark ? 'light' : 'dark'} theme`}>
            {isDark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>

      <div className="login-split">
        <section className="login-story" aria-labelledby="login-heading">
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR SUPPLY CHAIN, SIMPLIFIED</div>
          <h1 className="login-headline" id="login-heading">Good service starts with <span>great supplies.</span></h1>
          <p className="login-description">Less back and forth. More getting things done. Build your orders and connect with suppliers in one organized workspace.</p>
          <SupplyNetwork />
          <div className="login-process">
            <ol>
              <li><span className="process-number">01</span><span>Choose a supplier</span></li>
              <li><span className="process-number">02</span><span>Build your order</span></li>
              <li><span className="process-number">03</span><span>Share on WhatsApp</span></li>
            </ol>
          </div>
        </section>

        <section className="login-access" aria-label="Access your store">
          <div className="login-card">
            {view === 'login' ? (
              <>
                <div className="login-card-eyebrow"><span className="badge">YOUR NEXT ORDER STARTS HERE</span></div>
                <h2 className="login-card-title">Welcome back.</h2>
                <p className="login-card-description">Open your store. Let’s get you stocked.</p>

                <form onSubmit={openWorkspace}>
                  <div className="login-role-switch segmented" role="group" aria-label="Workspace role">
                    <button type="button" className={role === 'staff' ? 'active' : ''} onClick={() => setRole('staff')} aria-pressed={role === 'staff'}><ClipboardList size={16} /> Staff</button>
                    <button type="button" className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')} aria-pressed={role === 'admin'}><Store size={16} /> Admin</button>
                  </div>
                  <p className="login-role-note">{role === 'staff' ? 'Prepare and share orders with your suppliers.' : 'Manage your suppliers, catalogue, and order notes.'}</p>
                  <Field label="Store code" hint="Use the code shared by your store admin.">
                    <input id="store-code" className="input store-code-input" type="text" name="store-code" aria-label="Store code" placeholder="RL-ABC123" value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); if (error) setError(''); }} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} required />
                  </Field>
                  {error && <p className="login-error" id="login-error" role="alert">{error}</p>}
                  <button className="btn btn-primary login-submit" type="submit">Open workspace <ArrowRight size={18} /></button>
                </form>

                <p className="login-create-link">Setting up a new store? <button type="button" onClick={() => changeView('create')}>Create a store <ArrowUpRight size={14} /></button></p>
                <div className="login-card-divider"><span>Take a look around</span></div>
                <button className="btn btn-secondary login-demo" type="button" onClick={() => onLogin('demo', true)}>Explore the demo <ArrowUpRight size={17} /></button>
                <p className="login-demo-note">Try the ordering flow with sample suppliers.</p>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost login-back" onClick={() => changeView('login')} disabled={creating}><ChevronLeft size={16} /> Back to sign in</button>
                <div className="login-card-eyebrow"><span className="badge">A FRESH START</span></div>
                <h2 className="login-card-title">Your store.<br />All connected.</h2>
                <p className="login-card-description">Create your workspace, add your suppliers, and make your first order.</p>
                <div className="login-create-features">
                  <div className="login-create-feature"><span><Store size={18} /></span><div><strong>A code for your team</strong><p>Share your store code to bring staff into the workspace.</p></div></div>
                  <div className="login-create-feature"><span><Package size={18} /></span><div><strong>Your supplier catalogue</strong><p>Organize suppliers, items, and delivery instructions.</p></div></div>
                  <div className="login-create-feature"><span><Send size={18} /></span><div><strong>Orders ready to share</strong><p>Choose quantities and send your order on WhatsApp.</p></div></div>
                </div>
                <form onSubmit={handleCreate}>
                  {error && <p className="login-error" role="alert">{error}</p>}
                  <button className="btn btn-primary login-submit" type="submit" disabled={creating}>{creating ? <><LoaderCircle size={18} className="spin" /> Creating your store…</> : <>Create my workspace <Plus size={18} /></>}</button>
                </form>
                <p className="login-card-footnote">You’ll enter as admin. Keep your store code handy for your next visit.</p>
              </>
            )}
          </div>
          <p className="login-access-caption"><span className="eyebrow-dot" /> BUILT FOR THE WAY YOUR TEAM WORKS</p>
        </section>
      </div>

      <footer className="login-footer"><span>RED LANTERN SUPPLY PORTAL</span><span>From your kitchen. To your suppliers.</span></footer>
    </main>
  );
}
