// POPs — execução disparada pela OS do POS. SERVER-ONLY.
// Regra (pops_gatilhos_os): "OS do tipo X que entrar na fase Y → execução deste
// POP para o técnico da OS", com a referência "OS-0852 · <chassi>".
// Quem chama: aplicarMudancaFase (na hora, só aquela OS) e o agendador a cada
// 10 min (todas as OS que estão na fase — pega mudança feita por outro caminho).
// Idempotente: pops_gatilhos_os_disparos tem PK (regra, OS) e é gravada ANTES de
// criar a execução; quem perde a corrida (23505) não cria nada.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { migrationFaltou } from '@/lib/marketing/erros'
import { carregarTicket, notificarTicket } from '@/lib/tickets/server'
import { gatilhoCasaComOS, refExecucaoDaOS } from './regras'
import { rpc } from './server'

interface Gatilho { id: string; pop_id: string; tipo_servico: string; fase: string; responsavel_padrao_id: string; ativo: boolean }
interface OS { Id_Ordem: string; Status: string | null; Tipo_Servico: string | null; Os_Tecnico: string | null; Projeto: string | null; Os_Cliente: string | null }

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// Nome do técnico na OS → usuário do portal (nome do cadastro ou o "nome de técnico"
// configurado no Admin, o mesmo que o Meu Painel usa).
async function diretorioTecnicos(): Promise<Map<string, string>> {
  const [us, ps] = await Promise.all([
    supabaseAdmin.from('financeiro_usu').select('id, nome').eq('ativo', true).limit(2000),
    supabaseAdmin.from('portal_permissoes').select('user_id, mecanico_tecnico_nome').not('mecanico_tecnico_nome', 'is', null).limit(2000),
  ])
  const ativos = new Set<string>()
  const porNome = new Map<string, string>()
  for (const u of (us.data || []) as { id: string; nome: string | null }[]) {
    ativos.add(u.id)
    if (u.nome?.trim()) porNome.set(norm(u.nome), u.id)
  }
  for (const p of (ps.data || []) as { user_id: string; mecanico_tecnico_nome: string | null }[]) {
    if (p.mecanico_tecnico_nome && ativos.has(p.user_id)) porNome.set(norm(p.mecanico_tecnico_nome), p.user_id)
  }
  return porNome
}

export interface ResultadoGatilhos {
  pulado?: string
  regras: number; os_na_fase: number; criadas: number; ja_existiam: number; erros: string[]
}

export async function verificarGatilhosOS(opts: { osIds?: string[] } = {}): Promise<ResultadoGatilhos> {
  const out: ResultadoGatilhos = { regras: 0, os_na_fase: 0, criadas: 0, ja_existiam: 0, erros: [] }
  const { data: gs, error: eg } = await supabaseAdmin.from('pops_gatilhos_os').select('*').eq('ativo', true).limit(500)
  if (eg) {
    if (migrationFaltou(eg)) return { ...out, pulado: 'migration sql/pops-04-gatilhos-os-etiquetas.sql não aplicada' }
    throw eg
  }
  const gatilhos = (gs || []) as Gatilho[]
  out.regras = gatilhos.length
  if (!gatilhos.length) return { ...out, pulado: 'nenhuma regra ativa' }

  // OS que estão em alguma das fases das regras (filtro fino por tipo/fase em código, sem acento).
  const fases = [...new Set(gatilhos.map((g) => g.fase))]
  let q = supabaseAdmin.from('Ordem_Servico').select('Id_Ordem, Status, Tipo_Servico, Os_Tecnico, Projeto, Os_Cliente').in('Status', fases).limit(2000)
  if (opts.osIds?.length) q = q.in('Id_Ordem', opts.osIds)
  const { data: oss, error: eo } = await q
  if (eo) throw eo
  const ordens = (oss || []) as OS[]
  out.os_na_fase = ordens.length

  const pares = ordens.flatMap((os) => gatilhos.filter((g) => gatilhoCasaComOS(g, os)).map((g) => ({ g, os })))
  if (!pares.length) return out

  const { data: ja } = await supabaseAdmin.from('pops_gatilhos_os_disparos').select('gatilho_id, os_id')
    .in('gatilho_id', [...new Set(pares.map((p) => p.g.id))]).in('os_id', [...new Set(pares.map((p) => p.os.Id_Ordem))])
  const feitos = new Set(((ja || []) as { gatilho_id: string; os_id: string }[]).map((d) => `${d.gatilho_id}|${d.os_id}`))
  const novos = pares.filter((p) => !feitos.has(`${p.g.id}|${p.os.Id_Ordem}`))
  out.ja_existiam = pares.length - novos.length
  if (!novos.length) return out

  const popIds = [...new Set(novos.map((p) => p.g.pop_id))]
  const pops = (await supabaseAdmin.from('pops').select('id, codigo, titulo, dono_id, arquivado').in('id', popIds)).data || []
  const popPorId = new Map(pops.map((p) => [p.id as string, p]))
  const tecnicos = await diretorioTecnicos()

  for (const { g, os } of novos) {
    const pop = popPorId.get(g.pop_id)
    if (!pop || pop.arquivado) continue
    // Reserva a vaga (regra, OS) — corrida com o outro gatilho termina aqui.
    const { error: eReserva } = await supabaseAdmin.from('pops_gatilhos_os_disparos').insert({ gatilho_id: g.id, os_id: os.Id_Ordem })
    if (eReserva) {
      if (eReserva.code === '23505') { out.ja_existiam++; continue }
      out.erros.push(`${os.Id_Ordem}: ${eReserva.message}`); continue
    }
    const responsavel = tecnicos.get(norm(os.Os_Tecnico)) || g.responsavel_padrao_id
    try {
      const ticketId = await rpc<string | null>('pops_criar_execucao', {
        p_pop: g.pop_id, p_solicitante: pop.dono_id, p_responsavel: responsavel,
        p_prazo: null, p_ref_externa: refExecucaoDaOS(os.Id_Ordem, os.Projeto),
        p_agendamento: null, p_data_referencia: null, p_visibilidade: 'privado',
      })
      await supabaseAdmin.from('pops_gatilhos_os_disparos').update({ ticket_id: ticketId })
        .eq('gatilho_id', g.id).eq('os_id', os.Id_Ordem)
      if (!ticketId) continue
      out.criadas++
      const t = await carregarTicket(ticketId)
      if (t) await notificarTicket(t.ticket, [responsavel], null,
        `${pop.codigo} — ${os.Id_Ordem}`, `${pop.titulo}${os.Os_Cliente ? ` · ${os.Os_Cliente}` : ''}. Preencha pelo celular.`, 'tarefa_nova')
    } catch (e) {
      // Fica registrado (com o motivo) e não tenta de novo para a mesma OS.
      const msg = (e as Error).message || 'erro'
      await supabaseAdmin.from('pops_gatilhos_os_disparos').update({ erro: msg.slice(0, 300) })
        .eq('gatilho_id', g.id).eq('os_id', os.Id_Ordem)
      out.erros.push(`${pop.codigo} ${os.Id_Ordem}: ${msg}`)
    }
  }
  return out
}

// Para o agendador e o log: texto curto.
export function resumoGatilhos(r: ResultadoGatilhos): string {
  if (r.pulado) return r.pulado
  return `${r.criadas} execução(ões) criada(s) · ${r.os_na_fase} OS na fase · ${r.regras} regra(s)${r.erros.length ? ` · ${r.erros.length} erro(s)` : ''}`
}
