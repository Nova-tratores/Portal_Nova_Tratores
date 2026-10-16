'use client';
// Frota > Veículos — a régua de KPIs de saúde da frota em cima e o grid de
// VEÍCULOS inteiro embaixo (busca, rótulo de localização, Ficha no clique).
// Foi a "Visão geral" (/frota) até 10/10/2026; /frota agora é a aba Hoje.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Car, Search, Satellite, ShieldAlert, User as UserIcon, AlertTriangle,
  FileWarning, MapPin, OctagonAlert, Plus, Loader2, X,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { podeTelaFrota } from '@/lib/permissoes/frota';
import VeiculoDrawer from '@/components/frota/VeiculoDrawer';
import { CabecalhoFrota, KpiFrota, KpisFrota, SeloClasses, VazioFrota, CarregandoFrota } from '@/components/frota/ui';
import { SUBTIPOS_VEICULO, SUBTIPOS_DESTAQUE, labelSubtipo } from '@/lib/frota/tipos';
import type { MotoristaRH, VeiculoLista } from '@/lib/frota/tipos';

const fmtRS = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

interface Localizacao {
  rotulo: string;
  cidade: string | null;
  classe: string;
  dt: string | null;
  fonte: 'ao_vivo' | 'cache';
}

const COR_LOC: Record<string, string> = {
  loja: '#1e3a8a',
  cliente: '#1d4ed8', cliente_portal: '#1d4ed8',
  em_deslocamento: '#7c3aed',
  fora_geocerca: '#b45309',
};

export default function FrotaHome() {
  const { userProfile } = useAuth();
  const { pode, permissoes, isAdmin } = usePermissoes(userProfile?.id);
  const [veiculos, setVeiculos] = useState<VeiculoLista[]>([]);
  const [motoristas, setMotoristas] = useState<MotoristaRH[] | null>(null);
  const [locs, setLocs] = useState<Record<string, Localizacao>>({});
  // filtro pelos KPIs: só parados / com defeito / com cadastro a corrigir
  const [filtroClasse, setFiltroClasse] = useState<'parado' | 'defeito' | 'cadastro' | null>(null);
  const [carregou, setCarregou] = useState(false);
  const [busca, setBusca] = useState('');
  // Ativos = a frota de verdade; Vendidos/Arquivados = histórico (saíram)
  const [segmento, setSegmento] = useState<'ativos' | 'vendidos' | 'arquivados' | 'todos'>('ativos');
  const [placaAberta, setPlacaAberta] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  // cadastro de veículo novo (o Frota é o ÚNICO lugar de cadastro — Fase 5)
  const [novoAberto, setNovoAberto] = useState(false);
  const [novo, setNovo] = useState({ placa: '', marca: '', modelo: '', ano: '', tipo_veiculo: 'carro' });
  const [criando, setCriando] = useState(false);

  const criarVeiculo = async () => {
    if (!novo.placa.trim()) { alert('Informe a placa.'); return; }
    setCriando(true);
    try {
      const r = await fetch('/api/frota/veiculos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ ...novo, ano: novo.ano || undefined }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Falha ao cadastrar.'); return; }
      setNovoAberto(false);
      setNovo({ placa: '', marca: '', modelo: '', ano: '', tipo_veiculo: 'carro' });
      await carregar();
      setPlacaAberta(d.veiculo.placa); // já abre a Ficha pra completar os dados
    } catch (e) { alert(String(e)); } finally { setCriando(false); }
  };

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/frota/veiculos', { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); return; }
      setVeiculos(d.veiculos || []);
    } catch (e) { setErro(String(e)); }
    finally { setCarregou(true); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Link direto para a Ficha: /frota/veiculos?placa=ABC1D23 (usado pela aba Hoje,
  // pelo modal de abastecimentos e por quem compartilha o link)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('placa');
    if (p) setPlacaAberta(p.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  }, []);

  // Motoristas (RH) — pro KPI de CNH e o bloco-resumo embaixo. Só busca se a
  // pessoa pode ver a tela; falha → bloco some (é opcional, não derruba a home).
  const podeVerMotoristas = podeTelaFrota(permissoes?.modulos_permitidos ?? [], isAdmin, 'motoristas');
  useEffect(() => {
    if (!podeVerMotoristas) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/frota/motoristas/rh', { headers: await authHeaders() });
        if (!r.ok) return;
        const d = await r.json();
        if (vivo) setMotoristas(d.motoristas || []);
      } catch { /* resumo é opcional */ }
    })();
    return () => { vivo = false; };
  }, [podeVerMotoristas]);

  // km de cada carro com a fonte (âncora + delta, lib/frota/km.ts) — também chega depois
  const [kmPorPlaca, setKmPorPlaca] = useState<Record<string, { km: number | null; selo: string; descricao: string }>>({});
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/frota/km', { headers: await authHeaders() });
        if (!r.ok) return;
        const d = await r.json();
        if (vivo) setKmPorPlaca(d.km || {});
      } catch { /* linha de km é opcional */ }
    })();
    return () => { vivo = false; };
  }, []);

  // Localização atual (Rota Exata + geocode) — chega DEPOIS da lista, de
  // propósito: é externa e lenta; os cards aparecem na hora e os rótulos vão
  // pingando quando prontos.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/frota/localizacao', { headers: await authHeaders() });
        if (!r.ok) return;
        const d = await r.json();
        if (vivo) setLocs(d.localizacoes || {});
      } catch { /* rótulo é opcional */ }
    })();
    return () => { vivo = false; };
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return veiculos
      .filter((v) => v.tipo_registro === 'veiculo') // os "avulsos" não são carros
      .filter((v) =>
        segmento === 'todos' ? true :
        segmento === 'vendidos' ? v.status === 'vendido' :
        segmento === 'arquivados' ? v.status === 'arquivado' :
        v.ativo,
      )
      .filter((v) =>
        !q ||
        v.placa.toLowerCase().includes(q) ||
        (v.modelo || '').toLowerCase().includes(q) ||
        (v.marca || '').toLowerCase().includes(q) ||
        (v.descricao || '').toLowerCase().includes(q) ||
        (v.responsavel_nome || '').toLowerCase().includes(q),
      )
      .filter((v) =>
        !filtroClasse ||
        (filtroClasse === 'parado' ? !!v.classes?.parado :
         filtroClasse === 'defeito' ? (v.classes?.defeitos || 0) > 0 :
         (v.classes?.cadastro || 0) > 0 || (v.pendencias || []).length > 0),
      )
      // carros SEM FOTO vão pro fim (sort estável preserva o resto da ordem)
      .sort((a, b) => (a.imagem_url ? 0 : 1) - (b.imagem_url ? 0 : 1));
  }, [veiculos, busca, segmento, filtroClasse]);

  const soCarros = veiculos.filter((v) => v.tipo_registro === 'veiculo');
  const pendencias = soCarros.filter((v) => v.pendencia_vinculo).length;
  const ativosFrota = soCarros.filter((v) => v.ativo);
  const paradosN = ativosFrota.filter((v) => v.classes?.parado).length;
  const comDefeito = ativosFrota.filter((v) => (v.classes?.defeitos || 0) > 0).length;
  const comCadastro = ativosFrota.filter((v) => (v.classes?.cadastro || 0) > 0 || (v.pendencias || []).length > 0).length;
  const multasN = soCarros.reduce((s, v) => s + (v.multas_abertas || 0), 0);
  const multasRS = soCarros.reduce((s, v) => s + (v.valor_multas_abertas || 0), 0);
  const alternarFiltro = (c: 'parado' | 'defeito' | 'cadastro') => setFiltroClasse((f) => (f === c ? null : c));

  // motoristas (RH): só os ATIVOS contam pro KPI de CNH
  const motAtivos = (motoristas || []).filter((m) =>
    m.status_rh != null ? !['demitido', 'inativo'].includes(m.status_rh) : m.ativo_portal,
  );
  const motComPendencia = (motoristas || []).filter((m) => (m.pendencias || []).length > 0);

  return (
    <div className="frota-pg" style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>

      <CabecalhoFrota
        titulo="Veículos"
        resumo="A frota inteira com a situação de cada carro. Clique num número para filtrar a lista e num carro para abrir a Ficha."
      />

      {/* KPIs — cada número filtra a grade (clicar de novo tira o filtro) */}
      <KpisFrota>
        <KpiFrota
          rotulo="Parados" icone={<OctagonAlert size={14} />}
          valor={carregou ? String(paradosN) : '—'}
          contexto={`de ${ativosFrota.length} ativos${filtroClasse === 'parado' ? ' · filtrando' : ''}`}
          tom={paradosN > 0 ? 'ruim' : 'bom'}
          onClick={() => alternarFiltro('parado')}
          title="Problema crítico aberto ou marcado como parado/em manutenção na Ficha"
        />
        <KpiFrota
          rotulo="Com defeito" icone={<AlertTriangle size={14} />}
          valor={carregou ? String(comDefeito) : '—'}
          contexto={`conserto a programar${filtroClasse === 'defeito' ? ' · filtrando' : ''}`}
          tom={comDefeito > 0 ? 'atencao' : 'bom'}
          onClick={() => alternarFiltro('defeito')}
        />
        <KpiFrota
          rotulo="Cadastro a corrigir" icone={<FileWarning size={14} />}
          valor={carregou ? String(comCadastro) : '—'}
          contexto={`RENAVAM, CRLV, documentos${filtroClasse === 'cadastro' ? ' · filtrando' : ''}`}
          tom={comCadastro > 0 ? 'atencao' : 'bom'}
          onClick={() => alternarFiltro('cadastro')}
        />
        <KpiFrota
          rotulo="Multas em aberto" icone={<ShieldAlert size={14} />}
          valor={carregou ? String(multasN) : '—'}
          contexto={multasN > 0 ? fmtRS(multasRS) : 'nenhuma'}
          tom={multasN > 0 ? 'ruim' : 'bom'}
          href="/frota/multas"
        />
      </KpisFrota>

      {/* Grid de veículos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--portal-text)' }}>Veículos</h3>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>
          {filtrados.length} de {soCarros.length}
        </span>
        {pendencias > 0 && (
          <span title="Veículos que só apareceram no abastecimento — sem cadastro completo" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#b45309', background: '#fef3c7', borderRadius: 999, padding: '3px 10px' }}>
            <AlertTriangle size={12} /> {pendencias} com pendência de vínculo
          </span>
        )}
        <div style={{ flex: 1 }} />
        {/* Onde cada carro mora: Ativos = frota de verdade; Vendidos/Arquivados = histórico */}
        <div className="frota-seg" style={{ display: 'flex', border: '1px solid var(--portal-border)', borderRadius: 0, overflow: 'hidden', overflowX: 'auto', maxWidth: '100%' }}>
          {([
            ['ativos', `Ativos (${soCarros.filter((v) => v.ativo).length})`],
            ['vendidos', `Vendidos (${soCarros.filter((v) => v.status === 'vendido').length})`],
            ['arquivados', `Arquivados (${soCarros.filter((v) => v.status === 'arquivado').length})`],
            ['todos', 'Todos'],
          ] as ['ativos' | 'vendidos' | 'arquivados' | 'todos', string][]).map(([k, rotulo]) => (
            <button
              key={k}
              onClick={() => setSegmento(k)}
              className="frota-touch"
              style={{
                padding: '7px 12px', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
                background: segmento === k ? '#1e40af' : 'var(--portal-bg-input)',
                color: segmento === k ? '#fff' : 'var(--portal-text-secondary)',
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="frota-busca-box" style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Placa, modelo, responsável…"
            className="frota-busca frota-touch"
            style={{ padding: '8px 12px 8px 30px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13, width: 260 }}
          />
        </div>
        {pode('frota', 'veiculos:editar') && (
          <button
            onClick={() => setNovoAberto(true)}
            className="frota-touch frota-full-m"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 0, border: 'none', background: '#1e40af', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            <Plus size={15} /> Novo veículo
          </button>
        )}
      </div>

      {novoAberto && (
        <div onClick={() => setNovoAberto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 92vw)', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', background: 'var(--portal-bg)', borderRadius: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text)' }}>Novo veículo</strong>
              <button onClick={() => setNovoAberto(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text)' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--portal-text)' }}>
              O Frota é o único lugar de cadastro: o veículo já nasce disponível nas Requisições. Depois complete a Ficha (documentos, projeto Omie, FIPE…).
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
              {([['placa', 'Placa *', 'ABC-1D23'], ['marca', 'Marca', 'VW'], ['modelo', 'Modelo', 'Saveiro'], ['ano', 'Ano', '2025']] as [keyof typeof novo, string, string][]).map(([campo, rotulo, ph]) => (
                <label key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                  {rotulo}
                  <input
                    value={novo[campo]}
                    onChange={(e) => setNovo((f) => ({ ...f, [campo]: e.target.value }))}
                    placeholder={ph}
                    style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '8px 10px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13 }}
                  />
                </label>
              ))}
              <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>
                Tipo do veículo
                <select
                  value={novo.tipo_veiculo}
                  onChange={(e) => setNovo((f) => ({ ...f, tipo_veiculo: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13 }}
                >
                  {SUBTIPOS_VEICULO.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setNovoAberto(false)} style={{ padding: '8px 14px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={criarVeiculo} disabled={criando} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 0, border: 'none', background: '#1e40af', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {criando ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Cadastrar
              </button>
            </div>
          </div>
        </div>
      )}

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{erro}</div>}

      {!carregou && <CarregandoFrota linhas={6} />}
      {carregou && filtrados.length === 0 && !erro && (
        <VazioFrota
          titulo="Nenhum veículo neste filtro"
          texto={filtroClasse ? 'Nenhum carro com esse tipo de problema.' : 'Mude a busca ou o grupo (Ativos, Vendidos, Arquivados).'}
          acao={filtroClasse ? (
            <button type="button" onClick={() => setFiltroClasse(null)} style={{ padding: '7px 14px', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', cursor: 'pointer', fontSize: 13 }}>
              Tirar o filtro
            </button>
          ) : undefined}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 16 }}>
        {filtrados.map((v) => (
          <button
            key={v.id}
            className="frota-vcard"
            onClick={() => setPlacaAberta(v.placa)}
            title={(v.pendencias || []).length > 0 ? `Pendências:\n• ${v.pendencias.join('\n• ')}` : undefined}
            style={{
              textAlign: 'left', cursor: 'pointer',
              // estilo PPV: faixa colorida na lateral + bordas mais quadradas
              background: 'var(--portal-bg-card)',
              border: '1px solid var(--portal-border)',
              borderLeft: '4px solid #1e40af',
              borderRadius: 0, padding: 16, display: 'flex', gap: 14, alignItems: 'center',
              opacity: v.ativo ? 1 : 0.55, minWidth: 0,
            }}
          >
            {v.imagem_url ? (
              <img className="frota-vcard-img" src={v.imagem_url} alt="" style={{ width: 74, height: 74, borderRadius: 0, objectFit: 'cover', background: 'var(--portal-bg-secondary)', flexShrink: 0 }} />
            ) : (
              <div className="frota-vcard-img" style={{ width: 74, height: 74, borderRadius: 0, background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Car size={30} color="var(--portal-text)" />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 17, fontWeight: 800, color: 'var(--portal-text)' }}>{formatarPlaca(v.placa)}</strong>
                {v.tem_rastreador && <Satellite size={13} color="#1e3a8a" aria-label="Rastreado" />}
                {v.tipo_veiculo && SUBTIPOS_DESTAQUE.has(v.tipo_veiculo.toLowerCase()) && (
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: '#0369a1', background: '#e0f2fe', borderRadius: 999, padding: '2px 7px', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    {labelSubtipo(v.tipo_veiculo)}
                  </span>
                )}
                {v.status === 'vendido' && (
                  <span title={`Vendido${v.venda_comprador ? ` para ${v.venda_comprador}` : ''}${v.venda_data ? ` em ${new Date(`${v.venda_data}T00:00:00`).toLocaleDateString('pt-BR')}` : ''}`} style={{ fontSize: 10.5, fontWeight: 800, color: '#6d28d9', background: '#ede9fe', borderRadius: 999, padding: '2px 7px', letterSpacing: 0.4 }}>
                    VENDIDO
                  </span>
                )}
                {v.status === 'arquivado' && (
                  <span title={`Arquivado${v.arquivado_em ? ` em ${new Date(`${v.arquivado_em}T00:00:00`).toLocaleDateString('pt-BR')}` : ''}${v.arquivado_motivo ? ` — ${v.arquivado_motivo}` : ''}`} style={{ fontSize: 10.5, fontWeight: 800, color: '#475569', background: '#e2e8f0', borderRadius: 999, padding: '2px 7px', letterSpacing: 0.4 }}>
                    ARQUIVADO
                  </span>
                )}
                {v.classes ? <SeloClasses classes={v.classes} /> : (v.pendencias || []).length > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: '#b91c1c', background: '#fee2e2', borderRadius: 999, padding: '2px 7px', letterSpacing: 0.4 }}>
                    {v.pendencias.length} PENDÊNCIA{v.pendencias.length > 1 ? 'S' : ''}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[v.marca, v.modelo || v.descricao, v.ano].filter(Boolean).join(' · ') || '—'}
              </div>
              {kmPorPlaca[v.placa]?.km != null && (
                <div title={`De onde vem: ${kmPorPlaca[v.placa].descricao}`}
                  style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: ({ verde: '#15803d', ambar: '#b45309', vermelho: '#b91c1c', cinza: '#64748b' } as Record<string, string>)[kmPorPlaca[v.placa].selo] }}>●</span>
                  {' '}{Math.round(kmPorPlaca[v.placa].km as number).toLocaleString('pt-BR')} km · {kmPorPlaca[v.placa].descricao}
                </div>
              )}
              {(() => {
                const loc = locs[v.placa];
                if (!loc) return null;
                const cor = COR_LOC[loc.classe] || 'var(--portal-text-muted)';
                const quando = loc.dt ? new Date(loc.dt).toLocaleString('pt-BR') : '';
                return (
                  <div
                    title={`${loc.fonte === 'cache' ? 'Última posição conhecida' : 'Posição ao vivo'}${quando ? ` · ${quando}` : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 12.5, fontWeight: 600, color: cor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    <MapPin size={11} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {loc.cidade ? `${loc.cidade} — ` : ''}{loc.rotulo}
                    </span>
                  </div>
                );
              })()}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--portal-text)' }}>
                  <UserIcon size={12} /> {v.responsavel_nome || 'sem responsável'}
                </span>
                {v.multas_abertas > 0 && (
                  <span title={`${v.multas_abertas} multa(s) em aberto`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>
                    <ShieldAlert size={11} /> {v.multas_abertas} · {fmtRS(v.valor_multas_abertas)}
                  </span>
                )}
                {v.docs_vencendo > 0 && (
                  <span title={`${v.docs_vencendo} documento(s) vencido(s) ou vencendo em 30 dias`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: '#b45309' }}>
                    <FileWarning size={11} /> DOC
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Motoristas (RH) — resumo compacto; a aba completa é /frota/motoristas */}
      {podeVerMotoristas && motoristas && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={17} color="#1e40af" /> Motoristas
            </h3>
            <span style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>
              {motAtivos.length} ativos · {motAtivos.filter((m) => m.e_motorista).length} motoristas
              {motComPendencia.length > 0 && (
                <> · <strong style={{ color: '#b91c1c' }}>{motComPendencia.length} com pendência de CNH</strong></>
              )}
            </span>
            <div style={{ flex: 1 }} />
            <Link href="/frota/motoristas" className="frota-touch" style={{ fontSize: 12.5, fontWeight: 700, color: '#1e40af', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              Ver todos →
            </Link>
          </div>
          {motComPendencia.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>
              CNHs em dia ✓ — ninguém com pendência.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: 10 }}>
              {motComPendencia.slice(0, 8).map((m) => (
                <Link
                  key={m.rh_id || m.id}
                  href="/frota/motoristas"
                  title={`Pendências:\n• ${m.pendencias.join('\n• ')}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
                    background: 'rgba(220, 38, 38, 0.06)', border: '1px solid #ef4444',
                    borderRadius: 0, padding: '8px 12px',
                  }}
                >
                  {m.foto_url ? (
                    <img src={m.foto_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', background: 'var(--portal-bg-secondary)', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <UserIcon size={16} color="var(--portal-text-muted)" />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.nome}
                    </div>
                    <div style={{ fontSize: 12, color: '#b91c1c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.pendencias[0]}
                    </div>
                  </div>
                </Link>
              ))}
              {motComPendencia.length > 8 && (
                <Link href="/frota/motoristas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, color: '#1e40af', textDecoration: 'none', border: '1px dashed var(--portal-border)', borderRadius: 0, padding: '8px 12px' }}>
                  + {motComPendencia.length - 8} outros →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {placaAberta && (
        <VeiculoDrawer
          placa={placaAberta}
          podeEditar={pode('frota', 'veiculos:editar')}
          podeResponsavel={pode('frota', 'veiculos:responsavel')}
          podeDocumentos={pode('frota', 'documentos:editar')}
          onClose={() => setPlacaAberta(null)}
          onMudou={carregar}
        />
      )}
    </div>
  );
}
