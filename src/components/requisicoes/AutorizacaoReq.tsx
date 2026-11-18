'use client';
// Quadro da Autorização do Diretor dentro da requisição (José, 17/11/2026; sql/autorizacoes-requisicao.sql).
//   aguardando → "Esperando a autorização do Diretor" + explicação opcional para ele (pode anexar, não muda de fase)
//   recusada   → motivo de quem negou + "Pedir de novo" (com explicação; volta para Aguardando autorização)
//   autorizada → quem autorizou, quando e até que valor
// Autorizar/recusar NÃO é aqui: é na Visão da empresa › Autorizações (só Diretor ou Dev).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseValorBR } from '@/lib/requisicoes/autorizacao';
import EscolherAutorizador, { useAutorizadores } from './EscolherAutorizador';
import { faltaParaAutorizar } from '@/lib/requisicoes/autorizacao-requisitos';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quando = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

// Para quem + explicação + "Pedir autorização" — o mesmo no quadro amarelo e na janela que abre sozinha
function FormPedir({ para, setPara, motivo, setMotivo, onPedir, extra }: {
  para: string[]; setPara: (x: string[]) => void; motivo: string; setMotivo: (x: string) => void;
  onPedir: () => void; extra?: React.ReactNode;
}) {
  return (<>
    <EscolherAutorizador valor={para} onChange={setPara} />
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-zinc-700" style={{ fontWeight: 500 }}>Explicação para quem vai autorizar <span className="text-zinc-400 font-normal">(opcional)</span></span>
      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={400}
        placeholder="Por que precisa, para quando…"
        className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10 resize-none" />
    </label>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={onPedir}
        className="min-h-[44px] px-5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500">
        <i className="fa-solid fa-paper-plane" /> Pedir autorização
      </button>
      {extra}
    </div>
  </>);
}

/** Janela que abre sozinha quando o valor chega ao limite (José, 18/11/2026): pedir já ou terminar de preencher antes. */
function JanelaPedir({ valor, falta, onFechar, form }: { valor: number; falta: string[]; onFechar: () => void; form: (extra: React.ReactNode) => React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onFechar]);
  const depois = (
    <button type="button" onClick={onFechar}
      className="min-h-[44px] px-4 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-800 hover:bg-zinc-50">
      Terminar de preencher antes
    </button>
  );
  return createPortal(
    <div className="fixed inset-0 z-[100095] bg-black/40 backdrop-blur-[2px] grid place-items-center p-3 overscroll-contain" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="jp-titulo" className="w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3 px-5 py-4 bg-amber-50/70 border-b border-amber-100 rounded-t-2xl">
          <span className="w-10 h-10 rounded-xl shrink-0 grid place-items-center text-amber-700 bg-amber-100 border border-amber-200"><i className="fa-solid fa-stamp" /></span>
          <div className="flex-1 min-w-0">
            <p id="jp-titulo" className="text-[15px] text-amber-950" style={{ fontWeight: 600 }}>Esta requisição precisa de autorização</p>
            <p className="text-[12.5px] text-amber-800/90 mt-0.5">O valor chegou a <b className="tabular-nums">{brl(valor)}</b>. De R$ 200 ou mais, ela só segue para as outras fases depois de autorizada.</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="w-8 h-8 -mr-1 rounded-lg grid place-items-center text-amber-800 hover:bg-amber-100"><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {falta.length > 0 ? (<>
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[13px] text-zinc-800 flex gap-2">
              <i className="fa-solid fa-circle-exclamation text-amber-600 mt-0.5" />
              <span>Para pedir ainda falta: <b className="font-medium">{falta.join(' · ')}</b>. Complete no cartão e clique “Pedir autorização”.</span>
            </div>
            <button type="button" onClick={onFechar} className="self-start min-h-[44px] px-5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800">Terminar de preencher</button>
          </>) : form(depois)}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function AutorizacaoReq({ req, onUpdate, avisar = false, onFecharAviso }: {
  req: Record<string, any>; onUpdate: (id: number, dados: Record<string, unknown>) => void;
  /** abre a janela "pedir já ou terminar antes" (o cartão liga quando o valor acabou de chegar ao limite) */
  avisar?: boolean; onFecharAviso?: () => void;
}) {
  const st = req.autorizacao_status as string | null;
  const [motivo, setMotivo] = useState<string>(req.autorizacao_motivo || '');
  const [pedindo, setPedindo] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const para: string[] = Array.isArray(req.autorizacao_para) ? req.autorizacao_para.map(String) : [];
  const [novoPara, setNovoPara] = useState<string[]>(para);
  const lista = useAutorizadores();
  const nomesPara = para.map((id) => lista?.find((a) => a.id === id)?.nome || '…').join(', ');
  const valor = parseValorBR(req.valor_despeza);

  if (st === 'falta_pedir') {
    const falta = faltaParaAutorizar(req);
    const pedir = () => { onUpdate(req.id, { autorizacao_status: 'aguardando', autorizacao_motivo: motivo.trim() || null, autorizacao_para: novoPara.length ? novoPara : null }); onFecharAviso?.(); };
    const form = (extra: React.ReactNode) => <FormPedir para={novoPara} setPara={setNovoPara} motivo={motivo} setMotivo={setMotivo} onPedir={pedir} extra={extra} />;
    return (
      <div className="rounded-2xl border border-amber-200 bg-white">
        {avisar && <JanelaPedir valor={valor} falta={falta} onFechar={() => onFecharAviso?.()} form={form} />}
        <div className="flex items-start gap-3 px-4 py-3.5 bg-amber-50/70 border-b border-amber-100 rounded-t-2xl">
          <span className="w-10 h-10 rounded-xl shrink-0 grid place-items-center text-amber-700 bg-amber-100 border border-amber-200">
            <i className="fa-solid fa-stamp" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-[15px] text-amber-950" style={{ fontWeight: 600 }}>Falta pedir a autorização</p>
              <p className="text-[17px] text-amber-950 tabular-nums" style={{ fontWeight: 600 }}>{brl(valor)}</p>
            </div>
            <p className="text-[12.5px] text-amber-800/90 mt-0.5 text-pretty">De R$ 200 ou mais, a requisição só passa para as outras fases depois de autorizada. Pode editar à vontade; quando estiver completa, peça.</p>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-4">
          {falta.length > 0 ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[13px] text-zinc-800 flex gap-2">
              <i className="fa-solid fa-circle-exclamation text-amber-600 mt-0.5" />
              <span>Para pedir ainda falta: <b className="font-medium">{falta.join(' · ')}</b></span>
            </div>
          ) : !avisar && form(
            <span className="text-[12px] text-zinc-500">{novoPara.length ? `Vai para ${novoPara.length} pessoa${novoPara.length > 1 ? 's' : ''}` : 'Vai para todos que autorizam'}</span>
          )}
        </div>
      </div>
    );
  }

  if (st === 'aguardando') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <i className="fa-solid fa-stamp text-red-600 text-lg mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-800">Esperando a autorização do Diretor — {brl(valor)}</p>
            <p className="text-xs text-red-700">Enquanto isso a requisição não muda de fase nem de valor. Anexar nota, boleto e recibo continua liberado.</p>
            <p className="text-xs text-red-800 mt-1">Pedido para: <b className="font-semibold">{para.length ? nomesPara : 'todos que podem autorizar'}</b>
              {!trocando && <button type="button" onClick={() => { setNovoPara(para); setTrocando(true); }} className="ml-2 underline">trocar</button>}</p>
          </div>
        </div>
        {trocando && (
          <div className="rounded-lg bg-white border border-red-200 p-3 flex flex-col gap-2">
            <EscolherAutorizador valor={novoPara} onChange={setNovoPara} />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setTrocando(false)} className="min-h-[40px] px-3 rounded-lg border border-zinc-200 text-sm">Voltar</button>
              <button type="button" onClick={() => { onUpdate(req.id, { autorizacao_para: novoPara.length ? novoPara : null }); setTrocando(false); }}
                className="min-h-[40px] px-4 rounded-lg bg-red-600 text-white text-sm font-semibold">Salvar e avisar</button>
            </div>
          </div>
        )}
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={400}
          onBlur={() => { if ((req.autorizacao_motivo || '') !== motivo.trim()) onUpdate(req.id, { autorizacao_motivo: motivo.trim() || null }); }}
          placeholder="Explique para o Diretor por que precisa (opcional)"
          className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400" />
      </div>
    );
  }

  if (st === 'recusada') {
    return (
      <div className="rounded-xl border border-red-300 bg-white p-4 flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <i className="fa-solid fa-ban text-red-700 text-lg mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-800">Não autorizada{req.autorizacao_por ? ` por ${req.autorizacao_por}` : ''}{req.autorizacao_em ? ` em ${quando(req.autorizacao_em)}` : ''}</p>
            {req.autorizacao_obs && <p className="text-sm text-zinc-800 mt-1">Motivo: “{req.autorizacao_obs}”</p>}
            <p className="text-xs text-zinc-600 mt-1">Fica na fase oculta “Não autorizadas”. Corrija o valor, se for o caso, e peça de novo — ou mande para a lixeira.</p>
          </div>
        </div>
        {pedindo && <EscolherAutorizador valor={novoPara} onChange={setNovoPara} />}
        {pedindo ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={400}
              placeholder="O que mudou? Explique para o Diretor"
              className="flex-1 min-h-[40px] rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-red-400" />
            <button disabled={!motivo.trim()}
              onClick={() => { onUpdate(req.id, { autorizacao_status: 'aguardando', autorizacao_motivo: motivo.trim(), status: 'completa', autorizacao_para: novoPara.length ? novoPara : null }); setPedindo(false); }}
              className="min-h-[40px] px-4 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Enviar ao Diretor</button>
            <button onClick={() => setPedindo(false)} className="min-h-[40px] px-3 rounded-lg border border-zinc-200 text-sm">Voltar</button>
          </div>
        ) : (
          <button onClick={() => { setMotivo(''); setPedindo(true); }} className="self-start min-h-[40px] px-4 rounded-lg border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50">Pedir de novo</button>
        )}
      </div>
    );
  }

  if (st === 'autorizada') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-3">
        <i className="fa-solid fa-circle-check text-emerald-600 text-lg mt-0.5" />
        <div className="flex-1 min-w-0 text-sm text-emerald-800">
          Autorizada{req.autorizacao_por ? <> por <b>{req.autorizacao_por}</b></> : null}{req.autorizacao_em ? ` em ${quando(req.autorizacao_em)}` : ''}
          {req.autorizacao_valor != null && <> · até {brl(Number(req.autorizacao_valor))}</>}
          {req.autorizacao_obs && <div className="text-xs text-emerald-700 mt-0.5">“{req.autorizacao_obs}”</div>}
        </div>
      </div>
    );
  }
  return null;
}
