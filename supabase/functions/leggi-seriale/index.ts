// App Corporation, Entrate: dalla foto dell'etichetta Claude legge seriale e scheda del computer.
import { servi, chiChiama, claudeJson, Errore, base64 } from '../_comune/mod.ts';

servi(async (req, c) => {
  const { io, db } = await chiChiama(req, ['magazzino', 'vendite', 'stage']);
  if (io.azienda !== 'corporation') throw new Errore('Solo Messina Corporation', 403);
  const percorso = String(c.percorso ?? '');
  if (!percorso || percorso.includes('..')) throw new Errore('Foto mancante');
  const f = await db.scarica('device', percorso);   // con i permessi di chi chiama
  if (!/^image\/(jpeg|png|webp|gif)$/.test(f.tipo)) throw new Errore('Serve una foto (JPG o PNG)');
  if (f.dati.length > 5_000_000) throw new Errore('Foto troppo grande: massimo 5 MB');
  return await claudeJson(
    'Leggi l’etichetta o la schermata di sistema di un computer o telefono usato. Restituisci solo quello che si legge davvero; il resto null. Il seriale va copiato carattere per carattere.',
    [{ type: 'image', source: { type: 'base64', media_type: f.tipo, data: base64(f.dati) } }, { type: 'text', text: 'Estrai seriale e scheda tecnica.' }],
    { type: 'object', required: ['seriale', 'marca', 'modello', 'cpu', 'gpu', 'ram', 'disco', 'schermo'], properties: Object.fromEntries(
      ['seriale', 'marca', 'modello', 'cpu', 'gpu', 'ram', 'disco', 'schermo'].map((k) => [k, { type: ['string', 'null'] }])) },
    Deno.env.get('CLAUDE_MODELLO_VISIONE') ?? 'claude-haiku-5-5');
});
