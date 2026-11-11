-- Técnico automático (José, 11/11/2026)
-- Projeto do PORTAL: citrhumdkfivdzbmayde
-- Usuário salvo na Administração com função "Técnico" entra sozinho em Tecnicos_Appsheet
-- (a lista de técnicos do POS, PPV, Orçamentos e do app do mecânico).
-- Casa pelo e-mail: quem já está na tabela não é duplicado. Nome em MAIÚSCULO e sem acento,
-- no mesmo padrão dos que já existem. "Técnico (TESTE)" fica de fora.

create or replace function public.tecnico_automatico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.funcao is null
     or lower(new.funcao) not like 't_cnico%'
     or lower(new.funcao) like '%teste%'
     or coalesce(trim(new.email), '') = '' then
    return new;
  end if;

  if not exists (
    select 1 from "Tecnicos_Appsheet"
    where lower(trim(both E' \r\n' from "UsuEmail")) = lower(trim(new.email))
  ) then
    insert into "Tecnicos_Appsheet" ("IdUsuario", "UsuNome", "UsuEmail")
    values (
      substr(md5(random()::text || clock_timestamp()::text), 1, 8),
      upper(translate(trim(new.nome), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
      lower(trim(new.email))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tecnico_automatico on public.financeiro_usu;
create trigger trg_tecnico_automatico
after insert or update of funcao, email, nome on public.financeiro_usu
for each row execute function public.tecnico_automatico();

-- Quem JÁ é técnico no portal e ainda não está na tabela entra agora
update public.financeiro_usu set funcao = funcao
where lower(funcao) like 't_cnico%' and lower(funcao) not like '%teste%';

-- Conferir
select "UsuNome", "UsuEmail" from "Tecnicos_Appsheet" order by "UsuNome";
