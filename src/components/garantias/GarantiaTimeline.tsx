'use client';
import type { GarantiaEvento } from '@/lib/garantias/types';
import { fmtDataHora } from '@/lib/garantias/format';

const COR_EVENTO: Record<string, string> = {
  criada: '#0ea5e9',
  em_analise: '#6366f1',
  checklist_salvo: '#6366f1',
  bo_aberta: '#f59e0b',
  bo_respondida: '#16a34a',
  enviada_fabrica: '#8b5cf6',
  info_pendente: '#f97316',
  info_respondida: '#16a34a',
  retorno_fabrica: '#8b5cf6',
  aprovada: '#16a34a',
  rejeitada: '#dc2626',
};

interface Props {
  eventos: GarantiaEvento[];
}

export default function GarantiaTimeline({ eventos }: Props) {
  if (!eventos || eventos.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Nenhum evento registrado.</div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {eventos.map((ev, i) => {
        const cor = COR_EVENTO[ev.tipo] || 'var(--portal-text-muted)';
        return (
          <div key={ev.id} style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: cor, marginTop: 4, flexShrink: 0 }} />
              {i < eventos.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--portal-border)' }} />}
            </div>
            <div style={{ paddingBottom: 14, flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--portal-text)', fontWeight: 600 }}>
                {ev.detalhe || ev.tipo}
              </div>
              <div style={{ fontSize: 11, color: 'var(--portal-text-faint)', marginTop: 2 }}>
                {ev.ator || 'Sistema'} · {fmtDataHora(ev.created_at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
