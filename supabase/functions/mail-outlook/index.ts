// Posta Outlook (Microsoft 365) dentro i gestionali.
//  · rispondi / scrivi: chi è in ufficio manda la mail dalla casella aziendale
//  · sincronizza (pianificata): porta le mail nuove nella tabella mail e chiede a Claude etichetta, cartella e bozza
import { servi, chiChiama, dbServizio, soloCron, graph, casella, claudeJson, Errore, enc } from '../_comune/mod.ts';

servi(async (req, c) => {
  if (c.azione === 'sincronizza') { soloCron(req); return await sincronizza(); }
  const { io, db } = await chiChiama(req, ['bolle', 'traffico', 'commerciale', 'amministrazione', 'vendite', 'stage']);
  const testo = String(c.testo ?? '').trim();
  if (!testo) throw new Errore('Scrivi il testo della mail');

  if (c.azione === 'rispondi') {
    const [m] = await db.get(`mail?select=id,azienda,graph_id,da_indirizzo,oggetto&id=eq.${enc(c.mail_id)}`);
    if (!m) throw new Errore('Mail non trovata', 404);
    const [u] = await db.post('mail_uscita', { azienda: m.azienda, risposta_a: m.id, a: m.da_indirizzo, oggetto: 'Re: ' + (m.oggetto ?? ''), testo });
    try {
      if (m.graph_id) await graph(`/users/${enc(casella(m.azienda))}/messages/${enc(m.graph_id)}/reply`, { method: 'POST', body: JSON.stringify({ comment: testo }) });
      else await invia(m.azienda, m.da_indirizzo, 'Re: ' + (m.oggetto ?? ''), testo);
      await dbServizio().patch(`mail_uscita?id=eq.${u.id}`, { inviata_il: new Date().toISOString() });
      await dbServizio().patch(`mail?id=eq.${m.id}`, { stato: 'Risposta' });
    } catch (e) { await dbServizio().patch(`mail_uscita?id=eq.${u.id}`, { errore: (e as Error).message }); throw e; }
    return { ok: true };
  }

  if (c.azione === 'scrivi') {
    if (c.azienda !== io.azienda && io.ruolo !== 'direzione') throw new Errore('Casella di un’altra società', 403);
    const a = String(c.a ?? '').trim(), oggetto = String(c.oggetto ?? '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)) throw new Errore('Indirizzo non valido');
    if (!oggetto) throw new Errore('Manca l’oggetto');
    const [u] = await db.post('mail_uscita', { azienda: c.azienda, a, oggetto, testo });
    try { await invia(c.azienda, a, oggetto, testo); await dbServizio().patch(`mail_uscita?id=eq.${u.id}`, { inviata_il: new Date().toISOString() }); }
    catch (e) { await dbServizio().patch(`mail_uscita?id=eq.${u.id}`, { errore: (e as Error).message }); throw e; }
    return { ok: true };
  }
  throw new Errore('Azione sconosciuta');
});

async function invia(azienda: string, a: string, oggetto: string, testo: string) {
  await graph(`/users/${enc(casella(azienda))}/sendMail`, { method: 'POST', body: JSON.stringify({
    message: { subject: oggetto, body: { contentType: 'Text', content: testo }, toRecipients: [{ emailAddress: { address: a } }] }, saveToSentItems: true }) });
}

const CARTELLE = { trasporti: ['Ordini', 'Clienti', 'In arrivo'], corporation: ['Vendite', 'Stage', 'Lotti', 'In arrivo'] };
const ETICHETTE = { trasporti: ['Ordine', 'Preventivo', 'Mezzi', 'Amministrazione', 'Altro'], corporation: ['Vendite', 'Stage', 'Lotti', 'Amministrazione', 'Altro'] };

async function sincronizza() {
  const db = dbServizio(); let nuove = 0;
  for (const azienda of ['trasporti', 'corporation'] as const) {
    let box: string; try { box = casella(azienda); } catch { continue; }  // casella non ancora configurata
    const [ultima] = await db.get(`mail?select=ricevuta_il&azienda=eq.${azienda}&graph_id=not.is.null&order=ricevuta_il.desc&limit=1`);
    const da = ultima?.ricevuta_il ?? new Date(Date.now() - 2 * 86400000).toISOString();
    const r = await graph(`/users/${enc(box)}/mailFolders/inbox/messages?$filter=receivedDateTime gt ${da}&$orderby=receivedDateTime asc&$top=50&$select=id,subject,from,receivedDateTime,bodyPreview,body,hasAttachments`,
      { headers: { Prefer: 'outlook.body-content-type="text"' } });
    for (const m of r.value ?? []) {
      const testo = String(m.body?.content ?? '').slice(0, 20000);
      let analisi = { etichetta: 'Altro', cartella: 'In arrivo', bozza: '' };
      try {
        analisi = await claudeJson(
          `Sei l'assistente della posta di Messina ${azienda === 'trasporti' ? 'Autotrasporti (trasporti e magazzino)' : 'Corporation (PC e telefoni ricondizionati)'}. Classifica la mail e prepara una breve bozza di risposta in italiano, cortese, che un collega controllerà prima di inviarla. Non inventare dati che non ci sono.`,
          [{ type: 'text', text: `Da: ${m.from?.emailAddress?.name} <${m.from?.emailAddress?.address}>\nOggetto: ${m.subject}\n\n${testo}` }],
          { type: 'object', required: ['etichetta', 'cartella', 'bozza'], properties: {
            etichetta: { type: 'string', enum: ETICHETTE[azienda] }, cartella: { type: 'string', enum: CARTELLE[azienda] }, bozza: { type: 'string' } } });
      } catch (e) { console.error('classificazione non riuscita', (e as Error).message); }
      const allegati: { nome: string; percorso: string }[] = [];
      if (m.hasAttachments) {
        const a = await graph(`/users/${enc(box)}/messages/${enc(m.id)}/attachments`);
        for (const x of a.value ?? []) {
          if (x['@odata.type'] !== '#microsoft.graph.fileAttachment' || !x.contentBytes) continue;
          const nome = String(x.name).replace(/[^\w.\- ]+/g, '_');
          const percorso = `mail/${azienda}/${crypto.randomUUID()}/${nome}`;
          await db.carica('documenti', percorso, Uint8Array.from(atob(x.contentBytes), (ch) => ch.charCodeAt(0)), x.contentType ?? 'application/octet-stream');
          allegati.push({ nome: x.name, percorso });
        }
      }
      await db.post('mail?on_conflict=graph_id', [{ azienda, graph_id: m.id, casella: box, cartella: analisi.cartella, etichetta: analisi.etichetta,
        da_nome: m.from?.emailAddress?.name, da_indirizzo: m.from?.emailAddress?.address, oggetto: m.subject, testo, anteprima: m.bodyPreview?.slice(0, 140),
        allegati, ricevuta_il: m.receivedDateTime, bozza: analisi.bozza }], 'resolution=ignore-duplicates,return=minimal');
      nuove++;
    }
  }
  return { nuove };
}
