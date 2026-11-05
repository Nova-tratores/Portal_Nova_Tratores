-- Garantias: horas e km que a FÁBRICA realmente pagou (DRVG), editáveis depois
-- de finalizar. Recusadas = pedidas (garantista, senão técnico) − pagas.
-- valor_pago_horas/km continuam sendo o dinheiro (pagas × taxa da montadora).
-- Sem a migration o portal deduz as pagas do valor ÷ taxa e salvar ainda
-- regrava o valor; só a quantidade exata (ex.: 0,33 h) não fica guardada.
alter table public.garantias add column if not exists fabrica_horas_pagas numeric;
alter table public.garantias add column if not exists fabrica_km_pagos numeric;

notify pgrst, 'reload schema';
