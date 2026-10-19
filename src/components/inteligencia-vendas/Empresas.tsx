'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// /inteligencia-vendas/empresas — CNPJ na Receita (ideias 16 e 18).
//   * empresas rurais abertas nos últimos 24 meses nos municípios da loja
//     (script mensal scripts/iv-cnpj-novos.ts)
//   * CNAE da carteira (BrasilAPI, em lotes pelo botão) → acha prestadores de
//     serviço agrícola, que entram nas Oportunidades
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { hojeBR, textoNorm } from '@/lib/inteligencia-vendas/normalizar';
import {
  apiEnviar, apiGet, Aviso, AvisoMigracao, Botao, BotaoCSV, Cabecalho, Carregando, dataBR, estiloInput, GradeKpi, Kpi, mut, num, Pagina, Painel,
  pct, Selo, Tabela, VERMELHO, type Coluna,
} from './ui';

interface Nova { cnpj: string; razao_social: string | null; nome_fantasia: string | null; cnae_codigo: string | null; cnae_descricao: string | null; data_inicio: string | null; municipio: string | null; uf: string | null; porte: string | null; telefone: string | null; jaCliente: boolean }

export default function Empresas() {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState('');
  const [busca, setBusca] = useState('');
  const [municipio, setMunicipio] = useState('');
  const hoje = hojeBR();

  const carregar = useCallback(async () => {
    try { setDados(await apiGet('/api/inteligencia-vendas/empresas')); setErro(''); } catch (e) { setErro((e as Error).message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function enriquecer() {
    setRodando(true); setMsg('');
    try {
      const r = await apiEnviar('/api/inteligencia-vendas/empresas', 'POST', { acao: 'enriquecer' });
      setMsg(`${r.ok} CNPJs consultados${r.falhas ? `, ${r.falhas} com erro` : ''}. Faltam ${num(r.restantes)}.`);
      carregar();
    } catch (e) { setMsg((e as Error).message); }
    finally { setRodando(false); }
  }

  const novas: Nova[] = useMemo(() => {
    const q = textoNorm(busca);
    return (dados?.novas ?? []).filter((n: Nova) => (!municipio || n.municipio === municipio)
      && (!q || textoNorm([n.razao_social, n.nome_fantasia, n.cnae_descricao, n.cnpj].join(' ')).includes(q)));
  }, [dados, busca, municipio]);
  const municipios = useMemo(() => [...new Set((dados?.novas ?? []).map((n: Nova) => n.municipio).filter(Boolean))].sort() as string[], [dados]);

  const colunas: Coluna<Nova>[] = useMemo(() => [
    { id: 'abertura', rotulo: 'Abertura', valor: (n) => n.data_inicio || '', render: (n) => dataBR(n.data_inicio) },
    {
      id: 'nome', rotulo: 'Empresa', valor: (n) => n.razao_social || n.nome_fantasia || '',
      render: (n) => <div><b>{n.razao_social || n.nome_fantasia || '—'}</b>{n.nome_fantasia && n.razao_social ? <div style={{ fontSize: 11.5, color: mut }}>{n.nome_fantasia}</div> : null}
        {n.jaCliente && <Selo cor="#16A34A">já é cliente</Selo>}</div>,
    },
    { id: 'cnpj', rotulo: 'CNPJ', valor: (n) => n.cnpj },
    { id: 'cnae', rotulo: 'Atividade', valor: (n) => n.cnae_descricao || '', render: (n) => <span style={{ fontSize: 12.5 }}>{n.cnae_descricao}</span> },
    { id: 'mun', rotulo: 'Município', valor: (n) => n.municipio || '' },
    { id: 'porte', rotulo: 'Porte', valor: (n) => n.porte || '' },
    { id: 'tel', rotulo: 'Telefone', valor: (n) => n.telefone || '' },
  ], []);

  const cart = dados?.carteira;
  return (
    <Pagina>
      <Cabecalho titulo="Empresas (CNPJ)" sub="Empresas rurais novas na região e a atividade (CNAE) dos clientes, pelos dados abertos da Receita Federal."
        acoes={<ComoAtualizar />} />
      {erro && <Aviso cor={VERMELHO}>{erro}</Aviso>}
      {!dados && !erro && <Carregando />}
      {dados?.semTabela && <AvisoMigracao />}
      {dados && !dados.semTabela && <>
        <GradeKpi>
          <Kpi rotulo="Empresas rurais novas" valor={num(dados.novas.length)} sub="abertas nos últimos 24 meses" />
          <Kpi rotulo="Clientes com CNPJ" valor={num(cart.cnpjs)} cor="#2563EB" />
          <Kpi rotulo="Já com CNAE" valor={num(cart.consultados)} cor="#2563EB" sub={cart.cnpjs ? pct(cart.consultados / cart.cnpjs, 0) : ''} />
          <Kpi rotulo="Prestadores de serviço" valor={num(cart.prestadores.length)} cor="#16A34A" sub="CNAE 0161 — alta capacidade" />
        </GradeKpi>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 12, marginBottom: 14 }}>
          <Painel titulo="CNAE da carteira" acoes={<Botao cheio onClick={enriquecer} disabled={rodando || cart.consultados >= cart.cnpjs}>
            <RefreshCw size={14} className={rodando ? 'animate-spin' : undefined} /> {rodando ? 'Consultando…' : 'Consultar próximos 30'}
          </Botao>}>
            <div style={{ fontSize: 12.5, color: mut, marginBottom: 8 }}>
              Consulta a Receita (BrasilAPI) para os clientes com CNPJ, começando pelos de maior score. Cada clique consulta 30 (uns 15 segundos).
            </div>
            {msg && <Aviso cor="#2563EB">{msg}</Aviso>}
            {cart.porCnae.map((c: any) => (
              <div key={c.cnae} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--portal-border, #e5e7eb)' }}>
                <span>{c.descricao || c.cnae}</span><b>{c.clientes}</b>
              </div>
            ))}
          </Painel>
          <Painel titulo="Prestadores de serviço agrícola na carteira">
            {cart.prestadores.length === 0 && <div style={{ fontSize: 13, color: mut }}>Nenhum ainda (consulte o CNAE da carteira).</div>}
            {cart.prestadores.map((p: any) => (
              <div key={p.cnpj} style={{ fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--portal-border, #e5e7eb)' }}>
                <b>{p.nome}</b> <span style={{ color: mut }}>· {p.municipio}</span><div style={{ fontSize: 12, color: mut }}>{p.cnae}</div>
              </div>
            ))}
          </Painel>
        </div>

        <Painel titulo="Empresas rurais abertas na região" acoes={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, atividade…" style={estiloInput} />
          <select value={municipio} onChange={(e) => setMunicipio(e.target.value)} style={estiloInput}>
            <option value="">Todos os municípios</option>
            {municipios.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <BotaoCSV nome={`empresas-novas-${hoje}.csv`} linhas={novas} colunas={colunas} />
        </div>}>
          {dados.novas.length === 0 ? (
            <Aviso cor="#2563EB">
              Ainda não carregado. Veja em &quot;Como atualizar&quot;, no canto de cima.
            </Aviso>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: mut, marginBottom: 8 }}>
                Abrir um CNPJ rural não quer dizer que a pessoa vai comprar máquina: qualifique antes de abordar.
              </div>
              <Tabela linhas={novas} colunas={colunas} chave={(n) => n.cnpj} ordemInicial={{ id: 'abertura', dir: 'desc' }} max={150} />
            </>
          )}
        </Painel>
      </>}
    </Pagina>
  );
}

// Instruções de manutenção escondidas atrás de um botão discreto: só quem
// cuida da carga precisa ver.
function ComoAtualizar() {
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setAberto(!aberto)} title="Como atualizar os dados desta tela"
        style={{ background: 'none', border: 0, color: mut, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline', padding: '8px 4px' }}>
        Como atualizar
      </button>
      {aberto && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 20, width: 'min(420px, 90vw)', padding: 14, borderRadius: 10,
          border: '1px solid var(--portal-border, #e5e7eb)', background: 'var(--portal-bg-card, #fefefe)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          fontSize: 13, color: 'var(--portal-text, #111111)', lineHeight: 1.5,
        }}>
          <b>Empresas rurais novas</b>
          <div style={{ marginTop: 4 }}>
            Rodar no computador, na pasta do portal: <code>npx tsx scripts/iv-cnpj-novos.ts --gravar</code>.
            Baixa uns 5 GB da Receita e leva de 30 a 60 minutos. A Receita publica uma vez por mês.
          </div>
          <b style={{ display: 'block', marginTop: 10 }}>CNAE dos clientes atuais</b>
          <div style={{ marginTop: 4 }}>Botão &quot;Consultar próximos 30&quot; no quadro CNAE da carteira, de 30 em 30.</div>
        </div>
      )}
    </div>
  );
}
