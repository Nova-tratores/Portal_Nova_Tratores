-- =============================================
-- SISTEMA DE NOTIFICAÇÕES - Portal Nova Tratores
-- Rodar no SQL Editor do Supabase
-- =============================================

CREATE TABLE IF NOT EXISTS portal_notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'sistema',
  -- tipos: 'chat', 'financeiro', 'requisicao', 'revisao', 'pos', 'ppv', 'proposta', 'admin', 'sistema'
  titulo TEXT NOT NULL,
  descricao TEXT,
  link TEXT,
  icone TEXT,
  lida BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE portal_notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_notifications" ON portal_notificacoes
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Política extra para admins criarem notificações para outros
CREATE POLICY "authenticated_insert" ON portal_notificacoes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Índices
CREATE INDEX IF NOT EXISTS idx_notif_user ON portal_notificacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user_lida ON portal_notificacoes(user_id, lida);
CREATE INDEX IF NOT EXISTS idx_notif_created ON portal_notificacoes(created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE portal_notificacoes;
