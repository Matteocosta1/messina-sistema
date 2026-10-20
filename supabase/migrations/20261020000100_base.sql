-- =====================================================================
-- Messina · base: società, persone, ruoli, funzioni di permesso, storico
-- Regola generale: ogni tabella ha RLS attivo. Nessuno vede dati di
-- un'altra società, i clienti vedono solo i loro, e lo storico non si
-- può né modificare né cancellare.
-- =====================================================================

create extension if not exists pgcrypto;

-- Le due società ----------------------------------------------------------
create table public.aziende (
  id   text primary key check (id in ('trasporti', 'corporation')),
  nome text not null
);
insert into public.aziende (id, nome) values
  ('trasporti', 'Messina Autotrasporti'),
  ('corporation', 'Messina Corporation');

-- Ruoli ------------------------------------------------------------------
create type public.ruolo as enum (
  'direzione',       -- padre e chi decide: vede tutto della sua società
  'amministrazione', -- madre, Angela: fatture, presenze, stipendi
  'commerciale',     -- Gianluca: clienti, tariffe, preventivi
  'bolle',           -- Christian, Gabriele, Alberto, Anna
  'traffico',        -- Mauro, Nelson
  'magazzino',       -- magazzinieri e mulettisti
  'autista',
  'vendite',         -- Corporation: Matteo, Pier
  'stage',           -- Corporation: formattazione PC e telefoni
  'cliente'          -- utenti del portale clienti
);

-- Clienti (servono già qui: i profili dei clienti puntano al loro cliente)
create table public.clienti (
  id          uuid primary key default gen_random_uuid(),
  azienda     text not null references public.aziende(id),
  nome        text not null,
  piva        text,
  email       text,
  telefono    text,
  indirizzo   text,
  portale_live boolean not null default false, -- vede magazzino e seriali in tempo reale
  tramite     uuid references public.clienti(id), -- es. UniCredit tramite Econocom
  note        text,
  attivo      boolean not null default true,
  creato_il   timestamptz not null default now(),
  unique (azienda, nome)
);

-- Profili: una riga per ogni persona che entra nel sistema ----------------
create table public.profili (
  id         uuid primary key references auth.users(id) on delete cascade,
  azienda    text not null references public.aziende(id),
  ruolo      public.ruolo not null,
  nome       text not null,
  cliente_id uuid references public.clienti(id),
  attivo     boolean not null default true,
  creato_il  timestamptz not null default now(),
  check ((ruolo = 'cliente') = (cliente_id is not null))
);

-- Dipendenti: anche chi non ha un login (presenze, autisti, ferie) --------
create table public.dipendenti (
  id          uuid primary key default gen_random_uuid(),
  azienda     text not null references public.aziende(id),
  nome        text not null,
  mansione    text not null,
  assunto_da  text not null default 'Messina', -- molti sono assunti da un'altra società
  contratto   text,
  profilo_id  uuid unique references public.profili(id),
  attivo      boolean not null default true,
  creato_il   timestamptz not null default now()
);

-- Funzioni di permesso (security definer: leggono il profilo senza RLS) ----
create or replace function public.mio_profilo() returns public.profili
language sql stable security definer set search_path = public as $$
  select p.* from public.profili p where p.id = auth.uid() and p.attivo
$$;

create or replace function public.mia_azienda() returns text
language sql stable security definer set search_path = public as $$
  select azienda from public.profili where id = auth.uid() and attivo
$$;

create or replace function public.mio_ruolo() returns public.ruolo
language sql stable security definer set search_path = public as $$
  select ruolo from public.profili where id = auth.uid() and attivo
$$;

create or replace function public.mio_cliente() returns uuid
language sql stable security definer set search_path = public as $$
  select cliente_id from public.profili where id = auth.uid() and attivo and ruolo = 'cliente'
$$;

create or replace function public.mio_dipendente() returns uuid
language sql stable security definer set search_path = public as $$
  select d.id from public.dipendenti d join public.profili p on p.id = d.profilo_id
  where p.id = auth.uid() and p.attivo
$$;

-- vero se l'utente è staff (non cliente) della società indicata
create or replace function public.staff_di(p_azienda text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profili
                 where id = auth.uid() and attivo and ruolo <> 'cliente' and azienda = p_azienda)
$$;

-- vero se l'utente ha uno dei ruoli indicati (la direzione li ha tutti)
create or replace function public.ha_ruolo(variadic p_ruoli public.ruolo[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profili
                 where id = auth.uid() and attivo
                   and (ruolo = any(p_ruoli) or ruolo = 'direzione'))
$$;

-- Storico: ogni operazione, di chiunque, per sempre -----------------------
create table public.storico (
  id        bigint generated always as identity primary key,
  quando    timestamptz not null default now(),
  azienda   text not null references public.aziende(id),
  chi       uuid references public.profili(id),
  chi_nome  text,
  operazione text not null,   -- Entrata, Uscita, Trasferimento, Modifica, Blocco, Sblocco, ...
  cosa      text not null,
  dove      text,
  come      text check (come in ('Pistola', 'Manuale', 'Foto', 'Sistema')),
  oggetto   text,             -- tabella dell'oggetto
  oggetto_id text,
  dettagli  jsonb
);
create index storico_quando on public.storico (azienda, quando desc);

create or replace function public.storico_immutabile() returns trigger
language plpgsql as $$
begin
  raise exception 'Lo storico non si può modificare né cancellare';
end $$;
create trigger storico_no_update before update or delete on public.storico
  for each row execute function public.storico_immutabile();

-- scrive una riga di storico a nome dell'utente corrente
create or replace function public.registra(
  p_azienda text, p_operazione text, p_cosa text, p_dove text default null,
  p_come text default 'Sistema', p_oggetto text default null, p_oggetto_id text default null,
  p_dettagli jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- un utente scrive solo nello storico della sua società; i trigger di sistema
  -- (auth.uid() nullo, es. service_role) possono scrivere ovunque
  if auth.uid() is not null and not public.staff_di(p_azienda) then
    raise exception 'Non puoi scrivere nello storico di un''altra società';
  end if;
  insert into public.storico (azienda, chi, chi_nome, operazione, cosa, dove, come, oggetto, oggetto_id, dettagli)
  values (p_azienda, auth.uid(), (select nome from public.profili where id = auth.uid()),
          p_operazione, p_cosa, p_dove, p_come, p_oggetto, p_oggetto_id, p_dettagli);
end $$;

-- RLS ----------------------------------------------------------------------
alter table public.aziende   enable row level security;
alter table public.clienti   enable row level security;
alter table public.profili   enable row level security;
alter table public.dipendenti enable row level security;
alter table public.storico   enable row level security;

create policy aziende_lettura on public.aziende for select to authenticated using (true);

create policy clienti_staff on public.clienti for select to authenticated
  using (public.staff_di(azienda) or id = public.mio_cliente());
create policy clienti_scrittura on public.clienti for all to authenticated
  using (public.staff_di(azienda) and public.ha_ruolo('commerciale', 'amministrazione'))
  with check (public.staff_di(azienda) and public.ha_ruolo('commerciale', 'amministrazione'));

create policy profili_se_stesso on public.profili for select to authenticated
  using (id = auth.uid() or (public.staff_di(azienda) and public.ha_ruolo('amministrazione')));
-- i colleghi della stessa società si vedono (nome e ruolo, es. chi ha in carico una bolla)
create policy profili_colleghi on public.profili for select to authenticated
  using (public.staff_di(azienda));
-- i profili li crea solo la direzione o il sistema (service_role)
create policy profili_direzione on public.profili for all to authenticated
  using (public.staff_di(azienda) and public.mio_ruolo() = 'direzione')
  with check (public.staff_di(azienda) and public.mio_ruolo() = 'direzione');

create policy dipendenti_lettura on public.dipendenti for select to authenticated
  using (public.staff_di(azienda) and (public.ha_ruolo('amministrazione', 'traffico') or profilo_id = auth.uid()));
create policy dipendenti_scrittura on public.dipendenti for all to authenticated
  using (public.staff_di(azienda) and public.ha_ruolo('amministrazione'))
  with check (public.staff_di(azienda) and public.ha_ruolo('amministrazione'));

-- lo storico si legge dall'ufficio; si scrive solo con registra() o dai trigger
create policy storico_lettura on public.storico for select to authenticated
  using (public.staff_di(azienda) and public.ha_ruolo('amministrazione', 'magazzino', 'traffico', 'bolle', 'vendite'));

grant select on public.aziende to authenticated;
grant select, insert, update, delete on public.clienti, public.profili, public.dipendenti to authenticated;
grant select on public.storico to authenticated;
grant execute on function public.registra(text, text, text, text, text, text, text, jsonb) to authenticated;
