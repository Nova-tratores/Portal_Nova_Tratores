'use client';
import { useState, useEffect } from 'react';
import { ShieldCheck, ExternalLink } from 'lucide-react';
import type { GarantiaResumo } from '@/lib/garantias/types';
import { OS_BADGE_LABEL, STATUS_COR } from '@/lib/garantias/constants';
import { diasEntre } from '@/lib/garantias/format';

// Card read-only de garantia para exibir dentro da OS (Pós-Vendas).
export default function OSGarantiaInfo({ osId }: { osId: string }) {
  const [garantia, setGarantia] = useState<GarantiaResumo | null>(null);
  const [carregou, setCarregou] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`/api/garantias?os=${encodeURIComponent(osId)}`);
        const data = await res.json();
        const lista: GarantiaResumo[] = data.garantias || [];
        if (!cancel) setGarantia(lista[0] || null);
      } catch {
        /* ignora */
      } finally {
        if (!cancel) setCarregou(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [osId]);

  if (!carregou) return null;

  if (!garantia) {
    return (
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #94a3b8)' }}>
        Nenhuma garantia vinculada a esta OS.
      </div>
    );
  }

  const cor = STATUS_COR[garantia.status];
  const naFabrica = garantia.status === 'enviada' || garantia.status === 'info_pendente';

  return (
    <div
      style={{
        border: '1px solid var(--portal-border, #e5e7eb)',
        borderLeft: `4px solid ${cor}`,
        borderRadius: 10,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: 'var(--portal-bg-card, #fff)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <ShieldCheck size={15} color={cor} />
        <span style={{ fontSize: 13, fontWeight: 700, color: cor }}>
          {OS_BADGE_LABEL[garantia.status]}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--portal-text-secondary, #475569)' }}>
        {garantia.numero}
        {garantia.montadora ? ` · ${garantia.montadora.nome}` : ''}
        {` · ${garantia.pecas?.length || 0} peça(s)`}
        {naFabrica && garantia.enviada_fabrica_em
          ? ` · ${diasEntre(garantia.enviada_fabrica_em)}d na fábrica`
          : ''}
      </div>
      {garantia.status === 'aprovada' && (
        <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
          Pago em garantia: {garantia.garantista_horas || 0}h · {garantia.garantista_km || 0} km
          {garantia.valor_pago_pecas != null && garantia.valor_pago_pecas > 0
            ? ` · peças ${(garantia.valor_pago_pecas).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
            : ''}
        </div>
      )}
      <a
        href={`/garantias?id=${garantia.id}`}
        target="_blank"
        rel="noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#0ea5e9', fontWeight: 600 }}
      >
        <ExternalLink size={12} /> Abrir garantia
      </a>
    </div>
  );
}
