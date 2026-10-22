// Satellitare e telecamere controllano anche il lavoro delle persone: per legge (art. 4 dello Statuto dei lavoratori)
// servono l'accordo sindacale o l'autorizzazione dell'Ispettorato. Finché la Direzione non li scrive qui, il database
// non accetta posizioni né foto. Qui si sceglie anche dopo quanto si cancellano (conservazione).
import React from 'react';
import { Btn, Chip, Msg } from '@messina/ui';
import { useApp, useAzione, useDati, useStato, Errore } from './core';

const TIPI = ['Accordo sindacale', 'Autorizzazione Ispettorato'];
const data = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT');

export function Permesso({ cosa }: { cosa: 'satellitare' | 'telecamere' }) {
  const { db, io } = useApp();
  const az = useAzione();
  const [s, set] = useStato({ apri: false, tipo: TIPI[0], data: '', rif: '', tempo: '' as string, msg: '' });
  const { dati } = useDati((d) => d.from<any>('impostazioni').select('chiave,valore').in('chiave', ['controllo_lavoratori', 'conservazione']), []);
  if (!dati) return null;
  const p = dati.find((x) => x.chiave === 'controllo_lavoratori')?.valore?.[cosa];
  const cons = dati.find((x) => x.chiave === 'conservazione')?.valore ?? {};
  const campo = cosa === 'satellitare' ? 'posizioni_mesi' : 'foto_giorni', unita = cosa === 'satellitare' ? 'mesi' : 'giorni';
  const dir = io.ruolo === 'direzione';
  const scrivi = () => az.esegui(() => db.rpc('scrivi_controllo', { p_cosa: cosa, p_tipo: s.tipo, p_data: s.data, p_rif: s.rif }))
    .then((ok) => ok && set({ apri: false, msg: 'Scritto: da ora si raccolgono i dati.' }));
  const tempo = () => { const v = s.tempo.trim() === '' ? null : Number(s.tempo);
    return az.esegui(() => db.rpc('scrivi_conservazione', { p_posizioni_mesi: cosa === 'satellitare' ? v : cons.posizioni_mesi ?? null, p_foto_giorni: cosa === 'telecamere' ? v : cons.foto_giorni ?? null }))
      .then((ok) => ok && set({ tempo: '', msg: v ? `Si cancellano dopo ${v} ${unita}.` : 'Non si cancella niente.' })); };
  return (
    <div className="glass card stack" style={{ gap: 8 }}>
      {p ? <div className="row between"><span><b>{p.tipo}</b> del {data(p.data)} · {p.rif}</span>{dir && !s.apri && <Btn ghost sm onClick={() => set({ apri: true, tipo: p.tipo, data: p.data, rif: p.rif, msg: '' })}>Cambia</Btn>}</div>
        : <div className="row between"><span className="miss">Manca l’accordo sindacale o l’autorizzazione dell’Ispettorato (art. 4 Statuto dei lavoratori): finché manca non si raccoglie niente.</span>
          {dir && !s.apri && <Btn sm onClick={() => set({ apri: true, msg: '' })}>Scrivi</Btn>}</div>}
      {s.apri && <div className="stack" style={{ gap: 8 }}>
        <div className="row">{TIPI.map((t) => <Chip key={t} on={s.tipo === t} onClick={() => set({ tipo: t })}>{t}</Chip>)}</div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field"><span className="lbl">Data</span><input className="input" type="date" value={s.data} onChange={(e) => set({ data: e.target.value })} /></label>
          <label className="field"><span className="lbl">Riferimento</span><input className="input" style={{ maxWidth: 220 }} value={s.rif} onChange={(e) => set({ rif: e.target.value })} /></label>
          <Btn onClick={scrivi} disabled={az.inCorso || !s.data || !s.rif.trim()}>Salva</Btn><Btn ghost onClick={() => set({ apri: false })}>Annulla</Btn>
        </div></div>}
      <div className="row" style={{ alignItems: 'center' }}>
        <span className="lbl">{cosa === 'satellitare' ? 'Posizioni' : 'Foto'}: {cons[campo] ? `si cancellano dopo ${cons[campo]} ${unita}` : 'non si cancellano'}</span>
        {dir && <><input className="input" style={{ maxWidth: 90 }} inputMode="numeric" aria-label={'Dopo quanti ' + unita} placeholder={unita} value={s.tempo} onChange={(e) => set({ tempo: e.target.value.replace(/\D/g, '') })} />
          <Btn ghost sm onClick={tempo} disabled={az.inCorso}>Salva</Btn></>}
      </div>
      {s.msg && <Msg>{s.msg}</Msg>}
      <Errore testo={az.errore} />
    </div>
  );
}
