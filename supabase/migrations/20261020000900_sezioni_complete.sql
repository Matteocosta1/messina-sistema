-- =====================================================================
-- Tutto quello che serve alle sezioni complete del mockup approvato:
-- mail, schede cliente, autisti, presenze, ordini, stage, negozio,
-- archivi per foto e documenti, funzioni per traffico e giacenze.
-- =====================================================================

-- Mail (le scarica da Outlook la funzione «mail-outlook») --------------------
create table public.mail (
  id          uuid primary key default gen_random_uuid(),
  azienda     text not null references public.aziende(id),
  graph_id    text unique,                    -- id del messaggio su Microsoft 365
  casella     text not null,                  -- es. ordini@…
  cartella    text not null default 'In arrivo',
  etichetta   text,                           -- Ordine, Preventivo, Mezzi, Vendite, Lotti, Stage
  da_nome     text,
  da_indirizzo text,
  oggetto     text,
  testo       text,
  anteprima   text,
  allegati    jsonb not null default '[]',    -- [{nome, percorso}]
  ricevuta_il timestamptz not null default now(),
  bozza       text,                           -- risposta preparata dall'agente, da controllare
  assegnata_a uuid references public.profili(id),
  bolla_id    uuid references public.bolle(id),
  stato       text not null default 'Da leggere' check (stato in ('Da leggere', 'Letta', 'Risposta', 'Archiviata'))
);
create index mail_azienda on public.mail (azienda, ricevuta_il desc);

-- posta in uscita: la manda la funzione «mail-outlook», mai il browser
create table public.mail_uscita (
  id          uuid primary key default gen_random_uuid(),
  azienda     text not null references public.aziende(id),
  risposta_a  uuid references public.mail(id),
  a           text not null,
  oggetto     text not null,
  testo       text not null,
  creata_da   uuid default auth.uid() references public.profili(id),
  creata_il   timestamptz not null default now(),
  inviata_il  timestamptz,
  errore      text
);

alter table public.mail enable row level security;
alter table public.mail_uscita enable row level security;
create policy mail_lettura on public.mail for select to authenticated
  using (public.staff_di(azienda) and public.ha_ruolo('bolle', 'commerciale', 'vendite', 'amministrazione', 'traffico'));
create policy mail_modifica on public.mail for update to authenticated
  using (public.staff_di(azienda) and public.ha_ruolo('bolle', 'commerciale', 'vendite', 'amministrazione'))
  with check (public.staff_di(azienda));
create policy mail_uscita_lettura on public.mail_uscita for select to authenticated using (public.staff_di(azienda));
create policy mail_uscita_nuova on public.mail_uscita for insert to authenticated
  with check (public.staff_di(azienda) and creata_da = auth.uid() and inviata_il is null);
grant select, update on public.mail to authenticated;
grant select, insert on public.mail_uscita to authenticated;

-- Schede cliente complete -----------------------------------------------------
alter table public.clienti
  add column cosa_spedisce text,
  add column referente_interno text,
  add column contratto_dal date,
  add column contratto_al date,
  add column fatturazione text,               -- Mensile, A spedizione
  add column esigenze text,                   -- cosa chiede il cliente
  add column eccezioni text;                  -- sconti, minimi, accordi: li scrive la direzione
alter table public.tariffe
  add column zona text,
  add column quando text;                     -- quando scatta la voce

-- Autisti e orari dei dipendenti ------------------------------------------------
alter table public.dipendenti
  add column reparto text,
  add column ore_settimana numeric(4, 1),
  add column inizio time,                     -- orario previsto, per ritardi e uscite anticipate
  add column fine time,
  add column patente_scadenza date,
  add column cqc_scadenza date,
  add column telefono_app text;

-- Allarmi presenze gestiti (le timbrature non si toccano: si annota a parte)
create table public.allarmi_gestiti (
  timbratura_id bigint primary key references public.timbrature(id),
  nota          text,
  da            uuid not null default auth.uid() references public.profili(id),
  il            timestamptz not null default now()
);
alter table public.allarmi_gestiti enable row level security;
create policy allarmi_lettura on public.allarmi_gestiti for select to authenticated using (public.ha_ruolo('amministrazione'));
create policy allarmi_scrittura on public.allarmi_gestiti for insert to authenticated
  with check (public.ha_ruolo('amministrazione') and da = auth.uid());
grant select, insert on public.allarmi_gestiti to authenticated;

-- Presenze di oggi e conteggi del mese (viste con i permessi di chi guarda)
create or replace view public.presenze_oggi with (security_invoker = true) as
select d.id as dipendente_id, d.nome, d.reparto, d.ore_settimana, d.inizio,
       min(t.quando) filter (where t.verso = 'Entrata') as entrata,
       max(t.quando) filter (where t.verso = 'Uscita') as uscita,
       case when min(t.quando) filter (where t.verso = 'Entrata') is null then 'Assente'
            when d.inizio is not null and (min(t.quando) filter (where t.verso = 'Entrata'))::time > d.inizio + interval '5 minutes'
              then 'Ritardo · ' || extract(epoch from ((min(t.quando) filter (where t.verso = 'Entrata'))::time - d.inizio))::int / 60 || ' min'
            else 'Presente' end as stato
from public.dipendenti d
left join public.timbrature t on t.dipendente_id = d.id and t.esito = 'Valida' and t.quando::date = current_date
where d.attivo
group by d.id;

create or replace view public.presenze_mese with (security_invoker = true) as
with base as (
  select t.dipendente_id, t.quando::date as g,
         min(t.quando) filter (where t.verso = 'Entrata') as e,
         max(t.quando) filter (where t.verso = 'Uscita') as u0
  from public.timbrature t
  where t.esito = 'Valida' and date_trunc('month', t.quando) = date_trunc('month', now())
  group by 1, 2
), giorni as (
  select b.dipendente_id, b.g, b.e,
         coalesce(b.u0, (select (k.giorno + k.ora) from public.correzioni k where k.dipendente_id = b.dipendente_id
                    and k.giorno = b.g and k.verso = 'Uscita' order by k.fatta_il desc limit 1)) as u
  from base b
)
select d.id as dipendente_id, d.nome, d.contratto, d.ore_settimana,
       round(sum(extract(epoch from (u - e)) / 3600) filter (where u is not null), 1) as ore,
       count(*) filter (where d.inizio is not null and e::time > d.inizio + interval '5 minutes') as ritardi,
       coalesce(sum(greatest(0, extract(epoch from (e::time - d.inizio)) / 60)) filter (where d.inizio is not null and e::time > d.inizio), 0)::int as minuti_ritardo,
       count(*) filter (where d.fine is not null and u::time < d.fine - interval '5 minutes') as uscite_anticipate,
       coalesce(sum(greatest(0, extract(epoch from (d.fine - u::time)) / 60)) filter (where d.fine is not null and u::time < d.fine), 0)::int as minuti_in_meno,
       count(*) filter (where u is null and g < current_date) as uscite_mancanti
from public.dipendenti d left join giorni on giorni.dipendente_id = d.id
where d.attivo group by d.id;
grant select on public.presenze_oggi, public.presenze_mese to authenticated;

-- correggere un'uscita mancante (l'amministrazione)
create or replace function public.correggi_uscita(p_dipendente uuid, p_giorno date, p_ora time, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.amministro(p_dipendente) then raise exception 'Non autorizzato'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Scrivi il motivo della correzione'; end if;
  insert into public.correzioni (dipendente_id, giorno, verso, ora, motivo) values (p_dipendente, p_giorno, 'Uscita', p_ora, p_motivo);
end $$;

-- il telefono del dipendente si registra una volta; per cambiarlo serve l'amministrazione
create or replace function public.registra_telefono(p_dispositivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_dip uuid := public.mio_dipendente();
begin
  if v_dip is null then raise exception 'Non sei tra i dipendenti'; end if;
  if exists (select 1 from public.badge where dipendente_id = v_dip and attivo) then
    if exists (select 1 from public.badge where dipendente_id = v_dip and attivo and dispositivo = p_dispositivo) then return; end if;
    raise exception 'Hai già un telefono registrato: per cambiarlo chiedi all''amministrazione';
  end if;
  insert into public.badge (dipendente_id, dispositivo) values (v_dip, p_dispositivo);
end $$;

-- Traffico: proposta dei giri del giorno dopo -----------------------------------
-- Prima versione semplice: raggruppa per città le bolle confermate non ancora in un giro
-- e le assegna ai mezzi attivi con autista, a giro. L'ottimizzatore per camion (HERE)
-- sostituirà questa funzione senza cambiare il gestionale.
create or replace function public.proponi_giri(p_data date) returns integer
language plpgsql security definer set search_path = public as $$
declare v_mezzi uuid[]; v_n int := 0; r record; v_i int := 0; v_giro uuid; v_ord int;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('traffico')) then raise exception 'Solo il traffico propone i giri'; end if;
  select array_agg(id order by tipo, targa) into v_mezzi from public.mezzi where stato = 'Attivo' and autista_id is not null;
  if v_mezzi is null then raise exception 'Nessun mezzo attivo con autista'; end if;
  for r in select b.id, b.citta from public.bolle b
            where b.stato = 'Confermata' and b.data_consegna = p_data
              and not exists (select 1 from public.fermate f where f.bolla_id = b.id and f.esito = 'Da fare')
            order by b.citta nulls last, b.fascia nulls last loop
    v_giro := null;
    select g.id into v_giro from public.giri g join public.fermate f on f.giro_id = g.id join public.bolle b2 on b2.id = f.bolla_id
     where g.data = p_data and b2.citta is not distinct from r.citta limit 1;
    if v_giro is null then
      insert into public.giri (data, mezzo_id, autista_id, zona, creato_da)
      select p_data, m.id, m.autista_id, r.citta, auth.uid() from public.mezzi m
       where m.id = v_mezzi[(v_i % array_length(v_mezzi, 1)) + 1]
      on conflict (data, mezzo_id) do update set zona = public.giri.zona
      returning id into v_giro;
      v_i := v_i + 1;
    end if;
    select coalesce(max(ordine), 0) + 1 into v_ord from public.fermate where giro_id = v_giro;
    insert into public.fermate (giro_id, bolla_id, ordine) values (v_giro, r.id, v_ord);
    v_n := v_n + 1;
  end loop;
  perform public.registra('trasporti', 'Giri', v_n || ' spedizioni assegnate per il ' || to_char(p_data, 'DD/MM'), null, 'Sistema');
  return v_n;
end $$;

-- Giacenze: prenotare la riconsegna rimette la bolla in giro alla data scelta ----
create or replace function public.prenota_riconsegna(p_giacenza uuid, p_data date) returns void
language plpgsql security definer set search_path = public as $$
declare g public.giacenze;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico')) then raise exception 'Non autorizzato'; end if;
  select * into g from public.giacenze where id = p_giacenza and chiusa_il is null for update;
  if g.id is null then raise exception 'Giacenza non trovata o già chiusa'; end if;
  if p_data < current_date then raise exception 'La data è passata'; end if;
  update public.giacenze set riconsegna_il = p_data, chiusa_il = now() where id = g.id;
  update public.bolle set stato = 'Confermata', data_consegna = p_data where id = g.bolla_id;
  perform public.registra('trasporti', 'Riconsegna', 'Prenotata per il ' || to_char(p_data, 'DD/MM'), null, 'Sistema', 'giacenze', g.id::text);
end $$;

create or replace view public.giacenze_aperte with (security_invoker = true) as
select g.id, g.bolla_id, b.numero, c.nome as cliente, b.destinatario, b.indirizzo, b.citta, g.motivo, g.dal,
       (current_date - g.dal) as giorni, g.riconsegna_il
from public.giacenze g join public.bolle b on b.id = g.bolla_id join public.clienti c on c.id = b.cliente_id
where g.chiusa_il is null;
grant select on public.giacenze_aperte to authenticated;

-- Telepass: chi guidava (dal giro del giorno) e passaggi da controllare --------------
create or replace view public.telepass_passaggi with (security_invoker = true) as
select t.id, t.quando, t.entrata, t.uscita, t.importo, m.targa, m.tipo,
       coalesce(d.nome, d2.nome) as autista,
       case when g.id is null then 'Giorno senza giro'
            when t.quando::time not between time '05:00' and time '21:00' then 'Fuori orario' end as controllo
from public.telepass t join public.mezzi m on m.id = t.mezzo_id
left join public.giri g on g.mezzo_id = t.mezzo_id and g.data = t.quando::date
left join public.dipendenti d on d.id = g.autista_id
left join public.dipendenti d2 on d2.id = m.autista_id;
grant select on public.telepass_passaggi to authenticated;

-- Corporation: stage computer con le postazioni del banco -----------------------------
alter table public.stage_pc add column errore text;
create or replace view public.stage_oggi with (security_invoker = true) as
select count(*) filter (where iniziato_il::date = current_date) as ricevuti,
       count(*) filter (where esito = 'Formattato' and finito_il::date = current_date) as formattati,
       count(*) filter (where esito = 'In corso') as in_corso,
       count(*) filter (where esito = 'Fallito' and coalesce(finito_il, iniziato_il)::date = current_date) as falliti,
       count(*) filter (where esito = 'In vendita' and finito_il::date = current_date) as in_vendita,
       count(*) filter (where date_trunc('month', iniziato_il) = date_trunc('month', now())) as ricevuti_mese,
       count(*) filter (where esito = 'Formattato' and date_trunc('month', finito_il) = date_trunc('month', now())) as formattati_mese,
       count(*) filter (where esito = 'Fallito' and date_trunc('month', coalesce(finito_il, iniziato_il)) = date_trunc('month', now())) as falliti_mese,
       count(*) filter (where esito = 'In vendita' and date_trunc('month', finito_il) = date_trunc('month', now())) as in_vendita_mese
from public.stage_pc;
grant select on public.stage_oggi to authenticated;

-- ordini: il device venduto e il suo posto
alter table public.ordini add column device_id uuid references public.device(id), add column stripe_session text unique,
  add column email text, add column totale numeric(10, 2), add column etichetta text;

-- Negozio online: catalogo pubblico, senza costi né seriali -------------------------
create or replace function public.catalogo() returns table (
  modello text, marca text, cpu text, ram text, disco text, schermo text, gpu text,
  grado text, prezzo numeric, disponibili bigint
) language sql stable security definer set search_path = public as $$
  select d.modello, d.marca, d.cpu, d.ram, d.disco, d.schermo, d.gpu, d.grado, min(d.prezzo), count(*)
  from public.device d
  where d.stato = 'Disponibile' and 'Sito' = any(d.siti) and d.prezzo is not null and d.prezzo_confermato_da is not null
  group by d.modello, d.marca, d.cpu, d.ram, d.disco, d.schermo, d.gpu, d.grado
  order by d.marca, d.modello, d.grado
$$;
revoke all on function public.catalogo() from public;
grant execute on function public.catalogo() to anon, authenticated;

-- Archivi (Supabase Storage): solo su Supabase, privati -------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values
      ('bolle', 'bolle', false), ('documenti', 'documenti', false), ('device', 'device', false)
    on conflict (id) do nothing;

    -- foto delle bolle: l'autista carica solo nella cartella della sua fermata;
    -- le vede chi vede la bolla
    execute $p$create policy bolle_carica on storage.objects for insert to authenticated
      with check (bucket_id = 'bolle' and public.mio_giro((select giro_id from public.fermate where id::text = (storage.foldername(name))[1])))$p$;
    execute $p$create policy bolle_leggi on storage.objects for select to authenticated
      using (bucket_id = 'bolle' and public.bolla_visibile((select bolla_id from public.fermate where id::text = (storage.foldername(name))[1])))$p$;
    -- documenti (fatture, DDT dei lotti): solo staff dell'amministrazione e vendite
    execute $p$create policy documenti_staff on storage.objects for all to authenticated
      using (bucket_id = 'documenti' and public.ha_ruolo('amministrazione', 'vendite'))
      with check (bucket_id = 'documenti' and public.ha_ruolo('amministrazione', 'vendite'))$p$;
    -- foto dei device per gli annunci
    execute $p$create policy device_staff on storage.objects for all to authenticated
      using (bucket_id = 'device' and public.staff_di('corporation'))
      with check (bucket_id = 'device' and public.staff_di('corporation'))$p$;
  end if;
end $$;

-- permessi delle funzioni nuove
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo() to anon;
revoke execute on function public.codice_badge(uuid, bigint) from authenticated;
revoke execute on function public.timbra(text, text) from authenticated;
revoke execute on function public.registra(text, text, text, text, text, text, text, jsonb) from authenticated;
grant execute on function public.timbra(text, text) to service_role;
