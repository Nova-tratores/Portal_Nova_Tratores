-- Previsão de horas da OS pelo tempário Mahindra (José, 20/10/2026: horas e km fantasmas).
-- O Tratorilson escolhe as atividades do tempário pelo relatório do técnico e compara com as horas apontadas.
-- Pode rodar de novo sem problema.

CREATE TABLE IF NOT EXISTS public.posvendas_os_previsao (
  id_ordem          text PRIMARY KEY,               -- Ordem_Servico.Id_Ordem
  texto_hash        text NOT NULL,                  -- muda quando o relatório muda (aí refaz)
  atividades        jsonb NOT NULL DEFAULT '[]'::jsonb,
  minutos_previstos integer,
  horas_relatorio   numeric(8,2),
  km_relatorio      numeric(10,1),
  situacao          text NOT NULL,                  -- muito_acima | acima | ok | rapido | sem_previsao
  diff_horas        numeric(8,2),
  alertas           jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacao        text,
  gerado_em         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posvendas_os_previsao_sit ON public.posvendas_os_previsao (situacao);

ALTER TABLE public.posvendas_os_previsao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.posvendas_os_previsao FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
