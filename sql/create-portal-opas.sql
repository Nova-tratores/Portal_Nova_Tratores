-- ════════════════════════════════════════════════════════════════════
-- Módulo "Opa" — ocorrências/lembretes compartilhados Portal + App Mecânicos
-- Qualquer um cria um Opa (título, descrição, fotos/vídeos); aparece para
-- todos como lembrete flutuante até alguém clicar "Resolvido" (1º vence).
-- ════════════════════════════════════════════════════════════════════

-- Tabela principal de Opas
CREATE TABLE IF NOT EXISTS portal_opas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  criado_por UUID,
  criado_por_nome TEXT,
  origem TEXT NOT NULL DEFAULT 'portal',      -- 'portal' | 'mecanico'
  status TEXT NOT NULL DEFAULT 'aberto',       -- 'aberto' | 'resolvido'
  resolvido_por UUID,
  resolvido_por_nome TEXT,
  resolvido_por_tipo TEXT,                      -- 'portal' | 'tecnico'
  resolvido_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Anexos (fotos/vídeos) do Opa
CREATE TABLE IF NOT EXISTS portal_opas_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opa_id UUID NOT NULL REFERENCES portal_opas(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  url TEXT NOT NULL,
  tipo TEXT,        -- mime type (image/* ou video/*)
  tamanho BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quem visualizou o Opa (registrado ao abrir/clicar)
CREATE TABLE IF NOT EXISTS portal_opas_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opa_id UUID NOT NULL REFERENCES portal_opas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_nome TEXT,
  visto_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(opa_id, user_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_opas_status ON portal_opas(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opas_resolvido ON portal_opas(resolvido_por_tipo, resolvido_at DESC);
CREATE INDEX IF NOT EXISTS idx_opas_anexos_opa ON portal_opas_anexos(opa_id);
CREATE INDEX IF NOT EXISTS idx_opas_views_opa ON portal_opas_views(opa_id);

-- ════════════════════════════════════════════════════════════════════
-- Função "1º vence": só resolve se ainda estiver aberto, de forma atômica.
-- Retorna a linha resolvida quando ESTE chamador venceu; vazio caso já
-- estivesse resolvido (o front recarrega e mostra quem resolveu).
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION resolver_opa(
  p_opa_id UUID,
  p_user_id UUID,
  p_user_nome TEXT,
  p_user_tipo TEXT
)
RETURNS TABLE (resolvido_por_nome TEXT, resolvido_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE portal_opas
  SET status = 'resolvido',
      resolvido_por = p_user_id,
      resolvido_por_nome = p_user_nome,
      resolvido_por_tipo = p_user_tipo,
      resolvido_at = now()
  WHERE id = p_opa_id AND status = 'aberto'
  RETURNING resolvido_por_nome, resolvido_at;
$$;

-- ════════════════════════════════════════════════════════════════════
-- RLS (padrão permissivo dos módulos portal_*, usando anon key)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE portal_opas ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_opas_anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_opas_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos leem opas" ON portal_opas FOR SELECT USING (true);
CREATE POLICY "Todos criam opas" ON portal_opas FOR INSERT WITH CHECK (true);
CREATE POLICY "Todos atualizam opas" ON portal_opas FOR UPDATE USING (true);

CREATE POLICY "Todos veem anexos opa" ON portal_opas_anexos FOR SELECT USING (true);
CREATE POLICY "Todos inserem anexos opa" ON portal_opas_anexos FOR INSERT WITH CHECK (true);

CREATE POLICY "Todos veem views opa" ON portal_opas_views FOR SELECT USING (true);
CREATE POLICY "Todos registram view opa" ON portal_opas_views FOR INSERT WITH CHECK (true);

-- Realtime (cards flutuantes atualizam sozinhos ao criar/resolver)
ALTER PUBLICATION supabase_realtime ADD TABLE portal_opas;
