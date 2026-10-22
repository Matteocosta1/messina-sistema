-- =====================================================================
-- Preventivi (Autotrasporti) e richieste delle aziende (Corporation)
--  · preventivo: modello (Distribuzione, Spedizioni a peso, Mezzo dedicato a km, Logistica) e righe come le tariffe
--    cliente nuovo o prezzo sotto il listino → prima la Direzione; valido 30 giorni dall'invio
--    accettato (con la risposta del cliente allegata) → il potenziale diventa cliente e le righe diventano
--    le sue tariffe da un giorno: le tariffe di prima smettono di valere il giorno prima
--  · richieste dal sito «Preventivo» → preventivo in bozza; il potenziale cliente si crea da solo
--  · Corporation: richieste dal negozio (sezione Aziende) o a mano; assegnate a chi delle Vendite ne ha meno;
--    dopo 4 ore senza preventivo scatta il sollecito; non si chiude finché il preventivo non è partito
-- =====================================================================

-- ------------------------------------------------------------------ Preventivi
create sequence if not exists public.numero_preventivo_seq;
create table if not exists public.preventivi (
  id            uuid primary key default gen_random_uuid(),
  numero        text unique,
  cliente_id    uuid not null references public.clienti(id),
  modello       text not null default 'Distribuzione' check (modello in ('Distribuzione', 'Spedizioni a peso', 'Mezzo dedicato a km', 'Logistica')),
  richiesta     text,                       -- cosa chiede il cliente
  origine       text not null default 'Manuale' check (origine in ('Sito', 'Mail', 'Telefono', 'Manuale')),
  mail_id       uuid references public.mail(id),
  stato         text not null default 'Bozza' check (stato in ('Bozza', 'Da approvare', 'Approvato', 'Inviato', 'Accettato', 'Rifiutato')),
  motivo        text,                       -- perché aspetta la Direzione, o perché rifiutato
  valido_fino   date,
  tariffe_dal   date,
  risposta      text,                       -- documento con l'accettazione del cliente (storage: documenti/preventivi/...)
  creato_da     uuid references public.profili(id) default auth.uid(),
  creato_il     timestamptz not null default now(),
  approvato_da  uuid references public.profili(id),
  inviato_il    timestamptz,
  chiuso_il     timestamptz
);
create table if not exists public.preventivi_righe (
  id            uuid primary key default gen_random_uuid(),
  preventivo_id uuid not null references public.preventivi(id) on delete cascade,
  voce          text not null,
  unita         public.unita_tariffa not null,
  prezzo        numeric(10, 2) not null check (prezzo >= 0),
  minimo        numeric(10, 2),
  zona          text,
  scaglione_su  text check (scaglione_su in ('peso', 'colli', 'km')),
  scaglione_da  numeric(12, 2),
  scaglione_a   numeric(12, 2),
  quando        text
);
alter table public.preventivi enable row level security;
alter table public.preventivi_righe enable row level security;
create policy preventivi_lettura on public.preventivi for select to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('commerciale'));
create policy preventivi_nuovo on public.preventivi for insert to authenticated
  with check (public.staff_di('trasporti') and public.ha_ruolo('commerciale') and stato = 'Bozza');
create policy preventivi_modifica on public.preventivi for update to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('commerciale') and stato = 'Bozza')
  with check (public.staff_di('trasporti') and public.ha_ruolo('commerciale') and stato = 'Bozza');
create policy righe_prev_lettura on public.preventivi_righe for select to authenticated
  using (exists (select 1 from public.preventivi p where p.id = preventivo_id));
create policy righe_prev_scrittura on public.preventivi_righe for all to authenticated
  using (exists (select 1 from public.preventivi p where p.id = preventivo_id and p.stato = 'Bozza' and public.staff_di('trasporti') and public.ha_ruolo('commerciale')))
  with check (exists (select 1 from public.preventivi p where p.id = preventivo_id and p.stato = 'Bozza' and public.staff_di('trasporti') and public.ha_ruolo('commerciale')));
grant select, insert, update on public.preventivi to authenticated;
grant select, insert, update, delete on public.preventivi_righe to authenticated;
create policy doppio_fattore on public.preventivi as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy doppio_fattore on public.preventivi_righe as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

-- in bozza si cambia tutto tranne stato e date (quelle le scrivono le funzioni qui sotto)
create or replace function public.preventivi_regole() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.numero := 'P' || to_char(public.oggi(), 'YY') || '-' || lpad(nextval('public.numero_preventivo_seq')::text, 4, '0');
    if auth.uid() is not null then new.stato := 'Bozza'; new.inviato_il := null; new.valido_fino := null; new.approvato_da := null; end if;
    if not exists (select 1 from public.clienti where id = new.cliente_id and azienda = 'trasporti') then raise exception 'Il preventivo è per un cliente dei Trasporti'; end if;
    return new;
  end if;
  if coalesce(current_setting('messina.preventivo', true), '') <> 'si' and auth.uid() is not null
     and (new.stato, new.inviato_il, new.valido_fino, new.approvato_da, new.tariffe_dal, new.chiuso_il, new.numero)
         is distinct from (old.stato, old.inviato_il, old.valido_fino, old.approvato_da, old.tariffe_dal, old.chiuso_il, old.numero) then
    raise exception 'Lo stato del preventivo si cambia con i tasti';
  end if;
  return new;
end $$;
drop trigger if exists preventivi_regole on public.preventivi;
create trigger preventivi_regole before insert or update on public.preventivi
  for each row execute function public.preventivi_regole();

create or replace function public.preventivo_stato(p_id uuid, p_stato text, p_extra jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('messina.preventivo', 'si', true);
  update public.preventivi set stato = p_stato,
    motivo = case when p_extra ? 'motivo' then p_extra->>'motivo' else motivo end,
    approvato_da = case when p_extra ? 'approvato_da' then (p_extra->>'approvato_da')::uuid else approvato_da end,
    inviato_il = case when p_extra ? 'inviato_il' then (p_extra->>'inviato_il')::timestamptz else inviato_il end,
    valido_fino = case when p_extra ? 'valido_fino' then (p_extra->>'valido_fino')::date else valido_fino end,
    tariffe_dal = case when p_extra ? 'tariffe_dal' then (p_extra->>'tariffe_dal')::date else tariffe_dal end,
    risposta = case when p_extra ? 'risposta' then p_extra->>'risposta' else risposta end,
    chiuso_il = case when p_extra ? 'chiuso_il' then (p_extra->>'chiuso_il')::timestamptz else chiuso_il end
   where id = p_id;
  perform set_config('messina.preventivo', '', true);
end $$;
revoke execute on function public.preventivo_stato(uuid, text, jsonb) from public, anon, authenticated;

-- «Invia»: se serve passa dalla Direzione, altrimenti è pronto per la mail al cliente
create or replace function public.invia_preventivo(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare p public.preventivi; c public.clienti; v_sotto text;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('commerciale')) then raise exception 'I preventivi li fa il commerciale'; end if;
  select * into p from public.preventivi where id = p_id for update;
  if p.id is null or p.stato <> 'Bozza' then raise exception 'Si invia solo un preventivo in bozza'; end if;
  if not exists (select 1 from public.preventivi_righe where preventivo_id = p.id) then raise exception 'Il preventivo non ha prezzi'; end if;
  select * into c from public.clienti where id = p.cliente_id;
  select string_agg(r.voce || ' ' || r.prezzo || ' € (listino ' || l.prezzo || ' €)', ', ') into v_sotto
    from public.preventivi_righe r join public.listino l on l.voce = r.voce and l.unita = r.unita
         and (l.zona is null or lower(l.zona) = lower(coalesce(r.zona, ''))) and coalesce(l.scaglione_da, -1) = coalesce(r.scaglione_da, -1)
   where r.preventivo_id = p.id and r.prezzo < l.prezzo;
  if public.mio_ruolo() <> 'direzione' and (c.stato = 'Potenziale' or v_sotto is not null) then
    perform public.preventivo_stato(p.id, 'Da approvare', jsonb_build_object('motivo',
      concat_ws('; ', case when c.stato = 'Potenziale' then 'Cliente nuovo' end, case when v_sotto is not null then 'Sotto il listino: ' || v_sotto end)));
    perform public.registra('trasporti', 'Preventivi', p.numero || ' · ' || c.nome || ' · alla Direzione', null, 'Manuale', 'preventivi', p.id::text);
    return 'Da approvare';
  end if;
  perform public.preventivo_stato(p.id, 'Approvato', jsonb_build_object('approvato_da', auth.uid(), 'motivo', null));
  return 'Approvato';
end $$;

create or replace function public.approva_preventivo(p_id uuid, p_ok boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare p public.preventivi;
begin
  if not (public.staff_di('trasporti') and public.mio_ruolo() = 'direzione') then raise exception 'Approva solo la Direzione'; end if;
  select * into p from public.preventivi where id = p_id for update;
  if p.id is null or p.stato <> 'Da approvare' then raise exception 'Niente da approvare'; end if;
  if not p_ok and coalesce(trim(p_motivo), '') = '' then raise exception 'Scrivi al commerciale cosa cambiare'; end if;
  perform public.preventivo_stato(p.id, case when p_ok then 'Approvato' else 'Bozza' end,
    jsonb_build_object('approvato_da', case when p_ok then auth.uid() end, 'motivo', case when p_ok then null else trim(p_motivo) end));
  perform public.registra('trasporti', 'Preventivi', p.numero || case when p_ok then ' approvato' else ' da rivedere: ' || trim(p_motivo) end,
                          null, 'Manuale', 'preventivi', p.id::text);
end $$;

-- dopo la mail al cliente: inviato, valido 30 giorni
create or replace function public.preventivo_inviato(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.preventivi;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('commerciale')) then raise exception 'Non autorizzato'; end if;
  select * into p from public.preventivi where id = p_id for update;
  if p.id is null or p.stato <> 'Approvato' then raise exception 'Il preventivo non è ancora approvato'; end if;
  perform public.preventivo_stato(p.id, 'Inviato', jsonb_build_object('inviato_il', now(), 'valido_fino', public.oggi() + 30));
  perform public.registra('trasporti', 'Preventivi', p.numero || ' inviato al cliente', null, 'Manuale', 'preventivi', p.id::text);
end $$;

-- accettato: il potenziale diventa cliente e i prezzi diventano le sue tariffe dal giorno scelto
create or replace function public.accetta_preventivo(p_id uuid, p_risposta text, p_dal date) returns void
language plpgsql security definer set search_path = public as $$
declare p public.preventivi; r public.preventivi_righe; v_id uuid;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('commerciale')) then raise exception 'Non autorizzato'; end if;
  select * into p from public.preventivi where id = p_id for update;
  if p.id is null or p.stato <> 'Inviato' then raise exception 'Si accetta solo un preventivo inviato'; end if;
  if p.valido_fino < public.oggi() then raise exception 'Preventivo scaduto il %: rifallo con i prezzi di oggi', to_char(p.valido_fino, 'DD/MM'); end if;
  if coalesce(trim(p_risposta), '') = '' then raise exception 'Allega la risposta del cliente (mail o documento firmato)'; end if;
  if p_dal is null or p_dal < public.oggi() then raise exception 'Le tariffe nuove valgono da oggi in poi'; end if;
  update public.clienti set stato = 'Attivo' where id = p.cliente_id and stato = 'Potenziale';
  -- le tariffe di prima smettono di valere il giorno prima
  update public.tariffe set valida_al = p_dal - 1
   where cliente_id = p.cliente_id and stato = 'Attiva' and valida_dal < p_dal and (valida_al is null or valida_al >= p_dal);
  update public.tariffe set stato = 'Rifiutata', motivo = 'Sostituita dal preventivo ' || p.numero
   where cliente_id = p.cliente_id and stato in ('Attiva', 'Da approvare') and valida_dal >= p_dal;
  for r in select * from public.preventivi_righe where preventivo_id = p.id loop
    insert into public.tariffe (cliente_id, voce, unita, prezzo, minimo, zona, quando, scaglione_su, scaglione_da, scaglione_a,
                                valida_dal, stato, creata_da, approvata_da, motivo)
    values (p.cliente_id, r.voce, r.unita, r.prezzo, r.minimo, r.zona, r.quando, r.scaglione_su, r.scaglione_da, r.scaglione_a,
            p_dal, 'Attiva', p.creato_da, p.approvato_da, null);
  end loop;
  perform public.preventivo_stato(p.id, 'Accettato', jsonb_build_object('risposta', trim(p_risposta), 'tariffe_dal', p_dal, 'chiuso_il', now()));
  perform public.registra('trasporti', 'Preventivi', p.numero || ' accettato: tariffe dal ' || to_char(p_dal, 'DD/MM'), null, 'Manuale', 'preventivi', p.id::text);
end $$;

create or replace function public.rifiuta_preventivo(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.preventivi;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('commerciale')) then raise exception 'Non autorizzato'; end if;
  select * into p from public.preventivi where id = p_id for update;
  if p.id is null or p.stato not in ('Inviato', 'Approvato', 'Bozza', 'Da approvare') then raise exception 'Preventivo già chiuso'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Scrivi perché il cliente ha detto no'; end if;
  perform public.preventivo_stato(p.id, 'Rifiutato', jsonb_build_object('motivo', trim(p_motivo), 'chiuso_il', now()));
  perform public.registra('trasporti', 'Preventivi', p.numero || ' rifiutato: ' || trim(p_motivo), null, 'Manuale', 'preventivi', p.id::text);
end $$;

-- un potenziale cliente: si scrive in Clienti come «Potenziale», nessuna tariffa finché non accetta
create or replace function public.nuovo_potenziale(p_nome text, p_email text, p_telefono text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is not null and not (public.staff_di('trasporti') and public.ha_ruolo('commerciale')) then raise exception 'Non autorizzato'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Serve il nome'; end if;
  select id into v from public.clienti where azienda = 'trasporti' and (lower(email) = lower(trim(p_email)) or lower(nome) = lower(trim(p_nome))) limit 1;
  if v is null then
    insert into public.clienti (azienda, nome, email, telefono, stato) values ('trasporti', trim(p_nome), nullif(lower(trim(p_email)), ''), nullif(trim(p_telefono), ''), 'Potenziale')
    returning id into v;
  end if;
  return v;
end $$;

-- dal sito: preventivo in bozza per il commerciale (solo la funzione richiesta-sito, con la chiave di servizio)
create or replace function public.preventivo_da_sito(p_nome text, p_email text, p_telefono text, p_richiesta text, p_mail uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_c uuid; v_p uuid;
begin
  if auth.uid() is not null then raise exception 'Solo dal sito'; end if;
  v_c := public.nuovo_potenziale(p_nome, p_email, p_telefono);
  insert into public.preventivi (cliente_id, richiesta, origine, mail_id) values (v_c, p_richiesta, 'Sito', p_mail) returning id into v_p;
  return v_p;
end $$;

revoke execute on function public.invia_preventivo(uuid), public.approva_preventivo(uuid, boolean, text), public.preventivo_inviato(uuid),
  public.accetta_preventivo(uuid, text, date), public.rifiuta_preventivo(uuid, text), public.nuovo_potenziale(text, text, text) from public, anon;
grant execute on function public.invia_preventivo(uuid), public.approva_preventivo(uuid, boolean, text), public.preventivo_inviato(uuid),
  public.accetta_preventivo(uuid, text, date), public.rifiuta_preventivo(uuid, text), public.nuovo_potenziale(text, text, text) to authenticated;
revoke execute on function public.preventivo_da_sito(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.preventivo_da_sito(text, text, text, text, uuid) to service_role;

-- i potenziali non si fatturano e non ricevono bolle
create or replace function public.cliente_attivo_per_bolla() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.clienti where id = new.cliente_id and stato = 'Potenziale') then
    raise exception 'Cliente ancora potenziale: prima si accetta il preventivo';
  end if;
  return new;
end $$;
drop trigger if exists cliente_attivo_per_bolla on public.bolle;
create trigger cliente_attivo_per_bolla before insert on public.bolle
  for each row execute function public.cliente_attivo_per_bolla();

-- ------------------------------------------------------------------ Corporation: richieste delle aziende
create sequence if not exists public.numero_richiesta_seq;
create table if not exists public.richieste_aziende (
  id              uuid primary key default gen_random_uuid(),
  numero          text unique,
  azienda_cliente text not null,              -- chi chiede (azienda)
  referente       text,
  email           text,
  telefono        text,
  modello         text not null,
  grado           text check (grado in ('A', 'B', 'C', 'D', 'Indifferente')),
  quantita        integer not null check (quantita > 0),
  note            text,
  origine         text not null default 'Negozio' check (origine in ('Negozio', 'Mail', 'WhatsApp', 'Telefono')),
  stato           text not null default 'Aperta' check (stato in ('Aperta', 'Preventivo inviato', 'Vinta', 'Persa')),
  assegnata_a     uuid references public.profili(id),
  creata_il       timestamptz not null default now(),
  preventivo_il   timestamptz,
  preventivo_eur  numeric(12, 2),
  chiusa_il       timestamptz,
  esito           text
);
alter table public.richieste_aziende enable row level security;
create policy richieste_lettura on public.richieste_aziende for select to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite'));
create policy richieste_nuova on public.richieste_aziende for insert to authenticated
  with check (public.staff_di('corporation') and public.ha_ruolo('vendite') and stato = 'Aperta');
create policy richieste_modifica on public.richieste_aziende for update to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite'))
  with check (public.staff_di('corporation') and public.ha_ruolo('vendite'));
grant select, insert, update on public.richieste_aziende to authenticated;
create policy doppio_fattore on public.richieste_aziende as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

-- assegnata a chi delle Vendite ha meno richieste aperte; stato e date solo con le funzioni
create or replace function public.richieste_aziende_regole() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.numero := 'R' || to_char(public.oggi(), 'YY') || '-' || lpad(nextval('public.numero_richiesta_seq')::text, 4, '0');
    new.stato := 'Aperta'; new.preventivo_il := null; new.chiusa_il := null;
    if new.assegnata_a is null or auth.uid() is not null and public.mio_ruolo() <> 'direzione' then
      select p.id into new.assegnata_a from public.profili p
       where p.azienda = 'corporation' and p.ruolo = 'vendite' and p.attivo
       order by (select count(*) from public.richieste_aziende r where r.assegnata_a = p.id and r.stato = 'Aperta'), p.nome
       limit 1;
    end if;
    return new;
  end if;
  if coalesce(current_setting('messina.richiesta', true), '') <> 'si' and auth.uid() is not null
     and (new.stato, new.preventivo_il, new.preventivo_eur, new.chiusa_il, new.numero, new.creata_il) is distinct from
         (old.stato, old.preventivo_il, old.preventivo_eur, old.chiusa_il, old.numero, old.creata_il) then
    raise exception 'Lo stato della richiesta si cambia con i tasti';
  end if;
  return new;
end $$;
drop trigger if exists richieste_aziende_regole on public.richieste_aziende;
create trigger richieste_aziende_regole before insert or update on public.richieste_aziende
  for each row execute function public.richieste_aziende_regole();

create or replace function public.richiesta_preventivo_inviato(p_id uuid, p_importo numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.staff_di('corporation') and public.ha_ruolo('vendite')) then raise exception 'Non autorizzato'; end if;
  if p_importo is null or p_importo <= 0 then raise exception 'Scrivi l''importo del preventivo'; end if;
  perform set_config('messina.richiesta', 'si', true);
  update public.richieste_aziende set stato = 'Preventivo inviato', preventivo_il = now(), preventivo_eur = p_importo
   where id = p_id and stato in ('Aperta', 'Preventivo inviato');
  if not found then raise exception 'Richiesta già chiusa'; end if;
  perform set_config('messina.richiesta', '', true);
  perform public.registra('corporation', 'Richieste', 'Preventivo ' || p_importo || ' € inviato', null, 'Manuale', 'richieste_aziende', p_id::text);
end $$;

create or replace function public.chiudi_richiesta(p_id uuid, p_vinta boolean, p_esito text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.richieste_aziende;
begin
  if not (public.staff_di('corporation') and public.ha_ruolo('vendite')) then raise exception 'Non autorizzato'; end if;
  select * into r from public.richieste_aziende where id = p_id for update;
  if r.id is null or r.stato in ('Vinta', 'Persa') then raise exception 'Richiesta già chiusa'; end if;
  if r.preventivo_il is null then raise exception 'Prima si manda il preventivo: una richiesta non si chiude senza risposta'; end if;
  if not p_vinta and coalesce(trim(p_esito), '') = '' then raise exception 'Scrivi perché è persa'; end if;
  perform set_config('messina.richiesta', 'si', true);
  update public.richieste_aziende set stato = case when p_vinta then 'Vinta' else 'Persa' end, chiusa_il = now(), esito = nullif(trim(p_esito), '') where id = r.id;
  perform set_config('messina.richiesta', '', true);
  perform public.registra('corporation', 'Richieste', r.numero || case when p_vinta then ' vinta' else ' persa: ' || trim(p_esito) end, null, 'Manuale', 'richieste_aziende', r.id::text);
end $$;

-- dal negozio (sezione Aziende): solo la funzione richiesta-sito, con la chiave di servizio
create or replace function public.richiesta_da_negozio(p_azienda text, p_referente text, p_email text, p_telefono text,
  p_modello text, p_grado text, p_quantita integer, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is not null then raise exception 'Solo dal negozio'; end if;
  insert into public.richieste_aziende (azienda_cliente, referente, email, telefono, modello, grado, quantita, note, origine)
  values (p_azienda, p_referente, p_email, p_telefono, p_modello, coalesce(nullif(p_grado, ''), 'Indifferente'), p_quantita, p_note, 'Negozio')
  returning id into v;
  return v;
end $$;

-- sollecito: dopo 4 ore senza preventivo la richiesta compare in evidenza nella Home della Corporation
create or replace view public.richieste_da_sollecitare with (security_invoker = true) as
  select r.*, p.nome as assegnata_nome from public.richieste_aziende r left join public.profili p on p.id = r.assegnata_a
   where r.stato = 'Aperta' and r.creata_il < now() - interval '4 hours';
grant select on public.richieste_da_sollecitare to authenticated;

revoke execute on function public.richiesta_preventivo_inviato(uuid, numeric), public.chiudi_richiesta(uuid, boolean, text) from public, anon;
grant execute on function public.richiesta_preventivo_inviato(uuid, numeric), public.chiudi_richiesta(uuid, boolean, text) to authenticated;
revoke execute on function public.richiesta_da_negozio(text, text, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.richiesta_da_negozio(text, text, text, text, text, text, integer, text) to service_role;

-- ------------------------------------------------------------------ Documenti: risposte dei clienti ai preventivi
--            preventivi/<preventivo>/…  accettazione del cliente (commerciale dei Trasporti)
create or replace function public.documento_leggibile(p_nome text) returns boolean
language sql stable security definer set search_path = public as $$
  select case (string_to_array(p_nome, '/'))[1]
    when 'mail' then public.staff_di((string_to_array(p_nome, '/'))[2])
                     and public.ha_ruolo('amministrazione', 'commerciale', 'bolle', 'traffico', 'vendite', 'stage')
    when 'fatture' then public.staff_di((string_to_array(p_nome, '/'))[2]) and public.ha_ruolo('amministrazione')
    when 'etichette' then public.staff_di('corporation') and public.ha_ruolo('vendite', 'magazzino')
    when 'lotti' then public.staff_di('corporation') and public.ha_ruolo('vendite', 'amministrazione')
    when 'contratti' then exists (select 1 from public.clienti c
                                  where c.id::text = split_part((string_to_array(p_nome, '/'))[2], '.', 1)
                                    and public.staff_di(c.azienda) and public.ha_ruolo('amministrazione', 'commerciale'))
    when 'preventivi' then public.staff_di('trasporti') and public.ha_ruolo('commerciale')
    else false end
$$;
create or replace function public.documento_scrivibile(p_nome text) returns boolean
language sql stable security definer set search_path = public as $$
  select case (string_to_array(p_nome, '/'))[1]
    when 'lotti' then public.staff_di('corporation') and public.ha_ruolo('vendite', 'amministrazione')
    when 'contratti' then public.documento_leggibile(p_nome)
    when 'preventivi' then public.staff_di('trasporti') and public.ha_ruolo('commerciale')
    else false end   -- mail, fatture, etichette: solo le Edge Functions (service_role)
$$;
