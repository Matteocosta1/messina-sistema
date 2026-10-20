-- App Messina: funzioni dei telefoni (autisti, magazzino, bancali)
create or replace function pg_temp.come(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p::text, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.verifica(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'TEST FALLITO: %', msg; end if; end $$;
create or replace function pg_temp.deve_fallire(sql text, msg text) returns void language plpgsql as $$
begin begin execute sql; exception when others then return; end; raise exception 'TEST FALLITO (doveva essere bloccato): %', msg; end $$;
grant execute on function pg_temp.come(uuid), pg_temp.verifica(boolean, text), pg_temp.deve_fallire(text, text) to public;

-- giro di prova per Autista 2: Snam (Sponda) e Apple, confermate
insert into public.bolle (id, cliente_id, tipo, data_consegna, destinatario, indirizzo, citta, colli_previsti, accessori, stato, operatore_id) values
  ('40000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-000000000001', 'Consegna', current_date, 'Snam', 'Via [indirizzo]', 'Milano', 2, '{Sponda}', 'Nuova', '00000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000092', '10000000-0000-0000-0000-000000000002', 'Consegna', current_date, 'Apple', 'Via [indirizzo]', 'Rozzano', 1, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003');
update public.bolle set stato = 'Confermata' where id in ('40000000-0000-0000-0000-000000000091', '40000000-0000-0000-0000-000000000092');
insert into public.colli (bolla_id, codice) values ('40000000-0000-0000-0000-000000000091', 'C-91-001'), ('40000000-0000-0000-0000-000000000091', 'C-91-002'),
  ('40000000-0000-0000-0000-000000000092', 'C-92-001');
insert into public.giri (id, data, mezzo_id, autista_id, zona, stato) values
  ('50000000-0000-0000-0000-000000000091', current_date, '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Milano', 'Partito');
insert into public.fermate (id, giro_id, bolla_id, ordine) values
  ('51000000-0000-0000-0000-000000000091', '50000000-0000-0000-0000-000000000091', '40000000-0000-0000-0000-000000000091', 1),
  ('51000000-0000-0000-0000-000000000092', '50000000-0000-0000-0000-000000000091', '40000000-0000-0000-0000-000000000092', 2);

-- autista: il suo giro di oggi, gli accessori che il cliente paga, riprovo dopo
select pg_temp.come('00000000-0000-0000-0000-000000000012');
select pg_temp.verifica(jsonb_array_length(public.mio_giro_oggi() -> 'fermate') = 2, 'due fermate nel giro di oggi');
select pg_temp.verifica((public.mio_giro_oggi() -> 'mezzo' ->> 'tipo') = 'Furgone', 'mezzo del giro');
select pg_temp.verifica((public.mio_giro_oggi() -> 'fermate' -> 0 ->> 'destinatario') = 'Snam', 'prima fermata Snam');
select pg_temp.verifica((public.mio_giro_oggi() -> 'fermate' -> 0 ->> 'colli')::int = 2, 'colli in bolla');
select pg_temp.verifica('Sponda' = any(public.accessori_possibili('51000000-0000-0000-0000-000000000091')), 'Sponda pagata da Snam');
select pg_temp.verifica(not ('Base' = any(public.accessori_possibili('51000000-0000-0000-0000-000000000091'))), 'Base non è un accessorio');
select pg_temp.deve_fallire($$select public.riprova_dopo('51000000-0000-0000-0000-000000000091', '')$$, 'riprova senza motivo');
select public.riprova_dopo('51000000-0000-0000-0000-000000000091', 'Chiuso o fuori orario');
select pg_temp.verifica((public.mio_giro_oggi() -> 'fermate' -> 1 ->> 'ordine')::int = 3, 'fermata spostata in fondo');
select pg_temp.verifica((public.mio_giro_oggi() -> 'fermate' -> 1 ->> 'esito') = 'Da fare', 'resta da fare');
select pg_temp.deve_fallire($$select public.info_codice('C-6-032')$$, 'l''autista usa le funzioni del magazzino');
reset role;
-- un altro autista non vede la fermata
select pg_temp.come('00000000-0000-0000-0000-000000000006');
select pg_temp.deve_fallire($$select public.accessori_possibili('51000000-0000-0000-0000-000000000091')$$, 'fermata di un altro');
reset role;

-- magazzino: codice letto, posto proposto, entrata, uscite di oggi
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.deve_fallire($$select public.mio_giro_oggi()$$, 'il magazziniere non ha giri');
select pg_temp.verifica((public.info_codice('C-6-032') ->> 'tipo') = 'collo', 'collo riconosciuto');
select pg_temp.verifica((public.info_codice('C-6-032') ->> 'cliente') = 'Apple', 'cliente del collo');
select pg_temp.verifica((public.info_codice('B-0101') ->> 'tipo') = 'bancale', 'bancale riconosciuto');
select pg_temp.verifica((public.info_codice('B-0101') ->> 'posto') = 'S07-1-1', 'posto del bancale');
select pg_temp.verifica(public.posto_proposto('C-6-032') is not null, 'posto proposto');
select pg_temp.verifica(public.posto_proposto('C-6-032') not in ('S07-1-1', 'S07-1-2', 'S07-2-1', 'S07-2-2', 'S11-2-1', 'S11-2-2'), 'il posto proposto è libero');
select pg_temp.deve_fallire($$select public.info_codice('NONESISTE')$$, 'codice sconosciuto');
select pg_temp.deve_fallire($$select public.metti_a_posto('C-6-032', 'S99-9-9')$$, 'posto inesistente');
select pg_temp.verifica((public.metti_a_posto('C-6-032', 'S01-1-1') ->> 'messi')::int = 1, 'collo messo a posto');
select pg_temp.verifica((select letto_entrata is not null from public.colli where codice = 'C-6-032'), 'entrata letta');
select pg_temp.verifica((select count(*) from public.storico where cosa = 'Collo C-6-032' and dove = 'Ricevimento → S01-1-1') = 1, 'nello storico');
select pg_temp.verifica((public.metti_a_posto('C-6-032', 'S01-1-2') ->> 'da') = 'S01-1-1', 'collo trasferito');
select pg_temp.verifica(jsonb_array_length(public.uscite_oggi()) >= 2, 'spedizioni da caricare oggi');
select pg_temp.verifica((public.uscite_oggi() -> 0 ->> 'totale')::int > 0, 'colli della spedizione');
reset role;

-- missione: un posto vuoto si chiude senza scansioni, uno pieno no
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select public.lancia_missione('Scaffale', 'S07');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select public.posto_vuoto((select mp.id from public.missioni_posti_app mp where mp.posto = 'S07-3-1' limit 1));
select pg_temp.verifica((select stato from public.missioni_posti_app where posto = 'S07-3-1' limit 1) = 'Fatto', 'posto vuoto chiuso');
select pg_temp.deve_fallire($$select public.posto_vuoto((select mp.id from public.missioni_posti_app mp where mp.posto = 'S07-1-1' limit 1))$$, 'posto pieno chiuso a vuoto');
reset role;

-- Corporation: codice riservato, poi bancale nel posto; non si inventano codici
select pg_temp.come('00000000-0000-0000-0000-000000000008');
create temp table codice_riservato as select public.riserva_bancale() as c;
select pg_temp.verifica((select c from codice_riservato) ~ '^B-[0-9]{4,}$', 'codice bancale');
select pg_temp.verifica(public.crea_bancale((select c from codice_riservato), 'S12-6-3') = (select c from codice_riservato), 'bancale creato');
select pg_temp.verifica((select count(*) from public.bancali where codice = (select c from codice_riservato)) = 1, 'la Corporation lo vede');
select pg_temp.deve_fallire($$select public.crea_bancale((select c from codice_riservato), 'S12-6-2')$$, 'codice doppio');
select pg_temp.deve_fallire($$select public.crea_bancale('B-999999', 'S12-6-2')$$, 'codice non riservato');
select pg_temp.deve_fallire($$select public.info_codice('B-0101')$$, 'la Corporation legge i codici dei Trasporti');
select pg_temp.verifica(public.posto_proposto() is not null, 'posto proposto per la Corporation');
reset role;
drop table codice_riservato;

-- un cliente non usa le funzioni delle app
select pg_temp.come('00000000-0000-0000-0000-000000000010');
select pg_temp.deve_fallire($$select public.riserva_bancale()$$, 'cliente crea bancali');
select pg_temp.deve_fallire($$select public.uscite_oggi()$$, 'cliente vede le uscite');
reset role;
