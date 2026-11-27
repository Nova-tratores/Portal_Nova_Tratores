'use client';
// Faixa "Fretes fora do custo" de /estoque/recebimentos: o que a varredura da madrugada
// (tarefa fretes-custo-varredura) achou no kardex — frete (CT-e) que a Omie não somou no
// custo das peças da carga. Visto / Corrigido tiram da faixa. Some quando não há nada novo.

import { useCallback, useEffect, useState } from 'react';
import { authHeaders, fetchAuth } from '@/lib/auth/client';
import { ROTULO_MOTIVO, type MotivoFrete } from '@/lib/estoque/fretes-custo';

interface Alerta {
  id: number; id_produto: number; codigo: string | null; descricao: string | null;
  data_mov: string; cte_numero: string | null; motivo: MotivoFrete; frete_valor: number | null;
  cmc_antes: number | null; cmc_depois: number | null; qtd_antes: number | null;
}
const brl = (v: number | null) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

export default function FretesForaDoCusto({ conta, abrir }: { conta: string; abrir?: boolean }) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [aberto, setAberto] = useState(!!abrir);
  const [gravando, setGravando] = useState<number | null>(null);

  const carregar = useCallback(() => {
    if (!conta || conta === 'TODAS') return;
    fetchAuth(`/api/estoque/recebimentos/fretes-custo?conta=${encodeURIComponent(conta)}`)
      .then((r) => r.json()).then((d) => setAlertas(d.alertas || [])).catch(() => setAlertas([]));
  }, [conta]);
  useEffect(() => { carregar(); }, [carregar]);

  const marcar = async (id: number, status: 'visto' | 'corrigido') => {
    setGravando(id);
    try {
      const r = await fetch('/api/estoque/recebimentos/fretes-custo', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ ids: [id], status }),
      });
      if ((await r.json()).ok) setAlertas((a) => a.filter((x) => x.id !== id));
    } finally { setGravando(null); }
  };

  if (!alertas.length) return null;
  const total = alertas.reduce((s, a) => s + (Number(a.frete_valor) || 0), 0);
  return (
    <div style={{ border: '1px solid #fdba74', background: '#fff7ed', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
      <button onClick={() => setAberto((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 40, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: '#9a3412', fontSize: '.86rem' }}>Fretes fora do custo das peças</span>
        <span style={{ fontSize: '.74rem', color: '#9a3412' }}>{alertas.length} achado(s) na varredura da madrugada · cerca de {brl(total)}</span>
        <span style={{ marginLeft: 'auto', fontSize: '.74rem', color: '#c2410c' }}>{aberto ? 'esconder ▲' : 'ver ▼'}</span>
      </button>
      {aberto && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: '.74rem', color: '#7c2d12', marginBottom: 8 }}>
            A Omie soma o frete no custo pela data de registro do CT-e. Quando ele entra com o estoque da peça zerado, ou antes da nota da carga,
            o valor não vai para as peças certas. Corrija o custo em <a href="/ajustes/ajuste-estoque" style={{ color: '#1d4ed8' }}>Ajuste de estoque</a> e marque &quot;Corrigido&quot;.
          </div>
          <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #fed7aa' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.74rem', minWidth: 640 }}>
              <thead>
                <tr style={{ background: '#ffedd5', color: '#7c2d12', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>CT-e</th><th style={{ padding: '6px 8px' }}>Peça</th><th style={{ padding: '6px 8px' }}>Data</th>
                  <th style={{ padding: '6px 8px' }}>O que houve</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>Frete</th><th style={{ padding: '6px 8px' }} />
                </tr>
              </thead>
              <tbody>
                {alertas.map((a) => (
                  <tr key={a.id} style={{ borderTop: '1px solid #ffedd5' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{a.cte_numero || '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{a.codigo || a.id_produto}<div style={{ color: '#64748b', fontSize: '.68rem' }}>{a.descricao || ''}</div></td>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{a.data_mov}</td>
                    <td style={{ padding: '6px 8px' }}>{ROTULO_MOTIVO[a.motivo] || a.motivo}{a.qtd_antes != null ? <span style={{ color: '#64748b' }}> · estoque antes {a.qtd_antes}</span> : null}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{brl(a.frete_valor)}</td>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                      <button disabled={gravando === a.id} onClick={() => marcar(a.id, 'corrigido')} style={{ minHeight: 36, padding: '4px 10px', marginRight: 4, borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: '.72rem', cursor: 'pointer' }}>Corrigido</button>
                      <button disabled={gravando === a.id} onClick={() => marcar(a.id, 'visto')} style={{ minHeight: 36, padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: '.72rem', cursor: 'pointer' }}>Visto</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
