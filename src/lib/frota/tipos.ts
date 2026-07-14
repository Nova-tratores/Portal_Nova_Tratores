// Tipos do módulo Frota (lado do cliente e das rotas /api/frota).

export interface FrotaVeiculo {
  id: string;
  placa: string;
  placa_exibicao: string | null;
  tipo_registro: 'veiculo' | 'avulso';
  adesao_id: number | null;
  id_placa: number | null;
  supa_placa_id: number | null;
  pendencia_vinculo: boolean;
  tem_rastreador: boolean;
  marca: string | null;
  modelo: string | null;
  descricao: string | null;
  ano: number | null;
  ano_modelo: number | null;
  cor: string | null;
  chassi: string | null;
  renavam: string | null;
  tipo_veiculo: string | null;
  combustivel: string | null;
  capacidade_tanque: number | null;
  custo_km_ref: number | null;
  categoria: string;
  setor: string | null;
  ativo: boolean;
  status: 'ativo' | 'manutencao' | 'parado' | 'vendido' | 'locado';
  observacoes: string | null;
  id_projeto_omie: number | null;
  id_projeto_omie_castro: number | null;
  numero_apolice: string | null;
  seguradora: string | null;
  dt_aquisicao: string | null;
  tipo_negociacao: string | null;
  campos_manuais: string[];
  ausente_na_origem: boolean;
  visto_em: string | null;
}

export interface VeiculoLista extends FrotaVeiculo {
  imagem_url: string | null;        // vem de Placas via id_placa
  responsavel_nome: string | null;  // frota_responsaveis com fim IS NULL
  multas_abertas: number;
  valor_multas_abertas: number;
}

export interface Responsavel {
  id: string;
  motorista_id: string | null;
  motorista_nome: string | null;
  inicio: string;
  fim: string | null;
  origem: string;
  obs: string | null;
}

export interface Motorista {
  id: string;
  re_id: number | null;
  nome: string;
  cargo: string | null;
  cpf: string | null;
  cnh: string | null;
  cnh_validade: string | null;
  ativo: boolean;
  e_motorista: boolean;
}

export interface Multa {
  id: string;
  placa: string;
  veiculo_id: string | null;
  numero_auto: string | null;
  descricao: string | null;
  nivel_infracao: string | null;
  pontos: number | null;
  valor: number | null;
  dt_multa: string | null;
  dt_vencimento: string | null;
  dt_defesa: string | null;
  situacao: string | null;
  local_endereco: string | null;
  local_lat: number | null;
  local_lng: number | null;
  imagens: unknown[];
  motorista_nome: string | null;     // carimbado pela Rota Exata
  motorista_divergente: boolean;
  status_interno: 'nova' | 'em_analise' | 'em_defesa' | 'paga' | 'descontada' | 'arquivada';
  descontado_folha: boolean;
  desconto_competencia: string | null;
  obs_interna: string | null;
  // resolvido pelo servidor: quem estava COM o carro na data da infração
  // (uso diário vence; responsável fixo é o fallback; RE por último)
  atribuido_a: string | null;
  atribuido_fonte: 'uso_diario' | 'responsavel_fixo' | 'rotaexata' | null;
}

export interface ManutencaoView {
  id: string;
  veiculo_id: string | null;
  placa: string;
  origem: 'rotaexata' | 'manual' | 'requisicao';
  tipo: string | null;
  status: string | null;
  descricao: string | null;
  fornecedor: string | null;
  valor_total: number | null;
  data: string | null;
  hodometro: number | null;
}

export interface VeiculoDetalhe {
  veiculo: FrotaVeiculo;
  imagem_url: string | null;
  responsaveis: Responsavel[];
  multas: Multa[];
  manutencoes: ManutencaoView[];
  abastecimentos: {
    data_transacao: string;
    litros: number;
    valor_total: number;
    combustivel: string | null;
    posto_nome: string | null;
    hodometro: number | null;
    motorista_nome: string | null;
  }[];
  custos_12m: { tipo: string; total: number }[];
  km_odometro: number | null; // última leitura real do rastreador
}
