'use client';
// Card dentro do PPVDrawer: unidades RASTREADAS (QR) vinculadas a este pedido
// — número, código, preço de venda, status e quem pegou. Quando o PPV está
// faturado/terminal, mostra também a CONFERÊNCIA liberado × faturado
// (divergências: liberada sem NF / faturado sem liberação). Some quando vazio.
import { useEffect, useState } from 'react';
import { QrCode } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { STATUS_LABEL, STATUS_COR, type PecaUnidade } from '@/lib/pecas/unidades';

interface ConfLinha {
  codigo: string;
  saldo: number;
  liberadas: number;
  aplicadas: number;
  reservadas: number;
  flags: string[];
}
interface Conferencia { faturado: boolean; terminal: boolean; linhas: ConfLinha[] }

const FLAG_TXT: Record<string, string> = {
  liberada_nao_faturada: 'liberada sem NF',
  faturada_sem_liberacao: 'faturado sem liberação',
  rastreio_excedente: 'mais unidades que saldo',
};

export default function PPVUnidadesInfo({ ppvId, verificarConferencia }: { ppvId: string; verificarConferencia: boolean }) {
  const [unidades, setUnidades] = useState<PecaUnidade[]>([]);
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [carregou, setCarregou] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(`/api/pecas/unidades?destino_ppv=${encodeURIComponent(ppvId)}&limit=100`, { headers: await authHeaders() });
        const j = await r.json();
        if (!cancel && r.ok) setUnidades(j.unidades || []);
      } catch { /* ignora */ }
      finally { if (!cancel) setCarregou(true); }
      if (verificarConferencia) {
        try {
          const r = await fetch(`/api/ppv/pedidos/conferencia?id=${encodeURIComponent(ppvId)}`, { headers: await authHeaders() });
          const j = await r.json();
          if (!cancel && r.ok) setConf(j);
        } catch { /* sem conferência, o card ainda vale */ }
      }
    })();
    return () => { cancel = true; };
  }, [ppvId, verificarConferencia]);

  if (!carregou || unidades.length === 0) return null;

  const divergentes = (conf?.linhas || []).filter(l =>
    l.flags.includes('liberada_nao_faturada') || l.flags.includes('faturada_sem_liberacao') || l.flags.includes('rastreio_excedente'));

  return (
    <div style={{ border: '1px solid var(--ppv-border, #E2E8F0)', borderRadius: 12, padding: '14px 16px', marginTop: 14, background: 'var(--ppv-card, #fff)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ppv-text, #0f172a)', marginBottom: 10 }}>
        <QrCode size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Peças rastreadas ({unidades.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {unidades.map(u => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexWrap: 'wrap' }}>
            <a href={`/p/${u.id}`} target="_blank" rel="noreferrer" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0ea5e9', textDecoration: 'none' }}>{u.numero}</a>
            <strong style={{ fontFamily: 'monospace', color: 'var(--ppv-text, #0f172a)' }}>{u.codigo}</strong>
            <span style={{ flex: 1, minWidth: 120, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.descricao}</span>
            {u.venda_preco != null && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#166534', whiteSpace: 'nowrap' }}>
                R$ {Number(u.venda_preco).toFixed(2).replace('.', ',')}
              </span>
            )}
            <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, color: '#fff', background: STATUS_COR[u.status] || '#64748b', whiteSpace: 'nowrap' }}>
              {STATUS_LABEL[u.status] || u.status}
            </span>
            {u.retirado_por_nome && <span style={{ fontSize: 11, color: '#94a3b8' }}>{u.retirado_por_nome}</span>}
          </div>
        ))}
      </div>
      {conf && (
        divergentes.length > 0 ? (
          <div style={{ marginTop: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#991b1b', lineHeight: 1.6 }}>
            <strong>⚠ Conferência liberado × faturado:</strong>
            {divergentes.map(l => (
              <div key={l.codigo}>
                {l.codigo} — {l.saldo} no pedido · {l.liberadas} liberada(s) · {l.aplicadas} faturada(s)
                {l.reservadas > 0 ? ` · ${l.reservadas} reservada(s)` : ''}
                {' '}({l.flags.filter(f => FLAG_TXT[f]).map(f => FLAG_TXT[f]).join(', ')})
              </div>
            ))}
          </div>
        ) : (conf.faturado || conf.terminal) ? (
          <div style={{ marginTop: 10, fontSize: 12, color: '#166534', fontWeight: 700 }}>
            ✓ Conferência ok — unidades rastreadas conferem com o faturamento.
          </div>
        ) : null
      )}
    </div>
  );
}
