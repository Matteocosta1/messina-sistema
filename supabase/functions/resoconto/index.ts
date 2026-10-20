// Pianificata alle 7:00 (ora di Roma): il «Resoconto del mattino» della Home, scritto da Claude sui numeri di ieri.
import { servi, soloCron, dbServizio, claudeTesto } from '../_comune/mod.ts';

servi(async (req, c) => {
  soloCron(req);
  const ora = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hour12: false }));
  if (ora !== 7 && !c.forza) return { saltato: `a Roma sono le ${ora}` };
  const db = dbServizio();
  const ieri = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const fine = `${oggi}T00:00:00`, inizio = `${ieri}T00:00:00`;

  const bolle = await db.get(`bolle?select=stato,tipo&data_consegna=eq.${ieri}`);
  const fermate = await db.get(`fermate?select=esito,motivo&chiusa_il=gte.${inizio}&chiusa_il=lt.${fine}`);
  const giacenze = await db.get(`giacenze?select=id&dal=eq.${ieri}`);
  const anomalie = await db.get('anomalie?select=sezione');
  const trasporti = {
    spedizioni: bolle.length, consegnate: fermate.filter((f: any) => f.esito === 'Consegnata').length,
    non_consegnate: fermate.filter((f: any) => f.esito === 'Non consegnata').length, nuove_giacenze: giacenze.length,
    anomalie_aperte: anomalie.length,
  };
  const vendite = await db.get(`vendite?select=canale,prezzo,incassato&venduto_il=gte.${inizio}&venduto_il=lt.${fine}`);
  const fermi = await db.get(`device?select=id&stato=eq.Fermo`);
  const corporation = { venduti: vendite.length, incassato: vendite.reduce((s: number, v: any) => s + Number(v.incassato), 0),
    per_canale: vendite.reduce((m: Record<string, number>, v: any) => ({ ...m, [v.canale]: (m[v.canale] ?? 0) + 1 }), {}), fermi: fermi.length };

  const regole = 'Scrivi 2 o 3 frasi semplici in italiano per la Direzione, senza elenchi e senza titoli. Solo fatti che si vedono dai numeri; se qualcosa merita attenzione dillo con calma. Non inventare cause.';
  const out: Record<string, string> = {};
  for (const [azienda, numeri] of [['trasporti', trasporti], ['corporation', corporation]] as const) {
    const testo = await claudeTesto(regole, `Numeri di ieri (${ieri}) di Messina ${azienda === 'trasporti' ? 'Autotrasporti' : 'Corporation'}:\n${JSON.stringify(numeri)}`);
    await db.post('resoconti?on_conflict=azienda,giorno', [{ azienda, giorno: oggi, testo }], 'resolution=merge-duplicates,return=minimal');
    out[azienda] = testo;
  }
  return out;
});
