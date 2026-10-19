'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// /inteligencia-vendas/concorrencia — radar de concorrentes e preços (ideia 12).
// Em cima: perdas (propostas do portal + negócios do CRM) com o motivo.
// Embaixo: o que a equipe registra (anúncios, campanhas, feiras, preços).
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { hojeBR, textoNorm } from '@/lib/inteligencia-vendas/normalizar';
import {
  apiEnviar, apiGet, Aviso, AvisoMigracao, Botao, BotaoCSV, brl, Cabecalho, Carregando, dataBR, estiloInput, GradeKpi, Kpi, mut, Pagina, Painel,
  Selo, Tabela, txt, VERMELHO, type Coluna,
} from './ui';

interface Perda { origem: string; id: number; cliente: string; cidade: string; oque: string; motivo: string; concorrente: string; valorConcorrente: number | null; data: string; vendedor: string }
interface Registro { id: number; data_ref: string; revenda: string; marca: string | null; modelo: string | null; ano: number | null; condicao: string | null; tipo: string; preco: number | null; condicoes: string | null; cidade: string | null; fonte: string | null; obs: string | null; criado_por: string | null }

const TIPOS: Record<string, string> = { anuncio: 'Anúncio', campanha: 'Campanha', evento: 'Feira / dia de campo', loja: 'Loja nova', outro: 'Outro' };

export default function Concorrencia() {
  const [dados, setDados] = useState<{ registros: Registro[]; perdas: Perda[]; semTabela: boolean; podeEditar: boolean } | null>(null);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [busca, setBusca] = useState('');
  const hoje = hojeBR();

  const carregar = useCallback(async () => {
    try { setDados(await apiGet('/api/inteligencia-vendas/concorrencia')); setErro(''); } catch (e) { setErro((e as Error).message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const regs = useMemo(() => {
    const q = textoNorm(busca);
    return (dados?.registros ?? []).filter((r) => !q || textoNorm([r.revenda, r.marca, r.modelo, r.cidade, r.condicoes].join(' ')).includes(q));
  }, [dados, busca]);
  const perdas = useMemo(() => dados?.perdas ?? [], [dados]);
  const motivos = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of perdas) m.set(p.motivo, (m.get(p.motivo) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [perdas]);

  async function salvar() {
    try { await apiEnviar('/api/inteligencia-vendas/concorrencia', 'POST', form); setForm(null); carregar(); } catch (e) { alert((e as Error).message); }
  }
  async function apagar(r: Registro) {
    if (!confirm('Apagar este registro?')) return;
    try { await apiEnviar(`/api/inteligencia-vendas/concorrencia?id=${r.id}`, 'DELETE'); carregar(); } catch (e) { alert((e as Error).message); }
  }

  const colPerdas: Coluna<Perda>[] = useMemo(() => [
    { id: 'data', rotulo: 'Data', valor: (p) => p.data, render: (p) => dataBR(p.data) },
    { id: 'origem', rotulo: 'Origem', valor: (p) => p.origem, render: (p) => <Selo cor={p.origem === 'proposta' ? VERMELHO : '#2563EB'}>{p.origem === 'proposta' ? 'Proposta' : 'CRM'}</Selo> },
    { id: 'cliente', rotulo: 'Cliente', valor: (p) => p.cliente, render: (p) => <div><b>{p.cliente || '—'}</b><div style={{ fontSize: 11.5, color: mut }}>{p.cidade}</div></div> },
    { id: 'oque', rotulo: 'Máquina', valor: (p) => p.oque },
    { id: 'motivo', rotulo: 'Motivo', valor: (p) => p.motivo },
    { id: 'conc', rotulo: 'Concorrente', valor: (p) => p.concorrente, render: (p) => p.concorrente || <span style={{ color: mut }}>não registrado</span> },
    { id: 'valor', rotulo: 'Valor dele', direita: true, valor: (p) => p.valorConcorrente ?? 0, render: (p) => (p.valorConcorrente ? brl(p.valorConcorrente) : '—') },
    { id: 'vend', rotulo: 'Vendedor', valor: (p) => p.vendedor },
  ], []);

  const colRegs: Coluna<Registro>[] = useMemo(() => [
    { id: 'data', rotulo: 'Data', valor: (r) => r.data_ref, render: (r) => dataBR(r.data_ref) },
    { id: 'revenda', rotulo: 'Revenda', valor: (r) => r.revenda, render: (r) => <b>{r.revenda}</b> },
    { id: 'tipo', rotulo: 'Tipo', valor: (r) => TIPOS[r.tipo] || r.tipo },
    { id: 'maquina', rotulo: 'Máquina', valor: (r) => [r.marca, r.modelo, r.ano].filter(Boolean).join(' '), render: (r) => <span>{[r.marca, r.modelo].filter(Boolean).join(' ') || '—'}{r.ano ? <span style={{ color: mut }}> · {r.ano}</span> : null}{r.condicao ? <span style={{ color: mut }}> · {r.condicao}</span> : null}</span> },
    { id: 'preco', rotulo: 'Preço', direita: true, valor: (r) => r.preco ?? 0, render: (r) => (r.preco ? brl(r.preco) : '—') },
    { id: 'cond', rotulo: 'Condições', valor: (r) => r.condicoes || '' },
    { id: 'cidade', rotulo: 'Cidade', valor: (r) => r.cidade || '' },
    { id: 'fonte', rotulo: 'Fonte', valor: (r) => r.fonte || '', render: (r) => (r.fonte && /^https?:\/\//.test(r.fonte) ? <a href={r.fonte} target="_blank" rel="noreferrer" style={{ color: VERMELHO }}>abrir</a> : r.fonte || '—') },
    { id: 'por', rotulo: 'Registrado por', valor: (r) => r.criado_por || '' },
    {
      id: 'x', rotulo: '', valor: () => '', csv: false,
      render: (r) => (dados?.podeEditar ? <button onClick={() => apagar(r)} title="Apagar" style={{ background: 'none', border: 0, cursor: 'pointer', color: mut }}><Trash2 size={15} /></button> : null),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [dados]);

  return (
    <Pagina>
      <Cabecalho titulo="Concorrência" sub="Por que perdemos, para quem, e o que as outras revendas estão anunciando. Só informação pública ou que a equipe viu/ouviu."
        acoes={<>{dados?.podeEditar && !dados.semTabela && <Botao cheio onClick={() => setForm({ tipo: 'anuncio', condicao: 'novo', data_ref: hoje })}><Plus size={14} /> Registrar</Botao>}</>} />
      {erro && <Aviso cor={VERMELHO}>{erro}</Aviso>}
      {!dados && !erro && <Carregando />}
      {dados && <>
        <GradeKpi>
          <Kpi rotulo="Perdas registradas" valor={perdas.length} />
          <Kpi rotulo="Sem motivo" valor={perdas.filter((p) => /sem motivo/i.test(p.motivo)).length} cor="#B45309" sub="pedir pro vendedor registrar" />
          <Kpi rotulo="Com concorrente informado" valor={perdas.filter((p) => p.concorrente).length} cor="#7C3AED" />
          <Kpi rotulo="Registros da equipe" valor={dados.registros.length} cor="#2563EB" />
        </GradeKpi>
        {motivos.length > 0 && (
          <Painel titulo="Motivos de perda" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{motivos.map(([m, n]) => <Selo key={m} cor={VERMELHO}>{m}: {n}</Selo>)}</div>
          </Painel>
        )}
        <Painel titulo="Perdas" acoes={<BotaoCSV nome={`perdas-${hoje}.csv`} linhas={perdas} colunas={colPerdas} />} style={{ marginBottom: 14 }}>
          <Tabela linhas={perdas} colunas={colPerdas} chave={(p) => `${p.origem}-${p.id}`} max={100} vazio="Nenhuma proposta perdida registrada." />
        </Painel>
        <Painel titulo="Anúncios, campanhas e preços" acoes={<div style={{ display: 'flex', gap: 8 }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar revenda, modelo…" style={estiloInput} />
          <BotaoCSV nome={`concorrencia-${hoje}.csv`} linhas={regs} colunas={colRegs} />
        </div>}>
          {dados.semTabela ? <AvisoMigracao /> : (
            <Tabela linhas={regs} colunas={colRegs} chave={(r) => String(r.id)} max={100}
              vazio="Nada registrado ainda. Use “Registrar” quando ver um anúncio, campanha ou preço de outra revenda." />
          )}
        </Painel>
      </>}

      {form && (
        <div onClick={() => setForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: '92vh', overflowY: 'auto' }}>
            <Painel titulo="Registrar concorrência" acoes={<button onClick={() => setForm(null)} aria-label="Fechar" style={{ background: 'none', border: 0, cursor: 'pointer', color: txt }}><X size={18} /></button>}>
              <div style={{ display: 'grid', gap: 9 }}>
                {campo('Revenda / concorrente *', 'revenda')}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label style={{ fontSize: 12.5, color: mut, display: 'grid', gap: 3 }}>Tipo
                    <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={estiloInput}>
                      {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </label>
                  {campo('Data', 'data_ref', 'date')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 8 }}>{campo('Marca', 'marca')}{campo('Modelo', 'modelo')}{campo('Ano', 'ano', 'number')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label style={{ fontSize: 12.5, color: mut, display: 'grid', gap: 3 }}>Condição
                    <select value={form.condicao || ''} onChange={(e) => setForm({ ...form, condicao: e.target.value })} style={estiloInput}>
                      <option value="novo">Novo</option><option value="seminovo">Seminovo</option><option value="usado">Usado</option>
                    </select>
                  </label>
                  {campo('Preço (R$)', 'preco', 'number')}
                </div>
                {campo('Condições (prazo, taxa, entrada, brinde)', 'condicoes')}
                {campo('Cidade', 'cidade')}
                {campo('Fonte (link ou onde viu)', 'fonte')}
                {campo('Observação', 'obs')}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Botao onClick={() => setForm(null)}>Cancelar</Botao><Botao cheio onClick={salvar}>Salvar</Botao>
                </div>
              </div>
            </Painel>
          </div>
        </div>
      )}
    </Pagina>
  );

  function campo(rotulo: string, k: string, tipo = 'text') {
    return (
      <label style={{ fontSize: 12.5, color: mut, display: 'grid', gap: 3 }}>{rotulo}
        <input type={tipo} value={form?.[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={{ ...estiloInput, width: '100%' }} />
      </label>
    );
  }
}
