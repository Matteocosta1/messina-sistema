-- =====================================================================
-- Messina Autotrasporti: tariffe, mezzi, bolle, colli, giri, consegne,
-- giacenze, fatture, Telepass.
-- Regola delle chiusure: niente si chiude se i numeri non tornano
-- (bolla con dati mancanti, consegna senza foto o con colli non letti,
-- fattura non controllata). I controlli stanno nel database, non solo
-- nelle app: così valgono per qualsiasi programma che scrive i dati.
-- =====================================================================

-- Tariffe: ogni cliente ha le sue, voce per voce ---------------------------
create type public.unita_tariffa as enum ('spedizione', 'collo', 'bancale', 'kg', 'giorno', 'ora', 'percentuale', 'pezzo');

create table public.tariffe (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clienti(id) on delete cascade,
  voce        text not null,           -- Base, Sponda, Piano, Attesa, Sabato, Giacenza, Riconsegna, ...
  unita       public.unita_tariffa not null,
  prezzo      numeric(10, 2) not null check (prezzo >= 0),
  minimo      numeric(10, 2),
  valida_dal  date not null default current_date,
  valida_al   date,
  note        text,
  unique (cliente_id, voce, valida_dal)
);

-- Mezzi --------------------------------------------------------------------
create type public.tipo_mezzo as enum ('Sprinter', 'Furgone', 'Motrice', 'Tre assi', 'Bilico');

create table public.mezzi (
  id            uuid primary key default gen_random_uuid(),
  targa         text not null unique,
  tipo          public.tipo_mezzo not null,
  sponda        boolean not null default false,
  autista_id    uuid references public.dipendenti(id),  -- mezzo quasi nominale
  telepass      text,
  revisione     date,
  assicurazione date,
  tagliando_km  integer,
  stato         text not null default 'Attivo' check (stato in ('Attivo', 'Fermo', 'Officina')),
  note          text
);

-- Bolle --------------------------------------------------------------------
create type public.stato_bolla as enum (
  'Nuova', 'Confermata', 'In giro', 'Consegnata', 'Non consegnata', 'Giacenza', 'Fatturata', 'Annullata'
);

create table public.bolle (
  id             uuid primary key default gen_random_uuid(),
  numero         text unique,                       -- assegnato alla conferma
  cliente_id     uuid not null references public.clienti(id),
  tipo           text not null default 'Consegna' check (tipo in ('Consegna', 'Ritiro', 'Riconsegna', 'Magazzino')),
  data_consegna  date,
  fascia         text,
  destinatario   text,
  indirizzo      text,
  citta          text,
  colli_previsti integer check (colli_previsti >= 0),
  peso_kg        numeric(10, 2),
  accessori      text[] not null default '{}',      -- Sponda, Piano, Sabato, ...
  dati_mancanti  text[] not null default '{}',      -- finché non è vuoto non si conferma
  stato          public.stato_bolla not null default 'Nuova',
  operatore_id   uuid references public.profili(id), -- assegnata a Christian/Gabriele/Alberto
  mail_id        text,                               -- mail di Outlook da cui nasce
  note           text,
  creata_il      timestamptz not null default now(),
  confermata_il  timestamptz,
  confermata_da  uuid references public.profili(id)
);
create index bolle_cliente on public.bolle (cliente_id, data_consegna);
create index bolle_stato on public.bolle (stato);

create sequence public.numero_bolla_seq;

create or replace function public.bolle_regole() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'Confermata' and old.stato = 'Nuova' then
    if cardinality(new.dati_mancanti) > 0 then
      raise exception 'Bolla bloccata: manca %', array_to_string(new.dati_mancanti, ', ');
    end if;
    if new.data_consegna is null or new.indirizzo is null or coalesce(new.colli_previsti, 0) = 0 then
      raise exception 'Bolla bloccata: servono data, indirizzo e colli';
    end if;
    new.numero := coalesce(new.numero, to_char(now(), 'YY') || '-' || lpad(nextval('public.numero_bolla_seq')::text, 6, '0'));
    new.confermata_il := now();
    new.confermata_da := auth.uid();
  end if;
  if new.stato = 'Fatturata' and old.stato not in ('Consegnata', 'Giacenza', 'Non consegnata') then
    raise exception 'Si fattura solo una bolla chiusa';
  end if;
  return new;
end $$;
create trigger bolle_regole before update on public.bolle
  for each row execute function public.bolle_regole();

-- Colli: ogni collo ha il suo codice e si scansiona a ogni passaggio -------
create table public.colli (
  id         uuid primary key default gen_random_uuid(),
  bolla_id   uuid not null references public.bolle(id) on delete cascade,
  codice     text not null unique,
  descrizione text,
  letto_entrata timestamptz,
  letto_carico  timestamptz,
  letto_consegna timestamptz,
  bancale_id uuid,   -- collegato in magazzino.sql
  posto_id   uuid
);
create index colli_bolla on public.colli (bolla_id);

-- Giri e fermate -----------------------------------------------------------
create table public.giri (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  mezzo_id    uuid not null references public.mezzi(id),
  autista_id  uuid not null references public.dipendenti(id),
  zona        text,
  stato       text not null default 'Preparato' check (stato in ('Preparato', 'Partito', 'Rientrato', 'Chiuso')),
  creato_da   uuid references public.profili(id),
  unique (data, mezzo_id)
);

create type public.esito_fermata as enum ('Da fare', 'Consegnata', 'Non consegnata');
create type public.dopo_mancata as enum ('Nuova data', 'Riprovo dopo', 'Giacenza');

create table public.fermate (
  id            uuid primary key default gen_random_uuid(),
  giro_id       uuid not null references public.giri(id) on delete cascade,
  bolla_id      uuid not null references public.bolle(id),
  ordine        integer not null,
  esito         public.esito_fermata not null default 'Da fare',
  motivo        text,               -- obbligatorio se non consegnata
  dopo          public.dopo_mancata,
  firmata       boolean not null default false,
  foto_bolla    text,               -- percorso nello storage
  nitidezza     numeric(6, 1),
  lat           double precision,
  lng           double precision,
  chiusa_il     timestamptz,
  unique (giro_id, ordine)
);

-- accessori aggiunti dall'autista: vanno da soli in fattura
create table public.accessori_extra (
  id          uuid primary key default gen_random_uuid(),
  fermata_id  uuid not null references public.fermate(id) on delete cascade,
  voce        text not null,
  aggiunto_il timestamptz not null default now(),
  lat         double precision,
  lng         double precision
);

create or replace function public.fermate_regole() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_colli integer; v_letti integer; v_cliente uuid;
begin
  if new.esito = old.esito then return new; end if;
  select count(*), count(letto_consegna) into v_colli, v_letti from public.colli where bolla_id = new.bolla_id;
  if new.esito = 'Consegnata' then
    if v_letti < v_colli then
      raise exception 'Consegna bloccata: % colli su % scansionati', v_letti, v_colli;
    end if;
    if not new.firmata then raise exception 'Consegna bloccata: manca la firma'; end if;
    if new.foto_bolla is null then raise exception 'Consegna bloccata: manca la foto della bolla'; end if;
    update public.bolle set stato = 'Consegnata' where id = new.bolla_id;
  elsif new.esito = 'Non consegnata' then
    if coalesce(new.motivo, '') = '' or new.dopo is null then
      raise exception 'Serve il motivo e cosa succede alla merce';
    end if;
    update public.bolle set stato = case new.dopo when 'Giacenza' then 'Giacenza'::public.stato_bolla
                                                  else 'Non consegnata'::public.stato_bolla end
     where id = new.bolla_id;
    if new.dopo = 'Giacenza' then
      insert into public.giacenze (bolla_id, motivo) values (new.bolla_id, new.motivo)
      on conflict (bolla_id) where chiusa_il is null do nothing;
    end if;
  end if;
  new.chiusa_il := now();
  return new;
end $$;

-- Giacenze -----------------------------------------------------------------
create table public.giacenze (
  id            uuid primary key default gen_random_uuid(),
  bolla_id      uuid not null references public.bolle(id),
  motivo        text not null,
  dal           date not null default current_date,
  riconsegna_il date,           -- prenotata con il cliente
  chiusa_il     timestamptz
);
create unique index giacenze_aperta on public.giacenze (bolla_id) where chiusa_il is null;

create trigger fermate_regole before update on public.fermate
  for each row execute function public.fermate_regole();

-- Fatture ------------------------------------------------------------------
create type public.stato_fattura as enum ('Bozza', 'Da controllare', 'Pronta', 'Inviata', 'Pagata');

create table public.fatture (
  id           uuid primary key default gen_random_uuid(),
  azienda      text not null references public.aziende(id),
  cliente_id   uuid not null references public.clienti(id),
  periodo      text,                 -- es. 2026-10
  numero       text,                 -- assegnato da Fatture in Cloud
  fic_id       text,                 -- id del documento su Fatture in Cloud
  data         date,
  imponibile   numeric(12, 2) not null default 0,
  iva          numeric(12, 2) not null default 0,
  stato        public.stato_fattura not null default 'Bozza',
  problema     text,                 -- perché è da controllare
  approvata_da uuid references public.profili(id),
  inviata_il   timestamptz,
  pagata_il    date,
  creata_il    timestamptz not null default now()
);

create table public.righe_fattura (
  id          uuid primary key default gen_random_uuid(),
  fattura_id  uuid not null references public.fatture(id) on delete cascade,
  bolla_id    uuid references public.bolle(id),   -- ogni voce rimanda alla sua consegna
  voce        text not null,
  quantita    numeric(10, 2) not null default 1,
  prezzo      numeric(10, 2) not null,
  totale      numeric(12, 2) generated always as (round(quantita * prezzo, 2)) stored
);

create or replace function public.fatture_regole() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stato = old.stato then return new; end if;
  if new.stato = 'Inviata' then
    if old.stato <> 'Pronta' then raise exception 'Si invia solo una fattura pronta'; end if;
    new.approvata_da := auth.uid(); new.inviata_il := now();
  elsif new.stato = 'Pagata' then
    if old.stato <> 'Inviata' then raise exception 'Pagata solo dopo l''invio'; end if;
    new.pagata_il := coalesce(new.pagata_il, current_date);
  elsif new.stato = 'Pronta' and coalesce(new.problema, '') <> '' then
    raise exception 'Fattura da controllare: %', new.problema;
  end if;
  return new;
end $$;
create trigger fatture_regole before update on public.fatture
  for each row execute function public.fatture_regole();

-- Telepass -----------------------------------------------------------------
create table public.telepass (
  id        uuid primary key default gen_random_uuid(),
  mezzo_id  uuid not null references public.mezzi(id),
  quando    timestamptz not null,
  entrata   text,
  uscita    text,
  importo   numeric(8, 2) not null,
  unique (mezzo_id, quando)
);

-- Valore di una bolla secondo le tariffe del cliente -------------------------
-- base per spedizione + prezzo per collo/bancale + una voce per ogni accessorio
create or replace function public.valore_bolla(p_bolla uuid) returns numeric
language sql stable security definer set search_path = public as $$
  with b as (select * from public.bolle where id = p_bolla),
  t as (
    select distinct on (voce) voce, unita, prezzo from public.tariffe
    where cliente_id = (select cliente_id from b)
      and valida_dal <= coalesce((select data_consegna from b), current_date)
      and (valida_al is null or valida_al >= coalesce((select data_consegna from b), current_date))
    order by voce, valida_dal desc
  ),
  extra as (
    select a.voce from public.accessori_extra a join public.fermate f on f.id = a.fermata_id
    where f.bolla_id = p_bolla
  )
  select round(
      coalesce((select prezzo from t where voce = 'Base' and unita = 'spedizione'), 0)
    + coalesce((select prezzo from t where voce = 'Base' and unita in ('collo', 'bancale')), 0) * coalesce((select colli_previsti from b), 0)
    + coalesce((select sum(t.prezzo) from t join unnest((select accessori from b)) acc(voce) using (voce)), 0)
    + coalesce((select sum(t.prezzo) from t join extra using (voce)), 0)
  , 2)
$$;

create or replace view public.incassi_trasporti with (security_invoker = true) as
select
  coalesce(sum(public.valore_bolla(b.id)) filter (where b.data_consegna = current_date), 0) as fatturato_oggi,
  coalesce(sum(public.valore_bolla(b.id)) filter (where date_trunc('month', b.data_consegna) = date_trunc('month', current_date)), 0) as fatturato_mese,
  coalesce((select sum(imponibile) from public.fatture f where f.stato = 'Pagata' and f.azienda = 'trasporti'
             and date_trunc('month', f.pagata_il) = date_trunc('month', current_date)), 0) as incassato_mese
from public.bolle b
where b.stato in ('Consegnata', 'Giacenza', 'Non consegnata', 'Fatturata');

-- RLS ----------------------------------------------------------------------
alter table public.tariffe enable row level security;
alter table public.mezzi enable row level security;
alter table public.bolle enable row level security;
alter table public.colli enable row level security;
alter table public.giri enable row level security;
alter table public.fermate enable row level security;
alter table public.accessori_extra enable row level security;
alter table public.giacenze enable row level security;
alter table public.fatture enable row level security;
alter table public.righe_fattura enable row level security;
alter table public.telepass enable row level security;

-- è un mio giro? (l'autista vede solo i suoi)
create or replace function public.mio_giro(p_giro uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.giri g where g.id = p_giro and g.autista_id = public.mio_dipendente())
$$;

create or replace function public.bolla_visibile(p_bolla uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bolle b join public.clienti c on c.id = b.cliente_id
    where b.id = p_bolla and (
      (public.staff_di('trasporti') and public.mio_ruolo() <> 'autista')
      or c.id = public.mio_cliente()
      or c.tramite = public.mio_cliente()
      or exists (select 1 from public.fermate f where f.bolla_id = b.id and public.mio_giro(f.giro_id))
    ))
$$;

create policy tariffe_lettura on public.tariffe for select to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('commerciale', 'amministrazione', 'bolle'));
create policy tariffe_scrittura on public.tariffe for all to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('commerciale'))
  with check (public.staff_di('trasporti') and public.ha_ruolo('commerciale'));

create policy mezzi_lettura on public.mezzi for select to authenticated
  using (public.staff_di('trasporti') and public.mio_ruolo() <> 'autista' or autista_id = public.mio_dipendente());
create policy mezzi_scrittura on public.mezzi for all to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('traffico', 'amministrazione'))
  with check (public.staff_di('trasporti') and public.ha_ruolo('traffico', 'amministrazione'));

create policy bolle_lettura on public.bolle for select to authenticated using (public.bolla_visibile(id));
create policy bolle_inserimento on public.bolle for insert to authenticated
  with check (public.staff_di('trasporti') and public.ha_ruolo('bolle'));
create policy bolle_modifica on public.bolle for update to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico', 'amministrazione'))
  with check (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico', 'amministrazione'));

create policy colli_lettura on public.colli for select to authenticated using (public.bolla_visibile(bolla_id));
create policy colli_scrittura on public.colli for all to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'magazzino'))
  with check (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'magazzino'));
-- l'autista non scrive direttamente: usa le funzioni in azioni.sql

create policy giri_lettura on public.giri for select to authenticated
  using ((public.staff_di('trasporti') and public.mio_ruolo() <> 'autista') or autista_id = public.mio_dipendente());
create policy giri_scrittura on public.giri for all to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('traffico'))
  with check (public.staff_di('trasporti') and public.ha_ruolo('traffico'));

create policy fermate_lettura on public.fermate for select to authenticated
  using ((public.staff_di('trasporti') and public.mio_ruolo() <> 'autista') or public.mio_giro(giro_id)
         or public.bolla_visibile(bolla_id));
create policy fermate_traffico on public.fermate for all to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('traffico'))
  with check (public.staff_di('trasporti') and public.ha_ruolo('traffico'));
create policy accessori_lettura on public.accessori_extra for select to authenticated
  using (exists (select 1 from public.fermate f where f.id = fermata_id));
create policy giacenze_lettura on public.giacenze for select to authenticated using (public.bolla_visibile(bolla_id));
create policy giacenze_scrittura on public.giacenze for update to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico'))
  with check (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico'));

create policy fatture_lettura on public.fatture for select to authenticated
  using ((public.staff_di(azienda) and public.ha_ruolo('amministrazione')) or cliente_id = public.mio_cliente());
create policy fatture_scrittura on public.fatture for all to authenticated
  using (public.staff_di(azienda) and public.ha_ruolo('amministrazione'))
  with check (public.staff_di(azienda) and public.ha_ruolo('amministrazione'));

create policy righe_lettura on public.righe_fattura for select to authenticated
  using (exists (select 1 from public.fatture f where f.id = fattura_id));
create policy righe_scrittura on public.righe_fattura for all to authenticated
  using (exists (select 1 from public.fatture f where f.id = fattura_id and public.staff_di(f.azienda) and public.ha_ruolo('amministrazione')))
  with check (exists (select 1 from public.fatture f where f.id = fattura_id and public.staff_di(f.azienda) and public.ha_ruolo('amministrazione')));

create policy telepass_lettura on public.telepass for select to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('amministrazione', 'traffico'));

grant select, insert, update, delete on
  public.tariffe, public.mezzi, public.bolle, public.colli, public.giri, public.fermate,
  public.accessori_extra, public.giacenze, public.fatture, public.righe_fattura to authenticated;
grant select on public.telepass, public.incassi_trasporti to authenticated;
