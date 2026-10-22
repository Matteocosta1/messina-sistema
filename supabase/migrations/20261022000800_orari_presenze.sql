-- =====================================================================
-- Ora italiana ovunque, telefoni del badge approvati, ferie che maturano, controlli a distanza e conservazione dei dati
--  · il database lavora in UTC: giorni e ore delle presenze, del Telepass, dello stage, delle anomalie e delle giacenze
--    ora si contano in ora di Roma (prima, tra mezzanotte e le 2, una timbratura finiva nel giorno prima)
--  · un telefono nuovo per il badge (il primo o un cambio) parte «in attesa» e lo approva l'amministrazione
--  · ferie e permessi maturano ogni mese da soli, in dodicesimi, da quanto spetta l'anno a ciascuno (contratto)
--  · satellitare e telecamere lavorano solo dopo che la Direzione ha scritto l'accordo sindacale o
--    l'autorizzazione dell'Ispettorato (art. 4 dello Statuto dei lavoratori), con data e riferimento
--  · conservazione: posizioni del satellitare e foto delle telecamere si cancellano dopo il tempo scelto
--    (vuoto = non si cancella niente); le timbrature restano (servono per le buste paga)
-- =====================================================================

create or replace function public.giorno_it(p timestamptz) returns date
language sql immutable as $$ select (p at time zone 'Europe/Rome')::date $$;
create or replace function public.ora_it(p timestamptz) returns time
language sql immutable as $$ select (p at time zone 'Europe/Rome')::time $$;
grant execute on function public.giorno_it(timestamptz), public.ora_it(timestamptz) to authenticated, anon, service_role;

-- ------------------------------------------------------------------ Viste in ora italiana
create or replace view public.anomalie with (security_invoker = true) as
SELECT sezione,
    cosa,
    chi,
    da,
    dove,
    rif
   FROM ( SELECT 'Magazzino'::text AS sezione,
            ((((((cc.cliente || ' · '::text) || lower(cc.tipo)) || ' '::text) || cc.letti) || ' di '::text) || cc.attesi) || ' colli'::text AS cosa,
            'Magazzino'::text AS chi,
            cc.ultima_lettura AS da,
            'magazzino/controllo'::text AS dove,
            cc.bolla_id::text AS rif
           FROM controllo_colli cc
          WHERE cc.letti > 0 AND cc.letti <> cc.attesi
        UNION ALL
         SELECT 'Missioni'::text AS sezione,
            ((p.codice || ' bloccato: '::text) || (jsonb_array_length(mp.mancanti) + jsonb_array_length(mp.extra))) || ' pezzi non tornano'::text AS cosa,
            'Ufficio'::text AS chi,
            mp.aggiornato_il AS da,
            'magazzino/missioni'::text AS dove,
            mp.id::text AS rif
           FROM missioni_posti mp
             JOIN posti p ON p.id = mp.posto_id
          WHERE mp.stato = 'Bloccato'::stato_posto_missione
        UNION ALL
         SELECT 'Bolle'::text AS sezione,
            (c.nome || ' · manca '::text) || lower(array_to_string(b.dati_mancanti, ', '::text)) AS cosa,
            COALESCE(pr.nome, 'Ufficio bolle'::text) AS chi,
            b.creata_il AS da,
            'bolle'::text AS dove,
            b.id::text AS rif
           FROM bolle b
             JOIN clienti c ON c.id = b.cliente_id
             LEFT JOIN profili pr ON pr.id = b.operatore_id
          WHERE b.stato = 'Nuova'::stato_bolla AND cardinality(b.dati_mancanti) > 0
        UNION ALL
         SELECT 'Presenze'::text AS sezione,
            (COALESCE(d.nome, 'Badge sconosciuto'::text) || ' · '::text) || t.motivo AS cosa,
            'Direzione'::text AS chi,
            t.quando AS da,
            'presenze/allarmi'::text AS dove,
            t.id::text AS rif
           FROM timbrature t
             LEFT JOIN dipendenti d ON d.id = t.dipendente_id
          WHERE t.esito = 'Rifiutata'::text AND t.quando > (now() - '7 days'::interval) AND NOT (EXISTS ( SELECT 1
                   FROM allarmi_gestiti a_1
                  WHERE a_1.timbratura_id = t.id))
        UNION ALL
         SELECT 'Presenze'::text AS sezione,
            (d.nome || ' · uscita non timbrata il '::text) || to_char(e.quando AT TIME ZONE 'Europe/Rome'::text, 'DD/MM'::text) AS cosa,
            'Amministrazione'::text AS chi,
            e.quando AS da,
            'presenze/correzioni'::text AS dove,
            e.id::text AS rif
           FROM timbrature e
             JOIN dipendenti d ON d.id = e.dipendente_id
          WHERE e.esito = 'Valida'::text AND e.verso = 'Entrata'::text AND giorno_it(e.quando) < oggi() AND e.quando > (now() - '31 days'::interval) AND NOT (EXISTS ( SELECT 1
                   FROM timbrature u
                  WHERE u.dipendente_id = e.dipendente_id AND u.esito = 'Valida'::text AND u.verso = 'Uscita'::text AND giorno_it(u.quando) = giorno_it(e.quando) AND u.quando > e.quando)) AND NOT (EXISTS ( SELECT 1
                   FROM correzioni k
                  WHERE k.dipendente_id = e.dipendente_id AND k.giorno = giorno_it(e.quando) AND k.verso = 'Uscita'::text))
        UNION ALL
         SELECT 'Fatturazione'::text AS sezione,
            (c.nome || ' · fattura da controllare: '::text) || COALESCE(f.problema, ''::text) AS cosa,
            'Amministrazione'::text AS chi,
            f.creata_il AS da,
            'fatture'::text AS dove,
            f.id::text AS rif
           FROM fatture f
             JOIN clienti c ON c.id = f.cliente_id
          WHERE f.stato = 'Da controllare'::stato_fattura
        UNION ALL
         SELECT 'Telepass'::text AS sezione,
            (((((COALESCE(tp.autista, tp.targa) || ' · '::text) || COALESCE(tp.entrata, '?'::text)) || ' → '::text) || COALESCE(tp.uscita, '?'::text)) || ' · '::text) || lower(tp.controllo) AS cosa,
            'Direzione'::text AS chi,
            tp.quando AS da,
            'telepass'::text AS dove,
            tp.id::text AS rif
           FROM telepass_passaggi tp
          WHERE tp.controllo IS NOT NULL AND tp.quando > (now() - '31 days'::interval) AND NOT (EXISTS ( SELECT 1
                   FROM telepass_controllati k
                  WHERE k.telepass_id = tp.id))
        UNION ALL
         SELECT 'Satellitare'::text AS sezione,
            (((COALESCE(d.nome, m.targa) || ': '::text) || lower(a_1.tipo)) || ' · '::text) || a_1.dettaglio AS cosa,
            'Direzione'::text AS chi,
            COALESCE(a_1.dalle, a_1.data::timestamp with time zone) AS da,
            'satellitare'::text AS dove,
            a_1.id::text AS rif
           FROM sat_anomalie a_1
             JOIN mezzi m ON m.id = a_1.mezzo_id
             LEFT JOIN dipendenti d ON d.id = a_1.autista_id
          WHERE a_1.grave AND a_1.vista_il IS NULL AND a_1.data > (oggi() - 31)) a
  WHERE vede_anomalie();

create or replace view public.giacenze_aperte with (security_invoker = true) as
SELECT g.id,
    g.bolla_id,
    b.numero,
    c.nome AS cliente,
    b.destinatario,
    b.indirizzo,
    b.citta,
    g.motivo,
    g.dal,
    oggi() - g.dal AS giorni,
    g.riconsegna_il,
    g.chiesta_il
   FROM giacenze g
     JOIN bolle b ON b.id = g.bolla_id
     JOIN clienti c ON c.id = b.cliente_id
  WHERE g.chiusa_il IS NULL;

create or replace view public.presenze_mese with (security_invoker = true) as
WITH base AS (
         SELECT t.dipendente_id,
            giorno_it(t.quando) AS g,
            min(t.quando) FILTER (WHERE t.verso = 'Entrata'::text) AS e,
            max(t.quando) FILTER (WHERE t.verso = 'Uscita'::text) AS u0
           FROM timbrature t
          WHERE t.esito = 'Valida'::text AND date_trunc('month'::text, giorno_it(t.quando)::timestamp without time zone) = date_trunc('month'::text, oggi()::timestamp without time zone)
          GROUP BY t.dipendente_id, (giorno_it(t.quando))
        ), giorni AS (
         SELECT b.dipendente_id,
            b.g,
            b.e,
            COALESCE(b.u0, (( SELECT (k.giorno + k.ora) AT TIME ZONE 'Europe/Rome'::text
                   FROM correzioni k
                  WHERE k.dipendente_id = b.dipendente_id AND k.giorno = b.g AND k.verso = 'Uscita'::text
                  ORDER BY k.fatta_il DESC
                 LIMIT 1))) AS u
           FROM base b
        )
 SELECT d.id AS dipendente_id,
    d.nome,
    d.contratto,
    d.ore_settimana,
    round(sum(EXTRACT(epoch FROM giorni.u - giorni.e) / 3600::numeric) FILTER (WHERE giorni.u IS NOT NULL), 1) AS ore,
    count(*) FILTER (WHERE d.inizio IS NOT NULL AND ora_it(giorni.e) > (d.inizio + '00:05:00'::interval)) AS ritardi,
    COALESCE(sum(GREATEST(0::numeric, EXTRACT(epoch FROM ora_it(giorni.e) - d.inizio) / 60::numeric)) FILTER (WHERE d.inizio IS NOT NULL AND ora_it(giorni.e) > d.inizio), 0::numeric)::integer AS minuti_ritardo,
    count(*) FILTER (WHERE d.fine IS NOT NULL AND ora_it(giorni.u) < (d.fine - '00:05:00'::interval)) AS uscite_anticipate,
    COALESCE(sum(GREATEST(0::numeric, EXTRACT(epoch FROM d.fine - ora_it(giorni.u)) / 60::numeric)) FILTER (WHERE d.fine IS NOT NULL AND ora_it(giorni.u) < d.fine), 0::numeric)::integer AS minuti_in_meno,
    count(*) FILTER (WHERE giorni.u IS NULL AND giorni.g < oggi()) AS uscite_mancanti
   FROM dipendenti d
     LEFT JOIN giorni ON giorni.dipendente_id = d.id
  WHERE d.attivo
  GROUP BY d.id;

create or replace view public.presenze_oggi with (security_invoker = true) as
SELECT d.id AS dipendente_id,
    d.nome,
    d.reparto,
    d.ore_settimana,
    d.inizio,
    min(t.quando) FILTER (WHERE t.verso = 'Entrata'::text) AS entrata,
    max(t.quando) FILTER (WHERE t.verso = 'Uscita'::text) AS uscita,
        CASE
            WHEN min(t.quando) FILTER (WHERE t.verso = 'Entrata'::text) IS NULL THEN 'Assente'::text
            WHEN d.inizio IS NOT NULL AND ora_it(min(t.quando) FILTER (WHERE t.verso = 'Entrata'::text)) > (d.inizio + '00:05:00'::interval) THEN ('Ritardo · '::text || (EXTRACT(epoch FROM ora_it(min(t.quando) FILTER (WHERE t.verso = 'Entrata'::text)) - d.inizio)::integer / 60)) || ' min'::text
            ELSE 'Presente'::text
        END AS stato
   FROM dipendenti d
     LEFT JOIN timbrature t ON t.dipendente_id = d.id AND t.esito = 'Valida'::text AND giorno_it(t.quando) = oggi()
  WHERE d.attivo
  GROUP BY d.id;

create or replace view public.stage_oggi with (security_invoker = true) as
SELECT count(*) FILTER (WHERE giorno_it(iniziato_il) = oggi()) AS ricevuti,
    count(*) FILTER (WHERE esito = 'Formattato'::text AND giorno_it(finito_il) = oggi()) AS formattati,
    count(*) FILTER (WHERE esito = 'In corso'::text) AS in_corso,
    count(*) FILTER (WHERE esito = 'Fallito'::text AND giorno_it(COALESCE(finito_il, iniziato_il)) = oggi()) AS falliti,
    count(*) FILTER (WHERE esito = 'In vendita'::text AND giorno_it(finito_il) = oggi()) AS in_vendita,
    count(*) FILTER (WHERE date_trunc('month'::text, iniziato_il AT TIME ZONE 'Europe/Rome'::text) = date_trunc('month'::text, oggi()::timestamp without time zone)) AS ricevuti_mese,
    count(*) FILTER (WHERE esito = 'Formattato'::text AND date_trunc('month'::text, finito_il AT TIME ZONE 'Europe/Rome'::text) = date_trunc('month'::text, oggi()::timestamp without time zone)) AS formattati_mese,
    count(*) FILTER (WHERE esito = 'Fallito'::text AND date_trunc('month'::text, COALESCE(finito_il, iniziato_il) AT TIME ZONE 'Europe/Rome'::text) = date_trunc('month'::text, oggi()::timestamp without time zone)) AS falliti_mese,
    count(*) FILTER (WHERE esito = 'In vendita'::text AND date_trunc('month'::text, finito_il AT TIME ZONE 'Europe/Rome'::text) = date_trunc('month'::text, oggi()::timestamp without time zone)) AS in_vendita_mese
   FROM stage_pc;

create or replace view public.telepass_passaggi with (security_invoker = true) as
SELECT t.id,
    t.quando,
    t.entrata,
    t.uscita,
    t.importo,
    m.targa,
    m.tipo,
    COALESCE(d.nome, d2.nome) AS autista,
        CASE
            WHEN g.id IS NULL THEN 'Giorno senza giro'::text
            WHEN ora_it(t.quando) < '05:00:00'::time without time zone OR ora_it(t.quando) > '21:00:00'::time without time zone THEN 'Fuori orario'::text
            ELSE NULL::text
        END AS controllo
   FROM telepass t
     JOIN mezzi m ON m.id = t.mezzo_id
     LEFT JOIN giri g ON g.mezzo_id = t.mezzo_id AND g.data = giorno_it(t.quando)
     LEFT JOIN dipendenti d ON d.id = g.autista_id
     LEFT JOIN dipendenti d2 ON d2.id = m.autista_id;


-- ------------------------------------------------------------------ Funzioni in ora italiana
CREATE OR REPLACE FUNCTION public.timbra(p_codice text, p_lettore text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_parti text[] := string_to_array(p_codice, '.');
  v_badge public.badge; v_finestra bigint; v_ora bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_ultimo public.timbrature; v_verso text; v_motivo text; v_chi uuid;
begin
  if coalesce(array_length(v_parti, 1), 0) <> 3 then
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
  else
    v_chi := v_badge.dipendente_id;  -- da qui in poi il codice è autentico: sappiamo di chi è
    if not v_badge.attivo then v_motivo := 'Badge disattivato';
    elsif v_finestra not in (v_ora - 1, v_ora) then v_motivo := 'Codice scaduto (foto o screenshot?)';
    else
      begin
        insert into public.badge_usati (badge_id, finestra) values (v_badge.id, v_finestra);
      exception when unique_violation then v_motivo := 'Codice già usato (foto o screenshot?)';
      end;
    end if;
  end if;
  if v_motivo is not null then
    -- con firma falsa o badge sconosciuto non si accusa nessuno: dipendente vuoto
    insert into public.timbrature (dipendente_id, badge_id, esito, motivo, lettore)
    values (v_chi, case when v_chi is null then null else v_badge.id end, 'Rifiutata', v_motivo, p_lettore);
    return jsonb_build_object('ok', false, 'motivo', v_motivo);
  end if;
  select * into v_ultimo from public.timbrature
   where dipendente_id = v_chi and esito = 'Valida' order by quando desc limit 1;
  if v_ultimo.quando > now() - interval '60 seconds' then
    return jsonb_build_object('ok', false, 'motivo', 'Già timbrato');
  end if;
  v_verso := case when v_ultimo.verso = 'Entrata' and public.giorno_it(v_ultimo.quando) = public.oggi() then 'Uscita' else 'Entrata' end;
  insert into public.timbrature (dipendente_id, badge_id, verso, esito, lettore, dispositivo)
  values (v_chi, v_badge.id, v_verso, 'Valida', p_lettore, v_badge.dispositivo);
  return jsonb_build_object('ok', true, 'verso', v_verso, 'nome', (select nome from public.dipendenti where id = v_chi));
end $function$;

CREATE OR REPLACE FUNCTION public.accessori_possibili(p_fermata uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f public.fermate := public.fermata_mia(p_fermata);
begin
  return coalesce((select array_agg(distinct t.voce order by t.voce)
    from public.tariffe t join public.bolle b on b.cliente_id = t.cliente_id
    where b.id = f.bolla_id and t.voce not in ('Base', 'Giacenza', 'Riconsegna')
      and t.stato = 'Attiva' and t.valida_dal <= public.oggi() and (t.valida_al is null or t.valida_al >= public.oggi())), '{}');
end $function$;

CREATE OR REPLACE FUNCTION public.richiedi_riconsegna(p_giacenza uuid, p_data date, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g public.giacenze;
begin
  if public.mio_cliente() is null then raise exception 'Solo per i clienti'; end if;
  select * into g from public.giacenze where id = p_giacenza and chiusa_il is null;
  if g.id is null or not public.bolla_visibile(g.bolla_id) then raise exception 'Giacenza non trovata'; end if;
  if p_data <= public.oggi() then raise exception 'Scegli un giorno da domani in poi'; end if;
  update public.richieste_riconsegna set data = p_data, nota = p_nota, il = now()
   where giacenza_id = g.id and gestita_il is null and chi = auth.uid();
  if not found then
    insert into public.richieste_riconsegna (giacenza_id, data, nota) values (g.id, p_data, p_nota);
  end if;
  -- nello storico dei Trasporti (registra() è riservata allo staff)
  insert into public.storico (azienda, chi, chi_nome, operazione, cosa, come, oggetto, oggetto_id)
  values ('trasporti', auth.uid(), (select nome from public.profili where id = auth.uid()), 'Richiesta',
          'Riconsegna chiesta dal cliente per il ' || to_char(p_data, 'DD/MM'), 'Sistema', 'giacenze', g.id::text);
end $function$;

create or replace function public.correggi_uscita(p_dipendente uuid, p_giorno date, p_ora time, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.amministro(p_dipendente) then raise exception 'Non autorizzato'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Scrivi il motivo della correzione'; end if;
  if p_giorno > public.oggi() or (p_giorno = public.oggi() and p_ora > public.ora_it(now())) then raise exception 'Non si corregge un''uscita che deve ancora arrivare'; end if;
  insert into public.correzioni (dipendente_id, giorno, verso, ora, motivo) values (p_dipendente, p_giorno, 'Uscita', p_ora, p_motivo);
end $$;

-- ------------------------------------------------------------------ Telefoni del badge: li approva l'amministrazione
alter table public.badge add column if not exists approvato_il timestamptz, add column if not exists approvato_da uuid references public.profili(id);
update public.badge set approvato_il = creato_il where attivo and approvato_il is null;
grant select (approvato_il) on public.badge to authenticated;

create or replace function public.registra_telefono(p_dispositivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_dip uuid := public.mio_dipendente();
begin
  if v_dip is null then raise exception 'Non sei tra i dipendenti'; end if;
  if coalesce(trim(p_dispositivo), '') = '' then raise exception 'Telefono non riconosciuto'; end if;
  if exists (select 1 from public.badge where dipendente_id = v_dip and dispositivo = p_dispositivo and (attivo or (disattivato_il is null and approvato_il is null))) then return; end if;
  -- una sola richiesta aperta: quella vecchia (altro telefono) si chiude
  update public.badge set disattivato_il = now() where dipendente_id = v_dip and not attivo and disattivato_il is null and approvato_il is null;
  insert into public.badge (dipendente_id, dispositivo, attivo) values (v_dip, p_dispositivo, false);
end $$;

create or replace function public.mio_qr(p_dispositivo text) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_badge uuid;
begin
  select id into v_badge from public.badge where dipendente_id = public.mio_dipendente() and attivo and dispositivo = p_dispositivo;
  if v_badge is null then
    if exists (select 1 from public.badge where dipendente_id = public.mio_dipendente() and dispositivo = p_dispositivo and not attivo and disattivato_il is null and approvato_il is null) then
      raise exception 'Telefono in attesa: l''amministrazione deve approvarlo';
    end if;
    raise exception 'Questo telefono non è registrato per il tuo badge';
  end if;
  return public.codice_badge(v_badge, floor(extract(epoch from now()) / 30)::bigint);
end $$;

create or replace view public.telefoni_da_approvare with (security_invoker = true) as
select b.id, b.dipendente_id, d.nome, b.dispositivo, b.creato_il,
       exists (select 1 from public.badge x where x.dipendente_id = b.dipendente_id and x.attivo) as cambio
  from public.badge b join public.dipendenti d on d.id = b.dipendente_id
 where not b.attivo and b.disattivato_il is null and b.approvato_il is null and public.amministro(b.dipendente_id);
grant select on public.telefoni_da_approvare to authenticated;

create or replace function public.approva_telefono(p_badge uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare b public.badge;
begin
  select * into b from public.badge where id = p_badge for update;
  if b.id is null or b.attivo or b.disattivato_il is not null or b.approvato_il is not null then raise exception 'Niente da approvare'; end if;
  if not public.amministro(b.dipendente_id) then raise exception 'Non autorizzato'; end if;
  if p_ok then
    update public.badge set attivo = false, disattivato_il = now() where dipendente_id = b.dipendente_id and attivo;
    update public.badge set attivo = true, approvato_il = now(), approvato_da = auth.uid() where id = b.id;
  else
    update public.badge set disattivato_il = now() where id = b.id;
  end if;
end $$;
revoke execute on function public.approva_telefono(uuid, boolean) from public, anon;
grant execute on function public.approva_telefono(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------ Ferie e permessi che maturano
alter table public.dipendenti add column if not exists assunto_il date,
                              add column if not exists ferie_anno numeric(4, 1) check (ferie_anno is null or ferie_anno between 0 and 60),
                              add column if not exists permessi_anno numeric(5, 1) check (permessi_anno is null or permessi_anno between 0 and 400);
alter table public.ferie add column if not exists aggiornate_il timestamptz;

-- mesi interi dell'anno: dal mese di assunzione (se entro il 15) fino al mese scorso
create or replace function public.mesi_maturati(p_assunto date, p_giorno date) returns integer
language sql immutable as $$
  select greatest(0, least(12,
    (extract(month from p_giorno)::int - 1)
    - case when p_assunto is null or p_assunto < make_date(extract(year from p_giorno)::int, 1, 1) then 0
           else extract(month from p_assunto)::int - 1 + case when extract(day from p_assunto) > 15 then 1 else 0 end end))
$$;

create or replace function public.matura_ferie() returns integer
language plpgsql security definer set search_path = public as $$
declare d record; v_anno int := extract(year from public.oggi())::int; n int := 0; v_mesi int;
begin
  if auth.uid() is not null and not public.ha_ruolo('amministrazione') then raise exception 'Non autorizzato'; end if;
  for d in select * from public.dipendenti where attivo and (ferie_anno is not null or permessi_anno is not null)
                                          and (auth.uid() is null or public.amministro(id)) loop
    v_mesi := public.mesi_maturati(d.assunto_il, public.oggi());
    insert into public.ferie (dipendente_id, anno, ferie_maturate, permessi_spettanti, aggiornate_il)
    values (d.id, v_anno, round(coalesce(d.ferie_anno, 0) * v_mesi / 12, 1), round(coalesce(d.permessi_anno, 0) * v_mesi / 12, 1), now())
    on conflict (dipendente_id, anno) do update
      set ferie_maturate = excluded.ferie_maturate, permessi_spettanti = excluded.permessi_spettanti, aggiornate_il = now();
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.matura_ferie() from public, anon;
grant execute on function public.matura_ferie() to authenticated;
-- quando cambia quanto spetta l'anno, il conto si rifà subito
create or replace function public.dipendente_ferie() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.ferie_anno, new.permessi_anno, new.assunto_il) is distinct from (old.ferie_anno, old.permessi_anno, old.assunto_il) and new.attivo then
    insert into public.ferie (dipendente_id, anno, ferie_maturate, permessi_spettanti, aggiornate_il)
    values (new.id, extract(year from public.oggi())::int, round(coalesce(new.ferie_anno, 0) * public.mesi_maturati(new.assunto_il, public.oggi()) / 12, 1),
            round(coalesce(new.permessi_anno, 0) * public.mesi_maturati(new.assunto_il, public.oggi()) / 12, 1), now())
    on conflict (dipendente_id, anno) do update
      set ferie_maturate = excluded.ferie_maturate, permessi_spettanti = excluded.permessi_spettanti, aggiornate_il = now();
  end if;
  return null;
end $$;
drop trigger if exists dipendente_ferie on public.dipendenti;
create trigger dipendente_ferie after update of ferie_anno, permessi_anno, assunto_il on public.dipendenti for each row execute function public.dipendente_ferie();

-- ------------------------------------------------------------------ Controlli a distanza (art. 4) e conservazione
insert into public.impostazioni (chiave, valore, nota) values
  ('controllo_lavoratori', '{"satellitare": null, "telecamere": null}',
   'Accordo sindacale o autorizzazione dell''Ispettorato del lavoro (art. 4 Statuto dei lavoratori): finché manca, satellitare e telecamere non raccolgono niente'),
  ('conservazione', '{"posizioni_mesi": null, "foto_giorni": null}',
   'Dopo quanto si cancellano posizioni del satellitare e foto delle telecamere (vuoto = mai). Le timbrature restano per le buste paga.')
on conflict (chiave) do nothing;

create or replace function public.controllo_permesso(p_cosa text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (valore -> p_cosa ->> 'data') is not null and coalesce(valore -> p_cosa ->> 'rif', '') <> ''
                     from public.impostazioni where chiave = 'controllo_lavoratori'), false)
$$;
grant execute on function public.controllo_permesso(text) to authenticated, service_role;

create or replace function public.scrivi_controllo(p_cosa text, p_tipo text, p_data date, p_rif text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ha_ruolo('direzione') then raise exception 'Lo scrive la Direzione'; end if;
  if p_cosa not in ('satellitare', 'telecamere') then raise exception 'Scegli satellitare o telecamere'; end if;
  if p_tipo not in ('Accordo sindacale', 'Autorizzazione Ispettorato') then raise exception 'Scegli accordo sindacale o autorizzazione dell''Ispettorato'; end if;
  if p_data is null or p_data > public.oggi() then raise exception 'Scrivi la data del documento'; end if;
  if coalesce(trim(p_rif), '') = '' then raise exception 'Scrivi il riferimento (protocollo o numero)'; end if;
  perform set_config('messina.impostazioni', 'si', true);
  update public.impostazioni set valore = jsonb_set(valore, array[p_cosa], jsonb_build_object('tipo', p_tipo, 'data', p_data, 'rif', trim(p_rif)))
   where chiave = 'controllo_lavoratori';
  perform public.registra('trasporti', 'Impostazioni', initcap(p_cosa) || ': ' || p_tipo || ' del ' || to_char(p_data, 'DD/MM/YYYY') || ' · ' || trim(p_rif), null, 'Manuale', 'impostazioni', 'controllo_lavoratori');
end $$;

create or replace function public.scrivi_conservazione(p_posizioni_mesi integer, p_foto_giorni integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ha_ruolo('direzione') then raise exception 'Lo sceglie la Direzione'; end if;
  if p_posizioni_mesi is not null and p_posizioni_mesi not between 1 and 60 then raise exception 'Posizioni: da 1 a 60 mesi'; end if;
  if p_foto_giorni is not null and p_foto_giorni not between 1 and 365 then raise exception 'Foto: da 1 a 365 giorni'; end if;
  perform set_config('messina.impostazioni', 'si', true);
  update public.impostazioni set valore = jsonb_build_object('posizioni_mesi', p_posizioni_mesi, 'foto_giorni', p_foto_giorni) where chiave = 'conservazione';
  perform public.registra('trasporti', 'Impostazioni', 'Conservazione: posizioni ' || coalesce(p_posizioni_mesi || ' mesi', 'senza limite') || ', foto ' || coalesce(p_foto_giorni || ' giorni', 'senza limite'),
                          null, 'Manuale', 'impostazioni', 'conservazione');
end $$;
revoke execute on function public.scrivi_controllo(text, text, date, text), public.scrivi_conservazione(integer, integer) from public, anon;
grant execute on function public.scrivi_controllo(text, text, date, text), public.scrivi_conservazione(integer, integer) to authenticated;

-- queste due impostazioni si cambiano solo con le funzioni qui sopra (restano nello storico)
create or replace function public.impostazioni_protette() returns trigger
language plpgsql as $$
begin
  if old.chiave in ('controllo_lavoratori', 'conservazione') and auth.uid() is not null
     and coalesce(current_setting('messina.impostazioni', true), '') <> 'si' then
    raise exception 'Si cambia dalla pagina Impostazioni';
  end if;
  return new;
end $$;
drop trigger if exists impostazioni_protette on public.impostazioni;
create trigger impostazioni_protette before update on public.impostazioni for each row execute function public.impostazioni_protette();

-- senza permesso scritto il database non accetta posizioni né foto (anche se la funzione esterna sbagliasse)
create or replace function public.solo_con_permesso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.controllo_permesso(tg_argv[0]) then
    raise exception 'Manca l''accordo sindacale o l''autorizzazione dell''Ispettorato per %: la Direzione lo scrive in Impostazioni', tg_argv[0];
  end if;
  return new;
end $$;
drop trigger if exists sat_permesso on public.sat_posizioni;
create trigger sat_permesso before insert on public.sat_posizioni for each row execute function public.solo_con_permesso('satellitare');
drop trigger if exists cam_foto_permesso on public.cam_foto;
create trigger cam_foto_permesso before insert on public.cam_foto for each row execute function public.solo_con_permesso('telecamere');
drop trigger if exists cam_avvisi_permesso on public.cam_avvisi;
create trigger cam_avvisi_permesso before insert on public.cam_avvisi for each row execute function public.solo_con_permesso('telecamere');

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('messina-ferie', '0 3 1 * *', $c$select public.matura_ferie()$c$);
    perform cron.schedule('messina-pulizia', '30 2 * * *', $c$select public.chiama_funzione('pulizia')$c$);
  else
    raise notice 'pg_cron non presente: ferie e pulizia vanno attivate dopo (docs/SETUP.md)';
  end if;
end $$;
