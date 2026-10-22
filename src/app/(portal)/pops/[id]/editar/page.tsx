'use client'
// POPs — editor do rascunho: cabeçalho + passos (arrastar ou ▲▼) com prévia ao lado.
// Salvar grava cabeçalho e a lista INTEIRA de passos de uma vez (pops_salvar_rascunho).
export const dynamic = 'force-dynamic'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus, Save, Send } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAlteracoesPendentes } from '@/lib/rascunho/pendencias'
import { normalizarPassos, TIPOS_PASSO, type ConfigPasso, type EstadoVersao, type TipoPasso } from '@/lib/pops/regras'
import EditorPasso, { type PassoEditavel } from '@/components/pops/EditorPasso'
import ModalSubmeter from '@/components/pops/ModalSubmeter'
import { DicasCampo, GuiaRedacao } from '@/components/pops/GuiaRedacao'
import { conferirRedacao } from '@/lib/pops/redacao'
import { VersaoConteudo } from '@/components/pops/PassoPreview'
import { COR_POPS, EstadoChip, botao, botaoClaro, campo, cartao, chamar, pagina, rotulo, vazio, type UsuarioMapa } from '@/components/pops/comum'

interface Detalhe {
  pop: { id: string; codigo: string; titulo: string; template_tipo: string | null }
  versao: { id: string; numero: number; estado: EstadoVersao; objetivo: string; escopo: string; materiais: string }
  passos: { chave: string; tipo: TipoPasso; titulo: string; ajuda: string; obrigatorio: boolean; config: ConfigPasso; midia_path: string | null; midia_url: string | null }[]
  aprovadores: string[]
  usuarios: UsuarioMapa
  papeis: { editar: boolean }
}

let seq = 0
const novaChaveLocal = () => `n${++seq}`

function Editor() {
  const { id } = useParams<{ id: string }>()
  const versaoId = useSearchParams().get('versao') || ''
  const router = useRouter()
  const { userProfile } = useAuth()
  const [d, setD] = useState<Detalhe | null>(null)
  const [erro, setErro] = useState('')
  const [titulo, setTitulo] = useState('')
  const [cab, setCab] = useState({ objetivo: '', escopo: '', materiais: '' })
  const [passos, setPassos] = useState<PassoEditavel[]>([])
  const [aberto, setAberto] = useState<string | null>(null)
  const [sujo, setSujo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [submeter, setSubmeter] = useState(false)
  const arrastando = useRef<number | null>(null)
  const [arrastandoK, setArrastandoK] = useState<string | null>(null)
  useAlteracoesPendentes(`pops-editor:${versaoId}`, sujo)

  const carregar = useCallback(async () => {
    try {
      const r = await chamar<Detalhe>(`/api/pops/${id}?versao=${versaoId}`)
      setD(r); setTitulo(r.pop.titulo)
      setCab({ objetivo: r.versao.objetivo, escopo: r.versao.escopo, materiais: r.versao.materiais })
      setPassos(r.passos.map((p) => ({ ...p, _k: novaChaveLocal(), ajuda: p.ajuda || '' })))
      setSujo(false)
    } catch (e) { setErro((e as Error).message) }
  }, [id, versaoId])
  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  const mudar = (fn: (l: PassoEditavel[]) => PassoEditavel[]) => { setPassos(fn); setSujo(true); setAviso('') }
  const incluir = (tipo: TipoPasso) => {
    const p: PassoEditavel = { _k: novaChaveLocal(), tipo, titulo: '', ajuda: '', obrigatorio: tipo !== 'instrucao', config: {}, midia_path: null }
    mudar((l) => [...l, p]); setAberto(p._k)
  }
  const mover = (i: number, j: number) => mudar((l) => {
    if (j < 0 || j >= l.length) return l
    const c = [...l]; const [x] = c.splice(i, 1); c.splice(j, 0, x); return c
  })

  const validacao = useMemo(() => normalizarPassos(passos), [passos])
  // Sugestões de escrita (não bloqueiam): cabeçalho e cada passo.
  const dicas = useMemo(() => conferirRedacao({ titulo, ...cab, passos }), [titulo, cab, passos])

  const salvar = async (): Promise<boolean> => {
    if ('erro' in validacao) { setAviso(validacao.erro); return false }
    setSalvando(true); setAviso('')
    try {
      await chamar(`/api/pops/${id}/acoes`, { json: { acao: 'salvar_rascunho', versao_id: versaoId, cabecalho: cab, passos: validacao.passos } })
      if (d && titulo.trim() !== d.pop.titulo) await chamar(`/api/pops/${id}`, { method: 'PATCH', json: { titulo } })
      await carregar(); setAviso('Salvo.')
      return true
    } catch (e) { setAviso((e as Error).message); return false } finally { setSalvando(false) }
  }

  if (erro) return <div style={pagina}><div style={{ ...cartao, color: '#dc2626' }}>{erro}</div></div>
  if (!d) return <div style={pagina}><div style={vazio}>Carregando…</div></div>
  if (!d.papeis.editar || d.versao.estado !== 'rascunho') {
    return (
      <div style={pagina}><div style={vazio}>
        {d.versao.estado !== 'rascunho' ? `Esta versão está ${d.versao.estado.replace('_', ' ')} e não pode ser editada.` : 'Você não pode editar este POP.'}{' '}
        <Link href={`/pops/${id}`} style={{ color: COR_POPS, fontWeight: 700 }}>Voltar ao POP</Link>
      </div></div>
    )
  }

  const previa = passos.map((p) => ({ ...p, config: p.config }))
  return (
    <div style={pagina}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Link href={`/pops/${id}`} style={{ ...botaoClaro(), textDecoration: 'none' }}><ArrowLeft size={14} /> POP</Link>
        <span style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 900, color: COR_POPS }}>{d.pop.codigo}</span>
        <EstadoChip estado="rascunho" numero={d.versao.numero} />
        <span style={{ flex: 1 }} />
        {aviso && <span style={{ fontSize: 13, fontWeight: 600, color: aviso === 'Salvo.' ? '#059669' : '#dc2626' }}>{aviso}</span>}
        {sujo && <span style={{ fontSize: 12, color: '#b45309' }}>alterações não salvas</span>}
        <button onClick={salvar} disabled={salvando} style={botaoClaro()}><Save size={14} /> {salvando ? 'Salvando…' : 'Salvar'}</button>
        <button onClick={async () => { if (!sujo || await salvar()) setSubmeter(true) }} disabled={salvando || !passos.length} style={botao(COR_POPS)}>
          <Send size={14} /> Enviar para revisão
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <GuiaRedacao total={dicas.length} />
          <div style={{ ...cartao, display: 'grid', gap: 12 }}>
            <div><label style={rotulo}>Título</label><input value={titulo} maxLength={160} onChange={(e) => { setTitulo(e.target.value); setSujo(true) }} style={campo} />
              <DicasCampo dicas={dicas.filter((x) => x.campo === 'titulo')} /></div>
            {(['objetivo', 'escopo', 'materiais'] as const).map((k) => (
              <div key={k}>
                <label style={rotulo}>{k === 'materiais' ? 'Materiais / EPIs' : k[0].toUpperCase() + k.slice(1)}</label>
                <textarea rows={2} value={cab[k]} maxLength={4000} onChange={(e) => { setCab({ ...cab, [k]: e.target.value }); setSujo(true) }} style={{ ...campo, resize: 'vertical' }} />
                <DicasCampo dicas={dicas.filter((x) => x.campo === k)} />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {passos.map((p, i) => (
              <div key={p._k}>
              <EditorPasso p={p} n={i + 1} total={passos.length} aberto={aberto === p._k} popId={id} versaoId={versaoId}
                onAbrir={() => setAberto(aberto === p._k ? null : p._k)}
                onMudar={(np) => mudar((l) => l.map((x) => (x._k === p._k ? np : x)))}
                onMover={(delta) => mover(i, i + delta)}
                onRemover={() => { if (confirm('Remover este passo?')) mudar((l) => l.filter((x) => x._k !== p._k)) }}
                arrastar={{
                  arrastando: arrastandoK === p._k,
                  onDragStart: () => { arrastando.current = i; setArrastandoK(p._k) },
                  onDragOver: (e) => { e.preventDefault(); const de = arrastando.current; if (de !== null && de !== i) { mover(de, i); arrastando.current = i } },
                  onDragEnd: () => { arrastando.current = null; setArrastandoK(null) },
                }} />
              <div style={{ padding: '0 6px' }}>
                <DicasCampo dicas={dicas.filter((x) => x.campo === 'passo' && x.passo === i)}
                  onAplicar={(t) => mudar((l) => l.map((x) => (x._k === p._k ? { ...x, titulo: t } : x)))} />
              </div>
              </div>
            ))}
            <div style={{ ...cartao, padding: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}><Plus size={14} style={{ verticalAlign: -2 }} /> Incluir passo:</span>
              {TIPOS_PASSO.map((t) => <button key={t.id} onClick={() => incluir(t.id)} style={botaoClaro()}>{t.label}</button>)}
            </div>
            {'erro' in validacao && passos.length > 0 && <div style={{ fontSize: 13, color: '#b45309' }}>⚠ {validacao.erro}</div>}
          </div>
        </div>

        <div style={{ ...cartao, position: 'sticky', top: 90, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--portal-text-muted,#888)', marginBottom: 8 }}>
            Prévia — como fica para quem executa
          </div>
          <h3 style={{ margin: '0 0 10px', fontSize: 18 }}>{d.pop.codigo} · {titulo}</h3>
          <VersaoConteudo {...cab} passos={previa} />
        </div>
      </div>

      {submeter && (
        <ModalSubmeter popId={id} versaoId={versaoId} numero={d.versao.numero} aprovadores={d.aprovadores} usuarios={d.usuarios}
          meuId={userProfile?.id || ''} modeloSistema={d.pop.template_tipo === 'sistema'} sugestoesRedacao={dicas.length}
          onFechar={() => setSubmeter(false)} onEnviado={() => { setSujo(false); router.push(`/pops/${id}`) }} />
      )}
    </div>
  )
}

export default function EditorPage() {
  return <Suspense fallback={null}><Editor /></Suspense>
}
