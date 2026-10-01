-- ============================================================================
-- Demanda de ALOCAÇÃO de peça recebida (01/10/2026)
--
-- Fluxo: nota de entrada RECEBIDA (portal ou direto na Omie) → o motor
-- (src/lib/pecas/alocacao-server.ts) abre uma demanda para cada peça recebida
-- que ainda não tem #PRATELEIRA/#ANDAR/#CAIXA → a equipe aloca em
-- /ajustes/caracteristicas (painel "A alocar") → a demanda fecha sozinha.
--
-- Molde: frota_pendencias (abre com chave de origem, fecha quando a causa some).
-- Idempotente: pode rodar mais de uma vez.
-- Aplicar no SQL Editor do Supabase. O deploy NÃO quebra sem ela: o motor e a
-- tela tratam tabela/coluna ausente como "nada a fazer".
-- ============================================================================

-- 1) Data do recebimento como coluna (hoje só existe dentro de dados_raw, em
--    DD/MM/AAAA — não dá para filtrar "recebidas desde X" pelo PostgREST).
ALTER TABLE recebimentos_nfe ADD COLUMN IF NOT EXISTS recebido_em date;

UPDATE recebimentos_nfe
   SET recebido_em = to_date(dados_raw->'infoCadastro'->>'dRec', 'DD/MM/YYYY')
 WHERE recebido_em IS NULL
   AND dados_raw->'infoCadastro'->>'dRec' ~ '^\d{2}/\d{2}/\d{4}$';

CREATE INDEX IF NOT EXISTS recebimentos_nfe_recebido_em_idx
    ON recebimentos_nfe (recebido_em)
 WHERE recebido_em IS NOT NULL;

-- 2) A demanda: UMA LINHA POR ITEM DE RECEBIMENTO (a tela agrupa por peça).
CREATE TABLE IF NOT EXISTS pecas_alocacao_pendencias (
  id                  bigserial PRIMARY KEY,
  conta_omie          text        NOT NULL,            -- 'NOVA' | 'CASTRO' (MAIÚSCULA, como produtos_caracteristicas)
  codigo_produto      bigint      NOT NULL,            -- ID interno da Omie
  codigo              text,                            -- SKU (snapshot)
  descricao           text,                            -- snapshot
  -- origem
  id_receb            bigint      NOT NULL,            -- recebimentos_nfe.id_receb
  numero_nfe          text,
  fornecedor          text,
  recebido_em         date,
  qtde                numeric     NOT NULL DEFAULT 0,
  -- estado
  status              text        NOT NULL DEFAULT 'aberta'
                      CHECK (status IN ('aberta', 'resolvida', 'dispensada')),
  responsavel_user_id uuid,
  responsavel_nome    text,
  aberta_em           timestamptz NOT NULL DEFAULT now(),
  resolvida_em        timestamptz,
  resolvida_por       text,                            -- nome, ou 'Sistema'
  resolvida_user_id   uuid,
  resolucao           text,                            -- "locação definida: 3-G-1" | motivo da dispensa
  locacao             text,                            -- snapshot da posição ao fechar
  -- a mesma nota nunca abre duas vezes a mesma peça (nem reabre a dispensada)
  CONSTRAINT pecas_alocacao_item_uk UNIQUE (conta_omie, id_receb, codigo_produto)
);

CREATE INDEX IF NOT EXISTS pecas_alocacao_status_idx
    ON pecas_alocacao_pendencias (status, conta_omie, codigo_produto);
CREATE INDEX IF NOT EXISTS pecas_alocacao_resp_idx
    ON pecas_alocacao_pendencias (responsavel_user_id)
 WHERE status = 'aberta';

-- Leitura e escrita só pelo servidor (service role) via /api/pecas/alocacao.
ALTER TABLE pecas_alocacao_pendencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pecas_alocacao_pendencias FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
