'use client'
// RASTREIO DE NOTAS — busca por nº de nota (principal), requisição (#123),
// boleto (nº ou linha digitável) ou fornecedor e mostra a FICHA de cada
// documento: conta a pagar, requisições de origem, boletos/parcelas, NF de
// entrada/saída, faturamento, pasta do cliente e TODOS os anexos (ver /
// baixar / imprimir / baixar tudo em zip). Vínculo automático (chave NF-e,
// nº + fornecedor/CNPJ) + vínculo manual quando o matching não achar.
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import AnexosFicha from '@/components/financeiro/rastreio/AnexosFicha'
import DialogoVincular from '@/components/financeiro/rastreio/DialogoVincular'
import { authHeaders } from '@/lib/auth/client'
import { formatarDataBR, formatarMoeda } from '@/lib/financeiro/utils'
import {
  AlertTriangle, ChevronDown, ExternalLink, FileText, Link2, Loader2, ScanSearch, Unlink,
} from 'lucide-react'

const ROTULO_TIPO = {
  finan_pagar: 'Conta a pagar',
  requisicao: 'Requisição',
  chamado_nf: 'Faturamento',
  nota_entrada: 'NF entrada',
  nota_saida: 'NF saída',
  titulo_omie: 'Título Omie',
}

// documento "representante" da ficha (âncora do vínculo manual)
function refDaFicha(f) {
  const fp = f.secoes.contaPagar[0]
  if (fp) return { ref: { tipo: 'finan_pagar', id: String(fp.id) }, label: `Conta a pagar #${fp.id}` }
  const q = f.secoes.requisicoes[0]
  if (q) return { ref: { tipo: 'requisicao', id: String(q.id) }, label: `Requisição #${q.id}` }
  const c = f.secoes.chamadosReceber[0]
  if (c) return { ref: { tipo: 'chamado_nf', id: String(c.id) }, label: `Faturamento #${c.id}` }
  const ne = f.secoes.nfEntrada[0]
  if (ne?.ncod_nf) return { ref: { tipo: 'nota_entrada', id: String(ne.ncod_nf) }, label: `NF entrada ${ne.numero_nf}` }
  const ns = f.secoes.nfSaida[0]
  if (ns) return { ref: { tipo: 'nota_saida', id: String(ns.n_cod_nf) }, label: `NF saída ${ns.numero}` }
  const t = f.secoes.titulosOmie[0]
  if (t) return { ref: { tipo: 'titulo_omie', id: String(t.codigo_lancamento) }, label: `Título Omie ${t.codigo_lancamento}` }
  return null
}

const STATUS_FP = { financeiro: 'No financeiro', aguardando_omie: 'Aguardando Omie', concluido: 'Concluída' }

function Secao({ titulo, itens, children }) {
  const [aberto, setAberto] = useState(true)
  if (!itens || itens.length === 0) return null
  return (
    <div style={{ borderTop: '1px solid #f1f4f8' }}>
      <button onClick={() => setAberto(a => !a)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
        <ChevronDown size={15} style={{ color: '#94a3b8', transform: aberto ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s' }} />
        <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1px', color: '#64748b', textTransform: 'uppercase' }}>{titulo}</span>
        <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>({itens.length})</span>
      </button>
      {aberto && <div style={{ padding: '0 20px 14px' }}>{children}</div>}
    </div>
  )
}

const linha = { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '13px', color: '#334155', padding: '7px 0', borderBottom: '1px dashed #f1f4f8' }
const chip = (bg, cor) => ({ fontSize: '10.5px', fontWeight: 800, padding: '2px 9px', borderRadius: '999px', background: bg, color: cor, whiteSpace: 'nowrap' })

// refKeys de TODOS os docs da ficha — o diálogo de vincular não deve oferecer
// quem já está aqui dentro
function refsDaFicha(f) {
  const s = f.secoes
  return [
    ...s.contaPagar.map(x => `finan_pagar:${x.id}`),
    ...s.requisicoes.map(x => `requisicao:${x.id}`),
    ...s.chamadosReceber.map(x => `chamado_nf:${x.id}`),
    ...s.titulosOmie.map(x => `titulo_omie:${x.codigo_lancamento}`),
    ...s.nfEntrada.filter(x => x.ncod_nf != null).map(x => `nota_entrada:${x.ncod_nf}`),
    ...s.nfSaida.map(x => `nota_saida:${x.n_cod_nf}`),
  ]
}

function FichaDocumento({ ficha, onMudou }) {
  const [vincularAberto, setVincularAberto] = useState(false)
  const [desvinculando, setDesvinculando] = useState(0)
  const rep = refDaFicha(ficha)

  const desvincular = async (id) => {
    setDesvinculando(id)
    try {
      const r = await fetch('/api/financeiro/rastreio/vinculos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id }),
      })
      if (r.ok) onMudou()
    } finally {
      setDesvinculando(0)
    }
  }

  const s = ficha.secoes
  const parcelasFp = (fp) => String(fp.parcelas_vencimentos || '').split(',').map(x => x.trim()).filter(Boolean)
    .map(p => { const [venc, val] = p.split('|'); return { venc, val } })

  return (
    <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e9ecf1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(16,24,40,0.05)' }}>
      {/* cabeçalho */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: 'linear-gradient(135deg,#f8fafc,#fff)' }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              {ficha.numeroNf ? `NF ${ficha.numeroNf}` : rep?.label || 'Documento'}
            </span>
            {ficha.contraparte.nome && <span style={{ fontSize: '14px', color: '#475569' }}>{String(ficha.contraparte.nome).toUpperCase()}</span>}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
            {ficha.chaveNfe && <span style={chip('#ecfdf5', '#047857')} title={ficha.chaveNfe}>chave NF-e ✓</span>}
            {ficha.vinculoManual && <span style={chip('#eff6ff', '#2563eb')}>vínculo manual</span>}
            {s.nfSaida.some(x => x.cancelada) && <span style={chip('#fef2f2', '#dc2626')}>CANCELADA</span>}
            {s.pastaCliente.some(p => p.substituidaPor) && <span style={chip('#fffbeb', '#b45309')}>substituída</span>}
          </div>
        </div>
        {ficha.valorRef != null && <span style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>{formatarMoeda(ficha.valorRef)}</span>}
        <button onClick={() => setVincularAberto(true)} disabled={!rep} title="Vincular outro documento a esta ficha"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', fontSize: '12px', fontWeight: 700, cursor: rep ? 'pointer' : 'default' }}>
          <Link2 size={13} /> Vincular
        </button>
      </div>

      {/* conta a pagar */}
      <Secao titulo="Conta a pagar" itens={s.contaPagar}>
        {s.contaPagar.map(fp => (
          <div key={fp.id}>
            <div style={linha}>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>#{fp.id}</span>
              <span>{fp.fornecedor}</span>
              <span style={{ fontWeight: 700 }}>R$ {fp.valor}</span>
              <span>venc. {formatarDataBR(fp.data_vencimento)}</span>
              <span>{fp.metodo || '—'}</span>
              <span style={chip('#f1f5f9', '#475569')}>{STATUS_FP[fp.status] || fp.status}</span>
              {fp.omie_cod_lancamento && <span style={chip('#ecfdf5', '#047857')}>Omie ✓ {fp.omie_empresa || ''}</span>}
              {fp.criado_por && <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>por {fp.criado_por}</span>}
            </div>
            {parcelasFp(fp).length > 0 && (
              <div style={{ ...linha, borderBottom: 'none', fontSize: '12px', color: '#64748b' }}>
                {parcelasFp(fp).map((p, i) => (
                  <span key={i} style={chip('#f8fafc', '#475569')}>{i + 1}ª: {formatarDataBR(p.venc)} · R$ {p.val}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </Secao>

      {/* requisições */}
      <Secao titulo="Requisições" itens={s.requisicoes}>
        {s.requisicoes.map(q => (
          <div key={q.id} style={linha}>
            <a href={`/requisicoes?req=${q.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>#{q.id} <ExternalLink size={11} style={{ verticalAlign: '-1px' }} /></a>
            <span style={{ flex: 1, minWidth: '140px' }}>{q.titulo || '—'}</span>
            <span>{q.fornecedor || '—'}</span>
            <span>NF {q.numero_nota || '—'}</span>
            <span style={{ fontWeight: 700 }}>{q.valor_despeza ? `R$ ${q.valor_despeza}` : '—'}</span>
            <span style={chip('#f1f5f9', '#475569')}>{q.status}</span>
            {q.ordem_servico && <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>OS {q.ordem_servico}</span>}
          </div>
        ))}
      </Secao>

      {/* boletos / parcelas (títulos do Omie) */}
      <Secao titulo="Boletos / parcelas (Omie)" itens={s.titulosOmie}>
        {s.titulosOmie.map(tt => (
          <div key={`${tt.tipo}-${tt.codigo_lancamento}`} style={linha}>
            <span style={chip(tt.tipo === 'pagar' ? '#fef2f2' : '#ecfdf5', tt.tipo === 'pagar' ? '#dc2626' : '#047857')}>{tt.tipo === 'pagar' ? 'A PAGAR' : 'A RECEBER'}</span>
            <span>lançamento {tt.codigo_lancamento}</span>
            {tt.numero_boleto && <span style={{ fontFamily: 'monospace' }}>boleto {tt.numero_boleto}</span>}
            {tt.numero_parcela && <span>parcela {tt.numero_parcela}</span>}
            <span style={{ fontWeight: 700 }}>{formatarMoeda(tt.valor_documento || 0)}</span>
            <span>venc. {formatarDataBR(tt.data_vencimento)}</span>
            <span style={chip('#f1f5f9', '#475569')}>{tt.status_titulo || '—'}</span>
            <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>{tt.conta_omie || ''}</span>
          </div>
        ))}
      </Secao>

      {/* NF de entrada */}
      <Secao titulo="NF de entrada (compras)" itens={s.nfEntrada}>
        {s.nfEntrada.map((ne, i) => (
          <div key={i} style={linha}>
            <span style={{ fontWeight: 700 }}>NF {ne.numero_nf}{ne.serie ? `/${ne.serie}` : ''}</span>
            <span style={{ flex: 1, minWidth: '140px' }}>{ne.nome_emitente || '—'}</span>
            <span style={{ fontWeight: 700 }}>{formatarMoeda(ne.valor_nf || 0)}</span>
            <span>{ne.data_emissao || '—'}</span>
            <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>{ne.conta_omie}</span>
          </div>
        ))}
      </Secao>

      {/* NF de saída */}
      <Secao titulo="NF de saída (faturamento Omie)" itens={s.nfSaida}>
        {s.nfSaida.map(ns => (
          <div key={ns.n_cod_nf} style={linha}>
            <span style={{ fontWeight: 700 }}>NF {ns.numero}{ns.serie ? `/${ns.serie}` : ''}</span>
            <span style={chip('#f1f5f9', '#475569')}>{ns.tipo}</span>
            <span style={{ flex: 1, minWidth: '140px' }}>{ns.cliente_nome || '—'}</span>
            <span style={{ fontWeight: 700 }}>{formatarMoeda(ns.valor_nf || 0)}</span>
            <span>{ns.data_emissao ? formatarDataBR(ns.data_emissao) : '—'}</span>
            {ns.cancelada && <span style={chip('#fef2f2', '#dc2626')}>CANCELADA</span>}
            <a href={`/api/ajustes/notas/danfe?conta=${encodeURIComponent(ns.conta_omie || 'NOVA')}&nCodNF=${encodeURIComponent(ns.n_cod_nf)}&tipo=${encodeURIComponent(ns.tipo || 'produto')}&redirect=1`}
              target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#2563eb', fontWeight: 700, fontSize: '12px', textDecoration: 'none' }}>
              <FileText size={12} /> DANFE
            </a>
          </div>
        ))}
      </Secao>

      {/* faturamento (contas a receber do cliente) */}
      <Secao titulo="Faturamento (a receber)" itens={s.chamadosReceber}>
        {s.chamadosReceber.map(c => (
          <div key={c.id} style={linha}>
            <span style={{ fontWeight: 700 }}>#{c.id}</span>
            <span style={{ flex: 1, minWidth: '140px' }}>{c.nom_cliente || '—'}</span>
            {c.num_nf_servico && <span>NF serv. {c.num_nf_servico}</span>}
            {c.num_nf_peca && <span>NF peça {c.num_nf_peca}</span>}
            <span style={{ fontWeight: 700 }}>{c.valor_servico != null ? formatarMoeda(Number(c.valor_servico) || 0) : '—'}</span>
            <span>{c.forma_pagamento || '—'}</span>
            {c.vencimento_boleto && <span>venc. {formatarDataBR(c.vencimento_boleto)}</span>}
            <span style={chip('#f1f5f9', '#475569')}>{c.status || '—'}</span>
          </div>
        ))}
      </Secao>

      {/* pasta do cliente */}
      <Secao titulo="Pasta do cliente" itens={s.pastaCliente}>
        {s.pastaCliente.map((p, i) => (
          <div key={i} style={linha}>
            <span style={{ fontWeight: 700 }}>{p.origem === 'os' ? `OS ${p.num_os}` : `PV ${p.num_pedido}`}</span>
            <span>{p.empresa || '—'}</span>
            <span>NF {p.origem === 'os' ? p.num_nf : p.numero_nf}</span>
            {p.nf_manual && <span style={chip('#fffbeb', '#b45309')}>anexo manual</span>}
            {p.substituidaPor && <span style={chip('#fffbeb', '#b45309')}>substituída por NF {p.substituidaPor}</span>}
          </div>
        ))}
      </Secao>

      {/* anexos */}
      <div style={{ borderTop: '1px solid #f1f4f8', padding: '14px 20px' }}>
        <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1px', color: '#64748b', textTransform: 'uppercase', marginBottom: '10px' }}>
          Anexos ({ficha.anexos.length})
        </div>
        <AnexosFicha anexos={ficha.anexos} numeroNf={ficha.numeroNf} />
      </div>

      {/* vínculos manuais */}
      {ficha.vinculos.length > 0 && (
        <div style={{ borderTop: '1px solid #f1f4f8', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1px', color: '#64748b', textTransform: 'uppercase' }}>Vínculos manuais</div>
          {ficha.vinculos.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#475569', flexWrap: 'wrap' }}>
              <Link2 size={13} style={{ color: '#2563eb' }} />
              <span>{ROTULO_TIPO[v.a.tipo] || v.a.tipo} {v.a.id} ↔ {ROTULO_TIPO[v.b.tipo] || v.b.tipo} {v.b.id}</span>
              {v.criado_por_nome && <span style={{ color: '#94a3b8' }}>por {v.criado_por_nome}</span>}
              <button onClick={() => desvincular(v.id)} disabled={desvinculando === v.id} title="Desvincular"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                {desvinculando === v.id ? <Loader2 size={11} className="animate-spin" /> : <Unlink size={11} />} desvincular
              </button>
            </div>
          ))}
        </div>
      )}

      {vincularAberto && rep && (
        <DialogoVincular origem={rep.ref} origemLabel={rep.label} jaNaFicha={refsDaFicha(ficha)} onVinculado={onMudou} onClose={() => setVincularAberto(false)} />
      )}
    </div>
  )
}

function RastreioInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const qParam = searchParams.get('q') || ''

  const [termo, setTermo] = useState(qParam)
  const [resposta, setResposta] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const buscar = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setResposta(null); return }
    setCarregando(true)
    setErro('')
    try {
      const r = await fetch(`/api/financeiro/rastreio?q=${encodeURIComponent(q.trim())}`, { headers: await authHeaders() })
      const j = await r.json()
      if (r.status === 401 || r.status === 403) {
        throw new Error('Você não tem permissão pro rastreio de notas — peça ao admin a permissão "Rastreio de notas" do módulo Financeiro.')
      }
      if (!r.ok) throw new Error(j.error || 'Falha na busca')
      setResposta(j)
    } catch (e) {
      setErro(String(e?.message || e))
      setResposta(null)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { setTermo(qParam); buscar(qParam) }, [qParam, buscar])

  const submeter = () => {
    const q = termo.trim()
    if (q.length < 2) return
    router.replace(`/financeiro/rastreio?q=${encodeURIComponent(q)}`)
  }

  return (
    <main style={{ padding: 'clamp(12px, 4vw, 24px) clamp(12px, 4vw, 32px)', maxWidth: '1180px', margin: '0 auto' }}>
      {/* busca */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e9ecf1', padding: '18px 20px', marginBottom: '18px', boxShadow: '0 1px 3px rgba(16,24,40,0.05)' }}>
        <label style={{ fontSize: '10px', color: '#9e9e9e', letterSpacing: '1px', marginLeft: '5px', textTransform: 'uppercase' }}>Rastrear documento</label>
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 380px' }}>
            <ScanSearch size={18} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#9e9e9e' }} />
            <input
              value={termo}
              onChange={e => setTermo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submeter() }}
              placeholder="Nº da nota fiscal, requisição (#123), nº do boleto ou linha digitável, fornecedor…"
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', padding: '14px 14px 14px 45px', borderRadius: '12px', border: '1px solid #d1d5db', outline: 'none', fontSize: '14px' }}
            />
          </div>
          <button onClick={submeter} disabled={carregando || termo.trim().length < 2}
            style={{ padding: '14px 26px', borderRadius: '12px', border: 'none', background: carregando || termo.trim().length < 2 ? '#c7d2fe' : '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {carregando ? <Loader2 size={16} className="animate-spin" /> : <ScanSearch size={16} />} RASTREAR
          </button>
        </div>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '10px 5px 0', lineHeight: 1.5 }}>
          A ficha reúne tudo do documento: conta a pagar, requisições, boletos/parcelas, NF de entrada/saída, faturamento e anexos
          (ver, baixar, imprimir tudo). O nº da nota é o caminho mais direto.
        </p>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '12px', padding: '12px 16px', fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>
          {erro}
        </div>
      )}
      {(resposta?.avisos || []).map((a, i) => (
        <div key={i} style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: '12px', padding: '10px 14px', fontSize: '12.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={14} /> {a}
        </div>
      ))}

      {carregando && (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e9ecf1', padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
          <Loader2 size={18} className="animate-spin" style={{ verticalAlign: '-4px', marginRight: '8px' }} /> Rastreando o documento nas contas, requisições, notas e boletos…
        </div>
      )}

      {!carregando && resposta && resposta.fichas.length === 0 && (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e9ecf1', padding: '60px', textAlign: 'center', color: '#9e9e9e', fontSize: '15px' }}>
          Nada encontrado pra “{resposta.termo?.bruto}”. Tente o nº da nota sem zeros à esquerda, o #id da requisição ou o nome do fornecedor.
        </div>
      )}

      {!carregando && resposta && resposta.fichas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {resposta.fichas.length > 1 && (
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              {resposta.fichas.length} documentos encontrados — o mais provável primeiro.
            </div>
          )}
          {resposta.fichas.map(f => (
            <FichaDocumento key={f.docKey} ficha={f} onMudou={() => buscar(qParam)} />
          ))}
        </div>
      )}
    </main>
  )
}

export default function RastreioPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa', fontFamily: 'Inter, sans-serif' }}>
      <FinanceiroNav />
      <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Carregando…</div>}>
        <RastreioInner />
      </Suspense>
    </div>
  )
}
