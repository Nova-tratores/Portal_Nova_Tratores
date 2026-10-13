'use client'
// Sugestão de preço pela internet (Patrimônio Loja). Busca sozinha UMA vez
// quando já tem descrição + marca/modelo/categoria e o valor está vazio
// (espera a pessoa parar de digitar); depois só pelo botão. Mostra o valor
// sugerido para o ESTADO escolhido, as faixas de novo e usado e os anúncios
// com link. Nada é preenchido sem clicar em "Usar este valor".
// Cada busca usa a conta da OpenAI da empresa (alguns centavos).

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Globe, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { faixa, montarConsulta, podeBuscar, sugerirValor, type Anuncio, type ResultadoPreco } from '@/lib/patrimonio/preco'
import { INFO_ESTADO, type DadosForm } from '@/lib/patrimonio/tipos'
import { botao } from '../pecas/comum'
import { api, COR_PAT, fmtReal } from './comum'

export default function SugestaoPreco({ form, automatico, onUsar }: { form: DadosForm; automatico: boolean; onUsar: (valor: number) => void }) {
  const dados = { descricao: form.descricao, marca: form.marca, modelo: form.modelo, categoria: form.categoria }
  const consulta = podeBuscar(dados) ? montarConsulta(dados) : ''
  const [res, setRes] = useState<ResultadoPreco | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [verAnuncios, setVerAnuncios] = useState(false)
  const autoFeito = useRef(false)

  const buscar = async () => {
    if (!consulta || buscando) return
    setBuscando(true)
    setErro(null)
    try {
      const r = await api<{ resultado: ResultadoPreco }>('/api/patrimonio/preco', { method: 'POST', body: dados })
      setRes(r.resultado)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setBuscando(false)
    }
  }

  // automática: uma vez só, 2,5 s depois de parar de digitar
  useEffect(() => {
    if (!automatico || !consulta || autoFeito.current) return
    const t = setTimeout(() => { autoFeito.current = true; buscar() }, 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automatico, consulta])

  if (!consulta && !res) {
    return <div style={{ ...CAIXA, color: 'var(--portal-text-muted)' }}><Globe size={15} /> Preencha a descrição e a categoria (ou marca/modelo) que o portal busca o preço na internet.</div>
  }

  const sug = res ? sugerirValor(res, form.estado) : null
  const fn = res ? faixa(res.novo) : null
  const fu = res ? faixa(res.usado) : null
  const desatualizada = !!res && !!consulta && res.consulta !== consulta

  return (
    <div style={{ ...CAIXA, flexDirection: 'column', alignItems: 'stretch', gap: 8, borderColor: res ? '#C7D2FE' : 'var(--portal-border)', background: res ? '#EEF2FF' : 'var(--portal-bg-secondary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Sparkles size={16} style={{ color: COR_PAT }} />
        <b style={{ color: 'var(--portal-text)' }}>Preço na internet</b>
        {res && <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>“{res.consulta}”</span>}
        <button type="button" onClick={buscar} disabled={buscando || !consulta} style={{ ...botao(COR_PAT, { contorno: true, desab: buscando || !consulta }), marginLeft: 'auto', padding: '5px 10px', fontSize: 12.5 }}>
          {buscando ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />} {res ? 'Buscar de novo' : 'Buscar preço'}
        </button>
      </div>

      {buscando && <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>Pesquisando anúncios de novo e usado… (uns 10 segundos)</div>}
      {erro && <div style={{ fontSize: 13, color: '#B91C1C' }}>{erro}</div>}
      {desatualizada && !buscando && <div style={{ fontSize: 12.5, color: '#B45309' }}>Os dados mudaram depois da busca — clique em “Buscar de novo” para atualizar.</div>}

      {res && !buscando && (
        sug ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>Sugestão para <b>{INFO_ESTADO[form.estado].rotulo.toLowerCase()}</b>:</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: COR_PAT }}>{fmtReal(sug.valor)}</span>
              <button type="button" onClick={() => onUsar(sug.valor)} style={{ ...botao(COR_PAT), padding: '6px 12px', fontSize: 13 }}>Usar este valor</button>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
              {fn && <span><b>Novo:</b> {fmtReal(fn.min)} a {fmtReal(fn.max)} ({fn.n} anúncio{fn.n > 1 ? 's' : ''})</span>}
              {fu && <span><b>Usado:</b> {fmtReal(fu.min)} a {fmtReal(fu.max)} ({fu.n} anúncio{fu.n > 1 ? 's' : ''})</span>}
              <span>baseada no preço de {sug.base}</span>
            </div>
            {res.observacao && <div style={{ fontSize: 12.5, color: '#92400E' }}>{res.observacao}</div>}
            <button type="button" onClick={() => setVerAnuncios((v) => !v)} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: COR_PAT, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              {verAnuncios ? 'Esconder anúncios' : 'Ver os anúncios (confira se é o mesmo item)'}
            </button>
            {verAnuncios && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[...res.novo.map((a) => ({ ...a, cond: 'novo' })), ...res.usado.map((a) => ({ ...a, cond: 'usado' }))].map((a: Anuncio & { cond: string }, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--portal-text)', textDecoration: 'none', padding: '5px 8px', borderRadius: 7, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)' }}>
                    <b style={{ minWidth: 86 }}>{fmtReal(a.preco)}</b>
                    <span style={{ fontSize: 11, fontWeight: 800, color: a.cond === 'novo' ? '#047857' : '#B45309' }}>{a.cond}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titulo || a.url}</span>
                    <ExternalLink size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
                  </a>
                ))}
              </div>
            )}
          </>
        ) : <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>Não achei anúncios desse item. Tente pôr a marca e o modelo, ou informe o valor à mão.</div>
      )}
      {!res && !buscando && !erro && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>{automatico ? 'Vou buscar quando você parar de digitar…' : 'Clique em “Buscar preço” para ver quanto vale.'}</div>}
    </div>
  )
}

const CAIXA: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--portal-border)', fontSize: 13, lineHeight: 1.4,
}
