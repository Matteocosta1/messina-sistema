// Codificatore QR (byte, correzione M, versioni 1–20), scritto qui per non dipendere da CDN:
// il badge deve aprirsi anche con rete scarsa. Algoritmo dello standard ISO/IEC 18004.
const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
const BLOCCHI_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];

const moduliGrezzi = (v: number) => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
const codewordDati = (v: number) => Math.floor(moduliGrezzi(v) / 8) - ECC_M[v] * BLOCCHI_M[v];
const mul = (x: number, y: number) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; };
function divisore(g: number) { const r = new Array(g - 1).fill(0).concat([1]); let root = 1;
  for (let i = 0; i < g; i++) { for (let j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = mul(root, 2); } return r; }
function resto(dati: number[], div: number[]) { const r = div.map(() => 0);
  for (const b of dati) { const f = b ^ (r.shift() as number); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f); }); } return r; }

export function qrMatrice(testo: string): boolean[][] {
  const byte = Array.from(new TextEncoder().encode(testo));
  let v = 1;
  for (; v <= 20; v++) if (4 + (v <= 9 ? 8 : 16) + byte.length * 8 <= codewordDati(v) * 8) break;
  if (v > 20) throw new Error('Testo troppo lungo per il QR');
  // bit dei dati
  const bit: number[] = []; const metti = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bit.push((val >>> i) & 1); };
  metti(4, 4); metti(byte.length, v <= 9 ? 8 : 16); byte.forEach((b) => metti(b, 8));
  const cap = codewordDati(v) * 8;
  metti(0, Math.min(4, cap - bit.length)); metti(0, (8 - bit.length % 8) % 8);
  for (let p = 0xec; bit.length < cap; p ^= 0xec ^ 0x11) metti(p, 8);
  const dati: number[] = []; for (let i = 0; i < bit.length; i += 8) dati.push(parseInt(bit.slice(i, i + 8).join(''), 2));
  // correzione d'errore e intreccio dei blocchi
  const nb = BLOCCHI_M[v], ecc = ECC_M[v], raw = Math.floor(moduliGrezzi(v) / 8), corti = nb - raw % nb, lc = Math.floor(raw / nb);
  const div = divisore(ecc); const blocchi: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) { const d = dati.slice(k, k + lc - ecc + (i < corti ? 0 : 1)); k += d.length; const e = resto(d, div); if (i < corti) d.push(0); blocchi.push(d.concat(e)); }
  const cw: number[] = [];
  for (let i = 0; i < blocchi[0].length; i++) blocchi.forEach((b, j) => { if (i !== lc - ecc || j >= corti) cw.push(b[i]); });
  // matrice
  const N = v * 4 + 17; const m = Array.from({ length: N }, () => new Array(N).fill(false)); const fz = Array.from({ length: N }, () => new Array(N).fill(false));
  const set = (x: number, y: number, s: boolean) => { m[y][x] = s; fz[y][x] = true; };
  for (let i = 0; i < N; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (x: number, y: number) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
    if (xx >= 0 && xx < N && yy >= 0 && yy < N) set(xx, yy, d !== 2 && d !== 4); } };
  finder(3, 3); finder(N - 4, 3); finder(3, N - 4);
  const pos: number[] = [];
  if (v > 1) { const n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2; pos.push(6); for (let p = N - 7; pos.length < n; p -= step) pos.splice(1, 0, p); }
  pos.forEach((a, i) => pos.forEach((b, j) => { if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
  const formato = (mask: number) => { const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const bits = ((d << 10) | r) ^ 0x5412; const b = (i: number) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, b(i)); set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) set(N - 1 - i, 8, b(i)); for (let i = 8; i < 15; i++) set(8, N - 15 + i, b(i)); set(8, N - 8, true); };
  formato(0);
  if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25); const bits = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const b = ((bits >>> i) & 1) === 1, a = N - 11 + i % 3, c = Math.floor(i / 3); set(a, c, b); set(c, a, b); } }
  let i = 0;
  for (let right = N - 1; right >= 1; right -= 2) { if (right === 6) right = 5;
    for (let vert = 0; vert < N; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? N - 1 - vert : vert;
      if (!fz[y][x] && i < cw.length * 8) { m[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; } } }
  const maschera = (k: number) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (fz[y][x]) continue;
    const inv = [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x * y) % 2 + (x * y) % 3 === 0, ((x * y) % 2 + (x * y) % 3) % 2 === 0, ((x + y) % 2 + (x * y) % 3) % 2 === 0][k];
    if (inv) m[y][x] = !m[y][x]; } };
  const penalita = () => { let p = 0, scuri = 0;
    for (let a = 0; a < N; a++) { let rr = 1, rc = 1; for (let b = 1; b < N; b++) {
      if (m[a][b] === m[a][b - 1]) { rr++; if (rr === 5) p += 3; else if (rr > 5) p++; } else rr = 1;
      if (m[b][a] === m[b - 1][a]) { rc++; if (rc === 5) p += 3; else if (rc > 5) p++; } else rc = 1; } }
    for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
    m.forEach((r) => r.forEach((c) => { if (c) scuri++; }));
    return p + Math.floor(Math.abs(scuri * 20 - N * N * 10) / (N * N)) * 10; };
  let meglio = 0, minimo = Infinity;
  for (let k = 0; k < 8; k++) { maschera(k); formato(k); const p = penalita(); if (p < minimo) { minimo = p; meglio = k; } maschera(k); }
  maschera(meglio); formato(meglio);
  return m;
}

/** SVG del QR, stesso aspetto del mockup (220 px, fondo bianco, angoli arrotondati) */
export function qrSvg(testo: string, lato = 220) {
  const m = qrMatrice(testo), N = m.length; let r = '';
  m.forEach((riga, y) => riga.forEach((c, x) => { if (c) r += `M${x} ${y}h1v1h-1z`; }));
  return `<svg viewBox="-4 -4 ${N + 8} ${N + 8}" width="${lato}" height="${lato}" style="background:#fff;border-radius:12px" shape-rendering="crispEdges" role="img" aria-label="Badge QR"><path fill="#111" d="${r}"/></svg>`;
}
