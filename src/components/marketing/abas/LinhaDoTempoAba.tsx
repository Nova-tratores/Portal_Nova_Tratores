'use client';
// Aba "Linha do tempo" da campanha (18/11/2026, José: "ligar as campanhas com as reuniões,
// pra gente conseguir ter uma linha do tempo"). Do mais antigo para o mais novo, agrupado
// por dia. Os assuntos de reunião entram quando, na pauta, alguém escolhe "📣 Campanha".
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgePercent, CalendarDays, CircleCheck, HandCoins, Users, Wallet, Dices, type LucideIcon } from 'lucide-react';
import type { EventoLinha, TipoEvento } from '@/lib/marketing/linhaDoTempo';
import { apiGet, Vazio, Erro } from '../ui';

const VISUAL: Record<TipoEvento, { cor: string; Icone: LucideIcon; nome: string }> = {
  campanha: { cor: '#db2777', Icone: BadgePercent, nome: 'Campanha' },
  reuniao: { cor: '#2563eb', Icone: CalendarDays, nome: 'Reunião' },
  tarefa: { cor: '#059669', Icone: CircleCheck, nome: 'Tarefa' },
  apoio: { cor: '#16a34a', Icone: HandCoins, nome: 'Apoio' },
  custo: { cor: '#d97706', Icone: Wallet, nome: 'Custo' },
  lead: { cor: '#7c3aed', Icone: Users, nome: 'Leads' },
  roleta: { cor: '#e11d48', Icone: Dices, nome: 'Roleta' },
};

const diaBR = (d: string) => {
  const t = new Date(`${d}T12:00:00-03:00`);
  return t.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

/** `limite` (revisão da tela, 23/11/2026): coluna do Resumo mostra só os N mais recentes, com "Ver tudo". */
export default function LinhaDoTempoAba({ acaoId, limite }: { acaoId: string; limite?: number }) {
  const [todosEventos, setEventos] = useState<EventoLinha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tudo, setTudo] = useState(false);
  const cortado = !!limite && !tudo && (todosEventos?.length ?? 0) > limite;
  const eventos = todosEventos && cortado ? todosEventos.slice(-limite!) : todosEventos;

  useEffect(() => {
    let vivo = true;
    apiGet<{ eventos: EventoLinha[] }>(`/api/marketing/acoes/${acaoId}/linha-do-tempo`)
      .then((r) => { if (vivo) setEventos(r.eventos ?? []); })
      .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar a linha do tempo.'); });
    return () => { vivo = false; };
  }, [acaoId]);

  if (erro) return <Erro>{erro}</Erro>;
  if (!eventos) return <Vazio>Carregando…</Vazio>;

  // agrupa por dia, mantendo a ordem (já vem do mais antigo para o mais novo)
  const dias: { dia: string; itens: EventoLinha[] }[] = [];
  for (const e of eventos) {
    const ult = dias[dias.length - 1];
    if (ult && ult.dia === e.dia) ult.itens.push(e);
    else dias.push({ dia: e.dia, itens: [e] });
  }
  const temReuniao = eventos.some((e) => e.tipo === 'reuniao');

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {cortado && (
        <button onClick={() => setTudo(true)} style={{ justifySelf: 'start', border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, font: 'inherit', fontSize: 13 }}>
          Ver tudo ({todosEventos!.length} eventos)
        </button>
      )}
      {!temReuniao && !limite && (
        <div style={{ fontSize: 13.5, padding: '10px 14px', borderRadius: 12, background: 'color-mix(in srgb, #2563eb 7%, var(--portal-bg-card))', border: '1px solid color-mix(in srgb, #2563eb 20%, transparent)', color: 'var(--portal-text)' }}>
          Nenhuma reunião ligada ainda. Na pauta da reunião, em cada assunto, toque em <b style={{ fontWeight: 500 }}>📣 campanha?</b> e escolha esta campanha: o assunto e o que foi decidido aparecem aqui.
        </div>
      )}

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
        {/* a linha vertical */}
        <span aria-hidden style={{ position: 'absolute', left: 17, top: 6, bottom: 6, width: 2, background: 'var(--portal-border)' }} />
        {dias.map((g) => (
          <li key={g.dia} style={{ position: 'relative', paddingLeft: 48, marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)', marginBottom: 6, textTransform: 'capitalize' }}>{diaBR(g.dia)}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {g.itens.map((e, i) => {
                const v = VISUAL[e.tipo];
                const corpo = (
                  <>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 999, color: v.cor, background: `color-mix(in srgb, ${v.cor} 11%, transparent)` }}>{v.nome}</span>
                      <span style={{ fontSize: 14.5, color: 'var(--portal-text)' }}>{e.titulo}</span>
                    </span>
                    {e.linhas?.length ? (
                      <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--portal-text-muted, #475569)', display: 'grid', gap: 3 }}>
                        {e.linhas.map((l, k) => <li key={k}>{l}</li>)}
                      </ul>
                    ) : null}
                  </>
                );
                const caixa: React.CSSProperties = {
                  display: 'block', padding: '10px 14px', borderRadius: 12, textDecoration: 'none', color: 'inherit',
                  background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
                };
                return (
                  <div key={i} style={{ position: 'relative' }}>
                    {/* bolinha na linha */}
                    <span aria-hidden style={{ position: 'absolute', left: -42, top: 8, width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', color: v.cor, background: 'var(--portal-bg-card)', border: `2px solid ${v.cor}` }}>
                      <v.Icone size={13} />
                    </span>
                    {e.link ? <Link href={e.link} style={caixa}>{corpo}</Link> : <div style={caixa}>{corpo}</div>}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
