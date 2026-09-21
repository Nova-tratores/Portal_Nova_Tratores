-- Vários SERVIÇOS por orçamento (21/09/2026)
-- Cada linha do array é um serviço nomeado ("Troca de embreagem") com a
-- própria mão de obra e o próprio deslocamento, cada parte com liga/desliga
-- e a opção de, desligada, ainda aparecer no PDF como "não cobrado".
--
-- Formato de cada linha (lib pura src/lib/orcamentos/servicos.ts):
--   { descricao, maoObra, mostrarMO, valorHora, horas,
--     desloc, mostrarDesloc, valorKm, km }
--
-- As colunas antigas mao_obra/deslocamento CONTINUAM gravadas como AGREGADO
-- (soma das linhas ativas) — consumidores legados (gerar OS, importar pra OS,
-- chips do drawer) seguem funcionando sem mudança.
--
-- O editor tem retry sem a coluna: se esta migration ainda não tiver sido
-- aplicada, o salvar funciona no formato antigo (agregado) sem quebrar.

alter table public.orcamentos add column if not exists servicos jsonb;

comment on column public.orcamentos.servicos is
  'Array de serviços nomeados (mão de obra + deslocamento por serviço). Agregados legados continuam em mao_obra/deslocamento.';

notify pgrst, 'reload schema';
