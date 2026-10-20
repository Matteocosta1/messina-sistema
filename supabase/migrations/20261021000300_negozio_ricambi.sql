-- Modifiche del 20 ottobre notte (vocale + «procedi»):
--  · negozio: gradi A, B, C e D (D = funziona al 100% con la scocca rotta), scheda tecnica completa
--  · ricambi: pezzi smontati dai computer che non si vendono interi, legati al computer e al lotto;
--    quello che incassano conta nel recupero del lotto; un disco si vende solo con il rapporto di cancellazione
-- (Il «Non Consegnato» sempre attivo non tocca il database: la mancata consegna chiede solo motivo e destino
--  della merce, mai i colli scansionati. Lo verifica supabase/tests/90_negozio_ricambi.sql.)

-- ------------------------------------------------------------------ scheda tecnica del device
alter table public.device
  add column generazione       text,
  add column batteria_pct      integer check (batteria_pct between 0 and 100),   -- capacità residua dal test
  add column sistema_operativo text,
  add column tastiera          text,
  add column porte             text,
  add column rete              text,
  add column webcam            text,
  add column peso              text;
comment on column public.device.grado is 'A ottimo, B buono, C discreto, D funziona al 100% ma con la scocca rotta o danni estetici importanti';

-- smontato per ricambi: non si vende più intero
alter type public.stato_device add value if not exists 'Smontato';

-- un dispositivo ha i dati cancellati se lo stage ha il certificato per il suo seriale
create or replace function public.dati_cancellati(p_seriale text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stage_pc s where s.seriale = p_seriale and s.certificato is not null
                  and s.esito in ('Formattato', 'In vendita'));
$$;

-- ------------------------------------------------------------------ catalogo pubblico del negozio
-- stesso raggruppamento di prima (modello, configurazione, grado) + le voci della scheda tecnica
drop function if exists public.catalogo();
create function public.catalogo() returns table (
  modello text, marca text, cpu text, ram text, disco text, schermo text, gpu text,
  grado text, prezzo numeric, disponibili bigint,
  generazione text, batteria_min integer, sistema_operativo text, tastiera text, porte text, rete text, webcam text, peso text,
  dati_cancellati boolean
) language sql stable security definer set search_path = public as $$
  select d.modello, d.marca, d.cpu, d.ram, d.disco, d.schermo, d.gpu, d.grado, min(d.prezzo), count(*),
         min(d.generazione), min(d.batteria_pct), min(d.sistema_operativo), min(d.tastiera), min(d.porte), min(d.rete), min(d.webcam), min(d.peso),
         bool_and(public.dati_cancellati(d.seriale))
  from public.device d
  where d.stato = 'Disponibile' and 'Sito' = any(d.siti) and d.prezzo is not null and d.prezzo_confermato_da is not null
  group by d.modello, d.marca, d.cpu, d.ram, d.disco, d.schermo, d.gpu, d.grado
  order by d.marca, d.modello, d.grado
$$;
revoke all on function public.catalogo() from public;
grant execute on function public.catalogo() to anon, authenticated;

-- ------------------------------------------------------------------ ricambi
create table public.ricambi (
  id              uuid primary key default gen_random_uuid(),
  device_id       uuid not null references public.device(id),          -- il computer da cui è stato smontato
  lotto_id        uuid references public.lotti(id),                    -- lo mette il trigger: quello del computer
  tipo            text not null check (tipo in ('Display', 'Tastiera', 'Batteria', 'Scheda madre', 'Disco', 'Memoria', 'Scocca', 'Alimentatore', 'Altro')),
  descrizione     text not null,
  prezzo          numeric(10, 2) check (prezzo is null or prezzo >= 0),
  stato           text not null default 'Da vendere' check (stato in ('Da vendere', 'Disponibile', 'Venduto', 'Scartato')),
  siti            text[] not null default '{}',
  posto           text,
  canale          text,
  venduto_prezzo  numeric(10, 2),
  commissione     numeric(10, 2) not null default 0,
  incassato       numeric(10, 2) generated always as (venduto_prezzo - commissione) stored,
  venduto_il      timestamptz,
  creato_il       timestamptz not null default now(),
  creato_da       uuid default auth.uid() references public.profili(id)
);
create index ricambi_lotto on public.ricambi (lotto_id);
create index ricambi_device on public.ricambi (device_id);

create or replace function public.ricambi_regole() returns trigger
language plpgsql security definer set search_path = public as $$
declare d public.device;
begin
  select * into d from public.device where id = new.device_id;
  if d.id is null then raise exception 'Computer d''origine sconosciuto'; end if;
  if tg_op = 'INSERT' and d.stato = 'Venduto' then raise exception 'Il computer è già venduto intero: non si smonta'; end if;
  if tg_op = 'UPDATE' then
    if new.device_id <> old.device_id then raise exception 'Il computer d''origine di un ricambio non si cambia'; end if;
    if old.stato = 'Venduto' then raise exception 'Ricambio già venduto: non si modifica più'; end if;
  end if;
  new.lotto_id := d.lotto_id;
  -- un disco non si vende mai senza il rapporto di cancellazione del computer da cui viene
  if new.tipo = 'Disco' and new.stato in ('Disponibile', 'Venduto') and not public.dati_cancellati(d.seriale) then
    raise exception 'Disco di % senza rapporto di cancellazione: non si mette in vendita', d.seriale;
  end if;
  if new.stato in ('Disponibile', 'Venduto') and new.prezzo is null then raise exception 'Serve il prezzo'; end if;
  if new.stato = 'Venduto' then
    if new.venduto_prezzo is null or coalesce(trim(new.canale), '') = '' then raise exception 'Servono canale e prezzo di vendita'; end if;
    new.venduto_il := coalesce(new.venduto_il, now());
  end if;
  return new;
end $$;
create trigger ricambi_regole before insert or update on public.ricambi
  for each row execute function public.ricambi_regole();

-- il primo ricambio smonta il computer: non resta in vendita intero
create or replace function public.ricambi_smonta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.device set stato = 'Smontato', siti = '{}' where id = new.device_id and stato <> 'Smontato';
  perform public.registra('corporation', 'Smontaggio', new.tipo || ' · ' || new.descrizione, null, 'Manuale', 'ricambi', new.id::text);
  return new;
end $$;
create trigger ricambi_smonta after insert on public.ricambi
  for each row execute function public.ricambi_smonta();

alter table public.ricambi enable row level security;
create policy ricambi_lettura on public.ricambi for select to authenticated using (public.staff_di('corporation'));
create policy ricambi_nuovo on public.ricambi for insert to authenticated
  with check (public.staff_di('corporation') and public.ha_ruolo('vendite', 'stage', 'magazzino'));
create policy ricambi_modifica on public.ricambi for update to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite', 'stage', 'magazzino'))
  with check (public.staff_di('corporation') and public.ha_ruolo('vendite', 'stage', 'magazzino'));
grant select, insert, update on public.ricambi to authenticated;
-- regola «restrictive» del doppio fattore, come su ogni tabella protetta (vedi 20261021000100)
create policy doppio_fattore on public.ricambi as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

-- ricambi in vendita sul sito: senza seriali né costi
create or replace function public.catalogo_ricambi() returns table (id uuid, tipo text, descrizione text, origine text, prezzo numeric)
language sql stable security definer set search_path = public as $$
  select r.id, r.tipo, r.descrizione, trim(coalesce(d.marca, '') || ' ' || coalesce(d.modello, '')), r.prezzo
  from public.ricambi r join public.device d on d.id = r.device_id
  where r.stato = 'Disponibile' and 'Sito' = any(r.siti) and r.prezzo is not null
  order by d.marca, d.modello, r.tipo
$$;
revoke all on function public.catalogo_ricambi() from public;
grant execute on function public.catalogo_ricambi() to anon, authenticated;

-- ------------------------------------------------------------------ lotti: i ricambi contano nel recupero
-- (stesse colonne di prima, nello stesso ordine; in fondo il dettaglio dei ricambi)
create or replace view public.lotti_conti with (security_invoker = true) as
select l.id, l.codice, l.acquistato_il, l.pezzi, l.costo,
       (select count(*) from public.vendite v join public.device d on d.id = v.device_id where d.lotto_id = l.id) as venduti,
       x.incassato,
       case when l.costo > 0 then round(x.incassato / l.costo * 100, 1) else 0 end as recuperato_pct,
       x.incassato_ricambi,
       (select count(*) from public.ricambi r where r.lotto_id = l.id and r.stato = 'Venduto') as ricambi_venduti
from public.lotti l
cross join lateral (
  select coalesce((select sum(v.incassato) from public.vendite v join public.device d on d.id = v.device_id where d.lotto_id = l.id), 0)
       + coalesce((select sum(r.incassato) from public.ricambi r where r.lotto_id = l.id and r.stato = 'Venduto'), 0) as incassato,
         coalesce((select sum(r.incassato) from public.ricambi r where r.lotto_id = l.id and r.stato = 'Venduto'), 0) as incassato_ricambi
) x;
grant select on public.lotti_conti to authenticated;

revoke execute on function public.dati_cancellati(text), public.ricambi_regole(), public.ricambi_smonta() from public, anon;
grant execute on function public.dati_cancellati(text) to authenticated;
