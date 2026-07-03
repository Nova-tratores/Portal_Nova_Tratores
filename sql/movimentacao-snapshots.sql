-- Snapshots compartilháveis da tela Movimentação de Produto (/ajustes/movimentacao-produto).
-- O botão "Compartilhar" grava o payload da consulta com um hash não-adivinhável;
-- quem abre o link (?s=<hash>) lê esta linha em vez de repetir a consulta ao Omie.
-- Acesso SEMPRE via API route autenticada (exigirPermissao) — tabela sem RLS,
-- como as demais do módulo ajustes. Expira em 30 dias (limpeza lazy na criação).
CREATE TABLE IF NOT EXISTS movimentacao_snapshots (
  hash TEXT PRIMARY KEY,
  conta_omie TEXT NOT NULL,
  id_prod BIGINT NOT NULL,
  payload JSONB NOT NULL,
  criado_por TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX IF NOT EXISTS idx_mov_snapshots_expira ON movimentacao_snapshots (expira_em);
