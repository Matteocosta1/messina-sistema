// Aiuti comuni alle Edge Functions Messina: CORS, errori in italiano, segreti, client al database.
// Nessuna libreria esterna: solo fetch verso REST (PostgREST), Storage e Auth di Supabase.

export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('ORIGINI_CONSENTITE') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-lettore-chiave, x-cron-segreto',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class Errore extends Error {
  constructor(messaggio: string, public stato = 400) { super(messaggio); }
}

export const json = (dati: unknown, stato = 200) =>
  new Response(JSON.stringify(dati), { status: stato, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

/** legge un segreto: se manca dice quale e dove metterlo (mai il valore nei log) */
export function segreto(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Errore(`Manca il segreto ${nome}: va inserito in Supabase → Edge Functions → Secrets (vedi docs/SETUP.md)`, 500);
  return v;
}

/** gestisce OPTIONS, errori e corpo JSON per ogni funzione */
export function servi(gestore: (req: Request, corpo: any) => Promise<unknown>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ errore: 'Usa POST' }, 405);
    try {
      const testo = await req.text();
      let corpo: any = {};
      if (testo) { try { corpo = JSON.parse(testo); } catch { corpo = { _grezzo: testo }; } }
      (corpo as any)._grezzo ??= testo;
      return json(await gestore(req, corpo) ?? { ok: true });
    } catch (e) {
      const err = e instanceof Errore ? e : new Errore('Errore interno', 500);
      if (!(e instanceof Errore)) console.error((e as Error)?.message ?? e);
      return json({ errore: err.message }, err.stato);
    }
  });
}

const URL_SB = () => segreto('SUPABASE_URL');

export interface Db {
  get<T = any>(percorso: string): Promise<T[]>;
  post<T = any>(tabella: string, righe: unknown, prefer?: string): Promise<T[]>;
  patch<T = any>(percorso: string, dati: unknown): Promise<T[]>;
  rpc<T = any>(fn: string, args?: unknown): Promise<T>;
  carica(bucket: string, percorso: string, dati: Blob | Uint8Array, tipo: string): Promise<void>;
  scarica(bucket: string, percorso: string): Promise<{ dati: Uint8Array; tipo: string }>;
}

function client(token: string, chiave: string): Db {
  const base = URL_SB();
  const h = (extra: Record<string, string> = {}) => ({ apikey: chiave, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra });
  const chiama = async (url: string, init: RequestInit) => {
    const r = await fetch(url, init);
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Errore(j.message || j.error || `Errore database ${r.status}`, r.status === 401 || r.status === 403 ? 403 : 400); }
    return r.status === 204 ? null : r.json();
  };
  return {
    get: (p) => chiama(`${base}/rest/v1/${p}`, { headers: h() }),
    post: (t, righe, prefer = 'return=representation') => chiama(`${base}/rest/v1/${t}`, { method: 'POST', headers: h({ Prefer: prefer }), body: JSON.stringify(righe) }).then((x) => x ?? []),
    patch: (p, d) => chiama(`${base}/rest/v1/${p}`, { method: 'PATCH', headers: h({ Prefer: 'return=representation' }), body: JSON.stringify(d) }),
    rpc: (fn, args = {}) => chiama(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h(), body: JSON.stringify(args) }),
    async carica(bucket, percorso, dati, tipo) {
      await chiama(`${base}/storage/v1/object/${bucket}/${percorso}`, { method: 'POST', headers: { apikey: chiave, Authorization: `Bearer ${token}`, 'Content-Type': tipo, 'x-upsert': 'true' }, body: dati as BodyInit });
    },
    async scarica(bucket, percorso) {
      const r = await fetch(`${base}/storage/v1/object/${bucket}/${percorso}`, { headers: { apikey: chiave, Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Errore('File non trovato o non visibile', 404);
      return { dati: new Uint8Array(await r.arrayBuffer()), tipo: r.headers.get('content-type') ?? 'application/octet-stream' };
    },
  };
}

/** client con i permessi di chi chiama (RLS attiva): da usare per tutto ciò che l'utente può fare da sé */
export function dbUtente(req: Request): Db {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new Errore('Accesso richiesto', 401);
  return client(token, segreto('SUPABASE_ANON_KEY'));
}

/** client di servizio (salta RLS): solo dopo aver controllato chi chiama */
export function dbServizio(): Db {
  const k = segreto('SUPABASE_SERVICE_ROLE_KEY');
  return client(k, k);
}

export interface Profilo { id: string; azienda: 'trasporti' | 'corporation'; ruolo: string; nome: string; cliente_id: string | null }

/** chi chiama, dal suo token; controlla il ruolo (la direzione passa sempre) */
export async function chiChiama(req: Request, ruoli?: string[]): Promise<{ io: Profilo; db: Db }> {
  const db = dbUtente(req);
  const r = await fetch(`${URL_SB()}/auth/v1/user`, { headers: { apikey: segreto('SUPABASE_ANON_KEY'), Authorization: req.headers.get('authorization') ?? '' } });
  if (!r.ok) throw new Errore('Sessione scaduta: rientra', 401);
  const u = await r.json();
  const [io] = await db.get<Profilo>(`profili?select=id,azienda,ruolo,nome,cliente_id&id=eq.${u.id}&attivo=eq.true`);
  if (!io) throw new Errore('Profilo non attivo', 403);
  if (ruoli && io.ruolo !== 'direzione' && !ruoli.includes(io.ruolo)) throw new Errore('Questa operazione non è tra le tue', 403);
  return { io, db };
}

/** confronto in tempo costante (per chiavi e firme) */
export function uguali(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** le funzioni pianificate (cron) arrivano con l'header x-cron-segreto */
export function soloCron(req: Request) {
  const s = req.headers.get('x-cron-segreto') ?? '';
  if (!uguali(s, segreto('CRON_SEGRETO'))) throw new Errore('Solo per le operazioni pianificate', 403);
}

export const enc = (v: string) => encodeURIComponent(v);
export const base64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

// ------------------------------------------------------------------ Claude
/** chiede a Claude una risposta JSON con uno schema preciso (structured output via tool) */
export async function claudeJson<T>(istruzioni: string, contenuto: unknown[], schema: Record<string, unknown>, modello = Deno.env.get('CLAUDE_MODELLO') ?? 'claude-haiku-5-5'): Promise<T> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': segreto('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modello, max_tokens: 1500, system: istruzioni,
      tools: [{ name: 'risposta', description: 'Restituisce i dati estratti', input_schema: schema }],
      tool_choice: { type: 'tool', name: 'risposta' },
      messages: [{ role: 'user', content: contenuto }],
    }),
  });
  if (!r.ok) throw new Errore(`Claude non ha risposto (${r.status})`, 502);
  const j = await r.json();
  const uso = (j.content ?? []).find((c: any) => c.type === 'tool_use');
  if (!uso) throw new Errore('Claude non ha restituito i dati', 502);
  return uso.input as T;
}

export async function claudeTesto(istruzioni: string, testo: string, modello = Deno.env.get('CLAUDE_MODELLO') ?? 'claude-haiku-5-5'): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': segreto('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: modello, max_tokens: 600, system: istruzioni, messages: [{ role: 'user', content: testo }] }),
  });
  if (!r.ok) throw new Errore(`Claude non ha risposto (${r.status})`, 502);
  const j = await r.json();
  return (j.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim();
}

// ------------------------------------------------------------------ Microsoft Graph
let tokenGraph: { v: string; scade: number } | null = null;
export async function graph(percorso: string, init: RequestInit = {}): Promise<any> {
  if (!tokenGraph || tokenGraph.scade < Date.now() + 60000) {
    const r = await fetch(`https://login.microsoftonline.com/${segreto('MS_TENANT_ID')}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: segreto('MS_CLIENT_ID'), client_secret: segreto('MS_CLIENT_SECRET'), scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    if (!r.ok) throw new Errore('Accesso a Microsoft 365 non riuscito: controlla MS_TENANT_ID, MS_CLIENT_ID e MS_CLIENT_SECRET', 502);
    const j = await r.json();
    tokenGraph = { v: j.access_token, scade: Date.now() + j.expires_in * 1000 };
  }
  const r = await fetch(`https://graph.microsoft.com/v1.0${percorso}`, { ...init, headers: { Authorization: `Bearer ${tokenGraph.v}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Errore(`Microsoft 365 ha rifiutato la richiesta (${r.status})`, 502);
  return r.status === 202 || r.status === 204 ? null : r.json();
}

export const casella = (azienda: string) => segreto(azienda === 'corporation' ? 'MS_CASELLA_CORPORATION' : 'MS_CASELLA_TRASPORTI');
