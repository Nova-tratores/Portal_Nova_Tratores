-- Garantias — cancelar por DUPLICAÇÃO (01/10/2026)
-- Caso real: GAR-0068 (OS-0652) duplicada da GAR-0070 (OS-0742). Decisão do
-- usuário: cancelamento SÓ existe por duplicação — sempre aponta a garantia
-- original (gravada em duplicada_de + snapshot do número pra exibir sem join).
--
-- Recria o CHECK de status com 'cancelada' (mesmo padrão do
-- add-garantia-duas-etapas.sql — próxima migration que mexer em status
-- precisa manter 'cancelada' na lista).

alter table public.garantias drop constraint if exists garantias_status_check;
alter table public.garantias add constraint garantias_status_check check (status in (
  'aberta','em_analise','bo_tecnico','enviada','info_pendente',
  'aguardando_servico','ressarcimento_fabrica','aprovada','rejeitada','cancelada'
));

alter table public.garantias add column if not exists duplicada_de uuid references public.garantias(id);
alter table public.garantias add column if not exists duplicada_de_numero text;
alter table public.garantias add column if not exists cancelada_em timestamptz;

comment on column public.garantias.duplicada_de is
  'Garantia ORIGINAL da qual esta é duplicata (único motivo de cancelamento).';

notify pgrst, 'reload schema';
