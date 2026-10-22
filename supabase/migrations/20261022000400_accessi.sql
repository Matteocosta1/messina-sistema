-- =====================================================================
-- Accessi alle due società e permessi
--  · accessi: una persona può lavorare in tutte e due le società, con un ruolo per ciascuna
--    (Matteo, Pier, i genitori). Si lavora in una società alla volta: «cambia_azienda» sposta il profilo
--    nell'altra, così le due società non si mescolano mai in una stessa schermata.
--  · ruolo «commercialista»: legge i numeri (fatture, incassi, lotti, vendite) di tutte e due; niente telecamere,
--    satellitare, presenze o modifiche
--  · riepiloghi presenze: solo chi ha il permesso esplicito (Angela e la madre), per ogni società; non la direzione
--  · satellitare solo alla direzione dei Trasporti; allarmi presenze della propria società; mail solo dalla propria casella
--  · impostazioni non leggibili dai clienti; lo stage non si cancella (vale come certificato di cancellazione)
--  · Entrate: chi carica i PC della Corporation (stage) legge i lotti; lo stage legge le mail della cartella Stage
--  · traffico: vede le presenze di oggi degli autisti; Anomalie solo agli amministratori
-- =====================================================================

-- valori nuovi degli elenchi: 20261022000150_valori_nuovi.sql

create table if not exists public.accessi (
  profilo_id          uuid not null references public.profili(id) on delete cascade,
  azienda             text not null references public.aziende(id),
  ruolo               public.ruolo not null check (ruolo <> 'cliente'),
  riepiloghi_presenze boolean not null default false,
  primary key (profilo_id, azienda)
);
insert into public.accessi (profilo_id, azienda, ruolo, riepiloghi_presenze)
select id, azienda, ruolo, ruolo = 'amministrazione' from public.profili where ruolo <> 'cliente'
on conflict do nothing;
alter table public.accessi enable row level security;
create policy accessi_miei on public.accessi for select to authenticated
  using (profilo_id = auth.uid() or (public.staff_di(azienda) and public.mio_ruolo() = 'direzione'));
grant select on public.accessi to authenticated;
create policy doppio_fattore on public.accessi as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

-- ogni persona nuova (non cliente) ha l'accesso alla sua società; un cambio di ruolo fatto dalla direzione si riporta qui
create or replace function public.profili_accessi() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ruolo = 'cliente' or coalesce(current_setting('messina.cambio_azienda', true), '') = 'si' then return new; end if;
  insert into public.accessi (profilo_id, azienda, ruolo, riepiloghi_presenze)
  values (new.id, new.azienda, new.ruolo, new.ruolo = 'amministrazione')
  on conflict (profilo_id, azienda) do update set ruolo = excluded.ruolo;
  return new;
end $$;
drop trigger if exists profili_accessi on public.profili;
create trigger profili_accessi after insert or update of ruolo, azienda on public.profili
  for each row execute function public.profili_accessi();

-- le società in cui posso lavorare
create or replace function public.mie_aziende() returns table (azienda text, ruolo public.ruolo)
language sql stable security definer set search_path = public as $$
  select a.azienda, a.ruolo from public.accessi a join public.profili p on p.id = a.profilo_id
   where a.profilo_id = auth.uid() and p.attivo order by a.azienda
$$;

-- passare all'altra società: il profilo prende società e ruolo di quell'accesso
create or replace function public.cambia_azienda(p_azienda text) returns public.ruolo
language plpgsql security definer set search_path = public as $$
declare a public.accessi;
begin
  select * into a from public.accessi where profilo_id = auth.uid() and azienda = p_azienda;
  if a.profilo_id is null then raise exception 'Non hai accesso a questa società'; end if;
  perform set_config('messina.cambio_azienda', 'si', true);
  update public.profili set azienda = a.azienda, ruolo = a.ruolo where id = auth.uid() and attivo;
  perform set_config('messina.cambio_azienda', '', true);
  perform public.registra(a.azienda, 'Accesso', 'Entrato in ' || a.azienda || ' come ' || a.ruolo, null, 'Manuale', 'profili', auth.uid()::text);
  return a.ruolo;
end $$;

-- la direzione di una società dà o toglie l'accesso alla sua società (mai il ruolo di direzione: quello lo dà chi gestisce il sistema)
create or replace function public.imposta_accesso(p_profilo uuid, p_azienda text, p_ruolo public.ruolo, p_riepiloghi boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.staff_di(p_azienda) and public.mio_ruolo() = 'direzione') then raise exception 'Gli accessi di una società li dà la sua direzione'; end if;
  if p_ruolo in ('direzione', 'cliente') then raise exception 'Questo ruolo non si dà da qui'; end if;
  if p_ruolo is null then
    if exists (select 1 from public.profili where id = p_profilo and azienda = p_azienda) then raise exception 'È la società in cui lavora adesso: prima deve passare all''altra'; end if;
    delete from public.accessi where profilo_id = p_profilo and azienda = p_azienda;
  else
    insert into public.accessi (profilo_id, azienda, ruolo, riepiloghi_presenze) values (p_profilo, p_azienda, p_ruolo, coalesce(p_riepiloghi, false))
    on conflict (profilo_id, azienda) do update set ruolo = excluded.ruolo, riepiloghi_presenze = excluded.riepiloghi_presenze;
  end if;
  perform public.registra(p_azienda, 'Accesso', coalesce(p_ruolo::text, 'tolto') || coalesce(case when p_riepiloghi then ' · riepiloghi presenze' end, ''), null, 'Manuale', 'profili', p_profilo::text);
end $$;
revoke execute on function public.mie_aziende(), public.cambia_azienda(text), public.imposta_accesso(uuid, text, public.ruolo, boolean) from public, anon;
grant execute on function public.mie_aziende(), public.cambia_azienda(text), public.imposta_accesso(uuid, text, public.ruolo, boolean) to authenticated;

-- ------------------------------------------------------------------ Riepiloghi presenze: solo con il permesso
create or replace function public.vede_presenze(p_azienda text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.staff_di(p_azienda) and exists (select 1 from public.accessi a
    where a.profilo_id = auth.uid() and a.azienda = p_azienda and a.riepiloghi_presenze)
$$;
create or replace function public.amministro(p_dipendente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dipendenti d where d.id = p_dipendente and public.vede_presenze(d.azienda))
$$;
revoke execute on function public.vede_presenze(text) from public, anon;
grant execute on function public.vede_presenze(text) to authenticated;

-- il traffico vede chi degli autisti ha timbrato oggi (per sapere chi parte), niente di più
drop policy if exists timbrature_lettura on public.timbrature;
create policy timbrature_lettura on public.timbrature for select to authenticated
  using (dipendente_id = public.mio_dipendente() or public.amministro(dipendente_id)
         or (public.staff_di('trasporti') and public.ha_ruolo('traffico') and quando >= (public.oggi()::timestamp at time zone 'Europe/Rome')
             and exists (select 1 from public.dipendenti d where d.id = dipendente_id and d.azienda = 'trasporti' and d.mansione = 'Autista')));

-- allarmi delle presenze: solo quelli della propria società
drop policy if exists allarmi_lettura on public.allarmi_gestiti;
drop policy if exists allarmi_scrittura on public.allarmi_gestiti;
create policy allarmi_lettura on public.allarmi_gestiti for select to authenticated
  using (exists (select 1 from public.timbrature t where t.id = timbratura_id and public.amministro(t.dipendente_id)));
create policy allarmi_scrittura on public.allarmi_gestiti for insert to authenticated
  with check (da = auth.uid() and exists (select 1 from public.timbrature t where t.id = timbratura_id and public.amministro(t.dipendente_id)));

-- ------------------------------------------------------------------ Satellitare: solo la direzione dei Trasporti
create or replace function public.direzione_trasporti() returns boolean
language sql stable security definer set search_path = public as $$
  select public.staff_di('trasporti') and public.mio_ruolo() = 'direzione'
$$;
revoke execute on function public.direzione_trasporti() from public, anon;
grant execute on function public.direzione_trasporti() to authenticated;
drop policy if exists sat_posizioni_direzione on public.sat_posizioni;
drop policy if exists sat_giornate_direzione on public.sat_giornate;
drop policy if exists sat_anomalie_direzione on public.sat_anomalie;
create policy sat_posizioni_direzione on public.sat_posizioni for select to authenticated using (public.direzione_trasporti());
create policy sat_giornate_direzione on public.sat_giornate for select to authenticated using (public.direzione_trasporti());
create policy sat_anomalie_direzione on public.sat_anomalie for select to authenticated using (public.direzione_trasporti());

-- ------------------------------------------------------------------ Commercialista: legge i numeri, non cambia niente
drop policy if exists fatture_lettura on public.fatture;
create policy fatture_lettura on public.fatture for select to authenticated
  using ((public.staff_di(azienda) and public.ha_ruolo('amministrazione', 'commercialista'))
         or (cliente_id = public.mio_cliente() and stato in ('Inviata', 'Pagata')));
drop policy if exists lotti_lettura on public.lotti;
create policy lotti_lettura on public.lotti for select to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite', 'amministrazione', 'commercialista', 'stage'));
drop policy if exists vendite_lettura on public.vendite;
create policy vendite_lettura on public.vendite for select to authenticated
  using (public.staff_di('corporation') and public.ha_ruolo('vendite', 'amministrazione', 'commercialista'));
create or replace function public.valore_bolla(p_bolla uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(c.totale), 2), 0) from public.calcola_bolla(p_bolla) c
   where public.staff_di('trasporti') and public.ha_ruolo('commerciale', 'amministrazione', 'bolle', 'commercialista')
$$;

-- ------------------------------------------------------------------ Mail: lo stage legge la sua cartella
create policy mail_stage on public.mail for select to authenticated
  using (azienda = 'corporation' and cartella = 'Stage' and public.staff_di('corporation') and public.mio_ruolo() = 'stage');

-- ------------------------------------------------------------------ Impostazioni: solo il personale
drop policy if exists impostazioni_lettura on public.impostazioni;
create policy impostazioni_lettura on public.impostazioni for select to authenticated
  using (exists (select 1 from public.profili where id = auth.uid() and attivo and ruolo <> 'cliente'));

-- ------------------------------------------------------------------ Stage: le righe non si cancellano
revoke delete on public.stage_pc, public.stage_telefoni from authenticated;

-- ------------------------------------------------------------------ Anomalie: solo agli amministratori (e alla direzione)
create or replace function public.vede_anomalie() returns boolean
language sql stable security definer set search_path = public as $$ select public.ha_ruolo('amministrazione') $$;
revoke execute on function public.vede_anomalie() from public, anon;
grant execute on function public.vede_anomalie() to authenticated;
do $$
declare v text;
begin
  select pg_get_viewdef('public.anomalie'::regclass, true) into v;
  execute 'create or replace view public.anomalie with (security_invoker = true) as select * from (' || rtrim(v, '; ') || ') a where public.vede_anomalie()';
end $$;
