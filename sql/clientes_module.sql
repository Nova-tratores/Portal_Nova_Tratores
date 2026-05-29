-- =============================================================
-- MÓDULO CLIENTES — Tabelas para sync Omie
-- Execute este SQL no Supabase SQL Editor antes de usar o módulo
-- =============================================================

-- 1. Clientes (multi-empresa)
CREATE TABLE IF NOT EXISTS clientes_omie (
  cod_cli BIGINT NOT NULL,
  empresa TEXT NOT NULL,
  razao_social TEXT,
  nome_fantasia TEXT,
  cnpj_cpf TEXT,
  email TEXT,
  telefone TEXT,
  cidade TEXT,
  estado TEXT,
  endereco TEXT,
  bairro TEXT,
  cep TEXT,
  inscricao_estadual TEXT,
  inativo TEXT DEFAULT 'N',
  tags TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cod_cli, empresa)
);

-- 2. OS por cliente (dados vindos do Omie)
CREATE TABLE IF NOT EXISTS clientes_os (
  num_os TEXT NOT NULL,
  cod_os BIGINT,
  empresa TEXT NOT NULL,
  cod_cli BIGINT,
  cliente_nome TEXT,
  etapa TEXT,
  data_previsao DATE,
  data_inclusao DATE,
  data_faturamento DATE,
  valor_total NUMERIC DEFAULT 0,
  status TEXT,
  cancelada BOOLEAN DEFAULT FALSE,
  faturada BOOLEAN DEFAULT FALSE,
  num_pedido_cli TEXT,
  vendedor TEXT,
  cod_vendedor BIGINT,
  cidade TEXT,
  contrato TEXT,
  projeto TEXT,
  num_nf TEXT,
  link_nf TEXT,
  descricao TEXT,
  servicos JSONB DEFAULT '[]',
  obs TEXT,
  dados_adic TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (num_os, empresa)
);

CREATE INDEX IF NOT EXISTS idx_clientes_os_cli ON clientes_os (cod_cli, empresa);
CREATE INDEX IF NOT EXISTS idx_clientes_os_pedido ON clientes_os (num_pedido_cli, empresa);

-- 3. Pedidos de Venda por cliente
CREATE TABLE IF NOT EXISTS clientes_pv (
  num_pedido TEXT NOT NULL,
  cod_pedido BIGINT,
  empresa TEXT NOT NULL,
  cod_cli BIGINT,
  cliente_nome TEXT,
  data_previsao DATE,
  data_inclusao DATE,
  etapa TEXT,
  valor_total NUMERIC DEFAULT 0,
  cancelado BOOLEAN DEFAULT FALSE,
  faturado BOOLEAN DEFAULT FALSE,
  numero_nf TEXT,
  link_nf TEXT,
  itens JSONB DEFAULT '[]',
  observacoes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (num_pedido, empresa)
);

CREATE INDEX IF NOT EXISTS idx_clientes_pv_cli ON clientes_pv (cod_cli, empresa);

-- Habilitar RLS (ajuste conforme necessário)
ALTER TABLE clientes_omie ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_os ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_pv ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas (service role e anon para leitura)
CREATE POLICY "clientes_omie_all" ON clientes_omie FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "clientes_os_all" ON clientes_os FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "clientes_pv_all" ON clientes_pv FOR ALL USING (true) WITH CHECK (true);
