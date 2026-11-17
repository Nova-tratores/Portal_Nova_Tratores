'use client';
// Campo "Empresa" das requisições (Mapa de cotações e fornecedor da requisição), 16/11/2026.
// Escolhe do cadastro de Fornecedores; não achou → "Cadastrar" abre a janela que pesquisa o CNPJ pelo nome
// na internet (GET /api/fornecedores/pesquisar), confere na Receita e cadastra ali mesmo.
// Texto antigo digitado à mão continua aparecendo, com o aviso "não está no cadastro".
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, X, Store, Globe, Check, Loader2, MapPin, PenLine } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAuth } from '@/lib/auth/client';
import { useAuditLog } from '@/hooks/useAuditLog';
import { cnpjValido, cpfValido, formatarDocumento, soDigitos, type CandidatoCnpj } from '@/lib/requisicoes/cnpj-busca';

export type FornecedorCadastro = { id: number | string; nome: string; doc: string; cidade: string | null; estado: string | null; telefone?: string | null; email?: string | null };

const semAcento = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

let cache: FornecedorCadastro[] | null = null;
let carregando: Promise<FornecedorCadastro[]> | null = null;
export async function carregarFornecedores(forcar = false): Promise<FornecedorCadastro[]> {
  if (cache && !forcar) return cache;
  if (carregando && !forcar) return carregando;
  carregando = (async () => {
    const { data, error } = await supabase.from('Fornecedores').select('id, nome, "cpf/cnpj", cidade, estado, numero, email').order('nome', { ascending: true });
    if (error) throw error;
    cache = ((data || []) as Record<string, unknown>[]).map((f) => ({
      id: f.id as number, nome: String(f.nome || '').trim(), doc: soDigitos(String(f['cpf/cnpj'] || '')),
      cidade: (f.cidade as string) || null, estado: (f.estado as string) || null,
      telefone: (f.numero as string) || null, email: (f.email as string) || null,
    }));
    carregando = null;
    return cache;
  })();
  return carregando;
}

export default function FornecedorBusca({ valor, onChange, placeholder = 'Buscar no cadastro de fornecedores…', className = '' }: {
  valor: string;
  onChange: (nome: string, fornecedor?: FornecedorCadastro) => void;
  placeholder?: string;
  className?: string;
}) {
  const [lista, setLista] = useState<FornecedorCadastro[]>(cache || []);
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const [cadastrar, setCadastrar] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => { carregarFornecedores().then(setLista).catch(() => {}); }, []);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const doCadastro = useMemo(() => lista.find((f) => semAcento(f.nome) === semAcento(valor)), [lista, valor]);
  const achados = useMemo(() => {
    const t = semAcento(texto);
    if (!t) return lista.slice(0, 0);
    const d = soDigitos(texto);
    return lista.filter((f) => semAcento(f.nome).includes(t) || (d.length >= 4 && f.doc.includes(d))).slice(0, 25);
  }, [texto, lista]);

  const escolher = (f: FornecedorCadastro) => { onChange(f.nome.toUpperCase(), f); setTexto(''); setAberto(false); };

  // escolhido: mostra o nome + documento; "Trocar" volta para a busca
  if (valor && !aberto) {
    return (
      <>
        <div className={`flex items-center gap-2 min-h-[44px] rounded-xl border px-3 py-1.5 bg-white ${doCadastro ? 'border-zinc-200' : 'border-amber-300'} ${className}`}>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-black truncate">{valor}</div>
            <div className={`text-[11px] truncate ${doCadastro ? 'text-zinc-600' : 'text-amber-700'}`}>
              {doCadastro
                ? `${doCadastro.doc ? formatarDocumento(doCadastro.doc) : 'sem CPF/CNPJ'}${doCadastro.cidade ? ` · ${doCadastro.cidade}${doCadastro.estado ? '/' + doCadastro.estado : ''}` : ''}`
                : 'não está no cadastro de fornecedores'}
            </div>
            {doCadastro && (doCadastro.telefone || doCadastro.email) && (
              <div className="text-[11.5px] flex flex-wrap gap-x-3 mt-0.5">
                {doCadastro.telefone && soDigitos(doCadastro.telefone).length >= 10 && (
                  <a href={`https://wa.me/55${soDigitos(doCadastro.telefone).slice(-11)}`} target="_blank" rel="noopener noreferrer" title="Abrir no WhatsApp" className="text-emerald-700 hover:underline">{doCadastro.telefone}</a>
                )}
                {doCadastro.telefone && soDigitos(doCadastro.telefone).length < 10 && <span className="text-zinc-600">{doCadastro.telefone}</span>}
                {doCadastro.email && <a href={`mailto:${doCadastro.email}`} className="text-sky-700 hover:underline truncate max-w-[220px]">{doCadastro.email}</a>}
              </div>
            )}
          </div>
          {!doCadastro && (
            <button type="button" onClick={() => setCadastrar(valor)} className="shrink-0 min-h-[36px] px-2.5 rounded-lg bg-amber-100 text-amber-900 text-[12px] font-semibold hover:bg-amber-200">Cadastrar</button>
          )}
          <button type="button" onClick={() => { setTexto(''); setAberto(true); }} className="shrink-0 min-h-[36px] px-2.5 rounded-lg border border-zinc-200 text-[12px] font-semibold text-black hover:border-orange-400">Trocar</button>
        </div>
        {cadastrar != null && (
          <CadastroNaHora inicial={cadastrar} onFechar={() => setCadastrar(null)}
            onPronto={async (f) => { setCadastrar(null); setLista(await carregarFornecedores(true)); escolher(f); }} />
        )}
      </>
    );
  }

  return (
    <div ref={caixa} className={`relative ${className}`}>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input value={texto} autoFocus={aberto} placeholder={placeholder}
          onChange={(e) => { setTexto(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') setAberto(false); if (e.key === 'Enter' && achados[0]) { e.preventDefault(); escolher(achados[0]); } }}
          className="w-full min-h-[44px] pl-9 pr-9 rounded-xl border border-zinc-200 bg-white text-[14px] text-black outline-none focus:border-orange-400" />
        {valor && <button type="button" title="Voltar" onClick={() => setAberto(false)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-black"><X size={14} /></button>}
      </div>
      {aberto && texto.trim() && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 max-h-[320px] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl">
          {achados.map((f) => (
            <button key={f.id} type="button" onClick={() => escolher(f)}
              className="w-full text-left px-3 py-2 min-h-[48px] border-b border-zinc-100 hover:bg-orange-50">
              <div className="text-[13.5px] font-semibold text-black truncate">{f.nome}</div>
              <div className="text-[11.5px] text-zinc-600 truncate">{f.doc ? formatarDocumento(f.doc) : 'sem CPF/CNPJ'}{f.cidade ? ` · ${f.cidade}${f.estado ? '/' + f.estado : ''}` : ''}</div>
            </button>
          ))}
          {achados.length === 0 && <div className="px-3 py-3 text-[13px] text-zinc-600">Nenhum fornecedor do cadastro com esse nome.</div>}
          <button type="button" onClick={() => { setCadastrar(texto.trim()); setAberto(false); }}
            className="w-full text-left px-3 py-3 min-h-[48px] flex items-center gap-2 text-[13.5px] font-semibold text-orange-700 hover:bg-orange-50">
            <Globe size={15} /> Cadastrar &quot;{texto.trim()}&quot; — pesquisar o CNPJ na internet
          </button>
        </div>
      )}
      {cadastrar != null && (
        <CadastroNaHora inicial={cadastrar} onFechar={() => setCadastrar(null)}
          onPronto={async (f) => { setCadastrar(null); setLista(await carregarFornecedores(true)); escolher(f); }} />
      )}
    </div>
  );
}

const VAZIO = { nome: '', doc: '', numero: '', email: '', cep: '', endereco: '', endereco_numero: '', bairro: '', cidade: '', estado: '', descricao: '' };
type Ficha = typeof VAZIO;

/** janela: pesquisa pelo nome (ou CNPJ) na internet → escolhe → confere os dados → cadastra */
export function CadastroNaHora({ inicial, onFechar, onPronto }: { inicial: string; onFechar: () => void; onPronto: (f: FornecedorCadastro) => void }) {
  const [busca, setBusca] = useState(inicial);
  const [pesquisando, setPesquisando] = useState(false);
  const [candidatos, setCandidatos] = useState<CandidatoCnpj[] | null>(null);
  const [aviso, setAviso] = useState('');
  const [fonte, setFonte] = useState('');
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const { log: auditLog } = useAuditLog();
  const jaPesquisou = useRef(false);

  const pesquisar = async (q = busca) => {
    if (!q.trim()) return;
    setPesquisando(true); setAviso(''); setCandidatos(null);
    try {
      const r = await fetchAuth(`/api/fornecedores/pesquisar?q=${encodeURIComponent(q.trim())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `erro ${r.status}`);
      setCandidatos(j.candidatos || []); setAviso(j.aviso || ''); setFonte(j.fonte || '');
    } catch (e) { setCandidatos([]); setAviso('Não consegui pesquisar agora: ' + (e instanceof Error ? e.message : String(e))); }
    setPesquisando(false);
  };
  useEffect(() => {
    if (jaPesquisou.current) return;
    jaPesquisou.current = true;
    if (inicial.trim().length >= 3) Promise.resolve().then(() => pesquisar(inicial));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usarCandidato = (c: CandidatoCnpj) => setFicha({
    nome: c.razao_social, doc: formatarDocumento(c.cnpj), numero: c.telefone, email: c.email,
    cep: c.cep, endereco: c.endereco, endereco_numero: c.numero, bairro: c.bairro, cidade: c.cidade, estado: c.uf,
    descricao: c.nome_fantasia && c.nome_fantasia !== c.razao_social ? `Nome fantasia: ${c.nome_fantasia}` : '',
  });

  const buscarCep = async (cep: string) => {
    const d = soDigitos(cep);
    if (d.length !== 8 || !ficha) return;
    try {
      const j = await (await fetch(`https://viacep.com.br/ws/${d}/json/`)).json();
      if (!j.erro) setFicha((p) => p && ({ ...p, endereco: p.endereco || j.logradouro || '', bairro: p.bairro || j.bairro || '', cidade: j.localidade || p.cidade, estado: j.uf || p.estado }));
    } catch { /* segue à mão */ }
  };

  const salvar = async () => {
    if (!ficha) return;
    const doc = soDigitos(ficha.doc);
    setErro('');
    if (!ficha.nome.trim()) { setErro('Informe o nome.'); return; }
    if (doc && !(doc.length === 14 ? cnpjValido(doc) : doc.length === 11 ? cpfValido(doc) : false)) { setErro('CPF ou CNPJ com dígitos errados. Confira o número (ou deixe em branco).'); return; }
    setSalvando(true);
    try {
      const existentes = await carregarFornecedores(true);
      const igual = doc ? existentes.find((f) => f.doc === doc) : existentes.find((f) => semAcento(f.nome) === semAcento(ficha.nome));
      if (igual) { onPronto(igual); return; }
      const novo = {
        nome: ficha.nome.trim().toUpperCase(), 'cpf/cnpj': doc ? formatarDocumento(doc) : null,
        numero: ficha.numero || null, email: ficha.email || null, cep: ficha.cep || null, endereco: ficha.endereco || null,
        endereco_numero: ficha.endereco_numero || null, bairro: ficha.bairro || null, cidade: ficha.cidade || null,
        estado: ficha.estado ? ficha.estado.toUpperCase().slice(0, 2) : null, descricao: ficha.descricao || null,
      };
      const { data, error } = await supabase.from('Fornecedores').insert([novo]).select('id, nome, cidade, estado').single();
      if (error) throw error;
      auditLog({ sistema: 'requisicoes', acao: 'criar', entidade: 'fornecedor', entidade_id: String(data.id), entidade_label: novo.nome, detalhes: { origem: 'cadastro-na-hora', pesquisa: busca, fonte } });
      onPronto({ id: data.id, nome: data.nome, doc, cidade: data.cidade, estado: data.estado });
    } catch (e) { setErro('Não consegui cadastrar: ' + (e instanceof Error ? e.message : String(e))); }
    setSalvando(false);
  };

  const campo = (k: keyof Ficha, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="block text-[12px] text-zinc-600 mb-1">{rotulo}</span>
      <input value={ficha?.[k] || ''} onChange={(e) => setFicha((p) => p && ({ ...p, [k]: e.target.value }))} {...extra}
        className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 bg-white text-[14px] text-black outline-none focus:border-orange-400" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[9300] bg-black/40 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-[720px] sm:rounded-2xl shadow-2xl flex flex-col max-h-full sm:max-h-[90vh]">
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-zinc-100">
          <span className="w-9 h-9 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center shrink-0"><Store size={17} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-medium text-black">Cadastrar fornecedor</div>
            <div className="text-[12px] text-zinc-600">{ficha ? 'Confira os dados e cadastre' : 'Pesquiso o nome na internet e confiro o CNPJ na Receita'}</div>
          </div>
          <button type="button" onClick={onFechar} className="w-10 h-10 flex items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
          {!ficha ? (
            <>
              <form onSubmit={(e) => { e.preventDefault(); pesquisar(); }} className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus placeholder="Nome da empresa (e a cidade) ou CNPJ"
                    className="w-full min-h-[46px] pl-9 pr-3 rounded-xl border border-zinc-200 text-[14.5px] text-black outline-none focus:border-orange-400" />
                </div>
                <button type="submit" disabled={pesquisando || !busca.trim()}
                  className="min-h-[46px] px-4 rounded-xl bg-orange-600 text-white text-[14px] font-medium flex items-center gap-2 disabled:opacity-50">
                  {pesquisando ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />} <span className="hidden sm:inline">Pesquisar</span>
                </button>
              </form>
              <p className="text-[12px] text-zinc-600 mt-2">Dica: coloque a cidade junto do nome para achar mais rápido. CPF de pessoa física não aparece na internet — use &quot;Preencher à mão&quot;.</p>

              {pesquisando && (
                <div className="mt-4 space-y-2">
                  {[0, 1, 2].map((i) => <div key={i} className="h-[74px] rounded-xl bg-zinc-100 animate-pulse" />)}
                  <div className="text-[12.5px] text-zinc-600 text-center">Pesquisando na internet e conferindo na Receita…</div>
                </div>
              )}
              {!pesquisando && aviso && <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-[13px] text-amber-900">{aviso}</div>}
              {!pesquisando && candidatos && candidatos.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-[12px] text-zinc-600">{candidatos.length} empresa(s) encontrada(s){fonte ? ` · pesquisa: ${fonte}, dados: Receita Federal` : ''}</div>
                  {candidatos.map((c) => {
                    const ativa = /ativa/i.test(c.situacao);
                    return (
                      <div key={c.cnpj} className="rounded-xl border border-zinc-200 px-3.5 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5 hover:border-orange-300">
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-medium text-black">{c.razao_social}</div>
                          {c.nome_fantasia && c.nome_fantasia !== c.razao_social && <div className="text-[12.5px] text-zinc-700">{c.nome_fantasia}</div>}
                          <div className="text-[12px] text-zinc-600 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span>{formatarDocumento(c.cnpj)}</span>
                            {c.cidade && <span className="flex items-center gap-0.5"><MapPin size={11} /> {c.cidade}/{c.uf}</span>}
                            <span className={`px-1.5 rounded-full text-[11px] ${ativa ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{c.situacao || '?'}</span>
                          </div>
                          {c.atividade && <div className="text-[11.5px] text-zinc-500 truncate mt-0.5">{c.atividade}</div>}
                        </div>
                        {c.ja_cadastrado ? (
                          <button type="button" onClick={() => onPronto({ id: c.ja_cadastrado!.id, nome: c.ja_cadastrado!.nome, doc: c.cnpj, cidade: c.cidade, estado: c.uf })}
                            className="shrink-0 min-h-[42px] px-3.5 rounded-xl bg-emerald-600 text-white text-[13px] font-medium flex items-center justify-center gap-1.5">
                            <Check size={15} /> Já cadastrado — usar
                          </button>
                        ) : (
                          <button type="button" onClick={() => usarCandidato(c)}
                            className="shrink-0 min-h-[42px] px-3.5 rounded-xl bg-orange-600 text-white text-[13px] font-medium flex items-center justify-center gap-1.5">
                            <Plus size={15} /> É esta
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">{campo('nome', 'Nome no cadastro *')}</div>
              {campo('doc', 'CPF ou CNPJ', { inputMode: 'numeric' })}
              {campo('numero', 'Telefone', { inputMode: 'tel' })}
              <div className="sm:col-span-2">{campo('email', 'E-mail', { type: 'email' })}</div>
              {campo('cep', 'CEP', { inputMode: 'numeric', onBlur: (e) => buscarCep(e.target.value) })}
              {campo('endereco', 'Endereço')}
              {campo('endereco_numero', 'Número')}
              {campo('bairro', 'Bairro')}
              {campo('cidade', 'Cidade')}
              {campo('estado', 'UF', { maxLength: 2 })}
              <div className="sm:col-span-2">{campo('descricao', 'Observação')}</div>
            </div>
          )}
          {erro && <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-800">{erro}</div>}
        </div>

        <div className="flex flex-wrap gap-2 justify-end px-4 sm:px-5 py-3 border-t border-zinc-100">
          {!ficha ? (
            <button type="button" onClick={() => setFicha({ ...VAZIO, nome: soDigitos(busca).length >= 11 ? '' : busca.toUpperCase(), doc: soDigitos(busca).length >= 11 ? busca : '' })}
              className="min-h-[44px] px-4 rounded-xl border border-zinc-200 text-[13.5px] text-black flex items-center gap-1.5 hover:border-zinc-400">
              <PenLine size={15} /> Preencher à mão
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setFicha(null)} className="min-h-[44px] px-4 rounded-xl border border-zinc-200 text-[13.5px] text-black hover:border-zinc-400">Voltar à pesquisa</button>
              <button type="button" onClick={salvar} disabled={salvando}
                className="min-h-[44px] px-5 rounded-xl bg-orange-600 text-white text-[13.5px] font-medium flex items-center gap-1.5 disabled:opacity-50">
                {salvando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Cadastrar e usar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
