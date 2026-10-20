-- % de comissão por OS (José, 20/10/2026: "em cada OS do POS, os usuários do pós-vendas têm que conseguir alterar a
-- porcentagem da comissão referente àquele serviço, e se for menor ou maior informar o porquê").
-- Vale para todos os técnicos da OS no lugar da % de cada um; a comissão do mês (ficha do técnico) passa a usar
-- ela. Cada mudança fica no log. Pode rodar de novo sem problema.

CREATE TABLE IF NOT EXISTS public.posvendas_comissao_os (
  id_ordem        text PRIMARY KEY,                       -- Ordem_Servico.Id_Ordem
  pct             numeric(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100),
  motivo          text NOT NULL,
  alterado_por    text,
  alterado_por_id uuid,
  alterado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.posvendas_comissao_os_log (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_ordem  text NOT NULL,
  pct_de    numeric(5,2),          -- null = estava na % de cada técnico
  pct_para  numeric(5,2),          -- null = voltou para a % de cada técnico
  motivo    text,
  autor     text,
  autor_id  uuid,
  em        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posvendas_comissao_os_log_os ON public.posvendas_comissao_os_log (id_ordem, em DESC);

ALTER TABLE public.posvendas_comissao_os ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posvendas_comissao_os_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.posvendas_comissao_os FROM anon, authenticated;
REVOKE ALL ON public.posvendas_comissao_os_log FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
