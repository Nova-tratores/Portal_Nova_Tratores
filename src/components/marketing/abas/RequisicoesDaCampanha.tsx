'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// REQUISIÇÕES DA CAMPANHA (aba Dinheiro) — 25/11/2026, José:
// "mostrar todas as requisições do grupo dessa campanha; dentro de cada req a gente consegue fazer um comentário
//  ou atribuir uma função a alguém de dentro da campanha e chega notificação; mostra as fases da req;
//  se tiver valor já vai contando".
// A soma entra no Investimento pelo servidor (cada req do grupo vira custo sozinho) — aqui só mostra.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiEnviar, brl, Vazio, ROSA, estiloInput, BotaoRosa } from '../ui';

type Fase = { id: string; label: string };
type Pessoa = { id: string; nome: string; avatar_url?: string | null };

const iniciais = (n: string) => n.split(' ').filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const STATUS_TICKET: Record<string, string> = { aberto: 'Aberto', em_andamento: 'Em andamento', aguardando: 'Aguardando', concluido: 'Concluído', cancelado: 'Cancelado' };

function Rosto({ p, tam = 24 }: { p?: Pessoa; tam?: number }) {
  return (
    <span style={{ width: tam, height: tam, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', fontSize: tam * 0.4, color: '#fff', background: '#64748b', overflow: 'hidden', flex: 'none' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p?.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : iniciais(p?.nome || '?')}
    </span>
  );
}

/** As 4 fases da requisição, com a atual em destaque (recusada/lixeira aparecem à parte). */
function Fases({ fases, atual }: { fases: Fase[]; atual: string | null }) {
  if (atual === 'recusada' || atual === 'lixeira') {
    return <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>{atual === 'recusada' ? 'Não autorizada · fora da soma' : 'Na lixeira · fora da soma'}</span>;
  }
  const i = Math.max(0, fases.findIndex((f) => f.id === atual));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }} aria-label={`Fase: ${fases[i]?.label}`}>
      {fases.map((f, k) => {
        const feita = k < i, agora = k === i;
        return (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span title={f.label} style={{
              fontSize: 11.5, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
              background: agora ? ROSA : feita ? 'color-mix(in srgb,#16a34a 14%,transparent)' : 'var(--portal-bg-secondary,#f1f5f9)',
              color: agora ? '#fff' : feita ? '#15803d' : 'var(--portal-text-muted,#64748b)', fontWeight: agora ? 600 : 500,
            }}>{f.label}</span>
            {k < fases.length - 1 && <span style={{ width: 10, height: 2, background: feita ? '#16a34a' : 'var(--portal-border,#e2e8f0)' }} />}
          </div>
        );
      })}
    </div>
  );
}

export default function RequisicoesDaCampanha({ acaoId, onMudou }: { acaoId: string; onMudou: () => void }) {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  // link da notificação: /marketing/<id>?req=123 abre direto a requisição
  const [aberta, setAberta] = useState<number | null>(() =>
    typeof window === 'undefined' ? null : Number(new URLSearchParams(window.location.search).get('req')) || null);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    apiGet<any>(`/api/marketing/acoes/${acaoId}/requisicoes`).then((r) => {
      if (!vivo) return;
      setDados(r); setErro(null);
      if (r.mudou) onMudou();   // custo novo lançado sozinho → recarrega o Investimento
    }).catch((e: any) => { if (vivo) setErro(e?.message || 'Não consegui carregar as requisições.'); });
    return () => { vivo = false; };
  }, [acaoId, versao, onMudou]);

  useEffect(() => {
    if (aberta && dados) document.getElementById(`mkt-req-${aberta}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [aberta, dados]);

  const pessoas: Record<string, Pessoa> = useMemo(() => Object.fromEntries((dados?.responsaveis ?? []).map((p: Pessoa) => [p.id, p])), [dados]);

  if (erro) return <Vazio>{erro}</Vazio>;
  if (!dados) return <Vazio>Carregando requisições…</Vazio>;
  const reqs: any[] = dados.reqs ?? [];
  if (!reqs.length) {
    return <Vazio>Nenhuma requisição no grupo desta campanha ainda. Em Requisições, ao fazer o pedido, escolha o grupo da campanha: ele aparece aqui e o valor entra no Investimento sozinho.</Vazio>;
  }

  const dentro = reqs.filter((r) => r.fase !== 'recusada' && r.fase !== 'lixeira');
  const confirmado = dentro.filter((r) => r.fase === 'financeiro').reduce((s, r) => s + r.valor, 0);
  const previsto = dentro.filter((r) => r.fase !== 'financeiro').reduce((s, r) => s + r.valor, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>
        <span>{reqs.length} requisição(ões)</span>
        <span>No financeiro: <b style={{ color: '#16a34a' }}>{brl(confirmado)}</b></span>
        <span>A caminho: <b style={{ color: '#d97706' }}>{brl(previsto)}</b></span>
        <span>Total: <b style={{ color: 'var(--portal-text)' }}>{brl(confirmado + previsto)}</b></span>
      </div>
      {dados.semSql && <div style={{ fontSize: 12, color: '#b45309' }}>Comentários e tarefas ficam disponíveis depois de rodar o SQL marketing-campanha-equipe.sql.</div>}

      {reqs.map((r) => {
        const coms = (dados.comentarios ?? []).filter((c: any) => c.req_id === r.id);
        const abertaAqui = aberta === r.id;
        return (
          <div key={r.id} id={`mkt-req-${r.id}`} style={{ border: `1px solid ${abertaAqui ? ROSA : 'var(--portal-border)'}`, borderRadius: 14, background: 'var(--portal-bg-card)', overflow: 'hidden' }}>
            <button type="button" onClick={() => setAberta(abertaAqui ? null : r.id)}
              style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}>#{r.id}</span>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--portal-text)', flex: 1, minWidth: 180 }}>{r.titulo}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>{r.valor ? brl(r.valor) : 'sem valor'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}>
                {r.solicitante && <span>Pedido por {r.solicitante}</span>}
                {r.fornecedor && <span>· {r.fornecedor}</span>}
                {coms.length > 0 && <span>· {coms.length} comentário(s)</span>}
              </div>
              <Fases fases={dados.fases} atual={r.fase} />
            </button>
            {abertaAqui && <Conversa acaoId={acaoId} req={r} coms={coms} pessoas={pessoas} semSql={dados.semSql} onNovo={recarregar} />}
          </div>
        );
      })}
    </div>
  );
}

/** Comentários de uma requisição + escrever (com @ e "atribuir a"). */
function Conversa({ acaoId, req, coms, pessoas, semSql, onNovo }: { acaoId: string; req: any; coms: any[]; pessoas: Record<string, Pessoa>; semSql: boolean; onNovo: () => void }) {
  const [texto, setTexto] = useState('');
  const [mencoes, setMencoes] = useState<string[]>([]);
  const [para, setPara] = useState('');
  const [prazo, setPrazo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const lista = Object.values(pessoas);

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true); setErro(null);
    try {
      await apiEnviar(`/api/marketing/acoes/${acaoId}/requisicoes`, 'POST', {
        req_id: req.id, texto, mencoes, atribuir: para ? { user_id: para, prazo: prazo || null } : undefined,
      });
      setTexto(''); setMencoes([]); setPara(''); setPrazo('');
      onNovo();
    } catch (e: any) { setErro(e?.message || 'Não consegui enviar.'); }
    finally { setEnviando(false); }
  };

  return (
    <div style={{ borderTop: '1px solid var(--portal-border)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--portal-bg-secondary,#f8fafc)' }}>
      <a href={`/requisicoes?req=${req.id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: ROSA, fontWeight: 600, textDecoration: 'none', alignSelf: 'flex-start' }}>Abrir a requisição #{req.id} ↗</a>

      {coms.length === 0 && !semSql && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>Nenhum comentário ainda.</div>}
      {coms.map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Rosto p={pessoas[c.autor_id] ?? { id: c.autor_id, nome: c.autor_nome || '?' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}><b style={{ color: 'var(--portal-text)' }}>{c.autor_nome || 'Alguém'}</b> · {quando(c.criado_em)}</div>
            <div style={{ fontSize: 13.5, color: 'var(--portal-text)', whiteSpace: 'pre-wrap' }}>{c.texto}</div>
            {(c.mencoes?.length > 0 || c.ticket) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {c.ticket && (
                  <a href={`/tickets/${c.ticket.id}`} style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 999, background: 'color-mix(in srgb,#2563eb 12%,transparent)', color: '#1d4ed8', textDecoration: 'none', fontWeight: 600 }}>
                    Tarefa #{c.ticket.numero} · {pessoas[c.ticket.responsavel_id]?.nome?.split(' ')[0] ?? 'responsável'} · {STATUS_TICKET[c.ticket.status] ?? c.ticket.status}
                    {c.ticket.prazo ? ` · até ${String(c.ticket.prazo).split('-').reverse().join('/')}` : ''}
                  </a>
                )}
                {c.mencoes.filter((u: string) => u !== c.ticket?.responsavel_id).map((u: string) => (
                  <span key={u} style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 999, background: 'color-mix(in srgb,#DB2777 10%,transparent)', color: '#9D174D' }}>@{pessoas[u]?.nome?.split(' ')[0] ?? 'pessoa'}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {!semSql && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Escreva um comentário ou o que precisa ser feito…" style={{ ...estiloInput, resize: 'vertical', fontFamily: 'inherit' }} />
          {lista.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>
              <span>Marcar:</span>
              {lista.map((p) => {
                const on = mencoes.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => setMencoes((m) => (on ? m.filter((x) => x !== p.id) : [...m, p.id]))}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px 3px 3px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, border: `1px solid ${on ? ROSA : 'var(--portal-border)'}`, background: on ? 'color-mix(in srgb,#DB2777 10%,transparent)' : 'var(--portal-bg-card)', color: 'var(--portal-text)' }}>
                    <Rosto p={p} tam={20} /> @{p.nome.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={para} onChange={(e) => setPara(e.target.value)} style={{ ...estiloInput, flex: '1 1 220px', fontSize: 14 }} aria-label="Atribuir a">
              <option value="">Só comentar (sem tarefa)</option>
              {lista.map((p) => <option key={p.id} value={p.id}>Virar tarefa para {p.nome}</option>)}
            </select>
            {para && <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={{ ...estiloInput, flex: '0 1 170px', fontSize: 14 }} aria-label="Prazo da tarefa" />}
            <BotaoRosa onClick={enviar} disabled={enviando || !texto.trim()}>{enviando ? 'Enviando…' : para ? 'Enviar tarefa' : 'Comentar'}</BotaoRosa>
          </div>
          {para && <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}>Vira um pedido na fila de {pessoas[para]?.nome?.split(' ')[0]}, ligado a esta requisição. Ela recebe a notificação.</div>}
          {erro && <div style={{ fontSize: 12.5, color: '#dc2626' }}>{erro}</div>}
        </div>
      )}
    </div>
  );
}
