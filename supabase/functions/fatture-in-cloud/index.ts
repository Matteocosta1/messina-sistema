// Fatturazione → Fatture in Cloud (API v2), che la manda allo SdI.
// La fattura deve essere «Pronta» (approvata qui da chi preme Invia) o già «Inviata» senza numero.
import { servi, chiChiama, dbServizio, segreto, Errore, enc } from '../_comune/mod.ts';

const FIC = 'https://api-v2.fattureincloud.it';

servi(async (req, c) => {
  const { db } = await chiChiama(req, ['amministrazione']);
  const [f] = await db.get(`fatture?select=*,clienti(nome,piva,email,indirizzo),righe_fattura(voce,quantita,prezzo,bolla_id)&id=eq.${enc(c.fattura_id)}`);
  if (!f) throw new Errore('Fattura non trovata', 404);
  if (f.sdi_inviata_il) return { numero: f.numero, gia_inviata: true };
  if (!['Pronta', 'Inviata'].includes(f.stato)) throw new Errore(`Fattura «${f.stato}»: si invia solo quando è Pronta`);
  if (!f.righe_fattura?.length) throw new Errore('La fattura non ha righe');
  if (!f.clienti?.piva) throw new Errore('Manca la partita IVA del cliente: aggiungila nella scheda Clienti');

  // blocco: una sola richiesta alla volta per fattura (doppio clic o due persone insieme → una sola fattura allo SdI)
  const sv = dbServizio();
  const presa = await sv.patch(`fatture?id=eq.${f.id}&sdi_inviata_il=is.null&or=(fic_in_corso.is.null,fic_in_corso.lt.${enc(new Date(Date.now() - 10 * 60000).toISOString())})`,
    { fic_in_corso: new Date().toISOString() });
  if (!presa.length) throw new Errore('Invio di questa fattura già in corso', 409);
  try {
    // approvazione: il passaggio a «Inviata» lo fa chi chiama, così resta il suo nome (regole del database)
    if (f.stato === 'Pronta') await db.patch(`fatture?id=eq.${f.id}`, { stato: 'Inviata' });
    return await invia(f, sv);
  } finally {
    await sv.patch(`fatture?id=eq.${f.id}`, { fic_in_corso: null });
  }
});

async function invia(f: any, sv: ReturnType<typeof dbServizio>) {
  const azienda = f.azienda === 'corporation' ? 'CORPORATION' : 'TRASPORTI';
  const company = Deno.env.get(`FIC_COMPANY_ID_${azienda}`) ?? segreto('FIC_COMPANY_ID');
  const token = Deno.env.get(`FIC_ACCESS_TOKEN_${azienda}`) ?? segreto('FIC_ACCESS_TOKEN');
  const iva = Number(segreto('FIC_IVA_ID'));   // id dell'aliquota 22% nel vostro account Fatture in Cloud
  const chiama = async (percorso: string, corpo: unknown) => {
    const r = await fetch(`${FIC}/c/${company}${percorso}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Errore(`Fatture in Cloud: ${j?.error?.message ?? r.status}`, 502);
    return j;
  };
  let docId = f.fic_id, doc: any;
  if (!docId) {
  doc = await chiama('/issued_documents', { data: {
    type: 'invoice', e_invoice: true,
    entity: { name: f.clienti.nome, vat_number: f.clienti.piva, email: f.clienti.email ?? undefined, address_street: f.clienti.indirizzo ?? undefined, country: 'Italia' },
    date: new Date().toISOString().slice(0, 10),
    subject: f.periodo ? `Servizi ${f.periodo}` : undefined,
    items_list: f.righe_fattura.map((r: any) => ({ name: r.voce, qty: Number(r.quantita), net_price: Number(r.prezzo), vat: { id: iva } })),
  } });
  docId = String(doc.data.id);
  await sv.patch(`fatture?id=eq.${f.id}`, { fic_id: docId });   // subito: se l'invio sotto fallisce, al nuovo tentativo non si ricrea
  } else {
    const r = await fetch(`${FIC}/c/${company}/issued_documents/${docId}`, { headers: { Authorization: `Bearer ${token}` } });
    doc = await r.json().catch(() => ({}));
    if (!r.ok) throw new Errore(`Fatture in Cloud: ${doc?.error?.message ?? r.status}`, 502);
  }
  const numero = String(doc.data.number ?? '') + (doc.data.numeration ?? '');
  await chiama(`/issued_documents/${docId}/e_invoice/send`, { data: {} });
  // copia del PDF nello storage, così il cliente lo scarica dal portale (documenti/fatture/<azienda>/<id>.pdf)
  let pdf: string | null = null;
  if (doc.data.url) {
    try {
      const r = await fetch(doc.data.url);
      if (r.ok) { pdf = `fatture/${f.azienda}/${f.id}.pdf`; await sv.carica('documenti', pdf, new Uint8Array(await r.arrayBuffer()), 'application/pdf'); }
    } catch { pdf = null; }  // la fattura è comunque inviata: il PDF si può ricaricare a mano
  }
  await sv.patch(`fatture?id=eq.${f.id}`, { numero: f.numero ?? numero, data: doc.data.date, sdi_inviata_il: new Date().toISOString(), ...(pdf ? { pdf } : {}) });
  return { numero };
}
