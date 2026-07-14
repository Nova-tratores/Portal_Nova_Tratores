-- =============================================================================
-- rotas_vendedor: coluna `visitas` (JSONB) — BUG DESCOBERTO EM 14/07/2026
--
-- O computarESalvarRota sempre tentou salvar o campo `visitas` (o cruzamento
-- rota × visitas comerciais do dia), mas a coluna NUNCA existiu na tabela.
-- Resultado: o upsert inteiro morria com PGRST204 e — como o erro não era
-- checado — o cache de rotas ficou VAZIO desde sempre. Todo dia consultado
-- refazia a busca completa na API da Rota Exata (lento e caro), o histórico
-- do mapa ("Sem histórico salvo") nunca aparecia e o fallback de localização
-- do Frota não tinha de onde ler.
--
-- O código agora tolera a coluna faltando (regrava sem `visitas` e loga), mas
-- SEM esta migração os pins de visita não aparecem nos dias em cache.
--
-- Rodar no SQL Editor do Supabase (idempotente).
-- =============================================================================

ALTER TABLE rotas_vendedor
  ADD COLUMN IF NOT EXISTS visitas JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN rotas_vendedor.visitas IS
  'Visitas comerciais do dia a ≤2km de alguma parada (cruzamento feito no computarESalvarRota).';
