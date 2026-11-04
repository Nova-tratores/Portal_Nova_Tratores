'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import type { GarantiaResumo, GarantiaStatus } from '@/lib/garantias/types';
import { STATUS_LABEL, STATUS_COR } from '@/lib/garantias/constants';
import { fmtMoeda } from '@/lib/garantias/format';
import type { PecasDaGarantia, PendenteReembolso } from '@/lib/garantias/notas-server';
import GarantiaMiniCard from './GarantiaMiniCard';
import { ChecklistPecasFabrica, faltaChegar } from './PecasFabrica';
import { useIsMobile } from '@/hooks/useIsMobile';

// Colunas VIRTUAIS (não são status) das garantias APROVADAS com algo pendente:
//  - falta_nfse: nenhuma NFS-e de reembolso (Nova → montadora) cobre a garantia;
//  - aguardando_pecas: peça marcada "reposta pela fábrica" que ainda não chegou
//    numa nota de entrada x.949 (às vezes 4–5 meses);
//  - devolucao_pecas / guarda_pecas: como antes.
// Uma aprovada pode ter várias pendências: o card aparece em CADA coluna em que
// falta algo, com selos das outras, e sai de cada uma quando aquela parte resolve.
type Coluna = GarantiaStatus | 'falta_nfse' | 'aguardando_pecas' | 'devolucao_pecas' | 'guarda_pecas';

const COLUNAS: Coluna[] = [
  'aberta', 'em_analise', 'bo_tecnico', 'enviada', 'info_pendente',
  'aguardando_servico', 'ressarcimento_fabrica', 'falta_nfse', 'aguardando_pecas', 'devolucao_pecas', 'guarda_pecas',
];
// Fases que só aparecem quando têm card (o board não alarga pra quem não usa).
const COLUNAS_CONDICIONAIS: Coluna[] = ['aguardando_servico', 'ressarcimento_fabrica', 'devolucao_pecas', 'guarda_pecas'];

const COL_LABEL: Record<Coluna, string> = {
  ...STATUS_LABEL,
  falta_nfse: 'Aprovada · falta NFS-e de reembolso',
  aguardando_pecas: 'Aprovada · aguardando peças da fábrica',
  devolucao_pecas: 'Devolução de peças',
  guarda_pecas: 'Guarda de peças',
};
const COL_COR: Record<Coluna, string> = {
  ...STATUS_COR, falta_nfse: '#16a34a', aguardando_pecas: '#d97706', devolucao_pecas: '#b45309', guarda_pecas: '#0e7490',
};
const PEND_ROTULO: Partial<Record<Coluna, string>> = {
  falta_nfse: 'NFS-e', aguardando_pecas: 'peças da fábrica', devolucao_pecas: 'devolução', guarda_pecas: 'guarda',
};

interface Props {
  garantias: GarantiaResumo[];
  onCardClick: (g: GarantiaResumo) => void;
  /** muda quando algo foi salvo — relê as aprovadas, notas e peças */
  refreshKey?: number;
  podeEditar?: boolean;
}

function diasDesde(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export default function GarantiasBoard({ garantias, onCardClick, refreshKey = 0, podeEditar = true }: Props) {
  const isMobile = useIsMobile();
  const [aprovadas, setAprovadas] = useState<GarantiaResumo[]>([]);
  const [semNfse, setSemNfse] = useState<Set<string>>(new Set());
  const [pecas, setPecas] = useState<Map<string, PecasDaGarantia>>(new Map());
  const [abertoPecas, setAbertoPecas] = useState<string | null>(null);

  // Aprovadas (o kanban recebe só as abertas) + quem falta NFS-e + peças da fábrica
  useEffect(() => {
    let vivo = true;
    fetchAuth('/api/garantias?status=aprovada').then((r) => r.json()).then(async (j) => {
      const lista: GarantiaResumo[] = j.garantias || [];
      if (!vivo) return;
      setAprovadas(lista);
      const montadoras = [...new Set(lista.map((g) => g.montadora_id).filter(Boolean))] as string[];
      const [rs, pf] = await Promise.all([
        Promise.all(montadoras.map((m) => fetchAuth(`/api/garantias/reembolso?montadora=${m}`).then((r) => r.json()).catch(() => ({ pendentes: [] })))),
        fetchAuth('/api/garantias/pecas-fabrica').then((r) => r.json()).catch(() => ({ garantias: [] })),
      ]);
      if (!vivo) return;
      setSemNfse(new Set(rs.flatMap((r) => (r.pendentes || []).map((p: PendenteReembolso) => p.id))));
      setPecas(new Map(((pf.garantias || []) as PecasDaGarantia[]).map((x) => [x.garantiaId, x])));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [refreshKey]);

  const todas = useMemo(() => {
    const m = new Map<string, GarantiaResumo>();
    for (const g of [...garantias, ...aprovadas]) m.set(g.id, g);
    return [...m.values()];
  }, [garantias, aprovadas]);

  const pendenciasDe = (g: GarantiaResumo): Coluna[] => {
    if (g.status !== 'aprovada') return [g.status];
    const p: Coluna[] = [];
    if (semNfse.has(g.id)) p.push('falta_nfse');
    if (faltaChegar(pecas.get(g.id)) > 0) p.push('aguardando_pecas');
    if (g.devolucao_status === 'pendente') p.push('devolucao_pecas');
    if (g.guarda_status === 'pendente') p.push('guarda_pecas');
    return p;
  };

  const porColuna = new Map<Coluna, GarantiaResumo[]>(COLUNAS.map((c) => [c, []]));
  for (const g of todas) for (const c of pendenciasDe(g)) porColuna.get(c)?.push(g);

  const colunasVisiveis = COLUNAS.filter(
    (col) => !COLUNAS_CONDICIONAIS.includes(col) || (porColuna.get(col) || []).length > 0
  ).filter(
    // No celular esconde colunas vazias (empilhado, cada coluna vira uma seção).
    (col) => !isMobile || (porColuna.get(col) || []).length > 0
  );

  // ── arrastar o quadro com o mouse + setas (clique curto continua abrindo o card)
  const quadroRef = useRef<HTMLDivElement>(null);
  const arraste = useRef<{ x: number; left: number; moveu: boolean } | null>(null);
  const iniciarArraste = (e: React.MouseEvent) => {
    if (isMobile || e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, textarea')) return;
    arraste.current = { x: e.clientX, left: quadroRef.current?.scrollLeft || 0, moveu: false };
  };
  const moverArraste = (e: React.MouseEvent) => {
    const a = arraste.current;
    if (!a || !quadroRef.current) return;
    const dx = e.clientX - a.x;
    if (!a.moveu && Math.abs(dx) < 6) return;
    a.moveu = true;
    quadroRef.current.scrollLeft = a.left - dx;
  };
  const soltarArraste = () => {
    const a = arraste.current;
    arraste.current = null;
    if (a?.moveu) {
      // engole o clique que vem logo depois de soltar (não abre o card)
      const engolir = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', engolir, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', engolir, { capture: true }), 50);
    }
  };
  const rolar = (dir: number) => quadroRef.current?.scrollBy({ left: dir * 520, behavior: 'smooth' });

  const selo = (cor: string): React.CSSProperties => ({ border: `1px solid ${cor}`, color: cor, borderRadius: 999, padding: '1px 8px', fontSize: 10, fontWeight: 700 });

  const extraDo = (g: GarantiaResumo, col: Coluna) => {
    if (g.status !== 'aprovada') return null;
    const outras = pendenciasDe(g).filter((p) => p !== col && PEND_ROTULO[p]);
    const info = pecas.get(g.id);
    const dias = diasDesde(g.finalizada_em);
    const chave = `${col}:${g.id}`;
    return (
      <div onClick={(e) => { if ((e.target as HTMLElement).closest('button')) e.stopPropagation(); }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {col === 'falta_nfse' && <span style={selo('#16a34a')}>Pago {fmtMoeda(g.valor_pago_total)}</span>}
          {col === 'aguardando_pecas' && (
            <span style={selo(dias > 150 ? '#dc2626' : dias > 90 ? '#d97706' : '#64748b')}>esperando há {dias} d</span>
          )}
          {outras.map((p) => <span key={p} style={selo('#64748b')}>também: {PEND_ROTULO[p]}</span>)}
        </div>
        {col === 'aguardando_pecas' && info && (
          <div style={{ marginTop: 6 }}>
            <button onClick={() => setAbertoPecas(abertoPecas === chave ? null : chave)}
              style={{ border: 'none', background: 'transparent', color: '#d97706', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '4px 0', minHeight: 30 }}>
              {abertoPecas === chave ? '▾' : '▸'} Peças ({faltaChegar(info)} a chegar)
            </button>
            {abertoPecas === chave && (
              <ChecklistPecasFabrica info={info} podeEditar={podeEditar}
                onMudou={(novo) => setPecas((m) => new Map(m).set(g.id, novo))} />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {!isMobile && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center', marginBottom: 6, fontSize: 11, color: 'var(--portal-text-muted)' }}>
          <span>Arraste o quadro para o lado ou use as setas</span>
          <button onClick={() => rolar(-1)} style={seta} title="Fases anteriores">◀</button>
          <button onClick={() => rolar(1)} style={seta} title="Próximas fases">▶</button>
        </div>
      )}
      <div
        ref={quadroRef}
        onMouseDown={iniciarArraste}
        onMouseMove={moverArraste}
        onMouseUp={soltarArraste}
        onMouseLeave={soltarArraste}
        style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, overflowX: isMobile ? 'visible' : 'auto', paddingBottom: 8, cursor: isMobile ? undefined : 'grab' }}
      >
        {colunasVisiveis.map((col) => {
          const itens = porColuna.get(col) || [];
          const nova = col === 'falta_nfse' || col === 'aguardando_pecas';
          return (
            <div
              key={col}
              style={{
                flex: isMobile ? '1 1 auto' : '1 0 250px',
                minWidth: isMobile ? 0 : 250,
                width: isMobile ? '100%' : undefined,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: COL_COR[col] + '14',
                  borderBottom: `2px solid ${COL_COR[col]}`,
                }}
                title={nova ? (col === 'falta_nfse'
                  ? 'Aprovadas que nenhuma NFS-e de reembolso (Nova → montadora) cobre ainda'
                  : 'Aprovadas com peça que a fábrica vai repor e que ainda não chegou') : undefined}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: COL_COR[col], textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {COL_LABEL[col]}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: COL_COR[col], background: 'var(--portal-bg-card)', borderRadius: 10, padding: '1px 8px' }}>
                  {itens.length}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  // Coluna cheia (ex.: 19 na fábrica) rola POR DENTRO — sem isso a
                  // página estica e a rolagem horizontal do board fica lá embaixo.
                  maxHeight: isMobile ? undefined : 'max(320px, calc(100vh - 350px))',
                  overflowY: isMobile ? undefined : 'auto',
                  paddingRight: isMobile ? 0 : 2,
                }}
              >
                {itens.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--portal-text-faint)', textAlign: 'center', padding: '16px 0' }}>
                    Vazio
                  </div>
                ) : (
                  itens.map((g) => (
                    <GarantiaMiniCard key={`${col}:${g.id}`} garantia={g} onClick={() => onCardClick(g)}
                      cor={g.status === 'aprovada' ? COL_COR[col] : undefined} extra={extraDo(g, col)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const seta: React.CSSProperties = { width: 32, height: 28, borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', cursor: 'pointer', fontSize: 12 };
