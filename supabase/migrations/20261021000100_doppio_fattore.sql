-- =====================================================================
-- Doppio fattore imposto dal database.
-- Per i ruoli più delicati (all'inizio direzione, amministrazione e
-- commerciale: soldi, tariffe, utenti) non basta la password: il token
-- deve avere il livello «aal2», cioè anche il codice dell'app di
-- autenticazione. Lo controlla il database, non solo le app: se un'app
-- avesse un difetto, i dati restano chiusi lo stesso.
--
-- · ha_ruolo() e staff_di() rispondono «no» a chi deve avere il codice e
--   non l'ha dato: così valgono anche le funzioni (RPC) e i documenti.
-- · Una regola «restrictive» su ogni tabella chiude il resto.
-- · Restano leggibili il proprio profilo e le impostazioni: servono
--   all'app per sapere se chiedere il codice.
-- · L'elenco dei ruoli è in impostazioni («ruoli_doppio_fattore»);
--   lo cambia solo la direzione, e solo dopo aver dato il codice.
-- =====================================================================

insert into public.impostazioni (chiave, valore, nota) values
  ('ruoli_doppio_fattore', '["direzione", "amministrazione", "commerciale"]',
   'Ruoli che devono dare anche il codice dell''app di autenticazione')
on conflict (chiave) do nothing;

-- vero se chi chiama ha il livello giusto: o il suo ruolo non chiede il codice, o il codice l'ha dato
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (
           select 1 from public.profili p, public.impostazioni i
           where p.id = auth.uid() and p.attivo
             and i.chiave = 'ruoli_doppio_fattore'
             and i.valore ? p.ruolo::text)
$$;

-- per l'app: il mio ruolo chiede il codice?
create or replace function public.serve_doppio_fattore() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profili p, public.impostazioni i
                 where p.id = auth.uid() and p.attivo
                   and i.chiave = 'ruoli_doppio_fattore' and i.valore ? p.ruolo::text)
$$;

create or replace function public.staff_di(p_azienda text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (select 1 from public.profili
                 where id = auth.uid() and attivo and ruolo <> 'cliente' and azienda = p_azienda)
$$;

create or replace function public.ha_ruolo(variadic p_ruoli public.ruolo[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (select 1 from public.profili
                 where id = auth.uid() and attivo
                   and (ruolo = any(p_ruoli) or ruolo = 'direzione'))
$$;

revoke execute on function public.mfa_ok(), public.serve_doppio_fattore() from public, anon;
grant execute on function public.mfa_ok(), public.serve_doppio_fattore() to authenticated;

-- regola «restrictive» su tutte le tabelle con RLS (si somma alle altre: non apre niente, chiude soltanto)
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname not in ('profili', 'impostazioni', 'aziende')
  loop
    execute format('drop policy if exists doppio_fattore on public.%I', t.relname);
    execute format('create policy doppio_fattore on public.%I as restrictive for all to authenticated
                      using (public.mfa_ok()) with check (public.mfa_ok())', t.relname);
  end loop;
end $$;
