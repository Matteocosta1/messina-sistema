-- Gestionale vero: quello che serve alle schermate approvate e non c'era ancora.
--  · resoconti: il «Resoconto del mattino» della Home (lo scrive la funzione resoconto alle 7:00)
--  · telepass_controllati: un passaggio Telepass sospetto, una volta guardato, esce dalle Anomalie
--  · anomalie: aggiunge la sezione Telepass e toglie gli allarmi badge già gestiti

create table public.resoconti (
  id        uuid primary key default gen_random_uuid(),
  azienda   text not null references public.aziende(id),
  giorno    date not null default current_date,
  testo     text not null,
  creato_il timestamptz not null default now(),
  unique (azienda, giorno)
);
alter table public.resoconti enable row level security;
create policy resoconti_leggi on public.resoconti for select to authenticated
  using (public.staff_di(azienda) and public.ha_ruolo('direzione', 'amministrazione'));
grant select on public.resoconti to authenticated;
-- scrive solo la funzione (service_role)

create table public.telepass_controllati (
  telepass_id uuid primary key references public.telepass(id),
  nota        text,
  da          uuid not null default auth.uid() references public.profili(id),
  il          timestamptz not null default now()
);
alter table public.telepass_controllati enable row level security;
create policy telepass_controllati_leggi on public.telepass_controllati for select to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('direzione', 'amministrazione', 'traffico'));
create policy telepass_controllati_scrivi on public.telepass_controllati for insert to authenticated
  with check (public.staff_di('trasporti') and public.ha_ruolo('direzione', 'amministrazione') and da = auth.uid());
grant select, insert on public.telepass_controllati to authenticated;

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
     and not exists (select 1 from public.telepass_controllati k where k.telepass_id = tp.id);

grant select on public.anomalie to authenticated;
