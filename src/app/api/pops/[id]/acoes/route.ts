// POPs — ações sobre o documento. TODAS exigem sessão + papel (lib/pops/regras).
// POST /api/pops/:id/acoes { acao, ... }
//
//   nova_versao                                  editar → v(n+1) rascunho copiada da publicada
//   salvar_rascunho { versao_id, cabecalho?, passos? }   editar (só rascunho; o banco reforça)
//   submeter { versao_id, changelog, aprovador_id? }     editar → ticket 'pop_revisao' com o aprovador
//   descartar_rascunho { versao_id }             editar (v2+; a v1 nunca publicada sai com `excluir`)
//   excluir                                       editar (só POP que nunca foi publicado)
//   duplicar { area_id, titulo? }                 dono da área de destino (ou admin)
//   promover_template { template: boolean }       admin do módulo
//   revisado                                      editar → confirma que a publicada continua valendo
//   exigir_ciencia { versao_id, usuarios[] }      editar (versão publicada)
//   upload_midia { versao_id, content_type }      editar → URL assinada de upload (bucket privado)
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { carregarTicket, notificarTicket } from '@/lib/tickets/server'
import {
  BUCKET_MIDIA, aprovadoresDaArea, atorDe, carregarPop, carregarVersao, erro, erroBanco, notificarUsuarios,
  passosDaVersao, rpc, urlDeUpload, usuarioAtivo, usuarioEhAdminPops,
} from '@/lib/pops/server'
import {
  ehAdminPops, normalizarPassos, podeCriarNaArea, podeEditarPop, uuidValido,
} from '@/lib/pops/regras'
import { hojeSP } from '@/lib/trabalho/cronograma-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function somarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  const { id } = await params
  if (!uuidValido(id)) return erro('POP não encontrado', 404)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  const acao = String(body.acao || '')

  try {
    const ator = await atorDe(auth)
    const pop = await carregarPop(id)
    if (!pop) return erro('POP não encontrado', 404)
    const editar = podeEditarPop(ator, pop)

    // Versão do corpo, sempre DESTE POP.
    const versaoDoCorpo = async () => {
      const vid = String(body.versao_id || '')
      if (!uuidValido(vid)) return null
      const v = await carregarVersao(vid)
      return v && v.pop_id === id ? v : null
    }

    // ------------------------------------------------------------ duplicar
    // (não exige editar a ORIGEM: basta poder lê-la publicada e criar no destino)
    if (acao === 'duplicar') {
      const area = String(body.area_id || '')
      if (!uuidValido(area)) return erro('Escolha a área de destino.')
      if (!podeCriarNaArea(ator, area)) return erro('Você não é dono de POPs na área de destino.', 403)
      const titulo = body.titulo ? String(body.titulo).trim().slice(0, 160) : ''
      const r = await rpc<{ pop_id: string; versao_id: string; codigo: string }>('pops_duplicar', {
        p_origem: id, p_area: area, p_dono: auth.userId, p_autor: auth.userId, p_titulo: titulo,
      })
      return NextResponse.json(r, { status: 201 })
    }

    // ------------------------------------------------------------ promover a modelo
    if (acao === 'promover_template') {
      if (!ehAdminPops(ator)) return erro('Só o admin do módulo gerencia modelos.', 403)
      if (pop.template_tipo === 'sistema') return erro('Modelo do sistema não muda de tipo.')
      const virar = body.template === true
      if (virar) {
        const { data: pub } = await supabaseAdmin.from('pops_versoes').select('id').eq('pop_id', id).eq('estado', 'publicado').maybeSingle()
        if (!pub) return erro('Só POP publicado vira modelo.')
      }
      const { error } = await supabaseAdmin.from('pops')
        .update({ eh_template: virar, template_tipo: virar ? 'empresa' : null }).eq('id', id)
      if (error) return erroBanco(error)
      return NextResponse.json({ ok: true })
    }

    if (!editar) return erro('Você não pode editar este POP.', 403)

    // ------------------------------------------------------------ nova versão
    if (acao === 'nova_versao') {
      const versao_id = await rpc<string>('pops_nova_versao', { p_pop: id, p_autor: auth.userId })
      return NextResponse.json({ versao_id }, { status: 201 })
    }

    // ------------------------------------------------------------ salvar rascunho
    if (acao === 'salvar_rascunho') {
      const v = await versaoDoCorpo()
      if (!v) return erro('Versão não encontrada.', 404)
      if (v.estado !== 'rascunho') return erro(`Esta versão está ${v.estado} e não pode ser editada.`, 409)
      let cabecalho: Record<string, string> | null = null
      if (body.cabecalho && typeof body.cabecalho === 'object') {
        const c = body.cabecalho as Record<string, unknown>
        cabecalho = {}
        for (const k of ['objetivo', 'escopo', 'materiais'] as const) {
          if (k in c) cabecalho[k] = String(c[k] ?? '').slice(0, 4000)
        }
      }
      let passos = null
      if ('passos' in body) {
        const n = normalizarPassos(body.passos)
        if ('erro' in n) return erro(n.erro)
        // Mídia só da pasta deste POP, ou a que já estava no rascunho (copiada da origem).
        const atuais = new Set((await passosDaVersao(v.id)).map((p) => p.midia_path).filter(Boolean))
        const ruim = n.passos.find((p) => p.midia_path && !p.midia_path.startsWith(`${id}/`) && !atuais.has(p.midia_path))
        if (ruim) return erro(`Mídia inválida no passo "${ruim.titulo}".`)
        passos = n.passos
      }
      await rpc('pops_salvar_rascunho', { p_versao: v.id, p_cabecalho: cabecalho, p_passos: passos })
      return NextResponse.json({ ok: true })
    }

    // ------------------------------------------------------------ submeter para revisão
    if (acao === 'submeter') {
      const v = await versaoDoCorpo()
      if (!v) return erro('Versão não encontrada.', 404)
      const changelog = String(body.changelog || '').trim()
      if (!changelog) return erro('Descreva o que mudou (changelog).')
      let aprovador = body.aprovador_id ? String(body.aprovador_id) : ''
      if (pop.template_tipo === 'sistema') {
        if (!uuidValido(aprovador) || !(await usuarioEhAdminPops(aprovador))) return erro('Modelo do sistema é aprovado por um admin do módulo — escolha quem.')
      } else {
        const lista = (await aprovadoresDaArea(pop.area_id)).filter((u) => u !== auth.userId)
        if (!aprovador) {
          if (lista.length !== 1) return erro(lista.length ? 'Escolha o aprovador.' : 'Esta área não tem outro aprovador designado — peça ao admin do módulo.', 400, { aprovadores: lista })
          aprovador = lista[0]
        } else if (!lista.includes(aprovador)) {
          return erro('O aprovador precisa ser um aprovador desta área (e não pode ser você).')
        }
      }
      if (aprovador === auth.userId) return erro('Você não pode aprovar a própria versão.')
      if (!(await usuarioAtivo(aprovador))) return erro('Aprovador inativo.')
      const ticketId = await rpc<string>('pops_submeter', {
        p_versao: v.id, p_autor: auth.userId, p_aprovador: aprovador, p_changelog: changelog,
      })
      const t = await carregarTicket(ticketId)
      if (t) {
        await notificarTicket(t.ticket, [aprovador], auth.userId,
          `Aprovar ${pop.codigo} v${v.numero}: ${pop.titulo}`, changelog.slice(0, 160))
      }
      return NextResponse.json({ ticket_id: ticketId })
    }

    // ------------------------------------------------------------ descartar rascunho
    if (acao === 'descartar_rascunho') {
      const v = await versaoDoCorpo()
      if (!v) return erro('Versão não encontrada.', 404)
      if (v.estado !== 'rascunho') return erro('Só rascunho pode ser descartado.', 409)
      if (v.numero === 1) return erro('A primeira versão sai junto com o POP (use excluir).')
      const { error } = await supabaseAdmin.from('pops_versoes').delete().eq('id', v.id)
      if (error) return erroBanco(error)
      return NextResponse.json({ ok: true })
    }

    // ------------------------------------------------------------ excluir POP nunca publicado
    if (acao === 'excluir') {
      const { data: vs } = await supabaseAdmin.from('pops_versoes').select('estado').eq('pop_id', id)
      if ((vs || []).some((v) => v.estado !== 'rascunho')) return erro('POP que já foi para revisão ou publicado não se apaga — arquive.', 409)
      const { error } = await supabaseAdmin.from('pops').delete().eq('id', id)
      if (error) return erroBanco(error)
      return NextResponse.json({ ok: true })
    }

    // ------------------------------------------------------------ revisão periódica sem mudança
    if (acao === 'revisado') {
      const { data: pub } = await supabaseAdmin.from('pops_versoes').select('id').eq('pop_id', id).eq('estado', 'publicado').maybeSingle()
      if (!pub) return erro('Sem versão publicada para confirmar.')
      const proxima = somarDias(hojeSP(), pop.periodicidade_revisao_dias)
      const { error } = await supabaseAdmin.from('pops')
        .update({ proxima_revisao_em: proxima, revisado_em: new Date().toISOString(), revisado_por: auth.userId }).eq('id', id)
      if (error) return erroBanco(error)
      return NextResponse.json({ proxima_revisao_em: proxima })
    }

    // ------------------------------------------------------------ exigir ciência
    if (acao === 'exigir_ciencia') {
      const v = await versaoDoCorpo()
      if (!v) return erro('Versão não encontrada.', 404)
      if (v.estado !== 'publicado') return erro('Ciência só se exige da versão publicada.')
      const usuarios = [...new Set((Array.isArray(body.usuarios) ? body.usuarios : []).map(String))].filter(uuidValido)
      if (!usuarios.length || usuarios.length > 300) return erro('Escolha de 1 a 300 pessoas.')
      const { data: ativos } = await supabaseAdmin.from('financeiro_usu').select('id').in('id', usuarios).neq('ativo', false)
      const ids = (ativos || []).map((u) => u.id as string)
      if (!ids.length) return erro('Nenhuma pessoa ativa na lista.')
      const { error } = await supabaseAdmin.from('pops_ciencia_exigida').upsert(
        ids.map((u) => ({ versao_id: v.id, usuario_id: u, exigido_por: auth.userId })),
        { onConflict: 'versao_id,usuario_id', ignoreDuplicates: true })
      if (error) return erroBanco(error)
      await notificarUsuarios(ids, auth.userId, `Leia e dê ciência: ${pop.codigo} v${v.numero}`, pop.titulo, `/pops/${id}`)
      return NextResponse.json({ exigidos: ids.length })
    }

    // ------------------------------------------------------------ mídia de apoio (upload)
    if (acao === 'upload_midia') {
      const v = await versaoDoCorpo()
      if (!v) return erro('Versão não encontrada.', 404)
      if (v.estado !== 'rascunho') return erro('Mídia só entra em rascunho.', 409)
      const up = await urlDeUpload(BUCKET_MIDIA, `${id}/${v.id}`, String(body.content_type || ''))
      return NextResponse.json(up)
    }

    return erro('Ação desconhecida.')
  } catch (e) {
    return erroBanco(e)
  }
}
