// Foto: controllo di nitidezza e luce (lo stesso del mockup approvato), riduzione prima del caricamento,
// e la firma col dito.
import React, { useEffect, useRef, useState } from 'react';

export interface InfoFoto { url: string; score: number; luce: number; lato: number; titolo?: string; consiglio?: string; blob: Blob }

function carica(file: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => ko(new Error('Foto non leggibile')); img.src = URL.createObjectURL(file); });
}

/** riduce la foto (lato lungo max 2000 px, JPEG): meno dati sul telefono e sotto i 5 MB delle funzioni */
export async function comprimi(file: Blob, max = 2000, qualita = 0.85): Promise<Blob> {
  const img = await carica(file);
  const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b ?? file), 'image/jpeg', qualita));
}

/** analizzaFoto del mockup: varianza del laplaciano (nitidezza), luce media, dimensione */
export async function analizzaFoto(file: Blob, soglia: number): Promise<InfoFoto> {
  const img = await carica(file);
  const W = 1000, sc = Math.min(1, W / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * sc), h = Math.round(img.naturalHeight * sc);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d')!; cx.drawImage(img, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data; const g = new Float32Array(w * h); let sum = 0;
  for (let i = 0; i < w * h; i++) { const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; g[i] = v; sum += v; }
  let m = 0, m2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]; m += l; m2 += l * l; n++; }
  const score = Math.round(m2 / n - (m / n) * (m / n)), luce = Math.round(sum / (w * h)), lato = Math.min(img.naturalWidth, img.naturalHeight);
  const info: InfoFoto = { url: img.src, score, luce, lato, blob: await comprimi(file) };
  if (lato < 700) { info.titolo = 'Foto troppo piccola'; info.consiglio = 'Usa la fotocamera, non uno screenshot o una foto ridotta.'; }
  else if (luce < 55) { info.titolo = 'Foto troppo scura'; info.consiglio = 'Spostati verso la luce o accendi il flash.'; }
  else if (score < soglia) { info.titolo = 'Foto sfocata: la bolla non si legge'; info.consiglio = 'Appoggia la bolla su un piano, tieni fermo il telefono e inquadrala tutta.'; }
  return info;
}

/** firma del cliente col dito: restituisce il PNG */
export function Firma({ onFatto, onAnnulla }: { onFatto: (png: Blob) => void; onAnnulla: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [vuota, setVuota] = useState(true);
  useEffect(() => {
    const c = cv.current!; const r = c.getBoundingClientRect(); const k = window.devicePixelRatio || 1;
    c.width = r.width * k; c.height = r.height * k; const x = c.getContext('2d')!; x.scale(k, k);
    x.lineWidth = 2.6; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#111214';
    let giu = false;
    const p = (e: PointerEvent) => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const dn = (e: PointerEvent) => { giu = true; c.setPointerCapture(e.pointerId); const [a, b] = p(e); x.beginPath(); x.moveTo(a, b); };
    const mv = (e: PointerEvent) => { if (!giu) return; const [a, b] = p(e); x.lineTo(a, b); x.stroke(); setVuota(false); };
    const up = () => { giu = false; };
    c.addEventListener('pointerdown', dn); c.addEventListener('pointermove', mv); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    return () => { c.removeEventListener('pointerdown', dn); c.removeEventListener('pointermove', mv); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); };
  }, []);
  const pulisci = () => { const c = cv.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setVuota(true); };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <canvas ref={cv} aria-label="Firma del cliente" style={{ width: '100%', height: 160, background: '#fff', borderRadius: 14, touchAction: 'none', boxShadow: 'inset 0 0 0 1px var(--line)' }} />
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <button type="button" className="bigbtn ghost" style={{ flex: 1 }} onClick={vuota ? onAnnulla : pulisci}>Cancella</button>
        <button type="button" className="bigbtn" style={{ flex: 1, ...(vuota ? { opacity: .35, cursor: 'not-allowed' } : {}) }} disabled={vuota}
          onClick={() => cv.current!.toBlob((b) => b && onFatto(b), 'image/png')}>Conferma</button>
      </div>
    </div>
  );
}
