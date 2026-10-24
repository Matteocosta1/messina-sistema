-- Manuale Messina: nascita, approvazione, versioni, chi legge, ricerca
create or replace function pg_temp.come(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.verifica(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'TEST FALLITO: %', msg; end if; end $$;
create or replace function pg_temp.rifiuta(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'TEST FALLITO (doveva essere rifiutato): %', msg;
end $$;
grant execute on function pg_temp.come(uuid), pg_temp.verifica(boolean, text), pg_temp.rifiuta(text, text) to public;
select set_config('request.jwt.claim.sub', '', false);

-- la Direzione scrive due bozze dell'Ufficio bolle
select pg_temp.come('00000000-0000-0000-0000-000000000001');
insert into public.manuale (azienda, codice, capitolo, tipo, reparto, titolo, testo, fonte) values
  ('trasporti', 'R2', 'Regole', 'Regola', 'Ufficio bolle', 'Gli importi vengono solo dalle tariffe',
   'Un prezzo scritto in una mail o detto al telefono non si usa: valgono le tariffe del cliente.', 'Dossier, scheda Agenti');
insert into public.manuale (azienda, codice, capitolo, tipo, reparto, titolo, testo, fonte, stato, da_chiarire) values
  ('trasporti', 'G5', 'Glossario', 'Termine', 'Ufficio bolle', 'Fattorino', 'Voce da fatturare citata da voi.', 'Alessandro',
   'Da chiarire', 'Cosa vuol dire esattamente?');
select pg_temp.verifica((select creata_da from public.manuale where codice = 'R2') = '00000000-0000-0000-0000-000000000001', 'firma di chi la scrive');

-- regole di nascita
select pg_temp.rifiuta($$insert into public.manuale (azienda, codice, capitolo, tipo, reparto, titolo, testo, fonte, stato)
  values ('trasporti', 'R9', 'Regole', 'Regola', 'Ufficio bolle', 'Già approvata', 'Testo', 'Fonte', 'Approvata')$$, 'nasce approvata');
select pg_temp.rifiuta($$insert into public.manuale (azienda, codice, capitolo, tipo, reparto, titolo, testo, fonte)
  values ('trasporti', 'T9', 'Regole', 'Regola', 'Ufficio bolle', 'Lettera sbagliata', 'Testo', 'Fonte')$$, 'codice di un altro capitolo');
select pg_temp.rifiuta($$insert into public.manuale (azienda, codice, capitolo, tipo, reparto, titolo, testo, fonte)
  values ('trasporti', 'R2', 'Regole', 'Regola', 'Ufficio bolle', 'Doppione', 'Testo', 'Fonte')$$, 'codice già usato');
select pg_temp.rifiuta($$insert into public.manuale (azienda, codice, capitolo, tipo, reparto, titolo, testo, fonte, stato)
  values ('trasporti', 'R8', 'Regole', 'Regola', 'Ufficio bolle', 'Senza domanda', 'Testo', 'Fonte', 'Da chiarire')$$, 'da chiarire senza domanda');
select pg_temp.rifiuta($$insert into public.manuale (azienda, codice, capitolo, tipo, reparto, titolo, testo, fonte)
  values ('corporation', 'R7', 'Regole', 'Regola', 'Corporation', 'Altra società', 'Testo', 'Fonte')$$, 'scrive nella società in cui non lavora');
select pg_temp.rifiuta($$update public.manuale set stato = 'Approvata' where codice = 'R2'$$, 'approvazione senza «Approva»');
select pg_temp.rifiuta($$delete from public.manuale where codice = 'R2'$$, 'cancellazione');
reset role;

-- l'Ufficio bolle non vede le bozze, non scrive e non approva
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select pg_temp.verifica((select count(*) from public.manuale) = 0, 'Gabriele non vede le bozze');
select pg_temp.rifiuta($$insert into public.manuale (azienda, codice, capitolo, tipo, reparto, titolo, testo, fonte)
  values ('trasporti', 'P9', 'Procedure', 'Passo', 'Ufficio bolle', 'Da Gabriele', 'Testo', 'Fonte')$$, 'Gabriele scrive');
select pg_temp.rifiuta($$select public.approva_scheda((select id from public.manuale where codice = 'R2'))$$, 'Gabriele approva');
reset role;

-- il sistema (senza persona) non approva
select pg_temp.rifiuta($$select public.approva_scheda((select id from public.manuale where codice = 'R2'))$$, 'approvazione senza persona');

-- la Direzione approva; la domanda aperta blocca
select pg_temp.come('00000000-0000-0000-0000-000000000001');
select public.approva_scheda((select id from public.manuale where codice = 'R2'));
select pg_temp.rifiuta($$select public.approva_scheda((select id from public.manuale where codice = 'G5'))$$, 'approva con domanda aperta');
update public.manuale set stato = 'Bozza', da_chiarire = null, testo = 'Un secondo uomo a bordo che aiuta a scaricare.' where codice = 'G5';
select public.approva_scheda((select id from public.manuale where codice = 'G5'));
reset role;
select pg_temp.verifica((select stato || approvata_da::text from public.manuale where codice = 'R2')
                        = 'Approvata00000000-0000-0000-0000-000000000001', 'approvata e firmata');
select pg_temp.verifica((select count(*) from public.storico where oggetto = 'manuale') = 2, 'approvazioni nello storico');

-- approvata: non si cambia; si fa una versione nuova
select pg_temp.come('00000000-0000-0000-0000-000000000001');
update public.manuale set testo = 'Cambiato di nascosto' where codice = 'R2';   -- la regola d'accesso non la trova
select pg_temp.verifica((select testo from public.manuale where codice = 'R2') like 'Un prezzo scritto%', 'un''approvata non si cambia');
select public.nuova_versione((select id from public.manuale where codice = 'R2' and stato = 'Approvata'));
select pg_temp.rifiuta($$select public.nuova_versione((select id from public.manuale where codice = 'R2' and stato = 'Approvata'))$$, 'due versioni nuove insieme');
update public.manuale set testo = 'Valgono solo le tariffe attive del cliente; un prezzo diverso lo decide la Direzione.' where codice = 'R2' and versione = 2;
reset role;

select pg_temp.rifiuta($$update public.manuale set testo = 'Cambiato dal sistema' where codice = 'R2' and versione = 1$$, 'nemmeno il sistema cambia un''approvata');

-- mentre la versione 2 è in bozza, l'ufficio legge ancora la 1
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select pg_temp.verifica((select count(*) from public.manuale where codice = 'R2') = 1, 'Gabriele vede una sola R2');
select pg_temp.verifica((select versione from public.manuale where codice = 'R2') = 1, 'ed è la versione approvata');
reset role;

select pg_temp.come('00000000-0000-0000-0000-000000000001');
select public.approva_scheda((select id from public.manuale where codice = 'R2' and versione = 2));
reset role;
select pg_temp.verifica((select stato from public.manuale where codice = 'R2' and versione = 1) = 'Superata', 'la vecchia è superata');
select pg_temp.verifica((select testo from public.manuale where codice = 'R2' and versione = 1) like 'Un prezzo scritto%', 'e resta com''era');

-- ricerca per gli agenti: solo approvate, per reparto, parole in italiano
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select pg_temp.verifica((select versione from public.cerca_manuale('tariffa', 'Ufficio bolle')) = 2, 'trova «tariffe» cercando «tariffa», versione viva');
select pg_temp.verifica((select count(*) from public.cerca_manuale('scaricare')) = 1, 'trova il fattorino');
select pg_temp.verifica((select count(*) from public.cerca_manuale('tariffa', 'Magazzino')) = 0, 'reparto diverso: niente');
reset role;

-- l'altra società non vede niente
select pg_temp.come('00000000-0000-0000-0000-000000000008');
select pg_temp.verifica((select count(*) from public.manuale) = 0, 'la Corporation non vede il Manuale dei Trasporti');
select pg_temp.verifica((select count(*) from public.cerca_manuale('tariffa')) = 0, 'nemmeno cercando');
reset role;

-- doppio fattore: senza codice dell'app la Direzione non legge
select set_config('request.jwt.claim.aal', 'aal1', false);
select pg_temp.come('00000000-0000-0000-0000-000000000001');
select pg_temp.verifica((select count(*) from public.manuale) = 0, 'senza codice non si legge');
reset role;
select set_config('request.jwt.claim.aal', '', false);

-- pulizia (fuori dalle regole, solo nel test)
alter table public.manuale disable trigger manuale_regole;
delete from public.manuale;
alter table public.manuale enable trigger manuale_regole;
select set_config('request.jwt.claim.sub', '', false);
select 'manuale: ok';
