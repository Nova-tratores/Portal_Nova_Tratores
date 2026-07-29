// Tipos do módulo Frota (lado do cliente e das rotas /api/frota).

// Subtipo do veículo (campo tipo_veiculo — a Rota Exata preenche "carro" pros
// rastreados; o resto é escolhido no cadastro/Ficha). Carretinha/reboque tem
// placa, CRLV e documentos como qualquer veículo — só não tem motor, então os
// blocos de rastreador/combustível degradam sozinhos.
export const SUBTIPOS_VEICULO: { valor: string; label: string }[] = [
  { valor: 'carro', label: 'Carro' },
  { valor: 'caminhonete', label: 'Caminhonete / SUV' },
  { valor: 'caminhao', label: 'Caminhão' },
  { valor: 'moto', label: 'Moto' },
  { valor: 'quadriciclo', label: 'Quadriciclo' },
  { valor: 'carretinha', label: 'Carretinha (reboque)' },
  { valor: 'outro', label: 'Outro' },
];

/** Rótulo do subtipo (aceita valores fora do catálogo, ex.: vindos da RE). */
export function labelSubtipo(v: string | null | undefined): string | null {
  if (!v) return null;
  return SUBTIPOS_VEICULO.find((s) => s.valor === v.toLowerCase())?.label || v;
}

/** Subtipos que ganham badge no card (os "diferentes" — carro é o default). */
export const SUBTIPOS_DESTAQUE = new Set(['carretinha', 'quadriciclo', 'moto', 'caminhao']);

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
  // proprietário LEGAL (documento/CRLV) — não confundir com o responsável do
  // dia a dia (frota_responsaveis). Campo manual: o sync nunca escreve aqui.
  proprietario: string | null;
  // acessórios instalados ("tunagem") — cada item entra no checklist pré-venda
  equipamentos: string[] | null;
  // "ano do documento" — exercício do CRLV/licenciamento (a leitura do CRLV preenche)
  exercicio_crlv: number | null;
  // código FIPE confirmado por humano — o cron mensal atualiza o valor por ele
  fipe_codigo: string | null;
  fipe_ano_codigo: string | null;
  // venda (status='vendido', ativo=false — o registro vira histórico)
  venda_data: string | null;
  venda_valor: number | null;
  venda_comprador: string | null;
  venda_obs: string | null;
  ativo: boolean;
  status: 'ativo' | 'manutencao' | 'parado' | 'vendido' | 'locado' | 'arquivado';
  // arquivamento (saída da frota sem venda — sucateado, devolvido, cadastro errado)
  arquivado_motivo: string | null;
  arquivado_em: string | null;
  observacoes: string | null;
  id_projeto_omie: number | null;
  id_projeto_omie_castro: number | null;
  numero_apolice: string | null;
  seguradora: string | null;
  senha_cartao_veloe: string | null;
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
  docs_vencendo: number; // vencidos ou vencendo em ≤30 dias
  pendencias: string[];  // 1+ = card VERMELHO (lib/frota/pendencias)
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

// ── Aba Motoristas (Frota ↔ RH) ──────────────────────────────────────────────
// Item da lista mesclada RH × frota_motoristas. O CPF cru NUNCA trafega —
// só a máscara. Salário nem existe no payload (o select do rh.ts é explícito).
export interface MotoristaRH {
  id: string | null; // frota_motoristas.id (null = funcionário do RH ainda sem linha local)
  rh_id: string | null; // rh_funcionarios.id (null = só existe no portal/Rota Exata)
  nome: string;
  cpf_mascarado: string | null;
  origem: 'ambos' | 'rh' | 'portal';
  // RH — só leitura (dono do cadastro é o RH)
  empresa: string | null; // NOVA | CASTRO
  cargo: string | null;
  departamento: string | null;
  status_rh: string | null; // ativo|ferias|afastado|inativo|demitido — null se fora do RH
  data_admissao: string | null;
  data_demissao: string | null;
  tipo_contrato: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  estado: string | null;
  foto_url: string | null; // assinada (TTL 1h) ou pública
  // Portal — editável (frota:motoristas:editar)
  e_motorista: boolean;
  gestor: boolean;
  ativo_portal: boolean;
  cnh: string | null;
  cnh_categoria: string | null;
  cnh_validade: string | null;
  // Derivados (lib pura motoristas.ts)
  situacao_cnh: 'ok' | 'vencendo' | 'vencida' | 'sem_validade' | 'sem_cnh';
  pendencias: string[]; // 1+ = card vermelho
  responsavel_por_veiculo: boolean;
  // multas EM ABERTO do motorista (mesma régua dos veículos: fora de
  // paga/descontada/arquivada), casadas por motorista_id e por CPF
  multas_abertas: number;
  valor_multas_abertas: number;
  pontos_multas_abertas: number;
}

// Ficha completa (drawer): RH menos salário + vínculos da frota.
export interface MotoristaDetalhe {
  motorista: MotoristaRH;
  rh: {
    rg: string | null;
    data_nascimento: string | null;
    sexo: string | null;
    estado_civil: string | null;
    endereco: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
    cep: string | null;
    atualizado_em: string | null;
  } | null;
  veiculos: { veiculo_id: string; placa: string; modelo: string | null; inicio: string; fim: string | null }[];
  multas: {
    id: string;
    placa: string;
    dt_multa: string | null;
    descricao: string | null;
    pontos: number | null;
    valor: number | null;
    status_interno: string | null;
  }[];
  multas_total: { qtd: number; valor: number; pontos: number };
  documentos_rh: { id: string; tipo: string; descricao: string | null; data_validade: string | null; url: string | null }[];
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
  // anexos do PORTAL (auto de infração, boleto, comprovante, defesa...)
  anexos: { url: string; nome: string; por: string | null; em: string }[] | null;
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
  // valor de mercado (FIPE) — vive em Placas (o DRE lê de lá); null sem id_placa
  fipe: { valor_mercado: number | null; data_valor: string | null } | null;
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
  km_odometro: number | null; // rastreador; sem rastreador, o digitado na bomba
  km_odometro_fonte: 'rastreador' | 'digitado' | null;
  documentos: {
    id: string;
    tipo: string;
    numero: string | null;
    emissor: string | null;
    vigencia_fim: string | null;
    arquivo_url: string | null;
    nome_arquivo: string | null;
  }[];
  uso_30d: {
    dias_com_uso: number;
    partidas: number;
    tempo_ligado_min: number;
    tempo_marcha_lenta_min: number;
    km: number;
    paradas_atipicas: number;
    ultimos_dias: {
      data: string;
      km_total: number;
      km_odometro: number | null;
      partidas: number;
      tempo_ligado_min: number;
      tempo_marcha_lenta_min: number;
      paradas_total: number;
      paradas_atipicas: number;
    }[];
  };
}
