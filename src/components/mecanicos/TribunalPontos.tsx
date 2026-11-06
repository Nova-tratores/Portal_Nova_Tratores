'use client'
// Topo do Tribunal (José, 04/11/2026: "de cara, quantos pontos cada técnico perdeu, e quando clicar em um ver o que
// mais perdeu, o que podemos fazer" + "uma tabela que a gente consegue ver o que de fato está removendo os pontos").
// Escolhida a opção Cartões em /mecanicos/teste-tribunal. Só conta o que está valendo.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'
import type { Cat, LinhaEscudo, OcorrenciaPainel } from '@/lib/mecanicos/ocorrencias-painel'
import { patente, type CarreiraTecnico } from '@/lib/mecanicos/carreira'
import { IconeLiga } from './CartaLiga'
import { useCarreira } from './useCarreira'

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
// "Danilo de Souza" → "Danilo Souza": pula de/da/do/das/dos/e (antes parava no "Danilo de")
const nomeCurto = (n: string) => n.split(' ').filter((p, i) => p && (i === 0 || !/^(d[aeo]s?|e)$/i.test(p))).slice(0, 2).join(' ')
const COR_CAT: Record<Cat, string> = { os: '#0c63e4', pv: '#7c3aed', rh: '#d97706', frota: '#0d9488', legado: '#71717a' }
const NOME_CAT: Record<Cat, string> = { os: 'OS', pv: 'PV', rh: 'RH', frota: 'Frota', legado: 'Antigas' }

/** O que fazer para o técnico parar de perder ponto naquele motivo. */
const ACAO: Record<string, string> = {
  retorno_servico: 'Rever o serviço que voltou com ele e com o chefe da oficina; se repetir, treinamento no conjunto.',
  falta_informacao_os: 'Mostrar uma OS bem preenchida (relato, horas, fotos) e conferir as próximas no app antes de fechar.',
  reclamacao_cliente: 'Conversar com o técnico sobre a reclamação e ligar para o cliente depois do próximo serviço.',
  saida_sem_os: 'Combinar: sem OS aberta no app, não sai. O escritório confere antes de liberar o carro.',
  alimentacao_sem_troco: 'Lembrar de trazer comprovante e troco; descontar só se repetir.',
  entregue_os_fisica: 'Reforçar que a OS é só no app; recolher os blocos de papel.',
  atraso_ordem: 'Olhar a previsão das OS dele toda segunda; avisar antes de estourar o prazo.',
  apontamento_horas_incorreto: 'Conferir as horas da OS com o rastreador do carro e corrigir junto com ele.',
  sem_requisicao: 'Toda peça ou serviço de fora pede requisição antes; o escritório não paga sem.',
  extravio_peca: 'Conferir as peças na saída e na volta (checklist da requisição).',
  peca_danificada: 'Ver como a peça foi transportada/montada e orientar.',
  atraso_sem_justificativa: 'Conversa sobre horário; se repetir, advertência pelo RH.',
  falta_sem_justificativa: 'RH chama para conversar e lança no ponto.',
  falta_epi: 'Entregar o EPI que falta e conferir no início do dia.',
  tomou_opa: 'Conversa individual com o gestor sobre o motivo do OPA.',
  ferramenta_danificada_perdida: 'Controle de ferramentas na saída e volta; avaliar se cobra.',
  checklist_carro: 'Checklist no app ao pegar e devolver o carro; o escritório cobra no mesmo dia.',
  carro_sujo: 'Lavar o carro na volta da viagem.',
  multa_autuacao: 'Mostrar a multa ao técnico; repetir = conversa sobre direção.',
  excesso_velocidade: 'Mostrar o trecho do rastreador (115+ km/h) e combinar o limite. Repetiu = conversa com o diretor.',
  consumo_anormal: 'Conferir o carro (mecânica) e os abastecimentos dele; pode ser desvio ou defeito.',
  requisicao_abastecimento: 'Regra desligada em 04/11 — abastecer pelo cartão-frota.',
  pilotagem_perigosa: 'Mostrar o vídeo/denúncia e combinar o jeito de dirigir.',
  deslocamento_desnecessario: 'Planejar a rota da semana com ele antes de sair.',
}
const acaoDe = (sub: string | null) => (sub && ACAO[sub]) || 'Conversar com o técnico sobre o motivo e acompanhar no próximo mês.'

/** De onde veio a ocorrência: robô (qual) ou lançada à mão (por quem). */
function fonteDe(o: OcorrenciaPainel): { fonte: string; ic: string } {
  if (o.origem === 'auto') {
    if (o.subcategoria === 'excesso_velocidade') return { fonte: 'Robô do rastreador (velocidade)', ic: 'fa-satellite-dish' }
    if (o.subcategoria === 'requisicao_abastecimento') return { fonte: 'Robô das requisições de abastecimento', ic: 'fa-gas-pump' }
    if (o.subcategoria === 'multa_autuacao') return { fonte: 'Robô das multas', ic: 'fa-receipt' }
    if (o.subcategoria === 'consumo_anormal') return { fonte: 'Robô do consumo de combustível', ic: 'fa-droplet' }
    if (o.subcategoria === 'atraso_sem_justificativa' || o.categoria === 'legado') return { fonte: 'Robô do ponto (atraso)', ic: 'fa-clock' }
    return { fonte: 'Robô (automática)', ic: 'fa-robot' }
  }
  return { fonte: `À mão · ${o.criadoPor || 'sem nome'}`, ic: 'fa-user-pen' }
}

type Motivo = { rotulo: string; sub: string | null; cor: string; qtd: number; pts: number }
type PorTec = { tecnico: string; pts: number; qtd: number; cats: Record<Cat, number>; motivos: Map<string, Motivo> }
const zero = (): Record<Cat, number> => ({ os: 0, pv: 0, rh: 0, frota: 0, legado: 0 })
const maiores = (t: PorTec) => [...t.motivos.values()].sort((a, b) => b.pts - a.pts)

/** Cartões: pontos que cada técnico perdeu; clicar abre uma janela com o que mais tirou, o que fazer, as defesas dele
 *  para julgar e todas as ocorrências (José, 04/11/2026). O Tribunal geral continua embaixo, para julgar tudo de uma vez. */
export function PontosPorTecnico({ ocorrencias, linhas, podeJulgar, julgando, onJulgar, onAbrir, onRecarregar }: {
  ocorrencias: OcorrenciaPainel[]; linhas: LinhaEscudo[]; podeJulgar: boolean; julgando: number | null
  onJulgar: (justificativaId: number, aprovada: boolean, ocId: number) => void; onAbrir: (o: OcorrenciaPainel) => void; onRecarregar: () => void
}) {
  const [sel, setSel] = useState<string | null>(null)
  // a Liga de cada um (José, 04/11/2026: "com as ligas também") — a mesma conta da Gestão
  const { dados: carreira } = useCarreira()
  const ocs = useMemo(() => ocorrencias.filter((o) => o.vale), [ocorrencias])
  const porTec = useMemo(() => {
    const m = new Map<string, PorTec>()
    const linha = (t: string) => { let x = m.get(t); if (!x) { x = { tecnico: t, pts: 0, qtd: 0, cats: zero(), motivos: new Map() }; m.set(t, x) } return x }
    for (const l of linhas) linha(l.tecnico)
    for (const o of ocs) {
      const x = linha(o.tecnico)
      x.pts += o.pontos; x.qtd++; x.cats[o.categoria] += o.pontos
      const k = o.subcategoria || o.rotulo
      const mo = x.motivos.get(k) || { rotulo: o.rotulo, sub: o.subcategoria, cor: COR_CAT[o.categoria], qtd: 0, pts: 0 }
      mo.qtd++; mo.pts += o.pontos; x.motivos.set(k, mo)
    }
    return [...m.values()].sort((a, b) => b.pts - a.pts || a.tecnico.localeCompare(b.tecnico))
  }, [linhas, ocs])
  const aberto = porTec.find((t) => t.tecnico === sel) || null
  return (
    <section className="tp">
      <style>{ESTILO_TP}</style>
      <div className="tp-grade">
        {porTec.map((t) => (
          <button key={t.tecnico} type="button" className={`tp-c ${sel === t.tecnico ? 'on' : ''} ${t.pts === 0 ? 'limpo' : ''}`} onClick={() => setSel(sel === t.tecnico ? null : t.tecnico)} aria-expanded={sel === t.tecnico}>
            {(() => { const c = carreira?.carreira.find((x) => x.tecnico === t.tecnico); return (
              <span className="tp-c-n">{c && <IconeLiga nivel={c.seFecharAssim} tamanho={34} />}<span><b>{nomeCurto(t.tecnico)}</b>{c && <small style={{ color: patente(c.seFecharAssim).cor }}>{patente(c.seFecharAssim).nome}</small>}</span></span>
            ) })()}
            <b>{t.pts ? `−${t.pts}` : '0'}<small> pts</small></b>
            <span className="tp-c-bar">{(Object.keys(t.cats) as Cat[]).filter((c) => t.cats[c]).map((c) => <i key={c} style={{ flex: t.cats[c], background: COR_CAT[c] }} title={`${NOME_CAT[c]} −${t.cats[c]}`} />)}</span>
            <small>{t.qtd ? `${t.qtd} ocorrência(s) · mais: ${maiores(t)[0].rotulo}` : 'mês limpo'}</small>
          </button>
        ))}
      </div>
      {aberto && <JanelaTecnico t={aberto} ocorrencias={ocorrencias.filter((o) => o.tecnico === aberto.tecnico)} carreira={carreira?.carreira.find((c) => c.tecnico === aberto.tecnico)} podeJulgar={podeJulgar} julgando={julgando} onJulgar={onJulgar} onAbrir={onAbrir} onRecarregar={onRecarregar} onFechar={() => setSel(null)} />}
    </section>
  )
}

/** Janela do técnico (José, 04/11/2026: "editar a pontuação dentro de cada ocorrência e filtrar clicando nesses
 *  botões, algo mais dinâmico e centralizado, fácil de entender"): a Liga no topo, os motivos viram filtros, o que
 *  fazer do motivo escolhido, as defesas dele e a lista com os pontos editáveis. Mudou aqui, muda na Gestão toda
 *  (o servidor avisa as telas abertas — Liga, cartões e fichas). */
function JanelaTecnico({ t, ocorrencias, carreira, podeJulgar, julgando, onJulgar, onAbrir, onRecarregar, onFechar }: {
  t: PorTec; ocorrencias: OcorrenciaPainel[]; carreira?: CarreiraTecnico; podeJulgar: boolean; julgando: number | null
  onJulgar: (justificativaId: number, aprovada: boolean, ocId: number) => void; onAbrir: (o: OcorrenciaPainel) => void
  onRecarregar: () => void; onFechar: () => void
}) {
  const [filtro, setFiltro] = useState<string | null>(null)
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[data-oc-detalhe]')) onFechar() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onFechar])
  const mot = maiores(t)
  const chave = (o: OcorrenciaPainel) => o.subcategoria || o.rotulo
  const escolhido = mot.find((m) => (m.sub || m.rotulo) === filtro) || null
  const dica = escolhido || mot[0] || null
  const lista = ocorrencias.filter((o) => !filtro || chave(o) === filtro)
  const pend = lista.filter((o) => o.defesas.some((x) => x.status === 'pendente'))
  const p = carreira ? patente(carreira.seFecharAssim) : null
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="tp-fundo" role="presentation" onClick={onFechar}>
      <style>{ESTILO_TP}</style>
      <div className="tp-modal" role="dialog" aria-modal="true" aria-label={t.tecnico} onClick={(e) => e.stopPropagation()}>
        <header className="tp-mh">
          {carreira && <IconeLiga nivel={carreira.seFecharAssim} tamanho={44} />}
          <div className="tp-mh-id">
            <b>{t.tecnico}</b>
            {carreira && p ? <small><span style={{ color: p.cor, fontWeight: 700 }}>{p.nome}</span> · saldo {carreira.saldoAgora} pts{carreira.faltaProximo > 0 ? ` · faltam ${carreira.faltaProximo} para subir` : ' · topo da Liga'}</small> : <small>Liga carregando…</small>}
          </div>
          <button type="button" className="tp-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button>
        </header>
        <div className="tp-kpis">
          <div className="ruim"><small>Perdeu no mês</small><b>{t.pts ? `−${t.pts}` : '0'}</b><em>{t.qtd} ocorrência(s) valendo</em></div>
          <div className="bom"><small>Ganhou com OS limpas</small><b>+{carreira?.mesAtual.ganhos ?? 0}</b><em>{carreira?.mesAtual.osLimpas ?? 0} OS sem problema</em></div>
          <div><small>Saldo do mês</small><b className={(carreira?.mesAtual.ganhos ?? 0) - (carreira?.mesAtual.pontos ?? t.pts) >= 0 ? 'pos' : 'neg'}>{(() => { const v = (carreira?.mesAtual.ganhos ?? 0) - (carreira?.mesAtual.pontos ?? t.pts); return `${v >= 0 ? '+' : '−'}${Math.abs(v)}` })()}</b><em>retorno de serviço pesa o dobro na Liga</em></div>
        </div>

        {mot.length > 0 && <>
          <div className="tp-filtros">
            <button type="button" className={!filtro ? 'on' : ''} onClick={() => setFiltro(null)}>Tudo <em>{ocorrencias.length}</em></button>
            {mot.map((m) => {
              const k = m.sub || m.rotulo
              return (
                <button key={k} type="button" className={filtro === k ? 'on' : ''} style={{ '--c': m.cor } as React.CSSProperties} onClick={() => setFiltro(filtro === k ? null : k)}>
                  <i />{m.rotulo}<em>{m.qtd}× · −{m.pts}</em>
                </button>
              )
            })}
          </div>
          {dica && <p className="tp-dica"><i className="fas fa-lightbulb" /><span><b>{escolhido ? 'O que fazer' : `O que mais tirou: ${dica.rotulo}`}</b> {acaoDe(dica.sub)}</span></p>}
        </>}

        {pend.length > 0 && <>
          <h4 className="tp-sec"><i className="fas fa-gavel" /> Defesas para julgar <em>{pend.length}</em></h4>
          {pend.map((o) => {
            const def = o.defesas.find((x) => x.status === 'pendente')!
            return (
              <div key={o.id} className="tp-def">
                <div className="tp-def-t"><b>{o.rotulo}</b><small>{br(o.data)}{o.idOrdem ? ` · ${o.idOrdem}` : ''}</small><em>−{o.pontos}</em></div>
                <p>“{def.texto || 'sem texto'}”{def.anexos.length ? <small> · {def.anexos.length} anexo(s)</small> : null}</p>
                <div className="tp-def-b">
                  <button type="button" onClick={() => onAbrir(o)}><i className="fas fa-eye" /> Ver tudo</button>
                  {podeJulgar && <>
                    <button type="button" className="ok" disabled={julgando != null} onClick={() => onJulgar(def.id, true, o.id)}><i className="fas fa-check" /> Aceitar · anula {o.pontos} pts</button>
                    <button type="button" className="nao" disabled={julgando != null} onClick={() => onJulgar(def.id, false, o.id)}><i className="fas fa-xmark" /> Recusar</button>
                  </>}
                </div>
              </div>
            )
          })}
        </>}

        <h4 className="tp-sec"><i className="fas fa-list" /> {escolhido ? escolhido.rotulo : 'Ocorrências do mês'} <span className="tp-sec-n">{lista.length}{podeJulgar ? ' · clique nos pontos para mudar' : ''}</span></h4>
        <div className="tp-ocs">
          {lista.map((o) => <LinhaOcorrencia key={o.id} o={o} podeEditar={podeJulgar} onAbrir={() => onAbrir(o)} onSalvou={onRecarregar} />)}
          {!lista.length && <p className="tp-mudo">Nenhuma ocorrência {filtro ? 'deste motivo' : 'no mês'}.</p>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Uma ocorrência na janela do técnico; os pontos mudam ali mesmo (−/+ e salvar). */
function LinhaOcorrencia({ o, podeEditar, onAbrir, onSalvou }: { o: OcorrenciaPainel; podeEditar: boolean; onAbrir: () => void; onSalvou: () => void }) {
  const [editando, setEditando] = useState(false)
  const [v, setV] = useState(o.pontos)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const julg = o.defesas.some((x) => x.status === 'pendente')
  const original = Number(o.detalhes?.pontos_original)
  const editado = Number.isFinite(original) && o.detalhes?.pontos_original != null && original !== o.pontos
  const salvar = async () => {
    if (v === o.pontos) { setEditando(false); return }
    setSalvando(true); setErro('')
    try {
      const r = await fetch('/api/mecanicos/ocorrencias-painel', { method: 'PATCH', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ ocorrenciaId: o.id, pontos: v }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setEditando(false); onSalvou()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não salvou') } finally { setSalvando(false) }
  }
  return (
    <div className={`tp-oc ${o.vale ? '' : 'anul'}`}>
      <button type="button" className="tp-oc-a" onClick={onAbrir} title="ver tudo, anexos e defesa">
        <span className="d">{br(o.data)}</span>
        <span><i className="tp-bola" style={{ background: COR_CAT[o.categoria] }} /><b>{o.rotulo}</b><small>{o.idOrdem ? `${o.idOrdem} · ` : ''}{o.origem === 'auto' ? 'automática' : o.criadoPor ? `por ${o.criadoPor}` : 'manual'}{editado ? ` · pontos mudados (era ${original})` : ''}</small></span>
        <em className={julg ? 'julg' : o.vale ? 'vale' : 'anul'}>{julg ? 'em julgamento' : o.vale ? 'valendo' : 'anulada'}</em>
      </button>
      {editando ? (
        <span className="tp-ed">
          <button type="button" onClick={() => setV((x) => Math.max(0, x - 1))} aria-label="menos">−</button>
          <input value={v} inputMode="numeric" onChange={(e) => setV(Math.max(0, Math.min(50, Math.round(Number(e.target.value.replace(/\D/g, '')) || 0))))} onKeyDown={(e) => { if (e.key === 'Enter') void salvar(); if (e.key === 'Escape') { e.stopPropagation(); setEditando(false); setV(o.pontos) } }} aria-label="pontos" autoFocus />
          <button type="button" onClick={() => setV((x) => Math.min(50, x + 1))} aria-label="mais">+</button>
          <button type="button" className="ok" disabled={salvando} onClick={() => void salvar()} aria-label="salvar">{salvando ? '…' : <i className="fas fa-check" />}</button>
          <button type="button" onClick={() => { setEditando(false); setV(o.pontos); setErro('') }} aria-label="cancelar"><i className="fas fa-xmark" /></button>
        </span>
      ) : (
        <button type="button" className={`tp-pts ${podeEditar ? 'edita' : ''}`} disabled={!podeEditar} onClick={() => { setV(o.pontos); setEditando(true) }} title={podeEditar ? 'mudar os pontos desta ocorrência' : undefined}>
          {o.vale ? `−${o.pontos}` : '0'}{podeEditar && <i className="fas fa-pen" />}
        </button>
      )}
      {erro && <small className="tp-erro">{erro}</small>}
    </div>
  )
}

/** Tabela do que está tirando os pontos: por quem lançou (qual robô ou qual pessoa) e o tipo. */
export function FontesDosPontos({ ocorrencias }: { ocorrencias: OcorrenciaPainel[] }) {
  const fontes = useMemo(() => {
    const m = new Map<string, { fonte: string; ic: string; tipo: string; sub: string | null; cor: string; qtd: number; pts: number; tecs: Set<string> }>()
    for (const o of ocorrencias.filter((o) => o.vale)) {
      const f = fonteDe(o), k = `${f.fonte}|${o.rotulo}`
      const x = m.get(k) || { ...f, tipo: o.rotulo, sub: o.subcategoria, cor: COR_CAT[o.categoria], qtd: 0, pts: 0, tecs: new Set<string>() }
      x.qtd++; x.pts += o.pontos; x.tecs.add(nomeCurto(o.tecnico)); m.set(k, x)
    }
    return [...m.values()].sort((a, b) => b.pts - a.pts)
  }, [ocorrencias])
  const tot = fontes.reduce((s, f) => s + f.pts, 0)
  return (
    <section className="tp tp-fontes">
      <style>{ESTILO_TP}</style>
      <h3>O que está tirando os pontos</h3>
      <p className="tp-mudo">Tudo que está valendo no mês, separado por quem lançou: robô (qual) ou pessoa.</p>
      {!fontes.length ? <p className="tp-mudo">Nada valendo neste mês.</p> : (
        <div className="tp-scroll">
          <table className="tp-tab">
            <thead><tr><th>De onde vem</th><th>Tipo</th><th>Qtd</th><th>Pontos</th><th>% do total</th><th>Técnicos</th></tr></thead>
            <tbody>
              {fontes.map((f) => (
                <tr key={`${f.fonte}|${f.tipo}`}>
                  <td><i className={`fas ${f.ic}`} /> {f.fonte}</td>
                  <td><i className="tp-bola" style={{ background: f.cor }} />{f.tipo}{f.sub === 'requisicao_abastecimento' && <small className="tp-off">regra desligada</small>}</td>
                  <td>{f.qtd}</td>
                  <td className="neg">−{f.pts}</td>
                  <td>{Math.round((f.pts / Math.max(1, tot)) * 100)}%</td>
                  <td className="tecs">{[...f.tecs].join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const ESTILO_TP = `
.tp { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 14px; display: grid; gap: 12px; color: var(--portal-text, #0f172a) }
.tp h3 { margin: 0; font-size: 15px } .tp-mudo { margin: 0; color: #64748b; font-size: 13px }
.tp-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px }
.tp-c { border: 1px solid #e2e8f0; border-radius: 12px; background: var(--portal-bg-card, #fefefe); padding: 12px; display: grid; gap: 6px; text-align: left; cursor: pointer; color: inherit; font: inherit; transition: border-color .2s, box-shadow .2s }
.tp-c:hover, .tp-c.on { border-color: #9f1239; box-shadow: 0 0 0 2px #fecdd3 }
.tp-c-n { font-weight: 600; font-size: 14px } .tp-c > b { font-size: 26px; color: #b91c1c } .tp-c > b small { font-size: 12px; color: #64748b; font-weight: 500 }
.tp-c.limpo > b { color: #047857 } .tp-c > small { font-size: 11.5px; color: #64748b }
.tp-c-bar { display: flex; height: 6px; border-radius: 99px; overflow: hidden; background: #f1f5f9 }
.tp-det { border: 1px solid #fecdd3; background: #fff7f8; border-radius: 12px; padding: 14px; display: grid; gap: 10px }
.tp-det-cab { display: flex; gap: 10px; align-items: baseline } .tp-det-cab b { font-size: 16px } .tp-det-cab span { color: #b91c1c; font-weight: 600 }
.tp-det-cab button { margin-left: auto; border: 0; background: none; cursor: pointer; color: #64748b; font-size: 16px }
.tp-mot { display: grid; gap: 8px }
.tp-mot-l { background: var(--portal-bg-card, #fefefe); border: 1px solid #f1f5f9; border-radius: 10px; padding: 10px 12px; display: grid; gap: 4px }
.tp-mot-l.top { border-color: #fda4af }
.tp-mot-t { display: flex; gap: 8px; align-items: center; flex-wrap: wrap } .tp-mot-t > i { width: 10px; height: 10px; border-radius: 50% }
.tp-mot-t span { margin-left: auto; font-size: 12.5px; color: #64748b } .tp-mot-t em { font-style: normal; color: #b91c1c; font-weight: 700 }
.tp-mot-t small { font-size: 10.5px; background: #ffe4e6; color: #9f1239; border-radius: 99px; padding: 1px 7px; font-weight: 600 }
.tp-mot-l p { margin: 0; font-size: 12.5px; color: #334155 } .tp-mot-l p i { color: #d97706; margin-right: 4px }
.tp-fundo { position: fixed; inset: 0; z-index: 9350; background: rgba(15,23,42,.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px }
.tp-modal { width: min(820px, 100%); max-height: 90vh; overflow-y: auto; background: var(--portal-bg-card, #fefefe); box-shadow: 0 24px 60px rgba(15,23,42,.3); color: var(--portal-text, #0f172a); border-radius: 18px; padding: 20px 22px; display: grid; gap: 14px; animation: tpEntra .22s ease both }
@keyframes tpEntra { from { opacity: 0; transform: translateY(10px) scale(.98) } to { opacity: 1; transform: none } }
.tp-mh { display: flex; gap: 14px; align-items: center } .tp-mh-id { display: grid; gap: 2px; flex: 1; min-width: 0 } .tp-mh-id b { font-size: 20px } .tp-mh-id small { font-size: 13px; color: #64748b }
.tp-x { border: 0; background: #f1f5f9; width: 34px; height: 34px; border-radius: 50%; cursor: pointer; color: #475569; font-size: 15px } .tp-x:hover { background: #e2e8f0 }
.tp-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px }
.tp-kpis > div { border-radius: 14px; background: #f8fafc; padding: 12px 14px; display: grid; gap: 2px; text-align: center }
.tp-kpis small { font-size: 12px; color: #64748b } .tp-kpis b { font-size: 26px; line-height: 1.1 } .tp-kpis em { font-style: normal; font-size: 11.5px; color: #64748b }
.tp-kpis .ruim { background: #fff1f2 } .tp-kpis .ruim b { color: #b91c1c } .tp-kpis .bom { background: #ecfdf5 } .tp-kpis .bom b { color: #047857 } .tp-kpis b.pos { color: #047857 } .tp-kpis b.neg { color: #b91c1c }
.tp-filtros { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center }
.tp-filtros button { --c: #475569; display: inline-flex; gap: 7px; align-items: center; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 99px; padding: 7px 14px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; color: inherit; transition: all .15s }
.tp-filtros button i { width: 9px; height: 9px; border-radius: 50%; background: var(--c) } .tp-filtros button em { font-style: normal; font-weight: 500; font-size: 11.5px; color: #64748b }
.tp-filtros button:hover { border-color: color-mix(in srgb, var(--c) 50%, #e2e8f0) }
.tp-filtros button.on { background: var(--c); border-color: var(--c); color: #fefefe } .tp-filtros button.on em { color: #fefefe; opacity: .85 } .tp-filtros button.on i { background: #fefefe }
.tp-dica { margin: 0; display: flex; gap: 10px; align-items: flex-start; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 10px 14px; font-size: 13px; color: #78350f } .tp-dica > i { color: #d97706; margin-top: 2px }
.tp-sec-n { margin-left: auto; font-size: 12px; font-weight: 500; color: #64748b }
.tp-oc { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px 8px; border-radius: 10px; padding: 2px 4px }
.tp-oc:hover { background: #fff1f2 } .tp-oc.anul { opacity: .55 }
.tp-oc-a { display: grid; grid-template-columns: 48px 1fr auto; gap: 10px; align-items: center; border: 0; background: none; padding: 7px 4px; text-align: left; cursor: pointer; font: inherit; color: inherit; font-size: 13px; min-width: 0 }
.tp-oc-a .d { color: #64748b } .tp-oc-a small { display: block; font-size: 11.5px; color: #64748b; margin-left: 14px }
.tp-oc-a em { font-style: normal; font-size: 11px; border-radius: 99px; padding: 2px 8px; white-space: nowrap } .tp-oc-a em.vale { background: #fee2e2; color: #b91c1c } .tp-oc-a em.julg { background: #fef3c7; color: #92400e } .tp-oc-a em.anul { background: #f1f5f9; color: #64748b }
.tp-pts { min-width: 62px; border: 1px solid transparent; background: none; border-radius: 99px; padding: 5px 10px; font: inherit; font-weight: 700; color: #b91c1c; display: inline-flex; gap: 6px; align-items: center; justify-content: flex-end }
.tp-pts.edita { cursor: pointer } .tp-pts.edita:hover { border-color: #fecaca; background: #fff } .tp-pts i { font-size: 10px; color: #cbd5e1 } .tp-pts.edita:hover i { color: #b91c1c }
.tp-ed { display: inline-flex; gap: 4px; align-items: center }
.tp-ed button { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #e2e8f0; background: #fefefe; cursor: pointer; font: inherit; font-weight: 700; color: #334155 } .tp-ed button.ok { background: #047857; border-color: #047857; color: #fefefe }
.tp-ed input { width: 46px; text-align: center; border: 1px solid #cbd5e1; border-radius: 8px; padding: 4px; font: inherit; font-weight: 700 }
.tp-erro { grid-column: 1 / -1; color: #b91c1c; font-size: 12px; text-align: right }
/* cartões maiores (José, 04/11/2026: "aumenta os cards") */
.tp-grade { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px }
.tp-c { padding: 18px 20px; gap: 10px; border-radius: 16px }
.tp-c-n { display: flex; gap: 10px; align-items: center } .tp-c-n > span { display: grid; gap: 1px } .tp-c-n b { font-size: 16px; font-weight: 700 } .tp-c-n small { font-size: 12px; font-weight: 600 }
.tp-c > b { font-size: 38px; line-height: 1.05 } .tp-c > b small { font-size: 14px }
.tp-c-bar { height: 8px } .tp-c > small { font-size: 12.5px }
@media (max-width: 640px) { .tp-kpis { grid-template-columns: 1fr } }
.tp-sec { margin: 6px 0 0; font-size: 14px; display: flex; gap: 8px; align-items: center } .tp-sec i { color: #9f1239 } .tp-sec em { font-style: normal; font-size: 11px; background: #9f1239; color: #fefefe; border-radius: 99px; padding: 1px 8px }
.tp-def { background: var(--portal-bg-card, #fefefe); border: 1px solid #fda4af; border-radius: 10px; padding: 10px 12px; display: grid; gap: 6px }
.tp-def-t { display: flex; gap: 8px; align-items: baseline } .tp-def-t small { color: #64748b; font-size: 12px } .tp-def-t em { margin-left: auto; font-style: normal; color: #b91c1c; font-weight: 700 }
.tp-def p { margin: 0; font-size: 13px; font-style: italic; color: #334155 } .tp-def p small { font-style: normal; color: #64748b }
.tp-def-b { display: flex; gap: 6px; flex-wrap: wrap } .tp-def-b button { border: 1px solid #e2e8f0; background: #fefefe; border-radius: 99px; padding: 5px 12px; font: inherit; font-size: 12.5px; cursor: pointer; color: #334155 }
.tp-def-b button.ok { background: #047857; border-color: #047857; color: #fefefe } .tp-def-b button.nao { background: #fef2f2; border-color: #fecaca; color: #b91c1c } .tp-def-b button:disabled { opacity: .5 }
.tp-ocs { display: grid; gap: 2px }
.tp-ocs > button { display: grid; grid-template-columns: 48px 1fr auto 44px; gap: 10px; align-items: center; border: 0; background: var(--portal-bg-card, #fefefe); border-radius: 8px; padding: 7px 8px; text-align: left; cursor: pointer; font: inherit; color: inherit; font-size: 13px }
.tp-ocs > button:hover { background: #fff1f2 } .tp-ocs > button.anul { opacity: .55 }
.tp-ocs small { display: block; font-size: 11.5px; color: #64748b; margin-left: 14px }
.tp-ocs em { font-style: normal; font-size: 11px; border-radius: 99px; padding: 2px 8px } .tp-ocs em.vale { background: #fee2e2; color: #b91c1c } .tp-ocs em.julg { background: #fef3c7; color: #92400e } .tp-ocs em.anul { background: #f1f5f9; color: #64748b }
.tp-ocs .n { text-align: right; color: #b91c1c }
.tp-hist { display: grid; gap: 2px; font-size: 12px; color: #64748b; padding-top: 4px; border-top: 1px dashed #fecdd3 } .tp-hist em { font-style: normal; color: #b91c1c }
.tp-scroll { overflow-x: auto }
.tp-tab { width: 100%; border-collapse: collapse; font-size: 13px }
.tp-tab th { text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; padding: 6px 8px; font-weight: 600 }
.tp-tab td { padding: 8px; border-top: 1px solid #f1f5f9; vertical-align: top }
.tp-tab .neg { color: #b91c1c; font-weight: 700; white-space: nowrap } .tp-tab .tecs { color: #64748b; font-size: 12px }
.tp-tab td i.fas { color: #64748b; width: 16px }
.tp-bola { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px }
.tp-off { margin-left: 6px; font-size: 10.5px; background: #f1f5f9; color: #64748b; border-radius: 99px; padding: 1px 7px }
[data-theme="dark"] .tp, [data-theme="dark"] .tp-c, [data-theme="dark"] .tp-mot-l { border-color: #333 } [data-theme="dark"] .tp-det { background: #1a0d10; border-color: #4c1d24 }
[data-theme="dark"] .tp-tab td { border-color: #262626 } [data-theme="dark"] .tp-mot-l p { color: #cbd5e1 }
`
