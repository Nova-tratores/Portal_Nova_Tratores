-- Campos fiscais dos produtos no cache local (`produtos`), para a tela
-- /ajustes/omie-massa poder mostrar e editar em massa NCM / CEST / Origem
-- e as excecoes fiscais, sem 1 ConsultarProduto por linha.
--
-- Preenchidos pelo sync que JA existe (src/lib/estoque/produtos-sync.ts, cron
-- diario estoque-sync-produtos): o ListarProdutos ja devolve esses campos, o
-- codigo so os descartava. Zero chamada Omie a mais.
--
-- Onde cada valor mora no retorno da Omie (medido na conta NOVA, 22/07/2026):
--   ncm               -> ncm (topo)
--   tipo_item         -> tipoItem (topo)
--   cest              -> recomendacoes_fiscais.id_cest   (o `cest` de topo e SEMPRE vazio)
--   origem_mercadoria -> recomendacoes_fiscais.origem_mercadoria (`origem_imposto` e read-only)
--   o resto           -> campos de topo homonimos
--
-- NAO existe IPI aqui: "Situacao Tributaria do IPI" / "Tipo de Calculo do IPI"
-- vivem no Cenario Fiscal -> Tributacao por NCM, e a Omie nao expoe API para
-- isso (testados e 404: /geral/ncm/, /produtos/tributacaoncm/,
-- /geral/cenariofiscal/, /geral/tributacao/).
--
-- Idem `modalidade_icms`: so o ConsultarProduto devolve, o ListarProdutos nao —
-- por isso fica FORA do cache e e buscado sob demanda pela tela.

ALTER TABLE produtos ADD COLUMN IF NOT EXISTS ncm TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS cest TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS origem_mercadoria TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS tipo_item TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS cnpj_fabricante TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS indicador_escala TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS cupom_fiscal TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS ean TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS unidade TEXT;

-- ICMS (excecoes por produto; o padrao vem do Cenario Fiscal por NCM)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS cfop TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS cst_icms TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS csosn_icms TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS aliquota_icms NUMERIC;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS red_base_icms NUMERIC;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS motivo_deson_icms TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS per_icms_fcp NUMERIC;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS codigo_beneficio TEXT;

-- PIS / COFINS
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS cst_pis TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS aliquota_pis NUMERIC;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS red_base_pis NUMERIC;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS cst_cofins TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS aliquota_cofins NUMERIC;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS red_base_cofins NUMERIC;

-- Reforma Tributaria (IBS/CBS)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS cst_ibs_cbs TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS class_trib TEXT;

-- Quando o sync preencheu os campos acima pela ultima vez.
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS fiscal_atualizado_em TIMESTAMPTZ;

-- A tela agrupa por NCM (e onde a tributacao real mora) e filtra por conta.
CREATE INDEX IF NOT EXISTS produtos_conta_ncm_idx ON produtos (conta_omie, ncm);
