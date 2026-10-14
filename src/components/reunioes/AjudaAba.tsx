'use client'
// "?" ao lado de uma aba/modo das Reuniões: abre um balão curto explicando o uso.
// Fica FORA do botão da aba (botão dentro de botão não vale) — clicar no "?" não troca de aba.
import { useEffect, useRef, useState } from 'react'

export const AJUDA_REUNIOES = {
  proximas: {
    titulo: 'Próximas',
    texto: [
      'As reuniões agendadas daqui para frente. Clique numa para abrir a pauta.',
      'Até o corte (algumas horas antes) qualquer participante inclui itens: cada item é uma pergunta — decidir, informar ou discutir —, com quem traz o assunto e quantos minutos leva. Depois do corte só o condutor inclui, e o item entra como urgente.',
      '"Nova reunião" marca uma avulsa; para as que se repetem, use uma série.',
    ],
  },
  historico: {
    titulo: 'Histórico',
    texto: [
      'Reuniões que já aconteceram ou foram canceladas. Abra uma para ler a ata: presenças, decisões com o motivo e as ações que saíram dela.',
      'Cada ação é um ticket com responsável e prazo — o status aparece ao vivo na ata.',
    ],
  },
  series: {
    titulo: 'Séries',
    texto: [
      'Reuniões que se repetem (ex.: "Semanal Oficina"). A série cria as próximas sozinha, com 14 dias de antecedência.',
      'Uma reunião puxa a outra: ações atrasadas ou vencendo voltam como pendências, e o parking lot e os itens adiados viram sugestão de pauta. O secretário roda entre os participantes.',
      'Só o condutor da série (ou um admin) muda a configuração, na engrenagem do cartão.',
    ],
  },
  pauta: {
    titulo: 'Pauta',
    texto: [
      'Monte a pauta até o corte: cada item é uma pergunta (decidir, informar ou discutir), com quem traz e o tempo. A soma dos minutos é comparada com a duração da reunião.',
      'Em "Pendências" aparecem as ações de reuniões anteriores atrasadas ou vencendo até esta.',
      'Na hora marcada o condutor clica em "Iniciar reunião".',
    ],
  },
  conducao: {
    titulo: 'Condução',
    texto: [
      'O condutor marca as presenças, trata cada pendência (novo prazo, reatribuir, escalar ou cancelar — depois de 2 reprogramações o novo prazo trava) e registra o resultado de cada item.',
      'Item de decidir só fecha com a decisão E o motivo. Assunto fora da pauta vai para o parking lot; o que alguém precisa fazer vira "Ação" — um ticket com responsável e prazo.',
      'No fim: "Encerrar e fechar ata".',
    ],
  },
  ata: {
    titulo: 'Ata',
    texto: [
      'Confira e publique a ata. Depois de publicada ela não muda mais — só com adendo — e gera um texto curto para mandar no WhatsApp.',
      'As ações seguem como tickets: aparecem no "Seu dia" e no Cronograma de quem é responsável, e voltam na próxima reunião da série se atrasarem.',
    ],
  },
} as const

export type ChaveAjudaReunioes = keyof typeof AJUDA_REUNIOES

export default function AjudaAba({ chave }: { chave: ChaveAjudaReunioes }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const { titulo, texto } = AJUDA_REUNIOES[chave]

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" onClick={() => setAberto((v) => !v)} title={`Como usar: ${titulo}`} aria-label={`Como usar: ${titulo}`} aria-expanded={aberto}
        style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--portal-border,#d1d5db)', background: aberto ? '#dc2626' : 'var(--portal-surface,#fff)', color: aberto ? '#fff' : 'var(--portal-text-muted,#888)', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}>
        ?
      </button>
      {aberto && (
        <div role="dialog" aria-label={titulo}
          style={{ position: 'absolute', top: 'calc(100% + 6px)', left: -8, zIndex: 60, width: 300, maxWidth: 'calc(100vw - 32px)', padding: '12px 14px', borderRadius: 10, background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)', boxShadow: '0 10px 30px rgba(0,0,0,.15)', textAlign: 'left', cursor: 'default' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', marginBottom: 6 }}>{titulo}</div>
          {texto.map((p, i) => (
            <p key={i} style={{ margin: i ? '6px 0 0' : 0, fontSize: 12.5, lineHeight: 1.45, fontWeight: 500, color: 'var(--portal-text-secondary,#444)', whiteSpace: 'normal' }}>{p}</p>
          ))}
        </div>
      )}
    </span>
  )
}
