-- Portale clienti: bancali, giacenze e fatture visti dal cliente
create or replace function pg_temp.come(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p::text, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.verifica(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'TEST FALLITO: %', msg; end if; end $$;
create or replace function pg_temp.deve_fallire(sql text, msg text) returns void language plpgsql as $$
begin begin execute sql; exception when others then return; end; raise exception 'TEST FALLITO (doveva essere bloccato): %', msg; end $$;
grant execute on function pg_temp.come(uuid), pg_temp.verifica(boolean, text), pg_temp.deve_fallire(text, text) to public;

-- dati di prova: una giacenza Snam, una Apple, fatture Snam inviata e Apple inviata
alter table public.bolle disable trigger user;
update public.bolle set stato = 'Giacenza' where id in ('40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000005');
alter table public.bolle enable trigger user;
update public.giacenze set chiusa_il = now() where chiusa_il is null;
insert into public.giacenze (id, bolla_id, motivo) values
  ('90000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'Destinatario assente'),
  ('90000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000005', 'Chiuso');
alter table public.fatture disable trigger user;
insert into public.fatture (id, azienda, cliente_id, periodo, imponibile, stato, pdf) values
  ('91000000-0000-0000-0000-000000000001', 'trasporti', '10000000-0000-0000-0000-000000000001', '2026-09', 900, 'Inviata', 'fatture/91000000-0000-0000-0000-000000000001.pdf'),
  ('91000000-0000-0000-0000-000000000002', 'trasporti', '10000000-0000-0000-0000-000000000002', '2026-09', 700, 'Inviata', null);
alter table public.fatture enable trigger user;

-- Econocom (portale live) vede i suoi bancali con il posto, Snam no ai bancali di Econocom
select pg_temp.come('00000000-0000-0000-0000-000000000011');
select pg_temp.verifica((select count(*) from public.portale_bancali()) >= 1, 'Econocom vede i suoi bancali');
select pg_temp.verifica((select count(*) from public.portale_bancali() where posto is not null) >= 1, 'con il codice del posto');
select pg_temp.verifica(not exists (select 1 from public.portale_bancali() where cliente not in ('Econocom', 'UniCredit')), 'solo bancali suoi o tramite');
select pg_temp.verifica((select count(*) from public.posti) = 0, 'i posti restano interni');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000010');
select pg_temp.verifica(not exists (select 1 from public.portale_bancali() where cliente = 'Econocom'), 'Snam non vede Econocom');
-- giacenze: vede la sua, chiede la riconsegna; non quella di Apple
select pg_temp.verifica((select count(*) from public.giacenze) = 1, 'Snam vede solo la sua giacenza');
select public.richiedi_riconsegna('90000000-0000-0000-0000-000000000001', current_date + 2, 'Al mattino');
select public.richiedi_riconsegna('90000000-0000-0000-0000-000000000001', current_date + 3);
select pg_temp.verifica((select count(*) from public.richieste_riconsegna) = 1 and (select data from public.richieste_riconsegna) = current_date + 3, 'una richiesta, aggiornata');
select pg_temp.deve_fallire($$select public.richiedi_riconsegna('90000000-0000-0000-0000-000000000002', current_date + 2)$$, 'Snam chiede la giacenza di Apple');
select pg_temp.deve_fallire($$select public.richiedi_riconsegna('90000000-0000-0000-0000-000000000001', current_date)$$, 'data di oggi');
select pg_temp.deve_fallire($$select public.prenota_riconsegna('90000000-0000-0000-0000-000000000001', current_date + 2)$$, 'il cliente prenota da solo');
select pg_temp.deve_fallire($$insert into public.richieste_riconsegna (giacenza_id, data) values ('90000000-0000-0000-0000-000000000002', current_date + 2)$$, 'inserimento diretto');
-- fatture: solo le sue, solo inviate o pagate
select pg_temp.verifica((select count(*) from public.fatture) = 1, 'Snam vede solo la sua fattura inviata');
select pg_temp.verifica((select pdf from public.fatture) like 'fatture/%', 'con il PDF');
select pg_temp.verifica((select count(*) from public.clienti_portale) = 1, 'nome del cliente');
reset role;
-- l'ufficio bolle vede la richiesta
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select pg_temp.verifica((select count(*) from public.richieste_riconsegna) = 1, 'l''ufficio vede la richiesta');
select pg_temp.verifica((select count(*) from public.portale_bancali()) = 0, 'portale_bancali solo per i clienti');
reset role;
-- anon niente
set role anon;
select pg_temp.deve_fallire($$select * from public.portale_bancali()$$, 'anon');
reset role;
