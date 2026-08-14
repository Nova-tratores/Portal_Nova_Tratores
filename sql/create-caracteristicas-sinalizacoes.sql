-- =====================================================================
-- SINALIZAÇÃO DE CARACTERÍSTICAS (caracteristicas_sinalizacoes)
-- Rodar manualmente no SQL Editor do Supabase.
--
-- Marcação operacional de "pendência" por CÉLULA (produto × característica)
-- na tela /ajustes/caracteristicas. É COMPARTILHADA: quem sinaliza, todos veem.
-- Ex.: sinalizar que o #PRATELEIRA de um produto precisa de conferência.
--
-- Acesso: leitura via RLS para qualquer autenticado (todos veem);
-- escrita SÓ via /api/ajustes/caracteristicas/sinalizar (service role).
-- =====================================================================

CREATE TABLE IF NOT EXISTS caracteristicas_sinalizacoes (
  empresa         TEXT NOT NULL,           -- conta_omie: 'NOVA' / 'CASTRO'
  codigo_produto  TEXT NOT NULL,           -- ID interno Omie (string)
  coluna          TEXT NOT NULL,           -- chave da característica, ex.: '#PRATELEIRA'
  sinalizado_por  UUID,                    -- auth.users id (quem marcou)
  sinalizado_nome TEXT,                    -- nome legível (financeiro_usu)
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, codigo_produto, coluna)
);

ALTER TABLE caracteristicas_sinalizacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caracteristicas_sinalizacoes_select ON caracteristicas_sinalizacoes;
CREATE POLICY caracteristicas_sinalizacoes_select ON caracteristicas_sinalizacoes
  FOR SELECT TO authenticated
  USING (true);   -- compartilhada: todos os autenticados veem

-- Sem policies de INSERT/UPDATE/DELETE: mutações só pelo service role.
