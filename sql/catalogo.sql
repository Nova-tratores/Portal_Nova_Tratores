-- Catálogo de peças (Jivo/Mahindra) importado do zeitten.com
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Figuras (vistas explodidas)
CREATE TABLE IF NOT EXISTS catalogo_figuras (
  id           TEXT PRIMARY KEY,           -- id do componente no zeitten
  code         TEXT,                       -- FIG_03 / código do conjunto
  name         TEXT NOT NULL,
  secao        TEXT,                        -- Motor, Transmissão, ...
  secao_ordem  INT DEFAULT 0,
  ordem        INT DEFAULT 0,
  image_url    TEXT,                        -- imagem no nosso storage
  thumb_url    TEXT,
  hotspots     JSONB DEFAULT '[]'::jsonb,   -- [{reference,x,y}] posições no desenho
  path         JSONB DEFAULT '[]'::jsonb,
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

-- Peças (itens de cada figura)
CREATE TABLE IF NOT EXISTS catalogo_pecas (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- a mesma peça aparece em várias figuras
  figura_id  TEXT REFERENCES catalogo_figuras(id) ON DELETE CASCADE,
  code       TEXT,                          -- código de pedido (== código no Omie)
  name       TEXT NOT NULL,
  reference  TEXT,                          -- número da bolinha no desenho
  qtd        NUMERIC,
  unit       TEXT,
  compravel  BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_cat_pecas_figura     ON catalogo_pecas(figura_id);
CREATE INDEX IF NOT EXISTS idx_cat_pecas_code       ON catalogo_pecas(code);
CREATE INDEX IF NOT EXISTS idx_cat_pecas_name_trgm  ON catalogo_pecas USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cat_pecas_code_trgm  ON catalogo_pecas USING gin (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cat_figuras_secao    ON catalogo_figuras(secao);
CREATE INDEX IF NOT EXISTS idx_cat_figuras_name_trgm ON catalogo_figuras USING gin (name gin_trgm_ops);

NOTIFY pgrst, 'reload schema';
