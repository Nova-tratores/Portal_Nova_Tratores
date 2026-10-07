-- ============================================================================
-- Central de Trabalho — BLOCOS (07/10/2026)
-- Os quadros viraram "blocos" pessoais (compartilháveis) de quem RECEBE o
-- ticket. Quem recebe escolhe o bloco e se o ticket fica privado.
--
-- Regra de quem VÊ o ticket (espelha podeVerTicket em src/lib/tickets/server.ts):
--  - envolvidos (quem pediu, quem faz, participante) e admin/dev: sempre;
--  - fora de bloco: 'publico' = todos (como antes);
--  - em bloco: só se o ticket for 'publico' (= compartilhado com o bloco)
--    E a pessoa enxergar o bloco. Ticket PRIVADO num bloco fica só com os
--    envolvidos (antes, o bloco liberava qualquer ticket dele).
--
-- O app já aplica a regra no servidor sem esta migration; ela fecha a mesma
-- porta na leitura direta pelo navegador (RLS). Idempotente.
-- Rodar no SQL Editor do Supabase.
-- ============================================================================
create or replace function public.tickets_pode_ver(p_ticket uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from tickets t
    where t.id = p_ticket
      and (
        t.solicitante_id = auth.uid()
        or t.responsavel_id = auth.uid()
        or exists (
          select 1 from tickets_participantes p
          where p.ticket_id = t.id and p.user_id = auth.uid() and p.removido_em is null
        )
        or exists (
          select 1 from portal_permissoes pp
          where pp.user_id = auth.uid() and (pp.is_admin is true or pp.is_dev is true)
        )
        or (t.quadro_id is null and t.visibilidade = 'publico')
        or (t.quadro_id is not null and t.visibilidade = 'publico' and tickets_quadro_pode_ver(t.quadro_id))
      )
  );
$$;
