-- 21 ottobre notte: firma che blocca «Non consegnato», giri preparati dal sistema, pagina del giro
create or replace function pg_temp.come(p uuid, p_aal text default 'aal1') returns void language plpgsql as $$
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

-- ------------------------------------------------------------------ 1 · Firma
insert into public.bolle (id, cliente_id, tipo, data_consegna, destinatario, indirizzo, citta, colli_previsti, accessori, stato, operatore_id) values
  ('40000000-0000-0000-0000-000000000951', '10000000-0000-0000-0000-000000000001', 'Consegna', current_date, 'Snam', 'Via [indirizzo]', 'Milano', 1, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000952', '10000000-0000-0000-0000-000000000002', 'Consegna', current_date, 'Apple', 'Via [indirizzo]', 'Milano', 1, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003');
update public.bolle set stato = 'Confermata' where id in ('40000000-0000-0000-0000-000000000951', '40000000-0000-0000-0000-000000000952');
insert into public.fermate (id, giro_id, bolla_id, ordine) values
  ('51000000-0000-0000-0000-000000000951', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000951', 951),
  ('51000000-0000-0000-0000-000000000952', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000952', 952);

select pg_temp.come('00000000-0000-0000-0000-000000000006');
select public.firma_fermata('51000000-0000-0000-0000-000000000951');
select pg_temp.deve_fallire($$select public.chiudi_fermata('51000000-0000-0000-0000-000000000951', false, 'Assente', 'Giacenza')$$, 'firmata e poi «Non consegnata»');
select pg_temp.deve_fallire($$select public.riprova_dopo('51000000-0000-0000-0000-000000000951', 'Chiuso')$$, 'firmata e poi «Riprovo dopo»');
-- senza firma la mancata consegna resta possibile
select public.chiudi_fermata('51000000-0000-0000-0000-000000000952', false, 'Assente', 'Nuova data', p_nuova_data => current_date + 2);
reset role;
select pg_temp.verifica((select esito = 'Da fare' and firmata from public.fermate where id = '51000000-0000-0000-0000-000000000951'), 'la fermata firmata è rimasta aperta');
select pg_temp.verifica((select esito = 'Non consegnata' from public.fermate where id = '51000000-0000-0000-0000-000000000952'), 'senza firma si chiude come mancata');
select pg_temp.deve_fallire($$update public.fermate set esito = 'Non consegnata', motivo = 'x', dopo = 'Giacenza' where id = '51000000-0000-0000-0000-000000000951'$$,
                            'il trigger lascia chiudere come mancata una fermata firmata');
select pg_temp.deve_fallire($$update public.fermate set firmata = false where id = '51000000-0000-0000-0000-000000000951'$$, 'firma tolta');

-- ------------------------------------------------------------------ 2 · Giri preparati dal sistema
insert into public.bolle (id, cliente_id, tipo, data_consegna, fascia, destinatario, indirizzo, citta, colli_previsti, accessori, stato, operatore_id) values
  ('40000000-0000-0000-0000-000000000961', '10000000-0000-0000-0000-000000000001', 'Consegna', current_date + 5, '9–12', 'Snam', 'Via [indirizzo]', 'Pavia', 2, '{Sponda}', 'Nuova', '00000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000962', '10000000-0000-0000-0000-000000000002', 'Consegna', current_date + 5, null, 'Apple', 'Via [indirizzo]', 'Pavia', 1, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000963', '10000000-0000-0000-0000-000000000003', 'Consegna', current_date + 5, null, 'Luxiona', 'Via [indirizzo]', 'Lodi', 3, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003');
update public.bolle set stato = 'Confermata' where id in ('40000000-0000-0000-0000-000000000961', '40000000-0000-0000-0000-000000000962', '40000000-0000-0000-0000-000000000963');
select pg_temp.verifica((select count(*) from public.giri where data = current_date + 5) = 0, 'giri creati prima della preparazione');

-- gli utenti non chiamano la preparazione del sistema
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select pg_temp.deve_fallire($$select public.prepara_giri_sistema(current_date + 5)$$, 'preparazione del sistema chiamata da un utente');
select pg_temp.deve_fallire($$select public.prepara_giri_pianificato()$$, 'pianificazione chiamata da un utente');
reset role;

select pg_temp.verifica(public.prepara_giri_sistema(current_date + 5) = 3, 'tre spedizioni messe nei giri');
select pg_temp.verifica((select count(*) from public.giri where data = current_date + 5) = 2, 'due giri (Pavia e Lodi)');
select pg_temp.verifica((select count(*) from public.giri_preparazioni where data = current_date + 5) = 1, 'preparazione registrata');
select pg_temp.verifica(public.prepara_giri_sistema(current_date + 5) = 0, 'la seconda preparazione non aggiunge nulla');

select pg_temp.come('00000000-0000-0000-0000-000000000004');
select pg_temp.verifica((select count(*) from public.giri_preparazioni) >= 1, 'il traffico non legge la preparazione');
select pg_temp.verifica(public.conferma_giri(current_date + 5) = 2, 'due giri confermati');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000006');
select pg_temp.verifica((select count(*) from public.giri_preparazioni) = 0, 'l''autista legge la preparazione');
reset role;

-- spedizione nuova dopo la conferma: entra da sola e il giro torna da confermare
insert into public.bolle (id, cliente_id, tipo, data_consegna, destinatario, indirizzo, citta, colli_previsti, accessori, stato, operatore_id) values
  ('40000000-0000-0000-0000-000000000964', '10000000-0000-0000-0000-000000000004', 'Consegna', current_date + 5, 'Econocom', 'Via [indirizzo]', 'Lodi', 1, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003');
select pg_temp.verifica((select count(*) from public.fermate where bolla_id = '40000000-0000-0000-0000-000000000964') = 0, 'bolla nuova nel giro prima della conferma');
update public.bolle set stato = 'Confermata' where id = '40000000-0000-0000-0000-000000000964';
select pg_temp.verifica((select g.confermato_il is null and cardinality(g.da_confermare) = 1 and g.da_confermare[1] like 'Aggiunta Econocom%'
                           from public.fermate f join public.giri g on g.id = f.giro_id where f.bolla_id = '40000000-0000-0000-0000-000000000964'),
                        'la spedizione nuova è nel giro di Lodi, tornato da confermare con scritto cosa è cambiato');
select pg_temp.verifica((select count(*) from public.giri where data = current_date + 5 and confermato_il is not null) = 1, 'l''altro giro resta confermato');
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select pg_temp.verifica(public.conferma_giri(current_date + 5) = 1, 'riconferma del solo giro cambiato');
reset role;
select pg_temp.verifica((select bool_and(cardinality(da_confermare) = 0) from public.giri where data = current_date + 5), 'dopo la conferma non resta niente da confermare');

-- ------------------------------------------------------------------ 3 · Modifiche al giro
-- chi non è del traffico non modifica
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.deve_fallire($$select public.giro_togli((select id from public.fermate where bolla_id = '40000000-0000-0000-0000-000000000961'))$$, 'il magazzino toglie una fermata');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000006');
select pg_temp.deve_fallire($$select public.giro_ordine((select id from public.fermate where bolla_id = '40000000-0000-0000-0000-000000000961'), false)$$, 'l''autista cambia l''ordine');
select pg_temp.deve_fallire($$delete from public.fermate where bolla_id = '40000000-0000-0000-0000-000000000961'$$, 'l''autista cancella una fermata');
reset role;
select pg_temp.verifica((select count(*) from public.fermate where bolla_id = '40000000-0000-0000-0000-000000000961') = 1, 'l''autista ha cancellato una fermata');

select pg_temp.come('00000000-0000-0000-0000-000000000004');
-- Su/Giù
select public.giro_ordine((select id from public.fermate where bolla_id = '40000000-0000-0000-0000-000000000962'), true);
reset role;
select pg_temp.verifica((select f1.ordine < f2.ordine from public.fermate f1, public.fermate f2
                          where f1.bolla_id = '40000000-0000-0000-0000-000000000962' and f2.bolla_id = '40000000-0000-0000-0000-000000000961'), 'Su non ha anticipato la fermata');
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select pg_temp.deve_fallire($$select public.giro_ordine((select id from public.fermate where bolla_id = '40000000-0000-0000-0000-000000000962'), true)$$, 'Su sulla prima fermata');
-- Modifica: fascia e accessori
select public.giro_modifica((select id from public.fermate where bolla_id = '40000000-0000-0000-0000-000000000961'), '14–16', '{Sponda,"Chiamare prima"}');
reset role;
select pg_temp.verifica((select fascia = '14–16' from public.bolle where id = '40000000-0000-0000-0000-000000000961'), 'fascia non cambiata');
select pg_temp.verifica((select array_agg(voce) = '{"Chiamare prima"}' from public.accessori_extra a join public.fermate f on f.id = a.fermata_id
                          where f.bolla_id = '40000000-0000-0000-0000-000000000961'), 'accessorio aggiunto mancante (o Sponda doppio)');
select pg_temp.come('00000000-0000-0000-0000-000000000004');
-- Passa a… un altro mezzo
select public.giro_passa((select id from public.fermate where bolla_id = '40000000-0000-0000-0000-000000000961'),
                         (select g.id from public.giri g where g.data = current_date + 5 and g.zona = 'Lodi'));
reset role;
select pg_temp.verifica((select g.zona = 'Lodi' and f.ordine = 3 from public.fermate f join public.giri g on g.id = f.giro_id
                          where f.bolla_id = '40000000-0000-0000-0000-000000000961'), 'la fermata non è in fondo al giro di Lodi');
select pg_temp.verifica((select count(*) from public.accessori_extra a join public.fermate f on f.id = a.fermata_id
                          where f.bolla_id = '40000000-0000-0000-0000-000000000961') = 1, 'l''accessorio si è perso nel passaggio');
-- Togli: torna da assegnare e il sistema non la rimette da solo
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select public.giro_togli((select id from public.fermate where bolla_id = '40000000-0000-0000-0000-000000000962'));
reset role;
select pg_temp.verifica((select count(*) from public.fermate where bolla_id = '40000000-0000-0000-0000-000000000962') = 0, 'fermata non tolta');
select pg_temp.verifica(public.prepara_giri_sistema(current_date + 5) = 0, 'il sistema ha rimesso nel giro una spedizione tolta a mano');
-- + Aggiungi fermata
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select public.giro_aggiungi((select g.id from public.giri g where g.data = current_date + 5 and g.zona = 'Pavia'), '40000000-0000-0000-0000-000000000962');
select pg_temp.deve_fallire($$select public.giro_aggiungi((select g.id from public.giri g where g.data = current_date + 5 and g.zona = 'Lodi'), '40000000-0000-0000-0000-000000000962')$$,
                            'spedizione aggiunta a due giri');
select pg_temp.deve_fallire($$select public.giro_aggiungi('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000963')$$, 'spedizione di un altro giorno');
reset role;
select pg_temp.verifica((select not fuori_dai_giri from public.bolle where id = '40000000-0000-0000-0000-000000000962'), 'riaggiunta ma ancora fuori dai giri');
-- tutto nello Storico, con chi
select pg_temp.verifica((select count(*) from public.storico where oggetto = 'giri' and come = 'Manuale' and chi = '00000000-0000-0000-0000-000000000004') >= 6,
                        'le modifiche del giro non sono nello Storico con chi le ha fatte');
-- giro non partito: nessun avviso all'autista
select pg_temp.verifica((select count(*) from public.avvisi_autista) = 0, 'avviso mandato per un giro non partito');

-- ------------------------------------------------------------------ Avviso «Il tuo giro è cambiato»
insert into public.bolle (id, cliente_id, tipo, data_consegna, destinatario, indirizzo, citta, colli_previsti, accessori, stato, operatore_id) values
  ('40000000-0000-0000-0000-000000000953', '10000000-0000-0000-0000-000000000003', 'Consegna', current_date, 'Luxiona', 'Via [indirizzo]', 'Assago', 1, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003');
update public.bolle set stato = 'Confermata', fuori_dai_giri = true where id = '40000000-0000-0000-0000-000000000953';   -- la fermata la mette il test
insert into public.fermate (id, giro_id, bolla_id, ordine) values ('51000000-0000-0000-0000-000000000953', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000953', 953);
update public.giri set confermato_il = now() where id = '50000000-0000-0000-0000-000000000001';
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select public.giro_modifica('51000000-0000-0000-0000-000000000953', '15–17', '{}');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000006');
select pg_temp.verifica((select count(*) from public.miei_avvisi() where testo like 'Il tuo giro è cambiato%') = 1, 'l''autista partito non riceve l''avviso');
select public.avviso_letto((select id from public.miei_avvisi() limit 1));
select pg_temp.verifica((select count(*) from public.miei_avvisi()) = 0, 'l''avviso letto resta da leggere');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.verifica((select count(*) from public.avvisi_autista) = 0, 'il magazzino legge gli avvisi degli autisti');
select pg_temp.deve_fallire($$select public.avviso_letto((select id from public.avvisi_autista limit 1))$$, 'avviso di un altro segnato letto');
reset role;
