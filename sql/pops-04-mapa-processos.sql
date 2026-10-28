-- =====================================================================
-- POPs — Mapa de processos (22/10/2026)
-- Pedido: "criar POP para tudo" — acompanhar, processo a processo, quem é o dono,
-- a prioridade, o prazo e em que pé está o POP. Decisão: fica DENTRO do portal
-- (aba "Mapa de processos" em /pops). A SITUAÇÃO não é digitada: sai do POP ligado
-- (sem POP → rascunho → em revisão → publicado), calculada em /api/pops/processos.
--
-- Semente: os 76 processos levantados dos fluxos do portal em 21/10/2026, nas 8 áreas
-- de POP. `modelo_codigo` = modelo do sistema que serve de ponto de partida (o botão
-- "Criar POP" duplica o modelo). OFI-001 (já publicado) nasce ligado ao seu processo.
--
-- Leitura e escrita só pelas rotas (service role): RLS ligada sem policy + REVOKE.
-- Idempotente (on conflict do nothing).
-- =====================================================================

create table if not exists pops_processos (
  id             uuid primary key default gen_random_uuid(),
  area_id        uuid not null references pops_areas(id),
  titulo         text not null check (char_length(titulo) between 3 and 160),
  tela           text,                                   -- onde acontece no portal (ex.: /pos)
  prioridade     text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  dono_id        uuid,                                   -- financeiro_usu.id (quem escreve o POP)
  prazo          date,
  pop_id         uuid references pops(id) on delete set null,
  modelo_codigo  text,                                   -- MOD-* que serve de partida
  observacao     text,
  ordem          integer not null default 0,
  arquivado      boolean not null default false,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  unique (area_id, titulo)
);
create index if not exists pops_processos_pop_idx on pops_processos (pop_id);

alter table pops_processos enable row level security;
revoke all on pops_processos from anon, authenticated;

-- Semente --------------------------------------------------------------------
insert into pops_processos (area_id, titulo, tela, modelo_codigo, ordem)
select a.id, s.titulo, s.tela, s.modelo, s.ordem
from (values
  ('OFI', 1,  'Abertura de OS e inspeção de recebimento da máquina', '/pos', 'MOD-OFI-002'),
  ('OFI', 2,  'Orçamento de serviço e envio ao cliente', '/orcamentos', null),
  ('OFI', 3,  'Aprovação do orçamento e agendamento do técnico', '/pos', null),
  ('OFI', 4,  'Execução e diagnóstico, com requisição de peças para a OS', '/pos', null),
  ('OFI', 5,  'Relatório técnico e fotos (app do técnico)', '/pos', null),
  ('OFI', 6,  'Revisão periódica Mahindra (50 h, 300 h…)', '/revisoes', 'MOD-OFI-003'),
  ('OFI', 7,  'Cheque de revisão: gerar, colher a assinatura do cliente e enviar à Mahindra', '/revisoes', null),
  ('OFI', 8,  'Inspeção de pré-entrega de máquina nova', '/pos', null),
  ('OFI', 9,  'Entrega técnica de máquina ao cliente', '/pos', 'MOD-OFI-001'),
  ('OFI', 10, 'Garantia: abrir, juntar peças e fotos, enviar à montadora', '/garantias', null),
  ('OFI', 11, 'Guarda de peças de garantia por 90 dias e descarte', '/garantias', null),
  ('OFI', 12, 'Envio da OS à Omie', '/pos', null),
  ('OFI', 13, 'Cobrança do cliente (link de assinatura e forma de pagamento)', '/pos', null),
  ('OFI', 14, 'Faturamento da OS com NFS-e', '/pos', null),
  ('OFI', 15, 'Alimentação e diárias do técnico (OS → requisição)', '/pos', null),
  ('OFI', 16, 'Inspeção de combustível dos tratores', '/pops', null),
  ('OFI', 17, 'Atendimento do cliente no WhatsApp (NovaZap), dentro e fora do horário', '/tratorilson', null),
  ('PEC', 1,  'Pré-pedido de venda no balcão', '/ppv', null),
  ('PEC', 2,  'Separação e retirada de peças pelo técnico', '/ppv', null),
  ('PEC', 3,  'Faturamento do pedido de peças (Omie)', '/ppv', null),
  ('PEC', 4,  'Recebimento de mercadoria e conferência com a NF-e', '/estoque/recebimentos', 'MOD-PEC-001'),
  ('PEC', 5,  'Dar entrada da nota', '/estoque/recebimentos', null),
  ('PEC', 6,  'Alocação da peça recebida (prateleira, andar, caixa)', '/ajustes/caracteristicas', null),
  ('PEC', 7,  'Impressão de etiquetas', '/ppv', null),
  ('PEC', 8,  'Inventário rotativo', '/estoque', 'MOD-PEC-002'),
  ('PEC', 9,  'Correção de estoque negativo', '/ajustes/negativos', null),
  ('PEC', 10, 'Peças sem estoque (Opa Peças): captação, verificação, separação', '/opa/pecas', null),
  ('PEC', 11, 'Requisição de compra ou serviço, com mapa de cotações', '/requisicoes', null),
  ('PEC', 12, 'Solicitação de compras (vendedor → diretoria → financeiro → comprador)', '/tickets/compras', null),
  ('PEC', 13, 'Sugestão de compra e pedido ao fornecedor', '/estoque', null),
  ('PEC', 14, 'Remessas e devoluções de peças', '/estoque', null),
  ('PEC', 15, 'Cadastro de produto (família, características, fiscal)', '/ajustes', null),
  ('PEC', 16, 'Arquivo mensal da Mahindra', '/ajustes/mahindra', null),
  ('VEN', 1,  'Proposta comercial de máquina', '/propostas', null),
  ('VEN', 2,  'Pedido de máquina à fábrica, com previsão de chegada', '/propostas', null),
  ('VEN', 3,  'Chegada da máquina nova e pátio', '/estoque/recebimentos-omie', null),
  ('VEN', 4,  'Faturamento da máquina ao cliente', '/propostas', null),
  ('VEN', 5,  'Cadastro de cliente novo na Omie', '/clientes', null),
  ('VEN', 6,  'Visita ao cliente (CRM, roteiro e checklist do vendedor)', '/supervisor-vendas', null),
  ('VEN', 7,  'Ligação de atendimento e relacionamento', '/feedbacks/atendimento', null),
  ('VEN', 8,  'Feira e ação de marketing: planejar, captar leads, apoio da fábrica, contrapartida', '/marketing', null),
  ('VEN', 9,  'Captura de lead pelo celular', '/lead', null),
  ('VEN', 10, 'Comissão e ajustes por venda', '/gestao-vendas', null),
  ('FIN', 1,  'Fechamento de caixa diário', '/financeiro', 'MOD-FIN-001'),
  ('FIN', 2,  'Pedido de pagamento: lançar e enviar à Omie', '/financeiro', null),
  ('FIN', 3,  'Baixa de contas a pagar e a receber', '/ajustes/baixa-contas', null),
  ('FIN', 4,  'Cobrança de títulos vencidos', '/dre-financeiro/vencidos', null),
  ('FIN', 5,  'Lembrete de vencimento ao cliente', '/financeiro', null),
  ('FIN', 6,  'Antecipação de recebíveis (desconto de duplicatas)', '/ajustes/antecipacoes', null),
  ('FIN', 7,  'Pagamento de requisições', '/financeiro', null),
  ('FIN', 8,  'Correção de vencimento ou projeto de título', '/ajustes/correcao-contas', null),
  ('FIN', 9,  'Conferência das movimentações de conta corrente', '/dre-financeiro/movimentos', null),
  ('FIN', 10, 'Fechamento mensal do DRE', '/dre-financeiro', null),
  ('FIS', 1,  'Emissão de NF-e de venda: conferir antes de transmitir', '/ppv', 'MOD-FIS-001'),
  ('FIS', 2,  'Emissão de NFS-e e modelos fiscais dos serviços', '/pos/modelos-fiscais', null),
  ('FIS', 3,  'Devolução de mercadoria (inclui a triangular)', '/ajustes/devolucao', null),
  ('FIS', 4,  'Remessa para demonstração ou conserto', '/estoque', null),
  ('FIS', 5,  'Guarda das notas (PDF e XML) e o que fazer quando a Omie cai', '/estoque/notas', null),
  ('FRO', 1,  'Checklist de saída de veículo', '/frota', 'MOD-FRO-001'),
  ('FRO', 2,  'Abastecimento (cartão e requisição)', '/frota/abastecimento', null),
  ('FRO', 3,  'Abrir e resolver pendência de veículo, com foto', '/pendencias', null),
  ('FRO', 4,  'Manutenção de veículo (requisição de manutenção veicular)', '/requisicoes', null),
  ('FRO', 5,  'Multas', '/frota/multas', null),
  ('FRO', 6,  'Cadastro de motorista e da CNH', '/frota/motoristas', null),
  ('ADM', 1,  'Abertura e fechamento da loja', null, 'MOD-ADM-001'),
  ('ADM', 2,  'Reunião semanal: pauta, condução e ata', '/reunioes', null),
  ('ADM', 3,  'Abrir ticket, aceitar e acompanhar (Central de Trabalho)', '/tickets/quadros', null),
  ('ADM', 4,  'Registrar ocorrência (Opa)', '/opa', null),
  ('ADM', 5,  'Publicar aviso à equipe', '/avisos', null),
  ('ADM', 6,  'Reservar a sala de reunião', '/salas', null),
  ('ADM', 7,  'Liberar e retirar acessos no portal', '/admin', null),
  ('ADM', 8,  'Criar, revisar e publicar um POP', '/pops', null),
  ('RH',  1,  'Admissão: checklist documental', null, 'MOD-RH-001'),
  ('RH',  2,  'Desligamento, incluindo retirar os acessos do portal', '/admin', null),
  ('RH',  3,  'Treinamento e ciência dos POPs', '/pops', null),
  ('RH',  4,  'Desconto em folha (alimentação do técnico)', '/requisicoes', null)
) as s(sigla, ordem, titulo, tela, modelo)
join pops_areas a on a.sigla = s.sigla
on conflict (area_id, titulo) do nothing;

-- O POP próprio que já existe nasce ligado ao seu processo.
update pops_processos pp set pop_id = p.id
from pops p
where p.codigo = 'OFI-001' and pp.titulo = 'Inspeção de combustível dos tratores' and pp.pop_id is null;

notify pgrst, 'reload schema';

-- Conferência:
--   select a.sigla, count(*) from pops_processos pp join pops_areas a on a.id = pp.area_id group by 1 order by 1;
