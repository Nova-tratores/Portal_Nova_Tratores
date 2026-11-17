'use client';
// Para quem pedir a autorização (José, 17/11/2026: "deixa o usuário escolher para quem ele quer pedir autorização,
// pois eu preciso colocar lá mais de uma pessoa além do Diretor"). Lista = Diretor(es) + quem tem "Autorizar
// requisições" no Admin. Nenhum marcado = vai para todos que podem autorizar. Pode marcar mais de um.
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';

export type Autorizador = { id: string; nome: string; papel: string };

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

export default function EscolherAutorizador({ valor, onChange, titulo = 'Pedir a autorização para' }: {
  valor: string[];
  onChange: (ids: string[]) => void;
  titulo?: string;
}) {
  const lista = useAutorizadores();
  const alternar = (id: string) => onChange(valor.includes(id) ? valor.filter((x) => x !== id) : [...valor, id]);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-zinc-600">{titulo}</span>
      {lista === null ? <span className="text-[13px] text-zinc-500">Carregando…</span> : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange([])}
            className={`min-h-[40px] px-3 rounded-full border text-[13.5px] ${valor.length === 0 ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'}`}>
            Qualquer um que autoriza
          </button>
          {lista.map((a) => {
            const on = valor.includes(a.id);
            return (
              <button key={a.id} type="button" onClick={() => alternar(a.id)} title={a.papel}
                className={`min-h-[40px] pl-2 pr-3 rounded-full border text-[13.5px] flex items-center gap-2 ${on ? 'bg-red-50 text-red-800 border-red-300' : 'bg-white text-zinc-800 border-zinc-200 hover:border-zinc-400'}`}>
                <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${on ? 'bg-red-600 border-red-600 text-white' : 'border-zinc-300'}`}>{on && <Check size={12} />}</span>
                {a.nome}<span className="text-[11.5px] text-zinc-500">· {a.papel === 'Diretor' ? 'Diretor' : 'autoriza'}</span>
              </button>
            );
          })}
        </div>
      )}
      <span className="text-[12px] text-zinc-500">{valor.length ? 'Só quem você marcou recebe o aviso (o Diretor sempre pode decidir).' : 'O aviso vai para todos que podem autorizar.'}</span>
    </div>
  );
}
