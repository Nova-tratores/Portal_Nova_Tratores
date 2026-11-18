'use client'
// Peças na tela do diretor (/empresa). José, 12/11/2026: "agora as peças, coisas parecidas com o Comercial e o Pós-Vendas".
// Mesmo jeito: cartões por assunto, cada um abre em tela cheia. Dados: /api/empresa/pecas (gravado em empresa_painel;
// conta em src/lib/empresa/pecas.ts). O Faturamento é igual ao da Gestão Pós-Vendas: ./pecas-periodo.tsx (18/11/2026).
import { useState, type ReactNode } from 'react'
import type { DadosPecas } from '@/lib/empresa/pecas'
import type { LinhasDre } from '@/lib/empresa/dre-gerencial'
import { compacto, brl, nomeMes, mesCurto, contaMes } from './comercial'
import { TelaCheia, Secao } from './comercial-assuntos'
import { useJson } from './comercial-telas'
import { TelaDespesasNova } from './comercial-despesas'
import { dataBR, type ItemOficina } from './posvendas'
import { useEstadoUrl } from './url-estado'
import { FaturamentoPecas } from './pecas-periodo'

const margem = (venda: number, custo: number) => (venda > 0 ? Math.round(((venda - custo) / venda) * 100) : null)

type TelaPc = 'fat' | 'est' | 'desp' | 'ate'
export function PainelPecas({ dreG, atencao }: { dreG: Array<{ mes: string; parcial?: boolean; setores: object }> | null; atencao: ItemOficina[] }) {
  const { d, erro } = useJson<DadosPecas>('/api/empresa/pecas')
  // ?tela= no endereço com passo no histórico: link/recarregar reabre e o "voltar" do celular fecha (auditoria 16/11)
  const [tela, setTela] = useEstadoUrl<TelaPc>('tela', ['fat', 'est', 'desp', 'ate'])
  const fechar = () => setTela(null)
  const m = d?.meses[d.meses.length - 1], ult6 = d?.meses.slice(-6) || []
  const max6 = Math.max(1, ...ult6.map((x) => x.venda))
  const g = dreG?.[dreG.length - 1], lp = (g?.setores as Record<string, LinhasDre> | undefined)?.pecas, x0 = lp ? contaMes(lp) : null
  // faturado = venda de peças (o mesmo do cartão Faturamento), gastos do DRE — José, 16/11 (antes: receita do DRE do Omie)
  const fatMes: Record<string, number> = Object.fromEntries((d?.meses || []).map((q) => [q.mes, q.venda]))
  const x = x0 && g && fatMes[g.mes] != null ? { ...x0, faturou: fatMes[g.mes], resultado: fatMes[g.mes] - x0.gastou } : x0
  const velho = d ? d.estoque.faixas.slice(2).reduce((a, f) => a + f.valor, 0) : 0
  const cartao = (t: TelaPc, cor: string, ic: string, nome: string, num: string, linha: ReactNode, extraEl?: ReactNode, cls = '') => (
    <button className={`cml-card ${cls}`} style={{ ['--c' as string]: cor }} onClick={() => setTela(t)}>
      <span className="cml-cab"><span className="pf-ic"><i className={`fas ${ic}`} /></span><span className="cml-nome">{nome}</span><i className="fas fa-arrow-right cml-seta" /></span>
      <span className="cml-num">{num}</span>
      <span className="cml-linha">{linha}</span>
      {extraEl}
    </button>
  )
  return (
    <div className="pf cml">
      {erro && <div className="cm-aviso">{erro}</div>}
      <div className="cml-grade">
        {cartao('fat', '#ea580c', 'fa-sack-dollar', 'Faturamento', m ? compacto(m.venda) : '—',
          m ? <>vendeu em {nomeMes(m.mes)} até hoje{margem(m.venda, m.custo) != null ? <> · margem de <b>{margem(m.venda, m.custo)}%</b></> : null}</> : erro ? '' : 'carregando…',
          ult6.length ? (
            <span className="cml-mini">{ult6.map((q) => (
              <span key={q.mes} className={q.mes === m?.mes ? 'on' : ''}><span style={{ height: `${(q.venda / max6) * 100}%` }} /><small>{mesCurto(q.mes)}</small></span>
            ))}</span>
          ) : null, 'cml-g')}
        {cartao('est', '#15803d', 'fa-boxes-stacked', 'Estoque de peças', d ? compacto(d.estoque.valor) : '—',
          d ? <>{d.estoque.itens.toLocaleString('pt-BR')} códigos no estoque ·<b>{compacto(velho)}</b> sem vender há mais de 1 ano</> : erro ? '' : 'carregando…')}
        {cartao('desp', '#be123c', 'fa-receipt', 'Custos e despesas', x ? compacto(x.gastou) : '—',
          x ? <>{x.resultado >= 0 ? <>sobrou <b style={{ color: '#15803d' }}>{compacto(x.resultado)}</b></> : <>faltou <b style={{ color: '#be123c' }}>{compacto(-x.resultado)}</b></>} no mês</> : 'carregando o DRE…')}
        {cartao('ate', '#d97706', 'fa-file-invoice', 'Pedidos em aberto', atencao[0] ? String(atencao[0].n) : '—',
          atencao[0] ? <>{atencao[0].nome.toLowerCase()}{atencao[0].valor ? <> · <b>{compacto(atencao[0].valor)}</b></> : null}{atencao.length > 1 ? <><br />{atencao.slice(1).map((a) => `${a.n} ${a.nome.toLowerCase()}`).join(' · ')}</> : null}</> : 'carregando…', null, 'cpv-oficina')}
      </div>
      {tela === 'fat' && d && <TelaCheia titulo="Faturamento de Peças" sub="balcão, oficina e revisões" onFechar={fechar}><FaturamentoPecas dados={d} /></TelaCheia>}
      {tela === 'est' && d && <TelaCheia titulo="Estoque de peças" sub="pelo preço de custo, e há quanto tempo cada peça não vende" onFechar={fechar}><EstoquePecas d={d} /></TelaCheia>}
      {tela === 'desp' && <TelaDespesasNova mesesBase={dreG || []} setor="pecas" onFechar={fechar} faturouPorMes={d ? fatMes : undefined} />}
      {tela === 'ate' && (
        <TelaCheia titulo="Pedidos em aberto e atenção" sub="do Planta Viva · clique para ver a lista" onFechar={fechar}>
          <div className="cpv-kpis">
            {atencao.map((o) => (
              <button key={o.id} className="cmt-kpi cmt-kpi-bt" onClick={() => { fechar(); o.onClick() }}>
                <small>{o.nome}</small><b style={{ color: o.n ? '#d97706' : '#16a34a' }}>{o.n}</b><em>{o.valor ? `${compacto(o.valor)} · ` : ''}ver a lista <i className="fas fa-arrow-right" /></em>
              </button>
            ))}
          </div>
        </TelaCheia>
      )}
      {tela && (tela === 'fat' || tela === 'est') && !d && <TelaCheia titulo="Peças" onFechar={fechar}><div className="cma-vazio">{erro || 'Carregando…'}</div></TelaCheia>}
    </div>
  )
}

// ── FATURAMENTO ──────────────────────────────────────────────────────────────
// igual ao da Gestão Pós-Vendas: está em ./pecas-periodo.tsx (FaturamentoPecas)


// ── ESTOQUE ──────────────────────────────────────────────────────────────────
const COR_FAIXA = ['#16a34a', '#f59e0b', '#ea580c', '#dc2626']
function EstoquePecas({ d }: { d: DadosPecas }) {
  const [faixa, setFaixa] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const dias = (u: string | null) => (u ? Math.round((Date.parse(d.hoje) - Date.parse(u)) / 86_400_000) : null)
  const naFaixa = (u: string | null, i: number) => { const x = dias(u); return i === 1 ? x != null && x > 90 && x <= 365 : i === 2 ? x != null && x > 365 : i === 3 ? x == null : x != null && x <= 90 }
  const q = busca.trim().toLowerCase()
  const lista = d.estoque.paradas.filter((p) => (faixa == null || naFaixa(p.ultimaVenda, faixa)) && (!q || `${p.codigo} ${p.descricao}`.toLowerCase().includes(q)))
  const parado = d.estoque.faixas.slice(1).reduce((a, f) => a + f.valor, 0)
  return (
    <div className="cpv-corpo">
      <span className="cpv-frase">Tem <b>{compacto(d.estoque.valor)}</b> em peças no estoque ({d.estoque.itens.toLocaleString('pt-BR')} códigos), pelo custo. Desse total, <b>{compacto(parado)}</b> ({d.estoque.valor ? Math.round((parado / d.estoque.valor) * 100) : 0}%) não vende há mais de 3 meses.</span>
      <div className="cpv-kpis">
        {d.estoque.faixas.map((f, i) => (
          <button key={f.nome} className={`cmt-kpi cmt-kpi-bt${faixa === i ? ' cpc-on' : ''}`} onClick={() => setFaixa(faixa === i ? null : i)} disabled={i === 0}>
            <small><i className="cdp-dot" style={{ background: COR_FAIXA[i] }} />{f.nome}</small><b>{compacto(f.valor)}</b><em>{f.itens.toLocaleString('pt-BR')} peças · {d.estoque.valor ? Math.round((f.valor / d.estoque.valor) * 100) : 0}% do estoque</em>
          </button>
        ))}
      </div>
      <div className="cpc-barra">{d.estoque.faixas.map((f, i) => <span key={f.nome} style={{ flex: f.valor, background: COR_FAIXA[i] }} title={`${f.nome}: ${brl(f.valor)}`} />)}</div>
      <Secao titulo="Peças paradas" sub="as de maior valor sem vender há mais de 3 meses · clique nas faixas acima para filtrar">
        <div className="cpf-ferr"><input className="cpf-busca" placeholder="Buscar código ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div className="cmt-tab-wrap"><table className="cmt-tab cpv-tab">
          <thead><tr><th>Peça</th><th>Última venda</th><th>Estoque</th><th>Custo un.</th><th>Valor parado</th></tr></thead>
          <tbody>{lista.map((p) => {
            const x = dias(p.ultimaVenda)
            return (
              <tr key={`${p.conta}-${p.codigo}`}>
                <td>{p.descricao}<small>{p.codigo}{p.conta === 'CASTRO' ? ' · Castro' : ''}</small></td>
                <td style={{ textAlign: 'left' }}>{p.ultimaVenda ? <>{dataBR(p.ultimaVenda)}<small style={{ color: x != null && x > 365 ? '#dc2626' : '#d97706' }}>há {x} dias</small></> : <small style={{ color: '#dc2626' }}>não vendeu desde {Number(d.hoje.slice(0, 4)) - 3}</small>}</td>
                <td className="val">{p.estoque.toLocaleString('pt-BR')}</td>
                <td className="val">{brl(p.cmc)}</td>
                <td className="val"><b>{brl(p.valor)}</b></td>
              </tr>
            )
          })}</tbody>
        </table></div>
        {!lista.length && <div className="ce-mudo">Nenhuma peça com esse filtro.</div>}
      </Secao>
      <p className="cma-nota">Valor = estoque × custo médio (CMC). Última venda = última nota de peça desde {Number(d.hoje.slice(0, 4)) - 3}. A lista mostra as 300 peças paradas de maior valor.</p>
    </div>
  )
}

export const CSS_CPC = `
.ce .cpc-mais{margin-top:8px;font-size:13.5px;color:#c2410c;cursor:pointer;font-family:inherit}
.cpc-abas{display:flex;flex-wrap:wrap;gap:8px;padding:12px 24px;border-bottom:1px solid #f1f5f9;background:#fefefe}
.ce .cpc-abas button{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border:1px solid #fed7aa;border-radius:12px;background:#fff7ed;color:#9a3412;font-family:inherit;font-size:14.5px;cursor:pointer;white-space:nowrap}
.ce .cpc-abas button:hover{border-color:#fb923c}
.ce .cpc-abas button.on{background:#ea580c;border-color:#ea580c;color:#fff}
.ce .cpc-link{font-size:13px;color:#c2410c;cursor:pointer;font-family:inherit}
.ce button.cmt-kpi.cpc-topo{border-color:#fdba74;background:#fff7ed}
.cpc-leg{display:flex;flex-wrap:wrap;gap:18px;font-size:14px;color:#334155}
.cpc-leg i{display:inline-block;width:12px;height:12px;border-radius:4px;margin-right:6px;vertical-align:-1px}
.cpc-leg b{font-weight:600;color:#0f172a}
.cpc-comp{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:6px;height:200px}
.ce .cpc-comp-col{display:flex;flex-direction:column;align-items:center;gap:4px;border-radius:12px;padding:6px 2px;cursor:pointer;font-family:inherit}
.ce .cpc-comp-col:hover{background:#f8fafc}
.ce .cpc-comp-col.on{background:#fff7ed;box-shadow:inset 0 0 0 1px #fdba74}
.cpc-comp-barras{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:3px}
.cpc-comp-barras span{width:min(14px,40%);border-radius:4px 4px 1px 1px;min-height:1px}
.cpc-comp-col small{font-size:11.5px;color:#475569}
.cpv-tab td small{display:block}
.ce button.cmt-kpi.cpc-on{border-color:#0f172a;box-shadow:inset 0 0 0 1px #0f172a}
.ce .cpc-ped-l{grid-template-columns:170px minmax(200px,1fr) 90px 120px 14px}
.ce .cpc-it{grid-template-columns:1fr auto auto 100px}
.cpc-barra{display:flex;height:14px;border-radius:99px;overflow:hidden;gap:2px}
.cpc-barra span{display:block;min-width:2px}
@media (max-width:900px){.ce .cpc-ped-l{grid-template-columns:1fr auto 14px}.ce .cpc-it{grid-template-columns:1fr 90px}.cpc-it em{display:none}}
`
