-- Aplicação de figura por modelo (uma figura de fábrica serve VÁRIOS modelos).
-- Aditivo: nada existente quebra. O backfill copia o que já existe hoje
-- (1 linha por figura), então o comportamento atual continua idêntico.
--
-- Depois disto, a consulta de figuras por modelo passa a usar esta tabela,
-- e a Valtra entra SEM duplicar figura/peça (1.590 figuras em vez de ~8.450).

CREATE TABLE IF NOT EXISTS catalogo_figura_modelos (
  figura_id uuid NOT NULL REFERENCES catalogo_figuras(id) ON DELETE CASCADE,
  modelo    text NOT NULL,
  PRIMARY KEY (figura_id, modelo)
);

CREATE INDEX IF NOT EXISTS idx_cat_fig_mod_modelo ON catalogo_figura_modelos (modelo);
CREATE INDEX IF NOT EXISTS idx_cat_fig_mod_figura ON catalogo_figura_modelos (figura_id);

-- Backfill do catálogo atual: cada figura vale para o modelo que ela já tem.
INSERT INTO catalogo_figura_modelos (figura_id, modelo)
SELECT id, modelo FROM catalogo_figuras
WHERE modelo IS NOT NULL AND modelo <> ''
ON CONFLICT DO NOTHING;

-- Peça compartilhada: hoje catalogo_pecas.modelo é 1 valor. Para as peças de
-- figura compartilhada, o modelo efetivo vem da figura (via tabela acima), então
-- deixamos o modelo da peça opcional.
ALTER TABLE catalogo_pecas ALTER COLUMN modelo DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
