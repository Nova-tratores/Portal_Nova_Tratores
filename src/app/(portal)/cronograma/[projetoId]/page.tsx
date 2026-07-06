'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { ChevronLeft, RefreshCw, Plus, AlertTriangle, Loader2, Flag, BarChart3, Repeat, Link2 } from 'lucide-react';
import {
  carregarProjeto, recalcular, atualizarTarefa,
  type ProjetoCompleto,
} from '@/lib/cronograma/queries';
import { paraFrappe, montarEntradaMotor, calendarioDaTarefa } from '@/lib/cronograma/adaptador';
import { calcular, diasUteisEntre, type ErroMotor } from '@/lib/cronograma/motor';
import { detectarConflitos } from '@/lib/cronograma/conflitos';
import type { ViewMode } from '@/components/cronograma/GanttView';

const GanttView = dynamic(() => import('@/components/cronograma/GanttView'), { ssr: false });
const TarefaDrawer = dynamic(() => import('@/components/cronograma/TarefaDrawer'), { ssr: false });
const AnalisePanel = dynamic(() => import('@/components/cronograma/AnalisePanel'), { ssr: false });
const RecorrenciasPanel = dynamic(() => import('@/components/cronograma/RecorrenciasPanel'), { ssr: false });
const VinculosPanel = dynamic(() => import('@/components/cronograma/VinculosPanel'), { ssr: false });

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function TimelineProjetoPage() {
  const { projetoId } = useParams<{ projetoId: string }>();
  const [pc, setPc] = useState<ProjetoCompleto | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('Day');
  const [recalculando, setRecalculando] = useState(false);
  const [erros, setErros] = useState<ErroMotor[]>([]);
  const [drawer, setDrawer] = useState<{ tarefaId: string | null } | null>(null);
  const [painel, setPainel] = useState<'analise' | 'recorrencia' | 'vinculos' | null>(null);

  const carregar = useCallback(async () => {
    try { setPc(await carregarProjeto(projetoId)); }
    catch (e) { console.error('cronograma: erro ao carregar projeto', e); }
    finally { setLoading(false); }
  }, [projetoId]);

  useEffect(() => { carregar(); }, [carregar]);
  useRefreshOnFocus(carregar); // recarrega ao voltar o foco (no lugar do Realtime)

  // Nota: NÃO usamos postgres_changes aqui. Assinar Realtime num schema
  // não-`public` derrubava a conexão Realtime compartilhada (quebrava o
  // chat). O frescor vem do reload após cada mutação (recalcEReload). Live
  // multiusuário fica como evolução (via Broadcast ou client dedicado).
  const recalcEReload = useCallback(async () => {
    setRecalculando(true);
    try {
      const res = await recalcular(projetoId);
      const saida = (res as { saida?: { erros?: ErroMotor[] } }).saida;
      setErros(saida?.erros ?? []);
    } catch (e) {
      console.error('cronograma: erro no recálculo', e);
    } finally {
      await carregar();
      setRecalculando(false);
    }
  }, [projetoId, carregar]);

  const conflitos = useMemo(() => {
    if (!pc) return { porRecurso: [], tarefasEmConflito: new Set<string>() };
    return detectarConflitos(
      pc.tarefas.map((t) => ({ id: t.id, nome: t.nome, inicio: t.inicio_calc, fim: t.fim_calc, recursoId: t.recurso_id })),
      pc.alocacoes.map((a) => ({ tarefaId: a.tarefa_id, recursoId: a.recurso_id, percentual: Number(a.percentual) })),
    );
  }, [pc]);

  const frappeTasks = useMemo(
    () => (pc ? paraFrappe(pc.tarefas, pc.dependencias, pc.projeto.data_inicio, conflitos.tarefasEmConflito) : []),
    [pc, conflitos],
  );

  // Drag/resize de uma barra → preview otimista + persiste + recalcula.
  const onDateChange = useCallback(async (id: string, start: Date, end: Date) => {
    if (!pc) return;
    const tarefa = pc.tarefas.find((t) => t.id === id);
    if (!tarefa) return;
    const inicio = isoLocal(start);
    const fim = isoLocal(end);
    const cal = calendarioDaTarefa(pc, tarefa);
    const novaDuracao = diasUteisEntre(cal, inicio, fim) + 1; // inclusivo
    const edits = { duracao: novaDuracao, restricao: 'iniciar_nao_antes' as const, restricaoData: inicio };

    // preview otimista: roda o motor localmente e atualiza as barras na hora
    const entrada = montarEntradaMotor(pc);
    const tIn = entrada.tarefas.find((t) => t.id === id);
    if (tIn) { tIn.duracaoDias = novaDuracao; tIn.restricao = 'iniciar_nao_antes'; tIn.restricaoData = inicio; }
    const saida = calcular(entrada);
    const out = new Map(saida.tarefas.map((t) => [t.id, t]));
    setPc({
      ...pc,
      tarefas: pc.tarefas.map((t) => {
        const o = out.get(t.id);
        const patch = t.id === id ? { duracao_dias: novaDuracao, restricao: 'iniciar_nao_antes' as const, restricao_data: inicio } : {};
        return o ? { ...t, inicio_calc: o.inicioCalc, fim_calc: o.fimCalc, folga_dias: o.folgaDias, e_critica: o.eCritica, ...patch } : t;
      }),
    });

    // persiste + recálculo autoritativo (reconcilia via reload)
    try {
      await atualizarTarefa(id, edits);
      await recalcEReload();
    } catch (e) {
      console.error('cronograma: erro ao mover tarefa', e);
      carregar(); // reverte para a verdade do servidor
    }
  }, [pc, recalcEReload, carregar]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Loader2 className="animate-spin" /></div>;
  }
  if (!pc) {
    return <div style={{ padding: 40 }}>Projeto não encontrado. <Link href="/cronograma">Voltar</Link></div>;
  }

  const criticas = pc.tarefas.filter((t) => t.e_critica).length;
  const nomeRecurso = (id: string) => pc.recursos.find((r) => r.id === id)?.nome ?? '?';

  return (
    <div style={{ padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <Link href="/cronograma" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--portal-text-muted,#888)', textDecoration: 'none' }}>
          <ChevronLeft size={18} /> Projetos
        </Link>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--portal-text)' }}>{pc.projeto.nome}</h1>
        {pc.projeto.data_fim_calc && (
          <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>
            fim previsto: <strong>{fmt(pc.projeto.data_fim_calc)}</strong>
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#dc2626' }}>
          <Flag size={14} /> {criticas} crítica(s)
        </span>
        {conflitos.porRecurso.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#b45309' }}>
            <AlertTriangle size={14} /> {conflitos.porRecurso.length} recurso(s) sobrecarregado(s)
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text)' }}>
            <option value="Day">Dia</option><option value="Week">Semana</option><option value="Month">Mês</option>
          </select>
          <button onClick={recalcEReload} disabled={recalculando} title="Recalcular datas e caminho crítico"
            style={btn('#0ea5e9')}>
            <RefreshCw size={16} className={recalculando ? 'animate-spin' : ''} /> Recalcular
          </button>
          <button onClick={() => setDrawer({ tarefaId: null })} style={btn('#dc2626')}>
            <Plus size={16} /> Nova tarefa
          </button>
          <button onClick={() => setPainel((p) => (p === 'analise' ? null : 'analise'))} style={btn(painel === 'analise' ? '#0369a1' : '#6b7280')}>
            <BarChart3 size={16} /> Análise
          </button>
          <button onClick={() => setPainel((p) => (p === 'recorrencia' ? null : 'recorrencia'))} style={btn(painel === 'recorrencia' ? '#0369a1' : '#6b7280')}>
            <Repeat size={16} /> Recorrências
          </button>
          <button onClick={() => setPainel((p) => (p === 'vinculos' ? null : 'vinculos'))} style={btn(painel === 'vinculos' ? '#0369a1' : '#6b7280')}>
            <Link2 size={16} /> Vínculos
          </button>
        </div>
      </header>

      {erros.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          {erros.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b91c1c', fontSize: 13 }}>
              <AlertTriangle size={15} />
              {e.tipo === 'ciclo' ? 'Dependências formam um ciclo — datas não recalculadas.' : e.detalhe}
            </div>
          ))}
        </div>
      )}

      <div style={{ background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#eee)', borderRadius: 12, overflow: 'auto' }}>
        <GanttView
          tasks={frappeTasks}
          viewMode={viewMode}
          onDateChange={onDateChange}
          onClick={(id) => setDrawer({ tarefaId: id })}
        />
      </div>

      {conflitos.porRecurso.length > 0 && (
        <div style={{ marginTop: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 14 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: '#b45309', marginBottom: 8 }}>
            <AlertTriangle size={15} /> Carga por recurso — conflitos (acima de 100% no mesmo dia)
          </h3>
          {conflitos.porRecurso.map((c) => (
            <div key={c.recursoId} style={{ fontSize: 13, color: '#92400e', marginBottom: 4 }}>
              <strong>{nomeRecurso(c.recursoId)}</strong>: {c.dias.length} dia(s) —{' '}
              {c.dias.slice(0, 3).map((d) => `${fmt(d.data)} (${d.total}%)`).join(', ')}{c.dias.length > 3 ? '…' : ''}
            </div>
          ))}
          <p style={{ fontSize: 12, color: '#a16207', marginTop: 8 }}>
            Resolução é manual (mover tarefa, trocar recurso ou dividir). O sistema não nivela automaticamente.
          </p>
        </div>
      )}

      <p style={{ marginTop: 10, fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
        Barras em <span style={{ color: '#dc2626', fontWeight: 600 }}>vermelho</span> = caminho crítico;
        contorno <span style={{ color: '#f59e0b', fontWeight: 600 }}>laranja</span> = recurso em conflito.
        Arraste para mover/redimensionar; clique para editar.
      </p>

      {painel === 'analise' && <AnalisePanel pc={pc} onChanged={recalcEReload} />}
      {painel === 'recorrencia' && <RecorrenciasPanel pc={pc} onChanged={recalcEReload} />}
      {painel === 'vinculos' && <VinculosPanel pc={pc} onChanged={carregar} />}

      {drawer && (
        <TarefaDrawer
          pc={pc}
          tarefaId={drawer.tarefaId}
          onClose={() => setDrawer(null)}
          onSaved={async () => { setDrawer(null); await recalcEReload(); }}
          onRecalc={recalcEReload}
        />
      )}
    </div>
  );
}

const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
const btn = (cor: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, background: cor, color: '#fff', border: 'none',
  padding: '8px 14px', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer',
});
