'use client'
// Visão do portal (desktop) das Peças Não Identificadas: totais por status,
// filtros, tabela com seleção múltipla (status e etiquetas em lote) e
// exportação CSV/PDF da MESMA lista filtrada da tela.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, FileText, Loader2, MapPin, Printer, RotateCcw, Settings2, SlidersHorizontal, X } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { gerarCsv, baixarCsv } from '@/lib/opa-pecas/csv'
import { listarItens, mudarStatusLote, nomesUsuarios, salvarMarca, salvarTipo, type ResultadoLote } from '@/lib/opa-pecas/db'
import { mensagemErro } from '@/lib/opa-pecas/fotos'
import { gerarPdfCatalogo } from '@/lib/opa-pecas/pdf'
import { calcularTotais, camposFaltando, codigoDefinitivo, nomeDoItem, ehFinal, exigeMotivo, FILTROS_VAZIOS, filtrarItens, fmtData, fmtPreco, resumoFiltros, textoAplicacoes, textoLocal, transicaoValida, type Filtros } from '@/lib/opa-pecas/regras'
import { COR_STATUS, QUALIDADES, ROTULO_QUALIDADE, ROTULO_STATUS, STATUS, type Item, type Lookup, type Status } from '@/lib/opa-pecas/tipos'
import { CodigoPeca, SeloEtiqueta, Aviso, botao, INP, LARANJA, Miniatura, SeloQualidade, SeloStatus, useMiniaturas, type Base } from './comum'
import { CampoPreco } from './Campos'
import DetalheItem from './DetalheItem'
import Impressao, { type ItemParaEtiqueta } from './Impressao'
import { Janela } from './Moldura'

const CHAVE_FILTROS = 'opa-pecas-filtros'

function filtrosSalvos(): Filtros {
  try {
    const raw = localStorage.getItem(CHAVE_FILTROS)
    if (raw) return { ...FILTROS_VAZIOS, ...JSON.parse(raw) }
  } catch { /* segue */ }
  return FILTROS_VAZIOS
}

export default function VisaoGeral({ base }: { base: Base }) {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [f, setF] = useState<Filtros>(FILTROS_VAZIOS)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<Item | null>(null)
  const [usuarios, setUsuarios] = useState<Record<string, string>>({})
  const [lote, setLote] = useState<{ para: Status | ''; motivo: string }>({ para: '', motivo: '' })
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [resultadoLote, setResultadoLote] = useState<ResultadoLote | null>(null)
  const [cadastros, setCadastros] = useState(false)
  const [verFiltros, setVerFiltros] = useState(false)
  const [imprimindo, setImprimindo] = useState<ItemParaEtiqueta[] | null>(null)
  const isMobile = useIsMobile()

  const carregar = useCallback(async () => {
    try {
      const lista = await listarItens()
      setItens(lista)
      setErro(null)
      setUsuarios(await nomesUsuarios(lista.flatMap((i) => [i.criado_por, i.atualizado_por])))
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [])

  useEffect(() => {
    // filtros lembrados neste navegador (lidos depois da montagem: SSR não tem localStorage)
    const salvos = filtrosSalvos()
    Promise.resolve().then(() => setF(salvos))
    carregar()
  }, [carregar])
  useEffect(() => { try { localStorage.setItem(CHAVE_FILTROS, JSON.stringify(f)) } catch { /* segue */ } }, [f])

  const filtrados = useMemo(() => filtrarItens(itens || [], f), [itens, f])
  const totais = useMemo(() => calcularTotais(filtrados), [filtrados])
  const minis = useMiniaturas(filtrados.slice(0, 300).map((i) => i.fotos[0]?.storage_path).filter(Boolean) as string[])
  const nomes = { tipos: base.nomesTipos, marcas: base.nomesMarcas, usuarios, locais: base.nomesLocais }
  const selecionados = filtrados.filter((i) => sel.has(i.id))
  const filtrosTxt = resumoFiltros(f, nomes)
  const temFiltro = filtrosTxt.length > 0

  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const todosMarcados = filtrados.length > 0 && filtrados.every((i) => sel.has(i.id))
  const alternarTodos = () => setSel(todosMarcados ? new Set() : new Set(filtrados.map((i) => i.id)))
  const toggleLista = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v])

  const aplicarLote = async () => {
    if (!lote.para || selecionados.length === 0) return
    if (exigeMotivo(lote.para) && !lote.motivo.trim()) { setAviso(lote.para === 'descartado' ? 'Informe o motivo do descarte.' : 'Descreva o que aconteceu com as peças.'); return }
    setOcupado('lote'); setAviso(null); setResultadoLote(null)
    try {
      const r = await mudarStatusLote(selecionados.map((i) => i.id), lote.para, lote.motivo)
      setResultadoLote(r)
      setSel(new Set(r.erros.map((e) => e.id)))
      await carregar()
    } catch (e) {
      setAviso(mensagemErro(e))
    } finally {
      setOcupado(null)
    }
  }

  const imprimirLote = (lista: Item[]) => {
    const comCodigo = lista.filter((i) => codigoDefinitivo(i.codigo))
    if (comCodigo.length) setImprimindo(comCodigo.map((i) => ({ id: i.id, jaGerada: !!i.etiqueta_impressa_em, token: i.token_publico, codigo: i.codigo, descricao: i.descricao, quantidade: i.quantidade, local: textoLocal(i, base.nomesLocais) })))
  }
  // etiqueta só existe para peça com código definitivo (do Destino em diante)
  const pendentesEtiqueta = filtrados.filter((i) => codigoDefinitivo(i.codigo) && !i.etiqueta_impressa_em)
  const selComCodigo = selecionados.filter((i) => codigoDefinitivo(i.codigo))

  const exportarCsv = () => baixarCsv(`pecas-nao-identificadas-${new Date().toISOString().slice(0, 10)}.csv`, gerarCsv(filtrados, nomes))

  const exportarPdf = async () => {
    setOcupado('pdf'); setAviso(null)
    try {
      await gerarPdfCatalogo({ itens: filtrados, nomes, filtros: filtrosTxt, comStatus: f.status.length !== 1 })
    } catch (e) {
      setAviso(`Não foi possível gerar o PDF: ${mensagemErro(e)}`)
    } finally {
      setOcupado(null)
    }
  }

  // Status que todos os selecionados aceitam (para o seletor do lote)
  // em lote só se encerra (separação e verificação têm etapa própria)
  const destinosLote = STATUS.filter((s) => ehFinal(s) && selecionados.some((i) => transicaoValida(i.status, s)))

  const chip = (ativo: boolean, cor = LARANJA): React.CSSProperties => ({
    padding: '6px 11px', borderRadius: 16, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    border: `1.5px solid ${ativo ? cor : 'var(--portal-border)'}`, background: ativo ? cor : 'var(--portal-bg-card)',
    color: ativo ? '#fff' : 'var(--portal-text-secondary)',
  })

  return (
    <div>
      {/* Totais */}
      <div style={isMobile
        ? { display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '132px', gap: 8, overflowX: 'auto', margin: '0 -12px 14px', padding: '0 12px 4px' }
        : { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        {STATUS.map((s) => (
          <button key={s} onClick={() => setF((x) => ({ ...x, status: toggleLista(x.status, s) }))} style={{
            textAlign: 'left', padding: 12, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
            background: 'var(--portal-bg-card)', border: `1.5px solid ${f.status.includes(s) ? COR_STATUS[s].fg : 'var(--portal-border)'}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COR_STATUS[s].fg }}>{ROTULO_STATUS[s]}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--portal-text)' }}>{totais.porStatus[s].itens}</div>
            <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{totais.porStatus[s].unidades} unidade{totais.porStatus[s].unidades === 1 ? '' : 's'}</div>
          </button>
        ))}
        <div style={{ padding: 12, borderRadius: 12, background: '#ECFDF5', border: '1.5px solid #A7F3D0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#065F46' }}>Valor sugerido</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#065F46' }}>{fmtPreco(totais.valorSugerido)}</div>
          <div style={{ fontSize: 11.5, color: '#047857' }}>precificados + à venda</div>
        </div>
      </div>

      {/* Filtros */}
      {isMobile && (
        <button onClick={() => setVerFiltros((v) => !v)} style={{ ...botao(temFiltro ? LARANJA : '#52525B', { contorno: true }), width: '100%', marginBottom: 10 }}>
          <SlidersHorizontal size={15} /> {verFiltros ? 'Esconder filtros' : 'Filtros'}{temFiltro ? ` (${filtrosTxt.length} ativo${filtrosTxt.length > 1 ? 's' : ''})` : ''}
        </button>
      )}
      {(!isMobile || verFiltros) && <div style={{ padding: 14, borderRadius: 12, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={f.texto} onChange={(e) => setF((x) => ({ ...x, texto: e.target.value }))} placeholder="Buscar código ou descrição" style={{ ...INP, fontSize: 14, flex: 2, minWidth: 200 }} />
          <select value={f.tipo} onChange={(e) => setF((x) => ({ ...x, tipo: e.target.value }))} style={{ ...INP, fontSize: 14, flex: 1, minWidth: 150 }}>
            <option value="">Tipo de máquina: todos</option>
            {base.tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select value={f.marca} onChange={(e) => setF((x) => ({ ...x, marca: e.target.value }))} style={{ ...INP, fontSize: 14, flex: 1, minWidth: 140 }} title="Inclui peças que servem em qualquer marca">
            <option value="">Marca: todas</option>
            {base.marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <select value={f.local} onChange={(e) => setF((x) => ({ ...x, local: e.target.value }))} style={{ ...INP, fontSize: 14, flex: 1, minWidth: 150 }}>
            <option value="">Local: todos</option>
            {base.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>Preço de</span>
          <CampoPreco valor={f.precoMin} onChange={(v) => setF((x) => ({ ...x, precoMin: v }))} estilo={{ width: 140 }} />
          <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>até</span>
          <CampoPreco valor={f.precoMax} onChange={(v) => setF((x) => ({ ...x, precoMax: v }))} estilo={{ width: 140 }} />
          <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', marginLeft: 6 }}>Cadastrado de</span>
          <input type="date" value={f.dataDe} onChange={(e) => setF((x) => ({ ...x, dataDe: e.target.value }))} style={{ ...INP, fontSize: 14, width: 150 }} />
          <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>até</span>
          <input type="date" value={f.dataAte} onChange={(e) => setF((x) => ({ ...x, dataAte: e.target.value }))} style={{ ...INP, fontSize: 14, width: 150 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text-secondary)', marginLeft: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.soEtiquetaPendente} onChange={(e) => setF((x) => ({ ...x, soEtiquetaPendente: e.target.checked }))} /> Só etiqueta pendente
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={f.soIncompletos} onChange={(e) => setF((x) => ({ ...x, soIncompletos: e.target.checked }))} /> Só cadastro incompleto
          </label>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', marginRight: 2 }}>Qualidade:</span>
          {QUALIDADES.map((q) => <button key={q} onClick={() => setF((x) => ({ ...x, qualidade: toggleLista(x.qualidade, q) }))} style={chip(f.qualidade.includes(q), '#52525B')}>{ROTULO_QUALIDADE[q]}</button>)}
          <div style={{ flex: 1 }} />
          {temFiltro && <button onClick={() => setF(FILTROS_VAZIOS)} style={botao('#52525B', { contorno: true })}><X size={14} /> Limpar filtros</button>}
        </div>
      </div>}

      {/* Barra de ações */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>
          {filtrados.length} ite{filtrados.length === 1 ? 'm' : 'ns'} · {totais.unidades} un.{selecionados.length > 0 && <> · <span style={{ color: LARANJA }}>{selecionados.length} selecionado{selecionados.length > 1 ? 's' : ''}</span></>}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={exportarCsv} disabled={!filtrados.length} style={botao('#065F46', { contorno: true, desab: !filtrados.length })}><Download size={14} /> CSV</button>
        <button onClick={exportarPdf} disabled={!filtrados.length || ocupado === 'pdf'} style={botao('#991B1B', { contorno: true, desab: !filtrados.length || ocupado === 'pdf' })}>
          {ocupado === 'pdf' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={14} />} PDF catálogo
        </button>
        <button onClick={() => imprimirLote(selecionados.length ? selComCodigo : pendentesEtiqueta)} disabled={selecionados.length ? !selComCodigo.length : !pendentesEtiqueta.length}
          title={selecionados.length ? 'Etiquetas dos selecionados que já têm código (do Destino em diante)' : 'Etiquetas pendentes da lista'}
          style={botao('#111827', { desab: selecionados.length ? !selComCodigo.length : !pendentesEtiqueta.length })}><Printer size={14} /> {selecionados.length ? `Etiquetas (${selComCodigo.length})` : `Etiquetas pendentes (${pendentesEtiqueta.length})`}</button>
        {base.podeGerir && <button onClick={() => setCadastros(true)} style={botao('#52525B', { contorno: true })}><Settings2 size={14} /> Tipos e marcas</button>}
      </div>

      {base.podeGerir && selecionados.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12, borderRadius: 12, background: '#FFF7ED', border: '1px solid #FED7AA', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#9A3412' }}>Mudar status dos {selecionados.length} selecionados para</span>
          <select value={lote.para} onChange={(e) => setLote((l) => ({ ...l, para: e.target.value as Status | '' }))} style={{ ...INP, fontSize: 14, width: 'auto' }}>
            <option value="">escolha…</option>
            {destinosLote.map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
          </select>
          {lote.para && ['descartado', 'guardado', 'usado', 'outro_destino'].includes(lote.para) && (
            <input value={lote.motivo} onChange={(e) => setLote((l) => ({ ...l, motivo: e.target.value }))}
              placeholder={exigeMotivo(lote.para) ? 'O que aconteceu (obrigatório)' : 'Detalhe (opcional)'} style={{ ...INP, fontSize: 14, width: 260 }} />
          )}
          <button onClick={aplicarLote} disabled={!lote.para || ocupado === 'lote'} style={botao(LARANJA, { desab: !lote.para || ocupado === 'lote' })}>
            {ocupado === 'lote' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />} Aplicar
          </button>
          <button onClick={() => setSel(new Set())} style={botao('#52525B', { contorno: true })}>Limpar seleção</button>
        </div>
      )}

      {erro && <Aviso acao={<button onClick={carregar} style={botao('#DC2626')}><RotateCcw size={14} /> Tentar de novo</button>}>{erro}</Aviso>}
      {aviso && <Aviso>{aviso}</Aviso>}
      {resultadoLote && (
        <Aviso tipo={resultadoLote.erros.length ? 'info' : 'ok'} acao={<button onClick={() => setResultadoLote(null)} style={botao('#52525B', { contorno: true })}>OK</button>}>
          {resultadoLote.alterados.length} alterado{resultadoLote.alterados.length === 1 ? '' : 's'}.
          {resultadoLote.erros.length > 0 && <>{' '}{resultadoLote.erros.length} não mudaram (continuam selecionados):{'\n'}{resultadoLote.erros.map((e) => `• ${e.erro}`).join('\n')}</>}
        </Aviso>
      )}

      {/* Tabela */}
      {!itens && !erro && <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>}
      {itens && isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtrados.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--portal-text-muted)', borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)' }}>{itens.length ? 'Nenhum item com esses filtros.' : 'Nenhum item cadastrado ainda. Toque em “Novo item”.'}</div>}
          {filtrados.map((i) => (
            <div key={i.id} onClick={() => setAberto(i)} style={{ display: 'flex', gap: 10, padding: 10, borderRadius: 12, cursor: 'pointer', background: sel.has(i.id) ? '#FFF7ED' : 'var(--portal-bg-card)', border: `1px solid ${sel.has(i.id) ? '#FED7AA' : 'var(--portal-border)'}` }}>
              <Miniatura url={i.fotos[0] ? minis[i.fotos[0].storage_path] : undefined} tamanho={68} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <CodigoPeca codigo={i.codigo} tamanho={14.5} />
                  <SeloStatus status={i.status} />
                </div>
                <div style={{ fontSize: 13, color: i.descricao ? 'var(--portal-text-secondary)' : 'var(--portal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>{i.descricao || 'Sem descrição'}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4, fontSize: 12, color: 'var(--portal-text-muted)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--portal-text-secondary)' }}>{i.quantidade} un.</span>
                  {i.preco_sugerido != null && <span style={{ fontWeight: 700, color: '#065F46' }}>{fmtPreco(i.preco_sugerido)}</span>}
                  {i.local_id && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={11} /> {textoLocal(i, base.nomesLocais)}</span>}
                  {codigoDefinitivo(i.codigo) && <SeloEtiqueta em={i.etiqueta_impressa_em} />}
                </div>
                <AvisoIncompleto item={i} />
              </div>
              <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
                <input type="checkbox" checked={sel.has(i.id)} onChange={() => alternar(i.id)} aria-label={`Selecionar ${nomeDoItem(i.codigo)}`} style={{ width: 22, height: 22 }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {itens && !isMobile && (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--portal-text)' }}>
            <thead>
              <tr style={{ background: 'var(--portal-bg-secondary)', textAlign: 'left' }}>
                <th style={{ padding: 10, width: 32 }}><input type="checkbox" checked={todosMarcados} onChange={alternarTodos} aria-label="Selecionar todos" /></th>
                <th style={{ padding: 10 }}>Foto</th>
                <th style={{ padding: 10 }}>Código</th>
                <th style={{ padding: 10 }}>Descrição</th>
                <th style={{ padding: 10 }}>Aplicação</th>
                <th style={{ padding: 10 }}>Qualidade</th>
                <th style={{ padding: 10, textAlign: 'right' }}>Qtd</th>
                <th style={{ padding: 10, textAlign: 'right' }}>Preço</th>
                <th style={{ padding: 10 }}>Local</th>
                <th style={{ padding: 10 }}>Status</th>
                <th style={{ padding: 10 }}>Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && <tr><td colSpan={11} style={{ padding: 30, textAlign: 'center', color: 'var(--portal-text-muted)' }}>{itens.length ? 'Nenhum item com esses filtros.' : 'Nenhum item cadastrado ainda. Use “Novo item” no celular.'}</td></tr>}
              {filtrados.map((i) => (
                <tr key={i.id} onClick={() => setAberto(i)} style={{ borderTop: '1px solid var(--portal-border)', cursor: 'pointer', background: sel.has(i.id) ? '#FFF7ED' : undefined }}>
                  <td style={{ padding: 10 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(i.id)} onChange={() => alternar(i.id)} aria-label={`Selecionar ${nomeDoItem(i.codigo)}`} /></td>
                  <td style={{ padding: '6px 10px' }}><Miniatura url={i.fotos[0] ? minis[i.fotos[0].storage_path] : undefined} tamanho={44} /></td>
                  <td style={{ padding: 10, whiteSpace: 'nowrap' }}>
                    <CodigoPeca codigo={i.codigo} />
                    {codigoDefinitivo(i.codigo) && <div style={{ marginTop: 3 }}><SeloEtiqueta em={i.etiqueta_impressa_em} /></div>}
                  </td>
                  <td style={{ padding: 10, maxWidth: 260 }}>{i.descricao || <span style={{ color: 'var(--portal-text-muted)' }}>Sem descrição</span>}{i.codigo_fabricante && <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>Fab.: {i.codigo_fabricante}</div>}<AvisoIncompleto item={i} /></td>
                  <td style={{ padding: 10, maxWidth: 220, fontSize: 12 }}>{textoAplicacoes(i, nomes) || '—'}</td>
                  <td style={{ padding: 10 }}><SeloQualidade qualidade={i.qualidade} /></td>
                  <td style={{ padding: 10, textAlign: 'right', fontWeight: 700 }}>{i.quantidade}</td>
                  <td style={{ padding: 10, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtPreco(i.preco_sugerido)}</td>
                  <td style={{ padding: 10, fontSize: 12, maxWidth: 160 }}>{textoLocal(i, base.nomesLocais) || '—'}</td>
                  <td style={{ padding: 10 }}><SeloStatus status={i.status} /></td>
                  <td style={{ padding: 10, fontSize: 12, whiteSpace: 'nowrap', color: 'var(--portal-text-secondary)' }}>{fmtData(i.criado_em)}<div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>{usuarios[i.criado_por] || ''}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberto && (
        <Janela titulo={`${nomeDoItem(aberto.codigo)} · ${ROTULO_STATUS[aberto.status]}`} onFechar={() => setAberto(null)} largura={1080}>
          <DetalheItem key={aberto.id} item={aberto} base={base} onMudou={(novo) => { carregar(); if (!novo) setAberto(null) }} />
        </Janela>
      )}
      {cadastros && <Cadastros base={base} onFechar={() => setCadastros(false)} />}
      {imprimindo && <Impressao itens={imprimindo} onFechar={() => setImprimindo(null)} onImpresso={carregar} />}
    </div>
  )
}

function AvisoIncompleto({ item }: { item: Item }) {
  const falta = camposFaltando(item)
  if (!falta.length) return null
  return (
    <div title={`Falta: ${falta.join(', ')}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#B45309', marginTop: 3 }}>
      <AlertTriangle size={12} /> Falta: {falta.join(', ')}
    </div>
  )
}

/** Tipos de máquina e marcas — o setor de peças inclui, renomeia e desativa. */
function Cadastros({ base, onFechar }: { base: Base; onFechar: () => void }) {
  const [aba, setAba] = useState<'tipos' | 'marcas'>('tipos')
  const [novo, setNovo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const lista: Lookup[] = aba === 'tipos' ? base.tipos : base.marcas
  const salvar = aba === 'tipos' ? salvarTipo : salvarMarca

  const executar = async (fn: () => Promise<unknown>) => {
    setOcupado(true); setErro(null)
    try { await fn(); base.recarregarLookups(); return true } catch (e) { setErro(mensagemErro(e)); return false } finally { setOcupado(false) }
  }

  return (
    <Janela titulo="Tipos de máquina e marcas" onFechar={onFechar}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button onClick={() => setAba('tipos')} style={botao(LARANJA, { contorno: aba !== 'tipos' })}>Tipos de máquina</button>
        <button onClick={() => setAba('marcas')} style={botao(LARANJA, { contorno: aba !== 'marcas' })}>Marcas</button>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder={aba === 'tipos' ? 'Novo tipo (ex.: Grade aradora)' : 'Nova marca'} style={{ ...INP, fontSize: 14 }} />
        <button disabled={!novo.trim() || ocupado} onClick={async () => { if (await executar(() => salvar(null, novo))) setNovo('') }} style={botao(LARANJA, { desab: !novo.trim() || ocupado })}>Incluir</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {lista.map((l) => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid var(--portal-border)', opacity: l.ativo ? 1 : 0.5 }}>
            <span style={{ flex: 1, fontSize: 14, color: 'var(--portal-text)' }}>{l.nome}</span>
            <button disabled={ocupado} onClick={() => { const n = prompt('Novo nome', l.nome); if (n && n.trim() && n.trim() !== l.nome) executar(() => salvar(l.id, n, l.ativo)) }} style={botao('#52525B', { contorno: true })}>Renomear</button>
            <button disabled={ocupado} onClick={() => executar(() => salvar(l.id, l.nome, !l.ativo))} style={botao(l.ativo ? '#DC2626' : '#059669', { contorno: true })}>{l.ativo ? 'Desativar' : 'Reativar'}</button>
          </div>
        ))}
      </div>
    </Janela>
  )
}
