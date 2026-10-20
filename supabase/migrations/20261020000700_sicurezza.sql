-- =====================================================================
-- Chiusura finale dei permessi.
-- Postgres e Supabase danno di default l'esecuzione delle funzioni a
-- tutti (anche a chi non ha fatto login). Qui la togliamo e la ridiamo
-- solo agli utenti loggati; le funzioni del lettore presenze restano
-- riservate al server. Chi non ha fatto login non vede né tocca niente.
-- =====================================================================

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.codice_badge(uuid, bigint) from authenticated;
revoke execute on function public.timbra(text, text) from authenticated;
grant execute on function public.timbra(text, text) to service_role;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public revoke all on tables from anon;

-- lo storico e le timbrature si scrivono solo dalle funzioni del sistema
revoke insert, update, delete on public.storico, public.timbrature from authenticated;
