'use client'
// POPs — enviar o rascunho para revisão: changelog obrigatório + aprovador.
// Aprovador = alguém com papel de aprovador na área (nunca quem envia). Modelo
// do sistema: um admin do módulo (escolhido livremente; a rota confere).
import { useState } from 'react'
import UserSelect from '@/components/tickets/UserSelect'
import { Modal, botao, botaoClaro, campo, chamar, rotulo, type UsuarioMapa } from './comum'

interface Props {
  popId: string
  versaoId: string
  numero: number
  aprovadores: string[]
  usuarios: UsuarioMapa
  meuId: string
  modeloSistema: boolean
  sugestoesRedacao?: number   // dicas de escrita ainda abertas (lib/pops/redacao) — só avisa
  onFechar: () => void
  onEnviado: () => void
}

export default function ModalSubmeter({ popId, versaoId, numero, aprovadores, usuarios, meuId, modeloSistema, sugestoesRedacao = 0, onFechar, onEnviado }: Props) {
  const opcoes = aprovadores.filter((u) => u !== meuId)
  const [changelog, setChangelog] = useState(numero === 1 ? 'Primeira versão.' : '')
  const [aprovador, setAprovador] = useState(opcoes.length === 1 ? opcoes[0] : '')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const enviar = async () => {
    setEnviando(true); setErro('')
    try {
      await chamar(`/api/pops/${popId}/acoes`, { json: { acao: 'submeter', versao_id: versaoId, changelog, aprovador_id: aprovador || undefined } })
      window.dispatchEvent(new Event('pops-mudou'))
      onEnviado()
    } catch (e) { setErro((e as Error).message); setEnviando(false) }
  }

  const semAprovador = !modeloSistema && !opcoes.length
  return (
    <Modal titulo={`Enviar v${numero} para revisão`} onFechar={onFechar}>
      <div style={{ display: 'grid', gap: 14 }}>
        {sugestoesRedacao > 0 && (
          <div style={{ fontSize: 13, color: '#b45309', background: 'rgba(217,119,6,.10)', borderRadius: 8, padding: '8px 10px' }}>
            Ainda há {sugestoesRedacao} sugest{sugestoesRedacao === 1 ? 'ão' : 'ões'} de escrita no editor (quadro &quot;Como escrever um bom POP&quot;).
            Dá para enviar assim, mas o aprovador provavelmente vai devolver.
          </div>
        )}
        <div>
          <label style={rotulo}>O que mudou (fica no histórico)</label>
          <textarea value={changelog} onChange={(e) => setChangelog(e.target.value)} rows={4} style={{ ...campo, resize: 'vertical' }} autoFocus
            placeholder="Ex.: incluída a foto do horímetro; faixa de pressão corrigida." />
        </div>
        <div>
          <label style={rotulo}>Quem aprova</label>
          {modeloSistema ? (
            <UserSelect value={aprovador} onChange={(id) => setAprovador(id)} excluir={[meuId]} placeholder="Escolha um admin do módulo" barraBusca />
          ) : semAprovador ? (
            <div style={{ fontSize: 13, color: '#b45309' }}>Esta área ainda não tem outro aprovador. Peça ao admin do módulo (Áreas e papéis).</div>
          ) : (
            <select value={aprovador} onChange={(e) => setAprovador(e.target.value)} style={campo}>
              {opcoes.length > 1 && <option value="">Escolha…</option>}
              {opcoes.map((u) => <option key={u} value={u}>{usuarios[u]?.nome || u}</option>)}
            </select>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>
          Enquanto estiver em revisão, a versão fica travada. Se for reprovada, volta para você ajustar.
        </p>
        {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Cancelar</button>
          <button onClick={enviar} disabled={enviando || !changelog.trim() || semAprovador || !aprovador}
            style={{ ...botao('#0f766e'), opacity: enviando || !changelog.trim() || !aprovador ? .6 : 1 }}>
            {enviando ? 'Enviando…' : 'Enviar para revisão'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
