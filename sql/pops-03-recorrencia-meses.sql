-- =============================================================================
-- POPs — recorrência "a cada N meses" (bimestral, trimestral, semestral, anual)
-- Caso de origem: limpeza da caixa d'água, a cada 6 meses.
--
-- pops_agendamentos ganha intervalo_meses (padrão 1 = todo mês, como era).
-- Só vale para recorrencia = 'mensal'. Os meses contam a partir do mês de
-- inicio_em: semestral com início em 15/11/2026 vence em 15/05/2027, 15/11/2027…
-- O cálculo do dia fica no portal (src/lib/pops/regras.ts → venceEm).
--
-- Sem esta migration o portal funciona igual; só recusa criar rotina com
-- intervalo maior que 1 mês. Idempotente.
-- =============================================================================

ALTER TABLE public.pops_agendamentos
  ADD COLUMN IF NOT EXISTS intervalo_meses smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pops_agendamentos_intervalo_meses_check') THEN
    ALTER TABLE public.pops_agendamentos
      ADD CONSTRAINT pops_agendamentos_intervalo_meses_check
      CHECK (intervalo_meses BETWEEN 1 AND 24 AND (intervalo_meses = 1 OR recorrencia = 'mensal'));
  END IF;
END $$;

COMMENT ON COLUMN public.pops_agendamentos.intervalo_meses IS
  'Só para recorrencia=mensal: repete a cada N meses contando do mês de inicio_em (1 = todo mês).';

NOTIFY pgrst, 'reload schema';

-- Rollback:
-- ALTER TABLE public.pops_agendamentos DROP CONSTRAINT IF EXISTS pops_agendamentos_intervalo_meses_check;
-- ALTER TABLE public.pops_agendamentos DROP COLUMN IF EXISTS intervalo_meses;
