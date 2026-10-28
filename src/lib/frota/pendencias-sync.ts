// MOTOR DE SINCRONIZAÇÃO das pendências automáticas da frota (frota_pendencias).
// Aqui só LÊ as fontes e GRAVA o resultado; a decisão (o que abrir e o que
// fechar, por origem) é a função pura `planejarPendencias` em pendencias-plano.ts.
//
// Quem chama: GET /api/frota/pendencias?sync=1, POST /api/frota/pendencias/sync
// e o agendador interno (instrumentation.ts, a cada 15 min em produção).
// Uma execução por vez no processo: chamadas simultâneas esperam a que já está
// rodando (antes, duas telas abertas ao mesmo tempo inseriam a mesma pendência
// duas vezes).
import { createClient } from '@supabase/supabase-js';
import { paginar, emLotes } from '@/lib/db/paginar';
import {
  planejarPendencias, refsAbertas, ultimoChecklistPorPlaca,
  type PendenciaExistente, type RequisicaoSync, type OsSync, type OpaSync, type PreventivaSync, type ChamadoVendasSync,
} from '@/lib/frota/pendencias-plano';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export type ResultadoSync = { inseridas: number; resolvidas: number; erros: string[] };

let emAndamento: Promise<ResultadoSync> | null = null;

export function sincronizarPendencias(): Promise<ResultadoSync> {
  if (!emAndamento) {
    emAndamento = executar().finally(() => { emAndamento = null; });
  }
  return emAndamento;
}

const COLS_REQ = 'id, titulo, status, veiculo, hodometro, data';
const COLS_OS = 'Id_Ordem, Projeto, Status, Data';
const COLS_OPA = 'id, titulo, descricao, status, created_at, vinculo_tipo, vinculo_ref, resolvido_por_nome';
const COLS_CHAMADO = 'id, placa_id, placa, tipo, descricao, checklist_nome, respostas, tem_pendencia, status, vendedor_nome, created_at';

async function executar(): Promise<ResultadoSync> {
  const agora = Date.now();
  const erros: string[] = [];
  const d12 = new Date(); d12.setMonth(d12.getMonth() - 12);
  const mesLimite = `${d12.getFullYear()}-${String(d12.getMonth() + 1).padStart(2, '0')}`;
  const d120 = new Date(agora - 120 * 86400_000).toISOString().slice(0, 10);

  const [veic, multas, docs, comps, rows, checklists, reqsVm, osComProjeto, opas, chamados] = await Promise.all([
    // select('*') tolera a migração do sem_uso; carro SEM USO conta como inativo
    // aqui (não abre pendência de cadastro — e as abertas fecham sozinhas)
    supabase.from('frota_veiculos').select('*')
      .then((r) => ({ ...r, data: (r.data || []).map((v) => (v.sem_uso ? { ...v, ativo: false } : v)) })),
    paginar((de, ate) => supabase.from('frota_multas').select('id, veiculo_id').not('status_interno', 'in', '("paga","descontada","arquivada")').order('id').range(de, ate)),
    paginar((de, ate) => supabase.from('frota_documentos').select('id, veiculo_id, tipo, vigencia_fim').order('id').range(de, ate)),
    supabase.from('frota_componentes').select('id, sistema, subsistema, componente'),
    paginar((de, ate) => supabase.from('frota_pendencias').select('id, placa, origem, origem_ref, status, resolvida_em, data_ocorrencia, vinculo_tipo, vinculo_ref').order('id').range(de, ate)),
    supabase.from('veiculo_checklist').select('id, placa, mes_referencia').gte('mes_referencia', mesLimite).order('mes_referencia', { ascending: false }),
    supabase.from('Requisicao').select(COLS_REQ).eq('tipo', 'Veicular Manutenção').gte('data', d120),
    supabase.from('Ordem_Servico').select(COLS_OS).not('Projeto', 'is', null).gte('Data', d120),
    // Leitura tolerante: sem a migração opa-vinculo-veiculo (colunas vinculo_*)
    // o select falha e o bloco do Opa é pulado sem quebrar o resto.
    supabase.from('portal_opas').select(COLS_OPA).eq('vinculo_tipo', 'veiculo').gte('created_at', d120),
    // chamados do vendedor pelo app de vendas (Chamado Veicular)
    supabase.from('chamados_veiculares').select(COLS_CHAMADO).gte('created_at', d120),
  ]);
  if (veic.error || rows.error) {
    // sem veículos ou sem as pendências existentes não dá pra decidir nada
    return { inseridas: 0, resolvidas: 0, erros: [`leitura: ${(veic.error || rows.error)!.message}`] };
  }
  const pendencias = rows.data as PendenciaExistente[];

  // Fontes das pendências ABERTAS que caíram fora da janela de 120 dias:
  // busca por id, senão a OS/requisição antiga concluída nunca fecharia.
  const refs = refsAbertas(pendencias);
  const idsReqRecentes = new Set((reqsVm.data || []).map((r) => String(r.id)));
  const idsOsRecentes = new Set((osComProjeto.data || []).map((o) => String(o.Id_Ordem)));
  const idsOpaRecentes = new Set((opas.data || []).map((o) => String(o.id)));
  const idsChamadoRecentes = new Set((chamados.data || []).map((c) => String(c.id)));
  const [reqsAntigas, osAntigas, opasAntigos, chamadosAntigos] = await Promise.all([
    emLotes(refs.requisicoes.filter((id) => !idsReqRecentes.has(id)), (ids) => supabase.from('Requisicao').select(COLS_REQ).in('id', ids)),
    emLotes(refs.os.filter((id) => !idsOsRecentes.has(id)), (ids) => supabase.from('Ordem_Servico').select(COLS_OS).in('Id_Ordem', ids)),
    opas.error ? Promise.resolve({ data: [], error: null }) :
      emLotes(refs.opas.filter((id) => !idsOpaRecentes.has(id)), (ids) => supabase.from('portal_opas').select(COLS_OPA).in('id', ids)),
    chamados.error ? Promise.resolve({ data: [], error: null }) :
      emLotes(refs.chamadosVendas.filter((id) => !idsChamadoRecentes.has(id)), (ids) => supabase.from('chamados_veiculares').select(COLS_CHAMADO).in('id', ids)),
  ]);
  for (const r of [reqsAntigas, osAntigas, opasAntigos, chamadosAntigos]) if (r.error) erros.push(`fonte antiga: ${r.error.message}`);
  if (chamados.error) erros.push(`chamados do app de vendas: ${chamados.error.message}`);

  // itens do último checklist de cada placa
  let itensChecklist: unknown[] = [];
  if (!checklists.error) {
    const ids = [...ultimoChecklistPorPlaca(checklists.data || []).values()].map((c) => c.id);
    if (ids.length) {
      const itens = await emLotes(ids, (lote) => supabase
        .from('veiculo_checklist_itens')
        .select('checklist_id, item_key, titulo, observacao, foto_url, resposta')
        .in('checklist_id', lote));
      if (itens.error) erros.push(`itens do checklist: ${itens.error.message}`);
      itensChecklist = itens.data;
    }
  }

  // foto: primeiro anexo de IMAGEM de cada Opa aberto (vídeo não vira thumbnail)
  const listaOpas = opas.error ? null : [...(opas.data || []), ...(opasAntigos.data as OpaSync[])] as OpaSync[];
  const fotoPorOpa = new Map<string, string>();
  const idsOpaAbertos = (listaOpas || []).filter((o) => o.status === 'aberto').map((o) => o.id);
  if (idsOpaAbertos.length) {
    const anx = await emLotes(idsOpaAbertos, (lote) => supabase
      .from('portal_opas_anexos')
      .select('opa_id, url, tipo, created_at')
      .in('opa_id', lote)
      .order('created_at', { ascending: true }));
    if (anx.error) erros.push(`anexos do Opa: ${anx.error.message}`);
    for (const a of anx.data as { opa_id: string; url: string; tipo: string | null }[]) {
      if (String(a.tipo || '').startsWith('image') && !fotoPorOpa.has(a.opa_id)) fotoPorOpa.set(a.opa_id, a.url);
    }
  }

  // preventivas (lib/frota/preventiva): sem a migration ou com erro → bloco pulado
  let preventivas: PreventivaSync[] | null = null;
  try {
    const { calcularPreventivas } = await import('@/lib/frota/preventiva-server');
    const r = await calcularPreventivas(supabase, { agora });
    if (r.tabela) {
      preventivas = r.veiculos.flatMap((v) => v.itens.map((i) => ({
        placa: v.placa, plano_id: i.plano.id, nome: i.plano.nome, componente_id: i.plano.componente_id ?? null,
        estado: i.situacao.estado, texto: i.situacao.texto,
      })));
    }
  } catch (e) { erros.push(`preventivas: ${(e as Error).message}`); }

  const plano = planejarPendencias({
    agora,
    veiculos: veic.data || [],
    multas: multas.data,
    documentos: docs.data,
    componentes: comps.data || [],
    pendencias,
    checklists: checklists.error ? null : checklists.data || [],
    itensChecklist: itensChecklist as never[],
    requisicoes: reqsVm.error ? null : [...(reqsVm.data || []), ...reqsAntigas.data] as RequisicaoSync[],
    os: osComProjeto.error ? null : [...(osComProjeto.data || []), ...osAntigas.data] as OsSync[],
    opas: listaOpas,
    fotoPorOpa,
    preventivas,
    chamadosVendas: chamados.error ? null : [...(chamados.data || []), ...chamadosAntigos.data] as ChamadoVendasSync[],
  });

  // ── grava ──
  let inseridas = 0;
  if (plano.inserir.length) {
    const lote = await supabase.from('frota_pendencias').insert(plano.inserir);
    if (!lote.error) {
      inseridas = plano.inserir.length;
    } else {
      // um registro ruim (ou já existente — índice único) derrubava o lote
      // inteiro calado: tenta um a um e ignora só a duplicada (23505)
      for (const row of plano.inserir) {
        const { error } = await supabase.from('frota_pendencias').insert(row);
        if (!error) inseridas++;
        else if (error.code !== '23505') erros.push(`inserir ${String(row.placa)}/${String(row.origem)}: ${error.message}`);
      }
    }
  }

  const agoraIso = new Date().toISOString();
  const resultados = await Promise.all(plano.resolver.map((a) =>
    supabase.from('frota_pendencias')
      .update({
        status: 'resolvida', resolvida_por: 'Sistema', resolvida_em: agoraIso, resolucao: a.resolucao,
        ...(a.vinculo_tipo ? { vinculo_tipo: a.vinculo_tipo, vinculo_ref: a.vinculo_ref || null } : {}),
      })
      .eq('id', a.id).eq('status', 'aberta'),
  ));
  let resolvidas = 0;
  resultados.forEach((r, i) => {
    if (r.error) erros.push(`resolver ${plano.resolver[i].id}: ${r.error.message}`);
    else resolvidas++;
  });

  // pendência do app de vendas resolvida aqui → o vendedor vê o chamado como resolvido
  if (plano.chamadosVendasResolver.length) {
    const r = await supabase.from('chamados_veiculares')
      .update({ status: 'resolvido' })
      .in('id', plano.chamadosVendasResolver.map(Number)).eq('status', 'aberto');
    if (r.error) erros.push(`devolver chamados ao app de vendas: ${r.error.message}`);
  }

  if (erros.length) console.error('[frota-pendencias-sync]', erros.join(' | '));
  return { inseridas, resolvidas, erros };
}

/** Rodada do agendador interno (instrumentation.ts). Registra em cron_runs
 *  (job `frota-pendencias-sync`); a trava evita sobreposição entre réplicas. */
export async function rodarPendenciasAgendado(): Promise<string | null> {
  const { comCronRun } = await import('@/lib/cron/observar');
  // antes das pendências: desligado ou carro fora da frota não fica como responsável
  try {
    const { fecharResponsaveisSemDireito } = await import('./higiene-responsaveis-server');
    const h = await fecharResponsaveisSemDireito();
    if (h.fechados) console.log(`[frota] responsáveis fechados: ${h.motivos.join('; ')}`);
  } catch (e) {
    console.warn('[frota] higiene dos responsáveis falhou:', e instanceof Error ? e.message : e);
  }
  const r = await comCronRun('frota-pendencias-sync', async () => {
    const res = await sincronizarPendencias();
    if (res.erros.length && !res.inseridas && !res.resolvidas) throw new Error(res.erros.join(' | '));
    return res;
  }, { lockMinutos: 5 });
  if (r.pulado) return 'pulado (rodada anterior ainda aberta)';
  if (r.erro) return 'erro: ' + r.erro;
  const res = r.resultado!;
  // só fala quando aconteceu algo — a cada 15 min, log vazio vira ruído
  return res.inseridas || res.resolvidas || res.erros.length
    ? `abertas=${res.inseridas} fechadas=${res.resolvidas}${res.erros.length ? ` erros=${res.erros.length}` : ''}`
    : null;
}
