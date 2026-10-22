-- Tariffe a regole, chiusura del mese, totali e IVA, invio, nota di credito
create or replace function pg_temp.come(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.sistema() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
create or replace function pg_temp.verifica(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'TEST FALLITO: %', msg; end if; end $$;
create or replace function pg_temp.deve_fallire(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'TEST FALLITO (doveva essere bloccato): %', msg;
end $$;
grant execute on function pg_temp.come(uuid), pg_temp.sistema(), pg_temp.verifica(boolean, text), pg_temp.deve_fallire(text, text) to public;

-- un cliente nuovo con l'anagrafica completa, e uno in split payment
insert into public.clienti (id, azienda, nome, piva, indirizzo, cap, citta, provincia, codice_destinatario) values
  ('10000000-0000-0000-0000-0000000000a1', 'trasporti', 'Prova Tariffe', '01234567890', 'Via Roma 1', '20141', 'Milano', 'MI', 'ABC1234'),
  ('10000000-0000-0000-0000-0000000000a2', 'trasporti', 'Comune di Prova', '80012345678', 'Piazza Grande 1', '20090', 'Opera', 'MI', 'UFXXXX');
update public.clienti set split_payment = true where id = '10000000-0000-0000-0000-0000000000a2';

-- le tariffe di prova valgono da un mese
update public.tariffe set valida_dal = public.oggi() - 30;

-- 1 · Tariffe: solo il commerciale, ogni cambio è una versione nuova
select pg_temp.come('00000000-0000-0000-0000-000000000003');   -- Gabriele, ufficio bolle
select pg_temp.deve_fallire($$select public.salva_tariffe('10000000-0000-0000-0000-000000000001', '[{"voce":"Base","unita":"spedizione","prezzo":1}]')$$, 'l''ufficio bolle cambia le tariffe');
select pg_temp.deve_fallire($$insert into public.tariffe (cliente_id, voce, unita, prezzo) values ('10000000-0000-0000-0000-000000000001', 'X', 'spedizione', 1)$$, 'tariffa scritta a mano');
reset role;

select pg_temp.come('00000000-0000-0000-0000-000000000007');   -- Gianluca, commerciale
select public.salva_tariffe('10000000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('id', (select id from public.tariffe where cliente_id = '10000000-0000-0000-0000-000000000001' and voce = 'Base'), 'prezzo', 90)));
reset role;
select pg_temp.verifica((select count(*) from public.tariffe where cliente_id = '10000000-0000-0000-0000-000000000001' and voce = 'Base') = 2, 'il prezzo nuovo è una versione nuova');
select pg_temp.verifica((select prezzo from public.tariffe where cliente_id = '10000000-0000-0000-0000-000000000001' and voce = 'Base' and valida_al is null and stato = 'Attiva') = 90, 'Snam: base 90 da oggi');
select pg_temp.verifica((select valida_al from public.tariffe where cliente_id = '10000000-0000-0000-0000-000000000001' and voce = 'Base' and prezzo = 85) = public.oggi() - 1, 'la vecchia vale fino a ieri');

-- 2 · Sotto il listino aspetta la Direzione
select pg_temp.come('00000000-0000-0000-0000-000000000001');   -- direzione
insert into public.listino (voce, unita, prezzo) values ('Base', 'spedizione', 80), ('Sponda', 'spedizione', 15);
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000007');
select pg_temp.deve_fallire($$insert into public.listino (voce, unita, prezzo) values ('X', 'spedizione', 1)$$, 'il commerciale cambia il listino');
select public.salva_tariffe('10000000-0000-0000-0000-000000000001', '[{"voce":"Base","unita":"spedizione","prezzo":70}]', public.oggi() + 1);
select pg_temp.deve_fallire($$select public.approva_tariffa((select id from public.tariffe where prezzo = 70), true)$$, 'il commerciale si approva da solo');
reset role;
select pg_temp.verifica((select stato from public.tariffe where cliente_id = '10000000-0000-0000-0000-000000000001' and prezzo = 70) = 'Da approvare', 'sotto il listino: da approvare');
select pg_temp.verifica((select motivo from public.tariffe where cliente_id = '10000000-0000-0000-0000-000000000001' and prezzo = 70) like 'Sotto il listino%', 'con il motivo');
select pg_temp.come('00000000-0000-0000-0000-000000000001');
select public.approva_tariffa((select id from public.tariffe where cliente_id = '10000000-0000-0000-0000-000000000001' and prezzo = 70), false);
reset role;
select pg_temp.verifica((select stato from public.tariffe where cliente_id = '10000000-0000-0000-0000-000000000001' and prezzo = 70) = 'Rifiutata', 'rifiutata dalla Direzione');

-- 3 · Cliente nuovo: tutte le tariffe aspettano la Direzione; scaglioni di peso, contrassegno, riconsegna
select pg_temp.come('00000000-0000-0000-0000-000000000007');
select public.salva_tariffe('10000000-0000-0000-0000-0000000000a1', '[
  {"voce":"Base","unita":"spedizione","prezzo":50,"scaglione_su":"peso","scaglione_da":0,"scaglione_a":100},
  {"voce":"Base","unita":"spedizione","prezzo":80,"scaglione_su":"peso","scaglione_da":100},
  {"voce":"Sponda","unita":"spedizione","prezzo":18},
  {"voce":"Riconsegna","unita":"spedizione","prezzo":40},
  {"voce":"Contrassegno","unita":"percentuale","prezzo":2,"minimo":5}]');
reset role;
select pg_temp.verifica((select count(*) from public.tariffe where cliente_id = '10000000-0000-0000-0000-0000000000a1' and stato = 'Da approvare' and motivo = 'Cliente nuovo') = 5, 'cliente nuovo: tutto alla Direzione');
select pg_temp.come('00000000-0000-0000-0000-000000000001');
select public.approva_tariffa(id, true) from public.tariffe where cliente_id = '10000000-0000-0000-0000-0000000000a1';
select public.salva_tariffe('10000000-0000-0000-0000-0000000000a2', '[{"voce":"Base","unita":"collo","prezzo":10,"minimo":30}]');
reset role;
select pg_temp.verifica((select count(*) from public.tariffe where cliente_id = '10000000-0000-0000-0000-0000000000a2' and stato = 'Attiva') = 1, 'la Direzione non aspetta se stessa');

-- bolle consegnate questo mese (dati di prova scritti direttamente)
alter table public.bolle disable trigger user;
insert into public.bolle (id, numero, cliente_id, data_consegna, colli_previsti, peso_kg, accessori, contrassegno, stato) values
  ('4a000000-0000-0000-0000-000000000001', '26-900001', '10000000-0000-0000-0000-0000000000a1', public.oggi(), 3, 150, '{Sponda}', 1000, 'Consegnata'),
  ('4a000000-0000-0000-0000-000000000002', '26-900002', '10000000-0000-0000-0000-0000000000a1', public.oggi(), 1, 50, '{Piano terra}', null, 'Consegnata'),
  ('4a000000-0000-0000-0000-000000000003', '26-900003', '10000000-0000-0000-0000-0000000000a2', public.oggi(), 2, null, '{}', null, 'Consegnata');
alter table public.bolle enable trigger user;
alter table public.fermate disable trigger user;
insert into public.giri (id, data, mezzo_id, autista_id, stato) values
  ('5a000000-0000-0000-0000-000000000001', public.oggi(), '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Rientrato');
insert into public.fermate (giro_id, bolla_id, ordine, esito, motivo, dopo, nuova_data, colli_consegnati) values
  ('5a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', 1, 'Non consegnata', 'Assente', 'Nuova data', public.oggi(), null),
  ('5a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', 2, 'Consegnata', null, null, null, 3);
alter table public.fermate enable trigger user;

select pg_temp.come('00000000-0000-0000-0000-000000000002');   -- Angela, amministrazione
select pg_temp.verifica(public.valore_bolla('4a000000-0000-0000-0000-000000000001') = 80 + 18 + 40 + 20, 'base a scaglione 100+ kg, sponda, una riconsegna, contrassegno 2%');
select pg_temp.verifica(public.valore_bolla('4a000000-0000-0000-0000-000000000002') = 50, 'base fino a 100 kg; il piano senza tariffa non vale zero in silenzio...');
select pg_temp.verifica((select problema from public.righe_bolla('4a000000-0000-0000-0000-000000000002') where voce = 'Piano terra') = 'manca la tariffa Piano terra', '...è un problema scritto');
select pg_temp.verifica(public.valore_bolla('4a000000-0000-0000-0000-000000000003') = 30, 'minimo: 2 colli × 10 € diventano 30 €');

-- 4 · Chiusura del mese
select public.chiudi_mese(to_char(public.oggi(), 'YYYY-MM')) > 0;
select pg_temp.verifica((select stato from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1') = 'Da controllare', 'manca una tariffa: da controllare');
select pg_temp.verifica((select problema from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1') like '%26-900002: manca la tariffa Piano terra%', 'il problema dice quale bolla');
select pg_temp.verifica((select imponibile from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1') = 208, 'imponibile = somma delle righe');
select pg_temp.verifica((select count(*) from public.fatture_bolle fb join public.fatture f on f.id = fb.fattura_id where f.cliente_id = '10000000-0000-0000-0000-0000000000a1') = 2, 'le due bolle legate alla fattura');
select pg_temp.verifica((select stato from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a2') = 'Pronta', 'tutto in regola: pronta');
select pg_temp.verifica((select (imponibile, iva, totale) = (30.00, 6.60, 30.00) from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a2'), 'split payment: IVA calcolata, non incassata');
select pg_temp.deve_fallire($$update public.fatture set imponibile = 1 where cliente_id = '10000000-0000-0000-0000-0000000000a1'$$, 'importo scritto a mano');
select pg_temp.deve_fallire($$update public.fatture set stato = 'Pronta' where cliente_id = '10000000-0000-0000-0000-0000000000a1'$$, 'pronta con un problema');
select pg_temp.deve_fallire($$delete from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1'$$, 'fattura cancellata');
select pg_temp.deve_fallire($$insert into public.fatture_bolle (fattura_id, bolla_id) select id, '4a000000-0000-0000-0000-000000000003' from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1'$$, 'bolla in due fatture');
-- di nuovo: niente doppioni
select public.chiudi_mese(to_char(public.oggi(), 'YYYY-MM'));
select pg_temp.verifica((select count(*) from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1') = 1, 'una fattura per cliente e mese');
select pg_temp.verifica((select imponibile from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1') = 208, 'stesso importo alla seconda chiusura');
reset role;

-- il commerciale aggiunge la tariffa mancante, l'amministrazione ricontrolla
select pg_temp.come('00000000-0000-0000-0000-000000000007');
select public.salva_tariffe('10000000-0000-0000-0000-0000000000a1', '[{"voce":"Piano terra","unita":"spedizione","prezzo":10}]');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select public.ricontrolla_fattura((select id from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1')) is null;
select pg_temp.verifica((select (stato, imponibile, iva, totale) = ('Pronta', 218.00, 47.96, 265.96) from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1'), 'pronta: 218 + IVA 47,96');
-- 5 · Inviata solo dal sistema
select pg_temp.deve_fallire($$update public.fatture set stato = 'Inviata' where cliente_id = '10000000-0000-0000-0000-0000000000a1'$$, 'inviata a mano');
select pg_temp.sistema();
update public.fatture set stato = 'Inviata', numero = '101' where cliente_id = '10000000-0000-0000-0000-0000000000a1';
select pg_temp.verifica((select count(*) from public.bolle where id in ('4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000002') and stato = 'Fatturata') = 2, 'bolle fatturate');
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select pg_temp.deve_fallire($$insert into public.righe_fattura (fattura_id, voce, prezzo) select id, 'x', 1 from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1'$$, 'riga su fattura inviata');
-- 6 · Nota di credito: la fattura risulta stornata e le bolle tornano da fatturare
select pg_temp.deve_fallire($$select public.nota_di_credito((select id from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1'), ' ')$$, 'nota di credito senza motivo');
select public.nota_di_credito((select id from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1' and tipo = 'Fattura'), 'Prezzo della sponda sbagliato') is not null;
select pg_temp.verifica((select imponibile from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1' and tipo = 'Nota di credito') = 218, 'stesse righe della fattura');
update public.fatture set stato = 'Pronta' where cliente_id = '10000000-0000-0000-0000-0000000000a1' and tipo = 'Nota di credito';
select pg_temp.sistema();
update public.fatture set stato = 'Inviata' where cliente_id = '10000000-0000-0000-0000-0000000000a1' and tipo = 'Nota di credito';
select pg_temp.verifica((select stato from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1' and tipo = 'Fattura') = 'Stornata', 'fattura stornata');
select pg_temp.verifica((select count(*) from public.bolle where id in ('4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000002') and stato = 'Consegnata') = 2, 'bolle di nuovo da fatturare');
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select public.chiudi_mese(to_char(public.oggi(), 'YYYY-MM'));
select pg_temp.verifica((select count(*) from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a1' and tipo = 'Fattura' and stato = 'Pronta') = 1, 'rifatturate in una fattura nuova');
-- 7 · Annullare prima dell'invio libera le bolle
select pg_temp.deve_fallire($$select public.annulla_fattura((select id from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a2'), '')$$, 'annullata senza motivo');
select public.annulla_fattura((select id from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a2'), 'Prova');
select pg_temp.verifica(not exists (select 1 from public.fatture_bolle where bolla_id = '4a000000-0000-0000-0000-000000000003' and valida), 'bolla libera dopo l''annullo');
-- 8 · Anagrafica: senza CAP e provincia non si invia
select pg_temp.verifica(public.anagrafica_mancante('10000000-0000-0000-0000-000000000001') @> array['CAP', 'provincia'], 'Snam: mancano CAP e provincia');
select pg_temp.verifica(not exists (select 1 from public.fatture f where f.cliente_id = '10000000-0000-0000-0000-000000000001' and f.stato = 'Pronta' and exists (select 1 from public.fatture_bolle fb where fb.fattura_id = f.id)), 'Snam senza CAP non è pronta');
select pg_temp.deve_fallire($$insert into public.righe_fattura (fattura_id, voce, prezzo) select id, 'x', 1 from public.fatture where stato = 'Stornata' limit 1$$, 'riga su fattura stornata');
reset role;

-- 8b · Tariffa all'indietro: solo se le bolle di quei giorni non sono già in una fattura inviata, e passa dalla Direzione
select pg_temp.come('00000000-0000-0000-0000-000000000007');
select pg_temp.deve_fallire($$select public.salva_tariffe('10000000-0000-0000-0000-0000000000a2', '[{"voce":"Base","unita":"collo","prezzo":11}]', public.oggi() - 60)$$, 'tariffa all''indietro su bolle già fatturate')
  where exists (select 1 from public.fatture where cliente_id = '10000000-0000-0000-0000-0000000000a2' and stato in ('Inviata', 'Pagata'));
select public.salva_tariffe('10000000-0000-0000-0000-000000000003', '[{"voce":"Base","unita":"bancale","prezzo":36}]', public.oggi() - 5);
reset role;
select pg_temp.verifica((select motivo from public.tariffe where cliente_id = '10000000-0000-0000-0000-000000000003' and prezzo = 36) like 'Vale all''indietro%', 'all''indietro: alla Direzione');

-- 9 · Chi non è dell'amministrazione non chiude il mese e non vede le fatture
select pg_temp.come('00000000-0000-0000-0000-000000000007');
select pg_temp.deve_fallire($$select public.chiudi_mese(to_char(public.oggi(), 'YYYY-MM'))$$, 'il commerciale chiude il mese');
select pg_temp.verifica((select count(*) from public.fatture_bolle) = 0, 'il commerciale non vede i legami delle fatture');
reset role;
select set_config('request.jwt.claim.sub', '', false);
