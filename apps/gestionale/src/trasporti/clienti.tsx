import React, { useEffect, useState } from 'react';
import { Btn, Msg, Pill } from '@messina/ui';
import { useApp, useAzione, useDati, eur, meseISO, Mese, Errore } from '../core';

const fmtData = (d: string | null | undefined) => d ? new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '[data]';
const UNITA = ['spedizione', 'collo', 'bancale', 'kg', 'giorno', 'ora', 'percentuale', 'pezzo'];
const comeSiConta = (u: string) => u === 'percentuale' ? 'in percentuale' : u === 'ora' ? 'ogni ora' : u === 'giorno' ? 'al giorno' : 'a ' + u;

// ------------------------------------------------------------------ Clienti
export function Clienti({ scelto, titolo }: { scelto?: string; titolo: (t: string | null) => void }) {
  const { vai } = useApp();
  const [nuovo, setNuovo] = useState(false);
  const { dati } = useDati(async (d) => {
    const [clienti, bolle] = await Promise.all([
      d.from<any>('clienti').select('*').eq('azienda', 'trasporti').eq('attivo', true).order('nome'),
      d.from<any>('bolle').select('cliente_id').gte('data_consegna', meseISO() + '-01').neq('stato', 'Annullata'),
    ]);
    return { clienti, n: (id: string) => bolle.filter((b) => b.cliente_id === id).length };
  }, []);
  const c = dati?.clienti.find((x) => x.id === scelto);
  useEffect(() => { titolo(c?.nome ?? null); }, [c?.nome, titolo]);
  if (!dati) return null;
  if (c) return <Scheda c={c} />;
  return (<>
    <div className="row between"><Btn onClick={() => setNuovo(!nuovo)}>{nuovo ? 'Chiudi' : 'Nuovo cliente'}</Btn></div>
    {nuovo && <NuovoCliente onFatto={(id) => { setNuovo(false); vai('clienti/' + id); }} />}
    <div className="glass tbox"><table className="t"><thead><tr><th>Cliente</th><th>Cosa spedisce</th><th>Referente interno</th><th>Contratto fino al</th><th>Spedizioni mese</th></tr></thead><tbody>
      {dati.clienti.map((x) => <tr key={x.id} className="click" onClick={() => vai('clienti/' + x.id)}><td><b>{x.nome}</b></td><td>{x.cosa_spedisce ?? '—'}</td><td>{x.referente_interno ?? '—'}</td><td>{fmtData(x.contratto_al)}</td><td>{dati.n(x.id)}</td></tr>)}
    </tbody></table></div>
  </>);
}

function NuovoCliente({ onFatto }: { onFatto: (id: string) => void }) {
  const { db } = useApp();
  const az = useAzione();
  const [v, setV] = useState({ nome: '', cosa_spedisce: '', referente_interno: '', email: '', piva: '', fatturazione: 'Mensile' });
  const campo = (k: keyof typeof v, l: string, type = 'text') => <label className="field"><span className="lbl">{l}</span><input className="input" type={type} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>;
  const salva = () => az.esegui(async () => { const r = await db.from<any>('clienti').insert({ ...v, azienda: 'trasporti' }).select('id'); onFatto(r[0].id); });
  return <div className="glass card stack">
    <h3 style={{ fontSize: 20 }}>Nuovo cliente</h3>
    <div className="grid g2">{campo('nome', 'Nome')}{campo('piva', 'Partita IVA')}{campo('email', 'Email per bolle e fatture', 'email')}{campo('cosa_spedisce', 'Cosa spedisce')}{campo('referente_interno', 'Referente interno')}
      <label className="field"><span className="lbl">Fatturazione</span><select className="input" value={v.fatturazione} onChange={(e) => setV({ ...v, fatturazione: e.target.value })}><option>Mensile</option><option>A spedizione</option></select></label></div>
    <Errore testo={az.errore} />
    <div className="row"><Btn onClick={salva} disabled={!v.nome.trim() || az.inCorso}>Salva</Btn></div>
  </div>;
}

function Scheda({ c }: { c: any }) {
  const { db, vai } = useApp();
  const az = useAzione();
  const [mod, setMod] = useState<null | { righe: Record<string, string>; nuove: any[]; eccezioni: string; esigenze: string }>(null);
  const { dati: tariffe } = useDati((d) => d.from<any>('tariffe').select('*').eq('cliente_id', c.id).order('voce'), [c.id]);
  if (!tariffe) return null;
  const base = tariffe.filter((t) => !t.quando), extra = tariffe.filter((t) => t.quando);
  const prezzo = (t: any) => mod ? <input className="input" type="number" step="0.01" min={0} style={{ width: 110, minHeight: 34, padding: '4px 8px' }} aria-label={'Prezzo ' + t.voce}
    value={mod.righe[t.id] ?? t.prezzo} onChange={(e) => setMod({ ...mod, righe: { ...mod.righe, [t.id]: e.target.value } })} /> : eur(t.prezzo);
  const salva = () => az.esegui(async () => {
    for (const t of tariffe) { const v = mod!.righe[t.id]; if (v !== undefined && Number(v) !== Number(t.prezzo)) await db.from('tariffe').update({ prezzo: Number(v) }).eq('id', t.id); }
    const nuove = mod!.nuove.filter((n) => n.voce.trim() && n.prezzo !== '');
    if (nuove.length) await db.from('tariffe').insert(nuove.map((n) => ({ cliente_id: c.id, voce: n.voce.trim(), unita: n.unita, prezzo: Number(n.prezzo), zona: n.zona || null, quando: n.quando || null })));
    if (mod!.eccezioni !== (c.eccezioni ?? '') || mod!.esigenze !== (c.esigenze ?? '')) await db.from('clienti').update({ eccezioni: mod!.eccezioni || null, esigenze: mod!.esigenze || null }).eq('id', c.id);
  }).then((ok) => ok && setMod(null));
  const contratto = async () => {
    const percorso = `contratti/${c.id}.pdf`;
    try { const u = await db.storage.link('documenti', percorso); if (u) { window.open(u, '_blank', 'noopener'); return; } } catch { /* non c'è ancora: si carica */ }
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/pdf';
    i.onchange = () => { const f = i.files?.[0]; if (f) az.esegui(() => db.storage.carica('documenti', percorso, f)); }; i.click();
  };
  const riga = (n: any, k: string, l: string, w = 140) => <input className="input" aria-label={l} placeholder={l} style={{ minWidth: w, minHeight: 34, padding: '4px 8px' }} value={n[k]}
    onChange={(e) => setMod({ ...mod!, nuove: mod!.nuove.map((x) => x === n ? { ...x, [k]: e.target.value } : x) })} />;
  return (<>
    <div className="row between"><Btn ghost onClick={() => vai('clienti')}>Tutti i clienti</Btn>
      <div className="row"><Btn ghost sm onClick={contratto}>Contratto PDF</Btn>
        {mod ? <><Btn sm onClick={salva} disabled={az.inCorso}>Salva</Btn><Btn ghost sm onClick={() => setMod(null)}>Annulla</Btn></>
          : <Btn sm onClick={() => setMod({ righe: {}, nuove: [], eccezioni: c.eccezioni ?? '', esigenze: c.esigenze ?? '' })}>Modifica tariffe</Btn>}</div></div>
    <Errore testo={az.errore} />
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Cosa spedisce</div><b>{c.cosa_spedisce ?? '—'}</b></div>
      <div className="glass card"><div className="lbl">Referente interno</div><b>{c.referente_interno ?? '—'}</b></div>
      <div className="glass card"><div className="lbl">Contratto</div><b>dal {fmtData(c.contratto_dal)} al {fmtData(c.contratto_al)}</b></div>
      <div className="glass card"><div className="lbl">Fatturazione</div><b>{c.fatturazione ?? '[mensile o a spedizione]'}</b></div>
    </div>
    <div className="glass"><div style={{ padding: '14px 14px 0', fontWeight: 700 }}>Tariffa base</div><div className="tbox"><table className="t"><thead><tr><th>Voce</th><th>Unità</th><th>Zona</th><th>Prezzo</th></tr></thead><tbody>
      {base.map((r) => <tr key={r.id}><td><b>{r.voce}</b></td><td>{comeSiConta(r.unita)}</td><td>{r.zona ?? '—'}</td><td>{prezzo(r)}</td></tr>)}
      {!base.length && <tr><td colSpan={4} className="lbl">Nessuna tariffa base: premi «Modifica tariffe».</td></tr>}
    </tbody></table></div></div>
    <div className="glass"><div style={{ padding: '14px 14px 0', fontWeight: 700 }}>Accessori e voci extra</div><div className="tbox"><table className="t"><thead><tr><th>Voce</th><th>Come si conta</th><th>Prezzo</th><th>Quando scatta</th></tr></thead><tbody>
      {extra.map((r) => <tr key={r.id}><td><b>{r.voce}</b></td><td>{comeSiConta(r.unita)}</td><td>{prezzo(r)}</td><td className="lbl">{r.quando}</td></tr>)}
      {mod?.nuove.map((n, i) => <tr key={'n' + i}><td>{riga(n, 'voce', 'Voce')}</td>
        <td><select className="input" aria-label="Unità" style={{ minHeight: 34, padding: '4px 8px' }} value={n.unita} onChange={(e) => setMod({ ...mod, nuove: mod.nuove.map((x) => x === n ? { ...x, unita: e.target.value } : x) })}>{UNITA.map((u) => <option key={u} value={u}>{comeSiConta(u)}</option>)}</select></td>
        <td>{riga(n, 'prezzo', 'Prezzo', 90)}</td><td>{riga(n, 'quando', 'Quando scatta (vuoto = base)', 200)}</td></tr>)}
    </tbody></table></div>
      {mod && <div style={{ padding: 14 }}><Btn ghost sm onClick={() => setMod({ ...mod, nuove: [...mod.nuove, { voce: '', unita: 'spedizione', prezzo: '', zona: '', quando: '' }] })}>Aggiungi</Btn></div>}</div>
    <div className="grid g2">
      <div className="glass card"><b>Eccezioni e accordi</b>{mod ? <textarea aria-label="Eccezioni e accordi" value={mod.eccezioni} onChange={(e) => setMod({ ...mod, eccezioni: e.target.value })} style={{ marginTop: 8 }} />
        : <p style={{ margin: '8px 0 0' }}>{c.eccezioni ?? '[sconti, minimi, accordi particolari: li inserisce la Direzione]'}</p>}</div>
      <div className="glass card"><b>Cosa chiede il cliente</b>{mod ? <textarea aria-label="Cosa chiede il cliente" value={mod.esigenze} onChange={(e) => setMod({ ...mod, esigenze: e.target.value })} style={{ marginTop: 8 }} />
        : <p style={{ margin: '8px 0 0' }}>{c.esigenze ?? '[da chiarire]'}</p>}</div>
    </div>
  </>);
}

// ------------------------------------------------------------------ Fatturazione
export function Fatturazione() {
  const { db } = useApp();
  const az = useAzione();
  const [msg, setMsg] = useState('');
  const [editor, setEditor] = useState<null | { fattura?: any }>(null);
  const { dati } = useDati((d) => d.from<any>('fatture').select('*,clienti(nome),righe_fattura(*)').eq('azienda', 'trasporti').order('creata_il', { ascending: false }).limit(200), []);
  if (!dati) return null;
  const mese = meseISO();
  const F = dati.filter((f) => f.periodo === mese || !['Pagata'].includes(f.stato));
  const pronte = F.filter((f) => f.stato === 'Pronta');
  const daControllare = F.filter((f) => f.stato === 'Da controllare');
  const consegne = (f: any) => { const b = new Set(f.righe_fattura.map((r: any) => r.bolla_id).filter(Boolean)); return b.size || (f.righe_fattura[0]?.quantita ?? 0); };
  const extra = (f: any) => f.righe_fattura.slice(1).map((r: any) => `${r.voce} ×${Number(r.quantita).toLocaleString('it-IT')}`).join(' · ') || '—';
  const invia = (lista: any[]) => az.esegui(async () => {
    for (const f of lista) await db.fn('fatture-in-cloud', { fattura_id: f.id });  // la funzione la segna Inviata e la manda allo SdI
  }).then((ok) => ok && setMsg(`Fatture approvate e inviate a Fatture in Cloud.${daControllare.length ? ` ${daControllare.map((f) => 'Quella di ' + f.clienti?.nome).join(', ')} aspetta un controllo.` : ''}`));
  const pagata = (f: any) => az.esegui(() => db.from('fatture').update({ stato: 'Pagata' }).eq('id', f.id));
  return (<>
    <div className="glass tbox"><table className="t"><thead><tr><th>Cliente</th><th>Consegne</th><th>Accessori ed extra</th><th>Totale</th><th>Stato</th><th>Incasso</th></tr></thead><tbody>
      {F.map((f) => <tr key={f.id}><td><b>{f.clienti?.nome}</b></td><td>{consegne(f)}</td><td>{extra(f)}</td><td>{eur(f.imponibile)}</td>
        <td>{f.stato === 'Pronta' ? <Pill tone="dark">Pronta</Pill> : f.stato === 'Inviata' || f.stato === 'Pagata' ? <Pill tone="ok">Inviata</Pill> : f.stato === 'Bozza' ? <Pill>Bozza</Pill> : <Pill tone="red">{f.stato}</Pill>}</td>
        <td>{f.stato === 'Pagata' ? <Pill tone="ok">Pagata</Pill> : f.stato === 'Inviata' ? <Btn ghost sm onClick={() => pagata(f)} disabled={az.inCorso}>Pagata</Btn>
          : f.stato === 'Da controllare' || f.stato === 'Bozza' ? <Btn ghost sm onClick={() => setEditor({ fattura: f })}>Controlla</Btn> : <span className="lbl">—</span>}</td></tr>)}
      {!F.length && <tr><td colSpan={6} className="lbl">Nessuna fattura per {Mese().toLowerCase()}.</td></tr>}
    </tbody></table></div>
    {daControllare.map((f) => <div key={f.id} className="lbl">{f.clienti?.nome}: {f.problema}</div>)}
    {msg && <Msg>{msg}</Msg>}
    <Errore testo={az.errore} />
    <div className="row">{pronte.length > 0 && <Btn onClick={() => invia(pronte)} disabled={az.inCorso}>Invia</Btn>}
      <Btn ghost onClick={() => setEditor(editor ? null : {})}>{editor ? 'Chiudi' : 'Nuova'}</Btn>
      <span className="lbl">Ogni voce della fattura rimanda alla sua consegna. Quando il cliente paga, premi «Pagata»: sale l’Incassato in Home.</span></div>
    {editor && <Editor key={editor.fattura?.id ?? 'nuova'} fattura={editor.fattura} onFatto={(t) => { setEditor(null); setMsg(t); }} />}
  </>);
}

/** Nuova fattura (o controllo di una da controllare): righe già compilate da bolle e tariffe */
function Editor({ fattura, onFatto }: { fattura?: any; onFatto: (msg: string) => void }) {
  const { db } = useApp();
  const az = useAzione();
  const [cliente, setCliente] = useState<string>(fattura?.cliente_id ?? '');
  const [righe, setRighe] = useState<any[] | null>(fattura ? fattura.righe_fattura.map((r: any) => ({ ...r })) : null);
  const { dati: clienti } = useDati((d) => d.from<any>('clienti').select('id,nome,piva,fatturazione').eq('azienda', 'trasporti').eq('attivo', true).order('nome'), []);
  // righe proposte: bolle chiuse del mese non ancora fatturate × tariffe del cliente
  useDati(async (d) => {
    if (fattura || !cliente) return null;
    const [bolle, tariffe] = await Promise.all([
      d.from<any>('bolle').select('id,colli_previsti,accessori').eq('cliente_id', cliente).in('stato', ['Consegnata', 'Giacenza', 'Non consegnata']).gte('data_consegna', meseISO() + '-01'),
      d.from<any>('tariffe').select('*').eq('cliente_id', cliente),
    ]);
    const R: any[] = []; const base = tariffe.filter((t) => t.voce === 'Base');
    for (const t of base) R.push({ voce: 'Consegne', quantita: t.unita === 'spedizione' ? bolle.length : bolle.reduce((s, b) => s + (b.colli_previsti ?? 0), 0), prezzo: t.prezzo, bolle: bolle.map((b) => b.id) });
    const acc: Record<string, number> = {}; bolle.forEach((b) => (b.accessori ?? []).forEach((a: string) => { acc[a] = (acc[a] ?? 0) + 1; }));
    for (const [v, n] of Object.entries(acc)) { const t = tariffe.find((x) => x.voce === v); R.push({ voce: v, quantita: n, prezzo: t?.prezzo ?? 0 }); }
    setRighe(R);
    return null;
  }, [cliente]);
  const c = clienti?.find((x) => x.id === cliente);
  const tot = (righe ?? []).reduce((s, r) => s + Number(r.quantita || 0) * Number(r.prezzo || 0), 0);
  const cambia = (r: any, k: string, v: string) => setRighe(righe!.map((x) => x === r ? { ...x, [k]: v } : x));
  const salva = (stato: 'Bozza' | 'Inviata') => az.esegui(async () => {
    let id = fattura?.id;
    const imponibile = Math.round(tot * 100) / 100;
    if (!id) { const f = await db.from<any>('fatture').insert({ azienda: 'trasporti', cliente_id: cliente, periodo: meseISO(), imponibile, stato: 'Bozza' }).select('id'); id = f[0].id; }
    else { await db.from('righe_fattura').delete().eq('fattura_id', id); await db.from('fatture').update({ imponibile, problema: null }).eq('id', id); }
    await db.from('righe_fattura').insert(righe!.filter((r) => r.voce && Number(r.quantita)).map((r) => ({ fattura_id: id, voce: r.voce, quantita: Number(r.quantita), prezzo: Number(r.prezzo), bolla_id: r.bolla_id ?? null })));
    if (stato === 'Inviata') {
      if (fattura?.stato !== 'Pronta') await db.from('fatture').update({ stato: 'Pronta' }).eq('id', id);
      await db.fn('fatture-in-cloud', { fattura_id: id });
    }
  }).then((ok) => ok && onFatto(stato === 'Inviata' ? 'Fattura inviata a Fatture in Cloud, che la manda allo SdI. Resta registrata qui con cliente, bolle e incasso.' : 'Fattura salvata come bozza.'));
  const cella = (r: any, k: string, w: number, l: string, type = 'number') => <input className="input" type={type} aria-label={l} style={{ width: w, minHeight: 34, padding: '4px 8px' }} value={r[k]} onChange={(e) => cambia(r, k, e.target.value)} />;
  return <div className="glass card stack">
    <div className="row between"><h3 style={{ fontSize: 20 }}>{fattura ? 'Fattura da controllare' : 'Nuova fattura'}</h3><span className="lbl">Numero e data li assegna Fatture in Cloud</span></div>
    {fattura?.problema && <div className="warn">{fattura.problema}</div>}
    <div className="kv">
      <div><div className="lbl">Cliente</div>{fattura ? <b>{c?.nome}</b> : <select className="input" aria-label="Cliente" value={cliente} onChange={(e) => { setCliente(e.target.value); setRighe(null); }}><option value="">Scegli</option>{clienti?.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>}</div>
      <div><div className="lbl">Partita IVA</div><b>{c?.piva ?? '[dal cliente]'}</b></div>
      <div><div className="lbl">Pagamento</div><b>{c?.fatturazione ?? '[dal contratto]'}</b></div>
    </div>
    {righe && <div className="tbox"><table className="t"><thead><tr><th>Voce</th><th>Quantità</th><th>Prezzo</th><th>Totale</th></tr></thead><tbody>
      {righe.map((r, i) => <tr key={i}><td>{cella(r, 'voce', 180, 'Voce', 'text')}{r.voce === 'Consegne' && <span className="lbl"> dalle bolle di {Mese().toLowerCase()}</span>}</td><td>{cella(r, 'quantita', 90, 'Quantità')}</td><td>{cella(r, 'prezzo', 100, 'Prezzo')}</td><td>{eur(Number(r.quantita || 0) * Number(r.prezzo || 0))}</td></tr>)}
    </tbody></table></div>}
    {righe && <div><Btn ghost sm onClick={() => setRighe([...righe, { voce: '', quantita: 1, prezzo: 0 }])}>Aggiungi</Btn></div>}
    <div className="row between"><span className="lbl">Righe già compilate dalle bolle e dalle tariffe del cliente: si possono cambiare o aggiungere.</span><b>Totale {eur(tot)} + IVA</b></div>
    <Errore testo={az.errore} />
    <div className="row"><Btn onClick={() => salva('Inviata')} disabled={!cliente || !righe?.length || az.inCorso}>Invia</Btn><Btn ghost onClick={() => salva('Bozza')} disabled={!cliente || !righe?.length || az.inCorso}>Bozza</Btn></div>
  </div>;
}
