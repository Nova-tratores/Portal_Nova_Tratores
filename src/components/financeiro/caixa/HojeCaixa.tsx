'use client'
// Aba Hoje do Financeiro novo (José, 06/11/2026; docs/financeiro-novo-06-11.md): o que vence hoje, o que está
// vencido e o que entrou e saiu hoje, da empresa escolhida no topo. Só lê o espelho do Omie pelas rotas do DRE:
// /titulos?data=hoje (vencimento), /titulos?eixo=pagamento (pago/recebido hoje) e /vencidos.
import Link from 'next/link'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NOME_EMPRESA_FIN, useEmpresaFinanceiro } from '../empresaFinanceiro'
import { COR, ESTILO_CAIXA, MESES, brl, contas, hojeISO, nomeDe, pegarDre, semZeros } from './comum'

interface Titulo {
  tipo: 'pagar' | 'receber'; codigo_lancamento: number; numero_documento: string | null; numero_documento_fiscal: string | null
  numero_parcela: string | null; data_vencimento: string; data_pagamento: string | null; valor_documento: number; valor_pago: number
  status_derivado: string; descricao_categoria: string | null; nome_contraparte: string | null
}
interface Vencido {
  tipo: 'pagar' | 'receber'; codigo_lancamento: number; nome: string | null; numero_documento: string | null; numero_documento_fiscal: string | null
  descricao_categoria: string | null; valor_aberto: number; dias_atraso: number
}
interface Dados { vence: Titulo[]; pagos: Titulo[]; vencidos: Vencido[] }
type Lado = 'receber' | 'pagar'
type Linha = { chave: string; nome: string; sub: string; valor: number; selo?: string; apagado?: boolean }

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const dataLonga = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`)
  return `${SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()].toLowerCase()}`
}
const aberto = (t: Titulo) => (t.status_derivado === 'LIQUIDADO' ? 0 : Math.max(0, t.valor_documento - t.valor_pago))
const docDe = (nf: string | null, doc: string | null) => (nf ? `NF ${semZeros(nf)}` : doc || '')
const juntar = (...p: Array<string | null | undefined>) => p.filter(Boolean).join(' · ')
const soma = (l: Linha[]) => l.reduce((a, x) => a + (x.apagado ? 0 : x.valor), 0)
const MOSTRA = 8 // por lista; o resto abre no "ver todas"

export default function HojeCaixa() {
  const hoje = useMemo(() => hojeISO(), [])
  const [conta] = useEmpresaFinanceiro()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const [contaVista, setContaVista] = useState(conta)
  if (contaVista !== conta) { setContaVista(conta); setDados(null); setAbertas(new Set()) }

  useEffect(() => {
    let vivo = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- liga a rodinha antes de buscar
    setCarregando(true); setErro('')
    Promise.all([
      pegarDre<{ titulos: Titulo[] }>(`/api/dre-financeiro/titulos?data=${hoje}&tipo=ambos&conta=${conta}`),
      pegarDre<{ titulos: Titulo[] }>(`/api/dre-financeiro/titulos?data=${hoje}&eixo=pagamento&tipo=ambos&conta=${conta}`),
      pegarDre<{ titulos: Vencido[] }>(`/api/dre-financeiro/vencidos?conta=${conta}&tipo=ambos`),
    ])
      .then(([v, p, ve]) => { if (vivo) setDados({ vence: v.titulos, pagos: p.titulos.filter((t) => t.valor_pago > 0), vencidos: ve.titulos }) })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [conta, hoje])

  // as seis listas da tela, já no formato de linha
  const listas = useMemo(() => {
    if (!dados) return null
    const vence = (lado: Lado): Linha[] => dados.vence.filter((t) => t.tipo === lado)
      .map((t) => ({ chave: `v${t.codigo_lancamento}`, nome: nomeDe(t.nome_contraparte), sub: juntar(t.descricao_categoria, docDe(t.numero_documento_fiscal, t.numero_documento)),
        valor: aberto(t) || t.valor_documento, apagado: aberto(t) === 0, selo: aberto(t) === 0 ? (lado === 'receber' ? 'recebido' : 'pago') : undefined }))
      .sort((a, b) => Number(!!a.apagado) - Number(!!b.apagado) || b.valor - a.valor)
    const vencido = (lado: Lado): Linha[] => dados.vencidos.filter((t) => t.tipo === lado)
      .map((t) => ({ chave: `a${t.codigo_lancamento}`, nome: nomeDe(t.nome), sub: juntar(t.descricao_categoria, docDe(t.numero_documento_fiscal, t.numero_documento)),
        valor: t.valor_aberto, selo: `${t.dias_atraso} ${t.dias_atraso === 1 ? 'dia' : 'dias'}` }))
      .sort((a, b) => b.valor - a.valor)
    const pago = (lado: Lado): Linha[] => dados.pagos.filter((t) => t.tipo === lado)
      .map((t) => ({ chave: `p${t.codigo_lancamento}`, nome: nomeDe(t.nome_contraparte), sub: juntar(t.descricao_categoria, docDe(t.numero_documento_fiscal, t.numero_documento)), valor: t.valor_pago }))
      .sort((a, b) => b.valor - a.valor)
    return {
      venceR: vence('receber'), venceP: vence('pagar'),
      vencidoR: vencido('receber'), vencidoP: vencido('pagar'),
      entrou: pago('receber'), saiu: pago('pagar'),
    }
  }, [dados])

  const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const alternar = (k: string) => setAbertas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const resumo: Array<[string, string, Linha[] | undefined, string]> = [
    ['hj-vence', 'A receber hoje', listas?.venceR, COR.receber], ['hj-vence', 'A pagar hoje', listas?.venceP, COR.pagar],
    ['hj-vencido', 'Vencido a receber', listas?.vencidoR, '#b45309'], ['hj-vencido', 'Vencido a pagar', listas?.vencidoP, '#b45309'],
    ['hj-pago', 'Entrou hoje', listas?.entrou, COR.receber], ['hj-pago', 'Saiu hoje', listas?.saiu, COR.pagar],
  ]
  const verVencidos = <Link href="/financeiro/caixa/vencidos" className="cx-link">Abrir em Vencidos, com juros e cobrança</Link>

  return (
    <div className="cx">
      <style>{ESTILO_CAIXA + ESTILO}</style>
      <section className="cx-card cx-topo">
        <span className="cx-periodo">Hoje, {dataLonga(hoje)} · {NOME_EMPRESA_FIN[conta]}</span>
        <span className="cx-grupo cx-apagado">
          {carregando && <i className="fa-solid fa-circle-notch fa-spin" />}
          o Omie atualiza o portal a cada 3 horas; baixa feita pelo portal aparece na hora
        </span>
      </section>

      {erro && <div className="cx-card cx-erro">{erro}</div>}

      <section className="cx-card cx-resumo hj-resumo">
        {resumo.map(([alvo, rot, l, cor]) => (
          <button key={rot} type="button" className="cx-res hj-res" onClick={() => ir(alvo)}>
            <span className="cx-rot">{rot}</span>
            <strong style={{ color: l && soma(l) > 0 ? cor : undefined }}>{l ? brl(soma(l)) : '…'}</strong>
            <span className="cx-det">{l ? contas(l.filter((x) => !x.apagado).length) : 'carregando'}</span>
          </button>
        ))}
      </section>

      {!listas && !erro && <div className="cx-card cx-vazio">Carregando o dia…</div>}
      {listas && (
        <>
          <h2 id="hj-vence" className="hj-titulo">Vence hoje</h2>
          <div className="cx-dupla">
            <Lista todas={abertas.has('vr')} onAlternar={() => alternar('vr')} titulo="A receber" cor={COR.receber} linhas={listas.venceR} vazio="Nenhuma conta a receber vence hoje" />
            <Lista todas={abertas.has('vp')} onAlternar={() => alternar('vp')} titulo="A pagar" cor={COR.pagar} linhas={listas.venceP} vazio="Nenhuma conta a pagar vence hoje" />
          </div>

          <h2 id="hj-vencido" className="hj-titulo">Vencido</h2>
          <div className="cx-dupla">
            <Lista todas={abertas.has('ar')} onAlternar={() => alternar('ar')} titulo="A receber, em atraso" cor="#b45309" linhas={listas.vencidoR} vazio="Nenhum cliente em atraso" rodape={verVencidos} />
            <Lista todas={abertas.has('ap')} onAlternar={() => alternar('ap')} titulo="A pagar, em atraso" cor="#b45309" linhas={listas.vencidoP} vazio="Nenhuma conta a pagar em atraso" rodape={verVencidos} />
          </div>

          <h2 id="hj-pago" className="hj-titulo">Entrou e saiu hoje</h2>
          <div className="cx-dupla">
            <Lista todas={abertas.has('en')} onAlternar={() => alternar('en')} titulo="Entrou" cor={COR.receber} linhas={listas.entrou} vazio="Nada recebido hoje até a última atualização" />
            <Lista todas={abertas.has('sa')} onAlternar={() => alternar('sa')} titulo="Saiu" cor={COR.pagar} linhas={listas.saiu} vazio="Nada pago hoje até a última atualização" />
          </div>

          <details className="cx-card hj-como">
            <summary>Como ler esta tela</summary>
            <p className="cx-nota">
              Os seis números do alto são o dia da empresa escolhida no topo; clique num deles para descer até a lista.
              &quot;Vence hoje&quot; mostra o que ainda está em aberto com vencimento hoje; o que já foi pago fica apagado no fim da lista.
              &quot;Vencido&quot; é tudo o que passou do vencimento e não foi pago, com os dias de atraso; a cobrança com juros fica na aba Vencidos.
              &quot;Entrou e saiu hoje&quot; são as contas com data de pagamento hoje.
            </p>
          </details>
        </>
      )}
    </div>
  )
}

function Lista({ titulo, cor, linhas, vazio, rodape, todas, onAlternar }: { titulo: string; cor: string; linhas: Linha[]; vazio: string; rodape?: ReactNode; todas: boolean; onAlternar: () => void }) {
  const vis = todas ? linhas : linhas.slice(0, MOSTRA)
  return (
    <section className="cx-card hj-lista">
      <div className="hj-cab">
        <span className="hj-cab-nome"><span className="hj-ponto" style={{ background: cor }} />{titulo}</span>
        <span className="cx-apagado">{contas(linhas.filter((l) => !l.apagado).length)} · <span style={{ color: cor }}>{brl(soma(linhas))}</span></span>
      </div>
      {linhas.length === 0 ? <div className="cx-vazio">{vazio}</div> : (
        <ul>
          {vis.map((l) => (
            <li key={l.chave} className={l.apagado ? 'hj-apagado' : ''}>
              <span className="hj-nome">{l.nome}{l.sub && <small>{l.sub}</small>}</span>
              {l.selo && <span className="cx-pilula" style={{ color: l.apagado ? '#16a34a' : cor }}>{l.selo}</span>}
              <span className="hj-valor">{brl(l.valor)}</span>
            </li>
          ))}
        </ul>
      )}
      {(linhas.length > MOSTRA || rodape) && (
        <div className="hj-pe">
          {linhas.length > MOSTRA && <button type="button" className="cx-link" onClick={onAlternar}>{todas ? 'Mostrar menos' : `Ver todas as ${linhas.length}`}</button>}
          {rodape}
        </div>
      )}
    </section>
  )
}

const ESTILO = `
.hj-resumo { grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr)) }
.hj-res { cursor: pointer; transition: background .15s; animation: hj-entra .35s ease both }
.hj-res:hover { background: color-mix(in srgb, #2563eb 5%, transparent) }
.hj-titulo { margin: 8px 0 0; font-size: 17px; font-weight: 500; scroll-margin-top: 160px }
.hj-lista { overflow: hidden; animation: hj-entra .35s ease both }
.hj-cab { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 15px }
.hj-cab-nome { display: inline-flex; align-items: center; gap: 8px; font-size: 16px }
.hj-ponto { width: 9px; height: 9px; border-radius: 50% }
.hj-lista ul { list-style: none; margin: 0; padding: 0 }
.hj-lista li { display: flex; align-items: center; gap: 10px; padding: 9px 16px; border-bottom: 1px solid var(--border, #e2e8f0); transition: background .15s }
.hj-lista li:last-child { border-bottom: none }
.hj-lista li:hover { background: color-mix(in srgb, #0369a1 4%, var(--surface, #fefefe)) }
.hj-nome { flex: 1; min-width: 0; font-size: 15px; overflow-wrap: anywhere }
.hj-nome small { display: block; margin-top: 2px; font-size: 13.5px; color: var(--portal-text-muted, #64748b) }
.hj-valor { flex-shrink: 0; font-size: 15.5px; font-variant-numeric: tabular-nums; white-space: nowrap }
.hj-lista .cx-pilula { flex-shrink: 0; font-size: 13px }
.hj-apagado { opacity: .5 }
.hj-pe { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border, #e2e8f0) }
.hj-como { padding: 12px 16px } .hj-como summary { cursor: pointer; font-size: 15px } .hj-como p { margin-top: 8px }
@keyframes hj-entra { from { opacity: 0; transform: translateY(6px) } }
@media (prefers-reduced-motion: reduce) { .hj-res, .hj-lista { animation: none } }
@media (max-width: 640px) {
  .hj-res { border-left: none; border-top: 1px solid var(--border, #e2e8f0) } .hj-res:first-child { border-top: none }
  .hj-lista li { flex-wrap: wrap } .hj-nome { flex-basis: 100% }
}
`
