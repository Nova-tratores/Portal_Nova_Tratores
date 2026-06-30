'use client';
// Busca de produto (home do módulo Estoque). Portado de GET / (server.js:11887).
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import CmcChart from '@/components/estoque/CmcChart';
import { Card, InfoGrid, InfoItem, VendaCard, fmtRS } from '@/components/estoque/ui';
import type { BuscarResult, HistoricoPonto } from '@/lib/estoque/types';

const NAV = [
  { href: '/estoque/dashboard', label: '→ Dashboard de Vendas' },
  { href: '/estoque/notas-entrada', label: '→ Notas de Entrada' },
  { href: '/estoque/cadastro-produto', label: '→ Cadastro de Produto' },
  { href: '/estoque/curva-abc', label: '→ Curva ABC' },
  { href: '/estoque/giro-estoque', label: '→ Giro de Estoque' },
  { href: '/estoque/cruzamento-familia', label: '→ Cruzamento por Família' },
];

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444' };

export default function EstoqueBuscaPage() {
  const { userProfile } = useAuth();
  const { temAcesso, pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { contaParam } = useConta();

  const [codigo, setCodigo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<BuscarResult | null>(null);
  const [cmc, setCmc] = useState<HistoricoPonto[] | null>(null);

  const buscar = useCallback(async () => {
    const c = codigo.trim();
    if (!c) return;
    setCarregando(true);
    setErro('');
    setDados(null);
    setCmc(null);
    try {
      const r = await fetch(`/api/estoque/buscar?codigo=${encodeURIComponent(c)}${contaParam}`);
      const d = await r.json();
      if (d.erro) {
        setErro(d.erro);
        return;
      }
      setDados(d as BuscarResult);
      // CMC em paralelo (não bloqueia a renderização dos cards).
      fetch(`/api/estoque/cmc-historico?codigo=${encodeURIComponent(c)}${contaParam}`)
        .then((res) => res.json())
        .then((cd) => {
          if (cd.cmc) setCmc((cd.cmc as Array<{ periodo: string; cmc: number }>).map((p) => ({ periodo: p.periodo, mes: 0, ano: 0, cmc: p.cmc, venda: 0, margem: 0 })));
        })
        .catch(() => {});
    } catch (ex) {
      setErro('Erro: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [codigo, contaParam]);

  if (!permLoading && userProfile && !temAcesso('estoque')) return <SemPermissao />;

  const v = dados?.vendas;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px' }}>
      <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Consulta Estoque Omie</h1>
      <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 18 }}>Consulta produtos, estoque, vendas, compras e CMC</p>

      <div style={{ marginBottom: 18, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {NAV.filter((n) => pode('estoque', n.href.replace('/estoque/', ''))).map((n) => (
          <Link key={n.href} href={n.href} style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>
            {n.label}
          </Link>
        ))}
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
          <Card titulo="Produto">
            <InfoGrid>
              <InfoItem label="Codigo" valor={dados.produto.codigo} />
              <InfoItem label="Descricao" valor={dados.produto.descricao} />
              <InfoItem label="Familia" valor={dados.produto.familia} />
              <InfoItem label="Marca" valor={dados.produto.marca} />
              <InfoItem label="Valor Venda" valor={fmtRS(dados.produto.valor_venda)} tom="h" />
              <InfoItem label="ID Interno" valor={dados.produto.codigo_produto} />
            </InfoGrid>
          </Card>

          <Card titulo="Estoque e Custos">
            <InfoGrid>
              <InfoItem label="CMC" valor={fmtRS(dados.estoque.cmc)} tom="h" />
              <InfoItem label="Saldo" valor={dados.estoque.saldo} tom={parseFloat(String(dados.estoque.saldo)) < 0 ? 'r' : undefined} />
              <InfoItem label="Fisico" valor={dados.estoque.fisico} />
              <InfoItem label="Pendente" valor={dados.estoque.pendente} />
              <InfoItem label="Reservado" valor={dados.estoque.reservado} />
              <InfoItem label="Est.Min" valor={dados.estoque.est_min} />
            </InfoGrid>
          </Card>

          {v && (
            <Card titulo="Vendas por Periodo">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                <VendaCard label="Mes Atual" periodo={v.ma.p} qtd={v.ma.q} atual />
                <VendaCard label="Mes Anterior" periodo={v.mant.p} qtd={v.mant.q} />
                <VendaCard label="Mesmo Mes Ano Ant." periodo={v.maaa.p} qtd={v.maaa.q} />
                <VendaCard label="Mes Ant. Ano Ant." periodo={v.mantaa.p} qtd={v.mantaa.q} />
              </div>
              <div style={{ marginTop: 10 }}>
                {dados.vendasLista.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Data</th><th style={thStyle}>Pedido</th><th style={thStyle}>Cliente</th><th style={thStyle}>Qtd</th><th style={thStyle}>Valor Unit.</th><th style={thStyle}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.vendasLista.map((x, i) => (
                        <tr key={i}>
                          <td style={{ ...tdStyle, color: '#999' }}>{x.data || 'N/D'}</td>
                          <td style={tdStyle}>{x.numero}</td>
                          <td style={tdStyle}>{x.cliente || '-'}</td>
                          <td style={tdStyle}>{x.qtd}</td>
                          <td style={{ ...tdStyle, color: '#16a34a', fontWeight: 600 }}>{fmtRS(x.vu)}</td>
                          <td style={tdStyle}>{fmtRS(x.vt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ color: '#bbb', padding: 12, fontSize: '.8rem', textAlign: 'center' }}>Nenhuma venda faturada encontrada nos ultimos 12 meses.</p>
                )}
              </div>
            </Card>
          )}

          <Card titulo="Variacao do CMC nos ultimos 12 meses">
            {cmc ? <CmcChart dados={cmc} series={['cmc']} altura={220} /> : <p style={{ color: '#bbb', padding: 12, fontSize: '.8rem', textAlign: 'center' }}>Carregando historico de CMC...</p>}
          </Card>

          <Card titulo="Ultimas Compras (Notas de Entrada)">
            {dados.compras.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Data</th><th style={thStyle}>NF</th><th style={thStyle}>Fornecedor</th><th style={thStyle}>Qtd</th><th style={thStyle}>Val.Unit.</th><th style={thStyle}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.compras.map((x, i) => (
                    <tr key={i}>
                      <td style={{ ...tdStyle, color: '#999' }}>{x.data || 'N/D'}</td>
                      <td style={tdStyle}>{x.nf}</td>
                      <td style={tdStyle}>{x.fornecedor || '-'}</td>
                      <td style={tdStyle}>{x.qtd}</td>
                      <td style={{ ...tdStyle, color: '#16a34a', fontWeight: 600 }}>{fmtRS(x.vu)}</td>
                      <td style={tdStyle}>{fmtRS(x.vt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: '#bbb', padding: 12, fontSize: '.8rem', textAlign: 'center' }}>Nenhuma compra encontrada.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
