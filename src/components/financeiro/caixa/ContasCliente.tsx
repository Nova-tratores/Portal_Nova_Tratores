'use client'
// Caixa › Vencidos › clique num cliente (José, 05/11/2026): todas as contas em aberto dele, nas duas empresas,
// com os juros até a data do recebimento, e "Finalizar" = dar baixa no Omie conta por conta.
// Lê de /api/dre-financeiro/vencidos/cliente; a baixa é a MESMA da tela Baixar contas (/api/ajustes/contas/baixar,
// permissão ajustes:baixa-contas): valor em aberto + juros à parte, na conta corrente de cada conta no Omie.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { fetchAuth } from '@/lib/auth/client'
import { COR, Documento, brl, dataBR, empresa, hojeISO, pegarDre, semZeros } from './comum'

interface Conta {
  tipo: 'pagar' | 'receber'; codigo_lancamento: number; conta_omie: string; numero_documento: string | null; numero_documento_fiscal: string | null
  numero_parcela: string | null; descricao_categoria: string | null; data_vencimento: string; valor_documento: number; valor_pago: number
  valor_aberto: number; parcial: boolean; dias_atraso: number; status_titulo: string; id_conta_corrente: number | null
}
interface ContaCorrente { codigo: number | string; descricao: string; tipo?: string }
export interface ClienteAberto { nome: string; documento: string | null; telefone: string | null; tipo: 'pagar' | 'receber'; codigos: number[] }
type Situacao = { estado: 'baixando' | 'ok' | 'erro'; msg?: string }

const diaN = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) / 864e5
const dinheiro = (n: number) => Math.round(n * 100) / 100

export default function ContasCliente({ cliente, taxa, onFechar, onBaixou }: { cliente: ClienteAberto; taxa: number; onFechar: () => void; onBaixou: () => void }) {
  const { userProfile } = useAuth()
  const { pode } = usePermissoes(userProfile?.id)
  const podeBaixar = pode('ajustes', 'baixa-contas')
  const receber = cliente.tipo === 'receber'
  const hoje = useMemo(() => hojeISO(), [])

  const [contas, setContas] = useState<Conta[] | null>(null)
  const [erro, setErro] = useState('')
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set())
  const [data, setData] = useState(hoje)
  const [cobrarJuros, setCobrarJuros] = useState(receber)
  const [ccs, setCcs] = useState<Record<string, ContaCorrente[]>>({})
  const [ccEscolhida, setCcEscolhida] = useState<Record<string, string>>({}) // empresa → conta corrente ('' = a de cada conta)
  const [situacao, setSituacao] = useState<Record<number, Situacao>>({})
  const [rodando, setRodando] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !rodando) onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFechar, rodando])

  useEffect(() => {
    let vivo = true
    const q = `tipo=${cliente.tipo}&codigos=${cliente.codigos.join(',')}${cliente.documento ? `&documento=${encodeURIComponent(cliente.documento)}` : ''}`
    pegarDre<{ titulos: Conta[] }>(`/api/dre-financeiro/vencidos/cliente?${q}`)
      .then((j) => { if (!vivo) return; setContas(j.titulos); setMarcadas(new Set(j.titulos.filter((t) => t.dias_atraso > 0).map((t) => t.codigo_lancamento))) })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar') })
    return () => { vivo = false }
  }, [cliente])

  // contas correntes de cada empresa que aparece (só para quem pode dar baixa)
  const empresas = useMemo(() => [...new Set((contas || []).map((t) => t.conta_omie))], [contas])
  useEffect(() => {
    if (!podeBaixar) return
    for (const e of empresas) {
      if (ccs[e]) continue
      fetchAuth(`/api/ajustes/contas-correntes?conta=${e}`).then((r) => r.json())
        .then((d) => setCcs((x) => ({ ...x, [e]: d.contasCorrentes || [] }))).catch(() => setCcs((x) => ({ ...x, [e]: [] })))
    }
  }, [empresas, podeBaixar, ccs])

  const atrasoEm = useCallback((t: Conta) => Math.max(0, Math.round(diaN(data) - diaN(t.data_vencimento))), [data])
  const jurosDe = useCallback((t: Conta) => (receber && cobrarJuros ? dinheiro(t.valor_aberto * (taxa / 100) * (atrasoEm(t) / 30)) : 0), [receber, cobrarJuros, taxa, atrasoEm])
  const ccDe = (t: Conta) => ccEscolhida[t.conta_omie] || (t.id_conta_corrente ? String(t.id_conta_corrente) : '')
  const nomeCc = (e: string, cod: string) => ccs[e]?.find((c) => String(c.codigo) === cod)?.descricao || (cod ? `conta ${cod}` : 'sem conta corrente')

  const vencidas = (contas || []).filter((t) => t.dias_atraso > 0)
  const aVencer = (contas || []).filter((t) => t.dias_atraso === 0)
  const sel = (contas || []).filter((t) => marcadas.has(t.codigo_lancamento) && situacao[t.codigo_lancamento]?.estado !== 'ok')
  const soma = sel.reduce((a, t) => a + t.valor_aberto, 0)
  const somaJuros = sel.reduce((a, t) => a + jurosDe(t), 0)
  const semCc = sel.filter((t) => !ccDe(t))
  const alternar = (cod: number) => setMarcadas((m) => { const n = new Set(m); if (n.has(cod)) n.delete(cod); else n.add(cod); return n })
  const marcarTodas = (lista: Conta[], on: boolean) => setMarcadas((m) => { const n = new Set(m); lista.forEach((t) => (on ? n.add(t.codigo_lancamento) : n.delete(t.codigo_lancamento))); return n })

  const finalizar = async () => {
    if (!sel.length) return
    if (semCc.length) { alert(`Escolha a conta corrente: ${semCc.length} conta(s) sem conta corrente no Omie.`); return }
    const ok = confirm(`Dar baixa no Omie de ${sel.length} ${sel.length === 1 ? 'conta' : 'contas'} de ${cliente.nome}?\n\n`
      + `Em aberto: ${brl(soma)}\nJuros: ${brl(somaJuros)}\nTotal ${receber ? 'recebido' : 'pago'}: ${brl(soma + somaJuros)}\nData: ${dataBR(data)}`)
    if (!ok) return
    setRodando(true)
    let baixou = false
    // uma de cada vez: o Omie não gosta de rajada
    for (const t of sel) {
      setSituacao((s) => ({ ...s, [t.codigo_lancamento]: { estado: 'baixando' } }))
      const juros = jurosDe(t)
      try {
        const r = await fetchAuth('/api/ajustes/contas/baixar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conta: t.conta_omie, tipo: t.tipo, codigoLancamento: t.codigo_lancamento, codigoContaCorrente: ccDe(t),
            valor: dinheiro(t.valor_aberto), data, juros, multa: 0, desconto: 0,
            observacao: `Baixa pelo Caixa do portal${juros ? ` · juros ${taxa.toLocaleString('pt-BR')}% a.m. (${atrasoEm(t)} dias)` : ''}`,
          }),
        })
        const d = await r.json().catch(() => ({}))
        if (d.ok) { baixou = true; setSituacao((s) => ({ ...s, [t.codigo_lancamento]: { estado: 'ok' } })) }
        else setSituacao((s) => ({ ...s, [t.codigo_lancamento]: { estado: 'erro', msg: d.erro || `erro ${r.status}` } }))
      } catch (e) {
        setSituacao((s) => ({ ...s, [t.codigo_lancamento]: { estado: 'erro', msg: (e as Error).message } }))
      }
    }
    setRodando(false)
    if (baixou) onBaixou()
  }

  const linha = (t: Conta) => {
    const s = situacao[t.codigo_lancamento]
    const j = jurosDe(t)
    const on = marcadas.has(t.codigo_lancamento)
    const dias = atrasoEm(t)
    return (
      <tr key={t.codigo_lancamento} className={s?.estado === 'ok' ? 'cc-feita' : on ? 'cc-on' : ''}>
        <td style={{ width: 34 }}><input type="checkbox" checked={on && s?.estado !== 'ok'} disabled={rodando || s?.estado === 'ok'} onChange={() => alternar(t.codigo_lancamento)} aria-label={`Marcar conta ${t.numero_documento_fiscal || t.numero_documento || t.codigo_lancamento}`} /></td>
        <td>{empresa(t.conta_omie)}</td>
        <td><Documento nf={t.numero_documento_fiscal} doc={t.numero_documento} parcela={t.numero_parcela} /><small className="cc-cat">{t.descricao_categoria || ''}</small></td>
        <td>{dataBR(t.data_vencimento)}{dias > 0 ? <small className="cc-atraso">{dias} {dias === 1 ? 'dia' : 'dias'}</small> : <small className="cx-apagado">a vencer</small>}</td>
        <td style={{ textAlign: 'right' }}>{brl(t.valor_aberto)}{t.parcial && <small className="cx-apagado">pago {brl(t.valor_pago)}</small>}</td>
        {receber && <td style={{ textAlign: 'right', color: j ? '#b45309' : undefined }}>{j ? `+ ${brl(j)}` : '—'}</td>}
        <td style={{ textAlign: 'right', fontWeight: 500 }}>{brl(t.valor_aberto + j)}</td>
        {podeBaixar && <td className="cc-cc">{nomeCc(t.conta_omie, ccDe(t))}</td>}
        <td className="cc-sit">
          {s?.estado === 'baixando' && <span className="cx-apagado"><i className="fa-solid fa-circle-notch fa-spin" /> baixando…</span>}
          {s?.estado === 'ok' && <span style={{ color: COR.receber }}><i className="fa-solid fa-check" /> baixada</span>}
          {s?.estado === 'erro' && <span style={{ color: COR.pagar }} title={s.msg}><i className="fa-solid fa-triangle-exclamation" /> {s.msg}</span>}
        </td>
      </tr>
    )
  }

  const tabela = (titulo: string, lista: Conta[]) => lista.length > 0 && (
    <div className="cc-bloco">
      <div className="cc-bloco-cab">
        <span>{titulo} <span className="cx-apagado">· {lista.length}</span></span>
        {!rodando && <button type="button" className="cx-link" onClick={() => marcarTodas(lista, !lista.every((t) => marcadas.has(t.codigo_lancamento)))}>{lista.every((t) => marcadas.has(t.codigo_lancamento)) ? 'Desmarcar todas' : 'Marcar todas'}</button>}
      </div>
      <div className="cx-rola">
        <table className="cx-tab" style={{ minWidth: 760 }}>
          <thead><tr><th /><th>Empresa</th><th>Documento</th><th>Vencimento</th><th style={{ textAlign: 'right' }}>Em aberto</th>{receber && <th style={{ textAlign: 'right' }}>Juros</th>}<th style={{ textAlign: 'right' }}>Total</th>{podeBaixar && <th>Conta corrente</th>}<th /></tr></thead>
          <tbody>{lista.map(linha)}</tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="cc-fundo" onClick={() => !rodando && onFechar()}>
      <style>{ESTILO}</style>
      <div className="cc-janela" role="dialog" aria-modal="true" aria-label={`Contas de ${cliente.nome}`} onClick={(e) => e.stopPropagation()}>
        <div className="cc-cab">
          <div style={{ minWidth: 0 }}>
            <div className="cc-nome">{cliente.nome}</div>
            <div className="cx-apagado" style={{ fontSize: 14.5 }}>{[cliente.documento, cliente.telefone].filter(Boolean).join(' · ') || 'sem CPF/CNPJ no cadastro'}</div>
          </div>
          <button type="button" className="cx-seta" onClick={onFechar} disabled={rodando} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
        </div>

        <div className="cc-corpo">
          {erro && <div className="cx-erro">{erro}</div>}
          {!contas && !erro && <div className="cx-vazio">Buscando todas as contas em aberto…</div>}
          {contas && contas.length === 0 && <div className="cx-vazio">Nenhuma conta em aberto</div>}
          {contas && contas.length > 0 && (
            <>
              <div className="cc-opcoes">
                <label className="cx-campo">{receber ? 'Recebido em' : 'Pago em'} <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value || hoje)} disabled={rodando} style={{ width: 150 }} /></label>
                {receber && (
                  <div className="cx-seg" role="group" aria-label="Juros">
                    <button type="button" aria-pressed={cobrarJuros} className={cobrarJuros ? 'cx-seg-on' : ''} onClick={() => setCobrarJuros(true)} disabled={rodando}>Com juros de {taxa.toLocaleString('pt-BR')}% ao mês</button>
                    <button type="button" aria-pressed={!cobrarJuros} className={!cobrarJuros ? 'cx-seg-on' : ''} onClick={() => setCobrarJuros(false)} disabled={rodando}>Sem juros</button>
                  </div>
                )}
                {podeBaixar && empresas.map((e) => (
                  <label key={e} className="cx-campo">Conta corrente {empresa(e)}
                    <select value={ccEscolhida[e] || ''} onChange={(ev) => setCcEscolhida((x) => ({ ...x, [e]: ev.target.value }))} disabled={rodando} style={{ border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', maxWidth: 240 }}>
                      <option value="">a de cada conta no Omie</option>
                      {(ccs[e] || []).map((c) => <option key={String(c.codigo)} value={String(c.codigo)}>{c.descricao}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {tabela('Vencidas', vencidas)}
              {tabela('Ainda vão vencer', aVencer)}
            </>
          )}
        </div>

        <div className="cc-rodape">
          <div className="cc-somas">
            <span>{sel.length} {sel.length === 1 ? 'conta marcada' : 'contas marcadas'}</span>
            <span>Em aberto <b>{brl(soma)}</b></span>
            {receber && <span>Juros <b style={{ color: '#b45309' }}>{brl(somaJuros)}</b></span>}
            <span>Total <b style={{ color: receber ? COR.receber : COR.pagar }}>{brl(soma + somaJuros)}</b></span>
          </div>
          <div className="cx-grupo">
            {receber && sel.length > 0 && <button type="button" className="cx-chip" onClick={() => navigator.clipboard.writeText(textoCobranca(cliente, sel, jurosDe, atrasoEm, taxa, data)).catch(() => alert('Não deu para copiar.'))}><i className="fa-solid fa-copy" /> Copiar cobrança</button>}
            {podeBaixar
              ? <button type="button" className="cc-finalizar" onClick={finalizar} disabled={rodando || !sel.length}>{rodando ? 'Dando baixa…' : `Finalizar ${sel.length || ''} no Omie`}</button>
              : <span className="cx-apagado" style={{ fontSize: 14 }}>Para dar baixa, peça a permissão Ajustes › Baixar contas</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function textoCobranca(c: ClienteAberto, lista: Conta[], jurosDe: (t: Conta) => number, atrasoEm: (t: Conta) => number, taxa: number, data: string) {
  const linhas = lista.map((t) => {
    const j = jurosDe(t), d = atrasoEm(t)
    const doc = t.numero_documento_fiscal ? `NF ${semZeros(t.numero_documento_fiscal)}` : t.numero_documento || 'Documento'
    const parc = t.numero_parcela && t.numero_parcela !== '001/001' ? ` parc. ${t.numero_parcela}` : ''
    return `• ${doc}${parc} — vence${d > 0 ? 'u' : ''} ${dataBR(t.data_vencimento)}${d > 0 ? ` (${d} ${d === 1 ? 'dia' : 'dias'})` : ''}: ${brl(t.valor_aberto)}${j ? ` + juros ${brl(j)} = ${brl(t.valor_aberto + j)}` : ''}`
  })
  const soma = lista.reduce((a, t) => a + t.valor_aberto, 0), juros = lista.reduce((a, t) => a + jurosDe(t), 0)
  return [`${c.nome}${c.documento ? ` — ${c.documento}` : ''}`, '', ...linhas, '', `Total em aberto: ${brl(soma)}`,
    ...(juros ? [`Juros (${taxa.toLocaleString('pt-BR')}% ao mês, proporcional aos dias): ${brl(juros)}`] : []),
    `Total atualizado em ${dataBR(data)}: ${brl(soma + juros)}`].join('\n')
}

const ESTILO = `
.cc-fundo { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(15, 23, 42, .45) }
.cc-janela { display: flex; flex-direction: column; width: min(1240px, 100%); max-height: calc(100vh - 40px); background: var(--surface, #fefefe); border-radius: 18px; box-shadow: 0 24px 60px rgba(15, 23, 42, .3); overflow: hidden }
.cc-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--border, #e2e8f0) }
.cc-nome { font-size: 20px; font-weight: 500 }
.cc-corpo { flex: 1; overflow-y: auto; padding: 16px 22px; display: flex; flex-direction: column; gap: 16px }
.cc-opcoes { display: flex; flex-wrap: wrap; gap: 10px; align-items: center }
.cc-bloco { flex-shrink: 0; border: 1px solid var(--border, #e2e8f0); border-radius: 14px; overflow: hidden }
.cc-bloco-cab { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; font-size: 16px; font-weight: 500; background: var(--portal-bg-secondary, #f8fafc); border-bottom: 1px solid var(--border, #e2e8f0) }
.cc-bloco .cx-tab td small { display: block; font-size: 13px }
.cc-cat { color: var(--portal-text-muted, #64748b); white-space: normal }
.cc-atraso { color: #b45309 }
.cc-on { background: color-mix(in srgb, #2563eb 5%, var(--surface, #fefefe)) }
.cc-feita { opacity: .55 }
.cc-cc { font-size: 14px; color: var(--portal-text-secondary, #475569); max-width: 200px; white-space: normal !important }
.cc-sit { font-size: 14px; max-width: 220px; white-space: normal !important }
.cc-rodape { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 22px; border-top: 1px solid var(--border, #e2e8f0); background: var(--portal-bg-secondary, #f8fafc) }
.cc-somas { display: flex; gap: 22px; flex-wrap: wrap; font-size: 15.5px; color: var(--portal-text-secondary, #475569) }
.cc-somas b { margin-left: 4px; font-size: 18px; font-weight: 500; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums }
.cc-finalizar { padding: 10px 20px; border: none; border-radius: 12px; background: #059669; color: #fefefe; font-size: 16px; font-weight: 500; cursor: pointer; transition: background .2s }
.cc-finalizar:hover:not(:disabled) { background: #047857 }
.cc-finalizar:disabled { opacity: .5; cursor: default }
`
