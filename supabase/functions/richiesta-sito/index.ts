// Moduli dei siti pubblici: preventivo, ritiro, candidatura e contatto (Autotrasporti); lotto e contatto (Corporation).
// Nessun accesso richiesto: per questo la funzione controlla tutto da sé (campo esca, lunghezze, limiti per ora)
// e scrive solo una riga in «mail», nella cartella giusta per il tipo di modulo, che compare nella Mail del gestionale come «Da leggere».
import { dbServizio, Errore } from '../_comune/mod.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const risposta = (dati: unknown, stato = 200) => new Response(JSON.stringify(dati), { status: stato, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

// sito → tipo di modulo → dove arriva nella Mail del gestionale
const SITI = {
  trasporti: {
    azienda: 'trasporti',
    tipi: {
      preventivo: { cartella: 'Clienti', etichetta: 'Preventivo', oggetto: 'Richiesta di preventivo dal sito' },
      ritiro: { cartella: 'Ordini', etichetta: 'Ordine', oggetto: 'Richiesta di ritiro dal sito' },
      candidatura: { cartella: 'In arrivo', etichetta: 'Personale', oggetto: 'Candidatura dal sito' },
      contatto: { cartella: 'In arrivo', etichetta: 'Sito', oggetto: 'Messaggio dal sito' },
    },
  },
  corporation: {
    azienda: 'corporation',
    tipi: {
      lotto: { cartella: 'Lotti', etichetta: 'Lotti', oggetto: 'Lotto da valutare dal sito' },
      contatto: { cartella: 'In arrivo', etichetta: 'Sito', oggetto: 'Messaggio dal sito' },
    },
  },
} as const;

const testo = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const EMAIL = /^[^\s@<>()",;]{1,64}@[^\s@<>()",;]{1,190}\.[a-z]{2,24}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return risposta({ errore: 'Usa POST' }, 405);
  try {
    const grezzo = await req.text();
    if (grezzo.length > 12000) throw new Errore('Messaggio troppo lungo');
    let c: any = {};
    try { c = JSON.parse(grezzo); } catch { throw new Errore('Richiesta non valida'); }
    const s0 = SITI[c?.sito as keyof typeof SITI];
    if (!s0) throw new Errore('Sito sconosciuto');
    const tipi = s0.tipi as Record<string, { cartella: string; etichetta: string; oggetto: string }>;
    const t = tipi[typeof c.tipo === 'string' ? c.tipo : ''] ?? Object.values(tipi)[0];   // vecchie versioni del sito: primo tipo
    const sito = { azienda: s0.azienda, ...t };
    if (testo(c.sito_web, 200)) return risposta({ ok: true });          // campo esca compilato: è un programma, si risponde ok e non si salva nulla

    const nome = testo(c.nome, 80), azienda = testo(c.azienda, 120), email = testo(c.email, 200).toLowerCase(), telefono = testo(c.telefono, 40);
    if (!nome) throw new Errore('Scrivi il tuo nome');
    if (!EMAIL.test(email)) throw new Errore('Controlla l\'indirizzo email');
    if (c.privacy !== true) throw new Errore('Serve la presa visione dell\'informativa privacy');

    const campi: [string, string][] = [];
    const dettagli = c.dettagli && typeof c.dettagli === 'object' && !Array.isArray(c.dettagli) ? c.dettagli : {};
    for (const [k, v] of Object.entries(dettagli).slice(0, 12)) {
      const val = Array.isArray(v) ? v.slice(0, 10).map((x) => testo(x, 60)).filter(Boolean).join(', ') : testo(v, 300);
      if (val) campi.push([testo(k, 40), val]);
    }
    const note = testo(c.note, 3000);

    const db = dbServizio();
    const unOraFa = new Date(Date.now() - 3600_000).toISOString();
    const stesse = await db.get(`mail?select=id&casella=eq.sito&da_indirizzo=eq.${encodeURIComponent(email)}&ricevuta_il=gte.${unOraFa}&limit=3`);
    if (stesse.length >= 3) throw new Errore('Abbiamo già ricevuto le tue richieste: ti rispondiamo appena possibile', 429);
    const tutte = await db.get(`mail?select=id&casella=eq.sito&azienda=eq.${sito.azienda}&ricevuta_il=gte.${unOraFa}&limit=60`);
    if (tutte.length >= 60) throw new Errore('Troppe richieste in questo momento: riprova tra poco o scrivici una mail', 429);

    const righe = [
      `Nome: ${nome}`, azienda && `Azienda: ${azienda}`, `Email: ${email}`, telefono && `Telefono: ${telefono}`,
      ...campi.map(([k, v]) => `${k}: ${v}`), note && `\n${note}`,
    ].filter(Boolean).join('\n');
    await db.post('mail', {
      azienda: sito.azienda, casella: 'sito', cartella: sito.cartella, etichetta: sito.etichetta, stato: 'Da leggere',
      da_nome: azienda ? `${nome} (${azienda})` : nome, da_indirizzo: email,
      oggetto: sito.oggetto, testo: righe, anteprima: (note || campi.map(([k, v]) => `${k}: ${v}`).join(', ')).slice(0, 160),
    }, 'return=minimal');
    return risposta({ ok: true });
  } catch (e) {
    const err = e instanceof Errore ? e : new Errore('Non siamo riusciti a inviare la richiesta: riprova o scrivici una mail', 500);
    if (!(e instanceof Errore)) console.error((e as Error)?.message ?? e);
    return risposta({ errore: err.message }, err.stato);
  }
});
