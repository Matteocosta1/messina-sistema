// Presenze: il badge virtuale (presApp del mockup approvato) e il Lettore all'ingresso.
import React, { useEffect, useRef, useState } from 'react';
import { useApp, useDati, hm, Mese, Esito, vibra } from './core';
import { qrSvg } from './qr';
import { usePistola, useFotocameraCodici } from './scanner';
import type { Db } from '@messina/dati';

/** identificativo di questo telefono: si crea una volta e resta sul telefono */
export function dispositivo() {
  const K = 'messina.dispositivo';
  try { let d = localStorage.getItem(K); if (!d) { d = crypto.randomUUID(); localStorage.setItem(K, d); } return d; }
  catch { return 'senza-memoria'; }
}
const nomeTelefono = (nome: string) => (/iPhone/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'telefono Android' : 'questo dispositivo') + ' di ' + nome;
const inizioMese = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const inizioOggi = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

export function Presenze() {
  const { db, dip } = useApp();
  const [codice, setCodice] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [left, setLeft] = useState(30 - Math.floor(Date.now() / 1000) % 30);
  const finestra = useRef(-1);
  const [scelto, setScelto] = useState<'Entrata' | 'Uscita' | null>(null);
  const disp = dispositivo();

  const chiedi = async () => {
    try { setCodice(await db.rpc<string>('mio_qr', { p_dispositivo: disp })); setErrore(null); }
    catch (e) {
      const m = String((e as Error).message);
      if (/non è registrato/i.test(m)) {
        try { await db.rpc('registra_telefono', { p_dispositivo: disp }); setCodice(await db.rpc<string>('mio_qr', { p_dispositivo: disp })); setErrore(null); return; }
        catch (x) { setErrore(String((x as Error).message)); }
      } else setErrore(m);
      setCodice(null);
    }
  };
  useEffect(() => {
    const t = () => { const s = Math.floor(Date.now() / 1000); setLeft(30 - s % 30); const w = Math.floor(s / 30); if (w !== finestra.current) { finestra.current = w; chiedi(); } };
    t(); const i = setInterval(t, 1000);
    const vis = () => { if (document.visibilityState === 'visible') { finestra.current = -1; t(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', vis); };
  }, []);

  const { dati: oggi } = useDati((d) => dip ? d.from<any>('timbrature').select('verso,quando,esito').eq('dipendente_id', dip.id).gte('quando', inizioOggi()).order('quando') : Promise.resolve([]), [dip?.id, Math.floor(Date.now() / 60000)]);
  const { dati: mese } = useDati((d) => dip ? d.from<any>('presenze_mese').select('*').eq('dipendente_id', dip.id).then((r) => r[0] ?? null) : Promise.resolve(null), [dip?.id]);
  const { dati: ferie } = useDati((d) => dip ? d.from<any>('ferie').select('*').eq('dipendente_id', dip.id).eq('anno', new Date().getFullYear()).then((r) => r[0] ?? null) : Promise.resolve(null), [dip?.id]);
  const { dati: stra } = useDati((d) => dip ? straordinari(d, dip.id, dip.ore_settimana ?? 40) : Promise.resolve(null), [dip?.id]);
  if (!dip) return <div className="pscr"><div className="ptitle">Badge</div><div className="lbl">Il tuo profilo non è collegato a un dipendente: chiedi all’amministrazione.</div></div>;
  const valide = (oggi ?? []).filter((x) => x.esito === 'Valida');
  const dentro = valide.length > 0 && valide[valide.length - 1].verso === 'Entrata';
  const prossimo = dentro ? 'Uscita' : 'Entrata';
  const sel = scelto === prossimo ? scelto : null;   // registrata dal lettore: si torna al tasto successivo
  return (
    <div className="pscr">
      <div><div className="lbl">{dip.nome} · {dip.reparto ?? dip.mansione}</div><div className="ptitle">Badge</div></div>
      <div className="pcard" style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {codice ? <div id="qrbox" dangerouslySetInnerHTML={{ __html: qrSvg(codice) }} /> : <div style={{ width: 220, height: 220, borderRadius: 12, background: 'var(--soft)' }} />}
        <div className="lbl">Cambia tra <b id="qrleft">{left}</b> secondi · uno screenshot non funziona</div>
      </div>
      {errore && <Esito ok={false} titolo="Badge non attivo">{errore}</Esito>}
      <div className="lbl" style={{ textAlign: 'center' }}>{sel ? `${sel}: avvicina il telefono al lettore all’ingresso` : 'Premi Entrata o Uscita e avvicina il telefono al lettore'} · telefono registrato: {nomeTelefono(dip.nome)}</div>
      <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
        {(['Entrata', 'Uscita'] as const).map((v) => <button key={v} type="button" className={'bigbtn' + (sel === v ? '' : ' ghost')} style={{ flex: 1, ...(v === prossimo ? {} : { opacity: .35, cursor: 'not-allowed' }) }}
          disabled={v !== prossimo} onClick={() => setScelto(v)}>{v}</button>)}
      </div>
      <div className="pcard" style={{ padding: '12px 14px' }}><b>Oggi</b>{valide.length ? valide.map((x, i) => <div key={i} className="kvp" style={i === valide.length - 1 ? { border: 0 } : undefined}><span>{x.verso}</span><b>{hm(x.quando)}</b></div>)
        : <div className="lbl" style={{ marginTop: 4 }}>Nessuna timbratura ancora</div>}</div>
      <div className="pcard" style={{ padding: '12px 14px' }}><b><Mese /></b>
        <div className="kvp"><span>Ore ordinarie</span><b>{stra ? Math.round(stra.ordinarie) : Math.round(mese?.ore ?? 0)} h</b></div>
        <div className="kvp"><span>Straordinari</span><b>{stra ? Math.round(stra.extra) : 0} h</b></div>
        <div className="kvp" style={{ border: 0 }}><span>Ferie</span><b>{ferie ? (Math.round((ferie.ferie_maturate - ferie.ferie_godute) * 10) / 10).toLocaleString('it-IT') : '—'} gg</b></div></div>
      <div className="pcard" style={{ padding: '12px 14px' }}><b>I miei orari</b><div className="lbl" style={{ marginTop: 2 }}>Solo tu vedi i tuoi</div>
        <div className="kvp"><span>Ritardi a {new Date().toLocaleDateString('it-IT', { month: 'long' })}</span><b>{mese?.ritardi ?? 0} · {mese?.minuti_ritardo ?? 0} min</b></div>
        <div className="kvp"><span>Uscite anticipate</span><b>{mese?.uscite_anticipate ?? 0}</b></div>
        <div className="kvp" style={{ border: 0 }}><span>Permessi</span><b>{ferie ? Math.round(ferie.permessi_spettanti - ferie.permessi_usati) : '—'} h</b></div></div>
    </div>
  );
}

/** ore del mese dalle mie timbrature: oltre l'orario giornaliero sono straordinari */
async function straordinari(db: Db, dip: string, oreSett: number) {
  const t = await db.from<any>('timbrature').select('verso,quando').eq('dipendente_id', dip).eq('esito', 'Valida').gte('quando', inizioMese()).order('quando');
  const giorni: Record<string, { e?: number; u?: number }> = {};
  for (const x of t) { const g = x.quando.slice(0, 10), ms = new Date(x.quando).getTime(); giorni[g] ??= {};
    if (x.verso === 'Entrata') giorni[g].e = Math.min(giorni[g].e ?? ms, ms); else giorni[g].u = Math.max(giorni[g].u ?? 0, ms); }
  const max = oreSett / 5; let ordinarie = 0, extra = 0;
  for (const g of Object.values(giorni)) if (g.e && g.u && g.u > g.e) { const h = (g.u - g.e) / 3600000; ordinarie += Math.min(h, max); extra += Math.max(0, h - max); }
  return { ordinarie, extra };
}

// ------------------------------------------------------------------ Lettore all'ingresso
export interface Lettore { nome: string; chiave: string }
const KL = 'messina.lettore';
export function lettoreSalvato(): Lettore | null { try { return JSON.parse(localStorage.getItem(KL) || 'null'); } catch { return null; } }
export function salvaLettore(l: Lettore | null) { try { l ? localStorage.setItem(KL, JSON.stringify(l)) : localStorage.removeItem(KL); } catch { /* */ } }

type Timbra = (codice: string) => Promise<{ ok: boolean; verso?: string; nome?: string; motivo?: string }>;

/** chiama la funzione timbra-lettore con la chiave del lettore (header x-lettore-chiave) */
export function timbraConChiave(db: Db, l: Lettore): Timbra {
  const cfg = window.MESSINA ?? {};
  if (db.modo === 'prova' || !cfg.supabaseUrl) return (codice) => db.fn('timbra-lettore', { codice, lettore: l.nome, chiave: l.chiave });
  return async (codice) => {
    const r = await fetch(`${cfg.supabaseUrl}/functions/v1/timbra-lettore`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseKey!, Authorization: `Bearer ${cfg.supabaseKey}`, 'x-lettore-chiave': l.chiave },
      body: JSON.stringify({ codice, lettore: l.nome }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.errore || j.message || j.error || `Errore ${r.status}`);
    return j;
  };
}

export function LettoreScr({ db, lettore, onEsci }: { db: Db; lettore: Lettore; onEsci: () => void }) {
  const timbra = useRef(timbraConChiave(db, lettore)).current;
  const [esito, setEsito] = useState<{ ok: boolean; titolo: string; testo: string } | null>(null);
  const ultimo = useRef<{ c: string; t: number }>({ c: '', t: 0 });
  const leggi = async (c: string) => {
    const ora = Date.now();
    if (c === ultimo.current.c && ora - ultimo.current.t < 5000) return;  // lo stesso QR ancora davanti al lettore
    ultimo.current = { c, t: ora };
    try {
      const r = await timbra(c);
      setEsito(r.ok ? { ok: true, titolo: `${r.verso} · ${r.nome}`, testo: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) }
        : { ok: false, titolo: 'Timbratura rifiutata', testo: r.motivo ?? '' });
      vibra(r.ok ? 60 : [120, 80, 120]);
    } catch (e) { setEsito({ ok: false, titolo: 'Lettore non collegato', testo: String((e as Error).message) }); }
    setTimeout(() => setEsito(null), 3500);
  };
  usePistola((c) => { leggi(c); });
  const cam = useFotocameraCodici(leggi);
  return (
    <div className="pscr">
      <div><div className="lbl">{lettore.nome}</div><div className="ptitle">Lettore</div></div>
      <div className="cam" style={{ position: 'relative', overflow: 'hidden' }}>
        <video ref={cam.video} playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: cam.pronta ? 'block' : 'none' }} />
        {!cam.pronta && <div className="camtxt">Fotocamera non disponibile: collega un lettore QR via USB o Bluetooth.</div>}
      </div>
      {esito ? <Esito ok={esito.ok} titolo={esito.titolo}>{esito.testo}</Esito>
        : <div className="lbl" style={{ textAlign: 'center' }}>Avvicina il badge del telefono</div>}
      <button type="button" className="btn ghost sm" style={{ alignSelf: 'center' }} onClick={onEsci}>Esci</button>
    </div>
  );
}

export function ImpostaLettore({ onFatto }: { onFatto: (l: Lettore) => void }) {
  const [nome, setNome] = useState('Ingresso');
  const [chiave, setChiave] = useState('');
  return (
    <div className="pscr">
      <div className="ptitle">Lettore</div>
      <div className="lbl">Una volta sola, su questo dispositivo: il nome del lettore e la sua chiave (la trovi nei segreti di Supabase, LETTORE_CHIAVE).</div>
      <label className="field"><span className="lbl">Nome</span><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
      <label className="field"><span className="lbl">Chiave</span><input className="input" type="password" autoComplete="off" value={chiave} onChange={(e) => setChiave(e.target.value)} /></label>
      <div style={{ flex: 1 }} />
      <button type="button" className="bigbtn" onClick={() => { if (nome.trim() && chiave.trim()) onFatto({ nome: nome.trim(), chiave: chiave.trim() }); }} disabled={!nome.trim() || !chiave.trim()}
        style={!nome.trim() || !chiave.trim() ? { opacity: .35, cursor: 'not-allowed' } : undefined}>Salva</button>
    </div>
  );
}
