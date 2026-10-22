// =============================================================================
// VIAS FORA DO MAPA — servidor (banco, Storage e Overpass). Regras em
// lib/frota/vias-fora-mapa.ts.
//
// Malha do OSM: um arquivo por quadrante de 0,1° no bucket PRIVADO
// `frota-vias-osm` (<quadrante>.json.gz). Baixada do Overpass só na primeira
// vez que algum carro anda naquele quadrante; depois sai do Storage.
//
// Processamento: cada (placa, dia) de rotas_vendedor vira linhas em
// frota_vias_trechos + o estado em frota_vias_dias. Dia cujo quadrante não
// baixou fica `pendente` e é tentado de novo na próxima rodada. Dia recalculado
// pelo fechar-dia (hora_fim/km mudaram) é reprocessado.
//
// Quem chama: agendador (tarefa `frota-vias-fora-mapa`, diário depois do
// fechar-dia) e scripts/frota-vias-processar.ts (carga do histórico).
// Migration: sql/frota-vias-fora-mapa.sql.
// =============================================================================
import { gzipSync, gunzipSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { paginar } from '@/lib/db/paginar';
import type { PontoGps } from './gps';
import {
  IndiceVias, assinaturaRota, classificarDia, consultaOverpass, malhaDoOverpass, tilesDoDia,
  type MalhaTile,
} from './vias-fora-mapa';

export const BUCKET_VIAS = 'frota-vias-osm';

// overpass-api.de cai e volta; os espelhos dividem a carga. Ordem testada em 22/10/2026.
const ESPELHOS_OVERPASS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** Tabela ausente (migration não aplicada)? */
export function migracaoViasFaltando(msg: string | null | undefined): boolean {
  return /frota_vias_|schema cache|does not exist|PGRST205|42P01/i.test(String(msg || ''));
}

let bucketOk = false;
async function garantirBucket(supabase: SupabaseClient): Promise<void> {
  if (bucketOk) return;
  const { data } = await supabase.storage.listBuckets();
  if (!data?.find((b) => b.name === BUCKET_VIAS)) {
    const { error } = await supabase.storage.createBucket(BUCKET_VIAS, { public: false });
    if (error && !/already exists/i.test(error.message)) throw new Error(`bucket ${BUCKET_VIAS}: ${error.message}`);
  }
  bucketOk = true;
}

/** Baixa a malha de um quadrante do Overpass, tentando os espelhos. */
export async function baixarMalhaOverpass(chave: string): Promise<MalhaTile> {
  const corpo = new URLSearchParams({ data: consultaOverpass(chave) }).toString();
  const erros: string[] = [];
  for (const url of ESPELHOS_OVERPASS) {
    const ctrl = new AbortController();
    const limite = setTimeout(() => ctrl.abort(), 150_000);
    try {
      const r = await fetch(url, {
        method: 'POST',
        body: corpo,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'portal-nova-tratores/1.0 (frota vias fora do mapa)' },
        signal: ctrl.signal,
      });
      if (!r.ok) { erros.push(`${new URL(url).host} ${r.status}`); continue; }
      return malhaDoOverpass(chave, await r.json(), new Date().toISOString());
    } catch (e) {
      erros.push(`${new URL(url).host} ${ctrl.signal.aborted ? 'tempo esgotado' : (e as Error).message}`);
    } finally {
      clearTimeout(limite);
    }
  }
  throw new Error(`Overpass indisponível (${erros.join('; ')})`);
}

// Malhas já lidas neste processo (as mais recentes; cada uma tem de 50 KB a alguns MB).
const CACHE_MAX = 40;
const cacheMalhas = new Map<string, MalhaTile>();
function guardarCache(m: MalhaTile) {
  cacheMalhas.delete(m.tile);
  cacheMalhas.set(m.tile, m);
  while (cacheMalhas.size > CACHE_MAX) cacheMalhas.delete(cacheMalhas.keys().next().value as string);
}

/**
 * Malha do quadrante: memória → Storage → Overpass (se `podeBaixar`, e guarda no Storage).
 * Devolve null quando não está guardada e não pôde baixar.
 */
export async function carregarMalha(
  supabase: SupabaseClient, chave: string, podeBaixar: boolean,
): Promise<{ malha: MalhaTile | null; baixou: boolean; erro?: string }> {
  const emMemoria = cacheMalhas.get(chave);
  if (emMemoria) { guardarCache(emMemoria); return { malha: emMemoria, baixou: false }; }
  await garantirBucket(supabase);
  const caminho = `${chave}.json.gz`;
  const { data: blob } = await supabase.storage.from(BUCKET_VIAS).download(caminho);
  if (blob) {
    const malha = JSON.parse(gunzipSync(Buffer.from(await blob.arrayBuffer())).toString('utf8')) as MalhaTile;
    guardarCache(malha);
    return { malha, baixou: false };
  }
  if (!podeBaixar) return { malha: null, baixou: false };
  try {
    const malha = await baixarMalhaOverpass(chave);
    const gz = gzipSync(Buffer.from(JSON.stringify(malha)));
    const { error } = await supabase.storage.from(BUCKET_VIAS).upload(caminho, gz, { contentType: 'application/gzip', upsert: true });
    if (error) throw new Error(`Storage: ${error.message}`);
    guardarCache(malha);
    return { malha, baixou: true };
  } catch (e) {
    return { malha: null, baixou: false, erro: (e as Error).message };
  }
}

// ─── Processamento dos dias ────────────────────────────────────────────────────

/** Ontem no fuso da loja (YYYY-MM-DD). */
export function ontemBRT(agora = new Date()): string {
  const d = new Date(agora.getTime() - 3 * 3600_000);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function menosDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export interface OpcoesProcessar {
  /** primeiro dia (padrão: 14 dias antes de ontem) */
  desde?: string;
  /** último dia (padrão: ontem — o dia de hoje ainda está crescendo) */
  ate?: string;
  /** no máximo quantos dias-carro nesta rodada */
  limite?: number;
  /** no máximo quantos quadrantes baixar do Overpass nesta rodada */
  maxDownloads?: number;
  /** false = só calcula e conta, não grava trechos nem estado */
  gravar?: boolean;
  /** reprocessa mesmo dia já ok com a mesma assinatura */
  forcar?: boolean;
  log?: (msg: string) => void;
}

export interface ResultadoProcessar {
  candidatos: number;
  processados: number;
  ok: number;
  pendentes: number;
  trechos: number;
  kmFora: number;
  baixados: number;
  restantes: number;
  erros: string[];
}

interface LinhaRota { id: number; placa: string; data: string; hora_fim: string | null; km_total: number | null }
interface LinhaDia { placa: string; data: string; assinatura: string | null; situacao: string; processado_em: string }

const PENDENTE_ESPERA_MS = 30 * 60_000;

let emAndamento: Promise<ResultadoProcessar> | null = null;

/** Uma rodada por vez no processo (o agendador e o script não se atropelam aqui dentro). */
export function processarViasForaMapa(supabase: SupabaseClient, opts: OpcoesProcessar = {}): Promise<ResultadoProcessar> {
  if (!emAndamento) emAndamento = executar(supabase, opts).finally(() => { emAndamento = null; });
  return emAndamento;
}

async function executar(supabase: SupabaseClient, opts: OpcoesProcessar): Promise<ResultadoProcessar> {
  const log = opts.log || (() => {});
  const ate = opts.ate || ontemBRT();
  const desde = opts.desde || menosDias(ate, 14);
  const limite = opts.limite ?? 400;
  let downloadsRestantes = opts.maxDownloads ?? 40;
  const gravar = opts.gravar !== false;
  const res: ResultadoProcessar = { candidatos: 0, processados: 0, ok: 0, pendentes: 0, trechos: 0, kmFora: 0, baixados: 0, restantes: 0, erros: [] };

  const rotas = await paginar<LinhaRota>((de, a) => supabase
    .from('rotas_vendedor').select('id, placa, data, hora_fim, km_total')
    .gte('data', desde).lte('data', ate).not('placa', 'is', null)
    .order('id').range(de, a));
  if (rotas.error) throw new Error(`rotas_vendedor: ${rotas.error.message}`);

  const feitos = await paginar<LinhaDia>((de, a) => supabase
    .from('frota_vias_dias').select('placa, data, assinatura, situacao, processado_em')
    .gte('data', desde).lte('data', ate)
    .order('placa').order('data').range(de, a));
  // simulação roda antes da migration: sem a tabela de estado, tudo é candidato
  if (feitos.error && (gravar || !migracaoViasFaltando(feitos.error.message))) throw new Error(`frota_vias_dias: ${feitos.error.message}`);
  const estado = new Map(feitos.data.map((d) => [`${d.placa}|${d.data}`, d]));

  const candidatos = rotas.data
    .filter((r) => {
      const e = estado.get(`${r.placa}|${r.data}`);
      if (!e || opts.forcar) return true;
      if (e.assinatura !== assinaturaRota(r)) return true;
      // pendente: tenta de novo, mas não o que acabou de falhar (senão a carga do
      // histórico ficaria girando nos mesmos dias)
      return e.situacao === 'pendente' && Date.now() - Date.parse(e.processado_em) > PENDENTE_ESPERA_MS;
    })
    // os mais recentes primeiro: o que a equipe vai olhar amanhã aparece antes
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.placa.localeCompare(b.placa)));
  res.candidatos = candidatos.length;
  res.restantes = Math.max(0, candidatos.length - limite);
  // quadrante que falhou nesta rodada não é tentado de novo por outro dia
  const falharam = new Set<string>();

  for (const r of candidatos.slice(0, limite)) {
    try {
      const { data: linha, error } = await supabase.from('rotas_vendedor').select('pontos').eq('id', r.id).maybeSingle();
      if (error) throw new Error(error.message);
      const pontos = ((linha?.pontos as PontoGps[] | null) || []);
      const tiles = tilesDoDia(pontos);
      const indice = new IndiceVias();
      const erroTiles: string[] = [];
      for (const t of tiles) {
        if (falharam.has(t)) { erroTiles.push(t); continue; }
        const { malha, baixou, erro } = await carregarMalha(supabase, t, downloadsRestantes > 0);
        if (baixou) { downloadsRestantes--; res.baixados++; log(`malha ${t} baixada (${malha?.vias.length} vias)`); }
        if (malha) indice.adicionarMalha(malha);
        else {
          falharam.add(t); erroTiles.push(t);
          if (erro) res.erros.push(`${t}: ${erro}`);
        }
      }
      const dia = classificarDia(pontos, indice);
      res.processados++;
      const pendente = dia.tilesFaltando.length > 0;
      const km = dia.trechos.reduce((s, t) => s + t.km, 0);
      if (pendente) res.pendentes++; else { res.ok++; res.trechos += dia.trechos.length; res.kmFora += km; }

      if (gravar) {
        if (!pendente) {
          const del = await supabase.from('frota_vias_trechos').delete().eq('placa', r.placa).eq('data', r.data);
          if (del.error) throw new Error(`apagar trechos: ${del.error.message}`);
          if (dia.trechos.length) {
            const ins = await supabase.from('frota_vias_trechos').insert(dia.trechos.map((t) => ({ placa: r.placa, data: r.data, ...t })));
            if (ins.error) throw new Error(`gravar trechos: ${ins.error.message}`);
          }
        }
        const up = await supabase.from('frota_vias_dias').upsert({
          placa: r.placa,
          data: r.data,
          assinatura: assinaturaRota(r),
          situacao: pendente ? 'pendente' : 'ok',
          trechos: pendente ? null : dia.trechos.length,
          km_fora: pendente ? null : Math.round(km * 1000) / 1000,
          pontos_andando: dia.pontosAndando,
          pontos_fora: pendente ? null : dia.pontosFora,
          tiles_faltando: pendente ? dia.tilesFaltando : null,
          processado_em: new Date().toISOString(),
        }, { onConflict: 'placa,data' });
        if (up.error) throw new Error(`gravar estado: ${up.error.message}`);
      }
      if (res.processados % 25 === 0) log(`${res.processados}/${Math.min(limite, candidatos.length)} dias · ${res.trechos} trechos · ${res.baixados} malhas baixadas`);
    } catch (e) {
      res.erros.push(`${r.placa} ${r.data}: ${(e as Error).message}`);
      if (migracaoViasFaltando((e as Error).message)) break;
    }
  }
  res.kmFora = Math.round(res.kmFora * 10) / 10;
  res.erros = res.erros.slice(0, 20);
  return res;
}
