-- ============================================================================
-- Recebimentos: reverter nota que JÁ TEM PAGAMENTO na Omie (13/11/2026).
-- Para reverter, a Omie exige cancelar os pagamentos antes. O portal guarda aqui
-- a "ficha da reversão" (contas a pagar antigas + cada pagamento com data, valor,
-- juros, multa, desconto, conta corrente e conciliação) para, depois que a nota
-- entrar de novo, relançar os mesmos pagamentos nas contas a pagar novas.
-- Idempotente. Rodar no SQL Editor. Sem ela: nota COM pagamento não pode ser
-- revertida pelo portal (a rota responde 503); nota sem pagamento segue igual.
-- ============================================================================
CREATE TABLE IF NOT EXISTS recebimento_reversoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_omie    text NOT NULL,                 -- MAIÚSCULA: NOVA / CASTRO
  id_receb      bigint NOT NULL,               -- = recebimentos_nfe.id_receb
  numero_nfe    text,
  fornecedor    text,
  valor_nfe     numeric,
  motivo        text,
  status        text NOT NULL DEFAULT 'revertendo'
                CHECK (status IN ('revertendo','aguardando_relancamento','relancada','parcial','concluida','falhou')),
  titulos_antes jsonb NOT NULL DEFAULT '[]',   -- contas a pagar da nota antes de reverter
  pagamentos    jsonb NOT NULL DEFAULT '[]',   -- um item por pagamento (dados + o que aconteceu com ele)
  erro          text,
  user_id       uuid,
  user_nome     text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  relancado_em  timestamptz,
  relancado_por text
);

CREATE INDEX IF NOT EXISTS idx_receb_reversoes_nota ON recebimento_reversoes (conta_omie, id_receb);
CREATE INDEX IF NOT EXISTS idx_receb_reversoes_status ON recebimento_reversoes (status);

ALTER TABLE recebimento_reversoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON recebimento_reversoes FROM anon, authenticated;
