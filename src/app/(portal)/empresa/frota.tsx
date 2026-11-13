'use client'
// Frota na tela do diretor (/empresa). José, 12/11/2026: "no Frota tem que aparecer todos os veículos que a loja tem como
// cards; mas antes, o mapa da frota onde a gente vê a localização real de todos".
//   • mapa  → o mesmo MapaCarros do Frota → Mapa (modo "frota": posição real de cada carro, atualiza sozinho)
//   • cards → /api/frota/veiculos (a frota inteira, com foto, responsável, pendências) + /api/frota/mapa/vivo (onde está)
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { STATUS_INFO, type StatusVivo } from '@/lib/frota/mapa-vivo'
import { useJson, JanelaFrame } from './comercial-telas'
import { plural, compacto, brl, mesCurto, nomeMes, cap } from './comercial'
import { Secao, TelaCheia } from './comercial-assuntos'
import { NavMes } from './posvendas'
import type { DashboardAbastecimento, TransacoesResp } from '@/lib/abastecimento/tipos'

const MapaCarros = dynamic(() => import('@/components/supervisor/MapaCarros'), { ssr: false })

type Veiculo = {
  id: string; placa: string; placa_exibicao: string | null; tipo_registro: string; marca: string | null; modelo: string | null; ano: number | null; ano_modelo: number | null
  setor: string | null; ativo: boolean; status: string; sem_uso: boolean | null; sem_uso_motivo: string | null; imagem_url: string | null; responsavel_nome: string | null
  multas_abertas: number; valor_multas_abertas: number; docs_vencendo: number; pendencias: Array<{ tipo?: string; texto?: string } | string>; tem_rastreador: boolean | null
}
type Vivo = { placa: string; cidade?: string | null; nome: string | null; lat: number | null; lng: number | null; status: StatusVivo; local: string | null; dt: string | null; velocidade: number; os_execucao: Array<{ id: string; cliente: string | null }> }
const SETOR: Record<string, string> = { comercial: 'Comercial', pos_vendas: 'Pós-Vendas' }
const desde = (dt: string | null) => {
  if (!dt) return ''
  const min = Math.max(0, Math.round((Date.now() - Date.parse(dt)) / 60000))
  return min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} dias`
}

function AbaAgora() {
  const { d: vs, erro } = useJson<{ veiculos: Veiculo[] }>('/api/frota/veiculos')
  const { d: vv } = useJson<{ veiculos: Vivo[] }>('/api/frota/mapa/vivo')
  const [foco, setFoco] = useState<{ lat: number; lng: number; nome?: string; subtitulo?: string } | null>(null)
  const [ficha, setFicha] = useState<Veiculo | null>(null)
  const [menu, setMenu] = useState<string | null>(null) // cartão com o menu aberto
  const [setor, setSetor] = useState<string>('todos')
  const vivoDe = useMemo(() => new Map((vv?.veiculos || []).map((v) => [v.placa, v])), [vv])
  const lista = (vs?.veiculos || []).filter((v) => v.tipo_registro === 'veiculo' && v.ativo && v.status !== 'vendido' && v.status !== 'arquivado')
    .sort((a, b) => (a.setor || 'z').localeCompare(b.setor || 'z') || a.placa.localeCompare(b.placa))
  const setores = [...new Set(lista.map((v) => v.setor || 'outros'))]
  const mostrados = lista.filter((v) => setor === 'todos' || (v.setor || 'outros') === setor)
  const contaStatus = (s: StatusVivo) => lista.filter((v) => vivoDe.get(v.placa)?.status === s).length
  // primeiro os carros com setor e pessoa vinculada; os outros num bloco fechado (José, 12/11)
  const temVinculo = (v: Veiculo) => !!v.setor && !!(vivoDe.get(v.placa)?.nome || v.responsavel_nome)
  const vinculados = mostrados.filter(temVinculo), semVinculo = mostrados.filter((v) => !temVinculo(v))
  const cartao = (v: Veiculo) => {
    const w = vivoDe.get(v.placa), st = w ? STATUS_INFO[w.status] : null
            const alertas = [
              v.sem_uso ? `sem uso${v.sem_uso_motivo ? `: ${v.sem_uso_motivo}` : ''}` : '',
              v.pendencias?.length ? plural(v.pendencias.length, 'pendência', 'pendências') : '',
              v.docs_vencendo ? plural(v.docs_vencendo, 'documento vencendo', 'documentos vencendo') : '',
              v.multas_abertas ? plural(v.multas_abertas, 'multa aberta', 'multas abertas') : '',
            ].filter(Boolean)
            return (
              <div key={v.id} className={`cfr-card${menu === v.id ? " on" : ""}`} onClick={() => setMenu(menu === v.id ? null : v.id)}>
                {/* clicar no carro: escolher entre ver a localização ou a ficha (José, 12/11) */}
                {menu === v.id && <div className="cfr-fora" onClick={(e) => { e.stopPropagation(); setMenu(null) }} />}
                {menu === v.id && (
                  <div className="cfr-menu" onClick={(e) => e.stopPropagation()}>
                    <button disabled={w?.lat == null} onClick={() => { setMenu(null); if (w?.lat != null && w.lng != null) { setFoco({ lat: w.lat, lng: w.lng, nome: v.placa_exibicao || v.placa, subtitulo: [w.cidade, w.local].filter(Boolean).join(' — ') }); document.querySelector('.cfr-mapa')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) } }}><i className="fas fa-location-dot" /> Ver a localização{w?.lat == null ? <small>sem posição</small> : null}</button>
                    <button onClick={() => { setMenu(null); setFicha(v) }}><i className="fas fa-id-card" /> Ver a ficha</button>
                  </div>
                )}
                <button className="cfr-card-bt">
                  <span className="cfr-foto">{v.imagem_url ? <img src={v.imagem_url} alt="" /> : <i className="fas fa-car-side" />}</span>
                  <span className="cfr-info">
                    <b>{v.placa_exibicao || v.placa}</b>
                    <span>{[v.marca, v.modelo].filter(Boolean).join(' ') || 'Veículo'}{v.ano_modelo || v.ano ? ` · ${v.ano_modelo || v.ano}` : ''}</span>
                    <small>{SETOR[v.setor || ''] || 'Sem setor'} · {w?.nome || v.responsavel_nome || 'sem responsável'}</small>
                  </span>
                </button>
                <div className="cfr-onde">
                  {st ? <span className="cfr-st" style={{ background: `${st.cor}1a`, color: st.cor }}><i style={{ background: st.cor }} />{st.label}</span> : <span className="cfr-st cfr-st-sem">{v.tem_rastreador ? 'sem posição' : 'sem rastreador'}</span>}
                  {(w?.cidade || w?.local) && <span className="cfr-local">{w.cidade ? <><i className="fas fa-location-dot" /> <b>{w.cidade}</b>{w.local && w.local !== 'Sem cadastro de local' ? ' · ' : ''}</> : null}{w.local && (w.local !== 'Sem cadastro de local' || !w.cidade) ? w.local : ''}{w.dt ? <small>{desde(w.dt)}</small> : null}</span>}
                  {w?.os_execucao?.length ? <span className="cfr-local">atendendo {w.os_execucao.map((o) => o.cliente || o.id).join(', ')}</span> : null}
                </div>
                {alertas.length ? <div className="cfr-alertas">{alertas.map((a) => <span key={a}><i className="fas fa-triangle-exclamation" />{a}</span>)}</div> : <div className="cfr-ok"><i className="fas fa-circle-check" /> tudo em dia</div>}
                <button className="cfr-ficha" onClick={(e) => { e.stopPropagation(); setMenu(null); setFicha(v) }}>ver a ficha <i className="fas fa-arrow-right" /></button>
              </div>
            )
  }
  return (
    <div className="cfr">
      <section className="cmt-sec">
        <div className="cmt-sec-cab"><h3>Onde estão os carros agora</h3><span>{vv ? (['andando', 'ligado_parado', 'desligado', 'sem_sinal'] as StatusVivo[]).map((s) => `${contaStatus(s)} ${STATUS_INFO[s].label.toLowerCase()}`).join(' · ') : 'buscando a posição…'}</span></div>
        {/* o MapaCarros usa height:100%: precisa de um pai com altura; zIndex 0 prende os painéis do Leaflet dentro do mapa */}
        <div className="cfr-mapa"><MapaCarros carros={[]} modo="frota" foco={foco} /></div>
      </section>

      <section className="cmt-sec">
        <div className="cmt-sec-cab"><h3>Todos os veículos</h3><span>{plural(lista.length, 'veículo ativo', 'veículos ativos')} · clique para ver no mapa</span></div>
        {erro && <div className="cm-aviso">{erro}</div>}
        {!vs && !erro && <div className="ce-mudo">Carregando os veículos…</div>}
        {setores.length > 1 && (
          <div className="cmdp-chips">
            <button className={setor === 'todos' ? 'on' : ''} onClick={() => setSetor('todos')}>Todos<b>{lista.length}</b></button>
            {setores.map((s) => <button key={s} className={setor === s ? 'on' : ''} onClick={() => setSetor(s)}>{SETOR[s] || 'Sem setor'}<b>{lista.filter((v) => (v.setor || 'outros') === s).length}</b></button>)}
          </div>
        )}
        <div className="cfr-grade">{vinculados.map(cartao)}</div>
        {!vinculados.length && vs ? <div className="ce-mudo">Nenhum veículo com setor e responsável.</div> : null}
        {semVinculo.length ? (
          <details className="cfr-resto">
            <summary><i className="fas fa-chevron-right" /> Sem setor ou sem responsável <b>{semVinculo.length}</b></summary>
            <div className="cfr-grade">{semVinculo.map(cartao)}</div>
          </details>
        ) : null}
      </section>
      {ficha && <FichaVeiculo v={ficha} onFechar={() => setFicha(null)} />}
    </div>
  )
}

// ── as três abas da Frota (José, 12/11: "faz essa aba de onde estão agora; depois a de abastecimentos; depois a de pendências")
type AbaFr = 'agora' | 'abast' | 'manut' | 'pend'
/** a área Frota: cartões por assunto, cada um abre em tela cheia — igual ao Comercial, Pós-Vendas e Peças
 *  (José, 12/11: "aqui você faz os cartões, igual nos outros módulos") */
export function FrotaMapaCards() {
  const [tela, setTela] = useState<AbaFr | null>(() => {
    if (typeof window === 'undefined') return null
    const t = new URLSearchParams(window.location.search).get('tela')
    return t === 'agora' || t === 'abast' || t === 'manut' || t === 'pend' ? t : null
  })
  useEffect(() => {
    try {
      const u = new URL(window.location.href)
      if (tela) u.searchParams.set('tela', tela); else u.searchParams.delete('tela')
      if (u.toString() !== window.location.href) window.history.replaceState(null, '', u.toString())
    } catch { /* sem URL */ }
  }, [tela])
  const hoje = hojeISO()
  const deAb = (() => { const d = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 12, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })()
  // os mesmos endereços das telas: o que o cartão busca já fica pronto para quando abrir
  const { d: vv } = useJson<{ veiculos: Vivo[] }>('/api/frota/mapa/vivo?rapido=1')
  const { d: ab } = useJson<DashboardAbastecimento>(`/api/abastecimento/dashboard?de=${deAb}&ate=${hoje}`)
  const { d: pv } = useJson<{ resumo: { vencida: number; em_breve: number; pctEmDia: number | null }; veiculos: Array<{ modelo: unknown }> }>('/api/frota/preventivas')
  // sem nenhum plano de revisão cadastrado, o 0 de vencidas engana: o cartão avisa (José, 12/11)
  const semPlanos = !!pv && !pv.veiculos.some((v) => v.modelo)
  const { d: pd } = useJson<{ pendencias: Pend[] }>('/api/frota/pendencias')
  const { d: mtC } = useJson<{ manutencoes: Array<{ data: string | null; valor_total: number | null }> }>('/api/empresa/frota-manutencoes')
  const manutMes = (mtC?.manutencoes || []).filter((x) => (x.data || '').startsWith(hoje.slice(0, 7))).reduce((a, x) => ({ v: a.v + (Number(x.valor_total) || 0), n: a.n + 1 }), { v: 0, n: 0 })
  const { d: vs } = useJson<{ veiculos: Veiculo[] }>('/api/frota/veiculos')
  const fechar = () => setTela(null)
  const ativos = (vs?.veiculos || []).filter((v) => v.tipo_registro === 'veiculo' && v.ativo && v.status !== 'vendido' && v.status !== 'arquivado')
  const conta = (st: StatusVivo) => (vv?.veiculos || []).filter((v) => v.status === st).length
  const mAb = ab?.evolucaoMensal[ab.evolucaoMensal.length - 1]
  const abertas = (pd?.pendencias || []).filter((x) => x.status === 'aberta')
  const andando = (vv?.veiculos || []).filter((v) => v.status === 'andando')
  const cartao = (t: AbaFr, cor: string, ic: string, nome: string, num: string, linha: React.ReactNode, extra?: React.ReactNode, cls = '') => (
    <button className={`cml-card ${cls}`} style={{ ['--c' as string]: cor }} onClick={() => setTela(t)}>
      <span className="cml-cab"><span className="pf-ic"><i className={`fas ${ic}`} /></span><span className="cml-nome">{nome}</span><i className="fas fa-arrow-right cml-seta" /></span>
      <span className="cml-num">{num}</span>
      <span className="cml-linha">{linha}</span>
      {extra}
    </button>
  )
  return (
    <div className="pf cml">
      <div className="cml-grade">
        {cartao('agora', '#0e7490', 'fa-location-dot', 'Onde estão agora', ativos.length ? plural(ativos.length, 'carro', 'carros') : '—',
          vv ? <>{conta('andando')} andando · {conta('ligado_parado')} parado ligado · {conta('desligado')} desligado{conta('sem_sinal') ? ` · ${conta('sem_sinal')} sem sinal` : ''}</> : 'buscando a posição…',
          andando.length ? <span className="cml-extras">{andando.slice(0, 4).map((v) => <span key={v.placa}><i className="fas fa-car-side" /><b>{v.nome ? v.nome.split(' ')[0] : v.placa}</b> {v.cidade || ''}<small>{v.local || 'em deslocamento'}</small></span>)}</span> : null, 'cml-g')}
        {cartao('abast', '#0891b2', 'fa-gas-pump', 'Abastecimentos', mAb ? compacto(mAb.valor) : '—',
          mAb ? <>gasto em {nomeMes(mAb.mes)}{mAb.mes === hoje.slice(0, 7) ? ' até hoje' : ''} · {Math.round(mAb.litros).toLocaleString('pt-BR')} litros</> : 'carregando…')}
        {cartao('manut', '#7c3aed', 'fa-wrench', 'Manutenções e revisões', semPlanos ? (mtC ? compacto(manutMes.v) : '—') : pv ? String(pv.resumo.vencida) : '—',
          semPlanos ? <>manutenção em {nomeMes(hoje.slice(0, 7))} · {plural(manutMes.n, 'serviço', 'serviços')} · sem plano de revisão cadastrado</> : pv ? <>revisões vencidas · {pv.resumo.em_breve} vencem logo{pv.resumo.pctEmDia != null ? ` · ${pv.resumo.pctEmDia}% em dia` : ''}</> : 'carregando…')}
        {cartao('pend', '#d97706', 'fa-screwdriver-wrench', 'Pendências', pd ? String(abertas.length) : '—',
          pd ? <>abertas em {plural(new Set(abertas.map((x) => x.placa)).size, 'carro', 'carros')}</> : 'carregando…', null, 'cpv-oficina')}
      </div>
      {tela === 'agora' && <TelaCheia titulo="Onde estão os carros agora" sub="posição real de cada carro e um cartão por veículo" onFechar={fechar}><AbaAgora /></TelaCheia>}
      {tela === 'abast' && <TelaCheia titulo="Abastecimentos" sub="cartão-frota + requisições, e os km do rastreador" onFechar={fechar}><AbaAbastecimentos /></TelaCheia>}
      {tela === 'manut' && <TelaCheia titulo="Manutenções e revisões" sub="o plano de revisão de cada carro e o que foi feito" onFechar={fechar}><AbaManutencoes /></TelaCheia>}
      {tela === 'pend' && <TelaCheia titulo="Pendências da frota" sub="o que está aberto em cada carro" onFechar={fechar}><AbaPendencias /></TelaCheia>}
    </div>
  )
}

const motoristaDe = (v: Veiculo | undefined) => v?.responsavel_nome || 'sem motorista'
/** placa + modelo + motorista, com a foto do carro */
function CarroMini({ placa, veic, extra }: { placa: string; veic: Map<string, Veiculo>; extra?: string }) {
  const v = veic.get(placa)
  return (
    <span className="cfr-mini-c">
      <span className="cfr-mini-f">{v?.imagem_url ? <img src={v.imagem_url} alt="" /> : <i className="fas fa-car-side" />}</span>
      <span className="cfr-mini-t"><b>{v?.placa_exibicao || placa}</b><small>{[[v?.marca, v?.modelo].filter(Boolean).join(' '), motoristaDe(v), extra].filter(Boolean).join(' · ')}</small></span>
    </span>
  )
}

// ── ABASTECIMENTOS: o mesmo painel do Frota → Abastecimento (/api/abastecimento/dashboard), 12 meses
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
function AbaAbastecimentos() {
  const hoje = hojeISO()
  const de = (() => { const d = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 12, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })()
  const { d, erro } = useJson<DashboardAbastecimento>(`/api/abastecimento/dashboard?de=${de}&ate=${hoje}`)
  const { d: vsA } = useJson<{ veiculos: Veiculo[] }>('/api/frota/veiculos')
  const veic = new Map((vsA?.veiculos || []).map((v) => [v.placa, v]))
  const [mesEsc, setMes] = useState('')
  const [jan, setJan] = useState<'gasto' | 'litros' | 'ano' | 'consumo' | null>(null) // cartão clicado (José, 12/11: "esses botões têm que ser clicáveis")
  // km do rastreador no mês, para cruzar com os litros (José, 12/11: "cruzar quantos km ele rodou entre os abastecimentos")
  const { d: kmG } = useJson<{ porPlaca: Record<string, { km: number; dias: number }>; comRastreador: string[] }>(`/api/empresa/frota-km?mes=${mesEsc || hoje.slice(0, 7)}`)
  if (erro) return <div className="cm-aviso">{erro}</div>
  if (!d) return <div className="ce-mudo">Carregando os abastecimentos…</div>
  const meses = d.evolucaoMensal.filter((m) => m.mes >= de.slice(0, 7))
  const mes = mesEsc && meses.some((m) => m.mes === mesEsc) ? mesEsc : meses[meses.length - 1]?.mes || ''
  const m = meses.find((x) => x.mes === mes)
  const max = Math.max(1, ...meses.map((x) => x.valor))
  const media = meses.length > 1 ? meses.slice(0, -1).reduce((a, x) => a + x.valor, 0) / (meses.length - 1) : null
  const porVeic = d.porVeiculoMes.filter((x) => x.mes === mes).sort((a, b) => b.valor - a.valor)
  const modelo = new Map(d.opcoesFiltro.veiculos.map((v) => [v.placa, v.modelo]))
  const maxV = Math.max(1, ...porVeic.map((x) => x.valor))
  const parcial = mes === hoje.slice(0, 7)
  // cruzamento litros (cartão + requisição) × km do GPS no mês, por carro
  const litrosDe = new Map(porVeic.map((x) => [x.placa, x]))
  const placasCruz = [...new Set([...porVeic.map((x) => x.placa), ...Object.keys(kmG?.porPlaca || {}).filter((k) => (kmG?.porPlaca[k].km || 0) > 0)])]
  const cruz = placasCruz.map((placa) => {
    const l = litrosDe.get(placa), km = kmG?.porPlaca[placa]?.km ?? null, temGps = !!kmG?.comRastreador.includes(placa)
    const litros = l?.litros || 0, kml = km && litros ? km / litros : null
    const alerta = !temGps ? null : litros >= 15 && (km ?? 0) < 50 ? 'abasteceu e quase não rodou' : kml != null && litros >= 20 && kml < 5 ? 'gastou muito para o que rodou' : (km ?? 0) > 400 && !litros ? 'rodou sem abastecimento lançado' : null
    return { placa, modelo: modelo.get(placa) || '', litros, valor: l?.valor || 0, km, temGps, kml, alerta }
  }).sort((a, b) => Number(!!b.alerta) - Number(!!a.alerta) || (b.km || 0) - (a.km || 0))
  const kmTot = cruz.reduce((a, x) => a + (x.km || 0), 0)
  const comAmbos = cruz.filter((x) => x.km && x.litros)
  const kmlGps = comAmbos.reduce((a, x) => a + x.litros, 0) ? comAmbos.reduce((a, x) => a + (x.km || 0), 0) / comAmbos.reduce((a, x) => a + x.litros, 0) : null
  const alertas = cruz.filter((x) => x.alerta).length
  return (
    <div className="cfr">
      {/* troca de mês (José, 12/11) */}
      <div className="cpv-topo"><NavMes meses={meses.map((x) => x.mes)} mes={mes} setMes={setMes} /><span className="cpv-frase">{cap(nomeMes(mes))}{parcial ? ' até hoje' : ''}: <b>{compacto(m?.valor || 0)}</b> em {Math.round(m?.litros || 0).toLocaleString('pt-BR')} litros.</span></div>
      <div className="cpv-kpis">
        <button className="cmt-kpi cmt-kpi-bt" onClick={() => setJan('gasto')}><small>Gasto em {nomeMes(mes)}{parcial ? ' até hoje' : ''}</small><b>{compacto(m?.valor || 0)}</b><em>{m?.varMes != null && !parcial ? <span style={{ color: m.varMes <= 0 ? '#15803d' : '#dc2626' }}>{m.varMes > 0 ? '+' : ''}{Math.round(m.varMes)}% que o mês anterior</span> : parcial && d.projecao ? `no ritmo, fecha em ${compacto(d.projecao.projetado)}` : ''}</em></button>
        <button className="cmt-kpi cmt-kpi-bt" onClick={() => setJan('litros')}><small>Litros</small><b>{Math.round(m?.litros || 0).toLocaleString('pt-BR')} L</b><em>{m && m.litros ? `${brl(m.valor / m.litros)} por litro` : ''}</em></button>
        <button className="cmt-kpi cmt-kpi-bt" onClick={() => setJan('ano')}><small>12 meses</small><b>{compacto(meses.reduce((a, x) => a + x.valor, 0))}</b><em>{media != null ? `média de ${compacto(media)} por mês` : ''}</em></button>
        <button className="cmt-kpi cmt-kpi-bt" onClick={() => setJan('consumo')}><small>Km rodados (rastreador)</small><b>{kmG ? `${kmTot.toLocaleString('pt-BR')} km` : '…'}</b><em>{kmlGps ? `${kmlGps.toFixed(1)} km/l pelo GPS · ` : ''}{kmTot && m?.valor ? `${brl(m.valor / kmTot)} por km` : ''}{alertas ? <> · <span style={{ color: '#d97706' }}>{plural(alertas, 'alerta', 'alertas')}</span></> : null}</em></button>
      </div>
      <Secao titulo="Gasto por mês" sub="clique num mês para ver os carros">
        <div className="cpv-g-cols cfr-g">
          {meses.map((x) => (
            <button key={x.mes} className={`cpv-g-col${x.mes === mes ? ' on' : ''}`} onClick={() => setMes(x.mes)} title={`${brl(x.valor)} · ${Math.round(x.litros)} L`}>
              <b className={media == null || x.mes === hoje.slice(0, 7) ? '' : x.valor <= media ? 'acima' : 'abaixo'}>{compacto(x.valor).replace('R$ ', '')}</b>
              <span className="cpv-g-area">
                {media != null && <span className="cpv-g-media" style={{ bottom: `${(media / max) * 100}%` }} />}
                <span className="cpv-g-pilha" style={{ height: `${(x.valor / max) * 100}%` }}><span style={{ flex: 1, background: '#0891b2' }} /></span>
              </span>
              <small>{mesCurto(x.mes)}</small>
            </button>
          ))}
        </div>
        {media != null && <p className="cma-nota">A linha tracejada é a média dos meses fechados ({compacto(media)}). Valor em <b style={{ color: '#15803d' }}>verde</b> = gastou menos que a média; em <b style={{ color: '#dc2626' }}>vermelho</b> = mais.</p>}
      </Secao>
      <div className="cmt-dois">
        <Secao titulo={`Por carro em ${nomeMes(mes)}`} sub={`${porVeic.length} carros`}>
          {porVeic.length ? porVeic.map((x) => (
            <div key={x.placa} className="cdp-conta cpv-linha cpv-fixa">
              <CarroMini placa={x.placa} veic={veic} />
              <span className="cdp-conta-bar"><span style={{ width: `${Math.max(3, (x.valor / maxV) * 100)}%`, background: '#0891b2' }} /></span>
              <small>{Math.round(x.litros)} L{x.kml ? ` · ${x.kml.toFixed(1)} km/l` : ''}</small><b>{compacto(x.valor)}</b><i />
            </div>
          )) : <div className="ce-mudo">Nenhum abastecimento nesse mês.</div>}
        </Secao>
        <Secao titulo="Litros × km do rastreador" sub={`${nomeMes(mes)} · o que abasteceu × o que rodou`}>
          {!kmG ? <div className="ce-mudo">Buscando os km do rastreador…</div> : cruz.length ? cruz.map((x) => (
            <div key={x.placa} className={`cfr-cruz${x.alerta ? ' alerta' : ''}`}>
              <CarroMini placa={x.placa} veic={veic} />
              <span className="cfr-cruz-n"><b>{x.temGps ? (x.km != null ? `${x.km.toLocaleString('pt-BR')} km` : '0 km') : 'sem GPS'}</b><small>rodou</small></span>
              <span className="cfr-cruz-n"><b>{x.litros ? `${Math.round(x.litros)} L` : '—'}</b><small>abasteceu</small></span>
              <span className="cfr-cruz-n"><b>{x.kml ? x.kml.toFixed(1) : '—'}</b><small>km/l</small></span>
              {x.alerta ? <em><i className="fas fa-triangle-exclamation" /> {x.alerta}</em> : <em className="ok" />}
            </div>
          )) : <div className="ce-mudo">Sem dados no mês.</div>}
          <p className="cma-nota">Km pelo rastreador (não depende do hodômetro digitado na bomba). Conta por mês: o tanque cheio no fim de um mês é usado no seguinte, então olhe os alertas com isso em mente.</p>
        </Secao>
      </div>
      <p className="cma-nota">Mesma conta do Frota → Abastecimento: cartão-frota + requisições de abastecimento.</p>
      {(jan === 'gasto' || jan === 'litros') && <JanelaAbast mes={mes} porLitros={jan === 'litros'} onFechar={() => setJan(null)} />}
      {jan === 'ano' && (
        <Janela titulo="Abastecimento mês a mês" sub="clique num mês para ver os carros dele" onFechar={() => setJan(null)}>
          <div className="cmt-tab-wrap"><table className="cmt-tab cpv-tab">
            <thead><tr><th>Mês</th><th>Gasto</th><th>Litros</th><th>R$ por litro</th><th>× mês anterior</th><th>× ano passado</th></tr></thead>
            <tbody>{[...meses].reverse().map((x) => (
              <tr key={x.mes} className="cmm-l" style={{ cursor: 'pointer' }} onClick={() => { setMes(x.mes); setJan(null) }}>
                <td>{cap(nomeMes(x.mes, true))}</td><td className="val"><b>{brl(x.valor)}</b></td><td className="val">{Math.round(x.litros).toLocaleString('pt-BR')} L</td>
                <td className="val">{x.litros ? brl(x.valor / x.litros) : '—'}</td>
                <td className="val" style={{ color: x.varMes == null ? undefined : x.varMes <= 0 ? '#15803d' : '#dc2626' }}>{x.varMes != null ? `${x.varMes > 0 ? '+' : ''}${Math.round(x.varMes)}%` : '—'}</td>
                <td className="val" style={{ color: x.varAno == null ? undefined : x.varAno <= 0 ? '#15803d' : '#dc2626' }}>{x.varAno != null ? `${x.varAno > 0 ? '+' : ''}${Math.round(x.varAno)}%` : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Janela>
      )}
      {jan === 'consumo' && (
        <Janela titulo="Consumo de cada carro" sub="km por litro nos últimos 12 meses" onFechar={() => setJan(null)}>
          <div className="cmt-tab-wrap"><table className="cmt-tab cpv-tab">
            <thead><tr><th>Carro</th><th>Rodou</th><th>Litros</th><th>km/l</th><th>R$ por km</th><th>Agora</th></tr></thead>
            <tbody>{[...d.consumo].sort((a, b) => a.kmPorLitro - b.kmPorLitro).map((c) => {
              const an = d.anomalias.find((a) => a.placa === c.placa)
              return (
                <tr key={c.placa}>
                  <td><CarroMini placa={c.placa} veic={veic} /></td>
                  <td className="val">{Math.round(c.kmRodado).toLocaleString('pt-BR')} km</td>
                  <td className="val">{Math.round(c.litrosConsiderados).toLocaleString('pt-BR')} L</td>
                  <td className="val"><b>{c.kmPorLitro.toFixed(1)}</b></td>
                  <td className="val">{brl(c.custoPorKm)}</td>
                  <td className="val">{an ? <span className="cff-doc vencendo">{an.kmlRecente.toFixed(1)} km/l no último</span> : <span className="cff-doc ok">normal</span>}</td>
                </tr>
              )
            })}</tbody>
          </table></div>
          {!d.consumo.length && <div className="ce-mudo">Sem trechos suficientes para calcular o consumo.</div>}
        </Janela>
      )}
    </div>
  )
}

function Janela({ titulo, sub, onFechar, children, acao }: { titulo: string; sub?: string; onFechar: () => void; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="cmw-fundo cml-janela-fundo cmp-fundo" onClick={onFechar}>
      <div className="cml-janela cmp-janela" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>{titulo}</h3><span>{sub}</span>{acao}<button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        <div className="cml-janela-corpo">{children}</div>
      </div>
    </div>
  )
}

/** os abastecimentos do mês (cartão + requisições); por litros = ordena por litros e mostra os combustíveis */
function JanelaAbast({ mes, porLitros, onFechar }: { mes: string; porLitros: boolean; onFechar: () => void }) {
  const { d, erro } = useJson<TransacoesResp>(`/api/abastecimento/transacoes?mes=${mes}&limit=1000`)
  const { d: vsJ } = useJson<{ veiculos: Veiculo[] }>('/api/frota/veiculos')
  const veic = new Map((vsJ?.veiculos || []).map((v) => [v.placa, v]))
  const [busca, setBusca] = useState('')
  const [frame, setFrame] = useState<{ titulo: string; src: string } | null>(null)
  const q = busca.trim().toLowerCase()
  const linhas = (d?.linhas || []).filter((x) => !q || `${x.placa} ${x.motorista_nome || ''} ${x.posto_nome || ''} ${x.modelo_veiculo || ''}`.toLowerCase().includes(q))
    .sort((a, b) => (porLitros ? b.litros - a.litros : b.data_transacao.localeCompare(a.data_transacao)))
  const comb = [...(d?.linhas || []).reduce((m, x) => { const k = x.combustivel || (x.origem === 'requisicao' ? 'Requisição' : 'Outro'); const y = m.get(k) || { l: 0, v: 0 }; y.l += x.litros || 0; y.v += x.valor_total || 0; return m.set(k, y) }, new Map<string, { l: number; v: number }>()).entries()].sort((a, b) => b[1].l - a[1].l)
  return (
    <Janela titulo={porLitros ? `Litros em ${nomeMes(mes)}` : `Abastecimentos de ${nomeMes(mes)}`} sub={d ? `${plural(d.total, 'abastecimento', 'abastecimentos')} · ${Math.round(d.somaLitros).toLocaleString('pt-BR')} L · ${compacto(d.somaValor)}` : ''} onFechar={onFechar}>
      {erro && <div className="cm-aviso">{erro}</div>}
      {!d && !erro && <div className="ce-mudo">Buscando os abastecimentos…</div>}
      {d && (
        <>
          {porLitros && comb.length > 0 && (
            <div className="cpv-kpis" style={{ marginBottom: 12 }}>
              {comb.map(([k, y]) => <div key={k} className="cmt-kpi"><small>{k}</small><b>{Math.round(y.l).toLocaleString('pt-BR')} L</b><em>{compacto(y.v)}{y.l ? ` · ${brl(y.v / y.l)}/L` : ''}</em></div>)}
            </div>
          )}
          {/* busca na esquerda (José, 12/11) */}
          <div className="cfr-busca-linha"><input className="cpf-busca" placeholder="Buscar placa, motorista ou posto" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <div className="cmt-tab-wrap"><table className="cmt-tab cpv-tab">
            <thead><tr><th>Data</th><th>Carro</th><th>Quem</th><th>Onde</th><th>Litros</th><th>Valor</th></tr></thead>
            <tbody>{linhas.map((x) => (
              <tr key={`${x.origem || 'c'}-${x.id}`} className={x.req_id ? 'cmm-l' : ''} style={x.req_id ? { cursor: 'pointer' } : undefined} onClick={() => { if (x.req_id) setFrame({ titulo: `Requisição ${x.req_id}`, src: `/requisicoes/imprimir/${x.req_id}` }) }}>
                <td>{dBR(x.data_transacao.slice(0, 10))}<small>{x.origem === 'requisicao' ? 'requisição' : x.data_transacao.slice(11, 16)}</small></td>
                <td><CarroMini placa={x.placa} veic={veic} /></td>
                <td>{x.motorista_nome || '—'}<small>{x.departamento || ''}</small></td>
                <td>{x.posto_nome || '—'}<small>{x.combustivel || ''}</small></td>
                <td className="val">{x.litros ? `${x.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L` : '—'}</td>
                <td className="val"><b>{x.valor_total != null ? brl(x.valor_total) : '—'}</b>{x.req_id ? <small><i className="fas fa-file-pdf" /> ver</small> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {!linhas.length && <div className="ce-mudo">Nenhum abastecimento.</div>}
        </>
      )}
      {frame && <JanelaFrame titulo={frame.titulo} src={frame.src} onFechar={() => setFrame(null)} />}
    </Janela>
  )
}

/** em cima os carros com setor e pessoa vinculada; os outros num bloco fechado embaixo */
function PorVinculo<T>({ itens, placa, veic, render }: { itens: T[]; placa: (x: T) => string; veic: Map<string, Veiculo>; render: (x: T) => React.ReactNode }) {
  const tem = (x: T) => { const v = veic.get(placa(x)); return !!v?.setor && !!v?.responsavel_nome }
  const sim = itens.filter(tem), nao = itens.filter((x) => !tem(x))
  return (
    <>
      <div className="cfr-grade">{sim.map(render)}</div>
      {!sim.length && itens.length ? <div className="ce-mudo">Nenhum carro com setor e responsável nesta lista.</div> : null}
      {nao.length ? (
        <details className="cfr-resto">
          <summary><i className="fas fa-chevron-right" /> Sem setor ou sem responsável <b>{nao.length}</b></summary>
          <div className="cfr-grade">{nao.map(render)}</div>
        </details>
      ) : null}
    </>
  )
}

// ── MANUTENÇÕES E REVISÕES (José, 12/11): a revisão preventiva de cada carro (/api/frota/preventivas, a conta do módulo)
//    e as manutenções feitas (/api/empresa/frota-manutencoes = vw_frota_manutencoes, 12 meses)
type ManutL = { id: string; placa: string; origem: string | null; tipo: string | null; status: string | null; descricao: string | null; fornecedor: string | null; valor_total: number | null; data: string | null; hodometro: number | null }
type PrevItem = { plano: { nome: string }; situacao: { estado: string; texto: string }; ultimo: { data: string; km: number | null } | null }
type PrevV = { placa: string; descricao: string; modelo: { nome: string } | null; km: { km: number } | null; itens: PrevItem[] }
const EST: Record<string, { nome: string; cls: string; ordem: number }> = {
  vencida: { nome: 'Vencida', cls: 'vencido', ordem: 0 }, em_breve: { nome: 'Vence logo', cls: 'vencendo', ordem: 1 },
  em_dia: { nome: 'Em dia', cls: 'ok', ordem: 2 }, sem_leitura: { nome: 'Sem km', cls: 'sem', ordem: 3 }, sem_historico: { nome: 'Nunca feita', cls: 'sem', ordem: 4 },
}
function AbaManutencoes() {
  const { d: pv, erro: e1 } = useJson<{ veiculos: PrevV[]; resumo: { vencida: number; em_breve: number; em_dia: number; sem_historico: number; pctEmDia: number | null }; semPlano: string[] }>('/api/frota/preventivas')
  const { d: mt, erro: e2 } = useJson<{ manutencoes: ManutL[] }>('/api/empresa/frota-manutencoes')
  const { d: vs } = useJson<{ veiculos: Veiculo[] }>('/api/frota/veiculos')
  const hoje = hojeISO()
  const [mesEsc, setMes] = useState('')
  const [filtro, setFiltro] = useState<string | null>(null)
  const [ficha, setFicha] = useState<Veiculo | null>(null)
  const [sub, setSub] = useState<'rev' | 'man'>('rev')
  const veic = new Map((vs?.veiculos || []).map((v) => [v.placa, v]))
  const meses = Array.from({ length: 12 }, (_, i) => { const dt = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 12 + i, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` })
  const mes = mesEsc && meses.includes(mesEsc) ? mesEsc : meses[meses.length - 1]
  const lista = mt?.manutencoes || []
  const porMes = meses.map((mm) => ({ mm, v: lista.filter((x) => (x.data || '').startsWith(mm)).reduce((a, x) => a + (Number(x.valor_total) || 0), 0), n: lista.filter((x) => (x.data || '').startsWith(mm)).length }))
  const max = Math.max(1, ...porMes.map((x) => x.v))
  const doMes = lista.filter((x) => (x.data || '').startsWith(mes))
  const totMes = doMes.reduce((a, x) => a + (Number(x.valor_total) || 0), 0)
  const temPlano = !!pv?.veiculos.some((v) => v.modelo)
  const tot12 = lista.reduce((a, x) => a + (Number(x.valor_total) || 0), 0)
  const maisCaro = [...lista.reduce((mp, x) => mp.set(x.placa, (mp.get(x.placa) || 0) + (Number(x.valor_total) || 0)), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0] || null
  const semValor = lista.filter((x) => !(Number(x.valor_total) > 0)).length
  // revisões: carros com algum item vencido ou vencendo primeiro
  const carros = (pv?.veiculos || []).map((v) => ({ ...v, pior: Math.min(...v.itens.map((i) => EST[i.situacao.estado]?.ordem ?? 9), 9) }))
    .filter((v) => !filtro || v.itens.some((i) => i.situacao.estado === filtro)).sort((a, b) => a.pior - b.pior || a.placa.localeCompare(b.placa))
  return (
    <div className="cfr">
      {(e1 || e2) && <div className="cm-aviso">{e1 || e2}</div>}
      {/* mês no topo (José, 12/11) */}
      <div className="cpv-topo"><NavMes meses={meses} mes={mes} setMes={setMes} /><span className="cpv-frase">{cap(nomeMes(mes))}: <b>{mt ? compacto(totMes) : '…'}</b> em manutenção, {plural(doMes.length, 'serviço', 'serviços')}.</span></div>
      <div className="cpv-kpis">
        {temPlano ? (<>
        <button className="cmt-kpi cmt-kpi-bt" onClick={() => { setFiltro(filtro === 'vencida' ? null : 'vencida'); setSub('rev') }}><small>Revisões vencidas</small><b style={{ color: pv?.resumo.vencida ? '#dc2626' : '#16a34a' }}>{pv ? pv.resumo.vencida : '…'}</b><em>itens do plano que já passaram do km ou da data</em></button>
        <button className="cmt-kpi cmt-kpi-bt" onClick={() => { setFiltro(filtro === 'em_breve' ? null : 'em_breve'); setSub('rev') }}><small>Vencem logo</small><b style={{ color: pv?.resumo.em_breve ? '#d97706' : undefined }}>{pv ? pv.resumo.em_breve : '…'}</b><em>dentro do aviso do plano</em></button>
        <div className="cmt-kpi"><small>Frota em dia</small><b>{pv?.resumo.pctEmDia != null ? `${pv.resumo.pctEmDia}%` : '—'}</b><em>{pv?.semPlano.length ? `${plural(pv.semPlano.length, 'carro', 'carros')} sem plano de revisão` : 'dos itens com km ou data'}</em></div>
        </>) : (<>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setSub('man')}><small>Manutenção em 12 meses</small><b>{mt ? compacto(tot12) : '…'}</b><em>média de {compacto(tot12 / 12)} por mês · {plural(lista.length, 'serviço', 'serviços')}</em></button>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => { const ve = maisCaro && veic.get(maisCaro[0]); if (ve) setFicha(ve) }}><small>Carro que mais gastou</small><b>{maisCaro ? (veic.get(maisCaro[0])?.placa_exibicao || maisCaro[0]) : '—'}</b><em>{maisCaro ? `${compacto(maisCaro[1])} em 12 meses · ${tot12 ? Math.round((maisCaro[1] / tot12) * 100) : 0}% do total` : ''}</em></button>
          <button className="cmt-kpi cmt-kpi-bt" onClick={() => setSub('man')}><small>Serviços sem valor lançado</small><b style={{ color: semValor ? '#d97706' : '#16a34a' }}>{mt ? semValor : '…'}</b><em>{semValor ? `de ${lista.length} em 12 meses: o custo deles não entra na conta` : 'todos os serviços têm valor'}</em></button>
        </>)}
        <div className="cmt-kpi"><small>Manutenção em {nomeMes(mes)}</small><b>{mt ? compacto(totMes) : '…'}</b><em>{plural(doMes.length, 'serviço', 'serviços')}</em></div>
      </div>

      <Secao titulo="Gasto com manutenção por mês" sub="clique num mês para ver os serviços">
        <div className="cpv-g-cols cfr-g">
          {porMes.map((x) => (
            <button key={x.mm} className={`cpv-g-col${x.mm === mes ? ' on' : ''}`} onClick={() => { setMes(x.mm); setSub('man') }} title={`${brl(x.v)} · ${x.n} serviços`}>
              <b>{x.v ? compacto(x.v).replace('R$ ', '') : ''}</b>
              <span className="cpv-g-area"><span className="cpv-g-pilha" style={{ height: `${(x.v / max) * 100}%` }}><span style={{ flex: 1, background: '#7c3aed' }} /></span></span>
              <small>{mesCurto(x.mm)}</small>
            </button>
          ))}
        </div>
      </Secao>

      <div className="cfr-abas">
        <button className={sub === 'rev' ? 'on' : ''} onClick={() => setSub('rev')}><i className="fas fa-clipboard-check" /> Revisões</button>
        <button className={sub === 'man' ? 'on' : ''} onClick={() => setSub('man')}><i className="fas fa-wrench" /> Manutenções{mt ? <b className="cff-q" style={{ background: '#ede9fe', color: '#6d28d9' }}>{doMes.length}</b> : null}</button>
      </div>
      {sub === 'rev' && (<>
      <Secao titulo="Revisões de cada carro" sub={filtro ? <button className="cpc-link" onClick={() => setFiltro(null)}>mostrar todos</button> : 'o plano de manutenção do modelo, pelo km e pela data'}>
        {!pv && !e1 && <div className="ce-mudo">Carregando as revisões…</div>}
        <PorVinculo itens={carros} placa={(v) => v.placa} veic={veic} render={(v) => {
            const itens = [...v.itens].sort((a, b) => (EST[a.situacao.estado]?.ordem ?? 9) - (EST[b.situacao.estado]?.ordem ?? 9))
            const ve = veic.get(v.placa)
            return (
              <div key={v.placa} className="cfr-card cfr-pend" onClick={() => ve && setFicha(ve)} style={{ cursor: ve ? 'pointer' : 'default' }}>
                <div className="cfr-card-bt"><span className="cfr-foto">{ve?.imagem_url ? <img src={ve.imagem_url} alt="" /> : <i className="fas fa-car-side" />}</span><div className="cfr-info"><b>{ve?.placa_exibicao || v.placa}</b><span>{v.descricao}</span><small>{motoristaDe(ve)} · {v.modelo ? `plano: ${v.modelo.nome}` : 'sem plano de revisão'}{v.km ? ` · ${Math.round(v.km.km).toLocaleString('pt-BR')} km` : ''}</small></div></div>
                <div className="cfr-prev">
                  {itens.slice(0, 5).map((i) => (
                    <div key={i.plano.nome} className="cfr-prev-it"><span>{i.plano.nome}<small>{i.situacao.texto}{i.ultimo ? ` · feito em ${dBR(i.ultimo.data)}` : ''}</small></span><em className={`cff-doc ${EST[i.situacao.estado]?.cls || 'sem'}`}>{EST[i.situacao.estado]?.nome || i.situacao.estado}</em></div>
                  ))}
                  {itens.length > 5 && <small className="cfr-prev-mais">e mais {itens.length - 5} itens em dia</small>}
                  {!itens.length && <small className="cfr-prev-mais">nenhum item no plano</small>}
                </div>
              </div>
            )
          }} />
      </Secao>

      </>)}
      {sub === 'man' && (<>
      <Secao titulo={`Manutenções de ${nomeMes(mes)}`} sub={`${plural(doMes.length, 'serviço', 'serviços')} · ${compacto(totMes)}`}>
        {!mt && !e2 && <div className="ce-mudo">Carregando as manutenções…</div>}
        {doMes.map((x) => (
          <div key={x.id} className="cfr-man-l" onClick={() => { const ve = veic.get(x.placa); if (ve) setFicha(ve) }}>
            <CarroMini placa={x.placa} veic={veic} />
            <span className="cfr-man-o">{x.descricao || x.tipo || 'Manutenção'}<small>{[x.fornecedor, x.hodometro ? `${Math.round(x.hodometro).toLocaleString('pt-BR')} km` : ''].filter(Boolean).join(' · ') || x.tipo || ''}</small></span>
            <span className="cfr-man-dt">{dBR(x.data)}</span>
            <span className="cfr-man-st">{x.status ? <em className="cff-doc sem">{x.status}</em> : null}</span>
            <b className="cfr-man-v">{x.valor_total ? brl(Number(x.valor_total)) : <span className="cfr-man-sv">sem valor</span>}</b>
          </div>
        ))}
        {mt && !doMes.length && <div className="ce-mudo">Nenhuma manutenção nesse mês.</div>}
      </Secao>
      </>)}
      {ficha && <FichaVeiculo v={ficha} onFechar={() => setFicha(null)} />}
    </div>
  )
}

/** a requisição que abriu a pendência (origem_ref, ou o "#6936" escrito na descrição) */
const reqDaPend = (x: Pend): number | null => {
  if (x.origem !== 'requisicao') return null
  const n = Number(String(x.origem_ref || '').replace(/\D/g, '')) || Number((String(x.descricao || '').match(/#(\d+)/) || [])[1])
  return n || null
}

// ── PENDÊNCIAS: as abertas de cada carro (/api/frota/pendencias)
type Pend = { id: number; placa: string; origem: string | null; origem_ref?: string | null; titulo: string; descricao: string | null; status: string; aberta_por: string | null; aberta_em: string; responsavel: string | null; gravidade: string | null; km: number | null }
const ORIGEM: Record<string, string> = { manual: 'Aberta à mão', requisicao: 'Requisição de manutenção', cadastro: 'Cadastro do carro', checklist: 'Checklist', app_vendas: 'App de vendas', opa: 'Opa' }
function AbaPendencias() {
  const { d, erro } = useJson<{ pendencias: Pend[] }>('/api/frota/pendencias')
  const { d: vs } = useJson<{ veiculos: Veiculo[] }>('/api/frota/veiculos')
  const [origem, setOrigem] = useState<string | null>(null)
  const [ficha, setFicha] = useState<Veiculo | null>(null)
  const [req, setReq] = useState<number | null>(null)
  if (erro) return <div className="cm-aviso">{erro}</div>
  if (!d) return <div className="ce-mudo">Carregando as pendências…</div>
  const veic = new Map((vs?.veiculos || []).map((v) => [v.placa, v]))
  const abertas = d.pendencias.filter((x) => x.status === 'aberta' && veic.get(x.placa)?.ativo !== false)
  const origens = [...new Set(abertas.map((x) => x.origem || 'manual'))]
  const lista = abertas.filter((x) => !origem || (x.origem || 'manual') === origem)
  const porPlaca = [...lista.reduce((mp, x) => mp.set(x.placa, [...(mp.get(x.placa) || []), x]), new Map<string, Pend[]>()).entries()].sort((a, b) => b[1].length - a[1].length)
  const dias = (iso: string) => Math.max(0, Math.round((Date.parse(`${hojeISO()}T12:00:00`) - Date.parse(iso)) / 86_400_000))
  return (
    <div className="cfr">
      <span className="cpv-frase"><b>{abertas.length}</b> pendências abertas em <b>{new Set(abertas.map((x) => x.placa)).size}</b> carros. A mais antiga está aberta há {abertas.length ? plural(Math.max(...abertas.map((x) => dias(x.aberta_em))), 'dia', 'dias') : '0 dias'}.</span>
      <div className="cmdp-chips">
        <button className={!origem ? 'on' : ''} onClick={() => setOrigem(null)}>Todas<b>{abertas.length}</b></button>
        {origens.map((o) => <button key={o} className={origem === o ? 'on' : ''} onClick={() => setOrigem(origem === o ? null : o)}>{ORIGEM[o] || cap(o)}<b>{abertas.filter((x) => (x.origem || 'manual') === o).length}</b></button>)}
      </div>
      <PorVinculo itens={porPlaca} placa={([pl]) => pl} veic={veic} render={([placa, ps]) => {
          const v = veic.get(placa)
          return (
            <div key={placa} className="cfr-card cfr-pend">
              <div className="cfr-card-bt" onClick={() => v && setFicha(v)}>
                <span className="cfr-foto">{v?.imagem_url ? <img src={v.imagem_url} alt="" /> : <i className="fas fa-car-side" />}</span>
                <span className="cfr-info"><b>{v?.placa_exibicao || placa}</b><span>{[v?.marca, v?.modelo].filter(Boolean).join(' ')}</span><small>{motoristaDe(v)} · {plural(ps.length, 'pendência aberta', 'pendências abertas')}</small></span>
              </div>
              <div className="cfr-pend-lista">
                {ps.map((x) => (
                  <div key={x.id} className={`cfr-pend-it${reqDaPend(x) ? ' tem' : ''}`} onClick={(e) => { const n = reqDaPend(x); if (n) { e.stopPropagation(); setReq(n) } }}>
                    <span>{x.titulo}<small>{ORIGEM[x.origem || 'manual'] || x.origem} · aberta há {plural(dias(x.aberta_em), 'dia', 'dias')}{x.responsavel ? ` · ${x.responsavel}` : ''}</small></span>
                  </div>
                ))}
              </div>
              {v && <button className="cfr-ficha" onClick={() => setFicha(v)}>ver a ficha <i className="fas fa-arrow-right" /></button>}
            </div>
          )
        }} />
      {!porPlaca.length && <div className="ce-mudo">Nenhuma pendência aberta.</div>}
      {ficha && <FichaVeiculo v={ficha} onFechar={() => setFicha(null)} />}
      {req && <JanelaFrame titulo={`Requisição ${req}`} src={`/requisicoes/imprimir/${req}`} onFechar={() => setReq(null)} />}
    </div>
  )
}

// ── FICHA do veículo, feita para o /empresa (José, 12/11: "faz a ficha ali para essa tela e não recicla da outra com o
//    modal"). Dados: /api/frota/veiculos/[placa] (a ficha completa da Frota, só leitura) + /api/frota/pendencias?placa=
type FichaDados = {
  veiculo: { placa: string; placa_exibicao: string | null; marca: string | null; modelo: string | null; ano: number | null; ano_modelo: number | null; cor: string | null; combustivel: string | null; chassi: string | null; renavam: string | null; setor: string | null; status: string; proprietario: string | null; categoria: string | null; numero_apolice: string | null; seguradora: string | null; dt_aquisicao: string | null; tipo_negociacao: string | null; exercicio_crlv: number | null; descricao: string | null; tipo_veiculo: string | null; capacidade_tanque: number | null }
  imagem_url: string | null
  fipe: { valor_mercado: number | null; data_valor: string | null } | null
  responsaveis: Array<{ motorista_nome: string | null; inicio: string | null; fim: string | null }>
  multas: Array<{ id: string; dt_multa: string | null; descricao: string | null; valor: number | null; pontos: number | null; status_interno: string | null; motorista_nome: string | null; local_endereco: string | null }>
  manutencoes: Array<{ id: string; data: string | null; tipo: string | null; descricao: string | null; fornecedor: string | null; valor_total: number | null; status: string | null; origem: string | null }>
  abastecimentos: Array<{ data_transacao: string; litros: number; valor_total: number; combustivel: string | null; posto_nome: string | null; motorista_nome: string | null }>
  custos_12m: Array<{ tipo: string; total: number }>
  km_odometro: number | null; km_odometro_fonte: string | null
  uso_30d: { dias_com_uso: number; partidas: number; tempo_ligado_min: number; tempo_marcha_lenta_min: number; km: number; paradas_atipicas: number; ultimos_dias?: Array<{ data: string; km_total: number | null; km_odometro: number | null; partidas: number | null; tempo_ligado_min: number | null; paradas_total: number | null }> }
  documentos: Array<{ id: string; tipo: string; numero: string | null; emissor: string | null; vigencia_inicio: string | null; vigencia_fim: string | null; valor: number | null; parcelas: number | null; arquivo_url: string | null; nome_arquivo: string | null; obs: string | null }>
  checklists: Array<{ id: string; tecnico_nome: string | null; mes_referencia: string; status: string | null; score_confianca: number | null; km: number | null }>
}
type AbaFicha = 'resumo' | 'custos' | 'docs' | 'check' | 'pend'
const dBR = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : '—')
const TIPO_DOC: Record<string, string> = { crlv: 'CRLV', seguro: 'Seguro', ipva: 'IPVA', licenciamento: 'Licenciamento', contrato: 'Contrato' }
function FichaVeiculo({ v, onFechar }: { v: Veiculo; onFechar: () => void }) {
  const { d, erro } = useJson<FichaDados>(`/api/frota/veiculos/${encodeURIComponent(v.placa)}`)
  const { d: pd } = useJson<{ pendencias: Pend[] }>(`/api/frota/pendencias?placa=${encodeURIComponent(v.placa)}`)
  const [aba, setAba] = useState<AbaFicha>('resumo')
  const [arquivo, setArquivo] = useState<{ titulo: string; src: string } | null>(null)
  const [uso, setUso] = useState(false)
  const hoje = hojeISO()
  const pend = (pd?.pendencias || []).filter((x) => x.status === 'aberta')
  const resp = d?.responsaveis.find((x) => !x.fim)?.motorista_nome || v.responsavel_nome
  const custo12 = d ? d.custos_12m.reduce((a, c) => a + c.total, 0) : 0
  const multasAbertas = d ? d.multas.filter((m) => !['paga', 'descontada', 'arquivada'].includes(String(m.status_interno || ''))) : []
  const docVenc = (x: { vigencia_fim: string | null }) => (x.vigencia_fim ? (x.vigencia_fim < hoje ? 'vencido' : x.vigencia_fim <= new Date(Date.parse(`${hoje}T12:00:00`) + 30 * 86_400_000).toISOString().slice(0, 10) ? 'vencendo' : 'ok') : 'sem')
  const ABAS: Array<[AbaFicha, string, number | null]> = [['resumo', 'Resumo', null], ['custos', 'Custos', null], ['docs', 'Documentos e multas', d ? d.documentos.filter((x) => docVenc(x) !== 'ok').length + multasAbertas.length : null], ['check', 'Checklists', null], ['pend', 'Pendências', pend.length]]
  return (
    <div className="cmw-fundo cml-janela-fundo cmp-fundo" onClick={onFechar}>
      <div className="cml-janela cmp-janela cff" onClick={(e) => e.stopPropagation()}>
        <div className="cml-janela-cab"><h3>{v.placa_exibicao || v.placa}</h3><span>{[v.marca, v.modelo].filter(Boolean).join(' ')}</span><button className="cma-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button></div>
        <div className="cff-topo">
          <span className="cff-foto">{d?.imagem_url || v.imagem_url ? <img src={d?.imagem_url || v.imagem_url || ''} alt="" /> : <i className="fas fa-car-side" />}</span>
          <div className="cff-dados">
            <b>{[v.marca, v.modelo].filter(Boolean).join(' ') || 'Veículo'}{v.ano_modelo || v.ano ? ` · ${v.ano_modelo || v.ano}` : ''}</b>
            <span>{SETOR[v.setor || ''] || 'Sem setor'} · {resp || 'sem responsável'}</span>
            <span className="cff-mini">{[d?.veiculo.cor, d?.veiculo.combustivel, d?.veiculo.proprietario ? `dono: ${d.veiculo.proprietario}` : ''].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="cfr-abas cff-abas">
            {ABAS.map(([k, n, q]) => <button key={k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{n}{q ? <b className="cff-q">{q}</b> : null}</button>)}
          </div>
        </div>
        <div className="cml-janela-corpo">
          {erro && <div className="cm-aviso">{erro}</div>}
          {!d && !erro && <div className="ce-mudo">Carregando a ficha…</div>}
          {d && aba === 'resumo' && (
            <div className="cfr">
              <div className="cpv-kpis">
                <button className="cmt-kpi cmt-kpi-bt" onClick={() => setUso(true)}><small>Hodômetro</small><b>{d.km_odometro != null ? `${Math.round(d.km_odometro).toLocaleString('pt-BR')} km` : '—'}</b><em>{d.km_odometro_fonte === 'rastreador' ? 'pelo rastreador' : d.km_odometro_fonte === 'digitado' ? 'digitado no último abastecimento' : ''}</em></button>
                <button className="cmt-kpi cmt-kpi-bt" onClick={() => setUso(true)}><small>Rodou em 30 dias</small><b>{d.uso_30d.km.toLocaleString('pt-BR')} km</b><em>{plural(d.uso_30d.dias_com_uso, 'dia de uso', 'dias de uso')} · {Math.round(d.uso_30d.tempo_ligado_min / 60)} h ligado</em></button>
                <button className="cmt-kpi cmt-kpi-bt" onClick={() => setAba('custos')}><small>Custo em 12 meses</small><b>{compacto(custo12)}</b><em>combustível, manutenção e outros</em></button>
                <button className="cmt-kpi cmt-kpi-bt" onClick={() => setAba('custos')}><small>Valor de mercado (FIPE)</small><b>{d.fipe?.valor_mercado ? compacto(d.fipe.valor_mercado) : '—'}</b><em>{d.fipe?.data_valor ? `de ${dBR(d.fipe.data_valor)}` : ''}</em></button>
              </div>
              <Secao titulo="Dados do carro">
                <div className="cff-dados-g">
                  {([
                    ['Placa', d.veiculo.placa_exibicao || d.veiculo.placa], ['Ano', [d.veiculo.ano, d.veiculo.ano_modelo].filter(Boolean).join('/')], ['Cor', d.veiculo.cor], ['Combustível', d.veiculo.combustivel],
                    ['Tanque', d.veiculo.capacidade_tanque ? `${d.veiculo.capacidade_tanque} L` : null], ['Tipo', d.veiculo.tipo_veiculo || d.veiculo.categoria], ['Chassi', d.veiculo.chassi], ['Renavam', d.veiculo.renavam],
                    ['Proprietário', d.veiculo.proprietario], ['Como veio', [d.veiculo.tipo_negociacao, d.veiculo.dt_aquisicao ? `em ${dBR(d.veiculo.dt_aquisicao)}` : ''].filter(Boolean).join(' ')],
                    ['Seguro', [d.veiculo.seguradora, d.veiculo.numero_apolice ? `apólice ${d.veiculo.numero_apolice}` : ''].filter(Boolean).join(' · ')], ['Setor', SETOR[d.veiculo.setor || ''] || 'sem setor'],
                  ] as Array<[string, string | null | undefined]>).filter(([, x]) => x).map(([k, x]) => <span key={k}><small>{k}</small>{x}</span>)}
                </div>
              </Secao>
              <div className="cmt-dois">
                <Secao titulo="Últimos abastecimentos">
                  {d.abastecimentos.length ? d.abastecimentos.map((a, i) => (
                    <div key={i} className="cff-l"><span>{dBR(a.data_transacao)}<small>{[a.posto_nome, a.motorista_nome].filter(Boolean).join(' · ')}</small></span><em>{Math.round(a.litros)} L {a.combustivel ? `· ${a.combustivel}` : ''}</em><b>{brl(a.valor_total)}</b></div>
                  )) : <div className="ce-mudo">Nenhum abastecimento.</div>}
                </Secao>
                <Secao titulo="Quem já teve o carro">
                  {d.responsaveis.length ? d.responsaveis.slice(0, 8).map((x, i) => (
                    <div key={i} className="cff-l"><span>{x.motorista_nome || '—'}<small>{dBR(x.inicio)} até {x.fim ? dBR(x.fim) : 'hoje'}</small></span>{!x.fim ? <em className="cff-atual">atual</em> : <em />}<b /></div>
                  )) : <div className="ce-mudo">Sem histórico de responsáveis.</div>}
                </Secao>
              </div>
            </div>
          )}
          {d && aba === 'custos' && (
            <div className="cfr">
              <Secao titulo="Custo dos últimos 12 meses" sub={compacto(custo12)}>
                {d.custos_12m.map((c) => (
                  <div key={c.tipo} className="cdp-conta cpv-linha cpv-fixa"><span>{c.tipo}</span><span className="cdp-conta-bar"><span style={{ width: `${Math.max(3, (c.total / Math.max(1, d.custos_12m[0]?.total || 1)) * 100)}%`, background: '#0891b2' }} /></span><small>{custo12 ? Math.round((c.total / custo12) * 100) : 0}%</small><b>{compacto(c.total)}</b><i /></div>
                ))}
                {!d.custos_12m.length && <div className="ce-mudo">Sem custos lançados.</div>}
              </Secao>
              <Secao titulo="Manutenções" sub={plural(d.manutencoes.length, 'registro', 'registros')}>
                {d.manutencoes.map((m) => (
                  <div key={m.id} className="cff-l"><span>{m.descricao || m.tipo || 'Manutenção'}<small>{[dBR(m.data), m.tipo, m.fornecedor, m.status].filter(Boolean).join(' · ')}</small></span><em /><b>{m.valor_total ? brl(m.valor_total) : '—'}</b></div>
                ))}
                {!d.manutencoes.length && <div className="ce-mudo">Nenhuma manutenção.</div>}
              </Secao>
            </div>
          )}
          {d && aba === 'docs' && (
            <div className="cmt-dois">
              <Secao titulo="Documentos">
                {d.documentos.map((x) => { const st = docVenc(x); const nome = TIPO_DOC[x.tipo] || cap(x.tipo); return (
                  <div key={x.id} className={`cff-doc-c${x.arquivo_url ? ' tem' : ''}`} onClick={() => x.arquivo_url && setArquivo({ titulo: `${nome} · ${v.placa_exibicao || v.placa}`, src: x.arquivo_url })}>
                    <div className="cff-doc-cab"><b>{nome}</b><em className={`cff-doc ${st}`}>{st === 'vencido' ? 'vencido' : st === 'vencendo' ? 'vence logo' : st === 'ok' ? 'em dia' : 'sem validade'}</em></div>
                    <div className="cff-doc-grade">
                      <span><small>Validade</small>{x.vigencia_inicio ? `${dBR(x.vigencia_inicio)} a ` : ''}{dBR(x.vigencia_fim)}</span>
                      {x.numero ? <span><small>Número</small>{x.numero}</span> : null}
                      {x.emissor ? <span><small>Emissor</small>{x.emissor}</span> : null}
                      {x.valor ? <span><small>Valor</small>{brl(Number(x.valor))}{x.parcelas ? ` em ${x.parcelas}x` : ''}</span> : null}
                      {x.tipo === 'crlv' && d.veiculo.exercicio_crlv ? <span><small>Exercício</small>{d.veiculo.exercicio_crlv}</span> : null}
                    </div>
                    {x.obs ? <p className="cff-doc-obs">{x.obs}</p> : null}
                    {x.arquivo_url ? <span className="cff-doc-arq"><i className="fas fa-file-pdf" /> {x.nome_arquivo || 'ver o arquivo'}</span> : <span className="cff-doc-arq sem">sem arquivo anexado</span>}
                  </div>
                ) })}
                {!d.documentos.length && <div className="ce-mudo">Nenhum documento anexado.</div>}
              </Secao>
              <Secao titulo="Multas" sub={multasAbertas.length ? `${multasAbertas.length} em aberto` : 'nenhuma em aberto'}>
                {d.multas.map((m) => (
                  <div key={m.id} className="cff-l"><span>{m.descricao || 'Multa'}<small>{[dBR(m.dt_multa), m.motorista_nome, m.pontos ? `${m.pontos} pontos` : '', m.local_endereco].filter(Boolean).join(' · ')}</small></span><em className={`cff-doc ${multasAbertas.includes(m) ? 'vencido' : 'ok'}`}>{multasAbertas.includes(m) ? 'em aberto' : m.status_interno || 'resolvida'}</em><b>{m.valor ? brl(m.valor) : '—'}</b></div>
                ))}
                {!d.multas.length && <div className="ce-mudo">Nenhuma multa.</div>}
              </Secao>
            </div>
          )}
          {d && aba === 'check' && (
            <Secao titulo="Checklists do carro" sub="últimos 12 meses">
              {d.checklists.map((c) => (
                <div key={c.id} className="cff-l"><span>{cap(nomeMes(c.mes_referencia.slice(0, 7), true))}<small>{[c.tecnico_nome, c.km ? `${c.km.toLocaleString('pt-BR')} km` : '', c.status].filter(Boolean).join(' · ')}</small></span><em className={`cff-doc ${c.score_confianca == null ? 'sem' : c.score_confianca >= 80 ? 'ok' : c.score_confianca >= 60 ? 'vencendo' : 'vencido'}`}>{c.score_confianca != null ? `confiança ${Math.round(c.score_confianca)}%` : 'sem nota'}</em><b /></div>
              ))}
              {!d.checklists.length && <div className="ce-mudo">Nenhum checklist nos últimos 12 meses.</div>}
            </Secao>
          )}
          {aba === 'pend' && (
            <Secao titulo="Pendências abertas" sub={pd ? plural(pend.length, 'pendência', 'pendências') : 'carregando…'}>
              {pend.map((x) => (
                <div key={x.id} className={`cfr-pend-it${reqDaPend(x) || x.origem === 'cadastro' ? ' tem' : ''}`} style={{ marginBottom: 6 }} onClick={() => { const n = reqDaPend(x); if (n) setArquivo({ titulo: `Requisição ${n}`, src: `/requisicoes/imprimir/${n}` }); else if (x.origem === 'cadastro') setAba('docs') }}><span>{x.titulo}<small>{ORIGEM[x.origem || 'manual'] || x.origem} · aberta em {dBR(x.aberta_em)}{x.responsavel ? ` · ${x.responsavel}` : ''}{x.descricao ? ` · ${x.descricao}` : ''}</small></span></div>
              ))}
              {pd && !pend.length && <div className="ce-mudo">Nenhuma pendência aberta.</div>}
            </Secao>
          )}
        </div>
      </div>
      {arquivo && <JanelaFrame titulo={arquivo.titulo} src={arquivo.src} onFechar={() => setArquivo(null)} />}
      {uso && d && (
        <Janela titulo={`Uso do ${v.placa_exibicao || v.placa}`} sub={`últimos 30 dias · ${d.uso_30d.km.toLocaleString('pt-BR')} km · ${plural(d.uso_30d.dias_com_uso, 'dia de uso', 'dias de uso')}`} onFechar={() => setUso(false)}>
          <div className="cpv-kpis" style={{ marginBottom: 12 }}>
            <div className="cmt-kpi"><small>Hodômetro hoje</small><b>{d.km_odometro != null ? `${Math.round(d.km_odometro).toLocaleString('pt-BR')} km` : '—'}</b><em>{d.km_odometro_fonte === 'rastreador' ? 'pelo rastreador' : 'digitado no abastecimento'}</em></div>
            <div className="cmt-kpi"><small>Partidas</small><b>{d.uso_30d.partidas}</b><em>em 30 dias</em></div>
            <div className="cmt-kpi"><small>Tempo ligado</small><b>{Math.round(d.uso_30d.tempo_ligado_min / 60)} h</b><em>{Math.round(d.uso_30d.tempo_marcha_lenta_min / 60)} h parado com motor ligado</em></div>
            <div className="cmt-kpi"><small>Paradas fora do comum</small><b style={{ color: d.uso_30d.paradas_atipicas ? '#d97706' : undefined }}>{d.uso_30d.paradas_atipicas}</b><em>em 30 dias</em></div>
          </div>
          <Secao titulo="Últimos dias" sub="pelo rastreador">
            {(d.uso_30d.ultimos_dias || []).map((x) => (
              <div key={x.data} className="cff-l"><span>{dBR(x.data)}<small>{x.partidas || 0} partidas · {x.paradas_total || 0} paradas</small></span><em>{Math.round((x.tempo_ligado_min || 0) / 60 * 10) / 10} h ligado</em><b>{Math.round(Number(x.km_odometro ?? x.km_total ?? 0)).toLocaleString('pt-BR')} km</b></div>
            ))}
            {!(d.uso_30d.ultimos_dias || []).length && <div className="ce-mudo">Sem dias com rastreador.</div>}
          </Secao>
        </Janela>
      )}
    </div>
  )
}

export const CSS_CFR = `
.cff-topo{display:grid;grid-template-columns:120px 1fr;gap:16px;align-items:center;padding:16px 24px 0}
.cff-foto{width:120px;height:86px;border-radius:14px;background:#f8fafc;border:1px solid #eef2f7;display:grid;place-items:center;overflow:hidden;color:#94a3b8;font-size:30px}
.cff-foto img{width:100%;height:100%;object-fit:contain;padding:4px}
.cff-dados{display:flex;flex-direction:column;gap:2px;min-width:0}
.cff-dados b{font-size:17px;font-weight:600;color:#0f172a}
.cff-dados span{font-size:14px;color:#334155}
.cff-mini{font-size:12.5px !important;color:#64748b !important}
.cff-abas{grid-column:1/-1;padding-bottom:4px}
.cff-q{margin-left:6px;font-size:11.5px;font-weight:600;background:#fef3c7;color:#b45309;border-radius:99px;padding:1px 7px}
.cff-l{display:grid;grid-template-columns:1fr auto 100px;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a}
.cff-l span{display:flex;flex-direction:column;min-width:0}
.cff-l small{font-size:12px;color:#64748b}
.cff-l em{font-style:normal;font-size:12.5px;color:#475569}
.cff-l b{text-align:right;font-weight:500;font-variant-numeric:tabular-nums}
.cff-atual{color:#0e7490 !important;font-weight:500}
.cff-doc{border-radius:99px;padding:2px 9px}
.cff-doc-c{border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px;margin-bottom:10px;background:#fefefe;display:flex;flex-direction:column;gap:8px}
.cff-doc-c.tem{cursor:pointer}
.cff-doc-c.tem:hover{border-color:#93c5fd}
.cff-doc-cab{display:flex;align-items:center;justify-content:space-between;gap:8px}
.cff-doc-cab b{font-size:15px;font-weight:600;color:#0f172a}
.cff-doc-cab em{font-style:normal;font-size:12.5px}
.cff-doc-grade,.cff-dados-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 16px}
.cff-doc-grade span,.cff-dados-g span{display:flex;flex-direction:column;font-size:14px;color:#0f172a;min-width:0;overflow-wrap:anywhere}
.cff-doc-grade small,.cff-dados-g small{font-size:11.5px;color:#64748b}
.cff-doc-obs{margin:0;font-size:13px;color:#475569}
.cff-doc-arq{font-size:13px;color:#2563eb}
.cff-doc-arq.sem{color:#94a3b8}
.cff-doc.ok{background:#f0fdf4;color:#15803d !important}
.cff-doc.vencendo{background:#fffbeb;color:#b45309 !important}
.cff-doc.vencido{background:#fef2f2;color:#b91c1c !important}
.cff-doc.sem{background:#f1f5f9;color:#64748b !important}
@media (max-width:700px){.cff-topo{grid-template-columns:1fr}.cff-foto{width:100%;height:160px}.cff-l{grid-template-columns:1fr auto}.cff-l b{grid-column:1/-1;text-align:left}}
.cfr-wrap{display:flex;flex-direction:column;gap:16px;margin-bottom:18px}
.cfr-abas{display:flex;flex-wrap:wrap;gap:8px}
.ce .cfr-abas button{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border:1px solid #e2e8f0;border-radius:12px;background:#fefefe;color:#334155;font-family:inherit;font-size:14.5px;cursor:pointer}
.ce .cfr-abas button:hover{border-color:#94a3b8}
.ce .cfr-abas button.on{background:#ecfeff;border-color:#67e8f9;color:#0e7490;font-weight:500}
.cfr-g{height:240px}
.cfr-mini-c{display:flex;align-items:center;gap:10px;min-width:0}
.cfr-mini-f{width:46px;height:34px;flex:none;border-radius:8px;background:#f8fafc;border:1px solid #eef2f7;display:grid;place-items:center;overflow:hidden;color:#94a3b8;font-size:14px}
.cfr-mini-f img{width:100%;height:100%;object-fit:contain;padding:2px}
.cfr-mini-t{display:flex;flex-direction:column;min-width:0}
.cfr-mini-t b{font-size:13.5px;font-weight:500;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cfr-mini-t small{font-size:11.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cfr-man-l{display:grid;grid-template-columns:minmax(200px,1.1fr) minmax(220px,1.6fr) 90px 100px 100px;align-items:center;gap:14px;padding:10px 6px;border-bottom:1px solid #f1f5f9;cursor:pointer}
.cfr-man-l:hover{background:#f8fafc}
.cfr-man-o{display:flex;flex-direction:column;min-width:0;font-size:14px;color:#0f172a}
.cfr-man-o small{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cfr-man-dt{font-size:13px;color:#475569}
.cfr-man-st em{font-style:normal;font-size:12px}
.cfr-man-v{text-align:right;font-weight:500;font-variant-numeric:tabular-nums;color:#0f172a}
.cfr-man-sv{font-size:12px;font-weight:400;color:#d97706}
@media (max-width:800px){.cfr-man-l{grid-template-columns:1fr auto;gap:6px 10px}.cfr-man-o{grid-column:1/-1}.cfr-man-st{display:none}}
.cfr-prev{display:flex;flex-direction:column;gap:6px}
.cfr-prev-it{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;font-size:13.5px;color:#0f172a}
.cfr-prev-it span{display:flex;flex-direction:column;min-width:0}
.cfr-prev-it small{font-size:12px;color:#64748b}
.cfr-prev-it em{font-style:normal;font-size:12px}
.cfr-prev-mais{font-size:12px;color:#94a3b8}
.cfr-cruz{display:grid;grid-template-columns:minmax(90px,1fr) 80px 70px 50px;align-items:center;gap:10px;padding:9px 6px;border-bottom:1px solid #f1f5f9}
.cfr-cruz.alerta{background:#fffbeb;border-radius:10px}
.cfr-cruz-c{display:flex;flex-direction:column;font-size:14px;color:#0f172a}
.cfr-cruz-c small{font-size:12px;color:#64748b}
.cfr-cruz-n{display:flex;flex-direction:column;align-items:flex-end}
.cfr-cruz-n b{font-size:14px;font-weight:500;color:#0f172a;font-variant-numeric:tabular-nums}
.cfr-cruz-n small{font-size:11px;color:#94a3b8}
.cfr-cruz em{grid-column:1/-1;font-style:normal;font-size:12.5px;color:#b45309}
.cfr-cruz em.ok{display:none}
.cfr-busca-linha{display:flex;justify-content:flex-start;margin-bottom:10px}
.cfr-busca-linha .cpf-busca{margin-left:0;min-width:300px}
@media (max-width:700px){.cfr-busca-linha .cpf-busca{min-width:0;width:100%}}
.cfr-kml{font-size:13.5px;color:#0f172a}
.cfr-kml small{margin-left:6px;color:#64748b}
.cfr-pend-lista{display:flex;flex-direction:column;gap:6px}
.cfr-pend-it{font-size:13.5px;color:#0f172a;background:#fffbeb;border-radius:10px;padding:7px 10px}
.cfr-pend-it span{display:flex;flex-direction:column}
.cfr-pend-it small{font-size:12px;color:#92400e}
.cfr-pend-it.tem{cursor:pointer}
.cfr-pend-it.tem:hover{box-shadow:inset 0 0 0 1px #fcd34d}
.ce .cfr-pend{cursor:default}

.cfr{display:flex;flex-direction:column;gap:18px;margin-bottom:18px}
.cfr-mapa{position:relative;z-index:0;width:100%;height:min(62vh,560px);min-height:380px;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0}
.cfr-resto{margin-top:14px;border:1px solid #e2e8f0;border-radius:16px;padding:4px 14px 14px;background:#f8fafc}
.cfr-resto summary{list-style:none;cursor:pointer;padding:10px 0;font-size:14.5px;color:#334155;display:flex;align-items:center;gap:8px}
.cfr-resto summary::-webkit-details-marker{display:none}
.cfr-resto summary i{font-size:11px;color:#94a3b8;transition:transform .2s}
.cfr-resto[open] summary i{transform:rotate(90deg)}
.cfr-resto summary b{font-weight:600;color:#0f172a}
.cfr-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:10px}
.cfr-card.on{border-color:#93c5fd;box-shadow:0 0 0 3px #eff6ff}
.cfr-fora{position:fixed;inset:0;z-index:4;cursor:default}
.cfr-card{position:relative;cursor:pointer;transition:border-color .15s;display:flex;flex-direction:column;gap:10px;background:#fefefe;border:1px solid #e2e8f0;border-radius:18px;padding:14px}
.ce .cfr-card-bt{display:grid;grid-template-columns:96px 1fr;gap:12px;align-items:center;cursor:pointer;text-align:left;font-family:inherit}
.cfr-foto{width:96px;height:68px;border-radius:12px;background:#f8fafc;border:1px solid #eef2f7;display:grid;place-items:center;overflow:hidden;color:#94a3b8;font-size:22px}
.cfr-foto img{width:100%;height:100%;object-fit:contain;padding:3px}
.cfr-info{display:flex;flex-direction:column;min-width:0}
.cfr-info b{font-size:16px;font-weight:600;color:#0f172a;letter-spacing:.02em}
.cfr-info span{font-size:13.5px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cfr-info small{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cfr-onde{display:flex;flex-direction:column;gap:4px}
.cfr-st{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;padding:3px 10px;border-radius:99px}
.cfr-st i{width:8px;height:8px;border-radius:99px}
.cfr-st-sem{background:#f1f5f9;color:#64748b}
.cfr-local{font-size:13px;color:#334155;line-height:1.35}
.cfr-local small{margin-left:6px;color:#94a3b8}
.cfr-alertas{display:flex;flex-wrap:wrap;gap:6px}
.cfr-alertas span{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#b45309;background:#fffbeb;border-radius:8px;padding:3px 8px}
.cfr-ok{font-size:12.5px;color:#15803d}
.cfr-menu{position:absolute;top:84px;left:14px;right:14px;z-index:5;display:flex;flex-direction:column;background:#fefefe;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 16px 40px -14px rgba(15,23,42,.45);overflow:hidden}
.ce .cfr-menu button{display:flex;align-items:center;gap:10px;padding:12px 14px;font-family:inherit;font-size:14px;color:#0f172a;cursor:pointer;text-align:left;border-bottom:1px solid #f1f5f9}
.ce .cfr-menu button:last-child{border-bottom:0}
.ce .cfr-menu button:hover:not(:disabled){background:#f8fafc}
.ce .cfr-menu button:disabled{color:#94a3b8;cursor:default}
.cfr-menu i{width:16px;color:#2563eb}
.cfr-menu small{margin-left:auto;font-size:12px;color:#94a3b8}
.cfr-local i{color:#94a3b8;font-size:11px}
.cfr-local b{font-weight:600}
.ce .cfr-ficha{align-self:flex-start;font-size:13px;color:#2563eb;cursor:pointer;font-family:inherit;margin-top:auto}
@media (max-width:700px){.cfr-mapa{height:420px}.cfr-grade{grid-template-columns:1fr}}
`
