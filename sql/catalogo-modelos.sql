-- Catálogo multi-trator: cada figura/peça pertence a um modelo (trator)
ALTER TABLE catalogo_figuras ADD COLUMN IF NOT EXISTS modelo TEXT;
ALTER TABLE catalogo_pecas   ADD COLUMN IF NOT EXISTS modelo TEXT;

-- Tratores (modelos)
CREATE TABLE IF NOT EXISTS catalogo_modelos (
  slug          TEXT PRIMARY KEY,        -- ex: jivo-2025
  nome          TEXT NOT NULL,           -- ex: Jivo 2025
  image_url     TEXT,
  ordem         INT DEFAULT 0,
  root_id       TEXT,                    -- id do catálogo no zeitten
  business_unit TEXT,
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

-- Retrofit: o que já está importado é o Jivo 2025
UPDATE catalogo_figuras SET modelo = 'Jivo 2025' WHERE modelo IS NULL;
UPDATE catalogo_pecas p SET modelo = f.modelo FROM catalogo_figuras f WHERE p.figura_id = f.id AND p.modelo IS NULL;

INSERT INTO catalogo_modelos (slug, nome, image_url, ordem, root_id, business_unit)
VALUES ('jivo-2025', 'Jivo 2025',
  'https://citrhumdkfivdzbmayde.supabase.co/storage/v1/object/public/catalogo/modelo/jivo.jpg',
  0, '5c967b69-31d8-4b16-99e8-f0622e7ab094', '31463139000103')
ON CONFLICT (slug) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_cat_figuras_modelo ON catalogo_figuras(modelo);
CREATE INDEX IF NOT EXISTS idx_cat_pecas_modelo   ON catalogo_pecas(modelo);

NOTIFY pgrst, 'reload schema';
