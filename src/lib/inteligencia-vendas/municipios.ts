// =============================================================================
// INTELIGÊNCIA DE VENDAS — "em quais municípios concentrar a venda de cada
// máquina?" (ideias 2, 11 e 13). Lib PURA.
//
// Junta, por código IBGE:
//   IBGE PAM 2025 ......... área plantada por cultura + valor da produção
//   IBGE PPM 2025 ......... rebanho bovino
//   CAR + SICOR (agro_*) .. imóveis rurais, área útil, crédito rural 12/36 m
//   nossa base ............ clientes, tratores vendidos, propostas, peças
// e dá um score de FOCO = potencial alto + pouca presença nossa.
// =============================================================================
import type { ClienteIV } from './tipos';

export interface CulturaArea { nome: string; ha: number }

export interface DadosPublicos {
  culturas: CulturaArea[];
  valorProducaoMil: number | null;
  bovinos: number | null;
  ano: string;
}

export interface DadosAgro {
  imoveis: number;
  areaUtilHa: number;
  credito12m: number;
  credito36m: number;
  invest36m: number;
  imoveisComCredito: number;
}

export interface MunicipioIV {
  ibge: number;
  nome: string;
  uf: string;
  daLoja: boolean; // está na lista de municípios atendidos pela NOVA
  // públicos
  areaPlantadaHa: number;
  culturas: CulturaArea[];
  culturaPrincipal: string;
  valorProducaoMil: number | null;
  bovinos: number | null;
  // agro
  imoveis: number | null;
  areaUtilHa: number | null;
  credito12m: number | null;
  credito36m: number | null;
  invest36m: number | null;
  imoveisComCredito: number | null;
  // nós
  clientes: number;
  clientesAtivos: number;
  tratoresVendidos: number;
  clientesComTrator: number;
  propostasAbertas: number;
  pecas12m: number;
  oportunidades: number;
  // conclusão
  penetracao: number | null; // clientes com trator / imóveis do CAR
  foco: number; // 0..100
  linhas: string[];
  /** [lat, lng] do centro (polígonos do CAR), quando o município está no Agro */
  centro?: [number, number] | null;
}

/** Linha de máquinas que combina com a cultura dominante (texto pro vendedor). */
export function linhasParaCulturas(culturas: CulturaArea[], bovinos: number | null): string[] {
  const total = culturas.reduce((s, c) => s + c.ha, 0) || 1;
  const pct = (re: RegExp) => culturas.filter((c) => re.test(semAcento(c.nome))).reduce((s, c) => s + c.ha, 0) / total;
  const out: string[] = [];
  if (pct(/soja|milho|trigo|feijao|sorgo|aveia|amendoim/) >= 0.3) out.push('Plantadeira e pulverizador (grãos)');
  if (pct(/cana/) >= 0.2) out.push('Trator de alta potência e carreta (cana)');
  if (pct(/cafe|laranja|limao|tangerina|abacate|manga|uva|banana/) >= 0.1) out.push('Trator estreito/fruteiro e pulverizador (perenes)');
  if ((bovinos || 0) >= 20000) out.push('Vagão misturador, roçadeira e forrageira (pecuária)');
  if (out.length === 0) out.push('Trator de uso geral e implementos de preparo');
  return out;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface EntradaMunicipios {
  municipios: { ibge: number; nome: string; uf: string; daLoja: boolean }[];
  publicos: Map<number, DadosPublicos>;
  agro: Map<number, DadosAgro>;
  clientes: ClienteIV[];
  /** 'piraju|SP' → IBGE */
  ibgeDaCidade: (chaveCidade: string) => number | null;
}

export function montarMunicipios(e: EntradaMunicipios): MunicipioIV[] {
  const linhas = new Map<number, MunicipioIV>();
  for (const m of e.municipios) {
    const pub = e.publicos.get(m.ibge);
    const ag = e.agro.get(m.ibge);
    const culturas = (pub?.culturas || []).filter((c) => c.ha > 0 && !/total/i.test(c.nome)).sort((a, b) => b.ha - a.ha);
    linhas.set(m.ibge, {
      ibge: m.ibge, nome: m.nome, uf: m.uf, daLoja: m.daLoja,
      areaPlantadaHa: culturas.reduce((s, c) => s + c.ha, 0),
      culturas,
      culturaPrincipal: culturas[0]?.nome || '',
      valorProducaoMil: pub?.valorProducaoMil ?? null,
      bovinos: pub?.bovinos ?? null,
      imoveis: ag?.imoveis ?? null,
      areaUtilHa: ag?.areaUtilHa ?? null,
      credito12m: ag?.credito12m ?? null,
      credito36m: ag?.credito36m ?? null,
      invest36m: ag?.invest36m ?? null,
      imoveisComCredito: ag?.imoveisComCredito ?? null,
      clientes: 0, clientesAtivos: 0, tratoresVendidos: 0, clientesComTrator: 0, propostasAbertas: 0, pecas12m: 0, oportunidades: 0,
      penetracao: null, foco: 0, linhas: linhasParaCulturas(culturas, pub?.bovinos ?? null),
    });
  }

  for (const c of e.clientes) {
    const ibge = e.ibgeDaCidade(c.chaveCidade);
    const l = ibge != null ? linhas.get(ibge) : undefined;
    if (!l) continue;
    l.clientes++;
    if (c.pecas12m > 0 || c.os12m > 0) l.clientesAtivos++;
    l.tratoresVendidos += c.qtdTratores;
    if (c.qtdTratores > 0) l.clientesComTrator++;
    l.propostasAbertas += c.propostasAbertas;
    l.pecas12m += c.pecas12m;
    if (c.oportunidades.length > 0) l.oportunidades++;
  }

  const lista = [...linhas.values()];
  const max = (f: (m: MunicipioIV) => number) => Math.max(1, ...lista.map(f));
  const mArea = max((m) => m.areaPlantadaHa);
  const mBov = max((m) => m.bovinos || 0);
  const mInv = max((m) => m.invest36m || 0);
  for (const m of lista) {
    m.penetracao = m.imoveis ? Math.min(1, m.clientesComTrator / m.imoveis) : null;
    // penetração ≥ 5% dos imóveis já é presença forte pra uma revenda: escala até lá
    const espaco = m.penetracao == null ? 0.5 : 1 - Math.min(1, m.penetracao / 0.05);
    const potencial = 0.5 * (m.areaPlantadaHa / mArea) + 0.15 * ((m.bovinos || 0) / mBov) + 0.35 * ((m.invest36m || 0) / mInv);
    m.foco = Math.round(100 * (0.65 * potencial + 0.35 * espaco));
  }
  return lista.sort((a, b) => b.foco - a.foco);
}
