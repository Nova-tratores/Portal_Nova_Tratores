'use client'
// Casa de Máquinas (26/11/2026, José): substitui a tela de Agendamentos como entrada. "Algo mais elaborado onde você vai
// clicando e vai aparecendo", "cadê os logs de cada engine", "cadê algo mais industrial", "pra gente editar os horários",
// "sem neon e sem modo escuro". Três níveis: a casa (salas = módulos) → a sala (máquinas = agendamentos) → a ficha
// (placa + botoeira de comando + log em formulário contínuo). Dados ao vivo de /api/agendador e /api/agendador/historico.
// Mexer (rodar, pausar, horário, marcar) continua só para Dev — a rota confere; as janelas são as da TabelaAgendamentos.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Package, Wrench, Banknote, Hammer, FolderOpen, Truck, TrendingUp, Megaphone, CalendarDays, Shield, Cog, Github,
  ChevronRight, Home, Play, Pause, PlayCircle, Clock, CalendarClock, Loader2, type LucideIcon,
} from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import type { AgendamentoPainel, Painel, Rodada } from './tipos'
import { duracao, horaSP, quemDisparou, statusInfo, tempoRelativo } from './tipos'
import { ModalHorario, ModalMarcar, ModalPausar } from './TabelaAgendamentos'

// ---------------------------------------------------------------- estado de cada máquina
type Estado = 'falha' | 'rodando' | 'pausa' | 'espera' | 'nova' | 'ok' | 'semcodigo'
const EST: Record<Estado, { nome: string; lamp: string; ordem: number }> = {
  falha:     { nome: 'Com problema',        lamp: '#d62828', ordem: 0 },
  semcodigo: { nome: 'Sem robô no código',  lamp: '#8d5a00', ordem: 1 },
  rodando:   { nome: 'Rodando agora',       lamp: '#1f6feb', ordem: 2 },
  espera:    { nome: 'Esperando a Omie',    lamp: '#e0a100', ordem: 3 },
  pausa:     { nome: 'Pausada',             lamp: '#e0a100', ordem: 4 },
  nova:      { nome: 'Ainda não rodou',     lamp: '#9aa0a6', ordem: 5 },
  ok:        { nome: 'Funcionando',         lamp: '#2e9b4f', ordem: 6 },
}
function estadoDe(a: AgendamentoPainel): Estado {
  if (a.rodandoAgora) return 'rodando'
  if (!a.tarefaExiste) return 'semcodigo'
  if (!a.ativo || a.pausado_por) return 'pausa'
  const s = a.ultima?.status
  if (s && ['erro', 'interrompida', 'bloqueio'].includes(s)) return 'falha'
  if (s === 'aguardando_omie') return 'espera'
  if (!a.ultima) return 'nova'
  return 'ok'
}

// ---------------------------------------------------------------- salas (módulo do agendamento)
const ICONES: [RegExp, LucideIcon][] = [
  [/estoque|peç|compra|ppv/i, Package], [/ajuste|cadastro|fiscal/i, Wrench], [/financ|dre|cobran|caixa/i, Banknote],
  [/p[óo]s|garant|revis|oficina|os\b/i, Hammer], [/client|pasta/i, FolderOpen], [/frota|ve[íi]cul/i, Truck],
  [/comercial|vend|diretor|supervisor/i, TrendingUp], [/marketing|redes|post/i, Megaphone],
  [/central|reuni|pop|ticket|requisi/i, CalendarDays], [/sistema|vigia|seguran|aviso/i, Shield], [/github/i, Github],
]
const iconeDa = (nome: string) => ICONES.find(([r]) => r.test(nome))?.[1] || Cog
const salaDe = (a: AgendamentoPainel) => (a.origem === 'github' ? 'Ainda pelo GitHub' : a.modulo?.trim() || 'Outros')

// ---------------------------------------------------------------- comandos (mesma rota da tabela)
async function comando(corpo: Record<string, unknown>) {
  const r = await fetch('/api/agendador', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo) })
  const d = await r.json().catch(() => ({}))
  return r.ok ? { ok: true as const } : { ok: false as const, erro: d.error || `Erro ${r.status}` }
}

type Vista = { nivel: 'casa' } | { nivel: 'sala'; sala: string } | { nivel: 'maquina'; chave: string } | { nivel: 'estado'; estado: Estado }

export default function CasaDeMaquinas({ painel, aoMudar }: { painel: Painel; aoMudar: () => void }) {
  const [vista, setVista] = useState<Vista>({ nivel: 'casa' })
  const ir = (v: Vista) => { setVista(v); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const maquinas = useMemo(() => painel.agendamentos
    .filter((a) => a.tipo !== 'uma_vez' || a.executar_em)
    .map((a) => ({ a, estado: estadoDe(a), sala: salaDe(a) }))
    .sort((x, y) => EST[x.estado].ordem - EST[y.estado].ordem || x.a.nome.localeCompare(y.a.nome, 'pt-BR')), [painel.agendamentos])
  const salas = useMemo(() => {
    const m = new Map<string, typeof maquinas>()
    for (const x of maquinas) m.set(x.sala, [...(m.get(x.sala) || []), x])
    return [...m.entries()].sort((a, b) => (a[0] === 'Ainda pelo GitHub' ? 1 : b[0] === 'Ainda pelo GitHub' ? -1 : b[1].length - a[1].length))
  }, [maquinas])
  const conta = (e: Estado) => maquinas.filter((x) => x.estado === e).length

  // caminho (sempre no topo)
  const atual = vista.nivel === 'maquina' ? maquinas.find((x) => x.a.chave === vista.chave) : null
  const caminho = (
    <nav className="cm-caminho" aria-label="Onde você está">
      <button onClick={() => ir({ nivel: 'casa' })} disabled={vista.nivel === 'casa'}><Home size={15} /> Casa de Máquinas</button>
      {vista.nivel === 'sala' && <><ChevronRight size={14} /><span>{vista.sala}</span></>}
      {vista.nivel === 'estado' && <><ChevronRight size={14} /><span>{EST[vista.estado].nome}</span></>}
      {atual && <><ChevronRight size={14} /><button onClick={() => ir({ nivel: 'sala', sala: atual.sala })}>{atual.sala}</button><ChevronRight size={14} /><span>{atual.a.nome}</span></>}
    </nav>
  )

  return (
    <div className="cm">
      <style>{CSS}</style>
      {caminho}

      {vista.nivel === 'casa' && (
        <>
          <section className="cm-medidores">
            {(['falha', 'rodando', 'pausa', 'semcodigo', 'ok'] as Estado[]).map((e) => (
              <button key={e} className="cm-medidor" onClick={() => conta(e) && ir({ nivel: 'estado', estado: e })} disabled={!conta(e)}>
                <span className="cm-lamp" style={{ background: EST[e].lamp }} />
                <b>{String(conta(e)).padStart(2, '0')}</b>
                <span>{EST[e].nome}</span>
              </button>
            ))}
          </section>
          <p className="cm-intro">São <b>{maquinas.length} máquinas</b> trabalhando sozinhas, divididas em {salas.length} salas. Toque numa sala para entrar.</p>
          <section className="cm-casa">
            {salas.map(([nome, ms], i) => {
              const Ic = iconeDa(nome)
              const prob = ms.filter((x) => x.estado === 'falha' || x.estado === 'semcodigo').length
              return (
                <button key={nome} className={`cm-sala${prob ? ' cm-alerta' : ''}`} onClick={() => ir({ nivel: 'sala', sala: nome })}>
                  {prob > 0 && <span className="cm-faixa" aria-hidden="true" />}
                  <span className="cm-tag">SETOR {String(i + 1).padStart(2, '0')}</span>
                  <span className="cm-sala-ic"><Ic size={26} /></span>
                  <span className="cm-sala-nome">{nome}</span>
                  <span className="cm-lamps">{ms.map((x) => <i key={x.a.chave} style={{ background: EST[x.estado].lamp }} title={`${x.a.nome}: ${EST[x.estado].nome}`} />)}</span>
                  <span className="cm-sala-pe">
                    <span>{ms.length} máquina{ms.length > 1 ? 's' : ''}</span>
                    {prob > 0 ? <b className="cm-perigo">{prob} com problema</b> : <span className="cm-ok">em ordem</span>}
                  </span>
                  <i className="cm-rebite a" /><i className="cm-rebite b" /><i className="cm-rebite c" /><i className="cm-rebite d" />
                </button>
              )
            })}
          </section>
        </>
      )}

      {(vista.nivel === 'sala' || vista.nivel === 'estado') && (() => {
        const lista = vista.nivel === 'sala' ? maquinas.filter((x) => x.sala === vista.sala) : maquinas.filter((x) => x.estado === vista.estado)
        const titulo = vista.nivel === 'sala' ? vista.sala : EST[vista.estado].nome
        const Ic = vista.nivel === 'sala' ? iconeDa(vista.sala) : Cog
        return (
          <>
            <header className="cm-cabeca">
              <span className="cm-sala-ic grande"><Ic size={34} /></span>
              <div><span className="cm-tag">{vista.nivel === 'sala' ? 'SETOR' : 'FILTRO'}</span><h3>{titulo}</h3><p>{lista.length} máquina{lista.length > 1 ? 's' : ''}. Toque numa para abrir a ficha, o log e os comandos.</p></div>
            </header>
            <section className="cm-placas">
              {lista.map(({ a, estado, sala }) => (
                <button key={a.chave} className="cm-placa" onClick={() => ir({ nivel: 'maquina', chave: a.chave })}>
                  <span className="cm-placa-topo"><span className="cm-lamp" style={{ background: EST[estado].lamp }} /><span className="cm-estado">{EST[estado].nome}</span>{a.usa_omie && <span className="cm-chip">OMIE</span>}</span>
                  <span className="cm-placa-nome">{a.nome}</span>
                  {vista.nivel === 'estado' && <span className="cm-campo"><em>SETOR</em>{sala}</span>}
                  <span className="cm-campo"><em>CICLO</em>{a.quando}</span>
                  <span className="cm-campo"><em>ÚLTIMA</em>{a.ultima ? `${tempoRelativo(a.ultima.iniciado_em)} · ${statusInfo(a.ultima.status).rotulo}` : '—'}</span>
                </button>
              ))}
            </section>
          </>
        )
      })()}

      {vista.nivel === 'maquina' && atual && <Ficha m={atual} podeAlterar={painel.podeAlterar} aoMudar={aoMudar} vizinhas={maquinas.filter((x) => x.sala === atual.sala && x.a.chave !== atual.a.chave)} abrir={(chave) => ir({ nivel: 'maquina', chave })} />}
      {vista.nivel === 'maquina' && !atual && <p className="cm-intro">Esta máquina não existe mais. <button className="cm-link" onClick={() => ir({ nivel: 'casa' })}>Voltar</button></p>}
    </div>
  )
}

// ---------------------------------------------------------------- ficha da máquina
function Ficha({ m, podeAlterar, aoMudar, vizinhas, abrir }: {
  m: { a: AgendamentoPainel; estado: Estado; sala: string }; podeAlterar: boolean; aoMudar: () => void
  vizinhas: { a: AgendamentoPainel; estado: Estado }[]; abrir: (chave: string) => void
}) {
  const { a, estado } = m
  const [log, setLog] = useState<Rodada[] | null>(null)
  const [erroLog, setErroLog] = useState('')
  const [modal, setModal] = useState<'' | 'pausar' | 'horario' | 'marcar'>('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const carregarLog = useCallback(async () => {
    try {
      const r = await fetch(`/api/agendador/historico?job=${encodeURIComponent(a.chave)}&dias=30&limite=60`, { headers: await authHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      setLog(d.rodadas || []); setErroLog('')
    } catch (e) { setErroLog((e as Error).message) }
  }, [a.chave])
  useEffect(() => { carregarLog() }, [carregarLog, a.ultima?.id])

  async function executar(corpo: Record<string, unknown>, okTexto: string) {
    setOcupado(true); setAviso(null)
    const r = await comando({ chave: a.chave, ...corpo })
    setOcupado(false)
    setAviso(r.ok ? { ok: true, texto: okTexto } : { ok: false, texto: r.erro })
    if (r.ok) { setModal(''); aoMudar(); setTimeout(carregarLog, 1500) }
  }

  const pausada = !a.ativo || !!a.pausado_por
  const okRodadas = (log || []).filter((r) => r.status === 'ok').length

  return (
    <div className="cm-ficha">
      <section className="cm-plaqueta">
        <span className="cm-faixa fina" aria-hidden="true" style={{ display: estado === 'falha' ? 'block' : 'none' }} />
        <div className="cm-plaqueta-topo">
          <span className="cm-lamp grande" style={{ background: EST[estado].lamp }} />
          <div style={{ minWidth: 0 }}>
            <span className="cm-tag">{m.sala.toUpperCase()} · {a.chave}</span>
            <h3>{a.nome}</h3>
            <p>{a.descricao || 'Sem descrição cadastrada.'}</p>
          </div>
        </div>
        <dl className="cm-dados">
          <div><dt>Estado</dt><dd>{EST[estado].nome}{pausada && a.pausado_motivo ? ` (${a.pausado_motivo})` : ''}</dd></div>
          <div><dt>Ciclo</dt><dd>{a.quando}</dd></div>
          <div><dt>Próxima</dt><dd>{a.proxima ? `${horaSP(a.proxima, true)} (${tempoRelativo(a.proxima)})` : '—'}</dd></div>
          <div><dt>Última</dt><dd>{a.ultima ? `${horaSP(a.ultima.iniciado_em, true)} · ${statusInfo(a.ultima.status).rotulo}` : 'nunca rodou'}</dd></div>
          <div><dt>Usa a Omie</dt><dd>{a.usa_omie ? `sim${a.grupo ? ` · fila ${a.grupo}` : ''}` : 'não'}</dd></div>
          <div><dt>Tempo máximo</dt><dd>{a.duracao_max_min} min</dd></div>
        </dl>
      </section>

      <section className="cm-botoeira" aria-label="Comandos">
        <span className="cm-tag">COMANDOS {podeAlterar ? '' : '· SÓ O PERFIL DEV ALTERA'}</span>
        <div className="cm-botoes">
          <button className="cm-bt verde" disabled={!podeAlterar || ocupado || !!a.rodandoAgora} onClick={() => executar({ acao: 'rodar' }, 'Mandei rodar. O log atualiza em instantes.')}>
            {ocupado ? <Loader2 size={20} className="cm-gira" /> : <Play size={20} />}<span>Rodar agora</span></button>
          {pausada
            ? <button className="cm-bt verde-claro" disabled={!podeAlterar || ocupado} onClick={() => executar({ acao: 'retomar' }, 'Máquina religada.')}><PlayCircle size={20} /><span>Retomar</span></button>
            : <button className="cm-bt amarelo" disabled={!podeAlterar || ocupado} onClick={() => setModal('pausar')}><Pause size={20} /><span>Pausar</span></button>}
          <button className="cm-bt cinza" disabled={!podeAlterar || ocupado || a.tipo === 'uma_vez'} onClick={() => setModal('horario')}><Clock size={20} /><span>Mudar horário</span></button>
          <button className="cm-bt cinza" disabled={!podeAlterar || ocupado} onClick={() => setModal('marcar')}><CalendarClock size={20} /><span>Rodar uma vez em…</span></button>
        </div>
        {aviso && <p className={aviso.ok ? 'cm-ok' : 'cm-perigo'}>{aviso.texto}</p>}
      </section>

      <section className="cm-log">
        <div className="cm-log-topo">
          <span className="cm-tag">REGISTRO · ÚLTIMOS 30 DIAS</span>
          <span>{log ? `${log.length} execuções · ${okRodadas} ok` : 'carregando…'}</span>
        </div>
        {erroLog && <p className="cm-perigo">{erroLog}</p>}
        <div className="cm-papel" role="table" aria-label="Execuções">
          {(log || []).map((r) => {
            const s = statusInfo(r.status)
            return (
              <div key={r.id} className="cm-linha" role="row">
                <span className="cm-l-data" role="cell">{horaSP(r.iniciado_em, true)}</span>
                <span className="cm-l-st" role="cell" style={{ color: s.cor }}>{s.rotulo.toUpperCase()}</span>
                <span className="cm-l-dur" role="cell">{r.status === 'rodando' ? '…' : duracao(r.duracao_ms)}</span>
                <span className="cm-l-quem" role="cell">{quemDisparou(r)}</span>
                <span className="cm-l-det" role="cell">{r.detalhe || '—'}</span>
              </div>
            )
          })}
          {log && !log.length && <div className="cm-linha"><span className="cm-l-det">Nenhuma execução nos últimos 30 dias.</span></div>}
        </div>
      </section>

      {vizinhas.length > 0 && (
        <section className="cm-vizinhas">
          <span className="cm-tag">OUTRAS MÁQUINAS DESTE SETOR</span>
          <div>{vizinhas.map((v) => <button key={v.a.chave} onClick={() => abrir(v.a.chave)}><span className="cm-lamp" style={{ background: EST[v.estado].lamp }} />{v.a.nome}</button>)}</div>
        </section>
      )}

      {modal === 'pausar' && <ModalPausar ag={a} fechar={() => setModal('')} confirmar={(motivo) => executar({ acao: 'pausar', motivo }, 'Máquina pausada.')} />}
      {modal === 'horario' && <ModalHorario ag={a} fechar={() => setModal('')} confirmar={(c) => executar({ acao: 'alterar', ...c }, 'Horário alterado.')} />}
      {modal === 'marcar' && <ModalMarcar ag={a} fechar={() => setModal('')} confirmar={(iso) => executar({ acao: 'marcar', executar_em: iso }, 'Marcado para rodar uma vez.')} />}
    </div>
  )
}

// ---------------------------------------------------------------- estilo: chão de fábrica (claro, sem brilho)
const CSS = `
.cm { --cm-chao: #ecebe7; --cm-chapa: #f8f7f4; --cm-chapa2: #efeee9; --cm-borda: #c6c3bb; --cm-borda2: #dedbd3; --cm-tx: #1d1f22; --cm-tx2: #4c5057; --cm-tx3: #767a80;
  --cm-amarelo: #f2b705; --cm-preto: #1d1f22; --cm-verde: #2e7d4f; --cm-vermelho: #b3261e; --cm-azul: #1f5fbf;
  --cm-mono: "IBM Plex Mono", ui-monospace, Consolas, monospace; --cm-tit: "Barlow Condensed", "Arial Narrow", "Roboto Condensed", Arial, sans-serif;
  display: grid; gap: 18px; color: var(--cm-tx); background: var(--cm-chao); border-radius: 14px; padding: clamp(12px, 2vw, 22px);
  background-image: radial-gradient(#0000000d 1px, transparent 1.2px); background-size: 14px 14px }
.cm button { font: inherit; color: inherit }
.cm-tag { font: 600 11px var(--cm-mono); letter-spacing: .12em; color: var(--cm-tx3); text-transform: uppercase }
.cm-lamp { width: 13px; height: 13px; border-radius: 50%; display: inline-block; flex: none; box-shadow: inset 0 -2px 0 #0003, 0 0 0 2px #fff, 0 0 0 3px #9a978f }
.cm-lamp.grande { width: 26px; height: 26px; box-shadow: inset 0 -4px 0 #0003, 0 0 0 3px #fff, 0 0 0 5px #8f8c84 }
.cm-perigo { color: var(--cm-vermelho); font-weight: 600 } .cm-ok { color: var(--cm-verde); font-weight: 600 }
.cm-link { background: none; border: 0; color: var(--cm-azul); text-decoration: underline; cursor: pointer }
.cm-intro { margin: 0; font-size: 15px; color: var(--cm-tx2) }

.cm-caminho { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font: 600 13px var(--cm-mono); text-transform: uppercase; letter-spacing: .05em; color: var(--cm-tx3) }
.cm-caminho button { display: inline-flex; align-items: center; gap: 6px; background: var(--cm-chapa); border: 1px solid var(--cm-borda); border-radius: 4px; padding: 5px 10px; cursor: pointer; color: var(--cm-azul) }
.cm-caminho button:disabled { color: var(--cm-tx); cursor: default }
.cm-caminho span { color: var(--cm-tx); padding: 5px 4px }

/* mostradores: visor de painel (fundo cinza, dígitos pretos) */
.cm-medidores { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px }
.cm-medidor { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; text-align: left; cursor: pointer;
  background: linear-gradient(180deg, #f6f5f1, #e6e4de); border: 1px solid var(--cm-borda); border-radius: 6px; padding: 10px 12px; box-shadow: inset 0 1px 0 #fff, 0 1px 0 #0000000f }
.cm-medidor:disabled { opacity: .55; cursor: default }
.cm-medidor .cm-lamp { grid-row: 1 / 3 }
.cm-medidor b { font: 600 30px var(--cm-mono); line-height: 1; background: #d9dccf; color: #23261f; border: 1px solid #b9bcae; border-radius: 3px; padding: 2px 6px; justify-self: start; letter-spacing: .04em; box-shadow: inset 0 1px 3px #0002 }
.cm-medidor > span:last-child { font: 600 11px var(--cm-mono); text-transform: uppercase; letter-spacing: .08em; color: var(--cm-tx2); margin-top: 4px }
.cm-medidor:not(:disabled):hover { border-color: #8f8c84 }

/* a casa: chapas de aço com rebites */
.cm-casa { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); gap: 14px }
.cm-sala { position: relative; display: grid; gap: 10px; align-content: start; text-align: left; cursor: pointer; padding: 26px 18px 16px; min-height: 196px;
  background: linear-gradient(160deg, var(--cm-chapa), var(--cm-chapa2)); border: 1px solid var(--cm-borda); border-radius: 6px;
  box-shadow: inset 0 0 0 5px var(--cm-chapa), inset 0 0 0 6px var(--cm-borda2), 0 2px 0 #00000012; transition: transform .15s, box-shadow .15s }
.cm-sala:hover, .cm-sala:focus-visible { transform: translateY(-2px); box-shadow: inset 0 0 0 5px var(--cm-chapa), inset 0 0 0 6px #a9a59c, 0 6px 14px #0000001a; outline: none }
.cm-sala .cm-tag { position: absolute; top: 10px; left: 16px }
.cm-faixa { position: absolute; left: 0; right: 0; top: 0; height: 8px; border-radius: 6px 6px 0 0; background: repeating-linear-gradient(-45deg, var(--cm-amarelo) 0 10px, var(--cm-preto) 10px 20px) }
.cm-faixa.fina { height: 7px; border-radius: 0 }
.cm-sala.cm-alerta .cm-tag { top: 14px }
.cm-sala-ic { width: 46px; height: 46px; border-radius: 6px; display: grid; place-items: center; color: var(--cm-tx); background: linear-gradient(180deg, #fff, #e4e2dc); border: 1px solid var(--cm-borda); margin-top: 8px }
.cm-sala-ic.grande { width: 64px; height: 64px; margin: 0 }
.cm-sala-nome { font: 700 22px/1.1 var(--cm-tit); text-transform: uppercase; letter-spacing: .02em }
.cm-lamps { display: flex; flex-wrap: wrap; gap: 5px }
.cm-lamps i { width: 10px; height: 10px; border-radius: 50%; box-shadow: inset 0 -2px 0 #0003, 0 0 0 1.5px #fff, 0 0 0 2.5px #a19e96 }
.cm-sala-pe { display: flex; justify-content: space-between; gap: 8px; font: 600 12px var(--cm-mono); text-transform: uppercase; letter-spacing: .04em; color: var(--cm-tx3); margin-top: auto }
.cm-rebite { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff, #b3afa6 60%, #8f8b82); }
.cm-rebite.a { top: 8px; right: 8px } .cm-rebite.b { bottom: 8px; right: 8px } .cm-rebite.c { bottom: 8px; left: 8px } .cm-rebite.d { display: none }

/* sala aberta */
.cm-cabeca { display: flex; gap: 16px; align-items: center; background: linear-gradient(160deg, var(--cm-chapa), var(--cm-chapa2)); border: 1px solid var(--cm-borda); border-radius: 6px; padding: 16px 18px; box-shadow: inset 0 0 0 5px var(--cm-chapa), inset 0 0 0 6px var(--cm-borda2) }
.cm-cabeca h3 { margin: 2px 0 4px; font: 700 clamp(26px, 4vw, 34px)/1 var(--cm-tit); text-transform: uppercase }
.cm-cabeca p { margin: 0; color: var(--cm-tx2); font-size: 14px }

/* máquinas: placas de identificação */
.cm-placas { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: 12px }
.cm-placa { display: grid; gap: 6px; text-align: left; cursor: pointer; padding: 12px 14px 14px; border-radius: 5px; border: 1px solid #b9b6ae;
  background: linear-gradient(180deg, #fbfbf9, #ecebe6); box-shadow: inset 0 1px 0 #fff, 0 1px 0 #0000000f; transition: transform .15s, border-color .15s }
.cm-placa:hover, .cm-placa:focus-visible { transform: translateY(-2px); border-color: #7f7c74; outline: none }
.cm-placa-topo { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 1px dashed var(--cm-borda) }
.cm-estado { font: 600 11px var(--cm-mono); text-transform: uppercase; letter-spacing: .08em; color: var(--cm-tx2) }
.cm-chip { margin-left: auto; font: 600 10px var(--cm-mono); letter-spacing: .1em; padding: 1px 6px; border: 1px solid #c58b00; color: #8a6100; border-radius: 3px; background: #fff7dc }
.cm-placa-nome { font: 700 19px/1.15 var(--cm-tit); text-transform: uppercase; letter-spacing: .01em }
.cm-campo { display: grid; grid-template-columns: 64px 1fr; gap: 6px; font-size: 13px; color: var(--cm-tx2) }
.cm-campo em { font: 600 10.5px var(--cm-mono); font-style: normal; letter-spacing: .1em; color: var(--cm-tx3); padding-top: 2px }

/* ficha */
.cm-ficha { display: grid; gap: 14px }
.cm-plaqueta { position: relative; overflow: hidden; background: linear-gradient(160deg, #fbfbf9, #e9e7e1); border: 1px solid #b2aea5; border-radius: 6px; padding: 20px; display: grid; gap: 16px; box-shadow: inset 0 0 0 6px #f6f5f1, inset 0 0 0 7px var(--cm-borda2) }
.cm-plaqueta .cm-faixa { position: absolute }
.cm-plaqueta-topo { display: flex; gap: 16px; align-items: flex-start }
.cm-plaqueta-topo .cm-lamp { margin-top: 10px }
.cm-plaqueta h3 { margin: 4px 0 6px; font: 700 clamp(28px, 4.5vw, 42px)/1 var(--cm-tit); text-transform: uppercase }
.cm-plaqueta p { margin: 0; color: var(--cm-tx2); max-width: 70ch }
.cm-dados { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0; margin: 0; border-top: 2px solid var(--cm-tx); }
.cm-dados div { padding: 10px 12px 10px 0; border-bottom: 1px solid var(--cm-borda2) }
.cm-dados dt { font: 600 10.5px var(--cm-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--cm-tx3) }
.cm-dados dd { margin: 2px 0 0; font-weight: 600; font-size: 15px }

/* botoeira */
.cm-botoeira { background: #dedcd5; border: 1px solid #b2aea5; border-radius: 6px; padding: 14px 16px; display: grid; gap: 10px; box-shadow: inset 0 2px 4px #0000000f }
.cm-botoes { display: flex; flex-wrap: wrap; gap: 10px }
.cm-bt { display: inline-flex; align-items: center; gap: 8px; padding: 12px 16px; min-height: 48px; border-radius: 6px; cursor: pointer; font-weight: 700 !important; text-transform: uppercase; letter-spacing: .04em; font-size: 14px !important;
  border: 1px solid #0003; box-shadow: inset 0 1px 0 #ffffff66, 0 3px 0 #00000033; transition: transform .08s, box-shadow .08s }
.cm-bt:active:not(:disabled) { transform: translateY(2px); box-shadow: inset 0 1px 0 #ffffff44, 0 1px 0 #00000033 }
.cm-bt:disabled { opacity: .45; cursor: not-allowed }
.cm-bt.verde { background: #2e7d4f; color: #fff !important } .cm-bt.verde-claro { background: #d7eedf; color: #1f5a37 !important }
.cm-bt.amarelo { background: var(--cm-amarelo); color: #1d1f22 !important } .cm-bt.cinza { background: #f7f6f2; color: #1d1f22 !important }
.cm-gira { animation: cm-gira 1s linear infinite } @keyframes cm-gira { to { transform: rotate(360deg) } }

/* log: formulário contínuo de impressora */
.cm-log { display: grid; gap: 8px }
.cm-log-topo { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font: 12px var(--cm-mono); color: var(--cm-tx2) }
.cm-papel { position: relative; background: #fffef8; border: 1px solid #cfccc2; border-radius: 3px; max-height: 460px; overflow: auto; padding: 0 28px;
  background-image: repeating-linear-gradient(180deg, #fffef8 0 34px, #e9f3e6 34px 68px),
    radial-gradient(circle at 12px 17px, #ecebe7 5px, transparent 5.5px), radial-gradient(circle at calc(100% - 12px) 17px, #ecebe7 5px, transparent 5.5px);
  background-size: 100% 68px, 100% 34px, 100% 34px; background-repeat: repeat, repeat-y, repeat-y; font: 12.5px/1.35 var(--cm-mono) }
.cm-linha { display: grid; grid-template-columns: 112px 118px 64px 150px minmax(0, 1fr); gap: 10px; min-height: 34px; align-items: center; padding: 6px 0 }
.cm-l-data { color: var(--cm-tx2) } .cm-l-st { font-weight: 600 } .cm-l-dur, .cm-l-quem { color: var(--cm-tx3) }
.cm-l-det { color: var(--cm-tx); white-space: pre-wrap; word-break: break-word }
@media (max-width: 760px) { .cm-linha { grid-template-columns: 1fr 1fr; } .cm-l-quem { display: none } .cm-l-det { grid-column: 1 / -1 } }

.cm-vizinhas { display: grid; gap: 8px }
.cm-vizinhas > div { display: flex; flex-wrap: wrap; gap: 8px }
.cm-vizinhas button { display: inline-flex; align-items: center; gap: 8px; padding: 7px 11px; border-radius: 4px; border: 1px solid var(--cm-borda); background: var(--cm-chapa); cursor: pointer; font-size: 13px }
.cm-vizinhas button:hover { border-color: #8f8c84 }
@media (prefers-reduced-motion: reduce) { .cm *, .cm { transition: none !important; animation: none !important } }
`
