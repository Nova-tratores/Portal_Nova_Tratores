// Mapa do supervisor no app de vendas (CRM Vendas → Mapa): regras puras.
// Qual carro é de qual vendedor e a timeline do dia (saída → trechos →
// paradas → fim), a mesma régua do /frota/mapa (components/supervisor/MapaCarros).
import { distKm, filtrarEspetos, segmentarTrajeto, type PontoGps } from '@/lib/frota/gps';
import { mesmaPessoa } from '@/lib/frota/responsavel';
import type { StatusVivo } from '@/lib/frota/mapa-vivo';

export interface VendedorBase { id: number; nome: string }

export interface CarroVivoBase {
  placa: string;
  placa_exibicao: string;
  modelo: string;
  motorista_hoje: string | null;
  responsavel: string | null;
  lat: number | null;
  lng: number | null;
  ignicao: boolean;
  velocidade: number;
  dt: string | null;
  status: StatusVivo;
  local: string | null;
  rumo: number | null;
}

export interface CarroDoVendedor {
  vendedor_id: number;
  vendedor_nome: string;
  placa: string;
  placa_exibicao: string;
  modelo: string;
  lat: number | null;
  lng: number | null;
  ignicao: boolean;
  velocidade: number;
  dt: string | null;
  status: StatusVivo;
  local: string | null;
  rumo: number | null;
}

/**
 * Liga cada vendedor ao carro que está com ele: quem pegou o carro hoje
 * (check-in) vale mais que o responsável da Frota. Um carro fica com um
 * vendedor só; vendedor sem carro não aparece.
 */
export function carrosDosVendedores(vendedores: VendedorBase[], vivos: CarroVivoBase[]): CarroDoVendedor[] {
  const usados = new Set<string>();
  const saida: CarroDoVendedor[] = [];
  const montar = (v: VendedorBase, c: CarroVivoBase): CarroDoVendedor => ({
    vendedor_id: v.id, vendedor_nome: v.nome,
    placa: c.placa, placa_exibicao: c.placa_exibicao, modelo: c.modelo,
    lat: c.lat, lng: c.lng, ignicao: c.ignicao, velocidade: c.velocidade, dt: c.dt,
    // "Sem cadastro de local" não diz nada ao supervisor
    status: c.status, local: c.local === 'Sem cadastro de local' ? null : c.local, rumo: c.rumo,
  });
  const pendentes: VendedorBase[] = [];
  for (const v of vendedores) {
    const c = vivos.find((x) => !usados.has(x.placa) && mesmaPessoa(x.motorista_hoje, v.nome));
    if (c) { usados.add(c.placa); saida.push(montar(v, c)); } else pendentes.push(v);
  }
  for (const v of pendentes) {
    // carro emprestado hoje para outra pessoa não volta para o responsável
    const c = vivos.find((x) => !usados.has(x.placa) && !x.motorista_hoje && mesmaPessoa(x.responsavel, v.nome));
    if (c) { usados.add(c.placa); saida.push(montar(v, c)); }
  }
  return saida.sort((a, b) => a.vendedor_nome.localeCompare(b.vendedor_nome, 'pt-BR'));
}

export interface ParadaRota { lat: number; lng: number; inicio: string; fim: string | null; duracao_min: number; local?: string | null }

export type EventoTimeline =
  | { tipo: 'inicio'; hora: string | null; local: string | null }
  | { tipo: 'trecho'; de: string; ate: string; km: number; velMax: number; min: number }
  | { tipo: 'parada'; hora: string; fim: string | null; dur: number; local: string | null; lat: number; lng: number }
  | { tipo: 'fim'; hora: string | null; local: string | null };

/** Timeline do dia — mesma conta do MapaCarros do portal. */
export function montarTimeline(
  pontos: PontoGps[],
  paradasEntrada: ParadaRota[],
  horaInicio: string | null,
  horaFim: string | null,
  localDe: (lat: number, lng: number) => string | null = () => null,
): EventoTimeline[] {
  if (pontos.length === 0) return [];
  const paradas = [...paradasEntrada].sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
  const trecho = (deIso: string, ateIso: string) => {
    const janela = pontos.filter((p) => p.dt >= deIso && p.dt <= ateIso);
    if (janela.length < 2) return null;
    let km = 0, velMax = 0;
    for (let i = 1; i < janela.length; i++) {
      const d = distKm(janela[i - 1], janela[i]);
      if (d < 5) km += d; // salto de GPS não é km rodado
      velMax = Math.max(velMax, Number(janela[i].vel) || 0);
    }
    if (km < 0.3) return null;
    const min = Math.max(1, Math.round((new Date(ateIso).getTime() - new Date(deIso).getTime()) / 60000));
    return { km: Math.round(km * 10) / 10, velMax: Math.round(velMax), min };
  };
  const evs: EventoTimeline[] = [{ tipo: 'inicio', hora: horaInicio, local: localDe(pontos[0].lat, pontos[0].lng) }];
  let cursor = pontos[0].dt;
  for (const pa of paradas) {
    const t = trecho(cursor, pa.inicio);
    if (t) evs.push({ tipo: 'trecho', de: cursor, ate: pa.inicio, ...t });
    evs.push({ tipo: 'parada', hora: pa.inicio, fim: pa.fim, dur: pa.duracao_min, local: pa.local ?? localDe(pa.lat, pa.lng), lat: pa.lat, lng: pa.lng });
    cursor = pa.fim || pa.inicio;
  }
  const ultimo = pontos[pontos.length - 1];
  const tFinal = trecho(cursor, ultimo.dt);
  if (tFinal) evs.push({ tipo: 'trecho', de: cursor, ate: ultimo.dt, ...tFinal });
  evs.push({ tipo: 'fim', hora: horaFim, local: localDe(ultimo.lat, ultimo.lng) });
  return evs;
}

/** O que o app desenha: trajeto já limpo e partido nos buracos de sinal. */
export function desenhoDaRota(pontosCrus: PontoGps[]) {
  const pontos = filtrarEspetos(pontosCrus);
  const { segmentos, buracos } = segmentarTrajeto(pontos);
  return {
    pontos,
    segmentos: segmentos.filter((s) => s.length >= 2).map((s) => s.map((p) => [p.lat, p.lng] as [number, number])),
    buracos: buracos.map((b) => ({ de: [b.de.lat, b.de.lng] as [number, number], ate: [b.ate.lat, b.ate.lng] as [number, number], tooltip: b.tooltip })),
  };
}
