'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// /inteligencia-vendas/indicacoes — cliente satisfeito indica (ideia 14).
// Registra quem indicou, quem foi indicado (com autorização), a máquina de
// interesse e o vendedor; acompanha até ganhar/perder e marca o prazo vencido.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2, X } from 'lucide-react';
import { hojeBR, somarDias } from '@/lib/inteligencia-vendas/normalizar';
import {
  apiEnviar, apiGet, Aviso, AvisoMigracao, Botao, BotaoCSV, Cabecalho, Carregando, dataBR, estiloInput, GradeKpi, Kpi, mut, Pagina, Painel,
  pct, Selo, Tabela, txt, VERMELHO, type Coluna,
} from './ui';

const STATUS: Record<string, { rotulo: string; cor: string }> = {
  nova: { rotulo: 'Nova', cor: '#DC2626' }, contatada: { rotulo: 'Contatada', cor: '#2563EB' },
  proposta: { rotulo: 'Proposta', cor: '#CA8A04' }, ganha: { rotulo: 'Ganha', cor: '#16A34A' }, perdida: { rotulo: 'Perdida', cor: '#64748B' },
};

interface Indicacao {
  id: number; criado_em: string; criado_por: string | null; indicante_doc: string | null; indicante_nome: string; indicado_nome: string;
  indicado_telefone: string | null; indicado_cidade: string | null; autorizado: boolean; interesse: string | null; vendedor_id: number | null;
  vendedor_nome: string | null; prazo_contato: string | null; status: string; beneficio: string | null; beneficio_entregue: boolean; obs: string | null;
}

export default function Indicacoes() {
  const sp = useSearchParams();
  const [dados, setDados] = useState<{ indicacoes: Indicacao[]; vendedores: { id: number; nome: string }[]; podeEditar: boolean } | null>(null);
  const [erro, setErro] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [filtro, setFiltro] = useState('');
  const hoje = hojeBR();

  const carregar = useCallback(async () => {
    try { setDados(await apiGet('/api/inteligencia-vendas/indicacoes')); setErro(null); } catch (e) { setErro(e); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const ind = sp?.get('indicante');
    if (ind) setForm({ indicante_nome: ind, indicante_doc: sp?.get('doc') || '', prazo_contato: somarDias(hoje, 3), autorizado: false });
  }, [sp, hoje]);

  const lista = useMemo(() => (dados?.indicacoes ?? []).filter((i) => !filtro || (filtro === 'atrasada' ? atrasada(i, hoje) : i.status === filtro)), [dados, filtro, hoje]);
  const todas = useMemo(() => dados?.indicacoes ?? [], [dados]);
  const ganhas = todas.filter((i) => i.status === 'ganha').length;
  const fechadas = ganhas + todas.filter((i) => i.status === 'perdida').length;

  const ranking = useMemo(() => {
    const m = new Map<string, { nome: string; total: number; ganhas: number }>();
    for (const i of todas) {
      const r = m.get(i.indicante_nome) || { nome: i.indicante_nome, total: 0, ganhas: 0 };
      r.total++; if (i.status === 'ganha') r.ganhas++;
      m.set(i.indicante_nome, r);
    }
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  }, [todas]);

  async function salvar() {
    if (!form) return;
    try {
      const v = dados?.vendedores.find((x) => x.id === Number(form.vendedor_id));
      const corpo = { ...form, vendedor_nome: v?.nome || form.vendedor_nome || null };
      if (form.id) await apiEnviar('/api/inteligencia-vendas/indicacoes', 'PATCH', corpo);
      else await apiEnviar('/api/inteligencia-vendas/indicacoes', 'POST', corpo);
      setForm(null); carregar();
    } catch (e) { alert((e as Error).message); }
  }
  async function mudarStatus(i: Indicacao, status: string) {
    try { await apiEnviar('/api/inteligencia-vendas/indicacoes', 'PATCH', { id: i.id, status }); carregar(); } catch (e) { alert((e as Error).message); }
  }
  async function apagar(i: Indicacao) {
    if (!confirm(`Apagar a indicação de ${i.indicado_nome}?`)) return;
    try { await apiEnviar(`/api/inteligencia-vendas/indicacoes?id=${i.id}`, 'DELETE'); carregar(); } catch (e) { alert((e as Error).message); }
  }

  const colunas: Coluna<Indicacao>[] = useMemo(() => [
    { id: 'data', rotulo: 'Data', valor: (i) => i.criado_em, render: (i) => dataBR(i.criado_em) },
    { id: 'indicante', rotulo: 'Quem indicou', valor: (i) => i.indicante_nome, render: (i) => <b>{i.indicante_nome}</b> },
    {
      id: 'indicado', rotulo: 'Indicado', valor: (i) => i.indicado_nome,
      render: (i) => <div><b>{i.indicado_nome}</b><div style={{ fontSize: 11.5, color: mut }}>{[i.indicado_telefone, i.indicado_cidade].filter(Boolean).join(' · ')}</div>
        {!i.autorizado && <Selo cor="#B45309">sem autorização registrada</Selo>}</div>,
    },
    { id: 'interesse', rotulo: 'Interesse', valor: (i) => i.interesse || '' },
    { id: 'vendedor', rotulo: 'Vendedor', valor: (i) => i.vendedor_nome || '', render: (i) => i.vendedor_nome || <span style={{ color: VERMELHO }}>sem vendedor</span> },
    {
      id: 'prazo', rotulo: 'Prazo', valor: (i) => i.prazo_contato || '',
      render: (i) => <span style={{ color: atrasada(i, hoje) ? VERMELHO : txt, fontWeight: atrasada(i, hoje) ? 800 : 400 }}>{dataBR(i.prazo_contato)}{atrasada(i, hoje) ? ' · vencido' : ''}</span>,
    },
    {
      id: 'status', rotulo: 'Situação', valor: (i) => STATUS[i.status]?.rotulo,
      render: (i) => dados?.podeEditar
        ? <select value={i.status} onClick={(e) => e.stopPropagation()} onChange={(e) => mudarStatus(i, e.target.value)} style={{ ...estiloInput, color: STATUS[i.status]?.cor, fontWeight: 700 }}>
          {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.rotulo}</option>)}
        </select>
        : <Selo cor={STATUS[i.status]?.cor}>{STATUS[i.status]?.rotulo}</Selo>,
    },
    { id: 'beneficio', rotulo: 'Reconhecimento', valor: (i) => i.beneficio || '', render: (i) => (i.beneficio ? <span>{i.beneficio}{i.beneficio_entregue ? ' ✓' : ''}</span> : '—') },
    {
      id: 'x', rotulo: '', valor: () => '', csv: false,
      render: (i) => dados?.podeEditar ? <button onClick={(e) => { e.stopPropagation(); apagar(i); }} title="Apagar" style={{ background: 'none', border: 0, cursor: 'pointer', color: mut }}><Trash2 size={15} /></button> : null,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [dados, hoje]);

  if (erro?.corpo?.migracaoFaltando) return <Pagina><Cabecalho titulo="Indicações" /><AvisoMigracao /></Pagina>;

  return (
    <Pagina>
      <Cabecalho titulo="Indicações" sub="Clientes satisfeitos indicando novos contatos. Só procure quem autorizou."
        acoes={<>
          {dados?.podeEditar && <Botao cheio onClick={() => setForm({ prazo_contato: somarDias(hoje, 3), autorizado: false })}><Plus size={14} /> Nova indicação</Botao>}
          <BotaoCSV nome={`indicacoes-${hoje}.csv`} linhas={lista} colunas={colunas} />
        </>} />
      {erro && !erro?.corpo?.migracaoFaltando && <Aviso cor={VERMELHO}>{erro.message}</Aviso>}
      {!dados && !erro && <Carregando />}
      {dados && <>
        <GradeKpi>
          <Kpi rotulo="Indicações" valor={todas.length} ativo={!filtro} onClick={() => setFiltro('')} />
          <Kpi rotulo="Prazo vencido" valor={todas.filter((i) => atrasada(i, hoje)).length} cor="#B91C1C" ativo={filtro === 'atrasada'} onClick={() => setFiltro(filtro === 'atrasada' ? '' : 'atrasada')} sub="ninguém ligou ainda" />
          {Object.entries(STATUS).map(([k, s]) => (
            <Kpi key={k} rotulo={s.rotulo} valor={todas.filter((i) => i.status === k).length} cor={s.cor} ativo={filtro === k} onClick={() => setFiltro(filtro === k ? '' : k)} />
          ))}
          <Kpi rotulo="Conversão" valor={fechadas ? pct(ganhas / fechadas, 0) : '—'} cor="#16A34A" sub="ganhas ÷ fechadas" />
        </GradeKpi>
        {ranking.length > 0 && (
          <Painel titulo="Quem mais indica" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ranking.map((r) => <Selo key={r.nome} cor="#2563EB">{r.nome}: {r.total} ({r.ganhas} ganhas)</Selo>)}
            </div>
          </Painel>
        )}
        <Tabela linhas={lista} colunas={colunas} chave={(i) => String(i.id)} onLinha={dados.podeEditar ? (i) => setForm({ ...i }) : undefined}
          vazio="Nenhuma indicação registrada ainda. Use “Nova indicação” ou “Registrar indicação” na ficha do cliente." />
      </>}

      {form && (
        <div onClick={() => setForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: '92vh', overflowY: 'auto' }}>
            <Painel titulo={form.id ? 'Editar indicação' : 'Nova indicação'} acoes={<button onClick={() => setForm(null)} aria-label="Fechar" style={{ background: 'none', border: 0, cursor: 'pointer', color: txt }}><X size={18} /></button>}>
              <div style={{ display: 'grid', gap: 9 }}>
                {campo('Quem indicou *', 'indicante_nome')}
                {campo('CPF/CNPJ de quem indicou', 'indicante_doc')}
                {campo('Nome do indicado *', 'indicado_nome')}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{campo('Telefone', 'indicado_telefone')}{campo('Cidade', 'indicado_cidade')}</div>
                <label style={{ fontSize: 13, color: txt, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={!!form.autorizado} onChange={(e) => setForm({ ...form, autorizado: e.target.checked })} />
                  O indicado autorizou ser procurado
                </label>
                {campo('Máquina de interesse', 'interesse')}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label style={{ fontSize: 12.5, color: mut }}>Vendedor
                    <select value={form.vendedor_id || ''} onChange={(e) => setForm({ ...form, vendedor_id: e.target.value })} style={{ ...estiloInput, width: '100%' }}>
                      <option value="">—</option>
                      {dados?.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                    </select>
                  </label>
                  {campo('Ligar até', 'prazo_contato', 'date')}
                </div>
                {campo('Reconhecimento combinado (se houver)', 'beneficio')}
                {form.beneficio && (
                  <label style={{ fontSize: 13, color: txt, display: 'flex', gap: 6 }}>
                    <input type="checkbox" checked={!!form.beneficio_entregue} onChange={(e) => setForm({ ...form, beneficio_entregue: e.target.checked })} /> Já entregue
                  </label>
                )}
                {campo('Observação', 'obs')}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Botao onClick={() => setForm(null)}>Cancelar</Botao>
                  <Botao cheio onClick={salvar}>Salvar</Botao>
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

function atrasada(i: { status: string; prazo_contato: string | null }, hoje: string) {
  return i.status === 'nova' && !!i.prazo_contato && i.prazo_contato < hoje;
}
