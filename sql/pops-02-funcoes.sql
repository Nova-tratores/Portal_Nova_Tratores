-- =============================================================================
-- POPs — FASE 2: funções transacionais (chamadas SÓ pela service role)
-- Portal Nova Tratores. Rodar no SQL Editor DEPOIS de sql/pops-01-schema.sql.
-- Idempotente (CREATE OR REPLACE).
--
-- Por que funções: o supabase-js não tem transação. Publicar (obsoletar a
-- anterior + publicar + fechar o ticket de revisão), duplicar (POP + versão +
-- N passos), gerar código e criar a execução (ticket + execução, idempotente)
-- não podem ficar pela metade.
--
-- Segurança: SECURITY INVOKER (padrão) + REVOKE de PUBLIC/anon/authenticated →
-- só a service role executa. QUEM pode fazer cada coisa é decidido na rota
-- (/api/pops/*, sessão + permissão); aqui ficam as regras de integridade, que
-- os triggers da Fase 1 reforçam. Todo autor vem por parâmetro da rota (sessão),
-- nunca do corpo da requisição.
--
-- Erros de regra: RAISE com mensagem começando por 'POP:' e ERRCODE P0001 —
-- a rota devolve 400/409 com a mensagem.
-- =============================================================================

-- ---------------------------------------------------------------------
-- "Hoje" no fuso da loja (o banco roda em UTC: current_date vira amanhã às 21h).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_hoje()
RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $$;

-- ---------------------------------------------------------------------
-- Código do POP: OFI-001 (comum) ou MOD-OFI-001 (modelo do sistema). Atômico.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_gerar_codigo(p_area uuid, p_modelo boolean)
RETURNS text LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_sigla text;
  v_n int;
BEGIN
  IF p_modelo THEN
    UPDATE pops_areas SET proximo_numero_modelo = proximo_numero_modelo + 1
     WHERE id = p_area RETURNING sigla, proximo_numero_modelo - 1 INTO v_sigla, v_n;
  ELSE
    UPDATE pops_areas SET proximo_numero = proximo_numero + 1
     WHERE id = p_area RETURNING sigla, proximo_numero - 1 INTO v_sigla, v_n;
  END IF;
  IF v_sigla IS NULL THEN
    RAISE EXCEPTION 'POP: área não encontrada.';
  END IF;
  RETURN CASE WHEN p_modelo THEN 'MOD-' ELSE '' END || v_sigla || '-' || lpad(v_n::text, 3, '0');
END $$;

-- ---------------------------------------------------------------------
-- Copia os passos de uma versão para outra (mantendo a chave = mesma linhagem).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_copiar_passos(p_de uuid, p_para uuid, p_manter_chave boolean)
RETURNS int LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  n int;
BEGIN
  INSERT INTO pops_passos (versao_id, ordem, chave, tipo, titulo, ajuda, obrigatorio, config, midia_path, condicao)
  SELECT p_para, ordem, CASE WHEN p_manter_chave THEN chave ELSE gen_random_uuid() END,
         tipo, titulo, ajuda, obrigatorio, config, midia_path, condicao
    FROM pops_passos WHERE versao_id = p_de ORDER BY ordem;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ---------------------------------------------------------------------
-- Criar POP (com a v1 em rascunho). p_template_tipo: NULL ou 'sistema'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_criar(
  p_area uuid, p_titulo text, p_dono uuid, p_autor uuid,
  p_template_tipo text DEFAULT NULL, p_periodicidade int DEFAULT 365
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_codigo text;
  v_pop uuid;
  v_versao uuid;
BEGIN
  IF p_template_tipo IS NOT NULL AND p_template_tipo <> 'sistema' THEN
    RAISE EXCEPTION 'POP: modelo de empresa nasce promovendo um POP existente.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pops_areas WHERE id = p_area AND ativo) THEN
    RAISE EXCEPTION 'POP: área inexistente ou inativa.';
  END IF;
  v_codigo := pops_gerar_codigo(p_area, p_template_tipo IS NOT NULL);
  INSERT INTO pops (area_id, codigo, titulo, dono_id, eh_template, template_tipo,
                    periodicidade_revisao_dias, criado_por)
  VALUES (p_area, v_codigo, btrim(p_titulo), p_dono, p_template_tipo IS NOT NULL, p_template_tipo,
          coalesce(p_periodicidade, 365), p_autor)
  RETURNING id INTO v_pop;
  INSERT INTO pops_versoes (pop_id, numero, criado_por) VALUES (v_pop, 1, p_autor) RETURNING id INTO v_versao;
  RETURN jsonb_build_object('pop_id', v_pop, 'versao_id', v_versao, 'codigo', v_codigo);
END $$;

-- ---------------------------------------------------------------------
-- Nova versão a partir da PUBLICADA (editar POP publicado = v(n+1) rascunho).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_nova_versao(p_pop uuid, p_autor uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_base pops_versoes%ROWTYPE;
  v_num int;
  v_nova uuid;
BEGIN
  PERFORM 1 FROM pops WHERE id = p_pop FOR UPDATE;   -- serializa com publicar/outra nova versão
  IF EXISTS (SELECT 1 FROM pops_versoes WHERE pop_id = p_pop AND estado IN ('rascunho', 'em_revisao')) THEN
    RAISE EXCEPTION 'POP: já existe uma versão em edição ou em revisão.';
  END IF;
  SELECT * INTO v_base FROM pops_versoes WHERE pop_id = p_pop AND estado = 'publicado';
  IF v_base.id IS NULL THEN
    RAISE EXCEPTION 'POP: sem versão publicada para copiar.';
  END IF;
  SELECT max(numero) + 1 INTO v_num FROM pops_versoes WHERE pop_id = p_pop;
  INSERT INTO pops_versoes (pop_id, numero, objetivo, escopo, materiais, criado_por)
  VALUES (p_pop, v_num, v_base.objetivo, v_base.escopo, v_base.materiais, p_autor)
  RETURNING id INTO v_nova;
  PERFORM pops_copiar_passos(v_base.id, v_nova, true);
  RETURN v_nova;
END $$;

-- ---------------------------------------------------------------------
-- Salvar rascunho: cabeçalho (chaves presentes) + lista INTEIRA de passos
-- (substitui os passos do rascunho de uma vez — reordenar sem colidir na ordem).
-- p_passos: [{chave?, tipo, titulo, ajuda?, obrigatorio?, config?, midia_path?}]
-- A forma de cada passo já vem validada pela rota (lib/pops/regras.ts).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_salvar_rascunho(p_versao uuid, p_cabecalho jsonb, p_passos jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM pops_versoes WHERE id = p_versao FOR UPDATE;
  IF v_estado IS NULL THEN RAISE EXCEPTION 'POP: versão não encontrada.'; END IF;
  IF v_estado <> 'rascunho' THEN RAISE EXCEPTION 'POP: só rascunho pode ser editado (esta versão está %).', v_estado; END IF;

  IF p_cabecalho IS NOT NULL THEN
    UPDATE pops_versoes SET
      objetivo  = CASE WHEN p_cabecalho ? 'objetivo'  THEN coalesce(p_cabecalho ->> 'objetivo', '')  ELSE objetivo END,
      escopo    = CASE WHEN p_cabecalho ? 'escopo'    THEN coalesce(p_cabecalho ->> 'escopo', '')    ELSE escopo END,
      materiais = CASE WHEN p_cabecalho ? 'materiais' THEN coalesce(p_cabecalho ->> 'materiais', '') ELSE materiais END
    WHERE id = p_versao;
  END IF;

  IF p_passos IS NOT NULL THEN
    IF jsonb_typeof(p_passos) <> 'array' THEN RAISE EXCEPTION 'POP: passos devem ser uma lista.'; END IF;
    DELETE FROM pops_passos WHERE versao_id = p_versao;
    INSERT INTO pops_passos (versao_id, ordem, chave, tipo, titulo, ajuda, obrigatorio, config, midia_path)
    SELECT p_versao, e.ord::int,
           CASE WHEN coalesce(e.p ->> 'chave', '') ~ '^[0-9a-fA-F-]{36}$' THEN (e.p ->> 'chave')::uuid ELSE gen_random_uuid() END,
           e.p ->> 'tipo',
           btrim(e.p ->> 'titulo'),
           coalesce(e.p ->> 'ajuda', ''),
           coalesce((e.p ->> 'obrigatorio')::boolean, true),
           coalesce(e.p -> 'config', '{}'::jsonb),
           nullif(e.p ->> 'midia_path', '')
      FROM jsonb_array_elements(p_passos) WITH ORDINALITY AS e(p, ord);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Submeter para revisão: versão → em_revisao + ticket 'pop_revisao' (bola com
-- o aprovador). Devolve o id do ticket.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_submeter(p_versao uuid, p_autor uuid, p_aprovador uuid, p_changelog text)
RETURNS uuid LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v pops_versoes%ROWTYPE;
  p pops%ROWTYPE;
  v_ticket uuid;
BEGIN
  SELECT * INTO v FROM pops_versoes WHERE id = p_versao FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'POP: versão não encontrada.'; END IF;
  IF v.estado <> 'rascunho' THEN RAISE EXCEPTION 'POP: só rascunho vai para revisão (está %).', v.estado; END IF;
  IF char_length(btrim(coalesce(p_changelog, ''))) = 0 THEN RAISE EXCEPTION 'POP: descreva o que mudou (changelog).'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pops_passos WHERE versao_id = p_versao) THEN
    RAISE EXCEPTION 'POP: inclua pelo menos um passo antes de enviar para revisão.';
  END IF;
  SELECT * INTO p FROM pops WHERE id = v.pop_id;

  INSERT INTO tickets (tipo, titulo, descricao, categoria, status, aceite, visibilidade,
                       solicitante_id, responsavel_id, payload)
  VALUES ('pop_revisao',
          'Aprovar ' || p.codigo || ' v' || v.numero || ' — ' || p.titulo,
          btrim(p_changelog), 'POP', 'aguardando_interno', 'ok', 'privado',
          p_autor, p_aprovador,
          jsonb_build_object('pop_id', p.id, 'versao_id', v.id, 'numero', v.numero, 'codigo', p.codigo))
  RETURNING id INTO v_ticket;

  INSERT INTO tickets_participantes (ticket_id, user_id, adicionado_por) VALUES
    (v_ticket, p_autor, NULL), (v_ticket, p_aprovador, p_autor)
  ON CONFLICT (ticket_id, user_id) DO NOTHING;
  INSERT INTO tickets_eventos (ticket_id, autor_id, tipo, payload) VALUES
    (v_ticket, p_autor, 'criacao', jsonb_build_object('titulo', 'Revisão de ' || p.codigo, 'responsavel_id', p_aprovador)),
    (v_ticket, p_autor, 'pop_revisao_submetida',
     jsonb_build_object('pop_id', p.id, 'versao_id', v.id, 'numero', v.numero, 'changelog', btrim(p_changelog)));

  UPDATE pops_versoes SET estado = 'em_revisao', changelog = btrim(p_changelog),
         submetido_por = p_autor, submetido_em = now(), revisao_ticket_id = v_ticket
   WHERE id = p_versao;
  RETURN v_ticket;
END $$;

-- ---------------------------------------------------------------------
-- Aprovar (publica; a anterior vira obsoleta) ou reprovar (volta a rascunho).
-- O ticket de revisão FECHA nos dois casos; a decisão fica na timeline.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_decidir_revisao(p_versao uuid, p_aprovador uuid, p_aprovar boolean, p_parecer text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v pops_versoes%ROWTYPE;
  v_anterior uuid;
  v_status_ant text;
BEGIN
  SELECT * INTO v FROM pops_versoes WHERE id = p_versao;
  IF v.id IS NULL THEN RAISE EXCEPTION 'POP: versão não encontrada.'; END IF;
  PERFORM 1 FROM pops WHERE id = v.pop_id FOR UPDATE;              -- um publica por vez
  SELECT * INTO v FROM pops_versoes WHERE id = p_versao FOR UPDATE;
  IF v.estado <> 'em_revisao' THEN RAISE EXCEPTION 'POP: esta versão não está em revisão (está %).', v.estado; END IF;
  IF NOT p_aprovar AND char_length(btrim(coalesce(p_parecer, ''))) = 0 THEN
    RAISE EXCEPTION 'POP: diga o motivo da reprovação.';
  END IF;

  IF p_aprovar THEN
    UPDATE pops_versoes SET estado = 'obsoleto', obsoleto_em = now()
     WHERE pop_id = v.pop_id AND estado = 'publicado' RETURNING id INTO v_anterior;
    UPDATE pops_versoes SET estado = 'publicado', aprovado_por = p_aprovador, aprovado_em = now(),
           publicado_por = p_aprovador, publicado_em = now()
     WHERE id = p_versao;
    UPDATE pops SET proxima_revisao_em = pops_hoje() + periodicidade_revisao_dias,
           revisado_em = now(), revisado_por = p_aprovador
     WHERE id = v.pop_id;
  ELSE
    UPDATE pops_versoes SET estado = 'rascunho' WHERE id = p_versao;
  END IF;

  IF v.revisao_ticket_id IS NOT NULL THEN
    SELECT status INTO v_status_ant FROM tickets WHERE id = v.revisao_ticket_id;
    UPDATE tickets SET status = 'fechado', resolvido_em = now(), fechado_em = now(),
           ultima_atividade_em = now(), updated_at = now()
     WHERE id = v.revisao_ticket_id;
    INSERT INTO tickets_eventos (ticket_id, autor_id, tipo, payload) VALUES
      (v.revisao_ticket_id, p_aprovador,
       CASE WHEN p_aprovar THEN 'pop_revisao_aprovada' ELSE 'pop_revisao_reprovada' END,
       jsonb_build_object('pop_id', v.pop_id, 'versao_id', v.id, 'numero', v.numero,
                          'parecer', nullif(btrim(coalesce(p_parecer, '')), ''))),
      (v.revisao_ticket_id, p_aprovador, 'status',
       jsonb_build_object('de', v_status_ant, 'para', 'fechado'));
    DELETE FROM tickets_plano WHERE ticket_id = v.revisao_ticket_id;
  END IF;

  RETURN jsonb_build_object('pop_id', v.pop_id, 'versao_id', v.id, 'numero', v.numero,
                            'aprovado', p_aprovar, 'anterior_id', v_anterior,
                            'ticket_id', v.revisao_ticket_id, 'submetido_por', v.submetido_por);
END $$;

-- ---------------------------------------------------------------------
-- Duplicar (modelo → POP da empresa, ou POP comum → outra área/loja).
-- Copia a versão PUBLICADA da origem para um POP novo em rascunho v1.
-- A origem não é tocada.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_duplicar(p_origem uuid, p_area uuid, p_dono uuid, p_autor uuid, p_titulo text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  o pops%ROWTYPE;
  ov pops_versoes%ROWTYPE;
  v_codigo text;
  v_pop uuid;
  v_versao uuid;
BEGIN
  SELECT * INTO o FROM pops WHERE id = p_origem;
  IF o.id IS NULL THEN RAISE EXCEPTION 'POP: origem não encontrada.'; END IF;
  SELECT * INTO ov FROM pops_versoes WHERE pop_id = p_origem AND estado = 'publicado';
  IF ov.id IS NULL THEN RAISE EXCEPTION 'POP: a origem não tem versão publicada para duplicar.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pops_areas WHERE id = p_area AND ativo) THEN
    RAISE EXCEPTION 'POP: área inexistente ou inativa.';
  END IF;

  v_codigo := pops_gerar_codigo(p_area, false);
  INSERT INTO pops (area_id, codigo, titulo, dono_id, periodicidade_revisao_dias, criado_por,
                    origem_template_id, origem_template_versao, origem_pop_id)
  VALUES (p_area, v_codigo, coalesce(nullif(btrim(p_titulo), ''), o.titulo), p_dono,
          o.periodicidade_revisao_dias, p_autor,
          CASE WHEN o.eh_template THEN o.id END,
          CASE WHEN o.eh_template THEN ov.numero END,
          CASE WHEN o.eh_template THEN NULL ELSE o.id END)
  RETURNING id INTO v_pop;
  INSERT INTO pops_versoes (pop_id, numero, objetivo, escopo, materiais, criado_por)
  VALUES (v_pop, 1, ov.objetivo, ov.escopo, ov.materiais, p_autor) RETURNING id INTO v_versao;
  PERFORM pops_copiar_passos(ov.id, v_versao, false);
  RETURN jsonb_build_object('pop_id', v_pop, 'versao_id', v_versao, 'codigo', v_codigo,
                            'origem_versao', ov.numero);
END $$;

-- ---------------------------------------------------------------------
-- Criar EXECUÇÃO: ticket 'pop' + pops_execucoes, sempre na versão publicada
-- vigente. Recorrente (agendamento + data) já existente → devolve NULL e não
-- cria nada (idempotência do cron; o ticket é desfeito junto).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_criar_execucao(
  p_pop uuid, p_solicitante uuid, p_responsavel uuid,
  p_prazo date DEFAULT NULL, p_ref_externa text DEFAULT NULL,
  p_agendamento uuid DEFAULT NULL, p_data_referencia date DEFAULT NULL,
  p_visibilidade text DEFAULT 'privado'
) RETURNS uuid LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  p pops%ROWTYPE;
  v pops_versoes%ROWTYPE;
  v_ticket uuid;
  v_ref text := nullif(btrim(coalesce(p_ref_externa, '')), '');
BEGIN
  SELECT * INTO p FROM pops WHERE id = p_pop;
  IF p.id IS NULL THEN RAISE EXCEPTION 'POP: não encontrado.'; END IF;
  IF p.arquivado THEN RAISE EXCEPTION 'POP: arquivado — não pode ser executado.'; END IF;
  IF p.template_tipo = 'sistema' THEN RAISE EXCEPTION 'POP: modelo do sistema não é executado; duplique para a sua área.'; END IF;
  SELECT * INTO v FROM pops_versoes WHERE pop_id = p_pop AND estado = 'publicado';
  IF v.id IS NULL THEN RAISE EXCEPTION 'POP: sem versão publicada para executar.'; END IF;

  -- Recorrente já gerado: sai antes de criar qualquer coisa.
  IF p_agendamento IS NOT NULL AND EXISTS (
       SELECT 1 FROM pops_execucoes WHERE agendamento_id = p_agendamento AND data_referencia = p_data_referencia) THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO tickets (tipo, titulo, descricao, categoria, status, aceite, visibilidade, prazo,
                         solicitante_id, responsavel_id, payload)
    VALUES ('pop',
            p.codigo || ' — ' || p.titulo || coalesce(' · ' || v_ref, ''),
            'Execução do ' || p.codigo || ' v' || v.numero || ' — ' || p.titulo, 'POP', 'aberto', 'ok',
            CASE WHEN p_visibilidade = 'publico' THEN 'publico' ELSE 'privado' END,
            coalesce(p_prazo, p_data_referencia),
            p_solicitante, p_responsavel,
            jsonb_build_object('pop_id', p.id, 'pop_versao_id', v.id, 'versao_numero', v.numero,
                               'codigo', p.codigo, 'ref_externa', v_ref,
                               'agendamento_id', p_agendamento, 'data_referencia', p_data_referencia))
    RETURNING id INTO v_ticket;

    INSERT INTO pops_execucoes (ticket_id, pop_id, versao_id, agendamento_id, data_referencia, ref_externa)
    VALUES (v_ticket, p.id, v.id, p_agendamento, coalesce(p_data_referencia, pops_hoje()), v_ref);
  EXCEPTION WHEN unique_violation THEN
    RETURN NULL;   -- corrida entre dois crons: o bloco desfaz o ticket
  END;

  INSERT INTO tickets_participantes (ticket_id, user_id, adicionado_por) VALUES
    (v_ticket, p_solicitante, NULL), (v_ticket, p_responsavel, p_solicitante)
  ON CONFLICT (ticket_id, user_id) DO NOTHING;
  INSERT INTO tickets_eventos (ticket_id, autor_id, tipo, payload) VALUES
    (v_ticket, CASE WHEN p_agendamento IS NULL THEN p_solicitante END, 'criacao',
     jsonb_build_object('titulo', p.codigo || ' v' || v.numero, 'responsavel_id', p_responsavel,
                        'pop_id', p.id, 'versao_id', v.id, 'ref_externa', v_ref,
                        'recorrente', p_agendamento IS NOT NULL));
  RETURN v_ticket;
END $$;

-- ---------------------------------------------------------------------
-- Registrar resposta de UM passo (salva na hora; pode ser refeita).
-- Calcula fora da faixa, grava evento pop_resposta (+ pop_alerta) e tira o
-- ticket de 'aberto' na primeira resposta. A forma do valor vem validada da rota.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_responder(
  p_ticket uuid, p_passo uuid, p_valor jsonb, p_fotos text[], p_autor uuid
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  e pops_execucoes%ROWTYPE;
  ps pops_passos%ROWTYPE;
  v_status text;
  v_num numeric;
  v_min numeric;
  v_max numeric;
  v_fora boolean := false;
  v_refeito boolean;
  v_alerta_antes boolean;
BEGIN
  SELECT status INTO v_status FROM tickets WHERE id = p_ticket AND tipo = 'pop' FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'POP: execução não encontrada.'; END IF;
  IF v_status IN ('resolvido', 'fechado', 'cancelado') THEN
    RAISE EXCEPTION 'POP: execução % — reabra para mudar respostas.', v_status;
  END IF;
  SELECT * INTO e FROM pops_execucoes WHERE ticket_id = p_ticket;
  SELECT * INTO ps FROM pops_passos WHERE id = p_passo AND versao_id = e.versao_id;
  IF ps.id IS NULL THEN RAISE EXCEPTION 'POP: este passo não é da versão desta execução.'; END IF;
  IF ps.tipo = 'instrucao' THEN RAISE EXCEPTION 'POP: passo de instrução não tem resposta.'; END IF;

  IF ps.tipo = 'numero' AND jsonb_typeof(p_valor -> 'numero') = 'number' THEN
    v_num := (p_valor ->> 'numero')::numeric;
    v_min := CASE WHEN jsonb_typeof(ps.config -> 'min') = 'number' THEN (ps.config ->> 'min')::numeric END;
    v_max := CASE WHEN jsonb_typeof(ps.config -> 'max') = 'number' THEN (ps.config ->> 'max')::numeric END;
    v_fora := (v_min IS NOT NULL AND v_num < v_min) OR (v_max IS NOT NULL AND v_num > v_max);
  END IF;

  SELECT true, fora_faixa INTO v_refeito, v_alerta_antes
    FROM pops_execucao_respostas WHERE ticket_id = p_ticket AND passo_id = p_passo;

  INSERT INTO pops_execucao_respostas (ticket_id, versao_id, passo_id, valor, fotos, fora_faixa, respondido_por, respondido_em)
  VALUES (p_ticket, e.versao_id, p_passo, coalesce(p_valor, '{}'::jsonb), coalesce(p_fotos, '{}'), v_fora, p_autor, now())
  ON CONFLICT (ticket_id, passo_id) DO UPDATE
    SET valor = EXCLUDED.valor, fotos = EXCLUDED.fotos, fora_faixa = EXCLUDED.fora_faixa,
        respondido_por = EXCLUDED.respondido_por, respondido_em = EXCLUDED.respondido_em;

  INSERT INTO tickets_eventos (ticket_id, autor_id, tipo, payload) VALUES
    (p_ticket, p_autor, 'pop_resposta',
     jsonb_build_object('passo_id', ps.id, 'chave', ps.chave, 'ordem', ps.ordem, 'titulo', ps.titulo,
                        'tipo', ps.tipo, 'valor', coalesce(p_valor, '{}'::jsonb),
                        'fotos', coalesce(cardinality(p_fotos), 0), 'refeito', coalesce(v_refeito, false)));
  IF v_fora THEN
    INSERT INTO tickets_eventos (ticket_id, autor_id, tipo, payload) VALUES
      (p_ticket, p_autor, 'pop_alerta',
       jsonb_build_object('passo_id', ps.id, 'ordem', ps.ordem, 'titulo', ps.titulo, 'numero', v_num,
                          'min', v_min, 'max', v_max, 'unidade', ps.config ->> 'unidade'));
  END IF;

  IF v_status = 'aberto' THEN
    UPDATE tickets SET status = 'em_andamento' WHERE id = p_ticket;
    INSERT INTO tickets_eventos (ticket_id, autor_id, tipo, payload) VALUES
      (p_ticket, p_autor, 'status', jsonb_build_object('de', 'aberto', 'para', 'em_andamento', 'auto', true));
  END IF;
  UPDATE tickets SET ultima_atividade_em = now(), updated_at = now() WHERE id = p_ticket;

  RETURN jsonb_build_object('fora_faixa', v_fora, 'alerta_novo', v_fora AND NOT coalesce(v_alerta_antes, false),
                            'pendentes', pops_execucao_pendentes(p_ticket));
END $$;

-- ---------------------------------------------------------------------
-- Ciência ("li e entendi") — idempotente. Devolve true se registrou agora.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_dar_ciencia(p_versao uuid, p_usuario uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  n int;
BEGIN
  INSERT INTO pops_ciencias (versao_id, usuario_id) VALUES (p_versao, p_usuario)
  ON CONFLICT (versao_id, usuario_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

-- ---------------------------------------------------------------------
-- Painel por área: contagens NO BANCO (nunca puxando linhas — teto de 1000).
-- Execuções do período por data_referencia; "no prazo" = resolvida/fechada até
-- o fim do dia da data de referência, e só conta execução RECORRENTE
-- (avulsa fica fora da conta — decisão do Gate 0).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pops_painel_area(p_area uuid, p_de date, p_ate date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH ex AS (
    SELECT e.ticket_id, e.agendamento_id, e.data_referencia, t.status, t.resolvido_em
      FROM pops_execucoes e
      JOIN pops p ON p.id = e.pop_id
      JOIN tickets t ON t.id = e.ticket_id
     WHERE (p_area IS NULL OR p.area_id = p_area)
       AND e.data_referencia BETWEEN p_de AND p_ate
  ), pp AS (
    SELECT p.id, p.proxima_revisao_em,
           EXISTS (SELECT 1 FROM pops_versoes v WHERE v.pop_id = p.id AND v.estado = 'publicado') AS publicado
      FROM pops p
     WHERE (p_area IS NULL OR p.area_id = p_area) AND NOT p.arquivado AND p.template_tipo IS DISTINCT FROM 'sistema'
  )
  SELECT jsonb_build_object(
    'pops_total',          (SELECT count(*) FROM pp),
    'pops_publicados',     (SELECT count(*) FROM pp WHERE publicado),
    'revisao_vencida',     (SELECT count(*) FROM pp WHERE publicado AND proxima_revisao_em < pops_hoje()),
    'execucoes',           (SELECT count(*) FROM ex),
    'execucoes_concluidas',(SELECT count(*) FROM ex WHERE status IN ('resolvido', 'fechado')),
    'execucoes_canceladas',(SELECT count(*) FROM ex WHERE status = 'cancelado'),
    'recorrentes',         (SELECT count(*) FROM ex WHERE agendamento_id IS NOT NULL),
    'recorrentes_no_prazo',(SELECT count(*) FROM ex WHERE agendamento_id IS NOT NULL
                              AND status IN ('resolvido', 'fechado')
                              AND resolvido_em < ((data_referencia + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
  )
$$;

-- ---------------------------------------------------------------------
-- Só a service role executa.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.pops_hoje()',
    'public.pops_gerar_codigo(uuid, boolean)',
    'public.pops_copiar_passos(uuid, uuid, boolean)',
    'public.pops_criar(uuid, text, uuid, uuid, text, int)',
    'public.pops_nova_versao(uuid, uuid)',
    'public.pops_salvar_rascunho(uuid, jsonb, jsonb)',
    'public.pops_submeter(uuid, uuid, uuid, text)',
    'public.pops_decidir_revisao(uuid, uuid, boolean, text)',
    'public.pops_duplicar(uuid, uuid, uuid, uuid, text)',
    'public.pops_criar_execucao(uuid, uuid, uuid, date, text, uuid, date, text)',
    'public.pops_responder(uuid, uuid, jsonb, text[], uuid)',
    'public.pops_dar_ciencia(uuid, uuid)',
    'public.pops_painel_area(uuid, date, date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- PÓS-CHECK
--   SELECT proname FROM pg_proc WHERE proname LIKE 'pops\_%' ORDER BY 1;   -- inclui pops_criar ... pops_painel_area
--   SELECT has_function_privilege('authenticated', 'public.pops_criar(uuid,text,uuid,uuid,text,int)', 'EXECUTE');  -- false
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.pops_hoje(), public.pops_gerar_codigo(uuid, boolean), public.pops_copiar_passos(uuid, uuid, boolean),
--     public.pops_criar(uuid, text, uuid, uuid, text, int), public.pops_nova_versao(uuid, uuid),
--     public.pops_salvar_rascunho(uuid, jsonb, jsonb), public.pops_submeter(uuid, uuid, uuid, text),
--     public.pops_decidir_revisao(uuid, uuid, boolean, text), public.pops_duplicar(uuid, uuid, uuid, uuid, text),
--     public.pops_criar_execucao(uuid, uuid, uuid, date, text, uuid, date, text),
--     public.pops_responder(uuid, uuid, jsonb, text[], uuid), public.pops_dar_ciencia(uuid, uuid),
--     public.pops_painel_area(uuid, date, date);
