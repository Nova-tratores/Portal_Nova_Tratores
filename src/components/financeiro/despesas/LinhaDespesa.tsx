'use client'
// Uma despesa. Cinco coisas na linha: categoria, fornecedor, método, NF e
// valor — mais o selo do Omie. Todo o resto (id, motivo, quem lançou, parcelas,
// código do lançamento e os anexos) fica na expansão.
//
// É essa dieta que resolve a densidade da tela antiga: lá são 3+ ícones de
// documento em cada linha, e a soma disso é o que faz a tabela parecer um muro.
//
// Onde a referência do usuário mostra a HORA, aqui vai a NF: não existe hora de
// pagamento nos dados, e é melhor mostrar a identidade real do documento do que
// inventar um campo.

import { useState } from 'react'
import { Check, ChevronDown, Copy, Download, ExternalLink, Eye, FileText, Tag } from 'lucide-react'
import Link from 'next/link'
import { corDaCategoria } from '@/lib/charts/paleta'
import { useChartTheme } from '@/lib/charts/useChartTheme'
import { SEM_CATEGORIA } from '@/lib/financeiro/despesas/categorias'
import { anexosDaDespesa, type TipoAnexo } from '@/lib/financeiro/despesas/anexos'
import { codigosLancamento, ROTULO_PARCELA, urlOmieFinanceiro } from '@/lib/financeiro/despesas/omie'
import { formatarDataBR, formatarMoeda } from '@/lib/financeiro/utils'
import type { Despesa, EstadoParcela } from '@/lib/financeiro/despesas/tipos'
import type { LogDespesa } from '@/lib/financeiro/despesas/logs'
import { ListaLogs } from './LogAlteracoes'
import SeloOmie from './SeloOmie'

// Atrasada em vermelho porque pede ação; cancelada em cinza porque é ruído
// histórico; a vencer neutra — nem boa nem má notícia.
const CORES_PARCELA: Record<EstadoParcela, { fg: string; bg: string; borda: string }> = {
  paga: { fg: '#15803d', bg: 'rgba(22,163,74,.10)', borda: 'rgba(22,163,74,.28)' },
  a_vencer: { fg: 'var(--portal-text-secondary)', bg: 'var(--portal-bg-secondary)', borda: 'var(--portal-border)' },
  atrasada: { fg: '#b91c1c', bg: 'rgba(220,38,38,.10)', borda: 'rgba(220,38,38,.32)' },
  cancelada: { fg: 'var(--portal-text-muted)', bg: 'transparent', borda: 'var(--portal-border)' },
}

const ICONE_ANEXO: Record<TipoAnexo, React.ReactNode> = {
  nf: <FileText size={13} />,
  boleto: <Download size={13} />,
  requisicao: <Eye size={13} />,
  comprovante: <Download size={13} />,
}

const chip = {
  display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
  fontSize: 10.5, fontWeight: 600, lineHeight: 1, padding: '4px 8px',
  borderRadius: 20, whiteSpace: 'nowrap' as const,
}

export default function LinhaDespesa({ d, mapaCores, logs = [], onClassificar, onFiltrarCategoria }: {
  d: Despesa
  mapaCores?: Map<string, number>
  logs?: LogDespesa[]
  onClassificar?: (d: Despesa) => void
  onFiltrarCategoria?: (categoria: string) => void
}) {
  const [aberta, setAberta] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const t = useChartTheme()
  const semCategoria = d.categoria === SEM_CATEGORIA
  const corCat = semCategoria ? 'var(--portal-text-muted)' : corDaCategoria(d.categoria, t.modo, mapaCores)
  // as colunas de anexo são CSV: um link por arquivo, nomeado pelo que ele é
  const anexos = anexosDaDespesa(d)
  const codigos = codigosLancamento(d)
  const urlOmie = urlOmieFinanceiro(d.omie_empresa)
  const copiar = (txt: string | null) => {
    if (!txt) return
    navigator.clipboard?.writeText(txt)
      .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1600) })
      .catch(() => { /* sem permissão de área de transferência: o número está à vista */ })
  }

  return (
    <div style={{ borderTop: '1px solid var(--portal-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', flexWrap: 'wrap' }}>
        {/* categoria: ponto colorido + texto, nunca só a cor */}
        <button
          onClick={semCategoria ? () => onClassificar?.(d) : () => onFiltrarCategoria?.(d.categoria)}
          title={semCategoria ? 'Classificar esta despesa' : `Filtrar por ${d.categoria}`}
          style={{
            ...chip, border: `1px solid ${semCategoria ? 'var(--portal-border)' : corCat}`,
            background: semCategoria ? 'var(--portal-bg-secondary)' : 'transparent',
            color: semCategoria ? 'var(--portal-text-muted)' : 'var(--portal-text)',
            cursor: 'pointer', font: 'inherit', maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {semCategoria
            ? <Tag size={11} />
            : <span style={{ width: 7, height: 7, borderRadius: 99, background: corCat, flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {semCategoria ? 'Classificar' : d.categoria}
          </span>
        </button>

        <span style={{
          flex: '1 1 190px', minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--portal-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {d.fornecedorRotulo}
        </span>

        <span style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', whiteSpace: 'nowrap' }}>
          {d.metodo || '—'}
          {(d.qtd_parcelas || 0) > 1 && (
            <strong style={{ color: '#0284c7', marginLeft: 4 }}>{d.qtd_parcelas}x</strong>
          )}
        </span>

        {/* parcelado: quantas já saíram, sem abrir nada. Verde só quando TODAS
            foram pagas — meio-caminho em verde faria alguém dar a conta por
            encerrada antes da hora. */}
        {d.parcelas.length > 1 && (
          <span
            title={d.parcelas.map((p) => `${p.numero}: ${ROTULO_PARCELA[p.estado]}`).join(' · ')}
            style={{
              ...chip, border: '1px solid', whiteSpace: 'nowrap',
              borderColor: d.parcelasPagas === d.parcelas.length ? 'rgba(22,163,74,.35)' : 'var(--portal-border)',
              background: d.parcelasPagas === d.parcelas.length ? 'rgba(22,163,74,.10)' : 'var(--portal-bg-secondary)',
              color: d.parcelasPagas === d.parcelas.length ? '#15803d' : 'var(--portal-text-secondary)',
            }}
          >
            {d.parcelasPagas}/{d.parcelas.length} pagas
          </span>
        )}

        <span style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', whiteSpace: 'nowrap' }}>
          {d.numero_NF ? `NF ${d.numero_NF}` : 'sem NF'}
        </span>

        {/* com texto, não só ícone: um círculo verde sozinho não diz O QUÊ está
            certo, e a pergunta "isso já foi pro Omie?" tem que ser respondida
            de relance, sem abrir a linha */}
        <SeloOmie situacao={d.situacaoOmie} codigo={codigos[0]} />

        <span style={{
          fontSize: 14, fontWeight: 700, color: 'var(--portal-text)',
          fontVariantNumeric: 'tabular-nums', minWidth: 108, textAlign: 'right',
        }}>
          {formatarMoeda(d.valorNum)}
        </span>

        <button
          onClick={() => setAberta((v) => !v)}
          title={aberta ? 'Fechar' : 'Ver detalhes e anexos'}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)', padding: 2, display: 'flex' }}
        >
          <ChevronDown size={16} style={{ transform: aberta ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>
      </div>

      {aberta && (
        <div style={{
          padding: '10px 12px 14px', margin: '0 0 8px', borderRadius: 10,
          background: 'var(--portal-bg-secondary)', fontSize: 12.5, color: 'var(--portal-text-secondary)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <span>Despesa <strong style={{ color: 'var(--portal-text)' }}>#{d.id}</strong></span>
            <span>Vencimento <strong style={{ color: 'var(--portal-text)' }}>{formatarDataBR(d.data_vencimento)}</strong></span>
            {d.criado_por && <span>Lançado por <strong style={{ color: 'var(--portal-text)' }}>{d.criado_por}</strong></span>}
            {d.omie_empresa && <span>Empresa <strong style={{ color: 'var(--portal-text)' }}>{d.omie_empresa}</strong></span>}
          </div>

          {/* Bloco do Omie: o que serve pra ACHAR o título lá é o número do
              documento (e a parcela), não o código de lançamento — este último
              é chave interna e fica escondido, só como último recurso. */}
          {d.situacaoOmie === 'enviado' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '8px 10px', borderRadius: 9,
              background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
            }}>
              <SeloOmie situacao="enviado" codigo={codigos[0]} />
              {d.numeroDocumento ? (
                <>
                  <span>
                    Documento nº <strong style={{ color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{d.numeroDocumento}</strong>
                    {d.numeroParcela && <> · parcela <strong style={{ color: 'var(--portal-text)' }}>{d.numeroParcela}</strong></>}
                  </span>
                  <button
                    onClick={() => copiar(d.numeroDocumento)}
                    style={{
                      ...chip, cursor: 'pointer', font: 'inherit',
                      border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)',
                    }}
                  >
                    {copiado ? <Check size={12} /> : <Copy size={12} />} {copiado ? 'Copiado' : 'Copiar nº'}
                  </button>
                  {/* copia E abre: o Omie não aceita link por título, então o
                      máximo é cair no financeiro da empresa certa com o número
                      na área de transferência, pronto pra colar na busca */}
                  {urlOmie && (
                    <a
                      href={urlOmie} target="_blank" rel="noopener noreferrer"
                      onClick={() => copiar(d.numeroDocumento)}
                      title="Abre o financeiro do Omie desta empresa e copia o número — é só colar na busca"
                      style={{
                        ...chip, textDecoration: 'none',
                        border: '1px solid #bfdbfe', background: 'rgba(37,99,235,.06)', color: '#1d4ed8',
                      }}
                    >
                      <ExternalLink size={12} /> Ver no Omie
                    </a>
                  )}
                </>
              ) : (
                <span>
                  Este título foi para o Omie <strong style={{ color: 'var(--portal-text)' }}>sem número de documento</strong> —
                  {' '}procure por fornecedor e valor. Lançamento {codigos.join(', ')}.
                </span>
              )}
            </div>
          )}

          {d.motivo && <div style={{ lineHeight: 1.5 }}>{d.motivo}</div>}

          {/* Trocar categoria de uma despesa JÁ classificada. Fica aqui, e não
              no chip da linha, porque o chip é filtro — o clique frequente é
              "ver só esta categoria", não "reclassificar". */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>
              Categoria: <strong style={{ color: 'var(--portal-text)' }}>{d.categoria}</strong>
              {d.omie_categoria && <span style={{ color: 'var(--portal-text-muted)' }}> ({d.omie_categoria})</span>}
            </span>
            <button
              onClick={() => onClassificar?.(d)}
              style={{
                ...chip, cursor: 'pointer', font: 'inherit',
                border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)',
              }}
            >
              <Tag size={12} /> {semCategoria ? 'Classificar' : 'Alterar categoria'}
            </button>
          </div>

          {/* Parcelas com estado de pagamento — é o que evita abrir o Omie só
              pra saber se a 2ª já saiu. Vem do espelho do Omie, então é o que
              ELE diz, não o que o portal supõe. */}
          {d.parcelas.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11.5 }}>
                Parcelado em {d.parcelas.length}x — na lista o valor aparece inteiro no vencimento da 1ª.
              </div>
              {d.parcelas.map((p) => {
                const e = CORES_PARCELA[p.estado]
                return (
                  <div key={p.codigoLancamento} style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    padding: '5px 9px', borderRadius: 8, background: 'var(--portal-bg-card)',
                    border: '1px solid var(--portal-border)', fontSize: 12,
                  }}>
                    <strong style={{ color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums', minWidth: 54 }}>{p.numero}</strong>
                    <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 88 }}>{formatarMoeda(p.valor)}</span>
                    <span style={{ color: 'var(--portal-text-muted)' }}>venc. {formatarDataBR(p.vencimento)}</span>
                    <span style={{ ...chip, color: e.fg, background: e.bg, border: `1px solid ${e.borda}` }}>
                      {ROTULO_PARCELA[p.estado]}
                    </span>
                    {p.pagamento && (
                      <span style={{ color: 'var(--portal-text-muted)' }}>em {formatarDataBR(p.pagamento)}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* parcela única: dizer se saiu também é informação — só não merece
              uma lista de um item */}
          {d.parcelas.length === 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{
                ...chip, color: CORES_PARCELA[d.parcelas[0].estado].fg,
                background: CORES_PARCELA[d.parcelas[0].estado].bg,
                border: `1px solid ${CORES_PARCELA[d.parcelas[0].estado].borda}`,
              }}>
                {ROTULO_PARCELA[d.parcelas[0].estado]}
              </span>
              {d.parcelas[0].pagamento && <span>Pago em <strong style={{ color: 'var(--portal-text)' }}>{formatarDataBR(d.parcelas[0].pagamento)}</strong></span>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {anexos.map((a) => (
              <Anexo key={a.url} href={a.url} icone={ICONE_ANEXO[a.tipo]} rotulo={a.rotulo} />
            ))}
            {d.numero_NF && (
              <Link
                href={`/financeiro/rastreio?q=${encodeURIComponent(d.numero_NF)}`}
                style={{ ...chip, border: '1px solid #bfdbfe', color: '#1d4ed8', background: 'rgba(37,99,235,.06)', textDecoration: 'none' }}
              >
                <ExternalLink size={12} /> Rastrear documento
              </Link>
            )}
            {anexos.length === 0 && (
              <span style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>Sem anexos.</span>
            )}
          </div>

          {/* histórico: só aparece se esta despesa foi mesmo alterada — linha
              dizendo "nenhuma alteração" em toda despesa seria ruído */}
          {logs.length > 0 && (
            <div style={{ paddingTop: 8, borderTop: '1px dashed var(--portal-border)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--portal-text-muted)', marginBottom: 5 }}>
                Alterações
              </div>
              <ListaLogs logs={logs} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Anexo({ href, icone, rotulo }: { href: string; icone: React.ReactNode; rotulo: string }) {
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      style={{
        ...chip, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)',
        color: 'var(--portal-text)', textDecoration: 'none',
      }}
    >
      {icone} {rotulo}
    </a>
  )
}
