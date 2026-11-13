'use client';
// Dentro da requisição: lista as OUTRAS requisições do mesmo grupo (coletivo),
// com título, fornecedor, valor e fase. "Abrir" abre o cartão dela numa nova
// aba (/requisicoes?req=<id>) sem perder o que está aberto aqui. (13/11/2026)
import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { parseValorBR } from '@/lib/requisicoes/autorizacao';

const brl = (v: string | null) => {
  const n = parseValorBR(v);
  return v && !isNaN(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
};

type Linha = { id: number; titulo: string | null; fornecedor: string | null; valor_despeza: string | null; status: string | null; data: string | null };

const FASE: Record<string, { rotulo: string; cor: string }> = {
  pedido: { rotulo: 'Pedido', cor: '#ea580c' },
  completa: { rotulo: 'Completa', cor: '#0891b2' },
  aguardando: { rotulo: 'Aguardando', cor: '#f59e0b' },
  financeiro: { rotulo: 'Financeiro', cor: '#4f46e5' },
  lixeira: { rotulo: 'Lixeira', cor: '#71717a' },
};

export default function ReqsDoGrupo({ membros, reqAtual }: { membros: (number | string)[]; reqAtual: number }) {
  const ids = Array.from(new Set((membros || []).map(Number).filter((n) => n && n !== Number(reqAtual))));
  const chave = ids.join(',');
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    const lista = chave ? chave.split(',').map(Number) : [];
    if (!lista.length) { Promise.resolve().then(() => { if (vivo) setLinhas([]); }); return () => { vivo = false; }; }
    supabase.from('Requisicao').select('id, titulo, fornecedor, valor_despeza, status, data').in('id', lista)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) { setErro(error.message); setLinhas([]); return; }
        setLinhas(((data || []) as Linha[]).sort((a, b) => b.id - a.id));
      });
    return () => { vivo = false; };
  }, [chave]);

  if (linhas === null) return <div className="text-[12px] text-black px-1 py-2">Carregando as requisições do grupo…</div>;
  if (erro) return <div className="text-[12px] text-red-700 px-1 py-2">Não consegui carregar: {erro}</div>;
  if (!linhas.length) return <div className="text-[12px] text-black italic px-1 py-2">Só esta requisição está neste grupo.</div>;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
      {linhas.map((r) => {
        const f = FASE[String(r.status || '')] || { rotulo: r.status || '—', cor: '#71717a' };
        return (
          <a key={r.id} href={`/requisicoes?req=${r.id}`} target="_blank" rel="noopener noreferrer"
            title="Abrir esta requisição numa nova aba"
            className="flex items-center gap-3 px-3 py-2.5 min-h-[48px] hover:bg-orange-50 transition-colors">
            <span className="text-[12px] font-bold text-orange-700 shrink-0">#{r.id}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-black truncate">{r.titulo || 'Sem título'}</div>
              <div className="text-[11px] text-black truncate">
                {r.fornecedor || 'sem fornecedor'}
                {r.data ? ` · ${new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
              </div>
            </div>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 text-white" style={{ background: f.cor }}>{f.rotulo}</span>
            <span className="text-[13px] font-bold text-black shrink-0 hidden sm:inline">{brl(r.valor_despeza)}</span>
            <ExternalLink size={13} className="text-black shrink-0" />
          </a>
        );
      })}
    </div>
  );
}
