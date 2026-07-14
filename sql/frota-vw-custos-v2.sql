-- =============================================================================
-- Frota — v2 da vw_frota_custos (só a view; o resto do módulo já está aplicado)
--
-- Motivo: validando contra a API, os /custos da Rota Exata contêm TAMBÉM
-- "Multas" (5) e "Manutenção" (39) — que já entram na conta pelos espelhos
-- próprios (frota_multas / frota_manutencoes). Sem estes filtros, multa e
-- manutenção contariam em DOBRO no custo do carro.
--
-- É o MESMO texto do §12 do create-frota-module.sql (fonte canônica) — este
-- arquivo existe só pra aplicar a correção sem re-rodar o módulo inteiro.
-- Correr no Supabase: SQL Editor -> colar -> Run. Idempotente.
-- =============================================================================
CREATE OR REPLACE VIEW vw_frota_custos AS
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
   WHERE mu.valor IS NOT NULL;
