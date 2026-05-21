'use client'
// Componentes da integração Omie — Contas a Pagar.
// Reutilizados no form "Novo Registro Financeiro" e no modal do Painel.
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Building2, FolderOpen, Landmark, Tag, Send, CheckCircle, RefreshCw, Users, FileText, Sparkles, X, Briefcase, Barcode, KeyRound, AlertTriangle, Loader2 } from 'lucide-react'
import ChecklistValidacao from './ChecklistValidacao'
import { lerChaveNFeDeUrl } from '@/lib/financeiro/leitor-anexos'
import { supabase } from '@/lib/supabase'

const EMPRESAS = ['Nova Tratores', 'Castro Peças']

// Hook: carrega categorias / contas / projetos / vendedores / tipos de documento do Omie para uma empresa.
function useOmieOpcoes(empresa) {
  const [opcoes, setOpcoes] = useState({ categorias: [], contas: [], projetos: [], vendedores: [], tiposDocumento: [], departamentos: [], contaCorrentePadrao: null })
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async (emp) => {
    setCarregando(true); setErro('')
    try {
      const res = await fetch(`/api/financeiro/contas-pagar/omie?empresa=${encodeURIComponent(emp)}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.erro || 'Falha ao carregar opções do Omie')
      setOpcoes({
        categorias: data.categorias || [],
        contas: data.contas || [],
        projetos: data.projetos || [],
        vendedores: data.vendedores || [],
        tiposDocumento: data.tiposDocumento || [],
        departamentos: data.departamentos || [],
        contaCorrentePadrao: data.contaCorrentePadrao || null,
      })
    } catch (e) {
      setErro(e.message || String(e))
      setOpcoes({ categorias: [], contas: [], projetos: [], vendedores: [], tiposDocumento: [], departamentos: [], contaCorrentePadrao: null })
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { if (empresa) carregar(empresa) }, [empresa, carregar])

  // Força refresh do cache no servidor e recarrega
  const forcarRefresh = useCallback(async () => {
    if (!empresa) return
    setCarregando(true)
    try {
      await fetch('/api/financeiro/contas-pagar/omie/refresh-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa }),
      })
      await carregar(empresa)
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setCarregando(false)
    }
  }, [empresa, carregar])

  return { opcoes, carregando, erro, recarregar: () => carregar(empresa), forcarRefresh }
}

// Escolhe uma categoria de despesa padrão "sensata" a partir da lista.
function categoriaPadrao(categorias) {
  if (!categorias || categorias.length === 0) return ''
  const porTexto = (t) => categorias.find(c => (c.descricao || '').toLowerCase().includes(t))
  const escolha = porTexto('fornecedor') || porTexto('peça') || porTexto('peca') || porTexto('mercadoria') || porTexto('custo') || categorias[0]
  return escolha?.codigo || ''
}

// Sugere um departamento a partir do texto do contexto (descrição/motivo da conta —
// que já carrega os títulos das requisições importadas). Casa palavras significativas
// do nome de cada departamento contra o texto. Retorna '' se nada casar.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
function sugerirDepartamento(departamentos, contextoTexto) {
  if (!departamentos || departamentos.length === 0 || !contextoTexto) return ''
  const alvo = norm(contextoTexto)
  const STOPWORDS = new Set(['servicos', 'servico', 'em', 'de', 'da', 'do', 'e', 'oficina', 'geral'])
  for (const dep of departamentos) {
    const palavras = norm(dep.descricao)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(p => p.length > 3 && !STOPWORDS.has(p))
    if (palavras.some(p => alvo.includes(p))) return String(dep.codigo)
  }
  return ''
}

// ---------------------------------------------------------------------
// Pílula visual "Auto (origem)" — quando o campo veio do resolver-req
// ---------------------------------------------------------------------
function PilulaAuto({ origem, aproximado, onLimpar }) {
  if (!origem) return null
  const cor = aproximado ? { bg: '#fef3c7', fg: '#92400e', borda: '#fcd34d' } : { bg: '#dbeafe', fg: '#1d4ed8', borda: '#93c5fd' }
  const titulo = aproximado ? 'Match aproximado — confira' : `Pré-preenchido de ${origem}`
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: cor.bg, color: cor.fg, border: `1px solid ${cor.borda}`, fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '999px', marginLeft: '6px', verticalAlign: '2px' }} title={titulo}>
      <Sparkles size={9} />
      {aproximado ? 'auto · aproximado' : `auto · ${origem}`}
      {onLimpar && (
        <button type="button" onClick={onLimpar} style={{ background: 'none', border: 'none', color: cor.fg, cursor: 'pointer', padding: 0, marginLeft: '2px', display: 'inline-flex' }} title="Limpar e selecionar manualmente">
          <X size={10} />
        </button>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------
// Combobox com busca (vendedores / projetos com listas grandes)
// ---------------------------------------------------------------------
function Combobox({ value, onChange, opcoes, getKey, getLabel, placeholder, disabled, style, allowClear = true }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const selecionado = useMemo(() => opcoes.find(o => String(getKey(o)) === String(value)), [opcoes, value, getKey])
  const filtradas = useMemo(() => {
    if (!busca.trim()) return opcoes.slice(0, 50)
    const q = busca.toLowerCase()
    return opcoes.filter(o => (getLabel(o) || '').toLowerCase().includes(q)).slice(0, 50)
  }, [opcoes, busca, getLabel])

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        onClick={() => !disabled && setAberto(v => !v)}
        disabled={disabled}
        style={{
          width: '100%', textAlign: 'left',
          padding: '12px 14px', borderRadius: '8px', border: '1px solid #e5e7eb',
          background: disabled ? '#f1f5f9' : '#fff',
          color: selecionado ? '#1e293b' : '#94a3b8',
          fontSize: '15px', fontFamily: 'Montserrat, sans-serif', cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selecionado ? getLabel(selecionado) : (placeholder || 'Selecione...')}
        </span>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>▾</span>
      </button>

      {aberto && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1000, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 8px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ padding: '8px' }}>
            <input
              type="text" value={busca} onChange={e => setBusca(e.target.value)} autoFocus
              placeholder="Buscar..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            />
          </div>
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {allowClear && (
              <div onClick={() => { onChange(''); setAberto(false); setBusca('') }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
                — Limpar seleção —
              </div>
            )}
            {filtradas.length === 0 && (
              <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                {opcoes.length === 0 ? 'Lista vazia' : 'Nenhum resultado'}
              </div>
            )}
            {filtradas.map((o) => (
              <div
                key={String(getKey(o))}
                onClick={() => { onChange(String(getKey(o))); setAberto(false); setBusca('') }}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#1e293b', background: String(getKey(o)) === String(value) ? '#eff6ff' : 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = String(getKey(o)) === String(value) ? '#eff6ff' : 'transparent'}
              >
                {getLabel(o)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// <CamposOmieContaPagar> — os selects (empresa / categoria / conta / projeto / vendedor / tipo doc).
// `value` = { empresa, codigoCategoria, idContaCorrente, codigoProjeto, codigoVendedor, codigoTipoDocumento }
// `autoOrigem` = { projeto?: 'os'|'placa'|'chassi', projetoAproximado?, vendedor?: 'solicitante', vendedorAproximado? }
// Tema "form" (formulário denso) ou "modal" (modal com fontes maiores).
// ---------------------------------------------------------------------
export function CamposOmieContaPagar({ value, onChange, tema = 'form', autoOrigem = {}, contextoTexto = '' }) {
  const { opcoes, carregando, erro, recarregar, forcarRefresh } = useOmieOpcoes(value.empresa)
  const isModal = tema === 'modal'

  const labelStyle = isModal
    ? { fontSize: '14px', color: '#64748b', textTransform: 'uppercase', fontWeight: '500', marginBottom: '8px', display: 'block' }
    : { display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }
  const selStyle = isModal
    ? { width: '100%', padding: '13px 14px', border: '1px solid #dcdde1', borderRadius: '10px', outline: 'none', background: '#fff', color: '#1e293b', fontSize: '16px', fontFamily: 'Montserrat, sans-serif' }
    : { width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', outline: 'none', background: '#ffffff', color: '#1e293b', fontSize: '15px', boxSizing: 'border-box', fontFamily: 'Montserrat, sans-serif' }

  // Quando muda a empresa ou chegam novas opções, garante defaults preenchidos.
  useEffect(() => {
    if (carregando) return
    const patch = {}
    if (!value.codigoCategoria && opcoes.categorias.length > 0) patch.codigoCategoria = categoriaPadrao(opcoes.categorias)
    if (!value.idContaCorrente) {
      const padrao = opcoes.contas.find(c => String(c.id) === String(opcoes.contaCorrentePadrao))
      patch.idContaCorrente = String((padrao || opcoes.contas[0])?.id || opcoes.contaCorrentePadrao || '')
    }
    // Pré-seleção do departamento a partir do contexto da despesa (editável depois).
    if (!value.codigoDepartamento && opcoes.departamentos.length > 0) {
      const sugerido = sugerirDepartamento(opcoes.departamentos, contextoTexto)
      if (sugerido) patch.codigoDepartamento = sugerido
    }
    if (Object.keys(patch).length) onChange({ ...value, ...patch })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opcoes, carregando])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isModal ? '18px' : '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isModal ? '18px' : '14px' }}>
        <div>
          <label style={labelStyle}><Building2 size={13} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Empresa</label>
          <select
            style={selStyle}
            value={value.empresa}
            onChange={e => onChange({ empresa: e.target.value, codigoCategoria: '', idContaCorrente: '', codigoProjeto: '', codigoVendedor: '', codigoTipoDocumento: '', codigoDepartamento: '' })}
          >
            {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}><Landmark size={13} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Conta Corrente</label>
          <select style={selStyle} value={value.idContaCorrente || ''} onChange={e => onChange({ ...value, idContaCorrente: e.target.value })} disabled={carregando}>
            <option value="">{carregando ? 'Carregando...' : 'Selecione...'}</option>
            {opcoes.contas.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isModal ? '18px' : '14px' }}>
        <div>
          <label style={labelStyle}><Tag size={13} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Categoria (despesa)</label>
          <select style={selStyle} value={value.codigoCategoria || ''} onChange={e => onChange({ ...value, codigoCategoria: e.target.value })} disabled={carregando}>
            <option value="">{carregando ? 'Carregando...' : 'Selecione...'}</option>
            {opcoes.categorias.map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>
            <FolderOpen size={13} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
            Projeto (placa/máquina)
            <PilulaAuto origem={autoOrigem.projeto} aproximado={autoOrigem.projetoAproximado} onLimpar={autoOrigem.projeto ? () => onChange({ ...value, codigoProjeto: '' }) : null} />
          </label>
          <Combobox
            value={value.codigoProjeto || ''}
            onChange={(v) => onChange({ ...value, codigoProjeto: v })}
            opcoes={opcoes.projetos}
            getKey={p => p.codigo}
            getLabel={p => p.nome}
            placeholder={carregando ? 'Carregando...' : '— Sem projeto —'}
            disabled={carregando}
            style={{ fontFamily: 'Montserrat, sans-serif' }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isModal ? '18px' : '14px' }}>
        <div>
          <label style={labelStyle}>
            <Users size={13} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
            Vendedor (solicitante)
            <PilulaAuto origem={autoOrigem.vendedor} aproximado={autoOrigem.vendedorAproximado} onLimpar={autoOrigem.vendedor ? () => onChange({ ...value, codigoVendedor: '' }) : null} />
          </label>
          <Combobox
            value={value.codigoVendedor || ''}
            onChange={(v) => onChange({ ...value, codigoVendedor: v })}
            opcoes={opcoes.vendedores}
            getKey={v => v.codigo}
            getLabel={v => v.nome}
            placeholder={carregando ? 'Carregando...' : '— Sem vendedor —'}
            disabled={carregando}
          />
        </div>
        <div>
          <label style={labelStyle}><FileText size={13} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Tipo de documento</label>
          <select style={selStyle} value={value.codigoTipoDocumento || ''} onChange={e => onChange({ ...value, codigoTipoDocumento: e.target.value })} disabled={carregando}>
            <option value="">{carregando ? 'Carregando...' : '— Não informar —'}</option>
            {opcoes.tiposDocumento.map(t => <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descricao}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>
          <Briefcase size={13} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
          Departamento
          {value.codigoDepartamento && opcoes.departamentos.some(d => String(d.codigo) === String(value.codigoDepartamento)) && (
            <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 600, background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', padding: '2px 7px', borderRadius: '999px' }}>
              pré-selecionado · pode trocar
            </span>
          )}
        </label>
        <select style={selStyle} value={value.codigoDepartamento || ''} onChange={e => onChange({ ...value, codigoDepartamento: e.target.value })} disabled={carregando}>
          <option value="">{carregando ? 'Carregando...' : '— Sem departamento —'}</option>
          {opcoes.departamentos.map(d => <option key={d.codigo} value={d.codigo}>{d.descricao}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontSize: '12px', color: erro ? '#b91c1c' : '#94a3b8' }}>
        <div>
          {erro
            ? <>Erro ao carregar opções do Omie: {erro} <button type="button" onClick={recarregar} style={{ background: 'none', border: 'none', color: '#0284c7', cursor: 'pointer', textDecoration: 'underline', fontSize: '12px' }}>tentar de novo</button></>
            : <>Listas em cache (24h). <button type="button" onClick={forcarRefresh} style={{ background: 'none', border: 'none', color: '#0284c7', cursor: 'pointer', textDecoration: 'underline', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><RefreshCw size={10} /> recarregar do Omie</button></>
          }
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// <CampoDocumento> — input editável que tenta ler automaticamente o valor
// de um anexo (chave NF-e do anexo de NF, código de barras do anexo de boleto).
// Se a leitura falhar, mostra a mensagem e mantém o campo manual.
// ---------------------------------------------------------------------
function CampoDocumento({ icone, label, valor, onChange, placeholder, anexoUrl, lerFn, semAnexoMsg }) {
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState('')
  const [okLeitura, setOkLeitura] = useState(false)

  const lerDoAnexo = async () => {
    if (!anexoUrl) return
    setLendo(true); setErro(''); setOkLeitura(false)
    try {
      const lido = await lerFn(anexoUrl)
      onChange(lido)
      setOkLeitura(true)
    } catch (e) {
      setErro(e?.message || String(e))
    } finally {
      setLendo(false)
    }
  }

  return (
    <div>
      <label style={{ fontSize: '14px', color: '#64748b', textTransform: 'uppercase', fontWeight: '500', marginBottom: '8px', display: 'block' }}>
        {icone} {label}
      </label>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
        <input
          type="text"
          value={valor}
          onChange={e => { onChange(e.target.value); setErro(''); setOkLeitura(false) }}
          placeholder={placeholder}
          style={{ flex: 1, padding: '13px 14px', border: '1px solid #dcdde1', borderRadius: '10px', outline: 'none', background: '#fff', color: '#1e293b', fontSize: '15px', fontFamily: 'Montserrat, sans-serif' }}
        />
        {anexoUrl && (
          <button
            type="button"
            onClick={lerDoAnexo}
            disabled={lendo}
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px',
              background: lendo ? '#e2e8f0' : '#1e293b', color: lendo ? '#64748b' : '#fff',
              border: 'none', borderRadius: '10px', padding: '0 16px', cursor: lendo ? 'wait' : 'pointer',
              fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
            }}
            title="Tenta extrair automaticamente do anexo"
          >
            {lendo ? <Loader2 size={15} className="animate-spin" /> : <Barcode size={15} />}
            {lendo ? 'Lendo...' : 'Ler do anexo'}
          </button>
        )}
      </div>
      {erro && (
        <div style={{ marginTop: '6px', fontSize: '12px', color: '#b91c1c', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{erro} Preencha manualmente no campo acima.</span>
        </div>
      )}
      {okLeitura && !erro && (
        <div style={{ marginTop: '6px', fontSize: '12px', color: '#15803d', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CheckCircle size={13} /> Lido do anexo — confira antes de enviar.
        </div>
      )}
      {!anexoUrl && !erro && (
        <div style={{ marginTop: '6px', fontSize: '12px', color: '#94a3b8' }}>{semAnexoMsg}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// <EnviarParaOmieBox> — bloco completo para o modal do Painel:
// se já enviado → mostra badge; senão → selects + checklist + botão "Enviar pro Omie".
// ---------------------------------------------------------------------
export function EnviarParaOmieBox({ finanPagar, onSynced, autoOrigem = {} }) {
  const jaEnviado = !!finanPagar?.omie_cod_lancamento
  const [campos, setCampos] = useState({
    empresa: finanPagar?.omie_empresa || 'Nova Tratores',
    codigoCategoria: finanPagar?.omie_categoria || '',
    idContaCorrente: finanPagar?.omie_conta_corrente || '',
    codigoProjeto: finanPagar?.omie_projeto || '',
    codigoVendedor: finanPagar?.omie_vendedor || '',
    codigoTipoDocumento: finanPagar?.omie_tipo_documento || '',
    codigoDepartamento: finanPagar?.omie_departamento || '',
  })
  const [chaveNFe, setChaveNFe] = useState(finanPagar?.nfe_chave || '')
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const [valido, setValido] = useState(false)
  const [anexando, setAnexando] = useState(false)
  const [anexosMsg, setAnexosMsg] = useState(null)

  // Autosave: persiste os campos no finan_pagar (debounced) para não perder o
  // que foi preenchido caso o modal seja fechado e reaberto antes do envio.
  const primeiroRender = useRef(true)
  useEffect(() => {
    if (jaEnviado || !finanPagar?.id) return
    if (primeiroRender.current) { primeiroRender.current = false; return }
    const t = setTimeout(() => {
      supabase
        .from('finan_pagar')
        .update({
          omie_empresa: campos.empresa || null,
          omie_categoria: campos.codigoCategoria || null,
          omie_conta_corrente: campos.idContaCorrente ? Number(campos.idContaCorrente) : null,
          omie_projeto: campos.codigoProjeto ? Number(campos.codigoProjeto) : null,
          omie_vendedor: campos.codigoVendedor ? Number(campos.codigoVendedor) : null,
          omie_tipo_documento: campos.codigoTipoDocumento || null,
          omie_departamento: campos.codigoDepartamento || null,
          nfe_chave: chaveNFe || null,
        })
        .eq('id', finanPagar.id)
        .then(({ error }) => { if (error) console.warn('[autosave campos Omie]', error.message) })
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campos, chaveNFe])

  const enviar = async () => {
    setEnviando(true); setMsg('')
    try {
      const res = await fetch('/api/financeiro/contas-pagar/omie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finanPagarId: finanPagar.id,
          empresa: campos.empresa,
          codigoCategoria: campos.codigoCategoria,
          idContaCorrente: campos.idContaCorrente,
          codigoProjeto: campos.codigoProjeto || undefined,
          codigoVendedor: campos.codigoVendedor || undefined,
          codigoTipoDocumento: campos.codigoTipoDocumento || undefined,
          codigoDepartamento: campos.codigoDepartamento || undefined,
          chaveNFe: chaveNFe || undefined,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        const issues = data.issues || data.erros
        if (issues && issues.length > 0) {
          setMsg('Faltam dados — veja o checklist abaixo.')
        } else {
          setMsg(data.erro || 'Falha ao enviar para o Omie.')
        }
        return
      }
      const cods = (data.codigos || []).join(', ')
      setMsg('')
      if (data.anexos && Array.isArray(data.anexos.falhas) && data.anexos.falhas.length > 0) {
        alert(
          `Conta a pagar criada no Omie (nº ${cods}).\n\n` +
          `${data.anexos.ok} anexo(s) enviado(s), mas ${data.anexos.falhas.length} falhou(aram):\n` +
          `- ${data.anexos.falhas.join('\n- ')}\n\n` +
          `Você pode anexar esses arquivos manualmente no Omie.`
        )
      }
      onSynced?.({
        omie_cod_lancamento: cods,
        omie_empresa: data.empresa || campos.empresa,
        omie_categoria: campos.codigoCategoria,
        omie_conta_corrente: campos.idContaCorrente || null,
        omie_projeto: campos.codigoProjeto || null,
        omie_vendedor: campos.codigoVendedor || null,
        omie_tipo_documento: campos.codigoTipoDocumento || null,
        omie_departamento: campos.codigoDepartamento || null,
        nfe_chave: chaveNFe || null,
        omie_sync_em: new Date().toISOString(),
        status_envio: 'enviado',
      }, data)
    } catch (e) {
      setMsg('Erro de conexão: ' + (e.message || String(e)))
    } finally {
      setEnviando(false)
    }
  }

  const reenviarAnexos = async () => {
    setAnexando(true); setAnexosMsg(null)
    try {
      const res = await fetch('/api/financeiro/contas-pagar/omie/anexos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finanPagarId: finanPagar.id, empresa: finanPagar.omie_empresa }),
      })
      const data = await res.json()
      if (!data.ok) {
        setAnexosMsg({ tipo: 'erro', texto: data.erro || 'Falha ao reenviar anexos.' })
        return
      }
      const { ok = 0, falhas = [] } = data.anexos || {}
      if (falhas.length > 0) {
        setAnexosMsg({ tipo: 'erro', texto: `${ok} anexo(s) enviado(s). Falhou(aram):\n- ${falhas.join('\n- ')}` })
      } else if (ok === 0) {
        setAnexosMsg({ tipo: 'erro', texto: 'Nenhum anexo encontrado neste registro (NF, boleto ou requisição).' })
      } else {
        setAnexosMsg({ tipo: 'ok', texto: `${ok} anexo(s) enviado(s) ao Omie com sucesso.` })
      }
    } catch (e) {
      setAnexosMsg({ tipo: 'erro', texto: 'Erro de conexão: ' + (e.message || String(e)) })
    } finally {
      setAnexando(false)
    }
  }

  if (jaEnviado) {
    return (
      <div style={{ marginTop: '20px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '15px', padding: '24px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <CheckCircle size={22} color="#16a34a" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', color: '#15803d', fontWeight: '600' }}>Lançado no Omie</div>
            <div style={{ fontSize: '13px', color: '#475569' }}>
              Conta a pagar nº <strong>{finanPagar.omie_cod_lancamento}</strong>
              {finanPagar.omie_empresa ? ` · ${finanPagar.omie_empresa}` : ''}
              {finanPagar.omie_sync_em ? ` · ${new Date(finanPagar.omie_sync_em).toLocaleString('pt-BR')}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={reenviarAnexos}
            disabled={anexando}
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: '7px',
              background: anexando ? '#e2e8f0' : '#fff', color: anexando ? '#64748b' : '#15803d',
              border: '1px solid #86efac', borderRadius: '10px', padding: '10px 16px',
              cursor: anexando ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 600,
            }}
            title="Reenvia NF, boletos e requisições para a aba Anexos do lançamento no Omie"
          >
            {anexando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {anexando ? 'Enviando anexos...' : 'Reenviar anexos ao Omie'}
          </button>
        </div>
        {anexosMsg && (
          <div style={{
            marginTop: '12px', fontSize: '12px', whiteSpace: 'pre-line',
            color: anexosMsg.tipo === 'ok' ? '#15803d' : '#b91c1c',
            background: anexosMsg.tipo === 'ok' ? '#dcfce7' : '#fef2f2',
            border: `1px solid ${anexosMsg.tipo === 'ok' ? '#86efac' : '#fca5a5'}`,
            borderRadius: '8px', padding: '10px 12px',
          }}>
            {anexosMsg.texto}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginTop: '20px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '15px', padding: '30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={18} color="#2563eb" /></div>
        <div>
          <div style={{ fontSize: '13px', color: '#2563eb', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase' }}>Validar e enviar ao Omie</div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>Cria o lançamento no Omie com fornecedor, NF, valor, vencimento, vendedor e projeto</div>
        </div>
      </div>

      <CamposOmieContaPagar value={campos} onChange={setCampos} tema="modal" autoOrigem={autoOrigem} contextoTexto={finanPagar?.motivo || ''} />

      {/* Chave NF-e — lida do anexo de NF ou preenchida à mão */}
      <div style={{ marginTop: '18px', background: '#fff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '18px' }}>
        <CampoDocumento
          icone={<KeyRound size={13} style={{ verticalAlign: '-2px', marginRight: '6px' }} />}
          label="Chave da NF-e (44 dígitos)"
          valor={chaveNFe}
          onChange={setChaveNFe}
          placeholder="Cole a chave de 44 dígitos ou leia do anexo"
          anexoUrl={finanPagar?.anexo_nf || null}
          lerFn={lerChaveNFeDeUrl}
          semAnexoMsg="Sem anexo de NF para leitura automática — preencha manualmente se tiver a chave."
        />
      </div>

      <div style={{ marginTop: '18px' }}>
        <ChecklistValidacao
          finanPagarId={finanPagar.id}
          opts={{
            empresa: campos.empresa,
            codigoCategoria: campos.codigoCategoria,
            idContaCorrente: campos.idContaCorrente,
            codigoProjeto: campos.codigoProjeto,
            codigoVendedor: campos.codigoVendedor,
            codigoTipoDocumento: campos.codigoTipoDocumento,
          }}
          onValidoChange={setValido}
        />
      </div>

      {msg && <div style={{ marginTop: '12px', fontSize: '13px', color: '#b91c1c' }}>{msg}</div>}

      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || !valido}
          style={{
            background: (enviando || !valido) ? '#94a3b8' : 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            color: '#fff', border: 'none', padding: '14px 28px', borderRadius: '12px',
            cursor: (enviando || !valido) ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '600',
            display: 'flex', alignItems: 'center', gap: '10px',
            boxShadow: (enviando || !valido) ? 'none' : '0 8px 18px rgba(14,165,233,0.25)', transition: '0.2s',
          }}
          title={valido ? 'Enviar para o Omie' : 'Resolva as pendências do checklist primeiro'}
        >
          {enviando ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
          {enviando ? 'Enviando...' : 'Validar e enviar ao Omie'}
        </button>
      </div>
    </div>
  )
}
