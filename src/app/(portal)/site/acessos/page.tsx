'use client';
// Site → Acessos (José, 10/11/2026): "quem entra no site, quantos acessos, e se saiu, o que aconteceu".
// Anônimo: cada visita é um aparelho sem nome. Mostra quantos, de onde vêm, o que veem, onde saem sem chamar
// e a jornada de cada visita (páginas na ordem, tempo, cliques).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import type { Resumo, Visita } from '@/lib/site/acessos';
import { Aviso, ComoLer, Conta, Numero, botao, cartao, duracao, grade, quando, tela } from '@/components/site/ui';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const NOME_CLIQUE: Record<string, string> = {
  clique_whatsapp: 'WhatsApp', clique_telefone: 'Telefone', simulador_whatsapp: 'Simulador → WhatsApp',
  simulador_formulario: 'Simulador → pedido de proposta', clique_whatsapp_trator_ideal: 'Trator ideal → WhatsApp',
  usado_whatsapp: 'Avaliar usado → WhatsApp', demonstracao_whatsapp: 'Pedir demonstração',
  pecas_whatsapp: 'Peças → pedir no WhatsApp', pecas3d_whatsapp: 'Catálogo 3D → pedir peça', pecas_abrir_3d: 'Abriu o catálogo 3D',
  pecas_nao_achou: 'Peças → não achou', busca_pecas: 'Buscou peça', pecas_aba: 'Peças → trocou de aba', posvenda_whatsapp: 'Pós-venda → WhatsApp',
  contato_whatsapp_vendas: 'Contato → WhatsApp Vendas', contato_whatsapp_posvenda: 'Contato → WhatsApp Pós-Vendas', contato_whatsapp_pecas: 'Contato → WhatsApp Peças', contato_como_chegar: 'Contato → Como chegar',
  garantia_agendar_revisao: 'Garantia → agendar revisão',
};
const nomeClique = (e: string) => NOME_CLIQUE[e] || e.replace(/_/g, ' ');

function Barras({ linhas, cor }: { linhas: { rotulo: string; valor: number; extra?: string }[]; cor: string }) {
  const max = Math.max(1, ...linhas.map((l) => l.valor));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {linhas.map((l) => (
        <div key={l.rotulo} style={{ display: 'grid', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.rotulo}</span>
            <span style={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{l.valor}{l.extra ? ` · ${l.extra}` : ''}</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--portal-bg)' }}>
            <div style={{ height: '100%', width: `${(l.valor / max) * 100}%`, borderRadius: 4, background: cor, transition: 'width .6s' }} />
          </div>
        </div>
      ))}
      {!linhas.length && <span style={{ fontSize: 13, color: 'var(--portal-text-muted, #6b7280)' }}>Sem dados no período.</span>}
    </div>
  );
}

export default function AcessosSitePage() {
  const [dias, setDias] = useState(7);
  const [dados, setDados] = useState<{ resumo: Resumo; pedidos: number; visitas: Visita[] } | null>(null);
  const [erro, setErro] = useState('');
  const [so, setSo] = useState<'todas' | 'converteu' | 'saiu'>('todas');
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetchAuth(`/api/site/acessos?dias=${dias}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { setErro(j.erro || 'Não consegui carregar os acessos.'); return; }
    setErro(''); setDados(j);
  }, [dias]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDados(null); carregar(); const t = setInterval(carregar, 120_000); return () => clearInterval(t); }, [carregar]);

  const r = dados?.resumo;
  const visitas = useMemo(() => (dados?.visitas || []).filter((v) => so === 'todas' || (so === 'converteu' ? v.converteu : !v.converteu)), [dados, so]);
  const maxDia = Math.max(1, ...(r?.porDia || []).map((d) => d.visitas));

  return (
    <div style={tela}>
      {erro && <Aviso>{erro}</Aviso>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[[1, 'Hoje e ontem'], [7, '7 dias'], [30, '30 dias'], [90, '90 dias']].map(([d, rot]) => (
          <button key={d} style={botao('#dc2626', dias === d)} onClick={() => setDias(Number(d))}>{rot}</button>
        ))}
      </div>

      {!r && !erro && <p>Carregando…</p>}
      {r && (
        <>
          <div style={grade(170)}>
            <Numero icone="fa-users" cor="#dc2626" rotulo="Pessoas (aparelhos)" valor={<Conta valor={r.visitantes} />} detalhe={`${r.visitas} visitas · ${r.paginas} páginas vistas`} />
            <Numero icone="fa-comment-dots" cor="#16a34a" rotulo="Chamaram (WhatsApp, telefone, proposta)" valor={<Conta valor={r.conversoes} />} detalhe={`${pct(r.taxaConversao)} das visitas`} ativo={so === 'converteu'} onClick={() => setSo(so === 'converteu' ? 'todas' : 'converteu')} />
            <Numero icone="fa-file-signature" cor="#7c3aed" rotulo="Pedidos de proposta" valor={<Conta valor={dados!.pedidos} />} detalhe="veja na aba Pedidos" />
            <Numero icone="fa-door-open" cor="#6b7280" rotulo="Saíram sem chamar" valor={<Conta valor={r.visitas - r.conversoes} />} detalhe={`${pct(r.rejeicaoPct)} viram só 1 página`} ativo={so === 'saiu'} onClick={() => setSo(so === 'saiu' ? 'todas' : 'saiu')} />
            <Numero icone="fa-clock" cor="#0284c7" rotulo="Tempo médio por visita" valor={duracao(r.tempoMedio_s)} detalhe={`${pct(r.celularPct)} pelo celular`} />
          </div>

          <ComoLer>
            Cada <b>visita</b> é uma pessoa navegando no site; <b>pessoas</b> conta aparelhos diferentes (sem nome: o site não sabe quem é,
            só que é o mesmo celular ou computador voltando). <b>Chamaram</b> = tocou no WhatsApp, no telefone ou mandou o pedido de proposta.
            Em <b>Onde saem sem chamar</b> estão as páginas onde as visitas terminam sem contato: é ali que vale melhorar.
            Toque numa visita lá embaixo para ver o caminho dela: páginas na ordem, quanto tempo ficou em cada uma, até onde rolou e o que clicou.
          </ComoLer>

          <div style={cartao}>
            <div style={{ fontWeight: 500, marginBottom: 10 }}>Visitas por dia</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, overflowX: 'auto' }}>
              {r.porDia.map((d) => (
                <div key={d.dia} title={`${d.dia.split('-').reverse().join('/')}: ${d.visitas} visitas, ${d.conversoes} chamaram`} style={{ flex: '1 0 14px', display: 'grid', alignContent: 'end', height: '100%' }}>
                  <div style={{ height: `${(d.visitas / maxDia) * 100}%`, minHeight: 2, borderRadius: '4px 4px 0 0', background: 'color-mix(in srgb, #dc2626 35%, transparent)', position: 'relative' }}>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${d.visitas ? (d.conversoes / d.visitas) * 100 : 0}%`, background: '#16a34a', borderRadius: 2 }} />
                  </div>
                </div>
              ))}
              {!r.porDia.length && <span style={{ fontSize: 13, color: 'var(--portal-text-muted, #6b7280)' }}>Sem visitas no período.</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #6b7280)', marginTop: 6 }}>Barra = visitas do dia; verde = as que chamaram.</div>
          </div>

          <div style={grade(300)}>
            <div style={cartao}>
              <div style={{ fontWeight: 500, marginBottom: 10 }}>De onde vêm</div>
              <Barras cor="#dc2626" linhas={r.origens.slice(0, 8).map((o) => ({ rotulo: o.nome, valor: o.visitas, extra: `${o.conversoes} chamaram` }))} />
            </div>
            <div style={cartao}>
              <div style={{ fontWeight: 500, marginBottom: 10 }}>Páginas mais vistas</div>
              <Barras cor="#0284c7" linhas={r.topPaginas.slice(0, 8).map((p) => ({ rotulo: p.titulo.replace(/ — Nova Tratores.*$/, ''), valor: p.aberturas, extra: p.tempoMedio_s ? `${duracao(p.tempoMedio_s)}, rola ${p.rolouMedio}%` : undefined }))} />
            </div>
            <div style={cartao}>
              <div style={{ fontWeight: 500, marginBottom: 10 }}>Onde saem sem chamar</div>
              <Barras cor="#6b7280" linhas={r.saidas.filter((s) => s.semConversao).slice(0, 8).map((s) => ({ rotulo: s.titulo.replace(/ — Nova Tratores.*$/, ''), valor: s.semConversao, extra: `de ${s.saidas} saídas` }))} />
            </div>
            <div style={cartao}>
              <div style={{ fontWeight: 500, marginBottom: 10 }}>Botões tocados</div>
              <Barras cor="#16a34a" linhas={r.cliques.slice(0, 8).map((c) => ({ rotulo: nomeClique(c.evento), valor: c.total }))} />
            </div>
            <div style={cartao}>
              <div style={{ fontWeight: 500, marginBottom: 10 }}>Peças mais buscadas</div>
              <Barras cor="#d97706" linhas={r.buscasPecas.slice(0, 10).map((b) => ({ rotulo: b.termo, valor: b.total }))} />
            </div>
            <div style={cartao}>
              <div style={{ fontWeight: 500, marginBottom: 10 }}>Peças pedidas no WhatsApp {r.aberturas3d ? <span style={{ fontWeight: 400, fontSize: 13 }}>· catálogo 3D aberto {r.aberturas3d}×</span> : null}</div>
              <Barras cor="#1f9d55" linhas={r.pecasPedidas.slice(0, 10).map((p) => ({ rotulo: p.codigo, valor: p.total }))} />
            </div>
          </div>

          <div style={{ ...cartao, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>
              Últimas visitas {so !== 'todas' && <button style={{ ...botao('#dc2626', false), minHeight: 28, padding: '2px 10px', marginLeft: 8 }} onClick={() => setSo('todas')}>mostrar todas</button>}
            </div>
            {visitas.map((v) => (
              <div key={v.sessao} style={{ borderBottom: '1px solid var(--border)' }}>
                <button onClick={() => setAberta(aberta === v.sessao ? null : v.sessao)}
                  style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: '10px 16px', border: 0, background: 'transparent', color: 'var(--portal-text)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  <i className={`fa-solid ${v.aparelho === 'celular' ? 'fa-mobile-screen' : 'fa-desktop'}`} style={{ fontWeight: 900, width: 18, color: 'var(--portal-text-muted, #6b7280)' }} />
                  <span style={{ flex: 1, minWidth: 0, display: 'grid' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.paginas.length} {v.paginas.length === 1 ? 'página' : 'páginas'} · veio de {v.origem} · {duracao(v.tempo_s)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--portal-text-muted, #6b7280)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.converteu ? `Chamou: ${[...new Set(v.cliques.map((c) => nomeClique(c.evento)))].join(', ')}` : `Saiu em ${v.saiuEm}`}
                    </span>
                  </span>
                  <span style={{ flex: 'none', fontSize: 12, padding: '3px 8px', borderRadius: 999, background: v.converteu ? 'color-mix(in srgb, #16a34a 14%, transparent)' : 'var(--portal-bg)' }}>{quando(v.inicio)}</span>
                </button>
                {aberta === v.sessao && (
                  <ol style={{ margin: 0, padding: '0 16px 12px 48px', display: 'grid', gap: 6, fontSize: 13 }}>
                    {v.paginas.map((p, k) => (
                      <li key={k}>
                        <b style={{ fontWeight: 500 }}>{p.titulo.replace(/ — Nova Tratores.*$/, '')}</b> <span style={{ color: 'var(--portal-text-muted, #6b7280)' }}>({p.caminho})</span>
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
            {!visitas.length && <p style={{ padding: 16, margin: 0, color: 'var(--portal-text-muted, #6b7280)' }}>Nenhuma visita no período.</p>}
          </div>
        </>
      )}
    </div>
  );
}
