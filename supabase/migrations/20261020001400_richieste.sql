-- Quando l'ufficio prenota la riconsegna, la richiesta fatta dal cliente sul portale risulta gestita.
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
  update public.richieste_riconsegna set gestita_il = now() where giacenza_id = g.id and gestita_il is null;
  perform public.registra('trasporti', 'Riconsegna', 'Prenotata per il ' || to_char(p_data, 'DD/MM'), null, 'Sistema', 'giacenze', g.id::text);
end $$;
revoke execute on function public.prenota_riconsegna(uuid, date) from public, anon;
grant execute on function public.prenota_riconsegna(uuid, date) to authenticated;
