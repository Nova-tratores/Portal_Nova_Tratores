'use client'
import { useState, useRef, useEffect } from 'react'
import { Download, FileText, Table, Loader2 } from 'lucide-react'
import { exportToPDF, exportToExcel } from '@/lib/export'
import { useToast } from '@/contexts/ToastContext'

export default function ExportButton({ data, config, dark = false }) {
  const { toast } = useToast()
  const [showMenu, setShowMenu] = useState(false)
  const [exporting, setExporting] = useState(false)
  const menuRef = useRef()

  useEffect(() => {
    const handleClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleExport = async (format) => {
    if (!data || data.length === 0) { toast.warning('Nenhum dado para exportar'); setShowMenu(false); return }
    setExporting(true)
    try {
      if (format === 'pdf') await exportToPDF(data, config)
      else await exportToExcel(data, config)
      toast.success(`Relatório ${format.toUpperCase()} exportado com sucesso!`)
    } catch (err) {
      toast.error('Erro ao gerar relatório: ' + err.message)
    } finally {
      setExporting(false)
      setShowMenu(false)
    }
  }

  const bg = dark ? '#3f3f44' : '#fff'
  const border = dark ? '#55555a' : '#e2e8f0'
  const text = dark ? '#e2e8f0' : '#1e293b'
  const hover = dark ? '#55555a' : '#f8fafc'

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button onClick={() => setShowMenu(!showMenu)} disabled={exporting} style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
        background: bg, border: `1px solid ${border}`, borderRadius: '14px',
        color: text, cursor: 'pointer', fontSize: '14px', transition: '0.2s'
      }}>
        {exporting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={18} />}
        Exportar
      </button>

      {showMenu && (
        <div style={{
          position: 'absolute', right: 0, top: '48px', background: bg,
          border: `1px solid ${border}`, borderRadius: '16px', overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)', zIndex: 50, width: '200px'
        }}>
          <button onClick={() => handleExport('pdf')} style={{
            width: '100%', padding: '14px 20px', background: 'transparent', border: 'none',
            color: text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
            fontSize: '14px', borderBottom: `1px solid ${border}`
          }}>
            <FileText size={18} color="#ef4444" /> Exportar PDF
          </button>
          <button onClick={() => handleExport('excel')} style={{
            width: '100%', padding: '14px 20px', background: 'transparent', border: 'none',
            color: text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px'
          }}>
            <Table size={18} color="#22c55e" /> Exportar Excel
          </button>
        </div>
      )}

      <style jsx global>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
