// Collegamento vero al database Supabase, via le sue API REST (PostgREST e Auth).
// Niente librerie esterne: login con email e password, token che si rinnova
// da solo, letture con i permessi (RLS) dell'utente collegato.
import type {
  Api, Utente, Anomalia, Bolla, Bancale, Cliente, Contenuto, ControlloRiga, Device, Fattura,
  IncassiCorporation, IncassiTrasporti, LottoConti, Posto, PostoMissione, Storico, Tariffa, Telefono,
} from './types';

interface Sessione { access_token: string; refresh_token: string; expires_at: number; user: { id: string } }
const CHIAVE = 'messina.sessione';

export function creaApiSupabase(url: string, chiavePubblica: string): Api {
  let sessione: Sessione | null = leggi();

  function leggi(): Sessione | null {
    try { const s = sessionStorage.getItem(CHIAVE); return s ? JSON.parse(s) : null; } catch { return null; }
  }
  function salva(s: Sessione | null) {
    sessione = s;
    try { s ? sessionStorage.setItem(CHIAVE, JSON.stringify(s)) : sessionStorage.removeItem(CHIAVE); } catch { /* niente */ }
  }

  async function auth(percorso: string, corpo: unknown): Promise<Sessione> {
    const r = await fetch(`${url}/auth/v1/${percorso}`, {
      method: 'POST', headers: { apikey: chiavePubblica, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.msg || 'Accesso non riuscito');
    return { ...j, expires_at: Math.floor(Date.now() / 1000) + j.expires_in };
  }

  async function token(): Promise<string> {
    if (!sessione) throw new Error('Non collegato');
    if (sessione.expires_at - 60 < Date.now() / 1000) {
      salva(await auth('token?grant_type=refresh_token', { refresh_token: sessione.refresh_token }));
    }
    return sessione!.access_token;
  }

  async function rest<T>(percorso: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
    const r = await fetch(`${url}/rest/v1/${percorso}`, {
      ...init,
      headers: {
        apikey: chiavePubblica, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json',
        ...(init.prefer ? { Prefer: init.prefer } : {}),
      },
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || `Errore ${r.status}`);
    }
    return r.status === 204 ? (undefined as T) : r.json();
  }
  const get = <T>(p: string) => rest<T>(p);
  const rpc = <T>(fn: string, args: object) => rest<T>(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  const patch = (tab: string, filtro: string, dati: object) =>
    rest<void>(`${tab}?${filtro}`, { method: 'PATCH', body: JSON.stringify(dati), prefer: 'return=minimal' });

  const api: Api = {
    modo: 'supabase',
    async login(email, password) {
      salva(await auth('token?grant_type=password', { email, password }));
      const u = await api.utente();
      if (!u) { salva(null); throw new Error('Utente senza profilo: chiedi alla direzione di attivarlo'); }
      return u;
    },
    async logout() {
      try { await fetch(`${url}/auth/v1/logout`, { method: 'POST', headers: { apikey: chiavePubblica, Authorization: `Bearer ${await token()}` } }); }
      finally { salva(null); }
    },
    async utente() {
      if (!sessione) return null;
      const r = await get<Utente[]>(`profili?id=eq.${sessione.user.id}&select=id,nome,ruolo,azienda,cliente_id`);
      return r[0] ?? null;
    },

    anomalie: () => get<Anomalia[]>('anomalie?select=*&order=da.desc.nullslast'),
    incassiTrasporti: async () => (await get<IncassiTrasporti[]>('incassi_trasporti?select=*'))[0],
    async bolle() {
      const r = await get<(Omit<Bolla, 'cliente' | 'operatore'> & { clienti: { nome: string }; profili: { nome: string } | null })[]>(
        'bolle?select=*,clienti(nome),profili!bolle_operatore_id_fkey(nome)&order=creata_il.desc&limit=500');
      return r.map((b) => ({ ...b, cliente: b.clienti.nome, operatore: b.profili?.nome ?? null }));
    },
    async completaBolla(id, campo, valore) {
      const [b] = await get<{ dati_mancanti: string[]; note: string | null }[]>(`bolle?id=eq.${id}&select=dati_mancanti,note`);
      const colonna: Record<string, string> = { 'Indirizzo': 'indirizzo', 'Fascia oraria': 'fascia', 'Data': 'data_consegna' };
      const dati: Record<string, unknown> = {
        dati_mancanti: b.dati_mancanti.filter((d) => d.toLowerCase() !== campo.toLowerCase()),
        note: [b.note, `${campo}: ${valore}`].filter(Boolean).join('\n'),
      };
      if (colonna[campo]) dati[colonna[campo]] = valore;
      await patch('bolle', `id=eq.${id}`, dati);
    },
    confermaBolla: (id) => patch('bolle', `id=eq.${id}`, { stato: 'Confermata' }),
    controllo: () => get<ControlloRiga[]>('controllo_colli?select=*'),
    posti: () => get<Posto[]>('posti?select=id,codice,scaffale,piano,numero,zona&attivo=eq.true&order=codice'),
    async bancali() {
      const r = await get<{ id: string; codice: string; clienti: { nome: string }; posti: { codice: string } | null }[]>(
        'bancali?select=id,codice,clienti(nome),posti(codice)&uscito_il=is.null');
      return r.map((b) => ({ id: b.id, codice: b.codice, cliente: b.clienti.nome, posto: b.posti?.codice ?? null }));
    },
    contenuto: (id) => get<Contenuto[]>(`contenuto?bancale_id=eq.${id}&select=*&order=il.desc`),
    async missione() {
      const m = await get<{ id: string }[]>('missioni?stato=eq.Aperta&select=id&order=creata_il.desc&limit=1');
      if (!m.length) return [];
      const r = await get<(Omit<PostoMissione, 'posto'> & { posti: { codice: string } })[]>(
        `missioni_posti?missione_id=eq.${m[0].id}&select=*,posti(codice)`);
      return r.map((x) => ({ ...x, posto: x.posti.codice })).sort((a, b) => a.posto.localeCompare(b.posto));
    },
    lanciaMissione: async (ambito, filtro) => { await rpc('lancia_missione', { p_ambito: ambito, p_filtro: filtro }); },
    sbloccaPosto: async (id, motivo) => { await rpc('sblocca_posto', { p_posto: id, p_motivo: motivo }); },
    storico: () => get<Storico[]>('storico?select=id,quando,chi_nome,operazione,cosa,dove,come&order=quando.desc&limit=300'),
    clienti: () => get<Cliente[]>('clienti?select=id,nome,portale_live,tramite,azienda_collegata&attivo=eq.true&order=nome'),
    tariffe: (id) => get<Tariffa[]>(`tariffe?cliente_id=eq.${id}&select=*&order=voce`),
    async fatture() {
      const r = await get<(Omit<Fattura, 'cliente'> & { clienti: { nome: string } })[]>('fatture?select=*,clienti(nome)&order=creata_il.desc');
      return r.map((f) => ({ ...f, cliente: f.clienti.nome }));
    },
    async inviaPronte() {
      const r = await rest<unknown[]>('fatture?stato=eq.Pronta', { method: 'PATCH', body: JSON.stringify({ stato: 'Inviata' }), prefer: 'return=representation' });
      return r.length;
    },
    segnaPagata: (id) => patch('fatture', `id=eq.${id}`, { stato: 'Pagata' }),

    incassiCorporation: async () => (await get<IncassiCorporation[]>('incassi_corporation?select=*'))[0],
    async device() {
      const r = await get<(Omit<Device, 'lotto' | 'bancale' | 'posto' | 'giorni'> & { caricato_il: string; lotti: { codice: string } | null; bancali: { codice: string; posti: { codice: string } | null } | null })[]>(
        'device?select=*,lotti(codice),bancali(codice,posti(codice))&order=caricato_il.desc&limit=1000');
      return r.map((d) => ({ ...d, lotto: d.lotti?.codice ?? null, bancale: d.bancali?.codice ?? null, posto: d.bancali?.posti?.codice ?? null,
        giorni: Math.floor((Date.now() - new Date(d.caricato_il).getTime()) / 86400000) }));
    },
    lotti: () => get<LottoConti[]>('lotti_conti?select=*&order=acquistato_il.desc'),
    async telefoni() {
      const r = await get<(Omit<Telefono, 'cliente' | 'operatore'> & { clienti: { nome: string } | null; profili: { nome: string } | null })[]>(
        'stage_telefoni?select=*,clienti(nome),profili(nome)&order=ricevuto_il.desc');
      return r.map((t) => ({ ...t, cliente: t.clienti?.nome ?? null, operatore: t.profili?.nome ?? null }));
    },
  };
  return api;
}
