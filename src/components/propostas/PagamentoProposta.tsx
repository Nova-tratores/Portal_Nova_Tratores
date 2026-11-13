'use client';
// Bloco "Pagamento" da Proposta: forma, entrada, gerador de parcelas e tabela editável.
// Grava em proposta_pagamento pela API (o "Formulario" continua com o texto das Condições).
// Controlado pelo pai quando `propostaId` ainda não existe (proposta nova): o pai
// chama `salvarPagamentoProposta(id, pagamento)` depois do insert.
import { useMemo, useState } from 'react';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import {
  FORMAS, MEIOS, LINHAS_CREDITO, PAGAMENTO_VAZIO, gerarParcelas, recalcularPercentuais,
  conferirPagamento, numeroBR, brl, somarDiasISO,
  type PagamentoProposta as Pagamento, type ParcelaProposta,
} from '@/lib/propostas/pagamento';

export async function carregarPagamentoProposta(id: number | string): Promise<{ pagamento: Pagamento | null; migracaoFaltando?: boolean }> {
  try {
    const r = await fetchAuth(`/api/propostas/${id}/pagamento`);
    const j = await r.json();
    return { pagamento: j.pagamento ?? null, migracaoFaltando: !!j.migracaoFaltando };
  } catch {
    return { pagamento: null };
  }
}

export async function salvarPagamentoProposta(id: number | string, p: Pagamento): Promise<{ ok: boolean; resumo?: string; erro?: string }> {
  const r = await fetchAuth(`/api/propostas/${id}/pagamento`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, resumo: j.resumo } : { ok: false, erro: j.error || `Erro ${r.status}` };
}

/** Pagamento "vazio" = nada para salvar (proposta sem pagamento estruturado). */
export function pagamentoVazio(p: Pagamento | null | undefined): boolean {
  return !p || (!p.parcelas.length && !(p.entrada_valor && p.entrada_valor > 0) && !p.banco && !p.obs && p.forma === 'parcelado');
}

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

interface Props {
  valor: Pagamento;
  onChange: (p: Pagamento) => void;
  valorTotal: unknown;
  migracaoFaltando?: boolean;
}

const cx = {
  label: 'text-[11px] font-medium text-zinc-500 uppercase tracking-wide',
  input: 'w-full bg-white border border-zinc-200 rounded-lg px-2.5 py-2 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-red-500/30 min-h-[40px]',
};

export default function PagamentoProposta({ valor, onChange, valorTotal, migracaoFaltando }: Props) {
  const total = numeroBR(valorTotal);
  const p = valor || PAGAMENTO_VAZIO;
  const set = (patch: Partial<Pagamento>) => onChange({ ...p, ...patch });

  const [qtd, setQtd] = useState(3);
  const [intervalo, setIntervalo] = useState<'mensal' | 'anual' | '30'>('mensal');
  const [base, setBase] = useState(p.entrada_data || hoje());
  const [carencia, setCarencia] = useState('');

  const conf = useMemo(() => conferirPagamento(p, total), [p, total]);
  const financia = p.forma === 'financiado' || p.forma === 'misto';

  const gerar = () => {
    const parcelas = gerarParcelas({
      total, entrada: p.entrada_valor || 0, base,
      quantidade: qtd,
      intervalo: intervalo === '30' ? 30 : intervalo,
      carenciaDias: carencia.trim() ? Number(carencia) : undefined,
      meio: financia ? 'financiamento' : 'boleto',
    });
    set({ parcelas });
  };

  const editarParcela = (i: number, patch: Partial<ParcelaProposta>) => {
    const parcelas = p.parcelas.map((x, k) => (k === i ? { ...x, ...patch } : x));
    set({ parcelas: recalcularPercentuais(parcelas, total) });
  };
  const addParcela = () => {
    const ult = p.parcelas[p.parcelas.length - 1];
    const venc = ult?.vencimento ? somarDiasISO(ult.vencimento, 30) : somarDiasISO(base, 30);
    set({ parcelas: recalcularPercentuais([...p.parcelas, { n: 0, vencimento: venc, valor: Math.max(0, conf.diferenca), percentual: 0, meio: ult?.meio || 'boleto' }], total) });
  };
  const tirarParcela = (i: number) => set({ parcelas: recalcularPercentuais(p.parcelas.filter((_, k) => k !== i), total) });

  return (
    <div className="border border-zinc-200 rounded-xl bg-white p-3 flex flex-col gap-3">
      {migracaoFaltando && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          O pagamento estruturado ainda não foi ativado (falta aplicar <b>sql/proposta-pagamento.sql</b>). As Condições em texto continuam funcionando.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label className={cx.label}>Forma</label>
          <select className={cx.input} value={p.forma} onChange={(e) => set({ forma: e.target.value as Pagamento['forma'] })}>
            {FORMAS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={cx.label}>{p.forma === 'avista' ? 'Valor à vista' : 'Entrada (R$)'}</label>
          <input className={cx.input} inputMode="decimal" value={p.entrada_valor ?? ''} placeholder={p.forma === 'avista' && total ? String(total) : '0,00'}
            onChange={(e) => set({ entrada_valor: e.target.value === '' ? null : numeroBR(e.target.value) })} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={cx.label}>{p.forma === 'avista' ? 'Data do pagamento' : 'Data da entrada'}</label>
          <input type="date" className={cx.input} value={p.entrada_data ?? ''} onChange={(e) => { set({ entrada_data: e.target.value || null }); if (e.target.value) setBase(e.target.value); }} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={cx.label}>Valor total da proposta</label>
          <div className="min-h-[40px] flex items-center text-[15px] font-semibold text-red-600">{brl(total)}</div>
        </div>
        {financia && (
          <>
            <div className="flex flex-col gap-1">
              <label className={cx.label}>Banco</label>
              <input className={cx.input} value={p.banco ?? ''} onChange={(e) => set({ banco: e.target.value || null })} placeholder="Banco do Brasil, Sicredi…" />
            </div>
            <div className="flex flex-col gap-1">
              <label className={cx.label}>Linha de crédito</label>
              <input className={cx.input} list="linhas-credito-proposta" value={p.linha_credito ?? ''} onChange={(e) => set({ linha_credito: e.target.value || null })} />
              <datalist id="linhas-credito-proposta">{LINHAS_CREDITO.map((l) => <option key={l} value={l} />)}</datalist>
            </div>
          </>
        )}
      </div>

      {p.forma !== 'avista' && (
        <div className="flex flex-wrap items-end gap-2 bg-zinc-50 border border-zinc-200 rounded-lg p-2.5">
          <div className="flex flex-col gap-1 w-[90px]">
            <label className={cx.label}>Parcelas</label>
            <input type="number" min={1} max={240} className={cx.input} value={qtd} onChange={(e) => setQtd(Number(e.target.value) || 1)} />
          </div>
          <div className="flex flex-col gap-1 w-[130px]">
            <label className={cx.label}>A cada</label>
            <select className={cx.input} value={intervalo} onChange={(e) => setIntervalo(e.target.value as typeof intervalo)}>
              <option value="mensal">mês</option>
              <option value="30">30 dias</option>
              <option value="anual">ano (safra)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 w-[150px]">
            <label className={cx.label}>Contando de</label>
            <input type="date" className={cx.input} value={base} onChange={(e) => setBase(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1 w-[130px]">
            <label className={cx.label}>1ª em (dias)</label>
            <input type="number" min={0} className={cx.input} value={carencia} placeholder="1 intervalo" onChange={(e) => setCarencia(e.target.value)} />
          </div>
          <button type="button" onClick={gerar} disabled={!(total > 0)}
            className="flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40 cursor-pointer">
            <Wand2 size={15} /> Gerar parcelas
          </button>
        </div>
      )}

      {p.parcelas.length > 0 && (
        <div className="overflow-x-auto border border-zinc-200 rounded-lg">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-zinc-50 text-zinc-500 text-[11px] uppercase">
              <tr>
                <th className="px-2 py-2 text-left w-10">Nº</th>
                <th className="px-2 py-2 text-left">Vencimento</th>
                <th className="px-2 py-2 text-left">Valor (R$)</th>
                <th className="px-2 py-2 text-left w-16">%</th>
                <th className="px-2 py-2 text-left">Meio</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {p.parcelas.map((x, i) => (
                <tr key={i} className="border-t border-zinc-100">
                  <td className="px-2 py-1 text-zinc-500">{i + 1}</td>
                  <td className="px-2 py-1"><input type="date" className={cx.input} value={x.vencimento} onChange={(e) => editarParcela(i, { vencimento: e.target.value })} /></td>
                  <td className="px-2 py-1"><input className={cx.input} inputMode="decimal" defaultValue={x.valor.toFixed(2).replace('.', ',')} key={`${i}-${x.valor}`}
                    onBlur={(e) => editarParcela(i, { valor: numeroBR(e.target.value) })} /></td>
                  <td className="px-2 py-1 text-zinc-500">{x.percentual.toLocaleString('pt-BR')}</td>
                  <td className="px-2 py-1">
                    <select className={cx.input} value={x.meio} onChange={(e) => editarParcela(i, { meio: e.target.value as ParcelaProposta['meio'] })}>
                      {MEIOS.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <button type="button" onClick={() => tirarParcela(i)} title="Tirar parcela" className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-red-600 cursor-pointer"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {p.forma !== 'avista' && (
          <button type="button" onClick={addParcela} className="flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer">
            <Plus size={15} /> Parcela
          </button>
        )}
        {conf.avisos.length > 0
          ? <span className="text-xs text-amber-700">{conf.avisos.join(' ')}</span>
          : (p.parcelas.length > 0 || p.entrada_valor) && <span className="text-xs text-emerald-700">Fecha com o valor total.</span>}
      </div>

      <div className="flex flex-col gap-1">
        <label className={cx.label}>Observação do pagamento</label>
        <input className={cx.input} value={p.obs ?? ''} onChange={(e) => set({ obs: e.target.value || null })} placeholder="Ex.: usado na troca, carência da safra…" />
      </div>
    </div>
  );
}
