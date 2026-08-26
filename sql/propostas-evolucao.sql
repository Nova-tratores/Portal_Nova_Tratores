-- =====================================================================
-- Nova Tratores — Evolução do módulo /propostas  (VERSÃO CORRIGIDA)
-- Data: 2026-08-21
--
-- Esta é a versão revisada do draft original, corrigida contra o código
-- REAL de produção (branch `main`). Correções aplicadas:
--   C1. Sementes de status/fase com as strings EXATAS gravadas hoje
--       (caixa/acentos/pontuação) + probabilidade movida para a tabela.
--   C2. Autopropelido tratado como 3º tipo (CHECK + backfill por Formulario.tipo
--       + snapshot das specs *_auto).
--   C3. Backfill da lixeira NÃO reescreve status (evita "ressuscitar" itens).
--   C4. Views/trigger deixam de depender de LIKE/CASE sobre string —
--       usam status_proposta.em_aberto / .probabilidade via JOIN.
--   C5. proposta_status_hist fica só para tempo-por-fase; autoria continua
--       no audit_log (HistoricoProposta já usa). usuario_id fica nullable.
--
-- PRINCÍPIO: nada que a UI atual lê é removido ou renomeado. Colunas antigas
--   continuam existindo e sendo alimentadas por trigger. Migração de UI depois.
--
-- COMO APLICAR
--   1. Rode a SEÇÃO 0 (pré-checks) e leia a saída antes de tudo.
--   2. Rode em transação. Se algo falhar, ROLLBACK.
--   3. Confira a SEÇÃO 10 (verificação pós-migration).
-- =====================================================================


-- =====================================================================
-- SEÇÃO 0 — PRÉ-CHECKS (rode isolado, só leitura)
-- =====================================================================
-- Tipos reais das colunas que vamos tocar (Valor_Total/Qtd_Eqp: TEXT ou numeric?):
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name IN ('Formulario','Proposta_Fabrica')
--    ORDER BY table_name, ordinal_position;
--
-- Confirmar que as colunas *_auto existem em Formulario (o backfill as usa direto):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='Formulario' AND column_name LIKE '%_auto';
--   -- esperado: motor_auto, transmissao_auto, tanque_pulv_auto, tecnologia_auto,
--   --           telemetria_auto, barra_pulv_auto, num_secoes_auto, espac_bicos_auto,
--   --           vao_livre_auto, bitola_auto, tanque_comb_auto
--
-- Strings de status REAIS gravadas hoje (têm que bater com as sementes abaixo):
--   SELECT status, count(*) FROM "Formulario"       GROUP BY status;
--   SELECT status, count(*) FROM "Proposta_Fabrica" GROUP BY status;
-- =====================================================================

BEGIN;

-- =====================================================================
-- SEÇÃO 1 — HELPERS
-- =====================================================================

-- Converte texto bagunçado ("R$ 1.329.900,00", "1329900.00", "2 un") em numeric.
CREATE OR REPLACE FUNCTION nt_num(p_valor text)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text;
BEGIN
  IF p_valor IS NULL THEN RETURN NULL; END IF;
  v := regexp_replace(p_valor, '[^0-9,.-]', '', 'g');
  IF v = '' THEN RETURN NULL; END IF;
  -- formato brasileiro: 1.329.900,00 -> 1329900.00
  IF position(',' in v) > 0 THEN
    v := replace(replace(v, '.', ''), ',', '.');
  END IF;
  RETURN v::numeric;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

COMMENT ON FUNCTION nt_num IS 'Parser tolerante de valores vindos de colunas texto legadas.';


-- =====================================================================
-- SEÇÃO 2 — TABELAS DE APOIO   (C1: strings reais)
-- =====================================================================

-- 2.1 Fases do pedido de fábrica = as pastas físicas.
--     As 4 primeiras batem CARACTERE A CARACTERE com Proposta_Fabrica.status.
--     As 2 últimas (branca/cinza) são NOVAS e aditivas: só aparecem na UI
--     quando o FactoryKanban passar a ler as fases desta tabela.
CREATE TABLE IF NOT EXISTS fase_fabrica (
  id            smallint PRIMARY KEY,
  nome          text NOT NULL UNIQUE,   -- string EXATA gravada em Proposta_Fabrica.status
  ordem         smallint NOT NULL,
  cor_hex       text NOT NULL,
  cor_pasta     text,                   -- nome da pasta física correspondente
  eh_final      boolean NOT NULL DEFAULT false,
  ativo         boolean NOT NULL DEFAULT true
);

INSERT INTO fase_fabrica (id, nome, ordem, cor_hex, cor_pasta, eh_final) VALUES
  (1, 'Proposta solicitada',                  10, '#EF4444', 'amarela', false),
  (2, 'Proposta Recebida',                    20, '#F59E0B', 'amarela', false),
  (3, 'Pedido Feito / Aguardando Maq',        30, '#3B82F6', 'verde',   false),
  (4, 'Proposta Concluida/ Maquina Recebida', 40, '#22C55E', 'verde',   false),
  (5, 'Aguardando faturamento da fábrica',    50, '#F1F5F9', 'branca',  false),
  (6, 'Faturado por nós',                     60, '#94A3B8', 'cinza',   true)
ON CONFLICT (id) DO NOTHING;


-- 2.2 Status da proposta ao cliente. `nome` bate com Formulario.status HOJE
--     (caixa alta em 2/3, "Concluida" sem acento, "Não vendido." com ponto).
--     `probabilidade` sai do CASE hardcoded e passa a viver aqui (C4).
CREATE TABLE IF NOT EXISTS status_proposta (
  id            smallint PRIMARY KEY,
  nome          text NOT NULL UNIQUE,
  ordem         smallint NOT NULL,
  cor_hex       text NOT NULL,
  em_aberto     boolean NOT NULL DEFAULT true,
  probabilidade numeric(3,2) NOT NULL DEFAULT 0,   -- peso p/ forecast ponderado
  ativo         boolean NOT NULL DEFAULT true
);

INSERT INTO status_proposta (id, nome, ordem, cor_hex, em_aberto, probabilidade) VALUES
  (1, 'Enviar Proposta',              10, '#EF4444', true,  0.10),
  (2, 'AGUARDANDO RESPOSTA CLIENTE',  20, '#F59E0B', true,  0.30),
  (3, 'AGUARDANDO RESPOSTA BANCO',    30, '#8B5CF6', true,  0.60),
  (4, 'Concluida-Vendido',            40, '#22C55E', false, 0.00),
  (5, 'Concluida- Não vendido.',      50, '#9CA3AF', false, 0.00)
ON CONFLICT (id) DO NOTHING;
-- 'Lixeira' NÃO entra aqui de propósito: é estado de exclusão, não fase do funil.
-- Ajuste as probabilidades depois de ~3 meses de histórico real (v_funil_tempo_por_fase).


-- 2.3 Motivos de perda — sem isso, "Concluida- Não vendido." não ensina nada.
CREATE TABLE IF NOT EXISTS motivo_perda (
  id                 smallint PRIMARY KEY,
  nome               text NOT NULL UNIQUE,
  exige_concorrente  boolean NOT NULL DEFAULT false,
  ativo              boolean NOT NULL DEFAULT true
);

INSERT INTO motivo_perda (id, nome, exige_concorrente) VALUES
  (1, 'Preço',                        false),
  (2, 'Perdeu para concorrente',      true),
  (3, 'Prazo de entrega',             false),
  (4, 'Crédito negado',               false),
  (5, 'Crédito aprovado parcial',     false),
  (6, 'Cliente desistiu do projeto',  false),
  (7, 'Sem resposta / sumiu',         false),
  (8, 'Condição de pagamento',        false),
  (9, 'Especificação técnica',        false),
  (10,'Outro',                        false)
ON CONFLICT (id) DO NOTHING;


-- 2.4 Sub-etapas de crédito — "AGUARDANDO RESPOSTA BANCO" esconde o gargalo
--     mais caro do ciclo. Aqui ele fica visível.
CREATE TABLE IF NOT EXISTS etapa_credito (
  id      smallint PRIMARY KEY,
  nome    text NOT NULL UNIQUE,
  ordem   smallint NOT NULL,
  ativo   boolean NOT NULL DEFAULT true
);

INSERT INTO etapa_credito (id, nome, ordem) VALUES
  (1, 'Documentos pendentes',   10),
  (2, 'Cadastro enviado',       20),
  (3, 'Em análise',             30),
  (4, 'Comitê',                 40),
  (5, 'Aprovado',               50),
  (6, 'Aprovado parcial',       60),
  (7, 'Negado',                 70),
  (8, 'Formalização',           80),
  (9, 'Recurso liberado',       90)
ON CONFLICT (id) DO NOTHING;


-- =====================================================================
-- SEÇÃO 3 — FORMULARIO (proposta ao cliente): colunas novas
-- =====================================================================

ALTER TABLE "Formulario"
  -- tempo (o relógio começa a contar AGORA; não há como recuperar o passado)
  ADD COLUMN IF NOT EXISTS criado_em            timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS atualizado_em        timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status_desde         timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS previsao_fechamento  date,
  ADD COLUMN IF NOT EXISTS proximo_contato      date,

  -- dono
  ADD COLUMN IF NOT EXISTS vendedor_id          uuid,
  ADD COLUMN IF NOT EXISTS criado_por           uuid,

  -- vínculo com o cadastro de origem (o snapshot dos campos continua!)
  ADD COLUMN IF NOT EXISTS cliente_id           text,
  ADD COLUMN IF NOT EXISTS cliente_origem       text
      CHECK (cliente_origem IN ('omie','manual','principal')),
  ADD COLUMN IF NOT EXISTS cliente_doc_norm     text,   -- só dígitos, para agrupar

  -- exclusão reversível SEM destruir o status do funil
  ADD COLUMN IF NOT EXISTS deleted_at           timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by           uuid,
  ADD COLUMN IF NOT EXISTS deleted_motivo       text,

  -- financeiro (alimentado a partir dos itens, ver SEÇÃO 4)
  ADD COLUMN IF NOT EXISTS valor_bruto          numeric(14,2),
  ADD COLUMN IF NOT EXISTS desconto_total       numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_congelado      numeric(14,2),
  ADD COLUMN IF NOT EXISTS margem_prevista      numeric(14,2),

  -- desfecho
  ADD COLUMN IF NOT EXISTS motivo_perda_id      smallint REFERENCES motivo_perda(id),
  ADD COLUMN IF NOT EXISTS concorrente          text,
  ADD COLUMN IF NOT EXISTS concorrente_valor    numeric(14,2),
  ADD COLUMN IF NOT EXISTS fechado_em           timestamptz,

  -- crédito
  ADD COLUMN IF NOT EXISTS etapa_credito_id     smallint REFERENCES etapa_credito(id),
  ADD COLUMN IF NOT EXISTS banco                text,
  ADD COLUMN IF NOT EXISTS linha_credito        text;  -- PRONAMP / PRONAF / MODERFROTA / próprio

COMMENT ON COLUMN "Formulario".criado_em IS
  'Preenchido com now() no backfill: linhas antigas NÃO têm data real de criação.';
COMMENT ON COLUMN "Formulario".deleted_at IS
  'Exclusão reversível. O status do funil é preservado (não vira mais ''Lixeira'').';


-- 3.1 Backfill do cliente_doc_norm (agrupa o mesmo CNPJ entre propostas)
UPDATE "Formulario"
   SET cliente_doc_norm = nullif(regexp_replace(coalesce("Cpf/Cpnj", ''), '\D', '', 'g'), '')
 WHERE cliente_doc_norm IS NULL;


-- 3.2 Backfill da lixeira (C3): SÓ marca deleted_at; NÃO reescreve status.
--     Mantendo status='Lixeira', o Kanban atual (que filtra .neq('status','Lixeira'))
--     continua escondendo o legado ANTES de a app trocar para a view — sem risco
--     de os itens "ressuscitarem" no quadro. v_formulario.status_ui resolve o rótulo.
UPDATE "Formulario"
   SET deleted_at     = coalesce(deleted_at, now()),
       deleted_motivo = coalesce(deleted_motivo, 'Migrado da lixeira legada (status original desconhecido)')
 WHERE status = 'Lixeira' AND deleted_at IS NULL;


-- =====================================================================
-- SEÇÃO 4 — ITENS DA PROPOSTA (várias unidades e vários itens)  (C2)
-- =====================================================================

CREATE TABLE IF NOT EXISTS proposta_itens (
  id                bigserial PRIMARY KEY,
  proposta_id       bigint NOT NULL REFERENCES "Formulario"(id) ON DELETE CASCADE,
  ordem             smallint NOT NULL DEFAULT 1,

  -- C2: autopropelido é 1º cidadão
  tipo              text NOT NULL CHECK (tipo IN ('trator','implemento','autopropelido','outro')),
  cad_trator_id     bigint,      -- FK lógica p/ cad_trator
  equipamento_id    bigint,      -- FK lógica p/ Equipamentos
  cad_auto_id       bigint,      -- FK lógica p/ cad_autopropelido

  -- SNAPSHOT (preço e specs congelados na data da proposta — de propósito)
  marca             text,
  modelo            text,
  ano               text,
  finame_ncm        text,
  descricao         text,
  imagem            text,
  specs             jsonb,       -- campos técnicos (trator OU autopropelido), em bloco

  qtd               numeric(10,2) NOT NULL DEFAULT 1 CHECK (qtd > 0),
  valor_unit        numeric(14,2) NOT NULL DEFAULT 0,
  desconto_unit     numeric(14,2) NOT NULL DEFAULT 0,
  custo_unit        numeric(14,2),

  valor_total       numeric(14,2)
      GENERATED ALWAYS AS ((valor_unit - desconto_unit) * qtd) STORED,

  -- chassi: só existe a partir do faturamento pela fábrica
  chassi            text,
  chassi_em         timestamptz,

  criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_proposta_itens_proposta ON proposta_itens(proposta_id);
CREATE INDEX IF NOT EXISTS ix_proposta_itens_modelo   ON proposta_itens(marca, modelo);
CREATE UNIQUE INDEX IF NOT EXISTS ux_proposta_itens_chassi
  ON proposta_itens(chassi) WHERE chassi IS NOT NULL;

COMMENT ON TABLE proposta_itens IS
  'Uma linha por item da proposta. O snapshot é intencional: a proposta não muda quando o catálogo mudar.';


-- 4.1 Backfill (C2): cada Formulario vira 1 item. O tipo vem de Formulario.tipo
--     (já gravado pela app da main); rows antigas com tipo NULL caem no fallback
--     heurístico. O snapshot de specs cobre trator E autopropelido (strip_nulls
--     remove o conjunto que não se aplica).
INSERT INTO proposta_itens (
  proposta_id, ordem, tipo, marca, modelo, ano, finame_ncm, imagem, specs,
  qtd, valor_unit
)
SELECT
  f.id, 1,
  coalesce(nullif(f.tipo, ''),
    CASE WHEN f.motor_trator IS NOT NULL THEN 'trator'
         WHEN f.motor_auto   IS NOT NULL THEN 'autopropelido'
         ELSE 'implemento' END),
  f."Marca", f."Modelo", f."Ano"::text, f."Niname/NCM"::text, f."Imagem_Equipamento",
  jsonb_strip_nulls(jsonb_build_object(
    -- trator
    'motor',              f.motor_trator,
    'transmissao_diant',  f.transmissao_diant_trator,
    'bomb_inje',          f.bomb_inje_trator,
    'bomb_hidra',         f.bomb_hidra_trator,
    'embreagem',          f.embreagem_trator,
    'capacit_comb',       f.capacit_comb_trator,
    'cambio',             f.cambio_trator,
    'reversor',           f.reversor_trator,
    'transmissao_tras',   f.trasmissao_tras_trator,
    'oleo_motor',         f.oleo_motor_trator,
    'oleo_transmissao',   f.oleo_trasmissao_trator,
    'diant_min_max',      f.diant_min_max_trator,
    'tras_min_max',       f.tras_min_max_trator,
    -- autopropelido (pulverizador)
    'motor_auto',         f.motor_auto,
    'transmissao_auto',   f.transmissao_auto,
    'tanque_pulv',        f.tanque_pulv_auto,
    'tecnologia',         f.tecnologia_auto,
    'telemetria',         f.telemetria_auto,
    'barra_pulv',         f.barra_pulv_auto,
    'num_secoes',         f.num_secoes_auto,
    'espac_bicos',        f.espac_bicos_auto,
    'vao_livre',          f.vao_livre_auto,
    'bitola',             f.bitola_auto,
    'tanque_comb',        f.tanque_comb_auto
  )),
  greatest(coalesce(nt_num(f."Qtd_Eqp"::text), 1), 1),
  coalesce(nt_num(f."Valor_Total"::text), 0)
    / greatest(coalesce(nt_num(f."Qtd_Eqp"::text), 1), 1)
FROM "Formulario" f
WHERE NOT EXISTS (SELECT 1 FROM proposta_itens i WHERE i.proposta_id = f.id);


-- 4.2 Trigger: itens -> cabeçalho. Mantém Valor_Total legado vivo,
--     para nenhum componente atual quebrar.
CREATE OR REPLACE FUNCTION trg_proposta_recalc()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  v_id := coalesce(NEW.proposta_id, OLD.proposta_id);

  UPDATE "Formulario" f
     SET valor_bruto     = t.bruto,
         desconto_total  = t.desconto,
         custo_congelado = t.custo,
         margem_prevista = CASE WHEN t.custo IS NULL THEN NULL
                                ELSE (t.bruto - t.desconto) - t.custo END,
         "Valor_Total"   = t.liquido,          -- <- coluna legada, sempre em dia
         atualizado_em   = now()
    FROM (
      SELECT coalesce(sum(valor_unit * qtd), 0)                  AS bruto,
             coalesce(sum(desconto_unit * qtd), 0)               AS desconto,
             CASE WHEN count(custo_unit) = 0 THEN NULL
                  ELSE coalesce(sum(custo_unit * qtd), 0) END    AS custo,
             coalesce(sum(valor_total), 0)                       AS liquido
        FROM proposta_itens WHERE proposta_id = v_id
    ) t
   WHERE f.id = v_id;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tg_proposta_recalc ON proposta_itens;
CREATE TRIGGER tg_proposta_recalc
AFTER INSERT OR UPDATE OR DELETE ON proposta_itens
FOR EACH ROW EXECUTE FUNCTION trg_proposta_recalc();

-- NOTA: se "Valor_Total" for TEXT no banco (ver Seção 0), troque a linha marcada por
--   "Valor_Total" = t.liquido::text
-- (e planeje converter a coluna para numeric numa migration futura).


-- =====================================================================
-- SEÇÃO 5 — PROPOSTA_FABRICA: colunas novas
-- =====================================================================

ALTER TABLE "Proposta_Fabrica"
  ADD COLUMN IF NOT EXISTS criado_em             timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS atualizado_em         timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status_desde          timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS vendedor_id           uuid,
  ADD COLUMN IF NOT EXISTS criado_por            uuid,

  -- o que a pasta branca precisa saber
  ADD COLUMN IF NOT EXISTS pedido_fabrica_num    text,
  ADD COLUMN IF NOT EXISTS eta_fabrica           date,
  ADD COLUMN IF NOT EXISTS data_nf_fabrica       date,
  ADD COLUMN IF NOT EXISTS nf_fabrica_num        text,
  ADD COLUMN IF NOT EXISTS data_recebimento      date,
  ADD COLUMN IF NOT EXISTS data_faturamento_nosso date,
  ADD COLUMN IF NOT EXISTS nf_saida_num          text,

  ADD COLUMN IF NOT EXISTS qtd                   numeric(10,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS chassi                text,
  ADD COLUMN IF NOT EXISTS chassi_em             timestamptz,
  ADD COLUMN IF NOT EXISTS custo                 numeric(14,2),

  ADD COLUMN IF NOT EXISTS deleted_at            timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by            uuid;

COMMENT ON COLUMN "Proposta_Fabrica".chassi IS
  'Informado pela fábrica no faturamento. Antes disso o compromisso é por MODELO, não por chassi.';
COMMENT ON COLUMN "Proposta_Fabrica".eta_fabrica IS
  'Sem esta data, a fase "Aguardando Maq" é um limbo sem cobrança possível.';

-- 5.1 A flag `convertido` vira derivada — flag redundante desincroniza cedo ou tarde.
--     Mantida na tabela para não quebrar a UI, mas sincronizada por trigger.
CREATE OR REPLACE FUNCTION trg_sync_convertido()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id_fabrica_ref IS NOT NULL THEN
    UPDATE "Proposta_Fabrica" SET convertido = true, atualizado_em = now()
     WHERE id = NEW.id_fabrica_ref::bigint AND coalesce(convertido, false) = false;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tg_sync_convertido ON "Formulario";
CREATE TRIGGER tg_sync_convertido
AFTER INSERT OR UPDATE OF id_fabrica_ref ON "Formulario"
FOR EACH ROW EXECUTE FUNCTION trg_sync_convertido();

-- Backfill da flag
UPDATE "Proposta_Fabrica" pf
   SET convertido = true
 WHERE EXISTS (SELECT 1 FROM "Formulario" f WHERE f.id_fabrica_ref = pf.id::text)
   AND coalesce(pf.convertido, false) = false;
-- NOTA: id_fabrica_ref é preenchido pela app como texto (initialData?.id). Os casts
--   ::bigint / ::text acima assumem isso; se a coluna já for bigint, remova-os.


-- =====================================================================
-- SEÇÃO 6 — HISTÓRICO DE FASE (só timing — C5)
-- =====================================================================
-- Autoria ("quem/o quê") continua no audit_log, que a app já grava com o autor
-- real do token (via /api/audit/log) e que o popup HistoricoProposta já lê.
-- Esta tabela é SÓ para tempo-por-fase (não depende de autor); usuario_id fica
-- nullable e não tentamos preenchê-lo via SET LOCAL (não funciona no PostgREST).

CREATE TABLE IF NOT EXISTS proposta_status_hist (
  id            bigserial PRIMARY KEY,
  entidade      text NOT NULL CHECK (entidade IN ('cliente','fabrica')),
  registro_id   bigint NOT NULL,
  status_de     text,
  status_para   text NOT NULL,
  dias_na_fase  numeric(10,2),
  usuario_id    uuid,          -- normalmente NULL; autoria vive no audit_log
  observacao    text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_hist_registro ON proposta_status_hist(entidade, registro_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_hist_data     ON proposta_status_hist(criado_em);

-- 6.1 Trigger genérico de timing. Fecha a proposta consultando status_proposta.em_aberto
--     (C4) em vez de LIKE sobre string com acento.
CREATE OR REPLACE FUNCTION trg_status_hist()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_entidade text := TG_ARGV[0];
  v_user uuid;
BEGIN
  BEGIN
    v_user := nullif(current_setting('app.usuario_id', true), '')::uuid;
  EXCEPTION WHEN others THEN v_user := NULL;
  END;

  NEW.atualizado_em := now();

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO proposta_status_hist
      (entidade, registro_id, status_de, status_para, dias_na_fase, usuario_id)
    VALUES
      (v_entidade, NEW.id, OLD.status, NEW.status,
       round(extract(epoch from (now() - OLD.status_desde)) / 86400.0, 2),
       v_user);

    NEW.status_desde := now();

    -- C4: fechamento por tabela de domínio, não por LIKE 'Concluída%'
    IF v_entidade = 'cliente'
       AND EXISTS (SELECT 1 FROM status_proposta sp
                    WHERE sp.nome = NEW.status AND sp.em_aberto = false) THEN
      NEW.fechado_em := now();
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status_desde := now();
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_hist_cliente ON "Formulario";
CREATE TRIGGER tg_hist_cliente
BEFORE INSERT OR UPDATE ON "Formulario"
FOR EACH ROW EXECUTE FUNCTION trg_status_hist('cliente');

DROP TRIGGER IF EXISTS tg_hist_fabrica ON "Proposta_Fabrica";
CREATE TRIGGER tg_hist_fabrica
BEFORE INSERT OR UPDATE ON "Proposta_Fabrica"
FOR EACH ROW EXECUTE FUNCTION trg_status_hist('fabrica');


-- =====================================================================
-- SEÇÃO 7 — ANEXOS (a folha do pedido que acumula papel)
-- =====================================================================

CREATE TABLE IF NOT EXISTS proposta_anexos (
  id            bigserial PRIMARY KEY,
  entidade      text NOT NULL CHECK (entidade IN ('cliente','fabrica')),
  registro_id   bigint NOT NULL,
  tipo          text NOT NULL,   -- ver tabela tipo_anexo
  fase_no_anexo text,            -- em que pasta/fase o papel entrou
  nome_arquivo  text,
  storage_path  text NOT NULL,   -- bucket 'propostas'
  tamanho_bytes bigint,
  enviado_por   uuid,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_anexos_registro ON proposta_anexos(entidade, registro_id);

CREATE TABLE IF NOT EXISTS tipo_anexo (
  id        smallint PRIMARY KEY,
  nome      text NOT NULL UNIQUE,
  entidade  text NOT NULL,
  fase_alvo text,
  obrigatorio boolean NOT NULL DEFAULT false
);

-- fase_alvo usa as strings REAIS de status (C1).
INSERT INTO tipo_anexo (id, nome, entidade, fase_alvo, obrigatorio) VALUES
  (1,  'Proposta assinada',        'cliente', 'AGUARDANDO RESPOSTA CLIENTE',      false),
  (2,  'Documentos do cliente',    'cliente', 'AGUARDANDO RESPOSTA BANCO',        true),
  (3,  'Cadastro do banco',        'cliente', 'AGUARDANDO RESPOSTA BANCO',        false),
  (4,  'Carta de aprovação',       'cliente', 'AGUARDANDO RESPOSTA BANCO',        false),
  (5,  'Contrato de financiamento','cliente', 'Concluida-Vendido',               false),
  (6,  'Pedido à fábrica',         'fabrica', 'Pedido Feito / Aguardando Maq',   true),
  (7,  'NF da fábrica',            'fabrica', 'Faturado por nós',                true),
  (8,  'NF de saída (nossa)',      'fabrica', 'Faturado por nós',                true),
  (9,  'Termo de entrega',         'fabrica', 'Faturado por nós',                false),
  (10, 'Outro',                    'cliente', NULL,                              false)
ON CONFLICT (id) DO NOTHING;

-- Criar o bucket 'propostas' no Storage (privado) antes de usar.


-- =====================================================================
-- SEÇÃO 8 — VIEWS   (C4: sem LIKE/CASE sobre string; JOIN em status_proposta)
-- =====================================================================

-- 8.1 Compatibilidade: a UI atual filtra status='Lixeira'.
--     Troque o .from('Formulario') por .from('v_formulario') e filtre status_ui.
CREATE OR REPLACE VIEW v_formulario AS
SELECT f.*,
       CASE WHEN f.deleted_at IS NOT NULL THEN 'Lixeira' ELSE f.status END AS status_ui,
       round(extract(epoch from (now() - f.status_desde)) / 86400.0)::int   AS dias_na_fase,
       round(extract(epoch from (now() - f.criado_em))   / 86400.0)::int    AS dias_total,
       sp.cor_hex, sp.em_aberto, sp.ordem AS status_ordem, sp.probabilidade
  FROM "Formulario" f
  LEFT JOIN status_proposta sp ON sp.nome = f.status;

-- 8.2 Pedidos de fábrica com aging e cor da pasta
CREATE OR REPLACE VIEW v_proposta_fabrica AS
SELECT pf.*,
       round(extract(epoch from (now() - pf.status_desde)) / 86400.0)::int AS dias_na_fase,
       ff.cor_hex, ff.cor_pasta, ff.ordem AS fase_ordem, ff.eh_final,
       CASE WHEN pf.eta_fabrica IS NOT NULL AND pf.eta_fabrica < current_date
                 AND NOT coalesce(ff.eh_final, false)
            THEN current_date - pf.eta_fabrica END AS dias_atraso_eta
  FROM "Proposta_Fabrica" pf
  LEFT JOIN fase_fabrica ff ON ff.nome = pf.status
 WHERE pf.deleted_at IS NULL;

-- 8.3 Funil: conversão e tempo médio por etapa (a partir do histórico)
CREATE OR REPLACE VIEW v_funil_tempo_por_fase AS
SELECT entidade, status_de AS fase,
       count(*)                    AS saidas,
       round(avg(dias_na_fase), 1) AS dias_medio,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY dias_na_fase)::numeric, 1) AS dias_mediano
  FROM proposta_status_hist
 WHERE status_de IS NOT NULL
 GROUP BY entidade, status_de;

-- 8.4 Forecast ponderado (C4): probabilidade vem da tabela; sem CASE por string.
CREATE OR REPLACE VIEW v_forecast AS
SELECT f.id, f."Cliente", f.vendedor_id, f.status,
       coalesce(f.valor_bruto - f.desconto_total, nt_num(f."Valor_Total"::text)) AS valor,
       f.margem_prevista, f.previsao_fechamento,
       sp.probabilidade,
       coalesce(f.valor_bruto - f.desconto_total, nt_num(f."Valor_Total"::text))
         * sp.probabilidade AS valor_ponderado
  FROM "Formulario" f
  JOIN status_proposta sp ON sp.nome = f.status AND sp.em_aberto = true
 WHERE f.deleted_at IS NULL;

-- 8.5 Compromisso por modelo — como o chassi só existe no faturamento,
--     a "reserva" possível é por MODELO + quantidade. (C1: strings reais)
CREATE OR REPLACE VIEW v_compromisso_modelo AS
SELECT i.marca, i.modelo,
       sum(i.qtd) FILTER (WHERE f.status IN ('AGUARDANDO RESPOSTA CLIENTE','AGUARDANDO RESPOSTA BANCO')) AS qtd_negociando,
       sum(i.qtd) FILTER (WHERE f.status = 'Concluida-Vendido')                                          AS qtd_vendida,
       count(DISTINCT f.id)                                                                              AS propostas
  FROM proposta_itens i
  JOIN "Formulario" f ON f.id = i.proposta_id AND f.deleted_at IS NULL
 GROUP BY i.marca, i.modelo;

-- 8.6 Fila do dia: o que precisa de ação (C4: aberto via JOIN em status_proposta)
CREATE OR REPLACE VIEW v_fila_acao AS
SELECT f.id, f."Cliente", f.status, f.vendedor_id, f.proximo_contato,
       round(extract(epoch from (now() - f.status_desde)) / 86400.0)::int AS dias_parado,
       CASE WHEN f.proximo_contato < current_date THEN 'contato vencido'
            WHEN round(extract(epoch from (now() - f.status_desde)) / 86400.0) > 15 THEN 'parado +15d'
            WHEN f.proximo_contato IS NULL THEN 'sem próximo contato'
       END AS motivo
  FROM "Formulario" f
  JOIN status_proposta sp ON sp.nome = f.status AND sp.em_aberto = true
 WHERE f.deleted_at IS NULL
   AND (f.proximo_contato < current_date
        OR f.proximo_contato IS NULL
        OR now() - f.status_desde > interval '15 days');


-- =====================================================================
-- SEÇÃO 9 — ÍNDICES
-- =====================================================================
CREATE INDEX IF NOT EXISTS ix_form_status       ON "Formulario"(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_form_vendedor     ON "Formulario"(vendedor_id);
CREATE INDEX IF NOT EXISTS ix_form_criado       ON "Formulario"(criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_form_status_desde ON "Formulario"(status_desde);
CREATE INDEX IF NOT EXISTS ix_form_doc          ON "Formulario"(cliente_doc_norm);
CREATE INDEX IF NOT EXISTS ix_form_fabricaref   ON "Formulario"(id_fabrica_ref);
CREATE INDEX IF NOT EXISTS ix_pf_status         ON "Proposta_Fabrica"(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_pf_eta            ON "Proposta_Fabrica"(eta_fabrica);


COMMIT;


-- =====================================================================
-- SEÇÃO 10 — VERIFICAÇÃO PÓS-MIGRATION (rode e confira)
-- =====================================================================
-- Toda string de status casa com a tabela de domínio? (prova da C1)
--   SELECT DISTINCT f.status FROM "Formulario" f
--     LEFT JOIN status_proposta s ON s.nome = f.status
--    WHERE s.id IS NULL AND f.status <> 'Lixeira';           -- esperado: 0 linhas
--   SELECT DISTINCT pf.status FROM "Proposta_Fabrica" pf
--     LEFT JOIN fase_fabrica ff ON ff.nome = pf.status
--    WHERE ff.id IS NULL;                                     -- esperado: 0 linhas
--
-- Todo Formulario tem pelo menos 1 item?
--   SELECT count(*) FROM "Formulario" f
--    WHERE NOT EXISTS (SELECT 1 FROM proposta_itens i WHERE i.proposta_id = f.id);
--   -- esperado: 0
--
-- Autopropelido preservado? (prova da C2)
--   SELECT count(*) FROM proposta_itens WHERE tipo = 'autopropelido';
--   -- deve bater com: SELECT count(*) FROM "Formulario" WHERE tipo = 'autopropelido';
--
-- A soma dos itens bate com o Valor_Total legado?
--   SELECT f.id, f."Valor_Total", sum(i.valor_total)
--     FROM "Formulario" f JOIN proposta_itens i ON i.proposta_id = f.id
--    GROUP BY f.id, f."Valor_Total"
--   HAVING abs(nt_num(f."Valor_Total"::text) - sum(i.valor_total)) > 0.05;
--   -- esperado: nenhuma linha
--
-- Forecast não nasce zerado? (prova da C4)
--   SELECT round(sum(valor_ponderado)) FROM v_forecast;       -- esperado: > 0
--
-- Teste do histórico + fechamento:
--   UPDATE "Formulario" SET status = 'Concluida-Vendido' WHERE id = <um id de teste>;
--   SELECT status, fechado_em FROM "Formulario" WHERE id = <id>;   -- fechado_em preenchido
--   SELECT * FROM proposta_status_hist ORDER BY id DESC LIMIT 1;   -- registro criado
--   SELECT count(*) FROM v_forecast WHERE id = <id>;               -- 0 (saiu do funil)


-- =====================================================================
-- SEÇÃO 11 — O QUE MUDA NA APLICAÇÃO (checklist — trabalhar a partir da `main`)
-- =====================================================================
-- [ ] Kanban.jsx: trocar .from('Formulario') por .from('v_formulario');
--     filtrar lixeira por status_ui = 'Lixeira'; coluna "Parado há" (dias_na_fase)
--     e coluna "Vendedor"; ordenar por dias_na_fase DESC.
-- [ ] FactoryKanban.jsx: usar v_proposta_fabrica; ler fases de fase_fabrica
--     (as 2 fases novas aparecem sozinhas); quadradinho com cor_pasta.
-- [ ] EditModal.jsx (handleUpdate): ao salvar, enviar SÓ colunas graváveis de
--     "Formulario" — a leitura via v_formulario traz status_ui/dias_na_fase/cor_hex/
--     em_aberto/probabilidade, que NÃO podem ir no update('Formulario').
-- [ ] FormModal.jsx: criar linhas em proposta_itens (Valor_Total vira derivado do
--     trigger); gravar cliente_id + cliente_origem além do snapshot.
-- [ ] Ao marcar 'Concluida- Não vendido.': exigir motivo_perda_id.
-- [ ] Lixeira: gravar deleted_at/deleted_by (a leitura já precisa usar status_ui).
-- [ ] Relatório PDF (page.jsx): ordenar por dias parados, incluir vendedor e a
--     coluna "parado há", e usar valor_ponderado (v_forecast) no rodapé além do bruto.
-- [ ] Histórico: manter HistoricoProposta lendo audit_log (não duplicar). Se quiser
--     "tempo em cada fase" no popup, ler proposta_status_hist separadamente.
-- [ ] RLS: hoje o acesso é só pela permissão 'propostas' na aplicação. Se vendedor
--     não pode ver a carteira inteira, resolver aqui — política por vendedor_id,
--     com gestor em lista de exceção.
-- =====================================================================
