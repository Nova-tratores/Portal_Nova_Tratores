-- =============================================
-- TABELA: portal_permissoes
-- Sistema de hierarquia e controle de acesso
-- =============================================

CREATE TABLE IF NOT EXISTS portal_permissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin BOOLEAN DEFAULT false,
  categoria TEXT DEFAULT '',
  modulos_permitidos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Categorias válidas: 'Pós Vendas', 'Peças', 'Comercial', 'Financeiro'
-- Módulos válidos: 'financeiro', 'requisicoes', 'revisoes', 'pos', 'ppv', 'propostas', 'atividades'

-- Index para busca rápida por user_id
CREATE INDEX IF NOT EXISTS idx_portal_permissoes_user_id ON portal_permissoes(user_id);

-- =============================================
-- SEED: Definir o primeiro admin
-- Substitua 'SEU_USER_ID_AQUI' pelo UUID do usuário que será admin
-- =============================================
-- INSERT INTO portal_permissoes (user_id, is_admin, categoria, modulos_permitidos)
-- VALUES ('SEU_USER_ID_AQUI', true, 'Financeiro', ARRAY['financeiro','requisicoes','revisoes','pos','ppv','propostas','atividades'])
-- ON CONFLICT (user_id) DO UPDATE SET is_admin = true, modulos_permitidos = ARRAY['financeiro','requisicoes','revisoes','pos','ppv','propostas','atividades'];
