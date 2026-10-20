// Dati e funzioni di prova in più per il Gestionale Corporation.
import { estendiProva } from './prova';

estendiProva(({ t, funzioni, viste }) => {
  // in Postgres lo stato del telefono è una colonna calcolata: qui la ricalcoliamo
  viste.push((tt) => tt.stage_telefoni.forEach((x) => { x.stato = !x.reset_fatto ? 'Reset' : !x.sblocco_fatto ? 'Sblocco' : !x.ticket_chiuso ? 'Ticket' : 'Chiuso'; }));
  // i computer di prova stanno su bancali della Corporation: se il bancale manca nei dati base, lo creiamo
  let nb = 300;
  for (const d of t.device) if (d.bancale_id && !t.bancali.some((k) => k.id === d.bancale_id)) {
    const posto = 'p' + d.bancale_id.slice(1);
    t.bancali.push({ id: d.bancale_id, codice: 'B-0' + nb++, cliente_id: 'c-corp', posto_id: t.posti.some((p) => p.id === posto) ? posto : null, creato_il: d.caricato_il, uscito_il: null });
  }
  const oreFa = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
  t.impostazioni ??= [];
  t.impostazioni.push({ chiave: 'licenze_certus', valore: { chiavetta: 3, rimaste: 40, fornitore: 'licenze@[fornitore]' }, nota: 'Licenze rimaste sulla chiavetta Certus in uso' });
  // qualche vendita del mese su più siti, per vedere la Home piena
  const canali: [string, number, number][] = [['Back Market', 289, 29], ['Di persona', 260, 0], ['eBay', 239, 24], ['Refurbed', 299, 30], ['Subito', 199, 0], ['Back Market', 349, 35], ['eBay', 219, 22]];
  canali.forEach(([canale, prezzo, comm], i) => {
    const id = `dv-v${i}`;
    t.device.push({ id, tipo: 'PC', seriale: `VX${1000 + i}`, marca: ['Lenovo', 'HP', 'Dell'][i % 3], modello: ['ThinkPad T14 Gen 2', 'EliteBook 840 G8', 'Latitude 5420'][i % 3], cpu: 'i5-1135G7', gpu: 'Intel Iris Xe', ram: '16 GB', disco: '256 GB SSD', schermo: '14"',
      grado: 'B', difetti: [], costo: 61, prezzo, stato: 'Venduto', siti: [], foto: [], lotto_id: i < 4 ? 'l15' : 'l14', bancale_id: null, prezzo_confermato_da: 'u-ven', caricato_il: oreFa(24 * (10 + i)) });
    t.vendite.push({ id: `ve-v${i}`, device_id: id, canale, prezzo, commissione: comm, incassato: prezzo - comm, venduto_il: oreFa(i < 2 ? 1 + i : 24 * i) });
  });
  funzioni['etichetta-spedizione'] = (c, tt) => {
    const o = tt.ordini.find((x) => x.id === c.ordine_id);
    if (!o) throw new Error('Ordine non trovato');
    if (o.stato !== 'Da preparare' && o.stato !== 'Pronto') throw new Error('L’etichetta si fa solo per gli ordini da preparare');
    o.etichetta = 'prova/etichetta-' + o.riferimento + '.pdf'; o.stato = 'Pronto';
    return { ok: true, url: null };
  };
});
