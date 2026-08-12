'use client';
// Card read-only dentro da OS (Pós-Vendas): unidades RASTREADAS (QR) retiradas
// pra esta OS — código, status e quem pegou. Some quando não há nenhuma.
import { useEffect, useState } from 'react';
import { QrCode } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { STATUS_LABEL, STATUS_COR, type PecaUnidade } from '@/lib/pecas/unidades';

export default function OSUnidadesInfo({ osId }: { osId: string }) {
  const [unidades, setUnidades] = useState<PecaUnidade[]>([]);
  const [carregou, setCarregou] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(`/api/pecas/unidades?destino_os=${encodeURIComponent(osId)}&limit=50`, { headers: await authHeaders() });
        const j = await r.json();
        if (!cancel && r.ok) setUnidades(j.unidades || []);
      } catch { /* ignora */ }
      finally { if (!cancel) setCarregou(true); }
    })();
    return () => { cancel = true; };
  }, [osId]);

  if (!carregou || unidades.length === 0) return null;

  return (
    <div className="os-card">
      <div className="os-card-title"><QrCode size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Peças rastreadas ({unidades.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {unidades.map(u => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexWrap: 'wrap' }}>
            <a href={`/p/${u.id}`} target="_blank" rel="noreferrer" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0ea5e9', textDecoration: 'none' }}>{u.numero}</a>
            <strong style={{ fontFamily: 'monospace', color: 'var(--portal-text, #0f172a)' }}>{u.codigo}</strong>
            <span style={{ flex: 1, minWidth: 120, color: 'var(--portal-text-secondary, #475569)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.descricao}</span>
            <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, color: '#fff', background: STATUS_COR[u.status] || '#64748b', whiteSpace: 'nowrap' }}>
              {STATUS_LABEL[u.status] || u.status}
            </span>
            {u.retirado_por_nome && <span style={{ fontSize: 11, color: 'var(--portal-text-muted, #94a3b8)' }}>{u.retirado_por_nome}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
