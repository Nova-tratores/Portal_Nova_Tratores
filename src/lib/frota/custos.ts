// TCO da frota — quanto cada veículo CUSTA por km rodado. Função PURA: recebe
// o que a rota /api/frota/custos leu e monta uma linha por veículo.
//
//  - custos: vw_frota_custos (combustível + manutenção + multas + requisições
//    no financeiro; cada real conta UMA vez — a view resolve o anti-duplo-conto)
//  - km: frota_dias (hodômetro do rastreador > km haversine). Sem rastreador,
//    o km vem do delta máx−mín do hodômetro DIGITADO nos abastecimentos do
//    cartão e nas requisições veiculares no período.
// Os "baldes" avulsos (CLI0002 clientes / TRA0001 tratores / 0000000
// quadriciclos) viram linha separada: o cartão pagou, mas não são carros.
import { PLACAS_AVULSAS, resolverPlaca } from '@/lib/frota/placa';

export interface LinhaTco {
  veiculo_id: string;
  placa: string;
  modelo: string | null;
  tem_rastreador: boolean;
  avulso: boolean;
  ativo: boolean;
  status: string | null;
  categoria: string | null; // departamento (comercial / oficina / outros)
  km: number;
  // 'rastreador' = frota_dias; 'digitado' = delta do hodômetro informado nos
  // abastecimentos do cartão e nas requisições (carros SEM rastreador)
  km_fonte: 'rastreador' | 'digitado' | null;
  combustivel: number;
  manutencao: number;
  multas: number;
  outros: number;
  total: number;
}

export interface EntradaCusto {
  veiculo_id: string;
  data: string;
  tipo: string;
  valor: number;
  fonte: string | null;
  descricao?: string | null; // título da requisição / posto do abastecimento / etc.
  ref_id?: string | null;    // id na fonte (só requisição por ora) — vira link
}

export interface VeiculoTco {
  id: string; placa: string; modelo: string | null; descricao: string | null; marca: string | null;
  tem_rastreador: boolean | null; tipo_registro: string | null; ativo: boolean | null;
  status: string | null; supa_placa_id: number | string | null; categoria: string | null;
}

export interface EntradaTco {
  veiculos: VeiculoTco[];
  custos: EntradaCusto[];
  dias: { veiculo_id: string; km_total: number | null; km_odometro: number | null }[];
  hodAbastecimentos: { placa: string | null; hodometro: unknown }[];
  hodRequisicoes: { veiculo: number | string | null; hodometro: unknown }[];
}

/** Abaixo disso o R$/km é divisão mentirosa — a tela mostra travessão. */
export const KM_MINIMO_RKM = 50;
/** Delta de hodômetro digitado acima disso é erro de digitação, não km rodado. */
export const DELTA_MAXIMO_KM = 150_000;

// hodômetro digitado vem em TEXTO nos formatos misturados ("353.602", "436473")
// — hodômetro é inteiro, então só os dígitos interessam
export function parseHodometro(v: unknown): number | null {
  const n = Number(String(v ?? '').replace(/\D/g, ''));
  return Number.isFinite(n) && n > 100 && n < 2_000_000 ? n : null;
}

export function custoPorKm(l: Pick<LinhaTco, 'total' | 'km'>): number | null {
  return l.km >= KM_MINIMO_RKM ? l.total / l.km : null;
}

export function montarTco(e: EntradaTco): LinhaTco[] {
  const porVeiculo = new Map<string, LinhaTco>();
  const porPlaca = new Map<string, string>();      // placa -> veiculo_id
  const porSupaId = new Map<string, string>();     // SupaPlacas.IdPlaca -> veiculo_id
  for (const v of e.veiculos) {
    porVeiculo.set(v.id, {
      veiculo_id: v.id,
      placa: v.placa,
      modelo: PLACAS_AVULSAS[v.placa] || [v.marca, v.modelo || v.descricao].filter(Boolean).join(' ') || null,
      tem_rastreador: !!v.tem_rastreador,
      avulso: v.tipo_registro !== 'veiculo',
      ativo: !!v.ativo,
      status: v.status || null,
      categoria: v.categoria || null,
      km: 0, km_fonte: null, combustivel: 0, manutencao: 0, multas: 0, outros: 0, total: 0,
    });
    porPlaca.set(v.placa, v.id);
    if (v.supa_placa_id != null) porSupaId.set(String(v.supa_placa_id), v.id);
  }

  // hodômetros digitados por veículo (cartão + requisição)
  const hodometros = new Map<string, number[]>();
  const anotarHod = (veiculoId: string | undefined, valor: unknown) => {
    if (!veiculoId) return;
    const h = parseHodometro(valor);
    if (h == null) return;
    const l = hodometros.get(veiculoId) || [];
    l.push(h);
    hodometros.set(veiculoId, l);
  };
  for (const a of e.hodAbastecimentos) anotarHod(porPlaca.get(resolverPlaca(a.placa)), a.hodometro);
  for (const r of e.hodRequisicoes) anotarHod(porSupaId.get(String(r.veiculo ?? '')), r.hodometro);

  for (const c of e.custos) {
    const l = porVeiculo.get(c.veiculo_id);
    if (!l) continue;
    const valor = Number(c.valor) || 0;
    const tipo = String(c.tipo || '').toLowerCase();
    if (tipo.includes('combust')) l.combustivel += valor;
    else if (tipo.includes('manut')) l.manutencao += valor;
    else if (tipo.includes('multa')) l.multas += valor;
    else l.outros += valor;
    l.total += valor;
  }
  for (const d of e.dias) {
    const l = porVeiculo.get(d.veiculo_id);
    if (l) {
      l.km += Number(d.km_odometro ?? d.km_total) || 0;
      if (l.km > 0) l.km_fonte = 'rastreador';
    }
  }
  // sem rastreador (ou sem dias fechados): km = delta do hodômetro digitado
  for (const l of porVeiculo.values()) {
    if (l.km > 0) continue;
    const hs = hodometros.get(l.veiculo_id) || [];
    if (hs.length < 2) continue;
    const delta = Math.max(...hs) - Math.min(...hs);
    if (delta > 0 && delta < DELTA_MAXIMO_KM) {
      l.km = delta;
      l.km_fonte = 'digitado';
    }
  }

  return [...porVeiculo.values()]
    .filter((l) => l.total > 0 || l.km > 0)
    .sort((a, b) => b.total - a.total);
}
