'use client';
// Aba "Página do cliente" em /garantias: QR code do adesivo, uso da página
// pública /garantia e as dúvidas que os clientes mandaram.
import { useCallback, useEffect, useState } from 'react';
import { Loader2, QrCode, ExternalLink, Download, RefreshCw, MessageCircleQuestion, CheckCircle2, Archive, RotateCcw } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { URL_PAGINA, type ItemContagem, type ResumoUso, type StatusDuvida } from '@/lib/garantias/pagina-cliente';

type Duvida = {
  id: number;
  criado_em: string;
  nome: string;
  chassi_final: string | null;
  mensagem: string;
  status: StatusDuvida;
  resposta: string | null;
  respondido_por: string | null;
  respondido_em: string | null;
};

type Dados = {
  migracaoFaltando?: boolean;
  erro?: string;
  resumo?: ResumoUso;
  perguntasRapidas?: ItemContagem[];
  faq?: ItemContagem[];
  buscas?: ItemContagem[];
  buscasSemResultado?: ItemContagem[];
  whatsapp?: ItemContagem[];
  duvidas?: Duvida[];
};

const VERMELHO = '#dc2626';
const PERIODOS = [7, 30, 90, 365];
const FILTROS: { id: StatusDuvida | 'todas'; label: string }[] = [
  { id: 'nova', label: 'Novas' },
  { id: 'respondida', label: 'Respondidas' },
  { id: 'arquivada', label: 'Arquivadas' },
  { id: 'todas', label: 'Todas' },
];

const card: React.CSSProperties = {
  background: 'var(--portal-bg-card)',
  border: '1px solid var(--portal-border)',
  borderRadius: 12,
  padding: 16,
};

function dataHora(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function PaginaClientePainel() {
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<StatusDuvida | 'todas'>('nova');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const r = await fetch(`/api/garantia-cliente/painel?dias=${dias}`, { headers: { ...(await authHeaders()) } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.erro || `Falha (${r.status})`);
      setDados(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvarDuvida(id: number, campos: { status?: StatusDuvida; resposta?: string | null }) {
    const r = await fetch('/api/garantia-cliente/painel', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ id, ...campos }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.erro || `Falha (${r.status})`);
    setDados((atual) => atual && ({
      ...atual,
      duvidas: (atual.duvidas || []).map((x) => (x.id === id ? d.duvida : x)),
    }));
  }

  const r = dados?.resumo;
  const duvidas = (dados?.duvidas || []).filter((d) => filtro === 'todas' || d.status === filtro);
  const novas = (dados?.duvidas || []).filter((d) => d.status === 'nova').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* QR code */}
      <div style={{ ...card, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <img
          src="/garantia/qrcode.png"
          alt="QR code da página de garantia"
          width={150}
          height={150}
          style={{ background: '#fefefe', borderRadius: 8, border: '1px solid var(--portal-border)' }}
        />
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 16, color: 'var(--portal-text)' }}>
            <QrCode size={18} /> QR code do adesivo
          </div>
          <p style={{ margin: '6px 0 10px', fontSize: 13, color: 'var(--portal-text-muted)' }}>
            Abre a página da garantia Mahindra no celular do cliente. Para a gráfica, mande o arquivo SVG: ele não perde
            qualidade em nenhum tamanho. Imprima com pelo menos 3 cm de lado e deixe a borda branca em volta.
          </p>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, wordBreak: 'break-all', color: 'var(--portal-text)' }}>{URL_PAGINA}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href="/garantia/qrcode.svg" download="qrcode-garantia-nova-tratores.svg" style={botao(true)}><Download size={14} /> QR para a gráfica (SVG)</a>
            <a href="/garantia/qrcode.png" download="qrcode-garantia-nova-tratores.png" style={botao(false)}><Download size={14} /> QR em imagem (PNG)</a>
            <a href="/garantia" target="_blank" rel="noopener" style={botao(false)}><ExternalLink size={14} /> Abrir a página</a>
          </div>
        </div>
      </div>

      {/* Período */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>Período:</span>
        {PERIODOS.map((p) => (
          <button key={p} onClick={() => setDias(p)} style={pilula(dias === p)}>
            {p === 365 ? '1 ano' : `${p} dias`}
          </button>
        ))}
        <button onClick={carregar} style={{ ...pilula(false), display: 'flex', alignItems: 'center', gap: 6 }} title="Atualizar">
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {carregando && !dados ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--portal-text-muted)' }}>
          <Loader2 size={22} className="spin" />
        </div>
      ) : erro ? (
        <div style={{ ...card, borderLeft: `4px solid ${VERMELHO}`, color: 'var(--portal-text)' }}>{erro}</div>
      ) : dados?.migracaoFaltando ? (
        <div style={{ ...card, borderLeft: '4px solid #f59e0b', color: 'var(--portal-text)', fontSize: 14 }}>
          <b>Falta criar as tabelas no banco.</b> {dados.erro} Até lá a página do cliente funciona normalmente, mas as
          dúvidas e os acessos não ficam registrados.
        </div>
      ) : (
        <>
          {/* Números */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Tile label="Acessos à página" valor={r?.visitas ?? 0} cor="#0ea5e9" />
            <Tile label="Pessoas diferentes" valor={r?.pessoas ?? 0} cor="#6366f1" />
            <Tile label="Dúvidas novas" valor={novas} cor={VERMELHO} />
            <Tile label="Cliques no WhatsApp" valor={r?.whatsapp ?? 0} cor="#16a34a" />
            <Tile label='Consultas "Meu trator"' valor={r?.consultas ?? 0} cor="#f59e0b" />
          </div>

          {/* Rankings */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            <Ranking titulo="Perguntas rápidas mais tocadas" itens={dados?.perguntasRapidas} />
            <Ranking titulo="Dúvidas comuns mais abertas" itens={dados?.faq} />
            <Ranking titulo="O que os clientes mais pesquisam" itens={dados?.buscas} />
            <Ranking
              titulo="Pesquisas sem resultado"
              dica="Assuntos que o cliente procurou e a página não tem. Bons candidatos para virar pergunta nova."
              itens={dados?.buscasSemResultado}
              destaque
            />
            <Ranking titulo="WhatsApp: setor procurado" itens={dados?.whatsapp} />
          </div>

          {/* Dúvidas */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <MessageCircleQuestion size={18} color={VERMELHO} />
              <b style={{ fontSize: 16, color: 'var(--portal-text)', marginRight: 'auto' }}>Dúvidas enviadas pelos clientes</b>
              {FILTROS.map((f) => (
                <button key={f.id} onClick={() => setFiltro(f.id)} style={pilula(filtro === f.id)}>{f.label}</button>
              ))}
            </div>
            {duvidas.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--portal-text-muted)' }}>
                {filtro === 'nova' ? 'Nenhuma dúvida nova.' : 'Nada por aqui.'} As dúvidas chegam pelo formulário
                &quot;Ficou com alguma dúvida?&quot; da página do QR code.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {duvidas.map((d) => <CartaoDuvida key={d.id} d={d} salvar={salvarDuvida} />)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CartaoDuvida({ d, salvar }: { d: Duvida; salvar: (id: number, c: { status?: StatusDuvida; resposta?: string | null }) => Promise<void> }) {
  const [resposta, setResposta] = useState(d.resposta || '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function acao(campos: { status?: StatusDuvida; resposta?: string | null }) {
    setSalvando(true);
    setErro('');
    try { await salvar(d.id, campos); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar'); } finally { setSalvando(false); }
  }

  const corStatus = d.status === 'nova' ? VERMELHO : d.status === 'respondida' ? '#16a34a' : '#64748b';
  return (
    <div style={{ border: '1px solid var(--portal-border)', borderLeft: `4px solid ${corStatus}`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13 }}>
        <b style={{ color: 'var(--portal-text)', fontSize: 14 }}>{d.nome}</b>
        {d.chassi_final && <span style={{ color: 'var(--portal-text-muted)' }}>· chassi final {d.chassi_final}</span>}
        <span style={{ color: 'var(--portal-text-muted)', marginLeft: 'auto' }}>{dataHora(d.criado_em)}</span>
      </div>
      <p style={{ margin: '8px 0', whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--portal-text)' }}>{d.mensagem}</p>
      <textarea
        id={`resp-${d.id}`}
        value={resposta}
        onChange={(e) => setResposta(e.target.value)}
        placeholder="Anote a resposta dada ao cliente (opcional)"
        rows={2}
        style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', padding: 8, fontSize: 13, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        {d.status !== 'respondida' && (
          <button disabled={salvando} onClick={() => acao({ status: 'respondida', resposta })} style={botao(true)}>
            <CheckCircle2 size={14} /> Marcar como respondida
          </button>
        )}
        {d.status === 'respondida' && resposta !== (d.resposta || '') && (
          <button disabled={salvando} onClick={() => acao({ resposta })} style={botao(true)}>Salvar resposta</button>
        )}
        {d.status !== 'arquivada' && (
          <button disabled={salvando} onClick={() => acao({ status: 'arquivada' })} style={botao(false)}>
            <Archive size={14} /> Arquivar
          </button>
        )}
        {d.status !== 'nova' && (
          <button disabled={salvando} onClick={() => acao({ status: 'nova' })} style={botao(false)}>
            <RotateCcw size={14} /> Voltar para novas
          </button>
        )}
        {salvando && <Loader2 size={16} className="spin" />}
        {d.respondido_em && (
          <span style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginLeft: 'auto' }}>
            Respondida por {d.respondido_por} em {dataHora(d.respondido_em)}
          </span>
        )}
      </div>
      {erro && <p style={{ margin: '6px 0 0', fontSize: 13, color: VERMELHO }}>{erro}</p>}
    </div>
  );
}

function Tile({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div style={{ ...card, flex: '1 1 150px', borderLeft: `4px solid ${cor}`, padding: '12px 16px' }}>
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
    </div>
  );
}

function Ranking({ titulo, itens, dica, destaque }: { titulo: string; itens?: ItemContagem[]; dica?: string; destaque?: boolean }) {
  const max = Math.max(1, ...(itens || []).map((i) => i.total));
  return (
    <div style={{ ...card, borderTop: destaque ? `3px solid ${VERMELHO}` : undefined }}>
      <b style={{ fontSize: 14, color: 'var(--portal-text)' }}>{titulo}</b>
      {dica && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--portal-text-muted)' }}>{dica}</p>}
      {!itens || itens.length === 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--portal-text-muted)' }}>Sem registros no período.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {itens.map((i) => (
            <div key={i.valor} style={{ fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--portal-text)' }}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{i.valor}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{i.total}</b>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--portal-bg-input)', marginTop: 3 }}>
                <div style={{ width: `${(i.total / max) * 100}%`, height: '100%', borderRadius: 3, background: destaque ? VERMELHO : '#94a3b8' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function pilula(ativa: boolean): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 999, border: '1px solid var(--portal-border)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: ativa ? 'linear-gradient(135deg, #dc2626, #7f1d1d)' : 'var(--portal-bg-input)',
    color: ativa ? '#fefefe' : 'var(--portal-text-secondary)',
  };
}

function botao(primario: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
    cursor: 'pointer', textDecoration: 'none',
    border: primario ? 'none' : '1px solid var(--portal-border)',
    background: primario ? 'linear-gradient(135deg, #dc2626, #7f1d1d)' : 'var(--portal-bg-input)',
    color: primario ? '#fefefe' : 'var(--portal-text)',
  };
}
