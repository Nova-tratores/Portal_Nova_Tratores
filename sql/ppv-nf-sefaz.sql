-- PPV — aba "Comunicação com a SEFAZ"
-- Cacheia os dados da NF-e do pedido faturado (número, série, chave de acesso,
-- emissão, cancelamento, ambiente, id interno p/ DANFE e a linha do tempo de
-- eventos que montamos a partir da NF). Assim a aba lê do banco (rápido) em vez
-- de bater no Omie toda vez que abre. Recarrega sob demanda (botão "Atualizar").
alter table public.pedidos
  add column if not exists nf_sefaz jsonb;

comment on column public.pedidos.nf_sefaz is
  'Cache da NF-e do pedido faturado (Omie ListarNF): { numero, serie, modelo, chave, nCodNF, nIdPedido, ambiente, emitidaEm, canceladaEm, denegada, eventos:[{data,hora,descricao,usuario,ok}], atualizadoEm }. Preenchido no faturamento e no refresh da aba Comunicação com a SEFAZ.';
