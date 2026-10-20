// Gestionale Messina: lo stesso codice serve Autotrasporti e Corporation.
// Quale dei due si vede lo decide il profilo di chi entra (azienda del profilo).
import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@messina/ui/mockup.css';
import '@messina/ui/produzione.css';
import { collega, type Config, type Fattore } from '@messina/dati';
import '@messina/dati/prova-recap';
import { motoreDiProva, ELENCO_PROVA } from '@messina/dati/prova';
import { Btn } from '@messina/ui';
import { AppCtx, type Profilo, Errore } from './core';
import { Trasporti } from './trasporti';
import { Corporation } from './corporation';

declare global { interface Window { MESSINA?: Config } }
const db = collega(window.MESSINA, motoreDiProva);
const leggiPercorso = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home';

function App() {
  const [io, setIo] = useState<Profilo | null | undefined>(undefined);
  const [percorso, setPercorso] = useState(leggiPercorso());
  const [giro, setGiro] = useState(0);
  const carica = useCallback(async () => {
    const s = db.auth.sessione();
    if (!s) return setIo(null);
    try {
      if ((await db.auth.fattore()).stato !== 'ok') return setIo(null);   // manca il codice: lo chiede Login
      setIo(await db.from<Profilo>('profili').select('id,azienda,ruolo,nome,cliente_id').eq('id', s.user.id).single());
    }
    catch { await db.auth.logout(); setIo(null); }
  }, []);
  useEffect(() => { carica(); }, [carica]);
  useEffect(() => {
    const f = () => { setPercorso(leggiPercorso()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const vai = useCallback((p: string) => { location.hash = '#/' + p; }, []);
  const aggiorna = useCallback(() => setGiro((g) => g + 1), []);

  if (io === undefined) return null;
  if (!io) return <Login onEntra={carica} />;
  if (io.ruolo === 'cliente' || io.ruolo === 'autista') return (
    <div className="login"><div className="glass box stack"><h1>Messina</h1>
      <p className="lbl" style={{ margin: 0 }}>{io.ruolo === 'cliente' ? 'Questo è il gestionale interno: il tuo accesso è sul portale clienti.' : 'Il tuo accesso è sull’app Messina del telefono.'}</p>
      <Btn onClick={() => db.auth.logout().then(() => location.reload())}>Esci</Btn></div></div>);
  return (
    <AppCtx.Provider value={{ db, io, vai, percorso, aggiorna, giro }}>
      {io.azienda === 'trasporti' ? <Trasporti /> : <Corporation />}
    </AppCtx.Provider>
  );
}

function Login({ onEntra }: { onEntra: () => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [codice, setCodice] = useState('');
  const [fattore, setFattore] = useState<Fattore | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [attesa, setAttesa] = useState(false);
  // sessione già aperta ma senza codice (pagina ricaricata a metà): si riparte dal codice
  useEffect(() => { if (db.auth.sessione()) db.auth.fattore().then((f) => f.stato === 'ok' ? onEntra() : setFattore(f), () => db.auth.logout()); }, [onEntra]);
  const dopo = async () => { const f = await db.auth.fattore(); if (f.stato === 'ok') onEntra(); else setFattore(f); };
  const entra = async (e?: string, p?: string) => {
    setAttesa(true); setErrore(null);
    try { await db.auth.login(e ?? email, p ?? pw); await dopo(); } catch (x) { setErrore((x as Error).message); } finally { setAttesa(false); }
  };
  const verifica = async () => {
    if (!fattore || fattore.stato === 'ok') return;
    setAttesa(true); setErrore(null);
    try { await db.auth.verifica(fattore.id, codice); onEntra(); } catch (x) { setErrore((x as Error).message); setCodice(''); } finally { setAttesa(false); }
  };
  const esci = () => { db.auth.logout().finally(() => { setFattore(null); setCodice(''); setPw(''); }); };
  if (fattore && fattore.stato !== 'ok') return (
    <div className="login">
      <form className="glass box stack" onSubmit={(e) => { e.preventDefault(); verifica(); }}>
        <h1>Messina</h1>
        {fattore.stato === 'nuovo' ? (<>
          <p className="lbl" style={{ margin: 0 }}>Primo accesso: inquadra il QR con un'app di autenticazione (per esempio Microsoft Authenticator), poi scrivi il codice di 6 cifre.</p>
          <img src={fattore.qr} alt="QR da inquadrare con l'app di autenticazione" width={180} height={180} style={{ alignSelf: 'center', background: '#fff', borderRadius: 12, padding: 8 }} />
          <p className="lbl" style={{ margin: 0, wordBreak: 'break-all' }}>Senza fotocamera: {fattore.segreto}</p>
        </>) : <p className="lbl" style={{ margin: 0 }}>Scrivi il codice di 6 cifre dell'app di autenticazione.</p>}
        <label className="field"><span className="lbl">Codice</span><input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus value={codice} onChange={(e) => setCodice(e.target.value)} /></label>
        <Btn type="submit" disabled={attesa}>Conferma</Btn>
        <Btn ghost disabled={attesa} onClick={esci}>Esci</Btn>
        <Errore testo={errore} />
      </form>
    </div>
  );
  const interni = ELENCO_PROVA.filter((u) => u.dove !== 'Cliente' && u.dove !== 'Autisti');
  return (
    <div className="login">
      <form className="glass box stack" onSubmit={(e) => { e.preventDefault(); entra(); }}>
        <h1>Messina</h1>
        {db.modo === 'prova' ? (<>
          <p className="lbl" style={{ margin: 0 }}>Prova con dati di esempio: niente arriva a clienti o colleghi. Scegli chi sei.</p>
          <div className="stack" style={{ gap: 8 }}>
            {interni.map((u) => <Btn key={u.email} ghost disabled={attesa} onClick={() => entra(u.email, 'prova')}>{u.nome} · {u.dove}</Btn>)}
          </div>
        </>) : (<>
          <label className="field"><span className="lbl">Email</span><input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field"><span className="lbl">Password</span><input className="input" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <Btn type="submit" disabled={attesa}>Entra</Btn>
        </>)}
        <Errore testo={errore} />
      </form>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
