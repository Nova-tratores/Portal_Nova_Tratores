'use client'
// Editar título e descrição da reunião (José, 23/11/2026: "não estou conseguindo editar").
// Dia/hora/duração continuam no Remarcar; pessoas no "Chamar mais alguém…".
import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Modal, campo, rotulo, botao, botaoClaro, chamar } from './comum'
import SeletorPessoas from './SeletorPessoas'

export default function EditarReuniao({ reuniaoId, titulo, descricao, visibilidade, pessoas, condutorId, onFechar, onFeito }: {
  reuniaoId: string
  titulo: string
  descricao: string | null
  visibilidade: string | null
  /** quem está na reunião hoje (inclui quem conduz) */
  pessoas: string[]
  condutorId: string
  onFechar: () => void
  onFeito: (titulo: string, descricao: string) => void
}) {
  // O título salvo leva " — dd/mm/aaaa" no fim (o Remarcar troca essa data). Edita sem ela e devolve ao salvar.
  const sufixo = /\s[—–-]\s\d{2}\/\d{2}\/\d{4}$/.exec(titulo)?.[0] || ''
  const [tit, setTit] = useState(sufixo ? titulo.slice(0, -sufixo.length) : titulo)
  const [desc, setDesc] = useState(descricao || '')
  const [vis, setVis] = useState<'publico' | 'privado'>(visibilidade === 'privado' ? 'privado' : 'publico')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const antes = pessoas.filter((p) => p !== condutorId)
  const [gente, setGente] = useState(antes)

  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      const url = `/api/reunioes/${reuniaoId}/acoes`
      await chamar(url, { json: { acao: 'titulo', titulo: `${tit.trim()}${sufixo}`, descricao: desc, visibilidade: vis } })
      // pessoas: uma chamada por quem entrou/saiu; junta os erros para mostrar de uma vez (ex.: "já marcada como presente")
      const falhas: string[] = []
      for (const uid of antes.filter((p) => !gente.includes(p))) {
        await chamar(url, { json: { acao: 'remover_participante', usuario_id: uid } }).catch((e) => falhas.push(e instanceof Error ? e.message : 'Falha ao tirar'))
      }
      for (const uid of gente.filter((p) => !antes.includes(p))) {
        await chamar(url, { json: { acao: 'adicionar_participante', usuario_id: uid } }).catch((e) => falhas.push(e instanceof Error ? e.message : 'Falha ao incluir'))
      }
      if (falhas.length) { window.dispatchEvent(new Event('central-trabalho-mudou')); throw new Error(`O resto foi salvo, mas: ${falhas.join(' · ')}`) }
      window.dispatchEvent(new Event('central-trabalho-mudou'))
      onFeito(tit.trim(), desc.trim())
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar') } finally { setSalvando(false) }
  }

  return (
    <Modal titulo="Editar reunião" onFechar={onFechar} largura={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={rotulo}>Título</label>
          <input value={tit} onChange={(e) => setTit(e.target.value)} maxLength={200} autoFocus style={{ ...campo, height: 44, fontSize: 15 }} />
        </div>
        <div>
          <label style={rotulo}>Descrição</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={4000} rows={5} placeholder="Do que se trata a reunião, o que precisa ser resolvido…"
            style={{ ...campo, height: 'auto', minHeight: 110, padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.45 }} />
        </div>
        <div>
          <label style={rotulo}>Quem participa (além de quem conduz)</label>
          <SeletorPessoas valor={gente} excluir={[condutorId]} onChange={(ids) => setGente(ids)} placeholder="Digite o nome para chamar…" />
          <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)', marginTop: 4 }}>Clique no X para tirar alguém. Quem sai ou entra recebe aviso no sino.</div>
        </div>
        <div>
          <label style={rotulo}>Quem pode ver</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([['publico', 'Pública', 'Todo mundo do portal vê'], ['privado', 'Privada', 'Só quem está na reunião vê']] as const).map(([v, t, dica]) => {
              const on = vis === v
              return (
                <button key={v} type="button" onClick={() => setVis(v)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${on ? '#2563eb' : 'var(--portal-border,#e2e8f0)'}`, background: on ? 'color-mix(in srgb,#2563eb 8%,var(--portal-surface,#fefefe))' : 'var(--portal-surface,#fefefe)' }}>
                  <span style={{ fontSize: 14.5, fontWeight: 500, color: on ? '#2563eb' : 'var(--portal-text,#0f172a)' }}>{t}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>{dica}</span>
                </button>
              )
            })}
          </div>
        </div>
        {erro && <div style={{ color: '#dc2626', fontSize: 13 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || !tit.trim()} style={{ ...botao('#2563eb'), opacity: salvando || !tit.trim() ? .6 : 1 }}><Pencil size={14} /> {salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </Modal>
  )
}
