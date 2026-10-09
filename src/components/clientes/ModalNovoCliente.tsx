'use client'

// Formulário "Novo cliente" (Pasta Clientes e atalho do POS). Cria no Omie pela
// rota /api/clientes/criar com as MESMAS regras do servidor (lib/clientes/
// novo-cliente.ts) — valida antes de enviar pra não dar erro no Omie.
// CNPJ preenche pela Receita (BrasilAPI); CEP preenche endereço + IBGE (ViaCEP).
import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Search, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  EMPRESAS_CLIENTE, LIMITES, UFS, soDigitos, validarNovoCliente, type FormNovoCliente,
} from '@/lib/clientes/novo-cliente'

export type ClienteCriado = {
  cod_cli: number; empresa: string; ja_existia?: boolean; aviso?: string
  /** formato da lista do POS (chave OMIE:<cod>) */
  cliente: { chave: string; display: string; razao: string; fantasia: string; cnpj: string; endereco: string }
  form: FormNovoCliente
}

const VAZIO: FormNovoCliente = {
  empresa: 'Nova Tratores', cnpj_cpf: '', razao_social: '', nome_fantasia: '', email: '', telefone: '',
  cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', cidade_ibge: '',
  inscricao_estadual: '', isento_ie: false,
}

const LBL: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }
const INP: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px', borderRadius: 9, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #0f172a)', fontSize: 13.5, outline: 'none' }
const SECAO: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.6, margin: '18px 0 10px', display: 'flex', alignItems: 'center', gap: 8 }

function Campo({ rotulo, children, contador }: { rotulo: string; children: React.ReactNode; contador?: { atual: number; max: number } }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ ...LBL, display: 'flex', justifyContent: 'space-between' }}>
        <span>{rotulo}</span>
        {contador && contador.atual > contador.max * 0.8 && (
          <span style={{ color: contador.atual > contador.max ? '#DC2626' : '#94A3B8', fontWeight: 700 }}>{contador.atual}/{contador.max}</span>
        )}
      </label>
      {children}
    </div>
  )
}

export default function ModalNovoCliente({ aberto, onFechar, onCriado, empresaPadrao, zIndex = 90000 }: {
  aberto: boolean; onFechar: () => void; onCriado: (c: ClienteCriado) => void; empresaPadrao?: string; zIndex?: number
}) {
  const [f, setF] = useState<FormNovoCliente>({ ...VAZIO })
  const [enviando, setEnviando] = useState(false)
  const [erroServidor, setErroServidor] = useState('')
  const [tentou, setTentou] = useState(false)
  const [buscandoDoc, setBuscandoDoc] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [infoDoc, setInfoDoc] = useState('')

  // abre sempre limpo (setState no callback assíncrono — regra do lint do projeto)
  useEffect(() => {
    if (!aberto) return
    let vivo = true
    Promise.resolve().then(() => {
      if (!vivo) return
      setF({ ...VAZIO, empresa: empresaPadrao && /castro/i.test(empresaPadrao) ? 'Castro Pecas' : 'Nova Tratores' })
      setErroServidor(''); setTentou(false); setInfoDoc('')
    })
    return () => { vivo = false }
  }, [aberto, empresaPadrao])

  const set = (campo: keyof FormNovoCliente, valor: string | boolean) => setF(p => ({ ...p, [campo]: valor }))
  const erros = useMemo(() => validarNovoCliente(f), [f])

  // CEP → endereço + IBGE (ViaCEP)
  const buscarCep = async (cepBruto?: string) => {
    const cep = soDigitos(cepBruto ?? f.cep)
    if (cep.length !== 8) return
    setBuscandoCep(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const j = await r.json()
      if (j?.erro) { setInfoDoc('CEP geral da cidade (comum na zona rural) ou não encontrado — preencha cidade e UF à mão.'); return }
      setF(p => ({
        ...p,
        endereco: p.endereco || j.logradouro || '',
        bairro: p.bairro || j.bairro || '',
        cidade: j.localidade || p.cidade,
        estado: j.uf || p.estado,
        cidade_ibge: j.ibge || p.cidade_ibge,
        complemento: p.complemento || j.complemento || '',
      }))
    } catch { /* sem internet pro ViaCEP: preenche à mão */ } finally { setBuscandoCep(false) }
  }

  // CNPJ → dados da Receita (BrasilAPI)
  const buscarCnpj = async () => {
    const doc = soDigitos(f.cnpj_cpf)
    if (doc.length !== 14) return
    setBuscandoDoc(true); setInfoDoc('')
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`)
      if (!r.ok) { setInfoDoc(r.status === 404 ? 'CNPJ não encontrado na Receita — confira os números.' : 'A consulta da Receita está fora do ar agora — preencha à mão.'); return }
      const j = await r.json()
      const tel = String(j.ddd_telefone_1 || '').replace(/\D/g, '')
      const logradouro = [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ')
      setF(p => ({
        ...p,
        razao_social: p.razao_social || String(j.razao_social || '').slice(0, 120),
        nome_fantasia: p.nome_fantasia || j.nome_fantasia || '',
        cep: p.cep || String(j.cep || ''),
        endereco: p.endereco || logradouro,
        numero: p.numero || String(j.numero || ''),
        complemento: p.complemento || String(j.complemento || ''),
        bairro: p.bairro || j.bairro || '',
        cidade: p.cidade || j.municipio || '',
        estado: p.estado || j.uf || '',
        cidade_ibge: p.cidade_ibge || (j.codigo_municipio_ibge ? String(j.codigo_municipio_ibge) : ''),
        telefone: p.telefone || (tel.length >= 10 ? tel : ''),
        email: p.email || String(j.email || '').toLowerCase(),
      }))
      const situacao = String(j.descricao_situacao_cadastral || '')
      setInfoDoc(situacao && !/ativa/i.test(situacao) ? `Atenção: situação na Receita = ${situacao}.` : 'Dados preenchidos pela Receita — confira antes de criar.')
      if (j.cep) buscarCep(String(j.cep))
    } catch { setInfoDoc('Não consegui consultar a Receita agora — preencha à mão.') } finally { setBuscandoDoc(false) }
  }

  const criar = async () => {
    setTentou(true); setErroServidor('')
    if (erros.length) return
    setEnviando(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const r = await fetch('/api/clientes/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(f),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) { setErroServidor(j?.error || j?.erro || `Erro ${r.status}`); return }
      onCriado({ cod_cli: j.cod_cli, empresa: j.empresa, ja_existia: j.ja_existia, aviso: j.aviso, cliente: j.cliente, form: f })
    } catch {
      setErroServidor('Sem conexão com o servidor. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  if (!aberto) return null
  const doc = soDigitos(f.cnpj_cpf)
  const ehCnpj = doc.length === 14

  return (
    <div onClick={e => { if (e.target === e.currentTarget && !enviando) onFechar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 16, width: 640, maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px', borderBottom: '1px solid #F1F5F9' }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: '#FEF2F2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={19} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--portal-text, #0f172a)' }}>Novo cliente</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>Cria no Omie e já aparece no portal (o Omie copia para a outra empresa).</div>
          </div>
          <button onClick={onFechar} disabled={enviando} title="Fechar"
            style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #E5E7EB', background: 'var(--portal-bg-secondary, #f8fafc)', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '4px 22px 18px', overflowY: 'auto' }}>
          <div style={SECAO}>Identificação</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
            <Campo rotulo="Empresa *">
              <select value={f.empresa} onChange={e => set('empresa', e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
                {EMPRESAS_CLIENTE.map(e => <option key={e} value={e}>{e === 'Castro Pecas' ? 'Castro Peças' : e}</option>)}
              </select>
            </Campo>
            <Campo rotulo="CNPJ / CPF *">
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={f.cnpj_cpf} onChange={e => set('cnpj_cpf', e.target.value)} onBlur={() => ehCnpj && !f.razao_social && buscarCnpj()}
                  placeholder="Só números ou com máscara" style={INP} />
                <button type="button" onClick={buscarCnpj} disabled={!ehCnpj || buscandoDoc} title="Buscar dados na Receita (CNPJ)"
                  style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 9, border: '1px solid #E5E7EB', background: ehCnpj ? '#EFF6FF' : 'var(--portal-bg-secondary, #f8fafc)', color: ehCnpj ? '#2563EB' : '#CBD5E1', cursor: ehCnpj ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {buscandoDoc ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={15} />}
                </button>
              </div>
            </Campo>
          </div>
          {infoDoc && <div style={{ fontSize: 12, color: /Atenção|não/i.test(infoDoc) ? '#B45309' : '#047857', marginTop: 7 }}>{infoDoc}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 12 }}>
            <Campo rotulo={ehCnpj ? 'Razão social *' : 'Nome completo *'} contador={{ atual: (f.razao_social || '').trim().length, max: LIMITES.razao_social }}>
              <input value={f.razao_social} onChange={e => set('razao_social', e.target.value)} style={INP} />
            </Campo>
            <Campo rotulo="Nome fantasia / como é conhecido">
              <input value={f.nome_fantasia} onChange={e => set('nome_fantasia', e.target.value)} placeholder="(opcional — usa a razão social)" style={INP} />
            </Campo>
          </div>

          <div style={SECAO}>Contato</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
            <Campo rotulo="Telefone"><input value={f.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(14) 99999-9999" style={INP} /></Campo>
            <Campo rotulo="E-mail"><input value={f.email} onChange={e => set('email', e.target.value)} placeholder="nome@dominio.com" style={INP} /></Campo>
          </div>

          <div style={SECAO}>Endereço <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: '#94A3B8', fontSize: 11.5 }}>— necessário para a nota fiscal</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12 }}>
            <Campo rotulo="CEP *">
              <div style={{ position: 'relative' }}>
                <input value={f.cep} onChange={e => { set('cep', e.target.value); if (soDigitos(e.target.value).length === 8) buscarCep(e.target.value) }} placeholder="00000-000" style={INP} />
                {buscandoCep && <RefreshCw size={13} color="#64748B" style={{ position: 'absolute', right: 10, top: 13, animation: 'spin 1s linear infinite' }} />}
              </div>
            </Campo>
            <Campo rotulo="Endereço * (rua, sítio, fazenda)" contador={{ atual: (f.endereco || '').trim().length, max: LIMITES.endereco }}>
              <input value={f.endereco} onChange={e => set('endereco', e.target.value)} style={INP} />
            </Campo>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 12, marginTop: 12 }}>
            <Campo rotulo="Número"><input value={f.numero} onChange={e => set('numero', e.target.value)} placeholder="S/N" style={INP} /></Campo>
            <Campo rotulo="Complemento"><input value={f.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Km, zona rural…" style={INP} /></Campo>
            <Campo rotulo="Bairro"><input value={f.bairro} onChange={e => set('bairro', e.target.value)} style={INP} /></Campo>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12, marginTop: 12 }}>
            <Campo rotulo="Cidade *"><input value={f.cidade} onChange={e => { set('cidade', e.target.value); set('cidade_ibge', '') }} style={INP} /></Campo>
            <Campo rotulo="UF *">
              <select value={f.estado} onChange={e => { set('estado', e.target.value); set('cidade_ibge', '') }} style={{ ...INP, cursor: 'pointer', padding: '0 8px' }}>
                <option value="">—</option>
                {UFS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Campo>
          </div>
          {f.cidade_ibge && <div style={{ fontSize: 11.5, color: '#047857', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle size={12} /> Cidade confirmada pelo CEP (IBGE {f.cidade_ibge})</div>}

          <div style={SECAO}>Fiscal</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
            <Campo rotulo={ehCnpj ? 'Inscrição estadual *' : 'Inscrição estadual (produtor rural)'}>
              <input value={f.inscricao_estadual} onChange={e => set('inscricao_estadual', e.target.value)} disabled={f.isento_ie}
                placeholder={f.isento_ie ? 'ISENTO' : 'Número da IE'} style={{ ...INP, opacity: f.isento_ie ? 0.55 : 1 }} />
            </Campo>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, height: 40, padding: '0 12px', borderRadius: 9, border: '1px solid #E5E7EB', fontSize: 12.5, fontWeight: 600, color: '#334155', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={!!f.isento_ie} onChange={e => { set('isento_ie', e.target.checked); if (e.target.checked) set('inscricao_estadual', '') }} style={{ accentColor: '#DC2626' }} />
              Isento / não contribuinte
            </label>
          </div>

          {/* Pendências (só depois de tentar criar, pra não assustar de cara) */}
          {tentou && erros.length > 0 && (
            <div style={{ marginTop: 16, padding: '11px 14px', borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#92400E', marginBottom: 5 }}><AlertTriangle size={14} /> Falta acertar antes de criar:</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: '#92400E', lineHeight: 1.6 }}>
                {erros.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {erroServidor && (
            <div style={{ marginTop: 12, padding: '11px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 12.5, color: '#B91C1C', fontWeight: 600 }}>{erroServidor}</div>
          )}
        </div>

        {/* Rodapé */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid #F1F5F9', background: 'var(--portal-bg-secondary, #f8fafc)' }}>
          <button onClick={onFechar} disabled={enviando}
            style={{ height: 40, padding: '0 18px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card, #fff)', color: '#334155', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={criar} disabled={enviando}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fefefe', fontSize: 13.5, fontWeight: 700, cursor: enviando ? 'wait' : 'pointer', opacity: enviando ? 0.7 : 1 }}>
            {enviando ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={15} />}
            {enviando ? 'Criando no Omie...' : 'Criar cliente'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
