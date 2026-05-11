-- Tabela de avisos/comunicados do portal
CREATE TABLE IF NOT EXISTS portal_avisos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  prioridade TEXT NOT NULL DEFAULT 'normal', -- 'baixa', 'normal', 'alta', 'urgente'
  criado_por UUID REFERENCES auth.users(id),
  criado_por_nome TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Anexos dos avisos
CREATE TABLE IF NOT EXISTS portal_avisos_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aviso_id UUID NOT NULL REFERENCES portal_avisos(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  url TEXT NOT NULL,
  tipo TEXT, -- mime type
  tamanho BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Controle de leitura (quem já viu o aviso)
CREATE TABLE IF NOT EXISTS portal_avisos_lidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aviso_id UUID NOT NULL REFERENCES portal_avisos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  lido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(aviso_id, user_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_avisos_ativo ON portal_avisos(ativo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avisos_anexos_aviso ON portal_avisos_anexos(aviso_id);
CREATE INDEX IF NOT EXISTS idx_avisos_lidos_user ON portal_avisos_lidos(user_id, aviso_id);

-- RLS
ALTER TABLE portal_avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_avisos_anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_avisos_lidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos podem ler avisos ativos" ON portal_avisos FOR SELECT USING (true);
CREATE POLICY "Admins podem inserir avisos" ON portal_avisos FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins podem atualizar avisos" ON portal_avisos FOR UPDATE USING (true);

CREATE POLICY "Todos podem ver anexos" ON portal_avisos_anexos FOR SELECT USING (true);
CREATE POLICY "Admins podem inserir anexos" ON portal_avisos_anexos FOR INSERT WITH CHECK (true);

CREATE POLICY "Todos podem marcar lido" ON portal_avisos_lidos FOR SELECT USING (true);
CREATE POLICY "Usuarios marcam seus lidos" ON portal_avisos_lidos FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE portal_avisos;
