-- =====================================================================
-- MARCA "OK / CONFERIDO" DE PRODUTO (caracteristicas_ok)
-- Rodar manualmente no SQL Editor do Supabase.
--
-- Par positivo da sinalização: marca um PRODUTO (linha inteira) como conferido/OK
-- na tela /ajustes/caracteristicas. É COMPARTILHADA: quem marca, todos veem.
-- Excludente com a pendência: marcar OK apaga as sinalizações do produto e vice-versa
-- (regra aplicada nas rotas /ok e /sinalizar via service role).
--
-- Acesso: leitura via RLS para qualquer autenticado (todos veem);
-- escrita SÓ via /api/ajustes/caracteristicas/ok (service role).
-- =====================================================================

CREATE TABLE IF NOT EXISTS caracteristicas_ok (
  empresa        TEXT NOT NULL,           -- conta_omie: 'NOVA' / 'CASTRO'
  codigo_produto TEXT NOT NULL,           -- ID interno Omie (string)
  conferido_por  UUID,                    -- auth.users id (quem conferiu)
  conferido_nome TEXT,                    -- nome legível (financeiro_usu)
  conferido_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, codigo_produto)
);

ALTER TABLE caracteristicas_ok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caracteristicas_ok_select ON caracteristicas_ok;
CREATE POLICY caracteristicas_ok_select ON caracteristicas_ok
  FOR SELECT TO authenticated
  USING (true);   -- compartilhada: todos os autenticados veem

-- Sem policies de INSERT/UPDATE/DELETE: mutações só pelo service role.
