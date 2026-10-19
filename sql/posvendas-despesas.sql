-- Centro do Pós-Vendas: despesas completas (José, 16/10/2026). Pode rodar mais de uma vez.
--  - posvendas_gastos: tipo novo "materiais" (ferramenta, peça e material da oficina, terceiros fora
--    de OS) e a marca "aberto" (requisição que ainda não chegou ao financeiro — fica fora do total).
--  - posvendas_equipe: "extras" = comissão (RH, com encargos) e rescisão/acertos (Omie) por mês.
ALTER TABLE posvendas_gastos DROP CONSTRAINT IF EXISTS posvendas_gastos_tipo_check;
ALTER TABLE posvendas_gastos ADD CONSTRAINT posvendas_gastos_tipo_check
  CHECK (tipo IN ('abastecimento', 'manutencao', 'alimentacao', 'materiais'));
ALTER TABLE posvendas_gastos ADD COLUMN IF NOT EXISTS aberto boolean NOT NULL DEFAULT false;
ALTER TABLE posvendas_equipe ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '[]'::jsonb;
-- descontos dados em cada OS faturada (hora, km, geral, peças)
ALTER TABLE posvendas_os ADD COLUMN IF NOT EXISTS descontos jsonb;
-- OS internas FECHADAS (contrato Interno, Cortesia Oficina…): o que a oficina deixou de cobrar
CREATE TABLE IF NOT EXISTS posvendas_internas (
  os             text PRIMARY KEY,
  numero_omie    text,
  cliente        text,
  contrato       text,
  motivo         text,
  data           date NOT NULL,
  valor          numeric NOT NULL DEFAULT 0,
  horas          numeric NOT NULL DEFAULT 0,
  tecnicos       text[] NOT NULL DEFAULT '{}',
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posvendas_internas_data_idx ON posvendas_internas (data);
ALTER TABLE posvendas_internas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON posvendas_internas FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
