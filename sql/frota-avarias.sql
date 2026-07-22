-- =============================================================================
-- FROTA — AVARIAS / DANOS DE VEÍCULO atribuíveis a um motorista.
-- Rodar no SQL Editor do Supabase COMPARTILHADO (o mesmo do Portal).
--
-- Registro manual (não vem de rastreador): batida, mau uso, dano no pátio…
-- O dado vive AQUI (Frota); a cobrança tem fim no RH — o app do RH lê esta
-- tabela (fila "Avarias da frota" em Descontos), anexa como desconto na folha
-- e espelha o status de volta (mesmo desenho das multas):
--   aberta      -> registrada, aguardando decisão do RH
--   descontada  -> virou desconto na folha (RH)
--   cobrada     -> funcionário pagou por fora
--   absorvida   -> empresa absorveu o prejuízo
--   cancelada   -> registro errado
-- rh_funcionario_id = id em rh_funcionarios (Supabase do RH) — só vínculo,
-- nada do RH vive aqui.
-- =============================================================================

CREATE TABLE IF NOT EXISTS frota_avarias (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id        UUID REFERENCES frota_veiculos(id),
  placa             TEXT NOT NULL,
  data              DATE NOT NULL,
  descricao         TEXT NOT NULL,
  valor             NUMERIC(12,2) NOT NULL DEFAULT 0,     -- prejuízo/custo do conserto
  motorista_id      UUID REFERENCES frota_motoristas(id),
  motorista_nome    TEXT,
  rh_funcionario_id UUID,
  status            TEXT NOT NULL DEFAULT 'aberta'
                    CHECK (status IN ('aberta','descontada','cobrada','absorvida','cancelada')),
  obs               TEXT,
  criado_por        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frota_avarias_veic ON frota_avarias(veiculo_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_frota_avarias_mot  ON frota_avarias(motorista_id);
CREATE INDEX IF NOT EXISTS idx_frota_avarias_rh   ON frota_avarias(rh_funcionario_id);

DROP TRIGGER IF EXISTS trg_frota_avarias_touch ON frota_avarias;
CREATE TRIGGER trg_frota_avarias_touch BEFORE UPDATE ON frota_avarias
  FOR EACH ROW EXECUTE FUNCTION frota_touch();

-- RLS padrão P1 do módulo: leitura só autenticado; escrita SÓ via /api (service role)
ALTER TABLE frota_avarias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS frota_avarias_select ON frota_avarias;
CREATE POLICY frota_avarias_select ON frota_avarias
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON frota_avarias FROM anon;
GRANT SELECT ON frota_avarias TO authenticated;

NOTIFY pgrst, 'reload schema';
