// Mapa ao vivo da Frota — servidor. Uma fonte só para a lista E os
// marcadores: os veículos ATIVOS da Frota com rastreador (vendido/arquivado
// não aparece), com a última posição conhecida, a situação (lib/frota/mapa-vivo)
// e o lugar ("Loja", "Cliente X").
//
// Custo: a Rota Exata não tem "última posição", então a busca é por janelas
// que crescem (30 min → 3 h → 26 h): carro andando resolve com poucos pontos.
// Sem nada em 26 h, usa o último ponto salvo em rotas_vendedor. A resposta fica
// 30 s em memória e é COMPARTILHADA entre abas e usuários (antes cada aba
// baixava o dia inteiro de cada carro a cada 30 s).
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchTudo, LOJA_LAT, LOJA_LNG } from '@/lib/pos/rastreamento';
import { estimarRetorno, type PontoDia, type Retorno } from '@/lib/frota/retorno-loja';
import { classificarParada, type GeocercaCtx } from '@/lib/frota/paradas';
import { carregarPropriedades, propriedadesComoGeocercas } from '@/lib/frota/propriedades';
import { chaveNome, diaBR, limparNome, ordenarVivos, osDosTecnicos, rotuloLocal, rumoDosPontos, statusVivo, type OsExecucao, type StatusVivo } from '@/lib/frota/mapa-vivo';
import { formatarPlaca, resolverPlaca } from '@/lib/frota/placa';

export interface VeiculoVivo {
  placa: string;
  placa_exibicao: string;
  modelo: string;
  /** quem dirige hoje (check-in) > técnico(s) vinculados ao carro > responsável da Frota */
  nome: string | null;
  motorista_hoje: string | null;
  responsavel: string | null;
  /** vínculo técnico↔carro da Janela Mecânico (tecnico_veiculos) */
  tecnicos: string[];
  /** OS do Pós em execução de algum desses técnicos — o cliente que está sendo atendido */
  os_execucao: OsExecucao[];
  tem_rastreador: boolean;
  lat: number | null;
  lng: number | null;
  ignicao: boolean;
  velocidade: number;
  dt: string | null;
  fonte: 'ao_vivo' | 'cache' | null;
  status: StatusVivo;
  local: string | null;
  /** para onde está indo (0° = norte), pelos últimos pontos; null parado/sem dado */
  rumo: number | null;
  /** andando de volta para a loja: hora estimada de chegada (lib/frota/retorno-loja) */
  retorno: Retorno | null;
}

interface Pos { lat: number; lng: number; ignicao: boolean; velocidade: number; dt: string | null; fonte: 'ao_vivo' | 'cache'; rumo?: number | null }

const JANELAS_MIN = [30, 180, 26 * 60];

async function ultimaPosicaoLive(adesaoId: number): Promise<Pos | null> {
  const agora = Date.now();
  for (const janela of JANELAS_MIN) {
    const w = JSON.stringify({
      adesao_id: adesaoId,
      dt_posicao: { $gte: new Date(agora - janela * 60000).toISOString(), $lte: new Date(agora).toISOString() },
    });
    type PosRE = { latitude: number; longitude: number; ignicao: number; velocidade: number; dt_posicao: string };
    const posicoes = (await fetchTudo('/posicoes', { where: w }, 1000)) as PosRE[];
    if (!posicoes.length) continue;
    const ordenadas = [...posicoes].sort((a, b) => new Date(a.dt_posicao).getTime() - new Date(b.dt_posicao).getTime());
    const last = ordenadas[ordenadas.length - 1];
    if (!last?.latitude || !last?.longitude) continue;
    const rumo = rumoDosPontos(
      ordenadas.slice(-60).filter((x) => x.latitude && x.longitude).map((x) => ({ lat: x.latitude, lng: x.longitude, dt: x.dt_posicao })),
    );
    return {
      lat: last.latitude, lng: last.longitude, ignicao: last.ignicao === 1,
      velocidade: Number(last.velocidade) || 0, dt: last.dt_posicao || null, fonte: 'ao_vivo', rumo,
    };
  }
  return null;
}

async function ultimaPosicaoCache(supabase: SupabaseClient, placa: string): Promise<Pos | null> {
  const { data } = await supabase
    .from('rotas_vendedor')
    .select('data, pontos')
    .in('placa', [...new Set([placa, formatarPlaca(placa)])])
    .order('data', { ascending: false })
    .limit(7);
  for (const r of data || []) {
    const pontos = Array.isArray(r.pontos) ? r.pontos : [];
    const last = pontos[pontos.length - 1];
    if (last?.lat && last?.lng) return { lat: last.lat, lng: last.lng, ignicao: false, velocidade: 0, dt: last.dt || null, fonte: 'cache' };
  }
  return null;
}

// Pontos do DIA de um carro andando (para a previsão de volta à loja). Guardados
// por carro e só completados com o que chegou desde a última busca: o carro
// andando custa uma página da Rota Exata a cada 30 s, não o dia inteiro.
const trilhas = new Map<number, { dia: string; pontos: PontoDia[] }>();
async function pontosDoDia(adesaoId: number): Promise<PontoDia[]> {
  const dia = diaBR();
  let t = trilhas.get(adesaoId);
  if (!t || t.dia !== dia) { t = { dia, pontos: [] }; trilhas.set(adesaoId, t); }
  const ultimo = t.pontos[t.pontos.length - 1]?.dt;
  const de = ultimo ? new Date(new Date(ultimo).getTime() + 1000).toISOString() : new Date(`${dia}T00:00:00-03:00`).toISOString();
  const w = JSON.stringify({ adesao_id: adesaoId, dt_posicao: { $gte: de, $lte: new Date().toISOString() } });
  type PosRE = { latitude: number; longitude: number; velocidade: number; dt_posicao: string };
  const novos = ((await fetchTudo('/posicoes', { where: w }, 1000)) as PosRE[])
    .filter((x) => x.latitude && x.longitude && x.dt_posicao)
    .map((x) => ({ dt: new Date(x.dt_posicao).toISOString(), lat: x.latitude, lng: x.longitude, vel: Number(x.velocidade) || 0 }))
    .sort((a, b) => a.dt.localeCompare(b.dt));
  t.pontos.push(...novos.filter((x) => !ultimo || x.dt > ultimo));
  return t.pontos;
}

// geocercas + propriedades mudam pouco: 10 min em memória
let ctxCache: { at: number; geocercas: GeocercaCtx[] } | null = null;
export async function geocercasCtx(supabase: SupabaseClient): Promise<GeocercaCtx[]> {
  if (ctxCache && Date.now() - ctxCache.at < 10 * 60_000) return ctxCache.geocercas;
  const [geo, props] = await Promise.all([
    supabase.from('frota_geocercas').select('id, latitude, longitude, raio_m, classe, nome, cliente_id').eq('ativo', true),
    carregarPropriedades(supabase).catch(() => []),
  ]);
  const geocercas = [...((geo.data || []) as GeocercaCtx[]), ...propriedadesComoGeocercas(props)];
  ctxCache = { at: Date.now(), geocercas };
  return geocercas;
}

async function montar(supabase: SupabaseClient): Promise<VeiculoVivo[]> {
  const hoje = diaBR();
  const [veic, resp, uso, geocercas, vinc, ordens] = await Promise.all([
    supabase.from('frota_veiculos')
      .select('id, placa, marca, modelo, descricao, adesao_id')
      .eq('tipo_registro', 'veiculo').eq('ativo', true).eq('tem_rastreador', true)
      .order('placa'),
    supabase.from('frota_responsaveis').select('veiculo_id, motorista_nome').is('fim', null),
    // quem pegou o carro hoje (check-in dos vendedores + app dos mecânicos)
    supabase.from('vw_frota_uso_diario').select('placa, pessoa_nome, created_at').eq('data', hoje),
    geocercasCtx(supabase).catch(() => [] as GeocercaCtx[]),
    supabase.from('tecnico_veiculos').select('tecnico_nome, placa'),
    supabase.from('Ordem_Servico').select('Id_Ordem, Os_Cliente, Os_Tecnico, Os_Tecnico2').eq('Status', 'Execução'),
  ]);
  if (veic.error) throw new Error(veic.error.message);

  const respPorVeiculo = new Map<string, string>();
  for (const r of resp.data || []) if (r.motorista_nome) respPorVeiculo.set(r.veiculo_id, r.motorista_nome);
  const motoristaHoje = new Map<string, { nome: string; at: string }>();
  for (const u of (uso.data || []) as { placa: string; pessoa_nome: string; created_at: string }[]) {
    const p = resolverPlaca(u.placa || '');
    const atual = motoristaHoje.get(p);
    if (u.pessoa_nome && (!atual || String(u.created_at) > atual.at)) motoristaHoje.set(p, { nome: u.pessoa_nome, at: String(u.created_at) });
  }

  // técnicos por placa (sem repetir a mesma pessoa escrita de dois jeitos)
  const tecnicosPorPlaca = new Map<string, string[]>();
  for (const t of (vinc.data || []) as { tecnico_nome: string; placa: string }[]) {
    const p = resolverPlaca(t.placa || '');
    const nome = limparNome(t.tecnico_nome);
    if (!p || !nome) continue;
    const arr = tecnicosPorPlaca.get(p) || [];
    if (!arr.some((x) => chaveNome(x) === chaveNome(nome))) arr.push(nome);
    tecnicosPorPlaca.set(p, arr);
  }
  const ordensExec = (ordens.data || []) as { Id_Ordem: string; Os_Cliente: string | null; Os_Tecnico: string | null; Os_Tecnico2: string | null }[];

  const veiculos = veic.data || [];
  const posicoes = new Map<string, Pos>();
  const LOTE = 6; // a Rota Exata é externa — não disparar todos de uma vez
  for (let i = 0; i < veiculos.length; i += LOTE) {
    await Promise.all(veiculos.slice(i, i + LOTE).map(async (v) => {
      let pos: Pos | null = null;
      if (Number(v.adesao_id) > 0) { try { pos = await ultimaPosicaoLive(Number(v.adesao_id)); } catch { /* cai no cache */ } }
      if (!pos) { try { pos = await ultimaPosicaoCache(supabase, v.placa); } catch { /* sem posição */ } }
      if (pos) posicoes.set(v.placa, pos);
    }));
  }

  // previsão de volta à loja: só para quem está andando ao vivo
  const retornos = new Map<string, Retorno>();
  const andando = veiculos.filter((v) => {
    const p = posicoes.get(v.placa);
    return p && p.fonte === 'ao_vivo' && p.ignicao && p.velocidade >= 5 && Number(v.adesao_id) > 0;
  });
  for (let i = 0; i < andando.length; i += LOTE) {
    await Promise.all(andando.slice(i, i + LOTE).map(async (v) => {
      try {
        const r = estimarRetorno(await pontosDoDia(Number(v.adesao_id)), { lat: LOJA_LAT, lng: LOJA_LNG });
        if (r) retornos.set(v.placa, r);
      } catch { /* sem previsão */ }
    }));
  }

  const agora = Date.now();
  const lista: VeiculoVivo[] = veiculos.map((v) => {
    const pos = posicoes.get(v.placa) || null;
    const responsavel = limparNome(respPorVeiculo.get(v.id));
    const motorista_hoje = limparNome(motoristaHoje.get(resolverPlaca(v.placa))?.nome);
    const tecnicos = tecnicosPorPlaca.get(resolverPlaca(v.placa)) || [];
    const os_execucao = osDosTecnicos(motorista_hoje ? [motorista_hoje, ...tecnicos] : tecnicos, ordensExec);
    let local: string | null = null;
    if (pos) {
      const emMovimento = pos.fonte === 'ao_vivo' && pos.ignicao && pos.velocidade >= 15;
      if (emMovimento) local = 'Em deslocamento';
      else {
        const c = classificarParada(
          { lat: pos.lat, lng: pos.lng, inicio: pos.dt || new Date().toISOString(), fim: null, duracao_min: 0 },
          { geocercas, visitas: [], abastecimentos: [] },
        );
        local = rotuloLocal(c.classe, c.destino_nome);
      }
    }
    return {
      placa: v.placa,
      placa_exibicao: formatarPlaca(v.placa),
      modelo: [v.marca, v.modelo || v.descricao].filter(Boolean).join(' '),
      nome: motorista_hoje || (tecnicos.length ? tecnicos.join(' / ') : null) || responsavel,
      motorista_hoje,
      responsavel,
      tecnicos,
      os_execucao,
      tem_rastreador: Number(v.adesao_id) > 0,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      ignicao: pos?.ignicao ?? false,
      velocidade: pos?.velocidade ?? 0,
      dt: pos?.dt ?? null,
      fonte: pos?.fonte ?? null,
      status: statusVivo(pos, agora),
      local,
      rumo: pos?.rumo ?? null,
      retorno: retornos.get(v.placa) ?? null,
    };
  });
  return ordenarVivos(lista);
}

// cache de 30 s + uma busca por vez (várias abas abertas não multiplicam a API)
const TTL_MS = 30_000;
let memo: { at: number; dados: VeiculoVivo[] } | null = null;
let emAndamento: Promise<VeiculoVivo[]> | null = null;

export async function carregarVivos(supabase: SupabaseClient): Promise<{ veiculos: VeiculoVivo[]; atualizado_em: string }> {
  if (memo && Date.now() - memo.at < TTL_MS) return { veiculos: memo.dados, atualizado_em: new Date(memo.at).toISOString() };
  if (!emAndamento) {
    emAndamento = montar(supabase)
      .then((dados) => { memo = { at: Date.now(), dados }; return dados; })
      .finally(() => { emAndamento = null; });
  }
  const dados = await emAndamento;
  return { veiculos: dados, atualizado_em: new Date(memo?.at || Date.now()).toISOString() };
}
