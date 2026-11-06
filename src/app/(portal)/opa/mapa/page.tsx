'use client'
// Opa → Mapa: a planta da loja por andar com os territórios (os lugares do Opa).
// Ver: cor = departamento, gestor no nome, nº de Opas abertos; clique = os Opas do lugar.
// Admin: "Editar mapa" — põe/arrasta/redimensiona os lugares, desenha salas com forma
// (retângulo, quadrado, círculo, L, triângulo, personalizada) — desenhada dentro de uma área,
// pergunta se o lugar novo fica DENTRO daquele setor — e a estrutura do andar (áreas,
// paredes, portas, janelas, corredores, escadas).

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Building2, Circle, DoorOpen, Footprints, Hexagon, Loader2, MapPin, MousePointer2, Pencil, Plus, RectangleHorizontal, Square, SquareDashed, Trash2, Triangle, UserRound, X } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { OpaBarra, BTN_FAIXA } from '@/components/opa/pecas/comum'
import PlantaLoja, { type Desenho, type Ferramenta } from '@/components/opa/mapa/PlantaLoja'
import { useDadosMapa } from '@/components/opa/mapa/useDadosMapa'
import {
  andaresOrdenados, areaNoPonto, corDoDepartamento, COR_SEM_DEPARTAMENTO, FORMAS, idUnico, limitarRet, minDoTipo, nomeDoTipo, opasPorLocal,
  TIPOS_ESTRUTURA, type Bloco, type Forma, type Retangulo, type TipoBloco,
} from '@/lib/opa/mapa'
import { destinoDoLocal } from '@/lib/opa/departamentos'
import { agruparLocais, mapaNomesLocais, rotuloDoLocal, setorDoLocal, setoresDosLocais } from '@/lib/opa-pecas/regras'
import { criarLocal } from '@/lib/opa-pecas/db'
import { mensagemErro } from '@/lib/opa-pecas/fotos'
import type { Local } from '@/lib/opa-pecas/tipos'

const VERMELHO = '#dc2626'
const fmtDia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/** Formas para desenhar sala/lugar (o quadrado vira retângulo depois de desenhado). */
const FERRAMENTAS_FORMA: { forma: Forma | 'quadrado'; nome: string; icone: React.ReactNode }[] = [
  { forma: 'retangulo', nome: 'Retângulo', icone: <RectangleHorizontal size={15} /> },
  { forma: 'quadrado', nome: 'Quadrado', icone: <Square size={15} /> },
  { forma: 'circulo', nome: 'Círculo', icone: <Circle size={15} /> },
  { forma: 'L', nome: 'Em L', icone: <FormaL /> },
  { forma: 'triangulo', nome: 'Triângulo', icone: <Triangle size={15} /> },
  { forma: 'personalizada', nome: 'Personalizada', icone: <Hexagon size={15} /> },
]
const ICONE_ESTRUTURA: Record<Exclude<TipoBloco, 'area'>, React.ReactNode> = {
  parede: <span style={{ width: 15, height: 4, background: 'currentColor', borderRadius: 1 }} />,
  porta: <DoorOpen size={15} />,
  janela: <span style={{ width: 15, height: 5, border: '1.5px solid currentColor', borderRadius: 1 }} />,
  corredor: <Footprints size={15} />,
  escada: <span style={{ width: 13, height: 13, background: 'repeating-linear-gradient(0deg, currentColor 0 2px, transparent 2px 4px)' }} />,
}

/** Lugar desenhado esperando confirmação ("dentro de Peças?"). */
interface PedidoLugar { desenho: Desenho; area: Bloco | null }

export default function MapaOpaPage() {
  const isMobile = useIsMobile()
  const { dados, setDados, erro, setErro, semMigracao, enviar } = useDadosMapa()
  const [andarEscolhido, setAndar] = useState<string | null>(null)
  const [sel, setSel] = useState<{ tipo: 'lugar' | 'bloco'; id: string } | null>(null)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [ferramenta, setFerramenta] = useState<Ferramenta | null>(null)
  const [formaSala, setFormaSala] = useState<Forma | 'quadrado'>('retangulo')
  const [colocando, setColocando] = useState<string | null>(null)
  const [pedido, setPedido] = useState<PedidoLugar | null>(null)
  const [pedidoArea, setPedidoArea] = useState<Desenho | null>(null)
  const [editandoNome, setEditandoNome] = useState(false)
  const [medidas, setMedidas] = useState(false)

  const andares = dados ? andaresOrdenados(dados.andares) : []
  const andar = andares.find((a) => a.id === andarEscolhido) || andares[0] || null
  const porLocal = useMemo(() => opasPorLocal(dados?.opas || []), [dados?.opas])
  const contagem = useMemo(() => Object.fromEntries(Object.entries(porLocal).map(([k, v]) => [k, v.length])), [porLocal])
  const nomes = useMemo(() => mapaNomesLocais(dados?.locais || []), [dados?.locais])
  const nomeLugar = (id: string) => nomes[id] || id
  const depIds = (dados?.departamentos || []).map((d) => d.id)
  const pode = !!dados?.podeEditar
  const cancelarDesenho = useCallback(() => setFerramenta(null), [])

  // ── gravações (otimistas: a tela muda na hora; erro aparece em cima) ──
  const salvar = async (corpo: Record<string, unknown>, aplicar?: () => void) => {
    aplicar?.(); setSalvando(true)
    const j = await enviar(corpo)
    setSalvando(false)
    return j
  }
  const moverLugar = (localId: string, r: Retangulo, extra: { forma?: Forma; pontos?: unknown } = {}, andarId = andar?.id) => {
    if (!andarId) return
    return salvar({ acao: 'posicionar', local_id: localId, andar_id: andarId, ...r, ...extra }, () => setDados((d) => d && ({
      ...d, posicoes: [...d.posicoes.filter((p) => p.local_id !== localId), { ...d.posicoes.find((p) => p.local_id === localId), local_id: localId, andar_id: andarId, ...r, ...(extra as object) }],
    })))
  }
  const salvarBlocos = (blocos: Bloco[]) => {
    if (!andar) return
    salvar({ acao: 'salvar_blocos', andar_id: andar.id, blocos }, () => setDados((d) => d && ({
      ...d, andares: d.andares.map((a) => (a.id === andar.id ? { ...a, blocos } : a)),
    })))
  }
  const moverBloco = (id: string, r: Retangulo) => andar && salvarBlocos(andar.blocos.map((b) => (b.id === id ? { ...b, ...r } : b)))

  /** lugar da lista "Para posicionar" solto na planta: fica centrado onde tocou */
  const colocar = (localId: string, x: number, y: number) => {
    setColocando(null)
    moverLugar(localId, limitarRet({ x: x - 7, y: y - 5, w: 14, h: 10 }))
    setSel({ tipo: 'lugar', id: localId })
  }
  const tirarDoMapa = (localId: string) => salvar({ acao: 'tirar_do_mapa', local_id: localId }, () => {
    setDados((d) => d && ({ ...d, posicoes: d.posicoes.filter((p) => p.local_id !== localId) })); setSel(null)
  })
  const apagarBloco = (id: string) => { if (andar) { salvarBlocos(andar.blocos.filter((b) => b.id !== id)); setSel(null) } }
  const mudarDeAndar = (localId: string, para: string) => {
    const p = dados?.posicoes.find((x) => x.local_id === localId)
    if (!p) return
    moverLugar(localId, p, {}, para)
    setAndar(para)
  }

  // ── desenho ──
  const escolherFerramenta = (f: Ferramenta | null) => { setFerramenta(f); setSel(null); setColocando(null) }
  const aoDesenhar = (d: Desenho) => {
    if (!andar || !ferramenta) return
    if (ferramenta.tipo === 'estrutura') {
      // parede/porta/… entra direto; a ferramenta continua ativa para desenhar a próxima
      const nome = nomeDoTipo(ferramenta.estrutura)
      const b: Bloco = { id: idUnico(nome, andar.blocos.map((x) => x.id)), nome, tipo: ferramenta.estrutura, ...d.ret }
      salvarBlocos([...andar.blocos, b])
      return
    }
    if (ferramenta.tipo === 'area') { setPedidoArea(d); return }
    // sala/lugar: se caiu dentro de uma área (Oficina, Peças…), pergunta se fica dentro dela
    setPedido({ desenho: d, area: areaNoPonto(andar.blocos, d.cx, d.cy) })
  }
  const criarArea = (nome: string) => {
    if (!andar || !pedidoArea) return
    const d = pedidoArea
    const b: Bloco = { id: idUnico(nome, andar.blocos.map((x) => x.id)), nome: nome.slice(0, 40), tipo: 'area', ...d.ret,
      ...(d.forma !== 'retangulo' ? { forma: d.forma, pontos: d.pontos } : {}) }
    salvarBlocos([...andar.blocos, b])
    setPedidoArea(null); setFerramenta(null); setSel({ tipo: 'bloco', id: b.id })
  }
  /** confirmou o lugar desenhado: cria o local (com setor) ou usa um já criado, e põe com a forma */
  const confirmarLugar = async (escolha: { existente: string } | { nome: string; setor: string }) => {
    if (!pedido || !andar) return
    const d = pedido.desenho
    let localId: string
    if ('existente' in escolha) localId = escolha.existente
    else {
      const novo = await criarLocal(escolha.nome, false, escolha.setor || null)   // erro sobe para a janela
      localId = novo.id
      setDados((x) => x && ({ ...x, locais: [...x.locais.filter((l) => l.id !== novo.id), novo] }))
    }
    setPedido(null); setFerramenta(null)
    await moverLugar(localId, d.ret, { forma: d.forma, pontos: d.pontos })
    setSel({ tipo: 'lugar', id: localId })
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
  const localSel = lugarSel ? dados?.locais.find((l) => l.id === lugarSel) || null : null
  const foraDoMapa = (dados?.locais || []).filter((l) => l.ativo && !dados?.posicoes.some((p) => p.local_id === l.id))
  const destinoSel = lugarSel && dados ? destinoDoLocal(lugarSel, dados.ligacoes, dados.departamentos) : null
  // setores para escolher: os dos lugares + as áreas desenhadas no andar
  const setores = useMemo(() => {
    const lista = setoresDosLocais((dados?.locais || []).filter((l) => l.ativo))
    for (const a of dados?.andares || []) for (const b of a.blocos) {
      if ((b.tipo || 'area') === 'area' && !lista.some((s) => s.toLowerCase() === b.nome.toLowerCase())) lista.push(b.nome)
    }
    return lista
  }, [dados?.locais, dados?.andares])

  // teclado no editar: Delete apaga/tira, setas empurram, Esc solta a seleção
  const selRet: Retangulo | null = posSel || blocoSel || null
  useEffect(() => {
    if (!editando || !sel || !selRet) return
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'SELECT' || alvo.tagName === 'TEXTAREA')) return
      if (e.key === 'Escape') { setSel(null); return }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (sel.tipo === 'lugar') tirarDoMapa(sel.id)
        else apagarBloco(sel.id)
        return
      }
      const passo = e.shiftKey ? 2 : 0.5
      const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key]
      if (!d) return
      e.preventDefault()
      const r = limitarRet({ ...selRet, x: selRet.x + d[0], y: selRet.y + d[1] }, blocoSel ? minDoTipo(blocoSel.tipo) : undefined)
      if (sel.tipo === 'lugar') moverLugar(sel.id, r)
      else moverBloco(sel.id, r)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const cartao: React.CSSProperties = { borderRadius: 12, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', padding: 14 }
  const titulo: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 800, color: 'var(--portal-text)', margin: '0 0 8px' }
  const btn = (cor = 'var(--portal-text-secondary)', cheio = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: cheio ? 'none' : '1px solid var(--portal-border)', background: cheio ? cor : 'var(--portal-bg-card)', color: cheio ? '#fefefe' : cor, whiteSpace: 'nowrap',
  })
  const pequeno = (cor?: string, cheio?: boolean): React.CSSProperties => ({ ...btn(cor, cheio), height: 32, padding: isMobile ? '0 9px' : '0 11px', fontSize: 12.5 })

  // ferramentas: Mover (padrão) + Sala + estrutura
  const ferramentaAtiva = !ferramenta ? 'mover' : ferramenta.tipo === 'estrutura' ? ferramenta.estrutura : ferramenta.tipo === 'lugar' ? 'sala' : 'area'
  const FERRAMENTAS: { id: string; nome: string; icone: React.ReactNode; f: Ferramenta | null }[] = [
    { id: 'mover', nome: 'Mover', icone: <MousePointer2 size={15} />, f: null },
    { id: 'sala', nome: 'Sala', icone: <MapPin size={15} />, f: { tipo: 'lugar', forma: formaSala } },
    { id: 'area', nome: 'Área', icone: <SquareDashed size={15} />, f: { tipo: 'area', forma: 'retangulo' } },
    ...TIPOS_ESTRUTURA.map((t) => ({ id: t.id, nome: t.nome, icone: ICONE_ESTRUTURA[t.id], f: { tipo: 'estrutura', estrutura: t.id } as Ferramenta })),
  ]
  const dica = colocando ? `Toque no mapa onde fica ${nomeLugar(colocando)}.`
    : !ferramenta ? 'Arraste para mover. Toque para selecionar e puxe a bolinha vermelha para mudar o tamanho.'
    : ferramenta.tipo === 'lugar' && formaSala === 'personalizada' ? 'Toque nos cantos da sala, um por um. Feche tocando no primeiro ponto.'
    : ferramenta.tipo === 'lugar' ? 'Arraste na planta de um canto ao outro da sala (ou só toque).'
    : ferramenta.tipo === 'area' ? 'Arraste na planta para desenhar a área (Oficina, Peças, Escritório…).'
    : `Arraste na planta para desenhar a ${nomeDoTipo(ferramenta.tipo === 'estrutura' ? ferramenta.estrutura : 'area').toLowerCase()}. Dá para fazer várias seguidas.`

  return (
    <div style={{ padding: isMobile ? '12px 12px 24px' : '16px 20px 28px', width: '100%', boxSizing: 'border-box' }}>
      <OpaBarra acao={<>
        {pode && (
          <button type="button" onClick={() => { setEditando((v) => !v); setSel(null); setFerramenta(null); setColocando(null) }} style={{ ...BTN_FAIXA, ...(editando ? { background: '#fefefe', color: '#111111', border: '1px solid #fefefe' } : {}) }}>
            <Pencil size={15} /> {editando ? 'Pronto' : 'Editar mapa'}
          </button>
        )}
        {pode && <Link href="/opa/departamentos" style={{ ...BTN_FAIXA, padding: '0 12px' }}><Building2 size={16} /> Departamentos</Link>}
      </>} />

      {erro && <div role="alert" style={{ padding: 10, borderRadius: 8, background: '#FEF2F2', color: '#991B1B', fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>{erro}</div>}
      {semMigracao && <div style={{ padding: 10, borderRadius: 8, background: '#FFFBEB', color: '#92400E', fontSize: 13.5, marginBottom: 12 }}>O mapa ainda não foi ativado no banco (falta o sql/opa-mapa.sql).</div>}
      {!dados && !erro && <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 40, color: 'var(--portal-text-muted)' }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando o mapa…</div>}

      {dados && andar && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile || editando ? '1fr' : 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'start' }}>
          <div>
            {editando && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {/* ferramentas numa linha só */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {FERRAMENTAS.map((t) => (
                    <button key={t.id} type="button" aria-pressed={ferramentaAtiva === t.id}
                      onClick={() => escolherFerramenta(ferramentaAtiva === t.id && t.id !== 'mover' ? null : t.f)}
                      style={pequeno(VERMELHO, ferramentaAtiva === t.id)}>{t.icone} {t.nome}</button>
                  ))}
                  {salvando && <Loader2 size={15} color={VERMELHO} style={{ animation: 'spin 1s linear infinite' }} />}
                </div>
                {/* Sala: a forma */}
                {ferramenta?.tipo === 'lugar' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: isMobile ? 0 : 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)' }}>Forma:</span>
                    {FERRAMENTAS_FORMA.map((f) => (
                      <button key={f.forma} type="button" title={f.nome} aria-pressed={formaSala === f.forma}
                        onClick={() => { setFormaSala(f.forma); setFerramenta({ tipo: 'lugar', forma: f.forma }) }}
                        style={{ ...pequeno(VERMELHO, formaSala === f.forma), padding: '0 9px' }}>{f.icone}{!isMobile && ` ${f.nome}`}</button>
                    ))}
                  </div>
                )}
                {/* lugares criados que ainda não estão no mapa */}
                {foraDoMapa.length > 0 && !ferramenta && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#92400E' }}>Para posicionar ({foraDoMapa.length}):</span>
                    {agruparLocais(foraDoMapa).flatMap((g) => g.itens.map(({ local: l }) => (
                      <button key={l.id} type="button" draggable={!isMobile}
                        onDragStart={(e) => { e.dataTransfer.setData('text/opa-local', l.id); e.dataTransfer.effectAllowed = 'move' }}
                        onClick={() => { setColocando(colocando === l.id ? null : l.id); setSel(null) }}
                        title="Toque e depois toque no mapa (ou arraste até o mapa)"
                        style={{ ...pequeno('#92400E', colocando === l.id), height: 30, cursor: 'grab', background: colocando === l.id ? '#B45309' : '#fefefe', border: '1px solid #FCD34D' }}>
                        <Plus size={13} /> {nomeLugar(l.id)}
                      </button>
                    )))}
                    {colocando && <button type="button" onClick={() => setColocando(null)} style={{ ...pequeno(), height: 30 }}><X size={13} /> Cancelar</button>}
                  </div>
                )}
                <div style={{ fontSize: 12.5, color: ferramenta || colocando ? '#991B1B' : 'var(--portal-text-muted)' }}>{dica}</div>

                {/* item selecionado: ações rápidas */}
                {sel && (posSel || blocoSel) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 10, background: 'var(--portal-bg-card)', border: `1.5px solid ${VERMELHO}` }}>
                    <b style={{ fontSize: 13.5, color: 'var(--portal-text)', marginRight: 4 }}>
                      {lugarSel ? nomeLugar(lugarSel) : `${nomeDoTipo(blocoSel!.tipo || 'area')}: ${blocoSel!.nome}`}
                    </b>
                    {lugarSel && localSel && <button type="button" onClick={() => setEditandoNome(true)} style={pequeno()}><Pencil size={13} /> Nome e setor</button>}
                    {blocoSel && <button type="button" style={pequeno()} onClick={() => {
                      const nome = prompt('Nome:', blocoSel.nome)?.trim()
                      if (nome && andar) salvarBlocos(andar.blocos.map((b) => (b.id === blocoSel.id ? { ...b, nome: nome.slice(0, 40) } : b)))
                    }}><Pencil size={13} /> Renomear</button>}
                    {(posSel || (blocoSel && (blocoSel.tipo || 'area') === 'area')) && (
                      <select aria-label="Forma" value={(posSel?.forma || blocoSel?.forma) || 'retangulo'} style={{ ...campoSelect, flex: 'none', height: 32, width: 'auto', fontSize: 12.5 }}
                        onChange={(e) => {
                          const forma = e.target.value as Forma
                          if (posSel && lugarSel) moverLugar(lugarSel, posSel, { forma, pontos: posSel.pontos })
                          else if (blocoSel && andar) salvarBlocos(andar.blocos.map((b) => (b.id === blocoSel.id ? { ...b, forma } : b)))
                        }}>
                        {FORMAS.filter((f) => f.id !== 'personalizada' || (posSel?.forma || blocoSel?.forma) === 'personalizada').map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </select>
                    )}
                    {posSel && lugarSel && andares.length > 1 && (
                      <select aria-label="Andar" value={posSel.andar_id} onChange={(e) => mudarDeAndar(lugarSel, e.target.value)} style={{ ...campoSelect, flex: 'none', height: 32, width: 'auto', fontSize: 12.5 }}>
                        {andares.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                      </select>
                    )}
                    <button type="button" onClick={() => setMedidas((v) => !v)} aria-pressed={medidas} style={pequeno(undefined, false)}>Medidas</button>
                    <button type="button" onClick={() => {
                      if (lugarSel) tirarDoMapa(lugarSel)
                      else if (blocoSel && confirm(`Apagar "${blocoSel.nome}"?`)) apagarBloco(blocoSel.id)
                    }} style={pequeno(VERMELHO)}><Trash2 size={13} /> {lugarSel ? 'Tirar do mapa' : 'Apagar'}</button>
                    <button type="button" aria-label="Soltar" onClick={() => setSel(null)} style={{ ...pequeno(), marginLeft: 'auto', padding: '0 8px' }}><X size={14} /></button>
                    {medidas && selRet && (
                      <div style={{ width: '100%', maxWidth: 360 }}>
                        <CamposMedidas key={`${sel.id}-${selRet.x}-${selRet.y}-${selRet.w}-${selRet.h}`} r={selRet} min={blocoSel ? minDoTipo(blocoSel.tipo) : undefined}
                          onSalvar={(r) => (lugarSel ? moverLugar(lugarSel, r) : blocoSel && moverBloco(blocoSel.id, r))} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <PlantaLoja dados={dados} andarId={andar.id} onAndar={(id) => { setAndar(id); if (sel?.tipo === 'bloco') setSel(null) }}
              modo={editando ? 'editar' : 'ver'} selecionado={sel}
              onSelecionar={(tipo, id) => setSel({ tipo, id })} onDesselecionar={() => setSel(null)}
              onMoverLugar={(id, r) => { moverLugar(id, r) }} onMoverBloco={moverBloco} contagem={contagem}
              ferramenta={editando ? ferramenta : null} onDesenhar={aoDesenhar} onCancelarDesenho={cancelarDesenho}
              colocando={editando ? colocando : null} onColocar={colocar} />

            {editando && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10, fontSize: 12.5, color: 'var(--portal-text-muted)' }}>
                Andar <b style={{ color: 'var(--portal-text)' }}>{andar.nome}</b>:
                <button type="button" onClick={renomearAndar} style={pequeno()}><Pencil size={13} /> Renomear</button>
                <button type="button" onClick={novoAndar} style={pequeno()}><Plus size={13} /> Andar novo</button>
                {andares.length > 1 && <button type="button" onClick={removerAndar} style={pequeno(VERMELHO)}><Trash2 size={13} /> Remover andar</button>}
                {!isMobile && <span style={{ marginLeft: 'auto' }}>Teclado: setas movem · Delete apaga · Esc solta</span>}
              </div>
            )}

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

          {/* painel da direita (só olhando o mapa) */}
          {!editando && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lugarSel ? (
                <section style={cartao}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <h2 style={{ ...titulo, flex: 1 }}><MapPin size={16} color={VERMELHO} /> {nomeLugar(lugarSel)}</h2>
                    <button type="button" aria-label="Fechar" onClick={() => setSel(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}><X size={16} /></button>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
                    <span><Building2 size={12} /> {destinoSel?.departamento?.nome || 'Sem departamento'}</span>
                    <span style={{ color: destinoSel?.gestorNome ? undefined : '#B45309' }}><UserRound size={12} /> {destinoSel?.gestorNome ? `Gestor: ${destinoSel.gestorNome}` : 'Sem gestor: o Opa avisa todo mundo'}</span>
                  </div>
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
                </section>
              ) : (
                <section style={{ ...cartao, fontSize: 13, color: 'var(--portal-text-secondary)', lineHeight: 1.55 }}>
                  <h2 style={titulo}>Como ler o mapa</h2>
                  Cada forma colorida é um lugar da loja, pintado com a cor do departamento. O número vermelho é quantos Opas estão abertos ali.
                  Toque num lugar para ver os Opas e quem é o gestor. Use <b>Subir</b>/<b>Descer</b> para trocar de andar.
                  {foraDoMapa.length > 0 && <div style={{ marginTop: 8, color: '#B45309' }}>{foraDoMapa.length} lugar(es) ainda fora do mapa{pode ? ' — use "Editar mapa".' : '.'}</div>}
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {editandoNome && localSel && (
        <Janela titulo="Nome e setor do lugar" mobile={isMobile} onFechar={() => setEditandoNome(false)}>
          <NomeESetor local={localSel} setores={setores}
            onSalvar={async (nome, setor) => {
              const j = await salvar({ acao: 'editar_local', local_id: localSel.id, nome, setor })
              if (j) { setDados((d) => d && ({ ...d, locais: d.locais.map((l) => (l.id === localSel.id ? { ...l, nome, setor: setor || null } : l)) })); setEditandoNome(false) }
            }} />
        </Janela>
      )}
      {pedido && dados && (
        <JanelaNovoLugar pedido={pedido} setores={setores} foraDoMapa={foraDoMapa} mobile={isMobile}
          onConfirmar={confirmarLugar} onFechar={() => setPedido(null)} onErro={(m) => setErro(m)} />
      )}
      {pedidoArea && (
        <JanelaNomeArea mobile={isMobile} onConfirmar={criarArea} onFechar={() => setPedidoArea(null)} />
      )}
    </div>
  )
}

const campoSelect: React.CSSProperties = { flex: 1, minWidth: 0, height: 34, borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontFamily: 'inherit', fontSize: 13.5 }
const campoTexto: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 38, padding: '0 10px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 14, fontFamily: 'inherit' }
const SETOR_NOVO = '__setor_novo__'

/** Ícone do "Em L" (o lucide não tem). */
function FormaL() {
  return <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round"><path d="M4 3h8v9h8v9H4z" /></svg>
}

/** Setor: escolhe da lista, nenhum, ou digita um novo. */
function CampoSetor({ valor, onChange, setores }: { valor: string; onChange: (s: string) => void; setores: string[] }) {
  const naLista = !valor || setores.some((s) => s.toLowerCase() === valor.toLowerCase())
  const [digitando, setDigitando] = useState(!naLista)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select value={digitando ? SETOR_NOVO : valor} onChange={(e) => {
        if (e.target.value === SETOR_NOVO) { setDigitando(true); onChange('') } else { setDigitando(false); onChange(e.target.value) }
      }} style={{ ...campoSelect, height: 38 }}>
        <option value="">Nenhum (vai para Outros)</option>
        {setores.map((s) => <option key={s} value={s}>{s}</option>)}
        <option value={SETOR_NOVO}>+ Setor novo…</option>
      </select>
      {digitando && <input value={valor} autoFocus onChange={(e) => onChange(e.target.value.slice(0, 40))} placeholder="Nome do setor novo" style={campoTexto} />}
    </div>
  )
}

/** Nome + setor do lugar selecionado (ex.: "W/C Oficina" vira setor Oficina, nome Banheiro). */
function NomeESetor({ local, setores, onSalvar }: { local: Local; setores: string[]; onSalvar: (nome: string, setor: string) => void }) {
  const [nome, setNome] = useState(rotuloDoLocal(local))
  const [setor, setSetor] = useState(local.setor || (setorDoLocal(local) === 'Outros' ? '' : setorDoLocal(local)))
  const mudou = nome.trim() !== rotuloDoLocal(local) || setor.trim() !== (local.setor || (setorDoLocal(local) === 'Outros' ? '' : setorDoLocal(local)))
  const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, background: 'var(--portal-bg-secondary)' }}>
      <label style={lbl}>Setor<CampoSetor valor={setor} onChange={setSetor} setores={setores} /></label>
      <label style={lbl}>Nome do lugar<input value={nome} onChange={(e) => setNome(e.target.value.slice(0, 60))} style={campoTexto} /></label>
      {mudou && nome.trim() && (
        <button type="button" onClick={() => onSalvar(nome.replace(/\s+/g, ' ').trim(), setor.replace(/\s+/g, ' ').trim())}
          style={{ height: 34, borderRadius: 8, border: 'none', background: VERMELHO, color: '#fefefe', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>
          Salvar como &ldquo;{setor.trim() ? `${setor.trim()} · ${nome.trim()}` : nome.trim()}&rdquo;
        </button>
      )}
    </div>
  )
}

/** Janela do lugar desenhado: dentro de uma área pergunta se fica DENTRO daquele setor. */
function JanelaNovoLugar({ pedido, setores, foraDoMapa, mobile, onConfirmar, onFechar, onErro }: {
  pedido: PedidoLugar
  setores: string[]
  foraDoMapa: Local[]
  mobile: boolean
  onConfirmar: (e: { existente: string } | { nome: string; setor: string }) => Promise<void>
  onFechar: () => void
  onErro: (m: string) => void
}) {
  const area = pedido.area?.nome || ''
  // dentro de uma área: primeiro a pergunta; respondeu "sim" → setor = a área
  const [resposta, setResposta] = useState<'sim' | 'nao' | null>(area ? null : 'nao')
  const [setor, setSetor] = useState('')
  const [nome, setNome] = useState('')
  const [existente, setExistente] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const setorFinal = (resposta === 'sim' ? area : setor).replace(/\s+/g, ' ').trim()
  const pronto = !!existente || !!nome.trim()

  const confirmar = async () => {
    if (!pronto || salvando) return
    setSalvando(true); setFalha(null)
    try {
      await onConfirmar(existente ? { existente } : { nome: nome.replace(/\s+/g, ' ').trim(), setor: setorFinal })
    } catch (e) {
      const m = mensagemErro(e)
      setFalha(m); onErro(m)
    } finally { setSalvando(false) }
  }
  const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text-secondary)' }

  return (
    <Janela titulo="Lugar novo no mapa" mobile={mobile} onFechar={onFechar}>
      {resposta === null ? (
        <>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--portal-text)', lineHeight: 1.5 }}>
            Você desenhou dentro de <b>{area}</b>. Quer mesmo adicionar um local <b>dentro do setor {area}</b>?
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--portal-text-muted)' }}>Ex.: &ldquo;Banheiro&rdquo; aqui vira <b>{area} · Banheiro</b> na lista e no mapa.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setResposta('sim')} style={botaoJanela(true)}>Sim, dentro de {area}</button>
            <button type="button" onClick={() => setResposta('nao')} style={botaoJanela(false)}>Não, escolher outro setor</button>
            <button type="button" onClick={onFechar} style={{ ...botaoJanela(false), border: 'none' }}>Cancelar</button>
          </div>
        </>
      ) : (
        <>
          {resposta === 'sim'
            ? <div style={{ fontSize: 13.5, color: 'var(--portal-text-secondary)' }}>Setor: <b style={{ color: 'var(--portal-text)' }}>{area}</b> <button type="button" onClick={() => setResposta('nao')} style={{ border: 'none', background: 'none', color: VERMELHO, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>trocar</button></div>
            : <label style={lbl}>Fica dentro de qual setor?<CampoSetor valor={setor} onChange={setSetor} setores={setores} /></label>}
          <label style={lbl}>
            Nome do lugar
            <input value={nome} autoFocus disabled={!!existente} onChange={(e) => setNome(e.target.value.slice(0, 60))} placeholder="Ex.: Banheiro, Copa, Sala do gerente"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar() } }} style={{ ...campoTexto, opacity: existente ? 0.5 : 1 }} />
          </label>
          {nome.trim() && !existente && (
            <div style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>Vai aparecer como <b style={{ color: 'var(--portal-text)' }}>{setorFinal ? `${setorFinal} · ${nome.trim()}` : nome.trim()}</b></div>
          )}
          {foraDoMapa.length > 0 && (
            <label style={lbl}>
              Ou é um lugar que já existe (ainda fora do mapa)?
              <select value={existente} onChange={(e) => setExistente(e.target.value)} style={{ ...campoSelect, height: 38 }}>
                <option value="">Não, é um lugar novo</option>
                {agruparLocais(foraDoMapa).map((g) => (
                  <optgroup key={g.titulo} label={g.titulo}>
                    {g.itens.map(({ local: l, rotulo }) => <option key={l.id} value={l.id}>{rotulo}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          {falha && <div style={{ fontSize: 13, color: '#B91C1C' }}>{falha}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={!pronto || salvando} onClick={confirmar} style={{ ...botaoJanela(true), opacity: !pronto || salvando ? 0.5 : 1 }}>
              {salvando ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={15} />} {existente ? 'Pôr no mapa' : 'Adicionar lugar'}
            </button>
            <button type="button" onClick={onFechar} style={botaoJanela(false)}>Cancelar</button>
          </div>
        </>
      )}
    </Janela>
  )
}

/** Nome da área desenhada (Oficina, Peças, Escritório…). */
function JanelaNomeArea({ mobile, onConfirmar, onFechar }: { mobile: boolean; onConfirmar: (nome: string) => void; onFechar: () => void }) {
  const [nome, setNome] = useState('')
  const ok = () => { const n = nome.replace(/\s+/g, ' ').trim(); if (n) onConfirmar(n) }
  return (
    <Janela titulo="Área nova" mobile={mobile} onFechar={onFechar}>
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--portal-text-secondary)' }}>Áreas são os setores grandes do andar (Oficina, Peças, Escritório…). Os lugares desenhados dentro delas podem ficar naquele setor.</p>
      <input value={nome} autoFocus onChange={(e) => setNome(e.target.value.slice(0, 40))} placeholder="Nome da área" style={campoTexto}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ok() } }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={!nome.trim()} onClick={ok} style={{ ...botaoJanela(true), opacity: nome.trim() ? 1 : 0.5 }}><Plus size={15} /> Criar área</button>
        <button type="button" onClick={onFechar} style={botaoJanela(false)}>Cancelar</button>
      </div>
    </Janela>
  )
}

function Janela({ titulo, mobile, onFechar, children }: { titulo: string; mobile: boolean; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 10050 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo} style={{
        background: 'var(--portal-bg-card)', borderRadius: mobile ? '16px 16px 0 0' : 14, width: '100%', maxWidth: mobile ? '100%' : 460, maxHeight: '92vh', overflow: 'auto', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--portal-border)' }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: 'var(--portal-text)' }}>{titulo}</span>
          <button type="button" aria-label="Fechar" onClick={onFechar} style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'var(--portal-bg-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      </div>
    </div>
  )
}

const botaoJanela = (principal: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 9, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800, cursor: 'pointer',
  border: principal ? 'none' : '1px solid var(--portal-border)', background: principal ? VERMELHO : 'var(--portal-bg-card)', color: principal ? '#fefefe' : 'var(--portal-text-secondary)',
})

/** Largura/altura/posição em % da planta, para acertar na medida (ex.: alargar o Showroom).
 *  Grava ao sair do campo ou com Enter; valores fora da planta são ajustados. */
function CamposMedidas({ r, onSalvar, min }: { r: Retangulo; onSalvar: (r: Retangulo) => void; min?: number }) {
  const [v, setV] = useState({ w: String(r.w), h: String(r.h), x: String(r.x), y: String(r.y) })
  const gravar = () => {
    const n = (s: string, padrao: number) => { const x = Number(s.replace(',', '.')); return Number.isFinite(x) ? x : padrao }
    const novo = limitarRet({ w: n(v.w, r.w), h: n(v.h, r.h), x: n(v.x, r.x), y: n(v.y, r.y) }, min)
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
