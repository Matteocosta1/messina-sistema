# Messina · Accensione passo per passo

Per Alessandro. È lo stesso ordine della lista di attivazione (fondo bianco): si parte dagli account, poi si incollano le chiavi, poi si accendono le app.

**Regola d'oro sulle chiavi**

- In chat si possono mandare **solo due valori**: l'indirizzo del progetto Supabase (`https://….supabase.co`) e la chiave **publishable** (`sb_publishable_…`). Sono pubblici per natura: finiscono comunque nel browser.
- **Tutte le altre chiavi sono segrete e non vanno mai in chat**, né in mail, né su WhatsApp, né in un file del repository. Si incollano solo nei tre posti indicati qui sotto. Se una chiave segreta finisce per sbaglio in un posto sbagliato, va **revocata e rifatta subito**.
- I tre posti dove si incollano le chiavi segrete:
  1. **Supabase → Edge Functions → Secrets** ([dashboard](https://supabase.com/dashboard/project/_/functions/secrets)), oppure da terminale `supabase secrets set NOME=valore`
  2. **GitHub → repository messina-sistema → Settings → Secrets and variables → Actions** ([link](https://github.com/Matteocosta1/messina-sistema/settings/secrets/actions))
  3. **Bitwarden**, nella raccolta «Messina IT», come copia di sicurezza. È l'unico posto dove le chiavi restano leggibili.

Ogni account si apre con l'**email aziendale dedicata** (es. `it@dominio`), mai con email personali. Ogni account amministratore ha la **verifica in due passaggi con YubiKey** (la seconda YubiKey va in cassaforte).

---

## Fase 1 · Account e sicurezza

| # | Cosa | Costo | Dove |
|---|---|---|---|
| 1 | Email `it@dominio` su Microsoft 365 | già incluso nel vostro Microsoft 365 | [admin.microsoft.com](https://admin.microsoft.com) |
| 2 | Bitwarden Teams (password e chiavi dell'azienda) | **a pagamento**, 4 $/utente/mese, prova gratuita 7 giorni | [bitwarden.com/pricing/business](https://bitwarden.com/pricing/business/) |
| 3 | YubiKey 5C NFC, almeno 2 per amministratore | **a pagamento**, circa 71 € l'una, una volta | [yubico.com](https://www.yubico.com/it/product/yubikey-5c-nfc/) |
| 4 | GitHub: organizzazione o repository sul piano Team | **a pagamento**, 4 $/utente/mese | [github.com/pricing](https://github.com/pricing) |

Su ogni account: Impostazioni → Sicurezza → aggiungere la YubiKey come «security key / passkey», poi salvare i codici di recupero in Bitwarden.

## Fase 2 · Dominio e Cloudflare

| # | Cosa | Costo | Dove |
|---|---|---|---|
| 5 | Account Cloudflare con `it@dominio` | **gratis** (piano Free) | [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) |
| 6 | Dominio (comprato o trasferito su Cloudflare Registrar) | **a pagamento**, prezzo di costo, circa 10–15 €/anno | [Cloudflare Registrar](https://dash.cloudflare.com/?to=/:account/domains/register) |
| 7 | Cloudflare Pages: 7 progetti `messina-gestionale-trasporti`, `messina-gestionale-corporation`, `messina-app`, `messina-portale`, `messina-negozio`, `messina-sito-trasporti`, `messina-sito-corporation` | **gratis** (uso commerciale permesso) | Workers & Pages → Create → Pages → «Direct upload» |
| 8 | Cloudflare Zero Trust (gestionali dietro il login Microsoft) | **gratis** fino a 50 utenti | [one.dash.cloudflare.com](https://one.dash.cloudflare.com) |
| 9 | Cloudflare R2, bucket `messina-backup` | **gratis** fino a 10 GB, poi 0,015 $/GB/mese | R2 → Create bucket |

Sottodomini consigliati: `gestionale.dominio.it` (Autotrasporti), `corporation.dominio.it`, `app.dominio.it`, `portale.dominio.it`, `negozio.dominio.it`. I due **siti vetrina** vanno sui domini principali: `messina-sito-trasporti` su `www.` del dominio dei Trasporti, `messina-sito-corporation` su `www.` di quello della Corporation. In ogni progetto Pages: Custom domains → aggiungere il suo.

**Siti vetrina** (`apps/sito-trasporti`, `apps/sito-corporation`): HTML statico generato da `siti/` con `node siti/genera.mjs`: i testi di ogni pagina sono in `siti/trasporti.mjs` e `siti/corporation.mjs`, i pezzi comuni (menu, piede, moduli) in `siti/parti.mjs`, lo stile in `siti/comune.css`. Esce una cartella per pagina in `apps/sito-*/sito/` (quella che va online) e un file unico `anteprima.html` per il pannello di prova. I moduli (preventivo, ritiro, candidatura, contatto, lotto) chiamano la Edge Function `richiesta-sito`, che scrive nella Mail del gestionale (preventivi in Clienti, ritiri in Ordini, candidature e messaggi in In arrivo, lotti in Lotti) con controlli contro lo spam (campo esca, massimo 3 richieste l'ora per email, 60 l'ora per sito). Prima di metterli online vanno sostituiti i segnaposto tra parentesi quadre (telefono, email, ragione sociale, P.IVA, garanzia), fatta verificare la bozza di `privacy.html` e, consigliato, caricato il font Figtree sul sito invece che da Google Fonts (lo chiede la giurisprudenza tedesca sul GDPR; in Italia è prudenza).

Zero Trust: Settings → Authentication → aggiungere «Azure AD / Microsoft Entra ID»; Access → Applications → una per `gestionale.` e una per `corporation.`, con regola «email che finisce con @dominio». App, portale e negozio **non** vanno dietro Zero Trust (li usano autisti, clienti e acquirenti).

R2 → bucket `messina-backup` → Settings → Object lifecycle rules: cancellare i file più vecchi di 35 giorni.

**Chiavi Cloudflare** (segrete, vanno su GitHub → Secrets):

- `CLOUDFLARE_API_TOKEN`: [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) → Create Token → modello «Edit Cloudflare Workers» oppure personalizzato con il solo permesso *Account → Cloudflare Pages → Edit*.
- `CLOUDFLARE_ACCOUNT_ID`: nella home dell'account, colonna di destra. Non è segreto, ma va comunque lì.
- Per i backup, R2 → Manage R2 API Tokens → Create API token, permesso «Object Read & Write» **solo** sul bucket `messina-backup`. Ne escono `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e l'endpoint `https://<account-id>.r2.cloudflarestorage.com`, da mettere in `R2_ENDPOINT`. Il bucket va in `R2_BUCKET` (`messina-backup`).

## Fase 3 · Supabase

| # | Cosa | Costo | Dove |
|---|---|---|---|
| 10 | Organizzazione «Messina» sul piano **Pro** | **a pagamento**, 25 $/mese, senza prova (il piano Free mette in pausa i progetti) | [supabase.com/dashboard](https://supabase.com/dashboard) |
| 11 | Progetto `messina` nella regione **Frankfurt (eu-central-1)**, compute **Small** | **a pagamento**, circa 15 $/mese in più (il Pro include 10 $ di compute) | New project |
| 12 | Point-in-Time Recovery, 7 giorni | **a pagamento**, 100 $/mese; richiede almeno compute Small | Project Settings → Add-ons |
| 13 | Progetto `messina-prova` per le prove, compute Micro | compreso nel credito del Pro | New project |

Al momento della creazione Supabase chiede la **password del database**: va generata con Bitwarden (almeno 32 caratteri) e salvata lì. È `SUPABASE_DB_PASSWORD`.

Poi, nel progetto:

1. **Project Settings → General**: il «Reference ID» va su GitHub → Secrets come `SUPABASE_PROJECT_REF`, e in `supabase/config.toml` al posto di `XXXX-riferimento-progetto` (non è segreto).
2. **Project Settings → API Keys**: c'è la chiave `sb_publishable_…`, l'unica che si può mandare in chat. Va su GitHub → **Variables** (non Secrets) come `SUPABASE_PUBLISHABLE_KEY`, insieme a `SUPABASE_URL` (`https://<ref>.supabase.co`). La chiave `sb_secret_…` / service_role **non si copia da nessuna parte**: le Edge Functions la ricevono da sole.
3. **Database → Extensions**: accendere `pg_cron` e `pg_net` (servono per resoconto, posta e Telepass).
4. **Authentication → Sign In / Providers**: Email attivo, «Allow new users to sign up» **spento**. Authentication → Multi-Factor: TOTP attivo.
   **Authentication → URL Configuration**: «Site URL» = `https://portale.[dominio]`; in «Redirect URLs» aggiungere `https://portale.[dominio]/**`, `https://gestionale.[dominio]/**`, `https://corporation.[dominio]/**` e `https://app.[dominio]/**`. Senza questo il link «Password dimenticata» delle mail non riporta al sito.
5. **Access token per GitHub**: [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → Generate new token, nome «GitHub deploy». Va su GitHub → Secrets come `SUPABASE_ACCESS_TOKEN`.
6. **Connessione per i backup**: Connect → «Session pooler», copiare la stringa e sostituire `[YOUR-PASSWORD]` con la password del database. Va su GitHub → Secrets come `SUPABASE_DB_URL`.
7. **Chiave age per cifrare i backup**: su un computer dell'ufficio, `age-keygen -o messina-backup.key` ([age](https://github.com/FiloSottile/age), **gratis**). La riga `age1…` è la chiave pubblica: va su GitHub → **Variables** come `AGE_PUBLIC_KEY`. Il file `messina-backup.key` è la chiave privata: va in Bitwarden e su una chiavetta in cassaforte, **mai su GitHub**. Senza quella i backup non si aprono.

## Fase 4 · Primo deploy

**Interruttore.** Finché gli account non sono aperti, «Prova» e «Backup» non partono, così non arrivano mail di errore. Si accendono creando la variabile di repository `MESSINA_ATTIVO` con valore `si` (gratis): GitHub → Settings → Secrets and variables → Actions → Variables ([link](https://github.com/Matteocosta1/messina-sistema/settings/variables/actions)). Va creata quando Secrets e Variables qui sotto sono pronti.

0. **Versioni bloccate** (una volta sola, su un Mac con Node 22): nella cartella del progetto `npm install`, poi mettere su GitHub il file `package-lock.json` che si crea. Il deploy usa `npm ci`, che installa esattamente quelle versioni: senza il file il deploy si ferma apposta. Poi in GitHub → Settings → Code security attivare **Dependabot** (gratis), che segnala librerie e azioni da aggiornare e propone di bloccare le azioni al loro commit.

1. GitHub → Settings → **Environments** ([link](https://github.com/Matteocosta1/messina-sistema/settings/environments)): tre ambienti.
   - `prova`: nessuna approvazione. Riceve ogni modifica su `main` (Actions → **Prova**, parte da sola).
   - `produzione`: «Required reviewers» Matteo e Pier, e «Deployment branches» solo `main`. Parte **solo a mano**: Actions → **Produzione** → Run workflow, scrivendo `PRODUZIONE`.
   - `backup`: nessuna approvazione (altrimenti la copia notturna aspetterebbe un sì ogni notte). Contiene **solo** i segreti del backup.
2. In `prova` e `produzione` gli **stessi nomi**, ognuno con i valori del suo progetto:
   - **Secrets**: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - **Variables**: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, e gli indirizzi pubblici per i collegamenti tra i siti: `URL_NEGOZIO`, `URL_PORTALE`, `URL_SITO_TRASPORTI`, `URL_SITO_CORPORATION` (in prova quelli `-prova`)

   In `backup`: Secrets `SUPABASE_DB_URL` (del progetto di produzione), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`; Variable `AGE_PUBLIC_KEY`.
3. Su Cloudflare Pages i progetti di prova hanno il suffisso `-prova` (`messina-app-prova`, `messina-gestionale-trasporti-prova`, …), su sottodomini come `app-prova.dominio.it`.
4. Prima Actions → **Prova** → Run workflow. In ordine:
   1. carica le migrazioni del database (tabelle, permessi, regole, pianificazioni);
   2. pubblica le Edge Functions;
   3. costruisce i 7 siti, scrivendo `config.js` con URL e chiave publishable, e li pubblica su Cloudflare Pages.
   Se tutto va, Actions → **Produzione** → Run workflow: stessa cosa sul progetto vero, dopo il sì di Matteo o Pier.
5. Actions → **Backup** → Run workflow una volta a mano: in R2 deve comparire `messina-AAAA-MM-GG.dump.age`.

Il seed con i dati finti (`supabase/seed.sql`) **non** va mai sul progetto vero: serve solo per i test e, se volete, per `messina-prova`.

## Fase 5 · Segreti delle Edge Functions

Si incollano tutti in **Supabase → Edge Functions → Secrets** ([link](https://supabase.com/dashboard/project/_/functions/secrets)) → «Add new secret». `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` ci sono già: non vanno aggiunti.

Le funzioni che non trovano un segreto rispondono con un messaggio che dice quale manca. Si possono quindi accendere un servizio alla volta.

### Base (subito)

| Nome | Cosa mettere | Come crearlo |
|---|---|---|
| `CRON_SEGRETO` | 40 caratteri casuali | generatore di Bitwarden |
| `LETTORE_CHIAVE` | 40 caratteri casuali, diversi dal precedente | generatore di Bitwarden; si inserisce anche nel lettore QR all'ingresso (app Messina → modalità Lettore) |
| `ORIGINI_CONSENTITE` | gli indirizzi dei siti separati da virgola: `https://gestionale.dominio.it,https://corporation.dominio.it,https://app.dominio.it,https://portale.dominio.it,https://negozio.dominio.it` | in produzione va sempre messo; vuoto = qualunque sito (solo in prova). I permessi restano comunque quelli del database |

Poi nel **SQL Editor** di Supabase (una volta, non in chat):

```sql
select vault.create_secret('https://<ref>.supabase.co', 'progetto_url');
select vault.create_secret('<lo stesso valore di CRON_SEGRETO>', 'cron_segreto');
```

### Giri del giorno dopo (Traffico)

I giri li prepara il database da solo, dal lunedì al venerdì, all'ora scritta in `impostazioni` → `ora_giri` (ora di Roma, **15** se non la cambiate; il venerdì prepara anche il lunedì). Il lavoro pianificato si chiama `messina-giri` e lo crea la migrazione `20261021000400_traffico_giri.sql` se `pg_cron` è già acceso. Se l'avete acceso dopo, nel **SQL Editor** una volta:

```sql
select cron.schedule('messina-giri', '0 * * * 1-5', $$select public.prepara_giri_pianificato()$$);
```

Per cambiare l'ora: `update public.impostazioni set valore = '16' where chiave = 'ora_giri';`. Le spedizioni confermate dopo la preparazione entrano da sole nei giri e il giro torna «da confermare».

### File serale degli asset (UniCredit tramite Econocom)

Ogni sera il database salva il file degli asset di ogni cliente con «Asset» attivo nella scheda (IMEI, cespite, utente, stato, bancale, bolla): il cliente lo scarica dal portale, voce Asset. Il lavoro si chiama `messina-file-asset` e lo crea la migrazione `20261022000700_stage_asset.sql` se `pg_cron` è già acceso. Se l'avete acceso dopo, nel **SQL Editor** una volta:

```sql
select cron.schedule('messina-file-asset', '55 21 * * *', $$select public.salva_file_asset()$$);
```

L'invio del file su un server del cliente (FTP o SFTP) si aggiunge quando il cliente dà indirizzo e accesso.

### Claude (lettura mail, bolle, seriali, resoconto)

- `ANTHROPIC_API_KEY`: **a pagamento a consumo**, senza canone. Si caricano crediti in anticipo e Haiku 5.5 costa 0,10 $ per milione di token in entrata e 0,50 $ in uscita. Si crea su [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) con l'account `it@dominio`. In Limits conviene fissare un tetto di spesa mensile.
- `CLAUDE_MODELLO` (facoltativo): resta `claude-haiku-5-5` se non lo mettete.

### Microsoft 365 (Mail nei gestionali)

**Gratis**: è dentro il vostro Microsoft 365.

1. [entra.microsoft.com](https://entra.microsoft.com) → App registrations → New registration, nome «Messina gestionale», account solo di questa organizzazione.
2. API permissions → Microsoft Graph → *Application permissions*: `Mail.ReadWrite` e `Mail.Send` → «Grant admin consent».
3. **Limitare l'app alle sole caselle aziendali.** Senza questo passo l'app potrebbe leggere tutte le caselle dell'azienda. In Exchange Online PowerShell, con un gruppo che contiene solo le caselle condivise:
   `New-ApplicationAccessPolicy -AppId <MS_CLIENT_ID> -PolicyScopeGroupId caselle-gestionale@dominio -AccessRight RestrictAccess`
   (oppure le nuove «RBAC for Applications» di Exchange).
4. Certificates & secrets → New client secret, durata 12 mesi. Mettete in calendario il rinnovo.

| Nome | Dove si legge |
|---|---|
| `MS_TENANT_ID` | Overview → Directory (tenant) ID |
| `MS_CLIENT_ID` | Overview → Application (client) ID |
| `MS_CLIENT_SECRET` | il «Value» del client secret (si vede una volta sola) |
| `MS_CASELLA_TRASPORTI` | es. `ordini@dominio` |
| `MS_CASELLA_CORPORATION` | es. `vendite@dominio` |

### Fatture in Cloud (Fatturazione → SdI)

Va controllato quale piano avete: l'accesso alle API e la fattura elettronica dipendono dal piano. Se serve cambiarlo, è **a pagamento**.

1. [Fatture in Cloud → Impostazioni → Applicazioni collegate](https://secure.fattureincloud.it/) → crea un'applicazione con «token manuale», permessi *Documenti emessi* (lettura e scrittura) e *Fatturazione elettronica*. In alternativa, [developers.fattureincloud.it](https://developers.fattureincloud.it).
2. Se Autotrasporti e Corporation sono due aziende su Fatture in Cloud, servono due token: `FIC_ACCESS_TOKEN_TRASPORTI` / `FIC_COMPANY_ID_TRASPORTI` e `FIC_ACCESS_TOKEN_CORPORATION` / `FIC_COMPANY_ID_CORPORATION`. Se l'azienda è una sola, bastano `FIC_ACCESS_TOKEN` e `FIC_COMPANY_ID`.
3. Aliquote IVA: per ogni azienda l'id dell'aliquota 22% nel suo account (Impostazioni → Aliquote IVA), `FIC_IVA_ID_TRASPORTI` e `FIC_IVA_ID_CORPORATION` (con una sola azienda basta `FIC_IVA_ID`). Le altre si aggiungono solo se servono, con lo stesso nome più l'aliquota o la natura: `FIC_IVA_ID_TRASPORTI_10`, `FIC_IVA_ID_TRASPORTI_N3_1` (non imponibile), `FIC_IVA_ID_CORPORATION_MARGINE` (usato a regime del margine). Se una fattura usa un'aliquota che manca, l'invio si ferma e dice quale aggiungere.
4. Esiti dello SdI: ogni ora il programma chiede a Fatture in Cloud com'è andata ogni fattura inviata. Se lo SdI la scarta, torna «Da controllare» con il motivo da guardare in Fatture in Cloud.

### Stripe (negozio online)

Nessun canone: si paga una commissione su ogni vendita, per le carte europee standard 1,5 % + 0,25 €. Account con `it@dominio` su [dashboard.stripe.com/register](https://dashboard.stripe.com/register); per ricevere i pagamenti servono i dati della società e l'IBAN.

| Nome | Dove |
|---|---|
| `STRIPE_SECRET_KEY` | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) → «Create restricted key» con permessi *Checkout Sessions: Write*. Meglio della secret key completa. |
| `STRIPE_WEBHOOK_SECRET` | [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks) → Add endpoint `https://<ref>.supabase.co/functions/v1/stripe-webhook`, evento `checkout.session.completed` → «Signing secret» `whsec_…` |
| `SITO_URL` | es. `https://negozio.dominio.it` (non segreto) |

Prima con le chiavi **test** (`sk_test_…`, carta 4242 4242 4242 4242), poi con quelle live.

### Più avanti, quando arrivano i contratti

- **Corriere** (`CORRIERE_NOME`, `CORRIERE_API_KEY`): l'etichetta di spedizione si attiva dopo aver scelto il corriere e avuto la sua documentazione API.
- **Telepass Business** (`TELEPASS_UTENTE`, `TELEPASS_CHIAVE`): si attiva dopo la richiesta al referente Telepass Business.
- Prima di accendere Presenze, badge e Telepass sugli autisti servono l'informativa firmata dai dipendenti e la verifica del consulente del lavoro, anche per chi è assunto da un'altra società.
- **Satellitare dei mezzi** (`SAT_FORNITORE_URL`, `SAT_FORNITORE_CHIAVE`): i mezzi hanno già un satellitare; serve il nome del fornitore e l'accesso ai suoi dati (di solito un'API, a volte a pagamento: chiederlo al fornitore prima di firmare). Poi in Mezzi si scrive per ogni mezzo il suo codice presso il fornitore (colonna `satellitare`) e la funzione `satellitare-import` parte da sola ogni 15 minuti. La voce Satellitare la vede solo la Direzione. Per la geolocalizzazione dei dipendenti servono accordo sindacale o autorizzazione dell'Ispettorato e l'informativa agli autisti: da verificare con il consulente del lavoro prima di accenderla.
- **Telecamere** (`TELECAMERE_CHIAVE`, una chiave lunga e casuale): un piccolo computer in capannone, vicino al registratore, sulla rete separata delle telecamere e mai aperto su internet, chiama la funzione `telecamere-evento` con l'header `x-telecamere-chiave`. Ogni pochi secondi chiede `richieste` (le scansioni del magazzino che aspettano una foto) e risponde con `foto`; manda `avviso` per i movimenti di notte e `stato` con l'ultima immagine di ogni telecamera. Le foto finiscono nel bucket privato `telecamere`, che vede solo la Direzione (Tiziano, Sara, Matteo, Pierpaolo; non il commercialista). I video restano sul registratore. Per partire servono marca e modello di registratore e telecamere. Cartelli e autorizzazione ci sono già.

## Fase 6 · Primi utenti

Gli account li crea solo la Direzione: la registrazione libera è spenta.

1. Supabase → Authentication → Users → **Add user → Send invitation**, con l'email aziendale della persona.
2. SQL Editor, una riga per persona (azienda `trasporti` o `corporation`, ruolo tra `direzione`, `amministrazione`, `commerciale`, `bolle`, `traffico`, `magazzino`, `autista`, `vendite`, `stage`, `commercialista`):

```sql
insert into public.profili (id, azienda, ruolo, nome)
select id, 'trasporti', 'direzione', 'Matteo' from auth.users where email = 'matteo@dominio';
```

Amministratori: **Matteo e Pier**, più un terzo da decidere con loro. Con tre, se uno perde l'accesso gli altri due coprono.

**Doppio fattore obbligatorio.** Per i ruoli in `impostazioni` → `ruoli_doppio_fattore` (all'inizio direzione, amministrazione e commerciale) il database non apre niente con la sola password. Al primo accesso il gestionale o l'app mostra un QR da inquadrare con un'app di autenticazione (Microsoft Authenticator, gratis), poi chiede il codice di 6 cifre a ogni accesso. Se una persona perde il telefono: Supabase → Authentication → Users → la persona → rimuovere il fattore; al prossimo accesso ne collega uno nuovo.

Per gli autisti e il magazzino serve anche il collegamento alla scheda dipendente:
`update public.dipendenti set profilo_id = (select id from auth.users where email = '…') where nome = '…';`

I clienti del portale hanno ruolo `cliente` e il loro `cliente_id`.

**Chi lavora in tutte e due le società** (Matteo, Pier, i genitori, il commercialista): il profilo parte in una società, poi si aggiunge l'accesso all'altra. Nel gestionale compare il pulsante per passare da una all'altra; si lavora sempre in una alla volta, così i dati non si mescolano.

```sql
insert into public.accessi (profilo_id, azienda, ruolo)
select id, 'corporation', 'vendite' from auth.users where email = 'matteo@dominio';
```

Ruoli in più rispetto all'elenco sopra: `commercialista` (legge fatture, incassi, lotti e vendite delle due società; niente telecamere, satellitare, presenze o modifiche).
**Riepiloghi presenze**: li vede solo chi ha il permesso, per ogni società (all'inizio Angela e la madre; la direzione no):
`update public.accessi set riepiloghi_presenze = true where profilo_id = (select id from auth.users where email = '…') and azienda = 'trasporti';`
Dopo il primo avvio la direzione di una società può dare o togliere gli accessi alla sua società con `imposta_accesso` (mai il ruolo di direzione).

## Fase 7 · Da «Prova» a dati veri

Ogni app parte in **Prova** (dati di esempio, niente va a clienti o colleghi) finché non ha il suo `config.js`.

- **In produzione** il `config.js` lo scrive GitHub a ogni deploy, prendendo `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` dalle Variables. Non c'è niente da fare a mano.
- **Su un computer, per provare in locale**: copiare `apps/<app>/config.example.js` in `apps/<app>/config.js` e mettere l'URL e la chiave **publishable**. `config.js` non va su GitHub.
- Per tornare in Prova basta cancellare `config.js`. Anche un URL che contiene ancora `XXXX` fa partire la Prova.

Il deploy si rifiuta di partire se in `SUPABASE_PUBLISHABLE_KEY` trova una chiave segreta.

## Controllo finale

- [ ] Tutti gli account sono su `it@dominio`, con YubiKey e codici di recupero in Bitwarden
- [ ] Supabase Pro, Frankfurt, compute Small, PITR 7 giorni attivo
- [ ] Iscrizione libera spenta, TOTP attivo, `pg_cron` e `pg_net` accesi
- [ ] Vault: `progetto_url` e `cron_segreto` inseriti
- [ ] GitHub: ambienti `prova`, `produzione` (approvazione di Matteo e Pier, solo `main`) e `backup`; Secrets e Variables in ognuno
- [ ] Un accesso al gestionale con un utente di direzione chiede il codice; senza codice non si vede niente
- [ ] Deploy riuscito: 7 siti online (gestionale Trasporti e Corporation, app, portale, negozio, i due siti vetrina), ognuno sul suo indirizzo
- [ ] Gestionali raggiungibili solo dopo il login Microsoft (Zero Trust)
- [ ] Backup: un file `.dump.age` in R2 e una prova di ripristino su `messina-prova`, con la chiave privata age
- [ ] Segreti delle funzioni inseriti per i servizi già attivi; le funzioni rispondono senza «Manca il segreto…»
- [ ] Microsoft: l'app vede solo le caselle aziendali (Application Access Policy)
- [ ] Stripe: un acquisto di prova con la carta 4242 crea l'ordine in Corporation → Ordini
- [ ] Lettore QR: una timbratura valida e una con uno screenshot vecchio, che deve risultare rifiutata
- [ ] Primi utenti creati: 3 amministratori, poi uffici, magazzino, autisti
- [ ] Informativa ai dipendenti e verifica del consulente del lavoro fatte prima di attivare Presenze e Telepass
- [ ] Nessuna chiave segreta è mai passata in chat
