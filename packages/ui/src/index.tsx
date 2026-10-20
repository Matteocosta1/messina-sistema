// Componenti Messina: stessa struttura HTML e stesse classi del mockup approvato
// (prova-messina.html), così l'aspetto è identico. Il foglio di stile è mockup.css.
import React from 'react';

type C = { children?: React.ReactNode };

/** b(label, …, cls) del mockup */
export function Btn(p: { onClick?: () => void; ghost?: boolean; sm?: boolean; disabled?: boolean; type?: 'button' | 'submit'; label?: string; style?: React.CSSProperties; children?: React.ReactNode }) {
  return (
    <button type={p.type ?? 'button'} className={'btn' + (p.ghost ? ' ghost' : '') + (p.sm ? ' sm' : '')} onClick={p.onClick}
      disabled={p.disabled} aria-label={p.label}
      style={p.disabled ? { opacity: .35, cursor: 'not-allowed', ...p.style } : p.style}>{p.children}</button>
  );
}

/** chip(label, …, on) del mockup */
export function Chip(p: { on?: boolean; onClick?: () => void; children?: React.ReactNode }) {
  return <button type="button" className={'chipbtn' + (p.on ? ' on' : '')} aria-pressed={!!p.on} onClick={p.onClick}>{p.children}</button>;
}

export function Chips<T extends string>(p: { value: T; options: readonly T[]; onChange: (v: T) => void; counts?: Partial<Record<T, number>>; labels?: Partial<Record<T, string>> }) {
  return <div className="row">{p.options.map((o) => <Chip key={o} on={p.value === o} onClick={() => p.onChange(o)}>{p.labels?.[o] ?? o}<Badge n={p.counts?.[o] ?? 0} /></Chip>)}</div>;
}

/** pill(t, c) del mockup */
export function Pill(p: { tone?: 'dark' | 'red' | 'ok'; children?: React.ReactNode }) {
  return <span className={'pill' + (p.tone ? ' ' + p.tone : '')}>{p.children}</span>;
}

/** badge(n): pallino rosso, sparisce a zero */
export function Badge({ n }: { n: number }) {
  return n > 0 ? <span className="badge">{n}</span> : null;
}

/** warn(t) e warnW(w, n) del mockup */
export function Warn({ children, n }: { children?: React.ReactNode; n?: number }) {
  return n === undefined
    ? <div className="warn" role="status">{children}</div>
    : <div className="warn row" style={{ gap: 0 }} role="status">{children}<Badge n={n} /></div>;
}

/** msg(text, btnLabel, …) del mockup */
export function Msg(p: { children?: React.ReactNode; azione?: string; onAzione?: () => void }) {
  return <div className="msg" role="status"><span>{p.children}</span>{p.azione && <Btn sm onClick={p.onAzione}>{p.azione}</Btn>}</div>;
}

/** srch() del mockup: dice solo «Cerca» */
export function Search(p: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <label className="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      <span className="sr">Cerca</span>
      <input id={p.id} placeholder="Cerca" value={p.value} onChange={(e) => p.onChange(e.target.value)} />
    </label>
  );
}

/** riquadro numerico: <div class="glass card"><div class="lbl">…</div><div class="big">…</div> */
export function Stat(p: { label: string; value: React.ReactNode; sub?: React.ReactNode; alert?: boolean }) {
  return (
    <div className="glass card" style={p.alert ? { boxShadow: 'inset 0 0 0 2px var(--alert), var(--shadow)' } : undefined}>
      <div className="lbl">{p.label}</div>
      <div className="big" style={p.alert ? { color: 'var(--alert)' } : undefined}>{p.value}</div>
      {p.sub !== undefined && <div className="lbl">{p.sub}</div>}
    </div>
  );
}

export function Card(p: C & { className?: string; style?: React.CSSProperties }) {
  return <div className={'glass card ' + (p.className ?? '')} style={p.style}>{p.children}</div>;
}

export function Vuoto({ children }: C) {
  return <div className="lbl" style={{ padding: 14 }}>{children}</div>;
}

/** blocco numerato delle app: si accende quando il precedente è finito */
export function Blocco(p: { n: number; titolo: string; fatto: boolean; acceso: boolean; children?: React.ReactNode }) {
  return (
    <div className="pcard stack" style={{ padding: 14, gap: 10, ...(p.fatto ? { border: '2px solid var(--ok)', background: 'var(--ok-soft)' } : p.acceso ? { border: '2px solid var(--solid)' } : { opacity: .4, pointerEvents: 'none' }) }}>
      <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
        <span style={{ width: 30, height: 30, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flex: 'none',
          ...(p.fatto ? { background: 'var(--ok)', color: '#fff' } : { border: '2px solid currentColor' }) }}>{p.fatto ? '✓' : p.n}</span>
        <b style={{ fontSize: 20, color: p.fatto ? 'var(--ok)' : undefined }}>{p.titolo}</b>
      </div>
      {p.children}
    </div>
  );
}

/** icone del mockup (KI) */
const ic = (d: React.ReactNode, w = 22) => <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
export const KI = {
  cam: (w?: number) => ic(<><path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13.5" r="3.5" /></>, w),
  pen: (w?: number) => ic(<><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>, w),
  star: (w?: number) => ic(<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />, w),
  eur: (w?: number) => ic(<><path d="M17 6.5A6.5 6.5 0 1017 17.5" /><path d="M4 10.5h9M4 13.5h9" /></>, w),
  pal: (w?: number) => ic(<><rect x="3" y="8" width="8" height="7" /><rect x="13" y="8" width="8" height="7" /><rect x="8" y="2" width="8" height="6" /><path d="M2 15h20v3H2zM4 18v3M12 18v3M20 18v3" /></>, w),
  pin: (w?: number) => ic(<><path d="M12 21s-7-6.1-7-11.5a7 7 0 0114 0C19 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>, w),
  clip: (w?: number) => ic(<path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l8-8" />, w ?? 16),
};

export function euro(n: number | null | undefined) {
  if (n === null || n === undefined) return '€ —';
  return '€ ' + n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function ora(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso), oggi = new Date();
  const hm = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === oggi.toDateString()) return hm;
  const ieri = new Date(oggi); ieri.setDate(oggi.getDate() - 1);
  if (d.toDateString() === ieri.toDateString()) return 'Ieri ' + hm;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' + hm;
}

export function giorno(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
}

export const plurale = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`;
