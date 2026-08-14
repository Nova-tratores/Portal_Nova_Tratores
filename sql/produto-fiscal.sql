-- ============================================================================
-- Fiscal por produto (tela "Item de Orçamento" do PPV)
-- Guarda o "perfil fiscal" de cada produto (ICMS/ICMS ST/IPI/PIS/COFINS + CFOP)
-- pra editar NO PORTAL, ANTES de enviar ao Omie. Rápido (sem bater no Omie ao
-- abrir). Na hora de enviar/faturar o portal aplica esses impostos no pedido.
--
-- Chave: (conta_omie, codigo_produto). conta_omie em MINÚSCULA (nova|castro),
-- igual à tabela `produtos`.
-- Rodar no Supabase (idempotente).
-- ============================================================================

create table if not exists produto_fiscal (
  conta_omie   text   not null,
  codigo_produto bigint not null,
  codigo       text,
  cfop         text,

  -- ICMS
  icms_cst           text,
  icms_origem        text,
  icms_modalidade    text,
  icms_aliquota      numeric,
  icms_base          numeric,
  icms_perc_red_base numeric,

  -- ICMS ST
  icmsst_cst              text,
  icmsst_modalidade       text,
  icmsst_aliquota         numeric,
  icmsst_aliq_op_prop     numeric,
  icmsst_base             numeric,
  icmsst_margem           numeric,
  icmsst_perc_red_base_op numeric,
  icmsst_perc_red_base_st numeric,
  icmsst_cest             text,

  -- IPI
  ipi_cst           text,
  ipi_enquadramento text,
  ipi_aliquota      numeric,
  ipi_base          numeric,

  -- PIS
  pis_cst      text,
  pis_aliquota numeric,
  pis_base     numeric,

  -- COFINS
  cofins_cst      text,
  cofins_aliquota numeric,
  cofins_base     numeric,

  atualizado_em  timestamptz default now(),
  atualizado_por text,

  primary key (conta_omie, codigo_produto)
);
