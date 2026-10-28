'use client'
// Administração: logins que existem no Supabase Auth mas NÃO têm cadastro no
// Portal. Aparecem aqui sozinhos, para o admin cadastrar ou apagar o login.
// Visual em cartões separados por "usadas no app de vendas" × "sem uso" (José, 21/10/2026), com a explicação
// de como isso acontece.
import { useCallback, useEffect, useState } from 'react'
import { KeyRound, UserPlus, Trash2, Mail, Smartphone, HelpCircle } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

interface Conta { id: string; email: string; criado_em: string; ultimo_acesso: string | null; uso: string | null }
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : 'nunca')
const haQuanto = (iso: string | null) => {
  if (!iso) return 'nunca entrou'
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  return d <= 0 ? 'entrou hoje' : d === 1 ? 'entrou ontem' : d < 30 ? `entrou há ${d} dias` : `último login ${data(iso)}`
}

export default function ContasSemCadastro({ versao, onCadastrar, onTrocarEmail }: { versao: number; onCadastrar: (email: string) => void; onTrocarEmail?: (c: Conta) => void }) {
  const [contas, setContas] = useState<Conta[] | null>(null)
  const [erro, setErro] = useState('')
  const [apagando, setApagando] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [explica, setExplica] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/contas-sem-cadastro', { headers: await authHeaders(), cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) { setErro(j.error || 'Falha ao listar'); return }
      setContas(j.contas); setErro('')
    } catch { setErro('Falha ao listar') }
  }, [])
  useEffect(() => { carregar() }, [carregar, versao])

  const apagar = async (c: Conta) => {
    setApagando(c.id); setErro('')
    try {
      const res = await fetch('/api/admin/contas-sem-cadastro', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ user_id: c.id }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setErro(`${c.email}: ${j.error || 'falha ao apagar'}`)
      setConfirmar(null)
      await carregar()
    } finally { setApagando(null) }
  }

  if (!contas || (contas.length === 0 && !erro)) return null
  const doApp = contas.filter((c) => c.uso)
  const soltas = contas.filter((c) => !c.uso)

  const cartao = (c: Conta, k: number) => {
    const m = c.uso?.match(/^CRM: (\w+) "(.*)"( \(inativo\))?$/)
    const papel = m?.[1], nome = m?.[2], inativo = !!m?.[3]
    return (
      <div key={c.id} className={`csc-c ${apagando === c.id ? 'apagando' : ''}`} style={{ '--d': `${k * 40}ms` } as React.CSSProperties}>
        <div className="csc-topo">
          <span className={`csc-av ${papel || 'solta'}`}>{(nome || c.email).charAt(0).toUpperCase()}</span>
          <div className="csc-id">
            <b>{nome || c.email.split('@')[0]}</b>
            <small title={c.email}>{c.email}</small>
          </div>
        </div>
        <div className="csc-chips">
          {papel && <span className={`csc-chip ${papel}`}><Smartphone size={12} />{papel === 'vendedor' ? 'vendedor' : 'supervisor'} no app de vendas</span>}
          {inativo && <span className="csc-chip inativo">inativo no app</span>}
          <span className={`csc-chip ${c.ultimo_acesso ? 'uso' : 'nunca'}`}>{haQuanto(c.ultimo_acesso)}</span>
        </div>
        <small className="csc-criada">login criado em {data(c.criado_em)}</small>
        <div className="csc-acoes">
          {confirmar === c.id ? (
            <>
              <span className="csc-pergunta">Apagar este login de vez?</span>
              <button type="button" className="csc-b perigo cheio" onClick={() => apagar(c)} disabled={apagando === c.id}>Sim, apagar</button>
              <button type="button" className="csc-b" onClick={() => setConfirmar(null)}>Não</button>
            </>
          ) : (
            <>
              <button type="button" className="csc-b verde" onClick={() => onCadastrar(c.email)}><UserPlus size={14} />Cadastrar no Portal</button>
              {onTrocarEmail && <button type="button" className="csc-ic" onClick={() => onTrocarEmail(c)} title="E-mail digitado errado? Troque pelo certo sem criar outro login"><Mail size={15} /></button>}
              {!c.uso && <button type="button" className="csc-ic perigo" onClick={() => setConfirmar(c.id)} title="Apagar o login"><Trash2 size={15} /></button>}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="csc">
      <style>{ESTILO_CSC}</style>
      <header className="csc-cab">
        <span className="csc-cab-ic"><KeyRound size={18} /></span>
        <div>
          <b>Logins sem cadastro no Portal <em>{contas.length}</em></b>
          <small>Conseguem entrar com e-mail e senha, mas não aparecem na lista de usuários acima.</small>
        </div>
        <button type="button" className={`csc-help ${explica ? 'on' : ''}`} onClick={() => setExplica((v) => !v)}><HelpCircle size={15} />Como isso acontece?</button>
      </header>
      {explica && (
        <div className="csc-explica">
          <p><b>O login e o cadastro são coisas separadas.</b> O login (e-mail + senha) fica no sistema de contas do banco, que é o MESMO para o Portal e para o app de vendas (CRM). O cadastro do Portal é a ficha da pessoa na Administração (nome, função, foto, permissões).</p>
          <p>Por isso aparecem logins sem cadastro quando:</p>
          <ul>
            <li><b>O vendedor ou supervisor foi criado pelo app de vendas</b> — ele ganha login para usar o CRM, mas nunca foi cadastrado no Portal. É o caso dos marcados “no app de vendas”: estão certos, e não dá para apagar por aqui (o app usa).</li>
            <li><b>Alguém criou a conta direto no banco</b> ou por um convite/e-mail de acesso e o cadastro não foi feito depois.</li>
            <li><b>O cadastro foi apagado</b>, mas o login ficou (ou o e-mail foi digitado errado e criaram outro).</li>
          </ul>
          <p>Mesmo entrando, quem não tem cadastro <b>não vê nenhum módulo</b> do Portal: sem cadastro não há permissões. Para liberar, use <b>Cadastrar no Portal</b>. Login de teste ou de quem saiu e não está no app de vendas pode ser apagado.</p>
        </div>
      )}
      {erro && <p className="csc-erro">{erro}</p>}
      {doApp.length > 0 && <>
        <h4 className="csc-grupo"><Smartphone size={14} />Usados no app de vendas <span>{doApp.length}</span></h4>
        <div className="csc-grade">{doApp.map(cartao)}</div>
      </>}
      {soltas.length > 0 && <>
        <h4 className="csc-grupo"><KeyRound size={14} />Sem uso em nenhum app <span>{soltas.length}</span></h4>
        <div className="csc-grade">{soltas.map(cartao)}</div>
      </>}
    </section>
  )
}

const ESTILO_CSC = `
@keyframes cscEntra { from { opacity: 0; transform: translateY(8px) } }
.csc { margin-top: 32px; display: grid; gap: 14px }
.csc-cab { display: flex; gap: 12px; align-items: center; flex-wrap: wrap } .csc-cab > div { display: grid; flex: 1; min-width: 240px }
.csc-cab-ic { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; color: #d97706; background: #fef3c7 }
.csc-cab b { font-size: 17px; font-weight: 500; color: var(--portal-text, #0f172a); display: flex; align-items: center; gap: 8px } .csc-cab b em { font-style: normal; font-size: 12.5px; color: #b45309; background: #fef3c7; border-radius: 99px; padding: 1px 9px }
.csc-cab small { font-size: 13px; color: #64748b }
.csc-help { display: inline-flex; gap: 6px; align-items: center; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 8px 14px; font-family: inherit; font-size: 13px; color: #334155; cursor: pointer } .csc-help:hover, .csc-help.on { border-color: #0f172a; color: #0f172a }
.csc-explica { border: 1px solid #e2e8f0; background: linear-gradient(180deg, #f8fafc, #fefefe); border-radius: 16px; padding: 14px 18px; font-size: 13.5px; color: #334155; line-height: 1.6; animation: cscEntra .25s both } .csc-explica p { margin: 0 0 8px } .csc-explica ul { margin: 0 0 8px; padding-left: 18px; display: grid; gap: 4px } .csc-explica b { font-weight: 500; color: #0f172a }
.csc-erro { margin: 0; font-size: 13px; color: #991b1b; background: #fef2f2; border-radius: 10px; padding: 8px 12px }
.csc-grupo { margin: 4px 0 0; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 500; color: #64748b; text-transform: uppercase; letter-spacing: .5px } .csc-grupo span { font-size: 11.5px; background: #f1f5f9; color: #475569; border-radius: 99px; padding: 1px 8px; text-transform: none; letter-spacing: 0 }
.csc-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 10px }
.csc-c { display: grid; gap: 9px; align-content: start; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; padding: 14px 16px; animation: cscEntra .35s var(--d) both; transition: transform .15s, box-shadow .2s } .csc-c:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,23,42,.08) } .csc-c.apagando { opacity: .5 }
.csc-topo { display: flex; gap: 10px; align-items: center } .csc-id { display: grid; min-width: 0 } .csc-id b { font-size: 14.5px; font-weight: 500; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .csc-id small { font-size: 12.5px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.csc-av { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; font-size: 15px; color: #fefefe; background: #94a3b8 } .csc-av.vendedor { background: linear-gradient(135deg, #ef4444, #b91c1c) } .csc-av.supervisor { background: linear-gradient(135deg, #3b82f6, #1d4ed8) }
.csc-chips { display: flex; gap: 5px; flex-wrap: wrap } .csc-chip { display: inline-flex; gap: 4px; align-items: center; font-size: 11.5px; border-radius: 99px; padding: 3px 9px; background: #f1f5f9; color: #475569 }
.csc-chip.vendedor { background: #fee2e2; color: #b91c1c } .csc-chip.supervisor { background: #dbeafe; color: #1d4ed8 } .csc-chip.inativo { background: #f1f5f9; color: #94a3b8; text-decoration: line-through } .csc-chip.uso { background: #dcfce7; color: #166534 } .csc-chip.nunca { background: #fef3c7; color: #92400e }
.csc-criada { font-size: 11.5px; color: #94a3b8 }
.csc-acoes { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 2px }
.csc-b { display: inline-flex; gap: 6px; align-items: center; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 999px; padding: 7px 13px; font-family: inherit; font-size: 12.5px; color: #334155; cursor: pointer } .csc-b.verde { border-color: #bbf7d0; background: #f0fdf4; color: #15803d } .csc-b.verde:hover { background: #dcfce7 }
.csc-b.perigo.cheio { background: #dc2626; border-color: #dc2626; color: #fefefe }
.csc-ic { width: 32px; height: 32px; border-radius: 50%; border: 1px solid #e2e8f0; background: #fefefe; color: #475569; display: grid; place-items: center; cursor: pointer } .csc-ic:hover { border-color: #1d4ed8; color: #1d4ed8 } .csc-ic.perigo:hover { border-color: #dc2626; color: #dc2626; background: #fef2f2 }
.csc-pergunta { font-size: 12.5px; color: #991b1b }
`
