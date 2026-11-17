'use client';
// Link da cotação (16/11/2026, José: "quando ela colocar um link já fica clicável").
// Vazio ou editando = caixa de texto; preenchido com um endereço válido = o link clicável (site + caminho),
// com lápis para trocar e X para apagar. Colar o link já mostra clicável (sem precisar sair do campo).
import { useState } from 'react';
import { ExternalLink, Pencil, X, Link2 } from 'lucide-react';
import { linkSeguro } from '@/lib/requisicoes/cotacoes';

/** "https://www.loja.com.br/produto/123?x=1" → { site: "loja.com.br", resto: "/produto/123" } */
export function partesDoLink(url: string) {
  try {
    const u = new URL(url);
    return { site: u.hostname.replace(/^www\./, ''), resto: decodeURIComponent(u.pathname === '/' ? '' : u.pathname) };
  } catch { return { site: url, resto: '' }; }
}

/** endereço válido E com domínio de verdade ("loja" sozinho não vira link) */
export function linkComDominio(v: string | null | undefined): string | null {
  const ok = linkSeguro(v || '');
  if (!ok) return null;
  try { return /\.[a-z]{2,}$/i.test(new URL(ok).hostname) ? ok : null; } catch { return null; }
}

/** endereços citados num texto livre (observação), para mostrar clicáveis embaixo */
export function linksDoTexto(texto: string | null | undefined): string[] {
  const achados = String(texto || '').match(/\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi) || [];
  return [...new Set(achados.map((l) => l.replace(/[).,;]+$/, '')).map((l) => linkComDominio(l)).filter((l): l is string => !!l))];
}

export function LinkClicavel({ url, compacto = false }: { url: string; compacto?: boolean }) {
  const { site, resto } = partesDoLink(url);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={url}
      className={`flex items-center gap-2 min-w-0 rounded-xl border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 hover:border-sky-300 transition-colors ${compacto ? 'px-2.5 min-h-[34px] text-[12px]' : 'flex-1 px-3 min-h-[44px] text-[13.5px]'}`}>
      <ExternalLink size={compacto ? 12 : 14} className="shrink-0" />
      <span className="truncate"><span className="font-medium">{site}</span><span className="text-sky-600">{resto}</span></span>
    </a>
  );
}

export default function CampoLink({ valor, onChange, className = '', placeholder = 'https://… (site do produto, orçamento online)' }: {
  valor: string | null | undefined; onChange: (v: string) => void; className?: string; placeholder?: string;
}) {
  // focado = digitando: só vira link clicável quando sai do campo (ou logo depois de colar)
  const [editando, setEditando] = useState(false);
  const ok = linkComDominio(valor);

  if (ok && !editando) {
    return (
      <div className="flex items-center gap-2">
        <LinkClicavel url={ok} />
        <button type="button" onClick={() => setEditando(true)} title="Trocar o link"
          className="w-11 h-11 flex items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:border-orange-400 hover:text-orange-600 shrink-0"><Pencil size={14} /></button>
        <button type="button" onClick={() => onChange('')} title="Apagar o link"
          className="w-11 h-11 flex items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:border-red-300 hover:text-red-600 shrink-0"><X size={14} /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
      <input value={valor || ''} autoFocus={editando} onFocus={() => setEditando(true)} inputMode="url" placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.trim())}
        onPaste={() => setTimeout(() => setEditando(false), 0)}
        onBlur={() => setEditando(false)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setEditando(false); } }}
        className={`${className} pl-9`} />
    </div>
  );
}
