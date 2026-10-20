import React, { useMemo, useState } from 'react';
import { Btn, Pill, Badge, Warn, Msg, OkBox, Chips, Stat, Search, Empty, euro, ora } from '@messina/ui';
import { useApp, useDati, useAzione, Errore } from '../app';
import type { Anomalia, Bolla, PostoMissione } from '../api/types';

const oggi = new Date().toISOString().slice(0, 10);

// ======================================================================== Home
export function Home() {
  const { vai } = useApp();
  const { dati: bolle } = useDati((a) => a.bolle());
  const { dati: inc } = useDati((a) => a.incassiTrasporti());
  const { dati: an } = useDati((a) => a.anomalie());
  const diOggi = bolle?.filter((b) => b.data_consegna === oggi) ?? [];
  return (
    <>
      <div className="grid g4">
        <Stat label="Spedizioni oggi" value={diOggi.length} sub={`${diOggi.filter((b) => b.stato === 'Consegnata').length} consegnat${diOggi.filter((b) => b.stato === 'Consegnata').length === 1 ? 'a' : 'e'}`} />
        <Stat label="Da confermare" value={bolle?.filter((b) => b.stato === 'Nuova').length ?? '…'} sub={`${bolle?.filter((b) => b.stato === 'Nuova' && b.dati_mancanti.length).length ?? 0} con dati mancanti`} />
        <Stat label="Anomalie" value={an?.length ?? '…'} alert={!!an?.length} sub="da risolvere" />
      </div>
      <div className="grid g4">
        <Stat label="Fatturato oggi" value={inc ? euro(inc.fatturato_oggi) : '…'} sub="bolle di oggi × tariffe" />
        <Stat label="Fatturato mese" value={inc ? euro(inc.fatturato_mese) : '…'} sub="dal 1° del mese" />
        <Stat label="Incassato" value={inc ? euro(inc.incassato_mese) : '…'} sub="fatture segnate Pagata" />
      </div>
      <div className="panel card stack">
        <div className="row between"><h3 style={{ fontSize: 18 }}>Da guardare</h3><Btn sm ghost onClick={() => vai('anomalie')}>Anomalie</Btn></div>
        {an && an.length === 0 && <OkBox>Tutto torna.</OkBox>}
        <div className="list">
          {an?.slice(0, 6).map((a) => (
            <button key={a.sezione + a.rif} className="li" onClick={() => vai(a.dove)}>
              <span className="row between" style={{ width: '100%' }}><span>{a.cosa}</span><Pill tone="red">{a.sezione}</Pill></span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ==================================================================== Anomalie
const SEZIONI = ['Magazzino', 'Missioni', 'Bolle', 'Presenze', 'Fatturazione', 'Telepass'] as const;

export function Anomalie({ sezione }: { sezione?: string }) {
  const { vai } = useApp();
  const { dati, errore } = useDati((a) => a.anomalie());
  const conta = (s: string) => dati?.filter((a) => a.sezione === s).length ?? 0;
  if (errore) return <Errore testo={errore} />;
  if (!dati) return <Empty>…</Empty>;
  if (!sezione) return (
    <>
      <div className="panel card" style={{ alignSelf: 'flex-start', minWidth: 180, boxShadow: dati.length ? 'inset 0 0 0 2px var(--alert)' : undefined }}>
        <div className="lbl">Totale</div>
        <div className="big" style={{ color: dati.length ? 'var(--alert)' : undefined }}>{dati.length}</div>
        <div className="lbl">{dati.length ? 'da risolvere' : 'tutto torna'}</div>
      </div>
      <div className="grid g3">
        {SEZIONI.map((s) => {
          const n = conta(s);
          return (
            <button key={s} type="button" className={'secbtn' + (n ? '' : ' zero')} onClick={() => vai('anomalie/' + s)}>
              <div className="row between"><b style={{ fontSize: 18 }}>{s}</b>{n ? <Badge n={n} /> : <Pill tone="ok">Ok</Pill>}</div>
              <div className="lbl" style={{ marginTop: 6 }}>{n ? (n === 1 ? '1 anomalia' : `${n} anomalie`) : 'Nessuna'}</div>
            </button>
          );
        })}
      </div>
      <p className="lbl" style={{ margin: 0 }}>Nessuna chiusura passa se le cose non tornano. Quando un'anomalia si risolve, sparisce da sola.</p>
    </>
  );
  const righe: Anomalia[] = dati.filter((a) => a.sezione === sezione);
  return (
    <>
      <div className="row"><Btn sm ghost onClick={() => vai('anomalie')}>← Anomalie</Btn></div>
      {righe.length === 0 ? <OkBox>Nessuna anomalia in {sezione}.</OkBox> : (
        <div className="stack">
          {righe.map((r) => (
            <div key={r.rif} className="panel card row between" style={{ flexWrap: 'nowrap', gap: 12 }}>
              <div><b style={{ fontSize: 17 }}>{r.cosa}</b><div className="lbl" style={{ marginTop: 4 }}>Chi risolve: {r.chi} · {ora(r.da)}</div></div>
              <Btn sm onClick={() => vai(r.dove)}>Apri</Btn>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ======================================================================= Bolle
export function Bolle() {
  const { api } = useApp();
  const { dati: bolle } = useDati((a) => a.bolle());
  const [filtro, setFiltro] = useState<'Da confermare' | 'Tutte'>('Da confermare');
  const [sel, setSel] = useState<string | null>(null);
  const [cerca, setCerca] = useState('');
  const { esegui, errore, inCorso, pulisci } = useAzione();
  const [valori, setValori] = useState<Record<string, string>>({});
  const [fatto, setFatto] = useState('');

  const lista = useMemo(() => (bolle ?? [])
    .filter((b) => filtro === 'Tutte' || b.stato === 'Nuova')
    .filter((b) => !cerca || (b.cliente + ' ' + (b.numero ?? '') + ' ' + (b.citta ?? '')).toLowerCase().includes(cerca.toLowerCase())), [bolle, filtro, cerca]);
  const cur: Bolla | undefined = lista.find((b) => b.id === sel) ?? lista[0];

  return (
    <>
      <div className="row between">
        <Chips value={filtro} options={['Da confermare', 'Tutte'] as const} onChange={(v) => { setFiltro(v); setSel(null); }}
          counts={{ 'Da confermare': bolle?.filter((b) => b.stato === 'Nuova').length }} />
        <Search value={cerca} onChange={setCerca} />
      </div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div className="panel" style={{ flex: '1 1 280px', padding: 8, minWidth: 0 }}>
          {lista.length === 0 && <Empty>Nessuna bolla.</Empty>}
          <div className="list">
            {lista.map((b) => (
              <button key={b.id} className={'li' + (cur?.id === b.id ? ' on' : '')} onClick={() => { setSel(b.id); pulisci(); setFatto(''); }}>
                <span className="row between" style={{ width: '100%' }}><b>{b.cliente}</b>{statoBolla(b)}</span>
                <span className="lbl">{b.citta ?? '—'} · {b.colli_previsti === 1 ? '1 collo' : `${b.colli_previsti ?? '?'} colli`} · {b.operatore ?? '—'}</span>
              </button>
            ))}
          </div>
        </div>
        {cur && (
          <div className="panel card stack" style={{ flex: '2 1 420px', minWidth: 0 }}>
            <div className="row between"><h3 style={{ fontSize: 22, letterSpacing: '-.02em' }}>{cur.cliente} · {cur.tipo}</h3><span className="lbl">{cur.numero ? 'Bolla ' + cur.numero : 'Da numerare'}</span></div>
            <div className="kv">
              <div><div className="lbl">Data</div><b>{cur.data_consegna ? new Date(cur.data_consegna).toLocaleDateString('it-IT') : '—'}</b></div>
              <div><div className="lbl">Fascia</div><b>{cur.fascia ?? '—'}</b></div>
              <div><div className="lbl">Indirizzo</div><b>{cur.indirizzo ?? '—'}</b></div>
              <div><div className="lbl">Colli</div><b>{cur.colli_previsti ?? '—'}</b></div>
              <div><div className="lbl">Accessori</div><b>{cur.accessori.join(', ') || '—'}</b></div>
            </div>
            {cur.stato === 'Nuova' && cur.dati_mancanti.length > 0 && (
              <>
                <Warn word="Bloccata" />
                {cur.dati_mancanti.map((d) => (
                  <div key={d} className="row" style={{ flexWrap: 'nowrap' }}>
                    <label className="field" style={{ flex: 1 }}><span className="lbl miss">{d}</span>
                      <input className="input" value={valori[cur.id + d] ?? ''} onChange={(e) => setValori({ ...valori, [cur.id + d]: e.target.value })} />
                    </label>
                    <Btn ghost disabled={!valori[cur.id + d]?.trim() || inCorso}
                      onClick={() => esegui(() => api.completaBolla(cur.id, d, valori[cur.id + d].trim()))}>Salva</Btn>
                  </div>
                ))}
              </>
            )}
            <Errore testo={errore} />
            {fatto && <Msg>{fatto}</Msg>}
            {cur.stato === 'Nuova' && (
              <div className="row">
                <Btn disabled={cur.dati_mancanti.length > 0 || inCorso}
                  onClick={async () => { if (await esegui(() => api.confermaBolla(cur.id))) setFatto('Confermata: è nei giri e gli accessori sono già sull\'app dell\'autista.'); }}>Conferma</Btn>
                {cur.dati_mancanti.length > 0 && <Btn ghost onClick={() => setFatto('Mail al cliente pronta in Mail, con la domanda sui dati mancanti.')}>Chiedi</Btn>}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function statoBolla(b: Bolla) {
  if (b.stato === 'Nuova') return b.dati_mancanti.length ? <Pill tone="red">{b.dati_mancanti.length === 1 ? 'Manca 1' : `Mancano ${b.dati_mancanti.length}`}</Pill> : <Pill tone="dark">Pronta</Pill>;
  if (b.stato === 'Consegnata') return <Pill tone="ok">Consegnata</Pill>;
  if (b.stato === 'Giacenza' || b.stato === 'Non consegnata') return <Pill tone="red">{b.stato}</Pill>;
  return <Pill>{b.stato}</Pill>;
}

// =================================================================== Magazzino
const SCHEDE = ['Pianta', 'Controllo', 'Missioni', 'Storico'] as const;
type Scheda = typeof SCHEDE[number];

export function Magazzino({ scheda }: { scheda?: string }) {
  const { vai } = useApp();
  const mappa: Record<string, Scheda> = { controllo: 'Controllo', missioni: 'Missioni', storico: 'Storico' };
  const s: Scheda = mappa[scheda ?? ''] ?? 'Pianta';
  const { dati: ctrl } = useDati((a) => a.controllo());
  const { dati: mis } = useDati((a) => a.missione());
  const ko = ctrl?.filter((r) => r.letti > 0 && r.letti !== r.attesi).length ?? 0;
  const bloccati = mis?.filter((m) => m.stato === 'Bloccato').length ?? 0;
  return (
    <>
      <Chips value={s} options={SCHEDE} onChange={(v) => vai('magazzino/' + v.toLowerCase())} counts={{ Controllo: ko, Missioni: bloccati }} />
      {s === 'Pianta' && <Pianta />}
      {s === 'Controllo' && <Controllo />}
      {s === 'Missioni' && <Missioni />}
      {s === 'Storico' && <StoricoMag />}
    </>
  );
}

function Pianta() {
  const { dati: posti } = useDati((a) => a.posti());
  const { dati: bancali } = useDati((a) => a.bancali());
  const [scaf, setScaf] = useState(7);
  const [posto, setPosto] = useState<string | null>(null);
  const pieni = new Map((bancali ?? []).filter((b) => b.posto).map((b) => [b.posto!, b]));
  const scaffali = [...new Set((posti ?? []).filter((p) => p.scaffale).map((p) => p.scaffale!))];
  const bancale = posto ? pieni.get(posto) : undefined;
  const { dati: cont } = useDati((a) => bancale ? a.contenuto(bancale.id) : Promise.resolve([]), [bancale?.id]);
  return (
    <>
      <div className="row">{scaffali.map((n) => {
        const occ = (posti ?? []).filter((p) => p.scaffale === n && pieni.has(p.codice)).length;
        return <button key={n} type="button" className={'chip' + (scaf === n ? ' on' : '')} onClick={() => { setScaf(n); setPosto(null); }}>S{String(n).padStart(2, '0')}<span className="lbl" style={{ marginLeft: 6, color: 'inherit', opacity: .7 }}>{occ}</span></button>;
      })}</div>
      <div className="panel card stack">
        <b>Scaffale S{String(scaf).padStart(2, '0')}</b>
        {[6, 5, 4, 3, 2, 1].map((piano) => (
          <div key={piano} className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
            <span className="lbl" style={{ width: 54 }}>Piano {piano}</span>
            {[1, 2, 3].map((n) => {
              const cod = `S${String(scaf).padStart(2, '0')}-${piano}-${n}`; const b = pieni.get(cod);
              return (
                <button key={cod} type="button" onClick={() => setPosto(cod)} aria-pressed={posto === cod}
                  style={{ flex: 1, minHeight: 44, borderRadius: 10, border: posto === cod ? '2px solid var(--ink)' : '1px solid var(--line)',
                    background: b ? 'var(--solid)' : 'var(--surface)', color: b ? 'var(--on-solid)' : 'var(--muted)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  {b ? b.cliente : cod.slice(4)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {posto && (
        <div className="panel card stack">
          <div className="row between"><b style={{ fontSize: 18 }}>{posto}</b>{bancale ? <Pill tone="dark">{bancale.codice} · {bancale.cliente}</Pill> : <Pill>Libero</Pill>}</div>
          {bancale && (
            <div className="tbox"><table className="t nw"><thead><tr><th>Articolo</th><th>Pezzi</th><th>Codici</th><th>Come</th><th>Quando</th></tr></thead><tbody>
              {(cont ?? []).map((c) => <tr key={c.id} className={c.inserito === 'Manuale' ? 'ko' : ''}><td><b>{c.articolo}</b></td><td>{c.quantita}</td><td className="lbl">{c.codici.join(', ') || '—'}</td><td>{c.inserito}</td><td>{ora(c.il)}</td></tr>)}
            </tbody></table></div>
          )}
          <p className="lbl" style={{ margin: 0 }}>Il contenuto si cambia dall'app magazzino con la pistola. Le modifiche a mano restano in rosso e finiscono nello Storico.</p>
        </div>
      )}
    </>
  );
}

function Controllo() {
  const { dati } = useDati((a) => a.controllo());
  const ko = dati?.filter((r) => r.letti > 0 && r.letti !== r.attesi).length ?? 0;
  return (
    <>
      {ko ? <Warn word="Colli" n={ko} /> : <OkBox>Tutto torna.</OkBox>}
      <div className="tbox"><table className="t nw"><thead><tr><th>Ora</th><th>Bolla</th><th>Cliente</th><th>Movimento</th><th>In bolla</th><th>Letti</th><th>Esito</th></tr></thead><tbody>
        {(dati ?? []).map((r) => {
          const ok = r.letti === r.attesi;
          return <tr key={r.bolla_id} className={ok ? '' : 'ko'}><td>{ora(r.ultima_lettura)}</td><td>{r.numero ?? '—'}</td><td><b>{r.cliente}</b></td>
            <td>{r.tipo === 'Magazzino' ? 'Entrata' : 'Uscita'}</td><td>{r.attesi.toLocaleString('it-IT')}</td><td>{r.letti.toLocaleString('it-IT')}</td>
            <td>{ok ? <Pill tone="ok">Torna</Pill> : <Pill tone="red">Mancano {r.attesi - r.letti}</Pill>}</td></tr>;
        })}
      </tbody></table></div>
      <p className="lbl" style={{ margin: 0 }}>Una spedizione con un collo non letto non parte: il mezzo resta fermo finché i numeri non tornano.</p>
    </>
  );
}

function Missioni() {
  const { api } = useApp();
  const { dati } = useDati((a) => a.missione());
  const { esegui, errore, inCorso } = useAzione();
  const [motivi, setMotivi] = useState<Record<string, string>>({});
  const [scaf, setScaf] = useState('S07');
  const fatti = dati?.filter((m) => m.stato !== 'Da fare').length ?? 0;
  const bloccati = dati?.filter((m) => m.stato === 'Bloccato') ?? [];
  return (
    <>
      <div className="grid g2">
        <div className="panel card stack">
          <b>In corso</b>
          {dati && dati.length > 0 ? <>
            <div className="bar"><i style={{ width: `${Math.round(fatti / dati.length * 100)}%` }} /></div>
            <div className="lbl">{fatti} di {dati.length} posti · si salva a ogni scansione</div>
            {bloccati.length > 0 && <Warn word="Bloccati" n={bloccati.length} />}
          </> : <span className="lbl">Nessuna missione aperta.</span>}
        </div>
        <div className="panel card stack">
          <b>Nuova</b>
          <label className="field"><span className="lbl">Scaffale</span>
            <select className="input" value={scaf} onChange={(e) => setScaf(e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => 'S' + String(i + 1).padStart(2, '0')).map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <div><Btn disabled={inCorso} onClick={() => esegui(() => api.lanciaMissione('Scaffale', scaf))}>Lancia</Btn></div>
        </div>
      </div>
      <Errore testo={errore} />
      <div className="tbox"><table className="t"><thead><tr><th>Posto</th><th>Pezzi</th><th>Letti</th><th>Stato</th></tr></thead><tbody>
        {(dati ?? []).map((m) => <tr key={m.id} className={m.stato === 'Bloccato' ? 'ko' : ''}><td><b>{m.posto}</b></td><td>{m.attesi.length}</td><td>{m.letti.length}</td><td>{statoPosto(m)}</td></tr>)}
      </tbody></table></div>
      {bloccati.map((m) => (
        <div key={m.id} className="panel card stack" style={{ boxShadow: 'inset 0 0 0 2px var(--alert)' }}>
          <div className="row between"><b>{m.posto}</b><Pill tone="red">Bloccato</Pill></div>
          {m.mancanti.length > 0 && <div><span className="lbl">Manca </span><b className="miss">{m.mancanti.map((x) => `${x.articolo} (${x.codice})`).join(', ')}</b></div>}
          {m.extra.length > 0 && <div><span className="lbl">In più </span><b className="miss">{m.extra.join(', ')}</b></div>}
          <textarea className="input" rows={2} placeholder="Cosa è successo" value={motivi[m.id] ?? ''} onChange={(e) => setMotivi({ ...motivi, [m.id]: e.target.value })} />
          <div><Btn disabled={!motivi[m.id]?.trim() || inCorso} onClick={() => esegui(() => api.sbloccaPosto(m.id, motivi[m.id]))}>Sblocca</Btn></div>
        </div>
      ))}
      <p className="lbl" style={{ margin: 0 }}>Il magazziniere vede l'elenco del posto e scansiona nell'ordine che vuole. Se manca qualcosa o c'è un pezzo in più il posto resta bloccato: lo sblocca solo l'ufficio scrivendo cosa è successo, e resta nello Storico.</p>
    </>
  );
}

function statoPosto(m: PostoMissione) {
  if (m.stato === 'Fatto') return <Pill tone="ok">Fatto</Pill>;
  if (m.stato === 'Bloccato') return <Pill tone="red">Bloccato</Pill>;
  if (m.stato === 'Sbloccato') return <Pill tone="dark">Sbloccato</Pill>;
  return <span className="lbl">Da fare</span>;
}

function StoricoMag() {
  const { dati } = useDati((a) => a.storico());
  const [f, setF] = useState<'Tutto' | 'Pistola' | 'Manuale'>('Tutto');
  const righe = (dati ?? []).filter((r) => f === 'Tutto' || r.come === f);
  return (
    <>
      <Chips value={f} options={['Tutto', 'Pistola', 'Manuale'] as const} onChange={setF} />
      <div className="tbox"><table className="t nw"><thead><tr><th>Quando</th><th>Chi</th><th>Operazione</th><th>Cosa</th><th>Dove</th><th>Come</th></tr></thead><tbody>
        {righe.map((r) => <tr key={r.id} className={r.come === 'Manuale' ? 'ko' : ''}><td>{ora(r.quando)}</td><td><b>{r.chi_nome ?? 'Sistema'}</b></td><td>{r.operazione}</td><td>{r.cosa}</td><td>{r.dove ?? '—'}</td><td>{r.come ?? '—'}</td></tr>)}
      </tbody></table></div>
      <p className="lbl" style={{ margin: 0 }}>Lo storico non si può modificare né cancellare. Indica dove guardare; chi ha sbagliato lo decidete voi dopo aver parlato con la persona.</p>
    </>
  );
}

// ===================================================================== Clienti
export function Clienti() {
  const { dati: clienti } = useDati((a) => a.clienti());
  const [sel, setSel] = useState<string | null>(null);
  const [cerca, setCerca] = useState('');
  const cur = clienti?.find((c) => c.id === sel);
  const { dati: tariffe } = useDati((a) => sel ? a.tariffe(sel) : Promise.resolve([]), [sel]);
  const lista = (clienti ?? []).filter((c) => !cerca || c.nome.toLowerCase().includes(cerca.toLowerCase()));
  return (
    <>
      <div className="row between">{cur ? <Btn sm ghost onClick={() => setSel(null)}>← Clienti</Btn> : <span />}{!cur && <Search value={cerca} onChange={setCerca} />}</div>
      {!cur && (
        <div className="tbox"><table className="t"><thead><tr><th>Cliente</th><th>Portale</th><th>Note</th></tr></thead><tbody>
          {lista.map((c) => <tr key={c.id} className="click" onClick={() => setSel(c.id)}><td><b>{c.nome}</b></td><td>{c.portale_live ? <Pill tone="dark">Live</Pill> : <span className="lbl">—</span>}</td>
            <td className="lbl">{c.azienda_collegata ? 'Società del gruppo' : c.tramite ? 'Tramite ' + clienti!.find((x) => x.id === c.tramite)?.nome : ''}</td></tr>)}
        </tbody></table></div>
      )}
      {cur && (
        <div className="panel card stack">
          <h3 style={{ fontSize: 22 }}>{cur.nome}</h3>
          <div className="tbox"><table className="t"><thead><tr><th>Voce</th><th>Unità</th><th>Prezzo</th></tr></thead><tbody>
            {(tariffe ?? []).map((t) => <tr key={t.id}><td><b>{t.voce}</b></td><td>{t.unita}</td><td>{euro(t.prezzo)}</td></tr>)}
            {tariffe && tariffe.length === 0 && <tr><td colSpan={3} className="lbl">Nessuna tariffa: le inserisce il commerciale.</td></tr>}
          </tbody></table></div>
        </div>
      )}
    </>
  );
}

// ================================================================ Fatturazione
export function Fatturazione() {
  const { api } = useApp();
  const { dati } = useDati((a) => a.fatture());
  const { esegui, errore, inCorso } = useAzione();
  const [msg, setMsg] = useState('');
  const pronte = dati?.filter((f) => f.stato === 'Pronta').length ?? 0;
  const daControllare = dati?.filter((f) => f.stato === 'Da controllare').length ?? 0;
  return (
    <>
      {daControllare > 0 && <Warn word="Controllo" n={daControllare} />}
      <div className="tbox"><table className="t"><thead><tr><th>Cliente</th><th>Periodo</th><th>Totale</th><th>Stato</th><th>Incasso</th></tr></thead><tbody>
        {(dati ?? []).map((f) => (
          <tr key={f.id} className={f.stato === 'Da controllare' ? 'ko' : ''}>
            <td><b>{f.cliente}</b>{f.problema && <div className="lbl miss">{f.problema}</div>}</td><td>{f.periodo}</td><td>{euro(f.imponibile)}</td>
            <td>{f.stato === 'Pronta' ? <Pill tone="dark">Pronta</Pill> : f.stato === 'Inviata' || f.stato === 'Pagata' ? <Pill tone="ok">Inviata</Pill> : <Pill tone="red">{f.stato}</Pill>}</td>
            <td>{f.stato === 'Pagata' ? <Pill tone="ok">Pagata</Pill> : f.stato === 'Inviata' ? <Btn sm ghost disabled={inCorso} onClick={() => esegui(() => api.segnaPagata(f.id))}>Pagata</Btn> : <span className="lbl">—</span>}</td>
          </tr>
        ))}
      </tbody></table></div>
      <Errore testo={errore} />
      {msg && <Msg>{msg}</Msg>}
      <div className="row">
        <Btn disabled={!pronte || inCorso} onClick={async () => { let n = 0; if (await esegui(async () => { n = await api.inviaPronte(); })) setMsg(`${n} fatture inviate a Fatture in Cloud.`); }}>Invia</Btn>
        <Btn ghost disabled>Nuova</Btn>
        <span className="lbl">Ogni voce rimanda alla sua consegna. Quando il cliente paga premi «Pagata»: sale l'Incassato in Home.</span>
      </div>
    </>
  );
}
