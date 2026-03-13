-- =============================================
-- SQL para rodar no Supabase SQL Editor
-- Projeto: citrhumdkfivdzbmayde
-- =============================================

-- Tabela de logs de acesso ao portal
CREATE TABLE IF NOT EXISTS portal_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_nome TEXT,
  sistema TEXT NOT NULL,
  acao TEXT NOT NULL DEFAULT 'acesso',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index para busca rápida por usuário
CREATE INDEX IF NOT EXISTS idx_portal_logs_user_id ON portal_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_portal_logs_created_at ON portal_logs(created_at DESC);

-- RLS (Row Level Security)
ALTER TABLE portal_logs ENABLE ROW LEVEL SECURITY;

-- Política: usuários podem ver seus próprios logs
CREATE POLICY "Users can view own logs"
  ON portal_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Política: usuários podem inserir seus próprios logs
CREATE POLICY "Users can insert own logs"
  ON portal_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: diretoria pode ver todos os logs
CREATE POLICY "Diretoria can view all logs"
  ON portal_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM financeiro_usu
      WHERE id = auth.uid() AND funcao = 'Diretoria'
    )
  );
