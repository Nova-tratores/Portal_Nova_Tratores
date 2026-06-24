'use client';
import { useState } from 'react';
import { X, Loader2, Trash2, Link2, AlertTriangle } from 'lucide-react';
import {
  criarTarefa, atualizarTarefa, registrarProgresso,
  criarDependencia, removerDependencia, alocar, desalocar, removerTarefa,
  type ProjetoCompleto, type TarefaRow, type DependenciaRow,
} from '@/lib/cronograma/queries';

const RESTRICOES: [TarefaRow['restricao'], string][] = [
  ['asap', 'O quanto antes (ASAP)'],
  ['iniciar_nao_antes', 'Não iniciar antes de'],
  ['iniciar_nao_depois', 'Não iniciar depois de'],
  ['data_fixa', 'Data fixa'],
];
const TIPOS_DEP: [DependenciaRow['tipo'], string][] = [
  ['FS', 'Fim → Início (FS)'], ['SS', 'Início → Início (SS)'],
  ['FF', 'Fim → Fim (FF)'], ['SF', 'Início → Fim (SF)'],
];
const PRIORIDADES = ['Sem', 'Baixa', 'Normal', 'Alta', 'Urgente', 'Crítica'];

interface Props {
  pc: ProjetoCompleto;
  tarefaId: string | null; // null = criar
  onClose: () => void;
  onSaved: () => void | Promise<void>;   // fechar + recalcular
  onRecalc: () => void | Promise<void>;  // recalcular mantendo aberto
}

export default function TarefaDrawer({ pc, tarefaId, onClose, onSaved, onRecalc }: Props) {
  const editando = pc.tarefas.find((t) => t.id === tarefaId) ?? null;

  const [nome, setNome] = useState(editando?.nome ?? '');
  const [descricao, setDescricao] = useState(editando?.descricao ?? '');
  const [duracao, setDuracao] = useState<number>(Number(editando?.duracao_dias ?? 1));
  const [recursoId, setRecursoId] = useState<string>(editando?.recurso_id ?? '');
  const [restricao, setRestricao] = useState<TarefaRow['restricao']>(editando?.restricao ?? 'asap');
  const [restricaoData, setRestricaoData] = useState<string>(editando?.restricao_data ?? '');
  const [prioridade, setPrioridade] = useState<number>(editando?.prioridade ?? 0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome da tarefa.'); return; }
    if (restricao !== 'asap' && !restricaoData) { setErro('Informe a data da restrição.'); return; }
    setSalvando(true); setErro(null);
    try {
      const comum = {
        nome: nome.trim(), descricao: descricao || null, duracao,
        recursoId: recursoId || null, restricao,
        restricaoData: restricao === 'asap' ? null : restricaoData, prioridade,
      };
      if (editando) await atualizarTarefa(editando.id, comum);
      else await criarTarefa({ projetoId: pc.projeto.id, ...comum });
      await onSaved();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar');
      setSalvando(false);
    }
  }

  return (
    <div onClick={onClose} style={overlay}>
      <aside onClick={(e) => e.stopPropagation()} style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--portal-text)' }}>
            {editando ? 'Editar tarefa' : 'Nova tarefa'}
          </h2>
          <button onClick={onClose} style={iconBtn}><X size={20} /></button>
        </div>

        <Campo label="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} style={input} autoFocus />
        </Campo>
        <Campo label="Descrição">
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} />
        </Campo>
        <div style={{ display: 'flex', gap: 10 }}>
          <Campo label="Duração (dias úteis)" flex>
            <input type="number" min={0} step={0.5} value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} style={input} />
          </Campo>
          <Campo label="Prioridade" flex>
            <select value={prioridade} onChange={(e) => setPrioridade(Number(e.target.value))} style={input}>
              {PRIORIDADES.map((p, i) => <option key={i} value={i}>{p}</option>)}
            </select>
          </Campo>
        </div>
        <Campo label="Recurso">
          <select value={recursoId} onChange={(e) => setRecursoId(e.target.value)} style={input}>
            <option value="">— nenhum (calendário do projeto) —</option>
            {pc.recursos.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </Campo>
        <div style={{ display: 'flex', gap: 10 }}>
          <Campo label="Restrição" flex>
            <select value={restricao} onChange={(e) => setRestricao(e.target.value as TarefaRow['restricao'])} style={input}>
              {RESTRICOES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Campo>
          {restricao !== 'asap' && (
            <Campo label="Data" flex>
              <input type="date" value={restricaoData} onChange={(e) => setRestricaoData(e.target.value)} style={input} />
            </Campo>
          )}
        </div>

        {/* saída do motor (read-only) */}
        {editando && (
          <div style={{ background: 'var(--portal-bg,#f7f8fa)', borderRadius: 10, padding: 12, margin: '8px 0 4px', fontSize: 13 }}>
            <Linha k="Início calc." v={editando.inicio_calc ? fmt(editando.inicio_calc) : '—'} />
            <Linha k="Fim calc." v={editando.fim_calc ? fmt(editando.fim_calc) : '—'} />
            <Linha k="Folga" v={editando.folga_dias != null ? `${editando.folga_dias} dia(s)` : '—'} />
            <Linha k="Crítica" v={editando.e_critica ? 'Sim' : 'Não'} cor={editando.e_critica ? '#dc2626' : undefined} />
            <Linha k="Status" v={editando.status} />
          </div>
        )}

        {erro && <div style={{ color: '#dc2626', fontSize: 13, margin: '8px 0' }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={salvar} disabled={salvando} style={primary}>
            {salvando && <Loader2 size={18} className="animate-spin" />} {editando ? 'Salvar' : 'Criar tarefa'}
          </button>
          {editando && (
            <button
              onClick={async () => {
                const temSuc = pc.dependencias.some((d) => d.predecessora_id === editando.id);
                if (!confirm(`Excluir "${editando.nome}"?${temSuc ? ' Ela é predecessora de outra(s) tarefa(s); as dependências serão removidas.' : ''}`)) return;
                await removerTarefa(editando.id);
                await onSaved();
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 10, padding: '0 14px', fontWeight: 600, cursor: 'pointer' }}
            >
              <Trash2 size={16} /> Excluir
            </button>
          )}
        </div>

        {editando && (
          <>
            <AlocacoesBloco pc={pc} tarefa={editando} onRecalc={onRecalc} />
            <ProgressoBloco tarefa={editando} onRecalc={onRecalc} />
            <DependenciasBloco pc={pc} tarefa={editando} onRecalc={onRecalc} />
          </>
        )}
      </aside>
    </div>
  );
}

// ── progresso / bloqueio ─────────────────────────────────────────────
function ProgressoBloco({ tarefa, onRecalc }: { tarefa: TarefaRow; onRecalc: Props['onRecalc'] }) {
  const [prog, setProg] = useState<number>(Number(tarefa.progresso) || 0);
  const [inicioReal, setInicioReal] = useState<string>(tarefa.inicio_real ?? '');
  const [fimReal, setFimReal] = useState<string>(tarefa.fim_real ?? '');
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true); setAviso(null);
    try {
      const r = await registrarProgresso({
        tarefaId: tarefa.id, progresso: prog,
        inicioReal: inicioReal || null, fimReal: fimReal || null,
      });
      if (r.aviso) setAviso(r.aviso);
      await onRecalc();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Erro ao registrar progresso');
    } finally { setSalvando(false); }
  }

  return (
    <Secao titulo="Progresso & execução">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="range" min={0} max={100} value={prog} onChange={(e) => setProg(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ width: 42, textAlign: 'right', fontWeight: 600, color: 'var(--portal-text)' }}>{prog}%</span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Campo label="Início real" flex><input type="date" value={inicioReal} onChange={(e) => setInicioReal(e.target.value)} style={input} /></Campo>
        <Campo label="Fim real" flex><input type="date" value={fimReal} onChange={(e) => setFimReal(e.target.value)} style={input} /></Campo>
      </div>
      {aviso && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b45309', fontSize: 13, marginBottom: 8 }}>
          <AlertTriangle size={15} /> {aviso}
        </div>
      )}
      <button onClick={salvar} disabled={salvando} style={{ ...primary, background: '#0ea5e9' }}>
        {salvando && <Loader2 size={16} className="animate-spin" />} Salvar progresso
      </button>
    </Secao>
  );
}

// ── alocações de recurso ─────────────────────────────────────────────
function AlocacoesBloco({ pc, tarefa, onRecalc }: { pc: ProjetoCompleto; tarefa: TarefaRow; onRecalc: Props['onRecalc'] }) {
  const aloc = pc.alocacoes.filter((a) => a.tarefa_id === tarefa.id);
  const nomeRec = (id: string) => pc.recursos.find((r) => r.id === id)?.nome ?? '?';
  const candidatos = pc.recursos.filter((r) => r.ativo && !aloc.some((a) => a.recurso_id === r.id));
  const [recId, setRecId] = useState('');
  const [pct, setPct] = useState(100);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!recId) return;
    setBusy(true);
    try { await alocar({ tarefaId: tarefa.id, recursoId: recId, percentual: pct }); setRecId(''); setPct(100); await onRecalc(); }
    finally { setBusy(false); }
  }
  async function rem(id: string) {
    setBusy(true);
    try { await desalocar(id); await onRecalc(); } finally { setBusy(false); }
  }

  return (
    <Secao titulo="Alocações de recurso">
      {aloc.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)', marginBottom: 8 }}>
          Nenhuma alocação explícita. O recurso principal da tarefa (se houver) conta como 100% na detecção de conflito.
        </div>
      )}
      {aloc.map((a) => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
          <span style={{ flex: 1, color: 'var(--portal-text)' }}>{nomeRec(a.recurso_id)}</span>
          <span style={{ fontWeight: 600, color: 'var(--portal-text)' }}>{Number(a.percentual)}%</span>
          <button onClick={() => rem(a.id)} disabled={busy} style={iconBtn}><Trash2 size={15} color="#dc2626" /></button>
        </div>
      ))}
      {candidatos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <select value={recId} onChange={(e) => setRecId(e.target.value)} style={{ ...input, flex: 1 }}>
            <option value="">+ recurso…</option>
            {candidatos.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
          <input type="number" min={1} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} title="% de alocação" style={{ ...input, width: 72 }} />
          <button onClick={add} disabled={busy || !recId} style={{ ...primary, width: 'auto', padding: '8px 14px', margin: 0 }}>Add</button>
        </div>
      )}
    </Secao>
  );
}

// ── dependências ─────────────────────────────────────────────────────
function DependenciasBloco({ pc, tarefa, onRecalc }: { pc: ProjetoCompleto; tarefa: TarefaRow; onRecalc: Props['onRecalc'] }) {
  const preds = pc.dependencias.filter((d) => d.sucessora_id === tarefa.id);
  const nomePor = (id: string) => pc.tarefas.find((t) => t.id === id)?.nome ?? '?';
  const candidatas = pc.tarefas.filter(
    (t) => t.id !== tarefa.id && !preds.some((d) => d.predecessora_id === t.id),
  );

  const [novoPred, setNovoPred] = useState('');
  const [tipo, setTipo] = useState<DependenciaRow['tipo']>('FS');
  const [lag, setLag] = useState<number>(0);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function adicionar() {
    if (!novoPred) return;
    setBusy(true); setErro(null);
    try {
      await criarDependencia({ projetoId: pc.projeto.id, predecessora: novoPred, sucessora: tarefa.id, tipo, lag });
      setNovoPred('');
      await onRecalc();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar dependência'); // ex.: ciclo
    } finally { setBusy(false); }
  }
  async function remover(id: string) {
    setBusy(true);
    try { await removerDependencia(id); await onRecalc(); }
    finally { setBusy(false); }
  }

  return (
    <Secao titulo="Predecessoras">
      {preds.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)', marginBottom: 8 }}>Nenhuma.</div>}
      {preds.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
          <Link2 size={14} color="#888" />
          <span style={{ flex: 1, color: 'var(--portal-text)' }}>
            {nomePor(d.predecessora_id)} <span style={{ color: '#888' }}>({d.tipo}{Number(d.lag_dias) ? `, lag ${d.lag_dias}` : ''})</span>
          </span>
          <button onClick={() => remover(d.id)} disabled={busy} style={iconBtn}><Trash2 size={15} color="#dc2626" /></button>
        </div>
      ))}
      {candidatas.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <select value={novoPred} onChange={(e) => setNovoPred(e.target.value)} style={{ ...input, flex: '1 1 130px' }}>
            <option value="">+ predecessora…</option>
            {candidatas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as DependenciaRow['tipo'])} style={{ ...input, width: 90 }}>
            {TIPOS_DEP.map(([v]) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input type="number" value={lag} onChange={(e) => setLag(Number(e.target.value))} title="lag (dias úteis)" style={{ ...input, width: 64 }} />
          <button onClick={adicionar} disabled={busy || !novoPred} style={{ ...primary, width: 'auto', padding: '8px 14px', margin: 0 }}>Add</button>
        </div>
      )}
      {erro && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 13, marginTop: 8 }}><AlertTriangle size={14} /> {erro}</div>}
    </Secao>
  );
}

// ── helpers visuais ──────────────────────────────────────────────────
function Campo({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <div style={{ marginBottom: 12, flex: flex ? 1 : undefined }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--portal-text-muted,#888)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--portal-border,#eee)', marginTop: 18, paddingTop: 14 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 10 }}>{titulo}</h3>
      {children}
    </div>
  );
}
function Linha({ k, v, cor }: { k: string; v: string; cor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ color: 'var(--portal-text-muted,#888)' }}>{k}</span>
      <span style={{ fontWeight: 600, color: cor ?? 'var(--portal-text)' }}>{v}</span>
    </div>
  );
}

const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'flex-end', zIndex: 1000 };
const panel: React.CSSProperties = { background: 'var(--portal-surface,#fff)', width: '100%', maxWidth: 460, height: '100%', overflowY: 'auto', padding: 22, boxShadow: '-8px 0 24px rgba(0,0,0,0.15)' };
const input: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text)', fontSize: 14 };
const primary: React.CSSProperties = { width: '100%', display: 'flex', justifyContent: 'center', gap: 8, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', border: 'none', padding: 11, borderRadius: 10, fontWeight: 600, cursor: 'pointer', marginTop: 6 };
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted,#888)', padding: 2 };
