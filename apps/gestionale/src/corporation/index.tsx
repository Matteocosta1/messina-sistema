// Gestionale Messina Corporation: corp() del mockup approvato, con i dati veri.
import '@messina/dati/prova-corporation';
import React, { useRef, useState } from 'react';
import { Btn, Chip, Msg, Pill } from '@messina/ui';
import { Telecamere } from '../telecamere';
import { Richieste } from './richieste';
import { Presenze } from '../trasporti/presenze';
import { Shell, vociPer, useApp, useDati, useAzione, useStato, MailView, type Mail, Errore, hm, Mese, num, eur0, oggiISO, meseISO } from '../core';

const LAPTOP = <svg width="84" height="58" viewBox="0 0 64 44" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="10" y="4" width="44" height="28" rx="2" /><path d="M2 38h60l-4 4H6z" /></svg>;
const TITOLI: Record<string, string> = { home: 'Home', mail: 'Mail', lotti: 'Lotti', inv: 'Inventario', ordini: 'Ordini', stage: 'Stage Computer', stageTel: 'Stage Cellulari', ricambi: 'Ricambi', richieste: 'Richieste', presenze: 'Presenze', telecamere: 'Telecamere' };
const giorniDa = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
const giornoLocale = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const quandoOrdine = (iso: string) => { const g = giornoLocale(iso), o = oggiISO(); if (g === o) return hm(iso);
  const i = new Date(); i.setDate(i.getDate() - 1); return g === giornoLocale(i.toISOString()) ? 'Ieri' : new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }); };
const fermo = (d: any) => d.stato !== 'Venduto' && (d.stato === 'Fermo' || giorniDa(d.caricato_il) > 60);
const statoPill = (s: string) => s === 'Fermo' || s === 'Reso' ? <Pill tone="red">{s}</Pill> : s === 'Venduto' ? <Pill tone="ok">{s}</Pill> : <Pill>{s}</Pill>;
const has = (q: string, ...xs: unknown[]) => !q || xs.some((x) => String(x ?? '').toLowerCase().includes(q.toLowerCase()));

export function Corporation() {
  const { io, percorso } = useApp();
  const sez = percorso.split('/')[0] || 'home';
  // la ricerca vale per la sezione in cui è stata scritta (la Mail può prepararla per l'Inventario)
  const [ricerca, setRicerca] = useState({ sez: '', q: '' });
  const cerca = ricerca.sez === sez ? ricerca.q : '';
  const setCerca = (q: string) => setRicerca({ sez, q });
  const { dati: presenze } = useDati((db) => db.rpc<boolean>('vede_presenze', { p_azienda: 'corporation' }), []);
  const voci = vociPer(io).filter((v) => v.id !== 'presenze' || presenze);
  const s = voci.some((v) => v.id === sez) ? sez : 'home';
  const corpo = s === 'mail' ? <MailCorp onCerca={(q) => setRicerca({ sez: 'inv', q })} /> : s === 'lotti' ? <Lotti q={cerca} /> : s === 'inv' ? <Inventario q={cerca} />
    : s === 'ordini' ? <Ordini q={cerca} /> : s === 'stage' ? <Stage /> : s === 'stageTel' ? <StageTel q={cerca} /> : s === 'ricambi' ? <Ricambi q={cerca} /> : s === 'richieste' ? <Richieste /> : s === 'presenze' ? <Presenze tab={percorso.split('/')[1]} /> : s === 'telecamere' ? <Telecamere /> : <Home />;
  return <Shell voci={voci} titolo={TITOLI[s]} cerca={cerca} onCerca={setCerca}>{corpo}</Shell>;
}

// ------------------------------------------------------------------ Home
function Home() {
  const { vai } = useApp();
  const [per, setPer] = useState<'Oggi' | 'Mese'>('Oggi');
  const { dati: dev } = useDati((db) => db.from<any>('device').select('id,stato,siti,caricato_il').neq('stato', 'Venduto'));
  const { dati: ven } = useDati((db) => db.from<any>('vendite').select('canale,venduto_il').gte('venduto_il', meseISO() + '-01'));
  const { dati: ord } = useDati((db) => db.from<any>('ordini').select('id,stato,entro').in('stato', ['Da preparare', 'Pronto']));
  const { dati: inc } = useDati((db) => db.from<any>('incassi_corporation').select('*'));
  const { dati: st } = useDati((db) => db.from<any>('stage_oggi').select('*'));
  const { dati: fall } = useDati((db) => db.from<any>('stage_pc').select('id').eq('esito', 'Fallito').gte('iniziato_il', oggiISO()));
  const { dati: lic } = useDati((db) => db.from<any>('impostazioni').select('valore').eq('chiave', 'licenze_certus'));
  const { dati: posta } = useDati((db) => db.from<any>('mail').select('id').eq('azienda', 'corporation').eq('stato', 'Da leggere'));
  const { io } = useApp();
  const { dati: ric } = useDati((db) => io.ruolo === 'vendite' || io.ruolo === 'direzione' ? db.from<any>('richieste_aziende').select('id,stato,creata_il').eq('stato', 'Aperta') : Promise.resolve([] as any[]));
  if (!dev || !ven || !ord) return null;
  const inVendita = dev.filter((d) => d.stato === 'Disponibile' && d.siti?.length).length;
  const persona = ven.filter((v) => v.canale === 'Di persona').length;
  const entro = ord.map((o) => o.entro).filter(Boolean).sort()[0];
  const i = inc?.[0] ?? {}, so = st?.[0] ?? {};
  const stage = per === 'Oggi'
    ? [['Ricevuti', so.ricevuti], ['Formattati', so.formattati], ['In corso', so.in_corso], ['Falliti', so.falliti], ['In vendita', so.in_vendita]]
    : [['Ricevuti', so.ricevuti_mese], ['Formattati', so.formattati_mese], ['In corso', so.in_corso], ['Falliti', so.falliti_mese], ['In vendita', so.in_vendita_mese]];
  const canali = Object.entries(ven.reduce<Record<string, number>>((a, v) => { a[v.canale] = (a[v.canale] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...canali.map((c) => c[1]));
  const nFermi = dev.filter(fermo).length, nResi = dev.filter((d) => d.stato === 'Reso').length, l = lic?.[0]?.valore;
  const guarda: [string, string, string, boolean][] = [];
  if (nFermi) guarda.push([nFermi === 1 ? '1 PC fermo da oltre 60 giorni' : `${nFermi} PC fermi da oltre 60 giorni`, 'inv', 'Inventario', true]);
  if (nResi) guarda.push([nResi === 1 ? '1 reso aperto' : `${nResi} resi aperti`, 'ordini', 'Ordini', false]);
  if (ord.length) guarda.push([ord.length === 1 ? '1 ordine da spedire' : `${ord.length} ordini da spedire`, 'ordini', 'Ordini', false]);
  if (fall?.length) guarda.push([fall.length === 1 ? '1 postazione interrotta allo stage' : `${fall.length} postazioni interrotte allo stage`, 'stage', 'Stage Computer', true]);
  if (l && l.rimaste < 100) guarda.push([`Licenze Certus: chiavetta ${l.chiavetta} quasi finita`, 'stage', 'Stage Computer', false]);
  const sollecito = (ric ?? []).filter((r) => Date.now() - new Date(r.creata_il).getTime() > 4 * 3600_000).length;
  if (sollecito) guarda.push([sollecito === 1 ? '1 richiesta di un’azienda senza preventivo da più di 4 ore' : `${sollecito} richieste di aziende senza preventivo da più di 4 ore`, 'richieste', 'Richieste', true]);
  else if (ric?.length) guarda.push([ric.length === 1 ? '1 richiesta di un’azienda da preventivare' : `${ric.length} richieste di aziende da preventivare`, 'richieste', 'Richieste', false]);
  if (posta?.length) guarda.push([posta.length === 1 ? '1 mail da leggere' : `${posta.length} mail da leggere`, 'mail', 'Mail', false]);
  return (<>
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Dispositivi in magazzino</div><div className="big">{num(dev.length)}</div><div className="lbl">{num(inVendita)} in vendita</div></div>
      <div className="glass card"><div className="lbl">Venduti questo mese</div><div className="big">{num(ven.length)}</div><div className="lbl">online {num(ven.length - persona)} · di persona {num(persona)}</div></div>
      <div className="glass card"><div className="lbl">Ordini da spedire</div><div className="big">{num(ord.length)}</div><div className="lbl">{entro ? 'entro le ' + hm(entro) : 'nessuna scadenza'}</div></div>
      <div className="glass card"><div className="lbl">Incassato oggi</div><div className="big">{eur0(i.incassato_oggi)}</div><div className="lbl">al netto delle commissioni</div></div>
      <div className="glass card"><div className="lbl">Incassato {Mese().toLowerCase()}</div><div className="big">{eur0(i.incassato_mese)}</div><div className="lbl">al netto delle commissioni</div></div>
    </div>
    <div className="glass card stack">
      <div className="row between"><h3 style={{ fontSize: 18 }}>Stage</h3><div className="row" style={{ gap: 4 }}>{(['Oggi', 'Mese'] as const).map((x) => <Chip key={x} on={per === x} onClick={() => setPer(x)}>{x}</Chip>)}</div></div>
      <div className="grid g4">{stage.map(([n, v]) => <div key={n}><div className="lbl">{n}</div><div className="big" style={{ fontSize: 28, ...(n === 'Falliti' ? { color: 'var(--alert)' } : {}) }}>{num(v as number)}</div></div>)}</div>
    </div>
    <div className="grid g2">
      <div className="glass card"><h3 style={{ fontSize: 18, marginBottom: 6 }}>Da guardare oggi</h3><div className="list">
        {guarda.length ? guarda.map(([t, dove, p, red]) => <button key={t} type="button" className="li" onClick={() => vai(dove)}><span className="row between" style={{ width: '100%' }}><span>{t}</span><Pill tone={red ? 'red' : undefined}>{p}</Pill></span></button>)
          : <div className="lbl" style={{ padding: 14 }}>Niente da guardare.</div>}
      </div></div>
      <div className="glass card"><h3 style={{ fontSize: 18, marginBottom: 12 }}>Venduti per sito, {Mese().toLowerCase()}</h3><div className="stack" style={{ gap: 10 }}>
        {canali.length ? canali.map(([c, n]) => <div key={c} className="row" style={{ flexWrap: 'nowrap' }}><span style={{ width: 96, flex: 'none', fontSize: 14 }}>{c}</span><div className="bar" style={{ flex: 1 }}><i style={{ width: Math.round(n / max * 100) + '%' }} /></div><b style={{ width: 30, textAlign: 'right' }}>{n}</b></div>)
          : <div className="lbl">Nessuna vendita questo mese.</div>}
      </div></div>
    </div>
  </>);
}

// ------------------------------------------------------------------ Mail
function MailCorp({ onCerca }: { onCerca: (v: string) => void }) {
  const { db, vai } = useApp();
  const [fatto, setFatto] = useState<{ id: string; testo: string; dove: string; invia?: string; inviato?: boolean } | null>(null);
  const { dati: modelli } = useDati((d) => d.from<any>('device').select('modello'));
  const { dati: lotti } = useDati((d) => d.from<any>('lotti').select('id,codice'));
  const { dati: ieri } = useDati((d) => { const x = new Date(); x.setDate(x.getDate() - 1); const g = giornoLocale(x.toISOString());
    return d.from<any>('stage_pc').select('esito').gte('iniziato_il', g).lt('iniziato_il', oggiISO()); });
  const az = useAzione();
  const azione = (m: Mail) => {
    const tipo = m.etichetta ?? m.cartella;
    let label = 'Apri l’ordine', esegui: () => void = () => setFatto({ id: m.id, testo: 'Ordine aperto in Ordini.', dove: 'ordini' });
    if (tipo === 'Vendite' && !/ordine/i.test(m.oggetto)) {
      label = 'Apri l’annuncio';
      const mod = (modelli ?? []).map((x) => x.modello as string).find((x) => x && (m.oggetto + ' ' + (m.testo ?? '')).toLowerCase().includes(x.toLowerCase()));
      esegui = () => { if (mod) onCerca(mod); setFatto({ id: m.id, testo: mod ? `Annuncio ${mod} trovato in Inventario.` : 'Nessun computer in vendita con il modello della mail.', dove: 'inv' }); };
    } else if (tipo === 'Stage') {
      label = 'Allega il riepilogo di ieri';
      const f = (ieri ?? []).filter((x) => x.esito === 'Formattato' || x.esito === 'In vendita').length, k = (ieri ?? []).filter((x) => x.esito === 'Fallito').length;
      const testo = `Buongiorno, ecco il riepilogo di ieri: ${f} PC formattati, ${k} ${k === 1 ? 'interruzione' : 'interruzioni'} con report.`;
      esegui = () => setFatto({ id: m.id, testo: 'Riepilogo di ieri pronto: ' + testo.replace('Buongiorno, ecco il riepilogo di ieri: ', ''), dove: 'stage', invia: testo });
    } else if (tipo === 'Lotti') {
      label = 'Carica il DDT nel lotto';
      const cod = (m.oggetto + ' ' + (m.testo ?? '')).match(/L-\d+/)?.[0];
      const lotto = (lotti ?? []).find((x) => x.codice === cod);
      const all = m.allegati?.find((a) => /ddt/i.test(a.nome)) ?? m.allegati?.[0];
      esegui = () => {
        if (!lotto || !all) { setFatto({ id: m.id, testo: !lotto ? 'Nella mail non c’è il codice di un lotto conosciuto.' : 'La mail non ha allegati.', dove: 'lotti' }); return; }
        az.esegui(() => db.from('lotti').update({ ddt: all.percorso ?? `mail/${m.id}/${all.nome}` }).eq('id', lotto.id))
          .then((ok) => ok && setFatto({ id: m.id, testo: `DDT caricato nel lotto ${lotto.codice}.`, dove: 'lotti' }));
      };
    }
    const qui = fatto?.id === m.id ? fatto : null;
    const inviaRiep = () => az.esegui(() => db.fn('mail-outlook', { azione: 'rispondi', mail_id: m.id, testo: qui!.invia }))
      .then((ok) => ok && setFatto({ ...qui!, inviato: true, testo: 'Riepilogo inviato al cliente.' }));
    return {
      btn: <Btn onClick={esegui}>{label}</Btn>,
      msg: <>{az.errore && <Errore testo={az.errore} />}{qui && (qui.invia && !qui.inviato ? <Msg azione="Invia" onAzione={inviaRiep}>{qui.testo}</Msg>
        : <Msg azione="Vai alla pagina" onAzione={() => vai(qui.dove)}>{qui.testo}</Msg>)}</>,
    };
  };
  return <MailView azienda="corporation" cartelle={['In arrivo', 'Vendite', 'Lotti', 'Stage', 'Inviate']} azione={azione} />;
}

// ------------------------------------------------------------------ Lotti
function Lotti({ q }: { q: string }) {
  const { db, io } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const { dati: L } = useDati((d) => d.from<any>('lotti_conti').select('*').order('acquistato_il', { ascending: false }));
  const { dati: dev } = useDati((d) => d.from<any>('device').select('id,stato,caricato_il').neq('stato', 'Venduto'));
  const az = useAzione();
  if (!L || !dev) return null;
  const pezzi = L.reduce((a, l) => a + Number(l.pezzi), 0), costo = L.reduce((a, l) => a + Number(l.costo), 0);
  const cur = L.find((l) => l.id === sel) ?? L[0];
  const lista = L.filter((l) => has(q, l.codice));
  const carica = async (fs: FileList | null) => {
    if (!fs?.length || !cur) return;
    const nomi: string[] = [];
    const ok = await az.esegui(async () => {
      for (const f of Array.from(fs)) {
        const percorso = `lotti/${cur.id}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, '_')}`;
        await db.storage.carica('documenti', percorso, f);
        await db.from('lotti').update(/ddt/i.test(f.name) ? { ddt: percorso } : { fattura: percorso }).eq('id', cur.id);
        nomi.push(f.name);
      }
    });
    if (ok) setMsg(`${nomi.length === 1 ? 'Documento caricato' : 'Documenti caricati'} nel lotto ${cur.codice}: ${nomi.join(', ')}.`);
    if (file.current) file.current.value = '';
  };
  const acquisto = (d: string) => { const s = new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { month: 'short', year: 'numeric' }).replace('.', ''); return s[0].toUpperCase() + s.slice(1); };
  return (<>
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Costo medio reale per PC</div><div className="big">{eur0(pezzi ? costo / pezzi : 0)}</div><div className="lbl">calcolato su tutti i lotti</div></div>
      <div className="glass card"><div className="lbl">Lotti aperti</div><div className="big">{L.filter((l) => Number(l.venduti) < Number(l.pezzi)).length}</div></div>
      <div className="glass card"><div className="lbl">Fermi da oltre 60 giorni</div><div className="big">{dev.filter(fermo).length}</div><div className="lbl">conviene svendere</div></div>
    </div>
    <div className="glass tbox"><table className="t"><thead><tr><th>Lotto</th><th>Acquisto</th><th>Pezzi</th><th>Costo</th><th>Venduti</th><th>Incassato finora</th><th>Recuperato</th></tr></thead><tbody>
      {lista.length ? lista.map((r) => <tr key={r.id} className="click" onClick={() => setSel(r.id)} style={cur?.id === r.id ? { background: 'var(--soft)' } : undefined}>
        <td><b>{r.codice}</b></td><td>{acquisto(r.acquistato_il)}</td><td>{num(r.pezzi)}</td><td>{eur0(r.costo)}</td><td>{num(r.venduti)}</td><td><b>{eur0(r.incassato)}</b></td><td>{Math.round(Number(r.recuperato_pct))}%</td></tr>)
        : <tr><td colSpan={7} className="lbl">Nessun lotto.</td></tr>}
    </tbody></table></div>
    {msg && <Msg>{msg}</Msg>}
    <Errore testo={az.errore} />
    <input ref={file} type="file" multiple accept=".pdf,image/*,.xml,.xlsx,.csv" hidden onChange={(e) => carica(e.target.files)} />
    {io.ruolo !== 'commercialista' && <div className="row"><Btn onClick={() => file.current?.click()} disabled={az.inCorso || !cur}>Carica fattura d’acquisto e DDT</Btn><span className="lbl">Il programma confronta i seriali del DDT con l’archivio dei PC lavorati.{cur ? ` Lotto scelto: ${cur.codice}.` : ''}</span></div>}
  </>);
}

// ------------------------------------------------------------------ Inventario
function Inventario({ q }: { q: string }) {
  const { db, io } = useApp();
  const [s, set] = useStato({ vista: 'tabella', brand: 'Tutti', grado: 'Tutti', apri: '' as string });
  const { dati: D } = useDati((d) => d.from<any>('device').select('*,lotti(codice),bancali(codice,posti(codice))').order('caricato_il', { ascending: false }).limit(2000));
  if (!D) return null;
  const marche = ['Tutti', ...Array.from(new Set(['Lenovo', 'HP', 'Dell', 'Apple', ...D.map((d) => d.marca).filter(Boolean)]))];
  const list = D.filter((d) => (s.brand === 'Tutti' || d.marca === s.brand) && (s.grado === 'Tutti' || d.grado === s.grado)
    && has(q, d.seriale, d.modello, d.marca, d.lotti?.codice, d.bancali?.codice, d.bancali?.posti?.codice));
  const posto = (d: any) => d.bancali?.posti?.codice ?? (d.bancali ? 'Ricevimento' : '—');
  const filters = <div className="row">
    {marche.map((x) => <Chip key={x} on={s.brand === x} onClick={() => set({ brand: x })}>{x}</Chip>)}<span style={{ width: 8 }} />
    {['Tutti', 'A', 'B', 'C', 'D'].map((x) => <Chip key={x} on={s.grado === x} onClick={() => set({ grado: x })}>{x === 'Tutti' ? 'Tutti i gradi' : 'Grado ' + x}</Chip>)}
    <div className="row" style={{ marginLeft: 'auto', gap: 4, padding: 4, borderRadius: 999 }}>
      <Chip on={s.vista === 'schede'} onClick={() => set({ vista: 'schede' })}>Schede</Chip><Chip on={s.vista === 'tabella'} onClick={() => set({ vista: 'tabella' })}>Tabella</Chip></div>
  </div>;
  const empty = <div className="glass card lbl">Nessun computer con questi filtri.</div>;
  const aperto = D.find((d) => d.id === s.apri);
  return (<>
    {filters}
    {aperto && <Scheda d={aperto} onChiudi={() => set({ apri: '' })} io={io.id} db={db} />}
    {!list.length ? empty : s.vista === 'schede'
      ? <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>{list.map((d) => (
        <div key={d.id} className="glass card stack" style={{ gap: 8, cursor: 'pointer' }} onClick={() => set({ apri: d.id })}>
          <div className="ph">{LAPTOP}</div><div className="row between"><b>{d.modello}</b>{d.grado && <Pill tone="dark">{d.grado}</Pill>}</div>
          <div className="lbl">{[d.marca, d.cpu, d.gpu, d.ram, d.disco].filter(Boolean).join(' · ')}</div>
          <div className="lbl">Seriale {d.seriale} · {d.bancali?.codice ?? '—'} · {posto(d)}</div>
          <div className="row between"><span style={{ fontSize: 20, fontWeight: 800 }}>{d.prezzo != null ? eur0(d.prezzo) : '€ —'}</span><span className="lbl">{d.stato}</span></div>
          <div className="lbl">{d.siti?.join(', ') || '—'}</div>
        </div>))}</div>
      : <div className="glass tbox"><table className="t nw" style={{ minWidth: 1700 }}><thead><tr>{['Seriale', 'Marchio', 'Modello', 'Processore', 'Scheda video', 'RAM', 'Disco', 'Schermo', 'Grado', 'Difetti', 'Lotto', 'Bancale', 'Posto', 'Costo', 'Prezzo', 'Stato', 'Siti', 'Giorni'].map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>
        {list.map((d) => <tr key={d.id} className="click" onClick={() => set({ apri: d.id })} style={s.apri === d.id ? { background: 'var(--soft)' } : undefined}>
          <td>{d.seriale}</td><td>{d.marca}</td><td><b>{d.modello}</b></td><td>{d.cpu}</td><td>{d.gpu}</td><td>{d.ram}</td><td>{d.disco}</td><td>{d.schermo}</td>
          <td>{d.grado && <Pill tone="dark">{d.grado}</Pill>}</td><td className="lbl">{d.difetti?.join(', ') || '—'}</td><td>{d.lotti?.codice ?? '—'}</td><td>{d.bancali?.codice ?? '—'}</td><td>{posto(d)}</td>
          <td>{d.costo != null ? eur0(d.costo) : '—'}</td><td><b>{d.prezzo != null ? eur0(d.prezzo) : '—'}</b></td><td>{statoPill(d.stato)}</td><td className="lbl">{d.siti?.join(', ') || '—'}</td><td>{giorniDa(d.caricato_il)}</td></tr>)}
      </tbody></table></div>}
  </>);
}

const SITI = ['Back Market', 'Refurbed', 'eBay', 'Subito', 'Amazon', 'Sito'];
/** scheda di un computer: grado, prezzo e siti si cambiano qui (le regole le fa il database) */
function Scheda({ d, onChiudi, io, db }: { d: any; onChiudi: () => void; io: string; db: any }) {
  const [g, setG] = useState<string>(d.grado ?? 'B');
  const [p, setP] = useState<string>(d.prezzo != null ? String(d.prezzo) : '');
  const [siti, setSiti] = useState<string[]>(d.siti ?? []);
  const [ok, setOk] = useState(false);
  const az = useAzione();
  const salva = () => az.esegui(() => db.from('device').update({ grado: g, prezzo: p === '' ? null : Number(p.replace(',', '.')), siti, ...(Number(p) !== Number(d.prezzo) ? { prezzo_confermato_da: io } : {}) }).eq('id', d.id))
    .then((x: boolean) => x && setOk(true));
  const venduto = d.stato === 'Venduto';
  return (
    <div className="glass card stack">
      <div className="row between"><h3 style={{ fontSize: 20 }}>{d.marca} {d.modello}</h3><span className="lbl">Seriale {d.seriale}</span></div>
      <div className="row"><b style={{ width: 70 }}>Grado</b>{['A', 'B', 'C', 'D'].map((x) => <Chip key={x} on={g === x} onClick={() => !venduto && setG(x)}>{x}</Chip>)}</div>
      <label className="row"><b style={{ width: 70 }}>Prezzo</b><input className="input" style={{ maxWidth: 160 }} inputMode="decimal" value={p} disabled={venduto} onChange={(e) => setP(e.target.value)} /></label>
      <div className="row"><b style={{ width: 70 }}>Siti</b>{SITI.map((x) => <Chip key={x} on={siti.includes(x)} onClick={() => !venduto && setSiti(siti.includes(x) ? siti.filter((y) => y !== x) : [...siti, x])}>{x}</Chip>)}</div>
      {ok && <Msg>Salvato: il prezzo e i siti sono aggiornati ovunque.</Msg>}
      <Errore testo={az.errore} />
      <div className="row">{!venduto && <Btn onClick={salva} disabled={az.inCorso}>Salva</Btn>}<Btn ghost onClick={onChiudi}>Chiudi</Btn></div>
    </div>
  );
}

// ------------------------------------------------------------------ Ricambi
// Pezzi smontati dai computer che non si vendono interi: ogni ricambio resta legato al computer e al lotto da cui viene,
// e quello che incassa conta nel recupero del lotto (vista lotti_conti). Le regole le fa il database (trigger ricambi_regole).
const TIPI_RICAMBIO = ['Display', 'Tastiera', 'Batteria', 'Scheda madre', 'Disco', 'Memoria', 'Scocca', 'Alimentatore', 'Altro'];
function Ricambi({ q }: { q: string }) {
  const { db } = useApp();
  const az = useAzione();
  const [s, set] = useStato({ nuovo: false, seriale: '', tipo: 'Display', descrizione: '', prezzo: '', vendi: '' as string, canale: 'eBay', venduto: '', msg: '' });
  const { dati } = useDati(async (d) => {
    const [R, smontati] = await Promise.all([
      d.from<any>('ricambi').select('*,device(seriale,marca,modello),lotti(codice)').order('creato_il', { ascending: false }),
      d.from<any>('device').select('id').eq('stato', 'Smontato'),
    ]);
    return { R, smontati };
  }, []);
  if (!dati) return null;
  const { R } = dati;
  const meseOra = meseISO();
  const lista = R.filter((r) => has(q, r.descrizione, r.tipo, r.device?.seriale, r.device?.modello, r.lotti?.codice));
  const vendutiMese = R.filter((r) => r.stato === 'Venduto' && String(r.venduto_il ?? '').startsWith(meseOra)).reduce((a, r) => a + Number(r.incassato ?? 0), 0);
  const prezzo = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const smonta = () => az.esegui(async () => {
    const [d] = await db.from<any>('device').select('id').eq('seriale', s.seriale.trim());
    if (!d) throw new Error('Nessun computer con il seriale ' + s.seriale.trim());
    await db.from('ricambi').insert({ device_id: d.id, tipo: s.tipo, descrizione: s.descrizione.trim() || s.tipo, prezzo: prezzo(s.prezzo) });
  }).then((ok: boolean) => ok && set({ nuovo: false, seriale: '', descrizione: '', prezzo: '', msg: 'Ricambio registrato: il computer risulta smontato e non si vende più intero.' }));
  const inVendita = (r: any) => az.esegui(() => db.from('ricambi').update({ stato: 'Disponibile', siti: ['Sito', 'eBay'] }).eq('id', r.id))
    .then((ok: boolean) => ok && set({ msg: `${r.descrizione}: in vendita sul sito ed eBay.` }));
  const vendi = (r: any) => az.esegui(() => db.from('ricambi').update({ stato: 'Venduto', canale: s.canale, venduto_prezzo: prezzo(s.venduto) ?? Number(r.prezzo) }).eq('id', r.id))
    .then((ok: boolean) => ok && set({ vendi: '', venduto: '', msg: `${r.descrizione}: venduto, l’incasso entra nel recupero del lotto ${r.lotti?.codice ?? ''}.` }));
  const statoR = (x: string) => x === 'Venduto' ? <Pill tone="ok">Venduto</Pill> : x === 'Scartato' ? <Pill tone="red">Scartato</Pill> : <Pill tone="dark">{x}</Pill>;
  return (<>
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Ricambi a magazzino</div><div className="big">{num(R.filter((r) => r.stato === 'Disponibile' || r.stato === 'Da vendere').length)}</div></div>
      <div className="glass card"><div className="lbl">Venduti a {Mese().toLowerCase()}</div><div className="big">{eur0(vendutiMese)}</div><div className="lbl">già nel recupero dei lotti</div></div>
      <div className="glass card"><div className="lbl">Computer smontati</div><div className="big">{num(dati.smontati.length)}</div><div className="lbl">non si vendono più interi</div></div>
    </div>
    {s.msg && <Msg>{s.msg}</Msg>}
    <Errore testo={az.errore} />
    {s.nuovo ? (
      <div className="glass card stack">
        <b>Smonta un computer</b>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field"><span className="lbl">Seriale del computer</span><input className="input" value={s.seriale} onChange={(e) => set({ seriale: e.target.value })} /></label>
          <label className="field"><span className="lbl">Tipo</span><select className="input" value={s.tipo} onChange={(e) => set({ tipo: e.target.value })}>{TIPI_RICAMBIO.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="field"><span className="lbl">Descrizione</span><input className="input" value={s.descrizione} onChange={(e) => set({ descrizione: e.target.value })} /></label>
          <label className="field"><span className="lbl">Prezzo</span><input className="input" style={{ maxWidth: 120 }} inputMode="decimal" value={s.prezzo} onChange={(e) => set({ prezzo: e.target.value })} /></label>
        </div>
        <div className="row"><Btn onClick={smonta} disabled={az.inCorso || !s.seriale.trim()}>Registra</Btn><Btn ghost onClick={() => set({ nuovo: false })}>Annulla</Btn></div>
      </div>) : <div className="row"><Btn onClick={() => set({ nuovo: true, msg: '' })}>Smonta un computer</Btn></div>}
    <div className="glass tbox"><table className="t nw"><thead><tr><th>Ricambio</th><th>Da</th><th>Seriale del computer</th><th>Lotto</th><th>Prezzo</th><th>Stato</th><th /></tr></thead><tbody>
      {lista.length ? lista.map((r) => <tr key={r.id}>
        <td><b>{r.descrizione}</b></td><td>{r.device?.modello ?? '—'}</td><td>{r.device?.seriale ?? '—'}</td><td>{r.lotti?.codice ?? '—'}</td>
        <td>{r.prezzo != null ? '€ ' + num(Number(r.prezzo)) : '—'}</td><td>{statoR(r.stato)}</td>
        <td>{r.stato === 'Da vendere' ? <Btn ghost sm onClick={() => inVendita(r)} disabled={az.inCorso}>Metti in vendita</Btn>
          : r.stato === 'Disponibile' ? (s.vendi === r.id
            ? <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><select className="input" value={s.canale} onChange={(e) => set({ canale: e.target.value })}>{['eBay', 'Sito', 'Subito', 'Di persona'].map((c) => <option key={c}>{c}</option>)}</select>
              <input className="input" style={{ maxWidth: 90 }} inputMode="decimal" placeholder={String(r.prezzo)} value={s.venduto} onChange={(e) => set({ venduto: e.target.value })} /><Btn sm onClick={() => vendi(r)} disabled={az.inCorso}>Conferma</Btn></span>
            : <Btn ghost sm onClick={() => set({ vendi: r.id, venduto: '' })}>Venduto</Btn>) : null}</td></tr>)
        : <tr><td colSpan={7} className="lbl">Nessun ricambio.</td></tr>}
    </tbody></table></div>
    <p className="lbl" style={{ margin: 0 }}>Prima di smontare, il disco passa dalla cancellazione certificata come tutto il resto: un disco non si vende mai senza rapporto.</p>
  </>);
}

// ------------------------------------------------------------------ Ordini
function Ordini({ q }: { q: string }) {
  const { db } = useApp();
  const [msg, setMsg] = useState('');
  const { dati: O } = useDati((d) => d.from<any>('ordini').select('*,device(marca,modello,grado,seriale,bancali(codice,posti(codice)))').order('creato_il', { ascending: false }).limit(300));
  const az = useAzione();
  if (!O) return null;
  const etichetta = (o: any) => az.esegui(async () => {
    const r = await db.fn<{ url?: string | null }>('etichetta-spedizione', { ordine_id: o.id });
    if (r?.url) window.open(r.url, '_blank', 'noopener');
    setMsg(`Etichetta di spedizione pronta per ${o.device?.modello ?? o.riferimento}${o.device?.bancali?.posti?.codice ? `: il PC è nel posto ${o.device.bancali.posti.codice}` : ''}.`);
  });
  const lista = O.filter((o) => has(q, o.riferimento, o.canale, o.device?.modello, o.device?.seriale, o.cliente));
  return (<>
    <p className="lbl" style={{ margin: 0 }}>Un solo inventario: quando un computer si vende su un sito, sparisce subito dagli altri.</p>
    {msg && <Msg>{msg}</Msg>}
    <Errore testo={az.errore} />
    <div className="glass tbox"><table className="t" style={{ minWidth: 900 }}><thead><tr><th>Ora</th><th>Sito</th><th>Marchio</th><th>Modello</th><th>Grado</th><th>Seriale</th><th>Posto</th><th>Stato</th><th /></tr></thead><tbody>
      {lista.length ? lista.map((o) => <tr key={o.id}>
        <td>{quandoOrdine(o.creato_il)}</td><td>{o.canale}</td><td>{o.device?.marca ?? '—'}</td><td><b>{o.device?.modello ?? '—'}</b></td><td>{o.device?.grado && <Pill tone="dark">{o.device.grado}</Pill>}</td>
        <td>{o.device?.seriale ?? '—'}</td><td>{o.device?.bancali?.posti?.codice ?? '—'}</td>
        <td>{o.stato === 'Da preparare' ? <Pill>{o.stato}</Pill> : o.stato === 'Annullato' ? <Pill tone="red">{o.stato}</Pill> : <Pill tone="dark">{o.stato}</Pill>}</td>
        <td>{o.stato === 'Da preparare' && <Btn ghost sm disabled={az.inCorso} onClick={() => etichetta(o)}>Etichetta spedizione</Btn>}</td></tr>)
        : <tr><td colSpan={9} className="lbl">Nessun ordine.</td></tr>}
    </tbody></table></div>
  </>);
}

// ------------------------------------------------------------------ Stage Computer
const BANCO_TXT: Record<string, string> = { fin: 'Cancellazione finita, report pronto', run: 'Cancellazione in corso', free: 'Postazione libera', err: 'Cancellazione interrotta: report dell’interruzione pronto per il cliente' };
function Stage() {
  const { db, vai } = useApp();
  const [sel, setSel] = useState<number | null>(null);
  const [lic, setLic] = useState(false);
  const { dati: P } = useDati((d) => d.from<any>('stage_pc').select('postazione,esito,seriale,errore,iniziato_il').gte('iniziato_il', oggiISO()).order('iniziato_il', { ascending: true }));
  const { dati: st } = useDati((d) => d.from<any>('stage_oggi').select('*'));
  const { dati: imp } = useDati((d) => d.from<any>('impostazioni').select('valore').eq('chiave', 'licenze_certus'));
  const az = useAzione();
  if (!P) return null;
  const banco: Record<number, any> = {}; for (const r of P) if (r.postazione) banco[r.postazione] = r;  // l'ultima di oggi per postazione
  const stato = (i: number) => { const e = banco[i]?.esito; return e === 'Fallito' ? 'err' : e === 'In corso' ? 'run' : e === 'Formattato' || e === 'In vendita' ? 'fin' : 'free'; };
  const so = st?.[0] ?? {}, l = imp?.[0]?.valore;
  const invia = () => az.esegui(() => db.fn('mail-outlook', { azione: 'scrivi', azienda: 'corporation', a: l.fornitore, oggetto: 'Richiesta licenze Certus',
    testo: `Buongiorno,\nsulla chiavetta ${l.chiavetta} restano ${l.rimaste} licenze: ci mandate un nuovo pacchetto?\nGrazie` })).then((ok) => ok && setLic(true));
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
      <div className="glass card" style={{ flex: '2 1 440px', minWidth: 0 }}>
        <div className="row between"><b>Banco · 60 postazioni</b><span className="lbl">aggiornato in tempo reale</span></div>
        <div className="row" style={{ margin: '10px 0 14px', fontSize: 13, gap: 14 }}>
          <span className="row" style={{ gap: 6 }}><span className="sq" style={{ background: 'var(--solid)' }} />Finito</span>
          <span className="row" style={{ gap: 6 }}><span className="sq" style={{ background: 'var(--muted)' }} />In cancellazione</span>
          <span className="row" style={{ gap: 6 }}><span className="sq" style={{ boxShadow: 'inset 0 0 0 1px var(--line)', background: 'var(--glass-strong)' }} />Libero</span>
          <span className="row" style={{ gap: 6 }}><span className="sq" style={{ boxShadow: 'inset 0 0 0 2px var(--alert)', background: 'var(--alert-soft)' }} />Interrotto</span>
        </div>
        <div className="banchi">{Array.from({ length: 60 }, (_, k) => k + 1).map((i) => <button key={i} type="button" className={'banco ' + stato(i)} aria-label={'Postazione ' + i} onClick={() => setSel(i)}>{i}</button>)}</div>
        {sel && <div style={{ marginTop: 14 }}><Msg>{`Postazione ${sel}: ${BANCO_TXT[stato(sel)]}.${banco[sel]?.seriale ? ` Seriale ${banco[sel].seriale}.` : ''}`}</Msg></div>}
      </div>
      <div className="stack" style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div className="glass card"><div className="lbl">Oggi</div><div style={{ marginTop: 6, lineHeight: 1.9 }}>Ricevuti <b>{num(so.ricevuti)}</b> · Formattati <b>{num(so.formattati)}</b> · Interrotti <b>{num(so.falliti)}</b></div>
          <div style={{ marginTop: 10 }}><Btn ghost onClick={() => vai('mail')}>Riscontro giornaliero a Econocom</Btn></div></div>
        <div className="glass card"><div className="lbl">Licenze Certus</div>
          {l ? <div style={{ marginTop: 6 }}>Chiavetta {l.chiavetta}: <b className={l.rimaste < 100 ? 'miss' : undefined}>{num(l.rimaste)} licenze rimaste</b></div> : <div style={{ marginTop: 6 }} className="lbl">Da impostare</div>}
          <Errore testo={az.errore} />
          {lic ? <div style={{ marginTop: 10 }}><Msg>Mail di richiesta licenze inviata.</Msg></div> : l && <div style={{ marginTop: 12 }}><Btn onClick={invia} disabled={az.inCorso}>Invia la mail già pronta</Btn></div>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Stage Cellulari
function StageTel({ q }: { q: string }) {
  const { db, io } = useApp();
  const [f, setF] = useState('Tutti');
  const { dati: T } = useDati((d) => d.from<any>('stage_telefoni').select('*,clienti(nome),profili(nome)').order('ricevuto_il', { ascending: false }).limit(1000));
  const az = useAzione();
  if (!T) return null;
  const cnt = (st: string) => T.filter((x) => x.stato === st).length;
  const segna = (x: any, campo: string) => az.esegui(() => db.from('stage_telefoni').update({ [campo]: true, operatore: io.id }).eq('id', x.id));
  const list = T.filter((x) => (f === 'Tutti' || x.stato === f) && has(q, x.imei, x.modello, x.marca, x.ticket, x.clienti?.nome));
  return (<>
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Ricevuti oggi</div><div className="big">{T.filter((x) => giornoLocale(x.ricevuto_il) === oggiISO()).length}</div></div>
      <div className="glass card"><div className="lbl">Reset</div><div className="big">{cnt('Reset')}</div><div className="lbl">da resettare</div></div>
      <div className="glass card"><div className="lbl">Sblocco</div><div className="big">{cnt('Sblocco')}</div><div className="lbl">account iCloud/Google e MDM da togliere</div></div>
      <div className="glass card"><div className="lbl">Ticket</div><div className="big">{cnt('Ticket')}</div><div className="lbl">da chiudere sul portale</div></div>
      <div className="glass card"><div className="lbl">Chiuso</div><div className="big">{cnt('Chiuso')}</div><div className="lbl">pronti da riconsegnare</div></div>
    </div>
    <div className="row">{['Tutti', 'Reset', 'Sblocco', 'Ticket', 'Chiuso'].map((x) => <Chip key={x} on={f === x} onClick={() => setF(x)}>{x}</Chip>)}</div>
    <Errore testo={az.errore} />
    <div className="glass tbox"><table className="t" style={{ minWidth: 1000 }}><thead><tr><th>IMEI</th><th>Marchio</th><th>Modello</th><th>Cliente</th><th>Ticket</th><th>Reset</th><th>Sblocco</th><th>Operatore</th><th>Stato</th></tr></thead><tbody>
      {list.length ? list.map((x) => <tr key={x.id}>
        <td>{x.imei}</td><td>{x.marca}</td><td><b>{x.modello}</b></td><td>{x.clienti?.nome ?? '—'}</td>
        <td>{x.stato === 'Ticket' ? <Btn ghost sm disabled={az.inCorso} label="Chiudi il ticket" onClick={() => segna(x, 'ticket_chiuso')}>Chiudi</Btn> : x.ticket ?? '—'}</td>
        <td>{x.reset_fatto ? 'Fatto' : <Btn ghost sm disabled={az.inCorso} label="Segna reset fatto" onClick={() => segna(x, 'reset_fatto')}>Fatto</Btn>}</td>
        <td>{x.sblocco_fatto ? 'Fatta' : x.reset_fatto ? <Btn ghost sm disabled={az.inCorso} label="Segna sblocco fatto" onClick={() => segna(x, 'sblocco_fatto')}>Fatta</Btn> : 'Da fare'}</td>
        <td>{x.profili?.nome ?? '—'}</td>
        <td>{x.stato === 'Chiuso' ? <Pill tone="dark">Chiuso</Pill> : x.stato === 'Ticket' ? <Pill tone="red">{x.stato}</Pill> : <Pill>{x.stato}</Pill>}</td></tr>)
        : <tr><td colSpan={9} className="lbl">Nessun telefono.</td></tr>}
    </tbody></table></div>
    <p className="lbl" style={{ margin: 0 }}>I ticket arrivano dal portale del cliente; lo sblocco (account iCloud/Google e MDM) si fa sul loro sistema Habble.</p>
  </>);
}
