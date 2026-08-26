-- =============================================================================
-- CRM de Oportunidades (aba RFM do módulo /estoque/inteligencia-comercial).
-- O vendedor contata clientes que já compraram um produto "na hora de vender" e
-- registra o desfecho (Vendeu / Não vendeu / Sem resposta), com motivo pré-definido
-- (obrigatório em "Não vendeu") e observação. Log APPEND-ONLY, com autor e data.
--
-- Modelo de acesso (igual a create-tickets.sql): RLS LIGADA, SEM policies —
-- leitura e escrita SÓ via /api/estoque/inteligencia-comercial/* com service role
-- (o client `supabase` do módulo Estoque já usa a service role key). anon/
-- authenticated não leem/escrevem direto.
--
-- Chave natural de um contato: (codigo_produto, codigo_cliente, conta_omie).
-- "Status atual" de um par produto×cliente = o registro mais recente (created_at).
-- =============================================================================

-- Motivos pré-definidos (tabela de domínio; editável depois via ativo=false).
CREATE TABLE IF NOT EXISTS oportunidade_motivo (
  id     SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome   TEXT NOT NULL UNIQUE,
  ativo  BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO oportunidade_motivo (nome) VALUES
  ('Sem interesse no momento'),
  ('Preço / achou caro'),
  ('Comprou de concorrente'),
  ('Sem verba / crédito'),
  ('Já comprou recentemente'),
  ('Não usa mais o equipamento'),
  ('Vai comprar depois (retornar)'),
  ('Sem resposta / não atende'),
  ('Outro')
ON CONFLICT (nome) DO NOTHING;

-- Registro append-only de contatos.
CREATE TABLE IF NOT EXISTS oportunidade_contatos (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_produto    TEXT NOT NULL,
  sku               TEXT,
  descricao_produto TEXT,
  codigo_cliente    TEXT NOT NULL,
  conta_omie        TEXT NOT NULL DEFAULT '',
  cliente_nome      TEXT,
  resultado         TEXT NOT NULL CHECK (resultado IN ('vendeu','nao_vendeu','sem_resposta')),
  motivo_id         SMALLINT REFERENCES oportunidade_motivo(id),
  observacao        TEXT,
  autor_id          TEXT,
  autor_nome        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oport_contatos_produto ON oportunidade_contatos (codigo_produto, conta_omie);
CREATE INDEX IF NOT EXISTS idx_oport_contatos_cliente ON oportunidade_contatos (codigo_cliente, conta_omie);

ALTER TABLE oportunidade_motivo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE oportunidade_contatos ENABLE ROW LEVEL SECURITY;
-- (sem policies: acesso exclusivo via service role nas rotas /api/*)

-- Verificação rápida (só leitura):
--   SELECT count(*) FROM oportunidade_motivo;   -- deve ser 9
--   SELECT * FROM oportunidade_contatos ORDER BY created_at DESC LIMIT 5;
