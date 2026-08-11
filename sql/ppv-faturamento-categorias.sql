-- =============================================================================
-- FATURAMENTO DO PPV (NF-e) — categorias gerenciáveis + estado do faturamento
--
-- O PPV cria o Pedido de Venda no Omie na etapa "10" (não faturado). Faturar
-- pelo portal = avançar o pedido pra etapa "50" (TrocarEtapaPedido), o que emite
-- a NF-e. Antes de faturar, o usuário escolhe a CATEGORIA (regra fiscal) num
-- dropdown alimentado por esta tabela, que espelha as categorias do Omie e pode
-- ser gerenciada no portal.
--
-- Rodar UMA vez no Supabase (SQL editor). Idempotente.
-- =============================================================================

-- Categorias de faturamento por empresa (espelha o Omie, editável no portal).
CREATE TABLE IF NOT EXISTS ppv_faturamento_categorias (
  codigo      text NOT NULL,                 -- ex.: "1.01.03"
  empresa     text NOT NULL,                 -- 'Nova Tratores' | 'Castro Peças'
  descricao   text,                          -- ex.: "10. @Revenda de Peças Balcão"
  ativo       boolean NOT NULL DEFAULT true, -- aparece no dropdown?
  ordem       int NOT NULL DEFAULT 0,        -- ordenação no dropdown
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (codigo, empresa)
);

-- Leitura liberada pra usuários logados (o dropdown lê direto); ESCRITA só via
-- service role (as rotas /api/ppv/faturamento-categorias) — sem policy de
-- INSERT/UPDATE/DELETE, o cliente não consegue gravar.
ALTER TABLE ppv_faturamento_categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppv_fat_cat_sel ON ppv_faturamento_categorias;
CREATE POLICY ppv_fat_cat_sel ON ppv_faturamento_categorias
  FOR SELECT TO authenticated USING (true);

-- Estado do faturamento no próprio pedido do PPV (anti-duplicidade + histórico).
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS faturado_omie_em     timestamptz;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS nf_numero            text;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS categoria_faturamento text;
-- Conta Omie usada no envio (Nova Tratores | Castro Peças) — evita re-descobrir
-- a empresa na hora de faturar. Pedidos antigos ficam NULL (há fallback no código).
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS omie_empresa         text;
