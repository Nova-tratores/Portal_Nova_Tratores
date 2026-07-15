-- =============================================================================
-- vw_frota_uso_diario v2 — + checkin_diario (o check-in DIÁRIO dos técnicos)
--
-- DESCOBERTA (15/07/2026): o app dos mecânicos (NT_Mecanicos) JÁ tem a tela
-- "pegar carro do dia" — é a Jornada, que grava em `checkin_diario`
-- (tecnico_nome, data, placa "MODELO - PLACA", OS, destino; UNIQUE por
-- técnico+dia). Já existem 137 check-ins reais. A tabela `tecnico_caminhos`,
-- que a v1 desta view lia, está VAZIA (nunca foi usada).
--
-- Esta v2 adiciona o checkin_diario como terceira fonte. Efeito imediato:
--  - multa atribuída ao TÉCNICO que estava com o carro no dia (uso diário
--    vence responsável fixo — regra já implementada em /api/frota/multas)
--  - motorista_nome do dia no fechar-dia (frota_dias) e nas paradas
--
-- Rodar no SQL Editor do Supabase (CREATE OR REPLACE — sem efeito colateral).
-- =============================================================================

CREATE OR REPLACE VIEW vw_frota_uso_diario AS
  SELECT f.id            AS veiculo_id,
         f.placa,
         c.data::date    AS data,
         c.vendedor_nome AS pessoa_nome,
         c.vendedor_id::text AS pessoa_id,
         'vendedor'      AS pessoa_tipo,
         'checkin_vendedor' AS fonte,
         c.created_at
    FROM checkin_vendedor c
    JOIN frota_veiculos f
      ON f.placa = frota_resolver_placa(frota_placa_de_numplaca(c.placa))
UNION ALL
  SELECT f.id,
         f.placa,
         t.data_saida::date,
         t.tecnico_nome,
         NULL,
         'tecnico',
         'tecnico_caminhos',
         t.data_saida
    FROM tecnico_caminhos t
    JOIN frota_veiculos f
      ON f.placa = frota_resolver_placa(frota_placa_de_numplaca(coalesce(t.placa, '')))
   WHERE t.placa IS NOT NULL
UNION ALL
  -- v2: check-in diário dos TÉCNICOS (app NT_Mecanicos, tela Jornada)
  SELECT f.id,
         f.placa,
         cd.data::date,
         cd.tecnico_nome,
         NULL,
         'tecnico',
         'checkin_diario',
         cd.created_at
    FROM checkin_diario cd
    JOIN frota_veiculos f
      ON f.placa = frota_resolver_placa(frota_placa_de_numplaca(cd.placa))
   WHERE coalesce(cd.placa, '') <> '';
