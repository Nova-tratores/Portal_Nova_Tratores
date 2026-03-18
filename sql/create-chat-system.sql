-- =============================================
-- SISTEMA DE CHAT - Portal Nova Tratores
-- Rodar no SQL Editor do Supabase
-- =============================================

-- 1. CHATS (individuais e grupos)
CREATE TABLE IF NOT EXISTS portal_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL DEFAULT 'individual' CHECK (tipo IN ('individual', 'grupo')),
  nome TEXT,
  avatar_url TEXT,
  criado_por UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. MEMBROS DO CHAT
CREATE TABLE IF NOT EXISTS portal_chat_membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES portal_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'membro',
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(chat_id, user_id)
);

-- 3. MENSAGENS
CREATE TABLE IF NOT EXISTS portal_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES portal_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  conteudo TEXT,
  tipo TEXT DEFAULT 'texto' CHECK (tipo IN ('texto', 'imagem', 'video', 'audio', 'arquivo')),
  arquivo_url TEXT,
  arquivo_nome TEXT,
  arquivo_tamanho BIGINT,
  respondendo_a UUID REFERENCES portal_mensagens(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. CONTROLE DE LEITURA (última leitura por chat/user)
CREATE TABLE IF NOT EXISTS portal_chat_leitura (
  chat_id UUID NOT NULL REFERENCES portal_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ultima_leitura TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(chat_id, user_id)
);

-- =============================================
-- RLS (Row Level Security)
-- =============================================
ALTER TABLE portal_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_chat_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_chat_leitura ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full" ON portal_chats FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_full" ON portal_chat_membros FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_full" ON portal_mensagens FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_full" ON portal_chat_leitura FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- =============================================
-- ÍNDICES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_chat_membros_user ON portal_chat_membros(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_membros_chat ON portal_chat_membros(chat_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_chat ON portal_mensagens(chat_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_chat_created ON portal_mensagens(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_created ON portal_mensagens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_leitura_user ON portal_chat_leitura(user_id);

-- =============================================
-- REALTIME (necessário para mensagens em tempo real)
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE portal_mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE portal_chat_leitura;

-- =============================================
-- STORAGE (bucket para anexos do chat)
-- Caso falhe, crie manualmente no Dashboard do Supabase:
-- Storage > New Bucket > "chat-anexos" > Public
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-anexos', 'chat-anexos', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "auth_upload_chat" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chat-anexos' AND auth.role() = 'authenticated');

CREATE POLICY "auth_read_chat" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-anexos');

CREATE POLICY "auth_delete_chat" ON storage.objects
  FOR DELETE USING (bucket_id = 'chat-anexos' AND auth.role() = 'authenticated');
