// App Corporation · Entrate: foto del seriale, scheda, grado, prezzo e bancale (caricoApp del mockup approvato).
import React, { useEffect, useRef, useState } from 'react';
import { KI, Pill } from '@messina/ui';
import { useApp, useDati, useAzione, off, Num, ErroreApp, vibra } from './core';
import { useScan, usePistola, useFotocamera, useCodiciProva } from './scanner';
import { comprimi } from './foto';
import { qrSvg } from './qr';

type Scr = 'scan' | 'scheda' | 'grado' | 'prezzo' | 'bancale' | 'nuovoB' | 'fatto';
interface Scheda { seriale: string; tipo: 'PC' | 'Telefono'; marca: string; modello: string; cpu: string; gpu: string; ram: string; disco: string; schermo: string; memoria: string; colore: string; verificato?: boolean; nel_ddt?: boolean; batteria?: string | null }
const VUOTA: Scheda = { seriale: '', tipo: 'PC', marca: '', modello: '', cpu: '', gpu: '', ram: '', disco: '', schermo: '', memoria: '', colore: '', batteria: '' };
/** batteria in percentuale (dal report «89%» o scritta a mano) */
const batteriaPct = (x: string | null | undefined) => { const n = parseInt(String(x ?? '').replace(/\D+/g, ''), 10); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null; };
const DIFETTI = ['Graffi sul coperchio', 'Ammaccatura', 'Tastiera lucida', 'Segni sullo schermo', 'Batteria sotto 80%', 'Manca un tasto'];
const CANALI = ['eBay', 'Subito', 'Back Market', 'Refurbed', 'Amazon', 'Sito'];
const BASE: Record<string, number> = { A: 289, B: 249, C: 209, D: 169 };

function Passi({ cur }: { cur: Scr }) {
  const st: [Scr, keyof typeof KI][] = [['scan', 'cam'], ['scheda', 'pen'], ['grado', 'star'], ['prezzo', 'eur'], ['bancale', 'pal']];
  const ci = st.findIndex((x) => x[0] === cur);
  return <div className="row" style={{ gap: 6, justifyContent: 'space-between', flexWrap: 'nowrap' }}>{st.map((x, i) =>
    <span key={x[0]} title={x[0]} style={{ flex: 1, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...(i === ci ? { background: 'var(--solid)', color: 'var(--on-solid)' } : i < ci ? { background: 'var(--soft)', color: 'var(--ink)' } : { boxShadow: 'inset 0 0 0 1px var(--line)', color: 'var(--muted)' }) }}>{KI[x[1]]()}</span>)}</div>;
}

export function Carico() {
  const { db, io } = useApp();
  const scan = useScan();
  const az = useAzione();
  const [scr, setScr] = useState<Scr>('scan');
  const [scheda, setScheda] = useState<Scheda>(VUOTA);
  const [manuale, setManuale] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [grado, setGrado] = useState('B');
  const [difetti, setDifetti] = useState<Record<string, boolean>>({});
  const [prezzo, setPrezzo] = useState(BASE.B);
  const [canali, setCanali] = useState<Record<string, boolean>>({ eBay: true, Subito: true, 'Back Market': true, Refurbed: true, Amazon: false, Sito: false });
  const [banc, setBanc] = useState<{ codice: string; id: string; posto: string; pezzi: number | null } | null>(null);
  const [fatto, setFatto] = useState<{ banc: string; posto: string } | null>(null);
  const [lettura, setLettura] = useState(false);
  const vai = (s: Scr) => { setScr(s); az.setErrore(null); window.scrollTo(0, 0); };

  // il lotto si sceglie tra quelli aperti (il più recente è già scelto); in un lotto chiuso non entra più niente
  const { dati: aperti } = useDati((d) => d.from<any>('lotti').select('id,codice,pezzi,costo').eq('stato', 'Aperto').order('acquistato_il', { ascending: false }).then((r) => r, () => [] as any[]), []);
  const [lottoId, setLottoId] = useState<string | null>(null);
  const lotto = (aperti ?? []).find((l) => l.id === lottoId) ?? aperti?.[0] ?? null;
  const { dati: proposto } = useDati((d) => scheda.modello ? d.rpc<number | null>('prezzo_proposto', { p_modello: scheda.modello, p_grado: grado }).then((x) => x, () => null) : Promise.resolve(null), [scheda.modello, grado]);
  const { dati: caricati } = useDati((d) => lotto ? d.from<any>('device').select('id').eq('lotto_id', lotto.id).then((r) => r.length) : Promise.resolve(0), [lotto?.id]);
  const { dati: simili } = useDati((d) => scheda.modello ? d.from<any>('device').select('prezzo,prezzo_minimo,grado').eq('modello', scheda.modello).eq('grado', grado) : Promise.resolve([] as any[]), [scheda.modello, grado]);
  const { dati: stage } = useDati((d) => scheda.seriale ? d.from<any>('stage_pc').select('esito,certificato').eq('seriale', scheda.seriale).limit(1).then((r) => r[0] ?? null, () => null) : Promise.resolve(null), [scheda.seriale]);
  const costoPezzo = lotto && lotto.pezzi ? lotto.costo / lotto.pezzi : null;
  const minimo = costoPezzo ? Math.ceil(costoPezzo * 1.2 / 10) * 10 : null;
  const prezzi = (simili ?? []).map((x) => Number(x.prezzo)).filter((x) => x > 0);

  // prezzo proposto: quello fissato per modello e grado (o la media degli ultimi venduti), poi quello degli uguali già caricati, altrimenti la base del grado
  useEffect(() => { if (scr !== 'grado' && scr !== 'prezzo') return;
    if (proposto != null && Number(proposto) > 0) setPrezzo(Math.round(Number(proposto)));
    else if (prezzi.length) setPrezzo(Math.round(prezzi.sort((a, b) => a - b)[Math.floor(prezzi.length / 2)])); }, [simili, proposto]);

  // 1 · foto del seriale
  const cam = useFotocamera();
  const file = useRef<HTMLInputElement>(null);
  const leggiFoto = async (b: Blob) => {
    setLettura(true);
    const r = await az.esegui(async () => {
      const piccola = await comprimi(b, 1600, 0.85);
      const p = `entrate/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      await db.storage.carica('device', p, piccola); setFoto(p);
      return db.fn<Scheda>('leggi-seriale', { percorso: p });
    });
    setLettura(false);
    if (r) { setScheda({ ...VUOTA, tipo: scheda.tipo, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? ''])) } as Scheda); setManuale(!r.seriale); vibra(); vai('scheda'); }
  };
  const scattaFoto = async () => { const b = await cam.scatta(); if (b) leggiFoto(b); else file.current?.click(); };

  // 5 · bancale
  const codiciBanc = useCodiciProva('bancale');
  const sceglBancale = async (c: string) => {
    const r = await az.esegui(() => db.from<any>('bancali').select('id,codice,posti(codice)').eq('codice', c).is('uscito_il', null).then((x) => x[0] ?? null));
    if (r === undefined) return;
    if (!r) { az.setErrore(`Bancale ${c} non trovato tra i vostri`); return; }
    const n = await db.from<any>('device').select('id').eq('bancale_id', r.id).then((x) => x.length, () => null);
    setBanc({ codice: r.codice, id: r.id, posto: r.posti?.codice ?? '—', pezzi: n }); vibra();
  };
  usePistola(scr === 'bancale' ? (c) => { sceglBancale(c); } : null);

  const conferma = async () => {
    if (!banc) return;
    const siti = CANALI.filter((x) => canali[x]);
    const r = await az.esegui(() => db.from('device').insert({
      seriale: scheda.seriale.trim(), tipo: scheda.tipo, memoria: scheda.memoria || null, colore: scheda.colore || null, batteria: batteriaPct(scheda.batteria), marca: scheda.marca || null, modello: scheda.modello || null, cpu: scheda.cpu || null, gpu: scheda.gpu || null,
      ram: scheda.ram || null, disco: scheda.disco || null, schermo: scheda.schermo || null, grado, difetti: DIFETTI.filter((x) => difetti[x]),
      lotto_id: lotto?.id ?? null, bancale_id: banc.id, prezzo, prezzo_minimo: minimo && minimo <= prezzo ? minimo : null,
      stato: 'Disponibile', siti, foto: foto ? [foto] : [] }));
    if (r !== undefined) { setFatto({ banc: banc.codice, posto: banc.posto }); vibra(); vai('fatto'); }
  };
  const ricomincia = () => { setScheda({ ...VUOTA, tipo: scheda.tipo }); setFoto(null); setGrado('B'); setDifetti({}); setPrezzo(BASE.B); setBanc(null); setFatto(null); setManuale(false); vai('scan'); };

  if (scr === 'scan') return (
    <div className="pscr">
      <Passi cur="scan" />
      {/* Da decidere (STATO): la scelta del lotto quando ce n'è più di uno aperto non è nel mockup (si usa il più recente) */}{void setLottoId}
      {lotto ? <div className="lbl">Lotto {lotto.codice} · {caricati ?? 0} di {lotto.pezzi} caricati</div> : aperti && <div className="lbl">Nessun lotto aperto: si carica senza lotto.</div>}
      <div className="cam" style={{ position: 'relative', overflow: 'hidden' }}>
        <video ref={cam.video} playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: cam.pronta ? 'block' : 'none' }} />
        <div className="camtxt" style={{ position: 'relative', ...(cam.pronta ? { marginTop: 'auto', background: 'rgba(0,0,0,.45)', borderRadius: 12, padding: '8px 10px' } : {}) }}>
          {lettura ? 'Leggo il seriale…' : 'Inquadra l’etichetta sotto il PC. Il seriale si legge dalla foto e si controlla sul sito del marchio.'}</div>
      </div>
      <ErroreApp testo={az.errore} />
      <input ref={file} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) leggiFoto(x); }} />
      <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
        <button type="button" className="bigbtn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={scattaFoto} {...(lettura ? off : {})}>{KI.cam()}Foto</button>
        <button type="button" className="bigbtn ghost" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => { setScheda({ ...VUOTA, tipo: scheda.tipo }); setManuale(true); vai('scheda'); }}>{KI.pen()}Manuale</button>
      </div>
    </div>);

  if (scr === 'scheda') {
    const campi: [keyof Scheda, string][] = scheda.tipo === 'Telefono'
      ? [['marca', 'Marca'], ['modello', 'Modello'], ['memoria', 'Memoria'], ['batteria', 'Batteria %'], ['colore', 'Colore']]
      : [['marca', 'Marca'], ['modello', 'Modello'], ['cpu', 'Processore'], ['ram', 'RAM'], ['disco', 'Disco'], ['schermo', 'Schermo'], ['gpu', 'Scheda video']];
    const pronta = !!scheda.seriale.trim() && !!scheda.modello.trim();
    return (
      <div className="pscr">
        <Passi cur="scheda" />
        {/* Da decidere (STATO): la scelta PC / Telefono non è nel mockup (il mockup mostra un PC) */}
        {manuale ? <label className="pcard" style={{ padding: '12px 14px', display: 'block' }}><div className="lbl">Seriale</div>
          <input className="input" value={scheda.seriale} onChange={(e) => setScheda({ ...scheda, seriale: e.target.value.toUpperCase() })} autoCapitalize="characters" autoCorrect="off" style={{ marginTop: 6 }} /></label>
          : <div className="pcard row between" style={{ padding: '12px 14px' }}><div><div className="lbl">Letto dalla foto</div><b style={{ fontSize: 18 }}>{scheda.seriale}</b></div>
            {scheda.verificato ? <Pill tone="ok">Verificato su {scheda.marca}</Pill> : <button type="button" className="chipbtn" onClick={() => setManuale(true)}>Correggi</button>}</div>}
        {(scheda.nel_ddt || stage) && <div className="row" style={{ gap: 6 }}>{scheda.nel_ddt && <Pill>Nel DDT</Pill>}{stage && <Pill>Lavorato da noi</Pill>}</div>}
        {!manuale && <div className="ptitle" style={{ fontSize: 24 }}>{[scheda.marca, scheda.modello].filter(Boolean).join(' ') || 'Modello non letto'}</div>}
        <div className="pcard" style={{ padding: '4px 14px' }}>
          {campi.filter(([k]) => manuale || (k !== 'marca' && k !== 'modello')).map(([k, l]) => <div key={k} className="kvp">
            <span>{l}</span>{manuale || scheda.tipo === 'Telefono' ? <input aria-label={l} value={String(scheda[k] ?? '')} onChange={(e) => setScheda({ ...scheda, [k]: e.target.value })}
              style={{ font: 'inherit', fontWeight: 700, textAlign: 'right', border: 0, background: 'transparent', minWidth: 0, flex: 1 }} /> : <b>{String(scheda[k] || '—')}</b>}</div>)}
          {stage && <div className="kvp"><span>Cancellazione dati</span><b>{stage.esito === 'Formattato' || stage.esito === 'In vendita' ? 'Completata' : stage.esito}</b></div>}
          {scheda.tipo === 'PC' && scheda.batteria && <div className="kvp" style={{ border: 0 }}><span>Batteria dal report</span><b>{scheda.batteria}</b></div>}
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="bigbtn" onClick={() => vai('grado')} {...(pronta ? {} : off)}>Avanti</button>
      </div>);
  }

  if (scr === 'grado') return (
    <div className="pscr">
      <Passi cur="grado" />
      <div className="lbl">Scegli il grado con un tocco.</div>
      <div className="grades">{['A', 'B', 'C', 'D'].map((x) => <button key={x} type="button" className={'gbtn' + (grado === x ? ' on' : '')} onClick={() => { setGrado(x); setPrezzo(BASE[x]); }}>{x}</button>)}</div>
      <div className="lbl">Difetti visti</div>
      <div className="row" style={{ gap: 8 }}>{DIFETTI.map((x) => <button key={x} type="button" className={'chipbtn' + (difetti[x] ? ' on' : '')} onClick={() => setDifetti({ ...difetti, [x]: !difetti[x] })}>{x}</button>)}</div>
      <div style={{ flex: 1 }} />
      <button type="button" className="bigbtn" onClick={() => vai('prezzo')}>Avanti</button>
    </div>);

  if (scr === 'prezzo') {
    const lo = prezzi.length ? Math.min(...prezzi) : null, hi = prezzi.length ? Math.max(...prezzi) : null;
    const giu = minimo ?? 0;
    return (
      <div className="pscr">
        <Passi cur="prezzo" />
        <div className="pcard stack" style={{ padding: 16, alignItems: 'center', gap: 10 }}>
          <div className="lbl">Proposto per il grado {grado}</div>
          <div className="stepper" style={{ width: '100%' }}>
            <button type="button" className="round" aria-label="Meno 10 euro" onClick={() => setPrezzo(Math.max(giu, prezzo - 10))}>−</button>
            <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-.04em' }}>€ {prezzo}</div>
            <button type="button" className="round" aria-label="Più 10 euro" onClick={() => setPrezzo(prezzo + 10)}>+</button></div>
          <div className="lbl" style={{ textAlign: 'center' }}>{lo !== null ? (lo === hi ? `Gli altri uguali sono in vendita a ${lo} euro. ` : `Gli altri uguali sono in vendita tra ${lo} e ${hi} euro. `) : ''}{minimo ? `Il minimo per questo PC è ${minimo} euro.` : ''}</div>
        </div>
        <div className="lbl">Pubblica su</div>
        <div className="row" style={{ gap: 8 }}>{CANALI.map((x) => <button key={x} type="button" className={'chipbtn' + (canali[x] ? ' on' : '')} onClick={() => setCanali({ ...canali, [x]: !canali[x] })}>{x}</button>)}</div>
        {io.ruolo !== 'vendite' && <div className="lbl">Il prezzo lo conferma poi l’ufficio vendite.</div>}
        <div style={{ flex: 1 }} />
        <button type="button" className="bigbtn" onClick={() => vai('bancale')}>Avanti</button>
      </div>);
  }

  if (scr === 'bancale') return (
    <div className="pscr">
      <Passi cur="bancale" />
      <div style={{ fontSize: 17 }}>Su quale bancale lo metti? Scansiona l’etichetta del bancale, oppure premi «Nuovo».</div>
      {banc ? <div className="pcard row between" style={{ padding: 14, border: '2px solid var(--ok)', background: 'var(--ok-soft)' }}><div><div className="lbl">Bancale</div><b style={{ fontSize: 20 }}>{banc.codice}</b>
          <div className="lbl">Posto {banc.posto} · {banc.pezzi ? (banc.pezzi === 1 ? '1 computer' : banc.pezzi + ' computer') : 'nuovo'}</div></div><b style={{ color: 'var(--ok)', fontSize: 20 }}>✓</b></div>
        : <div className="scanbox"><span style={{ display: 'inline-block', transform: 'scale(1.8)', margin: 8 }}>{KI.pal()}</span><span className="lbl">Etichetta del bancale</span></div>}
      <ErroreApp testo={az.errore} />
      <div style={{ flex: 1 }} />
      <button type="button" className="bigbtn ghost" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }} onClick={async () => { const c = await scan('Scansiona il bancale', codiciBanc); if (c) sceglBancale(c); }}>{KI.cam()}Scansiona</button>
      <button type="button" className="bigbtn ghost" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }} onClick={() => vai('nuovoB')}>{KI.pal()}Nuovo</button>
      <button type="button" className="bigbtn" onClick={conferma} {...(banc && !az.inCorso ? {} : off)}>Conferma</button>
    </div>);

  if (scr === 'nuovoB') return <NuovoBancale onBack={() => vai('bancale')} onFatto={(b) => { setBanc(b); vai('bancale'); }} />;

  const att = CANALI.filter((x) => canali[x]);
  return (
    <div className="pscr">
      <div className="pcard" style={{ padding: '12px 14px', border: '2px solid var(--ok)', background: 'var(--ok-soft)' }}><b style={{ color: 'var(--ok)' }}>Caricato</b></div>
      <div className="lbl">Mettilo sul bancale {fatto?.banc}, posto {fatto?.posto}. È già nell’inventario della Corporation.</div>
      <div className="pcard row" style={{ padding: 16, gap: 14, flexWrap: 'nowrap' }}>
        <span style={{ flex: 'none', display: 'flex' }} dangerouslySetInnerHTML={{ __html: qrSvg(scheda.seriale, 76).replace('border-radius:12px', 'border-radius:6px') }} />
        <div style={{ flex: 1, minWidth: 0 }}><div className="row between"><b>MESSINA</b><b style={{ fontSize: 22 }}>{grado}</b></div><div style={{ fontSize: 14, fontWeight: 600 }}>{scheda.modello}</div>
          <div className="lbl">{scheda.seriale}{lotto ? ' · lotto ' + lotto.codice : ''} · {fatto?.banc}</div></div>
      </div>
      <div className="pcard" style={{ padding: 14, lineHeight: 1.6 }}>In vendita a <b>€ {prezzo}</b> su {att.length ? att.join(', ') : 'nessun sito'}. Quando si vende su un sito, sparisce dagli altri.</div>
      <div style={{ flex: 1 }} />
      <button type="button" className="bigbtn" onClick={ricomincia}>Prossimo</button>
    </div>);
}

/** etichetta del bancale (per la stampante Zebra o qualsiasi stampante del telefono) */
function stampaEtichetta(codice: string) {
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
  const d = f.contentDocument!;
  d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${codice}</title><style>@page{size:100mm 60mm;margin:4mm}body{margin:0;font-family:system-ui,sans-serif;display:flex;gap:6mm;align-items:center}
    b{font-size:30pt;letter-spacing:-.02em}span{font-size:11pt}</style></head><body>${qrSvg(codice, 190)}<div><span>MESSINA · bancale</span><br><b>${codice}</b></div></body></html>`); d.close();
  setTimeout(() => { try { f.contentWindow?.print(); } catch { /* */ } setTimeout(() => f.remove(), 60000); }, 200);
}

function NuovoBancale({ onBack, onFatto }: { onBack: () => void; onFatto: (b: { codice: string; id: string; posto: string; pezzi: number | null }) => void }) {
  const { db } = useApp();
  const scan = useScan();
  const az = useAzione();
  // il codice si riserva una volta sola, appena si apre la pagina (serve per stampare l'etichetta)
  const [codice, setCodice] = useState<string | null>(null);
  const [proposto, setProposto] = useState<string | null>(null);
  useEffect(() => {
    db.rpc<string>('riserva_bancale').then(setCodice, (e) => az.setErrore(String(e.message ?? e)));
    db.rpc<string | null>('posto_proposto', {}).then(setProposto, () => setProposto(null));
  }, [db]);
  const [stampata, setStampata] = useState(false);
  const [posto, setPosto] = useState<string | null>(null);
  const codiciPosto = useCodiciProva('posto', proposto ?? null);
  const scegliPosto = async (c: string) => { const r = await az.esegui(() => db.rpc<string>('crea_bancale', { p_codice: codice, p_posto: c })); if (r) { setPosto(c); vibra(); } };
  usePistola(stampata && !posto ? (c) => { scegliPosto(c); } : null);
  const st = (done: boolean, on: boolean): React.CSSProperties => done ? { border: '2px solid var(--ok)', background: 'var(--ok-soft)' } : on ? { border: '2px solid var(--solid)' } : { opacity: .4, pointerEvents: 'none' };
  const fatto = async () => {
    if (!posto || !codice) return;
    const b = await az.esegui(() => db.from<any>('bancali').select('id').eq('codice', codice).then((x) => x[0]));
    if (b) onFatto({ codice, id: b.id, posto, pezzi: 0 });
  };
  return (
    <div className="pscr">
      <button type="button" className="back" onClick={onBack}>Indietro</button>
      <div><div className="lbl">Bancale nuovo</div><div className="ptitle">{codice ?? '…'}</div></div>
      <div className="pcard stack" style={{ padding: 14, gap: 10, ...st(stampata, true) }}><div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><Num n={1} fatto={stampata} /><b style={{ fontSize: 20 }}>Etichetta</b></div>
        <div style={{ fontSize: 17 }}>{stampata ? 'Stampata: attaccala sul bancale.' : 'Stampa l’etichetta con il QR e attaccala sul bancale.'}</div>
        {!stampata && <button type="button" className="bigbtn" onClick={() => { if (codice) { stampaEtichetta(codice); setStampata(true); } }} {...(codice ? {} : off)}>Stampa</button>}</div>
      <div className="pcard stack" style={{ padding: 14, gap: 10, ...st(!!posto, stampata) }}><div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><Num n={2} fatto={!!posto} /><b style={{ fontSize: 20 }}>Posto</b></div>
        <div style={{ fontSize: 17 }}>{posto ? `Messo in ${posto}: è già nella pianta del magazzino.` : proposto ? <>Porta il bancale nel posto libero proposto, <b>{proposto}</b>, e scansiona l’etichetta dello scaffale.</> : 'Porta il bancale in un posto libero e scansiona l’etichetta dello scaffale.'}</div>
        {!posto && <button type="button" className="bigbtn" aria-label="Scansiona il posto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={async () => { const c = await scan('Scansiona il posto', codiciPosto); if (c) scegliPosto(c); }}>{KI.cam()}</button>}</div>
      <ErroreApp testo={az.errore} />
      <div style={{ flex: 1 }} />
      <button type="button" className="bigbtn" onClick={fatto} {...(posto ? {} : off)}>Fatto</button>
    </div>
  );
}
