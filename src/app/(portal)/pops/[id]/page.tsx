'use client'
// POPs — detalhe: conteúdo da versão escolhida, histórico com diff, e as ações
// conforme o papel (editar/nova versão, revisão, duplicar, modelo, arquivar).
export const dynamic = 'force-dynamic'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, Archive, BadgeCheck, BookOpenCheck, Copy, History, Library, Pencil, PlayCircle, Printer, Repeat, Trash2, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import type { ConfigPasso, EstadoVersao, TipoPasso } from '@/lib/pops/regras'
import { VersaoConteudo } from '@/components/pops/PassoPreview'
import HistoricoVersoes, { type VersaoResumo } from '@/components/pops/HistoricoVersoes'
import ModalDuplicar from '@/components/pops/ModalDuplicar'
import ModalExecutar from '@/components/pops/ModalExecutar'
import PainelCiencia from '@/components/pops/PainelCiencia'
import PainelAgendamentos, { type Agendamento } from '@/components/pops/PainelAgendamentos'
import PainelRevisao from '@/components/pops/PainelRevisao'
import {
  COR_POPS, EstadoChip, botao, botaoClaro, br, cartao, chamar, chip, pagina, primeiroNome, vazio, type UsuarioMapa,
} from '@/components/pops/comum'

interface Detalhe {
  pop: {
    id: string; codigo: string; titulo: string; dono_id: string; eh_template: boolean; template_tipo: 'sistema' | 'empresa' | null
    arquivado: boolean; proxima_revisao_em: string | null; periodicidade_revisao_dias: number
    origem_template_id: string | null; origem_template_versao: number | null; origem_pop_id: string | null
  }
  area: { sigla: string; nome: string } | null
  versoes: (VersaoResumo & { objetivo: string; escopo: string; materiais: string })[]
  versao: VersaoResumo & { objetivo: string; escopo: string; materiais: string }
  passos: { tipo: TipoPasso; titulo: string; ajuda: string; obrigatorio: boolean; config: ConfigPasso; midia_url: string | null }[]
  usuarios: UsuarioMapa
  revisao: { ticket_id: string; responsavel_id: string; versao_id: string } | null
  agendamentos: Agendamento[]
  modelo_atualizado: boolean
  minha_ciencia: string | null
  papeis: { admin: boolean; editar: boolean; aprovar: boolean; executar: boolean }
}

function Detalhe() {
  const { id } = useParams<{ id: string }>()
  const sp = useSearchParams()
  const router = useRouter()
  const { userProfile } = useAuth()
  const [d, setD] = useState<Detalhe | null>(null)
  const [erro, setErro] = useState('')
  const [executar, setExecutar] = useState(false)
  const [aba, setAba] = useState<'conteudo' | 'historico' | 'ciencia' | 'recorrencia'>('conteudo')
  const [lendo, setLendo] = useState(false)
  const [duplicar, setDuplicar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const versaoPedida = sp.get('versao') || ''

  const carregar = useCallback(async () => {
    try { setD(await chamar<Detalhe>(`/api/pops/${id}${versaoPedida ? `?versao=${versaoPedida}` : ''}`)) }
    catch (e) { setErro((e as Error).message) }
  }, [id, versaoPedida])
  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])
  // Veio pelo QR da folha impressa (?executar=1): abre "Executar" para quem pode.
  const viaQr = sp.get('executar') === '1'
  const [qrTratado, setQrTratado] = useState(false)
  if (viaQr && d && !qrTratado) {
    setQrTratado(true)
    if (d.papeis.executar && d.versoes.some((v) => v.estado === 'publicado') && d.pop.template_tipo !== 'sistema') setExecutar(true)
  }

  const darCiencia = async (versaoId: string) => {
    setLendo(true); setAviso('')
    try { await chamar('/api/pops/ciencia', { json: { versao_id: versaoId } }); await carregar() }
    catch (e) { setAviso((e as Error).message) } finally { setLendo(false) }
  }

  const acao = async (corpo: Record<string, unknown>, depois?: (r: Record<string, unknown>) => void, confirmar?: string) => {
    if (confirmar && !confirm(confirmar)) return
    setOcupado(true); setAviso('')
    try {
      const r = await chamar<Record<string, unknown>>(`/api/pops/${id}/acoes`, { json: corpo })
      window.dispatchEvent(new Event('pops-mudou'))
      if (depois) depois(r); else await carregar()
    } catch (e) { setAviso((e as Error).message) } finally { setOcupado(false) }
  }
  const patch = async (corpo: Record<string, unknown>) => {
    setOcupado(true); setAviso('')
    try { await chamar(`/api/pops/${id}`, { method: 'PATCH', json: corpo }); await carregar() }
    catch (e) { setAviso((e as Error).message) } finally { setOcupado(false) }
  }

  if (erro) return <div style={pagina}><div style={{ ...cartao, color: '#dc2626' }}>{erro}</div></div>
  if (!d) return <div style={pagina}><div style={vazio}>Carregando…</div></div>

  const { pop, versao, papeis } = d
  const publicada = d.versoes.find((v) => v.estado === 'publicado')
  const edicao = d.versoes.find((v) => v.estado === 'rascunho' || v.estado === 'em_revisao')
  const meuId = userProfile?.id || ''
  const versaoRev = d.revisao ? d.versoes.find((x) => x.id === d.revisao!.versao_id) : null
  // Quem enviou não aprova a própria versão (nem admin).
  const decidoRevisao = d.revisao && versaoRev?.submetido_por !== meuId && (d.revisao.responsavel_id === meuId || papeis.admin)
  const vencida = !!publicada && !!pop.proxima_revisao_em && pop.proxima_revisao_em < new Date().toISOString().slice(0, 10)
  const nome = (u: string | null | undefined) => (u ? d.usuarios[u]?.nome : null) || '—'

  return (
    <div style={pagina}>
      {/* Cabeçalho */}
      <div style={{ ...cartao, marginBottom: 14, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 900, color: COR_POPS, fontSize: 15 }}>{pop.codigo}</span>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: 'var(--portal-text,#111)', flex: '1 1 300px' }}>{pop.titulo}</h1>
          {pop.eh_template && <span style={chip('#4f46e5', 'rgba(79,70,229,.12)')}><Library size={12} /> modelo {pop.template_tipo === 'sistema' ? 'do sistema' : 'da empresa'}</span>}
          {pop.arquivado && <span style={chip('#6b7280', 'rgba(107,114,128,.14)')}>arquivado</span>}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
          <span>{d.area ? `${d.area.sigla} · ${d.area.nome}` : ''}</span>
          <span>dono <strong>{nome(pop.dono_id)}</strong></span>
          {publicada && <span>vigente: <strong>v{publicada.numero}</strong> desde {br(publicada.publicado_em?.slice(0, 10))}</span>}
          {publicada && <span style={{ color: vencida ? '#b45309' : undefined, fontWeight: vencida ? 800 : 400 }}>
            {vencida && <AlertTriangle size={13} style={{ verticalAlign: -2 }} />} revisar até {br(pop.proxima_revisao_em)}
          </span>}
          {edicao && <EstadoChip estado={edicao.estado as EstadoVersao} numero={edicao.numero} />}
        </div>
        {d.modelo_atualizado && (
          <div style={{ fontSize: 13, color: '#4f46e5', fontWeight: 600 }}>
            O modelo de origem tem versão mais nova que a v{pop.origem_template_versao} usada nesta cópia.{' '}
            <Link href={`/pops/${pop.origem_template_id}`} style={{ color: '#4f46e5' }}>Ver o modelo</Link> (nada muda aqui sozinho).
          </div>
        )}

        {/* Ações */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {papeis.executar && publicada && pop.template_tipo !== 'sistema' && (
            <button onClick={() => setExecutar(true)} style={botao('#059669')}><PlayCircle size={15} /> Executar</button>
          )}
          {papeis.editar && edicao?.estado === 'rascunho' && (
            <Link href={`/pops/${id}/editar?versao=${edicao.id}`} style={{ ...botao(COR_POPS), textDecoration: 'none' }}><Pencil size={14} /> Editar rascunho v{edicao.numero}</Link>
          )}
          {papeis.editar && !edicao && publicada && !pop.arquivado && (
            <button disabled={ocupado} onClick={() => acao({ acao: 'nova_versao' }, (r) => router.push(`/pops/${id}/editar?versao=${r.versao_id}`))} style={botao(COR_POPS)}>
              <Pencil size={14} /> Editar (cria v{publicada.numero + 1})
            </button>
          )}
          {papeis.editar && edicao?.estado === 'rascunho' && edicao.numero > 1 && (
            <button disabled={ocupado} onClick={() => acao({ acao: 'descartar_rascunho', versao_id: edicao.id }, undefined, 'Descartar este rascunho?')} style={botaoClaro()}>
              <Trash2 size={14} /> Descartar rascunho
            </button>
          )}
          {papeis.editar && !publicada && d.versoes.every((v) => v.estado === 'rascunho') && (
            <button disabled={ocupado} onClick={() => acao({ acao: 'excluir' }, () => router.push('/pops'), 'Excluir este POP? (nunca foi publicado)')} style={{ ...botaoClaro(), color: '#dc2626' }}>
              <Trash2 size={14} /> Excluir
            </button>
          )}
          {papeis.editar && publicada && (
            <button disabled={ocupado} onClick={() => acao({ acao: 'revisado' })} style={botaoClaro()} title="Revisão periódica sem mudança: empurra a próxima revisão">
              <BadgeCheck size={14} /> Continua valendo
            </button>
          )}
          {publicada && <button onClick={() => setDuplicar(true)} style={botaoClaro()}><Copy size={14} /> Duplicar</button>}
          {publicada && (
            <a href={`/pops/${id}/imprimir`} target="_blank" rel="noopener noreferrer" style={{ ...botaoClaro(), textDecoration: 'none' }}><Printer size={14} /> Imprimir (OPL)</a>
          )}
          {papeis.admin && publicada && pop.template_tipo !== 'sistema' && (
            <button disabled={ocupado} onClick={() => acao({ acao: 'promover_template', template: !pop.eh_template })} style={botaoClaro()}>
              <Library size={14} /> {pop.eh_template ? 'Deixar de ser modelo' : 'Tornar modelo'}
            </button>
          )}
          {papeis.editar && publicada && (
            <button disabled={ocupado} onClick={() => patch({ arquivado: !pop.arquivado })} style={botaoClaro()}>
              <Archive size={14} /> {pop.arquivado ? 'Desarquivar' : 'Arquivar'}
            </button>
          )}
        </div>
        {aviso && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{aviso}</div>}
        {viaQr && !papeis.executar && (
          <div style={{ fontSize: 13, color: '#b45309', fontWeight: 600 }}>Você abriu pelo QR. Para executar este POP peça a permissão a quem cuida dele; abaixo está o procedimento.</div>
        )}
      </div>

      {decidoRevisao && d.revisao && (() => {
        const v = d.versoes.find((x) => x.id === d.revisao!.versao_id)
        return v ? (
          <div style={{ marginBottom: 14 }}>
            {versao.id !== v.id && (
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <Link href={`/pops/${id}?versao=${v.id}`} style={{ color: COR_POPS, fontWeight: 700 }}>Ler a v{v.numero} antes de decidir</Link>
              </div>
            )}
            <PainelRevisao ticketId={d.revisao.ticket_id} numero={v.numero} changelog={v.changelog}
              onDecidido={() => router.replace(`/pops/${id}`)} />
          </div>
        ) : null
      })()}
      {d.revisao && !decidoRevisao && (
        <div style={{ ...cartao, marginBottom: 14, fontSize: 14 }}>
          Em revisão com <strong>{nome(d.revisao.responsavel_id)}</strong>{versaoRev?.submetido_por === meuId ? ' — você enviou, então outra pessoa aprova' : ''}.
        </div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button onClick={() => setAba('conteudo')} style={aba === 'conteudo' ? botao(COR_POPS) : botaoClaro()}>Conteúdo</button>
        <button onClick={() => setAba('historico')} style={aba === 'historico' ? botao(COR_POPS) : botaoClaro()}><History size={14} /> Histórico ({d.versoes.length})</button>
        {papeis.editar && publicada && <button onClick={() => setAba('ciencia')} style={aba === 'ciencia' ? botao(COR_POPS) : botaoClaro()}><Users size={14} /> Ciência</button>}
        {papeis.editar && publicada && pop.template_tipo !== 'sistema' && (
          <button onClick={() => setAba('recorrencia')} style={aba === 'recorrencia' ? botao(COR_POPS) : botaoClaro()}><Repeat size={14} /> Recorrência ({d.agendamentos.length})</button>
        )}
      </div>

      {aba === 'ciencia' && publicada ? (
        <PainelCiencia popId={id} versaoId={publicada.id} numero={publicada.numero} />
      ) : aba === 'recorrencia' ? (
        <PainelAgendamentos popId={id} agendamentos={d.agendamentos} usuarios={d.usuarios} onMudou={carregar} />
      ) : aba === 'conteudo' ? (
        <div style={cartao}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <EstadoChip estado={versao.estado} numero={versao.numero} />
            {versao.estado === 'obsoleto' && <span style={{ fontSize: 13, color: '#b45309' }}>Versão antiga — não é a que vale hoje.</span>}
            {d.versoes.length > 1 && (
              <select value={versao.id} onChange={(e) => router.replace(`/pops/${id}?versao=${e.target.value}`)} style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)' }}>
                {d.versoes.map((v) => <option key={v.id} value={v.id}>v{v.numero} — {v.estado.replace('_', ' ')}</option>)}
              </select>
            )}
          </div>
          <VersaoConteudo objetivo={versao.objetivo} escopo={versao.escopo} materiais={versao.materiais} passos={d.passos} />
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
            {publicada && versao.id === publicada.id && <>Aprovada por {primeiroNome(nome(publicada.aprovado_por))}. </>}
            {d.minha_ciencia && <>Você deu ciência desta versão em {br(d.minha_ciencia.slice(0, 10))}.</>}
          </div>
          {versao.estado === 'publicado' && !d.minha_ciencia && (
            <button disabled={lendo} onClick={() => darCiencia(versao.id)} style={{ ...botao('#0f766e'), marginTop: 12 }}>
              <BookOpenCheck size={15} /> {lendo ? 'Registrando…' : 'Li e entendi esta versão'}
            </button>
          )}
        </div>
      ) : (
        <HistoricoVersoes popId={id} versoes={d.versoes} usuarios={d.usuarios} />
      )}

      {executar && <ModalExecutar popId={id} codigo={pop.codigo} meuId={meuId} onFechar={() => setExecutar(false)} />}
      {duplicar && <ModalDuplicar popId={id} codigo={pop.codigo} titulo={pop.titulo} onFechar={() => setDuplicar(false)} />}
    </div>
  )
}

export default function DetalhePage() {
  return <Suspense fallback={null}><Detalhe /></Suspense>
}
