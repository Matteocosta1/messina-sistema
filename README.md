# Messina · sistema

Gestionali, portale clienti e app di **Messina Autotrasporti** e **Messina Corporation**.

## Cosa c'è (fase 1: le basi)

| Parte | Dove | Stato |
|---|---|---|
| Database: tabelle, permessi per ruolo (RLS), regole delle chiusure, storico non cancellabile | `supabase/migrations` | Pronto e testato |
| Dati di prova (finti) | `supabase/seed.sql` | Pronto |
| Test dei permessi e delle regole | `supabase/tests` | Passano tutti |
| Design system (bianco e nero, vetro) | `packages/ui` | Pronto |
| Gestionale web (Trasporti e Corporation) | `apps/gestionale` | Home, Anomalie, Bolle, Magazzino, Clienti, Fatturazione · Home, Inventario, Lotti, Cellulari |
| Portale clienti | `apps/portale` | Fase 2 |
| App autisti, magazzino, presenze, Corporation | `apps/mobile` | Fase 3, dopo la scelta dei dispositivi |

## Regole che valgono ovunque

- **Niente si chiude se i numeri non tornano.** I controlli sono nel database (trigger e funzioni), non solo nelle app:
  bolla con dati mancanti, consegna senza colli letti / firma / foto nitida, posto della missione con pezzi mancanti o in più,
  fattura pagata prima dell'invio.
- **Ognuno vede solo il suo.** Le due società sono separate; la Corporation vede solo i suoi bancali; ogni cliente
  vede solo i suoi dati (e quelli dei clienti che arrivano tramite lui, es. UniCredit tramite Econocom); l'autista vede solo il suo giro.
- **Lo storico non si cancella.** Ogni operazione resta con chi, quando, dove e come (pistola, manuale, foto).
- **Etichette di una sola parola.**

## Provare in locale

```bash
# database (serve PostgreSQL 16 in locale)
./supabase/tests/run.sh

# gestionale in modalità Prova (dati finti in memoria)
npm install
npm run anteprima      # poi apri http://localhost:8765
```

## Mettere online

1. **Supabase**: progetto nuovo dedicato a Messina (piano Pro + backup al secondo/PITR). Esegui le migrazioni in ordine
   (`supabase db push` con la CLI, oppure dall'SQL editor). Il `seed.sql` solo sul progetto di prova, mai su quello vero.
   Su Supabase **non** va eseguito `supabase/tests/00_supabase_stub.sql`.
2. **Utenti**: si creano da Supabase › Authentication; poi la direzione aggiunge la riga in `profili` con società e ruolo.
3. **Gestionale**: copia `apps/gestionale/config.example.js` in `config.js` con indirizzo e chiave **pubblica** del progetto;
   `npm run build` e pubblica la cartella `dist` (Vercel, Netlify o Cloudflare Pages) sul dominio, es. `gestionale.messina…`.
4. **Lettore presenze**: chiama la funzione `timbra` solo dal server (Edge Function con la chiave di servizio), mai dal browser.

## Struttura del database

- `20261020000100_base.sql`: società, ruoli, clienti, profili, dipendenti, funzioni di permesso, storico
- `20261020000200_trasporti.sql`: tariffe, mezzi, bolle, colli, giri, fermate, giacenze, fatture, Telepass, valore della bolla
- `20261020000300_magazzino.sql`: posti (S07-2-1), bancali, contenuto, missioni, controllo colli
- `20261020000400_corporation.sql`: lotti, device, vendite, ordini, stage PC e cellulari (Reset, Sblocco, Ticket, Chiuso)
- `20261020000500_presenze.sql`: badge con QR che cambia ogni 30 secondi, timbrature, correzioni, ferie
- `20261020000600_azioni.sql`: funzioni delle app (consegna, scansioni, missioni, sblocchi) e vista Anomalie
- `20261020000700_sicurezza.sql`: chiusura finale dei permessi

Prima di usare presenze, badge, Telepass e storico per valutare le persone: informativa firmata e verifica del consulente del lavoro
(anche per i dipendenti assunti dall'altra società).
