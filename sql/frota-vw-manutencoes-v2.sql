-- =============================================================================
-- Frota — v2 da vw_frota_manutencoes: parse de valor que aceita OS DOIS formatos
--
-- Bug real (print do usuário, 14/07): Requisicao.valor_despeza guarda formatos
-- MISTURADOS — BR ("1.304,60") e US ("920.00"). A view v1 assumia só BR, então
-- tirava o ponto de "920.00" e virava 92000: 60 das 83 requisições veiculares
-- estavam infladas 100x (total R$ 3.079.889 em vez de R$ 34.383,66).
--
-- A regra é a MESMA do parseValorReq das garantias (src/lib/garantias/os-pecas.ts),
-- que já enfrentou este exato problema:
--   tem vírgula  -> BR: pontos são milhar (somem), vírgula é o decimal
--   sem vírgula  -> ponto É o decimal ("920.00" = 920)
--
-- Correr no Supabase: SQL Editor -> colar -> Run. Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION frota_parse_valor(v TEXT) RETURNS NUMERIC
  LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s TEXT;
BEGIN
  -- [[:space:]] porque \s não vale dentro de colchetes no regex POSIX do Postgres
  s := regexp_replace(coalesce(v, ''), '[R$[:space:]]', '', 'g');
  IF s = '' THEN RETURN NULL; END IF;
  IF position(',' in s) > 0 THEN
    s := replace(replace(s, '.', ''), ',', '.');   -- BR: "1.304,60" -> "1304.60"
  END IF;                                          -- US: "920.00" fica como está
  IF s ~ '^[0-9]+(\.[0-9]+)?$' THEN RETURN s::numeric; END IF;
  RETURN NULL;                                     -- "Não Informado" etc.
END $$;

CREATE OR REPLACE VIEW vw_frota_manutencoes AS
  SELECT m.id::text            AS id,
         m.veiculo_id,
         m.placa,
         m.origem,
         m.tipo,
         m.status,
         COALESCE(m.descricao, m.observacao) AS descricao,
         m.fornecedor,
         m.valor_total,
         m.dt_realizado         AS data,
         m.hodometro_realizado  AS hodometro
    FROM frota_manutencoes m
UNION ALL
  SELECT r.id::text,
         f.id,
         f.placa,
         'requisicao',
         'Corretiva',
         r.status,
         r.titulo,
         r.fornecedor,
         frota_parse_valor(r.valor_despeza),
         r.data::date,
         frota_parse_valor(r.hodometro)
    FROM "Requisicao" r
    JOIN frota_veiculos f ON f.supa_placa_id::text = r.veiculo::text
   WHERE r.tipo = 'Veicular Manutenção';

-- Conferência (esperado após aplicar):
-- SELECT count(*), round(sum(valor_total),2) FROM vw_frota_manutencoes WHERE origem='requisicao';
--   -> 83 linhas (menos as sem veículo), soma ~34383.66
