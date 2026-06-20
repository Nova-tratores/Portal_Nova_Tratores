'use client';
// Arquivo Mahindra (Estoque e Venda de Pecas). Portado de mahindra.ejs.
// Padrao worker-ready: POST /gerar dispara o job, POLLING de GET /status ate concluir.
// O template e' de upload OBRIGATORIO (o app original tinha um template padrao no
// servidor; aqui nao copiamos esse asset, entao o usuario sempre faz upload).
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos ----------
interface Resumo {
  mes?: string;
  dataFimBR?: string;
  totalPecas?: number;
  encontradas?: number;
  somaEstoque?: number;
  somaVendida?: number;
  etapasVenda?: string[];
  pedidosConsiderados?: number;
  pedidosCancelados?: number;
  pedidosForaEtapa?: number;
  naoEncontrados?: string[];
  negativos?: Array<{ codigo: string; saldo: number }>;
  vendaSemEstoque?: Array<{ codigo: string; vendida: number }>;
}
interface StatusPayload {
  rodando?: boolean;
  pronto?: boolean;
  erro?: string;
  etapa?: string;
  semDados?: boolean;
  arquivoId?: number | null;
  filename?: string | null;
  resumo?: Resumo | null;
}
interface ArquivoMeta {
  id: number;
  mes: string;
  filename: string;
  tamanho_bytes: number;
  resumo: Resumo | null;
  criado_em: string;
}
interface TemplatePreview {
  sheetName: string;
  headers: string[];
}

// ---------- helpers ----------
function fmtNum(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString('pt-BR');
}
function fmtTamanho(bytes: number | null | undefined): string {
  const b = Number(bytes || 0);
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}
function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleString('pt-BR');
}
function listaCodigos(arr: string[] | undefined, max = 30): string {
  if (!arr || !arr.length) return '';
  let show = arr.slice(0, max).join(', ');
  if (arr.length > max) show += ` … (+${arr.length - max})`;
  return show;
}
function mesPadrao(): string {
  // normalmente o mes anterior ao envio
  const d = new Date(Date.now() - 15 * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 7);
}
function arrayBufferToBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

export default function MahindraPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const criadoPor = userProfile?.nome || 'portal';

  const [mes, setMes] = useState(mesPadrao());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [previewErro, setPreviewErro] = useState('');
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusMsg, setStatusMsg] = useState('Preencha os parametros e clique em Gerar arquivo.');
  const [iniciando, setIniciando] = useState(false);
  const [arquivos, setArquivos] = useState<ArquivoMeta[]>([]);
  const [arquivosErro, setArquivosErro] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pararPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const carregarArquivos = useCallback(async () => {
    if (!conta) { setArquivos([]); return; }
    try {
      const r = await fetch(`/api/ajustes/mahindra/arquivos?${contaParam.replace(/^&/, '')}`);
      const d = await r.json();
      setArquivos(d.arquivos || []);
      setArquivosErro(d.erro || '');
    } catch (e) {
      setArquivosErro('Erro ao carregar historico: ' + (e as Error).message);
    }
  }, [conta, contaParam]);

  const poll = useCallback(async () => {
    if (!conta) return;
    try {
      const r = await fetch(`/api/ajustes/mahindra/status?${contaParam.replace(/^&/, '')}`);
      const d = (await r.json()) as StatusPayload;
      setStatus(d);
      if (d.rodando) {
        setStatusMsg(d.etapa || 'processando...');
        return;
      }
      pararPoll();
      setIniciando(false);
      if (d.erro) { setStatusMsg('Erro: ' + d.erro); return; }
      if (d.pronto) {
        setStatusMsg(d.etapa || 'concluido');
        carregarArquivos();
      } else if (!d.semDados) {
        setStatusMsg(d.etapa || '');
      }
    } catch (e) {
      pararPoll();
      setIniciando(false);
      setStatusMsg('Erro ao consultar status: ' + (e as Error).message);
    }
  }, [conta, contaParam, pararPoll, carregarArquivos]);

  // ao montar / trocar conta: carrega historico e reconecta se houver job
  useEffect(() => {
    if (!conta) { setArquivos([]); setStatus(null); pararPoll(); return; }
    carregarArquivos();
    (async () => {
      const r = await fetch(`/api/ajustes/mahindra/status?${contaParam.replace(/^&/, '')}`).catch(() => null);
      if (!r) return;
      const d = (await r.json()) as StatusPayload;
      setStatus(d);
      if (d.rodando) {
        setStatusMsg(d.etapa || 'processando...');
        pararPoll();
        pollRef.current = setInterval(poll, 2000);
      }
    })();
    return () => pararPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta]);

  const previsualizar = useCallback(async () => {
    setPreviewErro('');
    setPreview(null);
    if (!file) { setPreviewErro('Selecione um arquivo .xlsx primeiro.'); return; }
    try {
      const ab = await file.arrayBuffer();
      const r = await fetch('/api/ajustes/mahindra/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: ab,
      });
      const d = await r.json();
      if (!d.ok) { setPreviewErro(d.erro || 'nao foi possivel ler o arquivo'); return; }
      setPreview({ sheetName: d.sheetName, headers: d.headers });
    } catch (e) {
      setPreviewErro('Erro de rede: ' + (e as Error).message);
    }
  }, [file]);

  const gerar = useCallback(async () => {
    if (!conta) { setStatusMsg('Selecione uma conta especifica (NOVA ou CASTRO) no menu acima.'); return; }
    if (!mes) { setStatusMsg('Informe o mes de referencia.'); return; }
    if (!file) { setStatusMsg('Selecione o template .xlsx da Mahindra (upload obrigatorio).'); return; }

    setIniciando(true);
    setStatus(null);
    setStatusMsg('Enviando template e iniciando geracao...');
    try {
      const ab = await file.arrayBuffer();
      const templateBase64 = arrayBufferToBase64(ab);
      const r = await fetch(`/api/ajustes/mahindra/gerar?${contaParam.replace(/^&/, '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateBase64, mes, criadoPor }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setIniciando(false);
        setStatusMsg('Erro: ' + (d.erro || 'falha ao iniciar'));
        return;
      }
      setStatusMsg('Geracao iniciada...');
      pararPoll();
      pollRef.current = setInterval(poll, 2000);
      poll();
    } catch (e) {
      setIniciando(false);
      setStatusMsg('Erro de rede: ' + (e as Error).message);
    }
  }, [conta, contaParam, mes, file, criadoPor, poll, pararPoll]);

  if (!permLoading && userProfile && !temAcesso('ajustes')) return <SemPermissao />;

  const resumo = status?.resumo || null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Arquivo Mahindra – Estoque e Venda</h1>
          <p className="mt-1 text-sm text-slate-600">
            Conta <b>{conta || '—'}</b>. Suba o template oficial da Mahindra (xlsx com a lista de pecas),
            escolha o mes de referencia e gere.
          </p>
        </div>
        <div className="ml-auto"><ContaSelector /></div>
      </div>

      {!conta ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Esta pagina exige uma conta especifica do Omie. Selecione <b>NOVA</b> ou <b>CASTRO</b> no menu acima.
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-600">
              O app le os codigos do template, busca no Omie a <b>posicao de estoque</b> no fim do mes e a
              <b> quantidade vendida</b> (pedidos de venda faturados/concluidos) no mes, e devolve o arquivo
              preenchido + um resumo de conferencia.
            </p>
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
              Observacao: ao preencher o template, estilos/imagens (ex.: logo) podem se perder — os <b>valores e a
              estrutura</b> da planilha sao mantidos. Confira o resumo antes de enviar a Mahindra.
            </p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">1. Parametros</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Mes de referencia</span>
                <input
                  type="month"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                  className="mt-2 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <span className="mt-1 block text-xs text-slate-500">Normalmente o mes anterior ao envio.</span>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Template da Mahindra (.xlsx) — obrigatorio</span>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setPreviewErro(''); }}
                  className="mt-2 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  O xlsx modelo com a lista de pecas. Nao ha template padrao no servidor — o upload e obrigatorio.
                </span>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={gerar}
                disabled={iniciando || status?.rodando}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Gerar arquivo
              </button>
              <button
                onClick={previsualizar}
                type="button"
                className="rounded bg-slate-100 px-4 py-2 text-slate-700 hover:bg-slate-200"
              >
                Pre-visualizar colunas do template
              </button>
            </div>
            {previewErro && <div className="mt-4 text-sm text-red-600">{previewErro}</div>}
            {preview && (
              <div className="mt-4 text-sm">
                <div className="mb-2 text-slate-900">Planilha <strong>{preview.sheetName}</strong> detectada.</div>
                <div className="flex flex-wrap gap-2">
                  {preview.headers.map((h, i) => (
                    <span key={i} className="inline-flex items-center rounded bg-slate-100 px-2 py-1 text-slate-700">
                      {h || '(vazio)'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">2. Status</h2>
            <div className="text-sm text-slate-700">
              {status?.rodando ? (
                <span className="inline-flex items-center gap-2"><span className="animate-pulse">●</span> {statusMsg}</span>
              ) : status?.erro ? (
                <span className="text-red-600">{statusMsg}</span>
              ) : status?.pronto ? (
                <span className="text-green-700">{statusMsg}</span>
              ) : (
                <span>{statusMsg}</span>
              )}
            </div>

            {resumo && resumo.totalPecas != null && (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Card label="Pecas no template" valor={fmtNum(resumo.totalPecas)} cor="slate" />
                  <Card label="Preenchidas" valor={fmtNum(resumo.encontradas)} cor={resumo.encontradas === resumo.totalPecas ? 'green' : 'amber'} />
                  <Card label="Soma estoque" valor={fmtNum(resumo.somaEstoque)} cor="slate" />
                  <Card label="Soma vendida" valor={fmtNum(resumo.somaVendida)} cor="slate" />
                </div>
                <div className="text-xs text-slate-500">
                  Mes {resumo.mes} • posicao em {resumo.dataFimBR} • {fmtNum(resumo.pedidosConsiderados)} pedidos de venda
                  etapa {(resumo.etapasVenda || ['60', '70']).join('/')} ({fmtNum(resumo.pedidosCancelados)} cancelados,
                  {' '}{fmtNum(resumo.pedidosForaEtapa)} fora da etapa ignorados).
                </div>
                {resumo.naoEncontrados && resumo.naoEncontrados.length > 0 && (
                  <Aviso cor="red">
                    {resumo.naoEncontrados.length} codigo(s) do template SEM produto no Omie (deixados em branco): {listaCodigos(resumo.naoEncontrados)}
                  </Aviso>
                )}
                {resumo.negativos && resumo.negativos.length > 0 && (
                  <Aviso cor="amber">
                    {resumo.negativos.length} peca(s) com saldo NEGATIVO (gravadas como 0 no arquivo): {listaCodigos(resumo.negativos.map((x) => `${x.codigo} (${x.saldo})`))}
                  </Aviso>
                )}
                {resumo.vendaSemEstoque && resumo.vendaSemEstoque.length > 0 && (
                  <Aviso cor="amber">
                    {resumo.vendaSemEstoque.length} peca(s) com venda &gt; 0 e estoque 0 no fim do mes: {listaCodigos(resumo.vendaSemEstoque.map((x) => x.codigo))}
                  </Aviso>
                )}
              </div>
            )}

            {status?.pronto && status.arquivoId != null && (
              <div className="mt-4">
                <a
                  href={`/api/ajustes/mahindra/arquivos/${status.arquivoId}/download`}
                  className="inline-block rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                >
                  Baixar {status.filename || 'arquivo.xlsx'}
                </a>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">3. Ultimos arquivos gerados</h2>
              <button onClick={carregarArquivos} type="button" className="text-sm text-blue-600 hover:underline">Atualizar</button>
            </div>
            {arquivosErro && <div className="mb-2 text-sm text-red-600">{arquivosErro}</div>}
            {arquivos.length === 0 ? (
              <div className="text-sm text-slate-500">Nenhum arquivo gerado ainda para esta conta.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-400">
                      <th className="py-1 pr-3 font-medium">Mes</th>
                      <th className="py-1 pr-3 font-medium">Gerado em</th>
                      <th className="py-1 pr-3 font-medium">Resumo</th>
                      <th className="py-1 pr-3 font-medium">Tamanho</th>
                      <th className="py-1 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {arquivos.map((a) => {
                      const r = a.resumo || {};
                      const det = r.totalPecas != null
                        ? `${fmtNum(r.encontradas)}/${fmtNum(r.totalPecas)} pecas • estoque ${fmtNum(r.somaEstoque)} • vendida ${fmtNum(r.somaVendida)}`
                        : '';
                      return (
                        <tr key={a.id} className="border-t border-slate-100">
                          <td className="whitespace-nowrap py-2 pr-3 text-slate-700">{a.mes || ''}</td>
                          <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{fmtDataHora(a.criado_em)}</td>
                          <td className="py-2 pr-3 text-slate-500">{det}</td>
                          <td className="whitespace-nowrap py-2 pr-3 text-slate-400">{fmtTamanho(a.tamanho_bytes)}</td>
                          <td className="whitespace-nowrap py-2">
                            <a href={`/api/ajustes/mahindra/arquivos/${a.id}/download`} className="text-blue-600 hover:underline">Baixar</a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Card({ label, valor, cor }: { label: string; valor: string; cor: 'slate' | 'green' | 'amber' }) {
  const cores: Record<string, string> = {
    slate: 'bg-slate-50 border-slate-200 text-slate-900',
    green: 'bg-green-50 border-green-200 text-green-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
  };
  return (
    <div className={`rounded border p-3 ${cores[cor]}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="mt-1 text-xl font-semibold">{valor}</div>
    </div>
  );
}

function Aviso({ cor, children }: { cor: 'red' | 'amber' | 'slate'; children: React.ReactNode }) {
  const cores: Record<string, string> = {
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    slate: 'bg-slate-50 border-slate-200 text-slate-600',
  };
  return <div className={`rounded border p-3 text-sm ${cores[cor]}`}>{children}</div>;
}
