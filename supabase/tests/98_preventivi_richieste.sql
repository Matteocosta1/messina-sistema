-- Preventivi dei Trasporti e richieste delle aziende per la Corporation
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

-- dal sito: potenziale cliente e preventivo in bozza
select public.preventivo_da_sito('Logistica Bianchi', 'acquisti@bianchi.example', '02 1234', 'Distribuzione Milano, 40 bancali al mese', null) is not null;
select pg_temp.verifica((select stato from public.clienti where nome = 'Logistica Bianchi') = 'Potenziale', 'potenziale dal sito');
select pg_temp.verifica((select origine from public.preventivi p join public.clienti c on c.id = p.cliente_id where c.nome = 'Logistica Bianchi') = 'Sito', 'preventivo dal sito');
select pg_temp.deve_fallire($$insert into public.bolle (cliente_id) select id from public.clienti where nome = 'Logistica Bianchi'$$, 'bolla per un potenziale');
insert into public.listino (voce, unita, prezzo) values ('Base', 'bancale', 30) on conflict do nothing;

select pg_temp.come('00000000-0000-0000-0000-000000000003');   -- ufficio bolle: niente preventivi
select pg_temp.verifica((select count(*) from public.preventivi) = 0, 'l''ufficio bolle non vede i preventivi');
reset role;

select pg_temp.come('00000000-0000-0000-0000-000000000007');   -- Gianluca
select pg_temp.deve_fallire($$select public.invia_preventivo((select id from public.preventivi limit 1))$$, 'preventivo senza prezzi');
insert into public.preventivi_righe (preventivo_id, voce, unita, prezzo)
  select id, 'Base', 'bancale', 28 from public.preventivi;
insert into public.preventivi_righe (preventivo_id, voce, unita, prezzo)
  select id, 'Sponda', 'spedizione', 15 from public.preventivi;
select pg_temp.deve_fallire($$update public.preventivi set stato = 'Inviato'$$, 'stato cambiato a mano');
select pg_temp.verifica(public.invia_preventivo((select id from public.preventivi)) = 'Da approvare', 'cliente nuovo e sotto listino: alla Direzione');
select pg_temp.verifica((select motivo from public.preventivi) like 'Cliente nuovo; Sotto il listino: Base 28.00 € (listino 30.00 €)', 'dice perché');
select pg_temp.deve_fallire($$insert into public.preventivi_righe (preventivo_id, voce, unita, prezzo) select id, 'X', 'spedizione', 1 from public.preventivi$$, 'righe cambiate dopo l''invio');
select pg_temp.deve_fallire($$select public.preventivo_inviato((select id from public.preventivi))$$, 'inviato prima dell''approvazione');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000001');
select pg_temp.deve_fallire($$select public.approva_preventivo((select id from public.preventivi), false, '')$$, 'rimandato senza dire cosa cambiare');
select public.approva_preventivo((select id from public.preventivi), true);
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000007');
select public.preventivo_inviato((select id from public.preventivi));
select pg_temp.verifica((select valido_fino from public.preventivi) = public.oggi() + 30, 'valido 30 giorni');
select pg_temp.deve_fallire($$select public.accetta_preventivo((select id from public.preventivi), '', public.oggi())$$, 'accettato senza la risposta del cliente');
select public.accetta_preventivo((select id from public.preventivi), 'preventivi/risposta-bianchi.pdf', public.oggi() + 1);
reset role;
select pg_temp.verifica((select stato from public.clienti where nome = 'Logistica Bianchi') = 'Attivo', 'diventa cliente');
select pg_temp.verifica((select count(*) from public.tariffe t join public.clienti c on c.id = t.cliente_id
  where c.nome = 'Logistica Bianchi' and t.stato = 'Attiva' and t.valida_dal = public.oggi() + 1) = 2, 'i prezzi diventano tariffe dal giorno scelto');

-- un secondo preventivo accettato sostituisce le tariffe dal suo giorno
select pg_temp.come('00000000-0000-0000-0000-000000000007');
insert into public.preventivi (cliente_id, modello) select id, 'Spedizioni a peso' from public.clienti where nome = 'Logistica Bianchi';
insert into public.preventivi_righe (preventivo_id, voce, unita, prezzo, scaglione_su, scaglione_da)
  select id, 'Base', 'spedizione', 40, 'peso', 0 from public.preventivi where modello = 'Spedizioni a peso';
select pg_temp.verifica(public.invia_preventivo((select id from public.preventivi where modello = 'Spedizioni a peso')) = 'Approvato', 'cliente attivo e sopra listino: subito pronto');
select public.preventivo_inviato((select id from public.preventivi where modello = 'Spedizioni a peso'));
select public.accetta_preventivo((select id from public.preventivi where modello = 'Spedizioni a peso'), 'mail del 22/10', public.oggi() + 10);
reset role;
select pg_temp.verifica((select count(*) from public.tariffe t join public.clienti c on c.id = t.cliente_id
  where c.nome = 'Logistica Bianchi' and t.stato = 'Attiva' and t.valida_al = public.oggi() + 9) = 2, 'le tariffe di prima finiscono il giorno prima');

-- Corporation: richiesta dal negozio assegnata a Vendite, si chiude solo dopo il preventivo
select set_config('request.jwt.claim.sub', '', false);
select public.richiesta_da_negozio('Studio Rossi', 'Anna Rossi', 'anna@rossi.example', null, 'Dell Latitude 5420', 'A', 12, 'Consegna entro fine mese') is not null;
select pg_temp.verifica((select assegnata_a from public.richieste_aziende) = '00000000-0000-0000-0000-000000000008', 'assegnata a Vendite');
select pg_temp.come('00000000-0000-0000-0000-000000000002');   -- amministrazione Trasporti
select pg_temp.verifica((select count(*) from public.richieste_aziende) = 0, 'i Trasporti non vedono le richieste della Corporation');
reset role;
select pg_temp.come('00000000-0000-0000-0000-000000000008');
select pg_temp.deve_fallire($$select public.chiudi_richiesta((select id from public.richieste_aziende), false, 'caro')$$, 'chiusa senza preventivo');
select pg_temp.deve_fallire($$update public.richieste_aziende set stato = 'Vinta'$$, 'stato cambiato a mano');
select public.richiesta_preventivo_inviato((select id from public.richieste_aziende), 3600);
select public.chiudi_richiesta((select id from public.richieste_aziende), true, null);
insert into public.richieste_aziende (azienda_cliente, modello, quantita, origine) values ('Bar Centrale', 'iPhone 13', 2, 'WhatsApp');
select pg_temp.verifica((select stato from public.richieste_aziende where azienda_cliente = 'Bar Centrale') = 'Aperta', 'richiesta a mano da WhatsApp');
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.richieste_aziende set creata_il = now() - interval '5 hours' where azienda_cliente = 'Bar Centrale';
select pg_temp.come('00000000-0000-0000-0000-000000000008');
select pg_temp.verifica((select count(*) from public.richieste_da_sollecitare) = 1, 'dopo 4 ore senza preventivo: sollecito');
reset role;
select set_config('request.jwt.claim.sub', '', false);
