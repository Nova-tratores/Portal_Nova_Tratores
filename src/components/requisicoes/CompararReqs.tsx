'use client';
// Comparar duas requisições lado a lado.
//
// O ponto é enxergar a DIFERENÇA, não reler dois cards: as linhas ficam
// alinhadas (mesmo campo na mesma altura nas duas colunas) e o que difere é
// marcado. Campo vazio nas duas some da lista, senão a tela vira um mar de "---".
import React, { useMemo } from 'react';
import { X, ArrowLeftRight, Receipt, Banknote, Paperclip, Check, Minus } from 'lucide-react';

interface Props {
  a: any;
  b: any;
  dadosCompartilhados?: any;
  onFechar: () => void;
  onTrocar?: () => void;   // volta a escolher
}

const dinheiro = (v: any) => (v ? `R$ ${v}` : '');
const data = (v: any) => (v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '');

export default function CompararReqs({ a, b, dadosCompartilhados, onFechar, onTrocar }: Props) {
  const nome = useMemo(() => {
    const usuarios = dadosCompartilhados?.usuarios || [];
    return (email: string) => {
      if (!email) return '';
      if (!email.includes('@')) return email;
      return usuarios.find((u: any) => u.email === email.trim())?.nome || email;
    };
  }, [dadosCompartilhados?.usuarios]);

  const placa = useMemo(() => {
    const veiculos = dadosCompartilhados?.veiculos || [];
    return (id: any) => (id ? (veiculos.find((v: any) => String(v.IdPlaca) === String(id))?.NumPlaca || String(id)) : '');
  }, [dadosCompartilhados?.veiculos]);

  const linhas: { label: string; a: string; b: string }[] = [
    { label: 'Status', a: a.status || '', b: b.status || '' },
    { label: 'Tipo', a: a.tipo || a.ReqTipo || '', b: b.tipo || b.ReqTipo || '' },
    { label: 'Título', a: a.titulo || '', b: b.titulo || '' },
    { label: 'Setor', a: a.setor || a.ReqQuem || '', b: b.setor || b.ReqQuem || '' },
    { label: 'Data', a: data(a.data), b: data(b.data) },
    { label: 'Valor', a: dinheiro(a.valor_despeza), b: dinheiro(b.valor_despeza) },
    { label: 'Fornecedor', a: a.fornecedor || '', b: b.fornecedor || '' },
    { label: 'Nº da nota', a: a.numero_nota || '', b: b.numero_nota || '' },
    { label: 'Solicitante', a: nome(a.solicitante), b: nome(b.solicitante) },
    { label: 'Criado por', a: a.criado_por || '', b: b.criado_por || '' },
    { label: 'Cliente', a: a.cliente || '', b: b.cliente || '' },
    { label: 'Veículo', a: placa(a.veiculo), b: placa(b.veiculo) },
    { label: 'Litros', a: a.litros_combustivel ? `${a.litros_combustivel}L` : '', b: b.litros_combustivel ? `${b.litros_combustivel}L` : '' },
    { label: 'Hodômetro', a: a.hodometro || '', b: b.hodometro || '' },
    { label: 'O.S.', a: a.os_numero || a.os || '', b: b.os_numero || b.os || '' },
    { label: 'Destinação', a: a.quem_ferramenta || a.ferramenta_quem || '', b: b.quem_ferramenta || b.ferramenta_quem || '' },
    { label: 'Tags', a: (a.tags || []).join(', '), b: (b.tags || []).join(', ') },
    { label: 'Observação', a: a.obs || '', b: b.obs || '' },
  ].filter(l => l.a || l.b);   // campo vazio dos dois lados não interessa

  const iguais = linhas.filter(l => String(l.a).trim() === String(l.b).trim()).length;

  const ANEXOS = [
    { campo: 'foto_nf', nome: 'Nota fiscal', Icone: Receipt },
    { campo: 'boleto_fornecedor', nome: 'Boleto', Icone: Banknote },
    { campo: 'recibo_fornecedor', nome: 'Recibo / outros', Icone: Paperclip },
  ] as const;

  const Cabecalho = ({ r, lado }: { r: any; lado: string }) => (
    <div className="flex-1 min-w-0 px-5 py-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-black">{lado}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-[22px] text-black tracking-tight">#{r.id}</span>
        <span className="text-[13px] text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">{r.tipo || r.ReqTipo}</span>
      </div>
      <div className="text-[14px] text-black mt-1 line-clamp-2">{r.titulo}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white w-full max-w-6xl max-h-[94vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center gap-3">
          <ArrowLeftRight size={18} className="text-orange-600" />
          <div className="flex-1">
            <div className="text-[15px] text-black">Comparar requisições</div>
            <div className="text-[13px] text-black">
              {linhas.length - iguais} campo(s) diferente(s) de {linhas.length} — o que difere está destacado.
            </div>
          </div>
          {onTrocar && (
            <button onClick={onTrocar} className="px-4 py-2 rounded-xl border border-zinc-200 text-[14px] text-black hover:bg-zinc-50">
              Escolher outras
            </button>
          )}
          <button onClick={onFechar} className="w-9 h-9 rounded-lg flex items-center justify-center text-black hover:bg-zinc-100"><X size={18} /></button>
        </div>

        {/* Cabeçalho das duas colunas — fica fixo ao rolar */}
        <div className="flex border-b border-zinc-200 bg-zinc-50/70 sticky top-0">
          <div className="w-[160px] shrink-0" />
          <Cabecalho r={a} lado="Esquerda" />
          <div className="w-px bg-zinc-200" />
          <Cabecalho r={b} lado="Direita" />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {linhas.map((l, i) => {
            const difere = String(l.a).trim() !== String(l.b).trim();
            return (
              <div key={l.label} className={`flex items-stretch border-b border-zinc-100 ${difere ? 'bg-amber-50/60' : i % 2 ? 'bg-zinc-50/40' : ''}`}>
                <div className="w-[160px] shrink-0 px-5 py-3 text-[12px] uppercase tracking-wider text-black flex items-center gap-1.5">
                  {difere ? <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" /> : <span className="w-1.5 h-1.5 shrink-0" />}
                  {l.label}
                </div>
                <div className={`flex-1 min-w-0 px-5 py-3 text-[14px] whitespace-pre-wrap break-words ${l.a ? 'text-black' : 'text-zinc-300'}`}>{l.a || '—'}</div>
                <div className="w-px bg-zinc-200" />
                <div className={`flex-1 min-w-0 px-5 py-3 text-[14px] whitespace-pre-wrap break-words ${l.b ? 'text-black' : 'text-zinc-300'}`}>{l.b || '—'}</div>
              </div>
            );
          })}

          {/* Anexos: aqui interessa TER ou NÃO ter, não o nome do arquivo */}
          {ANEXOS.map(({ campo, nome: n, Icone }) => {
            const ta = !!a[campo], tb = !!b[campo];
            const difere = ta !== tb;
            return (
              <div key={campo} className={`flex items-stretch border-b border-zinc-100 ${difere ? 'bg-amber-50/60' : ''}`}>
                <div className="w-[160px] shrink-0 px-5 py-3 text-[12px] uppercase tracking-wider text-black flex items-center gap-1.5">
                  {difere ? <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" /> : <span className="w-1.5 h-1.5 shrink-0" />}
                  <Icone size={13} /> {n}
                </div>
                {[ta, tb].map((tem, idx) => (
                  <React.Fragment key={idx}>
                    {idx === 1 && <div className="w-px bg-zinc-200" />}
                    <div className={`flex-1 min-w-0 px-5 py-3 text-[14px] flex items-center gap-1.5 ${tem ? 'text-emerald-600' : 'text-zinc-300'}`}>
                      {tem ? <><Check size={15} /> anexado</> : <><Minus size={15} /> não tem</>}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
