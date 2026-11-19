'use client'

// Formulário "Novo cliente" (Pasta Clientes e atalho do POS). Cria no Omie pela
// rota /api/clientes/criar com as MESMAS regras do servidor (lib/clientes/
// novo-cliente.ts) — valida antes de enviar pra não dar erro no Omie.
// CNPJ preenche pela Receita (BrasilAPI); CEP preenche endereço + IBGE (ViaCEP).
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Search, RefreshCw, AlertTriangle, CheckCircle, Pencil, Save, Building2, Phone, MapPin, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  EMPRESAS_CLIENTE, LIMITES, UFS, soDigitos, validarNovoCliente, alertaCepGeral, type FormNovoCliente,
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
// borda/fundo do foco ficam na classe .nc-inp (CSS no fim do arquivo) — estilo inline não tem :focus
const INP: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px', borderRadius: 9, border: '1px solid #E2E8F0', background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #0f172a)', fontSize: 13.5 }

/** Título de seção: ícone num quadradinho + nome + linha até o fim */
function Secao({ icone: Icone, titulo, extra, primeira }: { icone: React.ElementType; titulo: string; extra?: string; primeira?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: primeira ? '14px 0 12px' : '24px 0 12px' }}>
      <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 7, background: '#F1F5F9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icone size={13} /></span>
      <h3 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', letterSpacing: 0.6, whiteSpace: 'nowrap' }}>{titulo}</h3>
      {extra && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{extra}</span>}
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: '#EEF1F5', minWidth: 12 }} />
    </div>
  )
}

/** O <label> envolve o campo: clicar no nome já põe o cursor no campo. */
function Campo({ rotulo, children, contador }: { rotulo: string; children: React.ReactNode; contador?: { atual: number; max: number } }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ ...LBL, display: 'flex', justifyContent: 'space-between' }}>
        <span>{rotulo}</span>
        {contador && contador.atual > contador.max * 0.8 && (
          <span style={{ color: contador.atual > contador.max ? '#DC2626' : '#94A3B8', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{contador.atual}/{contador.max}</span>
        )}
      </span>
      {children}
    </label>
  )
}

/** Resultado da edição: o formulário salvo (o mesmo CNPJ foi alterado na Nova e na Castro). */
export type ClienteEditado = { form: FormNovoCliente; resultado: { empresa: string; cod_cli: number; ok: boolean; erro?: string }[] }

export default function ModalNovoCliente({ aberto, onFechar, onCriado, empresaPadrao, zIndex = 90000, edicao, onEditado }: {
  aberto: boolean; onFechar: () => void; onCriado?: (c: ClienteCriado) => void; empresaPadrao?: string; zIndex?: number
  /** modo EDITAR: formulário já preenchido com o cadastro do Omie (CNPJ não muda) */
  edicao?: FormNovoCliente | null
  onEditado?: (c: ClienteEditado) => void
}) {
  const editando = !!edicao
  const [f, setF] = useState<FormNovoCliente>({ ...VAZIO })
  const [enviando, setEnviando] = useState(false)
  const [erroServidor, setErroServidor] = useState('')
  const [tentou, setTentou] = useState(false)
  const [buscandoDoc, setBuscandoDoc] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [infoDoc, setInfoDoc] = useState('')
  // caixa dos avisos (pendências / erro do Omie): fica no fim do formulário, então
  // rola até ela quando o salvar é barrado — antes parecia que o botão "não fazia nada"
  const avisosRef = useRef<HTMLDivElement>(null)
  const mostrarAvisos = () => requestAnimationFrame(() => avisosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))

  // abre sempre limpo (setState no callback assíncrono — regra do lint do projeto)
  useEffect(() => {
    if (!aberto) return
    let vivo = true
    Promise.resolve().then(() => {
      if (!vivo) return
      setF(edicao ? { ...VAZIO, ...edicao } : { ...VAZIO, empresa: empresaPadrao && /castro/i.test(empresaPadrao) ? 'Castro Pecas' : 'Nova Tratores' })
      setErroServidor(''); setTentou(false); setInfoDoc('')
    })
    return () => { vivo = false }
  }, [aberto, empresaPadrao, edicao])

  const set = (campo: keyof FormNovoCliente, valor: string | boolean) => setF(p => ({ ...p, [campo]: valor }))
  const erros = useMemo(() => validarNovoCliente(f), [f])
  const cepGeral = alertaCepGeral(f.cep)

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
    if (erros.length) { mostrarAvisos(); return }
    setEnviando(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const r = await fetch(editando ? '/api/clientes/editar' : '/api/clientes/criar', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(f),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) {
        setErroServidor(j?.error || j?.erro || (r.status === 401 ? 'Sua sessão expirou — saia e entre de novo no portal.' : r.status === 403 ? 'Seu usuário não tem permissão para editar clientes.' : `Erro ${r.status}`))
        mostrarAvisos(); return
      }
      if (editando) { onEditado?.({ form: f, resultado: j.resultado || [] }); return }
      onCriado?.({ cod_cli: j.cod_cli, empresa: j.empresa, ja_existia: j.ja_existia, aviso: j.aviso, cliente: j.cliente, form: f })
    } catch {
      setErroServidor('Sem conexão com o servidor. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  if (!aberto || typeof document === 'undefined') return null
  const doc = soDigitos(f.cnpj_cpf)
  const ehCnpj = doc.length === 14

  // Portal: desenha a janela direto no <body>. Sem isso, se o botão estiver dentro de um
  // painel com z-index/transform (ex.: coluna da esquerda da tela Clientes), os cartões
  // da direita passam na frente da janela, por maior que seja o zIndex dela.
  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget && !enviando) onFechar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nc-titulo" className="nc-janela"
        style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 16, width: 640, maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        {/* Cabeçalho */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 13, padding: '18px 22px', borderBottom: '1px solid #EEF1F5', background: 'linear-gradient(180deg, #FFF7F7, var(--portal-bg-card, #fff))' }}>
          {/* faixa vermelha da marca no topo (mesma da ficha da máquina) */}
          <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #dc2626, #f87171 60%, transparent)' }} />
          <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 11, background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'inset 0 0 0 1px #FECACA' }}>{editando ? <Pencil size={17} /> : <Plus size={19} />}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="nc-titulo" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--portal-text, #0f172a)' }}>{editando ? 'Editar cliente' : 'Novo cliente'}</h2>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>{editando ? 'Altera o cadastro no Omie (Nova e Castro) e no portal.' : 'Cria no Omie e já aparece no portal (o Omie copia para a outra empresa).'}</div>
            {/* na edição, mostra de quem é o cadastro logo no topo */}
            {editando && f.razao_social && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 7, padding: '3px 9px', borderRadius: 999, background: '#F1F5F9', fontSize: 11.5, fontWeight: 700, color: '#334155', maxWidth: '100%', minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.razao_social}</span>
                {f.cnpj_cpf && <span translate="no" style={{ color: '#94A3B8', fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>· {f.cnpj_cpf}</span>}
              </div>
            )}
          </div>
          <button type="button" onClick={onFechar} disabled={enviando} title="Fechar" aria-label="Fechar janela" className="nc-btn-sec"
            style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'var(--portal-bg-card, #fff)', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-start' }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div style={{ padding: '4px 22px 20px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
          <Secao icone={Building2} titulo="Identificação" primeira />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
            <Campo rotulo="Empresa *">
              <select name="empresa" value={f.empresa} onChange={e => set('empresa', e.target.value)} disabled={editando} title={editando ? 'Na edição o cadastro é alterado nas duas empresas' : undefined} className="nc-inp" style={{ ...INP, cursor: editando ? 'default' : 'pointer' }}>
                {EMPRESAS_CLIENTE.map(e => <option key={e} value={e}>{e === 'Castro Pecas' ? 'Castro Peças' : e}</option>)}
              </select>
            </Campo>
            <Campo rotulo="CNPJ / CPF *">
              <div style={{ display: 'flex', gap: 6 }}>
                <input name="cnpj_cpf" value={f.cnpj_cpf} onChange={e => set('cnpj_cpf', e.target.value)} onBlur={() => ehCnpj && !f.razao_social && buscarCnpj()}
                  readOnly={editando} title={editando ? 'O CNPJ/CPF não muda — para outro documento, cadastre um cliente novo' : undefined}
                  inputMode="numeric" autoComplete="off" spellCheck={false} translate="no"
                  placeholder="Ex.: 12.345.678/0001-90…" className="nc-inp" style={{ ...INP, fontVariantNumeric: 'tabular-nums' }} />
                <button type="button" onClick={buscarCnpj} disabled={!ehCnpj || buscandoDoc || editando} title="Buscar dados na Receita (CNPJ)" aria-label="Buscar dados do CNPJ na Receita" className="nc-btn-sec"
                  style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 9, border: '1px solid #E2E8F0', background: ehCnpj && !editando ? '#EFF6FF' : 'var(--portal-bg-secondary, #f8fafc)', color: ehCnpj && !editando ? '#2563EB' : '#CBD5E1', cursor: ehCnpj && !editando ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {buscandoDoc ? <RefreshCw size={15} aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={15} aria-hidden="true" />}
                </button>
              </div>
            </Campo>
          </div>
          <div aria-live="polite">
            {infoDoc && <div style={{ fontSize: 12, color: /Atenção|não/i.test(infoDoc) ? '#B45309' : '#047857', marginTop: 7 }}>{infoDoc}</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 12 }}>
            <Campo rotulo={ehCnpj ? 'Razão social *' : 'Nome completo *'} contador={{ atual: (f.razao_social || '').trim().length, max: LIMITES.razao_social }}>
              <input name="razao_social" autoComplete="off" value={f.razao_social} onChange={e => set('razao_social', e.target.value)} className="nc-inp" style={INP} />
            </Campo>
            <Campo rotulo="Nome fantasia / como é conhecido">
              <input name="nome_fantasia" autoComplete="off" value={f.nome_fantasia} onChange={e => set('nome_fantasia', e.target.value)} placeholder="Opcional — se vazio, usa a razão social…" className="nc-inp" style={INP} />
            </Campo>
          </div>

          <Secao icone={Phone} titulo="Contato" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
            <Campo rotulo="Telefone"><input name="telefone" type="tel" inputMode="tel" autoComplete="off" value={f.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(14) 99999-9999…" className="nc-inp" style={{ ...INP, fontVariantNumeric: 'tabular-nums' }} /></Campo>
            <Campo rotulo="E-mail (pode mais de um)"><input name="email" type="text" inputMode="email" autoComplete="off" spellCheck={false} value={f.email} onChange={e => set('email', e.target.value)} placeholder="nome@dominio.com, outro@dominio.com…" title="Para mais de um e-mail, separe por vírgula" className="nc-inp" style={INP} /></Campo>
          </div>

          <Secao icone={MapPin} titulo="Endereço" extra="necessário para a nota fiscal" />
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12 }}>
            <Campo rotulo="CEP *">
              <div style={{ position: 'relative' }}>
                <input name="cep" inputMode="numeric" autoComplete="off" spellCheck={false} value={f.cep} onChange={e => { set('cep', e.target.value); if (soDigitos(e.target.value).length === 8) buscarCep(e.target.value) }} placeholder="00000-000…" className="nc-inp" style={{ ...INP, fontVariantNumeric: 'tabular-nums' }} />
                {buscandoCep && <RefreshCw size={13} color="#64748B" aria-label="Buscando CEP…" style={{ position: 'absolute', right: 10, top: 13, animation: 'spin 1s linear infinite' }} />}
              </div>
              {cepGeral && <span title={cepGeral} style={{ display: 'flex', gap: 5, alignItems: 'flex-start', marginTop: 5, fontSize: 11, lineHeight: 1.35, color: '#B45309', fontWeight: 600 }}><AlertTriangle size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} /> CEP geral da cidade — a NFS-e pode ser recusada (E0240)</span>}
            </Campo>
            <Campo rotulo="Endereço * (rua, sítio, fazenda)" contador={{ atual: (f.endereco || '').trim().length, max: LIMITES.endereco }}>
              <input name="endereco" autoComplete="off" value={f.endereco} onChange={e => set('endereco', e.target.value)} className="nc-inp" style={INP} />
            </Campo>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 12, marginTop: 12 }}>
            <Campo rotulo="Número"><input name="numero" autoComplete="off" value={f.numero} onChange={e => set('numero', e.target.value)} placeholder="S/N" className="nc-inp" style={INP} /></Campo>
            <Campo rotulo="Complemento"><input name="complemento" autoComplete="off" value={f.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Km, zona rural…" className="nc-inp" style={INP} /></Campo>
            <Campo rotulo="Bairro"><input name="bairro" autoComplete="off" value={f.bairro} onChange={e => set('bairro', e.target.value)} className="nc-inp" style={INP} /></Campo>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12, marginTop: 12 }}>
            <Campo rotulo="Cidade *"><input name="cidade" autoComplete="off" value={f.cidade} onChange={e => { set('cidade', e.target.value); set('cidade_ibge', '') }} className="nc-inp" style={INP} /></Campo>
            <Campo rotulo="UF *">
              <select name="estado" value={f.estado} onChange={e => { set('estado', e.target.value); set('cidade_ibge', '') }} className="nc-inp" style={{ ...INP, cursor: 'pointer', padding: '0 8px' }}>
                <option value="">—</option>
                {UFS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Campo>
          </div>
          {f.cidade_ibge && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '4px 10px', borderRadius: 999, background: '#ECFDF5', border: '1px solid #A7F3D0', fontSize: 11.5, fontWeight: 600, color: '#047857' }}>
              <CheckCircle size={12} aria-hidden="true" /> Cidade confirmada pelo CEP <span style={{ fontWeight: 500, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>· IBGE {f.cidade_ibge}</span>
            </div>
          )}

          <Secao icone={Receipt} titulo="Fiscal" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
            <Campo rotulo={ehCnpj ? 'Inscrição estadual *' : 'Inscrição estadual (produtor rural)'}>
              <input name="inscricao_estadual" inputMode="numeric" autoComplete="off" spellCheck={false} value={f.inscricao_estadual} onChange={e => set('inscricao_estadual', e.target.value)} disabled={f.isento_ie}
                placeholder={f.isento_ie ? 'ISENTO' : 'Número da IE…'} className="nc-inp" style={{ ...INP, fontVariantNumeric: 'tabular-nums' }} />
            </Campo>
            {/* o quadradinho e o texto são uma área só de clique */}
            <label className="nc-check" data-on={f.isento_ie ? '1' : '0'} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 13px', borderRadius: 9, border: `1px solid ${f.isento_ie ? '#FCA5A5' : '#E2E8F0'}`, background: f.isento_ie ? '#FEF2F2' : 'var(--portal-bg-card, #fff)', fontSize: 12.5, fontWeight: 600, color: f.isento_ie ? '#B91C1C' : '#334155', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
              <input type="checkbox" name="isento_ie" checked={!!f.isento_ie} onChange={e => { set('isento_ie', e.target.checked); if (e.target.checked) set('inscricao_estadual', '') }} style={{ accentColor: '#DC2626', width: 15, height: 15, margin: 0 }} />
              Isento / não contribuinte
            </label>
          </div>

          {/* Pendências (só depois de tentar criar, pra não assustar de cara) */}
          <div aria-live="polite" ref={avisosRef} style={{ scrollMarginBottom: 16 }}>
            {tentou && erros.length > 0 && (
              <div style={{ marginTop: 16, padding: '11px 14px', borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#92400E', marginBottom: 5 }}><AlertTriangle size={14} aria-hidden="true" /> Falta acertar antes de {editando ? 'salvar' : 'criar'}:</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: '#92400E', lineHeight: 1.6 }}>
                  {erros.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            {cepGeral && (
              <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 12.5, color: '#92400E', lineHeight: 1.5, display: 'flex', gap: 8 }}>
                <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} /> <span>{cepGeral}</span>
              </div>
            )}
            {erroServidor && (
              <div role="alert" style={{ marginTop: 12, padding: '11px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 12.5, color: '#B91C1C', fontWeight: 600 }}>{erroServidor}</div>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderTop: '1px solid #EEF1F5', background: 'var(--portal-bg-secondary, #f8fafc)' }}>
          {/* rodapé avisa também — ele está sempre na tela, a caixa de avisos não */}
          {erroServidor || (tentou && erros.length > 0) ? (
            <button type="button" onClick={mostrarAvisos} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 12, fontWeight: 700, color: erroServidor ? '#B91C1C' : '#B45309', cursor: 'pointer', textAlign: 'left' }}>
              <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{erroServidor ? 'Não salvou — ver o motivo' : `${erros.length} ${erros.length === 1 ? 'coisa' : 'coisas'} pra acertar — ver`}</span>
            </button>
          ) : <span style={{ flex: 1, fontSize: 11.5, color: '#94A3B8' }}>* obrigatório</span>}
          <button type="button" onClick={onFechar} disabled={enviando} className="nc-btn-sec"
            style={{ height: 40, padding: '0 18px', borderRadius: 10, border: '1px solid #E2E8F0', background: 'var(--portal-bg-card, #fff)', color: '#334155', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={criar} disabled={enviando} className="nc-btn-prim"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fefefe', fontSize: 13.5, fontWeight: 700, cursor: enviando ? 'wait' : 'pointer', opacity: enviando ? 0.7 : 1, boxShadow: '0 1px 2px rgba(185,28,28,0.25)' }}>
            {enviando ? <RefreshCw size={15} aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }} /> : editando ? <Save size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            {enviando ? (editando ? 'Salvando no Omie…' : 'Criando no Omie…') : editando ? 'Salvar alterações' : 'Criar cliente'}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes ncEntra { from { opacity: 0; transform: translateY(8px) scale(0.98) } to { opacity: 1; transform: none } }
        .nc-janela { animation: ncEntra 0.2s ease-out }
        /* campos: destaque azul ao clicar (antes não aparecia nada) */
        .nc-inp { transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s; outline: none }
        .nc-inp:hover:not(:disabled):not([readonly]) { border-color: #CBD5E1 !important }
        .nc-inp:focus-visible, .nc-inp:focus { border-color: #3B82F6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.18) }
        .nc-inp:disabled, .nc-inp[readonly] { background: var(--portal-bg-secondary, #f8fafc) !important; color: #64748B !important; cursor: not-allowed !important }
        .nc-inp::placeholder { color: #A0AEC0 }
        .nc-check { transition: border-color 0.15s, background-color 0.15s }
        .nc-check:hover { border-color: #CBD5E1 !important }
        .nc-check:has(input:focus-visible) { outline: 2px solid #3B82F6; outline-offset: 2px }
        .nc-btn-sec { transition: background-color 0.15s, border-color 0.15s }
        .nc-btn-sec:hover:not(:disabled) { border-color: #CBD5E1 !important; background: #F1F5F9 !important }
        .nc-btn-prim { transition: transform 0.15s, box-shadow 0.15s, filter 0.15s }
        .nc-btn-prim:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(220,38,38,0.32) !important; filter: brightness(1.05) }
        .nc-btn-prim:active:not(:disabled) { transform: translateY(0) }
        .nc-btn-sec:focus-visible, .nc-btn-prim:focus-visible { outline: 2px solid #3B82F6; outline-offset: 2px }
        @media (prefers-reduced-motion: reduce) { .nc-janela { animation: none } .nc-btn-prim:hover:not(:disabled) { transform: none } }
      `}</style>
    </div>,
    document.body,
  )
}
