// Collegamento ai dati per tutte le app Messina (gestionali, app, portale, negozio).
// Stessa sintassi di supabase-js: db.from('bolle').select('*,clienti(nome)').eq('stato','Nuova')
// Due motori:
//  · supabase: le API vere (REST + Auth + Storage + Edge Functions), con i permessi del database;
//  · prova: dati finti in memoria, per vedere le schermate prima di collegare Supabase.

export interface Config {
  supabaseUrl?: string; supabaseKey?: string;
  /** App Messina: quale delle quattro app del mockup (autisti, magazzino, presenze, corporation). Di solito la dice la pagina d'ingresso. */
  parte?: string;
  /** solo modalità Prova (senza chiavi): l'utente di esempio con cui entrare da soli, come nella pagina «Prova programma Messina» */
  provaUtente?: string;
}
export interface Sessione { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string } }
/** doppio fattore: «ok» = si entra; «codice» = chiedere il codice dell'app di autenticazione; «nuovo» = primo collegamento con il QR */
export type Fattore = { stato: 'ok' } | { stato: 'codice'; id: string } | { stato: 'nuovo'; id: string; qr: string; segreto: string };

type Filtro = [col: string, op: string, val: unknown];
export interface Query {
  tabella: string; colonne: string; filtri: Filtro[]; ordine: [string, boolean][]; limite?: number;
  metodo: 'GET' | 'PATCH' | 'POST' | 'DELETE'; corpo?: unknown; unico?: boolean;
}

export interface Motore {
  esegui(q: Query): Promise<unknown>;
  rpc(fn: string, args: object): Promise<unknown>;
  fn(nome: string, corpo: unknown): Promise<unknown>;
  carica(bucket: string, percorso: string, file: Blob): Promise<void>;
  link(bucket: string, percorso: string): Promise<string>;
  login(email: string, password: string): Promise<Sessione>;
  logout(): Promise<void>;
  sessione(): Sessione | null;
  fattore(): Promise<Fattore>;
  verifica(id: string, codice: string): Promise<void>;
  modo: 'supabase' | 'prova';
}

export class Builder<T = Record<string, unknown>> implements PromiseLike<T[]> {
  q: Query;
  constructor(private m: Motore, tabella: string) { this.q = { tabella, colonne: '*', filtri: [], ordine: [], metodo: 'GET' }; }
  select(c = '*') { this.q.colonne = c; return this; }
  eq(c: string, v: unknown) { this.q.filtri.push([c, 'eq', v]); return this; }
  neq(c: string, v: unknown) { this.q.filtri.push([c, 'neq', v]); return this; }
  gt(c: string, v: unknown) { this.q.filtri.push([c, 'gt', v]); return this; }
  gte(c: string, v: unknown) { this.q.filtri.push([c, 'gte', v]); return this; }
  lt(c: string, v: unknown) { this.q.filtri.push([c, 'lt', v]); return this; }
  lte(c: string, v: unknown) { this.q.filtri.push([c, 'lte', v]); return this; }
  in(c: string, v: unknown[]) { this.q.filtri.push([c, 'in', v]); return this; }
  is(c: string, v: null | boolean) { this.q.filtri.push([c, 'is', v]); return this; }
  ilike(c: string, v: string) { this.q.filtri.push([c, 'ilike', v]); return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.q.ordine.push([c, o.ascending !== false]); return this; }
  limit(n: number) { this.q.limite = n; return this; }
  update(dati: object) { this.q.metodo = 'PATCH'; this.q.corpo = dati; return this; }
  insert(dati: object | object[]) { this.q.metodo = 'POST'; this.q.corpo = dati; return this; }
  delete() { this.q.metodo = 'DELETE'; return this; }
  async single(): Promise<T> { this.q.unico = true; const r = await this.m.esegui(this.q) as T[]; if (!r.length) throw new Error('Non trovato'); return r[0]; }
  then<A = T[], B = never>(ok?: ((v: T[]) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return (this.m.esegui(this.q) as Promise<T[]>).then(ok, ko);
  }
}

export function creaDb(m: Motore) {
  return {
    modo: m.modo,
    from: <T = Record<string, any>>(t: string) => new Builder<T>(m, t),
    rpc: <T = unknown>(fn: string, args: object = {}) => m.rpc(fn, args) as Promise<T>,
    fn: <T = unknown>(nome: string, corpo: unknown = {}) => m.fn(nome, corpo) as Promise<T>,
    storage: { carica: m.carica.bind(m), link: m.link.bind(m) },
    auth: { login: m.login.bind(m), logout: m.logout.bind(m), sessione: m.sessione.bind(m), fattore: m.fattore.bind(m), verifica: m.verifica.bind(m) },
  };
}
export type Db = ReturnType<typeof creaDb>;

// ------------------------------------------------------------------ Supabase
const enc = (v: unknown) => encodeURIComponent(String(v));
export function urlQuery(q: Query) {
  const p: string[] = [];
  if (q.metodo === 'GET' || q.metodo === 'PATCH' || q.metodo === 'POST') p.push('select=' + enc(q.colonne));
  for (const [c, op, v] of q.filtri) {
    if (op === 'in') p.push(`${c}=in.(${(v as unknown[]).map((x) => `"${String(x).replace(/"/g, '\\"')}"`).map(enc).join(',')})`);
    else if (op === 'is') p.push(`${c}=is.${v}`);
    else p.push(`${c}=${op}.${enc(v)}`);
  }
  if (q.ordine.length) p.push('order=' + q.ordine.map(([c, a]) => `${c}.${a ? 'asc' : 'desc'}.nullslast`).join(','));
  if (q.limite) p.push('limit=' + q.limite);
  return `${q.tabella}?${p.join('&')}`;
}

export function motoreSupabase(url: string, chiave: string): Motore {
  const K = 'messina.sessione';
  let s: Sessione | null = null;
  try { s = JSON.parse(localStorage.getItem(K) || 'null'); } catch { s = null; }
  const salva = (x: Sessione | null) => { s = x; try { x ? localStorage.setItem(K, JSON.stringify(x)) : localStorage.removeItem(K); } catch { /* */ } };

  async function auth(path: string, body: unknown): Promise<Sessione> {
    const r = await fetch(`${url}/auth/v1/${path}`, { method: 'POST', headers: { apikey: chiave, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.msg || 'Accesso non riuscito');
    return { ...j, expires_at: Math.floor(Date.now() / 1000) + j.expires_in };
  }
  async function token() {
    if (!s) return chiave;  // senza login (negozio): chiave pubblica
    if (s.expires_at - 60 < Date.now() / 1000) {
      try { salva(await auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token })); }
      catch (e) { salva(null); throw e; }
    }
    return s!.access_token;
  }
  async function chiama(path: string, init: RequestInit & { prefer?: string } = {}) {
    const r = await fetch(`${url}${path}`, { ...init, headers: { apikey: chiave, Authorization: `Bearer ${await token()}`,
      ...(init.body instanceof Blob ? {} : { 'Content-Type': 'application/json' }), ...(init.prefer ? { Prefer: init.prefer } : {}), ...(init.headers || {}) } });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || `Errore ${r.status}`);
    }
    return r.status === 204 ? null : r.json();
  }
  return {
    modo: 'supabase',
    esegui: (q) => chiama(`/rest/v1/${urlQuery(q)}`, {
      method: q.metodo, body: q.corpo === undefined ? undefined : JSON.stringify(q.corpo),
      prefer: q.metodo === 'GET' ? undefined : 'return=representation' }).then((r) => r ?? []),
    rpc: (fn, args) => chiama(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }),
    fn: (nome, corpo) => chiama(`/functions/v1/${nome}`, { method: 'POST', body: JSON.stringify(corpo) }),
    async carica(bucket, percorso, file) { await chiama(`/storage/v1/object/${bucket}/${percorso}`, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' } }); },
    async link(bucket, percorso) { const r = await chiama(`/storage/v1/object/sign/${bucket}/${percorso}`, { method: 'POST', body: JSON.stringify({ expiresIn: 600 }) }) as { signedURL: string }; return `${url}/storage/v1${r.signedURL}`; },
    async login(email, password) { salva(await auth('token?grant_type=password', { email, password })); return s!; },
    async logout() { try { if (s) await fetch(`${url}/auth/v1/logout`, { method: 'POST', headers: { apikey: chiave, Authorization: `Bearer ${s.access_token}` } }); } finally { salva(null); } },
    sessione: () => s,
    // Doppio fattore (TOTP). Il database pretende il livello aal2 per i ruoli indicati in impostazioni
    // («ruoli_doppio_fattore»): qui l'app chiede il codice, o al primo accesso mostra il QR da inquadrare.
    async fattore() {
      if (!s) throw new Error('Nessun accesso');
      if (livello(await token()) === 'aal2') return { stato: 'ok' };
      if (!(await chiama('/rest/v1/rpc/serve_doppio_fattore', { method: 'POST', body: '{}' }))) return { stato: 'ok' };
      const u = await utente('user', 'GET') as { factors?: { id: string; factor_type: string; status: string }[] };
      const totp = (u.factors ?? []).filter((f) => f.factor_type === 'totp');
      const pronto = totp.find((f) => f.status === 'verified');
      if (pronto) return { stato: 'codice', id: pronto.id };
      for (const f of totp) await utente(`factors/${f.id}`, 'DELETE').catch(() => null);   // tentativi lasciati a metà
      const n = await utente('factors', 'POST', { factor_type: 'totp', friendly_name: 'Messina', issuer: 'Messina' }) as { id: string; totp: { qr_code: string; secret: string } };
      return { stato: 'nuovo', id: n.id, qr: n.totp.qr_code, segreto: n.totp.secret };
    },
    async verifica(id, codice) {
      const c = await utente(`factors/${id}/challenge`, 'POST', {}) as { id: string };
      const j = await utente(`factors/${id}/verify`, 'POST', { challenge_id: c.id, code: codice.replace(/\s/g, '') }) as Sessione & { expires_in: number };
      salva({ ...j, expires_at: Math.floor(Date.now() / 1000) + j.expires_in });
    },
  };
  async function utente(path: string, method: string, body?: unknown) {
    const r = await fetch(`${url}/auth/v1/${path}`, { method, headers: { apikey: chiave, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 422 || r.status === 400 ? 'Codice non valido: riprova con quello nuovo' : (j.msg || j.message || 'Verifica non riuscita'));
    return j;
  }
}

/** livello di accesso scritto nel token (aal1 = solo password, aal2 = anche il codice) */
function livello(t: string): string | undefined {
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aal; } catch { return undefined; }
}

// ------------------------------------------------------------------ Prova
export type Tabelle = Record<string, Record<string, any>[]>;
/** relazioni per gli «embed»: tabella → nome embed → colonna (o [colonna, 'molti'] per l'inverso) */
export type Relazioni = Record<string, Record<string, string | [string, 'molti']>>;
export type RpcProva = Record<string, (args: any, t: Tabelle, utente: string | null) => unknown>;

function dividi(s: string) {
  const out: string[] = []; let d = 0, cur = '';
  for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; }
  if (cur) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export type FunzioniProva = Record<string, (corpo: any, t: Tabelle, utente: string | null) => unknown>;
/** regole del database rifatte in prova: ricevono la riga prima e dopo la modifica (prima = null se è nuova) e possono rifiutarla */
export type RegoleProva = Record<string, (prima: Record<string, any> | null, dopo: Record<string, any>, t: Tabelle, utente: string | null) => void>;
/** in prova, le righe che l'utente può vedere (come le regole RLS del database) */
export type FiltriProva = Record<string, (riga: Record<string, any>, t: Tabelle, utente: string | null) => boolean>;
/** chiave della sessione di prova: ogni programma della pagina «Prova programma Messina» ha la sua (nome della cornice) */
export function chiaveProva() {
  let nome = '';
  try { nome = window.name; } catch { /* */ }
  return nome ? 'messina.prova.' + nome : 'messina.prova';
}

// ------------------------------------------------------------------ prova condivisa
// Dentro la pagina «Prova programma Messina» ogni programma (gestionale, app, portale, negozio) gira in una sua cornice.
// Perché sembri tutto collegato allo stesso database, dopo ogni modifica la copia dei dati va alla pagina,
// che la gira agli altri programmi. Fuori da quella pagina, o con Supabase collegato, non succede niente.
const ascoltatori = new Set<() => void>();
/** chiama f quando i dati di prova cambiano in un altro programma della pagina; restituisce la funzione per smettere */
export function onCambioProva(f: () => void) { ascoltatori.add(f); return () => { ascoltatori.delete(f); }; }

function condividi(t: Tabelle) {
  // la pagina della prova è sempre la più esterna (window.top): anche il portale, che in Prova sta dentro Autotrasporti, parla con lei
  let pagina: Window | null = null;
  try { pagina = window.top && window.top !== window ? window.top : null; } catch { pagina = null; }
  const dentro = !!pagina;
  const impronta = () => { try { return JSON.stringify(t); } catch { return String(Math.random()); } };
  if (!dentro) return { impronta: () => '', invia: () => {}, esterno: (_f: (nome: string, corpo: unknown) => void) => {} };
  const io = Math.random().toString(36).slice(2);
  // versione: quante modifiche conosce questo programma. La pagina accetta una modifica solo se parte
  // dall'ultima versione, così una copia vecchia non cancella quella nuova.
  let versione = 0;
  const manda = (azione: string) => { try { pagina!.postMessage({ tipo: 'messina-prova', azione, da: io, base: versione, t }, '*'); } catch { /* */ } };
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== pagina || !d || typeof d !== 'object') return;
    if (d.tipo === 'messina-prova-versione' && typeof d.v === 'number') { versione = d.v; return; }
    if (d.tipo !== 'messina-prova-stato' || d.da === io || !d.t || typeof d.t !== 'object') return;
    if (typeof d.v === 'number') versione = d.v;
    for (const k of Object.keys(d.t)) if (Array.isArray(d.t[k])) t[k] = d.t[k];
    ascoltatori.forEach((f) => f());
  });
  manda('ciao');
  return { impronta, invia: () => manda('stato'), esterno: (f: (nome: string, corpo: unknown) => void) => {
    // la pagina chiede di eseguire un servizio qui (per esempio il modulo di un sito che arriva nella Mail)
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (e.source === pagina && d && d.tipo === 'messina-prova-fn' && typeof d.nome === 'string') f(d.nome, d.corpo);
    });
  } };
}

/** in prova: il file caricato, oppure un documento di esempio che dice cos'è */
function linkProva(t: Tabelle, bucket: string, percorso: string) {
  const f = [...(t.prova_file ?? [])].reverse().find((x) => x.bucket === bucket && x.percorso === percorso);
  if (f?.dati) {
    const [testa, b64] = String(f.dati).split(',');
    const bin = atob(b64 ?? ''); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([a], { type: testa.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream' }));
  }
  const esc = (x: string) => x.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]!));
  const nome = esc(percorso.split('/').pop() ?? percorso);
  const cosa = bucket === 'bolle' ? 'Foto della bolla firmata' : bucket === 'telecamere' ? 'Immagine della telecamera' : bucket === 'device' ? 'Foto del seriale' : 'Documento';
  if (bucket === 'telecamere') {   // fotogramma di esempio scuro, come le immagini delle telecamere nel mockup
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#2a2d33"/><stop offset="1" stop-color="#121316"/></linearGradient></defs><rect width="800" height="480" fill="url(#g)"/></svg>`;
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  }
  if (bucket !== 'documenti') {   // immagini (bolle, telecamere, seriali): un'immagine di esempio, che si vede anche dentro <img>
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560"><rect width="800" height="560" fill="#eceef3"/>
<rect x="40" y="40" width="720" height="480" rx="24" fill="#fff" stroke="#d6d8de" stroke-width="2"/>
<text x="400" y="250" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="700" fill="#111214">${cosa}</text>
<text x="400" y="300" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" fill="#5b5e66">Dati di esempio · ${nome}</text></svg>`;
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  }
  const html = `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${cosa}</title>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f2f3f5;color:#111214;display:grid;place-items:center;min-height:100vh">
<div style="background:#fff;border-radius:20px;padding:28px;max-width:520px;width:calc(100% - 32px);box-shadow:0 16px 36px -22px rgba(20,24,32,.28)">
<div style="font-size:13px;color:#5b5e66">Messina · dati di esempio</div><h1 style="font-size:24px;margin:6px 0 14px">${cosa}</h1>
<div style="border:2px dashed rgba(17,18,20,.15);border-radius:14px;height:220px;display:grid;place-items:center;color:#5b5e66;font-size:14px;text-align:center;padding:12px">${nome}</div>
<p style="font-size:14px;color:#5b5e66;margin:14px 0 0">Online qui si apre il file vero, con un link che scade dopo 10 minuti.</p></div></body></html>`;
  return URL.createObjectURL(new Blob([html], { type: 'text/html' }));
}

export function motoreProva(t: Tabelle, rel: Relazioni, rpc: RpcProva, utenti: Record<string, string>, viste: (t: Tabelle) => void = () => {}, funzioni: FunzioniProva = {}, regole: RegoleProva = {}, filtri: FiltriProva = {}): Motore {
  let io: string | null = null;
  try { io = sessionStorage.getItem(chiaveProva()); } catch { io = null; }
  const pausa = () => new Promise((r) => setTimeout(r, 80));
  const pagina = condividi(t);
  pagina.esterno((nome, corpo) => {
    const f = funzioni[nome]; if (!f) return;
    try { const prima = pagina.impronta(); f(corpo, t, null); const cambiato = pagina.impronta() !== prima; viste(t); if (cambiato) { pagina.invia(); ascoltatori.forEach((x) => x()); } } catch (e) { console.warn('Prova:', (e as Error).message); }
  });

  function proietta(tab: string, riga: Record<string, any>, colonne: string): Record<string, any> {
    const out: Record<string, any> = {};
    for (const parte of dividi(colonne)) {
      const m = parte.match(/^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/s);
      if (m) {
        const [, alias, nome, sub] = m;
        const r = rel[tab]?.[nome];
        if (!r) { out[alias || nome] = null; continue; }
        if (Array.isArray(r)) out[alias || nome] = (t[nome] || []).filter((x) => x[r[0]] === riga.id).map((x) => proietta(nome, x, sub));
        else { const f = (t[nome] || []).find((x) => x.id === riga[r]); out[alias || nome] = f ? proietta(nome, f, sub) : null; }
      } else if (parte === '*') Object.assign(out, riga);
      else out[parte] = riga[parte];
    }
    return out;
  }
  const passa = (r: Record<string, any>, [c, op, v]: Filtro) => {
    const x = r[c];
    switch (op) {
      case 'eq': return String(x) === String(v);
      case 'neq': return String(x) !== String(v);
      case 'gt': return x > (v as any); case 'gte': return x >= (v as any);
      case 'lt': return x < (v as any); case 'lte': return x <= (v as any);
      case 'in': return (v as unknown[]).map(String).includes(String(x));
      case 'is': return v === null ? x === null || x === undefined : x === v;
      case 'ilike': return String(x ?? '').toLowerCase().includes(String(v).replace(/%/g, '').toLowerCase());
    }
    return true;
  };
  return {
    modo: 'prova',
    async esegui(q) {
      await pausa();
      const prima = q.metodo === 'GET' ? '' : pagina.impronta();
      if (q.metodo === 'GET') viste(t);
      const tab = t[q.tabella] ?? (t[q.tabella] = []);
      const vede = filtri[q.tabella];
      let righe = tab.filter((r) => q.filtri.every((f) => passa(r, f)) && (!vede || vede(r, t, io)));
      if (q.metodo === 'PATCH') {
        const nuove = righe.map((r) => { const d = { ...r, ...(q.corpo as object) }; regole[q.tabella]?.(r, d, t, io); return d; });
        righe.forEach((r, i) => Object.assign(r, nuove[i]));
      }
      if (q.metodo === 'DELETE') { t[q.tabella] = tab.filter((r) => !righe.includes(r)); return []; }
      if (q.metodo === 'POST') {
        const nuove = (Array.isArray(q.corpo) ? q.corpo : [q.corpo]).map((x: any) => ({ id: crypto.randomUUID(), ...x }));
        nuove.forEach((d) => regole[q.tabella]?.(null, d, t, io));
        tab.push(...nuove); righe = nuove;
      }
      for (const [c, a] of [...q.ordine].reverse()) righe = [...righe].sort((x, y) => (x[c] ?? '') < (y[c] ?? '') ? (a ? -1 : 1) : (x[c] ?? '') > (y[c] ?? '') ? (a ? 1 : -1) : 0);
      if (q.limite) righe = righe.slice(0, q.limite);
      if (q.metodo !== 'GET' && pagina.impronta() !== prima) pagina.invia();   // solo se qualcosa è cambiato davvero
      return righe.map((r) => proietta(q.tabella, r, q.colonne));
    },
    async rpc(fn, args) { await pausa(); const f = rpc[fn]; if (!f) throw new Error(`In prova «${fn}» non è disponibile`); const prima = pagina.impronta(); const r = f(args, t, io); const cambiato = pagina.impronta() !== prima; viste(t); if (cambiato) pagina.invia(); return r; },
    async fn(nome, corpo) { await pausa(); const f = funzioni[nome]; if (!f) throw new Error(`«${nome}» funziona solo collegato a Supabase`); const prima = pagina.impronta(); const r = f(corpo, t, io); const cambiato = pagina.impronta() !== prima; viste(t);
      if (cambiato) { pagina.invia(); ascoltatori.forEach((x) => x()); } return r; },
    // file: in prova la foto o il documento caricato resta nel database di esempio, così si riapre anche da un altro programma
    async carica(bucket, percorso, file) {
      await pausa();
      const dati = file.size <= 1_500_000 ? await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ok(''); r.readAsDataURL(file); }) : '';
      (t.prova_file ??= []).push({ id: crypto.randomUUID(), bucket, percorso, tipo: file.type, dati });
      pagina.invia();
    },
    async link(bucket, percorso) { return linkProva(t, bucket, percorso); },
    async login(email) {
      await pausa();
      const id = utenti[email.trim().toLowerCase()];
      if (!id) throw new Error('Utente di prova sconosciuto');
      io = id; try { sessionStorage.setItem(chiaveProva(), id); } catch { /* */ }
      return { access_token: 'prova', refresh_token: 'prova', expires_at: 0, user: { id, email } };
    },
    async logout() { io = null; try { sessionStorage.removeItem(chiaveProva()); } catch { /* */ } },
    sessione: () => io ? { access_token: 'prova', refresh_token: 'prova', expires_at: 0, user: { id: io } } : null,
    async fattore() { return { stato: 'ok' }; },   // in Prova il codice non serve
    async verifica() { /* */ },
  };
}

/** Prova: se la configurazione indica un utente di esempio, entra da solo (online, con le chiavi, non fa niente) */
export async function entraInProva(db: { modo: string; auth: { sessione: () => unknown; login: (e: string, p: string) => Promise<unknown> } }, cfg: Config | undefined) {
  if (db.modo !== 'prova' || !cfg?.provaUtente || db.auth.sessione()) return;
  try { await db.auth.login(cfg.provaUtente, 'prova'); } catch { /* resta la scelta dell'utente */ }
}

/** sceglie il motore: con config.js compilato → Supabase, altrimenti Prova */
export function collega(cfg: Config | undefined, prova: () => Motore) {
  return creaDb(cfg?.supabaseUrl && cfg?.supabaseKey && !cfg.supabaseUrl.includes('XXXX')
    ? motoreSupabase(cfg.supabaseUrl, cfg.supabaseKey) : prova());
}
