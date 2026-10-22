// Dati di prova del portale clienti: spedizioni consegnate con la foto della bolla,
// fatture inviate e pagate, richieste di riconsegna e le funzioni del portale.
// In prova non ci sono i permessi del database: il portale filtra comunque per cliente.
import { estendiProva } from './prova';
import { chiaveProva } from './index';

const utenteProva = () => { try { return sessionStorage.getItem(chiaveProva()); } catch { return null; } };

estendiProva(({ t, rpc, rel, viste }) => {
  const g = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const oreFa = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
  // due spedizioni Snam già consegnate, con la foto della bolla firmata
  t.bolle.push(
    { id: 'b-p01', numero: '26-000033', cliente_id: 'c-snam', tipo: 'Consegna', data_consegna: g(-1), fascia: 'Entro le 12', destinatario: 'Snam', indirizzo: 'Via [indirizzo]', citta: 'Milano', colli_previsti: 4, accessori: ['Sponda'], dati_mancanti: [], stato: 'Consegnata', operatore_id: 'u-bol', creata_il: oreFa(50) },
    { id: 'b-p02', numero: '26-000027', cliente_id: 'c-snam', tipo: 'Ritiro', data_consegna: g(-6), fascia: null, destinatario: 'Messina', indirizzo: 'Lacchiarella', citta: 'Lacchiarella', colli_previsti: 2, accessori: [], dati_mancanti: [], stato: 'Fatturata', operatore_id: 'u-bol', creata_il: oreFa(160) },
    { id: 'b-p03', numero: '26-000044', cliente_id: 'c-uni', tipo: 'Consegna', data_consegna: g(1), fascia: '9–13', destinatario: 'UniCredit', indirizzo: 'Piazza [indirizzo]', citta: 'Milano', colli_previsti: 20, accessori: [], dati_mancanti: [], stato: 'Confermata', operatore_id: 'u-bol', creata_il: oreFa(6) },
  );
  for (const b of t.bolle.filter((x) => x.id.startsWith('b-p'))) for (let k = 1; k <= b.colli_previsti; k++)
    t.colli.push({ id: crypto.randomUUID(), bolla_id: b.id, codice: `CP${b.id.slice(-2)}-${k}`, letto_entrata: null, letto_carico: b.stato !== 'Confermata' ? oreFa(30) : null, letto_consegna: b.stato !== 'Confermata' ? oreFa(26) : null });
  t.fermate.push(
    { id: 'f-p01', giro_id: 'giro1', bolla_id: 'b-p01', ordine: 90, esito: 'Consegnata', motivo: null, dopo: null, firmata: true, foto_bolla: 'f-p01/bolla.jpg', nitidezza: 82, chiusa_il: oreFa(26) },
    { id: 'f-p02', giro_id: 'giro1', bolla_id: 'b-p02', ordine: 91, esito: 'Consegnata', motivo: null, dopo: null, firmata: true, foto_bolla: 'f-p02/bolla.jpg', nitidezza: 77, chiusa_il: oreFa(150) },
  );
  // un bancale di UniCredit, che Econocom vede perché UniCredit passa da Econocom
  t.bancali.push({ id: 'k-uni', codice: 'B-0190', cliente_id: 'c-uni', posto_id: 'p8-6-3', creato_il: oreFa(70), uscito_il: null });
  t.contenuto.push({ id: crypto.randomUUID(), bancale_id: 'k-uni', articolo: 'iPhone 13 con cespite', quantita: 3, codici: ['35XXXXXXXXXX101', '35XXXXXXXXXX102', '35XXXXXXXXXX103'], inserito: 'Pistola', da: 'u-mag', il: oreFa(70) });
  // fatture viste dal cliente: solo inviate o pagate
  t.fatture.push(
    { id: 'fa-p1', azienda: 'trasporti', cliente_id: 'c-snam', periodo: g(-35).slice(0, 7), imponibile: 2140, iva: 470.8, stato: 'Inviata', problema: null, numero: 'FT 2026/118', data: g(-12), creata_il: oreFa(300), pagata_il: null, pdf: 'fatture/fa-p1.pdf' },
    { id: 'fa-p2', azienda: 'trasporti', cliente_id: 'c-snam', periodo: g(-65).slice(0, 7), imponibile: 1980, iva: 435.6, stato: 'Pagata', problema: null, numero: 'FT 2026/097', data: g(-42), creata_il: oreFa(1000), pagata_il: g(-20), pdf: 'fatture/fa-p2.pdf' },
    { id: 'fa-p3', azienda: 'trasporti', cliente_id: 'c-eco', periodo: g(-35).slice(0, 7), imponibile: 3120.4, iva: 686.49, stato: 'Inviata', problema: null, numero: 'FT 2026/121', data: g(-12), creata_il: oreFa(300), pagata_il: null, pdf: 'fatture/fa-p3.pdf' },
  );
  t.righe_fattura.push(
    { id: 'rp1', fattura_id: 'fa-p1', voce: 'Ritiro e consegna', quantita: 22, prezzo: 85, totale: 1870 }, { id: 'rp2', fattura_id: 'fa-p1', voce: 'Sponda', quantita: 15, prezzo: 18, totale: 270 },
    { id: 'rp3', fattura_id: 'fa-p2', voce: 'Ritiro e consegna', quantita: 21, prezzo: 85, totale: 1785 }, { id: 'rp4', fattura_id: 'fa-p2', voce: 'Giacenza', quantita: 39, prezzo: 5, totale: 195 },
    { id: 'rp5', fattura_id: 'fa-p3', voce: 'Entrata merce', quantita: 1820, prezzo: 0.22, totale: 400.4 }, { id: 'rp6', fattura_id: 'fa-p3', voce: 'Spedizioni', quantita: 302, prezzo: 9, totale: 2718 },
  );
  t.richieste_riconsegna = [];
  t.clienti_portale = [];
  rel.bolle = { ...rel.bolle, fermate: ['bolla_id', 'molti'] };
  rel.giacenze = { ...rel.giacenze, richieste_riconsegna: ['giacenza_id', 'molti'] };

  const mioCliente = (utente: string | null) => t.profili.find((p) => p.id === utente && p.ruolo === 'cliente')?.cliente_id ?? null;
  const miei = (utente: string | null) => { const c = mioCliente(utente); return c ? t.clienti.filter((x) => x.id === c || x.tramite === c) : []; };

  // come la vista clienti_portale: il cliente e chi passa da lui
  viste.push((tt) => { tt.clienti_portale = miei(utenteProva()).map((c) => ({ id: c.id, nome: c.nome, portale_live: c.portale_live })); });

  rpc.portale_bancali = (_a, tt, utente) => {
    const ids = miei(utente).filter((c) => c.portale_live).map((c) => c.id);
    return tt.bancali.filter((b) => ids.includes(b.cliente_id) && !b.uscito_il).map((b) => ({ id: b.id, codice: b.codice,
      cliente: tt.clienti.find((c) => c.id === b.cliente_id)?.nome, posto: tt.posti.find((p) => p.id === b.posto_id)?.codice ?? null, creato_il: b.creato_il }))
      .sort((a, b) => String(a.posto).localeCompare(String(b.posto)));
  };
  rpc.richiedi_riconsegna = (a, tt, utente) => {
    const gi = tt.giacenze.find((x) => x.id === a.p_giacenza && !x.chiusa_il);
    const bolla = gi && tt.bolle.find((b) => b.id === gi.bolla_id);
    if (!gi || !bolla || !miei(utente).some((c) => c.id === bolla.cliente_id)) throw new Error('Giacenza non trovata');
    if (!a.p_data || a.p_data <= g(0)) throw new Error('Scegli un giorno da domani in poi');
    const r = tt.richieste_riconsegna.find((x) => x.giacenza_id === gi.id && !x.gestita_il);
    if (r) Object.assign(r, { data: a.p_data, nota: a.p_nota ?? null, il: new Date().toISOString() });
    else tt.richieste_riconsegna.push({ id: crypto.randomUUID(), giacenza_id: gi.id, data: a.p_data, nota: a.p_nota ?? null, chi: utente, il: new Date().toISOString(), gestita_il: null });
  };
});
