import { supabaseVE } from "./supabase";
import { autoDistribuir } from "./data";

// Gestão de frota de veículos (tabela `Placas`). Porta a rota /frota do app
// legado: lê Placas, separa tipo da placa pelo `NumPlaca`, agrupa por ambiente,
// distribui posições e calcula IPVA/seguro/custo de oportunidade.

// Selic anual fixa usada no "custo de oportunidade" da frota (fiel ao legado).
// TODO: poderia usar a Selic real de ./selic.ts.
export const SELIC_ANUAL = 0.1475;

export const FROTA_AMBIENTES = ["garagem", "campo", "manutencao", "fartura", "barracao"] as const;
export type FrotaAmbiente = (typeof FROTA_AMBIENTES)[number];

export interface VeiculoVE {
  id: number;
  placa: string;
  descricao: string; // NumPlaca completo
  tipo_veiculo: string;
  frota_tipo: string;
  modelo: string;
  ano: number | null;
  hodometro: number | null;
  ativo: boolean;
  combustivel: string;
  tem_seguro: boolean;
  valor_mercado: number;
  data_valor: string | null;
  ipva_estimado: number;
  seguro_estimado: number;
  imagem_url: string;
  img_tamanho: number;
  ambiente: string;
  pos_x: number;
  pos_y: number;
}

export interface FrotaResumo {
  totalVeiculos: number;
  valorFipe: number;
  totalIpva: number;
  totalSeguro: number;
  custoAnual: number;
  custoOportunidade: number;
}

export interface FrotaData {
  ambientes: Record<string, VeiculoVE[]>;
  inativos: VeiculoVE[];
  veiculos: VeiculoVE[];
  resumo: FrotaResumo;
}

// IPVA SP (porta server.js ~518-528): isento >= 20 anos; alíquota base 0.04,
// caminhão 0.015, elétrico/híbrido 0.03.
export function calcularIpva(valor: number, ano: number | null, tipoVeiculo: string, combustivel: string): number {
  const anoAtual = new Date().getFullYear();
  if (ano && ano > 0 && anoAtual - ano >= 20) return 0;
  const tipo = (tipoVeiculo || "").toUpperCase();
  let aliq = 0.04;
  if (tipo.includes("CAMINHAO") || tipo.includes("CAMINHÃO")) aliq = 0.015;
  if (combustivel === "eletrico" || combustivel === "hibrido") aliq = 0.03;
  return valor * aliq;
}

export function calcularSeguro(valor: number, temSeguro: boolean): number {
  return temSeguro ? valor * 0.05 : 0;
}

function mapearPlaca(p: any): VeiculoVE {
  const partes = String(p.NumPlaca || "").split(/[-–]/);
  const tipoVeiculo = (partes[0] || "").trim();
  const placa = (partes[1] || "").trim();
  const valorMercado = Number(p.valor_mercado) || 0;
  const ano = p.ano || null;
  const combustivel = p.combustivel || "flex";
  const temSeguro = p.tem_seguro !== false;
  return {
    id: p.IdPlaca,
    placa,
    descricao: p.NumPlaca || "",
    tipo_veiculo: tipoVeiculo,
    frota_tipo: p.frota_tipo || "Outros",
    modelo: p.modelo || "",
    ano,
    hodometro: p.hodometro ?? null,
    ativo: p.ativo !== false,
    combustivel,
    tem_seguro: temSeguro,
    valor_mercado: valorMercado,
    data_valor: p.data_valor || null,
    ipva_estimado: calcularIpva(valorMercado, ano, tipoVeiculo, combustivel),
    seguro_estimado: calcularSeguro(valorMercado, temSeguro),
    imagem_url: p.imagem_url || "",
    img_tamanho: p.img_tamanho || 80,
    ambiente: p.ambiente || "garagem",
    pos_x: p.pos_x || 0,
    pos_y: p.pos_y || 0,
  };
}

export async function buscarFrota(): Promise<FrotaData> {
  const { data: placas } = await supabaseVE.from("Placas").select("*").order("IdPlaca");
  const veiculos = (placas || []).map(mapearPlaca);

  const ativos = veiculos.filter((v) => v.ativo);
  const inativos = veiculos.filter((v) => !v.ativo);

  const ambientes: Record<string, VeiculoVE[]> = {
    garagem: [], campo: [], manutencao: [], fartura: [], barracao: [],
  };
  for (const v of ativos) {
    const amb = v.ambiente && ambientes[v.ambiente] ? v.ambiente : "garagem";
    ambientes[amb].push(v);
  }
  for (const amb of Object.keys(ambientes)) autoDistribuir(ambientes[amb]);

  let valorFipe = 0, totalIpva = 0, totalSeguro = 0;
  for (const v of ativos) {
    valorFipe += v.valor_mercado;
    totalIpva += v.ipva_estimado;
    totalSeguro += v.seguro_estimado;
  }

  const resumo: FrotaResumo = {
    totalVeiculos: ativos.length,
    valorFipe,
    totalIpva,
    totalSeguro,
    custoAnual: totalIpva + totalSeguro,
    custoOportunidade: valorFipe * SELIC_ANUAL,
  };

  return { ambientes, inativos, veiculos, resumo };
}
