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

servi(async (req, corpo) => {
  // si verifica la firma sul testo ricevuto e si usa SOLO quel testo, riletto qui
  const grezzo: string = corpo._grezzo ?? '';
  if (!(await firmaValida(grezzo, req.headers.get('stripe-signature') ?? ''))) throw new Errore('Firma Stripe non valida', 400);
  const c = JSON.parse(grezzo);
  if (c.type !== 'checkout.session.completed') return { ignorato: c.type };
  const s = c.data?.object;
  if (s?.payment_status !== 'paid') return { ignorato: 'non pagato' };
  const db = dbServizio();
  // righe: [modello, grado, ram, quantità, prezzo pagato per pezzo]
  const righe: [string, string, string, number, number?][] = JSON.parse(s.metadata?.righe ?? '[]');
  const sped = s.collected_information?.shipping_details ?? s.shipping_details ?? {};
  const a = sped.address ?? {};
  // l'ordine nasce una volta sola (stripe_session unico); se Stripe ripete l'avviso si completa quello che manca
  await db.post('ordini?on_conflict=stripe_session', [{ canale: 'Sito', riferimento: s.id.slice(-10), stripe_session: s.id, email: s.customer_details?.email ?? s.customer_email,
    cliente: sped.name ?? s.customer_details?.name, indirizzo: [a.line1, a.line2, `${a.postal_code ?? ''} ${a.city ?? ''}`.trim(), a.state].filter(Boolean).join(', '),
    totale: (s.amount_total ?? 0) / 100, stato: 'Da preparare', entro: new Date(Date.now() + 86400000).toISOString() }], 'resolution=ignore-duplicates,return=minimal');
  const [ordine] = await db.get(`ordini?select=id,device_id&stripe_session=eq.${enc(s.id)}`);
  if (!ordine) throw new Errore('Ordine non registrato', 500);
  const gia: any[] = await db.get(`vendite?select=device_id,device(modello,grado,ram)&ordine_id=eq.${ordine.id}`);

  const presi: string[] = gia.map((v) => v.device_id); const mancano: string[] = [];
  for (const [modello, grado, ram, q, prezzo] of righe) {
    const fatti = gia.filter((v) => v.device?.modello === modello && v.device?.grado === grado && (!ram || v.device?.ram === ram)).length;
    let serve = q - fatti; if (serve <= 0) continue;
    // stesse regole del catalogo: solo pezzi disponibili, sul sito e con il prezzo confermato da Vendite
    const dev = await db.get(`device?select=id,prezzo&stato=eq.Disponibile&siti=cs.{Sito}&prezzo_confermato_da=not.is.null&modello=eq.${enc(modello)}&grado=eq.${enc(grado)}${ram ? `&ram=eq.${enc(ram)}` : ''}&order=prezzo.asc,caricato_il.asc&limit=${serve + 5}`);
    for (const d of dev) {
      if (serve <= 0) break;
      try { await db.post('vendite', [{ device_id: d.id, canale: 'Sito', prezzo: prezzo ?? d.prezzo, commissione: 0, ordine_id: ordine.id }]); presi.push(d.id); serve--; }
      catch (e) { console.error('device già venduto', d.id, (e as Error).message); }
    }
    if (serve > 0) mancano.push(`${serve} × ${modello} grado ${grado}${ram ? ' ' + ram : ''}`);
  }
  await db.patch(`ordini?id=eq.${ordine.id}`, { ...(presi[0] && !ordine.device_id ? { device_id: presi[0] } : {}),
    problema: mancano.length ? `Pagato ma non disponibile: ${mancano.join(', ')}. Da rimborsare o sostituire.` : null });
  return { ordine: ordine.id, device: presi.length };
});
