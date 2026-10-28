/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Características de produtos: matriz (Empresa x Código/Descrição, cada
// característica vira coluna). Sync em background (ListarProdutos) persistido em
// produtos_caracteristicas; edição inline grava no Omie + Supabase; sugestão de
// "Tipo:" por casamento da descrição. Portado de server.js (/api/caracteristicas*).
//
// WORKER-READY: o sync usa ajustes_jobs (tipo 'caracteristicas-sync', conta null).
// ============================================================================

import type { Conta } from './conta';
import { getContasOmie } from './conta';
import { supabase } from './supabase';
import { listarProdutos, gravarCaractProduto, listarCaracteristicas, sleep } from './omie';
import { decodeOmieTexto } from '@/lib/omie/texto';
import { criarJob, atualizarJob, concluirJob, falharJob, lerJobAtivo, jobRodando } from './jobs';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { fecharSeAlocada } from '@/lib/pecas/alocacao-server';
import { norm as normCaract } from './posicao';
import { planejarEspelho, dataOmie, type LinhaEspelho } from './caracteristicas-diff';

// Identidade (do token, resolvida na rota) para auditar quem editou a característica.
export interface AutorEdicao { userId?: string; userName: string }

// Características ocultas na leitura (dados continuam no banco).
const CARACTERISTICAS_OCULTAS = ['CBU', 'NFE', 'NFE TS', 'Número de série'];
function semAcento(s: unknown): string {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}
function caractOculta(nome: unknown): boolean {
  const n = semAcento(nome);
  return CARACTERISTICAS_OCULTAS.some((o) => semAcento(o) === n);
}

// Só entram produtos da família "Peças" ou SEM família (máquinas ficam de fora).
function familiaCaractPermitida(fam: unknown): boolean {
  const f = String(fam == null ? '' : fam).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/^#/, '');
  return f === '' || f === 'n/d' || f === 'nd' || f === 'pecas';
}

function contaIdPorLabel(label: unknown): Conta | null {
  const alvo = String(label || '').trim().toUpperCase();
  const hit = getContasOmie().find((c) => c.label.toUpperCase() === alvo);
  return hit ? hit.id : null;
}

// ---- Sync (worker-ready) ----

/**
 * Inicia a varredura de características (todas as contas) em background.
 * Com `aguardar: true` (cron) espera o fim e devolve o resumo — a tela continua
 * recebendo 202 na hora. O lock por job (`ajustes_jobs`) vale pros dois caminhos.
 */
export async function iniciarSyncCaracteristicas(
  criadoPor?: string,
  opts: {
    aguardar?: boolean;
    /** Só estas contas (rótulos, ex. ["CASTRO"]) — usado na retomada do agendador. */
    contas?: string[];
    /** Chamado depois que cada conta foi gravada (retomada por conta). */
    aoConcluirConta?: (label: string, pecas: number) => Promise<void> | void;
    /** Só os produtos alterados desde esta data (DD/MM/AAAA). Sem isso, leitura completa. */
    incrementalDesde?: string;
  } = {},
): Promise<any> {
  if (await jobRodando('caracteristicas-sync', null)) {
    const ativo = await lerJobAtivo('caracteristicas-sync', null);
    return { ok: false, rodando: true, jaRodando: true, jobId: ativo?.id, etapa: ativo?.etapa };
  }
  const jobId = await criarJob('caracteristicas-sync', null, criadoPor);

  const execucao = (async () => {
    const porConta: Record<string, number> = {};
    const detalhe: Record<string, { modo: string; lidos: number; novas: number; alteradas: number; removidas: number; iguais: number; remocaoSuspensa?: number }> = {};
    const modo: 'completo' | 'incremental' = opts.incrementalDesde ? 'incremental' : 'completo';
    try {
      const contas = getContasOmie().filter((c) => !opts.contas || opts.contas.includes(c.label));
      for (const c of contas) {
        const label = c.label;
        atualizarJob(jobId, { etapa: `${label}: listando produtos...` });
        const produtos = await listarProdutos(c.id, {
          onProgress: (m: string) => atualizarJob(jobId, { etapa: `${label}: ${m}` }),
          filtros: modo === 'incremental'
            ? { filtrar_por_data_de: opts.incrementalDesde, filtrar_por_data_ate: dataOmie(new Date()), filtrar_apenas_alteracao: 'S' }
            : undefined,
        });
        const agora = new Date().toISOString();
        const elegivel = (p: any) => !p.inativo && familiaCaractPermitida(p.familia);
        // Inclui TODAS as peças ativas — inclusive as com 0 características — para o
        // "Sugerir Tipo:" alcançá-las pela descrição. Antes só entravam produtos que
        // já tinham ≥1 característica, deixando ~metade do faturamento de peças
        // (óleos, embreagens, filtros sem característica) permanentemente fora da matriz.
        const rows = produtos
          .filter(elegivel)
          .map((p: any) => ({
            conta_omie: label,
            codigo_produto: Number(p.codigoProduto) || p.codigoProduto,
            codigo: p.codigo != null ? String(p.codigo) : null,
            descricao: p.descricao || null,
            caracteristicas: Object.fromEntries(
              (Array.isArray(p.caracteristicas) ? p.caracteristicas : [])
                .filter((x: any) => x.nome != null && String(x.nome).trim() !== '')
                .map((x: any) => [String(x.nome), x.conteudo != null ? String(x.conteudo) : '']),
            ),
            atualizado_em: agora,
          }));
        // Só vai ao banco o que é novo, mudou ou saiu (antes: apagava e reinseria ~5 mil
        // linhas por conta toda noite). Regras em caracteristicas-diff.ts.
        const removerIds = modo === 'incremental'
          ? produtos.filter((p: any) => !elegivel(p)).map((p: any) => String(Number(p.codigoProduto) || p.codigoProduto))
          : [];
        atualizarJob(jobId, { etapa: `${label}: comparando ${rows.length} peças com o espelho...` });
        const existentes = await lerEspelhoConta(label, modo === 'incremental'
          ? [...rows.map((r: any) => String(r.codigo_produto)), ...removerIds]
          : null);
        const plano = planejarEspelho(rows as (LinhaEspelho & { atualizado_em: string })[], existentes, modo, removerIds);
        // Trava: se a Omie devolver uma lista incompleta (erro no meio da paginação), a
        // comparação acharia que milhares de peças "sumiram". Acima de 5% do espelho (mín.
        // 50) as remoções ficam suspensas — o completo da semana seguinte tenta de novo.
        let remocaoSuspensa = 0;
        if (modo === 'completo' && plano.apagar.length > Math.max(50, existentes.length * 0.05)) {
          remocaoSuspensa = plano.apagar.length;
          console.warn(`[caract ${label}] ${plano.apagar.length} remoções suspensas (${existentes.length} no espelho, ${rows.length} vieram da Omie)`);
          plano.apagar = [];
        }
        atualizarJob(jobId, { etapa: `${label}: gravando ${plano.gravar.length} e removendo ${plano.apagar.length}...` });
        for (let i = 0; i < plano.gravar.length; i += 500) {
          const { error } = await supabase.from('produtos_caracteristicas')
            .upsert(plano.gravar.slice(i, i + 500), { onConflict: 'conta_omie,codigo_produto' });
          if (error) throw new Error(`gravar ${label}: ${error.message}`);
        }
        for (let i = 0; i < plano.apagar.length; i += 200) {
          const { error } = await supabase.from('produtos_caracteristicas')
            .delete().eq('conta_omie', label).in('codigo_produto', plano.apagar.slice(i, i + 200));
          if (error) throw new Error(`remover ${label}: ${error.message}`);
        }
        porConta[label] = rows.length;
        detalhe[label] = { modo, lidos: produtos.length, novas: plano.novas, alteradas: plano.alteradas, removidas: plano.apagar.length, iguais: plano.iguais, ...(remocaoSuspensa ? { remocaoSuspensa } : {}) };
        await opts.aoConcluirConta?.(label, rows.length);
        console.log(`[caract ${label}] ${modo}: ${produtos.length} lidos · ${plano.novas} novas · ${plano.alteradas} alteradas · ${plano.apagar.length} removidas · ${plano.iguais} iguais`);
      }
      const resumo = { modo, desde: opts.incrementalDesde ?? null, porConta, detalhe, total: Object.values(porConta).reduce((a, b) => a + b, 0), geradoEm: new Date().toISOString() };
      await concluirJob(jobId, resumo);
      return { ok: true, jobId, resumo };
    } catch (e: any) {
      const erro = e.faultstring || e.message;
      await falharJob(jobId, erro);
      console.error('[caract sync]', e);
      return { ok: false, jobId, erro };
    }
  })();

  if (opts.aguardar) return execucao;
  return { ok: true, rodando: true, jobId };
}

/** Linhas atuais do espelho de uma conta (todas, ou só estes codigo_produto). */
async function lerEspelhoConta(label: string, ids: string[] | null): Promise<LinhaEspelho[]> {
  const out: LinhaEspelho[] = [];
  const cols = 'conta_omie, codigo_produto, codigo, descricao, caracteristicas';
  if (ids) {
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('produtos_caracteristicas').select(cols)
        .eq('conta_omie', label).in('codigo_produto', ids.slice(i, i + 200));
      if (error) throw new Error(`ler espelho ${label}: ${error.message}`);
      out.push(...((data || []) as LinhaEspelho[]));
    }
    return out;
  }
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('produtos_caracteristicas').select(cols)
      .eq('conta_omie', label).order('codigo_produto', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`ler espelho ${label}: ${error.message}`);
    out.push(...((data || []) as LinhaEspelho[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Quando o último sync terminou bem (a data das linhas não serve: só as alteradas são regravadas). */
async function ultimaSyncConcluida(): Promise<string | null> {
  const { data } = await supabase.from('ajustes_jobs').select('atualizado_em')
    .eq('tipo', 'caracteristicas-sync').eq('status', 'concluido')
    .order('atualizado_em', { ascending: false }).limit(1);
  return (data?.[0]?.atualizado_em as string | undefined) ?? null;
}

export async function lerStatusSync(): Promise<any> {
  const ativo = await lerJobAtivo('caracteristicas-sync', null);
  if (!ativo) return { rodando: false, etapa: '', resumo: null };
  return {
    rodando: ativo.status === 'rodando',
    etapa: ativo.etapa,
    inicio: ativo.iniciado_em,
    fim: ativo.status !== 'rodando' ? ativo.atualizado_em : null,
    erro: ativo.erro,
    resumo: ativo.resultado || null,
  };
}

// ---- Matriz ----

// Linhas antigas do snapshot podem ter texto escapado em HTML pela API da Omie
// (12&quot;, O&apos;RING) — decodifica na leitura (no-op para linhas limpas).
function decodeCaractRow(r: any): any {
  const car: Record<string, any> = {};
  Object.entries(r.caracteristicas || {}).forEach(([k, v]) => { car[k] = typeof v === 'string' ? decodeOmieTexto(v) : v; });
  return { ...r, descricao: r.descricao != null ? decodeOmieTexto(r.descricao) : r.descricao, caracteristicas: car };
}

async function lerTodasCaractRows(): Promise<any[]> {
  const todos: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('produtos_caracteristicas')
      .select('conta_omie, codigo_produto, codigo, descricao, caracteristicas')
      .order('conta_omie', { ascending: true })
      .order('codigo', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    todos.push(...(data || []).map(decodeCaractRow));
    if (!data || data.length < PAGE) break;
  }
  return todos;
}

/** Mapa `${conta_lower}:${codigo_produto}` -> { modelo, marca, estoque } da tabela `produtos`.
 *  `estoque` já é o saldo consolidado (soma dos locais feita no sync) — não agregar aqui. */
async function lerModeloMarca(): Promise<Map<string, { modelo: string; marca: string; estoque: number }>> {
  const mapa = new Map<string, { modelo: string; marca: string; estoque: number }>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('produtos')
      .select('conta_omie, codigo_produto, modelo, marca, estoque')
      .order('codigo_produto', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    (data || []).forEach((p: any) => {
      const key = `${String(p.conta_omie).toLowerCase()}:${String(p.codigo_produto)}`;
      mapa.set(key, { modelo: p.modelo != null ? String(p.modelo) : '', marca: p.marca != null ? String(p.marca) : '', estoque: Number(p.estoque) || 0 });
    });
    if (!data || data.length < PAGE) break;
  }
  return mapa;
}

/** Matriz para a tela: { produtos, colunas, total, ultimaSync, sync }. */
export async function lerMatrizCaracteristicas(): Promise<any> {
  const todos: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('produtos_caracteristicas')
      .select('conta_omie, codigo_produto, codigo, descricao, caracteristicas, atualizado_em')
      .order('conta_omie', { ascending: true })
      .order('codigo', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    todos.push(...(data || []).map(decodeCaractRow));
    if (!data || data.length < PAGE) break;
  }
  // Modelo/marca vêm da tabela `produtos` (por conta_omie MINÚSCULO + codigo_produto).
  // Join em tempo de leitura: aparecem sem migration nem re-sync.
  const modeloMarca = await lerModeloMarca();
  const colunasSet = new Set<string>();
  let ultimaSync: string | null = null;
  const produtos = todos.map((r) => {
    const car: Record<string, any> = {};
    Object.entries(r.caracteristicas || {}).forEach(([k, v]) => {
      if (caractOculta(k)) return;
      car[k] = v;
      colunasSet.add(k);
    });
    if (r.atualizado_em && (!ultimaSync || r.atualizado_em > ultimaSync)) ultimaSync = r.atualizado_em;
    const mm = modeloMarca.get(`${String(r.conta_omie).toLowerCase()}:${String(r.codigo_produto)}`) || null;
    return {
      empresa: r.conta_omie, codigo_produto: r.codigo_produto, codigo: r.codigo, descricao: r.descricao,
      modelo: (mm && mm.modelo) || '', marca: (mm && mm.marca) || '', estoque: (mm && mm.estoque) || 0,
      caracteristicas: car,
    };
  });
  const colunas = Array.from(colunasSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const st = await lerStatusSync();
  const concluida = await ultimaSyncConcluida().catch(() => null);
  const daLinha = ultimaSync as string | null; // atribuída dentro do map: o TS não enxerga
  const ultima = concluida && (!daLinha || concluida > daLinha) ? concluida : daLinha;
  return { produtos, colunas, total: produtos.length, ultimaSync: ultima, sync: { rodando: st.rodando, etapa: st.etapa, erro: st.erro } };
}

// Atualiza o espelho e devolve o estado ANTES da alteração (valor antigo da
// característica + codigo/descricao) para o chamador montar o diff de auditoria.
async function atualizarCaractSupabase(label: string, codigoProduto: number | string, nome: string, conteudo: unknown): Promise<{ valorAntigo: string; codigo: string | null; descricao: string | null }> {
  const { data, error } = await supabase
    .from('produtos_caracteristicas')
    .select('caracteristicas, codigo, descricao')
    .eq('conta_omie', label)
    .eq('codigo_produto', codigoProduto)
    .maybeSingle();
  if (error) throw error;
  const car = (data && (data as any).caracteristicas) || {};
  const valorAntigo = car[nome] == null ? '' : String(car[nome]);
  car[nome] = conteudo == null ? '' : String(conteudo);
  // Peça ainda fora do espelho (cadastrada depois do último sync): antes o update
  // atingia 0 linhas em silêncio — a Omie era gravada e o portal não mostrava.
  // Agora a linha nasce aqui; o sync diário completa código/descrição.
  if (!data) {
    const { error: insErr } = await supabase
      .from('produtos_caracteristicas')
      .insert({ conta_omie: label, codigo_produto: codigoProduto, caracteristicas: car, atualizado_em: new Date().toISOString() });
    if (insErr) throw insErr;
    return { valorAntigo, codigo: null, descricao: null };
  }
  const { error: upErr } = await supabase
    .from('produtos_caracteristicas')
    .update({ caracteristicas: car, atualizado_em: new Date().toISOString() })
    .eq('conta_omie', label)
    .eq('codigo_produto', codigoProduto);
  if (upErr) throw upErr;
  return {
    valorAntigo,
    codigo: data && (data as any).codigo != null ? String((data as any).codigo) : null,
    descricao: data && (data as any).descricao != null ? String((data as any).descricao) : null,
  };
}

/** Edita a característica de um produto: grava no Omie + atualiza Supabase + audita.
 *  `acao` diferencia edição normal ('editar') de reversão ('reverter') no audit_log. */
export async function editarCaractProduto(empresa: string, codigoProduto: number | string, nome: string, conteudo: unknown, autor?: AutorEdicao, acao: string = 'editar'): Promise<any> {
  if (!empresa || !codigoProduto || !nome) throw new Error('empresa, codigo_produto e nome sao obrigatorios');
  if (caractOculta(nome)) throw new Error(`Caracteristica "${nome}" esta oculta e nao pode ser editada aqui`);
  const contaId = contaIdPorLabel(empresa);
  if (!contaId) throw new Error(`Empresa desconhecida: ${empresa}`);
  const empresaLabel = String(empresa).toUpperCase();
  const cp = Number(codigoProduto) || codigoProduto;
  const novo = conteudo == null ? '' : String(conteudo);
  await gravarCaractProduto(contaId, { codigoProduto, nomeCaract: nome, conteudo });
  const { valorAntigo, codigo, descricao } = await atualizarCaractSupabase(empresaLabel, cp, nome, conteudo);
  if (autor) {
    await registrarAuditLog({
      userId: autor.userId,
      userName: autor.userName,
      sistema: 'caracteristicas',
      acao,
      entidade: 'produto_caracteristica',
      entidadeId: `${empresaLabel}:${cp}`,
      entidadeLabel: codigo || descricao || String(cp),
      detalhes: { empresa: empresaLabel, codigo_produto: cp, codigo, descricao, caracteristica: nome, de: valorAntigo, para: novo },
    });
  }
  // Gravou característica de LOCAÇÃO → se a peça ficou com Prateleira/Andar/Caixa,
  // fecha a demanda de alocação dela (peça recebida sem endereço). Nunca lança.
  if (CHAVES_LOCACAO.has(normCaract(nome)) && novo.trim() !== '') await fecharSeAlocada(empresaLabel, cp, autor);
  return { ok: true, nome, conteudo: novo };
}

const CHAVES_LOCACAO = new Set(['#prateleira', '#andar', '#caixa', '#andar2', '#caixa2']);

/** Catálogo da Omie: valores permitidos por característica (união + por empresa). */
export async function catalogoCaracteristicas(): Promise<any> {
  const mapa: Record<string, Set<string>> = {};
  const porEmpresa: Record<string, Record<string, string[]>> = {};
  for (const c of getContasOmie()) {
    const label = c.label.toUpperCase();
    const cat = await listarCaracteristicas(c.id);
    const emp = porEmpresa[label] || (porEmpresa[label] = {});
    cat.forEach((item: any) => {
      if (caractOculta(item.nome)) return;
      const set = mapa[item.nome] || (mapa[item.nome] = new Set());
      const vals = item.conteudosPermitidos || [];
      vals.forEach((v: string) => set.add(v));
      emp[item.nome] = vals.slice().sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'));
    });
  }
  const out: Record<string, string[]> = {};
  Object.entries(mapa).forEach(([k, set]) => {
    out[k] = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  });
  return { catalogo: out, porEmpresa };
}

// ---- Sugestão de "Tipo:" ----

function normCmp(s: unknown): string {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function nomeColunaTipo(nomes: string[]): string | null {
  return nomes.find((n) => /tipo/i.test(n)) || null;
}
const _STOP = new Set(['e', 'de', 'da', 'do', 'com', 'para', 'por', 'a', 'o', 'as', 'os', 'sem']);
function stemPt(w: string): string {
  return w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w;
}
function tokenizar(s: unknown): string[] {
  return normCmp(s).split(/[^a-z0-9]+/).filter(Boolean);
}
function casaPalavra(a: string, b: string): boolean {
  const sa = stemPt(a);
  const sb = stemPt(b);
  if (sa === sb) return true;
  const lo = sa.length <= sb.length ? sa : sb;
  const hi = sa.length <= sb.length ? sb : sa;
  return lo.length >= 5 && hi.startsWith(lo);
}
const _valTokCache: Record<string, string[]> = {};
function tokensValor(v: string): string[] {
  if (_valTokCache[v]) return _valTokCache[v];
  const t = tokenizar(v).filter((w) => !_STOP.has(w) && w.length >= 2);
  _valTokCache[v] = t;
  return t;
}
function valorCasaDescricao(valor: string, descToks: string[]): boolean {
  const vt = tokensValor(valor);
  if (!vt.length) return false;
  return vt.every((vw) => descToks.some((dw) => casaPalavra(vw, dw)));
}

/** Sugere o "Tipo:" de UM produto a partir da descrição (reusa o mesmo matcher do
 *  botão "Sugerir Tipo:"). Retorna o candidato mais específico (ou null) + a lista.
 *  Usado pelo robô de classificação de recebidos. */
export async function sugerirTipoDaDescricao(conta: Conta, descricao: string): Promise<{ tipo: string | null; candidatos: string[] }> {
  const descToks = tokenizar(descricao);
  if (!descToks.length) return { tipo: null, candidatos: [] };
  let vals: string[] = [];
  try {
    const cat = await listarCaracteristicas(conta);
    const hit = (cat as any[]).find((x) => /tipo/i.test(String(x?.nome || '')));
    vals = hit ? (hit.conteudosPermitidos || []) : [];
  } catch (e: any) { console.warn('[sugerirTipoDaDescricao] catalogo:', e?.message); }
  if (!vals.length) return { tipo: null, candidatos: [] };
  const candidatos = vals.filter((v) => valorCasaDescricao(v, descToks));
  candidatos.sort((a, b) => tokensValor(b).length - tokensValor(a).length || b.length - a.length);
  return { tipo: candidatos[0] || null, candidatos };
}

/** Sugere "Tipo:" para produtos com esse campo vazio. */
export async function sugestoesTipo(): Promise<any> {
  const rows = await lerTodasCaractRows();
  const nomesPresentes = new Set<string>();
  rows.forEach((r) => Object.keys(r.caracteristicas || {}).forEach((k) => { if (!caractOculta(k)) nomesPresentes.add(k); }));
  const colTipo = nomeColunaTipo(Array.from(nomesPresentes));
  if (!colTipo) return { colTipo: null, valores: [], itens: [], aviso: 'Nenhuma coluna "Tipo" encontrada nos dados.' };

  const valoresPorLabel: Record<string, string[]> = {};
  const unionOmie = new Set<string>();
  for (const c of getContasOmie()) {
    const label = c.label.toUpperCase();
    let vals: string[] = [];
    try {
      const cat = await listarCaracteristicas(c.id);
      const hit = cat.find((x: any) => normCmp(x.nome) === normCmp(colTipo));
      vals = hit ? hit.conteudosPermitidos || [] : [];
    } catch (e: any) {
      console.warn('[sugestoes-tipo] catalogo', label, e.message);
    }
    valoresPorLabel[label] = vals;
    vals.forEach((v) => unionOmie.add(v));
  }
  const distintosBanco = new Set<string>();
  rows.forEach((r) => {
    const v = (r.caracteristicas || {})[colTipo];
    if (v != null && String(v).trim() !== '') distintosBanco.add(String(v).trim());
  });
  const fallback = Array.from(unionOmie.size ? unionOmie : distintosBanco);

  const itens: any[] = [];
  rows.forEach((r) => {
    const car = r.caracteristicas || {};
    const atual = car[colTipo];
    if (atual != null && String(atual).trim() !== '') return;
    const label = String(r.conta_omie).toUpperCase();
    const possiveis = valoresPorLabel[label] && valoresPorLabel[label].length ? valoresPorLabel[label] : fallback;
    const descToks = tokenizar(r.descricao);
    if (!descToks.length) return;
    const candidatos = possiveis.filter((v) => valorCasaDescricao(v, descToks));
    if (!candidatos.length) return;
    candidatos.sort((a, b) => tokensValor(b).length - tokensValor(a).length || b.length - a.length);
    itens.push({
      empresa: r.conta_omie,
      codigo_produto: r.codigo_produto,
      codigo: r.codigo,
      descricao: r.descricao,
      sugestao: candidatos.length === 1 ? candidatos[0] : null,
      candidatos,
    });
  });
  return { colTipo, valores: Array.from(unionOmie.size ? unionOmie : distintosBanco).sort((a, b) => a.localeCompare(b, 'pt-BR')), itens };
}

/** Aplica em lote os "Tipo:" confirmados (throttle). Se a Omie bloquear no meio
 *  ("consumo indevido", dura minutos), devolve os itens nao aplicados em
 *  `pendentes` + `aguardarSegundos` para o cliente esperar e reenviar. */
export async function aplicarTipoLote(itens: Array<{ empresa: string; codigo_produto: number | string; valor: string }>, nome?: string, autor?: AutorEdicao): Promise<any> {
  const colTipo = nome || 'Tipo:';
  const THROTTLE_MS = parseInt(process.env.CARACT_THROTTLE_MS || '', 10) >= 0 ? parseInt(process.env.CARACT_THROTTLE_MS || '', 10) : 700;
  const resultados: any[] = [];
  const pendentes: any[] = [];
  let bloqueado = false;
  let aguardarSegundos = 0;
  let primeiro = true;
  for (const it of itens) {
    if (bloqueado) {
      pendentes.push(it);
      continue;
    }
    if (!primeiro && THROTTLE_MS > 0) await sleep(THROTTLE_MS);
    primeiro = false;
    try {
      const contaId = contaIdPorLabel(it.empresa);
      if (!contaId) throw new Error(`Empresa desconhecida: ${it.empresa}`);
      const empresaLabel = String(it.empresa).toUpperCase();
      const cp = Number(it.codigo_produto) || it.codigo_produto;
      await gravarCaractProduto(contaId, { codigoProduto: it.codigo_produto, nomeCaract: colTipo, conteudo: it.valor, preferirIncluir: true });
      const { valorAntigo, codigo, descricao } = await atualizarCaractSupabase(empresaLabel, cp, colTipo, it.valor);
      if (autor) {
        await registrarAuditLog({
          userId: autor.userId,
          userName: autor.userName,
          sistema: 'caracteristicas',
          acao: 'editar-lote',
          entidade: 'produto_caracteristica',
          entidadeId: `${empresaLabel}:${cp}`,
          entidadeLabel: codigo || descricao || String(cp),
          detalhes: { empresa: empresaLabel, codigo_produto: cp, codigo, descricao, caracteristica: colTipo, de: valorAntigo, para: it.valor },
        });
      }
      resultados.push({ codigo_produto: it.codigo_produto, empresa: it.empresa, ok: true });
    } catch (e: any) {
      if (e.bloqueio) {
        bloqueado = true;
        aguardarSegundos = e.aguardarSegundos || 60;
        pendentes.push(it);
        continue;
      }
      resultados.push({ codigo_produto: it.codigo_produto, empresa: it.empresa, ok: false, erro: e.faultstring || e.message });
    }
  }
  return { ok: true, total: itens.length, aplicados: resultados.filter((r) => r.ok).length, bloqueado, aguardarSegundos, pendentes, resultados };
}
