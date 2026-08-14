-- Cenários fiscais do Omie (dropdown "Cenário Fiscal" do Pedido de Venda no PPV).
-- Guarda o CÓDIGO (codigo_cenario_impostos, que vai pro Omie) + nome, por conta.
-- Importado do Omie (geral/cenarios/ ListarCenarios) por script. Idempotente.
create table if not exists cenario_fiscal (
  conta_omie text not null,
  codigo     text not null,
  nome       text,
  inativo    boolean default false,
  padrao     boolean default false,
  segmentos  text,   -- "Indústria, Comércio (Varejista)…" (mostrado no dropdown, igual ao Omie)
  primary key (conta_omie, codigo)
);
alter table cenario_fiscal add column if not exists segmentos text;
