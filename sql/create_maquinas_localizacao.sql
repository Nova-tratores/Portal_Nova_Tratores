-- Tabela para armazenar a localização individual de cada máquina
-- Por padrão herda a coordenada do cliente, mas pode ser movida para outro local
CREATE TABLE IF NOT EXISTS maquinas_localizacao (
  id SERIAL PRIMARY KEY,
  nome_maquina TEXT NOT NULL,
  cnpj_cliente TEXT DEFAULT '',
  nome_cliente TEXT DEFAULT '',
  coordenadas JSONB, -- { lat: number, lng: number } — null = usa coordenada do cliente
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_maquinas_loc_unique
  ON maquinas_localizacao (nome_maquina, COALESCE(cnpj_cliente, ''));

CREATE INDEX IF NOT EXISTS idx_maquinas_loc_cnpj ON maquinas_localizacao (cnpj_cliente);
