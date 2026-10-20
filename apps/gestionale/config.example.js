// Copia questo file in config.js e incolla i dati PUBBLICI del progetto Supabase di Messina
// (Supabase → Project Settings → API). Non mettere mai qui chiavi segrete (service_role, sb_secret…):
// questo file lo scarica chiunque apra il sito. I permessi veri li fa il database (RLS).
// Senza config.js il gestionale parte in modalità Prova con dati di esempio.
window.MESSINA = {
  supabaseUrl: 'https://XXXX.supabase.co',      // Project URL
  supabaseKey: 'sb_publishable_...',            // Publishable key
  appUrl: 'https://app.[dominio]',              // facoltativo: indirizzo dell'app Messina (tasto «Apri l'app magazzino»)
};
