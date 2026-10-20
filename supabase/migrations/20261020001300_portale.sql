-- Portale clienti: quello che il cliente può vedere e chiedere, sempre passando dai permessi.
--  · portale_bancali(): i suoi bancali con il codice del posto (i posti da soli restano interni)
--  · richieste_riconsegna + richiedi_riconsegna(): il cliente chiede una data, l'ufficio la prenota
--  · fatture.pdf: percorso del PDF nello storage (documenti/fatture/...), leggibile dal cliente della fattura

create or replace function public.portale_bancali()
returns table (id uuid, codice text, cliente text, posto text, creato_il timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, b.codice, c.nome, p.codice, b.creato_il
  from public.bancali b
  join public.clienti c on c.id = b.cliente_id
  left join public.posti p on p.id = b.posto_id
  where public.mio_cliente() is not null
    and b.uscito_il is null
    and public.bancale_visibile(b.id)
  order by p.codice nulls last, b.codice
$$;
revoke execute on function public.portale_bancali() from public, anon;
grant execute on function public.portale_bancali() to authenticated;

create table public.richieste_riconsegna (
  id          uuid primary key default gen_random_uuid(),
  giacenza_id uuid not null references public.giacenze(id),
  data        date not null,
  nota        text,
  chi         uuid not null default auth.uid() references public.profili(id),
  il          timestamptz not null default now(),
  gestita_il  timestamptz
);
create unique index richieste_riconsegna_aperta on public.richieste_riconsegna (giacenza_id) where gestita_il is null;
alter table public.richieste_riconsegna enable row level security;
create policy richieste_leggi on public.richieste_riconsegna for select to authenticated
  using (chi = auth.uid() or (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico')));
create policy richieste_gestisci on public.richieste_riconsegna for update to authenticated
  using (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico'))
  with check (public.staff_di('trasporti') and public.ha_ruolo('bolle', 'traffico'));
grant select, update on public.richieste_riconsegna to authenticated;
-- l'inserimento passa solo dalla funzione

create or replace function public.richiedi_riconsegna(p_giacenza uuid, p_data date, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare g public.giacenze;
begin
  if public.mio_cliente() is null then raise exception 'Solo per i clienti'; end if;
  select * into g from public.giacenze where id = p_giacenza and chiusa_il is null;
  if g.id is null or not public.bolla_visibile(g.bolla_id) then raise exception 'Giacenza non trovata'; end if;
  if p_data <= current_date then raise exception 'Scegli un giorno da domani in poi'; end if;
  update public.richieste_riconsegna set data = p_data, nota = p_nota, il = now()
   where giacenza_id = g.id and gestita_il is null and chi = auth.uid();
  if not found then
    insert into public.richieste_riconsegna (giacenza_id, data, nota) values (g.id, p_data, p_nota);
  end if;
  -- nello storico dei Trasporti (registra() è riservata allo staff)
  insert into public.storico (azienda, chi, chi_nome, operazione, cosa, come, oggetto, oggetto_id)
  values ('trasporti', auth.uid(), (select nome from public.profili where id = auth.uid()), 'Richiesta',
          'Riconsegna chiesta dal cliente per il ' || to_char(p_data, 'DD/MM'), 'Sistema', 'giacenze', g.id::text);
end $$;
revoke execute on function public.richiedi_riconsegna(uuid, date, text) from public, anon;
grant execute on function public.richiedi_riconsegna(uuid, date, text) to authenticated;

alter table public.fatture add column if not exists pdf text;

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute $p$create policy documenti_fatture_cliente on storage.objects for select to authenticated
      using (bucket_id = 'documenti' and name like 'fatture/%'
             and exists (select 1 from public.fatture f where f.pdf = name
                         and f.cliente_id = public.mio_cliente() and f.stato in ('Inviata', 'Pagata')))$p$;
  end if;
end $$;
