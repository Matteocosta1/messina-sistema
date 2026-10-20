-- Correzioni dalla revisione di sicurezza del 20/10 sul codice nuovo.
-- 1) documenti: ogni società vede solo i suoi file, e solo chi deve; mail, fatture ed etichette le scrive solo il sistema
-- 2) fatture: blocco d'invio, così una fattura non va due volte allo SdI
-- 3) ordini del sito con pezzi mancanti: restano segnalati
-- 4) bancali: il codice stampato è di chi l'ha riservato

-- 1 ---------------------------------------------------------------- storage «documenti»
-- Percorsi:  mail/<azienda>/…          allegati delle mail (solo sistema)
--            fatture/<azienda>/<id>.pdf  PDF delle fatture (solo sistema; il cliente legge la sua dal portale)
--            etichette/<id>.pdf        etichette corriere Corporation (solo sistema)
--            lotti/<lotto>/…           fatture e DDT dei lotti (vendite, amministrazione Corporation)
--            contratti/<cliente>.pdf   contratti dei clienti (amministrazione, commerciale della società del cliente)
create or replace function public.documento_leggibile(p_nome text) returns boolean
language sql stable security definer set search_path = public as $$
  select case (string_to_array(p_nome, '/'))[1]
    when 'mail' then public.staff_di((string_to_array(p_nome, '/'))[2])
                     and public.ha_ruolo('amministrazione', 'commerciale', 'bolle', 'traffico', 'vendite', 'stage')
    when 'fatture' then public.staff_di((string_to_array(p_nome, '/'))[2]) and public.ha_ruolo('amministrazione')
    when 'etichette' then public.staff_di('corporation') and public.ha_ruolo('vendite', 'magazzino')
    when 'lotti' then public.staff_di('corporation') and public.ha_ruolo('vendite', 'amministrazione')
    when 'contratti' then exists (select 1 from public.clienti c
                                  where c.id::text = split_part((string_to_array(p_nome, '/'))[2], '.', 1)
                                    and public.staff_di(c.azienda) and public.ha_ruolo('amministrazione', 'commerciale'))
    else false end
$$;
create or replace function public.documento_scrivibile(p_nome text) returns boolean
language sql stable security definer set search_path = public as $$
  select case (string_to_array(p_nome, '/'))[1]
    when 'lotti' then public.staff_di('corporation') and public.ha_ruolo('vendite', 'amministrazione')
    when 'contratti' then public.documento_leggibile(p_nome)
    else false end   -- mail, fatture, etichette: solo le Edge Functions (service_role)
$$;
revoke execute on function public.documento_leggibile(text), public.documento_scrivibile(text) from public, anon;
grant execute on function public.documento_leggibile(text), public.documento_scrivibile(text) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists documenti_staff on storage.objects';
    execute $p$create policy documenti_leggi on storage.objects for select to authenticated
      using (bucket_id = 'documenti' and public.documento_leggibile(name))$p$;
    execute $p$create policy documenti_carica on storage.objects for insert to authenticated
      with check (bucket_id = 'documenti' and public.documento_scrivibile(name))$p$;
    -- niente update né delete: un documento caricato non si sostituisce da fuori
  end if;
end $$;

-- 2 ---------------------------------------------------------------- invio fatture
alter table public.fatture add column if not exists fic_in_corso timestamptz,
                           add column if not exists sdi_inviata_il timestamptz;

-- 3 ---------------------------------------------------------------- ordini del sito
alter table public.ordini add column if not exists problema text;   -- es. pezzi mancanti: da rimborsare

-- 4 ---------------------------------------------------------------- codici bancale riservati
create table if not exists public.bancali_riservati (
  codice text primary key,
  da     uuid not null references public.profili(id),
  il     timestamptz not null default now()
);
alter table public.bancali_riservati enable row level security;   -- nessuna policy: solo le funzioni

create or replace function public.riserva_bancale() returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not public.ha_ruolo('magazzino', 'vendite', 'stage') then raise exception 'Non puoi creare bancali'; end if;
  v := 'B-' || lpad(nextval('public.codice_bancale_seq')::text, 4, '0');
  insert into public.bancali_riservati (codice, da) values (v, auth.uid());
  return v;
end $$;

create or replace function public.crea_bancale(p_codice text, p_posto text, p_cliente uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_cli uuid := p_cliente; v_posto uuid;
begin
  if not public.ha_ruolo('magazzino', 'vendite', 'stage') then raise exception 'Non puoi creare bancali'; end if;
  if not exists (select 1 from public.bancali_riservati where codice = p_codice and da = auth.uid()) then
    raise exception 'Codice bancale non riservato da te: stampa una nuova etichetta';
  end if;
  if exists (select 1 from public.bancali where codice = p_codice) then raise exception 'Bancale % già esistente', p_codice; end if;
  if not public.staff_di('trasporti') then
    select id into v_cli from public.clienti where azienda_collegata = public.mia_azienda() limit 1;
  end if;
  if v_cli is null then raise exception 'Cliente mancante'; end if;
  if not (public.staff_di('trasporti') or exists (
      select 1 from public.clienti where id = v_cli and azienda_collegata = public.mia_azienda())) then
    raise exception 'Cliente non tuo';
  end if;
  select id into v_posto from public.posti where codice = p_posto and attivo;
  if v_posto is null then raise exception 'Posto % inesistente', p_posto; end if;
  if public.posto_bloccato(v_posto) then raise exception 'Posto bloccato da una missione: prima lo sblocca l''ufficio'; end if;
  insert into public.bancali (codice, cliente_id, posto_id) values (p_codice, v_cli, v_posto);
  delete from public.bancali_riservati where codice = p_codice;
  perform public.registra(public.mia_azienda(), 'Entrata', 'Bancale nuovo ' || p_codice, p_posto, 'Pistola', 'bancali', p_codice);
  return p_codice;
end $$;
revoke execute on function public.riserva_bancale(), public.crea_bancale(text, text, uuid) from public, anon;
grant execute on function public.riserva_bancale(), public.crea_bancale(text, text, uuid) to authenticated;
