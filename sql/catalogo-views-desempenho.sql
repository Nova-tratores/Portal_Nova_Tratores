-- Desempenho do catálogo.
--
-- A tela de modelos fazia UMA contagem de figuras POR MODELO (76 consultas, ~0,47s
-- cada) e a de seções puxava todas as figuras do modelo só pra contar e pegar uma
-- miniatura. Estas views agregam no banco: 76 consultas viram 1.
--
-- São views comuns (sem materialização): sempre refletem o dado atual, sem refresh.

-- Figuras por modelo (usa a tabela de aplicação — figura compartilhada conta em cada modelo).
CREATE OR REPLACE VIEW vw_catalogo_modelo_figuras AS
SELECT modelo, count(*)::int AS figuras
FROM catalogo_figura_modelos
GROUP BY modelo;

-- Seções por modelo, já com a contagem e a miniatura da 1ª figura da seção.
CREATE OR REPLACE VIEW vw_catalogo_secoes AS
SELECT
  fm.modelo,
  f.secao,
  min(coalesce(f.secao_ordem, 99))::int                                   AS ordem,
  count(*)::int                                                            AS figuras,
  (array_agg(coalesce(f.image_url, f.thumb_url) ORDER BY f.ordem NULLS LAST))[1] AS thumb
FROM catalogo_figura_modelos fm
JOIN catalogo_figuras f ON f.id = fm.figura_id
GROUP BY fm.modelo, f.secao;

-- Índices que sustentam as agregações e o filtro por modelo.
CREATE INDEX IF NOT EXISTS idx_cat_fig_mod_modelo_figura ON catalogo_figura_modelos (modelo, figura_id);
CREATE INDEX IF NOT EXISTS idx_cat_pecas_figura ON catalogo_pecas (figura_id);

GRANT SELECT ON vw_catalogo_modelo_figuras TO anon, authenticated;
GRANT SELECT ON vw_catalogo_secoes TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
