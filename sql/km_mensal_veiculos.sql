-- Tabela para registrar KM do odometro de cada veiculo no inicio e fim de cada mes
CREATE TABLE IF NOT EXISTS km_mensal_veiculos (
  id SERIAL PRIMARY KEY,
  mes TEXT NOT NULL,              -- formato: "2026-05"
  placa TEXT NOT NULL,
  descricao TEXT DEFAULT '',      -- ex: "SAVEIRO", "MONTANA"
  km_inicio NUMERIC DEFAULT 0,   -- odometro no primeiro dia do mes
  km_fim NUMERIC DEFAULT 0,      -- odometro no ultimo dia do mes
  atualizado_por TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mes, placa)
);

-- Habilitar RLS
ALTER TABLE km_mensal_veiculos ENABLE ROW LEVEL SECURITY;

-- Policy para leitura e escrita (todos os usuarios autenticados)
CREATE POLICY "Todos podem ler km_mensal" ON km_mensal_veiculos FOR SELECT USING (true);
CREATE POLICY "Todos podem inserir km_mensal" ON km_mensal_veiculos FOR INSERT WITH CHECK (true);
CREATE POLICY "Todos podem atualizar km_mensal" ON km_mensal_veiculos FOR UPDATE USING (true);
