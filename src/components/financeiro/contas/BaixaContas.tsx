'use client';
// Baixa de contas (Fase 3). Portado de baixa-contas.ejs + public/baixa-contas.js.
// Lista titulos EM ABERTO (a pagar/receber) de UMA empresa por vez e baixa
// (marca como pago/recebido) um titulo de cada vez no Omie.
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { authHeaders, fetchAuth } from '@/lib/auth/client';
import { tempoRelativo } from '@/lib/ajustes/tempo-relativo';
import { RECORTES, RECORTE_PADRAO, ehRecorte, aplicarRecorte, resumir, type Recorte } from '@/lib/ajustes/baixa-contas-recorte';
import { baixaAntecipadaSuspeita } from '@/lib/ajustes/boletos-fornecedor';
import PainelBoletosBaixa from '@/components/ajustes/PainelBoletosBaixa';
import { PaginaFin, CampoFin, Segmentado, BotaoFin, ChipSituacao, Chip, RodapeGrade, JanelaFin, ThOrdena, TEAL } from '@/components/ajustes/omie-fin';

const LS_RECORTE = 'baixa-contas-recorte';
function lerRecorteSalvo(): Recorte {
  try { const v = localStorage.getItem(LS_RECORTE); if (ehRecorte(v)) return v; } catch { /* sem storage */ }
  return RECORTE_PADRAO;
}

// ---------- tipos ----------
type Tipo = 'pagar' | 'receber';
interface Titulo {
  conta: string; codigoLancamento: number | string; valorDocumento: number; valorPago: number;
  valorAberto: number; dataEmissao?: string; vencimento?: string; previsao?: string | null; numeroDoc?: string;
  parcela?: string; status?: string; contraparte?: string; categoria?: string;
  codigoFornecedor?: number | null; observacao?: string | null; idOrigem?: string | null; // COMP = duplicata da NF
}
interface AbertosPayload { titulos?: Titulo[]; total?: number; erro?: string; sincronizadoEm?: string | null }
interface ContaCorrente { codigo: string | number; descricao: string; tipo?: string; banco?: string }
interface ConsultaPayload {
  ok?: boolean; statusTitulo?: string; valorDocumento?: number; baixaBloqueada?: boolean;
  idContaCorrente?: string | number | null; contaCorrenteDescricao?: string | null; erro?: string;
}

// ---------- helpers ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string { return brl.format(Number(n) || 0); }
function fmtData(s?: string | null): string {
  if (!s) return '';
  const m = String(s).slice(0, 10).split('-');
  return m.length === 3 ? `${m[2]}/${m[1]}/${m[0]}` : String(s);
}
function norm(s: unknown): string { return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function decode(s?: string | null): string {
  if (s == null) return '';
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface ColDef { key: string; label: string; type: 'num' | 'date' | 'text'; align?: 'right'; val: (l: Titulo) => number | string; txt: (l: Titulo) => string }
const COLS: ColDef[] = [
  { key: 'vencimento', label: 'Vencimento', type: 'date', val: (l) => l.vencimento || '', txt: (l) => fmtData(l.vencimento) },
  // Previsão de pagamento/recebimento: é a data que o card "Pagar/Receber hoje"
  // da Omie usa. Sem previsão, cai no vencimento (mesma regra do servidor).
  { key: 'previsao', label: 'Previsão', type: 'date', val: (l) => l.previsao || l.vencimento || '', txt: (l) => fmtData(l.previsao || l.vencimento) },
  { key: 'status', label: 'Status', type: 'text', val: (l) => l.status || '', txt: (l) => l.status || '' },
  { key: 'contraparte', label: 'Fornecedor/Cliente', type: 'text', val: (l) => decode(l.contraparte), txt: (l) => decode(l.contraparte) },
  { key: 'numeroDoc', label: 'Documento', type: 'text', val: (l) => l.numeroDoc || '', txt: (l) => l.numeroDoc || '' },
  { key: 'parcela', label: 'Parcela', type: 'text', val: (l) => l.parcela || '', txt: (l) => l.parcela || '' },
  { key: 'categoria', label: 'Categoria', type: 'text', val: (l) => decode(l.categoria), txt: (l) => decode(l.categoria) },
  { key: 'valorAberto', label: 'Valor em aberto', type: 'num', align: 'right', val: (l) => Number(l.valorAberto) || 0, txt: (l) => fmtBRL(l.valorAberto) },
];

export default function BaixaContasPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [tipo, setTipo] = useState<Tipo>('pagar');
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [status, setStatus] = useState('');
  const [carregando, setCarregando] = useState(false);
  // Recorte rápido por previsão (lembrado no navegador). Começa no padrão e
  // lê o storage depois de montar, para o SSR não divergir do cliente.
  const [recorte, setRecorte] = useState<Recorte>(RECORTE_PADRAO);
  useEffect(() => { setRecorte(lerRecorteSalvo()); }, []);
  const escolherRecorte = useCallback((r: Recorte) => {
    setRecorte(r);
    try { localStorage.setItem(LS_RECORTE, r); } catch { /* sem storage */ }
  }, []);
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: number }>({ key: 'previsao', dir: 1 });
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [modalTitulo, setModalTitulo] = useState<Titulo | null>(null);
  const [versaoBoletos, setVersaoBoletos] = useState(0);

  const buscar = useCallback(async () => {
    if (!conta) { setTitulos([]); return; }
    setCarregando(true);
    setStatus('carregando...');
    setTitulos([]);
    try {
      const r = await fetch(`/api/ajustes/contas/abertos?tipo=${tipo}${contaParam}`, { headers: await authHeaders() });
      const d = (await r.json()) as AbertosPayload;
      if (d.erro) { setStatus('Erro: ' + d.erro); return; }
      const ts = (d.titulos || []).map((l) => ({ ...l, contraparte: decode(l.contraparte), categoria: decode(l.categoria) }));
      setTitulos(ts);
      setSincronizadoEm(d.sincronizadoEm || null);
      setFiltros({});
      setStatus('');
    } catch (ex) {
      setStatus('Erro de rede: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [conta, contaParam, tipo]);

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, tipo]);

  // Recorte por previsão primeiro; o resumo (contagem + valor) segue o recorte,
  // para o número da tela conversar com o card "Pagar/Receber hoje" da Omie.
  const hojeRef = hojeISO();
  const titulosNoRecorte = useMemo(() => aplicarRecorte(titulos, recorte, hojeRef), [titulos, recorte, hojeRef]);
  const contagens = useMemo(() => {
    const m = {} as Record<Recorte, { n: number; total: number }>;
    for (const r of RECORTES) m[r.id] = resumir(aplicarRecorte(titulos, r.id, hojeRef));
    return m;
  }, [titulos, hojeRef]);
  const resumo = useMemo(() => {
    if (!titulos.length) return '';
    const { n, total } = resumir(titulosNoRecorte);
    const sufixo = recorte === 'todos' ? '' : ` (de ${titulos.length} em aberto no total)`;
    return `${n} titulo(s) · total ${fmtBRL(total)}${sufixo}`;
  }, [titulos, titulosNoRecorte, recorte]);

  const linhasVisiveis = useMemo(() => {
    let rows = titulosNoRecorte.filter((l) => COLS.every((c) => {
      const f = filtros[c.key]; if (!f) return true;
      return norm(c.txt(l)).indexOf(norm(f)) >= 0;
    }));
    const c = COLS.find((x) => x.key === sort.key);
    if (c) rows = rows.slice().sort((a, b) => {
      const va = c.val(a), vb = c.val(b);
      const r = c.type === 'num' ? (Number(va) - Number(vb)) : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' });
      return r * sort.dir;
    });
    return rows;
  }, [titulosNoRecorte, filtros, sort]);

  const ordenarPor = useCallback((key: string) => {
    setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  }, []);

  if (!permLoading && userProfile && !pode('ajustes', 'baixa-contas')) return <SemPermissao />;

  const COLS_GRADE = COLS.length + 1;
  return (
    <PaginaFin
      titulo="Baixar contas"
      sub={<>Títulos <b>em aberto</b> da empresa — a baixa vai direto na Omie</>}
      direita={<ContaSelector />}
      comoLer={<>
        Marca títulos <b>a pagar</b> e <b>a receber</b> como pagos/recebidos direto na Omie, <b>uma empresa por vez</b> (troque no seletor de conta).
        Clique em <b>Baixar</b> numa linha (ou dois cliques nela) para abrir a janela de baixa. A lista vem do <b>espelho sincronizado</b> da Omie (o selo mostra há quanto tempo);
        a baixa em si vai <b>ao vivo</b> na Omie. A ordem padrão é pela <b>previsão</b>, como o card &quot;Pagar/Receber hoje&quot; da Omie — previsão em âmbar = diferente do vencimento.
        Boletos agrupados de fornecedor (ex.: CAMBUCI) aparecem no painel <b>Boletos de fornecedor</b>: pague a parcela por lá, não as duplicatas soltas.
      </>}
    >
      {conta === '' ? (
        <div className="ofin-aviso"><div>A baixa de contas precisa de uma empresa específica. Selecione <b>NOVA</b> ou <b>CASTRO</b> no seletor de conta acima.</div></div>
      ) : (
        <>
          <div className="ofin-cartao">
            <div className="ofin-filtros">
              <CampoFin titulo="Tipo"><Segmentado<Tipo> valor={tipo} onChange={setTipo} opcoes={[['pagar', 'A pagar'], ['receber', 'A receber']]} /></CampoFin>
              <CampoFin titulo="Previsão">
                <div className="ofin-pilulas">
                  {RECORTES.map((r) => {
                    const c = contagens[r.id];
                    return (
                      <button key={r.id} type="button" onClick={() => escolherRecorte(r.id)} title={r.dica} className={`ofin-pilula${recorte === r.id ? ' ativo' : ''}`}>
                        {r.rotulo}{c && <span className="n">{c.n}</span>}
                      </button>
                    );
                  })}
                </div>
              </CampoFin>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <BotaoFin variante="prim" icone="fa-rotate" onClick={buscar} disabled={carregando}>{carregando ? 'Carregando…' : 'Atualizar'}</BotaoFin>
              </div>
            </div>
            <div className="ofin-filtros-pe">
              <span>Empresa <b style={{ color: 'var(--portal-text, #1f2d3d)' }}>{conta.toUpperCase()}</b></span>
              {status && <span className={`ofin-msg${status.startsWith('Erro') ? ' erro' : ''}`}>{status}</span>}
              {resumo && <span className="ofin-resumo">· {resumo}</span>}
              {!carregando && <SeloSincronizacao iso={sincronizadoEm} />}
            </div>
          </div>

          {tipo === 'pagar' && <PainelBoletosBaixa conta={conta.toUpperCase()} versao={versaoBoletos} onPago={buscar} />}

          <div className="ofin-cartao">
            <div className="ofin-grade-caixa" style={{ maxHeight: '70vh' }}>
              <table className="ofin-grade fixo">
                <thead>
                  <tr>
                    {COLS.map((c) => <ThOrdena key={c.key} rotulo={c.label} ativo={sort.key === c.key} dir={sort.dir} num={c.align === 'right'} onClick={() => ordenarPor(c.key)} />)}
                    <th />
                  </tr>
                  <tr>
                    {COLS.map((c) => (
                      <th key={c.key} className="filtro">
                        <input className="ofin-filtro-col" value={filtros[c.key] || ''} onChange={(e) => setFiltros((s) => ({ ...s, [c.key]: e.target.value }))} placeholder="filtrar" />
                      </th>
                    ))}
                    <th className="filtro" />
                  </tr>
                </thead>
                <tbody>
                  {linhasVisiveis.length === 0 ? (
                    <tr><td colSpan={COLS_GRADE} className="vazio">{carregando ? 'Carregando…' : titulos.length && recorte !== 'todos' ? 'Nenhum título neste recorte de previsão — veja "Todos".' : 'Nenhum título em aberto para esta empresa/tipo.'}</td></tr>
                  ) : linhasVisiveis.map((l) => {
                    const parcial = (Number(l.valorPago) || 0) > 0;
                    const prevDif = !!l.previsao && l.previsao !== l.vencimento;
                    return (
                      <tr key={String(l.codigoLancamento)} onDoubleClick={() => setModalTitulo(l)} title="Dois cliques: baixar este título">
                        <td className="apagado nowrap">{fmtData(l.vencimento) || '-'}</td>
                        <td className="nowrap" style={{ color: prevDif ? '#b45309' : '#6b7a89', fontWeight: prevDif ? 600 : 400, fontSize: 12 }} title={prevDif ? 'previsão diferente do vencimento' : undefined}>{fmtData(l.previsao || l.vencimento) || '-'}</td>
                        <td><ChipSituacao s={l.status} /></td>
                        <td>{l.contraparte || '-'}</td>
                        <td className="apagado nowrap">{l.numeroDoc || '-'}</td>
                        <td className="apagado nowrap">{l.parcela || '-'}</td>
                        <td className="apagado">{l.categoria || '-'}</td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {fmtBRL(l.valorAberto)}
                          {parcial && <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>doc {fmtBRL(l.valorDocumento)}</div>}
                        </td>
                        <td className="num"><BotaoFin mini variante="prim" icone="fa-check" onClick={() => setModalTitulo(l)}>Baixar</BotaoFin></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <RodapeGrade mostrando={linhasVisiveis.length} total={titulosNoRecorte.length} dica={<><i className="fas fa-hand-pointer" /> dois cliques numa linha abre a baixa</>} />
          </div>
        </>
      )}

      {modalTitulo && (
        <ModalBaixa titulo={modalTitulo} tipo={tipo} conta={conta}
          onClose={() => setModalTitulo(null)} onBaixado={() => { setModalTitulo(null); buscar(); setVersaoBoletos((v) => v + 1); }} />
      )}
    </PaginaFin>
  );
}

// ---------- selo "espelho atualizado há X" ----------
function SeloSincronizacao({ iso }: { iso: string | null }) {
  const t = tempoRelativo(iso);
  const cor = ({ ok: 'verde', atencao: 'ambar', critico: 'vermelho', desconhecido: 'cinza' } as const)[t.nivel];
  const quando = iso ? new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '';
  return <Chip cor={cor} title={quando ? `último sync concluído em ${quando}` : 'nenhum sync registrado para esta empresa/tipo'}>espelho atualizado {t.texto}</Chip>;
}

// ---------- modal de baixa ----------
function ModalBaixa({ titulo, tipo, conta, onClose, onBaixado }: {
  titulo: Titulo; tipo: Tipo; conta: string; onClose: () => void; onBaixado: () => void;
}) {
  const [consulta, setConsulta] = useState<ConsultaPayload | null>(null);
  const [erroConsulta, setErroConsulta] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [ccs, setCcs] = useState<ContaCorrente[]>([]);
  const [mostrarDropdownCC, setMostrarDropdownCC] = useState(false);
  const [ccSel, setCcSel] = useState<string>('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hojeISO());
  const [juros, setJuros] = useState('0');
  const [multa, setMulta] = useState('0');
  const [desconto, setDesconto] = useState('0');
  const [obs, setObs] = useState('');
  const [conciliar, setConciliar] = useState(false);
  const [modalStatus, setModalStatus] = useState('');
  const [aplicando, setAplicando] = useState(false);

  // consulta o titulo no Omie ao abrir (pre-preenche valor + conta corrente)
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/ajustes/contas/consultar?tipo=${tipo}&conta=${encodeURIComponent(conta)}&codigoLancamento=${encodeURIComponent(titulo.codigoLancamento)}`, { headers: await authHeaders() });
        const d = (await r.json()) as ConsultaPayload;
        if (!vivo) return;
        if (d.erro) { setErroConsulta('Erro ao consultar: ' + d.erro); setCarregando(false); return; }
        setConsulta(d);
        setValor((Number(titulo.valorAberto) || Number(d.valorDocumento) || 0).toFixed(2));
        const cc = d.idContaCorrente != null ? String(d.idContaCorrente) : '';
        setCcSel(cc);
        if (!cc) setMostrarDropdownCC(true);
        setCarregando(false);
      } catch (ex) {
        if (vivo) { setErroConsulta('Rede: ' + (ex as Error).message); setCarregando(false); }
      }
    })();
    return () => { vivo = false; };
  }, [tipo, conta, titulo]);

  // carrega contas correntes quando o dropdown e' aberto
  useEffect(() => {
    if (!mostrarDropdownCC || ccs.length) return;
    let vivo = true;
    fetchAuth('/api/ajustes/contas-correntes?conta=' + encodeURIComponent(conta))
      .then((r) => r.json())
      .then((d) => { if (vivo) setCcs(d.contasCorrentes || []); })
      .catch(() => { if (vivo) setCcs([]); });
    return () => { vivo = false; };
  }, [mostrarDropdownCC, conta, ccs.length]);

  const ccAtualDesc = consulta?.contaCorrenteDescricao || '(nao definida no titulo)';
  const ccAtualFalta = ccSel && !ccs.some((c) => String(c.codigo) === String(ccSel));
  const bloqueada = !!consulta?.baixaBloqueada;
  const verbo = tipo === 'receber' ? 'Recebido em' : 'Pago em';
  // duplicata de NF baixada bem antes do vencimento: era assim que o "boleto agrupado" virava baixa fictícia
  const antecipada = tipo === 'pagar' && baixaAntecipadaSuspeita(data, titulo.vencimento, titulo.idOrigem || null);

  const aplicar = useCallback(async () => {
    if (!ccSel) { setModalStatus('escolha a conta corrente'); return; }
    const v = Number(valor);
    if (!(v > 0)) { setModalStatus('informe um valor maior que zero'); return; }
    if (!data) { setModalStatus('informe a data'); return; }
    if (antecipada && obs.trim().length < 5) { setModalStatus('baixa antecipada de duplicata de NF: informe o motivo na observacao'); return; }
    if (!confirm(`Baixar no Omie o titulo ${titulo.codigoLancamento} (${titulo.contraparte || ''}) de ${fmtBRL(v)}?`)) return;
    setAplicando(true);
    setModalStatus('baixando no Omie...');
    try {
      const r = await fetch('/api/ajustes/contas/baixar', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          conta, tipo, codigoLancamento: titulo.codigoLancamento, codigoContaCorrente: ccSel,
          valor: v, data, juros: Number(juros) || 0, multa: Number(multa) || 0, desconto: Number(desconto) || 0,
          observacao: obs, conciliar, vencimento: titulo.vencimento || null, idOrigem: titulo.idOrigem || null,
        }),
      });
      const d = await r.json();
      if (!d.ok) { setModalStatus(d.erro || 'falha'); setAplicando(false); return; }
      setModalStatus('baixado ✓');
      setTimeout(onBaixado, 600);
    } catch (ex) {
      setModalStatus('rede: ' + (ex as Error).message); setAplicando(false);
    }
  }, [ccSel, valor, data, juros, multa, desconto, obs, conciliar, conta, tipo, titulo, onBaixado, antecipada]);

  const desabBaixa = aplicando || carregando || bloqueada || !!erroConsulta;
  return (
    <JanelaFin titulo="Lançar pagamento / recebimento" largura={640} onFechar={onClose} travado={aplicando}
      sub={<>{titulo.conta} · {titulo.contraparte || ''} · lanç. <span style={{ fontFamily: 'monospace' }}>{titulo.codigoLancamento}</span></>}
      pe={<>
        <span className={`ofin-msg${modalStatus.includes('✓') ? ' ok' : modalStatus ? ' erro' : ''}`}>{modalStatus}</span>
        <BotaoFin variante="neutro" onClick={onClose} disabled={aplicando}>Cancelar</BotaoFin>
        <BotaoFin variante="prim" icone="fa-check" onClick={aplicar} disabled={desabBaixa}>Baixar na Omie</BotaoFin>
      </>}>
      {carregando ? <div className="ofin-msg">consultando o título na Omie…</div>
        : erroConsulta ? <div className="ofin-aviso erro"><div>{erroConsulta}</div></div>
        : bloqueada ? (
          <div className="ofin-aviso"><div>Este título está com a <b>baixa bloqueada</b> na Omie. Desbloqueie na Omie antes de marcar como pago.</div></div>
        ) : (
          <>
            {antecipada && (
              <div className="ofin-aviso">
                <div>Esta duplicata de NF vence em <b>{fmtData(titulo.vencimento)}</b> e você está baixando em <b>{fmtData(data)}</b>. Se o fornecedor mandou um <b>boleto agrupando várias NFs</b>, não baixe: registre o boleto em <b>Correção de contas → Lista</b> (ele reprograma as duplicatas) e pague a parcela aqui no painel <b>Boletos de fornecedor</b>. Se a baixa antecipada é real (desconto, pagamento adiantado), informe o motivo na observação.</div>
              </div>
            )}
            <div className="ofin-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <CampoFin titulo="Documento"><div className="ofin-leitura">{titulo.numeroDoc || '—'}</div></CampoFin>
              <CampoFin titulo="Vencimento"><div className="ofin-leitura">{fmtData(titulo.vencimento) || '—'}</div></CampoFin>
              <CampoFin titulo="Previsão"><div className="ofin-leitura" style={{ color: titulo.previsao && titulo.previsao !== titulo.vencimento ? '#b45309' : undefined }}>{fmtData(titulo.previsao || titulo.vencimento) || '—'}</div></CampoFin>
              <CampoFin titulo="Valor em aberto"><div className="ofin-leitura" style={{ justifyContent: 'flex-end', fontWeight: 600 }}>{fmtBRL(titulo.valorAberto)}</div></CampoFin>
            </div>

            <CampoFin titulo={<>Conta corrente {!mostrarDropdownCC && <button type="button" className="ofin-link" style={{ marginLeft: 6, fontSize: 11.5 }} onClick={() => setMostrarDropdownCC(true)}>alterar</button>}</>}>
              {mostrarDropdownCC ? (
                <select className="ofin-inp" value={ccSel} onChange={(e) => setCcSel(e.target.value)}>
                  <option value="">(escolha a conta corrente)</option>
                  {ccAtualFalta && <option value={ccSel}>{consulta?.contaCorrenteDescricao || ccSel} [atual]</option>}
                  {ccs.map((c) => <option key={String(c.codigo)} value={String(c.codigo)}>{c.descricao}{c.tipo ? ` (${c.tipo})` : ''}</option>)}
                </select>
              ) : <div className="ofin-leitura">{ccAtualDesc}</div>}
            </CampoFin>

            <div className="ofin-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <CampoFin titulo={verbo}><input className="ofin-inp" type="date" value={data} onChange={(e) => setData(e.target.value)} /></CampoFin>
              <CampoFin titulo="Valor"><input className="ofin-inp num" type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} /></CampoFin>
            </div>

            <details>
              <summary style={{ fontSize: 12.5, color: TEAL, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>Juros / multa / desconto (opcional)</summary>
              <div className="ofin-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 10 }}>
                <CampoFin titulo="Juros"><input className="ofin-inp num" type="number" step="0.01" min="0" value={juros} onChange={(e) => setJuros(e.target.value)} /></CampoFin>
                <CampoFin titulo="Multa"><input className="ofin-inp num" type="number" step="0.01" min="0" value={multa} onChange={(e) => setMulta(e.target.value)} /></CampoFin>
                <CampoFin titulo="Desconto"><input className="ofin-inp num" type="number" step="0.01" min="0" value={desconto} onChange={(e) => setDesconto(e.target.value)} /></CampoFin>
              </div>
            </details>

            <CampoFin titulo={antecipada ? 'Observação (obrigatória: motivo da baixa antecipada)' : 'Observação (opcional)'}><input className="ofin-inp" type="text" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex.: baixa via portal" /></CampoFin>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={conciliar} onChange={(e) => setConciliar(e.target.checked)} /> Conciliar o documento automaticamente</label>
          </>
        )}
    </JanelaFin>
  );
}
