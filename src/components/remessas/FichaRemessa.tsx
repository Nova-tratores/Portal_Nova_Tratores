'use client';
// Ficha da remessa: dados, NF-e, itens (ao vivo na Omie), o que o portal emitiu, ações e histórico.
import { useCallback, useEffect, useState } from 'react';
import { X, FileText, RefreshCcw, Undo2, BadgeDollarSign, CalendarClock, Send, UserCheck, Link2 } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import {
  TIPOS, SITUACOES, dataBR, somarDias, hojeISO, PRAZO_PADRAO_DIAS, type LinhaRemessa,
} from '@/lib/remessas/regras';

interface Emissao { id: string; tipo: 'demonstracao' | 'retorno'; status: string; nf_numero: string | null; erro: string | null; criado_em: string; user_nome: string | null; valor_total: number | null; renovacao: boolean; n_cod: number | null }
interface Evento { id: number; tipo: string; detalhe: string | null; user_nome: string | null; criado_em: string }
interface Ficha {
  linha: LinhaRemessa; controle: { responsavel_id: string | null; pedido_venda: string | null; situacao_manual: string | null } | null;
  eventos: Evento[]; emissoes: Emissao[]; nf: { numero: string; chave: string | null; danfe: string | null; emissao: string | null } | null;
  omieErro: string | null; voltas: Array<{ numero: string; data: string; cfop: string; destinatario: string; total: number }>;
  itens: Array<{ nCodProd: number; descricao: string | null; qtd: number; valorUnit: number; cfop: string; cst: string | null; origem: string | null }>;
  dadosAdic: string | null; migracaoFaltando: boolean;
}
const brl = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quando = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const COR_EVENTO: Record<string, string> = { erro: '#dc2626', devolvida: '#15803d', faturada: '#0284c7', renovada: '#7c3aed', virou_venda: '#0f766e', aviso_prazo: '#d97706', prazo: '#d97706' };

export default function FichaRemessa({ chave, onFechar, onMudou, onAbrir }: { chave: string; onFechar: () => void; onMudou: () => void; onAbrir: (k: string) => void }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const [f, setF] = useState<Ficha | null>(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [painel, setPainel] = useState<'' | 'renovar' | 'volta' | 'venda' | 'prazo'>('');
  const [prazo, setPrazo] = useState('');
  const [pedido, setPedido] = useState('');
  const [obs, setObs] = useState('');
  const [nota, setNota] = useState('');

  const carregar = useCallback(async () => {
    try {
      const r = await fetchAuth(`/api/remessas?ficha=${chave}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
      setF(j); setErro('');
    } catch (e) { setErro((e as Error).message); }
  }, [chave]);
  useEffect(() => { setF(null); carregar(); }, [carregar]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onFechar]);

  const acao = async (corpo: Record<string, unknown>, rotulo: string, okMsg: string) => {
    if (!f) return;
    setOcupado(rotulo); setErro(''); setMsg('');
    try {
      const r = await fetchAuth('/api/remessas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta: f.linha.conta, idRemessa: f.linha.idRemessa, ...corpo }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.erro || `Erro ${r.status}`);
      setMsg(typeof okMsg === 'string' ? okMsg.replace('{nf}', j.nf || '?') : 'Feito.');
      setPainel(''); setObs(''); setNota('');
      await carregar(); onMudou();
      return j;
    } catch (e) { setErro((e as Error).message); }
    finally { setOcupado(''); }
  };

  const l = f?.linha;
  const ehDemo = l?.tipo === 'demonstracao';
  const aberta = l ? SITUACOES[l.situacao].aberta : false;
  const pendentes = (f?.emissoes || []).filter((e) => e.status === 'criada' || e.status === 'falhou');
  const podeEmitirNF = pode('remessas', 'emitir') || pode('remessas', 'renovar') || pode('remessas', 'devolver');

  return (
    <div className="rm-modal-fundo" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="rm-modal" role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-light)' }}>Remessa {l ? `${l.conta.toUpperCase()} · nº ${l.numero}` : ''}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{l?.destinatario || 'Carregando…'}</div>
            {l && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <span className="rm-selo" style={{ background: `${TIPOS[l.tipo].cor}1f`, color: TIPOS[l.tipo].cor }}>{TIPOS[l.tipo].rotulo} · {l.cfop}</span>
                <span className="rm-selo" style={{ background: `${SITUACOES[l.situacao].cor}1f`, color: SITUACOES[l.situacao].cor }}>{SITUACOES[l.situacao].rotulo}</span>
                {l.origemPortal && <span className="rm-selo" style={{ background: 'var(--mx-p-violet, #ede9fe)', color: 'var(--mx-fg-violet, #5b21b6)' }}>emitida pelo portal</span>}
              </div>
            )}
          </div>
          <button className="rm-btn" onClick={onFechar} aria-label="Fechar"><X size={16} /></button>
        </div>

        {erro && <div className="rm-erro">{erro}</div>}
        {msg && <div className="rm-ok">{msg}</div>}
        {f?.migracaoFaltando && <div className="rm-aviso">Falta aplicar <b>sql/remessas-modulo.sql</b>: prazo, histórico e emissão ficam travados.</div>}
        {!f && !erro && <div className="rm-card">Carregando a ficha (lendo a Omie)…</div>}

        {f && l && (
          <>
            <div className="rm-grade">
              <Info rot="Emissão" v={dataBR(l.emissao)} />
              <Info rot="Valor" v={brl(l.total)} />
              <Info rot="CPF/CNPJ" v={l.cnpj || '—'} />
              {ehDemo && <Info rot="Volta até" v={l.prazoAte ? `${dataBR(l.prazoAte)}${l.diasPrazo != null ? ` (${l.diasPrazo < 0 ? `vencida há ${-l.diasPrazo} d` : `faltam ${l.diasPrazo} d`})` : ''}` : '—'} />}
              <div className="rm-campo">
                <span className="rm-lbl">NF-e</span>
                {f.nf ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span>nº <b>{f.nf.numero}</b></span>
                    {f.nf.danfe && <a href={f.nf.danfe} target="_blank" rel="noreferrer" style={{ color: 'var(--mx-fg-violet, #7c3aed)', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><FileText size={13} /> DANFE</a>}
                  </span>
                ) : <span style={{ color: 'var(--text-light)' }}>{f.omieErro ? `Omie fora: ${f.omieErro}` : 'ainda não emitida'}</span>}
              </div>
            </div>

            {(l.renovadaDe || l.renovadaPara) && (
              <div className="rm-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5 }}>
                <Link2 size={15} color="#7c3aed" />
                {l.renovadaDe && <button className="rm-btn peq" onClick={() => onAbrir(`${l.conta}-${l.renovadaDe}`)}>← Renovação de uma remessa anterior</button>}
                {l.renovadaPara && <button className="rm-btn peq" onClick={() => onAbrir(`${l.conta}-${l.renovadaPara}`)}>Renovada pela remessa nova →</button>}
              </div>
            )}

            {pendentes.length > 0 && (
              <div className="rm-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderColor: '#c4b5fd' }}>
                <div className="rm-sec">Criado na Omie, falta emitir a NF-e</div>
                {pendentes.map((e) => (
                  <div key={e.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: '1 1 240px', fontSize: 13.5 }}>
                      <b>{e.tipo === 'retorno' ? 'Nota de entrada de volta (1.913/2.913)' : 'Remessa de demonstração'}</b>{e.renovacao ? ' · renovação' : ''} — {brl(Number(e.valor_total))}
                      <div style={{ fontSize: 12, color: 'var(--text-light)' }}>por {e.user_nome} em {quando(e.criado_em)}. Confira os itens/impostos na Omie se quiser antes de emitir.</div>
                      {e.erro && <div style={{ fontSize: 12.5, color: 'var(--mx-fg-red, #dc2626)' }}>{e.erro}</div>}
                    </div>
                    {podeEmitirNF && e.status === 'criada' && (
                      <button className="rm-btn pri" disabled={!!ocupado} onClick={() => acao({ acao: 'emitir_nf', emissaoId: e.id }, 'nf', 'NF-e emitida — nº {nf}.')}>
                        <Send size={15} /> {ocupado === 'nf' ? 'Emitindo…' : e.erro ? 'Tentar emitir de novo' : 'Emitir NF-e'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {ehDemo && aberta && (
              <div className="rm-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="rm-sec">O que fazer com esta demonstração</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {pode('remessas', 'renovar') && <button className="rm-btn pri" onClick={() => { setPainel('renovar'); setPrazo(somarDias(hojeISO(), PRAZO_PADRAO_DIAS)); }}><RefreshCcw size={15} /> Renovar</button>}
                  {pode('remessas', 'devolver') && <button className="rm-btn ok" onClick={() => setPainel('volta')}><Undo2 size={15} /> Registrar a volta</button>}
                  {pode('remessas', 'acompanhar') && <button className="rm-btn" onClick={() => setPainel('venda')}><BadgeDollarSign size={15} /> Virou venda</button>}
                  {pode('remessas', 'acompanhar') && <button className="rm-btn" onClick={() => { setPainel('prazo'); setPrazo(l.prazoAte || ''); }}><CalendarClock size={15} /> Mudar o prazo</button>}
                  {pode('remessas', 'acompanhar') && f.controle?.responsavel_id !== userProfile?.id && (
                    <button className="rm-btn" disabled={!!ocupado} onClick={() => acao({ acao: 'responsavel', userId: userProfile?.id }, 'resp', 'Você vai receber os avisos de prazo desta demonstração.')}><UserCheck size={15} /> Eu acompanho</button>
                  )}
                </div>
                {painel === 'renovar' && (
                  <Painel>
                    <div style={{ fontSize: 13.5 }}>Cria na Omie a <b>nota de entrada de volta</b> desta remessa e uma <b>remessa nova</b> igual (mesmo cliente, máquinas e valores) com o novo prazo. As duas NF-e são emitidas depois, nesta ficha e na da remessa nova.</div>
                    <Campos prazo={prazo} setPrazo={setPrazo} obs={obs} setObs={setObs} />
                    <button className="rm-btn pri" disabled={!!ocupado || !prazo} onClick={() => acao({ acao: 'renovar', prazoAte: prazo, obs }, 'ren', 'Renovação criada na Omie: emita a NF-e da volta aqui e a da remessa nova na ficha dela.')}>{ocupado === 'ren' ? 'Criando…' : 'Criar a volta e a remessa nova'}</button>
                  </Painel>
                )}
                {painel === 'volta' && (
                  <Painel>
                    <div style={{ fontSize: 13.5 }}>A máquina voltou? Cria na Omie a <b>nota de entrada {l.cfop.startsWith('6') ? '2.913' : '1.913'}</b> com a chave desta remessa (a máquina volta ao estoque quando a NF-e for emitida). Se a volta já foi feita na Omie, use “Já voltou (nota feita fora)”.</div>
                    <div className="rm-campo"><span className="rm-lbl">Observação na nota (opcional)</span><input className="rm-input" value={obs} onChange={(e) => setObs(e.target.value)} /></div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="rm-btn ok" disabled={!!ocupado} onClick={() => acao({ acao: 'volta', obs }, 'volta', 'Nota de volta criada na Omie — emita a NF-e acima.')}>{ocupado === 'volta' ? 'Criando…' : 'Criar a nota de volta'}</button>
                      <button className="rm-btn" disabled={!!ocupado} onClick={() => acao({ acao: 'marcar', situacao: 'devolvida', obs }, 'dev', 'Marcada como devolvida.')}>Já voltou (nota feita fora)</button>
                    </div>
                  </Painel>
                )}
                {painel === 'venda' && (
                  <Painel>
                    <div style={{ fontSize: 13.5 }}>O cliente comprou a máquina. Informe o pedido de venda (opcional). A remessa sai da lista de demonstrações.</div>
                    <div className="rm-grade">
                      <div className="rm-campo"><span className="rm-lbl">Pedido de venda / PVM</span><input className="rm-input" value={pedido} onChange={(e) => setPedido(e.target.value)} /></div>
                      <div className="rm-campo"><span className="rm-lbl">Observação</span><input className="rm-input" value={obs} onChange={(e) => setObs(e.target.value)} /></div>
                    </div>
                    <button className="rm-btn pri" disabled={!!ocupado} onClick={() => acao({ acao: 'marcar', situacao: 'virou_venda', pedido, obs }, 'venda', 'Marcada como venda.')}>Confirmar</button>
                  </Painel>
                )}
                {painel === 'prazo' && (
                  <Painel>
                    <div className="rm-campo" style={{ maxWidth: 220 }}><span className="rm-lbl">Volta até</span><input className="rm-input" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-light)' }}>Só muda o controle do portal (não mexe na nota).</div>
                    <button className="rm-btn pri" disabled={!!ocupado || !prazo} onClick={() => acao({ acao: 'prazo', prazoAte: prazo }, 'prazo', 'Prazo atualizado.')}>Salvar prazo</button>
                  </Painel>
                )}
              </div>
            )}

            {f.controle?.situacao_manual && pode('remessas', 'acompanhar') && (
              <div style={{ fontSize: 13 }}>
                {f.controle.pedido_venda && <>Pedido de venda: <b>{f.controle.pedido_venda}</b>. </>}
                <button className="rm-btn peq" disabled={!!ocupado} onClick={() => acao({ acao: 'marcar', situacao: null }, 'desf', 'Situação manual desfeita.')}>Desfazer a marcação</button>
              </div>
            )}

            <div className="rm-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="rm-sec">Itens {f.omieErro ? '(do espelho)' : '(na Omie)'}</div>
              <div className="rm-tabela-wrap">
                <table className="rm-tabela" style={{ minWidth: 520 }}>
                  <thead><tr><th>Produto</th><th>Qtd</th><th style={{ textAlign: 'right' }}>Valor un.</th><th>CFOP</th><th>ICMS</th></tr></thead>
                  <tbody>
                    {(f.itens.length ? f.itens : l.itens.map((d, i) => ({ nCodProd: i, descricao: d, qtd: 0, valorUnit: 0, cfop: l.cfop, cst: null, origem: null }))).map((it) => (
                      <tr key={it.nCodProd} style={{ cursor: 'default' }}>
                        <td>{it.descricao || `Produto ${it.nCodProd}`}</td><td>{it.qtd || ''}</td>
                        <td style={{ textAlign: 'right' }}>{it.valorUnit ? brl(it.valorUnit) : ''}</td><td>{it.cfop}</td>
                        <td>{it.cst ? `CST ${it.cst}${it.origem != null ? ` · origem ${it.origem}` : ''}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {f.dadosAdic && <div style={{ fontSize: 12.5, color: 'var(--text-light)' }}>Dados adicionais: {f.dadosAdic}</div>}
            </div>

            {f.voltas.length > 0 && (
              <div className="rm-card" style={{ fontSize: 13.5 }}>
                <div className="rm-sec" style={{ marginBottom: 6 }}>Notas de volta encontradas na Omie</div>
                {f.voltas.map((v) => <div key={v.numero + v.data}>Nota de entrada {v.numero} · {v.data} · CFOP {v.cfop} · {brl(v.total)}</div>)}
              </div>
            )}

            <div className="rm-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="rm-sec">Histórico</div>
              {f.eventos.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-light)' }}>Nada registrado pelo portal ainda.</div> : (
                <div className="rm-tempo">
                  {f.eventos.map((e) => (
                    <div key={e.id} style={{ ['--cor' as string]: COR_EVENTO[e.tipo] || '#7c3aed' }}>
                      <div>{e.detalhe}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-light)' }}>{quando(e.criado_em)}{e.user_nome ? ` · ${e.user_nome}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              {pode('remessas', 'acompanhar') && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="rm-input" placeholder="Anotar algo (ex.: cliente pediu mais 15 dias)" value={nota} onChange={(e) => setNota(e.target.value)} />
                  <button className="rm-btn" disabled={!nota.trim() || !!ocupado} onClick={() => acao({ acao: 'obs', obs: nota }, 'obs', 'Anotado.')}>Anotar</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Info({ rot, v }: { rot: string; v: string }) {
  return <div className="rm-campo"><span className="rm-lbl">{rot}</span><span>{v}</span></div>;
}
function Painel({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>{children}</div>;
}
function Campos({ prazo, setPrazo, obs, setObs }: { prazo: string; setPrazo: (v: string) => void; obs: string; setObs: (v: string) => void }) {
  return (
    <div className="rm-grade">
      <div className="rm-campo"><span className="rm-lbl">Nova volta até</span><input className="rm-input" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></div>
      <div className="rm-campo"><span className="rm-lbl">Observação nas notas (opcional)</span><input className="rm-input" value={obs} onChange={(e) => setObs(e.target.value)} /></div>
    </div>
  );
}
