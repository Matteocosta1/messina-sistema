-- =====================================================================
-- Presenze: badge virtuale sul telefono (QR che cambia ogni 30 secondi),
-- timbrature, correzioni, ferie e permessi.
-- Ogni badge è legato a UN telefono: da un altro telefono, con uno
-- screenshot vecchio o con un badge disattivato la timbratura è rifiutata
-- e si registra di chi era il badge (allarme).
-- Prima di attivarlo: informativa firmata e verifica del consulente.
-- =====================================================================

create table public.badge (
  id            uuid primary key default gen_random_uuid(),
  dipendente_id uuid not null references public.dipendenti(id),
  dispositivo   text not null,                  -- identificativo del telefono registrato
  segreto       bytea not null default gen_random_bytes(32),
  attivo        boolean not null default true,
  creato_il     timestamptz not null default now(),
  disattivato_il timestamptz
);
create unique index badge_uno_attivo on public.badge (dipendente_id) where attivo;

create table public.timbrature (
  id            bigint generated always as identity primary key,
  dipendente_id uuid references public.dipendenti(id),
  badge_id      uuid references public.badge(id),
  quando        timestamptz not null default now(),
  verso         text check (verso in ('Entrata', 'Uscita')),
  esito         text not null check (esito in ('Valida', 'Rifiutata')),
  motivo        text,                           -- perché è stata rifiutata
  lettore       text,
  dispositivo   text
);
create index timbrature_dip on public.timbrature (dipendente_id, quando desc);

create or replace function public.timbrature_immutabili() returns trigger
language plpgsql as $$ begin raise exception 'Le timbrature non si modificano: si aggiunge una correzione'; end $$;
create trigger timbrature_no_update before update or delete on public.timbrature
  for each row execute function public.timbrature_immutabili();

create table public.correzioni (
  id            uuid primary key default gen_random_uuid(),
  dipendente_id uuid not null references public.dipendenti(id),
  giorno        date not null,
  verso         text not null check (verso in ('Entrata', 'Uscita')),
  ora           time not null,
  motivo        text not null,
  fatta_da      uuid not null default auth.uid() references public.profili(id),
  fatta_il      timestamptz not null default now()
);

create table public.ferie (
  dipendente_id uuid not null references public.dipendenti(id),
  anno          integer not null,
  ferie_maturate numeric(5, 1) not null default 0,   -- giorni
  ferie_godute   numeric(5, 1) not null default 0,
  permessi_spettanti numeric(6, 1) not null default 0, -- ore
  permessi_usati numeric(6, 1) not null default 0,
  primary key (dipendente_id, anno)
);

-- Codice del QR: "<badge>.<finestra>.<firma>"; finestra = minuti da epoch / 0,5
create or replace function public.codice_badge(p_badge uuid, p_finestra bigint) returns text
language sql stable security definer set search_path = public, extensions as $$
  select p_badge::text || '.' || p_finestra || '.' ||
         encode(hmac(convert_to(p_badge::text || '.' || p_finestra, 'UTF8'), (select segreto from public.badge where id = p_badge), 'sha256'), 'hex')
$$;
revoke all on function public.codice_badge(uuid, bigint) from public;

-- Il telefono del dipendente chiede il suo QR del momento
create or replace function public.mio_qr(p_dispositivo text) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_badge uuid;
begin
  select id into v_badge from public.badge
   where dipendente_id = public.mio_dipendente() and attivo and dispositivo = p_dispositivo;
  if v_badge is null then raise exception 'Questo telefono non è registrato per il tuo badge'; end if;
  return public.codice_badge(v_badge, floor(extract(epoch from now()) / 30)::bigint);
end $$;

-- Il lettore all'ingresso manda il codice letto (lo chiama solo il server)
create or replace function public.timbra(p_codice text, p_lettore text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_parti text[] := string_to_array(p_codice, '.');
  v_badge public.badge; v_finestra bigint; v_ora bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_ultimo text; v_verso text; v_motivo text;
begin
  if array_length(v_parti, 1) <> 3 then
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
  elsif not v_badge.attivo then v_motivo := 'Badge disattivato';
  elsif abs(v_ora - v_finestra) > 1 then v_motivo := 'Codice scaduto (foto o screenshot?)';
  end if;
  if v_motivo is not null then
    insert into public.timbrature (dipendente_id, badge_id, esito, motivo, lettore)
    values (v_badge.dipendente_id, v_badge.id, 'Rifiutata', v_motivo, p_lettore);
    return jsonb_build_object('ok', false, 'motivo', v_motivo);
  end if;
  select verso into v_ultimo from public.timbrature
   where dipendente_id = v_badge.dipendente_id and esito = 'Valida' and quando::date = current_date
   order by quando desc limit 1;
  v_verso := case when v_ultimo = 'Entrata' then 'Uscita' else 'Entrata' end;
  insert into public.timbrature (dipendente_id, badge_id, verso, esito, lettore, dispositivo)
  values (v_badge.dipendente_id, v_badge.id, v_verso, 'Valida', p_lettore, v_badge.dispositivo);
  return jsonb_build_object('ok', true, 'verso', v_verso,
                            'nome', (select nome from public.dipendenti where id = v_badge.dipendente_id));
end $$;
revoke all on function public.timbra(text, text) from public;
grant execute on function public.timbra(text, text) to service_role;

-- RLS ----------------------------------------------------------------------
alter table public.badge enable row level security;
alter table public.timbrature enable row level security;
alter table public.correzioni enable row level security;
alter table public.ferie enable row level security;

-- l'amministrazione vede e corregge solo i dipendenti della sua società
create or replace function public.amministro(p_dipendente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.ha_ruolo('amministrazione') and exists (
    select 1 from public.dipendenti d where d.id = p_dipendente and public.staff_di(d.azienda))
$$;

-- il segreto del badge non esce mai: nessuna policy di lettura per i client
create policy badge_amministrazione on public.badge for select to authenticated
  using (public.amministro(dipendente_id));

-- ognuno vede solo le sue timbrature; il quadro completo solo l'amministrazione
create policy timbrature_lettura on public.timbrature for select to authenticated
  using (dipendente_id = public.mio_dipendente() or public.amministro(dipendente_id));

create policy correzioni_lettura on public.correzioni for select to authenticated
  using (dipendente_id = public.mio_dipendente() or public.amministro(dipendente_id));
create policy correzioni_scrittura on public.correzioni for insert to authenticated
  with check (public.amministro(dipendente_id) and fatta_da = auth.uid());

create policy ferie_lettura on public.ferie for select to authenticated
  using (dipendente_id = public.mio_dipendente() or public.amministro(dipendente_id));
create policy ferie_scrittura on public.ferie for all to authenticated
  using (public.amministro(dipendente_id)) with check (public.amministro(dipendente_id));

revoke all on public.badge from authenticated;
grant select (id, dipendente_id, dispositivo, attivo, creato_il, disattivato_il) on public.badge to authenticated;
grant select on public.timbrature to authenticated;
grant select, insert on public.correzioni to authenticated;
grant select, insert, update on public.ferie to authenticated;
grant execute on function public.mio_qr(text) to authenticated;
