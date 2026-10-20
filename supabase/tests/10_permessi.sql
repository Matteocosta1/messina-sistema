-- Test dei permessi e delle regole: ogni blocco deve passare.
-- come(utente): entra come quell'utente di prova
create or replace function pg_temp.come(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.verifica(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'TEST FALLITO: %', msg; end if; end $$;
create or replace function pg_temp.deve_fallire(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'TEST FALLITO (doveva essere bloccato): %', msg;
end $$;

grant execute on function pg_temp.come(uuid), pg_temp.verifica(boolean, text), pg_temp.deve_fallire(text, text) to public;

-- Nessun login: non si vede niente ------------------------------------------
set role anon;
select pg_temp.deve_fallire('select count(*) from public.bolle', 'anon legge le bolle');
reset role;

-- Cliente Snam: vede solo le sue bolle e i suoi bancali ----------------------
select pg_temp.come('00000000-0000-0000-0000-000000000010');
select pg_temp.verifica((select count(*) from public.bolle) = 2, 'Snam vede solo le sue 2 bolle');
select pg_temp.verifica((select bool_and(cliente_id = '10000000-0000-0000-0000-000000000001') from public.bolle), 'solo bolle Snam');
select pg_temp.verifica((select count(*) from public.bancali) = 0, 'Snam non vede bancali di altri');
select pg_temp.verifica((select count(*) from public.tariffe) = 0, 'il cliente non vede le tariffe');
select pg_temp.verifica((select count(*) from public.storico) = 0, 'il cliente non vede lo storico');
select pg_temp.verifica((select count(*) from public.device) = 0, 'il cliente non vede la Corporation');
reset role;

-- Econocom vede anche UniCredit (arriva tramite Econocom) e i suoi bancali ------
select pg_temp.come('00000000-0000-0000-0000-000000000011');
select pg_temp.verifica((select count(*) from public.bancali) = 4, 'Econocom vede i suoi 4 bancali');
reset role;

-- Corporation: vede solo i suoi bancali, non le bolle dei Trasporti ------------
select pg_temp.come('00000000-0000-0000-0000-000000000008');
select pg_temp.verifica((select count(*) from public.bancali) = 2, 'Corporation vede solo i suoi 2 bancali');
select pg_temp.verifica((select count(*) from public.bolle) = 0, 'Corporation non vede le bolle');
select pg_temp.verifica((select count(*) from public.device) = 4, 'Corporation vede i suoi device');
select pg_temp.verifica((select incassato_oggi from public.incassi_corporation) = 206, 'incassato oggi = 229 - 23');
select pg_temp.verifica((select recuperato_pct from public.lotti_conti where codice = 'L-014') > 0, 'il lotto recupera');
reset role;

-- Trasporti: la Corporation è un cliente qualsiasi ------------------------------
select pg_temp.come('00000000-0000-0000-0000-000000000003');
select pg_temp.verifica((select count(*) from public.bancali) = 6, 'i Trasporti vedono tutti i bancali');
select pg_temp.verifica((select count(*) from public.device) = 0, 'i Trasporti non vedono l''inventario Corporation');
-- bolla con dato mancante: non si conferma
select pg_temp.deve_fallire($$update public.bolle set stato = 'Confermata' where id = '40000000-0000-0000-0000-000000000001'$$, 'bolla con dati mancanti confermata');
-- bolla completa: si conferma e prende il numero
update public.bolle set stato = 'Confermata' where id = '40000000-0000-0000-0000-000000000002';
select pg_temp.verifica((select numero is not null from public.bolle where id = '40000000-0000-0000-0000-000000000002'), 'numero assegnato');
-- l'ufficio bolle non legge le presenze
select pg_temp.verifica((select count(*) from public.timbrature) = 3 and (select bool_and(dipendente_id = '20000000-0000-0000-0000-000000000004') from public.timbrature), 'Gabriele vede solo le sue timbrature');
select pg_temp.deve_fallire($$insert into public.storico (azienda, operazione, cosa) values ('trasporti', 'x', 'falso')$$, 'scrittura diretta nello storico');
reset role;

-- Autista: vede solo il suo giro, chiude solo con colli, firma e foto ---------------
select pg_temp.come('00000000-0000-0000-0000-000000000012');
select pg_temp.verifica((select count(*) from public.fermate) = 0, 'l''autista 2 non vede il giro dell''autista 1');
select pg_temp.deve_fallire($$select public.firma_fermata('51000000-0000-0000-0000-000000000001')$$, 'autista firma una fermata non sua');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000006');
select pg_temp.verifica((select count(*) from public.fermate) = 2, 'l''autista 1 vede le sue 2 fermate');
select pg_temp.verifica((select count(*) from public.bolle) = 2, 'l''autista vede solo le bolle del suo giro');
select pg_temp.verifica((select count(*) from public.tariffe) = 0, 'l''autista non vede le tariffe');
select public.firma_fermata('51000000-0000-0000-0000-000000000001');
select pg_temp.deve_fallire($$select public.chiudi_fermata('51000000-0000-0000-0000-000000000001', true)$$, 'consegna senza colli e foto');
select public.scansiona_consegna('51000000-0000-0000-0000-000000000001', 'C-4-' || lpad(g::text, 3, '0')) from generate_series(1, 4) g;
select pg_temp.verifica((public.foto_bolla('51000000-0000-0000-0000-000000000001', 'bolle/51000000-0000-0000-0000-000000000001/x.jpg', 12) ->> 'ok')::boolean = false, 'foto sfocata rifiutata');
select pg_temp.deve_fallire($$select public.chiudi_fermata('51000000-0000-0000-0000-000000000001', true)$$, 'consegna con foto rifiutata');
select pg_temp.verifica((public.foto_bolla('51000000-0000-0000-0000-000000000001', 'bolle/51000000-0000-0000-0000-000000000001/x.jpg', 80) ->> 'ok')::boolean, 'foto buona accettata');
select public.aggiungi_accessorio('51000000-0000-0000-0000-000000000001', 'Sponda');
select public.chiudi_fermata('51000000-0000-0000-0000-000000000001', true);
select pg_temp.deve_fallire($$select public.chiudi_fermata('51000000-0000-0000-0000-000000000002', false)$$, 'mancata senza motivo');
select public.chiudi_fermata('51000000-0000-0000-0000-000000000002', false, 'Destinatario assente', 'Giacenza');
reset role;
select pg_temp.verifica((select stato from public.bolle where id = '40000000-0000-0000-0000-000000000004') = 'Consegnata', 'bolla consegnata');
select pg_temp.verifica((select count(*) from public.giacenze where chiusa_il is null) = 1, 'giacenza aperta');
select pg_temp.verifica(public.valore_bolla('40000000-0000-0000-0000-000000000004') = 85 + 18 + 18, 'valore = base + sponda in bolla + sponda aggiunta');

-- Missioni: il posto si chiude solo se torna, altrimenti resta bloccato --------------
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select public.lancia_missione('Scaffale', 'S07') is not null;
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000005');
do $$
declare r jsonb; v_ok uuid; v_ko uuid;
begin
  select id into v_ok from public.missioni_posti_app where posto = 'S07-1-2';
  select id into v_ko from public.missioni_posti_app where posto = 'S07-2-2';
  perform public.scansiona_missione(v_ok, 'MN2B001'); perform public.scansiona_missione(v_ok, 'MN2B003');
  r := public.scansiona_missione(v_ok, 'MN2B002');
  if not (r ->> 'chiuso')::boolean then raise exception 'TEST FALLITO: il posto completo doveva chiudersi da solo'; end if;
  perform public.scansiona_missione(v_ko, 'DL4D001'); perform public.scansiona_missione(v_ko, 'HPXXX99');
  perform public.segnala_posto(v_ko);
  if (select stato from public.missioni_posti_app where id = v_ko) <> 'Bloccato' then raise exception 'TEST FALLITO: doveva restare bloccato'; end if;
  begin perform public.sblocca_posto(v_ko, 'boh'); raise exception 'X'; exception when others then
    if sqlerrm = 'X' then raise exception 'TEST FALLITO: il magazziniere non può sbloccare'; end if; end;
end $$;
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select pg_temp.verifica((select count(*) from public.anomalie where sezione = 'Missioni') = 1, 'il posto bloccato è nelle Anomalie');
select pg_temp.verifica((select count(*) from public.anomalie where sezione = 'Magazzino') = 1, 'entrata Apple 31 di 32 nelle Anomalie');
select pg_temp.verifica((select count(*) from public.anomalie where sezione = 'Bolle') = 1, 'bolla Snam con dato mancante');
select pg_temp.verifica((select count(*) from public.anomalie where sezione = 'Presenze') = 2, 'una uscita mancante e una timbratura rifiutata');
select pg_temp.deve_fallire($$select public.sblocca_posto((select id from public.missioni_posti where stato = 'Bloccato'), '  ')$$, 'sblocco senza motivo');
select public.sblocca_posto((select id from public.missioni_posti where stato = 'Bloccato'), 'Docking spostato in S07-2-1, HP messo qui per errore');
select pg_temp.verifica((select count(*) from public.anomalie where sezione = 'Missioni') = 0, 'sbloccato: sparisce dalle Anomalie');
select pg_temp.verifica((select count(*) from public.storico where operazione = 'Sblocco') = 1, 'lo sblocco è nello storico');
select pg_temp.deve_fallire($$update public.fatture set stato = 'Pagata' where stato = 'Pronta'$$, 'pagata prima di inviarla');
update public.fatture set stato = 'Inviata' where stato = 'Pronta';
update public.fatture set stato = 'Pagata' where stato = 'Inviata';
select pg_temp.verifica((select incassato_mese from public.incassi_trasporti) = 1720, 'incassato = fatture pagate');
select pg_temp.deve_fallire($$delete from public.storico$$, 'cancellare lo storico');
reset role;

-- Presenze: QR valido, scaduto, da badge disattivato ---------------------------------
do $$
declare c text; r jsonb;
begin
  c := public.codice_badge('80000000-0000-0000-0000-000000000001', floor(extract(epoch from now()) / 30)::bigint);
  r := public.timbra(c, 'Ingresso');
  if not (r ->> 'ok')::boolean then raise exception 'TEST FALLITO: QR valido rifiutato: %', r; end if;
  c := public.codice_badge('80000000-0000-0000-0000-000000000001', floor(extract(epoch from now()) / 30)::bigint - 10);
  r := public.timbra(c, 'Ingresso');
  if (r ->> 'ok')::boolean then raise exception 'TEST FALLITO: QR vecchio accettato'; end if;
  r := public.timbra('80000000-0000-0000-0000-000000000001.1.falso', 'Ingresso');
  if (r ->> 'ok')::boolean then raise exception 'TEST FALLITO: QR falso accettato'; end if;
end $$;
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.deve_fallire($$select public.timbra('x', 'y')$$, 'un utente chiama timbra');
select pg_temp.deve_fallire($$select segreto from public.badge$$, 'leggere il segreto del badge');
reset role;
