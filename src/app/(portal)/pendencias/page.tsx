'use client';
// MÓDULO "PENDÊNCIAS (FROTA)" — abrir e acompanhar pendências dos carros.
// Acesso concedido no Admin (módulo 'pendencias'); quem tem o módulo Frota
// também entra. Pensado pro CELULAR: uma coluna, botões grandes, câmera
// direto no formulário.
//
// Regras de abertura:
//  - FOTO OBRIGATÓRIA do que está sendo apontado (câmera no celular)
//  - RESPONSÁVEL OBRIGATÓRIO = usuário do PORTAL (financeiro_usu)
//  - data/hora automáticas; km com máscara de quilometragem
// Grava em frota_pendencias (mesmo motor da aba Frota > Pendências).
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, Car, CheckCircle2, ChevronDown, Loader2, Plus, Search, Wrench, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { authHeaders } from '@/lib/auth/client';
import { supabase } from '@/lib/supabase';
import { formatarHodometro } from '@/lib/requisicoes/campos';

interface Veiculo {
  id: string; placa: string | null; marca?: string | null; modelo?: string | null; descricao?: string | null;
  tipo_registro?: string; ativo?: boolean; status?: string; responsavel_nome?: string | null; imagem_url?: string | null;
}
interface Componente { id: string; sistema: string; subsistema: string | null; componente: string | null; vida_util_meses: number | null; }
interface Pend {
  id: string; placa: string; origem: string; titulo: string; descricao: string | null;
  componente_id: string | null; status: string; aberta_por: string | null; aberta_em: string;
  resolvida_por: string | null; resolvida_em: string | null; resolucao: string | null;
  foto_url: string | null; km?: number | null; responsavel?: string | null; data_ocorrencia: string | null;
}

const fmtDataHora = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function PendenciasInner() {
  const { userProfile } = useAuth();
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [componentes, setComponentes] = useState<Componente[]>([]);
  const [pendencias, setPendencias] = useState<Pend[]>([]);
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [mostrarResolvidas, setMostrarResolvidas] = useState(false);

  // formulário de abertura
  const [fAberto, setFAberto] = useState(false);
  const [fPlaca, setFPlaca] = useState('');
  const [fTitulo, setFTitulo] = useState('');
  const [fFoto, setFFoto] = useState<File | null>(null);
  const [fFotoPreview, setFFotoPreview] = useState<string | null>(null);
  const [fSistema, setFSistema] = useState('');
  const [fCompId, setFCompId] = useState('');
  const [fKm, setFKm] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fResp, setFResp] = useState('');
  const [fCriarReq, setFCriarReq] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const h = await authHeaders();
      const [rv, rp, rk] = await Promise.all([
        fetch('/api/frota/veiculos', { headers: h }),
        fetch('/api/frota/pendencias?sync=1', { headers: h }),
        fetch('/api/frota/componentes', { headers: h }),
      ]);
      const dv = await rv.json(); const dp = await rp.json(); const dk = await rk.json();
      if (!rv.ok) throw new Error(dv.error || 'Falha ao carregar os veículos.');
      if (!rp.ok) throw new Error(dp.error || 'Falha ao carregar as pendências.');
      setVeiculos(dv.veiculos || []);
      setPendencias(dp.pendencias || []);
      setComponentes(rk.ok ? dk.componentes || [] : []);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('financeiro_usu').select('nome').order('nome');
        setUsuarios(((data || []) as { nome?: string }[]).map((u) => String(u.nome || '')).filter(Boolean));
      } catch { /* seletor fica vazio */ }
    })();
  }, []);

  const ativos = useMemo(
    () => veiculos
      .filter((v) => v.tipo_registro === 'veiculo' && v.placa && v.ativo && v.status !== 'vendido' && v.status !== 'arquivado')
      .sort((a, b) => String(a.placa).localeCompare(String(b.placa))),
    [veiculos],
  );
  const compPorId = useMemo(() => new Map(componentes.map((c) => [c.id, c])), [componentes]);
  const sistemas = useMemo(() => [...new Set(componentes.map((c) => c.sistema))], [componentes]);
  const nomeVeiculo = (placa: string) => {
    const v = veiculos.find((x) => x.placa === placa);
    return v ? [v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao || '' : '';
  };

  const q = busca.trim().toLowerCase();
  const filtra = (p: Pend) => !q || [p.placa, p.titulo, p.responsavel, p.aberta_por].some((s) => s && s.toLowerCase().includes(q));
  const abertas = pendencias.filter((p) => p.status === 'aberta').filter(filtra);
  const resolvidas = pendencias.filter((p) => p.status === 'resolvida').filter(filtra);

  const abrirForm = () => {
    setFAberto(true); setFPlaca(''); setFTitulo(''); setFFoto(null); setFFotoPreview(null);
    setFSistema(''); setFCompId(''); setFKm(''); setFDesc('');
    setFResp(userProfile?.nome || ''); // quem abre já vem como responsável (dá pra trocar)
    setFCriarReq(true);
  };
  const escolherFoto = (file: File | null) => {
    setFFoto(file);
    if (fFotoPreview) URL.revokeObjectURL(fFotoPreview);
    setFFotoPreview(file ? URL.createObjectURL(file) : null);
  };

  const salvar = async () => {
    if (!fPlaca) { alert('Escolha o veículo.'); return; }
    if (!fTitulo.trim()) { alert('Descreva a pendência (título).'); return; }
    if (!fFoto) { alert('Tire uma FOTO do que você está apontando — é obrigatória.'); return; }
    if (!fResp.trim()) { alert('Escolha o responsável (usuário do portal) — é obrigatório.'); return; }
    setSalvando(true);
    try {
      // 1) sobe a foto (mesmo bucket público das requisições)
      const nomeArq = `pendencias/${Date.now()}-${fFoto.name.replace(/[^a-zA-Z0-9.-]/g, '_') || 'foto.jpg'}`;
      const { error: eUp } = await supabase.storage.from('anexos').upload(nomeArq, fFoto);
      if (eUp) throw new Error('Falha ao enviar a foto: ' + eUp.message);
      const { data: pub } = supabase.storage.from('anexos').getPublicUrl(nomeArq);

      // 2) abre a pendência (data/hora automáticas no servidor)
      const v = veiculos.find((x) => x.placa === fPlaca);
      const r = await fetch('/api/frota/pendencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          placa: fPlaca, veiculo_id: v?.id || null, titulo: fTitulo.trim(), descricao: fDesc.trim(),
          componente_id: fCompId || null, data_ocorrencia: new Date().toISOString().slice(0, 10),
          km: fKm, responsavel: fResp.trim(), foto_url: pub.publicUrl, criar_requisicao: fCriarReq,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao abrir a pendência.');
      setPendencias((prev) => [d.pendencia, ...prev]);
      if (fCriarReq && d.requisicao_erro) alert(`Pendência aberta, mas a requisição NÃO foi criada: ${d.requisicao_erro}`);
      setFAberto(false);
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    setSalvando(false);
  };

  // aviso de pendências SEMELHANTES (mesmo carro + mesmo componente):
  // aberta = possível duplicada; resolvida há pouco = recorrência ("era pra durar mais")
  const avisoSemelhantes = () => {
    if (!fPlaca || !fCompId) return null;
    const abertasIguais = pendencias.filter((p) => p.placa === fPlaca && p.componente_id === fCompId && p.status === 'aberta');
    const resolvidasIguais = pendencias
      .filter((p) => p.placa === fPlaca && p.componente_id === fCompId && p.status === 'resolvida' && p.resolvida_em)
      .sort((a, b) => new Date(b.resolvida_em!).getTime() - new Date(a.resolvida_em!).getTime());
    if (abertasIguais.length === 0 && resolvidasIguais.length === 0) return null;
    const comp = compPorId.get(fCompId);
    const ult = resolvidasIguais[0];
    const durouMeses = ult ? Math.max(0, Math.round((Date.now() - new Date(ult.resolvida_em!).getTime()) / (30.44 * 86400_000))) : null;
    const prematuro = !!(comp?.vida_util_meses && durouMeses != null && durouMeses < comp.vida_util_meses);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {abertasIguais.length > 0 && (
          <div style={{ padding: '10px 12px', fontSize: 13.5, lineHeight: 1.55, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
            <b>⚠ Já existe {abertasIguais.length === 1 ? 'uma pendência ABERTA' : `${abertasIguais.length} pendências ABERTAS`} neste componente deste carro:</b>
            {abertasIguais.slice(0, 3).map((a) => (
              <div key={a.id}>
                “{a.titulo}” — por {a.aberta_por || '—'} em {fmtDataHora(a.aberta_em)}{' '}
                <a href={`/frota/pendencias?placa=${encodeURIComponent(fPlaca)}&pend=${a.id}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>abrir →</a>
              </div>
            ))}
            <div style={{ marginTop: 3 }}>Confira se não é a mesma coisa antes de abrir outra.</div>
          </div>
        )}
        {ult && (
          <div style={{ padding: '10px 12px', fontSize: 13.5, lineHeight: 1.55, background: prematuro ? '#fef2f2' : '#eff6ff', border: `1px solid ${prematuro ? '#fecaca' : '#bfdbfe'}`, color: prematuro ? '#b91c1c' : '#1d4ed8' }}>
            <b>{resolvidasIguais.length === 1 ? 'Já houve pendência neste componente:' : `Já houve ${resolvidasIguais.length} pendências neste componente:`}</b>
            {resolvidasIguais.slice(0, 3).map((h) => (
              <div key={h.id} style={{ marginTop: 2 }}>
                “{h.titulo}” — <b>RESOLVIDA em {fmtDataHora(h.resolvida_em)} por {h.resolvida_por || '—'}</b>{h.resolucao ? ` (${h.resolucao})` : ''}{' '}
                <a href={`/frota/pendencias?placa=${encodeURIComponent(fPlaca)}&pend=${h.id}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>abrir →</a>
              </div>
            ))}
            {resolvidasIguais.length > 3 && <div>… e mais {resolvidasIguais.length - 3} no histórico.</div>}
            {prematuro && (
              <div style={{ fontWeight: 700, marginTop: 3 }}>
                ⚠ Era pra durar mais: vida útil esperada de ~{comp!.vida_util_meses} meses, e faz só {durouMeses} {durouMeses === 1 ? 'mês' : 'meses'} desde a última resolução.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // fonte >=16px nos inputs pro iPhone não dar zoom
  const inp: React.CSSProperties = { width: '100%', padding: '12px 12px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 16, outline: 'none', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--portal-text)', display: 'block', marginBottom: 6 };

  const cardPend = (p: Pend, resolvida = false) => {
    const comp = p.componente_id ? compPorId.get(p.componente_id) : undefined;
    return (
      <div key={p.id} style={{ border: '1px solid var(--portal-border)', borderLeft: `4px solid ${resolvida ? '#16a34a' : '#dc2626'}`, background: 'var(--portal-bg-card)', padding: 12, display: 'flex', gap: 12 }}>
        {p.foto_url ? (
          <a href={p.foto_url} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.foto_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', background: 'var(--portal-bg-secondary)', display: 'block' }} />
          </a>
        ) : (
          <div style={{ width: 64, height: 64, background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text)', flexShrink: 0 }}>
            <Car size={24} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{p.placa}</span>
            <span style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>{nomeVeiculo(p.placa)}</span>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: resolvida ? '#16a34a' : '#dc2626', padding: '1px 8px', marginLeft: 'auto' }}>
              {resolvida ? 'RESOLVIDA' : 'ABERTA'}
            </span>
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--portal-text)', marginTop: 3 }}>{p.titulo}</div>
          {comp && (
            <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 700, color: '#1e3a8a', background: '#dbeafe', padding: '2px 8px' }}>
              {[comp.sistema, comp.subsistema, comp.componente].filter(Boolean).join(' › ')}
            </span>
          )}
          {p.descricao && <div style={{ fontSize: 13, color: 'var(--portal-text)', marginTop: 4 }}>{p.descricao}</div>}
          <div style={{ fontSize: 12, color: 'var(--portal-text)', marginTop: 4, lineHeight: 1.5 }}>
            Aberta por <b>{p.aberta_por || '—'}</b> em {fmtDataHora(p.aberta_em)}
            {p.km ? ` · ${Number(p.km).toLocaleString('pt-BR')} km` : ''}
            {p.responsavel ? ` · responsável: ${p.responsavel}` : ''}
            {resolvida && (
              <div style={{ color: '#15803d' }}>
                Resolvida por <b>{p.resolvida_por || '—'}</b> em {fmtDataHora(p.resolvida_em)}{p.resolucao ? ` — ${p.resolucao}` : ''}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 28px)', maxWidth: 860, margin: '0 auto' }}>
      {/* topo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Wrench size={20} color="#1e40af" />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)', margin: 0, flex: 1 }}>Pendências da Frota</h1>
        <button onClick={abrirForm}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px', border: 'none', borderRadius: 0, background: '#1e40af', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={17} /> Abrir pendência
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text)' }} />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar placa, título, responsável..." style={{ ...inp, padding: '12px 12px 12px 38px' }} />
      </div>

      {erro && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13.5, marginBottom: 14 }}>
          <AlertTriangle size={16} /> {erro}
        </div>
      )}

      {carregando ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text)', fontSize: 14 }}>
          <Loader2 size={22} className="spin" style={{ marginBottom: 10 }} /><div>Carregando…</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '4px 0 10px' }}>
            Em aberto ({abertas.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {abertas.length === 0 && <div style={{ fontSize: 14, color: 'var(--portal-text)' }}>Nenhuma pendência em aberto. 🎉</div>}
            {abertas.map((p) => cardPend(p))}
          </div>

          {resolvidas.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <button onClick={() => setMostrarResolvidas((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', width: '100%', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)' }}>
                <CheckCircle2 size={15} color="#16a34a" /> Resolvidas ({resolvidas.length})
                <ChevronDown size={15} style={{ marginLeft: 'auto', transform: mostrarResolvidas ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
              </button>
              {mostrarResolvidas && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {resolvidas.map((p) => cardPend(p, true))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════ FORMULÁRIO (tela cheia no celular) ══════════ */}
      {fAberto && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setFAberto(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(0px, 2vw, 16px)' }}>
          <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', width: '100%', maxWidth: 560, height: '100%', maxHeight: 'min(94vh, 900px)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', background: '#1e40af', color: '#fff' }}>
              <Plus size={18} />
              <div style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>Abrir pendência</div>
              <button onClick={() => setFAberto(false)} style={{ width: 34, height: 34, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,.18)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Veículo</label>
                <select style={inp} value={fPlaca} onChange={(e) => setFPlaca(e.target.value)}>
                  <option value="">Selecione o carro…</option>
                  {ativos.map((v) => (
                    <option key={v.id} value={v.placa!}>{v.placa} — {[v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao || ''}</option>
                  ))}
                </select>
              </div>

              {/* FOTO obrigatória — no celular abre a câmera direto */}
              <div>
                <label style={lbl}>Foto do problema (obrigatória)</label>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: fFotoPreview ? 0 : '26px 16px', border: `2px dashed ${fFoto ? '#16a34a' : '#dc2626'}`, cursor: 'pointer', background: 'var(--portal-bg-secondary)', overflow: 'hidden' }}>
                  {fFotoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fFotoPreview} alt="foto da pendência" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', display: 'block' }} />
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: '#dc2626' }}>
                      <Camera size={22} /> Tirar foto / escolher imagem
                    </span>
                  )}
                  <input type="file" accept="image/*" capture="environment" hidden
                    onChange={(e) => { escolherFoto(e.target.files?.[0] || null); e.target.value = ''; }} />
                </label>
                {fFoto && (
                  <button onClick={() => escolherFoto(null)} style={{ marginTop: 6, padding: '6px 12px', border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', fontSize: 12.5, cursor: 'pointer' }}>
                    Trocar foto
                  </button>
                )}
              </div>

              <div>
                <label style={lbl}>O que está com problema?</label>
                <input style={inp} spellCheck lang="pt-BR" value={fTitulo} onChange={(e) => setFTitulo(e.target.value)} placeholder="Ex: Pneu dianteiro esquerdo careca" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={lbl}>Sistema</label>
                  <select style={inp} value={fSistema} onChange={(e) => { setFSistema(e.target.value); setFCompId(''); }}>
                    <option value="">Selecione…</option>
                    {sistemas.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Componente</label>
                  <select style={inp} value={fCompId} onChange={(e) => setFCompId(e.target.value)} disabled={!fSistema}>
                    <option value="">{fSistema ? 'Selecione…' : 'Sistema antes'}</option>
                    {componentes.filter((c) => c.sistema === fSistema).map((c) => (
                      <option key={c.id} value={c.id}>{[c.subsistema, c.componente].filter(Boolean).join(' › ') || 'Geral'}</option>
                    ))}
                  </select>
                </div>
              </div>

              {avisoSemelhantes()}

              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
                <div>
                  <label style={lbl}>Km atual</label>
                  <input style={inp} inputMode="numeric" value={fKm} onChange={(e) => setFKm(e.target.value)} onBlur={(e) => setFKm(formatarHodometro(e.target.value))} placeholder="12.500" />
                </div>
                <div>
                  <label style={lbl}>Responsável (obrigatório)</label>
                  <select style={inp} value={fResp} onChange={(e) => setFResp(e.target.value)}>
                    <option value="">Selecione…</option>
                    {[...new Set([userProfile?.nome || '', ...usuarios].filter(Boolean))].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={lbl}>Detalhes (opcional)</label>
                <textarea style={{ ...inp, minHeight: 70, resize: 'none' }} spellCheck lang="pt-BR" value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Descreva melhor o problema…" />
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, color: 'var(--portal-text)', cursor: 'pointer', userSelect: 'none', lineHeight: 1.5 }}>
                <input type="checkbox" checked={fCriarReq} onChange={(e) => setFCriarReq(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1e40af', cursor: 'pointer', marginTop: 2 }} />
                <span>Criar a <strong>requisição de manutenção</strong> junto (com estas informações — a pendência fecha sozinha quando a requisição chegar no financeiro)</span>
              </label>

              <div style={{ fontSize: 12.5, color: 'var(--portal-text)', background: 'var(--portal-bg-secondary)', padding: '9px 12px' }}>
                📅 Data, hora e quem abriu são registrados automaticamente.
              </div>

              <button onClick={salvar} disabled={salvando}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '15px', border: 'none', background: '#1e40af', color: '#fff', fontSize: 16, fontWeight: 800, cursor: salvando ? 'wait' : 'pointer' }}>
                {salvando ? <Loader2 size={18} className="spin" /> : <CheckCircle2 size={18} />}
                {salvando ? 'Enviando…' : 'Abrir pendência'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PendenciasPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading } = usePermissoes(userProfile?.id);
  if (!loading && userProfile && !temAcesso('pendencias') && !temAcesso('frota')) return <SemPermissao />;
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text)' }}>Carregando…</div>}>
      <PendenciasInner />
    </Suspense>
  );
}
