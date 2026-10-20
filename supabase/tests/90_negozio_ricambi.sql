-- Modifiche del 20 ottobre notte: Non Consegnato senza scansioni, catalogo con grado D e scheda tecnica, ricambi
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

-- ------------------------------------------------------------ Non Consegnato senza scansionare niente
insert into public.bolle (id, cliente_id, tipo, data_consegna, destinatario, indirizzo, citta, colli_previsti, accessori, stato, operatore_id) values
  ('40000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000001', 'Consegna', current_date, 'Snam', 'Via [indirizzo]', 'Milano', 3, '{}', 'Nuova', '00000000-0000-0000-0000-000000000003');
update public.bolle set stato = 'Confermata' where id = '40000000-0000-0000-0000-000000000901';
insert into public.colli (bolla_id, codice) values ('40000000-0000-0000-0000-000000000901', 'C-901-1'), ('40000000-0000-0000-0000-000000000901', 'C-901-2'), ('40000000-0000-0000-0000-000000000901', 'C-901-3');
insert into public.fermate (id, giro_id, bolla_id, ordine) values
  ('51000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000901', 9);

select pg_temp.come('00000000-0000-0000-0000-000000000006');   -- Autista 1, il suo giro di oggi
select pg_temp.deve_fallire($$select public.chiudi_fermata('51000000-0000-0000-0000-000000000901', true)$$, 'consegnata senza colli, firma e foto');
select pg_temp.deve_fallire($$select public.chiudi_fermata('51000000-0000-0000-0000-000000000901', false)$$, 'non consegnata senza motivo');
select public.chiudi_fermata('51000000-0000-0000-0000-000000000901', false, 'Destinatario assente', 'Giacenza');
reset role;
select pg_temp.verifica((select esito = 'Non consegnata' from public.fermate where id = '51000000-0000-0000-0000-000000000901'), 'Non Consegnato senza scansioni');
select pg_temp.verifica((select count(letto_consegna) = 0 from public.colli where bolla_id = '40000000-0000-0000-0000-000000000901'), 'nessun collo letto');
select pg_temp.verifica(exists (select 1 from public.giacenze where bolla_id = '40000000-0000-0000-0000-000000000901' and chiusa_il is null), 'la merce va in giacenza');

-- ------------------------------------------------------------ catalogo: grado D e scheda tecnica
update public.device set generazione = 'Gen 2 (2021)', batteria_pct = 86, sistema_operativo = 'Windows 11 Pro', tastiera = 'Italiana, retroilluminata',
       porte = '2 USB-C Thunderbolt 4, 2 USB-A, HDMI', rete = 'Wi-Fi 6', webcam = '720p', peso = '1,47 kg'
 where id = '71000000-0000-0000-0000-000000000001';
alter table public.device disable trigger device_regole;
insert into public.device (id, seriale, marca, modello, cpu, gpu, ram, disco, schermo, grado, lotto_id, bancale_id, costo, prezzo, stato, siti, prezzo_confermato_da) values
  ('71000000-0000-0000-0000-000000000901', 'PF3XXXX9', 'Lenovo', 'ThinkPad T14 Gen 2', 'i5-1145G7', 'Intel Iris Xe', '16 GB', '256 GB SSD', '14"', 'D',
   '70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000005', 160, 159, 'Disponibile', '{Sito}', '00000000-0000-0000-0000-000000000008'),
  ('71000000-0000-0000-0000-000000000902', 'PF3XXXX0', 'Lenovo', 'ThinkPad T14 Gen 2', 'i5-1145G7', 'Intel Iris Xe', '8 GB', '256 GB SSD', '14"', 'C',
   '70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000005', 160, 179, 'Fermo', '{}', null);
alter table public.device enable trigger device_regole;
update public.device set siti = array['Sito'] where id = '71000000-0000-0000-0000-000000000001';
insert into public.stage_pc (seriale, esito, certificato, finito_il) values ('PF3XXXX1', 'Formattato', 'certificati/PF3XXXX1.pdf', now());

set role anon;
select pg_temp.verifica(exists (select 1 from public.catalogo() where grado = 'D' and prezzo = 159), 'il grado D è in vendita sul sito');
select pg_temp.verifica((select generazione = 'Gen 2 (2021)' and batteria_min = 86 and peso = '1,47 kg' and dati_cancellati
                           from public.catalogo() where grado = 'B' and modello = 'ThinkPad T14 Gen 2'), 'scheda tecnica e dati cancellati nel catalogo');
select pg_temp.deve_fallire($$select * from public.ricambi$$, 'chi non è entrato vede i ricambi');
reset role;

-- ------------------------------------------------------------ ricambi
select pg_temp.come('00000000-0000-0000-0000-000000000003');   -- ufficio bolle dei Trasporti
select pg_temp.deve_fallire($$insert into public.ricambi (device_id, tipo, descrizione) values ('71000000-0000-0000-0000-000000000902', 'Display', 'Display 14"')$$, 'i Trasporti smontano i computer della Corporation');
select pg_temp.verifica((select count(*) from public.ricambi) = 0, 'i Trasporti non vedono i ricambi');
reset role;

select pg_temp.come('00000000-0000-0000-0000-000000000008');   -- Vendite, Corporation
insert into public.ricambi (id, device_id, tipo, descrizione, prezzo) values
  ('72000000-0000-0000-0000-000000000901', '71000000-0000-0000-0000-000000000902', 'Display', 'Display 14" Full HD', 39),
  ('72000000-0000-0000-0000-000000000902', '71000000-0000-0000-0000-000000000902', 'Disco', 'SSD 256 GB', 19);
reset role;
select pg_temp.verifica((select stato = 'Smontato' and siti = '{}' from public.device where id = '71000000-0000-0000-0000-000000000902'), 'il computer smontato non si vende intero');
select pg_temp.verifica((select lotto_id = '70000000-0000-0000-0000-000000000002' from public.ricambi where id = '72000000-0000-0000-0000-000000000901'), 'il ricambio è legato al lotto del computer');

select pg_temp.come('00000000-0000-0000-0000-000000000008');
select pg_temp.deve_fallire($$update public.ricambi set stato = 'Disponibile' where id = '72000000-0000-0000-0000-000000000902'$$, 'disco in vendita senza rapporto di cancellazione');
select pg_temp.deve_fallire($$update public.ricambi set stato = 'Venduto', venduto_prezzo = 19 where id = '72000000-0000-0000-0000-000000000901'$$, 'venduto senza canale');
update public.ricambi set stato = 'Disponibile', siti = '{Sito}' where id = '72000000-0000-0000-0000-000000000901';
select pg_temp.deve_fallire($$insert into public.ricambi (device_id, tipo, descrizione) values ('71000000-0000-0000-0000-000000000004', 'Display', 'x')$$, 'smontare un computer già venduto');
reset role;

-- con il rapporto di cancellazione il disco si può vendere
insert into public.stage_pc (seriale, esito, certificato, finito_il) values ('PF3XXXX0', 'Formattato', 'certificati/PF3XXXX0.pdf', now());
select pg_temp.come('00000000-0000-0000-0000-000000000008');
update public.ricambi set stato = 'Disponibile' where id = '72000000-0000-0000-0000-000000000902';
reset role;

set role anon;
select pg_temp.verifica((select count(*) from public.catalogo_ricambi()) = 1, 'sul sito solo i ricambi messi sul sito');
reset role;

-- l'incasso dei ricambi conta nel recupero del lotto
create temp table prima as select incassato, recuperato_pct from public.lotti_conti where id = '70000000-0000-0000-0000-000000000002';
grant select on prima to public;
select pg_temp.come('00000000-0000-0000-0000-000000000008');
update public.ricambi set stato = 'Venduto', canale = 'eBay', venduto_prezzo = 39, commissione = 4 where id = '72000000-0000-0000-0000-000000000901';
select pg_temp.verifica((select l.incassato = p.incassato + 35 and l.incassato_ricambi = 35 and l.ricambi_venduti = 1 and l.recuperato_pct > p.recuperato_pct
                           from public.lotti_conti l, prima p where l.id = '70000000-0000-0000-0000-000000000002'), 'i ricambi venduti entrano nel recupero del lotto');
select pg_temp.deve_fallire($$update public.ricambi set prezzo = 1 where id = '72000000-0000-0000-0000-000000000901'$$, 'ricambio venduto modificato');
reset role;
