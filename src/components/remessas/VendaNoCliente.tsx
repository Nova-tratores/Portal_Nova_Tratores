'use client';
// Demonstração que vira venda NA CASA DO CLIENTE: escolher a proposta, conferir e confirmar.
// A sequência roda no servidor (lib/remessas/venda-cliente-server.ts) e pode ser retomada ("Continuar").
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { ETAPAS_VENDA, type EtapaVenda } from '@/lib/remessas/venda-cliente';

interface PropostaP { id: number; cliente: string; valor: number; status: string | null; pedidos: string[] }
interface Prev {
  remessa: { numero: string; cliente: string; cnpj: string; nf: { numero: string } | null };
  cfopVolta: string; bloqueios: string[];
  processo: { etapa: EtapaVenda; erro: string | null; proposta_id: number; os_id: string | null } | null;
  propostas: PropostaP[];
  proposta: (PropostaP & { bloqueios: string[]; avisos: string[] }) | null;
  itens: Array<{ descricao: string; chassi: string | null; qtde: number; preco: number }>;
  avisosItens: string[];
  oss: Array<{ osId: string; cliente: string; projeto: string; motivo: string; roteiros: Array<{ id: string; nome: string; etapas: Array<{ id: string; nome: string; status: string }>; pular: string[] }> }>;
  omieErro: string | null; podeVender: boolean;
}
const brl = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ROT_ETAPA: Record<string, string> = { pendente: 'aguardando', liberada: 'em andamento', concluida: 'feita', pulada: 'pulada' };

export default function VendaNoCliente({ conta, idRemessa, onFeito, onFechar }: { conta: string; idRemessa: number; onFeito: () => void; onFechar: () => void }) {
  const [prev, setPrev] = useState<Prev | null>(null);
  const [propostaId, setPropostaId] = useState<number | null>(null);
  const [osId, setOsId] = useState<string>('');
  const [erro, setErro] = useState('');
  const [rodando, setRodando] = useState(false);
  const [feito, setFeito] = useState<{ pedido: { id: number; id_pedido: string } | null; puladas: number } | null>(null);

  const carregar = useCallback(async (pid?: number | null) => {
    try {
      const r = await fetchAuth(`/api/remessas?venda=${conta}-${idRemessa}${pid ? `&proposta=${pid}` : ''}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
      setPrev(j); setErro('');
      if (j.processo) { setPropostaId(j.processo.proposta_id); setOsId(j.processo.os_id || ''); }
      else {
        if (!pid && j.propostas.length === 1) { setPropostaId(j.propostas[0].id); carregar(j.propostas[0].id); }
        setOsId((o) => o || (j.oss.length === 1 ? j.oss[0].osId : ''));
      }
    } catch (e) { setErro((e as Error).message); }
  }, [conta, idRemessa]);
  useEffect(() => { carregar(); }, [carregar]);

  const escolher = (id: number) => { setPropostaId(id); carregar(id); };

  const confirmar = async () => {
    setRodando(true); setErro('');
    try {
      const r = await fetchAuth('/api/remessas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'venda_cliente', conta, idRemessa, propostaId, osId: osId || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
      if (j.ok === false) { setErro(j.erro || 'Parou no meio.'); await carregar(propostaId); onFeito(); return; }
      setFeito({ pedido: j.pedido || null, puladas: j.puladas || 0 }); onFeito();
    } catch (e) { setErro((e as Error).message); await carregar(propostaId); }
    finally { setRodando(false); }
  };

  const desistir = async () => {
    if (!window.confirm('Desistir da venda no cliente? Nada foi emitido ainda; se a nota de volta ficou criada na Omie, cancele lá.')) return;
    setRodando(true);
    try {
      const r = await fetchAuth('/api/remessas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'venda_cliente_cancelar', conta, idRemessa }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
      onFeito(); onFechar();
    } catch (e) { setErro((e as Error).message); }
    finally { setRodando(false); }
  };

  if (feito) {
    return (
      <div className="rm-ok" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><CheckCircle2 size={18} /> <b>Venda no cliente registrada.</b></div>
        <div>A nota de volta simbólica foi emitida e a remessa ficou como “virou venda”{feito.pedido ? <> — pedido <b>{feito.pedido.id_pedido}</b></> : null}.
          {feito.puladas ? ` ${feito.puladas} etapa(s) do roteiro da OS foram puladas.` : ''}</div>
        <div>Agora confira o pedido e envie/fature por lá.</div>
        {feito.pedido && <a className="rm-btn pri" style={{ alignSelf: 'flex-start' }} href={`/propostas?aba=pedidos&pvm=${encodeURIComponent(feito.pedido.id_pedido)}`}><ExternalLink size={15} /> Abrir o pedido {feito.pedido.id_pedido}</a>}
      </div>
    );
  }
  if (!prev) return <div className="rm-card">{erro ? <span style={{ color: 'var(--mx-fg-red, #dc2626)' }}>{erro}</span> : <><Loader2 size={14} className="animate-spin" /> Preparando a prévia (lendo a Omie)…</>}</div>;

  const proc = prev.processo;
  const travas = [...prev.bloqueios, ...(prev.proposta?.bloqueios || []), ...(!proc && !prev.itens.length ? ['A máquina da remessa não está no cadastro do portal.'] : [])];
  const os = prev.oss.find((o) => o.osId === osId);
  const podeConfirmar = prev.podeVender && !rodando && (proc ? true : !!propostaId && !travas.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13.5 }}>
        O cliente ficou com a máquina. O portal faz, nesta ordem: <b>1)</b> a nota de entrada de volta <b>simbólica {prev.cfopVolta}</b> (a máquina volta ao estoque só no papel),
        <b> 2)</b> o <b>pedido de máquina</b> a partir da proposta, <b>3)</b> marca a remessa como “virou venda” e pula as etapas de retorno do roteiro da OS.
        Enviar e faturar o pedido continuam no próprio pedido.
      </div>
      {!prev.podeVender && <div className="rm-aviso">Para vender no cliente é preciso ter <b>Remessas — Emitir</b> e <b>Pedidos de Máquinas — Faturar</b>.</div>}
      {prev.omieErro && <div className="rm-aviso">Omie fora agora: {prev.omieErro}</div>}

      {proc && (
        <div className="rm-aviso" style={{ display: 'flex', gap: 8 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <div>Venda no cliente já começada: <b>{ETAPAS_VENDA[proc.etapa].rotulo}</b>.{proc.erro ? <div style={{ marginTop: 4 }}>Último erro: {proc.erro}</div> : null}</div>
        </div>
      )}

      <div className="rm-campo">
        <span className="rm-lbl">Proposta da venda (obrigatória — do mesmo CPF/CNPJ {prev.remessa.cnpj || ''})</span>
        {prev.propostas.length === 0
          ? <span style={{ fontSize: 13, color: 'var(--mx-fg-red, #dc2626)' }}>Nenhuma proposta deste cliente. Faça a proposta em Propostas e volte aqui.</span>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {prev.propostas.map((p) => (
                <label key={p.id} className="rm-opcao" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', minHeight: 44, borderRadius: 8, border: `1px solid ${propostaId === p.id ? '#7c3aed' : 'var(--border)'}`, cursor: proc ? 'default' : 'pointer', opacity: proc && proc.proposta_id !== p.id ? 0.5 : 1 }}>
                  <input type="radio" name="proposta" disabled={!!proc} checked={propostaId === p.id} onChange={() => escolher(p.id)} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>#{p.id}</b> · {p.cliente} · {brl(p.valor)}
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-light)' }}>{p.status || 'sem status'}{p.pedidos.length ? ` · já no ${p.pedidos.join(', ')}` : ''}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
      </div>

      {prev.proposta && (
        <div className="rm-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="rm-sec">O pedido de máquina que vai nascer</div>
          <div className="rm-tabela-wrap">
            <table className="rm-tabela" style={{ minWidth: 420 }}>
              <thead><tr><th>Máquina</th><th>Chassi</th><th>Qtd</th><th style={{ textAlign: 'right' }}>Preço</th></tr></thead>
              <tbody>
                {prev.itens.map((i, k) => <tr key={k} style={{ cursor: 'default' }}><td>{i.descricao}</td><td>{i.chassi || '—'}</td><td>{i.qtde}</td><td style={{ textAlign: 'right' }}>{brl(i.preco)}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-light)' }}>Cliente, vendedor e parcelas vêm da proposta #{prev.proposta.id}.</div>
          {[...prev.proposta.avisos, ...prev.avisosItens].map((a) => <div key={a} style={{ fontSize: 12.5, color: 'var(--mx-fg-amber, #b45309)' }}>⚠ {a}</div>)}
        </div>
      )}

      <div className="rm-campo">
        <span className="rm-lbl">OS da demonstração (roteiro de checklists)</span>
        <select className="rm-input" value={osId} disabled={!!proc && proc.etapa === 'concluida'} onChange={(e) => setOsId(e.target.value)} style={{ minHeight: 44 }}>
          <option value="">Sem OS / não mexer em roteiro</option>
          {prev.oss.map((o) => <option key={o.osId} value={o.osId}>OS {o.osId} · {o.projeto || o.cliente} ({o.motivo})</option>)}
        </select>
        {os && os.roteiros.map((r) => (
          <div key={r.id} style={{ fontSize: 12.5, marginTop: 6 }}>
            <b>{r.nome}:</b>{' '}
            {r.etapas.map((e, i) => (
              <span key={e.id} style={{ color: r.pular.includes(e.id) ? 'var(--mx-fg-red, #dc2626)' : 'inherit' }}>
                {i ? ' → ' : ''}{e.nome} ({r.pular.includes(e.id) ? 'vai ser pulada' : ROT_ETAPA[e.status] || e.status})
              </span>
            ))}
          </div>
        ))}
      </div>

      {travas.length > 0 && !proc && <div className="rm-erro">{travas.map((t) => <div key={t}>{t}</div>)}</div>}
      {erro && <div className="rm-erro">{erro}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="rm-btn pri" style={{ minHeight: 44 }} disabled={!podeConfirmar} onClick={confirmar}>
          {rodando ? <><Loader2 size={15} className="animate-spin" /> Emitindo e criando…</> : proc ? 'Continuar' : 'Confirmar a venda no cliente'}
        </button>
        {proc && (proc.etapa === 'iniciada' || proc.etapa === 'volta_criada') && prev.podeVender && (
          <button className="rm-btn" style={{ minHeight: 44 }} disabled={rodando} onClick={desistir}>Desistir</button>
        )}
        <button className="rm-btn" style={{ minHeight: 44 }} disabled={rodando} onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}
