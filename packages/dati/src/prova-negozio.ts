// Dati di prova del negozio online: qualche computer in più in vendita sul sito
// e il pagamento simulato (con Supabase lo fa la funzione stripe-checkout).
import { estendiProva } from './prova';
import { conScheda, datiCancellati } from './prova-ricambi';

estendiProva(({ t, rpc, funzioni }) => {
  const dv = (n: number, x: Record<string, any>) => ({ id: `dv-n${n}`, tipo: 'PC', difetti: [], costo: 61, prezzo_minimo: null, prezzo_confermato_da: 'u-ven', foto: [],
    caricato_il: new Date().toISOString(), lotto_id: 'l15', bancale_id: null, stato: 'Disponibile', siti: ['Sito', 'Back Market'], ...x });
  const hp = { marca: 'HP', modello: 'EliteBook 840 G8', cpu: 'i7-1165G7', gpu: 'Intel Iris Xe', disco: '512 GB SSD', schermo: '14"' };
  const dell = { marca: 'Dell', modello: 'Latitude 5420', cpu: 'i5-1145G7', gpu: 'Intel Iris Xe', disco: '256 GB SSD', schermo: '14"' };
  const pro = { marca: 'HP', modello: 'ProBook 450 G8', cpu: 'i5-1135G7', gpu: 'Intel UHD', disco: '256 GB SSD', schermo: '15,6"' };
  const t14 = { marca: 'Lenovo', modello: 'ThinkPad T14 Gen 2', cpu: 'i5-1135G7', gpu: 'Intel Iris Xe', disco: '256 GB SSD', schermo: '14"' };
  t.device.push(
    dv(1, { ...hp, seriale: 'N5CG001', ram: '16 GB', grado: 'A', prezzo: 349 }),
    dv(2, { ...hp, seriale: 'N5CG002', ram: '16 GB', grado: 'B', prezzo: 309 }),
    dv(3, { ...dell, seriale: 'NJX003', ram: '8 GB', grado: 'C', prezzo: 169 }),
    dv(4, { ...dell, seriale: 'NJX004', ram: '16 GB', grado: 'B', prezzo: 229 }),
    dv(5, { ...pro, seriale: 'N5CD005', ram: '8 GB', grado: 'B', prezzo: 219 }),
    dv(6, { ...t14, seriale: 'NPF3006', ram: '8 GB', grado: 'B', prezzo: 219 }),
  );
  conScheda(t);
  // nei dati di prova lo stage ha cancellato i dati di tutti i computer in vendita
  t.device.filter((d) => d.stato === 'Disponibile' && !t.stage_pc.some((x) => x.seriale === d.seriale)).forEach((d) =>
    t.stage_pc.push({ id: 'st-' + d.id, seriale: d.seriale, cliente_id: null, postazione: null, esito: 'Formattato', certificato: `certificati/${d.seriale}.pdf`, iniziato_il: d.caricato_il, finito_il: d.caricato_il }));
  // come la funzione catalogo() del database: un gruppo per configurazione e grado
  rpc.catalogo = (_a, tt) => {
    const m: Record<string, any> = {};
    for (const d of tt.device.filter((x) => x.stato === 'Disponibile' && x.siti.includes('Sito') && x.prezzo != null && x.prezzo_confermato_da)) {
      const k = [d.modello, d.marca, d.cpu, d.ram, d.disco, d.schermo, d.gpu, d.grado].join('|');
      m[k] ??= { modello: d.modello, marca: d.marca, cpu: d.cpu, ram: d.ram, disco: d.disco, schermo: d.schermo, gpu: d.gpu, grado: d.grado, prezzo: d.prezzo, disponibili: 0,
        generazione: d.generazione ?? null, batteria_min: d.batteria_pct ?? null, sistema_operativo: d.sistema_operativo ?? null, tastiera: d.tastiera ?? null, porte: d.porte ?? null,
        rete: d.rete ?? null, webcam: d.webcam ?? null, peso: d.peso ?? null, dati_cancellati: true };
      m[k].disponibili++; m[k].prezzo = Math.min(m[k].prezzo, d.prezzo);
      if (d.batteria_pct != null) m[k].batteria_min = Math.min(m[k].batteria_min ?? 100, d.batteria_pct);
      m[k].dati_cancellati &&= datiCancellati(tt, d.seriale);
    }
    return Object.values(m).sort((a: any, b: any) => (a.marca + a.modello + a.grado).localeCompare(b.marca + b.modello + b.grado));
  };
  // pagamento: in prova si fa subito quello che online fanno Stripe e la funzione stripe-webhook a pagamento riuscito
  // (ordine «Da preparare» in Corporation › Ordini, vendita registrata, computer «Venduto» e fuori dal catalogo)
  funzioni['stripe-checkout'] = (c: { righe: any[] }) => {
    if (!Array.isArray(c?.righe) || !c.righe.length) throw new Error('Il carrello è vuoto');
    const presi: any[] = []; const mancano: string[] = [];
    for (const r of c.righe) {
      const d = t.device.filter((x) => x.stato === 'Disponibile' && x.siti.includes('Sito') && x.prezzo != null && x.prezzo_confermato_da && x.modello === r.modello && x.grado === r.grado
        && (!r.ram || x.ram === r.ram) && !presi.includes(x)).sort((a, b) => a.prezzo - b.prezzo)[0];
      if (d) presi.push(d); else mancano.push(`${r.modello} grado ${r.grado}`);
    }
    if (!presi.length) throw new Error('Questi computer non sono più disponibili');
    const ora = new Date().toISOString(); const id = crypto.randomUUID();
    t.ordini.unshift({ id, canale: 'Sito', riferimento: 'cs_' + id.slice(0, 8), stripe_session: 'cs_prova_' + id, email: 'cliente@esempio.it', cliente: 'Cliente del sito',
      indirizzo: 'Via [indirizzo], Milano', totale: presi.reduce((s, d) => s + Number(d.prezzo), 0), device_id: presi[0].id, stato: 'Da preparare', creato_il: ora,
      entro: new Date(Date.now() + 86400000).toISOString(), problema: mancano.length ? `Pagato ma non disponibile: ${mancano.join(', ')}. Da rimborsare o sostituire.` : null });
    for (const d of presi) {
      t.vendite.push({ id: crypto.randomUUID(), device_id: d.id, canale: 'Sito', prezzo: Number(d.prezzo), commissione: 0, incassato: Number(d.prezzo), venduto_il: ora, ordine_id: id });
      d.stato = 'Venduto'; d.siti = ['Sito'];
    }
    return { url: '#/grazie' };   // solo la parte dopo #: funziona anche dentro la cornice della prova
  };
});
