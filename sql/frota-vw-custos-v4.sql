-- =============================================================================
-- Frota — v4 da vw_frota_custos: requisição só conta depois do FINANCEIRO
-- (10/10/2026, decisão do José)
--
-- Até a v3.2 a view somava qualquer requisição veicular que não estivesse na
-- lixeira — inclusive pedido em aberto, com valor ainda não confirmado. A tela
-- de Abastecimento só conta requisição no status 'financeiro' (decisão de
-- 24/07), então o combustível do mesmo carro no mesmo mês dava dois valores.
-- Agora TODOS os tipos (Manutenção, Abastecimento, Frota-Veículos, Serviço de
-- Terceiros) só entram no TCO depois de enviados ao financeiro.
-- Em 10/10/2026: 17 requisições (~R$ 3,5 mil) em aberto saem da conta.
--
-- Mesmas colunas e tipos da v3.2 → CREATE OR REPLACE (mantém os grants).
-- Correr no Supabase: SQL Editor -> colar -> Run. Idempotente.
-- =============================================================================
CREATE OR REPLACE VIEW vw_frota_custos AS
  SELECT f.id                    AS veiculo_id,
         f.placa,
         a.data_transacao::date  AS data,
         'Combustível'           AS tipo,
         a.valor_total           AS valor,
         'abastecimentos'        AS fonte,
         nullif(concat_ws(' · ',
           nullif(a.posto_nome, ''),
           nullif(a.combustivel, ''),
           CASE WHEN a.litros > 0 THEN round(a.litros::numeric, 1)::text || ' l' END
         ), '')                  AS descricao,
         NULL::text              AS ref_id
    FROM abastecimentos a
    JOIN frota_veiculos f ON f.placa = frota_resolver_placa(a.placa)
UNION ALL
  SELECT c.veiculo_id, c.placa, c.dt_lancamento, c.tipo_custo, c.valor, 'rotaexata',
         nullif(concat_ws(' · ', nullif(c.descricao, ''), nullif(c.fornecedor, '')), ''),
         NULL::text
    FROM frota_custos c
   WHERE NOT c.eh_combustivel
     AND NOT c.ignorar_no_total
     AND lower(coalesce(c.tipo_custo, '')) NOT LIKE '%multa%'
UNION ALL
  SELECT m.veiculo_id, m.placa, m.dt_realizado, 'Manutenção', m.valor_total, 'manutencao',
         nullif(concat_ws(' · ',
           coalesce(nullif(m.descricao, ''), nullif(m.observacao, '')),
           nullif(m.fornecedor, '')
         ), ''),
         NULL::text
    FROM frota_manutencoes m
   WHERE m.origem = 'manual'
     AND m.dt_realizado IS NOT NULL AND m.valor_total IS NOT NULL
UNION ALL
  SELECT mu.veiculo_id, mu.placa, mu.dt_multa::date, 'Multa', mu.valor, 'multa',
         nullif(concat_ws(' · ', nullif(mu.descricao, ''), nullif(mu.local_endereco, '')), ''),
         NULL::text
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
         'requisicao',
         nullif(concat_ws(' · ', nullif(r.titulo, ''), nullif(r.fornecedor, '')), ''),
         r.id::text
    FROM "Requisicao" r
    JOIN frota_veiculos f ON f.supa_placa_id::text = r.veiculo::text
   WHERE r.tipo IN ('Veicular Manutenção', 'Veicular Abastecimento',
                    'Frota-Veículos', 'Frota-Veiculos', 'Serviço de Terceiros')
     AND lower(coalesce(r.status, '')) = 'financeiro'   -- v4: só valor CONFIRMADO
     AND r.data IS NOT NULL
     AND frota_parse_valor(r.valor_despeza) IS NOT NULL
     AND frota_parse_valor(r.valor_despeza) > 0;

NOTIFY pgrst, 'reload schema';

-- Conferência (rode depois): não pode aparecer requisição fora do financeiro
-- SELECT r.status, count(*) FROM vw_frota_custos v
--   JOIN "Requisicao" r ON r.id::text = v.ref_id
--  WHERE v.fonte = 'requisicao' GROUP BY 1;
