'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Marketing → Consórcio (24/11/2026): o consórcio Mahindra no evento (Supersafra).
// Abas: Inscritos (quem concorre) · Sorteio (com telão) · Configurar (textos, prêmio, números) · Link e QR.
// A página do cliente é /consorcio/<slug>; cada cadastro vira lead sozinho (gatilho no banco).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  apiGet, apiEnviar, Painel, Titulo, Kpi, Vazio, Erro, Campo, estiloInput, estiloBotaoContorno, BotaoRosa, dataBR,
} from '@/components/marketing/ui';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { lerConfig, parcela, porDia, creditoComEmbutido, reais, numeroSorte, coordenadasValidas } from '@/lib/consorcio/conta';

type Aba = 'inscritos' | 'sorteio' | 'config' | 'link';

export default function ConsorcioEventoPortal() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('marketing', 'acoes:editar');

  const [dados, setDados] = useState<any>(null);
  const [eventoId, setEventoId] = useState<string>('');
  const [aba, setAba] = useState<Aba>('inscritos');
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback((id?: string) =>
    apiGet<any>(`/api/marketing/consorcio${id ? `?evento=${id}` : ''}`).then(
      (r) => { setDados(r); setEventoId(r.evento?.id || ''); setErro(null); },
      (e: any) => setErro(e?.message || 'Não foi possível carregar.'),
    ), []);
  // ?evento=<id> vem do botão "Inscritos e sorteio" das Páginas conectadas da campanha
  useEffect(() => { carregar(new URLSearchParams(window.location.search).get('evento') || undefined); }, [carregar]);

  async function novoEvento() {
    const nome = window.prompt('Nome do novo evento (ex.: Supersafra 2027):');
    if (!nome) return;
    try {
      const r = await apiEnviar<any>('/api/marketing/consorcio', 'POST', { nome });
      await carregar(r.evento.id);
      setAba('config');
    } catch (e: any) { alert(e.message); }
  }

  if (erro) return <div style={{ padding: 20 }}><Erro>{erro}</Erro></div>;
  if (!dados) return <div style={{ padding: 20 }}><Vazio>Carregando…</Vazio></div>;

  const ev = dados.evento;
  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--portal-text)' }}>Consórcio no evento</h2>
          {dados.eventos.length > 1 && (
            <select style={{ ...estiloInput, width: 'auto', fontSize: 14 }} value={eventoId} onChange={(e) => carregar(e.target.value)}>
              {dados.eventos.map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          )}
        </div>
        {podeEditar && <button style={estiloBotaoContorno} onClick={novoEvento}>+ Novo evento</button>}
      </div>

      {!ev ? (
        <Painel><Vazio>Nenhum evento ainda. Rode <code>sql/consorcio-evento.sql</code> no Supabase (ele já cria a Supersafra 2026).</Vazio></Painel>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Kpi rotulo="Inscritos no estande" valor={String(dados.inscricoes.length)} />
            <Kpi rotulo="Cliques no WhatsApp" valor={dados.cliques ? String(dados.cliques.total) : '—'}
              dica={dados.cliques ? 'Toques nos botões de WhatsApp da página de divulgação' : 'Falta rodar o SQL novo (tabela consorcio_cliques)'} />
            <Kpi rotulo="Página" valor={ev.ativo ? 'Aberta' : 'Fechada'} />
          </div>
          {dados.cliques?.total > 0 && <CliquesResumo c={dados.cliques} />}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--portal-border)' }}>
            {([['inscritos', 'Inscritos'], ['sorteio', 'Sorteio'], ['config', 'Configurar'], ['link', 'Link e QR code']] as [Aba, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setAba(k)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px', fontSize: 14,
                color: aba === k ? 'var(--portal-text)' : 'var(--portal-text-muted, #64748b)',
                borderBottom: aba === k ? '2px solid #DB2777' : '2px solid transparent', fontWeight: aba === k ? 600 : 400,
              }}>{l}</button>
            ))}
          </div>

          {aba === 'inscritos' && <Inscritos lista={dados.inscricoes} evento={ev} />}
          {aba === 'sorteio' && <Sorteio evento={ev} inscricoes={dados.inscricoes} sorteios={dados.sorteios} podeEditar={podeEditar} recarregar={() => carregar(ev.id)} />}
          {aba === 'config' && <Configurar evento={ev} acoes={dados.acoes} podeEditar={podeEditar} salvo={(id) => carregar(id)} />}
          {aba === 'link' && <LinkQr evento={ev} />}
        </>
      )}
    </div>
  );
}

// ── Cliques no WhatsApp (revisão de design, 24/11/2026): a página não tem formulário; isto mostra o que atrai ──
const LUGAR_LABEL: Record<string, string> = { topo: 'Topo', carta: 'Carta destaque', outras: 'Outras cartas', mapa: 'Onde será o evento', barra: 'Barra do celular' };
function ListaCliques({ titulo, itens, rotulo }: { titulo: string; itens: [string, number][]; rotulo?: (k: string) => string }) {
  return (
    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)', marginBottom: 6 }}>{titulo}</div>
      {itens.slice(0, 6).map(([k, n]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5, color: 'var(--portal-text)', padding: '3px 0' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rotulo ? rotulo(k) : k}</span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</b>
        </div>
      ))}
    </div>
  );
}

function CliquesResumo({ c }: { c: { total: number; porModelo: [string, number][]; porLugar: [string, number][]; porOrigem: [string, number][] } }) {
  return (
    <Painel>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <ListaCliques titulo="Por trator" itens={c.porModelo} />
        <ListaCliques titulo="Por lugar da página" itens={c.porLugar} rotulo={(k) => LUGAR_LABEL[k] || k} />
        <ListaCliques titulo="Por origem do link" itens={c.porOrigem} rotulo={(k) => (k === '(sem)' ? 'Link direto' : k)} />
      </div>
    </Painel>
  );
}

// ── Inscritos ────────────────────────────────────────────────────────────────
function Inscritos({ lista, evento }: { lista: any[]; evento: any }) {
  const [busca, setBusca] = useState('');
  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((i) => [i.nome, i.telefone, i.cidade, i.interesse, i.vendedor, numeroSorte(i.numero)].some((v) => v && String(v).toLowerCase().includes(t)));
  }, [lista, busca]);

  function baixarCsv() {
    const cab = ['numero', 'nome', 'telefone', 'cidade', 'interesse', 'credito_simulado', 'tem_trator', 'cadastrado_por', 'origem', 'utm', 'data_hora'];
    const linhas = lista.map((i) => [numeroSorte(i.numero), i.nome, i.telefone, i.cidade || '', i.interesse || '', i.credito ?? '',
      i.tem_trator === true ? 'sim' : i.tem_trator === false ? 'não' : '', i.vendedor || 'QR code', i.origem || '',
      i.utm ? Object.values(i.utm).join(' / ') : '', new Date(i.criado_em).toLocaleString('pt-BR')]);
    const csv = [cab, ...linhas].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `inscritos-${evento.slug}.csv`;
    a.click();
  }

  return (
    <Painel>
      <Titulo acao={<div style={{ display: 'flex', gap: 8 }}>
        <Link href="/marketing/leads" style={{ ...estiloBotaoContorno, textDecoration: 'none' }}>Ver em Leads</Link>
        <button style={estiloBotaoContorno} onClick={baixarCsv} disabled={!lista.length}>Baixar planilha</button>
      </div>}>Quem concorre ({lista.length})</Titulo>
      <input style={{ ...estiloInput, marginBottom: 12 }} placeholder="Buscar por nome, telefone, cidade, número…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {!filtrada.length ? <Vazio>{lista.length ? 'Nada encontrado.' : 'Ninguém se cadastrou ainda.'}</Vazio> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: 'var(--portal-text)' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--portal-text-muted, #64748b)', fontSize: 12 }}>
                {['Nº', 'Nome', 'WhatsApp', 'Cidade', 'Interesse', 'Simulou', 'Cadastrado por', 'Origem', 'Quando'].map((h) => <th key={h} style={{ padding: '6px 8px', fontWeight: 500 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtrada.map((i) => (
                <tr key={i.id} style={{ borderTop: '1px solid var(--portal-border)' }}>
                  <td style={{ padding: '8px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{numeroSorte(i.numero)}</td>
                  <td style={{ padding: '8px' }}>{i.nome}</td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                    <a href={`https://wa.me/55${String(i.telefone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{i.telefone}</a>
                  </td>
                  <td style={{ padding: '8px' }}>{i.cidade || ''}</td>
                  <td style={{ padding: '8px' }}>{i.interesse || ''}</td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{i.credito ? reais(Number(i.credito), 0) : ''}</td>
                  <td style={{ padding: '8px' }}>{i.vendedor || 'QR code'}</td>
                  <td style={{ padding: '8px' }}>{i.origem || ''}</td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{new Date(i.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Painel>
  );
}

// ── Sorteio (e o telão) ──────────────────────────────────────────────────────
function Sorteio({ evento, inscricoes, sorteios, podeEditar, recarregar }: { evento: any; inscricoes: any[]; sorteios: any[]; podeEditar: boolean; recarregar: () => void }) {
  const [telao, setTelao] = useState(false);
  const jaSairam = new Set(sorteios.map((s) => s.inscricao_id));
  const restantes = inscricoes.filter((i) => !jaSairam.has(i.id)).length;

  async function marcar(s: any, situacao: 'valido' | 'ausente') {
    try { await apiEnviar('/api/marketing/consorcio/sortear', 'PATCH', { sorteio_id: s.id, situacao }); recarregar(); }
    catch (e: any) { alert(e.message); }
  }

  return (
    <>
      <Painel>
        <Titulo>Sorteio {evento.premio ? `· ${evento.premio}` : ''}</Titulo>
        <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--portal-text-muted, #64748b)' }}>
          {inscricoes.length} inscritos · {restantes} ainda podem sair. Quem já saiu não sai de novo.
          Se o ganhador não estiver presente, marque <strong>Ausente</strong> e sorteie outra vez.
        </p>
        <BotaoRosa onClick={() => setTelao(true)} disabled={!podeEditar || !restantes}>Abrir o telão do sorteio</BotaoRosa>
        {!podeEditar && <p style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>Só quem pode editar ações do Marketing sorteia.</p>}
      </Painel>

      <Painel>
        <Titulo>Histórico dos giros</Titulo>
        {!sorteios.length ? <Vazio>Nenhum giro ainda.</Vazio> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorteios.map((s, idx) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--portal-border)', opacity: s.situacao === 'ausente' ? 0.6 : 1 }}>
                <span style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>{idx + 1}º giro</span>
                <strong style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{numeroSorte(s.numero)}</strong>
                <span style={{ flex: 1, minWidth: 140 }}>{s.nome}</span>
                <span style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
                  {new Date(s.sorteado_em).toLocaleString('pt-BR')}{s.sorteado_por ? ` · ${s.sorteado_por}` : ''}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: s.situacao === 'ausente' ? '#dc2626' : '#16a34a' }}>{s.situacao === 'ausente' ? 'Ausente' : 'Ganhador'}</span>
                {podeEditar && (
                  <button style={{ ...estiloBotaoContorno, padding: '5px 10px', fontSize: 12 }} onClick={() => marcar(s, s.situacao === 'ausente' ? 'valido' : 'ausente')}>
                    {s.situacao === 'ausente' ? 'Voltar a ganhador' : 'Marcar ausente'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Painel>

      {telao && <Telao evento={evento} inscricoes={inscricoes} fechar={() => { setTelao(false); recarregar(); }} />}
    </>
  );
}

function Telao({ evento, inscricoes, fechar }: { evento: any; inscricoes: any[]; fechar: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [fase, setFase] = useState<'pronto' | 'girando' | 'revelado'>('pronto');
  const [mostrando, setMostrando] = useState<any>(null);
  const [ganhador, setGanhador] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    caixa.current?.requestFullscreen?.().catch(() => { /* sem tela cheia: segue na janela */ });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') sair(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sair() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    fechar();
  }

  async function girar() {
    setErro(null); setGanhador(null); setFase('girando');
    // 1º o servidor escolhe (e grava); a animação é só o show
    const pedido = apiEnviar<any>('/api/marketing/consorcio/sortear', 'POST', { evento_id: evento.id });
    const inicio = Date.now();
    const DURACAO = 5000;
    await new Promise<void>((fim) => {
      const passo = () => {
        const t = (Date.now() - inicio) / DURACAO;
        if (t >= 1) return fim();
        setMostrando(inscricoes[Math.floor(Math.random() * inscricoes.length)]);
        setTimeout(passo, 50 + 350 * t * t);   // começa rápido e vai freando
      };
      passo();
    });
    try {
      const r = await pedido;
      setGanhador(r.sorteio);
      setMostrando(r.sorteio);
      setFase('revelado');
    } catch (e: any) {
      setErro(e.message); setFase('pronto'); setMostrando(null);
    }
  }

  const n = mostrando ? numeroSorte(mostrando.numero) : '???';
  return (
    <div ref={caixa} style={{
      position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24,
      background: 'radial-gradient(circle at 50% 35%, #8f0b20 0%, #3a0510 55%, #0d0204 100%)', color: '#fff', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24,
    }}>
      <style>{`@keyframes cs-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
        @keyframes cs-brilho{0%,100%{text-shadow:0 0 30px rgba(255,210,0,.5)}50%{text-shadow:0 0 70px rgba(255,210,0,.95)}}`}</style>
      <button onClick={sair} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer' }}>Fechar (Esc)</button>
      <div style={{ fontSize: 'clamp(16px,2.4vw,28px)', letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.85 }}>
        Consórcio Mahindra · {evento.nome}
      </div>
      {evento.premio && <div style={{ fontSize: 'clamp(22px,3.4vw,44px)', fontWeight: 700 }}>🎁 {evento.premio}</div>}
      <div key={fase === 'revelado' ? 'r' : 'g'} style={{
        fontSize: 'clamp(120px,24vw,360px)', fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        color: fase === 'revelado' ? '#ffd200' : '#fff', animation: fase === 'revelado' ? 'cs-pop .6s ease-out, cs-brilho 1.6s ease-in-out infinite .6s' : undefined,
      }}>{n}</div>
      <div style={{ minHeight: '1.3em', fontSize: 'clamp(26px,4.5vw,64px)', fontWeight: 700 }}>
        {fase === 'revelado' && ganhador ? `${ganhador.nome}${ganhador.cidade ? ` · ${ganhador.cidade}` : ''}` : fase === 'girando' ? (mostrando?.nome?.split(' ')[0] || '') : ''}
      </div>
      {erro && <div style={{ background: 'rgba(0,0,0,.4)', padding: '10px 16px', borderRadius: 10 }}>{erro}</div>}
      <button onClick={girar} disabled={fase === 'girando'} style={{
        fontSize: 'clamp(18px,2.2vw,28px)', fontWeight: 800, padding: '18px 44px', borderRadius: 18, border: 0, cursor: fase === 'girando' ? 'wait' : 'pointer',
        background: '#ffd200', color: '#3a0510', boxShadow: '0 10px 30px rgba(0,0,0,.4)', opacity: fase === 'girando' ? 0.6 : 1,
      }}>{fase === 'girando' ? 'Sorteando…' : fase === 'revelado' ? 'Sortear outro' : 'SORTEAR'}</button>
      <div style={{ fontSize: 14, opacity: 0.6 }}>{inscricoes.length} participantes · sorteio feito no servidor e registrado</div>
    </div>
  );
}

// ── Configurar ───────────────────────────────────────────────────────────────
const isoParaLocal = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function Configurar({ evento, acoes, podeEditar, salvo }: { evento: any; acoes: any[]; podeEditar: boolean; salvo: (id: string) => void }) {
  const cfg0 = lerConfig(evento.config);
  const [f, setF] = useState<any>({
    nome: evento.nome || '', local: evento.local || '', cidade: evento.cidade || '', inicio: evento.inicio || '', fim: evento.fim || '',
    sorteio_em: isoParaLocal(evento.sorteio_em), premio: evento.premio || '', regulamento: evento.regulamento || '',
    ativo: !!evento.ativo, acao_id: evento.acao_id || '',
  });
  // números gerais (taxas, prazo) e textos
  const [c, setC] = useState<any>({
    administradora: cfg0.administradora || '', whatsapp: cfg0.whatsapp || '', prazo_meses: cfg0.prazo_meses, taxa_adm_pct: cfg0.taxa_adm_pct,
    fundo_reserva_pct: cfg0.fundo_reserva_pct, seguro_pct: cfg0.seguro_pct, lance_embutido_pct: cfg0.lance_embutido_pct,
    lance_fixo_pct: cfg0.lance_fixo_pct ?? '', destaque: cfg0.destaque || '',
    endereco: cfg0.endereco || '', coordenadas: cfg0.coordenadas || '', abertura: cfg0.abertura || '08:00', horario: cfg0.horario || '',
    estande_local: cfg0.estande_local || '', whatsapp_evento: cfg0.whatsapp_evento || '',
    vendedoresTxt: (cfg0.vendedores || []).map((v) => `${v.nome}; ${v.whatsapp}`).join('\n'),
    destaquesTxt: (cfg0.destaques || []).join('\n'), condicoesTxt: (cfg0.condicoes || []).join('\n'),
  });
  // cada grupo com as suas datas; cada trator ligado a um grupo e com a sua foto
  const [grupos, setGrupos] = useState<any[]>(cfg0.grupos?.length ? cfg0.grupos : [{ grupo: '', vencimento: '', proxima_assembleia: '' }]);
  const [modelos, setModelos] = useState<any[]>(cfg0.modelos?.length ? cfg0.modelos : [{ nome: '', codigo: '', credito: '', grupo: '', foto: '' }]);
  const [sa, setSa] = useState<any>(cfg0.super_assembleia || { grupo: '', quando: '', cartas: '', por_mes: '' });
  const [desc, setDesc] = useState<any>(cfg0.desconto_parcela || { numero: 3, pct: '' });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cfgAtual = lerConfig({ ...c, modelos });
  const muda = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const mudaC = (k: string) => (e: any) => setC((x: any) => ({ ...x, [k]: e.target.value }));
  const linhas = (t: string) => String(t || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const mudaLista = (set: (fn: (l: any[]) => any[]) => void, i: number, k: string) => (e: any) =>
    set((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)));

  async function salvar() {
    setSalvando(true); setMsg(null);
    try {
      // parte da config que esta tela não edita (se houver) é mantida
      const config = {
        ...(evento.config || {}),
        administradora: c.administradora || null,
        whatsapp: String(c.whatsapp || '').replace(/\D/g, '') || null,
        prazo_meses: Number(c.prazo_meses), taxa_adm_pct: Number(c.taxa_adm_pct), fundo_reserva_pct: Number(c.fundo_reserva_pct),
        seguro_pct: Number(String(c.seguro_pct).replace(',', '.')), lance_embutido_pct: Number(c.lance_embutido_pct),
        lance_fixo_pct: Number(c.lance_fixo_pct) || null, destaque: String(c.destaque || '').trim() || null,
        endereco: String(c.endereco || '').trim() || null, coordenadas: coordenadasValidas(c.coordenadas) || null, abertura: /^\d{1,2}:\d{2}$/.test(c.abertura) ? c.abertura : '08:00',
        horario: String(c.horario || '').trim() || null, estande_local: String(c.estande_local || '').trim() || null,
        whatsapp_evento: String(c.whatsapp_evento || '').replace(/\D/g, '') || null,
        vendedores: linhas(c.vendedoresTxt).map((l) => { const [nome, tel] = l.split(/[;,]/); return { nome: String(nome || '').trim(), whatsapp: String(tel || '').replace(/\D/g, '') }; })
          .filter((v) => v.nome && v.whatsapp),
        destaques: linhas(c.destaquesTxt), condicoes: linhas(c.condicoesTxt),
        grupos: grupos.filter((g) => String(g.grupo || '').trim())
          .map((g) => ({
            grupo: String(g.grupo).trim(), vencimento: g.vencimento || null, proxima_assembleia: g.proxima_assembleia || null,
            ...(Array.isArray(g.calendario) && g.calendario.length ? { calendario: g.calendario } : {}),   // meses seguintes, se houver
          })),
        modelos: modelos.filter((m) => m.nome && Number(m.credito) > 0).map((m) => ({
          nome: String(m.nome).trim(), codigo: String(m.codigo || '').trim(), credito: Number(m.credito),
          grupo: String(m.grupo || '').trim() || undefined, foto: String(m.foto || '').trim() || undefined,
        })),
        super_assembleia: Number(sa.cartas) > 0 && String(sa.quando || '').trim()
          ? { grupo: String(sa.grupo || '').trim() || undefined, quando: String(sa.quando).trim(), cartas: Number(sa.cartas), por_mes: Number(sa.por_mes) || undefined, total_ate: Number(sa.total_ate) || undefined }
          : null,
        desconto_parcela: Number(desc.pct) > 0 ? { numero: Number(desc.numero) || 3, pct: Number(desc.pct) } : null,
      };
      // formato antigo (um grupo só no topo) sai: agora é `grupos`
      delete (config as any).grupo; delete (config as any).vencimento; delete (config as any).proxima_assembleia;
      await apiEnviar('/api/marketing/consorcio', 'PATCH', {
        id: evento.id, ...f, sorteio_em: f.sorteio_em ? new Date(f.sorteio_em).toISOString() : null, acao_id: f.acao_id || null, config,
      });
      setMsg('Salvo. A página do cliente já mostra o novo.');
      salvo(evento.id);
    } catch (e: any) { setMsg(e.message); } finally { setSalvando(false); }
  }

  const linha = { display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'flex-end' };
  const nomesGrupos = grupos.map((g) => String(g.grupo || '').trim()).filter(Boolean);
  return (
    <fieldset disabled={!podeEditar} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Painel>
        <Titulo>O evento</Titulo>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={linha}>
            <Campo label="Nome do evento"><input style={estiloInput} value={f.nome} onChange={muda('nome')} /></Campo>
            <Campo label="Local"><input style={estiloInput} value={f.local} onChange={muda('local')} placeholder="Parque de exposições" /></Campo>
            <Campo label="Cidade"><input style={estiloInput} value={f.cidade} onChange={muda('cidade')} placeholder="Carlópolis" /></Campo>
          </div>
          <div style={linha}>
            <Campo label="Começa"><input type="date" style={estiloInput} value={f.inicio} onChange={muda('inicio')} /></Campo>
            <Campo label="Termina"><input type="date" style={estiloInput} value={f.fim} onChange={muda('fim')} /></Campo>
            <Campo label="Dia e hora do sorteio"><input type="datetime-local" style={estiloInput} value={f.sorteio_em} onChange={muda('sorteio_em')} /></Campo>
          </div>
          <Campo label="Prêmio do sorteio" ajuda="Aparece no topo da página: “Cadastre-se e concorra a …”">
            <input style={estiloInput} value={f.premio} onChange={muda('premio')} />
          </Campo>
          <Campo label="Regras do sorteio (opcional)"><textarea style={{ ...estiloInput, minHeight: 90 }} value={f.regulamento} onChange={muda('regulamento')} /></Campo>
          <div style={linha}>
            <Campo label="Campanha do Marketing (os leads entram nela)">
              <select style={estiloInput} value={f.acao_id} onChange={muda('acao_id')}>
                <option value="">Nenhuma</option>
                {acoes.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.data_inicio ? ` (${dataBR(a.data_inicio)})` : ''}</option>)}
              </select>
            </Campo>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--portal-text)', flex: '1 1 200px', paddingBottom: 10 }}>
              <input type="checkbox" checked={f.ativo} onChange={muda('ativo')} style={{ width: 20, height: 20 }} />
              Página aceitando cadastros
            </label>
          </div>
        </div>
      </Painel>

      <Painel>
        <Titulo>Local e atendimento</Titulo>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Campo label="Endereço do evento (uma linha por parte)" ajuda="Vira o botão “Como nos encontrar” (abre o mapa).">
            <textarea style={{ ...estiloInput, minHeight: 80 }} value={c.endereco} onChange={mudaC('endereco')} />
          </Campo>
          <Campo label="Coordenadas do local (opcional)"
            ajuda={coordenadasValidas(c.coordenadas) || !String(c.coordenadas || '').trim()
              ? 'No Google Maps, segure o dedo no ponto do evento e copie os números (ex.: -23.4241, -49.7213). Assim o pino fica no centro do mapa.'
              : 'Isso não parece coordenada. Cole no formato -23.4241, -49.7213.'}>
            <input style={estiloInput} value={c.coordenadas} placeholder="-23.4241, -49.7213" onChange={mudaC('coordenadas')} />
          </Campo>
          <div style={linha}>
            <Campo label="Abre às (fim da contagem)" largura="0 1 160px"><input type="time" style={estiloInput} value={c.abertura} onChange={mudaC('abertura')} /></Campo>
            <Campo label="Horário para mostrar" largura="1 1 200px"><input style={estiloInput} value={c.horario} placeholder="das 8h às 18h" onChange={mudaC('horario')} /></Campo>
          </div>
          <div style={linha}>
            <Campo label="Número do estande" largura="1 1 200px" ajuda="Aparece no topo nos dias da feira."><input style={estiloInput} value={c.estande_local} placeholder="Estande 12, ao lado da entrada" onChange={mudaC('estande_local')} /></Campo>
            <Campo label="WhatsApp de quem está no estande" largura="1 1 200px" ajuda="Nos dias da feira o botão vai para este número.">
              <input style={estiloInput} value={c.whatsapp_evento} inputMode="numeric" placeholder="5514999999999" onChange={mudaC('whatsapp_evento')} />
            </Campo>
          </div>
          <Campo label="Vendedores (nome; WhatsApp — um por linha)" ajuda="O QR do cartão de cada vendedor leva o cliente direto para o WhatsApp dele.">
            <textarea style={{ ...estiloInput, minHeight: 80 }} value={c.vendedoresTxt} placeholder={'Dougras; 14 99876-5432'} onChange={mudaC('vendedoresTxt')} />
          </Campo>
        </div>
      </Painel>

      <Painel>
        <Titulo>Condições do evento</Titulo>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={linha}>
            <Campo label="Super Assembleia: grupo" largura="0 1 140px">
              <select style={estiloInput} value={sa.grupo || ''} onChange={(e) => setSa((x: any) => ({ ...x, grupo: e.target.value }))}>
                <option value="">—</option>
                {nomesGrupos.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Campo>
            <Campo label="Quando" largura="1 1 140px"><input style={estiloInput} value={sa.quando || ''} placeholder="maio/2027" onChange={(e) => setSa((x: any) => ({ ...x, quando: e.target.value }))} /></Campo>
            <Campo label="Cartas contempladas" largura="1 1 140px"><input type="number" style={estiloInput} value={sa.cartas ?? ''} onChange={(e) => setSa((x: any) => ({ ...x, cartas: e.target.value }))} /></Campo>
            <Campo label="Num mês normal" largura="1 1 140px"><input type="number" style={estiloInput} value={sa.por_mes ?? ''} onChange={(e) => setSa((x: any) => ({ ...x, por_mes: e.target.value }))} /></Campo>
            <Campo label="Até N no total (opcional)" largura="1 1 140px" ajuda="Ex.: 56 = 3 por mês + 41"><input type="number" style={estiloInput} value={sa.total_ate ?? ''} onChange={(e) => setSa((x: any) => ({ ...x, total_ate: e.target.value }))} /></Campo>
          </div>
          <div style={linha}>
            <Campo label="Parcela com desconto (nº)" largura="1 1 160px"><input type="number" style={estiloInput} value={desc.numero ?? ''} onChange={(e) => setDesc((x: any) => ({ ...x, numero: e.target.value }))} /></Campo>
            <Campo label="Desconto (%)" largura="1 1 160px" ajuda="Vazio = sem desconto"><input type="number" style={estiloInput} value={desc.pct ?? ''} onChange={(e) => setDesc((x: any) => ({ ...x, pct: e.target.value }))} /></Campo>
          </div>
          <Campo label="Outras condições (uma por linha)" ajuda="Ex.: Sem entrada · 1ª parcela no Pix aqui no estande · Da 2ª em diante, no boleto">
            <textarea style={{ ...estiloInput, minHeight: 90 }} value={c.condicoesTxt} onChange={mudaC('condicoesTxt')} />
          </Campo>
        </div>
      </Painel>

      <Painel>
        <Titulo>Números do consórcio</Titulo>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={linha}>
            <Campo label="Administradora"><input style={estiloInput} value={c.administradora} onChange={mudaC('administradora')} /></Campo>
            <Campo label="Prazo (meses)" largura="0 1 130px"><input type="number" style={estiloInput} value={c.prazo_meses} onChange={mudaC('prazo_meses')} /></Campo>
            <Campo label="WhatsApp da loja" largura="1 1 180px" ajuda="Só números com 55. Recebe a simulação do cliente.">
              <input style={estiloInput} value={c.whatsapp} inputMode="numeric" onChange={mudaC('whatsapp')} placeholder="551433516049" />
            </Campo>
          </div>
          <div style={linha}>
            <Campo label="Taxa de adm. (%)" largura="1 1 140px"><input type="number" step="0.01" style={estiloInput} value={c.taxa_adm_pct} onChange={mudaC('taxa_adm_pct')} /></Campo>
            <Campo label="Fundo de reserva (%)" largura="1 1 140px"><input type="number" step="0.01" style={estiloInput} value={c.fundo_reserva_pct} onChange={mudaC('fundo_reserva_pct')} /></Campo>
            <Campo label="Seguro de vida (% ao mês)" largura="1 1 140px"><input style={estiloInput} value={c.seguro_pct} onChange={mudaC('seguro_pct')} /></Campo>
            <Campo label="Lance embutido máx. (%)" largura="1 1 140px"><input type="number" style={estiloInput} value={c.lance_embutido_pct} onChange={mudaC('lance_embutido_pct')} /></Campo>
            <Campo label="Lance fixo (%)" largura="1 1 140px" ajuda="30 = mostra o valor do bolso"><input type="number" style={estiloInput} value={c.lance_fixo_pct} onChange={mudaC('lance_fixo_pct')} /></Campo>
          </div>
          <Campo label="Como você recebe (uma vantagem por linha)"><textarea style={{ ...estiloInput, minHeight: 90 }} value={c.destaquesTxt} onChange={mudaC('destaquesTxt')} /></Campo>
        </div>
      </Painel>

      <Painel>
        <Titulo acao={<button style={estiloBotaoContorno} onClick={() => setGrupos((g) => [...g, { grupo: '', vencimento: '', proxima_assembleia: '' }])}>+ Grupo</button>}>Grupos</Titulo>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grupos.map((g, i) => (
            <div key={i} style={linha}>
              <Campo label="Grupo" largura="0 1 120px"><input style={estiloInput} value={g.grupo || ''} onChange={mudaLista(setGrupos, i, 'grupo')} /></Campo>
              <Campo label="Vencimento" largura="1 1 160px"><input type="date" style={estiloInput} value={g.vencimento || ''} onChange={mudaLista(setGrupos, i, 'vencimento')} /></Campo>
              <Campo label="Próxima assembleia" largura="1 1 160px"><input type="date" style={estiloInput} value={g.proxima_assembleia || ''} onChange={mudaLista(setGrupos, i, 'proxima_assembleia')} /></Campo>
              <button style={{ ...estiloBotaoContorno, marginBottom: 2 }} onClick={() => setGrupos((l) => l.filter((_, j) => j !== i))}>Tirar</button>
            </div>
          ))}
        </div>
      </Painel>

      <Painel>
        <Titulo acao={<button style={estiloBotaoContorno} onClick={() => setModelos((m) => [...m, { nome: '', codigo: '', credito: '', grupo: nomesGrupos[0] || '', foto: '' }])}>+ Trator</button>}>Tratores na página</Titulo>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--portal-text-muted, #64748b)' }}>
          O mesmo trator em 2 grupos: cadastre 2 linhas (um grupo em cada). A página junta num cartão só.
          Fotos prontas: /consorcio/2025.webp, 5050, 6060, 6075, 6675f, 86-110p.
        </p>
        <div style={{ marginBottom: 12 }}>
          <Campo label="Carta em destaque (a principal da página)" ajuda="As outras aparecem numa lista discreta: “Também temos cartas maiores”.">
            <select style={estiloInput} value={c.destaque} onChange={mudaC('destaque')}>
              <option value="">A de menor crédito</option>
              {[...new Map(modelos.filter((m) => m.codigo).map((m) => [m.codigo, m])).values()].map((m) => <option key={m.codigo} value={m.codigo}>{m.nome} ({m.codigo})</option>)}
            </select>
          </Campo>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {modelos.map((m, i) => {
            const cr = Number(m.credito);
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 10, borderBottom: '1px solid var(--portal-border)' }}>
                <div style={linha}>
                  <Campo label="Trator" largura="2 1 260px"><input style={estiloInput} value={m.nome} onChange={mudaLista(setModelos, i, 'nome')} /></Campo>
                  <Campo label="Código" largura="0 1 110px"><input style={estiloInput} value={m.codigo || ''} onChange={mudaLista(setModelos, i, 'codigo')} /></Campo>
                  <Campo label="Crédito (R$)" largura="1 1 140px"><input type="number" style={estiloInput} value={m.credito} onChange={mudaLista(setModelos, i, 'credito')} /></Campo>
                  <Campo label="Grupo" largura="0 1 110px">
                    <select style={estiloInput} value={m.grupo || ''} onChange={mudaLista(setModelos, i, 'grupo')}>
                      <option value="">—</option>
                      {nomesGrupos.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Foto (endereço)" largura="1 1 200px"><input style={estiloInput} value={m.foto || ''} placeholder="/consorcio/5050.webp" onChange={mudaLista(setModelos, i, 'foto')} /></Campo>
                  <button style={{ ...estiloBotaoContorno, marginBottom: 2 }} onClick={() => setModelos((l) => l.filter((_, j) => j !== i))}>Tirar</button>
                </div>
                {cr > 0 && (
                  <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)' }}>
                    Parcela <strong style={{ color: 'var(--portal-text)' }}>{reais(parcela(cr, cfgAtual))}</strong> · {reais(porDia(cr, cfgAtual))}/dia · c/ embutido {reais(creditoComEmbutido(cr, cfgAtual), 0)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Painel>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BotaoRosa onClick={salvar} disabled={salvando || !podeEditar}>{salvando ? 'Salvando…' : 'Salvar'}</BotaoRosa>
        {msg && <span style={{ fontSize: 14, color: 'var(--portal-text)' }}>{msg}</span>}
      </div>
    </fieldset>
  );
}


// ── Link e QR code ───────────────────────────────────────────────────────────
function LinkQr({ evento }: { evento: any }) {
  // o endereço só existe no navegador (window); os links e os QR nascem juntos, depois de montar
  const [qr, setQr] = useState<{ urlCliente: string; urlEstande: string; cliente?: string; estande?: string }>({ urlCliente: '', urlEstande: '' });
  useEffect(() => {
    const urlCliente = `${window.location.origin}/consorcio/${evento.slug}`;
    const urlEstande = `${urlCliente}/vendedor`;
    const op = { width: 800, margin: 2, color: { dark: '#111111', light: '#ffffff' } };
    Promise.all([QRCode.toDataURL(urlCliente, op), QRCode.toDataURL(urlEstande, op)])
      .then(([cliente, estande]) => setQr({ urlCliente, urlEstande, cliente, estande }));
  }, [evento.slug]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <BlocoQr titulo="Divulgação (cliente)" texto="Instagram, WhatsApp, banner e QR code. O cliente vê a oferta, onde fica o estande e chama um vendedor." url={qr.urlCliente} img={qr.cliente} arquivo={`qr-consorcio-${evento.slug}.png`} />
        <BlocoQr titulo="Página do vendedor" texto="Só para a equipe (não divulgar). A ficha do cliente: salva, dá o número da sorte e manda o resumo no WhatsApp dele." url={qr.urlEstande} img={qr.estande} arquivo={`qr-estande-${evento.slug}.png`} />
      </div>
      {qr.urlCliente && <LinksRastreados base={qr.urlCliente} slug={evento.slug} />}
    </div>
  );
}

// Links rastreados (plano Supersafra 1.4): cada canal e cada vendedor com o seu link/QR. A origem e o
// vendedor ficam gravados no cadastro, e a aba Inscritos mostra de onde cada um veio.
const CANAIS = [
  { id: 'insta', label: 'Instagram' }, { id: 'face', label: 'Facebook' }, { id: 'whats', label: 'WhatsApp (status e grupos)' },
  { id: 'banner', label: 'Banner do estande' }, { id: 'parabrisa', label: 'Adesivo no para-brisa' }, { id: 'mesa', label: 'Mesa / balcão' },
];
function LinksRastreados({ base, slug }: { base: string; slug: string }) {
  const [vendedor, setVendedor] = useState('');
  const [qrVend, setQrVend] = useState<string | null>(null);
  const urlVend = vendedor.trim() ? `${base}?origem=cartao&v=${encodeURIComponent(vendedor.trim())}` : '';
  async function gerar() {
    if (!urlVend) return;
    setQrVend(await QRCode.toDataURL(urlVend, { width: 800, margin: 2, color: { dark: '#111111', light: '#ffffff' } }));
  }
  async function baixarCanal(id: string) {
    const a = document.createElement('a');
    a.href = await QRCode.toDataURL(`${base}?origem=${id}`, { width: 800, margin: 2 });
    a.download = `qr-${slug}-${id}.png`;
    a.click();
  }
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <Painel style={{ flex: '1 1 320px' }}>
        <Titulo>QR do vendedor (cartão de visita)</Titulo>
        <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--portal-text-muted, #64748b)' }}>
          O cliente que cadastrar por este QR fica no nome do vendedor, mesmo preenchendo sozinho no celular.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input style={estiloInput} placeholder="Nome do vendedor" value={vendedor} onChange={(e) => { setVendedor(e.target.value); setQrVend(null); }} />
          <button style={estiloBotaoContorno} onClick={gerar} disabled={!urlVend}>Gerar</button>
        </div>
        {qrVend && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <img src={qrVend} alt={`QR de ${vendedor}`} style={{ width: 200, height: 200, background: '#fff', borderRadius: 12, padding: 6 }} />
            <a href={qrVend} download={`qr-${slug}-${vendedor.trim().toLowerCase().replace(/\W+/g, '-')}.png`} style={{ ...estiloBotaoContorno, textDecoration: 'none' }}>Baixar QR de {vendedor.trim()}</a>
          </div>
        )}
      </Painel>
      <Painel style={{ flex: '2 1 420px' }}>
        <Titulo>Links por canal</Titulo>
        <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--portal-text-muted, #64748b)' }}>
          Use um link diferente em cada lugar para saber qual trouxe mais gente.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CANAIS.map((c) => {
            const url = `${base}?origem=${c.id}`;
            return (
              <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: '0 0 190px', fontSize: 14, color: 'var(--portal-text)' }}>{c.label}</span>
                <input readOnly style={{ ...estiloInput, fontSize: 13, flex: '1 1 220px', width: 'auto' }} value={url} onFocus={(e) => e.target.select()} />
                <button style={estiloBotaoContorno} onClick={() => navigator.clipboard?.writeText(url)}>Copiar</button>
                <button style={estiloBotaoContorno} onClick={() => baixarCanal(c.id)}>QR</button>
              </div>
            );
          })}
        </div>
      </Painel>
    </div>
  );
}

function BlocoQr({ titulo, texto, url, img, arquivo }: { titulo: string; texto: string; url: string; img?: string; arquivo: string }) {
  return (
    <Painel style={{ flex: '1 1 320px' }}>
      <Titulo>{titulo}</Titulo>
      <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--portal-text-muted, #64748b)' }}>{texto}</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input readOnly style={{ ...estiloInput, fontSize: 13 }} value={url} onFocus={(e) => e.target.select()} />
        <button style={estiloBotaoContorno} onClick={() => navigator.clipboard?.writeText(url)}>Copiar</button>
        <a href={url} target="_blank" rel="noreferrer" style={{ ...estiloBotaoContorno, textDecoration: 'none' }}>Abrir</a>
      </div>
      {img && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <img src={img} alt={`QR code ${titulo}`} style={{ width: 220, height: 220, background: '#fff', borderRadius: 12, padding: 6 }} />
          <a href={img} download={arquivo} style={{ ...estiloBotaoContorno, textDecoration: 'none' }}>Baixar QR code (para o banner)</a>
        </div>
      )}
    </Painel>
  );
}
