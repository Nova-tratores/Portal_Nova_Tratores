// =============================================================================
// INTELIGÊNCIA DE VENDAS — tipos compartilhados (cliente e servidor).
// =============================================================================

/** Linha crua das fontes (o servidor lê, as funções puras montam). */
export interface FonteCadastro {
  cod_cli: number | string;
  empresa: string; // 'Nova Tratores' | 'Castro Pecas'
  cnpj_cpf: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  inativo: string | null;
}

export interface FonteVendaItem {
  conta_omie: string; // 'NOVA' | 'CASTRO'
  codigo_cliente: string;
  familia: string | null;
  descricao: string | null;
  data_pedido: string | null;
  valor_total: number | null;
  numero_pedido: string | null;
}

export interface FonteTrator {
  Modelo: string | null;
  Chassis: string | null;
  Cliente: string | null;
  Cidade: string | null;
  Vendedor: string | null;
  Entrega: string | null;
}

export interface FonteProposta {
  id: number;
  Cliente: string | null;
  cliente_doc_norm: string | null;
  'Cpf/Cpnj'?: string | null;
  Cidade: string | null;
  Modelo: string | null;
  Marca: string | null;
  status: string | null;
  vendedor_nome: string | null;
  criado_em: string | null;
  status_desde: string | null;
  proximo_contato: string | null;
  previsao_fechamento: string | null;
  validade: string | null;
  Valor_Total: string | null;
  em_aberto: boolean | null;
  motivo_perda_id: number | null;
  concorrente: string | null;
  concorrente_valor: number | null;
  fechado_em: string | null;
  termometro: number | null;
}

export interface FonteOS {
  cod_cli: number | string;
  empresa: string;
  descricao: string | null;
  data_inclusao: string | null;
  cancelada: boolean | null;
}

export interface FontePropriedade {
  id: number;
  id_omie: number | null;
  cnpj_cpf: string | null;
  area_hectares: number | null;
  culturas: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
}

export interface FonteVisita {
  vendedor_id: number | null;
  propriedade_id: number | null;
  data_visita: string | null;
  data_proximo_contato: string | null;
  proximos_passos: string | null;
}

export interface FonteCnpj {
  cnpj: string;
  cnae_codigo: string | null;
  cnae_descricao: string | null;
  data_inicio: string | null;
  porte: string | null;
  situacao: string | null;
}

/** Máquina que o cliente comprou conosco (Omie desde 11/2022 + controle de revisões). */
export interface MaquinaComprada {
  tipo: 'trator' | 'implemento' | 'outro';
  familia: string;
  modelo: string;
  data: string; // ISO
  valor: number | null;
  origem: 'omie' | 'revisoes';
}

export interface ClienteIV {
  /** Documento só dígitos; sem documento = 'cod:<empresa>:<cod>' */
  chave: string;
  doc: string;
  nome: string;
  cidade: string; // como veio do cadastro
  chaveCidade: string; // 'piraju|SP'
  uf: string;
  telefone: string;
  lojas: string[]; // NOVA / CASTRO
  codigos: { empresa: string; cod: string }[];
  inativo: boolean;

  maquinas: MaquinaComprada[];
  ultimoTrator: MaquinaComprada | null;
  anosUltimoTrator: number | null;
  qtdTratores: number;
  qtdImplementos: number;
  valorMaquinas: number;

  pecas12m: number;
  pedidosPecas12m: number;
  pecas12a24m: number;
  pedidosPecas12a24m: number;
  ultimaCompraPecas: string;

  os12m: number;
  ultimaOS: string;
  marcasNaOficina: string[]; // marcas ≠ Mahindra citadas nas OS
  maiorHorimetro: number | null;

  propostasAbertas: number;
  propostasGanhas: number;
  propostasPerdidas: number;
  ultimaProposta: string;
  ultimaPerdida: { data: string; modelo: string; marca: string } | null;
  valorPropostasAbertas: number;

  areaHa: number | null;
  /** posição da propriedade (GPS do CRM), quando houver */
  local: [number, number] | null;
  culturas: string[];
  ultimaVisita: string;
  visitas: number;
  vendedor: string;

  cnae: string;
  cnaeDescricao: string;
  abertura: string;
  porte: string;

  oportunidades: Oportunidade[];
  score: number;
}

export type RegraId =
  | 'renovacao'
  | 'cruzada'
  | 'outra_marca'
  | 'reabordar'
  | 'proposta_parada'
  | 'sumiu'
  | 'sem_visita'
  | 'perfil'
  | 'prestador';

export interface Oportunidade {
  regra: RegraId;
  titulo: string;
  porque: string;
  oferecer: string;
  peso: number;
}
