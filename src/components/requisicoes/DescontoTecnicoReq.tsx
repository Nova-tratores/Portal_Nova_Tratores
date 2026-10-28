'use client';
// Bloco "Cobrada do técnico" no card da requisição (José, 20/10/2026): quando o pós-vendas desconta a
// requisição de um técnico junto com a comissão, a requisição mostra de quem, em quantas vezes, em quais meses,
// quanto já foi e quanto falta. Lê de /api/mecanicos/requisicao-desconto. Só aparece se houver desconto.
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { situacaoDesconto, mesCurto, type DescontoPedido } from '@/lib/mecanicos/descontos-tecnico';

interface Item { pedidoId: string; tecnico: string; mes: string; status: string; pedidoPor: string | null; pedidoEm: string; decididoPor: string | null; desconto: DescontoPedido }
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesHoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);

export default function DescontoTecnicoReq({ reqId, ativo }: { reqId: number | string; ativo: boolean }) {
  const [itens, setItens] = useState<Item[] | null>(null);
  useEffect(() => {
    if (!ativo || itens !== null) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetchAuth(`/api/mecanicos/requisicao-desconto?id=${encodeURIComponent(String(reqId))}`);
        const j = await r.json();
        if (vivo) setItens(Array.isArray(j.descontos) ? j.descontos : []);
      } catch { if (vivo) setItens([]); }
    })();
    return () => { vivo = false; };
  }, [ativo, reqId, itens]);

  if (!itens?.length) return null;
  const hoje = mesHoje();
  return (
    <div style={{ border: '1px solid #fecaca', background: '#fffafa', borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 10, marginTop: 12 }}>
      {itens.map((x) => {
        const s = situacaoDesconto(x.desconto, x.pedidoEm.slice(0, 7), hoje);
        const lancado = x.status === 'espelhada';
        return (
          <div key={x.pedidoId} style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, color: '#0f172a' }}>Cobrada do técnico <b style={{ fontWeight: 500 }}>{x.tecnico}</b></span>
              <span style={{ fontSize: 12.5, borderRadius: 99, padding: '2px 10px', background: lancado ? '#dcfce7' : '#fef3c7', color: lancado ? '#166534' : '#92400e' }}>
                {lancado ? 'lançada no RH (desconto em folha)' : x.status === 'erro_rh' ? 'autorizada — erro ao lançar no RH' : 'aguardando autorização do diretor'}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 15, color: '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>− {brl(x.desconto.valor)}</span>
            </div>
            <div style={{ fontSize: 13.5, color: '#334155' }}>
              {s.total}x de {brl(s.parcelas[0].valor)} · {s.total > 1 ? `${mesCurto(s.primeiro)} a ${mesCurto(s.ultimo)}` : mesCurto(s.primeiro)}
              {' · '}{s.quitado ? 'quitada' : s.pagas ? `${s.pagas} de ${s.total} já descontadas, faltam ${brl(s.falta)} (termina em ${mesCurto(s.ultimo)})` : `começa em ${mesCurto(s.primeiro)}`}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {s.parcelas.map((p) => {
                const passou = p.mes < hoje, agora = p.mes === hoje;
                return (
                  <span key={p.n} title={`${p.n}ª parcela · ${brl(p.valor)}`} style={{ fontSize: 12, borderRadius: 8, padding: '3px 8px', border: `1px solid ${agora ? '#0f172a' : '#e2e8f0'}`, background: passou ? '#f1f5f9' : '#fff', color: passou ? '#94a3b8' : '#0f172a', textDecoration: passou ? 'line-through' : 'none' }}>
                    {mesCurto(p.mes)}
                  </span>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {x.desconto.descricao} · pedido por {x.pedidoPor || '—'} em {new Date(x.pedidoEm).toLocaleDateString('pt-BR')}{x.decididoPor && lancado ? ` · autorizado por ${x.decididoPor}` : ''} · comissão de {x.mes.slice(5)}/{x.mes.slice(0, 4)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
