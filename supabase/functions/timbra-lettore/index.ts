// Lettore QR all'ingresso: manda il codice letto dal telefono del dipendente.
// Il lettore si identifica con la sua chiave (header x-lettore-chiave); la timbratura la decide il database (timbra).
import { servi, dbServizio, segreto, uguali, Errore } from '../_comune/mod.ts';

servi(async (req, c) => {
  if (!uguali(req.headers.get('x-lettore-chiave') ?? '', segreto('LETTORE_CHIAVE'))) throw new Errore('Lettore non autorizzato', 401);
  const codice = String(c.codice ?? '').trim(), lettore = String(c.lettore ?? 'Ingresso').slice(0, 60);
  if (!codice || codice.length > 300) throw new Errore('Codice non valido');
  return await dbServizio().rpc('timbra', { p_codice: codice, p_lettore: lettore });
});
