'use client'
// Opções novas da Agenda do Financeiro em teste (/financeiro/agenda/teste, 30/10/2026): mesma rota e mesmas
// regras da tela atual (lib/financeiro/agenda.ts); muda só a forma de mostrar. Clicar num título abre a
// janela completa, com o histórico do cliente ou fornecedor.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { fetchAuth } from '@/lib/auth/client'
import { diasEntre, segundaDaSemana, somarDias, type Agenda, type DiaAgenda, type HistoricoPessoa, type ItemAgenda } from '@/lib/financeiro/agenda'

export type OpcaoAgenda = 2 | 3 | 4 | 5 | 6
type Conta = 'NOVA' | 'CASTRO' | 'todas'
type Resposta = Agenda & { ok: boolean; error?: string }

const COR = { entra: '#059669', sai: '#9333ea', pago: '#16a34a', atrasado: '#dc2626', hoje: '#d97706', azul: '#2563eb' }
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

const brl = (n: number) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brlCurto = (n: number) => (Math.abs(n) >= 1000 ? `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(n))
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const ddmmaa = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')
// o Omie grava data_inclusao/data_alteracao na hora de Brasília, sem fuso: mostra como veio
const quando = (s: string | null) => {
  if (!s) return '—'
  return s.length <= 10 ? ddmmaa(s) : `${ddmmaa(s)} ${s.slice(11, 16)}`
}
// synced_at é gravado em UTC, sem fuso
const quandoUTC = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}
// o Omie às vezes devolve o código do usuário (P000485635) em vez do nome: não ajuda ninguém
const porQuem = (s: string) => (s && !/^P\d+$/.test(s) ? `por ${s} ` : '')
function hojeLocalBR(): string {
  const p: Record<string, string> = {}
  for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value
  return `${p.year}-${p.month}-${p.day}`
}
const valorDe = (i: ItemAgenda) => (i.situacao === 'pago' ? i.valorPago : i.valorAberto)
const soma = (l: ItemAgenda[]) => l.reduce((n, i) => n + valorDe(i), 0)
const entradas = (l: ItemAgenda[]) => l.filter((i) => i.tipo === 'receber')
const saidas = (l: ItemAgenda[]) => l.filter((i) => i.tipo === 'pagar')
// "003/004" → "3 de 4"; se vier em outro formato, mostra como veio
function parcelaLegivel(p: string) {
  const m = /^0*(\d+)\/0*(\d+)$/.exec(p.trim())
  return m ? `${m[1]} de ${m[2]}` : p.trim()
}

const contas = (n: number) => `${n} ${n === 1 ? 'conta' : 'contas'}`

function useContador(alvo: number) {
  const [v, setV] = useState(alvo)
  useEffect(() => {
    let reduzir = false
    try { reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* */ }
    let raf = 0
    const ini = performance.now()
    const passo = (t: number) => {
      const k = reduzir ? 1 : Math.min(1, (t - ini) / 600)
      setV(alvo * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [alvo])
  return v
}
function Dinheiro({ valor, cor }: { valor: number; cor?: string }) {
  return <span style={{ color: cor }}>{brl(useContador(valor))}</span>
}

function Situacao({ i }: { i: ItemAgenda }) {
  if (i.situacao === 'atrasado') return <span className="agx-sit" style={{ color: COR.atrasado }}><i className="fa-solid fa-triangle-exclamation" /> {i.diasAtraso} {i.diasAtraso === 1 ? 'dia' : 'dias'} de atraso</span>
  if (i.situacao === 'hoje') return <span className="agx-sit" style={{ color: COR.hoje }}><i className="fa-solid fa-clock" /> Vence hoje</span>
  if (i.situacao === 'pago') return <span className="agx-sit" style={{ color: COR.pago }}><i className="fa-solid fa-circle-check" /> {i.tipo === 'receber' ? 'Recebido' : 'Pago'}</span>
  return <span className="agx-sit" style={{ color: 'var(--portal-text-muted, #64748b)' }}>Vence {ddmm(i.previsao || i.vencimento)}</span>
}

function EtiquetaNF({ nf }: { nf: string }) {
  return <span className="agx-nf"><small>NF</small>{nf}</span>
}

function Linha({ i, onAbrir, comTipo }: { i: ItemAgenda; onAbrir: (i: ItemAgenda) => void; comTipo?: boolean }) {
  return (
    <button type="button" className={`agx-lin${i.situacao === 'pago' ? ' agx-lin-pago' : ''}`} onClick={() => onAbrir(i)}>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="agx-lin-nome" title={i.nome}>{i.nome}</span>
        <span className="agx-lin-meta">
          {comTipo && <span style={{ color: i.tipo === 'receber' ? COR.entra : COR.sai }}>{i.tipo === 'receber' ? 'Entra' : 'Sai'} · </span>}
          {i.nf ? <EtiquetaNF nf={i.nf} /> : 'Sem NF'}{i.parcela ? ` · ${i.parcela}` : ''} · {i.conta === 'CASTRO' ? 'Castro' : 'Nova'}
        </span>
      </span>
      <span style={{ textAlign: 'right', flexShrink: 0 }}>
        <span className="agx-lin-val">{brl(valorDe(i))}</span>
        <Situacao i={i} />
      </span>
    </button>
  )
}

// Sem rolagem própria (a página é a única barra): listas longas mostram o começo e um botão para ver todas.
const LIMITE_LISTA = 20
const HORAS_DEFASADA = 12
function ListaContas({ itens, onAbrir, vazio, comTipo }: { itens: ItemAgenda[]; onAbrir: (i: ItemAgenda) => void; vazio: string; comTipo?: boolean }) {
  const [tudo, setTudo] = useState(false)
  const visiveis = tudo ? itens : itens.slice(0, LIMITE_LISTA)
  return (
    <div className="agx-lista">
      {itens.length === 0 ? <div className="agx-vazio">{vazio}</div> : visiveis.map((i) => <Linha key={i.chave} i={i} onAbrir={onAbrir} comTipo={comTipo} />)}
      {itens.length > LIMITE_LISTA && (
        <button type="button" className="agx-ver-mais" onClick={() => setTudo(!tudo)}>
          {tudo ? `Mostrar só as ${LIMITE_LISTA} primeiras` : `Ver todas as ${itens.length} contas`}
        </button>
      )}
    </div>
  )
}

function ListaLado({ titulo, cor, fa, itens, onAbrir, vazio }: { titulo: string; cor: string; fa: string; itens: ItemAgenda[]; onAbrir: (i: ItemAgenda) => void; vazio: string }) {
  return (
    <div className="agx-card">
      <div className="agx-cab">
        <span className="agx-ico" style={{ color: cor, background: `color-mix(in srgb, ${cor} 9%, var(--surface, #fefefe))` }}><i className={`fa-solid ${fa}`} /></span>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{titulo}<div className="agx-sub">{itens.length} {itens.length === 1 ? 'conta' : 'contas'}</div></div>
        <div className="agx-total"><Dinheiro valor={soma(itens)} /></div>
      </div>
      <ListaContas itens={itens} onAbrir={onAbrir} vazio={vazio} />
    </div>
  )
}

/* ---------- Janela do título ---------- */
function Secao({ titulo, fa, children }: { titulo: string; fa: string; children: ReactNode }) {
  return (
    <div className="agx-sec">
      <div className="agx-sec-tit"><i className={`fa-solid ${fa}`} style={{ color: COR.azul }} /> {titulo}</div>
      {children}
    </div>
  )
}
function Campos({ linhas }: { linhas: [string, ReactNode][] }) {
  return <div className="agx-campos">{linhas.map(([k, v]) => <div key={k}><span>{k}</span><span>{v || '—'}</span></div>)}</div>
}
function Copiar({ valor }: { valor: string }) {
  const [ok, setOk] = useState(false)
  if (!valor) return <>—</>
  const copiar = async () => {
    try { await navigator.clipboard.writeText(valor); setOk(true); setTimeout(() => setOk(false), 1500) } catch { /* navegador sem permissão */ }
  }
  return (
    <span className="agx-copia">
      {valor}
      <button type="button" onClick={copiar} title="Copiar" aria-label={`Copiar ${valor}`} style={{ color: ok ? COR.pago : undefined }}>
        <i className={`fa-solid ${ok ? 'fa-check' : 'fa-copy'}`} />
      </button>
    </span>
  )
}

/** Emissão, vencimento, previsão e pagamento em ordem de data, com o dia de hoje quando ainda está em aberto. */
function LinhaDoTempo({ i, hoje }: { i: ItemAgenda; hoje: string }) {
  const marcos: { nome: string; data: string; cor?: string }[] = []
  if (i.emissao) marcos.push({ nome: 'Emissão', data: i.emissao })
  marcos.push({ nome: 'Vencimento', data: i.vencimento, cor: i.situacao === 'atrasado' ? COR.atrasado : undefined })
  if (i.previsao) marcos.push({ nome: 'Previsão', data: i.previsao, cor: COR.hoje })
  if (i.pagamento) marcos.push({ nome: i.tipo === 'receber' ? 'Recebido' : 'Pago', data: i.pagamento, cor: COR.pago })
  else if (!marcos.some((m) => m.data === hoje)) marcos.push({ nome: 'Hoje', data: hoje })
  marcos.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
  return (
    <div className="agx-tempo">
      {marcos.map((m) => (
        <div key={m.nome} className={`agx-marco${m.data <= hoje ? ' agx-marco-feito' : ''}`} style={{ ['--c' as string]: m.cor || COR.azul }}>
          <span className="agx-marco-ponto" />
          <span className="agx-marco-nome">{m.nome}{m.nome !== 'Hoje' && m.data === hoje ? ' · hoje' : ''}</span>
          <span className="agx-marco-data">{ddmmaa(m.data)}</span>
        </div>
      ))}
    </div>
  )
}

function fraseDaConta(i: ItemAgenda, hoje: string): string {
  const receber = i.tipo === 'receber'
  const quem = receber ? 'O cliente' : 'Nós'
  const prazo = i.previsao || i.vencimento
  if (i.situacao === 'pago') {
    const d = i.pagamento ? diasEntre(i.vencimento, i.pagamento) : 0
    const atraso = !i.pagamento ? '' : d > 0 ? `, ${d} ${d === 1 ? 'dia' : 'dias'} depois do vencimento` : d < 0 ? `, ${-d} ${d === -1 ? 'dia' : 'dias'} antes do vencimento` : ', no dia do vencimento'
    return `Conta resolvida. ${receber ? 'O cliente pagou' : 'Pagamos'} ${brl(i.valorPago)}${i.pagamento ? ` em ${ddmmaa(i.pagamento)}` : ''}${atraso}.`
  }
  if (i.situacao === 'atrasado') return `${quem} ainda não ${receber ? 'pagou' : 'pagamos'}. Faltam ${brl(i.valorAberto)} e o prazo passou há ${i.diasAtraso} ${i.diasAtraso === 1 ? 'dia' : 'dias'}, em ${ddmmaa(prazo)}.`
  if (i.situacao === 'hoje') return `${receber ? 'O cliente precisa pagar' : 'Precisamos pagar'} ${brl(i.valorAberto)} hoje.`
  const n = diasEntre(hoje, prazo)
  return `${receber ? 'O cliente tem' : 'Temos'} ${n} ${n === 1 ? 'dia' : 'dias'} para pagar ${brl(i.valorAberto)}: o prazo é ${ddmmaa(prazo)}.`
}

function proximoPasso(i: ItemAgenda): string {
  if (i.situacao === 'pago') return 'Nada a fazer nesta conta.'
  if (i.tipo === 'pagar') return i.situacao === 'atrasado' ? 'Confira se já foi paga. Se foi, falta dar baixa no Omie; se não, precisa pagar.' : 'Deixe programado o pagamento para o prazo.'
  if (i.situacao === 'atrasado') return i.card ? 'Cobre o cliente pelo card de cobrança.' : 'Esta conta não tem card no portal: confira no Omie se foi paga e cobre o cliente.'
  return i.card ? 'Acompanhe pelo card de cobrança.' : 'Esta conta não tem card de cobrança no portal.'
}

type AbaJanela = 'resumo' | 'detalhes' | 'cobranca' | 'pessoa'

function JanelaTitulo({ inicial, onFechar }: { inicial: ItemAgenda; onFechar: () => void }) {
  const [pilha, setPilha] = useState([inicial])
  const i = pilha[pilha.length - 1]
  const [aba, setAba] = useState<AbaJanela>('resumo')
  const [listaPessoa, setListaPessoa] = useState<'abertas' | 'pagas'>('abertas')
  const [resposta, setResposta] = useState<{ chave: string; hist?: HistoricoPessoa; erro?: string } | null>(null)
  const hist = resposta?.chave === i.chave ? resposta.hist : undefined
  const erro = resposta?.chave === i.chave ? resposta.erro : undefined
  const hoje = useMemo(() => hojeLocalBR(), [])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  useEffect(() => {
    let vivo = true
    fetchAuth(`/api/financeiro/agenda?titulo=${i.chave}`).then((r) => r.json()).then((j) => {
      if (!vivo) return
      if (!j.ok) throw new Error(j.error || 'Erro ao carregar')
      setResposta({ chave: i.chave, hist: j.historico })
    }).catch((e) => { if (vivo) setResposta({ chave: i.chave, erro: e instanceof Error ? e.message : 'Erro ao carregar' }) })
    return () => { vivo = false }
  }, [i.chave])

  const receber = i.tipo === 'receber'
  const pessoa = receber ? 'Cliente' : 'Fornecedor'
  const pctPago = i.valor > 0 ? Math.min(100, (i.valorPago / i.valor) * 100) : 0
  const abrir = (x: ItemAgenda) => { setPilha([...pilha, x]); setAba('resumo') }
  const media = hist?.mediaDiasPagamento
  const costume = media == null ? 'Sem pagamentos em 12 meses' : media === 0 ? 'No dia do vencimento' : media > 0 ? `${media} ${media === 1 ? 'dia' : 'dias'} depois do vencimento` : `${-media} ${media === -1 ? 'dia' : 'dias'} antes do vencimento`
  const abas: { id: AbaJanela; nome: string; fa: string; qtd?: number }[] = [
    { id: 'resumo', nome: 'Resumo', fa: 'fa-circle-info' },
    { id: 'detalhes', nome: 'Detalhes', fa: 'fa-file-lines' },
    ...(receber ? [{ id: 'cobranca' as const, nome: 'Cobrança', fa: 'fa-table-columns' }] : []),
    { id: 'pessoa', nome: pessoa, fa: 'fa-user-clock', qtd: hist?.qtdAberto },
  ]
  const trocarComSeta = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const idx = abas.findIndex((a) => a.id === aba)
    setAba(abas[(idx + (e.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length].id)
  }

  return (
    <div className="agx-fundo" onClick={onFechar}>
      <div className="agx-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={i.nome}>
        <div className="agx-modal-cab">
          {pilha.length > 1 && <button type="button" className="agx-x" onClick={() => { setPilha(pilha.slice(0, -1)); setAba('resumo') }} aria-label="Voltar"><i className="fa-solid fa-arrow-left" /></button>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="agx-sub" style={{ color: receber ? COR.entra : COR.sai }}>{receber ? 'Conta a receber' : 'Conta a pagar'} · {i.conta === 'CASTRO' ? 'Castro Peças' : 'Nova Tratores'}</div>
            <div style={{ fontSize: 19, fontWeight: 500, overflowWrap: 'anywhere' }}>{i.nome}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              {i.nf && <EtiquetaNF nf={i.nf} />}
              <Situacao i={i} />
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="agx-total" style={{ fontSize: 22 }}><Dinheiro valor={valorDe(i)} /></div>
            <div className="agx-sub">{i.situacao === 'pago' ? (receber ? 'recebido' : 'pago') : 'em aberto'}</div>
          </div>
          <button type="button" className="agx-x" onClick={onFechar} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
        </div>

        <div className="agx-abas" role="tablist" onKeyDown={trocarComSeta}>
          {abas.map((a) => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} tabIndex={aba === a.id ? 0 : -1} className={`agx-aba${aba === a.id ? ' agx-aba-on' : ''}`} onClick={() => setAba(a.id)}>
              <i className={`fa-solid ${a.fa}`} /> {a.nome}
              {!!a.qtd && <span className="agx-aba-qtd">{a.qtd}</span>}
            </button>
          ))}
        </div>

        <div className="agx-aba-corpo" key={`${i.chave}-${aba}`} role="tabpanel">
          {aba === 'resumo' && (
            <>
              <p className="agx-frase-conta">{fraseDaConta(i, hoje)}</p>
              {i.valorPago > 0 && i.valorPago < i.valor && (
                <div style={{ marginBottom: 12 }}>
                  <div className="agx-sub">Pago em parte: {brl(i.valorPago)} de {brl(i.valor)}</div>
                  <div className="agx-prog"><span style={{ width: `${pctPago}%` }} /></div>
                </div>
              )}
              <div className="agx-fatos">
                <div><span>Parcela</span><b>{parcelaLegivel(i.parcela) || '—'}</b></div>
                <div><span>Categoria</span><b title={i.categoria}>{i.categoria || '—'}</b></div>
                <button type="button" onClick={() => setAba('pessoa')}><span>{pessoa} em aberto</span><b>{hist ? brl(hist.totalAberto) : '…'}</b></button>
                <button type="button" onClick={() => setAba('pessoa')}><span>Costuma pagar</span><b>{hist ? costume : '…'}</b></button>
              </div>
              <LinhaDoTempo i={i} hoje={hoje} />
              {i.previsao && <p className="agx-explica" style={{ marginTop: 12 }}>O prazo que vale para o atraso é a previsão, {ddmmaa(i.previsao)}, como no Omie.</p>}
              <div className="agx-fazer">
                <i className="fa-solid fa-list-check" />
                <span>{proximoPasso(i)}</span>
                {i.card && i.situacao !== 'pago' && <a className="agx-btn" href={i.card.href}><i className="fa-solid fa-arrow-up-right-from-square" /> Abrir o card #{i.card.id}</a>}
              </div>
            </>
          )}

          {aba === 'detalhes' && (
            <>
              <p className="agx-explica">Os dados desta conta como estão no Omie. Clique no ícone para copiar um número.</p>
              <div className="agx-modal-grade">
                <Secao titulo="Valores e datas" fa="fa-calendar-days">
                  <Campos linhas={[
                    ['Valor da conta', brl(i.valor)],
                    [receber ? 'Já recebido' : 'Já pago', brl(i.valorPago)],
                    ['Falta', brl(i.valorAberto)],
                    ['Imposto retido', i.impostoRetido ? brl(i.impostoRetido) : '—'],
                    ['Emissão', ddmmaa(i.emissao)],
                    ['Vencimento', ddmmaa(i.vencimento)],
                    ['Previsão', i.previsao ? <span style={{ color: COR.hoje }}>{ddmmaa(i.previsao)}</span> : 'Igual ao vencimento'],
                    [receber ? 'Recebido em' : 'Pago em', ddmmaa(i.pagamento)],
                  ]} />
                </Secao>
                <Secao titulo="Documento" fa="fa-file-lines">
                  <Campos linhas={[
                    ['Nota fiscal', <Copiar key="nf" valor={i.nf} />],
                    ['Documento', <Copiar key="doc" valor={i.documento} />],
                    ['Boleto', <Copiar key="bol" valor={i.boleto} />],
                    ['Parcela', i.parcela],
                    ['Categoria', i.categoria],
                    ['Grupo', i.grupoCategoria],
                    ['Departamento', i.departamento],
                    ['Status no Omie', i.statusOmie],
                  ]} />
                </Secao>
              </div>
              {i.observacao && <Secao titulo="Observação no Omie" fa="fa-comment"><div className="agx-obs">{i.observacao}</div></Secao>}
              <div className="agx-registro">
                Incluído {porQuem(i.incluidoPor)}em {quando(i.incluidoEm)} · Alterado {porQuem(i.alteradoPor)}em {quando(i.alteradoEm)} · Atualizado do Omie em {quandoUTC(i.sincronizadoEm)}
              </div>
            </>
          )}

          {aba === 'cobranca' && (
            <>
              <p className="agx-explica">O card de cobrança é onde o Financeiro acompanha o boleto e o pagamento desta conta no portal.</p>
              {i.card ? (
                <Secao titulo={`Card #${i.card.id}`} fa="fa-table-columns">
                  <Campos linhas={[
                    ['Fase', i.card.tarefa || i.card.status.replace(/_/g, ' ')],
                    ['Forma de pagamento', i.card.formaPagamento],
                    ['Vencimento do boleto', ddmmaa(i.card.vencimentoBoleto)],
                  ]} />
                  <a className="agx-btn" href={i.card.href}><i className="fa-solid fa-arrow-up-right-from-square" /> Abrir o card #{i.card.id}</a>
                </Secao>
              ) : <div className="agx-obs">{pilha.length === 1 ? 'Esta conta não está ligada a nenhum card de cobrança do portal (mesma empresa, mesma nota e mesmo cliente).' : 'O card aparece quando você abre esta conta pela lista da agenda.'}</div>}
            </>
          )}

          {aba === 'pessoa' && (
            <>
              <p className="agx-explica">Tudo deste {pessoa.toLowerCase()} na {i.conta === 'CASTRO' ? 'Castro Peças' : 'Nova Tratores'}. Clique nos quadros para trocar a lista.</p>
              {erro && <div className="agx-obs" style={{ color: COR.atrasado }}>{erro}</div>}
              {!hist && !erro && <div className="agx-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Buscando o histórico…</div>}
              {hist && (
                <>
                  <div className="agx-minis">
                    <button type="button" className={listaPessoa === 'abertas' ? 'agx-mini-on' : ''} onClick={() => setListaPessoa('abertas')}><span>Em aberto</span><b>{brl(hist.totalAberto)}</b><small>{contas(hist.qtdAberto)}{hist.qtdAtraso ? `, ${hist.qtdAtraso} em atraso` : ''}</small></button>
                    <button type="button" className={listaPessoa === 'pagas' ? 'agx-mini-on' : ''} onClick={() => setListaPessoa('pagas')}><span>{receber ? 'Recebido' : 'Pago'} em 12 meses</span><b>{brl(hist.totalPago12m)}</b><small>{contas(hist.qtdPago12m)}</small></button>
                    <div><span>Em atraso</span><b style={{ color: hist.totalAtraso ? COR.atrasado : undefined }}>{brl(hist.totalAtraso)}</b><small>{contas(hist.qtdAtraso)}</small></div>
                    <div><span>Costuma pagar</span><b style={{ fontSize: 15 }}>{costume}</b></div>
                  </div>
                  <div className="agx-sub" style={{ margin: '14px 0 4px' }}>
                    {listaPessoa === 'abertas' ? `Outras contas em aberto${hist.qtdAberto - (i.situacao === 'pago' ? 0 : 1) > hist.outrosAbertos.length ? ` (as ${hist.outrosAbertos.length} mais antigas)` : ''}` : 'Últimos pagamentos'}
                  </div>
                  {(listaPessoa === 'abertas' ? hist.outrosAbertos : hist.ultimosPagos).map((x) => <Linha key={x.chave} i={x} onAbrir={abrir} />)}
                  {(listaPessoa === 'abertas' ? hist.outrosAbertos : hist.ultimosPagos).length === 0 && <div className="agx-vazio">Nada para mostrar aqui</div>}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- Opção 2: dia a dia ---------- */
function OpcaoDiaADia({ dados, atrasados, hoje, onAbrir }: { dados: Resposta; atrasados: ItemAgenda[]; hoje: string; onAbrir: (i: ItemAgenda) => void }) {
  const [sel, setSel] = useState<string | null>(null)
  const padrao = dados.dias.some((d) => d.data === hoje) ? hoje : dados.semana
  const atual = sel || padrao
  const verAtraso = atual === 'atrasados'
  const dia = dados.dias.find((d) => d.data === atual)
  const itens = verAtraso ? atrasados : dia?.itens || []
  const e = soma(entradas(itens)); const s = soma(saidas(itens)); const saldo = e - s
  const nome = verAtraso ? 'Tudo que está atrasado' : atual === hoje ? 'Hoje' : `${DIAS[dados.dias.findIndex((d) => d.data === atual)]}, ${ddmm(atual)}`
  return (
    <>
      <div className="agx-frase agx-card">
        <div style={{ fontSize: 15, color: 'var(--portal-text-secondary, #475569)' }}>{nome}</div>
        <div className="agx-frase-nums">
          <span><i className="fa-solid fa-arrow-down" style={{ color: COR.entra }} /> {verAtraso ? 'A receber' : 'Entra'} <b><Dinheiro valor={e} /></b></span>
          <span><i className="fa-solid fa-arrow-up" style={{ color: COR.sai }} /> {verAtraso ? 'A pagar' : 'Sai'} <b><Dinheiro valor={s} /></b></span>
          <span>{saldo >= 0 ? 'Sobra' : 'Falta'} <b><Dinheiro valor={Math.abs(saldo)} /></b></span>
        </div>
      </div>
      <div className="agx-tira">
        <button type="button" className={`agx-dia${verAtraso ? ' agx-dia-on' : ''}`} onClick={() => setSel('atrasados')}>
          <span className="agx-dia-nome"><i className="fa-solid fa-triangle-exclamation" style={{ color: COR.atrasado }} /> Atrasados</span>
          <span className="agx-dia-val" style={{ color: COR.atrasado }}>{atrasados.length} {atrasados.length === 1 ? 'conta' : 'contas'}</span>
          <span className="agx-dia-val">{brlCurto(soma(atrasados))}</span>
        </button>
        {dados.dias.map((d, idx) => (
          <button key={d.data} type="button" className={`agx-dia${d.data === atual ? ' agx-dia-on' : ''}`} onClick={() => setSel(d.data)}>
            <span className="agx-dia-nome">{d.data === hoje ? 'Hoje' : DIAS[idx].slice(0, 3)} <small>{ddmm(d.data)}</small></span>
            <span className="agx-dia-val"><i className="fa-solid fa-arrow-down" style={{ color: COR.entra }} /> {brlCurto(soma(entradas(d.itens)))}</span>
            <span className="agx-dia-val"><i className="fa-solid fa-arrow-up" style={{ color: COR.sai }} /> {brlCurto(soma(saidas(d.itens)))}</span>
          </button>
        ))}
      </div>
      <div className="agx-duas" key={atual}>
        <ListaLado titulo={verAtraso ? 'Falta receber' : 'Entra'} cor={COR.entra} fa="fa-arrow-down" itens={entradas(itens)} onAbrir={onAbrir} vazio="Nada para receber" />
        <ListaLado titulo={verAtraso ? 'Falta pagar' : 'Sai'} cor={COR.sai} fa="fa-arrow-up" itens={saidas(itens)} onAbrir={onAbrir} vazio="Nada para pagar" />
      </div>
    </>
  )
}

/* ---------- Opção 3: semana em barras ---------- */
function OpcaoBarras({ dados, atrasados, hoje, onAbrir }: { dados: Resposta; atrasados: ItemAgenda[]; hoje: string; onAbrir: (i: ItemAgenda) => void }) {
  const [sel, setSel] = useState<string | null>(null)
  const verAtraso = sel === 'atrasados'
  const atual = sel && !verAtraso ? sel : (dados.dias.some((d) => d.data === hoje) ? hoje : dados.semana)
  const dia = dados.dias.find((d) => d.data === atual)
  const todos = dados.dias.flatMap((d) => d.itens)
  const e = soma(entradas(todos)); const s = soma(saidas(todos)); const saldo = e - s
  const valores = (d: DiaAgenda) => [soma(entradas(d.itens)), soma(saidas(d.itens))]
  const maior = Math.max(1, ...dados.dias.flatMap(valores))
  const itens = verAtraso ? atrasados : dia?.itens || []
  return (
    <>
      <div className="agx-tres">
        <div className="agx-card agx-num"><span><i className="fa-solid fa-arrow-down" style={{ color: COR.entra }} /> Entra na semana</span><b><Dinheiro valor={e} /></b></div>
        <div className="agx-card agx-num"><span><i className="fa-solid fa-arrow-up" style={{ color: COR.sai }} /> Sai na semana</span><b><Dinheiro valor={s} /></b></div>
        <div className="agx-card agx-num"><span>{saldo >= 0 ? 'Sobra na semana' : 'Falta na semana'}</span><b><Dinheiro valor={Math.abs(saldo)} /></b></div>
        <button type="button" className={`agx-card agx-num agx-num-btn${verAtraso ? ' agx-dia-on' : ''}`} onClick={() => setSel('atrasados')}>
          <span><i className="fa-solid fa-triangle-exclamation" style={{ color: COR.atrasado }} /> Atrasados ({atrasados.length})</span><b><Dinheiro valor={soma(atrasados)} cor={COR.atrasado} /></b>
        </button>
      </div>
      <div className="agx-card" style={{ padding: '14px 16px' }}>
        <div className="agx-legenda">
          <span><i style={{ background: COR.entra }} /> Entra</span><span><i style={{ background: COR.sai }} /> Sai</span>
          <span style={{ marginLeft: 'auto' }}>Clique num dia para ver as contas</span>
        </div>
        <div className="agx-graf-rola">
          <div className="agx-graf">
            {dados.dias.map((d, idx) => {
              const [ve, vs] = valores(d)
              return (
                <button key={d.data} type="button" className={`agx-col${d.data === atual && !verAtraso ? ' agx-col-on' : ''}`} onClick={() => setSel(d.data)}
                  title={`${DIAS[idx]} ${ddmm(d.data)}: entra ${brl(ve)}, sai ${brl(vs)}`}>
                  <span className="agx-barras">
                    <span className="agx-barra" style={{ height: `${(ve / maior) * 100}%`, background: COR.entra }} />
                    <span className="agx-barra" style={{ height: `${(vs / maior) * 100}%`, background: COR.sai }} />
                  </span>
                  <span className="agx-col-nome">{d.data === hoje ? 'Hoje' : DIAS[idx].slice(0, 3)}</span>
                  <span className="agx-col-val">{brlCurto(ve)}</span>
                  <span className="agx-col-val">{brlCurto(vs)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="agx-duas" key={String(sel)} style={{ marginTop: 12 }}>
        <ListaLado titulo={verAtraso ? 'Falta receber' : atual === hoje ? 'Entra hoje' : `Entra em ${ddmm(atual)}`} cor={COR.entra} fa="fa-arrow-down" itens={entradas(itens)} onAbrir={onAbrir} vazio="Nada para receber" />
        <ListaLado titulo={verAtraso ? 'Falta pagar' : atual === hoje ? 'Sai hoje' : `Sai em ${ddmm(atual)}`} cor={COR.sai} fa="fa-arrow-up" itens={saidas(itens)} onAbrir={onAbrir} vazio="Nada para pagar" />
      </div>
    </>
  )
}

/* ---------- Opção 4: o que fazer ---------- */
function OpcaoFazer({ dados, atrasados, onAbrir }: { dados: Resposta; atrasados: ItemAgenda[]; onAbrir: (i: ItemAgenda) => void }) {
  const [lado, setLado] = useState<'todos' | 'receber' | 'pagar'>('todos')
  const todos = dados.dias.flatMap((d) => d.itens)
  const f = (l: ItemAgenda[]) => (lado === 'todos' ? l : l.filter((i) => i.tipo === lado))
  const colunas: { titulo: string; sub: string; cor: string; fa: string; itens: ItemAgenda[] }[] = [
    { titulo: 'Atrasado', sub: 'Resolver primeiro', cor: COR.atrasado, fa: 'fa-triangle-exclamation', itens: f(atrasados) },
    { titulo: 'Hoje', sub: 'Vence hoje', cor: COR.hoje, fa: 'fa-clock', itens: f(todos.filter((i) => i.situacao === 'hoje')) },
    { titulo: 'Próximos dias', sub: 'Ainda na semana', cor: COR.azul, fa: 'fa-calendar-days', itens: f(todos.filter((i) => i.situacao === 'a_vencer')) },
    { titulo: 'Resolvido', sub: 'Já recebido ou pago', cor: COR.pago, fa: 'fa-circle-check', itens: f(todos.filter((i) => i.situacao === 'pago')) },
  ]
  return (
    <>
      <div className="agx-grupo" style={{ marginBottom: 12 }}>
        {([['todos', 'Tudo'], ['receber', 'Só o que entra'], ['pagar', 'Só o que sai']] as const).map(([v, t]) => (
          <button key={v} type="button" className={`agx-seg${lado === v ? ' agx-seg-on' : ''}`} onClick={() => setLado(v)}>{t}</button>
        ))}
      </div>
      <div className="agx-quatro">
        {colunas.map((c) => (
          <div key={c.titulo} className="agx-card">
            <div className="agx-cab">
              <span className="agx-ico" style={{ color: c.cor, background: `color-mix(in srgb, ${c.cor} 9%, var(--surface, #fefefe))` }}><i className={`fa-solid ${c.fa}`} /></span>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{c.titulo}<div className="agx-sub">{c.itens.length} · {c.sub}</div></div>
              <div className="agx-total" style={{ fontSize: 16 }}><Dinheiro valor={soma(c.itens)} /></div>
            </div>
            <ListaContas itens={c.itens} onAbrir={onAbrir} vazio="Nada aqui" comTipo />
          </div>
        ))}
      </div>
    </>
  )
}

/* ---------- Opção 5: hoje primeiro, depois a semana ---------- */

// Dia em que a conta cai: em aberto, vale a previsão quando ela está na semana; pagos ficam no vencimento.
function diaDaConta(i: ItemAgenda, dias: DiaAgenda[]) {
  const prazo = i.situacao !== 'pago' && i.previsao ? i.previsao : i.vencimento
  return dias.some((d) => d.data === prazo) ? prazo : i.vencimento
}

function CartaoHoje({ titulo, itens, cor, fa, ativo, onClick, nota }: { titulo: string; itens: ItemAgenda[]; cor: string; fa: string; ativo: boolean; onClick: () => void; nota?: string }) {
  return (
    <button type="button" className={`agx-hoje-card${ativo ? ' agx-hoje-on' : ''}`} style={{ ['--c' as string]: cor }} onClick={onClick}>
      <span className="agx-hoje-tit">
        <span className="agx-ico agx-ico-g" style={{ color: cor, background: `color-mix(in srgb, ${cor} 9%, var(--surface, #fefefe))`, borderColor: `color-mix(in srgb, ${cor} 18%, transparent)` }}><i className={`fa-solid ${fa}`} /></span>
        {titulo}
      </span>
      <span className="agx-hoje-nums">
        <b><Dinheiro valor={soma(itens)} /></b>
        <span className="agx-pil" style={{ color: cor, background: `color-mix(in srgb, ${cor} 11%, var(--surface, #fefefe))` }}>{contas(itens.length)}</span>
      </span>
      <span className="agx-sub">{nota || ' '}</span>
    </button>
  )
}

function OpcaoHojeSemana({ dados, atrasados, hoje, ehSemanaAtual, onVoltar, onAbrir }: { dados: Resposta; atrasados: ItemAgenda[]; hoje: string; ehSemanaAtual: boolean; onVoltar: () => void; onAbrir: (i: ItemAgenda) => void }) {
  const [foco, setFoco] = useState<'entra' | 'sai' | 'atr_entra' | 'atr_sai' | null>(null)
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const todos = dados.dias.flatMap((d) => d.itens)
  const porDia = (data: string) => todos.filter((i) => diaDaConta(i, dados.dias) === data)
  const deHoje = porDia(hoje).filter((i) => i.situacao === 'hoje' || i.situacao === 'pago')
  const eh = entradas(deHoje); const sh = saidas(deHoje)
  const ae = entradas(atrasados); const as = saidas(atrasados)
  const pagos = (l: ItemAgenda[]) => l.filter((i) => i.situacao === 'pago').length
  const alternar = (f: NonNullable<typeof foco>) => setFoco(foco === f ? null : f)
  const notaPagos = (l: ItemAgenda[], palavra: string) => (pagos(l) ? `${pagos(l)} já ${palavra}${pagos(l) === 1 ? '' : 's'}` : 'Nenhuma resolvida ainda')
  const dataHoje = `${DIAS[dados.dias.findIndex((d) => d.data === hoje)] || ''}, ${ddmm(hoje)}`
  const eSemana = entradas(todos); const sSemana = saidas(todos)
  return (
    <>
      {ehSemanaAtual ? (
        <section style={{ marginBottom: 22 }}>
          <div className="agx-sec-cab"><div className="agx-h2">Hoje</div><div className="agx-sub" style={{ fontSize: 13 }}>{dataHoje}</div></div>
          <div className="agx-hoje-grade">
            <CartaoHoje titulo="Entra hoje" itens={eh} cor={COR.entra} fa="fa-arrow-down" ativo={foco === 'entra'} onClick={() => alternar('entra')} nota={eh.length ? notaPagos(eh, 'recebida') : 'Nada vence hoje'} />
            <CartaoHoje titulo="Sai hoje" itens={sh} cor={COR.sai} fa="fa-arrow-up" ativo={foco === 'sai'} onClick={() => alternar('sai')} nota={sh.length ? notaPagos(sh, 'paga') : 'Nada vence hoje'} />
            <CartaoHoje titulo="Atrasado para receber" itens={ae} cor={COR.atrasado} fa="fa-triangle-exclamation" ativo={foco === 'atr_entra'} onClick={() => alternar('atr_entra')} nota="Todo o atraso, de qualquer dia" />
            <CartaoHoje titulo="Atrasado para pagar" itens={as} cor={COR.hoje} fa="fa-triangle-exclamation" ativo={foco === 'atr_sai'} onClick={() => alternar('atr_sai')} nota="Todo o atraso, de qualquer dia" />
          </div>
          <div className="agx-duas" key={String(foco)} style={{ marginTop: 10 }}>
            {(foco === null || foco === 'entra') && <ListaLado titulo="Entra hoje" cor={COR.entra} fa="fa-arrow-down" itens={eh} onAbrir={onAbrir} vazio="Nada para receber hoje" />}
            {(foco === null || foco === 'sai') && <ListaLado titulo="Sai hoje" cor={COR.sai} fa="fa-arrow-up" itens={sh} onAbrir={onAbrir} vazio="Nada para pagar hoje" />}
            {foco === 'atr_entra' && <ListaLado titulo="Atrasado para receber" cor={COR.atrasado} fa="fa-triangle-exclamation" itens={ae} onAbrir={onAbrir} vazio="Nenhum cliente em atraso" />}
            {foco === 'atr_sai' && <ListaLado titulo="Atrasado para pagar" cor={COR.hoje} fa="fa-triangle-exclamation" itens={as} onAbrir={onAbrir} vazio="Nenhuma conta em atraso" />}
          </div>
        </section>
      ) : (
        <div className="agx-obs" style={{ marginBottom: 14 }}>Você está vendo outra semana. <button type="button" className="agx-link" onClick={onVoltar}>Voltar para hoje</button></div>
      )}

      <section>
        <div className="agx-sec-cab">
          <div className="agx-h2">{ehSemanaAtual ? 'Esta semana' : 'Semana'}</div>
          <div className="agx-sem-resumo">
            <span><i className="fa-solid fa-arrow-down" style={{ color: COR.entra }} /> Entra <b>{brl(soma(eSemana))}</b> {contas(eSemana.length)}</span>
            <span><i className="fa-solid fa-arrow-up" style={{ color: COR.sai }} /> Sai <b>{brl(soma(sSemana))}</b> {contas(sSemana.length)}</span>
            <span>{soma(eSemana) >= soma(sSemana) ? 'Sobra' : 'Falta'} <b style={{ color: soma(eSemana) < soma(sSemana) ? COR.atrasado : undefined }}>{brl(Math.abs(soma(eSemana) - soma(sSemana)))}</b></span>
          </div>
        </div>
        <div className="agx-cal">
          {dados.dias.map((d, idx) => {
            const itens = porDia(d.data); const e = entradas(itens); const s = saidas(itens); const saldo = soma(e) - soma(s)
            const vazio = itens.length === 0
            return (
              <button key={d.data} type="button" aria-pressed={diaAberto === d.data} disabled={vazio} onClick={() => setDiaAberto(diaAberto === d.data ? null : d.data)}
                className={`agx-cal-dia${d.data === hoje ? ' agx-cal-hoje' : ''}${diaAberto === d.data ? ' agx-cal-on' : ''}`}>
                <span className="agx-cal-topo">
                  <span>{DIAS[idx]}</span>
                  {d.data === hoje && <em>Hoje</em>}
                  <b>{Number(d.data.slice(8, 10))}</b>
                </span>
                {vazio ? <span className="agx-vazio" style={{ margin: 'auto' }}>Nada vence</span> : <>
                  <span className="agx-cal-bloco" style={{ ['--c' as string]: COR.entra }}>
                    <small><i className="fa-solid fa-arrow-down" /> Entra<em>{contas(e.length)}</em></small>
                    {brl(soma(e))}
                  </span>
                  <span className="agx-cal-bloco" style={{ ['--c' as string]: COR.sai }}>
                    <small><i className="fa-solid fa-arrow-up" /> Sai<em>{contas(s.length)}</em></small>
                    {brl(soma(s))}
                  </span>
                  <span className={`agx-cal-saldo${saldo < 0 ? ' agx-cal-falta' : ''}`}>
                    <small>{saldo < 0 ? 'Falta' : 'Sobra'}</small>{brl(Math.abs(saldo))}
                  </span>
                </>}
              </button>
            )
          })}
        </div>
        {diaAberto && (
          <div className="agx-duas" key={diaAberto} style={{ marginTop: 10 }}>
            <ListaLado titulo={`Entra ${diaAberto === hoje ? 'hoje' : `em ${ddmm(diaAberto)}`}`} cor={COR.entra} fa="fa-arrow-down" itens={entradas(porDia(diaAberto))} onAbrir={onAbrir} vazio="Nada para receber" />
            <ListaLado titulo={`Sai ${diaAberto === hoje ? 'hoje' : `em ${ddmm(diaAberto)}`}`} cor={COR.sai} fa="fa-arrow-up" itens={saidas(porDia(diaAberto))} onAbrir={onAbrir} vazio="Nada para pagar" />
          </div>
        )}
      </section>
    </>
  )
}

/* ---------- Opção 6: semana em bolinhas, resumo do dia e uma tabela só ---------- */
type LadoPainel = 'todos' | 'receber' | 'pagar'
type SituacaoPainel = 'todas' | 'abertas' | 'atrasadas' | 'resolvidas'
type PainelDiaProps = {
  dados: Resposta; atrasados: ItemAgenda[]; hoje: string; dia: string; onDia: (d: string) => void
  conta: Conta; onConta: (c: Conta) => void; carregando: boolean; defasadas: string[]; ehSemanaAtual: boolean
  onSemana: (dias: number) => void; onEstaSemana: () => void; onAjuda: () => void; onAbrir: (i: ItemAgenda) => void
}

function TabelaContas({ titulo, cor, fa, itens, vazio, onAbrir }: { titulo: string; cor: string; fa: string; itens: ItemAgenda[]; vazio: string; onAbrir: (i: ItemAgenda) => void }) {
  const [tudo, setTudo] = useState(false)
  const linhas = tudo ? itens : itens.slice(0, 30)
  return (
    <section className="agp-card agp-lista">
      <div className="agp-tab-cab">
        <span className="agx-ico" style={{ color: cor, background: `color-mix(in srgb, ${cor} 10%, var(--surface, #fefefe))` }}><i className={`fa-solid ${fa}`} /></span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 500 }}>{titulo}</div><div className="agp-det">{contas(itens.length)}</div></div>
        <div className="agx-total" style={{ fontSize: 20 }}><Dinheiro valor={soma(itens)} /></div>
      </div>
      <div className="agp-rola">
        {itens.length === 0 ? <div className="agx-vazio">{vazio}</div> : (
          <table className="agp-tab">
            <thead><tr><th>{titulo === 'Entra' || titulo === 'Falta receber' ? 'Cliente' : 'Fornecedor'}</th><th>Nota</th><th>Situação</th><th className="agp-dir">Valor</th></tr></thead>
            <tbody>
              {linhas.map((i) => (
                <tr key={i.chave} className={i.situacao === 'pago' ? 'agp-tr-pago' : ''} onClick={() => onAbrir(i)}>
                  <td className="agp-nome">
                    <button type="button" title={i.nome} onClick={(ev) => { ev.stopPropagation(); onAbrir(i) }}>{i.nome}</button>
                    <small>{i.conta === 'CASTRO' ? 'Castro' : 'Nova'}{parcelaLegivel(i.parcela) ? ` · Parcela ${parcelaLegivel(i.parcela)}` : ''}</small>
                  </td>
                  <td>{i.nf ? <EtiquetaNF nf={i.nf} /> : <span className="agp-apagado">Sem NF</span>}</td>
                  <td><Situacao i={i} /></td>
                  <td className="agp-dir agp-val">{brl(valorDe(i))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {itens.length > 30 && <button type="button" className="agx-ver-mais agp-mais" onClick={() => setTudo(!tudo)}>{tudo ? 'Mostrar só as 30 primeiras' : `Ver todas as ${itens.length} contas`}</button>}
    </section>
  )
}

function PainelDia({ dados, atrasados, hoje, dia, onDia, conta, onConta, carregando, defasadas, ehSemanaAtual, onSemana, onEstaSemana, onAjuda, onAbrir }: PainelDiaProps) {
  const [lado, setLado] = useState<LadoPainel>('todos')
  const [situacao, setSituacao] = useState<SituacaoPainel>('todas')
  const [busca, setBusca] = useState('')
  // guarda o dia do clique: escolher outra bolinha volta para os dados do dia
  const [atrasadosEm, setAtrasadosEm] = useState<string | null>(null)
  const verAtrasados = atrasadosEm === dia

  const todos = dados.dias.flatMap((d) => d.itens)
  const doDia = (data: string) => todos.filter((i) => diaDaConta(i, dados.dias) === data)
  const itensDia = doDia(dia)
  const e = entradas(itensDia); const s = saidas(itensDia); const saldo = soma(e) - soma(s)
  const idx = dados.dias.findIndex((d) => d.data === dia)
  const base = verAtrasados ? atrasados : itensDia
  const doLado = lado === 'todos' ? base : base.filter((i) => i.tipo === lado)
  const grupos: [SituacaoPainel, string, ItemAgenda[]][] = [
    ['todas', 'Todas', doLado],
    ['abertas', 'Em aberto', doLado.filter((i) => i.situacao !== 'pago')],
    ['atrasadas', 'Atrasadas', doLado.filter((i) => i.situacao === 'atrasado')],
    ['resolvidas', 'Resolvidas', doLado.filter((i) => i.situacao === 'pago')],
  ]
  const termo = busca.trim().toLowerCase()
  const filtradas = (grupos.find(([v]) => v === situacao)?.[2] || doLado).filter((i) => !termo || `${i.nome} ${i.nf} ${i.documento}`.toLowerCase().includes(termo))
  const escolherLado = (l: LadoPainel) => { setAtrasadosEm(null); setLado(lado === l ? 'todos' : l) }
  const escolherDia = (d: string) => { onDia(d) }
  const andar = (ev: React.KeyboardEvent) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return
    const novo = dados.dias[idx + (ev.key === 'ArrowRight' ? 1 : -1)]
    if (novo) { ev.preventDefault(); escolherDia(novo.data) }
  }
  const resolvidas = (l: ItemAgenda[]) => l.filter((i) => i.situacao === 'pago').length

  return (
    <div className="agp">
      <section className="agp-card agp-semana">
        <div className="agp-topo">
          <div className="agp-grupo-nav">
            <button type="button" className="agp-seta" onClick={() => onSemana(-7)} aria-label="Semana anterior"><i className="fa-solid fa-chevron-left" /></button>
            <span className="agp-periodo">{ddmm(dados.semana)} a {ddmmaa(dados.fim)}</span>
            <button type="button" className="agp-seta" onClick={() => onSemana(7)} aria-label="Próxima semana"><i className="fa-solid fa-chevron-right" /></button>
            {!ehSemanaAtual && <button type="button" className="agp-link" onClick={onEstaSemana}>Voltar para hoje</button>}
            {carregando && <i className="fa-solid fa-circle-notch fa-spin agp-apagado" />}
          </div>
          <div className="agp-grupo-nav">
            {defasadas.length > 0 && <span className="agp-defasada" title="Pagamentos feitos depois disso ainda aparecem como em aberto."><i className="fa-solid fa-triangle-exclamation" /> Omie desatualizado: {defasadas.join(' · ')}</span>}
            <div className="agp-seg" role="group" aria-label="Empresa">
              {([['todas', 'Todas'], ['NOVA', 'Nova'], ['CASTRO', 'Castro']] as const).map(([v, t]) => (
                <button key={v} type="button" aria-pressed={conta === v} className={conta === v ? 'agp-seg-on' : ''} onClick={() => onConta(v)}>{t}</button>
              ))}
            </div>
            <button type="button" className="agp-seta" onClick={onAjuda} title="Como ler esta tela" aria-label="Como ler esta tela"><i className="fa-solid fa-question" /></button>
          </div>
        </div>
        <div className="agp-dias" role="group" aria-label="Dias da semana" onKeyDown={andar}>
          {dados.dias.map((d, i) => {
            const itens = doDia(d.data)
            const pct = itens.length ? Math.round((resolvidas(itens) / itens.length) * 100) : 0
            const on = d.data === dia && !verAtrasados
            return (
              <button key={d.data} type="button" aria-pressed={on} onClick={() => { setAtrasadosEm(null); escolherDia(d.data) }} className={`agp-dia${on ? ' agp-dia-on' : ''}${d.data === hoje ? ' agp-dia-hoje' : ''}`}
                aria-label={`${DIAS[i]} ${ddmm(d.data)}, ${contas(itens.length)}, ${resolvidas(itens)} resolvidas`}>
                <span className="agp-dia-sem">{d.data === hoje ? 'Hoje' : DIAS[i]}</span>
                <span className="agp-anel" style={{ background: `conic-gradient(${COR.pago} ${pct}%, var(--border, #e2e8f0) 0)` }}>
                  <span className="agp-num">{Number(d.data.slice(8, 10))}</span>
                  {itens.some((x) => x.situacao === 'atrasado') && <span className="agp-ponto" title="Tem conta atrasada" />}
                </span>
                <span className="agp-dia-qtd">{contas(itens.length)}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="agp-card agp-resumo">
        <div className="agp-res agp-res-titulo">
          <span className="agp-rot">{dia === hoje ? 'Hoje' : 'Dia escolhido'}</span>
          <strong>{DIAS[idx]}</strong>
          <span className="agp-det">{ddmmaa(dia)}</span>
        </div>
        <button type="button" aria-pressed={lado === 'receber' && !verAtrasados} className={`agp-res${lado === 'receber' && !verAtrasados ? ' agp-res-on' : ''}`} onClick={() => escolherLado('receber')}>
          <span className="agp-rot"><i className="fa-solid fa-arrow-down" style={{ color: COR.entra }} /> Entra</span>
          <strong><Dinheiro valor={soma(e)} /></strong>
          <span className="agp-det">{contas(e.length)} · {resolvidas(e)} {resolvidas(e) === 1 ? 'recebida' : 'recebidas'}</span>
        </button>
        <button type="button" aria-pressed={lado === 'pagar' && !verAtrasados} className={`agp-res${lado === 'pagar' && !verAtrasados ? ' agp-res-on' : ''}`} onClick={() => escolherLado('pagar')}>
          <span className="agp-rot"><i className="fa-solid fa-arrow-up" style={{ color: COR.sai }} /> Sai</span>
          <strong><Dinheiro valor={soma(s)} /></strong>
          <span className="agp-det">{contas(s.length)} · {resolvidas(s)} {resolvidas(s) === 1 ? 'paga' : 'pagas'}</span>
        </button>
        <div className="agp-res">
          <span className="agp-rot">{saldo < 0 ? 'Falta no dia' : 'Sobra no dia'}</span>
          <strong style={{ color: saldo < 0 ? COR.atrasado : COR.entra }}><Dinheiro valor={Math.abs(saldo)} /></strong>
          <span className="agp-det">Entra menos sai</span>
        </div>
        <button type="button" aria-pressed={verAtrasados} className={`agp-res${verAtrasados ? ' agp-res-on' : ''}`} onClick={() => { setAtrasadosEm(verAtrasados ? null : dia); setLado('todos'); setSituacao('todas') }}>
          <span className="agp-rot"><i className="fa-solid fa-triangle-exclamation" style={{ color: COR.atrasado }} /> Todos os atrasados</span>
          <strong style={{ color: COR.atrasado }}><Dinheiro valor={soma(atrasados)} /></strong>
          <span className="agp-det">{contas(atrasados.length)}, de qualquer dia</span>
        </button>
      </section>

      <section className="agp-card agp-filtros-barra">
        <div className="agp-barra">
          <div className="agp-chips">
            {grupos.filter(([v, , l]) => v === 'todas' || l.length > 0).map(([v, t, l]) => (
              <button key={v} type="button" aria-pressed={situacao === v} className={`agp-chip${situacao === v ? ' agp-chip-on' : ''}`} onClick={() => setSituacao(v)}>{t} <span>{l.length}</span></button>
            ))}
            {lado !== 'todos' && <button type="button" className="agp-link" onClick={() => setLado('todos')}>Mostrando só {lado === 'receber' ? 'o que entra' : 'o que sai'}. Ver tudo</button>}
          </div>
          <label className="agp-busca">
            <i className="fa-solid fa-magnifying-glass" />
            <input type="search" value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder="Buscar cliente ou NF" aria-label="Buscar cliente ou nota fiscal" />
          </label>
        </div>
      </section>

      <div className="agp-tabelas" key={verAtrasados ? 'atrasados' : dia}>
        {lado !== 'pagar' && <TabelaContas titulo={verAtrasados ? 'Falta receber' : 'Entra'} cor={COR.entra} fa="fa-arrow-down" itens={entradas(filtradas)} vazio={termo ? 'Nada encontrado nesta busca' : 'Nada para receber aqui'} onAbrir={onAbrir} />}
        {lado !== 'receber' && <TabelaContas titulo={verAtrasados ? 'Falta pagar' : 'Sai'} cor={COR.sai} fa="fa-arrow-up" itens={saidas(filtradas)} vazio={termo ? 'Nada encontrado nesta busca' : 'Nada para pagar aqui'} onAbrir={onAbrir} />}
      </div>
    </div>
  )
}

const COMO_LER: Record<OpcaoAgenda, string> = {
  6: 'Cada bolinha é um dia da semana. O anel verde mostra quanto já foi resolvido e o ponto vermelho avisa que há atraso naquele dia. Clique na bolinha, ou use as setas do teclado, para ver o dia. A faixa do meio resume o dia: clique em Entra ou Sai para filtrar a tabela. Todos os atrasados mostra o total geral, de qualquer dia. Clique numa linha da tabela para abrir a conta.',
  5: 'Em cima fica só o dia de hoje: cada cartão mostra o valor e quantas contas são. Clique num cartão para ver só aquela lista; clique de novo para voltar. Embaixo está a semana em calendário: clique no dia para abrir as contas dele logo abaixo. Uma conta com previsão aparece no dia da previsão, se ele estiver na semana.',
  2: 'Cada botão é um dia, com o que entra (seta para baixo) e o que sai (seta para cima). Clique no dia para ver as contas dele. O botão Atrasados junta tudo que já passou do prazo.',
  3: 'Cada dia tem duas barras: o que entra e o que sai, na mesma escala. Clique no dia para ver as contas embaixo. Os cartões do topo somam a semana inteira.',
  4: 'As contas ficam em quatro grupos, na ordem de prioridade: atrasado, hoje, próximos dias e resolvido. Use os botões para ver só o que entra ou só o que sai.',
}

export default function AgendaOpcoes({ opcao }: { opcao: OpcaoAgenda }) {
  const { userProfile, loading: carregandoAuth } = useAuth()
  const { isDev, loading: carregandoPerm } = usePermissoes(userProfile?.id)
  const pode = isDev || userProfile?.funcao === 'Financeiro'
  const hoje = useMemo(() => hojeLocalBR(), [])
  const [semana, setSemana] = useState(() => segundaDaSemana(hojeLocalBR()))
  const [conta, setConta] = useState<Conta>('todas')
  const [dados, setDados] = useState<Resposta | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState<ItemAgenda | null>(null)
  const [ajuda, setAjuda] = useState(false)
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null)
  const ehSemanaAtual = semana === segundaDaSemana(hoje)
  // dia válido só dentro da semana carregada; fora dela abre em hoje ou na segunda
  const dia = dados && dados.dias.some((d) => d.data === diaEscolhido) ? (diaEscolhido as string)
    : dados?.dias.some((d) => d.data === hoje) ? hoje : dados?.semana || semana

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const r = await fetchAuth(`/api/financeiro/agenda?semana=${semana}&conta=${conta}&tipo=ambos`)
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || `Erro ${r.status}`)
      setDados(j)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally { setCarregando(false) }
  }, [semana, conta])
  useEffect(() => { if (pode) carregar() }, [pode, carregar])

  const atrasados = useMemo(() => {
    if (!dados) return []
    const daSemana = dados.dias.flatMap((d) => d.itens).filter((i) => i.situacao === 'atrasado')
    return [...daSemana, ...dados.atrasadosAnteriores.itens].sort((a, b) => b.diasAtraso - a.diasAtraso || b.valorAberto - a.valorAberto)
  }, [dados])

  // Mesmo com a rotina "OK", uma empresa pode parar de atualizar (30/10/2026: Nova parada desde 28/10): avisa na tela.
  const defasadas = useMemo(() => {
    if (!dados) return []
    const ultima: Record<string, string> = {}
    for (const i of [...dados.dias.flatMap((d) => d.itens), ...dados.atrasadosAnteriores.itens]) {
      if (i.sincronizadoEm && i.sincronizadoEm > (ultima[i.conta] || '')) ultima[i.conta] = i.sincronizadoEm
    }
    const limite = Date.now() - HORAS_DEFASADA * 3_600_000
    return Object.entries(ultima).filter(([, em]) => Date.parse(`${em}Z`) < limite).map(([conta, em]) => `${conta === 'CASTRO' ? 'Castro' : 'Nova'} desde ${quandoUTC(em)}`)
  }, [dados])

  if (carregandoAuth || carregandoPerm) return <div style={{ padding: 40, textAlign: 'center' }}>Carregando…</div>
  if (!pode) return <div style={{ padding: 40, textAlign: 'center' }}>A agenda é só para o Financeiro e os desenvolvedores do portal.</div>

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 28px)', color: 'var(--portal-text, #0f172a)' }}>
      <style>{ESTILO_AGENDA}</style>
      {opcao !== 6 && <div className="agx-barra-topo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="agx-x" onClick={() => setSemana(somarDias(semana, -7))} aria-label="Semana anterior"><i className="fa-solid fa-chevron-left" /></button>
          <div style={{ fontSize: 18, fontWeight: 500, padding: '0 6px', fontVariantNumeric: 'tabular-nums' }}>{ddmm(semana)} a {ddmmaa(somarDias(semana, 6))}</div>
          <button type="button" className="agx-x" onClick={() => setSemana(somarDias(semana, 7))} aria-label="Próxima semana"><i className="fa-solid fa-chevron-right" /></button>
          <button type="button" className="agx-seg agx-seg-solta" onClick={() => setSemana(segundaDaSemana(hoje))}>Esta semana</button>
          {carregando && <i className="fa-solid fa-circle-notch fa-spin" style={{ color: 'var(--portal-text-muted, #64748b)' }} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="agx-grupo">
            {([['todas', 'Todas'], ['NOVA', 'Nova'], ['CASTRO', 'Castro']] as const).map(([v, t]) => (
              <button key={v} type="button" className={`agx-seg${conta === v ? ' agx-seg-on' : ''}`} onClick={() => setConta(v)}>{t}</button>
            ))}
          </div>
          <button type="button" className="agx-x" onClick={() => setAjuda(true)} title="Como ler esta tela" aria-label="Como ler esta tela"><i className="fa-solid fa-question" /></button>
        </div>
      </div>}

      {erro && <div className="agx-obs" style={{ color: COR.atrasado, marginBottom: 12 }}>{erro} <button type="button" className="agx-link" onClick={carregar}>Tentar de novo</button></div>}
      {opcao !== 6 && defasadas.length > 0 && <div className="agx-alerta"><i className="fa-solid fa-triangle-exclamation" /><span>Os dados do Omie estão desatualizados: {defasadas.join(' · ')}. Pagamentos feitos depois disso ainda aparecem como em aberto.</span></div>}
      {!dados && !erro && <div className="agx-vazio">Carregando a semana…</div>}
      {/* key: trocar de semana volta para o dia padrão */}
      {dados && opcao === 2 && <OpcaoDiaADia key={dados.semana} dados={dados} atrasados={atrasados} hoje={hoje} onAbrir={setAberto} />}
      {dados && opcao === 3 && <OpcaoBarras key={dados.semana} dados={dados} atrasados={atrasados} hoje={hoje} onAbrir={setAberto} />}
      {dados && opcao === 6 && <PainelDia dados={dados} atrasados={atrasados} hoje={hoje} dia={dia} onDia={setDiaEscolhido} conta={conta} onConta={setConta} carregando={carregando} defasadas={defasadas} ehSemanaAtual={ehSemanaAtual} onSemana={(n) => setSemana(somarDias(semana, n))} onEstaSemana={() => setSemana(segundaDaSemana(hoje))} onAjuda={() => setAjuda(true)} onAbrir={setAberto} />}
      {dados && opcao === 5 &&<OpcaoHojeSemana key={dados.semana} dados={dados} atrasados={atrasados} hoje={hoje} ehSemanaAtual={semana === segundaDaSemana(hoje)} onVoltar={() => setSemana(segundaDaSemana(hoje))} onAbrir={setAberto} />}
      {dados && opcao === 4 && <OpcaoFazer dados={dados} atrasados={atrasados} onAbrir={setAberto} />}

      {aberto && <JanelaTitulo key={aberto.chave} inicial={aberto} onFechar={() => setAberto(null)} />}
      {ajuda && (
        <div className="agx-fundo" onClick={() => setAjuda(false)}>
          <div className="agx-modal" style={{ width: 'min(480px, 100%)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Como ler esta tela">
            <div className="agx-modal-cab"><div style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>Como ler esta tela</div><button type="button" className="agx-x" onClick={() => setAjuda(false)} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button></div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{COMO_LER[opcao]}</p>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '8px 0 0' }}>Clique em qualquer conta para ver tudo sobre ela e como o cliente ou fornecedor costuma pagar. Os dados vêm do espelho do Omie, atualizado algumas vezes por dia: algo pago hoje pode demorar a aparecer.</p>
          </div>
        </div>
      )}
    </div>
  )
}

const ESTILO_AGENDA = `
.agx-barra-topo { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px }
.agx-x { width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px; border: 1px solid var(--border, #e2e8f0); background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); cursor: pointer; display: grid; place-items: center }
.agx-grupo { display: inline-flex; border: 1px solid var(--border, #e2e8f0); border-radius: 11px; padding: 3px; background: var(--surface, #fefefe); gap: 2px; flex-wrap: wrap }
.agx-seg { border: 1px solid transparent; background: transparent; color: var(--portal-text-secondary, #475569); padding: 6px 12px; border-radius: 8px; font-size: 14px; cursor: pointer }
.agx-seg-solta { border-color: var(--border, #e2e8f0); background: var(--surface, #fefefe); height: 36px; border-radius: 10px }
.agx-seg-on { background: color-mix(in srgb, #2563eb 11%, var(--surface, #fefefe)); color: #2563eb; font-weight: 500 }
.agx-card { background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; min-width: 0; animation: agxEntra .3s ease both }
.agx-cab { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border, #e2e8f0) }
.agx-ico { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; font-size: 13px; flex-shrink: 0 }
.agx-sub { font-size: 13.5px; font-weight: 400; color: var(--portal-text-muted, #64748b) }
.agx-total { font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap }
.agx-lista { padding: 6px }
.agx-ver-mais { display: block; width: 100%; margin-top: 4px; padding: 9px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: transparent; color: #2563eb; font-size: 13px; cursor: pointer }
.agx-ver-mais:hover { background: color-mix(in srgb, #2563eb 6%, var(--surface, #fefefe)) }
.agx-vazio { font-size: 13px; color: var(--portal-text-muted, #64748b); text-align: center; padding: 18px 8px }
.agx-lin { display: flex; gap: 12px; width: 100%; text-align: left; background: transparent; border: none; border-radius: 10px; padding: 8px 10px; cursor: pointer; color: inherit; font: inherit; transition: background .15s }
.agx-lin:hover { background: color-mix(in srgb, #0369a1 6%, var(--surface, #fefefe)) }
.agx-lin-pago .agx-lin-nome, .agx-lin-pago .agx-lin-val { color: var(--portal-text-muted, #64748b) }
.agx-lin-nome { display: block; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.agx-lin-meta { display: block; font-size: 13.5px; color: var(--portal-text-secondary, #475569); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.agx-lin-val { display: block; font-size: 15.5px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap }
.agx-sit { display: block; font-size: 13.5px; margin-top: 4px; white-space: nowrap }
.agx-nf { display: inline-flex; align-items: baseline; gap: 4px; padding: 1px 8px; border-radius: 7px; font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--portal-text, #0f172a); background: color-mix(in srgb, #2563eb 10%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, #2563eb 22%, transparent) }
.agx-nf small { font-size: 11.5px; font-weight: 500; color: #2563eb }
.agx-frase { display: flex; justify-content: space-between; align-items: center; gap: 12px 24px; flex-wrap: wrap; padding: 14px 18px; margin-bottom: 10px }
.agx-frase-nums { display: flex; gap: 8px 24px; flex-wrap: wrap; font-size: 14px; color: var(--portal-text-secondary, #475569) }
.agx-frase-nums b { font-size: 20px; font-weight: 500; color: var(--portal-text, #0f172a); margin-left: 4px; font-variant-numeric: tabular-nums }
.agx-tira { display: grid; grid-template-columns: repeat(8, minmax(112px, 1fr)); gap: 6px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 10px }
.agx-dia { display: flex; flex-direction: column; gap: 3px; text-align: left; background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 12px; padding: 9px 11px; cursor: pointer; color: inherit; font: inherit; transition: border-color .2s, background .2s }
.agx-dia:hover { border-color: color-mix(in srgb, #2563eb 35%, var(--border, #e2e8f0)) }
.agx-dia-on { border-color: #2563eb !important; background: color-mix(in srgb, #2563eb 7%, var(--surface, #fefefe)) }
.agx-dia-nome { font-size: 13.5px; font-weight: 500 }
.agx-dia-nome small { font-size: 12px; font-weight: 400; color: var(--portal-text-muted, #64748b) }
.agx-dia-val { font-size: 12.5px; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--portal-text-secondary, #475569) }
.agx-dia-val i { font-size: 10px }
.agx-duas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); gap: 10px; align-items: start }
.agx-tres { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr)); gap: 10px; margin-bottom: 10px }
.agx-num { display: flex; flex-direction: column; gap: 6px; padding: 12px 16px; text-align: left; font: inherit; color: inherit }
.agx-num > span { font-size: 13px; color: var(--portal-text-secondary, #475569) }
.agx-num b { font-size: 20px; font-weight: 500; font-variant-numeric: tabular-nums }
.agx-num-btn { cursor: pointer }
.agx-legenda { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--portal-text-secondary, #475569); margin-bottom: 10px }
.agx-legenda span { display: inline-flex; align-items: center; gap: 5px }
.agx-legenda i { width: 10px; height: 10px; border-radius: 3px; display: inline-block }
.agx-graf-rola { overflow-x: auto }
.agx-graf { display: grid; grid-template-columns: repeat(7, minmax(64px, 1fr)); gap: 6px; min-width: 470px }
.agx-col { display: flex; flex-direction: column; align-items: center; gap: 2px; background: transparent; border: 1px solid transparent; border-radius: 12px; padding: 8px 4px; cursor: pointer; color: inherit; font: inherit; transition: background .2s }
.agx-col:hover { background: color-mix(in srgb, #0369a1 5%, var(--surface, #fefefe)) }
.agx-col-on { background: color-mix(in srgb, #2563eb 7%, var(--surface, #fefefe)); border-color: #2563eb }
.agx-barras { display: flex; align-items: flex-end; justify-content: center; gap: 2px; height: 170px; width: 100%; margin-bottom: 6px; border-bottom: 1px solid var(--border, #e2e8f0) }
.agx-barra { width: min(26%, 22px); border-radius: 4px 4px 0 0; transform-origin: bottom; animation: agxCresce .5s ease both }
.agx-col-nome { font-size: 13px; font-weight: 500 }
.agx-col-val { font-size: 12px; color: var(--portal-text-muted, #64748b); font-variant-numeric: tabular-nums; white-space: nowrap }
.agx-quatro { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 10px; align-items: start }
.agx-fundo { position: fixed; inset: 0; z-index: 9500; background: rgba(15,23,42,.45); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: agxFade .2s ease }
.agx-modal { background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; padding: 18px; width: min(820px, 100%); max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 60px -24px rgba(15,23,42,.5); animation: agxEntra .25s ease }
.agx-modal-cab { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px }
.agx-modal-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 10px }
.agx-sec { border: 1px solid var(--border, #e2e8f0); border-radius: 14px; padding: 12px 14px; margin-bottom: 10px; min-width: 0 }
.agx-sec-tit { font-size: 15.5px; font-weight: 500; margin-bottom: 8px; display: flex; align-items: center; gap: 7px }
.agx-campos > div { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 6px 0; font-size: 14.5px }
.agx-campos > div + div { border-top: 1px solid var(--border, #e2e8f0) }
.agx-campos > div > span:first-child { color: var(--portal-text-secondary, #475569); flex-shrink: 0 }
.agx-campos > div > span:last-child { text-align: right; font-variant-numeric: tabular-nums; overflow-wrap: anywhere }
.agx-obs { font-size: 13px; line-height: 1.5; background: var(--portal-bg-secondary, #f8fafc); border-radius: 10px; padding: 9px 12px; white-space: pre-wrap; overflow-wrap: anywhere }
.agx-btn { display: flex; align-items: center; justify-content: center; gap: 8px; height: 40px; margin-top: 10px; border-radius: 11px; font-size: 13.5px; text-decoration: none; background: #2563eb; color: #fefefe }
.agx-btn:hover { background: #1d4ed8 }
.agx-link { background: none; border: none; color: #2563eb; cursor: pointer; font-size: 13px; padding: 0; text-decoration: underline }
.agx-minis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 8px }
.agx-minis > div, .agx-minis > button { background: var(--portal-bg-secondary, #f8fafc); border: 1px solid transparent; border-radius: 10px; padding: 9px 11px; display: flex; flex-direction: column; gap: 2px; text-align: left; color: inherit; font: inherit }
.agx-minis > button { cursor: pointer; transition: border-color .2s, transform .2s }
.agx-minis > button:hover { transform: translateY(-1px); border-color: color-mix(in srgb, #2563eb 35%, var(--border, #e2e8f0)) }
.agx-mini-on { border-color: #2563eb !important; background: color-mix(in srgb, #2563eb 7%, var(--surface, #fefefe)) !important }
.agx-minis span { font-size: 13.5px; color: var(--portal-text-secondary, #475569) }
.agx-minis b { font-size: 17px; font-weight: 500; font-variant-numeric: tabular-nums }
.agx-minis small { font-size: 13px; color: var(--portal-text-muted, #64748b) }
.agx-prog { height: 6px; border-radius: 4px; background: var(--border, #e2e8f0); overflow: hidden; margin-top: 4px }
.agx-prog span { display: block; height: 100%; background: #16a34a }
.agx-registro { font-size: 13px; color: var(--portal-text-muted, #64748b); line-height: 1.5 }
.agx-sec-cab { display: flex; align-items: baseline; gap: 4px 12px; flex-wrap: wrap; margin-bottom: 10px }
.agx-h2 { font-size: 20px; font-weight: 500; letter-spacing: -.01em }
.agx-ico-g { width: 40px; height: 40px; border-radius: 11px; font-size: 16px; border: 1px solid }
.agx-pil { font-size: 13px; padding: 2px 10px; border-radius: 999px; white-space: nowrap }
.agx-hoje-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 10px }
.agx-hoje-card { --c: #2563eb; display: flex; flex-direction: column; gap: 10px; text-align: left; background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; padding: 16px 18px 14px; cursor: pointer; color: inherit; font: inherit; transition: box-shadow .25s, transform .25s, border-color .25s, background .25s; animation: agxEntra .3s ease both }
.agx-hoje-card:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55); border-color: color-mix(in srgb, var(--c) 35%, var(--border, #e2e8f0)) }
.agx-hoje-on { border-color: var(--c); background: color-mix(in srgb, var(--c) 5%, var(--surface, #fefefe)) }
.agx-hoje-tit { display: flex; align-items: center; gap: 10px; font-size: 15.5px; font-weight: 500 }
.agx-hoje-nums { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap }
.agx-hoje-nums b { font-size: 22px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums }
.agx-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px }
.agx-cal-dia { display: flex; flex-direction: column; gap: 9px; min-width: 0; text-align: left; background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; padding: 12px; cursor: pointer; color: inherit; font: inherit; transition: box-shadow .25s, transform .25s, border-color .25s; animation: agxEntra .3s ease both }
.agx-cal-dia:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55); border-color: color-mix(in srgb, #2563eb 35%, var(--border, #e2e8f0)) }
.agx-cal-dia:disabled { cursor: default }
.agx-cal-hoje { background: color-mix(in srgb, #2563eb 5%, var(--surface, #fefefe)); border-color: color-mix(in srgb, #2563eb 40%, var(--border, #e2e8f0)) }
.agx-cal-on { border-color: #2563eb; box-shadow: 0 0 0 2px color-mix(in srgb, #2563eb 25%, transparent) }
.agx-cal-topo { display: flex; align-items: center; gap: 6px; font-size: 14.5px; color: var(--portal-text-secondary, #475569) }
.agx-cal-topo em { font-style: normal; font-size: 12.5px; padding: 0 8px; border-radius: 999px; background: #2563eb; color: #fefefe }
.agx-cal-topo b { margin-left: auto; font-size: 22px; font-weight: 500; line-height: 1; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums }
.agx-cal-bloco { --c: #2563eb; display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--c) 7%, var(--surface, #fefefe)); font-size: 16px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap }
.agx-cal-bloco small { display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 400; color: var(--portal-text-secondary, #475569) }
.agx-cal-bloco small i { font-size: 10px; color: var(--c) }
.agx-cal-bloco small em { margin-left: auto; font-style: normal; color: var(--portal-text-muted, #64748b) }
.agx-cal-saldo { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; margin-top: auto; padding: 8px 2px 0; border-top: 1px solid var(--border, #e2e8f0); font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap }
.agx-cal-saldo small { font-size: 13px; font-weight: 400; color: var(--portal-text-secondary, #475569) }
.agx-cal-falta { color: #dc2626 }
.agx-sem-resumo { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 14px; color: var(--portal-text-secondary, #475569) }
.agx-sem-resumo b { font-size: 15.5px; font-weight: 500; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums }
.agp { display: flex; flex-direction: column; gap: 12px }
.agp-card { background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; min-width: 0; animation: agxEntra .3s ease both }
.agp-topo { display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0) }
.agp-grupo-nav { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0 }
.agp-seta { width: 34px; height: 34px; flex-shrink: 0; display: grid; place-items: center; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); cursor: pointer; transition: border-color .2s }
.agp-seta:hover { border-color: #2563eb }
.agp-periodo { padding: 0 6px; font-size: 17.5px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap }
.agp-link { border: none; background: none; padding: 0 4px; color: #2563eb; font-size: 15px; cursor: pointer; text-decoration: underline }
.agp-apagado { color: var(--portal-text-muted, #64748b) }
.agp-defasada { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; font-size: 14.5px; color: #92400e; background: color-mix(in srgb, #d97706 11%, var(--surface, #fefefe)) }
.agp-defasada i { color: #d97706 }
.agp-seg { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px }
.agp-seg button { border: none; background: transparent; padding: 4px 12px; border-radius: 7px; color: var(--portal-text-secondary, #475569); font-size: 15px; cursor: pointer }
.agp-seg .agp-seg-on { background: color-mix(in srgb, #2563eb 11%, var(--surface, #fefefe)); color: #2563eb; font-weight: 500 }
.agp-dias { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); padding: 8px }
.agp-dia { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 9px 4px; min-width: 0; border: none; border-radius: 12px; background: transparent; color: inherit; font: inherit; cursor: pointer; transition: background .2s }
.agp-dia:hover { background: color-mix(in srgb, #0369a1 5%, var(--surface, #fefefe)) }
.agp-dia-on { background: color-mix(in srgb, #2563eb 8%, var(--surface, #fefefe)) }
.agp-dia-sem { font-size: 15px; color: var(--portal-text-secondary, #475569) }
.agp-dia-hoje .agp-dia-sem { color: #2563eb; font-weight: 500 }
.agp-anel { position: relative; width: 48px; height: 48px; display: grid; place-items: center; border-radius: 50%; transition: transform .2s }
.agp-dia:hover .agp-anel { transform: translateY(-2px) }
.agp-num { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 50%; background: var(--surface, #fefefe); font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums; transition: background .2s, color .2s }
.agp-dia-hoje .agp-num { color: #2563eb }
.agp-dia-on .agp-num { background: #2563eb; color: #fefefe }
.agp-ponto { position: absolute; top: 0; right: 0; width: 11px; height: 11px; border-radius: 50%; background: #dc2626; border: 2px solid var(--surface, #fefefe) }
.agp-dia-qtd { font-size: 14.5px; color: var(--portal-text-muted, #64748b); white-space: nowrap }
.agp-resumo { display: grid; grid-template-columns: .8fr repeat(4, minmax(0, 1fr)); overflow: hidden }
.agp-res { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 13px 18px; border: none; border-left: 1px solid var(--border, #e2e8f0); background: transparent; color: inherit; font: inherit; text-align: left; transition: background .2s }
.agp-res-titulo { border-left: none }
button.agp-res { cursor: pointer }
button.agp-res:hover { background: color-mix(in srgb, #0369a1 5%, var(--surface, #fefefe)) }
.agp-res-on, button.agp-res-on:hover { background: color-mix(in srgb, #2563eb 8%, var(--surface, #fefefe)) }
.agp-rot { font-size: 15px; color: var(--portal-text-secondary, #475569); white-space: nowrap }
.agp-rot i { font-size: 13.5px; margin-right: 2px }
.agp-res strong { font-size: 22.5px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; white-space: nowrap }
.agp-det { font-size: 14.5px; color: var(--portal-text-muted, #64748b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.agp-lista { overflow: hidden }
.agp-barra { display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; padding: 12px 16px }
.agp-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0 }
.agp-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 999px; background: transparent; color: var(--portal-text-secondary, #475569); font-size: 15px; cursor: pointer; transition: background .2s, border-color .2s, color .2s }
.agp-chip:hover { border-color: #2563eb }
.agp-chip span { font-size: 14px; color: var(--portal-text-muted, #64748b) }
.agp-chip-on, .agp-chip-on span { background: #2563eb; border-color: #2563eb; color: #fefefe }
.agp-busca { display: flex; align-items: center; gap: 8px; width: min(280px, 100%); height: 34px; padding: 0 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; color: var(--portal-text-muted, #64748b); font-size: 14.5px }
.agp-busca input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: var(--portal-text, #0f172a); font-size: 15.5px }
.agp-rola { overflow-x: auto }
.agp-tabelas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(620px, 100%), 1fr)); gap: 12px; align-items: start }
.agp-tab-cab { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0) }
.agp-filtros-barra { overflow: hidden }
.agp-tab { width: 100%; min-width: 620px; border-collapse: collapse; font-size: 16px }
.agp-nome small { display: block; margin-top: 2px; font-size: 14.5px; color: var(--portal-text-muted, #64748b) }
.agp-tab .agx-sit { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; background: color-mix(in srgb, currentColor 9%, transparent) }
.agp-tab th { padding: 9px 12px; text-align: left; font-size: 14.5px; font-weight: 400; color: var(--portal-text-secondary, #475569); background: var(--portal-bg-secondary, #f8fafc); border-bottom: 1px solid var(--border, #e2e8f0); white-space: nowrap }
.agp-tab td { padding: 9px 12px; border-bottom: 1px solid var(--border, #e2e8f0); white-space: nowrap; vertical-align: middle }
.agp-tab tbody tr { cursor: pointer; transition: background .15s }
.agp-tab tbody tr:hover { background: color-mix(in srgb, #0369a1 5%, var(--surface, #fefefe)) }
.agp-tab tbody tr:last-child td { border-bottom: none }
.agp-tab th:first-child, .agp-tab td:first-child { padding-left: 16px }
.agp-tab th:last-child, .agp-tab td:last-child { padding-right: 16px }
.agp-nome { max-width: 0; width: 46%; overflow: hidden; text-overflow: ellipsis }
.agp-nome button { display: block; width: 100%; padding: 0; border: none; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.agp-dir { text-align: right !important }
.agp-val { font-weight: 500; font-variant-numeric: tabular-nums }
.agp-tr-pago .agp-nome button, .agp-tr-pago .agp-val { color: var(--portal-text-muted, #64748b) }
.agp-tab .agx-sit { margin: 0; font-size: 15px; width: fit-content }
.agp-val { font-size: 16.5px }
.agp-mais { width: calc(100% - 24px); margin: 8px 12px 12px }
@media (max-width: 1250px) { .agp-resumo { grid-template-columns: repeat(2, minmax(0, 1fr)) } .agp-res-titulo { grid-column: 1 / -1; flex-direction: row; align-items: baseline; gap: 8px } .agp-res { border-top: 1px solid var(--border, #e2e8f0) } .agp-res-titulo { border-top: none } }
@media (max-width: 768px) { .agp-dias { padding: 4px; } .agp-anel { width: 40px; height: 40px } .agp-num { width: 33px; height: 33px; font-size: 14px } .agp-dia-qtd { font-size: 0 } .agp-dia-sem { font-size: 12px } .agp-res { padding: 11px 13px } .agp-res strong { font-size: 18px } }
.agx-alerta { display: flex; align-items: flex-start; gap: 9px; padding: 10px 14px; margin-bottom: 12px; border-radius: 12px; font-size: 14px; line-height: 1.45; color: #92400e; background: color-mix(in srgb, #d97706 10%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, #d97706 28%, transparent) }
.agx-alerta i { margin-top: 3px; color: #d97706 }
@media (max-width: 1250px) { .agx-cal { grid-template-columns: repeat(4, minmax(0, 1fr)) } }
@media (max-width: 768px) { .agx-cal { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
.agx-abas { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid var(--border, #e2e8f0); margin-bottom: 14px }
.agx-aba { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; padding: 9px 13px; border: none; border-bottom: 3px solid transparent; border-radius: 10px 10px 0 0; background: transparent; color: var(--portal-text-secondary, #475569); font-size: 14.5px; cursor: pointer; transition: background .2s, color .2s, border-color .2s }
.agx-aba:hover { background: color-mix(in srgb, #2563eb 5%, var(--surface, #fefefe)); color: var(--portal-text, #0f172a) }
.agx-aba-on { color: #2563eb; font-weight: 500; border-bottom-color: #2563eb; background: color-mix(in srgb, #2563eb 8%, var(--surface, #fefefe)) }
.agx-aba-qtd { font-size: 12.5px; padding: 0 7px; border-radius: 999px; background: color-mix(in srgb, #2563eb 12%, var(--surface, #fefefe)); color: #2563eb }
.agx-aba-corpo { min-height: 280px; animation: agxEntra .22s ease both }
.agx-frase-conta { font-size: 16px; line-height: 1.5; margin: 0 0 12px }
.agx-explica { font-size: 14px; line-height: 1.5; color: var(--portal-text-secondary, #475569); margin: 0 0 12px }
.agx-fatos { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr)); gap: 8px; margin-bottom: 16px }
.agx-fatos > * { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 10px 12px; border: 1px solid transparent; border-radius: 11px; background: var(--portal-bg-secondary, #f8fafc); color: inherit; font: inherit; text-align: left }
.agx-fatos span { font-size: 13px; color: var(--portal-text-secondary, #475569) }
.agx-fatos b { font-size: 14.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.agx-fatos button { cursor: pointer; transition: border-color .2s }
.agx-fatos button:hover { border-color: #2563eb }
.agx-tempo { display: flex; margin-bottom: 16px; padding: 0 2px }
.agx-marco { --c: #2563eb; position: relative; flex: 1 1 0; display: flex; flex-direction: column; gap: 2px; padding-top: 18px; min-width: 0 }
.agx-marco:last-child { flex: 0 0 auto; }
.agx-marco:not(:last-child)::before { content: ''; position: absolute; top: 5px; left: 0; right: 0; height: 2px; background: var(--border, #e2e8f0) }
.agx-fazer { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 11px 14px; border-radius: 11px; font-size: 14.5px; background: color-mix(in srgb, #2563eb 7%, var(--surface, #fefefe)) }
.agx-fazer > i { color: #2563eb }
.agx-fazer > span { flex: 1 1 220px }
.agx-fazer .agx-btn { margin: 0; padding: 0 14px; height: 36px }
.agx-marco-ponto { position: absolute; top: 0; left: 0; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--surface, #fefefe); box-shadow: 0 0 0 1px var(--border, #e2e8f0); background: var(--border, #e2e8f0) }
.agx-marco-feito .agx-marco-ponto { background: var(--c); box-shadow: 0 0 0 1px var(--c) }
.agx-marco-nome { font-size: 13.5px; color: var(--portal-text-secondary, #475569) }
.agx-marco-data { font-size: 14.5px; font-weight: 500; font-variant-numeric: tabular-nums }
.agx-copia { display: inline-flex; align-items: center; gap: 6px }
.agx-copia button { border: none; background: transparent; padding: 2px 4px; border-radius: 6px; color: var(--portal-text-muted, #64748b); cursor: pointer; font-size: 12.5px }
.agx-copia button:hover { color: #2563eb }
@keyframes agxEntra { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes agxFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes agxCresce { from { transform: scaleY(0) } to { transform: none } }
@media (prefers-reduced-motion: reduce) { .agx-card, .agx-modal, .agx-fundo, .agx-barra, .agx-hoje-card, .agx-cal-dia, .agx-aba-corpo, .agp-card { animation: none } .agx-hoje-card:hover, .agx-cal-dia:hover:not(:disabled) { transform: none } }
`
