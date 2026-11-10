// Robô das requisições paradas (Henri, 09–10/11/2026). Só servidor.
//  1. Requisição aberta com comprovante + valor + fornecedor → "Enviado ao financeiro"
//     (todas, de qualquer data; o card também faz isso na hora do anexo).
//  2. Lembretes das abertas desde REQ_LEMBRETES_DESDE (regras em lembretes.ts):
//     3 dias → sino de quem abriu · 7 → tarefa na Pendências · 15 → sino do gestor
//     direto (Organograma). Um resumo por pessoa por rodada. Só em horário comercial.
//  3. Tarefa de requisição que andou (saiu de aberta) é concluída sozinha.
// Sem a tabela requisicao_lembretes (sql/requisicoes-lembretes.sql) só o passo 1 roda.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { paginar } from '@/lib/db/paginar';
import {
  STATUS_ABERTOS, REQ_LEMBRETES_DESDE_PADRAO, prontaParaFinanceiro, planejarLembretes, usuarioDoSolicitante,
  gestorDe, linhaReq, linkReq, tituloTarefa, juntarFalta, type ReqLembrete, type UsuarioPortal, type LembretePlanejado,
} from './lembretes';

const TBL = 'requisicao_lembretes';
const COLS = 'id, titulo, tipo, status, origem, solicitante, fornecedor, valor_despeza, created_at, foto_nf, foto_nf2, foto_nf3, foto_nf4, foto_nf5, recibo_fornecedor';

const semTabela = (m: string) => /requisicao_lembretes/i.test(m) && /(does not exist|could not find|schema cache)/i.test(m);

/** Hora em Brasília, seg–sáb 07–19h. */
function horarioComercial(agora: Date): boolean {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(agora);
  const dia = p.find((x) => x.type === 'weekday')?.value;
  const hora = Number(p.find((x) => x.type === 'hour')?.value);
  return dia !== 'Sun' && hora >= 7 && hora < 19;
}

const hojeBR = (agora: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);

async function notificar(userId: string, titulo: string, descricao: string, link: string) {
  const { error } = await sb.from('portal_notificacoes').insert({ user_id: userId, tipo: 'requisicao', titulo: titulo.slice(0, 200), descricao: descricao.slice(0, 1000), link });
  if (error) console.warn('[req-lembretes] notificar:', error.message);
}

export interface ResultadoVigia { resumo?: string; pular?: string }

export async function vigiarRequisicoes(opts: { gravar?: boolean; agora?: Date } = {}): Promise<ResultadoVigia> {
  const gravar = opts.gravar !== false;
  const agora = opts.agora || new Date();
  const partes: string[] = [];

  const { data: reqs, error: errR } = await paginar<ReqLembrete>((de, ate) =>
    sb.from('Requisicao').select(COLS).in('status', [...STATUS_ABERTOS]).order('id').range(de, ate) as never);
  if (errR) throw new Error(`Requisicao: ${errR.message}`);

  // ── 1. ida automática ao financeiro ──
  const prontas = reqs.filter(prontaParaFinanceiro);
  let movidas = 0;
  const movidasPorPessoa = new Map<string, number[]>();
  const { data: usuariosRaw } = await sb.from('financeiro_usu').select('id, nome, email, ativo');
  const usuarios = (usuariosRaw || []) as UsuarioPortal[];
  for (const r of prontas) {
    if (!gravar) { movidas++; continue; }
    const { data, error } = await sb.from('Requisicao')
      .update({ status: 'financeiro', enviado_financeiro_data: hojeBR(agora) })
      .eq('id', r.id).in('status', [...STATUS_ABERTOS]).select('id');
    if (error || !data?.length) continue;
    movidas++;
    r.status = 'financeiro';
    await sb.from('audit_log').insert({
      user_nome: 'Robô das requisições', sistema: 'requisicoes', acao: 'editar', entidade: 'requisicao', entidade_id: String(r.id),
      detalhes: { status: 'financeiro', motivo: 'comprovante, valor e fornecedor preenchidos: enviada ao financeiro automaticamente' },
    });
    const u = usuarioDoSolicitante(r.solicitante, usuarios);
    if (u) movidasPorPessoa.set(u.id, [...(movidasPorPessoa.get(u.id) || []), r.id]);
  }
  if (gravar) {
    for (const [uid, ids] of movidasPorPessoa) {
      await notificar(uid, ids.length === 1 ? `Requisição #${ids[0]} foi para o financeiro` : `${ids.length} requisições foram para o financeiro`,
        `Com o comprovante anexado, ${ids.length === 1 ? 'ela foi enviada' : 'elas foram enviadas'} ao financeiro sozinha${ids.length === 1 ? '' : 's'}: ${ids.map((i) => `#${i}`).join(', ')}.`,
        ids.length === 1 ? linkReq(ids[0]) : '/requisicoes');
    }
  }
  if (movidas) partes.push(`${movidas} enviada(s) ao financeiro`);

  // ── 3. tarefas de requisições que andaram ──
  const { data: comTarefa, error: errT } = await sb.from(TBL).select('req_id, tarefa_id').not('tarefa_id', 'is', null).is('fechado_em', null);
  if (errT) {
    if (semTabela(errT.message)) return { resumo: [...partes, 'lembretes desligados: falta sql/requisicoes-lembretes.sql'].join(' · ') };
    throw new Error(errT.message);
  }
  const abertas = new Set(reqs.filter((r) => STATUS_ABERTOS.includes(String(r.status) as never)).map((r) => r.id));
  const fechar = (comTarefa || []).filter((t) => !abertas.has(Number(t.req_id)));
  if (gravar && fechar.length) {
    const ids = fechar.map((t) => Number(t.tarefa_id));
    await sb.from('portal_tarefas').update({ concluida: true, concluida_em: agora.toISOString() }).in('id', ids).eq('concluida', false);
    await sb.from(TBL).update({ fechado_em: agora.toISOString() }).in('req_id', fechar.map((t) => Number(t.req_id))).not('tarefa_id', 'is', null);
  }
  if (fechar.length) partes.push(`${fechar.length} tarefa(s) concluída(s)`);

  // ── 2. lembretes ──
  if (!horarioComercial(agora)) return partes.length ? { resumo: partes.join(' · ') } : { pular: 'fora do horário dos lembretes' };

  const desde = process.env.REQ_LEMBRETES_DESDE || REQ_LEMBRETES_DESDE_PADRAO;
  const { data: enviadosRaw } = await sb.from(TBL).select('req_id, nivel').gte('criado_em', `${desde}T00:00:00-03:00`);
  const enviados = new Set((enviadosRaw || []).map((e) => `${e.req_id}:${e.nivel}`));
  const plano = planejarLembretes(reqs, enviados, agora, desde);
  if (!plano.length) return partes.length ? { resumo: partes.join(' · ') } : { pular: 'nenhuma requisição parada' };

  const porId = new Map(reqs.map((r) => [r.id, r]));
  const { data: orgRaw } = await sb.from('org_pessoas').select('pessoa_chave, gestor_chave');
  const org = (orgRaw || []) as { pessoa_chave: string; gestor_chave: string | null }[];

  const aviso = new Map<string, LembretePlanejado[]>();
  const gestor = new Map<string, { quem: string; l: LembretePlanejado }[]>();
  const registros: { req_id: number; nivel: number; user_id: string | null; tarefa_id: number | null }[] = [];
  let tarefas = 0, semDono = 0;

  for (const l of plano) {
    const r = porId.get(l.reqId)!;
    const u = usuarioDoSolicitante(r.solicitante, usuarios);
    if (!u) { semDono++; registros.push({ req_id: l.reqId, nivel: l.nivel, user_id: null, tarefa_id: null }); continue; }
    if (l.nivel === 1) {
      aviso.set(u.id, [...(aviso.get(u.id) || []), l]);
      registros.push({ req_id: l.reqId, nivel: 1, user_id: u.id, tarefa_id: null });
    } else if (l.nivel === 2) {
      let tarefaId: number | null = null;
      if (gravar) {
        const { data } = await sb.from('portal_tarefas').insert({
          titulo: tituloTarefa(r, l.falta),
          descricao: `A requisição #${r.id} (${r.titulo || r.tipo || ''}) está aberta há ${l.dias} dias. Falta ${juntarFalta(l.falta)}. Com a nota ou o recibo, o valor e o fornecedor preenchidos ela vai sozinha para o financeiro e esta tarefa se fecha. Abrir: ${linkReq(r.id)}`,
          prioridade: 2, criado_por: u.id, atribuido_a: u.id,
        }).select('id').single();
        tarefaId = (data as { id: number } | null)?.id ?? null;
      }
      tarefas++;
      registros.push({ req_id: l.reqId, nivel: 2, user_id: u.id, tarefa_id: tarefaId });
    } else {
      const g = gestorDe(u.id, org);
      registros.push({ req_id: l.reqId, nivel: 3, user_id: g, tarefa_id: null });
      if (g) gestor.set(g, [...(gestor.get(g) || []), { quem: u.nome || '', l }]);
    }
  }

  if (gravar) {
    for (const [uid, ls] of aviso) {
      const linhas = ls.map((l) => linhaReq(porId.get(l.reqId)!, l.dias, l.falta));
      await notificar(uid, ls.length === 1 ? `Requisição #${ls[0].reqId} parada há ${ls[0].dias} dias` : `${ls.length} requisições suas paradas`,
        linhas.join('\n'), ls.length === 1 ? linkReq(ls[0].reqId) : '/requisicoes');
    }
    for (const [gid, ls] of gestor) {
      const linhas = ls.map(({ quem, l }) => `${quem}: ${linhaReq(porId.get(l.reqId)!, l.dias, l.falta)}`);
      await notificar(gid, `${ls.length} requisição(ões) da sua equipe paradas há mais de 15 dias`, linhas.join('\n'), '/requisicoes');
    }
    const { error } = await sb.from(TBL).upsert(registros.map((x) => ({ ...x, criado_em: agora.toISOString() })), { onConflict: 'req_id,nivel', ignoreDuplicates: true });
    if (error) throw new Error(`${TBL}: ${error.message}`);
  }

  const n1 = plano.filter((l) => l.nivel === 1).length;
  const n3 = plano.filter((l) => l.nivel === 3).length;
  partes.push(`lembretes: ${n1} aviso(s), ${tarefas} tarefa(s), ${n3} ao gestor${semDono ? `, ${semDono} sem dono` : ''}`);
  return { resumo: partes.join(' · ') };
}
