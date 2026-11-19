'use client'
// "Onde a etiqueta sai": Neste aparelho + cada estação (PC com impressora) que já se cadastrou, com a
// bolinha de ligada/desligada. A escolha fica na CONTA da pessoa (José, 19/11/2026): marca no PC e o
// celular segue. Usado na janela da térmica (Peças, Peças S/Estoque, Patrimônio) e no Conferir por posição.

import { useEffect, useRef, useState } from 'react'
import { haQuanto } from '@/lib/etiquetas/estacao'
import { destinoEfetivo, escolherDestino, lerDestinos, type Destinos } from '@/lib/etiquetas/estacao-client'

export default function EscolhaImpressora({ compacto = false, onMudou }: {
  /** linha só com os botões (Conferir por posição) */
  compacto?: boolean
  /** avisa quem usa para onde vai ('local' ou id da estação) */
  onMudou?: (destino: string) => void
}) {
  const [dados, setDados] = useState<Destinos | null>(null)
  const [destino, setDestino] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // escolheu aqui → não deixa a releitura de 30 s desfazer; senão segue o que está salvo na conta
  const escolhidoAqui = useRef(false)
  useEffect(() => {
    let vivo = true
    const ler = () => { void lerDestinos().then((d) => {
      if (!vivo) return
      setDados(d)
      if (escolhidoAqui.current) return
      const e = destinoEfetivo(d)
      setDestino(e); onMudou?.(e)
    }) }
    ler()
    const t = setInterval(ler, 30_000)
    return () => { vivo = false; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lê ao abrir e a cada 30 s; onMudou muda a cada render de quem usa
  }, [])

  const escolher = async (d: string) => {
    escolhidoAqui.current = true
    setDestino(d); onMudou?.(d); setErro(null)
    const r = await escolherDestino(d)
    if (!r.ok) setErro(r.erro || null)
  }

  const estacoes = dados?.estacoes || []
  const atual = destino ?? 'local'
  const escolhida = estacoes.find((e) => e.id === atual)
  const opcoes: { id: string; rotulo: string; online?: boolean }[] = [
    { id: 'local', rotulo: compacto ? 'Neste aparelho' : 'Neste computador' },
    ...estacoes.map((e) => ({ id: e.id || '', rotulo: e.nome, online: e.online })),
  ]
  const tam = compacto ? { padding: '6px 10px', fontSize: 12.5 } : { padding: '8px 10px', fontSize: 13 }

  return (
    <div style={{ marginBottom: compacto ? 0 : 12 }}>
      {!compacto && <div style={{ fontSize: 13, color: 'var(--portal-text-secondary, #475569)', marginBottom: 5 }}>Onde a etiqueta sai (fica salvo na sua conta, vale no celular também):</div>}
      <div role="radiogroup" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {compacto && <span style={{ fontSize: 12.5, color: '#64748b' }}>Etiqueta sai:</span>}
        {opcoes.map((o) => {
          const sel = atual === o.id
          return (
            <button key={o.id} type="button" role="radio" aria-checked={sel} onClick={() => escolher(o.id)} style={{
              ...tam, borderRadius: 10, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
              border: '1.5px solid ' + (sel ? '#111111' : 'var(--portal-border, #cbd5e1)'),
              background: sel ? '#111111' : 'var(--portal-bg-card, #fefefe)', color: sel ? '#fefefe' : 'var(--portal-text, #334155)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {o.online !== undefined && <span aria-hidden style={{ width: 8, height: 8, borderRadius: 8, flexShrink: 0, background: o.online ? '#16a34a' : '#dc2626' }} />}
              {o.rotulo}
            </button>
          )
        })}
        {compacto && escolhida && !escolhida.online && <span style={{ fontSize: 12, color: '#b91c1c' }}>desligada: sai quando ligar</span>}
      </div>
      {erro && <div style={{ fontSize: 12.5, color: '#b91c1c', marginTop: 6 }}>{erro}</div>}
      {!compacto && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 8, color: 'var(--portal-text-secondary, #475569)' }}>
          {dados?.migracaoFaltando
            ? <>As impressoras em rede ainda não foram instaladas no banco (falta o <b>sql/etiquetas-estacoes-varias.sql</b>).</>
            : escolhida
              ? escolhida.online
                ? <>🟢 <b>{escolhida.nome}</b> ligada{escolhida.pendentes ? ` · ${escolhida.pendentes} na fila` : ''}. Sai lá, com o tamanho e o ajuste configurados naquele computador.</>
                : <>🔴 <b>{escolhida.nome}</b> desligada (último sinal {haQuanto(escolhida.ultimoSinal)}). Pode mandar: fica na fila e sai quando aquele computador voltar.</>
              : !estacoes.length && dados
                ? <>Nenhuma impressora em rede ainda. Para pôr uma: no PC da impressora, abra <b>/estacao-impressao</b> e dê um nome a ela.</>
                : null}
        </div>
      )}
    </div>
  )
}
