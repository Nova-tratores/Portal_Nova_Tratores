'use client'
// Visão do portal (desktop) das Peças Não Identificadas: lista direto ao abrir,
// filtros, tabela com seleção múltipla (status e etiquetas em lote) e
// exportação CSV/PDF da MESMA lista filtrada da tela.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileText, Loader2, Package, Printer, RotateCcw, Settings2, SlidersHorizontal, X } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { gerarCsv, baixarCsv } from '@/lib/opa-pecas/csv'
import { listarItens, mudarStatusLote, nomesUsuarios, salvarMarca, salvarTipo, type ResultadoLote } from '@/lib/opa-pecas/db'
import { mensagemErro } from '@/lib/opa-pecas/fotos'
import { gerarPdfCatalogo } from '@/lib/opa-pecas/pdf'
import { skuDaPeca, calcularTotais, codigoDefinitivo, nomeDoItem, ehFinal, exigeMotivo, FILTROS_VAZIOS, filtrarItens, resumoFiltros, textoLocal, transicaoValida, type Filtros } from '@/lib/opa-pecas/regras'
import { QUALIDADES, ROTULO_QUALIDADE, ROTULO_STATUS, STATUS, type Item, type Lookup, type Qualidade, type Status } from '@/lib/opa-pecas/tipos'
import { Aviso, botao, INP, LARANJA, useMiniaturas, type Base } from './comum'
import { CampoPreco } from './Campos'
import { CardPeca, useColunasPecas } from './ListaPecas'
import TabelaFiltravel, { SeletorVisao, useListaFiltrada, useModoVisao } from './TabelaFiltravel'
import { useProdutosSku } from './useProdutosSku'
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

  // Cards: filtros do painel. Lista: só a busca rápida aqui; o resto é no cabeçalho de cada coluna.
  const [modoSalvo, setModo] = useModoVisao('opa-pecas-visao')
  const modo = modoSalvo ?? (isMobile ? 'cards' : 'lista')
  const emLista = modo === 'lista'
  const fPainel = useMemo(() => (emLista ? { ...FILTROS_VAZIOS, texto: f.texto } : f), [emLista, f])
  const preFiltrados = useMemo(() => filtrarItens(itens || [], fPainel), [itens, fPainel])
  const skus = useProdutosSku(useMemo(() => (itens || []).map(skuDaPeca), [itens]))
  const nomes = useMemo(() => ({ tipos: base.nomesTipos, marcas: base.nomesMarcas, usuarios, locais: base.nomesLocais }), [base.nomesTipos, base.nomesMarcas, usuarios, base.nomesLocais])
  const minis = useMiniaturas(useMemo(() => (itens || []).slice(0, 400).map((i) => i.fotos[0]?.storage_path).filter(Boolean) as string[], [itens]))
  const colunas = useColunasPecas({ nomes, skus, minis, usuarios })
  const lista = useListaFiltrada('opa-pecas-lista', preFiltrados, colunas)
  const filtrados = emLista ? lista.visiveis : preFiltrados
  const totais = useMemo(() => calcularTotais(filtrados), [filtrados])
  const selecionados = filtrados.filter((i) => sel.has(i.id))
  const filtrosTxt = resumoFiltros(fPainel, nomes)
  const temFiltro = filtrosTxt.length > 0

  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const todosMarcados = filtrados.length > 0 && filtrados.every((i) => sel.has(i.id))
  const alternarTodos = () => setSel(todosMarcados ? new Set() : new Set(filtrados.map((i) => i.id)))

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
  // etiqueta só existe para peça com código definitivo (concluída); imprime as marcadas
  const selComCodigo = selecionados.filter((i) => codigoDefinitivo(i.codigo))

  const exportarCsv = () => baixarCsv(`pecas-nao-identificadas-${new Date().toISOString().slice(0, 10)}.csv`, gerarCsv(filtrados, nomes))

  const exportarPdf = async () => {
    setOcupado('pdf'); setAviso(null)
    try {
      await gerarPdfCatalogo({ itens: filtrados, nomes, filtros: filtrosTxt, comStatus: fPainel.status.length !== 1 })
    } catch (e) {
      setAviso(`Não foi possível gerar o PDF: ${mensagemErro(e)}`)
    } finally {
      setOcupado(null)
    }
  }

  // Status que todos os selecionados aceitam (para o seletor do lote)
  // em lote só se encerra (separação e verificação têm etapa própria)
  const destinosLote = STATUS.filter((s) => ehFinal(s) && selecionados.some((i) => transicaoValida(i.status, s)))

  return (
    <div>
      {/* Busca rápida + filtros (escondidos até pedir) — a lista aparece direto ao abrir */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={f.texto} onChange={(e) => setF((x) => ({ ...x, texto: e.target.value }))} placeholder="Buscar código, SKU, descrição, locação ou etiqueta" style={{ ...INP, fontSize: 14, flex: 1, minWidth: 220 }} />
        <SeletorVisao modo={modo} onChange={setModo} cor={LARANJA} />
        {!emLista && <button onClick={() => setVerFiltros((v) => !v)} style={{ ...botao(temFiltro ? LARANJA : '#52525B', { contorno: true }), whiteSpace: 'nowrap' }}>
          <SlidersHorizontal size={15} /> {verFiltros ? 'Esconder filtros' : 'Filtros'}{temFiltro ? ` (${filtrosTxt.length} ativo${filtrosTxt.length > 1 ? 's' : ''})` : ''}
        </button>}
        {!emLista && temFiltro && !verFiltros && <button onClick={() => setF(FILTROS_VAZIOS)} style={botao('#52525B', { contorno: true })}><X size={14} /> Limpar</button>}
        {emLista && lista.ativos > 0 && <button onClick={lista.limpar} title="Tira os filtros das colunas (a ordem continua)" style={botao(LARANJA, { contorno: true })}><X size={14} /> Limpar filtros das colunas ({lista.ativos})</button>}
      </div>
      {!emLista && verFiltros && <div style={{ padding: 14, borderRadius: 12, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={f.status.length === 1 ? f.status[0] : ''} onChange={(e) => setF((x) => ({ ...x, status: e.target.value ? [e.target.value as Status] : [] }))} style={{ ...INP, fontSize: 14, flex: 1, minWidth: 150 }}>
            <option value="">Status: todos</option>
            {STATUS.map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
          </select>
          <select value={f.qualidade.length === 1 ? f.qualidade[0] : ''} onChange={(e) => setF((x) => ({ ...x, qualidade: e.target.value ? [e.target.value as Qualidade] : [] }))} style={{ ...INP, fontSize: 14, flex: 1, minWidth: 140 }}>
            <option value="">Qualidade: todas</option>
            {QUALIDADES.map((q) => <option key={q} value={q}>{ROTULO_QUALIDADE[q]}</option>)}
          </select>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={f.soIncompletos} onChange={(e) => setF((x) => ({ ...x, soIncompletos: e.target.checked }))} /> Só cadastro incompleto
          </label>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1 }} />
          {temFiltro && <button onClick={() => setF(FILTROS_VAZIOS)} style={botao('#52525B', { contorno: true })}><X size={14} /> Limpar filtros</button>}
        </div>
      </div>}

      {/* Barra: contagem à esquerda, ações discretas à direita */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>
          <b style={{ color: 'var(--portal-text)' }}>{filtrados.length}</b> {filtrados.length === 1 ? 'peça' : 'peças'} · {totais.unidades} un.
          {selecionados.length > 0 && <> · <b style={{ color: LARANJA }}>{selecionados.length} marcada{selecionados.length > 1 ? 's' : ''}</b></>}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => imprimirLote(selComCodigo)} disabled={!selComCodigo.length}
          title={selecionados.length ? 'Etiquetas das peças marcadas que já têm código (concluídas), juntas na mesma folha' : 'Marque as peças na lista para imprimir as etiquetas'}
          style={{ ...ACAO, ...(selComCodigo.length ? { background: '#111827', color: '#fefefe', borderColor: '#111827' } : { opacity: 0.45, cursor: 'not-allowed' }) }}>
          <Printer size={14} /> Etiquetas{selComCodigo.length ? ` (${selComCodigo.length})` : ''}
        </button>
        <div style={{ display: 'inline-flex', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', overflow: 'hidden' }}>
          <button onClick={exportarCsv} disabled={!filtrados.length} title="Exportar a lista filtrada em CSV" style={{ ...ACAO_GRUPO, opacity: filtrados.length ? 1 : 0.45 }}><Download size={14} /> CSV</button>
          <span style={{ width: 1, background: 'var(--portal-border)', margin: '7px 0' }} />
          <button onClick={exportarPdf} disabled={!filtrados.length || ocupado === 'pdf'} title="Catálogo em PDF da lista filtrada" style={{ ...ACAO_GRUPO, opacity: filtrados.length ? 1 : 0.45 }}>
            {ocupado === 'pdf' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={14} />} PDF
          </button>
          {base.podeGerir && (<>
            <span style={{ width: 1, background: 'var(--portal-border)', margin: '7px 0' }} />
            <button onClick={() => setCadastros(true)} title="Tipos de máquina e marcas" style={ACAO_GRUPO}><Settings2 size={14} /> Tipos e marcas</button>
          </>)}
        </div>
      </div>

      {base.podeGerir && selecionados.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: '#FFF7ED', border: '1px solid #FED7AA', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#9A3412' }}>Encerrar as {selecionados.length} marcadas como</span>
          <select value={lote.para} onChange={(e) => setLote((l) => ({ ...l, para: e.target.value as Status | '' }))} style={{ ...INP, fontSize: 13.5, padding: '8px 10px', width: 'auto' }}>
            <option value="">escolha…</option>
            {destinosLote.map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
          </select>
          {lote.para && ['descartado', 'guardado', 'usado', 'outro_destino'].includes(lote.para) && (
            <input value={lote.motivo} onChange={(e) => setLote((l) => ({ ...l, motivo: e.target.value }))}
              placeholder={exigeMotivo(lote.para) ? 'O que aconteceu (obrigatório)' : 'Detalhe (opcional)'} style={{ ...INP, fontSize: 13.5, padding: '8px 10px', width: 260, maxWidth: '100%' }} />
          )}
          <button onClick={aplicarLote} disabled={!lote.para || ocupado === 'lote'} style={botao(LARANJA, { desab: !lote.para || ocupado === 'lote' })}>
            {ocupado === 'lote' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />} Aplicar
          </button>
          <button onClick={() => setSel(new Set())} style={botao('#52525B', { contorno: true })}>Desmarcar</button>
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

      {/* Lista */}
      {!itens && !erro && <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>}
      {itens && !emLista && filtrados.length === 0 && (
        <div style={{ padding: '44px 20px', textAlign: 'center', color: 'var(--portal-text-muted)', borderRadius: 14, border: '1px dashed var(--portal-border)', background: 'var(--portal-bg-card)' }}>
          <Package size={28} style={{ opacity: 0.5, marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>{itens.length ? 'Nenhuma peça com esses filtros.' : 'Nenhuma peça cadastrada ainda.'}</div>
          {!itens.length && <div style={{ fontSize: 12.5, marginTop: 4 }}>Use “Novo produto” para captar a primeira.</div>}
        </div>
      )}
      {itens && !emLista && filtrados.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(auto-fill, minmax(360px, 1fr))', gap: 8 }}>
          {filtrados.map((i) => (
            <CardPeca key={i.id} item={i} nomes={nomes} skus={skus} mini={i.fotos[0] ? minis[i.fotos[0].storage_path] : undefined}
              marcado={sel.has(i.id)} onAbrir={() => setAberto(i)} onMarcar={() => alternar(i.id)} />
          ))}
        </div>
      )}
      {itens && emLista && (
        <TabelaFiltravel colunas={colunas} todas={preFiltrados} lista={lista} chaveLinha={(i) => i.id} onAbrir={setAberto} cor={LARANJA}
          linhaDestacada={(i) => sel.has(i.id)}
          antes={{
            cabecalho: <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} aria-label="Marcar todas" style={{ accentColor: LARANJA }} />,
            celula: (i) => <input type="checkbox" checked={sel.has(i.id)} onChange={() => alternar(i.id)} aria-label={`Marcar ${nomeDoItem(i.codigo)}`} style={{ accentColor: LARANJA }} />,
          }} />
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

const ACAO: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 13px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
const ACAO_GRUPO: React.CSSProperties = { ...ACAO, height: 34, border: 'none', borderRadius: 0, background: 'transparent' }

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
