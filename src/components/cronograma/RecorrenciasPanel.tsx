'use client';
// Fase 6 — manutenção recorrente (intervalo/horímetro) que gera ocorrências
// como tarefas concretas. Horímetro: converte "a cada N horas" em dias via
// a média de horas/dia (mesma ideia de src/lib/revisoes/utils.ts).
import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Trash2, Loader2, Repeat } from 'lucide-react';
import {
  listarRecorrencias, criarRecorrencia, removerRecorrencia, gerarOcorrencias,
  type ProjetoCompleto, type RecorrenciaRow,
} from '@/lib/cronograma/queries';

export default function RecorrenciasPanel({ pc, onChanged }: { pc: ProjetoCompleto; onChanged: () => void | Promise<void> }) {
  const [recs, setRecs] = useState<RecorrenciaRow[]>([]);
  const [showNovo, setShowNovo] = useState(false);
  const carregar = useCallback(async () => setRecs(await listarRecorrencias(pc.projeto.id)), [pc.projeto.id]);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div style={{ marginTop: 14, background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#eee)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>
          <Repeat size={17} color="#0ea5e9" /> Manutenções recorrentes
        </h3>
        <button onClick={() => setShowNovo((s) => !s)} style={btn('#0ea5e9')}><Plus size={16} /> Nova</button>
      </div>

      {showNovo && <NovaRec pc={pc} onCriada={async () => { setShowNovo(false); await carregar(); }} />}

      {recs.length === 0 && !showNovo && (
        <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>
          Nenhuma recorrência. Crie uma para gerar manutenções periódicas (por dias ou por horímetro).
        </div>
      )}
      {recs.map((r) => <RecLinha key={r.id} rec={r} onChanged={async () => { await carregar(); await onChanged(); }} />)}
    </div>
  );
}

function RecLinha({ rec, onChanged }: { rec: RecorrenciaRow; onChanged: () => Promise<void> }) {
  const [media, setMedia] = useState<number>(5);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function gerar() {
    setBusy(true); setMsg(null);
    try {
      const n = await gerarOcorrencias({ recorrenciaId: rec.id, mediaHorasDia: rec.base === 'horimetro' ? media : null });
      setMsg(n > 0 ? `${n} ocorrência(s) gerada(s)` : 'Nada novo a gerar');
      await onChanged();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); }
    finally { setBusy(false); }
  }
  async function remover() {
    if (!confirm(`Remover a recorrência "${rec.nome}"? (as ocorrências já geradas permanecem)`)) return;
    await removerRecorrencia(rec.id); await onChanged();
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--portal-border,#eee)', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontWeight: 600, color: 'var(--portal-text)' }}>{rec.nome}</div>
        <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
          {rec.base === 'intervalo_dias' ? `a cada ${rec.intervalo} dias` : `a cada ${rec.intervalo}h de horímetro`}
          {' · '}duração {rec.duracao_dias}d · horizonte {rec.horizonte_meses}m
        </div>
      </div>
      {rec.base === 'horimetro' && (
        <label style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)', display: 'flex', alignItems: 'center', gap: 4 }}>
          média h/dia
          <input type="number" min={0.1} step={0.5} value={media} onChange={(e) => setMedia(Number(e.target.value))} style={{ ...input, width: 70 }} />
        </label>
      )}
      <button onClick={gerar} disabled={busy} style={btn('#0ea5e9')}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Gerar ocorrências
      </button>
      <button onClick={remover} style={iconBtn}><Trash2 size={15} color="#dc2626" /></button>
      {msg && <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)', width: '100%' }}>{msg}</span>}
    </div>
  );
}

function NovaRec({ pc, onCriada }: { pc: ProjetoCompleto; onCriada: () => void }) {
  const [nome, setNome] = useState('');
  const [base, setBase] = useState<RecorrenciaRow['base']>('intervalo_dias');
  const [intervalo, setIntervalo] = useState<number>(30);
  const [duracao, setDuracao] = useState<number>(1);
  const [recursoId, setRecursoId] = useState('');
  const [ancora, setAncora] = useState(() => new Date().toISOString().slice(0, 10));
  const [horizonte, setHorizonte] = useState<number>(12);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome.'); return; }
    setSalvando(true); setErro(null);
    try {
      await criarRecorrencia({
        projetoId: pc.projeto.id, nome: nome.trim(), base, intervalo,
        duracaoDias: duracao, recursoId: recursoId || null, ancoraData: ancora, horizonteMeses: horizonte,
      });
      onCriada();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setSalvando(false); }
  }

  return (
    <div style={{ background: 'var(--portal-bg,#f7f8fa)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        <Campo label="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} style={input} placeholder="Ex.: Troca de óleo" /></Campo>
        <Campo label="Base">
          <select value={base} onChange={(e) => setBase(e.target.value as RecorrenciaRow['base'])} style={input}>
            <option value="intervalo_dias">Intervalo (dias)</option>
            <option value="horimetro">Horímetro (horas)</option>
          </select>
        </Campo>
        <Campo label={base === 'intervalo_dias' ? 'A cada (dias)' : 'A cada (horas)'}>
          <input type="number" min={1} value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))} style={input} />
        </Campo>
        <Campo label="Duração (dias)"><input type="number" min={0} step={0.5} value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} style={input} /></Campo>
        <Campo label="Recurso">
          <select value={recursoId} onChange={(e) => setRecursoId(e.target.value)} style={input}>
            <option value="">— nenhum —</option>
            {pc.recursos.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </Campo>
        <Campo label="Âncora (última)"><input type="date" value={ancora} onChange={(e) => setAncora(e.target.value)} style={input} /></Campo>
        <Campo label="Horizonte (meses)"><input type="number" min={1} value={horizonte} onChange={(e) => setHorizonte(Number(e.target.value))} style={input} /></Campo>
      </div>
      {erro && <div style={{ color: '#dc2626', fontSize: 13, margin: '8px 0' }}>{erro}</div>}
      <button onClick={salvar} disabled={salvando} style={{ ...btn('#0ea5e9'), marginTop: 10 }}>
        {salvando && <Loader2 size={14} className="animate-spin" />} Criar recorrência
      </button>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--portal-text-muted,#888)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
const btn = (cor: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 6, background: cor, color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' });
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 2 };
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text)', fontSize: 14 };
