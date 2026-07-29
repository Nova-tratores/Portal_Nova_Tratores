'use client';
import { useMemo } from 'react';
import type { GarantiaResumo, GarantiaStatus } from '@/lib/garantias/types';
import { STATUS_LABEL, STATUS_COR } from '@/lib/garantias/constants';
import GarantiaMiniCard from './GarantiaMiniCard';
import { useIsMobile } from '@/hooks/useIsMobile';

const COLUNAS: GarantiaStatus[] = [
  'aberta', 'em_analise', 'bo_tecnico', 'enviada', 'info_pendente',
  'aguardando_servico', 'ressarcimento_fabrica',
];
// Fases do fluxo duas_etapas: só aparecem quando têm card (o board não alarga
// pra quem só usa montadoras de fluxo padrão).
const COLUNAS_CONDICIONAIS: GarantiaStatus[] = ['aguardando_servico', 'ressarcimento_fabrica'];

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
      if (map[g.status]) map[g.status].push(g);
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
              background: STATUS_COR[col] + '14',
              borderBottom: `2px solid ${STATUS_COR[col]}`,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COR[col], textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {STATUS_LABEL[col]}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COR[col], background: 'var(--portal-bg-card)', borderRadius: 10, padding: '1px 8px' }}>
              {porColuna[col].length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
