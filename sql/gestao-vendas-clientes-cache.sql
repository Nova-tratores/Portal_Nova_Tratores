-- Gestão de Vendas — cache de nomes de cliente resolvidos via Omie.
-- Quando um cliente da venda não está em `clientes` nem em
-- `portal_nt_clientes_cadastro_omie` (ex.: recém-criado / não sincronizado),
-- a tela mostrava o código interno da Omie (ex.: 2505096671). O servidor passa
-- a resolver esses casos, como ÚLTIMO recurso, via Omie ConsultarCliente e
-- guarda o resultado aqui — para não reconsultar a Omie a cada carregamento.
--
-- nome NULL = já consultado e sem retorno (cliente inativo/apagado) → não
-- reconsulta. Idempotente. Aplicar no Supabase (SQL editor) uma vez.

create table if not exists public.gv_clientes_omie_cache (
  cod_cli       bigint      not null,
  conta         text        not null,          -- 'NOVA' | 'CASTRO'
  nome          text,                          -- null = consultado, sem nome
  atualizado_em timestamptz not null default now(),
  primary key (cod_cli, conta)
);

comment on table public.gv_clientes_omie_cache is
  'Cache de nomes de cliente resolvidos via Omie ConsultarCliente (último recurso do Gestão de Vendas quando o cliente não está em clientes/portal_nt_clientes_cadastro_omie). nome NULL = consultado e sem retorno (evita reconsulta).';
