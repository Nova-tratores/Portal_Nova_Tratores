'use client'
// Fornecedor da conta a pagar (Caixa › Lançar conta). Busca no cadastro `Fornecedores` (o mesmo das Requisições;
// o envio ao Omie acha o fornecedor por lá e exige CPF/CNPJ) e, se não existir, cadastra ali mesmo: CNPJ → BrasilAPI
// e CEP → ViaCEP, como o formulário das Requisições. O Omie pede o endereço inteiro quando precisa criar o
// fornecedor do lado dele — por isso os campos de endereço.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuditLog } from '@/hooks/useAuditLog'

export type FornecedorEscolhido = { id: number | string; nome: string; documento: string; cidade?: string | null; estado?: string | null }

type Linha = { id: number | string; nome: string; 'cpf/cnpj': string | null; cidade: string | null; estado: string | null }

const soDig = (s: string | null | undefined) => String(s || '').replace(/\D/g, '')
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function fmtDoc(d: string) {
  const x = soDig(d)
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return d || ''
}

let cache: Linha[] | null = null
async function carregar(forcar = false): Promise<Linha[]> {
  if (cache && !forcar) return cache
  const { data, error } = await supabase.from('Fornecedores').select('id, nome, "cpf/cnpj", cidade, estado').order('nome', { ascending: true })
  if (error) throw error
  cache = (data || []) as unknown as Linha[]
  return cache
}

const inp: React.CSSProperties = { width: '100%', minHeight: 42, padding: '9px 12px', border: '1px solid var(--portal-border)', borderRadius: 8, background: 'var(--portal-surface, #fff)', color: 'var(--portal-text)', fontSize: 15, boxSizing: 'border-box' }
const rot: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--portal-text-muted)', marginBottom: 5 }

export default function FornecedorPicker({ valor, onChange }: { valor: FornecedorEscolhido | null; onChange: (f: FornecedorEscolhido | null) => void }) {
  const [lista, setLista] = useState<Linha[]>([])
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState('')
  const [novo, setNovo] = useState(false)

  useEffect(() => { carregar().then(setLista).catch((e) => setErro(e.message || 'Não consegui ler os fornecedores.')) }, [])

  const achados = useMemo(() => {
    const t = semAcento(busca.trim())
    if (!t) return []
    const d = soDig(busca)
    return lista.filter((f) => semAcento(f.nome || '').includes(t) || (d.length >= 4 && soDig(f['cpf/cnpj']).includes(d))).slice(0, 30)
  }, [busca, lista])

  const escolher = (f: Linha) => {
    onChange({ id: f.id, nome: (f.nome || '').trim(), documento: soDig(f['cpf/cnpj']), cidade: f.cidade, estado: f.estado })
    setBusca(''); setAberto(false)
  }

  if (valor) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--portal-border)', borderRadius: 8, background: 'var(--portal-bg-secondary)' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 600, color: 'var(--portal-text)' }}>{valor.nome}</div>
          <div style={{ fontSize: 13, color: valor.documento ? 'var(--portal-text-muted)' : '#dc2626' }}>
            {valor.documento ? fmtDoc(valor.documento) : 'Sem CPF/CNPJ no cadastro — o Omie exige'}
            {valor.cidade ? ` · ${valor.cidade}${valor.estado ? `/${valor.estado}` : ''}` : ''}
          </div>
        </div>
        <button type="button" onClick={() => onChange(null)} style={{ minHeight: 40, padding: '0 14px', border: '1px solid var(--portal-border)', borderRadius: 8, background: 'transparent', color: 'var(--portal-text)', cursor: 'pointer' }}>Trocar</button>
      </div>
    )
  }

  if (novo) {
    return <CadastroRapido inicial={busca} onCancelar={() => setNovo(false)} onCriado={async (f) => { setNovo(false); setLista(await carregar(true)); onChange(f) }} />
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={inp}
        placeholder="Buscar fornecedor por nome ou CNPJ…"
        value={busca}
        onChange={(e) => { setBusca(e.target.value); setAberto(true) }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 180)}
      />
      {erro && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{erro}</div>}
      {aberto && busca.trim() && (
        <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4, maxHeight: 300, overflowY: 'auto', background: 'var(--portal-surface, #fff)', border: '1px solid var(--portal-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)' }}>
          {achados.map((f) => (
            <button key={f.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(f)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', minHeight: 44, border: 'none', borderBottom: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', cursor: 'pointer' }}>
              <div style={{ fontWeight: 500 }}>{f.nome}</div>
              <div style={{ fontSize: 12, color: soDig(f['cpf/cnpj']) ? 'var(--portal-text-muted)' : '#dc2626' }}>
                {soDig(f['cpf/cnpj']) ? fmtDoc(f['cpf/cnpj'] || '') : 'sem CPF/CNPJ'}{f.cidade ? ` · ${f.cidade}` : ''}
              </div>
            </button>
          ))}
          {achados.length === 0 && <div style={{ padding: 12, fontSize: 14, color: 'var(--portal-text-muted)' }}>Nenhum fornecedor com esse nome.</div>}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setNovo(true)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px', minHeight: 44, border: 'none', background: 'transparent', color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}>
            + Cadastrar fornecedor novo
          </button>
        </div>
      )}
    </div>
  )
}

const VAZIO = { nome: '', doc: '', numero: '', email: '', cep: '', endereco: '', endereco_numero: '', bairro: '', cidade: '', estado: '' }

function CadastroRapido({ inicial, onCancelar, onCriado }: { inicial: string; onCancelar: () => void; onCriado: (f: FornecedorEscolhido) => void }) {
  const [f, setF] = useState(() => (soDig(inicial).length >= 11 ? { ...VAZIO, doc: inicial } : { ...VAZIO, nome: inicial }))
  const [status, setStatus] = useState('')
  const [salvando, setSalvando] = useState(false)
  const { log: auditLog } = useAuditLog()
  const set = (k: keyof typeof VAZIO, v: string) => setF((p) => ({ ...p, [k]: v }))

  const buscarCnpj = async () => {
    const d = soDig(f.doc)
    if (d.length !== 14) return
    setStatus('Buscando o CNPJ…')
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`)
      if (!r.ok) throw new Error()
      const j = await r.json()
      setF((p) => ({
        ...p,
        nome: p.nome || j.nome_fantasia || j.razao_social || '',
        numero: p.numero || String(j.ddd_telefone_1 || '').replace(/\D/g, ''),
        email: p.email || (j.email ? String(j.email).toLowerCase() : ''),
        cep: soDig(j.cep) || p.cep,
        endereco: [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ') || p.endereco,
        endereco_numero: j.numero || p.endereco_numero,
        bairro: j.bairro || p.bairro,
        cidade: j.municipio || p.cidade,
        estado: j.uf || p.estado,
      }))
      setStatus('Dados da Receita preenchidos — confira.')
    } catch { setStatus('Não achei o CNPJ na Receita — preencha à mão.') }
  }

  const buscarCep = async () => {
    const d = soDig(f.cep)
    if (d.length !== 8) return
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`)
      const j = await r.json()
      if (j.erro) return
      setF((p) => ({ ...p, endereco: p.endereco || j.logradouro || '', bairro: p.bairro || j.bairro || '', cidade: j.localidade || p.cidade, estado: j.uf || p.estado }))
    } catch { /* sem CEP: segue à mão */ }
  }

  const salvar = async () => {
    const doc = soDig(f.doc)
    if (!f.nome.trim()) { setStatus('Informe o nome.'); return }
    if (doc.length !== 11 && doc.length !== 14) { setStatus('CPF (11 dígitos) ou CNPJ (14) é obrigatório — o Omie exige.'); return }
    setSalvando(true)
    try {
      const existentes = await carregar(true)
      const igual = existentes.find((x) => soDig(x['cpf/cnpj']) === doc)
      if (igual) {
        onCriado({ id: igual.id, nome: igual.nome, documento: doc, cidade: igual.cidade, estado: igual.estado })
        return
      }
      const novo = {
        nome: f.nome.trim().toUpperCase(), 'cpf/cnpj': fmtDoc(doc), numero: f.numero || null, email: f.email || null,
        cep: f.cep || null, endereco: f.endereco || null, endereco_numero: f.endereco_numero || null,
        bairro: f.bairro || null, cidade: f.cidade || null, estado: f.estado ? f.estado.toUpperCase() : null,
      }
      const { data, error } = await supabase.from('Fornecedores').insert([novo]).select('id, nome, cidade, estado').single()
      if (error) throw error
      auditLog({ sistema: 'financeiro', acao: 'criar', entidade: 'fornecedor', entidade_id: String(data.id), entidade_label: novo.nome, detalhes: { origem: 'lancar-conta' } })
      onCriado({ id: data.id, nome: data.nome, documento: doc, cidade: data.cidade, estado: data.estado })
    } catch (e) {
      setStatus('Não consegui cadastrar: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setSalvando(false) }
  }

  const campo = (k: keyof typeof VAZIO, label: string, extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <div><label style={rot}>{label}</label><input style={inp} value={f[k]} onChange={(e) => set(k, e.target.value)} {...extra} /></div>
  )

  return (
    <div style={{ border: '1px solid #bfdbfe', background: 'rgba(37,99,235,.05)', borderRadius: 10, padding: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 10, color: 'var(--portal-text)' }}>Cadastrar fornecedor</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
        {campo('doc', 'CPF ou CNPJ *', { onBlur: buscarCnpj, inputMode: 'numeric' })}
        {campo('nome', 'Nome *')}
        {campo('numero', 'Telefone', { inputMode: 'tel' })}
        {campo('email', 'E-mail', { type: 'email' })}
        {campo('cep', 'CEP', { onBlur: buscarCep, inputMode: 'numeric' })}
        {campo('endereco', 'Endereço')}
        {campo('endereco_numero', 'Número')}
        {campo('bairro', 'Bairro')}
        {campo('cidade', 'Cidade')}
        {campo('estado', 'UF', { maxLength: 2 })}
      </div>
      {status && <div style={{ fontSize: 13, marginTop: 8, color: 'var(--portal-text-muted)' }}>{status}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onCancelar} style={{ minHeight: 42, padding: '0 16px', border: '1px solid var(--portal-border)', borderRadius: 8, background: 'transparent', color: 'var(--portal-text)', cursor: 'pointer' }}>Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando} style={{ minHeight: 42, padding: '0 18px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fefefe', fontWeight: 600, cursor: 'pointer', opacity: salvando ? 0.6 : 1 }}>{salvando ? 'Salvando…' : 'Cadastrar e usar'}</button>
      </div>
    </div>
  )
}
