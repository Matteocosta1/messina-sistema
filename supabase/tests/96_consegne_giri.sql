-- 22 ottobre · Blocco 1: colli creati alla conferma, consegna con riserva, ritiro, nuova data,
-- chiusura d'ufficio, stati del giro, riconsegna per oggi, vincoli del mezzo
create or replace function pg_temp.come(p uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
  perform set_config('request.jwt.claim.aal', p_aal, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.verifica(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'TEST FALLITO: %', msg; end if; end $$;
create or replace function pg_temp.deve_fallire(sql text, msg text) returns void language plpgsql as $$
begin begin execute sql; exception when others then return; end; raise exception 'TEST FALLITO (doveva essere bloccato): %', msg; end $$;
grant execute on function pg_temp.come(uuid, text), pg_temp.verifica(boolean, text), pg_temp.deve_fallire(text, text) to public;

-- autista 2 (furgone, senza sponda) con un giro di oggi preparato a mano, non ancora partito
insert into public.giri (id, data, mezzo_id, autista_id, zona) values
  ('50000000-0000-0000-0000-000000009601', public.oggi() + 20, '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Test');
insert into public.bolle (id, cliente_id, tipo, data_consegna, destinatario, indirizzo, citta, colli_previsti, accessori, stato, operatore_id, fuori_dai_giri) values
  ('40000000-0000-0000-0000-000000009601', '10000000-0000-0000-0000-000000000002', 'Consegna', public.oggi(), 'Apple', 'Via [indirizzo]', 'Milano', 3, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003', true),
  ('40000000-0000-0000-0000-000000009602', '10000000-0000-0000-0000-000000000002', 'Consegna', public.oggi(), 'Apple', 'Via [indirizzo]', 'Milano', 4, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003', true),
  ('40000000-0000-0000-0000-000000009603', '10000000-0000-0000-0000-000000000003', 'Ritiro',   public.oggi(), 'Luxiona', 'Via [indirizzo]', 'Assago', 2, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003', true),
  ('40000000-0000-0000-0000-000000009604', '10000000-0000-0000-0000-000000000003', 'Consegna', public.oggi(), 'Luxiona', 'Via [indirizzo]', 'Assago', 1, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003', true),
  ('40000000-0000-0000-0000-000000009605', '10000000-0000-0000-0000-000000000003', 'Consegna', public.oggi(), 'Luxiona', 'Via [indirizzo]', 'Assago', 1, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003', true);
update public.bolle set stato = 'Confermata' where id::text like '40000000-0000-0000-0000-00000000960_';

-- ------------------------------------------------------------------ 1 · Colli creati alla conferma
select pg_temp.verifica((select count(*) from public.colli where bolla_id = '40000000-0000-0000-0000-000000009601') = 3, 'tre colli creati alla conferma');
select pg_temp.verifica((select bool_and(k.codice like b.numero || '-%') from public.colli k join public.bolle b on b.id = k.bolla_id where b.id = '40000000-0000-0000-0000-000000009601'),
                        'il codice del collo parte dal numero della bolla');

-- giro di oggi (il giro di test sopra è fra 20 giorni: lo spostiamo a oggi su un mezzo libero)
update public.giri set data = public.oggi(), mezzo_id = '30000000-0000-0000-0000-000000000004' where id = '50000000-0000-0000-0000-000000009601';
update public.mezzi set autista_id = '20000000-0000-0000-0000-000000000002' where id = '30000000-0000-0000-0000-000000000004';
update public.giri set autista_id = '20000000-0000-0000-0000-000000000002' where id = '50000000-0000-0000-0000-000000009601';
delete from public.fermate f using public.giri g where f.giro_id = g.id and g.autista_id = '20000000-0000-0000-0000-000000000002' and g.data = public.oggi() and g.id <> '50000000-0000-0000-0000-000000009601';
delete from public.giri where autista_id = '20000000-0000-0000-0000-000000000002' and data = public.oggi() and id <> '50000000-0000-0000-0000-000000009601';
insert into public.fermate (id, giro_id, bolla_id, ordine) values
  ('51000000-0000-0000-0000-000000009601', '50000000-0000-0000-0000-000000009601', '40000000-0000-0000-0000-000000009601', 1),
  ('51000000-0000-0000-0000-000000009602', '50000000-0000-0000-0000-000000009601', '40000000-0000-0000-0000-000000009602', 2),
  ('51000000-0000-0000-0000-000000009603', '50000000-0000-0000-0000-000000009601', '40000000-0000-0000-0000-000000009603', 3),
  ('51000000-0000-0000-0000-000000009604', '50000000-0000-0000-0000-000000009601', '40000000-0000-0000-0000-000000009604', 4),
  ('51000000-0000-0000-0000-000000009605', '50000000-0000-0000-0000-000000009601', '40000000-0000-0000-0000-000000009605', 5);
select pg_temp.verifica((select stato = 'Preparato' from public.giri where id = '50000000-0000-0000-0000-000000009601'), 'giro preparato');

-- ------------------------------------------------------------------ 2 · Consegna completa con i colli creati dal database
select pg_temp.come('00000000-0000-0000-0000-000000000012');
select public.scansiona_consegna('51000000-0000-0000-0000-000000009601', k.codice) from public.colli k where k.bolla_id = '40000000-0000-0000-0000-000000009601';
reset role;
select pg_temp.verifica((select stato = 'Partito' from public.giri where id = '50000000-0000-0000-0000-000000009601'), 'alla prima scansione il giro è partito');
select pg_temp.verifica((select count(*) from public.bolle where id::text like '40000000-0000-0000-0000-00000000960_' and stato = 'In giro') = 5, 'le bolle del giro sono «In giro»');
select pg_temp.come('00000000-0000-0000-0000-000000000012');
select public.firma_fermata('51000000-0000-0000-0000-000000009601');
select public.foto_bolla('51000000-0000-0000-0000-000000009601', 'bolle/x.jpg', 999);
select public.chiudi_fermata('51000000-0000-0000-0000-000000009601', true);
reset role;
select pg_temp.verifica((select stato = 'Consegnata' from public.bolle where id = '40000000-0000-0000-0000-000000009601'), 'consegna completa chiusa');
select pg_temp.verifica((select colli_consegnati = 3 from public.fermate where id = '51000000-0000-0000-0000-000000009601'), 'colli consegnati registrati');

-- ------------------------------------------------------------------ 3 · Consegna con riserva: 3 colli su 4
select pg_temp.come('00000000-0000-0000-0000-000000000012');
select public.scansiona_consegna('51000000-0000-0000-0000-000000009602', k.codice)
  from (select codice from public.colli where bolla_id = '40000000-0000-0000-0000-000000009602' order by codice limit 3) k;
select public.firma_fermata('51000000-0000-0000-0000-000000009602');
select public.foto_bolla('51000000-0000-0000-0000-000000009602', 'bolle/y.jpg', 999);
select pg_temp.deve_fallire($$select public.chiudi_fermata('51000000-0000-0000-0000-000000009602', true)$$, '3 colli su 4 chiusa senza riserva');
select public.chiudi_fermata('51000000-0000-0000-0000-000000009602', true, p_riserva => 'Manca 1 collo');
reset role;
select pg_temp.verifica((select riserva = 'Manca 1 collo' and colli_consegnati = 3 from public.fermate where id = '51000000-0000-0000-0000-000000009602'), 'riserva e colli registrati');
select pg_temp.verifica((select stato = 'Consegnata' from public.bolle where id = '40000000-0000-0000-0000-000000009602'), 'consegna con riserva chiusa');

-- ------------------------------------------------------------------ 4 · Ritiro: i colli si contano
select pg_temp.come('00000000-0000-0000-0000-000000000012');
select public.firma_fermata('51000000-0000-0000-0000-000000009603');
select public.foto_bolla('51000000-0000-0000-0000-000000009603', 'bolle/z.jpg', 999);
select pg_temp.deve_fallire($$select public.chiudi_fermata('51000000-0000-0000-0000-000000009603', true)$$, 'ritiro senza il numero di colli');
select pg_temp.deve_fallire($$select public.chiudi_fermata('51000000-0000-0000-0000-000000009603', true, p_colli_ritirati => 3)$$, 'ritiro con colli diversi senza riserva');
select public.chiudi_fermata('51000000-0000-0000-0000-000000009603', true, p_colli_ritirati => 2);
reset role;
select pg_temp.verifica((select colli_ritirati = 2 from public.fermate where id = '51000000-0000-0000-0000-000000009603'), 'colli ritirati registrati');

-- ------------------------------------------------------------------ 5 · Nuova data: torna da sola nei giri
select pg_temp.come('00000000-0000-0000-0000-000000000012');
select pg_temp.deve_fallire($$select public.chiudi_fermata('51000000-0000-0000-0000-000000009604', false, 'Assente', 'Nuova data')$$, 'nuova data senza data');
select pg_temp.deve_fallire($$select public.chiudi_fermata('51000000-0000-0000-0000-000000009604', false, 'Assente', 'Nuova data', p_nuova_data => public.oggi())$$, 'nuova data oggi');
select public.chiudi_fermata('51000000-0000-0000-0000-000000009604', false, 'Assente', 'Nuova data', p_nuova_data => public.oggi() + 20);
reset role;
select pg_temp.verifica((select stato = 'Confermata' and data_consegna = public.oggi() + 20 from public.bolle where id = '40000000-0000-0000-0000-000000009604'), 'bolla confermata con la nuova data');
select pg_temp.verifica((select count(*) from public.accessori_extra where fermata_id = '51000000-0000-0000-0000-000000009604' and voce = 'Riconsegna') = 1, 'riconsegna da fatturare');
-- i giri di quel giorno esistono (giro di test non c'è più): li prepara il sistema
insert into public.giri (data, mezzo_id, autista_id, zona) values (public.oggi() + 20, '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Altro');
select public.prepara_giri_sistema(public.oggi() + 20);
select pg_temp.verifica((select count(*) from public.fermate where bolla_id = '40000000-0000-0000-0000-000000009604' and esito = 'Da fare') = 1, 'la bolla è di nuovo in un giro');

-- ------------------------------------------------------------------ 6 · Chiusura d'ufficio
select pg_temp.come('00000000-0000-0000-0000-000000000012');
select pg_temp.deve_fallire($$select public.chiudi_ufficio('51000000-0000-0000-0000-000000009605', true, 'Telefono rotto')$$, 'l''autista chiude d''ufficio');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select pg_temp.deve_fallire($$select public.chiudi_ufficio('51000000-0000-0000-0000-000000009605', true, '  ')$$, 'chiusura d''ufficio senza motivo');
select public.chiudi_ufficio('51000000-0000-0000-0000-000000009605', true, 'Telefono dell''autista rotto: firma su carta');
reset role;
select pg_temp.verifica((select esito = 'Consegnata' and da_ufficio and chiusa_da = '00000000-0000-0000-0000-000000000003' from public.fermate where id = '51000000-0000-0000-0000-000000009605'),
                        'chiusa dall''ufficio con chi l''ha fatto');
select pg_temp.verifica((select count(*) from public.storico where oggetto = 'fermate' and oggetto_id = '51000000-0000-0000-0000-000000009605') >= 1, 'chiusura d''ufficio nello Storico');
select pg_temp.verifica((select stato = 'Rientrato' from public.giri where id = '50000000-0000-0000-0000-000000009601'), 'tutte le fermate chiuse: giro rientrato');

-- ------------------------------------------------------------------ 7 · Rimetti in giro una bolla non consegnata
insert into public.bolle (id, cliente_id, tipo, data_consegna, destinatario, indirizzo, citta, colli_previsti, accessori, stato, operatore_id, fuori_dai_giri) values
  ('40000000-0000-0000-0000-000000009606', '10000000-0000-0000-0000-000000000003', 'Consegna', public.oggi(), 'Luxiona', 'Via [indirizzo]', 'Assago', 1, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003', true);
update public.bolle set stato = 'Confermata' where id = '40000000-0000-0000-0000-000000009606';
insert into public.fermate (id, giro_id, bolla_id, ordine) values ('51000000-0000-0000-0000-000000009606', '50000000-0000-0000-0000-000000009601', '40000000-0000-0000-0000-000000009606', 6);
select pg_temp.verifica((select stato = 'Partito' from public.giri where id = '50000000-0000-0000-0000-000000009601'), 'una fermata nuova fa ripartire il giro rientrato');
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select public.chiudi_ufficio('51000000-0000-0000-0000-000000009606', false, 'Cliente chiuso', 'Riprovo dopo');
select public.rimetti_in_giro('40000000-0000-0000-0000-000000009606', public.oggi() + 1);
reset role;
select pg_temp.verifica((select stato = 'Confermata' and data_consegna = public.oggi() + 1 and not fuori_dai_giri from public.bolle where id = '40000000-0000-0000-0000-000000009606'),
                        'bolla rimessa in giro');

-- ------------------------------------------------------------------ 8 · Riconsegna per oggi: entra nel giro di oggi
insert into public.bolle (id, cliente_id, tipo, data_consegna, destinatario, indirizzo, citta, colli_previsti, accessori, stato, operatore_id) values
  ('40000000-0000-0000-0000-000000009607', '10000000-0000-0000-0000-000000000001', 'Consegna', public.oggi() - 2, 'Snam', 'Via [indirizzo]', 'Milano', 1, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003');
update public.bolle set stato = 'Confermata' where id = '40000000-0000-0000-0000-000000009607';
update public.giri set stato = 'Partito' where id = '50000000-0000-0000-0000-000000000001';   -- un giro di oggi ancora in strada
insert into public.giacenze (id, bolla_id, motivo) values ('60000000-0000-0000-0000-000000009607', '40000000-0000-0000-0000-000000009607', 'Destinatario assente');
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select public.prenota_riconsegna('60000000-0000-0000-0000-000000009607', public.oggi());
reset role;
select pg_temp.verifica((select count(*) from public.fermate f join public.giri g on g.id = f.giro_id
                          where f.bolla_id = '40000000-0000-0000-0000-000000009607' and g.data = public.oggi() and f.esito = 'Da fare') = 1, 'riconsegna di oggi nel giro di oggi');

-- ------------------------------------------------------------------ 9 · Vincoli del mezzo alla conferma
insert into public.bolle (id, cliente_id, tipo, data_consegna, destinatario, indirizzo, citta, colli_previsti, peso_kg, accessori, stato, operatore_id, fuori_dai_giri) values
  ('40000000-0000-0000-0000-000000009608', '10000000-0000-0000-0000-000000000001', 'Consegna', public.oggi() + 30, 'Snam', 'Via [indirizzo]', 'Milano', 1, 10, '{Sponda}', 'Nuova', '00000000-0000-0000-0000-000000000003', true),
  ('40000000-0000-0000-0000-000000009609', '10000000-0000-0000-0000-000000000002', 'Consegna', public.oggi() + 31, 'Apple', 'Via [indirizzo]', 'Milano', 1, 5000, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003', true);
update public.bolle set stato = 'Confermata' where id in ('40000000-0000-0000-0000-000000009608', '40000000-0000-0000-0000-000000009609');
insert into public.giri (id, data, mezzo_id, autista_id, zona) values
  ('50000000-0000-0000-0000-000000009608', public.oggi() + 30, '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Milano'),
  ('50000000-0000-0000-0000-000000009609', public.oggi() + 31, '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Milano');
insert into public.fermate (giro_id, bolla_id, ordine) values
  ('50000000-0000-0000-0000-000000009608', '40000000-0000-0000-0000-000000009608', 1),
  ('50000000-0000-0000-0000-000000009609', '40000000-0000-0000-0000-000000009609', 1);
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select pg_temp.deve_fallire($$select public.conferma_giri(public.oggi() + 30)$$, 'sponda su un furgone senza sponda');
select pg_temp.deve_fallire($$select public.conferma_giri(public.oggi() + 31)$$, '5.000 kg su un furgone da 1.000');
reset role;

-- ------------------------------------------------------------------ 10 · Giri e fermate solo con le funzioni
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select pg_temp.deve_fallire($$update public.fermate set ordine = 99 where id = '51000000-0000-0000-0000-000000009606'$$, 'fermata cambiata direttamente');
select pg_temp.deve_fallire($$update public.giri set stato = 'Chiuso' where id = '50000000-0000-0000-0000-000000009601'$$, 'giro cambiato direttamente');
reset role;
