'use client';
// Painel dos grupos de requisições (José, 16/11/2026: "melhorar a forma que é gerado os grupos, pra gente ver as
// requisições dentro de um grupo ou olhar os grupos, facilitar").
// Mostra cada grupo com quantas requisições, valor somado e quanto já chegou ao financeiro; abre o grupo com a
// lista das requisições, onde dá para tirar, juntar várias de uma vez (busca), concluir, trocar o modo e ver o
// histórico. "Novo grupo" já escolhe as requisições na criação.
// Dois jeitos em teste: layout "lista" (A: grupos à esquerda, grupo aberto à direita) e "cartoes" (B: cartões).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Layers, Plus, Search, X, ExternalLink, Check, RotateCcw, FolderOpen, ChevronLeft, Loader2, History, Pencil, Lock, Unlock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAuth } from '@/lib/auth/client';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { podeFinalizarGrupo } from '@/lib/requisicoes/grupos-parados';
import { brl, normalizarStatus, normalizarTipo, visualTipo, COR_FASE } from '@/lib/requisicoes/inteligencia';
import { parseValorBR } from '@/lib/requisicoes/autorizacao';
import { FASES_GRUPO, resumoGrupo } from '@/lib/requisicoes/grupos';
import { IconeQuadrado } from '../visualReq';

type Grupo = {
  id: number; nome: string; status: string; fecha_sozinho?: boolean; criado_por?: string | null; created_at?: string;
  historico?: { acao: string; req_id?: number; usuario: string; em: string; detalhe?: string }[]; membros: number[];
};
type Req = { id: number; titulo: string | null; fornecedor: string | null; valor_despeza: string | null; status: string | null; data: string | null; tipo: string | null; solicitante: string | null };

const ROTULO_FASE: Record<string, string> = { pedido: 'Pedido', completa: 'Esperando o Diretor', aguardando: 'Esperando nota', recusada: 'Não autorizada', financeiro: 'No financeiro', lixeira: 'Lixeira' };
const diasDesde = (d: string | null | undefined) => { if (!d) return null; const t = new Date(d.length <= 10 ? d + 'T12:00:00' : d).getTime(); return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null; };
const dias = (n: number | null) => (n == null ? '' : n === 0 ? 'hoje' : n === 1 ? 'há 1 dia' : `há ${n} dias`);
/** o que falta no grupo: requisições ainda fora do financeiro (sem lixeira), quanto somam e a mais antiga */
/** último "cancelou" do histórico (o motivo vai em detalhe) */
const ultimoCancelamento = (g: Grupo) => [...(g.historico || [])].reverse().find((h) => h.acao === 'cancelou') || null;
function faltaDoGrupo(lista: Req[]) {
  const abertas = lista.filter((x) => { const f = normalizarStatus(x.status); return f !== 'financeiro' && f !== 'lixeira'; });
  const valorFalta = abertas.reduce((s, x) => s + (valor(x.valor_despeza) || 0), 0);
  const maisAntiga = [...abertas].sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')))[0] || null;
  const lixeira = lista.filter((x) => normalizarStatus(x.status) === 'lixeira').length;
  return { abertas, valorFalta, maisAntiga, diasMaisAntiga: maisAntiga ? diasDesde(maisAntiga.data) : null, lixeira };
}
const COLS = 'id, titulo, fornecedor, valor_despeza, status, data, tipo, solicitante';
const dataBR = (d: string | null) => (d ? new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '');
const valor = (v: unknown) => parseValorBR(v);

async function lerReqs(ids: number[]): Promise<Req[]> {
  const fora: Req[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from('Requisicao').select(COLS).in('id', ids.slice(i, i + 300));
    fora.push(...((data || []) as Req[]));
  }
  return fora;
}

export default function PainelGrupos({ layout, criarAoAbrir = false, onVerNoQuadro, onMudou }: {
  layout: 'lista' | 'cartoes';
  /** já abre a janela "Novo grupo" */
  criarAoAbrir?: boolean;
  /** dentro do quadro de requisições: "No quadro" filtra ali mesmo em vez de abrir outra aba */
  onVerNoQuadro?: (id: number) => void;
  /** avisa quem mostra o painel que algo mudou (o quadro relê os grupos) */
  onMudou?: () => void;
}) {
  const isMobile = useIsMobile();
  // concluir/cancelar: só quem criou ou Dev (José, 17/11/2026) — o servidor confere de novo
  const { userProfile } = useAuth();
  const { isDev } = usePermissoes(userProfile?.id);
  const eu = { nome: userProfile?.nome, email: (userProfile as { email?: string } | null)?.email, isDev };
  const podeFin = (g: Grupo) => podeFinalizarGrupo(g.criado_por, eu);
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [reqs, setReqs] = useState<Map<number, Req>>(new Map());
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<'aberto' | 'concluido' | 'cancelado'>('aberto');
  const [busca, setBusca] = useState('');
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const [criando, setCriando] = useState(criarAoAbrir);

  const recarregar = useCallback(async () => {
    try {
      const r = await fetchAuth('/api/pos/requisicoes/grupos');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      const lista = (j as Grupo[]).map((g) => ({ ...g, membros: (g.membros || []).map(Number) }));
      setGrupos(lista);
      const ids = [...new Set(lista.flatMap((g) => g.membros))];
      const linhas = await lerReqs(ids);
      setReqs(new Map(linhas.map((x) => [Number(x.id), x])));
      onMudou?.();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setGrupos([]); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { Promise.resolve().then(recarregar); }, [recarregar]);

  const comResumo = useMemo(() => (grupos || []).map((g) => {
    const lista = g.membros.map((id) => reqs.get(id)).filter((x): x is Req => !!x);
    return { g, lista, r: resumoGrupo(lista, valor) };
  }), [grupos, reqs]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return comResumo.filter(({ g, lista }) => (aba === 'cancelado' ? g.status === 'cancelado' : aba === 'concluido' ? g.status === 'concluido' : g.status !== 'concluido' && g.status !== 'cancelado')
      && (!t || g.nome.toLowerCase().includes(t) || lista.some((x) => String(x.id) === t || (x.titulo || '').toLowerCase().includes(t) || (x.fornecedor || '').toLowerCase().includes(t))));
  }, [comResumo, aba, busca]);

  const nAbertos = comResumo.filter((x) => x.g.status !== 'concluido' && x.g.status !== 'cancelado').length;
  const nConcluidos = comResumo.filter((x) => x.g.status === 'concluido').length;
  const nCancelados = comResumo.filter((x) => x.g.status === 'cancelado').length;
  const aberto = comResumo.find((x) => x.g.id === abertoId) || null;
  // layout A no computador: já abre o 1º grupo
  const efetivo = aberto || (layout === 'lista' && !isMobile ? visiveis[0] || null : null);

  const topo = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-xl bg-zinc-100 p-1">
        {(['aberto', 'concluido', 'cancelado'] as const).map((a) => (
          <button key={a} type="button" onClick={() => { setAba(a); setAbertoId(null); }}
            className={`min-h-[38px] px-3.5 rounded-lg text-[13px] ${aba === a ? 'bg-white shadow-sm text-black font-medium' : 'text-zinc-600'}`}>
            {a === 'aberto' ? `Abertos (${nAbertos})` : a === 'concluido' ? `Concluídos (${nConcluidos})` : `Cancelados (${nCancelados})`}
          </button>
        ))}
      </div>
      <div className="relative flex-1 min-w-[180px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Grupo, nº, título ou fornecedor da requisição"
          className="w-full min-h-[42px] pl-9 pr-3 rounded-xl border border-zinc-200 bg-white text-[13.5px] outline-none focus:border-orange-400" />
      </div>
      <button type="button" onClick={() => setCriando(true)} className="min-h-[42px] px-4 rounded-xl bg-orange-600 text-white text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-orange-700">
        <Plus size={16} /> Novo grupo
      </button>
    </div>
  );

  if (grupos === null) return <div className="py-16 text-center text-zinc-600 text-[14px]"><Loader2 className="inline animate-spin mr-2" size={16} />Carregando os grupos…</div>;

  const vazio = (
    <div className="rounded-2xl border border-dashed border-zinc-300 py-14 text-center text-[14px] text-zinc-600">
      {busca ? 'Nenhum grupo com essa busca.' : aba === 'aberto' ? 'Nenhum grupo aberto. Clique em "Novo grupo".' : aba === 'concluido' ? 'Nenhum grupo concluído ainda.' : 'Nenhum grupo cancelado.'}
    </div>
  );

  const detalhe = efetivo && (
    <DetalheGrupo key={efetivo.g.id} g={efetivo.g} lista={efetivo.lista} r={efetivo.r} podeFinalizar={podeFin(efetivo.g)} onMudou={recarregar} onVerNoQuadro={onVerNoQuadro}
      onVoltar={isMobile || layout === 'cartoes' ? () => setAbertoId(null) : undefined} />
  );

  return (
    <div className="space-y-4">
      {erro && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-800">Não consegui ler os grupos: {erro}</div>}
      {criando && <NovoGrupo onFechar={() => setCriando(false)} onCriado={async (id) => { setCriando(false); setAba('aberto'); await recarregar(); setAbertoId(id); }} />}

      {layout === 'lista' ? (
        isMobile && efetivo ? detalhe : (
          <>
            {topo}
            <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? '1fr' : 'minmax(280px, 360px) 1fr' }}>
              <div className="space-y-2">
                {visiveis.length === 0 ? vazio : visiveis.map(({ g, r }) => {
                  const ativo = efetivo?.g.id === g.id;
                  return (
                    <button key={g.id} type="button" onClick={() => setAbertoId(g.id)}
                      className={`w-full text-left rounded-2xl border px-3.5 py-3 bg-white transition-colors ${ativo ? 'border-orange-400 ring-2 ring-orange-100' : 'border-zinc-200 hover:border-zinc-300'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-black truncate flex-1">{g.nome}</span>
                        {g.fecha_sozinho && g.status === 'aberto' && <span title="Conclui sozinho" className="text-[11px] text-indigo-700 bg-indigo-50 px-1.5 rounded-full">auto</span>}
                        <span className="text-[13px] text-black shrink-0">{brl(r.total)}</span>
                      </div>
                      <div className="text-[12px] text-zinc-600 mt-0.5">{r.qtd} requisição(ões) · {r.noFinanceiro} no financeiro</div>
                      <BarraFases porFase={r.porFase} qtd={r.qtd} fina />
                    </button>
                  );
                })}
              </div>
              {!isMobile && (detalhe || <div className="hidden md:block">{vazio}</div>)}
            </div>
          </>
        )
      ) : (
        efetivo ? detalhe : (
          <>
            {topo}
            {visiveis.length === 0 ? vazio : aba !== 'aberto' ? (
              <Secao titulo={aba === 'concluido' ? 'Concluídos' : 'Cancelados'} n={visiveis.length} cor={aba === 'concluido' ? '#059669' : '#71717A'}>
                {visiveis.map((x) => <CartaoGrupo key={x.g.id} {...x} onAbrir={() => setAbertoId(x.g.id)} />)}
              </Secao>
            ) : (() => {
              // separados pelo que pedem de quem olha (José, 17/11/2026: "muito confuso, tem que separá-los")
              const prontos = visiveis.filter((x) => x.r.qtd > 0 && x.r.pronto);
              const andando = visiveis.filter((x) => x.r.qtd > 0 && !x.r.pronto);
              const vazios = visiveis.filter((x) => x.r.qtd === 0);
              const concluir = async (id: number, nome: string) => {
                if (!confirm(`Concluir o grupo "${nome}"? Dá para reabrir depois.`)) return;
                try { await patchGrupo({ id, status: 'concluido' }); await recarregar(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
              };
              return (
                <div className="space-y-6">
                  {prontos.length > 0 && (
                    <Secao titulo="Prontos para concluir" n={prontos.length} cor="#059669" dica="todas as requisições já chegaram ao financeiro">
                      {prontos.map((x) => <CartaoGrupo key={x.g.id} {...x} onAbrir={() => setAbertoId(x.g.id)} onConcluir={podeFin(x.g) ? () => concluir(x.g.id, x.g.nome) : undefined} />)}
                    </Secao>
                  )}
                  {andando.length > 0 && (
                    <Secao titulo="Em andamento" n={andando.length} cor="#EA580C" dica="ainda têm requisições fora do financeiro">
                      {andando.map((x) => <CartaoGrupo key={x.g.id} {...x} onAbrir={() => setAbertoId(x.g.id)} />)}
                    </Secao>
                  )}
                  {vazios.length > 0 && (
                    <Secao titulo="Sem requisições" n={vazios.length} cor="#71717A" dica="criado e ainda vazio (ou só com requisições na lixeira)">
                      {vazios.map((x) => <CartaoGrupo key={x.g.id} {...x} onAbrir={() => setAbertoId(x.g.id)} />)}
                    </Secao>
                  )}
                </div>
              );
            })()}
          </>
        )
      )}
    </div>
  );
}

function Secao({ titulo, n, cor = '#334155', dica, children }: { titulo: string; n: number; cor?: string; dica?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: cor }} />
        <h3 className="text-[15px] font-medium text-black">{titulo}</h3>
        <span className="text-[13px] text-zinc-500">{n}</span>
        {dica && <span className="text-[12.5px] text-zinc-500">· {dica}</span>}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>{children}</div>
    </section>
  );
}

function CartaoGrupo({ g, lista, r, onAbrir, onConcluir }: { g: Grupo; lista: Req[]; r: ReturnType<typeof resumoGrupo>; onAbrir: () => void; onConcluir?: () => void }) {
  const f = faltaDoGrupo(lista);
  const aberto = g.status === 'aberto';
  const meta = [aberto ? (g.fecha_sozinho ? 'conclui sozinho' : 'fica aberto') : g.status === 'concluido' ? 'concluído' : 'cancelado'].join(' · ');
  // título = a conclusão do grupo
  const titulo = r.qtd === 0 ? 'Nenhuma requisição' : r.pronto ? `Tudo no financeiro · ${r.qtd} ${r.qtd === 1 ? 'requisição' : 'requisições'}` : `Faltam ${f.abertas.length} de ${r.qtd} chegar ao financeiro`;
  return (
    <div role="button" tabIndex={0} onClick={onAbrir} onKeyDown={(e) => { if (e.key === 'Enter') onAbrir(); }}
      className="text-left rounded-2xl border border-zinc-200 bg-white p-4 hover:border-orange-300 hover:shadow-md transition-all flex flex-col gap-3 cursor-pointer">
      <div className="min-w-0">
        <div className="text-[16px] font-medium text-black truncate">{g.nome}</div>
        <div className="text-[12px] text-zinc-500 truncate">{meta}</div>
        <div className="text-[12.5px] text-zinc-700 mt-0.5 truncate">
          Criado por <b className="font-medium">{g.criado_por || 'não registrado'}</b>{g.created_at ? ` em ${dataBR(g.created_at)} (${dias(diasDesde(g.created_at))})` : ''}
        </div>
      </div>
      <div className={`text-[14px] ${r.qtd === 0 ? 'text-zinc-500' : r.pronto ? 'text-emerald-700' : 'text-black'}`}>{titulo}</div>
      {r.qtd > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-zinc-50 px-3 py-2"><div className="text-[11.5px] text-zinc-500">Valor do grupo</div><div className="text-[17px] text-black">{brl(r.total)}</div></div>
          <div className={`rounded-xl px-3 py-2 ${f.abertas.length ? 'bg-orange-50' : 'bg-emerald-50'}`}>
            <div className="text-[11.5px] text-zinc-500">{f.abertas.length ? 'Falta chegar' : 'Já no financeiro'}</div>
            <div className="text-[17px] text-black">{brl(f.abertas.length ? f.valorFalta : r.total)}</div>
          </div>
        </div>
      )}
      {r.qtd > 0 && <BarraFases porFase={r.porFase} qtd={r.qtd} />}
      {f.maisAntiga && (f.diasMaisAntiga || 0) >= 1 && (
        <div className={`text-[12.5px] ${(f.diasMaisAntiga || 0) > 15 ? 'text-red-700' : 'text-zinc-600'}`}>
          Mais antiga aberta: #{f.maisAntiga.id} {dias(f.diasMaisAntiga)}
        </div>
      )}
      {f.lixeira > 0 && <div className="text-[12px] text-zinc-500">{f.lixeira} na lixeira (não conta)</div>}
      {g.status === 'cancelado' && (() => { const h = ultimoCancelamento(g); return (
        <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-[12.5px] text-zinc-800">
          {h?.detalhe ? <>Motivo: “{h.detalhe}”</> : <span className="text-zinc-500">Cancelado sem motivo registrado (antes da regra)</span>}
          {h && <div className="text-[11.5px] text-zinc-500 mt-0.5">{h.usuario} · {dataBR(h.em)}</div>}
        </div>
      ); })()}
      {!onConcluir && r.pronto && aberto && r.qtd > 0 && (
        <div className="text-[12px] text-zinc-500">Só {g.criado_por || 'quem criou'} ou um Dev conclui.</div>
      )}
      {onConcluir && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onConcluir(); }}
          className="min-h-[40px] rounded-lg bg-emerald-600 text-white text-[13.5px] font-medium flex items-center justify-center gap-1.5 hover:bg-emerald-700"><Check size={15} /> Concluir o grupo</button>
      )}
    </div>
  );
}

function BarraFases({ porFase, qtd, fina = false }: { porFase: Record<string, number>; qtd: number; fina?: boolean }) {
  if (!qtd) return <div className={`${fina ? 'h-1.5 mt-2' : 'h-2.5'} rounded-full bg-zinc-100`} />;
  return (
    <div>
      <div className={`flex ${fina ? 'h-1.5 mt-2' : 'h-2.5'} rounded-full overflow-hidden bg-zinc-100`}>
        {FASES_GRUPO.map((f) => porFase[f] ? <div key={f} title={`${ROTULO_FASE[f]}: ${porFase[f]}`} style={{ width: `${(porFase[f] / qtd) * 100}%`, background: COR_FASE[f] }} /> : null)}
      </div>
      {!fina && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {FASES_GRUPO.map((f) => porFase[f] ? (
            <span key={f} className="text-[11.5px] text-zinc-700 flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: COR_FASE[f] }} />{ROTULO_FASE[f]} {porFase[f]}</span>
          ) : null)}
        </div>
      )}
    </div>
  );
}

async function salvarMembro(grupo_id: number, req_id: number, acao: 'add' | 'remove') {
  const r = await fetchAuth('/api/pos/requisicoes/grupos/membros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grupo_id, req_id, acao }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `erro ${r.status}`);
}
async function patchGrupo(corpo: Record<string, unknown>) {
  const r = await fetchAuth('/api/pos/requisicoes/grupos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `erro ${r.status}`);
}

function DetalheGrupo({ g, lista, r, podeFinalizar = true, onMudou, onVoltar, onVerNoQuadro }: { g: Grupo; lista: Req[]; r: ReturnType<typeof resumoGrupo>; podeFinalizar?: boolean; onMudou: () => Promise<void>; onVoltar?: () => void; onVerNoQuadro?: (id: number) => void }) {
  const [adicionando, setAdicionando] = useState(false);
  const [verHist, setVerHist] = useState(false);
  const [nome, setNome] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState('');
  const aberto = g.status === 'aberto';
  const cancel = g.status === 'cancelado' ? ultimoCancelamento(g) : null;
  const falta = faltaDoGrupo(lista);
  const ordenada = [...lista].sort((a, b) => FASES_GRUPO.indexOf(normalizarStatus(a.status) as never) - FASES_GRUPO.indexOf(normalizarStatus(b.status) as never) || b.id - a.id);

  const agir = async (fn: () => Promise<unknown>) => {
    setOcupado(true);
    try { await fn(); await onMudou(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    setOcupado(false);
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      <div className="px-4 py-3.5 border-b border-zinc-100 flex flex-wrap items-center gap-2.5">
        {onVoltar && <button type="button" onClick={onVoltar} className="w-10 h-10 -ml-1 flex items-center justify-center rounded-lg hover:bg-zinc-100" title="Voltar aos grupos"><ChevronLeft size={20} /></button>}
        <span className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0"><FolderOpen size={18} /></span>
        <div className="flex-1 min-w-[160px]">
          {nome != null ? (
            <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nome.trim()) agir(() => patchGrupo({ id: g.id, nome })).then(() => setNome(null)); if (e.key === 'Escape') setNome(null); }}
              onBlur={() => { if (nome.trim() && nome.trim() !== g.nome) agir(() => patchGrupo({ id: g.id, nome })); setNome(null); }}
              className="w-full min-h-[40px] px-2 rounded-lg border border-orange-300 text-[16px] outline-none" />
          ) : (
            <button type="button" onClick={() => setNome(g.nome)} className="text-left text-[16px] font-medium text-black flex items-center gap-1.5 group" title="Renomear">
              {g.nome} <Pencil size={13} className="text-zinc-400 group-hover:text-orange-600" />
            </button>
          )}
          <div className="text-[12px] text-zinc-600">
            {aberto ? 'Aberto' : g.status === 'concluido' ? 'Concluído' : 'Cancelado'}
            {' · criado por '}<b className="font-medium text-black">{g.criado_por || 'não registrado'}</b>{g.created_at ? ` em ${dataBR(g.created_at)}` : ''}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {onVerNoQuadro && aberto ? (
            <button type="button" onClick={() => onVerNoQuadro(g.id)} className="min-h-[40px] px-3 rounded-lg border border-zinc-200 text-[12.5px] text-black flex items-center gap-1.5 hover:border-zinc-400"><FolderOpen size={13} /> Ver no quadro</button>
          ) : !onVerNoQuadro && (
            <a href={`/requisicoes?grupo=${g.id}`} target="_blank" rel="noopener noreferrer" className="min-h-[40px] px-3 rounded-lg border border-zinc-200 text-[12.5px] text-black flex items-center gap-1.5 hover:border-zinc-400"><ExternalLink size={13} /> No quadro</a>
          )}
          <button type="button" onClick={() => setVerHist((v) => !v)} className={`min-h-[40px] px-3 rounded-lg border text-[12.5px] flex items-center gap-1.5 ${verHist ? 'border-orange-400 text-orange-700' : 'border-zinc-200 text-black hover:border-zinc-400'}`}><History size={13} /> Histórico</button>
          {aberto && !podeFinalizar ? (
            <span className="min-h-[40px] px-3 rounded-lg bg-zinc-50 border border-zinc-200 text-[12px] text-zinc-600 flex items-center" title="Concluir ou cancelar: só quem criou o grupo ou um Dev">
              <Lock size={12} className="mr-1.5" /> Só {g.criado_por || 'quem criou'} ou um Dev conclui
            </span>
          ) : aberto ? (
            <>
              <button type="button" disabled={ocupado} onClick={() => confirm(`Concluir o grupo "${g.nome}"? Dá para reabrir depois.`) && agir(() => patchGrupo({ id: g.id, status: 'concluido' }))}
                className="min-h-[40px] px-3 rounded-lg bg-emerald-600 text-white text-[12.5px] flex items-center gap-1.5 hover:bg-emerald-700 disabled:opacity-50"><Check size={14} /> Concluir</button>
              <button type="button" disabled={ocupado} onClick={() => { setMotivoCancel(''); setCancelando(true); }}
                className="min-h-[40px] px-3 rounded-lg border border-zinc-200 text-[12.5px] text-black hover:border-red-300 hover:text-red-700 disabled:opacity-50">Cancelar</button>
            </>
          ) : (
            <button type="button" disabled={ocupado} onClick={() => agir(() => patchGrupo({ id: g.id, status: 'aberto' }))}
              className="min-h-[40px] px-3 rounded-lg border border-orange-200 bg-orange-50 text-[12.5px] text-orange-700 flex items-center gap-1.5 disabled:opacity-50"><RotateCcw size={13} /> Reabrir</button>
          )}
        </div>
      </div>

      {cancelando && (
        <div className="px-4 py-3 border-b border-zinc-100 bg-red-50/60 flex flex-col sm:flex-row gap-2">
          <input autoFocus value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)} maxLength={300}
            placeholder="Por que este grupo está sendo cancelado? (obrigatório)"
            className="flex-1 min-h-[42px] px-3 rounded-lg border border-red-200 bg-white text-[14px] outline-none focus:border-red-400" />
          <button type="button" disabled={motivoCancel.trim().length < 3 || ocupado}
            onClick={() => agir(() => patchGrupo({ id: g.id, status: 'cancelado', motivo: motivoCancel.trim() })).then(() => setCancelando(false))}
            className="min-h-[42px] px-4 rounded-lg bg-red-600 text-white text-[13.5px] disabled:opacity-50">Cancelar o grupo</button>
          <button type="button" onClick={() => setCancelando(false)} className="min-h-[42px] px-3 rounded-lg border border-zinc-200 bg-white text-[13.5px]">Voltar</button>
        </div>
      )}
      {cancel && (
        <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50 text-[13.5px] text-zinc-800">
          {cancel.detalhe ? <>Cancelado por <b className="font-medium">{cancel.usuario}</b> em {dataBR(cancel.em)} — motivo: “{cancel.detalhe}”</> : <>Cancelado por {cancel.usuario} em {dataBR(cancel.em)} (sem motivo registrado — foi antes da regra)</>}
        </div>
      )}
      <div className="px-4 py-3.5 grid gap-3 border-b border-zinc-100" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        <div><div className="text-[12px] text-zinc-600">Requisições</div><div className="text-[20px] text-black">{r.qtd}{r.naLixeira ? <span className="text-[12px] text-zinc-500"> + {r.naLixeira} na lixeira</span> : null}</div></div>
        <div><div className="text-[12px] text-zinc-600">Valor somado</div><div className="text-[20px] text-black">{brl(r.total)}</div></div>
        <div><div className="text-[12px] text-zinc-600">Já no financeiro</div><div className="text-[20px] text-black">{r.noFinanceiro} de {r.qtd}</div></div>
        <div><div className="text-[12px] text-zinc-600">Falta chegar</div><div className={`text-[20px] ${falta.abertas.length ? 'text-orange-700' : 'text-emerald-700'}`}>{falta.abertas.length ? brl(falta.valorFalta) : 'nada'}</div>{falta.abertas.length > 0 && <div className="text-[11.5px] text-zinc-500">{falta.abertas.length} {falta.abertas.length === 1 ? 'requisição' : 'requisições'}{falta.maisAntiga ? ` · a mais antiga ${dias(falta.diasMaisAntiga)}` : ''}</div>}</div>
        <div>
          <div className="text-[12px] text-zinc-600">Quando termina</div>
          {aberto ? (
            <button type="button" disabled={ocupado} onClick={() => agir(() => patchGrupo({ id: g.id, fecha_sozinho: !g.fecha_sozinho }))}
              title="Clique para trocar"
              className={`mt-0.5 min-h-[34px] px-2.5 rounded-lg text-[12.5px] flex items-center gap-1.5 ${g.fecha_sozinho ? 'bg-indigo-50 text-indigo-800' : 'bg-zinc-100 text-zinc-800'}`}>
              {g.fecha_sozinho ? <Unlock size={13} /> : <Lock size={13} />} {g.fecha_sozinho ? 'Conclui sozinho' : 'Fica aberto'}
            </button>
          ) : <div className="text-[14px] text-black mt-1">—</div>}
        </div>
        <div className="col-span-full"><BarraFases porFase={r.porFase} qtd={r.qtd} /></div>
        {aberto && r.pronto && !g.fecha_sozinho && podeFinalizar && (
          <div className="col-span-full rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[13px] text-emerald-900 flex flex-wrap items-center gap-2">
            Todas as requisições já chegaram ao financeiro.
            <button type="button" onClick={() => agir(() => patchGrupo({ id: g.id, status: 'concluido' }))} className="min-h-[34px] px-3 rounded-lg bg-emerald-600 text-white text-[12.5px]">Concluir agora</button>
          </div>
        )}
      </div>

      {verHist && (
        <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50 max-h-[260px] overflow-y-auto space-y-1.5">
          {(g.historico || []).length === 0 ? <div className="text-[13px] text-zinc-600">Sem histórico.</div> : [...(g.historico || [])].reverse().map((h, i) => (
            <div key={i} className="text-[12.5px] text-black">
              <span className="text-zinc-500">{new Date(h.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>{' '}
              <b className="font-medium">{h.usuario}</b> {h.acao}{h.req_id ? ` #${h.req_id}` : ''}{h.detalhe ? ` — ${h.detalhe}` : ''}
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-3 flex items-center gap-2">
        <span className="text-[14px] font-medium text-black flex-1">Requisições do grupo</span>
        {aberto && (
          <button type="button" onClick={() => setAdicionando((v) => !v)}
            className={`min-h-[40px] px-3.5 rounded-lg text-[13px] flex items-center gap-1.5 ${adicionando ? 'bg-zinc-800 text-white' : 'bg-orange-600 text-white hover:bg-orange-700'}`}>
            {adicionando ? <><X size={14} /> Fechar</> : <><Plus size={14} /> Adicionar requisições</>}
          </button>
        )}
      </div>
      {adicionando && (
        <div className="px-4 pb-3">
          <EscolherReqs jaNoGrupo={g.membros} textoBotao="Adicionar ao grupo"
            onEscolher={(ids) => agir(async () => { for (const id of ids) await salvarMembro(g.id, id, 'add'); setAdicionando(false); })} />
        </div>
      )}
      {ordenada.length === 0 ? (
        <div className="px-4 pb-5 text-[13px] text-zinc-600">Nenhuma requisição neste grupo ainda{aberto ? ' — clique em "Adicionar requisições".' : '.'}</div>
      ) : (
        // uma faixa por fase (José, 17/11/2026: melhorar a informação dentro do grupo); lixeira por último, recolhida
        <div className="border-t border-zinc-100">
          {[...FASES_GRUPO, 'lixeira'].map((fase) => {
            const daFase = ordenada.filter((x) => normalizarStatus(x.status) === fase);
            if (!daFase.length) return null;
            const soma = daFase.reduce((s, x) => s + (valor(x.valor_despeza) || 0), 0);
            const linhas = daFase.map((x) => <LinhaReq key={x.id} x={x} onTirar={aberto ? () => confirm(`Tirar a #${x.id} do grupo?`) && agir(() => salvarMembro(g.id, x.id, 'remove')) : undefined} />);
            const cab = (
              <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 text-[13px]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: COR_FASE[fase] || '#71717a' }} />
                <span className="font-medium text-black">{ROTULO_FASE[fase] || fase}</span>
                <span className="text-zinc-500">{daFase.length} · {brl(soma)}</span>
              </div>
            );
            return fase === 'lixeira' ? (
              <details key={fase} className="border-t border-zinc-100"><summary className="cursor-pointer list-none">{cab}</summary><div className="divide-y divide-zinc-100">{linhas}</div></details>
            ) : (
              <div key={fase} className="border-t border-zinc-100">{cab}<div className="divide-y divide-zinc-100">{linhas}</div></div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LinhaReq({ x, onTirar, marcado, onMarcar }: { x: Req; onTirar?: () => void; marcado?: boolean; onMarcar?: () => void }) {
  const fase = normalizarStatus(x.status);
  const v = visualTipo(normalizarTipo(x.tipo || ''));
  const conteudo = (
    <>
      {onMarcar && <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${marcado ? 'bg-orange-600 border-orange-600 text-white' : 'border-zinc-300'}`}>{marcado && <Check size={13} />}</span>}
      <span className="hidden sm:block"><IconeQuadrado icone={v.icone} cor={v.cor} tamanho={34} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] text-black truncate"><span className="text-orange-700">#{x.id}</span> {x.titulo || 'Sem título'}</div>
        <div className="text-[11.5px] text-zinc-600 truncate">{x.fornecedor || 'sem fornecedor'}{x.solicitante ? ` · ${x.solicitante}` : ''}{x.data ? ` · ${dataBR(x.data)}` : ''}{x.data && fase !== 'financeiro' && fase !== 'lixeira' ? ` · aberta ${dias(diasDesde(x.data))}` : ''}</div>
        <div className="sm:hidden text-[12px] text-black">{brl(valor(x.valor_despeza))}</div>
      </div>
      <span className="text-[11px] px-2 py-0.5 rounded-full text-white shrink-0" style={{ background: COR_FASE[fase] || '#71717a' }}>{ROTULO_FASE[fase] || fase}</span>
      <span className="text-[13px] text-black shrink-0 w-[92px] text-right hidden sm:block">{brl(valor(x.valor_despeza))}</span>
    </>
  );
  if (onMarcar) {
    return <button type="button" onClick={onMarcar} className={`w-full text-left flex items-center gap-3 px-3 py-2 min-h-[52px] ${marcado ? 'bg-orange-50' : 'hover:bg-zinc-50'}`}>{conteudo}</button>;
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2 min-h-[54px] hover:bg-zinc-50">
      {conteudo}
      <a href={`/requisicoes?req=${x.id}`} target="_blank" rel="noopener noreferrer" title="Abrir numa nova aba" className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 shrink-0"><ExternalLink size={14} /></a>
      {onTirar && <button type="button" onClick={onTirar} title="Tirar do grupo" className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-600 hover:bg-red-50 hover:text-red-700 shrink-0"><X size={15} /></button>}
    </div>
  );
}

/** busca requisições (nº, título, fornecedor, quem pediu) e deixa marcar várias */
function EscolherReqs({ jaNoGrupo = [], onEscolher, textoBotao, mudou }: { jaNoGrupo?: number[]; onEscolher?: (ids: number[]) => void; textoBotao?: string; mudou?: (ids: number[]) => void }) {
  const [t, setT] = useState('');
  const [achados, setAchados] = useState<Req[]>([]);
  const [marcadas, setMarcadas] = useState<Map<number, Req>>(new Map());
  const [buscando, setBuscando] = useState(false);

  const chaveJa = jaNoGrupo.join(",");
  useEffect(() => {
    let vivo = true;
    const termo = t.trim();
    const ja = new Set(chaveJa ? chaveJa.split(",").map(Number) : []);
    const timer = setTimeout(async () => {
      setBuscando(true);
      let q = supabase.from('Requisicao').select(COLS).order('id', { ascending: false }).limit(termo ? 40 : 80);
      if (/^\d+$/.test(termo)) q = q.eq('id', Number(termo));
      else if (termo) {
        const s = termo.replace(/[%,()]/g, ' ');
        q = q.or(`titulo.ilike.%${s}%,fornecedor.ilike.%${s}%,solicitante.ilike.%${s}%`);
      }
      const { data } = await q;
      const lista = ((data || []) as Req[]).filter((x) => {
        const f = normalizarStatus(x.status);
        return f !== 'lixeira' && !ja.has(Number(x.id)) && (termo || f !== 'financeiro');
      }).slice(0, 30);
      if (vivo) { setAchados(lista); setBuscando(false); }
    }, 250);
    return () => { vivo = false; clearTimeout(timer); };
  }, [t, chaveJa]);

  const alternar = (x: Req) => setMarcadas((m) => {
    const n = new Map(m);
    if (n.has(x.id)) n.delete(x.id); else n.set(x.id, x);
    mudou?.([...n.keys()]);
    return n;
  });

  return (
    <div className="rounded-xl border border-zinc-200 overflow-hidden">
      <div className="p-2 border-b border-zinc-100 bg-zinc-50 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input autoFocus value={t} onChange={(e) => setT(e.target.value)} placeholder="Nº, título, fornecedor ou quem pediu"
            className="w-full min-h-[42px] pl-9 pr-3 rounded-lg border border-zinc-200 bg-white text-[13.5px] outline-none focus:border-orange-400" />
        </div>
        {onEscolher && (
          <button type="button" disabled={!marcadas.size} onClick={() => onEscolher([...marcadas.keys()])}
            className="min-h-[42px] px-3.5 rounded-lg bg-orange-600 text-white text-[13px] disabled:opacity-40">{textoBotao} {marcadas.size ? `(${marcadas.size})` : ''}</button>
        )}
      </div>
      {marcadas.size > 0 && (
        <div className="px-2 py-2 flex flex-wrap gap-1.5 border-b border-zinc-100">
          {[...marcadas.values()].map((x) => (
            <button key={x.id} type="button" onClick={() => alternar(x)} className="text-[12px] px-2 py-1 rounded-full bg-orange-100 text-orange-800 flex items-center gap-1 max-w-[220px]">
              <span className="truncate">#{x.id} {x.titulo}</span><X size={11} />
            </button>
          ))}
        </div>
      )}
      <div className="max-h-[300px] overflow-y-auto divide-y divide-zinc-100">
        {!t.trim() && <div className="px-3 pt-2 text-[11.5px] text-zinc-500">Ainda não chegaram ao financeiro (as mais novas primeiro)</div>}
        {buscando && achados.length === 0 ? <div className="px-3 py-4 text-[13px] text-zinc-600">Buscando…</div>
          : achados.length === 0 ? <div className="px-3 py-4 text-[13px] text-zinc-600">Nenhuma requisição encontrada.</div>
          : achados.map((x) => <LinhaReq key={x.id} x={x} marcado={marcadas.has(x.id)} onMarcar={() => alternar(x)} />)}
      </div>
    </div>
  );
}

function NovoGrupo({ onFechar, onCriado }: { onFechar: () => void; onCriado: (id: number) => void }) {
  const [nome, setNome] = useState('');
  const [fecha, setFecha] = useState(false);
  const [ids, setIds] = useState<number[]>([]);
  const [salvando, setSalvando] = useState(false);

  const criar = async () => {
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      const r = await fetchAuth('/api/pos/requisicoes/grupos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, fecha_sozinho: fecha }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      for (const id of ids) await salvarMembro(j.id, id, 'add');
      if (j.aviso) alert(j.aviso);
      onCriado(j.id);
    } catch (e) { alert('Não consegui criar o grupo: ' + (e instanceof Error ? e.message : String(e))); setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 z-[9200] bg-black/40 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-[680px] sm:rounded-2xl shadow-2xl flex flex-col max-h-full sm:max-h-[92vh]">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-zinc-100">
          <span className="w-9 h-9 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center"><Layers size={17} /></span>
          <div className="flex-1 text-[16px] font-medium text-black">Novo grupo</div>
          <button type="button" onClick={onFechar} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-zinc-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <label className="block">
            <span className="block text-[13px] text-zinc-700 mb-1.5">Nome do grupo</span>
            <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Reforma do barracão, Viagem Ourinhos…"
              className="w-full min-h-[46px] px-3 rounded-xl border border-zinc-200 text-[14.5px] outline-none focus:border-orange-400" />
          </label>
          <div>
            <span className="block text-[13px] text-zinc-700 mb-1.5">Quando o grupo termina?</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([[false, 'Fica aberto', 'Só conclui quando alguém clicar em Concluir', Lock], [true, 'Conclui sozinho', 'Quando todas as requisições chegarem ao financeiro', Unlock]] as const).map(([v, t, d, Ic]) => (
                <button key={String(v)} type="button" onClick={() => setFecha(v)}
                  className={`text-left rounded-xl border px-3.5 py-3 flex items-center gap-3 ${fecha === v ? 'border-orange-500 bg-orange-50' : 'border-zinc-200 hover:border-zinc-300'}`}>
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${fecha === v ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-600'}`}><Ic size={16} /></span>
                  <span><span className="block text-[13.5px] font-medium text-black">{t}</span><span className="block text-[12px] text-zinc-600">{d}</span></span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-[13px] text-zinc-700 mb-1.5">Requisições do grupo <span className="text-zinc-500">(opcional — dá para juntar depois)</span></span>
            <EscolherReqs mudou={setIds} />
          </div>
        </div>
        <div className="flex gap-2 justify-end px-5 py-3 border-t border-zinc-100">
          <button type="button" onClick={onFechar} className="min-h-[44px] px-4 rounded-xl border border-zinc-200 text-[13.5px]">Cancelar</button>
          <button type="button" onClick={criar} disabled={!nome.trim() || salvando}
            className="min-h-[44px] px-5 rounded-xl bg-orange-600 text-white text-[13.5px] flex items-center gap-1.5 disabled:opacity-40">
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Criar grupo{ids.length ? ` com ${ids.length} requisição(ões)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
