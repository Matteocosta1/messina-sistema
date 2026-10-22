import React from 'react';
import { Pill } from '@messina/ui';
import { useApp, useDati, giornoCorto } from '../core';

/** «Cerca» in alto: bolle, clienti, mezzi, persone e asset (IMEI, cespite, utente) */
export function Ricerca({ testo, chiudi }: { testo: string; chiudi: () => void }) {
  const { vai } = useApp();
  const q = testo.trim();
  const { dati } = useDati(async (d) => {
    if (q.length < 2) return [];
    const p = `%${q}%`;
    const [numero, dest, clienti, mezzi, persone, imei, cespite, utente] = await Promise.all([
      d.from<any>('bolle').select('id,numero,destinatario,citta,data_consegna,stato,clienti(nome)').ilike('numero', p).limit(10),
      d.from<any>('bolle').select('id,numero,destinatario,citta,data_consegna,stato,clienti(nome)').ilike('destinatario', p).limit(10),
      d.from<any>('clienti').select('id,nome,cosa_spedisce').eq('azienda', 'trasporti').ilike('nome', p).limit(10),
      d.from<any>('mezzi').select('id,targa,tipo').ilike('targa', p).limit(10),
      d.from<any>('dipendenti').select('id,nome,mansione').eq('azienda', 'trasporti').ilike('nome', p).limit(10),
      ...(['imei', 'cespite', 'utente'] as const).map((c) => d.from<any>('asset').select('id,imei,cespite,utente,stato,clienti(nome)').ilike(c, p).limit(10).then((r) => r, () => [] as any[])),
    ]);
    const asset = [...imei, ...cespite, ...utente].filter((a, i, x) => x.findIndex((y) => y.id === a.id) === i);
    const bolle = [...numero, ...dest.filter((b) => !numero.some((n) => n.id === b.id))];
    return [
      ...clienti.map((c) => ({ k: 'c' + c.id, t: c.nome, s: c.cosa_spedisce ?? '', p: 'Cliente', vai: 'clienti/' + c.id })),
      ...bolle.map((b) => ({ k: 'b' + b.id, t: `${b.clienti?.nome} · ${b.destinatario ?? ''} ${b.citta ?? ''}`, s: `Bolla ${b.numero ?? 'da confermare'} · ${giornoCorto(b.data_consegna)} · ${b.stato}`, p: 'Bolla', vai: b.stato === 'Nuova' ? 'bolle/' + b.id : 'magazzino/controllo' })),
      ...mezzi.map((m) => ({ k: 'm' + m.id, t: m.targa, s: m.tipo, p: 'Mezzo', vai: 'mezzi' })),
      ...asset.map((a) => ({ k: 'a' + a.id, t: `${a.imei}${a.utente ? ' · ' + a.utente : ''}`, s: `${a.clienti?.nome ?? ''}${a.cespite ? ' · cespite ' + a.cespite : ''} · ${a.stato}`, p: 'Asset', vai: 'magazzino/asset:' + a.imei })),
      ...persone.map((x) => ({ k: 'p' + x.id, t: x.nome, s: x.mansione, p: x.mansione === 'Autista' ? 'Autista' : 'Persona', vai: x.mansione === 'Autista' ? 'autisti' : 'presenze' })),
    ];
  }, [q]);
  return (
    <div className="glass" style={{ padding: 8 }}><div className="list">
      {q.length < 2 ? <div className="lbl" style={{ padding: 14 }}>Scrivi almeno due lettere.</div>
        : !dati ? null : dati.length ? dati.map((r) => (
          <button key={r.k} type="button" className="li" onClick={() => { chiudi(); vai(r.vai); }}>
            <span className="row between" style={{ width: '100%' }}><b>{r.t}</b><Pill>{r.p}</Pill></span><span className="lbl">{r.s}</span>
          </button>)) : <div className="lbl" style={{ padding: 14 }}>Nessun risultato.</div>}
    </div></div>
  );
}
