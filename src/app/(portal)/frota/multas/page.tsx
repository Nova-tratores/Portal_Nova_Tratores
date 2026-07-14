'use client';
// Frota > Multas — todas as multas da frota, com QUEM estava com o carro na
// data (uso diário > responsável fixo > Rota Exata) e o fluxo interno
// (análise/defesa/paga/descontada). Espelho local — nada de API externa aqui.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldAlert, AlertTriangle, MapPin, ExternalLink } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { MSG_SEM_PERMISSAO } from '@/lib/permissoes/ui';
import type { Multa } from '@/lib/frota/tipos';

const fmtRS = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');

const STATUS: Record<string, { label: string; cor: string; bg: string }> = {
  nova: { label: 'Nova', cor: '#b45309', bg: '#fef3c7' },
  em_analise: { label: 'Em análise', cor: '#1d4ed8', bg: '#dbeafe' },
  em_defesa: { label: 'Em defesa', cor: '#7c3aed', bg: '#ede9fe' },
  paga: { label: 'Paga', cor: '#15803d', bg: '#dcfce7' },
  descontada: { label: 'Descontada em folha', cor: '#0f766e', bg: '#ccfbf1' },
  arquivada: { label: 'Arquivada', cor: '#64748b', bg: '#f1f5f9' },
};
const FONTE_LABEL: Record<string, string> = {
  uso_diario: 'marcou o carro no dia',
  responsavel_fixo: 'responsável fixo',
  rotaexata: 'carimbado pela Rota Exata',
};

export default function FrotaMultasPage() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('frota', 'multas:editar');

  const [multas, setMultas] = useState<Multa[]>([]);
  const [erro, setErro] = useState('');
  const [soAbertas, setSoAbertas] = useState(true);
  const [busy, setBusy] = useState('');

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/frota/multas', { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); return; }
      setMultas(d.multas || []);
    } catch (e) { setErro(String(e)); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const mudarStatus = async (id: string, status: string) => {
    setBusy(id);
    try {
      const r = await fetch('/api/frota/multas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id, status_interno: status }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || 'Falha ao atualizar.'); return; }
      await carregar();
    } finally { setBusy(''); }
  };

  const visiveis = useMemo(
    () => multas.filter((m) => !soAbertas || !['paga', 'descontada', 'arquivada'].includes(m.status_interno)),
    [multas, soAbertas],
  );
  const totalAberto = multas
    .filter((m) => !['paga', 'descontada', 'arquivada'].includes(m.status_interno))
    .reduce((s, m) => s + (Number(m.valor) || 0), 0);

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={20} color="#b91c1c" /> Multas
        </h2>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>
          {visiveis.length} exibidas · <strong style={{ color: '#b91c1c' }}>{fmtRS(totalAberto)}</strong> em aberto
        </span>
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={soAbertas} onChange={() => setSoAbertas((v) => !v)} /> só em aberto
        </label>
      </div>

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{erro}</div>}
      {visiveis.length === 0 && !erro && (
        <div style={{ color: 'var(--portal-text-muted)', fontSize: 13 }}>Nenhuma multa {soAbertas ? 'em aberto' : 'registrada'}. 🎉</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visiveis.map((m) => {
          const st = STATUS[m.status_interno] || STATUS.nova;
          return (
            <div key={m.id} style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 90 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)' }}>{formatarPlaca(m.placa)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{fmtData(m.dt_multa)}</div>
              </div>

              <div style={{ flex: 2, minWidth: 220 }}>
                <div style={{ fontSize: 13, color: 'var(--portal-text)', fontWeight: 600 }}>
                  {m.descricao || 'Infração'}
                  {m.numero_auto && <span style={{ color: 'var(--portal-text-muted)', fontWeight: 400 }}> · auto {m.numero_auto}</span>}
                </div>
                {m.local_endereco && (
                  <a
                    href={m.local_lat && m.local_lng ? `https://www.google.com/maps?q=${m.local_lat},${m.local_lng}` : undefined}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--portal-text-muted)', textDecoration: 'none' }}
                  >
                    <MapPin size={11} /> {m.local_endereco} {m.local_lat && <ExternalLink size={10} />}
                  </a>
                )}
                <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginTop: 3 }}>
                  <strong>{m.atribuido_a || 'não identificado'}</strong>
                  {m.atribuido_fonte && <span style={{ color: 'var(--portal-text-muted)' }}> ({FONTE_LABEL[m.atribuido_fonte]})</span>}
                  {m.motorista_divergente && (
                    <span title="O motorista carimbado pela Rota Exata difere do responsável vigente na data — confira antes de descontar" style={{ color: '#b45309', marginLeft: 6 }}>
                      <AlertTriangle size={11} style={{ verticalAlign: '-2px' }} /> divergência
                    </span>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#b91c1c' }}>{fmtRS(m.valor)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{m.pontos ?? 0} pts · {m.nivel_infracao || '—'}</div>
                {m.dt_vencimento && <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>vence {fmtData(m.dt_vencimento)}</div>}
              </div>

              <div style={{ minWidth: 150 }}>
                <select
                  value={m.status_interno}
                  disabled={!podeEditar || busy === m.id}
                  title={podeEditar ? 'Mudar o status interno' : MSG_SEM_PERMISSAO}
                  onChange={(e) => mudarStatus(m.id, e.target.value)}
                  style={{
                    width: '100%', padding: '6px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: `1px solid ${st.cor}33`, background: st.bg, color: st.cor,
                    cursor: podeEditar ? 'pointer' : 'not-allowed', opacity: podeEditar ? 1 : 0.6,
                  }}
                >
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
