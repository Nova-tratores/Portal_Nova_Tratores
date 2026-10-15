-- ════════════════════════════════════════════════════════════════════
-- Patrimônio Loja — 02: quantidade + etiqueta impressa (15/10/2026). Idempotente.
-- Pedido do José: cada item tem QUANTIDADE (ex.: 5 cadeiras iguais num cadastro;
-- o valor é por unidade) e etiqueta igual à do Opa Peças (térmica), marcando
-- quando foi impressa. Rodar depois do patrimonio-01.
-- ════════════════════════════════════════════════════════════════════

alter table public.patrimonio_itens add column if not exists quantidade int not null default 1;
alter table public.patrimonio_itens add column if not exists etiqueta_impressa_em timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'patrimonio_itens_quantidade_ok') then
    alter table public.patrimonio_itens add constraint patrimonio_itens_quantidade_ok check (quantidade between 1 and 100000);
  end if;
end $$;

notify pgrst, 'reload schema';
