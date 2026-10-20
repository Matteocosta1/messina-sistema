-- Doppio fattore: chi deve dare il codice e non l'ha dato non vede né tocca niente.
create or replace function pg_temp.come(p uuid, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
  perform set_config('request.jwt.claim.aal', p_aal, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.verifica(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'TEST FALLITO: %', msg; end if; end $$;
create or replace function pg_temp.deve_fallire(sql text, msg text) returns void language plpgsql as $$
begin begin execute sql; exception when others then return; end; raise exception 'TEST FALLITO (doveva essere bloccato): %', msg; end $$;
grant execute on function pg_temp.come(uuid, text), pg_temp.verifica(boolean, text), pg_temp.deve_fallire(text, text) to public;

-- amministrazione con la sola password
select pg_temp.come('00000000-0000-0000-0000-000000000002', 'aal1');
select pg_temp.verifica(public.serve_doppio_fattore(), 'amministrazione deve dare il codice');
select pg_temp.verifica((select count(*) from public.fatture) = 0, 'fatture visibili senza codice');
select pg_temp.verifica((select count(*) from public.clienti) = 0, 'clienti visibili senza codice');
select pg_temp.verifica((select count(*) from public.tariffe) = 0, 'tariffe visibili senza codice');
select pg_temp.verifica(not public.ha_ruolo('amministrazione'), 'ha_ruolo vale senza codice');
select pg_temp.verifica(not public.documento_leggibile('fatture/trasporti/x.pdf'), 'PDF di fattura leggibile senza codice');
select pg_temp.verifica((select count(*) from public.profili where id = auth.uid()) = 1, 'il proprio profilo deve restare leggibile');
reset role;

-- la direzione con la sola password non può togliere l'obbligo
select pg_temp.come('00000000-0000-0000-0000-000000000001', 'aal1');
update public.impostazioni set valore = '[]' where chiave = 'ruoli_doppio_fattore';
reset role;
select pg_temp.verifica((select valore from public.impostazioni where chiave = 'ruoli_doppio_fattore') ? 'direzione',
                        'la direzione ha tolto il doppio fattore senza codice');

-- con il codice tutto torna come prima
select pg_temp.come('00000000-0000-0000-0000-000000000002', 'aal2');
select pg_temp.verifica((select count(*) from public.clienti) > 0, 'amministrazione con codice non vede i clienti');
select pg_temp.verifica(public.ha_ruolo('amministrazione'), 'ha_ruolo con codice');
reset role;

-- i ruoli operativi non devono dare il codice: il magazziniere lavora con la sola password
select pg_temp.come('00000000-0000-0000-0000-000000000005', 'aal1');
select pg_temp.verifica(not public.serve_doppio_fattore(), 'il magazziniere non deve dare il codice');
select pg_temp.verifica(public.mfa_ok(), 'il magazziniere è bloccato senza motivo');
reset role;

-- ogni tabella protetta ha la regola: una tabella nuova senza regola fa fallire il test
select pg_temp.verifica(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and c.relname not in ('profili', 'impostazioni', 'aziende')
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'doppio_fattore')),
  'una tabella non ha la regola doppio_fattore: aggiungerla nella migrazione che la crea');

select set_config('request.jwt.claim.aal', '', false);
