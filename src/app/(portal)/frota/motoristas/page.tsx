'use client';
// Frota > Motoristas — os funcionários do RH (Supabase próprio, SEM salário)
// mesclados com a frota: CNH (número/categoria/validade), flag "é motorista",
// veículos sob responsabilidade e multas. Mesmo visual da Visão geral dos
// veículos: KPIs em cima, grid de cards embaixo, ficha (drawer) no clique.
// Só CNH + flag motorista são editáveis aqui — o cadastro é do RH.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Search, User as UserIcon, AlertTriangle, IdCard, Car,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { authHeaders } from '@/lib/auth/client';
import MotoristaDrawer from '@/components/frota/MotoristaDrawer';
import type { MotoristaRH } from '@/lib/frota/tipos';

const DESLIGADO = new Set(['demitido', 'inativo']);

function ehAtivo(m: MotoristaRH): boolean {
  if (m.status_rh != null) return !DESLIGADO.has(m.status_rh);
  return m.ativo_portal;
}

function fmtMesAno(iso: string | null): string {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : '—';
}

// chip da CNH — a cor conta a situação de longe
function ChipCnh({ m }: { m: MotoristaRH }) {
  const cat = m.cnh_categoria ? ` ${m.cnh_categoria}` : '';
  const estilos: Record<string, { bg: string; fg: string; texto: string }> = {
    ok: { bg: '#dcfce7', fg: '#15803d', texto: `CNH${cat} · até ${fmtMesAno(m.cnh_validade)}` },
    vencendo: { bg: '#fef3c7', fg: '#b45309', texto: `CNH${cat} vence ${fmtMesAno(m.cnh_validade)}` },
    vencida: { bg: '#fee2e2', fg: '#b91c1c', texto: `CNH${cat} VENCIDA` },
    sem_validade: { bg: '#fef3c7', fg: '#b45309', texto: `CNH${cat} sem validade` },
    sem_cnh: m.e_motorista
      ? { bg: '#fee2e2', fg: '#b91c1c', texto: 'SEM CNH' }
      : { bg: 'var(--portal-bg-secondary)', fg: 'var(--portal-text-muted)', texto: 'sem CNH' },
  };
  const e = estilos[m.situacao_cnh];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: e.fg, background: e.bg, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {e.texto}
    </span>
  );
}

function BadgeStatus({ m }: { m: MotoristaRH }) {
  if (m.status_rh === 'ferias' || m.status_rh === 'afastado') {
    return <span style={{ fontSize: 9.5, fontWeight: 800, color: '#b45309', background: '#fef3c7', borderRadius: 999, padding: '2px 7px', letterSpacing: 0.4, textTransform: 'uppercase' }}>{m.status_rh}</span>;
  }
  if (m.status_rh != null && DESLIGADO.has(m.status_rh)) {
    return <span style={{ fontSize: 9.5, fontWeight: 800, color: '#475569', background: '#e2e8f0', borderRadius: 999, padding: '2px 7px', letterSpacing: 0.4 }}>DESLIGADO</span>;
  }
  if (m.origem === 'portal') {
    return <span title="Não encontrado no RH — cadastro vindo da Rota Exata" style={{ fontSize: 9.5, fontWeight: 800, color: '#475569', background: '#e2e8f0', borderRadius: 999, padding: '2px 7px', letterSpacing: 0.4 }}>FORA DO RH</span>;
  }
  return null;
}

function BadgeEmpresa({ empresa }: { empresa: string | null }) {
  if (!empresa) return null;
  const nova = empresa.toUpperCase().includes('NOVA');
  return (
    <span style={{ fontSize: 9.5, fontWeight: 800, color: nova ? '#0f766e' : '#0369a1', background: nova ? '#ccfbf1' : '#e0f2fe', borderRadius: 999, padding: '2px 7px', letterSpacing: 0.4 }}>
      {empresa.toUpperCase()}
    </span>
  );
}

export default function FrotaMotoristasPage() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const [motoristas, setMotoristas] = useState<MotoristaRH[]>([]);
  const [rhConfigurado, setRhConfigurado] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [segmento, setSegmento] = useState<'todos' | 'motoristas' | 'pendencia' | 'desligados'>('todos');
  const [aberto, setAberto] = useState<MotoristaRH | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/frota/motoristas/rh', { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); setCarregando(false); return; }
      setMotoristas(d.motoristas || []);
      setRhConfigurado(d.rh_configurado !== false);
      setAviso(d.aviso || null);
      setErro('');
    } catch (e) { setErro(String(e)); }
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const ativos = useMemo(() => motoristas.filter(ehAtivo), [motoristas]);
  const kMotoristas = ativos.filter((m) => m.e_motorista);
  const kVencendo = ativos.filter((m) => m.situacao_cnh === 'vencendo').length;
  const kVencida = ativos.filter((m) => m.situacao_cnh === 'vencida').length;
  const kPend = motoristas.filter((m) => m.pendencias.length > 0).length;

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return motoristas
      .filter((m) =>
        segmento === 'todos' ? ehAtivo(m) :
        segmento === 'motoristas' ? ehAtivo(m) && m.e_motorista :
        segmento === 'pendencia' ? m.pendencias.length > 0 :
        !ehAtivo(m),
      )
      .filter((m) =>
        !q ||
        m.nome.toLowerCase().includes(q) ||
        (m.cargo || '').toLowerCase().includes(q) ||
        (m.departamento || '').toLowerCase().includes(q) ||
        (m.empresa || '').toLowerCase().includes(q),
      )
      // quem tem pendência sobe (a lista já vem por nome)
      .sort((a, b) => (b.pendencias.length > 0 ? 1 : 0) - (a.pendencias.length > 0 ? 1 : 0));
  }, [motoristas, busca, segmento]);

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #0D9488, #0F766E)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={26} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--portal-text)' }}>Motoristas</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--portal-text-secondary)' }}>
            Funcionários do RH + habilitação (CNH) e vínculos da frota — o cadastro é editado no RH
          </p>
        </div>
      </div>

      {!rhConfigurado && aviso && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, marginBottom: 16 }}>
          <AlertTriangle size={15} /> {aviso}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi icone={<Users size={16} />} rotulo="Funcionários ativos" valor={carregando ? '—' : String(ativos.length)} />
        <Kpi icone={<Car size={16} />} rotulo="Motoristas" valor={carregando ? '—' : String(kMotoristas.length)} />
        <Kpi icone={<IdCard size={16} />} rotulo="CNH vencendo (≤30d)" valor={carregando ? '—' : String(kVencendo)} cor={kVencendo > 0 ? '#b45309' : undefined} />
        <Kpi icone={<IdCard size={16} />} rotulo="CNH vencida" valor={carregando ? '—' : String(kVencida)} cor={kVencida > 0 ? '#b91c1c' : undefined} />
        <Kpi icone={<AlertTriangle size={16} />} rotulo="Com pendência" valor={carregando ? '—' : String(kPend)} cor={kPend > 0 ? '#b91c1c' : undefined} />
      </div>

      {/* Barra do grid */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--portal-text)' }}>Pessoas</h3>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>{filtrados.length} de {motoristas.length}</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: '1px solid var(--portal-border)', borderRadius: 8, overflow: 'hidden' }}>
          {([
            ['todos', `Ativos (${ativos.length})`],
            ['motoristas', `Só motoristas (${kMotoristas.length})`],
            ['pendencia', `CNH com pendência (${kPend})`],
            ['desligados', `Desligados (${motoristas.length - ativos.length})`],
          ] as ['todos' | 'motoristas' | 'pendencia' | 'desligados', string][]).map(([k, rotulo]) => (
            <button
              key={k}
              onClick={() => setSegmento(k)}
              style={{
                padding: '7px 12px', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: segmento === k ? '#0d9488' : 'var(--portal-bg-input)',
                color: segmento === k ? '#fff' : 'var(--portal-text-secondary)',
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, cargo, departamento…"
            style={{ padding: '8px 12px 8px 30px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13, width: 260 }}
          />
        </div>
      </div>

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{erro}</div>}
      {carregando && <div style={{ color: 'var(--portal-text-muted)', fontSize: 13 }}>Carregando…</div>}

      {/* Grid de pessoas — mesmo padrão dos cards de veículos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {filtrados.map((m) => (
          <button
            key={m.rh_id || m.id}
            onClick={() => setAberto(m)}
            title={m.pendencias.length > 0 ? `Pendências:\n• ${m.pendencias.join('\n• ')}` : undefined}
            style={{
              textAlign: 'left', cursor: 'pointer',
              background: m.pendencias.length > 0 ? 'rgba(220, 38, 38, 0.06)' : 'var(--portal-bg-card)',
              border: `1px solid ${m.pendencias.length > 0 ? '#ef4444' : 'var(--portal-border)'}`,
              borderRadius: 12, padding: 14, display: 'flex', gap: 12, alignItems: 'center',
              opacity: ehAtivo(m) ? 1 : 0.55,
            }}
          >
            {m.foto_url ? (
              <img src={m.foto_url} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', background: 'var(--portal-bg-secondary)', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <UserIcon size={24} color="var(--portal-text-muted)" />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--portal-text)' }}>{m.nome}</strong>
                {m.pendencias.length > 0 && (
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: '#b91c1c', background: '#fee2e2', borderRadius: 999, padding: '2px 7px', letterSpacing: 0.4 }}>
                    {m.pendencias.length} PENDÊNCIA{m.pendencias.length > 1 ? 'S' : ''}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[m.cargo, m.departamento].filter(Boolean).join(' · ') || '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                <BadgeEmpresa empresa={m.empresa} />
                <BadgeStatus m={m} />
                <ChipCnh m={m} />
                {m.responsavel_por_veiculo && (
                  <span title="Responsável por veículo da frota" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: '#0f766e' }}>
                    <Car size={11} /> com carro
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
      {!carregando && filtrados.length === 0 && !erro && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 13 }}>Ninguém encontrado nesse filtro.</div>
      )}

      {aberto && (
        <MotoristaDrawer
          rhId={aberto.rh_id}
          portalId={aberto.id}
          nome={aberto.nome}
          podeEditar={pode('frota', 'motoristas:editar')}
          onClose={() => setAberto(null)}
          onMudou={carregar}
        />
      )}
    </div>
  );
}

function Kpi({ icone, rotulo, valor, cor }: { icone: React.ReactNode; rotulo: string; valor: string; cor?: string }) {
  return (
    <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: cor || '#0d9488' }}>
        {icone}
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{rotulo}</span>
      </div>
      <strong style={{ fontSize: 20, fontWeight: 800, color: cor || 'var(--portal-text)' }}>{valor}</strong>
    </div>
  );
}
