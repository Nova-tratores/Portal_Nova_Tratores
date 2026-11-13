-- Tela do diretor (/empresa): áreas já calculadas guardadas numa tabela (11/11/2026) — projeto do PORTAL (citrhumdkfivdzbmayde).
-- José: "todas as informações de todos os módulos têm que ser salvas em tabelas para não demorarem na hora de carregar".
-- O robô `empresa-snapshot` (agendador) recalcula e grava; a tela só lê. Idempotente: pode rodar de novo.
-- Junto: a tabela das metas dos vendedores (sql/empresa-metas-vendedor.sql) — o mesmo conteúdo está repetido no fim.

create table if not exists public.empresa_painel (
  area text primary key,                 -- 'comercial' | 'dre-gerencial' (outras entram depois)
  dados jsonb not null,
  calculado_em timestamptz not null default now(),
  duracao_ms integer,
  erro text                              -- erro da última rodada (os dados ficam os da anterior)
);
alter table public.empresa_painel enable row level security;
revoke all on public.empresa_painel from anon, authenticated;

-- Agendamentos: Comercial só lê o banco (rápido); o resultado dos setores pode consultar a Omie (meses recentes).
do $$
begin
  if to_regclass('public.agendamentos') is not null then
    insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, parametros, prioridade, usa_omie, duracao_max_min, ativo)
    values
      ('empresa-comercial', 'empresa-snapshot', 'Tela do diretor — Comercial', 'Sistema',
       'Grava vendas de máquinas, estoque, propostas e vendedores da tela /empresa. Só lê o banco.',
       'intervalo', 30, '{"area":"comercial"}'::jsonb, 'rapido', false, 5, true),
      ('empresa-vendedores', 'empresa-snapshot', 'Tela do diretor — vendedores (app)', 'Sistema',
       'Grava carro, km, visitas e negócios de cada vendedor (30 dias) da tela /empresa. Só lê o banco.',
       'intervalo', 30, '{"area":"vendedores"}'::jsonb, 'rapido', false, 5, true),
      ('empresa-dre-gerencial', 'empresa-snapshot', 'Tela do diretor — resultado dos setores', 'Sistema',
       'Grava o DRE gerencial por setor (6 meses) da tela /empresa. Pode buscar os meses recentes na Omie.',
       'intervalo', 30, '{"area":"dre-gerencial"}'::jsonb, 'pesado', true, 10, true)
    on conflict (chave) do nothing;
  end if;
end $$;

-- Metas dos vendedores (definidas pelo diretor na tela /empresa → Comercial → Vendedores)
create table if not exists public.empresa_metas_vendedor (
  vendedor text not null,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  valor numeric(14, 2) not null check (valor >= 0),
  alterado_por text,
  alterado_em timestamptz not null default now(),
  primary key (vendedor, mes)
);
alter table public.empresa_metas_vendedor enable row level security;
revoke all on public.empresa_metas_vendedor from anon, authenticated;

notify pgrst, 'reload schema';

-- Conferência (deve voltar 3 agendamentos e as 2 tabelas):
--   select chave, ativo, intervalo_min from agendamentos where handler = 'empresa-snapshot';
--   select to_regclass('public.empresa_painel'), to_regclass('public.empresa_metas_vendedor');
