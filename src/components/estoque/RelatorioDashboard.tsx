'use client';

// Relatório imprimível do Dashboard de Vendas (/estoque/dashboard).
//
// O botão abre uma janela para escolher as seções; "Imprimir" usa o diálogo do
// navegador (A4 deitado — dá para "Salvar como PDF" ali mesmo). O conteúdo é
// montado num portal no <body> que só aparece no papel: na impressão, todo o
// resto da página some (ver <style> abaixo). Os gráficos têm largura fixa e
// sem animação — escondido na tela, um ResponsiveContainer mediria 0 px.
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type RelView = 'empilhado' | 'agrupado' | 'pct';
export type RelCustoPos = 'sobre' | 'sob';
export type RelMetrica = 'venda' | 'custo' | 'margem';

export interface RelCategoria {
  key?: string;
  nome: string;
  cardType: string;
  valorAtual: number;
  custoAtual: number;
  margemAtual: number;
  mesAnteriorValor: number;
  mesAnteriorCusto: number;
  anoAnteriorValor: number;
  anoAnteriorCusto: number;
  custoServicosOk?: boolean;
  unidades?: number;
  unidadesMesAnt?: number;
  unidadesAnoAnt?: number;
  valorNota?: number;
  valorInterno?: number;
  valorInternoRetorno?: number;
  valorInternoPuro?: number;
  valorHR?: number;
  valorKM?: number;
  valorOutros?: number;
}

export interface RelPonto {
  label: string;
  parcial?: boolean;
  pecasOficina: number;
  pecasBalcao: number;
  servicos: number;
  custoPecasOficina: number;
  custoPecasBalcao: number;
  custoServicos: number | null;
  compras: number;
  maquinas: number;
  maquinasUn: number;
}

export interface RelDados {
  periodo: string;
  modo?: 'mes' | 'ano';
  ehMesCorrente: boolean;
  diaCorte?: number | null;
  categorias: RelCategoria[];
  maquinasYTD: { unidades: number; receita: number };
  ano: number;
  mes: number;
}

type Secao = 'resumo' | 'categorias' | 'decomp' | 'grafico' | 'mensal' | 'maqResumo' | 'maqGrafico' | 'maqMensal';

const SECOES: Array<{ id: Secao; rotulo: string; grupo: 'Peças + Serviços' | 'Máquinas' }> = [
  { id: 'resumo', rotulo: 'Resumo (venda, custo, margem e comparativos)', grupo: 'Peças + Serviços' },
  { id: 'categorias', rotulo: 'Peças por categoria', grupo: 'Peças + Serviços' },
  { id: 'decomp', rotulo: 'Serviços — decomposição', grupo: 'Peças + Serviços' },
  { id: 'grafico', rotulo: 'Gráfico dos últimos 12 meses', grupo: 'Peças + Serviços' },
  { id: 'mensal', rotulo: 'Tabela mês a mês (12 meses)', grupo: 'Peças + Serviços' },
  { id: 'maqResumo', rotulo: 'Máquinas: resumo e famílias', grupo: 'Máquinas' },
  { id: 'maqGrafico', rotulo: 'Máquinas: gráfico dos últimos 12 meses', grupo: 'Máquinas' },
  { id: 'maqMensal', rotulo: 'Máquinas: tabela mês a mês', grupo: 'Máquinas' },
];

const LS_SECOES = 'estoque-dash-relatorio-secoes';
const LARGURA_GRAFICO = 1000;

const rs = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%');
const varPct = (a: number, b: number): number | null => (b > 0 ? ((a - b) / b) * 100 : null);
const varTxt = (a: number, b: number) => {
  const v = varPct(a, b);
  return v == null ? '—' : (v >= 0 ? '+' : '') + pct(v);
};
const margemPct = (venda: number, custo: number | null) => (custo == null || venda <= 0 ? null : ((venda - custo) / venda) * 100);
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fixNome = (s: string) => s.replace(/\bPecas\b/g, 'Peças').replace(/\bServicos\b/g, 'Serviços');

export default function RelatorioDashboard(props: {
  dados: RelDados;
  tendencia: RelPonto[] | null;
  metrica: RelMetrica;
  contaLabel: string;
  categoriaLabel: string;
  usuario?: string;
  /** Desenha o gráfico Peças+Serviços em largura fixa para o papel. */
  graficoPS: (o: { largura: number; view: RelView; custoPos: RelCustoPos; metrica: RelMetrica }) => ReactNode;
  graficoMaq: (o: { largura: number }) => ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [secoes, setSecoes] = useState<Record<Secao, boolean>>(() => {
    const padrao = { resumo: true, categorias: true, decomp: true, grafico: true, mensal: true, maqResumo: false, maqGrafico: false, maqMensal: false };
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(LS_SECOES) : null;
      return s ? { ...padrao, ...JSON.parse(s) } : padrao;
    } catch { return padrao; }
  });
  const [view, setView] = useState<RelView>('agrupado');
  const [custoPos, setCustoPos] = useState<RelCustoPos>('sobre');
  const [metricaGraf, setMetricaGraf] = useState<RelMetrica>(props.metrica);

  const abrir = () => { setMetricaGraf(props.metrica); setAberto(true); };
  const alternar = (id: Secao) => setSecoes((s) => {
    const n = { ...s, [id]: !s[id] };
    try { localStorage.setItem(LS_SECOES, JSON.stringify(n)); } catch { /* sem storage */ }
    return n;
  });
  const algum = Object.values(secoes).some(Boolean);
  // O título da aba vira o nome sugerido do PDF.
  const imprimir = () => {
    const tituloAntes = document.title;
    document.title = `Dashboard de Vendas - ${props.dados.periodo} - ${props.contaLabel}`;
    const voltar = () => { document.title = tituloAntes; window.removeEventListener('afterprint', voltar); };
    window.addEventListener('afterprint', voltar);
    window.print();
  };

  return (
    <>
      <button onClick={abrir} title="Escolher o que entra e imprimir (ou salvar em PDF)"
        style={{ padding: '9px 16px', border: '1px solid #111827', background: '#fff', color: '#111827', borderRadius: 8, fontSize: '.9rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        🖨 Imprimir relatório
      </button>

      {aberto && (
        <div onClick={() => setAberto(false)} className="rel-dash-tela"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 22, width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', color: '#111827' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.15rem' }}>Imprimir relatório</h2>
            <div style={{ fontSize: '.88rem', color: '#6b7280', marginBottom: 14 }}>
              {props.dados.periodo} · {props.contaLabel} · categoria: {props.categoriaLabel}. Sai em A4 deitado; no diálogo do navegador dá para escolher “Salvar como PDF”.
            </div>
            {(['Peças + Serviços', 'Máquinas'] as const).map((g) => (
              <div key={g} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#9ca3af', marginBottom: 6 }}>{g}</div>
                {SECOES.filter((s) => s.grupo === g).map((s) => (
                  <label key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.95rem', padding: '3px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={secoes[s.id]} onChange={() => alternar(s.id)} /> {s.rotulo}
                  </label>
                ))}
              </div>
            ))}
            {secoes.grafico && (
              <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginTop: 4, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#9ca3af' }}>Gráfico Peças + Serviços</div>
                <Escolha rotulo="Mostrar" valor={metricaGraf} onChange={(v) => setMetricaGraf(v as RelMetrica)} opcoes={[['venda', 'Venda'], ['custo', 'Custo × venda'], ['margem', 'Margem']]} />
                <Escolha rotulo="Barras" valor={view} onChange={(v) => setView(v as RelView)} opcoes={[['agrupado', 'Agrupado'], ['empilhado', 'Empilhado'], ['pct', '% Mix']]} />
                {metricaGraf === 'custo' && view !== 'pct' && (
                  <Escolha rotulo="Custo" valor={custoPos} onChange={(v) => setCustoPos(v as RelCustoPos)} opcoes={[['sobre', 'Sobre a venda'], ['sob', 'Sob a venda']]} />
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setAberto(false)} style={{ padding: '9px 16px', border: '1px solid #e0e0e0', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={imprimir} disabled={!algum}
                style={{ padding: '9px 18px', border: 'none', background: algum ? '#111827' : '#9ca3af', color: '#fff', borderRadius: 8, cursor: algum ? 'pointer' : 'default', fontWeight: 700 }}>
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Só existe (e só aparece no papel) enquanto a janela está aberta. */}
      {aberto && createPortal(
        <div className="rel-dash-root">
          <style>{`
            .rel-dash-root { display: none; }
            @media print {
              @page { size: A4 landscape; margin: 9mm; }
              body > *:not(.rel-dash-root) { display: none !important; }
              .rel-dash-root { display: block !important; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; }
              .rel-dash-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .rel-dash-root .rel-secao { margin-bottom: 14px; }
              .rel-dash-root .rel-bloco { break-inside: avoid; page-break-inside: avoid; }
              .rel-dash-root h2 { break-after: avoid; page-break-after: avoid; }
              .rel-dash-root tr { break-inside: avoid; page-break-inside: avoid; }
              .rel-dash-root thead { display: table-header-group; }
              .rel-dash-root table { border-collapse: collapse; width: 100%; }
              .rel-dash-root th, .rel-dash-root td { border-bottom: 1px solid #e5e7eb; padding: 3px 6px; text-align: right; white-space: nowrap; }
              .rel-dash-root th { background: #f3f4f6; font-weight: 700; color: #374151; }
              .rel-dash-root th:first-child, .rel-dash-root td:first-child { text-align: left; }
              .rel-dash-root tr.rel-total td { font-weight: 700; border-top: 1.5px solid #111827; }
              .rel-dash-root h2 { font-size: 12.5px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .4px; border-left: 3px solid #111827; padding-left: 6px; }
            }
          `}</style>
          <Conteudo {...props} secoes={secoes} view={view} custoPos={custoPos} metricaGraf={metricaGraf} />
        </div>,
        document.body,
      )}
    </>
  );
}

function Escolha({ rotulo, valor, onChange, opcoes }: { rotulo: string; valor: string; onChange: (v: string) => void; opcoes: Array<[string, string]> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: '.88rem', color: '#6b7280', width: 64 }}>{rotulo}</span>
      {opcoes.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          style={{ padding: '5px 11px', border: '1px solid', borderColor: valor === v ? '#111827' : '#e0e0e0', background: valor === v ? '#111827' : '#fff', color: valor === v ? '#fff' : '#666', borderRadius: 7, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>{l}</button>
      ))}
    </div>
  );
}

function Conteudo({ dados, tendencia, contaLabel, categoriaLabel, usuario, graficoPS, graficoMaq, secoes, view, custoPos, metricaGraf }: {
  dados: RelDados; tendencia: RelPonto[] | null; contaLabel: string; categoriaLabel: string; usuario?: string;
  graficoPS: (o: { largura: number; view: RelView; custoPos: RelCustoPos; metrica: RelMetrica }) => ReactNode;
  graficoMaq: (o: { largura: number }) => ReactNode;
  secoes: Record<Secao, boolean>; view: RelView; custoPos: RelCustoPos; metricaGraf: RelMetrica;
}) {
  const cats = dados.categorias;
  const get = (t: string) => cats.find((c) => c.cardType === t);
  const cPecas = get('totalPecas');
  const cServ = get('servico');
  const cComprei = get('compras');
  const cGeral = get('totalGeral');
  const cMaq = get('totalMaquinas');
  const ehAno = dados.modo === 'ano';
  const servOk = !!cServ?.custoServicosOk;
  const agora = new Date();
  const geradoEm = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Linha do resumo: venda, custo, margem e comparativos (venda) do card.
  const linha = (rotulo: string, c: RelCategoria | undefined, custoConhecido = true, soVenda = false) => {
    if (!c) return null;
    const custo = soVenda ? null : custoConhecido ? c.custoAtual : null;
    return (
      <tr key={rotulo}>
        <td>{rotulo}</td>
        <td>{rs(c.valorAtual)}</td>
        <td>{soVenda ? '' : rs(custo)}</td>
        <td>{soVenda || custo == null ? (soVenda ? '' : '—') : rs(c.valorAtual - custo)}</td>
        <td>{soVenda ? '' : pct(margemPct(c.valorAtual, custo))}</td>
        {!ehAno && <td>{rs(c.mesAnteriorValor)}</td>}
        {!ehAno && <td>{varTxt(c.valorAtual, c.mesAnteriorValor)}</td>}
        <td>{rs(c.anoAnteriorValor)}</td>
        <td>{varTxt(c.valorAtual, c.anoAnteriorValor)}</td>
      </tr>
    );
  };
  const ps: RelCategoria | undefined = cPecas && cServ ? {
    nome: 'Peças + Serviços', cardType: 'ps',
    valorAtual: cPecas.valorAtual + cServ.valorAtual,
    custoAtual: cPecas.custoAtual + cServ.custoAtual,
    margemAtual: 0,
    mesAnteriorValor: cPecas.mesAnteriorValor + cServ.mesAnteriorValor,
    mesAnteriorCusto: 0,
    anoAnteriorValor: cPecas.anoAnteriorValor + cServ.anoAnteriorValor,
    anoAnteriorCusto: 0,
  } : undefined;

  const pecasCats = cats.filter((c) => c.cardType === 'produto');
  const totalPecasVenda = cPecas?.valorAtual ?? pecasCats.reduce((s, c) => s + c.valorAtual, 0);
  const maqFamilias = cats.filter((c) => c.cardType === 'maquina' && ((c.unidades ?? 0) > 0 || c.valorAtual > 0)).sort((a, b) => b.valorAtual - a.valorAtual);

  const cabComparativos = (
    <>
      {!ehAno && <th>Mês anterior</th>}
      {!ehAno && <th>Δ mês</th>}
      <th>{ehAno ? 'Ano anterior' : 'Mesmo mês ano ant.'}</th>
      <th>Δ ano</th>
    </>
  );

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: '2px solid #111827', paddingBottom: 8, marginBottom: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Logo_Nova.png" alt="" style={{ height: 34 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Dashboard de Vendas — {dados.periodo}</div>
          <div style={{ color: '#4b5563' }}>
            Empresa: <b>{contaLabel}</b> · Categoria de peças: <b>{categoriaLabel}</b>
            {dados.ehMesCorrente && <> · <b style={{ color: '#b45309' }}>{ehAno ? 'ano em andamento' : `mês em andamento${dados.diaCorte ? ` (até dia ${dados.diaCorte})` : ''}`}</b></>}
          </div>
        </div>
        <div style={{ textAlign: 'right', color: '#6b7280' }}>
          Gerado em {geradoEm}{usuario ? <><br />por {usuario}</> : null}
        </div>
      </div>

      {secoes.resumo && (
        <div className="rel-secao rel-bloco">
          <h2>Resumo do período</h2>
          <table>
            <thead><tr><th /><th>Venda</th><th>Custo</th><th>Margem</th><th>Margem %</th>{cabComparativos}</tr></thead>
            <tbody>
              {linha('Peças + Serviços', ps, servOk)}
              {linha('Total Peças', cPecas)}
              {linha('Serviços', cServ, servOk)}
              {linha('Entradas de Peças (NF)', cComprei, true, true)}
              {cGeral && <tr className="rel-total"><td>Total Geral (serviços + peças)</td><td>{rs(cGeral.valorAtual)}</td><td>{servOk ? rs(cGeral.custoAtual) : '—'}</td><td>{servOk ? rs(cGeral.valorAtual - cGeral.custoAtual) : '—'}</td><td>{servOk ? pct(margemPct(cGeral.valorAtual, cGeral.custoAtual)) : '—'}</td>{!ehAno && <td>{rs(cGeral.mesAnteriorValor)}</td>}{!ehAno && <td>{varTxt(cGeral.valorAtual, cGeral.mesAnteriorValor)}</td>}<td>{rs(cGeral.anoAnteriorValor)}</td><td>{varTxt(cGeral.valorAtual, cGeral.anoAnteriorValor)}</td></tr>}
            </tbody>
          </table>
          <div style={{ color: '#6b7280', marginTop: 4 }}>
            Custo de peças = CMC (custo médio) × quantidade vendida. Custo de serviços = Painel Omie (comissão, despesas, frota, RH e custo real das OS internas){servOk ? '' : ' — indisponível na hora do relatório (“—”)'}. Comparativos pela venda. A categoria escolhida vale para os valores de peças; o gráfico e a tabela mês a mês trazem todas as peças.
          </div>
        </div>
      )}

      {secoes.categorias && pecasCats.length > 0 && (
        <div className="rel-secao">
          <h2>Peças por categoria</h2>
          <table>
            <thead><tr><th>Categoria</th><th>Venda</th><th>% do total</th><th>Custo</th><th>Margem</th><th>Margem %</th>{cabComparativos}</tr></thead>
            <tbody>
              {pecasCats.map((c) => (
                <tr key={c.key || c.nome}>
                  <td>{fixNome(c.nome)}</td>
                  <td>{rs(c.valorAtual)}</td>
                  <td>{pct(totalPecasVenda > 0 ? (c.valorAtual / totalPecasVenda) * 100 : null)}</td>
                  <td>{rs(c.custoAtual)}</td>
                  <td>{rs(c.valorAtual - c.custoAtual)}</td>
                  <td>{pct(margemPct(c.valorAtual, c.custoAtual))}</td>
                  {!ehAno && <td>{rs(c.mesAnteriorValor)}</td>}
                  {!ehAno && <td>{varTxt(c.valorAtual, c.mesAnteriorValor)}</td>}
                  <td>{rs(c.anoAnteriorValor)}</td>
                  <td>{varTxt(c.valorAtual, c.anoAnteriorValor)}</td>
                </tr>
              ))}
              {cPecas && <tr className="rel-total"><td>Total Peças</td><td>{rs(cPecas.valorAtual)}</td><td>100%</td><td>{rs(cPecas.custoAtual)}</td><td>{rs(cPecas.valorAtual - cPecas.custoAtual)}</td><td>{pct(margemPct(cPecas.valorAtual, cPecas.custoAtual))}</td>{!ehAno && <td>{rs(cPecas.mesAnteriorValor)}</td>}{!ehAno && <td>{varTxt(cPecas.valorAtual, cPecas.mesAnteriorValor)}</td>}<td>{rs(cPecas.anoAnteriorValor)}</td><td>{varTxt(cPecas.valorAtual, cPecas.anoAnteriorValor)}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {secoes.decomp && cServ && (
        <div className="rel-secao rel-bloco" style={{ maxWidth: 520 }}>
          <h2>Serviços — decomposição</h2>
          <table>
            <tbody>
              {cServ.valorHR != null && <tr><td>HR (com nota)</td><td>{rs(cServ.valorHR)}</td></tr>}
              {cServ.valorHR != null && <tr><td>KM (com nota)</td><td>{rs(cServ.valorKM || 0)}</td></tr>}
              {cServ.valorHR != null && <tr><td>Outros (com nota)</td><td>{rs(cServ.valorOutros || 0)}</td></tr>}
              {cServ.valorHR == null && cServ.valorNota != null && <tr><td>Com nota</td><td>{rs(cServ.valorNota)}</td></tr>}
              <tr className="rel-total"><td>Receita de serviços</td><td>{rs(cServ.valorAtual)}</td></tr>
              {cServ.valorInternoRetorno != null && <tr><td style={{ color: '#6b7280' }}>Interno c/ retorno (não somado)</td><td style={{ color: '#6b7280' }}>{rs(cServ.valorInternoRetorno)}</td></tr>}
              {cServ.valorInternoPuro != null
                ? <tr><td style={{ color: '#6b7280' }}>Interno puro (não somado)</td><td style={{ color: '#6b7280' }}>{rs(cServ.valorInternoPuro)}</td></tr>
                : cServ.valorInterno != null && <tr><td style={{ color: '#6b7280' }}>Interno (não somado)</td><td style={{ color: '#6b7280' }}>{rs(cServ.valorInterno)}</td></tr>}
              {servOk && <tr><td>Custo dos serviços (Painel Omie)</td><td>{rs(cServ.custoAtual)}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {secoes.grafico && tendencia && tendencia.length > 0 && (
        <div className="rel-secao rel-bloco">
          <h2>Peças + Serviços — {metricaGraf === 'custo' ? 'custo × venda' : metricaGraf === 'margem' ? 'margem' : 'faturamento'} — últimos 12 meses</h2>
          {graficoPS({ largura: LARGURA_GRAFICO, view, custoPos, metrica: metricaGraf })}
        </div>
      )}

      {secoes.mensal && tendencia && tendencia.length > 0 && (
        <div className="rel-secao">
          <h2>Peças + Serviços — mês a mês</h2>
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Peças Oficina</th><th>Custo</th>
                <th>Peças Balcão</th><th>Custo</th>
                <th>Serviços</th><th>Custo</th>
                <th>Total venda</th><th>Total custo</th><th>Margem</th><th>Margem %</th><th>Entradas (NF)</th>
              </tr>
            </thead>
            <tbody>
              {tendencia.map((p) => {
                const tv = p.pecasOficina + p.pecasBalcao + p.servicos;
                const semServ = p.custoServicos == null;
                const tc = p.custoPecasOficina + p.custoPecasBalcao + (p.custoServicos ?? 0);
                return (
                  <tr key={p.label}>
                    <td>{p.label}{p.parcial ? ' (parcial)' : ''}</td>
                    <td>{rs(p.pecasOficina)}</td><td>{rs(p.custoPecasOficina)}</td>
                    <td>{rs(p.pecasBalcao)}</td><td>{rs(p.custoPecasBalcao)}</td>
                    <td>{rs(p.servicos)}</td><td>{semServ ? '—' : rs(p.custoServicos)}</td>
                    <td>{rs(tv)}</td><td>{semServ ? '—' : rs(tc)}</td>
                    <td>{semServ ? '—' : rs(tv - tc)}</td><td>{semServ ? '—' : pct(margemPct(tv, tc))}</td>
                    <td>{rs(p.compras)}</td>
                  </tr>
                );
              })}
              {(() => {
                const s = (f: (p: RelPonto) => number) => tendencia.reduce((a, p) => a + f(p), 0);
                const semServ = tendencia.some((p) => p.custoServicos == null);
                const tv = s((p) => p.pecasOficina + p.pecasBalcao + p.servicos);
                const tc = s((p) => p.custoPecasOficina + p.custoPecasBalcao + (p.custoServicos ?? 0));
                return (
                  <tr className="rel-total">
                    <td>Total 12 meses</td>
                    <td>{rs(s((p) => p.pecasOficina))}</td><td>{rs(s((p) => p.custoPecasOficina))}</td>
                    <td>{rs(s((p) => p.pecasBalcao))}</td><td>{rs(s((p) => p.custoPecasBalcao))}</td>
                    <td>{rs(s((p) => p.servicos))}</td><td>{semServ ? '—' : rs(s((p) => p.custoServicos ?? 0))}</td>
                    <td>{rs(tv)}</td><td>{semServ ? '—' : rs(tc)}</td>
                    <td>{semServ ? '—' : rs(tv - tc)}</td><td>{semServ ? '—' : pct(margemPct(tv, tc))}</td>
                    <td>{rs(s((p) => p.compras))}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}

      {secoes.maqResumo && cMaq && (
        <div className="rel-secao">
          <h2>Máquinas — {dados.periodo}</h2>
          <table>
            <thead><tr><th>Família</th><th>Unidades</th><th>Faturamento</th><th>Ticket médio</th>{!ehAno && <th>Un. mês ant.</th>}{!ehAno && <th>Δ mês (R$)</th>}<th>Un. ano ant.</th><th>Δ ano (R$)</th></tr></thead>
            <tbody>
              {maqFamilias.map((c) => (
                <tr key={c.nome}>
                  <td>{c.nome}</td>
                  <td>{(c.unidades ?? 0).toLocaleString('pt-BR')}</td>
                  <td>{rs(c.valorAtual)}</td>
                  <td>{(c.unidades ?? 0) > 0 ? rs(c.valorAtual / (c.unidades ?? 1)) : '—'}</td>
                  {!ehAno && <td>{(c.unidadesMesAnt ?? 0).toLocaleString('pt-BR')}</td>}
                  {!ehAno && <td>{varTxt(c.valorAtual, c.mesAnteriorValor)}</td>}
                  <td>{(c.unidadesAnoAnt ?? 0).toLocaleString('pt-BR')}</td>
                  <td>{varTxt(c.valorAtual, c.anoAnteriorValor)}</td>
                </tr>
              ))}
              <tr className="rel-total">
                <td>Total</td>
                <td>{(cMaq.unidades ?? 0).toLocaleString('pt-BR')}</td>
                <td>{rs(cMaq.valorAtual)}</td>
                <td>{(cMaq.unidades ?? 0) > 0 ? rs(cMaq.valorAtual / (cMaq.unidades ?? 1)) : '—'}</td>
                {!ehAno && <td>{(cMaq.unidadesMesAnt ?? 0).toLocaleString('pt-BR')}</td>}
                {!ehAno && <td>{varTxt(cMaq.valorAtual, cMaq.mesAnteriorValor)}</td>}
                <td>{(cMaq.unidadesAnoAnt ?? 0).toLocaleString('pt-BR')}</td>
                <td>{varTxt(cMaq.valorAtual, cMaq.anoAnteriorValor)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ color: '#6b7280', marginTop: 4 }}>
            Acumulado no ano (jan–{ehAno ? 'dez' : MESES_CURTO[dados.mes - 1] || ''} {dados.ano}): {dados.maquinasYTD.unidades.toLocaleString('pt-BR')} máquinas · {rs(dados.maquinasYTD.receita)}
          </div>
        </div>
      )}

      {secoes.maqGrafico && tendencia && tendencia.length > 0 && (
        <div className="rel-secao rel-bloco">
          <h2>Máquinas — faturamento e unidades — últimos 12 meses</h2>
          {graficoMaq({ largura: LARGURA_GRAFICO })}
        </div>
      )}

      {secoes.maqMensal && tendencia && tendencia.length > 0 && (
        <div className="rel-secao" style={{ maxWidth: 560 }}>
          <h2>Máquinas — mês a mês</h2>
          <table>
            <thead><tr><th>Mês</th><th>Unidades</th><th>Faturamento</th><th>Ticket médio</th></tr></thead>
            <tbody>
              {tendencia.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}{p.parcial ? ' (parcial)' : ''}</td>
                  <td>{p.maquinasUn.toLocaleString('pt-BR')}</td>
                  <td>{rs(p.maquinas)}</td>
                  <td>{p.maquinasUn > 0 ? rs(p.maquinas / p.maquinasUn) : '—'}</td>
                </tr>
              ))}
              <tr className="rel-total">
                <td>Total 12 meses</td>
                <td>{tendencia.reduce((s, p) => s + p.maquinasUn, 0).toLocaleString('pt-BR')}</td>
                <td>{rs(tendencia.reduce((s, p) => s + p.maquinas, 0))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
