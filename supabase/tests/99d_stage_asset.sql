-- Stage fatturato dai Trasporti; asset UniCredit (tramite Econocom): entrata, abbinamento, uscita, portale, file del giorno
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

-- 1 · Stage di Accenture (cliente Corporation) nella fattura di Accenture dei Trasporti
select pg_temp.verifica((select problema like '%Formattazione PC%' from public.fatture f
  where f.cliente_id = '10000000-0000-0000-0000-000000000009' and f.periodo = to_char(public.oggi(), 'YYYY-MM') and f.tipo = 'Fattura' and f.stato = 'Da controllare'),
  'senza tariffa lo stage resta «Da controllare» con il motivo');
insert into public.tariffe (cliente_id, voce, unita, prezzo, valida_dal, stato) values
  ('10000000-0000-0000-0000-000000000009', 'Formattazione PC', 'pezzo', 4.5, date_trunc('month', public.oggi())::date, 'Attiva'),
  ('10000000-0000-0000-0000-000000000009', 'Lavorazione telefono', 'pezzo', 3, date_trunc('month', public.oggi())::date, 'Attiva');
update public.clienti set piva = '01234567890', codice_fiscale = '01234567890', indirizzo = 'Via [indirizzo]', citta = 'Milano', cap = '20100', provincia = 'MI', codice_destinatario = '0000000'
 where id = '10000000-0000-0000-0000-000000000009';
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select public.chiudi_mese(to_char(public.oggi(), 'YYYY-MM')) > 0;
reset role;
create temp table pc_fatti as select count(*) n from public.stage_pc where cliente_id = '10000000-0000-0000-0000-000000000008' and esito in ('Formattato', 'In vendita') and finito_il is not null;
select pg_temp.verifica((select r.quantita from public.righe_fattura r join public.fatture f on f.id = r.fattura_id
  where f.cliente_id = '10000000-0000-0000-0000-000000000009' and f.stato not in ('Annullata', 'Stornata') and r.voce like 'Stage · Formattazione PC%') = (select n from pc_fatti), 'tutti i PC formattati in fattura');
select pg_temp.verifica((select r.quantita from public.righe_fattura r join public.fatture f on f.id = r.fattura_id
  where f.cliente_id = '10000000-0000-0000-0000-000000000009' and f.stato not in ('Annullata', 'Stornata') and r.voce like 'Stage · Lavorazione telefono%') = 1, 'il telefono chiuso in fattura');
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select public.chiudi_mese(to_char(public.oggi(), 'YYYY-MM')) >= 0;
reset role;
select pg_temp.verifica((select sum(r.quantita) from public.righe_fattura r join public.fatture f on f.id = r.fattura_id
  where f.cliente_id = '10000000-0000-0000-0000-000000000009' and f.stato not in ('Annullata', 'Stornata') and r.voce like 'Stage · Formattazione PC%') = (select n from pc_fatti), 'richiudere non fattura due volte');
select pg_temp.verifica((select count(*) from public.stage_pc where cliente_id is null and fattura_id is not null) = 0, 'i PC della Corporation stessa non si fatturano');
-- un cliente dello stage senza cliente Trasporti: la chiusura si ferma
insert into public.clienti (id, azienda, nome) values ('10000000-0000-0000-0000-0000000000c1', 'corporation', 'Asystel');
insert into public.stage_pc (seriale, cliente_id, esito, finito_il) values ('AS00001', '10000000-0000-0000-0000-0000000000c1', 'Formattato', now());
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select pg_temp.deve_fallire($$select public.chiudi_mese(to_char(public.oggi(), 'YYYY-MM'))$$, 'stage senza cliente da fatturare');
reset role;
delete from public.stage_pc where seriale = 'AS00001';

-- 2 · Asset: UniCredit (tramite Econocom); ogni IMEI sparato nel bancale diventa un asset
update public.clienti set traccia_asset = true where id = '10000000-0000-0000-0000-000000000005';
insert into public.bancali (id, codice, cliente_id) values ('60000000-0000-0000-0000-0000000000a5', 'B-0950', '10000000-0000-0000-0000-000000000005');
select pg_temp.come('00000000-0000-0000-0000-000000000005');
insert into public.contenuto (bancale_id, articolo, quantita, codici) values ('60000000-0000-0000-0000-0000000000a5', 'Motorola moto g', 3, '{IM0001,IM0002,IM0003}');
reset role;
select pg_temp.verifica((select count(*) from public.asset where cliente_id = '10000000-0000-0000-0000-000000000005' and stato = 'In magazzino') = 3, 'tre asset entrati');
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.deve_fallire($$select public.abbina_asset('[{"imei":"IM0001","cespite":"10000001","utente":"Mario Rossi"},{"imei":"IM0002","cespite":"10000001","utente":"Anna Bianchi"}]')$$, 'stesso cespite due volte');
select pg_temp.deve_fallire($$select public.abbina_asset('[{"imei":"IM0001","cespite":"10000001","utente":"Mario Rossi"},{"imei":"IM9999","cespite":"10000009","utente":"X"}]')$$, 'IMEI non in magazzino');
reset role;
select pg_temp.verifica((select count(*) from public.asset where cespite is not null) = 0, 'tutto o niente: nessun abbinamento a metà');
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select public.abbina_asset('[{"imei":"IM0001","cespite":"10000001","utente":"Mario Rossi","sede":"Via Torino, Milano","accessori":["Caricabatterie","Cover"],"cliente_finale":"UniCredit"},{"imei":"IM0002","cespite":"10000002","utente":"Anna Bianchi"}]') = 2;
reset role;
-- uscita per utente con la bolla
alter table public.bolle disable trigger user;
insert into public.bolle (id, numero, cliente_id, tipo, data_consegna, colli_previsti, stato) values
  ('40000000-0000-0000-0000-0000000000a5', 'B-UC-1', '10000000-0000-0000-0000-000000000005', 'Consegna', public.oggi(), 1, 'Confermata');
alter table public.bolle enable trigger user;
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.deve_fallire($$select public.spedisci_asset('{IM0003}', 'B-UC-1')$$, 'un telefono non abbinato non esce');
select public.spedisci_asset('{IM0001}', 'B-UC-1') = 1;
reset role;
select pg_temp.verifica((select stato = 'Spedito' and bolla_id is not null from public.asset where imei = 'IM0001'), 'spedito con la bolla');
select pg_temp.verifica((select not ('IM0001' = any(codici)) and quantita = 2 from public.contenuto where bancale_id = '60000000-0000-0000-0000-0000000000a5'), 'tolto dal bancale');
select pg_temp.verifica((select array_agg(e.evento order by e.id) from public.asset_eventi e join public.asset a on a.id = e.asset_id where a.imei = 'IM0001') = '{Entrata,Abbinato,Spedito}', 'storico completo');
-- il cliente: Econocom vede gli asset di UniCredit, Snam no
select pg_temp.come('00000000-0000-0000-0000-000000000011');
select pg_temp.verifica((select count(*) from public.asset) = 3, 'Econocom vede gli asset di UniCredit');
select pg_temp.verifica(public.asset_csv('10000000-0000-0000-0000-000000000005') like '%IM0001;%;10000001;Mario Rossi;%Spedito%', 'file live per il cliente');
select pg_temp.come('00000000-0000-0000-0000-000000000010');
select pg_temp.verifica((select count(*) from public.asset) = 0, 'Snam non vede gli asset degli altri');
select pg_temp.verifica(public.asset_csv('10000000-0000-0000-0000-000000000005') not like '%IM0001%', 'Snam non scarica il file degli altri');
select pg_temp.deve_fallire($$select public.abbina_asset('[{"imei":"IM0003","cespite":"1","utente":"x"}]')$$, 'il cliente non abbina');
reset role;
select set_config('request.jwt.claim.sub', '', false);
-- il bancale esce: gli asset rimasti escono con lui; il file della sera
update public.bancali set uscito_il = now(), bolla_uscita_id = '40000000-0000-0000-0000-0000000000a5' where id = '60000000-0000-0000-0000-0000000000a5';
select pg_temp.verifica((select count(*) from public.asset where cliente_id = '10000000-0000-0000-0000-000000000005' and stato = 'Spedito') = 3, 'escono con il bancale');
select public.salva_file_asset() >= 1;
select pg_temp.verifica((select righe from public.asset_file where cliente_id = '10000000-0000-0000-0000-000000000005' and giorno = public.oggi()) = 3, 'file del giorno salvato');
-- rientro: lo stesso IMEI sparato di nuovo torna «Rientrato»
insert into public.bancali (id, codice, cliente_id) values ('60000000-0000-0000-0000-0000000000a6', 'B-0951', '10000000-0000-0000-0000-000000000005');
insert into public.contenuto (bancale_id, articolo, quantita, codici) values ('60000000-0000-0000-0000-0000000000a6', 'Rientro', 1, '{IM0001}');
select pg_temp.verifica((select stato = 'Rientrato' from public.asset where imei = 'IM0001'), 'rientro riconosciuto');
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.deve_fallire($$select public.salva_file_asset()$$, 'il file lo prepara solo il sistema');
reset role;
select set_config('request.jwt.claim.sub', '', false);
