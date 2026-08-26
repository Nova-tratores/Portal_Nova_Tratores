'use client';
// "Peguei esta peça" — pra onde ela vai.
//
// Todo destino termina num PEDIDO: a OS usa o PPV dela (resolvido na liberação),
// balcão e uso interno usam um pedido aberto que a pessoa aponta aqui, ou um
// novo que o rastreio abre na liberação. Por isso o formulário sempre pede ou
// um documento existente ou o mínimo pra criar um — e criar (OS ou pedido) é
// opção daqui mesmo, senão quem está no balcão teria que largar a peça e ir
// pro Pós-Vendas.
//
// O que sai daqui vai pro POST /api/pecas/unidades/[id]/acoes (ação 'retirar').
import { useCallback, useEffect, useRef, useState } from 'react';
import { authHeaders } from '@/lib/auth/client';
import type { DestinoTipo } from '@/lib/pecas/unidades';

export interface ClienteEscolhido {
  nome: string;
  documento: string;
  endereco: string;
  cidade: string;
}

export interface DadosRetirada {
  destino_tipo: DestinoTipo;
  destino_os?: string;
  destino_ppv?: string;
  ppv_novo?: { cliente: string; documento: string; tecnico: string };
  obs: string;
}

interface OSAberta { id: string; cliente: string; status: string }
interface PPVAberto { id: string; cliente: string; tecnico: string; status: string; tipo: string; valor: number }

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
  border: '1px solid #cbd5e1', fontSize: 14, background: '#fff', color: '#0f172a',
};
const btnCheio = (bg: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 16px', borderRadius: 10, border: 'none', background: bg, color: '#fff',
  fontSize: 14, fontWeight: 800, cursor: 'pointer', width: '100%',
});
const btnSec: React.CSSProperties = {
  ...btnCheio('#fff'), color: '#334155', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: 13,
};
const rotulo: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 };
const caixa: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 };

// ── busca de cliente (mesma fonte do PPV: cadastro do Omie) ────────────────
function BuscaCliente({ valor, onEscolher }: { valor: ClienteEscolhido | null; onEscolher: (c: ClienteEscolhido | null) => void }) {
  const [termo, setTermo] = useState('');
  const [achados, setAchados] = useState<ClienteEscolhido[]>([]);
  const [buscando, setBuscando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const t = termo.trim();
    if (valor || t.length < 2) { setAchados([]); return; }
    timer.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/ppv/clientes?termo=${encodeURIComponent(t)}`);
        const j = await r.json();
        setAchados(Array.isArray(j) ? j.slice(0, 8) : []);
      } catch { setAchados([]); } finally { setBuscando(false); }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [termo, valor]);

  if (valor) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '9px 12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#065f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{valor.nome}</div>
          {valor.documento && <div style={{ fontSize: 11.5, color: '#047857' }}>{valor.documento}</div>}
        </div>
        <button type="button" onClick={() => { onEscolher(null); setTermo(''); }}
          style={{ background: 'none', border: 'none', color: '#047857', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>trocar</button>
      </div>
    );
  }

  return (
    <div>
      <input placeholder="Buscar cliente (nome ou CNPJ/CPF)…" value={termo} onChange={e => setTermo(e.target.value)} style={inp} />
      {buscando && <div style={{ fontSize: 12, color: '#94a3b8', padding: '6px 2px' }}>Buscando…</div>}
      {!buscando && achados.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, marginTop: 6, overflow: 'hidden' }}>
          {achados.map((c, i) => (
            <button key={`${c.documento}-${i}`} type="button" onClick={() => onEscolher(c)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: '#fff', border: 'none', borderTop: i ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{c.nome}</div>
              <div style={{ fontSize: 11.5, color: '#64748b' }}>{[c.documento, c.cidade].filter(Boolean).join(' · ')}</div>
            </button>
          ))}
        </div>
      )}
      {!buscando && termo.trim().length >= 2 && achados.length === 0 && (
        <div style={{ fontSize: 12, color: '#94a3b8', padding: '6px 2px' }}>Nenhum cliente com esse nome.</div>
      )}
    </div>
  );
}

// ── formulário ─────────────────────────────────────────────────────────────
export default function FormRetirada({ nome, enviando, onConfirmar, onVoltar }: {
  /** quem está logado — vira o autor da OS criada por aqui */
  nome: string;
  enviando: boolean;
  onConfirmar: (d: DadosRetirada) => void;
  onVoltar: () => void;
}) {
  const [destino, setDestino] = useState<DestinoTipo>('os');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');

  // OS
  const [oss, setOss] = useState<OSAberta[]>([]);
  const [osSel, setOsSel] = useState('');
  const [filtroOs, setFiltroOs] = useState('');
  const [criandoOs, setCriandoOs] = useState(false);
  const [osCliente, setOsCliente] = useState<ClienteEscolhido | null>(null);
  const [osTecnico, setOsTecnico] = useState('');
  const [osTipo, setOsTipo] = useState('Manutenção');
  const [osServico, setOsServico] = useState('');
  const [salvandoOs, setSalvandoOs] = useState(false);

  // PPV (balcão / uso interno)
  const [ppvs, setPpvs] = useState<PPVAberto[]>([]);
  const [ppvSel, setPpvSel] = useState('');
  const [filtroPpv, setFiltroPpv] = useState('');
  const [criandoPpv, setCriandoPpv] = useState(false);
  const [ppvCliente, setPpvCliente] = useState<ClienteEscolhido | null>(null);
  const [ppvTecnico, setPpvTecnico] = useState('');

  const [tecnicos, setTecnicos] = useState<string[]>([]);

  const precisaPpv = destino === 'balcao' || destino === 'uso_interno';

  // listas carregadas sob demanda: quem só vai marcar OS não paga a busca de PPVs
  useEffect(() => {
    if (destino !== 'os' || oss.length > 0) return;
    (async () => {
      try {
        const r = await fetch('/api/ppv/ordens-servico?abertas=1');
        const j = await r.json();
        if (r.ok) setOss(j.ordens || j || []);
      } catch { /* select fica vazio; dá pra criar a OS aqui mesmo */ }
    })();
  }, [destino, oss.length]);

  const carregarPpvs = useCallback(async () => {
    try {
      const r = await fetch('/api/pecas/ppvs-abertos', { headers: await authHeaders() });
      const j = await r.json();
      if (r.ok) setPpvs(j.pedidos || []);
    } catch { /* segue: dá pra criar um novo */ }
  }, []);

  useEffect(() => {
    if (!precisaPpv || ppvs.length > 0) return;
    carregarPpvs();
  }, [precisaPpv, ppvs.length, carregarPpvs]);

  useEffect(() => {
    if (!criandoOs && !criandoPpv) return;
    if (tecnicos.length > 0) return;
    (async () => {
      try {
        const r = await fetch('/api/pos/tecnicos');
        const j = await r.json();
        if (Array.isArray(j)) setTecnicos(j);
      } catch { /* fica como texto livre */ }
    })();
  }, [criandoOs, criandoPpv, tecnicos.length]);

  // ── criar a OS por aqui (mesma rota do Pós-Vendas: log, notificação do
  //    técnico e checagem Mahindra saem de graça) ──────────────────────────
  const criarOs = async () => {
    if (!osCliente || !osTecnico || !osServico.trim()) return;
    setSalvandoOs(true);
    setErro('');
    try {
      const r = await fetch('/api/pos/ordens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeCliente: osCliente.nome,
          cpfCliente: osCliente.documento,
          enderecoCliente: osCliente.endereco,
          cidadeCliente: osCliente.cidade,
          tecnicoResponsavel: osTecnico,
          tipoServico: osTipo,
          servicoSolicitado: osServico.trim(),
          // autoria de verdade no log da OS; a origem fica no serviço solicitado
          userName: nome || 'Rastreio de peças (QR)',
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.novaOsId) { setErro(j.erro || 'Não consegui criar a OS.'); return; }
      // entra na lista e já fica selecionada
      setOss(prev => [{ id: j.novaOsId, cliente: osCliente.nome, status: 'Orçamento' }, ...prev]);
      setOsSel(j.novaOsId);
      setCriandoOs(false);
      setFiltroOs('');
    } catch {
      setErro('Erro de conexão ao criar a OS.');
    } finally {
      setSalvandoOs(false);
    }
  };

  const podeConfirmar = destino === 'os'
    ? !!osSel
    : !!ppvSel || !!ppvCliente;

  const confirmar = () => {
    if (!podeConfirmar) return;
    onConfirmar({
      destino_tipo: destino,
      ...(destino === 'os' ? { destino_os: osSel } : {}),
      ...(precisaPpv && ppvSel ? { destino_ppv: ppvSel } : {}),
      ...(precisaPpv && !ppvSel && ppvCliente
        ? { ppv_novo: { cliente: ppvCliente.nome, documento: ppvCliente.documento, tecnico: ppvTecnico } }
        : {}),
      obs,
    });
  };

  const ppvsFiltrados = ppvs
    .filter(p => !filtroPpv.trim() || `${p.id} ${p.cliente} ${p.tecnico}`.toLowerCase().includes(filtroPpv.trim().toLowerCase()))
    .slice(0, 80);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Pra onde vai a peça?</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {([['os', 'Ordem de serviço'], ['balcao', 'Venda balcão'], ['uso_interno', 'Uso interno']] as [DestinoTipo, string][]).map(([v, rot]) => (
          <button key={v} type="button" onClick={() => { setDestino(v); setErro(''); }} style={{
            padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            border: destino === v ? '2px solid #C41E2A' : '1px solid #cbd5e1',
            background: destino === v ? '#fef2f2' : '#fff', color: destino === v ? '#C41E2A' : '#334155',
          }}>{rot}</button>
        ))}
      </div>

      {erro && <div style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 700 }}>{erro}</div>}

      {/* ── destino OS ── */}
      {destino === 'os' && !criandoOs && (
        <>
          <input placeholder="Filtrar OS (nº ou cliente)…" value={filtroOs} onChange={e => setFiltroOs(e.target.value)} style={inp} />
          <select value={osSel} onChange={e => setOsSel(e.target.value)} style={inp}>
            <option value="">Selecione a OS…</option>
            {oss
              .filter(o => !filtroOs.trim() || `${o.id} ${o.cliente}`.toLowerCase().includes(filtroOs.trim().toLowerCase()))
              .slice(0, 80)
              .map(o => <option key={o.id} value={o.id}>{o.id} · {o.cliente}</option>)}
          </select>
          <button type="button" onClick={() => setCriandoOs(true)} style={btnSec}>+ A OS ainda não existe — criar agora</button>
        </>
      )}

      {destino === 'os' && criandoOs && (
        <div style={caixa}>
          <div style={rotulo}>Nova ordem de serviço</div>
          <BuscaCliente valor={osCliente} onEscolher={setOsCliente} />
          <select value={osTecnico} onChange={e => setOsTecnico(e.target.value)} style={inp}>
            <option value="">Técnico responsável…</option>
            {tecnicos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={osTipo} onChange={e => setOsTipo(e.target.value)} style={inp}>
            <option value="Manutenção">Manutenção</option>
            <option value="Revisão">Revisão</option>
          </select>
          <textarea placeholder="Qual serviço é? (o que o cliente pediu)" value={osServico} onChange={e => setOsServico(e.target.value)}
            rows={3} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
            A OS nasce em <strong>Orçamento</strong> com o essencial. Horas, km e o resto entram depois pelo Pós-Vendas.
          </div>
          <button type="button" onClick={criarOs} disabled={salvandoOs || !osCliente || !osTecnico || !osServico.trim()} style={btnCheio('#0ea5e9')}>
            {salvandoOs ? 'Criando OS…' : 'Criar OS'}
          </button>
          <button type="button" onClick={() => setCriandoOs(false)} style={btnSec}>Cancelar</button>
        </div>
      )}

      {/* ── destinos balcão / uso interno: sempre num pedido ── */}
      {precisaPpv && !criandoPpv && (
        <>
          <div style={rotulo}>Em qual pedido essa peça entra?</div>
          <input placeholder="Filtrar pedido (nº, cliente ou técnico)…" value={filtroPpv} onChange={e => setFiltroPpv(e.target.value)} style={inp} />
          <select value={ppvSel} onChange={e => setPpvSel(e.target.value)} style={inp}>
            <option value="">Selecione o pedido aberto…</option>
            {ppvsFiltrados.map(p => (
              <option key={p.id} value={p.id}>{p.id} · {p.cliente || 'sem cliente'}{p.status ? ` · ${p.status}` : ''}</option>
            ))}
          </select>
          <button type="button" onClick={() => { setCriandoPpv(true); setPpvSel(''); }} style={btnSec}>
            + Não tem pedido aberto — criar um
          </button>
        </>
      )}

      {precisaPpv && criandoPpv && (
        <div style={caixa}>
          <div style={rotulo}>Novo pedido {destino === 'balcao' ? '· venda balcão' : '· uso interno'}</div>
          <BuscaCliente valor={ppvCliente} onEscolher={setPpvCliente} />
          <select value={ppvTecnico} onChange={e => setPpvTecnico(e.target.value)} style={inp}>
            <option value="">Técnico (opcional)…</option>
            {tecnicos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
            O pedido é aberto quando o departamento liberar a peça, com a observação de que
            veio do rastreio de peças (QR). Se a liberação for recusada, nada é criado.
          </div>
          <button type="button" onClick={() => { setCriandoPpv(false); setPpvCliente(null); }} style={btnSec}>
            Voltar e escolher um pedido existente
          </button>
        </div>
      )}

      <input placeholder="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)} style={inp} />
      <button type="button" onClick={confirmar} disabled={enviando || !podeConfirmar} style={btnCheio('#16a34a')}>
        {enviando ? 'Registrando…' : 'Confirmar retirada'}
      </button>
      <button type="button" onClick={onVoltar} style={btnSec}>Voltar</button>
    </div>
  );
}
