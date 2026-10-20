import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Api, Utente, Ruolo } from './api/types';
import { Badge } from '@messina/ui';

// ---------------------------------------------------------------- contesto
interface Ctx { api: Api; io: Utente; vai: (p: string) => void; percorso: string; aggiorna: () => void; giro: number }
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

/** carica dati in modo asincrono; si ricarica quando cambia `giro` (dopo ogni azione) */
export function useDati<T>(carica: (api: Api) => Promise<T>, deps: unknown[] = []) {
  const { api, giro } = useApp();
  const [dati, setDati] = useState<T | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    carica(api).then((d) => vivo && (setDati(d), setErrore(null))).catch((e) => vivo && setErrore(String(e.message ?? e)));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, giro, ...deps]);
  return { dati, errore };
}

/** esegue un'azione, mostra l'errore se il database la blocca, poi ricarica */
export function useAzione() {
  const { aggiorna } = useApp();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const esegui = useCallback(async (fn: () => Promise<unknown>) => {
    setInCorso(true); setErrore(null);
    try { await fn(); aggiorna(); return true; }
    catch (e) { setErrore(String((e as Error).message ?? e)); return false; }
    finally { setInCorso(false); }
  }, [aggiorna]);
  return { esegui, errore, inCorso, pulisci: () => setErrore(null) };
}

// ---------------------------------------------------------------- menu
export interface Voce { id: string; nome: string; ruoli?: Ruolo[]; badge?: number }

export const MENU_TRASPORTI: Voce[] = [
  { id: 'home', nome: 'Home' },
  { id: 'anomalie', nome: 'Anomalie' },
  { id: 'mail', nome: 'Mail', ruoli: ['bolle', 'commerciale'] },
  { id: 'bolle', nome: 'Bolle', ruoli: ['bolle', 'traffico'] },
  { id: 'traffico', nome: 'Traffico', ruoli: ['traffico'] },
  { id: 'magazzino', nome: 'Magazzino', ruoli: ['magazzino', 'traffico'] },
  { id: 'giacenze', nome: 'Giacenze', ruoli: ['bolle', 'traffico'] },
  { id: 'clienti', nome: 'Clienti', ruoli: ['commerciale', 'amministrazione', 'bolle'] },
  { id: 'fatture', nome: 'Fatturazione', ruoli: ['amministrazione'] },
  { id: 'mezzi', nome: 'Mezzi', ruoli: ['traffico', 'amministrazione'] },
  { id: 'autisti', nome: 'Autisti', ruoli: ['traffico', 'amministrazione'] },
  { id: 'telepass', nome: 'Telepass', ruoli: ['amministrazione', 'traffico'] },
  { id: 'presenze', nome: 'Presenze', ruoli: ['amministrazione'] },
];
export const MENU_CORPORATION: Voce[] = [
  { id: 'home', nome: 'Home' },
  { id: 'mail', nome: 'Mail', ruoli: ['vendite'] },
  { id: 'lotti', nome: 'Lotti', ruoli: ['vendite', 'amministrazione'] },
  { id: 'inventario', nome: 'Inventario' },
  { id: 'ordini', nome: 'Ordini', ruoli: ['vendite', 'magazzino'] },
  { id: 'stage', nome: 'Stage', ruoli: ['vendite', 'stage'] },
  { id: 'cellulari', nome: 'Cellulari', ruoli: ['vendite', 'stage'] },
];

export function vociPer(io: Utente): Voce[] {
  const menu = io.azienda === 'trasporti' ? MENU_TRASPORTI : MENU_CORPORATION;
  return menu.filter((v) => !v.ruoli || io.ruolo === 'direzione' || v.ruoli.includes(io.ruolo));
}

// ---------------------------------------------------------------- guscio
export function Guscio(p: { voci: Voce[]; titolo: string; azioni?: React.ReactNode; children: React.ReactNode }) {
  const { io, vai, percorso, api } = useApp();
  const sezione = percorso.split('/')[0] || 'home';
  const oggi = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className="wrap">
      <div className="gest">
        <nav className="side glass" aria-label="Sezioni">
          <div className="co"><b>MESSINA</b><span className="lbl">{io.azienda === 'trasporti' ? 'Autotrasporti' : 'Corporation'}</span></div>
          {p.voci.map((v) => (
            <a key={v.id} href={'#/' + v.id} className={'nav' + (sezione === v.id ? ' on' : '')} aria-current={sezione === v.id ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); vai(v.id); }}>{v.nome}{v.badge ? <Badge n={v.badge} /> : null}</a>
          ))}
          <button type="button" className="nav esci" onClick={() => api.logout().then(() => location.reload())}>Esci</button>
        </nav>
        <main className="content">
          <div className="chead">
            <div>
              <div className="lbl" style={{ textTransform: 'capitalize' }}>{oggi} · {io.nome}{api.modo === 'prova' ? ' · Prova' : ''}</div>
              <h2>{p.titolo}</h2>
            </div>
            {p.azioni && <div className="row">{p.azioni}</div>}
          </div>
          {p.children}
        </main>
      </div>
    </div>
  );
}

export function InArrivo({ cosa }: { cosa: string }) {
  return <div className="panel card"><b>In costruzione</b><p className="lbl" style={{ margin: '6px 0 0' }}>{cosa}</p></div>;
}

export function Errore({ testo }: { testo: string | null }) {
  return testo ? <div className="warn">{testo}</div> : null;
}

export { AppCtx };
