-- =============================================================================
-- POPs — (1) etiquetas livres e (2) execução disparada pela OS do POS
--
-- (1) pops.etiquetas text[]: quem cuida do POP digita à vontade ("limpeza",
--     "segurança"…); a lista /pops filtra por elas. Gravadas em minúsculas,
--     sem repetição (a rota normaliza).
--
-- (2) pops_gatilhos_os: "OS do tipo X que entrar na fase Y → cria a execução
--     deste POP para o técnico da OS", com a referência "OS <nº> · <chassi>"
--     (a aba Execuções da ficha acha pelo chassi = histórico da máquina).
--     pops_gatilhos_os_disparos: uma linha por (regra, OS) — a mesma OS nunca
--     gera duas execuções da mesma regra, mesmo que volte à fase.
--     Quem dispara: o portal (src/lib/pops/gatilhos-os.ts) quando a fase muda
--     pelo portal e o agendador a cada 10 min (pega mudanças feitas por outros
--     caminhos). Só OS que estão NA fase na hora da verificação.
--
-- RLS ligado sem policy (escrita e leitura pelas rotas /api/pops/*, service role).
-- Idempotente. Sem ela: etiquetas e gatilhos somem da tela (a rota avisa); o
-- resto do módulo segue igual.
-- =============================================================================

-- (1) Etiquetas -----------------------------------------------------------------
ALTER TABLE public.pops ADD COLUMN IF NOT EXISTS etiquetas text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS pops_etiquetas_idx ON public.pops USING gin (etiquetas);

-- (2) Gatilhos pela OS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pops_gatilhos_os (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pop_id                 uuid NOT NULL REFERENCES public.pops(id) ON DELETE CASCADE,
  tipo_servico           text NOT NULL CHECK (char_length(tipo_servico) BETWEEN 1 AND 80),  -- = Ordem_Servico.Tipo_Servico
  fase                   text NOT NULL DEFAULT 'Execução' CHECK (char_length(fase) BETWEEN 1 AND 80),  -- = Ordem_Servico.Status
  -- Quando o técnico da OS não é usuário do portal (ou a OS está sem técnico).
  responsavel_padrao_id  uuid NOT NULL REFERENCES auth.users(id),
  ativo                  boolean NOT NULL DEFAULT true,
  criado_por             uuid REFERENCES auth.users(id),
  criado_em              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pop_id, tipo_servico, fase)
);
CREATE INDEX IF NOT EXISTS pops_gatilhos_os_ativos_idx ON public.pops_gatilhos_os (fase) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.pops_gatilhos_os_disparos (
  gatilho_id  uuid NOT NULL REFERENCES public.pops_gatilhos_os(id) ON DELETE CASCADE,
  os_id       text NOT NULL,                       -- Ordem_Servico.Id_Ordem
  ticket_id   uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  erro        text,                                -- por que não criou (POP sem versão publicada…)
  criado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gatilho_id, os_id)
);
CREATE INDEX IF NOT EXISTS pops_gatilhos_os_disparos_os_idx ON public.pops_gatilhos_os_disparos (os_id);

ALTER TABLE public.pops_gatilhos_os          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pops_gatilhos_os_disparos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pops_gatilhos_os, public.pops_gatilhos_os_disparos FROM anon, authenticated;

-- Agendador do portal (tela /agendamentos): verificação a cada 10 min.
-- Sem a tabela `agendamentos` (sql/agendador.sql) o instrumentation.ts roda igual.
DO $$
BEGIN
  IF to_regclass('public.agendamentos') IS NOT NULL THEN
    INSERT INTO public.agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, prioridade, usa_omie, duracao_max_min, ativo)
    VALUES ('pops-gatilhos-os', 'pops-gatilhos-os', 'POPs disparados pela OS', 'POPs',
            'OS que entrou na fase configurada no POP ganha a execução do POP para o técnico.',
            'intervalo', 10, 'rapido', false, 5, true)
    ON CONFLICT (chave) DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência:
-- SELECT g.tipo_servico, g.fase, p.codigo, count(d.*) AS disparos
--   FROM pops_gatilhos_os g JOIN pops p ON p.id = g.pop_id
--   LEFT JOIN pops_gatilhos_os_disparos d ON d.gatilho_id = g.id GROUP BY 1,2,3;
--
-- Rollback:
-- DELETE FROM agendamentos WHERE chave = 'pops-gatilhos-os';
-- DROP TABLE IF EXISTS pops_gatilhos_os_disparos, pops_gatilhos_os;
-- DROP INDEX IF EXISTS pops_etiquetas_idx; ALTER TABLE pops DROP COLUMN IF EXISTS etiquetas;
