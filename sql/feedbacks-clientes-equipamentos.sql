-- Equipamentos/tratores do cliente na "pasta" (feedback_clientes_info).
-- Quando o atendente preenche o projeto/trator num atendimento, o equipamento
-- passa a ser registrado aqui (jsonb de strings), sem duplicar.
-- Rodar no SQL Editor do projeto do Portal (citrhumdkfivdzbmayde).

ALTER TABLE feedback_clientes_info
  ADD COLUMN IF NOT EXISTS equipamentos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- (Opcional) Backfill: popular os equipamentos das pastas a partir dos
-- atendimentos já existentes (feedback_registros.trator). A interface já mostra
-- esses equipamentos mesmo sem o backfill (ela une pasta + atendimentos), mas
-- rodar isto deixa-os persistidos na pasta também.
--
-- UPDATE feedback_clientes_info ci
-- SET equipamentos = sub.equis
-- FROM (
--   SELECT
--     CASE WHEN r.codigo_omie IS NOT NULL AND r.codigo_omie <> ''
--          THEN 'omie_' || r.codigo_omie
--          ELSE 'nome_' || upper(btrim(r.nome)) END AS cliente_key,
--     jsonb_agg(DISTINCT btrim(r.trator)) AS equis
--   FROM feedback_registros r
--   WHERE r.trator IS NOT NULL AND btrim(r.trator) <> ''
--   GROUP BY 1
-- ) sub
-- WHERE ci.cliente_key = sub.cliente_key;
