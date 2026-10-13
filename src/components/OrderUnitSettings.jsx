import { useRef, useState } from 'react';
import { ArrowLeft, LoaderCircle, Plus, Ruler } from 'lucide-react';
import { ITEM_UNITS, addItemUnit, normalizeItemUnit, normalizeItemUnits } from '../data.js';
import { Field } from './ui.jsx';

export default function OrderUnitSettings({ storeId, isAdmin, itemUnits, onBack, backLabel = 'Back to suppliers', showToast }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const units = normalizeItemUnits(itemUnits);
  const defaultUnits = new Set(ITEM_UNITS.map(normalizeItemUnit));

  const addUnit = async (event) => {
    event.preventDefault();
    if (!isAdmin || pending.current) return;

    if (!name.trim()) {
      setError('Enter a unit name, such as CASE or BOTTLE.');
      return;
    }
    if (name.length > 24) {
      setError('Keep the unit name to 24 characters or fewer.');
      return;
    }
    if (Array.from(name).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
      setError('Use a unit name without line breaks or control characters.');
      return;
    }
    const unit = normalizeItemUnit(name);
    if (unit.length > 24) {
      setError('Keep the unit name to 24 characters or fewer.');
      return;
    }
    if (units.includes(unit)) {
      setError(`${unit} is already in your unit list.`);
      return;
    }

    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await addItemUnit(storeId, unit);
      setName('');
      showToast(`${unit} added to order units`);
    } catch {
      setError('Could not add this unit. Check your connection and try again.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <section className="unit-settings-page">
      <header className="settings-heading">
        <button type="button" className="icon-button back-button" onClick={onBack} disabled={saving} aria-label={backLabel}><ArrowLeft size={22} /></button>
        <div><h1>Order units</h1><p>Use the right unit for every item.</p></div>
      </header>

      <div className="settings-panel">
        <div className="panel-heading">
          <div><h2>Add a unit</h2><p>Add units your team orders in. They’ll appear in every supplier’s item dropdown.</p></div>
          <Ruler size={23} />
        </div>
        <form className="unit-settings-form" onSubmit={addUnit}>
          <Field label="New unit" hint="For example: CASE, BOTTLE, or PACK.">
            <input className="input" name="new-unit" aria-label="New unit" type="text" placeholder="e.g. BOTTLE" value={name} onChange={(event) => { setName(event.target.value); if (error) setError(''); }} maxLength={24} autoComplete="off" spellCheck={false} disabled={saving} aria-invalid={Boolean(error)} aria-describedby={error ? 'unit-settings-error' : undefined} />
          </Field>
          {error && <p className="form-error" id="unit-settings-error" role="alert">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? <><LoaderCircle size={18} className="spin" /> Adding unit…</> : <><Plus size={18} /> Add unit</>}</button>
        </form>
      </div>

      <div className="settings-panel">
        <div className="panel-heading"><div><h2>Available units</h2><p>Shared across your store’s suppliers.</p></div><span className="badge">{units.length} units</span></div>
        <ul className="unit-list" aria-label="Available order units">
          {units.map((unit) => <li className="unit-row" key={unit}><span className="unit-name">{unit}</span><span className="badge unit-type">{defaultUnits.has(unit) ? 'Default' : 'Custom'}</span></li>)}
        </ul>
      </div>
      <p className="unit-settings-note">Unit names are saved in uppercase to keep orders consistent.</p>
    </section>
  );
}
