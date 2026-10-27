'use client'
// Ficha do técnico — versão final (José, 20/10/2026: "tem que parecer que um designer fez… profissional,
// moderno, dinâmico, fácil de entender, sem espaços vazios"). Tela cheia; rola tudo junto.
// Cabeçalho compacto (identidade + liga + mês), faixa de fatos do RH, metas, e a comissão com cada OS
// numa linha: valor da OS, peças, desconto e requisição não cobrada à vista. A seção e o mês vão na URL.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FichaTecnico as Ficha } from '@/lib/mecanicos/ficha-server'
import type { LinhaComissao } from '@/lib/mecanicos/comissao-detalhe'
import { patente, NIVEL_MAX, PONTOS_POR_OS, PONTOS_POR_DEGRAU } from '@/lib/mecanicos/carreira'
import { IconeLiga } from './CartaLiga'
import { brl, brl2 } from './ui'
import type { CardDados } from './CardsTecnicoOpcoes'
import { nomeMes, dataBR, diaBR, iniciais, tempoDeCasa, useVisores, useFicha, andarMes, hojeSP, ESTILO_FT, Num } from './FichaTecnico'
import { useEdicao, LancarComissao, Divisao, Conteudo, MOTIVOS_NAO, grupoDa, chaveL, ESTILO_FO, type EdicaoComissao } from './FichaOpcoes'

const MUDO = 'var(--portal-text-muted, #64748b)'
export const SECOES = [
  { k: 'comissao', rot: 'Comissão', ic: 'fa-sack-dollar' }, { k: 'os', rot: 'Ordens de serviço', ic: 'fa-screwdriver-wrench' },
  { k: 'req', rot: 'Requisições', ic: 'fa-receipt' }, { k: 'frota', rot: 'Frota', ic: 'fa-car-side' },
  { k: 'oc', rot: 'Ocorrências', ic: 'fa-shield-halved' }, { k: 'rh', rot: 'RH', ic: 'fa-id-card' },
] as const

/** Janela da ficha (tela cheia). `secao`/`mes` controlados de fora quando vêm da URL. */
export function FichaPro({ nome, foto, card, onFechar, secao, onSecao, mes: mesFora, onMes }: {
  nome: string; foto?: string; card?: CardDados | null; onFechar: () => void
  secao?: string; onSecao?: (s: string) => void; mes?: string; onMes?: (m: string) => void
}) {
  const [mesLocal, setMesLocal] = useState(() => hojeSP().slice(0, 7))
  const mes = mesFora || mesLocal
  const setMes = (m: string) => { setMesLocal(m); onMes?.(m) }
  const [secLocal, setSecLocal] = useState('comissao')
  const sec = secao || secLocal
  const setSec = (s: string) => { setSecLocal(s); onSecao?.(s) }
  const { dados: d, erro } = useFicha(nome, mes)
  useEffect(() => {
    const t = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !document.querySelector('.ft-doc, .ft-req-fundo')) onFechar() }
    window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t)
  }, [onFechar])
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o } }, [])
  const tela = (
    <div className="fp-fundo" role="dialog" aria-label={`Ficha de ${nome}`}>
      <style>{ESTILO_FT}</style><style>{ESTILO_FO}</style><style>{ESTILO_FP}</style>
      <button type="button" className="fp-x" onClick={onFechar} aria-label="Fechar (Esc)" title="Fechar (Esc)"><i className="fas fa-xmark" /></button>
      {d ? <Corpo key={mes} d={d} foto={foto} card={card} mes={mes} setMes={setMes} sec={sec} setSec={setSec} />
        : <div className="fp-carr">{erro ? <><i className="fas fa-triangle-exclamation" /> {erro}</> : <><i className="fas fa-circle-notch fa-spin" /> abrindo a ficha de {nome}…</>}</div>}
    </div>
  )
  return typeof document === 'undefined' ? tela : createPortal(tela, document.body)
}

export function Corpo({ d, foto, card, mes, setMes, sec, setSec }: { d: Ficha; foto?: string; card?: CardDados | null; mes: string; setMes: (m: string) => void; sec: string; setSec: (s: string) => void }) {
  const v = useVisores(d), e = useEdicao(d)
  return (
    <div className="fp">
      <Cabecalho d={d} foto={foto} mes={mes} setMes={setMes} />
      <h2 className="fp-h2">Dados do RH</h2>
      <Fatos d={d} />
      <h2 className="fp-h2">Metas do mês<small>básica 20 h e R$ 4 mil · ideal 40 h e R$ 8 mil por semana</small></h2>
      <MetasPro d={d} card={card} />
      <nav className="fp-secoes">
        {SECOES.map((s) => <button key={s.k} type="button" className={sec === s.k ? 'on' : ''} onClick={() => setSec(s.k)}>{s.rot}</button>)}
      </nav>
      <main className="fp-main">
        {sec === 'comissao' ? <><LancarComissao d={d} e={e} /><ListaOS d={d} e={e} verOS={v.verOS} verReq={v.verReq} /></> : sec === 'frota' ? <FrotaPro d={d} verReq={v.verReq} /> : sec === 'oc' ? <OcorrenciasPro d={d} /> : sec === 'rh' ? <RHPro d={d} /> : <Conteudo d={d} aba={sec} v={v} e={e} />}
      </main>
      {v.camadas}
    </div>
  )
}

// ============================================================================ metas (20/10/2026: "melhora isso")
/** Metas do mês: número grande + duas barras separadas (básica e ideal), cada uma com alvo, % e quanto falta.
 *  Mês atual aberto pelo card: os mesmos números do card. */
function MetasPro({ d, card }: { d: Ficha; card?: CardDados | null }) {
  const [a, m] = d.mes.split('-').map(Number)
  const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate(), sem = diasMes / 7
  const atual = d.hoje.startsWith(d.mes)
  const fracao = atual ? Math.min(1, Number(d.hoje.slice(8, 10)) / diasMes) : 1
  const usaCard = !!card && atual
  const fat = usaCard ? card!.faturado : d.os.faturadas.reduce((s, o) => s + o.parte, 0)
  const hrs = usaCard ? card!.horas : d.os.faturadas.reduce((s, o) => s + o.horas / Math.max(1, o.tecnicos.length), 0)
  const semTxt = sem.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return (
    <div className="mp">
      <CartaoMeta rot={`Faturado em ${nomeMes(d.mes).toLowerCase()}`} v={fat} bas={4000 * sem} ide={8000 * sem} f={brl} fracao={fracao} atual={atual} conta={`R$ 4 mil e R$ 8 mil por semana × ${semTxt}`} />
      <CartaoMeta rot={`Horas em ${nomeMes(d.mes).toLowerCase()}`} v={hrs} bas={20 * sem} ide={40 * sem} f={horasTxt} fracao={fracao} atual={atual} conta={`20 h e 40 h por semana × ${semTxt}`} />
      {usaCard && <CartaoMeta rot="Horas nesta semana" v={card!.horasSemana} bas={card!.metaSemana} ide={card!.idealSemana} f={horasTxt} fracao={1} atual={false} conta="metas da semana" compacto />}
    </div>
  )
}
const horasTxt = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('pt-BR')} h`

function CartaoMeta({ rot, v, bas, ide, f, fracao, atual, conta, compacto }: { rot: string; v: number; bas: number; ide: number; f: (n: number) => string; fracao: number; atual: boolean; conta: string; compacto?: boolean }) {
  const pB = (v / Math.max(1, bas)) * 100, pI = (v / Math.max(1, ide)) * 100
  const ritmo = bas * fracao
  const estado = v >= ide ? 'ideal' : v >= bas ? 'ok' : atual && v >= ritmo ? 'ritmo' : 'baixo'
  const selo = { ideal: 'Bateu a ideal', ok: 'Bateu a básica', ritmo: 'No ritmo', baixo: compacto ? 'Semana em andamento' : atual ? 'Abaixo do ritmo' : 'Não bateu' }[estado]
  const barra = (nome: string, alvo: number, p: number, k: string, marca?: number) => (
    <div className={`mp-b ${k} ${p >= 100 ? 'cheia' : ''}`}>
      <div className="mp-b-cab"><span>{nome}</span><b>{f(alvo)}</b><em>{p >= 100 ? 'batida' : `faltam ${f(alvo - v)}`}</em><strong>{Math.round(p)}%</strong></div>
      <div className="mp-b-trilho"><i style={{ width: `${Math.min(100, p)}%` }} />{marca != null && marca < 100 && <u style={{ left: `${marca}%` }} title={`hoje deveria estar em ${f(alvo * fracao)}`} />}</div>
    </div>
  )
  return (
    <div className={`mp-c ${estado} ${compacto ? 'compacto' : ''}`}>
      <div className="mp-topo"><span className="mp-rot">{rot}</span><span className="mp-selo">{selo}</span></div>
      <b className="mp-v"><Num v={v} f={f} /></b>
      {barra('Básica', bas, pB, 'bas', atual ? fracao * 100 : undefined)}
      {barra('Ideal', ide, pI, 'ide')}
      <small className="mp-conta">{conta}{atual && v < bas ? ` · hoje deveria estar em ${f(ritmo)}` : ''}</small>
    </div>
  )
}

// ============================================================================ frota (20/10/2026: redesenho + carro em uso)
const ROT_GASTO: Record<string, string> = { abastecimento: 'Combustível', manutencao: 'Manutenção', alimentacao: 'Alimentação', materiais: 'Materiais' }
function FrotaPro({ d, verReq }: { d: Ficha; verReq: (r: { id: number; titulo: string }) => void }) {
  const f = d.frota
  if (!f) return <div className="fp-vazio">Não deu para ler a frota.</div>
  const vin = (f as { vinculo?: { emUso: string[]; cadastro: string[]; soCadastro: boolean; divergente: boolean } }).vinculo
  const g = f.gastos
  const reqId = (ref: string | null) => { const m = String(ref || '').match(/^req:(\d+)/); return m ? Number(m[1]) : null }
  return (
    <div className="fr">
      {vin?.divergente && <div className="fr-aviso"><b>Cadastro da frota desatualizado.</b> Pelo uso (cartão-frota e requisições), hoje ele está com <b>{vin.emUso.join(', ')}</b>; no cadastro ainda aparece <b>{vin.cadastro.join(', ') || 'nenhum carro'}</b>.</div>}
      {vin?.soCadastro && <div className="fr-aviso cinza">Sem abastecimento nem requisição dele nos últimos 45 dias — mostrando o carro do cadastro.</div>}
      {f.carros.length === 0 ? <div className="fp-vazio">Nenhum carro em uso nem vinculado a ele.</div> : f.carros.map((c) => {
        const u = c as typeof c & { ultimoUso?: string | null; usoFontes?: string[] }
        return (
          <section key={c.placa} className="fr-carro">
            <div className="fr-id">
              <span className="fr-placa">{c.placa.replace(/^([A-Z]{3})/, '$1-')}</span>
              <div><b>{c.modelo || 'Veículo'}</b><small>{[c.ano, u.ultimoUso ? `último uso ${dataBR(u.ultimoUso)} · ${u.usoFontes?.join(' e ')}` : 'pelo cadastro'].filter(Boolean).join(' · ')}</small></div>
            </div>
            <div className="fr-stats">
              <div><small>Rodou no mês</small><b>{Math.round(c.km).toLocaleString('pt-BR')} km</b></div>
              <div><small>Dias rodando</small><b>{c.diasRodados}</b></div>
              <div><small>Ligado</small><b>{Math.round(c.ligadoH)} h</b><em>{Math.round(c.movimentoH)} h andando</em></div>
              <div className={c.velMax > 120 ? 'ruim' : ''}><small>Velocidade máx.</small><b>{Math.round(c.velMax)} km/h</b></div>
              <div><small>Paradas fora</small><b>{c.paradasAtipicas}</b><em>de lugar conhecido</em></div>
            </div>
            {c.pendencias.length > 0 && (
              <div className="fr-pend">
                <h5>{c.pendencias.length} pendência{c.pendencias.length > 1 ? 's' : ''} aberta{c.pendencias.length > 1 ? 's' : ''}</h5>
                {c.pendencias.map((p, k) => <div key={k} className="fr-pend-lin"><span>{p.titulo}{p.descricao && <small> — {p.descricao}</small>}</span><time>{dataBR(p.desde)}</time></div>)}
              </div>
            )}
          </section>
        )
      })}
      <section className="fr-gastos">
        <div><small>Combustível</small><b>{brl(g.abastecimento)}</b><em>{Math.round(g.litros)} litros</em></div>
        <div><small>Manutenção do carro</small><b>{brl(g.manutencao)}</b></div>
        <div><small>Alimentação</small><b>{brl(g.alimentacao)}</b></div>
        <div><small>Materiais</small><b>{brl(g.materiais)}</b>{g.emAberto > 0 && <em>{brl(g.emAberto)} em aberto</em>}</div>
      </section>
      {f.lancamentos.length > 0 && (
        <table className="fr-tab">
          <thead><tr><th>Data</th><th>Tipo</th><th>Origem</th><th>Carro</th><th className="n">Litros</th><th className="n">Valor</th></tr></thead>
          <tbody>
            {f.lancamentos.map((l, i) => {
              const id = reqId(l.ref)
              return (
                <tr key={i}>
                  <td>{dataBR(l.data)}</td>
                  <td>{ROT_GASTO[l.tipo] || l.tipo}{l.aberto && <span className="fr-st">em aberto</span>}</td>
                  <td>{l.origem === 'cartao' ? 'Cartão-frota' : id ? <button type="button" className="fr-req" onClick={() => verReq({ id, titulo: ROT_GASTO[l.tipo] || l.tipo })}>Requisição #{id}</button> : 'Requisição'}</td>
                  <td>{l.placa || '—'}{l.outroCarro && <span className="fr-st cinza">outro carro</span>}</td>
                  <td className="n">{l.litros ? l.litros.toLocaleString('pt-BR') : '—'}</td>
                  <td className="n">{brl(l.valor)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ============================================================================ ocorrências (20/10/2026: fonte maior, organizado)
function OcorrenciasPro({ d }: { d: Ficha }) {
  const ocs = d.ocorrencias
  const porMes = useMemo(() => {
    const m = new Map<string, typeof ocs>()
    for (const o of ocs) m.set(o.data.slice(0, 7), [...(m.get(o.data.slice(0, 7)) || []), o])
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [ocs])
  const pts = ocs.filter((o) => o.vale).reduce((s, o) => s + o.pontos, 0)
  const aceitas = ocs.filter((o) => o.defesas.some((x) => x.status === 'aprovada')).length
  const recusadas = ocs.filter((o) => o.defesas.some((x) => x.status === 'recusada')).length
  const pend = ocs.filter((o) => o.defesas.some((x) => x.status === 'pendente')).length
  if (!ocs.length) return <div className="fp-vazio">Nenhuma ocorrência nos últimos 12 meses.</div>
  return (
    <div className="oc2">
      <div className="oc2-resumo">
        <div><small>Ocorrências em 12 meses</small><b>{ocs.length}</b></div>
        <div><small>Pontos descontados</small><b className="ruim">−{pts}</b></div>
        <div><small>Meses com ocorrência</small><b>{porMes.length}</b></div>
        <div><small>Defesas</small><b>{aceitas} aceitas · {recusadas} recusadas{pend ? ` · ${pend} esperando` : ''}</b></div>
      </div>
      {porMes.map(([m, l]) => {
        const p = l.filter((o) => o.vale).reduce((s, o) => s + o.pontos, 0)
        return (
          <section key={m} className={`oc2-mes ${m === d.mes ? 'atual' : ''}`}>
            <header><h3>{nomeMes(m)}</h3><span>{l.length} ocorrência{l.length > 1 ? 's' : ''}</span><span className="oc2-pts">−{p} pontos</span><span className="oc2-fim">fechou com <b>{Math.max(0, 100 - p)}</b></span></header>
            {l.map((o) => {
              const def = o.defesas[0]
              return (
                <div key={o.id} className={`oc2-it ${o.vale ? '' : 'anulada'}`}>
                  <span className="oc2-p" style={{ background: o.cor }}>−{o.pontos}</span>
                  <div className="oc2-txt">
                    <div className="oc2-l1"><b>{o.rotulo}</b><time>{dataBR(o.data)}{o.idOrdem ? ` · ${o.idOrdem}` : ''}</time></div>
                    <p>{o.descricao}</p>
                    {def && <div className={`oc2-def ${def.status}`}>Defesa {def.status === 'aprovada' ? 'aceita' : def.status === 'recusada' ? 'recusada' : 'esperando julgamento'}{def.avaliadoPor ? ` por ${def.avaliadoPor}` : ''}{def.texto ? <q>{def.texto}</q> : null}{!o.vale && <em> · pontos devolvidos</em>}</div>}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

// ============================================================================ RH (20/10/2026: sem repetir o cadastro do topo)
const ROT_FER: Record<string, string> = { em_aquisicao: 'adquirindo', disponivel: 'pode tirar', vencido_dobro: 'vencida — paga em dobro', vencido: 'vencida', gozado: 'tirada' }
function RHPro({ d }: { d: Ficha }) {
  const r = d.rh
  if (!r) return <div className="fp-vazio">Não achei este técnico no RH.</div>
  const faltas = r.ponto.filter((p) => /falta/i.test(p.tipo)).length, atrasos = r.ponto.filter((p) => /atras/i.test(p.tipo)).length
  const aTirar = r.ferias.filter((f) => /disponivel|vencid/.test(f.status)).reduce((s, f) => s + f.saldo, 0)
  const vencida = r.ferias.some((f) => /vencid/.test(f.status) && f.saldo > 0)
  const desc12 = r.descontos.reduce((s, x) => s + x.valor, 0)
  const com = [...r.comissoes].slice(0, 12).reverse()
  const maxC = Math.max(1, ...com.map((c) => c.valor))
  const limpa = (t: string) => t.replace(/^\[(Portal )?REQ #(\d+)\]\s*/, 'Req. #$2 · ').replace(/\s*\|\s*Obs:.*$/, '').replace(/\s*\(\d{2}\/\d{2}\/\d{4}\)\s*$/, '')
  return (
    <div className="rh2">
      <div className="rh2-resumo">
        <div className={vencida ? 'ruim' : ''}><small>Férias para tirar</small><b>{aTirar} dias</b><em>{vencida ? 'tem período vencido' : 'em dia'}</em></div>
        <div className={faltas ? 'ruim' : ''}><small>Ponto · 12 meses</small><b>{faltas} falta{faltas === 1 ? '' : 's'}</b><em>{atrasos} atraso{atrasos === 1 ? '' : 's'}</em></div>
        <div className={r.caixinha.saldo < 0 ? 'ruim' : ''}><small>Caixinha</small><b>{brl2(r.caixinha.saldo)}</b><em>{r.caixinha.movimentos} movimentos</em></div>
        <div><small>Descontos lançados</small><b>{brl2(desc12)}</b><em>{r.descontos.length} lançamento{r.descontos.length === 1 ? '' : 's'}</em></div>
        <div><small>Uniformes</small><b>{r.uniformes.length}</b><em>{r.uniformes[0] ? `última entrega ${dataBR(r.uniformes[0].data)}` : 'nenhuma entrega'}</em></div>
      </div>
      <div className="rh2-cols">
        <section className="rh2-box">
          <h3>Comissões lançadas</h3>
          <div className="rh2-barras">{com.map((c) => <div key={c.mes} title={`${nomeMes(c.mes)}: ${brl2(c.valor)} · ${c.status.replace('_', ' ')}`}><em>{brl(c.valor)}</em><i className={c.status === 'paga' ? 'paga' : c.status === 'aprovada' ? 'apr' : ''} style={{ height: `${(c.valor / maxC) * 100}%` }} /><small>{nomeMes(c.mes).slice(0, 3)}</small></div>)}</div>
          <div className="rh2-leg"><span><i className="paga" />paga</span><span><i className="apr" />aprovada</span><span><i />outras</span></div>
        </section>
        <section className="rh2-box">
          <h3>Férias</h3>
          {r.ferias.length ? r.ferias.map((f) => (
            <div key={f.inicio} className={`rh2-fer ${/vencid/.test(f.status) ? 'ruim' : ''}`}>
              <span>{dataBR(f.inicio)} – {dataBR(f.fim)}</span>
              <div className="rh2-fer-b"><i style={{ width: `${Math.min(100, ((f.gozados + f.vendidos) / Math.max(1, f.direito)) * 100)}%` }} /></div>
              <b>{f.saldo > 0 ? `${f.saldo} dias` : 'tirada'}</b><em>{ROT_FER[f.status] || f.status.replace(/_/g, ' ')}</em>
            </div>
          )) : <p className="fp-vazio-l">Sem períodos lançados.</p>}
          {r.ponto.length > 0 && <>
            <h3 className="rh2-h3b">Ponto</h3>
            {r.ponto.map((p, i) => <div key={i} className="rh2-ponto"><span>{dataBR(p.data)}</span><b>{p.tipo}</b><em>{p.quantidade} {p.unidade}{p.obs ? ` · ${p.obs}` : ''}</em></div>)}
          </>}
        </section>
      </div>
      {r.descontos.length > 0 && (
        <section className="rh2-box">
          <h3>Descontos</h3>
          <table className="rh2-tab"><tbody>{r.descontos.map((x, i) => <tr key={i}><td>{nomeMes(x.mes)}</td><td>{limpa(x.descricao)}</td><td className="n">{brl2(x.valor)}</td><td><span className={`rh2-st ${x.status}`}>{x.status}</span></td></tr>)}</tbody></table>
        </section>
      )}
    </div>
  )
}

// ============================================================================ topo
function Cabecalho({ d, foto, mes, setMes }: { d: Ficha; foto?: string; mes: string; setMes: (m: string) => void }) {
  const url = d.foto || foto
  const pt = d.pontos.nivel != null ? patente(d.pontos.nivel) : null
  const p = d.pontos, corPts = p.saldo >= 90 ? '#10b981' : p.saldo >= 70 ? '#f59e0b' : '#ef4444'
  return (
    <header className="fp-cab">
      <div className="fp-quem">
        <div className="fp-foto" style={{ '--lc': pt?.cor || '#94a3b8' } as React.CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt={d.nome} /> : <span>{iniciais(d.nome)}</span>}
        </div>
        <div className="fp-nome">
          <h1>{d.nome}</h1>
          <p>{[d.rh?.cargo, d.rh?.tipoContrato?.toUpperCase(), d.rh?.admissao && `${tempoDeCasa(d.rh.admissao)} de casa`, d.rh?.cidade].filter(Boolean).join('  ·  ')}</p>
        </div>
        {pt && <LigaPop d={d}>
          <div className="fp-liga">
            <IconeLiga nivel={p.nivel!} tamanho={46} />
            <div>
              <small>Liga</small><b>{pt.nome}</b>
              <span className="fp-pts"><i style={{ width: `${p.saldo}%`, background: corPts }} /></span>
              <em><b style={{ color: corPts }}>{p.saldo}</b>/100 pontos no mês</em>
            </div>
          </div>
        </LigaPop>}
      </div>
      <div className="fp-mes">
        <button type="button" onClick={() => setMes(andarMes(mes, -1))} aria-label="Mês anterior"><i className="fas fa-chevron-left" /></button>
        <b>{nomeMes(mes)}</b>
        <button type="button" disabled={mes >= d.hoje.slice(0, 7)} onClick={() => setMes(andarMes(mes, 1))} aria-label="Próximo mês"><i className="fas fa-chevron-right" /></button>
      </div>
    </header>
  )
}

/** Liga: passando o mouse ou clicando, mostra onde ele está, quanto falta para a próxima fase e como sobe ou cai. */
function LigaPop({ d, children }: { d: Ficha; children: React.ReactNode }) {
  const [fixo, setFixo] = useState(false)
  const [sobre, setSobre] = useState(false)
  const p = d.pontos
  const nivel = p.nivel ?? 0
  const atual = patente(nivel), prox = nivel < NIVEL_MAX ? patente(nivel + 1) : null
  const fecha = p.seFecharAssim ?? nivel
  const hist = ((p as { historico?: { mes: string; pontos: number; movimento: number; depois: number }[] }).historico || [])
  const aberto = fixo || sobre
  return (
    <div className="fp-lp" onMouseEnter={() => setSobre(true)} onMouseLeave={() => setSobre(false)} onClick={() => setFixo((f) => !f)}>
      {children}
      {aberto && (
        <div className="fp-lp-pop" onClick={(e) => e.stopPropagation()}>
          <div className="fp-lp-cab"><b>{atual.nome}</b><span>nível {nivel} de {NIVEL_MAX}</span></div>
          <div className="fp-lp-trilha">{Array.from({ length: NIVEL_MAX + 1 }, (_, i) => <i key={i} className={`${i <= nivel ? 'ok' : ''} ${i === fecha && fecha !== nivel ? 'vai' : ''}`} style={{ background: i <= nivel ? patente(i).cor : undefined }} title={patente(i).nome} />)}</div>
          <div className="fp-lp-lin"><span>Próxima fase</span><b>{prox ? prox.nome : 'já está no topo'}</b></div>
          <div className="fp-lp-lin"><span>Como chega lá</span><b>{prox ? (p.faltaProximo ? `mais ${p.faltaProximo} pontos (${Math.ceil(p.faltaProximo / PONTOS_POR_OS)} OS limpas)` : 'fechar o mês') : '—'}</b></div>
          <div className="fp-lp-lin"><span>Se fechar o mês assim</span><b className={fecha > nivel ? 'bom' : fecha < nivel ? 'ruim' : ''}>{patente(fecha).nome}{fecha > nivel ? ' (sobe)' : fecha < nivel ? ` (cai ${nivel - fecha})` : ' (fica)'}</b></div>
          <div className="fp-lp-lin"><span>Saldo da liga</span><b>{p.saldoLiga ?? 0} pontos</b></div>
          <div className="fp-lp-lin"><span>Neste mês</span><b>+{p.ganhosMes ?? 0} ({p.osLimpasMes ?? 0} OS limpas) · −{p.descontados}</b></div>
          {hist.length > 0 && <div className="fp-lp-hist">{hist.map((h) => <span key={h.mes} className={h.movimento > 0 ? 'bom' : h.movimento < 0 ? 'ruim' : ''} title={`${nomeMes(h.mes)}: ${h.pontos} pontos descontados`}><small>{nomeMes(h.mes).slice(0, 3)}</small><b>{h.movimento > 0 ? `+${h.movimento}` : h.movimento}</b></span>)}</div>}
          <p className="fp-lp-regra">Cada OS fechada sem problema dá {PONTOS_POR_OS} pontos; cada ocorrência tira os pontos dela (retorno de serviço em dobro). {PONTOS_POR_DEGRAU} pontos de saldo = 1 degrau.</p>
        </div>
      )}
    </div>
  )
}

/** Faixa de fatos do RH: uma linha só, cada fato com rótulo pequeno e valor; o que pede atenção fica colorido. */
function Fatos({ d }: { d: Ficha }) {
  const r = d.rh
  if (!r) return <div className="fp-rhg"><div className="fp-grp"><h4>RH</h4><div className="fp-li"><span>Cadastro</span><b>não achei este técnico no RH</b></div></div></div>
  const ferias = r.ferias.filter((f) => /disponivel|vencid/.test(f.status) && f.saldo > 0)
  const vencida = ferias.some((f) => /vencid/.test(f.status))
  const faltas = r.ponto.filter((p) => /falta/i.test(p.tipo)).length, atrasos = r.ponto.filter((p) => /atras/i.test(p.tipo)).length
  const ult = r.comissoes[0]
  type L = { rot: string; v: React.ReactNode; tom?: 'ruim' | 'bom' }
  const grupos: { tit: string; linhas: L[] }[] = [
    { tit: 'Contrato', linhas: [
      { rot: 'Salário', v: r.salario ? brl2(r.salario) : '—' },
      { rot: 'Comissão', v: `${d.comissao.pct}% das horas` },
      { rot: 'Admissão', v: r.admissao ? `${dataBR(r.admissao)} · ${tempoDeCasa(r.admissao)}` : '—' },
    ] },
    { tit: 'Contato', linhas: [
      { rot: 'Telefone', v: r.telefone || '—' },
      { rot: 'Aniversário', v: r.aniversario ? `${r.aniversario.slice(3, 5)}/${r.aniversario.slice(0, 2)}` : '—' },
      { rot: 'Cidade', v: r.cidade || '—' },
    ] },
    { tit: 'Situação', linhas: [
      { rot: 'Férias', v: ferias.length ? `${ferias.reduce((s, f) => s + f.saldo, 0)} dias${vencida ? ' · uma vencida' : ''}` : 'em dia', tom: vencida ? 'ruim' : 'bom' },
      { rot: 'Ponto (12 meses)', v: `${faltas} falta${faltas === 1 ? '' : 's'} · ${atrasos} atraso${atrasos === 1 ? '' : 's'}`, tom: faltas || atrasos ? 'ruim' : 'bom' },
      { rot: 'Caixinha', v: brl2(r.caixinha.saldo), tom: r.caixinha.saldo < 0 ? 'ruim' : undefined },
    ] },
    { tit: 'Última comissão', linhas: [
      { rot: 'Valor', v: ult ? brl2(ult.valor) : '—' },
      { rot: 'Mês', v: ult ? nomeMes(ult.mes) : '—' },
      { rot: 'Situação', v: ult ? ult.status.replace('_', ' ') : '—', tom: ult?.status === 'paga' ? 'bom' : undefined },
    ] },
  ]
  return (
    <div className="fp-rhg">
      {grupos.map((g) => (
        <div key={g.tit} className="fp-grp">
          <h4>{g.tit}</h4>
          {g.linhas.map((l) => <div key={l.rot} className={`fp-li ${l.tom || ''}`}><span>{l.rot}</span><b>{l.v}</b></div>)}
        </div>
      ))}
    </div>
  )
}

// ============================================================================ OS da comissão
// horas = horas cobradas; descBase = desconto que caiu na base da comissão (hora + geral rateado); motivo = escrito na OS
type InfoOS = { total: number; pecas: number; servico: number; desconto: number; reqs: { id: number; titulo: string; valor: number }[]; interna?: string; horas?: number; descBase?: number; motivo?: string | null }

function ListaOS({ d, e, verOS, verReq }: { d: Ficha; e: EdicaoComissao; verOS: (os: string, c?: string) => void; verReq: (r: { id: number; titulo: string }) => void }) {
  const [so, setSo] = useState<'todas' | 'mexidas' | 'alerta'>('todas')
  const info = useMemo(() => {
    const m = new Map<string, InfoOS>()
    for (const o of d.os.faturadas) {
      const ds = (o as { descontos?: { hora: number; km: number; geral: number; pecas: number } | null }).descontos
      const extra = o as { horas?: number; descontoMotivo?: string | null }
      m.set(o.os, { total: o.bruto, pecas: o.pecas, servico: o.servico + o.kmValor, desconto: ds ? ds.hora + ds.km + ds.geral + ds.pecas : 0, reqs: o.requisicoes,
        horas: extra.horas, descBase: ds ? ds.hora + ds.geral : 0, motivo: extra.descontoMotivo ?? null })
    }
    for (const o of d.os.internas) if (!m.has(o.os)) m.set(o.os, { total: o.valor, pecas: 0, servico: o.valor, desconto: 0, reqs: [], interna: o.contrato })
    return m
  }, [d])
  const alerta = (l: LinhaComissao) => { const x = info.get(l.os); return !!x && (x.desconto > 0 || x.reqs.length > 0) }
  const lista = e.linhas.filter((l) => so === 'todas' || (so === 'mexidas' ? !!e.ed[chaveL(l)] : alerta(l)))
  const aCaminho = d.comissao.linhas.filter((l) => l.tipo === 'aguardando')
  const GRUPOS = [
    { k: 'cliente', rot: 'Faturadas para clientes', ic: 'fa-user-tie', dica: 'contam no pódio' },
    { k: 'garantia', rot: 'Garantia', ic: 'fa-shield-heart', dica: 'paga pela fábrica' },
    { k: 'interna', rot: 'Internas', ic: 'fa-house-chimney', dica: 'loja, cortesia e entrega técnica · não contam no pódio' },
  ] as const
  return (
    <section className="fp-os">
      <div className="fp-os-topo">
        <div className="fp-filtro">
          <button type="button" className={so === 'todas' ? 'on' : ''} onClick={() => setSo('todas')}>Todas <b>{e.linhas.length}</b></button>
          <button type="button" className={so === 'alerta' ? 'on' : ''} onClick={() => setSo('alerta')}>Com desconto ou requisição <b>{e.linhas.filter(alerta).length}</b></button>
          <button type="button" className={so === 'mexidas' ? 'on' : ''} onClick={() => setSo('mexidas')}>Com decisão <b>{Object.keys(e.ed).length}</b></button>
        </div>
        <div className="fp-leg"><span className="pg">Pagar</span><span className="np">Não pagar</span><span className="aj">Ajustar</span><span className="dv">Dividir</span></div>
      </div>
      {GRUPOS.map((g) => {
        const linhas = lista.filter((l) => grupoDa(l) === g.k)
        if (!linhas.length) return null
        const total = linhas.reduce((s, l) => s + e.final(l), 0)
        return (
          <div key={g.k} className={`fp-g ${g.k}`}>
            <div className="fp-g-cab">
              <span className="fp-g-ic"><i className={`fas ${g.ic}`} /></span>
              <b>{g.rot}</b><small>{g.dica}</small>
              <span className="fp-g-tot"><em>{linhas.length} OS</em><b>{brl2(total)}</b></span>
            </div>
            <div className="fp-tab">
              <div className="fp-th"><span>OS</span><span>Cliente</span><span>Valor da OS</span><span className="n">Base (horas)</span><span>Decisão</span><span className="n">Comissão</span></div>
              {linhas.map((l) => <LinhaOS key={chaveL(l)} d={d} l={l} e={e} x={info.get(l.os)} verOS={verOS} verReq={verReq} />)}
            </div>
          </div>
        )
      })}
      {!lista.length && <div className="fp-vazio">Nenhuma OS neste filtro.</div>}
      {aCaminho.length > 0 && <p className="fp-cam"><i className="fas fa-hourglass-half" /> {aCaminho.length} OS esperando faturar · {brl2(aCaminho.reduce((s, l) => s + l.valor, 0))} de comissão a caminho — entram quando faturarem.</p>}
    </section>
  )
}

function LinhaOS({ d, l, e, x, verOS, verReq }: { d: Ficha; l: LinhaComissao; e: EdicaoComissao; x?: InfoOS; verOS: (os: string, c?: string) => void; verReq: (r: { id: number; titulo: string }) => void }) {
  const ed = e.de(l)
  const [dividindo, setDividindo] = useState(false)
  const f = e.final(l)
  const estado = ed.acao === 'nao' ? 'nao' : ed.divisao ? 'div' : ed.acao === 'ajustar' ? 'aj' : 'pg'
  const reqTotal = x?.reqs.reduce((s, r) => s + r.valor, 0) || 0
  const com = (l.tecnicos?.length || 0) > 1 ? l.tecnicos!.filter((t) => t !== d.nome).map((t) => t.split(' ')[0]).join(', ') : ''
  return (
    <div className={`fp-lin ${estado}`}>
      <div className="fp-row">
        <button type="button" className="fp-num" onClick={() => verOS(l.os, l.cliente)} title="Abrir a OS">{l.numeroOmie || l.os}</button>
        <div className="fp-cli">
          <b title={l.cliente}>{l.cliente || '—'}</b>
          <small>{diaBR(l.data)}{com && <> · com {com}</>} · {l.regra.replace(/\s*÷ \d+.*$/, '')}</small>
          {l.motivo && <small className="fp-rh"><i className="fas fa-pen" /> RH: {l.motivo.motivo}</small>}
        </div>
        <div className="fp-valor">
          <b>{x ? brl(x.total) : '—'}</b>
          <div className="fp-chips">
            {x && x.pecas > 0 && <span className="pc" title="Peças vinculadas (PPV)"><i className="fas fa-gear" />peças {brl(x.pecas)}</span>}
            {x && x.desconto > 0 && <span className="ds" title="Desconto dado na OS (hora, km, geral e peças)"><i className="fas fa-tag" />desconto {brl(x.desconto)}</span>}
            {x && x.reqs.length > 0 && <button type="button" className="rq" title={`Requisição não cobrada do cliente: ${x.reqs.map((r) => `#${r.id} ${r.titulo}`).join(' · ')}`} onClick={() => verReq(x.reqs[0])}><i className="fas fa-receipt" />{brl(reqTotal)} s/ cobrar</button>}
            {x?.interna && <span className="it">{x.interna}</span>}
          </div>
        </div>
        {/* horas cobradas + aviso quando a base já veio com o desconto da OS (José, 27/10/2026). Por ora a decisão é
            na mão: desconto que NÃO foi erro do técnico pede "Ajustar" para pagar sobre o valor cheio. */}
        <span className="fp-base">
          {l.base ? brl(l.base) : '—'}
          {x?.horas ? <small style={{ display: 'block', fontSize: 11, color: '#64748b', fontWeight: 500 }}>{String(x.horas).replace('.', ',')} h cobradas</small> : null}
          {x && (x.descBase || 0) > 0 && l.base > 0 && (
            <small title={`A base já está com ${brl(x.descBase || 0)} de desconto da OS.${x.motivo ? ` Motivo na OS: ${x.motivo}.` : ' A OS não tem motivo do desconto escrito.'} Se o desconto não foi erro do técnico, use Ajustar para pagar sobre o valor cheio.`}
              style={{ display: 'inline-block', marginTop: 3, padding: '1px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: '#fef3c7', color: '#92400e', cursor: 'help' }}>
              <i className="fas fa-triangle-exclamation" /> com desconto −{brl(x.descBase || 0)}{x.motivo ? '' : ' · sem motivo'}
            </small>
          )}
          {x?.motivo && (x.descBase || 0) > 0 && <small style={{ display: 'block', fontSize: 10.5, color: '#92400e', marginTop: 2, maxWidth: 180, marginLeft: 'auto', lineHeight: 1.3 }} title={x.motivo}>“{x.motivo.length > 60 ? `${x.motivo.slice(0, 60)}…` : x.motivo}”</small>}
        </span>
        <div className="fp-dec">
          <button type="button" className={estado === 'pg' ? 'on pg' : ''} onClick={() => e.mudar(l, { acao: 'pagar', divisao: null })} title="Pagar como calculado"><i className="fas fa-check" /></button>
          <button type="button" className={estado === 'nao' ? 'on nao' : ''} onClick={() => e.mudar(l, { acao: 'nao', divisao: null })} title="Não pagar (escolher o motivo)"><i className="fas fa-ban" /></button>
          <button type="button" className={estado === 'aj' ? 'on aj' : ''} onClick={() => e.mudar(l, { acao: 'ajustar', divisao: null, valor: ed.valor ?? l.valor })} title="Ajustar o valor"><i className="fas fa-pen" /></button>
          <button type="button" className={estado === 'div' ? 'on div' : ''} onClick={() => setDividindo((v) => !v)} title="Dividir com outro técnico"><i className="fas fa-people-arrows" /></button>
        </div>
        <div className="fp-com">{f !== l.valor && <s>{brl2(l.valor)}</s>}<b>{brl2(f)}</b></div>
      </div>
      {ed.acao === 'nao' && (
        <div className="fp-extra">
          <small>Por que não vai pagar?</small>
          <div className="fp-mots">{MOTIVOS_NAO.map((m) => <button key={m} type="button" className={ed.motivo === m ? 'on' : ''} onClick={() => e.mudar(l, { motivo: m })}>{m}</button>)}</div>
          <input placeholder="ou escreva o motivo…" value={MOTIVOS_NAO.includes(ed.motivo) ? '' : ed.motivo} onChange={(ev) => e.mudar(l, { motivo: ev.target.value })} />
        </div>
      )}
      {ed.acao === 'ajustar' && !ed.divisao && (
        <div className="fp-extra aj">
          <label>Valor para ele <span>R$</span><input type="number" step="0.01" value={ed.valor ?? ''} onChange={(ev) => e.mudar(l, { valor: Number(ev.target.value) || 0 })} /></label>
          <input placeholder="motivo do ajuste (vai junto para o RH)" value={ed.motivo} onChange={(ev) => e.mudar(l, { motivo: ev.target.value })} />
        </div>
      )}
      {(dividindo || ed.divisao) && <div className="fp-extra dv"><Divisao d={d} l={l} e={e} fechar={() => setDividindo(false)} /></div>}
    </div>
  )
}

const ESTILO_FP = `
@keyframes fpEntra { from { opacity: 0; transform: translateY(10px) } } @keyframes fpFade { from { opacity: 0 } }
.fp-fundo *, .fp-fundo *::before, .fp-fundo *::after { box-sizing: border-box }
.fp-fundo { position: fixed; inset: 0; z-index: 100050; background: var(--portal-bg, #f4f6f9); overflow-y: auto; overscroll-behavior: contain; animation: fpFade .2s both; color: var(--portal-text, #0f172a) }
.fp-x { position: fixed; top: 14px; right: 18px; z-index: 6; width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: #fefefe; color: #334155; font-size: 17px; cursor: pointer; box-shadow: 0 6px 18px rgba(15,23,42,.12); transition: all .2s } .fp-x:hover { background: #fee2e2; color: #dc2626; transform: rotate(90deg) }
.fp-carr { min-height: 100vh; display: grid; place-items: center; color: ${MUDO}; font-size: 15px }
.fp { width: 100%; box-sizing: border-box; margin: 0; padding: 20px clamp(16px, 2.5vw, 40px) 48px; display: grid; gap: 14px; animation: fpEntra .4s both }
/* cabeçalho */
.fp-cab { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 18px; align-items: center; padding-right: 56px }
.fp-quem { display: flex; gap: 16px; align-items: center; min-width: 0 }
.fp-foto { flex: none; width: 72px; height: 72px; border-radius: 50%; padding: 3px; background: conic-gradient(var(--lc), color-mix(in srgb, var(--lc) 40%, #fefefe), var(--lc)); box-shadow: 0 8px 20px rgba(15,23,42,.15) }
.fp-foto img, .fp-foto span { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 3px solid #fefefe; display: grid; place-items: center; background: linear-gradient(135deg, #2563eb, #7c3aed); color: #fefefe; font-weight: 900; font-size: 24px }
.fp-nome { min-width: 0 } .fp-nome h1 { margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -.02em; line-height: 1.1 } .fp-nome p { margin: 4px 0 0; font-size: 13.5px; color: ${MUDO}; white-space: pre }
.fp-mes { display: inline-flex; align-items: center; gap: 2px; background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 999px; padding: 4px; box-shadow: 0 2px 8px rgba(15,23,42,.05) }
.fp-mes b { font-size: 14px; padding: 0 12px; white-space: nowrap } .fp-mes button { width: 32px; height: 32px; border-radius: 50%; border: none; background: transparent; color: #334155; cursor: pointer } .fp-mes button:hover:not(:disabled) { background: #eff6ff; color: #2563eb } .fp-mes button:disabled { opacity: .3 }
.fp-liga { display: flex; gap: 12px; align-items: center; background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; padding: 8px 16px 8px 10px; box-shadow: 0 2px 8px rgba(15,23,42,.05) }
.fp-liga > div { display: grid; gap: 2px; min-width: 140px } .fp-liga small { font-size: 10.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: ${MUDO} } .fp-liga > div > b { font-size: 17px; font-weight: 900; line-height: 1.1 }
.fp-pts { display: block; height: 5px; border-radius: 99px; background: #eef2f7; overflow: hidden; margin-top: 3px } .fp-pts i { display: block; height: 100%; border-radius: 99px; transform-origin: left; animation: ftLarga 1s both }
.fp-liga em { font-style: normal; font-size: 11.5px; color: ${MUDO} }
/* fatos do RH */
.fp-fatos { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; overflow: hidden }
.fp-fato { display: grid; gap: 2px; padding: 10px 14px; border-right: 1px solid var(--portal-border, #eef2f7); min-width: 0 } .fp-fato:last-child { border-right: none }
.fp-fato small { font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: ${MUDO}; white-space: nowrap } .fp-fato b { font-size: 14px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .fp-fato em { font-style: normal; font-size: 11px; color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.fp-fato.ruim { background: #fff5f5 } .fp-fato.ruim b { color: #dc2626 } .fp-fato.bom b { color: #047857 }
/* metas: cartões com duas barras (básica e ideal) */
.mp { display: grid; grid-template-columns: 1fr 1fr minmax(240px, .8fr); gap: 12px }
.mp-c { --mc: #2563eb; display: grid; gap: 10px; align-content: start; background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; padding: 16px 18px; transition: border-color .3s, box-shadow .3s }
.mp-c.ok { --mc: #059669; border-color: #a7f3d0; box-shadow: 0 0 0 3px #ecfdf5 } .mp-c.ideal { --mc: #7c3aed; border-color: #ddd6fe; box-shadow: 0 0 0 3px #f5f3ff } .mp-c.baixo { --mc: #2563eb }
.mp-topo { display: flex; justify-content: space-between; align-items: center; gap: 8px } .mp-rot { font-size: 13px; font-weight: 600; color: #475569 }
.mp-selo { font-size: 11.5px; font-weight: 700; border-radius: 99px; padding: 3px 10px; background: color-mix(in srgb, var(--mc) 12%, #fefefe); color: var(--mc) } .mp-c.baixo .mp-selo { background: #fef2f2; color: #dc2626 } .mp-c.ritmo .mp-selo { background: #eff6ff; color: #1d4ed8 }
.mp-v { font-size: 30px; font-weight: 800; letter-spacing: -.02em; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1 }
.mp-b { display: grid; gap: 5px }
.mp-b-cab { display: grid; grid-template-columns: auto auto 1fr auto; gap: 8px; align-items: baseline; font-size: 13px }
.mp-b-cab span { color: #64748b } .mp-b-cab b { font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums } .mp-b-cab em { font-style: normal; font-size: 12px; color: #94a3b8 } .mp-b.cheia .mp-b-cab em { color: #047857; font-weight: 600 }
.mp-b-cab strong { font-size: 14px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums }
.mp-b-trilho { position: relative; height: 8px; border-radius: 99px; background: #eef2f7 } .mp-b-trilho i { display: block; height: 100%; border-radius: 99px; background: #93c5fd; transform-origin: left; animation: ftLarga 1s cubic-bezier(.2,.9,.3,1) both }
.mp-b.bas .mp-b-trilho i { background: var(--mc) } .mp-b.ide .mp-b-trilho i { background: #a78bfa } .mp-b.cheia.bas .mp-b-trilho i { background: #10b981 } .mp-b.cheia.ide .mp-b-trilho i { background: #7c3aed }
.mp-b-trilho u { position: absolute; top: -3px; width: 2px; height: 14px; border-radius: 2px; background: #f59e0b; transform: translateX(-50%) }
.mp-conta { font-size: 12px; color: #94a3b8 }
.mp-c.compacto .mp-v { font-size: 26px }
@media (max-width: 1100px) { .mp { grid-template-columns: 1fr } }
/* frota */
.fr { display: grid; gap: 14px }
.fr-aviso { font-size: 13.5px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 10px 14px } .fr-aviso b { color: #78350f } .fr-aviso.cinza { color: #475569; background: #f8fafc; border-color: #e2e8f0 }
.fr-carro { background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; overflow: hidden }
.fr-id { display: flex; gap: 14px; align-items: center; padding: 14px 18px; border-bottom: 1px solid #f1f5f9 } .fr-id b { display: block; font-size: 15px; font-weight: 700; color: #0f172a } .fr-id small { font-size: 12.5px; color: #64748b }
.fr-placa { font-family: ui-monospace, 'SF Mono', monospace; font-size: 14px; font-weight: 700; letter-spacing: .06em; color: #0f172a; border: 1.5px solid #0f172a; border-top: 5px solid #1e40af; border-radius: 6px; padding: 3px 10px; background: #fefefe }
.fr-stats { display: grid; grid-template-columns: repeat(5, 1fr) } .fr-stats > div { display: grid; gap: 2px; padding: 12px 18px; border-right: 1px solid #f1f5f9 } .fr-stats > div:last-child { border-right: none }
.fr-stats small { font-size: 12px; color: #64748b } .fr-stats b { font-size: 18px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums } .fr-stats em { font-style: normal; font-size: 11.5px; color: #94a3b8 } .fr-stats .ruim b { color: #dc2626 }
.fr-pend { border-top: 1px solid #f1f5f9; padding: 12px 18px; display: grid; gap: 2px } .fr-pend h5 { margin: 0 0 4px; font-size: 12.5px; font-weight: 600; color: #b45309 }
.fr-pend-lin { display: flex; justify-content: space-between; gap: 14px; padding: 6px 0; border-top: 1px solid #f8fafc; font-size: 13.5px; color: #0f172a } .fr-pend-lin small { color: #64748b; font-size: 12.5px } .fr-pend-lin time { flex: none; font-size: 12px; color: #94a3b8 }
.fr-gastos { display: grid; grid-template-columns: repeat(4, 1fr); background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px } .fr-gastos > div { display: grid; gap: 2px; padding: 14px 18px; border-right: 1px solid #f1f5f9 } .fr-gastos > div:last-child { border-right: none }
.fr-gastos small { font-size: 12px; color: #64748b } .fr-gastos b { font-size: 20px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums } .fr-gastos em { font-style: normal; font-size: 12px; color: #94a3b8 }
.fr-tab { width: 100%; border-collapse: collapse; background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; overflow: hidden; font-size: 13.5px }
.fr-tab th { text-align: left; font-size: 12px; font-weight: 600; color: #64748b; padding: 10px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0 } .fr-tab td { padding: 9px 16px; border-top: 1px solid #f1f5f9; color: #0f172a } .fr-tab .n { text-align: right; font-variant-numeric: tabular-nums }
.fr-st { margin-left: 8px; font-size: 11px; font-weight: 600; color: #b45309; background: #fffbeb; border-radius: 99px; padding: 1px 8px } .fr-st.cinza { color: #475569; background: #f1f5f9 }
.fr-req { border: none; background: none; padding: 0; font-family: inherit; font-size: 13.5px; color: #1d4ed8; cursor: pointer } .fr-req:hover { text-decoration: underline }
@media (max-width: 1000px) { .fr-stats, .fr-gastos { grid-template-columns: repeat(2, 1fr) } }
/* liga: janelinha da carreira */
.fp-lp { position: relative; cursor: pointer } .fp-lp .fp-liga { transition: box-shadow .2s, border-color .2s } .fp-lp:hover .fp-liga { border-color: #cbd5e1; box-shadow: 0 8px 22px rgba(15,23,42,.1) }
.fp-lp-pop { position: absolute; top: calc(100% + 8px); right: 0; z-index: 8; width: 340px; display: grid; gap: 8px; background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; padding: 14px 16px; box-shadow: 0 24px 60px rgba(15,23,42,.2); cursor: default; animation: fpEntra .2s both }
.fp-lp-cab { display: flex; justify-content: space-between; align-items: baseline } .fp-lp-cab b { font-size: 17px; font-weight: 800; color: #0f172a } .fp-lp-cab span { font-size: 12.5px; color: ${MUDO} }
.fp-lp-trilha { display: grid; grid-template-columns: repeat(21, 1fr); gap: 2px } .fp-lp-trilha i { height: 8px; border-radius: 3px; background: #e2e8f0 } .fp-lp-trilha i.vai { outline: 2px dashed #2563eb; outline-offset: 1px }
.fp-lp-lin { display: flex; justify-content: space-between; gap: 10px; font-size: 13.5px; padding: 4px 0; border-top: 1px solid #f1f5f9 } .fp-lp-lin span { color: ${MUDO} } .fp-lp-lin b { font-weight: 600; color: #0f172a; text-align: right } .fp-lp-lin b.bom { color: #047857 } .fp-lp-lin b.ruim { color: #dc2626 }
.fp-lp-hist { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px } .fp-lp-hist span { display: grid; justify-items: center; background: #f8fafc; border-radius: 8px; padding: 4px 0 } .fp-lp-hist small { font-size: 10.5px; color: ${MUDO}; text-transform: capitalize } .fp-lp-hist b { font-size: 13px; font-weight: 700; color: #475569 } .fp-lp-hist .bom b { color: #047857 } .fp-lp-hist .ruim b { color: #dc2626 }
.fp-lp-regra { margin: 0; font-size: 12px; line-height: 1.4; color: ${MUDO} }
/* lista de OS: menos negrito, o principal em preto (20/10/2026) */
.fp-cli b { font-weight: 600; color: #0f172a } .fp-cli small { color: #64748b }
.fp-valor > b { font-weight: 600; color: #0f172a } .fp-chips > * { font-weight: 600 }
.fp-base { color: #475569 } .fp-com b { font-weight: 700; color: #0f172a !important } .fp-com s { color: #94a3b8 }
.fp-lin.nao .fp-com b { color: #dc2626 !important } .fp-lin.aj .fp-com b { color: #b45309 !important } .fp-lin.div .fp-com b { color: #6d28d9 !important }
.fp-num { font-weight: 700 } .fp-th { font-weight: 600; color: #64748b } .fp-g-cab > b { font-weight: 700; color: #0f172a } .fp-g-tot b { font-weight: 700 }
/* RH em 4 grupos: rótulo à esquerda, valor à direita (20/10/2026) */
.fp-rhg { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px }
.fp-grp { background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; padding: 12px 16px 6px }
.fp-grp h4 { margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .02em; color: ${MUDO} }
.fp-li { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 7px 0; border-top: 1px solid var(--portal-border, #f1f5f9); font-size: 14px }
.fp-li span { color: ${MUDO}; white-space: nowrap } .fp-li b { font-weight: 700; color: var(--portal-text, #0f172a); text-align: right; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fp-li.ruim b { color: #dc2626 } .fp-li.bom b { color: #047857 }
@media (max-width: 1100px) { .fp-rhg { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
/* tipografia: uma escala só (rótulos 12–13, valores 14–16, números grandes 20–34) */
.fp, .fp button, .fp input { font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif }
.fp-nome h1 { font-size: 28px; font-weight: 800; letter-spacing: -.02em } .fp-nome p { font-size: 14px }
.fp-liga > div > b { font-size: 18px; font-weight: 800 }
.fp-secoes button { font-size: 14px; font-weight: 700; padding: 9px 18px }
.fp-metas .fo-meta-ic { display: none } .fp-metas .fo-meta { padding: 12px 16px 16px; border-radius: 16px } .fp-metas .fo-meta-bar { height: 8px } .fp-metas .fo-meta-bar em { font-size: 11px; font-weight: 600 } .fp-metas .fo-meta-cab small { font-size: 12.5px; font-weight: 600 } .fp-metas .fo-meta-cab b { font-size: 22px; font-weight: 800 } .fp-metas .fo-meta-pct b { font-size: 17px } .fp-metas .fo-meta-selo i { display: none }
.fp-metas .fo-meta-sem small { font-size: 12.5px; font-weight: 600 } .fp-metas .fo-meta-sem b { font-size: 24px; font-weight: 800 }
.fp-metas .fo-metas-leg { font-size: 12.5px }
.fp .fl-rot { font-size: 12px; font-weight: 700; letter-spacing: .02em; text-transform: none } .fp .fl-total { font-size: 34px; font-weight: 800 } .fp .fl-lin { font-size: 14px } .fp .fl-passos b { font-size: 13.5px }
.fp-th { font-size: 11.5px; font-weight: 700; letter-spacing: .03em } .fp-cli b { font-size: 14px; font-weight: 700 } .fp-valor > b { font-size: 14.5px; font-weight: 800 } .fp-com b { font-size: 16px; font-weight: 800 } .fp-g-cab > b { font-size: 15.5px; font-weight: 800 }
/* metas (reaproveita o bloco da ficha, sem o fundo extra) */
.fp-metas .fo-metas { padding: 0; background: none; border: none; grid-template-columns: 1fr 1fr 220px } .fp-metas .fo-metas:not(:has(.fo-meta-sem)) { grid-template-columns: 1fr 1fr }
/* seções */
.fp-secoes { position: sticky; top: 0; z-index: 4; display: flex; gap: 4px; padding: 6px; margin: 0 -6px; background: color-mix(in srgb, var(--portal-bg, #f4f6f9) 88%, transparent); backdrop-filter: blur(8px); overflow-x: auto }
.fp-secoes button { display: inline-flex; gap: 8px; align-items: center; border: 1px solid transparent; background: transparent; border-radius: 999px; padding: 8px 16px; font-family: inherit; font-size: 13.5px; font-weight: 800; color: ${MUDO}; cursor: pointer; white-space: nowrap; transition: all .2s }
.fp-secoes button:hover { color: var(--portal-text, #0f172a); background: #fefefe } .fp-secoes button.on { background: #0f172a; color: #fefefe; box-shadow: 0 6px 16px rgba(15,23,42,.2) } .fp-secoes button i { font-size: 12.5px; opacity: .8 }
.fp-main { display: grid; gap: 14px; animation: fpEntra .35s both }
/* comissão: botão de lançar fica no 1º bloco do resumo */
.fp-main .fl { box-shadow: none }
/* lista das OS */
.fp-os { display: grid; gap: 12px }
.fp-os-topo { display: flex; gap: 10px; justify-content: space-between; align-items: center; flex-wrap: wrap }
.fp-filtro { display: inline-flex; gap: 2px; background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 999px; padding: 3px }
.fp-filtro button { border: none; background: transparent; border-radius: 999px; padding: 6px 14px; font-family: inherit; font-size: 12.5px; font-weight: 800; color: ${MUDO}; cursor: pointer; display: inline-flex; gap: 6px; align-items: center }
.fp-filtro button b { font-size: 11px; background: #eef2f7; color: #475569; border-radius: 99px; padding: 1px 7px } .fp-filtro button.on { background: #0f172a; color: #fefefe } .fp-filtro button.on b { background: rgba(255,255,255,.18); color: #fefefe }
.fp-leg { display: flex; gap: 12px; font-size: 12px; color: ${MUDO} } .fp-leg span::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: 1px }
.fp-leg .pg::before { background: #10b981 } .fp-leg .np::before { background: #ef4444 } .fp-leg .aj::before { background: #f59e0b } .fp-leg .dv::before { background: #8b5cf6 }
.fp-g { --g: #2563eb; --gf: #eff6ff; background: #fefefe; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; overflow: hidden }
.fp-g.garantia { --g: #db2777; --gf: #fdf2f8 } .fp-g.interna { --g: #64748b; --gf: #f1f5f9 }
.fp-g-cab { display: flex; gap: 10px; align-items: center; padding: 12px 16px; background: var(--gf); border-bottom: 1px solid color-mix(in srgb, var(--g) 15%, transparent) }
.fp-g-ic { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--g); color: #fefefe; font-size: 13px }
.fp-g-cab > b { font-size: 15px } .fp-g-cab > small { flex: 1; font-size: 12px; color: ${MUDO} } .fp-g-tot { display: inline-flex; gap: 10px; align-items: baseline } .fp-g-tot em { font-style: normal; font-size: 12px; color: ${MUDO} } .fp-g-tot b { font-size: 17px; color: var(--g); font-variant-numeric: tabular-nums }
.fp-tab { display: grid }
.fp-th, .fp-row { display: grid; grid-template-columns: 76px minmax(200px, 1.5fr) minmax(220px, 1.4fr) 104px 150px 118px; gap: 14px; align-items: center; padding: 0 16px }
.fp-th { padding-top: 9px; padding-bottom: 9px; font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: ${MUDO}; border-bottom: 1px solid var(--portal-border, #eef2f7) } .fp-th .n { text-align: right }
.fp-lin { border-bottom: 1px solid var(--portal-border, #f1f5f9); border-left: 3px solid transparent; transition: background .15s, border-color .2s; animation: fpEntra .3s both } .fp-lin:last-child { border-bottom: none } .fp-lin:hover { background: #fafbfd }
.fp-lin.nao { border-left-color: #ef4444; background: #fffafa } .fp-lin.aj { border-left-color: #f59e0b } .fp-lin.div { border-left-color: #8b5cf6 }
.fp-row { padding-top: 10px; padding-bottom: 10px }
.fp-num { justify-self: start; border: none; background: color-mix(in srgb, var(--g) 10%, transparent); color: var(--g); border-radius: 8px; padding: 4px 9px; font-family: inherit; font-size: 13px; font-weight: 900; cursor: pointer; font-variant-numeric: tabular-nums } .fp-num:hover { background: var(--g); color: #fefefe }
.fp-cli { display: grid; min-width: 0 } .fp-cli b { font-size: 13.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .fp-cli small { font-size: 12px; color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .fp-cli .fp-rh { color: #b45309 }
.fp-valor { display: grid; gap: 4px; min-width: 0 } .fp-valor > b { font-size: 14px; font-weight: 900; font-variant-numeric: tabular-nums }
.fp-chips { display: flex; gap: 4px; flex-wrap: wrap } .fp-chips > * { display: inline-flex; gap: 4px; align-items: center; font-size: 11px; font-weight: 800; border-radius: 6px; padding: 2px 7px; border: none; font-family: inherit; white-space: nowrap }
.fp-chips i { font-size: 9.5px } .fp-chips .pc { background: #eef2ff; color: #4338ca } .fp-chips .ds { background: #fffbeb; color: #b45309 } .fp-chips .rq { background: #fef2f2; color: #b91c1c; cursor: pointer } .fp-chips .rq:hover { background: #dc2626; color: #fefefe } .fp-chips .it { background: #f1f5f9; color: #475569; font-weight: 700 }
.fp-base { text-align: right; font-size: 13px; color: ${MUDO}; font-variant-numeric: tabular-nums }
.fp-dec { display: inline-flex; gap: 2px; background: #f4f6f9; border-radius: 999px; padding: 3px; justify-self: center }
.fp-dec button { width: 32px; height: 28px; border-radius: 999px; border: none; background: transparent; color: #94a3b8; cursor: pointer; font-size: 12.5px; transition: all .15s } .fp-dec button:hover { color: #0f172a; background: #fefefe }
.fp-dec button.on { color: #fefefe } .fp-dec button.on.pg { background: #10b981 } .fp-dec button.on.nao { background: #ef4444 } .fp-dec button.on.aj { background: #f59e0b } .fp-dec button.on.div { background: #8b5cf6 }
.fp-com { display: grid; justify-items: end } .fp-com s { font-size: 11px; color: ${MUDO} } .fp-com b { font-size: 15.5px; font-weight: 900; font-variant-numeric: tabular-nums; color: #047857 } .fp-lin.nao .fp-com b { color: #dc2626 } .fp-lin.aj .fp-com b { color: #b45309 } .fp-lin.div .fp-com b { color: #6d28d9 }
.fp-extra { display: grid; gap: 6px; margin: 0 16px 12px 106px; padding: 10px 12px; border-radius: 12px; background: #fef2f2; animation: fpEntra .2s both } .fp-extra > small { font-size: 14px; font-weight: 500; color: #b91c1c }
.fp-extra.aj { background: #fffbeb; display: flex; gap: 10px; align-items: center; flex-wrap: wrap } .fp-extra.aj label { display: inline-flex; gap: 8px; align-items: center; font-size: 15px; font-weight: 400; color: #0f172a } .fp-extra.aj label span { color: #0f172a } .fp-extra.aj label input { width: 120px; font-weight: 400 }
.fp-extra.dv { background: none; padding: 0 } .fp-extra input { border: 1px solid var(--portal-border, #cbd5e1); border-radius: 9px; padding: 8px 12px; font-family: inherit; font-size: 15px; font-weight: 400; color: #0f172a; background: #fefefe; min-width: 0; flex: 1 } .fp-extra input::placeholder { color: #64748b }
.fp-mots { display: flex; gap: 5px; flex-wrap: wrap } .fp-mots button { border: 1px solid #fecaca; background: #fefefe; border-radius: 99px; padding: 6px 12px; font-family: inherit; font-size: 14px; font-weight: 400; color: #0f172a; cursor: pointer } .fp-mots button.on { background: #ef4444; border-color: #ef4444; color: #fefefe }
.fp-vazio { padding: 30px; text-align: center; color: ${MUDO}; background: #fefefe; border-radius: 16px }
.fp-cam { margin: 0; font-size: 13px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 9px 14px }
@media (max-width: 1100px) { .fp-cab { grid-template-columns: 1fr; padding-right: 50px } .fp-metas .fo-metas { grid-template-columns: 1fr } .fp-th { display: none } .fp-row { grid-template-columns: 70px 1fr 110px; row-gap: 8px } .fp-valor { grid-column: 2 / -1 } .fp-base { display: none } .fp-dec { grid-column: 1 / 3; justify-self: start } .fp-extra { margin-left: 16px } .fp-fato { border-bottom: 1px solid var(--portal-border, #eef2f7) } }
/* títulos de seção e grades (20/10/2026) */
.fp-h2 { margin: 6px 0 -4px; display: flex; gap: 10px; align-items: baseline; font-size: 17px; font-weight: 700; color: #0f172a; letter-spacing: -.01em } .fp-h2 small { font-size: 13px; font-weight: 400; color: #64748b }
.fp-grp { padding: 14px 18px 8px } .fp-grp h4 { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid #f1f5f9 }
.fp-li { padding: 8px 0; font-size: 14.5px; border-top: none } .fp-li + .fp-li { border-top: 1px dashed #eef2f7 } .fp-li span { color: #64748b } .fp-li b { font-weight: 500; color: #0f172a }
.mp-rot { font-size: 14px; font-weight: 700; color: #0f172a }
/* lista de OS: fonte maior, sem negrito, preta */
.fp-row { padding-top: 12px; padding-bottom: 12px }
.fp-cli b { font-size: 15px; font-weight: 400; color: #0f172a } .fp-cli small { font-size: 13px; color: #64748b }
.fp-valor > b { font-size: 15px; font-weight: 400; color: #0f172a } .fp-chips > * { font-size: 12px; font-weight: 500 }
.fp-base { font-size: 14.5px; color: #0f172a } .fp-com b { font-size: 16.5px; font-weight: 500; color: #0f172a !important } .fp-num { font-size: 14px; font-weight: 500 }
.fp-th { font-size: 12px; font-weight: 500; letter-spacing: .02em; text-transform: none; color: #64748b } .fp-g-cab > b { font-size: 16px; font-weight: 600 } .fp-g-tot b { font-weight: 600 }
/* liga ao lado do nome */
.fp-cab { grid-template-columns: minmax(0, 1fr) auto } .fp-quem { gap: 18px } .fp-quem .fp-lp { margin-left: 8px } .fp-quem .fp-lp-pop { left: 0; right: auto }
/* ocorrências */
.oc2 { display: grid; gap: 14px }
.oc2-resumo { display: grid; grid-template-columns: repeat(4, 1fr); background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px } .oc2-resumo > div { display: grid; gap: 3px; padding: 14px 18px; border-right: 1px solid #f1f5f9 } .oc2-resumo > div:last-child { border-right: none }
.oc2-resumo small { font-size: 13px; color: #64748b } .oc2-resumo b { font-size: 19px; font-weight: 600; color: #0f172a } .oc2-resumo b.ruim { color: #dc2626 }
.oc2-mes { background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden } .oc2-mes.atual { border-color: #93c5fd; box-shadow: 0 0 0 3px #eff6ff }
.oc2-mes header { display: flex; gap: 14px; align-items: baseline; padding: 14px 20px; background: #f8fafc; border-bottom: 1px solid #f1f5f9 } .oc2-mes h3 { margin: 0; font-size: 17px; font-weight: 600; color: #0f172a } .oc2-mes header span { font-size: 14px; color: #64748b } .oc2-mes .oc2-pts { color: #dc2626 } .oc2-fim { margin-left: auto } .oc2-fim b { color: #0f172a; font-weight: 600 }
.oc2-it { display: grid; grid-template-columns: 56px 1fr; gap: 14px; padding: 14px 20px; border-top: 1px solid #f1f5f9 } .oc2-it:first-of-type { border-top: none } .oc2-it.anulada { opacity: .55 } .oc2-it.anulada .oc2-p { text-decoration: line-through }
.oc2-p { align-self: start; text-align: center; color: #fefefe; font-size: 15px; font-weight: 600; border-radius: 10px; padding: 6px 0 }
.oc2-txt { display: grid; gap: 4px } .oc2-l1 { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap } .oc2-l1 b { font-size: 15.5px; font-weight: 600; color: #0f172a } .oc2-l1 time { font-size: 13px; color: #94a3b8 }
.oc2-txt p { margin: 0; font-size: 15px; line-height: 1.5; color: #0f172a }
.oc2-def { font-size: 13.5px; color: #64748b; padding-left: 10px; border-left: 3px solid #e2e8f0 } .oc2-def q { display: block; color: #334155; margin-top: 2px } .oc2-def.recusada { border-left-color: #fca5a5 } .oc2-def.aprovada { border-left-color: #6ee7b7 } .oc2-def.pendente { border-left-color: #fcd34d } .oc2-def em { font-style: normal; color: #047857 }
/* RH */
.rh2 { display: grid; gap: 14px }
.rh2-resumo { display: grid; grid-template-columns: repeat(5, 1fr); background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px } .rh2-resumo > div { display: grid; gap: 3px; padding: 14px 18px; border-right: 1px solid #f1f5f9 } .rh2-resumo > div:last-child { border-right: none }
.rh2-resumo small { font-size: 13px; color: #64748b } .rh2-resumo b { font-size: 20px; font-weight: 600; color: #0f172a; font-variant-numeric: tabular-nums } .rh2-resumo em { font-style: normal; font-size: 12.5px; color: #94a3b8 } .rh2-resumo .ruim b, .rh2-resumo .ruim em { color: #dc2626 }
.rh2-cols { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px }
.rh2-box { background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px 20px; display: grid; gap: 8px; align-content: start } .rh2-box h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; color: #0f172a } .rh2-h3b { margin-top: 12px !important }
.rh2-barras { display: flex; gap: 10px; align-items: flex-end; height: 170px; padding-top: 22px } .rh2-barras > div { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 5px; min-width: 0 }
.rh2-barras em { font-style: normal; font-size: 11.5px; color: #475569; white-space: nowrap } .rh2-barras i { width: 100%; max-width: 44px; border-radius: 8px 8px 3px 3px; background: #cbd5e1; transform-origin: bottom; animation: ftCresce .8s cubic-bezier(.2,.9,.3,1) both } .rh2-barras i.paga { background: #10b981 } .rh2-barras i.apr { background: #60a5fa } .rh2-barras small { font-size: 12px; color: #64748b; text-transform: capitalize }
.rh2-leg { display: flex; gap: 14px; font-size: 12.5px; color: #64748b } .rh2-leg i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; background: #cbd5e1; margin-right: 5px } .rh2-leg i.paga { background: #10b981 } .rh2-leg i.apr { background: #60a5fa }
.rh2-fer { display: grid; grid-template-columns: 170px 1fr auto 160px; gap: 12px; align-items: center; padding: 9px 0; border-top: 1px solid #f1f5f9; font-size: 14.5px; color: #0f172a } .rh2-fer:first-of-type { border-top: none } .rh2-fer b { font-weight: 600 } .rh2-fer em { font-style: normal; font-size: 13px; color: #64748b } .rh2-fer.ruim em { color: #dc2626 }
.rh2-fer-b { height: 7px; border-radius: 99px; background: #e0f2fe; overflow: hidden } .rh2-fer-b i { display: block; height: 100%; background: #0ea5e9; border-radius: 99px }
.rh2-ponto { display: grid; grid-template-columns: 90px 110px 1fr; gap: 10px; font-size: 14px; padding: 7px 0; border-top: 1px solid #f1f5f9 } .rh2-ponto span { color: #64748b } .rh2-ponto b { font-weight: 500; color: #0f172a } .rh2-ponto em { font-style: normal; color: #475569 }
.rh2-tab { width: 100%; border-collapse: collapse; font-size: 14.5px } .rh2-tab td { padding: 10px 8px; border-top: 1px solid #f1f5f9; color: #0f172a } .rh2-tab tr:first-child td { border-top: none } .rh2-tab td:first-child { color: #64748b; white-space: nowrap } .rh2-tab .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums }
.rh2-st { font-size: 12px; border-radius: 99px; padding: 2px 10px; background: #f1f5f9; color: #475569 } .rh2-st.aplicado, .rh2-st.aprovado { background: #ecfdf5; color: #047857 }
.fp-vazio-l { margin: 0; color: #94a3b8; font-size: 14px }
@media (max-width: 1100px) { .oc2-resumo, .rh2-resumo { grid-template-columns: repeat(2, 1fr) } .rh2-cols { grid-template-columns: 1fr } .rh2-fer { grid-template-columns: 1fr auto } .rh2-fer-b, .rh2-fer em { display: none } }
`
