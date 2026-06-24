'use client';
// Fase 5 — análise gerencial: caminho crítico, baseline (desvio), plano×real
// e exportação. Recebe o ProjetoCompleto já carregado.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Flag, Save, Download, Trash2, Loader2 } from 'lucide-react';
import {
  listarBaselines, salvarBaseline, removerBaseline, listarBaselineTarefas,
  type ProjetoCompleto, type BaselineRow,
} from '@/lib/cronograma/queries';

const diffDias = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
const fmt = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—');

export default function AnalisePanel({ pc, onChanged }: { pc: ProjetoCompleto; onChanged: () => void | Promise<void> }) {
  const criticas = pc.tarefas.filter((t) => t.e_critica);

  // ── baseline ───────────────────────────────────────────────────────
  const [baselines, setBaselines] = useState<BaselineRow[]>([]);
  const [selBaseline, setSelBaseline] = useState<string>('');
  const [desvios, setDesvios] = useState<Map<string, number>>(new Map());
  const [salvando, setSalvando] = useState(false);

  const carregarBaselines = useCallback(async () => setBaselines(await listarBaselines(pc.projeto.id)), [pc.projeto.id]);
  useEffect(() => { carregarBaselines(); }, [carregarBaselines]);

  useEffect(() => {
    if (!selBaseline) { setDesvios(new Map()); return; }
    listarBaselineTarefas(selBaseline).then((bts) => {
      const m = new Map<string, number>();
      const fimAtual = new Map(pc.tarefas.map((t) => [t.id, t.fim_calc]));
      for (const bt of bts) {
        const atual = fimAtual.get(bt.tarefa_id);
        if (bt.fim && atual) m.set(bt.tarefa_id, diffDias(bt.fim, atual)); // + = atraso
      }
      setDesvios(m);
    });
  }, [selBaseline, pc.tarefas]);

  async function novoBaseline() {
    const nome = prompt('Nome da baseline:', `Baseline ${new Date().toLocaleDateString('pt-BR')}`);
    if (nome === null) return;
    setSalvando(true);
    try { await salvarBaseline(pc.projeto.id, nome); await carregarBaselines(); }
    finally { setSalvando(false); }
  }
  async function excluirBaseline(id: string) {
    if (!confirm('Remover esta baseline?')) return;
    await removerBaseline(id);
    if (selBaseline === id) setSelBaseline('');
    await carregarBaselines();
  }

  // ── plano × real (curva-S simples) ─────────────────────────────────
  const curva = useMemo(() => {
    const comFim = pc.tarefas.filter((t) => t.fim_calc);
    const total = comFim.length || 1;
    const datas = [...new Set(comFim.map((t) => t.fim_calc as string))].sort();
    return datas.map((d) => {
      const planejado = comFim.filter((t) => (t.fim_calc as string) <= d).length / total * 100;
      const realizado = comFim.filter((t) => t.status === 'concluida' && (t.fim_real ?? t.fim_calc) && (t.fim_real ?? t.fim_calc)! <= d).length / total * 100;
      return { data: fmt(d), planejado: Math.round(planejado), realizado: Math.round(realizado) };
    });
  }, [pc.tarefas]);

  // ── export ─────────────────────────────────────────────────────────
  function baixar(nome: string, conteudo: string, mime: string) {
    const blob = new Blob([conteudo], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome; a.click();
    URL.revokeObjectURL(url);
  }
  function exportCSV() {
    const head = ['nome', 'inicio_calc', 'fim_calc', 'duracao_dias', 'status', 'progresso', 'e_critica', 'folga_dias'];
    const linhas = pc.tarefas.map((t) =>
      [t.nome, t.inicio_calc ?? '', t.fim_calc ?? '', t.duracao_dias, t.status, t.progresso, t.e_critica, t.folga_dias ?? '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    baixar(`${pc.projeto.nome}.csv`, [head.join(','), ...linhas].join('\n'), 'text/csv;charset=utf-8');
  }
  function exportJSON() {
    baixar(`${pc.projeto.nome}.json`, JSON.stringify({ projeto: pc.projeto, tarefas: pc.tarefas, dependencias: pc.dependencias }, null, 2), 'application/json');
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14, marginTop: 14 }}>
      {/* caminho crítico */}
      <Card titulo={<><Flag size={15} color="#dc2626" /> Caminho crítico</>}>
        <Linha k="Fim do projeto" v={fmt(pc.projeto.data_fim_calc)} />
        <Linha k="Tarefas críticas" v={`${criticas.length} de ${pc.tarefas.length}`} />
        <div style={{ marginTop: 8, maxHeight: 120, overflowY: 'auto' }}>
          {criticas.map((t) => (
            <div key={t.id} style={{ fontSize: 13, color: '#b91c1c', padding: '2px 0' }}>• {t.nome}</div>
          ))}
        </div>
      </Card>

      {/* baseline / desvio */}
      <Card titulo={<><Save size={15} /> Baseline (plano × real)</>}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button onClick={novoBaseline} disabled={salvando} style={btn('#dc2626')}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar baseline
          </button>
        </div>
        {baselines.length > 0 && (
          <select value={selBaseline} onChange={(e) => setSelBaseline(e.target.value)} style={input}>
            <option value="">— comparar com baseline —</option>
            {baselines.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        )}
        {selBaseline && (
          <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto' }}>
            {pc.tarefas.map((t) => {
              const d = desvios.get(t.id);
              if (d === undefined) return null;
              const cor = d > 0 ? '#dc2626' : d < 0 ? '#10b981' : 'var(--portal-text-muted,#888)';
              const txt = d > 0 ? `+${d}d atraso` : d < 0 ? `${d}d adianto` : 'no prazo';
              return (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                  <span style={{ color: 'var(--portal-text)' }}>{t.nome}</span>
                  <span style={{ color: cor, fontWeight: 600 }}>{txt}</span>
                </div>
              );
            })}
            <div style={{ marginTop: 6, textAlign: 'right' }}>
              <button onClick={() => excluirBaseline(selBaseline)} style={{ ...btn('transparent'), color: '#dc2626', border: '1px solid #fecaca' }}>
                <Trash2 size={13} /> Remover baseline
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* curva plano × real */}
      <Card titulo="Progresso planejado × realizado">
        {curva.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Recalcule o projeto para ver a curva.</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={curva} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="data" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="planejado" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="realizado" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* export */}
      <Card titulo={<><Download size={15} /> Exportar</>}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportCSV} style={btn('#10b981')}><Download size={14} /> CSV</button>
          <button onClick={exportJSON} style={btn('#6b7280')}><Download size={14} /> JSON</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)', marginTop: 8 }}>Tarefas + datas + dependências.</p>
      </Card>
    </div>
  );
}

function Card({ titulo, children }: { titulo: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#eee)', borderRadius: 12, padding: 14 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 10 }}>{titulo}</h3>
      {children}
    </div>
  );
}
function Linha({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
      <span style={{ color: 'var(--portal-text-muted,#888)' }}>{k}</span>
      <span style={{ fontWeight: 600, color: 'var(--portal-text)' }}>{v}</span>
    </div>
  );
}
const btn = (cor: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 5, background: cor, color: cor === 'transparent' ? '#dc2626' : '#fff', border: 'none', padding: '7px 12px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' });
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text)', fontSize: 14 };
