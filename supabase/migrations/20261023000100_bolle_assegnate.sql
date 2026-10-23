-- Bolle divise in automatico nell'ufficio bolle (Dossier: «Bolle divise in automatico tra Christian, Gabriele, Alberto»;
-- lavoro diviso per carico, tutti sanno gestire tutti i clienti).
-- Ogni bolla nuova va a chi dell'ufficio bolle dei Trasporti ha meno bolle «Nuova» da confermare; a parità, in ordine di nome.
-- Solo la Direzione può scegliere a mano a chi va. Se nell'ufficio bolle non c'è nessuno attivo, resta a chi l'ha creata.
create or replace function public.bolle_assegna() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_op uuid;
begin
  if new.operatore_id is null or auth.uid() is null or public.mio_ruolo() is distinct from 'direzione' then
    select p.id into v_op from public.profili p
     where p.azienda = 'trasporti' and p.ruolo = 'bolle' and p.attivo
     order by (select count(*) from public.bolle b where b.operatore_id = p.id and b.stato = 'Nuova'), p.nome, p.id
     limit 1;
    new.operatore_id := coalesce(v_op, new.operatore_id);
  end if;
  return new;
end $$;

drop trigger if exists bolle_assegna on public.bolle;
create trigger bolle_assegna before insert on public.bolle
  for each row execute function public.bolle_assegna();
