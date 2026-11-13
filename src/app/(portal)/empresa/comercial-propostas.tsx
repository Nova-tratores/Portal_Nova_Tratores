'use client'
// Janela de PROPOSTAS do Comercial (/empresa → Máquinas → "Propostas em aberto"). José, 12/11: PDF da proposta,
// filtro pelos vendedores e a fase mostrada de um jeito melhor. A trilha da fase (FaseTrilha) é a mesma em todas
// as listas de propostas do /empresa ("o que muda em um, muda em todos").
import { useMemo, useState } from 'react'
import type { PropostaCm } from '@/lib/empresa/comercial'
import { compacto, brl, plural, somar } from './comercial'
import { PdfProposta } from './comercial-assuntos'

// as etapas, na ordem do caminho de uma proposta
export const ETAPAS = [
  { k: 'enviar', nome: 'Enviar proposta', curto: 'Enviar', cor: '#64748b', ic: 'fa-paper-plane' },
  { k: 'banco', nome: 'Esperando o banco', curto: 'Banco', cor: '#d97706', ic: 'fa-building-columns' },
  { k: 'cliente', nome: 'Esperando o cliente', curto: 'Cliente', cor: '#2563eb', ic: 'fa-user-clock' },
  { k: 'vendida', nome: 'Virou venda', curto: 'Vendida', cor: '#16a34a', ic: 'fa-circle-check' },
  { k: 'perdida', nome: 'Não vendemos', curto: 'Não vendida', cor: '#dc2626', ic: 'fa-circle-xmark' },
] as const
export type Etapa = (typeof ETAPAS)[number]['k']
export function etapaDe(p: PropostaCm): Etapa {
  if (p.vendida) return 'vendida'
  if (p.perdida) return 'perdida'
  const f = p.fase.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return /banco/.test(f) ? 'banco' : /enviar/.test(f) ? 'enviar' : 'cliente'
}

/** a fase de uma proposta: 3 bolinhas do caminho (enviar → banco → cliente) + o fim, e há quanto tempo está ali */
export function FaseTrilha({ p }: { p: PropostaCm }) {
  const e = etapaDe(p), et = ETAPAS.find((x) => x.k === e)!
  const passo = e === 'enviar' ? 0 : e === 'banco' ? 1 : e === 'cliente' ? 2 : 3
  return (
    <span className="cpf-trilha">
      <span className="cpf-pontos">
        {[0, 1, 2, 3].map((i) => <i key={i} className={i < passo ? 'feito' : i === passo ? 'agora' : ''} style={i <= passo ? { background: et.cor } : undefined} />)}
      </span>
      <span className="cpf-txt"><b style={{ color: et.cor }}>{et.nome}</b>
        {p.aberta ? <small className={p.diasNaFase > 30 ? 'velha' : ''}>{p.diasNaFase === 0 ? 'entrou hoje' : `há ${plural(p.diasNaFase, 'dia', 'dias')}`}{p.diasNaFase > 30 ? ' · parada' : ''}</small>
          : p.perdida && p.motivoPerda ? <small>{p.motivoPerda}</small> : p.fechadaEm ? <small>{new Date(p.fechadaEm).toLocaleDateString('pt-BR')}</small> : null}
      </span>
    </span>
  )
}

export function JanelaPropostas({ propostas, onFechar }: { propostas: PropostaCm[]; onFechar: () => void }) {
  const [etapa, setEtapa] = useState<Etapa | 'abertas'>('abertas')
  const [vends, setVends] = useState<string[]>([]) // vazio = todos
  const [paradas, setParadas] = useState(false)
  const [busca, setBusca] = useState('')
  const [pdf, setPdf] = useState<number | null>(null)
  const nomeV = (p: PropostaCm) => p.vendedor || 'Sem vendedor'
  const doVend = useMemo(() => propostas.filter((p) => !vends.length || vends.includes(nomeV(p))), [propostas, vends])
  const vendedores = useMemo(() => {
    const m = new Map<string, { n: number; v: number }>()
    for (const p of propostas.filter((q) => q.aberta)) { const x = m.get(nomeV(p)) || { n: 0, v: 0 }; x.n++; x.v += p.valor; m.set(nomeV(p), x) }
    for (const p of propostas) if (!m.has(nomeV(p))) m.set(nomeV(p), { n: 0, v: 0 })
    return [...m.entries()].sort((a, b) => (a[0] === 'Sem vendedor' ? 1 : b[0] === 'Sem vendedor' ? -1 : b[1].v - a[1].v))
  }, [propostas])
  const abertas = doVend.filter((p) => p.aberta)
  const fechadas = doVend.filter((p) => p.vendida || p.perdida)
  const vend = fechadas.filter((p) => p.vendida).length
  const q = busca.trim().toLowerCase()
  const lista = doVend
    .filter((p) => (etapa === 'abertas' ? p.aberta : etapaDe(p) === etapa))
    .filter((p) => !paradas || (p.aberta && p.diasNaFase > 30))
    .filter((p) => !q || `${p.cliente} ${p.equipamento} ${p.cidade}`.toLowerCase().includes(q))
    .sort((a, b) => b.valor - a.valor)
  const trocaV = (n: string) => setVends((v) => (v.includes(n) ? v.filter((x) => x !== n) : [...v, n]))
  return (
    <div className="cmw-fundo cml-janela-fundo cmp-fundo" onClick={onFechar}>
      <div className="cml-janela cmp-janela" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>Propostas</h3><span>{plural(abertas.length, 'aberta', 'abertas')} · {compacto(somar(abertas))}{fechadas.length ? ` · ${Math.round((vend / fechadas.length) * 100)}% das que fecharam viraram venda` : ''}</span><button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        <div className="cml-janela-corpo cpf-corpo">
          {/* vendedores: clique para escolher um ou vários */}
          <div className="cpf-vends">
            <button className={!vends.length ? 'on' : ''} onClick={() => setVends([])}>Todos</button>
            {vendedores.map(([n, x]) => (
              <button key={n} className={vends.includes(n) ? 'on' : ''} onClick={() => trocaV(n)}>
                {n.split(' ').slice(0, 2).join(' ')}<small>{x.n ? `${x.n} · ${compacto(x.v)}` : 'nenhuma aberta'}</small>
              </button>
            ))}
          </div>

          {/* o caminho: cada etapa é um botão com quantas propostas e quanto vale */}
          <div className="cpf-caminho">
            {ETAPAS.map((e, i) => {
              const l = doVend.filter((p) => etapaDe(p) === e.k)
              const par = l.filter((p) => p.aberta && p.diasNaFase > 30).length
              return (
                <button key={e.k} className={`cpf-etapa${etapa === e.k ? ' on' : ''}${i === 3 ? ' fim' : ''}`} onClick={() => setEtapa(etapa === e.k ? 'abertas' : e.k)} style={etapa === e.k ? { borderColor: e.cor, background: `${e.cor}0f` } : undefined}>
                  <span className="cpf-etapa-ic" style={{ color: e.cor, background: `${e.cor}17` }}><i className={`fas ${e.ic}`} /></span>
                  <span className="cpf-etapa-t"><small>{e.nome}</small><b>{l.length}</b><em>{compacto(somar(l))}{par ? <> · <span className="velha">{par} paradas</span></> : null}</em></span>
                  {i < 2 && <i className="fas fa-chevron-right cpf-seta" />}
                </button>
              )
            })}
          </div>

          <div className="cpf-ferr">
            <span className="cpf-mostra">{etapa === 'abertas' ? 'Todas as abertas' : ETAPAS.find((e) => e.k === etapa)!.nome}{etapa !== 'abertas' && <button onClick={() => setEtapa('abertas')}>ver todas as abertas</button>}</span>
            {etapa !== 'vendida' && etapa !== 'perdida' && <label className="cdp-comp"><input type="checkbox" checked={paradas} onChange={(e) => setParadas(e.target.checked)} /> só as paradas há mais de 30 dias</label>}
            <input className="cpf-busca" placeholder="Buscar cliente, máquina ou cidade" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          <div className="cpf-lista">
            {lista.map((p) => (
              <button key={p.id} className="cpf-l" onClick={() => setPdf(p.id)}>
                <span className="cpf-cli">{p.cliente || '(sem nome)'}<small>{[p.equipamento, p.cidade].filter(Boolean).join(' · ')}</small></span>
                <FaseTrilha p={p} />
                <span className="cpf-vend">{p.vendedor ? p.vendedor.split(' ').slice(0, 2).join(' ') : <em>sem vendedor</em>}</span>
                <b>{brl(p.valor)}</b>
                <span className="cpf-pdf"><i className="fas fa-file-pdf" /> PDF</span>
              </button>
            ))}
            {!lista.length && <div className="ce-mudo">Nenhuma proposta com esse filtro.</div>}
          </div>
          <p className="cma-nota">Clique numa proposta para ver o PDF. Nos vendedores dá para marcar mais de um.</p>
        </div>
      </div>
      {pdf != null && <PdfProposta id={pdf} onFechar={() => setPdf(null)} />}
    </div>
  )
}

export const CSS_CPF = `
.cpf-corpo{display:flex;flex-direction:column;gap:14px}
.cpf-vends{display:flex;flex-wrap:wrap;gap:8px}
.ce .cpf-vends button{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:8px 14px;border:1px solid #e2e8f0;border-radius:14px;background:#fefefe;font-family:inherit;font-size:14px;color:#0f172a;cursor:pointer;text-align:left}
.ce .cpf-vends button small{font-size:11.5px;color:#64748b}
.ce .cpf-vends button:hover{border-color:#94a3b8}
.ce .cpf-vends button.on{background:#0f172a;border-color:#0f172a;color:#fefefe}
.ce .cpf-vends button.on small{color:#cbd5e1}
.cpf-caminho{display:grid;grid-template-columns:repeat(3,1fr) .85fr .85fr;gap:10px}
.ce .cpf-etapa{position:relative;display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #e2e8f0;border-radius:16px;background:#fefefe;cursor:pointer;text-align:left;font-family:inherit}
.ce .cpf-etapa:hover{border-color:#94a3b8}
.ce .cpf-etapa.fim{background:#f8fafc}
.cpf-etapa-ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:16px;flex:none}
.cpf-etapa-t{display:flex;flex-direction:column;min-width:0}
.cpf-etapa-t small{font-size:12.5px;color:#475569}
.cpf-etapa-t b{font-size:24px;font-weight:500;color:#0f172a;line-height:1.15}
.cpf-etapa-t em{font-style:normal;font-size:12px;color:#64748b}
.cpf-etapa-t .velha,.cpf-txt small.velha{color:#dc2626}
.cpf-seta{position:absolute;right:-9px;top:50%;transform:translateY(-50%);font-size:11px;color:#94a3b8;background:#fefefe;border-radius:99px;padding:3px;z-index:1}
.cpf-ferr{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.cpf-mostra{font-size:15px;font-weight:500;color:#0f172a;display:flex;align-items:center;gap:10px}
.ce .cpf-mostra button{font-size:12.5px;font-weight:400;color:#2563eb;cursor:pointer;font-family:inherit}
.cpf-busca{margin-left:auto;padding:8px 12px;border:1px solid #cbd5e1;border-radius:12px;font:inherit;font-size:14px;min-width:260px;background:#fefefe}
.cpf-lista{display:flex;flex-direction:column;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden}
.ce .cpf-l{display:grid;grid-template-columns:minmax(200px,1.4fr) minmax(200px,1fr) 140px 120px 56px;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid #f1f5f9;background:#fefefe;cursor:pointer;text-align:left;font-family:inherit;font-size:14.5px;color:#0f172a}
.ce .cpf-l:last-child{border-bottom:0}
.ce .cpf-l:hover{background:#f8fafc}
.cpf-cli{display:flex;flex-direction:column;min-width:0}
.cpf-cli small{font-size:12.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpf-l > b{font-weight:500;text-align:right;font-variant-numeric:tabular-nums}
.cpf-vend{font-size:13.5px;color:#334155}
.cpf-vend em{font-style:normal;color:#94a3b8}
.cpf-pdf{font-size:12.5px;color:#2563eb;white-space:nowrap}
.cpf-trilha{display:flex;align-items:center;gap:10px;min-width:0}
.cpf-pontos{display:flex;gap:3px;flex:none}
.cpf-pontos i{width:14px;height:6px;border-radius:99px;background:#e2e8f0}
.cpf-pontos i.feito{opacity:.45}
.cpf-txt{display:flex;flex-direction:column;min-width:0}
.cpf-txt b{font-size:13.5px;font-weight:600}
.cpf-txt small{font-size:12px;color:#64748b}
@media (max-width:900px){.cpf-caminho{grid-template-columns:1fr 1fr}.cpf-seta{display:none}.ce .cpf-l{grid-template-columns:1fr auto;gap:6px 10px}.cpf-l .cpf-trilha{grid-column:1/-1;order:3}.cpf-vend,.cpf-pdf{display:none}.cpf-busca{margin-left:0;min-width:0;width:100%}}
`
