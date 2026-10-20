// Lettura dei codici: fotocamera del telefono (BarcodeDetector, oppure ZXing caricato al volo)
// e pistole Bluetooth/USB che «scrivono» il codice come una tastiera e chiudono con Invio.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useApp } from './core';

const ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';

interface Richiesta { titolo: string; suggerimenti?: string[]; risolvi: (c: string | null) => void }
interface ScanCtx { scansiona: (titolo: string, suggerimenti?: string[]) => Promise<string | null>; registraPistola: (f: ((c: string) => void) | null) => void }
const Ctx = createContext<ScanCtx | null>(null);
export const useScan = () => useContext(Ctx)!.scansiona;

/** la schermata riceve i codici della pistola anche senza aprire la fotocamera */
export function usePistola(f: ((codice: string) => void) | null) {
  const { registraPistola } = useContext(Ctx)!;
  const rif = useRef(f); rif.current = f;
  useEffect(() => { if (!f) return; registraPistola((c) => rif.current?.(c)); return () => registraPistola(null); }, [!!f, registraPistola]);
}

export function ScanProvider({ children, prova }: { children: React.ReactNode; prova: boolean }) {
  const [rich, setRich] = useState<Richiesta | null>(null);
  const pistola = useRef<((c: string) => void) | null>(null);
  const richRif = useRef<Richiesta | null>(null); richRif.current = rich;
  const scansiona = useCallback((titolo: string, suggerimenti?: string[]) => new Promise<string | null>((risolvi) => setRich({ titolo, suggerimenti, risolvi })), []);
  const registraPistola = useCallback((f: ((c: string) => void) | null) => { pistola.current = f; }, []);
  const chiudi = useCallback((c: string | null) => { const r = richRif.current; setRich(null); r?.risolvi(c ? c.trim() : null); }, []);

  // pistola: caratteri che arrivano molto veloci e finiscono con Invio
  useEffect(() => {
    let buf = '', ultimo = 0;
    const tasto = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;  // si sta scrivendo a mano
      const ora = performance.now();
      if (ora - ultimo > 80) buf = '';
      ultimo = ora;
      if (e.key === 'Enter') { if (buf.length >= 3) { const c = buf; buf = ''; e.preventDefault(); if (richRif.current) chiudi(c); else pistola.current?.(c); } return; }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener('keydown', tasto);
    return () => window.removeEventListener('keydown', tasto);
  }, [chiudi]);

  return <Ctx.Provider value={{ scansiona, registraPistola }}>{children}{rich && <Overlay r={rich} prova={prova} chiudi={chiudi} />}</Ctx.Provider>;
}

function Overlay({ r, prova, chiudi }: { r: Richiesta; prova: boolean; chiudi: (c: string | null) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [manuale, setManuale] = useState('');
  const [avviso, setAvviso] = useState<string | null>(null);
  useEffect(() => {
    let fermo = false;
    const stop = avviaLettura(() => video.current, (c) => { if (fermo) return; fermo = true; try { navigator.vibrate?.(40); } catch { /* */ } chiudi(c); },
      () => setAvviso('Fotocamera non disponibile: scrivi il codice qui sotto.'));
    return () => { fermo = true; stop(); };
  }, [chiudi]);
  return (
    <div role="dialog" aria-label={r.titolo} style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#1d1e22', color: '#e6e6ea', display: 'flex', flexDirection: 'column',
      padding: 'calc(16px + env(safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom,0px))', gap: 12 }}>
      <b style={{ fontSize: 20 }}>{r.titolo}</b>
      <div style={{ position: 'relative', flex: 1, minHeight: 200, borderRadius: 22, overflow: 'hidden', background: '#000' }}>
        <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div aria-hidden="true" style={{ position: 'absolute', inset: '22% 12%', border: '3px solid #fff', borderRadius: 18 }} />
      </div>
      <div className="camtxt" style={{ maxWidth: 'none' }}>{avviso ?? 'Inquadra il codice. Con la pistola basta sparare.'}</div>
      {prova && r.suggerimenti?.length ? <div className="row" style={{ gap: 6 }}>{r.suggerimenti.slice(0, 8).map((s) =>
        <button key={s} type="button" className="chipbtn" style={{ background: '#fff', color: '#111' }} onClick={() => chiudi(s)}>{s}</button>)}</div> : null}
      <form className="row" style={{ gap: 8, flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); if (manuale.trim()) chiudi(manuale); }}>
        <input className="input" aria-label="Codice" placeholder="Codice" value={manuale} onChange={(e) => setManuale(e.target.value)} autoCapitalize="characters" autoCorrect="off" style={{ flex: 1 }} />
        <button type="submit" className="round" style={{ width: 'auto', padding: '0 18px', color: '#111' }}>Ok</button>
      </form>
      <button type="button" className="bigbtn ghost" onClick={() => chiudi(null)}>Annulla</button>
    </div>
  );
}

/** fotocamera dal vivo dentro un riquadro (.cam dell'App Corporation); scatta una foto */
export function useFotocamera() {
  const video = useRef<HTMLVideoElement>(null);
  const [pronta, setPronta] = useState(false);
  useEffect(() => {
    let s: MediaStream | null = null, vivo = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false })
      .then(async (x) => { if (!vivo) { x.getTracks().forEach((t) => t.stop()); return; } s = x; const v = video.current; if (v) { v.srcObject = x; await v.play().catch(() => {}); setPronta(true); } })
      .catch(() => setPronta(false));
    return () => { vivo = false; s?.getTracks().forEach((t) => t.stop()); };
  }, []);
  const scatta = useCallback(async (): Promise<Blob | null> => {
    const v = video.current; if (!v || !pronta || !v.videoWidth) return null;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')!.drawImage(v, 0, 0);
    return new Promise((ok) => c.toBlob((b) => ok(b), 'image/jpeg', 0.9));
  }, [pronta]);
  return { video, pronta, scatta };
}

/** solo in Prova: i codici «stampati» sulle etichette finte, da toccare al posto della fotocamera */
export function useCodiciProva(cosa: string, id: string | null = null, giro: unknown = 0): string[] | undefined {
  const { db } = useApp();
  const [c, setC] = useState<string[] | undefined>(undefined);
  useEffect(() => { if (db.modo !== 'prova') return; db.rpc<string[]>('prova_codici', { cosa, id }).then(setC, () => setC(undefined)); }, [db, cosa, id, giro]);
  return c;
}

/** apre la fotocamera posteriore nel <video> e legge i codici finché non la si ferma */
function avviaLettura(video: () => HTMLVideoElement | null, onCodice: (c: string) => void, onErrore: () => void, onPronta?: () => void): () => void {
  let stream: MediaStream | null = null, fermo = false, ctrl: { stop(): void } | null = null;
  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      if (fermo) { stream.getTracks().forEach((t) => t.stop()); return; }
      const v = video(); if (!v) return;
      v.srcObject = stream; await v.play(); onPronta?.();
      const BD = (window as any).BarcodeDetector;
      if (BD) {
        const formati = await BD.getSupportedFormats?.() ?? ['qr_code', 'code_128'];
        const det = new BD({ formats: formati });
        const giro = async () => { if (fermo) return; try { const c = await det.detect(v); if (c[0]?.rawValue) onCodice(c[0].rawValue); } catch { /* frame non pronto */ } setTimeout(giro, 150); };
        giro();
      } else {
        const zx: any = await import(/* @vite-ignore */ ZXING);
        if (fermo) return;
        ctrl = await new zx.BrowserMultiFormatReader().decodeFromVideoElement(v, (res: any) => { if (res && !fermo) onCodice(res.getText()); });
      }
    } catch { if (!fermo) onErrore(); }
  })();
  return () => { fermo = true; ctrl?.stop(); stream?.getTracks().forEach((t) => t.stop()); };
}

/** fotocamera sempre accesa che legge i codici (il Lettore all'ingresso) */
export function useFotocameraCodici(onCodice: (c: string) => void) {
  const video = useRef<HTMLVideoElement>(null);
  const [pronta, setPronta] = useState(false);
  const cb = useRef(onCodice); cb.current = onCodice;
  useEffect(() => avviaLettura(() => video.current, (c) => cb.current(c), () => setPronta(false), () => setPronta(true)), []);
  return { video, pronta };
}
