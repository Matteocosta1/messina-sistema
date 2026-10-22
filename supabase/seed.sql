-- =====================================================================
-- Dati di PROVA (finti): servono per provare il sistema prima dei dati
-- veri da J7. Le persone hanno nomi di ruolo, i prezzi sono inventati.
-- Password di tutti gli utenti di prova: si impostano dal pannello
-- Supabase (qui creiamo solo le righe).
-- =====================================================================

-- Persone di prova ----------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'direzione@prova.messina'),
  ('00000000-0000-0000-0000-000000000002', 'amministrazione@prova.messina'),
  ('00000000-0000-0000-0000-000000000003', 'bolle@prova.messina'),
  ('00000000-0000-0000-0000-000000000004', 'traffico@prova.messina'),
  ('00000000-0000-0000-0000-000000000005', 'magazzino@prova.messina'),
  ('00000000-0000-0000-0000-000000000006', 'autista@prova.messina'),
  ('00000000-0000-0000-0000-000000000007', 'commerciale@prova.messina'),
  ('00000000-0000-0000-0000-000000000008', 'vendite@prova.messina'),
  ('00000000-0000-0000-0000-000000000009', 'stage@prova.messina'),
  ('00000000-0000-0000-0000-000000000010', 'snam@prova.messina'),
  ('00000000-0000-0000-0000-000000000011', 'econocom@prova.messina'),
  ('00000000-0000-0000-0000-000000000012', 'autista2@prova.messina');

insert into public.clienti (id, azienda, nome, portale_live, azienda_collegata) values
  ('10000000-0000-0000-0000-000000000001', 'trasporti', 'Snam', true, null),
  ('10000000-0000-0000-0000-000000000002', 'trasporti', 'Apple', false, null),
  ('10000000-0000-0000-0000-000000000003', 'trasporti', 'Luxiona', false, null),
  ('10000000-0000-0000-0000-000000000004', 'trasporti', 'Econocom', true, null),
  ('10000000-0000-0000-0000-000000000006', 'trasporti', 'Messina Corporation', false, 'corporation'),
  ('10000000-0000-0000-0000-000000000007', 'trasporti', 'Velier', false, null),
  ('10000000-0000-0000-0000-000000000009', 'trasporti', 'Accenture', false, null);   -- lo stage di Accenture lo fattura la Trasporti
insert into public.clienti (id, azienda, nome, portale_live, tramite) values
  ('10000000-0000-0000-0000-000000000005', 'trasporti', 'UniCredit', true, '10000000-0000-0000-0000-000000000004');
insert into public.clienti (id, azienda, nome) values
  ('10000000-0000-0000-0000-000000000008', 'corporation', 'Accenture');

insert into public.profili (id, azienda, ruolo, nome, cliente_id) values
  ('00000000-0000-0000-0000-000000000001', 'trasporti', 'direzione', 'Direzione', null),
  ('00000000-0000-0000-0000-000000000002', 'trasporti', 'amministrazione', 'Angela', null),
  ('00000000-0000-0000-0000-000000000003', 'trasporti', 'bolle', 'Gabriele', null),
  ('00000000-0000-0000-0000-000000000004', 'trasporti', 'traffico', 'Mauro', null),
  ('00000000-0000-0000-0000-000000000005', 'trasporti', 'magazzino', 'Magazziniere 1', null),
  ('00000000-0000-0000-0000-000000000006', 'trasporti', 'autista', 'Autista 1', null),
  ('00000000-0000-0000-0000-000000000007', 'trasporti', 'commerciale', 'Gianluca', null),
  ('00000000-0000-0000-0000-000000000008', 'corporation', 'vendite', 'Vendite', null),
  ('00000000-0000-0000-0000-000000000009', 'corporation', 'stage', 'Manuel', null),
  ('00000000-0000-0000-0000-000000000010', 'trasporti', 'cliente', 'Referente Snam', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000011', 'trasporti', 'cliente', 'Referente Econocom', '10000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000012', 'trasporti', 'autista', 'Autista 2', null);

insert into public.dipendenti (id, azienda, nome, mansione, assunto_da, profilo_id) values
  ('20000000-0000-0000-0000-000000000001', 'trasporti', 'Autista 1', 'Autista', 'Altra società', '00000000-0000-0000-0000-000000000006'),
  ('20000000-0000-0000-0000-000000000002', 'trasporti', 'Autista 2', 'Autista', 'Altra società', '00000000-0000-0000-0000-000000000012'),
  ('20000000-0000-0000-0000-000000000003', 'trasporti', 'Magazziniere 1', 'Magazzino', 'Messina', '00000000-0000-0000-0000-000000000005'),
  ('20000000-0000-0000-0000-000000000004', 'trasporti', 'Gabriele', 'Ufficio bolle', 'Messina', '00000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000005', 'corporation', 'Manuel', 'Stage', 'Messina', '00000000-0000-0000-0000-000000000009');

-- Tariffe di prova (inventate) ------------------------------------------------
insert into public.tariffe (cliente_id, voce, unita, prezzo) values
  ('10000000-0000-0000-0000-000000000001', 'Base', 'spedizione', 85),
  ('10000000-0000-0000-0000-000000000001', 'Sponda', 'spedizione', 18),
  ('10000000-0000-0000-0000-000000000001', 'Giacenza', 'giorno', 5),
  ('10000000-0000-0000-0000-000000000001', 'Riconsegna', 'spedizione', 85),
  ('10000000-0000-0000-0000-000000000002', 'Base', 'collo', 9),
  ('10000000-0000-0000-0000-000000000002', 'Sabato', 'spedizione', 40),
  ('10000000-0000-0000-0000-000000000003', 'Base', 'bancale', 35),
  ('10000000-0000-0000-0000-000000000003', 'Attesa', 'ora', 30),
  ('10000000-0000-0000-0000-000000000004', 'Base', 'spedizione', 9),
  ('10000000-0000-0000-0000-000000000004', 'Entrata merce', 'pezzo', 0.22);

-- Mezzi -----------------------------------------------------------------------
insert into public.mezzi (id, targa, tipo, sponda, autista_id, telepass, revisione) values
  ('30000000-0000-0000-0000-000000000001', 'GA001AA', 'Motrice', true, '20000000-0000-0000-0000-000000000001', 'TP-01', current_date + 40),
  ('30000000-0000-0000-0000-000000000002', 'GA002BB', 'Furgone', false, '20000000-0000-0000-0000-000000000002', 'TP-02', current_date + 200),
  ('30000000-0000-0000-0000-000000000003', 'GA003CC', 'Bilico', true, null, 'TP-03', current_date + 12),
  ('30000000-0000-0000-0000-000000000004', 'GA004DD', 'Sprinter', false, null, 'TP-04', current_date + 90);

-- Magazzino: 12 scaffali × 6 piani × 3 posti, più le zone a terra ------------
insert into public.posti (codice, scaffale, piano, numero)
select 'S' || lpad(s::text, 2, '0') || '-' || p || '-' || n, s, p, n
from generate_series(1, 12) s, generate_series(1, 6) p, generate_series(1, 3) n;
insert into public.posti (codice, zona) values ('RIC', 'Ricevimento'), ('PAS', 'Passaggio'), ('RESI', 'Resi'), ('USC', 'Uscita');

-- Bolle ------------------------------------------------------------------------
insert into public.bolle (id, cliente_id, tipo, data_consegna, fascia, destinatario, indirizzo, citta, colli_previsti, accessori, dati_mancanti, stato, operatore_id) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Consegna', current_date + 1, 'Entro le 12', 'Snam', 'Via [indirizzo]', 'Milano', 4, '{Sponda}', '{Piano di consegna}', 'Nuova', '00000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Consegna', current_date + 1, '10–12', 'Apple Store', 'Via [indirizzo]', 'Rozzano', 12, '{}', '{}', 'Nuova', '00000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Consegna', current_date + 1, '9–13', 'Luxiona', 'Via [indirizzo]', 'Assago', 3, '{}', '{}', 'Nuova', '00000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Consegna', current_date, 'Entro le 12', 'Snam', 'Via [indirizzo]', 'Milano', 4, '{Sponda}', '{}', 'Nuova', '00000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'Consegna', current_date, '10–12', 'Apple', 'Via [indirizzo]', 'Pieve Emanuele', 8, '{}', '{}', 'Nuova', '00000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 'Magazzino', current_date, null, 'Messina', 'Lacchiarella', 'Lacchiarella', 32, '{}', '{}', 'Nuova', '00000000-0000-0000-0000-000000000003');

-- conferma (passa dal trigger: numera e controlla)
update public.bolle set stato = 'Confermata'
 where id in ('40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000006');

-- alla conferma il database crea i colli con il numero della bolla; qui i dati di prova usano codici fissi (C-4-001…) per i test
delete from public.colli;
insert into public.colli (bolla_id, codice)
select b.id, 'C-' || substr(b.id::text, 36, 1) || '-' || lpad(g::text, 3, '0')
from public.bolle b, generate_series(1, b.colli_previsti) g;

-- entrata Apple: 31 colli su 32 letti (anomalia di prova)
update public.colli set letto_entrata = now() - interval '2 hours'
 where bolla_id = '40000000-0000-0000-0000-000000000006' and codice <> 'C-6-032';

-- Giro di oggi --------------------------------------------------------------
insert into public.giri (id, data, mezzo_id, autista_id, zona, stato) values
  ('50000000-0000-0000-0000-000000000001', current_date, '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Milano Sud', 'Partito');
insert into public.fermate (id, giro_id, bolla_id, ordine) values
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 1),
  ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', 2);
update public.bolle set stato = 'In giro' where id in ('40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000005');
update public.colli set letto_carico = now() - interval '3 hours'
 where bolla_id in ('40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000005');

-- Bancali con contenuto (scaffale 7 per la missione) ---------------------------
insert into public.bancali (id, codice, cliente_id, posto_id)
select ('60000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'B-01' || lpad(n::text, 2, '0'),
       case when n <= 4 then '10000000-0000-0000-0000-000000000004'::uuid else '10000000-0000-0000-0000-000000000006'::uuid end,
       (select id from public.posti where codice = case n when 1 then 'S07-1-1' when 2 then 'S07-1-2' when 3 then 'S07-2-1'
                                                         when 4 then 'S07-2-2' when 5 then 'S11-2-1' else 'S11-2-2' end)
from generate_series(1, 6) n;

insert into public.contenuto (bancale_id, articolo, quantita, codici) values
  ('60000000-0000-0000-0000-000000000001', 'Notebook Lenovo T14', 2, '{PF1A001,PF1A002}'),
  ('60000000-0000-0000-0000-000000000001', 'Docking Lenovo', 1, '{DK1A001}'),
  ('60000000-0000-0000-0000-000000000002', 'Monitor Dell 24', 3, '{MN2B001,MN2B002,MN2B003}'),
  ('60000000-0000-0000-0000-000000000003', 'Notebook HP EliteBook', 2, '{HP3C001,HP3C002}'),
  ('60000000-0000-0000-0000-000000000004', 'Notebook Dell Latitude', 3, '{DL4D001,DL4D002,DL4D003}'),
  ('60000000-0000-0000-0000-000000000004', 'Docking Dell', 1, '{DK4D001}'),
  ('60000000-0000-0000-0000-000000000005', 'ThinkPad T14 Gen 2', 14, '{}');

-- Corporation: lotti, device, vendite, stage --------------------------------------
insert into public.lotti (id, codice, fornitore, acquistato_il, pezzi, costo) values
  ('70000000-0000-0000-0000-000000000001', 'L-014', 'Fornitore A', current_date - 60, 120, 18000),
  ('70000000-0000-0000-0000-000000000002', 'L-015', 'Fornitore B', current_date - 20, 80, 12800);

insert into public.device (id, seriale, marca, modello, cpu, gpu, ram, disco, schermo, grado, lotto_id, bancale_id, costo, prezzo, prezzo_minimo, stato, siti) values
  ('71000000-0000-0000-0000-000000000001', 'PF3XXXX1', 'Lenovo', 'ThinkPad T14 Gen 2', 'i5-1145G7', 'Intel Iris Xe', '16 GB', '256 GB SSD', '14"', 'B', '70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000005', 160, 249, 190, 'Disponibile', '{Back Market,Refurbed,eBay,Subito}'),
  ('71000000-0000-0000-0000-000000000002', 'PF3XXXX2', 'Lenovo', 'ThinkPad T14 Gen 2', 'i5-1145G7', 'Intel Iris Xe', '16 GB', '256 GB SSD', '14"', 'A', '70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000005', 160, 289, 220, 'Disponibile', '{Back Market,eBay}'),
  ('71000000-0000-0000-0000-000000000003', 'C02XXXX3', 'Apple', 'MacBook Air M1', 'Apple M1', 'Apple M1 7 core', '8 GB', '256 GB SSD', '13"', 'B', '70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000006', 300, 519, 450, 'Disponibile', '{Back Market,Refurbed,Sito}'),
  ('71000000-0000-0000-0000-000000000004', '5CGXXXX4', 'HP', 'EliteBook 840 G8', 'i5-1135G7', 'Intel Iris Xe', '16 GB', '512 GB SSD', '14"', 'C', '70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000006', 140, 229, 170, 'Disponibile', '{Back Market,eBay,Subito}');

insert into public.vendite (device_id, canale, prezzo, commissione, venduto_il) values
  ('71000000-0000-0000-0000-000000000004', 'eBay', 229, 23, now() - interval '1 hour');

insert into public.stage_telefoni (imei, marca, modello, cliente_id, ticket, reset_fatto, sblocco_fatto, ticket_chiuso, operatore) values
  ('35XXXXXXXXXXXX1', 'Apple', 'iPhone 13', '10000000-0000-0000-0000-000000000008', '[n. ticket]', true, true, true, '00000000-0000-0000-0000-000000000009'),
  ('35XXXXXXXXXXXX2', 'Samsung', 'Galaxy S21', '10000000-0000-0000-0000-000000000008', '[n. ticket]', true, false, false, '00000000-0000-0000-0000-000000000009'),
  ('35XXXXXXXXXXXX3', 'Apple', 'iPhone 12', '10000000-0000-0000-0000-000000000008', '[n. ticket]', false, false, false, null),
  ('35XXXXXXXXXXXX4', 'Apple', 'iPhone SE', '10000000-0000-0000-0000-000000000008', 'Aperto', true, true, false, '00000000-0000-0000-0000-000000000009');

-- Fatture --------------------------------------------------------------------------
insert into public.fatture (azienda, cliente_id, periodo, imponibile, stato, problema) values
  ('trasporti', '10000000-0000-0000-0000-000000000002', to_char(current_date, 'YYYY-MM'), 1240, 'Pronta', null),
  ('trasporti', '10000000-0000-0000-0000-000000000001', to_char(current_date, 'YYYY-MM'), 2310, 'Da controllare', 'Sponda ×12 senza tariffa concordata'),
  ('trasporti', '10000000-0000-0000-0000-000000000003', to_char(current_date, 'YYYY-MM'), 480, 'Pronta', null);

-- Presenze: un'uscita mancante ieri e una timbratura rifiutata ---------------------------
insert into public.badge (id, dipendente_id, dispositivo) values
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'iphone-magazziniere-1'),
  ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', 'iphone-gabriele');
insert into public.timbrature (dipendente_id, badge_id, quando, verso, esito) values
  ('20000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000001', (current_date - 1) + time '06:02', 'Entrata', 'Valida'),
  ('20000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000002', (current_date - 1) + time '08:31', 'Entrata', 'Valida'),
  ('20000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000002', (current_date - 1) + time '17:35', 'Uscita', 'Valida');
insert into public.timbrature (dipendente_id, badge_id, quando, esito, motivo, lettore) values
  ('20000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000002', now() - interval '3 hours', 'Rifiutata', 'Codice scaduto (foto o screenshot?)', 'Ingresso');

-- ===================== dati per le sezioni complete =====================
update public.clienti set cosa_spedisce = 'Bancali di materiale tecnico', referente_interno = 'Gabriele', contratto_al = current_date + 300,
  fatturazione = 'Mensile', esigenze = 'Vede il magazzino in tempo reale con i seriali; consegna entro le 12' where nome = 'Snam';
update public.clienti set cosa_spedisce = 'Colli per i negozi del Nord', referente_interno = 'Alberto', contratto_al = current_date + 200,
  fatturazione = 'Mensile', esigenze = 'Consegne con fascia oraria; sabato su richiesta' where nome = 'Apple';
update public.clienti set cosa_spedisce = 'Ordini di magazzino', referente_interno = 'Anna', fatturazione = 'Mensile',
  esigenze = 'Ordini giornalieri per mail' where nome = 'Luxiona';
update public.clienti set cosa_spedisce = 'PC e telefoni aziendali', referente_interno = 'Pier', fatturazione = 'Mensile',
  esigenze = 'Tutti i seriali visibili a ogni sparo, carico e scarico' where nome = 'Econocom';
update public.tariffe set quando = 'Dalla bolla o aggiunta dall''autista' where voce = 'Sponda';
update public.tariffe set quando = 'La merce non consegnata resta in deposito' where voce = 'Giacenza';
update public.tariffe set quando = 'Nuova consegna prenotata dal cliente dopo la giacenza' where voce = 'Riconsegna';

update public.dipendenti set reparto = 'Strada', ore_settimana = 39, inizio = '06:00', fine = '15:00', patente_scadenza = current_date + 400, cqc_scadenza = current_date + 25 where nome = 'Autista 1';
update public.dipendenti set reparto = 'Strada', ore_settimana = 39, inizio = '06:00', fine = '15:00', patente_scadenza = current_date + 700, cqc_scadenza = current_date + 500 where nome = 'Autista 2';
update public.dipendenti set reparto = 'Magazzino', ore_settimana = 40, inizio = '06:00', fine = '14:00' where nome = 'Magazziniere 1';
update public.dipendenti set reparto = 'Ufficio bolle', ore_settimana = 40, inizio = '08:30', fine = '17:30' where nome = 'Gabriele';
update public.dipendenti set reparto = 'Stage', ore_settimana = 40, inizio = '08:00', fine = '17:00' where nome = 'Manuel';

insert into public.telepass (mezzo_id, quando, entrata, uscita, importo) values
  ('30000000-0000-0000-0000-000000000001', current_date + time '07:12', 'Milano Sud', 'Bergamo', 14.20),
  ('30000000-0000-0000-0000-000000000001', current_date + time '11:48', 'Bergamo', 'Brescia Ovest', 8.60),
  ('30000000-0000-0000-0000-000000000002', (current_date - 2) + time '16:35', 'Milano Sud', 'Piacenza', 7.90),
  ('30000000-0000-0000-0000-000000000001', (current_date - 4) + time '21:52', 'Agrate', 'Milano Est', 2.70);

insert into public.mail (azienda, casella, cartella, etichetta, da_nome, da_indirizzo, oggetto, testo, anteprima, ricevuta_il, bozza) values
  ('trasporti', 'ordini@prova.messina', 'Ordini', 'Ordine', 'Snam', 'logistica@snam.prova', 'Ritiro 4 bancali domani',
   E'Buongiorno,\ndomani mattina ritirare 4 bancali dal nostro magazzino e consegnare in via [indirizzo], Milano, entro le 12. Serve la sponda.\nGrazie',
   'Domani mattina ritirare 4 bancali…', now() - interval '3 hours', E'Buongiorno, confermato il ritiro di domani. Ci indicate il piano di consegna?\nGrazie'),
  ('trasporti', 'ordini@prova.messina', 'Clienti', 'Preventivo', '[Cliente]', 'info@cliente.prova', 'Richiesta preventivo',
   E'Buongiorno,\nvorremmo un preventivo per 10 bancali al mese verso Torino.\nGrazie', 'Vorremmo un preventivo per…', now() - interval '4 hours',
   'Buongiorno, grazie della richiesta. Vi giro a Gianluca che vi preparerà il preventivo.'),
  ('corporation', 'vendite@prova.messina', 'Vendite', 'Vendite', 'Acquirente eBay', 'tramite eBay', 'Domanda su EliteBook 840 G8',
   E'Ciao,\nla batteria com''è messa? Riuscite a spedire entro venerdì?', 'La batteria com''è messa?…', now() - interval '1 hour',
   'Ciao, la batteria è all''88% dal test. Spediamo entro domani.');

insert into public.stage_pc (seriale, cliente_id, postazione, esito, iniziato_il, finito_il)
select 'ST' || lpad(n::text, 5, '0'), '10000000-0000-0000-0000-000000000008', ((n - 1) % 60) + 1,
       case when n in (23, 47) then 'Fallito' when n % 9 = 0 then 'Ricevuto' when n % 4 = 0 or n % 7 = 0 then 'In corso' else 'Formattato' end,
       now() - interval '5 hours', case when n % 4 = 0 or n % 7 = 0 or n % 9 = 0 then null else now() - interval '1 hour' end
from generate_series(1, 60) n;

insert into public.ordini (canale, riferimento, cliente, stato, entro, device_id) values
  ('Back Market', 'BM-48213', 'Cliente Back Market', 'Da preparare', now() + interval '6 hours', '71000000-0000-0000-0000-000000000001'),
  ('eBay', 'EB-99120', 'Cliente eBay', 'Spedito', now() - interval '1 day', '71000000-0000-0000-0000-000000000004');

-- prezzi confermati da Vendite (nei dati di prova lo facciamo d'ufficio)
alter table public.device disable trigger device_regole;
update public.device set prezzo_confermato_da = '00000000-0000-0000-0000-000000000008' where stato = 'Disponibile';
alter table public.device enable trigger device_regole;

-- dati di prova: accordo e autorizzazione già scritti (nel sistema vero li scrive la Direzione in Impostazioni)
update public.impostazioni set valore = '{"satellitare": {"tipo": "Accordo sindacale", "data": "2026-01-15", "rif": "[riferimento di prova]"}, "telecamere": {"tipo": "Autorizzazione Ispettorato", "data": "2025-06-10", "rif": "[riferimento di prova]"}}'
 where chiave = 'controllo_lavoratori';
