'use client';
// Escolher uma proposta e ver, lado a lado, o que ela traz para o pedido.
// Opcional: o pedido existe sem proposta.
import { useEffect, useState } from 'react';
import { Search, X, FileText, Check } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { brl, dataCurta } from '@/lib/pedidos-maquinas/lista';
import type { Importacao } from '@/lib/pedidos-maquinas/regras';
import { numeroBR } from '@/lib/propostas/pagamento';

interface PropostaItem {
  id: number; Cliente?: string; Cidade?: string; Marca?: string; Modelo?: string; Valor_Total?: string | number;
  status?: string; vendedor_nome?: string; criado_em?: string; pedido?: string | null; temPagamento?: boolean;
}

interface Props {
  pedidoId: number;
  totalPedido: number;
  onFechar: () => void;
  onImportado: () => void;
}

const VENDIDA = 'Concluida-Vendido';
const MEIO: Record<string, string> = { boleto: 'Boleto', pix: 'PIX', cheque: 'Cheque', financiamento: 'Financiamento', outro: 'Outro' };

export default function ModalImportarProposta({ pedidoId, totalPedido, onFechar, onImportado }: Props) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<PropostaItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [escolhida, setEscolhida] = useState<number | null>(null);
  const [previa, setPrevia] = useState<{ previa: Importacao; proposta: PropostaItem & { Condicoes?: string }; semTabelaPagamento?: boolean } | null>(null);
  const [cliente, setCliente] = useState(true);
  const [parcelas, setParcelas] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setCarregando(true);
      try {
        const r = await fetchAuth(`/api/pedidos-maquinas/propostas?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        setLista(j.propostas || []);
        if (j.error) setErro(j.error);
      } finally { setCarregando(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!escolhida) { setPrevia(null); return; }
    fetchAuth(`/api/pedidos-maquinas/propostas?id=${escolhida}&total=${totalPedido}`)
      .then((r) => r.json()).then((j) => { if (j.error) setErro(j.error); else setPrevia(j); });
  }, [escolhida, totalPedido]);

  const importar = async () => {
    if (!escolhida) return;
    setSalvando(true); setErro('');
    try {
      const r = await fetchAuth('/api/pedidos-maquinas/importar-proposta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido_id: pedidoId, proposta_id: escolhida, oque: { cliente, parcelas } }),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.error || 'Não foi possível importar.'); return; }
      onImportado();
    } finally { setSalvando(false); }
  };

  return (
    <div className="pm-modal-fundo" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="pm-modal" role="dialog" aria-label="Importar de uma proposta">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={20} color="#dc2626" />
          <div style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Importar de uma proposta</div>
          <button className="pm-btn" onClick={onFechar} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-light)' }}>
          Opcional. A proposta traz o cliente, o vendedor e a forma de pagamento (entrada e parcelas). Os itens você escolhe no pedido, pelo chassi.
        </div>

        {!escolhida && (
          <>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-light)' }} />
              <input autoFocus className="pm-input" style={{ paddingLeft: 32 }} placeholder="Cliente, modelo, cidade, vendedor ou nº da proposta" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {carregando && <div style={{ fontSize: 13, color: 'var(--text-light)' }}>Buscando…</div>}
              {!carregando && !lista.length && <div style={{ fontSize: 13, color: 'var(--text-light)' }}>Nenhuma proposta encontrada.</div>}
              {lista.map((p) => (
                <button key={p.id} disabled={!!p.pedido} onClick={() => setEscolhida(p.id)} className="pm-card"
                  style={{ textAlign: 'left', cursor: p.pedido ? 'not-allowed' : 'pointer', opacity: p.pedido ? 0.55 : 1, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'inherit', color: 'var(--text)' }}>
                  <span style={{ fontWeight: 800, color: '#dc2626' }}>#{p.id}</span>
                  <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{p.Cliente || 'sem cliente'}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-light)' }}>{[p.Marca, p.Modelo].filter(Boolean).join(' ')} · {p.Cidade || '—'} · {p.vendedor_nome || '—'} · {dataCurta(p.criado_em)}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {p.status === VENDIDA
                      ? <span className="pm-selo" style={{ background: '#dcfce7', color: '#166534' }}>Vendida</span>
                      : <span className="pm-selo" style={{ background: '#f1f5f9', color: '#475569' }}>{p.status || 'aberta'}</span>}
                    {p.temPagamento && <span className="pm-selo" style={{ background: '#e0f2fe', color: '#075985' }}>com parcelas</span>}
                    {p.pedido && <span className="pm-selo" style={{ background: '#fee2e2', color: '#991b1b' }}>já no {p.pedido}</span>}
                    <b>{brl(numeroBR(p.Valor_Total))}</b>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {escolhida && previa && (
          <>
            <button className="pm-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setEscolhida(null)}>← Outra proposta</button>
            <div className="pm-grade">
              <div className="pm-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="pm-lbl">Proposta #{previa.proposta.id}</span>
                <b>{previa.proposta.Cliente}</b>
                <span style={{ fontSize: 13 }}>{previa.previa.modelo || '—'}</span>
                <span style={{ fontSize: 13 }}>Valor: <b>{brl(previa.previa.valor_proposta)}</b></span>
                {previa.proposta.Condicoes && <span style={{ fontSize: 12.5, color: 'var(--text-light)' }}>Condições: {previa.proposta.Condicoes}</span>}
              </div>
              <div className="pm-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="pm-lbl">O que entra no pedido</span>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, minHeight: 32 }}>
                  <input type="checkbox" checked={cliente} onChange={(e) => setCliente(e.target.checked)} style={{ width: 18, height: 18 }} />
                  Cliente e vendedor
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, minHeight: 32 }}>
                  <input type="checkbox" checked={parcelas} disabled={!previa.previa.parcelas.length} onChange={(e) => setParcelas(e.target.checked)} style={{ width: 18, height: 18 }} />
                  Pagamento ({previa.previa.parcelas.length} parcela(s)) — substitui o do pedido
                </label>
              </div>
            </div>
            {previa.semTabelaPagamento && <div className="pm-aviso">O pagamento estruturado da proposta ainda não foi ativado (sql/proposta-pagamento.sql).</div>}
            {previa.previa.avisos.map((a, i) => <div key={i} className="pm-aviso">{a}</div>)}
            {previa.previa.parcelas.length > 0 && (
              <div className="pm-tabela-wrap">
                <table className="pm-tabela" style={{ minWidth: 420 }}>
                  <thead><tr><th>Nº</th><th>Vencimento</th><th>Valor</th><th>%</th><th>Meio</th></tr></thead>
                  <tbody>
                    {previa.previa.parcelas.map((p) => (
                      <tr key={p.n}>
                        <td>{p.entrada ? 'Entrada' : p.n}</td><td>{dataCurta(p.vencimento)}</td><td>{brl(p.valor)}</td>
                        <td>{p.percentual.toLocaleString('pt-BR')}%</td><td>{MEIO[p.meio] || p.meio}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {erro && <div className="pm-erro">{erro}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="pm-btn" onClick={onFechar}>Cancelar</button>
              <button className="pm-btn pri" disabled={salvando} onClick={importar}><Check size={16} /> {salvando ? 'Importando…' : 'Importar para o pedido'}</button>
            </div>
          </>
        )}
        {escolhida && !previa && !erro && <div style={{ fontSize: 13 }}>Carregando a proposta…</div>}
        {!escolhida && erro && <div className="pm-erro">{erro}</div>}
      </div>
    </div>
  );
}
