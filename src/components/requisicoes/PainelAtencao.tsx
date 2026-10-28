'use client';
// "Precisa da sua atenção" — topo do quadro. Cada cartão é um número que se resolve
// (paradas, sem nota, valor alto, sem fornecedor, duplicadas); clicar filtra o quadro
// por aquelas requisições. Regras em lib/requisicoes/inteligencia.ts.
import React, { useMemo, useState } from 'react';
import { brl, itensAtencao, type ItemAtencao, type Req } from '@/lib/requisicoes/inteligencia';
import { IconeQuadrado } from './visualReq';
import { statusCobranca, temCobranca } from '@/components/pos/CobrancaRequisicao';

const CHAVE_FECHADO = 'req-atencao-fechado';

export default function PainelAtencao({ requisicoes, filtroAtivo, onFiltrar }: {
  requisicoes: Req[];
  /** chave do cartão que está filtrando o quadro agora */
  filtroAtivo: string | null;
  onFiltrar: (item: ItemAtencao | null) => void;
}) {
  const itens = useMemo(() => {
    // Filtro rápido "A cobrar do cliente": cobráveis ainda sem valor cobrado (José, 26/10/2026)
    const aCobrar = requisicoes.filter((r) => temCobranca(r as never) && statusCobranca(r as never) === 'a_cobrar');
    const cobrar: ItemAtencao = {
      chave: 'aCobrar', titulo: 'A cobrar do cliente', icone: 'fa-hand-holding-dollar', cor: '#EA580C',
      explicacao: 'Requisições de OS, Peças ou Serviço de Terceiros sem valor cobrado do cliente. Preencha o valor ou marque Não cobrar com o motivo.',
      ids: aCobrar.map((r) => Number(r.id)), valor: 0,
    };
    return [cobrar, ...itensAtencao(requisicoes, new Date())];
  }, [requisicoes]);
  const [fechado, setFechado] = useState(() => { try { return localStorage.getItem(CHAVE_FECHADO) === '1'; } catch { return false; } });
  const alternar = () => setFechado((v) => { try { localStorage.setItem(CHAVE_FECHADO, v ? '0' : '1'); } catch { /* sem storage */ } return !v; });
  const total = itens.reduce((s, i) => s + i.ids.length, 0);

  return (
    <section style={{ marginBottom: 14 }}>
      <button type="button" onClick={alternar} className="rq-btn" style={{ border: 0, padding: '0 4px', height: 32, background: 'transparent' }}>
        <i className={`fa-solid fa-chevron-${fechado ? 'right' : 'down'}`} style={{ fontSize: 11, color: 'var(--rq-apag)' }} />
        <span style={{ fontSize: 16, fontWeight: 500 }}>Precisa da sua atenção</span>
        <span className="rq-pilula" style={{ ['--c' as any]: total ? '#DC2626' : '#16A34A' }}>{total ? `${total} ${total === 1 ? 'caso' : 'casos'}` : 'tudo em dia'}</span>
      </button>
      {!fechado && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(230px, 100%), 1fr))', gap: 10, marginTop: 8 }}>
          {itens.map((it, i) => {
            const ativo = filtroAtivo === it.chave;
            const vazio = it.ids.length === 0;
            return (
              <div key={it.chave} role="button" tabIndex={vazio ? -1 : 0}
                title={it.explicacao}
                onClick={() => !vazio && onFiltrar(ativo ? null : it)}
                onKeyDown={(e) => { if (!vazio && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onFiltrar(ativo ? null : it); } }}
                className={`rq-card rq-entra ${vazio ? '' : 'clicavel'}`}
                style={{
                  ['--c' as any]: it.cor, animationDelay: `${i * 50}ms`, padding: '13px 15px',
                  opacity: vazio ? 0.55 : 1,
                  ...(ativo ? { borderColor: it.cor, background: `color-mix(in srgb, ${it.cor} 6%, var(--surface, #fefefe))` } : {}),
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <IconeQuadrado icone={it.icone} cor={it.cor} tamanho={36} />
                  <div style={{ minWidth: 0 }}>
                    <div className="rq-num" style={{ fontSize: 20, color: vazio ? 'var(--rq-apag)' : it.cor }}>{it.ids.length}</div>
                    <div className="rq-rot" style={{ lineHeight: 1.25 }}>{it.titulo}</div>
                  </div>
                </div>
                {!vazio && it.valor > 0 && <div className="rq-rot" style={{ marginTop: 7 }}>{brl(it.valor)}{ativo ? ' · filtrando o quadro' : ''}</div>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
