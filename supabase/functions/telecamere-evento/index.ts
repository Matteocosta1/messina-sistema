// Il computer in capannone (vicino al registratore delle telecamere) parla con il sistema solo da qui.
// Si presenta con l'header x-telecamere-chiave (segreto TELECAMERE_CHIAVE). I video restano in capannone:
// qui arrivano solo l'elenco delle telecamere, gli avvisi (con foto) e le foto delle scansioni del magazzino.
//  · { azione: 'richieste' }                               → scansioni che aspettano la foto (con «dove», per scegliere la telecamera)
//  · { azione: 'foto', storico_id, telecamera, jpeg }      → foto della scansione, collegata al movimento
//  · { azione: 'avviso', telecamera, tipo, descrizione, grave?, jpeg? } → avviso (es. persona nel piazzale di notte)
//  · { azione: 'stato', telecamere: [{ nome, zona?, jpeg? }] }        → elenco e ultima immagine di ogni telecamera
import { servi, dbServizio, segreto, uguali, Errore } from '../_comune/mod.ts';

const MAX_FOTO = 1_500_000;   // byte: le foto vanno ridotte in capannone prima di mandarle

servi(async (req, c) => {
  if (!uguali(req.headers.get('x-telecamere-chiave') ?? '', segreto('TELECAMERE_CHIAVE'))) throw new Errore('Chiave delle telecamere non valida', 403);
  const db = dbServizio();
  const foto = (b64: unknown) => {
    if (typeof b64 !== 'string' || !b64) return null;
    const bin = Uint8Array.from(atob(b64), (x) => x.charCodeAt(0));
    if (bin.length > MAX_FOTO) throw new Errore('Foto troppo grande: riducila prima di mandarla');
    if (bin[0] !== 0xff || bin[1] !== 0xd8) throw new Errore('La foto deve essere un JPEG');
    return bin;
  };
  const telecamera = async (nome: unknown) => {
    if (typeof nome !== 'string' || !nome.trim()) return null;
    const [t] = await db.get(`telecamere?select=id&nome=eq.${encodeURIComponent(nome.trim())}`);
    return t?.id ?? null;
  };
  if (c.azione === 'richieste') {
    return await db.get('cam_richieste?select=storico_id,quando,dove&fatta_il=is.null&order=quando&limit=50');
  }
  if (c.azione === 'foto') {
    const id = Number(c.storico_id); if (!Number.isInteger(id)) throw new Errore('storico_id mancante');
    const bin = foto(c.jpeg); if (!bin) throw new Errore('Foto mancante');
    const percorso = `scansioni/${id}.jpg`;
    await db.carica('telecamere', percorso, bin, 'image/jpeg');
    await db.post('cam_foto?on_conflict=storico_id', [{ storico_id: id, telecamera_id: await telecamera(c.telecamera), foto: percorso }], 'resolution=merge-duplicates,return=minimal');
    await db.patch(`cam_richieste?storico_id=eq.${id}`, { fatta_il: new Date().toISOString() });
    return { ok: true };
  }
  if (c.azione === 'avviso') {
    const tipo = String(c.tipo ?? '').slice(0, 40), descrizione = String(c.descrizione ?? '').slice(0, 300);
    if (!tipo || !descrizione) throw new Errore('Servono tipo e descrizione');
    const bin = foto(c.jpeg), percorso = bin ? `avvisi/${Date.now()}.jpg` : null;
    if (bin && percorso) await db.carica('telecamere', percorso, bin, 'image/jpeg');
    await db.post('cam_avvisi', [{ telecamera_id: await telecamera(c.telecamera), tipo, descrizione, foto: percorso, grave: c.grave !== false }], 'return=minimal');
    return { ok: true };
  }
  if (c.azione === 'stato') {
    const lista = Array.isArray(c.telecamere) ? c.telecamere.slice(0, 64) : [];
    for (const t of lista) {
      const nome = String(t.nome ?? '').trim().slice(0, 60); if (!nome) continue;
      const bin = foto(t.jpeg), percorso = bin ? `dal-vivo/${encodeURIComponent(nome)}.jpg` : undefined;
      if (bin && percorso) await db.carica('telecamere', percorso, bin, 'image/jpeg');
      await db.post('telecamere?on_conflict=nome', [{ nome, zona: t.zona ?? null, ultimo_contatto: new Date().toISOString(), ...(percorso ? { ultima_foto: percorso } : {}) }], 'resolution=merge-duplicates,return=minimal');
    }
    return { ok: true, telecamere: lista.length };
  }
  throw new Errore('Azione sconosciuta');
});
