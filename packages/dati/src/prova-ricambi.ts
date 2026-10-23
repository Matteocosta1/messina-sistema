// Dati di prova: scheda tecnica completa dei computer, grado D, ricambi (stesse regole di 20261021000300_negozio_ricambi.sql).
import { estendiProva } from './prova';
import type { Tabelle } from './index';

/** scheda tecnica per modello: nel sistema vero la compila l'app Entrate dai dati del marchio */
export const SCHEDA: Record<string, Record<string, string | number>> = {
  'ThinkPad T14 Gen 2': { generazione: 'Gen 2 (2021)', batteria_pct: 86, sistema_operativo: 'Windows 11 Pro', tastiera: 'Italiana, retroilluminata', porte: '2 USB-C Thunderbolt 4, 2 USB-A, HDMI, Ethernet, jack audio', rete: 'Wi-Fi 6, Bluetooth 5.1', webcam: '720p con copertura', peso: '1,47 kg' },
  'EliteBook 840 G8': { generazione: 'G8 (2021)', batteria_pct: 89, sistema_operativo: 'Windows 11 Pro', tastiera: 'Italiana, retroilluminata', porte: '2 USB-C Thunderbolt 4, 2 USB-A, HDMI, jack audio', rete: 'Wi-Fi 6, Bluetooth 5.2', webcam: '720p con copertura', peso: '1,33 kg' },
  'Latitude 5420': { generazione: '5420 (2021)', batteria_pct: 82, sistema_operativo: 'Windows 11 Pro', tastiera: 'Italiana', porte: 'USB-C Thunderbolt 4, 2 USB-A, HDMI, Ethernet', rete: 'Wi-Fi 6, Bluetooth 5.1', webcam: '720p', peso: '1,36 kg' },
  'MacBook Air M1': { generazione: 'M1 (2020)', batteria_pct: 88, sistema_operativo: 'macOS Sonoma', tastiera: 'Italiana, retroilluminata', porte: '2 Thunderbolt / USB 4, jack audio', rete: 'Wi-Fi 6, Bluetooth 5.0', webcam: '720p FaceTime HD', peso: '1,29 kg' },
  'ThinkPad X1 Carbon': { generazione: 'Gen 9 (2021)', batteria_pct: 84, sistema_operativo: 'Windows 11 Pro', tastiera: 'Italiana, retroilluminata', porte: '2 USB-C Thunderbolt 4, 2 USB-A, HDMI, jack audio', rete: 'Wi-Fi 6, Bluetooth 5.2', webcam: '720p con copertura', peso: '1,13 kg' },
  'ProBook 450 G8': { generazione: 'G8 (2021)', batteria_pct: 80, sistema_operativo: 'Windows 11 Pro', tastiera: 'Italiana con tastierino numerico', porte: 'USB-C, 2 USB-A, HDMI, Ethernet, jack audio', rete: 'Wi-Fi 6, Bluetooth 5.2', webcam: '720p', peso: '1,74 kg' },
};
/** riempie le voci della scheda che mancano (i computer aggiunti da altri file di prova) */
export const conScheda = (t: Tabelle) => t.device.forEach((d) => { const s = SCHEDA[d.modello]; if (s) for (const k in s) d[k] ??= s[k]; });
/** come public.dati_cancellati(): lo stage ha il certificato per quel seriale */
export const datiCancellati = (t: Tabelle, seriale: string) => t.stage_pc.some((s) => s.seriale === seriale && s.certificato && ['Formattato', 'In vendita'].includes(s.esito));

estendiProva(({ t, rpc, rel, regole, viste }) => {
  const ora = new Date().toISOString();
  // un T14 grado D in vendita e due computer non funzionanti smontati per ricambi
  t.device.push(
    { id: 'dv-d01', tipo: 'PC', seriale: 'PF3XXXX8', marca: 'Lenovo', modello: 'ThinkPad T14 Gen 2', cpu: 'i5-1135G7', gpu: 'Intel Iris Xe', ram: '16 GB', disco: '256 GB SSD', schermo: '14"', grado: 'D',
      difetti: ['Scocca inferiore crepata, funziona al 100%'], lotto_id: 'l15', bancale_id: 'k11-1-1', costo: 61, prezzo: 159, prezzo_minimo: null, prezzo_confermato_da: 'u-ven', foto: [], caricato_il: ora, stato: 'Disponibile', siti: ['Sito', 'eBay', 'Subito'] },
    { id: 'dv-r01', tipo: 'PC', seriale: 'JXXXXX9', marca: 'Dell', modello: 'Latitude 5420', cpu: 'i5-1145G7', gpu: 'Intel Iris Xe', ram: '8 GB', disco: '256 GB SSD', schermo: '14"', grado: null,
      difetti: ['Non si accende'], lotto_id: 'l13', bancale_id: 'k12-1-1', costo: 61, prezzo: null, prezzo_minimo: null, prezzo_confermato_da: null, foto: [], caricato_il: ora, stato: 'Smontato', siti: [] },
    { id: 'dv-r02', tipo: 'PC', seriale: '5CDXXXX1', marca: 'HP', modello: 'ProBook 450 G8', cpu: 'i5-1135G7', gpu: 'Intel UHD', ram: '8 GB', disco: '256 GB SSD', schermo: '15,6"', grado: null,
      difetti: ['Scheda madre guasta'], lotto_id: 'l15', bancale_id: 'k11-1-1', costo: 61, prezzo: null, prezzo_minimo: null, prezzo_confermato_da: null, foto: [], caricato_il: ora, stato: 'Smontato', siti: [] },
  );
  conScheda(t);
  t.stage_pc.push(
    { id: 'st-r01', seriale: 'JXXXXX9', cliente_id: null, postazione: null, esito: 'Formattato', certificato: 'certificati/JXXXXX9.pdf', iniziato_il: ora, finito_il: ora },
    { id: 'st-r02', seriale: '5CDXXXX1', cliente_id: null, postazione: null, esito: 'Formattato', certificato: 'certificati/5CDXXXX1.pdf', iniziato_il: ora, finito_il: ora },
  );
  const r = (id: string, device_id: string, lotto_id: string, tipo: string, descrizione: string, prezzo: number, stato: string, x: Record<string, unknown> = {}) =>
    ({ id, device_id, lotto_id, tipo, descrizione, prezzo, stato, siti: stato === 'Disponibile' ? ['Sito', 'eBay'] : [], posto: 'S12-1-2', canale: null, venduto_prezzo: null, commissione: 0, incassato: null, venduto_il: null, creato_il: ora, creato_da: 'u-sta', ...x });
  t.ricambi = [
    r('ri1', 'dv-r01', 'l13', 'Display', 'Display 14" Full HD', 39, 'Disponibile'),
    r('ri2', 'dv-r01', 'l13', 'Tastiera', 'Tastiera italiana', 25, 'Disponibile'),
    r('ri3', 'dv-r01', 'l13', 'Disco', 'SSD 256 GB, dati cancellati con rapporto', 19, 'Disponibile'),
    r('ri4', 'dv-r02', 'l15', 'Batteria', 'Batteria, 81%', 35, 'Venduto', { canale: 'eBay', venduto_prezzo: 35, commissione: 4, incassato: 31, venduto_il: ora }),
    r('ri5', 'dv-r02', 'l15', 'Display', 'Display 15,6" Full HD', 45, 'Disponibile'),
    r('ri6', 'dv-r02', 'l15', 'Memoria', 'RAM 8 GB DDR4', 15, 'Disponibile'),
  ];
  rel.ricambi = { device: 'device_id', lotti: 'lotto_id' };

  // come il trigger ricambi_regole (stessi messaggi)
  regole.ricambi = (a, b, tt) => {
    const d = tt.device.find((x) => x.id === b.device_id);
    if (!d) throw new Error('Computer d’origine sconosciuto');
    if (!a && d.stato === 'Venduto') throw new Error('Il computer è già venduto intero: non si smonta');
    if (a?.stato === 'Venduto') throw new Error('Ricambio già venduto: non si modifica più');
    b.lotto_id = d.lotto_id; b.stato ??= 'Da vendere'; b.siti ??= []; b.commissione ??= 0;
    if (b.tipo === 'Disco' && ['Disponibile', 'Venduto'].includes(b.stato) && !datiCancellati(tt, d.seriale))
      throw new Error(`Disco di ${d.seriale} senza rapporto di cancellazione: non si mette in vendita`);
    if (['Disponibile', 'Venduto'].includes(b.stato) && b.prezzo == null) throw new Error('Serve il prezzo');
    if (b.stato === 'Venduto') {
      if (b.venduto_prezzo == null || !String(b.canale ?? '').trim()) throw new Error('Servono canale e prezzo di vendita');
      b.venduto_il ??= new Date().toISOString(); b.incassato = Number(b.venduto_prezzo) - Number(b.commissione ?? 0);
    }
    if (!a) { b.creato_il = new Date().toISOString(); if (d.stato !== 'Smontato') { d.stato = 'Smontato'; d.siti = []; } }
  };
  rpc.catalogo_ricambi = (_a, tt) => tt.ricambi.filter((x) => x.stato === 'Disponibile' && x.siti.includes('Sito') && x.prezzo != null)
    .map((x) => { const d = tt.device.find((y) => y.id === x.device_id); return { id: x.id, tipo: x.tipo, descrizione: x.descrizione, origine: `${d?.marca ?? ''} ${d?.modello ?? ''}`.trim(), prezzo: x.prezzo }; });

  // lotti_conti: i ricambi venduti entrano nel recupero
  viste.push((tt) => {
    tt.lotti_conti = tt.lotti_conti.map((l) => {
      const v = tt.ricambi.filter((x) => x.lotto_id === l.id && x.stato === 'Venduto'); const inc = v.reduce((s, x) => s + Number(x.incassato ?? 0), 0);
      const tot = Number(l.incassato) + inc;
      return { ...l, incassato: tot, recuperato_pct: Math.round(tot / l.costo * 1000) / 10, incassato_ricambi: inc, ricambi_venduti: v.length };
    });
  });
});
