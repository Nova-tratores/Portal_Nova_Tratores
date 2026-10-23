'use client';
// Aba "Painel" das Requisições: quanto se gasta, com o quê, com quem e quanto tempo
// leva até o financeiro. Tudo calculado das requisições já carregadas na tela
// (lib/requisicoes/inteligencia.ts). Clicar numa barra mostra as requisições dela no quadro.
import React, { useEffect, useMemo, useState } from 'react';
import {
  agrupar, brl, diasAteFinanceiro, FASES_ABERTAS, mediana, noPeriodo, normalizarStatus, normalizarTipo, porMes,
  ROTULO_FASE, COR_FASE, valorReq, type Fatia, type Req,
} from '@/lib/requisicoes/inteligencia';
import { IconeQuadrado } from './visualReq';

const PERIODOS = [
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 180, rotulo: '6 meses' },
  { dias: 365, rotulo: '12 meses' },
];
const CHAVE_PERIODO = 'req-painel-periodo';

/** Número que sobe contando (respeita quem pediu menos movimento). */
function Contador({ valor, formato }: { valor: number; formato: (n: number) => string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    // quem pediu menos movimento vê o número final no primeiro quadro
    const rapido = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0; const ini = performance.now();
    const passo = (t: number) => { const p = rapido ? 1 : Math.min(1, (t - ini) / 700); setN(valor * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(passo); };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return <>{formato(n)}</>;
}

function Tile({ icone, cor, rotulo, children, nota }: { icone: string; cor: string; rotulo: string; children: React.ReactNode; nota?: string }) {
  return (
    <div className="rq-card rq-entra" style={{ ['--c' as any]: cor }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <IconeQuadrado icone={icone} cor={cor} />
        <div style={{ minWidth: 0 }}>
          <div className="rq-rot">{rotulo}</div>
          <div className="rq-num">{children}</div>
        </div>
      </div>
      {nota && <div className="rq-rot" style={{ marginTop: 8 }}>{nota}</div>}
    </div>
  );
}

function Ranking({ titulo, icone, cor, fatias, limite = 8, onEscolher, total }: {
  titulo: string; icone: string; cor: string; fatias: Fatia[]; limite?: number; total: number;
  onEscolher: (f: Fatia, titulo: string) => void;
}) {
  const [tudo, setTudo] = useState(false);
  const lista = tudo ? fatias : fatias.slice(0, limite);
  const max = Math.max(1, ...fatias.map((f) => f.valor));
  return (
    <div className="rq-card rq-entra" style={{ ['--c' as any]: cor }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <IconeQuadrado icone={icone} cor={cor} tamanho={32} />
        <span style={{ fontSize: 16, fontWeight: 500 }}>{titulo}</span>
      </div>
      {lista.length === 0 && <div className="rq-rot" style={{ padding: '12px 4px' }}>Nada no período.</div>}
      {lista.map((f) => (
        <div key={f.chave} className="rq-linha-barra" style={{ ['--c' as any]: cor }} onClick={() => onEscolher(f, `${titulo}: ${f.rotulo}`)} title="Ver estas requisições no quadro">
          <span style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.rotulo}</span>
          <span style={{ fontSize: 13.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {brl(f.valor)} <span style={{ color: 'var(--rq-apag)' }}>· {f.qtd} · {total ? Math.round((f.valor / total) * 100) : 0}%</span>
          </span>
          <div className="rq-barra"><span style={{ width: `${(f.valor / max) * 100}%` }} /></div>
        </div>
      ))}
      {fatias.length > limite && (
        <button type="button" className="rq-btn" style={{ marginTop: 6, height: 32, fontSize: 13 }} onClick={() => setTudo((v) => !v)}>
          {tudo ? 'Mostrar menos' : `Ver todos (${fatias.length})`}
        </button>
      )}
    </div>
  );
}

export default function PainelGastos({ requisicoes, veiculos, nomeDe, onVerNoQuadro }: {
  requisicoes: Req[];
  veiculos: { IdPlaca: any; NumPlaca: string }[];
  /** e-mail/nome cru do solicitante → nome de exibição */
  nomeDe: (s: string) => string;
  onVerNoQuadro: (ids: number[], titulo: string) => void;
}) {
  const [dias, setDias] = useState<number>(() => { try { return Number(localStorage.getItem(CHAVE_PERIODO)) || 90; } catch { return 90; } });
  const escolher = (d: number) => { setDias(d); try { localStorage.setItem(CHAVE_PERIODO, String(d)); } catch { /* sem storage */ } };
  const hoje = useMemo(() => new Date(), []);
  const placa = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of veiculos) m.set(String(v.IdPlaca), v.NumPlaca);
    return (id: string) => m.get(String(id)) || id;
  }, [veiculos]);

  const base = useMemo(() => noPeriodo(requisicoes, hoje, dias), [requisicoes, hoje, dias]);
  const total = useMemo(() => base.reduce((s, r) => s + valorReq(r), 0), [base]);
  const meses = useMemo(() => porMes(requisicoes.filter((r) => normalizarStatus(r.status) !== 'lixeira'), hoje, 12), [requisicoes, hoje]);
  const maxMes = Math.max(1, ...meses.map((m) => m.valor));
  const tempos = useMemo(() => base.map(diasAteFinanceiro).filter((d): d is number => d != null), [base]);
  const abertas = useMemo(() => requisicoes.filter((r) => (FASES_ABERTAS as string[]).includes(normalizarStatus(r.status))), [requisicoes]);
  const valorAberto = abertas.reduce((s, r) => s + valorReq(r), 0);

  const porTipo = useMemo(() => agrupar(base, (r) => normalizarTipo(r.tipo)), [base]);
  const porForn = useMemo(() => agrupar(base.filter((r) => String(r.fornecedor || '').trim()), (r) => String(r.fornecedor).trim().toUpperCase()), [base]);
  const porCarro = useMemo(() => agrupar(base.filter((r) => String(r.veiculo || '').trim()), (r) => String(r.veiculo), placa), [base, placa]);
  const porPessoa = useMemo(() => agrupar(base, (r) => nomeDe(r.solicitante) || '—'), [base, nomeDe]);
  const porFase = useMemo(() => agrupar(abertas, (r) => normalizarStatus(r.status), (k) => ROTULO_FASE[k] || k), [abertas]);
  const semForn = base.filter((r) => !String(r.fornecedor || '').trim());

  // tempo até o financeiro por tipo (mediana), só tipos com 3+ casos
  const tempoPorTipo = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const r of base) { const d = diasAteFinanceiro(r); if (d == null) continue; const k = normalizarTipo(r.tipo); (m.get(k) || m.set(k, []).get(k)!).push(d); }
    return [...m.entries()].filter(([, l]) => l.length >= 3).map(([k, l]) => ({ k, med: mediana(l)!, n: l.length })).sort((a, b) => b.med - a.med);
  }, [base]);

  const ver = (f: Fatia, titulo: string) => onVerNoQuadro(f.ids, titulo);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="rq-rot">Período:</span>
        {PERIODOS.map((p) => (
          <button key={p.dias} type="button" className={`rq-btn ${dias === p.dias ? 'cheio' : ''}`} style={{ height: 34, ['--c' as any]: '#EA580C' }} onClick={() => escolher(p.dias)}>{p.rotulo}</button>
        ))}
        <span className="rq-rot" style={{ marginLeft: 'auto' }}>Pela data da requisição · lixeira fora</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: 12 }}>
        <Tile icone="fa-sack-dollar" cor="#EA580C" rotulo="Gasto no período"><Contador valor={total} formato={brl} /></Tile>
        <Tile icone="fa-file-lines" cor="#2563EB" rotulo="Requisições no período" nota={base.length ? `média de ${brl(total / base.length)} cada` : undefined}><Contador valor={base.length} formato={(n) => Math.round(n).toLocaleString('pt-BR')} /></Tile>
        <Tile icone="fa-hourglass-half" cor="#7C3AED" rotulo="Até chegar no financeiro (metade leva)" nota={tempos.length ? `${tempos.length} requisições com data de envio` : 'sem data de envio no período'}>
          {mediana(tempos) != null ? `${Math.round(mediana(tempos)!)} dias` : '—'}
        </Tile>
        <Tile icone="fa-folder-open" cor="#D97706" rotulo="Abertas agora" nota={brl(valorAberto)}><Contador valor={abertas.length} formato={(n) => Math.round(n).toLocaleString('pt-BR')} /></Tile>
        <Tile icone="fa-store-slash" cor="#64748B" rotulo="Sem fornecedor no período" nota={base.length ? `${Math.round((semForn.length / base.length) * 100)}% das requisições` : undefined}>
          {semForn.length}
        </Tile>
      </div>

      {/* por mês: 12 meses, independe do período escolhido */}
      <div className="rq-card rq-entra" style={{ ['--c' as any]: '#EA580C' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <IconeQuadrado icone="fa-chart-column" cor="#EA580C" tamanho={32} />
          <span style={{ fontSize: 16, fontWeight: 500 }}>Gasto por mês (últimos 12 meses)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))`, gap: 8, alignItems: 'end', height: 190 }}>
          {meses.map((m) => (
            <div key={m.chave} onClick={() => m.qtd && onVerNoQuadro(m.ids, `Mês ${m.rotulo}`)} title={`${m.rotulo}: ${brl(m.valor)} · ${m.qtd} requisições`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end', cursor: m.qtd ? 'pointer' : 'default' }}>
              <span style={{ fontSize: 11, color: 'var(--rq-sec)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{m.valor >= 1000 ? `${(m.valor / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : Math.round(m.valor)}</span>
              <div style={{ width: '100%', maxWidth: 46, height: `${Math.max(2, (m.valor / maxMes) * 140)}px`, borderRadius: '8px 8px 3px 3px', background: 'linear-gradient(180deg, #FB923C, #EA580C)', transition: 'height .7s cubic-bezier(.16,1,.3,1)' }} />
              <span style={{ fontSize: 11.5, color: 'var(--rq-sec)' }}>{m.rotulo}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))', gap: 12 }}>
        <Ranking titulo="Por tipo" icone="fa-tags" cor="#EA580C" fatias={porTipo} total={total} onEscolher={ver} />
        <Ranking titulo="Por fornecedor" icone="fa-store" cor="#7C3AED" fatias={porForn} total={total} onEscolher={ver} />
        <Ranking titulo="Por veículo" icone="fa-car" cor="#2563EB" fatias={porCarro} total={total} onEscolher={ver} />
        <Ranking titulo="Por quem pediu" icone="fa-user" cor="#0891B2" fatias={porPessoa} total={total} onEscolher={ver} />
        <Ranking titulo="Abertas por fase (agora)" icone="fa-layer-group" cor="#D97706" fatias={porFase} total={valorAberto} onEscolher={ver} limite={4} />
        <div className="rq-card rq-entra" style={{ ['--c' as any]: '#7C3AED' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <IconeQuadrado icone="fa-stopwatch" cor="#7C3AED" tamanho={32} />
            <span style={{ fontSize: 16, fontWeight: 500 }}>Tempo até o financeiro por tipo</span>
          </div>
          {tempoPorTipo.length === 0 && <div className="rq-rot" style={{ padding: '12px 4px' }}>Poucos casos com data de envio no período.</div>}
          {tempoPorTipo.map((t) => (
            <div key={t.k} className="rq-linha-barra" style={{ ['--c' as any]: t.med > 20 ? '#DC2626' : t.med > 7 ? '#D97706' : '#16A34A', cursor: 'default' }}>
              <span style={{ fontSize: 13.5 }}>{t.k}</span>
              <span style={{ fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>{Math.round(t.med)} dias <span style={{ color: 'var(--rq-apag)' }}>· {t.n}</span></span>
              <div className="rq-barra"><span style={{ width: `${Math.min(100, (t.med / Math.max(1, tempoPorTipo[0].med)) * 100)}%` }} /></div>
            </div>
          ))}
          <div className="rq-rot" style={{ marginTop: 6 }}>Metade das requisições do tipo chega ao financeiro em até esse número de dias.</div>
        </div>
      </div>
      <div className="rq-rot" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {Object.entries(COR_FASE).filter(([k]) => k !== 'lixeira').map(([k, c]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 99, background: c }} />{ROTULO_FASE[k]}</span>
        ))}
      </div>
    </div>
  );
}
