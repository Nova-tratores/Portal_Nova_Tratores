'use client';
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Loader2, Package } from 'lucide-react';
import { fmtData } from '@/lib/garantias/format';
import type { Forma, PecasDaGarantia } from '@/lib/garantias/notas-server';

// Checklist das peças APROVADAS: a fábrica REPÕE a peça (chega numa nota de
// entrada x.949, às vezes 4–5 meses depois) ou PAGA na NFS-e de reembolso.
// Sem marcação vale a sugestão (já chegou ou R$ 0 de peças = reposta).

const COR = '#dc2626';

export function formaDaPeca(p: PecasDaGarantia['pecas'][number]): Forma {
  return p.forma || p.sugestao;
}

export function faltaChegar(info: PecasDaGarantia | undefined): number {
  return (info?.pecas || []).filter((p) => formaDaPeca(p) === 'reposta' && !p.chegou).length;
}

export function ChecklistPecasFabrica({ info, podeEditar = true, onMudou }: {
  info: PecasDaGarantia; podeEditar?: boolean; onMudou?: (novo: PecasDaGarantia) => void;
}) {
  const [gravando, setGravando] = useState('');
  const [erro, setErro] = useState('');

  const mudar = async (pecaId: string, forma: Forma) => {
    if (!podeEditar || gravando) return;
    setGravando(pecaId);
    setErro('');
    try {
      const r = await fetchAuth(`/api/garantias/${info.garantiaId}/pecas-fabrica`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pecaId, forma }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || 'Não foi possível gravar.'); return; }
      onMudou?.({ ...info, pecas: info.pecas.map((p) => (p.id === pecaId ? { ...p, forma } : p)) });
    } catch {
      setErro('Sem conexão com o portal.');
    } finally {
      setGravando('');
    }
  };

  if (!info.pecas.length) {
    return <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Nenhuma peça aprovada nesta garantia.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {erro && <div style={{ fontSize: 12, color: '#b45309', background: '#f59e0b1a', padding: '6px 8px', borderRadius: 6 }}>{erro}</div>}
      {info.pecas.map((p) => {
        const f = formaDaPeca(p);
        return (
          <div key={p.id} style={{ border: '1px solid var(--portal-border)', borderRadius: 8, padding: 8, fontSize: 12, background: 'var(--portal-bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              <b>{p.cod_produto}</b>
              {gravando === p.id && <Loader2 size={13} className="spin" />}
            </div>
            <div style={{ color: 'var(--portal-text-muted)', marginBottom: 6 }}>{p.descricao} · {p.quantidade} un</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['reposta', 'paga'] as Forma[]).map((op) => (
                <button key={op} disabled={!podeEditar || !!gravando} onClick={(e) => { e.stopPropagation(); mudar(p.id, op); }}
                  title={!podeEditar ? 'Sem permissão' : p.forma ? 'Marcado' : 'Sugestão do portal — clique para confirmar'}
                  style={{
                    flex: 1, minHeight: 34, padding: '5px 6px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    cursor: podeEditar ? 'pointer' : 'not-allowed',
                    border: `1px ${p.forma ? 'solid' : 'dashed'} ${f === op ? COR : 'var(--portal-border)'}`,
                    background: f === op && p.forma ? COR : 'transparent',
                    color: f === op ? (p.forma ? '#fefefe' : COR) : 'var(--portal-text)',
                  }}>
                  {f === op ? '✓ ' : ''}{op === 'reposta' ? 'Reposta pela fábrica' : 'Paga na NFS-e'}
                </button>
              ))}
            </div>
            {!p.forma && <div style={{ marginTop: 4, color: 'var(--portal-text-muted)', fontSize: 11 }}>Sugestão do portal (tracejado) — clique para confirmar.</div>}
            {f === 'reposta' && (
              <div style={{ marginTop: 6, color: p.chegou ? '#16a34a' : '#d97706', fontWeight: 600 }}>
                {p.chegou ? `Chegou na NF ${p.chegou.numero}${p.chegou.data ? ` (${fmtData(p.chegou.data)})` : ''}` : 'Ainda não chegou'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Versão que carrega sozinha (janela da garantia).
export default function PecasFabricaPainel({ garantiaId, podeEditar }: { garantiaId: string; podeEditar?: boolean }) {
  const [res, setRes] = useState<{ id: string; info: PecasDaGarantia | null; erro: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetchAuth(`/api/garantias/${garantiaId}/pecas-fabrica`)
      .then(async (r) => {
        const j = await r.json();
        if (vivo) setRes(r.ok ? { id: garantiaId, info: j, erro: '' } : { id: garantiaId, info: null, erro: j.error || 'Erro ao ler as peças.' });
      })
      .catch(() => { if (vivo) setRes({ id: garantiaId, info: null, erro: 'Sem conexão com o portal.' }); });
    return () => { vivo = false; };
  }, [garantiaId]);
  const atual = res && res.id === garantiaId ? res : null;
  if (!atual) return <div style={{ padding: 20, color: 'var(--portal-text-muted)' }}><Loader2 size={16} className="spin" /> Carregando peças…</div>;
  if (atual.erro) return <div style={{ color: COR, fontSize: 13 }}>{atual.erro}</div>;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
        <Package size={16} /> Peças aprovadas — reposta ou paga?
      </div>
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginBottom: 10 }}>
        Marque se a fábrica vai <b>repor</b> a peça (a garantia fica em &quot;Aguardando peças da fábrica&quot; até a nota x.949 chegar) ou se ela foi <b>paga</b> na NFS-e de reembolso.
      </div>
      {atual.info && (
        <ChecklistPecasFabrica info={atual.info} podeEditar={podeEditar}
          onMudou={(novo) => setRes({ id: garantiaId, info: novo, erro: '' })} />
      )}
    </div>
  );
}
