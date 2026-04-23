export interface OrdemServico {
  Id_Ordem: string;
  Status: string;
  Data: string;
  Os_Cliente: string;
  Cnpj_Cliente: string;
  Endereco_Cliente: string;
  Os_Tecnico: string;
  Os_Tecnico2: string;
  Tipo_Servico: string;
  Revisao: string;
  Projeto: string;
  Serv_Solicitado: string;
  Serv_Realizado: string | null;
  Qtd_HR: number;
  Valor_HR: number;
  Qtd_KM: number;
  Valor_KM: number;
  Valor_Total: number;
  ID_PPV: string;
  Id_Req: string;
  ID_Relatorio_Final: string;
  Ordem_Omie: string;
  Motivo_Cancelamento: string;
  Desconto: number;
  Previsao_Execucao: string | null;
  Previsao_Faturamento: string | null;
}

export interface ReqResumo {
  id: string;
  titulo: string;
  valor: number;
}

export interface PendenciaMahindra {
  motivo: string;
  detalhes: string[];
  chassis?: string;
}

export interface KanbanCard {
  id: string;
  cliente: string;
  tecnico: string;
  data: string;
  dataFase: string;
  valor: string;
  status: string;
  temPPV: boolean;
  ppvId: string;
  temReq: boolean;
  temRel: boolean;
  servSolicitado: string;
  previsaoExecucao: string;
  previsaoFaturamento: string;
  diasAtraso: number;
  ultimaAcao: string;
  ultimoUsuario: string;
  ultimaData: string;
  reqInfo: ReqResumo[];
  relTecnico: string;
  pendenciaMahindra?: PendenciaMahindra | null;
}

export interface ClienteOption {
  chave: string;
  display: string;
}

export interface ClienteDados {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  endereco: string;
  cidade?: string;
}

export interface Produto {
  descricao: string;
  qtde: number;
  valor: number;
}

export interface LogEntry {
  data: string;
  acao: string;
  usuario: string;
  extra: string;
}

export interface ProjetoResult {
  nome: string;
}

export interface RevisaoResult {
  id: string;
  descricao: string;
}

export interface TotaisCalculados {
  total: number;
  subtotal: number;
  vHoras: number;
  vKm: number;
  vPecas: number;
  vReq: number;
  vHorasRaw: number;
  vKmRaw: number;
  vPecasRaw: number;
}

export interface OSFormData {
  id?: string;
  nomeCliente: string;
  cpfCliente: string;
  enderecoCliente: string;
  cidadeCliente?: string;
  tecnicoResponsavel: string;
  tecnico2: string;
  tipoServico: string;
  revisao: string;
  projeto: string;
  servicoSolicitado: string;
  qtdHoras: number;
  qtdKm: number;
  ppv: string;
  status: string;
  ordemOmie: string;
  motivoCancelamento: string;
  descontoValor: number;
  relatorioTecnico?: string;
  previsaoExecucao: string;
  previsaoFaturamento: string;
}

export interface RequisicaoInfo {
  id: string;
  atualizada: boolean;
  valor: number;
  linkNota: string;
  material: string;
  solicitante: string;
}

export interface OSDetalhes extends OSFormData {
  infoRelatorio: { status: string; link: string } | null;
  infoRequisicoes: RequisicaoInfo[];
  descontoSalvo: number;
}
