// J7: j7() del mockup approvato. Nel codice vero l'importazione dei file di J7, il confronto serale
// e il lavoro in parallelo non esistono ancora: la schermata ha la stessa impaginazione del mockup
// ma i tasti restano spenti finché non c'è la funzione (vedi STATO «Non fatto»).
import React, { useState } from 'react';
import { Chip, Pill } from '@messina/ui';

const FILE: [string, string][] = [['Clienti', 'clienti.csv'], ['Inventario', 'inventario.xlsx'], ['Bolle aperte', 'bolle_aperte.csv'], ['Storico', 'storico_2025.csv']];
const spento = { opacity: .35, cursor: 'not-allowed' } as const;

export function J7() {
  const [tab, setTab] = useState<'importa' | 'confronto' | 'parallelo'>('importa');
  return (<>
    <div className="row">{([['importa', 'Importa'], ['confronto', 'Confronto'], ['parallelo', 'Parallelo']] as const).map(([k, n]) => <Chip key={k} on={tab === k} onClick={() => setTab(k)}>{n}</Chip>)}</div>
    {tab === 'importa' && <>
      <div className="grid g4">{FILE.map(([n, f]) => <div key={n} className="glass card stack" style={{ gap: 8 }}>
        <div className="row between"><b>{n}</b><Pill>Da fare</Pill></div><div className="lbl">{f}</div><div className="bar"><i style={{ width: '0%' }} /></div></div>)}</div>
      <div className="row"><button type="button" className="btn" disabled style={spento}>Importa</button><span className="lbl">I file li esporta J7 in Excel o CSV. Prima si importa nel progetto di prova, poi una sera a magazzino fermo nel sistema vero.</span></div>
    </>}
    {tab === 'confronto' && <>
      <p className="lbl" style={{ margin: 0 }}>Ogni sera il sistema confronta i suoi totali con quelli di J7, cliente per cliente e posto per posto.</p>
      <div className="glass tbox"><table className="t" style={{ minWidth: 720 }}><thead><tr><th>Cliente</th><th>Cosa</th><th>J7</th><th>Sistema nuovo</th><th>Esito</th></tr></thead>
        <tbody><tr><td colSpan={5} className="lbl">Nessun confronto: J7 non è ancora importato.</td></tr></tbody></table></div>
    </>}
    {tab === 'parallelo' && <>
      <div className="grid g4">
        <div className="glass card"><div className="lbl">Sere controllate</div><div className="big">0 <span className="lbl">di 20</span></div></div>
        <div className="glass card"><div className="lbl">Di fila senza differenze</div><div className="big">0</div><div className="lbl">ne servono 10 per spegnere J7</div></div>
        <div className="glass card"><div className="lbl">Differenze trovate</div><div className="big">0</div><div className="lbl">tutte spiegate</div></div></div>
      <div className="glass card"><div className="lbl" style={{ marginBottom: 10 }}>Una casella per sera: nera se i numeri tornano, rossa se no</div>
        <div className="banchi">{Array.from({ length: 20 }, (_, i) => <span key={i} className="banco free" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}>{i + 1}</span>)}</div></div>
      <div className="row"><button type="button" className="btn" disabled style={spento}>Spegni J7</button><span className="lbl">Si spegne solo dopo 10 sere di fila in cui tutto torna.</span></div>
    </>}
  </>);
}
