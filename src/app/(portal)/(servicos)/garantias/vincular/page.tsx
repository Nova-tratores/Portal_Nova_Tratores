'use client';
// Ligar um adesivo de QR (impresso em lote, ainda sem trator) a um trator.
// Abre pelo celular: a equipe lê o adesivo, a página pública mostra
// "Sou da Nova Tratores: ligar a um trator" e cai aqui com ?c=<código>.
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, CheckCircle2, Link2, Unlink, ExternalLink, QrCode } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { authHeaders } from '@/lib/auth/client';
import { normalizarCodigo } from '@/lib/garantias/qr-trator';

type Situacao = {
  codigo: string;
  lote: string | null;
  chassis: string | null;
  modelo: string | null;
  cliente: string | null;
  vinculadoEm: string | null;
  vinculadoPor: string | null;
};
type Trator = { chassis: string; modelo: string | null; cliente: string | null; entrega: string | null; codigo: string | null };

const VERMELHO = '#dc2626';

async function api(url: string, corpo?: unknown) {
  const r = await fetch(url, corpo === undefined
    ? { headers: { ...(await authHeaders()) } }
    : { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.erro || `Falha (${r.status})`);
  return d;
}

function dataBR(iso: string | null) {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function Tela() {
  const { userProfile } = useAuth();
  const { temAcesso } = usePermissoes(userProfile?.id);
  const podeDesligar = temAcesso('garantias');
  const [codigoDigitado, setCodigoDigitado] = useState('');
  const [codigo, setCodigo] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [tratores, setTratores] = useState<Trator[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [escolhido, setEscolhido] = useState<Trator | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const c = normalizarCodigo(new URLSearchParams(window.location.search).get('c'));
    if (c) setCodigo(c);
  }, []);

  const carregar = useCallback(async (c: string) => {
    setCarregando(true);
    setErro('');
    try {
      const d = await api(`/api/garantia-cliente/qr?codigo=${c}`);
      setSituacao(d.situacao);
    } catch (e) {
      setSituacao(null);
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { if (codigo) carregar(codigo); }, [codigo, carregar]);

  useEffect(() => {
    const q = busca.trim();
    if (q.length < 3) { setTratores(null); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      try { setTratores((await api(`/api/garantia-cliente/qr?q=${encodeURIComponent(q)}`)).tratores); }
      catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
      finally { setBuscando(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [busca]);

  async function ligar() {
    if (!codigo || !escolhido) return;
    setSalvando(true);
    setErro('');
    try {
      await api('/api/garantia-cliente/qr', { acao: 'vincular', codigo, chassis: escolhido.chassis });
      setPronto(true);
      await carregar(codigo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSalvando(false);
    }
  }

  async function desligar() {
    if (!codigo || !situacao?.chassis) return;
    if (!confirm(`Soltar o adesivo ${codigo} do chassi ${situacao.chassis}? Ele volta a ficar livre.`)) return;
    setSalvando(true);
    setErro('');
    try {
      await api('/api/garantia-cliente/qr', { acao: 'desvincular', codigo });
      setPronto(false);
      setEscolhido(null);
      await carregar(codigo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSalvando(false);
    }
  }

  const caixa: React.CSSProperties = { background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, padding: 16 };
  const campo: React.CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: 48, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 16 };

  return (
    <div style={{ padding: 16, maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14, color: 'var(--portal-text)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 800 }}>
        <Link2 size={22} color={VERMELHO} /> Ligar adesivo ao trator
      </div>

      {!codigo ? (
        <div style={caixa}>
          <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--portal-text-muted)' }}>
            Leia o adesivo com a câmera do celular, ou digite o código que aparece no fim do endereço (6 letras e números).
          </p>
          <form onSubmit={(e) => { e.preventDefault(); const c = normalizarCodigo(codigoDigitado); if (c) setCodigo(c); else setErro('Código com 6 letras e números.'); }} style={{ display: 'flex', gap: 8 }}>
            <input value={codigoDigitado} onChange={(e) => setCodigoDigitado(e.target.value.toUpperCase())} placeholder="Ex.: K7P2QX" maxLength={6} style={{ ...campo, letterSpacing: 3, textTransform: 'uppercase' }} aria-label="Código do adesivo" />
            <button type="submit" style={botao(true)}>Abrir</button>
          </form>
        </div>
      ) : (
        <div style={{ ...caixa, display: 'flex', alignItems: 'center', gap: 12 }}>
          <QrCode size={34} color={VERMELHO} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>Adesivo</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 3 }}>{codigo}</div>
            {situacao?.lote && <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Lote {situacao.lote}</div>}
          </div>
          <button onClick={() => { setCodigo(null); setSituacao(null); setPronto(false); setEscolhido(null); setErro(''); }} style={{ ...botao(false), marginLeft: 'auto' }}>Outro</button>
        </div>
      )}

      {carregando && <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Loader2 size={22} className="spin" /></div>}

      {situacao?.chassis && (
        <div style={{ ...caixa, borderLeft: `5px solid ${pronto ? '#16a34a' : VERMELHO}` }}>
          {pronto && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16a34a', fontWeight: 800, marginBottom: 8 }}><CheckCircle2 size={18} /> Adesivo ligado</div>}
          <div style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>Este adesivo é do trator</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{situacao.modelo || 'Modelo não informado'}</div>
          <div style={{ overflowWrap: 'anywhere' }}>Chassi {situacao.chassis}</div>
          {situacao.cliente && <div style={{ overflowWrap: 'anywhere' }}>{situacao.cliente}</div>}
          {situacao.vinculadoEm && <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 4 }}>Ligado por {situacao.vinculadoPor} em {dataBR(situacao.vinculadoEm)}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <a href={`/garantia/${situacao.codigo}`} target="_blank" rel="noopener" style={botao(true)}><ExternalLink size={15} /> Ver como o cliente vê</a>
            {podeDesligar && <button disabled={salvando} onClick={desligar} style={botao(false)}><Unlink size={15} /> Soltar do trator</button>}
          </div>
        </div>
      )}

      {situacao && !situacao.chassis && (
        <div style={caixa}>
          <b style={{ fontSize: 16 }}>Qual é o trator?</b>
          <p style={{ margin: '4px 0 10px', fontSize: 13, color: 'var(--portal-text-muted)' }}>Busque pelo final do chassi (ex.: 6919), pelo cliente ou pelo modelo.</p>
          <label style={{ position: 'relative', display: 'block' }}>
            <Search size={17} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
            <input value={busca} onChange={(e) => { setBusca(e.target.value); setEscolhido(null); }} placeholder="Chassi, cliente ou modelo" style={{ ...campo, paddingLeft: 38 }} aria-label="Buscar trator" />
          </label>
          {buscando && <div style={{ padding: 10, display: 'flex', justifyContent: 'center' }}><Loader2 size={18} className="spin" /></div>}
          {tratores && tratores.length === 0 && !buscando && <p style={{ fontSize: 14, color: 'var(--portal-text-muted)' }}>Nenhum trator encontrado no cadastro.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {(tratores || []).map((t) => {
              const ocupado = !!t.codigo;
              const sel = escolhido?.chassis === t.chassis;
              return (
                <button
                  key={t.chassis}
                  disabled={ocupado}
                  onClick={() => setEscolhido(t)}
                  style={{
                    textAlign: 'left', minHeight: 56, padding: 12, borderRadius: 10, cursor: ocupado ? 'not-allowed' : 'pointer',
                    border: `2px solid ${sel ? VERMELHO : 'var(--portal-border)'}`, background: 'var(--portal-bg-input)', color: 'var(--portal-text)',
                    opacity: ocupado ? 0.55 : 1,
                  }}
                >
                  <b>{t.modelo || 'Modelo não informado'}</b> · <span style={{ overflowWrap: 'anywhere' }}>{t.chassis}</span>
                  <div style={{ fontSize: 13, color: 'var(--portal-text-muted)', overflowWrap: 'anywhere' }}>
                    {t.cliente || 'Sem cliente no cadastro'} · entrega {dataBR(t.entrega)}
                    {ocupado && ` · já tem o adesivo ${t.codigo}`}
                  </div>
                </button>
              );
            })}
          </div>
          {escolhido && (
            <button disabled={salvando} onClick={ligar} style={{ ...botao(true), width: '100%', justifyContent: 'center', minHeight: 52, fontSize: 16, marginTop: 12 }}>
              {salvando ? <Loader2 size={17} className="spin" /> : <Link2 size={17} />} Ligar {codigo} ao {escolhido.modelo || 'trator'} ({escolhido.chassis.slice(-4)})
            </button>
          )}
        </div>
      )}

      {erro && <div style={{ ...caixa, borderLeft: `5px solid ${VERMELHO}`, fontSize: 14 }}>{erro}</div>}
    </div>
  );
}

function botao(primario: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 700,
    cursor: 'pointer', textDecoration: 'none',
    border: primario ? 'none' : '1px solid var(--portal-border)',
    background: primario ? 'linear-gradient(135deg, #dc2626, #7f1d1d)' : 'var(--portal-bg-input)',
    color: primario ? '#fefefe' : 'var(--portal-text)',
  };
}

export default function Page() {
  const { userProfile } = useAuth();
  const { temAcesso, loading } = usePermissoes(userProfile?.id);
  if (!loading && userProfile && !temAcesso('garantias') && !temAcesso('pos')) return <SemPermissao />;
  return <Tela />;
}
