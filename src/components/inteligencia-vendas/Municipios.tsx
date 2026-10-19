'use client';
// =============================================================================
// /inteligencia-vendas/municipios — "em quais municípios concentrar a venda de
// cada máquina?" IBGE (PAM/PPM) + CAR/crédito rural + a nossa base.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { MunicipioIV } from '@/lib/inteligencia-vendas/municipios';
import { hojeBR } from '@/lib/inteligencia-vendas/normalizar';
import {
  apiGet, Aviso, borda, Botao, BotaoCSV, Cabecalho, Carregando, compacto, fundo2, GradeKpi, Kpi, mut, num, Pagina, Painel, pct,
  Selo, Tabela, txt, VERMELHO, type Coluna,
} from './ui';

const FOCOS: { id: string; rotulo: string; re: RegExp | null; linha: string }[] = [
  { id: '', rotulo: 'Score geral', re: null, linha: '' },
  { id: 'graos', rotulo: 'Grãos → plantadeira / pulverizador', re: /soja|milho|trigo|feij|sorgo|aveia|amendoim/i, linha: 'grãos' },
  { id: 'cana', rotulo: 'Cana → alta potência', re: /cana/i, linha: 'cana' },
  { id: 'perenes', rotulo: 'Café e frutas → fruteiro', re: /caf|laranja|lim|tangerina|abacate|manga|uva|banana/i, linha: 'perenes' },
  { id: 'pecuaria', rotulo: 'Pecuária → vagão / roçadeira', re: null, linha: 'pecuária' },
];

export default function Municipios() {
  const [dados, setDados] = useState<{ municipios: MunicipioIV[]; anoIBGE: string; avisos: string[] } | null>(null);
  const [erro, setErro] = useState('');
  const [todos, setTodos] = useState(false);
  const [foco, setFoco] = useState('');
  const [aberto, setAberto] = useState<MunicipioIV | null>(null);

  const carregar = useCallback(async (atualizar = false) => {
    try { setDados(await apiGet(`/api/inteligencia-vendas/municipios?${todos ? 'todos=1&' : ''}${atualizar ? 'atualizar=1' : ''}`)); setErro(''); }
    catch (e) { setErro((e as Error).message); }
  }, [todos]);
  useEffect(() => { const t = setTimeout(() => carregar(), 0); return () => clearTimeout(t); }, [carregar]);

  const focoAtual = FOCOS.find((x) => x.id === foco)!;
  const areaFoco = useCallback((m: MunicipioIV) => {
    if (foco === 'pecuaria') return m.bovinos || 0;
    if (!focoAtual.re) return m.areaPlantadaHa;
    return m.culturas.filter((c) => focoAtual.re!.test(c.nome)).reduce((s, c) => s + c.ha, 0);
  }, [foco, focoAtual]);

  const lista = useMemo(() => dados?.municipios ?? [], [dados]);
  const tot = useMemo(() => ({
    area: lista.reduce((s, m) => s + m.areaPlantadaHa, 0),
    imoveis: lista.reduce((s, m) => s + (m.imoveis || 0), 0),
    invest: lista.reduce((s, m) => s + (m.invest36m || 0), 0),
    clientes: lista.reduce((s, m) => s + m.clientesComTrator, 0),
  }), [lista]);

  const colunas: Coluna<MunicipioIV>[] = useMemo(() => [
    {
      id: 'foco', rotulo: foco ? (foco === 'pecuaria' ? 'Bovinos' : 'Área da linha') : 'Foco', direita: true,
      valor: (m) => (foco ? areaFoco(m) : m.foco),
      render: (m) => (foco ? <b>{foco === 'pecuaria' ? num(areaFoco(m)) : `${num(areaFoco(m))} ha`}</b>
        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 46, height: 6, borderRadius: 6, background: fundo2, overflow: 'hidden', display: 'inline-block' }}>
            <span style={{ display: 'block', height: '100%', width: `${m.foco}%`, background: VERMELHO }} />
          </span><b>{m.foco}</b></span>),
    },
    {
      id: 'nome', rotulo: 'Município', valor: (m) => m.nome,
      render: (m) => <div><b>{m.nome}</b> <span style={{ color: mut, fontSize: 12 }}>{m.uf}</span>{!m.daLoja && <div><Selo cor="#64748B">fora da lista da loja</Selo></div>}</div>,
    },
    {
      id: 'culturas', rotulo: 'Principais culturas (ha)', valor: (m) => m.culturas.slice(0, 3).map((c) => `${c.nome} ${c.ha}`).join(', '),
      render: (m) => <div style={{ fontSize: 12.5, minWidth: 180 }}>{m.culturas.slice(0, 3).map((c) => `${c.nome} ${compacto(c.ha)}`).join(' · ') || '—'}</div>,
    },
    { id: 'area', rotulo: 'Área plantada', direita: true, valor: (m) => m.areaPlantadaHa, render: (m) => `${compacto(m.areaPlantadaHa)} ha` },
    { id: 'valor', rotulo: 'Produção', direita: true, valor: (m) => m.valorProducaoMil ?? 0, render: (m) => (m.valorProducaoMil ? `R$ ${compacto(m.valorProducaoMil * 1000)}` : '—') },
    { id: 'bov', rotulo: 'Bovinos', direita: true, valor: (m) => m.bovinos ?? 0, render: (m) => compacto(m.bovinos) },
    { id: 'imoveis', rotulo: 'Imóveis CAR', direita: true, valor: (m) => m.imoveis ?? 0, render: (m) => num(m.imoveis) },
    { id: 'credito', rotulo: 'Crédito 36 m', direita: true, valor: (m) => m.credito36m ?? 0, render: (m) => (m.credito36m != null ? `R$ ${compacto(m.credito36m)}` : '—') },
    { id: 'invest', rotulo: 'Investim. 36 m', direita: true, valor: (m) => m.invest36m ?? 0, render: (m) => (m.invest36m != null ? `R$ ${compacto(m.invest36m)}` : '—') },
    { id: 'cli', rotulo: 'Clientes', direita: true, valor: (m) => m.clientes, render: (m) => <span>{m.clientes} <span style={{ color: mut, fontSize: 11.5 }}>({m.clientesAtivos} ativos)</span></span> },
    { id: 'trat', rotulo: 'Com trator nosso', direita: true, valor: (m) => m.clientesComTrator },
    { id: 'pen', rotulo: 'Presença', direita: true, valor: (m) => m.penetracao ?? -1, render: (m) => <span title="clientes com trator nosso ÷ imóveis do CAR">{pct(m.penetracao)}</span> },
    { id: 'prop', rotulo: 'Prop. abertas', direita: true, valor: (m) => m.propostasAbertas },
    { id: 'op', rotulo: 'Oportun.', direita: true, valor: (m) => m.oportunidades },
    { id: 'linhas', rotulo: 'O que vender lá', valor: (m) => m.linhas.join(' / '), render: (m) => <div style={{ fontSize: 12.5, minWidth: 200 }}>{m.linhas.join(' · ')}</div> },
  ], [foco, areaFoco]);

  return (
    <Pagina>
      <Cabecalho
        titulo="Municípios"
        sub={<>Onde concentrar a venda de cada máquina. IBGE {dados?.anoIBGE || ''} (área plantada, valor da produção, rebanho) + CAR e crédito rural do Banco Central + a nossa carteira.</>}
        acoes={<>
          <label style={{ fontSize: 13, color: txt, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
            <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Incluir outras cidades com 5+ clientes
          </label>
          <Botao onClick={() => carregar(true)}><RefreshCw size={14} /> Atualizar</Botao>
          {dados && <BotaoCSV nome={`municipios-${hojeBR()}.csv`} linhas={lista} colunas={colunas} />}
        </>}
      />
      {erro && <Aviso cor={VERMELHO}>{erro}</Aviso>}
      {dados?.avisos.map((a) => <Aviso key={a}>{a}</Aviso>)}
      {!dados && !erro && <Carregando texto="Buscando IBGE, CAR e a carteira…" />}
      {dados && <>
        <GradeKpi>
          <Kpi rotulo="Municípios" valor={lista.length} sub={`${lista.filter((m) => m.daLoja).length} da área da loja`} />
          <Kpi rotulo="Área plantada" valor={`${compacto(tot.area)} ha`} cor="#16A34A" />
          <Kpi rotulo="Imóveis rurais (CAR)" valor={num(tot.imoveis)} cor="#2563EB" />
          <Kpi rotulo="Crédito de investimento 36 m" valor={`R$ ${compacto(tot.invest)}`} cor="#7C3AED" sub="dinheiro que já foi para máquina e benfeitoria" />
          <Kpi rotulo="Clientes com trator nosso" valor={num(tot.clientes)} sub={tot.imoveis ? `${pct(tot.clientes / tot.imoveis)} dos imóveis` : ''} />
        </GradeKpi>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {FOCOS.map((x) => <Botao key={x.id} cheio={foco === x.id} onClick={() => setFoco(x.id)}>{x.rotulo}</Botao>)}
        </div>
        <div style={{ fontSize: 12.5, color: mut, marginBottom: 8 }}>
          <b>Foco</b> = 65% potencial (área plantada, rebanho e crédito de investimento) + 35% espaço (pouca presença nossa). Clique na linha para ver todas as culturas.
        </div>
        <Tabela linhas={lista} colunas={colunas} chave={(m) => String(m.ibge)} onLinha={setAberto}
          ordemInicial={{ id: 'foco', dir: 'desc' }} max={100} />
      </>}
      {aberto && (
        <div onClick={() => setAberto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(620px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
            <Painel titulo={`${aberto.nome} (${aberto.uf}) · foco ${aberto.foco}`} acoes={<button onClick={() => setAberto(null)} aria-label="Fechar" style={{ background: 'none', border: 0, cursor: 'pointer', color: txt }}><X size={18} /></button>}>
              <div style={{ fontSize: 13, color: mut, marginBottom: 8 }}>{aberto.linhas.join(' · ')}</div>
              {aberto.culturas.map((c) => (
                <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: borda, fontSize: 13 }}>
                  <span style={{ width: 170, color: txt }}>{c.nome}</span>
                  <span style={{ flex: 1, height: 8, background: fundo2, borderRadius: 8, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${(100 * c.ha) / (aberto.culturas[0]?.ha || 1)}%`, background: '#16A34A' }} />
                  </span>
                  <span style={{ width: 90, textAlign: 'right', color: txt }}>{num(c.ha)} ha</span>
                </div>
              ))}
              {aberto.culturas.length === 0 && <div style={{ color: mut, fontSize: 13 }}>Sem lavoura registrada no IBGE.</div>}
            </Painel>
          </div>
        </div>
      )}
    </Pagina>
  );
}
