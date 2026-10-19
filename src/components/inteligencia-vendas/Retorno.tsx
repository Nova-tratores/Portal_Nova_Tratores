'use client';
// =============================================================================
// /inteligencia-vendas/retorno — tudo que está esperando um retorno nosso:
// propostas do portal, negócios do CRM dos vendedores e retornos combinados
// nas visitas. Agrupa por vendedor pra cobrança na reunião.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { ROTULO_MOTIVO, type ItemRetorno, type Motivo } from '@/lib/inteligencia-vendas/retorno';
import { hojeBR } from '@/lib/inteligencia-vendas/normalizar';
import {
  apiGet, Aviso, Botao, BotaoCSV, brl, Cabecalho, Carregando, dataBR, estiloInput, GradeKpi, Kpi, mut, Pagina, Painel, Selo,
  Tabela, txt, VERMELHO, type Coluna,
} from './ui';

const COR_MOTIVO: Record<Motivo, string> = {
  contato_vencido: '#DC2626', validade: '#B91C1C', parada: '#CA8A04', sem_proximo: '#64748B', retorno_visita: '#7C3AED',
};
const ORIGEM: Record<ItemRetorno['origem'], { rotulo: string; cor: string }> = {
  proposta: { rotulo: 'Proposta', cor: '#DC2626' },
  negocio: { rotulo: 'CRM · negócio', cor: '#2563EB' },
  visita: { rotulo: 'CRM · visita', cor: '#7C3AED' },
};

export default function Retorno() {
  const [dados, setDados] = useState<{ itens: ItemRetorno[]; porVendedor: { vendedor: string; itens: number; urgentes: number; valor: number }[] } | null>(null);
  const [erro, setErro] = useState('');
  const [dias, setDias] = useState(15);
  const [motivo, setMotivo] = useState<Motivo | ''>('');
  const [vendedor, setVendedor] = useState('');
  const [origem, setOrigem] = useState('');

  const carregar = useCallback(async (atualizar = false) => {
    try { setDados(await apiGet(`/api/inteligencia-vendas/retorno?dias=${dias}${atualizar ? '&atualizar=1' : ''}`)); setErro(''); }
    catch (e) { setErro((e as Error).message); }
  }, [dias]);
  useEffect(() => { const t = setTimeout(() => carregar(), 0); return () => clearTimeout(t); }, [carregar]);

  const itens = useMemo(() => (dados?.itens ?? []).filter((i) =>
    (!motivo || i.motivo === motivo) && (!vendedor || (i.vendedor || 'Sem vendedor') === vendedor) && (!origem || i.origem === origem)), [dados, motivo, vendedor, origem]);

  const conta = (m: Motivo) => (dados?.itens ?? []).filter((i) => i.motivo === m).length;
  const total = (dados?.itens ?? []).reduce((s, i) => s + i.valor, 0);

  const colunas: Coluna<ItemRetorno>[] = useMemo(() => [
    {
      id: 'g', rotulo: '', largura: 8, valor: (i) => i.gravidade, csv: false,
      render: (i) => <span title={i.gravidade === 3 ? 'Urgente' : ''} style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 9, background: i.gravidade === 3 ? '#DC2626' : i.gravidade === 2 ? '#F59E0B' : '#94A3B8' }} />,
    },
    { id: 'origem', rotulo: 'Origem', valor: (i) => ORIGEM[i.origem].rotulo, render: (i) => <Selo cor={ORIGEM[i.origem].cor}>{ORIGEM[i.origem].rotulo}</Selo> },
    {
      id: 'cliente', rotulo: 'Cliente', valor: (i) => i.cliente,
      render: (i) => <div><div style={{ fontWeight: 700 }}>{i.cliente || '—'}</div><div style={{ fontSize: 11.5, color: mut }}>{i.cidade}</div></div>,
    },
    { id: 'oque', rotulo: 'O quê', valor: (i) => i.oque },
    { id: 'valor', rotulo: 'Valor', direita: true, valor: (i) => i.valor, render: (i) => (i.valor ? brl(i.valor) : '—') },
    { id: 'fase', rotulo: 'Fase', valor: (i) => i.fase },
    {
      id: 'motivo', rotulo: 'Por que está aqui', valor: (i) => `${ROTULO_MOTIVO[i.motivo]} — ${i.detalhe}`,
      render: (i) => <div><Selo cor={COR_MOTIVO[i.motivo]}>{ROTULO_MOTIVO[i.motivo]}</Selo><div style={{ fontSize: 12.5, marginTop: 3 }}>{i.detalhe}</div></div>,
    },
    { id: 'dias', rotulo: 'Dias', direita: true, valor: (i) => i.dias ?? 0, render: (i) => (i.idadeIncerta ? <span title="Data da migração das propostas: pode ser mais antiga">{i.dias}+</span> : i.dias ?? '—') },
    { id: 'vendedor', rotulo: 'Vendedor', valor: (i) => i.vendedor || 'Sem vendedor', render: (i) => i.vendedor || <span style={{ color: VERMELHO, fontWeight: 700 }}>Sem vendedor</span> },
    { id: 'prox', rotulo: 'Próx. contato', valor: (i) => i.proximoContato, render: (i) => dataBR(i.proximoContato) },
    {
      id: 'abrir', rotulo: '', valor: () => '', csv: false,
      render: (i) => i.origem === 'proposta' ? <Link href="/propostas" style={{ color: VERMELHO, fontWeight: 700, fontSize: 12.5 }}>Propostas →</Link> : null,
    },
  ], []);

  return (
    <Pagina>
      <Cabecalho
        titulo="Sem retorno"
        sub="Propostas do portal + negócios e visitas do CRM dos vendedores que estão esperando um retorno nosso."
        acoes={<>
          <label style={{ fontSize: 13, color: txt, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Parada há mais de
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={estiloInput}>
              {[7, 10, 15, 20, 30, 45, 60].map((d) => <option key={d} value={d}>{d} dias</option>)}
            </select>
          </label>
          <Botao onClick={() => carregar(true)}><RefreshCw size={14} /> Atualizar</Botao>
          <BotaoCSV nome={`sem-retorno-${hojeBR()}.csv`} linhas={itens} colunas={colunas} />
        </>}
      />
      {erro && <Aviso cor={VERMELHO}>{erro}</Aviso>}
      {!dados && !erro && <Carregando />}
      {dados && <>
        <GradeKpi min={160}>
          <Kpi rotulo="Na fila" valor={dados.itens.length} sub={brl(total)} ativo={!motivo} onClick={() => setMotivo('')} />
          {(Object.keys(ROTULO_MOTIVO) as Motivo[]).map((m) => (
            <Kpi key={m} rotulo={ROTULO_MOTIVO[m]} valor={conta(m)} cor={COR_MOTIVO[m]} ativo={motivo === m} onClick={() => setMotivo(motivo === m ? '' : m)} />
          ))}
        </GradeKpi>
        {dados.itens.some((i) => i.idadeIncerta) && (
          <Aviso>As propostas antigas foram migradas em 21/08/2026 e ficaram com essa data de criação. Para elas, &quot;dias&quot; aparece com &quot;+&quot;: podem estar paradas há mais tempo.</Aviso>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
          <Painel titulo="Por vendedor" acoes={vendedor ? <Botao onClick={() => setVendedor('')}>Todos</Botao> : null}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {dados.porVendedor.map((v) => (
                <button key={v.vendedor} type="button" onClick={() => setVendedor(vendedor === v.vendedor ? '' : v.vendedor)}
                  style={{
                    textAlign: 'left', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', minWidth: 170,
                    border: vendedor === v.vendedor ? `2px solid ${VERMELHO}` : '1px solid var(--portal-border, #e5e7eb)', background: 'transparent', color: txt,
                  }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{v.vendedor}</div>
                  <div style={{ fontSize: 12, color: mut }}>{v.itens} itens · <b style={{ color: VERMELHO }}>{v.urgentes} urgentes</b> · {brl(v.valor)}</div>
                </button>
              ))}
            </div>
          </Painel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['', 'proposta', 'negocio', 'visita'] as const).map((o) => (
              <Botao key={o} cheio={origem === o} onClick={() => setOrigem(o)}>{o ? ORIGEM[o].rotulo : 'Todas as origens'}</Botao>
            ))}
          </div>
          <Tabela linhas={itens} colunas={colunas} chave={(i) => `${i.origem}-${i.id}`} vazio="Nada esperando retorno com esse filtro." />
        </div>
      </>}
    </Pagina>
  );
}
