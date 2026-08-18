-- =====================================================================
-- MARCA "LOCALIZAÇÃO CONFERIDA" por PRODUTO (localizacao_conferida)
-- Rodar manualmente no SQL Editor do Supabase.
--
-- Estado próprio do "Conferir por posição" da tela /ajustes/localizacao —
-- SEPARADO do caracteristicas_ok ("características OK"). status: 'conferido' (✓)
-- ou 'divergente' (⚠ não bate). `posicao` = snapshot "prat|andar|caixa" no
-- momento da conferência (auditoria). COMPARTILHADA: quem confere, todos veem.
--
-- Acesso: leitura via RLS para qualquer autenticado; escrita SÓ via
-- /api/ajustes/localizacao/conferir (service role).
-- =====================================================================

CREATE TABLE IF NOT EXISTS localizacao_conferida (
  empresa        TEXT NOT NULL,           -- conta_omie: 'NOVA' / 'CASTRO'
  codigo_produto TEXT NOT NULL,           -- ID interno Omie (string)
  status         TEXT NOT NULL CHECK (status IN ('conferido','divergente')),
  posicao        TEXT,                    -- snapshot "prat|andar|caixa"
  conferido_por  UUID,
  conferido_nome TEXT,
  conferido_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, codigo_produto)
);

ALTER TABLE localizacao_conferida ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS localizacao_conferida_select ON localizacao_conferida;
CREATE POLICY localizacao_conferida_select ON localizacao_conferida
  FOR SELECT TO authenticated
  USING (true);   -- compartilhada: todos os autenticados veem

-- Sem policies de INSERT/UPDATE/DELETE: mutações só pelo service role.
