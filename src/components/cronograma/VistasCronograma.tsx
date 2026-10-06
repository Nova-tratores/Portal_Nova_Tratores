'use client';
// Outras formas de ver o cronograma (além do Gantt): Lista, Calendário,
// Por pessoa e Por situação. Clique abre a etapa; no Calendário dá para
// arrastar a etapa para outro dia (mesma regra do arrastar do Gantt).
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flag, Ticket as TicketIcon } from 'lucide-react';
import type { TarefaRow, RecursoRow } from '@/lib/cronograma/queries';

export type Vista = 'lista' | 'calendario' | 'pessoa' | 'situacao';

interface Props {
  vista: Vista;
  tarefas: TarefaRow[];
  recursos: RecursoRow[];
  onAbrir: (id: string) => void;
  onAbrirTicket: (ticketId: string) => void;
  onMoverDatas: (id: string, inicio: Date, fim: Date) => void;
}

const SITUACOES: { id: TarefaRow['status']; nome: string; cor: string }[] = [
  { id: 'pendente', nome: 'A fazer', cor: '#6b7280' },
  { id: 'em_andamento', nome: 'Em andamento', cor: '#0284c7' },
  { id: 'bloqueada', nome: 'Bloqueada', cor: '#b45309' },
  { id: 'concluida', nome: 'Concluída', cor: '#059669' },
  { id: 'cancelada', nome: 'Cancelada', cor: '#9ca3af' },
];
const nomeSit = (s: string) => SITUACOES.find((x) => x.id === s)?.nome ?? s;
const corSit = (s: string) => SITUACOES.find((x) => x.id === s)?.cor ?? '#6b7280';
const br = (iso: string | null) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');
const dia = (iso: string) => new Date(iso + 'T12:00:00');
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hojeIso = () => iso(new Date());

const cartao: React.CSSProperties = { background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#eee)', borderRadius: 12 };
const th: React.CSSProperties = { textAlign: 'left', padding: '9px 10px', fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted,#888)', borderBottom: '1px solid var(--portal-border,#eee)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' };
const td: React.CSSProperties = { padding: '9px 10px', fontSize: 13, color: 'var(--portal-text,#111)', borderBottom: '1px solid var(--portal-border,#f3f3f3)' };

function Chip({ status }: { status: string }) {
  const c = corSit(status);
  return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: c, background: c + '1f' }}>{nomeSit(status)}</span>;
}

export default function VistasCronograma({ vista, tarefas, recursos, onAbrir, onAbrirTicket, onMoverDatas }: Props) {
  const etapas = useMemo(() => tarefas.filter((t) => t.tipo !== 'resumo'), [tarefas]);
  const nomeRec = (id: string | null) => (id ? recursos.find((r) => r.id === id)?.nome ?? '?' : 'Sem responsável');
  const atrasada = (t: TarefaRow) => !!t.fim_calc && t.fim_calc < hojeIso() && t.status !== 'concluida' && t.status !== 'cancelada';

  if (vista === 'lista') return <Lista etapas={etapas} nomeRec={nomeRec} atrasada={atrasada} onAbrir={onAbrir} onAbrirTicket={onAbrirTicket} />;
  if (vista === 'calendario') return <Calendario etapas={etapas} onAbrir={onAbrir} onMoverDatas={onMoverDatas} />;

  // Por pessoa / Por situação: colunas
  const grupos: { chave: string; nome: string; cor: string; itens: TarefaRow[] }[] = vista === 'pessoa'
    ? [...new Set(etapas.map((t) => t.recurso_id ?? ''))].map((r) => ({ chave: r, nome: nomeRec(r || null), cor: '#dc2626', itens: etapas.filter((t) => (t.recurso_id ?? '') === r) }))
        .sort((a, b) => a.nome.localeCompare(b.nome))
    : SITUACOES.map((s) => ({ chave: s.id, nome: s.nome, cor: s.cor, itens: etapas.filter((t) => t.status === s.id) })).filter((g) => g.itens.length || g.chave !== 'cancelada');
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 8 }}>
      {grupos.map((g) => (
        <div key={g.chave} style={{ flex: '0 0 270px', background: 'var(--portal-bg,#f3f4f6)', borderRadius: 12, padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 13, fontWeight: 800, color: 'var(--portal-text,#111)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.cor }} /> {g.nome}
            <span style={{ marginLeft: 'auto', color: 'var(--portal-text-muted,#999)' }}>{g.itens.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...g.itens].sort((a, b) => (a.inicio_calc ?? '9').localeCompare(b.inicio_calc ?? '9')).map((t) => (
              <button key={t.id} onClick={() => onAbrir(t.id)} style={{ ...cartao, textAlign: 'left', padding: 10, cursor: 'pointer', borderLeft: `3px solid ${t.e_critica ? '#dc2626' : g.cor}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text,#111)' }}>{t.nome}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 5, fontSize: 11.5, color: 'var(--portal-text-muted,#888)' }}>
                  <span>{br(t.inicio_calc)} – {br(t.fim_calc)}</span>
                  {vista === 'pessoa' ? <Chip status={t.status} /> : <span>{nomeRec(t.recurso_id)}</span>}
                  {t.e_critica && <span style={{ color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}><Flag size={11} /> crítica</span>}
                  {atrasada(t) && <span style={{ color: '#dc2626', fontWeight: 700 }}>atrasada</span>}
                  {t.ticket_id && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><TicketIcon size={11} /> ticket</span>}
                </div>
              </button>
            ))}
            {g.itens.length === 0 && <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#999)', padding: 6 }}>Nada aqui.</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

type Ord = 'nome' | 'resp' | 'ini' | 'fim' | 'dur' | 'folga' | 'st';
function Lista({ etapas, nomeRec, atrasada, onAbrir, onAbrirTicket }: {
  etapas: TarefaRow[]; nomeRec: (id: string | null) => string; atrasada: (t: TarefaRow) => boolean;
  onAbrir: (id: string) => void; onAbrirTicket: (id: string) => void;
}) {
  const [ord, setOrd] = useState<{ c: Ord; asc: boolean }>({ c: 'ini', asc: true });
  const chave = (t: TarefaRow): string | number => ({
    nome: t.nome.toLowerCase(), resp: nomeRec(t.recurso_id).toLowerCase(), ini: t.inicio_calc ?? '9', fim: t.fim_calc ?? '9',
    dur: t.duracao_dias, folga: t.folga_dias ?? 9999, st: nomeSit(t.status),
  })[ord.c];
  const lista = [...etapas].sort((a, b) => { const x = chave(a), y = chave(b); return (x < y ? -1 : x > y ? 1 : 0) * (ord.asc ? 1 : -1); });
  const cab = (c: Ord, txt: string) => (
    <th style={th} onClick={() => setOrd((o) => ({ c, asc: o.c === c ? !o.asc : true }))}>{txt}{ord.c === c ? (ord.asc ? ' ▲' : ' ▼') : ''}</th>
  );
  return (
    <div style={{ ...cartao, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead><tr>{cab('nome', 'Etapa')}{cab('resp', 'Responsável')}{cab('ini', 'Início')}{cab('fim', 'Fim')}{cab('dur', 'Duração')}{cab('folga', 'Folga')}{cab('st', 'Situação')}<th style={th}>Ticket</th></tr></thead>
        <tbody>
          {lista.map((t) => (
            <tr key={t.id} onClick={() => onAbrir(t.id)} style={{ cursor: 'pointer' }}>
              <td style={{ ...td, fontWeight: 700 }}>{t.e_critica && <Flag size={12} color="#dc2626" style={{ marginRight: 5, verticalAlign: -1 }} />}{t.nome}</td>
              <td style={td}>{nomeRec(t.recurso_id)}</td>
              <td style={td}>{br(t.inicio_calc)}</td>
              <td style={{ ...td, color: atrasada(t) ? '#dc2626' : td.color, fontWeight: atrasada(t) ? 700 : 400 }}>{br(t.fim_calc)}{atrasada(t) ? ' (atrasada)' : ''}</td>
              <td style={td}>{t.duracao_dias}d</td>
              <td style={td}>{t.folga_dias == null ? '—' : `${t.folga_dias}d`}</td>
              <td style={td}><Chip status={t.status} /></td>
              <td style={td} onClick={(e) => e.stopPropagation()}>
                {t.ticket_id
                  ? <button onClick={() => onAbrirTicket(t.ticket_id!)} style={{ border: 'none', background: 'transparent', color: '#dc2626', fontWeight: 700, cursor: 'pointer', padding: 0 }}>abrir</button>
                  : <span style={{ color: 'var(--portal-text-muted,#aaa)' }}>—</span>}
              </td>
            </tr>
          ))}
          {lista.length === 0 && <tr><td style={td} colSpan={8}>Nenhuma etapa.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Calendario({ etapas, onAbrir, onMoverDatas }: { etapas: TarefaRow[]; onAbrir: (id: string) => void; onMoverDatas: (id: string, inicio: Date, fim: Date) => void }) {
  const primeira = etapas.map((t) => t.inicio_calc).filter(Boolean).sort()[0] as string | undefined;
  const base = primeira && primeira > hojeIso() ? dia(primeira) : new Date();
  const [mes, setMes] = useState(() => new Date(base.getFullYear(), base.getMonth(), 1));
  const [arr, setArr] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const ini = new Date(mes); ini.setDate(1 - ((ini.getDay() + 6) % 7)); // começa na segunda
  const dias = Array.from({ length: 42 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d; });
  const naData = (d: string) => etapas.filter((t) => t.inicio_calc && t.fim_calc && t.inicio_calc <= d && t.fim_calc >= d);
  const soltar = (alvo: string) => {
    const t = etapas.find((x) => x.id === arr);
    setArr(null); setSobre(null);
    if (!t?.inicio_calc || !t.fim_calc || t.inicio_calc === alvo) return;
    const delta = Math.round((dia(alvo).getTime() - dia(t.inicio_calc).getTime()) / 86400000);
    const novoIni = dia(t.inicio_calc); novoIni.setDate(novoIni.getDate() + delta);
    const novoFim = dia(t.fim_calc); novoFim.setDate(novoFim.getDate() + delta);
    onMoverDatas(t.id, novoIni, novoFim);
  };
  const nav: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: 6, borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text,#111)' };
  return (
    <div style={{ ...cartao, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--portal-border,#eee)' }}>
        <button style={nav} aria-label="Mês anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
        <b style={{ minWidth: 160, textAlign: 'center', color: 'var(--portal-text,#111)', textTransform: 'capitalize' }}>{mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</b>
        <button style={nav} aria-label="Próximo mês" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
        <small style={{ marginLeft: 'auto', color: 'var(--portal-text-muted,#888)' }}>Arraste uma etapa para outro dia para mudar a data.</small>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', minWidth: 780 }}>
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => <div key={d} style={{ padding: '6px 8px', fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text-muted,#888)', borderBottom: '1px solid var(--portal-border,#eee)' }}>{d}</div>)}
        {dias.map((d) => {
          const k = iso(d);
          const fora = d.getMonth() !== mes.getMonth();
          const itens = naData(k);
          return (
            <div key={k}
              onDragOver={(e) => { if (!arr) return; e.preventDefault(); if (sobre !== k) setSobre(k); }}
              onDrop={(e) => { e.preventDefault(); soltar(k); }}
              style={{ minHeight: 96, padding: 5, borderRight: '1px solid var(--portal-border,#f1f1f1)', borderBottom: '1px solid var(--portal-border,#f1f1f1)', background: sobre === k ? 'rgba(220,38,38,.07)' : fora ? 'var(--portal-bg,#fafafa)' : undefined }}>
              <div style={{ fontSize: 11.5, fontWeight: k === hojeIso() ? 800 : 600, color: k === hojeIso() ? '#dc2626' : fora ? 'var(--portal-text-muted,#bbb)' : 'var(--portal-text,#111)', marginBottom: 3 }}>{d.getDate()}</div>
              {itens.slice(0, 4).map((t) => (
                <div key={t.id} draggable={t.inicio_calc === k && t.status !== 'concluida'}
                  onDragStart={() => setArr(t.id)} onDragEnd={() => { setArr(null); setSobre(null); }}
                  onClick={() => onAbrir(t.id)} title={`${t.nome} (${br(t.inicio_calc)} – ${br(t.fim_calc)})`}
                  style={{ fontSize: 11, padding: '2px 6px', marginBottom: 2, borderRadius: 5, cursor: t.inicio_calc === k ? 'grab' : 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff', background: t.status === 'concluida' ? '#059669' : t.e_critica ? '#dc2626' : '#475569', opacity: t.inicio_calc === k ? 1 : .7 }}>
                  {t.nome}
                </div>
              ))}
              {itens.length > 4 && <div style={{ fontSize: 10.5, color: 'var(--portal-text-muted,#888)' }}>+{itens.length - 4}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
