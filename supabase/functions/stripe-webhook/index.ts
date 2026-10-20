// Stripe avvisa che un pagamento è riuscito → nasce l'ordine (canale «Sito») e le vendite.
// Firma verificata (HMAC-SHA256, tolleranza 5 minuti). Idempotente: stripe_session è unico.
// Deploy con --no-verify-jwt (Stripe non ha un token Supabase).
import { servi, dbServizio, segreto, uguali, Errore, enc } from '../_comune/mod.ts';

async function firmaValida(grezzo: string, header: string) {
  const parti = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p[0] !== 'v1'));
  const v1 = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parti.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(segreto('STRIPE_WEBHOOK_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${t}.${grezzo}`)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
  return v1.some((x) => uguali(x, hex));
}

servi(async (req, c) => {
  if (!(await firmaValida(c._grezzo ?? '', req.headers.get('stripe-signature') ?? ''))) throw new Errore('Firma Stripe non valida', 400);
  if (c.type !== 'checkout.session.completed') return { ignorato: c.type };
  const s = c.data?.object;
  if (s?.payment_status !== 'paid') return { ignorato: 'non pagato' };
  const db = dbServizio();
  if ((await db.get(`ordini?select=id&stripe_session=eq.${enc(s.id)}`)).length) return { gia: true };

  const righe: [string, string, string, number][] = JSON.parse(s.metadata?.righe ?? '[]');
  const sped = s.collected_information?.shipping_details ?? s.shipping_details ?? {};
  const a = sped.address ?? {};
  const [ordine] = await db.post('ordini?on_conflict=stripe_session', [{ canale: 'Sito', riferimento: s.id.slice(-10), stripe_session: s.id, email: s.customer_details?.email ?? s.customer_email,
    cliente: sped.name ?? s.customer_details?.name, indirizzo: [a.line1, a.line2, `${a.postal_code ?? ''} ${a.city ?? ''}`.trim(), a.state].filter(Boolean).join(', '),
    totale: (s.amount_total ?? 0) / 100, stato: 'Da preparare', entro: new Date(Date.now() + 86400000).toISOString() }], 'resolution=ignore-duplicates,return=representation');
  if (!ordine) return { gia: true };

  const presi: string[] = [];
  for (const [modello, grado, ram, q] of righe) {
    const dev = await db.get(`device?select=id,prezzo&stato=eq.Disponibile&siti=cs.{Sito}&modello=eq.${enc(modello)}&grado=eq.${enc(grado)}${ram ? `&ram=eq.${enc(ram)}` : ''}&order=prezzo.asc,caricato_il.asc&limit=${q}`);
    for (const d of dev) {
      try { await db.post('vendite', [{ device_id: d.id, canale: 'Sito', prezzo: d.prezzo, commissione: 0, ordine_id: ordine.id }]); presi.push(d.id); }
      catch (e) { console.error('device già venduto', d.id, (e as Error).message); }
    }
    if (dev.length < q) console.error(`Ordine ${ordine.id}: mancano ${q - dev.length} pezzi di ${modello} ${grado}`);
  }
  if (presi[0]) await db.patch(`ordini?id=eq.${ordine.id}`, { device_id: presi[0] });
  return { ordine: ordine.id, device: presi.length };
});
