-- =============================================
-- FIX: Habilitar Realtime para tabelas de requisições
-- Sem isso, o portal não recebe notificações em tempo real
-- =============================================

-- Tabela de solicitações de requisição (app mobile → portal)
ALTER PUBLICATION supabase_realtime ADD TABLE "Supa-Solicitacao_Req";

-- Tabela de atualizações de requisição (app mobile → portal)
ALTER PUBLICATION supabase_realtime ADD TABLE "Supa-AtualizarReq";

-- Tabela principal de requisições (para detectar mudanças no kanban)
ALTER PUBLICATION supabase_realtime ADD TABLE "Requisicao";
