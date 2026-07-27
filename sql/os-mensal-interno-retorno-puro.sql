-- Card Serviços: sub-split do "Interno" (OS sem NFS-e) em DOIS baldes, espelhando
-- a régua do dashboard OMIE (classificação por InformacoesAdicionais.cNumContrato):
--
--   valor_interno_retorno = garantia de fábrica (-pgo) + entrega/montagem + revisão
--                           + serviço normal fechado sem nota  →  trabalho que RENDEU
--                           (fábrica ressarce / comissão / receita).
--   valor_interno_puro    = cortesia comercial + contrato interno/oficina
--                           →  interno "de verdade" (não retorna).
--
-- Invariante: valor_interno = valor_interno_retorno + valor_interno_puro.
-- Linhas antigas ficam com NULL nas colunas novas — é o sinal para o refresh em
-- background recalcular o mês (obterTotaisOS dispara quando valor_interno_retorno
-- vier NULL). Aplicar no SQL Editor do Supabase.
alter table os_mensal add column if not exists valor_interno_retorno numeric;
alter table os_mensal add column if not exists valor_interno_puro numeric;

-- Popup "vendas" do card: guardar o contrato (InformacoesAdicionais.cNumContrato)
-- por item, pra classificar o badge de cada OS em "c/ retorno" × "puro" na hora do
-- clique (sem tocar a Omie). Preenchido no próximo sincronizarServicosItens do mês.
alter table os_servicos_itens add column if not exists contrato text;
