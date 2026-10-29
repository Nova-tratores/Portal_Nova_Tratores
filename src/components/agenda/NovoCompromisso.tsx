'use client'
// AGENDA — "Novo compromisso" fora da tela da agenda (José, 29/10/2026: "colocar um mais, para eu
// conseguir adicionar por aqui também, sem precisar ir para a outra tela" — o "+" da Minha semana).
// Mesmo formulário e mesma gravação da /agenda (tipo Reunião cria em Reuniões).
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { Pessoa } from '@/lib/agenda/regras'
import { FormEvento, type RascunhoEvento } from './Janelas'
import { salvarCompromisso } from './salvarCompromisso'
import { CSS_AGENDA } from './estilo'

interface Props {
  /** dia YYYY-MM-DD */
  dia: string
  /** hora inicial HH:MM (padrão 09:00, 1 h) */
  hora?: string
  onFechar: () => void
  /** depois de gravar, com a frase do aviso */
  onSalvo?: (aviso: string) => void
}

export default function NovoCompromisso({ dia, hora = '09:00', onFechar, onSalvo }: Props) {
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [eu, setEu] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const res = await fetch(`/api/agenda?de=${dia}&ate=${dia}&modo=coletiva`, { cache: 'no-store', headers: await authHeaders() })
        const j = await res.json().catch(() => ({}))
        if (vivo && res.ok) { setPessoas(j.pessoas || []); setEu(j.eu || '') }
      } catch { /* sem rede: dá para criar sem convidados */ }
    })()
    return () => { vivo = false }
  }, [dia])
  const h = Number(hora.slice(0, 2))
  const inicial: RascunhoEvento = {
    titulo: '', descricao: '', local: '', diaInteiro: false, diaIni: dia, horaIni: hora, diaFim: dia,
    horaFim: `${String(Math.min(23, h + 1)).padStart(2, '0')}:${hora.slice(3, 5)}`,
    participantes: [], freq: '', ate: '', cor: null, tipo: null,
  }
  const salvar = async (r: RascunhoEvento) => {
    setSalvando(true); setErro('')
    try { const aviso = await salvarCompromisso(r, eu); onSalvo?.(aviso); onFechar() }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar') }
    finally { setSalvando(false) }
  }
  const minha = pessoas.find((p) => p.id === eu)
  return (
    // display:contents: só leva as cores (--gc-*) da agenda para o formulário, sem ocupar espaço
    <div className="gc" style={{ display: 'contents' }}>
      <style>{CSS_AGENDA}</style>
      <FormEvento inicial={inicial} pessoas={pessoas} eu={eu} corPadrao={minha?.cor || '#039be5'} salvando={salvando} erro={erro}
        onSalvar={salvar} onFechar={onFechar} />
    </div>
  )
}
