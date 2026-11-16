'use client';
// Site → Campanhas (José, 13/11/2026): "fazer uma aba dentro do módulo das redes sociais chamada Campanhas, separa por
// nome da campanha e ano, nesse caso Black Friday 2026". A primeira é a roleta da Black Friday (página solta em
// Projetos\black-friday-roleta): apresentação → regras → ficha + foto de trator Mahindra → roleta por setor.
// Visões: Resumo (conclusões para leigo), Participantes (busca pelo código + dar baixa), Fotos (escolher a mais
// bonita) e Prêmios (texto, chance e limite de cada fatia). ?exemplo=1 mostra dados inventados com aviso.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchAuth } from '@/lib/auth/client';
import { Aviso, Numero, tela, quando } from '@/components/site/ui';
import { AZUL, Campo, Quadradinho, Secao, T1, T2, T3, bt, campoNP, cartaoNP, grade, ic } from '@/components/site/np';

type Setor = 'comercial' | 'posvendas' | 'pecas';
type Camp = { id: string; slug: string; nome: string; ano: number; inicio: string; fim: string; ativo: boolean; url?: string | null; config?: {
  premio_foto?: string; validade?: string
  inicio?: { subtitulo?: string; passos?: string[]; concurso?: string }; regras?: string[]
  ficha?: { pedir_local?: boolean; pedir_trator?: boolean; pedir_foto?: boolean; modelos?: string[] }; whats?: Partial<Record<Setor, string>>
} };
type Premio = { id: number; campanha_id: string; setor: Setor; rotulo: string; nome: string; detalhe: string | null; peso: number; estoque: number | null; ordem: number; ativo: boolean; saidas: number };
type Part = {
  id: string; setor: Setor; criado_em: string; nome: string; cidade: string | null; lat: number | null; lng: number | null
  tem_trator: boolean; modelo: string | null; foto_url: string | null; foto_vencedora: boolean; premio_nome: string | null
  codigo: string | null; girou_em: string | null; resgatado_em: string | null; resgatado_por: string | null
};
type Dados = { campanhas: Camp[]; atual: Camp | null; premios: Premio[]; participantes: Part[] };
type Ver = 'resumo' | 'participantes' | 'fotos' | 'premios' | 'pagina';

const AMBAR = '#d97706', VERDE = '#16a34a', ROXO = '#7c3aed';
const SETOR: Record<Setor, { nome: string; cor: string; icone: string }> = {
  comercial: { nome: 'Comercial', cor: AZUL, icone: 'fa-handshake' },
  posvendas: { nome: 'Pós-Vendas', cor: VERDE, icone: 'fa-screwdriver-wrench' },
  pecas: { nome: 'Peças', cor: ROXO, icone: 'fa-gears' },
};
const SETORES = Object.keys(SETOR) as Setor[];
const VISOES: { id: Ver; label: string; icone: string }[] = [
  { id: 'resumo', label: 'Resumo', icone: 'fa-chart-simple' },
  { id: 'participantes', label: 'Participantes', icone: 'fa-users' },
  { id: 'fotos', label: 'Fotos', icone: 'fa-camera' },
  { id: 'premios', label: 'Prêmios', icone: 'fa-gift' },
  { id: 'pagina', label: 'O que aparece', icone: 'fa-mobile-screen' },
];
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
export default function Campanhas() {
  const sp = useSearchParams();
  const ehExemplo = sp?.get('exemplo') === '1';
  const slug = sp?.get('campanha') || '';
  const ver = (VISOES.find((v) => v.id === sp?.get('ver'))?.id || 'resumo') as Ver;
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [semSql, setSemSql] = useState(false);

  const carregar = useCallback(async () => {
    if (ehExemplo) { setD(exemplo()); return; }
    try {
      const r = await fetchAuth(`/api/site/campanhas${slug ? `?campanha=${encodeURIComponent(slug)}` : ''}`);
      const j = await r.json();
      if (!j.ok) { setErro(j.erro || 'Erro ao carregar'); setSemSql(!!j.semSql); return; }
      setErro(''); setD(j);
    } catch { setErro('Sem conexão com o portal.'); }
  }, [ehExemplo, slug]);
  useEffect(() => { carregar(); }, [carregar]);

  const mudar = useCallback(async (corpo: Record<string, unknown>) => {
    if (ehExemplo) return { ok: false, erro: 'No exemplo nada é salvo.' };
    const r = await fetchAuth('/api/site/campanhas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({ ok: false, erro: 'Erro' }));
    if (j.ok) await carregar();
    return j as { ok: boolean; erro?: string };
  }, [ehExemplo, carregar]);

  const href = (mais: Record<string, string>) => {
    const q = new URLSearchParams(sp?.toString() || '');
    for (const [k, v] of Object.entries(mais)) q.set(k, v);
    return `/site/campanhas?${q.toString()}`;
  };

  if (erro) {
    return (
      <div style={tela}>
        <Aviso tom={semSql ? 'info' : 'erro'}>
          {erro}
          {semSql && <> Enquanto isso, <Link href="/site/campanhas?exemplo=1" style={{ color: AZUL }}>veja como fica com dados de exemplo</Link>.</>}
        </Aviso>
      </div>
    );
  }
  if (!d) return <div style={{ ...tela, color: T3 }}>Carregando…</div>;
  if (!d.atual) return <div style={tela}><Aviso tom="info">Nenhuma campanha cadastrada ainda.</Aviso></div>;

  const anos = [...new Set(d.campanhas.map((c) => c.ano))];
  return (
    <div style={{ ...tela, maxWidth: 1400 }}>
      {ehExemplo && <Aviso tom="info"><b style={{ fontWeight: 500 }}>Dados de exemplo, inventados.</b> Servem só para ver como a tela fica. <Link href="/site/campanhas" style={{ color: AZUL }}>Ver os dados reais</Link></Aviso>}

      {/* escolha da campanha: por ano */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {anos.map((ano) => (
          <div key={ano} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: T3 }}>{ano}</span>
            {d.campanhas.filter((c) => c.ano === ano).map((c) => {
              const on = c.slug === d.atual!.slug;
              return (
                <Link key={c.slug} href={href({ campanha: c.slug })}
                  style={{ ...bt(AMBAR, on), minHeight: 36, padding: '6px 14px' }}>
                  {ic('fa-bullhorn')}{c.nome} {c.ano}
                </Link>
              );
            })}
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: T3 }}>
          {dataBR(d.atual.inicio)} a {dataBR(d.atual.fim)} · {situacao(d.atual)}
        </span>
      </div>

      {/* visões */}
      <nav style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        {VISOES.map((v) => {
          const on = v.id === ver;
          return (
            <Link key={v.id} href={href({ ver: v.id })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '7px 16px', borderRadius: 9, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap', background: on ? AMBAR : 'transparent', color: on ? '#fefefe' : T1 }}>
              <i className={`fa-solid ${v.icone}`} style={{ fontWeight: 900, color: on ? '#fefefe' : T3 }} />{v.label}
            </Link>
          );
        })}
      </nav>

      {ver === 'resumo' && <Resumo d={d} mudar={mudar} exemplo={ehExemplo} />}
      {ver === 'participantes' && <Participantes d={d} mudar={mudar} />}
      {ver === 'fotos' && <Fotos d={d} mudar={mudar} />}
      {ver === 'premios' && <Premios d={d} mudar={mudar} />}
      {ver === 'pagina' && <OQueAparece key={d.atual.id} d={d} mudar={mudar} />}
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
              style={{ flex: '1 0 24px', display: 'grid', gridTemplateRows: 'auto 1fr auto', height: '100%', gap: 3 }}>
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

function Resumo({ d, mudar, exemplo: ehExemplo }: { d: Dados; mudar: Mudar; exemplo: boolean }) {
  const [filtro, setFiltro] = useState<Setor | ''>('');
  const todos = d.participantes;
  const ps = filtro ? todos.filter((p) => p.setor === filtro) : todos;
  const girou = ps.filter((p) => p.codigo).length;
  const resg = ps.filter((p) => p.resgatado_em).length;
  const comTrator = ps.filter((p) => p.tem_trator).length;
  const fotos = ps.filter((p) => p.foto_url || (ehExemplo && p.tem_trator)).length;
  const c = d.atual!;
  const onde = filtro ? ` na roleta ${SETOR[filtro].nome}` : '';
  const titulo = ps.length
    ? `${n(ps.length)} ${ps.length === 1 ? 'pessoa respondeu' : 'pessoas responderam'}${onde}; ${n(comTrator)} já ${comTrator === 1 ? 'tem' : 'têm'} Mahindra da Nova`
    : `Ninguém respondeu${onde} ainda`;
  const lider = !filtro && todos.length ? SETORES.map((s) => ({ s, v: todos.filter((p) => p.setor === s).length })).sort((a, b) => b.v - a.v)[0] : null;
  const semCidade = ps.filter((p) => !p.cidade && p.lat != null).length;

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setFiltro('')} style={{ ...bt(AMBAR, filtro === ''), minHeight: 36 }}>Todos os setores</button>
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

      <div style={grade(180)}>
        <Numero icone="fa-user-plus" cor={AMBAR} rotulo="Responderam" valor={n(ps.length)} />
        <Numero icone="fa-dharmachakra" cor={AZUL} rotulo="Giraram a roleta" valor={n(girou)} detalhe={`${pct(girou, ps.length)}% de quem respondeu`} />
        <Numero icone="fa-tractor" cor={VERDE} rotulo="Têm Mahindra da Nova" valor={n(comTrator)} detalhe={`${n(ps.length - comTrator)} ainda não têm: clientes para o Comercial`} />
        <Numero icone="fa-camera" cor={ROXO} rotulo="Fotos recebidas" valor={n(fotos)} />
        <Numero icone="fa-circle-check" cor={VERDE} rotulo="Prêmios resgatados" valor={n(resg)} detalhe={`${n(girou - resg)} ainda não vieram buscar`} />
      </div>

      <div style={grade(340)}>
        <Secao icone="fa-chart-column" cor={AMBAR} titulo="Respostas por dia" sub={filtro ? `Roleta ${SETOR[filtro].nome}` : 'Cada cor é um setor (passe o mouse na coluna)'}>
          <ColunasDia ps={ps} setores={filtro ? [filtro] : SETORES} />
        </Secao>
        <Secao icone="fa-filter" cor={AZUL} titulo="Quantos responderam em cada setor" sub="Responderam → giraram → resgataram o prêmio">
          <FunilSetores ps={todos} />
        </Secao>
      </div>

      <Secao icone="fa-link" cor={AMBAR} titulo="Os 3 links, um por setor" sub="Cada setor manda o seu: o link abre direto a roleta dele e as respostas ficam separadas aqui.">
        <LinksSetores c={c} ps={todos} mudar={mudar} />
      </Secao>

      <div style={grade(300)}>
        <Secao icone="fa-tractor" cor={VERDE} titulo="Tem Mahindra comprado na Nova?" sub="Resposta da ficha">
          <Barras itens={[{ rotulo: 'Sim', valor: comTrator }, { rotulo: 'Não', valor: ps.length - comTrator }]} cor={VERDE} />
        </Secao>
        <Secao icone="fa-tractor" cor={VERDE} titulo="Modelos que os clientes têm" sub="Quem disse que tem Mahindra comprado na Nova">
          <Barras itens={contar(ps.filter((p) => p.tem_trator), (p) => p.modelo)} cor={VERDE} />
        </Secao>
        <Secao icone="fa-location-dot" cor={ROXO} titulo="De onde vieram" sub={semCidade ? `${n(semCidade)} mandaram só a localização do celular: veja no mapa em Participantes` : 'Cidade escrita na ficha'}>
          <Barras itens={contar(ps, (p) => p.cidade && p.cidade.trim().replace(/(^|\s)\S/g, (l) => l.toUpperCase()))} cor={ROXO} />
        </Secao>
      </div>
    </>
  );
}

function LinksSetores({ c, ps, mudar }: { c: Camp; ps: Part[]; mudar: Mudar }) {
  const [url, setUrl] = useState(c.url || '');
  const [msg, setMsg] = useState('');
  const [copiado, setCopiado] = useState('');
  const base = (c.url || '').replace(/\/$/, '');
  const copiar = async (s: Setor) => {
    try { await navigator.clipboard.writeText(`${base}?setor=${s}`); setCopiado(s); setTimeout(() => setCopiado(''), 1800); } catch { setMsg('Não deu para copiar: selecione o link e copie.'); }
  };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={grade(240)}>
        {SETORES.map((s) => {
          const lista = ps.filter((p) => p.setor === s);
          const g = lista.filter((p) => p.codigo).length, r = lista.filter((p) => p.resgatado_em).length;
          return (
            <div key={s} style={{ ...cartaoNP, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Quadradinho icone={SETOR[s].icone} cor={SETOR[s].cor} />
                <span style={{ display: 'grid' }}>
                  <span style={{ fontSize: 15, color: T1 }}>Roleta {SETOR[s].nome}</span>
                  <span style={{ fontSize: 13, color: T3 }}>{n(lista.length)} cadastros · {n(g)} giraram · {n(r)} resgataram</span>
                </span>
              </div>
              {base ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                  <code style={{ flex: 1, minWidth: 0, fontSize: 12, color: T2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{base}?setor={s}</code>
                  <button type="button" onClick={() => copiar(s)} style={{ ...bt(SETOR[s].cor, copiado === s), minHeight: 34 }}>{ic(copiado === s ? 'fa-check' : 'fa-copy')}{copiado === s ? 'Copiado' : 'Copiar'}</button>
                  <a href={`${base}?setor=${s}`} target="_blank" rel="noreferrer" style={{ ...bt(SETOR[s].cor, true), minHeight: 34 }}>{ic('fa-arrow-up-right-from-square')}Abrir</a>
                </div>
              ) : <span style={{ fontSize: 13, color: T3 }}>O link aparece quando a página estiver publicada (endereço abaixo).</span>}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px' }}>
          <Campo rotulo="Endereço da página da campanha" ajuda="Onde a página foi publicada. Os links dos setores são este endereço com ?setor= no fim.">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" style={campoNP} />
          </Campo>
        </div>
        <button type="button" style={{ ...bt(AMBAR, true), marginBottom: 22 }} onClick={async () => { const r = await mudar({ acao: 'campanha', id: c.id, url }); setMsg(r.ok ? 'Salvo.' : r.erro || 'Erro'); }}>{ic('fa-floppy-disk')}Salvar</button>
      </div>
      {msg && <span style={{ fontSize: 13, color: T2 }}>{msg}</span>}
    </div>
  );
}

// ---------- PARTICIPANTES ----------
function Participantes({ d, mudar }: { d: Dados; mudar: Mudar }) {
  const [busca, setBusca] = useState('');
  const [setor, setSetor] = useState<Setor | ''>('');
  const [soAbertos, setSoAbertos] = useState(false);
  const [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState('');
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return d.participantes.filter((p) => (!setor || p.setor === setor) && (!soAbertos || (p.codigo && !p.resgatado_em))
      && (!b || `${p.nome} ${p.codigo || ''} ${p.cidade || ''} ${p.modelo || ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(b)));
  }, [d.participantes, busca, setor, soAbertos]);

  const baixa = async (p: Part) => {
    setOcupado(p.id); setErro('');
    const r = await mudar({ acao: p.resgatado_em ? 'desfazer' : 'resgatar', id: p.id });
    if (!r.ok) setErro(r.erro || 'Erro');
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
          <button type="button" onClick={() => setSoAbertos((x) => !x)} style={{ ...bt(VERDE, soAbertos), minHeight: 36 }}>{ic('fa-hourglass-half')}Falta buscar</button>
        </div>
      </div>
      <span style={{ fontSize: 13, color: T3 }}>{n(lista.length)} de {n(d.participantes.length)}</span>
      {erro && <Aviso>{erro}</Aviso>}

      <div style={{ display: 'grid', gap: 8 }}>
        {lista.slice(0, 300).map((p) => (
          <div key={p.id} style={{ ...cartaoNP, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 14, alignItems: 'start', padding: 14 }}>
            {p.foto_url
              ? <a href={p.foto_url} target="_blank" rel="noreferrer"><img src={p.foto_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, display: 'block' }} /></a>
              : <span style={{ width: 64, height: 64, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--portal-text, #0f172a) 5%, transparent)', color: T3 }}>{ic('fa-user')}</span>}
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', alignItems: 'start' }}>
              <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 15, color: T1 }}>{p.nome}</span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Chip cor={SETOR[p.setor].cor}>{SETOR[p.setor].nome}</Chip>
                  <span style={{ fontSize: 12, color: T3 }}>{quando(p.criado_em)}</span>
                </span>
              </span>
              <span style={{ display: 'grid', gap: 3, fontSize: 13, color: T2, minWidth: 0 }}>
                <span>{ic('fa-location-dot')} {p.cidade || (p.lat != null ? 'Localização do celular' : '—')}
                  {p.lat != null && <> · <a href={mapa(p)} target="_blank" rel="noreferrer" style={{ color: AZUL }}>ver no mapa</a></>}
                </span>
                <span>{ic('fa-tractor')} {p.tem_trator ? `Mahindra ${p.modelo || ''} da Nova` : 'Não tem Mahindra da Nova'}</span>
              </span>
              <span style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                {p.codigo ? (
                  <>
                    <span style={{ fontSize: 13, color: T1 }}>{p.premio_nome}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <code style={{ fontSize: 13, padding: '2px 8px', borderRadius: 6, border: '1px dashed var(--border)', color: T1 }}>{p.codigo}</code>
                      {p.resgatado_em
                        ? <>
                            <Chip cor={VERDE}>{ic('fa-circle-check')}Resgatado {new Date(p.resgatado_em).toLocaleDateString('pt-BR')}{p.resgatado_por ? ` · ${p.resgatado_por.split(' ')[0]}` : ''}</Chip>
                            <button type="button" disabled={ocupado === p.id} onClick={() => baixa(p)} style={{ background: 'none', border: 0, padding: 0, color: T3, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}>desfazer</button>
                          </>
                        : <button type="button" disabled={ocupado === p.id} onClick={() => baixa(p)} style={{ ...bt(VERDE, true), minHeight: 34 }}>{ic('fa-check')}{ocupado === p.id ? 'Salvando…' : 'Dar baixa'}</button>}
                    </span>
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
  return <>{SETORES.map((s) => <PremiosSetor key={s} setor={s} c={c} premios={d.premios.filter((p) => p.setor === s)} mudar={mudar} />)}</>;
}

// ---------- O QUE APARECE (José, 13/11: "controlar o que aparece em cada aba da roleta") ----------
const MODELOS_PADRAO = ['2025', '5050', '6060', '6065', '6075', '6075E', '6675F', '7095', '8110', 'OJA 3140', 'Retro VX90', 'Outro'];
type Cfg = {
  inicio: { subtitulo: string; passos: string[]; concurso: string }
  regras: string[]
  ficha: { pedir_local: boolean; pedir_trator: boolean; pedir_foto: boolean; modelos: string[] }
  whats: Record<Setor, string>
  premio_foto: string; validade: string
};
function cfgDe(c: Camp): Cfg {
  const k = c.config || {};
  return {
    inicio: { subtitulo: k.inicio?.subtitulo ?? 'Gire a roleta. Todo giro ganha.', passos: k.inicio?.passos?.length ? [...k.inicio.passos] : ['Leia as regras', 'Preencha a ficha', 'Gire e ganhe na hora'], concurso: k.inicio?.concurso ?? 'Tem Mahindra? A foto mais bonita ganha prêmio.' },
    regras: k.regras?.length ? [...k.regras] : ['Vale até 30/11', '1 giro por pessoa nesta roleta', 'Todo giro ganha prêmio', 'Mostre o código na loja até 31/12', 'Foto mais bonita do seu Mahindra ganha prêmio'],
    ficha: { pedir_local: k.ficha?.pedir_local !== false, pedir_trator: k.ficha?.pedir_trator !== false, pedir_foto: k.ficha?.pedir_foto !== false, modelos: k.ficha?.modelos?.length ? [...k.ficha.modelos] : MODELOS_PADRAO },
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

        <Secao icone="fa-id-card" cor={AMBAR} titulo="3 · Ficha" sub="O nome sempre é pedido">
          <div style={grade(220)}>
            <Liga on={v.ficha.pedir_local} rotulo="Pedir localização" ajuda="GPS do celular ou cidade escrita" onChange={(x) => setV({ ...v, ficha: { ...v.ficha, pedir_local: x } })} />
            <Liga on={v.ficha.pedir_trator} rotulo="Perguntar se tem Mahindra" ajuda="E qual modelo" onChange={(x) => setV({ ...v, ficha: { ...v.ficha, pedir_trator: x } })} />
            <Liga on={v.ficha.pedir_foto && v.ficha.pedir_trator} rotulo="Pedir foto do trator" ajuda="Só para quem tem Mahindra" onChange={(x) => setV({ ...v, ficha: { ...v.ficha, pedir_foto: x } })} />
          </div>
          {v.ficha.pedir_trator && (
            <div style={{ display: 'grid', gap: 8 }}>
              <span style={{ fontSize: 13, color: T2 }}>Modelos para escolher</span>
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

        <Secao icone="fa-dharmachakra" cor={AMBAR} titulo="4 · Roleta" sub="Os prêmios de cada roleta ficam na aba Prêmios">
          <div style={grade(200)}>
            {SETORES.map((s) => (
              <Campo key={s} rotulo={`WhatsApp ${SETOR[s].nome}`} ajuda="Botão de resgatar. Vazio = sem botão.">
                <input value={v.whats[s]} inputMode="tel" placeholder="(14) 99999-9999" onChange={(e) => setV({ ...v, whats: { ...v.whats, [s]: e.target.value } })} style={campoNP} />
              </Campo>
            ))}
          </div>
          <div style={grade(240)}>
            <Campo rotulo="Prêmio da foto mais bonita" ajuda="Para você lembrar na hora de escolher (aba Fotos)"><input value={v.premio_foto} maxLength={200} onChange={(e) => setV({ ...v, premio_foto: e.target.value })} style={campoNP} /></Campo>
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
        ) : <Aviso tom="info">A prévia aparece quando o endereço da página estiver salvo (Resumo → Os 3 links).</Aviso>}
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
        {premios.map((p) => <LinhaPremio key={p.id} p={p} total={total} mudar={mudar} />)}
        {novo
          ? <LinhaPremio p={{ id: 0, campanha_id: c.id, setor, rotulo: '', nome: '', detalhe: '', peso: 1, estoque: null, ordem: premios.length + 1, ativo: true, saidas: 0 }} total={total + 1} mudar={async (b) => { const r = await mudar(b); if (r.ok) setNovo(false); return r; }} />
          : <button type="button" onClick={() => setNovo(true)} style={{ ...bt(SETOR[setor].cor), width: 'fit-content' }}>{ic('fa-plus')}Prêmio</button>}
      </div>
    </Secao>
  );
}

function LinhaPremio({ p, total, mudar }: { p: Premio; total: number; mudar: Mudar }) {
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
        </span>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 14, color: T1, paddingBottom: 30, cursor: 'pointer' }}>
          <input type="checkbox" checked={v.ativo} onChange={(e) => setV({ ...v, ativo: e.target.checked })} style={{ width: 18, height: 18, accentColor: AMBAR }} />Na roleta
        </label>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 22 }}>
          {msg && <span style={{ fontSize: 13, color: msg === 'Salvo' ? VERDE : '#dc2626' }}>{msg}</span>}
          <button type="button" disabled={!mudou && !!p.id} onClick={salvar} style={{ ...bt(AMBAR, true), opacity: !mudou && p.id ? 0.45 : 1 }}>{ic('fa-floppy-disk')}{p.id ? 'Salvar' : 'Incluir'}</button>
        </span>
      </div>
    </div>
  );
}

