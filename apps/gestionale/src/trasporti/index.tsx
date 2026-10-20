// Gestionale Messina Autotrasporti: trasp() del mockup, sezione per sezione, con i dati veri.
import React, { useState } from 'react';
import { Shell, vociPer, useApp, useDati, T_NAV } from '../core';
import { Home, Anomalie } from './home';
import { MailT, Bolle, Traffico, Giacenze } from './bolle';
import { Magazzino } from './magazzino';
import { Clienti, Fatturazione } from './clienti';
import { Mezzi, Autisti, Telepass } from './mezzi';
import { Presenze } from './presenze';
import { Ricerca } from './ricerca';
import { Satellitare } from './satellitare';
import { Telecamere } from '../telecamere';

export function Trasporti() {
  const { io, percorso } = useApp();
  const [cerca, setCerca] = useState('');
  const [sez, sotto] = percorso.split('/');
  const { dati: an } = useDati((db) => db.from<any>('anomalie').select('sezione'), []);
  const voci = vociPer(io).map((v) => v.id === 'anomalie' ? { ...v, badge: an?.length ?? 0 } : v);
  const id = voci.some((v) => v.id === sez) ? sez : 'home';
  const [titolo, setTitolo] = useState<string | null>(null);
  const nome = T_NAV.find((v) => v.id === id)!.nome;
  const pagine: Record<string, React.ReactNode> = {
    home: <Home />, anomalie: <Anomalie sezione={sotto} titolo={setTitolo} />, mail: <MailT />, bolle: <Bolle scelta={sotto} />,
    traffico: <Traffico />, magazzino: <Magazzino tab={sotto} />, giacenze: <Giacenze />, clienti: <Clienti scelto={sotto} titolo={setTitolo} />,
    fatture: <Fatturazione />, mezzi: <Mezzi />, autisti: <Autisti />, telepass: <Telepass />, satellitare: <Satellitare />, presenze: <Presenze tab={sotto} />, telecamere: <Telecamere />,
  };
  return (
    <Shell voci={voci} titolo={cerca ? 'Cerca' : (id === 'anomalie' || id === 'clienti') && sotto && titolo ? titolo : nome} cerca={cerca} onCerca={setCerca}>
      {cerca ? <Ricerca testo={cerca} chiudi={() => setCerca('')} /> : <React.Fragment key={id}>{pagine[id]}</React.Fragment>}
    </Shell>
  );
}
