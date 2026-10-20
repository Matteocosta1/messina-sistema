-- Gli attacchi trovati dalla revisione di sicurezza: ora devono essere tutti bloccati.
create or replace function pg_temp.come(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p::text, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.verifica(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'TEST FALLITO: %', msg; end if; end $$;
create or replace function pg_temp.deve_fallire(sql text, msg text) returns void language plpgsql as $$
begin begin execute sql; exception when others then return; end; raise exception 'TEST FALLITO (doveva essere bloccato): %', msg; end $$;
grant execute on function pg_temp.come(uuid), pg_temp.verifica(boolean, text), pg_temp.deve_fallire(text, text) to public;

-- 1 · bolle
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select pg_temp.deve_fallire($$update public.bolle set stato = 'Consegnata' where id = '40000000-0000-0000-0000-000000000001'$$, 'bolla Nuova → Consegnata a mano');
select pg_temp.deve_fallire($$insert into public.bolle (cliente_id, stato) values ('10000000-0000-0000-0000-000000000001', 'Consegnata')$$, 'inserire una bolla già consegnata');
select pg_temp.deve_fallire($$update public.bolle set numero = '99-999999' where id = '40000000-0000-0000-0000-000000000001'$$, 'numero scelto a mano');
select pg_temp.deve_fallire($$update public.bolle set stato = 'Nuova' where id = '40000000-0000-0000-0000-000000000006'$$, 'bolla confermata riportata a Nuova');
select pg_temp.deve_fallire($$update public.bolle set colli_previsti = 1 where id = '40000000-0000-0000-0000-000000000006'$$, 'colli cambiati dopo la conferma');
insert into public.bolle (cliente_id, indirizzo) values ('10000000-0000-0000-0000-000000000002', 'Via [prova]') returning id;
reset role;

-- 2 · fermate e consegna
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select pg_temp.deve_fallire($$update public.fermate set foto_bolla = null, firmata = false where id = '51000000-0000-0000-0000-000000000001'$$, 'cancellare foto e firma dopo la consegna');
select pg_temp.deve_fallire($$insert into public.fermate (giro_id, bolla_id, ordine, esito) values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 9, 'Consegnata')$$, 'fermata nata già consegnata');
select pg_temp.deve_fallire($$insert into public.fermate (giro_id, bolla_id, ordine) values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 9)$$, 'bolla non confermata messa in giro');
reset role;

-- 3 · fatture
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select pg_temp.deve_fallire($$insert into public.fatture (azienda, cliente_id, stato) values ('trasporti', '10000000-0000-0000-0000-000000000002', 'Pagata')$$, 'fattura nata pagata');
select pg_temp.deve_fallire($$update public.fatture set stato = 'Bozza' where stato = 'Pagata'$$, 'fattura pagata riportata in bozza');
select pg_temp.deve_fallire($$update public.fatture set imponibile = 1 where stato = 'Pagata'$$, 'importo cambiato dopo l''invio');
select pg_temp.deve_fallire($$insert into public.righe_fattura (fattura_id, voce, prezzo) select id, 'x', 1 from public.fatture where stato = 'Pagata' limit 1$$, 'riga aggiunta a fattura inviata');
select pg_temp.deve_fallire($$select public.registra('trasporti', 'Sblocco', 'falso')$$, 'storico scritto a mano');
reset role;

-- 4 · badge: lo stesso codice non vale due volte; firma falsa non accusa nessuno
do $$
declare c text; r jsonb;
begin
  c := public.codice_badge('80000000-0000-0000-0000-000000000002', floor(extract(epoch from now()) / 30)::bigint);
  r := public.timbra(c, 'Ingresso');
  if not (r ->> 'ok')::boolean then raise exception 'TEST FALLITO: primo uso rifiutato %', r; end if;
  r := public.timbra(c, 'Ingresso');
  if (r ->> 'ok')::boolean then raise exception 'TEST FALLITO: replay accettato'; end if;
  perform public.timbra('80000000-0000-0000-0000-000000000002.' || floor(extract(epoch from now()) / 30)::bigint || '.falsa', 'Ingresso');
  if (select dipendente_id from public.timbrature order by id desc limit 1) is not null then
    raise exception 'TEST FALLITO: firma falsa attribuita a un dipendente';
  end if;
end $$;

-- 5 · missioni: il magazziniere non legge i codici attesi
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.verifica((select count(*) from public.missioni_posti) = 0, 'il magazziniere non legge i codici attesi');
select pg_temp.verifica((select count(*) from public.missioni_posti_app) > 0, 'il magazziniere vede l''elenco per articolo');
select pg_temp.deve_fallire($$update public.bancali set posto_id = null$$, 'spostare bancali senza storico');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select public.lancia_missione('Scaffale', 'S07');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select public.scansiona_missione((select id from public.missioni_posti_app where posto = 'S07-1-1' and stato = 'Da fare' limit 1), 'NONC_E');
select public.segnala_posto((select id from public.missioni_posti_app where posto = 'S07-1-1' and stato = 'Da fare' limit 1));
select pg_temp.deve_fallire($$select public.trasferisci('B-0101', 'S01-1-1')$$, 'portare via un bancale da un posto bloccato');
select pg_temp.deve_fallire($$delete from public.contenuto where bancale_id = '60000000-0000-0000-0000-000000000001'$$, 'cambiare il contenuto di un posto bloccato');
reset role;

-- 8 · clienti
select pg_temp.come('00000000-0000-0000-0000-000000000010');
select pg_temp.verifica((select count(*) from public.fatture where stato not in ('Inviata', 'Pagata')) = 0, 'il cliente non vede fatture interne');
select pg_temp.verifica((select count(*) from public.clienti) = 0, 'il cliente non legge le note interne');
select pg_temp.verifica((select count(*) from public.clienti_portale) = 1, 'il cliente vede il suo nome');
reset role;
update public.clienti set portale_live = false where nome = 'Econocom';
select pg_temp.come('00000000-0000-0000-0000-000000000011');
select pg_temp.verifica((select count(*) from public.bancali) = 0, 'senza portale live il cliente non vede il magazzino');
reset role;
update public.clienti set portale_live = true where nome = 'Econocom';
select pg_temp.come('00000000-0000-0000-0000-000000000006');
select pg_temp.verifica((select count(*) from public.clienti) = 0, 'l''autista non vede i clienti');
reset role;

-- 9 · device
select pg_temp.come('00000000-0000-0000-0000-000000000009');
select pg_temp.deve_fallire($$update public.device set prezzo_confermato_da = '00000000-0000-0000-0000-000000000008' where seriale = 'PF3XXXX1'$$, 'finta conferma del prezzo');
select pg_temp.deve_fallire($$update public.device set stato = 'Venduto' where seriale = 'PF3XXXX1'$$, 'venduto senza vendita');
select pg_temp.deve_fallire($$delete from public.device where seriale = 'PF3XXXX1'$$, 'cancellare un device');
update public.device set prezzo = 239 where seriale = 'PF3XXXX1';
select pg_temp.verifica((select prezzo_confermato_da is null from public.device where seriale = 'PF3XXXX1'), 'prezzo cambiato dallo stage: da riconfermare');
reset role;

-- 10 · valore bolle
select pg_temp.come('00000000-0000-0000-0000-000000000008');
select pg_temp.verifica(public.valore_bolla('40000000-0000-0000-0000-000000000004') = 0, 'la Corporation non vede il valore delle bolle');
reset role;

-- 6 · funzioni create dopo le migrazioni non sono pubbliche
create function public.prova_futura() returns int language sql as 'select 1';
select pg_temp.verifica(not has_function_privilege('anon', 'public.prova_futura()', 'execute'), 'funzione nuova eseguibile da anon');
drop function public.prova_futura();
