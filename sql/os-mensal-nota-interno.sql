-- Card Serviços do dashboard: separar OS faturadas COM NFS-e ("com nota") das
-- fechadas internamente (com recibo, sem nota). Aplicar no SQL Editor do Supabase.
--
-- os_mensal ganha o split; linhas antigas ficam com NULL — é o sinal para o
-- backfill em background recalcular o mês.
alter table os_mensal add column if not exists valor_nota numeric;
alter table os_mensal add column if not exists valor_interno numeric;

-- Cache por OS do resultado do StatusOS (Omie): evita reconsultar a cada refresh.
-- tem_nota=true é definitivo; tem_nota=false é reverificado 1x/dia enquanto o mês
-- da OS for o corrente (a NFS-e pode ser autorizada dias depois do faturamento).
create table if not exists os_nfse (
  ncod_os bigint not null,
  conta_omie text not null,
  num_os text,
  nfse_num text,
  tem_nota boolean not null default false,
  verificado_em date not null,
  primary key (ncod_os, conta_omie)
);
