-- Resumo diário do técnico (dados GPS + manual)
CREATE TABLE IF NOT EXISTS resumo_diario_tecnico (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  tecnico_nome TEXT NOT NULL,
  horas_dirigindo NUMERIC DEFAULT 0,       -- horas dirigindo (ignição ligada + velocidade > 0)
  km_percorrido NUMERIC DEFAULT 0,          -- km total percorrido no dia
  horas_no_cliente NUMERIC DEFAULT 0,       -- horas trabalhando no cliente
  resumo TEXT DEFAULT '',                    -- resumo texto livre
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(data, tecnico_nome)
);
