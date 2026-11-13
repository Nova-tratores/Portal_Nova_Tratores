'use client'
// Departamentos e pacotes (permissões v2) — aba de /admin/permissoes (13/11/2026).
// Criar/editar/arquivar, marcar as telas nas mesmas caixinhas da janela da pessoa,
// escolher quem está nele e, ANTES de gravar, ver quem ganha e quem perde o quê.
// "Limpar exceções repetidas" apaga só o que o departamento/pacote já cobre.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Users, LayoutGrid, Archive, X, Search, HelpCircle, Sparkles, Check } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { MODULOS_ADMIN } from '@/lib/permissoes/modulos-admin'
import { acoesDoModulo } from '@/lib/permissoes/catalogo'
import PermissoesCartoes from '@/components/admin/PermissoesCartoes'

export interface UsuarioDP { id: string; nome: string; ativo: boolean; admin: boolean; dev: boolean; avatar?: string | null; funcao?: string | null }
export interface ConjuntoDP { id: string; nome: string; tipo: string; descricao: string | null; ativo: boolean; telas: { tela: string; nivel: string }[]; membros: number; membrosIds?: string[] }
interface LinhaPrevia { user: string; nome: string; admin: boolean; ganha: string[]; perde: string[] }
interface Rascunho { id: string | null; nome: string; tipo: 'departamento' | 'pacote'; descricao: string; ativo: boolean; chaves: string[]; membros: string[] }

const VERMELHO = '#dc2626'
const AZUL = '#2563eb'

function rotulo(chave: string): string {
  const [mod, ...resto] = chave.split(':')
  const acao = resto.join(':')
  const nomeMod = MODULOS_ADMIN.find((m) => m.id === mod)?.label || mod
  if (!acao) return nomeMod
  return `${nomeMod} · ${acoesDoModulo(mod).find((a) => a.id === acao)?.label || acao}`
}
/** Lista de mudanças longa: mostra o módulo uma vez em vez de cada ação dele. */
function resumir(telas: string[]): string[] {
  const set = new Set(telas)
  return telas.filter((t) => !t.includes(':') || !set.has(t.split(':')[0])).map((t) =>
    t.includes(':') ? rotulo(t) : `${rotulo(t)}${telas.some((x) => x.startsWith(t + ':')) ? ' (inteiro)' : ''}`)
}

async function chamar<T>(corpo: unknown): Promise<T> {
  const r = await fetch('/api/admin/permissoes-v2', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
  return j as T
}

function Foto({ u, tam = 28 }: { u?: UsuarioDP; tam?: number }) {
  const ini = (u?.nome || '?').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return u?.avatar
    ? <img src={u.avatar} alt="" width={tam} height={tam} style={{ width: tam, height: tam, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
    : <span style={{ width: tam, height: tam, borderRadius: '50%', flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: tam * 0.38, fontWeight: 700, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }}>{ini}</span>
}

export default function DepartamentosPacotes({ usuarios, conjuntos, souDev, aoMudar }: {
  usuarios: UsuarioDP[]; conjuntos: ConjuntoDP[]; souDev: boolean; aoMudar: () => void
}) {
  const [filtro, setFiltro] = useState<'departamento' | 'pacote' | 'arquivados'>('departamento')
  const [ajuda, setAjuda] = useState(false)
  const [editando, setEditando] = useState<Rascunho | null>(null)
  const [limpeza, setLimpeza] = useState<{ conjuntoId?: string; nome: string } | null>(null)
  const [aviso, setAviso] = useState('')
  const porId = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios])

  const lista = conjuntos.filter((c) => filtro === 'arquivados' ? !c.ativo : c.ativo && c.tipo === filtro)
  const novo = (tipo: 'departamento' | 'pacote') => setEditando({ id: null, nome: '', tipo, descricao: '', ativo: true, chaves: [], membros: [] })
  const abrir = (c: ConjuntoDP) => setEditando({
    id: c.id, nome: c.nome, tipo: c.tipo === 'pacote' ? 'pacote' : 'departamento', descricao: c.descricao || '', ativo: c.ativo,
    chaves: c.telas.map((t) => t.tela), membros: c.membrosIds ?? [],
  })

  const botao = (ativo: boolean) => ({
    minHeight: 40, padding: '8px 14px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${ativo ? VERMELHO : 'var(--portal-border)'}`, background: ativo ? VERMELHO : 'var(--portal-bg-card)',
    color: ativo ? '#fefefe' : 'var(--portal-text)', display: 'inline-flex', alignItems: 'center', gap: 6,
  } as const)

  return (
    <div className="dp">
      <style>{CSS}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        {(['departamento', 'pacote', 'arquivados'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFiltro(f)} style={botao(filtro === f)}>
            {f === 'departamento' ? 'Departamentos' : f === 'pacote' ? 'Pacotes' : 'Arquivados'}
            <span style={{ opacity: 0.75, fontWeight: 600 }}>{conjuntos.filter((c) => f === 'arquivados' ? !c.ativo : c.ativo && c.tipo === f).length}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => novo('departamento')} style={botao(false)}><Plus size={15} /> Departamento</button>
        <button type="button" onClick={() => novo('pacote')} style={botao(false)}><Plus size={15} /> Pacote</button>
        <button type="button" onClick={() => setLimpeza({ nome: 'todos' })} style={botao(false)} title="Apaga as exceções que o departamento ou pacote da pessoa já dá"><Sparkles size={15} /> Limpar exceções repetidas</button>
        <button type="button" onClick={() => setAjuda((v) => !v)} style={botao(false)}><HelpCircle size={15} /> Como ler esta tela</button>
      </div>

      {ajuda && (
        <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', fontSize: 13.5, lineHeight: 1.55, marginBottom: 12 }}>
          <b>Departamento</b> = o que todo mundo de um setor usa (ex.: Peças). <b>Pacote</b> = um conjunto de telas que pessoas de setores diferentes recebem (ex.: “Faturista”). Uma pessoa pode estar em vários.<br />
          O que a pessoa tem = <b>departamentos + pacotes + exceções</b> dela (marcadas na janela da pessoa). Exceção pode dar uma tela a mais ou bloquear uma do departamento.<br />
          <b>Nada grava sem você ver antes:</b> ao salvar aparece a lista de quem ganha e quem perde cada tela. <b>Limpar exceções repetidas</b> apaga só a exceção que o departamento já dá — ninguém ganha nem perde nada.
        </div>
      )}
      {aviso && <div className="dp-ok"><Check size={15} /> {aviso}</div>}

      <div className="dp-grade">
        {lista.map((c) => {
          const membros = (c.membrosIds ?? []).map((id) => porId.get(id)).filter(Boolean) as UsuarioDP[]
          return (
            <button key={c.id} type="button" className="dp-card" onClick={() => abrir(c)} style={{ borderLeftColor: c.tipo === 'pacote' ? AZUL : VERMELHO }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: 15 }}>{c.nome}</b>
                <span className="dp-selo" style={{ color: c.tipo === 'pacote' ? AZUL : VERMELHO }}>{c.tipo}</span>
                {!c.ativo && <span className="dp-selo"><Archive size={11} /> arquivado</span>}
              </div>
              {c.descricao && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>{c.descricao}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Users size={13} /> {c.membros}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><LayoutGrid size={13} /> {c.telas.length} tela(s)</span>
                <span style={{ display: 'inline-flex', marginLeft: 'auto' }}>
                  {membros.slice(0, 6).map((u, i) => <span key={u.id} style={{ marginLeft: i ? -8 : 0, border: '2px solid var(--portal-bg-card)', borderRadius: '50%' }}><Foto u={u} tam={24} /></span>)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {resumir(c.telas.map((t) => t.tela)).join(' · ') || 'Nenhuma tela ainda'}
              </div>
            </button>
          )
        })}
        {lista.length === 0 && <p style={{ fontSize: 14, color: 'var(--portal-text-muted)' }}>Nada aqui ainda.</p>}
      </div>

      {editando && (
        <Editor
          inicial={editando} usuarios={usuarios} souDev={souDev}
          aoFechar={() => setEditando(null)}
          aoLimpar={(id, nome) => { setEditando(null); setLimpeza({ conjuntoId: id, nome }) }}
          aoGravar={(msg) => { setEditando(null); setAviso(msg); aoMudar() }}
        />
      )}
      {limpeza && (
        <Limpeza
          conjuntoId={limpeza.conjuntoId} nome={limpeza.nome} porId={porId}
          aoFechar={() => setLimpeza(null)}
          aoGravar={(msg) => { setLimpeza(null); setAviso(msg); aoMudar() }}
        />
      )}
    </div>
  )
}

function Editor({ inicial, usuarios, souDev, aoFechar, aoGravar, aoLimpar }: {
  inicial: Rascunho; usuarios: UsuarioDP[]; souDev: boolean
  aoFechar: () => void; aoGravar: (msg: string) => void; aoLimpar: (id: string, nome: string) => void
}) {
  const [r, setR] = useState<Rascunho>(inicial)
  const [aba, setAba] = useState<'telas' | 'pessoas'>('telas')
  const [busca, setBusca] = useState('')
  const [previa, setPrevia] = useState<LinhaPrevia[] | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const mudou = JSON.stringify(r) !== JSON.stringify(inicial)

  const pessoasFiltradas = usuarios.filter((u) => u.ativo || r.membros.includes(u.id))
    .filter((u) => !busca.trim() || `${u.nome} ${u.funcao ?? ''}`.toLowerCase().includes(busca.trim().toLowerCase()))
    .sort((a, b) => Number(r.membros.includes(b.id)) - Number(r.membros.includes(a.id)) || a.nome.localeCompare(b.nome))
  const alternar = (id: string) => setR((x) => ({ ...x, membros: x.membros.includes(id) ? x.membros.filter((m) => m !== id) : [...x.membros, id] }))

  const pedido = { id: r.id, nome: r.nome, tipo: r.tipo, descricao: r.descricao, ativo: r.ativo, chaves: r.chaves, membros: r.membros }
  const verPrevia = async () => {
    setOcupado(true); setErro('')
    try { setPrevia((await chamar<{ linhas: LinhaPrevia[] }>({ acao: 'previa', conjunto: pedido })).linhas) }
    catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  const gravar = async () => {
    setOcupado(true); setErro('')
    try {
      const res = await chamar<{ mudancas: number }>({ acao: 'salvar', conjunto: pedido })
      aoGravar(`${r.nome} gravado. ${res.mudancas ? `${res.mudancas} pessoa(s) com acesso diferente.` : 'Ninguém mudou de acesso.'}`)
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }

  return (
    <div className="dp-fundo" onClick={(e) => { if (e.target === e.currentTarget && !mudou) aoFechar() }}>
      <div className="dp-janela" role="dialog" aria-modal>
        <div className="dp-topo">
          <input value={r.nome} onChange={(e) => { setR({ ...r, nome: e.target.value }); setPrevia(null) }} placeholder={r.tipo === 'pacote' ? 'Nome do pacote (ex.: Faturista)' : 'Nome do departamento'} className="dp-campo" style={{ flex: 1, fontWeight: 700, fontSize: 16, minWidth: 0 }} autoFocus={!r.id} />
          <select value={r.tipo} onChange={(e) => setR({ ...r, tipo: e.target.value as Rascunho['tipo'] })} className="dp-campo">
            <option value="departamento">Departamento</option>
            <option value="pacote">Pacote</option>
          </select>
          <button type="button" onClick={() => { if (!mudou || confirm('Descartar as mudanças?')) aoFechar() }} className="dp-icone" aria-label="Fechar"><X size={18} /></button>
        </div>
        <input value={r.descricao} onChange={(e) => setR({ ...r, descricao: e.target.value })} placeholder="Para que serve (opcional)" className="dp-campo" style={{ margin: '0 14px 10px' }} />

        <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => setAba('telas')} className={`dp-aba ${aba === 'telas' ? 'on' : ''}`}><LayoutGrid size={14} /> Telas <span>{r.chaves.length}</span></button>
          <button type="button" onClick={() => setAba('pessoas')} className={`dp-aba ${aba === 'pessoas' ? 'on' : ''}`}><Users size={14} /> Pessoas <span>{r.membros.length}</span></button>
          <div style={{ flex: 1 }} />
          {r.id && (
            <label style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center', minHeight: 40 }}>
              <input type="checkbox" checked={!r.ativo} onChange={(e) => { setR({ ...r, ativo: !e.target.checked }); setPrevia(null) }} /> Arquivar (deixa de valer para todos)
            </label>
          )}
        </div>

        <div className="dp-corpo">
          {previa ? (
            <div>
              <p style={{ fontSize: 14, margin: '0 0 10px' }}>
                {previa.length === 0 ? <b>Ninguém ganha nem perde acesso com essa mudança.</b> : <><b>{previa.length} pessoa(s)</b> mudam de acesso:</>}
              </p>
              {previa.map((l) => (
                <div key={l.user} className="dp-linha">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Foto u={usuarios.find((u) => u.id === l.user)} tam={26} /><b>{l.nome}</b>
                    {l.admin && <span className="dp-selo">admin: continua vendo tudo</span>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {resumir(l.ganha).map((t) => <span key={'g' + t} className="dp-chip ganha">+ {t}</span>)}
                    {resumir(l.perde).map((t) => <span key={'p' + t} className="dp-chip perde">− {t}</span>)}
                  </div>
                </div>
              ))}
            </div>
          ) : aba === 'telas' ? (
            <PermissoesCartoes modulos={r.chaves} catalogo={MODULOS_ADMIN} onChange={(c) => { setR({ ...r, chaves: c }); setPrevia(null) }} disabled={ocupado} souDev={souDev} />
          ) : (
            <div>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: 12, opacity: 0.5 }} />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa ou função" className="dp-campo" style={{ width: '100%', paddingLeft: 32 }} />
              </div>
              <div className="dp-pessoas">
                {pessoasFiltradas.map((u) => {
                  const dentro = r.membros.includes(u.id)
                  return (
                    <button key={u.id} type="button" onClick={() => { alternar(u.id); setPrevia(null) }} className={`dp-pessoa ${dentro ? 'on' : ''}`}>
                      <Foto u={u} />
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.nome}{u.ativo ? '' : ' (inativa)'}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{u.funcao || '—'}{u.dev ? ' · Dev' : u.admin ? ' · Admin' : ''}</span>
                      </span>
                      <span className="dp-check">{dentro && <Check size={13} strokeWidth={3.5} />}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {erro && <div style={{ margin: '0 14px', color: VERMELHO, fontSize: 13.5 }}>{erro}</div>}
        <div className="dp-rodape">
          {r.id && !previa && (
            <button type="button" className="dp-btn" onClick={() => aoLimpar(r.id!, r.nome)} title="Apaga as exceções de quem está aqui que este departamento já dá">
              <Sparkles size={14} /> Limpar exceções repetidas
            </button>
          )}
          <div style={{ flex: 1 }} />
          {previa ? (
            <>
              <button type="button" className="dp-btn" onClick={() => setPrevia(null)} disabled={ocupado}>Voltar e mexer</button>
              <button type="button" className="dp-btn forte" onClick={gravar} disabled={ocupado}>{ocupado ? 'Gravando…' : 'Confirmar e gravar'}</button>
            </>
          ) : (
            <button type="button" className="dp-btn forte" onClick={verPrevia} disabled={ocupado || !r.nome.trim() || !mudou}>{ocupado ? 'Calculando…' : 'Ver o que muda'}</button>
          )}
        </div>
      </div>
    </div>
  )
}

function Limpeza({ conjuntoId, nome, porId, aoFechar, aoGravar }: {
  conjuntoId?: string; nome: string; porId: Map<string, UsuarioDP>; aoFechar: () => void; aoGravar: (msg: string) => void
}) {
  const [lista, setLista] = useState<{ user: string; nome: string; telas: string[] }[] | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    let vivo = true
    chamar<{ lista: { user: string; nome: string; telas: string[] }[] }>({ acao: 'repetidos', conjuntoId })
      .then((j) => { if (vivo) setLista(j.lista) }).catch((e) => { if (vivo) setErro(e.message) })
    return () => { vivo = false }
  }, [conjuntoId])
  const total = (lista ?? []).reduce((s, l) => s + l.telas.length, 0)
  const limpar = async () => {
    setOcupado(true); setErro('')
    try {
      const r = await chamar<{ apagados: number; pessoas: number }>({ acao: 'limpar', conjuntoId })
      aoGravar(`${r.apagados} exceção(ões) repetida(s) apagada(s) de ${r.pessoas} pessoa(s). Ninguém mudou de acesso.`)
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  return (
    <div className="dp-fundo" onClick={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <div className="dp-janela" style={{ maxWidth: 640 }} role="dialog" aria-modal>
        <div className="dp-topo">
          <b style={{ flex: 1, fontSize: 16 }}>Limpar exceções repetidas{conjuntoId ? ` · ${nome}` : ''}</b>
          <button type="button" onClick={aoFechar} className="dp-icone" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="dp-corpo">
          <p style={{ fontSize: 13.5, marginTop: 0 }}>Exceções que o departamento ou pacote da pessoa já dá. Apagar <b>não muda o acesso de ninguém</b>: só deixa a lista da pessoa mais curta.</p>
          {!lista && !erro && <p>Calculando…</p>}
          {lista && lista.length === 0 && <p><b>Nenhuma exceção repetida.</b></p>}
          {lista?.map((l) => (
            <div key={l.user} className="dp-linha">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><Foto u={porId.get(l.user)} tam={26} /><b>{l.nome}</b><span className="dp-selo">{l.telas.length}</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{resumir(l.telas).map((t) => <span key={t} className="dp-chip">{t}</span>)}</div>
            </div>
          ))}
        </div>
        {erro && <div style={{ margin: '0 14px', color: VERMELHO, fontSize: 13.5 }}>{erro}</div>}
        <div className="dp-rodape">
          <div style={{ flex: 1 }} />
          <button type="button" className="dp-btn" onClick={aoFechar}>Fechar</button>
          <button type="button" className="dp-btn forte" onClick={limpar} disabled={ocupado || !total}>{ocupado ? 'Apagando…' : `Apagar ${total} exceção(ões)`}</button>
        </div>
      </div>
    </div>
  )
}

const CSS = `
.dp-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.dp-card{display:flex;flex-direction:column;gap:8px;text-align:left;padding:14px;border-radius:12px;border:1px solid var(--portal-border);border-left:4px solid;background:var(--portal-bg-card);color:var(--portal-text);cursor:pointer;transition:transform .15s,box-shadow .15s;min-width:0}
.dp-card:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.08)}
.dp-selo{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;border:1px solid var(--portal-border);text-transform:uppercase;letter-spacing:.02em}
.dp-ok{display:flex;align-items:center;gap:6px;padding:9px 12px;border-radius:10px;margin-bottom:12px;font-size:13.5px;border:1px solid #bbf7d0;background:#f0fdf4;color:#166534}
.dp-fundo{position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
.dp-janela{width:min(1150px,100%);max-height:calc(100dvh - 32px);display:flex;flex-direction:column;background:var(--portal-bg);color:var(--portal-text);border-radius:14px;border:1px solid var(--portal-border);box-shadow:0 20px 60px rgba(0,0,0,.3)}
.dp-topo{display:flex;gap:8px;align-items:center;padding:14px}
.dp-corpo{flex:1;overflow:auto;padding:0 14px 14px;min-height:0}
.dp-rodape{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 14px;border-top:1px solid var(--portal-border)}
.dp-campo{min-height:40px;padding:8px 10px;border-radius:10px;border:1px solid var(--portal-border);background:var(--portal-bg-card);color:var(--portal-text);font-size:14px}
.dp-icone{width:40px;height:40px;border-radius:10px;border:1px solid var(--portal-border);background:var(--portal-bg-card);color:var(--portal-text);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none}
.dp-aba{min-height:40px;padding:8px 14px;border-radius:10px;border:1px solid var(--portal-border);background:var(--portal-bg-card);color:var(--portal-text);font-weight:700;font-size:13.5px;display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.dp-aba span{font-size:11.5px;padding:1px 7px;border-radius:999px;background:var(--portal-bg-secondary)}
.dp-aba.on{background:${VERMELHO};border-color:${VERMELHO};color:#fefefe}
.dp-aba.on span{background:rgba(255,255,255,.25)}
.dp-pessoas{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
.dp-pessoa{display:flex;align-items:center;gap:10px;min-height:52px;padding:8px 10px;border-radius:10px;border:1px solid var(--portal-border);background:var(--portal-bg-card);color:var(--portal-text);cursor:pointer;min-width:0}
.dp-pessoa.on{border-color:${VERMELHO};box-shadow:inset 0 0 0 1px ${VERMELHO}}
.dp-check{width:20px;height:20px;border-radius:5px;border:2px solid var(--portal-border);display:inline-flex;align-items:center;justify-content:center;color:#fefefe;flex:none}
.dp-pessoa.on .dp-check{background:${VERMELHO};border-color:${VERMELHO}}
.dp-linha{padding:10px 0;border-top:1px solid var(--portal-border);font-size:13.5px}
.dp-chip{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--portal-border);background:var(--portal-bg-secondary)}
.dp-chip.ganha{background:#f0fdf4;color:#166534;border-color:#bbf7d0}
.dp-chip.perde{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
.dp-btn{min-height:40px;padding:8px 14px;border-radius:10px;border:1px solid var(--portal-border);background:var(--portal-bg-card);color:var(--portal-text);font-weight:700;font-size:13.5px;display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.dp-btn.forte{background:${VERMELHO};border-color:${VERMELHO};color:#fefefe}
.dp-btn:disabled{opacity:.5;cursor:default}
@media (max-width:700px){
  .dp-fundo{padding:0}
  .dp-janela{width:100%;max-width:none!important;height:100dvh;max-height:100dvh;border-radius:0;border:0}
  .dp-topo{flex-wrap:wrap}
  .dp-grade,.dp-pessoas{grid-template-columns:1fr}
}
`
