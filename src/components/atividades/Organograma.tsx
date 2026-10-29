'use client'
// Organograma (aba Processos de /atividades): pessoas do portal + RH, ligadas pelo chefe gravado
// em org_pessoas. Cada cartão mostra cargo/setor, do que a pessoa é dona (outros módulos) e o que
// faz na prática (ações dos últimos 90 dias). Admin escolhe o chefe na janela da pessoa.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, X, Crown, EyeOff, Eye } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { montarArvore, contarEquipe, criaCiclo, type NoOrg, type PessoaOrg, type VinculoOrg } from '@/lib/organograma/arvore'
import css from './organograma.module.css'

type Resp = { pessoas: PessoaOrg[]; vinculos: VinculoOrg[]; migracaoFaltando: boolean; rhConfigurado: boolean; podeEditar: boolean; error?: string }

const CORES = ['#0369A1', '#B45309', '#047857', '#7C3AED', '#BE185D', '#0891B2', '#DC2626', '#4D7C0F', '#C2410C', '#475569']
function corDoSetor(setor: string | null): string {
  if (!setor) return '#94a3b8'
  let h = 0
  for (const c of setor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return CORES[h % CORES.length]
}
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

const card: React.CSSProperties = { background: 'var(--portal-bg-card)', borderRadius: '16px', border: '1px solid var(--portal-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
const titulo: React.CSSProperties = { fontSize: '15px', fontWeight: 800, color: 'var(--portal-text)', margin: '0 0 4px' }
const sub: React.CSSProperties = { fontSize: '12px', color: 'var(--portal-text-muted)', margin: 0 }
const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: '10px', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)', fontSize: '13px', fontFamily: 'Inter', outline: 'none' }

function Avatar({ p, tam = 36 }: { p: PessoaOrg; tam?: number }) {
  const [erro, setErro] = useState(false)
  if (p.foto && !erro) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.foto} alt="" className={css.avatar} style={{ width: tam, height: tam, flexBasis: tam }} onError={() => setErro(true)} />
  }
  return <span className={css.avatar} style={{ background: corDoSetor(p.setor), width: tam, height: tam, flexBasis: tam }}>{iniciais(p.nome)}</span>
}

function Cartao({ n, sel, onSel }: { n: NoOrg; sel: string | null; onSel: (c: string) => void }) {
  const p = n.pessoa
  const equipe = contarEquipe(n)
  return (
    <button type="button" onClick={() => onSel(p.chave)} className={`${css.cartao} ${sel === p.chave ? css.cartaoSel : ''}`} style={{ borderTop: `4px solid ${corDoSetor(p.setor)}` }}>
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
        {p.papeis.length > 0 && <span className={css.selo} style={{ background: '#fef3c7', color: '#92400e' }} title={p.papeis.join('\n')}>dono de {p.papeis.length}</span>}
        {equipe > 0 && <span className={css.selo} style={{ background: '#e0f2fe', color: '#075985' }}>equipe {equipe}</span>}
        {p.origem === 'rh' && <span className={css.selo} style={{ background: '#f1f5f9', color: '#475569' }} title="Está no RH, sem login no portal">sem login</span>}
      </div>
    </button>
  )
}

function Ramo({ n, sel, onSel }: { n: NoOrg; sel: string | null; onSel: (c: string) => void }) {
  return (
    <li>
      <Cartao n={n} sel={sel} onSel={onSel} />
      {n.filhos.length > 0 && <ul>{n.filhos.map((f) => <Ramo key={f.pessoa.chave} n={f} sel={sel} onSel={onSel} />)}</ul>}
    </li>
  )
}

function Janela({ p, dados, salvando, erro, onFechar, onSalvar }: {
  p: PessoaOrg; dados: Resp; salvando: boolean; erro: string
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
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: '18px 20px', borderTop: `5px solid ${corDoSetor(p.setor)}` }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <Avatar p={p} tam={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ ...titulo, margin: 0 }}>{p.nome}</h3>
            <p style={sub}>{[p.cargo, p.setor, p.empresa].filter(Boolean).join(' · ') || 'sem cargo cadastrado'}</p>
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

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>É responsável por</div>
        <ul style={{ margin: '4px 0 12px', paddingLeft: 18, fontSize: 13, color: 'var(--portal-text)' }}>
          {p.papeis.map((x) => <li key={x}>{x}</li>)}
          {!p.papeis.length && <li style={{ listStyle: 'none', marginLeft: -18, color: 'var(--portal-text-muted)' }}>nada registrado nos módulos</li>}
        </ul>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Faz na prática (90 dias)</div>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--portal-text)' }}>
          {p.pratica.map(([s, n]) => <li key={s}>{s}: {n.toLocaleString('pt-BR')} ações</li>)}
          {!p.pratica.length && <li style={{ listStyle: 'none', marginLeft: -18, color: 'var(--portal-text-muted)' }}>sem ações registradas no portal</li>}
        </ul>
      </div>
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

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const r = await fetch('/api/organograma', { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setDados(j)
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const arvore = useMemo(() => (dados ? montarArvore(dados.pessoas, dados.vinculos) : null), [dados])
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

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
          {dados.pessoas.length} pessoas · {dados.pessoas.length - nPos - arvore!.fora.length} posicionadas · {nPos} a posicionar
          {dados.podeEditar ? ' — clique numa pessoa para escolher o chefe' : ' — clique numa pessoa para ver o detalhe'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={carregar} disabled={carregando} style={{ ...inp, padding: '6px 10px', cursor: 'pointer' }} title="Atualizar"><RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /></button>
      </div>

      {dados.migracaoFaltando && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 16px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
          Para salvar quem responde a quem, falta aplicar <code>sql/organograma.sql</code> no Supabase. Até lá todos aparecem em “a posicionar”.
        </div>
      )}
      {!dados.rhConfigurado && (
        <div style={{ background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 12, padding: '8px 14px', marginBottom: 12, fontSize: 12, color: 'var(--portal-text-muted)' }}>
          O cadastro do RH não está ligado neste ambiente: aparecem só as pessoas com login no portal, sem cargo do RH.
        </div>
      )}

      {arvore!.raizes.length > 0 ? (
        <div style={{ ...card, marginBottom: 16, ['--org-linha' as string]: '#cbd5e1' }}>
          <div className={css.palco}>
            <div className={css.arvore}>
              <ul>{arvore!.raizes.map((n) => <Ramo key={n.pessoa.chave} n={n} sel={sel} onSel={setSel} />)}</ul>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ ...card, padding: '18px 20px', marginBottom: 16, fontSize: 13, color: 'var(--portal-text-muted)', lineHeight: 1.5 }}>
          Ninguém posicionado ainda. {dados.podeEditar ? <>Comece pelo topo: clique em quem dirige a empresa e escolha <strong>“Ninguém: está no topo”</strong>; depois, em cada pessoa, escolha a quem ela responde.</> : 'Um administrador precisa definir quem responde a quem.'}
        </div>
      )}

      {arvore!.aPosicionar.length > 0 && (
        <div style={{ ...card, padding: '14px 16px', marginBottom: 16, overflowX: 'auto' }}>
          <h3 style={titulo}>A posicionar</h3>
          <p style={{ ...sub, marginBottom: 12 }}>Sem chefe definido (ou com chefe que saiu do organograma).</p>
          <div className={css.solta}>
            {arvore!.aPosicionar.map((n) => (
              <div key={n.pessoa.chave} className={css.arvore} style={{ justifyContent: 'flex-start', ['--org-linha' as string]: '#cbd5e1' }}>
                <ul><Ramo n={n} sel={sel} onSel={setSel} /></ul>
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
              {arvore!.fora.map((p) => <Cartao key={p.chave} n={{ pessoa: p, filhos: [] }} sel={sel} onSel={setSel} />)}
            </div>
          )}
        </div>
      )}

      {pessoaSel && <Janela key={pessoaSel.chave} p={pessoaSel} dados={dados} salvando={salvando} erro={erroSalvar} onFechar={() => { setSel(null); setErroSalvar('') }} onSalvar={salvar} />}
    </div>
  )
}
