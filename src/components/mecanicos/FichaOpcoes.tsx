'use client'
// 5 opções do modal do técnico (José, 19/10/2026: "faz 5 opções para esse modal, começando pelas
// informações do RH, coloca o nome da liga, como lançar a comissão, dividir uma comissão, se vai pagar
// ou por que não vai pagar"). Lançar = pedir autorização ao diretor; autorizado, o portal espelha no RH.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { METAS_PADRAO, type CardDados } from './CardsTecnicoOpcoes'
import type { FichaTecnico as Ficha } from '@/lib/mecanicos/ficha-server'
import type { LinhaComissao } from '@/lib/mecanicos/comissao-detalhe'
import { patente } from '@/lib/mecanicos/carreira'
import { IconeLiga } from './CartaLiga'
import { brl, brl2, horas } from './ui'
import { authHeaders } from '@/lib/auth/client'
import type { PedidoComissao } from '@/lib/mecanicos/lancamento-comissao-server'
import { parcelasDoDesconto, resumoParcelas, mesCurto, contaDoPagamento, PCT_CAIXINHA, type DescontoPedido } from '@/lib/mecanicos/descontos-tecnico'
import CanvasAssinatura, { type CanvasAssinaturaRef } from '@/components/assinatura/CanvasAssinatura'
import { useMinhaAssinatura, AssinaturaSalva, CadastrarAssinatura } from '@/components/assinatura/MinhaAssinatura'
import { abrirDocumento } from './AutorizacoesJanela'
import {
  Resumo, Comissao, OSAba, Requisicoes, Frota, Ocorrencias, RH, Num,
  nomeMes, dataBR, diaBR, iniciais, tempoDeCasa, useVisores, useFicha, andarMes, hojeSP, ESTILO_FT, type Aba,
} from './FichaTecnico'

const MUDO = 'var(--portal-text-muted, #64748b)'

// ============================================================================ edição da comissão
export type Acao = 'pagar' | 'nao' | 'ajustar'
export interface Edicao { acao: Acao; motivo: string; valor?: number; divisao?: Record<string, number> | null; horasDiv?: Record<string, number> | null }
export const MOTIVOS_NAO = ['Retorno de serviço (refez o trabalho)', 'Já cobrada / paga em outra OS', 'Garantia que a fábrica não pagou', 'Serviço não concluído', 'Erro de lançamento na OS', 'Cortesia sem trabalho do técnico']
export const chaveL = (l: LinhaComissao) => `${l.os}|${l.tipo}`
/** Bloco da OS na comissão (José, 20/10/2026): azul = faturada para cliente, rosa = garantia, cinza = interna. */
export const grupoDa = (l: LinhaComissao): 'cliente' | 'garantia' | 'interna' => (l.garantia || /garantia/i.test(l.regra) ? 'garantia' : l.tipo === 'interna' ? 'interna' : 'cliente')

const jsonDiv = (x: Edicao | undefined) => JSON.stringify({ h: x?.horasDiv || null, v: x?.divisao || null, m: (x?.motivo || '').trim() })
export function useEdicao(d: Ficha) {
  // a ficha abre com as divisões já salvas (José, 29/10/2026: "tem que salvar para o usuário ter certeza de que foi")
  const iniciais = () => Object.fromEntries(d.comissao.linhas.filter((l) => d.divisoes?.[l.os]).map((l) => { const v = d.divisoes![l.os]; return [chaveL(l), { acao: 'pagar' as Acao, motivo: v.motivo || '', divisao: v.valores, horasDiv: v.horas }] }))
  const [ed, setEd] = useState<Record<string, Edicao>>(iniciais)
  const [salvas, setSalvas] = useState<Record<string, { em: string; json: string }>>(() => Object.fromEntries(Object.entries(iniciais()).map(([k, v]) => { const os = k.split('|')[0]; return [k, { em: d.divisoes![os].em, json: jsonDiv(v) }] })))
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erroDiv, setErroDiv] = useState<Record<string, string>>({})
  const estadoDivisao = (l: LinhaComissao) => { const k = chaveL(l), s = salvas[k]; return { salvaEm: s?.em || null, mudou: jsonDiv(ed[k]) !== (s?.json ?? jsonDiv(undefined)), salvando: salvando === k, erro: erroDiv[k] || '' } }
  const salvarDivisao = async (l: LinhaComissao, horasOS: number) => {
    const k = chaveL(l), x = ed[k]
    if (!x?.divisao) return
    setSalvando(k); setErroDiv((m) => ({ ...m, [k]: '' }))
    try {
      const r = await fetch('/api/mecanicos/divisao', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ mes: d.mes, os: l.os, numero: l.numeroOmie || l.os, de: d.nome, horas: x.horasDiv || null, horasOS, valores: x.divisao, motivo: x.motivo }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Não salvou')
      setSalvas((m) => ({ ...m, [k]: { em: j.em, json: jsonDiv(x) } }))
    } catch (err) { setErroDiv((m) => ({ ...m, [k]: err instanceof Error ? err.message : 'Não salvou' })) } finally { setSalvando(null) }
  }
  const apagarDivisao = async (l: LinhaComissao) => {
    const k = chaveL(l)
    if (salvas[k]) {
      try { await fetch(`/api/mecanicos/divisao?mes=${d.mes}&numero=${encodeURIComponent(l.numeroOmie || l.os)}`, { method: 'DELETE', headers: await authHeaders() }) } catch { /* fica na tela */ }
      setSalvas((m) => { const n = { ...m }; delete n[k]; return n })
    }
  }
  // descontos do técnico lançados junto (requisição ou outro valor) — viram desconto no RH, não mexem na comissão
  const [descontos, setDescontos] = useState<DescontoPedido[]>([])
  const mudar = (l: LinhaComissao, x: Partial<Edicao>) => setEd((e) => ({ ...e, [chaveL(l)]: { ...(e[chaveL(l)] || { acao: 'pagar', motivo: '' }), ...x } }))
  const de = (l: LinhaComissao): Edicao => ed[chaveL(l)] || { acao: 'pagar', motivo: '' }
  /** quanto ESTE técnico recebe pela linha depois da decisão */
  const final = (l: LinhaComissao) => {
    const e = de(l)
    if (e.acao === 'nao') return 0
    if (e.divisao) return e.divisao[d.nome] ?? 0
    if (e.acao === 'ajustar') return e.valor ?? l.valor
    return l.valor
  }
  const linhas = d.comissao.linhas.filter((l) => l.tipo !== 'aguardando')
  const tot = linhas.reduce((s, l) => {
    const e = de(l), f = final(l)
    s.total += f; s.calc += l.valor
    const g = grupoDa(l)
    if (g === 'interna') { s.interna += f; s.nInterna++ } else if (g === 'garantia') { s.garantia += f; s.nGarantia++ } else { s.cliente += f; s.nCliente++ }
    if (e.acao === 'nao') s.nao++
    else if (e.divisao) s.divididas++
    else if (e.acao === 'ajustar') s.ajustadas++
    else s.pagas++
    return s
  }, { total: 0, calc: 0, pagas: 0, nao: 0, ajustadas: 0, divididas: 0, cliente: 0, interna: 0, garantia: 0, nCliente: 0, nInterna: 0, nGarantia: 0 })
  const pendentes = linhas.filter((l) => { const e = de(l); return (e.acao !== 'pagar' || e.divisao) && !e.motivo.trim() }).length
  const totDesc = Math.round(descontos.reduce((a, x) => a + x.valor, 0) * 100) / 100
  return { ed, de, mudar, final, linhas, tot, pendentes, estadoDivisao, salvarDivisao, apagarDivisao, limpar: () => setEd({}), descontos, totDesc, addDesconto: (x: DescontoPedido) => setDescontos((v) => [...v, x]), remDesconto: (i: number) => setDescontos((v) => v.filter((_, k) => k !== i)) }
}
export type EdicaoComissao = ReturnType<typeof useEdicao>

/** Uma OS da comissão: Pagar · Não pagar (por quê) · Ajustar valor · Dividir entre técnicos. */
function LinhaEditavel({ d, l, e, verOS, compacta }: { d: Ficha; l: LinhaComissao; e: EdicaoComissao; verOS: (os: string, c?: string) => void; compacta?: boolean }) {
  const x = e.de(l)
  const [dividindo, setDividindo] = useState(false)
  const f = e.final(l)
  const corEstado = x.acao === 'nao' ? '#dc2626' : x.divisao ? '#7c3aed' : x.acao === 'ajustar' ? '#d97706' : '#059669'
  return (
    <div className={`fo-lin ${x.acao}`} style={{ '--ec': corEstado } as React.CSSProperties}>
      <div className="fo-lin-cab">
        <button type="button" className="ft-os" onClick={() => verOS(l.os, l.cliente)}>{l.numeroOmie || l.os}</button>
        <div className="fo-lin-id"><b>{l.cliente || '—'}</b><small>{diaBR(l.data)} · {l.regra}{(l.tecnicos?.length || 0) > 1 ? ` · com ${l.tecnicos!.filter((t) => t !== d.nome).join(', ')}` : ''}</small>
          {l.motivo && <small className="fo-rh-mot"><i className="fas fa-pen" /> RH: {l.motivo.motivo}</small>}</div>
        <div className="fo-lin-val">{f !== l.valor && <s>{brl2(l.valor)}</s>}<b>{brl2(f)}</b></div>
      </div>
      <div className="fo-lin-acoes">
        <div className="fo-seg">
          <button type="button" className={x.acao === 'pagar' && !x.divisao ? 'on pagar' : ''} onClick={() => e.mudar(l, { acao: 'pagar', divisao: null })}><i className="fas fa-check" /> Pagar</button>
          <button type="button" className={x.acao === 'nao' ? 'on nao' : ''} onClick={() => e.mudar(l, { acao: 'nao', divisao: null })}><i className="fas fa-ban" /> Não pagar</button>
          <button type="button" className={x.acao === 'ajustar' && !x.divisao ? 'on ajustar' : ''} onClick={() => e.mudar(l, { acao: 'ajustar', divisao: null, valor: x.valor ?? l.valor })}><i className="fas fa-pen" /> Ajustar</button>
          <button type="button" className={x.divisao ? 'on dividir' : ''} onClick={() => setDividindo((v) => !v)}><i className="fas fa-people-arrows" /> Dividir</button>
        </div>
        {!compacta && x.acao === 'pagar' && !x.divisao && <small className="fo-ok"><i className="fas fa-circle-check" /> entra na comissão como calculado</small>}
      </div>
      {x.acao === 'nao' && (
        <div className="fo-motivos">
          <small>Por que não vai pagar?</small>
          <div>{MOTIVOS_NAO.map((m) => <button key={m} type="button" className={x.motivo === m ? 'on' : ''} onClick={() => e.mudar(l, { motivo: m })}>{m}</button>)}</div>
          <input placeholder="ou escreva o motivo…" value={MOTIVOS_NAO.includes(x.motivo) ? '' : x.motivo} onChange={(ev) => e.mudar(l, { motivo: ev.target.value })} />
        </div>
      )}
      {x.acao === 'ajustar' && !x.divisao && (
        <div className="fo-motivos">
          <div className="fo-ajuste"><label>Valor para ele <span>R$</span><input type="number" step="0.01" value={x.valor ?? ''} onChange={(ev) => e.mudar(l, { valor: Number(ev.target.value) || 0 })} /></label>
            <input className="fo-mot-txt" placeholder="motivo do ajuste (vai junto para o RH)" value={x.motivo} onChange={(ev) => e.mudar(l, { motivo: ev.target.value })} /></div>
        </div>
      )}
      {(dividindo || x.divisao) && <Divisao d={d} l={l} e={e} fechar={() => setDividindo(false)} />}
    </div>
  )
}

/** Dividir uma OS entre técnicos POR HORAS (José, 29/10/2026: "no lugar de dar porcentagens, nós vamos distribuir as
 *  horas entre vários técnicos ou não. Cada um ganha a porcentagem que ganha em cima das horas que recebeu").
 *  Valor de cada um = horas dele × valor da hora da OS × % dele. OS de valor fixo (sem horas) segue dividindo em R$. */
export function Divisao({ d, l, e, fechar }: { d: Ficha; l: LinhaComissao; e: EdicaoComissao; fechar: () => void }) {
  const x = e.de(l)
  // horas da OS: da linha da comissão; se faltar (ficha antiga no cache), das OS do mês da ficha
  const horasOS = Math.round((l.horas || d.os.faturadas.find((o) => o.os === l.os)?.horas || d.os.internas?.find((o) => o.os === l.os)?.horas || 0) * 100) / 100
  const porHoras = l.base > 0 && horasOS > 0
  const vh = porHoras ? l.base / horasOS : 0
  const pctDe = (n: string) => d.equipe.find((t) => t.nome === n)?.pct ?? (n === d.nome ? d.comissao.pct : 0)
  const valorDe = (n: string, h: number) => Math.round(h * vh * (pctDe(n) / 100) * 100) / 100
  const totalOS = Math.round(l.calculado * Math.max(1, l.divisao) * 100) / 100
  // ---- por horas
  const hIni = () => { const ts = l.tecnicos?.length ? l.tecnicos.filter((t) => d.equipe.some((q) => q.nome === t)) : []; const lista = ts.length ? ts : [d.nome]; return Object.fromEntries(lista.map((t) => [t, Math.round((horasOS / lista.length) * 10) / 10])) }
  const hs = x.horasDiv || hIni()
  const somaH = Math.round(Object.values(hs).reduce((a, v) => a + v, 0) * 100) / 100
  const salvarH = (nh: Record<string, number>) => e.mudar(l, { horasDiv: nh, divisao: Object.fromEntries(Object.entries(nh).map(([n, h]) => [n, valorDe(n, h)])), acao: 'pagar' })
  // ---- por valor (OS de valor fixo)
  const vIni = () => { const ts = l.tecnicos?.length ? l.tecnicos : [d.nome]; return Object.fromEntries(ts.map((t) => [t, Math.round((totalOS / ts.length) * 100) / 100])) }
  const div = x.divisao || vIni()
  const somaV = Object.values(div).reduce((a, v) => a + v, 0)
  const salvarV = (nv: Record<string, number>) => e.mudar(l, { divisao: nv, horasDiv: null, acao: 'pagar' })
  // ninguém recebe mais horas do que a OS tem (José, 29/10/2026): o máximo de cada um é o que sobra dos outros
  const livre = (n: string) => Math.max(0, Math.round((horasOS - Object.entries(hs).filter(([k]) => k !== n).reduce((a, [, v]) => a + v, 0)) * 10) / 10)
  /** horas iguais entre os nomes, em décimos; a sobra do arredondamento fica com o último (a soma fecha) */
  const repartir = (ks: string[]) => { if (!ks.length) return {}; const p = Math.floor((horasOS / ks.length) * 10) / 10; return Object.fromEntries(ks.map((k, i) => [k, i === ks.length - 1 ? Math.round((horasOS - p * (ks.length - 1)) * 10) / 10 : p])) }
  const igual = () => {
    if (porHoras) salvarH(repartir(Object.keys(hs)))
    else { const ks = Object.keys(div); salvarV(Object.fromEntries(ks.map((k) => [k, Math.round((totalOS / ks.length) * 100) / 100]))) }
  }
  const hh = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`
  return (
    <div className="fo-div">
      <div className="fo-div-cab"><b><i className="fas fa-people-arrows" /> {porHoras ? 'Dividir as horas da OS' : 'Dividir a comissão da OS'}</b>
        <small>{porHoras ? <>{hh(horasOS)} cobradas · hora da OS {brl2(vh)} · cada um ganha a % dele sobre as horas que recebeu</> : <>OS de valor fixo: comissão total {brl2(totalOS)}</>}</small>
        <button type="button" onClick={igual}>dividir igual</button>
        {x.divisao && <button type="button" onClick={() => { void e.apagarDivisao(l); e.mudar(l, { divisao: null, horasDiv: null }); fechar() }}>desfazer</button>}</div>
      <div className="fo-div-lista">
        {d.equipe.map((t) => {
          const marcado = porHoras ? t.nome in hs : t.nome in div
          const trocar = () => {
            // marcar ou desmarcar alguém já reparte as horas igual entre os marcados; depois dá para acertar na mão (José, 29/10/2026)
            if (porHoras) { const n = { ...hs }; if (marcado) delete n[t.nome]; else n[t.nome] = 0; salvarH(repartir(Object.keys(n))) }
            else { const n = { ...div }; if (marcado) delete n[t.nome]; else n[t.nome] = 0; salvarV(n) }
          }
          return (
            <label key={t.nome} className={marcado ? 'on' : ''}>
              <input type="checkbox" checked={marcado} onChange={trocar} />
              <span>{t.nome}{t.nome === d.nome && <em> (este)</em>}<small className="fo-div-pct"> · {pctDe(t.nome)}%</small></span>
              {marcado && (porHoras
                ? <><input type="number" step="0.5" min="0" max={livre(t.nome)} value={hs[t.nome]} onChange={(ev) => salvarH({ ...hs, [t.nome]: Math.min(livre(t.nome), Math.max(0, Number(ev.target.value) || 0)) })} title={`até ${hh(livre(t.nome))} (o resto já está com os outros)`} /><i>h</i><b className="fo-div-v">{brl2(valorDe(t.nome, hs[t.nome] || 0))}</b></>
                : <><i>R$</i><input type="number" step="0.01" value={div[t.nome]} onChange={(ev) => salvarV({ ...div, [t.nome]: Number(ev.target.value) || 0 })} /><small>{somaV > 0 ? Math.round((div[t.nome] / somaV) * 100) : 0}%</small></>)}
            </label>
          )
        })}
      </div>
      <div className="fo-div-pe">
        {porHoras
          ? <span>Horas distribuídas: <b>{hh(somaH)}</b> de {hh(horasOS)}{Math.abs(somaH - horasOS) > 0.05 && <em> ({somaH > horasOS ? 'passou ' : 'faltam '}{hh(Math.abs(somaH - horasOS))})</em>}</span>
          : <span>Soma: <b>{brl2(somaV)}</b>{Math.abs(somaV - totalOS) > 0.01 && <em> ({somaV > totalOS ? '+' : ''}{brl2(somaV - totalOS)} da regra)</em>}</span>}
        <input className="fo-mot-txt" placeholder="motivo da divisão (ex.: Fernando ajudou na montagem)" value={x.motivo} onChange={(ev) => e.mudar(l, { motivo: ev.target.value })} /></div>
      {(() => {
        const st = e.estadoDivisao(l)
        const outros = Object.keys(x.divisao || {}).filter((n) => n !== d.nome && (x.divisao![n] || 0) > 0).map((n) => n.split(' ')[0])
        const falta = !x.divisao ? 'escolha os técnicos' : !x.motivo.trim() ? 'escreva o motivo' : porHoras && Math.abs(somaH - horasOS) > 0.05 ? 'distribua todas as horas' : ''
        return (
          <div className={`fo-div-salvar ${st.salvaEm && !st.mudou ? 'ok' : ''}`}>
            {st.salvaEm && !st.mudou
              ? <span><i className="fas fa-circle-check" /> Divisão salva às {new Date(st.salvaEm).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}{outros.length ? ` · já aparece na ficha de ${outros.join(' e ')}` : ''}</span>
              : <span>{st.erro ? <em><i className="fas fa-triangle-exclamation" /> {st.erro}</em> : st.salvaEm ? 'Mudou depois de salvar — salve de novo.' : falta ? `Para salvar: ${falta}.` : 'Ainda não foi salva.'}</span>}
            <button type="button" disabled={!!falta || st.salvando || (!!st.salvaEm && !st.mudou)} onClick={() => void e.salvarDivisao(l, horasOS)}>
              {st.salvando ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</> : st.salvaEm && !st.mudou ? <><i className="fas fa-check" /> Salva</> : <><i className="fas fa-floppy-disk" /> Salvar divisão</>}
            </button>
          </div>
        )
      })()}
    </div>
  )
}

/** Lista das OS da comissão com as decisões + filtro. */
export function EditorComissao({ d, e, verOS, compacta }: { d: Ficha; e: EdicaoComissao; verOS: (os: string, c?: string) => void; compacta?: boolean }) {
  const [so, setSo] = useState<'todas' | 'mexidas'>('todas')
  const lista = e.linhas.filter((l) => so === 'todas' || e.ed[chaveL(l)])
  const aCaminho = d.comissao.linhas.filter((l) => l.tipo === 'aguardando')
  return (
    <div className="fo-editor">
      <div className="fo-ed-topo">
        <div className="ft-filtros">
          <button type="button" className={so === 'todas' ? 'on' : ''} onClick={() => setSo('todas')}>Todas as OS ({e.linhas.length})</button>
          <button type="button" className={so === 'mexidas' ? 'on' : ''} onClick={() => setSo('mexidas')}>Com decisão ({Object.keys(e.ed).length})</button>
        </div>
        <small>Cada OS: <b className="c-p">pagar</b> como calculado, <b className="c-n">não pagar</b> (e por quê), <b className="c-a">ajustar</b> o valor ou <b className="c-d">dividir</b> com outro técnico.</small>
      </div>
      {([['cliente', 'Faturadas para clientes', 'fa-user-tie', 'OS cobradas do cliente (contam no pódio)'], ['garantia', 'Garantia', 'fa-shield-heart', 'paga pela fábrica: garantia faturada ou a receber (hora no teto da montadora)'], ['interna', 'Internas', 'fa-house-chimney', 'serviço da loja, cortesia e entrega técnica (não contam no pódio)']] as const).map(([k, rot, ic, dica]) => {
        const grupo = lista.filter((l) => grupoDa(l) === k)
        if (!grupo.length) return null
        return (
          <div key={k} className={`fo-grupo ${k}`}>
            <div className="fo-grupo-cab"><span><i className={`fas ${ic}`} /></span><b>{rot}</b><small>{dica}</small><em>{grupo.length} OS · {brl2(grupo.reduce((s, l) => s + e.final(l), 0))}</em></div>
            {grupo.map((l) => <LinhaEditavel key={chaveL(l)} d={d} l={l} e={e} verOS={verOS} compacta={compacta} />)}
          </div>
        )
      })}
      {!lista.length && <div className="ft-vazio pequeno">Nenhuma OS aqui.</div>}
      {aCaminho.length > 0 && <p className="fo-cam"><i className="fas fa-hourglass-half" /> {aCaminho.length} OS esperando faturar ({brl2(aCaminho.reduce((s, l) => s + l.valor, 0))}) — entram na comissão quando faturarem.</p>}
    </div>
  )
}

/** Descontos do técnico junto com a comissão (José, 20/10/2026). Mesmo jeito do RH: requisição ou outro valor
 *  vira um desconto "pendente de aprovação" no RH e sai na folha, em até 12 vezes — a comissão não muda. */
function DescontosComissao({ e, travado }: { e: EdicaoComissao; travado: boolean }) {
  if (!e.descontos.length) return null
  const mesHoje = hojeSP().slice(0, 7)
  return (
    <section className="fld">
      <div className="fld-cab"><span className="fld-tit">Descontos do técnico</span><span className="fld-dica">saem da comissão depois que o RH aprovar</span></div>
      {e.descontos.map((x, i) => (
        <div key={i} className="fld-lin">
          <span className="fld-tipo">{x.tipo === 'requisicao' ? `Requisição #${x.ref}` : 'Outro valor'}</span>
          <span className="fld-desc">{x.descricao}<small className="fld-parc">{x.fonte === 'caixinha' ? 'pago pela caixinha · não sai da comissão' : resumoParcelas(x, mesHoje)}</small></span>
          <span className="fld-v">{x.fonte === 'caixinha' ? '' : '− '}{brl2(x.valor)}</span>
          {!travado && <button type="button" onClick={() => e.remDesconto(i)} aria-label="Tirar"><i className="fas fa-xmark" /></button>}
        </div>
      ))}
      <div className="fld-tot"><span>Total de descontos</span><span>− {brl2(e.totDesc)}</span></div>
    </section>
  )
}

/** Descontos que JÁ estão no RH e ainda não saíram (pendentes/aprovados), na tela de lançar a comissão
 *  (José, 29/10/2026: "não está mostrando lá na ficha dele, onde lançamos a comissão"). Os pagos pela caixinha
 *  aparecem marcados: não saem do salário dele. */
function DescontosNoRH({ d }: { d: Ficha }) {
  const lista = (d.rh?.descontos || []).filter((x) => x.status === 'pendente_aprovacao' || x.status === 'aprovado')
  if (!lista.length) return null
  const folha = lista.filter((x) => !x.caixinha).reduce((s, x) => s + x.valor, 0)
  const cx = lista.filter((x) => x.caixinha).reduce((s, x) => s + x.valor, 0)
  const limpa = (t: string) => t.split(' | Obs')[0].replace(/^\[[^\]]+\]\s*/, '')
  const origem = (t: string) => { const m = t.match(/REQ #(\d+)/); return m ? `Requisição #${m[1]}` : /COM #/.test(t) ? 'Lançado na comissão' : 'Lançado no RH' }
  return (
    <section className="fld">
      <div className="fld-cab"><span className="fld-tit">Descontos mecânicos · {d.nome} ({lista.length})</span><span className="fld-dica">lançados no RH e ainda não aplicados</span></div>
      <div className="fld-lin cab"><span>Mês</span><span>O que é</span><span>De onde</span><span className="fld-v">Valor</span></div>
      {lista.map((x, i) => (
        <div key={i} className={`fld-lin ${x.caixinha ? 'cx' : ''}`}>
          <span className="fld-tipo">{nomeMes(x.mes)}</span>
          <span className="fld-desc">{limpa(x.descricao)}<small className="fld-parc">{x.status === 'aprovado' ? 'aprovado' : 'esperando o RH aprovar'}</small></span>
          <span className="fld-onde"><b>{x.caixinha ? 'Caixinha' : 'Comissão'}</b><small>{origem(x.descricao)}</small></span>
          <span className="fld-v">{x.caixinha ? '' : '− '}{brl2(x.valor)}</span>
        </div>
      ))}
      <div className="fld-tot"><span>Da comissão{cx > 0 ? ` · pela caixinha ${brl2(cx)}` : ''}</span><span>− {brl2(folha)}</span></div>
    </section>
  )
}

type JaCobrada = { tecnico: string; status: string; desconto: DescontoPedido; pedidoEm: string }

/** Modal para lançar um desconto: requisição do mês (ou outro valor), em quantas vezes e a partir de quando. */
export function ModalDesconto({ d, e, fechar }: { d: Ficha; e: EdicaoComissao; fechar: () => void }) {
  const mesHoje = hojeSP().slice(0, 7)
  const [tipo, setTipo] = useState<'requisicao' | 'outro'>('requisicao')
  const [req, setReq] = useState('')
  const [busca, setBusca] = useState('')
  const [desc, setDesc] = useState('')
  const [valor, setValor] = useState('')
  const [parcelas, setParcelas] = useState(1)
  // quem paga (José, 29/10/2026: "aqui a gente não escolhe quando é da comissão ou da caixinha")
  const [fonte, setFonte] = useState<'funcionario' | 'caixinha'>('funcionario')
  const [inicio, setInicio] = useState(mesHoje)
  const [ja, setJa] = useState<JaCobrada[] | null>(null)
  useEffect(() => { const t = (ev: KeyboardEvent) => { if (ev.key === 'Escape') fechar() }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t) }, [fechar])
  useEffect(() => {
    if (!req) return
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/requisicao-desconto?id=${req}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (vivo) setJa(Array.isArray(j.descontos) ? j.descontos : [])
      } catch { if (vivo) setJa([]) }
    })()
    return () => { vivo = false }
  }, [req])
  const usadas = new Set(e.descontos.filter((x) => x.tipo === 'requisicao').map((x) => x.ref))
  const q = busca.trim().toLowerCase()
  const reqs = (d.requisicoes || []).filter((r) => r.valor > 0 && !usadas.has(String(r.id)) && (!q || `${r.id} ${r.titulo} ${r.tipo} ${r.os || ''} ${r.fornecedor || ''}`.toLowerCase().includes(q)))
  const escolher = (id: string) => {
    setReq(id); setJa(null)
    const r = (d.requisicoes || []).find((x) => String(x.id) === id)
    if (r) { setDesc(`${r.titulo || r.tipo}${r.os ? ` (OS ${r.os})` : ''}`); setValor(String(Math.round(Math.max(0, r.valor - (r.cobrado || 0)) * 100) / 100).replace('.', ',')) }
  }
  const v = Number(valor.replace(/\./g, '').replace(',', '.'))
  const ok = !!desc.trim() && v > 0 && (tipo === 'outro' || !!req)
  const previa: DescontoPedido = { tipo, ref: req || null, descricao: desc, valor: v > 0 ? v : 0, parcelas, inicio, fonte }
  const ps = v > 0 ? parcelasDoDesconto(previa, mesHoje) : []
  const incluir = () => { if (!ok) return; e.addDesconto({ tipo, ref: tipo === 'requisicao' ? req : null, descricao: desc.trim(), valor: Math.round(v * 100) / 100, parcelas: fonte === 'caixinha' ? 1 : parcelas, inicio, fonte }); fechar() }
  const tela = (
    <div className="mdd-fundo" onClick={fechar}>
      <style>{ESTILO_MDD}</style>
      <div className="mdd" role="dialog" aria-label="Desconto do técnico" onClick={(ev) => ev.stopPropagation()}>
        <header className="mdd-cab">
          <div><span className="mdd-tit">Desconto do técnico</span><span className="mdd-sub">{d.nome} · sai da comissão dele depois que o RH aprovar</span></div>
          <button type="button" className="mdd-x" onClick={fechar} aria-label="Fechar"><i className="fas fa-xmark" /></button>
        </header>
        <div className="mdd-corpo">
          <div className="mdd-esq">
            <div className="mdd-seg">
              <button type="button" className={tipo === 'requisicao' ? 'on' : ''} onClick={() => setTipo('requisicao')}>Requisição</button>
              <button type="button" className={tipo === 'outro' ? 'on' : ''} onClick={() => { setTipo('outro'); setReq(''); setJa(null) }}>Outro valor</button>
            </div>
            {tipo === 'requisicao' && (
              <div className="mdd-reqs">
                <input className="mdd-busca" placeholder="buscar por nº, título, OS ou fornecedor" value={busca} onChange={(ev) => setBusca(ev.target.value)} />
                <div className="mdd-lista">
                  {!reqs.length && <p className="mdd-vazio">Nenhuma requisição com valor neste mês.</p>}
                  {reqs.map((r) => (
                    <button type="button" key={r.id} className={`mdd-req ${req === String(r.id) ? 'on' : ''}`} onClick={() => escolher(String(r.id))}>
                      <span className="mdd-req-n">#{r.id}</span>
                      <span className="mdd-req-t">{r.titulo || r.tipo}<small>{diaBR(r.data)}{r.os ? ` · OS ${r.os}` : ''}{r.fornecedor ? ` · ${r.fornecedor}` : ''}</small></span>
                      <span className="mdd-req-v">{brl2(r.valor)}{r.cobrado ? <small>cliente pagou {brl2(r.cobrado)}</small> : <small>não cobrada do cliente</small>}</span>
                    </button>
                  ))}
                </div>
                {ja && ja.length > 0 && <p className="mdd-alerta">Esta requisição já está sendo descontada: {ja.map((x) => `${x.tecnico} — ${resumoParcelas(x.desconto, x.pedidoEm.slice(0, 7))}`).join('; ')}.</p>}
              </div>
            )}
            <label className="mdd-campo"><span>O que está sendo descontado</span><input value={desc} onChange={(ev) => setDesc(ev.target.value)} placeholder={tipo === 'outro' ? 'ex.: avaria no retrovisor do carro' : ''} /></label>
            <div className="mdd-campo"><span>Quem paga</span>
              <div className="mdd-quem">
                <button type="button" className={fonte === 'funcionario' ? 'on' : ''} onClick={() => setFonte('funcionario')}><i className="fas fa-user" /><b>{d.nome.split(' ')[0]}</b><small>sai da comissão dele</small></button>
                <button type="button" className={`cx ${fonte === 'caixinha' ? 'on' : ''}`} onClick={() => setFonte('caixinha')}><i className="fas fa-piggy-bank" /><b>Caixinha</b><small>sai do fundo dos técnicos</small></button>
              </div>
            </div>
            <div className="mdd-linha">
              <label className="mdd-campo"><span>Valor total</span><div className="mdd-rs"><i>R$</i><input inputMode="decimal" placeholder="0,00" value={valor} onChange={(ev) => setValor(ev.target.value)} /></div></label>
              {fonte === 'funcionario' && <label className="mdd-campo"><span>Primeira parcela</span><select value={inicio} onChange={(ev) => setInicio(ev.target.value)}>{[0, 1, 2, 3].map((k) => andarMes(mesHoje, k)).map((m) => <option key={m} value={m}>{nomeMes(m)}</option>)}</select></label>}
            </div>
            {fonte === 'funcionario' && <div className="mdd-campo"><span>Em quantas vezes</span>
              <div className="mdd-vezes">{Array.from({ length: 12 }, (_, k) => k + 1).map((n) => <button type="button" key={n} className={parcelas === n ? 'on' : ''} onClick={() => setParcelas(n)}>{n}x</button>)}</div>
            </div>}
          </div>
          <aside className="mdd-dir">
            <span className="mdd-rot">Previsão do desconto</span>
            {!ps.length ? <p className="mdd-vazio">Informe o valor para ver as parcelas.</p> : <>
              <b className="mdd-grande">{ps.length}x de {brl2(ps[0].valor)}</b>
              <span className="mdd-sub">{ps.length > 1 ? `de ${mesCurto(ps[0].mes)} a ${mesCurto(ps[ps.length - 1].mes)}` : `em ${nomeMes(ps[0].mes).toLowerCase()}`} · total {brl2(v)}</span>
              <ol className="mdd-parc">{ps.map((p) => <li key={p.n}><span>{p.n}ª</span><span>{nomeMes(p.mes)}</span><span>{brl2(p.valor)}</span></li>)}</ol>
              {fonte === 'caixinha' && <p className="mdd-nota cx">Pago pela caixinha: nada sai da comissão de {d.nome.split(' ')[0]}. Quando o diretor autorizar a comissão, {brl2(v)} saem do saldo da caixinha dos técnicos.</p>}
              {tipo === 'requisicao' && req && fonte === 'funcionario' && <p className="mdd-nota">A requisição #{req} fica marcada como cobrada de {d.nome.split(' ')[0]}, com as parcelas e quanto ainda falta.</p>}
            </>}
          </aside>
        </div>
        <footer className="mdd-pe">
          <button type="button" className="mdd-volta" onClick={fechar}>Cancelar</button>
          <button type="button" className="fo-lan-bt" disabled={!ok} onClick={incluir}>Incluir desconto<span className="seta"><i className="fas fa-check" /></span></button>
        </footer>
      </div>
    </div>
  )
  return typeof document === 'undefined' ? tela : createPortal(tela, document.body)
}

const ESTILO_MDD = `
.mdd-fundo { position: fixed; inset: 0; z-index: 100100; background: rgba(15,23,42,.45); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; animation: ftFade .2s both }
.mdd { width: min(980px, 100%); max-height: calc(100vh - 32px); display: grid; grid-template-rows: auto 1fr auto; background: #fefefe; border-radius: 18px; box-shadow: 0 30px 80px rgba(15,23,42,.35); overflow: hidden; color: #0f172a; font-family: inherit }
.mdd-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 20px 24px 16px; border-bottom: 1px solid #eef2f7 } .mdd-cab > div { display: grid; gap: 3px } .mdd-tit { font-size: 19px } .mdd-sub { font-size: 13.5px; color: #64748b }
.mdd-x { width: 34px; height: 34px; border-radius: 50%; border: 1px solid #e2e8f0; background: #fefefe; color: #64748b; cursor: pointer }
.mdd-corpo { display: grid; grid-template-columns: 1fr 300px; min-height: 0; overflow: auto }
.mdd-esq { display: grid; gap: 16px; padding: 18px 24px 22px; align-content: start }
.mdd-seg { display: inline-flex; justify-self: start; background: #f1f5f9; border-radius: 99px; padding: 4px } .mdd-seg button { border: none; background: none; border-radius: 99px; padding: 8px 18px; font-family: inherit; font-size: 14px; color: #475569; cursor: pointer } .mdd-seg button.on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 3px rgba(15,23,42,.14) }
.mdd-reqs { display: grid; gap: 8px } .mdd-busca { border: 1px solid #cbd5e1; border-radius: 99px; padding: 9px 14px; font-family: inherit; font-size: 14px; color: #0f172a }
.mdd-lista { display: grid; gap: 6px; max-height: 260px; overflow: auto; padding-right: 2px }
.mdd-req { display: grid; grid-template-columns: 64px 1fr auto; gap: 12px; align-items: center; text-align: left; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 12px; padding: 10px 12px; font-family: inherit; color: #0f172a; cursor: pointer; transition: border-color .15s, background .15s }
.mdd-req:hover { border-color: #94a3b8 } .mdd-req.on { border-color: #0f172a; background: #f8fafc; box-shadow: inset 0 0 0 1px #0f172a }
.mdd-req-n { font-size: 13.5px; color: #475569 } .mdd-req-t { display: grid; font-size: 14.5px } .mdd-req-t small, .mdd-req-v small { font-size: 12.5px; color: #64748b } .mdd-req-v { display: grid; justify-items: end; font-size: 14.5px; font-variant-numeric: tabular-nums }
.mdd-vazio { margin: 0; font-size: 13.5px; color: #64748b } .mdd-alerta { margin: 0; font-size: 13.5px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 8px 12px }
.mdd-campo { display: grid; gap: 6px } .mdd-campo > span { font-size: 13px; color: #475569 } .mdd-campo input, .mdd-campo select { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; font-family: inherit; font-size: 15px; color: #0f172a; background: #fefefe; min-width: 0 }
.mdd-quem { display: grid; grid-template-columns: 1fr 1fr; gap: 10px } .mdd-quem button { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; align-items: center; text-align: left; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 10px 12px; background: #fefefe; font-family: inherit; cursor: pointer; color: #0f172a } .mdd-quem button i { grid-row: span 2; font-size: 18px; color: #64748b } .mdd-quem button b { font-size: 14.5px } .mdd-quem button small { font-size: 12px; color: #64748b } .mdd-quem button.on { border-color: #0f172a; background: #f8fafc } .mdd-quem button.on i { color: #0f172a } .mdd-quem button.cx.on { border-color: #047857; background: #ecfdf5 } .mdd-quem button.cx.on i { color: #047857 } .mdd-nota.cx { background: #ecfdf5; color: #047857 }
.mdd-linha { display: grid; grid-template-columns: 1fr 1fr; gap: 12px }
.mdd-rs { display: flex; align-items: center; border: 1px solid #cbd5e1; border-radius: 10px; padding-left: 12px; background: #fefefe } .mdd-rs i { font-style: normal; color: #64748b; font-size: 14px } .mdd-rs input { border: none !important; flex: 1; font-variant-numeric: tabular-nums }
.mdd-vezes { display: grid; grid-template-columns: repeat(12, 1fr); gap: 6px } .mdd-vezes button { border: 1px solid #e2e8f0; background: #fefefe; border-radius: 10px; padding: 8px 0; font-family: inherit; font-size: 14px; color: #334155; cursor: pointer } .mdd-vezes button:hover { border-color: #94a3b8 } .mdd-vezes button.on { background: #0f172a; border-color: #0f172a; color: #fefefe }
.mdd-dir { background: #f8fafc; border-left: 1px solid #eef2f7; padding: 18px 20px; display: grid; gap: 6px; align-content: start }
.mdd-rot { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: .5px } .mdd-grande { font-size: 24px; font-weight: 500; font-variant-numeric: tabular-nums }
.mdd-parc { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 0; max-height: 320px; overflow: auto } .mdd-parc li { display: grid; grid-template-columns: 30px 1fr auto; gap: 8px; padding: 7px 0; border-top: 1px solid #e2e8f0; font-size: 14px } .mdd-parc li span:first-child { color: #94a3b8 } .mdd-parc li span:last-child { font-variant-numeric: tabular-nums }
.mdd-nota { margin: 10px 0 0; font-size: 13px; color: #1e40af; background: #eff6ff; border-radius: 10px; padding: 8px 10px }
.mdd-pe { display: flex; justify-content: flex-end; gap: 10px; align-items: center; padding: 14px 24px; border-top: 1px solid #eef2f7; background: #fefefe }
.mdd-volta { border: none; background: none; color: #475569; font-family: inherit; font-size: 14px; cursor: pointer; padding: 8px 12px }
@media (max-width: 820px) { .mdd-corpo { grid-template-columns: 1fr } .mdd-dir { border-left: none; border-top: 1px solid #eef2f7 } .mdd-vezes { grid-template-columns: repeat(6, 1fr) } .mdd-linha { grid-template-columns: 1fr } }
`

async function buscarPedidos(nome: string, mes: string): Promise<{ pedidos: PedidoComissao[]; sql?: string }> {
  try {
    const r = await fetch(`/api/mecanicos/lancamento-comissao?tecnico=${encodeURIComponent(nome)}&mes=${mes}`, { headers: await authHeaders(), cache: 'no-store' })
    const j = await r.json()
    if (j.semTabela) return { pedidos: [], sql: j.error }
    return { pedidos: Array.isArray(j.pedidos) ? j.pedidos : [] }
  } catch { return { pedidos: [] } }
}

/** Todas as comissões já autorizadas pelo diretor deste técnico, mês a mês, cada uma com o seu documento assinado
 *  (José, 28/10/2026: "gerar o pdf com as assinaturas lá nas fichas dos técnicos junto com as dos meses anteriores"). */
function DocumentosAssinados({ nome, mesAtual }: { nome: string; mesAtual: string }) {
  const [docs, setDocs] = useState<PedidoComissao[] | null>(null)
  useEffect(() => {
    let vivo = true
    const ler = async () => {
      try {
        const r = await fetch(`/api/mecanicos/lancamento-comissao?tecnico=${encodeURIComponent(nome)}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        const lista = (Array.isArray(j.pedidos) ? j.pedidos : []) as PedidoComissao[]
        // um por mês: o autorizado mais recente (os substituídos ficam no Histórico)
        const porMes = new Map<string, PedidoComissao>()
        for (const p of lista) if (['espelhada', 'erro_rh'].includes(p.status) && !porMes.has(p.mes)) porMes.set(p.mes, p)
        if (vivo) setDocs([...porMes.values()].sort((a, b) => b.mes.localeCompare(a.mes)))
      } catch { if (vivo) setDocs([]) }
    }
    void ler()
    window.addEventListener('comissao-decidida', ler)
    return () => { vivo = false; window.removeEventListener('comissao-decidida', ler) }
  }, [nome])
  if (!docs?.length) return null
  return (
    <section className="fo-docs">
      <small className="fl-rot">Comissões assinadas</small>
      {docs.map((p) => (
        <button key={p.id} type="button" className={p.mes === mesAtual ? 'on' : ''} onClick={() => { void abrirDocumento(p.id) }} title="Abrir o documento com as assinaturas (imprimir ou salvar em PDF)">
          <i className="fas fa-file-signature" />
          <span><b>{nomeMes(p.mes)}</b><small>autorizada por {p.decidido_por || 'diretor'}{p.decidido_em ? ` em ${new Date(p.decidido_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}{p.status === 'erro_rh' ? ' · RH não aceitou' : ''}</small></span>
          <em>{brl2(p.valor)}</em>
        </button>
      ))}
    </section>
  )
}

/** Comissão do mês: o valor, de onde vem e o caminho até o pagamento. Lançar = pedir autorização ao diretor;
 *  autorizado, o portal espelha no RH (José, 20/10/2026: "não quero mais lançar no RH, quero que lance por aqui"). */
export function LancarComissao({ d, e, vertical }: { d: Ficha; e: EdicaoComissao; vertical?: boolean }) {
  const [confirmar, setConfirmar] = useState(false)
  const [modalDesc, setModalDesc] = useState(false)
  const [pedidos, setPedidos] = useState<PedidoComissao[] | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok' | 'sql'; txt: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const t = e.tot
  const of = d.comissao.oficial
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    let vivo = true
    buscarPedidos(d.nome, d.mes).then((r) => { if (!vivo) return; if (r.sql) setAviso({ tipo: 'sql', txt: r.sql }); setPedidos(r.pedidos) })
    return () => { vivo = false }
  }, [d.nome, d.mes, versao])
  useEffect(() => { const f = () => setVersao((v) => v + 1); window.addEventListener('comissao-decidida', f); return () => window.removeEventListener('comissao-decidida', f) }, [])
  const atual = (pedidos || []).filter((p) => p.status !== 'cancelada' && p.status !== 'substituida').sort((a, b) => b.pedido_em.localeCompare(a.pedido_em))[0] || null
  const rhSt = of?.status || null
  const pago = rhSt === 'paga', noOmie = pago || rhSt === 'lancada_omie'
  const noRH = noOmie || atual?.status === 'espelhada' || rhSt === 'aprovada'
  const feitos = [!!atual || noRH, noRH || atual?.status === 'erro_rh', noRH, noOmie, pago]
  const passos = [
    { rot: 'Pedir autorização', txt: 'valor do mês e o motivo de cada OS mexida' },
    { rot: 'Diretor autoriza', txt: atual?.status === 'devolvida' ? 'devolvida para ajuste' : atual?.status === 'recusada' ? `recusada por ${atual.decidido_por || 'diretor'}` : 'ele assina e recebe o aviso no sino' },
    { rot: 'Espelhado no RH', txt: atual?.status === 'erro_rh' ? 'o RH recusou — veja abaixo' : 'o portal grava no RH sozinho' },
    { rot: 'Contas a pagar', txt: 'o RH lança no Omie' },
    { rot: 'Pago', txt: `por volta de ${dataBR(d.comissao.pagamento)}` },
  ]
  const agoraIdx = feitos.findIndex((f) => !f)
  const partes = [
    { k: 'cliente', rot: 'Faturadas para clientes', v: t.cliente, n: t.nCliente, cor: '#2563eb' },
    { k: 'garantia', rot: 'Garantia', v: t.garantia, n: t.nGarantia, cor: '#db2777' },
    { k: 'interna', rot: 'Internas', v: t.interna, n: t.nInterna, cor: '#94a3b8' },
  ].filter((x) => x.n > 0)
  const soma = partes.reduce((a, x) => a + x.v, 0) || 1
  const dif = t.total - t.calc
  const mexidas = e.linhas.filter((l) => e.ed[chaveL(l)])
  const linhasPedido = e.linhas.map((l) => { const x = e.de(l); return { os: l.os, numero: l.numeroOmie || l.os, cliente: l.cliente || '', data: l.data || null, grupo: grupoDa(l), regra: l.regra, calculado: l.valor, valor: e.final(l), acao: x.acao, motivo: x.motivo, divisao: x.divisao || null, horasDiv: x.horasDiv || null, descontoCliente: d.os.faturadas.find((o) => o.os === l.os)?.descontos || null } })
  const assRef = useRef<CanvasAssinaturaRef>(null)
  const [assinou, setAssinou] = useState(false)
  const salvaLida = useMinhaAssinatura()
  const [salvaNova, setSalvaNova] = useState<string | null>(null)
  const salva = salvaNova || salvaLida
  const [desenhar, setDesenhar] = useState(false)
  const usaSalva = !!salva && !desenhar
  const aguardando = atual?.status === 'aguardando'
  const podePedir = !noOmie && e.pendentes === 0 && t.total >= 0 && aviso?.tipo !== 'sql'
  const pedir = async () => {
    setEnviando(true); setAviso(null)
    try {
      const r = await fetch('/api/mecanicos/lancamento-comissao', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ tecnico: d.nome, mes: d.mes, valor: Math.round(t.total * 100) / 100, calculado: Math.round(t.calc * 100) / 100, linhas: linhasPedido, descontos: e.descontos, assinatura: usaSalva ? 'salva' : assRef.current?.png(), info: { nomeRh: d.rh?.nomeRh || null, cargo: d.rh?.cargo || null, pct: d.comissao.pct ?? null, pagamento: d.comissao.pagamento || null, semCaixinha: !!d.escritorio } }) })
      const j = await r.json()
      if (j.semTabela) setAviso({ tipo: 'sql', txt: j.error })
      else if (!r.ok) setAviso({ tipo: 'erro', txt: j.error || 'Não foi possível pedir a autorização' })
      else { setConfirmar(false); setAviso({ tipo: 'ok', txt: j.semDiretor ? 'Pedido gravado, mas ninguém está marcado como Diretor na Administração — marque para ele receber o aviso.' : 'Pedido enviado. O diretor recebeu o aviso no sino.' }); window.dispatchEvent(new Event('comissao-decidida')) }
    } catch { setAviso({ tipo: 'erro', txt: 'Sem conexão — tente de novo' }) }
    setEnviando(false)
  }
  const quando = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div className={`fl ${vertical ? 'vert' : ''}`}>
      <section className="fl-valor">
        <small className="fl-rot">Comissão de {nomeMes(d.mes).toLowerCase()}</small>
        <b className="fl-total"><Num v={t.total} f={brl2} /></b>
        <span className="fl-regra">{Math.abs(dif) > 0.01 ? <>pela regra seria {brl2(t.calc)} · <em className={dif > 0 ? 'mais' : 'menos'}>{dif > 0 ? '+' : '−'}{brl2(Math.abs(dif))}</em></> : 'igual ao calculado pela regra'}</span>
        <div className="fl-chips">
          <span className="ok">{t.pagas} pagas</span>{t.nao > 0 && <span className="nao">{t.nao} não pagas</span>}{t.ajustadas > 0 && <span className="aj">{t.ajustadas} ajustadas</span>}{t.divididas > 0 && <span className="div">{t.divididas} divididas</span>}
        </div>
        {!confirmar && !noOmie && pedidos && <button type="button" className="fo-lan-bt" disabled={!podePedir} onClick={() => setConfirmar(true)}>{aguardando ? 'Pedir de novo com estes valores' : atual ? 'Pedir nova autorização' : 'Pedir autorização ao diretor'}<span className="seta"><i className="fas fa-arrow-right" /></span></button>}
        {!confirmar && !noOmie && <button type="button" className="fo-lan-add" onClick={() => setModalDesc(true)}><i className="fas fa-plus" />Acrescentar desconto{e.descontos.length ? ` (${e.descontos.length})` : ''}</button>}
        {!confirmar && !noOmie && pedidos && !podePedir && <small className="fo-lan-pq">{aviso?.tipo === 'sql' ? 'falta rodar o SQL do diretor no Supabase' : e.pendentes > 0 ? `falta o motivo em ${e.pendentes} OS` : 'sem valor para pedir'}</small>}
      </section>
      <section className="fl-comp">
        <small className="fl-rot">De onde vem</small>
        <div className="fl-barra">{partes.map((x) => <i key={x.k} style={{ width: `${(x.v / soma) * 100}%`, background: x.cor }} title={`${x.rot}: ${brl2(x.v)}`} />)}</div>
        <div className="fl-tab">
          {partes.map((x) => (
            <div key={x.k} className="fl-lin"><span className="fl-dot" style={{ background: x.cor }} /><span className="fl-nome">{x.rot}</span><span className="fl-n">{x.n} OS</span><span className="fl-v">{brl2(x.v)}</span><span className="fl-p">{Math.round((x.v / soma) * 100)}%</span></div>
          ))}
        </div>
      </section>
      <section className="fl-acao">
        <small className="fl-rot">Até o pagamento</small>
        <ol className="fl-passos">
          {passos.map((p, i) => {
            const feitoP = feitos[i], agora = i === agoraIdx
            const ruim = (i === 1 && (atual?.status === 'recusada' || atual?.status === 'devolvida')) || (i === 2 && atual?.status === 'erro_rh')
            return <li key={p.rot} className={ruim ? 'ruim' : feitoP ? 'feito' : agora ? 'agora' : ''}><span>{ruim ? '!' : feitoP ? <i className="fas fa-check" /> : i + 1}</span><div><b>{p.rot}</b><small>{p.txt}</small></div></li>
          })}
        </ol>
      </section>
      <DescontosComissao e={e} travado={noOmie} />
      <DescontosNoRH d={d} />
      {modalDesc && <ModalDesconto d={d} e={e} fechar={() => setModalDesc(false)} />}
      {atual && (
        <p className={`fo-lan-st ${atual.status}`}>
          {atual.status === 'aguardando' && <>Aguardando o diretor · pedido de <b>{brl2(atual.valor)}</b> por {atual.pedido_por || '—'} em {quando(atual.pedido_em)}{Math.abs(atual.valor - t.total) > 0.01 && <> — <em>o valor na tela mudou para {brl2(t.total)}; peça de novo para valer o novo</em></>}</>}
          {atual.status === 'devolvida' && <>Devolvida para ajuste por {atual.decidido_por || 'diretor'} em {quando(atual.decidido_em)}{atual.observacao ? <>: “{atual.observacao}”</> : '.'} Ajuste e peça de novo — nada foi mudado.
            {!!atual.apontamentos?.length && <span className="fo-lan-apt">{atual.apontamentos.map((a) => <span key={a.os}><b>OS {a.numero}</b> {a.pedido === 'nao_pagar' ? 'não pagar' : a.pedido === 'alterar' ? `pagar ${brl2(Number(a.valor) || 0)}` : 'conferir'}{a.texto ? ` — ${a.texto}` : ''}</span>)}</span>}</>}
          {atual.status === 'recusada' && <>Recusada por {atual.decidido_por || 'diretor'} em {quando(atual.decidido_em)}{atual.observacao ? <>: “{atual.observacao}”</> : ''}. Ajuste e peça de novo.</>}
          {atual.status === 'espelhada' && <>Autorizada por {atual.decidido_por || 'diretor'} em {quando(atual.decidido_em)} · <b>{brl2(atual.valor)}</b> gravado no RH{atual.observacao ? <> · “{atual.observacao}”</> : ''}</>}
          {atual.status === 'erro_rh' && <>Autorizada por {atual.decidido_por || 'diretor'}, mas o RH não aceitou: {atual.rh_erro || 'erro desconhecido'}</>}
        </p>
      )}
      {atual && <button type="button" className="fo-lan-doc" onClick={() => { void abrirDocumento(atual.id) }}>{['espelhada', 'erro_rh'].includes(atual.status) ? 'Documento assinado (PDF)' : 'Ver documento do pedido'}</button>}
      <DocumentosAssinados nome={d.nome} mesAtual={d.mes} />
      {of && !atual && <p className="fo-lan-of">Já existe comissão no RH para {nomeMes(d.mes).toLowerCase()}: <b>{brl2(of.valor)}</b> ({of.status.replace('_', ' ')}).{!noOmie && ' Um pedido autorizado atualiza esse valor.'}</p>}
      {noOmie && <p className="fo-lan-of">A comissão de {nomeMes(d.mes).toLowerCase()} já está {pago ? 'paga' : 'lançada no Omie'} — mudanças agora só pelo RH.</p>}
      {e.pendentes > 0 && <p className="fo-lan-falta">Falta o motivo em {e.pendentes} OS — o diretor e o RH precisam saber por quê.</p>}
      {aviso && <p className={`fo-lan-aviso ${aviso.tipo}`}>{aviso.tipo === 'sql' ? <>Para lançar por aqui falta rodar o SQL <b>sql/diretor-comissoes.sql</b> no Supabase.</> : aviso.txt}</p>}
      {confirmar && createPortal(
        <div className="flc-fundo">
        <div className="flc" role="dialog" aria-modal="true" aria-label="Pedir autorização ao diretor">
          <header className="flc-cab">
            <div><span className="flc-tit">Pedir autorização ao diretor</span><span className="flc-sub">Confira, assine e envie. O diretor recebe o aviso no sino.</span></div>
            <button type="button" className="flc-x" onClick={() => setConfirmar(false)} aria-label="Fechar"><i className="fas fa-xmark" /></button>
          </header>
          <dl className="flc-res">
            <div><dt>Técnico</dt><dd>{(d.rh?.nomeRh || d.nome).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}</dd></div>
            <div><dt>Competência</dt><dd>{nomeMes(d.mes)}</dd></div>
            <div><dt>Pela regra</dt><dd>{brl2(t.calc)}</dd></div>
            <div className="tot"><dt>Comissão a pagar</dt><dd>{brl2(t.total)}</dd></div>
            {!d.escritorio && <div><dt>Caixinha {PCT_CAIXINHA}%</dt><dd>− {brl2(contaDoPagamento(t.total, e.descontos).caixinha)}</dd></div>}
            <div><dt>{d.escritorio ? 'Líquido (após descontos)' : 'Líquido (após descontos e caixinha)'}</dt><dd>{brl2(contaDoPagamento(t.total, e.descontos, !!d.escritorio).liquido)}</dd></div>
          </dl>
          {e.linhas.length > 0 && (
            <div className="flc-mex">
              <span className="flc-rot">Ordens desta comissão ({e.linhas.length}){mexidas.length > 0 ? ` · ${mexidas.length} com decisão` : ''}</span>
              <div className="flc-os flc-os-th"><span>OS</span><span>Cliente</span><span>Decisão</span><span className="v">A pagar</span></div>
              {e.linhas.map((l) => { const x = e.de(l), mexeu = !!e.ed[chaveL(l)]; return (
                <div key={chaveL(l)} className={`flc-os ${x.acao === 'nao' ? 'nao' : ''}`}>
                  <span className="n">{l.numeroOmie || l.os}</span>
                  <span className="c">{l.cliente || '—'}</span>
                  <span className={mexeu ? 'o' : 'r'}>{!mexeu ? 'pela regra' : `${x.acao === 'nao' ? 'não paga' : x.divisao ? `dividida — ${Object.entries(x.divisao).map(([k, v]) => `${k.split(' ')[0]} ${brl2(v)}`).join(', ')}` : 'ajustada'}${x.motivo ? ` · ${x.motivo}` : ''}`}</span>
                  <span className="v">{mexeu && <s>{brl2(l.valor)}</s>}{brl2(e.final(l))}</span>
                </div>
              ) })}
              <div className="flc-os flc-os-tot"><span>Total</span><span /><span /><span className="v">{brl2(t.total)}</span></div>
            </div>
          )}
          {e.descontos.length > 0 && (
            <div className="flc-mex">
              <span className="flc-rot">Descontos do técnico ({e.descontos.length}) · saem da comissão, depois que o RH aprovar</span>
              {e.descontos.map((x, i) => <div key={i} className="flc-ml"><span className="n">{x.tipo === 'requisicao' ? `Req. #${x.ref}` : 'Outro'}</span><span className="m" style={{ gridColumn: 'span 2' }}>{x.descricao}{x.fonte === 'caixinha' ? ' · pago pela caixinha' : (x.parcelas || 1) > 1 ? ` · em ${x.parcelas}x a partir de ${nomeMes(x.inicio || hojeSP().slice(0, 7)).toLowerCase()}` : ''}</span><span className="v">{x.fonte === 'caixinha' ? '' : '− '}{brl2(x.valor)}</span></div>)}
            </div>
          )}
          <div className="flc-ass">
            <div className="flc-ass-cab"><span className="flc-rot">Sua assinatura</span>{assinou && <button type="button" onClick={() => assRef.current?.limpar()}>limpar</button>}</div>
            {salva === null && <CadastrarAssinatura png={() => assRef.current?.png()} assinou={assinou} onSalva={setSalvaNova} />}
            {usaSalva ? <AssinaturaSalva imagem={salva!} onDesenhar={() => setDesenhar(true)} />
              : <div className="flc-ass-pad"><CanvasAssinatura ref={assRef} temTraco={assinou} onTraco={setAssinou} altura={150} />{!assinou && <span className="flc-ass-dica">assine aqui com o mouse ou o dedo</span>}</div>}
          </div>
          {aviso && aviso.tipo !== 'ok' && <p className={`fo-lan-aviso ${aviso.tipo} flc-aviso`}>{aviso.tipo === 'sql' ? <>Para lançar por aqui falta rodar o SQL <b>sql/diretor-comissoes.sql</b> no Supabase.</> : aviso.txt}</p>}
          <footer className="flc-pe">
            <span>Autorizado, o portal lança no RH e gera o documento com as duas assinaturas.</span>
            <button type="button" className="flc-volta" onClick={() => setConfirmar(false)}>Cancelar</button>
            <button type="button" className="fo-lan-bt" disabled={enviando || !(assinou || usaSalva)} onClick={() => { void pedir() }}>{enviando ? 'Enviando…' : 'Assinar e enviar'}<span className="seta"><i className="fas fa-arrow-right" /></span></button>
          </footer>
        </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ============================================================================ RH primeiro
function Foto({ d, foto, tam = 84 }: { d: Ficha; foto?: string; tam?: number }) {
  const url = d.foto || foto
  // eslint-disable-next-line @next/next/no-img-element
  return <div className="fo-foto" style={{ width: tam, height: tam }}>{url ? <img src={url} alt={d.nome} /> : <span style={{ fontSize: tam * 0.33 }}>{iniciais(d.nome)}</span>}</div>
}
function Liga({ d, grande }: { d: Ficha; grande?: boolean }) {
  const p = d.pontos
  if (p.nivel == null) return null
  const pt = patente(p.nivel)
  const cor = p.saldo >= 90 ? '#059669' : p.saldo >= 70 ? '#d97706' : '#dc2626'
  return (
    <div className={`fo-liga ${grande ? 'g' : ''}`} style={{ '--lc': pt.cor } as React.CSSProperties}>
      <IconeLiga nivel={p.nivel} tamanho={grande ? 58 : 40} />
      <div><small>Liga</small><b>{pt.nome}</b><em><span style={{ color: cor }}>{p.saldo}</span> de {p.base} pontos no mês{p.seFecharAssim != null && p.seFecharAssim !== p.nivel ? ` · se fechar assim vai para ${patente(p.seFecharAssim).nome}` : p.descontados === 0 ? ' · mês limpo até agora' : ''}</em></div>
    </div>
  )
}
/** Dados do RH em lista (cadastro + férias + ponto + caixinha). */
function DadosRH({ d, colunas = 3 }: { d: Ficha; colunas?: number }) {
  const r = d.rh
  if (!r) return <div className="ft-vazio pequeno">Não achei este técnico no RH.</div>
  const ferias = r.ferias.filter((f) => /disponivel|vencid/.test(f.status) && f.saldo > 0)
  const vencida = ferias.some((f) => /vencid/.test(f.status))
  const faltas = r.ponto.filter((p) => /falta/i.test(p.tipo)).length, atrasos = r.ponto.filter((p) => /atras/i.test(p.tipo)).length
  const itens: [string, React.ReactNode, string?][] = [
    ['Nome no RH', r.nomeRh], ['Cargo', r.cargo], ['Admissão', r.admissao ? `${dataBR(r.admissao)} · ${tempoDeCasa(r.admissao)}` : null], ['Contrato', r.tipoContrato?.toUpperCase()], ['Salário', r.salario ? brl2(r.salario) : null], ['Comissão', `${d.comissao.pct}% sobre as horas${r.comissaoPctRH != null ? ` (RH: ${r.comissaoPctRH}%)` : ''}`],
    ['Telefone', r.telefone], ['Aniversário', r.aniversario ? `${r.aniversario.slice(3, 5)}/${r.aniversario.slice(0, 2)}` : null], ['Cidade', r.cidade],
    ['Férias', ferias.length ? `${ferias.reduce((s, f) => s + f.saldo, 0)} dias para tirar${vencida ? ' · uma vencida' : ''}` : 'em dia', vencida ? 'verm' : undefined],
    ['Ponto (12 meses)', `${faltas} falta${faltas === 1 ? '' : 's'} · ${atrasos} atraso${atrasos === 1 ? '' : 's'}`, faltas ? 'verm' : undefined],
    ['Caixinha', brl2(r.caixinha.saldo), r.caixinha.saldo < 0 ? 'verm' : undefined],
    ['Última comissão', r.comissoes[0] ? `${brl2(r.comissoes[0].valor)} · ${nomeMes(r.comissoes[0].mes).replace(/ de \d+$/, '')} (${r.comissoes[0].status.replace('_', ' ')})` : '—'],
  ]
  return <div className="fo-rh" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>{itens.filter(([, v]) => v).map(([k, v, c]) => <div key={k}><small>{k}</small><b className={c}>{v}</b></div>)}</div>
}

function Abas({ abas, aba, setAba }: { abas: { k: string; rot: string; ic: string }[]; aba: string; setAba: (a: string) => void }) {
  return <nav className="ft-abas fo-abas">{abas.map((a) => <button key={a.k} type="button" className={aba === a.k ? 'on' : ''} onClick={() => setAba(a.k)}><i className={`fas ${a.ic}`} /> {a.rot}</button>)}</nav>
}
const ABAS_RESTO = [{ k: 'os', rot: 'OS', ic: 'fa-screwdriver-wrench' }, { k: 'req', rot: 'Requisições', ic: 'fa-receipt' }, { k: 'frota', rot: 'Frota', ic: 'fa-car-side' }, { k: 'oc', rot: 'Ocorrências', ic: 'fa-shield-halved' }]
export function Conteudo({ d, aba, v, e, setAba }: { d: Ficha; aba: string; v: ReturnType<typeof useVisores>; e: EdicaoComissao; setAba?: (a: Aba) => void }) {
  return (
    <div key={aba} className="ft-aba">
      {aba === 'resumo' && <Resumo d={d} ir={(a) => setAba?.(a)} />}
      {aba === 'rh' && <RH d={d} />}
      {aba === 'comissao' && <><LancarComissao d={d} e={e} /><EditorComissao d={d} e={e} verOS={v.verOS} /></>}
      {aba === 'calculo' && <Comissao d={d} verOS={v.verOS} />}
      {aba === 'os' && <OSAba d={d} verOS={v.verOS} verReq={v.verReq} />}
      {aba === 'req' && <Requisicoes d={d} verReq={v.verReq} verOS={v.verOS} />}
      {aba === 'frota' && <Frota d={d} verReq={v.verReq} />}
      {aba === 'oc' && <Ocorrencias d={d} />}
    </div>
  )
}

// ============================================================================ as 5 opções
/** M1 — Crachá do RH no topo + abas (Comissão com decisões e lançamento é a 1ª). */
export function M1({ d, foto, card, mesNav, onFechar, modal }: {
  d: Ficha; foto?: string; card?: CardDados | null
  mesNav?: { mes: string; setMes: (m: string) => void }; onFechar?: () => void; modal?: boolean
}) {
  const v = useVisores(d), e = useEdicao(d)
  const [aba, setAba] = useState('comissao')
  return (
    <div className={`fo-jan ${modal ? 'fo-modal' : ''}`}>
      <header className="fo-m1-cab">
        <Foto d={d} foto={foto} tam={96} />
        <div className="fo-m1-id"><h2>{d.nome}</h2>
          <p>{[d.rh?.cargo, d.rh?.admissao && `há ${tempoDeCasa(d.rh.admissao)} na empresa`].filter(Boolean).join(' · ')}
            {mesNav && <span className="ft-mes fo-m1-mes">
              <button type="button" onClick={() => mesNav.setMes(andarMes(mesNav.mes, -1))} aria-label="Mês anterior"><i className="fas fa-chevron-left" /></button>
              <b>{nomeMes(mesNav.mes)}</b>
              <button type="button" disabled={mesNav.mes >= d.hoje.slice(0, 7)} onClick={() => mesNav.setMes(andarMes(mesNav.mes, 1))} aria-label="Próximo mês"><i className="fas fa-chevron-right" /></button>
            </span>}
          </p>
          <DadosRH d={d} colunas={4} />
        </div>
        <Liga d={d} grande />
        {onFechar && <button type="button" className="ft-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button>}
      </header>
      <Metas d={d} card={card} />
      <Abas abas={[{ k: 'comissao', rot: 'Comissão', ic: 'fa-sack-dollar' }, { k: 'rh', rot: 'RH completo', ic: 'fa-id-card' }, ...ABAS_RESTO]} aba={aba} setAba={setAba} />
      <div className="fo-corpo"><Conteudo d={d} aba={aba} v={v} e={e} /></div>
      {v.camadas}
    </div>
  )
}

/** Metas do técnico (José, 20/10/2026): básica e esperada = 20 h e R$ 4 mil por semana; ideal = 40 h e R$ 8 mil por semana (no mês, × semanas).
 *  Mês atual vindo do card: os mesmos números do card (horas cobradas + esperando faturar). */
export function Metas({ d, card }: { d: Ficha; card?: CardDados | null }) {
  const [a, m] = d.mes.split('-').map(Number)
  const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const atual = d.hoje.startsWith(d.mes)
  const fracao = atual ? Math.min(1, Number(d.hoje.slice(8, 10)) / diasMes) : 1
  const usaCard = !!card && atual
  const fat = usaCard ? card!.faturado : d.os.faturadas.reduce((s, o) => s + o.parte, 0)
  const hrs = usaCard ? card!.horas : d.os.faturadas.reduce((s, o) => s + o.horas / Math.max(1, o.tecnicos.length), 0)
  const semanas = diasMes / 7
  const META_V = METAS_PADRAO.valorSemana * semanas, IDEAL_V = METAS_PADRAO.valorIdealSemana * semanas, META_H = METAS_PADRAO.horasSemana * semanas, IDEAL_H = METAS_PADRAO.horasIdeal * semanas
  const linha = (rot: string, ic: string, v: number, meta: number, f: (n: number) => string, ideal?: number) => {
    const topo = Math.max(ideal || meta * 1.25, v * 1.05, 1)
    const bateu = v >= meta, bateuIdeal = ideal != null && v >= ideal
    const ritmo = meta * fracao
    return (
      <div className={`fo-meta ${bateu ? 'ok' : ''} ${bateuIdeal ? 'ideal' : ''}`}>
        <div className="fo-meta-cab">
          <span className="fo-meta-ic"><i className={`fas ${ic}`} /></span>
          <div><small>{rot}</small><b><Num v={v} f={f} /></b></div>
          <div className="fo-meta-pct"><b>{Math.round((v / Math.max(1, meta)) * 100)}%</b><small>da meta básica</small></div>
          {bateuIdeal ? <span className="fo-meta-selo ideal"><i className="fas fa-crown" /> Bateu a ideal</span> : bateu ? <span className="fo-meta-selo"><i className="fas fa-medal" /> Bateu a meta</span>
            : atual ? <span className={`fo-meta-ritmo ${v >= ritmo ? 'bom' : ''}`}>{v >= ritmo ? 'à frente do ritmo' : `faltam ${f(meta - v)}`}</span> : <span className="fo-meta-ritmo">ficou em {f(v)}</span>}
        </div>
        <div className="fo-meta-pop" role="tooltip">
          <b>{rot}</b>
          {[['Meta básica', meta, 'bas'], ...(ideal != null ? [['Meta ideal', ideal, 'ide']] : [])].map(([nome, alvo, k]) => {
            const a = alvo as number, falta = Math.max(0, a - v)
            return (
              <div key={k as string} className={`fo-mp-lin ${k}`}>
                <span className="fo-mp-nome">{nome as string}</span><span className="fo-mp-alvo">{f(a)}</span>
                <span className="fo-mp-pct">{Math.round((v / Math.max(1, a)) * 100)}%</span>
                <span className={`fo-mp-falta ${falta <= 0 ? 'ok' : ''}`}>{falta <= 0 ? 'batida' : `faltam ${f(falta)}`}</span>
              </div>
            )
          })}
          {atual && <div className="fo-mp-ritmo">Hoje deveria estar em <b>{f(ritmo)}</b> para a básica · está {v >= ritmo ? 'à frente' : 'atrás'} {f(Math.abs(v - ritmo))}</div>}
          <small>{rot.startsWith('Faturado') ? 'R$ 4 mil (básica) e R$ 8 mil (ideal) por semana' : '20 h (básica) e 40 h (ideal) por semana'} × {(diasMes / 7).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} semanas do mês</small>
        </div>
        <div className="fo-meta-bar">
          <i style={{ width: `${Math.min(100, (v / topo) * 100)}%` }} />
          {atual && <span className="hoje" style={{ left: `${(ritmo / topo) * 100}%` }} title="onde deveria estar hoje" />}
          <span className="basica" style={{ left: `${(meta / topo) * 100}%` }}><em>básica {f(meta)}</em></span>
          {ideal != null && <span className="ideal" style={{ left: `${Math.min(99.5, (ideal / topo) * 100)}%` }}><em>ideal {f(ideal)}</em></span>}
        </div>
      </div>
    )
  }
  return (
    <div className="fo-metas">
      {linha(`Faturado em ${nomeMes(d.mes).toLowerCase()}`, 'fa-sack-dollar', fat, META_V, brl, IDEAL_V)}
      {linha('Horas no mês', 'fa-clock', hrs, META_H, horas, IDEAL_H)}
      {usaCard && (
        <div className={`fo-meta-sem ${card!.horasSemana >= card!.metaSemana ? 'ok' : ''}`}>
          <small>Esta semana</small><b>{horas(card!.horasSemana)}</b><em>básica {card!.metaSemana} h · ideal {card!.idealSemana} h</em>
          {card!.horasSemana >= card!.idealSemana ? <span className="fo-meta-selo ideal"><i className="fas fa-crown" /> 40 h</span> : card!.horasSemana >= card!.metaSemana ? <span className="fo-meta-selo"><i className="fas fa-medal" /> 20 h</span> : null}
        </div>
      )}
      <p className="fo-metas-leg">Por semana — meta básica e esperada: <b>20 h e R$ 4 mil</b>; meta ideal: <b>40 h e R$ 8 mil</b>. No mês: × {(diasMes / 7).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} semanas.</p>
    </div>
  )
}

/** A ficha de verdade (M1 escolhida em 20/10/2026), em janela por cima da tela. */
export function FichaModal({ nome, foto, card, onFechar }: { nome: string; foto?: string; card?: CardDados | null; onFechar: () => void }) {
  const [mes, setMes] = useState(() => hojeSP().slice(0, 7))
  const { dados, erro } = useFicha(nome, mes)
  useEffect(() => {
    const t = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !document.querySelector('.ft-doc, .ft-req-fundo')) onFechar() }
    window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t)
  }, [onFechar])
  const tela = (
    <div className="ft-fundo" onClick={onFechar}>
      <style>{ESTILO_FT}</style><style>{ESTILO_FO}</style>
      <div className="fo-modal-caixa" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label={`Ficha de ${nome}`}>
        {dados ? <M1 key={mes} d={dados} foto={foto} card={card} mesNav={{ mes, setMes }} onFechar={onFechar} modal />
          : <div className="fo-jan fo-modal"><div className="ft-vazio">{erro ? <><i className="fas fa-triangle-exclamation" /> {erro}</> : <><i className="fas fa-circle-notch fa-spin" /> abrindo a ficha de {nome}…</>}</div>
            <button type="button" className="ft-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>}
      </div>
    </div>
  )
  return typeof document === 'undefined' ? tela : createPortal(tela, document.body)
}

/** M2 — Perfil do RH fixo na lateral (com a liga); à direita as abas. */
export function M2({ d, foto }: { d: Ficha; foto?: string }) {
  const v = useVisores(d), e = useEdicao(d)
  const [aba, setAba] = useState('comissao')
  return (
    <div className="fo-jan fo-m2">
      <aside className="fo-m2-lado">
        <Foto d={d} foto={foto} tam={110} />
        <h2>{d.nome}</h2>
        <p>{d.rh?.cargo}{d.rh?.admissao ? ` · ${tempoDeCasa(d.rh.admissao)} de casa` : ''}</p>
        <Liga d={d} />
        <DadosRH d={d} colunas={1} />
      </aside>
      <div className="fo-m2-dir">
        <Abas abas={[{ k: 'comissao', rot: 'Comissão', ic: 'fa-sack-dollar' }, ...ABAS_RESTO, { k: 'rh', rot: 'RH', ic: 'fa-id-card' }]} aba={aba} setAba={setAba} />
        <div className="fo-corpo"><Conteudo d={d} aba={aba} v={v} e={e} /></div>
      </div>
      {v.camadas}
    </div>
  )
}

/** M3 — Uma página só, rolando: RH → liga → comissão (decidir + lançar) → OS → requisições → frota → ocorrências, com índice que gruda. */
export function M3({ d, foto }: { d: Ficha; foto?: string }) {
  const v = useVisores(d), e = useEdicao(d)
  const secoes = [['rh', 'RH', 'fa-id-card'], ['com', 'Comissão', 'fa-sack-dollar'], ['os', 'OS', 'fa-screwdriver-wrench'], ['req', 'Requisições', 'fa-receipt'], ['frota', 'Frota', 'fa-car-side'], ['oc', 'Ocorrências', 'fa-shield-halved']]
  const id = (k: string) => `m3-${d.nome.replace(/\W/g, '')}-${k}`
  return (
    <div className="fo-jan fo-m3">
      <nav className="fo-m3-ind">{secoes.map(([k, r, ic]) => <button key={k} type="button" onClick={() => document.getElementById(id(k))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><i className={`fas ${ic}`} /> {r}</button>)}</nav>
      <div className="fo-corpo">
        <section id={id('rh')} className="fo-m3-rh"><Foto d={d} foto={foto} tam={90} /><div><h2>{d.nome}</h2><DadosRH d={d} colunas={4} /></div><Liga d={d} grande /></section>
        <section id={id('com')}><h3><i className="fas fa-sack-dollar" /> Comissão de {nomeMes(d.mes)}</h3><div className="fo-m3-com"><EditorComissao d={d} e={e} verOS={v.verOS} compacta /><LancarComissao d={d} e={e} vertical /></div></section>
        <section id={id('os')}><h3><i className="fas fa-screwdriver-wrench" /> Ordens de serviço</h3><OSAba d={d} verOS={v.verOS} verReq={v.verReq} /></section>
        <section id={id('req')}><h3><i className="fas fa-receipt" /> Requisições</h3><Requisicoes d={d} verReq={v.verReq} verOS={v.verOS} /></section>
        <section id={id('frota')}><h3><i className="fas fa-car-side" /> Frota</h3><Frota d={d} verReq={v.verReq} /></section>
        <section id={id('oc')}><h3><i className="fas fa-shield-halved" /> Ocorrências</h3><Ocorrencias d={d} /></section>
      </div>
      {v.camadas}
    </div>
  )
}

/** M4 — Fechar o mês em 4 passos: 1 quem é (RH + liga) · 2 decidir cada OS · 3 conferir · 4 lançar. */
export function M4({ d, foto }: { d: Ficha; foto?: string }) {
  const v = useVisores(d), e = useEdicao(d)
  const [passo, setPasso] = useState(0)
  const [extra, setExtra] = useState<string | null>(null)
  const P = ['Quem é', 'Decidir cada OS', 'Conferir', 'Lançar no RH']
  const mexidas = e.linhas.filter((l) => e.ed[`${l.os}|${l.tipo}`])
  return (
    <div className="fo-jan fo-m4">
      <div className="fo-m4-trilho">
        {P.map((p, i) => <button key={p} type="button" className={i === passo ? 'on' : i < passo ? 'feito' : ''} onClick={() => setPasso(i)}><span>{i < passo ? <i className="fas fa-check" /> : i + 1}</span>{p}</button>)}
        <i className="fo-m4-barra" style={{ width: `${(passo / (P.length - 1)) * 100}%` }} />
      </div>
      <div className="fo-corpo">
        <div key={passo} className="ft-aba">
          {passo === 0 && <>
            <div className="fo-m4-quem"><Foto d={d} foto={foto} tam={110} /><div><h2>{d.nome}</h2><p>{d.rh?.cargo} · {nomeMes(d.mes)}</p><Liga d={d} grande /></div></div>
            <DadosRH d={d} colunas={4} />
            <div className="fo-m4-mais">{ABAS_RESTO.map((a) => <button key={a.k} type="button" className={extra === a.k ? 'on' : ''} onClick={() => setExtra((x) => (x === a.k ? null : a.k))}><i className={`fas ${a.ic}`} /> {a.rot}</button>)}</div>
            {extra && <Conteudo d={d} aba={extra} v={v} e={e} />}
          </>}
          {passo === 1 && <EditorComissao d={d} e={e} verOS={v.verOS} />}
          {passo === 2 && (
            <div className="fo-m4-conf">
              <div className="fo-m4-num"><small>Pela regra</small><b>{brl2(e.tot.calc)}</b></div><i className="fas fa-arrow-right" />
              <div className="fo-m4-num"><small>Com as decisões</small><b className="verde">{brl2(e.tot.total)}</b></div>
              <div className="fo-m4-mex">{mexidas.length ? mexidas.map((l) => <div key={l.os}><b>OS {l.numeroOmie || l.os}</b> {e.de(l).acao === 'nao' ? 'não paga' : e.de(l).divisao ? 'dividida' : 'ajustada'} → {brl2(e.final(l))} <small>{e.de(l).motivo || <em className="verm">falta o motivo</em>}</small></div>) : <p className="mudo">Nenhuma OS mexida: vai tudo como calculado.</p>}</div>
            </div>
          )}
          {passo === 3 && <LancarComissao d={d} e={e} />}
        </div>
      </div>
      <div className="fo-m4-pe">
        <button type="button" disabled={passo === 0} onClick={() => setPasso((p) => p - 1)}><i className="fas fa-arrow-left" /> Voltar</button>
        {passo < P.length - 1 && <button type="button" className="prox" onClick={() => setPasso((p) => p + 1)}>{P[passo + 1]} <i className="fas fa-arrow-right" /></button>}
      </div>
      {v.camadas}
    </div>
  )
}

/** M5 — Mesa da comissão: faixa do RH em cima; à esquerda as OS para decidir, à direita o recibo que se monta sozinho. */
export function M5({ d, foto }: { d: Ficha; foto?: string }) {
  const v = useVisores(d), e = useEdicao(d)
  const [aba, setAba] = useState('mesa')
  const pagas = e.linhas.filter((l) => e.final(l) > 0)
  return (
    <div className="fo-jan">
      <header className="fo-m5-faixa">
        <Foto d={d} foto={foto} tam={60} />
        <div className="fo-m5-id"><b>{d.nome}</b><small>{d.rh?.nomeRh} · {d.rh?.cargo} · admissão {dataBR(d.rh?.admissao)} · {d.rh?.tipoContrato?.toUpperCase()}{d.rh?.salario ? ` · salário ${brl2(d.rh.salario)}` : ''} · comissão {d.comissao.pct}%</small></div>
        <Liga d={d} />
        <div className="fo-m5-mini">
          <span><small>Férias</small><b>{d.rh?.ferias.filter((f) => /disponivel|vencid/.test(f.status)).reduce((s, f) => s + f.saldo, 0) ?? 0} d</b></span>
          <span><small>Faltas</small><b>{d.rh?.ponto.filter((p) => /falta/i.test(p.tipo)).length ?? 0}</b></span>
          <span><small>Caixinha</small><b>{brl(d.rh?.caixinha.saldo || 0)}</b></span>
        </div>
      </header>
      <Abas abas={[{ k: 'mesa', rot: 'Mesa da comissão', ic: 'fa-scale-balanced' }, { k: 'rh', rot: 'RH', ic: 'fa-id-card' }, ...ABAS_RESTO]} aba={aba} setAba={setAba} />
      <div className="fo-corpo">
        {aba === 'mesa' ? (
          <div className="fo-m5-mesa">
            <EditorComissao d={d} e={e} verOS={v.verOS} compacta />
            <div className="fo-recibo">
              <div className="fo-rec-cab"><b>Recibo de comissão</b><small>{nomeMes(d.mes)} · {d.rh?.nomeRh || d.nome}</small></div>
              <div className="fo-rec-lin">{pagas.map((l) => <div key={l.os}><span>OS {l.numeroOmie || l.os}</span><em />{brl2(e.final(l))}</div>)}</div>
              {e.tot.nao > 0 && <div className="fo-rec-nao">{e.linhas.filter((l) => e.de(l).acao === 'nao').map((l) => <div key={l.os}><s>OS {l.numeroOmie || l.os}</s> <small>{e.de(l).motivo || 'sem motivo'}</small></div>)}</div>}
              <div className="fo-rec-tot"><span>Total</span><b>{brl2(e.tot.total)}</b></div>
              <LancarComissao d={d} e={e} vertical />
            </div>
          </div>
        ) : <Conteudo d={d} aba={aba} v={v} e={e} />}
      </div>
      {v.camadas}
    </div>
  )
}

export const ESTILO_FO = `
.fo-jan { position: relative; height: 860px; display: flex; flex-direction: column; background: var(--portal-bg, #f8fafc); border-radius: 22px; overflow: hidden; box-shadow: 0 20px 50px rgba(15,23,42,.14); color: var(--portal-text, #0f172a) }
.fo-corpo { flex: 1; overflow: auto; padding: 16px 20px 22px }
.ft-fundo:has(.fo-modal-caixa) { padding: 0 }
.fo-modal-caixa { width: 100vw; height: 100vh; overflow-y: auto; overscroll-behavior: contain; background: var(--portal-bg, #f8fafc); animation: ftSobe .4s cubic-bezier(.2,1.1,.3,1) both }
.fo-jan.fo-modal { height: auto; min-height: 100%; border-radius: 0; overflow: visible; box-shadow: none }
.fo-jan.fo-modal .fo-corpo { overflow: visible; flex: none; padding: 18px clamp(16px, 3vw, 40px) 40px }
.fo-jan.fo-modal .fo-m1-cab { padding: 22px clamp(16px, 3vw, 40px) } .fo-jan.fo-modal .fo-metas { padding: 12px clamp(16px, 3vw, 40px) } .fo-jan.fo-modal .fo-abas { position: sticky; top: 0; z-index: 5; padding: 0 clamp(10px, 2.5vw, 34px) }
.fo-jan.fo-modal .fo-m1-cab .ft-x { position: fixed; top: 14px; right: 18px; z-index: 6; box-shadow: 0 4px 14px rgba(15,23,42,.18) }
.fo-lan-sep { display: grid; gap: 4px; margin-top: 6px } .fo-lan-sep span { display: flex; gap: 6px; align-items: baseline; font-size: 12.5px; color: var(--portal-text, #334155) } .fo-lan-sep i { color: #2563eb; width: 14px } .fo-lan-sep .int i { color: #7c3aed } .fo-lan-sep b { font-size: 14px } .fo-lan-sep em { font-style: normal; font-size: 11.5px; color: var(--portal-text-muted, #64748b) }
.fo-grupo { --g: #2563eb; --gf: #eff6ff; --gb: #bfdbfe; display: grid; gap: 8px; padding: 12px; border-radius: 18px; background: var(--gf); border: 1px solid var(--gb) } .fo-grupo + .fo-grupo { margin-top: 14px }
.fo-grupo.garantia { --g: #db2777; --gf: #fdf2f8; --gb: #fbcfe8 } .fo-grupo.interna { --g: #64748b; --gf: #f1f5f9; --gb: #e2e8f0 }
.fo-grupo-cab { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 2px 4px 4px }
.fo-grupo-cab > span { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--g); color: #fefefe; font-size: 13.5px; box-shadow: 0 4px 10px color-mix(in srgb, var(--g) 30%, transparent) }
.fo-grupo-cab em { color: var(--g) } .fo-grupo .fo-lin { border-color: color-mix(in srgb, var(--gb) 70%, #fefefe) } .fo-grupo.interna .fo-lin { background: #fafbfc }
.fo-lan-sep .gar i { color: #db2777 } .fo-lan-sep .int i { color: #64748b }
.fo-grupo-cab b { font-size: 14.5px } .fo-grupo-cab small { flex: 1; font-size: 12px; color: var(--portal-text-muted, #64748b) } .fo-grupo-cab em { font-style: normal; font-size: 13px; font-weight: 900 }
.fo-m1-cab { position: relative } .fo-m1-cab .ft-x { position: absolute; top: 12px; right: 14px }
.fo-m1-mes { margin-left: 10px; vertical-align: middle }
.fo-metas { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; padding: 12px 20px; background: var(--portal-bg-card, #fefefe); border-bottom: 1px solid var(--portal-border, #e2e8f0); align-items: stretch }
.fo-meta { position: relative; cursor: help; display: grid; gap: 8px; padding: 10px 14px 14px; border-radius: 14px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg, #f8fafc); transition: all .3s }
.fo-meta.ok { background: linear-gradient(120deg, #ecfdf5, #d1fae5); border-color: #6ee7b7; box-shadow: 0 0 0 3px rgba(16,185,129,.15) }
.fo-meta.ideal { background: linear-gradient(120deg, #f5f3ff, #ede9fe); border-color: #c4b5fd; box-shadow: 0 0 0 3px rgba(124,58,237,.15) }
.fo-meta-cab { display: flex; gap: 10px; align-items: center } .fo-meta-cab > div:nth-child(2) { flex: 1; display: grid } .fo-meta-cab small { font-size: 12px; font-weight: 800; color: ${MUDO} } .fo-meta-cab b { font-size: 20px; font-weight: 900; font-variant-numeric: tabular-nums }
.fo-meta-ic { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; background: #dbeafe; color: #2563eb } .fo-meta.ok .fo-meta-ic { background: #a7f3d0; color: #047857 } .fo-meta.ideal .fo-meta-ic { background: #ddd6fe; color: #6d28d9 }
.fo-meta-pct { display: grid; text-align: right } .fo-meta-pct b { font-size: 16px }
.fo-meta-selo { display: inline-flex; gap: 5px; align-items: center; font-size: 12px; font-weight: 900; color: #fefefe; background: linear-gradient(135deg, #10b981, #047857); border-radius: 99px; padding: 4px 11px; box-shadow: 0 4px 12px rgba(16,185,129,.3); white-space: nowrap; animation: shPula .5s cubic-bezier(.2,1.6,.4,1) both } .fo-meta-selo.ideal { background: linear-gradient(135deg, #8b5cf6, #6d28d9); box-shadow: 0 4px 12px rgba(124,58,237,.3) }
@keyframes shPula { from { transform: scale(.6); opacity: 0 } }
.fo-meta-ritmo { font-size: 12px; font-weight: 800; color: #dc2626; white-space: nowrap } .fo-meta-ritmo.bom { color: #059669 }
.fo-meta-bar { position: relative; height: 10px; border-radius: 99px; background: #e2e8f0; margin-bottom: 12px } .fo-meta-bar > i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #60a5fa, #2563eb); transform-origin: left; animation: ftLarga 1s cubic-bezier(.2,.9,.3,1) both }
.fo-meta.ok .fo-meta-bar > i { background: linear-gradient(90deg, #34d399, #059669) } .fo-meta.ideal .fo-meta-bar > i { background: linear-gradient(90deg, #a78bfa, #6d28d9) }
.fo-meta-bar > span { position: absolute; top: -4px; width: 3px; height: 18px; border-radius: 2px; transform: translateX(-50%) } .fo-meta-bar .basica { background: #0f172a } .fo-meta-bar .ideal { background: #7c3aed } .fo-meta-bar .hoje { background: #f59e0b; height: 14px; top: -2px }
.fo-meta-bar em { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); font-style: normal; font-size: 10.5px; font-weight: 800; white-space: nowrap; color: #0f172a } .fo-meta-bar .ideal em { color: #7c3aed }
.fo-meta-sem { display: grid; align-content: center; gap: 2px; padding: 10px 16px; border-radius: 14px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg, #f8fafc); min-width: 170px } .fo-meta-sem.ok { background: linear-gradient(120deg, #ecfdf5, #d1fae5); border-color: #6ee7b7 }
.fo-meta-sem small { font-size: 12px; font-weight: 800; color: ${MUDO} } .fo-meta-sem b { font-size: 22px; font-weight: 900 } .fo-meta-sem em { font-style: normal; font-size: 11.5px; color: ${MUDO} } .fo-meta-sem .fo-meta-selo { justify-self: start; margin-top: 4px }
.fo-metas-leg { grid-column: 1 / -1; margin: 0; font-size: 12px; color: ${MUDO} }
.fo-meta-pop { position: absolute; top: calc(100% + 8px); left: 0; z-index: 7; width: min(380px, 92vw); display: none; gap: 6px; padding: 14px 16px; background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; box-shadow: 0 22px 50px rgba(15,23,42,.18); cursor: default }
.fo-meta:hover .fo-meta-pop { display: grid; animation: fpEntra .18s both }
.fo-meta-pop > b { font-size: 13.5px; color: #0f172a } .fo-meta-pop > small { font-size: 11.5px; color: ${MUDO} }
.fo-mp-lin { display: grid; grid-template-columns: 1fr auto 48px auto; gap: 10px; align-items: baseline; padding: 7px 10px; border-radius: 10px; background: #f8fafc; font-size: 13.5px }
.fo-mp-lin.ide { background: #f5f3ff } .fo-mp-nome { color: #475569 } .fo-mp-alvo { font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums } .fo-mp-pct { text-align: right; font-weight: 700; color: #0f172a }
.fo-mp-falta { font-size: 12px; color: #b45309; text-align: right; min-width: 92px } .fo-mp-falta.ok { color: #047857; font-weight: 700 }
.fo-mp-ritmo { font-size: 12.5px; color: #334155 }
@media (max-width: 900px) { .fo-metas { grid-template-columns: 1fr } }
.fo-abas { padding: 0 14px }
.fo-foto { flex: none; border-radius: 50%; overflow: hidden; border: 4px solid #fefefe; box-shadow: 0 8px 22px rgba(15,23,42,.18); background: linear-gradient(135deg, #2563eb, #7c3aed); display: grid; place-items: center }
.fo-foto img { width: 100%; height: 100%; object-fit: cover } .fo-foto span { color: #fefefe; font-weight: 900 }
.fo-liga { display: flex; align-items: center; gap: 10px; background: color-mix(in srgb, var(--lc) 12%, #fefefe); border: 1px solid color-mix(in srgb, var(--lc) 35%, transparent); border-radius: 16px; padding: 8px 14px 8px 10px }
.fo-liga small { display: block; font-size: 11px; font-weight: 800; color: ${MUDO}; text-transform: uppercase; letter-spacing: .05em } .fo-liga b { display: block; font-size: 17px; font-weight: 900; color: #0f172a } .fo-liga em { font-style: normal; font-size: 12px; color: ${MUDO} } .fo-liga em span { font-weight: 900 }
.fo-liga.g b { font-size: 21px }
.fo-rh { display: grid; gap: 8px 16px } .fo-rh div { display: grid; min-width: 0 } .fo-rh small { font-size: 11.5px; font-weight: 700; color: ${MUDO} } .fo-rh b { font-size: 13.5px; overflow: hidden; text-overflow: ellipsis } .fo-rh b.verm { color: #dc2626 }
/* M1 */
.fo-m1-cab { display: flex; gap: 18px; align-items: flex-start; padding: 18px 22px; background: linear-gradient(135deg, #dbeafe, #eff6ff 55%, #f5f3ff) } .fo-m1-id { flex: 1; min-width: 0 } .fo-m1-id h2 { margin: 0; font-size: 23px; font-weight: 900 } .fo-m1-id p { margin: 2px 0 10px; color: #475569; font-size: 13px }
/* M2 */
.fo-m2 { flex-direction: row } .fo-m2-lado { width: 300px; flex: none; overflow: auto; padding: 22px 18px; display: grid; gap: 12px; align-content: start; justify-items: center; background: linear-gradient(180deg, #eef2ff, #f8fafc); border-right: 1px solid var(--portal-border, #e2e8f0) }
.fo-m2-lado h2 { margin: 0; font-size: 20px; font-weight: 900; text-align: center } .fo-m2-lado > p { margin: -8px 0 0; font-size: 13px; color: ${MUDO}; text-align: center } .fo-m2-lado .fo-rh { width: 100%; background: #fefefe; border-radius: 14px; padding: 12px } .fo-m2-lado .fo-liga { width: 100% }
.fo-m2-dir { flex: 1; min-width: 0; display: flex; flex-direction: column }
/* M3 */
.fo-m3-ind { display: flex; gap: 4px; padding: 10px 16px; background: var(--portal-bg-card, #fefefe); border-bottom: 1px solid var(--portal-border, #e2e8f0); overflow-x: auto }
.fo-m3-ind button { border: none; background: #f1f5f9; border-radius: 99px; padding: 6px 12px; font-family: inherit; font-size: 12.5px; font-weight: 800; color: #334155; cursor: pointer; white-space: nowrap } .fo-m3-ind button:hover { background: #2563eb; color: #fefefe }
.fo-m3 section { display: grid; gap: 12px; margin-bottom: 26px; scroll-margin-top: 8px } .fo-m3 section h3 { margin: 0; font-size: 16px; font-weight: 900; display: flex; gap: 8px; align-items: center } .fo-m3 section h3 i { color: #2563eb }
.fo-m3-rh { display: flex !important; gap: 18px; align-items: center; background: linear-gradient(135deg, #dbeafe, #f5f3ff); border-radius: 20px; padding: 18px } .fo-m3-rh > div { flex: 1; min-width: 0 } .fo-m3-rh h2 { margin: 0 0 8px; font-size: 22px; font-weight: 900 }
.fo-m3-com { display: grid; grid-template-columns: 1fr 320px; gap: 14px; align-items: start } .fo-m3-com .fo-lancar { position: sticky; top: 0 }
/* M4 */
.fo-m4-trilho { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); padding: 18px 28px 14px; background: var(--portal-bg-card, #fefefe); border-bottom: 1px solid var(--portal-border, #e2e8f0) }
.fo-m4-trilho::before { content: ''; position: absolute; left: calc(28px + 12.5% - 14px); right: calc(28px + 12.5% - 14px); top: 32px; height: 3px; background: #e2e8f0 }
.fo-m4-barra { position: absolute; left: calc(28px + 12.5% - 14px); top: 32px; height: 3px; background: #2563eb; max-width: calc(100% - 2 * (28px + 12.5% - 14px)); transition: width .5s cubic-bezier(.2,.9,.3,1) }
.fo-m4-trilho button { position: relative; z-index: 1; border: none; background: none; display: grid; justify-items: center; gap: 6px; font-family: inherit; font-size: 13px; font-weight: 800; color: ${MUDO}; cursor: pointer }
.fo-m4-trilho button span { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: #fefefe; border: 3px solid #e2e8f0; font-weight: 900; transition: all .3s }
.fo-m4-trilho button.on { color: #2563eb } .fo-m4-trilho button.on span { border-color: #2563eb; color: #2563eb; transform: scale(1.12) } .fo-m4-trilho button.feito span { background: #2563eb; border-color: #2563eb; color: #fefefe }
.fo-m4-quem { display: flex; gap: 18px; align-items: center } .fo-m4-quem h2 { margin: 0; font-size: 24px; font-weight: 900 } .fo-m4-quem p { margin: 2px 0 10px; color: ${MUDO} }
.fo-m4 .fo-rh { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; padding: 14px 16px }
.fo-m4-mais { display: flex; gap: 6px; flex-wrap: wrap } .fo-m4-mais button { border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 12.5px; font-weight: 800; color: ${MUDO}; cursor: pointer } .fo-m4-mais button.on { background: #2563eb; border-color: #2563eb; color: #fefefe }
.fo-m4-conf { display: grid; grid-template-columns: auto auto auto; gap: 18px; align-items: center; justify-content: start } .fo-m4-conf > i { color: ${MUDO}; font-size: 20px }
.fo-m4-num { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; padding: 16px 22px; display: grid } .fo-m4-num small { font-size: 12px; font-weight: 800; color: ${MUDO} } .fo-m4-num b { font-size: 30px; font-weight: 900 } .fo-m4-num b.verde { color: #047857 }
.fo-m4-mex { grid-column: 1 / -1; display: grid; gap: 6px; font-size: 13.5px } .fo-m4-mex > div { background: var(--portal-bg-card, #fefefe); border-radius: 12px; padding: 8px 12px } .fo-m4-mex small { color: ${MUDO}; margin-left: 6px } .verm { color: #dc2626 }
.fo-m4-pe { display: flex; justify-content: space-between; padding: 12px 20px; border-top: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe) }
.fo-m4-pe button { border: 1px solid var(--portal-border, #e2e8f0); background: #fefefe; border-radius: 12px; padding: 9px 16px; font-family: inherit; font-size: 13.5px; font-weight: 800; color: #334155; cursor: pointer } .fo-m4-pe button:disabled { opacity: .4 } .fo-m4-pe button.prox { background: #2563eb; border-color: #2563eb; color: #fefefe }
/* M5 */
.fo-m5-faixa { display: flex; gap: 14px; align-items: center; padding: 14px 20px; background: linear-gradient(135deg, #dbeafe, #f5f3ff); flex-wrap: wrap } .fo-m5-id { flex: 1; min-width: 200px; display: grid } .fo-m5-id b { font-size: 19px; font-weight: 900 } .fo-m5-id small { font-size: 12.5px; color: #475569 }
.fo-m5-mini { display: flex; gap: 8px } .fo-m5-mini span { background: rgba(254,254,254,.85); border-radius: 12px; padding: 6px 12px; display: grid; text-align: center } .fo-m5-mini small { font-size: 11px; color: ${MUDO}; font-weight: 700 } .fo-m5-mini b { font-size: 15px }
.fo-m5-mesa { display: grid; grid-template-columns: 1fr 340px; gap: 16px; align-items: start }
.fo-recibo { position: sticky; top: 0; background: #fefefe; border-radius: 16px; padding: 16px; display: grid; gap: 10px; box-shadow: 0 10px 30px rgba(15,23,42,.1); border-top: 6px solid #059669; background-image: radial-gradient(circle at 10px -2px, transparent 8px, #fefefe 9px); }
.fo-rec-cab b { display: block; font-size: 16px; font-weight: 900 } .fo-rec-cab small { color: ${MUDO}; font-size: 12.5px }
.fo-rec-lin { display: grid; gap: 4px; font-family: ui-monospace, monospace; font-size: 12.5px } .fo-rec-lin div { display: flex; gap: 6px; align-items: baseline; animation: ftEntra .3s both } .fo-rec-lin em { flex: 1; border-bottom: 1px dotted #cbd5e1 }
.fo-rec-nao { display: grid; gap: 3px; font-size: 12px; color: #b91c1c; border-top: 1px dashed #fecaca; padding-top: 6px } .fo-rec-nao small { color: ${MUDO} }
.fo-rec-tot { display: flex; justify-content: space-between; align-items: baseline; border-top: 2px solid #0f172a; padding-top: 8px } .fo-rec-tot b { font-size: 24px; font-weight: 900; color: #047857 }
.fo-recibo .fo-lancar { box-shadow: none; padding: 0; border: none; background: none } .fo-recibo .fo-lan-tot { display: none }
/* editor */
.fo-editor { display: grid; gap: 8px } .fo-ed-topo { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap } .fo-ed-topo > small { font-size: 12.5px; color: ${MUDO} }
.c-p { color: #059669 } .c-n { color: #dc2626 } .c-a { color: #d97706 } .c-d { color: #7c3aed }
.fo-lin { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px; padding: 10px 12px; display: grid; gap: 8px; transition: border-color .25s, box-shadow .25s; animation: ftEntra .3s both }
.fo-lin.nao, .fo-lin.ajustar { border-color: color-mix(in srgb, var(--ec) 45%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ec) 10%, transparent) }
.fo-lin.nao .fo-lin-val b { color: #dc2626 }
.fo-lin-cab { display: flex; gap: 10px; align-items: flex-start } .fo-lin-id { flex: 1; min-width: 0; display: grid } .fo-lin-id b { font-size: 13.5px } .fo-lin-id small { font-size: 12px; color: ${MUDO} } .fo-rh-mot { color: #b45309 !important }
.fo-lin-val { text-align: right; display: grid; font-variant-numeric: tabular-nums } .fo-lin-val s { font-size: 11.5px; color: ${MUDO} } .fo-lin-val b { font-size: 16px; font-weight: 900; color: var(--ec); transition: color .2s }
.fo-lin-acoes { display: flex; gap: 10px; align-items: center; flex-wrap: wrap } .fo-ok { font-size: 12px; color: #059669 }
.fo-seg { display: inline-flex; background: #f1f5f9; border-radius: 11px; padding: 3px; gap: 2px }
.fo-seg button { border: none; background: none; border-radius: 8px; padding: 5px 10px; font-family: inherit; font-size: 12.5px; font-weight: 800; color: ${MUDO}; cursor: pointer; transition: all .2s }
.fo-seg button:hover { color: #0f172a } .fo-seg button.on { background: #fefefe; box-shadow: 0 1px 4px rgba(15,23,42,.12) } .fo-seg .on.pagar { color: #059669 } .fo-seg .on.nao { color: #dc2626 } .fo-seg .on.ajustar { color: #d97706 } .fo-seg .on.dividir { color: #7c3aed }
.fo-motivos { display: grid; gap: 6px; background: color-mix(in srgb, var(--ec) 6%, #fefefe); border-radius: 12px; padding: 10px 12px; animation: ftEntra .25s both } .fo-motivos > small { font-size: 12px; font-weight: 800; color: var(--ec) }
.fo-motivos > div { display: flex; gap: 5px; flex-wrap: wrap } .fo-motivos > div button { border: 1px solid var(--portal-border, #e2e8f0); background: #fefefe; border-radius: 99px; padding: 4px 10px; font-family: inherit; font-size: 12px; font-weight: 700; color: #334155; cursor: pointer } .fo-motivos > div button.on { background: var(--ec); border-color: var(--ec); color: #fefefe }
.fo-motivos input, .fo-mot-txt { border: 1px solid var(--portal-border, #cbd5e1); border-radius: 9px; padding: 6px 10px; font-family: inherit; font-size: 13px; min-width: 0 }
.fo-ajuste { display: flex !important; gap: 10px; align-items: center; flex-wrap: wrap } .fo-ajuste label { display: flex; gap: 6px; align-items: center; font-size: 12.5px; font-weight: 800 } .fo-ajuste label span { color: ${MUDO} } .fo-ajuste label input { width: 110px; font-weight: 900 } .fo-ajuste .fo-mot-txt { flex: 1 }
.fo-div { background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 10px 12px; display: grid; gap: 8px; animation: ftEntra .25s both }
.fo-div-cab { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap } .fo-div-cab b { color: #6d28d9; font-size: 13px } .fo-div-cab small { color: ${MUDO}; font-size: 12px; flex: 1 }
.fo-div-cab button { border: 1px solid #d8b4fe; background: #fefefe; color: #6d28d9; border-radius: 99px; padding: 3px 10px; font-family: inherit; font-size: 12px; font-weight: 800; cursor: pointer }
/* divisão por horas (29/10/2026): uma linha por técnico, nome inteiro, horas e quanto ele recebe */
.fo-div-lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 6px }
.fo-div-lista label { display: flex; gap: 6px; align-items: center; background: #fefefe; border: 1px solid #ede9fe; border-radius: 10px; padding: 6px 8px; font-size: 13px; cursor: pointer } .fo-div-lista label.on { border-color: #c4b5fd }
.fo-div-lista span { flex: 1 } .fo-div-lista em { font-style: normal; color: ${MUDO}; font-size: 11.5px } .fo-div-lista i { font-style: normal; color: ${MUDO}; font-size: 12px } .fo-div-lista input[type=number] { width: 86px; border: 1px solid #ddd6fe; border-radius: 7px; padding: 3px 6px; font-family: inherit; font-weight: 800 } .fo-div-lista small { width: 34px; text-align: right; color: #7c3aed; font-weight: 800; font-size: 12px }
.fo-div-lista label > span { min-width: 0 } .fo-div-lista input[type=checkbox] { flex: 0 0 auto; width: 16px; height: 16px; margin: 0 } .fo-div-lista .fo-div-pct { width: auto; text-align: left; color: #64748b; font-weight: 500 } .fo-div-lista input[type=number] { width: 70px } .fo-div-lista .fo-div-v { min-width: 84px; text-align: right; color: #6d28d9; font-variant-numeric: tabular-nums }
.fo-div-salvar { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 10px; background: #fefefe; border: 1px dashed #c4b5fd; font-size: 13px; color: #6d28d9 } .fo-div-salvar em { font-style: normal; color: #b91c1c }
.fo-div-salvar.ok { border-style: solid; border-color: #86efac; background: #f0fdf4; color: #166534 }
.fo-div-salvar button { border: 0; border-radius: 99px; padding: 8px 16px; background: #6d28d9; color: #fefefe; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap } .fo-div-salvar button:disabled { opacity: .55; cursor: default } .fo-div-salvar.ok button { background: #16a34a; opacity: 1 }
.fo-div-pe { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 13px } .fo-div-pe em { font-style: normal; color: #b45309 } .fo-div-pe .fo-mot-txt { flex: 1 }
.fo-cam { margin: 4px 0 0; font-size: 12.5px; color: #b45309 }
/* lançar */
.fl { display: grid; grid-template-columns: minmax(220px, .9fr) minmax(280px, 1.25fr) minmax(240px, 1fr); background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.05) }
.fl > section { padding: 18px 22px; display: grid; gap: 10px; align-content: start; min-width: 0 } .fl > section + section { border-left: 1px solid var(--portal-border, #eef2f7) }
.fl > p, .fl > .fo-lan-bt, .fl > .fo-lan-conf, .fl > .fo-lan-st, .fl > .flc { grid-column: 1 / -1; margin: 0 22px 16px } .fl-valor .fo-lan-bt { justify-self: start; margin-top: 4px }
.fl.vert { grid-template-columns: 1fr } .fl.vert > section + section { border-left: none; border-top: 1px solid var(--portal-border, #eef2f7) } .fl.vert > .fo-lan-bt { justify-self: stretch }
.fl-rot { font-size: 11.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: ${MUDO} }
.fl-total { font-size: 36px; font-weight: 900; line-height: 1; color: #065f46; font-variant-numeric: tabular-nums; letter-spacing: -.01em }
.fl-regra { font-size: 12.5px; color: ${MUDO} } .fl-regra em { font-style: normal; font-weight: 800 } .fl-regra em.mais { color: #047857 } .fl-regra em.menos { color: #b91c1c }
.fl-chips { display: flex; gap: 6px; flex-wrap: wrap } .fl-chips span { font-size: 11.5px; font-weight: 800; border-radius: 99px; padding: 3px 10px; background: #f1f5f9; color: #475569 }
.fl-chips .ok { background: #ecfdf5; color: #047857 } .fl-chips .nao { background: #fef2f2; color: #b91c1c } .fl-chips .aj { background: #fffbeb; color: #b45309 } .fl-chips .div { background: #f5f3ff; color: #6d28d9 }
.fl-barra { display: flex; height: 10px; border-radius: 99px; overflow: hidden; background: #f1f5f9; gap: 2px } .fl-barra i { display: block; height: 100%; transform-origin: left; animation: ftLarga .9s cubic-bezier(.2,.9,.3,1) both }
.fl-tab { display: grid } .fl-lin { display: grid; grid-template-columns: 10px 1fr auto 96px 40px; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--portal-border, #f1f5f9); font-size: 13.5px } .fl-lin:last-child { border-bottom: none }
.fl-dot { width: 10px; height: 10px; border-radius: 50% } .fl-nome { font-weight: 700; color: var(--portal-text, #0f172a) } .fl-n { font-size: 12px; color: ${MUDO} } .fl-v { text-align: right; font-weight: 900; font-variant-numeric: tabular-nums } .fl-p { text-align: right; font-size: 12px; color: ${MUDO}; font-variant-numeric: tabular-nums }
.fl-passos { list-style: none; margin: 0; padding: 0; display: grid; gap: 0 }
.fl-passos li { position: relative; display: grid; grid-template-columns: 24px 1fr; gap: 10px; padding-bottom: 12px } .fl-passos li:last-child { padding-bottom: 0 }
.fl-passos li:not(:last-child)::before { content: ''; position: absolute; left: 11px; top: 24px; bottom: 0; width: 2px; background: var(--portal-border, #e2e8f0) } .fl-passos li.feito:not(:last-child)::before { background: #10b981 }
.fl-passos li > span { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 900; background: #f1f5f9; color: ${MUDO}; border: 2px solid var(--portal-border, #e2e8f0) }
.fl-passos li.feito > span { background: #10b981; border-color: #10b981; color: #fefefe } .fl-passos li.agora > span { background: #fefefe; border-color: #2563eb; color: #2563eb; box-shadow: 0 0 0 4px #dbeafe }
.fl-passos b { display: block; font-size: 13px; color: var(--portal-text, #0f172a) } .fl-passos small { font-size: 12px; color: ${MUDO} }
@media (max-width: 1000px) { .fl { grid-template-columns: 1fr } .fl > section + section { border-left: none; border-top: 1px solid var(--portal-border, #eef2f7) } .fl > .fo-lan-bt { justify-self: stretch } }
.fo-lan-of { margin: 0; font-size: 12.5px; color: #1d4ed8; background: #eff6ff; border-radius: 10px; padding: 8px 10px } .fo-lan-falta { margin: 0; font-size: 12.5px; color: #b45309; background: #fffbeb; border-radius: 10px; padding: 8px 10px }
.fo-lan-bt { justify-self: start; display: inline-flex; align-items: center; gap: 10px; border: none; background: #0f172a; color: #fefefe; border-radius: 999px; padding: 11px 14px 11px 22px; font-family: inherit; font-size: 14.5px; font-weight: 600; letter-spacing: .1px; cursor: pointer; box-shadow: 0 1px 2px rgba(15,23,42,.08), 0 8px 20px rgba(15,23,42,.14); transition: background .2s, transform .15s, box-shadow .2s }
.fo-lan-bt .seta { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.14); font-size: 12px; transition: transform .2s } .fo-lan-bt:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); box-shadow: 0 10px 24px rgba(29,78,216,.28) } .fo-lan-bt:hover:not(:disabled) .seta { transform: translateX(2px) }
.fo-lan-bt:disabled { background: #f1f5f9; color: #94a3b8; box-shadow: none; cursor: not-allowed } .fo-lan-bt:disabled .seta { background: #e2e8f0 }
.fo-lan-pq { font-size: 12.5px; color: var(--portal-text-muted, #64748b); margin-top: -2px }
.fo-lan-conf { display: grid; gap: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 12px 14px; font-size: 13px; animation: ftEntra .25s both } .fo-lan-conf ul { margin: 0; padding-left: 18px; display: grid; gap: 3px } .fo-lan-conf > div { display: flex; gap: 8px; align-items: center }
.fo-lan-volta { border: none; background: none; color: ${MUDO}; font-family: inherit; font-weight: 800; cursor: pointer }
.fo-lan-st { margin: 0; font-size: 14px; color: #0f172a; border-radius: 10px; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0 } .fo-lan-st.aguardando { background: #fffbeb; border-color: #fde68a } .fo-lan-st.recusada, .fo-lan-st.devolvida, .fo-lan-st.erro_rh { background: #fef2f2; border-color: #fecaca; color: #991b1b } .fo-lan-st.espelhada { background: #f0fdf4; border-color: #bbf7d0 } .fo-lan-st em { font-style: normal; color: #b45309 }
.fo-lan-aviso { margin: 0; font-size: 13.5px; border-radius: 10px; padding: 8px 12px } .fo-lan-aviso.ok { background: #f0fdf4; color: #166534 } .fo-lan-aviso.erro { background: #fef2f2; color: #991b1b } .fo-lan-aviso.sql { background: #f5f3ff; color: #5b21b6 }
.fl-passos li.ruim > span { background: #dc2626 !important; color: #fefefe !important; border-color: #dc2626 !important }
.fo-lan-apt { display: grid; gap: 3px; margin-top: 8px } .fo-lan-apt > span { font-size: 13.5px } .fo-lan-apt b { font-weight: 600 }
.fo-lan-ass { display: grid; gap: 6px; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px } .fo-lan-ass > span { font-size: 12.5px; color: var(--portal-text-muted, #64748b) } .fo-lan-ass canvas { border: 1px dashed #cbd5e1; border-radius: 8px; background: #fefefe } .fo-lan-ass > button { justify-self: start }
.fo-lan-doc { grid-column: 1 / -1; justify-self: start; margin: 0 22px 16px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: #0f172a; border-radius: 999px; padding: 8px 16px; font-family: inherit; font-size: 13.5px; cursor: pointer } .fo-lan-doc:hover { border-color: #0f172a }
.fo-docs { grid-column: 1 / -1; display: grid; gap: 6px; margin: 0 22px 18px } .fo-docs > button { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 10px; align-items: center; text-align: left; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 12px; padding: 9px 14px; font-family: inherit; color: #0f172a; cursor: pointer }
.fo-docs > button:hover { border-color: #1d4ed8 } .fo-docs > button.on { border-color: #93c5fd; background: #eff6ff } .fo-docs > button > i { color: #1d4ed8; font-size: 16px }
.fo-docs span { display: grid; gap: 1px; min-width: 0 } .fo-docs b { font-weight: 500; font-size: 14px } .fo-docs span small { font-size: 12px; color: #64748b } .fo-docs em { font-style: normal; font-variant-numeric: tabular-nums; font-size: 14px }
.flc-fundo { position: fixed; inset: 0; z-index: 100100; background: rgba(15,23,42,.45); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; animation: ftFade .2s both }
.flc { width: min(980px, 100%); max-height: calc(100vh - 32px); display: grid; gap: 0; align-content: start; background: #fefefe; color: #0f172a; font-family: inherit; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; box-shadow: 0 30px 80px rgba(15,23,42,.35); overflow-y: auto; overscroll-behavior: contain; animation: ftEntra .25s both }
.flc-aviso { margin: 0 22px 14px } .flc-pe { position: sticky; bottom: 0 }
.flc-os { display: grid; grid-template-columns: 80px minmax(0, 1.2fr) minmax(0, 1fr) 130px; gap: 12px; padding: 8px 0; border-top: 1px solid var(--portal-border, #f1f5f9); font-size: 14px; color: #0f172a; align-items: baseline } .flc-os .c { overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .flc-os .r { color: #94a3b8; font-size: 13px } .flc-os .o { color: #92400e; font-size: 13px } .flc-os .v { text-align: right; font-variant-numeric: tabular-nums } .flc-os .v s { display: block; color: #94a3b8; font-size: 12px } .flc-os.nao .n, .flc-os.nao .c, .flc-os.nao .v { color: #94a3b8 }
.flc-os-th { font-size: 12px; color: #64748b; border-top: none; padding-top: 0 } .flc-os-tot { font-weight: 500; border-top: 1px solid #cbd5e1 }.flc-cab { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 18px 22px 14px } .flc-cab > div { display: grid; gap: 3px } .flc-tit { font-size: 18px; color: #0f172a } .flc-sub { font-size: 13.5px; color: #64748b }
.flc-x { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: #fefefe; color: #64748b; cursor: pointer }
.flc-res { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1.2fr; margin: 0; border-top: 1px solid var(--portal-border, #eef2f7); border-bottom: 1px solid var(--portal-border, #eef2f7) }
.flc-res > div { padding: 12px 22px; display: grid; gap: 3px } .flc-res > div + div { border-left: 1px solid var(--portal-border, #eef2f7) } .flc-res dt { font-size: 12px; color: #64748b } .flc-res dd { margin: 0; font-size: 16px; color: #0f172a; font-variant-numeric: tabular-nums }
.flc-res .tot { background: #f8fafc } .flc-res .tot dd { font-size: 22px }
.flc-rot { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: .5px }
.flc-mex { display: grid; gap: 0; padding: 14px 22px 4px } .flc-mex .flc-rot { margin-bottom: 6px }
.flc-ml { display: grid; grid-template-columns: 90px 160px 1fr auto; gap: 12px; padding: 8px 0; border-top: 1px solid var(--portal-border, #f1f5f9); font-size: 14px; color: #0f172a } .flc-ml .o { color: #92400e } .flc-ml .m { color: #334155 } .flc-ml .v { font-variant-numeric: tabular-nums; color: #475569 }
.flc-ass { padding: 14px 22px } .flc-ass-cab { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px } .flc-ass-cab button { border: none; background: none; color: #1d4ed8; font-family: inherit; font-size: 13px; cursor: pointer }
.flc-ass-pad { position: relative; max-width: 560px } .flc-ass-pad canvas { border: 1px solid #cbd5e1 !important; border-radius: 12px !important; background: linear-gradient(transparent calc(100% - 38px), #cbd5e1 calc(100% - 38px), #cbd5e1 calc(100% - 37px), transparent calc(100% - 37px)) #fefefe !important }
.flc-ass-dica { position: absolute; left: 0; right: 0; bottom: 12px; text-align: center; font-size: 12.5px; color: #94a3b8; pointer-events: none }
.flc-pe { display: flex; gap: 12px; align-items: center; justify-content: flex-end; padding: 14px 22px; background: #f8fafc; border-top: 1px solid var(--portal-border, #eef2f7) } .flc-pe > span { margin-right: auto; font-size: 13px; color: #64748b }
.flc-volta { border: none; background: none; color: #475569; font-family: inherit; font-size: 14px; cursor: pointer; padding: 8px 12px }
@media (max-width: 900px) { .flc-res { grid-template-columns: 1fr 1fr } .flc-res > div:nth-child(3) { border-left: none } .flc-ml { grid-template-columns: 80px 1fr } .flc-pe { flex-wrap: wrap } }
.fo-lan-add { justify-self: start; display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--portal-border, #cbd5e1); background: var(--portal-bg-card, #fefefe); color: #0f172a; border-radius: 99px; padding: 8px 16px; font-family: inherit; font-size: 14px; cursor: pointer; transition: border-color .15s } .fo-lan-add:hover { border-color: #0f172a } .fo-lan-add i { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: #fee2e2; color: #b91c1c; font-size: 10px }
.fld { grid-column: 1 / -1; margin: 0 22px 16px; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px; padding: 12px 16px; display: grid; gap: 8px; background: var(--portal-bg-card, #fefefe) }
.fld-vazio { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; border-style: dashed; font-size: 14px; color: #475569 }
.fld-vazio button, .fld-mais { justify-self: start; border: 1px solid var(--portal-border, #cbd5e1); background: #fefefe; color: #0f172a; border-radius: 99px; padding: 7px 14px; font-family: inherit; font-size: 13.5px; cursor: pointer } .fld-mais { border-style: dashed }
.fld-cab { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap } .fld-tit { font-size: 15px; color: #0f172a } .fld-dica { font-size: 12.5px; color: #64748b }
.fld-lin { display: grid; grid-template-columns: 150px 1fr auto 28px; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--portal-border, #f1f5f9); font-size: 14.5px; color: #0f172a }
.fld-lin.cx .fld-v { color: #047857 } .fld-lin.cx .fld-onde b { color: #047857 }
.fld-onde { display: grid } .fld-onde b { font-size: 13px; font-weight: 600; color: #b91c1c } .fld-onde small { font-size: 12px; color: #64748b }
.fld-lin.cab { font-size: 12px; color: #64748b; padding: 4px 0 } .fld:has(.fld-onde) .fld-lin { grid-template-columns: 150px 1fr 170px 110px }
.fld-tipo { color: #475569; font-size: 13.5px } .fld-v { color: #b91c1c; font-variant-numeric: tabular-nums } .fld-lin button { width: 28px; height: 28px; border-radius: 50%; border: none; background: #f1f5f9; color: #64748b; cursor: pointer }
.fld-tot { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding-top: 8px; border-top: 1px solid #0f172a; font-size: 14.5px; color: #0f172a } .fld-tot > span:nth-child(2) { color: #b91c1c; font-variant-numeric: tabular-nums } .fld-liq { grid-column: 1 / -1; font-size: 13px; color: #64748b }
.fld-novo { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; background: #f8fafc; border-radius: 12px; padding: 10px }
.fld-seg { display: inline-flex; background: #e2e8f0; border-radius: 99px; padding: 3px } .fld-seg button { border: none; background: none; border-radius: 99px; padding: 6px 12px; font-family: inherit; font-size: 13.5px; color: #475569; cursor: pointer } .fld-seg button.on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 3px rgba(15,23,42,.12) }
.fld-novo select, .fld-novo > input { border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; font-family: inherit; font-size: 14px; color: #0f172a; background: #fefefe; min-width: 0 } .fld-novo select { max-width: 360px } .fld-novo > input { flex: 1; min-width: 180px }
.fld-rs { display: inline-flex; gap: 6px; align-items: center; font-size: 14px; color: #0f172a } .fld-rs select { border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; font-family: inherit; font-size: 14px; color: #0f172a; background: #fefefe } .fld-prev { font-size: 13px; color: #475569 } .fld-desc { display: grid } .fld-parc { font-size: 12.5px; color: #64748b } .fld-rs input { width: 100px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; font-family: inherit; font-size: 14px }
.fld-ok { border: none; background: #0f172a; color: #fefefe; border-radius: 99px; padding: 8px 16px; font-family: inherit; font-size: 14px; cursor: pointer } .fld-ok:disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed } .fld-x { border: none; background: none; color: #64748b; font-family: inherit; font-size: 13.5px; cursor: pointer }
.fo-lan-sim { margin: 0; font-size: 12.5px; color: #6d28d9; background: #f5f3ff; border-radius: 10px; padding: 8px 10px } .fo-lan-sim button { border: none; background: none; color: #6d28d9; font-weight: 800; text-decoration: underline; cursor: pointer; font-family: inherit }
@media (max-width: 900px) { .fo-m2 { flex-direction: column } .fo-m2-lado { width: auto } .fo-m3-com, .fo-m5-mesa, .fo-lancar { grid-template-columns: 1fr } .fo-m1-cab, .fo-m3-rh { flex-wrap: wrap } .fo-passos { grid-template-columns: 1fr 1fr } }
/* linha da OS numa faixa só (20/10/2026: mais limpo) */
.fo-lin { grid-template-columns: 72px minmax(0, 1fr) auto 118px; align-items: center; column-gap: 16px; row-gap: 8px; padding: 10px 16px; border-radius: 12px }
.fo-lin-cab { display: contents } .fo-lin-cab > .ft-os { grid-column: 1; grid-row: 1; justify-self: start } .fo-lin-id { grid-column: 2; grid-row: 1 } .fo-lin-val { grid-column: 4; grid-row: 1 }
.fo-lin-acoes { grid-column: 3; grid-row: 1 } .fo-ok { display: none }
.fo-lin > .fo-motivos, .fo-lin > .fo-div { grid-column: 1 / -1 }
.fo-lin-id b { font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .fo-lin-id small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.fo-lin:hover { box-shadow: 0 4px 14px rgba(15,23,42,.06) }
.fo-seg button { padding: 5px 9px; font-size: 12px }
@media (max-width: 1000px) { .fo-lin { grid-template-columns: 64px minmax(0, 1fr) 100px } .fo-lin-acoes { grid-column: 1 / -1; grid-row: 2 } }
`
