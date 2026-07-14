// =============================================================================
// PARADAS — classifica cada parada do dia e decide o que é ATÍPICO.
//
// Filosofia: ABSOLVER antes de acusar. As geocercas não cobrem todos os
// clientes; classificar só por elas geraria tanto ruído que a tela de
// atípicas seria ignorada. Pipeline por parada:
//
//   1. geocerca (espelho de /destinos): loja | cliente | manutencao |
//      estacionamento | descarga | outro_destino
//   2. absolvições com dados do PORTAL:
//      - visita:        ≤2 km de uma visita comercial do dia (o cruzamento já
//                       vem pronto em RotaDia.visitas)
//      - abastecimento: um abastecimento da MESMA placa cujo horário cai em
//                       [inicio−20min, fim+20min] — casa por TEMPO porque o
//                       CSV do cartão não tem coordenada
//   3. sobrou -> fora_geocerca, atipica = true, com severidade:
//      nivel (baixa <15min · media <60min · alta ≥60min),
//      fora_horario (antes das 06h / depois das 19h, Brasília),
//      fim_de_semana
//
// Evolução documentada: 'cliente_portal' (≤300m de um cliente com coordenada)
// e 'servico' (cliente com OS no dia) entram quando houver coordenadas de
// cliente no banco — hoje a clientes_coordenadas está vazia.
// =============================================================================
import { distanciaKm } from '@/lib/pos/rastreamento';

export interface ParadaBruta {
  lat: number;
  lng: number;
  inicio: string;       // ISO
  fim: string | null;   // ISO
  duracao_min: number;
}

export interface GeocercaCtx {
  id: string;                 // frota_geocercas.id (uuid)
  latitude: number;
  longitude: number;
  raio_m: number;
  classe: string | null;      // cliente|loja|manutencao|estacionamento|descarga|outro
  nome: string;
  cliente_id?: string | null;
}

export interface VisitaCtx { lat: number; lng: number }
export interface AbastecimentoCtx { data_transacao: string } // ISO, mesma placa

export interface Contexto {
  geocercas: GeocercaCtx[];
  visitas: VisitaCtx[];             // visitas do DIA (RotaDia.visitas)
  abastecimentos: AbastecimentoCtx[]; // abastecimentos do DIA da placa
}

export interface ParadaClassificada extends ParadaBruta {
  classe: string;
  geocerca_id: string | null;
  destino_nome: string | null;
  cliente_id: string | null;
  atipica: boolean;
  nivel: 'baixa' | 'media' | 'alta';
  fora_horario: boolean;
  fim_de_semana: boolean;
}

const VISITA_RAIO_KM = 2;
const ABASTECIMENTO_JANELA_MIN = 20;
const HORA_INICIO_EXPEDIENTE = 6;   // Brasília
const HORA_FIM_EXPEDIENTE = 19;

function geocercaDa(p: ParadaBruta, geocercas: GeocercaCtx[]): GeocercaCtx | null {
  let melhor: GeocercaCtx | null = null;
  let melhorDist = Infinity;
  for (const g of geocercas) {
    if (!g.latitude || !g.longitude) continue;
    const d = distanciaKm(p.lat, p.lng, g.latitude, g.longitude);
    const raioKm = Math.max(g.raio_m || 500, 100) / 1000; // raio mínimo 100m (GPS erra)
    if (d <= raioKm && d < melhorDist) {
      melhor = g;
      melhorDist = d;
    }
  }
  return melhor;
}

// hora local de Brasília (-03:00, sem horário de verão desde 2019)
function horaBrasilia(iso: string): number {
  return new Date(new Date(iso).getTime() - 3 * 3600_000).getUTCHours();
}
function diaSemanaBrasilia(iso: string): number {
  return new Date(new Date(iso).getTime() - 3 * 3600_000).getUTCDay(); // 0=dom 6=sáb
}

export function classificarParada(p: ParadaBruta, ctx: Contexto): ParadaClassificada {
  const base = {
    ...p,
    geocerca_id: null as string | null,
    destino_nome: null as string | null,
    cliente_id: null as string | null,
    atipica: false,
    nivel: (p.duracao_min >= 60 ? 'alta' : p.duracao_min >= 15 ? 'media' : 'baixa') as
      | 'baixa' | 'media' | 'alta',
    fora_horario:
      horaBrasilia(p.inicio) < HORA_INICIO_EXPEDIENTE ||
      horaBrasilia(p.inicio) >= HORA_FIM_EXPEDIENTE,
    fim_de_semana: [0, 6].includes(diaSemanaBrasilia(p.inicio)),
  };

  // 1) geocerca
  const g = geocercaDa(p, ctx.geocercas);
  if (g) {
    return {
      ...base,
      classe: g.classe && g.classe !== 'outro' ? g.classe : 'outro_destino',
      geocerca_id: g.id,
      destino_nome: g.nome,
      cliente_id: g.cliente_id ?? null,
    };
  }

  // 2a) visita comercial do dia por perto
  for (const v of ctx.visitas) {
    if (v.lat && v.lng && distanciaKm(p.lat, p.lng, v.lat, v.lng) <= VISITA_RAIO_KM) {
      return { ...base, classe: 'visita' };
    }
  }

  // 2b) abastecimento da placa casando por HORÁRIO
  const ini = new Date(p.inicio).getTime() - ABASTECIMENTO_JANELA_MIN * 60_000;
  const fim = new Date(p.fim || p.inicio).getTime() + ABASTECIMENTO_JANELA_MIN * 60_000;
  for (const a of ctx.abastecimentos) {
    const t = new Date(a.data_transacao).getTime();
    if (t >= ini && t <= fim) return { ...base, classe: 'abastecimento' };
  }

  // 3) ninguém absolveu
  return { ...base, classe: 'fora_geocerca', atipica: true };
}

export function classificarParadas(paradas: ParadaBruta[], ctx: Contexto): ParadaClassificada[] {
  return (paradas || []).map((p) => classificarParada(p, ctx));
}
