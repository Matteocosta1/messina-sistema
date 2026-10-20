-- Sezioni complete: traffico, giacenze, presenze, negozio
create or replace function pg_temp.come(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p::text, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.verifica(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'TEST FALLITO: %', msg; end if; end $$;
create or replace function pg_temp.deve_fallire(sql text, msg text) returns void language plpgsql as $$
begin begin execute sql; exception when others then return; end; raise exception 'TEST FALLITO (doveva essere bloccato): %', msg; end $$;
grant execute on function pg_temp.come(uuid), pg_temp.verifica(boolean, text), pg_temp.deve_fallire(text, text) to public;

-- il negozio vede solo il catalogo pubblico, anche senza login
set role anon;
select pg_temp.verifica((select count(*) from public.catalogo()) >= 1, 'catalogo pubblico');
select pg_temp.deve_fallire($$select seriale from public.device$$, 'anon legge i seriali');
reset role;

-- traffico: propone i giri per domani
update public.bolle set stato = 'Confermata' where id = '40000000-0000-0000-0000-000000000003';
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select pg_temp.verifica(public.proponi_giri(current_date + 1) >= 1, 'giri proposti');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select pg_temp.deve_fallire($$select public.proponi_giri(current_date + 1)$$, 'l''ufficio bolle propone i giri');
select pg_temp.verifica((select count(*) from public.mail) = 2, 'Gabriele vede solo le mail dei Trasporti');
reset role;

-- presenze: correzione di un'uscita
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select public.correggi_uscita('20000000-0000-0000-0000-000000000003', current_date - 1, '14:05', 'Uscita dimenticata, confermata dal capo magazzino');
select pg_temp.verifica((select count(*) from public.anomalie where sezione = 'Presenze' and cosa like '%uscita non timbrata%') = 0, 'uscita corretta sparisce dalle anomalie');
select pg_temp.verifica((select count(*) from public.presenze_oggi) >= 1, 'presenze di oggi');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.verifica((select count(*) from public.presenze_mese) <= 1, 'il magazziniere vede solo i suoi conteggi');
reset role;
