// App Messina: una sola web app installabile sugli iPhone aziendali.
// Cosa si vede lo decide chi entra: autista → Consegne, magazzino → Magazzino,
// Corporation → Entrate (App Corporation), ogni dipendente → Badge. Più il Lettore all'ingresso (…/#lettore).
import '@messina/dati/prova-app';
import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@messina/ui/mockup.css';
import '@messina/ui/produzione.css';
import './app.css';
import { collega, type Config, type Fattore } from '@messina/dati';
import { motoreDiProva } from '@messina/dati/prova';
import { Pill } from '@messina/ui';
import { AppCtx, type Profilo, type Dipendente, ErroreApp } from './core';
import { ScanProvider } from './scanner';
import { Autisti } from './autisti';
import { Magazzino } from './magazzino';
import { Carico } from './carico';
import { Presenze, LettoreScr, ImpostaLettore, lettoreSalvato, salvaLettore, type Lettore } from './presenze';

declare global { interface Window { MESSINA?: Config } }
const db = collega(window.MESSINA, motoreDiProva);

type Modo = 'consegne' | 'magazzino' | 'entrate' | 'badge';
const NOMI: Record<Modo, string> = { consegne: 'Consegne', magazzino: 'Magazzino', entrate: 'Entrate', badge: 'Badge' };
function modiPer(io: Profilo, dip: Dipendente | null): Modo[] {
  const m: Modo[] = [];
  if (io.ruolo === 'autista') m.push('consegne');
  if (io.azienda === 'trasporti' && io.ruolo === 'magazzino') m.push('magazzino');
  if (io.azienda === 'corporation' && ['magazzino', 'vendite', 'stage', 'direzione'].includes(io.ruolo)) m.push('entrate');
  if (dip) m.push('badge');
  return m;
}
const leggiModo = (): Modo | null => { try { return localStorage.getItem('messina.modo') as Modo | null; } catch { return null; } };

function App() {
  const [io, setIo] = useState<Profilo | null | undefined>(undefined);
  const [dip, setDip] = useState<Dipendente | null>(null);
  const [giro, setGiro] = useState(0);
  const [modo, setModo] = useState<Modo | null>(leggiModo());
  const [lettore, setLettore] = useState<Lettore | null | 'imposta'>(() => lettoreSalvato() ?? (location.hash === '#lettore' ? 'imposta' : null));
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const f = () => setOnline(navigator.onLine); window.addEventListener('online', f); window.addEventListener('offline', f); return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); }; }, []);
  const carica = useCallback(async () => {
    const s = db.auth.sessione();
    if (!s) return setIo(null);
    try {
      if ((await db.auth.fattore()).stato !== 'ok') return setIo(null);   // manca il codice: lo chiede Login
      const p = await db.from<Profilo>('profili').select('id,azienda,ruolo,nome,cliente_id').eq('id', s.user.id).single();
      const d = await db.from<Dipendente>('dipendenti').select('id,nome,mansione,reparto,ore_settimana,azienda').eq('profilo_id', s.user.id).then((r) => r[0] ?? null, () => null);
      setDip(d); setIo(p);
    } catch { if (navigator.onLine) { await db.auth.logout(); setIo(null); } }
  }, []);
  useEffect(() => { if (!lettore) carica(); }, [carica, lettore]);
  const aggiorna = useCallback(() => setGiro((g) => g + 1), []);
  const esci = async () => { try { localStorage.removeItem('messina.modo'); } catch { /* */ } await db.auth.logout(); setModo(null); setDip(null); setIo(null); window.scrollTo(0, 0); };
  const scegli = (m: Modo) => { setModo(m); try { localStorage.setItem('messina.modo', m); } catch { /* */ } window.scrollTo(0, 0); };

  const offline = !online && <div className="offline"><Pill tone="red">Offline</Pill></div>;
  if (lettore === 'imposta') return <div className="appvera">{offline}<ImpostaLettore onFatto={(l) => { salvaLettore(l); setLettore(l); }} /></div>;
  if (lettore) return <div className="appvera">{offline}<ScanProvider prova={db.modo === 'prova'}>
    <LettoreScr db={db} lettore={lettore} onEsci={() => { salvaLettore(null); setLettore(null); history.replaceState(null, '', location.pathname); }} /></ScanProvider></div>;
  if (io === undefined) return null;
  if (!io) return <div className="appvera">{offline}<Login onEntra={carica} onLettore={() => { const l = { nome: 'Ingresso', chiave: 'prova' }; salvaLettore(l); setLettore(l); }} /></div>;
  const modi = modiPer(io, dip);
  const cur = modo && modi.includes(modo) ? modo : modi[0];
  if (!cur) return <div className="appvera"><div className="pscr"><div className="ptitle">Messina</div>
    <div className="lbl">Questa app è per autisti, magazzino e Corporation. Il tuo accesso è sul gestionale.</div>
    <button type="button" className="bigbtn ghost" onClick={esci}>Esci</button></div></div>;
  return (
    <AppCtx.Provider value={{ db, io, dip, aggiorna, giro }}>
      <ScanProvider prova={db.modo === 'prova'}>
        <div className="appvera conbarra">{offline}
          {cur === 'consegne' ? <Autisti /> : cur === 'magazzino' ? <Magazzino /> : cur === 'entrate' ? <Carico /> : <Presenze />}
          <nav className="barra" aria-label="Parti dell'app">
            {modi.length > 1 && modi.map((m) => <button key={m} type="button" className={'chipbtn' + (m === cur ? ' on' : '')} aria-pressed={m === cur} onClick={() => scegli(m)}>{NOMI[m]}</button>)}
            <button type="button" className="chipbtn" onClick={esci}>Esci</button>
          </nav>
        </div>
      </ScanProvider>
    </AppCtx.Provider>
  );
}

const PROVA = [['autista@prova.messina', 'Autista 1'], ['magazzino@prova.messina', 'Magazziniere 1'], ['vendite@prova.messina', 'Vendite · Corporation'], ['stage@prova.messina', 'Manuel']] as const;

function Login({ onEntra, onLettore }: { onEntra: () => void; onLettore: () => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [codice, setCodice] = useState('');
  const [fattore, setFattore] = useState<Fattore | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [attesa, setAttesa] = useState(false);
  useEffect(() => { if (db.auth.sessione()) db.auth.fattore().then((f) => f.stato === 'ok' ? onEntra() : setFattore(f), () => db.auth.logout()); }, [onEntra]);
  const entra = async (e?: string, p?: string) => {
    setAttesa(true); setErrore(null);
    try { await db.auth.login(e ?? email, p ?? pw); const f = await db.auth.fattore(); if (f.stato === 'ok') onEntra(); else setFattore(f); }
    catch (x) { setErrore((x as Error).message); } finally { setAttesa(false); }
  };
  const verifica = async () => {
    if (!fattore || fattore.stato === 'ok') return;
    setAttesa(true); setErrore(null);
    try { await db.auth.verifica(fattore.id, codice); onEntra(); } catch (x) { setErrore((x as Error).message); setCodice(''); } finally { setAttesa(false); }
  };
  const esci = () => { db.auth.logout().finally(() => { setFattore(null); setCodice(''); setPw(''); }); };
  if (fattore && fattore.stato !== 'ok') return (
    <form className="pscr" onSubmit={(e) => { e.preventDefault(); verifica(); }}>
      <div><div className="lbl">App Messina</div><div className="ptitle">Codice</div></div>
      {fattore.stato === 'nuovo' ? <>
        <div className="lbl">Primo accesso: inquadra il QR con un'app di autenticazione (per esempio Microsoft Authenticator), poi scrivi il codice di 6 cifre.</div>
        <img src={fattore.qr} alt="QR da inquadrare con l'app di autenticazione" width={180} height={180} style={{ alignSelf: 'center', background: '#fff', borderRadius: 12, padding: 8 }} />
        <div className="lbl" style={{ wordBreak: 'break-all' }}>Senza fotocamera: {fattore.segreto}</div>
      </> : <div className="lbl">Scrivi il codice di 6 cifre dell'app di autenticazione.</div>}
      <label className="field"><span className="lbl">Codice</span><input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus value={codice} onChange={(e) => setCodice(e.target.value)} /></label>
      <div style={{ flex: 1 }} />
      <button type="submit" className="bigbtn" disabled={attesa}>Conferma</button>
      <button type="button" className="bigbtn ghost" disabled={attesa} onClick={esci}>Esci</button>
      <ErroreApp testo={errore} />
    </form>
  );
  return (
    <form className="pscr" onSubmit={(e) => { e.preventDefault(); entra(); }}>
      <div><div className="lbl">App Messina</div><div className="ptitle">Entra</div></div>
      {db.modo === 'prova' ? <>
        <div className="lbl">Prova con dati di esempio: niente arriva a clienti o colleghi. Scegli chi sei.</div>
        {PROVA.map(([m, n]) => <button key={m} type="button" className="bigbtn ghost" style={{ textAlign: 'left' }} disabled={attesa} onClick={() => entra(m, 'prova')}>{n}</button>)}
        <button type="button" className="bigbtn ghost" style={{ textAlign: 'left' }} onClick={onLettore}>Lettore</button>
      </> : <>
        <label className="field"><span className="lbl">Email</span><input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span className="lbl">Password</span><input className="input" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <div style={{ flex: 1 }} />
        <button type="submit" className="bigbtn" disabled={attesa}>Entra</button>
      </>}
      <ErroreApp testo={errore} />
    </form>
  );
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* senza: l'app funziona lo stesso, solo non offline */ }); });
}
createRoot(document.getElementById('root')!).render(<App />);
