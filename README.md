# Messina · sistema

Gestionali, app, portale clienti e negozio di **Messina Autotrasporti** e **Messina Corporation**.
Un solo database Supabase; quattro siti React. Senza `config.js` ogni sito parte in **Prova** con dati di esempio.

Lo stato del progetto, le decisioni e il piano sono nel **Dossier Messina** (documento condiviso).
Per accendere tutto: [`docs/SETUP.md`](docs/SETUP.md).

## Cosa c'è

| Parte | Dove | Stato |
|---|---|---|
| Database: tabelle, permessi per ruolo (RLS), regole delle chiusure, storico non cancellabile, doppio fattore | `supabase/migrations` | Pronto, testato |
| Dati di prova (finti) | `supabase/seed.sql` | Solo per test e progetto di prova |
| Test dei permessi e delle regole | `supabase/tests` | Passano tutti |
| Edge Functions: mail Outlook, bolle, seriali, Fatture in Cloud, etichette, Stripe, lettore presenze, Telepass, resoconto | `supabase/functions` | Scritte; da provare con le chiavi |
| Gestionale (Trasporti e Corporation: la società la decide il profilo) | `apps/gestionale` | Completo in prova |
| App iPhone (web app installabile): Consegne, Magazzino, Entrate, Badge, Lettore | `apps/app` | Completa; fotocamera e stampa da provare su dispositivi veri |
| Portale clienti | `apps/portale` | Completo in prova |
| Negozio Corporation con Stripe | `apps/negozio` | Completo; pagamento da provare |
| Componenti e CSS copiati dal mockup approvato | `packages/ui` | `mockup.css` non si tocca: si cambia il mockup e si ricopia |
| Collegamento ai dati e motore Prova | `packages/dati` | — |

## Regole che valgono ovunque

- **Niente si chiude se i numeri non tornano.** I controlli sono nel database (trigger e funzioni), non solo nelle app.
- **Ognuno vede solo il suo.** Le due società sono separate; ogni cliente vede solo i suoi dati; l'autista solo il suo giro.
- **Doppio fattore per i ruoli delicati.** Per direzione, amministrazione e commerciale (elenco in `impostazioni`)
  il database pretende anche il codice dell'app di autenticazione. Ogni tabella nuova con RLS deve avere la regola
  `doppio_fattore`: il test `70_doppio_fattore.sql` fallisce se manca.
- **Lo storico non si cancella.** Ogni operazione resta con chi, quando, dove e come.
- **Etichette di una sola parola.** La ricerca dice solo «Cerca».

## Pubblicazione

| Dove | Quando | Come |
|---|---|---|
| Prova (`messina-prova`, siti `*-prova`) | A ogni push su `main` | Actions → Prova, da sola |
| Produzione | Solo a mano, con il sì di Matteo o Pier | Actions → Produzione, scrivendo `PRODUZIONE` |
| Backup cifrato su R2 | Ogni notte | Actions → Backup |

Il seed con i dati finti non va mai sul progetto vero.

## Provare in locale

```bash
npm run test:db        # database: serve PostgreSQL in locale (vedi supabase/tests/run.sh)
npm install            # la prima volta crea package-lock.json: va messo su GitHub
node apps/gestionale/build.mjs        # build di un'app (stesso comando per app, portale, negozio)
npm run anteprima      # gestionale in Prova su http://localhost:8765
```

Prima di usare presenze, badge, Telepass e storico per valutare le persone servono l'informativa ai dipendenti
e la verifica del consulente del lavoro (art. 4 dello Statuto dei lavoratori: accordo sindacale o autorizzazione
dell'Ispettorato), anche per i dipendenti assunti dall'altra società.
