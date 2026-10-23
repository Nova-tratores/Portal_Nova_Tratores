'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Store, Search, Edit3, Trash2, CheckCircle2, RefreshCw, Plus,
  ArrowLeft, ChevronDown, ChevronUp, FileText, ChevronRight, User, Clock,
  X, ExternalLink, Copy, Check,
} from 'lucide-react';
import { anexosDaReq } from '@/lib/requisicoes/anexos';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { parecencaNome } from '@/lib/requisicoes/casar-nota';

// nome exato no ilike (sem % e _ virarem curinga)
const ilikeExato = (s: string) => s.trim().replace(/[\\%_]/g, (c) => `\\${c}`);

// Valor monetário -> number. Aceita pt-BR ("1.234,56"), americano ("800.00")
// e número puro. Antes o ponto era SEMPRE tratado como milhar: "800.00"
// (gravado pelo app do técnico) virava 80.000 e estourava os totais.
function parseBR(v: any): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).replace(/[R$\s]/g, '');
  const temVirgula = s.includes(','), temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    // o separador mais à DIREITA é o decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (temVirgula) {
    s = s.replace(/\./g, '').replace(',', '.'); // decimal BR
  } else if (temPonto) {
    // só ponto: 1 ponto com 1–2 casas depois = decimal americano; senão é milhar
    const casas = s.length - s.lastIndexOf('.') - 1;
    const pontos = (s.match(/\./g) || []).length;
    if (!(pontos === 1 && casas >= 1 && casas <= 2)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const PALETA = ['#0EA5E9', '#10B981', '#F97316', '#8B5CF6', '#DC2626', '#0D9488', '#6B7280'];
const corDe = (nome: string) => PALETA[[...(nome || '?')].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETA.length];
const iniciais = (nome: string) => (nome || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const mesNome = (m: string) => {
  const [y, mm] = m.split('-'); if (!mm) return 'Sem data';
  return new Date(Number(y), Number(mm) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

type View = 'lista' | 'form' | 'ficha';

export default function FormFornecedor({ onSave, editarId }: { onSave: any; editarId?: string | null }) {
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<any>(null);
  const [filtro, setFiltro] = useState('');
  const [view, setView] = useState<View>('lista');
  const autoEditConsumidoRef = useRef(false);

  // Estatísticas por fornecedor (recência/contagem/total) e mapa de usuários
  const [stats, setStats] = useState<Record<string, { count: number; last: string; total: number; nome: string }>>({});
  // ordem da lista (lembrada no navegador) e lista "usados sem cadastro" aberta/fechada
  const [ordem, setOrdem] = useState<'uso' | 'gasto' | 'recente' | 'az'>(() => { try { return (localStorage.getItem('forn-ordem') as any) || 'uso'; } catch { return 'uso'; } });
  const [semCadAberto, setSemCadAberto] = useState(false);
  const [repetidosAberto, setRepetidosAberto] = useState(false);
  const [juntando, setJuntando] = useState<string | null>(null);
  const { log: auditLog } = useAuditLog();
  const [usuarios, setUsuarios] = useState<{ id: Record<string, string>; email: Record<string, string> }>({ id: {}, email: {} });

  // Ficha
  const [fichaForn, setFichaForn] = useState<any>(null);
  const [fichaMeses, setFichaMeses] = useState<{ mes: string; total: number; reqs: any[]; topSol: { nome: string; count: number; total: number } | null }[]>([]);
  const [fichaLoading, setFichaLoading] = useState(false);
  const [mesAberto, setMesAberto] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nome: '', numero: '', 'cpf/cnpj': '', descricao: '', email: '',
    cep: '', endereco: '', endereco_numero: '', bairro: '', cidade: '', estado: '',
  });
  const FORM_VAZIO = { nome: '', numero: '', 'cpf/cnpj': '', descricao: '', email: '', cep: '', endereco: '', endereco_numero: '', bairro: '', cidade: '', estado: '' };
  const [cepStatus, setCepStatus] = useState<'' | 'buscando' | 'ok' | 'erro'>('');
  const [cnpjStatus, setCnpjStatus] = useState<'' | 'buscando' | 'ok' | 'erro'>('');
  const [cnpjAviso, setCnpjAviso] = useState('');
  const ultimoCnpjRef = useRef('');

  const carregarFornecedores = async () => {
    setLoading(true);
    const { data } = await supabase.from('Fornecedores').select('*').order('nome', { ascending: true });
    if (data) setFornecedores(data);
    setLoading(false);
  };

  // Estatísticas das requisições por fornecedor (paginado; só 3 colunas).
  const carregarStats = useCallback(async () => {
    const map: Record<string, { count: number; last: string; total: number; nome: string }> = {};
    let from = 0; const step = 1000;
    for (;;) {
      const { data } = await supabase.from('Requisicao').select('fornecedor, created_at, valor_despeza').range(from, from + step - 1);
      if (!data || data.length === 0) break;
      for (const r of data) {
        const f = String(r.fornecedor || '').trim(); if (!f) continue;
        const k = f.toLowerCase();
        const e = map[k] || { count: 0, last: '', total: 0, nome: f };
        e.count++; if ((r.created_at || '') > e.last) e.last = r.created_at || '';
        e.total += parseBR(r.valor_despeza);
        map[k] = e;
      }
      if (data.length < step) break; from += step;
    }
    setStats(map);
  }, []);

  const carregarUsuarios = useCallback(async () => {
    const { data } = await supabase.from('financeiro_usu').select('id, nome, email');
    const byId: Record<string, string> = {}; const byEmail: Record<string, string> = {};
    for (const u of data || []) { if (u.id) byId[String(u.id)] = u.nome; if (u.email) byEmail[String(u.email).toLowerCase()] = u.nome; }
    setUsuarios({ id: byId, email: byEmail });
  }, []);

  const resolveNome = useCallback((sol: string) => {
    const s = String(sol || '').trim(); if (!s) return '—';
    if (s.includes('@')) return usuarios.email[s.toLowerCase()] || s;
    return usuarios.id[s] || s;
  }, [usuarios]);

  useEffect(() => { carregarFornecedores(); carregarStats(); carregarUsuarios(); }, [carregarStats, carregarUsuarios]);

  const iniciarEdicao = (forn: any) => {
    setEditando(forn);
    setFormData({
      nome: forn.nome || '', numero: forn.numero || '', 'cpf/cnpj': forn['cpf/cnpj'] || '',
      descricao: forn.descricao || '', email: forn.email || '', cep: forn.cep || '',
      endereco: forn.endereco || '', endereco_numero: forn.endereco_numero || '', bairro: forn.bairro || '',
      cidade: forn.cidade || '', estado: forn.estado || '',
    });
    setCepStatus(''); setCnpjStatus(''); setCnpjAviso(''); ultimoCnpjRef.current = '';
    setView('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (autoEditConsumidoRef.current) return;
    if (!editarId || fornecedores.length === 0) return;
    const alvo = fornecedores.find((f) => String(f.id) === String(editarId));
    if (alvo) { iniciarEdicao(alvo); autoEditConsumidoRef.current = true; }
  }, [editarId, fornecedores]);

  const novoFornecedor = (nome = '') => { setEditando(null); setFormData({ ...FORM_VAZIO, nome: nome.toUpperCase() }); setCepStatus(''); setCnpjStatus(''); setCnpjAviso(''); ultimoCnpjRef.current = ''; setView('form'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const cancelarEdicao = () => { setEditando(null); setFormData(FORM_VAZIO); setCepStatus(''); setCnpjStatus(''); setCnpjAviso(''); ultimoCnpjRef.current = ''; setView('lista'); };

  const formatarDoc = (v: string) => {
    const d = (v || '').replace(/\D/g, '').slice(0, 14);
    if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4').replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
  };

  const buscarCnpj = async (docRaw: string) => {
    const digits = (docRaw || '').replace(/\D/g, '');
    if (digits.length !== 14) { setCnpjStatus(''); setCnpjAviso(''); return; }
    if (ultimoCnpjRef.current === digits) return;
    ultimoCnpjRef.current = digits; setCnpjStatus('buscando'); setCnpjAviso('');
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) { setCnpjStatus('erro'); ultimoCnpjRef.current = ''; return; }
      const data = await res.json();
      const fone = String(data.ddd_telefone_1 || data.ddd_telefone_2 || '').replace(/\D/g, '');
      const foneFmt = fone.length >= 10 ? `(${fone.slice(0, 2)}) ${fone.slice(2, -4)}-${fone.slice(-4)}` : '';
      const cepDigits = String(data.cep || '').replace(/\D/g, '');
      const cepFmt = cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : '';
      const logradouro = data.logradouro ? `${String(data.descricao_tipo_de_logradouro || '')} ${String(data.logradouro)}`.trim() : '';
      setFormData((prev) => ({
        ...prev,
        nome: String(data.razao_social || data.nome_fantasia || prev.nome || '').toUpperCase(),
        email: prev.email || String(data.email || '').toLowerCase(),
        numero: prev.numero || foneFmt,
        descricao: prev.descricao || String(data.cnae_fiscal_descricao || '').toUpperCase(),
        cep: cepFmt || prev.cep,
        endereco: (logradouro || prev.endereco || '').toUpperCase(),
        endereco_numero: String(data.numero || prev.endereco_numero || '').toUpperCase(),
        bairro: String(data.bairro || prev.bairro || '').toUpperCase(),
        cidade: String(data.municipio || prev.cidade || '').toUpperCase(),
        estado: String(data.uf || prev.estado || '').toUpperCase(),
      }));
      if (!logradouro && cepFmt) buscarCep(cepFmt);
      const faltantes: string[] = [];
      if (!data.email) faltantes.push('e-mail');
      if (!foneFmt) faltantes.push('telefone');
      setCnpjAviso(faltantes.length ? `Receita sem ${faltantes.join(' e ')} — complete à mão` : '');
      setCnpjStatus('ok'); if (cepFmt) setCepStatus('ok');
    } catch { setCnpjStatus('erro'); ultimoCnpjRef.current = ''; }
  };

  const buscarCep = async (cepRaw: string) => {
    const digits = (cepRaw || '').replace(/\D/g, '');
    if (digits.length !== 8) { setCepStatus(''); return; }
    setCepStatus('buscando');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data?.erro) { setCepStatus('erro'); return; }
      setFormData((prev) => ({
        ...prev,
        endereco: (data.logradouro || prev.endereco || '').toUpperCase(),
        bairro: (data.bairro || prev.bairro || '').toUpperCase(),
        cidade: (data.localidade || prev.cidade || '').toUpperCase(),
        estado: (data.uf || prev.estado || '').toUpperCase(),
      }));
      setCepStatus('ok');
    } catch { setCepStatus('erro'); }
  };

  const excluirFornecedor = async (id: number) => {
    const forn = fornecedores.find((x) => x.id === id);
    const uso = stats[String(forn?.nome || '').toLowerCase()]?.count || 0;
    const aviso = uso ? `\n\nEle aparece em ${uso} requisição(ões) — elas continuam com o nome, só o cadastro sai.` : '';
    if (confirm(`Excluir o cadastro de ${forn?.nome || 'este fornecedor'}? Não dá para desfazer.${aviso}`)) {
      const { error } = await supabase.from('Fornecedores').delete().eq('id', id);
      if (!error) carregarFornecedores();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData({ ...formData, [e.target.name]: e.target.value.toUpperCase() });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editando) {
      const { error } = await supabase.from('Fornecedores').update(formData).eq('id', editando.id);
      if (!error) { alert('Fornecedor atualizado com sucesso!'); cancelarEdicao(); carregarFornecedores(); }
    } else {
      await onSave(formData);
      setFormData(FORM_VAZIO); setCepStatus(''); setCnpjStatus(''); setCnpjAviso(''); ultimoCnpjRef.current = '';
      setView('lista'); await carregarFornecedores();
    }
  };

  // ── Ficha (modal) ──
  const fecharFicha = () => setFichaForn(null);
  const abrirFicha = async (forn: any) => {
    setFichaForn(forn); setFichaLoading(true); setFichaMeses([]);
    const { data } = await supabase
      .from('Requisicao')
      .select('id, titulo, valor_despeza, solicitante, created_at, numero_nota, foto_nf, recibo_fornecedor, boleto_fornecedor, status')
      .ilike('fornecedor', forn.nome)
      .order('created_at', { ascending: false });
    const grupos = new Map<string, any[]>();
    for (const r of data || []) {
      const m = String(r.created_at || '').slice(0, 7) || 'sem-data';
      if (!grupos.has(m)) grupos.set(m, []);
      grupos.get(m)!.push(r);
    }
    const meses = [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([mes, reqs]) => {
      const total = reqs.reduce((s, r) => s + parseBR(r.valor_despeza), 0);
      const porSol = new Map<string, { count: number; total: number }>();
      for (const r of reqs) { const nome = resolveNome(r.solicitante); const e = porSol.get(nome) || { count: 0, total: 0 }; e.count++; e.total += parseBR(r.valor_despeza); porSol.set(nome, e); }
      const top = [...porSol.entries()].sort((a, b) => b[1].total - a[1].total)[0];
      return { mes, total, reqs, topSol: top ? { nome: top[0], ...top[1] } : null };
    });
    setFichaMeses(meses);
    setMesAberto(meses[0]?.mes || null);
    setFichaLoading(false);
  };

  // ── estilos ──
  const card: React.CSSProperties = { background: 'var(--surface, #fefefe)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 16, boxShadow: 'none' };
  const inp: React.CSSProperties = { width: '100%', padding: '13px 15px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--surface, #fefefe)', color: 'var(--portal-text)', fontSize: 15, outline: 'none', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { fontSize: 13, color: 'var(--portal-text-secondary, #475569)' };
  const btnRed: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 11, border: 'none', background: '#EA580C', color: '#fff', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' };
  const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
  const Avatar = ({ nome, size = 42 }: { nome: string; size?: number }) => (
    <span style={{ width: size, height: size, borderRadius: size * 0.3, background: `linear-gradient(135deg, ${corDe(nome)}, ${corDe(nome)}cc)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500, fontSize: size * 0.34, flexShrink: 0 }}>{iniciais(nome)}</span>
  );

  // ════════════ FICHA (MODAL) ════════════
  const renderFichaModal = () => {
    if (!fichaForn) return null;
    const st = stats[String(fichaForn.nome || '').toLowerCase()];
    const anexoCor: Record<string, { bg: string; cor: string; label: string }> = {
      foto_nf: { bg: '#eef4ff', cor: '#2563eb', label: 'Nota' },
      recibo_fornecedor: { bg: '#e9faf3', cor: '#059669', label: 'Recibo' },
      boleto_fornecedor: { bg: '#fef6e7', cor: '#d97706', label: 'Boleto' },
    };
    const kpi: React.CSSProperties = { border: '1px solid var(--portal-border)', borderRadius: 12, padding: '14px 16px', background: 'var(--portal-bg-secondary)' };
    const kpiLbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--portal-text-muted)' };
    // Todos os dados cadastrados, com botão de copiar em cada um
    const dadosForn: [string, string][] = [
      ['Razão social / Nome', String(fichaForn.nome || '')],
      ['CNPJ / CPF', String(fichaForn['cpf/cnpj'] || '')],
      ['Telefone / WhatsApp', String(fichaForn.numero || '')],
      ['E-mail', String(fichaForn.email || '')],
      ['Endereço', [fichaForn.endereco, fichaForn.endereco_numero].filter(Boolean).join(', ')],
      ['Bairro', String(fichaForn.bairro || '')],
      ['Cidade / UF', [fichaForn.cidade, fichaForn.estado].filter(Boolean).join(' - ')],
      ['CEP', String(fichaForn.cep || '')],
      ['Fornece', String(fichaForn.descricao || '')],
    ];
    const copiar = (chave: string, texto: string) => {
      navigator.clipboard?.writeText(texto).then(() => {
        setCopiado(chave);
        setTimeout(() => setCopiado((c) => (c === chave ? null : c)), 1600);
      }).catch(() => {});
    };
    const copiarTudo = () => copiar('__tudo__', dadosForn.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n'));
    return (
      <div
        onClick={fecharFicha}
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,20,30,.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isMobile ? '3vh 8px' : '5vh 16px', animation: 'fadeIn .18s' }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ ...card, width: '100%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.32)' }}
        >
          {/* Cabeçalho fixo */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: isMobile ? 10 : 16, padding: isMobile ? '14px 14px' : '20px 22px', borderBottom: '1px solid var(--portal-border)' }}>
            <Avatar nome={fichaForn.nome} size={58} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--portal-text)', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fichaForn.nome}</div>
              <div style={{ fontSize: 14, color: 'var(--portal-text-secondary)', marginTop: 4 }}>
                {[fichaForn['cpf/cnpj'], fichaForn.numero, fichaForn.email].filter(Boolean).join('  ·  ') || 'Sem contato cadastrado'}
              </div>
            </div>
            <button onClick={() => { fecharFicha(); iniciarEdicao(fichaForn); }} style={btnGhost}><Edit3 size={15} /> Editar</button>
            <button onClick={fecharFicha} title="Fechar" style={{ background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--portal-text-secondary)' }}><X size={20} /></button>
          </div>

          {/* Corpo rolável */}
          <div style={{ padding: isMobile ? '14px 12px' : '18px 22px', overflowY: 'auto' }}>
            {/* Dados cadastrais completos, com copiar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 10px' }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--portal-text-muted)' }}>Dados cadastrais</span>
              <button onClick={copiarTudo} style={{ ...btnGhost, padding: '6px 12px', fontSize: 12.5 }}>
                {copiado === '__tudo__' ? <><Check size={14} color="#059669" /> Copiado!</> : <><Copy size={14} /> Copiar tudo</>}
              </button>
            </div>
            <div style={{ ...card, padding: '4px 16px', marginBottom: 18, display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, 1fr)', columnGap: 24 }}>
              {dadosForn.map(([rot, val]) => (
                <div key={rot} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--portal-border)', minWidth: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--portal-text-muted)' }}>{rot}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: val ? 'var(--portal-text)' : 'var(--portal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={val || undefined}>{val || '—'}</div>
                  </div>
                  {val && (
                    <button onClick={() => copiar(rot, val)} title={`Copiar ${rot.toLowerCase()}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, borderRadius: 7, color: copiado === rot ? '#059669' : 'var(--portal-text-muted)', flexShrink: 0, display: 'flex' }}>
                      {copiado === rot ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, 1fr)', gap: 12 }}>
              <div style={kpi}><div style={kpiLbl}>Requisições</div><div style={{ fontSize: 26, fontWeight: 500, color: '#2563eb', marginTop: 5 }}>{st?.count || 0}</div></div>
              <div style={kpi}><div style={kpiLbl}>Valor total</div><div style={{ fontSize: 22, fontWeight: 500, color: '#059669', marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(st?.total || 0)}</div></div>
              <div style={kpi}><div style={kpiLbl}>Última compra</div><div style={{ fontSize: 18, fontWeight: 500, color: 'var(--portal-text)', marginTop: 8 }}>{st?.last ? new Date(st.last).toLocaleDateString('pt-BR') : '—'}</div></div>
            </div>

            <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--portal-text-muted)', margin: '22px 2px 12px' }}>Histórico por mês</div>

            {fichaLoading ? (
              <div style={{ padding: 50, textAlign: 'center', color: 'var(--portal-text-muted)' }}><RefreshCw size={22} className="animate-spin" /><div style={{ marginTop: 8 }}>Carregando…</div></div>
            ) : fichaMeses.length === 0 ? (
              <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 15 }}>Nenhuma requisição encontrada para este fornecedor.</div>
            ) : fichaMeses.map((m) => {
              const aberto = mesAberto === m.mes;
              return (
                <div key={m.mes} style={{ ...card, overflow: 'hidden', marginBottom: 12 }}>
                  <div onClick={() => setMesAberto(aberto ? null : m.mes)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 17px', cursor: 'pointer' }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--portal-text)', textTransform: 'capitalize' }}>{mesNome(m.mes)}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#EA580C', background: '#FFF7ED', padding: '3px 10px', borderRadius: 999 }}>{m.reqs.length} {m.reqs.length === 1 ? 'req' : 'reqs'}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 17, fontWeight: 500, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(m.total)}</span>
                    {aberto ? <ChevronUp size={18} color="var(--portal-text-muted)" /> : <ChevronDown size={18} color="var(--portal-text-muted)" />}
                  </div>
                  {aberto && (
                    <div style={{ borderTop: '1px solid var(--portal-border)', padding: '14px 17px' }}>
                      {m.topSol && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 9, padding: '10px 13px', marginBottom: 14 }}>
                          <User size={16} /> Quem mais solicitou: <b style={{ color: 'var(--portal-text)' }}>{m.topSol.nome}</b> — {m.topSol.count} {m.topSol.count === 1 ? 'req' : 'reqs'} · {fmtBRL(m.topSol.total)}
                        </div>
                      )}
                      {m.reqs.map((r) => {
                        const anexos = anexosDaReq(r);
                        return (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--portal-border)' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <a
                                href={`/requisicoes?req=${r.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir a requisição em nova aba"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 500, color: '#2563eb', textDecoration: 'none', maxWidth: '100%' }}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{r.id} · {r.titulo || 'Requisição'}</span>
                                <ExternalLink size={14} style={{ flexShrink: 0 }} />
                              </a>
                              <div style={{ fontSize: 13, color: 'var(--portal-text-muted)', marginTop: 2 }}>{resolveNome(r.solicitante)} · {r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}{r.numero_nota ? ` · NF ${r.numero_nota}` : ''}</div>
                            </div>
                            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtBRL(parseBR(r.valor_despeza))}</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {anexos.length === 0 ? <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>sem anexo</span> : anexos.map((a) => {
                                const c = anexoCor[a.field] || { bg: 'var(--portal-bg-secondary)', cor: 'var(--portal-text-secondary)', label: a.label };
                                return <a key={a.field} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, padding: '4px 9px', borderRadius: 7, textDecoration: 'none', background: c.bg, color: c.cor }}><FileText size={12} /> {c.label}</a>;
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ════════════ FORMULÁRIO ════════════
  if (view === 'form') {
    const statusTxt = (s: string, aviso?: string) => s === 'buscando' ? <span style={{ color: '#2563eb', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}> · consultando…</span>
      : s === 'ok' ? <span style={{ color: '#059669', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}> · preenchido{aviso ? <span style={{ color: '#d97706' }}> · {aviso}</span> : ''}</span>
      : s === 'erro' ? <span style={{ color: '#EA580C', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}> · não encontrado, preencha à mão</span> : null;
    const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '1fr 1fr', gap: 14 };
    const fg = (span2 = false): React.CSSProperties => ({ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: span2 && !isMobile ? 'span 2' : undefined });
    return (
      <div style={{ animation: 'fadeIn .3s', maxWidth: 680, margin: '0 auto' }}>
        <button onClick={cancelarEdicao} style={{ ...btnGhost, marginBottom: 16 }}><ArrowLeft size={16} /> Voltar</button>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20, textAlign: 'center' }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: editando ? '#FFF7ED' : 'var(--portal-bg-secondary)', color: editando ? '#EA580C' : 'var(--portal-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{editando ? <Edit3 size={23} /> : <Store size={23} />}</div>
            <h2 style={{ fontSize: 23, fontWeight: 500, color: 'var(--portal-text)', margin: 0 }}>{editando ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
          </div>

          {/* Identificação */}
          <div style={{ ...card, padding: isMobile ? '16px 14px' : '20px 22px', marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: '#EA580C', marginBottom: 16 }}>Identificação</div>
            <div style={grid}>
              <div style={fg()}>
                <span style={lbl}>CNPJ / CPF{statusTxt(cnpjStatus, cnpjAviso)}</span>
                <input name="cpf/cnpj" required inputMode="numeric" maxLength={18} value={formData['cpf/cnpj']} onChange={(e) => { const v = formatarDoc(e.target.value); setFormData((p) => ({ ...p, 'cpf/cnpj': v })); buscarCnpj(v); }} style={inp} placeholder="00.000.000/0001-00" />
              </div>
              <div style={fg()}><span style={lbl}>Telefone / WhatsApp</span><input name="numero" required value={formData.numero} onChange={handleChange} style={inp} placeholder="(14) 00000-0000" /></div>
              <div style={fg(true)}><span style={lbl}>Razão social / Nome</span><input name="nome" required value={formData.nome} onChange={handleChange} style={inp} placeholder="Digite o CNPJ acima (preenche sozinho) ou o nome" /></div>
              <div style={fg(true)}><span style={lbl}>E-mail <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--portal-text-muted)' }}>— p/ Omie</span></span><input name="email" type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} style={inp} placeholder="fornecedor@email.com" /></div>
            </div>
          </div>

          {/* Endereço */}
          <div style={{ ...card, padding: isMobile ? '16px 14px' : '20px 22px', marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: '#EA580C', marginBottom: 16 }}>Endereço <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--portal-text-muted)', fontWeight: 500 }}>— p/ Omie</span></div>
            <div style={grid}>
              <div style={fg()}><span style={lbl}>CEP{statusTxt(cepStatus)}</span><input name="cep" maxLength={9} value={formData.cep} onChange={(e) => { const v = e.target.value; setFormData((p) => ({ ...p, cep: v })); buscarCep(v); }} style={inp} placeholder="00000-000" /></div>
              <div style={fg()}><span style={lbl}>Cidade</span><input name="cidade" value={formData.cidade} onChange={handleChange} style={inp} placeholder="Ex: Piraju" /></div>
              <div style={fg(true)}><span style={lbl}>Endereço</span><input name="endereco" value={formData.endereco} onChange={handleChange} style={inp} placeholder="Rua / Av." /></div>
              <div style={fg()}><span style={lbl}>Número</span><input name="endereco_numero" value={formData.endereco_numero} onChange={handleChange} style={inp} placeholder="Nº" /></div>
              <div style={fg()}><span style={lbl}>Bairro</span><input name="bairro" value={formData.bairro} onChange={handleChange} style={inp} placeholder="Bairro" /></div>
              <div style={fg()}><span style={lbl}>Estado (UF)</span><input name="estado" maxLength={2} value={formData.estado} onChange={handleChange} style={inp} placeholder="SP" /></div>
            </div>
          </div>

          {/* Serviço */}
          <div style={{ ...card, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: '#EA580C', marginBottom: 16 }}>Serviço</div>
            <div style={fg(true)}><span style={lbl}>Descrição do que fornece</span><input name="descricao" value={formData.descricao} onChange={handleChange} style={inp} placeholder="Ex: Peças agrícolas" /></div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={cancelarEdicao} style={btnGhost}>Cancelar</button>
            <button type="submit" style={btnRed}><CheckCircle2 size={16} /> {editando ? 'Salvar alterações' : 'Salvar fornecedor'}</button>
          </div>
        </form>
      </div>
    );
  }

  // ════════════ LISTA ════════════
  const filtroL = filtro.toLowerCase();
  const st = (f: any) => stats[String(f.nome || '').toLowerCase()];
  const fornecedoresFiltrados = fornecedores
    .filter((f) => f.nome?.toLowerCase().includes(filtroL) || String(f['cpf/cnpj'] || '').includes(filtro) || String(f.descricao || '').toLowerCase().includes(filtroL))
    .sort((a, b) => ordem === 'az' ? String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
      : ordem === 'gasto' ? (st(b)?.total || 0) - (st(a)?.total || 0)
      : ordem === 'recente' ? (st(b)?.last || '').localeCompare(st(a)?.last || '')
      : (st(b)?.count || 0) - (st(a)?.count || 0));
  const mudarOrdem = (o: typeof ordem) => { setOrdem(o); try { localStorage.setItem('forn-ordem', o); } catch { /* sem storage */ } };
  // nomes usados nas requisições que não estão no cadastro (só os usados 2+ vezes — o resto é erro de digitação)
  const cadastrados = new Set(fornecedores.map((f) => String(f.nome || '').trim().toLowerCase()));
  const semCadastro = Object.entries(stats)
    .filter(([k, v]) => !cadastrados.has(k) && v.count >= 2 && (!filtroL || k.includes(filtroL)))
    .map(([, v]) => v).sort((a, b) => b.count - a.count);
  // nome sem cadastro → cadastro parecido (o mesmo fornecedor escrito de outro jeito)
  const parecidoCom = (nome: string) => {
    let melhor: any = null, p = 0;
    for (const f of fornecedores) { const x = parecencaNome(nome, f.nome); if (x > p) { p = x; melhor = f; } }
    return p >= 0.6 ? melhor : null;
  };
  // cadastros repetidos: mesmo CNPJ em mais de um cadastro
  const repetidos = (() => {
    const m = new Map<string, any[]>();
    for (const f of fornecedores) { const c = String(f['cpf/cnpj'] || '').replace(/\D/g, ''); if (c.length >= 11) (m.get(c) || m.set(c, []).get(c)!).push(f); }
    return [...m.values()].filter((l) => l.length > 1);
  })();
  /** Troca o nome do fornecedor nas requisições (de → para) e põe o CNPJ do cadastro onde está vazio. */
  const trocarNasRequisicoes = async (de: string, para: any) => {
    // pega as que CONTÊM o nome e confere o nome limpo (há fornecedor gravado com espaço sobrando)
    const alvo = de.trim().toLowerCase();
    const { data: cand, error: e1 } = await supabase.from('Requisicao').select('id, fornecedor').ilike('fornecedor', `%${ilikeExato(de)}%`).limit(2000);
    if (e1) throw e1;
    const ids = (cand || []).filter((r: any) => String(r.fornecedor || '').trim().toLowerCase() === alvo).map((r: any) => r.id);
    if (!ids.length) return 0;
    const { data, error } = await supabase.from('Requisicao').update({ fornecedor: para.nome }).in('id', ids).select('id');
    if (error) throw error;
    const cnpj = String(para['cpf/cnpj'] || '').trim();
    if (cnpj && data?.length) await supabase.from('Requisicao').update({ fornecedor_cnpj: cnpj }).in('id', data.map((r: any) => r.id)).or('fornecedor_cnpj.is.null,fornecedor_cnpj.eq.');
    return data?.length || 0;
  };
  const juntarNome = async (de: string, qtd: number, para: any) => {
    if (!confirm(`Trocar "${de}" por "${para.nome}" em ${qtd} requisição(ões)?\n\nÉ o mesmo fornecedor escrito de outro jeito. Depois disso o sistema consegue achar as notas dele no Omie.`)) return;
    setJuntando(de);
    try {
      const n = await trocarNasRequisicoes(de, para);
      auditLog({ sistema: 'requisicoes', acao: 'juntar_fornecedor', entidade: 'fornecedor', entidade_label: para.nome, detalhes: { de, para: para.nome, requisicoes: n } });
      await carregarStats();
    } catch (e: any) { alert('Não consegui juntar: ' + (e?.message || e)); }
    setJuntando(null);
  };
  const ficarCom = async (manter: any, grupo: any[]) => {
    const sair = grupo.filter((x) => x.id !== manter.id);
    const usos = sair.map((x) => stats[String(x.nome || '').toLowerCase()]?.count || 0).reduce((a, b) => a + b, 0);
    if (!confirm(`Ficar com "${manter.nome}" e apagar ${sair.map((x) => `"${x.nome}"`).join(', ')}?\n\n${usos} requisição(ões) passam a usar "${manter.nome}".`)) return;
    setJuntando(String(manter.id));
    try {
      let n = 0;
      for (const x of sair) {
        n += await trocarNasRequisicoes(x.nome, manter);
        const { error } = await supabase.from('Fornecedores').delete().eq('id', x.id);
        if (error) throw error;
      }
      auditLog({ sistema: 'requisicoes', acao: 'juntar_fornecedor', entidade: 'fornecedor', entidade_label: manter.nome, detalhes: { apagados: sair.map((x) => x.nome), requisicoes: n } });
      await carregarFornecedores(); await carregarStats();
    } catch (e: any) { alert('Não consegui juntar: ' + (e?.message || e)); }
    setJuntando(null);
  };
  const incompleto = (f: any) => !String(f['cpf/cnpj'] || '').replace(/\D/g, '') || !String(f.numero || '').trim();
  const recentes = !filtro ? [...fornecedores]
    .filter((f) => stats[String(f.nome || '').toLowerCase()]?.last)
    .sort((a, b) => (stats[String(b.nome || '').toLowerCase()]?.last || '').localeCompare(stats[String(a.nome || '').toLowerCase()]?.last || ''))
    .slice(0, 6) : [];
  const diasAtras = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`; };

  return (
    <div style={{ animation: 'fadeIn .3s' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 'min(220px, 100%)' }}>
          <Search size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar fornecedor por nome, CNPJ ou serviço…" style={{ ...inp, paddingLeft: 38, background: 'var(--portal-bg-card)' }} />
        </div>
        <button onClick={() => novoFornecedor()} style={btnRed}><Plus size={16} /> Novo fornecedor</button>
      </div>

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: 'var(--portal-text-muted)' }}><RefreshCw size={22} className="animate-spin" /><div style={{ marginTop: 8 }}>Carregando…</div></div>
      ) : (
        <>
          {recentes.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 2px 11px', fontSize: 11, fontWeight: 500, color: 'var(--portal-text-muted)' }}><Clock size={14} /> Usados recentemente</div>
              <div style={{ display: 'flex', gap: 11, overflowX: 'auto', paddingBottom: 4 }}>
                {recentes.map((f) => {
                  const s = stats[String(f.nome || '').toLowerCase()];
                  return (
                    <button key={f.id} onClick={() => abrirFicha(f)} style={{ ...card, flex: '0 0 auto', width: 210, padding: '13px 14px', textAlign: 'left', cursor: 'pointer' }}>
                      <Avatar nome={f.nome} size={40} />
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--portal-text)', marginTop: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', marginTop: 3 }}>{s?.last ? diasAtras(s.last) : '—'} · {s?.count || 0} {s?.count === 1 ? 'req' : 'reqs'}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {semCadastro.length > 0 && (
            <div style={{ ...card, marginTop: 18, overflow: 'hidden' }}>
              <div onClick={() => setSemCadAberto((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px', cursor: 'pointer' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', color: '#D97706', background: 'color-mix(in srgb, #D97706 9%, #fefefe)', border: '1px solid color-mix(in srgb, #D97706 18%, transparent)' }}><i className="fa-solid fa-store-slash" /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--portal-text)' }}>{semCadastro.length} fornecedores usados nas requisições sem cadastro</div>
                  <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>Sem cadastro não tem CNPJ nem telefone para cobrar a nota. Cadastre os mais usados.</div>
                </div>
                {semCadAberto ? <ChevronUp size={18} color="var(--portal-text-muted)" /> : <ChevronDown size={18} color="var(--portal-text-muted)" />}
              </div>
              {semCadAberto && semCadastro.slice(0, 40).map((v) => {
                const igual = parecidoCom(v.nome);
                return (
                  <div key={v.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid var(--border, #e2e8f0)', flexWrap: 'wrap' }}>
                    <Avatar nome={v.nome} size={34} />
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 14, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nome}</div>
                      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{v.count} reqs · {fmtBRL(v.total)}{v.last ? ` · última ${diasAtras(v.last)}` : ''}</div>
                      {igual && <div style={{ fontSize: 12.5, color: '#1d4ed8', marginTop: 2 }}><i className="fa-solid fa-code-merge" /> Parece ser: <span style={{ fontWeight: 500 }}>{igual.nome}</span></div>}
                    </div>
                    {igual && (
                      <button onClick={() => juntarNome(v.nome, v.count, igual)} disabled={juntando === v.nome} style={{ ...btnGhost, padding: '7px 12px', borderColor: '#93c5fd', color: '#1d4ed8' }}>
                        <i className="fa-solid fa-code-merge" /> {juntando === v.nome ? 'Juntando…' : 'É o mesmo, juntar'}
                      </button>
                    )}
                    <button onClick={() => novoFornecedor(v.nome)} style={{ ...btnGhost, padding: '7px 12px' }}><Plus size={14} /> Cadastrar</button>
                  </div>
                );
              })}
            </div>
          )}

          {repetidos.length > 0 && (
            <div style={{ ...card, marginTop: 12, overflow: 'hidden' }}>
              <div onClick={() => setRepetidosAberto((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px', cursor: 'pointer' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', color: '#DB2777', background: 'color-mix(in srgb, #DB2777 9%, #fefefe)', border: '1px solid color-mix(in srgb, #DB2777 18%, transparent)' }}><i className="fa-solid fa-clone" /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--portal-text)' }}>{repetidos.length} fornecedores cadastrados mais de uma vez (mesmo CNPJ)</div>
                  <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>Geralmente o nome fantasia e a razão social. Escolha com qual ficar: as requisições do outro passam para ele.</div>
                </div>
                {repetidosAberto ? <ChevronUp size={18} color="var(--portal-text-muted)" /> : <ChevronDown size={18} color="var(--portal-text-muted)" />}
              </div>
              {repetidosAberto && repetidos.map((grupo) => (
                <div key={grupo[0].id} style={{ borderTop: '1px solid var(--border, #e2e8f0)', padding: '8px 16px' }}>
                  <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginBottom: 4 }}>CNPJ {grupo[0]['cpf/cnpj']}</div>
                  {grupo.map((x: any) => {
                    const sx = stats[String(x.nome || '').toLowerCase()];
                    return (
                      <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', flexWrap: 'wrap' }}>
                        <Avatar nome={x.nome} size={30} />
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div style={{ fontSize: 14, color: 'var(--portal-text)' }}>{x.nome}</div>
                          <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{sx?.count || 0} reqs · {fmtBRL(sx?.total || 0)}{[x.numero, x.email].filter(Boolean).length ? ` · ${[x.numero, x.email].filter(Boolean).join(' · ')}` : ''}</div>
                        </div>
                        <button onClick={() => abrirFicha(x)} style={{ ...btnGhost, padding: '6px 11px' }}>Ver</button>
                        <button onClick={() => ficarCom(x, grupo)} disabled={juntando === String(x.id)} style={{ ...btnGhost, padding: '6px 11px', borderColor: '#f9a8d4', color: '#be185d' }}>
                          {juntando === String(x.id) ? 'Juntando…' : 'Ficar com este'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 2px 11px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--portal-text)' }}>Todos os fornecedores</span>
            <span style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>· {fornecedoresFiltrados.length}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([['uso', 'Mais usados'], ['gasto', 'Maior gasto'], ['recente', 'Recentes'], ['az', 'A–Z']] as const).map(([k, r]) => (
                <button key={k} onClick={() => mudarOrdem(k)} style={{ ...btnGhost, padding: '6px 11px', fontSize: 12.5, ...(ordem === k ? { borderColor: '#fdba74', background: '#fff7ed', color: '#c2410c' } : {}) }}>{r}</button>
              ))}
            </div>
          </div>
          <div style={{ ...card, overflow: 'hidden' }}>
            {fornecedoresFiltrados.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14 }}>Nenhum fornecedor encontrado.</div>
            ) : fornecedoresFiltrados.map((f) => {
              const s = stats[String(f.nome || '').toLowerCase()];
              return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: '1px solid var(--portal-border)', cursor: 'pointer' }}
                  onClick={() => abrirFicha(f)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                  <Avatar nome={f.nome} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</div>
                    <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[f['cpf/cnpj'], f.numero, f.descricao].filter(Boolean).join(' · ') || 'Sem dados'}
                    </div>
                  </div>
                  {incompleto(f) && <span title="Falta CNPJ ou telefone" style={{ fontSize: 11.5, padding: '2px 9px', borderRadius: 999, color: '#B45309', background: 'color-mix(in srgb, #D97706 10%, #fefefe)', whiteSpace: 'nowrap' }}>cadastro incompleto</span>}
                  {s?.count ? (
                    <div style={{ textAlign: 'right', minWidth: 110 }}>
                      <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: 'var(--portal-text)' }}>{fmtBRL(s.total)}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{s.count} reqs{s.last ? ` · ${diasAtras(s.last)}` : ''}</div>
                    </div>
                  ) : <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>sem uso</span>}
                  <button onClick={(e) => { e.stopPropagation(); iniciarEdicao(f); }} title="Editar" style={{ background: 'none', border: 'none', color: 'var(--portal-text-muted)', cursor: 'pointer', padding: 4 }}><Edit3 size={15} /></button>
                  <button onClick={(e) => { e.stopPropagation(); excluirFornecedor(f.id); }} title="Excluir" style={{ background: 'none', border: 'none', color: '#EA580C', cursor: 'pointer', padding: 4 }}><Trash2 size={15} /></button>
                  <ChevronRight size={16} color="var(--portal-text-muted)" />
                </div>
              );
            })}
          </div>
        </>
      )}
      {renderFichaModal()}
    </div>
  );
}
