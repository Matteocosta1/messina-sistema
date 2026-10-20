// Ordini Corporation: etichetta del corriere per l'ordine.
// TODO contratto corriere: quando sapremo quale corriere (BRT, GLS, SDA, Poste…) si sostituisce `richiediEtichetta`
// con la sua API. Fino ad allora la funzione risponde con un errore chiaro e non salva niente.
import { servi, chiChiama, dbServizio, segreto, Errore, enc } from '../_comune/mod.ts';

servi(async (req, c) => {
  const { io, db } = await chiChiama(req, ['vendite', 'magazzino']);
  if (io.azienda !== 'corporation') throw new Errore('Solo Messina Corporation', 403);
  const [o] = await db.get(`ordini?select=id,riferimento,cliente,indirizzo,email,etichetta,stato&id=eq.${enc(c.ordine_id)}`);
  if (!o) throw new Errore('Ordine non trovato', 404);
  if (o.etichetta) return { etichetta: o.etichetta };
  if (!o.indirizzo) throw new Errore('Manca l’indirizzo di spedizione');
  const pdf = await richiediEtichetta(o);
  const percorso = `etichette/${o.id}.pdf`;
  await dbServizio().carica('documenti', percorso, pdf, 'application/pdf');
  await dbServizio().patch(`ordini?id=eq.${o.id}`, { etichetta: percorso, stato: o.stato === 'Da preparare' ? 'Pronto' : o.stato });
  return { etichetta: percorso };
});

async function richiediEtichetta(o: { riferimento: string; cliente: string; indirizzo: string }): Promise<Uint8Array> {
  const nome = segreto('CORRIERE_NOME'); segreto('CORRIERE_API_KEY');
  throw new Errore(`Collegamento con ${nome} non ancora attivo: serve il contratto e la documentazione API del corriere (ordine ${o.riferimento ?? ''})`, 501);
}
