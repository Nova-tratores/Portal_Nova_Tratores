'use client'
// Checklist visual do que falta para enviar um finan_pagar ao Omie.
// Faz POST debounced (400ms) em /api/financeiro/contas-pagar/validar.
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, Loader2, ExternalLink, User as UserIcon } from 'lucide-react'

/**
 * @param {{ finanPagarId: number|string, opts: { empresa, codigoCategoria, idContaCorrente, codigoProjeto, codigoVendedor, codigoTipoDocumento }, onValidoChange?: (valido:boolean)=>void }} props
 */
export default function ChecklistValidacao({ finanPagarId, opts, onValidoChange }) {
  const [estado, setEstado] = useState({ carregando: false, valido: false, erros: [], avisos: [], fornecedorEncontrado: null, ultimo: null })
  const debounce = useRef(null)

  useEffect(() => {
    if (!finanPagarId) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setEstado((s) => ({ ...s, carregando: true }))
      try {
        const res = await fetch('/api/financeiro/contas-pagar/validar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ finanPagarId, opts }),
        })
        const data = await res.json()
        if (data?.ok) {
          const novo = { carregando: false, valido: !!data.valido, erros: data.erros || [], avisos: data.avisos || [], fornecedorEncontrado: data.fornecedorEncontrado || null, ultimo: Date.now() }
          setEstado(novo)
          onValidoChange?.(novo.valido)
        } else {
          setEstado({ carregando: false, valido: false, erros: [{ campo: '_geral', mensagem: data?.erro || 'Falha ao validar.', severidade: 'erro' }], avisos: [], fornecedorEncontrado: null, ultimo: Date.now() })
          onValidoChange?.(false)
        }
      } catch (e) {
        setEstado({ carregando: false, valido: false, erros: [{ campo: '_rede', mensagem: 'Erro de conexão: ' + (e.message || String(e)), severidade: 'erro' }], avisos: [], fornecedorEncontrado: null, ultimo: Date.now() })
        onValidoChange?.(false)
      }
    }, 400)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finanPagarId, JSON.stringify(opts || {})])

  const { carregando, valido, erros, avisos, fornecedorEncontrado } = estado
  const erroFornecedor = erros.some(e => e.campo === 'fornecedor' || e.campo === 'fornecedor.documento')

  return (
    <div style={{ background: valido ? '#f0fdf4' : '#fff', border: `1px solid ${valido ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: '12px', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        {carregando ? <Loader2 size={18} className="animate-spin" color="#64748b" /> : valido ? <CheckCircle2 size={18} color="#16a34a" /> : <AlertCircle size={18} color="#ea580c" />}
        <div style={{ fontSize: '14px', fontWeight: 600, color: valido ? '#15803d' : '#1e293b' }}>
          {carregando ? 'Verificando...' : valido ? 'Pronto para enviar' : `${erros.length} pendência${erros.length === 1 ? '' : 's'} antes de enviar`}
        </div>
      </div>

      {/* Fornecedor encontrado (sempre que casou um, mas com destaque maior quando o erro é de fornecedor) */}
      {fornecedorEncontrado && (
        <div style={{
          marginBottom: '12px',
          background: erroFornecedor ? '#fff7ed' : '#f8fafc',
          border: `1px solid ${erroFornecedor ? '#fdba74' : '#e5e7eb'}`,
          borderRadius: '10px',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        }}>
          <UserIcon size={16} color={erroFornecedor ? '#c2410c' : '#64748b'} />
          <div style={{ fontSize: '12px', color: '#475569', flex: 1, minWidth: 0 }}>
            <strong style={{ color: '#0f172a' }}>{fornecedorEncontrado.nome || '—'}</strong>
            {fornecedorEncontrado.id != null && <span style={{ color: '#94a3b8' }}> (id #{fornecedorEncontrado.id})</span>}
            {fornecedorEncontrado.fonte === 'nome-parcial' && (
              <span style={{ marginLeft: '6px', fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>MATCH APROXIMADO</span>
            )}
            <div style={{ marginTop: '2px', fontSize: '12px', color: fornecedorEncontrado.documento ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
              CNPJ/CPF: {fornecedorEncontrado.documento || '— não cadastrado —'}
            </div>
          </div>
          <a
            href={fornecedorEncontrado.id != null
              ? `/requisicoes?aba=fornecedores&editar=${fornecedorEncontrado.id}`
              : '/requisicoes?aba=fornecedores'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px',
              color: '#1d4ed8', background: '#dbeafe', border: '1px solid #93c5fd',
              padding: '5px 10px', borderRadius: '6px', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: '4px',
            }}
            title="Abre direto o formulário de edição do fornecedor"
          >
            EDITAR CADASTRO <ExternalLink size={11} />
          </a>
        </div>
      )}

      {erros.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {erros.map((iss, idx) => (
            <li key={`e-${idx}`} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', color: '#7f1d1d' }}>
              <span style={{ width: '14px', height: '14px', marginTop: '2px', borderRadius: '50%', background: '#fecaca', flex: '0 0 14px' }} />
              <span><strong>{labelCampo(iss.campo)}:</strong> {iss.mensagem}</span>
            </li>
          ))}
        </ul>
      )}

      {avisos.length > 0 && (
        <div style={{ marginTop: erros.length > 0 ? '12px' : '0', borderTop: erros.length > 0 ? '1px dashed #e5e7eb' : 'none', paddingTop: erros.length > 0 ? '10px' : '0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <Info size={13} /> {avisos.length} aviso{avisos.length === 1 ? '' : 's'} (não bloqueia o envio)
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {avisos.map((iss, idx) => (
              <li key={`a-${idx}`} style={{ fontSize: '12px', color: '#475569' }}>
                <strong>{labelCampo(iss.campo)}:</strong> {iss.mensagem}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function labelCampo(campo) {
  const dict = {
    numero_NF: 'Número da NF',
    anexo_nf: 'Anexo da NF',
    anexo_boleto: 'Anexo do boleto',
    empresa: 'Empresa Omie',
    codigoCategoria: 'Categoria de despesa',
    idContaCorrente: 'Conta corrente',
    codigoProjeto: 'Projeto',
    codigoVendedor: 'Vendedor',
    codigoTipoDocumento: 'Tipo de documento',
    data_vencimento: 'Data de vencimento',
    valor: 'Valor',
    parcelas: 'Parcelas',
    fornecedor: 'Fornecedor',
    'fornecedor.documento': 'CNPJ/CPF do fornecedor',
    nfe_chave: 'Chave NF-e',
    _geral: 'Erro',
    _rede: 'Rede',
  }
  return dict[campo] || campo
}
