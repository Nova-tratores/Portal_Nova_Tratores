'use client';
// QR da garantia POR TRATOR (adesivo de 30 × 30 mm) — dentro da aba
// "Página do cliente (QR)" de /garantias. Busca o trator, gera o código (um por
// trator, todas as cópias iguais) e baixa o arquivo para a gráfica (SVG ou PDF
// no tamanho real). Quem ler o adesivo cai na página da garantia já com o trator.
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, Search, Download, QrCode, ExternalLink, Tractor } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import {
  ADESIVO_MM, CORRECAO_QR, MODULO_MM, conteudoQR, svgAdesivo,
} from '@/lib/garantias/qr-trator';

type TratorQR = {
  chassis: string;
  modelo: string | null;
  cliente: string | null;
  entrega: string | null;
  codigo: string | null;
  downloads: number;
  leituras: number;
  ultimaLeitura: string | null;
};

const VERMELHO = '#dc2626';

function modulosDe(codigo: string): boolean[][] {
  const q = QRCode.create(conteudoQR(codigo), { errorCorrectionLevel: CORRECAO_QR });
  const n = q.modules.size;
  return Array.from({ length: n }, (_, l) => Array.from({ length: n }, (_, c) => !!q.modules.data[l * n + c]));
}

function nomeArquivo(t: TratorQR, ext: string) {
  const modelo = (t.modelo || 'trator').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fim = t.chassis.replace(/[^A-Za-z0-9]/g, '').slice(-4);
  return `qr-garantia-${modelo}-${fim}-${t.codigo}.${ext}`;
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** PDF com UM adesivo de 30 × 30 mm por página (o lote inteiro num arquivo só, para a gráfica). */
async function pdfAdesivos(grades: boolean[][][]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: [ADESIVO_MM, ADESIVO_MM], orientation: 'portrait' });
  grades.forEach((modulos, i) => {
    if (i > 0) doc.addPage([ADESIVO_MM, ADESIVO_MM], 'portrait');
    const n = modulos.length;
    const margem = (ADESIVO_MM - n * MODULO_MM) / 2;
    doc.setFillColor(0, 0, 0);
    for (let l = 0; l < n; l++) {
      let c = 0;
      while (c < n) {
        if (!modulos[l][c]) { c++; continue; }
        let fim = c;
        while (fim + 1 < n && modulos[l][fim + 1]) fim++;
        doc.rect(margem + c * MODULO_MM, margem + l * MODULO_MM, (fim - c + 1) * MODULO_MM, MODULO_MM, 'F');
        c = fim + 1;
      }
    }
  });
  return doc.output('blob');
}

type Lote = { lote: string; criadoEm: string; criadoPor: string | null; total: number; vinculados: number };

async function chamar(url: string, corpo?: unknown) {
  const r = await fetch(url, corpo === undefined
    ? { headers: { ...(await authHeaders()) } }
    : { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.erro || `Falha (${r.status})`);
  return d;
}

async function baixarLote(lote: string, codigos: string[]) {
  baixar(await pdfAdesivos(codigos.map(modulosDe)), `qr-garantia-${lote}-${codigos.length}-adesivos.pdf`);
}

/** Lotes de adesivos impressos antes de ter trator: gera, baixa o PDF e mostra quantos já foram ligados. */
function LotesAdesivos() {
  const [lotes, setLotes] = useState<Lote[] | null>(null);
  const [quantidade, setQuantidade] = useState('100');
  const [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try { setLotes((await chamar('/api/garantia-cliente/qr?lotes=1')).lotes); setErro(''); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setLotes([]); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function gerar() {
    const n = Number(quantidade);
    if (!Number.isInteger(n) || n < 1 || n > 500) { setErro('Quantidade entre 1 e 500.'); return; }
    if (!confirm(`Gerar ${n} adesivos novos (códigos sem trator)? O PDF para a gráfica baixa em seguida.`)) return;
    setOcupado('gerar');
    setErro('');
    try {
      const d = await chamar('/api/garantia-cliente/qr', { acao: 'lote', quantidade: n });
      await baixarLote(d.lote, d.codigos);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setOcupado('');
    }
  }

  async function rebaixar(lote: string) {
    setOcupado(lote);
    setErro('');
    try {
      const d = await chamar(`/api/garantia-cliente/qr?lote=${encodeURIComponent(lote)}`);
      await baixarLote(lote, (d.codigos as { codigo: string }[]).map((x) => x.codigo));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setOcupado('');
    }
  }

  return (
    <div style={{ border: '1px solid var(--portal-border)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
      <b style={{ fontSize: 15, color: 'var(--portal-text)' }}>Lotes de adesivos (para imprimir antes de ter o trator)</b>
      <p style={{ margin: '4px 0 10px', fontSize: 13, color: 'var(--portal-text-muted)' }}>
        Gere os códigos e mande o PDF para a gráfica (um adesivo de 30 × 30 mm por página). Na entrega, leia o adesivo
        com o celular e toque em &quot;Sou da Nova Tratores: ligar a um trator&quot;. Também dá para ligar digitando o código em{' '}
        <a href="/garantias/vincular" style={{ color: 'inherit', fontWeight: 700 }}>Ligar adesivo</a>.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: 'var(--portal-text)' }}>
          Quantidade{' '}
          <input
            type="number" min={1} max={500} inputMode="numeric" value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
            style={{ width: 90, minHeight: 40, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 15 }}
          />
        </label>
        <button disabled={!!ocupado} onClick={gerar} style={botao(true)}>
          {ocupado === 'gerar' ? <Loader2 size={14} className="spin" /> : <QrCode size={14} />} Gerar lote e baixar PDF
        </button>
      </div>
      {erro && <p style={{ margin: '8px 0 0', color: VERMELHO, fontSize: 13 }}>{erro}</p>}
      {lotes && lotes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {lotes.map((l) => (
            <div key={l.lote} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: 'var(--portal-text)', borderTop: '1px solid var(--portal-border)', paddingTop: 6 }}>
              <b>{l.lote}</b>
              <span style={{ color: 'var(--portal-text-muted)' }}>{l.total} adesivos · {l.vinculados} ligados a trator · {l.total - l.vinculados} livres</span>
              <button disabled={!!ocupado} onClick={() => rebaixar(l.lote)} style={{ ...botao(false), marginLeft: 'auto' }}>
                {ocupado === l.lote ? <Loader2 size={14} className="spin" /> : <Download size={14} />} PDF
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function data(iso: string | null, comHora = false) {
  if (!iso) return '—';
  if (!comHora && /^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}) });
}

export default function QrTratores() {
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<TratorQR[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async (q: string) => {
    setCarregando(true);
    setErro('');
    try {
      const r = await fetch(`/api/garantia-cliente/qr?q=${encodeURIComponent(q)}`, { headers: { ...(await authHeaders()) } });
      const d = await r.json().catch(() => ({}));
      if (d.migracaoFaltando) { setAviso(d.erro); setLista([]); return; }
      if (!r.ok || d.ok === false) throw new Error(d.erro || `Falha (${r.status})`);
      setAviso('');
      setLista(d.tratores);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => carregar(busca.trim()), busca ? 400 : 0);
    return () => clearTimeout(t);
  }, [busca, carregar]);

  async function gerar(t: TratorQR) {
    const r = await fetch('/api/garantia-cliente/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ chassis: t.chassis }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.erro || `Falha (${r.status})`);
    setLista((atual) => (atual || []).map((x) => (x.chassis === t.chassis ? { ...x, codigo: d.codigo } : x)));
  }

  async function contarDownload(codigo: string) {
    fetch('/api/garantia-cliente/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ codigo, baixou: true }),
    }).catch(() => {});
    setLista((atual) => (atual || []).map((x) => (x.codigo === codigo ? { ...x, downloads: x.downloads + 1 } : x)));
  }

  return (
    <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 16, color: 'var(--portal-text)' }}>
        <Tractor size={18} /> Adesivo com QR do trator (30 × 30 mm)
      </div>
      <p style={{ margin: '6px 0 12px', fontSize: 13, color: 'var(--portal-text-muted)' }}>
        Cada trator tem um código só dele; todas as cópias do adesivo são iguais. Quem ler o QR abre a página da
        garantia já com o modelo, a data de entrega e as revisões daquele trator (sem nome do cliente). Para a gráfica,
        mande o SVG ou o PDF: os dois já estão no tamanho de 30 mm, sem cortar a borda branca.
      </p>

      <LotesAdesivos />

      <label style={{ position: 'relative', display: 'block' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar trator por chassi, cliente ou modelo"
          aria-label="Buscar trator"
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '8px 12px 8px 36px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 15 }}
        />
      </label>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--portal-text-muted)' }}>
        {busca.trim() ? 'Resultado da busca no cadastro de tratores.' : 'Sem busca: os últimos tratores que ganharam QR.'}
      </p>

      {aviso && <div style={{ marginTop: 12, padding: 12, borderRadius: 10, borderLeft: '4px solid #f59e0b', background: 'var(--portal-bg-input)', fontSize: 14, color: 'var(--portal-text)' }}>{aviso}</div>}
      {erro && <p style={{ marginTop: 12, color: VERMELHO, fontSize: 14 }}>{erro}</p>}

      {carregando && !lista ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Loader2 size={20} className="spin" /></div>
      ) : lista && lista.length === 0 && !aviso ? (
        <p style={{ marginTop: 12, fontSize: 14, color: 'var(--portal-text-muted)' }}>
          {busca.trim() ? 'Nenhum trator encontrado.' : 'Nenhum trator ganhou QR ainda. Busque um trator para gerar.'}
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 10, marginTop: 12, opacity: carregando ? 0.6 : 1 }}>
          {(lista || []).map((t) => (
            <CartaoTrator key={t.chassis} t={t} gerar={gerar} contarDownload={contarDownload} />
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoTrator({ t, gerar, contarDownload }: { t: TratorQR; gerar: (t: TratorQR) => Promise<void>; contarDownload: (c: string) => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const svg = t.codigo ? svgAdesivo(modulosDe(t.codigo)) : null;

  async function acao(fn: () => Promise<void>) {
    setOcupado(true);
    setErro('');
    try { await fn(); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); } finally { setOcupado(false); }
  }

  return (
    <div style={{ border: '1px solid var(--portal-border)', borderLeft: `4px solid ${t.codigo ? VERMELHO : 'var(--portal-border)'}`, borderRadius: 10, padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
      {svg ? (
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
          alt={`QR do trator ${t.chassis}`}
          width={96}
          height={96}
          style={{ flex: 'none', background: '#fefefe', borderRadius: 6, border: '1px solid var(--portal-border)' }}
        />
      ) : (
        <div style={{ flex: 'none', width: 96, height: 96, borderRadius: 6, border: '1px dashed var(--portal-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-muted)' }}>
          <QrCode size={30} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--portal-text)' }}>
        <b style={{ fontSize: 15 }}>{t.modelo || 'Modelo não informado'}</b>
        <div style={{ overflowWrap: 'anywhere', color: 'var(--portal-text-muted)' }}>Chassi {t.chassis}</div>
        {t.cliente && <div style={{ overflowWrap: 'anywhere' }}>{t.cliente}</div>}
        <div style={{ color: 'var(--portal-text-muted)' }}>Entrega {data(t.entrega)}</div>
        {t.codigo && (
          <div style={{ marginTop: 4, color: 'var(--portal-text-muted)' }}>
            Código <b style={{ color: 'var(--portal-text)', letterSpacing: 1 }}>{t.codigo}</b> · lido {t.leituras}×
            {t.ultimaLeitura ? ` (último ${data(t.ultimaLeitura, true)})` : ''} · baixado {t.downloads}×
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {!t.codigo ? (
            <button disabled={ocupado} onClick={() => acao(() => gerar(t))} style={botao(true)}>
              {ocupado ? <Loader2 size={14} className="spin" /> : <QrCode size={14} />} Gerar QR deste trator
            </button>
          ) : (
            <>
              <button
                disabled={ocupado}
                onClick={() => { baixar(new Blob([svg!], { type: 'image/svg+xml' }), nomeArquivo(t, 'svg')); contarDownload(t.codigo!); }}
                style={botao(true)}
              >
                <Download size={14} /> SVG
              </button>
              <button
                disabled={ocupado}
                onClick={() => acao(async () => { baixar(await pdfAdesivos([modulosDe(t.codigo!)]), nomeArquivo(t, 'pdf')); contarDownload(t.codigo!); })}
                style={botao(false)}
              >
                <Download size={14} /> PDF
              </button>
              <a href={`/garantia/${t.codigo}`} target="_blank" rel="noopener" style={botao(false)} title="Abrir a página como o cliente vê">
                <ExternalLink size={14} /> Abrir
              </a>
            </>
          )}
        </div>
        {erro && <p style={{ margin: '6px 0 0', color: VERMELHO }}>{erro}</p>}
      </div>
    </div>
  );
}

function botao(primario: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
    cursor: 'pointer', textDecoration: 'none',
    border: primario ? 'none' : '1px solid var(--portal-border)',
    background: primario ? 'linear-gradient(135deg, #dc2626, #7f1d1d)' : 'var(--portal-bg-input)',
    color: primario ? '#fefefe' : 'var(--portal-text)',
  };
}
