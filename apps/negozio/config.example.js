// Copia in config.js e metti i dati del progetto Supabase di Messina.
// Solo la chiave PUBBLICA (publishable): il negozio legge il catalogo pubblico e apre il pagamento Stripe.
// La chiave segreta di Stripe NON va qui: sta nei segreti delle Edge Functions su Supabase.
// Senza config.js il negozio parte in modalità Prova con dati di esempio.
window.MESSINA = { supabaseUrl: 'https://XXXX.supabase.co', supabaseKey: 'sb_publishable_...' };
