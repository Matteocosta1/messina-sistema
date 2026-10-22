-- =====================================================================
-- Magazzino: uscita dei bancali, deposito al giorno, inventario a quantità, rettifica, missioni che si chiudono
--  · un bancale esce con la bolla di uscita (scansione in Uscita, o da solo quando tutti i suoi colli sono caricati):
--    il posto si libera e i giorni di deposito si fermano
--  · deposito: tariffa «Deposito» a giorno = un bancale per un giorno; a fine mese va in fattura (una volta per mese)
--  · missioni: anche gli articoli senza seriale (si contano) e i PC della Corporation sui bancali;
--    «Rettifica» dell'ufficio: il magazzino diventa quello trovato, con il motivo nello storico
--  · la missione si chiude da sola quando ogni posto è a posto
--  · i movimenti fisici vanno sempre nello storico dei Trasporti (gestiscono il capannone);
--    il proprietario della merce (es. la Corporation) li vede per i suoi bancali
-- =====================================================================

alter table public.bancali add column if not exists bolla_uscita_id uuid references public.bolle(id);
alter table public.missioni_posti add column if not exists contati jsonb not null default '{}';   -- articolo → pezzi contati

-- ------------------------------------------------------------------ Uscita dei bancali
create or replace function public.esci_bancale(p_bancale text, p_bolla uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.bancali; bo public.bolle; v_posto text;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino', 'traffico')) then raise exception 'Non autorizzato'; end if;
  select * into b from public.bancali where codice = p_bancale for update;
  if b.id is null then raise exception 'Bancale % sconosciuto', p_bancale; end if;
  if b.uscito_il is not null then raise exception 'Il bancale % è già uscito', p_bancale; end if;
  select * into bo from public.bolle where id = p_bolla;
  if bo.id is null or bo.stato not in ('Confermata', 'In giro') then raise exception 'Serve la bolla di uscita confermata'; end if;
  if bo.cliente_id <> b.cliente_id then raise exception 'Il bancale % è di un altro cliente: rimettilo al suo posto', p_bancale; end if;
  select codice into v_posto from public.posti where id = b.posto_id;
  update public.bancali set uscito_il = now(), bolla_uscita_id = bo.id, posto_id = null where id = b.id;
  perform public.registra('trasporti', 'Uscita', 'Bancale ' || b.codice || ' con la bolla ' || coalesce(bo.numero, '—'), v_posto, 'Pistola', 'bancali', b.id::text);
  return jsonb_build_object('bancale', b.codice, 'posto', v_posto);
end $$;

-- al carico: quando tutti i colli di un bancale sono sul mezzo, il bancale esce da solo
create or replace function public.bancale_esce_con_i_colli() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.letto_carico is not null and old.letto_carico is null and new.bancale_id is not null
     and not exists (select 1 from public.colli k where k.bancale_id = new.bancale_id and k.letto_carico is null) then
    update public.bancali set uscito_il = now(), bolla_uscita_id = new.bolla_id, posto_id = null
     where id = new.bancale_id and uscito_il is null;
  end if;
  return null;
end $$;
drop trigger if exists bancale_esce_con_i_colli on public.colli;
create trigger bancale_esce_con_i_colli after update of letto_carico on public.colli
  for each row execute function public.bancale_esce_con_i_colli();

revoke execute on function public.esci_bancale(text, uuid) from public, anon;
grant execute on function public.esci_bancale(text, uuid) to authenticated;

-- ------------------------------------------------------------------ Deposito al giorno
-- giorni di deposito di un cliente in un mese: per ogni bancale, i giorni (italiani) in magazzino dentro il mese
create or replace function public.giorni_deposito(p_cliente uuid, p_mese text) returns integer
language sql stable security definer set search_path = public as $$
  with m as (select to_date(p_mese || '-01', 'YYYY-MM-DD') as dal,
                    (to_date(p_mese || '-01', 'YYYY-MM-DD') + interval '1 month')::date as al)
  select coalesce(sum(greatest(0,
           least(coalesce((b.uscito_il at time zone 'Europe/Rome')::date, public.oggi() + 1), m.al)
         - greatest((b.creato_il at time zone 'Europe/Rome')::date, m.dal))), 0)::int
    from public.bancali b, m
   where b.cliente_id = p_cliente
$$;
revoke execute on function public.giorni_deposito(uuid, text) from public, anon, authenticated;

-- la chiusura del mese aggiunge il deposito: una riga per mese e cliente, mai due volte
create or replace function public.aggiungi_deposito(p_fattura uuid) returns text
language plpgsql security definer set search_path = public as $$
declare f public.fatture; t public.tariffe; v_giorni int; v_fine date; c public.clienti;
begin
  select * into f from public.fatture where id = p_fattura;
  v_fine := (to_date(f.periodo || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  delete from public.righe_fattura where fattura_id = f.id and voce like 'Deposito · %';
  if exists (select 1 from public.righe_fattura r join public.fatture x on x.id = r.fattura_id
              where x.cliente_id = f.cliente_id and x.periodo = f.periodo and x.id <> f.id and x.tipo = 'Fattura'
                and x.stato not in ('Annullata', 'Stornata') and r.voce like 'Deposito · %') then
    return null;   -- il deposito di quel mese è già in un'altra fattura
  end if;
  v_giorni := public.giorni_deposito(f.cliente_id, f.periodo);
  if v_giorni = 0 then return null; end if;
  t := public.tariffa_valida(f.cliente_id, 'Deposito', v_fine, '{}', null, 0, null);
  if t.id is null then return 'deposito: ' || v_giorni || ' giorni di bancali senza tariffa Deposito'; end if;
  select * into c from public.clienti where id = f.cliente_id;
  insert into public.righe_fattura (fattura_id, voce, quantita, prezzo, iva_aliquota, iva_natura)
  values (f.id, 'Deposito · bancali al giorno ' || f.periodo, v_giorni, t.prezzo, c.iva_aliquota, c.iva_natura);
  return null;
end $$;
revoke execute on function public.aggiungi_deposito(uuid) from public, anon, authenticated;

-- chiusura del mese: le bolle (come prima) più il deposito dei clienti che hanno bancali in magazzino
create or replace function public.chiudi_mese(p_mese text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_fine date; c record; v_f uuid; v_problemi text[]; v_n int := 0; v_cli public.clienti; v_dep text;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('amministrazione')) then raise exception 'La chiusura del mese la fa l''amministrazione'; end if;
  if p_mese !~ '^\d{4}-\d{2}$' then raise exception 'Mese non valido'; end if;
  v_fine := (to_date(p_mese || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  if v_fine > public.oggi() and to_char(public.oggi(), 'YYYY-MM') <> p_mese then raise exception 'Il mese non è ancora cominciato'; end if;
  perform set_config('messina.chiusura_mese', 'si', true);
  for c in
    with nuove as (
      select b.cliente_id, b.id, b.data_consegna, b.numero
        from public.bolle b join public.clienti cl on cl.id = b.cliente_id
       where cl.azienda = 'trasporti' and b.stato = 'Consegnata' and b.tipo <> 'Magazzino' and b.data_consegna <= v_fine
         and not exists (select 1 from public.fatture_bolle fb where fb.bolla_id = b.id and fb.valida)
         and not exists (select 1 from public.giacenze g where g.bolla_id = b.id and g.chiusa_il is null)
    ), clienti as (
      select cliente_id from nuove
      union
      select f.cliente_id from public.fatture f
       where f.azienda = 'trasporti' and f.periodo = p_mese and f.tipo = 'Fattura' and f.stato in ('Bozza', 'Da controllare', 'Pronta')
         and exists (select 1 from public.fatture_bolle fb where fb.fattura_id = f.id and fb.valida)
      union
      -- deposito: clienti con bancali in magazzino nel mese e deposito non ancora fatturato
      select cl.id from public.clienti cl
       where cl.azienda = 'trasporti' and public.giorni_deposito(cl.id, p_mese) > 0
         and not exists (select 1 from public.righe_fattura r join public.fatture x on x.id = r.fattura_id
                          where x.cliente_id = cl.id and x.periodo = p_mese and x.tipo = 'Fattura'
                            and x.stato in ('Inviata', 'Pagata') and r.voce like 'Deposito · %')
    )
    select k.cliente_id, coalesce(array_agg(n.id order by n.data_consegna, n.numero) filter (where n.id is not null), '{}') as bolle
      from clienti k left join nuove n on n.cliente_id = k.cliente_id
     group by k.cliente_id
  loop
    select * into v_cli from public.clienti where id = c.cliente_id;
    select id into v_f from public.fatture
     where azienda = 'trasporti' and cliente_id = c.cliente_id and periodo = p_mese and tipo = 'Fattura' and stato in ('Bozza', 'Da controllare', 'Pronta')
     order by creata_il limit 1;
    if v_f is null then
      insert into public.fatture (azienda, cliente_id, periodo, stato, split_payment)
      values ('trasporti', c.cliente_id, p_mese, 'Bozza', v_cli.split_payment) returning id into v_f;
    else
      update public.fatture set stato = 'Bozza', problema = null where id = v_f and stato <> 'Bozza';
    end if;
    insert into public.fatture_bolle (fattura_id, bolla_id) select v_f, x from unnest(c.bolle) x on conflict do nothing;
    delete from public.righe_fattura where fattura_id = v_f and voce like '% · consegne%';
    insert into public.righe_fattura (fattura_id, voce, quantita, prezzo, iva_aliquota, iva_natura)
    select v_f, x.voce || ' · consegne ' || p_mese, sum(x.quantita), x.prezzo, v_cli.iva_aliquota, v_cli.iva_natura
      from public.fatture_bolle fb cross join lateral public.calcola_bolla(fb.bolla_id) x
     where fb.fattura_id = v_f and fb.valida and x.problema is null and x.totale > 0
     group by x.voce, x.prezzo;
    v_dep := public.aggiungi_deposito(v_f);
    perform public.ricalcola_fattura(v_f);
    select array_agg(distinct coalesce(b.numero, 'senza numero') || ': ' || x.problema) into v_problemi
      from public.fatture_bolle fb join public.bolle b on b.id = fb.bolla_id cross join lateral public.calcola_bolla(fb.bolla_id) x
     where fb.fattura_id = v_f and fb.valida and x.problema is not null;
    v_problemi := coalesce(v_problemi, '{}') || coalesce(array[v_dep], '{}')
               || coalesce((select array_agg('scheda cliente: manca ' || m) from unnest(public.anagrafica_mancante(c.cliente_id)) m), '{}');
    v_problemi := array_remove(v_problemi, null);
    if not exists (select 1 from public.righe_fattura where fattura_id = v_f) and cardinality(v_problemi) = 0 then
      update public.fatture set stato = 'Annullata', motivo = 'Niente da fatturare' where id = v_f;   -- es. deposito già fatturato
      continue;
    end if;
    update public.fatture set
      problema = case when cardinality(v_problemi) > 0 then array_to_string(v_problemi[1:5], '; ')
                       || case when cardinality(v_problemi) > 5 then ' e altri ' || (cardinality(v_problemi) - 5) else '' end end,
      stato = case when cardinality(v_problemi) > 0 then 'Da controllare'::public.stato_fattura else 'Pronta'::public.stato_fattura end,
      approvata_da = null
     where id = v_f;
    v_n := v_n + 1;
  end loop;
  perform set_config('messina.chiusura_mese', '', true);
  perform public.registra('trasporti', 'Fatture', 'Chiusura di ' || p_mese || ': ' || v_n || ' fatture preparate', null, 'Manuale', 'fatture', p_mese);
  return v_n;
end $$;

-- ------------------------------------------------------------------ Missioni: seriali, quantità e PC della Corporation
create or replace function public.lancia_missione(p_ambito text, p_filtro text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('traffico', 'amministrazione')) then
    raise exception 'Le missioni le lancia l''ufficio';
  end if;
  -- una missione alla volta: la nuova sostituisce i posti non ancora controllati di quelle aperte
  -- (i posti bloccati restano all'ufficio; la missione vecchia si chiude quando sono sistemati)
  delete from public.missioni_posti where stato = 'Da fare' and missione_id in (select id from public.missioni where stato = 'Aperta');
  update public.missioni m set stato = 'Chiusa', chiusa_il = now()
   where m.stato = 'Aperta' and not exists (select 1 from public.missioni_posti x where x.missione_id = m.id and x.stato in ('Da fare', 'Bloccato'));
  insert into public.missioni (ambito, filtro, creata_da) values (p_ambito, p_filtro, auth.uid()) returning id into v_id;
  insert into public.missioni_posti (missione_id, posto_id, attesi)
  select v_id, p.id, coalesce((select jsonb_agg(x) from (
           -- pezzi con il seriale: uno per codice
           select jsonb_build_object('articolo', c.articolo, 'codice', cod) as x
             from public.bancali b join public.contenuto c on c.bancale_id = b.id cross join lateral unnest(c.codici) cod
            where b.posto_id = p.id and b.uscito_il is null
           union all
           -- articoli senza seriale (o con meno seriali dei pezzi): si contano
           select jsonb_build_object('articolo', c.articolo, 'codice', null, 'quantita', sum(c.quantita - coalesce(cardinality(c.codici), 0)))
             from public.bancali b join public.contenuto c on c.bancale_id = b.id
            where b.posto_id = p.id and b.uscito_il is null and c.quantita > coalesce(cardinality(c.codici), 0)
            group by c.articolo
           union all
           -- PC e telefoni della Corporation sui bancali del posto
           select jsonb_build_object('articolo', d.marca || ' ' || d.modello, 'codice', d.seriale)
             from public.bancali b join public.device d on d.bancale_id = b.id
            where b.posto_id = p.id and b.uscito_il is null and d.stato not in ('Venduto', 'Smontato')
         ) y), '[]')
  from public.posti p
  where p.attivo and p.zona = 'Scaffale' and (
        p_ambito = 'Tutto'
     or (p_ambito = 'Scaffale' and p.codice like p_filtro || '-%')
     or (p_ambito = 'Zona' and p.codice like p_filtro || '%')
     or (p_ambito = 'Cliente' and exists (select 1 from public.bancali b join public.clienti c on c.id = b.cliente_id
                                           where b.posto_id = p.id and b.uscito_il is null and c.nome = p_filtro)));
  perform public.registra('trasporti', 'Missione', 'Lanciata: ' || p_ambito || ' ' || coalesce(p_filtro, ''), null, 'Sistema', 'missioni', v_id::text);
  return v_id;
end $$;

-- cosa manca e cosa c'è in più, contando seriali e quantità
create or replace function public.conti_missione(mp public.missioni_posti, OUT mancanti jsonb, OUT extra jsonb)
language sql stable set search_path = public as $$
  select
    coalesce((select jsonb_agg(a) from jsonb_array_elements(mp.attesi) a
               where (a ->> 'codice') is not null and not mp.letti ? (a ->> 'codice')), '[]')
    || coalesce((select jsonb_agg(jsonb_build_object('articolo', a ->> 'articolo', 'quantita', (a ->> 'quantita')::int - coalesce((mp.contati ->> (a ->> 'articolo'))::int, 0)))
               from jsonb_array_elements(mp.attesi) a
              where (a ->> 'codice') is null and coalesce((mp.contati ->> (a ->> 'articolo'))::int, 0) < (a ->> 'quantita')::int), '[]'),
    coalesce((select jsonb_agg(l) from jsonb_array_elements_text(mp.letti) l
               where not exists (select 1 from jsonb_array_elements(mp.attesi) a where a ->> 'codice' = l)), '[]')
    || coalesce((select jsonb_agg(jsonb_build_object('articolo', k.key, 'quantita', k.value::int - coalesce((select (a ->> 'quantita')::int from jsonb_array_elements(mp.attesi) a
                                                                                                   where (a ->> 'codice') is null and a ->> 'articolo' = k.key limit 1), 0)))
               from jsonb_each_text(mp.contati) k
              where k.value::int > coalesce((select (a ->> 'quantita')::int from jsonb_array_elements(mp.attesi) a where (a ->> 'codice') is null and a ->> 'articolo' = k.key limit 1), 0)), '[]')
$$;

create or replace function public.scansiona_missione(p_posto uuid, p_codice text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mp public.missioni_posti; v_art text; m jsonb; e jsonb;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  select * into mp from public.missioni_posti where id = p_posto for update;
  if mp.id is null then raise exception 'Posto della missione non trovato'; end if;
  if mp.stato <> 'Da fare' then raise exception 'Posto già chiuso o bloccato'; end if;
  mp.letti := case when mp.letti ? p_codice then mp.letti else mp.letti || to_jsonb(p_codice) end;
  select x.mancanti, x.extra into m, e from public.conti_missione(mp) x;
  select a ->> 'articolo' into v_art from jsonb_array_elements(mp.attesi) a where a ->> 'codice' = p_codice limit 1;
  update public.missioni_posti set letti = mp.letti, mancanti = m, extra = e,
         stato = case when jsonb_array_length(m) = 0 and jsonb_array_length(e) = 0 then 'Fatto'::public.stato_posto_missione else 'Da fare'::public.stato_posto_missione end
   where id = mp.id;
  return jsonb_build_object('articolo', v_art, 'extra', v_art is null, 'chiuso', jsonb_array_length(m) = 0 and jsonb_array_length(e) = 0);
end $$;

-- articoli senza seriale: il magazziniere scrive quanti ne conta
create or replace function public.conta_missione(p_posto uuid, p_articolo text, p_quantita integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mp public.missioni_posti; m jsonb; e jsonb;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  if p_quantita is null or p_quantita < 0 then raise exception 'Scrivi quanti pezzi conti'; end if;
  select * into mp from public.missioni_posti where id = p_posto for update;
  if mp.id is null then raise exception 'Posto della missione non trovato'; end if;
  if mp.stato <> 'Da fare' then raise exception 'Posto già chiuso o bloccato'; end if;
  mp.contati := mp.contati || jsonb_build_object(p_articolo, p_quantita);
  select x.mancanti, x.extra into m, e from public.conti_missione(mp) x;
  update public.missioni_posti set contati = mp.contati, mancanti = m, extra = e,
         stato = case when jsonb_array_length(m) = 0 and jsonb_array_length(e) = 0 then 'Fatto'::public.stato_posto_missione else 'Da fare'::public.stato_posto_missione end
   where id = mp.id;
  return jsonb_build_object('chiuso', jsonb_array_length(m) = 0 and jsonb_array_length(e) = 0);
end $$;

create or replace function public.segnala_posto(p_posto uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mp public.missioni_posti; m jsonb; e jsonb;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  select * into mp from public.missioni_posti where id = p_posto for update;
  if mp.id is null then raise exception 'Posto della missione non trovato'; end if;
  if mp.stato <> 'Da fare' then raise exception 'Posto già chiuso o bloccato'; end if;
  select x.mancanti, x.extra into m, e from public.conti_missione(mp) x;
  update public.missioni_posti set mancanti = m, extra = e, stato = 'Bloccato' where id = mp.id;
end $$;

create or replace function public.posto_vuoto(p_posto uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mp public.missioni_posti;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  select * into mp from public.missioni_posti where id = p_posto for update;
  if mp.id is null then raise exception 'Posto della missione non trovato'; end if;
  if mp.stato <> 'Da fare' then raise exception 'Posto già chiuso o bloccato'; end if;
  if jsonb_array_length(mp.attesi) > 0 or jsonb_array_length(mp.letti) > 0 or mp.contati <> '{}' then
    raise exception 'Il posto non è vuoto: scansiona o conta i pezzi';
  end if;
  update public.missioni_posti set stato = 'Fatto' where id = mp.id;
end $$;

-- sblocco: l'ufficio dice cosa è successo; il magazzino resta com'era (errore di lettura, pezzo ritrovato…)
create or replace function public.sblocca_posto(p_posto uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('amministrazione', 'traffico')) then raise exception 'Lo sblocca solo l''ufficio'; end if;
  update public.missioni_posti set stato = 'Sbloccato', motivo = p_motivo where id = p_posto;
  if not found then raise exception 'Posto non trovato'; end if;
end $$;

-- rettifica: il magazzino diventa quello trovato (seriali mancanti tolti, in più aggiunti, quantità contate)
create or replace function public.rettifica_posto(p_posto uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare mp public.missioni_posti; a jsonb; v_cod text; c public.contenuto; v_bancale uuid; v_resto int; k record;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('amministrazione', 'traffico')) then raise exception 'La rettifica la fa solo l''ufficio'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Scrivi perché il magazzino cambia'; end if;
  select * into mp from public.missioni_posti where id = p_posto for update;
  if mp.id is null or mp.stato <> 'Bloccato' then raise exception 'Si rettifica solo un posto bloccato'; end if;
  -- seriali che non ci sono più: tolti dal contenuto (o dal PC della Corporation: senza bancale)
  for a in select x from jsonb_array_elements(mp.mancanti) x where (x ->> 'codice') is not null loop
    v_cod := a ->> 'codice';
    update public.contenuto set codici = array_remove(codici, v_cod), quantita = greatest(0, quantita - 1), inserito = 'Manuale', da = auth.uid()
     where v_cod = any(codici) and bancale_id in (select id from public.bancali where posto_id = mp.posto_id and uscito_il is null);
    -- il PC che non c'è non si può più vendere: va «Fermo» finché la Corporation non lo ritrova
    update public.device set bancale_id = null, stato = case when stato in ('Disponibile', 'In carico') then 'Fermo'::public.stato_device else stato end
     where seriale = v_cod and bancale_id in (select id from public.bancali where posto_id = mp.posto_id);
  end loop;
  -- quantità contate: il primo contenuto di quell'articolo nel posto prende la differenza
  for k in select key as articolo, value::int as n from jsonb_each_text(mp.contati) loop
    v_resto := k.n;
    for c in select ct.* from public.contenuto ct join public.bancali b on b.id = ct.bancale_id
              where b.posto_id = mp.posto_id and b.uscito_il is null and ct.articolo = k.articolo order by ct.il loop
      update public.contenuto set quantita = coalesce(cardinality(codici), 0) + greatest(0, v_resto), inserito = 'Manuale', da = auth.uid() where id = c.id;
      v_resto := 0;
    end loop;
  end loop;
  -- pezzi con seriale trovati in più: su un bancale del posto, articolo «Trovato in inventario»
  select id into v_bancale from public.bancali where posto_id = mp.posto_id and uscito_il is null order by creato_il limit 1;
  if v_bancale is not null then
    for v_cod in select x from jsonb_array_elements_text((select coalesce(jsonb_agg(e), '[]') from jsonb_array_elements(mp.extra) e where jsonb_typeof(e) = 'string')) x loop
      if not exists (select 1 from public.device where seriale = v_cod) then
        insert into public.contenuto (bancale_id, articolo, quantita, codici, inserito, da) values (v_bancale, 'Trovato in inventario', 1, array[v_cod], 'Manuale', auth.uid());
      else
        update public.device set bancale_id = v_bancale where seriale = v_cod;
      end if;
    end loop;
  end if;
  update public.missioni_posti set stato = 'Sbloccato', motivo = 'Rettifica: ' || trim(p_motivo) where id = mp.id;
  perform public.registra('trasporti', 'Rettifica', trim(p_motivo), (select codice from public.posti where id = mp.posto_id), 'Manuale', 'missioni_posti', mp.id::text,
                          jsonb_build_object('mancanti', mp.mancanti, 'extra', mp.extra, 'contati', mp.contati));
end $$;
revoke execute on function public.conta_missione(uuid, text, integer), public.rettifica_posto(uuid, text) from public, anon;
grant execute on function public.conta_missione(uuid, text, integer), public.rettifica_posto(uuid, text) to authenticated;

-- la missione si chiude da sola quando nessun posto è da fare o bloccato
create or replace function public.missione_si_chiude() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stato in ('Fatto', 'Sbloccato')
     and not exists (select 1 from public.missioni_posti where missione_id = new.missione_id and stato in ('Da fare', 'Bloccato')) then
    update public.missioni set stato = 'Chiusa', chiusa_il = now() where id = new.missione_id and stato = 'Aperta';
  end if;
  return null;
end $$;
drop trigger if exists missione_si_chiude on public.missioni_posti;
create trigger missione_si_chiude after update of stato on public.missioni_posti
  for each row execute function public.missione_si_chiude();

-- vista per l'app: articoli con seriale (si scansionano) e senza (si contano)
create or replace view public.missioni_posti_app as
select mp.id, mp.missione_id, p.codice as posto, mp.stato,
       (select coalesce(jsonb_agg(jsonb_build_object('articolo', t.a, 'pezzi', t.n, 'letti', t.l, 'conta', t.conta) order by t.a), '[]')
          from (select x ->> 'articolo' as a, count(*) as n, count(*) filter (where mp.letti ? (x ->> 'codice')) as l, false as conta
                  from jsonb_array_elements(mp.attesi) x where (x ->> 'codice') is not null group by 1
                union all
                select x ->> 'articolo', (x ->> 'quantita')::int, coalesce((mp.contati ->> (x ->> 'articolo'))::int, 0), true
                  from jsonb_array_elements(mp.attesi) x where (x ->> 'codice') is null) t) as elenco,
       ((select count(*) from jsonb_array_elements(mp.attesi) x where (x ->> 'codice') is not null)
         + coalesce((select sum((x ->> 'quantita')::int) from jsonb_array_elements(mp.attesi) x where (x ->> 'codice') is null), 0))::int as pezzi,
       (jsonb_array_length(mp.letti) + coalesce((select sum(v::int) from jsonb_each_text(mp.contati) c(k, v)), 0))::int as letti,
       (select count(*) from jsonb_array_elements_text(mp.letti) l
         where not exists (select 1 from jsonb_array_elements(mp.attesi) a where a ->> 'codice' = l)) as extra
from public.missioni_posti mp join public.posti p on p.id = mp.posto_id
join public.missioni m on m.id = mp.missione_id and m.stato = 'Aperta'
where public.staff_di('trasporti') and public.ha_ruolo('magazzino', 'traffico', 'amministrazione');

-- ------------------------------------------------------------------ Storico del capannone
-- i movimenti fisici (bancali, contenuto, colli, missioni) li registra sempre il gestore del capannone: i Trasporti.
-- Il proprietario della merce li vede per i suoi bancali (dettagli.proprietario).
create or replace function public.storico_capannone() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cli uuid; v_az text;
begin
  if new.oggetto not in ('bancali', 'contenuto', 'colli') then return new; end if;
  if new.oggetto = 'bancali' then
    select cliente_id into v_cli from public.bancali where id::text = new.oggetto_id or codice = new.oggetto_id or codice = new.cosa;
  elsif new.oggetto = 'contenuto' then
    select b.cliente_id into v_cli from public.contenuto c join public.bancali b on b.id = c.bancale_id where c.id::text = new.oggetto_id;
  else
    select bo.cliente_id into v_cli from public.colli k join public.bolle bo on bo.id = k.bolla_id where k.id::text = new.oggetto_id;
  end if;
  select azienda_collegata into v_az from public.clienti where id = v_cli;
  new.azienda := 'trasporti';
  new.dettagli := coalesce(new.dettagli, '{}') || jsonb_build_object('cliente_id', v_cli) || case when v_az is not null then jsonb_build_object('proprietario', v_az) else '{}' end;
  return new;
end $$;
drop trigger if exists storico_capannone on public.storico;
create trigger storico_capannone before insert on public.storico
  for each row execute function public.storico_capannone();
create policy storico_proprietario on public.storico for select to authenticated
  using (dettagli ->> 'proprietario' is not null and public.staff_di(dettagli ->> 'proprietario')
         and public.ha_ruolo('amministrazione', 'magazzino', 'vendite', 'stage'));

-- uscite di oggi (giorno italiano): anche quanti bancali del cliente sono in deposito e quanti sono già usciti con la bolla
create or replace function public.uscite_oggi() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  return coalesce((select jsonb_agg(s.x order by (s.x ->> 'caricati') = (s.x ->> 'totale'), s.x ->> 'cliente') from (
    select jsonb_build_object('bolla_id', b.id, 'numero', b.numero, 'cliente', c.nome,
      'mezzo', m.tipo || ' ' || m.targa, 'autista', d.nome,
      'totale', (select count(*) from public.colli k where k.bolla_id = b.id),
      'caricati', (select count(k.letto_carico) from public.colli k where k.bolla_id = b.id),
      'in_deposito', (select count(*) from public.bancali x where x.cliente_id = b.cliente_id and x.uscito_il is null),
      'usciti', coalesce((select jsonb_agg(x.codice order by x.codice) from public.bancali x where x.bolla_uscita_id = b.id), '[]'::jsonb),
      'colli', coalesce((select jsonb_agg(jsonb_build_object('codice', k.codice, 'posto', p.codice, 'caricato', k.letto_carico is not null)
                           order by p.codice nulls last, k.codice)
                         from public.colli k left join public.posti p on p.id = k.posto_id where k.bolla_id = b.id), '[]'::jsonb)) as x
    from public.bolle b join public.clienti c on c.id = b.cliente_id
    join public.fermate f on f.bolla_id = b.id and f.esito = 'Da fare'
    join public.giri g on g.id = f.giro_id and g.data = public.oggi()
    join public.mezzi m on m.id = g.mezzo_id join public.dipendenti d on d.id = g.autista_id
    where b.stato in ('Confermata', 'In giro')) s), '[]'::jsonb);
end $$;
