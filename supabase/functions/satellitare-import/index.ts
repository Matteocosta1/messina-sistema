// Pianificata (ogni 15 minuti): posizioni del satellitare già montato sui mezzi → sat_posizioni,
// poi per ogni mezzo di oggi: km fatti, percorso per la mappa e anomalie rispetto al giro (sat_giornate, sat_anomalie).
// TODO fornitore: il nome si saprà dall'azienda. `scaricaPosizioni` va scritta sulla sua documentazione
// (Webfleet, Verizon Connect e simili hanno un'API a pagamento o inclusa nel contratto: va chiesta al fornitore).
// Le regole del confronto sono qui sotto e non dipendono dal fornitore.
import { servi, soloCron, dbServizio, segreto, Errore, oggiRoma, mezzanotteRoma, permessoControllo } from '../_comune/mod.ts';

interface Posizione { codice: string; quando: string; lat: number; lng: number; velocita: number | null; motore: boolean | null }

const BASE: [number, number] = [45.2905, 9.1384];        // Lacchiarella, via Cascina Nuova 1 (da verificare)
const DEVIAZIONE_KM = 3;      // più lontano di così da ogni tratto del giro = deviazione
const PARALLELA_KM = 0.6;     // entro questa distanza è una strada parallela: non conta
const SOSTA_MIN = 15;         // fermo più di così lontano dalle fermate = sosta
const FERMATA_KM = 0.4;       // vicino a una fermata o alla base: sosta normale
const MOTORE_MIN = 10;        // motore acceso da fermo più di così

servi(async (req) => {
  soloCron(req);
  const db = dbServizio();
  if (!(await permessoControllo(db, 'satellitare'))) return { ok: false, motivo: 'Manca l\'accordo sindacale o l\'autorizzazione dell\'Ispettorato: la Direzione lo scrive in Impostazioni' };
  const oggi = oggiRoma(), dalle = mezzanotteRoma(oggi);
  const mezzi = await db.get('mezzi?select=id,targa,satellitare,autista_id&satellitare=not.is.null');
  const perCodice = new Map(mezzi.map((m: any) => [m.satellitare, m]));
  const pos = await scaricaPosizioni();
  const righe = pos.filter((p) => perCodice.has(p.codice)).map((p) => ({ mezzo_id: (perCodice.get(p.codice) as any).id, quando: p.quando, lat: p.lat, lng: p.lng, velocita: p.velocita, motore: p.motore }));
  if (righe.length) await db.post('sat_posizioni?on_conflict=mezzo_id,quando', righe, 'resolution=ignore-duplicates,return=minimal');

  let anomalie = 0;
  for (const m of mezzi as any[]) {
    const punti = await db.get<any>(`sat_posizioni?select=quando,lat,lng,velocita,motore&mezzo_id=eq.${m.id}&quando=gte.${encodeURIComponent(dalle)}&order=quando`);
    if (!punti.length) continue;
    const [giro] = await db.get<any>(`giri?select=id,autista_id,fermate(ordine,lat,lng)&mezzo_id=eq.${m.id}&data=eq.${oggi}`);
    const fermate: [number, number][] = (giro?.fermate ?? []).filter((f: any) => f.lat != null).sort((a: any, b: any) => a.ordine - b.ordine).map((f: any) => [f.lat, f.lng]);
    const previsto: [number, number][] = [BASE, ...fermate, BASE];
    const autista = giro?.autista_id ?? m.autista_id ?? null;
    let km = 0; for (let i = 1; i < punti.length; i++) km += dist([punti[i - 1].lat, punti[i - 1].lng], [punti[i].lat, punti[i].lng]);
    let kmPrev = 0; for (let i = 1; i < previsto.length; i++) kmPrev += dist(previsto[i - 1], previsto[i]);
    const passo = Math.max(1, Math.ceil(punti.length / 300));
    await db.post('sat_giornate?on_conflict=data,mezzo_id', [{ data: oggi, mezzo_id: m.id, autista_id: autista, giro_id: giro?.id ?? null,
      km_previsti: fermate.length ? Math.round(kmPrev * 1.25) : null, km_fatti: Math.round(km),   // 1,25: le strade non sono in linea d'aria
      percorso: punti.filter((_, i) => i % passo === 0).map((p: any) => [p.lat, p.lng]), previsto, aggiornata_il: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal');

    const nuove: any[] = [];
    const add = (tipo: string, da: any, a: any, dettaglio: string, grave = true) => nuove.push({ chiave: `${m.id}|${tipo}|${da.quando}`, data: oggi, mezzo_id: m.id, autista_id: autista,
      tipo, dalle: da.quando, alle: a.quando, lat: da.lat, lng: da.lng, dettaglio, grave });
    const vicinoFermata = (p: any) => [BASE, ...fermate].some((f) => dist(f, [p.lat, p.lng]) <= FERMATA_KM);
    // soste e motore acceso da fermo
    for (let i = 0; i < punti.length;) {
      let j = i; while (j + 1 < punti.length && (punti[j + 1].velocita ?? 0) < 3 && dist([punti[i].lat, punti[i].lng], [punti[j + 1].lat, punti[j + 1].lng]) < 0.15) j++;
      const min = (Date.parse(punti[j].quando) - Date.parse(punti[i].quando)) / 60000;
      if (j > i && min >= SOSTA_MIN && !vicinoFermata(punti[i])) add('Sosta', punti[i], punti[j], `${Math.round(min)} minuti fermo fuori dalle fermate del giro`);
      const acceso = punti.slice(i, j + 1).filter((p: any) => p.motore).length;
      if (j > i && min >= MOTORE_MIN && acceso === j - i + 1) add('Motore acceso', punti[i], punti[j], `${Math.round(min)} minuti fermo con il motore acceso`);
      i = j + 1;
    }
    // deviazioni: solo se il giro ha le posizioni delle fermate
    if (fermate.length) {
      for (let i = 0; i < punti.length;) {
        const lontano = (p: any) => distPercorso([p.lat, p.lng], previsto);
        if (lontano(punti[i]) <= DEVIAZIONE_KM) { i++; continue; }
        let j = i; while (j + 1 < punti.length && lontano(punti[j + 1]) > PARALLELA_KM) j++;
        const max = Math.max(...punti.slice(i, j + 1).map(lontano));
        add('Deviazione', punti[i], punti[j], `${max.toFixed(1).replace('.', ',')} km fuori rotta, lontano dalle fermate del giro`);
        i = j + 1;
      }
    }
    if (nuove.length) { await db.post('sat_anomalie?on_conflict=chiave', nuove, 'resolution=ignore-duplicates,return=minimal'); anomalie += nuove.length; }
  }
  return { letti: pos.length, salvati: righe.length, anomalie };
});

/** distanza in km tra due punti (formula dell'emisenoverso) */
function dist(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
/** distanza in km dal tratto più vicino del giro previsto (approssimazione piana, va bene su pochi km) */
function distPercorso(p: [number, number], linea: [number, number][]) {
  let min = Infinity;
  for (let i = 1; i < linea.length; i++) {
    const [a, b] = [linea[i - 1], linea[i]], k = Math.cos(p[0] * Math.PI / 180);
    const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0];
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2)) : 0;
    min = Math.min(min, dist(p, [ay + t * (by - ay), (ax + t * (bx - ax)) / k]));
  }
  return min;
}

async function scaricaPosizioni(): Promise<Posizione[]> {
  segreto('SAT_FORNITORE_URL'); segreto('SAT_FORNITORE_CHIAVE');
  throw new Errore('Collegamento al satellitare non ancora attivo: serve il nome del fornitore e la sua documentazione', 501);
}
