-- Patrimônio Loja 03 — um item, vários lugares (José, 19/11/2026: "deixar o patrimônio que tem mais de
-- uma unidade separado, ex.: 1 no pátio, 5 em Peças, 1 no Pós-Vendas").
--
-- patrimonio_partes = N unidades do item em OUTRO lugar (com quem e em que situação). O que não foi
-- separado continua no lugar do próprio item (patrimonio_itens.local_id…) = "lugar principal".
-- Principal = quantidade do item − soma das partes. Parte que chega a 0 é apagada.
-- patrimonio_movimentacoes.quantidade = quantas unidades andaram (null = o item inteiro, como antes).
-- Depende de sql/patrimonio-01.sql e -02.sql. Idempotente. Só as rotas (service role) leem/escrevem.

create table if not exists public.patrimonio_partes (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.patrimonio_itens(id) on delete cascade,
  quantidade    int not null check (quantidade >= 1),
  local_id      text,
  local_tecnico text,
  responsavel   text,
  situacao      text not null default 'em_uso',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists patrimonio_partes_item_idx on public.patrimonio_partes (item_id);

alter table public.patrimonio_movimentacoes add column if not exists quantidade int;

alter table public.patrimonio_partes enable row level security;
revoke all on public.patrimonio_partes from anon, authenticated;

notify pgrst, 'reload schema';
