'use client';
// Mapa de SISTEMAS do veículo (Ficha da Visão geral) — grade de ícones tipo
// painel de oficina: cada sistema da taxonomia vira um azulejo; se houver
// pendência ABERTA registrada naquele sistema, o azulejo fica VERMELHO
// PISCANDO. Clicar num sistema abre o drill-down: os subsistemas/componentes
// dele, com as pendências abertas listadas em cada um.
// Fonte: /api/frota/componentes + /api/frota/pendencias?placa=X.
import { useEffect, useMemo, useState } from 'react';
import {
  Armchair, Car, CircleDot, Cog, Disc, Disc3, LifeBuoy, Package, ShieldAlert,
  Snowflake, Waves, Wrench, Zap, AlertTriangle, ChevronDown,
} from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';

interface Componente {
  id: string; sistema: string; subsistema: string | null; componente: string | null;
  vida_util_meses: number | null; vida_util_km: number | null; ordem: number;
}
interface Pend {
  id: string; placa: string; origem: string; titulo: string; descricao: string | null;
  componente_id: string | null; status: string; aberta_por: string | null; aberta_em: string;
  data_ocorrencia: string | null;
}

const ICONE_SISTEMA: Record<string, any> = {
  'Motor': Cog,
  'Transmissão': Disc3,
  'Freios': Disc,
  'Suspensão': Waves,
  'Direção': LifeBuoy,
  'Elétrica': Zap,
  'Rodas e Pneus': CircleDot,
  'Carroceria': Car,
  'Interior': Armchair,
  'Ar-condicionado': Snowflake,
  'Itens de segurança': ShieldAlert,
  'Outros': Package,
};

const fmtData = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');

export default function SistemasVeiculo({ placa }: { placa: string }) {
  const [componentes, setComponentes] = useState<Componente[]>([]);
  const [pendencias, setPendencias] = useState<Pend[]>([]);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState('');
  const [sistemaSel, setSistemaSel] = useState<string | null>(null);
  const [subSel, setSubSel] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const h = await authHeaders();
        const [rk, rp] = await Promise.all([
          fetch('/api/frota/componentes', { headers: h }),
          // sync=1: registra na hora as pendências automáticas (cadastro/checklist)
          // — o que estiver errado no checklist já acende o azulejo aqui e na aba
          fetch(`/api/frota/pendencias?sync=1&placa=${encodeURIComponent(placa)}`, { headers: h }),
        ]);
        const dk = await rk.json().catch(() => ({}));
        const dp = await rp.json().catch(() => ({}));
        if (!vivo) return;
        if (!rk.ok || !rp.ok) { setErro(dk.error || dp.error || 'Falha ao carregar os sistemas.'); return; }
        setComponentes(dk.componentes || []);
        setPendencias((dp.pendencias || []).filter((p: Pend) => p.status === 'aberta'));
        setPronto(true);
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : String(e)); }
    })();
    return () => { vivo = false; };
  }, [placa]);

  const sistemas = useMemo(() => {
    const ordem = new Map<string, number>();
    for (const c of componentes) {
      if (!ordem.has(c.sistema) || c.ordem < ordem.get(c.sistema)!) ordem.set(c.sistema, c.ordem);
    }
    return [...ordem.entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s);
  }, [componentes]);

  const compPorId = useMemo(() => new Map(componentes.map((c) => [c.id, c])), [componentes]);
  const pendPorSistema = useMemo(() => {
    const m = new Map<string, Pend[]>();
    for (const p of pendencias) {
      const c = p.componente_id ? compPorId.get(p.componente_id) : undefined;
      const chave = c ? c.sistema : '__sem__';
      const arr = m.get(chave) || [];
      arr.push(p); m.set(chave, arr);
    }
    return m;
  }, [pendencias, compPorId]);

  if (erro) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 0, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13.5 }}>
        <AlertTriangle size={15} style={{ flexShrink: 0 }} /> Mapa de sistemas indisponível: {erro}
      </div>
    );
  }
  if (!pronto || sistemas.length === 0) return null;

  const semClassif = pendPorSistema.get('__sem__') || [];

  return (
    <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 0, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 }}>
        <Wrench size={14} /> Sistemas do veículo
        <a href={`/frota/pendencias?placa=${encodeURIComponent(placa)}`} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#2563eb', textDecoration: 'none', textTransform: 'none', letterSpacing: 0 }}>
          {pendencias.length > 0 ? `resolver ${pendencias.length} pendência${pendencias.length > 1 ? 's' : ''} →` : 'aba Pendências →'}
        </a>
      </div>

      {/* grade de azulejos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8 }}>
        {sistemas.map((s) => {
          const Icone = ICONE_SISTEMA[s] || Wrench;
          const pend = pendPorSistema.get(s) || [];
          const problema = pend.length > 0;
          const ativo = sistemaSel === s;
          return (
            <button key={s} onClick={() => { setSistemaSel(ativo ? null : s); setSubSel(null); }} title={problema ? `${pend.length} pendência(s) em ${s}` : s}
              className={problema ? 'sist-blink' : undefined}
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '12px 6px 10px', borderRadius: 0, cursor: 'pointer',
                background: problema ? '#fef2f2' : 'var(--portal-bg-card)',
                border: `1.5px solid ${ativo ? '#1e40af' : problema ? '#fca5a5' : 'var(--portal-border)'}`,
                color: problema ? '#dc2626' : 'var(--portal-text-secondary)', transition: 'transform .12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}>
              <Icone size={24} color={problema ? '#dc2626' : '#1e40af'} strokeWidth={1.6} />
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.2 }}>{s}</span>
              {problema && (
                <span style={{ position: 'absolute', top: 5, right: 5, minWidth: 17, height: 17, borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', fontVariantNumeric: 'tabular-nums' }}>
                  {pend.length}
                </span>
              )}
            </button>
          );
        })}
        {semClassif.length > 0 && (
          <button onClick={() => setSistemaSel(sistemaSel === '__sem__' ? null : '__sem__')} title="Pendências ainda sem sistema definido"
            className="sist-blink"
            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 6px 10px', borderRadius: 0, cursor: 'pointer', background: '#fef2f2', border: `1.5px solid ${sistemaSel === '__sem__' ? '#1e40af' : '#fca5a5'}`, color: '#dc2626' }}>
            <AlertTriangle size={24} strokeWidth={1.6} />
            <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.2 }}>Sem classificação</span>
            <span style={{ position: 'absolute', top: 5, right: 5, minWidth: 17, height: 17, borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
              {semClassif.length}
            </span>
          </button>
        )}
      </div>

      {/* drill-down: SUBSISTEMAS do sistema clicado (também azulejos) */}
      {sistemaSel && sistemaSel !== '__sem__' && (() => {
        const doSistema = componentes.filter((c) => c.sistema === sistemaSel);
        const subs = [...new Set(doSistema.map((c) => c.subsistema || 'Geral'))];
        const pendDoSub = (sub: string) =>
          pendencias.filter((p) => {
            const c = p.componente_id ? compPorId.get(p.componente_id) : undefined;
            return c && c.sistema === sistemaSel && (c.subsistema || 'Geral') === sub;
          });
        return (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--portal-text)', marginBottom: 8 }}>
              <ChevronDown size={13} /> {sistemaSel} — subsistemas
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 7 }}>
              {subs.map((sub) => {
                const pend = pendDoSub(sub);
                const problema = pend.length > 0;
                const ativo = subSel === sub;
                return (
                  <button key={sub} onClick={() => setSubSel(ativo ? null : sub)}
                    className={problema ? 'sist-blink' : undefined}
                    style={{
                      position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '10px 8px', borderRadius: 0, cursor: 'pointer', textAlign: 'center',
                      background: problema ? '#fef2f2' : 'var(--portal-bg-secondary)',
                      border: `1.5px solid ${ativo ? '#1e40af' : problema ? '#fca5a5' : 'var(--portal-border)'}`,
                      color: problema ? '#dc2626' : 'var(--portal-text-secondary)', fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', lineHeight: 1.25,
                    }}>
                    {sub}
                    {problema && (
                      <span style={{ position: 'absolute', top: 3, right: 3, minWidth: 15, height: 15, borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', fontVariantNumeric: 'tabular-nums' }}>
                        {pend.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* componentes do subsistema clicado, com as pendências */}
            {subSel && (
              <div style={{ marginTop: 10, border: '1px solid var(--portal-border)', borderRadius: 0, overflow: 'hidden' }}>
                <div style={{ padding: '7px 12px', background: 'var(--portal-bg-secondary)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--portal-text)' }}>
                  {sistemaSel} › {subSel}
                </div>
                {doSistema.filter((c) => (c.subsistema || 'Geral') === subSel).map((c) => {
                  const pend = pendencias.filter((p) => p.componente_id === c.id);
                  const rot = c.componente || c.subsistema || 'Geral';
                  const problema = pend.length > 0;
                  return (
                    <div key={c.id} style={{ padding: '8px 12px', borderTop: '1px solid var(--portal-border)', background: problema ? 'rgba(220,38,38,0.06)' : 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: problema ? '#dc2626' : '#22c55e' }} className={problema ? 'sist-blink' : undefined} />
                        <span style={{ fontSize: 13.5, fontWeight: problema ? 700 : 500, color: problema ? '#b91c1c' : 'var(--portal-text)' }}>{rot}</span>
                        {c.vida_util_meses && (
                          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--portal-text)' }}>vida ~{c.vida_util_meses}m{c.vida_util_km ? ` / ${c.vida_util_km.toLocaleString('pt-BR')} km` : ''}</span>
                        )}
                      </div>
                      {pend.map((p) => (
                        <div key={p.id} style={{ fontSize: 12, color: '#b91c1c', marginTop: 4, marginLeft: 16 }}>
                          <b>{p.titulo}</b>
                          <span style={{ color: 'var(--portal-text)', fontSize: 11 }}> · aberta por {p.aberta_por || '—'} em {fmtData(p.data_ocorrencia || p.aberta_em)}</span>
                          {p.descricao && <div style={{ color: 'var(--portal-text)', fontSize: 12.5 }}>{p.descricao}</div>}
                          <a href={`/frota/pendencias?placa=${encodeURIComponent(placa)}`} style={{ display: 'inline-block', marginTop: 2, fontSize: 12.5, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                            Resolver na aba Pendências →
                          </a>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* pendências ainda sem classificação */}
      {sistemaSel === '__sem__' && (
        <div style={{ marginTop: 12, border: '1px solid var(--portal-border)', borderRadius: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'var(--portal-bg-secondary)', fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--portal-text)' }}>
            <ChevronDown size={13} /> Pendências sem classificação
          </div>
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {semClassif.map((p) => (
              <div key={p.id} style={{ fontSize: 13.5, color: '#b91c1c' }}>
                <b>{p.titulo}</b>
                <span style={{ color: 'var(--portal-text)', fontSize: 12.5 }}> · aberta por {p.aberta_por || '—'} em {fmtData(p.data_ocorrencia || p.aberta_em)}</span>
                <div>
                  <a href={`/frota/pendencias?placa=${encodeURIComponent(placa)}`} style={{ fontSize: 12.5, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                    Classificar e resolver na aba Pendências →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .sist-blink { animation: sist-blink 1.1s ease-in-out infinite; }
        @keyframes sist-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        @media (prefers-reduced-motion: reduce) { .sist-blink { animation: none; } }
      `}</style>
    </div>
  );
}
