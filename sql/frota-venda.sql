-- =============================================================================
-- frota_veiculos: VENDA + EQUIPAMENTOS (pedido de 15/07/2026)
--
-- Venda: o carro vendido NÃO é apagado — vira histórico (status='vendido',
-- ativo=false) com o registro de pra quem, quando e por quanto. Ao confirmar
-- a venda o portal também:
--   - encerra o responsável em aberto (frota_responsaveis.fim = data da venda)
--   - desativa a linha em Placas (ativo=false) → o carro SAI do patrimônio do
--     DRE (o calc filtra ativo !== false)
--
-- Equipamentos: acessórios instalados no carro ("tunagem" — insulfilm,
-- suporte, rádio...). Editável na Ficha; cada item vira linha do CHECKLIST
-- PRÉ-VENDA ("o que tirar antes de entregar"), junto com rastreador/seguro.
--
-- Rodar no SQL Editor do Supabase (idempotente).
-- =============================================================================

ALTER TABLE frota_veiculos
  ADD COLUMN IF NOT EXISTS venda_data      DATE,
  ADD COLUMN IF NOT EXISTS venda_valor     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS venda_comprador TEXT,
  ADD COLUMN IF NOT EXISTS venda_obs       TEXT,
  ADD COLUMN IF NOT EXISTS equipamentos    TEXT[] NOT NULL DEFAULT '{}',
  -- "ano do documento": exercício do CRLV (licenciamento). Preenchido pela
  -- leitura automática do CRLV ou na mão. Exercício < ano atual = pendência
  -- vermelha ("documento atrasado").
  ADD COLUMN IF NOT EXISTS exercicio_crlv  INT;

COMMENT ON COLUMN frota_veiculos.venda_comprador IS 'Pra quem o veículo foi vendido (registro histórico — o veículo fica com status=vendido, ativo=false).';
COMMENT ON COLUMN frota_veiculos.equipamentos IS 'Acessórios instalados (insulfilm, suporte, rádio...). Cada item entra no checklist pré-venda.';
COMMENT ON COLUMN frota_veiculos.exercicio_crlv IS 'Ano do documento (exercício do CRLV/licenciamento). Menor que o ano atual = pendência.';

-- =============================================================================
-- frota_multas: ANEXOS do portal (auto de infração, boleto, comprovante,
-- defesa...) — [{url, nome, por, em}]. O arquivo vive no bucket
-- frota-documentos (multas/{id}/...); escrita só via /api/frota/multas/anexos.
-- (As imagens que a Rota Exata carimba continuam na coluna `imagens`.)
-- =============================================================================

ALTER TABLE frota_multas
  ADD COLUMN IF NOT EXISTS anexos JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN frota_multas.anexos IS 'Anexos do portal: [{url, nome, por, em}] — auto de infração, boleto, comprovante, defesa.';

-- =============================================================================
-- FIPE automática: quando o humano confirma o modelo na Ficha ("buscar FIPE"),
-- o código fica gravado — e o cron mensal atualiza Placas.valor_mercado (o
-- patrimônio do DRE) SEM chute de matching, direto pelo código.
-- =============================================================================

ALTER TABLE frota_veiculos
  ADD COLUMN IF NOT EXISTS fipe_codigo     TEXT,
  ADD COLUMN IF NOT EXISTS fipe_ano_codigo TEXT;

COMMENT ON COLUMN frota_veiculos.fipe_codigo IS 'Código FIPE do modelo (ex.: 005501-8), confirmado por humano na Ficha — o cron mensal usa pra atualizar o valor de mercado.';

-- =============================================================================
-- ARQUIVAR veículo (pedido de 16/07): saída da frota SEM venda — sucateado,
-- devolvido (locação), cadastro errado/duplicado... status='arquivado',
-- ativo=false, com motivo e data. Mesmo tratamento da venda: sai do patrimônio
-- do DRE (Placas.ativo=false), o responsável aberto é encerrado e a ficha
-- inteira fica de histórico. Reversível ("desarquivar").
-- =============================================================================

ALTER TABLE frota_veiculos DROP CONSTRAINT IF EXISTS frota_veiculos_status_check;
ALTER TABLE frota_veiculos ADD CONSTRAINT frota_veiculos_status_check
  CHECK (status IN ('ativo','manutencao','parado','vendido','locado','arquivado'));

ALTER TABLE frota_veiculos
  ADD COLUMN IF NOT EXISTS arquivado_motivo TEXT,
  ADD COLUMN IF NOT EXISTS arquivado_em     DATE;

COMMENT ON COLUMN frota_veiculos.arquivado_motivo IS 'Por que o veículo saiu da frota sem venda (sucateado, devolvido, cadastro errado...).';

-- =============================================================================
-- CATÁLOGO DE EQUIPAMENTOS (pedido de 16/07): em vez de texto livre por
-- vírgula, o equipamento é cadastrado UMA vez (ex.: RASTREADOR) e anexado por
-- seleção em cada carro. frota_veiculos.equipamentos (TEXT[]) continua sendo
-- onde o vínculo mora — o catálogo é a lista de opções.
-- =============================================================================

CREATE TABLE IF NOT EXISTS frota_equipamentos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE frota_equipamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS frota_equipamentos_select ON frota_equipamentos;
CREATE POLICY frota_equipamentos_select ON frota_equipamentos
  FOR SELECT TO authenticated USING (true);
-- escrita SÓ via /api (service role) — padrão P1 do módulo

-- aproveita o que já foi digitado no texto livre como itens do catálogo
INSERT INTO frota_equipamentos (nome)
  SELECT DISTINCT upper(trim(e))
    FROM frota_veiculos, unnest(equipamentos) AS e
   WHERE trim(e) <> ''
  ON CONFLICT (nome) DO NOTHING;

-- itens de partida comuns (idempotente)
INSERT INTO frota_equipamentos (nome) VALUES ('RASTREADOR') ON CONFLICT (nome) DO NOTHING;
