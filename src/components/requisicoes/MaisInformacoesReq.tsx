'use client';
// "O que vai comprar?" na nova requisição (José, 17/11/2026: "melhora a forma de criar, já deixando colocar mais
// informações que às vezes já tem" → "deve colocar mais de uma coisa e raramente vamos ter a nota ali").
// Opcional e recolhido: VÁRIOS itens (link do produto, produto, quantidade, valor unitário) + fornecedor.
// O link é lido sozinho (produto, preço, loja). Ao criar, o total vira o valor da requisição e a lista de itens
// (com os links) vai para as observações. Nota, boleto e recibo ficam para depois, dentro da requisição.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import FornecedorBusca from './FornecedorBusca';
import CampoLink, { linkComDominio } from './CampoLink';

import { ITEM_VAZIO, num, brl, itemUsado, totalItens, type ItemCompra, type MaisInfo } from '@/lib/requisicoes/itens-compra';
export { MAIS_INFO_VAZIO, dadosDosItens, type MaisInfo } from '@/lib/requisicoes/itens-compra';

function LinhaItem({ item, n, podeTirar, onMudar, onTirar, onLoja, inputStyle }: {
  item: ItemCompra; n: number; podeTirar: boolean; onMudar: (p: Partial<ItemCompra>) => void; onTirar: () => void;
  onLoja: (loja: string) => void; inputStyle: string;
}) {
  const [aviso, setAviso] = useState<{ txt: string; ok: boolean } | null>(null);
  const lido = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atual = useRef(item);
  useEffect(() => { atual.current = item; }, [item]);

  const lerLink = (url: string) => {
    if (timer.current) clearTimeout(timer.current);
    const ok = linkComDominio(url);
    if (!ok || lido.current === ok) return;
    timer.current = setTimeout(async () => {
      lido.current = ok;
      setAviso({ txt: 'Lendo o link…', ok: true });
      try {
        const r = await fetchAuth(`/api/requisicoes/ler-link?url=${encodeURIComponent(ok)}`);
        const d = await r.json().catch(() => ({}));
        if (!d.produto && !d.preco) { setAviso({ txt: d.error || 'Não achei produto nem preço nessa página — preencha à mão.', ok: false }); return; }
        const p: Partial<ItemCompra> = {};
        const feitos: string[] = [];
        if (!atual.current.produto.trim() && d.produto) { p.produto = String(d.produto).toUpperCase().slice(0, 150); feitos.push('produto'); }
        if (!num(atual.current.valor) && d.preco) { p.valor = Number(d.preco).toFixed(2).replace('.', ','); feitos.push('valor'); }
        onMudar(p);
        if (d.fornecedor) onLoja(d.fornecedor);
        setAviso({ txt: feitos.length ? `Preenchi pelo link: ${feitos.join(' e ')}. Confira.` : 'Link lido (os campos já estavam preenchidos).', ok: true });
      } catch { setAviso({ txt: 'Não consegui ler o link — preencha à mão.', ok: false }); }
    }, 500);
  };

  const subtotal = (num(item.qtd) || 1) * num(item.valor);
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-orange-600 text-white text-[12px] flex items-center justify-center shrink-0">{n}</span>
        <div className="flex-1 min-w-0"><CampoLink valor={item.link} onChange={(v) => { onMudar({ link: v }); lerLink(v); }} className={inputStyle} placeholder="Link do produto (se tiver)" /></div>
        {podeTirar && <button type="button" onClick={onTirar} className="w-11 h-11 flex items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:text-red-600 hover:border-red-300 shrink-0" aria-label="Tirar item"><Trash2 size={15} /></button>}
      </div>
      {aviso && <p className={`text-[12.5px] ${aviso.ok ? 'text-sky-700' : 'text-amber-700'}`}>{aviso.txt}</p>}
      <div className="grid grid-cols-[1fr_72px_120px] gap-2">
        <input value={item.produto} onChange={(e) => onMudar({ produto: e.target.value.toUpperCase() })} placeholder="Produto ou serviço" className={inputStyle} />
        <input value={item.qtd} onChange={(e) => onMudar({ qtd: e.target.value.replace(/[^\d,.]/g, '') })} inputMode="decimal" placeholder="Qtd" title="Quantidade" className={`${inputStyle} text-center`} />
        <input value={item.valor} onChange={(e) => onMudar({ valor: e.target.value.replace(/[^\d,.]/g, '') })} inputMode="decimal" placeholder="R$ cada" title="Valor de cada um" className={inputStyle} />
      </div>
      {subtotal > 0 && (num(item.qtd) || 1) > 1 && <div className="text-[12.5px] text-zinc-600 text-right">{item.qtd} × {brl(num(item.valor))} = <b className="font-medium text-black">{brl(subtotal)}</b></div>}
    </div>
  );
}

export default function MaisInformacoesReq({ valor, onChange, inputStyle, labelStyle }: {
  valor: MaisInfo;
  onChange: (v: MaisInfo) => void;
  inputStyle: string;
  labelStyle: string;
}) {
  const usados = valor.itens.filter(itemUsado).length;
  const temAlgo = usados > 0 || !!valor.fornecedor;
  const [aberto, setAberto] = useState(temAlgo);
  const atual = useRef(valor);
  useEffect(() => { atual.current = valor; }, [valor]);
  const set = (p: Partial<MaisInfo>) => { atual.current = { ...atual.current, ...p }; onChange(atual.current); };
  const mudarItem = (idx: number, p: Partial<ItemCompra>) => set({ itens: atual.current.itens.map((it, i) => (i === idx ? { ...it, ...p } : it)) });
  const total = totalItens(valor);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      <button type="button" onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-3 px-5 py-4 text-left min-h-[56px]">
        <span className="flex-1">
          <span className="block text-[15px] text-black" style={{ fontWeight: 500 }}>O que vai comprar? <span className="text-zinc-400 font-normal">(opcional)</span></span>
          <span className="block text-[12.5px] text-zinc-500">Um ou vários itens, com link, quantidade e valor — se já souber, coloque agora.</span>
        </span>
        {temAlgo && !aberto && <span className="text-[12px] text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full whitespace-nowrap">{usados} {usados === 1 ? 'item' : 'itens'}{total ? ` · ${brl(total)}` : ''}</span>}
        <ChevronDown size={20} className={`text-black transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="px-5 pb-5 flex flex-col gap-3">
          {valor.itens.map((it, i) => (
            <LinhaItem key={i} item={it} n={i + 1} podeTirar={valor.itens.length > 1} inputStyle={inputStyle}
              onMudar={(p) => mudarItem(i, p)}
              onTirar={() => set({ itens: atual.current.itens.filter((_, j) => j !== i) })}
              onLoja={(loja) => { if (!atual.current.fornecedor.trim()) set({ fornecedor: loja.slice(0, 120) }); }} />
          ))}
          <button type="button" onClick={() => set({ itens: [...atual.current.itens, { ...ITEM_VAZIO }] })}
            className="h-11 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-700 text-[14px] flex items-center justify-center gap-2 hover:border-orange-400 hover:text-orange-700">
            <Plus size={16} /> Outro item
          </button>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className={labelStyle}>Fornecedor (se já souber)</label>
              <FornecedorBusca valor={valor.fornecedor} onChange={(nome) => set({ fornecedor: nome })} />
            </div>
            <div className="rounded-xl bg-orange-50 px-4 py-2.5 sm:text-right">
              <div className="text-[12px] text-zinc-600">Total</div>
              <div className="text-[18px] text-black">{brl(total)}</div>
            </div>
          </div>
          {total >= 200 && <p className="text-[12.5px] text-red-700">De R$ 200 ou mais: ao criar, a requisição vai para a autorização do Diretor.</p>}
        </div>
      )}
    </div>
  );
}
