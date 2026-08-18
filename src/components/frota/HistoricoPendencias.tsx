'use client';
// HISTÓRICO do veículo (Ficha da Visão geral) — DUAS ABAS estilo Chrome:
//
//  · HISTÓRICO DE PENDÊNCIAS: abertas com selo vermelho; resolvidas, TODAS as
//    requisições do carro (menos abastecimentos) e as OSs do Pós (placa no
//    Projeto) em dropdowns.
//  · LINHA DO TEMPO: eventos por data (bonitinha) — clicar abre o detalhe
//    dizendo o que FOI FEITO ou o que AINDA NÃO FOI.
//
// Começa FECHADO (nenhuma aba ativa) — clicar na aba abre; clicar de novo fecha.
// Fonte: /api/frota/veiculo-historico?placa=X (+ componentes pro caminho).
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ClipboardList, History, Link2, Wrench, XCircle, CalendarDays } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';

interface Componente { id: string; sistema: string; subsistema: string | null; componente: string | null; }
interface Pend {
  id: string; origem: string; titulo: string; descricao: string | null;
  componente_id: string | null; data_ocorrencia: string | null; status: string;
  aberta_por: string | null; aberta_em: string;
  resolvida_por: string | null; resolvida_em: string | null; resolucao: string | null;
  vinculo_tipo: 'requisicao' | 'os' | null; vinculo_ref: string | null;
  km?: number | null; responsavel?: string | null;
}
interface Req { id: number; titulo: string | null; tipo: string | null; status: string | null; data: string | null; hodometro: string | null; valor_despeza: string | number | null; }
interface OS { Id_Ordem: string; Projeto: string | null; Status: string | null; Data: string | null; Nome_Cliente: string | null; }

interface Evento {
  chave: string;
  data: string;
  tipo: 'pendencia' | 'requisicao' | 'os';
  titulo: string;
  feito: boolean | null;      // true = concluído/resolvido; false = aberto; null = cancelado
  detalhe: string;
  link?: string | null;
}

const fmtData = (s: string | null | undefined) => (s ? new Date(String(s).length <= 10 ? `${s}T12:00:00` : s).toLocaleDateString('pt-BR') : '—');
const fmtDataHora = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDataBonita = (s: string) => {
  const d = new Date(String(s).length <= 10 ? `${s}T12:00:00` : s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

export default function HistoricoPendencias({ placa, aba, onResumo }: {
  placa: string;
  aba: 'hist' | 'timeline' | null;              // qual painel mostrar (null = nenhum)
  onResumo?: (r: { total: number; abertas: number; eventos: number }) => void; // contadores pras abas do pai
}) {
  const [pendencias, setPendencias] = useState<Pend[]>([]);
  const [requisicoes, setRequisicoes] = useState<Req[]>([]);
  const [ordens, setOrdens] = useState<OS[]>([]);
  const [componentes, setComponentes] = useState<Componente[]>([]);
  const [pronto, setPronto] = useState(false);
  const [mostrarResolvidas, setMostrarResolvidas] = useState(false);
  const [mostrarReqs, setMostrarReqs] = useState(false);
  const [mostrarOrdens, setMostrarOrdens] = useState(false);
  const [eventoAberto, setEventoAberto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const h = await authHeaders();
        const [rh, rk] = await Promise.all([
          fetch(`/api/frota/veiculo-historico?placa=${encodeURIComponent(placa)}`, { headers: h }),
          fetch('/api/frota/componentes', { headers: h }),
        ]);
        if (!rh.ok) return;
        const dh = await rh.json();
        const dk = rk.ok ? await rk.json() : { componentes: [] };
        if (!vivo) return;
        setPendencias(dh.pendencias || []);
        setRequisicoes(dh.requisicoes || []);
        setOrdens(dh.ordens || []);
        setComponentes(dk.componentes || []);
        setPronto(true);
      } catch { /* silencioso */ }
    })();
    return () => { vivo = false; };
  }, [placa]);

  const compPorId = useMemo(() => new Map(componentes.map((c) => [c.id, c])), [componentes]);
  const caminho = (id: string | null) => {
    const c = id ? compPorId.get(id) : undefined;
    return c ? [c.sistema, c.subsistema, c.componente].filter(Boolean).join(' › ') : '';
  };

  const abertas = pendencias.filter((p) => p.status === 'aberta');
  const resolvidas = pendencias.filter((p) => p.status === 'resolvida');

  const eventos = useMemo<Evento[]>(() => {
    const evs: Evento[] = [];
    for (const p of pendencias) {
      const resolvida = p.status === 'resolvida';
      evs.push({
        chave: `p-${p.id}`,
        data: p.data_ocorrencia || p.aberta_em || '',
        tipo: 'pendencia',
        titulo: p.titulo,
        feito: resolvida,
        detalhe: resolvida
          ? `FEITO — resolvida por ${p.resolvida_por || '—'} em ${fmtDataHora(p.resolvida_em)}${p.resolucao ? `. Como: ${p.resolucao}` : ''}${p.vinculo_ref ? ` (${p.vinculo_tipo === 'requisicao' ? 'Req.' : 'OS'} #${p.vinculo_ref})` : ''}`
          : `AINDA NÃO FEITO — pendência aberta por ${p.aberta_por || '—'} em ${fmtDataHora(p.aberta_em)}${p.responsavel ? ` · responsável: ${p.responsavel}` : ''}${p.km ? ` · ${Number(p.km).toLocaleString('pt-BR')} km` : ''}`,
      });
    }
    for (const r of requisicoes) {
      const done = ['financeiro', 'concluido'].includes(String(r.status || ''));
      evs.push({
        chave: `r-${r.id}`,
        data: r.data || '',
        tipo: 'requisicao',
        titulo: `Req #${r.id} — ${r.titulo || r.tipo || 'Requisição'}`,
        feito: done,
        detalhe: done
          ? `FEITO — requisição concluída (status: ${r.status})${r.valor_despeza ? ` · valor: R$ ${r.valor_despeza}` : ''}${r.hodometro ? ` · hodômetro: ${r.hodometro}` : ''}`
          : `AINDA NÃO FEITO — requisição em andamento (status atual: ${r.status || 'pedido'})${r.hodometro ? ` · hodômetro: ${r.hodometro}` : ''}`,
        link: `/requisicoes?req=${r.id}`,
      });
    }
    for (const o of ordens) {
      const st = String(o.Status || '');
      const done = /^conclu/i.test(st);
      const cancel = /^cancelad/i.test(st);
      evs.push({
        chave: `o-${o.Id_Ordem}`,
        data: o.Data || '',
        tipo: 'os',
        titulo: `${o.Id_Ordem} — oficina do Pós`,
        feito: cancel ? null : done,
        detalhe: cancel
          ? `CANCELADA — a ${o.Id_Ordem} foi cancelada.`
          : done
            ? `FEITO — ${o.Id_Ordem} concluída na oficina (projeto: ${o.Projeto || '—'}).`
            : `AINDA NÃO FEITO — ${o.Id_Ordem} em andamento (status atual: ${st || '—'}) · projeto: ${o.Projeto || '—'}`,
      });
    }
    return evs.filter((e) => e.data).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  }, [pendencias, requisicoes, ordens]);

  // contadores pras abas do pai (roda mesmo com painel fechado)
  useEffect(() => {
    if (!pronto) return;
    onResumo?.({
      total: pendencias.length + requisicoes.length + ordens.length,
      abertas: abertas.length,
      eventos: eventos.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, pendencias, requisicoes, ordens]);

  if (!pronto || (pendencias.length === 0 && requisicoes.length === 0 && ordens.length === 0)) return null;
  if (!aba) return null;

  const chipComp = (id: string | null) => {
    const rot = caminho(id);
    return rot ? (
      <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', background: '#dbeafe', borderRadius: 0, padding: '2px 8px' }}>{rot}</span>
    ) : null;
  };
  const vinculo = (p: Pend) =>
    p.vinculo_tipo === 'requisicao' && p.vinculo_ref ? (
      <a href={`/requisicoes?req=${encodeURIComponent(p.vinculo_ref)}`} target="_blank" rel="noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
        <Link2 size={12} /> Requisição #{p.vinculo_ref}
      </a>
    ) : p.vinculo_tipo === 'os' && p.vinculo_ref ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563eb', fontWeight: 600 }}>
        <Link2 size={12} /> OS {p.vinculo_ref}
      </span>
    ) : null;

  const dropBtn = (aberto: boolean, alternar: () => void, icone: React.ReactNode, rotulo: string) => (
    <button onClick={alternar}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', width: '100%', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>
      {icone} {rotulo}
      <ChevronDown size={14} style={{ marginLeft: 'auto', transform: aberto ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
    </button>
  );

  return (
    <div style={{ borderBottom: '1px solid rgba(0,0,0,0.5)', paddingBottom: 18 }}>

      {/* ══════════ ABA 1: HISTÓRICO DE PENDÊNCIAS ══════════ */}
      {aba === 'hist' && (
        <div style={{ padding: '14px 4px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {abertas.map((p) => (
            <div key={p.id} style={{ border: '1px solid var(--portal-border)', borderLeft: '4px solid #dc2626', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color: '#fff', background: '#dc2626', padding: '2px 9px' }} className="sist-blink">ABERTA</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)' }}>{p.titulo}</span>
                {chipComp(p.componente_id)}
              </div>
              {p.descricao && <div style={{ fontSize: 13, color: 'var(--portal-text)', marginTop: 4 }}>{p.descricao}</div>}
              <div style={{ fontSize: 12.5, color: 'var(--portal-text)', marginTop: 4 }}>
                Aberta por <b>{p.aberta_por || '—'}</b> em {fmtDataHora(p.aberta_em)}
                {p.data_ocorrencia ? ` · ocorreu em ${fmtData(p.data_ocorrencia)}` : ''}
                {p.km ? ` · ${Number(p.km).toLocaleString('pt-BR')} km` : ''}
                {p.responsavel ? ` · responsável: ${p.responsavel}` : ''}
              </div>
            </div>
          ))}
          {abertas.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>Nenhuma pendência em aberto. 🎉</div>
          )}

          {resolvidas.length > 0 && (
            <div>
              {dropBtn(mostrarResolvidas, () => setMostrarResolvidas((v) => !v), <CheckCircle2 size={14} color="#16a34a" />, `Resolvidas (${resolvidas.length})`)}
              {mostrarResolvidas && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {resolvidas.map((p) => (
                    <div key={p.id} style={{ border: '1px solid var(--portal-border)', borderLeft: '4px solid #16a34a', padding: '10px 12px', background: 'var(--portal-bg-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color: '#fff', background: '#16a34a', padding: '2px 9px' }}>RESOLVIDA</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)' }}>{p.titulo}</span>
                        {chipComp(p.componente_id)}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--portal-text)', marginTop: 4, lineHeight: 1.6 }}>
                        Aberta por <b>{p.aberta_por || '—'}</b> em {fmtData(p.data_ocorrencia || p.aberta_em)} ·
                        resolvida por <b>{p.resolvida_por || '—'}</b> em {fmtDataHora(p.resolvida_em)}
                        {p.resolucao && <div>Como foi fechada: <b>{p.resolucao}</b></div>}
                        {vinculo(p)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {requisicoes.length > 0 && (
            <div>
              {dropBtn(mostrarReqs, () => setMostrarReqs((v) => !v), <ClipboardList size={14} color="#7c3aed" />, `Requisições do veículo (${requisicoes.length})`)}
              {mostrarReqs && (
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8, border: '1px solid var(--portal-border)' }}>
                  {requisicoes.map((r, i) => (
                    <a key={r.id} href={`/requisicoes?req=${r.id}`} target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', textDecoration: 'none', borderTop: i > 0 ? '1px solid var(--portal-border)' : 'none' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2563eb', flexShrink: 0 }}>#{r.id}</span>
                      <span style={{ fontSize: 13, color: 'var(--portal-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.titulo || '—'} <span style={{ fontWeight: 600 }}>· {r.tipo}</span>
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--portal-text)', flexShrink: 0 }}>{fmtData(r.data)}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', padding: '2px 8px', flexShrink: 0,
                        color: ['financeiro', 'concluido'].includes(String(r.status)) ? '#15803d' : '#b45309',
                        background: ['financeiro', 'concluido'].includes(String(r.status)) ? '#dcfce7' : '#fef3c7' }}>
                        {r.status || 'pedido'}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {ordens.length > 0 && (
            <div>
              {dropBtn(mostrarOrdens, () => setMostrarOrdens((v) => !v), <Wrench size={14} color="#0369a1" />, `Ordens de serviço do veículo (${ordens.length})`)}
              {mostrarOrdens && (
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8, border: '1px solid var(--portal-border)' }}>
                  {ordens.map((o, i) => (
                    <div key={o.Id_Ordem} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: i > 0 ? '1px solid var(--portal-border)' : 'none' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0369a1', flexShrink: 0 }}>{o.Id_Ordem}</span>
                      <span style={{ fontSize: 13, color: 'var(--portal-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.Projeto}</span>
                      <span style={{ fontSize: 12, color: 'var(--portal-text)', flexShrink: 0 }}>{fmtData(o.Data)}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', padding: '2px 8px', flexShrink: 0,
                        color: /^conclu/i.test(String(o.Status)) ? '#15803d' : /^cancelad/i.test(String(o.Status)) ? '#64748b' : '#b45309',
                        background: /^conclu/i.test(String(o.Status)) ? '#dcfce7' : /^cancelad/i.test(String(o.Status)) ? '#e2e8f0' : '#fef3c7' }}>
                        {o.Status || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════ ABA 2: LINHA DO TEMPO ══════════ */}
      {aba === 'timeline' && (
        <div style={{ padding: '14px 4px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {eventos.map((ev) => {
            const abertoEv = eventoAberto === ev.chave;
            const cor = ev.feito === true ? '#16a34a' : ev.feito === false ? '#dc2626' : '#64748b';
            const Icone = ev.feito === true ? CheckCircle2 : ev.feito === false ? History : XCircle;
            return (
              <div key={ev.chave} style={{ border: '1px solid var(--portal-border)', borderLeft: `4px solid ${cor}` }}>
                <button onClick={() => setEventoAberto(abertoEv ? null : ev.chave)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text)', width: 150, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtDataBonita(ev.data)}
                  </span>
                  <Icone size={15} color={cor} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--portal-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.titulo}
                  </span>
                  <ChevronDown size={14} color="var(--portal-text)" style={{ flexShrink: 0, transform: abertoEv ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
                </button>
                {abertoEv && (
                  <div style={{ padding: '0 12px 10px 172px', fontSize: 13, color: 'var(--portal-text)', lineHeight: 1.6 }}>
                    {ev.detalhe}
                    {ev.link && (
                      <div>
                        <a href={ev.link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                          <Link2 size={12} /> abrir
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
