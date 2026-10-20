// Copia in config.js. Solo valori pubblici: la chiave è la publishable, mai quella segreta.
// Senza config.js il modulo non invia (in anteprima dentro il pannello di prova passa la richiesta alla Mail di prova).
window.MESSINA = {
  supabaseUrl: 'https://XXXX.supabase.co', supabaseKey: 'sb_publishable_...',
  negozioUrl: 'https://negozio.[dominio]', portaleUrl: 'https://clienti.[dominio]',
  trasportiUrl: 'https://[dominio-trasporti]', corporationUrl: 'https://[dominio-corporation]',
};
