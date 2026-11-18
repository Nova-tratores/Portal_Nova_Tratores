'use client';
// Para quem pedir a autorização (José, 17/11/2026: "deixa o usuário escolher para quem ele quer pedir autorização,
// pois eu preciso colocar lá mais de uma pessoa além do Diretor"). Lista = Diretor(es) + quem tem "Autorizar
// requisições" no Admin + (18/11/2026) quem tem acesso ao módulo Autorizações — esses só acompanham (não decidem).
// Nenhum marcado = vai para todos que podem autorizar. Pode marcar mais de um. Menu suspenso (18/11/2026).
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Users } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';

export type Autorizador = { id: string; nome: string; papel: string; decide?: boolean; avatar?: string | null };

let cache: Promise<Autorizador[]> | null = null;
export function carregarAutorizadores(): Promise<Autorizador[]> {
  if (!cache) {
    cache = fetchAuth('/api/autorizacoes/autorizadores')
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => (Array.isArray(j) ? j : []))
      .catch(() => { cache = null; return []; });
  }
  return cache;
}

export function useAutorizadores() {
  const [lista, setLista] = useState<Autorizador[] | null>(null);
  useEffect(() => { let vivo = true; carregarAutorizadores().then((l) => { if (vivo) setLista(l); }); return () => { vivo = false; }; }, []);
  return lista;
}

// cor de cada papel (Diretor vermelho, quem autoriza laranja, quem acompanha cinza)
const COR: Record<string, string> = { 'Diretor': '#DC2626', 'Autoriza requisições': '#EA580C', 'Acompanha a fila': '#71717A' };
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

function Foto({ a }: { a: Autorizador }) {
  const cor = COR[a.papel] || '#71717A';
  // eslint-disable-next-line @next/next/no-img-element
  if (a.avatar) return <img src={a.avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 border border-zinc-200" />;
  return (
    <span className="w-7 h-7 rounded-full shrink-0 grid place-items-center text-[11px] font-semibold"
      style={{ color: cor, background: `color-mix(in srgb, ${cor} 10%, #fff)` }}>{iniciais(a.nome)}</span>
  );
}

const Marca = ({ on }: { on: boolean }) => (
  <span className={`w-[18px] h-[18px] rounded-[5px] border shrink-0 grid place-items-center ${on ? 'bg-red-600 border-red-600 text-white' : 'border-zinc-300 bg-white'}`}>
    {on && <Check size={12} strokeWidth={3} />}
  </span>
);

export default function EscolherAutorizador({ valor, onChange, titulo = 'Pedir a autorização para' }: {
  valor: string[];
  onChange: (ids: string[]) => void;
  titulo?: string;
}) {
  const lista = useAutorizadores();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAberto(false); } };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc, true); };
  }, [aberto]);

  const alternar = (id: string) => onChange(valor.includes(id) ? valor.filter((x) => x !== id) : [...valor, id]);
  const decidem = (lista || []).filter((a) => a.decide !== false);
  const acompanham = (lista || []).filter((a) => a.decide === false);
  const marcados = (lista || []).filter((a) => valor.includes(a.id));
  const resumo = valor.length === 0 ? 'Qualquer um que autoriza'
    : marcados.length === 1 ? marcados[0].nome
    : `${marcados[0]?.nome || ''} e mais ${valor.length - 1}`;

  const linha = (a: Autorizador) => {
    const on = valor.includes(a.id);
    return (
      <button key={a.id} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => alternar(a.id)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-zinc-50 focus-visible:bg-zinc-50 outline-none ${on ? 'bg-red-50/60' : ''}`}>
        <Marca on={on} />
        <Foto a={a} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] text-zinc-900 truncate">{a.nome}</span>
          <span className="block text-[11.5px]" style={{ color: COR[a.papel] || '#71717A' }}>{a.papel}{a.decide === false ? ' · não autoriza' : ''}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-zinc-700" style={{ fontWeight: 500 }}>{titulo}</span>
      <div ref={caixa} className="relative">
        <button type="button" onClick={() => setAberto((x) => !x)} aria-haspopup="menu" aria-expanded={aberto} disabled={lista === null}
          className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 rounded-xl border bg-white text-left transition-[border-color,box-shadow] outline-none focus-visible:ring-4 focus-visible:ring-red-500/15 ${aberto ? 'border-red-400 ring-4 ring-red-500/10' : 'border-zinc-200 hover:border-zinc-300'}`}>
          {marcados.length === 1 ? <Foto a={marcados[0]} /> : <span className="w-7 h-7 rounded-full shrink-0 grid place-items-center bg-zinc-100 text-zinc-600"><Users size={15} /></span>}
          <span className="flex-1 min-w-0 truncate text-[14px] text-zinc-900">{lista === null ? 'Carregando…' : resumo}</span>
          <ChevronDown size={18} className={`text-zinc-500 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
        {aberto && lista && (
          <div role="menu" className="absolute z-40 left-0 right-0 mt-1.5 bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto overscroll-contain">
            <button type="button" role="menuitemradio" aria-checked={valor.length === 0} onClick={() => { onChange([]); setAberto(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 outline-none focus-visible:bg-zinc-50 ${valor.length === 0 ? 'bg-red-50/60' : ''}`}>
              <Marca on={valor.length === 0} />
              <span className="w-7 h-7 rounded-full shrink-0 grid place-items-center bg-zinc-100 text-zinc-600"><Users size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] text-zinc-900">Qualquer um que autoriza</span>
                <span className="block text-[11.5px] text-zinc-500">o aviso vai para todos</span>
              </span>
            </button>
            {decidem.length > 0 && <p className="px-3 pt-2.5 pb-1 text-[11px] uppercase tracking-wide text-zinc-400 border-t border-zinc-100">Autorizam</p>}
            {decidem.map(linha)}
            {acompanham.length > 0 && <p className="px-3 pt-2.5 pb-1 text-[11px] uppercase tracking-wide text-zinc-400 border-t border-zinc-100">Só acompanham a fila</p>}
            {acompanham.map(linha)}
          </div>
        )}
      </div>
      <span className="text-[12px] text-zinc-500">{valor.length ? 'Só quem você marcou recebe o aviso (o Diretor sempre pode decidir).' : 'O aviso vai para todos que podem autorizar.'}</span>
    </div>
  );
}
