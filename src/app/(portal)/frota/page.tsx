'use client';
// Frota > Visão geral — A tela do módulo (decisão do usuário, 15/07): a régua
// de KPIs de saúde da frota em cima e o grid de VEÍCULOS inteiro embaixo
// (busca, rótulo de localização, Ficha no clique). A antiga aba "Veículos"
// virou redirect pra cá.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Car, Search, Satellite, ShieldAlert, User as UserIcon, AlertTriangle,
  FileWarning, MapPin, Truck, Fuel, Droplets, OctagonAlert,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { authHeaders } from '@/lib/auth/client';
import { supabase } from '@/lib/supabase';
import { ehAvulsa, formatarPlaca, resolverPlaca } from '@/lib/frota/placa';
import VeiculoDrawer from '@/components/frota/VeiculoDrawer';
import type { VeiculoLista } from '@/lib/frota/tipos';

const fmtRS = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

interface Localizacao {
  rotulo: string;
  cidade: string | null;
  classe: string;
  dt: string | null;
  fonte: 'ao_vivo' | 'cache';
}

const COR_LOC: Record<string, string> = {
  loja: '#0f766e',
  cliente: '#1d4ed8', cliente_portal: '#1d4ed8',
  em_deslocamento: '#7c3aed',
  fora_geocerca: '#b45309',
};

export default function FrotaHome() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const [veiculos, setVeiculos] = useState<VeiculoLista[]>([]);
  const [atipicas7d, setAtipicas7d] = useState<number | null>(null);
  const [locs, setLocs] = useState<Record<string, Localizacao>>({});
  const [combustivel, setCombustivel] = useState<{ gasto30: number; litros30: number; abast30: number } | null>(null);
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
      setAtipicas7d(d.resumo?.atipicas_7d ?? null);
    } catch (e) { setErro(String(e)); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // KPIs de combustível (30d) direto do `abastecimentos` — placas resolvidas
  // pra canônica e sem os baldes avulsos (clientes/tratores/quadriciclos)
  useEffect(() => {
    (async () => {
      const de = new Date();
      de.setDate(de.getDate() - 30);
      const { data } = await supabase
        .from('abastecimentos')
        .select('placa, litros, valor_total, data_transacao')
        .gte('data_transacao', de.toISOString());
      const linhas = (data || []).filter((l) => {
        const p = resolverPlaca(l.placa);
        return p && !ehAvulsa(p);
      });
      setCombustivel({
        gasto30: linhas.reduce((s, l) => s + (Number(l.valor_total) || 0), 0),
        litros30: linhas.reduce((s, l) => s + (Number(l.litros) || 0), 0),
        abast30: linhas.length,
      });
    })();
  }, []);

  // Localização atual (Rota Exata + geocode) — chega DEPOIS da lista, de
  // propósito: é externa e lenta; os cards aparecem na hora e os rótulos vão
  // pingando quando prontos.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/frota/localizacao', { headers: await authHeaders() });
        if (!r.ok) return;
        const d = await r.json();
        if (vivo) setLocs(d.localizacoes || {});
      } catch { /* rótulo é opcional */ }
    })();
    return () => { vivo = false; };
  }, []);

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

  const soCarros = veiculos.filter((v) => v.tipo_registro === 'veiculo');
  const pendencias = soCarros.filter((v) => v.pendencia_vinculo).length;
  const multasN = soCarros.reduce((s, v) => s + (v.multas_abertas || 0), 0);
  const multasRS = soCarros.reduce((s, v) => s + (v.valor_multas_abertas || 0), 0);
  const docsN = soCarros.reduce((s, v) => s + (v.docs_vencendo || 0), 0);

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #0D9488, #0F766E)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Truck size={26} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--portal-text)' }}>Frota</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--portal-text-secondary)' }}>
            Veículos, abastecimento, custos e rastreamento
          </p>
        </div>
      </div>

      {/* KPIs — saúde da frota (os clicáveis levam pra tela do assunto) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi icone={<Fuel size={16} />} rotulo="Gasto combustível (30d)" valor={combustivel ? fmtRS(combustivel.gasto30) : '—'} />
        <Kpi icone={<Droplets size={16} />} rotulo="Litros (30d)" valor={combustivel ? combustivel.litros30.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'} />
        <Kpi icone={<Fuel size={16} />} rotulo="Abastecimentos (30d)" valor={combustivel ? String(combustivel.abast30) : '—'} />
        <Kpi
          icone={<ShieldAlert size={16} />}
          rotulo="Multas em aberto"
          valor={veiculos.length ? (multasN > 0 ? `${multasN} · ${fmtRS(multasRS)}` : '0') : '—'}
          cor={multasN > 0 ? '#b91c1c' : undefined}
          href="/frota/multas"
        />
        <Kpi
          icone={<FileWarning size={16} />}
          rotulo="Docs vencendo (≤30d)"
          valor={veiculos.length ? String(docsN) : '—'}
          cor={docsN > 0 ? '#b45309' : undefined}
        />
        <Kpi
          icone={<OctagonAlert size={16} />}
          rotulo="Paradas atípicas (7d)"
          valor={atipicas7d != null ? String(atipicas7d) : '—'}
          cor={(atipicas7d || 0) > 0 ? '#b45309' : undefined}
          href="/frota/paradas"
        />
      </div>

      {/* Grid de veículos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--portal-text)' }}>Veículos</h3>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>
          {filtrados.length} de {soCarros.length}
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
              {(() => {
                const loc = locs[v.placa];
                if (!loc) return null;
                const cor = COR_LOC[loc.classe] || 'var(--portal-text-muted)';
                const quando = loc.dt ? new Date(loc.dt).toLocaleString('pt-BR') : '';
                return (
                  <div
                    title={`${loc.fonte === 'cache' ? 'Última posição conhecida' : 'Posição ao vivo'}${quando ? ` · ${quando}` : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 11.5, fontWeight: 600, color: cor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    <MapPin size={11} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {loc.cidade ? `${loc.cidade} — ` : ''}{loc.rotulo}
                    </span>
                  </div>
                );
              })()}
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

function Kpi({ icone, rotulo, valor, cor, href }: { icone: React.ReactNode; rotulo: string; valor: string; cor?: string; href?: string }) {
  const corpo = (
    <div
      style={{
        background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
        borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: cor || '#0d9488' }}>
        {icone}
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {rotulo}
        </span>
      </div>
      <strong style={{ fontSize: 20, fontWeight: 800, color: cor || 'var(--portal-text)' }}>{valor}</strong>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none' }} title="Abrir a tela">{corpo}</Link> : corpo;
}
