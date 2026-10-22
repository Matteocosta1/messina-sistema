// Negozio online di Messina Corporation: identico al negozio del mockup approvato
// (prova-messina.html, negozio()). Legge solo il catalogo pubblico e apre il pagamento Stripe.
import '@messina/dati/prova-tutto';   // stessi dati di prova in tutti i programmi
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@messina/ui/mockup.css';
import '@messina/ui/produzione.css';
import './negozio.css';
import { collega, onCambioProva, type Config } from '@messina/dati';
import { motoreDiProva } from '@messina/dati/prova';
import { Btn, Chip, Msg, Pill } from '@messina/ui';

declare global { interface Window { MESSINA?: Config } }
const db = collega(window.MESSINA, motoreDiProva);

// ------------------------------------------------------------------ dati
interface Riga { modello: string; marca: string; cpu: string | null; ram: string | null; disco: string | null; schermo: string | null; gpu: string | null; grado: string; prezzo: number; disponibili: number;
  generazione?: string | null; batteria_min?: number | null; sistema_operativo?: string | null; tastiera?: string | null; porte?: string | null; rete?: string | null; webcam?: string | null; peso?: string | null; dati_cancellati?: boolean }
interface Ricambio { id: string; tipo: string; descrizione: string; origine: string; prezzo: number }
interface Prodotto { slug: string; marca: string; modello: string; spec: string; righe: Riga[]; da: number }
type Condizione = 'Grado A' | 'Grado B' | 'Grado C' | 'Grado D';
const CONDIZIONI: Condizione[] = ['Grado A', 'Grado B', 'Grado C', 'Grado D'];
const GRADO: Record<Condizione, string> = { 'Grado A': 'A', 'Grado B': 'B', 'Grado C': 'C', 'Grado D': 'D' };
const GDESC: Record<Condizione, string> = {
  'Grado A': 'Quasi impossibile distinguerlo da nuovo. Al massimo micro-segni visibili da vicino. Funziona al 100%.',
  'Grado B': 'Leggeri segni d’uso sulla scocca. Schermo e tastiera in ordine. Funziona al 100%.',
  'Grado C': 'Segni evidenti d’uso, possibile piccola ammaccatura. Funziona al 100%.',
  'Grado D': 'Funziona al 100%, ma ha la scocca rotta o danni estetici importanti. Testato e garantito come gli altri gradi.',
};
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const configDi = (r: Riga) => `${r.ram ?? '—'} RAM · ${r.disco ?? '—'}`;
const eur = (n: number) => '€ ' + n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
const cpuBreve = (c: string | null) => !c ? '' : /^i[3579]-/i.test(c) ? 'Intel ' + c.slice(0, 2) : c;

function raggruppa(righe: Riga[]): Prodotto[] {
  const m = new Map<string, Prodotto>();
  for (const r of righe) {
    if (!GRADO_INVERSO[r.grado]) continue;  // sul sito i gradi A, B, C e D
    const k = r.marca + ' ' + r.modello;
    if (!m.has(k)) m.set(k, { slug: slug(k), marca: r.marca, modello: r.modello, spec: [cpuBreve(r.cpu), r.schermo].filter(Boolean).join(' · '), righe: [], da: Infinity });
    const p = m.get(k)!; p.righe.push(r); p.da = Math.min(p.da, r.prezzo);
  }
  return [...m.values()];
}
const GRADO_INVERSO: Record<string, Condizione> = { A: 'Grado A', B: 'Grado B', C: 'Grado C', D: 'Grado D' };

// ------------------------------------------------------------------ carrello (solo in questo browser)
interface Voce { slug: string; nome: string; modello: string; marca: string; grado: string; ram: string | null; disco: string | null; det: string; p: number }
const CK = 'messina.carrello';
const leggiCarrello = (): Voce[] => { try { const v = JSON.parse(localStorage.getItem(CK) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const salvaCarrello = (c: Voce[]) => { try { localStorage.setItem(CK, JSON.stringify(c)); } catch { /* il carrello resta in memoria */ } };

// ------------------------------------------------------------------ icona del mockup
const LAPTOP = <svg width="84" height="58" viewBox="0 0 64 44" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="10" y="4" width="44" height="28" rx="2" /><path d="M2 38h60l-4 4H6z" /></svg>;

const leggiPercorso = () => decodeURIComponent(location.hash.replace(/^#\/?/, ''));

function App() {
  const [percorso, setPercorso] = useState(leggiPercorso());
  const [prodotti, setProdotti] = useState<Prodotto[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [carrello, setCarrello] = useState<Voce[]>(leggiCarrello);
  const [brand, setBrand] = useState('Tutti');

  const caricaCatalogo = useCallback(() => {
    db.rpc<Riga[]>('catalogo').then((r) => setProdotti(raggruppa((r ?? []).map((x) => ({ ...x, prezzo: Number(x.prezzo), disponibili: Number(x.disponibili) })))),
      () => setErrore('Il catalogo non si è caricato. Riprova tra poco.'));
  }, []);
  useEffect(() => { caricaCatalogo(); }, [caricaCatalogo]);
  useEffect(() => onCambioProva(caricaCatalogo), [caricaCatalogo]);   // prova: prezzi e pezzi cambiati in Corporation
  useEffect(() => {
    const f = () => { setPercorso(leggiPercorso()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f);
  }, []);
  const cambiaCarrello = useCallback((c: Voce[]) => { setCarrello(c); salvaCarrello(c); }, []);
  const vai = (p: string) => { location.hash = '#/' + p; };

  const [sez, arg] = percorso.split('/');
  const prodotto = sez === 'p' ? prodotti?.find((p) => p.slug === arg) : undefined;

  useEffect(() => {  // SEO: titolo e dati strutturati della pagina
    document.title = prodotto ? `${prodotto.marca} ${prodotto.modello} usato · Messina Corporation` : sez === 'carrello' ? 'Carrello · Messina Corporation' : 'Messina Corporation · Portatili usati';
    let s = document.getElementById('jsonld') as HTMLScriptElement | null;
    if (!s) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'jsonld'; document.head.appendChild(s); }
    const offerta = (p: Prodotto) => ({ '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: p.da, highPrice: Math.max(...p.righe.map((r) => r.prezzo)),
      offerCount: p.righe.reduce((a, r) => a + r.disponibili, 0), availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/UsedCondition' });
    const prod = (p: Prodotto) => ({ '@type': 'Product', name: `${p.marca} ${p.modello}`, brand: { '@type': 'Brand', name: p.marca }, description: `${p.marca} ${p.modello} usato, ${p.spec}`,
      url: location.origin + location.pathname + '#/p/' + p.slug, offers: offerta(p) });
    s.textContent = JSON.stringify(prodotto ? { '@context': 'https://schema.org', ...prod(prodotto) }
      : { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: (prodotti ?? []).map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: prod(p) })) });
  }, [prodotto, prodotti, sez]);

  const head = (
    <div className="shophead">
      <button type="button" className="tab" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.03em' }} onClick={() => { setBrand('Tutti'); vai(''); }}>Messina Corporation</button>
      <div className="row" style={{ gap: 4 }}>
        <button type="button" className="tab" onClick={() => { setBrand('Tutti'); vai(''); }}>Portatili</button>
        <button type="button" className="tab" onClick={() => { setBrand('Apple'); vai(''); }}>Apple</button>
        <button type="button" className="tab" onClick={() => vai('aziende')}>Aziende</button>
        <button type="button" className="tab" onClick={() => vai('ricambi')}>Ricambi</button>
      </div>
      <Btn sm onClick={() => vai('carrello')}>{'Carrello · ' + carrello.length}</Btn>
    </div>
  );

  let inner: React.ReactNode;
  if (sez === 'p') inner = prodotti === null ? <Attesa /> : prodotto ? <Scheda p={prodotto} carrello={carrello} onCarrello={cambiaCarrello} vai={vai} /> : <Pagina titolo="Non trovato"><p>Questo computer non è più disponibile.</p><Btn ghost sm onClick={() => vai('')}>Tutti i portatili</Btn></Pagina>;
  else if (sez === 'ricambi') inner = <Ricambi />;
  else if (sez === 'carrello') inner = <Carrello carrello={carrello} onCarrello={cambiaCarrello} vai={vai} />;
  else if (sez === 'grazie') inner = <Grazie onSvuota={() => cambiaCarrello([])} vai={vai} />;
  else if (sez === 'annullato') inner = <Pagina titolo="Pagamento annullato"><p className="muted">Nessun addebito. Il carrello è ancora qui.</p><Btn sm onClick={() => vai('carrello')}>Carrello</Btn></Pagina>;
  else if (sez === 'aziende') inner = <Aziende modelli={[...new Set((prodotti ?? []).map((x) => `${x.marca} ${x.modello}`))]} />;
  else if (sez === 'privacy' || sez === 'termini' || sez === 'resi') inner = <Pagina titolo={{ privacy: 'Privacy', termini: 'Termini', resi: 'Resi' }[sez]}><p className="muted">[Testo da inserire: lo prepara il consulente legale prima dell’apertura del negozio.]</p></Pagina>;
  else inner = <Vetrina prodotti={prodotti} errore={errore} brand={brand} onBrand={setBrand} vai={vai} />;

  return (
    <div className="wrap">
      <div className="glass shop">
        {head}
        {inner}
        <footer className="shopfoot lbl">
          <span>© Messina Corporation · P.IVA [da inserire]</span>
          <span className="row" style={{ gap: 14 }}>
            <a href="#/privacy">Privacy</a><a href="#/termini">Termini</a><a href="#/resi">Resi</a>
          </span>
        </footer>
      </div>
    </div>
  );
}

function Attesa() { return <div className="shopbody"><p className="lbl">Carico…</p></div>; }
function Pagina(p: { titolo: string; children: React.ReactNode }) {
  return <div className="shopbody" style={{ maxWidth: 760, margin: '0 auto' }}><h2 style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-.04em', marginBottom: 16 }}>{p.titolo}</h2><div className="stack">{p.children}</div></div>;
}

function Vetrina(p: { prodotti: Prodotto[] | null; errore: string | null; brand: string; onBrand: (b: string) => void; vai: (s: string) => void }) {
  const marche = ['Tutti', ...new Set((p.prodotti ?? []).map((x) => x.marca))];
  const vis = (p.prodotti ?? []).filter((x) => p.brand === 'Tutti' || x.marca === p.brand);
  return (
    <div className="shopbody"><h1 className="shoph1">Messina Corporation</h1>
      <div className="row" style={{ marginBottom: 18 }}>
        {marche.map((x) => <Chip key={x} on={p.brand === x} onClick={() => p.onBrand(x)}>{x}</Chip>)}
        <span className="lbl" style={{ marginLeft: 'auto' }}>{p.prodotti ? `${vis.length} ${vis.length === 1 ? 'modello' : 'modelli'}` : ''}</span>
      </div>
      {p.errore && <div className="warn">{p.errore}</div>}
      {p.prodotti === null && !p.errore ? <p className="lbl">Carico…</p> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))' }}>
          {vis.map((x) => (
            <a key={x.slug} className="prod" href={'#/p/' + x.slug} style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className="ph">{LAPTOP}</span><span className="lbl">{x.marca}</span>
              <b style={{ fontSize: 19, letterSpacing: '-.02em' }}>{x.modello}</b><span className="lbl">{x.spec}</span>
              <span>da <b style={{ fontSize: 20 }}>{eur(x.da)}</b></span>
            </a>
          ))}
          {p.prodotti && !vis.length && <p className="lbl">Nessun computer di questa marca in vendita adesso.</p>}
        </div>
      )}
    </div>
  );
}

function Scheda(p: { p: Prodotto; carrello: Voce[]; onCarrello: (c: Voce[]) => void; vai: (s: string) => void }) {
  const configs = useMemo(() => [...new Set(p.p.righe.map(configDi))].sort(), [p.p]);
  const riga = (cfg: string, g: Condizione) => {
    const rr = p.p.righe.filter((r) => configDi(r) === cfg && r.grado === GRADO[g]);
    if (!rr.length) return null;
    return { ...rr[0], prezzo: Math.min(...rr.map((r) => r.prezzo)), disponibili: rr.reduce((a, r) => a + r.disponibili, 0) };
  };
  // si parte dalla scelta più comune del mockup: Grado B, configurazione più venduta disponibile
  const iniziale = (): [string, Condizione] => {
    for (const g of ['Grado B', 'Grado A', 'Grado C', 'Grado D'] as Condizione[]) for (const c of [...configs].reverse()) if (riga(c, g)) return [c, g];
    return [configs[0], 'Grado B'];
  };
  const [[cfg, g], setScelta] = useState<[string, Condizione]>(iniziale);
  const [added, setAdded] = useState(false);
  const r = riga(cfg, g);
  const giaNelCarrello = p.carrello.filter((v) => v.slug === p.p.slug && v.grado === GRADO[g] && `${v.ram ?? '—'} RAM · ${v.disco ?? '—'}` === cfg).length;
  const esaurito = !r || giaNelCarrello >= r.disponibili;
  const scegliCfg = (c: string) => { setAdded(false); setScelta([c, riga(c, g) ? g : (CONDIZIONI.find((x) => riga(c, x)) ?? g)]); };
  const add = () => {
    if (added) return p.vai('carrello');
    if (!r || esaurito) return;
    p.onCarrello([...p.carrello, { slug: p.p.slug, nome: p.p.modello, modello: r.modello, marca: r.marca, grado: r.grado, ram: r.ram, disco: r.disco, det: `${g} · ${r.ram ?? '—'} RAM`, p: r.prezzo }]);
    setAdded(true);
  };
  return (
    <div className="shopbody"><div style={{ marginBottom: 14 }}><Btn ghost sm onClick={() => p.vai('')}>Tutti i portatili</Btn></div><div className="pdet">
      <div className="ph" style={{ borderRadius: 24 }}>{LAPTOP}</div>
      <div className="stack">
        <div><div className="lbl">{p.p.marca}</div><h2 style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.05 }}>{p.p.modello}</h2><div className="muted">{p.p.spec}</div></div>
        <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-.04em' }}>{r ? eur(r.prezzo) : '—'}</div>
        <div><b>Grado</b>
          <div className="gradebox g4b" style={{ marginTop: 8 }}>
            {CONDIZIONI.map((x) => { const rx = riga(cfg, x); return (
              <button key={x} type="button" className={'gopt' + (g === x ? ' on' : '')} disabled={!rx} aria-pressed={g === x}
                style={rx ? undefined : { opacity: .35, cursor: 'not-allowed' }} onClick={() => { setAdded(false); setScelta([cfg, x]); }}>
                <span style={{ fontWeight: 700 }}>{x}</span><span style={{ fontSize: 18, fontWeight: 800 }}>{rx ? eur(rx.prezzo) : 'Esaurito'}</span>
              </button>); })}
          </div>
          <p style={{ margin: '10px 0 0' }} className="muted">{GDESC[g]}</p>
        </div>
        <div><b>Memoria</b><div className="row" style={{ marginTop: 8 }}>{configs.map((c) => <Chip key={c} on={cfg === c} onClick={() => scegliCfg(c)}>{c}</Chip>)}</div></div>
        <button type="button" className="bigbtn" onClick={add} disabled={!added && esaurito} style={!added && esaurito ? { opacity: .35, cursor: 'not-allowed' } : undefined}>
          {added ? 'Aggiunto · vai al carrello' : esaurito ? 'Esaurito' : 'Aggiungi al carrello'}</button>
        <div className="row"><Pill>Dati cancellati con metodo certificato</Pill><Pill>Garanzia [mesi]</Pill><Pill>Reso entro [giorni]</Pill></div>
      </div></div>
      {r && <SchedaTecnica r={r} g={g} />}
    </div>
  );
}

/** tutte le voci dell'inventario che il cliente può vedere (niente seriali, costi o lotti) */
function SchedaTecnica({ r, g }: { r: Riga; g: Condizione }) {
  const voci: [string, React.ReactNode][] = [
    ['Marca', r.marca], ['Modello', r.modello], ['Generazione', r.generazione], ['Processore', r.cpu], ['Scheda grafica', r.gpu], ['RAM', r.ram], ['Disco', r.disco],
    ['Schermo', r.schermo], ['Batteria', r.batteria_min != null ? `almeno ${r.batteria_min}% della capacità originale` : null], ['Sistema operativo', r.sistema_operativo],
    ['Tastiera', r.tastiera], ['Porte', r.porte], ['Rete', r.rete], ['Webcam', r.webcam], ['Peso', r.peso], ['Grado', g],
    ['Dati', r.dati_cancellati ? 'Cancellati con software certificato, rapporto per numero di serie' : 'Cancellati con metodo certificato prima della spedizione'],
  ];
  return (
    <div className="pcard" style={{ padding: 18, marginTop: 18 }}><b style={{ fontSize: 20 }}>Scheda tecnica</b>
      <div className="schedat">{voci.filter(([, v]) => v != null && v !== '').map(([k, v]) => <div key={k}><span className="lbl">{k}</span><b>{v}</b></div>)}</div>
    </div>
  );
}

/** ricambi originali smontati dai computer che non si vendono interi */
// richiesta di un'azienda: arriva in Richieste della Corporation, assegnata a chi delle Vendite ne ha meno
function Aziende({ modelli }: { modelli: string[] }) {
  const [v, setV] = useState({ azienda: '', nome: '', email: '', telefono: '', modello: '', altro: '', grado: 'Indifferente', quantita: '5', note: '', privacy: false, sito_web: '' });
  const [stato, setStato] = useState<'' | 'invio' | 'ok'>('');
  const [errore, setErrore] = useState<string | null>(null);
  const modello = v.modello === 'Altro' ? v.altro.trim() : v.modello;
  const manda = async () => {
    setStato('invio'); setErrore(null);
    try {
      await db.fn('richiesta-sito', { sito: 'corporation', tipo: 'aziende', nome: v.nome, azienda: v.azienda, email: v.email, telefono: v.telefono, privacy: v.privacy, sito_web: v.sito_web,
        note: v.note, dettagli: { modello, grado: v.grado === 'Indifferente' ? '' : v.grado, quantita: Number(v.quantita) } });
      setStato('ok');
    } catch (e) { setErrore((e as Error).message); setStato(''); }
  };
  const campo = (k: 'azienda' | 'nome' | 'email' | 'telefono', l: string, type = 'text', auto = '') => <label className="field"><span className="lbl">{l}</span>
    <input className="input" type={type} autoComplete={auto || undefined} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>;
  if (stato === 'ok') return <Pagina titolo="Aziende"><Msg>Richiesta ricevuta: entro poche ore vi mandiamo l’offerta per email.</Msg></Pagina>;
  const pronta = v.azienda.trim() && v.nome.trim() && /@/.test(v.email) && modello && Number(v.quantita) >= 1 && v.privacy;
  return <Pagina titolo="Aziende">
    <p className="muted" style={{ margin: 0 }}>Più portatili usati e testati per la vostra azienda, con fattura e consegna in tutta Italia. Diteci modello e quantità: vi mandiamo l’offerta.</p>
    <div className="grid g2">{campo('azienda', 'Azienda', 'text', 'organization')}{campo('nome', 'Nome e cognome', 'text', 'name')}{campo('email', 'Email', 'email', 'email')}{campo('telefono', 'Telefono', 'tel', 'tel')}
      <label className="field"><span className="lbl">Modello</span><select className="input" value={v.modello} onChange={(e) => setV({ ...v, modello: e.target.value })}>
        <option value="">Scegli</option>{modelli.map((m) => <option key={m}>{m}</option>)}<option>Altro</option></select></label>
      {v.modello === 'Altro' && <label className="field"><span className="lbl">Quale</span><input className="input" value={v.altro} onChange={(e) => setV({ ...v, altro: e.target.value })} /></label>}
      <label className="field"><span className="lbl">Grado</span><select className="input" value={v.grado} onChange={(e) => setV({ ...v, grado: e.target.value })}>{['Indifferente', 'A', 'B', 'C', 'D'].map((g) => <option key={g}>{g}</option>)}</select></label>
      <label className="field"><span className="lbl">Quantità</span><input className="input" type="number" min={1} max={5000} value={v.quantita} onChange={(e) => setV({ ...v, quantita: e.target.value })} /></label></div>
    <label className="field"><span className="lbl">Note</span><textarea value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
    <input aria-hidden="true" tabIndex={-1} autoComplete="off" value={v.sito_web} onChange={(e) => setV({ ...v, sito_web: e.target.value })} style={{ position: 'absolute', left: -9999, width: 1, height: 1 }} />
    <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={v.privacy} onChange={(e) => setV({ ...v, privacy: e.target.checked })} style={{ marginTop: 3 }} />
      <span className="lbl">Ho letto l’<a href="#/privacy">informativa privacy</a>.</span></label>
    {errore && <div className="warn">{errore}</div>}
    <div><Btn onClick={manda} disabled={!pronta || stato === 'invio'}>{stato === 'invio' ? 'Un momento…' : 'Invia'}</Btn></div>
  </Pagina>;
}

function Ricambi() {
  const [R, setR] = useState<Ricambio[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  useEffect(() => { db.rpc<Ricambio[]>('catalogo_ricambi').then((r) => setR((r ?? []).map((x) => ({ ...x, prezzo: Number(x.prezzo) }))), () => setErrore('I ricambi non si sono caricati. Riprova tra poco.')); }, []);
  return (
    <div className="shopbody"><h1 className="shoph1">Ricambi</h1>
      <p className="muted" style={{ maxWidth: '60ch', margin: '0 0 18px' }}>Pezzi originali smontati dai computer che non si possono vendere interi. Ogni ricambio dice da quale modello arriva. I dischi si vendono solo dopo la cancellazione certificata dei dati.</p>
      {errore && <div className="warn">{errore}</div>}
      {R === null && !errore ? <p className="lbl">Carico…</p> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))' }}>
          {(R ?? []).map((x) => <div key={x.id} className="prod" style={{ cursor: 'default' }}><span className="lbl">Da {x.origine}</span>
            <b style={{ fontSize: 18, letterSpacing: '-.02em' }}>{x.descrizione}</b><span><b style={{ fontSize: 20 }}>{eur(x.prezzo)}</b></span></div>)}
          {R && !R.length && <p className="lbl">Nessun ricambio in vendita adesso.</p>}
        </div>)}
    </div>
  );
}

function Carrello(p: { carrello: Voce[]; onCarrello: (c: Voce[]) => void; vai: (s: string) => void }) {
  const [attesa, setAttesa] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const tot = p.carrello.reduce((a, c) => a + c.p, 0);
  const paga = async () => {
    setAttesa(true); setErrore(null);
    try {
      // il prezzo vero lo ricalcola la funzione sul server: qui si mandano solo le scelte
      const righe = p.carrello.map((c) => ({ modello: c.modello, marca: c.marca, grado: c.grado, ram: c.ram, disco: c.disco }));
      const r = await db.fn<{ url: string }>('stripe-checkout', { righe, email: null });
      if (!r?.url) throw new Error('Il pagamento non è partito');
      location.href = r.url;
    } catch (e) { setErrore((e as Error).message); } finally { setAttesa(false); }
  };
  return (
    <div className="shopbody" style={{ maxWidth: 760, margin: '0 auto' }}><h2 style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-.04em', marginBottom: 16 }}>Carrello</h2>
      {p.carrello.length ? (<>
        {p.carrello.map((c, i) => (
          <div key={i} className="pcard row between" style={{ padding: 16, marginBottom: 10 }}>
            <div><b style={{ fontSize: 17 }}>{c.nome}</b><div className="lbl">{c.det}</div></div>
            <div className="row"><b style={{ fontSize: 20 }}>{eur(c.p)}</b><Btn ghost sm onClick={() => p.onCarrello(p.carrello.filter((_, j) => j !== i))}>Togli</Btn></div>
          </div>))}
        <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 6 }}><b>Totale</b><b style={{ fontSize: 28 }}>{eur(tot)}</b></div>
        <div style={{ marginTop: 14 }} className="stack">
          {errore && <div className="warn">{errore}</div>}
          <button type="button" className="bigbtn" onClick={paga} disabled={attesa}>{attesa ? 'Un momento…' : 'Vai al pagamento'}</button>
          {db.modo === 'prova' && <span className="lbl">Prova: il pagamento non è attivo, si apre la pagina di conferma.</span>}
        </div>
      </>) : (
        <div className="pcard" style={{ padding: 24, textAlign: 'center' }}>Il carrello è vuoto. <div style={{ marginTop: 12 }}><Btn ghost sm onClick={() => p.vai('')}>Guarda i portatili</Btn></div></div>
      )}
    </div>
  );
}

function Grazie({ onSvuota, vai }: { onSvuota: () => void; vai: (s: string) => void }) {
  useEffect(() => { onSvuota(); }, [onSvuota]);
  return <Pagina titolo="Grazie"><Msg>Ordine ricevuto: ti arriva la mail di conferma con la ricevuta. Spediamo entro [giorni].</Msg><div><Btn ghost sm onClick={() => vai('')}>Guarda i portatili</Btn></div></Pagina>;
}

createRoot(document.getElementById('root')!).render(<App />);
