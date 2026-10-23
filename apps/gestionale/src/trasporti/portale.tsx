// Portale dentro Autotrasporti (voce «Portale» del menu, come nel mockup approvato: portaleBody()).
// Il portale è il programma dei clienti (apps/portale): qui si vede «con i loro occhi», cioè il portale vero
// con i permessi del cliente scelto. In Prova la pagina «Prova programma Messina» dà il programma del portale
// e il cliente di esempio; online l'indirizzo del portale (config portaleUrl). Come entrano i clienti veri
// e come la Direzione vede il portale di un cliente sono in STATO «Da decidere».
import React, { useEffect, useRef, useState } from 'react';
import { Chip } from '@messina/ui';
import { useApp } from '../core';

const CLIENTI: [string, string][] = [['Snam', 'snam@prova.messina'], ['Econocom', 'econocom@prova.messina']];
type Pagina = { PROGRAMMI?: Record<string, string> };

export function Portale() {
  const { db } = useApp();
  const [cli, setCli] = useState(CLIENTI[0][0]);
  const f = useRef<HTMLIFrameElement>(null);
  const prova = db.modo === 'prova';
  // in prova: il portale vero, dato dalla pagina della prova, con il cliente scelto
  const sorgente = (() => {
    if (!prova) return null;
    let h: string | undefined;
    try { h = (window.top as unknown as Pagina)?.PROGRAMMI?.portale; } catch { h = undefined; }
    if (!h) return null;
    const email = CLIENTI.find((c) => c[0] === cli)![1];
    return h.replace('window.MESSINA = {};', 'window.MESSINA = ' + JSON.stringify({ provaUtente: email }) + ';');
  })();
  const url = !prova ? (window.MESSINA as { portaleUrl?: string } | undefined)?.portaleUrl : undefined;
  // la cornice prende l'altezza del portale, così la pagina scorre come nel mockup
  useEffect(() => {
    const fr = f.current; if (!fr) return;
    let ro: ResizeObserver | null = null;
    const misura = () => { try { const d = fr.contentDocument; if (!d) return; fr.style.height = Math.max(420, d.documentElement.scrollHeight) + 'px'; } catch { /* altro dominio: altezza fissa */ } };
    const carica = () => { try { const d = fr.contentDocument; if (!d) return; const st = d.createElement('style'); st.textContent = 'html,body{background:transparent!important}.wrap{padding:0!important;max-width:none!important}.portbar{margin-bottom:14px}'; d.head.appendChild(st);
      ro = new ResizeObserver(misura); ro.observe(d.documentElement); misura(); } catch { /* */ } };
    fr.addEventListener('load', carica);
    return () => { fr.removeEventListener('load', carica); ro?.disconnect(); };
  }, [sorgente, url]);
  return (<>
    <div>
      {prova && <div className="row" style={{ gap: 6 }}>{CLIENTI.map(([n]) => <Chip key={n} on={cli === n} onClick={() => setCli(n)}>{n}</Chip>)}<span className="lbl">Prova: scegli il cliente</span></div>}
      <div style={{ height: 12 }} />
      {sorgente || url
        ? <iframe ref={f} key={cli} title={'Portale di ' + cli} name={'portale-' + cli.toLowerCase()} {...(sorgente ? { srcDoc: sorgente } : { src: url })}
            style={{ display: 'block', width: '100%', height: 640, border: 0, background: 'transparent' }} />
        : <div className="glass card lbl">Il portale si apre qui quando è collegato il suo indirizzo (portaleUrl).</div>}
    </div>
  </>);
}
