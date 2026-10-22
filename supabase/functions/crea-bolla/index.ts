// «Crea bolla da questa mail»: Claude legge la mail (e gli allegati di testo) e prepara la bolla.
// La bolla nasce «Nuova»: quello che manca finisce in dati_mancanti e la conferma resta bloccata finché non c'è.
import { servi, chiChiama, claudeJson, Errore, enc } from '../_comune/mod.ts';

// gli stessi accessori del gestionale e dell'app (ognuno ha la sua tariffa)
const ACCESSORI = ['Sponda', 'Piano terra', 'Consegna al piano', 'Fascia oraria', 'Sabato', 'Firma obbligatoria', 'Chiamare prima', 'Attesa'];

servi(async (req, c) => {
  const { io, db } = await chiChiama(req, ['bolle', 'traffico']);
  if (io.azienda !== 'trasporti') throw new Errore('Le bolle sono di Messina Autotrasporti', 403);
  const [m] = await db.get(`mail?select=id,azienda,graph_id,da_nome,da_indirizzo,oggetto,testo,bolla_id&id=eq.${enc(c.mail_id)}`);
  if (!m) throw new Errore('Mail non trovata', 404);
  if (m.bolla_id) return { bolla_id: m.bolla_id };
  const clienti = await db.get(`clienti?select=id,nome,email&azienda=eq.trasporti&attivo=eq.true&stato=eq.Attivo`);
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });   // giorno italiano
  const x = await claudeJson<{ cliente: string | null; tipo: string; data_consegna: string | null; fascia: string | null; destinatario: string | null;
    indirizzo: string | null; citta: string | null; provincia: string | null; colli: number | null; bancali: number | null; peso_kg: number | null;
    valore_merce: number | null; contrassegno: number | null; accessori: string[]; mancanti: string[] }>(
    `Estrai i dati di una spedizione da una mail ricevuta da Messina Autotrasporti. Oggi è ${oggi}. ` +
    `Il cliente va scelto SOLO da questo elenco (nome esatto) oppure null: ${clienti.map((k: any) => k.nome).join(', ')}. ` +
    `Date nel formato AAAA-MM-GG. Peso in kg (totale della spedizione), provincia con la sigla di due lettere, importi in euro. ` +
    `Contrassegno solo se la mail chiede di incassare alla consegna; valore della merce solo se scritto. ` +
    `Se un dato non è scritto chiaramente mettilo a null e aggiungilo a «mancanti» con un nome breve (es. «Indirizzo», «Fascia oraria», «Piano di consegna»). Non inventare.`,
    [{ type: 'text', text: `Da: ${m.da_nome} <${m.da_indirizzo}>\nOggetto: ${m.oggetto}\n\n${m.testo ?? ''}` }],
    { type: 'object', required: ['cliente', 'tipo', 'data_consegna', 'fascia', 'destinatario', 'indirizzo', 'citta', 'provincia', 'colli', 'bancali', 'peso_kg', 'valore_merce', 'contrassegno', 'accessori', 'mancanti'], properties: {
      cliente: { type: ['string', 'null'] }, tipo: { type: 'string', enum: ['Consegna', 'Ritiro', 'Riconsegna', 'Magazzino'] },
      data_consegna: { type: ['string', 'null'] }, fascia: { type: ['string', 'null'] }, destinatario: { type: ['string', 'null'] },
      indirizzo: { type: ['string', 'null'] }, citta: { type: ['string', 'null'] }, provincia: { type: ['string', 'null'] }, colli: { type: ['integer', 'null'] },
      bancali: { type: ['integer', 'null'] }, peso_kg: { type: ['number', 'null'] }, valore_merce: { type: ['number', 'null'] }, contrassegno: { type: ['number', 'null'] },
      accessori: { type: 'array', items: { type: 'string', enum: ACCESSORI } },
      mancanti: { type: 'array', items: { type: 'string' } } } });
  const cliente = clienti.find((k: any) => k.nome === x.cliente) ?? clienti.find((k: any) => k.email && k.email.toLowerCase() === String(m.da_indirizzo).toLowerCase());
  if (!cliente) throw new Errore('Non riconosco il cliente: crea prima la sua scheda in Clienti');
  const mancanti = new Set(x.mancanti);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.data_consegna ?? '')) mancanti.add('Data');
  if (!x.indirizzo) mancanti.add('Indirizzo');
  if (!x.colli) mancanti.add('Colli');
  // se il cliente paga a peso (o a scaglioni di peso) il peso serve per il prezzo: senza, la bolla non si conferma
  const aPeso = await db.get(`tariffe?select=id&cliente_id=eq.${cliente.id}&voce=eq.Base&stato=eq.Attiva&or=(unita.eq.kg,scaglione_su.eq.peso)&limit=1`).catch(() => []);
  if (aPeso.length && !(Number(x.peso_kg) > 0)) mancanti.add('Peso');
  const [b] = await db.post('bolle', { cliente_id: cliente.id, tipo: x.tipo, data_consegna: mancanti.has('Data') ? null : x.data_consegna, fascia: x.fascia,
    destinatario: x.destinatario, indirizzo: x.indirizzo, citta: x.citta, provincia: x.provincia ? x.provincia.toUpperCase().slice(0, 2) : null,
    colli_previsti: x.colli ?? 0, bancali: x.bancali, peso_kg: Number(x.peso_kg) > 0 ? x.peso_kg : null,
    valore_merce: Number(x.valore_merce) > 0 ? x.valore_merce : null, contrassegno: Number(x.contrassegno) > 0 ? x.contrassegno : null,
    accessori: [...new Set(x.accessori)], dati_mancanti: [...mancanti],
    operatore_id: io.id, mail_id: m.graph_id ?? m.id });
  await db.patch(`mail?id=eq.${m.id}`, { bolla_id: b.id });
  return { bolla_id: b.id };
});
