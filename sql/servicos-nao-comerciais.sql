-- ============================================================================
-- SERVIÇOS NÃO COMERCIAIS (Dashboard de Vendas → Serviços)
--
-- Pedido do José (20/10/2026): o Serviços mostra por padrão só o rendimento
-- COMERCIAL; garantia (fábrica paga), campanhas/comissões, seguro e ações
-- promocionais ficam num quadro à parte, e uma caixinha (desmarcada) soma
-- tudo de volta. Levantamento 2025–2026 (NFS-e): ~21% do valor não é comercial.
--
--   os_classificacao   uma linha por OS (conta + ncod_os): a classe e o motivo.
--     origem 'regra'  = gravada pelo portal a partir dos itens da OS (regras em
--                       src/lib/estoque/servicos-classe.ts; roda no sync dos
--                       itens e no script de reprocessamento);
--     origem 'manual' = alguém da tela moveu a OS; a regra não sobrescreve
--                       (classe_regra guarda o que a regra diria).
--   OS sem linha aqui conta como 'comercial'.
--
--   servicos_resumo_mensal_json / servicos_resumo_semanal_json ganham a
--   coluna `classe` no agrupamento (mesmos parâmetros e retorno jsonb). Quem
--   soma tudo continua igual; o portal filtra pela classe.
--
-- RLS ligada sem policy (só service role, pelas rotas). Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.os_classificacao (
  conta_omie        text        NOT NULL,
  ncod_os           bigint      NOT NULL,
  classe            text        NOT NULL CHECK (classe IN ('comercial','garantia','campanha','seguro','promocao')),
  origem            text        NOT NULL DEFAULT 'regra' CHECK (origem IN ('regra','manual')),
  motivo            text,
  classe_regra      text        CHECK (classe_regra IN ('comercial','garantia','campanha','seguro','promocao')),
  alterado_por      uuid,
  alterado_por_nome text,
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_omie, ncod_os)
);
CREATE INDEX IF NOT EXISTS os_classificacao_classe_idx ON public.os_classificacao (classe) WHERE classe <> 'comercial';

ALTER TABLE public.os_classificacao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.os_classificacao FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.servicos_resumo_mensal_json(
  p_desde_ano int,
  p_conta text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH itens AS (
    SELECT
      i.conta_omie, i.ano, i.mes, i.ncod_os, i.valor_total,
      CASE
        WHEN i.codigo_servico = 0 THEN 'SEM_CODIGO'
        WHEN i.tipo IN ('HR', 'KM') THEN i.tipo
        ELSE 'OUTRO'
      END AS tipo,
      COALESCE(c.classe, 'comercial') AS classe
    FROM public.os_servicos_itens i
    JOIN public.os_nfse n
      ON n.ncod_os = i.ncod_os AND n.conta_omie = i.conta_omie AND n.tem_nota
    LEFT JOIN public.os_classificacao c
      ON c.ncod_os = i.ncod_os AND c.conta_omie = i.conta_omie
    WHERE i.ano >= p_desde_ano
      AND (p_conta IS NULL OR i.conta_omie = p_conta)
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  FROM (
    SELECT conta_omie, ano, mes, tipo, classe,
           COALESCE(SUM(valor_total), 0) AS valor,
           COUNT(*)::int AS itens,
           ARRAY_AGG(DISTINCT ncod_os) AS os
    FROM itens
    GROUP BY conta_omie, ano, mes, tipo, classe
  ) r;
$$;

CREATE OR REPLACE FUNCTION public.servicos_resumo_semanal_json(
  p_desde date,
  p_conta text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH itens AS (
    SELECT
      i.conta_omie, i.ncod_os, i.valor_total,
      to_date(i.data, 'DD/MM/YYYY') AS dia,
      CASE
        WHEN i.codigo_servico = 0 THEN 'SEM_CODIGO'
        WHEN i.tipo IN ('HR', 'KM') THEN i.tipo
        ELSE 'OUTRO'
      END AS tipo,
      COALESCE(c.classe, 'comercial') AS classe
    FROM public.os_servicos_itens i
    JOIN public.os_nfse n
      ON n.ncod_os = i.ncod_os AND n.conta_omie = i.conta_omie AND n.tem_nota
    LEFT JOIN public.os_classificacao c
      ON c.ncod_os = i.ncod_os AND c.conta_omie = i.conta_omie
    WHERE (p_conta IS NULL OR i.conta_omie = p_conta)
      AND i.data ~ '^\d{2}/\d{2}/\d{4}$'
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  FROM (
    SELECT conta_omie, to_char(date_trunc('week', dia), 'YYYY-MM-DD') AS semana, tipo, classe,
           COALESCE(SUM(valor_total), 0) AS valor,
           COUNT(*)::int AS itens,
           ARRAY_AGG(DISTINCT ncod_os) AS os
    FROM itens
    WHERE dia >= p_desde
    GROUP BY conta_omie, date_trunc('week', dia), tipo, classe
  ) r;
$$;

REVOKE ALL ON FUNCTION public.servicos_resumo_mensal_json(int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.servicos_resumo_mensal_json(int, text) TO service_role;
REVOKE ALL ON FUNCTION public.servicos_resumo_semanal_json(date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.servicos_resumo_semanal_json(date, text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Conferência:
-- SELECT classe, origem, count(*) FROM os_classificacao GROUP BY 1,2 ORDER BY 1,2;
