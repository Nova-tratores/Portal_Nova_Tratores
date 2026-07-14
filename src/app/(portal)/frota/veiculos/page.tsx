'use client';
// Frota > Veículos — a frota inteira num grid; clique abre a Ficha (drawer).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Car, Search, Satellite, ShieldAlert, User as UserIcon, AlertTriangle, FileWarning } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import VeiculoDrawer from '@/components/frota/VeiculoDrawer';
import type { VeiculoLista } from '@/lib/frota/tipos';

const fmtRS = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default function FrotaVeiculosPage() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const [veiculos, setVeiculos] = useState<VeiculoLista[]>([]);
  const [busca, setBusca] = useState('');
  const [soAtivos, setSoAtivos] = useState(true);
  const [placaAberta, setPlacaAberta] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/frota/veiculos', { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); return; }
      setVeiculos(d.veiculos || []);
    } catch (e) { setErro(String(e)); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return veiculos
      .filter((v) => v.tipo_registro === 'veiculo') // os "avulsos" não são carros
      .filter((v) => !soAtivos || v.ativo)
      .filter((v) =>
        !q ||
        v.placa.toLowerCase().includes(q) ||
        (v.modelo || '').toLowerCase().includes(q) ||
        (v.marca || '').toLowerCase().includes(q) ||
        (v.descricao || '').toLowerCase().includes(q) ||
        (v.responsavel_nome || '').toLowerCase().includes(q),
      );
  }, [veiculos, busca, soAtivos]);

  const pendencias = veiculos.filter((v) => v.tipo_registro === 'veiculo' && v.pendencia_vinculo).length;

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)' }}>Veículos</h2>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>
          {filtrados.length} de {veiculos.filter((v) => v.tipo_registro === 'veiculo').length}
        </span>
        {pendencias > 0 && (
          <span title="Veículos que só apareceram no abastecimento — sem cadastro completo" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', borderRadius: 999, padding: '3px 10px' }}>
            <AlertTriangle size={12} /> {pendencias} com pendência de vínculo
          </span>
        )}
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={soAtivos} onChange={() => setSoAtivos((v) => !v)} /> só ativos
        </label>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Placa, modelo, responsável…"
            style={{ padding: '8px 12px 8px 30px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13, width: 260 }}
          />
        </div>
      </div>

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{erro}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {filtrados.map((v) => (
          <button
            key={v.id}
            onClick={() => setPlacaAberta(v.placa)}
            style={{
              textAlign: 'left', cursor: 'pointer',
              background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
              borderRadius: 12, padding: 14, display: 'flex', gap: 12, alignItems: 'center',
              opacity: v.ativo ? 1 : 0.55,
            }}
          >
            {v.imagem_url ? (
              <img src={v.imagem_url} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', background: 'var(--portal-bg-secondary)', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Car size={24} color="var(--portal-text-muted)" />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)' }}>{formatarPlaca(v.placa)}</strong>
                {v.tem_rastreador && <Satellite size={13} color="#0f766e" aria-label="Rastreado" />}
              </div>
              <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[v.marca, v.modelo || v.descricao, v.ano].filter(Boolean).join(' · ') || '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--portal-text-muted)' }}>
                  <UserIcon size={11} /> {v.responsavel_nome || 'sem responsável'}
                </span>
                {v.multas_abertas > 0 && (
                  <span title={`${v.multas_abertas} multa(s) em aberto`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#b91c1c' }}>
                    <ShieldAlert size={11} /> {v.multas_abertas} · {fmtRS(v.valor_multas_abertas)}
                  </span>
                )}
                {v.docs_vencendo > 0 && (
                  <span title={`${v.docs_vencendo} documento(s) vencido(s) ou vencendo em 30 dias`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#b45309' }}>
                    <FileWarning size={11} /> DOC
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {placaAberta && (
        <VeiculoDrawer
          placa={placaAberta}
          podeEditar={pode('frota', 'veiculos:editar')}
          podeResponsavel={pode('frota', 'veiculos:responsavel')}
          podeDocumentos={pode('frota', 'documentos:editar')}
          onClose={() => setPlacaAberta(null)}
          onMudou={carregar}
        />
      )}
    </div>
  );
}
