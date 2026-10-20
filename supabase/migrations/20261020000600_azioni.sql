-- =====================================================================
-- Azioni delle app (autisti, magazzino) e Anomalie.
-- Le app non scrivono direttamente nelle tabelle delicate: chiamano
-- queste funzioni, che controllano chi sei, cosa puoi toccare e che
-- i numeri tornino, e scrivono lo storico.
-- =====================================================================

create table public.impostazioni (
  chiave  text primary key,
  valore  jsonb not null,
  nota    text
);
insert into public.impostazioni values
  ('soglia_nitidezza', '35', 'Minimo di nitidezza della foto della bolla: si parte morbidi e si tara con le bolle vere');
alter table public.impostazioni enable row level security;
create policy impostazioni_lettura on public.impostazioni for select to authenticated using (true);
create policy impostazioni_scrittura on public.impostazioni for update to authenticated
  using (public.ha_ruolo('direzione')) with check (public.ha_ruolo('direzione'));
grant select, update on public.impostazioni to authenticated;

-- ---------------------------------------------------------------- autisti
create or replace function public.fermata_mia(p_fermata uuid) returns public.fermate
language plpgsql stable security definer set search_path = public as $$
declare f public.fermate;
begin
  select * into f from public.fermate where id = p_fermata;
  if f.id is null or not public.mio_giro(f.giro_id) then raise exception 'Fermata non tua'; end if;
  if f.esito <> 'Da fare' then raise exception 'Fermata già chiusa'; end if;
  return f;
end $$;

-- 1 · Colli: l'autista scansiona i colli che scarica
create or replace function public.scansiona_consegna(p_fermata uuid, p_codice text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata); n int; tot int;
begin
  update public.colli set letto_consegna = coalesce(letto_consegna, now())
   where bolla_id = f.bolla_id and codice = p_codice;
  if not found then raise exception 'Questo collo non è di questa consegna'; end if;
  select count(*), count(letto_consegna) into tot, n from public.colli where bolla_id = f.bolla_id;
  return jsonb_build_object('letti', n, 'totale', tot);
end $$;

-- 2 · Accessori: uno in più aggiunto sul posto va da solo in fattura
create or replace function public.aggiungi_accessorio(p_fermata uuid, p_voce text, p_lat float8 default null, p_lng float8 default null)
returns void language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
begin
  insert into public.accessori_extra (fermata_id, voce, lat, lng) values (f.id, p_voce, p_lat, p_lng);
end $$;

-- 3 · Firma
create or replace function public.firma_fermata(p_fermata uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
begin
  update public.fermate set firmata = true where id = f.id;
end $$;

-- 4 · Bolla: la foto è già nello storage; il telefono manda la nitidezza misurata
create or replace function public.foto_bolla(p_fermata uuid, p_percorso text, p_nitidezza numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
        v_soglia numeric := (select valore::text::numeric from public.impostazioni where chiave = 'soglia_nitidezza');
begin
  if p_nitidezza < v_soglia then
    return jsonb_build_object('ok', false, 'motivo', 'Rifai', 'nitidezza', p_nitidezza, 'soglia', v_soglia);
  end if;
  update public.fermate set foto_bolla = p_percorso, nitidezza = p_nitidezza where id = f.id;
  return jsonb_build_object('ok', true, 'nitidezza', p_nitidezza, 'soglia', v_soglia);
end $$;

-- Conferma: chiude la consegna (il trigger controlla colli, firma e foto)
create or replace function public.chiudi_fermata(
  p_fermata uuid, p_consegnata boolean, p_motivo text default null, p_dopo public.dopo_mancata default null,
  p_lat float8 default null, p_lng float8 default null
) returns void language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
begin
  update public.fermate
     set esito = case when p_consegnata then 'Consegnata'::public.esito_fermata else 'Non consegnata'::public.esito_fermata end,
         motivo = p_motivo, dopo = p_dopo, lat = p_lat, lng = p_lng
   where id = f.id;
end $$;

-- -------------------------------------------------------------- magazzino
create sequence public.codice_bancale_seq start 150;

create or replace function public.nuovo_bancale(p_cliente uuid, p_posto text) returns text
language plpgsql security definer set search_path = public as $$
declare v_codice text; v_posto uuid;
begin
  if not public.ha_ruolo('magazzino', 'vendite', 'stage') then raise exception 'Non puoi creare bancali'; end if;
  if not (public.staff_di('trasporti') or exists (
      select 1 from public.clienti where id = p_cliente and azienda_collegata = public.mia_azienda())) then
    raise exception 'Cliente non tuo';
  end if;
  select id into v_posto from public.posti where codice = p_posto and attivo;
  if v_posto is null then raise exception 'Posto % inesistente', p_posto; end if;
  v_codice := 'B-' || lpad(nextval('public.codice_bancale_seq')::text, 4, '0');
  insert into public.bancali (codice, cliente_id, posto_id) values (v_codice, p_cliente, v_posto);
  perform public.registra(public.mia_azienda(), 'Entrata', 'Bancale nuovo ' || v_codice, p_posto, 'Pistola', 'bancali', v_codice);
  return v_codice;
end $$;

create or replace function public.trasferisci(p_bancale text, p_posto text) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bancali; v_da text; v_a uuid;
begin
  select * into b from public.bancali where codice = p_bancale;
  if b.id is null or not public.bancale_visibile(b.id) or not public.ha_ruolo('magazzino') then
    raise exception 'Bancale non trovato';
  end if;
  select codice into v_da from public.posti where id = b.posto_id;
  select id into v_a from public.posti where codice = p_posto and attivo;
  if v_a is null then raise exception 'Posto % inesistente', p_posto; end if;
  update public.bancali set posto_id = v_a where id = b.id;
  perform public.registra(public.mia_azienda(), 'Trasferimento', p_bancale, coalesce(v_da, '—') || ' → ' || p_posto, 'Pistola', 'bancali', b.id::text);
end $$;

-- lettura di un collo in entrata o in carico sul mezzo
create or replace function public.scansiona_collo(p_codice text, p_fase text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k public.colli; tot int; n int;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  select * into k from public.colli where codice = p_codice;
  if k.id is null then raise exception 'Collo sconosciuto: %', p_codice; end if;
  if p_fase = 'Entrata' then update public.colli set letto_entrata = coalesce(letto_entrata, now()) where id = k.id;
  elsif p_fase = 'Carico' then update public.colli set letto_carico = coalesce(letto_carico, now()) where id = k.id;
  else raise exception 'Fase sconosciuta'; end if;
  perform public.registra('trasporti', p_fase, 'Collo ' || p_codice, null, 'Pistola', 'colli', k.id::text);
  select count(*), count(case when p_fase = 'Entrata' then letto_entrata else letto_carico end)
    into tot, n from public.colli where bolla_id = k.bolla_id;
  return jsonb_build_object('bolla', k.bolla_id, 'letti', n, 'totale', tot);
end $$;

-- ----------------------------------------------------------------- missioni
create or replace function public.lancia_missione(p_ambito text, p_filtro text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('traffico', 'amministrazione')) then
    raise exception 'Le missioni le lancia l''ufficio';
  end if;
  insert into public.missioni (ambito, filtro, creata_da) values (p_ambito, p_filtro, auth.uid()) returning id into v_id;
  insert into public.missioni_posti (missione_id, posto_id, attesi)
  select v_id, p.id,
         coalesce((select jsonb_agg(jsonb_build_object('articolo', c.articolo, 'codice', cod))
                   from public.bancali b join public.contenuto c on c.bancale_id = b.id
                   cross join lateral unnest(c.codici) cod
                   where b.posto_id = p.id and b.uscito_il is null), '[]')
  from public.posti p
  where p.attivo and p.zona = 'Scaffale' and (
        p_ambito = 'Tutto'
     or (p_ambito = 'Scaffale' and p.codice like p_filtro || '-%')
     or (p_ambito = 'Zona' and p.codice like p_filtro || '%')
     or (p_ambito = 'Cliente' and exists (select 1 from public.bancali b join public.clienti c on c.id = b.cliente_id
                                           where b.posto_id = p.id and c.nome = p_filtro)));
  perform public.registra('trasporti', 'Missione', 'Lanciata: ' || p_ambito || ' ' || coalesce(p_filtro, ''), null, 'Sistema', 'missioni', v_id::text);
  return v_id;
end $$;

-- il magazziniere scansiona un pezzo nel posto; se torna tutto il posto si chiude da solo
create or replace function public.scansiona_missione(p_posto uuid, p_codice text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mp public.missioni_posti; v_attesi jsonb; v_letti jsonb; v_manc jsonb; v_extra jsonb;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  select * into mp from public.missioni_posti where id = p_posto for update;
  if mp.stato <> 'Da fare' then raise exception 'Posto già chiuso o bloccato'; end if;
  v_letti := case when mp.letti ? p_codice then mp.letti else mp.letti || to_jsonb(p_codice) end;
  select coalesce(jsonb_agg(a), '[]') into v_manc from jsonb_array_elements(mp.attesi) a where not v_letti ? (a ->> 'codice');
  select coalesce(jsonb_agg(l), '[]') into v_extra from jsonb_array_elements_text(v_letti) l
   where not exists (select 1 from jsonb_array_elements(mp.attesi) a where a ->> 'codice' = l);
  update public.missioni_posti set letti = v_letti, mancanti = v_manc, extra = v_extra,
         stato = case when jsonb_array_length(v_manc) = 0 and jsonb_array_length(v_extra) = 0 then 'Fatto'::public.stato_posto_missione
                      else 'Da fare'::public.stato_posto_missione end
   where id = mp.id;
  return jsonb_build_object('letti', jsonb_array_length(v_letti), 'attesi', jsonb_array_length(mp.attesi),
                            'extra', v_extra, 'chiuso', jsonb_array_length(v_manc) = 0 and jsonb_array_length(v_extra) = 0);
end $$;

-- "Segnala": il posto non torna, resta bloccato e va all'ufficio
create or replace function public.segnala_posto(p_posto uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mp public.missioni_posti; v_manc jsonb;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  select * into mp from public.missioni_posti where id = p_posto for update;
  if mp.stato <> 'Da fare' then raise exception 'Posto già chiuso o bloccato'; end if;
  select coalesce(jsonb_agg(a), '[]') into v_manc from jsonb_array_elements(mp.attesi) a where not mp.letti ? (a ->> 'codice');
  update public.missioni_posti set mancanti = v_manc, stato = 'Bloccato' where id = mp.id;
end $$;

-- lo sblocca solo l'ufficio, scrivendo cosa è successo
create or replace function public.sblocca_posto(p_posto uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_di('trasporti') then raise exception 'Non autorizzato'; end if;
  update public.missioni_posti set stato = 'Sbloccato', motivo = p_motivo where id = p_posto;
end $$;

revoke insert on public.missioni from authenticated;
drop policy if exists missioni_lancio on public.missioni;

-- ------------------------------------------------------------------ anomalie
-- Tutto quello che non torna, da ogni sezione. security_invoker: ognuno
-- vede solo le anomalie dei dati che può già vedere.
create or replace view public.anomalie with (security_invoker = true) as
  select 'Magazzino'::text as sezione, cc.cliente || ' · ' || lower(cc.tipo) || ' ' || cc.letti || ' di ' || cc.attesi || ' colli' as cosa,
         'Magazzino'::text as chi, cc.ultima_lettura as da, 'magazzino/controllo'::text as dove, cc.bolla_id::text as rif
    from public.controllo_colli cc where cc.letti > 0 and cc.letti <> cc.attesi
  union all
  select 'Missioni', p.codice || ' bloccato: ' || (jsonb_array_length(mp.mancanti) + jsonb_array_length(mp.extra)) || ' pezzi non tornano',
         'Ufficio', mp.aggiornato_il, 'magazzino/missioni', mp.id::text
    from public.missioni_posti mp join public.posti p on p.id = mp.posto_id where mp.stato = 'Bloccato'
  union all
  select 'Bolle', c.nome || ' · manca ' || lower(array_to_string(b.dati_mancanti, ', ')),
         coalesce(pr.nome, 'Ufficio bolle'), b.creata_il, 'bolle', b.id::text
    from public.bolle b join public.clienti c on c.id = b.cliente_id left join public.profili pr on pr.id = b.operatore_id
   where b.stato = 'Nuova' and cardinality(b.dati_mancanti) > 0
  union all
  select 'Presenze', d.nome || ' · ' || t.motivo, 'Direzione', t.quando, 'presenze/allarmi', t.id::text
    from public.timbrature t join public.dipendenti d on d.id = t.dipendente_id
   where t.esito = 'Rifiutata' and t.quando > now() - interval '7 days'
  union all
  select 'Presenze', d.nome || ' · uscita non timbrata il ' || to_char(e.quando, 'DD/MM'), 'Amministrazione', e.quando, 'presenze/correzioni', e.id::text
    from public.timbrature e join public.dipendenti d on d.id = e.dipendente_id
   where e.esito = 'Valida' and e.verso = 'Entrata' and e.quando::date < current_date and e.quando > now() - interval '31 days'
     and not exists (select 1 from public.timbrature u where u.dipendente_id = e.dipendente_id and u.esito = 'Valida'
                     and u.verso = 'Uscita' and u.quando::date = e.quando::date and u.quando > e.quando)
     and not exists (select 1 from public.correzioni k where k.dipendente_id = e.dipendente_id
                     and k.giorno = e.quando::date and k.verso = 'Uscita')
  union all
  select 'Fatturazione', c.nome || ' · fattura da controllare: ' || coalesce(f.problema, ''), 'Amministrazione', f.creata_il, 'fatture', f.id::text
    from public.fatture f join public.clienti c on c.id = f.cliente_id where f.stato = 'Da controllare';

grant select on public.anomalie to authenticated;

grant execute on function
  public.scansiona_consegna(uuid, text), public.aggiungi_accessorio(uuid, text, float8, float8),
  public.firma_fermata(uuid), public.foto_bolla(uuid, text, numeric),
  public.chiudi_fermata(uuid, boolean, text, public.dopo_mancata, float8, float8),
  public.nuovo_bancale(uuid, text), public.trasferisci(text, text), public.scansiona_collo(text, text),
  public.lancia_missione(text, text), public.scansiona_missione(uuid, text), public.segnala_posto(uuid),
  public.sblocca_posto(uuid, text), public.valore_bolla(uuid)
to authenticated;
