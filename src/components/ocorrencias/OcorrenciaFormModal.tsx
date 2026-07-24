'use client'
// Modal ÚNICO de lançamento de ocorrência — usado no Painel dos Mecânicos,
// no OSDrawer (categoria OS pré-selecionada), na tela de PPV (categoria PV)
// e no MotoristaDrawer da Frota (categoria Frota). Pontos vêm do CATÁLOGO
// (nunca digitados) e ficam em destaque vermelho antes de confirmar.
// Observação é obrigatória; anexos (fotos ≤10MB / vídeos ≤50MB, máx 5).
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertOctagon, Loader2, Paperclip, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  CATALOGO_OCORRENCIAS, CATEGORIAS, getSubcategoria, type CategoriaOcorrencia,
} from '@/lib/ocorrencias/catalogo'
import { registrarOcorrencia } from '@/lib/ocorrencias/registrar'
import { uploadAnexosOcorrencia, validarAnexo, ACCEPT_ANEXOS } from '@/lib/ocorrencias/anexos'

const INP: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', fontSize: 13, boxSizing: 'border-box', background: 'var(--portal-bg-card)', outline: 'none', color: 'var(--portal-text)' }
const MLBL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--portal-text-secondary)', display: 'block', marginBottom: 5 }

export default function OcorrenciaFormModal({
  aberto, onFechar, onRegistrada, tecnicos,
  categoriaInicial = 'os', tecnicoInicial = '', idOrdemInicial = '', criadoPor,
  arquivosIniciais,
}: {
  aberto: boolean
  onFechar: () => void
  /** Chamado após registrar com sucesso (recarregar listas do host). */
  onRegistrada?: () => void
  /** Nomes disponíveis no seletor de funcionário. */
  tecnicos: string[]
  categoriaInicial?: CategoriaOcorrencia
  tecnicoInicial?: string
  idOrdemInicial?: string
  criadoPor?: string | null
  /** Anexos já prontos ao abrir (ex.: print do clique direito). */
  arquivosIniciais?: File[]
}) {
  const [categoria, setCategoria] = useState<CategoriaOcorrencia>(categoriaInicial)
  const [subcategoria, setSubcategoria] = useState('')
  const [tecnico, setTecnico] = useState(tecnicoInicial)
  const [idOrdem, setIdOrdem] = useState(idOrdemInicial)
  const [observacao, setObservacao] = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // via ref pra não resetar o form se o host recriar o array num re-render
  const arquivosIniciaisRef = useRef<File[] | undefined>(arquivosIniciais)
  arquivosIniciaisRef.current = arquivosIniciais

  // Reset ao abrir (respeitando os pré-preenchidos do host)
  useEffect(() => {
    if (!aberto) return
    setCategoria(categoriaInicial)
    setSubcategoria('')
    setTecnico(tecnicoInicial)
    setIdOrdem(idOrdemInicial)
    setObservacao('')
    setArquivos((arquivosIniciaisRef.current ?? []).slice(0, 5))
    setErro('')
  }, [aberto, categoriaInicial, tecnicoInicial, idOrdemInicial])

  const cat = CATALOGO_OCORRENCIAS[categoria]
  const sub = useMemo(() => getSubcategoria(categoria, subcategoria), [categoria, subcategoria])

  const adicionarArquivos = (lista: FileList | null) => {
    if (!lista) return
    const novos: File[] = []
    let msg = ''
    for (const f of Array.from(lista)) {
      const invalido = validarAnexo(f)
      if (invalido) { msg = invalido; continue }
      novos.push(f)
    }
    setErro(msg)
    setArquivos(prev => [...prev, ...novos].slice(0, 5))
  }

  const salvar = async () => {
    setErro('')
    if (!tecnico) { setErro('Escolha o funcionário.'); return }
    if (!sub) { setErro('Escolha a subcategoria.'); return }
    if (!observacao.trim()) { setErro('A observação é obrigatória — descreva o que aconteceu.'); return }
    setSalvando(true)
    try {
      const { anexos, erros } = await uploadAnexosOcorrencia(arquivos)
      if (erros.length > 0 && anexos.length === 0 && arquivos.length > 0) {
        setErro(erros.join(' ')); setSalvando(false); return
      }
      const r = await registrarOcorrencia(supabase, {
        tecnico_nome: tecnico,
        categoria,
        subcategoria: sub.slug,
        observacao: observacao.trim(),
        id_ordem: idOrdem.trim() || null,
        anexos,
        criado_por: criadoPor ?? null,
      })
      if (!r.ok) { setErro(r.erro || 'Falha ao registrar.'); setSalvando(false); return }
      onRegistrada?.()
      onFechar()
    } catch (e) {
      setErro(String(e))
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) return null
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={onFechar}>
      <div style={{ background: 'var(--portal-bg-card)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, maxHeight: '92vh', overflow: 'auto', border: '1px solid var(--portal-border)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--portal-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertOctagon size={17} color="#DC2626" /> Registrar ocorrência
          </h2>
          <button onClick={onFechar} style={{ background: 'var(--portal-bg-secondary)', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)', width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Categoria (chips) */}
          <div>
            <label style={MLBL}>Categoria</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIAS.map(c => {
                const info = CATALOGO_OCORRENCIAS[c]
                const ativa = c === categoria
                return (
                  <button key={c} onClick={() => { setCategoria(c); setSubcategoria('') }} style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    border: `1.5px solid ${ativa ? info.cor : 'var(--portal-border)'}`,
                    background: ativa ? `${info.cor}18` : 'var(--portal-bg-secondary)',
                    color: ativa ? info.cor : 'var(--portal-text-secondary)',
                  }}>{info.label}</button>
                )
              })}
            </div>
          </div>

          {/* Subcategoria + pontos em destaque */}
          <div>
            <label style={MLBL}>Subcategoria</label>
            <select value={subcategoria} onChange={e => setSubcategoria(e.target.value)} style={INP}>
              <option value="">Selecione...</option>
              {cat.subcategorias.map(s => (
                <option key={s.slug} value={s.slug}>{s.label} (−{s.pontos} pts)</option>
              ))}
            </select>
            {sub && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 900, padding: '4px 14px', borderRadius: 6, background: '#FEE2E2', color: '#DC2626' }}>
                  −{sub.pontos} pontos
                </span>
                {sub.ajuda && <span style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{sub.ajuda}</span>}
              </div>
            )}
          </div>

          <div>
            <label style={MLBL}>Funcionário</label>
            <select value={tecnico} onChange={e => setTecnico(e.target.value)} style={INP}>
              <option value="">Selecione...</option>
              {tecnicos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label style={MLBL}>{categoria === 'pv' ? 'Nº do PV (opcional)' : 'OS (opcional)'}</label>
            <input type="text" value={idOrdem} onChange={e => setIdOrdem(e.target.value)} placeholder={categoria === 'pv' ? 'Ex: PV-7394' : 'Ex: OS-0570'} style={INP} />
          </div>

          <div>
            <label style={MLBL}>Observação (obrigatória)</label>
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Descreva o que aconteceu — essa descrição vai pro funcionário e pro RH." rows={3} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          {/* Anexos */}
          <div>
            <label style={MLBL}>Prints / fotos / vídeos (opcional, máx 5)</label>
            <input ref={fileRef} type="file" accept={ACCEPT_ANEXOS} multiple style={{ display: 'none' }}
              onChange={e => { adicionarArquivos(e.target.files); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)', border: '1px dashed var(--portal-border)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
              <Paperclip size={13} /> Anexar arquivos
            </button>
            {arquivos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {arquivos.map((f, i) => (
                  <div key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--portal-text)' }}>
                    <Paperclip size={11} color="var(--portal-text-muted)" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                    <span style={{ color: 'var(--portal-text-muted)' }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                    <button onClick={() => setArquivos(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: 0 }}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {erro && <div style={{ fontSize: 12.5, color: '#DC2626', fontWeight: 600 }}>{erro}</div>}

          <button onClick={salvar} disabled={salvando || !sub || !tecnico || !observacao.trim()} style={{
            width: '100%', padding: '11px 0', borderRadius: 8, border: 'none',
            background: salvando || !sub || !tecnico || !observacao.trim() ? '#9CA3AF' : '#DC2626',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: salvando ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {salvando ? <><Loader2 size={15} className="animate-spin" /> Registrando…</> : sub ? `Registrar ocorrência (−${sub.pontos} pts)` : 'Registrar ocorrência'}
          </button>
        </div>
      </div>
    </div>
  )
}
