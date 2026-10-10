-- =============================================================================
-- POPs (Procedimento Operacional Padrão) sobre a engine de Tickets — FASE 1
-- Portal Nova Tratores. Rodar no SQL Editor do Supabase. Idempotente.
--
-- Dois conceitos separados (decisões do Gate 0, 10/10/2026):
--   * POP (documento): pops_areas → pops → pops_versoes → pops_passos.
--     Versão em_revisao/publicado/obsoleto é IMUTÁVEL (trigger, vale até para
--     a service role). Uma só publicada e um só rascunho/em_revisao por POP.
--   * Execução: É um ticket (tickets.tipo = 'pop'). Os dados da execução ficam
--     em pops_execucoes (1:1 com o ticket, aponta a VERSÃO exata) e as respostas
--     em pops_execucao_respostas (uma linha por passo — sem read-modify-write
--     do payload). O payload do ticket só espelha pop_id/versao_id/ref_externa.
--   * Revisão para publicar: ticket tipo = 'pop_revisao' (a "bola" é o
--     aprovador); o estado da versão é a etapa (sem coluna nova em tickets).
--
-- Modelo de acesso (igual ao resto da engine):
--   * LEITURA pelo navegador via RLS. POP/versão PUBLICADA (e obsoleta) = qualquer
--     usuário logado; rascunho e em_revisao = dono do POP, donos/aprovadores da
--     área e admin (is_admin/is_dev, módulo `pops` puro ou `pops:admin`).
--     Execução e respostas = quem vê o ticket (tickets_pode_ver).
--   * ESCRITA só pela service role (rotas /api/pops/*). Sem policies de
--     INSERT/UPDATE/DELETE; REVOKE de anon e authenticated.
--   * Fotos/mídias: buckets PRIVADOS, sem policy em storage.objects (upload e
--     leitura por URL assinada gerada no servidor).
--
-- Regras que o BANCO garante (não dependem da rota):
--   R1 versão fora de rascunho não muda conteúdo nem é apagada;
--   R2 passos só mudam com a versão em rascunho;
--   R3 transições de estado válidas: rascunho→em_revisao→(rascunho|publicado)→obsoleto;
--   R4 uma publicada e um rascunho/em_revisao por POP (índices únicos parciais);
--   R5 changelog obrigatório fora de rascunho;
--   R6 execução aponta versão do MESMO POP e nunca troca de versão;
--   R7 resposta só para passo da versão da execução (FK composta);
--   R8 ticket 'pop' não vai a resolvido/fechado com passo obrigatório pendente;
--   R9 respostas travadas com a execução resolvida/fechada/cancelada;
--   R10 ciência só em versão publicada, e é registro permanente;
--   R11 idempotência do cron: UNIQUE (agendamento_id, data_referencia).
--
-- Rollback no FIM do arquivo (comentado).
-- =============================================================================

-- ---------------------------------------------------------------------
-- 0) Pré-checagem: ninguém usa os tipos novos ainda
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tickets WHERE tipo IN ('pop', 'pop_revisao')) THEN
    RAISE WARNING 'Já existem tickets com tipo pop/pop_revisao — conferir antes de seguir.';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) ÁREAS e papéis por área
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pops_areas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sigla                  text NOT NULL UNIQUE CHECK (sigla ~ '^[A-Z]{2,4}$'),
  nome                   text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 80),
  ativo                  boolean NOT NULL DEFAULT true,
  -- Contadores do código (OFI-001 / modelos MOD-OFI-001). Incrementados só
  -- dentro das funções da Fase 2 (UPDATE ... RETURNING, atômico).
  proximo_numero         int NOT NULL DEFAULT 1 CHECK (proximo_numero >= 1),
  proximo_numero_modelo  int NOT NULL DEFAULT 1 CHECK (proximo_numero_modelo >= 1),
  criado_em              timestamptz NOT NULL DEFAULT now()
);

-- Escopo por área (o modelo de permissões do portal não tem área):
-- 'dono' cria/edita POPs da área; 'aprovador' aprova a publicação.
CREATE TABLE IF NOT EXISTS public.pops_area_papeis (
  area_id     uuid NOT NULL REFERENCES public.pops_areas(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel       text NOT NULL CHECK (papel IN ('dono', 'aprovador')),
  criado_por  uuid REFERENCES auth.users(id),
  criado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (area_id, user_id, papel)
);
CREATE INDEX IF NOT EXISTS pops_area_papeis_user_idx ON public.pops_area_papeis (user_id);

INSERT INTO public.pops_areas (sigla, nome) VALUES
  ('OFI', 'Oficina'), ('PEC', 'Peças'), ('VEN', 'Vendas'), ('FIS', 'Fiscal'),
  ('FIN', 'Financeiro'), ('RH', 'RH'), ('ADM', 'Administrativo'), ('FRO', 'Frota')
ON CONFLICT (sigla) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2) POP (documento) — o que não muda entre versões
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pops (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id                     uuid NOT NULL REFERENCES public.pops_areas(id),
  codigo                      text NOT NULL UNIQUE,
  titulo                      text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 160),
  dono_id                     uuid NOT NULL REFERENCES auth.users(id),
  -- Modelo (template): 'sistema' (seed, só admin edita) ou 'empresa' (POP promovido).
  eh_template                 boolean NOT NULL DEFAULT false,
  template_tipo               text CHECK (template_tipo IN ('sistema', 'empresa')),
  -- De onde veio a cópia (duplicar modelo ou duplicar POP comum).
  origem_template_id          uuid REFERENCES public.pops(id) ON DELETE SET NULL,
  origem_template_versao      int,
  origem_pop_id               uuid REFERENCES public.pops(id) ON DELETE SET NULL,
  -- Revisão periódica mora no POP (confirmar "continua valendo" não pode
  -- mexer na versão publicada, que é imutável).
  periodicidade_revisao_dias  int NOT NULL DEFAULT 365 CHECK (periodicidade_revisao_dias BETWEEN 7 AND 3650),
  proxima_revisao_em          date,
  revisado_em                 timestamptz,
  revisado_por                uuid REFERENCES auth.users(id),
  arquivado                   boolean NOT NULL DEFAULT false,
  criado_por                  uuid REFERENCES auth.users(id),
  criado_em                   timestamptz NOT NULL DEFAULT now(),
  atualizado_em               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pops_template_coerente CHECK (eh_template = (template_tipo IS NOT NULL)),
  CONSTRAINT pops_origem_template_coerente
    CHECK ((origem_template_id IS NULL) = (origem_template_versao IS NULL))
);
CREATE INDEX IF NOT EXISTS pops_area_idx ON public.pops (area_id) WHERE NOT arquivado;
CREATE INDEX IF NOT EXISTS pops_dono_idx ON public.pops (dono_id);
CREATE INDEX IF NOT EXISTS pops_template_idx ON public.pops (template_tipo) WHERE eh_template;
CREATE INDEX IF NOT EXISTS pops_origem_template_idx ON public.pops (origem_template_id) WHERE origem_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pops_origem_pop_idx ON public.pops (origem_pop_id) WHERE origem_pop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pops_revisao_idx ON public.pops (proxima_revisao_em) WHERE NOT arquivado;

-- ---------------------------------------------------------------------
-- 3) VERSÕES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pops_versoes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pop_id             uuid NOT NULL REFERENCES public.pops(id) ON DELETE CASCADE,
  numero             int NOT NULL CHECK (numero >= 1),
  estado             text NOT NULL DEFAULT 'rascunho'
                     CHECK (estado IN ('rascunho', 'em_revisao', 'publicado', 'obsoleto')),
  objetivo           text NOT NULL DEFAULT '',
  escopo             text NOT NULL DEFAULT '',
  materiais          text NOT NULL DEFAULT '',   -- materiais / EPIs
  changelog          text NOT NULL DEFAULT '',
  submetido_por      uuid REFERENCES auth.users(id),
  submetido_em       timestamptz,
  revisao_ticket_id  uuid REFERENCES public.tickets(id) ON DELETE SET NULL,  -- ticket pop_revisao
  aprovado_por       uuid REFERENCES auth.users(id),
  aprovado_em        timestamptz,
  publicado_por      uuid REFERENCES auth.users(id),
  publicado_em       timestamptz,
  obsoleto_em        timestamptz,
  criado_por         uuid REFERENCES auth.users(id),
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pop_id, numero),
  UNIQUE (id, pop_id),                         -- alvo da FK composta da execução (R6)
  CONSTRAINT pops_versoes_changelog_obrigatorio                 -- R5
    CHECK (estado = 'rascunho' OR char_length(btrim(changelog)) > 0),
  CONSTRAINT pops_versoes_publicacao_coerente
    CHECK (estado NOT IN ('publicado', 'obsoleto') OR (publicado_em IS NOT NULL AND aprovado_por IS NOT NULL))
);
-- R4
CREATE UNIQUE INDEX IF NOT EXISTS pops_versoes_uma_publicada
  ON public.pops_versoes (pop_id) WHERE estado = 'publicado';
CREATE UNIQUE INDEX IF NOT EXISTS pops_versoes_um_rascunho
  ON public.pops_versoes (pop_id) WHERE estado IN ('rascunho', 'em_revisao');
CREATE INDEX IF NOT EXISTS pops_versoes_revisao_ticket_idx
  ON public.pops_versoes (revisao_ticket_id) WHERE revisao_ticket_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 4) PASSOS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pops_passos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  versao_id    uuid NOT NULL REFERENCES public.pops_versoes(id) ON DELETE CASCADE,
  ordem        int NOT NULL CHECK (ordem >= 1),
  -- Identidade do passo ENTRE versões (copiada ao criar v(n+1)) — base do diff.
  chave        uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo         text NOT NULL CHECK (tipo IN ('instrucao', 'check', 'foto', 'numero', 'texto', 'selecao', 'assinatura')),
  titulo       text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 300),
  ajuda        text NOT NULL DEFAULT '',
  obrigatorio  boolean NOT NULL DEFAULT true,
  -- {min_fotos, max_fotos} · {unidade, min, max} · {opcoes:[...]} · {quem:'executor'|'cliente'}
  config       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  midia_path   text,                 -- mídia de apoio no bucket pops-midia
  condicao     jsonb,                -- reservado para ramificação (fora do v1)
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (versao_id, chave),
  UNIQUE (id, versao_id),                       -- alvo da FK composta da resposta (R7)
  CONSTRAINT pops_passos_ordem_unica UNIQUE (versao_id, ordem) DEFERRABLE INITIALLY DEFERRED
);

-- ---------------------------------------------------------------------
-- 5) AGENDAMENTOS (execuções recorrentes)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pops_agendamentos (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pop_id                  uuid NOT NULL REFERENCES public.pops(id) ON DELETE CASCADE,
  recorrencia             text NOT NULL CHECK (recorrencia IN ('diario', 'semanal', 'mensal')),
  dia_semana              smallint CHECK (dia_semana BETWEEN 0 AND 6),   -- 0 = domingo
  dia_mes                 smallint CHECK (dia_mes BETWEEN 1 AND 31),     -- 31 = último dia
  responsavel_padrao_id   uuid NOT NULL REFERENCES auth.users(id),
  ativo                   boolean NOT NULL DEFAULT true,
  inicio_em               date NOT NULL DEFAULT current_date,
  ultima_geracao_em       timestamptz,
  ultima_data_referencia  date,
  criado_por              uuid REFERENCES auth.users(id),
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pops_agendamentos_dia_coerente CHECK (
    (recorrencia = 'diario'  AND dia_semana IS NULL AND dia_mes IS NULL) OR
    (recorrencia = 'semanal' AND dia_semana IS NOT NULL AND dia_mes IS NULL) OR
    (recorrencia = 'mensal'  AND dia_mes IS NOT NULL AND dia_semana IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS pops_agendamentos_pop_idx ON public.pops_agendamentos (pop_id);
CREATE INDEX IF NOT EXISTS pops_agendamentos_ativos_idx ON public.pops_agendamentos (recorrencia) WHERE ativo;
CREATE INDEX IF NOT EXISTS pops_agendamentos_resp_idx ON public.pops_agendamentos (responsavel_padrao_id);

-- ---------------------------------------------------------------------
-- 6) EXECUÇÃO (1:1 com o ticket tipo='pop') e RESPOSTAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pops_execucoes (
  ticket_id        uuid PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  pop_id           uuid NOT NULL,
  versao_id        uuid NOT NULL,
  agendamento_id   uuid REFERENCES public.pops_agendamentos(id) ON DELETE SET NULL,
  data_referencia  date,              -- dia da recorrência (ou do início, se avulsa)
  ref_externa      text CHECK (ref_externa IS NULL OR char_length(ref_externa) BETWEEN 1 AND 80),  -- OS, chassi, NF, placa
  criado_em        timestamptz NOT NULL DEFAULT now(),
  -- R6: versão do MESMO POP; RESTRICT = versão com execução nunca some.
  CONSTRAINT pops_execucoes_versao_fk FOREIGN KEY (versao_id, pop_id)
    REFERENCES public.pops_versoes (id, pop_id) ON DELETE RESTRICT,
  CONSTRAINT pops_execucoes_recorrente_coerente
    CHECK (agendamento_id IS NULL OR data_referencia IS NOT NULL),
  UNIQUE (ticket_id, versao_id),                -- alvo da FK composta da resposta (R7)
  UNIQUE (agendamento_id, data_referencia)      -- R11 (NULL não colide: avulsas livres)
);
CREATE INDEX IF NOT EXISTS pops_execucoes_pop_data_idx ON public.pops_execucoes (pop_id, data_referencia);
CREATE INDEX IF NOT EXISTS pops_execucoes_versao_idx ON public.pops_execucoes (versao_id);
CREATE INDEX IF NOT EXISTS pops_execucoes_ref_idx ON public.pops_execucoes (lower(ref_externa)) WHERE ref_externa IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pops_execucao_respostas (
  ticket_id       uuid NOT NULL,
  versao_id       uuid NOT NULL,
  passo_id        uuid NOT NULL,
  -- check {sim:bool} · numero {numero:n} · texto {texto} · selecao {opcao}
  -- assinatura {nome, quem, imagem_path?} · foto: só `fotos`
  valor           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(valor) = 'object'),
  fotos           text[] NOT NULL DEFAULT '{}',   -- paths no bucket pops-execucao
  fora_faixa      boolean NOT NULL DEFAULT false,
  respondido_por  uuid NOT NULL REFERENCES auth.users(id),
  respondido_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, passo_id),
  CONSTRAINT pops_respostas_execucao_fk FOREIGN KEY (ticket_id, versao_id)
    REFERENCES public.pops_execucoes (ticket_id, versao_id) ON DELETE CASCADE,
  CONSTRAINT pops_respostas_passo_fk FOREIGN KEY (passo_id, versao_id)          -- R7
    REFERENCES public.pops_passos (id, versao_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS pops_respostas_passo_idx ON public.pops_execucao_respostas (passo_id, versao_id);

-- ---------------------------------------------------------------------
-- 7) CIÊNCIA DE LEITURA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pops_ciencia_exigida (
  versao_id    uuid NOT NULL REFERENCES public.pops_versoes(id) ON DELETE CASCADE,
  usuario_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exigido_por  uuid REFERENCES auth.users(id),
  exigido_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (versao_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS pops_ciencia_exigida_user_idx ON public.pops_ciencia_exigida (usuario_id);

CREATE TABLE IF NOT EXISTS public.pops_ciencias (
  versao_id   uuid NOT NULL REFERENCES public.pops_versoes(id) ON DELETE RESTRICT,
  usuario_id  uuid NOT NULL REFERENCES auth.users(id),
  ciente_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (versao_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS pops_ciencias_user_idx ON public.pops_ciencias (usuario_id);

-- =============================================================================
-- 8) TRIGGERS — regras que valem até para a service role
-- =============================================================================

-- atualizado_em
CREATE OR REPLACE FUNCTION public.pops_tg_atualizado_em()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_pops_atualizado_em ON public.pops;
CREATE TRIGGER tg_pops_atualizado_em BEFORE UPDATE ON public.pops
  FOR EACH ROW EXECUTE FUNCTION public.pops_tg_atualizado_em();
DROP TRIGGER IF EXISTS tg_pops_agendamentos_atualizado_em ON public.pops_agendamentos;
CREATE TRIGGER tg_pops_agendamentos_atualizado_em BEFORE UPDATE ON public.pops_agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.pops_tg_atualizado_em();

-- R1 + R3: imutabilidade e máquina de estados da versão.
-- O trigger roda BEFORE e define atualizado_em ele mesmo (não depende de ordem).
CREATE OR REPLACE FUNCTION public.pops_tg_versao_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  mudou text[];
  -- Campos de controle que podem mudar nas transições fora de rascunho.
  controle constant text[] := ARRAY['estado', 'atualizado_em', 'revisao_ticket_id', 'aprovado_por',
                                    'aprovado_em', 'publicado_por', 'publicado_em', 'obsoleto_em'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'rascunho' THEN
      RAISE EXCEPTION 'POP: versão nova nasce em rascunho (recebido %).', NEW.estado USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'rascunho' THEN
      RAISE EXCEPTION 'POP: versão % (v%) não pode ser apagada.', OLD.estado, OLD.numero USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  NEW.atualizado_em := now();
  IF NEW.pop_id IS DISTINCT FROM OLD.pop_id OR NEW.numero IS DISTINCT FROM OLD.numero THEN
    RAISE EXCEPTION 'POP: pop_id e numero da versão não mudam.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(array_agg(n.key), '{}') INTO mudou
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
   WHERE n.value IS DISTINCT FROM o.value AND n.key <> 'atualizado_em';

  IF OLD.estado = 'rascunho' THEN
    IF NEW.estado NOT IN ('rascunho', 'em_revisao') THEN
      RAISE EXCEPTION 'POP: rascunho só vai para revisão (recebido %).', NEW.estado USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;  -- conteúdo livre no rascunho
  END IF;

  -- Fora de rascunho: só campos de controle mudam.
  IF NOT (mudou <@ controle) THEN
    RAISE EXCEPTION 'POP: versão % é imutável (tentou alterar %).', OLD.estado, array_to_string(mudou, ', ')
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.estado = 'em_revisao' AND NEW.estado IN ('em_revisao', 'rascunho', 'publicado') THEN
    RETURN NEW;
  ELSIF OLD.estado = 'publicado' AND NEW.estado = 'obsoleto'
        AND mudou <@ ARRAY['estado', 'obsoleto_em'] THEN
    RETURN NEW;
  ELSIF OLD.estado = NEW.estado AND cardinality(mudou) = 0 THEN
    RETURN NEW;  -- UPDATE sem mudança real
  END IF;

  RAISE EXCEPTION 'POP: transição % → % não permitida.', OLD.estado, NEW.estado USING ERRCODE = 'restrict_violation';
END $$;

DROP TRIGGER IF EXISTS tg_pops_versao_imutavel ON public.pops_versoes;
CREATE TRIGGER tg_pops_versao_imutavel BEFORE INSERT OR UPDATE OR DELETE ON public.pops_versoes
  FOR EACH ROW EXECUTE FUNCTION public.pops_tg_versao_imutavel();

-- R2: passos só mudam com a versão em rascunho. Versão inexistente = cascata
-- do DELETE de um rascunho (já autorizado acima).
CREATE OR REPLACE FUNCTION public.pops_tg_passo_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_estado text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT estado INTO v_estado FROM public.pops_versoes WHERE id = OLD.versao_id;
    IF v_estado IS NOT NULL AND v_estado <> 'rascunho' THEN
      RAISE EXCEPTION 'POP: passos de versão % não mudam.', v_estado USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT estado INTO v_estado FROM public.pops_versoes WHERE id = NEW.versao_id;
    IF v_estado IS DISTINCT FROM 'rascunho' THEN
      RAISE EXCEPTION 'POP: só se inclui/altera passo em versão rascunho (está %).', coalesce(v_estado, 'inexistente')
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS tg_pops_passo_imutavel ON public.pops_passos;
CREATE TRIGGER tg_pops_passo_imutavel BEFORE INSERT OR UPDATE OR DELETE ON public.pops_passos
  FOR EACH ROW EXECUTE FUNCTION public.pops_tg_passo_imutavel();

-- R6: a execução nasce de um ticket tipo 'pop' e nunca troca POP/versão/ticket.
CREATE OR REPLACE FUNCTION public.pops_tg_execucao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = NEW.ticket_id AND t.tipo = 'pop') THEN
      RAISE EXCEPTION 'POP: execução precisa de um ticket tipo pop.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.pop_id IS DISTINCT FROM OLD.pop_id
     OR NEW.versao_id IS DISTINCT FROM OLD.versao_id THEN
    RAISE EXCEPTION 'POP: a execução não troca de ticket, POP ou versão.' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_pops_execucao ON public.pops_execucoes;
CREATE TRIGGER tg_pops_execucao BEFORE INSERT OR UPDATE ON public.pops_execucoes
  FOR EACH ROW EXECUTE FUNCTION public.pops_tg_execucao();

-- Validade de UMA resposta conforme o tipo do passo (espelhada na lib TS da Fase 2).
-- Valor fora da faixa continua VÁLIDO (só gera alerta).
CREATE OR REPLACE FUNCTION public.pops_resposta_valida(p_tipo text, p_config jsonb, p_valor jsonb, p_fotos text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_tipo
    WHEN 'instrucao'  THEN true
    WHEN 'check'      THEN jsonb_typeof(p_valor -> 'sim') = 'boolean'
    WHEN 'numero'     THEN jsonb_typeof(p_valor -> 'numero') = 'number'
    WHEN 'texto'      THEN char_length(btrim(coalesce(p_valor ->> 'texto', ''))) > 0
    WHEN 'selecao'    THEN char_length(btrim(coalesce(p_valor ->> 'opcao', ''))) > 0
    WHEN 'assinatura' THEN char_length(btrim(coalesce(p_valor ->> 'nome', ''))) > 0
    WHEN 'foto'       THEN coalesce(cardinality(p_fotos), 0)
                           >= greatest(1, coalesce((p_config ->> 'min_fotos')::int, 1))
    ELSE false
  END
$$;

-- Quantos passos obrigatórios ainda faltam numa execução (0 = pode encerrar).
CREATE OR REPLACE FUNCTION public.pops_execucao_pendentes(p_ticket uuid)
RETURNS int LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT count(*)::int
    FROM public.pops_execucoes e
    JOIN public.pops_passos p ON p.versao_id = e.versao_id
   WHERE e.ticket_id = p_ticket
     AND p.obrigatorio
     AND p.tipo <> 'instrucao'
     AND NOT EXISTS (
       SELECT 1 FROM public.pops_execucao_respostas r
        WHERE r.ticket_id = e.ticket_id AND r.passo_id = p.id
          AND public.pops_resposta_valida(p.tipo, p.config, r.valor, r.fotos)
     )
$$;

-- R8: ticket 'pop' não chega a resolvido/fechado com obrigatório pendente.
CREATE OR REPLACE FUNCTION public.pops_tg_ticket_encerramento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  faltam int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pops_execucoes WHERE ticket_id = NEW.id) THEN
    RAISE EXCEPTION 'POP: ticket % sem execução vinculada não pode ser encerrado.', NEW.numero
      USING ERRCODE = 'check_violation';
  END IF;
  faltam := public.pops_execucao_pendentes(NEW.id);
  IF faltam > 0 THEN
    RAISE EXCEPTION 'POP: faltam % passo(s) obrigatório(s) para encerrar a execução.', faltam
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_pops_ticket_encerramento ON public.tickets;
CREATE TRIGGER tg_pops_ticket_encerramento
  BEFORE UPDATE OF status ON public.tickets
  FOR EACH ROW
  WHEN (NEW.tipo = 'pop'
        AND NEW.status IN ('resolvido', 'fechado')
        AND OLD.status NOT IN ('resolvido', 'fechado'))
  EXECUTE FUNCTION public.pops_tg_ticket_encerramento();

-- Nascer já encerrado também cai na mesma regra (a execução ainda nem existe).
DROP TRIGGER IF EXISTS tg_pops_ticket_nasce_encerrado ON public.tickets;
CREATE TRIGGER tg_pops_ticket_nasce_encerrado
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  WHEN (NEW.tipo = 'pop' AND NEW.status IN ('resolvido', 'fechado'))
  EXECUTE FUNCTION public.pops_tg_ticket_encerramento();

-- R9: respostas travadas com a execução resolvida/fechada/cancelada.
-- (Responsável reabre o ticket → volta a poder responder.)
CREATE OR REPLACE FUNCTION public.pops_tg_resposta_aberta()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_status text;
  v_ticket uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.ticket_id ELSE NEW.ticket_id END;
BEGIN
  SELECT status INTO v_status FROM public.tickets WHERE id = v_ticket;
  IF v_status IN ('resolvido', 'fechado', 'cancelado') THEN
    RAISE EXCEPTION 'POP: execução % — respostas não mudam mais.', v_status USING ERRCODE = 'restrict_violation';
  END IF;
  -- v_status NULL = cascata do DELETE do ticket: deixa passar.
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS tg_pops_resposta_aberta ON public.pops_execucao_respostas;
CREATE TRIGGER tg_pops_resposta_aberta BEFORE INSERT OR UPDATE OR DELETE ON public.pops_execucao_respostas
  FOR EACH ROW EXECUTE FUNCTION public.pops_tg_resposta_aberta();

-- R10: ciência só em versão PUBLICADA, e o registro é permanente.
CREATE OR REPLACE FUNCTION public.pops_tg_ciencia()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.pops_versoes WHERE id = NEW.versao_id AND estado = 'publicado') THEN
      RAISE EXCEPTION 'POP: só se dá ciência em versão publicada.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'POP: registro de ciência é permanente.' USING ERRCODE = 'restrict_violation';
END $$;

DROP TRIGGER IF EXISTS tg_pops_ciencia ON public.pops_ciencias;
CREATE TRIGGER tg_pops_ciencia BEFORE INSERT OR UPDATE OR DELETE ON public.pops_ciencias
  FOR EACH ROW EXECUTE FUNCTION public.pops_tg_ciencia();

-- Funções de trigger não são chamáveis por ninguém.
REVOKE ALL ON FUNCTION public.pops_tg_atualizado_em()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pops_tg_versao_imutavel()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pops_tg_passo_imutavel()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pops_tg_execucao()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pops_tg_ticket_encerramento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pops_tg_resposta_aberta()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pops_tg_ciencia()             FROM PUBLIC, anon, authenticated;
-- Validação: a tela pode perguntar "quanto falta" pela leitura; anon não.
REVOKE ALL ON FUNCTION public.pops_resposta_valida(text, jsonb, jsonb, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pops_execucao_pendentes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pops_resposta_valida(text, jsonb, jsonb, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pops_execucao_pendentes(uuid) TO service_role;

-- =============================================================================
-- 9) EVENTOS NOVOS na timeline (lista COMPLETA — tudo que existe + 5 de POP)
--    Antes de recriar, confere que a produção não tem tipo fora desta lista.
-- =============================================================================
DO $$
DECLARE
  novos constant text[] := ARRAY[
    -- v1 (genérico)
    'criacao', 'comentario', 'status', 'transferencia',
    'participante_adicionado', 'participante_removido',
    'pedido_atualizacao', 'edicao', 'anexo',
    -- SC (compras)
    'sc_criada', 'qtd_alterada', 'parecer_financeiro', 'pc_emitido',
    -- War Room
    'wr_acao_criada', 'wr_decisao_vinculada',
    -- Tickets ↔ Requisições
    'vinculo_adicionado', 'vinculo_removido',
    -- Reuniões (sql/reunioes.sql)
    'reuniao_etapa', 'item_resultado', 'acao_criada', 'pendencia_tratada', 'ata_publicada', 'ata_adendo',
    -- POPs
    'pop_resposta',            -- {passo_id, chave, ordem, titulo, tipo, valor, fotos, refeito?}
    'pop_alerta',              -- {passo_id, ordem, titulo, numero, min, max, unidade}
    'pop_revisao_submetida',   -- {pop_id, versao_id, numero, changelog}
    'pop_revisao_aprovada',    -- {pop_id, versao_id, numero, parecer?}
    'pop_revisao_reprovada'    -- {pop_id, versao_id, numero, parecer}
  ];
  def text;
  t text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.tickets_eventos'::regclass AND conname = 'tickets_eventos_tipo_check';
  IF def IS NOT NULL THEN
    FOR t IN SELECT (regexp_matches(def, '''([a-z_]+)''', 'g'))[1] LOOP
      IF NOT t = ANY (novos) THEN
        RAISE EXCEPTION 'tickets_eventos_tipo_check em produção tem "%" que esta migration não conhece — incluir na lista antes de rodar.', t;
      END IF;
    END LOOP;
  END IF;
  -- Algum evento gravado fora da lista também barraria o ADD CONSTRAINT.
  IF EXISTS (SELECT 1 FROM public.tickets_eventos WHERE NOT tipo = ANY (novos)) THEN
    RAISE EXCEPTION 'tickets_eventos tem linhas com tipo fora da lista nova.';
  END IF;

  ALTER TABLE public.tickets_eventos DROP CONSTRAINT IF EXISTS tickets_eventos_tipo_check;
  EXECUTE format('ALTER TABLE public.tickets_eventos ADD CONSTRAINT tickets_eventos_tipo_check CHECK (tipo = ANY (%L::text[]))', novos);
END $$;

-- =============================================================================
-- 10) RLS — leitura; escrita só service role
-- =============================================================================

-- Admin do módulo: is_admin/is_dev, `pops` puro ou `pops:admin` (portal_pode já existe — sql/pni-03).
CREATE OR REPLACE FUNCTION public.pops_eh_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND public.portal_pode('pops', 'admin')
$$;

-- Pode ver rascunhos/em_revisao e gerir o POP: admin, dono do POP, dono ou aprovador da área.
CREATE OR REPLACE FUNCTION public.pops_pode_editar(p_pop uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.pops_eh_admin()
    OR EXISTS (
      SELECT 1 FROM public.pops p
       WHERE p.id = p_pop
         AND (p.dono_id = auth.uid()
              OR EXISTS (SELECT 1 FROM public.pops_area_papeis ap
                          WHERE ap.area_id = p.area_id AND ap.user_id = auth.uid()))
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.pops_pode_ver_pop(p_pop uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.pops_versoes v
             WHERE v.pop_id = p_pop AND v.estado IN ('publicado', 'obsoleto'))
    OR public.pops_pode_editar(p_pop)
  )
$$;

CREATE OR REPLACE FUNCTION public.pops_pode_ver_versao(p_versao uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pops_versoes v
     WHERE v.id = p_versao
       AND (v.estado IN ('publicado', 'obsoleto') OR public.pops_pode_editar(v.pop_id))
  )
$$;

REVOKE ALL ON FUNCTION public.pops_eh_admin()            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pops_pode_editar(uuid)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pops_pode_ver_pop(uuid)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pops_pode_ver_versao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_eh_admin()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pops_pode_editar(uuid)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pops_pode_ver_pop(uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pops_pode_ver_versao(uuid) TO authenticated, service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pops_areas', 'pops_area_papeis', 'pops', 'pops_versoes', 'pops_passos',
                           'pops_agendamentos', 'pops_execucoes', 'pops_execucao_respostas',
                           'pops_ciencia_exigida', 'pops_ciencias'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS pops_areas_select ON public.pops_areas;
CREATE POLICY pops_areas_select ON public.pops_areas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pops_area_papeis_select ON public.pops_area_papeis;
CREATE POLICY pops_area_papeis_select ON public.pops_area_papeis FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pops_select ON public.pops;
CREATE POLICY pops_select ON public.pops FOR SELECT TO authenticated
  USING (public.pops_pode_ver_pop(id));

DROP POLICY IF EXISTS pops_versoes_select ON public.pops_versoes;
CREATE POLICY pops_versoes_select ON public.pops_versoes FOR SELECT TO authenticated
  USING (estado IN ('publicado', 'obsoleto') OR public.pops_pode_editar(pop_id));

DROP POLICY IF EXISTS pops_passos_select ON public.pops_passos;
CREATE POLICY pops_passos_select ON public.pops_passos FOR SELECT TO authenticated
  USING (public.pops_pode_ver_versao(versao_id));

DROP POLICY IF EXISTS pops_agendamentos_select ON public.pops_agendamentos;
CREATE POLICY pops_agendamentos_select ON public.pops_agendamentos FOR SELECT TO authenticated
  USING (responsavel_padrao_id = (SELECT auth.uid()) OR public.pops_pode_editar(pop_id));

DROP POLICY IF EXISTS pops_execucoes_select ON public.pops_execucoes;
CREATE POLICY pops_execucoes_select ON public.pops_execucoes FOR SELECT TO authenticated
  USING (public.tickets_pode_ver(ticket_id));

DROP POLICY IF EXISTS pops_respostas_select ON public.pops_execucao_respostas;
CREATE POLICY pops_respostas_select ON public.pops_execucao_respostas FOR SELECT TO authenticated
  USING (public.tickets_pode_ver(ticket_id));

DROP POLICY IF EXISTS pops_ciencia_exigida_select ON public.pops_ciencia_exigida;
CREATE POLICY pops_ciencia_exigida_select ON public.pops_ciencia_exigida FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid())
         OR public.pops_pode_editar((SELECT v.pop_id FROM public.pops_versoes v WHERE v.id = versao_id)));

DROP POLICY IF EXISTS pops_ciencias_select ON public.pops_ciencias;
CREATE POLICY pops_ciencias_select ON public.pops_ciencias FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid())
         OR public.pops_pode_editar((SELECT v.pop_id FROM public.pops_versoes v WHERE v.id = versao_id)));

-- =============================================================================
-- 11) STORAGE — buckets PRIVADOS, sem policy (tudo por URL assinada do servidor)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('pops-midia', 'pops-midia', false, 52428800,   -- 50 MB: imagem ou vídeo curto de apoio
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']),
  ('pops-execucao', 'pops-execucao', false, 10485760,  -- 10 MB: foto já comprimida no celular
   ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- PÓS-CHECK (rodar e conferir)
--   SELECT count(*) FROM pops_areas;                                            -- 8
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'pops%' AND relkind = 'r';  -- todas true
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'tickets_eventos_tipo_check';  -- tem pop_resposta e ata_adendo
--   SELECT id, public FROM storage.buckets WHERE id LIKE 'pops-%';              -- 2 linhas, public = false
--   SELECT tgname FROM pg_trigger WHERE tgname = 'tg_pops_ticket_encerramento'; -- 1 linha
-- =============================================================================

-- =============================================================================
-- ROLLBACK (só se nada de POP estiver em uso — apaga TUDO do módulo)
-- -----------------------------------------------------------------------------
-- DROP TRIGGER IF EXISTS tg_pops_ticket_encerramento ON public.tickets;
-- DROP TRIGGER IF EXISTS tg_pops_ticket_nasce_encerrado ON public.tickets;
-- -- Tickets de execução/revisão: apagar ANTES (o CHECK antigo recusa os eventos pop_*):
-- DELETE FROM public.tickets WHERE tipo IN ('pop', 'pop_revisao');
-- DROP TABLE IF EXISTS public.pops_ciencias, public.pops_ciencia_exigida,
--   public.pops_execucao_respostas, public.pops_execucoes, public.pops_agendamentos,
--   public.pops_passos, public.pops_versoes, public.pops, public.pops_area_papeis,
--   public.pops_areas CASCADE;
-- DROP FUNCTION IF EXISTS public.pops_tg_atualizado_em(), public.pops_tg_versao_imutavel(),
--   public.pops_tg_passo_imutavel(), public.pops_tg_execucao(), public.pops_tg_ticket_encerramento(),
--   public.pops_tg_resposta_aberta(), public.pops_tg_ciencia(),
--   public.pops_resposta_valida(text, jsonb, jsonb, text[]), public.pops_execucao_pendentes(uuid),
--   public.pops_eh_admin(), public.pops_pode_editar(uuid), public.pops_pode_ver_pop(uuid),
--   public.pops_pode_ver_versao(uuid);
-- -- CHECK de eventos: voltar à lista de sql/reunioes.sql (sem os 5 pop_*).
-- -- Buckets: esvaziar pelo painel do Storage e depois
-- -- DELETE FROM storage.buckets WHERE id IN ('pops-midia', 'pops-execucao');
-- NOTIFY pgrst, 'reload schema';
-- =============================================================================
