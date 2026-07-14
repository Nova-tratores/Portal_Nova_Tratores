-- =============================================================================
-- Módulo FROTA — Portal Nova Tratores
--
-- O "manda-chuva" dos dados de frota. Hoje o MESMO carro vive em 4 cadastros
-- (Placas, SupaPlacas, comercial_veiculos, tecnico_veiculos) ligados por string
-- de placa, em 3 grafias diferentes. Este módulo cria um HUB que INDEXA todos,
-- sem substituir nenhum:
--
--   - `Placas`      continua sendo lida pelo DRE (patrimônio) e pelo pátio.
--   - `SupaPlacas`  continua resolvendo o id_projeto_omie das Requisições.
--   → o Frota NUNCA faz INSERT/DELETE nelas por sync. Só guarda o ponteiro.
--
-- Regra do módulo: ESPELHA o que é remoto (Rota Exata), faz VIEW do que é
-- local (Requisições). Nada de cópia com drift.
--
-- Correr no Supabase: SQL Editor -> colar -> Run. Idempotente (pode rodar 2x).
-- =============================================================================

-- =============================================================================
-- 0) FUNÇÕES DE PLACA (gêmeas das de src/lib/frota/placa.ts)
-- =============================================================================

-- Normaliza: maiúscula, só letras e números. "epx-5402" -> "EPX5402"
CREATE OR REPLACE FUNCTION frota_norm_placa(p TEXT) RETURNS TEXT
  LANGUAGE sql IMMUTABLE AS
  $$ SELECT upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- Extrai a placa de um NumPlaca ("MODELO - PLACA").
-- Pega o ÚLTIMO token que PARECE placa; junta o par quando a placa antiga vem
-- com hífen ("GOL - AYB-4230" -> AYB4230). O split ingênuo devolvia "4000" em
-- "F-4000 - LNX1234".
CREATE OR REPLACE FUNCTION frota_placa_de_numplaca(s TEXT) RETURNS TEXT
  LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  toks   TEXT[];
  n      INT;
  i      INT;
  atual  TEXT;
  par    TEXT;
BEGIN
  toks := array_remove(regexp_split_to_array(coalesce(s, ''), '[-–—\s/]+'), '');
  n := coalesce(array_length(toks, 1), 0);
  IF n = 0 THEN RETURN ''; END IF;

  FOR i IN REVERSE n..1 LOOP
    atual := frota_norm_placa(toks[i]);
    IF atual ~ '^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$' THEN
      RETURN atual;
    END IF;
    IF i > 1 THEN
      par := frota_norm_placa(toks[i - 1] || toks[i]);
      IF par ~ '^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$' THEN
        RETURN par;
      END IF;
    END IF;
  END LOOP;

  -- Nada parece placa: melhor esforço, o último token.
  RETURN frota_norm_placa(toks[n]);
END $$;

-- Resolve apelido -> placa canônica. As grafias erradas contavam o MESMO carro
-- duas vezes. A canônica é sempre a que o RASTREADOR usa (ele está no carro).
CREATE OR REPLACE FUNCTION frota_resolver_placa(p TEXT) RETURNS TEXT
  LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE frota_norm_placa(p)
    WHEN 'EVG1467'  THEN 'EVG1E67'   -- Caminhão Munck
    WHEN 'SEV9I75'  THEN 'SEB9I75'   -- Voyage (typo só na tabela Placas)
    WHEN 'TKBB8I49' THEN 'TKB8I49'   -- 8 caracteres; placa tem 7
    ELSE frota_norm_placa(p)
  END $$;

-- updated_at automático
CREATE OR REPLACE FUNCTION frota_touch() RETURNS TRIGGER
  LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- =============================================================================
-- 1) HUB — frota_veiculos
-- =============================================================================
CREATE TABLE IF NOT EXISTS frota_veiculos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidade canônica
  placa             TEXT NOT NULL UNIQUE,            -- NORMALIZADA: "EPX5402"
  placa_exibicao    TEXT,                            -- "EPX-5402" (só display)
  tipo_registro     TEXT NOT NULL DEFAULT 'veiculo'
                    CHECK (tipo_registro IN ('veiculo', 'avulso')),
  -- 'avulso' = CLI0002 (clientes) / TRA0001 (tratores) / 0000000 (quadriciclos):
  -- são baldes de abastecimento do cartão-frota, NÃO veículos. O gasto deles é
  -- real e CONTA nos custos, mas ficam fora de km/L, pátio, ranking e DRE.
  -- Ficam aqui porque o hub conhece tudo — e assim some a denylist hardcoded.

  -- Ponteiros para as fontes (o "amarrado")
  adesao_id         BIGINT UNIQUE,                   -- Rota Exata /adesoes.id
  id_placa          BIGINT,                          -- Placas.IdPlaca
  supa_placa_id     BIGINT,                          -- SupaPlacas.IdPlaca
  comercial_id      UUID,                            -- comercial_veiculos.id
  pendencia_vinculo BOOLEAN NOT NULL DEFAULT FALSE,  -- não achou par -> aba Pendências

  -- Ficha (semeada da Rota Exata, EDITÁVEL no portal)
  marca             TEXT,
  modelo            TEXT,
  descricao         TEXT,
  ano               INT,
  ano_modelo        INT,
  cor               TEXT,
  chassi            TEXT,
  renavam           TEXT,
  tipo_veiculo      TEXT,
  combustivel       TEXT,
  capacidade_tanque NUMERIC(8,1),
  custo_km_ref      NUMERIC(10,4),

  -- Operacional (100% portal)
  categoria         TEXT NOT NULL DEFAULT 'outros',  -- comercial|oficina|diretoria|apoio|outros
  setor             TEXT,
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  status            TEXT NOT NULL DEFAULT 'ativo'
                    CHECK (status IN ('ativo','manutencao','parado','vendido','locado')),
  observacoes       TEXT,

  -- Omie (era da SupaPlacas; agora edita-se aqui e espelha-se pra lá).
  -- BIGINT para casar com SupaPlacas.id_projeto_omie (ex.: 2005928545) — se
  -- fosse TEXT, o COALESCE do seed quebra com "types text and bigint cannot
  -- be matched".
  id_projeto_omie        BIGINT,
  id_projeto_omie_castro BIGINT,

  -- Seguro / aquisição
  numero_apolice    TEXT,
  seguradora        TEXT,
  dt_aquisicao      DATE,
  tipo_negociacao   TEXT,
  locacao_inicio    DATE,
  locacao_fim       DATE,

  -- Anti-sobrescrita do sync
  campos_manuais    TEXT[] NOT NULL DEFAULT '{}',    -- colunas travadas contra o sync
  re_raw            JSONB,                           -- /adesoes cru (sempre sobrescrito)
  origem_cadastro   TEXT NOT NULL DEFAULT 'manual',  -- rotaexata|placas|abastecimento|manual
  visto_em          TIMESTAMPTZ,
  ausente_na_origem BOOLEAN NOT NULL DEFAULT FALSE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tem_rastreador é derivado (adicionado à parte p/ ser idempotente em bases já criadas)
ALTER TABLE frota_veiculos
  ADD COLUMN IF NOT EXISTS tem_rastreador BOOLEAN
  GENERATED ALWAYS AS (adesao_id IS NOT NULL) STORED;

CREATE INDEX IF NOT EXISTS idx_frota_veic_adesao  ON frota_veiculos(adesao_id) WHERE adesao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_frota_veic_idplaca ON frota_veiculos(id_placa)  WHERE id_placa IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_frota_veic_ativo   ON frota_veiculos(ativo, tipo_registro);

DROP TRIGGER IF EXISTS trg_frota_veiculos_touch ON frota_veiculos;
CREATE TRIGGER trg_frota_veiculos_touch BEFORE UPDATE ON frota_veiculos
  FOR EACH ROW EXECUTE FUNCTION frota_touch();

-- Apelidos: grafia errada -> veículo certo (e trocas de placa/Mercosul no futuro)
CREATE TABLE IF NOT EXISTS frota_veiculos_alias (
  placa_alias TEXT PRIMARY KEY,                      -- normalizada
  veiculo_id  UUID NOT NULL REFERENCES frota_veiculos(id) ON DELETE CASCADE,
  fonte       TEXT,                                  -- rotaexata|abastecimento|placas|manual
  motivo      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2) MOTORISTAS + RESPONSÁVEIS (quem dirigia quando)
-- =============================================================================
CREATE TABLE IF NOT EXISTS frota_motoristas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  re_id        BIGINT UNIQUE,                        -- /usuarios.id
  nome         TEXT NOT NULL,
  cpf          TEXT,
  email        TEXT,
  telefone     TEXT,
  cargo        TEXT,
  cnh          TEXT,
  cnh_validade DATE,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  gestor       BOOLEAN NOT NULL DEFAULT FALSE,
  e_motorista  BOOLEAN NOT NULL DEFAULT FALSE,
  pessoa_id    TEXT,                                 -- de-para manual p/ o RH do portal
  re_raw       JSONB,
  visto_em     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_frota_motoristas_touch ON frota_motoristas;
CREATE TRIGGER trg_frota_motoristas_touch BEFORE UPDATE ON frota_motoristas
  FOR EACH ROW EXECUTE FUNCTION frota_touch();

-- Histórico de responsável. A Rota Exata (/motoristas) já traz dt_inicio/fim,
-- então isto é ESPELHO, não reconstrução — vale retroativamente.
-- É o que permite imputar a multa ao funcionário certo NA DATA da infração.
CREATE TABLE IF NOT EXISTS frota_responsaveis (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id     UUID NOT NULL REFERENCES frota_veiculos(id) ON DELETE CASCADE,
  motorista_id   UUID REFERENCES frota_motoristas(id),
  re_id          TEXT UNIQUE,                        -- /motoristas._id (idempotência)
  motorista_nome TEXT,
  inicio         DATE NOT NULL,
  fim            DATE,                               -- NULL = responsável atual
  modo           TEXT,
  origem         TEXT NOT NULL DEFAULT 'rotaexata',  -- rotaexata|manual|checkin
  obs            TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Só UM responsável em aberto por carro
CREATE UNIQUE INDEX IF NOT EXISTS uq_frota_resp_aberto
  ON frota_responsaveis(veiculo_id) WHERE fim IS NULL;
CREATE INDEX IF NOT EXISTS idx_frota_resp_periodo
  ON frota_responsaveis(veiculo_id, inicio, fim);

-- =============================================================================
-- 3) GEOCERCAS (espelho de /destinos + geocercas criadas no portal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS frota_geocercas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  re_id      BIGINT UNIQUE,                          -- NULL = criada no portal
  nome       TEXT NOT NULL,
  latitude   DOUBLE PRECISION NOT NULL,
  longitude  DOUBLE PRECISION NOT NULL,
  raio_m     INT NOT NULL DEFAULT 500,
  tipo_local TEXT[] NOT NULL DEFAULT '{}',
  classe     TEXT,                                   -- cliente|loja|manutencao|estacionamento|descarga|outro
  endereco   TEXT,
  cnpj       TEXT,
  cliente_id TEXT,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  origem     TEXT NOT NULL DEFAULT 'rotaexata',
  re_raw     JSONB,
  visto_em   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 4) MULTAS (espelho de /multas + colunas do portal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS frota_multas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  re_id           TEXT UNIQUE NOT NULL,              -- /multas._id -> onConflict
  veiculo_id      UUID REFERENCES frota_veiculos(id),
  placa           TEXT NOT NULL,
  adesao_id       BIGINT,

  -- ►► SYNC (sobrescrito a cada varredura)
  tipo            TEXT,
  numero_auto     TEXT,
  codigo          TEXT,
  descricao       TEXT,
  nivel_infracao  TEXT,
  pontos          INT,
  valor           NUMERIC(12,2),
  dt_multa        TIMESTAMPTZ,
  dt_vencimento   DATE,
  dt_defesa       DATE,
  situacao        TEXT,                              -- situação NA ORIGEM
  odometro        NUMERIC(12,1),
  motorista_id    UUID REFERENCES frota_motoristas(id),
  motorista_nome  TEXT,
  motorista_cpf   TEXT,
  motorista_cnh   TEXT,
  local_endereco  TEXT,
  local_lat       DOUBLE PRECISION,
  local_lng       DOUBLE PRECISION,
  imagens         JSONB NOT NULL DEFAULT '[]'::jsonb,
  re_raw          JSONB,
  visto_em        TIMESTAMPTZ,

  -- ►► PORTAL (o sync NUNCA envia estas chaves no payload)
  status_interno  TEXT NOT NULL DEFAULT 'nova'
                  CHECK (status_interno IN ('nova','em_analise','em_defesa','paga','descontada','arquivada')),
  responsavel_id  UUID REFERENCES frota_motoristas(id),  -- override do RH
  -- A Rota Exata pode carimbar o motorista ATUAL em vez do da DATA da infração.
  -- Em vez de confiar cegamente, o sync compara com frota_responsaveis(dt_multa)
  -- e levanta a bandeira. Quem decide é o RH.
  motorista_divergente BOOLEAN NOT NULL DEFAULT FALSE,
  descontado_folha     BOOLEAN NOT NULL DEFAULT FALSE,
  desconto_competencia TEXT,                         -- "2026-08"
  obs_interna     TEXT,
  anexos          JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frota_multas_veic ON frota_multas(veiculo_id, dt_multa DESC);
CREATE INDEX IF NOT EXISTS idx_frota_multas_mot  ON frota_multas(motorista_id);
DROP TRIGGER IF EXISTS trg_frota_multas_touch ON frota_multas;
CREATE TRIGGER trg_frota_multas_touch BEFORE UPDATE ON frota_multas
  FOR EACH ROW EXECUTE FUNCTION frota_touch();

-- =============================================================================
-- 5) MANUTENÇÕES (espelho de /manutencoes + registro manual)
--    As Requisições "Veicular Manutenção" NÃO são copiadas — entram pela VIEW.
-- =============================================================================
CREATE TABLE IF NOT EXISTS frota_manutencoes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem               TEXT NOT NULL CHECK (origem IN ('rotaexata','manual')),
  origem_id            TEXT NOT NULL,                -- /manutencoes.id | uuid próprio
  veiculo_id           UUID REFERENCES frota_veiculos(id),
  placa                TEXT NOT NULL,
  adesao_id            BIGINT,
  tipo                 TEXT,                         -- Corretiva | Preventiva
  status               TEXT,                         -- Realizada | Agendada | Vencida
  descricao            TEXT,
  observacao           TEXT,
  fornecedor           TEXT,
  valor_total          NUMERIC(12,2),
  hodometro_realizado  NUMERIC(12,1),
  hodometro_vencimento NUMERIC(12,1),
  dt_agendamento       DATE,
  dt_realizado         DATE,
  dt_vencimento        DATE,
  kms_restantes        NUMERIC(12,1),
  dias_restantes       INT,
  manutencao_por_km    BOOLEAN,
  manutencao_por_tempo BOOLEAN,
  plano_id             BIGINT,
  custo_id             BIGINT,
  decorrente_sinistro  BOOLEAN NOT NULL DEFAULT FALSE,
  requisicao_id        TEXT,                         -- link opcional p/ Requisicao.id
  anexos               JSONB NOT NULL DEFAULT '[]'::jsonb,
  re_raw               JSONB,
  visto_em             TIMESTAMPTZ,
  criado_por           TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (origem, origem_id)
);
CREATE INDEX IF NOT EXISTS idx_frota_manut_veic ON frota_manutencoes(veiculo_id, dt_realizado DESC);
DROP TRIGGER IF EXISTS trg_frota_manut_touch ON frota_manutencoes;
CREATE TRIGGER trg_frota_manut_touch BEFORE UPDATE ON frota_manutencoes
  FOR EACH ROW EXECUTE FUNCTION frota_touch();

-- =============================================================================
-- 6) CUSTOS (espelho de /custos — 471 lançamentos)
-- =============================================================================
CREATE TABLE IF NOT EXISTS frota_custos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  re_id         TEXT UNIQUE NOT NULL,
  veiculo_id    UUID REFERENCES frota_veiculos(id),
  placa         TEXT NOT NULL,
  adesao_id     BIGINT,
  dt_lancamento DATE NOT NULL,
  tipo_custo    TEXT,
  km_veiculo    NUMERIC(12,1),
  valor         NUMERIC(12,2),
  -- Campos de combustível: SINAL DE DUPLICIDADE com a tabela `abastecimentos`
  -- (o CSV do cartão-frota). Somar os dois DOBRA o gasto de combustível.
  valor_litro     NUMERIC(10,4),
  litros          NUMERIC(10,3),
  tipo_combustivel TEXT,
  fornecedor    TEXT,
  descricao     TEXT,
  parcelado     BOOLEAN,
  mensalidade   BOOLEAN,
  integracao    TEXT,
  re_raw        JSONB,
  visto_em      TIMESTAMPTZ,
  ignorar_no_total BOOLEAN NOT NULL DEFAULT FALSE,   -- anti-double-count, editável
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Coluna GERADA exige expressão IMUTÁVEL — por isso lower()+LIKE (imutáveis) em
-- vez de ILIKE, que depende de collation.
ALTER TABLE frota_custos
  ADD COLUMN IF NOT EXISTS eh_combustivel BOOLEAN
  GENERATED ALWAYS AS (
    coalesce(litros, 0) > 0
    OR lower(coalesce(tipo_custo, '')) LIKE '%abastec%'
    OR lower(coalesce(tipo_custo, '')) LIKE '%combust%'
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_frota_custos_veic ON frota_custos(veiculo_id, dt_lancamento DESC);

-- =============================================================================
-- 7) ODÔMETRO (espelho de /odometro) — a fonte BOA de km
--    As outras 3 são ruins: haversine (erro de GPS), hodômetro digitado pelo
--    motorista no cartão (o próprio create-abastecimento.sql admite que "podem
--    vir vazias/erradas") e Placas.hodometro (manual, estagnado).
-- =============================================================================
CREATE TABLE IF NOT EXISTS frota_odometro (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id    UUID NOT NULL REFERENCES frota_veiculos(id) ON DELETE CASCADE,
  adesao_id     BIGINT NOT NULL,
  data          DATE NOT NULL,
  km_adesao     NUMERIC(12,1),                       -- odometro_adesao / 1000
  km_rastreador NUMERIC(12,1),
  re_raw        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (adesao_id, data)
);

-- =============================================================================
-- 8) DOCUMENTOS (100% portal — a Rota Exata não guarda CRLV)
-- =============================================================================
CREATE TABLE IF NOT EXISTS frota_documentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id      UUID NOT NULL REFERENCES frota_veiculos(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL
                  CHECK (tipo IN ('crlv','seguro','ipva','licenciamento','contrato_locacao','laudo','outros')),
  numero          TEXT,
  emissor         TEXT,
  vigencia_inicio DATE,
  vigencia_fim    DATE,                              -- motor dos alertas
  valor           NUMERIC(12,2),
  parcelas        INT,
  arquivo_url     TEXT,                              -- Storage: bucket `frota-documentos`
  nome_arquivo    TEXT,
  alerta_dias     INT NOT NULL DEFAULT 30,
  obs             TEXT,
  criado_por      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frota_docs_venc ON frota_documentos(vigencia_fim)
  WHERE vigencia_fim IS NOT NULL;
DROP TRIGGER IF EXISTS trg_frota_docs_touch ON frota_documentos;
CREATE TRIGGER trg_frota_docs_touch BEFORE UPDATE ON frota_documentos
  FOR EACH ROW EXECUTE FUNCTION frota_touch();

-- =============================================================================
-- 9) FATOS DIÁRIOS — ignição e paradas
-- =============================================================================
-- frota_dias é TABELA (não view sobre rotas_vendedor) porque rotas_vendedor.pontos
-- vai ter que ser podado (~580MB/ano). Se fosse view, o histórico de km/ignição
-- morreria junto com o traçado. Aqui só ficam números: 5.8k linhas/ano.
CREATE TABLE IF NOT EXISTS frota_dias (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id     UUID NOT NULL REFERENCES frota_veiculos(id) ON DELETE CASCADE,
  placa          TEXT NOT NULL,
  data           DATE NOT NULL,
  adesao_id      BIGINT,
  motorista_id   UUID REFERENCES frota_motoristas(id),   -- snapshot de frota_responsaveis
  motorista_nome TEXT,

  -- rota
  km_total       NUMERIC(10,1) NOT NULL DEFAULT 0,       -- haversine
  km_odometro    NUMERIC(10,1),                          -- Δ /odometro (fonte boa)
  hora_inicio    TIMESTAMPTZ,
  hora_fim       TIMESTAMPTZ,
  posicoes_total INT NOT NULL DEFAULT 0,

  -- ignição
  partidas               INT NOT NULL DEFAULT 0,         -- transições 0->1 (debounced)
  ja_ligado_no_inicio    BOOLEAN NOT NULL DEFAULT FALSE, -- 1º fix já com motor ligado (ambíguo)
  primeira_partida       TIMESTAMPTZ,
  ultimo_desligamento    TIMESTAMPTZ,
  tempo_ligado_min       INT NOT NULL DEFAULT 0,         -- motor girando (inclui marcha lenta)
  tempo_movimento_min    INT NOT NULL DEFAULT 0,         -- ligado E vel > 0
  tempo_marcha_lenta_min INT NOT NULL DEFAULT 0,         -- ligado - movimento = combustível parado
  tempo_desligado_min    INT NOT NULL DEFAULT 0,
  vel_max                NUMERIC(6,1) NOT NULL DEFAULT 0,

  -- paradas
  paradas_total    INT NOT NULL DEFAULT 0,
  paradas_cliente  INT NOT NULL DEFAULT 0,
  paradas_loja     INT NOT NULL DEFAULT 0,
  paradas_atipicas INT NOT NULL DEFAULT 0,

  -- consumo do dia (denormalizado do `abastecimentos` p/ o dashboard)
  litros            NUMERIC(10,3) NOT NULL DEFAULT 0,
  gasto_combustivel NUMERIC(12,2) NOT NULL DEFAULT 0,

  calculado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (veiculo_id, data)
);
CREATE INDEX IF NOT EXISTS idx_frota_dias_data ON frota_dias(data DESC);

-- Uma LINHA por parada (não JSONB): a tela precisa filtrar/ordenar/justificar.
CREATE TABLE IF NOT EXISTS frota_paradas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id  UUID NOT NULL REFERENCES frota_veiculos(id) ON DELETE CASCADE,
  placa       TEXT NOT NULL,
  data        DATE NOT NULL,
  inicio      TIMESTAMPTZ NOT NULL,
  fim         TIMESTAMPTZ,
  duracao_min INT NOT NULL,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,

  -- ►► CALCULADO (recomputável; o reprocesso sobrescreve)
  classe       TEXT NOT NULL,   -- loja|cliente|manutencao|estacionamento|descarga|
                                -- outro_destino|cliente_portal|visita|abastecimento|
                                -- servico|fora_geocerca
  geocerca_id  UUID REFERENCES frota_geocercas(id),
  destino_nome TEXT,
  cliente_id   TEXT,
  atipica      BOOLEAN NOT NULL DEFAULT FALSE,
  nivel        TEXT,            -- baixa|media|alta (por duração)
  fora_horario BOOLEAN NOT NULL DEFAULT FALSE,
  fim_de_semana BOOLEAN NOT NULL DEFAULT FALSE,
  motorista_id UUID REFERENCES frota_motoristas(id),

  -- ►► PORTAL (o reprocesso NÃO inclui estas colunas no SET)
  endereco        TEXT,          -- geocode preguiçoso, cacheado
  justificativa   TEXT,          -- o payoff operacional
  justificado_por TEXT,
  justificado_em  TIMESTAMPTZ,
  ignorada        BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (veiculo_id, inicio)
);
CREATE INDEX IF NOT EXISTS idx_frota_paradas_atipicas
  ON frota_paradas(data DESC, duracao_min DESC) WHERE atipica AND NOT ignorada;

-- =============================================================================
-- 10) rotas_vendedor ganha as colunas de ignição (ADITIVO)
--     Único toque numa tabela existente. Assim o cron do comercial e o do Frota
--     compartilham o MESMO cálculo e a MESMA leitura de /posicoes — zero chamada
--     duplicada. A tela do supervisor ignora as colunas novas.
-- =============================================================================
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS partidas               INT;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS ja_ligado_no_inicio    BOOLEAN;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS primeira_partida       TIMESTAMPTZ;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS ultimo_desligamento    TIMESTAMPTZ;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS tempo_ligado_min       INT;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS tempo_movimento_min    INT;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS tempo_marcha_lenta_min INT;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS tempo_desligado_min    INT;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS vel_max                NUMERIC(6,1);

-- =============================================================================
-- 11) SEED / DE-PARA — unifica as 4 fontes no hub
--     Ordem importa. Tudo idempotente (ON CONFLICT).
--     ⚠️ NUNCA faz INSERT em Placas nem em SupaPlacas (o DRE e o Omie leem elas).
-- =============================================================================

-- ⚠️ Todos os passos deduplicam por placa RESOLVIDA (DISTINCT ON) antes do
-- INSERT: se a mesma placa aparece 2x na origem (ex.: tecnico_veiculos tem
-- vários técnicos no MESMO carro), o ON CONFLICT DO UPDATE estoura com
-- "cannot affect row a second time".

-- 11a) Placas (o cadastro mais rico: modelo, ano, FIPE, seguro, foto, pátio)
INSERT INTO frota_veiculos (placa, placa_exibicao, id_placa, modelo, ano, ativo,
                            combustivel, origem_cadastro, tipo_registro)
SELECT x.placa, x."NumPlaca", x."IdPlaca", x.modelo, x.ano,
       COALESCE(x.ativo, TRUE), x.combustivel, 'placas', 'veiculo'
FROM (
  SELECT DISTINCT ON (frota_resolver_placa(frota_placa_de_numplaca(p."NumPlaca")))
         frota_resolver_placa(frota_placa_de_numplaca(p."NumPlaca")) AS placa,
         p."NumPlaca", p."IdPlaca", p.modelo, p.ano, p.ativo, p.combustivel
  FROM "Placas" p
  WHERE frota_placa_de_numplaca(p."NumPlaca") <> ''
  ORDER BY frota_resolver_placa(frota_placa_de_numplaca(p."NumPlaca")), p."IdPlaca"
) x
ON CONFLICT (placa) DO UPDATE
  SET id_placa    = COALESCE(frota_veiculos.id_placa, EXCLUDED.id_placa),
      modelo      = COALESCE(frota_veiculos.modelo, EXCLUDED.modelo),
      ano         = COALESCE(frota_veiculos.ano, EXCLUDED.ano),
      combustivel = COALESCE(frota_veiculos.combustivel, EXCLUDED.combustivel);

-- 11b) SupaPlacas -> ponteiro + projeto Omie (que agora se edita no Frota)
UPDATE frota_veiculos f
   SET supa_placa_id          = s."IdPlaca",
       id_projeto_omie        = COALESCE(f.id_projeto_omie, s.id_projeto_omie),
       id_projeto_omie_castro = COALESCE(f.id_projeto_omie_castro, s.id_projeto_omie_castro)
  FROM "SupaPlacas" s
 WHERE f.supa_placa_id IS NULL
   AND f.placa = frota_resolver_placa(frota_placa_de_numplaca(s."NumPlaca"));

-- Placas que só existem na SupaPlacas
INSERT INTO frota_veiculos (placa, placa_exibicao, supa_placa_id, id_projeto_omie,
                            id_projeto_omie_castro, origem_cadastro)
SELECT x.placa, x."NumPlaca", x."IdPlaca", x.id_projeto_omie, x.id_projeto_omie_castro, 'placas'
FROM (
  SELECT DISTINCT ON (frota_resolver_placa(frota_placa_de_numplaca(s."NumPlaca")))
         frota_resolver_placa(frota_placa_de_numplaca(s."NumPlaca")) AS placa,
         s."NumPlaca", s."IdPlaca", s.id_projeto_omie, s.id_projeto_omie_castro
  FROM "SupaPlacas" s
  WHERE frota_placa_de_numplaca(s."NumPlaca") <> ''
  ORDER BY frota_resolver_placa(frota_placa_de_numplaca(s."NumPlaca")), s."IdPlaca"
) x
ON CONFLICT (placa) DO UPDATE
  SET supa_placa_id = COALESCE(frota_veiculos.supa_placa_id, EXCLUDED.supa_placa_id);

-- 11c) comercial_veiculos -> adesao_id (rastreador) + categoria + responsável
INSERT INTO frota_veiculos (placa, adesao_id, descricao, comercial_id, categoria,
                            ativo, origem_cadastro)
SELECT x.placa, x.adesao_id, x.descricao, x.id,
       COALESCE(NULLIF(x.categoria, ''), 'comercial'), COALESCE(x.ativo, TRUE), 'manual'
FROM (
  SELECT DISTINCT ON (frota_resolver_placa(c.placa))
         frota_resolver_placa(c.placa) AS placa,
         c.adesao_id, c.descricao, c.id, c.categoria, c.ativo
  FROM comercial_veiculos c
  WHERE frota_resolver_placa(c.placa) <> ''
  ORDER BY frota_resolver_placa(c.placa), c.created_at
) x
ON CONFLICT (placa) DO UPDATE
  SET adesao_id    = COALESCE(frota_veiculos.adesao_id, EXCLUDED.adesao_id),
      comercial_id = COALESCE(frota_veiculos.comercial_id, EXCLUDED.comercial_id),
      descricao    = COALESCE(frota_veiculos.descricao, EXCLUDED.descricao),
      categoria    = CASE WHEN frota_veiculos.categoria = 'outros'
                          THEN EXCLUDED.categoria ELSE frota_veiculos.categoria END;

-- 11d) tecnico_veiculos -> adesao_id (oficina)
-- Aqui a deduplicação é OBRIGATÓRIA: vários técnicos dividem o MESMO carro
-- (TKY6E68 tem 3, TKC5D99 tem 2) — foi o que estourou o seed na 1ª tentativa.
INSERT INTO frota_veiculos (placa, adesao_id, descricao, categoria, origem_cadastro)
SELECT x.placa, x.adesao_id, x.descricao, 'oficina', 'manual'
FROM (
  SELECT DISTINCT ON (frota_resolver_placa(t.placa))
         frota_resolver_placa(t.placa) AS placa,
         t.adesao_id, t.descricao
  FROM tecnico_veiculos t
  WHERE frota_resolver_placa(t.placa) <> ''
  ORDER BY frota_resolver_placa(t.placa), t.adesao_id NULLS LAST
) x
ON CONFLICT (placa) DO UPDATE
  SET adesao_id = COALESCE(frota_veiculos.adesao_id, EXCLUDED.adesao_id),
      descricao = COALESCE(frota_veiculos.descricao, EXCLUDED.descricao);

-- 11e) placas que SÓ aparecem no abastecimento (não têm cadastro nenhum).
-- DISTINCT ON por placa (não DISTINCT na linha inteira): a mesma placa aparece
-- com modelos escritos de formas diferentes ao longo dos CSVs.
INSERT INTO frota_veiculos (placa, modelo, ativo, origem_cadastro, pendencia_vinculo, tipo_registro)
SELECT x.placa, x.modelo_veiculo, TRUE, 'abastecimento', TRUE,
       CASE WHEN x.placa IN ('CLI0002','TRA0001','0000000') THEN 'avulso' ELSE 'veiculo' END
FROM (
  SELECT DISTINCT ON (frota_resolver_placa(a.placa))
         frota_resolver_placa(a.placa) AS placa,
         a.modelo_veiculo
  FROM abastecimentos a
  WHERE frota_resolver_placa(a.placa) <> ''
  ORDER BY frota_resolver_placa(a.placa), a.data_transacao DESC   -- modelo mais recente
) x
ON CONFLICT (placa) DO NOTHING;

-- 11f) os baldes de abastecimento avulso (NÃO são veículos)
UPDATE frota_veiculos SET
  tipo_registro = 'avulso',
  ativo = FALSE,
  pendencia_vinculo = FALSE,
  descricao = CASE placa
    WHEN 'CLI0002' THEN 'Abastecimento — Clientes'
    WHEN 'TRA0001' THEN 'Abastecimento — Tratores'
    WHEN '0000000' THEN 'Abastecimento — Quadriciclos'
    ELSE descricao END
WHERE placa IN ('CLI0002', 'TRA0001', '0000000');

-- 11g) placa de exibição, para quem não veio de uma tabela com NumPlaca
UPDATE frota_veiculos
   SET placa_exibicao = CASE WHEN length(placa) = 7
                             THEN substr(placa, 1, 3) || '-' || substr(placa, 4)
                             ELSE placa END
 WHERE placa_exibicao IS NULL;

-- 11h) apelidos: as grafias erradas apontam para o veículo certo
INSERT INTO frota_veiculos_alias (placa_alias, veiculo_id, fonte, motivo)
SELECT x.alias, f.id, x.fonte, x.motivo
FROM (VALUES
  ('EVG1467',  'EVG1E67', 'abastecimento', 'Digitação no CSV do cartão-frota (Caminhão Munck)'),
  ('SEV9I75',  'SEB9I75', 'placas',        'Digitação na tabela Placas (V no lugar de B)'),
  ('TKBB8I49', 'TKB8I49', 'placas',        'Digitação na tabela Placas (8 caracteres; placa tem 7)')
) AS x(alias, canonica, fonte, motivo)
JOIN frota_veiculos f ON f.placa = x.canonica
ON CONFLICT (placa_alias) DO NOTHING;

-- =============================================================================
-- 12) VIEWS — o "manda-chuva" de fato
-- =============================================================================

-- Manutenções: espelho da Rota Exata + registro manual ∪ Requisições Veiculares.
-- A Requisicao entra por VIEW (sempre fresca), não por cópia (que daria drift).
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
         -- valor_despeza é TEXTO em formato BR ("1.304,60" / "80,00"). O CASE é
         -- obrigatório: um único valor não-numérico faria a VIEW INTEIRA
         -- estourar em runtime, não só a linha.
         CASE WHEN replace(replace(coalesce(r.valor_despeza, ''), '.', ''), ',', '.')
                   ~ '^[0-9]+(\.[0-9]+)?$'
              THEN replace(replace(r.valor_despeza, '.', ''), ',', '.')::numeric
         END,
         r.data::date,
         -- hodometro é TEXTO e pode vir "Não Informado"
         CASE WHEN replace(coalesce(r.hodometro, ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN replace(r.hodometro, ',', '.')::numeric
         END
    FROM "Requisicao" r
    JOIN frota_veiculos f ON f.supa_placa_id::text = r.veiculo::text
   WHERE r.tipo = 'Veicular Manutenção';

-- USO DIÁRIO — quem estava COM o carro em cada dia (≠ responsável fixo).
-- Duas fontes locais (por isso VIEW, não cópia):
--   - checkin_vendedor: vendedor marca o carro do dia (supervisor-vendas)
--   - tecnico_caminhos: técnico marca o carro ao sair (app dos mecânicos —
--     o schema já existe; a tela no NT_Mecanicos que grava aqui está no plano)
-- Pra atribuir multa/parada de um DIA, esta view vence o responsável fixo
-- (frota_responsaveis); o fixo é o fallback quando ninguém marcou o dia.
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
   WHERE t.placa IS NOT NULL;

-- Custo total por veículo — "quanto custa esse carro?".
-- ⚠️ ANTI-DUPLICIDADE (verificado contra a API em 14/07/2026 — os /custos do RE
-- têm integracao "veloe_abastecimento", o MESMO cartão do CSV):
--   Combustível  -> só `abastecimentos` (CSV, cobre os 30 carros; RE só os 16)
--   Multas       -> só `frota_multas` (10 > os 5 lançados em /custos)
--   Manutenção   -> /custos do RE (39 lançamentos) + registros MANUAIS do portal
--                   (frota_manutencoes origem='rotaexata' fica FORA: quando a
--                   manutenção do RE tem custo real, ela já aparece em /custos)
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

-- =============================================================================
-- 13) RLS — padrão "P1": leitura só autenticado; escrita SÓ via /api (service role)
-- =============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'frota_veiculos','frota_veiculos_alias','frota_motoristas','frota_responsaveis',
    'frota_geocercas','frota_multas','frota_manutencoes','frota_custos',
    'frota_odometro','frota_documentos','frota_dias','frota_paradas'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true);', t || '_select', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT ON %I TO authenticated;', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- CONFERÊNCIA (rode depois; números validados contra os dados reais em 14/07)
-- =============================================================================
-- SELECT tipo_registro, count(*) FROM frota_veiculos GROUP BY 1;
--   -> veiculo 31, avulso 3 (total 34)
-- SELECT count(*) FROM frota_veiculos WHERE adesao_id IS NOT NULL;
--   -> 14 após o seed (vêm de comercial_veiculos + tecnico_veiculos).
--      Os 16 completos (ATJ6211 e FXM4G90 incluídos) só depois do sync da
--      Rota Exata (Fase 2), que casa /adesoes por placa.
-- SELECT count(*) FROM frota_veiculos WHERE id_placa IS NOT NULL;       -- 22
-- SELECT count(*) FROM frota_veiculos WHERE supa_placa_id IS NOT NULL;  -- 23
-- SELECT count(*) FROM frota_veiculos WHERE pendencia_vinculo;          -- os sem cadastro
-- SELECT placa, placa_exibicao, modelo, adesao_id, id_placa, supa_placa_id
--   FROM frota_veiculos ORDER BY placa;
-- SELECT * FROM frota_veiculos_alias;                                   -- 3 apelidos
-- -- Os 3 carros-fantasma NÃO podem mais existir como veículo separado:
-- SELECT placa FROM frota_veiculos WHERE placa IN ('EVG1467','SEV9I75','TKBB8I49');  -- 0 linhas
