-- Card Serviços: sub-split do "Interno" (OS sem NFS-e) em DOIS baldes, espelhando
-- a régua do dashboard OMIE (classificação por InformacoesAdicionais.cNumContrato):
--
--   valor_interno_retorno = garantia de fábrica (-pgo, cheio) + revisão (cheio) +
--                           serviço normal sem nota (cheio) + entrega técnica/montagem
--                           pela COMISSÃO FIXA (R$150/250/400/500, como no OMIE)
--                           →  contribuição de RECEITA do bucket "com retorno".
--   valor_interno_puro    = cortesia comercial + contrato interno/oficina (cheio)
--                           →  interno "de verdade" (não retorna).
--
-- OBS: como a entrega entra pelo valor fixo, NÃO vale mais
-- valor_interno = retorno + puro (a diferença entrega-cheia − comissão fica de fora
-- da receita, espelhando o "Total Entradas" do OMIE).
-- Linhas antigas ficam com NULL nas colunas novas — é o sinal para o refresh em
-- background recalcular o mês (obterTotaisOS dispara quando valor_interno_retorno
-- vier NULL). Aplicar no SQL Editor do Supabase.
alter table os_mensal add column if not exists valor_interno_retorno numeric;
alter table os_mensal add column if not exists valor_interno_puro numeric;

-- Popup "vendas" do card: guardar o contrato (InformacoesAdicionais.cNumContrato)
-- por item, pra classificar o badge de cada OS em "c/ retorno" × "puro" na hora do
-- clique (sem tocar a Omie). Preenchido no próximo sincronizarServicosItens do mês.
alter table os_servicos_itens add column if not exists contrato text;
