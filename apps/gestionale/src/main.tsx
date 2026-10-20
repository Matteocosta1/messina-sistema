import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@messina/ui/src/styles.css';
import { Btn } from '@messina/ui';
import type { Api, Utente } from './api/types';
import { creaApiSupabase } from './api/supabase';
import { creaApiProva, UTENTI_PROVA } from './api/prova';
import { AppCtx, Guscio, InArrivo, vociPer, useDati, Errore } from './app';
import { Home, Anomalie, Bolle, Magazzino, Clienti, Fatturazione } from './pagine/trasporti';
import { HomeCorp, Inventario, Lotti, Cellulari } from './pagine/corporation';

// La configurazione arriva da config.js (indirizzo Supabase e chiave pubblica).
// Senza configurazione parte la modalità Prova con i dati finti.
declare global { interface Window { MESSINA?: { supabaseUrl?: string; supabaseKey?: string } } }
const cfg = window.MESSINA ?? {};
const api: Api = cfg.supabaseUrl && cfg.supabaseKey ? creaApiSupabase(cfg.supabaseUrl, cfg.supabaseKey) : creaApiProva();

const leggiPercorso = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home';

function App() {
  const [io, setIo] = useState<Utente | null | undefined>(undefined);
  const [percorso, setPercorso] = useState(leggiPercorso());
  const [giro, setGiro] = useState(0);

  useEffect(() => { api.utente().then(setIo).catch(() => setIo(null)); }, []);
  useEffect(() => {
    const f = () => { setPercorso(leggiPercorso()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const vai = useCallback((p: string) => { location.hash = '#/' + p; }, []);
  const aggiorna = useCallback(() => setGiro((g) => g + 1), []);

  if (io === undefined) return null;
  if (!io) return <Login onEntra={setIo} />;
  if (io.ruolo === 'cliente') return <div className="login"><div className="panel box stack"><h1>Portale</h1><p className="lbl">Il portale clienti è un sito a parte: questo è il gestionale interno.</p><Btn onClick={() => api.logout().then(() => location.reload())}>Esci</Btn></div></div>;
  return (
    <AppCtx.Provider value={{ api, io, vai, percorso, aggiorna, giro }}>
      <Pagina />
    </AppCtx.Provider>
  );
}

function Pagina() {
  const ctx = React.useContext(AppCtx)!;
  const { io, percorso } = ctx;
  const [sez, sotto] = percorso.split('/');
  const { dati: an } = useDati((a) => io.azienda === 'trasporti' ? a.anomalie() : Promise.resolve([]));
  const voci = vociPer(io).map((v) => v.id === 'anomalie' ? { ...v, badge: an?.length ?? 0 } : v);
  const permessa = voci.some((v) => v.id === sez);
  const titolo = (voci.find((v) => v.id === sez)?.nome ?? 'Home') + (sez === 'anomalie' && sotto ? ' · ' + sotto : '');
  let corpo: React.ReactNode;
  if (!permessa) corpo = <InArrivo cosa="Questa sezione non è tra le tue." />;
  else if (io.azienda === 'trasporti') {
    corpo = {
      home: <Home />, anomalie: <Anomalie sezione={sotto} />, bolle: <Bolle />, magazzino: <Magazzino scheda={sotto} />,
      clienti: <Clienti />, fatture: <Fatturazione />,
      mail: <InArrivo cosa="La posta Outlook dentro il programma: da ogni mail si crea la bolla. Serve il collegamento a Microsoft 365." />,
      traffico: <InArrivo cosa="I giri del giorno dopo, divisi per mezzo e autista, con l'ottimizzatore di percorsi per camion." />,
      giacenze: <InArrivo cosa="Le spedizioni tornate in magazzino, con riconsegna da prenotare e costo per il cliente. I dati ci sono già (tabella giacenze)." />,
      mezzi: <InArrivo cosa="I mezzi per tipo, con sponda, autista, Telepass e scadenze." />,
      autisti: <InArrivo cosa="Ogni autista con mezzo, giro di oggi, entrata e scadenze di patente e CQC." />,
      telepass: <InArrivo cosa="I passaggi di ogni mezzo, appena Telepass Business dà il collegamento." />,
      presenze: <InArrivo cosa="Timbrature, Correzioni, Allarmi, Riepiloghi, Ferie e conteggi del mese. Il database è già pronto, compreso il QR che cambia ogni 30 secondi." />,
    }[sez] ?? <Home />;
  } else {
    corpo = {
      home: <HomeCorp />, inventario: <Inventario />, lotti: <Lotti />, cellulari: <Cellulari />,
      mail: <InArrivo cosa="La posta di Econocom e Accenture, con le richieste riordinate dall'agente." />,
      ordini: <InArrivo cosa="Gli ordini dei siti, con il posto da cui prendere ogni computer." />,
      stage: <InArrivo cosa="Le 60 postazioni dello stage: ricevuti, formattati, in corso, falliti." />,
    }[sez] ?? <HomeCorp />;
  }
  return <Guscio voci={voci} titolo={titolo}>{corpo}</Guscio>;
}

function Login({ onEntra }: { onEntra: (u: Utente) => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [attesa, setAttesa] = useState(false);
  const entra = async (e?: string, p?: string) => {
    setAttesa(true); setErrore(null);
    try { onEntra(await api.login(e ?? email, p ?? pw)); } catch (x) { setErrore((x as Error).message); } finally { setAttesa(false); }
  };
  return (
    <div className="login">
      <form className="glass box stack" onSubmit={(e) => { e.preventDefault(); entra(); }}>
        <h1>Messina</h1>
        {api.modo === 'prova' ? (
          <>
            <p className="lbl" style={{ margin: 0 }}>Prova con dati finti. Scegli chi sei:</p>
            <div className="stack" style={{ gap: 8 }}>
              {UTENTI_PROVA.map((u) => <Btn key={u.email} ghost disabled={attesa} onClick={() => entra(u.email, 'prova')}>{u.nome}</Btn>)}
            </div>
          </>
        ) : (
          <>
            <label className="field"><span className="lbl">Email</span><input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="field"><span className="lbl">Password</span><input className="input" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
            <Btn type="submit" disabled={attesa}>Entra</Btn>
          </>
        )}
        <Errore testo={errore} />
      </form>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
