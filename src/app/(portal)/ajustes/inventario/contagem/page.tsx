'use client';
// Contagem CEGA do inventario rotativo. Portado de inventario-contagem.ejs + inventario-contagem.js.
// CROSS-CONTA (estoque global) - NAO usa ContaSelector. NUNCA exibe saldo de sistema/divergencia,
// so o status retornado pela API (conciliada / recontagem). Consome /api/ajustes/inventario/contagem*.
import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';

// ---------- tipos do payload ----------
interface Ciclo {
  id: number | string;
  referencia?: string | null;
  tipo?: string | null;
}
interface Tarefa {
  id: number | string;
  sku: string;
  descricao_produto?: string | null;
  classe_abc?: string | null;
  status?: string | null; // pendente | contando | recontagem | conciliada
}
interface HojeResp {
  ciclo?: Ciclo | null;
  tarefas?: Tarefa[];
  erro?: string;
}

const CLASSE_BG: Record<string, { bg: string; fg: string }> = {
  A: { bg: '#ffe4e6', fg: '#be123c' },
  B: { bg: '#fef3c7', fg: '#b45309' },
  C: { bg: '#f1f5f9', fg: '#475569' },
};
function BadgeClasse({ c }: { c?: string | null }) {
  if (!c) return <span style={{ color: '#94a3b8' }}>-</span>;
  const s = CLASSE_BG[c] || { bg: '#f1f5f9', fg: '#475569' };
  return <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, fontSize: '.68rem', fontWeight: 600, background: s.bg, color: s.fg }}>{c}</span>;
}

export default function ContagemPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);

  const [contador, setContador] = useState('');
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState('');
  const [carregado, setCarregado] = useState(false);

  // estado por tarefa
  const [qtdEdit, setQtdEdit] = useState<Record<string, string>>({});
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [msgLinha, setMsgLinha] = useState<Record<string, { tipo: 'ok' | 'erro' | 'recontar'; texto: string }>>({});

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/ajustes/inventario/contagem/hoje');
      const d = (await r.json()) as HojeResp;
      if (d.erro) { setErro(d.erro); return; }
      setErro('');
      setCiclo(d.ciclo || null);
      setTarefas(d.tarefas || []);
      setCarregado(true);
      if (d.ciclo) {
        setStatusMsg(`Ciclo #${d.ciclo.id} · ${d.ciclo.referencia || ''}${d.ciclo.tipo ? ` (${d.ciclo.tipo})` : ''}`);
      } else {
        setStatusMsg('');
      }
      // auto-poll enquanto houver itens congelando (status pendente)
      stopPoll();
      const pendentesFreeze = (d.tarefas || []).filter((t) => t.status === 'pendente').length;
      if (pendentesFreeze > 0) pollRef.current = setTimeout(carregar, 6000);
    } catch (ex) {
      setErro('erro de rede: ' + (ex as Error).message);
    }
  }, [stopPoll]);

  useEffect(() => {
    // restaura nome salvo
    try { const s = localStorage.getItem('inv_contador'); if (s) setContador(s); } catch {}
    carregar();
    return () => stopPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const salvarContador = useCallback((v: string) => {
    setContador(v);
    try { localStorage.setItem('inv_contador', v); } catch {}
  }, []);

  const enviar = useCallback(async (t: Tarefa) => {
    const v = qtdEdit[String(t.id)];
    if (v === undefined || v === '' || isNaN(Number(v)) || Number(v) < 0) {
      setMsgLinha((s) => ({ ...s, [String(t.id)]: { tipo: 'erro', texto: 'informe a quantidade' } }));
      return;
    }
    setEnviandoId(String(t.id));
    setMsgLinha((s) => ({ ...s, [String(t.id)]: { tipo: 'ok', texto: 'enviando...' } }));
    try {
      const r = await fetch('/api/ajustes/inventario/contagem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tarefaId: t.id, qtd: Number(v), contadoPor: contador || (userProfile?.nome || 'portal') }),
      });
      const d = await r.json();
      if (d && d.erro) {
        setMsgLinha((s) => ({ ...s, [String(t.id)]: { tipo: 'erro', texto: d.erro } }));
        return;
      }
      // NUNCA exibimos saldo/divergencia - so o status retornado
      if (d.status === 'recontagem' || d.precisaRecontar) {
        setMsgLinha((s) => ({ ...s, [String(t.id)]: { tipo: 'recontar', texto: '🔁 recontar' } }));
      } else {
        setMsgLinha((s) => ({ ...s, [String(t.id)]: { tipo: 'ok', texto: '✓ conferido' } }));
      }
      // recarrega para refletir o novo status da tarefa
      carregar();
    } catch (ex) {
      setMsgLinha((s) => ({ ...s, [String(t.id)]: { tipo: 'erro', texto: 'erro de rede: ' + (ex as Error).message } }));
    } finally {
      setEnviandoId(null);
    }
  }, [qtdEdit, contador, userProfile, carregar]);

  if (!permLoading && userProfile && !temAcesso('ajustes')) return <SemPermissao />;

  const conciliadas = tarefas.filter((t) => t.status === 'conciliada').length;
  const pendentesFreeze = tarefas.filter((t) => t.status === 'pendente').length;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Contagem de inventario</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem' }}>
            Conte a quantidade <b>fisica</b> de cada produto (o estoque e&apos; um so, das duas empresas juntas) e digite abaixo. A contagem e&apos; <b>cega</b>: o sistema nao mostra o saldo esperado. Se a diferenca for grande, ele vai pedir uma <b>recontagem</b>.
          </p>
        </div>
        <button onClick={carregar} style={{ marginLeft: 'auto', padding: '7px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>Atualizar</button>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes/inventario" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Inventario rotativo</Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 14, flexWrap: 'wrap', fontSize: '.82rem' }}>
        <label style={{ color: '#64748b' }}>Seu nome
          <input type="text" value={contador} onChange={(e) => salvarContador(e.target.value)} placeholder="quem esta contando" style={{ display: 'block', border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', marginTop: 2, width: 224 }} />
        </label>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>Progresso do dia</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{ciclo ? `${conciliadas} / ${tarefas.length}` : '--'}</div>
        </div>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}
      {statusMsg && <div style={{ fontSize: '.82rem', color: '#64748b', marginBottom: 12 }}>{statusMsg}</div>}

      {!carregado ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 32, textAlign: 'center', color: '#94a3b8' }}>Carregando…</div>
      ) : !ciclo ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 32, textAlign: 'center', color: '#94a3b8' }}>
          Nenhum ciclo de contagem aberto. O agendador gera um ciclo por dia util de manha — ou peca pra gerar um na aba <Link href="/ajustes/inventario" style={{ color: '#2563eb', textDecoration: 'underline' }}>Inventario rotativo</Link>.
        </div>
      ) : (
        <div>
          {tarefas.map((t) => {
            const id = String(t.id);
            const msg = msgLinha[id];
            return (
              <div key={id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <BadgeClasse c={t.classe_abc} />
                  <span style={{ fontFamily: 'monospace', fontSize: '.72rem', color: '#64748b' }}>{t.sku}</span>
                </div>
                <div style={{ fontWeight: 500, color: '#1e293b', marginBottom: 10 }}>{t.descricao_produto || '(sem descricao)'}</div>
                {t.status === 'conciliada' ? (
                  <div style={{ color: '#059669', fontWeight: 600 }}>✓ Conferido</div>
                ) : t.status === 'pendente' ? (
                  <div style={{ color: '#b45309', fontSize: '.82rem' }}>⏳ congelando saldo...</div>
                ) : (
                  <>
                    {t.status === 'recontagem' && (
                      <div style={{ color: '#b45309', fontSize: '.82rem', marginBottom: 8 }}>🔁 Diferenca grande na 1a contagem — <b>conte de novo</b> com cuidado.</div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                      <label style={{ fontSize: '.7rem', color: '#64748b' }}>Quantidade fisica contada
                        <input
                          type="number" step="any" min="0"
                          value={qtdEdit[id] ?? ''}
                          onChange={(e) => setQtdEdit((s) => ({ ...s, [id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') enviar(t); }}
                          disabled={enviandoId === id}
                          style={{ display: 'block', width: 160, border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 10px', fontSize: '1.05rem', marginTop: 2 }}
                        />
                      </label>
                      <button onClick={() => enviar(t)} disabled={enviandoId === id} style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: enviandoId === id ? 'wait' : 'pointer', opacity: enviandoId === id ? 0.6 : 1 }}>
                        {enviandoId === id ? 'enviando...' : 'Confirmar'}
                      </button>
                      {msg && (
                        <span style={{ fontSize: '.82rem', fontWeight: 600, color: msg.tipo === 'ok' ? '#059669' : msg.tipo === 'recontar' ? '#b45309' : '#dc2626' }}>{msg.texto}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {pendentesFreeze > 0 && (
            <div style={{ fontSize: '.72rem', color: '#b45309', marginTop: 8 }}>⏳ {pendentesFreeze} item(ns) ainda congelando o saldo (aguarde alguns segundos)...</div>
          )}
        </div>
      )}
    </div>
  );
}
