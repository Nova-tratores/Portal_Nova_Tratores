'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// /marketing/resultados — ações lado a lado: custo, apoio, funil e retorno.
//
// É a tela que responde "vale a pena repetir esta feira?". Todo indicador com
// denominador zero mostra travessão, nunca "Infinity" — o cálculo vem da lib
// pura lib/marketing/roi.ts, testada no vitest.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TIPOS_ACAO, rotulo } from '@/lib/marketing/tipos';
import {
  apiGet, brl, multiplicador, pct, periodoBR, Painel, Kpi, Vazio, AvisoMigracao, Erro, estiloInput,
} from '@/components/marketing/ui';

type Ordem = 'roi' | 'custo' | 'receita' | 'leads' | 'data';

export default function ResultadosPage() {
  const [linhas, setLinhas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [migracao, setMigracao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [fAno, setFAno] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('data');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const q = new URLSearchParams();
      if (fAno) q.set('ano', fAno);
      if (fTipo) q.set('tipo', fTipo);
      const r = await apiGet<any>(`/api/marketing/resultados?${q}`);
      setLinhas(r.resultados ?? []);
    } catch (e: any) {
      if (e?.corpo?.migracaoFaltando) setMigracao(true);
      else setErro(e?.message || 'Não foi possível carregar os resultados.');
    } finally {
      setCarregando(false);
    }
  }, [fAno, fTipo]);

  useEffect(() => { carregar(); }, [carregar]);

  const ordenadas = useMemo(() => {
    const v = [...linhas];
    v.sort((a, b) => {
      if (ordem === 'roi') return (b.roi.roi ?? -1) - (a.roi.roi ?? -1);
      if (ordem === 'custo') return b.roi.custoConfirmado - a.roi.custoConfirmado;
      if (ordem === 'receita') return b.roi.receitaAtribuida - a.roi.receitaAtribuida;
      if (ordem === 'leads') return b.roi.leads - a.roi.leads;
      return String(b.acao.data_inicio ?? '').localeCompare(String(a.acao.data_inicio ?? ''));
    });
    return v;
  }, [linhas, ordem]);

  const totais = useMemo(() => {
    let custo = 0, apoio = 0, receita = 0, leads = 0, vendas = 0;
    for (const l of linhas) {
      custo += l.roi.custoConfirmado;
      apoio += l.roi.apoioRecebido;
      receita += l.roi.receitaAtribuida;
      leads += l.roi.leads;
      vendas += l.roi.vendasN;
    }
    const liquido = custo - apoio;
    return { custo, apoio, receita, leads, vendas, liquido, roi: liquido > 0 ? receita / liquido : null };
  }, [linhas]);

  const anos = useMemo(() => {
    const agora = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => agora + 1 - i);
  }, []);

  if (migracao) return <AvisoMigracao />;

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <Kpi rotulo="Investido" valor={brl(totais.custo)} />
        <Kpi rotulo="Apoio recebido" valor={brl(totais.apoio)} cor="#16a34a" />
        <Kpi rotulo="Custo líquido" valor={brl(totais.liquido)} dica="O que a empresa pôs do próprio bolso." />
        <Kpi rotulo="Receita atribuída" valor={brl(totais.receita)} cor="#16a34a" />
        <Kpi rotulo="Leads" valor={String(totais.leads)} />
        <Kpi rotulo="Vendas" valor={String(totais.vendas)} />
        <Kpi rotulo="Retorno" valor={multiplicador(totais.roi)} cor="#7c3aed" />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <select style={{ ...estiloInput, flex: '0 1 120px' }} value={fAno} onChange={(e) => setFAno(e.target.value)}>
          <option value="">Todo período</option>
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select style={{ ...estiloInput, flex: '0 1 170px' }} value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {TIPOS_ACAO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select style={{ ...estiloInput, flex: '0 1 190px' }} value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
          <option value="data">Mais recentes primeiro</option>
          <option value="roi">Maior retorno</option>
          <option value="receita">Maior receita</option>
          <option value="custo">Maior custo</option>
          <option value="leads">Mais leads</option>
        </select>
      </div>

      {erro && <Erro>{erro}</Erro>}

      {carregando ? (
        <Vazio>Calculando…</Vazio>
      ) : ordenadas.length === 0 ? (
        <Vazio>Nenhuma ação no período.</Vazio>
      ) : (
        <Painel style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1000 }}>
            <thead>
              <tr style={{ background: 'var(--portal-bg)' }}>
                {['Ação', 'Período', 'Investido', 'Apoio', 'Líquido', 'Leads', 'Propostas', 'Vendas', 'Receita', 'Retorno', 'Custo/lead'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: ['Ação', 'Período'].includes(h) ? 'left' : 'right',
                      padding: '9px 10px', fontWeight: 700, color: 'var(--portal-text)',
                      borderBottom: '1px solid var(--portal-border)', whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenadas.map(({ acao, roi }) => (
                <tr key={acao.id} style={{ borderBottom: '1px solid var(--portal-border)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <Link href={`/marketing/${acao.id}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                      {acao.nome}
                    </Link>
                    <div style={{ fontSize: 11, color: 'var(--portal-text-muted, #64748b)' }}>
                      {rotulo(TIPOS_ACAO, acao.tipo)}{acao.cidade ? ` · ${acao.cidade}` : ''}
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>
                    {periodoBR(acao.data_inicio, acao.data_fim)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{brl(roi.custoConfirmado)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#16a34a', whiteSpace: 'nowrap' }}>{brl(roi.apoioRecebido)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{brl(roi.custoLiquido)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--portal-text)' }}>
                    {roi.leads}
                    {roi.metaLeadsPercent !== null && (
                      <span style={{ fontSize: 11, color: 'var(--portal-text-muted, #64748b)' }}> ({pct(roi.metaLeadsPercent)})</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--portal-text)' }}>{roi.propostasN}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--portal-text)' }}>{roi.vendasN}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{brl(roi.receitaAtribuida)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap' }}>{multiplicador(roi.roi)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>
                    {roi.custoPorLead === null ? '—' : brl(roi.custoPorLead)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Painel>
      )}

      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
        Travessão significa indicador sem base de cálculo — por exemplo, retorno de uma ação cujo
        custo líquido é zero porque a fábrica cobriu tudo.
      </div>
    </div>
  );
}
