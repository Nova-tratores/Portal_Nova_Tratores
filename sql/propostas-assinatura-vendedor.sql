-- =====================================================================
-- Nova Tratores — /propostas: bloco de assinatura do PDF por VENDEDOR
-- Data: 2026-09-11
--
-- Até aqui o rodapé do PDF da proposta (EditModal.jsx) colava UMA imagem
-- fixa (Configuracoes.assinatura_url, id 1) com assinatura + nome + fone +
-- CNPJ + IE + banco + endereço rasterizados. Não dependia do vendedor da
-- proposta, não era editável no portal e falhava em silêncio.
--
-- Agora:
--   vendedores.assinatura_url     PNG só com o risco (fundo transparente),
--                                 em equipamentos/assinaturas/{id}.png
--   vendedores.carimbo_nome       nome como sai no carimbo
--   vendedores.carimbo_cargo      ex.: "Departamento Comercial"
--   vendedores.carimbo_telefone   ex.: "(14) 9 9745-5617"
--   Configuracoes.razao_social / cnpj / ie / endereco / telefone
--                                 dados da EMPRESA (razão social + CNPJ vão
--                                 na coluna do vendedor; IE, endereço e
--                                 telefone vão pro rodapé da página).
--
-- Dados bancários NÃO entram (não existiam em coluna nenhuma — só na
-- imagem antiga). Se um dia forem necessários, criar coluna própria.
--
-- Configuracoes.assinatura_url fica por enquanto (TODO: remover quando
-- todos os vendedores ativos tiverem assinatura cadastrada).
--
-- RLS: vendedores e Configuracoes já são legíveis pela anon (conferido por
-- REST em 11/09/2026); a escrita nos campos novos passa pela API
-- /api/gestao-vendas/vendedores (service role). Nada muda aqui.
--
-- Idempotente. Rodar em transação, ANTES do deploy.
-- =====================================================================

BEGIN;

-- 1) Carimbo por vendedor
ALTER TABLE vendedores
  ADD COLUMN IF NOT EXISTS assinatura_url   text,
  ADD COLUMN IF NOT EXISTS carimbo_nome     text,
  ADD COLUMN IF NOT EXISTS carimbo_cargo    text,
  ADD COLUMN IF NOT EXISTS carimbo_telefone text;

COMMENT ON COLUMN vendedores.assinatura_url   IS 'PNG só com o risco da assinatura (fundo transparente), usado no PDF da proposta';
COMMENT ON COLUMN vendedores.carimbo_nome     IS 'Nome como aparece no carimbo do PDF da proposta';
COMMENT ON COLUMN vendedores.carimbo_cargo    IS 'Cargo/departamento no carimbo do PDF da proposta';
COMMENT ON COLUMN vendedores.carimbo_telefone IS 'Telefone no carimbo do PDF da proposta';

-- 2) Dados da empresa (tabela Configuracoes tem 1 linha, id = 1)
ALTER TABLE "Configuracoes"
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS cnpj         text,
  ADD COLUMN IF NOT EXISTS ie           text,
  ADD COLUMN IF NOT EXISTS endereco     text,
  ADD COLUMN IF NOT EXISTS telefone     text;

-- 3) Seed: dados que estavam gravados na imagem antiga (Assinatura Fernando.png)
UPDATE "Configuracoes" SET
  razao_social = COALESCE(razao_social, 'Nova Tratores Máquinas Agrícolas'),
  cnpj         = COALESCE(cnpj,         '31.463.139/0001-03'),
  ie           = COALESCE(ie,           '537.054.605.110'),
  endereco     = COALESCE(endereco,     'Av. São Sebastião, 1065 - Jd Ana Cristina, Piraju - SP, 18800-770'),
  telefone     = COALESCE(telefone,     '(14) 9 9745-5617')
WHERE id = 1;

-- Carimbo do Joaquim Fernando (vendedores.id = 3), o único que tinha assinatura
-- no sistema antigo. assinatura_url fica NULL de propósito: o PNG antigo tem o
-- carimbo inteiro rasterizado — precisa subir um PNG só com o risco pela tela
-- de Gestão de Vendas → Ajustes por Venda → Vendedores → Carimbo.
UPDATE vendedores SET
  carimbo_nome     = COALESCE(carimbo_nome,     'Joaquim Fernando'),
  carimbo_cargo    = COALESCE(carimbo_cargo,    'Departamento Comercial'),
  carimbo_telefone = COALESCE(carimbo_telefone, '(14) 9 9745-5617')
WHERE id = 3;

-- 4) PostgREST enxergar as colunas novas sem esperar o cache
NOTIFY pgrst, 'reload schema';

COMMIT;
