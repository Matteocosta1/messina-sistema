import React, { useMemo, useState } from 'react';
import { Pill, Chips, Stat, Search, Empty, Btn, euro } from '@messina/ui';
import { useDati } from '../app';
import type { Device, StatoTelefono } from '../api/types';

export function HomeCorp() {
  const { dati: dev } = useDati((a) => a.device());
  const { dati: inc } = useDati((a) => a.incassiCorporation());
  const disp = dev?.filter((d) => d.stato === 'Disponibile').length ?? 0;
  return (
    <>
      <div className="grid g4">
        <Stat label="In magazzino" value={dev ? dev.filter((d) => d.stato !== 'Venduto').length : '…'} sub={`${disp} in vendita`} />
        <Stat label="Fermi" value={dev?.filter((d) => d.stato === 'Fermo').length ?? '…'} alert={!!dev?.some((d) => d.stato === 'Fermo')} sub="oltre 60 giorni" />
        <Stat label="Incassato oggi" value={inc ? euro(inc.incassato_oggi) : '…'} sub="al netto delle commissioni" />
        <Stat label="Incassato mese" value={inc ? euro(inc.incassato_mese) : '…'} sub="al netto delle commissioni" />
      </div>
    </>
  );
}

const STATI = ['Tutti', 'Disponibile', 'Venduto', 'Fermo', 'Reso'] as const;

export function Inventario() {
  const { dati } = useDati((a) => a.device());
  const [vista, setVista] = useState<'Tabella' | 'Schede'>('Tabella');
  const [stato, setStato] = useState<typeof STATI[number]>('Tutti');
  const [cerca, setCerca] = useState('');
  const lista = useMemo(() => (dati ?? [])
    .filter((d) => stato === 'Tutti' || d.stato === stato)
    .filter((d) => !cerca || [d.seriale, d.marca, d.modello, d.cpu, d.lotto, d.posto].join(' ').toLowerCase().includes(cerca.toLowerCase())), [dati, stato, cerca]);
  return (
    <>
      <div className="row between">
        <Chips value={stato} options={STATI} onChange={setStato} />
        <div className="row"><Chips value={vista} options={['Tabella', 'Schede'] as const} onChange={setVista} /><Search value={cerca} onChange={setCerca} /></div>
      </div>
      {!dati && <Empty>…</Empty>}
      {dati && vista === 'Tabella' && (
        <div className="tbox"><table className="t nw" style={{ minWidth: 1500 }}><thead><tr>
          <th>Seriale</th><th>Marca</th><th>Modello</th><th>Processore</th><th>Scheda video</th><th>RAM</th><th>Disco</th><th>Schermo</th>
          <th>Grado</th><th>Lotto</th><th>Bancale</th><th>Posto</th><th>Costo</th><th>Prezzo</th><th>Stato</th><th>Siti</th><th>Giorni</th></tr></thead><tbody>
          {lista.map((d) => <tr key={d.id}><td><b>{d.seriale}</b></td><td>{d.marca}</td><td>{d.modello}</td><td>{d.cpu}</td><td>{d.gpu}</td><td>{d.ram}</td><td>{d.disco}</td><td>{d.schermo}</td>
            <td>{d.grado}</td><td>{d.lotto}</td><td>{d.bancale}</td><td>{d.posto}</td><td>{euro(d.costo)}</td><td>{euro(d.prezzo)}</td><td>{statoDev(d)}</td><td className="lbl">{d.siti.join(', ')}</td><td>{d.giorni}</td></tr>)}
        </tbody></table></div>
      )}
      {dati && vista === 'Schede' && (
        <div className="grid g3">{lista.map((d) => (
          <div key={d.id} className="panel card stack" style={{ gap: 6 }}>
            <div className="row between"><b>{d.marca} {d.modello}</b>{statoDev(d)}</div>
            <div className="lbl">{d.cpu} · {d.gpu} · {d.ram} · {d.disco}</div>
            <div className="row between"><span className="big" style={{ fontSize: 24 }}>{euro(d.prezzo)}</span><Pill tone="dark">Grado {d.grado}</Pill></div>
            <div className="lbl">{d.seriale} · {d.lotto} · {d.bancale} {d.posto}</div>
            <div className="lbl">{d.siti.join(', ')}</div>
          </div>
        ))}</div>
      )}
      {dati && lista.length === 0 && <Empty>Nessun device.</Empty>}
    </>
  );
}

function statoDev(d: Device) {
  if (d.stato === 'Fermo' || d.stato === 'Reso') return <Pill tone="red">{d.stato}</Pill>;
  if (d.stato === 'Venduto') return <Pill tone="ok">Venduto</Pill>;
  return <Pill>{d.stato}</Pill>;
}

export function Lotti() {
  const { dati } = useDati((a) => a.lotti());
  return (
    <>
      <div className="tbox"><table className="t nw"><thead><tr><th>Lotto</th><th>Acquisto</th><th>Pezzi</th><th>Costo</th><th>Venduti</th><th>Incassato</th><th>Recuperato</th></tr></thead><tbody>
        {(dati ?? []).map((l) => <tr key={l.id}><td><b>{l.codice}</b></td><td>{new Date(l.acquistato_il).toLocaleDateString('it-IT')}</td><td>{l.pezzi}</td><td>{euro(l.costo)}</td>
          <td>{l.venduti}</td><td><b>{euro(l.incassato)}</b></td><td style={{ minWidth: 160 }}><div className="bar"><i style={{ width: Math.min(100, l.recuperato_pct) + '%' }} /></div><span className="lbl">{l.recuperato_pct}%</span></td></tr>)}
      </tbody></table></div>
      <div className="row"><Btn ghost disabled>Carica</Btn><span className="lbl">L'incassato sale a ogni computer venduto del lotto. Il caricamento di fattura e DDT arriva nella prossima fase.</span></div>
    </>
  );
}

const STATI_TEL = ['Tutti', 'Reset', 'Sblocco', 'Ticket', 'Chiuso'] as const;
const SPIEGA: Record<StatoTelefono, string> = { Reset: 'da resettare', Sblocco: 'account iCloud/Google e MDM da togliere', Ticket: 'da chiudere sul portale', Chiuso: 'pronti da riconsegnare' };

export function Cellulari() {
  const { dati } = useDati((a) => a.telefoni());
  const [f, setF] = useState<typeof STATI_TEL[number]>('Tutti');
  const conta = (s: StatoTelefono) => dati?.filter((t) => t.stato === s).length ?? 0;
  return (
    <>
      <div className="grid g4">{(['Reset', 'Sblocco', 'Ticket', 'Chiuso'] as StatoTelefono[]).map((s) => <Stat key={s} label={s} value={conta(s)} sub={SPIEGA[s]} />)}</div>
      <Chips value={f} options={STATI_TEL} onChange={setF} />
      <div className="tbox"><table className="t nw"><thead><tr><th>IMEI</th><th>Marca</th><th>Modello</th><th>Cliente</th><th>Ticket</th><th>Operatore</th><th>Stato</th></tr></thead><tbody>
        {(dati ?? []).filter((t) => f === 'Tutti' || t.stato === f).map((t) => <tr key={t.id}><td>{t.imei}</td><td>{t.marca}</td><td><b>{t.modello}</b></td><td>{t.cliente}</td><td>{t.ticket}</td><td>{t.operatore ?? '—'}</td>
          <td>{t.stato === 'Chiuso' ? <Pill tone="dark">Chiuso</Pill> : t.stato === 'Ticket' ? <Pill tone="red">Ticket</Pill> : <Pill>{t.stato}</Pill>}</td></tr>)}
      </tbody></table></div>
      <p className="lbl" style={{ margin: 0 }}>Lo stato si calcola da solo: Reset, poi Sblocco su Habble, poi Ticket chiuso sul portale del cliente.</p>
    </>
  );
}
