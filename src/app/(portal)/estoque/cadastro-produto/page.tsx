'use client';
// Cadastro/Detalhe de produto. Portado de GET /cadastro-produto + /api/produto-detalhe.
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import CmcChart from '@/components/estoque/CmcChart';
import { Card, InfoGrid, InfoItem, fmtRS } from '@/components/estoque/ui';
import type { ProdutoDetalheResult, HistoricoPonto } from '@/lib/estoque/types';

const PERIODOS = [12, 24, 36, 48] as const;

export default function CadastroProdutoPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { contaParam } = useConta();

  const [codigo, setCodigo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<ProdutoDetalheResult | null>(null);
  const [periodo, setPeriodo] = useState<number>(12);
  const [historico, setHistorico] = useState<HistoricoPonto[] | null>(null);

  const carregarHistorico = useCallback(
    async (cod: string, per: number) => {
      try {
        const r = await fetch(`/api/estoque/produto-historico?codigo=${encodeURIComponent(cod)}&periodo=${per}${contaParam}`);
        const d = await r.json();
        if (d.historico) setHistorico(d.historico as HistoricoPonto[]);
      } catch {
        /* ignore */
      }
    },
    [contaParam],
  );

  const buscar = useCallback(async () => {
    const c = codigo.trim();
    if (!c) return;
    setCarregando(true);
    setErro('');
    setDados(null);
    setHistorico(null);
    try {
      const r = await fetch(`/api/estoque/produto-detalhe?codigo=${encodeURIComponent(c)}${contaParam}`);
      const d = await r.json();
      if (d.erro) {
        setErro(d.erro);
        return;
      }
      setDados(d as ProdutoDetalheResult);
      setHistorico((d as ProdutoDetalheResult).historicoProduto);
      setPeriodo(12);
    } catch (ex) {
      setErro('Erro: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [codigo, contaParam]);

  const trocarPeriodo = useCallback(
    (per: number) => {
      setPeriodo(per);
      if (dados) carregarHistorico(dados.produto.codigo, per);
    },
    [dados, carregarHistorico],
  );

  if (!permLoading && userProfile && !temAcesso('estoque')) return <SemPermissao />;

  const c = dados?.custos;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px' }}>
      <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Cadastro de Produto</h1>
      <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 18 }}>Detalhes completos, custos, margens e histórico de CMC</p>

      <div style={{ marginBottom: 18 }}>
        <Link href="/estoque" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Voltar à busca</Link>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && buscar()}
          placeholder="Codigo do produto"
          style={{ padding: '10px 16px', border: '1px solid #e0e0e0', background: '#fff', color: '#333', borderRadius: 10, fontSize: 13, width: 320, outline: 'none' }}
        />
        <button
          onClick={buscar}
          disabled={carregando}
          style={{ padding: '10px 22px', background: carregando ? '#bbb' : '#dc2626', color: '#fff', border: 'none', borderRadius: 10, cursor: carregando ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          {carregando ? 'Buscando...' : 'Buscar'}
        </button>
        <ContaSelector />
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 12 }}>{erro}</div>
      )}

      {dados && (
        <>
          <Card titulo="Identificação">
            <InfoGrid>
              <InfoItem label="Codigo" valor={dados.produto.codigo} />
              <InfoItem label="Descricao" valor={dados.produto.descricao} />
              <InfoItem label="Familia" valor={dados.produto.familia} />
              <InfoItem label="Marca" valor={dados.produto.marca} />
              <InfoItem label="Tipo" valor={dados.produto.tipo || '-'} />
              <InfoItem label="Unidade" valor={dados.produto.unidade || '-'} />
              <InfoItem label="NCM" valor={dados.produto.ncm || '-'} />
              <InfoItem label="EAN" valor={dados.produto.ean || '-'} />
              <InfoItem label="ID Interno" valor={dados.produto.codigo_produto} />
            </InfoGrid>
          </Card>

          <Card titulo="Estoque">
            <InfoGrid>
              <InfoItem label="CMC" valor={fmtRS(dados.estoque.cmc)} tom="h" />
              <InfoItem label="Saldo" valor={dados.estoque.saldo} tom={dados.estoque.saldo < 0 ? 'r' : undefined} />
              <InfoItem label="Fisico" valor={dados.estoque.fisico} />
              <InfoItem label="Pendente" valor={dados.estoque.pendente} />
              <InfoItem label="Reservado" valor={dados.estoque.reservado} />
              <InfoItem label="Est.Min" valor={dados.estoque.est_min} />
            </InfoGrid>
          </Card>

          {c && (
            <Card titulo="Custos e Margens">
              <InfoGrid>
                <InfoItem label="Preço Venda" valor={fmtRS(c.preco_venda)} tom="h" />
                <InfoItem label="Custo Médio (CMC)" valor={fmtRS(c.preco_custo_medio)} />
                <InfoItem label="Última Compra" valor={fmtRS(c.preco_compra)} />
                <InfoItem label="Margem (R$)" valor={fmtRS(c.margem_bruta_rs)} tom={c.margem_bruta_rs >= 0 ? 'h' : 'r'} />
                <InfoItem label="Margem (%)" valor={c.margem_bruta_pct.toFixed(1) + '%'} tom={c.margem_bruta_pct >= 0 ? 'h' : 'r'} />
                <InfoItem label="Últ. Compra (data)" valor={c.ultima_compra_data || '-'} />
                <InfoItem label="Últ. Venda (data)" valor={c.ultima_venda_data || '-'} />
                <InfoItem label="Últ. Venda (valor)" valor={fmtRS(c.ultima_venda_valor)} />
              </InfoGrid>
            </Card>
          )}

          <Card titulo="Histórico: CMC × Venda média × Margem">
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {PERIODOS.map((p) => (
                <button
                  key={p}
                  onClick={() => trocarPeriodo(p)}
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid ' + (periodo === p ? '#dc2626' : '#d1d5db'),
                    background: periodo === p ? '#dc2626' : '#fff',
                    color: periodo === p ? '#fff' : '#555',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {p} meses
                </button>
              ))}
            </div>
            <CmcChart dados={historico || []} altura={280} />
          </Card>
        </>
      )}
    </div>
  );
}
