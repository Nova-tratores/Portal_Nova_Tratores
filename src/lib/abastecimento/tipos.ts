// Tipos compartilhados do módulo Abastecimento (parser, API routes e página).

// Uma linha do CSV já parseada/normalizada — espelha a tabela `abastecimentos`
// (sem id/lote_id/created_at, que o banco preenche).
export interface LinhaAbastecimento {
  placa: string; // normalizada: maiúscula, sem hífen/espaço
  id_placa: number | null; // Placas.IdPlaca (resolvido no upload)
  filial_cnpj: string | null;
  filial_nome: string | null;
  modelo_veiculo: string | null;
  nome_veiculo: string | null;
  tipo_frota: string | null;
  departamento: string | null; // "Centro de custo veículo" (COMERCIAL/OFICINA/...)
  motorista_cpf: string | null;
  motorista_nome: string | null;
  data_transacao: string; // ISO com offset -03:00
  data_postagem: string | null;
  autorizacao: string | null;
  nota_fiscal: string | null;
  posto_cnpj: string | null;
  posto_nome: string | null;
  posto_bandeira: string | null;
  posto_uf: string | null;
  posto_cidade: string | null;
  combustivel: string | null;
  litros: number;
  valor_unitario: number | null;
  valor_original: number | null;
  valor_total: number | null;
  valor_economizado: number | null;
  hodometro_anterior: number | null;
  hodometro: number | null;
  horimetro_anterior: number | null;
  horimetro: number | null;
  desvio_descricao: string | null;
  ordem_servico: string | null; // digitada pelo motorista ('0'/vazio = null)
  capacidade_tanque: number | null; // litros
}

export interface ErroLinha {
  linha: number; // nº da linha no arquivo (1 = cabeçalho)
  motivo: string;
}

export interface ResultadoParse {
  linhas: LinhaAbastecimento[];
  erros: ErroLinha[];
  duplicadasArquivo: number; // repetidas dentro do próprio CSV
}

export interface LoteResumo {
  id: number;
  arquivo_nome: string;
  enviado_por: string;
  total_linhas: number;
  novos: number;
  duplicados: number;
  erros: number;
  periodo_min: string | null;
  periodo_max: string | null;
  created_at: string;
}

export interface ResultadoUpload {
  lote: { id: number; arquivo_nome: string; created_at: string };
  totalLinhas: number;
  novos: number;
  duplicados: number;
  erros: ErroLinha[];
  placasDesconhecidas: { placa: string; ocorrencias: number }[];
}

// ----- Transações (tabela de últimos abastecimentos + drill-down) -----

export interface TransacaoRow {
  id: number;
  data_transacao: string;
  placa: string;
  modelo_veiculo: string | null;
  departamento: string | null;
  filial_nome: string | null;
  motorista_nome: string | null;
  posto_nome: string | null;
  combustivel: string | null;
  litros: number;
  valor_unitario: number | null;
  valor_total: number | null;
  hodometro: number | null;
  ordem_servico: string | null;
  // Fonte da linha: CSV do cartão-frota ou requisição de abastecimento
  // (Veicular/Trator/Quadri). Ausente = cartão (linhas antigas em cache).
  origem?: 'cartao' | 'requisicao';
  req_id?: number | null; // id da Requisicao (p/ linkar o card)
  req_tipo?: string | null;
}

export interface TransacoesResp {
  linhas: TransacaoRow[];
  total: number; // total de registros no filtro (para paginação)
  somaValor: number;
  somaLitros: number;
}

// ----- Dashboard -----

export interface TotaisDash {
  litros: number;
  valor: number;
  transacoes: number;
  veiculos: number;
  precoMedioLitro: number;
  varMesAnterior: number | null; // % do último mês da janela vs mês anterior
}

export interface EvolucaoMes {
  mes: string; // 'YYYY-MM'
  litros: number;
  valor: number;
  valorAnoAnterior: number | null; // mesmo mês do ano passado
  litrosAnoAnterior: number | null;
  varMes: number | null; // % vs mês anterior
  varAno: number | null; // % vs mesmo mês do ano passado
}

// Linha pivotada por mês: { mes: '2026-06', 'Diesel S50': 6.49, 'Etanol': 3.99 }
export type SerieMensalPorCombustivel = { mes: string } & Record<string, number | string | null>;

export interface RankingItem {
  chave: string; // placa / motorista / posto
  detalhe: string | null; // modelo / cidade...
  litros: number;
  valor: number;
  transacoes: number;
}

export interface CombustivelItem {
  combustivel: string;
  litros: number;
  valor: number;
  precoMedio: number;
}

export interface ConsumoVeiculo {
  placa: string;
  modelo: string | null;
  kmRodado: number;
  litrosConsiderados: number;
  valorConsiderado: number;
  kmPorLitro: number;
  custoPorKm: number; // R$/km — eficiência + preço numa métrica só
  trechos: number;
  trechosDescartados: number;
}

export interface AnomaliaConsumo {
  placa: string;
  modelo: string | null;
  kmlMedio: number; // média histórica (todos os trechos menos o último)
  kmlRecente: number; // último trecho
  desvios: number; // quantos desvios-padrão abaixo da média
  trechos: number;
}

export interface IntervaloPonto {
  placa: string;
  data: string;
  horas: number; // desde o abastecimento anterior do mesmo veículo
  litros: number;
  capacidade: number | null;
  suspeito: boolean; // intervalo curto com volume alto, ou litros > capacidade
  motivo: string | null;
}

export interface HeatmapCelula {
  dia: number; // 0=domingo ... 6=sábado (horário de Brasília)
  hora: number; // 0-23
  qtd: number;
  valor: number;
}

export interface AbcItem {
  placa: string;
  modelo: string | null;
  valor: number;
  pct: number; // % do total
  pctAcum: number;
  classe: 'A' | 'B' | 'C';
}

export interface OsGasto {
  os: string;
  valor: number;
  litros: number;
  transacoes: number;
  placas: string[];
}

// Série mensal por veículo (comparativo entre veículos ao longo dos meses).
export interface VeiculoMes {
  placa: string;
  mes: string; // 'YYYY-MM'
  litros: number;
  valor: number;
  kml: number | null; // km/l dos trechos fechados no mês (null = sem trecho válido)
}

export interface ProjecaoMes {
  mes: string; // mês corrente
  realizado: number;
  projetado: number;
  diasCorridos: number;
  diasMes: number;
}

export interface DashboardAbastecimento {
  periodo: { de: string; ate: string };
  totais: TotaisDash;
  evolucaoMensal: EvolucaoMes[];
  combustiveis: string[]; // ordenados por litros desc (ordem fixa das séries)
  precoMensal: SerieMensalPorCombustivel[]; // preço médio/L por mês e combustível
  gastoMensalCombustivel: SerieMensalPorCombustivel[]; // R$ por mês empilhado por combustível
  porVeiculo: RankingItem[];
  porMotorista: RankingItem[];
  porPosto: RankingItem[];
  porDepartamento: RankingItem[];
  porCombustivel: CombustivelItem[];
  consumo: ConsumoVeiculo[];
  anomalias: AnomaliaConsumo[];
  intervalos: IntervaloPonto[];
  heatmap: HeatmapCelula[];
  abc: AbcItem[];
  porOS: OsGasto[];
  porVeiculoMes: VeiculoMes[];
  projecao: ProjecaoMes | null;
  opcoesFiltro: {
    filiais: string[];
    placas: string[];
    veiculos: { placa: string; modelo: string | null }[]; // p/ selects "Modelo · Placa"
    motoristas: string[];
    departamentos: string[];
  };
}
