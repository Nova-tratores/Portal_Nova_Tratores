-- ============================================================================
-- POS — MODELOS FISCAIS DOS ITENS DE SERVIÇO (faturamento da OS pelo portal)
--
-- Depende de sql/pos-faturamento.sql (já aplicada). Sem esta migration a janela
-- de faturar funciona como antes, só sem a seção "Impostos dos serviços".
--
-- Um modelo guarda SÓ os campos preenchidos (jsonb `campos`, chaves = nomes da
-- API da Omie: cNbs, cCST, nAliqISS, cRetemISS, nAliqFederalIBPT, …; catálogo em
-- src/lib/pos/modelo-fiscal.ts). Vazio = vale o cadastro do serviço na Omie.
--   padrao = true  → usado para cliente sem modelo vinculado (no máximo um).
--   pos_modelo_fiscal_clientes: modelo de cada cliente, por CNPJ/CPF (só dígitos).
--   Ordem_Servico.faturamento_impostos: o que foi aplicado na OS ao faturar
--     { modeloId, modeloNome, campos, ajustes: [{campo,de,para}], por, em }.
--
-- Acesso: RLS ligado SEM policy (só service role, via /api/pos/modelos-fiscais).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_modelos_fiscais (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text NOT NULL,
  descricao      text,
  campos         jsonb NOT NULL DEFAULT '{}'::jsonb,
  padrao         boolean NOT NULL DEFAULT false,
  ativo          boolean NOT NULL DEFAULT true,
  criado_por     text,
  atualizado_por text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_modelos_fiscais_nome_uk
  ON pos_modelos_fiscais (lower(nome)) WHERE ativo;
CREATE UNIQUE INDEX IF NOT EXISTS pos_modelos_fiscais_um_padrao
  ON pos_modelos_fiscais ((true)) WHERE padrao AND ativo;

CREATE TABLE IF NOT EXISTS pos_modelo_fiscal_clientes (
  documento      text PRIMARY KEY CHECK (documento ~ '^[0-9]{11,14}$'),
  modelo_id      uuid NOT NULL REFERENCES pos_modelos_fiscais(id) ON DELETE CASCADE,
  cliente_nome   text,
  atualizado_por text,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_modelo_fiscal_clientes_modelo_idx ON pos_modelo_fiscal_clientes (modelo_id);

ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS faturamento_impostos jsonb;

ALTER TABLE pos_modelos_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_modelo_fiscal_clientes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_modelos_fiscais FROM anon, authenticated;
REVOKE ALL ON pos_modelo_fiscal_clientes FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
