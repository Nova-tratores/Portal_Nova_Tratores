-- ============================================================================
-- Cache PERSISTENTE dos "Recebimentos de NF-e pendentes" (tela /ajustes/recebimentos)
--
-- PROBLEMA: essa tela consulta a Omie AO VIVO (ListarRecebimentos + PosicaoEstoque
-- por produto de garantia, com throttle sequencial) e só tinha cache EM MEMÓRIA
-- (lib/ajustes/cache.ts), que ZERA a cada redeploy do Railway. Resultado: a
-- primeira carga depois de cada deploy levava 1-2 min.
--
-- SOLUÇÃO: esta tabela guarda o PAYLOAD já computado (lista de pendentes +
-- projeção de impacto no CMC) por conta + janela de emissão. A tela lê daqui
-- (instantâneo, sobrevive a redeploy); o cron de prewarm
-- (.github/workflows/ajustes-prewarm-recebimentos.yml) regrava com force=1.
-- O botão "Atualizar" da tela força recomputar ao vivo e reescreve o snapshot.
--
-- conta_omie é MINÚSCULO ('nova'/'castro') para casar com recebimento_meta.
-- janela_de/janela_ate são as datas de emissão em texto BR (DD/MM/AAAA), iguais
-- à chave de cache usada em obterRecebimentosPendentes ("pendentes:conta:de:ate").
--
-- Executar 1x no SQL Editor do Supabase. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS recebimento_pendentes_cache (
  id          BIGSERIAL PRIMARY KEY,
  conta_omie  TEXT NOT NULL,                       -- minusculo: nova/castro
  janela_de   TEXT NOT NULL,                       -- data emissao "de"  (DD/MM/AAAA)
  janela_ate  TEXT NOT NULL,                       -- data emissao "ate" (DD/MM/AAAA)
  payload     JSONB NOT NULL,                      -- resultado de analisarRecebimentosPendentes
  duracao_ms  INTEGER,                             -- quanto levou a computar (telemetria)
  gerado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recebimento_pendentes_cache_key UNIQUE (conta_omie, janela_de, janela_ate)
);

CREATE INDEX IF NOT EXISTS idx_receb_pend_cache_conta
  ON recebimento_pendentes_cache(conta_omie);
