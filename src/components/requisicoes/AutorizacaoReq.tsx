'use client';
// Quadro da Autorização do Diretor dentro da requisição (José, 17/11/2026; sql/autorizacoes-requisicao.sql).
//   aguardando → "Esperando a autorização do Diretor" + explicação opcional para ele (pode anexar, não muda de fase)
//   recusada   → motivo de quem negou + "Pedir de novo" (com explicação; volta para Aguardando autorização)
//   autorizada → quem autorizou, quando e até que valor
// Autorizar/recusar NÃO é aqui: é na Visão da empresa › Autorizações (só Diretor ou Dev).
import { useState } from 'react';
import { parseValorBR } from '@/lib/requisicoes/autorizacao';
import EscolherAutorizador, { useAutorizadores } from './EscolherAutorizador';
import { faltaParaAutorizar } from '@/lib/requisicoes/autorizacao-requisitos';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quando = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export default function AutorizacaoReq({ req, onUpdate }: { req: Record<string, any>; onUpdate: (id: number, dados: Record<string, unknown>) => void }) {
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
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <i className="fa-solid fa-stamp text-amber-600 text-lg mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-900">Falta pedir a autorização — {brl(valor)}</p>
            <p className="text-xs text-amber-800">De R$ 200 ou mais, a requisição só passa para as outras fases depois de autorizada. Pode editar à vontade; quando estiver completa, peça.</p>
          </div>
        </div>
        {falta.length > 0 ? (
          <div className="rounded-lg bg-white border border-amber-200 px-3 py-2 text-[13px] text-zinc-800">
            Para pedir ainda falta: <b className="font-medium">{falta.join(' · ')}</b>
          </div>
        ) : (<>
          <EscolherAutorizador valor={novoPara} onChange={setNovoPara} />
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={400}
            placeholder="Explique por que precisa (opcional)"
            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400" />
          <button type="button" onClick={() => onUpdate(req.id, { autorizacao_status: 'aguardando', autorizacao_motivo: motivo.trim() || null, autorizacao_para: novoPara.length ? novoPara : null })}
            className="self-start min-h-[42px] px-5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">Pedir autorização</button>
        </>)}
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
