import React, { useEffect, useState } from 'react';
import { Btn, Chip, Msg, Pill, Warn } from '@messina/ui';
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
export function ScriviCliente(p: { a: string | null | undefined; oggetto: string; testo: string; avviso: string; onChiudi: () => void; onInviato?: () => PromiseLike<unknown>; azienda?: 'trasporti' | 'corporation' }) {
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
      <div className="row"><Btn disabled={!p.a || az.inCorso} onClick={() => az.esegui(async () => { await db.fn('mail-outlook', { azione: 'scrivi', azienda: p.azienda ?? 'trasporti', a: p.a, oggetto: p.oggetto, testo }); if (p.onInviato) await p.onInviato(); }).then((ok) => ok && setFatto(true))}>Invia</Btn>
        <Btn ghost onClick={p.onChiudi}>Annulla</Btn></div>
    </div>
  </>);
}

// ------------------------------------------------------------------ Bolle
const CAMPO: Record<string, string> = { 'Peso': 'peso_kg', 'Indirizzo': 'indirizzo', 'Fascia oraria': 'fascia', 'Fascia': 'fascia', 'Data': 'data_consegna', 'Data di consegna': 'data_consegna', 'Colli': 'colli_previsti', 'Destinatario': 'destinatario', 'Città': 'citta' };
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
  const { dati: prezzo } = useDati((d) => cur ? d.rpc<any[]>('righe_bolla', { p_bolla: cur.id }) : Promise.resolve(null), [cur?.id, cur?.stato]);
  if (!dati) return null;
  const cosa = (b: any) => `${b.tipo} ${b.colli_previsti ?? '?'} ${b.colli_previsti === 1 ? 'collo' : 'colli'}${b.citta ? ' · ' + b.citta : ''}`;
  const ok = cur?.stato === 'Confermata';
  const manca: string[] = cur?.dati_mancanti ?? [];
  const conferma = () => az.esegui(() => db.from('bolle').update({ stato: 'Confermata' }).eq('id', cur!.id)).then((x) => x && set({ msg: 'ok' }));
  void NonConsegnate; void Completa;   // Da decidere (STATO): «Non consegnate» e «Completa» non sono nel mockup
  return (<>
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
          <div><div className="lbl">Colli</div><b>{cur.colli_previsti ?? '—'}{cur.bancali ? ` · ${cur.bancali} bancali` : ''}</b></div>
          {/* Da decidere (STATO): Peso, Contrassegno e Valore della merce non sono nel mockup */}
          <div><div className="lbl">Accessori</div><b>{cur.accessori?.length ? cur.accessori.join(', ') : '—'}</b></div>
          {manca.length > 0 && !ok && <div className="bad"><div className="lbl">Manca</div><b className="miss">{manca.join(' e ')}</b></div>}
        </div>
        {/* Da decidere (STATO): il modulo per scrivere il dato mancante (Completa) e il prezzo voce per voce non sono nel mockup */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}><div className="lbl">Tariffa applicata dal contratto</div>
          <div>Base del cliente + accessori · totale <b>{prezzo && prezzo.length ? eur(prezzo.reduce((a: number, r: any) => a + Number(r.totale), 0)) : '€ —'}</b>
            {prezzo?.some((r: any) => r.problema) && <span className="miss"> · {prezzo.filter((r: any) => r.problema).map((r: any) => r.problema).join(', ')}</span>}</div></div>
        {(s.msg === 'ok' || ok) && <Msg azione="Vai al Traffico" onAzione={() => vai('traffico')}>Bolla confermata: è nei giri di domani e gli accessori sono già sull’app dell’autista. Al cliente parte la mail di conferma.</Msg>}
        {s.msg === 'chiesto' && <ScriviCliente a={cur.clienti?.email} oggetto={`Spedizione del ${giornoLungo(cur.data_consegna)}`} avviso="Mail al cliente pronta, con la domanda sul dato mancante."
          testo={`Buongiorno,\nper organizzare la spedizione ci manca: ${manca.join(', ').toLowerCase()}. Ce lo potete indicare?\nGrazie`} onChiudi={() => set({ msg: '' })} />}
        {!ok && manca.length > 0 && <Warn>Bloccata</Warn>}
        <Errore testo={az.errore} />
        <div className="row">{!ok && <Btn disabled={manca.length > 0 || az.inCorso} onClick={conferma}>Conferma</Btn>}{manca.length > 0 && !ok && <Btn ghost onClick={() => set({ msg: 'chiesto' })}>Chiedi</Btn>}</div>
      </div>}
    </div>
  </>);
}

/** spedizioni non consegnate e rimaste ferme (né giacenza né nuova data): l'ufficio sceglie il giorno e le rimette nei giri */
function NonConsegnate() {
  const { db } = useApp();
  const az = useAzione();
  const [data, setData] = useState<Record<string, string>>({});
  const [fatto, setFatto] = useState('');
  const { dati } = useDati((d) => d.from<any>('bolle').select('id,numero,citta,colli_previsti,data_consegna,clienti(nome)').eq('stato', 'Non consegnata').order('data_consegna'), []);
  if (!dati || (!dati.length && !fatto)) return null;
  const rimetti = (b: any) => az.esegui(() => db.rpc('rimetti_in_giro', { p_bolla: b.id, p_data: data[b.id] }))
    .then((x) => x && setFatto(`${b.clienti?.nome ?? 'Spedizione'}: rimessa nei giri di ${giornoLungo(data[b.id]).toLowerCase()}.`));
  return <div className="glass card stack">
    <div className="row between"><b>Non consegnate</b>{dati.length > 0 && <span className="lbl">{dati.length} {dati.length === 1 ? 'spedizione' : 'spedizioni'}</span>}</div>
    {fatto && <Msg>{fatto}</Msg>}
    <Errore testo={az.errore} />
    {dati.map((b) => <div key={b.id} className="row between" style={{ gap: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      <div style={{ minWidth: 0 }}><b>{b.clienti?.nome ?? '—'}</b><div className="lbl">{[b.numero, b.citta, b.colli_previsti != null ? `${b.colli_previsti} colli` : null, 'era per il ' + new Date(b.data_consegna + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })].filter(Boolean).join(' · ')}</div></div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" type="date" aria-label="Giorno della nuova consegna" min={oggiISO()} value={data[b.id] ?? ''} onChange={(e) => setData({ ...data, [b.id]: e.target.value })} />
        <Btn sm disabled={!data[b.id] || az.inCorso} onClick={() => rimetti(b)}>Rimetti</Btn></div>
    </div>)}
  </div>;
}

/** il dato mancante si scrive qui quando il cliente risponde; poi la bolla si può confermare */
function Completa({ bolla }: { bolla: any }) {
  const { db } = useApp();
  const az = useAzione();
  const [v, setV] = useState<Record<string, string>>({});
  const salva = () => {
    const agg: Record<string, any> = {}; const note: string[] = [];
    for (const [k, x] of Object.entries(v)) { if (!x.trim()) continue; const c = CAMPO[k]; if (c) agg[c] = c === 'colli_previsti' || c === 'peso_kg' ? Number(x.replace(',', '.')) : x.trim(); else note.push(`${k}: ${x.trim()}`); }
    agg.dati_mancanti = bolla.dati_mancanti.filter((k: string) => !v[k]?.trim());
    if (note.length) agg.note = [bolla.note, ...note].filter(Boolean).join('\n');
    return az.esegui(() => db.from('bolle').update(agg).eq('id', bolla.id)).then((ok) => ok && setV({}));
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {bolla.dati_mancanti.map((k: string) => (
        <label key={k} className="field"><span className="lbl">{k}</span>
          <input className="input" type={CAMPO[k] === 'data_consegna' ? 'date' : CAMPO[k] === 'colli_previsti' || CAMPO[k] === 'peso_kg' ? 'number' : 'text'} value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
      ))}
      <Errore testo={az.errore} />
      <div className="row"><Btn ghost sm disabled={!Object.values(v).some((x) => x.trim()) || az.inCorso} onClick={salva}>Salva</Btn></div>
    </div>
  );
}

// ------------------------------------------------------------------ Traffico
// I giri di domani li prepara il sistema da solo (impostazioni.ora_giri). Qui si controllano, si aprono e si confermano.
const ACCESSORI = ['Sponda', 'Piano terra', 'Consegna al piano', 'Fascia oraria', 'Sabato', 'Firma obbligatoria', 'Chiamare prima'];
const FERMATE_SEL = 'id,ordine,bolla_id,esito,firmata,accessori_extra(voce),bolle(id,citta,indirizzo,fascia,colli_previsti,accessori,clienti(nome))';
const ordinate = (g: any) => [...(g.fermate ?? [])].sort((a: any, b: any) => a.ordine - b.ordine);
/** arrivo previsto: partenza 07:30, 25 minuti alla prima fermata, poi 28 tra una e l'altra (finché non c'è l'ottimizzatore) */
const orari = (n: number) => { let m = 7 * 60 + 30; return Array.from({ length: n }, (_, i) => { m += i ? 28 : 25; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }); };
const kmGiro = (g: any) => g.km_previsti != null ? `${Math.round(g.km_previsti)} km` : null;
const nomeMezzo = (g: any) => `${g.mezzi?.tipo ?? '—'}${g.mezzi?.sponda ? ' con sponda' : ''}${g.mezzi?.targa ? ' ' + g.mezzi.targa : ''}`;

const isoLocale = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
/** il prossimo giorno lavorativo: di venerdì e sabato è lunedì */
const prossimoLavorativo = () => { const d = new Date(); do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); return isoLocale(d); };
const nomeGiorno = (iso: string) => iso === oggiISO() ? 'Oggi' : iso === domaniISO() ? 'Domani' : new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase());
let giornoTraffico = '';
const dataBreve = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });

export function Traffico({ scelto }: { scelto?: string }) {
  const { db, vai } = useApp();
  const [giorno, setGiornoS] = useState(() => giornoTraffico || prossimoLavorativo());
  const setGiorno = (x: string) => { giornoTraffico = x; setGiornoS(x); setOk(''); };
  const giorni = [...new Set([oggiISO(), domaniISO(), prossimoLavorativo()])];
  const domani = giorno;
  const nome = nomeGiorno(giorno);
  const az = useAzione();
  const [ok, setOk] = useState('');
  const { dati } = useDati(async (d) => {
    const [bolle, giri, prep, imp] = await Promise.all([
      d.from<any>('bolle').select('id,tipo,citta,indirizzo,fascia,colli_previsti,accessori,clienti(nome)').eq('data_consegna', domani).in('stato', ['Confermata', 'In giro']).neq('tipo', 'Magazzino'),
      d.from<any>('giri').select(`*,mezzi(tipo,sponda,targa),dipendenti(nome),fermate(${FERMATE_SEL})`).eq('data', domani),
      d.from<any>('giri_preparazioni').select('*').eq('data', domani).order('eseguita_il', { ascending: false }).limit(1),
      d.from<any>('impostazioni').select('valore').eq('chiave', 'ora_giri'),
    ]);
    const vincoli = await Promise.all(giri.map((g) => d.rpc<string[] | null>('giro_vincoli', { p_giro: g.id })));
    giri.forEach((g, i) => { g.vincoli = vincoli[i] ?? []; });
    return { bolle, giri: giri.sort((a, b) => String(a.dipendenti?.nome).localeCompare(String(b.dipendenti?.nome))), prep: prep[0] ?? null, ora: Number(imp[0]?.valore ?? 15) };
  }, [giorno]);
  // il mockup mostra un giorno solo: quello dei giri pronti da controllare (domani, o il prossimo giorno lavorativo).
  // La scelta Oggi / Domani / giorno lavorativo è in STATO «Da decidere».
  const { dati: conGiri } = useDati((d) => giornoTraffico ? Promise.resolve(null) : d.from<any>('giri').select('data').in('data', [domaniISO(), prossimoLavorativo()]), []);
  useEffect(() => { if (!giornoTraffico && conGiri?.length && !conGiri.some((x) => x.data === giorno)) setGiorno(conGiri.map((x) => x.data).sort()[0]); }, [conGiri]);
  void giorni;
  if (!dati) return null;
  const assegnate = new Set(dati.giri.flatMap((g) => g.fermate.filter((f: any) => f.esito === 'Da fare').map((f: any) => f.bolla_id)));
  const libere = dati.bolle.filter((b) => !assegnate.has(b.id));
  const giro = scelto ? dati.giri.find((g) => g.id === scelto) : null;
  if (giro) return <GiroPagina giro={giro} giri={dati.giri} libere={libere} />;

  const daConfermare = dati.giri.filter((g) => !g.confermato_il);
  const nuove = daConfermare.filter((g) => g.da_confermare?.length);
  const tot = dati.giri.reduce((n, g) => n + g.fermate.length, 0);
  const km = dati.giri.every((g) => g.km_previsti != null) && dati.giri.length ? dati.giri.reduce((n, g) => n + Number(g.km_previsti), 0) : null;
  const bloccati = dati.giri.filter((g) => !g.confermato_il && g.vincoli.length);
  const conferma = () => az.esegui(() => db.rpc<number>('conferma_giri', { p_data: domani }).then(() => setOk(giorno === oggiISO()
    ? 'Giri di oggi confermati: ogni autista li trova già in ordine nella sua app.'
    : `Giri di ${nome === 'Domani' ? 'domani' : nome.toLowerCase()} ${dataBreve(giorno)} confermati: quel mattino ogni autista li trova già in ordine nella sua app.`)));
  return (<>
    <div className="glass card row between"><span><b>{nome}</b> <span className="lbl">{tot} fermate in questi giri · {dati.giri.length} mezzi</span></span>
      <div className="row">{!dati.giri.length ? null : daConfermare.length ? <Btn onClick={conferma} disabled={az.inCorso || bloccati.length > 0}>Conferma</Btn> : <Pill tone="ok">Confermati</Pill>}</div></div>
    {ok && !daConfermare.length && <Msg>{ok}</Msg>}
    {bloccati.length > 0 && <Warn>{bloccati.map((g) => `Giro di ${g.dipendenti?.nome ?? '—'}: ${g.vincoli.join('; ')}`).join(' · ')}. Spostate le fermate su un altro mezzo, poi confermate.</Warn>}
    {!dati.giri.length && <Msg>{giorno === oggiISO() ? 'Oggi non ci sono giri.' : <>I giri li prepara il programma da solo alle {String(dati.ora).padStart(2, '0')}:00 del giorno lavorativo prima, con le spedizioni confermate. Li trovate qui, pronti da controllare.</>}</Msg>}
    {daConfermare.length > 0 && !nuove.length && dati.giri.length > 0 && <Msg>
      Il programma ha preparato i giri{dati.prep ? ` alle ${hm(dati.prep.eseguita_il)}` : ''}: ha diviso le spedizioni tra i mezzi per zona e ha messo le fermate di ogni mezzo in ordine di fascia oraria{km != null ? ` (${Math.round(km)} km)` : ''}. Controllate, aprite un giro se volete cambiarlo, poi premete «Conferma».</Msg>}
    {nuove.length > 0 && <Msg>
      {nuove.reduce((n, g) => n + g.da_confermare.length, 0) === 1 ? 'È arrivata una spedizione nuova' : 'Sono arrivate spedizioni nuove'} e il programma l’ha messa nel giro di {nuove.map((g) => g.dipendenti?.nome).join(', ')}: {nuove.flatMap((g) => g.da_confermare).join('; ')}. Controllate e premete «Conferma».</Msg>}
    <Errore testo={az.errore} />
    <div className="grid g4">
      {dati.giri.map((g) => {
        const fer = ordinate(g);
        return <button key={g.id} type="button" className="glass card giro" onClick={() => vai('traffico/' + g.id)}>
          <span className="row between" style={{ width: '100%' }}><b>{nomeMezzo(g)} · {g.dipendenti?.nome}</b><Pill>{g.zona ?? '—'}</Pill></span>
          {g.vincoli.length > 0 && <span className="miss" style={{ marginTop: 6 }}>{g.vincoli.join('; ')}</span>}
          <ol style={{ margin: '12px 0 0', paddingLeft: 20, lineHeight: 1.9, textAlign: 'left' }}>
            {fer.map((f: any) => <li key={f.id}>{f.bolle?.clienti?.nome} · {f.bolle?.citta ?? '—'}</li>)}
          </ol>
          <span className="lbl" style={{ marginTop: 8 }}>{[kmGiro(g), `${fer.length} ${fer.length === 1 ? 'fermata' : 'fermate'}`].filter(Boolean).join(' · ')}</span>
          <span className="go" style={{ marginTop: 6 }}>Apri</span>
        </button>;
      })}
      <div className="glass card" style={{ borderStyle: 'dashed' }}><b>Da assegnare</b>
        {libere.length ? <><ul style={{ margin: '12px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
          {libere.map((b) => <li key={b.id}>{b.clienti?.nome} · {b.fascia ?? b.citta ?? '—'}</li>)}
        </ul><p className="lbl" style={{ margin: '8px 0 0' }}>Aprite un giro e premete «+ Aggiungi fermata».</p></> : <p className="lbl" style={{ margin: '10px 0 0' }}>Tutto assegnato.</p>}</div>
    </div>
    {dati.giri.length > 0 && <MappaGiri giri={dati.giri} km={km} nome={nome} />}
  </>);
}

/** mappaGiri() del mockup: i percorsi del giorno, uno per mezzo, con i numeri dei giri veri */
function MappaGiri({ giri, km, nome }: { giri: any[]; km: number | null; nome: string }) {
  const COL = ['#111214', '#5b5e66', '#9a9da5'];
  // tre direzioni come nel mockup; su ognuna tanti punti quante sono le fermate del giro
  const DIR = [[[120, 90], [175, 70], [230, 60], [290, 80], [320, 95]], [[130, 170], [200, 150], [250, 175], [300, 165], [325, 185]], [[110, 220], [190, 240], [280, 230], [310, 250], [330, 262]]];
  const giro3 = giri.slice(0, 3).map((g, i) => DIR[i].slice(0, Math.max(1, Math.min(5, (g.fermate ?? []).length))));
  const R = giro3.map((ps) => 'M60 160 ' + ps.map((p) => `L${p[0]} ${p[1]}`).join(' '));
  const pts = giro3.flat();
  const ottim = km != null;   // i km ci sono solo con l'ottimizzatore per camion
  return <div className="glass card mappa"><div className="row between"><b>Percorsi di {nome === 'Domani' ? 'domani' : nome.toLowerCase()}</b>{ottim && <Pill tone="ok">Ottimizzati per camion</Pill>}</div>
    <svg viewBox="0 0 340 280" style={{ width: '100%', maxWidth: 520, display: 'block', margin: '10px auto 0' }} role="img" aria-label="Mappa dei giri">
      <rect x="0" y="0" width="340" height="280" rx="16" fill="rgba(17,18,20,.03)" />
      <path d="M0 120 Q170 100 340 140" stroke="rgba(17,18,20,.08)" strokeWidth="10" fill="none" /><path d="M150 0 Q160 140 140 280" stroke="rgba(17,18,20,.08)" strokeWidth="8" fill="none" />
      {R.map((d, i) => <path key={i} d={d} stroke={COL[i]} strokeWidth="3" fill="none" strokeLinejoin="round" />)}
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="6" fill="#fff" stroke="#111214" strokeWidth="2" />)}
      <rect x="44" y="146" width="32" height="28" rx="6" fill="#111214" /><text x="60" y="190" textAnchor="middle" fontSize="11" fontWeight="700" fill="#111214">Lacchiarella</text></svg>
    <div className="grid g4" style={{ marginTop: 8 }}><div><div className="lbl">Km totali</div><b style={{ fontSize: 22 }}>{km != null ? Math.round(km) : '—'}</b></div><div><div className="lbl">Mezzi usati</div><b style={{ fontSize: 22 }}>{giri.length}</b></div><div><div className="lbl">Gasolio stimato</div><b style={{ fontSize: 22 }}>—</b></div></div>
    <p className="lbl" style={{ margin: '8px 0 0' }}>Strade per camion (altezza, peso, ZTL), fasce orarie dei clienti, sponda dove serve. Il navigatore dell’autista riceve il giro già in ordine.</p></div>;
}

/** mappa schematica del solo giro: le fermate in ordine (le coordinate vere arrivano con l'ottimizzatore per camion) */
function MappaGiro({ n, chi }: { n: number; chi: string }) {
  const P = [[60, 170], [110, 120], [170, 95], [230, 70], [280, 110], [300, 170], [240, 200], [180, 215]];
  const pts = Array.from({ length: n }, (_, i) => P[(i + 1) % P.length]);
  return <svg viewBox="0 0 340 240" style={{ width: '100%', display: 'block' }} role="img" aria-label={`Mappa del giro di ${chi}`}>
    <rect width="340" height="240" rx="16" fill="rgba(17,18,20,.03)" />
    <path d="M0 120 Q170 100 340 140" stroke="rgba(17,18,20,.07)" strokeWidth="10" fill="none" /><path d="M150 0 Q160 140 140 240" stroke="rgba(17,18,20,.07)" strokeWidth="8" fill="none" />
    <path d={`M40 200 ${pts.map((p) => `L${p[0]} ${p[1]}`).join(' ')}`} stroke="#111214" strokeWidth="3" fill="none" strokeLinejoin="round" />
    <rect x="26" y="188" width="28" height="24" rx="6" fill="#111214" />
    {pts.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r="11" fill="#fff" stroke="#111214" strokeWidth="2" /><text x={p[0]} y={p[1] + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#111214">{i + 1}</text></g>)}
  </svg>;
}

const STATO_GIRO: Record<string, string> = { Preparato: 'In magazzino', Partito: 'Partito', Rientrato: 'Rientrato', Chiuso: 'Chiuso' };
function GiroPagina({ giro: g, giri, libere }: { giro: any; giri: any[]; libere: any[] }) {
  const { db, vai } = useApp();
  const az = useAzione();
  // chiusura d'ufficio: l'autista non ha potuto chiudere la fermata (telefono rotto, cliente che chiama dopo)
  const [uff, setUff] = useState<{ id: string; ok: boolean | null; motivo: string; dopo: 'Giacenza' | 'Nuova data'; data: string } | null>(null);
  const partito = g.stato === 'Partito' || g.stato === 'Rientrato';
  const cambia = (x: Partial<NonNullable<typeof uff>>) => setUff((u) => u && { ...u, ...x });
  const [edit, setEdit] = useState<{ id: string; fascia: string; acc: string[] } | null>(null);
  const [aggiungi, setAggiungi] = useState(false);
  const [dest, setDest] = useState<Record<string, string>>({});
  const fer = ordinate(g); const ore = orari(fer.length);
  const altri = giri.filter((x) => x.id !== g.id && !['Rientrato', 'Chiuso'].includes(x.stato));
  const chi = g.dipendenti?.nome ?? '—';
  const fai = (fn: string, args: Record<string, unknown>) => az.esegui(() => db.rpc(fn, args));
  return (<>
    <div className="row"><Btn ghost sm onClick={() => vai('traffico')}>← Tutti i giri</Btn></div>
    <div className="glass card row between" style={{ gap: 12 }}><div><b style={{ fontSize: 22 }}>{chi} · {nomeMezzo(g)}</b>
      <div className="lbl">{[g.zona ?? '—', `${fer.length} ${fer.length === 1 ? 'fermata' : 'fermate'}`, kmGiro(g), 'partenza 07:30'].filter(Boolean).join(' · ')}</div></div>
      {g.stato === 'Partito' ? <Pill tone="dark">Partito</Pill> : <Pill>{STATO_GIRO[g.stato] ?? g.stato}</Pill>}</div>
    {g.confermato_il && g.stato === 'Partito' && <Msg>Questo giro è confermato e l’autista è già partito: ogni modifica gli arriva subito nell’app con un avviso.</Msg>}
    <Errore testo={az.errore} />
    <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
      <div className="glass card stack" style={{ flex: '2 1 520px', minWidth: 0, gap: 0 }}>
        {fer.map((f: any, j: number) => {
          const b = f.bolle ?? {}; const acc = [...(b.accessori ?? []), ...(f.accessori_extra ?? []).map((x: any) => x.voce)];
          const libera = f.esito === 'Da fare' && !f.firmata; const ed = edit?.id === f.id ? edit : null;
          return <div key={f.id} className="ferm">
            <span className="fn">{j + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row between" style={{ gap: 8 }}><b style={{ fontSize: 17 }}>{b.clienti?.nome ?? '—'}</b><span className="lbl">{f.esito === 'Da fare' ? `arrivo ${ore[j]}` : f.esito}</span></div>
              <div className="lbl">{[b.indirizzo && b.citta ? `${b.indirizzo}, ${b.citta}` : b.indirizzo ?? b.citta, b.fascia, b.colli_previsti != null ? `${b.colli_previsti} colli` : null].filter(Boolean).join(' · ')}</div>
              {acc.length > 0 && <div className="row" style={{ gap: 6, marginTop: 6 }}>{acc.map((a) => <Pill key={a}>{a}</Pill>)}</div>}
              {ed && <div className="stack" style={{ gap: 8, marginTop: 10, padding: 12, borderRadius: 14, background: 'var(--soft)' }}>
                <label className="stack" style={{ gap: 4 }}><span className="lbl">Fascia oraria</span>
                  <input value={ed.fascia} onChange={(e) => setEdit({ ...ed, fascia: e.target.value })} style={{ font: 'inherit', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)' }} /></label>
                <div className="row" style={{ gap: 6 }}>{ACCESSORI.map((a) => {
                  const fisso = (b.accessori ?? []).includes(a);
                  return <label key={a} className="chipbtn" style={{ cursor: fisso ? 'default' : 'pointer' }}>
                    <input type="checkbox" checked={fisso || ed.acc.includes(a)} disabled={fisso} style={{ marginRight: 6 }}
                      onChange={(e) => setEdit({ ...ed, acc: e.target.checked ? [...ed.acc, a] : ed.acc.filter((x) => x !== a) })} />{a}</label>;
                })}</div>
                <div className="row"><Btn sm disabled={az.inCorso} onClick={() => fai('giro_modifica', { p_fermata: f.id, p_fascia: ed.fascia, p_accessori: ed.acc }).then((x) => x && setEdit(null))}>Salva</Btn>
                  <Btn ghost sm onClick={() => setEdit(null)}>Annulla</Btn></div>
              </div>}
              {partito && f.esito === 'Da fare' && uff?.id !== f.id && <div className="row" style={{ gap: 6, marginTop: 10 }}>
                <Btn ghost sm onClick={() => setUff({ id: f.id, ok: null, motivo: '', dopo: 'Giacenza', data: '' })}>Chiudi</Btn></div>}
              {uff && uff.id === f.id && <div className="stack" style={{ gap: 8, marginTop: 10, padding: 12, borderRadius: 14, background: 'var(--soft)' }}>
                <div className="row" style={{ gap: 6 }}><Chip on={uff.ok === true} onClick={() => cambia({ ok: true })}>Consegnata</Chip><Chip on={uff.ok === false} onClick={() => cambia({ ok: false })}>Mancata</Chip></div>
                {uff.ok === false && <div className="row" style={{ gap: 6 }}><Chip on={uff.dopo === 'Giacenza'} onClick={() => cambia({ dopo: 'Giacenza' })}>Giacenza</Chip><Chip on={uff.dopo === 'Nuova data'} onClick={() => cambia({ dopo: 'Nuova data' })}>Nuova data</Chip>
                  {uff.dopo === 'Nuova data' && <input className="input" type="date" aria-label="Giorno della nuova consegna" min={domaniISO()} value={uff.data} onChange={(e) => cambia({ data: e.target.value })} />}</div>}
                <input className="input" aria-label="Motivo" placeholder="Motivo (finisce nello Storico)" value={uff.motivo} onChange={(e) => cambia({ motivo: e.target.value })} />
                <div className="row"><Btn sm disabled={uff.ok === null || !uff.motivo.trim() || (uff.ok === false && uff.dopo === 'Nuova data' && !uff.data) || az.inCorso}
                  onClick={() => fai('chiudi_ufficio', { p_fermata: f.id, p_consegnata: uff.ok, p_motivo: uff.motivo.trim(), p_dopo: uff.ok ? null : uff.dopo, p_nuova_data: uff.ok || uff.dopo !== 'Nuova data' ? null : uff.data }).then((x) => x && setUff(null))}>Conferma</Btn>
                  <Btn ghost sm onClick={() => setUff(null)}>Annulla</Btn></div>
              </div>}
              {libera && <div className="row" style={{ gap: 6, marginTop: 10 }}>
                <Btn ghost sm disabled={az.inCorso} onClick={() => fai('giro_ordine', { p_fermata: f.id, p_su: true })}>Su</Btn>
                <Btn ghost sm disabled={az.inCorso} onClick={() => fai('giro_ordine', { p_fermata: f.id, p_su: false })}>Giù</Btn>
                <Btn ghost sm onClick={() => setEdit(edit?.id === f.id ? null : { id: f.id, fascia: b.fascia ?? '', acc: (f.accessori_extra ?? []).map((x: any) => x.voce) })}>Modifica</Btn>
                <select aria-label="Passa a un altro mezzo" value={dest[f.id] ?? ''} onChange={(e) => setDest({ ...dest, [f.id]: e.target.value })}
                  style={{ font: 'inherit', fontSize: 14, padding: '6px 8px', borderRadius: 999, border: '1px solid var(--line)', background: '#fff' }}>
                  <option value="">Passa a…</option>{altri.map((x) => <option key={x.id} value={x.id}>{x.dipendenti?.nome ?? '—'}</option>)}</select>
                <Btn ghost sm disabled={az.inCorso} onClick={() => { if (dest[f.id]) fai('giro_passa', { p_fermata: f.id, p_giro: dest[f.id] }); }}>Sposta</Btn>
                <Btn ghost sm disabled={az.inCorso} onClick={() => fai('giro_togli', { p_fermata: f.id })}>Togli</Btn>
              </div>}
            </div>
          </div>;
        })}
        <div style={{ paddingTop: 12 }}><Btn ghost sm onClick={() => setAggiungi(!aggiungi)}>+ Aggiungi fermata</Btn></div>
        {aggiungi && <div className="list" style={{ marginTop: 8 }}>{libere.length ? libere.map((b) =>
          <button key={b.id} type="button" className="li" disabled={az.inCorso} onClick={() => fai('giro_aggiungi', { p_giro: g.id, p_bolla: b.id }).then((x) => x && setAggiungi(false))}>
            <span className="row between" style={{ width: '100%' }}><b>{b.clienti?.nome}</b><span className="lbl">{b.fascia ?? ''}</span></span>
            <span className="lbl">{[b.indirizzo && b.citta ? `${b.indirizzo}, ${b.citta}` : b.indirizzo ?? b.citta, `${b.colli_previsti ?? 0} colli`].filter(Boolean).join(' · ')}</span></button>)
          : <div className="lbl" style={{ padding: 10 }}>Nessuna spedizione da assegnare.</div>}</div>}
      </div>
      <div className="glass card stack" style={{ flex: '1 1 320px', minWidth: 0 }}><b>Il giro di {chi}</b><MappaGiro n={fer.length} chi={chi} />
        <div className="lbl">Percorso per camion, nell’ordine delle fermate. Ogni modifica finisce nello Storico con chi l’ha fatta e quando.</div></div>
    </div>
  </>);
}

// ------------------------------------------------------------------ Giacenze
export function Giacenze() {
  const { db } = useApp();
  const [s, set] = useStato({ sel: '', msg: '', data: domaniISO(), ora: '', prenota: false, reso: false });
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
  const fmtT = (t: any) => t ? `${eur(t.prezzo)} ${t.unita === 'giorno' ? 'al giorno' : t.unita === 'spedizione' ? '' : 'a ' + t.unita}`.trim() : '€ [tariffa]';
  const prenota = () => az.esegui(() => db.rpc('prenota_riconsegna', { p_giacenza: cur.id, p_data: s.data, p_ora: s.ora })).then((ok) => ok && set({ msg: 'prenotata', prenota: false }));
  const reso = () => az.esegui(() => db.rpc('reso_al_mittente', { p_giacenza: cur.id })).then((ok) => ok && set({ msg: 'reso', reso: false }));
  // un clic: la mail parte e la giacenza resta segnata «chiesta», il tasto non si ripete
  const chiedi = () => az.esegui(async () => {
    if (!cur.clienti?.email) throw new Error('Manca l’email del cliente: aggiungila in Clienti');
    await db.fn('mail-outlook', { azione: 'scrivi', azienda: 'trasporti', a: cur.clienti.email, oggetto: `Spedizione ${cur.numero ?? ''} in giacenza`,
      testo: `Buongiorno,\nla spedizione ${cur.numero ?? ''} per ${cur.destinatario ?? ''} non è stata consegnata (${cur.motivo.toLowerCase()}) ed è in giacenza nel nostro magazzino dal ${giornoCorto(cur.dal)}.\nLa giacenza costa ${fmtT(tar(cur.cliente_id, 'Giacenza'))}. Ci indicate in che giorno e a che ora riconsegnare?\nGrazie` });
    return db.rpc('chiesta_al_cliente', { p_giacenza: cur.id });
  }).then((ok) => ok && set({ msg: 'chiesto' }));
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
        <div className="list">{G.map((g) => <button key={g.id} type="button" className={'li' + (cur.id === g.id ? ' on' : '')} onClick={() => set({ sel: g.id, msg: '', prenota: false, reso: false })}>
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
          <div><div className="lbl">Riconsegna</div><b>{cur.riconsegna_il ? 'Prenotata · ' + giornoCorto(cur.riconsegna_il) : cur.chiesta_il ? 'Chiesta al cliente il ' + giornoCorto(cur.chiesta_il) + ' alle ' + hm(cur.chiesta_il) : cur.motivo === 'Merce rifiutata' ? 'Il cliente decide: riconsegna o reso' : 'Da prenotare'}</b></div>
        </div>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div className="lbl" style={{ marginBottom: 6 }}>Cosa paga il cliente, con la sua tariffa</div>
          <div className="tbox"><table className="t" style={{ minWidth: 0 }}><tbody>
            <tr><td>Consegna tentata</td><td>{fmtT(tar(cur.cliente_id, 'Base'))}</td></tr>
            <tr><td>Giacenza</td><td>{fmtT(tar(cur.cliente_id, 'Giacenza'))}</td></tr>
            <tr><td>Riconsegna, quando la prenota</td><td>{fmtT(tar(cur.cliente_id, 'Riconsegna'))}</td></tr>
          </tbody></table></div>
          <div className="lbl" style={{ marginTop: 6 }}>Le tre voci vanno da sole in Fatturazione, collegate a questa spedizione.</div>
        </div>
        {s.msg === 'chiesto' && <Msg>Mail inviata al cliente: lo avvisa della giacenza e del costo e chiede in che giorno riconsegnare. La sua risposta arriva in Mail.</Msg>}
        {s.msg === 'prenotata' && <Msg>Riconsegna prenotata. La spedizione entra da sola nei giri di quel giorno e la riconsegna va in fattura.</Msg>}
        {s.msg === 'reso' && <Msg>Reso confermato: la merce torna al mittente e la giacenza si chiude.</Msg>}
        {s.prenota && <div className="row" style={{ alignItems: 'flex-end' }}><label className="field"><span className="lbl">Giorno</span><input className="input" type="date" min={oggiISO()} value={s.data} onChange={(e) => set({ data: e.target.value })} /></label>
          <label className="field"><span className="lbl">Ora</span><select className="input" value={s.ora} onChange={(e) => set({ ora: e.target.value })}><option value="">Scegli</option>
            {['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'].map((h) => <option key={h}>{h}</option>)}</select></label>
          <Btn onClick={prenota} disabled={az.inCorso || !s.data || !s.ora}>Conferma</Btn><Btn ghost onClick={() => set({ prenota: false })}>Annulla</Btn></div>}
        {s.reso && <div className="glass card stack" style={{ gap: 8, padding: 14 }}><b>Reso al mittente</b>
          <span>Il cliente decide di non riconsegnare: la merce torna a chi l’ha spedita, la giacenza si chiude e il cliente paga il viaggio di ritorno con la sua tariffa.</span>
          <div className="row"><Btn onClick={reso} disabled={az.inCorso}>Conferma il reso</Btn><Btn ghost onClick={() => set({ reso: false })}>Annulla</Btn></div></div>}
        <Errore testo={az.errore} />
        {!cur.riconsegna_il && <div className="row">
          <Btn onClick={() => set({ prenota: !s.prenota, reso: false, msg: '', data: cur.richiesta?.data ?? domaniISO() })}>Prenota la riconsegna</Btn>
          {cur.chiesta_il ? <Pill tone="ok">Mail inviata al cliente</Pill> : <Btn ghost onClick={chiedi} disabled={az.inCorso}>Chiedi al cliente quando riconsegnare</Btn>}
          <Btn ghost onClick={() => set({ reso: !s.reso, prenota: false })}>Reso al mittente</Btn>
        </div>}
      </div>
    </div>}
  </>);
}
