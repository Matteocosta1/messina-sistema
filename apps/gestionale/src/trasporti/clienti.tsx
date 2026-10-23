import React, { useEffect, useState } from 'react';
import { Btn, Chip, Msg, Pill, Warn } from '@messina/ui';
import { useApp, useAzione, useDati, eur, meseISO, oggiISO, Errore } from '../core';

const fmtData = (d: string | null | undefined) => d ? new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';   // dato mancante: «—» come nel mockup
const UNITA = ['spedizione', 'collo', 'bancale', 'kg', 'km', 'giorno', 'mese', 'ora', 'percentuale', 'pezzo'];
const comeSiConta = (u: string) => u === 'percentuale' ? 'in percentuale' : u === 'ora' ? 'ogni ora' : u === 'giorno' ? 'al giorno' : u === 'mese' ? 'al mese' : 'a ' + u;

// ------------------------------------------------------------------ Clienti
export function Clienti({ scelto, titolo }: { scelto?: string; titolo: (t: string | null) => void }) {
  const { vai, io } = useApp();
  const [nuovo, setNuovo] = useState(false);
  const [listino, setListino] = useState(false);
  const { dati } = useDati(async (d) => {
    const [clienti, bolle] = await Promise.all([
      d.from<any>('clienti').select('*').eq('azienda', 'trasporti').eq('attivo', true).order('nome'),
      d.from<any>('bolle').select('cliente_id').gte('data_consegna', meseISO() + '-01').neq('stato', 'Annullata'),
    ]);
    return { clienti, n: (id: string) => bolle.filter((b) => b.cliente_id === id).length };
  }, []);
  const c = dati?.clienti.find((x) => x.id === scelto);
  useEffect(() => { titolo(c?.nome ?? null); }, [c?.nome, titolo]);
  if (!dati) return null;
  if (c) return <Scheda c={c} />;
  return (<>
    {/* Da decidere (STATO): il Listino base (Listino) non è nel mockup */}
    <div className="row between"><Btn onClick={() => setNuovo(!nuovo)}>{nuovo ? 'Chiudi' : 'Nuovo cliente'}</Btn>{void io}{void listino}{void setListino}</div>
    {nuovo && <NuovoCliente onFatto={(id) => { setNuovo(false); vai('clienti/' + id); }} />}
    <div className="glass tbox"><table className="t"><thead><tr><th>Cliente</th><th>Cosa spedisce</th><th>Referente interno</th><th>Contratto fino al</th><th>Spedizioni mese</th></tr></thead><tbody>
      {dati.clienti.map((x) => <tr key={x.id} className="click" onClick={() => vai('clienti/' + x.id)}><td><b>{x.nome}</b>{x.stato === 'Potenziale' && <> <Pill tone="red">Potenziale</Pill></>}</td><td>{x.cosa_spedisce ?? '—'}</td><td>{x.referente_interno ?? '—'}</td><td>{fmtData(x.contratto_al)}</td><td>{dati.n(x.id)}</td></tr>)}
    </tbody></table></div>
  </>);
}

function NuovoCliente({ onFatto }: { onFatto: (id: string) => void }) {
  const { db } = useApp();
  const az = useAzione();
  const [v, setV] = useState({ nome: '', cosa_spedisce: '', referente_interno: '', email: '', piva: '', fatturazione: 'Mensile' });
  const campo = (k: keyof typeof v, l: string, type = 'text') => <label className="field"><span className="lbl">{l}</span><input className="input" type={type} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>;
  const salva = () => az.esegui(async () => { const r = await db.from<any>('clienti').insert({ ...v, azienda: 'trasporti' }).select('id'); onFatto(r[0].id); });
  return <div className="glass card stack">
    <h3 style={{ fontSize: 20 }}>Nuovo cliente</h3>
    <div className="grid g2">{campo('nome', 'Nome')}{campo('piva', 'Partita IVA')}{campo('email', 'Email per bolle e fatture', 'email')}{campo('cosa_spedisce', 'Cosa spedisce')}{campo('referente_interno', 'Referente interno')}
      <label className="field"><span className="lbl">Fatturazione</span><select className="input" value={v.fatturazione} onChange={(e) => setV({ ...v, fatturazione: e.target.value })}><option>Mensile</option><option>A spedizione</option></select></label></div>
    <Errore testo={az.errore} />
    <div className="row"><Btn onClick={salva} disabled={!v.nome.trim() || az.inCorso}>Salva</Btn></div>
  </div>;
}

// ------------------------------------------------------------------ Scheda cliente
const ANAG: [string, string, string?][] = [['piva', 'Partita IVA'], ['codice_fiscale', 'Codice fiscale'], ['indirizzo', 'Indirizzo'], ['cap', 'CAP'],
  ['citta', 'Città'], ['provincia', 'Provincia'], ['codice_destinatario', 'Codice destinatario'], ['pec', 'PEC'], ['email', 'Email', 'email']];
const SCAGLIONE: Record<string, string> = { peso: 'kg', colli: 'colli', km: 'km' };
const scaglione = (t: any) => !t.scaglione_su ? '—' : `${Number(t.scaglione_da).toLocaleString('it-IT')}${t.scaglione_a != null ? '–' + Number(t.scaglione_a).toLocaleString('it-IT') : '+'} ${SCAGLIONE[t.scaglione_su]}`;
const nuovaRiga = () => ({ voce: '', unita: 'spedizione', prezzo: '', minimo: '', zona: '', quando: '', scaglione_su: '', scaglione_da: '', scaglione_a: '' });

function Scheda({ c }: { c: any }) {
  const { db, vai, io } = useApp();
  const az = useAzione();
  const puoTariffe = io.ruolo === 'commerciale' || io.ruolo === 'direzione';
  const dir = io.ruolo === 'direzione';
  const [mod, setMod] = useState<null | { righe: Record<string, { prezzo: string; minimo: string }>; nuove: any[]; dal: string }>(null);
  const [anag, setAnag] = useState<null | Record<string, any>>(null);
  const [msg, setMsg] = useState('');
  const { dati } = useDati(async (d) => {
    const [tariffe, manca] = await Promise.all([
      d.from<any>('tariffe').select('*').eq('cliente_id', c.id).in('stato', ['Attiva', 'Da approvare']).order('voce'),
      d.rpc<string[]>('anagrafica_mancante', { p_cliente: c.id }),
    ]);
    const oggi = oggiISO();
    return { tariffe: tariffe.filter((t) => !t.valida_al || t.valida_al >= oggi), manca: manca ?? [] };
  }, [c.id]);
  if (!dati) return null;
  const T = dati.tariffe;
  const base = T.filter((t) => t.voce === 'Base'), extra = T.filter((t) => t.voce !== 'Base');
  const salva = () => az.prendi(async () => {
    const righe: any[] = [];
    for (const t of T) { const v = mod!.righe[t.id]; if (v && (Number(v.prezzo) !== Number(t.prezzo) || (v.minimo === '' ? null : Number(v.minimo)) !== (t.minimo == null ? null : Number(t.minimo))))
      righe.push({ id: t.id, prezzo: Number(v.prezzo), minimo: v.minimo === '' ? null : Number(v.minimo) }); }
    for (const n of mod!.nuove) if (n.voce.trim() && n.prezzo !== '') righe.push({ voce: n.voce.trim(), unita: n.unita, prezzo: Number(n.prezzo), minimo: n.minimo === '' ? null : Number(n.minimo),
      zona: n.zona || null, quando: n.quando || null, scaglione_su: n.scaglione_su || null, scaglione_da: n.scaglione_su ? Number(n.scaglione_da || 0) : null,
      scaglione_a: n.scaglione_su && n.scaglione_a !== '' ? Number(n.scaglione_a) : null });
    if (!righe.length) return 0;
    return db.rpc<number>('salva_tariffe', { p_cliente: c.id, p_righe: righe, p_dal: mod!.dal });
  }).then((n) => { if (n === undefined) return; setMod(null); setMsg(n ? 'Tariffe salvate. Quelle sotto il listino, di un cliente nuovo o con una data passata aspettano la Direzione: fino ad allora vale il prezzo di prima.' : 'Nessun prezzo cambiato.'); });
  const approva = (t: any, ok: boolean) => az.esegui(() => db.rpc('approva_tariffa', { p_id: t.id, p_ok: ok })).then((x) => x && setMsg(ok ? `${t.voce} approvata: vale dal ${fmtData(t.valida_dal)}.` : `${t.voce} rifiutata: resta il prezzo di prima.`));
  const salvaAnag = () => az.esegui(() => db.from('clienti').update({ ...anag, provincia: anag!.provincia ? String(anag!.provincia).toUpperCase() : null }).eq('id', c.id))
    .then((x) => x && setAnag(null));
  const contratto = async () => {
    const percorso = `contratti/${c.id}.pdf`;
    try { const u = await db.storage.link('documenti', percorso); if (u) { window.open(u, '_blank', 'noopener'); return; } } catch { /* non c'è ancora: si carica */ }
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/pdf';
    i.onchange = () => { const f = i.files?.[0]; if (f) az.esegui(() => db.storage.carica('documenti', percorso, f)); }; i.click();
  };
  const inp = (val: string, set: (v: string) => void, l: string, w = 110, type = 'text') => <input className="input" type={type} aria-label={l} placeholder={l} value={val}
    style={{ minWidth: w, width: w, minHeight: 34, padding: '4px 8px' }} onChange={(e) => set(e.target.value)} />;
  const cambiaNuova = (n: any, k: string, v: string) => setMod({ ...mod!, nuove: mod!.nuove.map((x) => x === n ? { ...x, [k]: v } : x) });
  const prezzo = (t: any) => mod && t.stato === 'Attiva'
    ? inp(mod.righe[t.id]?.prezzo ?? String(t.prezzo), (v) => setMod({ ...mod, righe: { ...mod.righe, [t.id]: { prezzo: v, minimo: mod.righe[t.id]?.minimo ?? (t.minimo == null ? '' : String(t.minimo)) } } }), 'Prezzo ' + t.voce, 90, 'number')
    : eur(Number(t.prezzo));
  const minimo = (t: any) => mod && t.stato === 'Attiva'
    ? inp(mod.righe[t.id]?.minimo ?? (t.minimo == null ? '' : String(t.minimo)), (v) => setMod({ ...mod, righe: { ...mod.righe, [t.id]: { prezzo: mod.righe[t.id]?.prezzo ?? String(t.prezzo), minimo: v } } }), 'Minimo ' + t.voce, 80, 'number')
    : t.minimo != null ? eur(Number(t.minimo)) : '—';
  const stato = (t: any) => t.stato === 'Da approvare'
    ? <span className="row" style={{ gap: 6 }}><Pill tone="red">Da approvare</Pill>{dir && !mod && <><Btn sm onClick={() => approva(t, true)} disabled={az.inCorso}>Approva</Btn><Btn ghost sm onClick={() => approva(t, false)} disabled={az.inCorso}>Rifiuta</Btn></>}
      {t.motivo && <span className="lbl">{t.motivo}</span>}</span>
    : <span className="lbl">dal {fmtData(t.valida_dal)}</span>;
  // colonne del mockup; Scaglione, Minimo e Stato (approvazione) compaiono solo modificando le tariffe o quando ci sono (Da decidere, STATO)
  const extraCol = mod || T.some((t) => t.scaglione_su || t.minimo != null || t.stato !== 'Attiva');
  const tabBase = (righe: any[], vuoto: string) => <div className="tbox"><table className="t"><thead><tr><th>Voce</th><th>Unità</th><th>Zona</th>{extraCol && <><th>Scaglione</th><th>Minimo</th></>}<th>Prezzo</th>{extraCol && <th>Stato</th>}</tr></thead><tbody>
    {righe.map((t) => <tr key={t.id}><td><b>{t.voce}</b></td><td>{comeSiConta(t.unita)}</td><td>{t.zona ?? '—'}</td>{extraCol && <><td>{scaglione(t)}</td><td>{minimo(t)}</td></>}<td>{prezzo(t)}</td>{extraCol && <td>{stato(t)}</td>}</tr>)}
    {!righe.length && <tr><td colSpan={7} className="lbl">{vuoto}</td></tr>}
  </tbody></table></div>;
  const tabExtra = (righe: any[], vuoto: string) => <div className="tbox"><table className="t"><thead><tr><th>Voce</th><th>Come si conta</th>{extraCol && <><th>Zona</th><th>Scaglione</th><th>Minimo</th></>}<th>Prezzo</th><th>Quando scatta</th>{extraCol && <th>Stato</th>}</tr></thead><tbody>
    {righe.map((t) => <tr key={t.id}><td><b>{t.voce}</b></td><td>{comeSiConta(t.unita)}</td>{extraCol && <><td>{t.zona ?? '—'}</td><td>{scaglione(t)}</td><td>{minimo(t)}</td></>}<td>{prezzo(t)}</td><td className="lbl">{t.quando ?? '—'}</td>{extraCol && <td>{stato(t)}</td>}</tr>)}
    {!righe.length && <tr><td colSpan={8} className="lbl">{vuoto}</td></tr>}
  </tbody></table></div>;
  return (<>
    <div className="row between"><Btn ghost onClick={() => vai('clienti')}>Tutti i clienti</Btn>
      <div className="row"><Btn ghost sm onClick={contratto}>Contratto PDF</Btn>
        {puoTariffe && !anag && (mod ? <><Btn sm onClick={salva} disabled={az.inCorso}>Salva</Btn><Btn ghost sm onClick={() => setMod(null)}>Annulla</Btn></>
          : <Btn sm onClick={() => { setMsg(''); setMod({ righe: {}, nuove: [], dal: oggiISO() }); }}>Modifica tariffe</Btn>)}</div></div>
    {msg && <Msg>{msg}</Msg>}
    <Errore testo={az.errore} />
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Cosa spedisce</div><b>{c.cosa_spedisce ?? '—'}</b>{c.stato === 'Potenziale' && <div style={{ marginTop: 6 }}><Pill tone="red">Potenziale</Pill></div>}</div>
      <div className="glass card"><div className="lbl">Referente interno</div><b>{c.referente_interno ?? '—'}</b></div>
      <div className="glass card"><div className="lbl">Contratto</div><b>dal {fmtData(c.contratto_dal)} al {fmtData(c.contratto_al)}</b></div>
      <div className="glass card"><div className="lbl">Fatturazione</div><b>{c.fatturazione ?? '—'}</b></div>
    </div>
    {/* Da decidere (STATO): «Anagrafica per la fattura» (P.IVA, PEC, codice destinatario, IVA, split payment, asset) non è nel mockup */}
    {anag && <><div className="glass card stack">
      <div className="row between"><b>Anagrafica per la fattura</b>{dati.manca.length > 0 && !anag && <span className="miss">Manca: {dati.manca.join(', ')}</span>}</div>
      {anag ? <>
        <div className="grid g2">{ANAG.map(([k, l, type]) => <label key={k} className="field"><span className="lbl">{l}</span><input className="input" type={type ?? 'text'} value={anag[k]} maxLength={k === 'provincia' ? 2 : k === 'cap' ? 5 : undefined}
          onChange={(e) => setAnag({ ...anag, [k]: e.target.value })} /></label>)}
          <label className="field"><span className="lbl">IVA</span><select className="input" value={anag.iva_natura} onChange={(e) => setAnag({ ...anag, iva_natura: e.target.value })}>
            <option value="">22%</option><option value="N3.1">Non imponibile, esportazione (N3.1)</option><option value="N3.2">Non imponibile, cessione UE (N3.2)</option><option value="N2.1">Fuori campo (N2.1)</option></select></label>
          <label className="field"><span className="lbl">Split payment</span><select className="input" value={anag.split_payment ? 'si' : 'no'} onChange={(e) => setAnag({ ...anag, split_payment: e.target.value === 'si' })}>
            <option value="no">No</option><option value="si">Sì: ente pubblico, l’IVA la versa lui</option></select></label>
          <label className="field"><span className="lbl">Asset</span><select className="input" value={anag.traccia_asset ? 'si' : 'no'} onChange={(e) => setAnag({ ...anag, traccia_asset: e.target.value === 'si' })}>
            <option value="no">No</option><option value="si">Sì: ogni IMEI con cespite e utente, live nel portale</option></select></label></div>
        <div className="grid g2"><label className="field"><span className="lbl">Eccezioni e accordi</span><textarea value={anag.eccezioni} onChange={(e) => setAnag({ ...anag, eccezioni: e.target.value })} /></label>
          <label className="field"><span className="lbl">Cosa chiede il cliente</span><textarea value={anag.esigenze} onChange={(e) => setAnag({ ...anag, esigenze: e.target.value })} /></label></div>
        <div className="row"><Btn onClick={salvaAnag} disabled={az.inCorso}>Salva</Btn><Btn ghost onClick={() => setAnag(null)}>Annulla</Btn></div>
      </> : <div className="kv">{ANAG.map(([k, l]) => <div key={k}><div className="lbl">{l}</div><b>{c[k] || '—'}</b></div>)}
        <div><div className="lbl">IVA</div><b>{c.iva_natura ? 'Natura ' + c.iva_natura : Number(c.iva_aliquota ?? 22) + '%'}{c.split_payment ? ' · split payment' : ''}</b></div>
        <div><div className="lbl">Asset</div><b>{c.traccia_asset ? 'Sì' : 'No'}</b></div></div>}
    </div></>}
    <div className="glass"><div style={{ padding: '14px 14px 0', fontWeight: 700 }}>Tariffa base</div>{tabBase(base, puoTariffe ? 'Nessuna tariffa base: premi «Tariffe».' : 'Nessuna tariffa base: la inserisce il commerciale.')}</div>
    <div className="glass"><div style={{ padding: '14px 14px 0', fontWeight: 700 }}>Accessori e voci extra</div>{tabExtra(extra, 'Nessuna voce extra.')}
      {mod && <div className="stack" style={{ padding: 14, gap: 8 }}>
        {mod.nuove.map((n, i) => <div key={i} className="row" style={{ gap: 6 }}>
          {inp(n.voce, (v) => cambiaNuova(n, 'voce', v), 'Voce', 130)}
          <select className="input" aria-label="Come si conta" style={{ width: 140, minHeight: 34, padding: '4px 8px' }} value={n.unita} onChange={(e) => cambiaNuova(n, 'unita', e.target.value)}>{UNITA.map((u) => <option key={u} value={u}>{comeSiConta(u)}</option>)}</select>
          {inp(n.prezzo, (v) => cambiaNuova(n, 'prezzo', v), n.unita === 'percentuale' ? '%' : 'Prezzo', 80, 'number')}
          {inp(n.minimo, (v) => cambiaNuova(n, 'minimo', v), 'Minimo', 80, 'number')}
          {inp(n.zona, (v) => cambiaNuova(n, 'zona', v), 'Zona', 100)}
          <select className="input" aria-label="Scaglione" style={{ width: 120, minHeight: 34, padding: '4px 8px' }} value={n.scaglione_su} onChange={(e) => cambiaNuova(n, 'scaglione_su', e.target.value)}>
            <option value="">Senza scaglione</option><option value="peso">Scaglione kg</option><option value="colli">Scaglione colli</option><option value="km">Scaglione km</option></select>
          {n.scaglione_su && <>{inp(n.scaglione_da, (v) => cambiaNuova(n, 'scaglione_da', v), 'Da', 70, 'number')}{inp(n.scaglione_a, (v) => cambiaNuova(n, 'scaglione_a', v), 'A (vuoto = oltre)', 120, 'number')}</>}
          {inp(n.quando, (v) => cambiaNuova(n, 'quando', v), 'Quando scatta', 160)}
        </div>)}
        <div className="row"><Btn ghost sm onClick={() => setMod({ ...mod, nuove: [...mod.nuove, nuovaRiga()] })}>Aggiungi</Btn>
          <label className="row" style={{ gap: 6 }}><span className="lbl">Valgono dal</span><input className="input" type="date" value={mod.dal} style={{ width: 160, minHeight: 34, padding: '4px 8px' }} onChange={(e) => setMod({ ...mod, dal: e.target.value })} /></label></div>
        <span className="lbl">Un prezzo cambiato non cancella il vecchio: il vecchio vale fino al giorno prima, così le bolle già fatte restano col loro prezzo. Serve la Direzione sotto il listino base, per un cliente nuovo o per una data passata (possibile solo se le bolle di quei giorni non sono già in una fattura inviata).</span>
      </div>}
    </div>
    <div className="grid g2"><div className="glass card"><b>Eccezioni e accordi</b><p style={{ margin: '8px 0 0' }}>{c.eccezioni || '[sconti, minimi, accordi particolari: li inserisce la Direzione]'}</p></div>
      <div className="glass card"><b>Cosa chiede il cliente</b><p style={{ margin: '8px 0 0' }}>{c.esigenze || '—'}</p></div></div>
  </>);
}

// ------------------------------------------------------------------ Listino base (lo cambia la Direzione)
export function Listino() {
  const { db, io } = useApp();
  const az = useAzione();
  const dir = io.ruolo === 'direzione';
  const [nuova, setNuova] = useState<any | null>(null);
  const { dati } = useDati((d) => d.from<any>('listino').select('*').order('voce'), []);
  if (!dati) return null;
  const salva = () => az.esegui(() => db.from('listino').insert({ voce: nuova.voce.trim(), unita: nuova.unita, prezzo: Number(nuova.prezzo), zona: nuova.zona || null,
    minimo: nuova.minimo === '' ? null : Number(nuova.minimo), scaglione_su: nuova.scaglione_su || null, scaglione_da: nuova.scaglione_su ? Number(nuova.scaglione_da || 0) : null,
    scaglione_a: nuova.scaglione_su && nuova.scaglione_a !== '' ? Number(nuova.scaglione_a) : null })).then((x) => x && setNuova(null));
  const togli = (id: string) => az.esegui(() => db.from('listino').delete().eq('id', id));
  const f = (k: string, l: string, w = 110, type = 'text') => <input className="input" type={type} aria-label={l} placeholder={l} value={nuova[k]} style={{ width: w, minHeight: 34, padding: '4px 8px' }} onChange={(e) => setNuova({ ...nuova, [k]: e.target.value })} />;
  return <div className="glass stack" style={{ gap: 0 }}>
    <div className="row between" style={{ padding: 14 }}><b>Listino base</b><span className="lbl">Un prezzo cliente più basso di questo aspetta la Direzione.</span></div>
    <div className="tbox"><table className="t"><thead><tr><th>Voce</th><th>Come si conta</th><th>Zona</th><th>Scaglione</th><th>Minimo</th><th>Prezzo</th>{dir && <th />}</tr></thead><tbody>
      {dati.map((t) => <tr key={t.id}><td><b>{t.voce}</b></td><td>{comeSiConta(t.unita)}</td><td>{t.zona ?? '—'}</td><td>{scaglione(t)}</td><td>{t.minimo != null ? eur(Number(t.minimo)) : '—'}</td><td>{eur(Number(t.prezzo))}</td>
        {dir && <td><Btn ghost sm onClick={() => togli(t.id)} disabled={az.inCorso}>Togli</Btn></td>}</tr>)}
      {!dati.length && <tr><td colSpan={7} className="lbl">Listino vuoto: lo compila la Direzione.</td></tr>}
    </tbody></table></div>
    <Errore testo={az.errore} />
    {dir && <div className="row" style={{ padding: 14, gap: 6 }}>{nuova ? <>
      {f('voce', 'Voce', 120)}<select className="input" aria-label="Come si conta" style={{ width: 140, minHeight: 34, padding: '4px 8px' }} value={nuova.unita} onChange={(e) => setNuova({ ...nuova, unita: e.target.value })}>{UNITA.map((u) => <option key={u} value={u}>{comeSiConta(u)}</option>)}</select>
      {f('prezzo', 'Prezzo', 80, 'number')}{f('minimo', 'Minimo', 80, 'number')}{f('zona', 'Zona', 100)}
      <select className="input" aria-label="Scaglione" style={{ width: 120, minHeight: 34, padding: '4px 8px' }} value={nuova.scaglione_su} onChange={(e) => setNuova({ ...nuova, scaglione_su: e.target.value })}>
        <option value="">Senza scaglione</option><option value="peso">Scaglione kg</option><option value="colli">Scaglione colli</option><option value="km">Scaglione km</option></select>
      {nuova.scaglione_su && <>{f('scaglione_da', 'Da', 70, 'number')}{f('scaglione_a', 'A', 70, 'number')}</>}
      <Btn sm onClick={salva} disabled={!nuova.voce.trim() || nuova.prezzo === '' || az.inCorso}>Salva</Btn><Btn ghost sm onClick={() => setNuova(null)}>Annulla</Btn></>
      : <Btn ghost sm onClick={() => setNuova(nuovaRiga())}>Aggiungi</Btn>}</div>}
  </div>;
}

// ------------------------------------------------------------------ Fatturazione
const mesePrima = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const nomeMese = (m: string) => { const s = new Date(m + '-15T12:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); };
const APERTE = ['Bozza', 'Da controllare', 'Pronta'];
const pillStato = (f: any) => f.stato === 'Pronta' ? <Pill tone="dark">Pronta</Pill> : f.stato === 'Pagata' ? <Pill tone="ok">Pagata</Pill> : f.stato === 'Inviata' ? <Pill tone="ok">Inviata</Pill>
  : f.stato === 'Da controllare' ? <Pill tone="red">Da controllare</Pill> : <Pill>{f.stato}</Pill>;

export function Fatturazione() {
  const { db, io } = useApp();
  const sola = io.ruolo === 'commercialista';   // il commercialista legge, non cambia
  const az = useAzione();
  const [mese, setMese] = useState(meseISO());
  const [msg, setMsg] = useState('');
  const [aperta, setAperta] = useState<string | null>(null);
  const [nuova, setNuova] = useState(false);
  const { dati } = useDati((d) => d.from<any>('fatture').select('*,clienti(nome),fatture_bolle(bolla_id,valida),righe_fattura(voce,quantita)').eq('azienda', 'trasporti').order('creata_il', { ascending: false }).limit(300), []);
  if (!dati) return null;
  const F = dati.filter((f) => f.periodo === mese || APERTE.includes(f.stato) || (f.stato === 'Inviata' && f.periodo < mese));
  const pronte = F.filter((f) => f.stato === 'Pronta');
  // consegne della fattura: le bolle collegate; per le fatture senza collegamento, le righe della tariffa base (una per spedizione)
  const nBolle = (f: any) => (f.fatture_bolle ?? []).filter((x: any) => x.valida).length
    || (f.righe_fattura ?? []).filter((r: any) => /^(Base|Consegna|Ritiro e consegna|Spedizion)/i.test(r.voce)).reduce((n: number, r: any) => n + Number(r.quantita), 0);
  const chiudi = () => az.prendi(() => db.rpc<number>('chiudi_mese', { p_mese: mese })).then((n) => n !== undefined && setMsg(n
    ? `${nomeMese(mese)}: ${n} ${n === 1 ? 'fattura preparata' : 'fatture preparate'} con tutte le bolle consegnate e non ancora fatturate. Quelle «Da controllare» dicono cosa manca.`
    : `${nomeMese(mese)}: nessuna bolla nuova da fatturare.`));
  const invia = (lista: any[]) => az.esegui(async () => { for (const f of lista) await db.fn('fatture-in-cloud', { fattura_id: f.id }); })
    .then((ok) => ok && setMsg(`${lista.length === 1 ? 'Fattura inviata' : lista.length + ' fatture inviate'} a Fatture in Cloud, che le manda allo SdI. L’esito arriva da solo in questa pagina.`));
  const esiti = () => az.prendi(() => db.fn<any>('fatture-in-cloud', { azione: 'esiti' })).then((r) => r && setMsg(`Esiti aggiornati: ${r.scartate ? r.scartate + ' scartate dallo SdI, da correggere' : 'nessuno scarto'}.`));
  const cur = dati.find((f) => f.id === aperta);
  if (cur) return <Dettaglio f={cur} sola={sola} onChiudi={(t) => { setAperta(null); if (t) setMsg(t); }} />;
  // Da decidere (STATO): scelta del mese, «Chiudi mese», «Esiti», colonne Mese/Bolle/Imponibile/IVA/SdI non sono nel mockup.
  // Le fatture del mese le prepara comunque «Chiudi mese» (rpc chiudi_mese), che resta nel codice.
  void chiudi; void esiti; void setMese; void mesePrima;
  const pagata = (f: any) => az.esegui(() => db.from('fatture').update({ stato: 'Pagata' }).eq('id', f.id)).then((ok) => ok && setMsg(`Pagamento di ${f.clienti?.nome} registrato: sale l’Incassato in Home.`));
  // come nel mockup: «Sabato ×3 · Giacenza ×1», una voce per tipo (la descrizione dopo « · » resta nella fattura)
  const voci = (f: any) => {
    const m = new Map<string, number>();
    for (const r of f.righe_fattura ?? []) { const v = String(r.voce).split(' · ')[0]; if (!/^(Base|Consegna|Ritiro e consegna|Spedizion)/i.test(v)) m.set(v, (m.get(v) ?? 0) + Number(r.quantita)); }
    return [...m].map(([v, q]) => `${v} ×${q.toLocaleString('it-IT')}`).join(' · ') || '—';
  };
  return (<>
    <div className="glass tbox"><table className="t"><thead><tr><th>Cliente</th><th>Consegne</th><th>Accessori ed extra</th><th>Totale</th><th>Stato</th><th>Incasso</th></tr></thead><tbody>
      {F.map((f) => <tr key={f.id} className="click" onClick={() => setAperta(f.id)}>
        <td><b>{f.clienti?.nome}</b></td><td>{nBolle(f) || '—'}</td><td>{voci(f)}</td><td>{eur(Number(f.totale))}</td><td>{pillStato(f)}</td>
        <td onClick={(e) => e.stopPropagation()}>{f.stato === 'Pagata' ? <Pill tone="ok">Pagata</Pill> : f.stato === 'Inviata' && !sola ? <Btn ghost sm onClick={() => pagata(f)} disabled={az.inCorso}>Pagata</Btn> : <span className="lbl">—</span>}</td></tr>)}
      {!F.length && <tr><td colSpan={6} className="lbl">Nessuna fattura per {nomeMese(mese).toLowerCase()}.</td></tr>}
    </tbody></table></div>
    {msg && <Msg>{msg}</Msg>}
    <Errore testo={az.errore} />
    {!sola && <div className="row"><Btn onClick={() => invia(pronte)} disabled={az.inCorso || !pronte.length}>Invia</Btn><Btn ghost onClick={() => setNuova(!nuova)}>{nuova ? 'Chiudi' : 'Nuova'}</Btn>
      <span className="lbl">Ogni voce della fattura rimanda alla sua consegna. Quando il cliente paga, premi «Pagata»: sale l’Incassato in Home.</span></div>}
    {nuova && <NuovaFattura onFatto={(id) => { setNuova(false); setAperta(id); }} />}
  </>);
}

function NuovaFattura({ onFatto }: { onFatto: (id: string) => void }) {
  const { db } = useApp();
  const az = useAzione();
  const [cliente, setCliente] = useState('');
  const { dati: clienti } = useDati((d) => d.from<any>('clienti').select('id,nome').eq('azienda', 'trasporti').eq('attivo', true).eq('stato', 'Attivo').order('nome'), []);
  const crea = () => az.prendi(async () => { const r = await db.from<any>('fatture').insert({ azienda: 'trasporti', cliente_id: cliente, periodo: meseISO(), stato: 'Bozza' }).select('id'); return r[0].id as string; })
    .then((id) => id && onFatto(id));
  return <div className="glass card row" style={{ alignItems: 'flex-end' }}>
    <label className="field" style={{ flex: '1 1 240px' }}><span className="lbl">Fattura a mano (voci fuori dalle bolle)</span><select className="input" value={cliente} onChange={(e) => setCliente(e.target.value)}><option value="">Scegli il cliente</option>{clienti?.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
    <Btn onClick={crea} disabled={!cliente || az.inCorso}>Crea</Btn><Errore testo={az.errore} /></div>;
}

/** una fattura: righe (modificabili prima dell'invio), bolle collegate, passaggi di stato */
function Dettaglio({ f, sola, onChiudi }: { f: any; sola: boolean; onChiudi: (msg?: string) => void }) {
  const { db, vai } = useApp();
  const az = useAzione();
  const aperta = APERTE.includes(f.stato) && !sola;
  const [righe, setRighe] = useState<any[] | null>(null);
  const [motivo, setMotivo] = useState<{ cosa: 'annulla' | 'nota'; testo: string } | null>(null);
  const [msg, setMsg] = useState('');
  const { dati } = useDati(async (d) => {
    const ids = (f.fatture_bolle ?? []).filter((x: any) => x.valida).map((x: any) => x.bolla_id);
    const [R, bolle, manca] = await Promise.all([
      d.from<any>('righe_fattura').select('*').eq('fattura_id', f.id),
      ids.length ? d.from<any>('bolle').select('id,numero,data_consegna,citta,colli_previsti').in('id', ids).order('data_consegna') : Promise.resolve([] as any[]),
      d.rpc<string[]>('anagrafica_mancante', { p_cliente: f.cliente_id }),
    ]);
    return { R, bolle, manca: manca ?? [] };
  }, [f.id]);
  if (!dati) return null;
  const R = righe ?? dati.R;
  const modificata = !!righe;
  const cambia = (r: any, k: string, v: string) => setRighe(R.map((x) => x === r ? { ...x, [k]: v } : x));
  const salva = () => az.esegui(async () => {
    const ora = R.filter((r) => String(r.voce).trim() && Number(r.quantita));
    const togli = dati.R.filter((r) => !ora.some((x) => x.id === r.id));
    for (const r of togli) await db.from('righe_fattura').delete().eq('id', r.id);
    for (const r of ora) {
      if (!r.id) await db.from('righe_fattura').insert({ fattura_id: f.id, voce: String(r.voce).trim(), quantita: Number(r.quantita), prezzo: Number(r.prezzo) });
      else { const p = dati.R.find((x) => x.id === r.id); if (p && (p.voce !== r.voce || Number(p.quantita) !== Number(r.quantita) || Number(p.prezzo) !== Number(r.prezzo)))
        await db.from('righe_fattura').update({ voce: String(r.voce).trim(), quantita: Number(r.quantita), prezzo: Number(r.prezzo) }).eq('id', r.id); }
    }
  }).then((x) => { if (x) { setRighe(null); setMsg('Righe salvate: totali e IVA ricalcolati. La fattura torna in bozza: riguardala e premi «Pronta».'); } });
  const passa = (stato: string) => az.esegui(() => db.from('fatture').update({ stato }).eq('id', f.id));
  const ricontrolla = () => az.prendi(() => db.rpc<string | null>('ricontrolla_fattura', { p_fattura: f.id })).then((p) => p !== undefined && setMsg(p ? 'Ancora da controllare: ' + p : 'Tutto in regola: la fattura è pronta.'));
  const invia = () => az.esegui(() => db.fn('fatture-in-cloud', { fattura_id: f.id })).then((x) => x && onChiudi('Fattura inviata a Fatture in Cloud, che la manda allo SdI. L’esito arriva da solo.'));
  const conferma = () => az.esegui(() => motivo!.cosa === 'annulla' ? db.rpc('annulla_fattura', { p_fattura: f.id, p_motivo: motivo!.testo }) : db.rpc('nota_di_credito', { p_fattura: f.id, p_motivo: motivo!.testo }))
    .then((x) => x && onChiudi(motivo!.cosa === 'annulla' ? 'Fattura annullata: le sue bolle tornano da fatturare.' : 'Nota di credito creata in bozza con le stesse righe: correggila se serve, poi «Pronta» e «Invia». Quando lo SdI la prende, la fattura risulta stornata e le bolle tornano da fatturare.'));
  const cella = (r: any, k: string, w: number, l: string, type = 'number') => aperta
    ? <input className="input" type={type} aria-label={l} style={{ width: w, minHeight: 34, padding: '4px 8px' }} value={r[k]} onChange={(e) => cambia(r, k, e.target.value)} />
    : type === 'number' && k === 'prezzo' ? eur(Number(r[k])) : String(r[k]);
  return (<>
    <div className="row between"><Btn ghost onClick={() => onChiudi()}>Tutte le fatture</Btn>{pillStato(f)}</div>
    <div className="glass card stack">
      <div className="row between"><h3 style={{ fontSize: 22, letterSpacing: '-.02em' }}>{f.tipo === 'Nota di credito' ? 'Nota di credito · ' : ''}{f.clienti?.nome}</h3>
        <span className="lbl">{f.numero ? 'N. ' + f.numero : 'Numero e data li assegna Fatture in Cloud'}{f.periodo ? ' · ' + nomeMese(f.periodo) : ''}</span></div>
      {f.problema && <Warn>{f.problema}</Warn>}
      {dati.manca.length > 0 && aperta && <Msg azione="Apri la scheda" onAzione={() => vai('clienti/' + f.cliente_id)}>Nella scheda del cliente manca: {dati.manca.join(', ')}. Senza, la fattura elettronica viene scartata.</Msg>}
      {f.motivo && <div className="lbl">Motivo: {f.motivo}</div>}
      <div className="tbox"><table className="t"><thead><tr><th>Voce</th><th>Quantità</th><th>Prezzo</th><th>Totale</th>{aperta && <th />}</tr></thead><tbody>
        {R.map((r, i) => <tr key={r.id ?? 'n' + i}><td>{cella(r, 'voce', 260, 'Voce', 'text')}</td><td>{cella(r, 'quantita', 90, 'Quantità')}</td><td>{cella(r, 'prezzo', 100, 'Prezzo')}</td>
          <td>{eur(Number(r.quantita || 0) * Number(r.prezzo || 0))}</td>{aperta && <td><Btn ghost sm onClick={() => setRighe(R.filter((x) => x !== r))}>Togli</Btn></td>}</tr>)}
        {!R.length && <tr><td colSpan={5} className="lbl">Nessuna riga.</td></tr>}
      </tbody></table></div>
      {aperta && <div className="row"><Btn ghost sm onClick={() => setRighe([...R, { voce: '', quantita: 1, prezzo: 0 }])}>Aggiungi</Btn>{modificata && <><Btn sm onClick={salva} disabled={az.inCorso}>Salva</Btn><Btn ghost sm onClick={() => setRighe(null)}>Annulla</Btn></>}</div>}
      <div className="kv">
        <div><div className="lbl">Imponibile</div><b>{eur(Number(f.imponibile))}</b></div>
        <div><div className="lbl">IVA</div><b>{eur(Number(f.iva))}{f.split_payment ? ' (split payment: la versa il cliente)' : ''}</b></div>
        <div><div className="lbl">Totale da incassare</div><b>{eur(Number(f.totale))}</b></div>
        {f.sdi_esito && <div><div className="lbl">SdI</div><b>{f.sdi_esito}</b></div>}
      </div>
      {modificata && <span className="lbl">I totali si aggiornano quando salvi: li calcola il programma dalle righe.</span>}
      {msg && <Msg>{msg}</Msg>}
      <Errore testo={az.errore} />
      {sola ? null : motivo ? <div className="stack" style={{ gap: 8 }}>
        <label className="field"><span className="lbl">{motivo.cosa === 'annulla' ? 'Perché la annulli' : 'Motivo della nota di credito'}</span><input className="input" value={motivo.testo} onChange={(e) => setMotivo({ ...motivo, testo: e.target.value })} /></label>
        <div className="row"><Btn onClick={conferma} disabled={!motivo.testo.trim() || az.inCorso}>Conferma</Btn><Btn ghost onClick={() => setMotivo(null)}>Annulla</Btn></div></div>
      : <div className="row">
        {aperta && dati.bolle.length > 0 && <Btn ghost onClick={ricontrolla} disabled={az.inCorso || modificata}>Ricontrolla</Btn>}
        {(f.stato === 'Bozza' || f.stato === 'Da controllare') && <Btn onClick={() => passa('Pronta')} disabled={az.inCorso || modificata || !!f.problema}>Pronta</Btn>}
        {f.stato === 'Pronta' && <Btn onClick={invia} disabled={az.inCorso || modificata}>Invia</Btn>}
        {f.stato === 'Inviata' && <Btn onClick={() => passa('Pagata')} disabled={az.inCorso}>Pagata</Btn>}
        {f.stato === 'Inviata' && f.tipo === 'Fattura' && <Btn ghost onClick={() => setMotivo({ cosa: 'nota', testo: '' })}>Nota di credito</Btn>}
        {aperta && <Btn ghost onClick={() => setMotivo({ cosa: 'annulla', testo: '' })}>Annulla fattura</Btn>}
      </div>}
    </div>
    {dati.bolle.length > 0 && <div className="glass"><div style={{ padding: '14px 14px 0', fontWeight: 700 }}>Bolle in questa fattura · {dati.bolle.length}</div><div className="tbox"><table className="t"><thead><tr><th>Bolla</th><th>Consegnata</th><th>Città</th><th>Colli</th></tr></thead><tbody>
      {dati.bolle.map((b) => <tr key={b.id} className="click" onClick={() => vai('bolle/' + b.id)}><td><b>{b.numero}</b></td><td>{fmtData(b.data_consegna)}</td><td>{b.citta ?? '—'}</td><td>{b.colli_previsti ?? '—'}</td></tr>)}
    </tbody></table></div></div>}
  </>);
}
