'use client'
// Opa → Mapa: a planta da loja por andar com os territórios (os lugares do Opa).
// Ver: cor = departamento, gestor no nome, nº de Opas abertos; clique = os Opas do lugar.
// Admin: "Editar mapa" — põe/arrasta/redimensiona os lugares e desenha os blocos de cada andar.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Building2, Loader2, MapPin, Pencil, Plus, Square, Trash2, UserRound, X } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { OpaBarra, BTN_FAIXA } from '@/components/opa/pecas/comum'
import PlantaLoja, { type CamadaEdicao } from '@/components/opa/mapa/PlantaLoja'
import { useDadosMapa } from '@/components/opa/mapa/useDadosMapa'
import { andaresOrdenados, corDoDepartamento, COR_SEM_DEPARTAMENTO, idUnico, limitarRet, opasPorLocal, retanguloNovo, type Bloco, type Retangulo } from '@/lib/opa/mapa'
import { destinoDoLocal } from '@/lib/opa/departamentos'
import { agruparLocais, nomeLocalCompleto } from '@/lib/opa-pecas/regras'

const VERMELHO = '#dc2626'
const fmtDia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export default function MapaOpaPage() {
  const isMobile = useIsMobile()
  const { dados, setDados, erro, semMigracao, enviar } = useDadosMapa()
  const [andarEscolhido, setAndar] = useState<string | null>(null)
  const [sel, setSel] = useState<{ tipo: 'lugar' | 'bloco'; id: string } | null>(null)
  const [editando, setEditando] = useState(false)
  const [camada, setCamada] = useState<CamadaEdicao>('lugares')
  const [salvando, setSalvando] = useState(false)

  const andares = dados ? andaresOrdenados(dados.andares) : []
  const andar = andares.find((a) => a.id === andarEscolhido) || andares[0] || null
  const porLocal = useMemo(() => opasPorLocal(dados?.opas || []), [dados?.opas])
  const contagem = useMemo(() => Object.fromEntries(Object.entries(porLocal).map(([k, v]) => [k, v.length])), [porLocal])
  const nomes = Object.fromEntries((dados?.locais || []).map((l) => [l.id, l.nome]))
  const nomeLugar = (id: string) => nomeLocalCompleto(id, nomes[id])
  const depIds = (dados?.departamentos || []).map((d) => d.id)
  const pode = !!dados?.podeEditar

  // ── gravações (otimistas: a tela muda na hora; erro aparece em cima) ──
  const salvar = async (corpo: Record<string, unknown>, aplicar?: () => void) => {
    aplicar?.(); setSalvando(true)
    await enviar(corpo)
    setSalvando(false)
  }
  const moverLugar = (localId: string, r: Retangulo) => {
    if (!andar) return
    salvar({ acao: 'posicionar', local_id: localId, andar_id: andar.id, ...r }, () => setDados((d) => d && ({
      ...d, posicoes: [...d.posicoes.filter((p) => p.local_id !== localId), { local_id: localId, andar_id: andar.id, ...r }],
    })))
  }
  const salvarBlocos = (blocos: Bloco[]) => {
    if (!andar) return
    salvar({ acao: 'salvar_blocos', andar_id: andar.id, blocos }, () => setDados((d) => d && ({
      ...d, andares: d.andares.map((a) => (a.id === andar.id ? { ...a, blocos } : a)),
    })))
  }
  const moverBloco = (id: string, r: Retangulo) => andar && salvarBlocos(andar.blocos.map((b) => (b.id === id ? { ...b, ...r } : b)))

  const porNoMapa = (localId: string) => {
    if (!andar || !dados) return
    // os lugares ficam POR CIMA dos blocos: só não podem cair em cima de outro lugar
    moverLugar(localId, retanguloNovo(dados.posicoes.filter((p) => p.andar_id === andar.id)))
    setSel({ tipo: 'lugar', id: localId })
  }
  const tirarDoMapa = (localId: string) => salvar({ acao: 'tirar_do_mapa', local_id: localId }, () => {
    setDados((d) => d && ({ ...d, posicoes: d.posicoes.filter((p) => p.local_id !== localId) })); setSel(null)
  })
  const mudarDeAndar = (localId: string, para: string) => {
    const p = dados?.posicoes.find((x) => x.local_id === localId)
    if (!p) return
    salvar({ acao: 'posicionar', local_id: localId, andar_id: para, x: p.x, y: p.y, w: p.w, h: p.h }, () => setDados((d) => d && ({
      ...d, posicoes: d.posicoes.map((x) => (x.local_id === localId ? { ...x, andar_id: para } : x)),
    })))
    setAndar(para)
  }
  const novoBloco = () => {
    if (!andar) return
    const nome = prompt('Nome do bloco (área do andar), ex.: Escritório, Depósito, Corredor:')?.trim()
    if (!nome) return
    const r = retanguloNovo(andar.blocos, 24, 20)
    const b: Bloco = { id: idUnico(nome, andar.blocos.map((x) => x.id)), nome: nome.slice(0, 40), ...r }
    salvarBlocos([...andar.blocos, b]); setSel({ tipo: 'bloco', id: b.id })
  }
  const novoAndar = async () => {
    const nome = prompt('Nome do andar (ex.: 2º andar, Mezanino):')?.trim()
    if (!nome) return
    setSalvando(true)
    const j = await enviar({ acao: 'criar_andar', nome })
    setSalvando(false)
    const a = j?.andar as { id: string } | undefined
    if (a) { setDados((d) => d && ({ ...d, andares: [...d.andares, j!.andar as never] })); setAndar(a.id) }
  }
  const renomearAndar = async () => {
    if (!andar) return
    const nome = prompt('Novo nome do andar:', andar.nome)?.trim()
    if (!nome || nome === andar.nome) return
    salvar({ acao: 'renomear_andar', id: andar.id, nome }, () => setDados((d) => d && ({ ...d, andares: d.andares.map((a) => (a.id === andar.id ? { ...a, nome } : a)) })))
  }
  const removerAndar = async () => {
    if (!andar || !confirm(`Remover o andar "${andar.nome}"? (só dá se não tiver lugar nele)`)) return
    setSalvando(true)
    const j = await enviar({ acao: 'remover_andar', id: andar.id })
    setSalvando(false)
    if (j) { setDados((d) => d && ({ ...d, andares: d.andares.map((a) => (a.id === andar.id ? { ...a, ativo: false } : a)) })); setAndar(null) }
  }

  const lugarSel = sel?.tipo === 'lugar' ? sel.id : null
  const blocoSel = sel?.tipo === 'bloco' && andar ? andar.blocos.find((b) => b.id === sel.id) || null : null
  const posSel = lugarSel ? dados?.posicoes.find((p) => p.local_id === lugarSel) : null
  const foraDoMapa = (dados?.locais || []).filter((l) => l.ativo && !dados?.posicoes.some((p) => p.local_id === l.id))
  const destinoSel = lugarSel && dados ? destinoDoLocal(lugarSel, dados.ligacoes, dados.departamentos) : null

  const cartao: React.CSSProperties = { borderRadius: 12, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', padding: 14 }
  const titulo: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 800, color: 'var(--portal-text)', margin: '0 0 8px' }
  const btn = (cor = 'var(--portal-text-secondary)', cheio = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: cheio ? 'none' : '1px solid var(--portal-border)', background: cheio ? cor : 'var(--portal-bg-card)', color: cheio ? '#fefefe' : cor,
  })

  return (
    <div style={{ padding: isMobile ? '12px 12px 24px' : '16px 20px 28px', width: '100%', boxSizing: 'border-box' }}>
      <OpaBarra acao={<>
        {pode && (
          <button type="button" onClick={() => { setEditando((v) => !v); setSel(null) }} style={{ ...BTN_FAIXA, ...(editando ? { background: '#fefefe', color: '#111111', border: '1px solid #fefefe' } : {}) }}>
            <Pencil size={15} /> {editando ? 'Terminar edição' : 'Editar mapa'}
          </button>
        )}
        {pode && <Link href="/opa/departamentos" style={{ ...BTN_FAIXA, padding: '0 12px' }}><Building2 size={16} /> Departamentos</Link>}
      </>} />

      {erro && <div role="alert" style={{ padding: 10, borderRadius: 8, background: '#FEF2F2', color: '#991B1B', fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>{erro}</div>}
      {semMigracao && <div style={{ padding: 10, borderRadius: 8, background: '#FFFBEB', color: '#92400E', fontSize: 13.5, marginBottom: 12 }}>O mapa ainda não foi ativado no banco (falta o sql/opa-mapa.sql).</div>}
      {!dados && !erro && <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 40, color: 'var(--portal-text-muted)' }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando o mapa…</div>}

      {dados && andar && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'start' }}>
          <div>
            {editando && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10, padding: '8px 10px', borderRadius: 10, background: '#FEF2F2', color: '#991B1B', fontSize: 13 }}>
                <b>Editando:</b>
                {(['lugares', 'blocos'] as const).map((c) => (
                  <button key={c} type="button" onClick={() => { setCamada(c); setSel(null) }} aria-pressed={camada === c}
                    style={{ ...btn(VERMELHO, camada === c), height: 30 }}>{c === 'lugares' ? <MapPin size={14} /> : <Square size={14} />} {c === 'lugares' ? 'Lugares' : 'Blocos do andar'}</button>
                ))}
                <span style={{ flex: 1, minWidth: 160 }}>Arraste para mover. Toque num item e puxe as bordas vermelhas para mudar a largura ou a altura (ou digite as medidas ao lado).</span>
                {salvando && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
              </div>
            )}
            <PlantaLoja dados={dados} andarId={andar.id} onAndar={(id) => { setAndar(id); if (sel?.tipo === 'bloco') setSel(null) }}
              modo={editando ? 'editar' : 'ver'} camada={camada} selecionado={sel?.id || null}
              onSelecionar={(tipo, id) => setSel({ tipo, id })} onMoverLugar={moverLugar} onMoverBloco={moverBloco} contagem={contagem} />

            {/* legenda: cor = departamento */}
            {!editando && dados.departamentos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
                {dados.departamentos.map((d) => (
                  <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: corDoDepartamento(d.id, depIds) }} />{d.nome}{d.gestor_nome ? ` · ${d.gestor_nome.split(' ')[0]}` : ''}
                  </span>
                ))}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: COR_SEM_DEPARTAMENTO }} />sem departamento</span>
              </div>
            )}
          </div>

          {/* painel da direita */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {lugarSel && (
              <section style={cartao}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <h2 style={{ ...titulo, flex: 1 }}><MapPin size={16} color={VERMELHO} /> {nomeLugar(lugarSel)}</h2>
                  <button type="button" aria-label="Fechar" onClick={() => setSel(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}><X size={16} /></button>
                </div>
                <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
                  <span><Building2 size={12} /> {destinoSel?.departamento?.nome || 'Sem departamento'}</span>
                  <span style={{ color: destinoSel?.gestorNome ? undefined : '#B45309' }}><UserRound size={12} /> {destinoSel?.gestorNome ? `Gestor: ${destinoSel.gestorNome}` : 'Sem gestor: o Opa avisa todo mundo'}</span>
                </div>
                {!editando && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--portal-text)', marginBottom: 6 }}>{porLocal[lugarSel]?.length ? `${porLocal[lugarSel].length} Opa(s) aberto(s)` : 'Nenhum Opa aberto aqui'}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {(porLocal[lugarSel] || []).map((o) => (
                        <div key={o.id} style={{ fontSize: 13, padding: '6px 8px', borderRadius: 8, background: 'var(--portal-bg-secondary)' }}>
                          <div style={{ fontWeight: 700, color: 'var(--portal-text)' }}>{o.titulo}</div>
                          <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>aberto {fmtDia(o.created_at)}{o.responsavel ? ` · ${o.responsavel}` : ''}</div>
                        </div>
                      ))}
                    </div>
                    {porLocal[lugarSel]?.length ? (
                      <Link href={`/opa?local=${encodeURIComponent(lugarSel)}`} style={{ ...btn(VERMELHO), marginTop: 10, textDecoration: 'none' }}>Ver em Ocorrências <ArrowRight size={14} /></Link>
                    ) : null}
                  </>
                )}
                {editando && posSel && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <CamposMedidas key={`${posSel.local_id}-${posSel.x}-${posSel.y}-${posSel.w}-${posSel.h}`} r={posSel}
                      onSalvar={(r) => salvar({ acao: 'posicionar', local_id: posSel.local_id, andar_id: posSel.andar_id, ...r }, () => setDados((d) => d && ({
                        ...d, posicoes: d.posicoes.map((p) => (p.local_id === posSel.local_id ? { ...p, ...r } : p)),
                      })))} />
                    {andares.length > 1 && (
                      <label style={{ fontSize: 13, color: 'var(--portal-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        Andar
                        <select value={posSel.andar_id} onChange={(e) => mudarDeAndar(lugarSel, e.target.value)} style={{ flex: 1, height: 34, borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontFamily: 'inherit' }}>
                          {andares.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                        </select>
                      </label>
                    )}
                    <button type="button" onClick={() => tirarDoMapa(lugarSel)} style={btn(VERMELHO)}><Trash2 size={14} /> Tirar do mapa</button>
                  </div>
                )}
              </section>
            )}

            {editando && blocoSel && (
              <section style={cartao}>
                <h2 style={titulo}><Square size={16} color={VERMELHO} /> Bloco: {blocoSel.nome}</h2>
                <CamposMedidas key={`${blocoSel.id}-${blocoSel.x}-${blocoSel.y}-${blocoSel.w}-${blocoSel.h}`} r={blocoSel} onSalvar={(r) => moverBloco(blocoSel.id, r)} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" style={btn()} onClick={() => {
                    const nome = prompt('Nome do bloco:', blocoSel.nome)?.trim()
                    if (nome && andar) salvarBlocos(andar.blocos.map((b) => (b.id === blocoSel.id ? { ...b, nome: nome.slice(0, 40) } : b)))
                  }}><Pencil size={14} /> Renomear</button>
                  <button type="button" style={btn(VERMELHO)} onClick={() => {
                    if (andar && confirm(`Apagar o bloco "${blocoSel.nome}"?`)) { salvarBlocos(andar.blocos.filter((b) => b.id !== blocoSel.id)); setSel(null) }
                  }}><Trash2 size={14} /> Apagar</button>
                </div>
              </section>
            )}

            {editando && camada === 'lugares' && (
              <section style={cartao}>
                <h2 style={titulo}><Plus size={16} color={VERMELHO} /> Pôr no {andar.nome}</h2>
                {foraDoMapa.length === 0 ? <div style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>Todos os lugares já estão no mapa.</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {agruparLocais(foraDoMapa).map((g) => (
                      <div key={g.titulo}>
                        <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--portal-text-muted)', marginBottom: 4 }}>{g.titulo}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {g.itens.map(({ local: l, rotulo }) => (
                            <button key={l.id} type="button" onClick={() => porNoMapa(l.id)} style={{ ...btn(), height: 30, fontSize: 12.5 }}><Plus size={13} /> {rotulo}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: '10px 0 0' }}>Lugar novo se cria no próprio Opa (&ldquo;+ Criar local novo…&rdquo;) e aparece aqui.</p>
              </section>
            )}

            {editando && camada === 'blocos' && (
              <section style={cartao}>
                <h2 style={titulo}><Square size={16} color={VERMELHO} /> Planta do {andar.nome}</h2>
                <p style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', margin: '0 0 10px' }}>Blocos são as áreas grandes do andar (pátio, showroom, escritório…). Servem de fundo para os lugares.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={novoBloco} style={btn(VERMELHO, true)}><Plus size={14} /> Bloco</button>
                </div>
              </section>
            )}

            {editando && (
              <section style={cartao}>
                <h2 style={titulo}>Andares</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={novoAndar} style={btn()}><Plus size={14} /> Andar</button>
                  <button type="button" onClick={renomearAndar} style={btn()}><Pencil size={14} /> Renomear {andar.nome}</button>
                  {andares.length > 1 && <button type="button" onClick={removerAndar} style={btn(VERMELHO)}><Trash2 size={14} /> Remover</button>}
                </div>
              </section>
            )}

            {!editando && !lugarSel && (
              <section style={{ ...cartao, fontSize: 13, color: 'var(--portal-text-secondary)', lineHeight: 1.55 }}>
                <h2 style={titulo}>Como ler o mapa</h2>
                Cada caixa é um lugar da loja, pintado com a cor do departamento. O número vermelho é quantos Opas estão abertos ali.
                Toque num lugar para ver os Opas e quem é o gestor. Use <b>Subir</b>/<b>Descer</b> para trocar de andar.
                {foraDoMapa.length > 0 && <div style={{ marginTop: 8, color: '#B45309' }}>{foraDoMapa.length} lugar(es) ainda fora do mapa{pode ? ' — use "Editar mapa".' : '.'}</div>}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Largura/altura/posição em % da planta, para acertar na medida (ex.: alargar o Showroom).
 *  Grava ao sair do campo ou com Enter; valores fora da planta são ajustados. */
function CamposMedidas({ r, onSalvar }: { r: Retangulo; onSalvar: (r: Retangulo) => void }) {
  const [v, setV] = useState({ w: String(r.w), h: String(r.h), x: String(r.x), y: String(r.y) })
  const gravar = () => {
    const n = (s: string, padrao: number) => { const x = Number(s.replace(',', '.')); return Number.isFinite(x) ? x : padrao }
    const novo = limitarRet({ w: n(v.w, r.w), h: n(v.h, r.h), x: n(v.x, r.x), y: n(v.y, r.y) })
    setV({ w: String(novo.w), h: String(novo.h), x: String(novo.x), y: String(novo.y) })
    if (novo.w !== r.w || novo.h !== r.h || novo.x !== r.x || novo.y !== r.y) onSalvar(novo)
  }
  const campo = (k: keyof typeof v, rotulo: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>
      {rotulo}
      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} onBlur={gravar}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); gravar() } }}
          style={{ width: '100%', minWidth: 0, height: 32, padding: '0 8px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 14, fontFamily: 'inherit' }} />
        <span style={{ fontWeight: 500, color: 'var(--portal-text-muted)' }}>%</span>
      </span>
    </label>
  )
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {campo('w', 'Largura')}{campo('h', 'Altura')}{campo('x', 'Da esquerda')}{campo('y', 'Do topo')}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', margin: '6px 0 0' }}>Em % da planta. Ou puxe pelas bordas vermelhas no mapa.</p>
    </div>
  )
}
