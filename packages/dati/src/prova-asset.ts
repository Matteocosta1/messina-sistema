// Prova: asset per cliente (UniCredit tramite Econocom). Stessa logica della migrazione 20261022000700:
// ogni IMEI sparato nel contenuto di un bancale di un cliente con «traccia_asset» diventa un asset; abbinamento a cespite e utente;
// uscita con la bolla (o con il bancale); il cliente vede tutto nel portale e ha il file del giorno.
import { estendiProva } from './prova';

type R = Record<string, any>;
const ora = () => new Date().toISOString();
const oreFa = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
const giorno = (gg: number) => { const d = new Date(); d.setDate(d.getDate() + gg); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const TESTA = 'IMEI;Marca;Modello;Cespite;Utente;Sede;Accessori;Stato;Bancale;Bolla;Entrato;Spedito';

estendiProva(({ t, rpc, rel, viste, filtri }) => {
  const prof = (u: string | null) => t.profili.find((p) => p.id === u);
  const staff = (u: string | null) => { const p = prof(u); return p?.azienda === 'trasporti' && ['magazzino', 'traffico', 'bolle', 'amministrazione', 'commerciale', 'commercialista', 'direzione'].includes(p.ruolo); };
  const opera = (u: string | null) => { const p = prof(u); if (!(p?.azienda === 'trasporti' && ['magazzino', 'traffico', 'bolle', 'amministrazione', 'direzione'].includes(p.ruolo))) throw new Error('Non autorizzato'); };
  const vede = (cid: string, u: string | null) => { if (staff(u)) return true; const mio = prof(u)?.ruolo === 'cliente' ? prof(u)?.cliente_id : null;
    return !!mio && (cid === mio || t.clienti.find((c) => c.id === cid)?.tramite === mio); };
  const nome = (u: string | null) => prof(u)?.nome ?? null;
  const evento = (a: R, ev: string, dettagli: string, u: string | null = null) =>
    t.asset_eventi.push({ id: t.asset_eventi.length + 1, asset_id: a.id, quando: ora(), chi: u, chi_nome: nome(u), evento: ev, dettagli });
  const codice = (id: string | null) => t.bancali.find((b) => b.id === id)?.codice ?? null;
  const numero = (id: string | null) => t.bolle.find((b) => b.id === id)?.numero ?? null;
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '';
  const csv = (cid: string) => [TESTA, ...t.asset.filter((a) => a.cliente_id === cid).sort((x, y) => x.entrato_il.localeCompare(y.entrato_il))
    .map((a) => [a.imei, a.marca, a.modello, a.cespite, a.utente, a.sede, (a.accessori ?? []).join(','), a.stato, codice(a.bancale_id), numero(a.bolla_id), fmt(a.entrato_il), fmt(a.spedito_il)].map((x) => x ?? '').join(';'))].join('\n');

  // dati: UniCredit traccia gli asset; i 3 iPhone del bancale B-0190 (due già abbinati) e due già spediti
  const uni = t.clienti.find((c) => c.id === 'c-uni'); if (uni) uni.traccia_asset = true;
  const a0 = (imei: string, x: R) => ({ id: 'as-' + imei.slice(-3), cliente_id: 'c-uni', cliente_finale: 'UniCredit', imei, marca: 'Apple', modello: 'iPhone 13', cespite: null, utente: null, sede: null,
    accessori: [], stato: 'In magazzino', bancale_id: 'k-uni', bolla_id: null, entrato_il: oreFa(70), abbinato_il: null, spedito_il: null, rientrato_il: null, ...x });
  t.asset = [
    a0('35XXXXXXXXXX101', { cespite: '40001101', utente: 'Mario Rossi', sede: 'Via [indirizzo], Milano', accessori: ['Caricabatterie', 'Cover'], stato: 'Abbinato', abbinato_il: oreFa(20) }),
    a0('35XXXXXXXXXX102', { cespite: '40001102', utente: 'Anna Bianchi', sede: 'Via [indirizzo], Milano', stato: 'Abbinato', abbinato_il: oreFa(20) }),
    a0('35XXXXXXXXXX103', {}),
    a0('35XXXXXXXXXX098', { cespite: '40001098', utente: 'Luca Verdi', sede: 'Via [indirizzo], Torino', stato: 'Spedito', bancale_id: null, bolla_id: 'b-p03', abbinato_il: oreFa(50), spedito_il: oreFa(26) }),
    a0('35XXXXXXXXXX099', { cespite: '40001099', utente: 'Sara Neri', sede: 'Via [indirizzo], Torino', accessori: ['Cavetto'], stato: 'Spedito', bancale_id: null, bolla_id: 'b-p03', abbinato_il: oreFa(50), spedito_il: oreFa(26) }),
  ];
  t.asset_eventi = [];
  for (const a of t.asset) {
    t.asset_eventi.push({ id: t.asset_eventi.length + 1, asset_id: a.id, quando: a.entrato_il, chi: 'u-mag', chi_nome: 'Magazziniere 1', evento: 'Entrata', dettagli: 'Bancale B-0190' });
    if (a.abbinato_il) t.asset_eventi.push({ id: t.asset_eventi.length + 1, asset_id: a.id, quando: a.abbinato_il, chi: 'u-bol', chi_nome: 'Gabriele', evento: 'Abbinato', dettagli: `Cespite ${a.cespite} · ${a.utente}` });
    if (a.spedito_il) t.asset_eventi.push({ id: t.asset_eventi.length + 1, asset_id: a.id, quando: a.spedito_il, chi: 'u-mag', chi_nome: 'Magazziniere 1', evento: 'Spedito', dettagli: `Bolla ${numero(a.bolla_id)} · ${a.utente}` });
  }
  t.asset_file = [1, 2, 3].map((gg) => ({ cliente_id: 'c-uni', giorno: giorno(-gg), righe: t.asset.length, csv: csv('c-uni'), creato_il: oreFa(24 * gg) }));
  rel.asset = { clienti: 'cliente_id', bancali: 'bancale_id', bolle: 'bolla_id' };
  rel.asset_eventi = { profili: 'chi' };
  filtri.asset = (r, _t, u) => vede(r.cliente_id, u);
  filtri.asset_file = (r, _t, u) => vede(r.cliente_id, u);
  filtri.asset_eventi = (r, _t, u) => { const a = t.asset.find((x) => x.id === r.asset_id); return !!a && vede(a.cliente_id, u); };

  // come i trigger: contenuto sparato → asset; bancale uscito → asset spediti
  viste.push((tt) => {
    for (const c of tt.contenuto) {
      const b = tt.bancali.find((x) => x.id === c.bancale_id); if (!b || b.uscito_il || !tt.clienti.find((x) => x.id === b.cliente_id)?.traccia_asset) continue;
      for (const imei of c.codici ?? []) {
        const a = tt.asset.find((x) => x.imei === imei);
        if (!a) { const n: R = { id: crypto.randomUUID(), cliente_id: b.cliente_id, cliente_finale: null, imei, marca: null, modello: c.articolo, cespite: null, utente: null, sede: null, accessori: [], stato: 'In magazzino',
          bancale_id: b.id, bolla_id: null, entrato_il: ora(), abbinato_il: null, spedito_il: null, rientrato_il: null }; tt.asset.push(n); evento(n, 'Entrata', 'Bancale ' + b.codice, c.da ?? null); }
        else if (a.stato === 'Spedito') { Object.assign(a, { stato: 'Rientrato', rientrato_il: ora(), bancale_id: b.id }); evento(a, 'Rientrato', 'Bancale ' + b.codice); }
        else if (a.bancale_id !== b.id) { a.bancale_id = b.id; evento(a, 'Spostato', 'Bancale ' + b.codice); }
      }
    }
    for (const a of tt.asset) {
      const b = tt.bancali.find((x) => x.id === a.bancale_id);
      if (b?.uscito_il && ['In magazzino', 'Abbinato', 'Rientrato'].includes(a.stato)) {
        Object.assign(a, { stato: 'Spedito', spedito_il: b.uscito_il, bolla_id: b.bolla_uscita_id ?? null });
        evento(a, 'Spedito', `Con il bancale ${b.codice}${numero(b.bolla_uscita_id) ? ' · bolla ' + numero(b.bolla_uscita_id) : ''}`);
      }
    }
    for (const e of tt.asset_eventi) e.profili ??= e.chi_nome ? { nome: e.chi_nome } : null;
  });

  rpc.abbina_asset = (x, tt, u) => {
    opera(u);
    const righe = (x.p_righe ?? []) as R[]; if (!righe.length) throw new Error('Nessuna riga da abbinare');
    const err: string[] = [];
    for (const r of righe) {
      const imei = String(r.imei ?? '').trim(), cesp = String(r.cespite ?? '').trim(); const a = tt.asset.find((y) => y.imei === imei);
      if (!a) err.push(`IMEI ${imei || '—'} non è in magazzino`);
      else if (a.stato === 'Spedito') err.push(`IMEI ${imei} è già spedito`);
      else if (!cesp || !String(r.utente ?? '').trim()) err.push(`IMEI ${imei}: mancano cespite o utente`);
      else if (tt.asset.some((y) => y.cespite === cesp && y.id !== a.id)) err.push(`cespite ${cesp} già usato`);
    }
    if (new Set(righe.map((r) => String(r.cespite ?? '').trim())).size !== righe.length) err.push('lo stesso cespite è scritto due volte');
    if (err.length) throw new Error('Niente abbinato: ' + err.slice(0, 5).join('; ') + (err.length > 5 ? ` e altri ${err.length - 5}` : ''));
    for (const r of righe) {
      const a = tt.asset.find((y) => y.imei === String(r.imei).trim())!;
      Object.assign(a, { cespite: String(r.cespite).trim(), utente: String(r.utente).trim(), sede: String(r.sede ?? '').trim() || null, accessori: r.accessori ?? [],
        cliente_finale: r.cliente_finale || a.cliente_finale, stato: a.stato === 'Rientrato' ? 'Rientrato' : 'Abbinato', abbinato_il: ora() });
      evento(a, 'Abbinato', `Cespite ${a.cespite} · ${a.utente}`, u);
    }
    return righe.length;
  };
  rpc.spedisci_asset = (x, tt, u) => {
    const p = prof(u); if (!(p?.azienda === 'trasporti' && ['magazzino', 'traffico', 'bolle', 'direzione'].includes(p.ruolo))) throw new Error('Non autorizzato');
    const bo = tt.bolle.find((b) => b.numero === String(x.p_bolla ?? '').trim()); if (!bo) throw new Error(`Bolla ${x.p_bolla} non trovata`);
    if (!['Nuova', 'Confermata', 'In giro'].includes(bo.stato)) throw new Error(`La bolla ${bo.numero} è «${bo.stato}»: serve una bolla aperta`);
    const imei = (x.p_imei ?? []) as string[]; if (!imei.length) throw new Error('Scegli i telefoni da spedire');
    const err: string[] = [];
    for (const i of imei) { const a = tt.asset.find((y) => y.imei === i);
      if (!a) err.push(`IMEI ${i} sconosciuto`); else if (!['Abbinato', 'Rientrato'].includes(a.stato) || !a.cespite) err.push(`IMEI ${i} non è abbinato a cespite e utente`);
      else if (a.cliente_id !== bo.cliente_id) err.push(`IMEI ${i} è di un altro cliente`); }
    if (err.length) throw new Error('Niente spedito: ' + err.slice(0, 5).join('; '));
    for (const i of imei) {
      const a = tt.asset.find((y) => y.imei === i)!;
      const c = tt.contenuto.find((k) => k.bancale_id === a.bancale_id && (k.codici ?? []).includes(i));
      if (c) { c.codici = c.codici.filter((k: string) => k !== i); c.quantita = Math.max(0, c.quantita - 1); }
      Object.assign(a, { stato: 'Spedito', spedito_il: ora(), bolla_id: bo.id });
      evento(a, 'Spedito', `Bolla ${bo.numero}${a.utente ? ' · ' + a.utente : ''}`, u);
    }
    return imei.length;
  };
  rpc.asset_csv = (x, _tt, u) => vede(x.p_cliente, u) ? csv(x.p_cliente) : TESTA + '\n';
});
