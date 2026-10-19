'use client'
// Detalhe de um cartão dos "Destaques que giram" (José, 17/10/2026: "se a gente clicar em cada card
// tem que explicar certinho completo o que cada coisa é, de onde veio… mostra PDF de ordens,
// requisição, por ali mesmo com um modal"). Explica o número, mostra a conta com os valores reais,
// a fonte dos dados e as OS (e requisições) que formam o valor — cada uma abre o PDF numa janela.
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { OSFaturada, ReqCusto } from '@/lib/mecanicos/painel'
import { MESES } from '@/lib/mecanicos/fita'
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento'
import type { Bloco, PorDia } from './DestaquesGiram'
import { brl, horas } from './ui'

const MUDO = 'var(--portal-text-muted, #64748b)'
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
function somaDias(d: string, n: number) { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
function diaSem(d: string) { return new Date(`${d}T12:00:00Z`).getUTCDay() }
function ultimoDia(a: number, m: number) { return new Date(Date.UTC(a, m, 0)).getUTCDate() }
function br(d: string) { return `${d.slice(8)}/${d.slice(5, 7)}` }

const FONTE_OS = (
  <ul>
    <li><b>Valor de cada OS</b> = o que foi faturado no <b>Omie</b> (espelho das notas de serviço da Nova), no <b>dia em que a OS fechou</b>. OS faturada pelo portal que ainda não chegou no espelho usa a conta do portal (horas × valor da hora + km).</li>
    <li><b>Mão de obra</b> = linhas de hora da OS · <b>Deslocamento</b> = linhas de km · <b>Peças</b> = o pedido de peças (PPV) da OS como foi faturado na nota de peças (sem nota ainda, o valor do PPV) · <b>Outros</b> = demais linhas da OS (requisições cobradas, serviços extras).</li>
    <li>OS dividida entre dois técnicos conta metade para cada um.</li>
    <li><b>Não entram</b>: OS interna (contrato Interno, Cortesia, Entrega Técnica, tipo de serviço interno), OS cancelada e comissão de venda de equipamento.</li>
  </ul>
)

type Ordem = 'data' | 'valor' | 'cliente' | 'tecnico'

/** Tabela das OS: ordenável, soma no rodapé, "ver" abre o PDF da OS numa janela. */
function TabelaOS({ titulo, os, onVer, onReq }: { titulo: string; os: OSFaturada[]; onVer: (o: OSFaturada) => void; onReq?: (r: ReqCusto & { os: string }) => void }) {
  const [ordem, setOrdem] = useState<Ordem>('valor')
  const lista = useMemo(() => [...os].sort((a, b) => ordem === 'valor' ? b.bruto - a.bruto : ordem === 'data' ? b.data.localeCompare(a.data) : ordem === 'cliente' ? (a.cliente || '').localeCompare(b.cliente || '') : (a.tecnicos[0] || '').localeCompare(b.tecnicos[0] || '')), [os, ordem])
  const soma = (f: (o: OSFaturada) => number) => lista.reduce((s, o) => s + f(o), 0)
  const th = (k: Ordem, r: string) => <th onClick={() => setOrdem(k)} className={ordem === k ? 'on' : ''}>{r}{ordem === k ? ' ▾' : ''}</th>
  return (
    <div className="dd-bloco">
      <div className="dd-bloco-tit">{titulo} <small>{lista.length} OS · clique no título da coluna para ordenar · <i className="fas fa-file-pdf" /> abre a OS</small></div>
      {lista.length === 0 ? <div className="dd-vazio">Nenhuma OS.</div> : (
        <div className="dd-tab-caixa">
          <table className="dd-tab">
            <thead><tr>{th('data', 'Data')}<th>OS</th>{th('cliente', 'Cliente')}{th('tecnico', 'Técnico')}<th>Mão de obra</th><th>Desloc.</th><th>Peças</th><th>Outros</th>{th('valor', 'Total')}<th>Terceiros</th><th /></tr></thead>
            <tbody>
              {lista.map((o, i) => (
                <tr key={o.os} style={{ animationDelay: `${300 + Math.min(i, 20) * 30}ms` }}>
                  <td>{br(o.data)}</td>
                  <td><b>{o.os}</b>{o.numeroOmie && <small> · Omie {o.numeroOmie}</small>}{o.nota === false && <em className="dd-tag">recibo</em>}{o.garantia && <em className="dd-tag g">garantia</em>}</td>
                  <td className="dd-cli">{o.cliente || '—'}</td>
                  <td>{o.tecnicos.join(' + ') || 'sem técnico'}</td>
                  <td>{brl(o.servico)}</td><td>{brl(o.kmValor)}</td><td>{brl(o.pecas)}</td><td>{brl(o.outros)}</td>
                  <td><b>{brl(o.bruto)}</b></td>
                  <td>{o.custo > 0 ? (o.requisicoes || []).map((r) => <button key={r.id} type="button" className="dd-req" onClick={() => onReq?.({ ...r, os: o.os })} title={`${r.tipo} · ${r.titulo}`}>#{r.id} {brl(r.valor)}</button>) : '—'}</td>
                  <td>{o.os.startsWith('OMIE') ? <span className="dd-so" title="OS lançada só no Omie (não existe no portal)">só Omie</span> : <button type="button" className="dd-ver" onClick={() => onVer(o)}><i className="fas fa-file-pdf" /> ver</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={4}>Total</td><td>{brl(soma((o) => o.servico))}</td><td>{brl(soma((o) => o.kmValor))}</td><td>{brl(soma((o) => o.pecas))}</td><td>{brl(soma((o) => o.outros))}</td><td><b>{brl(soma((o) => o.bruto))}</b></td><td>{brl(soma((o) => o.custo))}</td><td /></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

interface Secao { titulo: string; icone: string; corpo: React.ReactNode }
interface Conteudo { titulo: string; cor: string; icone: string; resumo: React.ReactNode; secoes: Secao[]; tabelas: { titulo: string; os: OSFaturada[] }[] }

export default function DetalheDestaque({ chave, blocos, faturadas, porDia, hoje, onFechar }: { chave: string; blocos: Bloco[]; faturadas: OSFaturada[]; porDia: PorDia; hoje: string; onFechar: () => void }) {
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null)
  const [req, setReq] = useState<(ReqCusto & { os: string }) | null>(null)
  const [verReq, setVerReq] = useState<'req' | 'nota'>('req')
  const c = useMemo<Conteudo>(() => {
    const [dia, semana, mes] = blocos
    const [a, m] = hoje.split('-').map(Number)
    const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1
    const nomeMes = MESES[m - 1], nomeAnt = MESES[pm - 1]
    const ini = `${hoje.slice(0, 8)}01`
    const entre = (de: string, ate: string) => faturadas.filter((o) => o.data >= de && o.data <= ate)
    const fim = `${hoje.slice(0, 8)}${String(ultimoDia(a, m)).padStart(2, '0')}`
    let passados = 0, restantes = 0
    for (let d = ini; d <= fim; d = somaDias(d, 1)) { const w = diaSem(d); if (w >= 1 && w <= 5) { if (d <= hoje) passados++; else restantes++ } }
    const iniAnt = `${pa}-${String(pm).padStart(2, '0')}-01`, fimAntPonto = `${iniAnt.slice(0, 8)}${String(Math.min(Number(hoje.slice(8)), ultimoDia(pa, pm))).padStart(2, '0')}`
    const fonte: Secao = { titulo: 'De onde vêm os dados', icone: 'fa-database', corpo: FONTE_OS }
    const conta = (linhas: [string, React.ReactNode][]) => <div className="dd-conta">{linhas.map(([r, v], i) => <div key={i} style={{ animationDelay: `${150 + i * 60}ms` }}><span>{r}</span><b>{v}</b></div>)}</div>
    const p = (x: number, y: number) => (y > 0 ? `${Math.round(((x - y) / y) * 100) >= 0 ? '+' : ''}${Math.round(((x - y) / y) * 100)}%` : '—')

    switch (chave) {
      case 'hoje': {
        const antes = somaDias(hoje, -7)
        return { titulo: `Hoje — ${SEM[diaSem(hoje)]} ${br(hoje)}`, cor: '#f59e0b', icone: 'fa-sun', resumo: <>Faturado hoje: <b>{brl(dia.s.bruto)}</b> em {dia.s.os} OS.</>,
          secoes: [
            { titulo: 'O que é', icone: 'fa-circle-question', corpo: <p>A soma das OS que <b>fecharam hoje</b> (faturadas no Omie ou pelo portal). A comparação é com o <b>mesmo dia da semana passada</b> ({SEM[diaSem(antes)]} {br(antes)}), porque cada dia da semana tem um movimento diferente.</p> },
            { titulo: 'Como foi calculado', icone: 'fa-calculator', corpo: conta([['Hoje', brl(dia.s.bruto)], [`${SEM[diaSem(antes)]} ${br(antes)}`, brl(dia.ritmo?.anterior || 0)], ['Diferença', `${brl(dia.s.bruto - (dia.ritmo?.anterior || 0))} (${p(dia.s.bruto, dia.ritmo?.anterior || 0)})`], ['Horas cobradas hoje', horas(dia.s.horas)]]) },
            fonte,
          ],
          tabelas: [{ titulo: 'OS faturadas hoje', os: entre(hoje, hoje) }, { titulo: `OS de ${SEM[diaSem(antes)]} ${br(antes)} (para comparar)`, os: entre(antes, antes) }] }
      }
      case 'semana': {
        const seg = somaDias(hoje, -((diaSem(hoje) + 6) % 7)), segAnt = somaDias(seg, -7)
        return { titulo: `Esta semana — ${br(seg)} a ${br(somaDias(seg, 6))}`, cor: '#2563eb', icone: 'fa-calendar-week', resumo: <>Faturado de segunda até hoje: <b>{brl(semana.s.bruto)}</b> em {semana.s.os} OS.</>,
          secoes: [
            { titulo: 'O que é', icone: 'fa-circle-question', corpo: <p>A soma das OS que fecharam de <b>segunda ({br(seg)}) até hoje</b>. A comparação é com o <b>mesmo trecho</b> da semana passada ({br(segAnt)} a {br(somaDias(hoje, -7))}) — assim uma semana pela metade não é comparada com uma semana inteira.</p> },
            { titulo: 'Como foi calculado', icone: 'fa-calculator', corpo: <>
              {conta([['Esta semana até hoje', brl(semana.s.bruto)], ['Semana passada no mesmo trecho', brl(semana.ritmo?.anterior || 0)], ['Diferença', `${brl(semana.s.bruto - (semana.ritmo?.anterior || 0))} (${p(semana.s.bruto, semana.ritmo?.anterior || 0)})`], ['Semana passada inteira', brl(semana.ritmo?.anteriorCheio || 0)]])}
              <div className="dd-dias">{Array.from({ length: 7 }, (_, i) => somaDias(seg, i)).map((d) => <div key={d} className={d === hoje ? 'on' : ''}><small>{SEM[diaSem(d)]} {br(d)}</small><b>{d <= hoje ? brl(porDia[d]?.[0] || 0) : '—'}</b><span>passada: {brl(porDia[somaDias(d, -7)]?.[0] || 0)}</span></div>)}</div>
            </> },
            fonte,
          ],
          tabelas: [{ titulo: 'OS desta semana', os: entre(seg, hoje) }, { titulo: 'OS da semana passada no mesmo trecho', os: entre(segAnt, somaDias(hoje, -7)) }] }
      }
      case 'mes': case 'proj': {
        const cheio = mes.ritmo?.anteriorCheio || 0, proj = mes.ritmo?.projecao || 0
        const ritmo = passados ? mes.s.bruto / passados : 0
        const projecao = chave === 'proj'
        return { titulo: projecao ? 'Previsão de fechamento do mês' : `Este mês — ${nomeMes}`, cor: projecao ? '#0ea5e9' : '#8b5cf6', icone: projecao ? 'fa-bullseye' : 'fa-calendar',
          resumo: projecao ? <>No ritmo de agora, {nomeMes} fecha em <b>{brl(proj)}</b>.</> : <>Faturado em {nomeMes} até hoje: <b>{brl(mes.s.bruto)}</b> em {mes.s.os} OS.</>,
          secoes: [
            { titulo: 'O que é', icone: 'fa-circle-question', corpo: projecao
              ? <p>Uma <b>estimativa</b> de como o mês termina se o ritmo continuar igual. Usa só os <b>dias úteis</b> (segunda a sexta), porque é quando a oficina trabalha. Não é meta, é a tendência de agora.</p>
              : <p>A soma das OS que fecharam de <b>1º de {nomeMes} até hoje</b>. É comparada com {nomeAnt} <b>até o mesmo dia</b> e com {nomeAnt} <b>inteiro</b>.</p> },
            { titulo: 'Como foi calculado', icone: 'fa-calculator', corpo: conta(projecao ? [
              ['Faturado até hoje', brl(mes.s.bruto)], ['Dias úteis que já passaram', String(passados)], ['Ritmo = faturado ÷ dias úteis', `${brl(ritmo)} por dia útil`], ['Dias úteis do mês inteiro', String(passados + restantes)], ['Previsão = ritmo × dias úteis do mês', brl(proj)], [`${nomeAnt} inteiro`, brl(cheio)], ['Diferença prevista', `${brl(proj - cheio)} (${p(proj, cheio)})`],
            ] : [
              [`${nomeMes} até hoje`, brl(mes.s.bruto)], [`${nomeAnt} até o dia ${Number(hoje.slice(8))}`, brl(mes.ritmo?.anterior || 0)], ['Diferença no mesmo ponto', `${brl(mes.s.bruto - (mes.ritmo?.anterior || 0))} (${p(mes.s.bruto, mes.ritmo?.anterior || 0)})`], [`${nomeAnt} inteiro`, brl(cheio)], [`Já fez de ${nomeAnt} inteiro`, cheio ? `${Math.round((mes.s.bruto / cheio) * 100)}%` : '—'], ['Ritmo de agora', `${brl(ritmo)} por dia útil (${passados} dias úteis)`], [`Para empatar com ${nomeAnt}`, cheio > mes.s.bruto && restantes ? `${brl((cheio - mes.s.bruto) / restantes)} por dia útil nos ${restantes} que faltam` : 'já passou'],
            ]) },
            fonte,
          ],
          tabelas: [{ titulo: `OS de ${nomeMes} até hoje`, os: entre(ini, hoje) }, { titulo: `OS de ${nomeAnt} até o dia ${Number(hoje.slice(8))} (para comparar)`, os: entre(iniAnt, fimAntPonto) }] }
      }
      case 'tec': {
        const doMes = entre(ini, hoje)
        const tec: Record<string, { v: number; os: number; h: number; lista: OSFaturada[] }> = {}
        for (const o of doMes) { const ts = o.tecnicos.length ? o.tecnicos : ['Sem técnico']; for (const t of ts) { const x = (tec[t] ||= { v: 0, os: 0, h: 0, lista: [] }); x.v += o.bruto / ts.length; x.os += 1 / ts.length; x.h += o.horasCobradas / ts.length; x.lista.push(o) } }
        const rank = Object.entries(tec).sort((x, y) => y[1].v - x[1].v)
        return { titulo: 'Quem mais faturou no mês', cor: '#eab308', icone: 'fa-crown', resumo: <>Ranking de {nomeMes} pelo valor das OS faturadas.</>,
          secoes: [
            { titulo: 'O que é', icone: 'fa-circle-question', corpo: <p>Quanto cada técnico <b>trouxe em OS faturadas</b> no mês. Quando a OS tem dois técnicos, o valor é <b>dividido igualmente</b> entre eles. Mostra faturamento (o que o cliente pagou), não lucro.</p> },
            { titulo: 'Como foi calculado', icone: 'fa-calculator', corpo: conta(rank.map(([n, x]) => [n, `${brl(x.v)} · ${Math.round(x.os * 10) / 10} OS · ${horas(x.h)} · ${Math.round((x.v / Math.max(1, mes.s.bruto)) * 100)}% do mês`] as [string, string])) },
            fonte,
          ],
          tabelas: rank.map(([n, x]) => ({ titulo: `OS de ${n}`, os: x.lista })) }
      }
      case 'os': {
        const doMes = entre(ini, hoje)
        return { titulo: 'Maiores OS do mês', cor: '#a855f7', icone: 'fa-trophy', resumo: <>As OS de {nomeMes} da maior para a menor.</>,
          secoes: [
            { titulo: 'O que é', icone: 'fa-circle-question', corpo: <p>As ordens de serviço de <b>maior valor</b> faturadas no mês. O valor é o total da OS: mão de obra + deslocamento + peças + outros.</p> },
            { titulo: 'Como foi calculado', icone: 'fa-calculator', corpo: conta([['OS no mês', String(doMes.length)], ['Total', brl(mes.s.bruto)], ['Ticket médio = total ÷ OS', brl(doMes.length ? mes.s.bruto / doMes.length : 0)]]) },
            fonte,
          ],
          tabelas: [{ titulo: `Todas as OS de ${nomeMes}`, os: doMes }] }
      }
      case 'dias': {
        const dias = Object.entries(porDia).filter(([d]) => d >= ini && d <= hoje && porDia[d][0] > 0).sort((x, y) => y[1][0] - x[1][0])
        return { titulo: 'Melhores dias do mês', cor: '#ef4444', icone: 'fa-fire', resumo: <>Os dias de {nomeMes} em que mais se faturou.</>,
          secoes: [
            { titulo: 'O que é', icone: 'fa-circle-question', corpo: <p>Soma das OS que <b>fecharam em cada dia</b>. Um dia forte normalmente é quando várias OS grandes foram faturadas juntas.</p> },
            { titulo: 'Como foi calculado', icone: 'fa-calculator', corpo: conta(dias.map(([d, v]) => [`${SEM[diaSem(d)]} ${br(d)}`, `${brl(v[0])} · ${v[2]} OS · ${horas(v[1])}`] as [string, string])) },
            fonte,
          ],
          tabelas: dias.slice(0, 5).map(([d]) => ({ titulo: `OS de ${SEM[diaSem(d)]} ${br(d)}`, os: entre(d, d) })) }
      }
      case 'fonte': {
        const doMes = entre(ini, hoje)
        return { titulo: 'De onde veio o dinheiro do mês', cor: '#06b6d4', icone: 'fa-chart-pie', resumo: <>{nomeMes} até hoje: <b>{brl(mes.s.bruto)}</b>, separado pelo que foi cobrado.</>,
          secoes: [
            { titulo: 'O que é cada parte', icone: 'fa-circle-question', corpo: <ul>
              <li><b>Mão de obra</b> ({brl(mes.s.servico)}) — horas de serviço cobradas nas OS ({horas(mes.s.horas)} no mês).</li>
              <li><b>Deslocamento</b> ({brl(mes.s.kmValor)}) — km cobrados para ir até o cliente ({Math.round(mes.s.km).toLocaleString('pt-BR')} km).</li>
              <li><b>Peças</b> ({brl(mes.s.pecas)}) — peças vendidas junto da OS (pedido de peças / PPV).</li>
              <li><b>Outros</b> ({brl(Math.max(0, mes.s.outros))}) — demais linhas da OS: requisições cobradas do cliente, serviços extras.</li>
              <li><b>Terceiros</b> (−{brl(mes.s.custo)}) — requisições que o técnico pediu como Trator-Cliente e que <b>não foram cobradas</b> do cliente: a empresa pagou. Clique no número da requisição na tabela para ver.</li>
            </ul> },
            { titulo: 'Como foi calculado', icone: 'fa-calculator', corpo: conta([['Mão de obra', brl(mes.s.servico)], ['+ Deslocamento', brl(mes.s.kmValor)], ['+ Peças', brl(mes.s.pecas)], ['+ Outros', brl(Math.max(0, mes.s.outros))], ['= Faturado', brl(mes.s.bruto)], ['− Terceiros não cobrados', brl(mes.s.custo)], ['= Sobra depois dos terceiros', brl(mes.s.liquido)]]) },
            fonte,
          ],
          tabelas: [{ titulo: `OS de ${nomeMes} com cada parte separada`, os: doMes }] }
      }
      default: {
        const doMes = entre(ini, hoje), ant = entre(iniAnt, fimAntPonto)
        return { titulo: 'Quantidade e valor das OS', cor: '#10b981', icone: 'fa-file-invoice-dollar', resumo: <>{doMes.length} OS em {nomeMes} até hoje · {nomeAnt} no mesmo ponto: {ant.length}.</>,
          secoes: [
            { titulo: 'O que é', icone: 'fa-circle-question', corpo: <p>Mostra se o faturamento veio de <b>mais OS</b> ou de <b>OS maiores</b>. O <b>ticket médio</b> é o valor médio de cada OS.</p> },
            { titulo: 'Como foi calculado', icone: 'fa-calculator', corpo: conta([['OS faturadas', `${doMes.length} (${nomeAnt}: ${ant.length})`], ['Ticket médio = total ÷ OS', `${brl(doMes.length ? mes.s.bruto / doMes.length : 0)} (${nomeAnt}: ${brl(ant.length ? ant.reduce((s, o) => s + o.bruto, 0) / ant.length : 0)})`], ['OS por dia útil', passados ? (doMes.length / passados).toFixed(1).replace('.', ',') : '0'], ['Horas cobradas por OS', doMes.length ? horas(mes.s.horas / doMes.length) : '—']]) },
            fonte,
          ],
          tabelas: [{ titulo: `OS de ${nomeMes} até hoje`, os: doMes }, { titulo: `OS de ${nomeAnt} até o dia ${Number(hoje.slice(8))}`, os: ant }] }
      }
    }
  }, [chave, blocos, faturadas, porDia, hoje])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="dd-fundo" onClick={onFechar}>
      <style>{ESTILO_DD}</style>
      <div className="dd-janela" style={{ ['--c' as string]: c.cor }} onClick={(e) => e.stopPropagation()}>
        <div className="dd-cab">
          <span className="dd-ic"><i className={`fas ${c.icone}`} /></span>
          <div style={{ flex: 1, minWidth: 0 }}><b>{c.titulo}</b><span>{c.resumo}</span></div>
          <button type="button" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button>
        </div>
        <div className="dd-corpo">
          <div className="dd-secoes">
            {c.secoes.map((s) => <div key={s.titulo} className="dd-secao"><div className="dd-sec-tit"><i className={`fas ${s.icone}`} /> {s.titulo}</div>{s.corpo}</div>)}
          </div>
          {c.tabelas.map((t) => <TabelaOS key={t.titulo} titulo={t.titulo} os={t.os}
            onVer={(o) => setDoc({ titulo: `${o.os} · ${o.cliente || ''}`, url: `/api/pos/ordens/${encodeURIComponent(o.os)}/print`, nome: o.os })}
            onReq={(r) => { setVerReq('req'); setReq(r) }} />)}
        </div>
      </div>
      {doc && <div className="dd-doc" onClick={(e) => e.stopPropagation()}><VisualizadorDocumento key={doc.url} doc={doc} onClose={() => setDoc(null)} /></div>}
      {req && (
        <div className="dd-req-fundo" onClick={(e) => { e.stopPropagation(); setReq(null) }}>
          <div className="dd-req-jan" onClick={(e) => e.stopPropagation()}>
            <div className="dd-cab">
              <span className="dd-ic" style={{ background: '#dc2626' }}><i className="fas fa-receipt" /></span>
              <div style={{ flex: 1, minWidth: 0 }}><b>Requisição #{req.id} · {brl(req.valor)}</b><span>{req.tipo} · {req.titulo} · {req.fornecedor || 'sem fornecedor'} · pedida por {req.solicitante || '—'} · OS {req.os}</span></div>
              {req.nota && <div className="dd-abas"><button type="button" className={verReq === 'req' ? 'on' : ''} onClick={() => setVerReq('req')}>Requisição</button><button type="button" className={verReq === 'nota' ? 'on' : ''} onClick={() => setVerReq('nota')}>Nota</button></div>}
              <button type="button" onClick={() => setReq(null)} aria-label="Fechar"><i className="fas fa-xmark" /></button>
            </div>
            <iframe key={`${req.id}:${verReq}`} src={verReq === 'nota' && req.nota ? req.nota : `/requisicoes/imprimir/${req.id}`} title={`Requisição ${req.id}`} className="dd-req-frame" />
          </div>
        </div>
      )}
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body,
  )
}

const ESTILO_DD = `
.dd-fundo { position: fixed; inset: 0; z-index: 100060; background: rgba(15,23,42,.5); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: ddFade .2s both }
@keyframes ddFade { from { opacity: 0 } }
.dd-janela { --c: #2563eb; width: min(1680px, 98vw); max-height: 94vh; display: flex; flex-direction: column; background: var(--portal-bg-card, #fefefe); border-radius: 20px; box-shadow: 0 30px 80px rgba(0,0,0,.35); overflow: hidden; border-top: 5px solid var(--c); animation: ddSobe .35s cubic-bezier(.2,1.1,.3,1) both }
@keyframes ddSobe { from { opacity: 0; transform: translateY(30px) scale(.94); filter: blur(4px) } }
.dd-secao { animation: ddSecao .5s cubic-bezier(.2,.9,.3,1) both } .dd-secao:nth-child(2) { animation-delay: .1s } .dd-secao:nth-child(3) { animation-delay: .2s }
@keyframes ddSecao { from { opacity: 0; transform: translateY(14px) } }
.dd-bloco { animation: ddSecao .5s .25s both }
.dd-tab tbody tr { animation: ddLinha .35s ease both }
@keyframes ddLinha { from { opacity: 0; transform: translateX(-12px) } }
.dd-conta > div { animation: ddLinha .35s ease both }
.dd-doc { position: fixed; inset: 0; z-index: 100080; animation: ddDoc .4s cubic-bezier(.2,1.1,.3,1) both } @keyframes ddDoc { from { opacity: 0; transform: scale(.94) } }
.dd-cab { display: flex; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--portal-border, #e5e7eb) }
.dd-cab b { display: block; font-size: 18px; font-weight: 900; color: var(--portal-text, #0f172a) } .dd-cab span { display: block; font-size: 13.5px; color: ${MUDO} } .dd-cab span b { display: inline; font-size: 13.5px }
.dd-cab > button { border: none; background: var(--portal-bg-secondary, #f1f5f9); width: 36px; height: 36px; border-radius: 10px; font-size: 17px; cursor: pointer; color: ${MUDO}; flex-shrink: 0 }
.dd-ic { width: 42px; height: 42px; border-radius: 13px; background: var(--c); color: #fefefe; display: grid; place-items: center; font-size: 18px; flex-shrink: 0; animation: ddIc .6s .15s cubic-bezier(.2,1.6,.4,1) both } .dd-ic i { line-height: 1; position: static; margin: 0 }
@keyframes ddIc { from { transform: scale(.3) rotate(-25deg) } }
.dd-corpo { overflow-y: auto; padding: 16px 18px; display: grid; gap: 16px }
.dd-secoes { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px }
.dd-secao { background: var(--portal-bg-secondary, #f8fafc); border-radius: 14px; padding: 12px 14px; font-size: 13.5px; line-height: 1.5; color: var(--portal-text, #334155) }
.dd-secao p { margin: 0 } .dd-secao ul { margin: 0; padding-left: 18px; display: grid; gap: 4px }
.dd-sec-tit { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .5px; color: var(--c); margin-bottom: 8px }
.dd-conta { display: grid; gap: 4px } .dd-conta > div { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px dashed var(--portal-border, #e2e8f0); padding-bottom: 3px } .dd-conta span { color: ${MUDO} } .dd-conta b { font-variant-numeric: tabular-nums; text-align: right }
.dd-dias { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 10px } .dd-dias > div { background: var(--portal-bg-card, #fefefe); border-radius: 8px; padding: 6px; text-align: center; display: grid; font-size: 11.5px } .dd-dias > div.on { outline: 2px solid var(--c) } .dd-dias small { color: ${MUDO} } .dd-dias span { color: ${MUDO}; font-size: 10.5px }
.dd-bloco { display: grid; gap: 6px }
.dd-bloco-tit { font-size: 14.5px; font-weight: 900; color: var(--portal-text, #0f172a) } .dd-bloco-tit small { font-weight: 600; font-size: 12px; color: ${MUDO} }
.dd-vazio { font-size: 13px; color: ${MUDO}; padding: 8px 0 }
.dd-tab-caixa { overflow-x: auto; border: 1px solid var(--portal-border, #e5e7eb); border-radius: 12px; max-height: 420px; overflow-y: auto }
.dd-tab { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums }
.dd-tab th { position: sticky; top: 0; background: var(--portal-bg-secondary, #f1f5f9); text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; color: ${MUDO}; white-space: nowrap; cursor: pointer; user-select: none } .dd-tab th.on { color: var(--c) }
.dd-tab td { padding: 7px 10px; border-top: 1px solid var(--portal-border, #f1f5f9); white-space: nowrap } .dd-tab tbody tr:hover { background: var(--portal-bg-secondary, #f8fafc) }
.dd-tab tfoot td { font-weight: 800; background: var(--portal-bg-secondary, #f8fafc); position: sticky; bottom: 0 }
.dd-cli { max-width: 360px; overflow: hidden; text-overflow: ellipsis } .dd-tab small { color: ${MUDO} }
.dd-tag { font-style: normal; margin-left: 6px; font-size: 10px; font-weight: 900; border-radius: 6px; padding: 1px 6px; background: #fef3c7; color: #92400e } .dd-tag.g { background: #ede9fe; color: #6d28d9 }
.dd-ver { border: 1px solid var(--c); background: transparent; color: var(--c); border-radius: 8px; padding: 3px 9px; font-family: inherit; font-size: 12px; font-weight: 800; cursor: pointer } .dd-ver:hover { background: var(--c); color: #fefefe }
.dd-req { border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 6px; padding: 1px 6px; margin-right: 3px; font-family: inherit; font-size: 11.5px; font-weight: 800; cursor: pointer }
.dd-so { font-size: 11px; color: ${MUDO} }
.dd-req-fundo { position: fixed; inset: 0; z-index: 100080; background: rgba(15,23,42,.55); display: flex; align-items: center; justify-content: center; padding: 16px; animation: ddFade .2s both }
.dd-req-jan { animation: ddSobe .45s cubic-bezier(.2,1.15,.3,1) both; width: min(1100px, 100%); height: 92vh; display: flex; flex-direction: column; background: var(--portal-bg-card, #fefefe); border-radius: 18px; overflow: hidden }
.dd-req-frame { flex: 1; width: 100%; border: none; background: #fefefe }
.dd-abas { display: flex; gap: 4px } .dd-abas button { border: 1px solid var(--portal-border, #e2e8f0); background: transparent; border-radius: 8px; padding: 5px 10px; font-family: inherit; font-weight: 800; font-size: 12px; cursor: pointer } .dd-abas button.on { background: #dc2626; color: #fefefe; border-color: #dc2626 }
`
