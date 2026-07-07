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

// ----- Dashboard -----

export interface TotaisDash {
  litros: number;
  valor: number;
  transacoes: number;
  veiculos: number;
  precoMedioLitro: number;
}

export interface EvolucaoMes {
  mes: string; // 'YYYY-MM'
  litros: number;
  valor: number;
}

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
  kmPorLitro: number;
  trechos: number;
  trechosDescartados: number;
}

export interface DashboardAbastecimento {
  periodo: { de: string; ate: string };
  totais: TotaisDash;
  evolucaoMensal: EvolucaoMes[];
  porVeiculo: RankingItem[];
  porMotorista: RankingItem[];
  porPosto: RankingItem[];
  porCombustivel: CombustivelItem[];
  consumo: ConsumoVeiculo[];
  opcoesFiltro: { filiais: string[]; placas: string[] };
}
