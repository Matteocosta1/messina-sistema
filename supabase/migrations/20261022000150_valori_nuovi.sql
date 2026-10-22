-- Valori nuovi degli elenchi, in un file a parte: un valore aggiunto si può usare solo dopo che è stato salvato
-- (le migrazioni che seguono li usano già: tariffe a km e al mese, fatture annullate e stornate, ruolo commercialista).
alter type public.unita_tariffa add value if not exists 'km';
alter type public.unita_tariffa add value if not exists 'mese';
alter type public.stato_fattura add value if not exists 'Annullata';
alter type public.stato_fattura add value if not exists 'Stornata';
alter type public.ruolo add value if not exists 'commercialista';
