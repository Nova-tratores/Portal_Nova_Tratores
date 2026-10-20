// LANÇAMENTOS FORA DE OS NA LOUSA — gravação (SERVIDOR). Regras puras em ./ausencias.ts.
// Lousa: uma linha em lousa_servicos por dia × técnico, todas com o mesmo grupo_id.
// RH (banco próprio, service key RH_SUPABASE_*), decisão do José (20/10/2026):
//   - Falta e Médico → rh_ponto_eventos como PENDENTE de validação (valor 0, sem mexer
//     na folha), igual ao atestado do RH; o atestado vai para rh-documentos/atestados/…
//   - Férias → rh_ferias_pedidos (pedido para o RH aprovar; o RH agenda no módulo Férias).
// Se o RH falhar, a Lousa grava assim mesmo e marca rh_status = 'erro' com o motivo.
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { TBL_LOUSA } from '@/lib/pos/constants'
import { carregarDiretorio } from '@/lib/agenda/server'
import { validarLancamento, diasDasFerias, horarioDe, quantidadeRH, observacaoRH, VAI_PARA_RH, ROTULO, type Lancamento } from './ausencias'

export class ErroLancamento extends Error { constructor(msg: string, public status = 400) { super(msg) } }

const COR: Record<string, string> = { reuniao: '#7c3aed', folga: '#64748b', ferias: '#0d9488', falta: '#dc2626', medico: '#d97706' }

let rhCli: SupabaseClient | null = null
function rh(): SupabaseClient | null {
  if (!process.env.RH_SUPABASE_URL || !process.env.RH_SUPABASE_SERVICE_KEY) return null
  if (!rhCli) rhCli = createClient(process.env.RH_SUPABASE_URL, process.env.RH_SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  return rhCli
}

interface FuncRH { id: string; empresa_id: string | null; empresa: string | null; nome: string }
async function funcionariosRH(c: SupabaseClient, portalIds: string[]): Promise<Map<string, FuncRH>> {
  const { data, error } = await c.from('rh_funcionarios').select('id, nome, empresa, empresa_id, portal_user_id').in('portal_user_id', portalIds)
  if (error) throw new Error(error.message)
  const m = new Map<string, FuncRH>()
  for (const f of (data || []) as (FuncRH & { portal_user_id: string })[]) m.set(f.portal_user_id, f)
  return m
}
/** código da empresa (NOVA/CASTRO/…) como o RH grava em `empresa` */
async function codigoEmpresa(c: SupabaseClient, f: FuncRH): Promise<string | null> {
  if (!f.empresa_id) return f.empresa
  const { data } = await c.from('rh_empresas').select('codigo').eq('id', f.empresa_id).maybeSingle()
  return ((data as { codigo?: string } | null)?.codigo) || f.empresa
}

export interface Anexo { nome: string; tipo: string; bytes: ArrayBuffer }

export async function lancar(l: Lancamento, anexo: Anexo | null, quem: { id: string; nome: string }) {
  const erro = validarLancamento({ ...l, temAnexo: !!anexo })
  if (erro) throw new ErroLancamento(erro)
  const dir = await carregarDiretorio()
  const pessoas = l.tecnicos.map((id) => dir.pessoas.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
  if (!pessoas.length) throw new ErroLancamento('Técnico não encontrado.')

  const grupo = randomUUID()
  const dias = l.tipo === 'ferias' ? diasDasFerias(l.dia, Number(l.diasFerias)) : [l.dia]
  const h = l.tipo === 'ferias' ? { ini: '08:00', fim: '18:00' } : horarioDe(l)
  const periodo = l.tipo === 'ferias' || l.duracao === 'dia' ? 'dia' : l.duracao === 'tarde' ? 'tarde' : l.duracao === 'manha' ? 'manha' : (Number(h.ini.slice(0, 2)) < 12 ? 'manha' : 'tarde')
  const titulo = (l.titulo || '').trim() || ROTULO[l.tipo]

  // 1) RH primeiro (para gravar o vínculo na Lousa)
  const destinoRH = VAI_PARA_RH[l.tipo]
  const rhPorTecnico = new Map<string, { status: 'enviado' | 'erro' | 'sem_rh'; ref: string | null; erro: string | null; anexo: string | null }>()
  if (destinoRH) {
    const c = rh()
    if (!c) for (const p of pessoas) rhPorTecnico.set(p.id, { status: 'erro', ref: null, erro: 'RH não configurado neste servidor.', anexo: null })
    else {
      const funcs = await funcionariosRH(c, pessoas.map((p) => p.id)).catch((e) => { throw new ErroLancamento(`Não consegui ler o RH: ${(e as Error).message}`, 502) })
      for (const p of pessoas) {
        const f = funcs.get(p.id)
        if (!f) { rhPorTecnico.set(p.id, { status: 'sem_rh', ref: null, erro: `${p.nome} não está vinculado a um funcionário no RH (portal_user_id).`, anexo: null }); continue }
        try {
          const empresa = await codigoEmpresa(c, f)
          if (destinoRH === 'pedido_ferias') {
            const { data, error } = await c.from('rh_ferias_pedidos').insert({
              funcionario_id: f.id, empresa, empresa_id: f.empresa_id, data_inicio: dias[0], data_fim: dias[dias.length - 1], dias: dias.length,
              origem: 'lousa', observacao: (l.motivo || '').trim() || null, solicitado_por: quem.nome, portal_ref: `${grupo}:${p.id}`,
            }).select('id').single()
            if (error) throw new Error(/rh_ferias_pedidos|does not exist|schema cache/i.test(error.message) ? 'O RH ainda não tem a tabela de pedidos de férias (rodar sql/36_ferias_pedidos.sql no Supabase do RH).' : error.message)
            rhPorTecnico.set(p.id, { status: 'enviado', ref: (data as { id: string }).id, erro: null, anexo: null })
          } else {
            let path: string | null = null
            if (anexo) {
              const nome = anexo.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)
              path = `atestados/${f.id}/${Date.now()}-${nome}`
              const up = await c.storage.from('rh-documentos').upload(path, anexo.bytes, { contentType: anexo.tipo || 'application/octet-stream', upsert: false })
              if (up.error) throw new Error(`atestado: ${up.error.message}`)
            }
            const q = quantidadeRH(l)
            const { data, error } = await c.from('rh_ponto_eventos').insert({
              funcionario_id: f.id, empresa, empresa_id: f.empresa_id, data: l.dia, tipo: 'falta', quantidade: q.quantidade, unidade: q.unidade,
              // pendente: o RH decide abonar/descontar/compensar; o destino aqui é só a sugestão
              destino: l.tipo === 'medico' || l.justificada ? 'abonar' : 'deduzir_salario', validacao: 'pendente',
              valor_calculado: 0, horas_banco_delta: 0, observacao: observacaoRH(l, quem.nome), arquivo_url: path, status: 'ativo',
            }).select('id').single()
            if (error) throw new Error(error.message)
            rhPorTecnico.set(p.id, { status: 'enviado', ref: (data as { id: string }).id, erro: null, anexo: path })
          }
        } catch (e) {
          rhPorTecnico.set(p.id, { status: 'erro', ref: null, erro: (e as Error).message, anexo: null })
        }
      }
    }
  }

  // 2) Lousa: uma linha por dia × técnico
  const linhas = pessoas.flatMap((p) => dias.map((d) => {
    const r = rhPorTecnico.get(p.id)
    return {
      data: d, tipo: l.tipo, tecnico_nome: p.nome, periodo, cor: COR[l.tipo], titulo, descricao: titulo,
      hora_inicio: periodo === 'dia' ? null : h.ini, hora_fim: periodo === 'dia' ? null : h.fim,
      motivo: (l.motivo || '').trim() || null, justificada: l.tipo === 'falta' ? !!l.justificada : null, anexo_path: r?.anexo || null,
      grupo_id: grupo, rh_ref: r?.ref || null, rh_status: r ? r.status : null, rh_erro: r?.erro || null,
      criado_por_id: quem.id, criado_por_nome: quem.nome,
    }
  }))
  const ins = await supabaseAdmin.from(TBL_LOUSA).insert(linhas)
  if (ins.error) {
    if (/column|schema cache/i.test(ins.error.message)) throw new ErroLancamento('Falta rodar sql/lousa-ausencias.sql no Supabase do Portal.', 503)
    throw new ErroLancamento(ins.error.message, 500)
  }
  const problemas = [...rhPorTecnico.entries()].filter(([, r]) => r.status !== 'enviado').map(([id, r]) => `${pessoas.find((p) => p.id === id)?.nome}: ${r.erro}`)
  return { grupo, linhas: linhas.length, rh: destinoRH ? { enviados: [...rhPorTecnico.values()].filter((r) => r.status === 'enviado').length, problemas } : null }
}

/** Apaga o lançamento (o grupo inteiro ou só um dia). No RH, cancela o que ainda está pendente. */
export async function excluir(id: string, soEsteDia: boolean) {
  const { data, error } = await supabaseAdmin.from(TBL_LOUSA).select('id, grupo_id, tipo, rh_ref, rh_status, tecnico_nome').eq('id', id).limit(1)
  if (error) throw new ErroLancamento(error.message, 500)
  const linha = data?.[0] as { id: string; grupo_id: string | null; tipo: string; rh_ref: string | null } | undefined
  if (!linha) throw new ErroLancamento('Lançamento não encontrado.', 404)
  const q = supabaseAdmin.from(TBL_LOUSA).select('id, tipo, rh_ref')
  const { data: alvo } = soEsteDia || !linha.grupo_id ? await q.eq('id', id) : await q.eq('grupo_id', linha.grupo_id)
  const linhas = (alvo || []) as { id: string; tipo: string; rh_ref: string | null }[]
  const c = rh()
  const avisos: string[] = []
  if (c) {
    const refs = [...new Set(linhas.map((x) => x.rh_ref).filter((x): x is string => !!x))]
    for (const ref of refs) {
      const tipo = linhas.find((x) => x.rh_ref === ref)?.tipo
      // férias apagando só um dia não mexe no pedido inteiro
      if (tipo === 'ferias' && soEsteDia) { avisos.push('O pedido de férias no RH continua com as datas originais.'); continue }
      const tabela = tipo === 'ferias' ? 'rh_ferias_pedidos' : 'rh_ponto_eventos'
      const filtro = tipo === 'ferias' ? { campo: 'status', valor: 'pendente' } : { campo: 'validacao', valor: 'pendente' }
      const r = await c.from(tabela).update({ status: tipo === 'ferias' ? 'cancelado' : 'cancelado' }).eq('id', ref).eq(filtro.campo, filtro.valor).select('id')
      if (r.error || !r.data?.length) avisos.push(tipo === 'ferias' ? 'O RH já decidiu esse pedido de férias — ajuste lá.' : 'O RH já validou essa falta/atestado — ajuste no Ponto do RH.')
    }
  }
  const del = await supabaseAdmin.from(TBL_LOUSA).delete().in('id', linhas.map((x) => x.id))
  if (del.error) throw new ErroLancamento(del.error.message, 500)
  return { apagados: linhas.length, avisos }
}

/** link temporário do atestado (bucket privado do RH) */
export async function linkAtestado(path: string): Promise<string | null> {
  const c = rh()
  if (!c || !path) return null
  const { data } = await c.storage.from('rh-documentos').createSignedUrl(path, 300)
  return data?.signedUrl || null
}

