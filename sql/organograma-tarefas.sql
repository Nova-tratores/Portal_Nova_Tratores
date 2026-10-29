-- Organograma — tarefas de cada função e quem é cada função (aba Processos → Organograma → Tarefas).
-- Importa duas listas entregues em 29/10/2026:
--   pos-vendas = "Lista de Tarefas Escritório Oficina - ROTINA" (planilha do Pós-vendas, 81 tarefas;
--                a linha 78, sem assunto e com ação "Sistema", ficou de fora; "Quem" com grafias padronizadas);
--   mariano    = "Relação de Atividades desempenhadas" (planilha do Mariano, 11 atividades; colunas = áreas).
-- A tarefa guarda a FUNÇÃO como escrita na planilha ("Auxiliar Adm 1"); quem é cada função fica em
-- org_funcoes (admin escolhe na tela). Função que é nome de uma pessoa ("Henri") liga sozinha.
-- Escrita só pela rota /api/organograma/* (service role); RLS ligado sem policy. Idempotente.
-- Precisa de sql/organograma.sql antes (mesmo módulo, tabelas independentes).

create table if not exists public.org_tarefas (
  id             bigint generated always as identity primary key,
  origem         text not null,                 -- de qual lista veio
  ordem          int not null,                  -- posição na lista
  numero         text,                          -- nº da planilha (a do Pós-vendas repete o 24)
  assunto        text,
  acao           text not null,
  onde           text,
  quando         text,
  frequencia     text,
  quem           text[] not null default '{}', -- funções/nomes como na planilha (padronizados)
  justificativa  text,
  destinatario   text,
  areas          text[] not null default '{}', -- colunas da planilha do Mariano
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  unique (origem, ordem)
);

create table if not exists public.org_funcoes (
  funcao          text primary key,
  pessoas         text[] not null default '{}', -- chaves 'u:<uid>' / 'rh:<id>' do organograma
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid
);

alter table public.org_tarefas enable row level security;
alter table public.org_funcoes enable row level security;
revoke all on public.org_tarefas, public.org_funcoes from anon, authenticated;

insert into public.org_tarefas (origem, ordem, numero, assunto, acao, onde, quando, frequencia, quem, justificativa, destinatario, areas) values
  ('pos-vendas', 1, '1', 'OS', 'Abrir O.S', 'Sistema', 'Sempre que o técnico for sair para serviço', 'Diario', array['Auxiliar Adm 1']::text[], 'Controlarmos em tempo REAL o andamento dos serviços', null, '{}'::text[]),
  ('pos-vendas', 2, '2', 'Gestão', 'Atualizar Quadros Brancos', 'Escritório', 'Qualquer alteração', 'Diario', array['Auxiliar Adm 1', 'Gerente Pós-Vendas', 'Estagiário']::text[], 'Controlarmos em tempo REAL a agenda dos técnicos', null, '{}'::text[]),
  ('pos-vendas', 3, '3', 'OS', 'Fechar O.S', 'Sistema', 'Finalizar o Serviço', 'Diario', array['Auxiliar Adm 1']::text[], 'Finalizar a O.S, gerar renda para a Oficina, deixar mais claro o panorama das outras OS', null, '{}'::text[]),
  ('pos-vendas', 4, '4', 'OS', 'Emitir relatório com o Status da O.S', 'Sistema', 'Começo do dia, feito automaticamente', 'Diario', array['Auxiliar Adm 1']::text[], 'Para Daniel organizar o time no inicio do dia seguinte', null, '{}'::text[]),
  ('pos-vendas', 5, '5', 'Entrega', 'Enviar PDI para Mahindra', 'E-mail/Planilha', 'Recebimento trator', 'Até 3 dias após o recebimento dos tratores', array['Auxiliar Adm 2']::text[], 'Reembolso', null, '{}'::text[]),
  ('pos-vendas', 6, '6', 'Garantia', 'Enviar Solicitação Garantia (SG)', 'E-mail/Planilha', 'Quebra máquina', 'Até 2 dias após a retirada dapeça', array['Auxiliar Adm 2']::text[], 'Reembolso dos serviços e peças utilizados', null, '{}'::text[]),
  ('pos-vendas', 7, '7', 'Reembolso', 'Abrir pedido de venda da revisão', 'Sistema', 'Até 1 dia depois da silicitação da revisão', null, array['Auxiliar Adm 1']::text[], 'Facilitar o fluxo da separação de peças e saídas dos técnicos', null, '{}'::text[]),
  ('pos-vendas', 8, '8', 'Reembolso', 'Enviar Cheque de Revisão', 'E-mail', 'Após revisão realizada', 'Até 3 dias depois da revisão', array['Auxiliar Adm 1']::text[], 'Reembolso', 'Fabricante', '{}'::text[]),
  ('pos-vendas', 9, '9', 'Gestão', 'Verificar e-mail', 'E-mail', 'Diariamente', 'A cada 20 minutos', array['Auxiliar Adm 1']::text[], 'Atualizar demandas', null, '{}'::text[]),
  ('pos-vendas', 10, '10', 'Gestão', 'Preencher Lousa', 'Sistema', 'Diariamente', 'Diario', array['Auxiliar Adm 1', 'Gerente Pós-Vendas', 'Estagiário']::text[], 'manter-se atualizado sobre os serviços dos mecanicos', null, '{}'::text[]),
  ('pos-vendas', 11, '11', 'Gestão', 'Organização de pastas', 'Escritório', 'Qualquer alteração', 'Diario', array['Auxiliar Adm 1', 'Gerente Pós-Vendas', 'Estagiário']::text[], 'manter organizado', null, '{}'::text[]),
  ('pos-vendas', 12, '12', 'Entrega', 'Montar pasta trator', 'Escritório', 'quando for vendido um trator', 'Diario', array['Auxiliar Adm 1', 'Gerente Pós-Vendas', 'Estagiário']::text[], 'manter organizado', null, '{}'::text[]),
  ('pos-vendas', 13, '13', 'Gestão', 'Cancelar boleto', 'Escritório', 'Contas erradas enviadas ao financeiro', 'Diario', array['Financeiro']::text[], 'Alinhar serviço feito e cobrado do cliente', null, '{}'::text[]),
  ('pos-vendas', 14, '14', 'Financeiro', 'Devolver NF', 'Escritório', 'Faturamento errado', null, array['Auxiliar Adm 1', 'Auxiliar Adm 2']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 15, '15', 'Gestão', 'Receber tratores e implementos', 'Patio', 'Quando chegar', null, array['Gerente Pós-Vendas', 'Auxiliar Adm 2']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 16, '16', 'Gestão', 'Organizar patio', 'Patio', '15 dias', '15 dias', array['Todos os mecânicos']::text[], 'Manter apresentação da loja', null, '{}'::text[]),
  ('pos-vendas', 17, '17', 'Operação', 'Limpeza', 'Patio', 'Na frequencia e/ou Quando insalubre', '2 dias', array['Valdir']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 18, '18', 'Operação', 'Limpeza', 'Lavador', 'Mensalmente', '6 dias', array['Valdir']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 19, '19', 'Operação', 'Limpeza', 'Oficina', null, null, array['Valdir']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 20, '20', 'Gestão', 'Manutenção e Combustivel Frota', null, 'Mensalmente', null, array['Auxiliar Adm 1', 'Auxiliar Adm 2']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 21, '21', 'Gestão', 'distribuicao de serviço oficina', 'Escritório', 'Sob Demanda', 'Diario', array['Auxiliar Adm 1', 'Auxiliar Adm 2']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 22, '22', 'Gestão', 'verificar e acompanhar os servicos', 'Em Campo/Loja', null, null, array['Gerente Pós-Vendas', 'Auxiliar Adm 1']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 23, '23', 'Operação', 'Solicitação de orçamento de peças', 'Departamento Peças', null, null, array['Zezo']::text[], null, 'Dpto Peças', '{}'::text[]),
  ('pos-vendas', 24, '24', 'Gestão', 'relacionamento com cliente', 'Escritório', null, null, array['Todos']::text[], null, 'Cliente', '{}'::text[]),
  ('pos-vendas', 25, '24', 'Operação', 'Solicitação de orçamento de Revisão', 'Escritorio Oficina', null, null, array['Auxiliar Adm 1']::text[], null, 'Dpto Peças', '{}'::text[]),
  ('pos-vendas', 26, '25', 'Operação', 'Oferta de serviços', 'Escritório/In loco', 'Sempre', null, array['Auxiliar Adm 2']::text[], null, 'Cliente', '{}'::text[]),
  ('pos-vendas', 27, '26', 'Gestão', 'Verificar nivel de satisfação do serviço prestado', null, '3 dias após o serviço', null, array['Estagiário']::text[], null, 'Cliente', '{}'::text[]),
  ('pos-vendas', 28, '27', 'Gestão', 'Gerenciar a agenda da oficina', null, 'Sempre', null, array['Auxiliar Adm 1']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 29, '28', 'Gestão', 'receber solicitacao de manutencao', 'Escritório/In loco', 'Sempre', null, array['Gerente Pós-Vendas']::text[], null, 'Cliente', '{}'::text[]),
  ('pos-vendas', 30, '29', 'Gestão', 'cobrança', 'Escritório/In loco', 'Quando solicitado', null, array['Financeiro']::text[], null, 'Cliente', '{}'::text[]),
  ('pos-vendas', 31, '30', 'Operação', 'Apresentação visual dos funcionarios e serviços', 'Oficina/No Campo', 'Sempre', 'Toda segunda pelo menos', array['Todos']::text[], null, 'Funcionarios', '{}'::text[]),
  ('pos-vendas', 32, '31', 'Gestão', 'distribuicao dos serviços', 'Escritorio/Oficina', 'Sempre', null, array['Auxiliar Adm 1', 'Auxiliar Adm 2']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 33, '32', 'Gestão', 'quanto a recebimento dos clientes', 'Escritório', 'Quando solicitado', null, array['Financeiro']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 34, '33', 'Gestão', 'quanto a solicitação de garantia', 'Escritório', null, null, array['Auxiliar Adm 2']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 35, '34', 'Gestão', 'conversa com pos vendas dos fornecedores', 'Escritório', null, null, array['Gerente Pós-Vendas', 'Auxiliar Adm 2']::text[], null, 'Fornecedor', '{}'::text[]),
  ('pos-vendas', 36, '35', 'Gestão', 'contato com tecnico das empresas fornecedoras', 'Escritório', null, null, array['Gerente Pós-Vendas', 'Auxiliar Adm 2']::text[], null, 'Fornecedor', '{}'::text[]),
  ('pos-vendas', 37, '36', 'Gestão', 'agendamento de cursos', 'Escritório', null, null, array['Gerente Pós-Vendas', 'Auxiliar Adm 2']::text[], null, 'Fornecedor', '{}'::text[]),
  ('pos-vendas', 38, '37', 'Gestão', 'distribuicao dos trabalhos e locação', 'Escritório', null, null, array['Gerente Pós-Vendas', 'Auxiliar Adm 2']::text[], null, 'Fornecedor', '{}'::text[]),
  ('pos-vendas', 39, '38', 'Gestão', 'contato via entre funcionarios e clientes', 'Escritório', null, null, array['Auxiliar Adm 1', 'Auxiliar Adm 2']::text[], null, 'Funcionario', '{}'::text[]),
  ('pos-vendas', 40, '39', 'Gestão', 'avaliacao dos funcionarios', 'Escritório', null, 'mensal', array['Gerente Pós-Vendas', 'Auxiliar Adm 2']::text[], null, 'Funcionario', '{}'::text[]),
  ('pos-vendas', 41, '40', 'Operação', 'Buscar Implementos/tratores', 'Fabricante', null, null, array['Motorista']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 42, '41', 'Operação', 'Entregar Implementos/tratores', 'Cliente/Evento', null, null, array['Motorista']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 43, '42', 'Operação', 'Operar Munck', 'Patio', null, null, array['Motorista']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 44, '43', 'Operação', 'Limpeza', 'Banheiro', 'Diario', null, '{}'::text[], null, null, '{}'::text[]),
  ('pos-vendas', 45, '44', 'Operação', 'Limpeza', 'Cozinha', 'Diario', null, '{}'::text[], null, null, '{}'::text[]),
  ('pos-vendas', 46, '45', 'OS', 'Abrir OS para entrega técnica', 'Escritório', null, null, array['Auxiliar Adm 2']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 47, '46', 'OS', 'Abrir OS Quando trator entrar na oficina/loja', 'Escritório', null, null, array['Auxiliar Adm 1']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 48, '47', 'OS', 'Abrir OS para revisão de trator', 'Escritório', null, null, array['Auxiliar Adm 1']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 49, '48', 'OS', 'Abrir OS inspeção Pré Entrega', 'Escritório', null, null, array['Auxiliar Adm 2']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 50, '49', 'Gestão', 'Verificar e-mail', 'Escritório', 'Diario', null, array['Auxiliar Adm 1', 'Auxiliar Adm 2', 'Estagiário']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 51, '50', 'OS', 'Atualizar OS no sistema com as OS preenchidas pelos mecanicos no talaão', 'Escritório', 'Diario', 'QUANDO MECANICO ENTREGAR A OS', array['Auxiliar Adm 1']::text[], null, 'Auxiliar Adm 1', '{}'::text[]),
  ('pos-vendas', 52, '51', 'Garantia', 'Abertura Garantia', 'Escritório', 'Quando necessário', null, array['Auxiliar Adm 2']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 53, '52', 'Garantia', 'Montagem Garantia', 'Escritório', 'Quando necessário', null, array['Auxiliar Adm 2']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 54, '53', 'Garantia', 'Envio da Garantia', 'Escritório', 'Quando necessário', null, array['Auxiliar Adm 2']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 55, '54', 'Garantia', 'Fechamento Garantia', 'Escritório', 'Quando necessário', null, array['Auxiliar Adm 2']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 56, '55', 'Gestão', 'Financeiro Combustivel', 'Escritório', 'Quando solicitado', null, array['Auxiliar Adm 1', 'Auxiliar Adm 2', 'Estagiário']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 57, '56', 'Entrega', 'Mensagem de Pós Vendas', 'Escritório', '10 dias após a entrega', null, array['Estagiário']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 58, '57', 'Gestão', 'Analisar ofertas de combustivel', 'Escritório', null, null, array['Henri']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 59, '60', 'Gestão', 'Cobrar Pagamento de Revisões', 'E-mail', 'Após revosão realizada', 'Todo dia 01', array['Financeiro']::text[], 'Reembolso', 'Fabricante', '{}'::text[]),
  ('pos-vendas', 60, '61', 'Gestão', 'Relatorio todas as O.S criadas na semana Anterior', 'Sistema', 'Já automatzado', null, '{}'::text[], null, null, '{}'::text[]),
  ('pos-vendas', 61, '62', 'Gestão', 'Relatório todas as OS abertas, ordenadas por data de Inclusão', 'Sistema', 'Já automatzado', null, '{}'::text[], null, null, '{}'::text[]),
  ('pos-vendas', 62, '63', 'Gestão', 'Todos os serviços faturados na semana anterior (distinguir FATURADO e NFS)', 'Sistema', 'Já automatzado', null, '{}'::text[], null, null, '{}'::text[]),
  ('pos-vendas', 63, '64', 'Gestão', 'Produtos adicionados sem familia', 'Sistema', null, null, array['Henri']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 64, '65', 'Gestão', 'Solicitação e Serviço', 'Escritório', 'Sob Demanda', null, '{}'::text[], null, null, '{}'::text[]),
  ('pos-vendas', 65, '66', 'Gestão', 'Solicitação e Serviços de terceiros', 'Escritório', 'Sob Demanda', null, '{}'::text[], null, null, '{}'::text[]),
  ('pos-vendas', 66, '67', 'Gestão', 'Solicitar Uniformes e EPI', 'Escritório', 'Sob Demanda', 'Trimestralmente', array['Gerente Pós-Vendas']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 67, '68', 'Caminhão', 'Controle de deslocamento do caminhão', 'Escritório', 'Toda segunda', 'Semanalmente', array['Auxiliar Adm 2', 'Motorista']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 68, '69', 'Gestão', 'Entrar em contato com o cliente', 'Escritório', 'pro ativo', 'Quando Agenda Estiver Vaia ncompleta', array['Todos']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 69, '70', 'Gestão', 'Auditoria', 'Escritorio', 'Rotina', 'Diariamente', '{}'::text[], 'Apontar Inconsistencias', null, '{}'::text[]),
  ('pos-vendas', 70, '71', 'Gestão', 'Montar folgas do mês', 'Escritorio', 'final do mês', null, array['Gerente Pós-Vendas']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 71, '72', 'Gestão', 'Gerar relatório de comissão', 'Escritorio', 'Começo do mês', null, array['Gerente Pós-Vendas', 'Auxiliar Adm 1']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 72, '73', 'Gestão', 'Gerar relatório de faturamento', 'Escritorio', 'Começo do mês', null, array['Gerente Pós-Vendas', 'Auxiliar Adm 1']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 73, '74', 'Gestão', 'Gerar requisições', 'Escritorio', 'Diariamente', null, array['Todo o escritório']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 74, '75', 'Gestão', 'Atualizar requisições', 'Escritorio', 'Diariamente', null, array['Estagiário']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 75, '76', 'Sistema', 'Backup dados de orçamentos e garantias', 'Escritorio', null, null, array['Auxiliar Adm 1']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 76, '77', 'Sistema', 'Sistema automático de relatório', 'Escritorio', null, null, array['Auxiliar Adm 1']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 77, '79', 'Sistema', 'Enviar email para pagamento de revisões de 50 e 900h e pré entrega', 'Escritorio', null, null, array['Auxiliar Adm 1']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 78, '80', 'Sistema', 'Gerar NF para pagamento de garantias recebidas', 'Escritorio', null, null, array['Auxiliar Adm 1']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 79, '81', 'Sistema', 'Conferencia de NF dos fornecedores', 'Escritorio', null, null, array['Gerente Pós-Vendas']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 80, '82', 'Sistema', 'Envio de boleto funcionários terceirizados para o financeiro', 'Escritorio', null, null, array['Gerente Pós-Vendas']::text[], null, null, '{}'::text[]),
  ('pos-vendas', 81, '83', 'Gestão', 'Coletar feedbacks dos clientes', 'Escritorio', 'Diariamente', null, array['Estagiário']::text[], null, null, '{}'::text[]),
  ('mariano', 1, null, 'Pessoas / DLL', 'Atender Vendedores', null, null, null, array['Mariano']::text[], null, null, array['Pessoas', 'DLL']::text[]),
  ('mariano', 2, null, 'Pessoas / DLL', 'Conversar com Clientes', null, null, null, array['Mariano']::text[], null, null, array['Pessoas', 'DLL']::text[]),
  ('mariano', 3, null, 'Pessoas / DLL', 'Conversar com o DLL', null, null, null, array['Mariano']::text[], null, null, array['Pessoas', 'DLL']::text[]),
  ('mariano', 4, null, 'Fiscal / Produtos', 'Entrada de Produtos', null, null, null, array['Mariano']::text[], null, null, array['Fiscal', 'Produtos']::text[]),
  ('mariano', 5, null, 'Fiscal / Produtos', 'Cadastro de Produtos no Sistema', null, null, null, array['Mariano']::text[], null, null, array['Fiscal', 'Produtos']::text[]),
  ('mariano', 6, null, 'Fiscal / Produtos', 'Saída de Produtos', null, null, null, array['Mariano']::text[], null, null, array['Fiscal', 'Produtos']::text[]),
  ('mariano', 7, null, 'Produtos', 'Inventário Rotativo', null, null, null, array['Mariano']::text[], null, null, array['Produtos']::text[]),
  ('mariano', 8, null, 'Pessoas / DLL', 'Contrato com Clientes', null, null, null, array['Mariano']::text[], null, null, array['Pessoas', 'DLL']::text[]),
  ('mariano', 9, null, 'DLL', 'Ir ao Correios', null, null, null, array['Mariano']::text[], null, null, array['DLL']::text[]),
  ('mariano', 10, null, 'DLL', 'Ir ao Cartório', null, null, null, array['Mariano']::text[], null, null, array['DLL']::text[]),
  ('mariano', 11, null, null, 'Fazer Pedido na Fábrica', null, null, null, array['Mariano']::text[], null, null, '{}'::text[])
on conflict (origem, ordem) do nothing;

notify pgrst, 'reload schema';

-- Conferência:
--   select origem, count(*) from org_tarefas group by 1;   -- pos-vendas 81 · mariano 11
--   funções na planilha: Auxiliar Adm 1, Auxiliar Adm 2, Estagiário, Financeiro, Gerente Pós-Vendas, Henri, Mariano, Motorista, Todo o escritório, Todos, Todos os mecânicos, Valdir, Zezo
