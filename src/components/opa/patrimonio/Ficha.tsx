'use client'
// Patrimônio Loja — ficha de um item: fotos (pôr/tirar), dados, "Mudar de
// lugar" rápido (local, com quem, situação e motivo), histórico de por onde
// passou, editar tudo e excluir.

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowRightLeft, History, Loader2, MapPin, Pencil, Printer, Split, Trash2, Truck, UserRound, X } from 'lucide-react'
import { comprimir, enviarFoto, urlsAssinadas } from '@/lib/opa-pecas/fotos'
import { BUCKET_PATRIMONIO } from '@/lib/patrimonio/fotos-regra'
import { formDoItem, lugaresDoItem, qtdPrincipal, ROTULO_SITUACAO, SITUACOES, textoOnde, type ItemPat, type Movimentacao, type Situacao } from '@/lib/patrimonio/tipos'
import { SeletorLocal } from '../pecas/Campos'
import { Aviso, botao, INP, ROTULO, SECAO, TITULO_SECAO, useTelaLarga } from '../pecas/comum'
import { Visualizador } from '../pecas/DetalheItem'
import { api, COR_PAT, fmtData, fmtReal, SeloEstado, type BasePat } from './comum'
import Formulario from './Formulario'
import EtiquetasPat from './Etiquetas'
import Galeria from '../Galeria'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'

export default function Ficha({ base, id }: { base: BasePat; id: string }) {
  const router = useRouter()
  const larga = useTelaLarga()
  // transferir para as Peças S/Estoque: precisa das duas abas (José, 22/10/2026)
  const { userProfile } = useAuth()
  const { pode: podePerm } = usePermissoes(userProfile?.id)
  const podeTransferir = podePerm('opa-pecas')
  const [item, setItem] = useState<ItemPat | null>(null)
  const [movs, setMovs] = useState<Movimentacao[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [visor, setVisor] = useState<number | null>(null)
  const [editando, setEditando] = useState(false)
  const [movendo, setMovendo] = useState(false)
  // "Separar unidades": de qual lugar saem ('principal' ou id da parte)
  const [separando, setSeparando] = useState<string | null>(null)
  // logo depois de cadastrar a página abre com ?etiqueta=1 → janela da etiqueta já aberta
  const [etiqueta, setEtiqueta] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('etiqueta') === '1')
  const [ocupado, setOcupado] = useState(false)
  const fotoRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(() => {
    api<{ item: ItemPat; movimentacoes: Movimentacao[] }>(`/api/patrimonio/${encodeURIComponent(id)}`)
      .then((r) => { setItem(r.item); setMovs(r.movimentacoes); setErro(null) })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!item?.fotos.length) return
    let vivo = true
    urlsAssinadas(item.fotos.map((f) => f.storage_path), BUCKET_PATRIMONIO).then((r) => { if (vivo) setUrls(r) }).catch(() => null)
    return () => { vivo = false }
  }, [item])

  const executar = async (fn: () => Promise<unknown>) => {
    setOcupado(true)
    setErro(null)
    try { await fn(); carregar(); base.recarregar() } catch (e) { setErro(e instanceof Error ? e.message : String(e)) } finally { setOcupado(false) }
  }

  const porFotos = (lista: FileList | null) => executar(async () => {
    const paths: string[] = []
    for (const a of Array.from(lista || []).slice(0, 8)) paths.push(await enviarFoto(base.userId!, await comprimir(a), BUCKET_PATRIMONIO))
    if (paths.length) await api(`/api/patrimonio/${item!.id}/fotos`, { method: 'POST', body: { paths } })
  })
  const tirarFoto = (fotoId: string) => { if (confirm('Tirar esta foto?')) executar(() => api(`/api/patrimonio/${item!.id}/fotos?foto=${fotoId}`, { method: 'DELETE' })) }
  const transferir = () => {
    if (!item || !confirm(`Transferir ${item.codigo} — ${item.descricao} para as Peças S/Estoque?\n\nEle entra na etapa de VERIFICAÇÃO com as mesmas fotos, quantidade e lugar, e aqui no Patrimônio fica "baixado".`)) return
    executar(async () => {
      const r = await api<{ codigo: string }>('/api/opa/transferir', { method: 'POST', body: { de: 'patrimonio', id: item.id } })
      router.push(`/opa/pecas/${encodeURIComponent(r.codigo)}`)
    })
  }
  const excluir = () => {
    if (!item || !confirm(`Excluir ${item.codigo} — ${item.descricao}? Ele sai da lista (o histórico fica guardado).`)) return
    executar(async () => { await api(`/api/patrimonio/${item.id}`, { method: 'DELETE' }); router.push('/opa/patrimonio') })
  }

  if (erro && !item) return <Aviso>{erro}</Aviso>
  if (!item) return <div style={{ ...SECAO, alignItems: 'center', color: 'var(--portal-text-muted)' }}>Carregando…</div>

  if (editando) {
    return (
      <Formulario base={base} item={item} inicial={formDoItem(item)} onCancelar={() => setEditando(false)}
        onSalvo={() => { setEditando(false); carregar(); base.recarregar() }} />
    )
  }

  // Mostra o campo SEMPRE (José, 19/11/2026: "por que não aparece valor, tags, observações, situação, com quem
  // está…") — vazio aparece como "não informado", para ficar claro o que falta preencher.
  const dado = (r: string, v: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>{r}</span>
      {v ? <span style={{ fontSize: 15, color: 'var(--portal-text)', overflowWrap: 'anywhere' }}>{v}</span>
        : <span style={{ fontSize: 14, color: 'var(--portal-text-muted)', fontStyle: 'italic' }}>não informado</span>}
    </div>
  )
  const grupo = (titulo: string, filhos: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 16, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)' }}>
      <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--portal-text)' }}>{titulo}</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>{filhos}</div>
    </div>
  )
  const qtd = item.quantidade || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section style={SECAO}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 900, color: COR_PAT }}>{item.codigo}</span>
          <SeloEstado estado={item.estado} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>{ROTULO_SITUACAO[item.situacao]}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setEtiqueta(true)} style={botao('#111827')}><Printer size={15} /> {item.etiqueta_impressa_em ? 'Reimprimir etiqueta' : 'Imprimir etiqueta'}</button>
            <button type="button" onClick={() => setMovendo(true)} style={botao(COR_PAT)}><Truck size={15} /> Mudar de lugar</button>
            <button type="button" onClick={() => setEditando(true)} style={botao('#52525B', { contorno: true })}><Pencil size={14} /> Editar</button>
            {podeTransferir && item.situacao !== 'baixado' && <button type="button" onClick={transferir} disabled={ocupado} title="Leva este item para as Peças S/Estoque (entra na verificação)" style={botao('#64748B', { contorno: true, desab: ocupado })}><ArrowRightLeft size={14} /> Transferir para as Peças</button>}
            <button type="button" onClick={excluir} disabled={ocupado} style={botao('#B91C1C', { contorno: true, desab: ocupado })}><Trash2 size={14} /> Excluir</button>
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-.01em', color: 'var(--portal-text)' }}>
          {item.descricao}
          {qtd > 1 && <span style={{ marginLeft: 8, fontSize: 15, color: 'var(--portal-text-secondary)' }}>× {qtd} unidades</span>}
        </div>
        {item.etiqueta_impressa_em && <div style={{ fontSize: 12.5, color: '#047857' }}>Etiqueta impressa em {fmtData(item.etiqueta_impressa_em)}</div>}

        {/* Foto grande logo de cara (José, 19/11/2026): setas / deslizar para trocar; clique = tela cheia */}
        <Galeria fotos={item.fotos.map((f) => ({ id: f.id, src: urls[f.storage_path] }))} larga={larga} onAmpliar={setVisor}
          acao={{ rotulo: 'Tirar foto', icone: <X size={13} />, onClick: tirarFoto }}
          onAdicionar={() => fotoRef.current?.click()} adicionando={ocupado} desabilitado={ocupado} />
        <input ref={fotoRef} type="file" accept="image/*" multiple hidden onChange={(e) => { porFotos(e.target.files); e.target.value = '' }} />
      </section>

      {/* As informações, sempre todas, em grupos */}
      <div style={{ display: 'grid', gridTemplateColumns: larga ? 'repeat(3, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 14 }}>
        {grupo('Onde e com quem', <>
          {dado('Situação', ROTULO_SITUACAO[item.situacao])}
          {dado('Estado', <SeloEstado estado={item.estado} />)}
          {dado(item.partes?.length ? `Lugar principal (${qtdPrincipal(item)} un.)` : 'Onde está', (item.local_id || item.local_tecnico) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {textoOnde(item.local_id, item.local_tecnico, base.nomeLocal)}</span>)}
          {dado('Com quem está', item.responsavel && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><UserRound size={13} /> {item.responsavel}</span>)}
        </>)}
        {grupo('Valor', <>
          {dado(qtd > 1 ? 'Valor hoje (cada)' : 'Valor hoje', item.valor_atual != null && fmtReal(item.valor_atual))}
          {dado('Valor pago', item.valor_compra != null && fmtReal(item.valor_compra))}
          {qtd > 1 && dado('Valor total', (item.valor_atual ?? item.valor_compra) != null && fmtReal((item.valor_atual ?? item.valor_compra)! * qtd))}
          {dado('Comprado em', item.data_compra && fmtData(item.data_compra))}
          {dado('Fornecedor', item.fornecedor)}
          {dado('Nota fiscal', item.nota_fiscal)}
          {dado('Garantia até', item.garantia_ate && fmtData(item.garantia_ate))}
        </>)}
        {grupo('Sobre o item', <>
          {dado('Categoria', item.categoria)}
          {dado('Marca', item.marca)}
          {dado('Modelo', item.modelo)}
          {dado('Nº de série', item.numero_serie)}
          {dado('Quantidade', String(qtd))}
          {dado('Cadastrado em', fmtData(item.criado_em))}
        </>)}
      </div>

      {/* Um item, vários lugares (José, 19/11/2026): onde está cada parte das unidades */}
      {qtd > 1 && (
        <section style={SECAO}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ ...TITULO_SECAO, display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}><Split size={16} /> Onde estão as {qtd} unidades</h2>
            <button type="button" onClick={() => setSeparando('principal')} disabled={qtdPrincipal(item) < 1}
              style={{ ...botao(COR_PAT, { desab: qtdPrincipal(item) < 1 }), marginLeft: 'auto' }}><Split size={14} /> Separar unidades</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lugaresDoItem(item).map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)' }}>
                <span style={{ minWidth: 48, fontSize: 20, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--portal-text)' }}>{l.quantidade}</span>
                <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14.5, color: 'var(--portal-text)' }}><MapPin size={13} /> {textoOnde(l.local_id, l.local_tecnico, base.nomeLocal)}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
                    {ROTULO_SITUACAO[l.situacao]}{l.responsavel ? ` · com ${l.responsavel}` : ''}{l.id === 'principal' && item.partes?.length ? ' · lugar principal' : ''}
                  </span>
                </div>
                <button type="button" onClick={() => setSeparando(l.id)} style={botao('#52525B', { contorno: true })}><Truck size={14} /> Mover daqui</button>
              </div>
            ))}
          </div>
          {!item.partes?.length && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>Todas no mesmo lugar. Para deixar algumas em outro lugar, use “Separar unidades”.</div>}
        </section>
      )}
      {separando && <SepararUnidades base={base} item={item} de={separando} onFechar={() => setSeparando(null)}
        onSalvo={() => { setSeparando(null); carregar(); base.recarregar() }} />}

      <section style={SECAO}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>Tags</span>
          {item.tags.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {item.tags.map((t) => <span key={t} style={{ fontSize: 13, color: '#334155', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 999, padding: '2px 10px' }}>#{t}</span>)}
            </div>
          ) : <span style={{ fontSize: 14, color: 'var(--portal-text-muted)', fontStyle: 'italic' }}>nenhuma tag</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>Observações</span>
          {item.observacoes ? <div style={{ fontSize: 14.5, color: 'var(--portal-text)', whiteSpace: 'pre-wrap' }}>{item.observacoes}</div>
            : <span style={{ fontSize: 14, color: 'var(--portal-text-muted)', fontStyle: 'italic' }}>nenhuma observação</span>}
        </div>
        <button type="button" onClick={() => setEditando(true)} style={{ ...botao('#52525B', { contorno: true }), alignSelf: 'flex-start' }}><Pencil size={14} /> Preencher o que falta</button>
      </section>

      {erro && <Aviso>{erro}</Aviso>}

      {movendo && <MudarLugar base={base} item={item} onFechar={() => setMovendo(false)} onSalvo={() => { setMovendo(false); carregar(); base.recarregar() }} />}

      <section style={SECAO}>
        <h2 style={{ ...TITULO_SECAO, display: 'flex', alignItems: 'center', gap: 6 }}><History size={16} /> Por onde passou</h2>
        {movs.length === 0 ? <div style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>Sem registros.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {movs.map((m) => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--portal-text)' }}>
                  {m.de_local_id || m.de_responsavel ? (
                    <>
                      <span>{textoOnde(m.de_local_id, m.de_local_tecnico, base.nomeLocal)}{m.de_responsavel ? ` (${m.de_responsavel})` : ''}</span>
                      <ArrowRight size={14} style={{ color: 'var(--portal-text-muted)' }} />
                    </>
                  ) : <span style={{ fontWeight: 700 }}>Cadastrado em</span>}
                  {m.quantidade != null && <span style={{ order: -1, fontSize: 12.5, color: '#334155', background: '#F1F5F9', borderRadius: 999, padding: '1px 8px' }}>{m.quantidade} un.</span>}
                  <b>{textoOnde(m.para_local_id, m.para_local_tecnico, base.nomeLocal)}{m.para_responsavel ? ` (${m.para_responsavel})` : ''}</b>
                  {m.situacao && <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>· {ROTULO_SITUACAO[m.situacao as Situacao] || m.situacao}</span>}
                </div>
                {m.motivo && m.motivo !== 'Cadastro' && <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>{m.motivo}</div>}
                <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{m.por_nome || '—'} · {fmtData(m.em)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {etiqueta && <EtiquetasPat itens={[item]} nomeLocal={base.nomeLocal} onFechar={() => setEtiqueta(false)} onImpresso={carregar} />}
      {visor != null && <Visualizador fotos={item.fotos.map((f) => urls[f.storage_path]).filter(Boolean)} inicio={visor} onFechar={() => setVisor(null)} />}
    </div>
  )
}

/** Um item, vários lugares: leva N unidades de um lugar (principal ou parte) para outro. Se o destino já
 *  tem unidades do item (mesmo lugar, mesma pessoa, mesma situação), elas se juntam lá. */
function SepararUnidades({ base, item, de, onFechar, onSalvo }: { base: BasePat; item: ItemPat; de: string; onFechar: () => void; onSalvo: () => void }) {
  const lugares = lugaresDoItem(item)
  const [origem, setOrigem] = useState(lugares.some((l) => l.id === de) ? de : lugares[0]?.id || 'principal')
  const daOrigem = lugares.find((l) => l.id === origem)
  const max = daOrigem?.quantidade || 0
  const [qtd, setQtd] = useState('1')
  const [local, setLocal] = useState('')
  const [tecnico, setTecnico] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [situacao, setSituacao] = useState<Situacao>(daOrigem?.situacao === 'baixado' ? 'em_uso' : daOrigem?.situacao || 'em_uso')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const n = Math.floor(Number(qtd.replace(',', '.')))

  const salvar = async () => {
    if (!Number.isFinite(n) || n < 1 || n > max) { setErro(`Quantas? De 1 a ${max}.`); return }
    if (!local) { setErro('Escolha para onde vão.'); return }
    setSalvando(true)
    setErro(null)
    try {
      await api(`/api/patrimonio/${item.id}/unidades`, { method: 'POST', body: { de: origem, quantidade: n, para: { local_id: local, local_tecnico: tecnico, responsavel, situacao }, motivo } })
      onSalvo()
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) } finally { setSalvando(false) }
  }

  return (
    <section style={{ ...SECAO, border: `1.5px solid ${COR_PAT}` }}>
      <h2 style={{ ...TITULO_SECAO, display: 'flex', alignItems: 'center', gap: 6 }}><Split size={16} /> Separar unidades</h2>
      <div>
        <label style={ROTULO}>De onde saem</label>
        <select value={origem} onChange={(e) => setOrigem(e.target.value)} style={INP}>
          {lugares.map((l) => <option key={l.id} value={l.id}>{l.quantidade} un. · {textoOnde(l.local_id, l.local_tecnico, base.nomeLocal)}{l.responsavel ? ` · com ${l.responsavel}` : ''}</option>)}
        </select>
      </div>
      <div>
        <label style={ROTULO}>Quantas (de {max})</label>
        <input value={qtd} onChange={(e) => setQtd(e.target.value.replace(/[^\d]/g, '').slice(0, 6))} inputMode="numeric" style={{ ...INP, maxWidth: 140 }} />
      </div>
      <div>
        <label style={ROTULO}>Para onde vão</label>
        <SeletorLocal locais={base.locais} local={local} tecnico={tecnico} onChange={(l, t) => { setLocal(l); setTecnico(t) }} onLocalCriado={base.recarregar} />
      </div>
      <div>
        <label style={ROTULO}>Com quem ficam</label>
        <input value={responsavel} onChange={(e) => setResponsavel(e.target.value.slice(0, 120))} placeholder="Pessoa responsável (opcional)" style={INP} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SITUACOES.map((s) => (
          <button key={s} type="button" aria-pressed={situacao === s} onClick={() => setSituacao(s)} style={{
            padding: '7px 12px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
            border: '1.5px solid ' + (situacao === s ? COR_PAT : 'var(--portal-border)'), background: situacao === s ? COR_PAT : 'var(--portal-bg-card)', color: situacao === s ? '#fefefe' : 'var(--portal-text)',
          }}>{ROTULO_SITUACAO[s]}</button>
        ))}
      </div>
      <div>
        <label style={ROTULO}>Por quê?</label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 500))} placeholder="Ex.: 5 cadeiras foram para o setor de Peças (opcional)" style={INP} />
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={salvar} disabled={salvando} style={botao(COR_PAT, { desab: salvando })}>{salvando ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Split size={15} />} Separar {Number.isFinite(n) && n > 0 ? n : ''} unidade{n === 1 ? '' : 's'}</button>
        <button type="button" onClick={onFechar} style={botao('#52525B', { contorno: true })}>Cancelar</button>
      </div>
    </section>
  )
}

/** Atalho do dia a dia: só lugar, com quem, situação e por quê. */
function MudarLugar({ base, item, onFechar, onSalvo }: { base: BasePat; item: ItemPat; onFechar: () => void; onSalvo: () => void }) {
  const [local, setLocal] = useState(item.local_id || '')
  const [tecnico, setTecnico] = useState(item.local_tecnico || '')
  const [responsavel, setResponsavel] = useState(item.responsavel || '')
  const [situacao, setSituacao] = useState<Situacao>(item.situacao)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async () => {
    if (!local) { setErro('Escolha onde está agora.'); return }
    setSalvando(true)
    setErro(null)
    try {
      await api(`/api/patrimonio/${item.id}`, { method: 'PATCH', body: { form: { ...formDoItem(item), local_id: local, local_tecnico: tecnico, responsavel, situacao }, motivo } })
      onSalvo()
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) } finally { setSalvando(false) }
  }

  return (
    <section style={{ ...SECAO, border: `1.5px solid ${COR_PAT}` }}>
      <h2 style={{ ...TITULO_SECAO, display: 'flex', alignItems: 'center', gap: 6 }}><Truck size={16} /> Mudar de lugar</h2>
      <SeletorLocal locais={base.locais} local={local} tecnico={tecnico} onChange={(l, t) => { setLocal(l); setTecnico(t) }} onLocalCriado={base.recarregar} />
      <div>
        <label style={ROTULO}>Com quem fica</label>
        <input value={responsavel} onChange={(e) => setResponsavel(e.target.value.slice(0, 120))} placeholder="Pessoa responsável (opcional)" style={INP} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SITUACOES.map((s) => (
          <button key={s} type="button" aria-pressed={situacao === s} onClick={() => setSituacao(s)} style={{
            padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            border: '1.5px solid ' + (situacao === s ? COR_PAT : 'var(--portal-border)'), background: situacao === s ? COR_PAT : 'var(--portal-bg-card)', color: situacao === s ? '#fff' : 'var(--portal-text)',
          }}>{ROTULO_SITUACAO[s]}</button>
        ))}
      </div>
      <div>
        <label style={ROTULO}>Por quê?</label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 500))} placeholder="Ex.: emprestado pro Gabriel usar na OS 812 (opcional)" style={INP} />
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={salvar} disabled={salvando} style={botao(COR_PAT, { desab: salvando })}>{salvando ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Truck size={15} />} Registrar mudança</button>
        <button type="button" onClick={onFechar} style={botao('#52525B', { contorno: true })}>Cancelar</button>
      </div>
    </section>
  )
}
