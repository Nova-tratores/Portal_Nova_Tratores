'use client';
// Antecipações (desconto de duplicatas). Lista os títulos a pagar da categoria
// "Pagamento de Empréstimos" (2.05.03), separando o DESCONTO DE DUPLICATA
// (integração Omie: Votorantim/ERG/OMIE FIDC — o PRINCIPAL da duplicata, não
// juro) dos empréstimos/serviços reais que caem na mesma categoria. Objetivo:
// enxergar o que da conta "Despesas Financeiras" é principal e o que é juro.
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { authHeaders } from '@/lib/auth/client';
import { PaginaFin, CampoFin, Segmentado, BotaoFin, Chip, ChipEmpresa, RodapeGrade } from '@/components/ajustes/omie-fin';

// ---------- tipos ----------
interface Titulo {
  codigo_lancamento: number;
  conta_omie: string;
  fornecedor: string;
  valor: number;
  data_emissao: string | null;
  data_vencimento: string | null;
  data_previsao: string | null;
  status_titulo: string | null;
  numero_nf: string | null;
  chave_nfe: string | null;
  tipo_doc: string | null;
  numero_parcela: string | null;
  grupo: 'desconto' | 'outros';
}
interface Parceiro { nome: string; grupo: string; n: number; valor: number }
interface Payload {
  conta?: string; de?: string; ate?: string;
  titulos?: Titulo[];
  totais?: { desconto: { n: number; valor: number }; outros: { n: number; valor: number }; juros: { valor: number; indisponivel?: boolean } };
  porParceiro?: Parceiro[];
  erro?: string;
}

// ---------- helpers ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return brl.format(Number(n));
}
function fmtData(s?: string | null): string {
  if (!s) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
function isoDefault(offsetMeses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMeses);
  return d.toISOString().slice(0, 10);
}
function inicioAno(): string {
  return new Date().toISOString().slice(0, 4) + '-01-01';
}
// Rótulo amigável do tipo de documento da Omie.
function tipoLabel(t?: string | null): string {
  if (!t) return '—';
  if (t === 'NFE') return 'NF-e';
  if (t === 'NFS' || t === 'NFSE') return 'NFS-e';
  if (t === 'BOL') return 'Boleto';
  if (t === 'CTE') return 'CT-e';
  if (t === '99999') return 'Outros';
  return t;
}

type Filtro = 'desconto' | 'outros' | 'todos';

export default function AntecipacoesPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [de, setDe] = useState(inicioAno());
  const [ate, setAte] = useState(isoDefault(0));
  const [dados, setDados] = useState<Payload | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('desconto');
  const [busca, setBusca] = useState('');
  const [copiado, setCopiado] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const qs = `de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}${contaParam}`;
      const r = await fetch(`/api/ajustes/antecipacoes?${qs}`, { headers: await authHeaders() });
      const d = (await r.json()) as Payload;
      if (d.erro) { setErro(d.erro); setDados(null); return; }
      setDados(d);
    } catch (ex) {
      setErro('Erro de rede: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [de, ate, contaParam]);

  // Recarrega ao montar e ao trocar de conta.
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [conta]);

  const titulos = dados?.titulos || [];
  const t = dados?.totais;

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return titulos.filter((x) => {
      if (filtro !== 'todos' && x.grupo !== filtro) return false;
      if (!termo) return true;
      return (
        x.fornecedor.toLowerCase().includes(termo) ||
        (x.numero_nf || '').toLowerCase().includes(termo) ||
        (x.chave_nfe || '').toLowerCase().includes(termo)
      );
    });
  }, [titulos, filtro, busca]);

  const somaFiltrada = useMemo(() => filtrados.reduce((s, x) => s + x.valor, 0), [filtrados]);
  const parceirosFiltro = useMemo(
    () => (dados?.porParceiro || []).filter((p) => filtro === 'todos' || p.grupo === filtro),
    [dados, filtro],
  );

  const copiarChave = useCallback((cod: number, chave: string) => {
    navigator.clipboard?.writeText(chave).then(() => {
      setCopiado(cod);
      setTimeout(() => setCopiado((c) => (c === cod ? null : c)), 1500);
    }).catch(() => {});
  }, []);

  const exportarCSV = useCallback(() => {
    const sep = ';';
    const cab = ['Grupo', 'Conta', 'Emissão', 'Fornecedor/Parceiro', 'Tipo doc', 'Nº nota', 'Chave NF-e', 'Parcela', 'Vencimento', 'Previsão', 'Status', 'Valor'];
    const linhas = filtrados.map((x) => [
      x.grupo === 'desconto' ? 'Desconto de duplicata' : 'Empréstimo/outros',
      x.conta_omie, fmtData(x.data_emissao), x.fornecedor, tipoLabel(x.tipo_doc),
      x.numero_nf || '', x.chave_nfe || '', x.numero_parcela || '',
      fmtData(x.data_vencimento), fmtData(x.data_previsao), x.status_titulo || '',
      String(x.valor).replace('.', ','),
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(sep));
    const csv = '﻿' + [cab.join(sep), ...linhas].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `antecipacoes_${dados?.conta || 'todas'}_${de}_a_${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtrados, dados, de, ate]);

  if (!permLoading && userProfile && !pode('ajustes', 'antecipacoes')) return <SemPermissao />;

  return (
    <PaginaFin
      titulo="Antecipações"
      sub={<>Desconto de duplicatas × empréstimos na categoria <b>Pagamento de Empréstimos</b></>}
      direita={<ContaSelector />}
      comoLer={<>
        Títulos a pagar da categoria <b>Pagamento de Empréstimos</b> (2.05.03). O <b>desconto de duplicata</b> (integração Omie: Votorantim, ERG, OMIE FIDC) é o
        <b> principal</b> da nota antecipada — não é juro. Os <b>juros</b> aparecem à parte, lidos da conta corrente &quot;Omie Desconto de Duplicatas&quot;.
        O resto da categoria são <b>empréstimos/outros</b> (Bradesco, Itaú, cartão…). Clique num parceiro para filtrar; a coluna Origem mostra a nota descontada (clique na chave para copiar).
        <div style={{ marginTop: 6 }}><Link href="/dre-financeiro/movimentos">Movimentações de CC · aba Antecipações</Link> (juros e líquido por operação) · <Link href="/ajustes">← Ajustes</Link></div>
      </>}
    >
      <div className="ofin-cartao">
        <div className="ofin-filtros">
          <CampoFin titulo="Emissão de" style={{ width: 160 }}><input className="ofin-inp" type="date" value={de} onChange={(e) => setDe(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && carregar()} /></CampoFin>
          <CampoFin titulo="Até" style={{ width: 160 }}><input className="ofin-inp" type="date" value={ate} onChange={(e) => setAte(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && carregar()} /></CampoFin>
          <CampoFin titulo="Grupo">
            <Segmentado<Filtro> valor={filtro} onChange={setFiltro} opcoes={[['desconto', 'Desconto de duplicata'], ['outros', 'Empréstimos/outros'], ['todos', 'Todos']]} />
          </CampoFin>
          <CampoFin titulo="Buscar" style={{ flex: '1 1 240px' }}><input className="ofin-inp" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="fornecedor, nº da nota ou chave…" /></CampoFin>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <BotaoFin variante="prim" icone="fa-magnifying-glass" onClick={carregar} disabled={carregando} style={{ height: 38 }}>{carregando ? 'Carregando…' : 'Buscar'}</BotaoFin>
            <BotaoFin variante="neutro" icone="fa-file-csv" onClick={exportarCSV} disabled={!filtrados.length} style={{ height: 38 }}>Exportar CSV</BotaoFin>
          </div>
        </div>
        {erro && <div className="ofin-filtros-pe"><span className="ofin-msg erro">{erro}</span></div>}
      </div>

      <div className="ofin-kpis">
        <div className="ofin-kpi destaque"><span>Desconto de duplicata (principal)</span><b style={{ color: '#0B6E70' }}>{fmtBRL(t?.desconto.valor)}</b><small>{t?.desconto.n ?? 0} títulos</small></div>
        <div className="ofin-kpi"><span>Empréstimos / outros</span><b style={{ color: '#b45309' }}>{fmtBRL(t?.outros.valor)}</b><small>{t?.outros.n ?? 0} títulos</small></div>
        <div className="ofin-kpi"><span>Juros de antecipação</span><b style={{ color: '#b91c1c' }}>{t?.juros.indisponivel ? '—' : fmtBRL(t?.juros.valor)}</b><small>{t?.juros.indisponivel ? 'sem dados de CC' : 'pagos no período (CC)'}</small></div>
        <div className="ofin-kpi"><span>Total da categoria</span><b>{fmtBRL((t?.desconto.valor || 0) + (t?.outros.valor || 0))}</b><small>Pagamento de Empréstimos</small></div>
      </div>

      {parceirosFiltro.length > 0 && (
        <div className="ofin-pilulas" style={{ marginBottom: 14 }}>
          {parceirosFiltro.slice(0, 12).map((p) => {
            const ativo = busca === p.nome;
            return (
              <button key={p.grupo + p.nome} type="button" className={`ofin-pilula${ativo ? ' ativo' : ''}`} onClick={() => setBusca(ativo ? '' : p.nome)} title={ativo ? 'Tirar o filtro' : 'Filtrar por este parceiro'}>
                {p.nome} <b>{fmtBRL(p.valor)}</b><span className="n">{p.n}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="ofin-cartao">
        <div className="ofin-grade-caixa">
          <table className="ofin-grade">
            <thead>
              <tr><th>Emissão</th><th>Empresa</th><th>Fornecedor / Parceiro</th><th>Origem (nota)</th><th>Parcela</th><th>Vencimento</th><th>Situação</th><th className="num">Valor</th></tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr><td colSpan={8} className="vazio">Carregando…</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={8} className="vazio">Nenhum título nesse filtro/período.</td></tr>
              ) : filtrados.map((x) => (
                <tr key={x.codigo_lancamento}>
                  <td className="apagado nowrap">{fmtData(x.data_emissao)}</td>
                  <td><ChipEmpresa conta={x.conta_omie} /></td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{x.fornecedor}</div>
                    <div style={{ marginTop: 3 }}>{x.grupo === 'desconto' ? <Chip cor="teal">desconto de duplicata</Chip> : <Chip cor="ambar">empréstimo/outros</Chip>}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 12.5 }}><b>{tipoLabel(x.tipo_doc)}</b>{x.numero_nf ? ` nº ${x.numero_nf}` : ''}</div>
                    {x.chave_nfe && (
                      <button type="button" className="ofin-link" onClick={() => copiarChave(x.codigo_lancamento, x.chave_nfe!)} title="Copiar chave NF-e" style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 400, marginTop: 2 }}>
                        {copiado === x.codigo_lancamento ? '✓ copiada' : `${x.chave_nfe.slice(0, 8)}…${x.chave_nfe.slice(-6)} ⧉`}
                      </button>
                    )}
                  </td>
                  <td className="apagado nowrap">{x.numero_parcela || '—'}</td>
                  <td className="nowrap">{fmtData(x.data_vencimento)}</td>
                  <td><Chip cor={/PAGO|LIQUID/i.test(x.status_titulo || '') ? 'verde' : /ATRAS/i.test(x.status_titulo || '') ? 'vermelho' : 'azul'}>{x.status_titulo || '—'}</Chip></td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtBRL(x.valor)}</td>
                </tr>
              ))}
            </tbody>
            {filtrados.length > 0 && !carregando && (
              <tfoot>
                <tr><td colSpan={7} className="num">Total ({filtrados.length})</td><td className="num">{fmtBRL(somaFiltrada)}</td></tr>
              </tfoot>
            )}
          </table>
        </div>
        <RodapeGrade mostrando={filtrados.length} total={titulos.length} dica={<>soma no filtro <b>{fmtBRL(somaFiltrada)}</b></>} />
      </div>
    </PaginaFin>
  );
}
