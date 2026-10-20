// Copia in config.js. Solo valori pubblici: la chiave è la publishable, mai quella segreta.
// Senza config.js il sito si vede lo stesso, ma i moduli non inviano.
window.MESSINA = {
  supabaseUrl: 'https://XXXX.supabase.co', supabaseKey: 'sb_publishable_...',
  negozioUrl: 'https://negozio.[dominio]', portaleUrl: 'https://portale.[dominio]',
  trasportiUrl: 'https://www.[dominio-trasporti]', corporationUrl: 'https://www.[dominio-corporation]',
};
