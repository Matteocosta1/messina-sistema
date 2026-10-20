-- Modifiche del 20 ottobre sera: giri confermati, giacenze, collo sul bancale, satellitare e telecamere solo alla direzione
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

-- dati: una bolla Econocom con due colli, un giro di dopodomani, una giacenza
insert into public.bolle (id, cliente_id, tipo, data_consegna, destinatario, indirizzo, citta, colli_previsti, accessori, stato, operatore_id) values
  ('40000000-0000-0000-0000-000000000801', '10000000-0000-0000-0000-000000000004', 'Magazzino', current_date, 'Econocom', 'Lacchiarella', 'Lacchiarella', 2, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000802', '10000000-0000-0000-0000-000000000001', 'Consegna', current_date, 'Snam', 'Via [indirizzo]', 'Milano', 1, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003');
update public.bolle set stato = 'Confermata' where id in ('40000000-0000-0000-0000-000000000801', '40000000-0000-0000-0000-000000000802');
insert into public.colli (bolla_id, codice) values ('40000000-0000-0000-0000-000000000801', 'C-801-1'), ('40000000-0000-0000-0000-000000000801', 'C-801-2');
insert into public.giri (id, data, mezzo_id, autista_id, zona) values
  ('50000000-0000-0000-0000-000000000801', current_date + 2, '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Milano');
insert into public.bancali (codice, cliente_id, posto_id) select 'B-0801', '10000000-0000-0000-0000-000000000004', id from public.posti where codice = 'S10-1-1';
insert into public.giacenze (id, bolla_id, motivo) values ('70000000-0000-0000-0000-000000000801', '40000000-0000-0000-0000-000000000802', 'Destinatario assente');

-- Traffico: conferma dei giri
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.deve_fallire($$select public.conferma_giri(current_date + 2)$$, 'il magazzino conferma i giri');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select pg_temp.verifica(public.conferma_giri(current_date + 2) = 1, 'un giro confermato');
select pg_temp.deve_fallire($$select public.conferma_giri(current_date + 2)$$, 'confermati due volte');
reset role;
select pg_temp.verifica((select confermato_il is not null from public.giri where id = '50000000-0000-0000-0000-000000000801'), 'giro segnato confermato');

-- Giacenze: chiesta una volta sola, poi riconsegna con giorno e ora
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select public.chiesta_al_cliente('70000000-0000-0000-0000-000000000801');
select pg_temp.verifica((select chiesta_il from public.giacenze_aperte where id = '70000000-0000-0000-0000-000000000801') is not null, 'resta segnata come chiesta');
select pg_temp.deve_fallire($$select public.prenota_riconsegna('70000000-0000-0000-0000-000000000801', current_date - 1, '10:00')$$, 'data passata');
select public.prenota_riconsegna('70000000-0000-0000-0000-000000000801', current_date + 3, '10:00');
select pg_temp.deve_fallire($$select public.reso_al_mittente('70000000-0000-0000-0000-000000000801')$$, 'reso di una giacenza già chiusa');
reset role;
select pg_temp.verifica((select riconsegna_ora = '10:00' from public.giacenze where id = '70000000-0000-0000-0000-000000000801'), 'ora della riconsegna');
select pg_temp.verifica((select fascia = 'Alle 10:00' and data_consegna = current_date + 3 from public.bolle where id = '40000000-0000-0000-0000-000000000802'), 'bolla con giorno e ora');
-- reso al mittente su una giacenza nuova
update public.giacenze set chiusa_il = now() where bolla_id = '40000000-0000-0000-0000-000000000802' and chiusa_il is null;
insert into public.giacenze (id, bolla_id, motivo) values ('70000000-0000-0000-0000-000000000802', '40000000-0000-0000-0000-000000000802', 'Merce rifiutata');
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select public.reso_al_mittente('70000000-0000-0000-0000-000000000802');
reset role;
select pg_temp.verifica((select reso_il is not null and chiusa_il is not null from public.giacenze where id = '70000000-0000-0000-0000-000000000802'), 'reso al mittente chiude');

-- Magazzino: il collo va sul bancale dello stesso cliente e segue il bancale
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.deve_fallire($$select public.collo_su_bancale('C-801-1', 'B-0105')$$, 'bancale di un altro cliente');
select pg_temp.deve_fallire($$select public.collo_su_bancale('C-801-1', 'B-9999')$$, 'bancale inesistente');
select pg_temp.verifica((public.collo_su_bancale('C-801-1', 'B-0801') ->> 'messi')::int = 1, 'un collo su due messo');
reset role;
select pg_temp.verifica((select k.bancale_id = b.id and k.posto_id is not distinct from b.posto_id from public.colli k, public.bancali b where k.codice = 'C-801-1' and b.codice = 'B-0801'), 'collo sul bancale, nel suo posto');
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select public.metti_a_posto('B-0801', 'S11-6-3');
reset role;
select pg_temp.verifica((select p.codice = 'S11-6-3' from public.colli k join public.posti p on p.id = k.posto_id where k.codice = 'C-801-1'), 'il collo segue il bancale');
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select public.metti_a_posto('C-801-1', 'S11-6-2');
reset role;
select pg_temp.verifica((select bancale_id is null from public.colli where codice = 'C-801-1'), 'messo in un posto, non sta più sul bancale');
select pg_temp.verifica((select count(*) from public.cam_richieste) >= 2, 'ogni scansione chiede una foto alle telecamere');

-- Satellitare e telecamere: solo la direzione, con il codice
insert into public.sat_anomalie (chiave, data, mezzo_id, autista_id, tipo, dalle, dettaglio)
values ('t80', current_date, '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Sosta', now(), '38 minuti fuori dalle fermate');
insert into public.telecamere (nome, zona) values ('Piazzale', 'Esterno');
insert into public.cam_avvisi (telecamera_id, tipo, descrizione) select id, 'Persona', 'Vicino al cancello' from public.telecamere where nome = 'Piazzale';
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select pg_temp.verifica((select count(*) from public.sat_anomalie) = 0, 'il traffico vede il satellitare');
select pg_temp.verifica((select count(*) from public.telecamere) = 0, 'il traffico vede le telecamere');
select pg_temp.verifica((select count(*) from public.anomalie where sezione = 'Satellitare') = 0, 'anomalie del satellitare al traffico');
select pg_temp.deve_fallire($$select public.anomalia_vista((select id from public.sat_anomalie limit 1))$$, 'il traffico segna viste');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000002', 'aal2');
select pg_temp.verifica((select count(*) from public.cam_avvisi) = 0, 'l''amministrazione vede le telecamere');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.verifica((select count(*) from public.telecamere) = 0, 'direzione senza codice vede le telecamere');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000001', 'aal2');
select pg_temp.verifica((select count(*) from public.sat_anomalie) = 1, 'la direzione vede il satellitare');
select pg_temp.verifica((select count(*) from public.cam_avvisi) = 1, 'la direzione vede gli avvisi');
select pg_temp.verifica((select count(*) from public.anomalie where sezione = 'Satellitare') = 1, 'anomalia del satellitare in Anomalie');
select public.anomalia_vista((select id from public.sat_anomalie where chiave = 't80'));
select pg_temp.verifica((select count(*) from public.anomalie where sezione = 'Satellitare') = 0, 'vista: esce dalle Anomalie');
select public.avviso_visto((select id from public.cam_avvisi limit 1));
select pg_temp.deve_fallire($$insert into public.telecamere (nome) values ('Finta')$$, 'la direzione scrive le telecamere a mano');
reset role;
