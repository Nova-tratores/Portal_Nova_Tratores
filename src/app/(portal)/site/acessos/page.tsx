'use client';
// Site → Acessos (José, 10/11/2026): "quem entra no site, quantos acessos, e se saiu, o que aconteceu".
// 11/11 ("muita informação faltando"): resumo em frases, comparação com o período anterior, caminho até o contato,
// máquinas mais vistas, para que chamaram, por onde entram, horário e dia da semana, celular × computador, quem voltou,
// campanhas, buscas sem resultado e os pedidos de proposta (máquina, linha, cidade, situação).
// Guia de dados para leigo: o título de cada cartão é a conclusão; o gráfico mostra o começo; "Ver tudo" abre a lista inteira.
// Anônimo: cada visita é um aparelho sem nome.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import SubAbas from '@/components/site/SubAbas';
import { ABAS_ACESSOS } from '@/components/site/abasAcessos';
import type { Resumo, Visita } from '@/lib/site/acessos';
import type { ResumoPedidos } from '@/app/api/site/acessos/route';
import { Aviso, ComoLer, Conta, Numero, botao, cartao, duracao, grade, quando, real, tela } from '@/components/site/ui';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const parte = (a: number, b: number) => (b ? pct(a / b) : '0%');
const NOME_CLIQUE: Record<string, string> = {
  clique_whatsapp: 'WhatsApp', clique_telefone: 'Telefone', simulador_whatsapp: 'Simulador → WhatsApp',
  simulador_formulario: 'Simulador → pedido de proposta', clique_whatsapp_trator_ideal: 'Trator ideal → WhatsApp',
  usado_whatsapp: 'Avaliar usado → WhatsApp', demonstracao_whatsapp: 'Pedir demonstração',
  pecas_whatsapp: 'Peças → pedir no WhatsApp', pecas3d_whatsapp: 'Catálogo 3D → pedir peça', pecas_abrir_3d: 'Abriu o catálogo 3D',
  pecas_nao_achou: 'Peças → não achou', busca_pecas: 'Buscou peça', pecas_aba: 'Peças → trocou de aba', posvenda_whatsapp: 'Pós-venda → WhatsApp',
  contato_whatsapp_vendas: 'Contato → WhatsApp Vendas', contato_whatsapp_posvenda: 'Contato → WhatsApp Pós-Vendas', contato_whatsapp_pecas: 'Contato → WhatsApp Peças', contato_como_chegar: 'Contato → Como chegar',
  garantia_agendar_revisao: 'Garantia → agendar revisão',
  busca_tratores: 'Tratores → buscou', busca_implementos: 'Implementos → buscou',
  busca_sem_resultado_tratores: 'Tratores → buscou e não achou', busca_sem_resultado_implementos: 'Implementos → buscou e não achou',
  busca_vazia_whatsapp: 'Busca sem resultado → WhatsApp', busca_vazia_outra_pagina: 'Busca sem resultado → procurou em Implementos', tipo_implementos: 'Implementos → filtrou por tipo',
  home_entrega_whatsapp: 'Home → entrega na propriedade (WhatsApp)', garantia_nao_achou: 'Garantia → não achou, perguntou no WhatsApp',
  menu_atalho: 'Menu → atalho de ajuda', implemento_funciona_com: 'Implemento → abriu trator compatível', pagina_404: 'Caiu em página que não existe', pagina_404_caminho: 'Página 404 → seguiu para',
  aviso_topo: 'Tocou no aviso do topo',
  promocao_vista: 'Viu o bloco de promoções', promocao_clique: 'Promoção → abriu', promocao_whatsapp: 'Promoção → WhatsApp',
};
const NOME_STATUS: Record<string, string> = { novo: 'Novo, ninguém atendeu', em_contato: 'Em contato', proposta: 'Proposta enviada', ganho: 'Vendido', perdido: 'Perdido', descartado: 'Descartado' };
const NOME_APARELHO: Record<string, string> = { celular: 'Celular', computador: 'Computador', tablet: 'Tablet' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return `${MESES[m - 1]} de ${a}`; };
/** Últimos 12 meses (AAAA-MM), do atual para trás, pelo relógio de Piraju. */
function ultimosMeses(): string[] {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  let [a, m] = hoje.split('-').map(Number);
  const lista: string[] = [];
  for (let i = 0; i < 12; i++) { lista.push(`${a}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; a--; } }
  return lista;
}
const nomeClique = (e: string) => NOME_CLIQUE[e] || e.replace(/_/g, ' ');
const semSufixo = (t: string) => t.replace(/ — Nova Tratores.*$/, '');
const diaCurto = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const muted = 'var(--portal-text-muted, #6b7280)';

type Linha = { rotulo: string; valor: number; extra?: string };
type Dados = {
  resumo: Resumo; pedidos: number; pedidosResumo: ResumoPedidos; visitas: Visita[]; exemplo: boolean;
  anterior: { visitas: number; visitantes: number; conversoes: number; pedidos: number };
};

function Barras({ linhas, cor, vazio = 'Sem dados no período.' }: { linhas: Linha[]; cor: string; vazio?: string }) {
  const max = Math.max(1, ...linhas.map((l) => l.valor));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {linhas.map((l, i) => (
        <div key={`${l.rotulo}-${i}`} style={{ display: 'grid', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.rotulo}</span>
            <span style={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{l.valor.toLocaleString('pt-BR')}{l.extra ? <span style={{ color: muted }}> · {l.extra}</span> : null}</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--portal-bg)' }}>
            <div style={{ height: '100%', width: `${(l.valor / max) * 100}%`, borderRadius: 4, background: cor, transition: 'width .6s' }} />
          </div>
        </div>
      ))}
      {!linhas.length && <span style={{ fontSize: 13, color: muted }}>{vazio}</span>}
    </div>
  );
}

/** Cartão no guia "dados para leigo": assunto pequeno em cima, conclusão como título, gráfico curto e "Ver tudo". */
function Cartao({ assunto, icone, cor, titulo, children, verTudo, largo }: {
  assunto: string; icone: string; cor: string; titulo: ReactNode; children: ReactNode; verTudo?: () => void; largo?: boolean;
}) {
  return (
    <section style={{ ...cartao, display: 'grid', gap: 12, alignContent: 'start', gridColumn: largo ? '1 / -1' : undefined }}>
      <div style={{ display: 'grid', gap: 2 }}>
        <span style={{ fontSize: 12, color: muted, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className={`fa-solid ${icone}`} style={{ fontWeight: 900, color: cor }} />{assunto}
        </span>
        <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--portal-text)', lineHeight: 1.35 }}>{titulo}</span>
      </div>
      {children}
      {verTudo && (
        <button onClick={verTudo} style={{ justifySelf: 'start', border: 0, background: 'transparent', padding: '6px 0', minHeight: 32, color: '#dc2626', font: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          Ver tudo <i className="fa-solid fa-arrow-right" style={{ fontWeight: 900, marginLeft: 4 }} />
        </button>
      )}
    </section>
  );
}

function Janela({ titulo, linhas, cor, fechar }: { titulo: string; linhas: Linha[]; cor: string; fechar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    addEventListener('keydown', esc); return () => removeEventListener('keydown', esc);
  }, [fechar]);
  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} onClick={fechar}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...cartao, width: 'min(640px, 100%)', maxHeight: 'min(80vh, 760px)', display: 'grid', gridTemplateRows: 'auto 1fr', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <b style={{ fontWeight: 500, flex: 1 }}>{titulo}</b>
          <button onClick={fechar} aria-label="Fechar" style={{ width: 40, height: 40, border: 0, borderRadius: 10, background: 'var(--portal-bg)', color: 'var(--portal-text)', cursor: 'pointer' }}>
            <i className="fa-solid fa-xmark" style={{ fontWeight: 900 }} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16 }}><Barras linhas={linhas} cor={cor} /></div>
      </div>
    </div>
  );
}

/** "▲ 12% em relação a …" */
function Comparado({ agora, antes, rotulo }: { agora: number; antes: number; rotulo: string }) {
  if (!antes) return <>{agora ? `sem dados ${rotulo} para comparar` : ''}</>;
  const d = (agora - antes) / antes;
  if (Math.abs(d) < 0.02) return <>igual {rotulo}</>;
  return <span style={{ color: d > 0 ? '#16a34a' : '#dc2626' }}>{d > 0 ? '▲' : '▼'} {pct(Math.abs(d))} <span style={{ color: muted }}>{rotulo}</span></span>;
}

export default function AcessosSitePage() {
  const [dias, setDias] = useState(7);
  // Ver por mês (José, 11/11): escolhido um mês, os dias ficam de lado.
  const [mes, setMes] = useState<string | null>(null);
  const [exemplo, setExemplo] = useState(false);
  const meses = useMemo(() => ultimosMeses(), []);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [so, setSo] = useState<'todas' | 'converteu' | 'saiu'>('todas');
  const [aberta, setAberta] = useState<string | null>(null);
  const [janela, setJanela] = useState<{ titulo: string; linhas: Linha[]; cor: string } | null>(null);
  const fecharJanela = useCallback(() => setJanela(null), []);

  const carregar = useCallback(async () => {
    const q = mes ? `mes=${mes}` : `dias=${dias}`;
    const r = await fetchAuth(`/api/site/acessos?${q}${exemplo ? '&exemplo=1' : ''}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui carregar os acessos.'); return; }
    setErro(''); setDados(j);
  }, [dias, mes, exemplo]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDados(null); carregar(); const t = setInterval(carregar, 120_000); return () => clearInterval(t); }, [carregar]);

  const r = dados?.resumo;
  const pd = dados?.pedidosResumo;
  const antes = dados?.anterior;
  const rotuloAntes = mes ? 'que o mês anterior' : dias === 1 ? 'que as 24 h antes' : `que os ${dias} dias antes`;
  const visitas = useMemo(() => (dados?.visitas || []).filter((v) => so === 'todas' || (so === 'converteu' ? v.converteu : !v.converteu)), [dados, so]);
  // No mês, todos os dias aparecem (os sem visita ficam com barra zerada), para ler o mês inteiro.
  const porDia = useMemo(() => {
    const lista = r?.porDia || [];
    if (!mes) return lista;
    const [a, m] = mes.split('-').map(Number);
    const total = new Date(a, m, 0).getDate();
    const mapa = new Map(lista.map((d) => [d.dia, d]));
    return Array.from({ length: total }, (_, i) => { const dia = `${mes}-${String(i + 1).padStart(2, '0')}`; return mapa.get(dia) || { dia, visitas: 0, conversoes: 0 }; });
  }, [r, mes]);
  const maxDia = Math.max(1, ...porDia.map((d) => d.visitas));

  // Linhas de cada cartão (o cartão mostra o começo; a janela, tudo)
  const L = useMemo(() => {
    if (!r) return null;
    const conv = (c: number, v: number) => `${c} chamaram (${parte(c, v)})`;
    return {
      produtos: r.produtos.map((p) => ({ rotulo: `${p.nome}${p.tipo === 'Implemento' ? ' (implemento)' : ''}`, valor: p.visitas, extra: conv(p.conversoes, p.visitas) })),
      assuntos: r.assuntos.map((a) => ({ rotulo: a.assunto, valor: a.visitas })),
      origens: r.origens.map((o) => ({ rotulo: o.nome, valor: o.visitas, extra: conv(o.conversoes, o.visitas) })),
      entradas: r.entradas.map((e) => ({ rotulo: e.titulo || e.caminho, valor: e.visitas, extra: conv(e.conversoes, e.visitas) })),
      saidas: r.saidas.filter((s) => s.semConversao).map((s) => ({ rotulo: semSufixo(s.titulo), valor: s.semConversao, extra: `de ${s.saidas} que saíram ali` })),
      paginas: r.topPaginas.map((p) => ({ rotulo: semSufixo(p.titulo), valor: p.aberturas, extra: p.tempoMedio_s ? `${duracao(p.tempoMedio_s)}, rola ${p.rolouMedio}%` : undefined })),
      cliques: r.cliques.map((c) => ({ rotulo: nomeClique(c.evento), valor: c.total })),
      buscas: r.buscasProdutos.map((b) => ({ rotulo: `${b.termo} (${b.onde})`, valor: b.total })),
      semResultado: r.buscasSemResultado.map((b) => ({ rotulo: `${b.termo} (${b.onde})`, valor: b.total })),
      pecas: r.buscasPecas.map((b) => ({ rotulo: b.termo, valor: b.total })),
      pedidas: r.pecasPedidas.map((p) => ({ rotulo: p.codigo, valor: p.total })),
      campanhas: r.campanhas.map((c) => ({ rotulo: c.nome, valor: c.visitas, extra: conv(c.conversoes, c.visitas) })),
      aparelhos: r.aparelhos.map((a) => ({ rotulo: NOME_APARELHO[a.aparelho] || a.aparelho, valor: a.visitas, extra: conv(a.conversoes, a.visitas) })),
      semana: r.porSemana.map((d) => ({ rotulo: d.dia, valor: d.visitas, extra: `${d.conversoes} chamaram` })),
    };
  }, [r]);
  const ver = (titulo: string, linhas: Linha[], cor: string) => () => setJanela({ titulo, linhas, cor });

  // Frases de resumo (a conclusão de cada assunto, em uma linha)
  const frases = useMemo(() => {
    if (!r || !r.visitas) return [];
    const f: ReactNode[] = [];
    const topProd = r.produtos[0];
    if (topProd) f.push(<>A máquina mais vista foi o <b>{topProd.nome}</b>: {topProd.visitas} visitas, {topProd.conversoes} chamaram.</>);
    const topOrig = r.origens[0];
    if (topOrig) f.push(<><b>{topOrig.nome}</b> trouxe {parte(topOrig.visitas, r.visitas)} das visitas.</>);
    const melhorOrig = [...r.origens].filter((o) => o.visitas >= 5).sort((a, b) => b.conversoes / b.visitas - a.conversoes / a.visitas)[0];
    if (melhorOrig && melhorOrig.conversoes) f.push(<>Quem vem do <b>{melhorOrig.nome}</b> é quem mais chama: {parte(melhorOrig.conversoes, melhorOrig.visitas)} das visitas.</>);
    const topAss = r.assuntos[0];
    if (topAss) f.push(<>Quem chama, chama mais para <b>{topAss.assunto.toLowerCase()}</b> ({topAss.visitas} {topAss.visitas === 1 ? 'visita' : 'visitas'}).</>);
    const hora = [...r.porHora].sort((a, b) => b.visitas - a.visitas)[0];
    const dia = [...r.porSemana].sort((a, b) => b.visitas - a.visitas)[0];
    if (hora?.visitas) f.push(<>Mais movimento <b>às {hora.hora} h</b> e na <b>{dia.dia}</b>.</>);
    const sr = r.buscasSemResultado[0];
    if (sr) f.push(<>Procuraram e <b>não acharam</b>: “{sr.termo}”{r.buscasSemResultado.length > 1 ? ` e mais ${r.buscasSemResultado.length - 1} buscas` : ''}.</>);
    const s = r.saidas.find((x) => x.semConversao);
    if (s) f.push(<>Onde mais desistem: <b>{semSufixo(s.titulo)}</b> ({s.semConversao} saíram dali sem chamar).</>);
    return f;
  }, [r]);

  const periodoTexto = mes ? nomeMes(mes) : dias === 1 ? 'nas últimas 24 h' : `nos últimos ${dias} dias`;
  const vazioPeriodo = r && !r.visitas;

  return (
    <div style={tela}>
      <SubAbas abas={ABAS_ACESSOS} />
      {erro && <Aviso>{erro}</Aviso>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {[[1, 'Hoje e ontem'], [7, '7 dias'], [30, '30 dias'], [90, '90 dias']].map(([d, rot]) => (
          <button key={d} style={botao('#dc2626', !mes && dias === d)} onClick={() => { setMes(null); setDias(Number(d)); }}>{rot}</button>
        ))}
        <label style={{ ...botao('#dc2626', !!mes), paddingBlock: 0, gap: 8 }}>
          <i className="fa-regular fa-calendar" style={{ fontWeight: 400 }} />
          <select aria-label="Ver por mês" value={mes || ''} onChange={(e) => setMes(e.target.value || null)}
            style={{ minHeight: 38, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', outline: 'none' }}>
            <option value="">Por mês…</option>
            {meses.map((m) => <option key={m} value={m} style={{ color: '#111' }}>{nomeMes(m)}</option>)}
          </select>
        </label>
        {exemplo && <button style={botao('#b45309', false)} onClick={() => setExemplo(false)}><i className="fa-solid fa-xmark" style={{ fontWeight: 900 }} />Sair do exemplo</button>}
      </div>

      {exemplo && (
        <div style={{ ...cartao, borderColor: '#f59e0b', background: 'color-mix(in srgb, #f59e0b 12%, var(--surface))', fontSize: 14 }}>
          <b style={{ fontWeight: 500 }}>Exemplo com números inventados.</b> Serve só para ver como a tela fica quando o site novo estiver no ar. Nada disto é real.
        </div>
      )}

      {!r && !erro && <p>Carregando…</p>}
      {vazioPeriodo && !exemplo && (
        <div style={{ ...cartao, display: 'grid', gap: 10, justifyItems: 'start' }}>
          <b style={{ fontWeight: 500 }}>Nenhuma visita {periodoTexto}.</b>
          <span style={{ fontSize: 14, color: muted }}>
            O contador só conta o site novo, que ainda não está no ar (visitas de teste no computador não contam).
            Quando ele estiver publicado, esta tela se enche sozinha.
          </span>
          <button style={botao('#b45309')} onClick={() => setExemplo(true)}><i className="fa-solid fa-eye" style={{ fontWeight: 900 }} />Ver como fica com dados (exemplo)</button>
        </div>
      )}

      {r && L && dados && !vazioPeriodo && (
        <>
          <div style={grade(180)}>
            <Numero icone="fa-users" cor="#dc2626" rotulo="Pessoas (aparelhos)" valor={<Conta valor={r.visitantes} />}
              detalhe={<><Comparado agora={r.visitantes} antes={antes!.visitantes} rotulo={rotuloAntes} /><br />{r.voltaram} voltaram mais de uma vez</>} />
            <Numero icone="fa-route" cor="#0f766e" rotulo="Visitas" valor={<Conta valor={r.visitas} />}
              detalhe={<><Comparado agora={r.visitas} antes={antes!.visitas} rotulo={rotuloAntes} /><br />{r.paginas.toLocaleString('pt-BR')} páginas vistas</>} />
            <Numero icone="fa-comment-dots" cor="#16a34a" rotulo="Chamaram (WhatsApp, telefone, proposta)" valor={<Conta valor={r.conversoes} />}
              detalhe={<><Comparado agora={r.conversoes} antes={antes!.conversoes} rotulo={rotuloAntes} /><br />{pct(r.taxaConversao)} das visitas</>}
              ativo={so === 'converteu'} onClick={() => setSo(so === 'converteu' ? 'todas' : 'converteu')} />
            <Numero icone="fa-file-signature" cor="#7c3aed" rotulo="Pedidos de proposta" valor={<Conta valor={dados.pedidos} />}
              detalhe={<><Comparado agora={dados.pedidos} antes={antes!.pedidos} rotulo={rotuloAntes} /><br />{pd?.valorTotal ? `${real(pd.valorTotal)} pedidos para financiar` : 'veja na aba Pedidos'}</>} />
            <Numero icone="fa-door-open" cor="#6b7280" rotulo="Saíram sem chamar" valor={<Conta valor={r.visitas - r.conversoes} />}
              detalhe={`${pct(r.rejeicaoPct)} viram só 1 página e saíram`} ativo={so === 'saiu'} onClick={() => setSo(so === 'saiu' ? 'todas' : 'saiu')} />
            <Numero icone="fa-clock" cor="#0284c7" rotulo="Tempo médio por visita" valor={duracao(r.tempoMedio_s)} detalhe={`${pct(r.celularPct)} pelo celular`} />
          </div>

          {frases.length > 0 && (
            <section style={{ ...cartao, display: 'grid', gap: 8 }}>
              <span style={{ fontSize: 12, color: muted }}><i className="fa-solid fa-lightbulb" style={{ fontWeight: 900, color: '#d97706', marginRight: 6 }} />Resumo {periodoTexto}</span>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 14, lineHeight: 1.5 }}>
                {frases.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </section>
          )}

          <div style={grade(320)}>
            <Cartao assunto="Caminho até o contato" icone="fa-filter" cor="#16a34a"
              titulo={<>De cada 100 visitas, {Math.round(r.taxaConversao * 100)} chamam</>}>
              <Barras cor="#16a34a" linhas={[
                { rotulo: 'Entraram no site', valor: r.funil.entraram },
                { rotulo: 'Abriram uma máquina', valor: r.funil.viramMaquina, extra: parte(r.funil.viramMaquina, r.funil.entraram) },
                { rotulo: 'Viram financiamento', valor: r.funil.viramPreco, extra: parte(r.funil.viramPreco, r.funil.entraram) },
                { rotulo: 'Chamaram', valor: r.funil.chamaram, extra: parte(r.funil.chamaram, r.funil.entraram) },
              ]} />
            </Cartao>

            <Cartao assunto="Visitas por dia" icone="fa-chart-column" cor="#dc2626" largo
              titulo={(() => { const m = [...porDia].sort((a, b) => b.visitas - a.visitas)[0]; return m?.visitas ? <>Dia mais forte: {diaCurto(m.dia)}, com {m.visitas} visitas</> : 'Sem visitas no período'; })()}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, overflowX: 'auto' }}>
                {porDia.map((d) => (
                  <div key={d.dia} title={`${diaCurto(d.dia)}: ${d.visitas} visitas, ${d.conversoes} chamaram`} style={{ flex: '1 0 10px', display: 'grid', alignContent: 'end', height: '100%' }}>
                    <div style={{ height: `${(d.visitas / maxDia) * 100}%`, minHeight: 2, borderRadius: '4px 4px 0 0', background: 'color-mix(in srgb, #dc2626 35%, transparent)', position: 'relative' }}>
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${d.visitas ? (d.conversoes / d.visitas) * 100 : 0}%`, background: '#16a34a', borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
              {porDia.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: muted }}>
                  <span>{diaCurto(porDia[0].dia)}</span><span>{diaCurto(porDia[porDia.length - 1].dia)}</span>
                </div>
              )}
              <span style={{ fontSize: 12, color: muted }}>Barra = visitas do dia; parte verde = as que chamaram. Passe o dedo ou o mouse para ver o número.</span>
            </Cartao>

            <Cartao assunto="Máquinas mais vistas" icone="fa-tractor" cor="#dc2626"
              titulo={L.produtos.length ? <>Mais procurado: {r.produtos[0].nome}</> : 'Ninguém abriu uma máquina ainda'}
              verTudo={L.produtos.length > 6 ? ver('Máquinas mais vistas (visitas que abriram a página)', L.produtos, '#dc2626') : undefined}>
              <Barras cor="#dc2626" linhas={L.produtos.slice(0, 6)} />
            </Cartao>

            <Cartao assunto="Para que chamaram" icone="fa-comments" cor="#16a34a"
              titulo={L.assuntos.length ? <>Mais chamam para: {r.assuntos[0].assunto.toLowerCase()}</> : 'Ninguém chamou no período'}>
              <Barras cor="#16a34a" linhas={L.assuntos} />
            </Cartao>

            <Cartao assunto="De onde vêm" icone="fa-signs-post" cor="#dc2626"
              titulo={L.origens.length ? <>{r.origens[0].nome} traz {parte(r.origens[0].visitas, r.visitas)} das visitas</> : '—'}
              verTudo={L.origens.length > 6 ? ver('De onde vêm', L.origens, '#dc2626') : undefined}>
              <Barras cor="#dc2626" linhas={L.origens.slice(0, 6)} />
            </Cartao>

            <Cartao assunto="Por onde entram" icone="fa-right-to-bracket" cor="#0f766e"
              titulo={L.entradas.length ? <>A maioria entra por: {L.entradas[0].rotulo}</> : '—'}
              verTudo={L.entradas.length > 6 ? ver('Primeira página da visita', L.entradas, '#0f766e') : undefined}>
              <Barras cor="#0f766e" linhas={L.entradas.slice(0, 6)} />
            </Cartao>

            <Cartao assunto="Onde saem sem chamar" icone="fa-door-open" cor="#6b7280"
              titulo={L.saidas.length ? <>Mais desistem em: {L.saidas[0].rotulo}</> : 'Todo mundo que saiu tinha chamado'}
              verTudo={L.saidas.length > 6 ? ver('Última página de quem saiu sem chamar', L.saidas, '#6b7280') : undefined}>
              <Barras cor="#6b7280" linhas={L.saidas.slice(0, 6)} />
            </Cartao>

            <Cartao assunto="Páginas mais vistas" icone="fa-file-lines" cor="#0284c7"
              titulo={L.paginas.length ? <>Mais aberta: {L.paginas[0].rotulo}</> : '—'}
              verTudo={L.paginas.length > 6 ? ver('Páginas mais vistas (tempo médio e quanto rolam)', L.paginas, '#0284c7') : undefined}>
              <Barras cor="#0284c7" linhas={L.paginas.slice(0, 6)} />
            </Cartao>

            <Cartao assunto="Horário e dia da semana" icone="fa-clock" cor="#7c3aed"
              titulo={(() => { const h = [...r.porHora].sort((a, b) => b.visitas - a.visitas)[0]; const d = [...r.porSemana].sort((a, b) => b.visitas - a.visitas)[0]; return <>Mais movimento às {h.hora} h e na {d.dia}</>; })()}
              verTudo={ver('Visitas por dia da semana', L.semana, '#7c3aed')}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
                  {(() => { const mx = Math.max(1, ...r.porHora.map((h) => h.visitas)); return r.porHora.map((h) => (
                    <div key={h.hora} title={`${h.hora} h: ${h.visitas} visitas`} style={{ flex: 1, height: `${(h.visitas / mx) * 100}%`, minHeight: 2, borderRadius: '3px 3px 0 0', background: 'color-mix(in srgb, #7c3aed 55%, transparent)' }} />
                  )); })()}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: muted }}><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {(() => { const mx = Math.max(1, ...r.porSemana.map((d) => d.visitas)); return r.porSemana.map((d) => (
                  <div key={d.dia} title={`${d.dia}: ${d.visitas} visitas`} style={{ display: 'grid', gap: 2, justifyItems: 'center', fontSize: 11 }}>
                    <span style={{ width: '100%', height: 26, borderRadius: 6, background: `color-mix(in srgb, #7c3aed ${Math.round(8 + (d.visitas / mx) * 70)}%, transparent)` }} />
                    <span style={{ color: muted }}>{d.dia.slice(0, 3)}</span>
                  </div>
                )); })()}
              </div>
            </Cartao>

            <Cartao assunto="Celular ou computador" icone="fa-mobile-screen" cor="#0284c7"
              titulo={<>{pct(r.celularPct)} entram pelo celular</>}>
              <Barras cor="#0284c7" linhas={L.aparelhos} />
              <span style={{ fontSize: 13, color: muted }}>{r.voltaram} {r.voltaram === 1 ? 'aparelho voltou' : 'aparelhos voltaram'} mais de uma vez no período ({parte(r.voltaram, r.visitantes)} das pessoas).</span>
            </Cartao>

            {L.campanhas.length > 0 && (
              <Cartao assunto="Campanhas (links de anúncio e post)" icone="fa-bullhorn" cor="#d97706"
                titulo={<>Campanha que mais trouxe: {r.campanhas[0].nome}</>}
                verTudo={L.campanhas.length > 6 ? ver('Campanhas', L.campanhas, '#d97706') : undefined}>
                <Barras cor="#d97706" linhas={L.campanhas.slice(0, 6)} />
              </Cartao>
            )}

            <Cartao assunto="Procuraram e não acharam" icone="fa-magnifying-glass-minus" cor="#b91c1c"
              titulo={L.semResultado.length || r.pecasNaoAchou ? <>{r.buscasSemResultado.reduce((s, b) => s + b.total, 0) + r.pecasNaoAchou} buscas sem resposta: o que falta no site</> : 'Toda busca achou alguma coisa'}
              verTudo={L.semResultado.length > 6 ? ver('Buscas em Tratores e Implementos sem resultado', L.semResultado, '#b91c1c') : undefined}>
              <Barras cor="#b91c1c" linhas={[...L.semResultado.slice(0, 6), ...(r.pecasNaoAchou ? [{ rotulo: 'Peças: tocou em “não achei minha peça”', valor: r.pecasNaoAchou }] : [])]} vazio="Nenhuma busca sem resultado." />
            </Cartao>

            <Cartao assunto="Buscas em Tratores e Implementos" icone="fa-magnifying-glass" cor="#7c3aed"
              titulo={L.buscas.length ? <>Mais buscado: “{r.buscasProdutos[0].termo}”</> : 'Ninguém usou a busca'}
              verTudo={L.buscas.length > 6 ? ver('Buscas em Tratores e Implementos', L.buscas, '#7c3aed') : undefined}>
              <Barras cor="#7c3aed" linhas={L.buscas.slice(0, 6)} />
            </Cartao>

            <Cartao assunto="Peças" icone="fa-gears" cor="#d97706"
              titulo={L.pecas.length ? <>Peça mais buscada: “{r.buscasPecas[0].termo}”</> : 'Ninguém buscou peça'}
              verTudo={L.pecas.length > 6 ? ver('Peças mais buscadas', L.pecas, '#d97706') : undefined}>
              <Barras cor="#d97706" linhas={L.pecas.slice(0, 6)} />
              <span style={{ fontSize: 13, color: muted }}>
                {r.pecasPedidas.reduce((s, p) => s + p.total, 0)} peças pedidas no WhatsApp{r.aberturas3d ? ` · catálogo 3D aberto ${r.aberturas3d}×` : ''}.
                {L.pedidas.length > 0 && <> <button onClick={ver('Peças pedidas no WhatsApp (código)', L.pedidas, '#1f9d55')} style={{ border: 0, background: 'transparent', padding: 0, color: '#dc2626', font: 'inherit', cursor: 'pointer' }}>Ver códigos</button></>}
              </span>
            </Cartao>

            {pd && (
              <Cartao assunto="Pedidos de proposta" icone="fa-file-signature" cor="#7c3aed" largo
                titulo={pd.total ? <>{pd.total} {pd.total === 1 ? 'pedido' : 'pedidos'} · mais pedido: {pd.porMaquina[0].nome} · mais de {pd.porCidade[0].nome}</> : 'Nenhum pedido de proposta no período'}>
                {pd.total > 0 && (
                  <div style={grade(220)}>
                    {([['Máquina', pd.porMaquina], ['Linha de crédito', pd.porLinha], ['Cidade', pd.porCidade],
                      ['Situação hoje', pd.porStatus.map((s) => ({ nome: NOME_STATUS[s.status] || s.status, total: s.total }))]] as const).map(([t, l]) => (
                      <div key={t} style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{t}</span>
                        <Barras cor="#7c3aed" linhas={l.slice(0, 5).map((x) => ({ rotulo: x.nome, valor: x.total }))} />
                        {l.length > 5 && <button onClick={ver(`Pedidos por ${t.toLowerCase()}`, l.map((x) => ({ rotulo: x.nome, valor: x.total })), '#7c3aed')} style={{ justifySelf: 'start', border: 0, background: 'transparent', padding: 0, color: '#dc2626', font: 'inherit', fontSize: 13, cursor: 'pointer' }}>Ver todos</button>}
                      </div>
                    ))}
                  </div>
                )}
              </Cartao>
            )}

            <Cartao assunto="Todos os botões tocados" icone="fa-hand-pointer" cor="#16a34a"
              titulo={L.cliques.length ? <>Botão mais tocado: {L.cliques[0].rotulo}</> : 'Nenhum botão tocado'}
              verTudo={L.cliques.length > 6 ? ver('Todos os botões tocados', L.cliques, '#16a34a') : undefined}>
              <Barras cor="#16a34a" linhas={L.cliques.slice(0, 6)} />
            </Cartao>
          </div>

          <ComoLer>
            Cada <b>visita</b> é uma pessoa navegando no site; <b>pessoas</b> conta aparelhos diferentes (sem nome: o site não sabe quem é,
            só que é o mesmo celular ou computador voltando). <b>Chamaram</b> = tocou no WhatsApp, no telefone ou mandou o pedido de proposta.
            As setas (▲ ▼) comparam com o período do mesmo tamanho logo antes. Em <b>Procuraram e não acharam</b> está o que o cliente
            quis e o site não mostrou. Toque numa visita lá embaixo para ver o caminho dela: páginas na ordem, tempo em cada uma, até onde rolou e o que clicou.
          </ComoLer>

          <div style={{ ...cartao, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>
              Últimas visitas {so !== 'todas' && <button style={{ ...botao('#dc2626', false), minHeight: 28, padding: '2px 10px', marginLeft: 8 }} onClick={() => setSo('todas')}>mostrar todas</button>}
            </div>
            {visitas.map((v) => (
              <div key={v.sessao} style={{ borderBottom: '1px solid var(--border)' }}>
                <button onClick={() => setAberta(aberta === v.sessao ? null : v.sessao)}
                  style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: '10px 16px', border: 0, background: 'transparent', color: 'var(--portal-text)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  <i className={`fa-solid ${v.aparelho === 'celular' ? 'fa-mobile-screen' : 'fa-desktop'}`} style={{ fontWeight: 900, width: 18, color: muted }} />
                  <span style={{ flex: 1, minWidth: 0, display: 'grid' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.paginas.length} {v.paginas.length === 1 ? 'página' : 'páginas'} · veio de {v.origem}{v.campanha ? ` (${v.campanha})` : ''} · {duracao(v.tempo_s)}
                    </span>
                    <span style={{ fontSize: 12, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.converteu ? `Chamou: ${[...new Set(v.cliques.map((c) => nomeClique(c.evento)))].join(', ')}` : `Saiu em ${semSufixo(v.paginas[v.paginas.length - 1].titulo)}`}
                    </span>
                  </span>
                  <span style={{ flex: 'none', fontSize: 12, padding: '3px 8px', borderRadius: 999, background: v.converteu ? 'color-mix(in srgb, #16a34a 14%, transparent)' : 'var(--portal-bg)' }}>{quando(v.inicio)}</span>
                </button>
                {aberta === v.sessao && (
                  <ol style={{ margin: 0, padding: '0 16px 12px 48px', display: 'grid', gap: 6, fontSize: 13 }}>
                    {v.paginas.map((p, k) => (
                      <li key={k}>
                        <b style={{ fontWeight: 500 }}>{semSufixo(p.titulo)}</b> <span style={{ color: muted }}>({p.caminho})</span>
                        {' — '}{p.tempo_s ? `${duracao(p.tempo_s)}, rolou ${p.rolou}%` : 'sem tempo medido'}
                        {v.cliques.filter((c) => c.caminho === p.caminho).map((c, j) => (
                          <div key={j} style={{ color: '#16a34a' }}><i className="fa-solid fa-hand-pointer" style={{ fontWeight: 900, marginRight: 6 }} />{nomeClique(c.evento)}{c.rotulo ? ` (“${c.rotulo}”)` : ''}</div>
                        ))}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
            {!visitas.length && <p style={{ padding: 16, margin: 0, color: muted }}>Nenhuma visita no período.</p>}
          </div>
        </>
      )}
      {janela && <Janela titulo={janela.titulo} linhas={janela.linhas} cor={janela.cor} fechar={fecharJanela} />}
    </div>
  );
}
