'use client';
// =============================================================================
// /inteligencia-vendas/calculadora — a máquina se paga? (ideias 8, 11, 18)
// Tudo no navegador; a última simulação fica salva só neste aparelho.
// "Imprimir" gera a folha para entregar ao produtor.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer, RotateCcw } from 'lucide-react';
import { calcularROI, PADRAO_ROI, type EntradaROI } from '@/lib/inteligencia-vendas/roi';
import { borda, Botao, brl, Cabecalho, estiloInput, fundo2, GradeKpi, Kpi, mut, num, Pagina, Painel, txt, VERMELHO, Aviso } from './ui';

const KEY = 'iv-calculadora';

type Campo = { k: keyof EntradaROI; rotulo: string; sufixo?: string; ajuda?: string; passo?: number };
const GRUPOS: { titulo: string; campos: Campo[] }[] = [
  { titulo: 'Como ele faz hoje', campos: [
    { k: 'areaHa', rotulo: 'Área trabalhada por ano', sufixo: 'ha', ajuda: 'Some as operações: 300 ha com 2 passadas = 600 ha' },
    { k: 'custoAtualHa', rotulo: 'Custo atual por hectare', sufixo: 'R$/ha', ajuda: 'Quanto paga terceirizando, ou o custo da máquina velha' },
  ] },
  { titulo: 'A máquina nova', campos: [
    { k: 'preco', rotulo: 'Preço da máquina', sufixo: 'R$' },
    { k: 'valorUsado', rotulo: 'Usado na troca', sufixo: 'R$' },
    { k: 'rendimentoHaH', rotulo: 'Rendimento', sufixo: 'ha/h', passo: 0.1 },
    { k: 'consumoLH', rotulo: 'Consumo de diesel', sufixo: 'L/h', passo: 0.5 },
    { k: 'precoDiesel', rotulo: 'Preço do diesel', sufixo: 'R$/L', passo: 0.01 },
    { k: 'operadorHora', rotulo: 'Operador', sufixo: 'R$/h', ajuda: '0 se é o próprio produtor' },
    { k: 'manutencaoPctAno', rotulo: 'Manutenção por ano', sufixo: '% do preço', passo: 0.5 },
    { k: 'vidaUtilAnos', rotulo: 'Vida útil', sufixo: 'anos' },
    { k: 'residualPct', rotulo: 'Valor no fim da vida útil', sufixo: '% do preço' },
  ] },
  { titulo: 'Serviço para vizinhos (opcional)', campos: [
    { k: 'haTerceiros', rotulo: 'Área para terceiros', sufixo: 'ha/ano' },
    { k: 'precoServicoHa', rotulo: 'Preço cobrado', sufixo: 'R$/ha' },
  ] },
  { titulo: 'Financiamento', campos: [
    { k: 'entradaPct', rotulo: 'Entrada', sufixo: '% do preço', ajuda: 'O usado conta como parte da entrada' },
    { k: 'taxaAnualPct', rotulo: 'Taxa de juros', sufixo: '% ao ano', passo: 0.1, ajuda: 'Confira a linha vigente com o banco (Plano Safra / BNDES)' },
    { k: 'prazoAnos', rotulo: 'Prazo', sufixo: 'anos' },
  ] },
];

export default function Calculadora() {
  const sp = useSearchParams();
  const [e, setE] = useState<EntradaROI>(PADRAO_ROI);
  const [cliente, setCliente] = useState('');
  const [maquina, setMaquina] = useState('');

  useEffect(() => {
    let base = PADRAO_ROI;
    try { base = { ...PADRAO_ROI, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* sem storage */ }
    const area = Number(sp?.get('area'));
    // vindo do Plano Safra: "Usar na calculadora" traz a taxa e o prazo da linha escolhida
    const taxa = Number(sp?.get('taxa')), prazo = Number(sp?.get('prazo'));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega a simulação salva e os parâmetros da URL uma vez
    setE({
      ...base, ...(area > 0 ? { areaHa: area } : {}),
      ...(taxa > 0 ? { taxaAnualPct: taxa, financiar: true } : {}), ...(prazo > 0 ? { prazoAnos: prazo } : {}),
    });
    setCliente(sp?.get('cliente') || '');
    if (sp?.get('linha')) setMaquina(`Financiamento: ${sp.get('linha')}`);
  }, [sp]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(e)); } catch { /* sem storage */ } }, [e]);

  const r = useMemo(() => calcularROI(e), [e]);
  const set = (k: keyof EntradaROI, v: unknown) => setE((x) => ({ ...x, [k]: v }));

  return (
    <Pagina>
      <style>{`@media print { .iv-sem-impressao { display: none !important } .iv-folha { break-inside: avoid } }`}</style>
      <div className="iv-sem-impressao">
        <Cabecalho titulo="Calculadora de retorno" sub="Compara como o produtor trabalha hoje com a máquina nova: custo por hectare, economia por ano, parcela e em quanto tempo se paga."
          acoes={<>
            <Botao onClick={() => setE(PADRAO_ROI)}><RotateCcw size={14} /> Valores padrão</Botao>
            <Botao cheio onClick={() => window.print()}><Printer size={14} /> Imprimir para o cliente</Botao>
          </>} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(330px, 100%), 1fr))', gap: 14, alignItems: 'start' }}>
        <div className="iv-sem-impressao" style={{ display: 'grid', gap: 12 }}>
          <Painel titulo="Para quem">
            <div style={{ display: 'grid', gap: 8 }}>
              <input value={cliente} onChange={(x) => setCliente(x.target.value)} placeholder="Nome do produtor" style={estiloInput} />
              <input value={maquina} onChange={(x) => setMaquina(x.target.value)} placeholder="Máquina (ex.: Mahindra 6075 4x4)" style={estiloInput} />
            </div>
          </Painel>
          {GRUPOS.map((g) => (
            <Painel key={g.titulo} titulo={g.titulo} acoes={g.titulo === 'Financiamento' ? (
              <label style={{ fontSize: 13, color: txt, display: 'inline-flex', gap: 5 }}>
                <input type="checkbox" checked={e.financiar} onChange={(x) => set('financiar', x.target.checked)} /> Financiar
              </label>) : null}>
              <div style={{ display: 'grid', gap: 8, opacity: g.titulo === 'Financiamento' && !e.financiar ? 0.45 : 1 }}>
                {g.campos.map((c) => (
                  <label key={c.k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(120px, 150px)', gap: 8, alignItems: 'center', fontSize: 13, color: txt }}>
                    <span>{c.rotulo}{c.ajuda && <div style={{ fontSize: 11.5, color: mut }}>{c.ajuda}</div>}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <input type="number" step={c.passo ?? 1} value={Number(e[c.k]) || 0} onChange={(x) => set(c.k, Number(x.target.value))}
                        style={{ ...estiloInput, width: '100%', textAlign: 'right' }} />
                      <span style={{ fontSize: 11.5, color: mut, whiteSpace: 'nowrap', width: 58 }}>{c.sufixo}</span>
                    </span>
                  </label>
                ))}
                {g.titulo === 'Financiamento' && (
                  <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(120px, 150px)', gap: 8, alignItems: 'center', fontSize: 13, color: txt }}>
                    <span>Parcelas</span>
                    <select value={e.parcelasPorAno} onChange={(x) => set('parcelasPorAno', Number(x.target.value))} style={estiloInput}>
                      <option value={1}>Anuais (safra)</option><option value={2}>Semestrais</option><option value={12}>Mensais</option>
                    </select>
                  </label>
                )}
              </div>
            </Painel>
          ))}
        </div>

        <div className="iv-folha" style={{ display: 'grid', gap: 12 }}>
          <Painel>
            <div style={{ fontSize: 13, color: mut }}>Estudo de viabilidade{cliente ? ' para' : ''}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: txt }}>{cliente || 'Produtor'}{maquina ? ` · ${maquina}` : ''}</div>
            <div style={{ fontSize: 12.5, color: mut, marginTop: 2 }}>
              {num(e.areaHa)} ha/ano · hoje {brl(e.custoAtualHa)}/ha · máquina {brl(e.preco)}{e.valorUsado ? ` (usado ${brl(e.valorUsado)})` : ''}
            </div>
          </Painel>
          <GradeKpi min={150}>
            <Kpi rotulo="Economia por ano" valor={brl(r.economiaAno)} cor={r.economiaAno > 0 ? '#16A34A' : VERMELHO}
              sub={r.receitaTerceirosAno ? `inclui ${brl(r.receitaTerceirosAno)} de serviço` : 'diferença de caixa'} />
            <Kpi rotulo="Se paga em" valor={r.paybackAnos == null ? '—' : `${num(r.paybackAnos, 1)} anos`} cor="#2563EB" sub="sem contar juros" />
            <Kpi rotulo="Custo por ha (nova)" valor={r.custoNovoHa == null ? '—' : brl(r.custoNovoHa)} cor="#7C3AED" sub={`hoje ${brl(e.custoAtualHa)}/ha`} />
            <Kpi rotulo="Horas por ano" valor={r.horasAno == null ? '—' : num(r.horasAno)} cor="#475569" />
          </GradeKpi>
          {e.financiar && (
            <GradeKpi min={150}>
              <Kpi rotulo="Entrada (fora o usado)" valor={brl(r.entrada)} cor="#CA8A04" />
              <Kpi rotulo="Financiado" valor={brl(r.financiado)} cor="#CA8A04" />
              <Kpi rotulo={e.parcelasPorAno === 12 ? 'Parcela mensal' : e.parcelasPorAno === 2 ? 'Parcela semestral' : 'Parcela anual'} valor={brl(r.parcela)} cor="#CA8A04"
                sub={`juros no total ${brl(r.jurosTotais)}`} />
              <Kpi rotulo="Sobra por ano depois da parcela" valor={brl(r.sobraAnoComParcela)} cor={(r.sobraAnoComParcela ?? 0) >= 0 ? '#16A34A' : VERMELHO}
                sub={(r.sobraAnoComParcela ?? 0) >= 0 ? 'a economia paga a parcela' : 'a economia não cobre a parcela'} />
            </GradeKpi>
          )}
          {r.economiaAno <= 0 && <Aviso>Com esses números a máquina custa mais por ano do que o jeito atual. Revise a área, o custo de hoje ou o serviço para terceiros.</Aviso>}
          <Painel titulo="Ano a ano (caixa)">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: fundo2 }}>
                {['Ano', 'Economia', 'Parcelas', 'Caixa do ano', 'Acumulado'].map((h) => <th key={h} style={{ textAlign: h === 'Ano' ? 'left' : 'right', padding: 6, color: txt }}>{h}</th>)}
              </tr></thead>
              <tbody>
                <tr><td style={{ padding: 6, borderBottom: borda, color: mut }}>0</td><td colSpan={3} style={{ padding: 6, borderBottom: borda, color: mut, textAlign: 'right' }}>entrada</td>
                  <td style={{ padding: 6, borderBottom: borda, textAlign: 'right', color: VERMELHO }}>{brl(-r.entrada)}</td></tr>
                {r.fluxo.map((a) => (
                  <tr key={a.ano}>
                    <td style={{ padding: 6, borderBottom: borda, color: txt }}>{a.ano}</td>
                    <td style={{ padding: 6, borderBottom: borda, textAlign: 'right', color: txt }}>{brl(a.economia)}</td>
                    <td style={{ padding: 6, borderBottom: borda, textAlign: 'right', color: txt }}>{a.parcela ? brl(-a.parcela) : '—'}</td>
                    <td style={{ padding: 6, borderBottom: borda, textAlign: 'right', color: txt }}>{brl(a.caixa)}</td>
                    <td style={{ padding: 6, borderBottom: borda, textAlign: 'right', fontWeight: 700, color: a.acumulado >= 0 ? '#16A34A' : VERMELHO }}>{brl(a.acumulado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11.5, color: mut, marginTop: 8 }}>
              No último ano da vida útil entra a venda da máquina ({e.residualPct}% do preço). Estimativa com os números informados;
              taxas e condições de financiamento devem ser confirmadas com o banco.
            </div>
          </Painel>
        </div>
      </div>
    </Pagina>
  );
}
