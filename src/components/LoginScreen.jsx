import { useState } from 'react';
import { ArrowRight, ChevronLeft, ClipboardList, LoaderCircle, Moon, Plus, Store, Sun } from 'lucide-react';
import { createStore } from '../data.js';
import { BrandMark, Field } from './ui.jsx';

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
      setError('Could not create your store. Check your connection and try again.');
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
        <BrandMark />
        <button className="icon-button" onClick={toggleTheme} aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`} title={`Switch to ${isDark ? 'light' : 'dark'} theme`}>
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      <section className="login-access" aria-labelledby="login-heading">
        <div className="login-intro">
          <div className="login-mark"><BrandMark compact /></div>
          <h1 className="login-headline" id="login-heading">Your supplies.<br /><span>Sorted.</span></h1>
          <p className="login-description">Build orders. Send them to your suppliers.</p>
        </div>

        <div className="login-card">
          {view === 'login' ? (
            <>
              <h2 className="login-card-title">Welcome back</h2>
              <p className="login-card-description">Enter your store code to get started.</p>
              <form onSubmit={openWorkspace}>
                <div className="login-role-switch" role="group" aria-label="Workspace role">
                  <button type="button" className={role === 'staff' ? 'active' : ''} onClick={() => setRole('staff')} aria-pressed={role === 'staff'}><ClipboardList size={18} /> Staff</button>
                  <button type="button" className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')} aria-pressed={role === 'admin'}><Store size={18} /> Admin</button>
                </div>
                <Field label="Store code" hint={role === 'staff' ? 'Ask your admin for your store code.' : 'Use the code from your store workspace.'}>
                  <input id="store-code" className="input store-code-input" type="text" name="store-code" aria-label="Store code" placeholder="RL-ABC123" value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); if (error) setError(''); }} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} required />
                </Field>
                {error && <p className="login-error" id="login-error" role="alert">{error}</p>}
                <button className="btn btn-primary login-submit" type="submit">Open workspace <ArrowRight size={19} /></button>
              </form>
              <div className="login-card-divider" />
              <button className="btn btn-secondary login-create-button" type="button" onClick={() => changeView('create')}><Plus size={18} /> Create a new store</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost login-back" onClick={() => changeView('login')} disabled={creating}><ChevronLeft size={18} /> Back</button>
              <h2 className="login-card-title">Create your store</h2>
              <p className="login-card-description">Add suppliers, build your catalogue, and invite your team with one store code.</p>
              <form onSubmit={handleCreate}>
                {error && <p className="login-error" role="alert">{error}</p>}
                <button className="btn btn-primary login-submit" type="submit" disabled={creating}>{creating ? <><LoaderCircle size={18} className="spin" /> Creating your store…</> : <>Create store <Plus size={18} /></>}</button>
              </form>
              <p className="login-card-footnote">You’ll join as admin. Save your store code for your next visit.</p>
            </>
          )}
        </div>

        <button className="btn btn-ghost login-demo" type="button" disabled={creating} onClick={() => onLogin('demo', true)}>Try with sample suppliers <ArrowRight size={17} /></button>
      </section>
      <footer className="login-footer">RED LANTERN · SUPPLY PORTAL</footer>
    </main>
  );
}
