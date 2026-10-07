-- ════════════════════════════════════════════════════════════════════
-- Peças Não Identificadas — 7a: novos destinos finais da peça
--
-- Rodar SOZINHO e ANTES do pni-07b: o Postgres não deixa usar um valor novo
-- de enum na mesma transação em que ele foi criado.
--   guardado      → a peça foi guardada (entrou no estoque)
--   usado         → a peça foi usada (OS, serviço, oficina)
--   outro_destino → outra coisa aconteceu (descrever)
-- ════════════════════════════════════════════════════════════════════
alter type public.pni_status add value if not exists 'guardado';
alter type public.pni_status add value if not exists 'usado';
alter type public.pni_status add value if not exists 'outro_destino';
