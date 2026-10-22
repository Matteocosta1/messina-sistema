-- Accessi a più società, commercialista, riepiloghi presenze e altri permessi
create or replace function pg_temp.come(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.verifica(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'TEST FALLITO: %', msg; end if; end $$;
create or replace function pg_temp.deve_fallire(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'TEST FALLITO (doveva essere bloccato): %', msg;
end $$;
grant execute on function pg_temp.come(uuid), pg_temp.verifica(boolean, text), pg_temp.deve_fallire(text, text) to public;
select set_config('request.jwt.claim.sub', '', false);

-- Matteo: direzione nei Trasporti, vendite nella Corporation; il commercialista in tutte e due
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000013', 'commercialista@prova.messina');
insert into public.profili (id, azienda, ruolo, nome) values ('00000000-0000-0000-0000-000000000013', 'trasporti', 'commercialista', 'Commercialista');
insert into public.accessi (profilo_id, azienda, ruolo) values
  ('00000000-0000-0000-0000-000000000001', 'corporation', 'vendite'),
  ('00000000-0000-0000-0000-000000000013', 'corporation', 'commercialista');
select pg_temp.verifica((select count(*) from public.accessi where profilo_id = '00000000-0000-0000-0000-000000000013') = 2, 'il commercialista ha le due società');
insert into public.mail (azienda, casella, cartella, etichetta, da_nome, da_indirizzo, oggetto, testo, ricevuta_il)
values ('corporation', 'x', 'Stage', 'Stage', 'Accenture', 'it@accenture.example', 'Telefoni da lavorare', '40 pezzi', now());

-- 1 · Una società alla volta
select pg_temp.come('00000000-0000-0000-0000-000000000001');
select pg_temp.verifica((select count(*) from public.mie_aziende()) = 2, 'due società');
select pg_temp.verifica(public.staff_di('trasporti') and not public.staff_di('corporation'), 'parte nei Trasporti');
select public.cambia_azienda('corporation');
select pg_temp.verifica(public.staff_di('corporation') and not public.staff_di('trasporti'), 'nella Corporation non vede i Trasporti');
select pg_temp.verifica(public.mio_ruolo() = 'vendite', 'nella Corporation è vendite');
select pg_temp.verifica((select count(*) from public.bolle) = 0, 'nella Corporation niente bolle dei Trasporti');
select public.cambia_azienda('trasporti');
select pg_temp.verifica(public.mio_ruolo() = 'direzione', 'di nuovo direzione nei Trasporti');
reset role;
select pg_temp.verifica((select ruolo from public.accessi where profilo_id = '00000000-0000-0000-0000-000000000001' and azienda = 'corporation') = 'vendite', 'il cambio non tocca gli accessi');
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select pg_temp.deve_fallire($$select public.cambia_azienda('corporation')$$, 'società senza accesso');
select pg_temp.deve_fallire($$select public.imposta_accesso('00000000-0000-0000-0000-000000000003', 'trasporti', 'direzione')$$, 'si dà da solo la direzione');
reset role;

-- 2 · Commercialista: legge i numeri, non cambia niente, niente telecamere né presenze
select pg_temp.come('00000000-0000-0000-0000-000000000013');
select pg_temp.verifica((select count(*) from public.fatture where azienda = 'trasporti') > 0, 'vede le fatture dei Trasporti');
with x as (update public.fatture set stato = 'Pagata' where stato = 'Inviata' returning 1) select pg_temp.verifica((select count(*) from x) = 0, 'il commercialista segna una fattura');
select pg_temp.deve_fallire($$insert into public.fatture (azienda, cliente_id) values ('trasporti', '10000000-0000-0000-0000-000000000001')$$, 'il commercialista crea una fattura');
select pg_temp.verifica((select count(*) from public.timbrature) = 0, 'il commercialista non vede le timbrature');
select pg_temp.verifica((select count(*) from public.sat_anomalie) = 0, 'il commercialista non vede il satellitare');
select public.cambia_azienda('corporation');
select pg_temp.verifica((select count(*) from public.lotti) > 0, 'nella Corporation vede i lotti');
select pg_temp.verifica((select count(*) from public.fatture where azienda = 'trasporti') = 0, 'nella Corporation non vede le fatture dei Trasporti');
reset role;

-- 3 · Riepiloghi presenze: Angela sì, la direzione no; il traffico vede solo chi degli autisti ha timbrato oggi
insert into public.timbrature (dipendente_id, badge_id, quando, verso, esito)
values ('20000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', now() - interval '1 minute', 'Entrata', 'Valida');
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select pg_temp.verifica((select count(*) from public.timbrature) >= 4, 'Angela vede le timbrature');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000001');
select pg_temp.verifica((select count(*) from public.timbrature) = 1, 'la direzione non vede i riepiloghi: solo chi degli autisti è entrato oggi, come il traffico');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select pg_temp.verifica((select count(*) from public.timbrature) = 1, 'il traffico vede solo l''entrata di oggi dell''autista');
reset role;

-- 4 · Anomalie solo agli amministratori; impostazioni non ai clienti; stage non cancellabile; mail dello stage
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select pg_temp.verifica((select count(*) from public.anomalie) = 0, 'l''ufficio bolle non vede le Anomalie');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select pg_temp.verifica((select count(*) from public.anomalie) > 0, 'l''amministrazione vede le Anomalie');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000010');
select pg_temp.verifica((select count(*) from public.impostazioni) = 0, 'il cliente non legge le impostazioni');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000009');
select pg_temp.deve_fallire($$delete from public.stage_pc$$, 'stage cancellato');
select pg_temp.verifica((select count(*) from public.mail) = 1, 'lo stage legge solo la cartella Stage');
select pg_temp.verifica((select count(*) from public.lotti) > 0, 'lo stage legge i lotti per le Entrate');
reset role;
select set_config('request.jwt.claim.sub', '', false);
