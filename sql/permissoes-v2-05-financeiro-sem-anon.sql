-- =============================================================================
-- PERMISSÕES v2 — Fase 3a, etapa 1: Financeiro fechado para quem NÃO está logado.
--
-- Até aqui a chave pública (anon, que vai no código do navegador) lia — e podia
-- gravar — as tabelas do Financeiro sem login nenhum (conferido 15/10/2026:
-- Chamado_NF, finan_pagar, finan_receber, finan_rh e mensagens_chat devolviam
-- linhas para o anon).
--
-- Quem usa estas tabelas (mapeado 15/10): só o próprio portal, pelo navegador e
-- sempre LOGADO (role authenticated). Nenhuma página pública e nenhum app
-- externo (Proposta-Comercial, Dashboard Agro, NT_Mecanicos, CRM, gestao-vendas,
-- Contas a Pagar) toca nelas.
--
-- O que muda: só o anon perde o acesso. Usuário logado continua igual (a
-- restrição por módulo é outra etapa — ela tira acesso de gente logada e por isso
-- passa pelo relatório de impacto da Fase 5). Idempotente.
-- =============================================================================

revoke all on table public."Chamado_NF"    from anon;
revoke all on table public.finan_pagar     from anon;
revoke all on table public.finan_receber   from anon;
revoke all on table public.finan_rh        from anon;
revoke all on table public."EnvioBoleto"   from anon;
revoke all on table public.mensagens_chat  from anon;

notify pgrst, 'reload schema';
