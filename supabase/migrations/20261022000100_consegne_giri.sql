-- =====================================================================
-- 22 ottobre · Blocco 1: consegne e giri (dalla revisione del 22 ottobre)
--  · Colli: alla conferma della bolla nascono le righe dei colli (prima nessun codice le creava:
--    con dati veri nessuna consegna poteva chiudersi).
--  · Consegna con riserva: colli mancanti, danneggiati o in più, con il motivo scritto.
--    Ritiro: l'autista conta i colli che prende (non hanno ancora l'etichetta).
--  · «Nuova data»: la data è obbligatoria e la bolla torna da sola nei giri di quel giorno, con la riconsegna in fattura.
--  · Chiusura d'ufficio: quando l'app non basta, l'ufficio chiude la fermata con il motivo nello Storico.
--  · Stati del giro: Partito alla prima azione dell'autista (le bolle passano «In giro»), Rientrato quando le fermate sono tutte chiuse.
--  · Una riconsegna prenotata per oggi entra subito nel giro di oggi.
--  · Vincoli del mezzo: sponda e portata controllate alla conferma dei giri; i giri preferiscono un mezzo con sponda quando serve.
--  · Giri e fermate si cambiano solo con le funzioni (niente più modifiche dirette dal programma).
--  · Date di oggi e di domani sempre nell'ora di Roma.
-- =====================================================================

-- giorno di oggi in Italia (il database lavora in UTC: tra mezzanotte e le 2 la data UTC è quella di ieri)
create or replace function public.oggi() returns date
language sql stable set search_path = public as $$ select (now() at time zone 'Europe/Rome')::date $$;
grant execute on function public.oggi() to authenticated, anon;

-- ------------------------------------------------------------------ Colli creati alla conferma
-- codice del collo = numero della bolla + progressivo (26-000047-001): è quello stampato sull'etichetta
create or replace function public.crea_colli_bolla() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'Confermata' and old.stato = 'Nuova' and coalesce(new.colli_previsti, 0) > 0
     and not exists (select 1 from public.colli where bolla_id = new.id) then
    insert into public.colli (bolla_id, codice)
    select new.id, new.numero || '-' || lpad(g::text, 3, '0') from generate_series(1, new.colli_previsti) g;
  end if;
  return null;
end $$;
create trigger crea_colli_bolla after update of stato on public.bolle
  for each row execute function public.crea_colli_bolla();

-- ------------------------------------------------------------------ Fermate: riserva, ritiro, nuova data, ufficio
alter table public.fermate
  add column riserva          text,          -- consegna con riserva: cosa non torna (colli mancanti, danneggiati, in più)
  add column colli_consegnati integer,       -- colli scansionati alla consegna
  add column colli_ritirati   integer,       -- ritiro: colli presi dal cliente, contati dall'autista
  add column nuova_data       date,          -- «Nuova data»: il giorno della nuova consegna
  add column chiusa_da        uuid references public.profili(id),
  add column da_ufficio       boolean not null default false;   -- chiusa dall'ufficio e non dall'app

create or replace function public.fermate_regole() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_previsti integer; v_righe integer; v_letti integer; v_stato public.stato_bolla; v_tipo text;
        v_ufficio boolean := coalesce(current_setting('messina.chiusura_ufficio', true) = 'si', false);
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

  select b.colli_previsti, b.stato, b.tipo into v_previsti, v_stato, v_tipo from public.bolle b where b.id = new.bolla_id;
  select count(*), count(letto_consegna) into v_righe, v_letti from public.colli where bolla_id = new.bolla_id;
  if v_stato not in ('Confermata', 'In giro') then raise exception 'La bolla non è in consegna'; end if;

  if new.esito = 'Consegnata' then
    if v_ufficio then
      if coalesce(trim(new.motivo), '') = '' then raise exception 'Chiusura d''ufficio: serve il motivo'; end if;
    else
      if not new.firmata then raise exception 'Consegna bloccata: manca la firma'; end if;
      if new.foto_bolla is null then raise exception 'Consegna bloccata: manca la foto della bolla'; end if;
      if v_tipo = 'Ritiro' then
        -- al ritiro i colli non hanno ancora l'etichetta: l'autista li conta; si leggono all'entrata in magazzino
        if coalesce(new.colli_ritirati, 0) <= 0 then raise exception 'Ritiro: scrivi quanti colli hai preso'; end if;
        if new.colli_ritirati <> coalesce(v_previsti, 0) and coalesce(trim(new.riserva), '') = '' then
          raise exception 'Ritiro: % colli invece di %, scrivi cosa non torna', new.colli_ritirati, coalesce(v_previsti, 0);
        end if;
      elsif coalesce(trim(new.riserva), '') = '' then
        if coalesce(v_previsti, 0) = 0 or v_righe <> v_previsti or v_letti <> v_previsti then
          raise exception 'Consegna bloccata: % colli su % scansionati', v_letti, coalesce(v_previsti, 0);
        end if;
      else
        -- con riserva: almeno un collo scaricato, il resto spiegato
        if v_letti = 0 then raise exception 'Consegna con riserva: scansiona almeno un collo consegnato'; end if;
      end if;
    end if;
    new.colli_consegnati := v_letti;
    update public.bolle set stato = 'Consegnata' where id = new.bolla_id;
  elsif new.esito = 'Non consegnata' then
    if old.firmata and not v_ufficio then raise exception 'Il cliente ha firmato: la merce è consegnata, non si può chiudere come «Non consegnata»'; end if;
    if coalesce(trim(new.motivo), '') = '' or new.dopo is null then
      raise exception 'Serve il motivo e cosa succede alla merce';
    end if;
    if new.dopo = 'Nuova data' and (new.nuova_data is null or new.nuova_data <= public.oggi()) then
      raise exception 'Nuova data: scegli il giorno della nuova consegna (da domani)';
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
  new.chiusa_da := auth.uid();
  new.da_ufficio := v_ufficio;
  return new;
end $$;

-- «Nuova data»: dopo la chiusura la bolla torna confermata con il nuovo giorno (entra da sola nei giri)
-- e la riconsegna resta segnata sulla fermata, così va in fattura.
create or replace function public.fermata_nuova_data() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.esito = 'Non consegnata' and old.esito = 'Da fare' and new.dopo = 'Nuova data' then
    update public.bolle set stato = 'Confermata', data_consegna = new.nuova_data, fuori_dai_giri = false where id = new.bolla_id;
    insert into public.accessori_extra (fermata_id, voce) values (new.id, 'Riconsegna');
  end if;
  return null;
end $$;
create trigger fermata_nuova_data after update of esito on public.fermate
  for each row execute function public.fermata_nuova_data();

-- ------------------------------------------------------------------ Stati del giro
-- Partito: alla prima azione dell'autista sul giro. Le bolle del giro diventano «In giro».
create or replace function public.giro_partito(p_giro uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.giri set stato = 'Partito' where id = p_giro and stato = 'Preparato';
  update public.bolle b set stato = 'In giro'
   where b.stato = 'Confermata' and exists (select 1 from public.fermate f where f.bolla_id = b.id and f.giro_id = p_giro and f.esito = 'Da fare');
end $$;
revoke execute on function public.giro_partito(uuid) from public, anon, authenticated;

-- Rientrato: nessuna fermata ancora da fare
create or replace function public.giro_rientro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.esito <> 'Da fare' and old.esito = 'Da fare' then
    update public.giri g set stato = 'Rientrato'
     where g.id = new.giro_id and g.stato = 'Partito'
       and not exists (select 1 from public.fermate f where f.giro_id = g.id and f.esito = 'Da fare');
  end if;
  return null;
end $$;
create trigger giro_rientro after update of esito on public.fermate
  for each row execute function public.giro_rientro();

-- una spedizione aggiunta a un giro già partito è subito «In giro»; un giro rientrato con una fermata nuova riparte
create or replace function public.fermata_in_giro_partito() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.giri set stato = 'Partito' where id = new.giro_id and stato = 'Rientrato';
  if exists (select 1 from public.giri where id = new.giro_id and stato = 'Partito') then
    update public.bolle set stato = 'In giro' where id = new.bolla_id and stato = 'Confermata';
  end if;
  return null;
end $$;
create trigger fermata_in_giro_partito after insert on public.fermate
  for each row execute function public.fermata_in_giro_partito();

-- le azioni dell'autista fanno partire il giro
create or replace function public.scansiona_consegna(p_fermata uuid, p_codice text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata); n int; tot int;
begin
  perform public.giro_partito(f.giro_id);
  update public.colli set letto_consegna = coalesce(letto_consegna, now())
   where bolla_id = f.bolla_id and codice = p_codice;
  if not found then raise exception 'Questo collo non è di questa consegna'; end if;
  select count(*), count(letto_consegna) into tot, n from public.colli where bolla_id = f.bolla_id;
  return jsonb_build_object('letti', n, 'totale', tot);
end $$;

create or replace function public.aggiungi_accessorio(p_fermata uuid, p_voce text, p_lat float8 default null, p_lng float8 default null)
returns void language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
begin
  perform public.giro_partito(f.giro_id);
  insert into public.accessori_extra (fermata_id, voce, lat, lng) values (f.id, p_voce, p_lat, p_lng);
end $$;

create or replace function public.firma_fermata(p_fermata uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
begin
  perform public.giro_partito(f.giro_id);
  update public.fermate set firmata = true where id = f.id;
end $$;

create or replace function public.foto_bolla(p_fermata uuid, p_percorso text, p_nitidezza numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
        v_soglia numeric := (select valore::text::numeric from public.impostazioni where chiave = 'soglia_nitidezza');
begin
  perform public.giro_partito(f.giro_id);
  if p_nitidezza < v_soglia then
    return jsonb_build_object('ok', false, 'motivo', 'Rifai', 'nitidezza', p_nitidezza, 'soglia', v_soglia);
  end if;
  update public.fermate set foto_bolla = p_percorso, nitidezza = p_nitidezza where id = f.id;
  return jsonb_build_object('ok', true, 'nitidezza', p_nitidezza, 'soglia', v_soglia);
end $$;

create or replace function public.riprova_dopo(p_fermata uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
begin
  if f.firmata then raise exception 'Il cliente ha firmato: la merce è consegnata'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Serve il motivo'; end if;
  perform public.giro_partito(f.giro_id);
  update public.fermate set ordine = (select max(ordine) + 1 from public.fermate where giro_id = f.giro_id), motivo = p_motivo
   where id = f.id;
end $$;

-- chiusura dall'app: consegna (anche con riserva o ritiro) oppure mancata consegna con la nuova data
drop function public.chiudi_fermata(uuid, boolean, text, public.dopo_mancata, float8, float8);
create function public.chiudi_fermata(
  p_fermata uuid, p_consegnata boolean, p_motivo text default null, p_dopo public.dopo_mancata default null,
  p_lat float8 default null, p_lng float8 default null,
  p_riserva text default null, p_nuova_data date default null, p_colli_ritirati integer default null
) returns void language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
begin
  perform public.giro_partito(f.giro_id);
  update public.fermate
     set esito = case when p_consegnata then 'Consegnata'::public.esito_fermata else 'Non consegnata'::public.esito_fermata end,
         motivo = p_motivo, dopo = p_dopo, lat = p_lat, lng = p_lng,
         riserva = nullif(trim(p_riserva), ''), nuova_data = p_nuova_data, colli_ritirati = p_colli_ritirati
   where id = f.id;
end $$;
revoke execute on function public.chiudi_fermata(uuid, boolean, text, public.dopo_mancata, float8, float8, text, date, integer) from public, anon;
grant execute on function public.chiudi_fermata(uuid, boolean, text, public.dopo_mancata, float8, float8, text, date, integer) to authenticated;

-- chiusura d'ufficio (bolle, traffico, direzione): telefono rotto, firma su carta, errore dell'autista.
-- Salta i controlli dell'app ma il motivo è obbligatorio e resta nello Storico con chi l'ha fatta.
create or replace function public.chiudi_ufficio(p_fermata uuid, p_consegnata boolean, p_motivo text,
  p_dopo public.dopo_mancata default null, p_nuova_data date default null) returns void
language plpgsql security definer set search_path = public as $$
declare f public.fermate; v_cli text;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico')) then raise exception 'Solo l''ufficio chiude una fermata d''ufficio'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Scrivi il motivo della chiusura d''ufficio'; end if;
  select * into f from public.fermate where id = p_fermata for update;
  if f.id is null then raise exception 'Fermata non trovata'; end if;
  if f.esito <> 'Da fare' then raise exception 'Fermata già chiusa'; end if;
  v_cli := public.cliente_fermata(f.id);
  perform set_config('messina.chiusura_ufficio', 'si', true);
  update public.fermate
     set esito = case when p_consegnata then 'Consegnata'::public.esito_fermata else 'Non consegnata'::public.esito_fermata end,
         motivo = trim(p_motivo), dopo = case when p_consegnata then null else coalesce(p_dopo, 'Giacenza') end, nuova_data = p_nuova_data
   where id = f.id;
  perform set_config('messina.chiusura_ufficio', '', true);
  perform public.registra('trasporti', 'Ufficio', v_cli || ': chiusa d''ufficio come ' || case when p_consegnata then 'consegnata' else 'non consegnata' end || ' · ' || trim(p_motivo),
                          null, 'Manuale', 'fermate', f.id::text);
  perform public.giro_cambiato(f.giro_id, v_cli || ' chiusa dall''ufficio');
end $$;
revoke execute on function public.chiudi_ufficio(uuid, boolean, text, public.dopo_mancata, date) from public, anon;
grant execute on function public.chiudi_ufficio(uuid, boolean, text, public.dopo_mancata, date) to authenticated;

-- bolla non consegnata rimasta ferma: l'ufficio la rimette in giro con una data
create or replace function public.rimetti_in_giro(p_bolla uuid, p_data date) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bolle;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico')) then raise exception 'Non autorizzato'; end if;
  select * into b from public.bolle where id = p_bolla for update;
  if b.id is null or b.stato <> 'Non consegnata' then raise exception 'Si rimette in giro solo una spedizione non consegnata'; end if;
  if p_data is null or p_data < public.oggi() then raise exception 'Scegli il giorno della nuova consegna'; end if;
  update public.bolle set stato = 'Confermata', data_consegna = p_data, fuori_dai_giri = false where id = b.id;
  perform public.registra('trasporti', 'Riconsegna', 'Rimessa in giro per il ' || to_char(p_data, 'DD/MM'), null, 'Manuale', 'bolle', b.id::text);
end $$;
revoke execute on function public.rimetti_in_giro(uuid, date) from public, anon;
grant execute on function public.rimetti_in_giro(uuid, date) to authenticated;

-- ------------------------------------------------------------------ Il giro di oggi dell'autista (ora di Roma)
create or replace function public.mio_giro_oggi() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_dip uuid := public.mio_dipendente(); g public.giri; r jsonb;
begin
  if v_dip is null or public.mio_ruolo() <> 'autista' then raise exception 'Solo per gli autisti'; end if;
  select * into g from public.giri where autista_id = v_dip and data = public.oggi()
   order by (stato = 'Chiuso'), id limit 1;
  if g.id is null then return null; end if;
  select jsonb_build_object(
    'giro', jsonb_build_object('id', g.id, 'data', g.data, 'zona', g.zona, 'stato', g.stato),
    'mezzo', (select jsonb_build_object('tipo', m.tipo, 'sponda', m.sponda, 'targa', m.targa) from public.mezzi m where m.id = g.mezzo_id),
    'fermate', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'ordine', f.ordine, 'esito', f.esito, 'motivo', f.motivo, 'dopo', f.dopo,
        'firmata', f.firmata, 'foto', f.foto_bolla is not null, 'riserva', f.riserva,
        'numero', b.numero, 'tipo', b.tipo, 'destinatario', b.destinatario, 'indirizzo', b.indirizzo, 'citta', b.citta,
        'fascia', b.fascia, 'note', b.note, 'colli', b.colli_previsti,
        'letti', (select count(k.letto_consegna) from public.colli k where k.bolla_id = b.id),
        'accessori', to_jsonb(b.accessori),
        'extra', coalesce((select jsonb_agg(a.voce order by a.aggiunto_il) from public.accessori_extra a where a.fermata_id = f.id), '[]'::jsonb)
      ) order by f.ordine) from public.fermate f join public.bolle b on b.id = f.bolla_id where f.giro_id = g.id), '[]'::jsonb))
  into r;
  return r;
end $$;

-- ------------------------------------------------------------------ Riconsegna per oggi: entra nel giro di oggi
create or replace function public.bolle_nei_giri() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stato = 'Confermata' and new.tipo <> 'Magazzino' and new.data_consegna >= public.oggi() and not new.fuori_dai_giri
     and (tg_op = 'INSERT' or old.stato is distinct from new.stato or old.data_consegna is distinct from new.data_consegna)
     and exists (select 1 from public.giri where data = new.data_consegna)
     and not exists (select 1 from public.fermate where bolla_id = new.id and esito = 'Da fare') then
    perform public.prepara_giri_sistema(new.data_consegna);
  end if;
  return null;
end $$;

create or replace function public.prenota_riconsegna(p_giacenza uuid, p_data date, p_ora time default null) returns void
language plpgsql security definer set search_path = public as $$
declare g public.giacenze;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico')) then raise exception 'Non autorizzato'; end if;
  select * into g from public.giacenze where id = p_giacenza and chiusa_il is null for update;
  if g.id is null then raise exception 'Giacenza non trovata o già chiusa'; end if;
  if p_data < public.oggi() then raise exception 'La data è passata'; end if;
  update public.giacenze set riconsegna_il = p_data, riconsegna_ora = p_ora, chiusa_il = now() where id = g.id;
  update public.bolle set stato = 'Confermata', data_consegna = p_data, fuori_dai_giri = false,
         fascia = case when p_ora is null then fascia else 'Alle ' || to_char(p_ora, 'HH24:MI') end
   where id = g.bolla_id;
  update public.richieste_riconsegna set gestita_il = now() where giacenza_id = g.id and gestita_il is null;
  perform public.registra('trasporti', 'Riconsegna', 'Prenotata per il ' || to_char(p_data, 'DD/MM') || coalesce(' alle ' || to_char(p_ora, 'HH24:MI'), ''),
                          null, 'Sistema', 'giacenze', g.id::text);
end $$;

-- ------------------------------------------------------------------ Vincoli del mezzo
alter table public.mezzi
  add column portata_kg integer check (portata_kg > 0),      -- carico utile
  add column bancali    integer check (bancali > 0);         -- posti bancale
-- valori tipici per tipo di mezzo, se non scritti (si correggono in Mezzi con quelli del libretto)
create or replace function public.mezzi_valori() returns trigger
language plpgsql set search_path = public as $$
begin
  new.portata_kg := coalesce(new.portata_kg, case new.tipo when 'Sprinter' then 1000 when 'Furgone' then 1000 when 'Motrice' then 7000 when 'Tre assi' then 12000 when 'Bilico' then 23000 end);
  new.bancali    := coalesce(new.bancali,    case new.tipo when 'Sprinter' then 4 when 'Furgone' then 8 when 'Motrice' then 18 when 'Tre assi' then 22 when 'Bilico' then 33 end);
  return new;
end $$;
create trigger mezzi_valori before insert or update of tipo on public.mezzi for each row execute function public.mezzi_valori();
update public.mezzi set portata_kg = case tipo when 'Sprinter' then 1000 when 'Furgone' then 1000 when 'Motrice' then 7000 when 'Tre assi' then 12000 when 'Bilico' then 23000 end,
                        bancali    = case tipo when 'Sprinter' then 4 when 'Furgone' then 8 when 'Motrice' then 18 when 'Tre assi' then 22 when 'Bilico' then 33 end
 where portata_kg is null;

-- cosa non torna in un giro: sponda richiesta su un mezzo senza sponda, peso oltre la portata
create or replace function public.giro_vincoli(p_giro uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when not m.sponda and exists (select 1 from public.fermate f join public.bolle b on b.id = f.bolla_id
                                        left join public.accessori_extra a on a.fermata_id = f.id and a.voce = 'Sponda'
                                        where f.giro_id = g.id and f.esito = 'Da fare' and ('Sponda' = any(b.accessori) or a.id is not null))
         then 'serve la sponda ma il mezzo non ce l''ha' end,
    case when m.portata_kg is not null and (select coalesce(sum(b.peso_kg), 0) from public.fermate f join public.bolle b on b.id = f.bolla_id
                                            where f.giro_id = g.id and f.esito = 'Da fare') > m.portata_kg
         then 'peso oltre la portata (' || (select round(sum(b.peso_kg)) from public.fermate f join public.bolle b on b.id = f.bolla_id where f.giro_id = g.id and f.esito = 'Da fare')
              || ' kg su ' || m.portata_kg || ')' end
  ], null)
  from public.giri g join public.mezzi m on m.id = g.mezzo_id where g.id = p_giro
$$;
revoke execute on function public.giro_vincoli(uuid) from public, anon;
grant execute on function public.giro_vincoli(uuid) to authenticated;

create or replace function public.conferma_giri(p_data date) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; r record; v text[];
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('traffico')) then raise exception 'Non autorizzato'; end if;
  -- niente si conferma se i numeri non tornano
  for r in select g.id, d.nome from public.giri g left join public.dipendenti d on d.id = g.autista_id where g.data = p_data and g.confermato_il is null loop
    v := public.giro_vincoli(r.id);
    if cardinality(v) > 0 then raise exception 'Giro di %: %', coalesce(r.nome, '—'), array_to_string(v, '; '); end if;
  end loop;
  update public.giri set confermato_il = now(), confermato_da = auth.uid(), da_confermare = '{}'
   where data = p_data and confermato_il is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nessun giro da confermare per il %', to_char(p_data, 'DD/MM'); end if;
  perform public.registra('trasporti', 'Giri', n || ' giri confermati per il ' || to_char(p_data, 'DD/MM'), null, 'Sistema', 'giri', p_data::text);
  return n;
end $$;

-- preparazione: stessa logica, ma una spedizione con la sponda va solo su un mezzo con la sponda
create or replace function public.prepara_giri_sistema(p_data date) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; r record; v_giro uuid; v_ord int; v_mezzo uuid;
begin
  perform pg_advisory_xact_lock(hashtext('prepara_giri:' || p_data::text));
  if not exists (select 1 from public.mezzi where stato = 'Attivo' and autista_id is not null) then return 0; end if;
  for r in select b.id, b.citta, c.nome as cliente, ('Sponda' = any(b.accessori)) as sponda from public.bolle b join public.clienti c on c.id = b.cliente_id
            where b.stato = 'Confermata' and b.data_consegna = p_data and b.tipo <> 'Magazzino' and not b.fuori_dai_giri
              and not exists (select 1 from public.fermate f where f.bolla_id = b.id and f.esito = 'Da fare')
            order by b.citta nulls last, b.fascia nulls last loop
    v_giro := null;
    -- un giro dello stesso giorno nella stessa città, non ancora rientrato, con la sponda se serve
    select g.id into v_giro from public.giri g join public.mezzi m on m.id = g.mezzo_id join public.fermate f on f.giro_id = g.id join public.bolle b2 on b2.id = f.bolla_id
     where g.data = p_data and g.stato in ('Preparato', 'Partito') and b2.citta is not distinct from r.citta and (not r.sponda or m.sponda) limit 1;
    if v_giro is null then
      -- un mezzo libero quel giorno: prima quelli con la sponda se serve, poi i più piccoli
      select m.id into v_mezzo from public.mezzi m
       where m.stato = 'Attivo' and m.autista_id is not null and (not r.sponda or m.sponda)
         and not exists (select 1 from public.giri g where g.data = p_data and g.mezzo_id = m.id)
       order by (m.sponda = r.sponda) desc, m.portata_kg nulls last, m.targa limit 1;
      if v_mezzo is null then
        -- tutti i mezzi hanno già un giro: si aggiunge a quello con meno fermate (con la sponda se serve)
        select g.id into v_giro from public.giri g join public.mezzi m on m.id = g.mezzo_id
         where g.data = p_data and g.stato in ('Preparato', 'Partito') and (not r.sponda or m.sponda)
         order by (select count(*) from public.fermate f where f.giro_id = g.id), g.id limit 1;
        if v_giro is null then continue; end if;   -- nessun mezzo adatto: resta «Da assegnare»
      else
        insert into public.giri (data, mezzo_id, autista_id, zona)
        select p_data, m.id, m.autista_id, r.citta from public.mezzi m where m.id = v_mezzo
        returning id into v_giro;
      end if;
    end if;
    select coalesce(max(ordine), 0) + 1 into v_ord from public.fermate where giro_id = v_giro;
    insert into public.fermate (giro_id, bolla_id, ordine) values (v_giro, r.id, v_ord);
    -- giro già confermato: torna da confermare, con scritto cosa è cambiato
    update public.giri set da_confermare = da_confermare || ('Aggiunta ' || r.cliente || coalesce(' · ' || r.citta, '')),
                           confermato_il = null, confermato_da = null
     where id = v_giro and confermato_il is not null;
    update public.giri set da_confermare = da_confermare || ('Aggiunta ' || r.cliente || coalesce(' · ' || r.citta, ''))
     where id = v_giro and cardinality(da_confermare) > 0 and not (('Aggiunta ' || r.cliente || coalesce(' · ' || r.citta, '')) = any(da_confermare));
    -- giro già partito: l'autista lo sa subito
    if exists (select 1 from public.giri where id = v_giro and stato = 'Partito') then
      perform public.giro_cambiato(v_giro, 'Aggiunta ' || r.cliente || coalesce(' · ' || r.citta, ''));
    end if;
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

-- ------------------------------------------------------------------ Giri e fermate solo con le funzioni
-- prima il traffico poteva anche cancellare una fermata direttamente (aggirando i controlli)
revoke insert, update, delete on public.fermate, public.giri from authenticated;
