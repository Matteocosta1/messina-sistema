-- Bolle divise in automatico nell'ufficio bolle, per carico
create or replace function pg_temp.come(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.verifica(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'TEST FALLITO: %', msg; end if; end $$;
grant execute on function pg_temp.come(uuid), pg_temp.verifica(boolean, text) to public;
select set_config('request.jwt.claim.sub', '', false);

-- ufficio bolle: Gabriele (dal seed) più Christian e Alberto, tutti senza bolle nuove
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'christian@test'), ('00000000-0000-0000-0000-0000000000b2', 'alberto@test');
insert into public.profili (id, azienda, ruolo, nome) values
  ('00000000-0000-0000-0000-0000000000b1', 'trasporti', 'bolle', 'Christian'),
  ('00000000-0000-0000-0000-0000000000b2', 'trasporti', 'bolle', 'Alberto');
update public.bolle set stato = 'Annullata' where stato = 'Nuova';

-- sei bolle create da Gabriele: due a testa, non tutte a chi le crea
select pg_temp.come('00000000-0000-0000-0000-000000000003');
insert into public.bolle (cliente_id, destinatario, colli_previsti, operatore_id)
  select '10000000-0000-0000-0000-000000000002', 'Prova ' || n, 1, '00000000-0000-0000-0000-000000000003' from generate_series(1, 6) n;
reset role;
select pg_temp.verifica((select count(distinct operatore_id) from public.bolle where destinatario like 'Prova %') = 3, 'divise tra i tre');
select pg_temp.verifica((select max(c) - min(c) from (select count(*) c from public.bolle where destinatario like 'Prova %' group by operatore_id) x) = 0, 'due a testa');

-- chi ne ha meno da confermare riceve la prossima
update public.bolle set stato = 'Annullata' where destinatario like 'Prova %'
   and operatore_id = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.come('00000000-0000-0000-0000-000000000003');
insert into public.bolle (cliente_id, destinatario, colli_previsti) values ('10000000-0000-0000-0000-000000000002', 'Prova 7', 1);
reset role;
select pg_temp.verifica((select operatore_id from public.bolle where destinatario = 'Prova 7') = '00000000-0000-0000-0000-0000000000b2', 'va ad Alberto, che non ne ha da confermare');

-- chi non è attivo non ne riceve
update public.profili set attivo = false where id = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.come('00000000-0000-0000-0000-000000000003');
insert into public.bolle (cliente_id, destinatario, colli_previsti) values ('10000000-0000-0000-0000-000000000002', 'Prova 8', 1);
reset role;
select pg_temp.verifica((select operatore_id from public.bolle where destinatario = 'Prova 8') <> '00000000-0000-0000-0000-0000000000b2', 'Alberto non attivo');

-- la Direzione può scegliere a mano
select pg_temp.come('00000000-0000-0000-0000-000000000001');
insert into public.bolle (cliente_id, destinatario, colli_previsti, operatore_id) values ('10000000-0000-0000-0000-000000000002', 'Prova 9', 1, '00000000-0000-0000-0000-0000000000b1');
reset role;
select pg_temp.verifica((select operatore_id from public.bolle where destinatario = 'Prova 9') = '00000000-0000-0000-0000-0000000000b1', 'scelta della Direzione');

-- dal sistema (funzione crea-bolla, senza utente): divisa per carico
insert into public.bolle (cliente_id, destinatario, colli_previsti) values ('10000000-0000-0000-0000-000000000002', 'Prova 10', 1);
select pg_temp.verifica((select operatore_id from public.bolle where destinatario = 'Prova 10') is not null, 'assegnata anche dal sistema');

-- pulizia: il resto dei test riparte com'era
delete from public.bolle where destinatario like 'Prova %';
delete from public.profili where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2');
select 'bolle divise: ok';
