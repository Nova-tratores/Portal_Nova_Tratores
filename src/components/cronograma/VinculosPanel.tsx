'use client';
// Vínculos do projeto: 1 Ordem de Serviço + 1 grupo de requisições.
// Reusa /api/ppv/ordens-servico (seletor de OS) e /api/pos/requisicoes/grupos.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Wrench, ClipboardList, Search, X, Loader2, ExternalLink, Plus, FolderOpen, ListPlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  vincularProjeto, buscarOS, carregarOSvinculada, listarGruposReq, criarGrupoReq,
  gerarTarefasDaOS, recalcular,
  type ProjetoCompleto, type OSBuscaRow, type GrupoReq, type OSvinculada,
} from '@/lib/cronograma/queries';

export default function VinculosPanel({ pc, onChanged }: { pc: ProjetoCompleto; onChanged: () => void | Promise<void> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14, marginTop: 14 }}>
      <BlocoOS pc={pc} onChanged={onChanged} />
      <BlocoGrupo pc={pc} onChanged={onChanged} />
    </div>
  );
}

// ── Ordem de Serviço ─────────────────────────────────────────────────
function BlocoOS({ pc, onChanged }: { pc: ProjetoCompleto; onChanged: () => void | Promise<void> }) {
  const osRef = pc.projeto.os_ref;
  const [det, setDet] = useState<OSvinculada | null>(null);
  const [termo, setTermo] = useState('');
  const [res, setRes] = useState<OSBuscaRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [gerando, setGerando] = useState(false);

  async function gerarTarefas() {
    if (pc.tarefas.length > 0 && !confirm('O projeto já tem tarefas. Gerar as fases da OS mesmo assim?')) return;
    setGerando(true);
    try {
      await gerarTarefasDaOS(pc.projeto.id, { inicio: det?.previsaoExecucao ?? null });
      await recalcular(pc.projeto.id);
      await onChanged();
    } finally { setGerando(false); }
  }

  useEffect(() => {
    if (osRef) carregarOSvinculada(osRef).then(setDet);
    else setDet(null);
  }, [osRef]);

  async function buscar() {
    setBusy(true);
    try { setRes(await buscarOS(termo)); } finally { setBusy(false); }
  }
  async function vincular(id: string) { await vincularProjeto(pc.projeto.id, { osRef: id }); await onChanged(); }
  async function remover() { await vincularProjeto(pc.projeto.id, { osRef: null }); setRes([]); setTermo(''); await onChanged(); }

  return (
    <Card titulo={<><Wrench size={15} color="#0ea5e9" /> Ordem de Serviço</>}>
      {osRef ? (
        <div>
          <Linha k="OS" v={det?.id ?? osRef} />
          <Linha k="Cliente" v={det?.cliente ?? '—'} />
          <Linha k="Status" v={det?.status ?? '—'} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Link href="/pos" style={link}><ExternalLink size={13} /> Abrir no Pós-Vendas</Link>
            <button onClick={remover} style={ghost}><X size={13} /> Remover</button>
          </div>
          <button onClick={gerarTarefas} disabled={gerando} style={{ ...btn, marginTop: 8, width: '100%', justifyContent: 'center' }}>
            {gerando ? <Loader2 size={14} className="animate-spin" /> : <ListPlus size={14} />} Gerar tarefas da OS
          </button>
          <p style={{ fontSize: 11, color: 'var(--portal-text-muted,#888)', marginTop: 6 }}>
            Cria as fases padrão (Diagnóstico → Peças → Execução → Teste → Entrega) encadeadas, ancoradas na Previsão de Execução.
          </p>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()}
              placeholder="Buscar OS (nº, cliente, serviço)" style={input} />
            <button onClick={buscar} disabled={busy} style={btn}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}</button>
          </div>
          <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
            {res.length === 0 && <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>Digite e busque (vazio = OS abertas).</div>}
            {res.map((o) => (
              <button key={o.id} onClick={() => vincular(o.id)} style={itemBtn}>
                <strong>{o.id}</strong> — {o.cliente} <span style={{ color: 'var(--portal-text-muted,#888)' }}>({o.status})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Grupo de Requisições ─────────────────────────────────────────────
function BlocoGrupo({ pc, onChanged }: { pc: ProjetoCompleto; onChanged: () => void | Promise<void> }) {
  const { userProfile } = useAuth();
  const reqGrupoId = pc.projeto.req_grupo_id;
  const [grupos, setGrupos] = useState<GrupoReq[]>([]);
  const [sel, setSel] = useState('');
  const [novo, setNovo] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => setGrupos(await listarGruposReq()), []);
  useEffect(() => { carregar(); }, [carregar]);

  const atual = grupos.find((g) => g.id === reqGrupoId);
  const abertos = grupos.filter((g) => g.status === 'aberto');

  async function vincular(id: number | null) { await vincularProjeto(pc.projeto.id, { reqGrupoId: id }); await onChanged(); }
  async function criarEVincular() {
    if (!novo.trim()) return;
    setBusy(true); setErro(null);
    try {
      const g = await criarGrupoReq(novo.trim(), userProfile?.nome || '');
      setNovo('');
      await vincular(g.id);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); } finally { setBusy(false); }
  }

  return (
    <Card titulo={<><ClipboardList size={15} color="#f97316" /> Grupo de Requisições</>}>
      {reqGrupoId && atual ? (
        <div>
          <Linha k="Grupo" v={atual.nome} />
          <Linha k="Status" v={atual.status} />
          <Linha k="Requisições" v={String((atual.membros ?? []).length)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Link href={`/requisicoes?grupo=${atual.id}`} style={link}><FolderOpen size={13} /> Ver requisições</Link>
            <button onClick={() => vincular(null)} style={ghost}><X size={13} /> Remover</button>
          </div>
        </div>
      ) : (
        <div>
          {abertos.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <select value={sel} onChange={(e) => setSel(e.target.value)} style={input}>
                <option value="">— vincular a um grupo existente —</option>
                {abertos.map((g) => <option key={g.id} value={g.id}>{g.nome} ({(g.membros ?? []).length})</option>)}
              </select>
              <button onClick={() => sel && vincular(Number(sel))} disabled={!sel} style={btn}>OK</button>
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)', margin: '4px 0' }}>ou criar um novo grupo:</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Ex.: REFORMA-PATIO-26" style={input} />
            <button onClick={criarEVincular} disabled={busy || !novo.trim()} style={btn}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            </button>
          </div>
          {erro && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>{erro}</div>}
        </div>
      )}
    </Card>
  );
}

// ── helpers visuais ──────────────────────────────────────────────────
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
const input: React.CSSProperties = { flex: 1, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text)', fontSize: 14 };
const btn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, background: '#0ea5e9', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const ghost: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: '#dc2626', border: '1px solid #fecaca', padding: '6px 10px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const link: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, background: 'var(--portal-bg,#f7f8fa)', color: 'var(--portal-text)', border: '1px solid var(--portal-border,#ddd)', padding: '6px 10px', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' };
const itemBtn: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--portal-border,#eee)', padding: '7px 2px', fontSize: 13, color: 'var(--portal-text)', cursor: 'pointer' };
