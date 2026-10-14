'use client'
// Peças S/Estoque: colunas do modo LISTA (filtro A→Z/Z→A no cabeçalho), o card
// do modo CARDS e os pedacinhos que os dois usam — SKU (código existente
// conferido no catálogo), locação no estoque e etiquetas (marcadores).

import { useMemo } from 'react'
import { AlertTriangle, Boxes, MapPin, Tag } from 'lucide-react'
import { camposFaltando, fmtData, skuDaPeca, fmtPreco, locacaoDoItem, nomeDoItem, temLocacao, textoAplicacao, textoAplicacoes, textoLocacao, textoLocal } from '@/lib/opa-pecas/regras'
import { ROTULO_QUALIDADE, ROTULO_STATUS, type Item, type Nomes, type ProdutoSku } from '@/lib/opa-pecas/tipos'
import { CodigoPeca, LARANJA, Miniatura, SeloEtiqueta, SeloQualidade, SeloStatus } from './comum'
import type { ColunaTabela } from './TabelaFiltravel'
import { chaveSku } from './useProdutosSku'

/** Locação que aparece para a peça: a dela; sem ela, a do SKU no estoque (sugestão). */
export function locacaoExibida(i: Item, skus: Record<string, ProdutoSku[]>): { texto: string; doSku: boolean } {
  const propria = locacaoDoItem(i)
  if (temLocacao(propria)) return { texto: textoLocacao(propria), doSku: false }
  const sku = skuDaPeca(i)
  const l = sku ? skus[chaveSku(sku)]?.find((p) => p.locacao)?.locacao : null
  return l ? { texto: textoLocacao(l), doSku: true } : { texto: '', doSku: false }
}

export function ChipsEtiquetas({ etiquetas, max = 4 }: { etiquetas?: string[] | null; max?: number }) {
  const lista = etiquetas || []
  if (!lista.length) return null
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      {lista.slice(0, max).map((t) => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#EEF2FF', color: '#3730A3', border: '1px solid #C7D2FE', whiteSpace: 'nowrap' }}>
          <Tag size={10} /> {t}
        </span>
      ))}
      {lista.length > max && <span title={lista.slice(max).join(', ')} style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>+{lista.length - max}</span>}
    </span>
  )
}

/** SKU da peça + se existe no catálogo (conta) — "fora do catálogo" quando não acha. */
export function CelulaSku({ item, skus }: { item: Item; skus: Record<string, ProdutoSku[]> }) {
  const sku = skuDaPeca(item)
  if (!sku) return <span style={{ color: 'var(--portal-text-muted)' }}>—</span>
  const achados = skus[chaveSku(sku)]
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5, color: 'var(--portal-text)' }}>{sku}</span>
      {item.codigo_correto && item.codigo_fabricante && item.codigo_correto !== item.codigo_fabricante && <span title="Embalagem errada: o código da embalagem é outro" style={{ fontSize: 10.5, color: '#B45309' }}>embalagem: {item.codigo_fabricante}</span>}
      {achados && (achados.length
        ? <span title={achados.map((p) => `${p.conta}: ${p.sku} — ${p.descricao || ''}`).join('\n')} style={{ fontSize: 10.5, fontWeight: 700, color: '#047857' }}>
            ✓ no catálogo · {[...new Set(achados.map((p) => p.conta))].join('/')}
          </span>
        : <span style={{ fontSize: 10.5, color: 'var(--portal-text-muted)' }}>fora do catálogo</span>)}
    </span>
  )
}

export function CelulaLocacao({ item, skus }: { item: Item; skus: Record<string, ProdutoSku[]> }) {
  const l = locacaoExibida(item, skus)
  if (!l.texto) return <span style={{ color: 'var(--portal-text-muted)' }}>—</span>
  return (
    <span title={l.doSku ? 'Locação do SKU no estoque — a peça ainda não foi destinada para lá' : 'Locação para onde a peça foi destinada'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', fontWeight: l.doSku ? 500 : 700, color: l.doSku ? 'var(--portal-text-muted)' : 'var(--portal-text)' }}>
      <Boxes size={12} style={{ flexShrink: 0, color: l.doSku ? 'var(--portal-text-muted)' : LARANJA }} /> {l.texto}
      {l.doSku && <span style={{ fontSize: 10.5, fontStyle: 'italic' }}>(do SKU)</span>}
    </span>
  )
}

function ChipIncompleto({ item }: { item: Item }) {
  const falta = camposFaltando(item)
  if (!falta.length) return null
  return (
    <span title={`Falta: ${falta.join(', ')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A', whiteSpace: 'nowrap' }}>
      <AlertTriangle size={11} /> incompleto
    </span>
  )
}

const muted = (s: string) => s || <span style={{ color: 'var(--portal-text-muted)' }}>—</span>

/** Colunas da lista de peças (memorizadas: a tabela recalcula filtros só quando muda algo). */
export function useColunasPecas({ nomes, skus, minis, usuarios }: {
  nomes: Nomes
  skus: Record<string, ProdutoSku[]>
  minis: Record<string, string>
  usuarios: Record<string, string>
}): ColunaTabela<Item>[] {
  return useMemo(() => [
    { chave: 'foto', titulo: '', semFiltro: true, semOrdem: true, ordem: () => null,
      render: (i) => <Miniatura url={i.fotos[0] ? minis[i.fotos[0].storage_path] : undefined} tamanho={42} /> },
    { chave: 'codigo', titulo: 'Código', ordem: (i) => i.codigo,
      render: (i) => <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}><CodigoPeca codigo={i.codigo} tamanho={12} /><SeloEtiqueta em={i.etiqueta_impressa_em} /></span> },
    { chave: 'descricao', titulo: 'Peça', maxLargura: 280, ordem: (i) => i.descricao || '',
      render: (i) => (
        <div style={{ minWidth: 160 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: i.descricao ? 'var(--portal-text)' : 'var(--portal-text-muted)' }}>{i.descricao || 'Sem descrição'}</div>
          <ChipIncompleto item={i} />
        </div>
      ) },
    { chave: 'sku', titulo: 'SKU', ordem: (i) => skuDaPeca(i) || '', render: (i) => <CelulaSku item={i} skus={skus} /> },
    { chave: 'locacao', titulo: 'Locação', ordem: (i) => locacaoExibida(i, skus).texto,
      valores: (i) => { const l = locacaoExibida(i, skus); return l.texto ? [l.doSku ? `${l.texto} (do SKU)` : l.texto] : [] },
      render: (i) => <CelulaLocacao item={i} skus={skus} /> },
    { chave: 'etiquetas', titulo: 'Etiquetas', ordem: (i) => (i.etiquetas || []).join(', '), valores: (i) => i.etiquetas || [],
      render: (i) => (i.etiquetas?.length ? <ChipsEtiquetas etiquetas={i.etiquetas} max={3} /> : muted('')) },
    { chave: 'aplicacao', titulo: 'Aplicação', maxLargura: 200, ordem: (i) => textoAplicacoes(i, nomes),
      valores: (i) => (i.nao_identificavel ? ['Não identificável'] : i.aplicacoes.map((a) => textoAplicacao(a, nomes))),
      render: (i) => <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>{muted(textoAplicacoes(i, nomes))}</span> },
    { chave: 'qualidade', titulo: 'Qualidade', ordem: (i) => ROTULO_QUALIDADE[i.qualidade], render: (i) => <SeloQualidade qualidade={i.qualidade} /> },
    { chave: 'qtd', titulo: 'Qtd', direita: true, ordem: (i) => i.quantidade, valores: (i) => [String(i.quantidade)],
      render: (i) => <b style={{ fontVariantNumeric: 'tabular-nums' }}>{i.quantidade}</b> },
    { chave: 'preco', titulo: 'Preço', direita: true, ordem: (i) => i.preco_sugerido, valores: (i) => (i.preco_sugerido == null ? [] : [fmtPreco(i.preco_sugerido)]),
      render: (i) => <span style={{ whiteSpace: 'nowrap', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: i.preco_sugerido != null ? 'var(--portal-text)' : 'var(--portal-text-muted)' }}>{fmtPreco(i.preco_sugerido)}</span> },
    { chave: 'local', titulo: 'Onde achou', maxLargura: 170, ordem: (i) => textoLocal(i, nomes.locais),
      render: (i) => { const t = textoLocal(i, nomes.locais); return t ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--portal-text-secondary)' }}><MapPin size={12} style={{ flexShrink: 0 }} /> {t}</span> : muted('') } },
    { chave: 'status', titulo: 'Situação', ordem: (i) => ROTULO_STATUS[i.status], render: (i) => <SeloStatus status={i.status} /> },
    { chave: 'criado', titulo: 'Captada', ordem: (i) => i.criado_em, valores: (i) => [fmtData(i.criado_em)],
      render: (i) => <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: 'var(--portal-text-secondary)' }}>{fmtData(i.criado_em)}</span> },
    { chave: 'por', titulo: 'Por', ordem: (i) => usuarios[i.criado_por] || '',
      render: (i) => <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: 'var(--portal-text-secondary)' }}>{muted(usuarios[i.criado_por] || '')}</span> },
  ], [nomes, skus, minis, usuarios])
}

/** Card do modo CARDS (também é o que aparece no celular). */
export function CardPeca({ item: i, nomes, skus, mini, marcado, onAbrir, onMarcar }: {
  item: Item; nomes: Nomes; skus: Record<string, ProdutoSku[]>; mini?: string; marcado: boolean; onAbrir: () => void; onMarcar: () => void
}) {
  const loc = locacaoExibida(i, skus)
  return (
    <div onClick={onAbrir} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 14, cursor: 'pointer', background: marcado ? '#FFF7ED' : 'var(--portal-bg-card)', border: `1px solid ${marcado ? '#FED7AA' : 'var(--portal-border)'}`, boxShadow: '0 1px 2px rgba(16,24,40,0.04)', minWidth: 0 }}>
      <Miniatura url={mini} tamanho={64} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <CodigoPeca codigo={i.codigo} tamanho={14} />
          <SeloStatus status={i.status} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: i.descricao ? 'var(--portal-text)' : 'var(--portal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 4 }}>{i.descricao || 'Sem descrição'}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 5, fontSize: 12, color: 'var(--portal-text-muted)' }}>
          <span style={{ fontWeight: 700, color: 'var(--portal-text-secondary)' }}>{i.quantidade} un.</span>
          {i.preco_sugerido != null && <span style={{ fontWeight: 700, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{fmtPreco(i.preco_sugerido)}</span>}
          <SeloQualidade qualidade={i.qualidade} />
          {skuDaPeca(i) && <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--portal-text-secondary)' }}>SKU {skuDaPeca(i)}</span>}
          {loc.texto && <CelulaLocacao item={i} skus={skus} />}
          {i.local_id && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={11} /> {textoLocal(i, nomes.locais)}</span>}
          <SeloEtiqueta em={i.etiqueta_impressa_em} />
          <ChipIncompleto item={i} />
        </div>
        {!!i.etiquetas?.length && <div style={{ marginTop: 6 }}><ChipsEtiquetas etiquetas={i.etiquetas} /></div>}
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
        <input type="checkbox" checked={marcado} onChange={onMarcar} aria-label={`Marcar ${nomeDoItem(i.codigo)}`} style={{ width: 20, height: 20, accentColor: LARANJA }} />
      </div>
    </div>
  )
}
