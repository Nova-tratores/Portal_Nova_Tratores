'use client'
// Upload de XML da NF-e — parseia no browser e devolve os campos extraídos.
// O upload do arquivo (para storage) é feito pelo pai, que recebe o File via onParsed.
import { useRef, useState } from 'react'
import { FileText, CheckCircle, AlertTriangle, Upload } from 'lucide-react'
import { parseNFeXML } from '@/lib/financeiro/nfe-parser'

/**
 * @param {{ onParsed: (dados: ReturnType<typeof parseNFeXML>, file: File, xmlText: string) => void, accept?: string }} props
 */
export default function UploadNFeXml({ onParsed, accept = '.xml,application/xml,text/xml' }) {
  const inputRef = useRef(null)
  const [estado, setEstado] = useState({ status: 'idle', erro: '', dados: null, fileName: '' })

  async function handleFile(file) {
    if (!file) return
    setEstado({ status: 'parseando', erro: '', dados: null, fileName: file.name })
    try {
      const text = await file.text()
      const dados = parseNFeXML(text)
      setEstado({ status: 'ok', erro: '', dados, fileName: file.name })
      onParsed?.(dados, file, text)
    } catch (e) {
      setEstado({ status: 'erro', erro: e.message || String(e), dados: null, fileName: file.name })
    }
  }

  function onDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  function onDragOver(e) { e.preventDefault() }

  const isOk = estado.status === 'ok' && estado.dados
  const isErro = estado.status === 'erro'

  return (
    <div style={{ width: '100%' }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${isOk ? '#22c55e' : isErro ? '#ef4444' : '#cbd5e1'}`,
          background: isOk ? '#f0fdf4' : isErro ? '#fef2f2' : '#f8fafc',
          borderRadius: '12px',
          padding: '18px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: 'pointer',
          transition: '0.2s',
        }}
      >
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          background: isOk ? '#dcfce7' : isErro ? '#fee2e2' : '#e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isOk ? <CheckCircle size={20} color="#16a34a" /> : isErro ? <AlertTriangle size={20} color="#dc2626" /> : <Upload size={20} color="#64748b" />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {isOk ? (
            <>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#15803d' }}>NF-e importada</div>
              <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: '2px' }}>
                <span>Nº <strong>{estado.dados.numero}</strong></span>
                <span>Série <strong>{estado.dados.serie || '—'}</strong></span>
                <span>Emit. <strong>{estado.dados.nomeEmitente}</strong></span>
                <span>CNPJ <strong>{formatarCnpj(estado.dados.cnpjEmitente)}</strong></span>
                <span>Valor <strong>R$ {estado.dados.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
              </div>
            </>
          ) : isErro ? (
            <>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#b91c1c' }}>Não consegui ler o XML</div>
              <div style={{ fontSize: '12px', color: '#7f1d1d' }}>{estado.erro}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={14} /> Importar XML da NF-e
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Arraste o arquivo aqui ou clique para selecionar — preencho fornecedor, número, valor e chave automaticamente.</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function formatarCnpj(d) {
  const s = String(d || '').replace(/\D/g, '')
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return s
}
