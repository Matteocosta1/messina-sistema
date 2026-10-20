-- =====================================================================
-- 21 ottobre notte (recap vocale con Matteo):
--  · App autisti: con la firma del cliente la merce è consegnata. Una fermata firmata
--    non può più chiudersi come «Non consegnata» né essere rimandata («Riprovo dopo»).
--  · Traffico: niente «Proponi i giri». I giri del giorno dopo li prepara il sistema da
--    solo ogni pomeriggio (ora in impostazioni.ora_giri, ora di Roma). Un solo tasto
--    «Conferma». Se dopo la conferma arriva una spedizione nuova, il sistema la mette in
--    un giro e quel giro torna da confermare, con scritto cosa è cambiato.
--  · Pagina del giro: Su/Giù, fascia oraria e accessori, «Passa a…» un altro mezzo,
--    Togli, «+ Aggiungi fermata». Tutto nello Storico; se il giro è confermato e
--    l'autista è partito, gli arriva l'avviso «Il tuo giro è cambiato».
-- =====================================================================

-- ------------------------------------------------------------------ Firma
create or replace function public.fermate_regole() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_previsti integer; v_righe integer; v_letti integer; v_stato public.stato_bolla;
begin
  if tg_op = 'INSERT' then
    if new.esito <> 'Da fare' or new.firmata or new.foto_bolla is not null or new.chiusa_il is not null then
      raise exception 'Una fermata nasce da fare';
    end if;
    select stato into v_stato from public.bolle where id = new.bolla_id;
    if v_stato not in ('Confermata', 'In giro') then raise exception 'Nel giro va solo una bolla confermata'; end if;
    return new;
  end if;

  if old.esito <> 'Da fare' then raise exception 'Fermata chiusa: non si modifica più'; end if;
  if new.bolla_id <> old.bolla_id or new.giro_id <> old.giro_id then raise exception 'Bolla e giro della fermata non si cambiano'; end if;
  if old.firmata and not new.firmata then raise exception 'La firma del cliente non si toglie'; end if;
  if new.esito = old.esito then return new; end if;

  select b.colli_previsti, b.stato into v_previsti, v_stato from public.bolle b where b.id = new.bolla_id;
  select count(*), count(letto_consegna) into v_righe, v_letti from public.colli where bolla_id = new.bolla_id;
  if v_stato not in ('Confermata', 'In giro') then raise exception 'La bolla non è in consegna'; end if;

  if new.esito = 'Consegnata' then
    if coalesce(v_previsti, 0) = 0 or v_righe <> v_previsti or v_letti <> v_previsti then
      raise exception 'Consegna bloccata: % colli su % scansionati', v_letti, coalesce(v_previsti, 0);
    end if;
    if not new.firmata then raise exception 'Consegna bloccata: manca la firma'; end if;
    if new.foto_bolla is null then raise exception 'Consegna bloccata: manca la foto della bolla'; end if;
    update public.bolle set stato = 'Consegnata' where id = new.bolla_id;
  elsif new.esito = 'Non consegnata' then
    if old.firmata then raise exception 'Il cliente ha firmato: la merce è consegnata, non si può chiudere come «Non consegnata»'; end if;
    if coalesce(trim(new.motivo), '') = '' or new.dopo is null then
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

create or replace function public.riprova_dopo(p_fermata uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
begin
  if f.firmata then raise exception 'Il cliente ha firmato: la merce è consegnata'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Serve il motivo'; end if;
  update public.fermate set ordine = (select max(ordine) + 1 from public.fermate where giro_id = f.giro_id), motivo = p_motivo
   where id = f.id;
end $$;

-- ------------------------------------------------------------------ Giri preparati dal sistema
alter table public.giri
  add column da_confermare text[] not null default '{}',   -- cosa è cambiato dopo la conferma
  add column km_previsti   numeric(7, 1);                    -- lo scrive l'ottimizzatore per camion (HERE/TomTom)

-- tolta a mano dal giro: il sistema non la rimette da solo (torna con «+ Aggiungi fermata»)
alter table public.bolle add column fuori_dai_giri boolean not null default false;

create table public.giri_preparazioni (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,                   -- giorno dei giri
  eseguita_il timestamptz not null default now(),
  assegnate   integer not null,
  giri        integer not null,
  nota        text
);
alter table public.giri_preparazioni enable row level security;
create policy giri_preparazioni_lettura on public.giri_preparazioni for select to authenticated
  using (public.staff_di('trasporti') and public.mio_ruolo() <> 'autista');
grant select on public.giri_preparazioni to authenticated;

insert into public.impostazioni values ('ora_giri', '15', 'Ora di Roma in cui il sistema prepara i giri del giorno dopo (dal lunedì al venerdì)')
on conflict (chiave) do nothing;

-- stessa logica di proponi_giri, ma la chiama il sistema (pianificazione o spedizione nuova):
-- nessun controllo d'utente, quindi non è eseguibile dagli utenti
create or replace function public.prepara_giri_sistema(p_data date) returns integer
language plpgsql security definer set search_path = public as $$
declare v_mezzi uuid[]; v_n int := 0; r record; v_i int; v_giro uuid; v_ord int; v_conf timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('prepara_giri:' || p_data::text));
  select array_agg(id order by tipo, targa) into v_mezzi from public.mezzi where stato = 'Attivo' and autista_id is not null;
  if v_mezzi is null then return 0; end if;
  select count(*) into v_i from public.giri where data = p_data;
  for r in select b.id, b.citta, c.nome as cliente from public.bolle b join public.clienti c on c.id = b.cliente_id
            where b.stato = 'Confermata' and b.data_consegna = p_data and b.tipo <> 'Magazzino' and not b.fuori_dai_giri
              and not exists (select 1 from public.fermate f where f.bolla_id = b.id and f.esito = 'Da fare')
            order by b.citta nulls last, b.fascia nulls last loop
    v_giro := null;
    select g.id into v_giro from public.giri g join public.fermate f on f.giro_id = g.id join public.bolle b2 on b2.id = f.bolla_id
     where g.data = p_data and b2.citta is not distinct from r.citta limit 1;
    if v_giro is null then
      insert into public.giri (data, mezzo_id, autista_id, zona)
      select p_data, m.id, m.autista_id, r.citta from public.mezzi m
       where m.id = v_mezzi[(v_i % array_length(v_mezzi, 1)) + 1]
      on conflict (data, mezzo_id) do update set zona = public.giri.zona
      returning id into v_giro;
      v_i := v_i + 1;
    end if;
    select coalesce(max(ordine), 0) + 1 into v_ord from public.fermate where giro_id = v_giro;
    insert into public.fermate (giro_id, bolla_id, ordine) values (v_giro, r.id, v_ord);
    -- giro già confermato: torna da confermare, con scritto cosa è cambiato
    update public.giri set da_confermare = da_confermare || ('Aggiunta ' || r.cliente || coalesce(' · ' || r.citta, '')),
                           confermato_il = null, confermato_da = null
     where id = v_giro and confermato_il is not null;
    update public.giri set da_confermare = da_confermare || ('Aggiunta ' || r.cliente || coalesce(' · ' || r.citta, ''))
     where id = v_giro and cardinality(da_confermare) > 0 and not (('Aggiunta ' || r.cliente || coalesce(' · ' || r.citta, '')) = any(da_confermare));
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    insert into public.giri_preparazioni (data, assegnate, giri, nota)
    values (p_data, v_n, (select count(*) from public.giri where data = p_data), null);
    perform public.registra('trasporti', 'Giri', v_n || ' spedizioni messe nei giri del ' || to_char(p_data, 'DD/MM'), null, 'Sistema', 'giri', p_data::text);
  end if;
  return v_n;
end $$;
revoke execute on function public.prepara_giri_sistema(date) from public, anon, authenticated;

-- il vecchio tasto resta per l'ufficio (non più nel gestionale), con il suo controllo
create or replace function public.proponi_giri(p_data date) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('traffico')) then raise exception 'Solo il traffico propone i giri'; end if;
  return public.prepara_giri_sistema(p_data);
end $$;

-- ogni ora dal lunedì al venerdì; lavora solo all'ora scelta (ora di Roma).
-- Il venerdì prepara anche il lunedì (il sabato si consegna solo su richiesta: se ci sono bolle per sabato, entrano anche quelle).
create or replace function public.prepara_giri_pianificato() returns integer
language plpgsql security definer set search_path = public as $$
declare v_ora int := coalesce((select (valore #>> '{}')::int from public.impostazioni where chiave = 'ora_giri'), 15);
        v_roma timestamp := now() at time zone 'Europe/Rome'; v_n int := 0; v_giorno date := (now() at time zone 'Europe/Rome')::date;
begin
  if extract(hour from v_roma) <> v_ora or extract(isodow from v_roma) > 5 then return 0; end if;
  v_n := public.prepara_giri_sistema(v_giorno + 1);
  if extract(isodow from v_roma) = 5 then v_n := v_n + public.prepara_giri_sistema(v_giorno + 3); end if;
  return v_n;
end $$;
revoke execute on function public.prepara_giri_pianificato() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('messina-giri', '0 * * * 1-5', $c$select public.prepara_giri_pianificato()$c$);
  else
    raise notice 'pg_cron non presente: la preparazione dei giri va attivata dopo (docs/SETUP.md)';
  end if;
end $$;

-- spedizione confermata dopo che i giri di quel giorno sono già pronti: entra subito in un giro
create or replace function public.bolle_nei_giri() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'Confermata' and new.tipo <> 'Magazzino' and new.data_consegna > current_date and not new.fuori_dai_giri
     and (tg_op = 'INSERT' or old.stato = 'Nuova' or old.data_consegna is distinct from new.data_consegna)
     and exists (select 1 from public.giri where data = new.data_consegna)
     and not exists (select 1 from public.fermate where bolla_id = new.id and esito = 'Da fare') then
    perform public.prepara_giri_sistema(new.data_consegna);
  end if;
  return null;
end $$;
create trigger bolle_nei_giri after insert or update of stato, data_consegna on public.bolle
  for each row execute function public.bolle_nei_giri();

create or replace function public.conferma_giri(p_data date) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('traffico')) then raise exception 'Non autorizzato'; end if;
  update public.giri set confermato_il = now(), confermato_da = auth.uid(), da_confermare = '{}'
   where data = p_data and confermato_il is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nessun giro da confermare per il %', to_char(p_data, 'DD/MM'); end if;
  perform public.registra('trasporti', 'Giri', n || ' giri confermati per il ' || to_char(p_data, 'DD/MM'), null, 'Sistema', 'giri', p_data::text);
  return n;
end $$;

-- ------------------------------------------------------------------ Avvisi all'autista
create table public.avvisi_autista (
  id            uuid primary key default gen_random_uuid(),
  dipendente_id uuid not null references public.dipendenti(id),
  giro_id       uuid references public.giri(id) on delete cascade,
  testo         text not null,
  creato_il     timestamptz not null default now(),
  letto_il      timestamptz
);
create index avvisi_autista_da_leggere on public.avvisi_autista (dipendente_id) where letto_il is null;
alter table public.avvisi_autista enable row level security;
create policy avvisi_lettura on public.avvisi_autista for select to authenticated
  using (dipendente_id = public.mio_dipendente() or (public.staff_di('trasporti') and public.ha_ruolo('traffico')));
grant select on public.avvisi_autista to authenticated;

create or replace function public.miei_avvisi() returns setof public.avvisi_autista
language sql stable security definer set search_path = public as $$
  select * from public.avvisi_autista where dipendente_id = public.mio_dipendente() and letto_il is null order by creato_il
$$;
create or replace function public.avviso_letto(p_avviso uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.avvisi_autista set letto_il = now() where id = p_avviso and dipendente_id = public.mio_dipendente() and letto_il is null;
  if not found then raise exception 'Avviso non trovato'; end if;
end $$;
revoke execute on function public.miei_avvisi(), public.avviso_letto(uuid) from public, anon;
grant execute on function public.miei_avvisi(), public.avviso_letto(uuid) to authenticated;

-- ------------------------------------------------------------------ Modifiche al giro (Mauro e Nelson)
-- ogni modifica: Storico, e se il giro è confermato e l'autista è partito, l'avviso nella sua app
create or replace function public.giro_cambiato(p_giro uuid, p_cosa text) returns void
language plpgsql security definer set search_path = public as $$
declare g public.giri;
begin
  select * into g from public.giri where id = p_giro;
  perform public.registra('trasporti', 'Giro', p_cosa, (select coalesce(m.targa, m.tipo::text) from public.mezzi m where m.id = g.mezzo_id), 'Manuale', 'giri', g.id::text);
  if g.confermato_il is not null and g.stato = 'Partito' then
    insert into public.avvisi_autista (dipendente_id, giro_id, testo) values (g.autista_id, g.id, 'Il tuo giro è cambiato: ' || p_cosa);
  end if;
end $$;
revoke execute on function public.giro_cambiato(uuid, text) from public, anon, authenticated;

create or replace function public.fermata_traffico(p_fermata uuid) returns public.fermate
language plpgsql security definer set search_path = public as $$
declare f public.fermate;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('traffico')) then raise exception 'Solo il traffico modifica i giri'; end if;
  select * into f from public.fermate where id = p_fermata for update;
  if f.id is null then raise exception 'Fermata non trovata'; end if;
  if f.esito <> 'Da fare' then raise exception 'Fermata già chiusa: non si sposta'; end if;
  if f.firmata then raise exception 'Il cliente ha già firmato'; end if;
  return f;
end $$;
revoke execute on function public.fermata_traffico(uuid) from public, anon, authenticated;

create or replace function public.cliente_fermata(p_fermata uuid) returns text
language sql stable security definer set search_path = public as $$
  select c.nome || coalesce(' · ' || b.citta, '') from public.fermate f join public.bolle b on b.id = f.bolla_id join public.clienti c on c.id = b.cliente_id where f.id = p_fermata
$$;
revoke execute on function public.cliente_fermata(uuid) from public, anon, authenticated;

-- Su / Giù: scambia con la fermata vicina (solo tra fermate ancora da fare)
create or replace function public.giro_ordine(p_fermata uuid, p_su boolean) returns void
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_traffico(p_fermata); v public.fermate;
begin
  select * into v from public.fermate where giro_id = f.giro_id
     and case when p_su then ordine < f.ordine else ordine > f.ordine end
   order by case when p_su then -ordine else ordine end limit 1 for update;
  if v.id is null then raise exception 'È già %', case when p_su then 'la prima' else 'l''ultima' end; end if;
  if v.esito <> 'Da fare' then raise exception 'Non si sposta prima di una fermata già fatta'; end if;
  update public.fermate set ordine = -1 where id = f.id;
  update public.fermate set ordine = f.ordine where id = v.id;
  update public.fermate set ordine = v.ordine where id = f.id;
  perform public.giro_cambiato(f.giro_id, public.cliente_fermata(f.id) || case when p_su then ' anticipata' else ' posticipata' end || ' alla fermata ' || v.ordine);
end $$;

-- fascia oraria e accessori dell'ultimo momento (quelli della bolla confermata restano: vanno in fattura)
create or replace function public.giro_modifica(p_fermata uuid, p_fascia text, p_accessori text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_traffico(p_fermata); v_bolla text[]; v_cosa text := '';
begin
  if coalesce(trim(p_fascia), '') <> '' then
    update public.bolle set fascia = trim(p_fascia) where id = f.bolla_id and fascia is distinct from trim(p_fascia);
    if found then v_cosa := 'fascia ' || trim(p_fascia); end if;
  end if;
  select accessori into v_bolla from public.bolle where id = f.bolla_id;
  -- tolti: solo quelli aggiunti dopo (in fattura da soli)
  delete from public.accessori_extra where fermata_id = f.id and not (voce = any(coalesce(p_accessori, '{}')));
  insert into public.accessori_extra (fermata_id, voce)
  select f.id, a from unnest(coalesce(p_accessori, '{}')) a
   where not (a = any(v_bolla)) and not exists (select 1 from public.accessori_extra x where x.fermata_id = f.id and x.voce = a);
  v_cosa := concat_ws(', ', nullif(v_cosa, ''), 'accessori: ' || coalesce(nullif(array_to_string(v_bolla || array(select voce from public.accessori_extra where fermata_id = f.id order by voce), ', '), ''), 'nessuno'));
  perform public.giro_cambiato(f.giro_id, public.cliente_fermata(f.id) || ': ' || v_cosa);
end $$;

-- «Passa a…»: la fermata va in fondo al giro di un altro mezzo, stesso giorno
create or replace function public.giro_passa(p_fermata uuid, p_giro uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_traffico(p_fermata); g_da public.giri; g_a public.giri; v_nuova uuid; v_cli text := public.cliente_fermata(p_fermata);
begin
  select * into g_da from public.giri where id = f.giro_id;
  select * into g_a from public.giri where id = p_giro;
  if g_a.id is null or g_a.data <> g_da.data then raise exception 'Il giro di destinazione deve essere dello stesso giorno'; end if;
  if g_a.id = g_da.id then raise exception 'È già in questo giro'; end if;
  if g_a.stato in ('Rientrato', 'Chiuso') then raise exception 'Il giro di destinazione è già finito'; end if;
  insert into public.fermate (giro_id, bolla_id, ordine)
  values (g_a.id, f.bolla_id, (select coalesce(max(ordine), 0) + 1 from public.fermate where giro_id = g_a.id)) returning id into v_nuova;
  insert into public.accessori_extra (fermata_id, voce, aggiunto_il) select v_nuova, voce, aggiunto_il from public.accessori_extra where fermata_id = f.id;
  delete from public.fermate where id = f.id;
  perform public.giro_cambiato(g_da.id, v_cli || ' passata al giro di ' || (select nome from public.dipendenti where id = g_a.autista_id));
  perform public.giro_cambiato(g_a.id, v_cli || ' aggiunta in fondo al giro');
end $$;

-- Togli: torna tra le spedizioni da assegnare
create or replace function public.giro_togli(p_fermata uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_traffico(p_fermata); v_cli text := public.cliente_fermata(p_fermata);
begin
  delete from public.fermate where id = f.id;
  update public.bolle set fuori_dai_giri = true, stato = 'Confermata' where id = f.bolla_id;
  perform public.giro_cambiato(f.giro_id, v_cli || ' tolta dal giro: torna da assegnare');
end $$;

-- «+ Aggiungi fermata»: una spedizione da assegnare in fondo al giro
create or replace function public.giro_aggiungi(p_giro uuid, p_bolla uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g public.giri; b public.bolle;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('traffico')) then raise exception 'Solo il traffico modifica i giri'; end if;
  select * into g from public.giri where id = p_giro;
  select * into b from public.bolle where id = p_bolla;
  if g.id is null or b.id is null then raise exception 'Giro o spedizione non trovati'; end if;
  if g.stato in ('Rientrato', 'Chiuso') then raise exception 'Il giro è già finito'; end if;
  if b.data_consegna is distinct from g.data then raise exception 'La spedizione è per un altro giorno'; end if;
  if exists (select 1 from public.fermate where bolla_id = b.id and esito = 'Da fare') then raise exception 'La spedizione è già in un giro'; end if;
  if b.stato <> 'Confermata' then raise exception 'La spedizione non è confermata'; end if;
  update public.bolle set fuori_dai_giri = false where id = b.id and fuori_dai_giri;
  insert into public.fermate (giro_id, bolla_id, ordine) values (g.id, b.id, (select coalesce(max(ordine), 0) + 1 from public.fermate where giro_id = g.id));
  perform public.giro_cambiato(g.id, (select nome from public.clienti where id = b.cliente_id) || coalesce(' · ' || b.citta, '') || ' aggiunta al giro');
end $$;

revoke execute on function public.giro_ordine(uuid, boolean), public.giro_modifica(uuid, text, text[]), public.giro_passa(uuid, uuid),
  public.giro_togli(uuid), public.giro_aggiungi(uuid, uuid) from public, anon;
grant execute on function public.giro_ordine(uuid, boolean), public.giro_modifica(uuid, text, text[]), public.giro_passa(uuid, uuid),
  public.giro_togli(uuid), public.giro_aggiungi(uuid, uuid) to authenticated;

-- regola «restrictive» del doppio fattore anche sulle tabelle nuove (vedi 20261021000100)
create policy doppio_fattore on public.giri_preparazioni as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());
create policy doppio_fattore on public.avvisi_autista as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());
