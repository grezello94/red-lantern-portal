import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export function BrandMark({ compact = false, subtitle = 'SUPPLY PORTAL' }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <span className="brand-symbol" aria-hidden="true">🏮</span>
    {!compact && <span className="brand-copy"><strong>RED LANTERN</strong><small>{subtitle}</small></span>}
  </div>;
}

export function Field({ label, hint, children }) {
  const generatedId = useId();
  const id = children?.props?.id || generatedId;
  const hintId = `${id}-hint`;
  const child = isValidElement(children) ? cloneElement(children, {
    id,
    'aria-describedby': [children.props['aria-describedby'], hint ? hintId : null].filter(Boolean).join(' ') || undefined,
  }) : children;
  return <div className="field"><label className="field-label" htmlFor={id}>{label}</label>{child}{hint && <span className="field-hint" id={hintId}>{hint}</span>}</div>;
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return <div className="empty-state">{Icon && <span className="empty-state-icon"><Icon size={30} strokeWidth={1.5}/></span>}<h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function Modal({ title, description, onClose, children, wide = false }) {
  const dialog = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = dialog.current;
    const focusables = () => Array.from(panel.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex="0"]'));
    (panel.querySelector('input:not(:disabled), textarea:not(:disabled), select:not(:disabled)') || focusables()[0] || panel).focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const elements = focusables();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    panel.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = previousOverflow; panel.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`modal ${wide ? 'modal-wide' : ''}`}>
      <header className="modal-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></header>
      {children}
    </section>
  </div>;
}
