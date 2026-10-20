// Fatturazione → Fatture in Cloud (API v2), che la manda allo SdI.
// La fattura deve essere «Pronta» (approvata qui da chi preme Invia) o già «Inviata» senza numero.
import { servi, chiChiama, dbServizio, segreto, Errore, enc } from '../_comune/mod.ts';

const FIC = 'https://api-v2.fattureincloud.it';

servi(async (req, c) => {
  const { db } = await chiChiama(req, ['amministrazione']);
  const [f] = await db.get(`fatture?select=*,clienti(nome,piva,email,indirizzo),righe_fattura(voce,quantita,prezzo,bolla_id)&id=eq.${enc(c.fattura_id)}`);
  if (!f) throw new Errore('Fattura non trovata', 404);
  if (f.fic_id) return { numero: f.numero, gia_inviata: true };
  if (!['Pronta', 'Inviata'].includes(f.stato)) throw new Errore(`Fattura «${f.stato}»: si invia solo quando è Pronta`);
  if (!f.righe_fattura?.length) throw new Errore('La fattura non ha righe');
  if (!f.clienti?.piva) throw new Errore('Manca la partita IVA del cliente: aggiungila nella scheda Clienti');

  // approvazione: il passaggio a «Inviata» lo fa chi chiama, così resta il suo nome (regole del database)
  if (f.stato === 'Pronta') await db.patch(`fatture?id=eq.${f.id}`, { stato: 'Inviata' });

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
  const doc = await chiama('/issued_documents', { data: {
    type: 'invoice', e_invoice: true,
    entity: { name: f.clienti.nome, vat_number: f.clienti.piva, email: f.clienti.email ?? undefined, address_street: f.clienti.indirizzo ?? undefined, country: 'Italia' },
    date: new Date().toISOString().slice(0, 10),
    subject: f.periodo ? `Servizi ${f.periodo}` : undefined,
    items_list: f.righe_fattura.map((r: any) => ({ name: r.voce, qty: Number(r.quantita), net_price: Number(r.prezzo), vat: { id: iva } })),
  } });
  const docId = doc.data.id, numero = String(doc.data.number ?? '') + (doc.data.numeration ?? '');
  await chiama(`/issued_documents/${docId}/e_invoice/send`, { data: {} });
  // copia del PDF nello storage, così il cliente lo scarica dal portale (documenti/fatture/<id>.pdf)
  let pdf: string | null = null;
  if (doc.data.url) {
    try {
      const r = await fetch(doc.data.url);
      if (r.ok) { pdf = `fatture/${f.id}.pdf`; await dbServizio().carica('documenti', pdf, new Uint8Array(await r.arrayBuffer()), 'application/pdf'); }
    } catch { pdf = null; }  // la fattura è comunque inviata: il PDF si può ricaricare a mano
  }
  await dbServizio().patch(`fatture?id=eq.${f.id}`, { fic_id: String(docId), numero, data: doc.data.date, ...(pdf ? { pdf } : {}) });
  return { numero };
});
