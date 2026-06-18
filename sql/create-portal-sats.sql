-- ════════════════════════════════════════════════════════════════════
-- SAT Digital — Solicitação de Atendimento Técnico
-- Qualquer um abre um SAT (cliente + tipo + prazo); o Pós-Vendas vê em
-- cards flutuantes e controla num Kanban (Aberto → Em andamento → Concluído).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS portal_sats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nome TEXT NOT NULL,
  cliente_endereco TEXT,
  cliente_cnpj TEXT,
  tipo TEXT NOT NULL,                 -- 'manutencao' | 'revisao' | 'entrega' | 'orcamento'
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'aberto', -- 'aberto' | 'andamento' | 'concluido' | 'cancelado'
  data_limite DATE,
  criado_por UUID,
  criado_por_nome TEXT,
  concluido_por UUID,
  concluido_por_nome TEXT,
  concluido_at TIMESTAMPTZ,
  cancelado_por_nome TEXT,
  cancelado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sats_status ON portal_sats(status, created_at DESC);

-- Conclusão "1º vence": só conclui se ainda estiver aberto/andamento
CREATE OR REPLACE FUNCTION concluir_sat(
  p_id UUID, p_user_id UUID, p_user_nome TEXT
)
RETURNS TABLE (concluido_por_nome TEXT, concluido_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE portal_sats
  SET status = 'concluido', concluido_por = p_user_id,
      concluido_por_nome = p_user_nome, concluido_at = now()
  WHERE id = p_id AND status IN ('aberto', 'andamento')
  RETURNING concluido_por_nome, concluido_at;
$$;

-- RLS permissiva (padrão dos módulos portal_*)
ALTER TABLE portal_sats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sats_select" ON portal_sats;
DROP POLICY IF EXISTS "sats_insert" ON portal_sats;
DROP POLICY IF EXISTS "sats_update" ON portal_sats;
CREATE POLICY "sats_select" ON portal_sats FOR SELECT USING (true);
CREATE POLICY "sats_insert" ON portal_sats FOR INSERT WITH CHECK (true);
CREATE POLICY "sats_update" ON portal_sats FOR UPDATE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE portal_sats;
