// Componenti condivisi Messina: una parola per etichetta, numeri dei
// problemi nel pallino rosso, tasti grandi uguali nelle app.
import React from 'react';

type Children = { children?: React.ReactNode };

export function Btn(p: { onClick?: () => void; ghost?: boolean; sm?: boolean; disabled?: boolean; type?: 'button' | 'submit'; children?: React.ReactNode; label?: string }) {
  return (
    <button type={p.type ?? 'button'} className={'btn' + (p.ghost ? ' ghost' : '') + (p.sm ? ' sm' : '')}
      onClick={p.onClick} disabled={p.disabled} aria-label={p.label}>{p.children}</button>
  );
}

export function BigBtn(p: { onClick?: () => void; ghost?: boolean; disabled?: boolean; label?: string; children?: React.ReactNode }) {
  return <button type="button" className={'bigbtn' + (p.ghost ? ' ghost' : '')} onClick={p.onClick} disabled={p.disabled} aria-label={p.label}>{p.children}</button>;
}

export function Pill(p: { tone?: 'dark' | 'red' | 'ok'; children?: React.ReactNode }) {
  return <span className={'pill' + (p.tone ? ' ' + p.tone : '')}>{p.children}</span>;
}

/** pallino rosso con il numero dei problemi; sparisce a zero */
export function Badge({ n }: { n: number }) {
  return n > 0 ? <span className="badge">{n}</span> : null;
}

/** striscia rossa con una parola e il pallino */
export function Warn({ word, n }: { word: string; n?: number }) {
  return <div className="warn" role="status">{word}{n !== undefined && <Badge n={n} />}</div>;
}

export function Msg({ children }: Children) {
  return <div className="msg" role="status">{children}</div>;
}

export function OkBox({ children }: Children) {
  return <div className="okbox" role="status">{children}</div>;
}

export function Chip(p: { on?: boolean; onClick?: () => void; children?: React.ReactNode }) {
  return <button type="button" className={'chip' + (p.on ? ' on' : '')} aria-pressed={!!p.on} onClick={p.onClick}>{p.children}</button>;
}

export function Chips<T extends string>(p: { value: T; options: readonly T[]; onChange: (v: T) => void; counts?: Partial<Record<T, number>> }) {
  return (
    <div className="row">
      {p.options.map((o) => <Chip key={o} on={p.value === o} onClick={() => p.onChange(o)}>{o}{p.counts?.[o] ? <Badge n={p.counts[o]!} /> : null}</Chip>)}
    </div>
  );
}

export function Stat(p: { label: string; value: React.ReactNode; sub?: React.ReactNode; alert?: boolean }) {
  return (
    <div className="panel card" style={p.alert ? { boxShadow: 'inset 0 0 0 2px var(--alert)' } : undefined}>
      <div className="lbl">{p.label}</div>
      <div className="big" style={p.alert ? { color: 'var(--alert)' } : undefined}>{p.value}</div>
      {p.sub && <div className="lbl">{p.sub}</div>}
    </div>
  );
}

export function Search(p: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
      <span className="sr">Cerca</span>
      <input value={p.value} placeholder="Cerca" onChange={(e) => p.onChange(e.target.value)} />
    </label>
  );
}

export function Empty({ children }: Children) {
  return <div className="empty">{children}</div>;
}

/** blocco numerato dell'app: si accende quando il precedente è finito */
export function Step(p: { n: number; title: string; done: boolean; on: boolean; children?: React.ReactNode }) {
  return (
    <section className={'step' + (p.done ? ' done' : p.on ? '' : ' off')} aria-disabled={!p.on && !p.done}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <span className="n">{p.done ? '✓' : p.n}</span>
        <b style={{ fontSize: 20, color: p.done ? 'var(--ok)' : undefined }}>{p.title}</b>
      </div>
      {p.children}
    </section>
  );
}

export const Icons = {
  cam: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13.5" r="3.5" /></svg>,
  pen: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>,
  pal: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="8" width="8" height="7" /><rect x="13" y="8" width="8" height="7" /><rect x="8" y="2" width="8" height="6" /><path d="M2 15h20v3H2zM4 18v3M12 18v3M20 18v3" /></svg>,
  pin: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.1-7-11.5a7 7 0 0114 0C19 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
};

export function euro(n: number | null | undefined) {
  return '€ ' + (n ?? 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function ora(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  const oggi = new Date();
  const hm = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === oggi.toDateString()) return hm;
  const ieri = new Date(oggi); ieri.setDate(oggi.getDate() - 1);
  if (d.toDateString() === ieri.toDateString()) return 'Ieri ' + hm;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' + hm;
}
