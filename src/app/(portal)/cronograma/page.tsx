'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GanttChartSquare, Plus, X, Loader2, Factory, Tractor } from 'lucide-react';
import {
  listarProjetos, criarProjeto, type ProjetoRow, type CalendarioRow,
} from '@/lib/cronograma/queries';
import { supabase } from '@/lib/supabase';

const TIPO_LABEL: Record<ProjetoRow['tipo'], string> = {
  obra_interna: 'Obra interna',
  os_maquina: 'OS de máquina',
};
const STATUS_COR: Record<ProjetoRow['status'], string> = {
  ativo: '#10b981', pausado: '#f59e0b', concluido: '#3b82f6', cancelado: '#a3a3a3',
};

export default function CronogramaProjetosPage() {
  const router = useRouter();
  const [projetos, setProjetos] = useState<ProjetoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fTipo, setFTipo] = useState<'todos' | ProjetoRow['tipo']>('todos');
  const [fStatus, setFStatus] = useState<'todos' | ProjetoRow['status']>('ativo');
  const [showCriar, setShowCriar] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setProjetos(await listarProjetos()); }
    catch (e) { console.error('cronograma: erro ao listar projetos', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = projetos.filter(
    (p) => (fTipo === 'todos' || p.tipo === fTipo) && (fStatus === 'todos' || p.status === fStatus),
  );

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <GanttChartSquare size={26} color="#dc2626" />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--portal-text)' }}>Cronograma</h1>
        </div>
        <button onClick={() => setShowCriar(true)} className="ep-btn"
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={18} /> Novo Projeto
        </button>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <Filtro label="Tipo" value={fTipo} onChange={(v) => setFTipo(v as typeof fTipo)}
          opts={[['todos', 'Todos'], ['obra_interna', 'Obra interna'], ['os_maquina', 'OS de máquina']]} />
        <Filtro label="Status" value={fStatus} onChange={(v) => setFStatus(v as typeof fStatus)}
          opts={[['todos', 'Todos'], ['ativo', 'Ativos'], ['pausado', 'Pausados'], ['concluido', 'Concluídos'], ['cancelado', 'Cancelados']]} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 className="animate-spin" /></div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--portal-text-muted,#888)' }}>
          Nenhum projeto. Clique em <strong>Novo Projeto</strong> para começar.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
          {filtrados.map((p) => (
            <Link key={p.id} href={`/cronograma/${p.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#eee)', borderRadius: 12, padding: 16, cursor: 'pointer', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: 'var(--portal-text-muted,#888)', fontSize: 12 }}>
                  {p.tipo === 'os_maquina' ? <Tractor size={15} /> : <Factory size={15} />}
                  {TIPO_LABEL[p.tipo]}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 12 }}>{p.nome}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: STATUS_COR[p.status], fontWeight: 600 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COR[p.status] }} />
                    {p.status}
                  </span>
                  <span style={{ color: 'var(--portal-text-muted,#888)' }}>
                    {p.data_fim_calc ? `fim: ${fmt(p.data_fim_calc)}` : `início: ${fmt(p.data_inicio)}`}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCriar && (
        <CriarProjetoModal
          onClose={() => setShowCriar(false)}
          onCriado={(id) => router.push(`/cronograma/${id}`)}
        />
      )}
    </div>
  );
}

function Filtro({ label, value, onChange, opts }: {
  label: string; value: string; onChange: (v: string) => void; opts: [string, string][];
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>
      {label}:
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text)' }}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function CriarProjetoModal({ onClose, onCriado }: { onClose: () => void; onCriado: (id: string) => void }) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<ProjetoRow['tipo']>('obra_interna');
  const [dataInicio, setDataInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [calendarioId, setCalendarioId] = useState<string>('');
  const [calendarios, setCalendarios] = useState<CalendarioRow[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // reusa carregarProjeto? não — só precisamos da lista de calendários
    supabase.schema('cronograma').from('calendarios').select('*').order('nome')
      .then(({ data }) => {
        const cals = (data ?? []) as CalendarioRow[];
        setCalendarios(cals);
        if (cals[0]) setCalendarioId(cals[0].id);
      });
  }, []);

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome do projeto.'); return; }
    setSalvando(true); setErro(null);
    try {
      const id = await criarProjeto({ nome: nome.trim(), tipo, dataInicio, calendarioId: calendarioId || null });
      onCriado(id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar projeto');
      setSalvando(false);
    }
  }

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--portal-text)' }}>Novo Projeto</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}><X size={20} /></button>
        </div>
        <Campo label="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} style={input} placeholder="Ex.: Reforma do galpão" autoFocus />
        </Campo>
        <Campo label="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as ProjetoRow['tipo'])} style={input}>
            <option value="obra_interna">Obra interna</option>
            <option value="os_maquina">OS de máquina</option>
          </select>
        </Campo>
        <Campo label="Início">
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={input} />
        </Campo>
        <Campo label="Calendário">
          <select value={calendarioId} onChange={(e) => setCalendarioId(e.target.value)} style={input}>
            {calendarios.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        {erro && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{erro}</div>}
        <button onClick={salvar} disabled={salvando}
          style={{ width: '100%', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: 8 }}>
          {salvando && <Loader2 size={18} className="animate-spin" />} Criar
        </button>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--portal-text-muted,#888)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modal: React.CSSProperties = { background: 'var(--portal-surface,#fff)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420 };
const input: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text)', fontSize: 14 };
