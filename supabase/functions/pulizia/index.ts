// Pianificata (ogni notte): cancella posizioni del satellitare e foto delle telecamere più vecchie del tempo scelto
// dalla Direzione (impostazioni → conservazione; vuoto = non si cancella niente). Le timbrature non si toccano.
import { servi, soloCron, dbServizio } from '../_comune/mod.ts';

servi(async (req) => {
  soloCron(req);
  const db = dbServizio();
  const [imp] = await db.get<{ valore: { posizioni_mesi: number | null; foto_giorni: number | null } }>('impostazioni?select=valore&chiave=eq.conservazione');
  const c = imp?.valore ?? { posizioni_mesi: null, foto_giorni: null };
  const fatto: Record<string, number> = { posizioni: 0, foto: 0, avvisi: 0 };
  if (c.posizioni_mesi) {
    const prima = new Date(); prima.setMonth(prima.getMonth() - c.posizioni_mesi);
    await db.del(`sat_posizioni?quando=lt.${encodeURIComponent(prima.toISOString())}`);
    fatto.posizioni = 1;
  }
  if (c.foto_giorni) {
    const prima = encodeURIComponent(new Date(Date.now() - c.foto_giorni * 86400000).toISOString());
    for (let giro = 0; giro < 20; giro++) {   // a pacchi, per non fermarsi a metà con troppi file
      const foto = await db.get<{ id: string; foto: string }>(`cam_foto?select=id,foto&quando=lt.${prima}&limit=500`);
      if (!foto.length) break;
      await db.togli('telecamere', foto.map((f) => f.foto));
      await db.del(`cam_foto?id=in.(${foto.map((f) => f.id).join(',')})`);
      fatto.foto += foto.length;
    }
    for (let giro = 0; giro < 20; giro++) {
      const av = await db.get<{ id: string; foto: string | null }>(`cam_avvisi?select=id,foto&quando=lt.${prima}&limit=500`);
      if (!av.length) break;
      await db.togli('telecamere', av.map((a) => a.foto).filter((x): x is string => !!x));
      await db.del(`cam_avvisi?id=in.(${av.map((a) => a.id).join(',')})`);
      fatto.avvisi += av.length;
    }
  }
  return { ok: true, ...fatto };
});
