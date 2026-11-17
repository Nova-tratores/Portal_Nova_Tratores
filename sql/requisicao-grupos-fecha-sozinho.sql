-- Grupos de requisições: escolha ao criar se o grupo fica aberto sempre ou conclui sozinho
-- quando todas as requisições dele chegam ao financeiro (José, 16/11/2026).
-- Projeto Supabase do PORTAL. Idempotente. Sem esta coluna o portal segue como antes
-- (grupo só conclui na mão) e a escolha na tela avisa que falta o SQL.
ALTER TABLE requisicao_grupos
  ADD COLUMN IF NOT EXISTS fecha_sozinho boolean NOT NULL DEFAULT false;
