-- =============================================================================
-- AGRO — vínculo CAR↔cliente SUGERIDO pelas visitas do CRM (25/09/2026)
--
-- O app crm.novatratores.com.br grava a localização das visitas dos vendedores
-- na tabela `visitas` deste mesmo Supabase (view vw_visitas_detalhadas).
-- Visita PRESENCIAL com GPS que cai dentro do polígono de um CAR ativo é
-- evidência forte de que o CAR é daquele cliente — e o vínculo CAR↔cliente é
-- o trabalho manual que o plano chama de "mais subestimado" (Fase 3).
--
-- Chaves (pré-check 25/09): visitas.propriedade_id → portal_nt_clientes_PRINCIPAL.id
-- (ex.: 61407 = "Faz Tijuco Preto", id_omie 990001054). 251 visitas desde
-- 25/04/2026, 240 presenciais com GPS (precisão mediana 34 m, p90 89 m).
-- Prévia local: 151 das 247 visitas com GPS caem num CAR ativo dos 45 municípios
-- (147 pares CAR×cliente, 120 CARs, 127 clientes; 21 CARs visitados por >1 cliente).
--
-- REGRA (decisão do usuário): NADA vira vínculo confirmado sem um humano. A
-- função só grava SUGESTÕES (status 'pendente'); a tela aceita/rejeita pela RPC
-- agro_decidir_sugestao, que aí sim chama agro_vincular_cliente (origem 'sugerido').
--
-- Idempotente. RLS ON zero policy. Nada em `visitas` é alterado.
-- APLICAR À MÃO no SQL Editor. Depois: SELECT public.agro_sugerir_vinculos_por_visita(<execucao_id>);
-- =============================================================================

-- 0) fonte 'crm' nas execuções do pipeline
ALTER TABLE public.agro_pipeline_execucao DROP CONSTRAINT IF EXISTS agro_pipeline_execucao_fonte_check;
ALTER TABLE public.agro_pipeline_execucao
  ADD CONSTRAINT agro_pipeline_execucao_fonte_check
  CHECK (fonte IN ('sicar','mapbiomas','sicor','ibge_pam','sentinel','perfil','crm'));

-- 1) sugestões
CREATE TABLE IF NOT EXISTS public.agro_car_vinculo_sugestao (
  cod_car             text NOT NULL REFERENCES public.agro_car_imovel(cod_car) ON DELETE CASCADE,
  cliente_ref         text NOT NULL,              -- portal_nt_clientes_PRINCIPAL.id (texto)
  cliente_omie_id     text NOT NULL,              -- id_omie da PRINCIPAL, ou 'principal:<id>' quando não há
  cliente_nome        text,
  propriedade_nome    text,
  n_visitas           integer NOT NULL DEFAULT 0,
  n_presenciais       integer NOT NULL DEFAULT 0,
  primeira_visita     date,
  ultima_visita       date,
  vendedores          text[] NOT NULL DEFAULT '{}',
  gps_accuracy_media  numeric(8,1),
  visita_ids          bigint[] NOT NULL DEFAULT '{}',
  score               numeric(6,2) NOT NULL DEFAULT 0,
  motivo              text,
  status              text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceita','rejeitada')),
  decidido_por        text,
  decidido_em         timestamptz,
  execucao_id         bigint NOT NULL REFERENCES public.agro_pipeline_execucao(id),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cod_car, cliente_ref)
);
CREATE INDEX IF NOT EXISTS agro_car_vinculo_sugestao_status_idx  ON public.agro_car_vinculo_sugestao (status, score DESC);
CREATE INDEX IF NOT EXISTS agro_car_vinculo_sugestao_cliente_idx ON public.agro_car_vinculo_sugestao (cliente_ref);
ALTER TABLE public.agro_car_vinculo_sugestao ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.agro_car_vinculo_sugestao IS 'Sugestões de vínculo CAR↔cliente geradas pelas visitas presenciais com GPS do CRM. Só vira vínculo via agro_decidir_sugestao (humano).';

-- 2) gerador de sugestões
CREATE OR REPLACE FUNCTION public.agro_sugerir_vinculos_por_visita(p_execucao_id bigint, p_accuracy_max numeric DEFAULT 150)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_n integer;
BEGIN
  WITH vis AS (
    SELECT v.id, v.propriedade_id, v.vendedor_id, v.tipo, v.data_visita::date AS dia, v.gps_accuracy,
           ST_SetSRID(ST_MakePoint(v.longitude::double precision, v.latitude::double precision), 4674) AS pt
      FROM public.visitas v
     WHERE v.deleted_at IS NULL
       AND v.tipo = 'presencial'
       AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
       AND (v.gps_accuracy IS NULL OR v.gps_accuracy <= p_accuracy_max)
       AND COALESCE(v.retroativa, false) = false
       AND v.propriedade_id IS NOT NULL
  ),
  hit AS (
    SELECT c.cod_car, vis.propriedade_id::text AS cliente_ref, vis.id AS visita_id, vis.vendedor_id, vis.dia, vis.gps_accuracy
      FROM vis
      JOIN public.agro_car_imovel c
        ON c.status_car = 'AT' AND c.geom && vis.pt AND ST_Contains(c.geom, vis.pt)
  ),
  agg AS (
    SELECT h.cod_car, h.cliente_ref,
           count(*)::integer AS n_presenciais,
           min(h.dia) AS primeira_visita, max(h.dia) AS ultima_visita,
           avg(h.gps_accuracy)::numeric(8,1) AS gps_media,
           array_agg(DISTINCT h.visita_id ORDER BY h.visita_id) AS visita_ids,
           array_agg(DISTINCT COALESCE(vd.nome, 'vendedor ' || h.vendedor_id::text)) AS vendedores
      FROM hit h
      LEFT JOIN public.vendedores vd ON vd.id = h.vendedor_id
     GROUP BY h.cod_car, h.cliente_ref
  ),
  ctx AS (
    SELECT a.*,
           (SELECT count(DISTINCT a2.cliente_ref) FROM agg a2 WHERE a2.cod_car = a.cod_car)   AS clientes_no_car,
           (SELECT count(DISTINCT a3.cod_car)     FROM agg a3 WHERE a3.cliente_ref = a.cliente_ref) AS cars_do_cliente,
           p.id_omie, p.nome_fantasia, p.razao_social
      FROM agg a
      LEFT JOIN public."portal_nt_clientes_PRINCIPAL" p ON p.id::text = a.cliente_ref
  ),
  calc AS (
    SELECT c.*,
           (LEAST(c.n_presenciais, 3)
            + CASE WHEN c.gps_media IS NOT NULL AND c.gps_media <= 30 THEN 1 ELSE 0 END
            - CASE WHEN c.clientes_no_car > 1 THEN 1 ELSE 0 END
            - CASE WHEN c.cars_do_cliente > 3 THEN 0.5 ELSE 0 END)::numeric(6,2) AS score,
           concat_ws('; ',
             c.n_presenciais || ' visita(s) presencial(is) dentro do CAR',
             CASE WHEN c.gps_media IS NOT NULL THEN 'GPS médio ' || c.gps_media || ' m' END,
             CASE WHEN c.clientes_no_car > 1 THEN 'ATENÇÃO: este CAR recebeu visitas de ' || c.clientes_no_car || ' clientes' END,
             CASE WHEN c.cars_do_cliente > 3 THEN 'cliente aparece em ' || c.cars_do_cliente || ' CARs' END
           ) AS motivo
      FROM ctx c
  )
  INSERT INTO public.agro_car_vinculo_sugestao AS s
        (cod_car, cliente_ref, cliente_omie_id, cliente_nome, propriedade_nome, n_visitas, n_presenciais,
         primeira_visita, ultima_visita, vendedores, gps_accuracy_media, visita_ids, score, motivo, execucao_id, atualizado_em)
  SELECT cod_car, cliente_ref,
         COALESCE(id_omie::text, 'principal:' || cliente_ref),
         COALESCE(NULLIF(nome_fantasia, ''), NULLIF(razao_social, ''), 'cliente ' || cliente_ref),
         NULLIF(razao_social, ''),
         n_presenciais, n_presenciais, primeira_visita, ultima_visita, vendedores, gps_media, visita_ids, score, motivo,
         p_execucao_id, now()
    FROM calc
  ON CONFLICT (cod_car, cliente_ref) DO UPDATE
     SET n_visitas = EXCLUDED.n_visitas, n_presenciais = EXCLUDED.n_presenciais,
         primeira_visita = EXCLUDED.primeira_visita, ultima_visita = EXCLUDED.ultima_visita,
         vendedores = EXCLUDED.vendedores, gps_accuracy_media = EXCLUDED.gps_accuracy_media,
         visita_ids = EXCLUDED.visita_ids, score = EXCLUDED.score, motivo = EXCLUDED.motivo,
         cliente_nome = EXCLUDED.cliente_nome, propriedade_nome = EXCLUDED.propriedade_nome,
         execucao_id = EXCLUDED.execucao_id, atualizado_em = now()
   WHERE s.status = 'pendente';          -- o que já foi aceito/rejeitado não é reaberto

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_sugerir_vinculos_por_visita(bigint, numeric) FROM PUBLIC, anon, authenticated;

-- 3) decisão humana (chamada SÓ pela rota /api/agro/vinculos/sugestoes com o usuário da sessão)
CREATE OR REPLACE FUNCTION public.agro_decidir_sugestao(p_cod_car text, p_cliente_ref text, p_aceitar boolean, p_usuario text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.agro_car_vinculo_sugestao%ROWTYPE;
BEGIN
  IF p_usuario IS NULL OR p_usuario = '' THEN RAISE EXCEPTION 'usuário obrigatório'; END IF;
  SELECT * INTO s FROM public.agro_car_vinculo_sugestao WHERE cod_car = p_cod_car AND cliente_ref = p_cliente_ref FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sugestão não encontrada'; END IF;
  IF s.status <> 'pendente' THEN RETURN s.status; END IF;

  IF p_aceitar THEN
    PERFORM public.agro_vincular_cliente(
      s.cod_car, s.cliente_omie_id, s.cliente_nome, p_usuario, 'sugerido',
      'via visitas do CRM: ' || s.n_presenciais || ' visita(s), ' || array_to_string(s.vendedores, ', '));
  END IF;

  UPDATE public.agro_car_vinculo_sugestao
     SET status = CASE WHEN p_aceitar THEN 'aceita' ELSE 'rejeitada' END,
         decidido_por = p_usuario, decidido_em = now(), atualizado_em = now()
   WHERE cod_car = p_cod_car AND cliente_ref = p_cliente_ref;
  RETURN CASE WHEN p_aceitar THEN 'aceita' ELSE 'rejeitada' END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agro_decidir_sugestao(text, text, boolean, text) FROM PUBLIC, anon, authenticated;

-- 4) view para a tela (security_invoker: view NÃO herda RLS por padrão — ver agro-schema.sql §13)
CREATE OR REPLACE VIEW public.agro_v_vinculo_sugestao AS
SELECT s.cod_car, s.cliente_ref, s.cliente_omie_id, s.cliente_nome, s.propriedade_nome,
       s.n_presenciais, s.primeira_visita, s.ultima_visita, s.vendedores, s.gps_accuracy_media,
       s.visita_ids, s.score, s.motivo, s.status, s.decidido_por, s.decidido_em, s.atualizado_em,
       i.municipio, i.municipio_ibge, i.area_ha, i.area_util_ha,
       p.cultura_principal, d.nome AS cultura_nome, p.confianca, p.score_oportunidade, p.credito_36m
  FROM public.agro_car_vinculo_sugestao s
  JOIN public.agro_car_imovel i ON i.cod_car = s.cod_car
  LEFT JOIN public.agro_car_perfil p ON p.cod_car = s.cod_car
  LEFT JOIN public.agro_dominio_cultura d ON d.codigo = p.cultura_principal;
ALTER VIEW public.agro_v_vinculo_sugestao SET (security_invoker = true);
REVOKE ALL ON public.agro_v_vinculo_sugestao FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- PÓS-CHECK
--   SELECT status, count(*) FROM public.agro_car_vinculo_sugestao GROUP BY 1;
--   SELECT cod_car, cliente_nome, n_presenciais, score, motivo FROM public.agro_v_vinculo_sugestao ORDER BY score DESC LIMIT 10;
