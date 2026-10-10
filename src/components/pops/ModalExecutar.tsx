'use client'
// POPs — iniciar uma execução avulsa (ticket tipo 'pop' na versão vigente).
// Referência externa opcional (OS, chassi, NF, placa); quem executa = eu ou outra pessoa.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import UserSelect from '@/components/tickets/UserSelect'
import { Modal, botao, botaoClaro, campo, chamar, rotulo } from './comum'

export default function ModalExecutar({ popId, codigo, meuId, onFechar }: { popId: string; codigo: string; meuId: string; onFechar: () => void }) {
  const router = useRouter()
  const [ref, setRef] = useState('')
  const [quem, setQuem] = useState(meuId)
  const [prazo, setPrazo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const iniciar = async () => {
    setEnviando(true); setErro('')
    try {
      const r = await chamar<{ ticket_id: string }>('/api/pops/execucoes', {
        json: { pop_id: popId, ref_externa: ref || undefined, responsavel_id: quem, prazo: prazo || undefined },
      })
      if (quem === meuId) router.push(`/pops/executar/${r.ticket_id}`)
      else { onFechar(); alert('Execução enviada para a pessoa escolhida.') }
    } catch (e) { setErro((e as Error).message); setEnviando(false) }
  }

  return (
    <Modal titulo={`Executar ${codigo}`} onFechar={onFechar}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <label style={rotulo}>Referência (opcional)</label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={80} style={campo} placeholder="Nº da OS, chassi, NF ou placa" />
        </div>
        <div>
          <label style={rotulo}>Quem executa</label>
          <UserSelect value={quem} onChange={(id) => setQuem(id)} barraBusca />
        </div>
        <div>
          <label style={rotulo}>Prazo (opcional)</label>
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={{ ...campo, width: 'auto' }} />
        </div>
        {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Cancelar</button>
          <button onClick={iniciar} disabled={enviando || !quem} style={botao('#0f766e')}>
            {enviando ? 'Criando…' : quem === meuId ? 'Começar agora' : 'Enviar para executar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
