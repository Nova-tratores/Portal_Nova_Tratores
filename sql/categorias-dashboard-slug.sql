-- Cards de peça DINÂMICOS no /estoque/dashboard.
-- A tabela categorias_dashboard passa a guardar SÓ os 3 cards FIXOS
-- (Peças diversas, Filtros, Lubrificantes). Os demais cards são gerados em
-- runtime, um por `tipo` (característica) de peça com faturamento no período,
-- em ordem alfabética. A coluna `slug` é a identidade estável de cada fixo,
-- usada como chave dos drill-downs (fix:<slug>) e no upsert do /estoque/admin.
--
-- Idempotente: pode rodar mais de uma vez sem perder as edições do admin
-- (nome/palavras-chave). APLICAR ANTES do deploy do código.

ALTER TABLE categorias_dashboard ADD COLUMN IF NOT EXISTS slug text;

-- Remove as categorias antigas curadas (não têm slug).
DELETE FROM categorias_dashboard WHERE slug IS NULL;

-- Identidade única por slug (necessária para o upsert do admin).
ALTER TABLE categorias_dashboard DROP CONSTRAINT IF EXISTS categorias_dashboard_slug_uk;
ALTER TABLE categorias_dashboard ADD CONSTRAINT categorias_dashboard_slug_uk UNIQUE (slug);

-- Seed dos 3 fixos. Em re-execução, só reafirma a posição — preserva
-- nome/palavras-chave já editados no admin.
INSERT INTO categorias_dashboard (slug, posicao, nome, palavras_chave) VALUES
  ('pecas_diversas', 1, 'Peças diversas', ''),
  ('filtros',        2, 'Filtros',        'filtro,filtros'),
  ('lubrificantes',  3, 'Lubrificantes',  'lubrificante,lubrificantes,oleo,graxa')
ON CONFLICT (slug) DO UPDATE SET posicao = EXCLUDED.posicao;
