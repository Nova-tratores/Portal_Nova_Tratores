'use client';
// Site → Campanhas (José, 13/11/2026): "fazer uma aba dentro do módulo das redes sociais chamada Campanhas, separa por
// nome da campanha e ano, nesse caso Black Friday 2026". A primeira é a roleta da Black Friday (página solta em
// Projetos\black-friday-roleta): apresentação → regras → ficha + foto de trator Mahindra → roleta por setor.
// Visões: Resumo (conclusões para leigo), Participantes (busca pelo código + dar baixa), Fotos (escolher a mais
// bonita) e Prêmios (texto, chance e limite de cada fatia). ?exemplo=1 mostra dados inventados com aviso.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import EnviarFoto from '@/components/marketing/redes/EnviarFoto';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, Conta, Numero, tela, quando } from '@/components/marketing/redes/ui';
import '@/components/abas-modulo.css';
import { AZUL, Campo, Secao, T1, T2, T3, bt, campoNP, cartaoNP, grade, ic } from '@/components/marketing/redes/np';

type Setor = 'comercial' | 'posvendas' | 'pecas';
type Camp = { id: string; slug: string; nome: string; ano: number; inicio: string; fim: string; ativo: boolean; url?: string | null; acao_id?: string | null; config?: {
  capa?: string; premio_foto?: string; validade?: string; fisicos?: (string | number)[]
  inicio?: { subtitulo?: string; passos?: string[]; concurso?: string }; regras?: string[]
  ficha?: { pedir_local?: boolean; pedir_trator?: boolean; pedir_foto?: boolean; modelos?: string[]; campos?: CampoFicha[] }; whats?: Partial<Record<Setor, string>>
} };
/** Campo a mais da ficha (José, 17/11: "na ficha não consigo editar quais campos aparecem"); a resposta vai em extras[id]. */
type CampoFicha = { id: string; tipo: 'telefone' | 'documento' | 'email' | 'texto' | 'opcoes' | 'local' | 'nota'; rotulo: string; obrigatorio: boolean; opcoes?: string[] };
// Ficha pedida pelo José em 17/11: é a que a página da roleta usa quando o portal não escolheu outros campos
const CAMPOS_PADRAO: CampoFicha[] = [
  { id: 'telefone', tipo: 'telefone', rotulo: 'Telefone (WhatsApp)', obrigatorio: true },
  { id: 'atendente', tipo: 'texto', rotulo: 'Quem dos nossos colaboradores te atende?', obrigatorio: false },
  { id: 'local', tipo: 'local', rotulo: 'Localização', obrigatorio: true },
  { id: 'email', tipo: 'email', rotulo: 'E-mail', obrigatorio: false },
  { id: 'documento', tipo: 'documento', rotulo: 'CPF ou CNPJ', obrigatorio: true },
  { id: 'ultima_compra', tipo: 'texto', rotulo: 'Qual foi a última compra que você fez com a gente?', obrigatorio: false },
  { id: 'avaliacao', tipo: 'nota', rotulo: 'Como você avalia o seu último atendimento?', obrigatorio: true },
];
const camposDa = (c?: Camp | null) => (c?.config?.ficha?.campos?.length ? c.config.ficha.campos : CAMPOS_PADRAO);
// Brinde físico = retira na loja dia 15/12. Marcado prêmio por prêmio; sem marcação, vale pelo nome (igual à página da roleta).
const FISICO_NOME = /bon[eé]|camiseta|t[aá]bua|faca|chaira|caneca|chaveiro|squeeze|garrafa|copo|brinde/i;
const ehFisico = (c: Camp | null | undefined, id: number | string, nome: string) => {
  const l = c?.config?.fisicos;
  return Array.isArray(l) ? l.map(String).includes(String(id)) : FISICO_NOME.test(nome || '');
};
type Venda = { tipo: 'os' | 'ppv' | 'pedido' | 'balcao' | 'nenhuma'; numero: string | null; valor: number | null; por?: string; em?: string };
type Premio = { id: number; campanha_id: string; setor: Setor; rotulo: string; nome: string; detalhe: string | null; peso: number; estoque: number | null; ordem: number; ativo: boolean; saidas: number };
type Part = {
  id: string; setor: Setor; criado_em: string; nome: string; cidade: string | null; lat: number | null; lng: number | null
  tem_trator: boolean; modelo: string | null; foto_url: string | null; foto_vencedora: boolean; premio_nome: string | null
  codigo: string | null; girou_em: string | null; resgatado_em: string | null; resgatado_por: string | null
  extras?: Record<string, unknown> & { venda?: Venda }
};
const VENDA_TIPOS: { id: Venda['tipo']; nome: string }[] = [
  { id: 'os', nome: 'OS' }, { id: 'ppv', nome: 'PPV' }, { id: 'pedido', nome: 'Pedido de venda' }, { id: 'balcao', nome: 'Balcão' }, { id: 'nenhuma', nome: 'Sem venda' },
];
const real = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
type Dados = { campanhas: Camp[]; atual: Camp | null; premios: Premio[]; participantes: Part[] };
// José, 17/11: "todas as abas da campanha está confusa demais" → 3 abas por tarefa (escolheu entre 3 opções).
type Ver = 'acompanhar' | 'atender' | 'configurar';
type Sub = 'campanha' | 'premios' | 'pagina';

const AMBAR = '#d97706', VERDE = '#16a34a', ROXO = '#7c3aed';
const SETOR: Record<Setor, { nome: string; cor: string; icone: string }> = {
  comercial: { nome: 'Comercial', cor: '#dc2626', icone: 'fa-handshake' },
  posvendas: { nome: 'Pós-Vendas', cor: '#0ea5e9', icone: 'fa-screwdriver-wrench' },
  pecas: { nome: 'Peças', cor: '#f97316', icone: 'fa-gears' },
};
const SETORES = Object.keys(SETOR) as Setor[];
const VISOES: { id: Ver; label: string; icone: string }[] = [
  { id: 'acompanhar', label: 'Acompanhar', icone: 'fa-chart-simple' },
  { id: 'atender', label: 'Atender', icone: 'fa-users' },
  { id: 'configurar', label: 'Configurar', icone: 'fa-gear' },
];
const SUBS: { id: Sub; label: string; icone: string }[] = [
  { id: 'campanha', label: 'Campanha', icone: 'fa-bullhorn' },
  { id: 'premios', label: 'Prêmios', icone: 'fa-gift' },
  { id: 'pagina', label: 'Página', icone: 'fa-mobile-screen' },
];
/** Endereços antigos (?ver=resumo, participantes…) continuam abrindo no lugar certo. */
const ANTIGO: Record<string, [Ver, Sub?]> = { resumo: ['acompanhar'], participantes: ['atender'], fotos: ['atender'], premios: ['configurar', 'premios'], pagina: ['configurar', 'pagina'] };
const dataBR = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
const n = (x: number) => x.toLocaleString('pt-BR');
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const mapa = (p: Part) => `https://www.google.com/maps?q=${p.lat},${p.lng}`;

// ---------- dados inventados (?exemplo=1) ----------
function exemplo(): Dados {
  const camp: Camp = { id: 'ex', slug: 'black-friday-2026', nome: 'Black Friday', ano: 2026, inicio: '2026-11-01', fim: '2026-11-30', ativo: true, url: 'https://exemplo.novatratores.com.br/black-friday', config: { premio_foto: 'A foto mais bonita ganha um prêmio especial da Nova Tratores.', validade: '31/12/2026' } };
  const pr: [Setor, string, string, number, number | null][] = [
    ['comercial', 'Revisão 50 h grátis', 'Revisão de 50 horas grátis', 2, null], ['comercial', 'Boné Mahindra', 'Boné oficial Mahindra', 5, null], ['comercial', 'Demonstração', 'Demonstração grátis na sua propriedade', 4, null], ['comercial', 'Tanque cheio', 'Tanque cheio na entrega', 1, 10],
    ['posvendas', '10% mão de obra', '10% de desconto na mão de obra', 5, null], ['posvendas', 'Check-up grátis', 'Check-up grátis do trator', 3, null], ['posvendas', 'Revisão grátis', 'Mão de obra da revisão grátis', 1, 5],
    ['pecas', '5% em peças', '5% de desconto em peças', 6, null], ['pecas', '10% em peças', '10% de desconto em peças', 4, null], ['pecas', 'Filtro grátis', 'Filtro de óleo grátis', 2, 30],
  ];
  const premios: Premio[] = pr.map(([setor, rotulo, nome, peso, estoque], i) => ({ id: i + 1, campanha_id: 'ex', setor, rotulo, nome, detalhe: 'Até 31/12/2026.', peso, estoque, ordem: i, ativo: true, saidas: 0 }));
  const nomes = ['João Batista', 'Maria Aparecida', 'Antônio Carlos', 'José Roberto', 'Paulo Henrique', 'Ana Paula', 'Luiz Fernando', 'Carlos Eduardo', 'Marcos Vinícius', 'Sebastião Lima', 'Pedro Alves', 'Rafael Souza'];
  const cidades = ['Piraju', 'Ourinhos', 'Fartura', 'Avaré', 'Itaí', 'Sarutaiá', 'Tejupá', null];
  const modelos = ['6075', '5050', '2025', '6065', '7095', '6060'];
  let s = 7;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const participantes: Part[] = Array.from({ length: 64 }, (_, i) => {
    const setor = SETORES[Math.floor(r() * 3)];
    const tem = r() < 0.55;
    const ps = premios.filter((p) => p.setor === setor);
    const p = ps[Math.floor(r() * ps.length)];
    const girou = r() < 0.9;
    if (girou) p.saidas++;
    const cid = cidades[Math.floor(r() * cidades.length)];
    const dia = 1 + Math.floor(r() * 13);
    return {
      id: `ex${i}`, setor, criado_em: `2026-11-${String(dia).padStart(2, '0')}T${String(8 + Math.floor(r() * 10)).padStart(2, '0')}:15:00-03:00`,
      nome: `${nomes[i % nomes.length]}${i >= nomes.length ? ` ${i}` : ''}`, cidade: cid, lat: cid ? null : -23.19 + r() * 0.3, lng: cid ? null : -49.38 + r() * 0.3,
      tem_trator: tem, modelo: tem ? modelos[Math.floor(r() * modelos.length)] : null, foto_url: null, foto_vencedora: false,
      premio_nome: girou ? p.nome : null, codigo: girou ? `${setor === 'comercial' ? 'COM' : setor === 'posvendas' ? 'POS' : 'PEC'}-${(1000 + i * 37).toString(16).toUpperCase()}` : null,
      girou_em: girou ? new Date().toISOString() : null, resgatado_em: girou && r() < 0.3 ? new Date().toISOString() : null, resgatado_por: 'Exemplo',
    };
  }).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  return { campanhas: [camp], atual: camp, premios, participantes };
}

// ---------- peças ----------
function Chip({ cor, children }: { cor: string; children: ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 10px', borderRadius: 999, color: cor, background: `color-mix(in srgb, ${cor} 11%, transparent)`, whiteSpace: 'nowrap' }}>{children}</span>;
}

function Barras({ itens, cor }: { itens: { rotulo: string; valor: number }[]; cor: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  if (!itens.length) return <span style={{ fontSize: 13, color: T3 }}>Ainda sem dados.</span>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {itens.map((i) => (
        <div key={i.rotulo} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 34%) 1fr auto', gap: 10, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: T2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.rotulo}</span>
          <span style={{ height: 10, borderRadius: 5, background: 'color-mix(in srgb, var(--portal-text, #0f172a) 7%, transparent)' }}>
            <span style={{ display: 'block', height: '100%', width: `${(i.valor / max) * 100}%`, borderRadius: 5, background: cor }} />
          </span>
          <span style={{ color: T1, fontVariantNumeric: 'tabular-nums', minWidth: 24, textAlign: 'right' }}>{n(i.valor)}</span>
        </div>
      ))}
    </div>
  );
}

function contar<T>(lista: T[], chave: (x: T) => string | null, max = 8) {
  const m = new Map<string, number>();
  for (const x of lista) { const k = chave(x); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([rotulo, valor]) => ({ rotulo, valor }));
}

// ---------- tela ----------
type Resumo1 = Camp & { capa?: string | null; respostas: number; giraram: number };

/** Capa do cartão: a foto escolhida; sem foto, a Black Friday ganha o "BLACK DA NOVA" e as outras um quadro com o nome. */
function Capa({ c, alto = false }: { c: Camp & { capa?: string | null }; alto?: boolean }) {
  const capa = c.capa || (c.config as { capa?: string } | undefined)?.capa;
  const box: React.CSSProperties = { aspectRatio: alto ? '16 / 7' : '4 / 3', width: '100%', borderRadius: alto ? 0 : 14, overflow: 'hidden', position: 'relative', background: '#0d0d0d' };
  if (capa) return <div style={box}><img src={capa} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>;
  if (/black/i.test(c.slug)) {
    return (
      <div style={{ ...box, display: 'grid', placeItems: 'center' }}>
        <svg viewBox="0 0 600 250" style={{ width: '78%' }} aria-label="Black da Nova">
          <defs><linearGradient id={`ouro-${c.slug}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9C7424" /><stop offset=".4" stopColor="#F6DC8A" /><stop offset=".6" stopColor="#E5B94E" /><stop offset="1" stopColor="#8A651C" /></linearGradient></defs>
          <text x="300" y="140" textAnchor="middle" fontWeight="800" fontSize="150" textLength="576" lengthAdjust="spacingAndGlyphs" fill={`url(#ouro-${c.slug})`} fontFamily="system-ui, sans-serif">BLACK</text>
          <rect x="70" y="160" width="460" height="74" rx="10" fill="#E31837" stroke={`url(#ouro-${c.slug})`} strokeWidth="3" />
          <text x="300" y="214" textAnchor="middle" fontWeight="800" fontSize="54" textLength="380" lengthAdjust="spacingAndGlyphs" fill="#0d0d0d" fontFamily="system-ui, sans-serif">DA NOVA</text>
        </svg>
      </div>
    );
  }
  return (
    <div style={{ ...box, background: `color-mix(in srgb, ${AMBAR} 14%, var(--surface))`, display: 'grid', placeItems: 'center', color: AMBAR, fontSize: 40 }}>{ic('fa-bullhorn')}</div>
  );
}

export default function Campanhas() {
  const sp = useSearchParams();
  const router = useRouter();
  const ehExemplo = sp?.get('exemplo') === '1';
  const slug = sp?.get('campanha') || '';
  const verPedido = sp?.get('ver') || '';
  const ver: Ver = VISOES.find((v) => v.id === verPedido)?.id || ANTIGO[verPedido]?.[0] || 'acompanhar';
  const sub: Sub = SUBS.find((s) => s.id === sp?.get('sub'))?.id || ANTIGO[verPedido]?.[1] || 'campanha';
  const [lista, setLista] = useState<Resumo1[] | null>(null);
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [semSql, setSemSql] = useState(false);

  const carregarLista = useCallback(async () => {
    if (ehExemplo) { const e = exemplo(); setLista([{ ...e.atual!, respostas: e.participantes.length, giraram: e.participantes.filter((p) => p.codigo).length }]); return; }
    try {
      const r = await fetchAuth('/api/marketing/campanhas?lista=1');
      const j = await r.json();
      if (!j.ok) { setErro(j.erro || 'Erro ao carregar'); setSemSql(!!j.semSql); return; }
      setErro(''); setLista(j.campanhas);
    } catch { setErro('Sem conexão com o portal.'); }
  }, [ehExemplo]);
  const carregar = useCallback(async () => {
    if (!slug) { setD(null); return; }
    if (ehExemplo) { setD(exemplo()); return; }
    try {
      const r = await fetchAuth(`/api/marketing/campanhas?campanha=${encodeURIComponent(slug)}`);
      const j = await r.json();
      if (j.ok) setD(j);
    } catch { /* a janela mostra "Carregando…" */ }
  }, [ehExemplo, slug]);
  // a lista de roletas virou a lista única de Campanhas (/marketing)
  useEffect(() => { if (!slug && !ehExemplo) router.replace('/marketing'); }, [slug, ehExemplo, router]);
  useEffect(() => { carregarLista(); }, [carregarLista]);
  useEffect(() => { carregar(); }, [carregar]);

  const mudar = useCallback(async (corpo: Record<string, unknown>) => {
    if (ehExemplo) return { ok: false, erro: 'No exemplo nada é salvo.' };
    const r = await fetchAuth('/api/marketing/campanhas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({ ok: false, erro: 'Erro' }));
    if (j.ok) { await carregar(); carregarLista(); }
    return j as { ok: boolean; erro?: string };
  }, [ehExemplo, carregar, carregarLista]);

  // 18/11/2026: a roleta abre de dentro da campanha (/marketing/<id>); Fechar volta para lá
  const base = ehExemplo ? '/marketing/campanhas?exemplo=1' : d?.atual?.acao_id ? `/marketing/${d.atual.acao_id}` : '/marketing';
  const abrir = (s: string, v: Ver = 'acompanhar', sb?: Sub) => `/marketing/campanhas?${new URLSearchParams({ ...(ehExemplo ? { exemplo: '1' } : {}), campanha: s, ver: v, ...(v === 'configurar' && sb ? { sub: sb } : {}) }).toString()}`;

  // janela aberta: Esc fecha e a página de trás não rola
  useEffect(() => {
    if (!slug) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') router.push(base); };
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    addEventListener('keydown', tecla);
    return () => { removeEventListener('keydown', tecla); document.body.style.overflow = antes; };
  }, [slug, base, router]);

  if (erro) {
    return (
      <div style={tela}>
        <Aviso tom={semSql ? 'info' : 'erro'}>
          {erro}
          {semSql && <> Enquanto isso, <Link href="/marketing/campanhas?exemplo=1" style={{ color: AZUL }}>veja como fica com dados de exemplo</Link>.</>}
        </Aviso>
      </div>
    );
  }
  if (!lista) return <div style={{ ...tela, color: T3 }}>Carregando…</div>;

  const anos = [...new Set(lista.map((c) => c.ano))].sort((a, b) => b - a);
  const atual = d?.atual && d.atual.slug === slug ? d.atual : null;

  return (
    <div style={tela}>
      {ehExemplo && <Aviso tom="info"><b style={{ fontWeight: 500 }}>Dados de exemplo, inventados.</b> Servem só para ver como a tela fica. <Link href="/marketing/campanhas" style={{ color: AZUL }}>Ver os dados reais</Link></Aviso>}
      {!lista.length && <Aviso tom="info">Nenhuma campanha cadastrada ainda.</Aviso>}

      {/* cartões por ano */}
      {anos.map((ano) => (
        <section key={ano} style={{ display: 'grid', gap: 14 }}>
          <AnoCabecalho ano={ano} campanhas={lista.filter((c) => c.ano === ano)} />
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))' }}>
            {lista.filter((c) => c.ano === ano).map((c) => (
              <Link key={c.slug} href={abrir(c.slug)} style={{ ...cartaoNP, padding: 10, display: 'grid', gap: 10, textDecoration: 'none', color: T1 }}>
                <Capa c={c} />
                <span style={{ display: 'grid', gap: 2, padding: '0 4px 4px' }}>
                  <span style={{ fontSize: 16 }}>{c.nome} {c.ano}</span>
                  <span style={{ fontSize: 13, color: T3 }}>{n(c.respostas)} {c.respostas === 1 ? 'resposta' : 'respostas'} · {situacao(c)}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {/* janela em tela cheia da campanha aberta (o endereço muda: ?campanha=&ver=) */}
      {slug && (
        <div role="dialog" aria-modal="true" aria-label={atual ? `${atual.nome} ${atual.ano}` : 'Campanha'}
          style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'var(--portal-bg, #f8fafc)', isolation: 'isolate', overflowY: 'auto', overscrollBehavior: 'contain' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--portal-bg, #f8fafc)' }}>
            <div style={{ padding: '10px clamp(12px, 2vw, 28px)', display: 'flex', gap: 12, alignItems: 'center' }}>
              <Link href={base} aria-label="Fechar" style={{ ...bt(T1), minHeight: 40, padding: '8px 12px' }}>{ic('fa-xmark')}<span className="hide-sm">Fechar</span></Link>
              {atual && (
                <Link href={abrir(slug, 'configurar', 'campanha')} aria-label="Editar nome, datas e foto" title="Editar nome, datas e foto" className="camp-editar"
                  style={{ flex: 'none', width: 72, display: 'block', position: 'relative', borderRadius: 10, boxShadow: '0 4px 12px rgba(15,23,42,.18)' }}>
                  <span style={{ display: 'block', borderRadius: 10, overflow: 'hidden' }}><Capa c={lista.find((c) => c.slug === slug) || atual} /></span>
                  <span aria-hidden style={{ position: 'absolute', right: -6, bottom: -6, width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', background: '#d97706', color: '#fefefe', fontSize: 11, border: '2px solid var(--portal-bg, #f8fafc)' }}>{ic('fa-pen')}</span>
                  <style>{'.camp-editar{transition:transform .15s}.camp-editar:hover{transform:scale(1.04)}'}</style>
                </Link>
              )}
              <span style={{ display: 'grid', minWidth: 0 }}>
                <span style={{ fontSize: 18, color: T1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{atual ? `${atual.nome} ${atual.ano}` : 'Carregando…'}</span>
                {atual && <span style={{ fontSize: 12, color: T3 }}>{dataBR(atual.inicio)} a {dataBR(atual.fim)} · {situacao(atual)}</span>}
              </span>
            </div>
            {/* guias estilo Chrome (docs/padrao-telas.md) */}
            <nav className="aba-faixa" style={{ background: `linear-gradient(135deg, ${AMBAR}, #b45309)`, padding: '8px clamp(12px, 2vw, 28px) 0', display: 'flex', gap: 4, overflowX: 'auto' }}>
              {VISOES.map((v) => {
                const on = v.id === ver;
                return (
                  <Link key={v.id} href={abrir(slug, v.id, sub)} className={`aba-guia${on ? ' aba-ativa' : ''}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '8px 18px', borderRadius: '11px 11px 0 0', fontSize: 14, fontWeight: on ? 700 : 500, textDecoration: 'none', whiteSpace: 'nowrap', background: on ? '#fefefe' : 'rgba(255,255,255,0.30)', color: '#111111', boxShadow: on ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none' }}>
                    <i className={`fa-solid ${v.icone}`} style={{ fontWeight: 900 }} />{v.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div style={tela}>
            {!atual || !d ? <span style={{ color: T3 }}>Carregando…</span> : (
              <>
                {ver === 'acompanhar' && <Resumo d={d} exemplo={ehExemplo} />}
                {ver === 'atender' && <Atender d={d} mudar={mudar} recarregar={carregar} />}
                {ver === 'configurar' && (
                  <>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {SUBS.map((s) => (
                        <Link key={s.id} href={abrir(slug, 'configurar', s.id)} style={{ ...bt(AMBAR, s.id === sub), minHeight: 40, textDecoration: 'none' }}>{ic(s.icone)}{s.label}</Link>
                      ))}
                    </div>
                    {sub === 'campanha' && <DadosCampanha key={`${atual.id}${atual.nome}${atual.ano}${atual.inicio}${atual.fim}${atual.ativo}`} d={d} mudar={mudar} exemplo={ehExemplo} />}
                    {sub === 'premios' && <Premios d={d} mudar={mudar} />}
                    {sub === 'pagina' && <OQueAparece key={atual.id} d={d} mudar={mudar} />}
                  </>
                )}
              </>
            )}
          </div>
          <style>{`@media (max-width: 599px){ .hide-sm{display:none} }`}</style>
        </div>
      )}
    </div>
  );
}

function situacao(c: Camp) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  if (!c.ativo) return 'desligada';
  if (hoje < c.inicio) return 'ainda não começou';
  if (hoje > c.fim) return 'encerrada';
  const dias = Math.round((new Date(`${c.fim}T12:00:00`).getTime() - new Date(`${hoje}T12:00:00`).getTime()) / 86_400_000);
  return dias === 0 ? 'último dia' : `no ar, faltam ${dias} dias`;
}

type Mudar = (corpo: Record<string, unknown>) => Promise<{ ok: boolean; erro?: string }>;

// ---------- RESUMO ----------
const diaSP = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Respostas por dia em colunas empilhadas, uma cor por setor (José, 13/11: "separar por setor e gráficos de quantos responderam"). */
function ColunasDia({ ps, setores }: { ps: Part[]; setores: Setor[] }) {
  const dias = useMemo(() => {
    const m = new Map<string, Record<Setor, number>>();
    for (const p of ps) { const k = diaSP(p.criado_em); const v = m.get(k) || { comercial: 0, posvendas: 0, pecas: 0 }; v[p.setor]++; m.set(k, v); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-21);
  }, [ps]);
  if (!dias.length) return <span style={{ fontSize: 13, color: T3 }}>Ainda sem respostas.</span>;
  const max = Math.max(1, ...dias.map(([, v]) => setores.reduce((s, k) => s + v[k], 0)));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 4, height: 170, overflowX: 'auto', paddingTop: 4 }}>
        {dias.map(([dia, v]) => {
          const tot = setores.reduce((s, k) => s + v[k], 0);
          return (
            <div key={dia} title={`${dataBR(dia)}: ${setores.map((k) => `${SETOR[k].nome} ${v[k]}`).join(', ')}`}
              style={{ flex: '1 0 24px', maxWidth: 56, display: 'grid', gridTemplateRows: 'auto 1fr auto', height: '100%', gap: 3 }}>
              <span />
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 0 }}>
                <span style={{ fontSize: 11, color: T2, textAlign: 'center', paddingBottom: 2 }}>{tot}</span>
                <div style={{ display: 'flex', flexDirection: 'column-reverse', height: `${(tot / max) * 82}%`, borderRadius: '4px 4px 0 0', overflow: 'hidden' }}>
                  {setores.map((k) => v[k] ? <span key={k} style={{ flex: v[k], background: SETOR[k].cor, borderTop: '1px solid var(--surface)' }} /> : null)}
                </div>
              </div>
              <span style={{ fontSize: 10, color: T3, textAlign: 'center', whiteSpace: 'nowrap' }}>{dataBR(dia).slice(0, 5)}</span>
            </div>
          );
        })}
      </div>
      {setores.length > 1 && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: T2 }}>
          {setores.map((k) => <span key={k} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: SETOR[k].cor }} />{SETOR[k].nome}</span>)}
        </div>
      )}
    </div>
  );
}

/** Cada setor lado a lado: responderam → giraram → resgataram. */
function FunilSetores({ ps }: { ps: Part[] }) {
  const max = Math.max(1, ...SETORES.map((s) => ps.filter((p) => p.setor === s).length));
  const etapas: [string, (p: Part) => boolean][] = [['Responderam', () => true], ['Giraram', (p) => !!p.codigo], ['Resgataram', (p) => !!p.resgatado_em]];
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {SETORES.map((s) => {
        const l = ps.filter((p) => p.setor === s);
        return (
          <div key={s} style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 14, color: T1, display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: SETOR[s].cor }} />{SETOR[s].nome}</span>
            {etapas.map(([rot, f], i) => {
              const v = l.filter(f).length;
              return (
                <div key={rot} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 40px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: T3 }}>{rot}</span>
                  <span style={{ height: 12, borderRadius: 4, background: 'color-mix(in srgb, var(--portal-text, #0f172a) 6%, transparent)' }}>
                    <span style={{ display: 'block', height: '100%', borderRadius: 4, width: `${(v / max) * 100}%`, background: SETOR[s].cor, opacity: 1 - i * 0.3 }} />
                  </span>
                  <span style={{ color: T1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{n(v)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------- ACOMPANHAR: números clicáveis que abrem uma janela com o detalhe ----------
const ESTILO_IND = `
@keyframes indEntra { from { opacity: 0; transform: translateY(10px) scale(.98) } to { opacity: 1; transform: none } }
@keyframes indFundo { from { opacity: 0 } to { opacity: 1 } }
.ind-card { animation: indEntra .45s cubic-bezier(.2,.8,.2,1) both; transition: transform .18s, box-shadow .18s }
.ind-card:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(15,23,42,.12) }
.ind-card:hover .ind-ver { opacity: 1; transform: none }
.ind-ver { opacity: .55; transform: translateX(-4px); transition: opacity .18s, transform .18s }
.ind-modal { animation: indEntra .28s cubic-bezier(.2,.8,.2,1) both }
.ind-fundo { animation: indFundo .2s both }
@media (prefers-reduced-motion: reduce) { .ind-card, .ind-modal, .ind-fundo { animation: none } }
`;

type Indicador = { id: string; icone: string; cor: string; rotulo: string; valor: ReactNode; detalhe: string; titulo: string; frase: string; corpo: () => ReactNode };

function Janela({ ind, onFechar }: { ind: Indicador; onFechar: () => void }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onFechar(); } };
    window.addEventListener('keydown', t, true);
    return () => window.removeEventListener('keydown', t, true);
  }, [onFechar]);
  return (
    <div className="ind-fundo" onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={ind.titulo} className="ind-modal" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(620px, 100%)', maxHeight: 'min(86vh, 760px)', display: 'grid', gridTemplateRows: 'auto 1fr', borderRadius: 18, overflow: 'hidden', background: 'var(--surface, #fefefe)', boxShadow: '0 30px 70px rgba(15,23,42,.35)' }}>
        <div style={{ padding: '20px 22px', background: `linear-gradient(135deg, ${ind.cor}, color-mix(in srgb, ${ind.cor} 70%, #111111))`, color: '#fefefe', display: 'grid', gap: 6, position: 'relative' }}>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 999, border: 0, background: 'rgba(255,255,255,.18)', color: '#fefefe', cursor: 'pointer', fontSize: 16 }}>{ic('fa-xmark')}</button>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, opacity: 0.9 }}>{ic(ind.icone)}{ind.rotulo}</span>
          <span style={{ fontSize: 40, lineHeight: 1.05, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{ind.valor}</span>
          <span style={{ fontSize: 15, paddingRight: 40 }}>{ind.frase}</span>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gap: 14, alignContent: 'start' }}>{ind.corpo()}</div>
      </div>
    </div>
  );
}

function ListaPessoas({ ps, extra, vazio }: { ps: Part[]; extra?: (p: Part) => ReactNode; vazio: string }) {
  if (!ps.length) return <span style={{ fontSize: 14, color: T3 }}>{vazio}</span>;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {ps.slice(0, 200).map((p) => (
        <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: 'color-mix(in srgb, var(--portal-text, #0f172a) 3%, transparent)' }}>
          {p.foto_url
            ? <img src={p.foto_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flex: 'none' }} />
            : <span style={{ width: 36, height: 36, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${SETOR[p.setor].cor} 12%, transparent)`, color: SETOR[p.setor].cor, fontSize: 13 }}>{p.nome.trim().charAt(0).toUpperCase()}</span>}
          <span style={{ display: 'grid', minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 14, color: T1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
            <span style={{ fontSize: 12, color: T3 }}>{SETOR[p.setor].nome} · {quando(p.criado_em)}{p.cidade ? ` · ${p.cidade}` : ''}</span>
          </span>
          {extra && <span style={{ fontSize: 12, color: T2, textAlign: 'right', flex: 'none', maxWidth: '45%' }}>{extra(p)}</span>}
        </div>
      ))}
      {ps.length > 200 && <span style={{ fontSize: 12, color: T3 }}>Mostrando 200 de {n(ps.length)}. A lista completa está em Atender.</span>}
    </div>
  );
}

const Titulo = ({ children }: { children: ReactNode }) => <span style={{ fontSize: 13, color: T3, textTransform: 'uppercase', letterSpacing: '.04em' }}>{children}</span>;

function Indicadores({ ps, ehExemplo }: { ps: Part[]; ehExemplo: boolean }) {
  const [aberto, setAberto] = useState('');
  const girou = ps.filter((p) => p.codigo);
  const resg = ps.filter((p) => p.resgatado_em);
  const trator = ps.filter((p) => p.tem_trator);
  const fotos = ps.filter((p) => p.foto_url || (ehExemplo && p.tem_trator));
  const vendasP = ps.filter((p) => p.extras?.venda && p.extras.venda.tipo !== 'nenhuma');
  const totalVendas = vendasP.reduce((s, p) => s + (p.extras!.venda!.valor || 0), 0);
  const porSetor = SETORES.map((s) => ({ rotulo: SETOR[s].nome, valor: ps.filter((p) => p.setor === s).length }));
  const inds: Indicador[] = [
    { id: 'resp', icone: 'fa-user-plus', cor: AMBAR, rotulo: 'Responderam', valor: <Conta valor={ps.length} />, detalhe: 'preencheram a ficha',
      titulo: 'Quem respondeu', frase: `${n(ps.length)} ${ps.length === 1 ? 'pessoa preencheu' : 'pessoas preencheram'} a ficha da roleta.`,
      corpo: () => <><Titulo>Por setor</Titulo><Barras itens={porSetor} cor={AMBAR} /><Titulo>Pessoas</Titulo><ListaPessoas ps={ps} vazio="Ninguém respondeu ainda." /></> },
    { id: 'girou', icone: 'fa-dharmachakra', cor: AZUL, rotulo: 'Giraram a roleta', valor: <Conta valor={girou.length} />, detalhe: `${pct(girou.length, ps.length)}% de quem respondeu`,
      titulo: 'Quem girou', frase: `${n(girou.length)} giraram e ganharam um código de prêmio.`,
      corpo: () => <><Titulo>Prêmios que saíram</Titulo><Barras itens={contar(girou, (p) => p.premio_nome, 20)} cor={AZUL} /><Titulo>Pessoas</Titulo><ListaPessoas ps={girou} extra={(p) => <code>{p.codigo}</code>} vazio="Ninguém girou ainda." /></> },
    { id: 'trator', icone: 'fa-tractor', cor: VERDE, rotulo: 'Têm Mahindra da Nova', valor: <Conta valor={trator.length} />, detalhe: `${n(ps.length - trator.length)} ainda não têm`,
      titulo: 'Quem já tem Mahindra da Nova', frase: `${n(trator.length)} já têm. Os outros ${n(ps.length - trator.length)} são clientes para o Comercial procurar.`,
      corpo: () => <><Titulo>Modelos</Titulo><Barras itens={contar(trator, (p) => p.modelo, 20)} cor={VERDE} /><Titulo>Ainda não têm (para o Comercial)</Titulo><ListaPessoas ps={ps.filter((p) => !p.tem_trator)} vazio="Todos já têm Mahindra da Nova." /></> },
    { id: 'fotos', icone: 'fa-camera', cor: ROXO, rotulo: 'Fotos recebidas', valor: <Conta valor={fotos.length} />, detalhe: 'fotos de trator na ficha',
      titulo: 'Fotos recebidas', frase: `${n(fotos.length)} ${fotos.length === 1 ? 'foto chegou' : 'fotos chegaram'}. A mais bonita é escolhida em Atender › Fotos.`,
      corpo: () => fotos.some((p) => p.foto_url)
        ? <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>{fotos.filter((p) => p.foto_url).map((p) => (
            <a key={p.id} href={p.foto_url!} target="_blank" rel="noreferrer" style={{ display: 'grid', gap: 4, textDecoration: 'none', color: T2, fontSize: 12 }}>
              <img src={p.foto_url!} alt={`Foto de ${p.nome}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, outline: p.foto_vencedora ? `3px solid ${AMBAR}` : 'none' }} />{p.nome}
            </a>))}</div>
        : <span style={{ fontSize: 14, color: T3 }}>Nenhuma foto ainda.</span> },
    { id: 'resg', icone: 'fa-circle-check', cor: VERDE, rotulo: 'Prêmios resgatados', valor: <Conta valor={resg.length} />, detalhe: `${n(girou.length - resg.length)} ainda não vieram buscar`,
      titulo: 'Prêmios resgatados', frase: `${n(resg.length)} de ${n(girou.length)} prêmios já foram retirados na loja.`,
      corpo: () => <><Titulo>Já retiraram</Titulo><ListaPessoas ps={resg} extra={(p) => <>{p.premio_nome}{p.resgatado_por ? <><br />baixa: {p.resgatado_por.split(' ')[0]}</> : null}</>} vazio="Ninguém retirou ainda." />
        <Titulo>Ainda não vieram buscar</Titulo><ListaPessoas ps={girou.filter((p) => !p.resgatado_em)} extra={(p) => p.premio_nome} vazio="Todos já retiraram." /></> },
    { id: 'venda', icone: 'fa-sack-dollar', cor: '#0f766e', rotulo: 'Vendido com o código', valor: <Conta valor={totalVendas} formato={(v) => real(v)} />, detalhe: `${n(vendasP.length)} ${vendasP.length === 1 ? 'venda anotada' : 'vendas anotadas'}`,
      titulo: 'Vendas com o código da roleta', frase: `${real(totalVendas)} em ${n(vendasP.length)} ${vendasP.length === 1 ? 'venda anotada' : 'vendas anotadas'} na baixa do prêmio.`,
      corpo: () => <><Titulo>Por tipo</Titulo><Barras itens={VENDA_TIPOS.filter((t) => t.id !== 'nenhuma').map((t) => ({ rotulo: t.nome, valor: vendasP.filter((p) => p.extras!.venda!.tipo === t.id).length })).filter((x) => x.valor)} cor="#0f766e" />
        <Titulo>Vendas</Titulo><ListaPessoas ps={vendasP} extra={(p) => textoVenda(p.extras!.venda!)} vazio="Nenhuma venda anotada ainda. Anote em Atender, na hora de dar baixa." /></> },
  ];
  const atual = inds.find((i) => i.id === aberto);
  return (
    <>
      <style>{ESTILO_IND}</style>
      <div style={grade(200)}>
        {inds.map((i, k) => (
          <button key={i.id} type="button" className="ind-card" onClick={() => setAberto(i.id)}
            style={{ animationDelay: `${k * 50}ms`, textAlign: 'left', font: 'inherit', cursor: 'pointer', border: `1px solid color-mix(in srgb, ${i.cor} 22%, var(--border, #e5e7eb))`, borderRadius: 16, padding: 16, display: 'grid', gap: 10,
              background: `linear-gradient(160deg, color-mix(in srgb, ${i.cor} 10%, var(--surface, #fefefe)), var(--surface, #fefefe) 70%)`, color: T1 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${i.cor}, color-mix(in srgb, ${i.cor} 70%, #111111))`, color: '#fefefe', boxShadow: `0 6px 14px color-mix(in srgb, ${i.cor} 30%, transparent)` }}>{ic(i.icone)}</span>
              <span className="ind-ver" style={{ fontSize: 12, color: i.cor, display: 'inline-flex', gap: 6, alignItems: 'center' }}>ver {ic('fa-arrow-right')}</span>
            </span>
            <span style={{ fontSize: 30, lineHeight: 1, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{i.valor}</span>
            <span style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 14, color: T1 }}>{i.rotulo}</span>
              <span style={{ fontSize: 12, color: T3 }}>{i.detalhe}</span>
            </span>
          </button>
        ))}
      </div>
      {atual && <Janela ind={atual} onFechar={() => setAberto('')} />}
    </>
  );
}

function Resumo({ d, exemplo: ehExemplo }: { d: Dados; exemplo: boolean }) {
  const [filtro, setFiltro] = useState<Setor | ''>('');
  const todos = d.participantes;
  const ps = filtro ? todos.filter((p) => p.setor === filtro) : todos;
  const girou = ps.filter((p) => p.codigo).length;
  const resg = ps.filter((p) => p.resgatado_em).length;
  const comTrator = ps.filter((p) => p.tem_trator).length;
  const vendas = ps.map((p) => p.extras?.venda).filter((v): v is Venda => !!v && v.tipo !== 'nenhuma');
  const onde = filtro ? ` na roleta ${SETOR[filtro].nome}` : '';
  const titulo = ps.length
    ? `${n(ps.length)} ${ps.length === 1 ? 'pessoa respondeu' : 'pessoas responderam'}${onde}; ${n(comTrator)} já ${comTrator === 1 ? 'tem' : 'têm'} Mahindra da Nova`
    : `Ninguém respondeu${onde} ainda`;
  const lider = !filtro && todos.length ? SETORES.map((s) => ({ s, v: todos.filter((p) => p.setor === s).length })).sort((a, b) => b.v - a.v)[0] : null;
  const semCidade = ps.filter((p) => !p.cidade && p.lat != null).length;

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setFiltro('')} style={{ ...bt(AMBAR, filtro === ''), minHeight: 40 }}>Todos os setores</button>
        {SETORES.map((s) => <button key={s} type="button" onClick={() => setFiltro(s)} style={{ ...bt(SETOR[s].cor, filtro === s), minHeight: 36 }}>{ic(SETOR[s].icone)}{SETOR[s].nome}</button>)}
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 22, color: T1 }}>{titulo}</span>
        <span style={{ fontSize: 14, color: T2 }}>
          {ps.length
            ? <>{n(girou)} giraram a roleta e {n(resg)} já {resg === 1 ? 'resgatou' : 'resgataram'} o prêmio.{lider && lider.v ? ` O setor que mais trouxe respostas é ${SETOR[lider.s].nome} (${n(lider.v)}).` : ''}</>
            : <>Mande o link do setor para os clientes (logo abaixo).</>}
        </span>
      </div>

      <Indicadores ps={ps} ehExemplo={ehExemplo} />

      <div style={grade(340)}>
        <Secao icone="fa-chart-column" cor={AMBAR} titulo="Respostas por dia" sub={filtro ? `Roleta ${SETOR[filtro].nome}` : 'Cada cor é um setor (passe o mouse na coluna)'}>
          <ColunasDia ps={ps} setores={filtro ? [filtro] : SETORES} />
        </Secao>
        <Secao icone="fa-filter" cor={AZUL} titulo="Quantos responderam em cada setor" sub="Responderam → giraram → resgataram o prêmio">
          <FunilSetores ps={todos} />
        </Secao>
      </div>


      <div style={grade(300)}>
        <Secao icone="fa-tractor" cor={VERDE} titulo="Tem Mahindra comprado na Nova?" sub="Resposta da ficha">
          <Barras itens={[{ rotulo: 'Sim', valor: comTrator }, { rotulo: 'Não', valor: ps.length - comTrator }]} cor={VERDE} />
        </Secao>
        <Secao icone="fa-tractor" cor={VERDE} titulo="Modelos que os clientes têm" sub="Quem disse que tem Mahindra comprado na Nova">
          <Barras itens={contar(ps.filter((p) => p.tem_trator), (p) => p.modelo)} cor={VERDE} />
        </Secao>
        <Secao icone="fa-sack-dollar" cor={AZUL} titulo="Vendas com o código da roleta" sub="Anotadas em Atender, na hora de dar baixa no prêmio">
          <Barras itens={VENDA_TIPOS.filter((t) => t.id !== 'nenhuma').map((t) => ({ rotulo: t.nome, valor: vendas.filter((v) => v.tipo === t.id).length })).filter((x) => x.valor)} cor={AZUL} />
        </Secao>
        <Secao icone="fa-location-dot" cor={ROXO} titulo="De onde vieram" sub={semCidade ? `${n(semCidade)} mandaram só a localização do celular: veja no mapa em Participantes` : 'Cidade escrita na ficha'}>
          <Barras itens={contar(ps, (p) => p.cidade && p.cidade.trim().replace(/(^|\s)\S/g, (l) => l.toUpperCase()))} cor={ROXO} />
        </Secao>
      </div>
    </>
  );
}

// ---------- CONFIGURAR › CAMPANHA: nome, ano, datas, ligada, capa e links ----------
/** Cabeçalho do ano na lista: número grande em degradê âmbar, linha que se apaga e o resumo do ano. */
function AnoCabecalho({ ano, campanhas }: { ano: number; campanhas: (Camp & { respostas?: number })[] }) {
  const noAr = campanhas.filter((c) => situacao(c).startsWith('no ar')).length;
  const respostas = campanhas.reduce((t, c) => t + (c.respostas || 0), 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #f59e0b, #b45309)', color: '#fefefe', boxShadow: '0 6px 16px rgba(217,119,6,.28)' }}>
          {ic('fa-calendar-days')}
        </span>
        <span style={{ fontSize: 34, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #f59e0b, #b45309)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{ano}</span>
      </span>
      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip cor={AMBAR}>{campanhas.length} {campanhas.length === 1 ? 'campanha' : 'campanhas'}</Chip>
        {noAr > 0 && <Chip cor={VERDE}>{noAr} no ar</Chip>}
        <Chip cor={T3}>{n(respostas)} {respostas === 1 ? 'resposta' : 'respostas'}</Chip>
      </span>
      <span aria-hidden style={{ flex: '1 1 80px', height: 2, borderRadius: 2, background: 'linear-gradient(90deg, rgba(217,119,6,.45), rgba(217,119,6,0))' }} />
    </div>
  );
}

function DadosCampanha({ d, mudar, exemplo: ehExemplo }: { d: Dados; mudar: Mudar; exemplo: boolean }) {
  const c = d.atual!;
  const [v, setV] = useState({ nome: c.nome, ano: String(c.ano), inicio: c.inicio.slice(0, 10), fim: c.fim.slice(0, 10), ativo: c.ativo });
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const mudou = v.nome !== c.nome || v.ano !== String(c.ano) || v.inicio !== c.inicio.slice(0, 10) || v.fim !== c.fim.slice(0, 10) || v.ativo !== c.ativo;
  const salvar = async () => {
    setSalvando(true);
    const r = await mudar({ acao: 'campanha', id: c.id, nome: v.nome, ano: Number(v.ano), inicio: v.inicio, fim: v.fim, ativo: v.ativo });
    setSalvando(false);
    setMsg(r.ok ? 'Salvo.' : r.erro || 'Erro');
  };
  const capa = (c.config as { capa?: string } | undefined)?.capa;
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
        <Secao icone="fa-bullhorn" cor={AMBAR} titulo="Nome e período" sub="O endereço da página não muda: os links que já foram mandados continuam valendo.">
          <div style={grade(200)}>
            <Campo rotulo="Nome da campanha"><input value={v.nome} maxLength={80} onChange={(e) => setV({ ...v, nome: e.target.value })} style={campoNP} /></Campo>
            <Campo rotulo="Ano"><input type="number" min={2020} max={2100} value={v.ano} onChange={(e) => setV({ ...v, ano: e.target.value })} style={campoNP} /></Campo>
          </div>
          <div style={grade(200)}>
            <Campo rotulo="Começa em"><input type="date" value={v.inicio} onChange={(e) => setV({ ...v, inicio: e.target.value })} style={campoNP} /></Campo>
            <Campo rotulo="Último dia" ajuda="Depois dele a roleta mostra que a campanha terminou"><input type="date" value={v.fim} onChange={(e) => setV({ ...v, fim: e.target.value })} style={campoNP} /></Campo>
          </div>
          <Liga on={v.ativo} rotulo={v.ativo ? 'Campanha ligada' : 'Campanha desligada'} ajuda="Desligada, ninguém consegue preencher a ficha nem girar" onChange={(x) => setV({ ...v, ativo: x })} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" disabled={!mudou || salvando || ehExemplo} onClick={salvar} style={{ ...bt(AMBAR, true), minHeight: 40, opacity: !mudou || salvando ? 0.5 : 1 }}>{ic('fa-floppy-disk')}{salvando ? 'Salvando…' : 'Salvar'}</button>
            {mudou ? <span style={{ fontSize: 13, color: '#b45309' }}>Tem mudança sem salvar</span> : msg && <span style={{ fontSize: 13, color: T2 }}>{msg}</span>}
          </div>
        </Secao>
        <Secao icone="fa-link" cor={AMBAR} titulo="Links para mandar aos clientes" sub="Cada setor manda o seu: o link abre direto a roleta dele e as respostas ficam separadas.">
          <LinksSetores c={c} ps={d.participantes} mudar={mudar} />
        </Secao>
      </div>
      <Secao icone="fa-image" cor={AMBAR} titulo="Capa" sub="Aparece no cartão da campanha, na lista de campanhas">
        <Capa c={c} />
        {!ehExemplo && <EnviarFoto pasta="campanhas" rotulo={capa ? 'Trocar a capa' : 'Pôr uma capa'} onEnviada={([url]) => mudar({ acao: 'campanha', id: c.id, capa: url })} />}
      </Secao>
    </div>
  );
}

function LinksSetores({ c, ps, mudar }: { c: Camp; ps: Part[]; mudar: Mudar }) {
  const [url, setUrl] = useState(c.url || '');
  const [msg, setMsg] = useState('');
  const [copiado, setCopiado] = useState('');
  const base = (c.url || '').replace(/\/$/, '');
  const copiar = async (s: Setor) => {
    try { await navigator.clipboard.writeText(`${base}?setor=${s}`); setCopiado(s); setTimeout(() => setCopiado(''), 1800); } catch { setMsg('Não deu para copiar: abra a roleta e copie o endereço do navegador.'); }
  };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {!base && <Aviso tom="info">Os links aparecem depois que o endereço da página for salvo (logo abaixo, em &quot;Endereço da página&quot;).</Aviso>}
      <div style={grade(230)}>
        {SETORES.map((s) => {
          const lista = ps.filter((p) => p.setor === s);
          const g = lista.filter((p) => p.codigo).length, r = lista.filter((p) => p.resgatado_em).length;
          const cor = SETOR[s].cor;
          return (
            <div key={s} style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid color-mix(in srgb, ${cor} 25%, var(--border, #e5e7eb))`, background: 'var(--surface, #fefefe)', display: 'grid' }}>
              <div style={{ padding: '14px 16px', background: `linear-gradient(135deg, ${cor}, color-mix(in srgb, ${cor} 65%, #111111))`, color: '#fefefe', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.2)' }}>{ic(SETOR[s].icone)}</span>
                <span style={{ fontSize: 16 }}>Roleta {SETOR[s].nome}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', padding: '12px 8px 4px', textAlign: 'center' }}>
                {([['Fichas', lista.length], ['Giraram', g], ['Retiraram', r]] as const).map(([rot, v]) => (
                  <span key={rot} style={{ display: 'grid' }}>
                    <span style={{ fontSize: 22, color: T1, fontVariantNumeric: 'tabular-nums' }}>{n(v)}</span>
                    <span style={{ fontSize: 12, color: T3 }}>{rot}</span>
                  </span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 12 }}>
                <button type="button" disabled={!base} onClick={() => copiar(s)} title={base ? `${base}?setor=${s}` : undefined}
                  style={{ ...bt(cor, copiado === s), minHeight: 44, justifyContent: 'center', opacity: base ? 1 : 0.4 }}>{ic(copiado === s ? 'fa-check' : 'fa-copy')}{copiado === s ? 'Copiado!' : 'Copiar link'}</button>
                {base
                  ? <a href={`${base}?setor=${s}`} target="_blank" rel="noreferrer" style={{ ...bt(cor, true), minHeight: 44, justifyContent: 'center', textDecoration: 'none' }}>{ic('fa-arrow-up-right-from-square')}Abrir</a>
                  : <span style={{ ...bt(cor, true), minHeight: 44, justifyContent: 'center', opacity: 0.4 }}>{ic('fa-arrow-up-right-from-square')}Abrir</span>}
              </div>
            </div>
          );
        })}
      </div>
      <details style={{ fontSize: 13, color: T2 }}>
        <summary style={{ cursor: 'pointer', minHeight: 40, display: 'flex', alignItems: 'center', gap: 8 }}>{ic('fa-gear')}Endereço da página (só mexer se a página mudar de lugar)</summary>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: 8 }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Endereço da página da campanha" style={{ ...campoNP, flex: '1 1 260px' }} />
          <button type="button" style={{ ...bt(AMBAR, true), minHeight: 44 }} onClick={async () => { const r = await mudar({ acao: 'campanha', id: c.id, url }); setMsg(r.ok ? 'Salvo.' : r.erro || 'Erro'); }}>{ic('fa-floppy-disk')}Salvar</button>
        </div>
      </details>
      {msg && <span style={{ fontSize: 13, color: T2 }}>{msg}</span>}
    </div>
  );
}

// ---------- ATENDER: lista (baixa do prêmio + venda) e fotos, na mesma aba ----------
type Situacao = '' | 'falta' | 'retirado' | 'hoje' | 'pizza';
const SITUACOES: Record<Exclude<Situacao, ''>, string> = { falta: 'Falta buscar', retirado: 'Já retirados', hoje: 'Garantidos hoje', pizza: 'Concorrem à pizza' };
const chavePremio = (setor: Setor, nome: string | null) => `${setor}|${nome || ''}`;
const ehNovo = (p: Part) => !!p.girou_em && Date.now() - new Date(p.girou_em).getTime() < 24 * 3600 * 1000;
const hojeSP = () => diaSP(new Date().toISOString());
function casaSituacao(p: Part, s: Situacao) {
  if (s === 'falta') return !!p.codigo && !p.resgatado_em;
  if (s === 'retirado') return !!p.resgatado_em;
  if (s === 'hoje') return !!p.girou_em && diaSP(p.girou_em) === hojeSP();
  if (s === 'pizza') return !!p.foto_url;
  return true;
}

/** Barras que crescem do zero quando a tela abre. */
function useCresce() {
  const [pronto, setPronto] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setPronto(true)); return () => cancelAnimationFrame(r); }, []);
  return pronto;
}

/** Rosca: quanto dos prêmios garantidos já foi retirado. */
function Rosca({ feito, total, cor }: { feito: number; total: number; cor: string }) {
  const pronto = useCresce();
  const R = 34, C = 2 * Math.PI * R, k = total ? feito / total : 0;
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label={`${feito} de ${total} retirados`} style={{ flex: 'none' }}>
      <circle cx="46" cy="46" r={R} fill="none" stroke={`color-mix(in srgb, ${cor} 16%, transparent)`} strokeWidth="10" />
      <circle cx="46" cy="46" r={R} fill="none" stroke={cor} strokeWidth="10" strokeLinecap="round" transform="rotate(-90 46 46)"
        strokeDasharray={C} strokeDashoffset={pronto ? C * (1 - k) : C} style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="46" y="44" textAnchor="middle" fontSize="18" fontWeight="600" fill="var(--portal-text, #0f172a)">{pct(feito, total)}%</text>
      <text x="46" y="60" textAnchor="middle" fontSize="10" fill="var(--portal-text-muted, #6b7280)">retirados</text>
    </svg>
  );
}

/** Placar: quantos de cada prêmio saíram (garantidos) e quantos já foram retirados, por roleta. Clicar filtra a lista. */
function PlacarPremios({ d, premio, onPremio }: { d: Dados; premio?: string; onPremio?: (k: string) => void }) {
  const pronto = useCresce();
  const setores = SETORES.filter((s) => d.premios.some((p) => p.setor === s) || d.participantes.some((p) => p.setor === s && p.codigo));
  return (
    <div style={grade(320)}>
      {setores.map((s) => {
        const ganhos = d.participantes.filter((p) => p.setor === s && p.codigo);
        const linhas = new Map<string, { nome: string; limite: number | null; ganhos: number; retirados: number }>();
        for (const p of d.premios.filter((x) => x.setor === s && x.ativo)) linhas.set(p.nome, { nome: p.nome, limite: p.estoque, ganhos: 0, retirados: 0 });
        for (const p of ganhos) {
          const l = linhas.get(p.premio_nome || '') || { nome: p.premio_nome || 'Sem nome', limite: null, ganhos: 0, retirados: 0 };
          l.ganhos++; if (p.resgatado_em) l.retirados++; linhas.set(l.nome, l);
        }
        const itens = [...linhas.values()].sort((a, b) => b.ganhos - a.ganhos);
        const max = Math.max(1, ...itens.map((i) => i.ganhos));
        const ret = ganhos.filter((p) => p.resgatado_em).length;
        const cor = SETOR[s].cor;
        return (
          <section key={s} style={{ ...cartaoNP, display: 'grid', gap: 14, alignContent: 'start' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <Rosca feito={ret} total={ganhos.length} cor={cor} />
              <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13, color: cor, display: 'inline-flex', gap: 6, alignItems: 'center' }}>{ic(SETOR[s].icone)}Roleta {SETOR[s].nome}</span>
                <span style={{ fontSize: 22, color: T1, fontVariantNumeric: 'tabular-nums' }}><Conta valor={ganhos.length} /> {ganhos.length === 1 ? 'prêmio garantido' : 'prêmios garantidos'}</span>
                <span style={{ fontSize: 13, color: T2 }}>{n(ret)} já {ret === 1 ? 'retirado' : 'retirados'} · {n(ganhos.length - ret)} falta buscar</span>
              </span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {itens.map((it) => {
                const k = chavePremio(s, it.nome);
                const sel = premio === k;
                const acabou = it.limite != null && it.ganhos >= it.limite;
                const clica = !!onPremio && it.ganhos > 0;
                return (
                  <button key={it.nome} type="button" disabled={!clica} onClick={() => onPremio?.(sel ? '' : k)} title={clica ? 'Ver quem ganhou' : undefined}
                    className="camp-barra" style={{ all: 'unset', boxSizing: 'border-box', display: 'grid', gap: 5, cursor: clica ? 'pointer' : 'default', padding: '6px 8px', margin: '0 -8px', borderRadius: 10, outline: sel ? `2px solid ${cor}` : 'none' }}>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13 }}>
                      <span style={{ color: T1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nome}</span>
                      <span style={{ color: T1, fontVariantNumeric: 'tabular-nums' }}>{n(it.ganhos)}{it.limite != null ? <span style={{ color: acabou ? '#b45309' : T3 }}> / {n(it.limite)}</span> : null}</span>
                    </span>
                    <span style={{ height: 12, borderRadius: 6, background: `color-mix(in srgb, ${cor} 9%, transparent)`, overflow: 'hidden', display: 'block' }}>
                      <span style={{ display: 'flex', height: '100%', width: pronto ? `${(it.ganhos / max) * 100}%` : '0%', transition: 'width .9s cubic-bezier(.2,.8,.2,1)' }}>
                        <span style={{ flex: it.retirados, background: cor }} />
                        <span style={{ flex: it.ganhos - it.retirados, background: `color-mix(in srgb, ${cor} 40%, transparent)` }} />
                      </span>
                    </span>
                    <span style={{ fontSize: 11, color: T3 }}>{it.ganhos ? `${n(it.retirados)} retirados · ${n(it.ganhos - it.retirados)} falta buscar` : 'Ainda não saiu'}{acabou ? ' · limite atingido' : ''}</span>
                  </button>
                );
              })}
              {!itens.length && <span style={{ fontSize: 13, color: T3 }}>Sem prêmios nesta roleta.</span>}
            </div>
            <span style={{ display: 'flex', gap: 14, fontSize: 11, color: T3 }}>
              <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: cor }} />Retirado</span>
              <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: `color-mix(in srgb, ${cor} 40%, transparent)` }} />Falta buscar</span>
            </span>
          </section>
        );
      })}
    </div>
  );
}

const ESTILO_ATENDER = `
@keyframes campEntra { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
@keyframes campPulso { 0%,100% { box-shadow: 0 0 0 0 rgba(22,163,74,.45) } 70% { box-shadow: 0 0 0 7px rgba(22,163,74,0) } }
.camp-linha { animation: campEntra .4s cubic-bezier(.2,.8,.2,1) both; transition: transform .15s, box-shadow .15s }
.camp-linha:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(15,23,42,.08) }
.camp-barra:not(:disabled):hover { background: color-mix(in srgb, var(--portal-text, #0f172a) 4%, transparent) }
.camp-novo { font-size: 11px; color: #fefefe; background: #16a34a; padding: 2px 8px; border-radius: 999px; animation: campPulso 1.8s infinite }
.camp-vivo { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; animation: campPulso 1.8s infinite; display: inline-block }
@media (prefers-reduced-motion: reduce) { .camp-linha, .camp-novo, .camp-vivo { animation: none } }
`;

// ---------- ATENDER: números, placar dos prêmios, lista (baixa do prêmio + venda) e fotos ----------
function Atender({ d, mudar, recarregar }: { d: Dados; mudar: Mudar; recarregar?: () => Promise<void> }) {
  const [modo, setModo] = useState<'lista' | 'fotos'>('lista');
  const [situacao, setSituacao] = useState<Situacao>('');
  const [premio, setPremio] = useState('');
  const [atualizado, setAtualizado] = useState(() => Date.now());
  // atualiza sozinho a cada 30 s enquanto a aba está na tela (quem girou agora aparece sem F5)
  useEffect(() => {
    if (!recarregar) return;
    const t = setInterval(async () => { if (document.visibilityState === 'visible') { await recarregar(); setAtualizado(Date.now()); } }, 30000);
    return () => clearInterval(t);
  }, [recarregar]);
  const ps = d.participantes;
  const ganhos = ps.filter((p) => p.codigo).length;
  const ret = ps.filter((p) => p.resgatado_em).length;
  const hoje = ps.filter((p) => casaSituacao(p, 'hoje')).length;
  const nFotos = ps.filter((p) => p.foto_url).length;
  const filtrar = (s: Situacao) => { setSituacao(situacao === s ? '' : s); setModo('lista'); };
  return (
    <>
      <style>{ESTILO_ATENDER}</style>
      <div style={grade(200)}>
        <Numero icone="fa-gift" cor={AMBAR} rotulo="Prêmios garantidos" valor={<Conta valor={ganhos} />} detalhe={`de ${n(ps.length)} que preencheram a ficha`} ativo={situacao === '' && !premio} onClick={() => { setSituacao(''); setPremio(''); setModo('lista'); }} />
        <Numero icone="fa-hourglass-half" cor="#b45309" rotulo="Falta buscar" valor={<Conta valor={ganhos - ret} />} detalhe="Toque para ver quem" ativo={situacao === 'falta'} onClick={() => filtrar('falta')} />
        <Numero icone="fa-circle-check" cor={VERDE} rotulo="Já retirados" valor={<Conta valor={ret} />} detalhe={`${pct(ret, ganhos)}% dos garantidos`} ativo={situacao === 'retirado'} onClick={() => filtrar('retirado')} />
        <Numero icone="fa-pizza-slice" cor="#c2410c" rotulo="Concorrem à pizza" valor={<Conta valor={nFotos} />} detalhe="Mandaram foto · sorteio 15/12" ativo={situacao === 'pizza'} onClick={() => filtrar('pizza')} />
        <Numero icone="fa-bolt" cor={AZUL} rotulo="Garantidos hoje" valor={<Conta valor={hoje} />} detalhe={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span className="camp-vivo" />ao vivo · {new Date(atualizado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>} ativo={situacao === 'hoje'} onClick={() => filtrar('hoje')} />
      </div>

      <PlacarPremios d={d} premio={premio} onPremio={(k) => { setPremio(k); setModo('lista'); }} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setModo('lista')} style={{ ...bt(AMBAR, modo === 'lista'), minHeight: 40 }}>{ic('fa-list')}Pessoas e prêmios</button>
        <button type="button" onClick={() => setModo('fotos')} style={{ ...bt(AMBAR, modo === 'fotos'), minHeight: 40 }}>{ic('fa-camera')}Fotos ({n(nFotos)})</button>
      </div>
      {modo === 'lista'
        ? <Participantes d={d} mudar={mudar} situacao={situacao} setSituacao={setSituacao} premio={premio} setPremio={setPremio} />
        : <Fotos d={d} mudar={mudar} />}
    </>
  );
}

/** Onde o prêmio foi usado: OS / PPV / pedido / balcão + nº + valor. */
function FormVenda({ inicial, rotulo, onSalvar, onCancelar }: { inicial?: Venda; rotulo: string; onSalvar: (v: { tipo: string; numero: string; valor: string }) => Promise<void>; onCancelar: () => void }) {
  const [v, setV] = useState({ tipo: inicial?.tipo || '', numero: inicial?.numero || '', valor: inicial?.valor != null ? String(inicial.valor).replace('.', ',') : '' });
  const [salvando, setSalvando] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 10, border: '1px dashed var(--border)' }}>
      <span style={{ fontSize: 13, color: T2 }}>Onde o prêmio foi usado?</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {VENDA_TIPOS.map((t) => <button key={t.id} type="button" onClick={() => setV({ ...v, tipo: t.id })} style={{ ...bt(AZUL, v.tipo === t.id), minHeight: 40, padding: '6px 10px' }}>{t.nome}</button>)}
      </div>
      {v.tipo && v.tipo !== 'nenhuma' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={v.numero} onChange={(e) => setV({ ...v, numero: e.target.value })} placeholder={v.tipo === 'balcao' ? 'Nº da nota (se tiver)' : 'Número'} maxLength={30} style={{ ...campoNP, flex: '1 1 120px', minWidth: 0 }} />
          <input value={v.valor} onChange={(e) => setV({ ...v, valor: e.target.value })} placeholder="Valor R$" inputMode="decimal" style={{ ...campoNP, flex: '1 1 110px', minWidth: 0 }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={!v.tipo || salvando} onClick={async () => { setSalvando(true); await onSalvar(v); setSalvando(false); }} style={{ ...bt(VERDE, true), minHeight: 40, opacity: !v.tipo || salvando ? 0.5 : 1 }}>{ic('fa-check')}{salvando ? 'Salvando…' : rotulo}</button>
        <button type="button" onClick={onCancelar} style={{ ...bt(T3), minHeight: 40 }}>Cancelar</button>
      </div>
    </div>
  );
}

const textoVenda = (v: Venda) => v.tipo === 'nenhuma' ? 'Usou sem venda' : `${VENDA_TIPOS.find((t) => t.id === v.tipo)?.nome}${v.numero ? ` ${v.numero}` : ''}${v.valor != null ? ` · ${real(v.valor)}` : ''}`;

function Participantes({ d, mudar, situacao, setSituacao, premio, setPremio }: { d: Dados; mudar: Mudar; situacao: Situacao; setSituacao: (s: Situacao) => void; premio: string; setPremio: (p: string) => void }) {
  const [abertoBaixa, setAbertoBaixa] = useState('');
  const campos = useMemo(() => camposDa(d.atual).filter((c) => c.tipo !== 'local'), [d.atual]);
  const [busca, setBusca] = useState('');
  const [setor, setSetor] = useState<Setor | ''>('');
  const [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState('');
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return d.participantes.filter((p) => (!setor || p.setor === setor) && casaSituacao(p, situacao) && (!premio || chavePremio(p.setor, p.premio_nome) === premio)
      && (!b || `${p.nome} ${p.codigo || ''} ${p.cidade || ''} ${p.modelo || ''} ${campos.map((c) => String(p.extras?.[c.id] ?? '')).join(' ')}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(b)));
  }, [d.participantes, busca, setor, situacao, premio, campos]);

  const baixa = async (p: Part, venda?: { tipo: string; numero: string; valor: string }) => {
    setOcupado(p.id); setErro('');
    const r = await mudar(p.resgatado_em && !venda ? { acao: 'desfazer', id: p.id } : { acao: p.resgatado_em ? 'venda' : 'resgatar', id: p.id, venda });
    if (!r.ok) setErro(r.erro || 'Erro'); else setAbertoBaixa('');
    setOcupado('');
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 420 }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: 13, fontWeight: 900, color: T3, fontSize: 13 }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, código do prêmio ou cidade" style={{ ...campoNP, paddingLeft: 34 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setSetor('')} style={{ ...bt(AMBAR, setor === ''), minHeight: 36 }}>Todos</button>
          {SETORES.map((s) => <button key={s} type="button" onClick={() => setSetor(s)} style={{ ...bt(SETOR[s].cor, setor === s), minHeight: 36 }}>{SETOR[s].nome}</button>)}
          <button type="button" onClick={() => setSituacao(situacao === 'falta' ? '' : 'falta')} style={{ ...bt(VERDE, situacao === 'falta'), minHeight: 36 }}>{ic('fa-hourglass-half')}Falta buscar</button>
        </div>
      </div>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: T3 }}>
        {n(lista.length)} de {n(d.participantes.length)}
        {premio && <button type="button" onClick={() => setPremio('')} style={{ ...bt(AMBAR, true), minHeight: 32, padding: '4px 10px', fontSize: 12 }}>{ic('fa-gift')}{premio.split('|')[1]}{ic('fa-xmark')}</button>}
        {situacao && situacao !== 'falta' && <button type="button" onClick={() => setSituacao('')} style={{ ...bt(AZUL, true), minHeight: 32, padding: '4px 10px', fontSize: 12 }}>{SITUACOES[situacao]}{ic('fa-xmark')}</button>}
      </span>
      {erro && <Aviso>{erro}</Aviso>}

      <div style={{ display: 'grid', gap: 8 }}>
        {lista.slice(0, 300).map((p, i) => (
          <div key={p.id} className="camp-linha" style={{ ...cartaoNP, animationDelay: `${Math.min(i, 14) * 35}ms`, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 14, alignItems: 'start', padding: 14 }}>
            {p.foto_url
              ? <a href={p.foto_url} target="_blank" rel="noreferrer"><img src={p.foto_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, display: 'block' }} /></a>
              : <span style={{ width: 64, height: 64, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--portal-text, #0f172a) 5%, transparent)', color: T3 }}>{ic('fa-user')}</span>}
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', alignItems: 'start' }}>
              <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 15, color: T1 }}>{p.nome}</span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Chip cor={SETOR[p.setor].cor}>{SETOR[p.setor].nome}</Chip>
                  <span style={{ fontSize: 12, color: T3 }}>{quando(p.criado_em)}</span>
                  {ehNovo(p) && <span className="camp-novo">novo</span>}
                  {p.foto_url && <Chip cor="#c2410c">{ic('fa-pizza-slice')}Concorre à pizza</Chip>}
                </span>
              </span>
              <span style={{ display: 'grid', gap: 3, fontSize: 13, color: T2, minWidth: 0 }}>
                <span>{ic('fa-location-dot')} {p.cidade || (p.lat != null ? 'Localização do celular' : '—')}
                  {p.lat != null && <> · <a href={mapa(p)} target="_blank" rel="noreferrer" style={{ color: AZUL }}>ver no mapa</a></>}
                </span>
                <span>{ic('fa-tractor')} {p.tem_trator ? `Mahindra ${p.modelo || ''} da Nova` : 'Não tem Mahindra da Nova'}</span>
                {campos.filter((c) => p.extras?.[c.id]).map((c) => (
                  <span key={c.id} style={{ overflowWrap: 'anywhere' }}>{ic(c.tipo === 'telefone' ? 'fa-phone' : c.tipo === 'documento' ? 'fa-id-card' : c.tipo === 'email' ? 'fa-envelope' : c.tipo === 'nota' ? 'fa-star' : 'fa-comment')} {c.rotulo}: {c.tipo === 'nota' ? `${'★'.repeat(Number(p.extras![c.id]) || 0)}${'☆'.repeat(5 - (Number(p.extras![c.id]) || 0))} (${String(p.extras![c.id])} de 5)` : String(p.extras![c.id])}</span>
                ))}
              </span>
              <span style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                {p.codigo ? (
                  <>
                    <span style={{ fontSize: 13, color: T1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{p.premio_nome}
                      {ehFisico(d.atual, d.premios.find((q) => q.setor === p.setor && q.nome === p.premio_nome)?.id ?? '', p.premio_nome || '') && <Chip cor={AMBAR}>{ic('fa-box')}Brinde · retira 15/12</Chip>}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <code style={{ fontSize: 13, padding: '2px 8px', borderRadius: 6, border: '1px dashed var(--border)', color: T1 }}>{p.codigo}</code>
                      {p.resgatado_em
                        ? <>
                            <Chip cor={VERDE}>{ic('fa-circle-check')}Resgatado {new Date(p.resgatado_em).toLocaleDateString('pt-BR')}{p.resgatado_por ? ` · ${p.resgatado_por.split(' ')[0]}` : ''}</Chip>
                            <button type="button" disabled={ocupado === p.id} onClick={() => baixa(p)} style={{ background: 'none', border: 0, padding: 0, color: T3, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}>desfazer</button>
                          </>
                        : abertoBaixa !== p.id && <button type="button" onClick={() => setAbertoBaixa(p.id)} style={{ ...bt(VERDE, true), minHeight: 40 }}>{ic('fa-check')}Dar baixa</button>}
                    </span>
                    {p.resgatado_em && abertoBaixa !== p.id && (
                      p.extras?.venda
                        ? <span style={{ fontSize: 13, color: T2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{ic('fa-sack-dollar')} {textoVenda(p.extras.venda)}
                            <button type="button" onClick={() => setAbertoBaixa(p.id)} style={{ background: 'none', border: 0, padding: 0, color: AZUL, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}>mudar</button></span>
                        : <button type="button" onClick={() => setAbertoBaixa(p.id)} style={{ ...bt(AZUL), minHeight: 40, width: 'fit-content' }}>{ic('fa-sack-dollar')}Anotar a venda</button>
                    )}
                    {abertoBaixa === p.id && (
                      <FormVenda inicial={p.extras?.venda} rotulo={p.resgatado_em ? 'Salvar venda' : 'Confirmar baixa'} onSalvar={(v) => baixa(p, v)} onCancelar={() => setAbertoBaixa('')} />
                    )}
                  </>
                ) : <span style={{ fontSize: 13, color: T3 }}>Preencheu a ficha e não girou</span>}
              </span>
            </div>
          </div>
        ))}
        {lista.length > 300 && <span style={{ fontSize: 13, color: T3 }}>Mostrando os 300 mais recentes. Use a busca para achar os outros.</span>}
        {!lista.length && <span style={{ ...cartaoNP, color: T3, fontSize: 14 }}>Ninguém com esse filtro.</span>}
      </div>
    </>
  );
}

// ---------- FOTOS ----------
function Fotos({ d, mudar }: { d: Dados; mudar: Mudar }) {
  const [erro, setErro] = useState('');
  const fotos = d.participantes.filter((p) => p.foto_url).sort((a, b) => Number(b.foto_vencedora) - Number(a.foto_vencedora));
  const premioFoto = d.atual?.config?.premio_foto;
  if (!fotos.length) {
    return <Aviso tom="info">Nenhuma foto ainda. As fotos de trator Mahindra que os clientes mandam na ficha aparecem aqui para escolher a mais bonita.{premioFoto ? ` (${premioFoto})` : ''}</Aviso>;
  }
  return (
    <>
      <span style={{ fontSize: 14, color: T2 }}>{n(fotos.length)} fotos. Toque em <b style={{ fontWeight: 500 }}>Escolher</b> na mais bonita; ela vai para o começo da lista. {premioFoto}</span>
      {erro && <Aviso>{erro}</Aviso>}
      <div style={grade(220)}>
        {fotos.map((p) => (
          <figure key={p.id} style={{ ...cartaoNP, margin: 0, padding: 0, overflow: 'hidden', display: 'grid', outline: p.foto_vencedora ? `3px solid ${AMBAR}` : 'none' }}>
            <a href={p.foto_url!} target="_blank" rel="noreferrer" style={{ display: 'block', aspectRatio: '4 / 3', background: '#111' }}>
              <img src={p.foto_url!} alt={`Foto de ${p.nome}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </a>
            <figcaption style={{ padding: '10px 12px 12px', display: 'grid', gap: 8 }}>
              <span style={{ display: 'grid' }}>
                <span style={{ fontSize: 14, color: T1 }}>{p.nome}</span>
                <span style={{ fontSize: 12, color: T3 }}>{p.modelo ? `Mahindra ${p.modelo}` : 'Mahindra'}{p.cidade ? ` · ${p.cidade}` : ''}</span>
              </span>
              <button type="button" style={{ ...bt(AMBAR, p.foto_vencedora), minHeight: 34, justifyContent: 'center' }}
                onClick={async () => { const r = await mudar({ acao: 'vencedora', id: p.id, valor: !p.foto_vencedora }); setErro(r.ok ? '' : r.erro || 'Erro'); }}>
                {ic(p.foto_vencedora ? 'fa-trophy' : 'fa-star')}{p.foto_vencedora ? 'Escolhida' : 'Escolher'}
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}

// ---------- PRÊMIOS ----------
function Premios({ d, mudar }: { d: Dados; mudar: Mudar }) {
  const c = d.atual!;
  return <><PlacarPremios d={d} />{SETORES.map((s) => <PremiosSetor key={s} setor={s} c={c} premios={d.premios.filter((p) => p.setor === s)} mudar={mudar} />)}</>;
}

// ---------- O QUE APARECE (José, 13/11: "controlar o que aparece em cada aba da roleta") ----------
const MODELOS_PADRAO = ['2025', '5050', '6060', '6065', '6075', '6075E', '6675F', '7095', '8110', 'OJA 3140', 'Retro VX90', 'Outro'];
type Cfg = {
  inicio: { subtitulo: string; passos: string[]; concurso: string }
  regras: string[]
  ficha: { pedir_local: boolean; pedir_trator: boolean; pedir_foto: boolean; modelos: string[]; campos: CampoFicha[] }
  whats: Record<Setor, string>
  premio_foto: string; validade: string
};
function cfgDe(c: Camp): Cfg {
  const k = c.config || {};
  return {
    inicio: { subtitulo: k.inicio?.subtitulo ?? 'Gire a roleta. Todo giro ganha.', passos: k.inicio?.passos?.length ? [...k.inicio.passos] : ['Leia as regras', 'Preencha a ficha', 'Gire e ganhe na hora'], concurso: k.inicio?.concurso ?? 'Tem Mahindra? A foto mais bonita ganha prêmio.' },
    regras: k.regras?.length ? [...k.regras] : ['Vale até 30/11', '1 giro por pessoa nesta roleta', 'Todo giro ganha prêmio', 'Mostre o código na loja até 31/12', 'Foto mais bonita do seu Mahindra ganha prêmio'],
    ficha: { pedir_local: k.ficha?.pedir_local !== false, pedir_trator: k.ficha?.pedir_trator !== false, pedir_foto: k.ficha?.pedir_foto !== false, modelos: k.ficha?.modelos?.length ? [...k.ficha.modelos] : MODELOS_PADRAO, campos: camposDa(c).map((x) => ({ ...x, ...(x.opcoes ? { opcoes: [...x.opcoes] } : {}) })) },
    whats: { comercial: k.whats?.comercial || '', posvendas: k.whats?.posvendas || '', pecas: k.whats?.pecas || '' },
    premio_foto: k.premio_foto || '', validade: k.validade || '',
  };
}

function Liga({ on, onChange, rotulo, ajuda }: { on: boolean; onChange: (v: boolean) => void; rotulo: string; ajuda?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      style={{ ...cartaoNP, padding: '10px 12px', display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: T1 }}>
      <span style={{ flex: 'none', width: 40, height: 22, borderRadius: 11, background: on ? VERDE : 'color-mix(in srgb, var(--portal-text, #0f172a) 20%, transparent)', position: 'relative', transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: 8, background: '#fff', transition: 'left .15s' }} />
      </span>
      <span style={{ display: 'grid' }}>
        <span style={{ fontSize: 14 }}>{rotulo}</span>
        {ajuda && <span style={{ fontSize: 12, color: T3 }}>{ajuda}</span>}
      </span>
    </button>
  );
}

function ListaTextos({ itens, onChange, max, placeholder, rotulo }: { itens: string[]; onChange: (v: string[]) => void; max: number; placeholder: string; rotulo: (i: number) => string }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {itens.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 'none', width: 26, fontSize: 13, color: T3, textAlign: 'right' }}>{rotulo(i)}</span>
          <input value={t} maxLength={140} placeholder={placeholder} onChange={(e) => onChange(itens.map((x, k) => (k === i ? e.target.value : x)))} style={campoNP} />
          <button type="button" aria-label="Tirar" title="Tirar" onClick={() => onChange(itens.filter((_, k) => k !== i))} style={{ ...bt('#dc2626'), minHeight: 40, padding: '8px 12px' }}>{ic('fa-xmark')}</button>
        </div>
      ))}
      {itens.length < max && <button type="button" onClick={() => onChange([...itens, ''])} style={{ ...bt(AMBAR), width: 'fit-content' }}>{ic('fa-plus')}Linha</button>}
    </div>
  );
}

const TIPOS_CAMPO: { tipo: CampoFicha['tipo']; nome: string; icone: string; rotulo: string }[] = [
  { tipo: 'telefone', nome: 'Telefone / WhatsApp', icone: 'fa-phone', rotulo: 'Seu WhatsApp' },
  { tipo: 'documento', nome: 'CPF ou CNPJ', icone: 'fa-id-card', rotulo: 'CPF ou CNPJ' },
  { tipo: 'email', nome: 'E-mail', icone: 'fa-envelope', rotulo: 'Seu e-mail' },
  { tipo: 'texto', nome: 'Pergunta escrita', icone: 'fa-pen', rotulo: '' },
  { tipo: 'opcoes', nome: 'Pergunta com opções', icone: 'fa-list-ul', rotulo: '' },
  { tipo: 'local', nome: 'Localização', icone: 'fa-location-dot', rotulo: 'Localização' },
  { tipo: 'nota', nome: 'Nota de 1 a 5 estrelas', icone: 'fa-star', rotulo: 'Como você avalia o seu último atendimento?' },
];

/** Campos a mais da ficha: escolher quais aparecem, o texto e se é obrigatório. */
function CamposFicha({ campos, onChange }: { campos: CampoFicha[]; onChange: (c: CampoFicha[]) => void }) {
  const muda = (i: number, x: Partial<CampoFicha>) => onChange(campos.map((c, k) => (k === i ? { ...c, ...x } : c)));
  const mover = (i: number, d: number) => { const l = [...campos]; const [c] = l.splice(i, 1); l.splice(i + d, 0, c); onChange(l); };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <span style={{ fontSize: 13, color: T2 }}>Campos a mais (aparecem depois do nome, na ordem abaixo). Telefone e CPF/CNPJ ajudam a achar o cliente depois.</span>
      {campos.map((c, i) => {
        const t = TIPOS_CAMPO.find((x) => x.tipo === c.tipo)!;
        return (
          <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip cor={AMBAR}>{ic(t.icone)}{t.nome}</Chip>
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, color: T1, cursor: 'pointer', minHeight: 40 }}>
                <input type="checkbox" checked={c.obrigatorio} onChange={(e) => muda(i, { obrigatorio: e.target.checked })} style={{ width: 18, height: 18, accentColor: AMBAR }} />Obrigatório
              </label>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} style={{ ...bt(T3), minHeight: 40, padding: '8px 10px', opacity: i === 0 ? 0.4 : 1 }}>{ic('fa-arrow-up')}</button>
                <button type="button" aria-label="Descer" disabled={i === campos.length - 1} onClick={() => mover(i, 1)} style={{ ...bt(T3), minHeight: 40, padding: '8px 10px', opacity: i === campos.length - 1 ? 0.4 : 1 }}>{ic('fa-arrow-down')}</button>
                <button type="button" aria-label="Tirar" title="Tirar" onClick={() => onChange(campos.filter((_, k) => k !== i))} style={{ ...bt('#dc2626'), minHeight: 40, padding: '8px 12px' }}>{ic('fa-xmark')}</button>
              </span>
            </div>
            <input value={c.rotulo} maxLength={80} placeholder="O que aparece para o cliente (ex.: Qual cultura você planta?)" onChange={(e) => muda(i, { rotulo: e.target.value })} style={campoNP} />
            {c.tipo === 'opcoes' && (
              <input value={(c.opcoes || []).join(', ')} placeholder="Opções separadas por vírgula (ex.: Soja, Milho, Café, Gado)"
                onChange={(e) => muda(i, { opcoes: e.target.value.split(',').map((x) => x.trimStart()) })} style={campoNP} />
            )}
          </div>
        );
      })}
      {campos.length < 8 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TIPOS_CAMPO.filter((t) => t.tipo === 'texto' || t.tipo === 'opcoes' || !campos.some((c) => c.tipo === t.tipo)).map((t) => (
            <button key={t.tipo} type="button" onClick={() => onChange([...campos, { id: `${t.tipo}_${Date.now().toString(36)}`, tipo: t.tipo, rotulo: t.rotulo, obrigatorio: false, ...(t.tipo === 'opcoes' ? { opcoes: [] } : {}) }])}
              style={{ ...bt(AMBAR), minHeight: 40 }}>{ic('fa-plus')}{t.nome}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function OQueAparece({ d, mudar }: { d: Dados; mudar: Mudar }) {
  const c = d.atual!;
  const [v, setV] = useState<Cfg>(() => cfgDe(c));
  const [modeloNovo, setModeloNovo] = useState('');
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState<{ setor: Setor; passo: string; n: number }>({ setor: 'pecas', passo: 'inicio', n: 0 });
  const mudou = JSON.stringify(v) !== JSON.stringify(cfgDe(c));
  const base = (c.url || (typeof location !== 'undefined' && location.hostname === 'localhost' ? 'http://localhost:4390' : '')).replace(/\/$/, '');
  const salvar = async () => {
    setSalvando(true);
    const r = await mudar({ acao: 'config', id: c.id, config: v });
    setSalvando(false);
    setMsg(r.ok ? 'Salvo. A página já mostra assim.' : r.erro || 'Erro');
    if (r.ok) setPrevia((p) => ({ ...p, n: p.n + 1 }));
  };

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
        <Secao icone="fa-house" cor={AMBAR} titulo="1 · Início" sub="Primeira tela, embaixo do BLACK DA NOVA">
          <Campo rotulo="Frase curta"><input value={v.inicio.subtitulo} maxLength={120} onChange={(e) => setV({ ...v, inicio: { ...v.inicio, subtitulo: e.target.value } })} style={campoNP} /></Campo>
          <span style={{ fontSize: 13, color: T2 }}>Passos que aparecem numerados</span>
          <ListaTextos itens={v.inicio.passos} max={4} placeholder="Ex.: Preencha a ficha" rotulo={(i) => `${i + 1}.`} onChange={(passos) => setV({ ...v, inicio: { ...v.inicio, passos } })} />
          <Campo rotulo="Faixa dourada do concurso" ajuda="Vazio = some. Também some se a foto estiver desligada na ficha.">
            <input value={v.inicio.concurso} maxLength={140} onChange={(e) => setV({ ...v, inicio: { ...v.inicio, concurso: e.target.value } })} style={campoNP} />
          </Campo>
        </Secao>

        <Secao icone="fa-list-check" cor={AMBAR} titulo="2 · Regras" sub="Uma regra por linha, curta. Para negrito: **assim**. O ícone sai sozinho pelo assunto.">
          <ListaTextos itens={v.regras} max={8} placeholder="Ex.: Vale até 30/11" rotulo={(i) => `${i + 1}.`} onChange={(regras) => setV({ ...v, regras })} />
        </Secao>

        <Secao icone="fa-id-card" cor={AMBAR} titulo="3 · Ficha" sub="O nome sempre é pedido. Ligue, desligue ou ponha campos a mais.">
          <div style={grade(220)}>
            <Liga on={v.ficha.pedir_local} rotulo="Pedir localização" ajuda="GPS do celular ou cidade escrita" onChange={(x) => setV({ ...v, ficha: { ...v.ficha, pedir_local: x } })} />
            <Liga on={v.ficha.pedir_trator} rotulo="Perguntar se tem Mahindra" ajuda="E qual modelo" onChange={(x) => setV({ ...v, ficha: { ...v.ficha, pedir_trator: x } })} />
            <Liga on={v.ficha.pedir_foto && v.ficha.pedir_trator} rotulo="Pedir foto do trator" ajuda="Só para quem tem Mahindra" onChange={(x) => setV({ ...v, ficha: { ...v.ficha, pedir_foto: x } })} />
          </div>
          <CamposFicha campos={v.ficha.campos} onChange={(campos) => setV({ ...v, ficha: { ...v.ficha, campos } })} />
          {v.ficha.pedir_trator && (
            <div style={{ display: 'grid', gap: 8 }}>
              <span style={{ fontSize: 13, color: T2 }}>Modelos de Mahindra para escolher</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {v.ficha.modelos.map((m) => (
                  <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 12px', borderRadius: 999, border: '1px solid var(--border)', fontSize: 13, color: T1 }}>
                    {m}
                    <button type="button" aria-label={`Tirar ${m}`} onClick={() => setV({ ...v, ficha: { ...v.ficha, modelos: v.ficha.modelos.filter((x) => x !== m) } })}
                      style={{ border: 0, background: 'none', cursor: 'pointer', color: T3, padding: '0 4px', font: 'inherit' }}>{ic('fa-xmark')}</button>
                  </span>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); const m = modeloNovo.trim(); if (m && !v.ficha.modelos.includes(m)) setV({ ...v, ficha: { ...v.ficha, modelos: [...v.ficha.modelos, m] } }); setModeloNovo(''); }}
                style={{ display: 'flex', gap: 8, maxWidth: 360 }}>
                <input value={modeloNovo} maxLength={20} onChange={(e) => setModeloNovo(e.target.value)} placeholder="Novo modelo" style={campoNP} />
                <button type="submit" style={bt(AMBAR)}>{ic('fa-plus')}Pôr</button>
              </form>
            </div>
          )}
        </Secao>

        <Secao icone="fa-dharmachakra" cor={AMBAR} titulo="4 · Roleta" sub="Os prêmios de cada roleta ficam em Configurar → Prêmios">
          <div style={grade(200)}>
            {SETORES.map((s) => (
              <Campo key={s} rotulo={`WhatsApp ${SETOR[s].nome}`} ajuda="Botão de resgatar. Vazio = sem botão.">
                <input value={v.whats[s]} inputMode="tel" placeholder="(14) 99999-9999" onChange={(e) => setV({ ...v, whats: { ...v.whats, [s]: e.target.value } })} style={campoNP} />
              </Campo>
            ))}
          </div>
          <div style={grade(240)}>
            <Campo rotulo="Prêmio da foto mais bonita" ajuda="Para você lembrar na hora de escolher (Atender → Fotos)"><input value={v.premio_foto} maxLength={200} onChange={(e) => setV({ ...v, premio_foto: e.target.value })} style={campoNP} /></Campo>
            <Campo rotulo="Resgatar até"><input value={v.validade} maxLength={30} placeholder="31/12/2026" onChange={(e) => setV({ ...v, validade: e.target.value })} style={campoNP} /></Campo>
          </div>
        </Secao>

        <div style={{ position: 'sticky', bottom: 0, display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', background: 'var(--portal-bg)' }}>
          <button type="button" disabled={!mudou || salvando} onClick={salvar} style={{ ...bt(AMBAR, true), opacity: !mudou || salvando ? 0.5 : 1 }}>{ic('fa-floppy-disk')}{salvando ? 'Salvando…' : 'Salvar'}</button>
          {mudou ? <span style={{ fontSize: 13, color: '#b45309' }}>Tem mudança sem salvar</span> : msg && <span style={{ fontSize: 13, color: T2 }}>{msg}</span>}
        </div>
      </div>

      {/* prévia: a página de verdade, num celular */}
      <div style={{ position: 'sticky', top: 12, display: 'grid', gap: 10, justifyItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[['inicio', '1 Início'], ['regras', '2 Regras'], ['ficha', '3 Ficha'], ['roleta', '4 Roleta']].map(([p, l]) => (
            <button key={p} type="button" onClick={() => setPrevia({ ...previa, passo: p, n: previa.n + 1 })} style={{ ...bt(AMBAR, previa.passo === p), minHeight: 34, padding: '6px 12px' }}>{l}</button>
          ))}
          <select value={previa.setor} onChange={(e) => setPrevia({ ...previa, setor: e.target.value as Setor, n: previa.n + 1 })} style={{ ...campoNP, width: 'auto', minHeight: 34 }}>
            {SETORES.map((s) => <option key={s} value={s}>{SETOR[s].nome}</option>)}
          </select>
        </div>
        {base ? (
          <div style={{ width: 390, maxWidth: '100%', height: 720, border: '10px solid #1f1f22', borderRadius: 34, overflow: 'hidden', background: '#000' }}>
            <iframe key={previa.n} title="Prévia no celular" src={`${base}?setor=${previa.setor}&previa=1#${previa.passo}`} style={{ width: '100%', height: '100%', border: 0 }} />
          </div>
        ) : <Aviso tom="info">A prévia aparece quando o endereço da página estiver salvo (Configurar → Campanha → Links).</Aviso>}
        <span style={{ fontSize: 12, color: T3, textAlign: 'center' }}>Prévia do jeito que está salvo. Depois de salvar, ela recarrega.</span>
      </div>
    </div>
  );
}

function PremiosSetor({ setor, c, premios, mudar }: { setor: Setor; c: Camp; premios: Premio[]; mudar: Mudar }) {
  const total = premios.filter((p) => p.ativo).reduce((s, p) => s + p.peso, 0);
  const [novo, setNovo] = useState(false);
  return (
    <Secao icone={SETOR[setor].icone} cor={SETOR[setor].cor} titulo={`Roleta ${SETOR[setor].nome}`}
      sub={`${premios.filter((p) => p.ativo).length} fatias ligadas. A chance é o peso de cada prêmio dividido pela soma dos pesos.`}>
      <div style={{ display: 'grid', gap: 8 }}>
        {premios.map((p) => <LinhaPremio key={p.id} p={p} total={total} mudar={mudar} fisico={ehFisico(c, p.id, p.nome)} />)}
        {novo
          ? <LinhaPremio p={{ id: 0, campanha_id: c.id, setor, rotulo: '', nome: '', detalhe: '', peso: 1, estoque: null, ordem: premios.length + 1, ativo: true, saidas: 0 }} total={total + 1} mudar={async (b) => { const r = await mudar(b); if (r.ok) setNovo(false); return r; }} />
          : <button type="button" onClick={() => setNovo(true)} style={{ ...bt(SETOR[setor].cor), width: 'fit-content' }}>{ic('fa-plus')}Prêmio</button>}
      </div>
    </Secao>
  );
}

function LinhaPremio({ p, total, mudar, fisico }: { p: Premio; total: number; mudar: Mudar; fisico?: boolean }) {
  const [v, setV] = useState({ rotulo: p.rotulo, nome: p.nome, detalhe: p.detalhe || '', peso: String(p.peso), estoque: p.estoque == null ? '' : String(p.estoque), ativo: p.ativo });
  const [msg, setMsg] = useState('');
  const mudou = v.rotulo !== p.rotulo || v.nome !== p.nome || v.detalhe !== (p.detalhe || '') || v.peso !== String(p.peso) || v.estoque !== (p.estoque == null ? '' : String(p.estoque)) || v.ativo !== p.ativo;
  const chance = v.ativo ? pct(Number(v.peso) || 0, total - (p.ativo ? p.peso : 0) + (Number(v.peso) || 0)) : 0;
  const acabou = p.estoque != null && p.saidas >= p.estoque;
  const salvar = async () => {
    const r = await mudar({ acao: 'premio', premio: { id: p.id || undefined, campanha_id: p.campanha_id, setor: p.setor, ordem: p.ordem, rotulo: v.rotulo, nome: v.nome, detalhe: v.detalhe, peso: Number(v.peso), estoque: v.estoque === '' ? null : Number(v.estoque), ativo: v.ativo } });
    setMsg(r.ok ? 'Salvo' : r.erro || 'Erro');
  };
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 10, opacity: v.ativo ? 1 : 0.6 }}>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))' }}>
        <Campo rotulo="Texto na fatia" ajuda="Curto: até ~18 letras"><input value={v.rotulo} maxLength={24} onChange={(e) => setV({ ...v, rotulo: e.target.value })} style={campoNP} /></Campo>
        <Campo rotulo="Prêmio"><input value={v.nome} maxLength={80} onChange={(e) => setV({ ...v, nome: e.target.value })} style={campoNP} /></Campo>
        <Campo rotulo="Regra do prêmio"><input value={v.detalhe} maxLength={200} onChange={(e) => setV({ ...v, detalhe: e.target.value })} style={campoNP} /></Campo>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ width: 110 }}><Campo rotulo="Peso" ajuda={`≈ ${chance}% de chance`}><input type="number" min={0} value={v.peso} onChange={(e) => setV({ ...v, peso: e.target.value })} style={campoNP} /></Campo></div>
        <div style={{ width: 130 }}><Campo rotulo="Limite" ajuda="Vazio = sem limite"><input type="number" min={0} value={v.estoque} onChange={(e) => setV({ ...v, estoque: e.target.value })} style={campoNP} /></Campo></div>
        <span style={{ display: 'grid', gap: 4, paddingBottom: 22 }}>
          <span style={{ fontSize: 13, color: T2 }}>Saíram</span>
          <span style={{ fontSize: 15, color: acabou ? '#b45309' : T1 }}>{n(p.saidas)}{p.estoque != null ? ` de ${n(p.estoque)}` : ''}{acabou ? ' · acabou' : ''}</span>
          {p.estoque != null && p.estoque > 0 && <span style={{ width: 110, height: 6, borderRadius: 3, background: 'color-mix(in srgb, var(--portal-text, #0f172a) 8%, transparent)' }}><span style={{ display: 'block', height: '100%', borderRadius: 3, width: `${Math.min(100, (p.saidas / p.estoque) * 100)}%`, background: acabou ? '#b45309' : AMBAR }} /></span>}
        </span>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 14, color: T1, paddingBottom: 30, cursor: 'pointer' }}>
          <input type="checkbox" checked={v.ativo} onChange={(e) => setV({ ...v, ativo: e.target.checked })} style={{ width: 18, height: 18, accentColor: AMBAR }} />Na roleta
        </label>
        {!!p.id && (
          <label title="Quem ganhar vê que retira na loja dia 15/12, com o endereço e o mapa" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 14, color: T1, paddingBottom: 30, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!fisico} onChange={async (e) => { const r = await mudar({ acao: 'fisico', id: p.campanha_id, premio: p.id, valor: e.target.checked }); setMsg(r.ok ? 'Salvo' : r.erro || 'Erro'); }} style={{ width: 18, height: 18, accentColor: AMBAR }} />Brinde físico (retirar na loja)
          </label>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 22 }}>
          {msg && <span style={{ fontSize: 13, color: msg === 'Salvo' ? VERDE : '#dc2626' }}>{msg}</span>}
          <button type="button" disabled={!mudou && !!p.id} onClick={salvar} style={{ ...bt(AMBAR, true), opacity: !mudou && p.id ? 0.45 : 1 }}>{ic('fa-floppy-disk')}{p.id ? 'Salvar' : 'Incluir'}</button>
        </span>
      </div>
    </div>
  );
}

