-- Clientes: guardar o flag de INATIVO vindo do Omie (ListarClientes.inativo = "S"/"N").
-- Antes disso a tabela não distinguia ativo/inativo, então a busca do PPV mostrava
-- todos. Com a coluna + o sync gravando + re-sync, a busca passa a esconder inativos.
-- (nome com maiúsculas → precisa de aspas duplas)
alter table public."portal_nt_clientes_PRINCIPAL"
  add column if not exists inativo boolean not null default false;

comment on column public."portal_nt_clientes_PRINCIPAL".inativo is
  'true = cliente inativo no Omie (ListarClientes.inativo="S"). Preenchido pelo sync /api/mapa/sync-omie. A busca de clientes do PPV esconde os inativos.';

-- Depois de rodar este SQL: rode o sync de clientes (/api/mapa/sync-omie) uma vez
-- para popular a coluna a partir do Omie. Até lá, todos ficam como ativos (default).
