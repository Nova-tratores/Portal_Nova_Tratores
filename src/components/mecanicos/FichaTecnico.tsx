'use client'
// Ficha completa do técnico (José, 19/10/2026): clicou no card → abre tudo dele num lugar só —
// comissão OS por OS (a mesma conta do painel do Omie/RH), OS, requisições, frota, ocorrências e RH.
// Dados: /api/mecanicos/tecnico (lib/mecanicos/ficha-server.ts). OS e requisição abrem em janela.
import { useEffect, useMemo, useState } from 'react'
import OSRelatorioJanela from './OSRelatorioJanela'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'
import { useVersaoAoVivo } from './useAoVivo'
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento'
import type { FichaTecnico as Ficha } from '@/lib/mecanicos/ficha-server'
import { IconeLiga } from './CartaLiga'
import { brl, brl2, horas, kmFmt, useContador } from './ui'

const MUDO = 'var(--portal-text-muted, #64748b)'
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const nomeMes = (m: string) => { const t = `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`; return t[0].toUpperCase() + t.slice(1) }
const ROTULO_GASTO: Record<string, string> = { abastecimento: 'Combustível', manutencao: 'Manutenção do carro', alimentacao: 'Alimentação', materiais: 'Materiais' }
const ROTULO_FERIAS: Record<string, string> = { em_aquisicao: 'ainda adquirindo', disponivel: 'pode tirar', vencido_dobro: 'vencida (paga em dobro)', vencido: 'vencida', gozado: 'tirada' }
const reqDoRef = (ref: string | null) => { const m = String(ref || '').match(/^req:(\d+)/); return m ? Number(m[1]) : null }
export const andarMes = (m: string, n: number) => { const [a, mm] = m.split('-').map(Number); const d = new Date(Date.UTC(a, mm - 1 + n, 1)); return d.toISOString().slice(0, 7) }
export const dataBR = (d: string | null | undefined) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '—')
export const diaBR = (d: string | null | undefined) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—')
export const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
export const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
export function tempoDeCasa(adm: string | null | undefined) {
  if (!adm) return null
  const [a, m] = adm.split('-').map(Number), [ha, hm] = hojeSP().split('-').map(Number)
  const meses = (ha - a) * 12 + (hm - m)
  return meses >= 12 ? `${Math.floor(meses / 12)} ano${meses >= 24 ? 's' : ''}${meses % 12 ? ` e ${meses % 12} ${meses % 12 > 1 ? 'meses' : 'mês'}` : ''}` : `${meses} ${meses === 1 ? 'mês' : 'meses'}`
}

export type Aba = 'resumo' | 'comissao' | 'os' | 'req' | 'frota' | 'oc' | 'rh'
const ABAS: { k: Aba; rot: string; ic: string }[] = [
  { k: 'resumo', rot: 'Resumo', ic: 'fa-user' }, { k: 'comissao', rot: 'Comissão', ic: 'fa-sack-dollar' }, { k: 'os', rot: 'Ordens de serviço', ic: 'fa-screwdriver-wrench' },
  { k: 'req', rot: 'Requisições', ic: 'fa-receipt' }, { k: 'frota', rot: 'Frota', ic: 'fa-car-side' }, { k: 'oc', rot: 'Ocorrências', ic: 'fa-shield-halved' }, { k: 'rh', rot: 'RH', ic: 'fa-id-card' },
]

const cache = new Map<string, Ficha>()

export default function FichaTecnico({ nome, foto, aba: abaInicial = 'resumo', onFechar, dadosIniciais }: { nome: string; foto?: string; aba?: Aba; onFechar: () => void; /** prévia/teste: dados prontos */ dadosIniciais?: Ficha }) {
  const [mes, setMes] = useState(() => dadosIniciais?.mes || hojeSP().slice(0, 7))
  const [aba, setAba] = useState<Aba>(abaInicial)
  const chave = `${nome}|${mes}`
  const [dados, setDados] = useState<Ficha | null>(() => (dadosIniciais && dadosIniciais.mes === mes ? dadosIniciais : cache.get(chave) || null))
  const [erro, setErro] = useState<string | null>(null)
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null)
  const [req, setReq] = useState<{ id: number; titulo: string } | null>(null)
  // OS do portal abre junto com o relatório do técnico (José, 29/10/2026)
  const [osRel, setOsRel] = useState<{ os: string; cliente?: string } | null>(null)

  useEffect(() => {
    let vivo = true
    const c = cache.get(chave)
    if (c) { setDados(c); return }
    setDados(null); setErro(null)
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/tecnico?nome=${encodeURIComponent(nome)}&mes=${mes}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Falha ao carregar a ficha')
        cache.set(chave, j)
        if (vivo) setDados(j)
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar a ficha') }
    })()
    return () => { vivo = false }
  }, [chave, nome, mes])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !doc && !req && !osRel) onFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onFechar, doc, req, osRel])

  const verOS = (os: string, cliente?: string) => {
    if (os.startsWith('OMIE ')) {
      const cod = dados?.codOmie?.[os.slice(5)]
      if (cod) setDoc({ titulo: `OS ${os.slice(5)} (Omie) · ${cliente || ''}`, url: `/api/clientes/print?tipo=os&cod=${cod}&empresa=${encodeURIComponent('Nova Tratores')}`, nome: `OS-${os.slice(5)}` })
    }
    else if (/^OS-\d+$/i.test(os)) setOsRel({ os, cliente })
    else setDoc({ titulo: `${os} · ${cliente || ''}`, url: `/api/pos/ordens/${encodeURIComponent(os)}/print`, nome: os })
  }
  const atual = mes >= hojeSP().slice(0, 7)
  const fotoUrl = dados?.foto || foto

  const tela = (
    <div className="ft-fundo" onClick={onFechar}>
      <style>{ESTILO_FT}</style>
      <div className="ft-jan" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Ficha de ${nome}`}>
        <header className="ft-cab">
          <div className="ft-foto">{/* eslint-disable-next-line @next/next/no-img-element */}{fotoUrl ? <img src={fotoUrl} alt={nome} /> : <span>{iniciais(nome)}</span>}</div>
          <div className="ft-id">
            <h2>{nome}</h2>
            <p>{[dados?.rh?.cargo, dados?.rh?.admissao ? `na empresa há ${tempoDeCasa(dados.rh.admissao)}` : null, dados?.rh?.cidade].filter(Boolean).join(' · ') || ' '}</p>
            <div className="ft-mes">
              <button type="button" onClick={() => setMes((m) => andarMes(m, -1))} aria-label="Mês anterior"><i className="fas fa-chevron-left" /></button>
              <b>{nomeMes(mes)}</b>
              <button type="button" disabled={atual} onClick={() => setMes((m) => andarMes(m, 1))} aria-label="Próximo mês"><i className="fas fa-chevron-right" /></button>
            </div>
          </div>
          {dados && <Escudo d={dados} />}
          <button type="button" className="ft-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button>
        </header>
        <nav className="ft-abas">
          {ABAS.map((a) => <button key={a.k} type="button" className={aba === a.k ? 'on' : ''} onClick={() => setAba(a.k)}><i className={`fas ${a.ic}`} /> {a.rot}</button>)}
        </nav>
        <div className="ft-corpo">
          {erro ? <div className="ft-vazio"><i className="fas fa-triangle-exclamation" /> {erro}</div>
            : !dados ? <div className="ft-vazio"><i className="fas fa-circle-notch fa-spin" /> juntando RH, OS, requisições, frota e ocorrências…</div>
              : (
                <div key={`${aba}${mes}`} className="ft-aba">
                  {aba === 'resumo' && <Resumo d={dados} ir={setAba} />}
                  {aba === 'comissao' && <Comissao d={dados} verOS={verOS} />}
                  {aba === 'os' && <OSAba d={dados} verOS={verOS} verReq={setReq} />}
                  {aba === 'req' && <Requisicoes d={dados} verReq={setReq} verOS={verOS} />}
                  {aba === 'frota' && <Frota d={dados} verReq={setReq} />}
                  {aba === 'oc' && <Ocorrencias d={dados} />}
                  {aba === 'rh' && <RH d={dados} />}
                  {dados.avisos.length > 0 && <p className="ft-aviso"><i className="fas fa-circle-info" /> Não deu para ler: {dados.avisos.join(' · ')}</p>}
                </div>
              )}
        </div>
      </div>
      {doc && <div className="ft-doc" onClick={(e) => e.stopPropagation()}><VisualizadorDocumento key={doc.url} doc={doc} onClose={() => setDoc(null)} /></div>}
      {osRel && <OSRelatorioJanela os={osRel.os} cliente={osRel.cliente} onFechar={() => setOsRel(null)} />}
      {req && (
        <div className="ft-req-fundo" onClick={(e) => { e.stopPropagation(); setReq(null) }}>
          <div className="ft-req-jan" onClick={(e) => e.stopPropagation()}>
            <div className="ft-req-cab"><b>Requisição #{req.id}</b><span>{req.titulo}</span><button type="button" onClick={() => setReq(null)} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
            <iframe src={`/requisicoes/imprimir/${req.id}`} title={`Requisição ${req.id}`} />
          </div>
        </div>
      )}
    </div>
  )
  return typeof document === 'undefined' ? tela : createPortal(tela, document.body)
}

// ============================================================================ cabeçalho
export function Escudo({ d }: { d: Ficha }) {
  const p = d.pontos
  const n = useContador(p.saldo, 1000)
  const cor = p.saldo >= 90 ? '#059669' : p.saldo >= 70 ? '#d97706' : '#dc2626'
  return (
    <div className="ft-escudo" title={`Começa o mês com ${p.base} pontos; cada ocorrência que vale desconta. ${p.descontados} descontados em ${nomeMes(d.mes)}.`}>
      {p.nivel != null && <IconeLiga nivel={p.nivel} tamanho={44} />}
      <div><b style={{ color: cor }}>{Math.round(n)}</b><small>de {p.base} pontos</small></div>
    </div>
  )
}

export function Tile({ ic, cor, rot, valor, sub, onClick }: { ic: string; cor: string; rot: string; valor: React.ReactNode; sub?: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" className="ft-tile" onClick={onClick} disabled={!onClick} style={{ '--c': cor } as React.CSSProperties}>
      <span className="ft-tile-ic"><i className={`fas ${ic}`} /></span>
      <small>{rot}</small><b>{valor}</b>{sub && <em>{sub}</em>}
    </button>
  )
}

export function Num({ v, f }: { v: number; f: (n: number) => string }) { return <>{f(useContador(v, 900))}</> }

// ============================================================================ resumo
export function Resumo({ d, ir }: { d: Ficha; ir: (a: Aba) => void }) {
  const c = d.comissao
  const fat = d.os.faturadas.reduce((s, o) => s + o.parte, 0)
  const ocMes = d.ocorrencias.filter((o) => o.data.startsWith(d.mes))
  const km = d.frota?.carros.reduce((s, x) => s + x.km, 0) || 0
  const ferias = d.rh?.ferias.filter((f) => /disponivel|vencid/.test(f.status) && f.saldo > 0).reduce((s, f) => s + f.saldo, 0) || 0
  const vencida = d.rh?.ferias.some((f) => /vencid/.test(f.status) && f.saldo > 0)
  const reqMinhas = d.requisicoes.filter((r) => r.minha)
  return (
    <>
      <div className="ft-tiles">
        <Tile ic="fa-sack-dollar" cor="#059669" rot="Comissão do mês" valor={<Num v={c.total} f={brl2} />} sub={c.oficial ? `RH: ${brl2(c.oficial.valor)} · ${c.oficial.status}` : c.aguardando > 0 ? `+ ${brl2(c.aguardando)} a caminho` : `paga em ${dataBR(c.pagamento)}`} onClick={() => ir('comissao')} />
        <Tile ic="fa-file-invoice-dollar" cor="#2563eb" rot="Faturado (parte dele)" valor={<Num v={fat} f={brl} />} sub={`${d.os.faturadas.length} OS faturadas · ${d.os.internas.length} internas`} onClick={() => ir('os')} />
        <Tile ic="fa-clock" cor="#0891b2" rot="Horas no app" valor={<Num v={d.os.horasApp} f={horas} />} sub={`${d.os.dias.length} dias com relatório`} onClick={() => ir('os')} />
        <Tile ic="fa-hourglass-half" cor="#d97706" rot="Esperando faturar" valor={d.os.aguardando.length} sub={d.os.aguardando.length ? brl(d.os.aguardando.reduce((s, o) => s + o.total, 0)) : 'nada parado'} onClick={() => ir('os')} />
        <Tile ic="fa-receipt" cor="#dc2626" rot="Requisições" valor={d.requisicoes.length} sub={`${reqMinhas.length} pedidas por ele · ${brl(d.requisicoes.reduce((s, r) => s + r.valor, 0))}`} onClick={() => ir('req')} />
        <Tile ic="fa-car-side" cor="#1e40af" rot="Carro" valor={d.frota?.carros.length ? kmFmt(km) : '—'} sub={d.frota?.carros.length ? `${d.frota.carros.map((x) => x.placa).join(', ')} · ${brl(d.frota.gastos.abastecimento)} de combustível` : 'sem carro vinculado'} onClick={() => ir('frota')} />
        <Tile ic="fa-shield-halved" cor="#7c3aed" rot="Ocorrências no mês" valor={ocMes.length} sub={`${d.pontos.descontados} pontos descontados`} onClick={() => ir('oc')} />
        <Tile ic="fa-umbrella-beach" cor={vencida ? '#dc2626' : '#0d9488'} rot="Férias que já pode tirar" valor={d.rh ? `${ferias} dias` : '—'} sub={d.rh ? (vencida ? 'tem período vencido' : `${d.rh.ponto.length} lançamentos no ponto em 12 meses`) : 'RH não ligado'} onClick={() => ir('rh')} />
      </div>
      <DiasDoMes d={d} />
    </>
  )
}

/** Faixa do mês: um quadradinho por dia com as horas do app; dia útil vazio fica tracejado. */
export function DiasDoMes({ d }: { d: Ficha }) {
  const [a, m] = d.mes.split('-').map(Number)
  const n = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const mapa = new Map(d.os.dias.map((x) => [x.data, x]))
  const max = Math.max(8, ...d.os.dias.map((x) => x.horas))
  return (
    <div className="ft-bloco">
      <div className="ft-tit"><i className="fas fa-calendar-days" /> Horas registradas no app, dia a dia <small>barra cheia = {Math.round(max)} h · roxo = OS interna</small></div>
      <div className="ft-dias">
        {Array.from({ length: n }, (_, i) => {
          const dia = `${d.mes}-${String(i + 1).padStart(2, '0')}`
          const x = mapa.get(dia), w = new Date(`${dia}T12:00:00Z`).getUTCDay()
          const fut = dia > d.hoje
          return (
            <div key={dia} className={`ft-dia ${w === 0 || w === 6 ? 'fds' : ''} ${fut ? 'fut' : ''} ${!x && !fut && w > 0 && w < 6 ? 'vazio' : ''}`} title={x ? `${diaBR(dia)}: ${horas(x.horas)} · OS ${x.os.join(', ')}` : diaBR(dia)}>
              <span className="ft-dia-cx">
                {x && <span className="ft-dia-bar" style={{ height: `${(x.horas / max) * 100}%`, animationDelay: `${i * 18}ms` }}>
                  {x.interna > 0 && <i style={{ height: `${(x.interna / x.horas) * 100}%` }} />}
                  <em>{Math.round(x.horas)}</em>
                </span>}
              </span>
              <small>{i + 1}</small>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================ comissão
export function Comissao({ d, verOS }: { d: Ficha; verOS: (os: string, cliente?: string) => void }) {
  const c = d.comissao
  const [filtro, setFiltro] = useState<'todas' | 'ajustadas' | 'aguardando'>('todas')
  const linhas = c.linhas.filter((l) => filtro === 'todas' || (filtro === 'ajustadas' ? l.ajustada : l.tipo === 'aguardando'))
  const dif = c.oficial ? Math.round((c.oficial.valor - c.total) * 100) / 100 : null
  const hist = [...c.historico].slice(0, 12).reverse()
  const maxH = Math.max(1, ...hist.map((h) => h.valor))
  return (
    <>
      <div className="ft-com-topo">
        <div className="ft-com-hero">
          <small>Comissão de {nomeMes(d.mes)}</small>
          <b><Num v={c.total} f={brl2} /></b>
          <span>{c.pct}% sobre o valor das horas · {c.qtdOS.toLocaleString('pt-BR')} OS · paga por volta de <strong>{dataBR(c.pagamento)}</strong></span>
          {d.hoje.startsWith(d.mes) && c.projecao > c.total && <span>no ritmo dos dias úteis fecha o mês com <strong>{brl2(c.projecao)}</strong></span>}
        </div>
        <div className="ft-com-partes">
          <div><small>OS faturadas</small><b>{brl2(c.faturadas)}</b></div>
          <div><small>Internas / entrega técnica</small><b>{brl2(c.internas)}</b></div>
          <div><small>Ajustes manuais</small><b className={c.ajustes < 0 ? 'neg' : ''}>{c.ajustes > 0 ? '+' : ''}{brl2(c.ajustes)}</b></div>
          <div><small>A caminho (esperando faturar)</small><b className="cam">{brl2(c.aguardando)}</b></div>
        </div>
        <div className={`ft-com-rh ${c.oficial ? (Math.abs(dif || 0) < 1 ? 'ok' : 'dif') : ''}`}>
          <small>Lançado no RH</small>
          {c.oficial ? <><b>{brl2(c.oficial.valor)}</b><span>{c.oficial.status.replace('_', ' ')}{Math.abs(dif || 0) < 1 ? ' · confere com o cálculo' : ` · diferença de ${brl2(dif || 0)} (ajuste feito direto no RH)`}</span></> : <><b>—</b><span>ainda não lançado (o RH importa do painel do Omie)</span></>}
        </div>
      </div>
      <details className="ft-regra">
        <summary><i className="fas fa-circle-question" /> Como a comissão é calculada</summary>
        <ul>
          <li><b>OS faturada</b> (normal, revisão, garantia): {c.pct}% do valor das <b>horas</b> da OS, dividido pelo número de técnicos que estão na OS no Omie.</li>
          <li><b>Entrega técnica / montagem / demonstração</b>: valor fixo pelo contrato (R$ 150; carreta R$ 250; montagem de desligamento R$ 400; montagem R$ 500), dividido entre os técnicos.</li>
          <li><b>OS interna / cortesia</b>: {c.pct}% das horas. Garantia da loja (GARANTIA-NT) não paga.</li>
          <li><b>Ajuste manual</b>: quando o RH (ou o painel do Omie) corrige uma OS, vale o valor corrigido, e o motivo aparece na linha.</li>
          <li>A OS conta no mês em que <b>faturou</b> (ou no mês para onde o ajuste mudou a data). OS esperando faturar aparece como <b>a caminho</b>.</li>
        </ul>
      </details>
      <div className="ft-filtros">
        {([['todas', `Todas (${c.linhas.length})`], ['ajustadas', `Ajustadas (${c.linhas.filter((l) => l.ajustada).length})`], ['aguardando', `A caminho (${c.linhas.filter((l) => l.tipo === 'aguardando').length})`]] as const).map(([k, r]) => <button key={k} type="button" className={filtro === k ? 'on' : ''} onClick={() => setFiltro(k)}>{r}</button>)}
      </div>
      <div className="ft-tabela">
        <table>
          <thead><tr><th>OS</th><th>Data</th><th>Cliente</th><th>Como saiu</th><th className="n">Horas (R$)</th><th className="n">Regra daria</th><th className="n">Comissão</th></tr></thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={`${l.os}${l.tipo}${i}`} className={l.tipo === 'aguardando' ? 'cam' : ''} style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}>
                <td><button type="button" className="ft-os" onClick={() => verOS(l.os, l.cliente)}>{l.numeroOmie ? `${l.numeroOmie}` : l.os}</button>{l.numeroOmie && !l.os.startsWith('OMIE') && <small className="ft-sub">{l.os}</small>}</td>
                <td>{diaBR(l.data)}{l.movidaDe && <small className="ft-sub" title="a data foi mudada por ajuste">era {diaBR(l.movidaDe)}</small>}</td>
                <td className="cli">{l.cliente || '—'}{l.garantia && <span className="ft-chip">garantia</span>}{l.tipo === 'interna' && <span className="ft-chip roxo">interna</span>}{l.outroTecnicoNoPortal && <span className="ft-chip" title="No portal a OS está em nome de outro técnico; a comissão segue o Omie">outro técnico no portal</span>}</td>
                <td className="regra">{l.regra}{l.motivo && <small className="ft-motivo"><i className="fas fa-pen" /> {l.motivo.motivo}{l.motivo.por ? ` — ${l.motivo.por}` : ''}</small>}</td>
                <td className="n">{l.base ? brl2(l.base) : '—'}</td>
                <td className="n mudo">{l.ajustada ? <s>{brl2(l.calculado)}</s> : brl2(l.calculado)}</td>
                <td className={`n forte ${l.ajustada ? 'aj' : ''}`}>{brl2(l.valor)}</td>
              </tr>
            ))}
            {!linhas.length && <tr><td colSpan={7} className="ft-vazio-td">Nenhuma OS aqui.</td></tr>}
          </tbody>
          {filtro === 'todas' && linhas.length > 0 && <tfoot><tr><td colSpan={6}>Total do mês (sem o que está a caminho)</td><td className="n forte">{brl2(c.total)}</td></tr></tfoot>}
        </table>
      </div>
      {hist.length > 0 && (
        <div className="ft-bloco">
          <div className="ft-tit"><i className="fas fa-chart-column" /> Comissões lançadas no RH</div>
          <div className="ft-hist">
            {hist.map((h, i) => (
              <div key={h.mes} className={`ft-hist-col ${h.mes === d.mes ? 'on' : ''}`} title={`${nomeMes(h.mes)}: ${brl2(h.valor)} · ${h.status}`}>
                <em>{brl(h.valor)}</em>
                <span style={{ height: `${(h.valor / maxH) * 100}%`, animationDelay: `${i * 50}ms` }} className={h.status === 'paga' ? 'paga' : ''} />
                <small>{MESES[Number(h.mes.slice(5, 7)) - 1].slice(0, 3)}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================================ OS
export function OSAba({ d, verOS, verReq }: { d: Ficha; verOS: (os: string, cliente?: string) => void; verReq: (r: { id: number; titulo: string }) => void }) {
  const t = d.os.faturadas.reduce((s, o) => ({ h: s.h + o.horas / o.tecnicos.length, km: s.km + o.km / o.tecnicos.length, v: s.v + o.parte }), { h: 0, km: 0, v: 0 })
  return (
    <>
      <div className="ft-tiles mini">
        <Tile ic="fa-file-invoice-dollar" cor="#2563eb" rot="Faturado (parte dele)" valor={brl(t.v)} sub={`${d.os.faturadas.length} OS`} />
        <Tile ic="fa-clock" cor="#0891b2" rot="Horas cobradas" valor={horas(t.h)} sub={`${horas(d.os.horasApp)} no app`} />
        <Tile ic="fa-road" cor="#1e40af" rot="Km cobrados" valor={kmFmt(t.km)} />
        <Tile ic="fa-hourglass-half" cor="#d97706" rot="Esperando faturar" valor={d.os.aguardando.length} />
      </div>
      <div className="ft-bloco">
        <div className="ft-tit"><i className="fas fa-file-invoice-dollar" /> Faturadas em {nomeMes(d.mes)} <small>clique no nº para abrir a OS</small></div>
        <div className="ft-tabela">
          <table>
            <thead><tr><th>OS</th><th>Data</th><th>Cliente</th><th className="n">Horas</th><th className="n">Km</th><th className="n">Serviço</th><th className="n">Peças</th><th className="n">Total da OS</th><th className="n">Parte dele</th><th>Requisições</th></tr></thead>
            <tbody>
              {d.os.faturadas.map((o, i) => (
                <tr key={o.os} style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}>
                  <td><button type="button" className="ft-os" onClick={() => verOS(o.os, o.cliente)}>{o.os.replace('OMIE ', '')}</button>{o.numeroOmie && !o.os.startsWith('OMIE') && <small className="ft-sub">Omie {o.numeroOmie}</small>}</td>
                  <td>{diaBR(o.data)}</td>
                  <td className="cli">{o.cliente || '—'}{o.tecnicos.length > 1 && <small className="ft-sub">com {o.tecnicos.filter((x) => x !== d.nome).join(', ')}</small>}{o.garantia && <span className="ft-chip">garantia</span>}{o.nota === false && <span className="ft-chip cinza">recibo</span>}</td>
                  <td className="n">{horas(o.horas)}</td><td className="n">{Math.round(o.km)}</td><td className="n">{brl(o.servico + o.kmValor)}</td><td className="n">{o.pecas ? brl(o.pecas) : '—'}</td>
                  <td className="n">{brl(o.bruto)}</td><td className="n forte">{brl(o.parte)}</td>
                  <td>{o.requisicoes.length ? o.requisicoes.map((r) => <button key={r.id} type="button" className="ft-req" onClick={() => verReq(r)}>#{r.id} {brl(r.valor)}</button>) : '—'}</td>
                </tr>
              ))}
              {!d.os.faturadas.length && <tr><td colSpan={10} className="ft-vazio-td">Nenhuma OS faturada no mês.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {d.os.aguardando.length > 0 && (
        <div className="ft-bloco">
          <div className="ft-tit"><i className="fas fa-hourglass-half" /> Paradas, esperando faturar <small>preenchida = relatório feito; atrasada = passou da data sem relatório</small></div>
          <div className="ft-tabela"><table>
            <thead><tr><th>OS</th><th>Situação</th><th>Cliente</th><th>Desde</th><th className="n">Dias</th><th className="n">Mão de obra</th><th className="n">Total</th></tr></thead>
            <tbody>{d.os.aguardando.map((o) => <tr key={o.os}><td><button type="button" className="ft-os" onClick={() => verOS(o.os, o.cliente)}>{o.os}</button></td><td><span className={`ft-chip ${o.tipo === 'atrasada' ? 'verm' : 'amb'}`}>{o.tipo}</span> <small className="mudo">{o.status}</small></td><td className="cli">{o.cliente}</td><td>{dataBR(o.dataRef)}</td><td className="n">{o.dias}</td><td className="n">{brl(o.maoDeObra)}</td><td className="n forte">{brl(o.total)}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
      {d.os.internas.length > 0 && (
        <div className="ft-bloco">
          <div className="ft-tit"><i className="fas fa-house-chimney" /> Internas fechadas no mês</div>
          <div className="ft-tabela"><table>
            <thead><tr><th>OS</th><th>Data</th><th>Cliente</th><th>Contrato</th><th className="n">Horas</th><th className="n">Valor</th></tr></thead>
            <tbody>{d.os.internas.map((o) => <tr key={o.os}><td><button type="button" className="ft-os" onClick={() => verOS(o.os, o.cliente)}>{o.os.replace('OMIE ', '')}</button></td><td>{diaBR(o.data)}</td><td className="cli">{o.cliente || '—'}</td><td>{o.contrato}</td><td className="n">{horas(o.horas)}</td><td className="n">{brl(o.valor)}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
      <DiasDoMes d={d} />
    </>
  )
}

// ============================================================================ requisições
export function Requisicoes({ d, verReq, verOS }: { d: Ficha; verReq: (r: { id: number; titulo: string }) => void; verOS: (os: string) => void }) {
  const [so, setSo] = useState<'todas' | 'minhas' | 'os'>('todas')
  const lista = d.requisicoes.filter((r) => so === 'todas' || (so === 'minhas' ? r.minha : r.daOS))
  const porTipo = useMemo(() => {
    const m = new Map<string, { qtd: number; valor: number }>()
    for (const r of d.requisicoes) { const x = m.get(r.tipo || 'Outros') || { qtd: 0, valor: 0 }; x.qtd++; x.valor += r.valor; m.set(r.tipo || 'Outros', x) }
    return [...m.entries()].sort((a, b) => b[1].valor - a[1].valor)
  }, [d.requisicoes])
  const max = Math.max(1, ...porTipo.map(([, x]) => x.valor))
  return (
    <>
      {porTipo.length > 0 && (
        <div className="ft-bloco">
          <div className="ft-tit"><i className="fas fa-layer-group" /> Por tipo</div>
          <div className="ft-barras">{porTipo.map(([t, x], i) => <div key={t} className="ft-barra"><span>{t}</span><div><i style={{ width: `${(x.valor / max) * 100}%`, animationDelay: `${i * 60}ms` }} /></div><b>{brl(x.valor)}</b><small>{x.qtd}</small></div>)}</div>
        </div>
      )}
      <div className="ft-filtros">
        {([['todas', `Todas (${d.requisicoes.length})`], ['minhas', `Pedidas por ele (${d.requisicoes.filter((r) => r.minha).length})`], ['os', `Das OS dele (${d.requisicoes.filter((r) => r.daOS).length})`]] as const).map(([k, r]) => <button key={k} type="button" className={so === k ? 'on' : ''} onClick={() => setSo(k)}>{r}</button>)}
      </div>
      <div className="ft-tabela">
        <table>
          <thead><tr><th>Nº</th><th>Data</th><th>Tipo</th><th>Título</th><th>Situação</th><th>OS</th><th className="n">Valor</th><th className="n">Cobrado do cliente</th></tr></thead>
          <tbody>
            {lista.map((r, i) => (
              <tr key={r.id} style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}>
                <td><button type="button" className="ft-req" onClick={() => verReq(r)}>#{r.id}</button></td>
                <td>{diaBR(r.data)}</td><td>{r.tipo}<small className="ft-sub">{r.setor}</small></td>
                <td className="cli">{r.titulo}{r.fornecedor && <small className="ft-sub">{r.fornecedor}</small>}{!r.minha && <small className="ft-sub">pedida por {r.solicitante}</small>}</td>
                <td><span className={`ft-chip ${r.status === 'financeiro' ? 'verde' : 'amb'}`}>{r.status || '—'}</span></td>
                <td>{r.os ? <button type="button" className="ft-os" onClick={() => verOS(r.os!)}>{r.os}</button> : '—'}</td>
                <td className="n forte">{r.valor ? brl(r.valor) : '—'}{r.litros > 0 && <small className="ft-sub">{r.litros.toLocaleString('pt-BR')} L</small>}</td>
                <td className="n">{r.cobrado ? brl(r.cobrado) : '—'}</td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={8} className="ft-vazio-td">Nenhuma requisição no mês.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ============================================================================ frota
export function Frota({ d, verReq }: { d: Ficha; verReq: (r: { id: number; titulo: string }) => void }) {
  const f = d.frota
  if (!f) return <div className="ft-vazio">Não deu para ler a frota.</div>
  const g = f.gastos
  return (
    <>
      {f.carros.length ? (
        <div className="ft-carros">
          {f.carros.map((c, i) => (
            <div key={c.placa} className="ft-carro" style={{ animationDelay: `${i * 90}ms` }}>
              <div className="ft-carro-cab"><span className="ft-placa">{c.placa}</span><div><b>{c.modelo || 'veículo'}</b><small>{[c.ano, c.tipo].filter(Boolean).join(' · ')}</small></div></div>
              <div className="ft-carro-nums">
                <div><b>{kmFmt(c.km)}</b><small>rodados no mês</small></div>
                <div><b>{c.diasRodados}</b><small>dias rodando</small></div>
                <div><b>{horas(c.ligadoH)}</b><small>ligado ({horas(c.movimentoH)} andando)</small></div>
                <div><b className={c.velMax > 120 ? 'verm' : ''}>{Math.round(c.velMax)} km/h</b><small>velocidade máxima</small></div>
                <div><b>{c.paradasAtipicas}</b><small>paradas fora de lugar conhecido</small></div>
              </div>
              {c.pendencias.length > 0 && <div className="ft-pend"><small>{c.pendencias.length} pendência{c.pendencias.length > 1 ? 's' : ''} aberta{c.pendencias.length > 1 ? 's' : ''} no carro</small>{c.pendencias.map((p, k) => <div key={k}><i className="fas fa-wrench" /> <b>{p.titulo}</b>{p.descricao && <span> — {p.descricao}</span>}<em>desde {dataBR(p.desde)}</em></div>)}</div>}
            </div>
          ))}
        </div>
      ) : <div className="ft-vazio pequeno">Nenhum carro vinculado a ele (vínculo do técnico ou dono do carro).</div>}
      <div className="ft-tiles mini">
        <Tile ic="fa-gas-pump" cor="#d97706" rot="Combustível" valor={brl(g.abastecimento)} sub={`${Math.round(g.litros)} litros`} />
        <Tile ic="fa-wrench" cor="#1e40af" rot="Manutenção do carro" valor={brl(g.manutencao)} />
        <Tile ic="fa-utensils" cor="#059669" rot="Alimentação" valor={brl(g.alimentacao)} />
        <Tile ic="fa-toolbox" cor="#7c3aed" rot="Materiais" valor={brl(g.materiais)} sub={g.emAberto ? `${brl(g.emAberto)} ainda em aberto` : undefined} />
      </div>
      {f.lancamentos.length > 0 && (
        <div className="ft-tabela">
          <table>
            <thead><tr><th>Data</th><th>Tipo</th><th>De onde</th><th>Placa</th><th className="n">Litros</th><th className="n">Valor</th></tr></thead>
            <tbody>{f.lancamentos.map((l, i) => (
              <tr key={i} className={l.aberto ? 'cam' : ''}><td>{diaBR(l.data)}</td><td>{ROTULO_GASTO[l.tipo] || l.tipo}{l.aberto && <span className="ft-chip amb">em aberto</span>}</td>
                <td>{l.origem === 'cartao' ? 'cartão-frota' : reqDoRef(l.ref) ? <button type="button" className="ft-req" onClick={() => verReq({ id: reqDoRef(l.ref)!, titulo: ROTULO_GASTO[l.tipo] || l.tipo })}>req. #{reqDoRef(l.ref)}</button> : 'requisição'}</td>
                <td>{l.placa || '—'}{l.outroCarro && <span className="ft-chip cinza">outro carro</span>}</td><td className="n">{l.litros ? l.litros.toLocaleString('pt-BR') : '—'}</td><td className="n forte">{brl(l.valor)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ============================================================================ ocorrências
export function Ocorrencias({ d }: { d: Ficha }) {
  const meses = useMemo(() => {
    const m = new Map<string, typeof d.ocorrencias>()
    for (const o of d.ocorrencias) { const k = o.data.slice(0, 7); m.set(k, [...(m.get(k) || []), o]) }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [d])
  if (!d.ocorrencias.length) return <div className="ft-vazio pequeno"><i className="fas fa-shield-heart" /> Nenhuma ocorrência nos últimos 12 meses.</div>
  return (
    <div className="ft-oc">
      {meses.map(([m, l]) => {
        const pts = l.filter((o) => o.vale).reduce((s, o) => s + o.pontos, 0)
        return (
          <div key={m} className={`ft-oc-mes ${m === d.mes ? 'on' : ''}`}>
            <div className="ft-oc-cab"><b>{nomeMes(m)}</b><span>{l.length} ocorrência{l.length > 1 ? 's' : ''} · −{pts} pontos → fechou com {Math.max(0, 100 - pts)}</span></div>
            {l.map((o) => {
              const def = o.defesas[0]
              return (
                <div key={o.id} className={`ft-oc-item ${o.vale ? '' : 'devolvida'}`}>
                  <span className="ft-oc-pt" style={{ background: o.cor }}>−{o.pontos}</span>
                  <div><b>{o.rotulo}</b> <small className="mudo">{dataBR(o.data)}{o.idOrdem ? ` · ${o.idOrdem}` : ''}</small><p>{o.descricao}</p>
                    {def && <small className={`ft-def ${def.status}`}><i className="fas fa-scale-balanced" /> defesa {def.status}{def.avaliadoPor ? ` por ${def.avaliadoPor}` : ''}{!o.vale ? ' · pontos devolvidos' : ''}{def.texto ? `: “${def.texto}”` : ''}</small>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================ RH
export function RH({ d }: { d: Ficha }) {
  const r = d.rh
  if (!r) return <div className="ft-vazio pequeno">Não achei este técnico no RH (ou o RH não está ligado aqui).</div>
  const faltas = r.ponto.filter((p) => /falta/i.test(p.tipo)).length, atrasos = r.ponto.filter((p) => /atras/i.test(p.tipo)).length
  return (
    <>
      <div className="ft-rh-cad">
        {([['Nome no RH', r.nomeRh], ['Cargo', r.cargo], ['Departamento', r.departamento], ['Admissão', r.admissao ? `${dataBR(r.admissao)} · ${tempoDeCasa(r.admissao)}` : null], ['Contrato', r.tipoContrato?.toUpperCase()], ['Salário', r.salario ? brl2(r.salario) : null], ['Comissão', `${d.comissao.pct}% sobre as horas${r.comissaoPctRH != null ? ` (RH: ${r.comissaoPctRH}%)` : ''}`], ['Situação', r.status], ['Matrícula', r.matricula], ['Cidade', r.cidade], ['Telefone', r.telefone], ['Aniversário', r.aniversario ? `${r.aniversario.slice(3, 5)}/${r.aniversario.slice(0, 2)}` : null]] as const)
          .filter(([, v]) => v).map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}
      </div>
      <div className="ft-tiles mini">
        <Tile ic="fa-user-clock" cor="#dc2626" rot="Faltas em 12 meses" valor={faltas} sub={`${atrasos} atrasos lançados no ponto`} />
        <Tile ic="fa-piggy-bank" cor="#059669" rot="Caixinha" valor={brl2(r.caixinha.saldo)} sub={`${r.caixinha.movimentos} movimentos`} />
        <Tile ic="fa-shirt" cor="#1e40af" rot="Uniformes" valor={r.uniformes.length} sub={r.uniformes[0] ? `última entrega ${dataBR(r.uniformes[0].data)}` : 'nenhuma entrega'} />
        <Tile ic="fa-hand-holding-dollar" cor="#d97706" rot="Descontos lançados" valor={r.descontos.length} sub={brl(r.descontos.reduce((s, x) => s + x.valor, 0))} />
      </div>
      <div className="ft-dupla">
        <div className="ft-bloco">
          <div className="ft-tit"><i className="fas fa-umbrella-beach" /> Férias</div>
          {r.ferias.length ? r.ferias.map((f) => (
            <div key={f.inicio} className="ft-ferias">
              <span>{dataBR(f.inicio)} a {dataBR(f.fim)}</span>
              <div><i style={{ width: `${Math.min(100, ((f.gozados + f.vendidos) / Math.max(1, f.direito)) * 100)}%` }} /></div>
              <b>{f.saldo > 0 ? `${f.saldo} dias` : 'tirada'}</b><small className={/vencid/.test(f.status) ? 'verm' : ''}>{ROTULO_FERIAS[f.status] || f.status.replace(/_/g, ' ')}</small>
            </div>
          )) : <p className="mudo">Sem períodos lançados.</p>}
        </div>
        <div className="ft-bloco">
          <div className="ft-tit"><i className="fas fa-user-clock" /> Ponto (12 meses)</div>
          {r.ponto.length ? r.ponto.map((p, i) => <div key={i} className="ft-linha"><span>{dataBR(p.data)}</span><b>{p.tipo}</b><small>{p.quantidade} {p.unidade}{p.obs ? ` · ${p.obs}` : ''}</small></div>) : <p className="mudo">Nenhum lançamento.</p>}
        </div>
      </div>
      <div className="ft-dupla">
        <div className="ft-bloco">
          <div className="ft-tit"><i className="fas fa-sack-dollar" /> Comissões lançadas</div>
          {r.comissoes.map((c) => <div key={c.mes} className="ft-linha"><span>{nomeMes(c.mes)}</span><b>{brl2(c.valor)}</b><small className={`ft-chip ${c.status === 'paga' ? 'verde' : c.status === 'aprovada' ? 'azul' : 'amb'}`}>{c.status.replace('_', ' ')}</small></div>)}
          {!r.comissoes.length && <p className="mudo">Nenhuma.</p>}
        </div>
        <div className="ft-bloco">
          <div className="ft-tit"><i className="fas fa-hand-holding-dollar" /> Descontos</div>
          {r.descontos.slice(0, 15).map((x, i) => <div key={i} className="ft-linha"><span>{nomeMes(x.mes).replace(/ de \d+$/, '')}</span><b>{brl2(x.valor)}</b><small>{x.descricao.replace(/^\[Portal /, '[')}</small></div>)}
          {!r.descontos.length && <p className="mudo">Nenhum.</p>}
        </div>
      </div>
    </>
  )
}

export const ESTILO_FT = `
@keyframes ftFade { from { opacity: 0 } } @keyframes ftSobe { from { opacity: 0; transform: translateY(26px) scale(.97) } }
@keyframes ftEntra { from { opacity: 0; transform: translateY(8px) } } @keyframes ftCresce { from { transform: scaleY(0) } } @keyframes ftLarga { from { transform: scaleX(0) } }
.ft-fundo { position: fixed; inset: 0; z-index: 100050; background: rgba(15,23,42,.5); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: ftFade .2s both }
.ft-jan { width: min(1240px, 100%); height: min(94vh, 980px); background: var(--portal-bg, #f8fafc); border-radius: 22px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 30px 80px rgba(15,23,42,.35); animation: ftSobe .45s cubic-bezier(.2,1.1,.3,1) both; color: var(--portal-text, #0f172a) }
.ft-cab { position: relative; display: flex; align-items: center; gap: 18px; padding: 20px 24px 16px; background: linear-gradient(135deg, #dbeafe, #eff6ff 55%, #f5f3ff); }
.ft-foto { width: 84px; height: 84px; border-radius: 50%; overflow: hidden; flex: none; border: 4px solid #fefefe; box-shadow: 0 8px 22px rgba(15,23,42,.18); background: linear-gradient(135deg, #2563eb, #7c3aed); display: grid; place-items: center }
.ft-foto img { width: 100%; height: 100%; object-fit: cover; object-position: center } .ft-foto span { color: #fefefe; font-weight: 900; font-size: 28px }
.ft-id { flex: 1; min-width: 0 } .ft-id h2 { margin: 0; font-size: 24px; font-weight: 900; color: #0f172a } .ft-id p { margin: 2px 0 8px; font-size: 13.5px; color: #475569 }
.ft-mes { display: inline-flex; align-items: center; gap: 6px; background: rgba(254,254,254,.8); border-radius: 99px; padding: 3px } .ft-mes b { font-size: 13px; padding: 0 6px; color: #0f172a }
.ft-mes button { width: 28px; height: 28px; border-radius: 50%; border: none; background: #fefefe; color: #2563eb; cursor: pointer; box-shadow: 0 1px 3px rgba(15,23,42,.12) } .ft-mes button:disabled { opacity: .35; cursor: default }
.ft-escudo { display: flex; align-items: center; gap: 10px; background: rgba(254,254,254,.85); border-radius: 16px; padding: 8px 14px 8px 10px; box-shadow: 0 4px 14px rgba(15,23,42,.08) }
.ft-escudo b { display: block; font-size: 30px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums } .ft-escudo small { font-size: 11.5px; color: #64748b; font-weight: 700 }
.ft-x { position: absolute; top: 12px; right: 14px; width: 34px; height: 34px; border-radius: 50%; border: none; background: rgba(254,254,254,.85); color: #334155; cursor: pointer; font-size: 16px } .ft-x:hover { background: #fefefe; color: #dc2626 }
.ft-abas { display: flex; gap: 2px; padding: 0 18px; border-bottom: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); overflow-x: auto }
.ft-abas button { border: none; background: none; padding: 12px 14px 10px; font-family: inherit; font-size: 13.5px; font-weight: 800; color: ${MUDO}; cursor: pointer; border-bottom: 3px solid transparent; white-space: nowrap; transition: color .2s, border-color .2s }
.ft-abas button:hover { color: #2563eb } .ft-abas button.on { color: #2563eb; border-bottom-color: #2563eb }
.ft-corpo { flex: 1; overflow: auto; padding: 18px 24px 24px } .ft-aba { display: grid; gap: 16px; animation: ftEntra .35s both }
.ft-vazio { display: grid; place-items: center; min-height: 240px; color: ${MUDO}; font-size: 14px; gap: 8px; text-align: center } .ft-vazio.pequeno { min-height: 80px; background: var(--portal-bg-card, #fefefe); border-radius: 14px }
.ft-aviso { margin: 0; font-size: 12px; color: ${MUDO} }
.ft-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px } .ft-tiles.mini { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)) }
.ft-tile { position: relative; text-align: left; display: grid; gap: 2px; padding: 14px 16px 14px 62px; border-radius: 16px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); font-family: inherit; color: inherit; animation: ftEntra .4s both; transition: transform .18s, box-shadow .18s }
.ft-tile:not(:disabled) { cursor: pointer } .ft-tile:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,23,42,.08) }
.ft-tile-ic { position: absolute; left: 14px; top: 14px; width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); font-size: 15px }
.ft-tile small { font-size: 12px; font-weight: 800; color: ${MUDO} } .ft-tile b { font-size: 21px; font-weight: 900; font-variant-numeric: tabular-nums } .ft-tile em { font-style: normal; font-size: 12px; color: ${MUDO} }
.ft-bloco { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; padding: 14px 16px; display: grid; gap: 10px; align-content: start; animation: ftEntra .4s .05s both }
.ft-tit { font-size: 13.5px; font-weight: 900; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap } .ft-tit i { color: #2563eb } .ft-tit small { font-weight: 600; color: ${MUDO}; font-size: 12px }
.ft-dias { display: grid; grid-template-columns: repeat(31, minmax(0, 1fr)); gap: 3px; align-items: end }
.ft-dia { display: grid; gap: 3px; justify-items: center } .ft-dia small { font-size: 10px; color: ${MUDO} }
.ft-dia-cx { position: relative; width: 100%; height: 64px; border-radius: 6px; background: #f1f5f9; display: flex; align-items: flex-end; overflow: hidden }
.ft-dia.fds .ft-dia-cx { background: transparent; border: 1px dashed var(--portal-border, #e2e8f0) } .ft-dia.vazio .ft-dia-cx { background: #fef2f2 } .ft-dia.fut .ft-dia-cx { background: transparent; border: 1px dashed #f1f5f9 }
.ft-dia-bar { position: relative; width: 100%; background: linear-gradient(180deg, #38bdf8, #0891b2); border-radius: 5px 5px 0 0; transform-origin: bottom; animation: ftCresce .7s cubic-bezier(.2,.9,.3,1) both; display: flex; flex-direction: column; justify-content: flex-end }
.ft-dia-bar i { display: block; width: 100%; background: #8b5cf6 } .ft-dia-bar em { position: absolute; top: 2px; left: 0; right: 0; text-align: center; font-style: normal; font-size: 9.5px; font-weight: 900; color: #fefefe }
.ft-com-topo { display: grid; grid-template-columns: 1.3fr 1.4fr 1fr; gap: 12px } @media (max-width: 900px) { .ft-com-topo { grid-template-columns: 1fr } }
.ft-com-hero { display: grid; gap: 4px; align-content: center; padding: 18px 20px; border-radius: 18px; background: linear-gradient(135deg, #ecfdf5, #d1fae5); animation: ftEntra .4s both }
.ft-com-hero small { font-size: 12.5px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: .04em } .ft-com-hero b { font-size: 38px; font-weight: 900; color: #065f46; font-variant-numeric: tabular-nums; line-height: 1.05 } .ft-com-hero span { font-size: 13px; color: #065f46 }
.ft-com-partes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px } .ft-com-partes div { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px; padding: 10px 14px; display: grid; animation: ftEntra .4s .08s both }
.ft-com-partes small { font-size: 12px; color: ${MUDO}; font-weight: 700 } .ft-com-partes b { font-size: 19px; font-weight: 900; font-variant-numeric: tabular-nums } .ft-com-partes b.neg { color: #dc2626 } .ft-com-partes b.cam { color: #d97706 }
.ft-com-rh { display: grid; gap: 4px; align-content: center; padding: 14px 16px; border-radius: 18px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); animation: ftEntra .4s .14s both }
.ft-com-rh small { font-size: 12px; font-weight: 800; color: ${MUDO} } .ft-com-rh b { font-size: 24px; font-weight: 900 } .ft-com-rh span { font-size: 12.5px; color: ${MUDO} }
.ft-com-rh.ok { background: #f0fdf4; border-color: #bbf7d0 } .ft-com-rh.ok span { color: #047857 } .ft-com-rh.dif { background: #fffbeb; border-color: #fde68a } .ft-com-rh.dif span { color: #b45309 }
.ft-regra { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px; padding: 10px 14px; font-size: 13px }
.ft-regra summary { cursor: pointer; font-weight: 800; color: #2563eb } .ft-regra ul { margin: 8px 0 2px; padding-left: 20px; display: grid; gap: 4px; color: var(--portal-text, #334155) }
.ft-filtros { display: flex; gap: 6px; flex-wrap: wrap } .ft-filtros button { border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 12.5px; font-weight: 800; color: ${MUDO}; cursor: pointer }
.ft-filtros button.on { background: #2563eb; border-color: #2563eb; color: #fefefe }
.ft-tabela { overflow: auto; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px }
.ft-bloco .ft-tabela { border: none; border-radius: 0 }
.ft-tabela table { width: 100%; border-collapse: collapse; font-size: 13px } .ft-tabela th { position: sticky; top: 0; background: var(--portal-bg, #f8fafc); text-align: left; font-size: 12px; font-weight: 800; color: ${MUDO}; padding: 8px 10px; white-space: nowrap; z-index: 1 }
.ft-tabela td { padding: 8px 10px; border-top: 1px solid var(--portal-border, #f1f5f9); vertical-align: top } .ft-tabela tbody tr { animation: ftEntra .35s both } .ft-tabela tbody tr:hover { background: color-mix(in srgb, #2563eb 4%, transparent) }
.ft-tabela .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums } .ft-tabela .forte { font-weight: 900 } .ft-tabela .mudo, .mudo { color: ${MUDO} } .ft-tabela td.aj { color: #b45309 } .ft-tabela td.cli { max-width: 260px } .ft-tabela td.regra { max-width: 300px; color: var(--portal-text, #334155) }
.ft-tabela tr.cam td { color: #b45309; background: #fffbeb } .ft-tabela tfoot td { border-top: 2px solid var(--portal-border, #e2e8f0); font-weight: 800; padding: 10px }
.ft-vazio-td { text-align: center; color: ${MUDO}; padding: 22px !important }
.ft-sub { display: block; font-size: 11.5px; color: ${MUDO} } .ft-motivo { display: block; margin-top: 3px; font-size: 12px; color: #b45309 }
.ft-os, .ft-req { border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 7px; padding: 1px 8px; font-family: inherit; font-size: 12.5px; font-weight: 900; cursor: pointer; white-space: nowrap } .ft-os:hover { background: #2563eb; color: #fefefe }
.ft-req { border-color: #fecaca; background: #fef2f2; color: #b91c1c; margin: 0 3px 3px 0 } .ft-req:hover { background: #dc2626; color: #fefefe }
.ft-chip { display: inline-block; margin-left: 5px; font-size: 11px; font-weight: 800; border-radius: 99px; padding: 1px 8px; background: #eff6ff; color: #1d4ed8; vertical-align: 1px }
.ft-chip.roxo { background: #f5f3ff; color: #6d28d9 } .ft-chip.cinza { background: #f1f5f9; color: #475569 } .ft-chip.verm { background: #fef2f2; color: #b91c1c; margin-left: 0 } .ft-chip.amb { background: #fffbeb; color: #b45309; margin-left: 0 } .ft-chip.verde { background: #ecfdf5; color: #047857; margin-left: 0 } .ft-chip.azul { margin-left: 0 }
.ft-hist { display: flex; gap: 10px; align-items: flex-end; height: 150px; padding-top: 18px }
.ft-hist-col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px } .ft-hist-col em { font-style: normal; font-size: 11px; font-weight: 800; color: ${MUDO}; white-space: nowrap }
.ft-hist-col span { width: 100%; max-width: 46px; border-radius: 8px 8px 3px 3px; background: linear-gradient(180deg, #93c5fd, #2563eb); transform-origin: bottom; animation: ftCresce .8s cubic-bezier(.2,.9,.3,1) both } .ft-hist-col span.paga { background: linear-gradient(180deg, #6ee7b7, #059669) }
.ft-hist-col small { font-size: 11.5px; font-weight: 800; color: ${MUDO}; text-transform: capitalize } .ft-hist-col.on em, .ft-hist-col.on small { color: #2563eb }
.ft-barras { display: grid; gap: 6px } .ft-barra { display: grid; grid-template-columns: 200px 1fr 100px 30px; gap: 10px; align-items: center; font-size: 13px }
.ft-barra > div { height: 10px; border-radius: 99px; background: #f1f5f9; overflow: hidden } .ft-barra i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #f87171, #dc2626); transform-origin: left; animation: ftLarga .8s cubic-bezier(.2,.9,.3,1) both }
.ft-barra b { text-align: right; font-variant-numeric: tabular-nums } .ft-barra small { color: ${MUDO}; text-align: right }
.ft-carros { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 12px }
.ft-carro { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; padding: 14px 16px; display: grid; gap: 12px; animation: ftEntra .45s both }
.ft-carro-cab { display: flex; gap: 12px; align-items: center } .ft-carro-cab b { display: block; font-size: 15px } .ft-carro-cab small { font-size: 12px; color: ${MUDO} }
.ft-placa { font-family: ui-monospace, monospace; font-weight: 900; font-size: 15px; letter-spacing: .06em; border: 2px solid #0f172a; border-top: 7px solid #1e40af; border-radius: 6px; padding: 2px 10px; background: #fefefe; color: #0f172a }
.ft-carro-nums { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px } .ft-carro-nums div { display: grid; gap: 1px } .ft-carro-nums b { font-size: 16px; font-weight: 900 } .ft-carro-nums b.verm { color: #dc2626 } .ft-carro-nums small { font-size: 11.5px; color: ${MUDO} }
.ft-pend { display: grid; gap: 5px; background: #fffbeb; border-radius: 12px; padding: 10px 12px; font-size: 12.5px } .ft-pend > small { font-weight: 900; color: #b45309 } .ft-pend i { color: #d97706 } .ft-pend em { font-style: normal; color: ${MUDO}; margin-left: 6px; font-size: 11.5px }
.ft-oc { display: grid; gap: 12px } .ft-oc-mes { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; padding: 12px 16px; display: grid; gap: 8px; animation: ftEntra .4s both } .ft-oc-mes.on { border-color: #93c5fd; box-shadow: 0 0 0 3px #dbeafe }
.ft-oc-cab { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap } .ft-oc-cab b { } .ft-oc-cab span { font-size: 12.5px; color: ${MUDO} }
.ft-oc-item { display: flex; gap: 12px; align-items: flex-start; font-size: 13px } .ft-oc-item p { margin: 2px 0 0; color: var(--portal-text, #334155) } .ft-oc-item.devolvida { opacity: .6 } .ft-oc-item.devolvida .ft-oc-pt { text-decoration: line-through }
.ft-oc-pt { flex: none; min-width: 44px; text-align: center; color: #fefefe; font-weight: 900; border-radius: 10px; padding: 4px 6px; font-size: 13px }
.ft-def { display: block; margin-top: 4px; font-size: 12px; color: ${MUDO} } .ft-def.aprovada { color: #047857 } .ft-def.recusada { color: #b91c1c } .ft-def.pendente { color: #b45309 }
.ft-rh-cad { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; padding: 14px 16px; animation: ftEntra .4s both }
.ft-rh-cad div { display: grid } .ft-rh-cad small { font-size: 11.5px; color: ${MUDO}; font-weight: 700 } .ft-rh-cad b { font-size: 14px }
.ft-dupla { display: grid; grid-template-columns: 1fr 1fr; gap: 12px } @media (max-width: 800px) { .ft-dupla { grid-template-columns: 1fr } .ft-carro-nums { grid-template-columns: repeat(2, 1fr) } .ft-carros { grid-template-columns: 1fr } .ft-barra { grid-template-columns: 110px 1fr 80px 24px } .ft-cab { flex-wrap: wrap } .ft-dias { gap: 1px } .ft-dia-bar em { display: none } }
.ft-ferias { display: grid; grid-template-columns: 160px 1fr auto auto; gap: 10px; align-items: center; font-size: 13px } .ft-ferias > div { height: 9px; background: #e0f2fe; border-radius: 99px; overflow: hidden } .ft-ferias i { display: block; height: 100%; background: #0d9488; border-radius: 99px; transform-origin: left; animation: ftLarga .8s both } .ft-ferias small { color: ${MUDO} } .ft-ferias small.verm { color: #dc2626; font-weight: 800 }
.ft-linha { display: grid; grid-template-columns: 140px 110px 1fr; gap: 10px; align-items: baseline; font-size: 13px; padding: 4px 0; border-top: 1px solid var(--portal-border, #f1f5f9) } .ft-linha span { color: ${MUDO} } .ft-linha .ft-chip { justify-self: start } .ft-linha small { color: ${MUDO}; overflow: hidden; text-overflow: ellipsis }
.ft-doc { position: fixed; inset: 0; z-index: 100080 }
.ft-req-fundo { position: fixed; inset: 0; z-index: 100080; background: rgba(15,23,42,.55); display: flex; align-items: center; justify-content: center; padding: 16px; animation: ftFade .2s both }
.ft-req-jan { width: min(1100px, 100%); height: 92vh; display: flex; flex-direction: column; background: var(--portal-bg-card, #fefefe); border-radius: 18px; overflow: hidden; animation: ftSobe .4s cubic-bezier(.2,1.1,.3,1) both }
.ft-req-cab { display: flex; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--portal-border, #e2e8f0) } .ft-req-cab span { flex: 1; color: ${MUDO}; font-size: 13px } .ft-req-cab button { border: none; background: none; font-size: 18px; cursor: pointer; color: #334155 }
.ft-req-jan iframe { flex: 1; width: 100%; border: none; background: #fefefe }
`

// ============================================================================ peças reaproveitáveis (opções da página de teste)
/** Busca a ficha antes de alguém clicar (os cards chamam ao aparecer) — o clique abre na hora. */
const buscando = new Map<string, Promise<void>>()
export function prefetchFicha(nome: string, mes: string) {
  const chave = `${nome}|${mes}`
  if (cache.has(chave) || buscando.has(chave)) return
  const p = (async () => {
    try {
      const r = await fetch(`/api/mecanicos/tecnico?nome=${encodeURIComponent(nome)}&mes=${mes}`, { headers: await authHeaders(), cache: 'no-store' })
      if (r.ok) cache.set(chave, await r.json())
    } catch { /* tenta de novo no clique */ } finally { buscando.delete(chave) }
  })()
  buscando.set(chave, p)
}

/** Carrega a ficha de `nome` no mês (cache por técnico+mês). */
let cacheVersao = 0
export function useFicha(nome: string | null, mes: string): { dados: Ficha | null; erro: string | null } {
  const chave = `${nome}|${mes}`
  // aviso ao vivo: a ficha guardada ficou velha — busca de novo (a da tela fica até a nova chegar)
  const versao = useVersaoAoVivo()
  if (versao !== cacheVersao) { cache.clear(); cacheVersao = versao }
  const [estado, setEstado] = useState<{ chave: string; dados: Ficha | null; erro: string | null }>(() => ({ chave, dados: cache.get(chave) || null, erro: null }))
  useEffect(() => {
    if (!nome) return
    let vivo = true
    const c = cache.get(chave)
    if (c) { setEstado({ chave, dados: c, erro: null }); return }
    setEstado((e) => (e.chave === chave && e.dados ? e : { chave, dados: null, erro: null }))
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/tecnico?nome=${encodeURIComponent(nome)}&mes=${mes}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Falha ao carregar a ficha')
        cache.set(chave, j)
        if (vivo) setEstado({ chave, dados: j, erro: null })
      } catch (e) { if (vivo) setEstado({ chave, dados: null, erro: e instanceof Error ? e.message : 'Falha ao carregar a ficha' }) }
    })()
    return () => { vivo = false }
  }, [chave, nome, mes, versao])
  return estado.chave === chave ? { dados: estado.dados, erro: estado.erro } : { dados: null, erro: null }
}

/** OS e requisição abrindo em janela por cima (mesmo comportamento da ficha). */
export function useVisores(d: Ficha | null) {
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null)
  const [req, setReq] = useState<{ id: number; titulo: string } | null>(null)
  // OS do portal abre junto com o relatório do técnico (José, 29/10/2026)
  const [osRel, setOsRel] = useState<{ os: string; cliente?: string } | null>(null)
  const verOS = (os: string, cliente?: string) => {
    if (os.startsWith('OMIE ')) {
      const cod = d?.codOmie?.[os.slice(5)]
      if (cod) setDoc({ titulo: `OS ${os.slice(5)} (Omie) · ${cliente || ''}`, url: `/api/clientes/print?tipo=os&cod=${cod}&empresa=${encodeURIComponent('Nova Tratores')}`, nome: `OS-${os.slice(5)}` })
    } else if (/^OS-\d+$/i.test(os)) setOsRel({ os, cliente })
    else setDoc({ titulo: `${os} · ${cliente || ''}`, url: `/api/pos/ordens/${encodeURIComponent(os)}/print`, nome: os })
  }
  const camadas = (
    <>
      {doc && <div className="ft-doc" onClick={(e) => e.stopPropagation()}><VisualizadorDocumento key={doc.url} doc={doc} onClose={() => setDoc(null)} /></div>}
      {osRel && <OSRelatorioJanela os={osRel.os} cliente={osRel.cliente} onFechar={() => setOsRel(null)} />}
      {req && (
        <div className="ft-req-fundo" onClick={(e) => { e.stopPropagation(); setReq(null) }}>
          <div className="ft-req-jan" onClick={(e) => e.stopPropagation()}>
            <div className="ft-req-cab"><b>Requisição #{req.id}</b><span>{req.titulo}</span><button type="button" onClick={() => setReq(null)} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
            <iframe src={`/requisicoes/imprimir/${req.id}`} title={`Requisição ${req.id}`} />
          </div>
        </div>
      )}
    </>
  )
  return { verOS, verReq: setReq, camadas: typeof document === 'undefined' ? camadas : createPortal(camadas, document.body) }
}
