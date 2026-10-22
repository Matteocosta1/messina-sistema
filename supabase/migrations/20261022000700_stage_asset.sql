-- =====================================================================
-- Stage fatturato dai Trasporti, asset per cliente (UniCredit tramite Econocom)
--  · lo stage (PC formattati, telefoni chiusi) lo lavora la Corporation ma lo fattura Messina Autotrasporti:
--    a fine mese entra nella fattura del cliente Trasporti con lo stesso nome o la stessa partita IVA
--    (o quello scelto in «fatturato_da»), voci «Formattazione PC» e «Lavorazione telefono» a pezzo.
--    Ogni PC e ogni telefono si fattura una volta sola; senza cliente Trasporti la chiusura del mese si ferma.
--  · asset: per i clienti con «traccia_asset» ogni IMEI sparato nel contenuto di un bancale diventa un asset;
--    abbinamento IMEI → cespite → utente (dall'Excel del cliente), uscita con la bolla, storico di ogni passaggio;
--    il cliente li vede live nel portale e ogni sera si prepara il file del giorno (CSV).
-- =====================================================================

-- ------------------------------------------------------------------ Stage → fattura dei Trasporti
alter table public.clienti add column if not exists fatturato_da uuid references public.clienti(id);
alter table public.stage_pc add column if not exists fattura_id uuid references public.fatture(id);
alter table public.stage_telefoni add column if not exists fattura_id uuid references public.fatture(id),
                                  add column if not exists chiuso_il timestamptz;
update public.stage_telefoni set chiuso_il = ricevuto_il where reset_fatto and sblocco_fatto and ticket_chiuso and chiuso_il is null;

create or replace function public.stage_tel_chiuso() returns trigger
language plpgsql as $$
begin
  if new.reset_fatto and new.sblocco_fatto and new.ticket_chiuso then new.chiuso_il := coalesce(new.chiuso_il, now());
  else new.chiuso_il := null; end if;
  return new;
end $$;
drop trigger if exists stage_tel_chiuso on public.stage_telefoni;
create trigger stage_tel_chiuso before insert or update on public.stage_telefoni for each row execute function public.stage_tel_chiuso();

-- il cliente dei Trasporti a cui si fattura lo stage di un cliente della Corporation
create or replace function public.cliente_stage(p_cliente uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(c.fatturato_da,
    (select t.id from public.clienti t
      where t.azienda = 'trasporti' and t.stato <> 'Potenziale'
        and ((coalesce(trim(c.piva), '') <> '' and t.piva = c.piva) or lower(trim(t.nome)) = lower(trim(c.nome)))
      order by (coalesce(trim(c.piva), '') <> '' and t.piva = c.piva) desc limit 1))
  from public.clienti c where c.id = p_cliente
$$;
revoke execute on function public.cliente_stage(uuid) from public, anon, authenticated;

-- righe dello stage in una fattura dei Trasporti: i pezzi finiti entro la fine del mese e non ancora fatturati
create or replace function public.aggiungi_stage(p_fattura uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare f public.fatture; c public.clienti; v_fine date; n_pc int; n_tel int; t public.tariffe; v_problemi text[] := '{}';
begin
  select * into f from public.fatture where id = p_fattura;
  select * into c from public.clienti where id = f.cliente_id;
  v_fine := (to_date(f.periodo || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  delete from public.righe_fattura where fattura_id = f.id and voce like 'Stage · %';
  update public.stage_pc set fattura_id = null where fattura_id = f.id;
  update public.stage_telefoni set fattura_id = null where fattura_id = f.id;
  update public.stage_pc s set fattura_id = f.id
   where s.fattura_id is null and s.esito in ('Formattato', 'In vendita') and s.finito_il is not null
     and (s.finito_il at time zone 'Europe/Rome')::date <= v_fine and public.cliente_stage(s.cliente_id) = f.cliente_id;
  get diagnostics n_pc = row_count;
  update public.stage_telefoni s set fattura_id = f.id
   where s.fattura_id is null and s.chiuso_il is not null
     and (s.chiuso_il at time zone 'Europe/Rome')::date <= v_fine and public.cliente_stage(s.cliente_id) = f.cliente_id;
  get diagnostics n_tel = row_count;
  if n_pc > 0 then
    t := public.tariffa_valida(f.cliente_id, 'Formattazione PC', v_fine, '{}', null, n_pc, null);
    if t.id is null then v_problemi := v_problemi || ('stage: ' || n_pc || ' PC formattati senza tariffa «Formattazione PC»');
    else insert into public.righe_fattura (fattura_id, voce, quantita, prezzo, iva_aliquota, iva_natura)
         values (f.id, 'Stage · Formattazione PC ' || f.periodo, n_pc, t.prezzo, c.iva_aliquota, c.iva_natura); end if;
  end if;
  if n_tel > 0 then
    t := public.tariffa_valida(f.cliente_id, 'Lavorazione telefono', v_fine, '{}', null, n_tel, null);
    if t.id is null then v_problemi := v_problemi || ('stage: ' || n_tel || ' telefoni lavorati senza tariffa «Lavorazione telefono»');
    else insert into public.righe_fattura (fattura_id, voce, quantita, prezzo, iva_aliquota, iva_natura)
         values (f.id, 'Stage · Lavorazione telefono ' || f.periodo, n_tel, t.prezzo, c.iva_aliquota, c.iva_natura); end if;
  end if;
  return v_problemi;
end $$;
revoke execute on function public.aggiungi_stage(uuid) from public, anon, authenticated;

-- una fattura annullata o stornata libera i suoi pezzi dello stage: si rifatturano alla prossima chiusura
create or replace function public.fattura_libera_stage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stato in ('Annullata', 'Stornata') and old.stato is distinct from new.stato then
    update public.stage_pc set fattura_id = null where fattura_id = new.id;
    update public.stage_telefoni set fattura_id = null where fattura_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists fattura_libera_stage on public.fatture;
create trigger fattura_libera_stage after update of stato on public.fatture for each row execute function public.fattura_libera_stage();

-- chiusura del mese: bolle, deposito e stage
create or replace function public.chiudi_mese(p_mese text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_fine date; c record; v_f uuid; v_problemi text[]; v_n int := 0; v_cli public.clienti; v_dep text; v_senza text;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('amministrazione')) then raise exception 'La chiusura del mese la fa l''amministrazione'; end if;
  if p_mese !~ '^\d{4}-\d{2}$' then raise exception 'Mese non valido'; end if;
  v_fine := (to_date(p_mese || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  if v_fine > public.oggi() and to_char(public.oggi(), 'YYYY-MM') <> p_mese then raise exception 'Il mese non è ancora cominciato'; end if;
  -- lo stage di un cliente senza cliente Trasporti non si perde: la chiusura si ferma e dice chi manca
  -- (senza cliente = PC della Corporation stessa, es. lotti comprati: non si fatturano)
  select string_agg(distinct cl.nome, ', ') into v_senza
    from (select cliente_id from public.stage_pc where fattura_id is null and esito in ('Formattato', 'In vendita') and finito_il is not null
                                                  and (finito_il at time zone 'Europe/Rome')::date <= v_fine
          union all
          select cliente_id from public.stage_telefoni where fattura_id is null and chiuso_il is not null and (chiuso_il at time zone 'Europe/Rome')::date <= v_fine) s
    left join public.clienti cl on cl.id = s.cliente_id
   where s.cliente_id is not null and public.cliente_stage(s.cliente_id) is null;
  if v_senza is not null then
    raise exception 'Stage da fatturare di %: manca il cliente in Clienti (stesso nome o stessa partita IVA)', v_senza;
  end if;
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
         and (exists (select 1 from public.fatture_bolle fb where fb.fattura_id = f.id and fb.valida)
              or exists (select 1 from public.stage_pc s where s.fattura_id = f.id)
              or exists (select 1 from public.stage_telefoni s where s.fattura_id = f.id))
      union
      select cl.id from public.clienti cl
       where cl.azienda = 'trasporti' and public.giorni_deposito(cl.id, p_mese) > 0
         and not exists (select 1 from public.righe_fattura r join public.fatture x on x.id = r.fattura_id
                          where x.cliente_id = cl.id and x.periodo = p_mese and x.tipo = 'Fattura'
                            and x.stato in ('Inviata', 'Pagata') and r.voce like 'Deposito · %')
      union
      select public.cliente_stage(s.cliente_id) from public.stage_pc s
       where s.fattura_id is null and s.esito in ('Formattato', 'In vendita') and s.finito_il is not null and (s.finito_il at time zone 'Europe/Rome')::date <= v_fine
      union
      select public.cliente_stage(s.cliente_id) from public.stage_telefoni s
       where s.fattura_id is null and s.chiuso_il is not null and (s.chiuso_il at time zone 'Europe/Rome')::date <= v_fine
    )
    select k.cliente_id, coalesce(array_agg(n.id order by n.data_consegna, n.numero) filter (where n.id is not null), '{}') as bolle
      from clienti k left join nuove n on n.cliente_id = k.cliente_id
     where k.cliente_id is not null
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
    select array_agg(distinct coalesce(b.numero, 'senza numero') || ': ' || x.problema) into v_problemi
      from public.fatture_bolle fb join public.bolle b on b.id = fb.bolla_id cross join lateral public.calcola_bolla(fb.bolla_id) x
     where fb.fattura_id = v_f and fb.valida and x.problema is not null;
    v_problemi := coalesce(v_problemi, '{}') || coalesce(array[v_dep], '{}') || public.aggiungi_stage(v_f)
               || coalesce((select array_agg('scheda cliente: manca ' || m) from unnest(public.anagrafica_mancante(c.cliente_id)) m), '{}');
    perform public.ricalcola_fattura(v_f);
    v_problemi := array_remove(v_problemi, null);
    if not exists (select 1 from public.righe_fattura where fattura_id = v_f) and cardinality(v_problemi) = 0 then
      update public.fatture set stato = 'Annullata', motivo = 'Niente da fatturare' where id = v_f;
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

-- ------------------------------------------------------------------ Asset per cliente
alter table public.clienti add column if not exists traccia_asset boolean not null default false;
create or replace view public.clienti_portale as
  select id, nome, portale_live, traccia_asset from public.clienti
  where id = public.mio_cliente() or tramite = public.mio_cliente();
grant select on public.clienti_portale to authenticated;

create table if not exists public.asset (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clienti(id),
  cliente_finale text,                       -- es. UniCredit (il cliente è Econocom)
  imei           text not null unique,
  marca          text,
  modello        text,
  cespite        text unique,                -- etichetta del cliente: la sceglie Messina, poi si comunica l'abbinamento
  utente         text,                       -- nominativo a cui va il telefono
  sede           text,
  accessori      text[] not null default '{}',
  stato          text not null default 'In magazzino' check (stato in ('In magazzino', 'Abbinato', 'Spedito', 'Rientrato')),
  bancale_id     uuid references public.bancali(id),
  bolla_id       uuid references public.bolle(id),
  entrato_il     timestamptz not null default now(),
  abbinato_il    timestamptz,
  spedito_il     timestamptz,
  rientrato_il   timestamptz
);
create index if not exists asset_cliente on public.asset (cliente_id, stato);
create table if not exists public.asset_eventi (
  id        bigserial primary key,
  asset_id  uuid not null references public.asset(id) on delete cascade,
  quando    timestamptz not null default now(),
  chi       uuid references public.profili(id) default auth.uid(),
  evento    text not null check (evento in ('Entrata', 'Spostato', 'Tolto', 'Abbinato', 'Spedito', 'Rientrato')),
  dettagli  text
);
create index if not exists asset_eventi_asset on public.asset_eventi (asset_id, quando);
create table if not exists public.asset_file (
  cliente_id uuid not null references public.clienti(id),
  giorno     date not null,
  righe      integer not null,
  csv        text not null,
  creato_il  timestamptz not null default now(),
  primary key (cliente_id, giorno)
);

alter table public.asset enable row level security;
alter table public.asset_eventi enable row level security;
alter table public.asset_file enable row level security;
-- li vedono i Trasporti (gestiscono il magazzino) e il cliente (anche tramite chi lo porta, es. Econocom)
create or replace function public.vede_asset(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (public.staff_di('trasporti') and public.ha_ruolo('magazzino', 'traffico', 'bolle', 'amministrazione', 'commerciale', 'commercialista'))
      or p_cliente = public.mio_cliente()
      or exists (select 1 from public.clienti c where c.id = p_cliente and c.tramite = public.mio_cliente())
$$;
grant execute on function public.vede_asset(uuid) to authenticated;
create policy asset_lettura on public.asset for select to authenticated using (public.vede_asset(cliente_id));
create policy asset_eventi_lettura on public.asset_eventi for select to authenticated
  using (exists (select 1 from public.asset a where a.id = asset_id and public.vede_asset(a.cliente_id)));
create policy asset_file_lettura on public.asset_file for select to authenticated using (public.vede_asset(cliente_id));
grant select on public.asset, public.asset_eventi, public.asset_file to authenticated;
create policy doppio_fattore on public.asset as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy doppio_fattore on public.asset_eventi as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy doppio_fattore on public.asset_file as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

-- ogni IMEI sparato nel contenuto di un bancale di un cliente con «traccia_asset» diventa (o resta) un asset
create or replace function public.contenuto_asset() returns trigger
language plpgsql security definer set search_path = public as $$
declare b public.bancali; v_cod text; a public.asset; v_vecchi text[] := case when tg_op = 'UPDATE' then old.codici else '{}' end;
begin
  select * into b from public.bancali where id = new.bancale_id;
  if not exists (select 1 from public.clienti where id = b.cliente_id and traccia_asset) then return null; end if;
  foreach v_cod in array (select coalesce(array_agg(x), '{}') from unnest(new.codici) x where not (x = any(v_vecchi))) loop
    select * into a from public.asset where imei = v_cod for update;
    if a.id is null then
      insert into public.asset (cliente_id, cliente_finale, imei, modello, bancale_id)
      values (b.cliente_id, null, v_cod, new.articolo, b.id) returning * into a;
      insert into public.asset_eventi (asset_id, evento, dettagli) values (a.id, 'Entrata', 'Bancale ' || b.codice);
    elsif a.stato = 'Spedito' then
      update public.asset set stato = 'Rientrato', rientrato_il = now(), bancale_id = b.id where id = a.id;
      insert into public.asset_eventi (asset_id, evento, dettagli) values (a.id, 'Rientrato', 'Bancale ' || b.codice);
    elsif a.bancale_id is distinct from b.id then
      update public.asset set bancale_id = b.id where id = a.id;
      insert into public.asset_eventi (asset_id, evento, dettagli) values (a.id, 'Spostato', 'Bancale ' || b.codice);
    end if;
  end loop;
  -- tolto dal bancale senza uscita (es. rettifica): resta l'asset, senza bancale, con l'evento nello storico
  if tg_op = 'UPDATE' then
    for a in select * from public.asset where imei = any(v_vecchi) and not (imei = any(new.codici)) and bancale_id = b.id and stato in ('In magazzino', 'Abbinato', 'Rientrato') loop
      update public.asset set bancale_id = null where id = a.id;
      insert into public.asset_eventi (asset_id, evento, dettagli) values (a.id, 'Tolto', 'Tolto dal bancale ' || b.codice);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists contenuto_asset on public.contenuto;
create trigger contenuto_asset after insert or update of codici on public.contenuto for each row execute function public.contenuto_asset();

-- il bancale esce: i suoi asset escono con la bolla
create or replace function public.bancale_asset_esce() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.asset;
begin
  if new.uscito_il is not null and old.uscito_il is null then
    for a in select * from public.asset where bancale_id = new.id and stato in ('In magazzino', 'Abbinato', 'Rientrato') loop
      update public.asset set stato = 'Spedito', spedito_il = new.uscito_il, bolla_id = new.bolla_uscita_id where id = a.id;
      insert into public.asset_eventi (asset_id, evento, dettagli)
      values (a.id, 'Spedito', 'Con il bancale ' || new.codice || coalesce(' · bolla ' || (select numero from public.bolle where id = new.bolla_uscita_id), ''));
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists bancale_asset_esce on public.bancali;
create trigger bancale_asset_esce after update of uscito_il on public.bancali for each row execute function public.bancale_asset_esce();

-- abbinamento dall'Excel del cliente (IMEI · cespite · utente · sede · accessori): tutto o niente
create or replace function public.abbina_asset(p_righe jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare r jsonb; a public.asset; v_err text[] := '{}'; v_n int := 0; v_cesp text; v_imei text;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino', 'traffico', 'bolle', 'amministrazione')) then raise exception 'Non autorizzato'; end if;
  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then raise exception 'Nessuna riga da abbinare'; end if;
  for r in select * from jsonb_array_elements(p_righe) loop
    v_imei := trim(r->>'imei'); v_cesp := nullif(trim(r->>'cespite'), '');
    select * into a from public.asset where imei = v_imei;
    if a.id is null then v_err := v_err || ('IMEI ' || coalesce(v_imei, '—') || ' non è in magazzino');
    elsif a.stato = 'Spedito' then v_err := v_err || ('IMEI ' || v_imei || ' è già spedito');
    elsif v_cesp is null or coalesce(trim(r->>'utente'), '') = '' then v_err := v_err || ('IMEI ' || v_imei || ': mancano cespite o utente');
    elsif exists (select 1 from public.asset where cespite = v_cesp and id <> a.id) then v_err := v_err || ('cespite ' || v_cesp || ' già usato');
    end if;
  end loop;
  if (select count(*) <> count(distinct trim(x->>'cespite')) from jsonb_array_elements(p_righe) x) then v_err := v_err || 'lo stesso cespite è scritto due volte'::text; end if;
  if cardinality(v_err) > 0 then
    raise exception 'Niente abbinato: %', array_to_string(v_err[1:5], '; ') || case when cardinality(v_err) > 5 then ' e altri ' || (cardinality(v_err) - 5) else '' end;
  end if;
  for r in select * from jsonb_array_elements(p_righe) loop
    update public.asset set cespite = trim(r->>'cespite'), utente = trim(r->>'utente'), sede = nullif(trim(r->>'sede'), ''),
           cliente_finale = coalesce(nullif(trim(r->>'cliente_finale'), ''), cliente_finale),
           accessori = coalesce((select array_agg(trim(x)) from jsonb_array_elements_text(r->'accessori') x where trim(x) <> ''), '{}'),
           stato = case when stato = 'Rientrato' then stato else 'Abbinato' end, abbinato_il = now()
     where imei = trim(r->>'imei') returning * into a;
    insert into public.asset_eventi (asset_id, evento, dettagli) values (a.id, 'Abbinato', 'Cespite ' || a.cespite || ' · ' || a.utente);
    v_n := v_n + 1;
  end loop;
  perform public.registra('trasporti', 'Asset', v_n || ' telefoni abbinati a cespite e utente', null, 'Manuale', 'asset', null);
  return v_n;
end $$;

-- uscita dei telefoni preparati per utente: escono con la bolla, si tolgono dal bancale
create or replace function public.spedisci_asset(p_imei text[], p_bolla text) returns integer
language plpgsql security definer set search_path = public as $$
declare bo public.bolle; a public.asset; v_err text[] := '{}'; v_n int := 0; v_i text;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino', 'traffico', 'bolle')) then raise exception 'Non autorizzato'; end if;
  select * into bo from public.bolle where numero = trim(p_bolla);
  if bo.id is null then raise exception 'Bolla % non trovata', p_bolla; end if;
  if bo.stato not in ('Nuova', 'Confermata', 'In giro') then raise exception 'La bolla % è «%»: serve una bolla aperta', p_bolla, bo.stato; end if;
  foreach v_i in array coalesce(p_imei, '{}') loop
    select * into a from public.asset where imei = trim(v_i);
    if a.id is null then v_err := v_err || ('IMEI ' || v_i || ' sconosciuto');
    elsif a.stato not in ('Abbinato', 'Rientrato') or a.cespite is null then v_err := v_err || ('IMEI ' || v_i || ' non è abbinato a cespite e utente');
    elsif a.cliente_id <> bo.cliente_id then v_err := v_err || ('IMEI ' || v_i || ' è di un altro cliente');
    end if;
  end loop;
  if cardinality(coalesce(p_imei, '{}')) = 0 then raise exception 'Scegli i telefoni da spedire'; end if;
  if cardinality(v_err) > 0 then raise exception 'Niente spedito: %', array_to_string(v_err[1:5], '; '); end if;
  foreach v_i in array p_imei loop
    update public.asset set stato = 'Spedito', spedito_il = now(), bolla_id = bo.id where imei = trim(v_i) returning * into a;
    update public.contenuto set codici = array_remove(codici, a.imei), quantita = greatest(0, quantita - 1), da = auth.uid()
     where bancale_id = a.bancale_id and a.imei = any(codici);
    insert into public.asset_eventi (asset_id, evento, dettagli) values (a.id, 'Spedito', 'Bolla ' || bo.numero || coalesce(' · ' || a.utente, ''));
    v_n := v_n + 1;
  end loop;
  perform public.registra('trasporti', 'Asset', v_n || ' telefoni spediti con la bolla ' || bo.numero, null, 'Manuale', 'bolle', bo.id::text);
  return v_n;
end $$;

-- il file del cliente: tutti i suoi asset (IMEI; cespite; utente; …), live o salvato ogni sera
create or replace function public.asset_csv(p_cliente uuid) returns text
language sql stable security definer set search_path = public as $$
  select 'IMEI;Marca;Modello;Cespite;Utente;Sede;Accessori;Stato;Bancale;Bolla;Entrato;Spedito' || chr(10) ||
         coalesce(string_agg(concat_ws(';', a.imei, a.marca, a.modello, a.cespite, a.utente, a.sede, array_to_string(a.accessori, ','), a.stato,
                                         b.codice, bo.numero, to_char(a.entrato_il at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'),
                                         to_char(a.spedito_il at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI')), chr(10) order by a.entrato_il, a.imei), '')
    from public.asset a left join public.bancali b on b.id = a.bancale_id left join public.bolle bo on bo.id = a.bolla_id
   where a.cliente_id = p_cliente and public.vede_asset(p_cliente)
$$;
create or replace function public.salva_file_asset() returns integer
language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
  if auth.uid() is not null then raise exception 'Lo prepara il sistema ogni sera'; end if;
  for c in select id from public.clienti where traccia_asset loop
    insert into public.asset_file (cliente_id, giorno, righe, csv)
    select c.id, public.oggi(), (select count(*) from public.asset where cliente_id = c.id),
           'IMEI;Marca;Modello;Cespite;Utente;Sede;Accessori;Stato;Bancale;Bolla;Entrato;Spedito' || chr(10) ||
           coalesce((select string_agg(concat_ws(';', a.imei, a.marca, a.modello, a.cespite, a.utente, a.sede, array_to_string(a.accessori, ','), a.stato,
                                         b.codice, bo.numero, to_char(a.entrato_il at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'),
                                         to_char(a.spedito_il at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI')), chr(10) order by a.entrato_il, a.imei)
                       from public.asset a left join public.bancali b on b.id = a.bancale_id left join public.bolle bo on bo.id = a.bolla_id
                      where a.cliente_id = c.id), '')
    on conflict (cliente_id, giorno) do update set righe = excluded.righe, csv = excluded.csv, creato_il = now();
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.salva_file_asset() from public, anon, authenticated;
revoke execute on function public.abbina_asset(jsonb), public.spedisci_asset(text[], text), public.asset_csv(uuid) from public, anon;
grant execute on function public.abbina_asset(jsonb), public.spedisci_asset(text[], text), public.asset_csv(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('messina-file-asset', '55 21 * * *', $c$select public.salva_file_asset()$c$);   -- 23:55 in Italia (ora legale), 22:55 d'inverno
  else
    raise notice 'pg_cron non presente: il file serale degli asset va attivato dopo (docs/SETUP.md)';
  end if;
end $$;
