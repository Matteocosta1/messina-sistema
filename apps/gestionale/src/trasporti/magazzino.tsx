import React, { useEffect, useState } from 'react';
import { Btn, Chip, Msg, Pill, Warn, Badge } from '@messina/ui';
import { useApp, useAzione, useDati, useStato, hm, quando, num, oggiISO, Errore } from '../core';

// sotto-schede del mockup; «Asset» esiste nel codice ma non nel mockup: si apre solo da link (Cerca), vedi STATO «Da decidere»
const TABS: [string, string][] = [['pianta', 'Pianta'], ['controllo', 'Controllo'], ['mov', 'Movimenti'], ['missioni', 'Missioni'], ['storico', 'Storico']];
const NASCOSTE = ['asset'];
const pad = (n: number) => String(n).padStart(2, '0');

export function Magazzino({ tab }: { tab?: string }) {
  const { vai } = useApp();
  const [tab0, scelto] = (tab ?? '').split(':');
  const t = TABS.some(([k]) => k === tab0) || NASCOSTE.includes(tab0) ? tab0 : 'pianta';
  const [cli, setCli] = useState('Tutti');
  const { dati } = useDati(async (d) => {
    const [cc, clienti] = await Promise.all([
      d.from<any>('controllo_colli').select('*'),
      d.from<any>('bancali').select('clienti(nome)').is('uscito_il', null),
    ]);
    const st = await d.from<any>('storico').select('chi_nome,cosa,operazione,quando').eq('azienda', 'trasporti').in('operazione', ['Entrata', 'Uscita']).order('quando', { ascending: false }).limit(300);
    return { cc, st, nomi: [...new Set(clienti.map((b) => b.clienti?.nome).filter(Boolean))].sort() as string[] };
  }, []);
  if (!dati) return null;
  const ko = dati.cc.filter((r) => r.letti !== r.attesi && r.letti > 0).length;
  return (<>
    <div className="row">{TABS.map(([k, l]) => <Chip key={k} on={t === k} onClick={() => vai('magazzino/' + k)}>{l}{k === 'controllo' && <Badge n={ko} />}</Chip>)}</div>
    <div className="row">{['Tutti', ...dati.nomi].map((x) => <Chip key={x} on={cli === x} onClick={() => setCli(x)}>{x}</Chip>)}</div>
    {t === 'pianta' && <Pianta cli={cli} />}
    {t === 'controllo' && <Controllo cc={dati.cc} cli={cli} st={dati.st} />}
    {t === 'mov' && <Movimenti cli={cli} />}
    {t === 'missioni' && <Missioni />}
    {t === 'asset' && <Asset cli={cli} imei={scelto} />}
    {t === 'storico' && <Storico cc={dati.cc} />}
  </>);
}

// ------------------------------------------------------------------ Pianta e Articoli
function Pianta({ cli }: { cli: string }) {
  const [s, set] = useStato({ scaf: 0, posto: '' });
  const { dati } = useDati(async (d) => {
    const [posti, bancali] = await Promise.all([
      d.from<any>('posti').select('*').eq('attivo', true),
      d.from<any>('bancali').select('id,codice,posto_id,creato_il,cliente_id,clienti(nome),contenuto(articolo,quantita)').is('uscito_il', null),
    ]);
    return { posti, bancali };
  }, []);
  if (!dati) return null;
  const sc = dati.posti.filter((p) => p.zona === 'Scaffale');
  const numeri = [...new Set(sc.map((p) => p.scaffale))].sort((a, b) => a - b);
  const sel = s.scaf || numeri[0];
  const inPosto = (id: string) => dati.bancali.filter((b) => b.posto_id === id);
  const prevalente = (n: number) => { const c: Record<string, number> = {};
    sc.filter((p) => p.scaffale === n).forEach((p) => inPosto(p.id).forEach((b) => { c[b.clienti?.nome] = (c[b.clienti?.nome] ?? 0) + 1; }));
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Libero'; };
  const piani = Math.max(...sc.map((p) => p.piano ?? 1), 1), posti = Math.max(...sc.map((p) => p.numero ?? 1), 1);
  const match = (b: any) => cli === 'Tutti' || b.clienti?.nome === cli;
  const terra = dati.posti.filter((p) => p.zona !== 'Scaffale');
  const zone = [...new Set(terra.map((p) => p.zona))];
  const righe = sc.filter((p) => p.scaffale === sel).sort((a, b) => b.piano - a.piano || a.numero - b.numero);
  // Articoli: quantità e tipo di tutto quello che c'è nel posto (es. «10 iPhone, 10 iPad»); Arrivo: data completa del primo bancale entrato
  const articoli = (b: any[]) => { const q = new Map<string, number>();
    b.forEach((x) => (x.contenuto ?? []).forEach((c: any) => q.set(c.articolo, (q.get(c.articolo) ?? 0) + Number(c.quantita ?? 0))));
    return q.size ? [...q].map(([a, n]) => `${num(n)} ${a}`).join(', ') : b.map((x) => 'Bancale ' + x.codice).join(', '); };
  const arrivo = (b: any[]) => new Date(b.map((x) => x.creato_il).sort()[0]).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const pianta = (
    <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
      <div className="glass card" style={{ flex: '1 1 420px', minWidth: 0 }}>
        <div className="row between"><b>Pianta del capannone</b><span className="lbl">{numeri.length} scaffali · {piani} piani · {posti} posti</span></div>
        <div className="scaf" style={{ marginTop: 12 }}>{numeri.map((n) => (
          <button key={n} type="button" className={'sc' + (sel === n ? ' on' : '')} onClick={() => set({ scaf: n, posto: '' })} aria-label={'Scaffale ' + n}>
            <span>S{pad(n)}</span>
            <span className="lv">{Array.from({ length: piani }, (_, i) => piani - i).map((pi) => <span key={pi}>{Array.from({ length: posti }, (_, j) => j + 1).map((po) => {
              const p = sc.find((x) => x.scaffale === n && x.piano === pi && x.numero === po); const b = p ? inPosto(p.id) : [];
              return <i key={po} className={b.length ? (b.some(match) ? 'f' : 'dim') : ''} />; })}</span>)}</span>
            <span className="lbl" style={{ fontSize: 11 }}>{prevalente(n)}</span>
          </button>))}</div>
        <div className="lbl" style={{ margin: '14px 0 8px' }}>Zone a terra</div>
        <div className="zone">{zone.length ? zone.map((z) => { const n = terra.filter((p) => p.zona === z).reduce((a, p) => a + inPosto(p.id).length, 0);
          return <div key={z}><b>{z}</b><br />{n === 1 ? '1 bancale' : n + ' bancali'}</div>; }) : <div>Nessuna zona a terra registrata.</div>}</div>
      </div>
      <div className="glass" style={{ flex: '1 1 380px', minWidth: 0 }}><div style={{ padding: '14px 14px 0', fontWeight: 700 }}>Scaffale S{pad(sel)} · {prevalente(sel)}</div>
        <div className="tbox"><table className="t"><thead><tr><th>Posto</th><th>Piano</th><th>Cliente</th><th>Articoli</th><th>Arrivo</th></tr></thead><tbody>
          {righe.map((p) => { const b = inPosto(p.id); const full = b.length > 0;
            return <tr key={p.id} className={full ? 'click' : undefined} onClick={full ? () => set({ posto: p.id }) : undefined} style={s.posto === p.id ? { background: 'var(--soft)' } : undefined}>
              <td><b>{p.codice}</b></td><td>Piano {p.piano}</td><td>{full ? b[0].clienti?.nome : <span className="lbl">Libero</span>}</td>
              <td>{full ? articoli(b) : '—'}</td><td>{full ? arrivo(b) : '—'}</td></tr>; })}
        </tbody></table></div></div>
    </div>);
  if (!s.posto) return <><p className="lbl" style={{ margin: 0 }}>Tocca un posto pieno nella tabella per vedere il suo contenuto.</p>{pianta}</>;
  const p = dati.posti.find((x) => x.id === s.posto)!;
  return <><Contenuto posto={p} bancali={inPosto(p.id)} />{pianta}</>;
}

function Contenuto({ posto, bancali }: { posto: any; bancali: any[] }) {
  const { db, io } = useApp();
  const az = useAzione();
  const [pistola, setPistola] = useState(false);
  const [mano, setMano] = useState<Record<string, string> | null>(null);
  const [codice, setCodice] = useState('');
  const { dati: righe } = useDati((d) => d.from<any>('contenuto').select('*,profili(nome)').in('bancale_id', bancali.map((b) => b.id)).order('il'), [bancali.map((b) => b.id).join()]);
  if (!righe) return null;
  const leggi = () => { const c = codice.trim(); if (!c) return; setCodice('');
    if (righe.some((r) => r.codici?.includes(c))) return;
    az.esegui(() => db.from('contenuto').insert({ bancale_id: bancali[0].id, articolo: 'Articolo letto con la pistola', quantita: 1, codici: [c], inserito: 'Pistola', da: io.id })); };
  const salvaMano = () => az.esegui(async () => {
    for (const r of righe) { const v = mano?.[r.id]; if (v !== undefined && Number(v) !== r.quantita) await db.from('contenuto').update({ quantita: Number(v), inserito: 'Manuale', da: io.id }).eq('id', r.id); }
  }).then((ok) => ok && setMano(null));
  const codici = (c: string[]) => !c?.length ? '—' : c.length <= 2 ? c.join(', ') : `${c.slice(0, 2).join(', ')} +${c.length - 2}`;
  return (
    <div className="glass card stack">
      <div className="row between"><h3 style={{ fontSize: 20 }}>Articoli · {posto.codice}</h3><span className="lbl">{bancali[0]?.clienti?.nome} · {bancali.map((b) => b.codice).join(', ')}</span></div>
      <div className="tbox"><table className="t nw"><thead><tr><th>Articolo</th><th>Quantità</th><th>Codici</th><th>Inserito</th><th>Chi</th><th>Ora</th></tr></thead><tbody>
        {righe.map((x) => <tr key={x.id} className={x.inserito === 'Manuale' ? 'korow' : ''}><td><b>{x.articolo}</b></td>
          <td>{mano ? <input className="input" type="number" min={0} style={{ width: 90, minHeight: 34, padding: '4px 8px' }} value={mano[x.id] ?? x.quantita} onChange={(e) => setMano({ ...mano, [x.id]: e.target.value })} aria-label={'Quantità ' + x.articolo} /> : x.quantita}</td>
          <td>{codici(x.codici)}</td><td>{x.inserito}</td><td>{x.profili?.nome ?? '—'}</td><td>{quando(x.il)}</td></tr>)}
        {!righe.length && <tr><td colSpan={6} className="lbl">Bancale vuoto.</td></tr>}
      </tbody></table></div>
      {pistola && <label className="field"><span className="lbl">Spara il codice con la pistola (o scrivilo e premi Invio)</span>
        <input className="input" autoFocus value={codice} onChange={(e) => setCodice(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); leggi(); } }} /></label>}
      <Errore testo={az.errore} />
      <div className="row">
        {mano ? <><Btn onClick={salvaMano} disabled={az.inCorso}>Salva</Btn><Btn ghost onClick={() => setMano(null)}>Annulla</Btn></>
          : <><Btn onClick={() => setPistola(!pistola)}>{pistola ? 'Chiudi' : 'Aggiungi con la pistola'}</Btn><Btn ghost onClick={() => { setMano({}); setPistola(false); }}>Modifica a mano</Btn></>}
        <span className="lbl">Ogni modifica finisce nello Storico con chi l’ha fatta e quando. Quelle a mano sono in rosso.</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Controllo
function Controllo({ cc, cli, st }: { cc: any[]; cli: string; st: any[] }) {
  // «Chi» del mockup: l'ultima persona che ha letto i colli di quel cliente in quel verso (dallo Storico)
  const chi = (r: any) => st.find((x) => String(x.cosa).startsWith(r.cliente) && x.operazione === (r.tipo === 'Magazzino' || r.tipo === 'Ritiro' ? 'Entrata' : 'Uscita'))?.chi_nome ?? '—';
  const list = cc.filter((r) => cli === 'Tutti' || r.cliente === cli).sort((a, b) => (b.ultima_lettura ?? '').localeCompare(a.ultima_lettura ?? ''));
  const ko = cc.filter((r) => r.letti !== r.attesi && r.letti > 0).length;
  const entrata = (r: any) => r.tipo === 'Magazzino' || r.tipo === 'Ritiro';
  const esito = (r: any) => r.letti === r.attesi ? 'Torna' : r.letti === 0 ? 'Da scansionare'
    : entrata(r) ? `Manca${r.attesi - r.letti === 1 ? ' 1 collo' : 'no ' + (r.attesi - r.letti) + ' colli'} rispetto alla bolla: da ricontare in ricevimento`
    : `Manca${r.attesi - r.letti === 1 ? ' 1 collo' : 'no ' + (r.attesi - r.letti) + ' colli'}: spedizione ferma, non parte`;
  return (<>
    {ko ? <Warn n={ko}>Colli</Warn> : <Msg>Tutto torna.</Msg>}
    <div className="glass tbox"><table className="t" style={{ minWidth: 820 }}><thead><tr><th>Ora</th><th>Bolla</th><th>Cliente</th><th>Movimento</th><th>Colli in bolla</th><th>Scansionati</th><th>Chi</th><th>Esito</th></tr></thead><tbody>
      {list.map((r) => { const ok = r.letti === r.attesi; return <tr key={r.bolla_id} className={ok ? 'okrow' : r.letti ? 'korow' : ''}>
        <td>{hm(r.ultima_lettura)}</td><td>{r.numero ?? '—'}</td><td><b>{r.cliente}</b></td><td>{entrata(r) ? 'Entrata' : 'Uscita'}</td>
        <td>{num(r.attesi)}</td><td>{num(r.letti)}</td><td>{r.letti ? chi(r) : '—'}</td><td>{esito(r)}</td></tr>; })}
      {!list.length && <tr><td colSpan={8} className="lbl">Nessuna spedizione in movimento.</td></tr>}
    </tbody></table></div>
    <p className="lbl" style={{ margin: 0 }}>Una spedizione con un collo non scansionato non può partire: il mezzo resta fermo finché i numeri non tornano.</p>
  </>);
}

// ------------------------------------------------------------------ Movimenti
function Movimenti({ cli }: { cli: string }) {
  const { dati: tutto } = useDati(async (d) => {
    const [mov, clienti] = await Promise.all([
      d.from<any>('storico').select('*').eq('azienda', 'trasporti').in('operazione', ['Entrata', 'Uscita', 'Trasferimento']).order('quando', { ascending: false }).limit(300),
      d.from<any>('clienti').select('id,nome'),
    ]);
    return { mov, nomi: Object.fromEntries(clienti.map((c) => [c.id, c.nome])) as Record<string, string> };
  }, []);
  if (!tutto) return null;
  const dati = tutto.mov;
  // il cliente lo scrive il database nello storico (dettagli.cliente_id, trigger storico_capannone); i testi vecchi cominciano con il nome
  const clienteDi = (r: any) => (r.dettagli?.cliente_id && tutto.nomi[r.dettagli.cliente_id]) || String(r.cosa).split(' · ')[0];
  const list = dati.filter((r) => cli === 'Tutti' || clienteDi(r) === cli);
  return <div className="glass tbox"><table className="t" style={{ minWidth: 760 }}><thead><tr><th>Ora</th><th>Movimento</th><th>Cliente</th><th>Cosa</th><th>Da → a</th><th>Chi</th></tr></thead><tbody>
    {list.length ? list.map((r) => <tr key={r.id}><td>{quando(r.quando)}</td>
      <td>{r.operazione === 'Entrata' ? <Pill tone="dark">Entrata</Pill> : r.operazione === 'Uscita' ? <Pill>Uscita</Pill> : <Pill>Spostamento</Pill>}</td>
      <td><b>{clienteDi(r)}</b></td><td>{String(r.cosa).startsWith(clienteDi(r) + ' · ') ? String(r.cosa).slice(clienteDi(r).length + 3) : r.cosa}</td><td>{r.dove ?? '—'}</td><td>{r.chi_nome ?? '—'}</td></tr>)
      : <tr><td colSpan={6} className="lbl">Nessun movimento per questo cliente.</td></tr>}
  </tbody></table></div>;
}

// ------------------------------------------------------------------ Missioni
function Missioni() {
  const { db } = useApp();
  const az = useAzione();
  const [ambito, setAmbito] = useState('Scaffale');
  const [filtro, setFiltro] = useState('');
  const [motivi, setMotivi] = useState<Record<string, string>>({});
  const [errSbl, setErrSbl] = useState('');
  const { dati: cm } = useDati((d) => d.from<any>('bancali').select('clienti(nome),posti(codice)').is('uscito_il', null), []);
  const { dati } = useDati(async (d) => {
    const m = await d.from<any>('missioni').select('*').eq('stato', 'Aperta').order('creata_il', { ascending: false }).limit(1);
    const mp = m.length ? await d.from<any>('missioni_posti').select('*,posti(codice)').eq('missione_id', m[0].id) : [];
    return { m: m[0] ?? null, mp };
  }, []);
  if (!dati) return null;
  const { m, mp } = dati;
  const fatti = mp.filter((x) => x.stato !== 'Da fare').length;
  const bloccati = mp.filter((x) => x.stato === 'Bloccato');
  const conBlocco = mp.filter((x) => x.stato === 'Bloccato' || x.stato === 'Sbloccato');
  // il mockup non ha il campo per scrivere quale zona/scaffale/cliente (Da decidere): finché non c'è si usa quello della missione in corso
  const f0 = filtro.trim() || (m && m.ambito === ambito ? m.filtro : '') || '';
  const lancia = () => az.esegui(() => db.rpc('lancia_missione', { p_ambito: ambito, p_filtro: ambito === 'Tutto' ? null : f0 || null }));
  // Sblocca: il magazzino resta com'era (errore di lettura, pezzo ritrovato). Rettifica: il magazzino diventa quello trovato.
  const sblocca = (x: any, fn: 'sblocca_posto' | 'rettifica_posto') => { const v = (motivi[x.id] ?? '').trim(); if (!v) { setErrSbl(x.id); return; } setErrSbl('');
    az.esegui(() => db.rpc(fn, { p_posto: x.id, p_motivo: v })); };
  const appUrl = (window as any).MESSINA?.appUrl as string | undefined;
  // nella pagina della prova l'app magazzino è un'altra parte della pagina; online è l'indirizzo dell'app (config appUrl)
  const apriApp = () => { if (appUrl) window.open(appUrl, '_blank', 'noopener'); else try { window.top?.postMessage({ tipo: 'messina-vai', dove: 'appMagazzino' }, '*'); } catch { /* */ } };
  const nomiCm = !m || m.ambito !== 'Scaffale' ? [] : [...new Set((cm ?? []).filter((b) => String(b.posti?.codice ?? '').startsWith((m?.filtro ?? '') + '-')).map((b) => b.clienti?.nome).filter(Boolean))];
  const clienteMissione = nomiCm.length === 1 ? nomiCm[0] : '';
  const ph: Record<string, string> = { Zona: 'Ricevimento, Resi…', Scaffale: 'S07', Cliente: 'Econocom' };
  return (<>
    <div className="grid g2">
      <div className="glass card stack"><b>{m ? `Missione in corso · ${m.ambito}${m.filtro ? ' ' + m.filtro : ''}${clienteMissione ? ` (${clienteMissione})` : ''}` : 'Nessuna missione in corso'}</b>
        {m && <><div className="bar"><i style={{ width: `${mp.length ? Math.round(fatti / mp.length * 100) : 0}%` }} /></div>
          <div className="lbl">{fatti} di {mp.length} posti controllati · si salva a ogni scansione, anche se il magazziniere esce dall’app</div></>}
        {/* Da decidere (STATO): il riquadro «Bloccati» non è nel mockup */}{void bloccati}
        <div className="row"><Btn ghost onClick={apriApp}>Apri l’app magazzino</Btn></div>
      </div>
      <div className="glass card stack"><b>Nuova missione</b><div className="lbl">Tutto il magazzino, una zona, uno scaffale o un cliente. Al magazziniere arriva come compito obbligatorio.</div>
        <div className="row">{['Tutto', 'Zona', 'Scaffale', 'Cliente'].map((x) => <Chip key={x} on={ambito === x} onClick={() => setAmbito(x)}>{x}</Chip>)}</div>
        {/* Da decidere (STATO): il campo per scrivere quale zona, scaffale o cliente non è nel mockup */}
        {void ph}{void setFiltro}
        <Errore testo={az.errore} />
        <div className="row"><Btn onClick={lancia} disabled={az.inCorso || (ambito !== 'Tutto' && !f0)}>Lancia</Btn></div></div>
    </div>
    {/* Da decidere (STATO): i riquadri dei posti bloccati («Sblocca», «Rettifica») non sono nel mockup: le funzioni restano */}
    {false && conBlocco.map((x) => { const ok = x.stato === 'Sbloccato';
      const manca = (x.mancanti ?? []).map((a: any) => a.articolo + (a.codice ? ' ' + a.codice : a.quantita ? ' × ' + a.quantita : ''));
      const extra = (x.extra ?? []).map((a: any) => typeof a === 'string' ? a : a.articolo + ' × ' + a.quantita);
      return <div key={x.id} className="glass card stack" style={ok ? undefined : { border: '2px solid var(--alert)' }}>
        <div className="row between"><b>{x.posti?.codice}{m?.ambito === 'Cliente' ? ' · ' + m.filtro : ''}</b>{ok ? <Pill tone="ok">Sbloccato</Pill> : <Pill tone="red">Bloccato</Pill>}</div>
        {manca.length > 0 && <div><span className="lbl">Manca</span> <b className="miss">{manca.join(', ')}</b></div>}
        {extra.length > 0 && <div><span className="lbl">In più</span> <b className="miss">{extra.join(', ')}</b></div>}
        {ok ? <div className="lbl">Motivo: {x.motivo}</div> : <>
          <textarea rows={2} placeholder="Cosa è successo" aria-label="Cosa è successo" value={motivi[x.id] ?? ''} onChange={(e) => setMotivi({ ...motivi, [x.id]: e.target.value })}
            style={{ font: 'inherit', padding: 10, borderRadius: 12, border: '1px solid var(--line)', width: '100%', boxSizing: 'border-box' }} />
          {errSbl === x.id && <div className="miss">Scrivi cosa è successo prima di sbloccare.</div>}
          <div className="row"><Btn onClick={() => sblocca(x, 'sblocca_posto')} disabled={az.inCorso}>Sblocca</Btn>{/* Da decidere (STATO): «Rettifica» (rpc rettifica_posto) non è nel mockup */}</div></>}
      </div>; })}
    <p className="lbl" style={{ margin: 0 }}>Il magazziniere vede l’elenco di quello che dovrebbe esserci e lo scansiona nell’ordine che vuole. Se qualcosa manca o è in più il posto non si chiude: resta bloccato finché l’ufficio non scrive cosa è successo. Tutto resta nello Storico.</p>
  </>);
}

// ------------------------------------------------------------------ Storico
function Storico({ cc }: { cc: any[] }) {
  const [f, setF] = useState('Tutto');
  const { dati } = useDati((d) => d.from<any>('storico').select('*').eq('azienda', 'trasporti').order('quando', { ascending: false }).limit(500), []);
  if (!dati) return null;
  const oggi = oggiISO();
  // dove guardare: colli che mancano e chi oggi ha fatto più modifiche a mano del solito
  const carte: [string, string][] = [];
  cc.filter((r) => r.letti > 0 && r.letti < r.attesi).forEach((r) => {
    const ultimo = dati.find((s) => String(s.cosa).startsWith(r.cliente) && ['Uscita', 'Entrata'].includes(s.operazione));
    carte.push([`Collo ${r.cliente} mancante`, `Bolla ${r.numero ?? '—'}: ${r.attesi} colli, ${r.letti} letti${r.ultima_lettura ? ' alle ' + hm(r.ultima_lettura) : ''}.${ultimo ? ` L’ultimo a toccarli è stato ${ultimo.chi_nome}; dopo, nessuna scansione.` : ''}`]); });
  const mano: Record<string, number> = {};
  dati.filter((r) => r.come === 'Manuale' && new Date(new Date(r.quando).getTime() - new Date(r.quando).getTimezoneOffset() * 60000).toISOString().slice(0, 10) === oggi)   // giorno italiano, non UTC.forEach((r) => { mano[r.chi_nome ?? '—'] = (mano[r.chi_nome ?? '—'] ?? 0) + 1; });
  Object.entries(mano).filter(([, n]) => n >= 2).forEach(([chi, n]) => carte.push(['Modifiche a mano', `${chi} oggi ha fatto ${n} modifiche a mano.`]));
  const all = dati.filter((r) => f === 'Tutto' || r.come === f);
  return (<>
    {carte.length > 0 && <><Warn n={carte.length}>Anomalie</Warn>
      <div className="grid g2">{carte.map(([t, x], i) => <div key={i} className="glass card stack" style={{ gap: 6 }}><b>{t}</b><div>{x}</div><div className="lbl">Da chiarire con la persona: può essere un errore.</div></div>)}</div></>}
    <div className="row">{['Tutto', 'Pistola', 'Manuale'].map((x) => <Chip key={x} on={f === x} onClick={() => setF(x)}>{x}</Chip>)}</div>
    <div className="glass tbox"><table className="t nw" style={{ minWidth: 860 }}><thead><tr><th>Ora</th><th>Chi</th><th>Operazione</th><th>Cosa</th><th>Dove</th><th>Come</th></tr></thead><tbody>
      {all.map((r) => <tr key={r.id} className={r.come === 'Manuale' ? 'korow' : ''}><td>{quando(r.quando)}</td><td><b>{r.chi_nome ?? '—'}</b></td><td>{r.operazione}</td><td>{r.cosa}</td><td>{r.dove ?? '—'}</td><td>{r.come ?? '—'}</td></tr>)}
      {!all.length && <tr><td colSpan={6} className="lbl">Niente nello Storico.</td></tr>}
    </tbody></table></div>
    <p className="lbl" style={{ margin: 0 }}>Ogni scansione, modifica e cancellazione resta registrata e non si può cancellare. Il programma indica dove guardare; chi ha sbagliato lo decidete voi dopo aver parlato con la persona. Da scrivere nell’informativa e da far vedere al consulente.</p>
  </>);
}

// ------------------------------------------------------------------ Asset (UniCredit tramite Econocom e gli altri clienti con i telefoni per utente)
// Ogni IMEI sparato nel contenuto di un bancale diventa un asset; si abbina a cespite e utente incollando l'Excel del cliente,
// si spedisce con la bolla. Il cliente vede tutto live nel portale e ha il file del giorno.
const STATI_ASSET = ['Tutti', 'In magazzino', 'Abbinato', 'Spedito', 'Rientrato'];
/** righe incollate dall'Excel: IMEI, cespite, utente, sede (separate da tab o punto e virgola) */
const leggiExcel = (t: string) => t.split(/\r?\n/).map((r) => r.split(/\t|;/).map((x) => x.trim())).filter((c) => c[0] && !/^imei$/i.test(c[0]))
  .map(([imei, cespite, utente, sede]) => ({ imei, cespite: cespite ?? '', utente: utente ?? '', sede: sede ?? '' }));
function Asset({ cli, imei }: { cli: string; imei?: string }) {
  const { db, io } = useApp();
  const az = useAzione();
  const [s, set] = useStato({ stato: 'Tutti', apri: '', excel: '', abbina: false, sel: [] as string[], bolla: '', msg: '' });
  const { dati: A } = useDati((d) => d.from<any>('asset').select('*,clienti(nome),bancali(codice),bolle(numero)').order('entrato_il', { ascending: false }).limit(5000), []);
  const { dati: E } = useDati((d) => s.apri ? d.from<any>('asset_eventi').select('*,profili(nome)').eq('asset_id', s.apri).order('quando', { ascending: true }) : Promise.resolve([] as any[]), [s.apri]);
  const daCerca = imei ? A?.find((a) => a.imei === imei)?.id : undefined;   // arrivato da «Cerca» in alto
  useEffect(() => { if (daCerca) set({ apri: daCerca }); }, [daCerca, set]);
  if (!A) return null;
  const opera = ['magazzino', 'traffico', 'bolle', 'amministrazione'].includes(io.ruolo);
  const conta = (x: string) => A.filter((a) => (cli === 'Tutti' || a.clienti?.nome === cli) && a.stato === x).length;
  const lista = A.filter((a) => (cli === 'Tutti' || a.clienti?.nome === cli) && (s.stato === 'Tutti' || a.stato === s.stato));
  const righe = leggiExcel(s.excel);
  const abbina = () => az.esegui(() => db.rpc('abbina_asset', { p_righe: righe }))
    .then((ok) => ok && set({ excel: '', abbina: false, msg: `${righe.length === 1 ? '1 telefono abbinato' : righe.length + ' telefoni abbinati'} a cespite e utente.` }));
  const spedisci = () => az.esegui(() => db.rpc('spedisci_asset', { p_imei: s.sel, p_bolla: s.bolla.trim() }))
    .then((ok) => ok && set({ sel: [], bolla: '', msg: `${s.sel.length === 1 ? '1 telefono spedito' : s.sel.length + ' telefoni spediti'} con la bolla ${s.bolla.trim()}: tolti dal bancale.` }));
  const scegli = (imei: string) => set({ sel: s.sel.includes(imei) ? s.sel.filter((x) => x !== imei) : [...s.sel, imei] });
  const pill = (x: string) => x === 'Spedito' ? <Pill tone="ok">{x}</Pill> : x === 'Abbinato' ? <Pill tone="dark">{x}</Pill> : x === 'Rientrato' ? <Pill tone="red">{x}</Pill> : <Pill>{x}</Pill>;
  const aperto = A.find((a) => a.id === s.apri);
  return (<>
    <div className="row">{STATI_ASSET.map((x) => <Chip key={x} on={s.stato === x} onClick={() => set({ stato: x })}>{x === 'Tutti' ? x : `${x} · ${num(conta(x))}`}</Chip>)}</div>
    {s.msg && <Msg>{s.msg}</Msg>}
    <Errore testo={az.errore} />
    {opera && (s.abbina ? <div className="glass card stack">
      <b>Abbina</b>
      <span className="lbl">Incolla dall’Excel del cliente le colonne IMEI, Cespite, Utente, Sede. Se anche una riga non torna non si abbina niente.</span>
      <textarea className="input" rows={6} value={s.excel} onChange={(e) => set({ excel: e.target.value })} aria-label="Righe dall’Excel" style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13 }} />
      <div className="row"><Btn onClick={abbina} disabled={az.inCorso || !righe.length}>{righe.length ? `Abbina ${righe.length}` : 'Abbina'}</Btn><Btn ghost onClick={() => set({ abbina: false })}>Annulla</Btn></div>
    </div> : <div className="row">
      <Btn onClick={() => set({ abbina: true, msg: '' })}>Abbina</Btn>
      {s.sel.length > 0 && <><input className="input" style={{ maxWidth: 180 }} placeholder="Numero bolla" value={s.bolla} onChange={(e) => set({ bolla: e.target.value })} />
        <Btn onClick={spedisci} disabled={az.inCorso || !s.bolla.trim()}>{`Spedisci ${s.sel.length}`}</Btn></>}
    </div>)}
    {aperto && <div className="glass card stack">
      <div className="row between"><b>{aperto.imei} · {aperto.modello ?? '—'}</b><Btn ghost sm onClick={() => set({ apri: '' })}>Chiudi</Btn></div>
      <div className="lbl">{[aperto.clienti?.nome, aperto.cliente_finale !== aperto.clienti?.nome ? aperto.cliente_finale : null, aperto.cespite && 'cespite ' + aperto.cespite, aperto.utente, aperto.sede, aperto.accessori?.length ? aperto.accessori.join(', ') : null].filter(Boolean).join(' · ')}</div>
      <div className="list">{(E ?? []).map((e) => <div key={e.id} className="li"><span className="row between" style={{ width: '100%' }}><span><b>{e.evento}</b> · {e.dettagli ?? ''}</span><span className="lbl">{quando(e.quando)}{e.profili?.nome ? ' · ' + e.profili.nome : ''}</span></span></div>)}</div>
    </div>}
    <div className="glass tbox"><table className="t nw" style={{ minWidth: 1100 }}><thead><tr>{opera && <th />}<th>IMEI</th><th>Modello</th><th>Cliente</th><th>Cespite</th><th>Utente</th><th>Sede</th><th>Stato</th><th>Dove</th><th>Entrato</th></tr></thead><tbody>
      {lista.length ? lista.slice(0, 500).map((a) => <tr key={a.id} className="click" onClick={() => set({ apri: a.id })} style={s.apri === a.id ? { background: 'var(--soft)' } : undefined}>
        {opera && <td onClick={(e) => e.stopPropagation()}>{(a.stato === 'Abbinato' || (a.stato === 'Rientrato' && a.cespite)) && <input type="checkbox" aria-label={'Scegli ' + a.imei} checked={s.sel.includes(a.imei)} onChange={() => scegli(a.imei)} />}</td>}
        <td><b>{a.imei}</b></td><td>{a.modello ?? '—'}</td><td>{a.clienti?.nome}{a.cliente_finale && a.cliente_finale !== a.clienti?.nome ? <div className="lbl">{a.cliente_finale}</div> : null}</td><td>{a.cespite ?? '—'}</td><td>{a.utente ?? '—'}</td><td className="lbl">{a.sede ?? '—'}</td>
        <td>{pill(a.stato)}</td><td>{a.stato === 'Spedito' ? (a.bolle?.numero ? 'Bolla ' + a.bolle.numero : '—') : a.bancali?.codice ?? <span className="miss">senza bancale</span>}</td><td>{quando(a.entrato_il)}</td></tr>)
        : <tr><td colSpan={opera ? 10 : 9} className="lbl">Nessun asset. Si creano da soli sparando gli IMEI nel contenuto dei bancali dei clienti con gli asset attivi.</td></tr>}
    </tbody></table></div>
    {lista.length > 500 && <p className="lbl" style={{ margin: 0 }}>Ne mostro 500 di {num(lista.length)}: un IMEI, un cespite o un utente si trovano con «Cerca» in alto.</p>}
  </>);
}
