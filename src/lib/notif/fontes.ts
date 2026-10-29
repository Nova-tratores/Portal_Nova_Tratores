// O que cada app do portal aciona de notificação (José, 29/10/2026: "ver o que cada app aciona de pessoas").
// Levantado do código em 29/10/2026. Um item por TIPO gravado em portal_notificacoes (é o que dá para contar), com os
// eventos que gravam esse tipo, quem recebe e se respeita o "desligar" do usuário (lib/notif/prefs.ts).
// Todo aviso gravado vira também push no celular (gatilho portal_notificacao_push) — sem filtro próprio.
// PURO: a tela de Administração lê daqui. Ao criar um aviso novo no código, acrescente aqui.

export interface EventoNotif { evento: string; quem: string; respeita: boolean }
export interface FonteNotif { id: string; app: string; ic: string; tipos: string[]; modulo: string | null; eventos: EventoNotif[] }

export const FONTES_NOTIF: FonteNotif[] = [
  { id: 'financeiro', app: 'Financeiro', ic: 'fa-dollar-sign', tipos: ['financeiro'], modulo: 'financeiro', eventos: [
    { evento: 'Card movimentado, criado, excluído, boleto/comprovante anexado, pagamento confirmado, recobrança', quem: 'Admins + quem tem o módulo Financeiro (menos quem fez)', respeita: true },
    { evento: 'Card novo vindo do Omie, cliente respondeu o e-mail, envio automático do boleto', quem: 'Admins + módulo Financeiro (ou só o pós-vendas, conforme o caso)', respeita: true },
  ] },
  { id: 'pos', app: 'Pós-Vendas (OS)', ic: 'fa-screwdriver-wrench', tipos: ['pos'], modulo: 'pos', eventos: [
    { evento: 'OS criada, editada, mudou de fase, enviada ao Omie, cancelada, refaturada', quem: 'Só Admins (menos quem fez)', respeita: true },
    { evento: 'Faturamento da OS: NFS-e pronta, rejeitada, Omie não faturou', quem: 'Quem faturou', respeita: true },
    { evento: 'Ocorrência de técnico registrada; técnico mudou de caminho / chegou / justificou', quem: 'Admins', respeita: true },
    { evento: 'OS com PPV na lousa do dia (16 h)', quem: 'A pessoa configurada na Lousa', respeita: true },
    { evento: 'Erro ao faturar OS/NFS-e/PPV', quem: 'Todo mundo com função T.I.', respeita: false },
    { evento: 'Requisição a cobrar do cliente; PPV faturado no portal e não no Omie', quem: 'Pós-Vendas (e T.I.)', respeita: false },
    { evento: '"Você recebeu uma ocorrência" / justificativa julgada', quem: 'O técnico', respeita: false },
  ] },
  { id: 'ppv', app: 'Peças (PPV)', ic: 'fa-box', tipos: ['ppv'], modulo: 'ppv', eventos: [
    { evento: 'PPV criado, editado, cancelado, faturado, enviado ao Omie', quem: 'Só Admins (menos quem fez)', respeita: true },
    { evento: 'NF-e do PPV pronta / recusada pelo Omie', quem: 'Quem faturou', respeita: true },
    { evento: 'Rastreio de unidades de peça, peças aguardando locação, estoque no limite', quem: 'Admins, Devs e responsáveis de peças', respeita: true },
  ] },
  { id: 'ppv-tarefa', app: 'Tarefas do PPV/OS', ic: 'fa-list-check', tipos: ['ppv-tarefa'], modulo: null, eventos: [
    { evento: 'Tarefa nova atribuída', quem: 'A pessoa atribuída', respeita: false },
  ] },
  { id: 'garantia', app: 'Garantias', ic: 'fa-shield-halved', tipos: ['garantia'], modulo: 'garantias', eventos: [
    { evento: 'Garantia criada, finalizada, devolução, retorno de peças, pendência, ressarcimento, e-mails', quem: 'Admins + quem tem o módulo Garantias', respeita: true },
    { evento: 'Relatório do técnico marcado garantia virou garantia (banco); claim perdido recuperado', quem: 'Admins', respeita: true },
  ] },
  { id: 'requisicao', app: 'Requisições', ic: 'fa-cart-shopping', tipos: ['requisicao'], modulo: 'requisicoes', eventos: [
    { evento: 'Requisição criada, alterada, restaurada, pedida pelo app, atualizada pelo técnico', quem: 'Só Admins', respeita: true },
    { evento: 'Requisição mudou de fase', quem: 'Quem pediu a requisição', respeita: false },
    { evento: 'Pedido de permissão para alterar requisição acima de R$ 500; aprovado / recusado', quem: 'Devs; depois quem pediu', respeita: false },
  ] },
  { id: 'revisao', app: 'Controle de Revisões', ic: 'fa-calendar-check', tipos: ['revisao'], modulo: 'revisoes', eventos: [
    { evento: 'Falha ao enviar o cheque de revisão', quem: 'Admins', respeita: true },
    { evento: 'Lembrete de enviar cheque venceu', quem: 'Dono do lembrete', respeita: false },
  ] },
  { id: 'tickets', app: 'Tickets, Reuniões, POPs, Central de Trabalho', ic: 'fa-ticket', tipos: ['tickets'], modulo: 'tickets', eventos: [
    { evento: 'Ticket criado, respondido, transferido, mudou de status; reunião marcada/ata; POP para ciência; war-room', quem: 'Os envolvidos (menos quem fez)', respeita: true },
    { evento: 'Adicionado a um quadro; "Fulano pediu para você abrir um ticket"', quem: 'A pessoa adicionada/escolhida', respeita: false },
    { evento: 'Plano Safra: escolhido para conferir; robô aplicou taxas novas', quem: 'Conferentes do Plano Safra', respeita: false },
  ] },
  { id: 'novazap', app: 'NovaZap / Tratorilson', ic: 'fa-comments', tipos: ['novazap'], modulo: 'novazap', eventos: [
    { evento: 'Tratorilson não sabe responder, cliente precisa de atendimento, conversa sem resposta há 10 min', quem: 'Devs + escolhidos em "Avisos do Tratorilson" (pós-vendas vê em janela)', respeita: true },
    { evento: 'Mensagem nova com o Tratorilson desligado', quem: 'Devs + escolhidos em "Avisos do Tratorilson"', respeita: true },
  ] },
  { id: 'sistema', app: 'Avisos, CRM, Conhecimento, Comissões, Lembretes', ic: 'fa-bullhorn', tipos: ['sistema'], modulo: null, eventos: [
    { evento: 'Aviso publicado (Avisos)', quem: 'Todos, uma categoria ou os técnicos, conforme o aviso', respeita: false },
    { evento: 'Cliente insatisfeito no CRM (nota até 6)', quem: 'Admins, Devs e Pós-Vendas (filtra "Feedbacks")', respeita: true },
    { evento: 'Artigo da Base de conhecimento para aprovar', quem: 'Responsável do módulo (filtra "Conhecimento")', respeita: true },
    { evento: 'Comissão para autorizar / devolvida / autorizada', quem: 'Diretores; depois quem pediu', respeita: false },
    { evento: 'Alguém criou um lembrete para você', quem: 'O destinatário do lembrete', respeita: false },
  ] },
  { id: 'agenda', app: 'Agenda', ic: 'fa-calendar', tipos: ['agenda'], modulo: null, eventos: [
    { evento: 'Convite, mudança de horário, resposta, cancelamento de compromisso', quem: 'Convidados / criador (menos quem fez)', respeita: false },
  ] },
  { id: 'opa', app: 'Opa (Ocorrências)', ic: 'fa-circle-exclamation', tipos: ['opa'], modulo: null, eventos: [
    { evento: 'Opa novo', quem: 'TODOS os usuários do portal (menos quem criou)', respeita: false },
  ] },
  { id: 'clientes', app: 'Clientes', ic: 'fa-address-book', tipos: ['clientes'], modulo: null, eventos: [
    { evento: 'Cliente editado no Omie', quem: 'Só Admins', respeita: false },
    { evento: 'Relatório semanal de faturados sem NF pronto', quem: 'Admins, Devs e módulo Clientes', respeita: false },
  ] },
  { id: 'robos', app: 'Robôs e agendamentos', ic: 'fa-robot', tipos: ['agendamentos', 'ajustes'], modulo: null, eventos: [
    { evento: 'Agendamento falhou 2 vezes; Omie bloqueada há 30 min; robô parado', quem: 'Devs / Admins (1 vez por dia)', respeita: false },
    { evento: 'Remessas devolvidas em lote', quem: 'Só Admins', respeita: false },
  ] },
]
