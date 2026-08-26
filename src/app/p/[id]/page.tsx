// Página PÚBLICA de rastreio de uma UNIDADE de peça (destino do QR da
// etiqueta): mostra a peça, a fase atual e a timeline — sem login pra VER.
// Pra AGIR (peguei/liberar/devolver) o componente client pede a sessão do
// navegador (mesmas credenciais do portal e do app dos mecânicos) com
// mini-login inline. A "chave" é o UUID da unidade (não enumerável).
// Sem preço/custo aqui. Server component com service role (modelo /g/[id]).
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/pos/supabase';
import {
  STATUS_LABEL,
  STATUS_COR,
  DESTINO_LABEL,
  EMPRESA_LABEL,
  EMPRESA_COR,
  type PecaUnidade,
  type UnidadeEvento,
  type UnidadeStatus,
  type DestinoTipo,
} from '@/lib/pecas/unidades';
import { situacaoFaturamentoPpv, type SituacaoFaturamento } from '@/lib/pecas/os-ppv-regras';
import AcoesUnidade from './AcoesUnidade';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fraseEvento(ev: UnidadeEvento): string {
  const p = (ev.payload || {}) as Record<string, string>;
  // pedido apontado na retirada (balcão/uso interno) ou pedido a criar
  const novo = (ev.payload || {}).ppv_novo as { cliente?: string } | undefined;
  const pedido = p.ppv
    ? ` · pedido ${p.ppv}`
    : novo?.cliente ? ` · pedido novo para ${novo.cliente}` : '';
  const destino = p.destino_os
    ? `OS ${p.destino_os}`
    : p.destino_tipo
      ? `${DESTINO_LABEL[p.destino_tipo as DestinoTipo] || p.destino_tipo}${pedido}`
      : '';
  switch (ev.tipo) {
    case 'criacao': return `Etiqueta impressa por ${ev.autor_nome || '—'}`;
    case 'retirada': return `${ev.autor_nome || 'Alguém'} pegou a peça${destino ? ` — destino: ${destino}` : ''}`;
    case 'liberacao': return `Retirada liberada por ${ev.autor_nome || '—'}`;
    case 'recusa': return `Retirada recusada por ${ev.autor_nome || '—'}${p.motivo ? ` — ${p.motivo}` : ''}`;
    case 'retirada_cancelada': return `Retirada cancelada por ${ev.autor_nome || '—'}`;
    case 'aplicacao': return p.os ? `Aplicada na OS ${p.os} (relatório do técnico)` : `Concluída por ${ev.autor_nome || '—'}`;
    case 'devolucao_marcada': return `Marcada para devolução${p.motivo ? ` — ${p.motivo}` : ''}`;
    case 'devolucao_recebida': return `Devolução conferida por ${ev.autor_nome || '—'} — de volta ao estoque`;
    case 'cancelamento': return `Cancelada por ${ev.autor_nome || '—'}${p.motivo ? ` — ${p.motivo}` : ''}`;
    case 'extravio': return `Marcada como extraviada por ${ev.autor_nome || '—'}`;
    case 'recuperacao': return `Recuperada pro estoque por ${ev.autor_nome || '—'}`;
    case 'observacao':
      if (p.origem === 'rastreio_ppv') {
        // o pedido pode vir da OS, da venda balcão ou do uso interno
        const onde = p.os
          ? ` da OS ${p.os}`
          : p.destino_tipo === 'balcao' ? ' (venda balcão)'
            : p.destino_tipo === 'uso_interno' ? ' (uso interno)' : '';
        // item_lancado ausente = evento anterior a 26/08/2026, quando o item
        // podia falhar e a frase ainda dizia que tinha entrado
        if ((ev.payload || {}).item_lancado === false) {
          return `Pedido ${p.ppv}${onde} ligado a esta peça, mas o item NÃO foi lançado — incluir manualmente`;
        }
        return p.ppv_criado
          ? `Pedido ${p.ppv} criado${onde} e esta peça lançada nele`
          : `Peça lançada no pedido ${p.ppv}${onde}`;
      }
      return p.alerta === 'sem_correspondencia_relatorio'
        ? `Relatório da ${p.os || 'OS'} enviado sem mencionar esta peça — aguardando o departamento`
        : 'Observação do sistema';
    default: return ev.tipo;
  }
}

export default async function UnidadeQRPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { data: uRow } = await supabase.from('peca_unidades').select('*').eq('id', id).maybeSingle();
  if (!uRow) notFound();
  const u = uRow as PecaUnidade;

  const { data: evRows } = await supabase
    .from('peca_unidade_eventos')
    .select('*')
    .eq('unidade_id', id)
    .order('created_at', { ascending: false })
    .limit(50);
  const eventos = (evRows || []) as UnidadeEvento[];

  const status = u.status as UnidadeStatus;
  const cor = STATUS_COR[status] || '#64748b';

  const linhas = [
    { conta: u.conta_omie, codigo: u.codigo, descricao: u.descricao, locacao: u.locacao },
    ...(u.alt_codigo ? [{ conta: u.alt_conta_omie || '', codigo: u.alt_codigo, descricao: u.alt_descricao || '', locacao: u.alt_locacao || '' }] : []),
  ];

  // destino + o pedido onde a peça entrou (existe nos três destinos: o PPV da
  // OS, ou o escolhido/criado na venda balcão e no uso interno)
  const destinoBase = u.destino_tipo === 'os'
    ? `OS ${u.destino_os}`
    : u.destino_tipo
      ? DESTINO_LABEL[u.destino_tipo]
      : '';
  const destinoTxt = destinoBase && u.destino_ppv && u.destino_tipo !== 'ppv'
    ? `${destinoBase} · ${u.destino_ppv}`
    : destinoBase;

  // "essa peça já virou nota?" — quem responde é o pedido em que ela entrou
  let faturamento: SituacaoFaturamento | null = null;
  if (u.destino_ppv) {
    const { data: cab } = await supabase
      .from('pedidos')
      .select('id_pedido, status, Tipo_Pedido, pedido_omie, faturado_omie_em, nf_numero')
      .eq('id_pedido', u.destino_ppv)
      .maybeSingle();
    if (cab) faturamento = situacaoFaturamentoPpv(cab as never);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ background: '#C41E2A', color: '#fff', padding: '14px 18px' }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>NOVA TRATORES</div>
        <div style={{ fontSize: 11, opacity: 0.85 }}>Rastreio de peça</div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 40px' }}>
        {/* Peça + fase atual */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', letterSpacing: 0.5 }}>{u.numero}</div>
            <span style={{ background: cor, color: '#fff', fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '6px 14px', whiteSpace: 'nowrap' }}>
              {STATUS_LABEL[status] || status}
            </span>
          </div>
          {linhas.map((l, i) => (
            <div key={i} style={{ marginTop: i === 0 ? 10 : 12, paddingTop: i === 0 ? 0 : 12, borderTop: i === 0 ? 'none' : '1px dashed #e2e8f0' }}>
              <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 800, padding: '2px 10px', borderRadius: 999, color: '#fff', background: EMPRESA_COR[l.conta] || '#6b7280' }}>
                {EMPRESA_LABEL[l.conta] || l.conta}
              </span>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', fontFamily: 'ui-monospace, monospace', marginTop: 4 }}>{l.codigo}</div>
              {l.descricao && <div style={{ fontSize: 13.5, fontWeight: 600, color: '#334155', marginTop: 2 }}>{l.descricao}</div>}
              {l.locacao && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>📍 {l.locacao}</div>}
            </div>
          ))}
          {(status === 'retirada_pendente' || status === 'liberada' || status === 'devolucao_pendente') && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 10, fontSize: 12.5, color: '#334155' }}>
              Retirada por <strong>{u.retirado_por_nome || '—'}</strong>
              {destinoTxt && <> · destino: <strong>{destinoTxt}</strong></>}
              {u.retirado_em && <span style={{ color: '#94a3b8' }}> · {fmtDataHora(u.retirado_em)}</span>}
            </div>
          )}
          {status === 'aplicada' && destinoTxt && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 10, fontSize: 12.5, color: '#334155' }}>
              Aplicada — {destinoTxt}{u.retirado_por_nome ? ` (retirada por ${u.retirado_por_nome})` : ''}
            </div>
          )}
          {/* já virou nota? quem responde é o pedido em que a peça entrou */}
          {faturamento && u.destino_ppv && (
            <div style={{
              marginTop: 10, padding: '8px 12px', borderRadius: 10, fontSize: 12.5,
              background: faturamento.alerta ? '#fef2f2' : faturamento.faturado ? '#ecfdf5' : '#fffbeb',
              border: `1px solid ${faturamento.alerta ? '#fecaca' : faturamento.faturado ? '#a7f3d0' : '#fde68a'}`,
              color: faturamento.alerta ? '#991b1b' : faturamento.faturado ? '#065f46' : '#92400e',
            }}>
              <strong>{faturamento.alerta ? '⚠ ' : ''}{faturamento.rotulo}</strong>
              {' — pedido '}{u.destino_ppv}
              {faturamento.nf ? ` · NF ${faturamento.nf}` : ''}
              {!faturamento.nf && faturamento.omie ? ` · Omie ${faturamento.omie}` : ''}
              {faturamento.em ? ` · ${fmtDataHora(faturamento.em)}` : ''}
              {faturamento.alerta && (
                <div style={{ fontSize: 11.5, marginTop: 2 }}>
                  O pedido foi encerrado sem ir ao Omie e sem gerar nota, e a peça já saiu do estoque.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ações (client: sessão/mini-login + botões por estado) */}
        <AcoesUnidade
          unidadeId={u.id}
          numero={u.numero}
          status={status}
          destinoTipo={u.destino_tipo}
          retiradoPor={u.retirado_por}
        />

        {/* Timeline */}
        {eventos.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#334155', margin: '18px 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Histórico</div>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '6px 16px' }}>
              {eventos.map((ev, i) => (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0', borderBottom: i < eventos.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <span style={{ fontSize: 13, color: '#334155', flex: 1, lineHeight: 1.4 }}>{fraseEvento(ev)}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDataHora(ev.created_at)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: 26, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
          Rastreio de peças · Portal Nova Tratores
        </div>
      </div>
    </div>
  );
}
