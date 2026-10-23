// Gestionale Messina Corporation: corp() del mockup approvato, con i dati veri.
import '@messina/dati/prova-corporation';
import React, { useRef, useState } from 'react';
import { Btn, Chip, Msg, Pill } from '@messina/ui';
import { Telecamere } from '../telecamere';
import { Richieste } from './richieste';
import { Presenze } from '../trasporti/presenze';
import { Shell, vociPer, useApp, useDati, useAzione, useStato, MailView, type Mail, Errore, hm, Mese, num, eur0, oggiISO, meseISO } from '../core';

// telefono: stesso tratto dell'icona del portatile (il mockup ha solo portatili, vedi STATO)
const PHONE = <svg width="40" height="58" viewBox="0 0 28 44" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="2" width="22" height="40" rx="4" /><path d="M11 37h6" /></svg>;
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
  const { dati: dev } = useDati((db) => db.from<any>('device').select('id,stato,siti,caricato_il,prezzo,prezzo_confermato_da').neq('stato', 'Venduto'));
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
  if (nResi) guarda.push([nResi === 1 ? '1 reso da rimettere in vendita' : `${nResi} resi da rimettere in vendita`, 'inv', 'Inventario', false]);
  const nConf = (dev ?? []).filter((d) => d.prezzo != null && !d.prezzo_confermato_da).length;
  if (nConf && (io.ruolo === 'vendite' || io.ruolo === 'direzione')) guarda.push([nConf === 1 ? '1 prezzo da confermare' : `${nConf} prezzi da confermare`, 'inv', 'Inventario', false]);
  if (ord.length) guarda.push([ord.length === 1 ? '1 ordine da spedire' : `${ord.length} ordini da spedire`, 'ordini', 'Ordini', false]);
  if (fall?.length) guarda.push([fall.length === 1 ? '1 postazione interrotta allo stage' : `${fall.length} postazioni interrotte allo stage`, 'stage', 'Stage Computer', true]);
  if (l && l.rimaste < 100) guarda.push([`Licenze Certus: chiavetta ${l.chiavetta} quasi finita`, 'stage', 'Stage Computer', false]);
  const sollecito = (ric ?? []).filter((r) => Date.now() - new Date(r.creata_il).getTime() > 4 * 3600_000).length;
  // Da decidere (STATO 48): le richieste delle aziende hanno una sezione che il menu del mockup non ha, quindi qui non compaiono
  const conRichieste = false;
  if (conRichieste && sollecito) guarda.push([sollecito === 1 ? '1 richiesta di un’azienda senza preventivo da più di 4 ore' : `${sollecito} richieste di aziende senza preventivo da più di 4 ore`, 'richieste', 'Richieste', true]);
  else if (conRichieste && ric?.length) guarda.push([ric!.length === 1 ? '1 richiesta di un’azienda da preventivare' : `${ric!.length} richieste di aziende da preventivare`, 'richieste', 'Richieste', false]);
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
        az.esegui(() => db.from('lotti_documenti').insert({ lotto_id: lotto.id, tipo: 'DDT', percorso: all.percorso ?? `mail/${m.id}/${all.nome}`, nome: all.nome }))
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
// Un lotto è aperto finché si caricano i PC; alla chiusura il costo si divide sui PC caricati e la somma torna esatta.
function Lotti({ q }: { q: string }) {
  const { db, io } = useApp();
  const [s, set] = useStato({ sel: null as string | null, msg: '', nuovo: false, codice: '', fornitore: '', data: oggiISO(), pezzi: '', costo: '', chiudi: false, nota: '' });
  const file = useRef<HTMLInputElement>(null);
  const { dati: L } = useDati((d) => d.from<any>('lotti_conti').select('*').order('acquistato_il', { ascending: false }));
  const { dati: Q } = useDati((d) => d.from<any>('lotti_quadratura').select('*'));
  const { dati: docs } = useDati((d) => d.from<any>('lotti_documenti').select('*').order('caricato_il', { ascending: false }));
  const { dati: dev } = useDati((d) => d.from<any>('device').select('id,stato,caricato_il').neq('stato', 'Venduto'));
  const az = useAzione();
  if (!L || !dev || !Q) return null;
  const scrive = io.ruolo === 'vendite' || io.ruolo === 'amministrazione' || io.ruolo === 'direzione';
  const qd = (id: string) => Q.find((x) => x.id === id) ?? {};
  const pezzi = L.reduce((a, l) => a + Number(l.pezzi), 0), costo = L.reduce((a, l) => a + Number(l.costo), 0);
  const cur = L.find((l) => l.id === s.sel) ?? L[0];
  const cq = cur ? qd(cur.id) : {};
  const lista = L.filter((l) => has(q, l.codice));
  const carica = async (fs: FileList | null) => {
    if (!fs?.length || !cur) return;
    const nomi: string[] = [];
    const ok = await az.esegui(async () => {
      for (const f of Array.from(fs)) {
        const percorso = `lotti/${cur.id}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, '_')}`;
        await db.storage.carica('documenti', percorso, f);
        await db.from('lotti_documenti').insert({ lotto_id: cur.id, tipo: /ddt/i.test(f.name) ? 'DDT' : /fatt/i.test(f.name) ? 'Fattura' : 'Altro', percorso, nome: f.name });
        nomi.push(f.name);
      }
    });
    if (ok) set({ msg: `${nomi.length === 1 ? 'Documento caricato' : 'Documenti caricati'} nel lotto ${cur.codice}: ${nomi.join(', ')}.` });
    if (file.current) file.current.value = '';
  };
  const apri = (x: any) => az.esegui(async () => { window.open(await db.storage.link('documenti', x.percorso), '_blank', 'noopener'); });
  const crea = () => az.esegui(() => db.from('lotti').insert({ codice: s.codice.trim().toUpperCase(), fornitore: s.fornitore.trim() || null, acquistato_il: s.data,
    pezzi: Number(s.pezzi), costo: Number(s.costo.replace(',', '.')) })).then((ok) => ok && set({ nuovo: false, msg: `Lotto ${s.codice.trim().toUpperCase()} aperto: dall’app si caricano i PC in questo lotto.`, codice: '', fornitore: '', pezzi: '', costo: '' }));
  const chiudi = () => az.esegui(() => db.rpc('chiudi_lotto', { p_lotto: cur.id, p_nota: s.nota.trim() || null }))
    .then((ok) => ok && set({ chiudi: false, nota: '', msg: Number(cq.caricati) === 1 ? `Lotto ${cur.codice} chiuso: ${eur0(cur.costo)} tutti sull’unico PC caricato.` : `Lotto ${cur.codice} chiuso: ${eur0(cur.costo)} divisi sui ${num(cq.caricati)} PC caricati, la somma torna esatta.` }));
  const acquisto = (d: string) => { const x = new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { month: 'short', year: 'numeric' }).replace('.', ''); return x[0].toUpperCase() + x.slice(1); };
  const dCur = (docs ?? []).filter((x) => x.lotto_id === cur?.id);
  const pronto = s.codice.trim() && s.data && Number(s.pezzi) > 0 && Number(s.costo.replace(',', '.')) >= 0 && s.costo.trim();
  return (<>
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Costo medio reale per PC</div><div className="big">{eur0(pezzi ? costo / pezzi : 0)}</div><div className="lbl">calcolato su tutti i lotti</div></div>
      <div className="glass card"><div className="lbl">Lotti aperti</div><div className="big">{Q.filter((l) => l.stato === 'Aperto').length}</div></div>
      <div className="glass card"><div className="lbl">Fermi da oltre 60 giorni</div><div className="big">{dev.filter(fermo).length}</div><div className="lbl">conviene svendere</div></div>
    </div>
    {s.msg && <Msg>{s.msg}</Msg>}
    <Errore testo={az.errore} />
    {/* Da decidere (STATO): «Nuovo» lotto, colonne Caricati e Stato, riquadro del lotto (quadratura, documenti, Chiudi) non sono nel mockup */}
    {scrive && (s.nuovo ? <div className="glass card stack">
      <b>Nuovo lotto</b>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field"><span className="lbl">Codice</span><input className="input" style={{ maxWidth: 120 }} placeholder="L-016" value={s.codice} onChange={(e) => set({ codice: e.target.value })} /></label>
        <label className="field"><span className="lbl">Fornitore</span><input className="input" value={s.fornitore} onChange={(e) => set({ fornitore: e.target.value })} /></label>
        <label className="field"><span className="lbl">Acquisto</span><input className="input" type="date" value={s.data} onChange={(e) => set({ data: e.target.value })} /></label>
        <label className="field"><span className="lbl">Pezzi nel DDT</span><input className="input" style={{ maxWidth: 110 }} inputMode="numeric" value={s.pezzi} onChange={(e) => set({ pezzi: e.target.value.replace(/\D/g, '') })} /></label>
        <label className="field"><span className="lbl">Costo €</span><input className="input" style={{ maxWidth: 130 }} inputMode="decimal" value={s.costo} onChange={(e) => set({ costo: e.target.value })} /></label>
      </div>
      <div className="row"><Btn onClick={crea} disabled={az.inCorso || !pronto}>Apri</Btn><Btn ghost onClick={() => set({ nuovo: false })}>Annulla</Btn></div>
    </div> : null)}
    <div className="glass tbox"><table className="t"><thead><tr><th>Lotto</th><th>Acquisto</th><th>Pezzi</th><th>Costo</th><th>Venduti</th><th>Incassato finora</th><th>Recuperato</th></tr></thead><tbody>
      {lista.length ? lista.map((r) => <tr key={r.id} onClick={() => set({ sel: r.id, chiudi: false })}>
        <td><b>{r.codice}</b></td><td>{acquisto(r.acquistato_il)}</td><td>{num(r.pezzi)}</td><td>{eur0(r.costo)}</td><td>{num(r.venduti)}</td><td><b>{eur0(r.incassato)}</b></td><td>{Math.round(Number(r.recuperato_pct))}%</td></tr>)
        : <tr><td colSpan={7} className="lbl">Nessun lotto.</td></tr>}
    </tbody></table></div>
    {scrive && <div className="row"><Btn onClick={() => file.current?.click()} disabled={az.inCorso || !cur}>Carica fattura d’acquisto e DDT</Btn><span className="lbl">Il programma confronta i seriali del DDT con l’archivio dei PC lavorati.</span></div>}
    <input ref={file} type="file" multiple accept=".pdf,image/*,.xml,.xlsx,.csv" hidden onChange={(e) => carica(e.target.files)} />
    {void dCur}{void apri}{void chiudi}{void crea}{void pronto}{void cq}
    {false && cur && <div className="glass card stack">
      <div className="row between"><h3 style={{ fontSize: 18 }}>Lotto {cur.codice}</h3>{cq.stato === 'Chiuso' ? <Pill tone="dark">Chiuso</Pill> : <Pill>Aperto</Pill>}</div>
      <div className="grid g4">
        <div><div className="lbl">Pezzi nel DDT</div><b>{num(cq.pezzi_dichiarati)}</b></div>
        <div><div className="lbl">Caricati</div><b className={Number(cq.caricati) !== Number(cq.pezzi_dichiarati) ? 'miss' : undefined}>{num(cq.caricati)}</b></div>
        <div><div className="lbl">Costo diviso</div><b>{eur0(cq.costo_ripartito)}</b></div>
        <div><div className="lbl">Differenza</div><b className={Number(cq.differenza) !== 0 ? 'miss' : undefined}>{eur0(cq.differenza)}</b></div>
      </div>
      <div className="list">{dCur.length ? dCur.map((x) => <button key={x.id} type="button" className="li" onClick={() => apri(x)}><span className="row between" style={{ width: '100%' }}><span>{x.nome ?? x.percorso.split('/').pop()}</span><Pill>{x.tipo}</Pill></span></button>)
        : <div className="lbl" style={{ padding: 10 }}>Nessun documento.</div>}</div>
      {scrive && <div className="row">
        <Btn ghost onClick={() => file.current?.click()} disabled={az.inCorso}>Carica</Btn>
        {cq.stato === 'Aperto' && !s.chiudi && <Btn onClick={() => set({ chiudi: true, msg: '' })}>Chiudi</Btn>}
      </div>}
      {scrive && s.chiudi && <div className="stack" style={{ gap: 8 }}>
        <div>{Number(cq.caricati) === Number(cq.pezzi_dichiarati) ? `Caricati tutti i ${num(cq.caricati)} PC del DDT: il costo si divide in parti uguali.`
          : `Nel DDT ci sono ${num(cq.pezzi_dichiarati)} pezzi, caricati ${num(cq.caricati)}: scrivi cosa manca o cosa c’è in più.`}</div>
        {Number(cq.caricati) !== Number(cq.pezzi_dichiarati) && <input className="input" placeholder="Nota" value={s.nota} onChange={(e) => set({ nota: e.target.value })} />}
        <div className="row"><Btn onClick={chiudi} disabled={az.inCorso || (Number(cq.caricati) !== Number(cq.pezzi_dichiarati) && !s.nota.trim())}>Conferma</Btn><Btn ghost onClick={() => set({ chiudi: false })}>Annulla</Btn></div>
      </div>}
    </div>}
  </>);
}

// ------------------------------------------------------------------ Inventario
const SITI = ['Sito', 'Back Market', 'Refurbed', 'eBay', 'Subito', 'Amazon'];
function Inventario({ q }: { q: string }) {
  const { db, io } = useApp();
  const [s, set] = useStato({ vista: 'tabella', brand: 'Tutti', grado: 'Tutti', stato: 'Tutti', apri: '' as string });
  const { dati: D } = useDati((d) => d.from<any>('device').select('*,lotti(codice),bancali(codice,posti(codice))').order('caricato_il', { ascending: false }).limit(2000));
  if (!D) return null;
  const marche = ['Tutti', ...Array.from(new Set(['Lenovo', 'HP', 'Dell', 'Apple', ...D.map((d) => d.marca).filter(Boolean)]))];
  const daConfermare = (d: any) => d.stato !== 'Venduto' && d.prezzo != null && !d.prezzo_confermato_da;
  // «Tutti» = quello che è in magazzino, come nel mockup (venduti e smontati si vedono con i filtri per stato, Da decidere 29)
  const perStato = (d: any) => s.stato === 'Tutti' ? !['Venduto', 'Smontato'].includes(d.stato) : (s.stato === 'Da confermare' ? daConfermare(d) : s.stato === 'Resi' ? d.stato === 'Reso' : d.stato === s.stato);
  const list = D.filter((d) => (s.brand === 'Tutti' || d.marca === s.brand) && (s.grado === 'Tutti' || d.grado === s.grado) && perStato(d)
    && has(q, d.seriale, d.modello, d.marca, d.lotti?.codice, d.bancali?.codice, d.bancali?.posti?.codice, d.colore, d.memoria));
  const posto = (d: any) => d.bancali?.posti?.codice ?? (d.bancali ? 'Ricevimento' : '—');
  const nConf = D.filter(daConfermare).length;
  const filters = <div className="stack" style={{ gap: 8 }}><div className="row">
    {marche.map((x) => <Chip key={x} on={s.brand === x} onClick={() => set({ brand: x })}>{x}</Chip>)}<span style={{ width: 8 }} />
    {['Tutti', 'A', 'B', 'C', 'D'].map((x) => <Chip key={x} on={s.grado === x} onClick={() => set({ grado: x })}>{x === 'Tutti' ? 'Tutti i gradi' : 'Grado ' + x}</Chip>)}
    <div className="row" style={{ marginLeft: 'auto', gap: 4, padding: 4, borderRadius: 999 }}>
      <Chip on={s.vista === 'schede'} onClick={() => set({ vista: 'schede' })}>Schede</Chip><Chip on={s.vista === 'tabella'} onClick={() => set({ vista: 'tabella' })}>Tabella</Chip></div>
  </div>{/* Da decidere (STATO): i filtri per stato (Disponibile, Da confermare, Resi…) non sono nel mockup */}{void nConf}</div>;
  const empty = <div className="glass card lbl">Nessun computer con questi filtri.</div>;
  const aperto = D.find((d) => d.id === s.apri);
  const spec = (d: any) => d.tipo === 'Telefono' ? [d.marca, d.memoria, d.colore, d.batteria != null ? `batteria ${d.batteria}%` : null] : [d.marca, d.cpu, d.gpu, d.ram, d.disco];
  return (<>
    {filters}
    {aperto && <Scheda key={aperto.id} d={aperto} onChiudi={() => set({ apri: '' })} vendite={io.ruolo === 'vendite'} db={db} />}
    {!list.length ? empty : s.vista === 'schede'
      ? <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>{list.map((d) => (
        <div key={d.id} className="glass card stack" style={{ gap: 8, cursor: 'pointer' }} onClick={() => set({ apri: d.id })}>
          <div className="ph">{d.tipo === 'Telefono' ? PHONE : LAPTOP}</div><div className="row between"><b>{d.modello}</b>{d.grado && <Pill tone="dark">{d.grado}</Pill>}</div>
          <div className="lbl">{spec(d).filter(Boolean).join(' · ')}</div>
          <div className="lbl">Seriale {d.seriale} · {d.bancali?.codice ?? '—'} · {posto(d)}</div>
          <div className="row between"><span style={{ fontSize: 20, fontWeight: 800 }}>{d.prezzo != null ? eur0(d.prezzo) : '€ —'}</span><span className="lbl">{daConfermare(d) ? 'Da confermare' : d.stato}</span></div>
          <div className="lbl">{d.siti?.join(', ') || '—'}</div>
        </div>))}</div>
      : <div className="glass tbox"><table className="t nw" style={{ minWidth: 1700 }}><thead><tr>{['Seriale', 'Marchio', 'Modello', 'Processore', 'Scheda video', 'RAM', 'Disco', 'Schermo', 'Grado', 'Difetti', 'Lotto', 'Bancale', 'Posto', 'Costo', 'Prezzo', 'Stato', 'Siti', 'Giorni'].map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>
        {list.map((d) => <tr key={d.id} className="click" onClick={() => set({ apri: d.id })} style={s.apri === d.id ? { background: 'var(--soft)' } : undefined}>
          <td>{d.seriale}</td><td>{d.marca}</td><td><b>{d.modello}</b></td>
          {d.tipo === 'Telefono' ? <><td className="lbl">—</td><td className="lbl">—</td><td className="lbl">—</td><td>{d.memoria ?? '—'}</td><td className="lbl">—</td></>
            : <><td>{d.cpu}</td><td>{d.gpu}</td><td>{d.ram}</td><td>{d.disco}</td><td>{d.schermo}</td></>}
          <td>{d.grado && <Pill tone="dark">{d.grado}</Pill>}</td><td className="lbl">{d.difetti?.join(', ') || '—'}</td><td>{d.lotti?.codice ?? '—'}</td><td>{d.bancali?.codice ?? '—'}</td><td>{posto(d)}</td>
          <td>{d.costo != null ? eur0(d.costo) : '—'}</td><td><b>{d.prezzo != null ? eur0(d.prezzo) : '—'}</b>{daConfermare(d) && <div className="lbl">da confermare</div>}</td><td>{statoPill(d.stato)}</td><td className="lbl">{d.siti?.join(', ') || '—'}</td><td>{giorniDa(d.caricato_il)}</td></tr>)}
      </tbody></table></div>}
  </>);
}

/** scheda di un computer: grado, prezzo e siti si cambiano qui; conferma, vendita, reso e fermo passano dalle funzioni del database */
function Scheda({ d, onChiudi, vendite, db }: { d: any; onChiudi: () => void; vendite: boolean; db: any }) {
  const [s, set] = useStato({ g: d.grado ?? 'B', p: d.prezzo != null ? String(d.prezzo) : '', siti: (d.siti ?? []) as string[], msg: '', apri: '' as '' | 'vendi' | 'fermo' | 'rimetti',
    canale: 'eBay', prezzo: d.prezzo != null ? String(d.prezzo) : '', comm: '', spese: '', rif: '', motivo: '', bancale: d.bancali?.codice ?? '' });
  const az = useAzione();
  const { dati: proposto } = useDati((x) => d.modello && d.grado ? x.rpc<number | null>('prezzo_proposto', { p_modello: d.modello, p_grado: d.grado }).then((v) => v, () => null) : Promise.resolve(null), [d.modello, d.grado]);
  const n = (v: string) => v.trim() === '' ? 0 : Number(v.replace(',', '.'));
  const salva = () => az.esegui(() => db.from('device').update({ grado: s.g, prezzo: s.p === '' ? null : n(s.p), siti: s.siti }).eq('id', d.id))
    .then((x: boolean) => x && set({ msg: 'Salvato: il prezzo e i siti sono aggiornati ovunque.' }));
  const conferma = () => az.esegui(() => db.rpc('conferma_prezzo', { p_device: d.id })).then((x: boolean) => x && set({ msg: `Prezzo di ${eur0(d.prezzo)} confermato: ora il PC si vede anche sul sito.` }));
  const vendi = () => az.esegui(() => db.rpc('registra_vendita', { p_seriale: d.seriale, p_canale: s.canale, p_prezzo: n(s.prezzo), p_commissione: n(s.comm), p_spese: n(s.spese), p_riferimento: s.rif.trim() || null }))
    .then((x: boolean) => x && set({ apri: '', msg: `Venduto su ${s.canale}: tolto dagli altri siti, l’ordine è in Ordini.` }));
  const ferma = () => az.esegui(() => db.rpc('metti_fermo', { p_device: d.id, p_motivo: s.motivo })).then((x: boolean) => x && set({ apri: '', msg: 'PC fermo: tolto da tutti i siti.' }));
  const rimetti = () => az.esegui(() => db.rpc('rimetti_in_vendita', { p_device: d.id, p_bancale: s.bancale.trim(), p_prezzo: s.p === '' ? null : n(s.p) }))
    .then((x: boolean) => x && set({ apri: '', msg: 'Di nuovo disponibile: scegli i siti e premi «Salva».' }));
  const venduto = d.stato === 'Venduto' || d.stato === 'Smontato';
  const daConf = !venduto && d.prezzo != null && !d.prezzo_confermato_da;
  return (
    <div className="glass card stack">
      <div className="row between"><h3 style={{ fontSize: 20 }}>{d.marca} {d.modello}</h3><span className="lbl">{d.tipo === 'Telefono' ? 'IMEI' : 'Seriale'} {d.seriale} · {d.stato}</span></div>
      {d.tipo === 'Telefono' && <div className="lbl">{[d.memoria, d.colore, d.batteria != null ? `batteria ${d.batteria}%` : null].filter(Boolean).join(' · ') || '—'}</div>}
      <div className="row"><b style={{ width: 70 }}>Grado</b>{['A', 'B', 'C', 'D'].map((x) => <Chip key={x} on={s.g === x} onClick={() => !venduto && set({ g: x })}>{x}</Chip>)}</div>
      <label className="row"><b style={{ width: 70 }}>Prezzo</b><input className="input" style={{ maxWidth: 160 }} inputMode="decimal" value={s.p} disabled={venduto} onChange={(e) => set({ p: e.target.value })} />
        {proposto != null && <span className="lbl">proposto {eur0(proposto)}</span>}{daConf && <Pill tone="red">Da confermare</Pill>}</label>
      <div className="row"><b style={{ width: 70 }}>Siti</b>{SITI.map((x) => <Chip key={x} on={s.siti.includes(x)} onClick={() => !venduto && d.stato !== 'Reso' && d.stato !== 'Fermo' && set({ siti: s.siti.includes(x) ? s.siti.filter((y) => y !== x) : [...s.siti, x] })}>{x}</Chip>)}</div>
      {s.apri === 'vendi' && <div className="stack" style={{ gap: 8 }}>
        <div className="row">{[...SITI, 'Di persona'].map((x) => <Chip key={x} on={s.canale === x} onClick={() => set({ canale: x })}>{x}</Chip>)}</div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field"><span className="lbl">Prezzo €</span><input className="input" style={{ maxWidth: 110 }} inputMode="decimal" value={s.prezzo} onChange={(e) => set({ prezzo: e.target.value })} /></label>
          <label className="field"><span className="lbl">Commissione €</span><input className="input" style={{ maxWidth: 110 }} inputMode="decimal" value={s.comm} onChange={(e) => set({ comm: e.target.value })} /></label>
          <label className="field"><span className="lbl">Spese €</span><input className="input" style={{ maxWidth: 110 }} inputMode="decimal" value={s.spese} onChange={(e) => set({ spese: e.target.value })} /></label>
          <label className="field"><span className="lbl">N. ordine</span><input className="input" style={{ maxWidth: 140 }} value={s.rif} onChange={(e) => set({ rif: e.target.value })} /></label>
        </div>
        <div className="row"><Btn onClick={vendi} disabled={az.inCorso || !(n(s.prezzo) > 0)}>Conferma</Btn><Btn ghost onClick={() => set({ apri: '' })}>Annulla</Btn></div>
      </div>}
      {s.apri === 'fermo' && <div className="row"><input className="input" style={{ maxWidth: 320 }} placeholder="Perché è fermo" value={s.motivo} onChange={(e) => set({ motivo: e.target.value })} />
        <Btn onClick={ferma} disabled={az.inCorso || !s.motivo.trim()}>Conferma</Btn><Btn ghost onClick={() => set({ apri: '' })}>Annulla</Btn></div>}
      {s.apri === 'rimetti' && <div className="row"><input className="input" style={{ maxWidth: 200 }} placeholder="Bancale" value={s.bancale} onChange={(e) => set({ bancale: e.target.value.toUpperCase() })} />
        <Btn onClick={rimetti} disabled={az.inCorso || !s.bancale.trim() || s.p === ''}>Conferma</Btn><Btn ghost onClick={() => set({ apri: '' })}>Annulla</Btn></div>}
      {s.msg && <Msg>{s.msg}</Msg>}
      <Errore testo={az.errore} />
      <div className="row">
        {!venduto && d.stato !== 'Reso' && d.stato !== 'Fermo' && <Btn onClick={salva} disabled={az.inCorso}>Salva</Btn>}
        {vendite && daConf && <Btn onClick={conferma} disabled={az.inCorso}>Conferma</Btn>}
        {vendite && d.stato === 'Disponibile' && !s.apri && <Btn ghost onClick={() => set({ apri: 'vendi', msg: '' })}>Vendi</Btn>}
        {vendite && (d.stato === 'Reso' || d.stato === 'Fermo') && !s.apri && <Btn onClick={() => set({ apri: 'rimetti', msg: '' })}>Rimetti</Btn>}
        {vendite && !venduto && d.stato !== 'Fermo' && !s.apri && <Btn ghost onClick={() => set({ apri: 'fermo', msg: '' })}>Fermo</Btn>}
        <Btn ghost onClick={onChiudi}>Chiudi</Btn></div>
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
    const [R, smontati, stage] = await Promise.all([
      d.from<any>('ricambi').select('*,device(seriale,marca,modello),lotti(codice)').order('creato_il', { ascending: false }),
      d.from<any>('device').select('id,seriale').eq('stato', 'Smontato'),
      d.from<any>('stage_pc').select('seriale,esito,certificato'),
    ]);
    // come il mockup: «dischi già cancellati» solo se ogni computer smontato ha il rapporto di cancellazione (dati_cancellati)
    const cancellati = smontati.every((d) => stage.some((x) => x.seriale === d.seriale && x.certificato && ['Formattato', 'In vendita'].includes(x.esito)));
    return { R, smontati, cancellati };
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
      <div className="glass card"><div className="lbl">Computer smontati</div><div className="big">{num(dati.smontati.length)}</div><div className="lbl">{dati.cancellati ? 'non funzionanti, dischi già cancellati' : 'non funzionanti, dischi da cancellare'}</div></div>
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
      </div>) : null}{/* Da decidere (STATO): «Smonta un computer» e i tasti della colonna finale non sono nel mockup */}
    <div className="glass tbox"><table className="t nw"><thead><tr><th>Ricambio</th><th>Da</th><th>Seriale del computer</th><th>Lotto</th><th>Prezzo</th><th>Stato</th></tr></thead><tbody>
      {lista.length ? lista.map((r) => <tr key={r.id}>
        <td><b>{r.descrizione}</b></td><td>{r.device?.modello ?? '—'}</td><td>{r.device?.seriale ?? '—'}</td><td>{r.lotti?.codice ?? '—'}</td>
        <td>{r.prezzo != null ? '€ ' + num(Number(r.prezzo)) : '—'}</td><td>{statoR(r.stato)}</td>
        {false && <td>{r.stato === 'Da vendere' ? <Btn ghost sm onClick={() => inVendita(r)} disabled={az.inCorso}>Metti in vendita</Btn>
          : r.stato === 'Disponibile' ? (s.vendi === r.id
            ? <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><select className="input" value={s.canale} onChange={(e) => set({ canale: e.target.value })}>{['eBay', 'Sito', 'Subito', 'Di persona'].map((c) => <option key={c}>{c}</option>)}</select>
              <input className="input" style={{ maxWidth: 90 }} inputMode="decimal" placeholder={String(r.prezzo)} value={s.venduto} onChange={(e) => set({ venduto: e.target.value })} /><Btn sm onClick={() => vendi(r)} disabled={az.inCorso}>Conferma</Btn></span>
            : <Btn ghost sm onClick={() => set({ vendi: r.id, venduto: '' })}>Venduto</Btn>) : null}</td>}</tr>)
        : <tr><td colSpan={6} className="lbl">Nessun ricambio.</td></tr>}
    </tbody></table></div>
    <p className="lbl" style={{ margin: 0 }}>Prima di smontare, il disco passa dalla cancellazione certificata come tutto il resto: un disco non si vende mai senza rapporto.</p>
  </>);
}

// ------------------------------------------------------------------ Ordini
function Ordini({ q }: { q: string }) {
  const { db, io } = useApp();
  const [s, set] = useStato({ msg: '', apri: '', cosa: '' as '' | 'spedito' | 'reso', tracking: '', rimborso: '', motivo: '', rivendibile: true });
  const { dati: O } = useDati((d) => d.from<any>('ordini').select('*,device(marca,modello,grado,seriale,bancali(codice,posti(codice)))').order('creato_il', { ascending: false }).limit(300));
  const { dati: V } = useDati((d) => io.ruolo === 'vendite' ? d.from<any>('vendite').select('id,ordine_id,prezzo,reso_il,rimborso') : Promise.resolve([] as any[]));
  const az = useAzione();
  if (!O) return null;
  const vend = (o: any) => (V ?? []).find((v) => v.ordine_id === o.id);
  const etichetta = (o: any) => az.esegui(async () => {
    const r = await db.fn<{ url?: string | null }>('etichetta-spedizione', { ordine_id: o.id });
    if (r?.url) window.open(r.url, '_blank', 'noopener');
    set({ msg: `Etichetta di spedizione pronta per ${o.device?.modello ?? o.riferimento}${o.device?.bancali?.posti?.codice ? `: il PC è nel posto ${o.device.bancali.posti.codice}` : ''}.` });
  });
  const spedito = (o: any) => az.esegui(() => db.rpc('ordine_spedito', { p_ordine: o.id, p_tracking: s.tracking }))
    .then((ok) => ok && set({ apri: '', cosa: '', tracking: '', msg: `Ordine ${o.riferimento ?? ''} spedito con il numero ${s.tracking.trim()}.` }));
  const reso = (o: any, v: any) => az.esegui(() => db.rpc('reso_vendita', { p_vendita: v.id, p_rimborso: Number(s.rimborso.replace(',', '.')), p_motivo: s.motivo, p_rivendibile: s.rivendibile }))
    .then((ok) => ok && set({ apri: '', cosa: '', rimborso: '', motivo: '', msg: s.rivendibile ? `Reso registrato: ${o.device?.modello ?? 'il PC'} è tra i resi in Inventario, da rimettere in vendita.` : `Reso registrato: ${o.device?.modello ?? 'il PC'} è fermo in Inventario.` }));
  const lista = O.filter((o) => has(q, o.riferimento, o.canale, o.device?.modello, o.device?.seriale, o.cliente, o.tracking));
  const statoO = (o: any) => { const v = vend(o); return v?.reso_il ? <Pill tone="red">Reso</Pill> : o.stato === 'Da preparare' ? <Pill>{o.stato}</Pill> : o.stato === 'Annullato' ? <Pill tone="red">{o.stato}</Pill> : <Pill tone="dark">{o.stato}</Pill>; };
  return (<>
    <p className="lbl" style={{ margin: 0 }}>Un solo inventario: quando un computer si vende su un sito, sparisce subito dagli altri.</p>
    {s.msg && <Msg>{s.msg}</Msg>}
    <Errore testo={az.errore} />
    <div className="glass tbox"><table className="t" style={{ minWidth: 900 }}><thead><tr><th>Ora</th><th>Sito</th><th>Marchio</th><th>Modello</th><th>Grado</th><th>Seriale</th><th>Posto</th><th>Stato</th><th /></tr></thead><tbody>
      {lista.length ? lista.map((o) => { const v = vend(o), qui = s.apri === o.id; return <React.Fragment key={o.id}><tr>
        <td>{quandoOrdine(o.creato_il)}</td><td>{o.canale}</td><td>{o.device?.marca ?? '—'}</td><td><b>{o.device?.modello ?? '—'}</b></td><td>{o.device?.grado && <Pill tone="dark">{o.device.grado}</Pill>}</td>
        <td>{o.device?.seriale ?? '—'}</td><td>{o.device?.bancali?.posti?.codice ?? '—'}</td>
        <td>{statoO(o)}</td>
        <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          {o.stato === 'Da preparare' && <Btn ghost sm disabled={az.inCorso} onClick={() => etichetta(o)}>Etichetta spedizione</Btn>}
          {/* Da decidere (STATO): «Spedito» (tracking) e «Reso» non sono nel mockup */}
        </span></td></tr>
        {qui && s.cosa === 'spedito' && <tr><td colSpan={9}><span className="row">
          <input className="input" style={{ maxWidth: 240 }} placeholder="Numero di spedizione" value={s.tracking} onChange={(e) => set({ tracking: e.target.value })} />
          <Btn sm onClick={() => spedito(o)} disabled={az.inCorso || !s.tracking.trim()}>Conferma</Btn><Btn ghost sm onClick={() => set({ apri: '' })}>Annulla</Btn></span></td></tr>}
        {qui && s.cosa === 'reso' && v && <tr><td colSpan={10}><span className="row">
          <label className="field"><span className="lbl">Rimborso €</span><input className="input" style={{ maxWidth: 110 }} inputMode="decimal" value={s.rimborso} onChange={(e) => set({ rimborso: e.target.value })} /></label>
          <label className="field"><span className="lbl">Motivo</span><input className="input" style={{ maxWidth: 260 }} value={s.motivo} onChange={(e) => set({ motivo: e.target.value })} /></label>
          <Chip on={s.rivendibile} onClick={() => set({ rivendibile: true })}>Rivendibile</Chip><Chip on={!s.rivendibile} onClick={() => set({ rivendibile: false })}>Fermo</Chip>
          <Btn sm onClick={() => reso(o, v)} disabled={az.inCorso || !s.motivo.trim() || s.rimborso.trim() === ''}>Conferma</Btn><Btn ghost sm onClick={() => set({ apri: '' })}>Annulla</Btn></span></td></tr>}
      </React.Fragment>; })
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
        {/* Da decidere (STATO): i tasti per segnare reset, sblocco e ticket non sono nel mockup (in prova li segna l'app) */}{void segna}
        <td>{x.stato === 'Ticket' ? 'Aperto' : x.ticket ?? '—'}</td>
        <td>{x.reset_fatto ? 'Fatto' : 'Da fare'}</td>
        <td>{x.sblocco_fatto ? 'Fatta' : 'Da fare'}</td>
        <td>{x.profili?.nome ?? '—'}</td>
        <td>{x.stato === 'Chiuso' ? <Pill tone="dark">Chiuso</Pill> : x.stato === 'Ticket' ? <Pill tone="red">{x.stato}</Pill> : <Pill>{x.stato}</Pill>}</td></tr>)
        : <tr><td colSpan={9} className="lbl">Nessun telefono.</td></tr>}
    </tbody></table></div>
    <p className="lbl" style={{ margin: 0 }}>I ticket arrivano dal portale del cliente; lo sblocco (account iCloud/Google e MDM) si fa sul loro sistema Habble.</p>
  </>);
}
