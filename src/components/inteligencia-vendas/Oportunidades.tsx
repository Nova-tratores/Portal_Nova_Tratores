'use client';
// =============================================================================
// /inteligencia-vendas — Oportunidades + buscador (ideias 10, 20 e o cruzamento).
// Uma linha por cliente com movimento. Os cards de regra e as perguntas prontas
// filtram a mesma lista; clique na linha abre a ficha.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import { PERGUNTAS, REGRAS } from '@/lib/inteligencia-vendas/regras';
import { hojeBR, textoNorm } from '@/lib/inteligencia-vendas/normalizar';
import type { ClienteIV, RegraId } from '@/lib/inteligencia-vendas/tipos';
import FichaCliente from './FichaCliente';
import Ficha360 from './Ficha360';
import { colunasVisuais, ESTILO_TABELA_VISUAL } from './colunasVisuais';
import { colunasExecutivas, ESTILO_EXECUTIVA } from './colunasExecutivas';
import FichaExecutiva, { type ModoFicha } from './FichaExecutiva';
import TopoOportunidades, { FaixaResultado, type VarianteTopo } from './TopoOportunidades';
import {
  apiGet, Botao, BotaoCSV, brl, Cabecalho, Carregando, Aviso, dataBR, estiloInput, GradeKpi, Kpi, mut, Pagina, Selo,
  Tabela, tempoDesde, txt, VERMELHO, borda, fundoCard, type Coluna,
} from './ui';

const FILTROS_KEY = 'iv-oportunidades-filtros';
interface Filtros { regra: RegraId | ''; pergunta: string; q: string; cidade: string; vendedor: string; loja: string; soComOportunidade: boolean }
const PADRAO: Filtros = { regra: '', pergunta: '', q: '', cidade: '', vendedor: '', loja: '', soComOportunidade: true };

/** `topo` = versão nova da parte de cima; `ficha` = lista executiva + ficha nova (opções da página de teste). */
export default function Oportunidades({ topo, ficha: modoFicha }: { topo?: VarianteTopo; ficha?: ModoFicha } = {}) {
  const [dados, setDados] = useState<{ clientes: ClienteIV[]; atualizadoEm: number } | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [f, setF] = useState<Filtros>(() => {
    try { return { ...PADRAO, ...JSON.parse(localStorage.getItem(FILTROS_KEY) || '{}') }; } catch { return PADRAO; }
  });
  const [ficha, setFicha] = useState<ClienteIV | null>(null);
  const hoje = hojeBR();

  const carregar = useCallback(async (atualizar = false) => {
    setCarregando(true); setErro('');
    try { setDados(await apiGet(`/api/inteligencia-vendas/base${atualizar ? '?atualizar=1' : ''}`)); }
    catch (e) { setErro((e as Error).message); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { try { localStorage.setItem(FILTROS_KEY, JSON.stringify(f)); } catch { /* sem storage */ } }, [f]);

  const clientes = useMemo(() => dados?.clientes ?? [], [dados]);
  const cidades = useMemo(() => contar(clientes.map((c) => c.cidade)), [clientes]);
  const vendedores = useMemo(() => contar(clientes.map((c) => c.vendedor)), [clientes]);

  const filtrados = useMemo(() => {
    const q = textoNorm(f.q);
    const perg = PERGUNTAS.find((p) => p.id === f.pergunta);
    return clientes.filter((c) => {
      if (f.soComOportunidade && !f.pergunta && c.oportunidades.length === 0) return false;
      if (f.regra && !c.oportunidades.some((o) => o.regra === f.regra)) return false;
      if (perg && !perg.filtro(c, hoje)) return false;
      if (f.cidade && c.cidade !== f.cidade) return false;
      if (f.vendedor && c.vendedor !== f.vendedor) return false;
      if (f.loja && !c.lojas.includes(f.loja)) return false;
      if (q) {
        const alvo = textoNorm([c.nome, c.doc, c.cidade, c.vendedor, ...c.maquinas.map((m) => m.modelo), ...c.marcasNaOficina].join(' '));
        if (!q.split(' ').every((p) => alvo.includes(p))) return false;
      }
      return true;
    });
  }, [clientes, f, hoje]);

  const porRegra = useMemo(() => {
    const m = new Map<RegraId, number>();
    for (const c of clientes) for (const o of c.oportunidades) m.set(o.regra, (m.get(o.regra) || 0) + 1);
    return m;
  }, [clientes]);

  const colunas: Coluna<ClienteIV>[] = useMemo(() => [
    {
      id: 'score', rotulo: 'Score', direita: true, largura: 60, valor: (c) => c.score,
      render: (c) => <span style={{ fontWeight: 800, color: c.score >= 50 ? VERMELHO : txt }}>{c.score}</span>,
    },
    {
      id: 'cliente', rotulo: 'Cliente', valor: (c) => c.nome,
      render: (c) => (
        <div style={{ minWidth: 200 }}>
          <div style={{ fontWeight: 700 }}>{c.nome}</div>
          <div style={{ fontSize: 11.5, color: mut }}>{c.lojas.join(' + ')}{c.telefone ? ` · ${c.telefone}` : ''}</div>
        </div>
      ),
    },
    { id: 'cidade', rotulo: 'Cidade', valor: (c) => c.cidade },
    {
      id: 'trator', rotulo: 'Último trator', valor: (c) => c.ultimoTrator?.data || '',
      render: (c) => c.ultimoTrator
        ? <span>{c.ultimoTrator.modelo} <span style={{ color: mut }}>· {c.anosUltimoTrator} a</span>{c.qtdTratores > 1 ? <span style={{ color: mut }}> (+{c.qtdTratores - 1})</span> : null}</span>
        : <span style={{ color: mut }}>—</span>,
    },
    { id: 'impl', rotulo: 'Impl.', direita: true, valor: (c) => c.qtdImplementos },
    { id: 'pecas', rotulo: 'Peças 12 m', direita: true, valor: (c) => Math.round(c.pecas12m), render: (c) => brl(c.pecas12m) },
    { id: 'os', rotulo: 'OS 12 m', direita: true, valor: (c) => c.os12m },
    {
      id: 'prop', rotulo: 'Propostas', valor: (c) => c.propostasAbertas * 1000 + c.propostasPerdidas,
      render: (c) => (c.propostasAbertas + c.propostasPerdidas + c.propostasGanhas === 0 ? <span style={{ color: mut }}>—</span>
        : <span>{c.propostasAbertas} ab. · {c.propostasPerdidas} perd. · {c.propostasGanhas} gan.</span>),
    },
    { id: 'visita', rotulo: 'Últ. visita', valor: (c) => c.ultimaVisita, render: (c) => dataBR(c.ultimaVisita) },
    { id: 'vendedor', rotulo: 'Vendedor', valor: (c) => c.vendedor },
    {
      id: 'oferecer', rotulo: 'O que oferecer', valor: (c) => c.oportunidades[0]?.oferecer || '',
      render: (c) => (
        <div style={{ minWidth: 240 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 3 }}>
            {c.oportunidades.map((o) => <Selo key={o.regra} cor={REGRAS[o.regra].cor} title={o.titulo}>{REGRAS[o.regra].rotulo}</Selo>)}
          </div>
          <div style={{ fontSize: 12.5 }}>{c.oportunidades[0]?.oferecer || ''}</div>
        </div>
      ),
    },
    { id: 'doc', rotulo: 'CPF/CNPJ', valor: (c) => c.doc, render: (c) => <span style={{ fontSize: 12, color: mut }}>{c.doc}</span> },
  ], []);

  const muda = (p: Partial<Filtros>) => setF((x) => ({ ...x, ...p }));
  const temFiltro = f.regra || f.pergunta || f.q || f.cidade || f.vendedor || f.loja;

  return (
    <Pagina>
      {!topo && <Cabecalho
        titulo="Oportunidades"
        sub={dados ? <>
          {clientes.length.toLocaleString('pt-BR')} clientes com movimento, cruzando cadastro Omie (NOVA + CASTRO), vendas, controle de revisões,
          oficina, propostas e o CRM dos vendedores · atualizado {tempoDesde(dados.atualizadoEm)}
        </> : 'Cruzando as bases…'}
        acoes={<>
          <Botao onClick={() => carregar(true)} disabled={carregando}><RefreshCw size={14} /> Atualizar</Botao>
          <BotaoCSV nome={`oportunidades-${hoje}.csv`} linhas={filtrados} colunas={colunas} />
        </>}
      />}
      {erro && <Aviso cor={VERMELHO}>{erro}</Aviso>}
      {!dados && !erro && <Carregando texto="Cruzando cadastro, vendas, oficina, propostas e CRM… (a primeira leitura leva uns 15 segundos)" />}

      {dados && <>
        {topo ? (
          <TopoOportunidades variante={topo} clientes={clientes} f={f} muda={muda} limpar={() => setF({ ...PADRAO, soComOportunidade: f.soComOportunidade })}
            porRegra={porRegra} cidades={cidades} vendedores={vendedores} hoje={hoje} total={filtrados.length}
            acoes={<>
              <Botao onClick={() => carregar(true)} disabled={carregando}><RefreshCw size={14} /> Atualizar</Botao>
              <BotaoCSV nome={`oportunidades-${hoje}.csv`} linhas={filtrados} colunas={colunas} />
            </>} />
        ) : <>
        <GradeKpi min={150}>
          {(Object.keys(REGRAS) as RegraId[]).map((r) => (
            <Kpi key={r} rotulo={REGRAS[r].rotulo} valor={(porRegra.get(r) || 0).toLocaleString('pt-BR')} cor={REGRAS[r].cor}
              sub={<span title={REGRAS[r].explicacao}>clientes</span>} ativo={f.regra === r}
              onClick={() => muda({ regra: f.regra === r ? '' : r, pergunta: '' })} />
          ))}
        </GradeKpi>

        <div style={{ background: fundoCard, border: borda, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: mut, marginBottom: 7 }}>PERGUNTAS PRONTAS</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PERGUNTAS.map((p) => {
              const ativo = f.pergunta === p.id;
              const n = clientes.filter((c) => p.filtro(c, hoje)).length;
              return (
                <button key={p.id} type="button" onClick={() => muda({ pergunta: ativo ? '' : p.id, regra: '' })}
                  style={{
                    padding: '6px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${ativo ? VERMELHO : 'var(--portal-border, #e5e7eb)'}`,
                    background: ativo ? VERMELHO : 'transparent', color: ativo ? '#fefefe' : txt,
                  }}>
                  {p.texto} <b style={{ opacity: 0.75 }}>{n}</b>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 0 }}>
              <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: mut }} />
              <input value={f.q} onChange={(e) => muda({ q: e.target.value })} placeholder="Nome, CPF/CNPJ, cidade, modelo, marca…"
                style={{ ...estiloInput, width: '100%', paddingLeft: 28 }} />
            </div>
            <select value={f.cidade} onChange={(e) => muda({ cidade: e.target.value })} style={{ ...estiloInput, maxWidth: '100%', width: 220 }}>
              <option value="">Todas as cidades</option>
              {cidades.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
            </select>
            <select value={f.vendedor} onChange={(e) => muda({ vendedor: e.target.value })} style={{ ...estiloInput, maxWidth: '100%', width: 200 }}>
              <option value="">Todos os vendedores</option>
              {vendedores.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
            </select>
            <select value={f.loja} onChange={(e) => muda({ loja: e.target.value })} style={estiloInput}>
              <option value="">NOVA e CASTRO</option><option value="NOVA">Só NOVA</option><option value="CASTRO">Só CASTRO</option>
            </select>
            <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 13, color: txt }}>
              <input type="checkbox" checked={f.soComOportunidade} onChange={(e) => muda({ soComOportunidade: e.target.checked })} />
              Só com oportunidade
            </label>
            {temFiltro && <Botao onClick={() => setF({ ...PADRAO, soComOportunidade: f.soComOportunidade })}><X size={14} /> Limpar</Botao>}
          </div>
        </div>
        </>}

        {!topo && <div style={{ fontSize: 13, color: mut, marginBottom: 6 }}>
          <b style={{ color: txt }}>{filtrados.length.toLocaleString('pt-BR')}</b> clientes
          {f.regra && <> · {REGRAS[f.regra].explicacao}</>}
        </div>}
        <div id="iv-tabela" style={{ scrollMarginTop: 90 }} />
        {topo && <FaixaResultado f={f} total={filtrados.length} limpar={() => setF({ ...PADRAO, soComOportunidade: f.soComOportunidade })} />}
        {topo && <style>{modoFicha ? ESTILO_EXECUTIVA : ESTILO_TABELA_VISUAL}</style>}
        <Tabela rolarPagina={!!topo} animar={topo ? JSON.stringify(f) : undefined} linhas={filtrados} colunas={modoFicha ? colunasExecutivas(hoje) : topo ? colunasVisuais(Math.max(1, ...filtrados.map((c) => c.pecas12m))) : colunas} chave={(c) => c.chave} onLinha={setFicha} max={200}
          vazio="Nenhum cliente com esse filtro." />
      </>}
      {ficha && (modoFicha ? <FichaExecutiva c={ficha} modo={modoFicha} onFechar={() => setFicha(null)} /> : topo ? <Ficha360 c={ficha} onFechar={() => setFicha(null)} /> : <FichaCliente c={ficha} onFechar={() => setFicha(null)} />)}
    </Pagina>
  );
}

function contar(v: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const x of v) if (x) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
