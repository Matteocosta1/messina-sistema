// Dati e funzioni di prova in più per il Gestionale Corporation.
import { estendiProva } from './prova';
import './prova-ricambi';

estendiProva(({ t, funzioni, viste }) => {
  // in Postgres lo stato del telefono è una colonna calcolata: qui la ricalcoliamo
  viste.push((tt) => tt.stage_telefoni.forEach((x) => { x.stato = !x.reset_fatto ? 'Reset' : !x.sblocco_fatto ? 'Sblocco' : !x.ticket_chiuso ? 'Ticket' : 'Chiuso'; x.chiuso_il = x.stato === 'Chiuso' ? (x.chiuso_il ?? x.ricevuto_il ?? new Date().toISOString()) : null; }));
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

// Lotti con quadratura, vendite nette (IVA del margine, spese, resi), marketplace, conferma prezzo, telefoni
// (come supabase/migrations/20261022000600_corporation.sql)
estendiProva(({ t, rpc, viste, regole }) => {
  const SITI = ['Sito', 'Back Market', 'Refurbed', 'eBay', 'Subito', 'Amazon'];
  const ruolo = (u: string | null) => t.profili.find((p) => p.id === u)?.ruolo;
  const corp = (u: string | null) => t.profili.find((p) => p.id === u)?.azienda === 'corporation';
  const vendite = (u: string | null, msg = 'Non autorizzato') => { if (!corp(u) || ruolo(u) !== 'vendite') throw new Error(msg); };
  const ora = () => new Date().toISOString();
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const nome = (u: string | null) => t.profili.find((p) => p.id === u)?.nome ?? null;
  const registra = (u: string | null, operazione: string, cosa: string, dove: string | null = null) =>
    t.storico.unshift({ id: Date.now() + Math.random(), quando: ora(), azienda: 'corporation', chi_nome: nome(u), operazione, cosa, dove, come: 'Manuale' });
  const ivaMargine = (prezzo: number, costo: number | null) => r2(Math.max(prezzo - Number(costo ?? 0), 0) * 22 / 122);

  // dati: L-015 aperto (si carica ancora), L-016 appena arrivato, gli altri chiusi; documenti, prezzi per modello, un telefono, un prezzo da confermare, un reso
  for (const l of t.lotti) l.stato = l.id === 'l15' ? 'Aperto' : 'Chiuso';
  t.lotti.unshift({ id: 'l16', codice: 'L-016', fornitore: 'Fornitore C', acquistato_il: new Date().toISOString().slice(0, 10), pezzi: 3, costo: 450, stato: 'Aperto' });
  t.lotti_documenti = [
    { id: 'ld1', lotto_id: 'l15', tipo: 'Fattura', percorso: 'lotti/l15/fattura-L-015.pdf', nome: 'fattura-L-015.pdf', caricato_il: ora() },
    { id: 'ld2', lotto_id: 'l15', tipo: 'DDT', percorso: 'lotti/l15/ddt-L-015.pdf', nome: 'ddt-L-015.pdf', caricato_il: ora() },
    { id: 'ld3', lotto_id: 'l14', tipo: 'Fattura', percorso: 'lotti/l14/fattura-L-014.pdf', nome: 'fattura-L-014.pdf', caricato_il: ora() },
  ];
  t.prezzi_modello = [
    { modello: 'ThinkPad T14 Gen 2', grado: 'A', prezzo: 289 }, { modello: 'ThinkPad T14 Gen 2', grado: 'B', prezzo: 249 }, { modello: 'ThinkPad T14 Gen 2', grado: 'C', prezzo: 209 },
    { modello: 'iPhone 13', grado: 'A', prezzo: 390 }, { modello: 'iPhone 13', grado: 'B', prezzo: 340 },
  ];
  const base = t.device.find((d) => d.bancale_id) ?? {};
  t.device.push(
    { id: 'dv-0101', tipo: 'Telefono', seriale: '35PROVA00001', marca: 'Apple', modello: 'iPhone 13', memoria: '128 GB', batteria: 89, colore: 'Blu', grado: 'A', difetti: [], lotto_id: 'l15', bancale_id: base.bancale_id,
      costo: 220, prezzo: 390, prezzo_minimo: null, prezzo_confermato_da: 'u-ven', stato: 'Disponibile', siti: ['Back Market', 'Sito'], foto: [], caricato_il: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: 'dv-0102', tipo: 'PC', seriale: 'PF5XXXX1', marca: 'Lenovo', modello: 'ThinkPad T14 Gen 2', cpu: 'i5-1145G7', gpu: 'Intel Iris Xe', ram: '16 GB', disco: '256 GB SSD', schermo: '14"', grado: 'B', difetti: [], lotto_id: 'l16', bancale_id: base.bancale_id,
      costo: 150, prezzo: 259, prezzo_minimo: null, prezzo_confermato_da: null, stato: 'Disponibile', siti: ['eBay', 'Subito'], foto: [], caricato_il: ora() },
  );
  // il ProBook reso: venduto su Back Market a 219, rimborsato
  const reso = t.device.find((d) => d.stato === 'Reso');
  if (reso) t.vendite.push({ id: 've-reso', device_id: reso.id, canale: 'Back Market', prezzo: 219, commissione: 22, spese: 0, venduto_il: new Date(Date.now() - 4 * 86400000).toISOString(),
    reso_il: new Date(Date.now() - 86400000).toISOString(), rimborso: 219, motivo_reso: 'Batteria non come descritta' });
  for (const v of t.vendite) { v.spese ??= 0; v.rimborso ??= 0; v.reso_il ??= null; }
  const ve1 = t.vendite.find((v) => v.id === 've1'); if (ve1) ve1.ordine_id ??= 'o2';
  for (const o of t.ordini) if (o.stato === 'Spedito') o.tracking ??= 'BRT' + o.riferimento.replace(/\D/g, '');

  // viste: vendite nette, incassi, conti e quadratura dei lotti
  const EXTRA: Record<string, [number, number]> = { l15: [12, 2202], l14: [131, 20736], l13: [298, 31980] };
  viste.push((tt) => {
    for (const v of tt.vendite) {
      v.spese ??= 0; v.rimborso ??= 0; v.reso_il ??= null;
      if (v.iva == null) v.iva = ivaMargine(Number(v.prezzo), tt.device.find((d) => d.id === v.device_id)?.costo ?? 0);
      v.netto = r2(Number(v.prezzo) - Number(v.commissione ?? 0) - Number(v.spese) - Number(v.iva)); v.incassato = v.netto;
    }
    const oggi = new Date().toISOString().slice(0, 10), mese = oggi.slice(0, 7);
    const val = (v: any) => Number(v.netto) - Number(v.rimborso ?? 0);
    tt.incassi_corporation = [{
      incassato_oggi: r2(tt.vendite.filter((v) => v.venduto_il.slice(0, 10) === oggi).reduce((s, v) => s + val(v), 0)),
      incassato_mese: r2(tt.vendite.filter((v) => v.venduto_il.slice(0, 7) === mese).reduce((s, v) => s + val(v), 0) + 14820),
    }];
    tt.lotti_conti = tt.lotti.map((l) => {
      const dev = tt.device.filter((d) => d.lotto_id === l.id).map((d) => d.id);
      const v = tt.vendite.filter((x) => dev.includes(x.device_id));
      const ric = (tt.ricambi ?? []).filter((x) => x.lotto_id === l.id && x.stato === 'Venduto'); const incR = ric.reduce((s, x) => s + Number(x.incassato ?? 0), 0);
      const ex = EXTRA[l.id] ?? [0, 0];
      const inc = r2(v.reduce((s, x) => s + val(x), 0) + ex[1] + incR);
      return { ...l, venduti: v.filter((x) => !x.reso_il).length + ex[0], incassato: inc, recuperato_pct: l.costo > 0 ? Math.round(inc / l.costo * 1000) / 10 : 0, incassato_ricambi: incR, ricambi_venduti: ric.length };
    });
    // in prova i lotti chiusi hanno tutti i pezzi caricati (nel database veri: si contano i PC del lotto)
    tt.lotti_quadratura = tt.lotti.map((l) => {
      const ds = tt.device.filter((d) => d.lotto_id === l.id);
      const caricati = l.stato === 'Chiuso' && !l.chiuso_il ? l.pezzi : ds.length;
      const rip = l.stato === 'Chiuso' && !l.chiuso_il ? l.costo : r2(ds.reduce((s, d) => s + Number(d.costo ?? 0), 0));
      return { id: l.id, codice: l.codice, stato: l.stato, pezzi_dichiarati: l.pezzi, costo: l.costo, caricati, costo_ripartito: rip, differenza: r2(l.costo - rip) };
    });
  });

  // regole del database
  regole.lotti = (a, b) => { if (!a) { b.stato ??= 'Aperto'; if (t.lotti.some((l) => l.codice === b.codice)) throw new Error(`Il lotto ${b.codice} esiste già`); } };
  regole.lotti_documenti = (a, b, _t, u) => { if (!a) { b.caricato_il = ora(); b.caricato_da = u; } };
  const regolaDevice = regole.device;
  regole.device = (a, b, tt, u) => {
    regolaDevice?.(a, b, tt, u);
    if ((b.siti ?? []).some((x: string) => !SITI.includes(x))) throw new Error('Sito sconosciuto');
    if (b.batteria != null && (b.batteria < 0 || b.batteria > 100)) throw new Error('La batteria va da 0 a 100');
    if (b.lotto_id && (!a || a.lotto_id !== b.lotto_id)) {
      const l = tt.lotti.find((x) => x.id === b.lotto_id);
      if (l?.stato === 'Chiuso') throw new Error(`Il lotto ${l.codice} è chiuso: scegli un lotto aperto o creane uno nuovo`);
      if (b.costo == null && l && l.pezzi > 0) b.costo = r2(l.costo / l.pezzi);
    }
    if (!a) {
      b.caricato_da = u; b.caricato_il ??= ora(); b.difetti ??= []; b.foto ??= []; b.siti ??= [];
      b.prezzo_confermato_da = ruolo(u) === 'vendite' && b.prezzo != null ? u : null;
      if (b.stato === 'Venduto') throw new Error('Venduto solo con una vendita registrata');
    } else {
      if (Number(b.prezzo) !== Number(a.prezzo) || (b.prezzo == null) !== (a.prezzo == null)) b.prezzo_confermato_da = ruolo(u) === 'vendite' ? u : null;
      else if (b.prezzo_confermato_da !== a.prezzo_confermato_da) throw new Error('La conferma del prezzo la mette il sistema: premi «Conferma»');
      if (b.stato !== a.stato && (b.stato === 'Venduto' || a.stato === 'Venduto')) throw new Error('Venduto solo con una vendita registrata');
    }
    if (b.stato === 'Disponibile' && !b.bancale_id) throw new Error('Il device non si conferma senza bancale');
    if (b.stato === 'Disponibile' && (b.prezzo == null || !b.grado)) throw new Error('Servono grado e prezzo');
  };

  // funzioni del database
  rpc.prezzo_proposto = (x, tt) => {
    const p = tt.prezzi_modello.find((r) => r.modello === x.p_modello && r.grado === x.p_grado); if (p) return p.prezzo;
    const v = tt.vendite.filter((y) => !y.reso_il && tt.device.some((d) => d.id === y.device_id && d.modello === x.p_modello && d.grado === x.p_grado)).sort((m, n) => n.venduto_il.localeCompare(m.venduto_il)).slice(0, 10);
    return v.length ? Math.round(v.reduce((s, y) => s + Number(y.prezzo), 0) / v.length) : null;
  };
  rpc.chiudi_lotto = (x, tt, u) => {
    if (!corp(u) || !['vendite', 'amministrazione'].includes(ruolo(u) ?? '')) throw new Error('Non autorizzato');
    const l = tt.lotti.find((y) => y.id === x.p_lotto); if (!l || l.stato !== 'Aperto') throw new Error('Lotto già chiuso');
    const ds = tt.device.filter((d) => d.lotto_id === l.id).sort((m, n) => String(m.caricato_il).localeCompare(String(n.caricato_il)));
    if (!ds.length) throw new Error('Nel lotto non c\'è ancora nessun PC');
    const nota = String(x.p_nota ?? '').trim();
    if (ds.length !== l.pezzi && !nota) throw new Error(`Nel DDT ci sono ${l.pezzi} pezzi, caricati ${ds.length}: scrivi cosa manca o cosa c'è in più`);
    const quota = Math.trunc(l.costo / ds.length * 100) / 100;
    ds.forEach((d) => { d.costo = quota; }); ds[ds.length - 1].costo = r2(l.costo - quota * (ds.length - 1));
    l.stato = 'Chiuso'; l.chiuso_il = ora(); l.nota_chiusura = nota || null;
    registra(u, 'Lotti', `${l.codice} chiuso: ${ds.length} PC, ${l.costo} € divisi${nota ? ' · ' + nota : ''}`);
  };
  rpc.conferma_prezzo = (x, tt, u) => {
    vendite(u, 'Il prezzo lo confermano le Vendite');
    const d = tt.device.find((y) => y.id === x.p_device); if (!d || d.prezzo == null || d.stato === 'Venduto') throw new Error('Prima scrivi il prezzo');
    d.prezzo_confermato_da = u;
  };
  rpc.registra_vendita = (x, tt, u) => {
    vendite(u, 'Le vendite le registrano le Vendite');
    if (![...SITI, 'Di persona'].includes(x.p_canale)) throw new Error('Canale sconosciuto: ' + x.p_canale);
    if (!(Number(x.p_prezzo) > 0)) throw new Error('Scrivi il prezzo di vendita');
    const d = tt.device.find((y) => y.seriale === String(x.p_seriale).trim()); if (!d) throw new Error(`Seriale ${x.p_seriale} sconosciuto`);
    if (d.stato !== 'Disponibile') throw new Error(`Il PC ${d.seriale} è «${d.stato}»: non si può vendere`);
    const oid = crypto.randomUUID(), vid = crypto.randomUUID(), rif = String(x.p_riferimento ?? '').trim() || null;
    tt.ordini.unshift({ id: oid, canale: x.p_canale, riferimento: rif, cliente: x.p_cliente ?? null, stato: x.p_canale === 'Di persona' ? 'Spedito' : 'Da preparare', entro: new Date(Date.now() + 86400000).toISOString(), creato_il: ora(), device_id: d.id });
    tt.vendite.push({ id: vid, device_id: d.id, canale: x.p_canale, prezzo: Number(x.p_prezzo), commissione: Number(x.p_commissione ?? 0), spese: Number(x.p_spese ?? 0), iva: ivaMargine(Number(x.p_prezzo), d.costo),
      venduto_il: ora(), ordine_id: oid, riferimento: rif, reso_il: null, rimborso: 0 });
    d.stato = 'Venduto'; d.siti = SITI.includes(x.p_canale) ? [x.p_canale] : [];
    registra(u, 'Vendita', `${d.marca} ${d.modello} ${d.seriale} · ${x.p_canale} · ${x.p_prezzo} €`);
    return vid;
  };
  rpc.reso_vendita = (x, tt, u) => {
    vendite(u, 'I resi li gestiscono le Vendite');
    const v = tt.vendite.find((y) => y.id === x.p_vendita); if (!v || v.reso_il) throw new Error('Vendita non trovata o già resa');
    if (!String(x.p_motivo ?? '').trim()) throw new Error('Scrivi il motivo del reso');
    const rb = Number(x.p_rimborso); if (!(rb >= 0) || rb > Number(v.prezzo)) throw new Error(`Il rimborso va da 0 al prezzo pagato (${v.prezzo} €)`);
    v.reso_il = ora(); v.rimborso = rb; v.motivo_reso = String(x.p_motivo).trim();
    const d = tt.device.find((y) => y.id === v.device_id); if (d) { d.stato = x.p_rivendibile ? 'Reso' : 'Fermo'; d.siti = []; }
    registra(u, 'Reso', `Rimborso ${rb} € · ${v.motivo_reso}`);
  };
  rpc.rimetti_in_vendita = (x, tt, u) => {
    vendite(u);
    const d = tt.device.find((y) => y.id === x.p_device); if (!d || !['Reso', 'Fermo'].includes(d.stato)) throw new Error('Si rimette in vendita solo un PC reso o fermo');
    const b = tt.bancali.find((y) => y.codice === String(x.p_bancale).trim() && !y.uscito_il); if (!b) throw new Error(`Bancale ${x.p_bancale} non trovato: scansiona l'etichetta del bancale dove lo metti`);
    d.stato = 'Disponibile'; d.bancale_id = b.id; if (x.p_prezzo != null) { if (Number(x.p_prezzo) !== Number(d.prezzo)) d.prezzo_confermato_da = u; d.prezzo = Number(x.p_prezzo); }
    registra(u, 'Inventario', `${d.seriale} di nuovo in vendita`, b.codice);
  };
  rpc.metti_fermo = (x, tt, u) => {
    vendite(u);
    if (!String(x.p_motivo ?? '').trim()) throw new Error('Scrivi perché è fermo');
    const d = tt.device.find((y) => y.id === x.p_device); if (!d || ['Venduto', 'Smontato'].includes(d.stato)) throw new Error('Questo PC non si può fermare');
    d.stato = 'Fermo'; d.siti = [];
    registra(u, 'Inventario', `${d.seriale} fermo · ${String(x.p_motivo).trim()}`);
  };
  rpc.ordine_spedito = (x, tt, u) => {
    if (!corp(u) || !['vendite', 'magazzino'].includes(ruolo(u) ?? '')) throw new Error('Non autorizzato');
    if (!String(x.p_tracking ?? '').trim()) throw new Error('Scrivi il numero di spedizione');
    const o = tt.ordini.find((y) => y.id === x.p_ordine); if (!o || !['Da preparare', 'Pronto'].includes(o.stato)) throw new Error('Ordine già spedito o annullato');
    o.stato = 'Spedito'; o.tracking = String(x.p_tracking).trim(); o.spedito_il = ora();
  };
});
