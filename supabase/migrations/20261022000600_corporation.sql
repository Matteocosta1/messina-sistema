-- =====================================================================
-- Corporation: lotti, vendite nette, resi, marketplace, conferma prezzo, telefoni
--  · lotti: aperto/chiuso, più documenti, costo diviso sui pezzi caricati con quadratura (somma = costo del lotto)
--  · vendite: IVA del regime del margine e spese tolte; resi con rimborso; un PC reso si può rivendere
--  · «% recuperato» sul netto vero (prezzo − commissione − spese − IVA − rimborsi)
--  · una sola lista di siti; vendita registrata a mano da un marketplace (il PC sparisce dagli altri siti)
--  · ordini: «Spedito» con il tracking
--  · prezzo da confermare: lista e tasto «Conferma» per le Vendite
--  · telefoni: memoria, batteria, colore; prezzi proposti per modello e grado
-- =====================================================================

-- ------------------------------------------------------------------ Siti di vendita: una sola lista
create or replace function public.siti_vendita() returns text[]
language sql immutable as $$ select array['Sito', 'Back Market', 'Refurbed', 'eBay', 'Subito', 'Amazon']::text[] $$;
grant execute on function public.siti_vendita() to authenticated, anon, service_role;
update public.device set siti = array(select x from unnest(siti) x where x = any(public.siti_vendita())) where not (siti <@ public.siti_vendita());
alter table public.device drop constraint if exists device_siti_validi;
alter table public.device add constraint device_siti_validi check (siti <@ public.siti_vendita());
alter table public.vendite drop constraint if exists vendite_canale_valido;
alter table public.vendite add constraint vendite_canale_valido check (canale = any(public.siti_vendita() || array['Di persona'])) not valid;

-- ------------------------------------------------------------------ Telefoni e prezzi per modello
alter table public.device
  add column if not exists memoria text,
  add column if not exists batteria integer check (batteria between 0 and 100),
  add column if not exists colore text;
create table if not exists public.prezzi_modello (
  modello text not null,
  grado   text not null check (grado in ('A', 'B', 'C', 'D')),
  prezzo  numeric(10, 2) not null check (prezzo > 0),
  primary key (modello, grado)
);
alter table public.prezzi_modello enable row level security;
create policy prezzi_modello_lettura on public.prezzi_modello for select to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite', 'stage', 'amministrazione'));
create policy prezzi_modello_scrittura on public.prezzi_modello for all to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite')) with check (public.staff_di('corporation') and public.ha_ruolo('vendite'));
grant select, insert, update, delete on public.prezzi_modello to authenticated;
create policy doppio_fattore on public.prezzi_modello as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

-- ------------------------------------------------------------------ Lotti: stato, documenti, costo diviso con quadratura
alter table public.lotti add column if not exists stato text not null default 'Aperto' check (stato in ('Aperto', 'Chiuso')),
                         add column if not exists chiuso_il timestamptz,
                         add column if not exists nota_chiusura text;
create table if not exists public.lotti_documenti (
  id        uuid primary key default gen_random_uuid(),
  lotto_id  uuid not null references public.lotti(id) on delete cascade,
  tipo      text not null check (tipo in ('Fattura', 'DDT', 'Altro')),
  percorso  text not null,       -- storage documenti/lotti/<lotto>/…
  nome      text,
  caricato_il timestamptz not null default now(),
  caricato_da uuid references public.profili(id) default auth.uid()
);
alter table public.lotti_documenti enable row level security;
create policy lotti_doc_lettura on public.lotti_documenti for select to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite', 'amministrazione', 'commercialista'));
create policy lotti_doc_nuovo on public.lotti_documenti for insert to authenticated
  with check (public.staff_di('corporation') and public.ha_ruolo('vendite', 'amministrazione') and (percorso like 'lotti/%' or percorso like 'mail/%'));
grant select, insert on public.lotti_documenti to authenticated;
create policy doppio_fattore on public.lotti_documenti as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
insert into public.lotti_documenti (lotto_id, tipo, percorso)
select id, 'Fattura', fattura from public.lotti where fattura is not null
union all select id, 'DDT', ddt from public.lotti where ddt is not null;

-- un PC entra in un lotto aperto e prende la sua quota (costo ÷ pezzi dichiarati); alla chiusura si ripartisce sui pezzi veri
create or replace function public.device_lotto() returns trigger
language plpgsql security definer set search_path = public as $$
declare l public.lotti;
begin
  if new.lotto_id is null or (tg_op = 'UPDATE' and new.lotto_id is not distinct from old.lotto_id) then return new; end if;
  select * into l from public.lotti where id = new.lotto_id;
  if l.stato = 'Chiuso' then raise exception 'Il lotto % è chiuso: scegli un lotto aperto o creane uno nuovo', l.codice; end if;
  if new.costo is null and l.pezzi > 0 then new.costo := round(l.costo / l.pezzi, 2); end if;
  return new;
end $$;
drop trigger if exists device_lotto on public.device;
create trigger device_lotto before insert or update of lotto_id on public.device
  for each row execute function public.device_lotto();

create or replace view public.lotti_quadratura with (security_invoker = true) as
select l.id, l.codice, l.stato, l.pezzi as pezzi_dichiarati, l.costo,
       (select count(*) from public.device d where d.lotto_id = l.id) as caricati,
       coalesce((select sum(d.costo) from public.device d where d.lotto_id = l.id), 0) as costo_ripartito,
       l.costo - coalesce((select sum(d.costo) from public.device d where d.lotto_id = l.id), 0) as differenza
from public.lotti l;
grant select on public.lotti_quadratura to authenticated;

-- chiusura: il costo si divide sui PC caricati (gli ultimi centesimi sull'ultimo), così la somma torna esatta
create or replace function public.chiudi_lotto(p_lotto uuid, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare l public.lotti; n int; v_quota numeric; v_ultimo uuid;
begin
  if not (public.staff_di('corporation') and public.ha_ruolo('vendite', 'amministrazione')) then raise exception 'Non autorizzato'; end if;
  select * into l from public.lotti where id = p_lotto for update;
  if l.id is null or l.stato <> 'Aperto' then raise exception 'Lotto già chiuso'; end if;
  select count(*) into n from public.device where lotto_id = l.id;
  if n = 0 then raise exception 'Nel lotto non c''è ancora nessun PC'; end if;
  if n <> l.pezzi and coalesce(trim(p_nota), '') = '' then
    raise exception 'Nel DDT ci sono % pezzi, caricati %: scrivi cosa manca o cosa c''è in più', l.pezzi, n;
  end if;
  v_quota := trunc(l.costo / n, 2);
  update public.device set costo = v_quota where lotto_id = l.id;
  select id into v_ultimo from public.device where lotto_id = l.id order by caricato_il desc, id limit 1;
  update public.device set costo = l.costo - v_quota * (n - 1) where id = v_ultimo;
  update public.lotti set stato = 'Chiuso', chiuso_il = now(), nota_chiusura = nullif(trim(p_nota), '') where id = l.id;
  perform public.registra('corporation', 'Lotti', l.codice || ' chiuso: ' || n || ' PC, ' || l.costo || ' € divisi' || coalesce(' · ' || nullif(trim(p_nota), ''), ''),
                          null, 'Manuale', 'lotti', l.id::text);
end $$;

-- ------------------------------------------------------------------ Vendite nette, resi e rimborsi
alter table public.vendite drop constraint if exists vendite_device_id_key;
alter table public.vendite
  add column if not exists spese numeric(10, 2) not null default 0 check (spese >= 0),
  add column if not exists iva numeric(10, 2) not null default 0,
  add column if not exists reso_il timestamptz,
  add column if not exists rimborso numeric(10, 2) not null default 0 check (rimborso >= 0),
  add column if not exists motivo_reso text,
  add column if not exists riferimento text;
alter table public.vendite add column if not exists netto numeric(10, 2) generated always as (prezzo - commissione - spese - iva) stored;
create unique index if not exists vendite_una_attiva on public.vendite (device_id) where reso_il is null;

-- venduto: il device sparisce dagli altri siti (resta solo il sito dove è stato venduto)
create or replace function public.vendita_chiude_device() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('messina.vendita', 'si', true);
  update public.device set stato = 'Venduto', siti = case when new.canale = any(public.siti_vendita()) then array[new.canale] else '{}' end
   where id = new.device_id;
  perform set_config('messina.vendita', '', true);
  return new;
end $$;

-- IVA del regime del margine (usato): sul guadagno, già dentro il prezzo (22/122)
create or replace function public.vendite_iva() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_costo numeric;
begin
  select costo into v_costo from public.device where id = new.device_id;
  new.iva := round(greatest(new.prezzo - coalesce(v_costo, 0), 0) * 22 / 122, 2);
  return new;
end $$;
drop trigger if exists vendite_iva on public.vendite;
create trigger vendite_iva before insert on public.vendite for each row execute function public.vendite_iva();
update public.vendite v set iva = round(greatest(v.prezzo - coalesce(d.costo, 0), 0) * 22 / 122, 2) from public.device d where d.id = v.device_id;

-- prezzo proposto in Entrate: quello del modello e grado, altrimenti la media degli ultimi venduti, altrimenti nessuno
create or replace function public.prezzo_proposto(p_modello text, p_grado text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select prezzo from public.prezzi_modello where modello = p_modello and grado = p_grado),
    (select round(avg(v.prezzo)) from (select v.prezzo from public.vendite v join public.device d on d.id = v.device_id
                                         where d.modello = p_modello and d.grado = p_grado and v.reso_il is null
                                         order by v.venduto_il desc limit 10) v))
  where public.staff_di('corporation')
$$;

-- le regole del device: «Venduto» entra ed esce solo con una vendita o un reso registrati
create or replace function public.device_regole() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_flag boolean := coalesce(current_setting('messina.vendita', true), '') = 'si';
begin
  if tg_op = 'INSERT' then
    new.caricato_da := auth.uid();
    new.prezzo_confermato_da := case when public.ha_ruolo('vendite') and new.prezzo is not null then auth.uid() end;
    if new.stato = 'Venduto' then raise exception 'Venduto solo con una vendita registrata'; end if;
  else
    if new.prezzo is distinct from old.prezzo then
      new.prezzo_confermato_da := case when public.ha_ruolo('vendite') then auth.uid() end;
    elsif new.prezzo_confermato_da is distinct from old.prezzo_confermato_da and not v_flag then
      raise exception 'La conferma del prezzo la mette il sistema: premi «Conferma»';
    end if;
    if new.stato is distinct from old.stato and (new.stato = 'Venduto' or old.stato = 'Venduto') and pg_trigger_depth() < 2 and not v_flag then
      raise exception 'Venduto solo con una vendita registrata';
    end if;
  end if;
  if new.stato = 'Disponibile' and new.bancale_id is null then raise exception 'Il device non si conferma senza bancale'; end if;
  if new.stato = 'Disponibile' and (new.prezzo is null or new.grado is null) then raise exception 'Servono grado e prezzo'; end if;
  return new;
end $$;

create or replace function public.conferma_prezzo(p_device uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.staff_di('corporation') and public.ha_ruolo('vendite')) then raise exception 'Il prezzo lo confermano le Vendite'; end if;
  perform set_config('messina.vendita', 'si', true);
  update public.device set prezzo_confermato_da = auth.uid() where id = p_device and prezzo is not null and stato <> 'Venduto';
  if not found then raise exception 'Prima scrivi il prezzo'; end if;
  perform set_config('messina.vendita', '', true);
end $$;

-- vendita registrata a mano (eBay, Back Market, Subito, di persona…): nasce l'ordine, il PC sparisce dagli altri siti
create or replace function public.registra_vendita(p_seriale text, p_canale text, p_prezzo numeric, p_commissione numeric default 0,
  p_spese numeric default 0, p_riferimento text default null, p_cliente text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare d public.device; v_ordine uuid; v_vendita uuid;
begin
  if not (public.staff_di('corporation') and public.ha_ruolo('vendite')) then raise exception 'Le vendite le registrano le Vendite'; end if;
  if not (p_canale = any(public.siti_vendita() || array['Di persona'])) then raise exception 'Canale sconosciuto: %', p_canale; end if;
  if p_prezzo is null or p_prezzo <= 0 then raise exception 'Scrivi il prezzo di vendita'; end if;
  select * into d from public.device where seriale = trim(p_seriale) for update;
  if d.id is null then raise exception 'Seriale % sconosciuto', p_seriale; end if;
  if d.stato <> 'Disponibile' then raise exception 'Il PC % è «%»: non si può vendere', d.seriale, d.stato; end if;
  insert into public.ordini (canale, riferimento, cliente, stato, entro, device_id)
  values (p_canale, nullif(trim(p_riferimento), ''), nullif(trim(p_cliente), ''), case when p_canale = 'Di persona' then 'Spedito' else 'Da preparare' end,
          now() + interval '1 day', d.id)
  returning id into v_ordine;
  insert into public.vendite (device_id, canale, prezzo, commissione, spese, ordine_id, riferimento)
  values (d.id, p_canale, p_prezzo, coalesce(p_commissione, 0), coalesce(p_spese, 0), v_ordine, nullif(trim(p_riferimento), ''))
  returning id into v_vendita;
  perform public.registra('corporation', 'Vendita', d.marca || ' ' || d.modello || ' ' || d.seriale || ' · ' || p_canale || ' · ' || p_prezzo || ' €', null, 'Manuale', 'vendite', v_vendita::text);
  return v_vendita;
end $$;

-- reso: rimborso al cliente; se il PC è a posto torna «Reso» e si può rimettere in vendita, altrimenti «Fermo»
create or replace function public.reso_vendita(p_vendita uuid, p_rimborso numeric, p_motivo text, p_rivendibile boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v public.vendite;
begin
  if not (public.staff_di('corporation') and public.ha_ruolo('vendite')) then raise exception 'I resi li gestiscono le Vendite'; end if;
  select * into v from public.vendite where id = p_vendita for update;
  if v.id is null or v.reso_il is not null then raise exception 'Vendita non trovata o già resa'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Scrivi il motivo del reso'; end if;
  if p_rimborso is null or p_rimborso < 0 or p_rimborso > v.prezzo then raise exception 'Il rimborso va da 0 al prezzo pagato (% €)', v.prezzo; end if;
  update public.vendite set reso_il = now(), rimborso = p_rimborso, motivo_reso = trim(p_motivo) where id = v.id;
  perform set_config('messina.vendita', 'si', true);
  update public.device set stato = case when p_rivendibile then 'Reso'::public.stato_device else 'Fermo'::public.stato_device end, siti = '{}' where id = v.device_id;
  perform set_config('messina.vendita', '', true);
  perform public.registra('corporation', 'Reso', 'Rimborso ' || p_rimborso || ' € · ' || trim(p_motivo), null, 'Manuale', 'vendite', v.id::text);
end $$;

-- un PC reso o fermo torna in vendita: serve il bancale (dove si trova) e il prezzo
create or replace function public.rimetti_in_vendita(p_device uuid, p_bancale text, p_prezzo numeric) returns void
language plpgsql security definer set search_path = public as $$
declare d public.device; v_b uuid;
begin
  if not (public.staff_di('corporation') and public.ha_ruolo('vendite')) then raise exception 'Non autorizzato'; end if;
  select * into d from public.device where id = p_device for update;
  if d.id is null or d.stato not in ('Reso', 'Fermo') then raise exception 'Si rimette in vendita solo un PC reso o fermo'; end if;
  select id into v_b from public.bancali where codice = trim(p_bancale) and uscito_il is null;
  if v_b is null then raise exception 'Bancale % non trovato: scansiona l''etichetta del bancale dove lo metti', p_bancale; end if;
  update public.device set stato = 'Disponibile', bancale_id = v_b, prezzo = coalesce(p_prezzo, prezzo) where id = d.id;
  perform public.registra('corporation', 'Inventario', d.seriale || ' di nuovo in vendita', p_bancale, 'Manuale', 'device', d.id::text);
end $$;

create or replace function public.metti_fermo(p_device uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare d public.device;
begin
  if not (public.staff_di('corporation') and public.ha_ruolo('vendite')) then raise exception 'Non autorizzato'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Scrivi perché è fermo'; end if;
  select * into d from public.device where id = p_device for update;
  if d.id is null or d.stato in ('Venduto', 'Smontato') then raise exception 'Questo PC non si può fermare'; end if;
  update public.device set stato = 'Fermo', siti = '{}' where id = d.id;
  perform public.registra('corporation', 'Inventario', d.seriale || ' fermo · ' || trim(p_motivo), null, 'Manuale', 'device', d.id::text);
end $$;

-- ordini: spedito con il tracking
alter table public.ordini add column if not exists tracking text, add column if not exists spedito_il timestamptz;
create or replace function public.ordine_spedito(p_ordine uuid, p_tracking text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.staff_di('corporation') and public.ha_ruolo('vendite', 'magazzino')) then raise exception 'Non autorizzato'; end if;
  if coalesce(trim(p_tracking), '') = '' then raise exception 'Scrivi il numero di spedizione'; end if;
  update public.ordini set stato = 'Spedito', tracking = trim(p_tracking), spedito_il = now() where id = p_ordine and stato in ('Da preparare', 'Pronto');
  if not found then raise exception 'Ordine già spedito o annullato'; end if;
end $$;

revoke execute on function public.prezzo_proposto(text, text), public.chiudi_lotto(uuid, text), public.conferma_prezzo(uuid),
  public.registra_vendita(text, text, numeric, numeric, numeric, text, text), public.reso_vendita(uuid, numeric, text, boolean),
  public.rimetti_in_vendita(uuid, text, numeric), public.metti_fermo(uuid, text), public.ordine_spedito(uuid, text) from public, anon;
grant execute on function public.prezzo_proposto(text, text), public.chiudi_lotto(uuid, text), public.conferma_prezzo(uuid),
  public.registra_vendita(text, text, numeric, numeric, numeric, text, text), public.reso_vendita(uuid, numeric, text, boolean),
  public.rimetti_in_vendita(uuid, text, numeric), public.metti_fermo(uuid, text), public.ordine_spedito(uuid, text) to authenticated;

-- ------------------------------------------------------------------ Conti sul netto vero
create or replace view public.incassi_corporation with (security_invoker = true) as
select coalesce(sum(netto - rimborso) filter (where (venduto_il at time zone 'Europe/Rome')::date = public.oggi()), 0) as incassato_oggi,
       coalesce(sum(netto - rimborso) filter (where date_trunc('month', venduto_il at time zone 'Europe/Rome') = date_trunc('month', public.oggi()::timestamp)), 0) as incassato_mese
from public.vendite;

create or replace view public.lotti_conti with (security_invoker = true) as
select l.id, l.codice, l.acquistato_il, l.pezzi, l.costo,
       (select count(*) from public.vendite v join public.device d on d.id = v.device_id where d.lotto_id = l.id and v.reso_il is null) as venduti,
       x.incassato,
       case when l.costo > 0 then round(x.incassato / l.costo * 100, 1) else 0 end as recuperato_pct,
       x.incassato_ricambi,
       (select count(*) from public.ricambi r where r.lotto_id = l.id and r.stato = 'Venduto') as ricambi_venduti
from public.lotti l
cross join lateral (
  select coalesce((select sum(v.netto - v.rimborso) from public.vendite v join public.device d on d.id = v.device_id where d.lotto_id = l.id), 0)
       + coalesce((select sum(r.incassato) from public.ricambi r where r.lotto_id = l.id and r.stato = 'Venduto'), 0) as incassato,
         coalesce((select sum(r.incassato) from public.ricambi r where r.lotto_id = l.id and r.stato = 'Venduto'), 0) as incassato_ricambi
) x;
