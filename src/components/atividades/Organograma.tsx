'use client'
// Organograma (aba Processos de /atividades): pessoas do portal + RH, ligadas pelo chefe gravado
// em org_pessoas. Três modos: Árvore (chefes lado a lado, equipe sem subordinados em coluna),
// Tarefas (listas do Pós-vendas e do Mariano, por função → pessoa; lista e matriz) e Funções
// (admin diz quem é "Auxiliar Adm 1" etc.). Admin escolhe o chefe na janela da pessoa.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { RefreshCw, X, Crown, EyeOff, Eye, Network, ListChecks, Users } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { montarArvore, contarEquipe, criaCiclo, semAcento, type NoOrg, type PessoaOrg, type VinculoOrg } from '@/lib/organograma/arvore'
import { ligarFuncoes, tarefasPorPessoa, funcoesDaPessoa, tarefasSemPessoa, ORIGENS, type TarefaOrg, type FuncaoOrg, type LigacaoFuncao } from '@/lib/organograma/tarefas'
import css from './organograma.module.css'

type Resp = {
  pessoas: PessoaOrg[]; vinculos: VinculoOrg[]; migracaoFaltando: boolean; rhConfigurado: boolean; podeEditar: boolean
  tarefas: TarefaOrg[]; funcoes: FuncaoOrg[]; tarefasFaltando: boolean; error?: string
}

const CORES = ['#0369A1', '#B45309', '#047857', '#7C3AED', '#BE185D', '#0891B2', '#DC2626', '#4D7C0F', '#C2410C', '#475569']
function corDe(txt: string | null): string {
  if (!txt) return '#94a3b8'
  let h = 0
  for (const c of semAcento(txt)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return CORES[h % CORES.length]
}
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const primeiroNome = (nome: string) => nome.split(/\s+/)[0]

const card: React.CSSProperties = { background: 'var(--portal-bg-card)', borderRadius: '16px', border: '1px solid var(--portal-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
const titulo: React.CSSProperties = { fontSize: '15px', fontWeight: 800, color: 'var(--portal-text)', margin: '0 0 4px' }
const sub: React.CSSProperties = { fontSize: '12px', color: 'var(--portal-text-muted)', margin: 0 }
const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: '10px', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)', fontSize: '13px', fontFamily: 'Inter', outline: 'none' }
const rotuloSecao: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }

type Ctx = { sel: string | null; onSel: (c: string) => void; nTarefas: Map<string, number> }
const CtxOrg = createContext<Ctx>({ sel: null, onSel: () => {}, nTarefas: new Map() })

function Avatar({ p, tam = 36 }: { p: PessoaOrg; tam?: number }) {
  const [erro, setErro] = useState(false)
  if (p.foto && !erro) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.foto} alt="" className={css.avatar} style={{ width: tam, height: tam, flexBasis: tam }} onError={() => setErro(true)} />
  }
  return <span className={css.avatar} style={{ background: corDe(p.setor), width: tam, height: tam, flexBasis: tam }}>{iniciais(p.nome)}</span>
}

function Cartao({ n }: { n: NoOrg }) {
  const { sel, onSel, nTarefas } = useContext(CtxOrg)
  const p = n.pessoa
  const equipe = contarEquipe(n)
  const nt = nTarefas.get(p.chave) || 0
  return (
    <button type="button" onClick={() => onSel(p.chave)} className={`${css.cartao} ${sel === p.chave ? css.cartaoSel : ''}`} style={{ borderTop: `4px solid ${corDe(p.setor)}` }}>
      <div className={css.topoCartao}>
        <Avatar p={p} />
        <div style={{ minWidth: 0 }}>
          <div className={css.nome}>{p.nome}</div>
          <div className={css.cargo} title={[p.cargo, p.setor].filter(Boolean).join(' · ')}>{p.cargo || p.setor || '—'}</div>
        </div>
      </div>
      {p.cargo && p.setor && <div className={css.linhaInfo}>{p.setor}{p.empresa ? ` · ${p.empresa}` : ''}</div>}
      {p.pratica.length > 0 && <div className={css.linhaInfo} title="Onde mais registrou ações nos últimos 90 dias">Faz: {p.pratica.map(([s]) => s).join(', ')}</div>}
      <div className={css.selos}>
        {nt > 0 && <span className={css.selo} style={{ background: '#ede9fe', color: '#5b21b6' }}>{nt} tarefa{nt > 1 ? 's' : ''}</span>}
        {p.papeis.length > 0 && <span className={css.selo} style={{ background: '#fef3c7', color: '#92400e' }} title={p.papeis.join('\n')}>dono de {p.papeis.length}</span>}
        {equipe > 0 && <span className={css.selo} style={{ background: '#e0f2fe', color: '#075985' }}>equipe {equipe}</span>}
        {p.origem === 'rh' && <span className={css.selo} style={{ background: '#f1f5f9', color: '#475569' }} title="Está no RH, sem login no portal">sem login</span>}
      </div>
    </button>
  )
}

/** Quem tem equipe fica lado a lado; quem não tem ninguém abaixo vai para uma coluna só. */
function Ramo({ n }: { n: NoOrg }) {
  const chefes = n.filhos.filter((f) => f.filhos.length > 0)
  const folhas = n.filhos.filter((f) => f.filhos.length === 0)
  return (
    <li>
      <Cartao n={n} />
      {n.filhos.length > 0 && (
        <ul>
          {chefes.map((f) => <Ramo key={f.pessoa.chave} n={f} />)}
          {folhas.length > 0 && (
            <li>
              <div className={css.pilha}>{folhas.map((f) => <Cartao key={f.pessoa.chave} n={f} />)}</div>
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

function ChipsFuncao({ funcoes, ligacoes, pessoas }: { funcoes: string[]; ligacoes: Map<string, LigacaoFuncao>; pessoas: Map<string, PessoaOrg> }) {
  if (!funcoes.length) return <span style={{ color: 'var(--portal-text-muted)', fontSize: 12 }}>sem responsável na planilha</span>
  return (
    <>
      {funcoes.map((f) => {
        const ps = ligacoes.get(f)?.pessoas || []
        const nomes = ps.map((c) => pessoas.get(c)?.nome).filter(Boolean) as string[]
        return (
          <span key={f} className={css.chip} style={{ background: nomes.length ? '#e0f2fe' : '#fef3c7', color: nomes.length ? '#075985' : '#92400e' }}
            title={nomes.length ? `${f}: ${nomes.join(', ')}` : `${f}: ninguém definido ainda (aba Funções)`}>
            {f}{nomes.length ? ` · ${nomes.map(primeiroNome).join(', ')}` : ' · ?'}
          </span>
        )
      })}
    </>
  )
}

function Janela({ p, dados, salvando, erro, tarefas, funcoes, onFechar, onSalvar }: {
  p: PessoaOrg; dados: Resp; salvando: boolean; erro: string; tarefas: TarefaOrg[]; funcoes: string[]
  onFechar: () => void; onSalvar: (m: Partial<VinculoOrg>) => Promise<boolean>
}) {
  const v = dados.vinculos.find((x) => x.pessoa_chave === p.chave)
  const chefeAtual = v?.topo ? '__topo' : (v?.gestor_chave || '')
  const [cargo, setCargo] = useState(v?.cargo || '')
  const [chefeSel, setChefeSel] = useState(chefeAtual)
  const [salvo, setSalvo] = useState(false)
  const mudou = chefeSel !== chefeAtual || cargo.trim() !== (v?.cargo || '')
  const nomeDe = (c: string | null | undefined) => dados.pessoas.find((o) => o.chave === c)?.nome || 'alguém'
  // Sobe a corrente de chefes: chega a alguém no topo? Se não, quem é o último sem chefe.
  const corrente = (() => {
    const porChave = new Map(dados.vinculos.map((x) => [x.pessoa_chave, x]))
    const vistos = new Set<string>([p.chave])
    let atual = v?.gestor_chave || null
    let ultimo = p.chave
    while (atual && !vistos.has(atual)) {
      vistos.add(atual); ultimo = atual
      const va = porChave.get(atual)
      if (va?.topo) return { ligado: true, solto: null as string | null }
      atual = va?.gestor_chave || null
    }
    return { ligado: false, solto: ultimo }
  })()
  const salvarTudo = async () => {
    const m: Partial<VinculoOrg> = { cargo: cargo.trim() || null }
    if (chefeSel === '__topo') m.topo = true
    else { m.gestor_chave = chefeSel || null; m.topo = false }
    const ok = await onSalvar(m)
    if (ok) { setSalvo(true); setTimeout(() => setSalvo(false), 2500) }
  }
  const outros = dados.vinculos.filter((x) => x.pessoa_chave !== p.chave)
  const opcoes = dados.pessoas.filter((o) => o.chave !== p.chave && !dados.vinculos.find((x) => x.pessoa_chave === o.chave)?.fora && !criaCiclo(p.chave, o.chave, outros))
  const chefe = v?.gestor_chave ? dados.pessoas.find((o) => o.chave === v.gestor_chave) : null
  const editar = dados.podeEditar && !dados.migracaoFaltando
  const porOrigem = new Map<string, TarefaOrg[]>()
  for (const t of tarefas) porOrigem.set(t.origem, [...(porOrigem.get(t.origem) || []), t])
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: '18px 20px', borderTop: `5px solid ${corDe(p.setor)}` }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <Avatar p={p} tam={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ ...titulo, margin: 0 }}>{p.nome}</h3>
            <p style={sub}>{[p.cargo, p.setor, p.empresa].filter(Boolean).join(' · ') || 'sem cargo cadastrado'}</p>
            {funcoes.length > 0 && <p style={{ ...sub, marginTop: 2 }}>Função nas listas: <strong style={{ color: 'var(--portal-text)' }}>{funcoes.join(', ')}</strong></p>}
          </div>
          <button onClick={onFechar} aria-label="Fechar" style={{ ...inp, padding: 6, cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--portal-text)' }}>
          {v?.topo ? <><Crown size={13} style={{ verticalAlign: -2 }} /> Está no topo do organograma.</> : chefe ? <>Responde a <strong>{chefe.nome}</strong>.</> : <span style={{ color: '#b45309' }}>Ainda sem chefe definido.</span>}
          {chefe && !corrente.ligado && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#b45309', lineHeight: 1.4 }}>
              Ainda aparece em “a posicionar”: {corrente.solto === v?.gestor_chave ? <strong>{chefe.nome}</strong> : <>a corrente para em <strong>{nomeDe(corrente.solto)}</strong>, que</>} ainda não tem chefe.
              Defina a quem {corrente.solto === v?.gestor_chave ? 'ele/ela' : 'essa pessoa'} responde (ou marque “Ninguém: está no topo” em quem dirige a empresa).
            </div>
          )}
        </div>

        {editar && (
          <div style={{ display: 'grid', gap: 10, marginBottom: 14, padding: 12, borderRadius: 12, background: 'var(--portal-bg-secondary)' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)' }}>
              Responde a
              <select value={chefeSel} disabled={salvando} style={{ ...inp, width: '100%', marginTop: 4 }}
                onChange={(e) => { setChefeSel(e.target.value); setSalvo(false) }}>
                <option value="">— escolher —</option>
                <option value="__topo">Ninguém: está no topo</option>
                {opcoes.map((o) => <option key={o.chave} value={o.chave}>{o.nome}{o.setor ? ` (${o.setor})` : ''}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)' }}>
              Cargo no organograma <span style={{ fontWeight: 400, color: 'var(--portal-text-muted)' }}>(vazio = o do RH)</span>
              <input value={cargo} maxLength={80} onChange={(e) => { setCargo(e.target.value); setSalvo(false) }} placeholder={p.cargo || 'ex.: Gerente de Pós-venda'} style={{ ...inp, width: '100%', marginTop: 4, boxSizing: 'border-box' }} />
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button disabled={salvando || !mudou} onClick={salvarTudo} style={{ ...inp, cursor: salvando || !mudou ? 'default' : 'pointer', fontWeight: 700, background: '#0369A1', color: '#fff', border: 'none', opacity: salvando || !mudou ? 0.5 : 1, padding: '9px 18px' }}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
              {salvo && <span style={{ fontSize: 12, color: '#047857', fontWeight: 700 }}>Salvo ✓</span>}
              {!salvo && mudou && !salvando && <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>alterações não salvas</span>}
            </div>
            <button disabled={salvando} onClick={() => onSalvar({ fora: !v?.fora })} style={{ ...inp, cursor: 'pointer', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
              {v?.fora ? <><Eye size={14} /> Voltar para o organograma</> : <><EyeOff size={14} /> Tirar do organograma (não é da equipe / saiu)</>}
            </button>
            {erro && <div style={{ fontSize: 12, color: '#b91c1c' }}>{erro}</div>}
          </div>
        )}

        <div style={rotuloSecao}>Tarefas ({tarefas.length})</div>
        {tarefas.length === 0 && <p style={{ ...sub, margin: '4px 0 12px' }}>Nenhuma tarefa ligada a esta pessoa. As tarefas chegam pelas funções (aba Funções).</p>}
        {[...porOrigem.entries()].map(([origem, ts]) => (
          <div key={origem} style={{ margin: '6px 0 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginBottom: 2 }}>{ORIGENS[origem] || origem}</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--portal-text)' }}>
              {ts.map((t) => (
                <li key={t.id} style={{ padding: '2px 0' }}>
                  {t.acao}
                  {(t.frequencia || t.quando) && <span style={{ color: 'var(--portal-text-muted)', fontSize: 12 }}> — {[t.frequencia, t.quando].filter(Boolean).join(' · ')}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div style={rotuloSecao}>É responsável por (nos módulos)</div>
        <ul style={{ margin: '4px 0 12px', paddingLeft: 18, fontSize: 13, color: 'var(--portal-text)' }}>
          {p.papeis.map((x) => <li key={x}>{x}</li>)}
          {!p.papeis.length && <li style={{ listStyle: 'none', marginLeft: -18, color: 'var(--portal-text-muted)' }}>nada registrado nos módulos</li>}
        </ul>
        <div style={rotuloSecao}>Faz na prática (90 dias)</div>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--portal-text)' }}>
          {p.pratica.map(([s, n]) => <li key={s}>{s}: {n.toLocaleString('pt-BR')} ações</li>)}
          {!p.pratica.length && <li style={{ listStyle: 'none', marginLeft: -18, color: 'var(--portal-text-muted)' }}>sem ações registradas no portal</li>}
        </ul>
      </div>
    </div>
  )
}

function VistaTarefas({ dados, ligacoes, porPessoa, onSel }: { dados: Resp; ligacoes: LigacaoFuncao[]; porPessoa: Map<string, TarefaOrg[]>; onSel: (c: string) => void }) {
  const [origem, setOrigem] = useState('')
  const [pessoa, setPessoa] = useState('')
  const [busca, setBusca] = useState('')
  const [modo, setModo] = useState<'lista' | 'matriz'>('lista')
  const ligMap = useMemo(() => new Map(ligacoes.map((l) => [l.funcao, l])), [ligacoes])
  const pessoasMap = useMemo(() => new Map(dados.pessoas.map((p) => [p.chave, p])), [dados.pessoas])
  const doPessoa = pessoa ? new Set((porPessoa.get(pessoa) || []).map((t) => t.id)) : null
  const q = semAcento(busca)
  const lista = dados.tarefas.filter((t) => (!origem || t.origem === origem) && (!doPessoa || doPessoa.has(t.id))
    && (!q || semAcento([t.acao, t.assunto, t.onde, t.destinatario, t.quem.join(' ')].join(' ')).includes(q)))
  const semPessoa = tarefasSemPessoa(dados.tarefas, ligacoes).length
  const comTarefas = dados.pessoas.filter((p) => (porPessoa.get(p.chave) || []).length > 0)
  const grupos = new Map<string, TarefaOrg[]>()
  for (const t of lista) {
    const g = `${ORIGENS[t.origem] || t.origem} › ${t.assunto || 'Sem assunto'}`
    grupos.set(g, [...(grupos.get(g) || []), t])
  }
  const colunas = (pessoa ? comTarefas.filter((p) => p.chave === pessoa) : comTarefas)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select value={origem} onChange={(e) => setOrigem(e.target.value)} style={inp}>
          <option value="">Todas as listas</option>
          {Object.entries(ORIGENS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} style={inp}>
          <option value="">Todas as pessoas</option>
          {comTarefas.map((p) => <option key={p.chave} value={p.chave}>{p.nome} ({(porPessoa.get(p.chave) || []).length})</option>)}
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tarefa…" style={{ ...inp, minWidth: 180 }} />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', border: '1px solid var(--portal-border)', borderRadius: 10, overflow: 'hidden' }}>
          {(['lista', 'matriz'] as const).map((m) => (
            <button key={m} onClick={() => setModo(m)} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'Inter', background: modo === m ? '#0369A1' : 'var(--portal-bg-card)', color: modo === m ? '#fff' : 'var(--portal-text-muted)' }}>
              {m === 'lista' ? 'Lista' : 'Tarefa × Pessoa'}
            </button>
          ))}
        </div>
      </div>
      <p style={{ ...sub, marginBottom: 10 }}>
        {lista.length} de {dados.tarefas.length} tarefas · {semPessoa} ainda sem pessoa (função vaga ou sem responsável na planilha) · as pessoas chegam pelas funções da aba Funções.
      </p>

      {modo === 'lista' ? (
        <div style={{ ...card, overflow: 'auto', maxHeight: '70vh' }}>
          <table className={css.tabela}>
            <thead><tr><th>Tarefa</th><th>Quem (função · pessoa)</th><th>Quando / frequência</th><th>Onde</th><th>Para quem</th></tr></thead>
            <tbody>
              {[...grupos.entries()].map(([g, ts]) => (
                <FragmentoGrupo key={g} titulo={g} n={ts.length}>
                  {ts.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.acao}{t.justificativa && <div style={{ fontWeight: 400, fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{t.justificativa}</div>}</td>
                      <td style={{ minWidth: 220 }}><ChipsFuncao funcoes={t.quem} ligacoes={ligMap} pessoas={pessoasMap} /></td>
                      <td style={{ fontSize: 12 }}>{[t.quando, t.frequencia].filter(Boolean).join(' · ') || '—'}</td>
                      <td style={{ fontSize: 12 }}>{t.onde || '—'}</td>
                      <td style={{ fontSize: 12 }}>{t.destinatario || '—'}</td>
                    </tr>
                  ))}
                </FragmentoGrupo>
              ))}
              {!lista.length && <tr><td colSpan={5} style={{ color: 'var(--portal-text-muted)' }}>Nenhuma tarefa com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ ...card, overflow: 'auto', maxHeight: '75vh' }}>
          <table className={css.matriz}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: 260 }}>Tarefa</th>
                {colunas.map((p) => (
                  <th key={p.chave} className={css.vert} title={p.nome} style={{ cursor: 'pointer' }} onClick={() => onSel(p.chave)}>{p.nome}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...grupos.entries()].map(([g, ts]) => (
                <FragmentoGrupo key={g} titulo={g} n={ts.length} colunas={colunas.length + 1}>
                  {ts.map((t) => (
                    <tr key={t.id}>
                      <td>{t.acao}</td>
                      {colunas.map((p) => {
                        const tem = (porPessoa.get(p.chave) || []).some((x) => x.id === t.id)
                        return <td key={p.chave} className={css.cel} style={{ background: tem ? corDe(t.assunto) : undefined }} title={tem ? `${p.nome} — ${t.acao}` : ''} />
                      })}
                    </tr>
                  ))}
                </FragmentoGrupo>
              ))}
            </tbody>
          </table>
          {!colunas.length && <p style={{ ...sub, padding: 16 }}>Nenhuma pessoa com tarefa ainda — diga quem é cada função na aba Funções.</p>}
        </div>
      )}
    </div>
  )
}

function FragmentoGrupo({ titulo: t, n, colunas = 5, children }: { titulo: string; n: number; colunas?: number; children: React.ReactNode }) {
  return (
    <>
      <tr className={css.grupo}><td colSpan={colunas}>{t} <span style={{ fontWeight: 600, color: 'var(--portal-text-muted)' }}>({n})</span></td></tr>
      {children}
    </>
  )
}

function VistaFuncoes({ dados, ligacoes, onMudou }: { dados: Resp; ligacoes: LigacaoFuncao[]; onMudou: (f: FuncaoOrg) => void }) {
  const [salvando, setSalvando] = useState('')
  const [msg, setMsg] = useState<{ funcao: string; txt: string; ok: boolean } | null>(null)
  const pessoasMap = new Map(dados.pessoas.map((p) => [p.chave, p]))
  const editar = dados.podeEditar && !dados.tarefasFaltando
  const gravar = async (funcao: string, pessoas: string[]) => {
    setSalvando(funcao); setMsg(null)
    try {
      const r = await fetch('/api/organograma/funcoes', {
        method: 'PATCH', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ funcao, pessoas }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      onMudou({ funcao, pessoas })
      setMsg({ funcao, txt: 'Salvo ✓', ok: true })
    } catch (e) { setMsg({ funcao, txt: (e as Error).message, ok: false }) } finally { setSalvando('') }
  }
  return (
    <div style={{ ...card, overflow: 'auto' }}>
      <div style={{ padding: '14px 18px' }}>
        <h3 style={titulo}>Quem é cada função</h3>
        <p style={sub}>As listas falam em funções (“Auxiliar Adm 1”, “Estagiário”…). Diga quem ocupa cada uma e as tarefas aparecem na pessoa.
          Função com o nome de alguém (“Henri”) liga sozinha — <em>automático</em> — até alguém salvar outra escolha.</p>
      </div>
      <table className={css.tabela}>
        <thead><tr><th>Função</th><th>Tarefas</th><th>Pessoas</th>{editar && <th>Adicionar</th>}</tr></thead>
        <tbody>
          {ligacoes.map((l) => (
            <tr key={l.funcao}>
              <td style={{ fontWeight: 700 }}>{l.funcao}</td>
              <td>{l.tarefas}</td>
              <td style={{ minWidth: 220 }}>
                {l.pessoas.map((c) => (
                  <span key={c} className={css.chip} style={{ background: '#e0f2fe', color: '#075985' }}>
                    {pessoasMap.get(c)?.nome || c}
                    {editar && <button aria-label="Tirar" disabled={!!salvando} onClick={() => gravar(l.funcao, l.pessoas.filter((x) => x !== c))} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', marginLeft: 4, padding: 0, fontWeight: 800 }}>×</button>}
                  </span>
                ))}
                {!l.pessoas.length && <span style={{ fontSize: 12, color: '#b45309' }}>ninguém ainda</span>}
                {l.automatico && l.pessoas.length > 0 && <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}> automático</span>}
                {msg?.funcao === l.funcao && <span style={{ fontSize: 12, marginLeft: 6, color: msg.ok ? '#047857' : '#b91c1c', fontWeight: 700 }}>{msg.txt}</span>}
              </td>
              {editar && (
                <td>
                  <select value="" disabled={!!salvando} onChange={(e) => e.target.value && gravar(l.funcao, [...l.pessoas, e.target.value])} style={{ ...inp, padding: '5px 8px', fontSize: 12 }}>
                    <option value="">+ pessoa…</option>
                    {dados.pessoas.filter((p) => !l.pessoas.includes(p.chave)).map((p) => <option key={p.chave} value={p.chave}>{p.nome}</option>)}
                  </select>
                  {l.automatico && l.pessoas.length > 0 && (
                    <button disabled={!!salvando} onClick={() => gravar(l.funcao, l.pessoas)} style={{ ...inp, padding: '5px 8px', fontSize: 12, marginLeft: 6, cursor: 'pointer' }} title="Grava a ligação automática como definitiva">Confirmar</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Organograma() {
  const [dados, setDados] = useState<Resp | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')
  const [verFora, setVerFora] = useState(false)
  const [modo, setModo] = useState<'arvore' | 'tarefas' | 'funcoes'>('arvore')

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const r = await fetch('/api/organograma', { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setDados({ tarefas: [], funcoes: [], tarefasFaltando: false, ...j })
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const arvore = useMemo(() => (dados ? montarArvore(dados.pessoas, dados.vinculos) : null), [dados])
  const ligacoes = useMemo(() => (dados ? ligarFuncoes(dados.tarefas, dados.funcoes, dados.pessoas) : []), [dados])
  const porPessoa = useMemo(() => (dados ? tarefasPorPessoa(dados.tarefas, ligacoes) : new Map<string, TarefaOrg[]>()), [dados, ligacoes])
  const nTarefas = useMemo(() => new Map([...porPessoa.entries()].map(([k, v]) => [k, v.length])), [porPessoa])
  const pessoaSel = dados?.pessoas.find((p) => p.chave === sel) || null

  const salvar = async (m: Partial<VinculoOrg>): Promise<boolean> => {
    if (!sel || !dados) return false
    setSalvando(true); setErroSalvar('')
    try {
      const r = await fetch('/api/organograma', {
        method: 'PATCH', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pessoa_chave: sel, nome: pessoaSel?.nome, ...m }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setDados({ ...dados, vinculos: [...dados.vinculos.filter((v) => v.pessoa_chave !== sel), { ordem: 0, ...j.vinculo }] })
      return true
    } catch (e) { setErroSalvar((e as Error).message); return false } finally { setSalvando(false) }
  }

  if (!dados) {
    return erro
      ? <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 16px', fontSize: 13, color: '#b91c1c' }}>{erro}</div>
      : <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)' }}>Montando o organograma…</div>
  }
  const nPos = arvore!.aPosicionar.reduce((s, n) => s + 1 + contarEquipe(n), 0)
  const botao = (m: typeof modo, rotulo: string, icone: React.ReactNode) => (
    <button key={m} onClick={() => setModo(m)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'Inter', borderRadius: 8, background: modo === m ? 'var(--portal-text)' : 'transparent', color: modo === m ? 'var(--portal-bg-card)' : 'var(--portal-text-muted)' }}>{icone}{rotulo}</button>
  )

  return (
    <CtxOrg.Provider value={{ sel, onSel: setSel, nTarefas }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)' }}>
          {botao('arvore', 'Árvore', <Network size={13} />)}
          {botao('tarefas', `Tarefas (${dados.tarefas.length})`, <ListChecks size={13} />)}
          {botao('funcoes', 'Funções', <Users size={13} />)}
        </div>
        <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
          {dados.pessoas.length} pessoas · {dados.pessoas.length - nPos - arvore!.fora.length} posicionadas · {nPos} a posicionar
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={carregar} disabled={carregando} style={{ ...inp, padding: '6px 10px', cursor: 'pointer' }} title="Atualizar"><RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /></button>
      </div>

      {dados.migracaoFaltando && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 16px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
          Para salvar quem responde a quem, falta aplicar <code>sql/organograma.sql</code> no Supabase. Até lá todos aparecem em “a posicionar”.
        </div>
      )}
      {dados.tarefasFaltando && modo !== 'arvore' && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 16px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
          As listas de tarefas ainda não estão no banco: falta aplicar <code>sql/organograma-tarefas.sql</code> no Supabase.
        </div>
      )}
      {!dados.rhConfigurado && (
        <div style={{ background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 12, padding: '8px 14px', marginBottom: 12, fontSize: 12, color: 'var(--portal-text-muted)' }}>
          O cadastro do RH não está ligado neste ambiente: aparecem só as pessoas com login no portal, sem cargo do RH.
        </div>
      )}

      {modo === 'tarefas' && <VistaTarefas dados={dados} ligacoes={ligacoes} porPessoa={porPessoa} onSel={setSel} />}
      {modo === 'funcoes' && (
        <VistaFuncoes dados={dados} ligacoes={ligacoes}
          onMudou={(f) => setDados({ ...dados, funcoes: [...dados.funcoes.filter((x) => x.funcao !== f.funcao), f] })} />
      )}

      {modo === 'arvore' && (
        <>
          <p style={{ ...sub, marginBottom: 10 }}>{dados.podeEditar ? 'Clique numa pessoa para escolher o chefe e ver as tarefas.' : 'Clique numa pessoa para ver o detalhe e as tarefas.'}</p>
          {arvore!.raizes.length > 0 ? (
            <div style={{ ...card, marginBottom: 16, ['--org-linha' as string]: '#cbd5e1' }}>
              <div className={css.palco}>
                <div className={css.arvore}>
                  <ul>{arvore!.raizes.map((n) => <Ramo key={n.pessoa.chave} n={n} />)}</ul>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ ...card, padding: '18px 20px', marginBottom: 16, fontSize: 13, color: 'var(--portal-text-muted)', lineHeight: 1.5 }}>
              Ninguém posicionado ainda. {dados.podeEditar ? <>Comece pelo topo: clique em quem dirige a empresa e escolha <strong>“Ninguém: está no topo”</strong>; depois, em cada pessoa, escolha a quem ela responde.</> : 'Um administrador precisa definir quem responde a quem.'}
            </div>
          )}

          {arvore!.aPosicionar.length > 0 && (
            <div style={{ ...card, padding: '14px 16px', marginBottom: 16, overflowX: 'auto', ['--org-linha' as string]: '#cbd5e1' }}>
              <h3 style={titulo}>A posicionar</h3>
              <p style={{ ...sub, marginBottom: 12 }}>Sem chefe definido, ou cuja corrente de chefes ainda não chega a alguém no topo.</p>
              <div className={css.solta} style={{ alignItems: 'flex-start' }}>
                {arvore!.aPosicionar.map((n) => (
                  <div key={n.pessoa.chave} className={css.arvore} style={{ justifyContent: 'flex-start' }}>
                    <ul><Ramo n={n} /></ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {arvore!.fora.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
              <button onClick={() => setVerFora(!verFora)} style={{ ...inp, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>{verFora ? 'Esconder' : 'Ver'} {arvore!.fora.length} fora do organograma</button>
              {verFora && (
                <div className={css.solta} style={{ marginTop: 10 }}>
                  {arvore!.fora.map((p) => <Cartao key={p.chave} n={{ pessoa: p, filhos: [] }} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {pessoaSel && (
        <Janela key={pessoaSel.chave} p={pessoaSel} dados={dados} salvando={salvando} erro={erroSalvar}
          tarefas={porPessoa.get(pessoaSel.chave) || []} funcoes={funcoesDaPessoa(pessoaSel.chave, ligacoes)}
          onFechar={() => { setSel(null); setErroSalvar('') }} onSalvar={salvar} />
      )}
    </CtxOrg.Provider>
  )
}
