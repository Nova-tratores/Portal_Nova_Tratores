'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// /marketing/custos — investimento de marketing consolidado, de todas as ações.
//
// Responde "quanto a empresa gastou com marketing neste ano e em quê", que é a
// pergunta que hoje ninguém consegue responder sem abrir planilha.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { CATEGORIAS_CUSTO, ORIGENS_CUSTO, TIPOS_ACAO, rotulo } from '@/lib/marketing/tipos';
import { totaisCusto, rankingCategorias, divergente, parseValorMisto } from '@/lib/marketing/custos';
import {
  apiGet, brl, dataBR, Painel, Titulo, Kpi, Vazio, AvisoMigracao, Erro, estiloInput, ROSA,
} from '@/components/marketing/ui';

export default function CustosGeraisPage() {
  const [custos, setCustos] = useState<any[]>([]);
  const [acoes, setAcoes] = useState<Record<string, any>>({});
  const [carregando, setCarregando] = useState(true);
  const [migracao, setMigracao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [fAno, setFAno] = useState('');
  const [fCategoria, setFCategoria] = useState('');
  const [fAcao, setFAcao] = useState('');

  const carregar = useCallback(async () => {
    try {
      const r = await apiGet<any>('/api/marketing/custos');
      setCustos(r.itens ?? []);
      setAcoes(r.acoes ?? {});
    } catch (e: any) {
      if (e?.corpo?.migracaoFaltando) setMigracao(true);
      else setErro(e?.message || 'Não foi possível carregar os custos.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => custos.filter((c) => {
    if (fCategoria && c.categoria !== fCategoria) return false;
    if (fAcao && c.acao_id !== fAcao) return false;
    if (fAno) {
      const ref = c.data || acoes[c.acao_id]?.data_inicio || c.criado_em;
      if (!ref || String(ref).slice(0, 4) !== fAno) return false;
    }
    return true;
  }), [custos, fCategoria, fAcao, fAno, acoes]);

  const t = totaisCusto(lista as any);
  const categorias = rankingCategorias(t.porCategoria);
  const maior = categorias[0]?.valor ?? 0;

  // Por ação, da mais cara pra mais barata.
  const porAcao = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of lista) {
      if (c.status === 'cancelado') continue;
      m[c.acao_id] = (m[c.acao_id] ?? 0) + parseValorMisto(c.valor) * (Number(c.rateio_percent ?? 100) / 100);
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [lista]);

  const anos = useMemo(() => {
    const s = new Set<string>();
    for (const c of custos) {
      const ref = c.data || acoes[c.acao_id]?.data_inicio || c.criado_em;
      if (ref) s.add(String(ref).slice(0, 4));
    }
    return [...s].sort().reverse();
  }, [custos, acoes]);

  if (migracao) return <AvisoMigracao />;

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <Kpi rotulo="Confirmado" valor={brl(t.confirmado)} />
        <Kpi rotulo="Previsto" valor={brl(t.previsto)} cor="#d97706" />
        <Kpi rotulo="Total" valor={brl(t.total)} />
        <Kpi rotulo="Lançamentos" valor={String(lista.length)} />
        <Kpi rotulo="Divergentes" valor={String(t.divergentes)} cor={t.divergentes ? '#dc2626' : undefined} alerta={t.divergentes > 0} dica="Documento de origem mudou de valor depois do lançamento." />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <select style={{ ...estiloInput, flex: '0 1 110px' }} value={fAno} onChange={(e) => setFAno(e.target.value)}>
          <option value="">Todo período</option>
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select style={{ ...estiloInput, flex: '0 1 180px' }} value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {CATEGORIAS_CUSTO.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select style={{ ...estiloInput, flex: '1 1 240px' }} value={fAcao} onChange={(e) => setFAcao(e.target.value)}>
          <option value="">Todas as ações</option>
          {Object.values(acoes).map((a: any) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
      </div>

      {erro && <Erro>{erro}</Erro>}

      {carregando ? (
        <Vazio>Carregando…</Vazio>
      ) : lista.length === 0 ? (
        <Vazio>Nenhum custo lançado ainda.</Vazio>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Painel>
            <Titulo>Por categoria</Titulo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {categorias.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 160, fontSize: 13, color: 'var(--portal-text)' }}>{c.label}</div>
                  <div style={{ flex: 1, height: 16, background: 'var(--portal-bg)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${maior > 0 ? (c.valor / maior) * 100 : 0}%`, height: '100%', background: ROSA }} />
                  </div>
                  <div style={{ width: 120, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>{brl(c.valor)}</div>
                  <div style={{ width: 46, textAlign: 'right', fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>{c.percent.toFixed(0)}%</div>
                </div>
              ))}
            </div>
          </Painel>

          <Painel>
            <Titulo>Por ação</Titulo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {porAcao.map(([id, valor]) => (
                <div key={id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--portal-border)' }}>
                  <Link href={`/marketing/${id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                    {acoes[id]?.nome ?? 'ação'}
                    <span style={{ color: 'var(--portal-text-muted, #64748b)' }}>
                      {' '}· {rotulo(TIPOS_ACAO, acoes[id]?.tipo)}
                    </span>
                  </Link>
                  <b style={{ color: 'var(--portal-text)' }}>{brl(valor)}</b>
                </div>
              ))}
            </div>
          </Painel>

          <Painel style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 800 }}>
              <thead>
                <tr style={{ background: 'var(--portal-bg)' }}>
                  {['Ação', 'Descrição', 'Categoria', 'Fornecedor', 'Data', 'Origem', 'Valor'].map((h) => (
                    <th key={h} style={{ textAlign: h === 'Valor' ? 'right' : 'left', padding: '9px 10px', fontWeight: 700, color: 'var(--portal-text)', borderBottom: '1px solid var(--portal-border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--portal-border)', opacity: c.status === 'cancelado' ? 0.5 : 1 }}>
                    <td style={{ padding: '8px 10px' }}>
                      <Link href={`/marketing/${c.acao_id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                        {acoes[c.acao_id]?.nome ?? '—'}
                      </Link>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--portal-text)' }}>{c.descricao}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--portal-text)' }}>{rotulo(CATEGORIAS_CUSTO, c.categoria)}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--portal-text)' }}>{c.fornecedor || '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{dataBR(c.data)}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>
                      {rotulo(ORIGENS_CUSTO, c.origem)}{c.vinculo_ref ? ` #${c.vinculo_ref}` : ''}
                      {divergente(c) && (
                        <span title={`Origem está em ${brl(c.valor_fonte)}`} style={{ marginLeft: 5, color: '#dc2626', display: 'inline-flex', verticalAlign: 'middle' }}>
                          <TriangleAlert size={13} />
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>
                      {brl(parseValorMisto(c.valor) * (Number(c.rateio_percent ?? 100) / 100))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Painel>
        </div>
      )}
    </div>
  );
}
