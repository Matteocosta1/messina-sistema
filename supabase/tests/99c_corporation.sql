-- Corporation: lotti con quadratura, vendite nette, resi, marketplace, conferma prezzo, telefoni
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

-- 1 · Lotto nuovo: 3 PC dichiarati, costo 1000; i PC prendono la quota e alla chiusura la somma torna esatta
select pg_temp.come('00000000-0000-0000-0000-000000000008');
insert into public.lotti (id, codice, fornitore, acquistato_il, pezzi, costo) values ('70000000-0000-0000-0000-000000000009', 'L-099', 'Prova', current_date, 3, 1000);
insert into public.device (id, seriale, marca, modello, grado, lotto_id, stato) values
  ('71000000-0000-0000-0000-000000000091', 'T-091', 'Dell', 'Latitude 5420', 'B', '70000000-0000-0000-0000-000000000009', 'In carico'),
  ('71000000-0000-0000-0000-000000000092', 'T-092', 'Dell', 'Latitude 5420', 'B', '70000000-0000-0000-0000-000000000009', 'In carico');
select pg_temp.verifica((select costo from public.device where seriale = 'T-091') = 333.33, 'un PC entrato prende la sua quota del lotto');
select pg_temp.deve_fallire($$select public.chiudi_lotto('70000000-0000-0000-0000-000000000009')$$, 'chiusura con pezzi diversi dal DDT senza nota');
select public.chiudi_lotto('70000000-0000-0000-0000-000000000009', 'Un PC mancante nel DDT');
select pg_temp.verifica((select sum(costo) from public.device where lotto_id = '70000000-0000-0000-0000-000000000009') = 1000, 'costo ripartito = costo del lotto');
select pg_temp.verifica((select differenza from public.lotti_quadratura where codice = 'L-099') = 0, 'quadratura a zero');
select pg_temp.deve_fallire($$insert into public.device (seriale, lotto_id) values ('T-093', '70000000-0000-0000-0000-000000000009')$$, 'nel lotto chiuso non entra più niente');

-- 2 · Prezzo: chi non è Vendite non conferma; Vendite preme «Conferma»
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.deve_fallire($$select public.conferma_prezzo('71000000-0000-0000-0000-000000000091')$$, 'il magazzino non conferma i prezzi');
select pg_temp.come('00000000-0000-0000-0000-000000000008');
select pg_temp.deve_fallire($$update public.device set prezzo_confermato_da = auth.uid() where seriale = 'T-091'$$, 'la conferma non si scrive a mano');
update public.device set prezzo = 300, bancale_id = '60000000-0000-0000-0000-000000000005', stato = 'Disponibile', siti = '{eBay,Back Market}' where seriale = 'T-091';
select public.conferma_prezzo('71000000-0000-0000-0000-000000000091');
select pg_temp.verifica((select prezzo_confermato_da is not null from public.device where seriale = 'T-091'), 'prezzo confermato');
select pg_temp.deve_fallire($$update public.device set siti = '{Ebay}' where seriale = 'T-091'$$, 'solo i siti della lista');

-- 3 · Vendita registrata a mano da eBay: ordine, IVA sul margine, il PC sparisce dagli altri siti
select public.registra_vendita('T-091', 'eBay', 600, 40, 10, 'EB-1') is not null;
select pg_temp.verifica((select stato = 'Venduto' and siti = '{eBay}' from public.device where seriale = 'T-091'), 'venduto e tolto dagli altri siti');
select pg_temp.verifica((select iva from public.vendite where riferimento = 'EB-1') = round((600 - 500) * 22 / 122.0, 2), 'IVA del margine');
select pg_temp.verifica((select netto from public.vendite where riferimento = 'EB-1') = 600 - 40 - 10 - round((600 - 500) * 22 / 122.0, 2), 'netto = prezzo - commissione - spese - IVA');
select pg_temp.verifica((select count(*) from public.ordini where riferimento = 'EB-1' and stato = 'Da preparare') = 1, 'nasce l''ordine da preparare');
select pg_temp.deve_fallire($$select public.registra_vendita('T-091', 'eBay', 400)$$, 'un PC venduto non si rivende');
select pg_temp.deve_fallire($$select public.registra_vendita('T-092', 'Vinted', 100)$$, 'canale fuori lista');
select pg_temp.deve_fallire($$select public.ordine_spedito((select id from public.ordini where riferimento = 'EB-1'), '')$$, 'spedito senza tracking');
select public.ordine_spedito((select id from public.ordini where riferimento = 'EB-1'), 'BRT123');
select pg_temp.verifica((select stato = 'Spedito' and tracking = 'BRT123' from public.ordini where riferimento = 'EB-1'), 'ordine spedito con tracking');

-- 4 · Reso con rimborso: il PC torna «Reso», si rimette in vendita su un bancale; il lotto conta il rimborso
select pg_temp.deve_fallire($$select public.reso_vendita((select id from public.vendite where riferimento = 'EB-1'), 700, 'Schermo', true)$$, 'rimborso oltre il prezzo');
select public.reso_vendita((select id from public.vendite where riferimento = 'EB-1'), 400, 'Schermo graffiato', true);
select pg_temp.verifica((select stato = 'Reso' and siti = '{}' from public.device where seriale = 'T-091'), 'il PC reso torna in magazzino');
select pg_temp.verifica((select incassato from public.lotti_conti where codice = 'L-099') = 600 - 40 - 10 - round((600 - 500) * 22 / 122.0, 2) - 400, 'il lotto conta il rimborso');
select pg_temp.verifica((select venduti from public.lotti_conti where codice = 'L-099') = 0, 'un PC reso non è venduto');
select pg_temp.deve_fallire($$select public.rimetti_in_vendita('71000000-0000-0000-0000-000000000091', 'B-9999', 280)$$, 'senza bancale vero non torna in vendita');
select public.rimetti_in_vendita('71000000-0000-0000-0000-000000000091', 'B-0105', 280);
select public.registra_vendita('T-091', 'Di persona', 280) is not null;
select pg_temp.verifica((select count(*) from public.vendite where device_id = '71000000-0000-0000-0000-000000000091') = 2, 'rivenduto dopo il reso');
select pg_temp.verifica((select siti = '{}' from public.device where seriale = 'T-091'), 'venduto di persona: nessun sito');
select public.metti_fermo('71000000-0000-0000-0000-000000000092', 'Scheda madre');
select pg_temp.verifica((select stato = 'Fermo' from public.device where seriale = 'T-092'), 'PC fermo');

-- 5 · Telefoni e prezzi per modello
insert into public.prezzi_modello values ('iPhone 13', 'A', 390);
select pg_temp.verifica(public.prezzo_proposto('iPhone 13', 'A') = 390, 'prezzo proposto per modello e grado');
insert into public.device (seriale, tipo, marca, modello, memoria, batteria, colore, grado) values ('35PROVA0001', 'Telefono', 'Apple', 'iPhone 13', '128 GB', 89, 'Blu', 'A');
select pg_temp.deve_fallire($$insert into public.device (seriale, tipo, batteria) values ('35PROVA0002', 'Telefono', 120)$$, 'batteria oltre 100');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select pg_temp.deve_fallire($$select public.registra_vendita('PF3XXXX1', 'eBay', 100)$$, 'i Trasporti non registrano vendite');
reset role;
select set_config('request.jwt.claim.sub', '', false);
