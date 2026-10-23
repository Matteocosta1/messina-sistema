// Telecamere: una sola sezione per tutto il capannone, uguale nei due gestionali, visibile solo alla Direzione.
// I video restano sul registratore in capannone; qui arrivano l'ultima immagine di ogni telecamera, gli avvisi e le foto delle scansioni.
import React, { useEffect, useState } from 'react';
import { Btn, Msg, Pill } from '@messina/ui';
import { useApp, useAzione, useDati, hm, giornoCorto, Errore } from './core';
import { Permesso } from './permesso';

/** immagine privata dello storage «telecamere» (link firmato, a tempo) */
function Foto({ percorso, className, alt }: { percorso: string | null | undefined; className?: string; alt: string }) {
  const { db } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let vivo = true; if (percorso) db.storage.link('telecamere', percorso).then((u) => vivo && setUrl(u), () => {}); return () => { vivo = false; }; }, [percorso]);
  // se la foto non si carica (manca, o in prova) resta il riquadro scuro del mockup
  // «Trasferisci» nella tabella: il nome del tasto dell'app magazzino, come nel mockup
  return url ? <img src={url} alt={alt} className={className} loading="lazy" onError={() => setUrl(null)} /> : <span className={className === 'cam-mini' ? 'cam-mini' : 'cam-img'} aria-hidden="true" />;
}

/** posto dove è finita la merce: l'arrivo del movimento se è un posto di scaffale o una zona, altrimenti «—» (es. caricata su un mezzo) */
const postoFoto = (dove: string | null | undefined) => { const x = String(dove ?? '').split('→').pop()!.trim(); return /^(S\d{2}(-\d+-\d+)?|RIC|PAS|GIA|RES|Ricevimento|Passaggio Apple|Giacenze|Resi)$/.test(x) ? x : '—'; };

/** ordine del mockup: dall'ingresso verso lo stage, come si gira il capannone; le altre dopo, in ordine di nome */
const GIRO = ['Ingresso', 'Piazzale', 'Baie di carico', 'Corsia S03', 'Corsia S07', 'Stage'];
const ordine = (n: string) => { const i = GIRO.indexOf(n); return i < 0 ? GIRO.length : i; };

export function Telecamere() {
  const { db } = useApp();
  const az = useAzione();
  const [sel, setSel] = useState<string | null>(null);
  const { dati } = useDati(async (d) => {
    const ieri = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [cam, avvisi, foto] = await Promise.all([
      d.from<any>('telecamere').select('*').eq('attiva', true).order('nome').then((r) => r.sort((a, b) => ordine(a.nome) - ordine(b.nome))),
      d.from<any>('cam_avvisi').select('*,telecamere(nome)').gte('quando', ieri).order('quando', { ascending: true }).limit(30),
      d.from<any>('cam_foto').select('*,telecamere(nome),storico(cosa,dove,operazione,chi_nome,quando)').order('quando', { ascending: false }).limit(30).then((r) => r.reverse()),   // le ultime 30, dalla più vecchia come nel mockup
    ]);
    return { cam, avvisi, foto };
  }, []);
  if (!dati) return null;
  const cur = dati.cam.find((c) => c.id === sel) ?? null;
  const visto = (id: string) => az.esegui(() => db.rpc('avviso_visto', { p_id: id }));
  const tile = (c: any, grande = false) => <>
    <Foto percorso={c.ultima_foto} alt={'Telecamera ' + c.nome} />
    <span className="cam-top"><span className="dot" />Dal vivo</span><span className="cam-nome">{c.nome}</span>
    <span className="cam-ora">{c.ultimo_contatto ? hm(c.ultimo_contatto) : '—'}</span>{grande ? null : null}</>;
  return (<>
    <div className="glass card row between" style={{ padding: '12px 16px' }}><span><b>Visibile solo alla Direzione</b> <span className="lbl">Tiziano, Sara, Matteo e Pierpaolo. Il commercialista vede i numeri, non le immagini.</span></span><Pill tone="dark">Rete separata</Pill></div>
    {/* Da decidere (STATO): il riquadro dell'accordo art. 4 e della conservazione (Permesso) non è nel mockup */}{void Permesso}
    <Errore testo={az.errore} />
    {!dati.cam.length ? <Msg>Nessuna telecamera collegata. Si attiva quando il computer in capannone, vicino al registratore, è collegato (docs/SETUP.md, Telecamere).</Msg>
      : <div className="camgrid">{dati.cam.map((c) => <button key={c.id} type="button" className={'tcam' + (sel === c.id ? ' on' : '')} onClick={() => setSel(sel === c.id ? null : c.id)}>{tile(c)}</button>)}</div>}
    {cur && <div className="glass card stack"><div className="row between"><b>{cur.nome} · grande</b><Btn ghost sm onClick={() => setSel(null)}>Chiudi</Btn></div>
      <div className="tcam big-cam">{tile(cur, true)}</div><div className="lbl">Le registrazioni restano sul registratore in capannone: si scorrono per ora da lì.</div></div>}
    <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
      <div className="glass card stack" style={{ flex: '1 1 360px', minWidth: 0 }}><b>Avvisi della notte</b>
        <div className="list">{dati.avvisi.length ? dati.avvisi.map((a) => <div key={a.id} className="li">
          <span className="row between" style={{ width: '100%' }}><b>{hm(a.quando)} · {a.telecamere?.nome ?? '—'}</b>
            {/* Da decidere (STATO): «Visto» non è nel mockup */}{void visto}{a.grave && !a.visto_il ? <Pill tone="red">Da guardare</Pill> : <Pill tone="ok">Normale</Pill>}</span>
          <span className="lbl">{a.descrizione}{a.foto ? ' · foto salvata' : ''}</span></div>) : <div className="lbl" style={{ padding: 10 }}>Nessun avviso nelle ultime 24 ore.</div>}</div>
        <span className="lbl">Gli avvisi arrivano anche sul telefono della Direzione.</span></div>
      <div className="glass tbox" style={{ flex: '2 1 520px', minWidth: 0 }}><div style={{ padding: '14px 14px 0', fontWeight: 700 }}>Foto delle scansioni</div>
        <table className="t nw"><thead><tr><th>Cosa</th><th>Posto</th><th>Movimento</th><th>Chi</th><th>Ora</th><th>Telecamera</th><th></th></tr></thead><tbody>
          {dati.foto.length ? dati.foto.map((f) => <tr key={f.id}><td><b>{f.storico?.cosa ?? '—'}</b></td><td>{postoFoto(f.storico?.dove)}</td><td>{f.storico?.operazione === 'Trasferimento' ? 'Trasferisci' : f.storico?.operazione ?? '—'}</td><td>{f.storico?.chi_nome ?? '—'}</td>
            <td>{giornoCorto(f.quando) === 'Oggi' ? hm(f.quando) : giornoCorto(f.quando) + ' ' + hm(f.quando)}</td><td>{f.telecamere?.nome ?? '—'}</td><td><Foto percorso={f.foto} className="cam-mini" alt="Foto della scansione" /></td></tr>)
            : <tr><td colSpan={7} className="lbl">Nessuna foto ancora.</td></tr>}
        </tbody></table>
        <p className="lbl" style={{ margin: 0, padding: '0 14px 14px' }}>A ogni scansione la telecamera più vicina salva una foto insieme al movimento: se qualcosa non torna, si apre il movimento e si vede cos’è successo.</p></div>
    </div>
  </>);
}
