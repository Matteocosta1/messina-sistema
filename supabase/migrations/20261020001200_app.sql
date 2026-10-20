-- =====================================================================
-- App Messina (telefoni): le funzioni che mancavano alle schermate approvate.
--  · autisti:    mio_giro_oggi, accessori_possibili, riprova_dopo
--  · magazzino:  info_codice, posto_proposto, metti_a_posto, uscite_oggi, posto_vuoto
--  · bancali:    riserva_bancale + crea_bancale (il codice serve prima, per stampare l'etichetta)
-- Come le altre azioni: security definer, controllano chi sei e scrivono lo storico.
-- =====================================================================

-- ---------------------------------------------------------------- autisti
-- Il giro di oggi dell'autista, con tutto quello che serve al telefono.
-- Il nome del cliente non serve: l'autista vede il destinatario scritto in bolla.
create or replace function public.mio_giro_oggi() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_dip uuid := public.mio_dipendente(); g public.giri; r jsonb;
begin
  if v_dip is null or public.mio_ruolo() <> 'autista' then raise exception 'Solo per gli autisti'; end if;
  select * into g from public.giri where autista_id = v_dip and data = current_date
   order by (stato = 'Chiuso'), id limit 1;
  if g.id is null then return null; end if;
  select jsonb_build_object(
    'giro', jsonb_build_object('id', g.id, 'data', g.data, 'zona', g.zona, 'stato', g.stato),
    'mezzo', (select jsonb_build_object('tipo', m.tipo, 'sponda', m.sponda, 'targa', m.targa) from public.mezzi m where m.id = g.mezzo_id),
    'fermate', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'ordine', f.ordine, 'esito', f.esito, 'motivo', f.motivo, 'dopo', f.dopo,
        'firmata', f.firmata, 'foto', f.foto_bolla is not null,
        'numero', b.numero, 'tipo', b.tipo, 'destinatario', b.destinatario, 'indirizzo', b.indirizzo, 'citta', b.citta,
        'fascia', b.fascia, 'note', b.note, 'colli', b.colli_previsti,
        'letti', (select count(k.letto_consegna) from public.colli k where k.bolla_id = b.id),
        'accessori', to_jsonb(b.accessori),
        'extra', coalesce((select jsonb_agg(a.voce order by a.aggiunto_il) from public.accessori_extra a where a.fermata_id = f.id), '[]'::jsonb)
      ) order by f.ordine) from public.fermate f join public.bolle b on b.id = f.bolla_id where f.giro_id = g.id), '[]'::jsonb))
  into r;
  return r;
end $$;

-- «+ Aggiungi»: solo gli accessori che il cliente paga (hanno una tariffa)
create or replace function public.accessori_possibili(p_fermata uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
begin
  return coalesce((select array_agg(distinct t.voce order by t.voce)
    from public.tariffe t join public.bolle b on b.cliente_id = t.cliente_id
    where b.id = f.bolla_id and t.voce not in ('Base', 'Giacenza', 'Riconsegna')
      and (t.valida_al is null or t.valida_al >= current_date)), '{}');
end $$;

-- «Riprovo più tardi in questo giro»: la fermata resta da fare, spostata in fondo
create or replace function public.riprova_dopo(p_fermata uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare f public.fermate := public.fermata_mia(p_fermata);
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Serve il motivo'; end if;
  update public.fermate set ordine = (select max(ordine) + 1 from public.fermate where giro_id = f.giro_id), motivo = p_motivo
   where id = f.id;
end $$;

-- -------------------------------------------------------------- magazzino
-- Il primo posto libero, vicino agli altri bancali dello stesso cliente e in basso
create or replace function public.posto_proposto(p_codice text default null) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_cli uuid; v text;
begin
  if not public.ha_ruolo('magazzino', 'vendite', 'stage') then raise exception 'Non autorizzato'; end if;
  if public.staff_di('trasporti') then
    select cliente_id into v_cli from public.bancali where codice = p_codice;
    if v_cli is null then
      select b.cliente_id into v_cli from public.colli k join public.bolle b on b.id = k.bolla_id where k.codice = p_codice;
    end if;
  else
    select id into v_cli from public.clienti where azienda_collegata = public.mia_azienda() limit 1;
  end if;
  select p.codice into v from public.posti p
   where p.attivo and p.zona = 'Scaffale'
     and not exists (select 1 from public.bancali b where b.posto_id = p.id and b.uscito_il is null)
     and not exists (select 1 from public.colli k where k.posto_id = p.id and k.letto_carico is null)
     and not public.posto_bloccato(p.id)
   order by (select count(*) from public.bancali b join public.posti q on q.id = b.posto_id
              where b.cliente_id = v_cli and b.uscito_il is null and q.scaffale = p.scaffale) desc,
            p.piano, p.scaffale, p.numero
   limit 1;
  return v;
end $$;

-- Cosa è il codice letto: un collo (di quale bolla) o un bancale, e dove sta
create or replace function public.info_codice(p_codice text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b public.bancali; k public.colli; r jsonb;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  select * into b from public.bancali where codice = p_codice and uscito_il is null;
  if b.id is not null then
    return jsonb_build_object('tipo', 'bancale', 'codice', b.codice,
      'cliente', (select nome from public.clienti where id = b.cliente_id),
      'posto', (select codice from public.posti where id = b.posto_id),
      'proposto', public.posto_proposto(p_codice));
  end if;
  select * into k from public.colli where codice = p_codice;
  if k.id is null then raise exception 'Codice sconosciuto: %', p_codice; end if;
  select jsonb_build_object('tipo', 'collo', 'codice', k.codice, 'bolla_id', k.bolla_id, 'numero', bo.numero, 'cliente', c.nome,
      'totale', (select count(*) from public.colli x where x.bolla_id = k.bolla_id),
      'messi', (select count(*) from public.colli x where x.bolla_id = k.bolla_id and x.posto_id is not null and x.letto_entrata is not null),
      'posto', (select codice from public.posti where id = k.posto_id),
      'proposto', public.posto_proposto(p_codice))
    into r from public.bolle bo join public.clienti c on c.id = bo.cliente_id where bo.id = k.bolla_id;
  return r;
end $$;

-- Entrata e trasferimento: il collo (o il bancale) va nel posto scansionato
create or replace function public.metti_a_posto(p_codice text, p_posto text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k public.colli; v_posto uuid; v_da text; tot int; n int;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  select id into v_posto from public.posti where codice = p_posto and attivo;
  if v_posto is null then raise exception 'Posto % inesistente', p_posto; end if;
  if exists (select 1 from public.bancali where codice = p_codice and uscito_il is null) then
    perform public.trasferisci(p_codice, p_posto);
    return jsonb_build_object('bancale', p_codice, 'posto', p_posto);
  end if;
  select * into k from public.colli where codice = p_codice for update;
  if k.id is null then raise exception 'Codice sconosciuto: %', p_codice; end if;
  if public.posto_bloccato(v_posto) or (k.posto_id is not null and public.posto_bloccato(k.posto_id)) then
    raise exception 'Posto bloccato da una missione: prima lo sblocca l''ufficio';
  end if;
  select codice into v_da from public.posti where id = k.posto_id;
  update public.colli set posto_id = v_posto, letto_entrata = coalesce(letto_entrata, now()) where id = k.id;
  perform public.registra('trasporti', case when v_da is null then 'Entrata' else 'Trasferimento' end, 'Collo ' || p_codice,
                          coalesce(v_da || ' → ', 'Ricevimento → ') || p_posto, 'Pistola', 'colli', k.id::text);
  select count(*), count(*) filter (where posto_id is not null and letto_entrata is not null) into tot, n
    from public.colli where bolla_id = k.bolla_id;
  return jsonb_build_object('bolla', k.bolla_id, 'messi', n, 'totale', tot, 'posto', p_posto, 'da', v_da);
end $$;

-- Uscita: le spedizioni di oggi da caricare, con i colli e il posto da cui prenderli
create or replace function public.uscite_oggi() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  return coalesce((select jsonb_agg(s.x order by (s.x ->> 'caricati') = (s.x ->> 'totale'), s.x ->> 'cliente') from (
    select jsonb_build_object('bolla_id', b.id, 'numero', b.numero, 'cliente', c.nome,
      'mezzo', m.tipo || ' ' || m.targa, 'autista', d.nome,
      'totale', (select count(*) from public.colli k where k.bolla_id = b.id),
      'caricati', (select count(k.letto_carico) from public.colli k where k.bolla_id = b.id),
      'colli', coalesce((select jsonb_agg(jsonb_build_object('codice', k.codice, 'posto', p.codice, 'caricato', k.letto_carico is not null)
                           order by p.codice nulls last, k.codice)
                         from public.colli k left join public.posti p on p.id = k.posto_id where k.bolla_id = b.id), '[]'::jsonb)) as x
    from public.bolle b join public.clienti c on c.id = b.cliente_id
    join public.fermate f on f.bolla_id = b.id and f.esito = 'Da fare'
    join public.giri g on g.id = f.giro_id and g.data = current_date
    join public.mezzi m on m.id = g.mezzo_id join public.dipendenti d on d.id = g.autista_id
    where b.stato in ('Confermata', 'In giro')) s), '[]'::jsonb);
end $$;

-- Missione: un posto che deve essere vuoto e lo è si chiude senza scansioni
create or replace function public.posto_vuoto(p_posto uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mp public.missioni_posti;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  select * into mp from public.missioni_posti where id = p_posto for update;
  if mp.stato <> 'Da fare' then raise exception 'Posto già chiuso o bloccato'; end if;
  if jsonb_array_length(mp.attesi) > 0 or jsonb_array_length(mp.letti) > 0 then
    raise exception 'Il posto non è vuoto: scansiona i pezzi';
  end if;
  update public.missioni_posti set stato = 'Fatto' where id = mp.id;
end $$;

-- ------------------------------------------------------------------ bancali
-- Il codice si riserva prima, così l'etichetta si stampa e poi si sceglie il posto
create or replace function public.riserva_bancale() returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.ha_ruolo('magazzino', 'vendite', 'stage') then raise exception 'Non puoi creare bancali'; end if;
  return 'B-' || lpad(nextval('public.codice_bancale_seq')::text, 4, '0');
end $$;

create or replace function public.crea_bancale(p_codice text, p_posto text, p_cliente uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_cli uuid := p_cliente; v_posto uuid;
begin
  if not public.ha_ruolo('magazzino', 'vendite', 'stage') then raise exception 'Non puoi creare bancali'; end if;
  if p_codice !~ '^B-[0-9]{4,}$' or substr(p_codice, 3)::bigint > (select last_value from public.codice_bancale_seq) then
    raise exception 'Codice bancale non valido';
  end if;
  if exists (select 1 from public.bancali where codice = p_codice) then raise exception 'Bancale % già esistente', p_codice; end if;
  if not public.staff_di('trasporti') then
    select id into v_cli from public.clienti where azienda_collegata = public.mia_azienda() limit 1;
  end if;
  if v_cli is null then raise exception 'Cliente mancante'; end if;
  if not (public.staff_di('trasporti') or exists (
      select 1 from public.clienti where id = v_cli and azienda_collegata = public.mia_azienda())) then
    raise exception 'Cliente non tuo';
  end if;
  select id into v_posto from public.posti where codice = p_posto and attivo;
  if v_posto is null then raise exception 'Posto % inesistente', p_posto; end if;
  if public.posto_bloccato(v_posto) then raise exception 'Posto bloccato da una missione: prima lo sblocca l''ufficio'; end if;
  insert into public.bancali (codice, cliente_id, posto_id) values (p_codice, v_cli, v_posto);
  perform public.registra(public.mia_azienda(), 'Entrata', 'Bancale nuovo ' || p_codice, p_posto, 'Pistola', 'bancali', p_codice);
  return p_codice;
end $$;

revoke execute on function public.mio_giro_oggi(), public.accessori_possibili(uuid), public.riprova_dopo(uuid, text),
  public.posto_proposto(text), public.info_codice(text), public.metti_a_posto(text, text), public.uscite_oggi(),
  public.posto_vuoto(uuid), public.riserva_bancale(), public.crea_bancale(text, text, uuid) from public, anon;
grant execute on function public.mio_giro_oggi(), public.accessori_possibili(uuid), public.riprova_dopo(uuid, text),
  public.posto_proposto(text), public.info_codice(text), public.metti_a_posto(text, text), public.uscite_oggi(),
  public.posto_vuoto(uuid), public.riserva_bancale(), public.crea_bancale(text, text, uuid) to authenticated;
