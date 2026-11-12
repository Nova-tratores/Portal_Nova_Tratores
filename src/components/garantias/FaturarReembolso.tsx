'use client';
import { useEffect, useRef, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { AlertTriangle, CheckCircle2, ExternalLink, FileSpreadsheet, Loader2, Receipt, Upload, XCircle } from 'lucide-react';
import { fmtMoeda } from '@/lib/garantias/format';
import { montarOsReembolso } from '@/lib/garantias/drvg';
import type { PreviaDrvg, LinhaPrevia, ResultadoSg, AcaoSg } from '@/lib/garantias/drvg-server';

// Faturar o reembolso da montadora pela DRVG: anexa a planilha, confere SG a SG,
// aprova/recusa as garantias e cria a OS no POS (cliente = montadora). O envio à
// Omie e a NFS-e saem pelo próprio POS ("Enviar Omie" → "Faturar").

interface Montadora { id: string; nome: string; ativo: boolean }

const ACAO: Record<AcaoSg, { texto: string; cor: string }> = {
  aprovar: { texto: 'Vai aprovar', cor: '#16a34a' },
  recusar: { texto: 'Vai recusar', cor: '#dc2626' },
  ja_aprovada: { texto: 'Já aprovada', cor: '#0369a1' },
  ja_recusada: { texto: 'Já recusada', cor: '#64748b' },
  nao_encontrada: { texto: 'SG não está no portal', cor: '#b45309' },
  fora_da_fabrica: { texto: 'Não está na fábrica', cor: '#b45309' },
};

const n2 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export default function FaturarReembolso({ onAbrirGarantia }: { onAbrirGarantia: (id: string) => void }) {
  const [montadoras, setMontadoras] = useState<Montadora[]>([]);
  const [montadoraId, setMontadoraId] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<PreviaDrvg | null>(null);
  const [pedido, setPedido] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState<{ resultados: ResultadoSg[]; os: string | null; osErro: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAuth('/api/garantias/montadoras').then((r) => r.json()).then((j) => {
      const ms: Montadora[] = (j.montadoras || []).filter((m: Montadora) => m.ativo);
      setMontadoras(ms);
      setMontadoraId((ms.find((m) => /mahindra/i.test(m.nome)) || ms[0])?.id || '');
    }).catch(() => {});
  }, []);

  const ler = async (f: File, mont = montadoraId) => {
    setArquivo(f); setPrevia(null); setFeito(null); setErro('');
    if (!mont) { setErro('Escolha a montadora.'); return; }
    setCarregando(true);
    try {
      const fd = new FormData();
      fd.append('file', f); fd.append('montadora', mont); fd.append('acao', 'previa');
      const r = await fetchAuth('/api/garantias/reembolso/drvg', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || 'Não consegui ler a DRVG.'); return; }
      setPrevia(j.previa);
      setPedido(j.previa.drvg.pedidoCompra || '');
    } catch { setErro('Sem conexão com o portal.'); } finally { setCarregando(false); }
  };

  const linhas = previa?.linhas || [];
  const aFinalizar = linhas.filter((l) => l.acao === 'aprovar' || l.acao === 'recusar');
  const naOs = linhas.filter((l) => l.naOs);
  const diferenca = previa ? Math.round((previa.os.total - previa.drvg.totais.total) * 100) / 100 : 0;

  const aplicar = async () => {
    if (!previa || !arquivo) return;
    const partes = [
      aFinalizar.length ? `• ${aFinalizar.filter((l) => l.acao === 'aprovar').length} garantia(s) aprovada(s) e ${aFinalizar.filter((l) => l.acao === 'recusar').length} recusada(s) pela DRVG ${previa.drvg.numero}` : '',
      naOs.length ? `• criar a OS de reembolso no POS: ${fmtMoeda(previa.os.total)} contra a ${previa.montadora.nome}` : '',
      Math.abs(diferenca) > 0.05 ? `\n⚠ A OS fica ${fmtMoeda(Math.abs(diferenca))} ${diferenca > 0 ? 'acima' : 'abaixo'} do total da DRVG (${fmtMoeda(previa.drvg.totais.total)}).` : '',
    ].filter(Boolean);
    if (!confirm(`Confirma?\n\n${partes.join('\n')}\n\nNada vai para a Omie agora: depois é só abrir a OS no POS, "Enviar Omie" e "Faturar".`)) return;
    setAplicando(true); setErro('');
    try {
      const fd = new FormData();
      fd.append('file', arquivo); fd.append('montadora', montadoraId); fd.append('acao', 'aplicar');
      fd.append('pedidoCompra', pedido); fd.append('criarOs', naOs.length ? 'sim' : 'nao');
      const r = await fetchAuth('/api/garantias/reembolso/drvg', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || 'Não consegui aplicar a DRVG.'); return; }
      setFeito({ resultados: j.resultados || [], os: j.os, osErro: j.osErro });
      setPrevia(j.previa);
    } catch { setErro('Sem conexão com o portal.'); } finally { setAplicando(false); }
  };

  const botao = (cor: string, off = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, padding: '8px 16px', borderRadius: 8,
    border: 'none', background: off ? '#94a3b8' : cor, color: '#fefefe', fontWeight: 700, fontSize: 14, cursor: off ? 'not-allowed' : 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, color: 'var(--portal-text)' }}>
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}><Receipt size={17} color="#dc2626" /> Faturar o reembolso da montadora</div>
        <p style={ajuda}>
          Anexe a <b>DRVG</b> (a planilha que a fábrica manda). O portal confere cada SG, aprova ou recusa as garantias com o que a
          fábrica pagou e cria a <b>OS de reembolso no POS</b>, com o texto do pedido de compra/DRVG/SGs, as horas, os km e as peças.
          Depois é só abrir a OS no POS, <b>Enviar Omie</b> e <b>Faturar</b>.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={montadoraId} onChange={(e) => { setMontadoraId(e.target.value); if (arquivo) ler(arquivo, e.target.value); }} style={inp}>
            {montadoras.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) ler(f); e.target.value = ''; }} />
          <button onClick={() => inputRef.current?.click()} disabled={carregando || aplicando} style={botao('#dc2626', carregando || aplicando)}>
            {carregando ? <Loader2 size={16} className="spin" /> : <Upload size={16} />} {arquivo ? 'Trocar a DRVG' : 'Anexar a DRVG (.xlsx)'}
          </button>
          {arquivo && <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--portal-text-muted)', minWidth: 0, wordBreak: 'break-all' }}><FileSpreadsheet size={15} /> {arquivo.name}</span>}
        </div>
        {erro && <div style={{ ...aviso, borderColor: '#dc2626', color: '#dc2626' }}>{erro}</div>}
      </div>

      {feito && (
        <div style={{ ...card, borderColor: feito.os ? '#16a34a' : 'var(--portal-border)' }}>
          <div style={{ fontWeight: 800 }}>Feito</div>
          {feito.resultados.map((r) => (
            <div key={r.sg} style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              {r.ok ? <CheckCircle2 size={15} color="#16a34a" /> : <XCircle size={15} color="#dc2626" />}
              <span><b>SG {r.sg}</b> {r.garantia ? `(${r.garantia})` : ''} — {r.mensagem}</span>
            </div>
          ))}
          {feito.os && (
            <a href={`/pos?id=${encodeURIComponent(feito.os)}`} style={{ ...botao('#0369a1'), textDecoration: 'none', alignSelf: 'flex-start' }}>
              <ExternalLink size={16} /> Abrir a {feito.os} no POS
            </a>
          )}
          {feito.os && <p style={ajuda}>No POS: confira a OS, clique em <b>Enviar Omie</b> e depois em <b>Faturar (NFS-e)</b>. Quando a NFS-e sair, ela se liga sozinha às garantias pelas SGs do texto.</p>}
          {feito.osErro && <div style={{ ...aviso, borderColor: '#dc2626', color: '#dc2626' }}>OS não criada: {feito.osErro}</div>}
        </div>
      )}

      {previa && (
        <>
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <Info rotulo="DRVG" valor={previa.drvg.numero || '—'} />
              <Info rotulo="Taxa" valor={`${fmtMoeda(previa.montadora.taxaHora)}/h · ${fmtMoeda(previa.montadora.taxaKm)}/km`} />
              <Info rotulo="A fábrica manda faturar" valor={fmtMoeda(previa.drvg.totais.total)} />
              <Info rotulo="A OS fica em" valor={fmtMoeda(previa.os.total)} cor={Math.abs(diferenca) > 0.05 ? '#dc2626' : '#16a34a'} />
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, maxWidth: 320 }}>
              Pedido de compra da montadora (vai no texto da nota)
              <input value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Ex.: 3400885894" style={{ ...inp, fontWeight: 400 }} />
            </label>
            {previa.avisos.map((a) => (
              <div key={a} style={aviso}><AlertTriangle size={15} style={{ flexShrink: 0 }} /> {a}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))', gap: 10 }}>
            {linhas.map((l) => <CartaoSg key={l.sg} l={l} onAbrir={onAbrirGarantia} />)}
          </div>

          <div style={card}>
            <div style={{ fontWeight: 800 }}>OS de reembolso que será criada no POS</div>
            {naOs.length === 0 ? <p style={ajuda}>Nenhuma SG aprovada e ainda sem nota para faturar.</p> : (
              <>
                <div style={{ fontSize: 13, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 8, padding: '8px 10px', wordBreak: 'break-word' }}>
                  {montarOsReembolso(naOs.map((l) => ({ ...l, negativa: false })), { drvg: previa.drvg.numero, pedidoCompra: pedido.trim(), taxaHora: previa.montadora.taxaHora, taxaKm: previa.montadora.taxaKm }).texto}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 320 }}>
                    <tbody>
                      <Linha rotulo="Cliente" valor={previa.cliente ? `${previa.cliente.nome} · ${previa.cliente.doc}` : 'não achado'} />
                      <Linha rotulo="Hora Trabalhada" valor={`${n2(previa.os.horas)} h × ${fmtMoeda(previa.montadora.taxaHora)} = ${fmtMoeda(previa.os.valorHoras)}`} />
                      <Linha rotulo="Deslocamento por KM" valor={`${n2(previa.os.km)} km × ${fmtMoeda(previa.montadora.taxaKm)} = ${fmtMoeda(previa.os.valorKm)}`} />
                      {previa.os.pecas > 0 && <Linha rotulo="Peças" valor={fmtMoeda(previa.os.pecas)} />}
                      <Linha rotulo="Total" valor={fmtMoeda(previa.os.total)} forte />
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <button onClick={aplicar} disabled={aplicando || (!aFinalizar.length && !naOs.length) || !!feito}
              style={{ ...botao('#16a34a', aplicando || (!aFinalizar.length && !naOs.length) || !!feito), alignSelf: 'flex-start' }}>
              {aplicando ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
              {aFinalizar.length ? `Finalizar ${aFinalizar.length} garantia(s)` : 'Criar'}{naOs.length ? (aFinalizar.length ? ' e criar a OS no POS' : ' a OS no POS') : ''}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CartaoSg({ l, onAbrir }: { l: LinhaPrevia; onAbrir: (id: string) => void }) {
  const a = ACAO[l.acao];
  const g = l.garantia;
  const menos = (pago: number, pedido: number) => pedido > 0 && pago < pedido - 0.001;
  return (
    <div style={{ ...card, gap: 6, borderLeft: `4px solid ${a.cor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>SG {l.sg}</div>
          <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', wordBreak: 'break-word' }}>{l.modelo} · {l.cliente}{l.chassi ? ` · ${l.chassi.slice(-7)}` : ''}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: a.cor, border: `1px solid ${a.cor}`, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
          {l.acao === 'fora_da_fabrica' && g ? `Status: ${g.status}` : a.texto}
        </span>
      </div>
      {g && (
        <button onClick={() => onAbrir(g.id)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: '#2563eb', fontWeight: 700, fontSize: 13, cursor: 'pointer', minHeight: 32 }}>
          {g.numero} · OS {g.os} →
        </button>
      )}
      <div style={{ fontSize: 13 }}>
        Pagou <b style={{ color: menos(l.horas, g?.horasPedidas || 0) ? '#dc2626' : undefined }}>{l.horasTexto} h</b>{g ? ` (pedimos ${n2(g.horasPedidas)})` : ''}
        {' · '}<b style={{ color: menos(l.km, g?.kmPedidos || 0) ? '#dc2626' : undefined }}>{n2(l.km)} km</b>{g ? ` (pedimos ${n2(g.kmPedidos)})` : ''}
        {l.pecas > 0 && <> · peças <b>{fmtMoeda(l.pecas)}</b></>}
      </div>
      {l.obs && <div style={{ fontSize: 12, color: l.negativa ? '#dc2626' : 'var(--portal-text-muted)', wordBreak: 'break-word' }}>{l.obs}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {l.naOs && <Selo cor="#16a34a">entra na OS</Selo>}
        {l.nfse && <Selo cor="#0369a1">já tem NFS-e {l.nfse}</Selo>}
        {l.osReembolso && <Selo cor="#0369a1">já na {l.osReembolso}</Selo>}
      </div>
    </div>
  );
}

function Selo({ cor, children }: { cor: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color: cor, background: 'var(--portal-bg-secondary)', border: `1px solid ${cor}`, borderRadius: 6, padding: '1px 7px' }}>{children}</span>;
}
function Info({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{rotulo}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: cor }}>{valor}</div>
    </div>
  );
}
function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <tr style={{ borderTop: '1px solid var(--portal-border)' }}>
      <td style={{ padding: '6px 4px', color: 'var(--portal-text-muted)', whiteSpace: 'nowrap' }}>{rotulo}</td>
      <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: forte ? 800 : 600 }}>{valor}</td>
    </tr>
  );
}

const card: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--portal-border)', borderRadius: 10, padding: 14, background: 'var(--portal-surface, var(--portal-bg-secondary))', minWidth: 0 };
const ajuda: React.CSSProperties = { fontSize: 13, color: 'var(--portal-text-muted)', margin: 0, lineHeight: 1.5 };
const aviso: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 13, border: '1px solid #f59e0b', color: '#b45309', borderRadius: 8, padding: '8px 10px' };
const inp: React.CSSProperties = { minHeight: 42, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 14 };
