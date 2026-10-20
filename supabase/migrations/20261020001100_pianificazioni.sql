-- Operazioni pianificate (cron) che chiamano le Edge Functions.
-- Su Supabase servono le estensioni pg_cron e pg_net (Database → Extensions) e due segreti nel Vault:
--   progetto_url  = https://<ref>.supabase.co
--   cron_segreto  = lo stesso valore del segreto CRON_SEGRETO delle Edge Functions
-- Nessun segreto è scritto qui: la funzione li legge dal Vault al momento della chiamata.
-- In locale (senza pg_cron) questa migrazione non fa niente.

create or replace function public.chiama_funzione(p_nome text, p_corpo jsonb default '{}')
returns bigint language plpgsql security definer set search_path = public as $$
declare v_url text; v_segreto text;
begin
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    raise notice 'pg_net o Vault non disponibili: % non chiamata', p_nome; return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'progetto_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_segreto using 'cron_segreto';
  if v_url is null or v_segreto is null then
    raise warning 'Mancano progetto_url o cron_segreto nel Vault: % non chiamata', p_nome; return null;
  end if;
  return (select net.http_post(url := v_url || '/functions/v1/' || p_nome,
                               body := p_corpo,
                               headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-segreto', v_segreto)));
end $$;
revoke all on function public.chiama_funzione(text, jsonb) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    -- pg_cron lavora in UTC: le 7:00 di Roma sono le 5:00 UTC d'estate e le 6:00 d'inverno.
    -- Si chiama alle 5:00 e alle 6:00 UTC; la funzione lavora solo quando a Roma sono le 7.
    perform cron.schedule('messina-resoconto', '0 5,6 * * *', $c$select public.chiama_funzione('resoconto')$c$);
    perform cron.schedule('messina-mail',     '*/2 * * * *',  $c$select public.chiama_funzione('mail-outlook', '{"azione":"sincronizza"}')$c$);
    perform cron.schedule('messina-telepass', '*/30 * * * *', $c$select public.chiama_funzione('telepass-import')$c$);
  else
    raise notice 'pg_cron/pg_net non presenti: pianificazioni da attivare dopo (docs/SETUP.md)';
  end if;
end $$;
