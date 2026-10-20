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
  ('10000000-0000-0000-0000-000000000007', 'trasporti', 'Velier', false, null);
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
