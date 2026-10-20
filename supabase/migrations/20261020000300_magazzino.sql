-- =====================================================================
-- Magazzino condiviso (Trasporti + Corporation nello stesso capannone)
-- Posti con codice S07-2-1 (scaffale 7, piano 2, posto 1), bancali,
-- contenuto, movimenti, missioni con blocco se i conti non tornano.
-- La Corporation è un cliente del magazzino: vede solo i suoi bancali.
-- =====================================================================

-- il cliente che rappresenta una società del gruppo (es. Messina Corporation)
alter table public.clienti add column azienda_collegata text references public.aziende(id);

create table public.posti (
  id        uuid primary key default gen_random_uuid(),
  codice    text not null unique,                 -- S07-2-1 oppure zone a terra: RIC, RESI, ...
  scaffale  integer,
  piano     integer check (piano between 1 and 6),
  numero    integer,
  zona      text not null default 'Scaffale' check (zona in ('Scaffale', 'Ricevimento', 'Passaggio', 'Resi', 'Cliente', 'Uscita')),
  attivo    boolean not null default true
);

create table public.bancali (
  id          uuid primary key default gen_random_uuid(),
  codice      text not null unique,               -- B-0147, stampato sull'etichetta QR
  cliente_id  uuid not null references public.clienti(id),
  posto_id    uuid references public.posti(id),
  bolla_id    uuid references public.bolle(id),   -- bolla di entrata
  creato_il   timestamptz not null default now(),
  uscito_il   timestamptz
);
create index bancali_posto on public.bancali (posto_id);

alter table public.colli add constraint colli_bancale foreign key (bancale_id) references public.bancali(id);
alter table public.colli add constraint colli_posto foreign key (posto_id) references public.posti(id);

-- contenuto di un bancale: può contenere cose diverse
create table public.contenuto (
  id          uuid primary key default gen_random_uuid(),
  bancale_id  uuid not null references public.bancali(id) on delete cascade,
  articolo    text not null,
  quantita    integer not null check (quantita >= 0),
  codici      text[] not null default '{}',       -- seriali / IMEI letti
  inserito    text not null default 'Pistola' check (inserito in ('Pistola', 'Manuale', 'Foto')),
  da          uuid references public.profili(id),
  il          timestamptz not null default now()
);

-- è un bancale che posso vedere?
create or replace function public.bancale_visibile(p_bancale uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bancali b join public.clienti c on c.id = b.cliente_id
    where b.id = p_bancale and (
      (public.staff_di('trasporti') and public.mio_ruolo() <> 'autista')
      or (c.azienda_collegata is not null and public.staff_di(c.azienda_collegata))
      or c.id = public.mio_cliente() or c.tramite = public.mio_cliente()
    ))
$$;

-- ogni modifica del contenuto finisce nello storico; quelle a mano sono segnate
create or replace function public.contenuto_storico() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_codice text; v_posto text; r record;
begin
  r := coalesce(new, old);
  select b.codice, p.codice into v_codice, v_posto from public.bancali b left join public.posti p on p.id = b.posto_id
   where b.id = r.bancale_id;
  insert into public.storico (azienda, chi, chi_nome, operazione, cosa, dove, come, oggetto, oggetto_id, dettagli)
  values (coalesce(public.mia_azienda(), 'trasporti'), auth.uid(), (select nome from public.profili where id = auth.uid()),
          case tg_op when 'INSERT' then 'Aggiunta' when 'UPDATE' then 'Modifica' else 'Cancellazione' end,
          r.articolo || ' · ' || coalesce(new.quantita, 0) || ' pz' ||
            case when tg_op = 'UPDATE' then ' (prima ' || old.quantita || ')' else '' end,
          coalesce(v_posto, v_codice), coalesce(new.inserito, old.inserito), 'contenuto', r.id::text,
          jsonb_build_object('bancale', v_codice));
  return r;
end $$;
create trigger contenuto_storico after insert or update or delete on public.contenuto
  for each row execute function public.contenuto_storico();

-- Missioni: controlli mandati dall'ufficio ------------------------------
create table public.missioni (
  id          uuid primary key default gen_random_uuid(),
  ambito      text not null check (ambito in ('Tutto', 'Zona', 'Scaffale', 'Cliente')),
  filtro      text,                       -- es. S07 oppure nome del cliente
  stato       text not null default 'Aperta' check (stato in ('Aperta', 'Chiusa')),
  creata_da   uuid references public.profili(id),
  creata_il   timestamptz not null default now(),
  chiusa_il   timestamptz
);

create type public.stato_posto_missione as enum ('Da fare', 'Fatto', 'Bloccato', 'Sbloccato');

create table public.missioni_posti (
  id           uuid primary key default gen_random_uuid(),
  missione_id  uuid not null references public.missioni(id) on delete cascade,
  posto_id     uuid not null references public.posti(id),
  attesi       jsonb not null default '[]',   -- fotografia del contenuto al lancio: [{articolo, codice}]
  letti        jsonb not null default '[]',   -- codici scansionati dal magazziniere
  mancanti     jsonb not null default '[]',
  extra        jsonb not null default '[]',
  stato        public.stato_posto_missione not null default 'Da fare',
  motivo       text,                          -- obbligatorio per sbloccare
  sbloccato_da uuid references public.profili(id),
  aggiornato_il timestamptz not null default now(),
  unique (missione_id, posto_id)
);

create or replace function public.missioni_posti_regole() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.aggiornato_il := now();
  if new.stato = old.stato then return new; end if;
  if new.stato = 'Fatto' and (jsonb_array_length(new.mancanti) > 0 or jsonb_array_length(new.extra) > 0) then
    raise exception 'Il posto non si chiude: i pezzi non tornano';
  end if;
  if new.stato = 'Sbloccato' then
    if old.stato <> 'Bloccato' then raise exception 'Si sblocca solo un posto bloccato'; end if;
    if coalesce(trim(new.motivo), '') = '' then raise exception 'Per sbloccare scrivi cosa è successo'; end if;
    if not public.ha_ruolo('amministrazione', 'traffico') then raise exception 'Lo sblocca solo l''ufficio'; end if;
    new.sbloccato_da := auth.uid();
  end if;
  perform public.registra('trasporti', case new.stato when 'Bloccato' then 'Blocco' when 'Sbloccato' then 'Sblocco' else 'Missione' end,
    case new.stato when 'Sbloccato' then new.motivo
      else 'Mancano ' || jsonb_array_length(new.mancanti) || ', in più ' || jsonb_array_length(new.extra) end,
    (select codice from public.posti where id = new.posto_id), 'Sistema', 'missioni_posti', new.id::text,
    jsonb_build_object('mancanti', new.mancanti, 'extra', new.extra));
  return new;
end $$;
create trigger missioni_posti_regole before update on public.missioni_posti
  for each row execute function public.missioni_posti_regole();

-- Controllo: per ogni bolla, colli previsti contro colli letti -------------
create or replace view public.controllo_colli with (security_invoker = true) as
select b.id as bolla_id, b.numero, c.nome as cliente, b.tipo, b.colli_previsti as attesi,
       count(k.id) filter (where (b.tipo in ('Magazzino', 'Ritiro') and k.letto_entrata is not null)
                              or (b.tipo not in ('Magazzino', 'Ritiro') and k.letto_carico is not null)) as letti,
       max(greatest(k.letto_entrata, k.letto_carico)) as ultima_lettura
from public.bolle b join public.clienti c on c.id = b.cliente_id
left join public.colli k on k.bolla_id = b.id
where b.stato in ('Confermata', 'In giro')
group by b.id, c.nome;

-- RLS ----------------------------------------------------------------------
alter table public.posti enable row level security;
alter table public.bancali enable row level security;
alter table public.contenuto enable row level security;
alter table public.missioni enable row level security;
alter table public.missioni_posti enable row level security;

create policy posti_lettura on public.posti for select to authenticated
  using (public.mia_azienda() is not null and public.mio_ruolo() <> 'cliente');
create policy posti_scrittura on public.posti for all to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('amministrazione'))
  with check (public.staff_di('trasporti') and public.ha_ruolo('amministrazione'));

create policy bancali_lettura on public.bancali for select to authenticated using (public.bancale_visibile(id));
create policy bancali_scrittura on public.bancali for all to authenticated
  using (public.bancale_visibile(id) and public.ha_ruolo('magazzino', 'vendite', 'stage'))
  with check (public.bancale_visibile(id) and public.ha_ruolo('magazzino', 'vendite', 'stage'));
-- bancale nuovo: lo crea chi lavora in magazzino, per un cliente che può vedere
create policy bancali_nuovo on public.bancali for insert to authenticated
  with check (public.ha_ruolo('magazzino', 'vendite', 'stage') and (
    public.staff_di('trasporti') or exists (select 1 from public.clienti c where c.id = cliente_id
                                            and c.azienda_collegata = public.mia_azienda())));

create policy contenuto_lettura on public.contenuto for select to authenticated using (public.bancale_visibile(bancale_id));
create policy contenuto_scrittura on public.contenuto for all to authenticated
  using (public.bancale_visibile(bancale_id) and public.ha_ruolo('magazzino', 'vendite', 'stage'))
  with check (public.bancale_visibile(bancale_id) and public.ha_ruolo('magazzino', 'vendite', 'stage'));

create policy missioni_lettura on public.missioni for select to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('magazzino', 'traffico', 'amministrazione'));
create policy missioni_lancio on public.missioni for insert to authenticated
  with check (public.staff_di('trasporti') and public.ha_ruolo('traffico', 'amministrazione'));
create policy missioni_posti_lettura on public.missioni_posti for select to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('magazzino', 'traffico', 'amministrazione'));
-- scansioni, blocchi e sblocchi passano solo dalle funzioni in azioni.sql

grant select on public.posti, public.bancali, public.contenuto, public.missioni, public.missioni_posti, public.controllo_colli to authenticated;
grant insert, update, delete on public.posti, public.bancali, public.contenuto to authenticated;
grant insert on public.missioni to authenticated;
