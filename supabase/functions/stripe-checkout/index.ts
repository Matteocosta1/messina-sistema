// Negozio online: crea il pagamento Stripe. I prezzi li rilegge qui dal catalogo, mai dal browser.
// Non blocca nessun computer finché il pagamento non è riuscito (lo fa stripe-webhook).
import { servi, dbServizio, segreto, Errore } from '../_comune/mod.ts';

interface Riga { modello: string; grado: string; ram?: string; quantita?: number }

servi(async (_req, c) => {
  const righe: Riga[] = Array.isArray(c.righe) ? c.righe : [];
  const email = String(c.email ?? '').trim();
  if (!righe.length || righe.length > 20) throw new Errore('Carrello vuoto o troppo grande');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Errore('Email non valida');
  const catalogo: any[] = await dbServizio().rpc('catalogo');
  const form = new URLSearchParams({ mode: 'payment', locale: 'it', 'shipping_address_collection[allowed_countries][0]': 'IT',
    success_url: `${segreto('SITO_URL')}/#/grazie?s={CHECKOUT_SESSION_ID}`, cancel_url: `${segreto('SITO_URL')}/#/annullato` });
  if (email) form.set('customer_email', email);
  const meta: [string, string, string, number, number][] = [];
  const chiesti: Record<string, number> = {};   // stessa voce ripetuta su più righe: si somma
  righe.forEach((r, i) => {
    const q = Math.max(1, Math.min(10, Math.floor(Number(r.quantita ?? 1))));
    const voci = catalogo.filter((x) => x.modello === r.modello && x.grado === r.grado && (!r.ram || x.ram === r.ram));
    const disponibili = voci.reduce((s, x) => s + Number(x.disponibili), 0);
    const k = `${r.modello}|${r.grado}|${r.ram ?? ''}`; chiesti[k] = (chiesti[k] ?? 0) + q;
    if (!voci.length || disponibili < chiesti[k]) throw new Errore(`${r.modello} grado ${r.grado}${r.ram ? ' ' + r.ram : ''}: non più disponibile in questa quantità`);
    const prezzo = Math.min(...voci.map((x) => Number(x.prezzo)));
    form.set(`line_items[${i}][quantity]`, String(q));
    form.set(`line_items[${i}][price_data][currency]`, 'eur');
    form.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(prezzo * 100)));
    form.set(`line_items[${i}][price_data][product_data][name]`, `${voci[0].marca ?? ''} ${r.modello} · grado ${r.grado}${r.ram ? ' · ' + r.ram : ''}`.trim());
    meta.push([r.modello, r.grado, r.ram ?? '', q, prezzo]);
  });
  const m = JSON.stringify(meta);
  if (m.length > 500) throw new Errore('Troppi articoli diversi in un solo ordine');
  form.set('metadata[righe]', m);
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST',
    headers: { Authorization: `Bearer ${segreto('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const j = await r.json();
  if (!r.ok) throw new Errore(`Pagamento non disponibile: ${j?.error?.message ?? r.status}`, 502);
  return { url: j.url };
});
