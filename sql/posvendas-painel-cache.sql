-- Centro do Pós-Vendas (José, 16/10/2026): os números do painel e do faturamento ao vivo
-- ficam gravados aqui, prontos. A tela recebe o que está gravado na hora; se estiver velho,
-- o servidor recalcula por trás e regrava (a próxima abertura já vem atualizada).
-- Só o servidor (service role) lê e grava. Sem esta tabela tudo funciona, só sem cache.
CREATE TABLE IF NOT EXISTS posvendas_painel_cache (
  chave     text PRIMARY KEY,              -- ex.: painel:semana:2026-10-12 · painel:mes:2026-10-01 · vivo
  dados     jsonb NOT NULL,
  gerado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE posvendas_painel_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON posvendas_painel_cache FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
