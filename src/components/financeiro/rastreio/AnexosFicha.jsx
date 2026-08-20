'use client'
// Rastreio de notas — bloco de ANEXOS da ficha: grid com preview/lightbox
// (DocumentoInline), aviso pra arquivo do Drive legado (não baixável), e os
// botões "Imprimir tudo" (rasteriza cada anexo em folhas — padrão da impressão
// de requisições) e "Baixar tudo (.zip)" (jszip, import dinâmico).
import { useState } from 'react'
import { Download, Loader2, Printer } from 'lucide-react'
import DocumentoInline from '@/components/frota/DocumentoInline'
import { folhasDosAnexos } from '@/lib/requisicoes/anexos-pdf'

const nomeArquivo = (anexo, i) => {
  const ext = (anexo.url.split('?')[0].match(/\.(pdf|jpe?g|png|webp|gif|xml)$/i) || [])[0] || ''
  const base = `${anexo.origemLabel} - ${anexo.label}`.replace(/[^\wÀ-ÿ #.-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${String(i + 1).padStart(2, '0')} ${base}${ext}`
}

const ehXml = (a) => /\.xml($|\?)/i.test(a.url || '') || /XML/i.test(a.label || '')

export default function AnexosFicha({ anexos, numeroNf }) {
  const [imprimindo, setImprimindo] = useState(false)
  const [baixando, setBaixando] = useState(false)
  const [erro, setErro] = useState('')

  const comUrl = anexos.filter(a => a.url)
  // XML não renderiza em preview/impressão — vira card de download
  const xmls = comUrl.filter(ehXml)
  const validos = comUrl.filter(a => !ehXml(a))
  const legados = anexos.filter(a => !a.url)

  const imprimirTudo = async () => {
    if (imprimindo || validos.length === 0) return
    // janela ABERTA no gesto do clique (popup-blocker) — imprimir na própria
    // página com visibility gerava páginas em branco do layout do portal
    const w = window.open('', '_blank')
    if (!w) { setErro('O navegador bloqueou a janela de impressão — libere pop-ups.'); return }
    setImprimindo(true)
    setErro('')
    try {
      w.document.write('<p style="font-family:sans-serif;padding:20px;color:#555">Preparando os anexos…</p>')
      const { folhas: fs, falhas } = await folhasDosAnexos(validos.map(a => ({ label: `${a.origemLabel} — ${a.label}`, url: a.url })))
      if (falhas.length) setErro(`${falhas.length} anexo(s) fora da impressão: ${falhas.slice(0, 2).join(' · ')}${falhas.length > 2 ? ' · …' : ''}`)
      if (fs.length === 0) { w.close(); setErro('Nenhum anexo pôde ser preparado pra impressão.'); return }
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      w.document.open()
      w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Rastreio ${esc(numeroNf ? `NF ${numeroNf}` : 'documento')} — anexos</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; }
  .folha { page-break-after: always; display: flex; align-items: center; justify-content: center; min-height: 96vh; }
  .folha:last-child { page-break-after: auto; }
  .folha img { max-width: 100%; max-height: 96vh; }
</style></head><body>
${fs.map(f => `<div class="folha"><img src="${f.dataUrl}" alt="${esc(f.label)}"></div>`).join('\n')}
<script>window.onload = () => { window.print(); }</` + `script></body></html>`)
      w.document.close()
    } catch (e) {
      w.close()
      setErro(String(e?.message || e))
    } finally {
      setImprimindo(false)
    }
  }

  const baixarZip = async () => {
    if (baixando || comUrl.length === 0) return
    setBaixando(true)
    setErro('')
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const falhas = []
      for (let i = 0; i < comUrl.length; i++) {
        try {
          const r = await fetch(comUrl[i].url)
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          zip.file(nomeArquivo(comUrl[i], i), await r.blob())
        } catch {
          falhas.push(comUrl[i].label)
        }
      }
      if (falhas.length) setErro(`${falhas.length} anexo(s) não entraram no zip: ${falhas.slice(0, 3).join(', ')}`)
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      // nº canônico pode ter '/' — não pode ir pra nome de arquivo
      const nomeNf = String(numeroNf || '').replace(/[^\w.-]+/g, '-')
      a.download = `rastreio-${nomeNf ? `NF${nomeNf}` : 'documento'}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setErro(String(e?.message || e))
    } finally {
      setBaixando(false)
    }
  }

  if (anexos.length === 0) {
    return <p style={{ fontSize: '13px', color: '#9e9e9e', margin: 0 }}>Nenhum anexo encontrado neste documento.</p>
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <button onClick={imprimirTudo} disabled={imprimindo || validos.length === 0} style={btn('#111827', imprimindo || validos.length === 0)}>
          {imprimindo ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Imprimir tudo ({validos.length})
        </button>
        <button onClick={baixarZip} disabled={baixando || comUrl.length === 0} style={btn('#2563eb', baixando || comUrl.length === 0)}>
          {baixando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Baixar tudo (.zip)
        </button>
      </div>
      {erro && <div style={{ fontSize: '12.5px', color: '#dc2626', fontWeight: 600, marginBottom: '10px' }}>{erro}</div>}

      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        {validos.map((a, i) => (
          <div key={`${a.url}-${i}`} style={{ width: '150px' }}>
            <DocumentoInline url={a.url} nome={`${a.label}`} alturaThumb={110} />
            <div style={{ fontSize: '11px', color: '#616161', marginTop: '4px', lineHeight: 1.35 }}>
              <strong>{a.label}</strong>
              <div style={{ color: '#9e9e9e' }}>{a.origemLabel}</div>
            </div>
          </div>
        ))}
        {/* XML da NF-e: não tem preview — card de download direto */}
        {xmls.map((a, i) => (
          <a key={`xml-${i}`} href={a.url} download target="_blank" rel="noreferrer"
            style={{ width: '150px', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '10px', background: '#f8fbff', textDecoration: 'none', display: 'block' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Download size={12} /> {a.label}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
              {a.origemLabel} · baixar XML
            </div>
          </a>
        ))}
        {legados.map((a, i) => (
          <div key={`drive-${i}`} style={{ width: '150px', border: '1.5px dashed #d1d5db', borderRadius: '10px', padding: '10px', background: '#fafafa' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#757575' }}>{a.label}</div>
            <div style={{ fontSize: '11px', color: '#9e9e9e', marginTop: '4px', lineHeight: 1.4 }}>
              Arquivo no Drive antigo — abra pela {a.origemLabel.toLowerCase()}.
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const btn = (bg, off) => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '10px',
  border: 'none', background: off ? '#c7c7c7' : bg, color: '#fff', fontSize: '12.5px', fontWeight: 700,
  cursor: off ? 'default' : 'pointer',
})
