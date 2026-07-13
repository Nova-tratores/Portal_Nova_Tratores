-- Popup "vendas" do card Serviços: itens de serviço das OS faturadas, cacheados
-- por mês para o popup ler DIRETO do Supabase (sem varrer o ListarOS da Omie na
-- hora do clique). Aplicar no SQL Editor do Supabase ANTES do deploy do código.
--
-- Quem escreve é o mesmo refresh em background que atualiza os_mensal (o mês é
-- apagado e regravado inteiro a cada refresh). tem_nota NÃO fica aqui — segue
-- vindo do os_nfse na leitura.
create table if not exists os_servicos_itens (
  id bigserial primary key,
  conta_omie text not null,
  mes int not null,
  ano int not null,
  ncod_os bigint not null,
  numero_os text not null default '',
  data text not null default '',           -- dd/mm/aaaa (data de faturamento)
  codigo_cliente bigint,
  descricao text not null default '',
  tipo text not null default 'OUTRO',      -- HR | KM | OUTRO
  categoria text not null default '',      -- código da categoria Omie do item
  categoria_desc text not null default '',
  qtde numeric not null default 0,
  valor_unit numeric not null default 0,
  valor_total numeric not null default 0,
  atualizado_em timestamptz not null default now()
);

create index if not exists os_servicos_itens_mes_idx
  on os_servicos_itens (conta_omie, ano, mes);
