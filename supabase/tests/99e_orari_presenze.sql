-- Ora italiana, telefoni del badge approvati, ferie che maturano, permessi per satellitare e telecamere, conservazione
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

-- 1 · Ora italiana
select pg_temp.verifica(public.giorno_it('2026-10-22 23:30+00') = '2026-10-23', 'l''1:30 italiana è già il giorno dopo');
select pg_temp.verifica(public.ora_it('2026-10-22 04:30+00') = '06:30', 'ora legale: +2');
select pg_temp.verifica(public.ora_it('2026-12-22 04:30+00') = '05:30', 'ora solare: +1');
select pg_temp.verifica(public.mesi_maturati('2020-01-01', '2026-10-22') = 9, 'nove mesi interi da gennaio');
select pg_temp.verifica(public.mesi_maturati('2026-03-10', '2026-10-22') = 7, 'assunto entro il 15: conta marzo');
select pg_temp.verifica(public.mesi_maturati('2026-03-20', '2026-10-22') = 6, 'assunto dopo il 15: marzo non conta');

-- 2 · Telefono del badge: parte in attesa, lo approva l'amministrazione
select pg_temp.come('00000000-0000-0000-0000-000000000006');
select public.registra_telefono('iphone-autista-1');
select pg_temp.deve_fallire($$select public.mio_qr('iphone-autista-1')$$, 'telefono non ancora approvato');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.deve_fallire($$select public.approva_telefono((select id from public.badge where dispositivo = 'iphone-autista-1'), true)$$, 'il magazziniere non approva');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select pg_temp.verifica((select count(*) from public.telefoni_da_approvare where nome = 'Autista 1') = 1, 'l''amministrazione lo vede da approvare');
select public.approva_telefono((select id from public.badge where dispositivo = 'iphone-autista-1'), true);
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000006');
select pg_temp.verifica(public.mio_qr('iphone-autista-1') is not null, 'approvato: il QR c''è');
-- cambio telefono: il vecchio resta attivo finché il nuovo non è approvato
select public.registra_telefono('iphone-nuovo');
select pg_temp.verifica(public.mio_qr('iphone-autista-1') is not null, 'il vecchio funziona ancora');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select public.approva_telefono((select id from public.badge where dispositivo = 'iphone-nuovo'), true);
reset role;
select pg_temp.verifica((select count(*) from public.badge where dipendente_id = '20000000-0000-0000-0000-000000000001' and attivo) = 1, 'un solo badge attivo');
select pg_temp.verifica((select dispositivo from public.badge where dipendente_id = '20000000-0000-0000-0000-000000000001' and attivo) = 'iphone-nuovo', 'attivo il nuovo');

-- 3 · Ferie che maturano in dodicesimi
update public.dipendenti set ferie_anno = 26, permessi_anno = 72, assunto_il = '2020-01-01' where id = '20000000-0000-0000-0000-000000000004';
select pg_temp.verifica((select ferie_maturate from public.ferie where dipendente_id = '20000000-0000-0000-0000-000000000004' and anno = extract(year from public.oggi()))
  = round(26.0 * public.mesi_maturati('2020-01-01', public.oggi()) / 12, 1), 'ferie maturate in dodicesimi');
select public.matura_ferie() >= 1;
select pg_temp.verifica((select permessi_spettanti from public.ferie where dipendente_id = '20000000-0000-0000-0000-000000000004' and anno = extract(year from public.oggi()))
  = round(72.0 * public.mesi_maturati('2020-01-01', public.oggi()) / 12, 1), 'permessi in dodicesimi');
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select pg_temp.deve_fallire($$select public.correggi_uscita('20000000-0000-0000-0000-000000000003', public.oggi() + 1, '18:00', 'prova')$$, 'uscita nel futuro');
reset role;

-- 4 · Satellitare e telecamere solo con il permesso scritto; le impostazioni si cambiano dalle funzioni
select pg_temp.come('00000000-0000-0000-0000-000000000001');
select pg_temp.deve_fallire($$update public.impostazioni set valore = '{"satellitare": null, "telecamere": null}' where chiave = 'controllo_lavoratori'$$, 'permesso cambiato a mano');
select pg_temp.deve_fallire($$select public.scrivi_controllo('satellitare', 'Accordo sindacale', public.oggi(), '')$$, 'senza riferimento');
select public.scrivi_controllo('satellitare', 'Accordo sindacale', public.oggi(), 'Prot. 12/2026');
select pg_temp.deve_fallire($$select public.scrivi_conservazione(0, 7)$$, 'zero mesi');
select public.scrivi_conservazione(12, 7);
reset role;
select pg_temp.verifica((select valore ->> 'foto_giorni' from public.impostazioni where chiave = 'conservazione') = '7', 'conservazione scritta');
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select pg_temp.deve_fallire($$select public.scrivi_conservazione(null, null)$$, 'l''amministrazione non sceglie la conservazione');
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.impostazioni set valore = jsonb_set(valore, '{satellitare}', 'null') where chiave = 'controllo_lavoratori';
select pg_temp.deve_fallire($$insert into public.sat_posizioni (mezzo_id, quando, lat, lng) select id, now(), 45.3, 9.1 from public.mezzi limit 1$$, 'posizioni senza accordo');
update public.impostazioni set valore = jsonb_set(valore, '{satellitare}', '{"tipo": "Accordo sindacale", "data": "2026-01-15", "rif": "x"}') where chiave = 'controllo_lavoratori';
