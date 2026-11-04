'use client';
// Ficha da OS da frota: etapa e próximos passos, itens (feito / não feito),
// requisição, entrada e entrega do carro, tempo parado e o histórico.
import { useState } from 'react';
import { Check, ExternalLink, FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import { ETAPA_INFO, ativa, fmtParado, proximasEtapas, type EtapaOS } from '@/lib/frota/oficina';
import { formatarPlaca } from '@/lib/frota/placa';
import { Janela, botao, fmtData, fmtDataHora, fmtKm, fmtReais, postOficina, type OsFrota } from './comum';

const TIPO_ITEM: Record<string, string> = { pendencia: 'Pendência', preventiva: 'Preventiva', avulso: 'Serviço' };

export default function OsDetalhe({ os, podeMover, onFechar, onMover, onIncluir, onMudou }: {
  os: OsFrota;
  podeMover: boolean;
  onFechar: () => void;
  onMover: (para: EtapaOS) => void;
  onIncluir: () => void;
  onMudou: (msg?: string) => void;
}) {
  const [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState('');
  const aberta = ativa(os.etapa);
  const info = ETAPA_INFO[os.etapa];

  const acao = async (chave: string, body: Record<string, unknown>, msg?: string) => {
    setOcupado(chave);
    setErro('');
    try {
      const r = await postOficina({ id: os.id, ...body });
      if (r.error) setErro(r.error);
      else onMudou(r.requisicao ? `Requisição #${r.requisicao} criada.` : msg);
    } finally {
      setOcupado('');
    }
  };

  const feitos = os.itens.filter((i) => i.feito).length;
  const linha = (rot: string, val: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 8, fontSize: 13.5 }}>
      <span style={{ minWidth: 130, color: 'var(--portal-text-secondary)' }}>{rot}</span>
      <span style={{ color: 'var(--portal-text)', minWidth: 0 }}>{val}</span>
    </div>
  );

  return (
    <Janela largura={680} onFechar={onFechar} titulo={
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {os.rotulo} · {formatarPlaca(os.placa)}
        <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 9px', background: info.fundo, color: info.cor }}>{info.label}</span>
      </span>
    }>
      {os.veiculo && <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)', marginTop: -8 }}>{os.veiculo}</span>}

      {aberta && podeMover && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {proximasEtapas(os.etapa).map((p) => (
            <button key={p} type="button" onClick={() => onMover(p)} style={botao(p === 'cancelada' ? 'secundario' : 'primario')}>
              {p === 'concluida' ? 'Entregar o carro' : p === 'em_oficina' && os.etapa === 'aberta' ? 'Entrar na oficina' : p === 'cancelada' ? 'Cancelar' : ETAPA_INFO[p].label}
            </button>
          ))}
        </div>
      )}
      {aberta && !podeMover && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--portal-text-secondary)' }}>Quem move a OS é o Pós-Vendas.</p>
      )}

      {os.imobiliza && os.entrada_em && (
        <div style={{ padding: '10px 12px', background: os.parado ? '#fee2e2' : 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', fontSize: 13.5, color: os.parado ? '#991b1b' : 'var(--portal-text)', fontWeight: 700 }}>
          {os.parado ? 'Parado há ' : 'Ficou parado '}{fmtParado(os.dias_parado)} · custo estimado {fmtReais(os.custo_parado)}
          <span style={{ fontWeight: 400 }}> (diária de R$ 250)</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 14, color: 'var(--portal-text)', flex: 1 }}>Itens ({feitos} de {os.itens.length} feitos)</strong>
          {aberta && <button type="button" onClick={onIncluir} style={{ ...botao(), minHeight: 32, padding: '5px 10px' }}><Plus size={14} /> Incluir</button>}
        </div>
        {!os.itens.length && <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>Nenhum item. {os.descricao ? '' : 'Inclua o que vai ser feito.'}</span>}
        {os.itens.map((i) => (
          <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--portal-border)', background: i.feito ? '#f0fdf4' : 'var(--portal-bg-input)' }}>
            <button type="button" disabled={!aberta || !podeMover || ocupado === i.id}
              onClick={() => acao(i.id, { acao: 'item', item_id: i.id, feito: !i.feito })}
              aria-label={i.feito ? 'Desmarcar feito' : 'Marcar como feito'}
              style={{ width: 30, height: 30, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${i.feito ? '#15803d' : 'var(--portal-border)'}`, background: i.feito ? '#15803d' : 'transparent', color: '#fefefe', cursor: aberta && podeMover ? 'pointer' : 'default', borderRadius: 0 }}>
              {ocupado === i.id ? <Loader2 size={14} className="animate-spin" /> : i.feito ? <Check size={16} /> : null}
            </button>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--portal-text)' }}>
              {i.descricao}
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--portal-text-secondary)' }}>
                {TIPO_ITEM[i.tipo]}{i.feito && i.feito_por ? ` · feito por ${i.feito_por} em ${fmtDataHora(i.feito_em)}` : ''}
              </span>
            </span>
            {aberta && podeMover && !i.feito && (
              <button type="button" onClick={() => acao(`rm-${i.id}`, { acao: 'remover', item_id: i.id })} aria-label="Tirar da OS" title="Tirar da OS (a pendência continua aberta no carro)"
                style={{ ...botao(), minHeight: 30, padding: 5 }}>
                {ocupado === `rm-${i.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {os.descricao && linha('Observação', os.descricao)}
        {linha('Onde', os.oficina === 'externa' ? `Oficina externa${os.fornecedor ? ` · ${os.fornecedor}` : ''}` : `Oficina própria${os.os_pos ? ` · ${os.os_pos}` : ''}`)}
        {linha('Requisição', os.requisicao ? (
          <a href={`/requisicoes?req=${os.requisicao.id}`} style={{ color: 'var(--portal-text)', fontWeight: 700 }}>
            #{os.requisicao.id} · {os.requisicao.status || '—'}{os.requisicao.valor ? ` · ${fmtReais(os.requisicao.valor)}` : ''} <ExternalLink size={12} />
          </a>
        ) : aberta ? (
          <button type="button" disabled={ocupado === 'req'} onClick={() => acao('req', { acao: 'requisicao' })} style={{ ...botao(), minHeight: 30, padding: '4px 10px' }}>
            {ocupado === 'req' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Criar requisição
          </button>
        ) : '—')}
        {os.entrada_em && linha('Entrada', <>{fmtDataHora(os.entrada_em)} · {fmtKm(os.km_entrada)}{os.foto_entrada && <> · <a href={os.foto_entrada} target="_blank" rel="noreferrer" style={{ color: 'var(--portal-text)' }}>foto</a></>}</>)}
        {os.peca && linha('Peça', <>{os.peca}{os.previsao_peca ? ` · previsão ${fmtData(os.previsao_peca)}` : ''}</>)}
        {os.pronta_em && linha('Pronta', fmtDataHora(os.pronta_em))}
        {os.concluida_em && linha('Entregue', <>{fmtDataHora(os.concluida_em)} · {fmtKm(os.km_saida)} · {os.retirado_por}{os.foto_saida && <> · <a href={os.foto_saida} target="_blank" rel="noreferrer" style={{ color: 'var(--portal-text)' }}>foto</a></>}</>)}
        {os.cancelada_motivo && linha('Cancelada', os.cancelada_motivo)}
        {linha('Aberta', `${fmtDataHora(os.criado_em)}${os.criado_por ? ` por ${os.criado_por}` : ''}`)}
      </div>

      {os.eventos.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)' }}>Histórico ({os.eventos.length})</summary>
          <ol style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--portal-text)' }}>
            {os.eventos.map((e, k) => (
              <li key={k}>
                {fmtDataHora(e.em)} · {e.de && e.de !== e.para ? `${ETAPA_INFO[e.de as EtapaOS]?.label || e.de} → ` : ''}{ETAPA_INFO[e.para as EtapaOS]?.label || e.para}
                {e.quem ? ` · ${e.quem}` : ''}
                {e.detalhe && <span style={{ color: 'var(--portal-text-secondary)' }}> · {descreverDetalhe(e.detalhe)}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
      {erro && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b91c1c', fontWeight: 700 }}>{erro}</p>}
    </Janela>
  );
}

function descreverDetalhe(d: Record<string, unknown>): string {
  const p: string[] = [];
  if (d.km) p.push(fmtKm(Number(d.km)));
  if (d.peca) p.push(`peça: ${d.peca}`);
  if (d.previsao_peca) p.push(`previsão ${fmtData(String(d.previsao_peca))}`);
  if (d.retirado_por) p.push(`retirado por ${d.retirado_por}`);
  if (d.motivo) p.push(`motivo: ${d.motivo}`);
  if (d.requisicao) p.push(`requisição #${d.requisicao}`);
  if (Array.isArray(d.incluidos)) p.push(`incluído: ${d.incluidos.join(', ')}`);
  if (d.removido) p.push(`tirado: ${d.removido}`);
  if (typeof d.itens === 'number') p.push(`${d.itens} item(ns)`);
  return p.join(' · ');
}
