'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Store, Search, Edit3, Trash2, CheckCircle2, RefreshCw, Plus,
  ArrowLeft, ChevronDown, ChevronUp, FileText, ChevronRight, User, Clock,
} from 'lucide-react';
import { anexosDaReq } from '@/lib/requisicoes/anexos';

// Valor pt-BR ("1.234,56" | "R$ 1.234,56" | número) -> number
function parseBR(v: any): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[R$\s.]/g, '').replace(',', '.');
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
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<any>(null);
  const [filtro, setFiltro] = useState('');
  const [view, setView] = useState<View>('lista');
  const autoEditConsumidoRef = useRef(false);

  // Estatísticas por fornecedor (recência/contagem/total) e mapa de usuários
  const [stats, setStats] = useState<Record<string, { count: number; last: string; total: number }>>({});
  const [usuarios, setUsuarios] = useState<{ id: Record<string, string>; email: Record<string, string> }>({ id: {}, email: {} });

  // Ficha
  const [fichaForn, setFichaForn] = useState<any>(null);
  const [fichaMeses, setFichaMeses] = useState<{ mes: string; total: number; reqs: any[]; topSol: { nome: string; count: number; total: number } | null }[]>([]);
  const [fichaLoading, setFichaLoading] = useState(false);
  const [mesAberto, setMesAberto] = useState<string | null>(null);

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
    const map: Record<string, { count: number; last: string; total: number }> = {};
    let from = 0; const step = 1000;
    for (;;) {
      const { data } = await supabase.from('Requisicao').select('fornecedor, created_at, valor_despeza').range(from, from + step - 1);
      if (!data || data.length === 0) break;
      for (const r of data) {
        const f = String(r.fornecedor || '').trim(); if (!f) continue;
        const k = f.toLowerCase();
        const e = map[k] || { count: 0, last: '', total: 0 };
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

  const novoFornecedor = () => { setEditando(null); setFormData(FORM_VAZIO); setCepStatus(''); setCnpjStatus(''); setCnpjAviso(''); ultimoCnpjRef.current = ''; setView('form'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
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
    if (confirm('Tem certeza que deseja remover este fornecedor permanentemente?')) {
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

  // ── Ficha ──
  const abrirFicha = async (forn: any) => {
    setFichaForn(forn); setView('ficha'); setFichaLoading(true); setFichaMeses([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
  const card: React.CSSProperties = { background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 14, boxShadow: '0 1px 3px rgba(15,20,30,0.05)' };
  const inp: React.CSSProperties = { width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--portal-text-muted)' };
  const btnRed: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 11, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
  const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const Avatar = ({ nome, size = 42 }: { nome: string; size?: number }) => (
    <span style={{ width: size, height: size, borderRadius: size * 0.3, background: `linear-gradient(135deg, ${corDe(nome)}, ${corDe(nome)}cc)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.34, flexShrink: 0 }}>{iniciais(nome)}</span>
  );

  // ════════════ FICHA ════════════
  if (view === 'ficha' && fichaForn) {
    const st = stats[String(fichaForn.nome || '').toLowerCase()];
    const anexoCor: Record<string, { bg: string; cor: string; label: string }> = {
      foto_nf: { bg: '#eef4ff', cor: '#2563eb', label: 'Nota' },
      recibo_fornecedor: { bg: '#e9faf3', cor: '#059669', label: 'Recibo' },
      boleto_fornecedor: { bg: '#fef6e7', cor: '#d97706', label: 'Boleto' },
    };
    return (
      <div style={{ animation: 'fadeIn .3s' }}>
        <button onClick={() => setView('lista')} style={{ ...btnGhost, marginBottom: 14 }}><ArrowLeft size={16} /> Voltar</button>
        <div style={{ ...card, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar nome={fichaForn.nome} size={52} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--portal-text)' }}>{fichaForn.nome}</div>
              <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', marginTop: 2 }}>
                {[fichaForn['cpf/cnpj'], fichaForn.numero, fichaForn.email].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
              </div>
            </div>
            <button onClick={() => iniciarEdicao(fichaForn)} style={btnGhost}><Edit3 size={14} /> Editar</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
            <div style={{ border: '1px solid var(--portal-border)', borderRadius: 12, padding: '12px 14px' }}><div style={lbl}>Requisições</div><div style={{ fontSize: 20, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>{st?.count || 0}</div></div>
            <div style={{ border: '1px solid var(--portal-border)', borderRadius: 12, padding: '12px 14px' }}><div style={lbl}>Valor total</div><div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginTop: 4 }}>{fmtBRL(st?.total || 0)}</div></div>
            <div style={{ border: '1px solid var(--portal-border)', borderRadius: 12, padding: '12px 14px' }}><div style={lbl}>Última compra</div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)', marginTop: 6 }}>{st?.last ? new Date(st.last).toLocaleDateString('pt-BR') : '—'}</div></div>
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--portal-text-muted)', margin: '20px 2px 11px' }}>Por mês</div>

        {fichaLoading ? (
          <div style={{ padding: 50, textAlign: 'center', color: 'var(--portal-text-muted)' }}><RefreshCw size={22} className="animate-spin" /><div style={{ marginTop: 8 }}>Carregando…</div></div>
        ) : fichaMeses.length === 0 ? (
          <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14 }}>Nenhuma requisição encontrada para este fornecedor.</div>
        ) : fichaMeses.map((m) => {
          const aberto = mesAberto === m.mes;
          return (
            <div key={m.mes} style={{ ...card, overflow: 'hidden', marginBottom: 12 }}>
              <div onClick={() => setMesAberto(aberto ? null : m.mes)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text)', textTransform: 'capitalize' }}>{mesNome(m.mes)}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '2px 9px', borderRadius: 999 }}>{m.reqs.length} {m.reqs.length === 1 ? 'req' : 'reqs'}</span>
                <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 800, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(m.total)}</span>
                {aberto ? <ChevronUp size={16} color="var(--portal-text-muted)" /> : <ChevronDown size={16} color="var(--portal-text-muted)" />}
              </div>
              {aberto && (
                <div style={{ borderTop: '1px solid var(--portal-border)', padding: '12px 16px' }}>
                  {m.topSol && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 9, padding: '8px 11px', marginBottom: 12 }}>
                      <User size={14} /> Quem mais solicitou: <b style={{ color: 'var(--portal-text)' }}>{m.topSol.nome}</b> — {m.topSol.count} {m.topSol.count === 1 ? 'req' : 'reqs'} · {fmtBRL(m.topSol.total)}
                    </div>
                  )}
                  {m.reqs.map((r) => {
                    const anexos = anexosDaReq(r);
                    return (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px dashed var(--portal-border)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo || 'Requisição'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{resolveNome(r.solicitante)} · {r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}{r.numero_nota ? ` · NF ${r.numero_nota}` : ''}</div>
                        </div>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtBRL(parseBR(r.valor_despeza))}</span>
                        <div style={{ display: 'flex', gap: 5 }}>
                          {anexos.length === 0 ? <span style={{ fontSize: 10.5, color: 'var(--portal-text-muted)' }}>sem anexo</span> : anexos.map((a) => {
                            const c = anexoCor[a.field] || { bg: 'var(--portal-bg-secondary)', cor: 'var(--portal-text-secondary)', label: a.label };
                            return <a key={a.field} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, textDecoration: 'none', background: c.bg, color: c.cor }}><FileText size={11} /> {c.label}</a>;
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
    );
  }

  // ════════════ FORMULÁRIO ════════════
  if (view === 'form') {
    const statusTxt = (s: string, aviso?: string) => s === 'buscando' ? <span style={{ color: '#2563eb', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}> · consultando…</span>
      : s === 'ok' ? <span style={{ color: '#059669', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}> · preenchido{aviso ? <span style={{ color: '#d97706' }}> · {aviso}</span> : ''}</span>
      : s === 'erro' ? <span style={{ color: '#dc2626', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}> · não encontrado, preencha à mão</span> : null;
    const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };
    const fg = (span2 = false): React.CSSProperties => ({ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: span2 ? 'span 2' : undefined });
    return (
      <div style={{ animation: 'fadeIn .3s', maxWidth: 720 }}>
        <button onClick={cancelarEdicao} style={{ ...btnGhost, marginBottom: 14 }}><ArrowLeft size={16} /> Voltar</button>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: editando ? '#fef2f2' : 'var(--portal-bg-secondary)', color: editando ? '#dc2626' : 'var(--portal-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{editando ? <Edit3 size={20} /> : <Store size={20} />}</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>{editando ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
          </div>

          {/* Identificação */}
          <div style={{ ...card, padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#dc2626', marginBottom: 14 }}>Identificação</div>
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
          <div style={{ ...card, padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#dc2626', marginBottom: 14 }}>Endereço <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--portal-text-muted)', fontWeight: 500 }}>— p/ Omie</span></div>
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
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#dc2626', marginBottom: 14 }}>Serviço</div>
            <div style={fg(true)}><span style={lbl}>Descrição do que fornece</span><input name="descricao" value={formData.descricao} onChange={handleChange} style={inp} placeholder="Ex: Peças agrícolas" /></div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={cancelarEdicao} style={btnGhost}>Cancelar</button>
            <button type="submit" style={btnRed}><CheckCircle2 size={16} /> {editando ? 'Salvar alterações' : 'Salvar fornecedor'}</button>
          </div>
        </form>
      </div>
    );
  }

  // ════════════ LISTA ════════════
  const filtroL = filtro.toLowerCase();
  const fornecedoresFiltrados = fornecedores.filter((f) => f.nome?.toLowerCase().includes(filtroL) || String(f['cpf/cnpj'] || '').includes(filtro) || String(f.descricao || '').toLowerCase().includes(filtroL));
  const recentes = !filtro ? [...fornecedores]
    .filter((f) => stats[String(f.nome || '').toLowerCase()]?.last)
    .sort((a, b) => (stats[String(b.nome || '').toLowerCase()]?.last || '').localeCompare(stats[String(a.nome || '').toLowerCase()]?.last || ''))
    .slice(0, 6) : [];
  const diasAtras = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`; };

  return (
    <div style={{ animation: 'fadeIn .3s' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar fornecedor por nome, CNPJ ou serviço…" style={{ ...inp, paddingLeft: 38, background: 'var(--portal-bg-card)' }} />
        </div>
        <button onClick={novoFornecedor} style={btnRed}><Plus size={16} /> Novo fornecedor</button>
      </div>

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: 'var(--portal-text-muted)' }}><RefreshCw size={22} className="animate-spin" /><div style={{ marginTop: 8 }}>Carregando…</div></div>
      ) : (
        <>
          {recentes.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 2px 11px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--portal-text-muted)' }}><Clock size={14} /> Usados recentemente</div>
              <div style={{ display: 'flex', gap: 11, overflowX: 'auto', paddingBottom: 4 }}>
                {recentes.map((f) => {
                  const s = stats[String(f.nome || '').toLowerCase()];
                  return (
                    <button key={f.id} onClick={() => abrirFicha(f)} style={{ ...card, flex: '0 0 auto', width: 210, padding: '13px 14px', textAlign: 'left', cursor: 'pointer' }}>
                      <Avatar nome={f.nome} size={40} />
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)', marginTop: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', marginTop: 3 }}>{s?.last ? diasAtras(s.last) : '—'} · {s?.count || 0} {s?.count === 1 ? 'req' : 'reqs'}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 2px 11px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--portal-text-muted)' }}>
            Todos os fornecedores <span style={{ fontWeight: 600, color: 'var(--portal-text-muted)' }}>· {fornecedoresFiltrados.length}</span>
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
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</div>
                    <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[f['cpf/cnpj'], f.numero, f.descricao].filter(Boolean).join(' · ') || 'Sem dados'}
                    </div>
                  </div>
                  {s?.count ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)' }}>{s.count} reqs</span> : null}
                  <button onClick={(e) => { e.stopPropagation(); iniciarEdicao(f); }} title="Editar" style={{ background: 'none', border: 'none', color: 'var(--portal-text-muted)', cursor: 'pointer', padding: 4 }}><Edit3 size={15} /></button>
                  <button onClick={(e) => { e.stopPropagation(); excluirFornecedor(f.id); }} title="Excluir" style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 4 }}><Trash2 size={15} /></button>
                  <ChevronRight size={16} color="var(--portal-text-muted)" />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
