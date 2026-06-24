'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, Check, CalendarDays } from 'lucide-react';
import {
  listarCalendarios, criarCalendario, atualizarCalendario, removerCalendario,
  listarExcecoes, addExcecao, removerExcecao, recalcularProjetosDoCalendario,
  type CalendarioRow, type ExcecaoRow,
} from '@/lib/cronograma/queries';

const DIAS: [number, string][] = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom']];

export default function CalendariosPage() {
  const [cals, setCals] = useState<CalendarioRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const cs = await listarCalendarios();
      setCals(cs);
      setSel((s) => s ?? cs[0]?.id ?? null);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function novo() {
    const id = await criarCalendario({ nome: 'Novo calendário', diasSemana: [1, 2, 3, 4, 5], horasPorDia: 8 });
    await carregar(); setSel(id);
  }

  const calSel = cals.find((c) => c.id === sel) ?? null;

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 20, fontWeight: 700, color: 'var(--portal-text)' }}>
          <CalendarDays size={22} color="#dc2626" /> Calendários
        </h1>
        <button onClick={novo} style={btnPrimary}><Plus size={18} /> Novo calendário</button>
      </header>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}><Loader2 className="animate-spin" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cals.map((c) => (
              <button key={c.id} onClick={() => setSel(c.id)} style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                border: '1px solid var(--portal-border,#eee)',
                background: c.id === sel ? '#fef2f2' : 'var(--portal-surface,#fff)',
                color: c.id === sel ? '#b91c1c' : 'var(--portal-text)', fontWeight: 600, fontSize: 14,
              }}>
                {c.nome}
                <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--portal-text-muted,#888)' }}>
                  {(c.dias_semana ?? []).map((d) => DIAS.find(([n]) => n === d)?.[1]).join(' ')}
                </div>
              </button>
            ))}
          </div>
          {calSel && <Editor key={calSel.id} cal={calSel} onChanged={carregar} />}
        </div>
      )}
    </div>
  );
}

function Editor({ cal, onChanged }: { cal: CalendarioRow; onChanged: () => Promise<void> }) {
  const [nome, setNome] = useState(cal.nome);
  const [dias, setDias] = useState<number[]>(cal.dias_semana ?? []);
  const [horas, setHoras] = useState<number>(Number(cal.horas_por_dia) || 8);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [exc, setExc] = useState<ExcecaoRow[]>([]);

  const carregarExc = useCallback(async () => setExc(await listarExcecoes(cal.id)), [cal.id]);
  useEffect(() => { carregarExc(); }, [carregarExc]);

  const toggleDia = (d: number) =>
    setDias((arr) => (arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d].sort()));

  async function salvar() {
    setSalvando(true); setSalvo(false);
    try {
      await atualizarCalendario(cal.id, { nome, diasSemana: dias, horasPorDia: horas });
      await recalcularProjetosDoCalendario(cal.id); // disponibilidade mudou
      await onChanged();
      setSalvo(true); setTimeout(() => setSalvo(false), 2000);
    } finally { setSalvando(false); }
  }
  async function excluir() {
    if (!confirm(`Remover o calendário "${cal.nome}"?`)) return;
    await removerCalendario(cal.id); await onChanged();
  }

  // exceções
  const [data, setData] = useState('');
  const [tipo, setTipo] = useState<'folga' | 'extra'>('folga');
  async function adicionarExc() {
    if (!data) return;
    await addExcecao({ calendarioId: cal.id, data, tipo });
    setData(''); await carregarExc(); await recalcularProjetosDoCalendario(cal.id);
  }

  return (
    <div style={{ background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#eee)', borderRadius: 12, padding: 18 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Nome</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} style={input} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Dias úteis da semana</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DIAS.map(([n, l]) => {
            const on = dias.includes(n);
            return (
              <button key={n} onClick={() => toggleDia(n)} style={{
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                border: on ? '1px solid #dc2626' : '1px solid var(--portal-border,#ddd)',
                background: on ? '#dc2626' : 'transparent', color: on ? '#fff' : 'var(--portal-text-muted,#888)',
              }}>{l}</button>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)', marginTop: 6 }}>
          Dica: só “Qua” marcado = o caso do pintor que só trabalha quarta.
        </p>
      </div>
      <div style={{ marginBottom: 14, maxWidth: 160 }}>
        <label style={lbl}>Horas por dia</label>
        <input type="number" min={1} max={24} step={0.5} value={horas} onChange={(e) => setHoras(Number(e.target.value))} style={input} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button onClick={salvar} disabled={salvando} style={btnPrimary}>
          {salvando ? <Loader2 size={16} className="animate-spin" /> : salvo ? <Check size={16} /> : null}
          {salvo ? 'Salvo' : 'Salvar'}
        </button>
        <button onClick={excluir} style={btnGhost}><Trash2 size={16} color="#dc2626" /> Remover</button>
      </div>

      <div style={{ borderTop: '1px solid var(--portal-border,#eee)', paddingTop: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 8 }}>Exceções (feriados / dias extras)</h3>
        {exc.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)', marginBottom: 8 }}>Nenhuma.</div>}
        {exc.map((e) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: e.tipo === 'folga' ? '#dc2626' : '#10b981' }} />
            <span style={{ flex: 1, color: 'var(--portal-text)' }}>{fmt(e.data)} — {e.tipo === 'folga' ? 'Folga (remove dia)' : 'Extra (adiciona dia)'}</span>
            <button onClick={async () => { await removerExcecao(e.id); await carregarExc(); await recalcularProjetosDoCalendario(cal.id); }} style={iconBtn}><Trash2 size={14} color="#dc2626" /></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={{ ...input, width: 'auto' }} />
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'folga' | 'extra')} style={{ ...input, width: 'auto' }}>
            <option value="folga">Folga</option><option value="extra">Extra</option>
          </select>
          <button onClick={adicionarExc} style={{ ...btnPrimary, padding: '8px 14px' }}>Adicionar</button>
        </div>
      </div>
    </div>
  );
}

const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--portal-text-muted,#888)', marginBottom: 4 };
const input: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text)', fontSize: 14 };
const btnPrimary: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: 'var(--portal-text)', border: '1px solid var(--portal-border,#ddd)', padding: '9px 16px', borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: 'pointer' };
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 2 };
