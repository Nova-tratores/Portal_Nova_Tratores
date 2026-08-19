'use client';
import { useMemo } from 'react';
import type { GarantiaResumo, GarantiaStatus } from '@/lib/garantias/types';
import { STATUS_LABEL, STATUS_COR } from '@/lib/garantias/constants';
import GarantiaMiniCard from './GarantiaMiniCard';
import { useIsMobile } from '@/hooks/useIsMobile';

// 'devolucao_pecas' é coluna VIRTUAL (não é status): garantias APROVADAS com
// devolução das peças à fábrica pendente (prova de destruição).
type Coluna = GarantiaStatus | 'devolucao_pecas';

const COLUNAS: Coluna[] = [
  'aberta', 'em_analise', 'bo_tecnico', 'enviada', 'info_pendente',
  'aguardando_servico', 'ressarcimento_fabrica', 'devolucao_pecas',
];
// Fases que só aparecem quando têm card (o board não alarga pra quem não usa).
const COLUNAS_CONDICIONAIS: Coluna[] = ['aguardando_servico', 'ressarcimento_fabrica', 'devolucao_pecas'];

const COL_LABEL: Record<Coluna, string> = { ...STATUS_LABEL, devolucao_pecas: 'Devolução de peças' };
const COL_COR: Record<Coluna, string> = { ...STATUS_COR, devolucao_pecas: '#b45309' };

interface Props {
  garantias: GarantiaResumo[];
  onCardClick: (g: GarantiaResumo) => void;
}

export default function GarantiasBoard({ garantias, onCardClick }: Props) {
  const isMobile = useIsMobile();
  const porColuna = useMemo(() => {
    const map: Record<string, GarantiaResumo[]> = {};
    for (const col of COLUNAS) map[col] = [];
    for (const g of garantias) {
      // Aprovada com devolução pendente vai pra coluna virtual (sem isso ela
      // sumiria do board em silêncio — 'aprovada' não tem coluna própria)
      const col = g.status === 'aprovada' && g.devolucao_status === 'pendente' ? 'devolucao_pecas' : g.status;
      if (map[col]) map[col].push(g);
    }
    return map;
  }, [garantias]);

  const colunasVisiveis = COLUNAS.filter(
    (col) => !COLUNAS_CONDICIONAIS.includes(col) || porColuna[col].length > 0
  ).filter(
    // No celular esconde colunas vazias (empilhado, cada coluna vira uma seção).
    (col) => !isMobile || porColuna[col].length > 0
  );

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, overflowX: isMobile ? 'visible' : 'auto', paddingBottom: 8 }}>
      {colunasVisiveis.map((col) => (
        <div
          key={col}
          style={{
            flex: isMobile ? '1 1 auto' : '1 0 240px',
            minWidth: isMobile ? 0 : 240,
            width: isMobile ? '100%' : undefined,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: 8,
              background: COL_COR[col] + '14',
              borderBottom: `2px solid ${COL_COR[col]}`,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: COL_COR[col], textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {COL_LABEL[col]}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COL_COR[col], background: 'var(--portal-bg-card)', borderRadius: 10, padding: '1px 8px' }}>
              {porColuna[col].length}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              // Coluna cheia (ex.: 19 na fábrica) rola POR DENTRO — sem isso a
              // página estica e a rolagem horizontal do board fica lá embaixo.
              maxHeight: isMobile ? undefined : 'max(320px, calc(100vh - 330px))',
              overflowY: isMobile ? undefined : 'auto',
              paddingRight: isMobile ? 0 : 2,
            }}
          >
            {porColuna[col].length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--portal-text-faint)', textAlign: 'center', padding: '16px 0' }}>
                Vazio
              </div>
            ) : (
              porColuna[col].map((g) => (
                <GarantiaMiniCard key={g.id} garantia={g} onClick={() => onCardClick(g)} />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
