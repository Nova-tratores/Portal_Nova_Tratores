'use client';
// Botão "Retiradas" da topbar do PPV: abre a fila de rastreio de unidades
// (/ppv/unidades) com badge do total aguardando liberação.
import { useEffect, useState } from 'react';
import { authHeaders } from '@/lib/auth/client';

export default function BotaoRetiradas() {
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/pecas/unidades?status=retirada_pendente&count=1', { headers: await authHeaders() });
        const j = await r.json();
        if (r.ok) setPendentes(j.total || 0);
      } catch { /* badge fica em 0 */ }
    })();
  }, []);

  return (
    <button
      className="ppv-topbar-nav-btn"
      onClick={() => { window.location.href = '/ppv/unidades'; }}
      title="Rastreio de unidades (QR): fila de retiradas pra liberar"
      style={{ position: 'relative' }}
    >
      <i className="fas fa-qrcode" /> Retiradas
      {pendentes > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 999,
          background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 800,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
        }}>{pendentes > 99 ? '99+' : pendentes}</span>
      )}
    </button>
  );
}
