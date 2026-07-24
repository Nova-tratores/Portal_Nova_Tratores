-- =====================================================================
-- OCORRÊNCIAS v2 — categorias, subcategorias, pontos de catálogo,
-- anexos, automações e vínculo com o RH.
-- Rodar no SQL Editor do Supabase COMPARTILHADO (o mesmo do Portal).
--
-- Aditivo e retrocompatível: linhas antigas viram categoria='legado'
-- automaticamente (default), nenhuma tela atual quebra. A coluna `tipo`
-- CONTINUA sendo gravada nos inserts novos (tipoLegado ?? subcategoria)
-- — a fila de atrasos do RH filtra tipo='atraso' e segue funcionando.
-- O catálogo (categorias/subcategorias/pontos) vive em
-- src/lib/ocorrencias/catalogo.ts — os pontos NÃO são mais digitados.
-- =====================================================================

-- ── tecnico_ocorrencias ──────────────────────────────────────────────
ALTER TABLE tecnico_ocorrencias
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'legado'
    CHECK (categoria IN ('os', 'pv', 'rh', 'frota', 'legado')),
  ADD COLUMN IF NOT EXISTS subcategoria TEXT,
  -- [{url, tipo:'imagem'|'video', nome, tamanho}]
  ADD COLUMN IF NOT EXISTS anexos JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual'
    CHECK (origem IN ('manual', 'auto')),
  -- dedupe das automações (vel:{placa}:{data}, multa:{id}, req:{id}, consumo:{placa}:{data})
  ADD COLUMN IF NOT EXISTS auto_chave TEXT,
  -- payload estruturado das automações (lat/lng/maps_url/velocidade/valor…)
  ADD COLUMN IF NOT EXISTS detalhes JSONB NOT NULL DEFAULT '{}',
  -- de-para com rh_funcionarios.id (Supabase do RH) — preenchido pelo RH e
  -- propagado pelo motor nos inserts seguintes do mesmo técnico
  ADD COLUMN IF NOT EXISTS rh_funcionario_id TEXT,
  -- auditoria: nome de quem lançou (ou 'sistema' nas automáticas)
  ADD COLUMN IF NOT EXISTS criado_por TEXT;

-- Índice ÚNICO CHEIO (sem WHERE): o upsert do PostgREST gera
-- ON CONFLICT (auto_chave) sem index_predicate, e o Postgres não infere
-- índice parcial nesse caso (42P10). NULLs múltiplos não conflitam em
-- índice único, então as ocorrências manuais (auto_chave NULL) passam.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tec_oc_auto_chave
  ON tecnico_ocorrencias(auto_chave);
CREATE INDEX IF NOT EXISTS idx_tec_oc_tecnico_data
  ON tecnico_ocorrencias(tecnico_nome, data DESC);
CREATE INDEX IF NOT EXISTS idx_tec_oc_categoria ON tecnico_ocorrencias(categoria);
CREATE INDEX IF NOT EXISTS idx_tec_oc_rh ON tecnico_ocorrencias(rh_funcionario_id)
  WHERE rh_funcionario_id IS NOT NULL;

-- ── tecnico_justificativas ───────────────────────────────────────────
ALTER TABLE tecnico_justificativas
  ADD COLUMN IF NOT EXISTS anexos JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_tec_just_ocorrencia
  ON tecnico_justificativas(id_ocorrencia);

-- RLS: mantido USING(true) nesta fase (paridade com o padrão do portal;
-- o app dos mecânicos escreve direto). Aperto planejado como fase futura.

NOTIFY pgrst, 'reload schema';
