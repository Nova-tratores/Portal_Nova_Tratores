'use client';
// Frota > Pendências — TODA pendência é uma pendência REGISTRADA (tabela
// frota_pendencias), separada por veículo:
//  - origem CADASTRO:  a régua da Ficha abre/fecha sozinha (resolvida na mão,
//    reabre em 30 dias se a causa continuar)
//  - origem CHECKLIST: item "problema" do checklist mais recente abre sozinho
//    (e fecha quando o checklist seguinte vem OK)
//  - origem MANUAL:    registrada aqui pela equipe
// Classificação na taxonomia SISTEMA > SUBSISTEMA > COMPONENTE, alerta de
// RECORRÊNCIA ("era pra durar mais") e resolução rastreada (quem, quando, como,
// vínculo com Requisição/OS). Migration: sql/frota-pendencias.sql.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Camera, Car, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck,
  FileWarning, History, LayoutGrid, Link2, List, Loader2, Plus, Search, Tag, Wrench, X,
} from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { supabase } from '@/lib/supabase';
import { formatarHodometro } from '@/lib/requisicoes/campos';

interface Veiculo {
  id: string; placa: string | null; modelo?: string | null; marca?: string | null;
  descricao?: string | null; tipo_registro?: string; responsavel_nome?: string | null;
  imagem_url?: string | null; pendencias: string[];
}
interface Componente {
  id: string; sistema: string; subsistema: string | null; componente: string | null;
  vida_util_meses: number | null; vida_util_km: number | null; ordem: number;
}
type Origem = 'manual' | 'cadastro' | 'checklist' | 'requisicao' | 'os';
interface Pend {
  id: string; veiculo_id: string | null; placa: string; origem: Origem; origem_ref: string | null;
  titulo: string; descricao: string | null; componente_id: string | null; data_ocorrencia: string | null;
  status: 'aberta' | 'resolvida'; aberta_por: string | null; aberta_em: string;
  resolvida_por: string | null; resolvida_em: string | null; resolucao: string | null;
  vinculo_tipo: 'requisicao' | 'os' | null; vinculo_ref: string | null; foto_url: string | null;
  km?: number | null; responsavel?: string | null;
  pseudo?: boolean; // fallback (migration ainda não aplicada) — só leitura
}
interface Grupo {
  placa: string; nome: string; responsavel: string | null; imagem: string | null; veiculoId: string | null;
  abertas: Pend[];
}

const ORIGEM_CFG: Record<Origem, { rot: string; cor: string; bg: string; Icone: any }> = {
  cadastro: { rot: 'Cadastro', cor: '#b91c1c', bg: '#fee2e2', Icone: AlertTriangle },
  checklist: { rot: 'Checklist', cor: '#b45309', bg: '#fef3c7', Icone: ClipboardCheck },
  manual: { rot: 'Manual', cor: '#1e3a8a', bg: '#dbeafe', Icone: Wrench },
  requisicao: { rot: 'Requisição', cor: '#7c3aed', bg: '#ede9fe', Icone: Link2 },
  os: { rot: 'OS Pós', cor: '#0369a1', bg: '#e0f2fe', Icone: Wrench },
};

const fmtData = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');
const fmtDataHora = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const mesesEntre = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / (30.44 * 86400_000)));
const caminhoComp = (c: Componente | undefined) => (c ? [c.sistema, c.subsistema, c.componente].filter(Boolean).join(' › ') : '');

export default function FrotaPendenciasPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [registradas, setRegistradas] = useState<Pend[]>([]);
  const [componentes, setComponentes] = useState<Componente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [avisoTabela, setAvisoTabela] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | Origem>('todos');
  const [modo, setModo] = useState<'cards' | 'lista'>('cards');
  const [abertoPlaca, setAbertoPlaca] = useState<string | null>(null);

  // nova pendência manual
  const [novaAberta, setNovaAberta] = useState(false);
  const [nTitulo, setNTitulo] = useState('');
  const [nSistema, setNSistema] = useState('');
  const [nCompId, setNCompId] = useState('');
  const [nData, setNData] = useState(() => new Date().toISOString().slice(0, 10));
  const [nDesc, setNDesc] = useState('');
  const [nResp, setNResp] = useState('');
  const [salvandoNova, setSalvandoNova] = useState(false);

  // resolver
  const [resolvendoId, setResolvendoId] = useState<string | null>(null);
  const [rComo, setRComo] = useState('');
  const [rTipo, setRTipo] = useState<'' | 'requisicao' | 'os'>('');
  const [rRef, setRRef] = useState('');
  const [salvandoRes, setSalvandoRes] = useState(false);

  // classificar componente
  const [classifId, setClassifId] = useState<string | null>(null);
  const [cSistema, setCSistema] = useState('');
  const [cCompId, setCCompId] = useState('');
  const [salvandoClassif, setSalvandoClassif] = useState(false);

  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [pendDestaque, setPendDestaque] = useState<string | null>(null);

  // pendência destacada é resolvida → já abre o histórico pra ela aparecer
  useEffect(() => {
    if (!abertoPlaca || !pendDestaque) return;
    if (registradas.some((r) => r.id === pendDestaque && r.status === 'resolvida')) setMostrarHistorico(true);
  }, [abertoPlaca, pendDestaque, registradas]);

  // nova pendência GLOBAL (botão no topo): escolhe o carro, km com máscara,
  // data/hora automáticas; responsável opcional — OBRIGATÓRIO quando o veículo
  // tem técnico responsável vinculado
  const [ngAberta, setNgAberta] = useState(false);
  const [ngPlaca, setNgPlaca] = useState('');
  const [ngTitulo, setNgTitulo] = useState('');
  const [ngKm, setNgKm] = useState('');
  const [ngSistema, setNgSistema] = useState('');
  const [ngCompId, setNgCompId] = useState('');
  const [ngDesc, setNgDesc] = useState('');
  const [ngResp, setNgResp] = useState('');
  const [salvandoNg, setSalvandoNg] = useState(false);
  const [nomesResp, setNomesResp] = useState<string[]>([]);

  useEffect(() => {
    // responsável = USUÁRIO DO PORTAL (financeiro_usu), sempre obrigatório
    (async () => {
      try {
        const { data } = await supabase.from('financeiro_usu').select('nome').order('nome');
        setNomesResp(((data || []) as { nome?: string }[]).map((u) => String(u.nome || '')).filter(Boolean));
      } catch { /* seletor fica vazio */ }
    })();
  }, []);

  useEffect(() => {
    try { const m = localStorage.getItem('frota_pend_modo'); if (m === 'lista' || m === 'cards') setModo(m); } catch {}
    // ?placa=XXX abre direto o modal do veículo; &pend=ID realça a pendência
    // (link "abrir a pendência anterior" dos avisos de recorrência/duplicada)
    try {
      const sp = new URLSearchParams(window.location.search);
      const p = sp.get('placa');
      if (p) setAbertoPlaca(p.toUpperCase());
      const pd = sp.get('pend');
      if (pd) setPendDestaque(pd);
    } catch {}
  }, []);
  const trocarModo = (m: 'cards' | 'lista') => { setModo(m); try { localStorage.setItem('frota_pend_modo', m); } catch {} };

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(''); setAvisoTabela('');
    try {
      const h = await authHeaders();
      const [rv, rp, rk] = await Promise.all([
        fetch('/api/frota/veiculos', { headers: h }),
        fetch('/api/frota/pendencias?sync=1', { headers: h }),
        fetch('/api/frota/componentes', { headers: h }),
      ]);
      const dv = await rv.json(); const dp = await rp.json(); const dk = await rk.json();
      if (!rv.ok) throw new Error(dv.error || 'Falha ao carregar os veículos.');
      setVeiculos(dv.veiculos || []);
      if (!rp.ok || !rk.ok) {
        // fallback: tabelas ainda não criadas — mostra a régua derivada só-leitura
        setAvisoTabela(dp.error || dk.error || '');
        setComponentes([]);
        const pseudo: Pend[] = [];
        for (const v of dv.veiculos || []) {
          (v.pendencias || []).forEach((t: string, i: number) => pseudo.push({
            id: `cad-${v.placa}-${i}`, veiculo_id: v.id, placa: v.placa, origem: 'cadastro', origem_ref: null,
            titulo: t, descricao: null, componente_id: null, data_ocorrencia: null, status: 'aberta',
            aberta_por: 'Sistema', aberta_em: '', resolvida_por: null, resolvida_em: null, resolucao: null,
            vinculo_tipo: null, vinculo_ref: null, foto_url: null, pseudo: true,
          }));
        }
        setRegistradas(pseudo);
      } else {
        setRegistradas(dp.pendencias || []);
        setComponentes(dk.componentes || []);
      }
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const compPorId = useMemo(() => new Map(componentes.map((c) => [c.id, c])), [componentes]);

  const todosGrupos = useMemo<Map<string, Grupo>>(() => {
    const porPlaca = new Map<string, Grupo>();
    for (const r of registradas) {
      if (r.status !== 'aberta' || !r.placa) continue;
      let g = porPlaca.get(r.placa);
      if (!g) {
        const v = veiculos.find((x) => x.placa === r.placa);
        g = {
          placa: r.placa,
          nome: v ? ([v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao || '') : '',
          responsavel: v?.responsavel_nome || null,
          imagem: v?.imagem_url || null,
          veiculoId: v?.id || null,
          abertas: [],
        };
        porPlaca.set(r.placa, g);
      }
      g.abertas.push(r);
    }
    return porPlaca;
  }, [veiculos, registradas]);

  const grupos = useMemo<Grupo[]>(() => {
    const q = busca.trim().toLowerCase();
    return [...todosGrupos.values()]
      .filter((g) => (filtro === 'todos' ? g.abertas.length > 0 : g.abertas.some((p) => p.origem === filtro)))
      .filter((g) => !q || [g.placa, g.nome, g.responsavel].some((s) => s && s.toLowerCase().includes(q)))
      .sort((a, b) => b.abertas.length - a.abertas.length);
  }, [todosGrupos, busca, filtro]);

  const aberto = abertoPlaca
    ? todosGrupos.get(abertoPlaca) || {
        placa: abertoPlaca,
        nome: (() => { const v = veiculos.find((x) => x.placa === abertoPlaca); return v ? ([v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao || '') : ''; })(),
        responsavel: veiculos.find((x) => x.placa === abertoPlaca)?.responsavel_nome || null,
        imagem: veiculos.find((x) => x.placa === abertoPlaca)?.imagem_url || null,
        veiculoId: veiculos.find((x) => x.placa === abertoPlaca)?.id || null,
        abertas: [],
      }
    : null;
  const resolvidasDaPlaca = useMemo(
    () => (abertoPlaca ? registradas.filter((r) => r.placa === abertoPlaca && r.status === 'resolvida') : []),
    [registradas, abertoPlaca],
  );

  const recorrencia = useCallback((placa: string, compId: string | null, dataNova?: string | null) => {
    if (!compId) return null;
    const hist = registradas
      .filter((r) => r.placa === placa && r.componente_id === compId && r.status === 'resolvida' && r.resolvida_em)
      .sort((a, b) => new Date(b.resolvida_em!).getTime() - new Date(a.resolvida_em!).getTime());
    if (hist.length === 0) return null;
    const ult = hist[0];
    const comp = compPorId.get(compId);
    const durouMeses = ult.resolvida_em ? mesesEntre(ult.resolvida_em, dataNova || new Date().toISOString()) : null;
    const vida = comp?.vida_util_meses ?? null;
    return { total: hist.length, ult, lista: hist.slice(0, 3), durouMeses, vida, prematuro: vida != null && durouMeses != null && durouMeses < vida };
  }, [registradas, compPorId]);

  const fecharModal = () => { setAbertoPlaca(null); setNovaAberta(false); setResolvendoId(null); setClassifId(null); setMostrarHistorico(false); };

  const salvarNova = async () => {
    if (!aberto || !nTitulo.trim()) { alert('Dê um título pra pendência.'); return; }
    if (!nResp.trim()) { alert('Escolha o responsável (usuário do portal) — é obrigatório.'); return; }
    setSalvandoNova(true);
    try {
      const r = await fetch('/api/frota/pendencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ placa: aberto.placa, veiculo_id: aberto.veiculoId, titulo: nTitulo.trim(), descricao: nDesc.trim(), componente_id: nCompId || null, data_ocorrencia: nData || null, responsavel: nResp.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar.');
      setRegistradas((prev) => [d.pendencia, ...prev]);
      setNovaAberta(false); setNTitulo(''); setNDesc(''); setNSistema(''); setNCompId('');
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    setSalvandoNova(false);
  };

  const confirmarResolucao = async () => {
    if (!resolvendoId) return;
    if (!rComo.trim()) { alert('Descreva como a pendência foi resolvida.'); return; }
    if (rTipo && !rRef.trim()) { alert(`Informe o número da ${rTipo === 'requisicao' ? 'requisição' : 'OS'}.`); return; }
    setSalvandoRes(true);
    try {
      const r = await fetch('/api/frota/pendencias', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id: resolvendoId, acao: 'resolver', resolucao: rComo.trim(), vinculo_tipo: rTipo || null, vinculo_ref: rRef.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao resolver.');
      setRegistradas((prev) => prev.map((p) => (p.id === d.pendencia.id ? d.pendencia : p)));
      setResolvendoId(null);
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    setSalvandoRes(false);
  };

  const confirmarClassif = async () => {
    if (!classifId || !cCompId) { alert('Escolha o componente.'); return; }
    setSalvandoClassif(true);
    try {
      const r = await fetch('/api/frota/pendencias', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id: classifId, acao: 'classificar', componente_id: cCompId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao classificar.');
      setRegistradas((prev) => prev.map((p) => (p.id === d.pendencia.id ? d.pendencia : p)));
      setClassifId(null); setCSistema(''); setCCompId('');
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    setSalvandoClassif(false);
  };

  const ngVeiculo = veiculos.find((v) => v.placa === ngPlaca);
  const salvarNovaGlobal = async () => {
    if (!ngPlaca) { alert('Escolha o veículo.'); return; }
    if (!ngTitulo.trim()) { alert('Dê um título pra pendência.'); return; }
    if (!ngResp.trim()) { alert('Escolha o responsável (usuário do portal) — é obrigatório.'); return; }
    setSalvandoNg(true);
    try {
      const r = await fetch('/api/frota/pendencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          placa: ngPlaca, veiculo_id: ngVeiculo?.id || null, titulo: ngTitulo.trim(), descricao: ngDesc.trim(),
          componente_id: ngCompId || null, data_ocorrencia: new Date().toISOString().slice(0, 10),
          km: ngKm, responsavel: ngResp.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar.');
      setRegistradas((prev) => [d.pendencia, ...prev]);
      setNgAberta(false);
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    setSalvandoNg(false);
  };

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--portal-text)', display: 'block', marginBottom: 5 };
  const secTit = (cor: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: cor, marginBottom: 8 });

  const badgeOrigem = (o: Origem) => {
    const c = ORIGEM_CFG[o];
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: c.cor, background: c.bg, borderRadius: 0, padding: '2px 7px' }}>
        <c.Icone size={10} /> {c.rot}
      </span>
    );
  };

  const vinculoView = (p: Pend) =>
    p.vinculo_tipo === 'requisicao' && p.vinculo_ref ? (
      <a href={`/requisicoes?req=${encodeURIComponent(p.vinculo_ref)}`} target="_blank" rel="noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1e40af', fontWeight: 600, textDecoration: 'none' }}>
        <Link2 size={12} /> Requisição #{p.vinculo_ref}
      </a>
    ) : p.vinculo_tipo === 'os' && p.vinculo_ref ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1e40af', fontWeight: 600 }}>
        <Link2 size={12} /> OS {p.vinculo_ref}
      </span>
    ) : null;

  const avisoRecorrencia = (placa: string, compId: string | null, dataRef?: string | null, excluirId?: string) => {
    // pendências ABERTAS no mesmo componente = possível DUPLICADA em curto período
    const abertasIguais = compId
      ? registradas.filter((r) => r.placa === placa && r.componente_id === compId && r.status === 'aberta' && r.id !== excluirId)
      : [];
    const rec = recorrencia(placa, compId, dataRef);
    if (!rec && abertasIguais.length === 0) return null;
    const comp = compPorId.get(compId!);
    if (!rec) {
      return (
        <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 0, fontSize: 13.5, lineHeight: 1.55, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 3 }}>
            <AlertTriangle size={13} /> Já existe {abertasIguais.length === 1 ? 'uma pendência ABERTA' : `${abertasIguais.length} pendências ABERTAS`} neste componente
          </div>
          {abertasIguais.slice(0, 3).map((a) => (
            <div key={a.id}>
              “{a.titulo}” — aberta por {a.aberta_por || '—'} em {fmtData(a.data_ocorrencia || a.aberta_em)}{' '}
              <a href={`/frota/pendencias?placa=${encodeURIComponent(placa)}&pend=${a.id}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>abrir →</a>
            </div>
          ))}
          <div style={{ marginTop: 3 }}>Confira se não é a mesma coisa antes de abrir outra.</div>
        </div>
      );
    }
    return (
      <>
      {abertasIguais.length > 0 && (
        <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 0, fontSize: 13.5, lineHeight: 1.55, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 3 }}>
            <AlertTriangle size={13} /> Já existe {abertasIguais.length === 1 ? 'uma pendência ABERTA' : `${abertasIguais.length} pendências ABERTAS`} neste componente
          </div>
          {abertasIguais.slice(0, 3).map((a) => (
            <div key={a.id}>
              “{a.titulo}” — aberta por {a.aberta_por || '—'} em {fmtData(a.data_ocorrencia || a.aberta_em)}{' '}
              <a href={`/frota/pendencias?placa=${encodeURIComponent(placa)}&pend=${a.id}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>abrir →</a>
            </div>
          ))}
          <div style={{ marginTop: 3 }}>Confira se não é a mesma coisa antes de abrir outra.</div>
        </div>
      )}
      <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 0, fontSize: 13.5, lineHeight: 1.55,
        background: rec.prematuro ? '#fef2f2' : '#eff6ff', border: `1px solid ${rec.prematuro ? '#fecaca' : '#bfdbfe'}`, color: rec.prematuro ? '#b91c1c' : '#1d4ed8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 3 }}>
          <History size={13} /> {rec.total === 1 ? 'Já houve pendência neste componente' : `Já houve ${rec.total} pendências neste componente`}
        </div>
        {rec.lista.map((h) => (
          <div key={h.id} style={{ marginBottom: 2 }}>
            “{h.titulo}” — aberta em {fmtData(h.data_ocorrencia || h.aberta_em)} por {h.aberta_por || '—'} ·
            <b> RESOLVIDA em {fmtData(h.resolvida_em)} por {h.resolvida_por || '—'}</b>
            {h.resolucao ? ` (${h.resolucao})` : ''}
            {h.vinculo_ref ? ` — ${h.vinculo_tipo === 'requisicao' ? 'Req.' : 'OS'} #${h.vinculo_ref}` : ''}{' '}
            <a href={`/frota/pendencias?placa=${encodeURIComponent(placa)}&pend=${h.id}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>abrir →</a>
          </div>
        ))}
        {rec.total > 3 && <div>… e mais {rec.total - 3} ocorrência{rec.total - 3 > 1 ? 's' : ''} no histórico.</div>}
        {rec.vida != null && rec.durouMeses != null && (
          <div style={{ marginTop: 4, fontWeight: rec.prematuro ? 700 : 500 }}>
            {rec.prematuro
              ? `⚠ Era pra durar mais: vida útil esperada de ~${rec.vida} meses${comp?.vida_util_km ? ` (${comp.vida_util_km.toLocaleString('pt-BR')} km)` : ''}, e durou só ${rec.durouMeses} ${rec.durouMeses === 1 ? 'mês' : 'meses'} desde a última resolução.`
              : `Vida útil esperada ~${rec.vida} meses — já se passaram ${rec.durouMeses} desde a última resolução.`}
          </div>
        )}
      </div>
      </>
    );
  };

  const contaOrigem = (g: Grupo, o: Origem) => g.abertas.filter((p) => p.origem === o).length;
  const pills = (g: Grupo) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {(['manual', 'requisicao', 'os', 'cadastro', 'checklist'] as Origem[]).map((o) => {
        const n = contaOrigem(g, o);
        if (!n) return null;
        const c = ORIGEM_CFG[o];
        return (
          <span key={o} style={{ fontSize: 11, fontWeight: 700, color: c.cor, background: c.bg, borderRadius: 999, padding: '2px 9px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <c.Icone size={11} /> {n} {c.rot.toLowerCase()}
          </span>
        );
      })}
    </div>
  );

  const fotoBox = (g: { imagem: string | null; placa: string }, h: number, radius: string) =>
    g.imagem ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={g.imagem} alt={g.placa} style={{ width: '100%', height: h, objectFit: 'cover', borderRadius: radius, display: 'block', background: 'var(--portal-bg-secondary)' }} />
    ) : (
      <div style={{ width: '100%', height: h, borderRadius: radius, background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text)' }}>
        <Car size={Math.min(36, h / 2.6)} />
      </div>
    );

  const sistemas = useMemo(() => [...new Set(componentes.map((c) => c.sistema))], [componentes]);
  const seletorComponente = (sistema: string, setSistema: (s: string) => void, compIdSel: string, setCompIdSel: (s: string) => void) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div>
        <label style={lbl}>Sistema</label>
        <select style={inp} value={sistema} onChange={(e) => { setSistema(e.target.value); setCompIdSel(''); }}>
          <option value="">Selecione…</option>
          {sistemas.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label style={lbl}>Subsistema / componente</label>
        <select style={inp} value={compIdSel} onChange={(e) => setCompIdSel(e.target.value)} disabled={!sistema}>
          <option value="">{sistema ? 'Selecione…' : 'Escolha o sistema antes'}</option>
          {componentes.filter((c) => c.sistema === sistema).map((c) => (
            <option key={c.id} value={c.id}>
              {[c.subsistema, c.componente].filter(Boolean).join(' › ') || 'Geral'}
              {c.vida_util_meses ? ` (vida ~${c.vida_util_meses}m)` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 28px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileWarning size={20} color="var(--portal-text)" />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Pendências por veículo</h1>
        </div>
        <button onClick={() => { setNgAberta(true); setNgPlaca(''); setNgTitulo(''); setNgKm(''); setNgSistema(''); setNgCompId(''); setNgDesc(''); setNgResp(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', padding: '9px 16px', border: 'none', borderRadius: 0, background: '#1e40af', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> Nova pendência
        </button>
        <div style={{ display: 'flex', gap: 2, border: '1px solid var(--portal-border)', borderRadius: 0, padding: 2, background: 'var(--portal-bg-card)' }}>
          {([['cards', LayoutGrid, 'Dashboard'], ['lista', List, 'Lista']] as const).map(([m, Icone, rot]) => (
            <button key={m} onClick={() => trocarModo(m)} title={rot}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 0, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600,
                background: modo === m ? '#1e40af' : 'transparent', color: modo === m ? '#fff' : 'var(--portal-text-secondary)' }}>
              <Icone size={14} /> {rot}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', minWidth: 240 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text)' }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar placa, modelo, responsável..." style={{ ...inp, padding: '9px 30px 9px 32px' }} />
          {busca && <X size={14} onClick={() => setBusca('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: 'var(--portal-text)' }} />}
        </div>
      </div>

      {erro && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 0, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, marginBottom: 16 }}>
          <AlertTriangle size={16} /> {erro}
        </div>
      )}
      {avisoTabela && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 0, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13, marginBottom: 16 }}>
          <AlertTriangle size={16} /> {avisoTabela} Enquanto isso a tela mostra a régua de cadastro só-leitura.
        </div>
      )}

      {carregando ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text)', fontSize: 14 }}>
          <Loader2 size={22} className="spin" style={{ marginBottom: 10 }} /><div>Carregando…</div>
        </div>
      ) : grupos.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text)', fontSize: 14 }}>
          {busca || filtro !== 'todos' ? 'Nada neste filtro.' : 'Nenhuma pendência — frota em dia! 🎉'}
        </div>
      ) : modo === 'cards' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(230px, 100%), 1fr))', gap: 14 }}>
          {grupos.map((g) => (
            <button key={g.placa} onClick={() => setAbertoPlaca(g.placa)}
              style={{ textAlign: 'left', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderLeft: '4px solid #1e40af', borderRadius: 0, overflow: 'hidden', cursor: 'pointer', padding: 0, transition: 'box-shadow .15s, transform .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 20px rgba(16,24,40,.10)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>
              {fotoBox(g, 120, '0')}
              <div style={{ padding: '10px 12px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.5, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{g.placa}</span>
                  <span style={{ fontSize: 12, color: 'var(--portal-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.nome}</span>
                </div>
                {g.responsavel ? (
                  <div style={{ fontSize: 12.5, color: 'var(--portal-text)', margin: '3px 0 7px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.responsavel}</div>
                ) : <div style={{ height: 7 }} />}
                {pills(g)}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderLeft: '4px solid #1e40af', borderRadius: 0, overflow: 'hidden' }}>
          {grupos.map((g, i) => (
            <button key={g.placa} onClick={() => setAbertoPlaca(g.placa)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '10px 14px', cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: i < grupos.length - 1 ? '1px solid var(--portal-border)' : 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <div style={{ width: 64, flexShrink: 0 }}>{fotoBox(g, 44, '8px')}</div>
              <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.5, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums', width: 90, flexShrink: 0 }}>{g.placa}</span>
              <span style={{ fontSize: 13, color: 'var(--portal-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.nome}{g.responsavel ? ` · ${g.responsavel}` : ''}
              </span>
              {pills(g)}
              <ChevronRight size={16} color="var(--portal-text-muted)" style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {/* ══════════ NOVA PENDÊNCIA (escolhe o carro) ══════════ */}
      {ngAberta && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setNgAberta(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 10500, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 0, width: '100%', maxWidth: 600, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: '1px solid rgba(0,0,0,0.5)' }}>
              <Plus size={17} color="#1e40af" />
              <div style={{ flex: 1, fontSize: 16, fontWeight: 800, color: 'var(--portal-text)' }}>Nova pendência</div>
              <button onClick={() => setNgAberta(false)} style={{ width: 30, height: 30, border: 'none', borderRadius: 0, cursor: 'pointer', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Veículo</label>
                <select style={inp} value={ngPlaca} autoFocus
                  onChange={(e) => { const p = e.target.value; setNgPlaca(p); const v = veiculos.find((x) => x.placa === p); setNgResp(v?.responsavel_nome || ''); }}>
                  <option value="">Selecione o carro…</option>
                  {veiculos
                    // só a frota ATIVA — sem vendidos, arquivados e inativos
                    .filter((v: any) => v.tipo_registro === 'veiculo' && v.placa && v.ativo && v.status !== 'vendido' && v.status !== 'arquivado')
                    .sort((a, b) => String(a.placa).localeCompare(String(b.placa)))
                    .map((v) => (
                      <option key={v.id} value={v.placa!}>
                        {v.placa} — {[v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao || ''}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Título da pendência</label>
                <input style={inp} spellCheck lang="pt-BR" value={ngTitulo} onChange={(e) => setNgTitulo(e.target.value)} placeholder="Ex: Câmbio raspando na 3ª marcha" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10 }}>
                <div>
                  <label style={lbl}>Km atual</label>
                  <input style={inp} inputMode="numeric" value={ngKm} onChange={(e) => setNgKm(e.target.value)} onBlur={(e) => setNgKm(formatarHodometro(e.target.value))} placeholder="Ex: 12.500" />
                </div>
                <div>
                  <label style={lbl}>Responsável (usuário do portal — obrigatório)</label>
                  <select style={inp} value={ngResp} onChange={(e) => setNgResp(e.target.value)}>
                    <option value="">Selecione…</option>
                    {[...new Set([ngVeiculo?.responsavel_nome || '', ...nomesResp].filter(Boolean))].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
              {seletorComponente(ngSistema, setNgSistema, ngCompId, setNgCompId)}
              <div>
                <label style={lbl}>Descrição</label>
                <input style={inp} spellCheck lang="pt-BR" value={ngDesc} onChange={(e) => setNgDesc(e.target.value)} placeholder="Detalhe o problema (opcional)" />
              </div>
              <div style={{ fontSize: 12, color: 'var(--portal-text)', background: 'var(--portal-bg-secondary)', padding: '8px 12px', borderRadius: 0 }}>
                📅 Data e hora são registradas automaticamente no momento do salvamento, junto com o seu nome.
              </div>
              {ngPlaca && avisoRecorrencia(ngPlaca, ngCompId || null, null)}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setNgAberta(false)} style={{ padding: '9px 15px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={salvarNovaGlobal} disabled={salvandoNg}
                  style={{ padding: '9px 18px', borderRadius: 0, border: 'none', background: '#1e40af', color: '#fff', fontSize: 13, fontWeight: 700, cursor: salvandoNg ? 'wait' : 'pointer' }}>
                  {salvandoNg ? 'Salvando…' : 'Abrir pendência'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MODAL DO VEÍCULO ══════════ */}
      {aberto && (
        <div onClick={(e) => { if (e.target === e.currentTarget) fecharModal(); }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 0, width: '100%', maxWidth: 960, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,.3)' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {fotoBox(aberto, 150, '0')}
              <button onClick={fecharModal}
                style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 0, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,.9)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={17} />
              </button>
            </div>
            <div style={{ padding: '14px 22px', borderBottom: '1px solid rgba(0,0,0,0.5)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{aberto.placa}</span>
              <span style={{ fontSize: 14, color: 'var(--portal-text)', flex: 1 }}>{aberto.nome}</span>
              {aberto.responsavel && <span style={{ fontSize: 13.5, color: 'var(--portal-text)' }}>Responsável: {aberto.responsavel}</span>}
            </div>

            <div style={{ padding: '16px 22px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* ── EM ABERTO ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ ...secTit('#1e3a8a'), marginBottom: 0, flex: 1 }}>
                    <Wrench size={13} /> Pendências em aberto ({aberto.abertas.length})
                  </div>
                  {!avisoTabela && (
                    <button onClick={() => { setNovaAberta(true); setNTitulo(''); setNDesc(''); setNResp(''); setNSistema(''); setNCompId(''); setNData(new Date().toISOString().slice(0, 10)); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 0, border: 'none', cursor: 'pointer', background: '#1e40af', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                      <Plus size={13} /> Registrar pendência
                    </button>
                  )}
                </div>

                {novaAberta && (
                  <div style={{ marginTop: 10, padding: 14, borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={lbl}>Título da pendência</label>
                      <input style={inp} spellCheck lang="pt-BR" value={nTitulo} onChange={(e) => setNTitulo(e.target.value)} placeholder="Ex: Câmbio raspando na 3ª marcha" autoFocus />
                    </div>
                    {seletorComponente(nSistema, setNSistema, nCompId, setNCompId)}
                    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10 }}>
                      <div>
                        <label style={lbl}>Data da ocorrência</label>
                        <input style={inp} type="date" value={nData} onChange={(e) => setNData(e.target.value)} />
                      </div>
                      <div>
                        <label style={lbl}>Responsável (usuário do portal — obrigatório)</label>
                        <select style={inp} value={nResp} onChange={(e) => setNResp(e.target.value)}>
                          <option value="">Selecione…</option>
                          {nomesResp.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>Descrição</label>
                      <input style={inp} spellCheck lang="pt-BR" value={nDesc} onChange={(e) => setNDesc(e.target.value)} placeholder="Detalhe o problema (opcional)" />
                    </div>
                    {avisoRecorrencia(aberto.placa, nCompId || null, nData ? `${nData}T12:00:00` : null)}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setNovaAberta(false)} style={{ padding: '8px 14px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                      <button onClick={salvarNova} disabled={salvandoNova}
                        style={{ padding: '8px 16px', borderRadius: 0, border: 'none', background: '#1e40af', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: salvandoNova ? 'wait' : 'pointer' }}>
                        {salvandoNova ? 'Salvando…' : 'Abrir pendência'}
                      </button>
                    </div>
                  </div>
                )}

                {aberto.abertas.length === 0 && !novaAberta && (
                  <div style={{ marginTop: 8, fontSize: 13.5, color: 'var(--portal-text)' }}>Nenhuma pendência em aberto neste veículo. 🎉</div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {aberto.abertas.map((p) => {
                    const comp = p.componente_id ? compPorId.get(p.componente_id) : undefined;
                    return (
                      <div key={p.id} style={{ border: p.id === pendDestaque ? '2px solid #f59e0b' : '1px solid var(--portal-border)', background: p.id === pendDestaque ? '#fffbeb' : undefined, borderRadius: 0, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)', lineHeight: 1.35 }}>{p.titulo}</span>
                              {badgeOrigem(p.origem)}
                              {comp && (
                                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, color: '#1e3a8a', background: '#dbeafe', borderRadius: 0, padding: '2px 8px' }}>
                                  {caminhoComp(comp)}
                                </span>
                              )}
                            </div>
                            {p.descricao && <div style={{ fontSize: 13.5, color: 'var(--portal-text)', marginTop: 5 }}>{p.descricao}</div>}
                            <div style={{ fontSize: 12.5, color: 'var(--portal-text)', marginTop: 5 }}>
                              Aberta por <b style={{ color: 'var(--portal-text)' }}>{p.aberta_por || '—'}</b>{p.aberta_em ? ` em ${fmtDataHora(p.aberta_em)}` : ''}
                              {p.data_ocorrencia ? ` · ocorreu em ${fmtData(p.data_ocorrencia)}` : ''}
                              {p.km ? ` · ${Number(p.km).toLocaleString('pt-BR')} km` : ''}
                              {p.responsavel ? ` · responsável: ${p.responsavel}` : ''}
                            </div>
                            {p.foto_url && (
                              <a href={p.foto_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: '#1e40af', textDecoration: 'none', marginTop: 3 }}>
                                <Camera size={12} /> ver foto do checklist
                              </a>
                            )}
                          </div>
                          {!p.pseudo && (
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              {!p.componente_id && classifId !== p.id && componentes.length > 0 && (
                                <button onClick={() => { setClassifId(p.id); setCSistema(''); setCCompId(''); }} title="Classificar no sistema/componente"
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 10px', borderRadius: 0, border: '1px solid var(--portal-border)', cursor: 'pointer', background: 'var(--portal-bg-card)', color: '#1e3a8a', fontSize: 12, fontWeight: 700 }}>
                                  <Tag size={12} /> Classificar
                                </button>
                              )}
                              {resolvendoId !== p.id && (
                                <button onClick={() => { setResolvendoId(p.id); setRComo(''); setRTipo(''); setRRef(''); }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 0, border: '1px solid #86efac', cursor: 'pointer', background: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 700 }}>
                                  <CheckCircle2 size={13} /> Resolver
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {avisoRecorrencia(p.placa, p.componente_id, p.data_ocorrencia ? `${p.data_ocorrencia}T12:00:00` : p.aberta_em || null, p.id)}

                        {classifId === p.id && (
                          <div style={{ marginTop: 10, padding: 12, borderRadius: 0, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', display: 'flex', flexDirection: 'column', gap: 9 }}>
                            {seletorComponente(cSistema, setCSistema, cCompId, setCCompId)}
                            {avisoRecorrencia(p.placa, cCompId || null, p.data_ocorrencia ? `${p.data_ocorrencia}T12:00:00` : null, p.id)}
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button onClick={() => setClassifId(null)} style={{ padding: '7px 13px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                              <button onClick={confirmarClassif} disabled={salvandoClassif}
                                style={{ padding: '7px 15px', borderRadius: 0, border: 'none', background: '#1e40af', color: '#fff', fontSize: 12, fontWeight: 700, cursor: salvandoClassif ? 'wait' : 'pointer' }}>
                                {salvandoClassif ? 'Salvando…' : 'Salvar classificação'}
                              </button>
                            </div>
                          </div>
                        )}

                        {resolvendoId === p.id && (
                          <div style={{ marginTop: 10, padding: 12, borderRadius: 0, background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: 9 }}>
                            {p.origem === 'cadastro' && (
                              <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 0, padding: '7px 10px' }}>
                                Pendência de cadastro fecha sozinha quando a Ficha é corrigida. Resolvendo na mão, ela reabre em 30 dias se a causa continuar.
                              </div>
                            )}
                            <div>
                              <label style={lbl}>Como foi resolvido?</label>
                              <textarea style={{ ...inp, resize: 'none', minHeight: 56 }} spellCheck lang="pt-BR" value={rComo} onChange={(e) => setRComo(e.target.value)} placeholder="Ex: Troca do kit de embreagem na oficina interna" />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              <div>
                                <label style={lbl}>Vincular a</label>
                                <select style={inp} value={rTipo} onChange={(e) => setRTipo(e.target.value as any)}>
                                  <option value="">Sem vínculo</option>
                                  <option value="requisicao">Requisição</option>
                                  <option value="os">OS do Pós-Vendas</option>
                                </select>
                              </div>
                              <div>
                                <label style={lbl}>{rTipo === 'os' ? 'Número da OS' : rTipo === 'requisicao' ? 'Nº da requisição (ID do card)' : 'Número'}</label>
                                <input style={inp} value={rRef} onChange={(e) => setRRef(e.target.value)} disabled={!rTipo} placeholder={rTipo ? 'Ex: 6423' : '—'} inputMode="numeric" />
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button onClick={() => setResolvendoId(null)} style={{ padding: '7px 13px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                              <button onClick={confirmarResolucao} disabled={salvandoRes}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 15px', borderRadius: 0, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: salvandoRes ? 'wait' : 'pointer' }}>
                                <CheckCircle2 size={13} /> {salvandoRes ? 'Salvando…' : 'Confirmar resolução'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── HISTÓRICO DE RESOLVIDAS ── */}
              {resolvidasDaPlaca.length > 0 && (
                <div>
                  <button onClick={() => setMostrarHistorico((v) => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', ...secTit('var(--portal-text-secondary)'), marginBottom: mostrarHistorico ? 8 : 0 }}>
                    <History size={13} /> Histórico de resolvidas ({resolvidasDaPlaca.length})
                    <ChevronDown size={13} style={{ transform: mostrarHistorico ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
                  </button>
                  {mostrarHistorico && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {resolvidasDaPlaca.map((p) => {
                        const comp = p.componente_id ? compPorId.get(p.componente_id) : undefined;
                        return (
                          <div key={p.id} style={{ border: p.id === pendDestaque ? '2px solid #f59e0b' : '1px solid var(--portal-border)', borderRadius: 0, padding: '10px 12px', background: p.id === pendDestaque ? '#fffbeb' : 'var(--portal-bg-secondary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <CheckCircle2 size={14} color="#16a34a" />
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>{p.titulo}</span>
                              {badgeOrigem(p.origem)}
                              {comp && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1e3a8a', background: '#dbeafe', borderRadius: 0, padding: '1px 7px' }}>{caminhoComp(comp)}</span>}
                            </div>
                            <div style={{ fontSize: 12.5, color: 'var(--portal-text)', marginTop: 4, lineHeight: 1.6 }}>
                              Aberta por <b style={{ color: 'var(--portal-text)' }}>{p.aberta_por || '—'}</b> em {fmtData(p.data_ocorrencia || p.aberta_em)} ·
                              resolvida por <b style={{ color: 'var(--portal-text)' }}>{p.resolvida_por || '—'}</b> em {fmtDataHora(p.resolvida_em)}
                              {p.resolucao && <div style={{ color: 'var(--portal-text)' }}>Como: {p.resolucao}</div>}
                              {vinculoView(p)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
