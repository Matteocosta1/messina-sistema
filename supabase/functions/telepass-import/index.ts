// Pianificata (ogni 30 minuti): passaggi Telepass dei mezzi → tabella telepass.
// TODO Telepass Business: il formato dell'accesso (API o file giornaliero) si conosce solo dopo la richiesta
// al referente Telepass Business. `scaricaPassaggi` va scritta su quella documentazione.
import { servi, soloCron, dbServizio, segreto, Errore } from '../_comune/mod.ts';

interface Passaggio { apparato: string; quando: string; entrata: string | null; uscita: string | null; importo: number }

servi(async (req) => {
  soloCron(req);
  const db = dbServizio();
  const mezzi = await db.get('mezzi?select=id,telepass&telepass=not.is.null');
  const perApparato = new Map(mezzi.map((m: any) => [m.telepass, m.id]));
  const passaggi = await scaricaPassaggi();
  const righe = passaggi.filter((p) => perApparato.has(p.apparato)).map((p) => ({ mezzo_id: perApparato.get(p.apparato), quando: p.quando, entrata: p.entrata, uscita: p.uscita, importo: p.importo }));
  if (righe.length) await db.post('telepass?on_conflict=mezzo_id,quando', righe, 'resolution=ignore-duplicates,return=minimal');
  return { letti: passaggi.length, salvati: righe.length, senza_mezzo: passaggi.length - righe.length };
});

async function scaricaPassaggi(): Promise<Passaggio[]> {
  segreto('TELEPASS_UTENTE'); segreto('TELEPASS_CHIAVE');
  throw new Errore('Collegamento Telepass Business non ancora attivo: serve la documentazione dal referente Telepass', 501);
}
