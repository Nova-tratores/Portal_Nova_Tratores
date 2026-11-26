'use client';
// Escolher grupo(s) ao criar a requisição — numa janela, com "criar grupo novo" ali mesmo
// (José, 17/11/2026: "tem que abrir um modal, com a opção de criar um grupo ali com todas as informações necessárias").
// O grupo novo é criado na hora (POST /api/pos/requisicoes/grupos) e já volta marcado; a requisição entra
// nele quando for criada (FormReq manda _grupos e a página faz o vínculo).
import { useMemo, useState } from 'react';
import { Check, FolderPlus, Search, X } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import EventoDoGrupo, { ligarGrupoAoEvento, escolhaIncompleta, type EscolhaEvento } from './EventoDoGrupo';

type Grupo = { id: number; nome: string; criado_por?: string | null; fecha_sozinho?: boolean; membros?: unknown[] };

export default function EscolherGrupoModal({ grupos, selecionados, onConfirmar, onFechar }: {
  grupos: Grupo[];
  selecionados: number[];
  onConfirmar: (ids: number[], criados: Grupo[]) => void;
  onFechar: () => void;
}) {
  const [sel, setSel] = useState<number[]>(selecionados);
  const [busca, setBusca] = useState('');
  const [criados, setCriados] = useState<Grupo[]>([]);
  const [criando, setCriando] = useState(grupos.length === 0);
  const [nome, setNome] = useState('');
  const [fecha, setFecha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [evento, setEvento] = useState<EscolhaEvento>({ modo: 'nao' });

  const todos = useMemo(() => [...criados, ...grupos], [criados, grupos]);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? todos.filter((g) => g.nome.toLowerCase().includes(q)) : todos;
  }, [todos, busca]);
  const nomeRepetido = !!nome.trim() && todos.some((g) => g.nome.trim().toLowerCase() === nome.trim().toLowerCase());

  const criar = async () => {
    if (!nome.trim() || nomeRepetido) return;
    setSalvando(true); setErro('');
    try {
      const r = await fetchAuth('/api/pos/requisicoes/grupos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: nome.trim(), fecha_sozinho: fecha }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `erro ${r.status}`);
      if (j.aviso) alert(j.aviso);
      const avisoEvento = await ligarGrupoAoEvento(j.id, nome.trim(), evento);
      if (avisoEvento) alert(avisoEvento);
      setCriados((c) => [{ ...j, membros: [] }, ...c]);
      setSel((s) => [...s, j.id]);
      setNome(''); setFecha(false); setCriando(false); setBusca(''); setEvento({ modo: 'nao' });
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 z-[10050] flex items-stretch sm:items-center justify-center bg-black/40 sm:p-4" onClick={onFechar}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col max-h-full sm:max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100">
          <span className="flex-1 text-[17px] font-medium text-zinc-900">Grupos desta requisição</span>
          <button type="button" onClick={onFechar} className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-zinc-100" aria-label="Fechar"><X size={18} /></button>
        </header>

        <div className="px-5 pt-4 flex flex-col gap-3 overflow-y-auto">
          {/* criar grupo novo */}
          {criando ? (
            <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 flex flex-col gap-3">
              <div className="text-[14px] font-medium text-zinc-900">Grupo novo</div>
              <label className="flex flex-col gap-1">
                <span className="text-[13px] text-zinc-600">Nome do grupo</span>
                <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void criar(); } }}
                  placeholder="Ex.: Manutenção Ar FOX06 11/26"
                  className="h-11 px-3 rounded-lg border border-zinc-300 bg-white text-[15px] outline-none focus:border-orange-400" />
                {nomeRepetido && <span className="text-[12px] text-red-600">Já existe um grupo aberto com esse nome — marque ele na lista.</span>}
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-[13px] text-zinc-600">Quando o grupo termina?</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { v: false, t: 'Fica aberto', d: 'Alguém conclui o grupo na mão, quando quiser.' },
                    { v: true, t: 'Conclui sozinho', d: 'Fecha quando todas as requisições chegarem ao financeiro.' },
                  ].map((o) => (
                    <button key={o.t} type="button" onClick={() => setFecha(o.v)}
                      className={`text-left rounded-lg border p-3 min-h-[44px] ${fecha === o.v ? 'border-orange-500 bg-white ring-2 ring-orange-500/20' : 'border-zinc-200 bg-white hover:border-zinc-400'}`}>
                      <div className="text-[14px] font-medium text-zinc-900">{o.t}</div>
                      <div className="text-[12.5px] text-zinc-500 leading-snug">{o.d}</div>
                    </button>
                  ))}
                </div>
              </div>
              <EventoDoGrupo valor={evento} onChange={setEvento} />
              {erro && <div className="text-[13px] text-red-600">{erro}</div>}
              <div className="flex gap-2 justify-end">
                {todos.length > 0 && <button type="button" onClick={() => { setCriando(false); setErro(''); }} className="h-10 px-3 rounded-lg border border-zinc-200 text-[14px]">Cancelar</button>}
                <button type="button" disabled={!nome.trim() || nomeRepetido || salvando || escolhaIncompleta(evento)} onClick={criar}
                  className="h-10 px-4 rounded-lg bg-orange-600 text-white text-[14px] font-medium disabled:opacity-50">{salvando ? 'Criando…' : 'Criar e marcar'}</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setCriando(true)}
              className="h-11 rounded-xl border-2 border-dashed border-orange-300 text-orange-700 text-[14px] font-medium flex items-center justify-center gap-2 hover:bg-orange-50">
              <FolderPlus size={16} /> Criar grupo novo
            </button>
          )}

          {/* lista dos grupos abertos */}
          {todos.length > 0 && (<>
            {todos.length > 6 && (
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar grupo"
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-zinc-200 text-[14px] outline-none focus:border-orange-400" />
              </div>
            )}
            <ul className="flex flex-col gap-1 pb-2">
              {lista.map((g) => {
                const on = sel.includes(g.id);
                const n = Array.isArray(g.membros) ? g.membros.length : null;
                return (
                  <li key={g.id}>
                    <button type="button" onClick={() => setSel((s) => (on ? s.filter((x) => x !== g.id) : [...s, g.id]))}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[48px] rounded-lg text-left ${on ? 'bg-orange-50' : 'hover:bg-zinc-50'}`}>
                      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? 'bg-orange-600 border-orange-600' : 'border-zinc-300'}`}>
                        {on && <Check size={14} className="text-white" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] text-zinc-900 truncate">{g.nome}</span>
                        <span className="block text-[12px] text-zinc-500">
                          {[n != null ? `${n} ${n === 1 ? 'requisição' : 'requisições'}` : '', g.fecha_sozinho ? 'conclui sozinho' : 'fica aberto', criados.some((c) => c.id === g.id) ? 'criado agora' : ''].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {!lista.length && <li className="px-3 py-4 text-[14px] text-zinc-500">Nenhum grupo com esse nome.</li>}
            </ul>
          </>)}
        </div>

        <footer className="flex gap-2 px-5 py-4 border-t border-zinc-100">
          <button type="button" onClick={() => setSel([])} disabled={!sel.length} className="h-11 px-4 rounded-lg border border-zinc-200 text-[14px] disabled:opacity-40">Nenhum</button>
          <button type="button" onClick={() => onConfirmar(sel, criados)} className="flex-1 h-11 rounded-lg bg-orange-600 text-white text-[15px] font-medium">
            {sel.length ? `Usar ${sel.length} ${sel.length === 1 ? 'grupo' : 'grupos'}` : 'Sem grupo'}
          </button>
        </footer>
      </div>
    </div>
  );
}
