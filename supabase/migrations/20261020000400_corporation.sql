-- =====================================================================
-- Messina Corporation: lotti, device (PC e telefoni), vendite sui siti,
-- ordini, stage computer e stage cellulari.
-- =====================================================================

create table public.lotti (
  id          uuid primary key default gen_random_uuid(),
  codice      text not null unique,          -- L-015
  fornitore   text,
  acquistato_il date not null,
  pezzi       integer not null check (pezzi >= 0),
  costo       numeric(12, 2) not null check (costo >= 0),
  fattura     text,                          -- percorso nello storage
  ddt         text,
  note        text
);

create type public.stato_device as enum ('Disponibile', 'Venduto', 'Fermo', 'Reso', 'In carico');

create table public.device (
  id          uuid primary key default gen_random_uuid(),
  seriale     text not null unique,          -- seriale del PC o IMEI del telefono
  tipo        text not null default 'PC' check (tipo in ('PC', 'Telefono', 'Tablet', 'Monitor', 'Altro')),
  marca       text,
  modello     text,
  cpu         text,
  gpu         text,
  ram         text,
  disco       text,
  schermo     text,
  grado       text check (grado in ('A', 'B', 'C', 'D')),
  difetti     text[] not null default '{}',
  lotto_id    uuid references public.lotti(id),
  bancale_id  uuid references public.bancali(id),
  costo       numeric(10, 2),                -- quota del lotto
  prezzo      numeric(10, 2),
  prezzo_minimo numeric(10, 2),
  prezzo_confermato_da uuid references public.profili(id), -- Matteo conferma ogni prezzo
  stato       public.stato_device not null default 'In carico',
  siti        text[] not null default '{}',  -- Back Market, Refurbed, eBay, Subito, Amazon, Sito
  foto        text[] not null default '{}',
  caricato_il timestamptz not null default now(),
  caricato_da uuid references public.profili(id),
  check (prezzo is null or prezzo_minimo is null or prezzo >= prezzo_minimo)
);
create index device_lotto on public.device (lotto_id);
create index device_stato on public.device (stato);

-- Entrate: un device non va in vendita senza bancale (la regola dell'app)
create or replace function public.device_regole() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'Disponibile' and new.bancale_id is null then
    raise exception 'Il device non si conferma senza bancale';
  end if;
  if new.stato = 'Disponibile' and (new.prezzo is null or new.grado is null) then
    raise exception 'Servono grado e prezzo';
  end if;
  return new;
end $$;
create trigger device_regole before insert or update on public.device
  for each row execute function public.device_regole();

create table public.vendite (
  id          uuid primary key default gen_random_uuid(),
  device_id   uuid not null unique references public.device(id),  -- un device si vende una volta
  canale      text not null,                  -- Back Market, eBay, Di persona, ...
  prezzo      numeric(10, 2) not null,
  commissione numeric(10, 2) not null default 0,
  incassato   numeric(10, 2) generated always as (prezzo - commissione) stored,
  venduto_il  timestamptz not null default now(),
  ordine_id   uuid
);

-- venduto su un sito: il device sparisce dagli altri
create or replace function public.vendita_chiude_device() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.device set stato = 'Venduto', siti = array[new.canale] where id = new.device_id;
  return new;
end $$;
create trigger vendita_chiude_device after insert on public.vendite
  for each row execute function public.vendita_chiude_device();

create table public.ordini (
  id          uuid primary key default gen_random_uuid(),
  canale      text not null,
  riferimento text,                            -- numero ordine sul sito
  cliente     text,
  indirizzo   text,
  stato       text not null default 'Da preparare' check (stato in ('Da preparare', 'Pronto', 'Spedito', 'Annullato')),
  entro       timestamptz,
  creato_il   timestamptz not null default now()
);
alter table public.vendite add constraint vendite_ordine foreign key (ordine_id) references public.ordini(id);

-- Stage computer: formattazione per Accenture / Econocom / Asystel -------
create table public.stage_pc (
  id          uuid primary key default gen_random_uuid(),
  seriale     text not null,
  cliente_id  uuid references public.clienti(id),
  postazione  integer,
  esito       text not null default 'In corso' check (esito in ('Ricevuto', 'In corso', 'Formattato', 'Fallito', 'In vendita')),
  certificato text,                            -- certificato di cancellazione dati
  iniziato_il timestamptz not null default now(),
  finito_il   timestamptz
);

-- Stage cellulari: Reset, Sblocco, Ticket, Chiuso ----------------------------
create type public.stato_telefono as enum ('Reset', 'Sblocco', 'Ticket', 'Chiuso');

create table public.stage_telefoni (
  id          uuid primary key default gen_random_uuid(),
  imei        text not null,
  marca       text,
  modello     text,
  cliente_id  uuid references public.clienti(id),
  ticket      text,
  reset_fatto boolean not null default false,
  sblocco_fatto boolean not null default false,  -- account iCloud/Google e MDM tolti (Habble)
  ticket_chiuso boolean not null default false,
  operatore   uuid references public.profili(id),
  stato       public.stato_telefono generated always as (
    case when not reset_fatto then 'Reset'::public.stato_telefono
         when not sblocco_fatto then 'Sblocco'::public.stato_telefono
         when not ticket_chiuso then 'Ticket'::public.stato_telefono
         else 'Chiuso'::public.stato_telefono end) stored,
  ricevuto_il timestamptz not null default now()
);

-- Lotti con incassato finora e percentuale recuperata -----------------------
create or replace view public.lotti_conti with (security_invoker = true) as
select l.id, l.codice, l.acquistato_il, l.pezzi, l.costo,
       count(v.id) as venduti,
       coalesce(sum(v.incassato), 0) as incassato,
       case when l.costo > 0 then round(coalesce(sum(v.incassato), 0) / l.costo * 100, 1) else 0 end as recuperato_pct
from public.lotti l
left join public.device d on d.lotto_id = l.id
left join public.vendite v on v.device_id = d.id
group by l.id;

create or replace view public.incassi_corporation with (security_invoker = true) as
select coalesce(sum(incassato) filter (where venduto_il::date = current_date), 0) as incassato_oggi,
       coalesce(sum(incassato) filter (where date_trunc('month', venduto_il) = date_trunc('month', now())), 0) as incassato_mese
from public.vendite;

-- RLS ----------------------------------------------------------------------
alter table public.lotti enable row level security;
alter table public.device enable row level security;
alter table public.vendite enable row level security;
alter table public.ordini enable row level security;
alter table public.stage_pc enable row level security;
alter table public.stage_telefoni enable row level security;

create policy lotti_lettura on public.lotti for select to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite', 'amministrazione'));
create policy lotti_scrittura on public.lotti for all to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite'))
  with check (public.staff_di('corporation') and public.ha_ruolo('vendite'));

create policy device_lettura on public.device for select to authenticated
  using (public.staff_di('corporation'));
create policy device_scrittura on public.device for all to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite', 'stage', 'magazzino'))
  with check (public.staff_di('corporation') and public.ha_ruolo('vendite', 'stage', 'magazzino'));

create policy vendite_lettura on public.vendite for select to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite', 'amministrazione'));
create policy vendite_scrittura on public.vendite for insert to authenticated
  with check (public.staff_di('corporation') and public.ha_ruolo('vendite'));

create policy ordini_lettura on public.ordini for select to authenticated using (public.staff_di('corporation'));
create policy ordini_scrittura on public.ordini for all to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite', 'magazzino'))
  with check (public.staff_di('corporation') and public.ha_ruolo('vendite', 'magazzino'));

create policy stage_pc_lettura on public.stage_pc for select to authenticated using (public.staff_di('corporation'));
create policy stage_pc_scrittura on public.stage_pc for all to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('stage'))
  with check (public.staff_di('corporation') and public.ha_ruolo('stage'));

create policy stage_tel_lettura on public.stage_telefoni for select to authenticated using (public.staff_di('corporation'));
create policy stage_tel_scrittura on public.stage_telefoni for all to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('stage'))
  with check (public.staff_di('corporation') and public.ha_ruolo('stage'));

grant select, insert, update, delete on public.lotti, public.device, public.ordini, public.stage_pc, public.stage_telefoni to authenticated;
grant select, insert on public.vendite to authenticated;
grant select on public.lotti_conti, public.incassi_corporation to authenticated;
