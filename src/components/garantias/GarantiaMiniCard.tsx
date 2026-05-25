'use client';
import { Package, AlertTriangle, Clock, Factory } from 'lucide-react';
import type { GarantiaResumo } from '@/lib/garantias/types';
import { STATUS_LABEL, STATUS_COR } from '@/lib/garantias/constants';
import { tempoDecorrido, diasEntre } from '@/lib/garantias/format';

interface Props {
  garantia: GarantiaResumo;
  onClick: () => void;
}

export default function GarantiaMiniCard({ garantia: g, onClick }: Props) {
  const pendenciaAberta = g.pendencias?.some((p) => p.status === 'aberta');
  const naFabrica = g.status === 'enviada' || g.status === 'info_pendente';
  const diasFabrica = naFabrica ? diasEntre(g.enviada_fabrica_em) : null;

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--portal-bg-card)',
        border: '1px solid var(--portal-border)',
        borderLeft: `4px solid ${STATUS_COR[g.status]}`,
        borderRadius: 10,
        padding: 12,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>{g.numero}</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            color: STATUS_COR[g.status],
            background: STATUS_COR[g.status] + '1c',
            padding: '3px 7px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
          }}
        >
          {STATUS_LABEL[g.status]}
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--portal-text)', fontWeight: 600, lineHeight: 1.3 }}>
        {g.cliente || 'Cliente não informado'}
      </div>

      <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', display: 'flex', flexWrap: 'wrap', gap: '2px 8px' }}>
        <span>OS {g.id_ordem}</span>
        {g.chassis && <span>· {g.chassis}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {g.montadora && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: g.montadora.cor || 'var(--portal-text-secondary)', fontWeight: 600 }}>
            <Factory size={12} /> {g.montadora.nome}
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--portal-text-muted)' }}>
          <Package size={12} /> {g.pecas?.length || 0} peça(s)
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--portal-text-faint)' }}>
          <Clock size={11} />
          {naFabrica && diasFabrica != null
            ? `${diasFabrica}d na fábrica`
            : `Aberta ${tempoDecorrido(g.created_at)}`}
        </span>
        {pendenciaAberta && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>
            <AlertTriangle size={11} /> Aguardando técnico
          </span>
        )}
      </div>
    </div>
  );
}
