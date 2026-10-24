-- =====================================================================
-- Manuale Messina: la base di conoscenza di JARVIS e degli agenti, una sola fonte.
--  · una scheda = Titolo, Tipo, Reparto, Testo, Esempio, Fonte, Approvata da, Data, Stato (+ capitolo e società)
--  · sei capitoli: Azienda, Clienti, Procedure, Regole, Tariffe, Glossario
--  · nasce Bozza (o Da chiarire, con la domanda scritta); diventa Approvata solo con approva_scheda(),
--    chiamata da una persona della Direzione: né un agente né il sistema possono approvare
--  · una scheda approvata non si tocca più: si cambia con una versione nuova, che all'approvazione
--    fa diventare «Superata» quella vecchia. Niente si cancella: lo storico delle versioni resta
--  · gli agenti e gli uffici leggono solo le schede approvate della loro società; la Direzione vede tutto
--  · ricerca a parole in italiano (cerca_manuale), già pronta per gli agenti
-- =====================================================================

create table public.manuale (
  id            uuid primary key default gen_random_uuid(),
  azienda       text not null references public.aziende(id),
  codice        text not null check (codice ~ '^[ACPRTG][0-9]{1,4}$'),   -- A1, C3, P12…: la lettera è il capitolo
  versione      integer not null default 1 check (versione >= 1),
  capitolo      text not null check (capitolo in ('Azienda', 'Clienti', 'Procedure', 'Regole', 'Tariffe', 'Glossario')),
  tipo          text not null check (tipo in ('Fatto', 'Regola', 'Passo', 'Eccezione', 'Prezzo', 'Termine')),
  reparto       text not null check (reparto in ('Tutti', 'Direzione', 'Amministrazione', 'Commerciale', 'Ufficio bolle',
                                                  'Ufficio traffico', 'Magazzino', 'Mezzi', 'Corporation', 'Stage')),
  titolo        text not null check (length(trim(titolo)) between 3 and 120),
  testo         text not null check (length(trim(testo)) >= 3),
  esempio       text,
  fonte         text not null check (length(trim(fonte)) >= 3),
  stato         text not null default 'Bozza' check (stato in ('Bozza', 'Da chiarire', 'Approvata', 'Superata')),
  da_chiarire   text,                                                    -- la domanda aperta
  data          date not null default public.oggi(),                     -- giorno della bozza, poi dell'approvazione
  approvata_da  uuid references public.profili(id),
  approvata_il  timestamptz,
  sostituisce   uuid references public.manuale(id),                      -- la versione precedente
  creata_da     uuid references public.profili(id) default auth.uid(),
  creata_il     timestamptz not null default now(),
  cerca         tsvector generated always as (
                  setweight(to_tsvector('italian', coalesce(titolo, '')), 'A') ||
                  setweight(to_tsvector('italian', coalesce(testo, '')), 'B') ||
                  setweight(to_tsvector('italian', coalesce(esempio, '')), 'C')) stored,
  check (left(codice, 1) = left(capitolo, 1)),
  check ((stato = 'Da chiarire') = (nullif(trim(coalesce(da_chiarire, '')), '') is not null)),
  check ((stato in ('Approvata', 'Superata')) = (approvata_da is not null and approvata_il is not null)),
  unique (azienda, codice, versione)
);
-- una sola versione viva per scheda; e una sola versione nuova in lavorazione per volta
create unique index manuale_una_viva on public.manuale (azienda, codice) where stato = 'Approvata';
create unique index manuale_una_bozza on public.manuale (azienda, codice) where stato in ('Bozza', 'Da chiarire');
create index manuale_cerca on public.manuale using gin (cerca);
create index manuale_reparto on public.manuale (azienda, reparto, capitolo) where stato = 'Approvata';

-- regole: come nasce una scheda, cosa si può cambiare, chi la approva --------
create or replace function public.manuale_regole() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prec public.manuale;
begin
  if tg_op = 'DELETE' then raise exception 'Una scheda del Manuale non si cancella: si supera con una versione nuova'; end if;

  if tg_op = 'INSERT' then
    if new.stato not in ('Bozza', 'Da chiarire') or new.approvata_da is not null or new.approvata_il is not null then
      raise exception 'Una scheda nasce Bozza o Da chiarire';
    end if;
    new.data := public.oggi(); new.creata_il := now(); new.creata_da := auth.uid();
    if new.versione = 1 then
      if new.sostituisce is not null then raise exception 'La prima versione non sostituisce niente'; end if;
      if exists (select 1 from public.manuale where azienda = new.azienda and codice = new.codice) then
        raise exception 'Il codice % esiste già: per cambiarla fai una versione nuova', new.codice;
      end if;
    else
      select * into v_prec from public.manuale where id = new.sostituisce;
      if v_prec.id is null or v_prec.azienda <> new.azienda or v_prec.codice <> new.codice
         or v_prec.versione <> new.versione - 1 or v_prec.stato <> 'Approvata' then
        raise exception 'Una versione nuova parte dall''ultima versione approvata della stessa scheda';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if (new.id, new.azienda, new.codice, new.versione, new.capitolo, new.sostituisce, new.creata_da, new.creata_il)
     is distinct from (old.id, old.azienda, old.codice, old.versione, old.capitolo, old.sostituisce, old.creata_da, old.creata_il) then
    raise exception 'Società, codice, versione e capitolo di una scheda non si cambiano';
  end if;
  if old.stato in ('Approvata', 'Superata') then
    if old.stato = 'Approvata' and new.stato = 'Superata' and current_setting('messina.manuale', true) = 'supera'
       and (new.tipo, new.reparto, new.titolo, new.testo, new.esempio, new.fonte, new.data, new.approvata_da, new.approvata_il, new.da_chiarire)
           is not distinct from (old.tipo, old.reparto, old.titolo, old.testo, old.esempio, old.fonte, old.data, old.approvata_da, old.approvata_il, old.da_chiarire) then
      return new;
    end if;
    raise exception 'Una scheda approvata non si cambia: fai una versione nuova';
  end if;
  -- da qui: Bozza o Da chiarire
  if new.stato = 'Superata' then raise exception 'Supera una scheda solo approvando la versione nuova'; end if;
  if new.stato = 'Approvata' then
    if current_setting('messina.manuale', true) is distinct from 'approva' then
      raise exception 'Si approva solo con «Approva», da una persona della Direzione';
    end if;
    if new.da_chiarire is not null then raise exception 'Prima si chiarisce la domanda aperta'; end if;
    new.data := public.oggi();
  elsif new.approvata_da is not null or new.approvata_il is not null then
    raise exception 'Approvata da e quando le scrive solo «Approva»';
  end if;
  return new;
end $$;
create trigger manuale_regole before insert or update or delete on public.manuale
  for each row execute function public.manuale_regole();

-- approvare: solo una persona della Direzione, dalla società della scheda, con il codice dell'app se richiesto
create or replace function public.approva_scheda(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.manuale;
begin
  select * into s from public.manuale where id = p_id for update;
  if s.id is null then raise exception 'Scheda non trovata'; end if;
  if auth.uid() is null or not (public.staff_di(s.azienda) and public.mio_ruolo() = 'direzione') then
    raise exception 'Le schede del Manuale le approva solo la Direzione';
  end if;
  if s.stato = 'Da chiarire' then raise exception 'La scheda ha una domanda aperta: «%»', s.da_chiarire; end if;
  if s.stato <> 'Bozza' then raise exception 'Si approva solo una bozza'; end if;
  perform set_config('messina.manuale', 'supera', true);
  update public.manuale set stato = 'Superata' where id = s.sostituisce;
  perform set_config('messina.manuale', 'approva', true);
  update public.manuale set stato = 'Approvata', approvata_da = auth.uid(), approvata_il = now() where id = s.id;
  perform set_config('messina.manuale', '', true);
  perform public.registra(s.azienda, 'Manuale', s.codice || ' v' || s.versione || ' approvata: ' || s.titolo,
                          s.reparto, 'Manuale', 'manuale', s.id::text);
end $$;

-- cambiare una scheda approvata: nasce la versione nuova, in bozza, con lo stesso codice
create or replace function public.nuova_versione(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.manuale; v_id uuid;
begin
  select * into s from public.manuale where id = p_id;
  if s.id is null then raise exception 'Scheda non trovata'; end if;
  if auth.uid() is not null and not (public.staff_di(s.azienda) and public.mio_ruolo() = 'direzione') then
    raise exception 'Le schede del Manuale le scrive la Direzione';
  end if;
  if s.stato <> 'Approvata' then raise exception 'Si fa una versione nuova solo di una scheda approvata'; end if;
  insert into public.manuale (azienda, codice, versione, capitolo, tipo, reparto, titolo, testo, esempio, fonte, sostituisce)
  values (s.azienda, s.codice, s.versione + 1, s.capitolo, s.tipo, s.reparto, s.titolo, s.testo, s.esempio, s.fonte, s.id)
  returning id into v_id;
  perform public.registra(s.azienda, 'Manuale', s.codice || ': aperta la versione ' || (s.versione + 1), s.reparto, 'Manuale', 'manuale', v_id::text);
  return v_id;
end $$;

-- cercare: per gli agenti e per le persone; solo schede approvate della società in cui si lavora
create or replace function public.cerca_manuale(p_testo text, p_reparto text default null, p_quanti integer default 10)
returns table (codice text, versione integer, capitolo text, tipo text, reparto text, titolo text, testo text,
               esempio text, fonte text, approvata_il timestamptz, rilevanza real)
language sql stable security invoker set search_path = public as $$
  select m.codice, m.versione, m.capitolo, m.tipo, m.reparto, m.titolo, m.testo, m.esempio, m.fonte, m.approvata_il,
         ts_rank(m.cerca, q) as rilevanza
    from public.manuale m, websearch_to_tsquery('italian', coalesce(p_testo, '')) q
   where m.stato = 'Approvata'
     and (p_reparto is null or m.reparto in (p_reparto, 'Tutti'))
     and (coalesce(trim(p_testo), '') = '' or m.cerca @@ q)
   order by rilevanza desc, m.codice
   limit least(greatest(coalesce(p_quanti, 10), 1), 50)
$$;

-- RLS: si legge l'approvato della propria società; la Direzione vede anche bozze e versioni superate
alter table public.manuale enable row level security;
create policy manuale_lettura on public.manuale for select to authenticated
  using (public.staff_di(azienda) and (stato = 'Approvata' or public.mio_ruolo() = 'direzione'));
create policy manuale_scrittura on public.manuale for insert to authenticated
  with check (public.staff_di(azienda) and public.mio_ruolo() = 'direzione');
create policy manuale_modifica on public.manuale for update to authenticated
  using (public.staff_di(azienda) and public.mio_ruolo() = 'direzione' and stato in ('Bozza', 'Da chiarire'))
  with check (public.staff_di(azienda) and public.mio_ruolo() = 'direzione');
create policy doppio_fattore on public.manuale as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());

grant select, insert on public.manuale to authenticated;
grant update (tipo, reparto, titolo, testo, esempio, fonte, stato, da_chiarire) on public.manuale to authenticated;
revoke execute on function public.approva_scheda(uuid), public.nuova_versione(uuid), public.cerca_manuale(text, text, integer) from public, anon;
grant execute on function public.approva_scheda(uuid), public.nuova_versione(uuid), public.cerca_manuale(text, text, integer) to authenticated;
