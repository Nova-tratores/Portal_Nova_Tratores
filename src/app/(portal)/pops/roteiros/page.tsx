'use client'
// POPs — Roteiros: checklists em sequência para anexar a uma OS (ex.: trator levado
// a evento → saída da loja → chegada no evento → saída do evento → chegada na loja).
// Cada etapa é um POP publicado; o mesmo POP pode se repetir. Uma etapa de cada vez.
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Route, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import UserSelect from '@/components/tickets/UserSelect'
import { COR_POPS, Modal, botao, botaoClaro, campo, cartao, chamar, pagina, rotulo, vazio, type Area } from '@/components/pops/comum'

interface EtapaForm { nome: string; pop_id: string; responsavel_padrao_id: string | null; prazo_dias: string }
interface Roteiro { id: string; nome: string; descricao: string; area_id: string; ativo: boolean; etapas: (Omit<EtapaForm, 'prazo_dias'> & { ordem: number; prazo_dias: number | null })[] }
interface Resp { roteiros: Roteiro[]; pops: { id: string; codigo: string; titulo: string; area_id: string }[]; areas: Area[]; usuarios: Record<string, { nome: string }>; podeEditarAreas: string[] }

const EXEMPLO = ['Saída da loja', 'Chegada no evento', 'Saída do evento', 'Chegada na loja']

function Editor({ dados, inicial, onFechar, onSalvo }: { dados: Resp; inicial: Roteiro | null; onFechar: () => void; onSalvo: () => void }) {
  const areas = dados.areas.filter((a) => dados.podeEditarAreas.includes(a.id))
  const [nome, setNome] = useState(inicial?.nome || '')
  const [descricao, setDescricao] = useState(inicial?.descricao || '')
  const [area, setArea] = useState(inicial?.area_id || areas[0]?.id || '')
  const [etapas, setEtapas] = useState<EtapaForm[]>(inicial
    ? inicial.etapas.map((e) => ({ nome: e.nome, pop_id: e.pop_id, responsavel_padrao_id: e.responsavel_padrao_id, prazo_dias: e.prazo_dias == null ? '' : String(e.prazo_dias) }))
    : [{ nome: '', pop_id: '', responsavel_padrao_id: null, prazo_dias: '' }])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const mudar = (i: number, patch: Partial<EtapaForm>) => setEtapas((l) => l.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  const mover = (i: number, d: number) => setEtapas((l) => { const c = [...l]; const j = i + d; if (j < 0 || j >= c.length) return l; [c[i], c[j]] = [c[j], c[i]]; return c })
  const exemplo = () => setEtapas(EXEMPLO.map((n) => ({ nome: n, pop_id: etapas[0]?.pop_id || '', responsavel_padrao_id: null, prazo_dias: '' })))

  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      await chamar('/api/pops/roteiros', { json: { id: inicial?.id, nome, descricao, area_id: area, etapas: etapas.map((e) => ({ ...e, prazo_dias: e.prazo_dias === '' ? null : e.prazo_dias })) } })
      onSalvo()
    } catch (e) { setErro((e as Error).message); setSalvando(false) }
  }

  return (
    <Modal titulo={inicial ? 'Editar roteiro' : 'Novo roteiro'} onFechar={onFechar} largura={760}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 10 }}>
          <div><label style={rotulo}>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Demonstração em evento" style={campo} /></div>
          <div><label style={rotulo}>Área</label>
            <select value={area} onChange={(e) => setArea(e.target.value)} style={campo}>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.sigla} — {a.nome}</option>)}
            </select>
          </div>
        </div>
        <div><label style={rotulo}>Quando usar</label><textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: trator levado para demonstração em feira ou dia de campo." style={{ ...campo, resize: 'vertical' }} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 14 }}>Etapas (uma de cada vez, nesta ordem)</strong>
          <span style={{ flex: 1 }} />
          {!inicial && <button type="button" onClick={exemplo} style={botaoClaro()}>Usar exemplo do evento</button>}
        </div>
        {etapas.map((e, i) => (
          <div key={i} style={{ ...cartao, padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong style={{ color: COR_POPS, width: 20 }}>{i + 1}</strong>
              <input value={e.nome} onChange={(x) => mudar(i, { nome: x.target.value })} placeholder="Nome da etapa (ex.: Saída da loja)" style={{ ...campo, flex: 1 }} />
              <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} style={botaoClaro()}><ArrowUp size={14} /></button>
              <button type="button" aria-label="Descer" disabled={i === etapas.length - 1} onClick={() => mover(i, 1)} style={botaoClaro()}><ArrowDown size={14} /></button>
              <button type="button" aria-label="Remover" disabled={etapas.length === 1} onClick={() => setEtapas((l) => l.filter((_, j) => j !== i))} style={botaoClaro()}><Trash2 size={14} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1.4fr) 90px', gap: 8 }}>
              <select value={e.pop_id} onChange={(x) => mudar(i, { pop_id: x.target.value })} style={campo}>
                <option value="">POP desta etapa…</option>
                {dados.pops.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.titulo}</option>)}
              </select>
              <UserSelect value={e.responsavel_padrao_id || ''} onChange={(id) => mudar(i, { responsavel_padrao_id: id || null })} placeholder="Quem faz (padrão, opcional)" barraBusca />
              <input value={e.prazo_dias} onChange={(x) => mudar(i, { prazo_dias: x.target.value.replace(/\D/g, '') })} placeholder="Prazo (d)" title="Prazo em dias a partir de quando a etapa é liberada (opcional)" style={campo} />
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setEtapas((l) => [...l, { nome: '', pop_id: '', responsavel_padrao_id: null, prazo_dias: '' }])} style={{ ...botaoClaro(), justifySelf: 'start' }}><Plus size={14} /> Incluir etapa</button>
        {!dados.pops.length && <div style={{ fontSize: 13, color: '#b45309' }}>Nenhum POP publicado ainda: publique o POP do checklist antes de montar o roteiro.</div>}
        {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onFechar} style={botaoClaro()}>Cancelar</button>
          <button type="button" disabled={salvando} onClick={salvar} style={botao(COR_POPS)}>{salvando ? 'Salvando…' : 'Salvar roteiro'}</button>
        </div>
      </div>
    </Modal>
  )
}

export default function RoteirosPage() {
  const { userProfile } = useAuth()
  const [dados, setDados] = useState<Resp | null>(null)
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState<Roteiro | 'novo' | null>(null)
  const [inativos, setInativos] = useState(false)

  const carregar = useCallback(async () => {
    try { setDados(await chamar<Resp>(`/api/pops/roteiros${inativos ? '?inativos=1' : ''}`)); setErro('') } catch (e) { setErro((e as Error).message) }
  }, [inativos])
  // carregar ao montar/trocar o filtro: o setState vem depois do fetch (padrão do portal)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  const ativar = async (r: Roteiro) => {
    try { await chamar('/api/pops/roteiros', { method: 'PATCH', json: { id: r.id, ativo: !r.ativo } }); carregar() } catch (e) { setErro((e as Error).message) }
  }
  const pop = (id: string) => dados?.pops.find((p) => p.id === id)
  const area = (id: string) => dados?.areas.find((a) => a.id === id)
  const podeCriar = !!dados?.podeEditarAreas.length

  return (
    <div style={pagina}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <p style={{ margin: 0, flex: 1, fontSize: 14, color: 'var(--portal-text-secondary,#555)', minWidth: 260 }}>
          Checklists em sequência para anexar a uma OS. Ex.: trator levado a um evento — saída da loja, chegada no evento, saída do evento e chegada na loja.
          Na OS, o bloco <b>Checklists desta OS</b> libera uma etapa de cada vez e avisa quem faz.
        </p>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Desativados
        </label>
        {podeCriar && <button type="button" onClick={() => setEditando('novo')} style={botao(COR_POPS)}><Plus size={15} /> Novo roteiro</button>}
      </div>
      {erro && <div style={{ ...cartao, color: '#dc2626', marginBottom: 12 }}>{erro}</div>}
      {!dados ? <div style={vazio}>Carregando…</div> : !dados.roteiros.length ? (
        <div style={vazio}>Nenhum roteiro ainda.{podeCriar ? ' Clique em "Novo roteiro" — o botão "Usar exemplo do evento" monta as 4 etapas.' : ' Quem cria é o dono da área ou o admin de POPs.'}</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {dados.roteiros.map((r) => (
            <div key={r.id} style={{ ...cartao, opacity: r.ativo ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Route size={16} style={{ color: COR_POPS }} />
                <strong style={{ fontSize: 15 }}>{r.nome}</strong>
                <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>{area(r.area_id)?.sigla} · {r.etapas.length} etapas{!r.ativo ? ' · desativado' : ''}</span>
                <span style={{ flex: 1 }} />
                {dados.podeEditarAreas.includes(r.area_id) && <>
                  <button type="button" onClick={() => setEditando(r)} style={botaoClaro()}><Pencil size={13} /> Editar</button>
                  <button type="button" onClick={() => ativar(r)} style={botaoClaro()}>{r.ativo ? 'Desativar' : 'Reativar'}</button>
                </>}
              </div>
              {r.descricao && <div style={{ fontSize: 13, color: 'var(--portal-text-secondary,#555)', marginTop: 4 }}>{r.descricao}</div>}
              <ol style={{ margin: '8px 0 0', paddingLeft: 22, fontSize: 13, display: 'grid', gap: 3 }}>
                {r.etapas.map((e) => (
                  <li key={e.ordem}><b>{e.nome}</b> — {pop(e.pop_id)?.codigo || 'POP sem versão publicada'}{pop(e.pop_id) ? ` ${pop(e.pop_id)!.titulo}` : ''}
                    {e.responsavel_padrao_id && <span style={{ color: 'var(--portal-text-muted,#888)' }}> · {dados.usuarios[e.responsavel_padrao_id]?.nome}</span>}
                    {e.prazo_dias != null && <span style={{ color: 'var(--portal-text-muted,#888)' }}> · prazo {e.prazo_dias} d</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {editando && dados && <Editor dados={dados} inicial={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar() }} />}
    </div>
  )
}
