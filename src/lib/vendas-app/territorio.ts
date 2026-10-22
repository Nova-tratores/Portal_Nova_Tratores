// Território gamificado do app de vendas: cada imóvel rural do CAR é uma
// "casa" do mapa. Cinza = bloqueado (nunca visitado); verde vai escurecendo
// conforme o contato esquenta; dourado = já comprou. Regras puras.

export type NivelTerritorio = 'bloqueado' | 'visitado' | 'conversa' | 'quente' | 'cliente';

export const NIVEIS_TERRITORIO: { key: NivelTerritorio; label: string; cor: string }[] = [
  { key: 'bloqueado', label: 'Bloqueado', cor: '#cbd5e1' },
  { key: 'visitado', label: 'Visitado', cor: '#bbf7d0' },
  { key: 'conversa', label: 'Em conversa', cor: '#4ade80' },
  { key: 'quente', label: 'Quente', cor: '#15803d' },
  { key: 'cliente', label: 'Comprou', cor: '#ca8a04' },
];

export interface VisitaCar { id: number; cod_car: string; dia: string; vendedor_id: number | null; propriedade_id: number | null }
export interface NegocioProp { propriedade_id: number; status: string; temperatura: string | null }

const FECHADOS_NEGATIVOS = new Set(['fechamento_negativo']);
const GANHOS = new Set(['fechamento_positivo', 'pre_entrega', 'entrega', 'pos_vendas']);

/**
 * Nível de um imóvel:
 *  cliente   — negócio ganho numa propriedade visitada ali
 *  quente    — negócio aberto com temperatura "quente"
 *  conversa  — negócio aberto (frio/morno) ou 2+ visitas
 *  visitado  — 1 visita
 *  bloqueado — nenhuma visita dentro do polígono
 */
export function nivelDoImovel(visitas: VisitaCar[], negocios: NegocioProp[]): NivelTerritorio {
  if (!visitas.length) return 'bloqueado';
  const props = new Set(visitas.map((v) => v.propriedade_id).filter((x): x is number => x != null));
  const negs = negocios.filter((n) => props.has(n.propriedade_id));
  if (negs.some((n) => GANHOS.has(n.status))) return 'cliente';
  const abertos = negs.filter((n) => !GANHOS.has(n.status) && !FECHADOS_NEGATIVOS.has(n.status));
  if (abertos.some((n) => n.temperatura === 'quente')) return 'quente';
  if (abertos.length || visitas.length >= 2) return 'conversa';
  return 'visitado';
}

export function resumoTerritorio(niveis: NivelTerritorio[], areas: number[] = []) {
  const contagem = Object.fromEntries(NIVEIS_TERRITORIO.map((n) => [n.key, 0])) as Record<NivelTerritorio, number>;
  let areaTotal = 0, areaDesbloqueada = 0;
  niveis.forEach((n, i) => {
    contagem[n]++;
    const a = Number(areas[i]) || 0;
    areaTotal += a;
    if (n !== 'bloqueado') areaDesbloqueada += a;
  });
  const total = niveis.length;
  const desbloqueados = total - contagem.bloqueado;
  return {
    total,
    desbloqueados,
    pct: total ? Math.round((desbloqueados / total) * 1000) / 10 : 0,
    contagem,
    areaTotalHa: Math.round(areaTotal),
    areaDesbloqueadaHa: Math.round(areaDesbloqueada),
  };
}

// ── Desenho leve para o celular ──────────────────────────────────────────────
type Anel = number[][];
type Geometria = { type: string; coordinates: unknown };

/**
 * Coordenadas com 5 casas (~1 m) e sem pontos repetidos em sequência: o
 * arquivo encolhe e o navegador desenha menos pontos. Devolve também o
 * contorno (bbox) do que veio, para o mapa enquadrar sem montar outra camada.
 */
export function geometriaLeve(g: Geometria, bbox: number[]): Geometria {
  const anel = (r: Anel): Anel => {
    const out: Anel = [];
    for (const [x, y] of r) {
      const p = [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5];
      const u = out[out.length - 1];
      if (!u || u[0] !== p[0] || u[1] !== p[1]) out.push(p);
      if (p[0] < bbox[0]) bbox[0] = p[0];
      if (p[1] < bbox[1]) bbox[1] = p[1];
      if (p[0] > bbox[2]) bbox[2] = p[0];
      if (p[1] > bbox[3]) bbox[3] = p[1];
    }
    return out;
  };
  if (g?.type === 'Polygon') return { type: g.type, coordinates: (g.coordinates as Anel[]).map(anel) };
  if (g?.type === 'MultiPolygon') return { type: g.type, coordinates: (g.coordinates as Anel[][]).map((p) => p.map(anel)) };
  return g;
}

export const bboxVazio = () => [Infinity, Infinity, -Infinity, -Infinity];
