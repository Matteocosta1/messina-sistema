// Fatturazione → Fatture in Cloud (API v2), che la manda allo SdI.
//  · { fattura_id }: invia una fattura (o nota di credito) «Pronta». Diventa «Inviata» SOLO dopo la risposta
//    positiva di Fatture in Cloud: la scrive questa funzione con la chiave di servizio, non chi preme il tasto.
//  · { azione: 'esiti' }: legge l'esito dello SdI delle fatture inviate; se lo SdI la scarta torna «Da controllare».
// IVA: un id di aliquota per azienda e per tipo (FIC_IVA_ID_<AZIENDA>_<22|10|N3_1|MARGINE…>), oppure FIC_IVA_ID per il 22%.
import { servi, chiChiama, dbServizio, segreto, soloCron, Errore, enc } from '../_comune/mod.ts';

const FIC = 'https://api-v2.fattureincloud.it';
const SCARTATA = ['discarded', 'rejected', 'error'];
const ESITO: Record<string, string> = {
  sent: 'Inviata allo SdI', pending: 'In attesa dello SdI', processing: 'In attesa dello SdI',
  delivered: 'Consegnata', not_delivered: 'Non consegnata: il cliente la trova nel suo cassetto fiscale', accepted: 'Accettata',
  discarded: 'Scartata', rejected: 'Rifiutata', error: 'Errore', no_response: 'Nessuna risposta dal cliente',
};

servi(async (req, c) => {
  // pianificata (ogni ora): esiti dello SdI per le due aziende
  if (c.azione === 'esiti' && req.headers.get('x-cron-segreto')) {
    soloCron(req);
    const r: Record<string, unknown> = {};
    for (const a of ['trasporti', 'corporation']) { try { r[a] = await esiti(a); } catch (e) { r[a] = String((e as Error).message); } }
    return r;
  }
  const { io, db } = await chiChiama(req, ['amministrazione']);
  if (c.azione === 'esiti') return await esiti(io.azienda);
  const [f] = await db.get(`fatture?select=*,clienti(nome,piva,codice_fiscale,email,indirizzo,cap,citta,provincia,codice_destinatario,pec),righe_fattura(voce,quantita,prezzo,iva_aliquota,iva_natura,margine)&id=eq.${enc(c.fattura_id)}`);
  if (!f) throw new Errore('Fattura non trovata', 404);
  if (f.sdi_inviata_il && f.stato !== 'Pronta') return { numero: f.numero, gia_inviata: true };
  if (f.stato !== 'Pronta') throw new Errore(`Fattura «${f.stato}»: si invia solo quando è Pronta`);
  if (!f.righe_fattura?.length) throw new Errore('La fattura non ha righe');
  const manca = await db.rpc<string[]>('anagrafica_mancante', { p_cliente: f.cliente_id });
  if (manca?.length) throw new Errore(`Nella scheda del cliente manca: ${manca.join(', ')}`);

  // blocco: una sola richiesta alla volta per fattura (doppio clic o due persone insieme → una sola fattura allo SdI)
  const sv = dbServizio();
  const presa = await sv.patch(`fatture?id=eq.${f.id}&stato=eq.Pronta&or=(fic_in_corso.is.null,fic_in_corso.lt.${enc(new Date(Date.now() - 10 * 60000).toISOString())})`,
    { fic_in_corso: new Date().toISOString() });
  if (!presa.length) throw new Errore('Invio di questa fattura già in corso', 409);
  try {
    const numero = await invia(f, sv);
    // solo adesso: Fatture in Cloud ha preso la fattura e l'ha mandata allo SdI
    await sv.patch(`fatture?id=eq.${f.id}`, { stato: 'Inviata', approvata_da: io.id, sdi_esito: 'Inviata allo SdI', sdi_esito_il: new Date().toISOString() });
    return { numero };
  } finally {
    await sv.patch(`fatture?id=eq.${f.id}`, { fic_in_corso: null });
  }
});

function conto(azienda: string) {
  const A = azienda === 'corporation' ? 'CORPORATION' : 'TRASPORTI';
  return {
    A,
    company: Deno.env.get(`FIC_COMPANY_ID_${A}`) ?? segreto('FIC_COMPANY_ID'),
    token: Deno.env.get(`FIC_ACCESS_TOKEN_${A}`) ?? segreto('FIC_ACCESS_TOKEN'),
  };
}

/** id dell'aliquota su Fatture in Cloud per una riga: 22, 10, 4… oppure la natura (N3_1) oppure MARGINE */
function ivaId(A: string, r: any): number {
  const k = r.margine ? 'MARGINE' : r.iva_natura ? String(r.iva_natura).replace(/\./g, '_') : String(Number(r.iva_aliquota ?? 22));
  const v = Deno.env.get(`FIC_IVA_ID_${A}_${k}`) ?? (k === '22' ? Deno.env.get(`FIC_IVA_ID_${A}`) ?? Deno.env.get('FIC_IVA_ID') : undefined);
  if (!v) throw new Errore(`Manca in Fatture in Cloud l'aliquota «${k.replace('_', '.')}»: chiedere a chi gestisce il sistema di aggiungere FIC_IVA_ID_${A}_${k}`);
  return Number(v);
}

async function invia(f: any, sv: ReturnType<typeof dbServizio>): Promise<string> {
  const { A, company, token } = conto(f.azienda);
  const chiama = async (percorso: string, corpo?: unknown, metodo = 'POST') => {
    const r = await fetch(`${FIC}/c/${company}${percorso}`, corpo === undefined ? { headers: { Authorization: `Bearer ${token}` } }
      : { method: metodo, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Errore(`Fatture in Cloud: ${j?.error?.message ?? r.status}`, 502);
    return j;
  };
  const cl = f.clienti;
  let docId = f.fic_id, doc: any;
  const dati = {
      type: f.tipo === 'Nota di credito' ? 'credit_note' : 'invoice', e_invoice: true,
      entity: {
        name: cl.nome, vat_number: cl.piva ?? undefined, tax_code: cl.codice_fiscale ?? undefined, email: cl.email ?? undefined,
        address_street: cl.indirizzo, address_postal_code: cl.cap, address_city: cl.citta, address_province: String(cl.provincia).toUpperCase(),
        country: 'Italia', ei_code: cl.codice_destinatario ?? undefined, certified_email: cl.pec ?? undefined,
      },
      date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }),   // giorno italiano, aaaa-mm-gg
      use_split_payment: !!f.split_payment,
      ei_data: { payment_method: 'MP05' },
      visible_subject: f.tipo === 'Nota di credito' ? `Nota di credito${f.motivo ? ': ' + f.motivo : ''}` : f.periodo ? `Servizi ${f.periodo}` : undefined,
      items_list: f.righe_fattura.map((r: any) => ({ name: r.voce, qty: Number(r.quantita), net_price: Number(r.prezzo), vat: { id: ivaId(A, r) } })),
  };
  if (!docId) {
    doc = await chiama('/issued_documents', { data: dati });
    docId = String(doc.data.id);
    await sv.patch(`fatture?id=eq.${f.id}`, { fic_id: docId });   // subito: se l'invio sotto fallisce, al nuovo tentativo non si ricrea
  } else if (f.sdi_inviata_il) {
    // scartata dallo SdI e corretta: si aggiorna lo stesso documento e si reinvia
    doc = await chiama(`/issued_documents/${docId}`, { data: dati }, 'PUT');
  } else {
    doc = await chiama(`/issued_documents/${docId}`);
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
  return numero;
}

/** esiti dello SdI: si chiede a Fatture in Cloud lo stato di ogni fattura inviata e non ancora chiusa */
async function esiti(azienda: string) {
  const sv = dbServizio();
  const { company, token } = conto(azienda);
  const lista = await sv.get<any>(`fatture?select=id,fic_id,numero&azienda=eq.${azienda}&stato=eq.Inviata&fic_id=not.is.null&or=(sdi_esito.is.null,sdi_esito.in.(${enc('"Inviata allo SdI","In attesa dello SdI"')}))&limit=100`);
  let scartate = 0, aggiornate = 0;
  for (const f of lista) {
    const r = await fetch(`${FIC}/c/${company}/issued_documents/${f.fic_id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) continue;
    const s = String((await r.json())?.data?.ei_status ?? '');
    if (!s || s === 'null') continue;
    const esito = ESITO[s] ?? s;
    if (SCARTATA.includes(s)) {
      scartate++;
      await sv.patch(`fatture?id=eq.${f.id}`, { stato: 'Da controllare', sdi_esito: esito, sdi_esito_il: new Date().toISOString(),
        problema: `${esito} dallo SdI: correggere i dati e reinviare (in Fatture in Cloud c'è il motivo)` });
    } else {
      aggiornate++;
      await sv.patch(`fatture?id=eq.${f.id}`, { sdi_esito: esito, sdi_esito_il: new Date().toISOString() });
    }
  }
  return { controllate: lista.length, aggiornate, scartate };
}
