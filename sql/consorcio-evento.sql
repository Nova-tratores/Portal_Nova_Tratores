-- =====================================================================
-- CONSÓRCIO NO EVENTO (Supersafra) + SORTEIO — 24/11/2026
-- RODAR NO PROJETO DO PORTAL. Supabase: SQL Editor → colar tudo → Run. Pode rodar mais de uma vez.
--
-- Página aberta /consorcio/<slug> (QR code no estande): explica o consórcio Mahindra, simula a parcela
-- e cadastra o cliente. Cada cadastro ganha um NÚMERO DA SORTE (001, 002…) e vira LEAD em Marketing → Leads.
-- O mesmo telefone não entra duas vezes no mesmo evento: quem repete recebe o número que já tinha.
-- O sorteio roda AQUI no banco (consorcio_sortear), nunca no navegador, e cada giro fica registrado.
--
-- As tabelas têm RLS ligada e nenhuma policy: só o servidor do portal (service role) lê e grava.
-- =====================================================================

-- 1) O evento ---------------------------------------------------------
create table if not exists consorcio_eventos (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,                   -- vai no link: /consorcio/supersafra-2026
  nome          text not null,                          -- "Supersafra 2026"
  local         text,                                   -- "Parque de exposições"
  cidade        text,                                   -- "Carlópolis - PR"
  inicio        date,
  fim           date,
  sorteio_em    timestamptz,                            -- dia e hora do sorteio (aparece na página)
  premio        text,                                   -- o que a pessoa ganha
  regulamento   text,                                   -- texto livre das regras do sorteio
  ativo         boolean not null default true,          -- false = a página para de aceitar cadastro
  acao_id       uuid references mkt_acoes(id) on delete set null,  -- campanha do Marketing (opcional)
  config        jsonb not null default '{}'::jsonb,     -- números do consórcio (grupo, taxas, prazo, modelos)
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- 2) Quem se cadastrou (= quem concorre) ------------------------------
create table if not exists consorcio_inscricoes (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid not null references consorcio_eventos(id) on delete cascade,
  numero        int  not null,                          -- número da sorte, em ordem
  nome          text not null,
  telefone      text not null,
  telefone_norm text generated always as (regexp_replace(telefone, '[^0-9]', '', 'g')) stored,
  cidade        text,
  interesse     text,                                   -- modelo que chamou atenção
  credito       numeric(12,2),                          -- valor que simulou (se simulou)
  tem_trator    boolean,
  aceite_lgpd   boolean not null default false,
  vendedor      text,                                   -- quem cadastrou no estande (vazio = o próprio cliente)
  lead_id       uuid references mkt_leads(id) on delete set null,
  criado_em     timestamptz not null default now(),
  constraint consorcio_insc_numero_uk unique (evento_id, numero),
  constraint consorcio_insc_tel_uk    unique (evento_id, telefone_norm)
);
create index if not exists consorcio_insc_evento_idx on consorcio_inscricoes (evento_id, criado_em desc);
-- de onde o cliente veio (plano Supersafra 1.4): link ?origem=insta|face|whats|estande|banner|cartao&v=<vendedor>&utm_*
alter table consorcio_inscricoes add column if not exists origem text;
alter table consorcio_inscricoes add column if not exists utm    jsonb;
-- ficha do VENDEDOR (24/11/2026, José: o QR só atrai; quem cadastra é o vendedor) — plano Supersafra 1.6
alter table consorcio_inscricoes add column if not exists temperatura        text check (temperatura in ('quente','morno','frio'));
alter table consorcio_inscricoes add column if not exists usado_para_lance   boolean;   -- tem usado que pode virar dinheiro para lance?
alter table consorcio_inscricoes add column if not exists usado_descricao    text;
alter table consorcio_inscricoes add column if not exists proximo_passo      text;
alter table consorcio_inscricoes add column if not exists proximo_passo_data date;
alter table consorcio_inscricoes add column if not exists observacao         text;

-- 3) Cada giro do sorteio ---------------------------------------------
create table if not exists consorcio_sorteios (
  id            bigserial primary key,
  evento_id     uuid not null references consorcio_eventos(id) on delete cascade,
  inscricao_id  uuid not null references consorcio_inscricoes(id) on delete cascade,
  numero        int  not null,
  nome          text not null,
  situacao      text not null default 'valido' check (situacao in ('valido','ausente')),
  sorteado_por  text,
  sorteado_em   timestamptz not null default now()
);
create index if not exists consorcio_sorteios_evento_idx on consorcio_sorteios (evento_id, sorteado_em);

-- 3b) Cliques nos botões de WhatsApp da página de divulgação (revisão de design, 24/11/2026).
-- A página não tem formulário: é isto que mostra quantos clicaram, em qual trator, em que parte da página e por qual link.
create table if not exists consorcio_cliques (
  id         bigserial primary key,
  evento_id  uuid not null references consorcio_eventos(id) on delete cascade,
  modelo     text,                -- trator da mensagem (vazio = a carta destaque)
  lugar      text,                -- topo | carta | outras | mapa | barra (celular)
  origem     text,                -- ?origem= do link (insta, face, whats, banner, cartao…)
  vendedor   text,                -- ?v= do QR do cartão
  utm        jsonb,
  criado_em  timestamptz not null default now()
);
create index if not exists consorcio_cliques_evento_idx on consorcio_cliques (evento_id, criado_em desc);
alter table consorcio_cliques    enable row level security;

alter table consorcio_eventos    enable row level security;
alter table consorcio_inscricoes enable row level security;
alter table consorcio_sorteios   enable row level security;

-- 4) Cadastro vira lead (gatilho antes de gravar: já guarda o lead_id) -
create or replace function consorcio_inscricao_para_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ev consorcio_eventos; v_lead uuid;
begin
  select * into v_ev from consorcio_eventos where id = new.evento_id;
  insert into mkt_leads (acao_id, texto, nome, telefone, cidade, interesse, qualificacao, origem, capturado_em, capturado_por_nome,
                         temperatura, proximo_contato, responsavel_nome, observacoes)
  values (
    v_ev.acao_id,
    concat_ws(' · ',
      'Consórcio no evento ' || v_ev.nome,
      'nº da sorte ' || lpad(new.numero::text, 3, '0'),
      case when new.credito is not null then 'simulou crédito de R$ ' || to_char(new.credito, 'FM999G999G990D00') end,
      case when new.tem_trator is true then 'já tem trator' when new.tem_trator is false then 'ainda não tem trator' end,
      case when new.usado_para_lance is true then 'tem usado para lance' || coalesce(' (' || new.usado_descricao || ')', '') end,
      case when new.proximo_passo is not null then 'próximo passo: ' || new.proximo_passo || coalesce(' em ' || to_char(new.proximo_passo_data, 'DD/MM'), '') end,
      case when new.origem is not null then 'veio por: ' || new.origem end),
    new.nome, new.telefone, new.cidade, new.interesse, 'novo', 'feira', new.criado_em,
    coalesce('Estande: ' || nullif(trim(new.vendedor), ''), 'Página do consórcio (QR code)'),
    new.temperatura, new.proximo_passo_data, nullif(trim(new.vendedor), ''), new.observacao)
  returning id into v_lead;
  new.lead_id := v_lead;
  return new;
end $$;
drop trigger if exists trg_consorcio_para_lead on consorcio_inscricoes;
create trigger trg_consorcio_para_lead before insert on consorcio_inscricoes
  for each row execute function consorcio_inscricao_para_lead();

-- 5) Inscrever: dá o próximo número sem repetir, mesmo com 2 celulares ao mesmo tempo
-- (a versão antiga, sem origem/utm, sai: senão ficariam duas funções com o mesmo nome)
drop function if exists consorcio_inscrever(uuid, text, text, text, text, numeric, boolean, boolean, text);
drop function if exists consorcio_inscrever(uuid, text, text, text, text, numeric, boolean, boolean, text, text, jsonb);
create or replace function consorcio_inscrever(
  p_evento uuid, p_nome text, p_telefone text, p_cidade text, p_interesse text,
  p_credito numeric, p_tem_trator boolean, p_aceite boolean, p_vendedor text,
  p_origem text default null, p_utm jsonb default null,
  p_extra jsonb default null   -- ficha do vendedor: temperatura, usado_para_lance, usado_descricao, proximo_passo, proximo_passo_data, observacao
) returns table (o_numero int, o_ja_inscrito boolean)
language plpgsql set search_path = public as $$
declare v_tel text := regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'); v_num int;
begin
  -- trava só este evento até o fim da transação: dois cadastros juntos não pegam o mesmo número
  perform pg_advisory_xact_lock(hashtext('consorcio:' || p_evento::text));
  select i.numero into v_num from consorcio_inscricoes i where i.evento_id = p_evento and i.telefone_norm = v_tel;
  if found then
    -- já cadastrado: mantém o número, mas o que o vendedor preencheu agora atualiza a ficha (sem apagar o que já havia)
    update consorcio_inscricoes i set
      cidade             = coalesce(nullif(trim(p_cidade), ''), i.cidade),
      interesse          = coalesce(nullif(trim(p_interesse), ''), i.interesse),
      credito            = coalesce(p_credito, i.credito),
      tem_trator         = coalesce(p_tem_trator, i.tem_trator),
      vendedor           = coalesce(nullif(trim(p_vendedor), ''), i.vendedor),
      temperatura        = coalesce(nullif(p_extra->>'temperatura', ''), i.temperatura),
      usado_para_lance   = coalesce((p_extra->>'usado_para_lance')::boolean, i.usado_para_lance),
      usado_descricao    = coalesce(nullif(trim(p_extra->>'usado_descricao'), ''), i.usado_descricao),
      proximo_passo      = coalesce(nullif(trim(p_extra->>'proximo_passo'), ''), i.proximo_passo),
      proximo_passo_data = coalesce(nullif(p_extra->>'proximo_passo_data', '')::date, i.proximo_passo_data),
      observacao         = coalesce(nullif(trim(p_extra->>'observacao'), ''), i.observacao)
     where i.evento_id = p_evento and i.telefone_norm = v_tel;
    return query select v_num, true;
    return;
  end if;
  select coalesce(max(i.numero), 0) + 1 into v_num from consorcio_inscricoes i where i.evento_id = p_evento;
  insert into consorcio_inscricoes (evento_id, numero, nome, telefone, cidade, interesse, credito, tem_trator, aceite_lgpd, vendedor, origem, utm,
                                    temperatura, usado_para_lance, usado_descricao, proximo_passo, proximo_passo_data, observacao)
  values (p_evento, v_num, trim(p_nome), trim(p_telefone), nullif(trim(p_cidade), ''), nullif(trim(p_interesse), ''),
          p_credito, p_tem_trator, coalesce(p_aceite, false), nullif(trim(p_vendedor), ''), nullif(trim(p_origem), ''), p_utm,
          nullif(p_extra->>'temperatura', ''), (p_extra->>'usado_para_lance')::boolean, nullif(trim(p_extra->>'usado_descricao'), ''),
          nullif(trim(p_extra->>'proximo_passo'), ''), nullif(p_extra->>'proximo_passo_data', '')::date, nullif(trim(p_extra->>'observacao'), ''));
  return query select v_num, false;
end $$;

-- 6) Sortear: escolhe um inscrito que ainda não saiu em nenhum giro ---
create or replace function consorcio_sortear(p_evento uuid, p_por text)
returns setof consorcio_sorteios
language plpgsql set search_path = public as $$
declare v consorcio_inscricoes; r consorcio_sorteios;
begin
  perform pg_advisory_xact_lock(hashtext('consorcio-sorteio:' || p_evento::text));
  select i.* into v from consorcio_inscricoes i
   where i.evento_id = p_evento
     and not exists (select 1 from consorcio_sorteios s where s.inscricao_id = i.id)
   order by random() limit 1;
  if not found then
    raise exception 'sem_participantes';
  end if;
  insert into consorcio_sorteios (evento_id, inscricao_id, numero, nome, sorteado_por)
  values (p_evento, v.id, v.numero, v.nome, p_por)
  returning * into r;
  return next r;
end $$;

-- só o servidor chama estas funções
revoke all on function consorcio_inscrever(uuid, text, text, text, text, numeric, boolean, boolean, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function consorcio_sortear(uuid, text) from public, anon, authenticated;

-- 7) O primeiro evento (os campos vazios você preenche no portal: Marketing → Consórcio) -
-- 3 grupos (tabelas de dez/2026): 6005 (cabinados), 6008 e 6009. Mesmas taxas; cada grupo com suas datas.
-- O 5050 está no 6008 e no 6009: a página mostra um cartão só com os dois grupos.
-- (um bloco só: o editor do Supabase não mantém tabela temporária entre comandos)
do $cfg$
declare v_cfg jsonb := '{
  "administradora": "Mahindra Consórcio Nacional (Ápice)",
  "whatsapp": "551433516049",
  "destaque": "MH0903",
  "estande_local": "",
  "endereco": "ROD PR 218 KM 17\nSítio São Luiz, s/n · Pinheirinho\nCarlópolis - PR · CEP 86422-890",
  "abertura": "08:00",
  "horario": "",
  "whatsapp_evento": "",
  "vendedores": [],
  "prazo_meses": 120,
  "taxa_adm_pct": 15,
  "fundo_reserva_pct": 1,
  "seguro_pct": 0.084,
  "lance_embutido_pct": 20,
  "lance_fixo_pct": 30,
  "grupos": [
    { "grupo": "6005", "vencimento": "2026-11-26", "proxima_assembleia": "2026-12-02" },
    { "grupo": "6008", "vencimento": "2026-12-10", "proxima_assembleia": "2026-12-16" },
    { "grupo": "6009", "vencimento": "2026-12-10", "proxima_assembleia": "2026-12-17" }
  ],
  "destaques": [
    "Sem juros: só taxa de administração de 15%, dividida no prazo todo",
    "Use até 20% da própria carta como lance (lance embutido)",
    "Todo mês: 1 por sorteio, 1 por lance fixo de 30% e 1 por lance livre",
    "Nas Super Assembleias entra também o lance fixo de 40%"
  ],
  "super_assembleia": { "grupo": "6008", "quando": "maio/2027", "cartas": 41, "por_mes": 3, "total_ate": 56 },
  "desconto_parcela": { "numero": 3, "pct": 50 },
  "condicoes": [
    "Sem entrada: você já começa pagando só a 1ª parcela",
    "1ª parcela no Pix, aqui mesmo no estande",
    "Da 2ª em diante, no boleto"
  ],
  "modelos": [
    { "nome": "Mahindra 2025 25cv com carregador frontal L15", "codigo": "MH0903", "credito": 146685, "grupo": "6008", "foto": "/consorcio/2025.webp" },
    { "nome": "Mahindra 5050 49cv", "codigo": "MH0937", "credito": 181286, "grupo": "6008", "foto": "/consorcio/5050.webp" },
    { "nome": "Mahindra 5050 49cv", "codigo": "MH0937", "credito": 181286, "grupo": "6009", "foto": "/consorcio/5050.webp" },
    { "nome": "Mahindra 6060 57cv MDA", "codigo": "MH0938", "credito": 231000, "grupo": "6009", "foto": "/consorcio/6060.webp" },
    { "nome": "Mahindra 6075 80cv plataforma e redutor", "codigo": "MH0936", "credito": 278497, "grupo": "6009", "foto": "/consorcio/6075.webp" },
    { "nome": "Mahindra 86-110P 110cv cabine", "codigo": "MH0902", "credito": 468000, "grupo": "6005", "foto": "/consorcio/86-110p.webp" }
  ]
}'::jsonb;
begin
  insert into consorcio_eventos (slug, nome, config) values ('supersafra-2026', 'Supersafra 2026', v_cfg)
  on conflict (slug) do nothing;
  -- se o evento já existia no formato antigo (um grupo só, sem "grupos"), troca pela tabela nova.
  -- Config já editada no portal no formato novo não é tocada.
  update consorcio_eventos set config = v_cfg, atualizado_em = now()
   where slug = 'supersafra-2026' and not (config ? 'grupos');
end
$cfg$;

-- liga à campanha SUPERSAFRA 2026 do Marketing (criada em 24/11/2026) e copia datas e cidade dela.
-- Os leads do QR code entram nessa campanha. Só preenche o que ainda está vazio.
update consorcio_eventos e
   set acao_id = a.id,
       inicio  = coalesce(e.inicio, a.data_inicio),
       fim     = coalesce(e.fim, a.data_fim),
       cidade  = coalesce(e.cidade, a.cidade),
       local   = coalesce(e.local, a.local_nome)
  from mkt_acoes a
 where e.slug = 'supersafra-2026'
   and a.id = '2d2bde66-4448-4d0d-8727-e3e5f6f7ff31'
   and e.acao_id is null;

notify pgrst, 'reload schema';

-- Desfazer (se precisar):
-- drop table if exists consorcio_sorteios, consorcio_inscricoes, consorcio_eventos cascade;
-- drop function if exists consorcio_inscrever(uuid, text, text, text, text, numeric, boolean, boolean, text, text, jsonb, jsonb);
-- drop function if exists consorcio_sortear(uuid, text);
-- drop function if exists consorcio_inscricao_para_lead();
-- delete from mkt_leads where texto like 'Consórcio no evento %';
