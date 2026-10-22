-- =====================================================================
-- Tariffe a regole e fatturazione di fine mese (Autotrasporti)
--  · tariffe: zona, scaglioni (peso, colli, km), minimo, validità, approvazione della Direzione
--  · listino base: sotto il listino (o per un cliente nuovo) la tariffa aspetta la Direzione
--  · bolla: peso, bancali, km, valore della merce, contrassegno
--  · calcolo di ogni bolla in righe (righe_bolla): sui colli consegnati, con giacenza, riconsegne e accessori
--    una voce senza tariffa NON sparisce: diventa un problema e la fattura resta «Da controllare»
--  · chiusura del mese: una fattura per cliente con tutte le bolle consegnate e non ancora fatturate
--    (una bolla sta in una sola fattura valida: fatture_bolle con indice unico)
--  · totali e IVA calcolati dal database dalle righe (aliquota, natura, margine, split payment)
--  · «Inviata» la scrive solo il sistema dopo la risposta positiva di Fatture in Cloud; esito dello SdI
--  · nota di credito; anagrafica completa per la fattura elettronica
-- =====================================================================

-- valori nuovi degli elenchi: 20261022000150_valori_nuovi.sql

-- ------------------------------------------------------------------ Anagrafica per la fattura elettronica
alter table public.clienti
  add column if not exists cap text,
  add column if not exists citta text,
  add column if not exists provincia text,
  add column if not exists codice_fiscale text,
  add column if not exists codice_destinatario text,
  add column if not exists pec text,
  add column if not exists split_payment boolean not null default false,
  add column if not exists iva_aliquota numeric(5, 2) not null default 22,
  add column if not exists iva_natura text,               -- es. N3.1 non imponibile: allora IVA 0
  add column if not exists stato text not null default 'Attivo' check (stato in ('Potenziale', 'Attivo'));

-- cosa manca per poter fatturare (vuoto = completa)
create or replace function public.anagrafica_mancante(p_cliente uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when coalesce(trim(c.piva), '') = '' and coalesce(trim(c.codice_fiscale), '') = '' then 'partita IVA o codice fiscale' end,
    case when coalesce(trim(c.indirizzo), '') = '' then 'indirizzo' end,
    case when coalesce(trim(c.cap), '') !~ '^\d{5}$' then 'CAP' end,
    case when coalesce(trim(c.citta), '') = '' then 'città' end,
    case when coalesce(trim(c.provincia), '') !~ '^[A-Za-z]{2}$' then 'provincia' end,
    case when coalesce(trim(c.codice_destinatario), '') = '' and coalesce(trim(c.pec), '') = '' then 'codice destinatario o PEC' end
  ], null)
  from public.clienti c where c.id = p_cliente
$$;

-- ------------------------------------------------------------------ Dati della bolla che contano per il prezzo
alter table public.bolle
  add column if not exists provincia text,
  add column if not exists bancali integer check (bancali >= 0),
  add column if not exists km numeric(10, 1) check (km >= 0),
  add column if not exists valore_merce numeric(12, 2) check (valore_merce >= 0),
  add column if not exists contrassegno numeric(12, 2) check (contrassegno >= 0);
alter table public.accessori_extra add column if not exists quantita numeric(10, 2) not null default 1 check (quantita > 0);

-- ------------------------------------------------------------------ Listino base (lo tiene la Direzione)
create table if not exists public.listino (
  id            uuid primary key default gen_random_uuid(),
  voce          text not null,
  unita         public.unita_tariffa not null,
  prezzo        numeric(10, 2) not null check (prezzo >= 0),
  zona          text,
  scaglione_su  text check (scaglione_su in ('peso', 'colli', 'km')),
  scaglione_da  numeric(12, 2),
  scaglione_a   numeric(12, 2),
  minimo        numeric(10, 2),
  note          text
);
create unique index if not exists listino_voce on public.listino (voce, unita, coalesce(zona, ''), coalesce(scaglione_su, ''), coalesce(scaglione_da, -1));
alter table public.listino enable row level security;
create policy listino_lettura on public.listino for select to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('commerciale', 'amministrazione'));
create policy listino_scrittura on public.listino for all to authenticated
  using (public.staff_di('trasporti') and public.mio_ruolo() = 'direzione')
  with check (public.staff_di('trasporti') and public.mio_ruolo() = 'direzione');
grant select, insert, update, delete on public.listino to authenticated;

-- ------------------------------------------------------------------ Tariffe a regole
alter table public.tariffe
  add column if not exists scaglione_su text check (scaglione_su in ('peso', 'colli', 'km')),
  add column if not exists scaglione_da numeric(12, 2),
  add column if not exists scaglione_a numeric(12, 2),
  add column if not exists stato text not null default 'Attiva' check (stato in ('Attiva', 'Da approvare', 'Rifiutata')),
  add column if not exists creata_da uuid references public.profili(id),
  add column if not exists approvata_da uuid references public.profili(id),
  add column if not exists motivo text;      -- perché aspetta la Direzione
alter table public.tariffe drop constraint if exists tariffe_cliente_id_voce_valida_dal_key;
alter table public.tariffe drop constraint if exists tariffe_check_scaglione;
alter table public.tariffe add constraint tariffe_check_scaglione
  check (scaglione_su is null or (scaglione_da is not null and (scaglione_a is null or scaglione_a > scaglione_da)));
-- una sola versione attiva per voce, zona, scaglione e giorno di partenza
create unique index if not exists tariffe_versione on public.tariffe
  (cliente_id, voce, coalesce(zona, ''), coalesce(scaglione_su, ''), coalesce(scaglione_da, -1), valida_dal) where stato = 'Attiva';

-- le tariffe si cambiano solo con salva_tariffe / approva_tariffa: così ogni prezzo ha la sua storia
drop policy if exists tariffe_scrittura on public.tariffe;
revoke insert, update, delete on public.tariffe from authenticated;

-- la tariffa valida per un cliente, una voce, un giorno, una zona e una misura (peso, colli o km)
create or replace function public.tariffa_valida(p_cliente uuid, p_voce text, p_giorno date, p_zone text[], p_peso numeric, p_colli numeric, p_km numeric)
returns public.tariffe
language sql stable security definer set search_path = public as $$
  select t.* from public.tariffe t
   where t.cliente_id = p_cliente and t.voce = p_voce and t.stato = 'Attiva'
     and t.valida_dal <= p_giorno and (t.valida_al is null or t.valida_al >= p_giorno)
     and (t.zona is null or lower(t.zona) = any(select lower(z) from unnest(p_zone) z where z is not null))
     and (t.scaglione_su is null or (
           case t.scaglione_su when 'peso' then p_peso when 'colli' then p_colli else p_km end) >= t.scaglione_da
       and (t.scaglione_a is null or (case t.scaglione_su when 'peso' then p_peso when 'colli' then p_colli else p_km end) < t.scaglione_a))
   order by (t.zona is not null) desc, (t.scaglione_su is not null) desc, t.valida_dal desc
   limit 1
$$;
revoke execute on function public.tariffa_valida(uuid, text, date, text[], numeric, numeric, numeric) from public, anon, authenticated;

-- quante unità conta una tariffa su una bolla
create or replace function public.quantita_tariffa(p_unita public.unita_tariffa, p_colli numeric, p_bancali numeric, p_peso numeric, p_km numeric)
returns numeric language sql immutable as $$
  select case p_unita
    when 'collo' then p_colli when 'pezzo' then p_colli
    when 'bancale' then coalesce(p_bancali, p_colli)
    when 'kg' then p_peso when 'km' then p_km
    else 1 end
$$;

-- ------------------------------------------------------------------ Il calcolo di una bolla
-- Righe in euro, una per voce. Se manca un dato o una tariffa la riga resta con il problema scritto:
-- in fattura diventa «Da controllare», niente si perde in silenzio.
create or replace function public.calcola_bolla(p_bolla uuid)
returns table (voce text, quantita numeric, prezzo numeric, totale numeric, problema text)
language plpgsql stable security definer set search_path = public as $$
declare
  b public.bolle; t public.tariffe; v_giorno date; v_zone text[];
  v_colli numeric; v_tentativi int; v_q numeric; v_tot numeric; r record; g record;
begin
  select * into b from public.bolle where id = p_bolla;
  if b.id is null then return; end if;
  v_giorno := coalesce(b.data_consegna, public.oggi());
  v_zone := array[b.citta, b.provincia];
  -- colli che contano: quelli consegnati (o contati al ritiro), altrimenti quelli previsti
  select coalesce(f.colli_ritirati, f.colli_consegnati) into v_colli
    from public.fermate f where f.bolla_id = b.id and f.esito = 'Consegnata' order by f.chiusa_il desc nulls last limit 1;
  v_colli := coalesce(v_colli, b.colli_previsti, 0);
  select count(*) into v_tentativi from public.fermate f where f.bolla_id = b.id and f.esito <> 'Da fare';

  -- Base
  t := public.tariffa_valida(b.cliente_id, 'Base', v_giorno, v_zone, b.peso_kg, v_colli, b.km);
  if t.id is null then
    voce := 'Base'; quantita := 1; prezzo := 0; totale := 0; problema := 'manca la tariffa Base'; return next;
  elsif t.unita = 'kg' and b.peso_kg is null then
    voce := 'Base'; quantita := 0; prezzo := t.prezzo; totale := 0; problema := 'manca il peso'; return next;
  elsif t.unita = 'km' and b.km is null then
    voce := 'Base'; quantita := 0; prezzo := t.prezzo; totale := 0; problema := 'mancano i km'; return next;
  elsif t.unita = 'percentuale' then
    if b.valore_merce is null then
      voce := 'Base'; quantita := 0; prezzo := t.prezzo; totale := 0; problema := 'manca il valore della merce'; return next;
    else
      voce := 'Base'; quantita := 1; prezzo := round(b.valore_merce * t.prezzo / 100, 2); totale := prezzo; problema := null; return next;
    end if;
  else
    v_q := public.quantita_tariffa(t.unita, v_colli, b.bancali, b.peso_kg, b.km);
    v_tot := round(v_q * t.prezzo, 2);
    if t.minimo is not null and v_tot < t.minimo then
      voce := 'Base (minimo)'; quantita := 1; prezzo := t.minimo; totale := t.minimo;
    else
      voce := 'Base'; quantita := v_q; prezzo := t.prezzo; totale := v_tot;
    end if;
    problema := null; return next;
  end if;

  -- Accessori: quelli della bolla e quelli aggiunti dall'autista, ognuno una volta per spedizione
  -- (a ore: le ore segnate). La riconsegna si conta a parte, dai tentativi.
  for r in
    select a.voce, max(a.q) as q from (
      select unnest(b.accessori) as voce, 1::numeric as q
      union all
      select x.voce, sum(x.quantita) from public.accessori_extra x join public.fermate f on f.id = x.fermata_id
       where f.bolla_id = b.id group by x.voce
    ) a where a.voce <> 'Riconsegna' group by a.voce order by a.voce
  loop
    t := public.tariffa_valida(b.cliente_id, r.voce, v_giorno, v_zone, b.peso_kg, v_colli, b.km);
    if t.id is null then
      voce := r.voce; quantita := 1; prezzo := 0; totale := 0; problema := 'manca la tariffa ' || r.voce; return next;
    else
      v_q := case when t.unita = 'ora' then r.q else public.quantita_tariffa(t.unita, v_colli, b.bancali, b.peso_kg, b.km) end;
      voce := r.voce; quantita := coalesce(v_q, 1); prezzo := t.prezzo; totale := round(coalesce(v_q, 1) * t.prezzo, 2);
      problema := null; return next;
    end if;
  end loop;

  -- Riconsegne: ogni tentativo dopo il primo
  if v_tentativi > 1 then
    t := public.tariffa_valida(b.cliente_id, 'Riconsegna', v_giorno, v_zone, b.peso_kg, v_colli, b.km);
    voce := 'Riconsegna'; quantita := v_tentativi - 1; prezzo := coalesce(t.prezzo, 0);
    totale := round(quantita * prezzo, 2); problema := case when t.id is null then 'manca la tariffa Riconsegna' end; return next;
  end if;

  -- Giacenza: giorni in deposito (almeno uno)
  for g in select gc.dal, coalesce((gc.chiusa_il at time zone 'Europe/Rome')::date, public.oggi()) as al from public.giacenze gc where gc.bolla_id = b.id loop
    t := public.tariffa_valida(b.cliente_id, 'Giacenza', v_giorno, v_zone, b.peso_kg, v_colli, b.km);
    v_q := case when t.unita = 'giorno' then greatest(1, g.al - g.dal) else 1 end;
    voce := 'Giacenza'; quantita := v_q; prezzo := coalesce(t.prezzo, 0); totale := round(v_q * coalesce(t.prezzo, 0), 2);
    problema := case when t.id is null then 'manca la tariffa Giacenza' end; return next;
  end loop;

  -- Contrassegno: obbligatoria la tariffa
  if coalesce(b.contrassegno, 0) > 0 then
    t := public.tariffa_valida(b.cliente_id, 'Contrassegno', v_giorno, v_zone, b.peso_kg, v_colli, b.km);
    voce := 'Contrassegno'; quantita := 1;
    prezzo := case when t.id is null then 0 when t.unita = 'percentuale' then greatest(round(b.contrassegno * t.prezzo / 100, 2), coalesce(t.minimo, 0)) else t.prezzo end;
    totale := prezzo; problema := case when t.id is null then 'manca la tariffa Contrassegno' end; return next;
  end if;

  -- Assicurazione: solo se il cliente ce l'ha in contratto
  if coalesce(b.valore_merce, 0) > 0 then
    t := public.tariffa_valida(b.cliente_id, 'Assicurazione', v_giorno, v_zone, b.peso_kg, v_colli, b.km);
    if t.id is not null then
      voce := 'Assicurazione'; quantita := 1;
      prezzo := case when t.unita = 'percentuale' then greatest(round(b.valore_merce * t.prezzo / 100, 2), coalesce(t.minimo, 0)) else t.prezzo end;
      totale := prezzo; problema := null; return next;
    end if;
  end if;
end $$;
revoke execute on function public.calcola_bolla(uuid) from public, anon, authenticated;

-- quanto vale una bolla, per chi la può vedere (staff dei Trasporti con i prezzi)
create or replace function public.righe_bolla(p_bolla uuid)
returns table (voce text, quantita numeric, prezzo numeric, totale numeric, problema text)
language sql stable security definer set search_path = public as $$
  select c.* from public.calcola_bolla(p_bolla) c
   where public.staff_di('trasporti') and public.ha_ruolo('commerciale', 'amministrazione', 'bolle')
$$;
create or replace function public.valore_bolla(p_bolla uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(c.totale), 2), 0) from public.calcola_bolla(p_bolla) c
   where public.staff_di('trasporti') and public.ha_ruolo('commerciale', 'amministrazione', 'bolle')
$$;
revoke execute on function public.righe_bolla(uuid), public.valore_bolla(uuid) from public, anon;
grant execute on function public.righe_bolla(uuid), public.valore_bolla(uuid) to authenticated;

-- ------------------------------------------------------------------ Salvare e approvare le tariffe
-- Solo il commerciale (e la Direzione). Un prezzo cambiato è una versione nuova, valida da un giorno:
-- la vecchia resta nello storico e smette di valere il giorno prima.
-- Aspetta la Direzione: un cliente senza tariffe attive (nuovo) o un prezzo sotto il listino base.
create or replace function public.attiva_tariffa(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tariffe;
begin
  select * into t from public.tariffe where id = p_id;
  update public.tariffe set valida_al = t.valida_dal - 1
   where cliente_id = t.cliente_id and voce = t.voce and coalesce(zona, '') = coalesce(t.zona, '')
     and coalesce(scaglione_su, '') = coalesce(t.scaglione_su, '') and coalesce(scaglione_da, -1) = coalesce(t.scaglione_da, -1)
     and stato = 'Attiva' and id <> t.id and valida_dal < t.valida_dal and (valida_al is null or valida_al >= t.valida_dal);
  -- una versione uguale e già valida dallo stesso giorno si sostituisce
  update public.tariffe set stato = 'Rifiutata', motivo = 'Sostituita'
   where cliente_id = t.cliente_id and voce = t.voce and coalesce(zona, '') = coalesce(t.zona, '')
     and coalesce(scaglione_su, '') = coalesce(t.scaglione_su, '') and coalesce(scaglione_da, -1) = coalesce(t.scaglione_da, -1)
     and stato = 'Attiva' and id <> t.id and valida_dal >= t.valida_dal;
  update public.tariffe set stato = 'Attiva' where id = t.id;
end $$;
revoke execute on function public.attiva_tariffa(uuid) from public, anon, authenticated;

create or replace function public.salva_tariffe(p_cliente uuid, p_righe jsonb, p_dal date default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_dal date := coalesce(p_dal, public.oggi()); v_dir boolean := public.mio_ruolo() = 'direzione';
  v_nuovo boolean; v_id uuid; v_l public.listino; v_motivo text; v_n int := 0; v_prima public.tariffe; c public.clienti; v_voce text;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('commerciale')) then raise exception 'Le tariffe le cambia il commerciale'; end if;
  select * into c from public.clienti where id = p_cliente and azienda = 'trasporti';
  if c.id is null then raise exception 'Cliente non trovato'; end if;
  -- all'indietro solo se nessuna bolla da quel giorno è già in una fattura inviata; e la decide la Direzione
  if v_dal < public.oggi() and exists (select 1 from public.fatture_bolle fb join public.fatture f on f.id = fb.fattura_id join public.bolle b on b.id = fb.bolla_id
                                        where b.cliente_id = p_cliente and b.data_consegna >= v_dal and fb.valida and f.stato in ('Inviata', 'Pagata')) then
    raise exception 'Dal % ci sono bolle già fatturate: la tariffa nuova può valere solo da dopo l''ultima fattura inviata', to_char(v_dal, 'DD/MM');
  end if;
  v_nuovo := not exists (select 1 from public.tariffe where cliente_id = p_cliente and stato = 'Attiva');
  for r in select * from jsonb_array_elements(p_righe) loop
    v_prima := null; v_id := null; v_l := null;
    if r ? 'id' and (r->>'id') is not null then
      select * into v_prima from public.tariffe where id = (r->>'id')::uuid and cliente_id = p_cliente;
      if v_prima.id is null then raise exception 'Tariffa non trovata'; end if;
    end if;
    v_voce := coalesce(nullif(trim(r->>'voce'), ''), v_prima.voce);
    if v_voce is null then raise exception 'Ogni tariffa ha una voce'; end if;
    if (r->>'prezzo') is null or (r->>'prezzo')::numeric < 0 then raise exception 'Prezzo mancante per %', v_voce; end if;
    if v_prima.id is not null then
      continue when (v_prima.prezzo, v_prima.minimo, v_prima.unita::text, v_prima.quando)
        is not distinct from ((r->>'prezzo')::numeric, (r->>'minimo')::numeric, coalesce(r->>'unita', v_prima.unita::text), coalesce(r->>'quando', v_prima.quando));
    end if;
    -- confronto con il listino base (stessa voce, unità e zona; se c'è lo scaglione, lo stesso scaglione)
    select * into v_l from public.listino l
     where l.voce = v_voce and l.unita::text = coalesce(r->>'unita', v_prima.unita::text, 'spedizione')
       and (l.zona is null or lower(l.zona) = lower(coalesce(r->>'zona', v_prima.zona, '')))
       and coalesce(l.scaglione_da, -1) = coalesce((r->>'scaglione_da')::numeric, v_prima.scaglione_da, -1)
     order by (l.zona is not null) desc limit 1;
    v_motivo := case when v_dal < public.oggi() then 'Vale all''indietro, dal ' || to_char(v_dal, 'DD/MM')
                     when v_nuovo then 'Cliente nuovo'
                     when v_l.id is not null and (r->>'prezzo')::numeric < v_l.prezzo then 'Sotto il listino (' || v_l.prezzo || ' €)' end;
    -- una proposta per lo stesso giorno, ancora da approvare, si aggiorna; altrimenti versione nuova
    update public.tariffe t set prezzo = (r->>'prezzo')::numeric, motivo = v_motivo, creata_da = auth.uid(),
           minimo = coalesce((r->>'minimo')::numeric, case when r ? 'minimo' then null else t.minimo end)
     where t.cliente_id = p_cliente and t.voce = v_voce and t.valida_dal = v_dal and t.stato = 'Da approvare'
       and coalesce(t.zona, '') = coalesce(nullif(trim(r->>'zona'), ''), v_prima.zona, '')
       and coalesce(t.scaglione_da, -1) = coalesce((r->>'scaglione_da')::numeric, v_prima.scaglione_da, -1)
     returning t.id into v_id;
    if v_id is null then
      insert into public.tariffe (cliente_id, voce, unita, prezzo, minimo, zona, quando, scaglione_su, scaglione_da, scaglione_a,
                                  valida_dal, stato, creata_da, motivo)
      values (p_cliente, v_voce, coalesce(r->>'unita', v_prima.unita::text, 'spedizione')::public.unita_tariffa,
              (r->>'prezzo')::numeric, coalesce((r->>'minimo')::numeric, case when r ? 'minimo' then null else v_prima.minimo end),
              coalesce(nullif(trim(r->>'zona'), ''), v_prima.zona), coalesce(nullif(trim(r->>'quando'), ''), v_prima.quando),
              coalesce(nullif(r->>'scaglione_su', ''), v_prima.scaglione_su), coalesce((r->>'scaglione_da')::numeric, v_prima.scaglione_da),
              coalesce((r->>'scaglione_a')::numeric, v_prima.scaglione_a),
              v_dal, 'Da approvare', auth.uid(), v_motivo)
      returning id into v_id;
    end if;
    if v_dir or v_motivo is null then
      update public.tariffe set approvata_da = auth.uid(), motivo = null where id = v_id;
      perform public.attiva_tariffa(v_id);
    end if;
    v_n := v_n + 1;
    perform public.registra('trasporti', 'Tariffe', c.nome || ' · ' || v_voce || ' ' || (r->>'prezzo') || ' € dal ' || to_char(v_dal, 'DD/MM')
      || case when v_dir or v_motivo is null then '' else ' · da approvare: ' || v_motivo end, null, 'Manuale', 'tariffe', v_id::text);
  end loop;
  return v_n;
end $$;

create or replace function public.approva_tariffa(p_id uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tariffe;
begin
  if not (public.staff_di('trasporti') and public.mio_ruolo() = 'direzione') then raise exception 'Approva solo la Direzione'; end if;
  select * into t from public.tariffe where id = p_id for update;
  if t.id is null or t.stato <> 'Da approvare' then raise exception 'Niente da approvare'; end if;
  if p_ok then
    update public.tariffe set approvata_da = auth.uid() where id = t.id;
    perform public.attiva_tariffa(t.id);
  else
    update public.tariffe set stato = 'Rifiutata', approvata_da = auth.uid() where id = t.id;
  end if;
  perform public.registra('trasporti', 'Tariffe', t.voce || ' ' || t.prezzo || ' € ' || case when p_ok then 'approvata' else 'rifiutata' end,
                          null, 'Manuale', 'tariffe', t.id::text);
end $$;
revoke execute on function public.salva_tariffe(uuid, jsonb, date), public.approva_tariffa(uuid, boolean) from public, anon;
grant execute on function public.salva_tariffe(uuid, jsonb, date), public.approva_tariffa(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------ Fatture: tipo, IVA per riga, legame con le bolle
alter table public.fatture
  add column if not exists tipo text not null default 'Fattura' check (tipo in ('Fattura', 'Nota di credito')),
  add column if not exists rif_fattura uuid references public.fatture(id),
  add column if not exists totale numeric(12, 2) not null default 0,       -- da incassare: imponibile + IVA (senza IVA se split payment)
  add column if not exists split_payment boolean not null default false,
  add column if not exists sdi_esito text,                                  -- Consegnata, Non consegnata, Scartata…
  add column if not exists sdi_esito_il timestamptz,
  add column if not exists motivo text;                                     -- annullata o nota di credito: perché
alter table public.righe_fattura
  add column if not exists iva_aliquota numeric(5, 2) not null default 22,
  add column if not exists iva_natura text,
  add column if not exists margine boolean not null default false;          -- usato a regime del margine: IVA dentro il prezzo

create table if not exists public.fatture_bolle (
  fattura_id uuid not null references public.fatture(id) on delete cascade,
  bolla_id   uuid not null references public.bolle(id),
  valida     boolean not null default true,
  primary key (fattura_id, bolla_id)
);
create unique index if not exists fatture_bolle_una on public.fatture_bolle (bolla_id) where valida;
alter table public.fatture_bolle enable row level security;
create policy fatture_bolle_lettura on public.fatture_bolle for select to authenticated
  using (exists (select 1 from public.fatture f where f.id = fattura_id));
grant select on public.fatture_bolle to authenticated;

-- totali dalle righe: nessuno li scrive a mano
create or replace function public.ricalcola_fattura(p_fattura uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_imp numeric; v_iva numeric; f public.fatture;
begin
  select * into f from public.fatture where id = p_fattura;
  if f.id is null then return; end if;
  select coalesce(sum(r.totale), 0),
         coalesce(sum(case when r.margine or r.iva_natura is not null then 0 else round(r.totale * r.iva_aliquota / 100, 2) end), 0)
    into v_imp, v_iva from public.righe_fattura r where r.fattura_id = p_fattura;
  perform set_config('messina.ricalcolo', 'si', true);
  update public.fatture set imponibile = v_imp, iva = v_iva,
         totale = v_imp + case when f.split_payment then 0 else v_iva end
   where id = p_fattura;
  perform set_config('messina.ricalcolo', '', true);
end $$;
revoke execute on function public.ricalcola_fattura(uuid) from public, anon, authenticated;

create or replace function public.righe_fattura_bloccate() returns trigger
language plpgsql security definer set search_path = public as $$
declare f public.fatture; c public.clienti;
begin
  select * into f from public.fatture where id = coalesce(new.fattura_id, old.fattura_id);
  if f.stato not in ('Bozza', 'Da controllare', 'Pronta') or (tg_op = 'UPDATE' and old.fattura_id <> new.fattura_id) then
    raise exception 'Fattura inviata o annullata: le righe non si toccano';
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null then
    -- IVA della riga: quella del cliente, salvo margine
    select * into c from public.clienti where id = f.cliente_id;
    if not new.margine then new.iva_aliquota := coalesce(c.iva_aliquota, 22); new.iva_natura := c.iva_natura; end if;
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.righe_fattura_totali() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.ricalcola_fattura(coalesce(new.fattura_id, old.fattura_id));
  -- una riga cambiata riporta la fattura pronta a «Bozza»: va riguardata prima di inviarla
  update public.fatture set stato = 'Bozza'
   where id = coalesce(new.fattura_id, old.fattura_id) and stato = 'Pronta' and auth.uid() is not null
     and coalesce(current_setting('messina.chiusura_mese', true), '') <> 'si';
  return null;
end $$;
drop trigger if exists righe_fattura_totali on public.righe_fattura;
create trigger righe_fattura_totali after insert or update or delete on public.righe_fattura
  for each row execute function public.righe_fattura_totali();

create or replace function public.fatture_regole() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sistema boolean := auth.uid() is null; v_manca text[]; v_ric boolean := coalesce(current_setting('messina.ricalcolo', true), '') = 'si';
begin
  if tg_op = 'INSERT' then
    if new.stato not in ('Bozza', 'Da controllare', 'Pronta') or new.inviata_il is not null or new.pagata_il is not null then
      raise exception 'Una fattura nasce in bozza, da controllare o pronta';
    end if;
    if not v_sistema then
      -- importi dalle righe; IVA del cliente; data italiana
      new.imponibile := 0; new.iva := 0; new.totale := 0; new.stato := 'Bozza'; new.numero := null; new.fic_id := null; new.sdi_inviata_il := null;
      new.split_payment := coalesce((select split_payment from public.clienti where id = new.cliente_id), false);
    else
      new.totale := case when new.totale = 0 then new.imponibile + case when new.split_payment then 0 else new.iva end else new.totale end;
    end if;
    new.periodo := coalesce(new.periodo, to_char(public.oggi(), 'YYYY-MM'));
    return new;
  end if;
  if (new.imponibile, new.iva, new.totale) is distinct from (old.imponibile, old.iva, old.totale) and not v_ric and not v_sistema then
    raise exception 'Gli importi li calcola il programma dalle righe';
  end if;
  if old.stato in ('Inviata', 'Pagata', 'Stornata', 'Annullata') and (new.imponibile, new.iva, new.cliente_id, new.periodo, new.azienda, new.tipo)
       is distinct from (old.imponibile, old.iva, old.cliente_id, old.periodo, old.azienda, old.tipo) then
    raise exception 'Fattura inviata: non si modifica, si fa una nota di credito';
  end if;
  if old.numero is not null and new.numero is distinct from old.numero then raise exception 'Il numero non si cambia'; end if;
  if new.stato is distinct from old.stato then
    if not (
         (old.stato = 'Bozza' and new.stato in ('Da controllare', 'Pronta', 'Annullata'))
      or (old.stato = 'Da controllare' and new.stato in ('Bozza', 'Pronta', 'Annullata'))
      or (old.stato = 'Pronta' and new.stato in ('Bozza', 'Da controllare', 'Inviata', 'Annullata'))
      or (old.stato = 'Inviata' and new.stato in ('Pagata', 'Stornata', 'Da controllare'))
    ) then
      raise exception 'Passaggio non permesso: % → %', old.stato, new.stato;
    end if;
    -- «Inviata» (e lo scarto dello SdI, e lo storno) li scrive solo il sistema, dopo la risposta di Fatture in Cloud
    if new.stato in ('Inviata', 'Stornata') or old.stato = 'Inviata' and new.stato = 'Da controllare' then
      if not v_sistema then raise exception 'Inviata la segna il programma quando Fatture in Cloud conferma l''invio: premi «Invia»'; end if;
      if new.stato = 'Inviata' then new.inviata_il := coalesce(new.inviata_il, now()); end if;
    end if;
    if new.stato = 'Pagata' then new.pagata_il := coalesce(new.pagata_il, public.oggi()); end if;
    if new.stato = 'Annullata' and coalesce(trim(new.motivo), '') = '' and not v_sistema then raise exception 'Scrivi perché annulli la fattura'; end if;
    if new.stato = 'Pronta' then
      if coalesce(new.problema, '') <> '' then raise exception 'Fattura da controllare: %', new.problema; end if;
      if not v_sistema then
        if not exists (select 1 from public.righe_fattura where fattura_id = new.id) or new.imponibile <= 0 then
          raise exception 'Fattura senza righe o a zero: niente da inviare';
        end if;
        v_manca := public.anagrafica_mancante(new.cliente_id);
        if cardinality(v_manca) > 0 then raise exception 'Nella scheda del cliente manca: %', array_to_string(v_manca, ', '); end if;
        new.approvata_da := auth.uid();
      end if;
    end if;
  end if;
  return new;
end $$;

-- dopo i passaggi di stato: bolle fatturate, legami validi, storni
create or replace function public.fatture_dopo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stato is not distinct from old.stato then return null; end if;
  if new.stato = 'Inviata' and new.tipo = 'Fattura' then
    update public.bolle set stato = 'Fatturata'
     where id in (select bolla_id from public.fatture_bolle where fattura_id = new.id and valida) and stato = 'Consegnata';
  elsif new.stato in ('Annullata', 'Stornata') then
    update public.fatture_bolle set valida = false where fattura_id = new.id;
    update public.bolle set stato = 'Consegnata'
     where id in (select bolla_id from public.fatture_bolle where fattura_id = new.id) and stato = 'Fatturata';
  elsif new.stato = 'Inviata' and new.tipo = 'Nota di credito' and new.rif_fattura is not null then
    update public.fatture set stato = 'Stornata' where id = new.rif_fattura and stato = 'Inviata';
  end if;
  perform public.registra(new.azienda, 'Fatture', coalesce(new.tipo, 'Fattura') || coalesce(' ' || new.numero, '') || ': ' || old.stato || ' → ' || new.stato
    || coalesce(' · ' || new.motivo, ''), null, case when auth.uid() is null then 'Sistema' else 'Manuale' end, 'fatture', new.id::text);
  return null;
end $$;
drop trigger if exists fatture_dopo on public.fatture;
create trigger fatture_dopo after update of stato on public.fatture
  for each row execute function public.fatture_dopo();

-- le fatture non si cancellano: si annullano (prima dell'invio) o si stornano con una nota di credito
drop policy if exists fatture_scrittura on public.fatture;
create policy fatture_nuova on public.fatture for insert to authenticated
  with check (public.staff_di(azienda) and public.ha_ruolo('amministrazione'));
create policy fatture_modifica on public.fatture for update to authenticated
  using (public.staff_di(azienda) and public.ha_ruolo('amministrazione'))
  with check (public.staff_di(azienda) and public.ha_ruolo('amministrazione'));
revoke delete on public.fatture from authenticated;

-- ------------------------------------------------------------------ Chiusura del mese
-- Per ogni cliente: tutte le bolle consegnate fino alla fine del mese e non ancora in una fattura valida.
-- Una fattura per cliente e mese; se c'è già in bozza si completa. Le bolle in giacenza aspettano la chiusura.
create or replace function public.chiudi_mese(p_mese text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_fine date; c record; v_f uuid; v_problemi text[]; r record; v_n int := 0; v_cli public.clienti;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('amministrazione')) then raise exception 'La chiusura del mese la fa l''amministrazione'; end if;
  if p_mese !~ '^\d{4}-\d{2}$' then raise exception 'Mese non valido'; end if;
  v_fine := (to_date(p_mese || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  if v_fine > public.oggi() and to_char(public.oggi(), 'YYYY-MM') <> p_mese then raise exception 'Il mese non è ancora cominciato'; end if;
  perform set_config('messina.chiusura_mese', 'si', true);
  -- i clienti con bolle nuove da fatturare e quelli con una fattura del mese ancora aperta (si ricalcola)
  for c in
    with nuove as (
      select b.cliente_id, b.id, b.data_consegna, b.numero
        from public.bolle b join public.clienti cl on cl.id = b.cliente_id
       where cl.azienda = 'trasporti' and b.stato = 'Consegnata' and b.tipo <> 'Magazzino' and b.data_consegna <= v_fine
         and not exists (select 1 from public.fatture_bolle fb where fb.bolla_id = b.id and fb.valida)
         and not exists (select 1 from public.giacenze g where g.bolla_id = b.id and g.chiusa_il is null)
    ), clienti as (
      select cliente_id from nuove
      union
      select f.cliente_id from public.fatture f
       where f.azienda = 'trasporti' and f.periodo = p_mese and f.tipo = 'Fattura' and f.stato in ('Bozza', 'Da controllare', 'Pronta')
         and exists (select 1 from public.fatture_bolle fb where fb.fattura_id = f.id and fb.valida)
    )
    select k.cliente_id, coalesce(array_agg(n.id order by n.data_consegna, n.numero) filter (where n.id is not null), '{}') as bolle
      from clienti k left join nuove n on n.cliente_id = k.cliente_id
     group by k.cliente_id
  loop
    select * into v_cli from public.clienti where id = c.cliente_id;
    select id into v_f from public.fatture
     where azienda = 'trasporti' and cliente_id = c.cliente_id and periodo = p_mese and tipo = 'Fattura' and stato in ('Bozza', 'Da controllare', 'Pronta')
     order by creata_il limit 1;
    if v_f is null then
      insert into public.fatture (azienda, cliente_id, periodo, stato, split_payment)
      values ('trasporti', c.cliente_id, p_mese, 'Bozza', v_cli.split_payment) returning id into v_f;
    else
      update public.fatture set stato = 'Bozza', problema = null where id = v_f and stato <> 'Bozza';
    end if;
    insert into public.fatture_bolle (fattura_id, bolla_id) select v_f, x from unnest(c.bolle) x on conflict do nothing;
    -- righe raggruppate per voce e prezzo: il dettaglio per bolla è in fatture_bolle (allegato)
    delete from public.righe_fattura where fattura_id = v_f and voce like '% · consegne%';
    insert into public.righe_fattura (fattura_id, voce, quantita, prezzo, iva_aliquota, iva_natura)
    select v_f, x.voce || ' · consegne ' || p_mese, sum(x.quantita), x.prezzo, v_cli.iva_aliquota, v_cli.iva_natura
      from public.fatture_bolle fb cross join lateral public.calcola_bolla(fb.bolla_id) x
     where fb.fattura_id = v_f and fb.valida and x.problema is null and x.totale > 0
     group by x.voce, x.prezzo;
    perform public.ricalcola_fattura(v_f);
    select array_agg(distinct coalesce(b.numero, 'senza numero') || ': ' || x.problema) into v_problemi
      from public.fatture_bolle fb join public.bolle b on b.id = fb.bolla_id cross join lateral public.calcola_bolla(fb.bolla_id) x
     where fb.fattura_id = v_f and fb.valida and x.problema is not null;
    v_problemi := coalesce(v_problemi, '{}') || coalesce((select array_agg('scheda cliente: manca ' || m) from unnest(public.anagrafica_mancante(c.cliente_id)) m), '{}');
    update public.fatture set
      problema = case when cardinality(v_problemi) > 0 then array_to_string(v_problemi[1:5], '; ')
                       || case when cardinality(v_problemi) > 5 then ' e altri ' || (cardinality(v_problemi) - 5) else '' end end,
      stato = case when cardinality(v_problemi) > 0 then 'Da controllare'::public.stato_fattura else 'Pronta'::public.stato_fattura end,
      approvata_da = null
     where id = v_f;
    v_n := v_n + 1;
  end loop;
  perform set_config('messina.chiusura_mese', '', true);
  perform public.registra('trasporti', 'Fatture', 'Chiusura di ' || p_mese || ': ' || v_n || ' fatture preparate', null, 'Manuale', 'fatture', p_mese);
  return v_n;
end $$;

-- dopo aver sistemato tariffe o dati: ricalcola le righe dalle bolle e riprova
create or replace function public.ricontrolla_fattura(p_fattura uuid) returns text
language plpgsql security definer set search_path = public as $$
declare f public.fatture;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('amministrazione')) then raise exception 'Non autorizzato'; end if;
  select * into f from public.fatture where id = p_fattura;
  if f.id is null or f.stato not in ('Bozza', 'Da controllare', 'Pronta') then raise exception 'Si ricontrolla solo una fattura non ancora inviata'; end if;
  if not exists (select 1 from public.fatture_bolle where fattura_id = f.id and valida) then
    -- fattura scritta a mano: si ricontrolla solo l'anagrafica
    update public.fatture set problema = nullif(array_to_string((select array_agg('scheda cliente: manca ' || m) from unnest(public.anagrafica_mancante(f.cliente_id)) m), '; '), '')
     where id = f.id;
    return (select problema from public.fatture where id = f.id);
  end if;
  perform public.chiudi_mese(f.periodo);
  return (select problema from public.fatture where id = f.id);
end $$;

-- annullare una fattura non ancora inviata: le sue bolle tornano da fatturare
create or replace function public.annulla_fattura(p_fattura uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.staff_di('trasporti') or public.staff_di('corporation')) or not public.ha_ruolo('amministrazione') then raise exception 'Non autorizzato'; end if;
  update public.fatture set stato = 'Annullata', motivo = trim(p_motivo) where id = p_fattura and public.staff_di(azienda);
  if not found then raise exception 'Fattura non trovata'; end if;
end $$;

-- nota di credito: copia le righe della fattura inviata; quando Fatture in Cloud la conferma, la fattura risulta stornata
create or replace function public.nota_di_credito(p_fattura uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f public.fatture; v_nc uuid;
begin
  select * into f from public.fatture where id = p_fattura;
  if f.id is null or not (public.staff_di(f.azienda) and public.ha_ruolo('amministrazione')) then raise exception 'Fattura non trovata'; end if;
  if f.tipo <> 'Fattura' or f.stato <> 'Inviata' then raise exception 'La nota di credito si fa su una fattura inviata e non ancora pagata'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Scrivi il motivo della nota di credito'; end if;
  if exists (select 1 from public.fatture where rif_fattura = f.id and stato not in ('Annullata')) then raise exception 'C''è già una nota di credito per questa fattura'; end if;
  insert into public.fatture (azienda, cliente_id, periodo, stato, tipo, rif_fattura, split_payment, motivo)
  values (f.azienda, f.cliente_id, f.periodo, 'Bozza', 'Nota di credito', f.id, f.split_payment, trim(p_motivo)) returning id into v_nc;
  insert into public.righe_fattura (fattura_id, voce, quantita, prezzo, iva_aliquota, iva_natura, margine)
  select v_nc, voce, quantita, prezzo, iva_aliquota, iva_natura, margine from public.righe_fattura where fattura_id = f.id;
  return v_nc;
end $$;

revoke execute on function public.chiudi_mese(text), public.ricontrolla_fattura(uuid), public.annulla_fattura(uuid, text),
  public.nota_di_credito(uuid, text), public.anagrafica_mancante(uuid) from public, anon;
grant execute on function public.chiudi_mese(text), public.ricontrolla_fattura(uuid), public.annulla_fattura(uuid, text),
  public.nota_di_credito(uuid, text), public.anagrafica_mancante(uuid) to authenticated;

-- incassato: quello che entra davvero (con l'IVA, salvo split payment); giorni italiani
create or replace view public.incassi_trasporti with (security_invoker = true) as
select
  coalesce(sum(public.valore_bolla(b.id)) filter (where b.data_consegna = public.oggi()), 0) as fatturato_oggi,
  coalesce(sum(public.valore_bolla(b.id)) filter (where date_trunc('month', b.data_consegna) = date_trunc('month', public.oggi())), 0) as fatturato_mese,
  coalesce((select sum(case when f.tipo = 'Nota di credito' then -f.totale else f.totale end) from public.fatture f
             where f.stato = 'Pagata' and f.azienda = 'trasporti'
               and date_trunc('month', f.pagata_il) = date_trunc('month', public.oggi())), 0) as incassato_mese
from public.bolle b
where b.stato in ('Consegnata', 'Giacenza', 'Non consegnata', 'Fatturata');

-- le fatture già presenti: totale da imponibile e IVA
update public.fatture set totale = imponibile + case when split_payment then 0 else iva end where totale = 0;

-- regola «restrictive» del doppio fattore anche sulle tabelle nuove (vedi 20261021000100)
create policy doppio_fattore on public.listino as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());
create policy doppio_fattore on public.fatture_bolle as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());

-- esiti dello SdI: ogni ora si chiedono a Fatture in Cloud
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('messina-esiti-sdi', '20 * * * *', $c$select public.chiama_funzione('fatture-in-cloud', '{"azione":"esiti"}')$c$);
  else
    raise notice 'pg_cron non presente: gli esiti dello SdI vanno attivati dopo (docs/SETUP.md)';
  end if;
end $$;
