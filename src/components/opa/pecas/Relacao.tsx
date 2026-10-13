'use client'
// Relação Opa × cadastro: o "Código já existente" de cada peça do Opa já está
// cadastrado no sistema (Omie / características do PPV)? Duas filas — "Já
// cadastrados" (com tipo, locação, estoque e preço de cada empresa) e "Só no
// Opa" — com busca e exportação CSV/PDF. Dados: GET /api/opa/pecas/relacao.

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, FileText, Inbox, Loader2, PackageX, RotateCcw, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { baixarCsv } from '@/lib/opa-pecas/csv'
import { fmtPreco, textoLocal } from '@/lib/opa-pecas/regras'
import { gerarCsvRelacao, ROTULO_MOTIVO, type ItemRelacao, type LinhaRelacao, type Relacao as Dados } from '@/lib/opa-pecas/relacao'
import { ROTULO_QUALIDADE } from '@/lib/opa-pecas/tipos'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Aviso, botao, INP, LARANJA, SECAO, SeloStatus, type Base } from './comum'

type Fila = 'existentes' | 'soOpa'

async function cabecalhoAuth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const bate = (l: LinhaRelacao, q: string) => {
  if (!q) return true
  const t = [l.item.codigo, l.item.codigo_fabricante, l.item.codigo_correto, l.item.descricao, ...l.cadastros.flatMap((c) => [c.codigo, c.descricao, c.tipo, c.marca])]
    .filter(Boolean).join(' ').toLowerCase()
  return q.toLowerCase().split(/\s+/).every((p) => t.includes(p))
}

export default function Relacao({ base }: { base: Base }) {
  const isMobile = useIsMobile()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [fila, setFila] = useState<Fila>('existentes')
  const [busca, setBusca] = useState('')
  const [gerandoPdf, setGerandoPdf] = useState(false)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const r = await fetch('/api/opa/pecas/relacao', { headers: await cabecalhoAuth(), cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.erro || `Erro ${r.status}`)
      setDados({ existentes: j.existentes, soOpa: j.soOpa })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a relação.')
    }
  }, [])
  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  const local = useCallback((i: ItemRelacao) => textoLocal(i, base.nomesLocais), [base.nomesLocais])
  const filtrado: Dados | null = useMemo(() => dados && {
    existentes: dados.existentes.filter((l) => bate(l, busca.trim())),
    soOpa: dados.soOpa.filter((l) => bate(l, busca.trim())),
  }, [dados, busca])

  const exportarCsv = () => filtrado && baixarCsv(`relacao-pecas-opa-${new Date().toISOString().slice(0, 10)}.csv`, gerarCsvRelacao(filtrado, local))
  const exportarPdf = async () => {
    if (!filtrado) return
    setGerandoPdf(true)
    try {
      const { gerarPdfRelacao } = await import('@/lib/opa-pecas/relacao-pdf')
      await gerarPdfRelacao(filtrado, local, busca.trim() || undefined)
    } catch (e) {
      setErro(`Não foi possível gerar o PDF: ${e instanceof Error ? e.message : e}`)
    } finally { setGerandoPdf(false) }
  }

  if (erro && !dados) return <Aviso acao={<button type="button" onClick={carregar} style={botao('#DC2626')}><RotateCcw size={14} /> Tentar de novo</button>}>{erro}</Aviso>
  if (!filtrado) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>

  const linhas = filtrado[fila]
  const vazio = (filtrado.existentes.length + filtrado.soOpa.length) === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--portal-text)' }}>Relação com o cadastro</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--portal-text-muted)' }}>
          O <b>código já existente</b> que foi digitado em cada peça do Opa é procurado nos produtos cadastrados (NOVA e CASTRO), com as características do PPV.
        </p>
      </div>

      {erro && <Aviso>{erro}</Aviso>}

      {/* filas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <BotaoFila mobile={isMobile} ativo={fila === 'existentes'} onClick={() => setFila('existentes')} cor="#047857" icone={<CheckCircle2 size={18} />}
          titulo={isMobile ? "Cadastrados" : "Já cadastrados"} n={filtrado.existentes.length} dica="O código existe no sistema" />
        <BotaoFila mobile={isMobile} ativo={fila === 'soOpa'} onClick={() => setFila('soOpa')} cor={LARANJA} icone={<PackageX size={18} />}
          titulo="Só no Opa" n={filtrado.soOpa.length} dica="Sem código ou código não cadastrado" />
      </div>

      {/* busca + exportar (celular: busca na linha toda, CSV e PDF lado a lado embaixo) */}
      <div style={isMobile
        ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }
        : { display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0, gridColumn: isMobile ? '1 / -1' : undefined }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código, descrição, tipo ou marca" style={{ ...INP, fontSize: 14, paddingLeft: 32 }} />
        </div>
        <button type="button" onClick={exportarCsv} disabled={vazio} style={botao('#52525B', { contorno: true, desab: vazio })}><Download size={15} /> CSV</button>
        <button type="button" onClick={exportarPdf} disabled={vazio || gerandoPdf} style={botao('#52525B', { contorno: true, desab: vazio || gerandoPdf })}>
          {gerandoPdf ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={15} />} PDF
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: -6 }}>A exportação leva as duas filas (respeitando a busca).</div>

      {linhas.length === 0 ? (
        <div style={{ ...SECAO, alignItems: 'center', padding: 36, color: 'var(--portal-text-muted)', fontWeight: 600 }}>
          <Inbox size={26} /> {busca ? 'Nada encontrado nesta fila.' : fila === 'existentes' ? 'Nenhuma peça com código já cadastrado.' : 'Todas as peças têm código cadastrado.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {linhas.map((l) => <Cartao key={l.item.id} l={l} local={local(l.item)} mobile={isMobile} />)}
        </div>
      )}
    </div>
  )
}

function BotaoFila({ ativo, onClick, cor, icone, titulo, n, dica, mobile }: { ativo: boolean; onClick: () => void; cor: string; icone: React.ReactNode; titulo: string; n: number; dica: string; mobile: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} title={dica} style={{
      display: 'flex', alignItems: 'center', gap: mobile ? 8 : 10, padding: mobile ? '10px 12px' : '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', minWidth: 0,
      border: `1.5px solid ${ativo ? cor : 'var(--portal-border)'}`, background: ativo ? `${cor}12` : 'var(--portal-bg-card)',
    }}>
      <span style={{ color: cor, display: 'flex', flexShrink: 0 }}>{icone}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: mobile ? 13 : 14, fontWeight: 800, color: 'var(--portal-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titulo}</span>
        <span style={{ display: mobile ? 'none' : 'block', fontSize: 11.5, color: 'var(--portal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dica}</span>
      </span>
      <span style={{ fontSize: 18, fontWeight: 800, color: cor }}>{n}</span>
    </button>
  )
}

function Cartao({ l, local, mobile }: { l: LinhaRelacao; local: string; mobile: boolean }) {
  const i = l.item
  return (
    <div style={{ ...SECAO, padding: 14, gap: 10 }}>
      {/* a peça no Opa */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`/opa/pecas/${encodeURIComponent(i.codigo)}`} style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: LARANJA, textDecoration: 'none' }}>{i.codigo}</Link>
            <SeloStatus status={i.status} />
            {l.motivo && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: '#FFF7ED', color: '#9A3412' }}>{ROTULO_MOTIVO[l.motivo]}</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)', marginTop: 4 }}>{i.descricao || 'Sem descrição'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', marginTop: 2 }}>
            {i.quantidade} {i.quantidade === 1 ? 'peça' : 'peças'} · {ROTULO_QUALIDADE[i.qualidade]}{local ? ` · ${local}` : ''}
            {i.preco_sugerido != null ? ` · ${fmtPreco(i.preco_sugerido)}` : ''}
          </div>
        </div>
        <div style={{ textAlign: mobile ? 'left' : 'right' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--portal-text-muted)' }}>Código existente</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: 'var(--portal-text)', textDecoration: i.codigo_correto ? 'line-through' : undefined }}>{i.codigo_fabricante || '—'}</div>
          {i.codigo_correto && (
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: '#B45309' }}>
              Embalagem errada · correto <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800 }}>{i.codigo_correto}</span>
            </div>
          )}
        </div>
      </div>

      {/* o cadastro em cada empresa */}
      {l.cadastros.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'minmax(0, 1fr)' : `repeat(${l.cadastros.length}, minmax(0, 1fr))`, gap: 8 }}>
          {l.cadastros.map((c) => (
            <div key={c.empresa} style={{ padding: '10px 12px', borderRadius: 10, background: '#ECFDF5', border: '1px solid #A7F3D0', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 8px', borderRadius: 6, background: '#047857', color: '#fefefe' }}>{c.empresa}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5, color: '#065F46' }}>{c.codigo}</span>
                {c.inativo && <span style={{ fontSize: 11, fontWeight: 700, color: '#991B1B' }}>inativo</span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#064E3B', marginTop: 4, overflowWrap: 'anywhere' }}>{c.descricao || '—'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '2px 12px', marginTop: 6, fontSize: 12, color: '#065F46' }}>
                <span><b>Tipo:</b> {c.tipo || '—'}</span>
                {([['Prateleira', c.posicao?.prateleira], ['Andar', c.posicao?.andar], ['Caixa', c.posicao?.caixa]] as const).map(([r, v]) => (
                  <span key={r} style={v ? undefined : { color: '#B45309' }}><b>{r}:</b> {v || 'não tem'}</span>
                ))}
                <span><b>Estoque:</b> {c.estoque == null ? '—' : String(c.estoque).replace('.', ',')}</span>
                <span><b>Valor:</b> {c.valor_unitario == null ? '—' : fmtPreco(c.valor_unitario)}</span>
                {c.marca && <span><b>Marca:</b> {c.marca}</span>}
                {c.familia && <span><b>Família:</b> {c.familia}</span>}
                {c.outras.map((o) => <span key={o.nome}><b>{o.nome}:</b> {o.valor}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
