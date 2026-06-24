'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Users, User, Wrench, X } from 'lucide-react';
import {
  listarRecursos, criarRecurso, atualizarRecurso, listarCalendarios,
  type RecursoRow, type CalendarioRow,
} from '@/lib/cronograma/queries';

interface PortalUser { id: string; nome: string; avatar_url: string }

const TIPO_ICON: Record<RecursoRow['tipo'], React.ReactNode> = {
  pessoa: <User size={15} />, equipe: <Users size={15} />, maquina: <Wrench size={15} />,
};

export default function RecursosPage() {
  const [recursos, setRecursos] = useState<RecursoRow[]>([]);
  const [cals, setCals] = useState<CalendarioRow[]>([]);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNovo, setShowNovo] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([listarRecursos(), listarCalendarios()]);
      setRecursos(r); setCals(c);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { fetch('/api/tarefas/users').then((r) => r.json()).then((d) => Array.isArray(d) && setUsers(d)); }, []);

  const nomeCal = (id: string | null) => cals.find((c) => c.id === id)?.nome ?? '—';

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 20, fontWeight: 700, color: 'var(--portal-text)' }}>
          <Users size={22} color="#dc2626" /> Recursos
        </h1>
        <button onClick={() => setShowNovo(true)} style={btnPrimary}><Plus size={18} /> Novo recurso</button>
      </header>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}><Loader2 className="animate-spin" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recursos.length === 0 && <div style={{ color: 'var(--portal-text-muted,#888)', textAlign: 'center', padding: 40 }}>Nenhum recurso. Crie o primeiro.</div>}
          {recursos.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#eee)', borderRadius: 10, padding: '12px 14px', opacity: r.ativo ? 1 : 0.5 }}>
              <span style={{ color: 'var(--portal-text-muted,#888)' }}>{TIPO_ICON[r.tipo]}</span>
              <span style={{ flex: 1, fontWeight: 600, color: 'var(--portal-text)' }}>{r.nome}</span>
              <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>{r.tipo}</span>
              <select value={r.calendario_id ?? ''} onChange={async (e) => { await atualizarRecurso(r.id, { calendarioId: e.target.value || null }); carregar(); }}
                style={{ ...input, width: 'auto', fontSize: 13 }} title="Calendário">
                <option value="">— calendário —</option>
                {cals.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
                <input type="checkbox" checked={r.ativo} onChange={async (e) => { await atualizarRecurso(r.id, { ativo: e.target.checked }); carregar(); }} /> ativo
              </label>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)', marginTop: 4 }}>
            Calendário atual de cada recurso: {recursos.map((r) => nomeCal(r.calendario_id)).filter((v, i, a) => a.indexOf(v) === i).join(', ') || '—'}.
            Trocar o calendário recalcula os projetos afetados ao salvar pelo próprio calendário.
          </p>
        </div>
      )}

      {showNovo && (
        <NovoRecursoModal cals={cals} users={users} onClose={() => setShowNovo(false)}
          onCriado={async () => { setShowNovo(false); await carregar(); }} />
      )}
    </div>
  );
}

function NovoRecursoModal({ cals, users, onClose, onCriado }: {
  cals: CalendarioRow[]; users: PortalUser[]; onClose: () => void; onCriado: () => void;
}) {
  const [tipo, setTipo] = useState<RecursoRow['tipo']>('pessoa');
  const [nome, setNome] = useState('');
  const [calendarioId, setCalendarioId] = useState<string>(cals[0]?.id ?? '');
  const [pessoaId, setPessoaId] = useState<string>(''); // financeiro_usu → ref_externa
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome.'); return; }
    setSalvando(true); setErro(null);
    try {
      await criarRecurso({ nome: nome.trim(), tipo, calendarioId: calendarioId || null, refExterna: pessoaId || null });
      onCriado();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setSalvando(false); }
  }

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--portal-text)' }}>Novo recurso</h2>
          <button onClick={onClose} style={iconBtn}><X size={20} /></button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as RecursoRow['tipo'])} style={input}>
            <option value="pessoa">Pessoa</option><option value="equipe">Equipe</option><option value="maquina">Máquina</option>
          </select>
        </div>
        {tipo === 'pessoa' && users.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Vincular a um usuário (opcional)</label>
            <select value={pessoaId} onChange={(e) => {
              setPessoaId(e.target.value);
              const u = users.find((x) => x.id === e.target.value);
              if (u && !nome) setNome(u.nome);
            }} style={input}>
              <option value="">— nenhum —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} style={input} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Calendário</label>
          <select value={calendarioId} onChange={(e) => setCalendarioId(e.target.value)} style={input}>
            <option value="">— nenhum —</option>
            {cals.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        {erro && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{erro}</div>}
        <button onClick={salvar} disabled={salvando} style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}>
          {salvando && <Loader2 size={18} className="animate-spin" />} Criar
        </button>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--portal-text-muted,#888)', marginBottom: 4 };
const input: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text)', fontSize: 14 };
const btnPrimary: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: 'pointer' };
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted,#888)', padding: 2 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modal: React.CSSProperties = { background: 'var(--portal-surface,#fff)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420 };
