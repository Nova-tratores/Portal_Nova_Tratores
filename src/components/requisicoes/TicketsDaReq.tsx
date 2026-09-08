'use client';
// Bloco "Tickets" do card da requisição — a mão inversa do vínculo feito no
// ticket (tickets_vinculos). Lê DIRETO pelo browser, como o resto da tela:
// a RLS (tickets_pode_ver) já filtra os tickets que este usuário pode ver,
// e o embed tickets(...) resolve pela FK ticket_id. Carrega só quando o modal
// abre (mesmo padrão do req_cotacao no CardReq). Só leitura — vincular é no ticket.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Ticket as TicketIcon, ChevronDown, ExternalLink } from 'lucide-react';
import { STATUS_INFO, type TicketStatus } from '@/lib/tickets/constantes';

interface TicketMin { id: string; numero: number; titulo: string; status: TicketStatus }
interface Linha { id: string; ticket_id: string; created_at: string; ticket: TicketMin | null }

export default function TicketsDaReq({ reqId, ativo }: { reqId: number | string; ativo: boolean }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!ativo || linhas !== null) return;
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase
        .from('tickets_vinculos')
        .select('id, ticket_id, created_at, tickets(id, numero, titulo, status)')
        .eq('vinculo_tipo', 'requisicao')
        .eq('vinculo_ref', String(reqId))
        .order('created_at');
      if (cancelado) return;
      if (error) { setLinhas([]); return; }
      setLinhas((data || []).map((d: any) => ({
        id: d.id, ticket_id: d.ticket_id, created_at: d.created_at,
        // supabase-js pode tipar o embed como array — normaliza
        ticket: (Array.isArray(d.tickets) ? d.tickets[0] : d.tickets) || null,
      })));
    })();
    return () => { cancelado = true; };
  }, [ativo, reqId, linhas]);

  const lista = (linhas || []).filter((l) => l.ticket);
  const resumo = linhas === null ? 'carregando...'
    : lista.length === 0 ? 'nenhum ticket'
    : lista.length === 1 ? `#${lista[0].ticket!.numero} ${lista[0].ticket!.titulo}`
    : `${lista.length} tickets`;

  return (
    <div className="bg-zinc-50 border border-zinc-200 rounded-xl">
      <button type="button" onClick={() => setAberto(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <TicketIcon size={14} className="text-orange-600 shrink-0" />
        <span className="text-[13px] font-bold text-black">Tickets</span>
        <span className="text-[12px] text-black truncate">{resumo}</span>
        <ChevronDown size={16} className={`ml-auto text-black transition-transform shrink-0 ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="px-4 pb-3 -mt-1">
          {lista.length === 0 ? (
            <span className="text-[12px] text-black italic">nenhum ticket aponta pra esta requisição — o vínculo é feito de dentro do ticket</span>
          ) : (
            <div className="flex flex-col gap-1.5">
              {lista.map((l) => {
                const t = l.ticket!;
                const st = STATUS_INFO[t.status] || { label: t.status, cor: '#6b7280', fundo: 'rgba(107,114,128,.12)' };
                return (
                  <a key={l.id} href={`/tickets/${t.id}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[13px] text-black bg-white border border-zinc-200 rounded-lg px-3 py-2 hover:border-orange-400">
                    <span className="font-bold shrink-0">#{t.numero}</span>
                    <span className="truncate flex-1">{t.titulo}</span>
                    <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 shrink-0" style={{ color: st.cor, background: st.fundo }}>{st.label}</span>
                    <ExternalLink size={13} className="shrink-0 text-zinc-500" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
