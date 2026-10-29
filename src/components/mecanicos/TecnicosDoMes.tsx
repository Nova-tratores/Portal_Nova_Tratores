'use client'
// Técnicos do mês na aba Mecânicos (escolhidos na página de teste, 19/10/2026): cartões com o contador vivo.
// Clicar abre a ficha completa (comissão OS a OS, OS, requisições, frota, ocorrências e RH).
// O pódio saiu daqui e do Painel (José, 20/10/2026) — agora é a aba "Pódio" (PodioMeses.tsx).
import { useEffect } from 'react'
import { useCardsTecnicos, S1Estilo, ESTILO_CT, ESTILO_CT2, ESTILO_CT3, METAS_PADRAO, type CardDados } from './CardsTecnicoOpcoes'
import { FichaPro } from './FichaPro'
import { useUrlMec } from './useUrlMec'
import { prefetchFicha } from './FichaTecnico'
import { useAutorizacoes } from './AutorizacoesJanela'
import { seloEnviada } from './seloComissao'

const MUDO = 'var(--portal-text-muted, #64748b)'

export default function TecnicosDoMes() {
  const cards = useCardsTecnicos(METAS_PADRAO)
  const { pegar, mudar } = useUrlMec()
  const au = useAutorizacoes()
  const selos = Object.fromEntries((cards || []).map((c) => [c.nome, seloEnviada(au.pedidos, c.nome)]))
  const nomeAberto = pegar('tecnico')
  const aberto = nomeAberto ? cards?.find((c) => c.nome === nomeAberto) || ({ nome: nomeAberto } as CardDados) : null
  const setAberto = (c: CardDados | null) => mudar({ tecnico: c?.nome || null, secao: null, mes: null })
  // já busca a ficha de cada um (vem gravada do banco) para o clique abrir na hora
  const nomes = cards?.map((c) => c.nome).join('|') || ''
  useEffect(() => {
    if (!nomes) return
    const mes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7)
    nomes.split('|').forEach((n, i) => setTimeout(() => prefetchFicha(n, mes), i * 400))
  }, [nomes])
  return (
    <div className="tdm cpv-entra">
      <style>{ESTILO_CT}</style>
      <style>{ESTILO_CT2}</style>
      <style>{ESTILO_CT3}</style>
      <style>{ESTILO_TDM}</style>
      {/* a linha "Só OS faturadas · meta por semana…" saiu (José, 28/10/2026: "remove isso, é inútil"); a caixinha continua na capa da equipe */}
      {!cards ? <div style={{ padding: 30, textAlign: 'center', color: MUDO }}><i className="fas fa-circle-notch fa-spin" /> carregando os técnicos…</div>
        : <S1Estilo cards={cards} contador="vivo" onAbrir={setAberto} semFoto capa selos={selos} />}
      {aberto && <FichaPro nome={aberto.nome} foto={aberto.foto} card={cards?.find((c) => c.nome === aberto.nome) || null} onFechar={() => setAberto(null)}
        secao={pegar('secao') || undefined} onSecao={(s) => mudar({ secao: s === 'comissao' ? null : s }, false)} mes={pegar('mes') || undefined} onMes={(m) => mudar({ mes: m }, false)} />}
    </div>
  )
}

const ESTILO_TDM = `
.tdm { display: grid; gap: 14px }
.tdm-topo { display: flex; gap: 6px 12px; align-items: center; flex-wrap: wrap }
.tdm-topo small { font-size: 13px; color: #334155 }
`
