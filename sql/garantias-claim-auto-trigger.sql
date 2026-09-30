-- Garantias — claim nasce no BANCO (30/09/2026)
--
-- O app dos técnicos (NT_Mecanicos) cria a solicitação de garantia no envio
-- do relatório, mas vem falhando em silêncio (casos reais: OS-0633, OS-0777,
-- OS-0796 — o garantista teve que criar manual). A varredura por GitHub
-- Actions não segura sozinha: o cron do GitHub é "melhor esforço" e o
-- workflow de hora em hora dispara só 2-3x por dia na prática.
--
-- Este gatilho cria o claim NA MESMA TRANSAÇÃO em que o relatório marcado
-- garantia é gravado em Ordem_Servico_Tecnicos — sem app, sem cron, sem
-- rede; o envio offline do app também cobre (a fila drena num INSERT igual).
--
--  - Idempotente: OS que já tem claim (ativo OU finalizado) é pulada —
--    recriar um aprovado/rejeitado seria reabrir decisão do garantista.
--  - À prova de falha: QUALQUER erro aqui vira WARNING — a gravação do
--    relatório do técnico NUNCA é bloqueada pelo gatilho.
--  - O criarGarantia do app e a varredura continuam como estão (os dois já
--    são idempotentes; viram redundância inofensiva).
--  - Peças: como na varredura, entram depois pelo auto-sync do drawer.

create or replace function public.nt_garantia_claim_auto()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_os      text := new."Ordem_Servico";
  v_horas   numeric := 0;
  v_km      numeric := 0;
  v_txt     text;
  v_cliente text; v_projeto text; v_ppv text; v_status_os text;
  v_gar_id  uuid; v_gar_num text;
begin
  begin
    if v_os is null or btrim(v_os) = '' then return new; end if;
    if lower(coalesce(new."Status", '')) <> 'enviado' then return new; end if;
    if not (coalesce(new."Garantia", false)
            or coalesce(new."TipoServico", '') ilike '%garantia%') then
      return new;
    end if;
    if exists (select 1 from public.garantias g where g.id_ordem = v_os) then
      return new;
    end if;

    select o."Os_Cliente", o."Projeto", o."ID_PPV", o."Status"
      into v_cliente, v_projeto, v_ppv, v_status_os
      from public."Ordem_Servico" o where o."Id_Ordem" = v_os limit 1;
    if coalesce(v_status_os, '') ilike '%cancelada%' then return new; end if;

    -- horas/km podem vir como TEXTO ("1h30m") — extrai; não deu, fica 0
    v_txt := btrim(coalesce(new."TotalHora"::text, ''));
    if v_txt ~ '^\d+([.,]\d+)?$' then
      v_horas := replace(v_txt, ',', '.')::numeric;
    elsif v_txt ~* '\d+\s*h' then
      v_horas := coalesce(substring(v_txt from '(\d+)\s*[hH]')::numeric, 0)
               + coalesce(substring(v_txt from '(\d+)\s*[mM]')::numeric, 0) / 60.0;
    end if;
    v_txt := btrim(coalesce(new."TotalKm"::text, ''));
    if v_txt ~ '^\d+([.,]\d+)?$' then
      v_km := replace(v_txt, ',', '.')::numeric;
    end if;

    insert into public.garantias
      (id_ordem, tecnico_nome, cliente, modelo, chassis, ppv_ids,
       tecnico_horas, tecnico_km, tecnico_obs, status)
    values
      (v_os,
       coalesce(nullif(btrim(coalesce(new."TecResp1", '')), ''), 'Técnico'),
       v_cliente, v_projeto,
       nullif(btrim(coalesce(new."Chassis", '')), ''),
       nullif(btrim(coalesce(v_ppv, '')), ''),
       v_horas, v_km,
       'Claim criado automaticamente pelo gatilho do banco (relatório marcado garantia).',
       'aberta')
    returning id, numero into v_gar_id, v_gar_num;

    -- timeline + aviso pros admins (best-effort: falha aqui não desfaz o claim)
    begin
      insert into public.garantia_eventos (garantia_id, tipo, status_novo, ator, detalhe)
      values (v_gar_id, 'criada', 'aberta', 'sistema (gatilho do banco)',
              'Garantia ' || coalesce(v_gar_num, '') || ' criada na hora em que o relatório da '
              || v_os || ' chegou marcado garantia.');
      insert into public.portal_notificacoes (user_id, tipo, titulo, descricao, link)
      select p.user_id, 'garantia',
             'Nova requisição de garantia — ' || coalesce(v_gar_num, v_os),
             v_os || ' · ' || coalesce(v_cliente, ''), '/garantias'
        from public.portal_permissoes p
       where p.is_admin = true
         and coalesce(p.notif_silenciado::text, '') not ilike '%garantia%';
    exception when others then
      raise warning 'nt_garantia_claim_auto (evento/notif): %', sqlerrm;
    end;
  exception when others then
    raise warning 'nt_garantia_claim_auto: %', sqlerrm;
  end;
  return new;
end;
$fn$;

drop trigger if exists tg_garantia_claim_auto on public."Ordem_Servico_Tecnicos";
create trigger tg_garantia_claim_auto
after insert or update of "Status", "Garantia", "TipoServico"
on public."Ordem_Servico_Tecnicos"
for each row
execute function public.nt_garantia_claim_auto();
