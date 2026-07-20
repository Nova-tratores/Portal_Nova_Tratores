-- =============================================================================
-- Frota — v3 da vw_frota_custos: REQUISIÇÕES entram na conta do veículo
--
-- Motivo: as requisições marcadas pra um veículo (Requisicao.veiculo =
-- SupaPlacas.IdPlaca) nunca entravam no TCO — só cartão combustível, custos da
-- Rota Exata, manutenções manuais e multas. No banco há ~520 requisições
-- veiculares (levantado em 17/07/2026):
--   'Frota-Veículos' + 'Frota-Veiculos' (403)  → tipo "Despesa de frota"
--   'Veicular Manutenção' (94)                 → tipo "Manutenção"
--   'Veicular Abastecimento' (22)              → tipo "Combustível"
--   'Serviço de Terceiros' (3, com veículo)    → tipo "Serviço de terceiros"
-- Lixeira fica fora. valor_despeza é TEXTO em formatos misturados (BR e US) —
-- frota_parse_valor trata os dois e devolve NULL pro que não é número.
--
-- Anti-duplo-conto continua: /custos do RE sem multa nem combustível;
-- frota_manutencoes só origem='manual' (a requisição de manutenção entra AQUI,
-- não existe em frota_manutencoes).
--
-- Correr no Supabase: SQL Editor -> colar -> Run. Idempotente.
--
-- DROP + CREATE (não CREATE OR REPLACE): o braço novo muda o tipo inferido da
-- coluna `valor` (numeric(12,2) -> numeric) e o Postgres não deixa REPLACE
-- mudar tipo de coluna (erro 42P16). Dropar a view é seguro — nada depende
-- dela além das telas, e os grants são refeitos logo abaixo.
-- =============================================================================
DROP VIEW IF EXISTS vw_frota_custos;

CREATE VIEW vw_frota_custos AS
  SELECT f.id                    AS veiculo_id,
         f.placa,
         a.data_transacao::date  AS data,
         'Combustível'           AS tipo,
         a.valor_total           AS valor,
         'abastecimentos'        AS fonte
    FROM abastecimentos a
    JOIN frota_veiculos f ON f.placa = frota_resolver_placa(a.placa)
UNION ALL
  SELECT c.veiculo_id, c.placa, c.dt_lancamento, c.tipo_custo, c.valor, 'rotaexata'
    FROM frota_custos c
   WHERE NOT c.eh_combustivel
     AND NOT c.ignorar_no_total
     AND lower(coalesce(c.tipo_custo, '')) NOT LIKE '%multa%'
UNION ALL
  SELECT m.veiculo_id, m.placa, m.dt_realizado, 'Manutenção', m.valor_total, 'manutencao'
    FROM frota_manutencoes m
   WHERE m.origem = 'manual'
     AND m.dt_realizado IS NOT NULL AND m.valor_total IS NOT NULL
UNION ALL
  SELECT mu.veiculo_id, mu.placa, mu.dt_multa::date, 'Multa', mu.valor, 'multa'
    FROM frota_multas mu
   WHERE mu.valor IS NOT NULL
UNION ALL
  SELECT f.id,
         f.placa,
         r.data::date,
         CASE
           WHEN r.tipo = 'Veicular Manutenção'   THEN 'Manutenção'
           WHEN r.tipo = 'Veicular Abastecimento' THEN 'Combustível'
           WHEN r.tipo = 'Serviço de Terceiros'  THEN 'Serviço de terceiros'
           ELSE 'Despesa de frota'
         END,
         frota_parse_valor(r.valor_despeza),
         'requisicao'
    FROM "Requisicao" r
    JOIN frota_veiculos f ON f.supa_placa_id::text = r.veiculo::text
   WHERE r.tipo IN ('Veicular Manutenção', 'Veicular Abastecimento',
                    'Frota-Veículos', 'Frota-Veiculos', 'Serviço de Terceiros')
     AND lower(coalesce(r.status, '')) <> 'lixeira'
     AND r.data IS NOT NULL
     AND frota_parse_valor(r.valor_despeza) IS NOT NULL
     AND frota_parse_valor(r.valor_despeza) > 0;

-- Grants (o DROP levou os antigos): mesmo padrão do módulo — autenticado lê
REVOKE ALL ON vw_frota_custos FROM anon;
GRANT SELECT ON vw_frota_custos TO authenticated;
GRANT SELECT ON vw_frota_custos TO service_role;

NOTIFY pgrst, 'reload schema';

-- Conferência (rode depois):
-- SELECT fonte, tipo, count(*), round(sum(valor)) FROM vw_frota_custos
--  GROUP BY 1, 2 ORDER BY 1, 2;
