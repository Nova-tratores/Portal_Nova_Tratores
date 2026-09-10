-- =====================================================================
-- Fase 1 do cockpit de atendimento — registro de LIGAÇÃO (feedback_chamada)
-- =====================================================================
-- Uma linha por ligação feita a partir de /feedbacks/atendimento/[clienteKey]:
-- quem ligou, quando começou/terminou, notas ao vivo (autosave) e o DESFECHO,
-- que atualiza o registro CRM/RFM correspondente e a oportunidade da fila.
--
-- Decisões (Gate 0, 10/09/2026):
--  * ids do módulo são BIGSERIAL/SMALLINT (não uuid) — as FKs seguem isso.
--  * status_atendimento REUSA 'em_andamento' (já existe no CHECK) como
--    "ligação em andamento"; NÃO cria 'em_atendimento'.
--  * As RPCs de escrita são chamadas SÓ pelas rotas /api/feedbacks/atendimento/*
--    (service role) DEPOIS de exigirPermissao('feedbacks','atendimento');
--    o atendente vem por parâmetro (da sessão validada), nunca do body.
--    auth.uid() é NULL nesse caminho — por isso não é usado nas RPCs.
--  * O autosave de notas_ao_vivo/telefone_usado é UPDATE direto via
--    supabase-js (RLS authenticated), com `WHERE atendente_id = auth.uid()
--    AND encerrada_em IS NULL` no cliente (mesmo padrão permissivo do módulo).
--  * A fila e o contexto do cockpit ficam em TypeScript (já no ar) — não há
--    fn_fila_atendimento nem fn_contexto_cliente em SQL.
--
-- Rodar no SQL Editor do projeto do Portal (citrhumdkfivdzbmayde). Idempotente.
-- v1.1 (10/09/2026): status_anterior de registro criado na própria ligação = 'aberto'
--   (rodar de novo o arquivo inteiro — CREATE OR REPLACE — para aplicar).
-- Rollback: sql/rollback-feedback-chamada.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. feedback_registros: colunas novas (CHECK de status fica como está)
-- ---------------------------------------------------------------------
ALTER TABLE feedback_registros
  ADD COLUMN IF NOT EXISTS proximo_contato_em date,
  ADD COLUMN IF NOT EXISTS chamadas_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN feedback_registros.proximo_contato_em IS
  'Data combinada/prevista do próximo contato (desfecho retornar / sem_resposta). A Agenda usa esta data quando existir; senão cai no +30 dias.';
COMMENT ON COLUMN feedback_registros.chamadas_count IS
  'Nº de ligações ENCERRADAS deste registro (mantido por trigger em feedback_chamada). Substitui na prática o jsonb `tentativas`, que fica.';

-- ---------------------------------------------------------------------
-- 2. oportunidade_motivo: vira catálogo único de negativa (IC + feedbacks)
-- ---------------------------------------------------------------------
ALTER TABLE oportunidade_motivo
  ADD COLUMN IF NOT EXISTS aplica_a text[] NOT NULL DEFAULT '{ic,feedbacks}';

COMMENT ON COLUMN oportunidade_motivo.aplica_a IS
  'Contextos em que o motivo aparece: ic (mini-CRM da Inteligência Comercial) e/ou feedbacks (cockpit). Os 9 seeds valem para os dois.';

-- ---------------------------------------------------------------------
-- 3. feedback_chamada — uma linha por ligação
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_chamada (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id         bigint NOT NULL REFERENCES feedback_registros(id) ON DELETE CASCADE,
  oportunidade_id     bigint NULL REFERENCES feedback_oportunidades(id) ON DELETE SET NULL,
  cliente_key         text NOT NULL,
  atendente_id        uuid NOT NULL,                 -- da sessão (auth.users.id)
  atendente_nome      text NOT NULL,
  iniciada_em         timestamptz NOT NULL DEFAULT now(),
  encerrada_em        timestamptz NULL,
  duracao_seg         integer GENERATED ALWAYS AS (
                        CASE WHEN encerrada_em IS NULL THEN NULL
                             ELSE (EXTRACT(EPOCH FROM (encerrada_em - iniciada_em)))::integer END
                      ) STORED,
  telefone_usado      text NULL,
  notas_ao_vivo       text NULL,                     -- autosave durante a ligação
  status_anterior     text NULL,                     -- status_atendimento do registro ANTES da ligação (p/ cancelar)
  desfecho            text NULL
                        CHECK (desfecho IN ('servico_agendado','vendeu','retornar','recusou','sem_resposta','numero_errado')),
  motivo_negativa_id  smallint NULL REFERENCES oportunidade_motivo(id),
  motivo_negativa_obs text NULL,
  proximo_contato_em  date NULL,
  servico_previsto_em date NULL,                     -- desfecho servico_agendado (NÃO cria OS nesta fase)
  notas_encerramento  text NULL,
  -- reservado Fase 2 (sem UI ainda)
  humor_cliente       smallint NULL CHECK (humor_cliente BETWEEN 1 AND 5),
  qualidade_conversa  smallint NULL CHECK (qualidade_conversa BETWEEN 1 AND 5),
  script_versao       text NULL,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  -- recusou exige motivo; encerrada exige desfecho
  CONSTRAINT feedback_chamada_recusou_motivo CHECK (desfecho <> 'recusou' OR motivo_negativa_id IS NOT NULL),
  CONSTRAINT feedback_chamada_encerrada_desfecho CHECK (encerrada_em IS NULL OR desfecho IS NOT NULL)
);

COMMENT ON TABLE feedback_chamada IS
  'Ligações do cockpit de atendimento (/feedbacks/atendimento). Uma linha por ligação; o desfecho atualiza feedback_registros e feedback_oportunidades (ver feedback_encerrar_chamada).';

CREATE INDEX IF NOT EXISTS idx_feedback_chamada_feedback   ON feedback_chamada (feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_chamada_cliente    ON feedback_chamada (cliente_key, iniciada_em DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_chamada_abertas    ON feedback_chamada (atendente_id) WHERE encerrada_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_chamada_cli_aberta ON feedback_chamada (cliente_key) WHERE encerrada_em IS NULL;

-- atualizado_em automático (mesmo padrão de feedback_registros)
CREATE OR REPLACE FUNCTION feedback_chamada_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_feedback_chamada_touch ON feedback_chamada;
CREATE TRIGGER tg_feedback_chamada_touch BEFORE UPDATE ON feedback_chamada
  FOR EACH ROW EXECUTE FUNCTION feedback_chamada_touch();

-- ---------------------------------------------------------------------
-- 4. chamadas_count: recontagem (robusta a insert/update/delete)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION feedback_chamada_recontar() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  v_id := COALESCE(NEW.feedback_id, OLD.feedback_id);
  UPDATE feedback_registros r
     SET chamadas_count = (SELECT count(*) FROM feedback_chamada c WHERE c.feedback_id = v_id AND c.encerrada_em IS NOT NULL)
   WHERE r.id = v_id;
  IF TG_OP = 'UPDATE' AND NEW.feedback_id <> OLD.feedback_id THEN
    UPDATE feedback_registros r
       SET chamadas_count = (SELECT count(*) FROM feedback_chamada c WHERE c.feedback_id = OLD.feedback_id AND c.encerrada_em IS NOT NULL)
     WHERE r.id = OLD.feedback_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS tg_feedback_chamada_recontar ON feedback_chamada;
CREATE TRIGGER tg_feedback_chamada_recontar AFTER INSERT OR UPDATE OR DELETE ON feedback_chamada
  FOR EACH ROW EXECUTE FUNCTION feedback_chamada_recontar();

-- ---------------------------------------------------------------------
-- 5. RLS — mesmo padrão do módulo (sql/p1-rls-feedbacks.sql): autenticado
--    lê e escreve; escopo é por permissão de tela, não por linha.
-- ---------------------------------------------------------------------
ALTER TABLE feedback_chamada ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feedback_chamada_select ON feedback_chamada;
DROP POLICY IF EXISTS feedback_chamada_write  ON feedback_chamada;
CREATE POLICY feedback_chamada_select ON feedback_chamada FOR SELECT TO authenticated USING (true);
CREATE POLICY feedback_chamada_write  ON feedback_chamada FOR ALL    TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON feedback_chamada FROM anon;

-- ---------------------------------------------------------------------
-- 6. RPC: iniciar ligação
-- ---------------------------------------------------------------------
-- Cria/reaproveita o registro CRM/RFM, põe status 'em_andamento', abre a
-- chamada. Regras:
--  * chamada aberta do MESMO atendente para o cliente → devolve ela (retomar).
--  * chamada aberta de OUTRO atendente há < 2 h → erro 'EM_ATENDIMENTO_POR:<nome>'.
--  * de outro atendente há ≥ 2 h → encerra a antiga como sem_resposta (nota
--    automática) e abre a nova.
--  * p_registro_id → usa esse registro; senão p_oportunidade_id → registro já
--    ligado (feedback_id) ou cria (R4 → crm, demais → rfm); senão o registro
--    aberto mais recente do cliente, ou cria um rfm.
CREATE OR REPLACE FUNCTION feedback_iniciar_chamada(
  p_cliente_key     text,
  p_atendente_id    uuid,
  p_atendente_nome  text,
  p_oportunidade_id bigint DEFAULT NULL,
  p_registro_id     bigint DEFAULT NULL,
  p_telefone        text   DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aberta      feedback_chamada%ROWTYPE;
  v_reg         feedback_registros%ROWTYPE;
  v_op          feedback_oportunidades%ROWTYPE;
  v_codigo      text;
  v_nome        text;
  v_tipo        text;
  v_chamada_id  uuid;
  v_reaproveitada boolean := false;
  v_status_anterior text;
BEGIN
  IF p_cliente_key IS NULL OR p_cliente_key = '' THEN
    RAISE EXCEPTION 'CLIENTE_KEY_OBRIGATORIA';
  END IF;
  IF p_atendente_id IS NULL OR COALESCE(p_atendente_nome, '') = '' THEN
    RAISE EXCEPTION 'ATENDENTE_OBRIGATORIO';
  END IF;

  -- 1) chamada aberta para este cliente?
  SELECT * INTO v_aberta FROM feedback_chamada
   WHERE cliente_key = p_cliente_key AND encerrada_em IS NULL
   ORDER BY iniciada_em DESC LIMIT 1;

  IF FOUND THEN
    IF v_aberta.atendente_id = p_atendente_id THEN
      RETURN jsonb_build_object('chamada_id', v_aberta.id, 'feedback_id', v_aberta.feedback_id, 'reaproveitada', true);
    ELSIF v_aberta.iniciada_em > now() - interval '2 hours' THEN
      RAISE EXCEPTION 'EM_ATENDIMENTO_POR:%', v_aberta.atendente_nome;
    ELSE
      -- ficou aberta e esquecida: encerra como sem_resposta, com nota automática
      UPDATE feedback_chamada
         SET encerrada_em = now(),
             desfecho = 'sem_resposta',
             notas_encerramento = COALESCE(notas_encerramento || E'\n', '') ||
               '[automático] Encerrada pelo sistema: ficou aberta por mais de 2 h e outro atendente iniciou nova ligação.'
       WHERE id = v_aberta.id;
    END IF;
  END IF;

  -- 2) resolve o registro
  IF p_registro_id IS NOT NULL THEN
    SELECT * INTO v_reg FROM feedback_registros WHERE id = p_registro_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'REGISTRO_NAO_ENCONTRADO:%', p_registro_id; END IF;
  ELSIF p_oportunidade_id IS NOT NULL THEN
    SELECT * INTO v_op FROM feedback_oportunidades WHERE id = p_oportunidade_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'OPORTUNIDADE_NAO_ENCONTRADA:%', p_oportunidade_id; END IF;
    IF v_op.feedback_id IS NOT NULL THEN
      SELECT * INTO v_reg FROM feedback_registros WHERE id = v_op.feedback_id;
    END IF;
    IF v_reg.id IS NULL THEN
      v_tipo := CASE WHEN v_op.regra = 'R4_followup' THEN 'crm' ELSE 'rfm' END;
      INSERT INTO feedback_registros (tipo, nome, telefone, trator, codigo_omie, motivo, prioridade,
                                      atendente_id, atendente_nome, aberto_em, status_atendimento, origem_dados)
      VALUES (v_tipo, v_op.cliente_nome, p_telefone, v_op.trator, v_op.codigo_omie,
              CASE WHEN v_tipo = 'rfm' THEN v_op.regra ELSE NULL END,
              CASE WHEN v_tipo = 'rfm' THEN (CASE WHEN v_op.prioridade = 'Urgente' THEN 'Urgente' ELSE 'Normal' END) ELSE NULL END,
              p_atendente_id::text, p_atendente_nome, now(), 'em_andamento',
              COALESCE(v_op.detalhes->>'origem', NULL))
      RETURNING * INTO v_reg;
      v_reaproveitada := false;
    END IF;
  ELSE
    -- sem ids: registro aberto mais recente do cliente (por código ou nome da key)
    v_codigo := CASE WHEN p_cliente_key LIKE 'omie\_%' ESCAPE '\' THEN substr(p_cliente_key, 6) END;
    v_nome   := CASE WHEN p_cliente_key LIKE 'nome\_%' ESCAPE '\' THEN substr(p_cliente_key, 6) END;
    SELECT * INTO v_reg FROM feedback_registros r
     WHERE r.status_atendimento IN ('aberto','em_andamento')
       AND ((v_codigo IS NOT NULL AND r.codigo_omie = v_codigo)
         OR (v_nome IS NOT NULL AND upper(btrim(r.nome)) = v_nome))
     ORDER BY r.aberto_em DESC NULLS LAST, r.criado_em DESC LIMIT 1;
    IF NOT FOUND THEN
      IF v_nome IS NULL THEN
        SELECT COALESCE(ci.nome, c.nome_fantasia, c.razao_social) INTO v_nome
          FROM (SELECT 1) x
          LEFT JOIN feedback_clientes_info ci ON ci.cliente_key = p_cliente_key
          LEFT JOIN portal_nt_clientes_cadastro_omie c ON c.cod_cli::text = v_codigo
          LIMIT 1;
      END IF;
      IF COALESCE(v_nome, '') = '' THEN RAISE EXCEPTION 'CLIENTE_SEM_NOME:%', p_cliente_key; END IF;
      INSERT INTO feedback_registros (tipo, nome, telefone, codigo_omie, atendente_id, atendente_nome, aberto_em, status_atendimento)
      VALUES ('rfm', v_nome, p_telefone, v_codigo, p_atendente_id::text, p_atendente_nome, now(), 'em_andamento')
      RETURNING * INTO v_reg;
    END IF;
  END IF;

  -- status a devolver se a ligação for CANCELADA: o que o registro tinha antes;
  -- registro que nasceu nesta ligação volta a 'aberto' (nunca fica "em andamento" órfão)
  v_status_anterior := CASE WHEN v_reg.status_atendimento = 'em_andamento' THEN 'aberto' ELSE v_reg.status_atendimento END;

  -- 3) registro passa a "em andamento" com o atendente da sessão
  UPDATE feedback_registros
     SET status_atendimento = 'em_andamento',
         atendente_id   = p_atendente_id::text,
         atendente_nome = p_atendente_nome,
         aberto_em      = COALESCE(aberto_em, now())
   WHERE id = v_reg.id;

  -- 4) abre a chamada
  INSERT INTO feedback_chamada (feedback_id, oportunidade_id, cliente_key, atendente_id, atendente_nome, telefone_usado, status_anterior)
  VALUES (v_reg.id, p_oportunidade_id, p_cliente_key, p_atendente_id, p_atendente_nome, p_telefone, v_status_anterior)
  RETURNING id INTO v_chamada_id;

  RETURN jsonb_build_object('chamada_id', v_chamada_id, 'feedback_id', v_reg.id, 'reaproveitada', v_reaproveitada);
END $$;

-- ---------------------------------------------------------------------
-- 7. RPC: encerrar ligação (idempotente)
-- ---------------------------------------------------------------------
-- p_payload: { desfecho, motivo_negativa_id?, motivo_negativa_obs?,
--              proximo_contato_em?, servico_previsto_em?, notas_encerramento?,
--              telefone_usado?, humor_cliente?, qualidade_conversa? }
-- Efeitos em feedback_registros / feedback_oportunidades (tabela do §5 do prompt):
--   servico_agendado → concluido, prox=null,  oportunidade atendida
--   vendeu           → concluido, prox=null,  oportunidade atendida
--   retornar         → aberto,    prox OBRIGATÓRIO, oportunidade continua aberta
--   recusou          → concluido (+motivo no registro), oportunidade atendida
--   sem_resposta     → sem_resposta (ou 'aberto' se o registro tem < 24 h de
--                      aberto_em — regra das 24 h), prox default +30 d
--   numero_errado    → aberto, prox=null, tag "pendência cadastral" na pasta
CREATE OR REPLACE FUNCTION feedback_encerrar_chamada(
  p_chamada_id   uuid,
  p_atendente_id uuid,
  p_payload      jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ch        feedback_chamada%ROWTYPE;
  v_reg       feedback_registros%ROWTYPE;
  v_desfecho  text := p_payload->>'desfecho';
  v_motivo_id smallint := NULLIF(p_payload->>'motivo_negativa_id','')::smallint;
  v_motivo_nm text;
  v_prox      date := NULLIF(p_payload->>'proximo_contato_em','')::date;
  v_serv      date := NULLIF(p_payload->>'servico_previsto_em','')::date;
  v_novo_status text;
  v_novo_prox   date;
  v_tag       text := '!!#Pendências Cadastrais#!!';
BEGIN
  SELECT * INTO v_ch FROM feedback_chamada WHERE id = p_chamada_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHAMADA_NAO_ENCONTRADA'; END IF;
  IF v_ch.atendente_id <> p_atendente_id THEN RAISE EXCEPTION 'CHAMADA_DE_OUTRO_ATENDENTE:%', v_ch.atendente_nome; END IF;

  -- idempotência: já encerrada com o MESMO desfecho → ok, sem duplicar efeitos
  IF v_ch.encerrada_em IS NOT NULL THEN
    IF v_ch.desfecho = v_desfecho THEN
      RETURN jsonb_build_object('ok', true, 'ja_encerrada', true, 'feedback_id', v_ch.feedback_id);
    END IF;
    RAISE EXCEPTION 'JA_ENCERRADA_COM_OUTRO_DESFECHO:%', v_ch.desfecho;
  END IF;

  IF v_desfecho IS NULL OR v_desfecho NOT IN ('servico_agendado','vendeu','retornar','recusou','sem_resposta','numero_errado') THEN
    RAISE EXCEPTION 'DESFECHO_INVALIDO:%', COALESCE(v_desfecho, 'null');
  END IF;
  IF v_desfecho = 'recusou' AND v_motivo_id IS NULL THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
  IF v_desfecho = 'retornar' AND v_prox IS NULL THEN RAISE EXCEPTION 'PROXIMO_CONTATO_OBRIGATORIO'; END IF;
  IF v_motivo_id IS NOT NULL THEN
    SELECT nome INTO v_motivo_nm FROM oportunidade_motivo WHERE id = v_motivo_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'MOTIVO_NAO_ENCONTRADO:%', v_motivo_id; END IF;
  END IF;

  SELECT * INTO v_reg FROM feedback_registros WHERE id = v_ch.feedback_id;

  -- efeitos
  CASE v_desfecho
    WHEN 'servico_agendado' THEN v_novo_status := 'concluido';    v_novo_prox := NULL;
    WHEN 'vendeu'           THEN v_novo_status := 'concluido';    v_novo_prox := NULL;
    WHEN 'recusou'          THEN v_novo_status := 'concluido';    v_novo_prox := NULL;
    WHEN 'retornar'         THEN v_novo_status := 'aberto';       v_novo_prox := v_prox;
    WHEN 'numero_errado'    THEN v_novo_status := 'aberto';       v_novo_prox := NULL;
    WHEN 'sem_resposta'     THEN
      v_novo_prox := COALESCE(v_prox, (current_date + 30));
      -- regra das 24 h (mesma do ModalFeedback): não vira sem_resposta cedo demais
      IF v_reg.aberto_em IS NOT NULL AND v_reg.aberto_em > now() - interval '24 hours' THEN
        v_novo_status := 'aberto';
      ELSE
        v_novo_status := 'sem_resposta';
      END IF;
  END CASE;

  -- 1) chamada
  UPDATE feedback_chamada
     SET encerrada_em        = now(),
         desfecho            = v_desfecho,
         motivo_negativa_id  = v_motivo_id,
         motivo_negativa_obs = NULLIF(p_payload->>'motivo_negativa_obs',''),
         proximo_contato_em  = v_novo_prox,
         servico_previsto_em = v_serv,
         notas_encerramento  = NULLIF(p_payload->>'notas_encerramento',''),
         telefone_usado      = COALESCE(NULLIF(p_payload->>'telefone_usado',''), telefone_usado),
         humor_cliente       = NULLIF(p_payload->>'humor_cliente','')::smallint,
         qualidade_conversa  = NULLIF(p_payload->>'qualidade_conversa','')::smallint
   WHERE id = p_chamada_id;

  -- 2) registro CRM/RFM
  UPDATE feedback_registros
     SET status_atendimento = v_novo_status,
         proximo_contato_em = v_novo_prox,
         concluido_em       = CASE WHEN v_novo_status = 'concluido' THEN now() ELSE concluido_em END,
         sem_resposta       = CASE WHEN v_novo_status = 'sem_resposta' THEN true ELSE sem_resposta END,
         data_contato       = COALESCE(data_contato, current_date),
         motivo             = CASE WHEN v_desfecho = 'recusou' THEN COALESCE(v_motivo_nm, motivo) ELSE motivo END,
         acao               = CASE WHEN tipo = 'rfm' AND NULLIF(p_payload->>'notas_encerramento','') IS NOT NULL
                                   THEN COALESCE(acao || E'\n', '') || (p_payload->>'notas_encerramento') ELSE acao END,
         feedback           = CASE WHEN tipo = 'crm' AND NULLIF(p_payload->>'notas_encerramento','') IS NOT NULL
                                   THEN COALESCE(feedback || E'\n', '') || (p_payload->>'notas_encerramento') ELSE feedback END,
         tentativas         = COALESCE(tentativas, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                                'data', now(), 'canal', 'telefone',
                                'observacao', 'ligação ' || v_desfecho || COALESCE(' · ' || v_motivo_nm, '')))
   WHERE id = v_ch.feedback_id;

  -- 3) oportunidade da fila
  IF v_ch.oportunidade_id IS NOT NULL AND v_desfecho IN ('servico_agendado','vendeu','recusou') THEN
    UPDATE feedback_oportunidades
       SET status = 'atendida', atendida_por = v_ch.atendente_nome, atendida_em = now(), feedback_id = v_ch.feedback_id
     WHERE id = v_ch.oportunidade_id AND status = 'aberta';
  END IF;

  -- 4) número errado → pendência cadastral na pasta do cliente
  IF v_desfecho = 'numero_errado' THEN
    INSERT INTO feedback_clientes_info (cliente_key, codigo_omie, nome, tags)
    VALUES (v_ch.cliente_key, v_reg.codigo_omie, v_reg.nome, jsonb_build_array(v_tag))
    ON CONFLICT (cliente_key) DO UPDATE
      SET tags = CASE WHEN feedback_clientes_info.tags ? v_tag THEN feedback_clientes_info.tags
                      ELSE COALESCE(feedback_clientes_info.tags, '[]'::jsonb) || jsonb_build_array(v_tag) END,
          atualizado_em = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'feedback_id', v_ch.feedback_id, 'status_atendimento', v_novo_status, 'proximo_contato_em', v_novo_prox);
END $$;

-- ---------------------------------------------------------------------
-- 8. RPC: cancelar ligação (só se não houve nota) — apaga a chamada e
--    devolve o registro ao status anterior.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION feedback_cancelar_chamada(
  p_chamada_id   uuid,
  p_atendente_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ch feedback_chamada%ROWTYPE;
BEGIN
  SELECT * INTO v_ch FROM feedback_chamada WHERE id = p_chamada_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'ja_removida', true); END IF;
  IF v_ch.atendente_id <> p_atendente_id THEN RAISE EXCEPTION 'CHAMADA_DE_OUTRO_ATENDENTE:%', v_ch.atendente_nome; END IF;
  IF v_ch.encerrada_em IS NOT NULL THEN RAISE EXCEPTION 'JA_ENCERRADA'; END IF;
  IF COALESCE(btrim(v_ch.notas_ao_vivo), '') <> '' THEN RAISE EXCEPTION 'TEM_NOTAS'; END IF;

  DELETE FROM feedback_chamada WHERE id = p_chamada_id;
  UPDATE feedback_registros
     SET status_atendimento = COALESCE(v_ch.status_anterior, 'aberto')
   WHERE id = v_ch.feedback_id AND status_atendimento = 'em_andamento';
  RETURN jsonb_build_object('ok', true, 'feedback_id', v_ch.feedback_id);
END $$;

-- ---------------------------------------------------------------------
-- 9. Grants: as RPCs são chamadas pelas rotas (service role). Nada para anon.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION feedback_iniciar_chamada(text, uuid, text, bigint, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION feedback_encerrar_chamada(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION feedback_cancelar_chamada(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION feedback_iniciar_chamada(text, uuid, text, bigint, bigint, text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION feedback_encerrar_chamada(uuid, uuid, jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION feedback_cancelar_chamada(uuid, uuid) TO service_role, authenticated;

-- PostgREST: enxergar a tabela/funções novas sem esperar o cache
NOTIFY pgrst, 'reload schema';
