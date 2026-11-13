'use client';
// Na Proposta: mostra o(s) Pedido(s) de Máquina ligado(s) e o botão "Gerar pedido de máquina".
// Só aparece para quem tem o módulo Pedidos de Máquinas (ou vê o vínculo, se só tiver Propostas).
import { useEffect, useState } from 'react';
import { Tractor, ExternalLink } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';

interface PedidoLigado { id: number; id_pedido: string; fase: string; pedido_omie: string | null; valor_total: number }

export default function PedidoMaquinaDaProposta({ propostaId }: { propostaId: number }) {
  const { userProfile } = useAuth();
  const { pode, temAcesso } = usePermissoes(userProfile?.id);
  const [pedidos, setPedidos] = useState<PedidoLigado[] | null>(null);

  useEffect(() => {
    if (!propostaId) return;
    fetchAuth(`/api/pedidos-maquinas/propostas?proposta_id=${propostaId}`)
      .then((r) => (r.ok ? r.json() : { pedidos: [] }))
      .then((j) => setPedidos(j.pedidos || []))
      .catch(() => setPedidos([]));
  }, [propostaId]);

  if (pedidos === null) return null;
  const podeCriar = pode('pedidos-maquinas', 'criar');
  if (!pedidos.length && !podeCriar) return null;
  const abre = temAcesso('pedidos-maquinas');

  return (
    <div className="border border-zinc-200 rounded-xl bg-white p-3 flex flex-wrap items-center gap-2">
      <Tractor size={16} className="text-red-600" />
      <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Pedido de máquina</span>
      {pedidos.map((p) => (
        abre
          ? <a key={p.id} href={`/propostas?aba=pedidos&pvm=${p.id_pedido}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 min-h-[40px] rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm font-semibold">
              {p.id_pedido} · {p.fase}{p.pedido_omie ? ` · Omie ${p.pedido_omie}` : ''} <ExternalLink size={13} />
            </a>
          : <span key={p.id} className="px-3 py-2 rounded-lg bg-zinc-100 text-sm">{p.id_pedido} · {p.fase}</span>
      ))}
      {!pedidos.length && podeCriar && (
        <a href={`/propostas?aba=pedidos&proposta=${propostaId}`} target="_blank" rel="noreferrer"
          className="ml-auto flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">
          <Tractor size={15} /> Gerar pedido de máquina
        </a>
      )}
      {!pedidos.length && <span className="text-xs text-zinc-500">Salve o pagamento antes: o pedido importa a entrada e as parcelas.</span>}
    </div>
  );
}
