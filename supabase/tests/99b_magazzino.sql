-- Magazzino: uscita bancali, deposito al giorno, inventario con quantità e PC Corporation, rettifica, storico
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

insert into public.contenuto (bancale_id, articolo, quantita, codici) values ('60000000-0000-0000-0000-000000000003', 'Scatole imballo', 10, '{}');
update public.bancali set creato_il = date_trunc('month', now()) - interval '3 days' where cliente_id = '10000000-0000-0000-0000-000000000004';

-- 1 · Missione sui bancali di Econocom: seriali e quantità
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select public.lancia_missione('Cliente', 'Econocom') is not null;
reset role;
select pg_temp.verifica((select attesi @> '[{"articolo": "Scatole imballo", "quantita": 10}]' from public.missioni_posti mp join public.posti p on p.id = mp.posto_id
  join public.missioni m on m.id = mp.missione_id where p.codice = 'S07-2-1' and m.filtro = 'Econocom'), 'le scatole senza seriale si contano');
select pg_temp.come('00000000-0000-0000-0000-000000000005');
do $$
declare v uuid; r jsonb;
begin
  select a.id into v from public.missioni_posti_app a join public.missioni m on m.id = a.missione_id where a.posto = 'S07-2-1' and m.filtro = 'Econocom';
  perform public.scansiona_missione(v, 'HP3C001'); perform public.scansiona_missione(v, 'HP3C002');
  r := public.conta_missione(v, 'Scatole imballo', 9);
  if (r ->> 'chiuso')::boolean then raise exception 'TEST FALLITO: 9 scatole su 10 non chiudono il posto'; end if;
  r := public.conta_missione(v, 'Scatole imballo', 10);
  if not (r ->> 'chiuso')::boolean then raise exception 'TEST FALLITO: seriali e 10 scatole chiudono il posto'; end if;
end $$;
reset role;

-- 2 · PC della Corporation: uno manca, il posto si blocca; l'ufficio rettifica e la missione si chiude
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select public.lancia_missione('Cliente', 'Messina Corporation') is not null;
reset role;
select pg_temp.verifica((select attesi @> '[{"codice": "C02XXXX3"}]' from public.missioni_posti mp join public.posti p on p.id = mp.posto_id
  join public.missioni m on m.id = mp.missione_id where p.codice = 'S11-2-2' and m.filtro = 'Messina Corporation'), 'i PC della Corporation sono nella missione');
-- cosa c'è da leggere in ogni posto (lo prepara il test: il magazziniere non legge la tabella delle missioni)
create temp table da_leggere as select mp.id, a ->> 'codice' as codice, a ->> 'articolo' as articolo, (a ->> 'quantita')::int as quantita
  from public.missioni_posti mp join public.missioni m on m.id = mp.missione_id, jsonb_array_elements(mp.attesi) a where m.filtro = 'Messina Corporation';
grant select on da_leggere to public;
select pg_temp.come('00000000-0000-0000-0000-000000000005');
do $$
declare x record;
begin
  for x in select a.* from public.missioni_posti_app a join public.missioni m on m.id = a.missione_id where m.filtro = 'Messina Corporation' loop
    if x.posto = 'S11-2-2' then perform public.segnala_posto(x.id);   -- il MacBook non c'è
    elsif x.pezzi = 0 then perform public.posto_vuoto(x.id);
    else
      perform public.scansiona_missione(x.id, d.codice) from pg_temp.da_leggere d where d.id = x.id and d.codice is not null;
      perform public.conta_missione(x.id, d.articolo, d.quantita) from pg_temp.da_leggere d where d.id = x.id and d.codice is null;
    end if;
  end loop;
end $$;
select pg_temp.deve_fallire($$select public.rettifica_posto((select x.id from public.missioni_posti_app x join public.missioni m on m.id = x.missione_id where x.posto = 'S11-2-2' and m.filtro = 'Messina Corporation'), 'x')$$, 'il magazziniere rettifica');
reset role;
select pg_temp.verifica((select stato from public.missioni where filtro = 'Messina Corporation') = 'Aperta', 'con un posto bloccato la missione resta aperta');
select pg_temp.come('00000000-0000-0000-0000-000000000004');
select pg_temp.deve_fallire($$select public.rettifica_posto((select x.id from public.missioni_posti_app x join public.missioni m on m.id = x.missione_id where x.posto = 'S11-2-2' and m.filtro = 'Messina Corporation'), ' ')$$, 'rettifica senza motivo');
select public.rettifica_posto((select x.id from public.missioni_posti_app x join public.missioni m on m.id = x.missione_id
  where x.posto = 'S11-2-2' and m.filtro = 'Messina Corporation'), 'MacBook venduto in negozio e mai scaricato');
reset role;
select pg_temp.verifica((select bancale_id is null and stato = 'Fermo' from public.device where seriale = 'C02XXXX3'), 'rettifica: il PC mancante non è più sul bancale ed è fermo');
select pg_temp.verifica((select stato from public.missioni where filtro = 'Messina Corporation') = 'Chiusa', 'tutti i posti a posto: missione chiusa da sola');

-- 3 · Uscita del bancale con la bolla di uscita
alter table public.bolle disable trigger user;
insert into public.bolle (id, numero, cliente_id, tipo, data_consegna, colli_previsti, stato) values
  ('4b000000-0000-0000-0000-000000000001', '26-800001', '10000000-0000-0000-0000-000000000004', 'Consegna', public.oggi(), 1, 'Confermata'),
  ('4b000000-0000-0000-0000-000000000002', '26-800002', '10000000-0000-0000-0000-000000000001', 'Consegna', public.oggi(), 1, 'Confermata');
alter table public.bolle enable trigger user;
select pg_temp.come('00000000-0000-0000-0000-000000000005');
select pg_temp.deve_fallire($$select public.esci_bancale('B-0101', '4b000000-0000-0000-0000-000000000002')$$, 'bancale di Econocom con la bolla di Snam');
select public.esci_bancale('B-0101', '4b000000-0000-0000-0000-000000000001');
select pg_temp.deve_fallire($$select public.esci_bancale('B-0101', '4b000000-0000-0000-0000-000000000001')$$, 'bancale uscito due volte');
reset role;
select pg_temp.verifica((select uscito_il is not null and posto_id is null and bolla_uscita_id = '4b000000-0000-0000-0000-000000000001' from public.bancali where codice = 'B-0101'), 'uscito: posto libero, legato alla bolla');

-- 4 · Deposito al giorno in fattura, una volta sola
select pg_temp.come('00000000-0000-0000-0000-000000000007');
select public.salva_tariffe('10000000-0000-0000-0000-000000000004', '[{"voce":"Deposito","unita":"giorno","prezzo":0.5}]');
reset role;
update public.clienti set cap = '20123', citta = 'Milano', provincia = 'MI', indirizzo = 'Via [indirizzo]', codice_destinatario = 'ABCDEFG', piva = '00000000003'
 where id = '10000000-0000-0000-0000-000000000004';
select pg_temp.verifica(public.giorni_deposito('10000000-0000-0000-0000-000000000004', to_char(public.oggi(), 'YYYY-MM')) > 0, 'giorni di deposito nel mese');
select pg_temp.come('00000000-0000-0000-0000-000000000002');
select public.chiudi_mese(to_char(public.oggi(), 'YYYY-MM'));
select public.chiudi_mese(to_char(public.oggi(), 'YYYY-MM'));
reset role;
select pg_temp.verifica((select count(*) from public.righe_fattura r join public.fatture f on f.id = r.fattura_id
  where f.cliente_id = '10000000-0000-0000-0000-000000000004' and f.stato not in ('Annullata', 'Stornata') and r.voce like 'Deposito · %') = 1, 'deposito in fattura una volta');
select pg_temp.verifica((select r.quantita from public.righe_fattura r join public.fatture f on f.id = r.fattura_id
  where f.cliente_id = '10000000-0000-0000-0000-000000000004' and f.stato not in ('Annullata', 'Stornata') and r.voce like 'Deposito · %')
  = public.giorni_deposito('10000000-0000-0000-0000-000000000004', to_char(public.oggi(), 'YYYY-MM')), 'quantità = bancali per giorni');

-- 5 · Storico: i movimenti dei bancali Corporation sono dei Trasporti, e la Corporation li vede
select pg_temp.verifica((select azienda from public.storico where oggetto = 'missioni_posti' and operazione = 'Rettifica' limit 1) = 'trasporti', 'rettifica nello storico dei Trasporti');
insert into public.storico (azienda, operazione, cosa, come, oggetto, oggetto_id) values ('corporation', 'Trasferimento', 'B-0105', 'Pistola', 'bancali', 'B-0105');
select pg_temp.verifica((select azienda = 'trasporti' and dettagli ->> 'proprietario' = 'corporation' from public.storico where oggetto_id = 'B-0105' order by quando desc limit 1), 'movimento del capannone ai Trasporti, con il proprietario');
select pg_temp.come('00000000-0000-0000-0000-000000000008');
select pg_temp.verifica((select count(*) from public.storico where oggetto_id = 'B-0105') = 1, 'la Corporation vede i movimenti dei suoi bancali');
reset role;
select set_config('request.jwt.claim.sub', '', false);
