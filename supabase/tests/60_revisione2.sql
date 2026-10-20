-- Gli attacchi trovati dalla revisione di sicurezza: ora devono essere tutti bloccati.
create or replace function pg_temp.come(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p::text, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.verifica(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'TEST FALLITO: %', msg; end if; end $$;
create or replace function pg_temp.deve_fallire(sql text, msg text) returns void language plpgsql as $$
begin begin execute sql; exception when others then return; end; raise exception 'TEST FALLITO (doveva essere bloccato): %', msg; end $$;
grant execute on function pg_temp.come(uuid), pg_temp.verifica(boolean, text), pg_temp.deve_fallire(text, text) to public;

-- documenti: ognuno solo i suoi (la funzione decide le policy dello storage)
select pg_temp.come('00000000-0000-0000-0000-000000000008');   -- vendite Corporation
select pg_temp.verifica(not public.documento_leggibile('mail/trasporti/x/a.pdf'), 'Corporation legge le mail dei Trasporti');
select pg_temp.verifica(not public.documento_leggibile('fatture/trasporti/x.pdf'), 'Corporation legge le fatture dei Trasporti');
select pg_temp.verifica(not public.documento_scrivibile('fatture/corporation/x.pdf'), 'utente sostituisce un PDF di fattura');
select pg_temp.verifica(public.documento_leggibile('mail/corporation/x/a.pdf'), 'vendite legge le sue mail');
select pg_temp.verifica(public.documento_scrivibile('lotti/x/ddt.pdf'), 'vendite carica i DDT dei lotti');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000002');   -- amministrazione Trasporti
select pg_temp.verifica(not public.documento_leggibile('mail/corporation/x/a.pdf'), 'Trasporti legge le mail della Corporation');
select pg_temp.verifica(public.documento_leggibile('fatture/trasporti/x.pdf'), 'amministrazione legge le sue fatture');
select pg_temp.verifica(not public.documento_leggibile('lotti/x/ddt.pdf'), 'Trasporti legge i lotti');
select pg_temp.verifica(public.documento_leggibile('contratti/10000000-0000-0000-0000-000000000001.pdf'), 'contratto di un suo cliente');
reset role;

-- bancali: un codice riservato da un altro non si usa
select pg_temp.come('00000000-0000-0000-0000-000000000008');
create temp table riservato as select public.riserva_bancale() as c;
reset role;
grant select on riservato to public;
select pg_temp.come('00000000-0000-0000-0000-000000000005');   -- magazziniere
select pg_temp.deve_fallire($$select public.crea_bancale((select c from riservato), 'S12-6-1')$$, 'bancale con il codice riservato da un altro');
reset role;
drop table riservato;
