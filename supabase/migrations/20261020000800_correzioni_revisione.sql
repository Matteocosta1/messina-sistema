-- =====================================================================
-- Correzioni dopo la revisione di sicurezza (20 ottobre 2026).
-- Ogni blocco chiude un modo, verificato, di aggirare le regole.
-- =====================================================================

-- 1 · Bolle: solo passaggi in avanti, dati bloccati dopo la conferma -------
create or replace function public.bolle_regole() returns trigger
language plpgsql security definer set search_path = public as $$
declare dal_sistema boolean := pg_trigger_depth() > 1;  -- arriva dal trigger delle fermate
begin
  if tg_op = 'INSERT' then
    if new.stato <> 'Nuova' or new.numero is not null or new.confermata_il is not null then
      raise exception 'Una bolla nasce Nuova e senza numero';
    end if;
    return new;
  end if;

  if old.stato = 'Nuova' and new.numero is distinct from old.numero then raise exception 'Il numero lo assegna il sistema'; end if;
  if old.stato <> 'Nuova' and (new.numero, new.cliente_id, new.indirizzo, new.colli_previsti, new.accessori, new.tipo, new.confermata_il, new.confermata_da)
       is distinct from (old.numero, old.cliente_id, old.indirizzo, old.colli_previsti, old.accessori, old.tipo, old.confermata_il, old.confermata_da) then
    raise exception 'Bolla confermata: cliente, indirizzo, colli e accessori non si cambiano più';
  end if;

  if new.stato is distinct from old.stato then
    if not (
         (old.stato = 'Nuova' and new.stato in ('Confermata', 'Annullata'))
      or (old.stato = 'Confermata' and new.stato in ('In giro', 'Annullata'))
      or (old.stato = 'In giro' and new.stato = 'Confermata')                       -- tolta dal giro
      or (old.stato in ('Non consegnata', 'Giacenza') and new.stato = 'Confermata')  -- rimessa in giro
      or (old.stato in ('Consegnata', 'Non consegnata', 'Giacenza') and new.stato = 'Fatturata')
      or (dal_sistema and new.stato in ('Consegnata', 'Non consegnata', 'Giacenza'))
    ) then
      raise exception 'Passaggio non permesso: % → %', old.stato, new.stato;
    end if;
  end if;

  if new.stato = 'Confermata' and old.stato = 'Nuova' then
    if cardinality(new.dati_mancanti) > 0 then
      raise exception 'Bolla bloccata: manca %', array_to_string(new.dati_mancanti, ', ');
    end if;
    if new.data_consegna is null or new.indirizzo is null or coalesce(new.colli_previsti, 0) = 0 then
      raise exception 'Bolla bloccata: servono data, indirizzo e colli';
    end if;
    new.numero := to_char(now(), 'YY') || '-' || lpad(nextval('public.numero_bolla_seq')::text, 6, '0');
    new.confermata_il := now();
    new.confermata_da := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists bolle_regole on public.bolle;
create trigger bolle_regole before insert or update on public.bolle
  for each row execute function public.bolle_regole();

-- 2 · Fermate: nascono "Da fare", si chiudono una volta sola, con i controlli veri ---
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
drop trigger if exists fermate_regole on public.fermate;
create trigger fermate_regole before insert or update on public.fermate
  for each row execute function public.fermate_regole();

-- la foto deve esistere davvero nello storage, caricata da chi chiude la consegna
create or replace function public.foto_bolla(p_fermata uuid, p_percorso text, p_nitidezza numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
        v_soglia numeric := (select valore::text::numeric from public.impostazioni where chiave = 'soglia_nitidezza');
        v_esiste boolean := true;
begin
  if p_percorso not like 'bolle/' || p_fermata::text || '/%' then raise exception 'Percorso della foto non valido'; end if;
  if to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects where bucket_id = ''bolle'' and name = $1 and owner = $2)'
      into v_esiste using substr(p_percorso, 7), auth.uid();
  end if;
  if not v_esiste then raise exception 'La foto non è stata caricata'; end if;
  if p_nitidezza < v_soglia then
    return jsonb_build_object('ok', false, 'motivo', 'Rifai', 'nitidezza', p_nitidezza, 'soglia', v_soglia);
  end if;
  update public.fermate set foto_bolla = p_percorso, nitidezza = p_nitidezza where id = f.id;
  return jsonb_build_object('ok', true, 'nitidezza', p_nitidezza, 'soglia', v_soglia);
end $$;

-- accessori: solo voci con tariffa del cliente, una volta per fermata
alter table public.accessori_extra add constraint accessori_una_volta unique (fermata_id, voce);
create or replace function public.aggiungi_accessorio(p_fermata uuid, p_voce text, p_lat float8 default null, p_lng float8 default null)
returns void language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
begin
  if p_voce = 'Base' or not exists (
      select 1 from public.tariffe t join public.bolle b on b.cliente_id = t.cliente_id
      where b.id = f.bolla_id and t.voce = p_voce) then
    raise exception 'Accessorio non previsto per questo cliente: avvisa l''ufficio';
  end if;
  insert into public.accessori_extra (fermata_id, voce, lat, lng) values (f.id, p_voce, p_lat, p_lng)
  on conflict (fermata_id, voce) do nothing;
end $$;

-- 3 · Fatture: solo in avanti, bloccate dopo l'invio ----------------------------
create or replace function public.fatture_regole() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.stato not in ('Bozza', 'Da controllare', 'Pronta') or new.inviata_il is not null or new.pagata_il is not null then
      raise exception 'Una fattura nasce in bozza, da controllare o pronta';
    end if;
    if new.stato = 'Pronta' and coalesce(new.problema, '') <> '' then raise exception 'Fattura da controllare: %', new.problema; end if;
    return new;
  end if;
  if old.stato in ('Inviata', 'Pagata') and (new.imponibile, new.iva, new.cliente_id, new.periodo, new.azienda)
       is distinct from (old.imponibile, old.iva, old.cliente_id, old.periodo, old.azienda) then
    raise exception 'Fattura inviata: non si modifica, si fa una nota di credito';
  end if;
  if old.numero is not null and new.numero is distinct from old.numero then raise exception 'Il numero non si cambia'; end if;
  if new.stato is distinct from old.stato then
    if not (
         (old.stato = 'Bozza' and new.stato in ('Da controllare', 'Pronta'))
      or (old.stato = 'Da controllare' and new.stato in ('Bozza', 'Pronta'))
      or (old.stato = 'Pronta' and new.stato in ('Bozza', 'Da controllare', 'Inviata'))
      or (old.stato = 'Inviata' and new.stato = 'Pagata')
    ) then
      raise exception 'Passaggio non permesso: % → %', old.stato, new.stato;
    end if;
    if new.stato = 'Inviata' then new.approvata_da := auth.uid(); new.inviata_il := now(); end if;
    if new.stato = 'Pagata' then new.pagata_il := coalesce(new.pagata_il, current_date); end if;
    if new.stato = 'Pronta' and coalesce(new.problema, '') <> '' then raise exception 'Fattura da controllare: %', new.problema; end if;
  end if;
  return new;
end $$;
drop trigger if exists fatture_regole on public.fatture;
create trigger fatture_regole before insert or update on public.fatture
  for each row execute function public.fatture_regole();

create or replace function public.righe_fattura_bloccate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.fatture where id = coalesce(new.fattura_id, old.fattura_id) and stato in ('Inviata', 'Pagata'))
     or (tg_op = 'UPDATE' and exists (select 1 from public.fatture where id = old.fattura_id and stato in ('Inviata', 'Pagata'))) then
    raise exception 'Fattura inviata: le righe non si toccano';
  end if;
  return coalesce(new, old);
end $$;
create trigger righe_fattura_bloccate before insert or update or delete on public.righe_fattura
  for each row execute function public.righe_fattura_bloccate();

-- 4 · Badge presenze: un codice vale una volta, finestra stretta, niente allarmi falsi ---
create table public.badge_usati (
  badge_id uuid not null references public.badge(id),
  finestra bigint not null,
  primary key (badge_id, finestra)
);
alter table public.badge_usati enable row level security;
revoke all on public.badge_usati from authenticated, anon;

create or replace function public.timbra(p_codice text, p_lettore text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_parti text[] := string_to_array(p_codice, '.');
  v_badge public.badge; v_finestra bigint; v_ora bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_ultimo public.timbrature; v_verso text; v_motivo text; v_chi uuid;
begin
  if coalesce(array_length(v_parti, 1), 0) <> 3 then
    insert into public.timbrature (esito, motivo, lettore) values ('Rifiutata', 'Codice non valido', p_lettore);
    return jsonb_build_object('ok', false, 'motivo', 'Codice non valido');
  end if;
  begin
    select * into v_badge from public.badge where id = v_parti[1]::uuid;
    v_finestra := v_parti[2]::bigint;
  exception when others then v_badge := null;
  end;
  if v_badge.id is null then v_motivo := 'Badge sconosciuto';
  elsif public.codice_badge(v_badge.id, v_finestra) <> p_codice then v_motivo := 'Firma non valida';
  else
    v_chi := v_badge.dipendente_id;  -- da qui in poi il codice è autentico: sappiamo di chi è
    if not v_badge.attivo then v_motivo := 'Badge disattivato';
    elsif v_finestra not in (v_ora - 1, v_ora) then v_motivo := 'Codice scaduto (foto o screenshot?)';
    else
      begin
        insert into public.badge_usati (badge_id, finestra) values (v_badge.id, v_finestra);
      exception when unique_violation then v_motivo := 'Codice già usato (foto o screenshot?)';
      end;
    end if;
  end if;
  if v_motivo is not null then
    -- con firma falsa o badge sconosciuto non si accusa nessuno: dipendente vuoto
    insert into public.timbrature (dipendente_id, badge_id, esito, motivo, lettore)
    values (v_chi, case when v_chi is null then null else v_badge.id end, 'Rifiutata', v_motivo, p_lettore);
    return jsonb_build_object('ok', false, 'motivo', v_motivo);
  end if;
  select * into v_ultimo from public.timbrature
   where dipendente_id = v_chi and esito = 'Valida' order by quando desc limit 1;
  if v_ultimo.quando > now() - interval '60 seconds' then
    return jsonb_build_object('ok', false, 'motivo', 'Già timbrato');
  end if;
  v_verso := case when v_ultimo.verso = 'Entrata' and v_ultimo.quando::date = current_date then 'Uscita' else 'Entrata' end;
  insert into public.timbrature (dipendente_id, badge_id, verso, esito, lettore, dispositivo)
  values (v_chi, v_badge.id, v_verso, 'Valida', p_lettore, v_badge.dispositivo);
  return jsonb_build_object('ok', true, 'verso', v_verso, 'nome', (select nome from public.dipendenti where id = v_chi));
end $$;

-- 5 · Missioni: il magazziniere vede cosa c'è (articoli e quantità) ma non i codici ---
drop policy if exists missioni_posti_lettura on public.missioni_posti;
create policy missioni_posti_lettura on public.missioni_posti for select to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('traffico', 'amministrazione'));

create or replace view public.missioni_posti_app as
select mp.id, mp.missione_id, p.codice as posto, mp.stato,
       (select coalesce(jsonb_agg(jsonb_build_object('articolo', a, 'pezzi', n, 'letti', l) order by a), '[]')
          from (select x ->> 'articolo' as a, count(*) as n,
                       count(*) filter (where mp.letti ? (x ->> 'codice')) as l
                  from jsonb_array_elements(mp.attesi) x group by 1) t) as elenco,
       jsonb_array_length(mp.attesi) as pezzi, jsonb_array_length(mp.letti) as letti,
       (select count(*) from jsonb_array_elements_text(mp.letti) l
         where not exists (select 1 from jsonb_array_elements(mp.attesi) a where a ->> 'codice' = l)) as extra
from public.missioni_posti mp join public.posti p on p.id = mp.posto_id
join public.missioni m on m.id = mp.missione_id and m.stato = 'Aperta'
where public.staff_di('trasporti') and public.ha_ruolo('magazzino', 'traffico', 'amministrazione');
-- vista con i permessi del proprietario: filtra da sola chi può vederla (riga sopra)
grant select on public.missioni_posti_app to authenticated;

-- la scansione dice solo quale articolo è stato spuntato (o che è un pezzo in più)
create or replace function public.scansiona_missione(p_posto uuid, p_codice text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mp public.missioni_posti; v_letti jsonb; v_manc jsonb; v_extra jsonb; v_art text;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  select * into mp from public.missioni_posti where id = p_posto for update;
  if mp.stato <> 'Da fare' then raise exception 'Posto già chiuso o bloccato'; end if;
  v_letti := case when mp.letti ? p_codice then mp.letti else mp.letti || to_jsonb(p_codice) end;
  select coalesce(jsonb_agg(a), '[]') into v_manc from jsonb_array_elements(mp.attesi) a where not v_letti ? (a ->> 'codice');
  select coalesce(jsonb_agg(l), '[]') into v_extra from jsonb_array_elements_text(v_letti) l
   where not exists (select 1 from jsonb_array_elements(mp.attesi) a where a ->> 'codice' = l);
  select a ->> 'articolo' into v_art from jsonb_array_elements(mp.attesi) a where a ->> 'codice' = p_codice limit 1;
  update public.missioni_posti set letti = v_letti, mancanti = v_manc, extra = v_extra,
         stato = case when jsonb_array_length(v_manc) = 0 and jsonb_array_length(v_extra) = 0 then 'Fatto'::public.stato_posto_missione
                      else 'Da fare'::public.stato_posto_missione end
   where id = mp.id;
  return jsonb_build_object('articolo', v_art, 'extra', v_art is null,
                            'chiuso', jsonb_array_length(v_manc) = 0 and jsonb_array_length(v_extra) = 0);
end $$;

-- un posto bloccato non si tocca finché l'ufficio non lo sblocca
create or replace function public.posto_bloccato(p_posto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.missioni_posti mp join public.missioni m on m.id = mp.missione_id
                 where mp.posto_id = p_posto and mp.stato = 'Bloccato' and m.stato = 'Aperta')
$$;

create or replace function public.trasferisci(p_bancale text, p_posto text) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bancali; v_da text; v_a uuid;
begin
  select * into b from public.bancali where codice = p_bancale;
  if b.id is null or not public.bancale_visibile(b.id) or not public.ha_ruolo('magazzino') then
    raise exception 'Bancale non trovato';
  end if;
  select id into v_a from public.posti where codice = p_posto and attivo;
  if v_a is null then raise exception 'Posto % inesistente', p_posto; end if;
  if public.posto_bloccato(b.posto_id) or public.posto_bloccato(v_a) then
    raise exception 'Posto bloccato da una missione: prima lo sblocca l''ufficio';
  end if;
  select codice into v_da from public.posti where id = b.posto_id;
  update public.bancali set posto_id = v_a where id = b.id;
  perform public.registra(public.mia_azienda(), 'Trasferimento', p_bancale, coalesce(v_da, '—') || ' → ' || p_posto, 'Pistola', 'bancali', b.id::text);
end $$;

create or replace function public.contenuto_non_bloccato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.posto_bloccato((select posto_id from public.bancali where id = coalesce(new.bancale_id, old.bancale_id))) then
    raise exception 'Posto bloccato da una missione: prima lo sblocca l''ufficio';
  end if;
  return coalesce(new, old);
end $$;
create trigger contenuto_non_bloccato before insert or update or delete on public.contenuto
  for each row execute function public.contenuto_non_bloccato();

-- i bancali si creano e si spostano solo con le funzioni (che scrivono lo storico)
revoke insert, update, delete on public.bancali from authenticated;

-- 6 · Permessi di default: niente esecuzione pubblica per le funzioni future ---------
alter default privileges revoke execute on functions from public;
revoke truncate, trigger, references on all tables in schema public from authenticated, anon;

-- 7 · Lo storico lo scrive solo il sistema ------------------------------------------
revoke execute on function public.registra(text, text, text, text, text, text, text, jsonb) from authenticated;

-- 8 · Ai clienti solo quello che è loro e che hanno chiesto di vedere ----------------
drop policy if exists fatture_lettura on public.fatture;
create policy fatture_lettura on public.fatture for select to authenticated
  using ((public.staff_di(azienda) and public.ha_ruolo('amministrazione'))
         or (cliente_id = public.mio_cliente() and stato in ('Inviata', 'Pagata')));

create or replace function public.bancale_visibile(p_bancale uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bancali b join public.clienti c on c.id = b.cliente_id
    where b.id = p_bancale and (
      (public.staff_di('trasporti') and public.mio_ruolo() <> 'autista')
      or (c.azienda_collegata is not null and public.staff_di(c.azienda_collegata))
      or (c.portale_live and (c.id = public.mio_cliente() or c.tramite = public.mio_cliente()))
    ))
$$;

drop policy if exists clienti_staff on public.clienti;
create policy clienti_staff on public.clienti for select to authenticated
  using (public.staff_di(azienda) and public.mio_ruolo() <> 'autista');
-- il portale legge il suo nome da qui (senza note interne)
create or replace view public.clienti_portale as
  select id, nome, portale_live from public.clienti
  where id = public.mio_cliente() or tramite = public.mio_cliente();
grant select on public.clienti_portale to authenticated;

-- 9 · Device Corporation: prezzo confermato solo da Vendite, venduto solo con la vendita ---
create or replace function public.device_regole() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.caricato_da := auth.uid();
    new.prezzo_confermato_da := case when public.ha_ruolo('vendite') and new.prezzo is not null then auth.uid() end;
    if new.stato = 'Venduto' then raise exception 'Venduto solo con una vendita registrata'; end if;
  else
    if new.prezzo is distinct from old.prezzo then
      new.prezzo_confermato_da := case when public.ha_ruolo('vendite') then auth.uid() end;
    elsif new.prezzo_confermato_da is distinct from old.prezzo_confermato_da then
      raise exception 'La conferma del prezzo la mette il sistema';
    end if;
    if new.stato is distinct from old.stato and (new.stato = 'Venduto' or old.stato = 'Venduto') and pg_trigger_depth() < 2 then
      raise exception 'Venduto solo con una vendita registrata';
    end if;
  end if;
  if new.stato = 'Disponibile' and new.bancale_id is null then raise exception 'Il device non si conferma senza bancale'; end if;
  if new.stato = 'Disponibile' and (new.prezzo is null or new.grado is null) then raise exception 'Servono grado e prezzo'; end if;
  return new;
end $$;

create or replace function public.device_storico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.storico (azienda, chi, chi_nome, operazione, cosa, dove, come, oggetto, oggetto_id, dettagli)
  values ('corporation', auth.uid(), (select nome from public.profili where id = auth.uid()),
          case tg_op when 'INSERT' then 'Entrata' else 'Modifica' end,
          new.seriale || ' · ' || new.stato || coalesce(' · € ' || new.prezzo, ''),
          (select codice from public.bancali where id = new.bancale_id), 'Sistema', 'device', new.id::text,
          case when tg_op = 'UPDATE' then jsonb_build_object('prima', jsonb_build_object('stato', old.stato, 'prezzo', old.prezzo, 'bancale', old.bancale_id)) end);
  return new;
end $$;
create trigger device_storico after insert or update on public.device
  for each row execute function public.device_storico();
revoke delete on public.device from authenticated;

-- 10 · Valore delle bolle solo per chi le vede; letture dopo l'inserimento -----------
create or replace function public.valore_bolla(p_bolla uuid) returns numeric
language sql stable security definer set search_path = public as $$
  with b as (select * from public.bolle where id = p_bolla and public.bolla_visibile(p_bolla)),
  t as (
    select distinct on (voce) voce, unita, prezzo from public.tariffe
    where cliente_id = (select cliente_id from b)
      and valida_dal <= coalesce((select data_consegna from b), current_date)
      and (valida_al is null or valida_al >= coalesce((select data_consegna from b), current_date))
    order by voce, valida_dal desc
  ),
  extra as (
    select a.voce from public.accessori_extra a join public.fermate f on f.id = a.fermata_id
    where f.bolla_id = p_bolla and exists (select 1 from b)
  )
  select round(
      coalesce((select prezzo from t where voce = 'Base' and unita = 'spedizione'), 0)
    + coalesce((select prezzo from t where voce = 'Base' and unita in ('collo', 'bancale')), 0) * coalesce((select colli_previsti from b), 0)
    + coalesce((select sum(t.prezzo) from t join unnest((select accessori from b)) acc(voce) using (voce)), 0)
    + coalesce((select sum(t.prezzo) from t join extra using (voce)), 0)
  , 2)
$$;

drop policy if exists bolle_lettura on public.bolle;
create policy bolle_lettura on public.bolle for select to authenticated
  using ((public.staff_di('trasporti') and public.mio_ruolo() <> 'autista') or public.bolla_visibile(id));
drop policy if exists bancali_lettura on public.bancali;
create policy bancali_lettura on public.bancali for select to authenticated
  using ((public.staff_di('trasporti') and public.mio_ruolo() <> 'autista') or public.bancale_visibile(id));

-- riallinea i permessi delle funzioni create qui
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.codice_badge(uuid, bigint) from authenticated;
revoke execute on function public.timbra(text, text) from authenticated;
revoke execute on function public.registra(text, text, text, text, text, text, text, jsonb) from authenticated;
grant execute on function public.timbra(text, text) to service_role;
