'use client'
// PÁGINA DE TESTE (José, 17/10/2026: "não quero que você já vá mudando, faz várias telas com os
// dados numa página teste para eu escolher"). Agora (19/10): separação de assuntos do Painel, 2ª leva.
// Nada aqui muda o Painel.
import { useState } from 'react'
import { EstilosCPV } from './ui'
import { N1, N2, N3, N4, N5, ESTILO_NX } from './SecaoOpcoes'

const MUDO = 'var(--portal-text-muted, #64748b)'

function Opcao({ n, titulo, ideia, children }: { n: string; titulo: string; ideia: string; children: React.ReactNode }) {
  const [vez, setVez] = useState(0)
  return (
    <section className="lab-op cpv-entra">
      <div className="lab-cab"><span className="lab-n">{n}</span><b>{titulo}</b><small>{ideia}</small>
        <button type="button" className="lab-play" onClick={() => setVez((v) => v + 1)}><i className="fas fa-play" /> recomeçar</button></div>
      <div key={vez}>{children}</div>
    </section>
  )
}

export default function LaboratorioVivo() {
  return (
    <div style={{ padding: 'clamp(14px, 2vw, 24px) clamp(12px, 2vw, 28px)', background: 'var(--portal-bg, #f8fafc)', minHeight: '100vh' }}>
      <EstilosCPV />
      <style>{ESTILO_LAB}</style>
      <style>{ESTILO_NX}</style>
      <div className="lab-topo">
        <span className="lab-selo"><i className="fas fa-flask" /> página de teste</span>
        <h1>Separação de assuntos do Painel — escolha uma opção</h1>
        <p>Cada opção é uma área que rola sozinha: role dentro dela para sentir a troca de assunto. Nada aqui muda o Painel — diga o número (ou misture).</p>
      </div>
      <div style={{ display: 'grid', gap: 18 }}>
        <Opcao n="N1" titulo="Assuntos que recolhem, com o número-chave" ideia="cada assunto é uma barra com o resumo dele (ex.: R$ 79.449 em 35 OS); clique abre ou fecha — dá para ver tudo sem rolar"><N1 /></Opcao>
        <Opcao n="N2" titulo="Título que gruda no topo" ideia="enquanto você está num assunto, o título dele fica preso em cima com '2 de 4' e uma barrinha de quanto já rolou; o próximo empurra o anterior"><N2 /></Opcao>
        <Opcao n="N3" titulo="Trilho de navegação ao lado" ideia="os 4 assuntos numa trilha com bolinhas; a do assunto em que você está acende e cresce ao rolar; clique leva até ele"><N3 /></Opcao>
        <Opcao n="N4" titulo="Ambiente que muda de cor" ideia="o fundo muda suave para a cor do assunto em que você está e os outros ficam mais apagados; número grande marca o começo"><N4 /></Opcao>
        <Opcao n="N5" titulo="Um assunto por vez" ideia="abas grandes com o número-chave de cada assunto; clicar troca o conteúdo deslizando — a tela fica curta e sem confusão"><N5 /></Opcao>
      </div>
    </div>
  )
}

const ESTILO_LAB = `
.lab-topo { margin-bottom: 18px } .lab-topo h1 { font-size: 22px; font-weight: 900; margin: 8px 0 4px; color: var(--portal-text, #0f172a) } .lab-topo p { margin: 0; font-size: 13.5px; color: ${MUDO}; max-width: 820px }
.lab-selo { font-size: 12px; font-weight: 900; color: #7c3aed; background: #f5f3ff; border: 1px dashed #c4b5fd; border-radius: 99px; padding: 3px 10px }
.lab-op { border: 2px dashed var(--portal-border, #cbd5e1); border-radius: 20px; padding: 14px }
.lab-cab { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 12px } .lab-cab small { color: ${MUDO}; font-size: 12.5px }
.lab-play { margin-left: auto; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: #2563eb; border-radius: 99px; padding: 4px 12px; font-family: inherit; font-size: 12px; font-weight: 800; cursor: pointer } .lab-play:hover { background: #2563eb; color: #fefefe }
.lab-n { background: #0f172a; color: #fefefe; font-weight: 900; font-size: 13px; border-radius: 8px; padding: 3px 10px }
`
