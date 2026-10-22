-- =============================================================================
-- PERMISSÕES v2 — Fase 3a, etapa 2: Propostas, estoque/vendas e DRE fechados para
-- quem NÃO está logado.
--
-- Conferido 21/10/2026 com a chave pública (anon), sem login: todas as tabelas e
-- views abaixo devolviam linhas. Quem as lia sem login eram os apps antigos
-- Proposta-Comercial e Contas a Pagar — o José confirmou em 21/10 que os dois NÃO
-- são mais usados.
--
-- Ficam DE FORA de propósito (ainda têm leitor anon):
--   Clientes  -> rotas do servidor do NT_Mecanicos usam a chave pública pura
--   tratores  -> Dashboard Agro externo (chave pública no código)
-- e tudo o que a /tv-painel, o bug-reporter e o mapa-geral leem.
--
-- O portal lê estas tabelas sempre LOGADO (navegador = authenticated) ou pelo
-- servidor com service role — nada muda para quem está logado. Views entram
-- junto: view roda como o dono e continuaria abrindo a tabela para o anon.
-- Idempotente.
-- =============================================================================

-- Comercial / Propostas
revoke all on table public."Formulario"        from anon;
revoke all on table public."Proposta_Fabrica"  from anon;
revoke all on table public.proposta_tags       from anon;
revoke all on table public."Configuracoes"     from anon;
revoke all on table public."Equipamentos"      from anon;
revoke all on table public.cad_trator          from anon;
revoke all on table public.cad_autopropelido   from anon;
revoke all on table public."Cliente_Manual"    from anon;
revoke all on table public.motivo_perda        from anon;
revoke all on table public.vendedores          from anon;
revoke all on table public.v_formulario        from anon;
revoke all on table public.v_forecast          from anon;
revoke all on table public.v_proposta_fabrica  from anon;

-- Estoque / vendas / financeiro (espelhos da Omie)
revoke all on table public.contas_receber      from anon;
revoke all on table public.notas_entrada       from anon;
revoke all on table public.produtos            from anon;
revoke all on table public.vendas_itens        from anon;
revoke all on table public."Placas"            from anon;
revoke all on table public."Produtos_Completos" from anon;
revoke all on table public.produto_tipo        from anon;
revoke all on table public.recebimentos_nfe    from anon;

notify pgrst, 'reload schema';

-- ROLLBACK (se algum leitor esquecido aparecer):
--   grant select on table public.<tabela> to anon;
