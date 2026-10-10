'use client'
// POPs — folha OPL (uma página A4) da versão PUBLICADA: cabeçalho de controle
// (código, versão, data, aprovador), passos numerados com imagem e QR que abre
// a versão vigente com "Executar". Na impressão só a folha aparece.
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'next/navigation'
import QRCode from 'qrcode'
import { useAuth } from '@/hooks/useAuth'
import { urlExecutarPop, type ConfigPasso, type TipoPasso } from '@/lib/pops/regras'
import { chamar } from '@/components/pops/comum'
import { midiaEhVideo } from '@/components/pops/PassoPreview'

interface Dados {
  pop: { id: string; codigo: string; titulo: string; dono_id: string; proxima_revisao_em: string | null; template_tipo: string | null }
  area: { sigla: string; nome: string } | null
  versao: { id: string; numero: number; estado: string; objetivo: string; escopo: string; materiais: string; publicado_em: string | null; aprovado_por: string | null }
  passos: { tipo: TipoPasso; titulo: string; ajuda: string; obrigatorio: boolean; config: ConfigPasso; midia_url: string | null }[]
  usuarios: Record<string, { nome: string }>
}

const br = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')

function resposta(p: Dados['passos'][number]): string {
  const c = p.config || {}
  switch (p.tipo) {
    case 'check': return '☐ Sim   ☐ Não'
    case 'numero': return `____________ ${c.unidade || ''}${c.min !== undefined || c.max !== undefined ? `  (faixa ${c.min ?? '—'} a ${c.max ?? '—'})` : ''}`
    case 'foto': return `📷 Foto (mín. ${c.min_fotos ?? 1})`
    case 'texto': return '______________________________'
    case 'selecao': return (c.opcoes || []).map((o) => `☐ ${o}`).join('   ')
    case 'assinatura': return `Assinatura ${c.quem === 'cliente' ? 'do cliente' : 'de quem executa'}: ____________________`
    default: return ''
  }
}

export default function ImprimirOPL() {
  const { id } = useParams<{ id: string }>()
  const { userProfile } = useAuth()
  const [d, setD] = useState<Dados | null>(null)
  const [qr, setQr] = useState('')
  const [erro, setErro] = useState('')
  const url = typeof window !== 'undefined' ? urlExecutarPop(window.location.origin, id) : ''

  useEffect(() => {
    if (!userProfile) return
    chamar<Dados>(`/api/pops/${id}`).then(setD).catch((e) => setErro((e as Error).message))
  }, [id, userProfile])
  useEffect(() => {
    if (url) QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''))
  }, [url])

  if (erro) return <div style={{ padding: 20, color: '#dc2626' }}>{erro}</div>
  if (!d) return <div style={{ padding: 20 }}>Carregando…</div>
  if (d.versao.estado !== 'publicado') return <div style={{ padding: 20 }}>Só a versão publicada é impressa. Este POP ainda não tem versão publicada.</div>

  const aprovador = d.versao.aprovado_por ? d.usuarios[d.versao.aprovado_por]?.nome : '—'
  const folha = (id: string) => (
      <div id={id} className="folha" style={{
        width: '194mm', minHeight: '275mm', margin: '0 auto 24px', background: '#fff', color: '#111', padding: '0',
        fontFamily: 'Arial, Helvetica, sans-serif', boxShadow: '0 2px 12px rgba(0,0,0,.12)', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Cabeçalho de controle */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ ...celula, width: '28%', fontWeight: 900, fontSize: '11pt', color: '#b91c1c' }}>NOVA TRATORES<span style={rot}>Procedimento Operacional Padrão</span></td>
              <td style={{ ...celula, fontSize: '12pt', fontWeight: 900 }} colSpan={3}>{d.pop.titulo}</td>
            </tr>
            <tr>
              <td style={celula}><span style={rot}>Código</span><strong>{d.pop.codigo}</strong></td>
              <td style={celula}><span style={rot}>Versão</span><strong>v{d.versao.numero}</strong> · publicada {br(d.versao.publicado_em?.slice(0, 10))}</td>
              <td style={celula}><span style={rot}>Aprovado por</span>{aprovador}</td>
              <td style={celula}><span style={rot}>Área · dono</span>{d.area?.sigla} · {d.usuarios[d.pop.dono_id]?.nome || '—'}</td>
            </tr>
            {(d.versao.objetivo || d.versao.escopo || d.versao.materiais) && (
              <tr>
                <td style={celula} colSpan={2}><span style={rot}>Objetivo</span>{d.versao.objetivo}{d.versao.escopo && <><span style={{ ...rot, marginTop: '1mm' }}>Escopo</span>{d.versao.escopo}</>}</td>
                <td style={celula} colSpan={2}><span style={rot}>Materiais / EPIs</span>{d.versao.materiais || '—'}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Passos */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.6mm', marginTop: '2mm', flex: 1, alignContent: 'start' }}>
          {d.passos.map((p, i) => (
            <div key={i} style={{ border: '1px solid #d1d5db', borderRadius: '1.5mm', padding: '1.6mm 2mm', display: 'flex', gap: '2mm', breakInside: 'avoid' }}>
              <div style={{ flex: '0 0 6.5mm', height: '6.5mm', borderRadius: '50%', background: p.tipo === 'instrucao' ? '#e5e7eb' : '#0f766e', color: p.tipo === 'instrucao' ? '#111' : '#fff', fontWeight: 900, fontSize: '9pt', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '8.5pt', fontWeight: 800, lineHeight: 1.25 }}>
                  {p.titulo}{p.tipo !== 'instrucao' && !p.obrigatorio && <span style={{ fontWeight: 400, color: '#6b7280' }}> (opcional)</span>}
                </div>
                {p.ajuda && <div style={{ fontSize: '7pt', color: '#374151', marginTop: '0.6mm', lineHeight: 1.25 }}>{p.ajuda}</div>}
                {p.tipo !== 'instrucao' && <div style={{ fontSize: '7.5pt', marginTop: '1mm', color: '#111' }}>{resposta(p)}</div>}
              </div>
              {p.midia_url && !midiaEhVideo(p.midia_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.midia_url} alt="" style={{ width: '20mm', height: '16mm', objectFit: 'cover', borderRadius: '1mm', flex: '0 0 20mm' }} />
              )}
            </div>
          ))}
        </div>

        {/* Rodapé com QR */}
        <div style={{ display: 'flex', gap: '3mm', alignItems: 'center', borderTop: '1px solid #9ca3af', paddingTop: '2mm', marginTop: '2mm' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="QR para executar" data-url={url} style={{ width: '24mm', height: '24mm' }} />}
          <div style={{ fontSize: '7.5pt', lineHeight: 1.4 }}>
            <strong>Escaneie para abrir a versão vigente e executar.</strong><br />
            {url}<br />
            Documento controlado: vale a versão publicada no portal. Cópia impressa pode estar desatualizada —
            confira a versão (v{d.versao.numero}) pelo QR. Próxima revisão: {br(d.pop.proxima_revisao_em)}.
          </div>
        </div>
      </div>
  )
  const celula: React.CSSProperties = { border: '1px solid #9ca3af', padding: '1.2mm 2mm', fontSize: '8pt', verticalAlign: 'top' }
  const rot: React.CSSProperties = { fontSize: '6.5pt', textTransform: 'uppercase', color: '#4b5563', fontWeight: 700, display: 'block' }

  return (
    <>
      <style>{`
        @page { size: A4; margin: 8mm; }
        #opl-impressao { display: none; }
        @media print {
          /* Só a cópia da folha (filha direta do body) é impressa; o resto do portal some
             de verdade (display none) — escondido com visibility ele ainda ocupava páginas. */
          body > *:not(#opl-impressao) { display: none !important; }
          #opl-impressao { display: block !important; }
          #opl-impressao .folha { margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>
      <div className="nao-imprime" style={{ maxWidth: '194mm', margin: '12px auto', display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={() => window.print()} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#0f766e', color: '#fefefe', fontWeight: 800, cursor: 'pointer' }}>Imprimir</button>
        <span style={{ fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>Folha A4. O QR abre a versão vigente no portal com &quot;Executar&quot;.</span>
      </div>

      {folha('folha-opl')}
      {typeof document !== 'undefined' && createPortal(<div id="opl-impressao">{folha('folha-opl-impressao')}</div>, document.body)}
    </>
  )
}
