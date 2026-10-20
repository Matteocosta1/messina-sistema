import React, { useState } from 'react';
import { Btn, Msg, Pill, Warn } from '@messina/ui';
import { MailView, useApp, useAzione, useDati, useStato, giornoLungo, giornoCorto, hm, eur, eur0, domaniISO, oggiISO, Mese, Errore, type Mail } from '../core';

// ------------------------------------------------------------------ Mail
export function MailT() {
  const { db, vai } = useApp();
  const az = useAzione();
  return <MailView azienda="trasporti" cartelle={['In arrivo', 'Ordini', 'Clienti', 'Inviate']} azione={(m: Mail) => ({
    btn: <Btn onClick={() => { if (!m.bolla_id) az.esegui(() => db.fn('crea-bolla', { mail_id: m.id })); }} disabled={az.inCorso}>Crea bolla da questa mail</Btn>,
    msg: <>{m.bolla_id && <Msg azione="Apri in Bolle" onAzione={() => vai('bolle/' + m.bolla_id)}>Bolla creata con i dati della mail: la trovi in Bolle, con i campi già compilati.</Msg>}<Errore testo={az.errore} /></>,
  })} />;
}

/** mail al cliente scritta dal programma, da controllare e inviare */
export function ScriviCliente(p: { a: string | null | undefined; oggetto: string; testo: string; avviso: string; onChiudi: () => void }) {
  const { db } = useApp();
  const az = useAzione();
  const [testo, setTesto] = useState(p.testo);
  const [fatto, setFatto] = useState(false);
  if (fatto) return <Msg>Mail inviata al cliente dalla casella aziendale. La trovi in Mail › Inviate.</Msg>;
  return (<>
    <Msg>{p.avviso}</Msg>
    <div className="stack" style={{ gap: 8 }}>
      <label className="lbl" htmlFor="mail-cliente">A {p.a || '[email del cliente mancante: aggiungila in Clienti]'} · {p.oggetto}</label>
      <textarea id="mail-cliente" value={testo} onChange={(e) => setTesto(e.target.value)} />
      <Errore testo={az.errore} />
      <div className="row"><Btn disabled={!p.a || az.inCorso} onClick={() => az.esegui(() => db.fn('mail-outlook', { azione: 'scrivi', azienda: 'trasporti', a: p.a, oggetto: p.oggetto, testo })).then((ok) => ok && setFatto(true))}>Invia</Btn>
        <Btn ghost onClick={p.onChiudi}>Annulla</Btn></div>
    </div>
  </>);
}

// ------------------------------------------------------------------ Bolle
const CAMPO: Record<string, string> = { 'Indirizzo': 'indirizzo', 'Fascia oraria': 'fascia', 'Fascia': 'fascia', 'Data': 'data_consegna', 'Data di consegna': 'data_consegna', 'Colli': 'colli_previsti', 'Destinatario': 'destinatario', 'Città': 'citta' };
const SEL_BOLLA = '*,clienti(nome,email),operatore:profili!bolle_operatore_id_fkey(nome)';

export function Bolle({ scelta }: { scelta?: string }) {
  const { db, vai } = useApp();
  const [s, set] = useStato({ sel: scelta ?? '', msg: '' });
  const az = useAzione();
  const { dati } = useDati(async (d) => {
    const [nuove, oggi] = await Promise.all([
      d.from<any>('bolle').select(SEL_BOLLA).eq('stato', 'Nuova').order('creata_il', { ascending: false }),
      d.from<any>('bolle').select(SEL_BOLLA).eq('stato', 'Confermata').gte('confermata_il', oggiISO() + 'T00:00:00').order('confermata_il', { ascending: false }),
    ]);
    return { nuove, tutte: [...nuove, ...oggi] };
  }, []);
  const cur = dati ? (dati.tutte.find((b) => b.id === s.sel) ?? dati.tutte[0]) : null;
  const { dati: valore } = useDati((d) => cur ? d.rpc<number>('valore_bolla', { p_bolla: cur.id }) : Promise.resolve(null), [cur?.id, cur?.stato]);
  if (!dati) return null;
  const cosa = (b: any) => `${b.tipo} ${b.colli_previsti ?? '?'} ${b.colli_previsti === 1 ? 'collo' : 'colli'}${b.citta ? ' · ' + b.citta : ''}`;
  const ok = cur?.stato === 'Confermata';
  const manca: string[] = cur?.dati_mancanti ?? [];
  const conferma = () => az.esegui(() => db.from('bolle').update({ stato: 'Confermata' }).eq('id', cur!.id)).then((x) => x && set({ msg: 'ok' }));
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
      <div className="glass" style={{ flex: '1 1 280px', padding: 8, minWidth: 0 }}>
        <div className="row between" style={{ padding: '8px 10px' }}><b>Da confermare</b><span className="lbl">{dati.nuove.length} {dati.nuove.length === 1 ? 'bolla' : 'bolle'}</span></div>
        <div className="lbl" style={{ padding: '0 10px 8px' }}>Divise in automatico tra Christian, Gabriele e Alberto in base al carico; i clienti girano, così tutti sanno gestire tutti. Se uno è assente, il suo lavoro va agli altri.</div>
        <div className="list">
          {dati.tutte.length ? dati.tutte.map((x) => {
            const st = x.stato === 'Confermata' ? <Pill tone="ok">Confermata</Pill> : x.dati_mancanti?.length ? <Pill tone="red">{`Manca ${x.dati_mancanti.length} ${x.dati_mancanti.length === 1 ? 'dato' : 'dati'}`}</Pill> : <Pill tone="dark">Pronta</Pill>;
            return <button key={x.id} type="button" className={'li' + (cur?.id === x.id ? ' on' : '')} onClick={() => set({ sel: x.id, msg: '' })}>
              <span className="row between" style={{ width: '100%' }}><b>{x.clienti?.nome}</b>{st}</span>
              <span className="lbl">{cosa(x)} · {hm(x.creata_il)} · {x.operatore?.nome ?? '—'}</span></button>;
          }) : <div className="lbl" style={{ padding: 14 }}>Nessuna bolla da confermare.</div>}
        </div>
      </div>
      {cur && <div className="glass card stack" style={{ flex: '2 1 420px', minWidth: 0 }}>
        <div className="row between"><h3 style={{ fontSize: 22, letterSpacing: '-.02em' }}>{cur.clienti?.nome} · {cosa(cur)}</h3><span className="lbl">Bolla n. {cur.numero ?? 'alla conferma'}</span></div>
        <div className="kv">
          <div><div className="lbl">Cliente</div><b>{cur.clienti?.nome}</b></div>
          <div><div className="lbl">Data</div><b>{giornoLungo(cur.data_consegna)}</b></div>
          <div><div className="lbl">Fascia</div><b>{cur.fascia ?? 'Da definire'}</b></div>
          <div><div className="lbl">Colli</div><b>{cur.colli_previsti ?? '—'}</b></div>
          <div><div className="lbl">Accessori</div><b>{cur.accessori?.length ? cur.accessori.join(', ') : '—'}</b></div>
          {manca.length > 0 && !ok && <div className="bad"><div className="lbl">Manca</div><b className="miss">{manca.join(' e ')}</b></div>}
        </div>
        {manca.length > 0 && !ok && <Completa bolla={cur} />}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}><div className="lbl">Tariffa applicata dal contratto</div>
          <div>Base del cliente + accessori · totale <b>{valore === null ? '€ —' : eur(valore)}</b></div></div>
        {(s.msg === 'ok' || ok) && <Msg azione="Vai al Traffico" onAzione={() => vai('traffico')}>Bolla confermata: è nei giri di domani e gli accessori sono già sull’app dell’autista. Al cliente parte la mail di conferma.</Msg>}
        {s.msg === 'chiesto' && <ScriviCliente a={cur.clienti?.email} oggetto={`Spedizione del ${giornoLungo(cur.data_consegna)}`} avviso="Mail al cliente pronta, con la domanda sul dato mancante."
          testo={`Buongiorno,\nper organizzare la spedizione ci manca: ${manca.join(', ').toLowerCase()}. Ce lo potete indicare?\nGrazie`} onChiudi={() => set({ msg: '' })} />}
        {!ok && manca.length > 0 && <Warn>Bloccata</Warn>}
        <Errore testo={az.errore} />
        <div className="row">{!ok && <Btn disabled={manca.length > 0 || az.inCorso} onClick={conferma}>Conferma</Btn>}{manca.length > 0 && !ok && <Btn ghost onClick={() => set({ msg: 'chiesto' })}>Chiedi</Btn>}</div>
      </div>}
    </div>
  );
}

/** il dato mancante si scrive qui quando il cliente risponde; poi la bolla si può confermare */
function Completa({ bolla }: { bolla: any }) {
  const { db } = useApp();
  const az = useAzione();
  const [v, setV] = useState<Record<string, string>>({});
  const salva = () => {
    const agg: Record<string, any> = {}; const note: string[] = [];
    for (const [k, x] of Object.entries(v)) { if (!x.trim()) continue; const c = CAMPO[k]; if (c) agg[c] = c === 'colli_previsti' ? Number(x) : x.trim(); else note.push(`${k}: ${x.trim()}`); }
    agg.dati_mancanti = bolla.dati_mancanti.filter((k: string) => !v[k]?.trim());
    if (note.length) agg.note = [bolla.note, ...note].filter(Boolean).join('\n');
    return az.esegui(() => db.from('bolle').update(agg).eq('id', bolla.id)).then((ok) => ok && setV({}));
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {bolla.dati_mancanti.map((k: string) => (
        <label key={k} className="field"><span className="lbl">{k}</span>
          <input className="input" type={CAMPO[k] === 'data_consegna' ? 'date' : CAMPO[k] === 'colli_previsti' ? 'number' : 'text'} value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
      ))}
      <Errore testo={az.errore} />
      <div className="row"><Btn ghost sm disabled={!Object.values(v).some((x) => x.trim()) || az.inCorso} onClick={salva}>Salva</Btn></div>
    </div>
  );
}

// ------------------------------------------------------------------ Traffico
export function Traffico() {
  const { db } = useApp();
  const domani = domaniISO();
  const az = useAzione();
  const [msg, setMsg] = useState('');
  const [trascino, setTrascino] = useState<{ fermata?: string; bolla?: string } | null>(null);
  const { dati } = useDati(async (d) => {
    const [bolle, mezzi, giri] = await Promise.all([
      d.from<any>('bolle').select('id,tipo,citta,colli_previsti,accessori,clienti(nome)').eq('data_consegna', domani).in('stato', ['Confermata', 'In giro']).neq('tipo', 'Magazzino'),
      d.from<any>('mezzi').select('id').eq('stato', 'Attivo'),
      d.from<any>('giri').select('*,mezzi(tipo,sponda,targa),dipendenti(nome),fermate(id,ordine,bolla_id,bolle(citta,tipo,colli_previsti,clienti(nome)))').eq('data', domani),
    ]);
    return { bolle, mezzi, giri };
  }, []);
  if (!dati) return null;
  const assegnate = new Set(dati.giri.flatMap((g) => g.fermate.map((f: any) => f.bolla_id)));
  const libere = dati.bolle.filter((b) => !assegnate.has(b.id));
  const proponi = () => az.esegui(() => db.rpc<number>('proponi_giri', { p_data: domani }).then((n) => setMsg(`Giri proposti: ${n} ${n === 1 ? 'spedizione assegnata' : 'spedizioni assegnate'}. Mauro e Nelson possono cambiare le fermate trascinandole.`)));
  const sposta = (giro: any | null) => {
    if (!trascino) return;
    const ordine = giro ? Math.max(0, ...giro.fermate.map((f: any) => f.ordine)) + 1 : 0;
    if (trascino.fermata && giro) az.esegui(() => db.from('fermate').update({ giro_id: giro.id, ordine }).eq('id', trascino.fermata!));
    else if (trascino.fermata && !giro) az.esegui(() => db.from('fermate').delete().eq('id', trascino.fermata!));
    else if (trascino.bolla && giro) az.esegui(() => db.from('fermate').insert({ giro_id: giro.id, bolla_id: trascino.bolla, ordine }));
    setTrascino(null);
  };
  const dove = (b: any) => `${b.clienti?.nome} · ${b.tipo === 'Ritiro' ? 'ritiro' : b.citta ?? '—'}`;
  const zona = { onDragOver: (e: any) => e.preventDefault() };
  return (<>
    <div className="glass card row between"><span><b>Domani</b> <span className="lbl">{dati.bolle.length} spedizioni · {dati.mezzi.length} mezzi · pronto entro le 18:00</span></span>
      <div className="row"><Btn onClick={proponi} disabled={az.inCorso || !libere.length}>{libere.length || !dati.giri.length ? 'Proponi i giri' : 'Giri proposti'}</Btn></div></div>
    {msg && <Msg>{msg}</Msg>}
    <Errore testo={az.errore} />
    <div className="grid g4">
      {dati.giri.map((g) => {
        const fer = [...g.fermate].sort((a: any, b: any) => a.ordine - b.ordine);
        const colli = fer.reduce((s: number, f: any) => s + (f.bolle?.colli_previsti ?? 0), 0);
        return <div key={g.id} className="glass card" {...zona} onDrop={() => sposta(g)}>
          <div className="row between"><b>{g.mezzi?.tipo}{g.mezzi?.sponda ? ' con sponda' : ''} · {g.dipendenti?.nome}</b><Pill>{g.zona ?? '—'}</Pill></div>
          <ol style={{ margin: '12px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
            {fer.map((f: any) => <li key={f.id} draggable onDragStart={() => setTrascino({ fermata: f.id })} style={{ cursor: 'grab' }}>{dove({ ...f.bolle })}</li>)}
          </ol>
          <div className="lbl" style={{ marginTop: 8 }}>{fer.length} {fer.length === 1 ? 'fermata' : 'fermate'} · {colli} colli</div>
        </div>;
      })}
      <div className="glass card" style={{ borderStyle: 'dashed' }} {...zona} onDrop={() => sposta(null)}><b>Da assegnare</b>
        {libere.length ? <ul style={{ margin: '12px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
          {libere.map((b) => <li key={b.id} draggable onDragStart={() => setTrascino({ bolla: b.id })} style={{ cursor: 'grab' }}>{dove(b)}{b.accessori?.includes('Sabato') ? ' · consegna sabato' : ''}</li>)}
        </ul> : <p className="lbl" style={{ margin: '10px 0 0' }}>Tutto assegnato.</p>}</div>
    </div>
  </>);
}

// ------------------------------------------------------------------ Giacenze
export function Giacenze() {
  const { db, vai } = useApp();
  const [s, set] = useStato({ sel: '', msg: '', data: domaniISO(), prenota: false });
  const az = useAzione();
  const { dati } = useDati(async (d) => {
    const G = await d.from<any>('giacenze_aperte').select('*').order('dal', { ascending: false });
    const bolle = G.length ? await d.from<any>('bolle').select('id,cliente_id,clienti(email)').in('id', G.map((g) => g.bolla_id)) : [];
    const cli = [...new Set(bolle.map((b) => b.cliente_id))];
    const [tariffe, rich] = await Promise.all([cli.length ? d.from<any>('tariffe').select('*').in('cliente_id', cli) : [],
      G.length ? d.from<any>('richieste_riconsegna').select('*').in('giacenza_id', G.map((g) => g.id)).is('gestita_il', null).order('il', { ascending: false }) : []]);
    return { G: G.map((g) => ({ ...g, ...bolle.find((b) => b.id === g.bolla_id), id: g.id, richiesta: rich.find((r) => r.giacenza_id === g.id) ?? null })), tariffe };
  }, []);
  if (!dati) return null;
  const G = dati.G; const cur = G.find((g) => g.id === s.sel) ?? G[0];
  const tar = (c: string, v: string) => dati.tariffe.find((t) => t.cliente_id === c && t.voce === v);
  const costoGiacenza = (g: any) => { const t = tar(g.cliente_id, 'Giacenza'); return !t ? 0 : t.unita === 'giorno' ? t.prezzo * Math.max(1, g.giorni) : t.prezzo; };
  const daPren = G.filter((g) => !g.riconsegna_il && (g.motivo !== 'Merce rifiutata' || g.richiesta)).length;
  const fmtT = (t: any) => t ? `${eur(t.prezzo)} ${t.unita === 'giorno' ? 'al giorno' : t.unita === 'spedizione' ? '' : 'a ' + t.unita}`.trim() : '[tariffa da inserire in Clienti]';
  const prenota = () => az.esegui(() => db.rpc('prenota_riconsegna', { p_giacenza: cur.id, p_data: s.data })).then((ok) => ok && set({ msg: 'prenotata', prenota: false }));
  const reso = () => az.esegui(() => db.from('giacenze').update({ chiusa_il: new Date().toISOString() }).eq('id', cur.id)).then((ok) => ok && set({ msg: 'reso' }));
  return (<>
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Spedizioni in giacenza</div><div className="big">{G.length}</div><div className="lbl">merce tornata a Lacchiarella</div></div>
      <div className="glass card"><div className="lbl">Riconsegne da prenotare</div><div className="big">{daPren}</div><div className="lbl">aspettano una data dal cliente</div></div>
      <div className="glass card"><div className="lbl">Giorni medi in giacenza</div><div className="big">{G.length ? (G.reduce((a, g) => a + g.giorni, 0) / G.length).toFixed(1).replace('.', ',') : '0'}</div></div>
      <div className="glass card"><div className="lbl">Giacenze da fatturare a {Mese().toLowerCase()}</div><div className="big">{eur0(G.reduce((a, g) => a + costoGiacenza(g), 0))}</div><div className="lbl">con la tariffa di ogni cliente</div></div>
    </div>
    {!cur ? <Msg>Nessuna spedizione in giacenza.</Msg> : <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
      <div className="glass" style={{ flex: '1 1 280px', padding: 8, minWidth: 0 }}>
        <div className="row between" style={{ padding: '8px 10px' }}><b>In magazzino</b><span className="lbl">{G.length} spedizioni</span></div>
        <div className="list">{G.map((g) => <button key={g.id} type="button" className={'li' + (cur.id === g.id ? ' on' : '')} onClick={() => set({ sel: g.id, msg: '', prenota: false })}>
          <span className="row between" style={{ width: '100%' }}><b>{g.cliente}</b>{g.riconsegna_il ? <Pill tone="ok">Riconsegna prenotata</Pill> : g.richiesta ? <Pill tone="red">{'Chiede il ' + giornoCorto(g.richiesta.data).toLowerCase()}</Pill> : g.motivo === 'Merce rifiutata' ? <Pill>Decide il cliente</Pill> : <Pill tone="red">Da prenotare</Pill>}</span>
          <span className="lbl">{g.motivo} · {giornoCorto(g.dal)}</span></button>)}</div>
      </div>
      <div className="glass card stack" style={{ flex: '2 1 420px', minWidth: 0 }}>
        <div className="row between"><h3 style={{ fontSize: 22, letterSpacing: '-.02em' }}>{cur.cliente} · giacenza</h3><span className="lbl">Spedizione {cur.numero ?? '—'}</span></div>
        <div className="kv">
          <div><div className="lbl">Destinatario</div><b>{[cur.destinatario, cur.citta].filter(Boolean).join(', ')}</b></div>
          <div><div className="lbl">Motivo della mancata consegna</div><b>{cur.motivo}</b></div>
          <div><div className="lbl">In giacenza dal</div><b>{giornoCorto(cur.dal)}</b></div>
          <div><div className="lbl">Giorni</div><b>{cur.giorni}</b></div>
          {cur.richiesta && <div className="bad"><div className="lbl">Il cliente chiede dal portale</div><b className="miss">{giornoCorto(cur.richiesta.data)}{cur.richiesta.nota ? ' · ' + cur.richiesta.nota : ''}</b></div>}
          <div><div className="lbl">Riconsegna</div><b>{cur.riconsegna_il ? 'Prenotata · ' + giornoCorto(cur.riconsegna_il) : cur.motivo === 'Merce rifiutata' ? 'Il cliente decide: riconsegna o reso' : 'Da prenotare'}</b></div>
        </div>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div className="lbl" style={{ marginBottom: 6 }}>Cosa paga il cliente, con la sua tariffa</div>
          <div className="tbox"><table className="t"><tbody>
            <tr><td>Consegna tentata</td><td>{fmtT(tar(cur.cliente_id, 'Base'))}</td></tr>
            <tr><td>Giacenza</td><td>{fmtT(tar(cur.cliente_id, 'Giacenza'))}</td></tr>
            <tr><td>Riconsegna, quando la prenota</td><td>{fmtT(tar(cur.cliente_id, 'Riconsegna'))}</td></tr>
          </tbody></table></div>
          <div className="lbl" style={{ marginTop: 6 }}>Le tre voci vanno da sole in Fatturazione, collegate a questa spedizione.</div>
        </div>
        {s.msg === 'chiesto' && <ScriviCliente a={cur.clienti?.email} oggetto={`Spedizione ${cur.numero ?? ''} in giacenza`} avviso="Mail al cliente pronta: avvisa della giacenza, del costo e chiede la data per la riconsegna."
          testo={`Buongiorno,\nla spedizione ${cur.numero ?? ''} per ${cur.destinatario ?? ''} non è stata consegnata (${cur.motivo.toLowerCase()}) ed è in giacenza nel nostro magazzino dal ${giornoCorto(cur.dal)}.\nLa giacenza costa ${fmtT(tar(cur.cliente_id, 'Giacenza'))}. Ci indicate in che giorno riconsegnare?\nGrazie`} onChiudi={() => set({ msg: '' })} />}
        {s.msg === 'prenotata' && <Msg azione="Vai al Traffico" onAzione={() => vai('traffico')}>Riconsegna prenotata: la spedizione è nei giri del giorno scelto e la riconsegna è già in fattura.</Msg>}
        {s.msg === 'reso' && <Msg>Spedizione chiusa come reso al mittente.</Msg>}
        {s.prenota && <div className="row"><label className="field"><span className="lbl">Giorno della riconsegna</span><input className="input" type="date" min={domaniISO()} value={s.data} onChange={(e) => set({ data: e.target.value })} /></label>
          <Btn onClick={prenota} disabled={az.inCorso}>Conferma</Btn><Btn ghost onClick={() => set({ prenota: false })}>Annulla</Btn></div>}
        <Errore testo={az.errore} />
        <div className="row">
          {!cur.riconsegna_il && !s.prenota && <Btn onClick={() => set({ prenota: true, msg: '', data: cur.richiesta?.data ?? domaniISO() })}>Prenota la riconsegna</Btn>}
          {!cur.riconsegna_il && <Btn ghost onClick={() => set({ msg: 'chiesto', prenota: false })}>Chiedi al cliente quando riconsegnare</Btn>}
          <Btn ghost onClick={reso} disabled={az.inCorso}>Reso al mittente</Btn>
        </div>
      </div>
    </div>}
  </>);
}
