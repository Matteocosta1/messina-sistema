-- =====================================================================
-- Modifiche decise il 20 ottobre sera (recap vocale con Matteo):
--  · Traffico: i giri proposti si confermano («Conferma i giri»)
--  · Giacenze: riconsegna con giorno e ora; «Chiedi al cliente» resta
--    segnato dopo un clic; «Reso al mittente» con la sua funzione
--  · Mezzi: codice del satellitare di bordo (l'autista fisso c'è già: mezzi.autista_id)
--  · Magazzino: un collo si appoggia su un bancale («Collo» → bancale)
--  · Satellitare: posizioni, giornate e anomalie (solo direzione)
--  · Telecamere: telecamere, avvisi e foto delle scansioni (solo direzione)
-- =====================================================================

-- la direzione, di qualsiasi delle due società, con il doppio fattore dato
create or replace function public.e_direzione() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (select 1 from public.profili where id = auth.uid() and attivo and ruolo = 'direzione')
$$;
revoke execute on function public.e_direzione() from public, anon;
grant execute on function public.e_direzione() to authenticated;

-- ------------------------------------------------------------------ Traffico
alter table public.giri add column confermato_il timestamptz, add column confermato_da uuid references public.profili(id);

create or replace function public.conferma_giri(p_data date) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('traffico')) then raise exception 'Non autorizzato'; end if;
  update public.giri set confermato_il = now(), confermato_da = auth.uid()
   where data = p_data and confermato_il is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nessun giro da confermare per il %', to_char(p_data, 'DD/MM'); end if;
  perform public.registra('trasporti', 'Giri', n || ' giri confermati per il ' || to_char(p_data, 'DD/MM'), null, 'Sistema', 'giri', p_data::text);
  return n;
end $$;
revoke execute on function public.conferma_giri(date) from public, anon;
grant execute on function public.conferma_giri(date) to authenticated;

-- ------------------------------------------------------------------ Giacenze
alter table public.giacenze
  add column riconsegna_ora time,
  add column chiesta_il timestamptz,       -- mail al cliente partita: il tasto non si ripete
  add column reso_il timestamptz;           -- chiusa come reso al mittente

drop function public.prenota_riconsegna(uuid, date);
create function public.prenota_riconsegna(p_giacenza uuid, p_data date, p_ora time default null) returns void
language plpgsql security definer set search_path = public as $$
declare g public.giacenze;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico')) then raise exception 'Non autorizzato'; end if;
  select * into g from public.giacenze where id = p_giacenza and chiusa_il is null for update;
  if g.id is null then raise exception 'Giacenza non trovata o già chiusa'; end if;
  if p_data < current_date then raise exception 'La data è passata'; end if;
  update public.giacenze set riconsegna_il = p_data, riconsegna_ora = p_ora, chiusa_il = now() where id = g.id;
  update public.bolle set stato = 'Confermata', data_consegna = p_data,
         fascia = case when p_ora is null then fascia else 'Alle ' || to_char(p_ora, 'HH24:MI') end
   where id = g.bolla_id;
  update public.richieste_riconsegna set gestita_il = now() where giacenza_id = g.id and gestita_il is null;
  perform public.registra('trasporti', 'Riconsegna', 'Prenotata per il ' || to_char(p_data, 'DD/MM') || coalesce(' alle ' || to_char(p_ora, 'HH24:MI'), ''),
                          null, 'Sistema', 'giacenze', g.id::text);
end $$;
revoke execute on function public.prenota_riconsegna(uuid, date, time) from public, anon;
grant execute on function public.prenota_riconsegna(uuid, date, time) to authenticated;

-- la mail al cliente è partita: resta segnato, il tasto non si ripete
create or replace function public.chiesta_al_cliente(p_giacenza uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v timestamptz;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico')) then raise exception 'Non autorizzato'; end if;
  update public.giacenze set chiesta_il = coalesce(chiesta_il, now()) where id = p_giacenza and chiusa_il is null returning chiesta_il into v;
  if v is null then raise exception 'Giacenza non trovata o già chiusa'; end if;
  return v;
end $$;
revoke execute on function public.chiesta_al_cliente(uuid) from public, anon;
grant execute on function public.chiesta_al_cliente(uuid) to authenticated;

-- reso al mittente: la merce torna a chi l'ha spedita e la giacenza si chiude
create or replace function public.reso_al_mittente(p_giacenza uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g public.giacenze;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico')) then raise exception 'Non autorizzato'; end if;
  select * into g from public.giacenze where id = p_giacenza and chiusa_il is null for update;
  if g.id is null then raise exception 'Giacenza non trovata o già chiusa'; end if;
  update public.giacenze set reso_il = now(), chiusa_il = now() where id = g.id;
  update public.richieste_riconsegna set gestita_il = now() where giacenza_id = g.id and gestita_il is null;
  perform public.registra('trasporti', 'Reso', 'Reso al mittente', null, 'Sistema', 'giacenze', g.id::text);
end $$;
revoke execute on function public.reso_al_mittente(uuid) from public, anon;
grant execute on function public.reso_al_mittente(uuid) to authenticated;

create or replace view public.giacenze_aperte with (security_invoker = true) as
select g.id, g.bolla_id, b.numero, c.nome as cliente, b.destinatario, b.indirizzo, b.citta, g.motivo, g.dal,
       (current_date - g.dal) as giorni, g.riconsegna_il, g.chiesta_il
from public.giacenze g join public.bolle b on b.id = g.bolla_id join public.clienti c on c.id = b.cliente_id
where g.chiusa_il is null;

-- ------------------------------------------------------------------ Mezzi
alter table public.mezzi add column satellitare text;   -- codice del mezzo presso il fornitore del satellitare

-- ------------------------------------------------------------------ Magazzino: collo sul bancale
-- un collo messo in un posto non sta più su un bancale
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
  update public.colli set posto_id = v_posto, bancale_id = null, letto_entrata = coalesce(letto_entrata, now()) where id = k.id;
  perform public.registra('trasporti', case when v_da is null then 'Entrata' else 'Trasferimento' end, 'Collo ' || p_codice,
                          coalesce(v_da || ' → ', 'Ricevimento → ') || p_posto, 'Pistola', 'colli', k.id::text);
  select count(*), count(*) filter (where posto_id is not null and letto_entrata is not null) into tot, n
    from public.colli where bolla_id = k.bolla_id;
  return jsonb_build_object('bolla', k.bolla_id, 'messi', n, 'totale', tot, 'posto', p_posto, 'da', v_da);
end $$;

-- Entrata o Trasferisci con «Collo»: la scatola va sul bancale scansionato (stesso cliente)
create or replace function public.collo_su_bancale(p_codice text, p_bancale text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k public.colli; b public.bancali; v_cli uuid; v_da text; v_posto text; tot int; n int;
begin
  if not (public.staff_di('trasporti') and public.ha_ruolo('magazzino')) then raise exception 'Non autorizzato'; end if;
  select * into k from public.colli where codice = p_codice for update;
  if k.id is null then raise exception 'Codice sconosciuto: %', p_codice; end if;
  select * into b from public.bancali where codice = p_bancale and uscito_il is null;
  if b.id is null then raise exception 'Bancale % non trovato: scansiona l''etichetta del bancale', p_bancale; end if;
  select cliente_id into v_cli from public.bolle where id = k.bolla_id;
  if v_cli is distinct from b.cliente_id then raise exception 'Il bancale % è di un altro cliente', p_bancale; end if;
  if (b.posto_id is not null and public.posto_bloccato(b.posto_id)) or (k.posto_id is not null and public.posto_bloccato(k.posto_id)) then
    raise exception 'Posto bloccato da una missione: prima lo sblocca l''ufficio';
  end if;
  select coalesce((select 'bancale ' || x.codice from public.bancali x where x.id = k.bancale_id), (select codice from public.posti where id = k.posto_id)) into v_da;
  select codice into v_posto from public.posti where id = b.posto_id;
  update public.colli set bancale_id = b.id, posto_id = b.posto_id, letto_entrata = coalesce(letto_entrata, now()) where id = k.id;
  perform public.registra('trasporti', case when v_da is null then 'Entrata' else 'Trasferimento' end, 'Collo ' || p_codice,
                          coalesce(v_da || ' → ', 'Ricevimento → ') || 'bancale ' || p_bancale, 'Pistola', 'colli', k.id::text);
  select count(*), count(*) filter (where posto_id is not null and letto_entrata is not null) into tot, n
    from public.colli where bolla_id = k.bolla_id;
  return jsonb_build_object('bolla', k.bolla_id, 'messi', n, 'totale', tot, 'bancale', p_bancale, 'posto', v_posto, 'da', v_da);
end $$;
revoke execute on function public.collo_su_bancale(text, text) from public, anon;
grant execute on function public.collo_su_bancale(text, text) to authenticated;

-- quando il bancale cambia posto, i colli sopra lo seguono
create or replace function public.colli_seguono_bancale() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.colli set posto_id = new.posto_id where bancale_id = new.id;
  return new;
end $$;
create trigger bancali_colli after update of posto_id on public.bancali
  for each row when (new.posto_id is distinct from old.posto_id) execute function public.colli_seguono_bancale();

-- ------------------------------------------------------------------ Satellitare (solo direzione)
-- Le posizioni arrivano dal fornitore del satellitare già montato sui mezzi (funzione satellitare-import).
create table public.sat_posizioni (
  id        bigint generated always as identity primary key,
  mezzo_id  uuid not null references public.mezzi(id),
  quando    timestamptz not null,
  lat       float8 not null,
  lng       float8 not null,
  velocita  numeric,       -- km/h
  motore    boolean,       -- acceso
  unique (mezzo_id, quando)
);
create index sat_posizioni_mezzo on public.sat_posizioni (mezzo_id, quando desc);

-- una riga per mezzo e giorno: km previsti dal giro, km fatti, percorso semplificato per la mappa
create table public.sat_giornate (
  data        date not null,
  mezzo_id    uuid not null references public.mezzi(id),
  autista_id  uuid references public.dipendenti(id),
  giro_id     uuid references public.giri(id),
  km_previsti numeric,
  km_fatti    numeric,
  litri       numeric,       -- dalle carte carburante, quando collegate
  percorso    jsonb not null default '[]',   -- [[lat, lng], …] fatto
  previsto    jsonb not null default '[]',   -- [[lat, lng], …] fermate del giro
  aggiornata_il timestamptz not null default now(),
  primary key (data, mezzo_id)
);

create table public.sat_anomalie (
  id         uuid primary key default gen_random_uuid(),
  chiave     text not null unique,            -- mezzo|tipo|inizio: la stessa anomalia non si ripete
  data       date not null,
  mezzo_id   uuid not null references public.mezzi(id),
  autista_id uuid references public.dipendenti(id),
  tipo       text not null check (tipo in ('Deviazione', 'Sosta', 'Rifornimento', 'Motore acceso', 'Telepass', 'Strada parallela')),
  dalle      timestamptz,
  alle       timestamptz,
  luogo      text,
  lat        float8,
  lng        float8,
  dettaglio  text not null,
  grave      boolean not null default true,   -- false = segnalata ma non è un problema (es. strada parallela)
  vista_il   timestamptz,
  vista_da   uuid references public.profili(id)
);
create index sat_anomalie_data on public.sat_anomalie (data desc);

alter table public.sat_posizioni enable row level security;
alter table public.sat_giornate enable row level security;
alter table public.sat_anomalie enable row level security;
create policy sat_posizioni_direzione on public.sat_posizioni for select to authenticated using (public.e_direzione());
create policy sat_giornate_direzione on public.sat_giornate for select to authenticated using (public.e_direzione());
create policy sat_anomalie_direzione on public.sat_anomalie for select to authenticated using (public.e_direzione());
grant select on public.sat_posizioni, public.sat_giornate, public.sat_anomalie to authenticated;
-- scrive solo la funzione di importazione (service_role)

create or replace function public.anomalia_vista(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.e_direzione() then raise exception 'Solo la direzione'; end if;
  update public.sat_anomalie set vista_il = now(), vista_da = auth.uid() where id = p_id and vista_il is null;
  if not found then raise exception 'Anomalia non trovata o già vista'; end if;
end $$;
revoke execute on function public.anomalia_vista(uuid) from public, anon;
grant execute on function public.anomalia_vista(uuid) to authenticated;

-- ------------------------------------------------------------------ Telecamere (solo direzione)
-- I video restano sul registratore in capannone; qui solo l'elenco, gli avvisi e le foto.
create table public.telecamere (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null unique,
  zona           text,                  -- es. Baie di carico, Corsia S03: serve a scegliere la telecamera della scansione
  attiva         boolean not null default true,
  ultima_foto    text,                  -- percorso nello storage «telecamere»
  ultimo_contatto timestamptz
);

create table public.cam_avvisi (
  id            uuid primary key default gen_random_uuid(),
  telecamera_id uuid references public.telecamere(id),
  quando        timestamptz not null default now(),
  tipo          text not null,          -- Persona, Mezzo, Movimento, Apertura…
  descrizione   text not null,
  foto          text,
  grave         boolean not null default true,
  visto_il      timestamptz,
  visto_da      uuid references public.profili(id)
);
create index cam_avvisi_quando on public.cam_avvisi (quando desc);

-- la foto scattata a ogni scansione del magazzino, collegata al movimento dello storico
create table public.cam_foto (
  id            uuid primary key default gen_random_uuid(),
  storico_id    bigint not null unique references public.storico(id) on delete cascade,
  telecamera_id uuid references public.telecamere(id),
  quando        timestamptz not null default now(),
  foto          text not null
);

-- coda per il computer in capannone: a ogni scansione chiede una foto
create table public.cam_richieste (
  storico_id bigint primary key references public.storico(id) on delete cascade,
  quando     timestamptz not null default now(),
  dove       text,
  fatta_il   timestamptz
);
create or replace function public.chiedi_foto_scansione() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.come = 'Pistola' then
    insert into public.cam_richieste (storico_id, quando, dove) values (new.id, new.quando, new.dove) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger storico_foto after insert on public.storico for each row execute function public.chiedi_foto_scansione();

alter table public.telecamere enable row level security;
alter table public.cam_avvisi enable row level security;
alter table public.cam_foto enable row level security;
alter table public.cam_richieste enable row level security;     -- nessuna regola: solo service_role
create policy telecamere_direzione on public.telecamere for select to authenticated using (public.e_direzione());
create policy cam_avvisi_direzione on public.cam_avvisi for select to authenticated using (public.e_direzione());
create policy cam_foto_direzione on public.cam_foto for select to authenticated using (public.e_direzione());
grant select on public.telecamere, public.cam_avvisi, public.cam_foto to authenticated;

create or replace function public.avviso_visto(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.e_direzione() then raise exception 'Solo la direzione'; end if;
  update public.cam_avvisi set visto_il = now(), visto_da = auth.uid() where id = p_id and visto_il is null;
  if not found then raise exception 'Avviso non trovato o già visto'; end if;
end $$;
revoke execute on function public.avviso_visto(uuid) from public, anon;
grant execute on function public.avviso_visto(uuid) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('telecamere', 'telecamere', false) on conflict (id) do nothing;
    execute $p$create policy telecamere_leggi on storage.objects for select to authenticated
      using (bucket_id = 'telecamere' and public.e_direzione())$p$;
    -- caricano solo le funzioni (service_role): nessuna regola di scrittura per gli utenti
  end if;
end $$;

-- regola «restrictive» del doppio fattore anche sulle tabelle nuove (vedi 20261021000100)
do $$
declare t text;
begin
  foreach t in array array['sat_posizioni', 'sat_giornate', 'sat_anomalie', 'telecamere', 'cam_avvisi', 'cam_foto', 'cam_richieste'] loop
    execute format('create policy doppio_fattore on public.%I as restrictive for all to authenticated
                      using (public.mfa_ok()) with check (public.mfa_ok())', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ Anomalie: anche il satellitare
create or replace view public.anomalie with (security_invoker = true) as
  select 'Magazzino'::text as sezione, cc.cliente || ' · ' || lower(cc.tipo) || ' ' || cc.letti || ' di ' || cc.attesi || ' colli' as cosa,
         'Magazzino'::text as chi, cc.ultima_lettura as da, 'magazzino/controllo'::text as dove, cc.bolla_id::text as rif
    from public.controllo_colli cc where cc.letti > 0 and cc.letti <> cc.attesi
  union all
  select 'Missioni', p.codice || ' bloccato: ' || (jsonb_array_length(mp.mancanti) + jsonb_array_length(mp.extra)) || ' pezzi non tornano',
         'Ufficio', mp.aggiornato_il, 'magazzino/missioni', mp.id::text
    from public.missioni_posti mp join public.posti p on p.id = mp.posto_id where mp.stato = 'Bloccato'
  union all
  select 'Bolle', c.nome || ' · manca ' || lower(array_to_string(b.dati_mancanti, ', ')),
         coalesce(pr.nome, 'Ufficio bolle'), b.creata_il, 'bolle', b.id::text
    from public.bolle b join public.clienti c on c.id = b.cliente_id left join public.profili pr on pr.id = b.operatore_id
   where b.stato = 'Nuova' and cardinality(b.dati_mancanti) > 0
  union all
  select 'Presenze', coalesce(d.nome, 'Badge sconosciuto') || ' · ' || t.motivo, 'Direzione', t.quando, 'presenze/allarmi', t.id::text
    from public.timbrature t left join public.dipendenti d on d.id = t.dipendente_id
   where t.esito = 'Rifiutata' and t.quando > now() - interval '7 days'
     and not exists (select 1 from public.allarmi_gestiti a where a.timbratura_id = t.id)
  union all
  select 'Presenze', d.nome || ' · uscita non timbrata il ' || to_char(e.quando, 'DD/MM'), 'Amministrazione', e.quando, 'presenze/correzioni', e.id::text
    from public.timbrature e join public.dipendenti d on d.id = e.dipendente_id
   where e.esito = 'Valida' and e.verso = 'Entrata' and e.quando::date < current_date and e.quando > now() - interval '31 days'
     and not exists (select 1 from public.timbrature u where u.dipendente_id = e.dipendente_id and u.esito = 'Valida'
                     and u.verso = 'Uscita' and u.quando::date = e.quando::date and u.quando > e.quando)
     and not exists (select 1 from public.correzioni k where k.dipendente_id = e.dipendente_id
                     and k.giorno = e.quando::date and k.verso = 'Uscita')
  union all
  select 'Fatturazione', c.nome || ' · fattura da controllare: ' || coalesce(f.problema, ''), 'Amministrazione', f.creata_il, 'fatture', f.id::text
    from public.fatture f join public.clienti c on c.id = f.cliente_id where f.stato = 'Da controllare'
  union all
  select 'Telepass', coalesce(tp.autista, tp.targa) || ' · ' || coalesce(tp.entrata, '?') || ' → ' || coalesce(tp.uscita, '?') || ' · ' || lower(tp.controllo),
         'Direzione', tp.quando, 'telepass', tp.id::text
    from public.telepass_passaggi tp
   where tp.controllo is not null and tp.quando > now() - interval '31 days'
     and not exists (select 1 from public.telepass_controllati k where k.telepass_id = tp.id)
  union all
  select 'Satellitare', coalesce(d.nome, m.targa) || ': ' || lower(a.tipo) || ' · ' || a.dettaglio,
         'Direzione', coalesce(a.dalle, a.data::timestamptz), 'satellitare', a.id::text
    from public.sat_anomalie a join public.mezzi m on m.id = a.mezzo_id left join public.dipendenti d on d.id = a.autista_id
   where a.grave and a.vista_il is null and a.data > current_date - 31;

-- ------------------------------------------------------------------ Pianificazione del satellitare
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('messina-satellitare', '*/15 * * * *', $c$select public.chiama_funzione('satellitare-import')$c$);
  end if;
end $$;
