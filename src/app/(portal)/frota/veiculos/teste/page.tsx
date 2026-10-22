'use client';
// PÁGINA DE TESTE — frota separada por setor (José, 22/10/2026).
// Opção 1 = abas por setor · 2 = blocos um embaixo do outro · 3 = colunas lado a lado.
// Dados reais de /api/frota/veiculos. Enquanto o setor não estiver preenchido,
// a prévia usa a categoria antiga (comercial → Comercial, oficina → Pós-Vendas).
// "Sem uso" fica sempre separado no fim. A tela de Veículos de verdade não mudou.
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { Car, User as UserIcon } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { SETORES_FROTA, rotuloSetor, corSetor } from '@/lib/frota/setores';
import type { VeiculoLista } from '@/lib/frota/tipos';

type V = VeiculoLista & { setor?: string | null; categoria?: string | null; sem_uso?: boolean | null };

const OPCOES = [
  { n: 1, nome: 'Abas por setor', resumo: 'Uma faixa de abas no topo (Todos · Comercial · Peças · Pós-Vendas · Pessoal), cada uma com a contagem. Clicou, vê só os carros daquele setor.' },
  { n: 2, nome: 'Blocos por setor', resumo: 'Uma tela só, com um bloco por setor, um embaixo do outro: título colorido com a contagem e os carros dele.' },
  { n: 3, nome: 'Colunas lado a lado', resumo: 'Cada setor é uma coluna, como um quadro. Dá pra ver a frota inteira de uma vez e comparar os setores.' },
];

const SEM_SETOR = '__sem';
const SEM_USO = '__sem_uso';

function setorDe(v: V): string {
  if (v.setor) return v.setor;
  if (v.categoria === 'comercial') return 'comercial';
  if (v.categoria === 'oficina') return 'pos_vendas';
  return SEM_SETOR;
}

const GRUPOS = [
  ...SETORES_FROTA.map((s) => ({ id: s.id as string, rotulo: s.rotulo, cor: s.cor })),
  { id: SEM_SETOR, rotulo: 'Sem setor', cor: '#64748b' },
  { id: SEM_USO, rotulo: 'Sem uso', cor: '#b45309' },
];

function Cartao({ v, compacto }: { v: V; compacto?: boolean }) {
  const s = setorDe(v);
  return (
    <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', padding: compacto ? 10 : 14, display: 'flex', gap: 12, alignItems: 'center', minWidth: 0, opacity: v.sem_uso ? 0.6 : 1 }}>
      {v.imagem_url ? (
        <img src={v.imagem_url} alt="" style={{ width: compacto ? 48 : 64, height: compacto ? 48 : 64, objectFit: 'cover', flexShrink: 0, background: 'var(--portal-bg-secondary)' }} />
      ) : (
        <div style={{ width: compacto ? 48 : 64, height: compacto ? 48 : 64, flexShrink: 0, background: 'var(--portal-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Car size={compacto ? 20 : 26} color="var(--portal-text-secondary)" />
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: compacto ? 14 : 16, color: 'var(--portal-text)' }}>{formatarPlaca(v.placa)}</strong>
          {!compacto && s !== SEM_SETOR && (
            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: corSetor(s), borderRadius: 999, padding: '2px 8px' }}>{rotuloSetor(s)}</span>
          )}
          {v.sem_uso && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '2px 8px' }}>SEM USO</span>}
        </div>
        <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[v.marca, v.modelo || v.descricao].filter(Boolean).join(' ') || '—'}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <UserIcon size={12} /> {v.responsavel_nome || 'sem responsável'}
        </div>
      </div>
    </div>
  );
}

function Grade({ lista }: { lista: V[] }) {
  if (!lista.length) return <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', padding: 8 }}>Nenhum carro aqui.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 10 }}>
      {lista.map((v) => <Cartao key={v.id} v={v} />)}
    </div>
  );
}

export default function FrotaSetoresTeste() {
  const [n, setN] = useState(1);
  const [veiculos, setVeiculos] = useState<V[]>([]);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('todos');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/frota/veiculos', { headers: await authHeaders() });
        const d = await r.json();
        if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); return; }
        setVeiculos(d.veiculos || []);
      } catch (e) { setErro(String(e)); }
    })();
  }, []);

  const porGrupo = useMemo(() => {
    const m = new Map<string, V[]>(GRUPOS.map((g) => [g.id, []]));
    const ativos = veiculos.filter((v) => v.tipo_registro === 'veiculo' && v.ativo && v.status !== 'vendido' && v.status !== 'arquivado');
    for (const v of ativos) m.get(v.sem_uso ? SEM_USO : setorDe(v))!.push(v);
    return m;
  }, [veiculos]);
  const grupos = GRUPOS.filter((g) => (g.id !== SEM_SETOR && g.id !== SEM_USO) || porGrupo.get(g.id)!.length > 0);
  const total = grupos.reduce((s, g) => s + porGrupo.get(g.id)!.length, 0);
  const op = OPCOES[n - 1];

  return (
    <div style={{ padding: '14px 18px 40px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--portal-border)', overflowX: 'auto' }}>
        {OPCOES.map((o) => (
          <button key={o.n} onClick={() => setN(o.n)}
            style={{ padding: '9px 16px', border: 'none', borderRadius: '10px 10px 0 0', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
              background: n === o.n ? 'var(--portal-bg-card)' : 'transparent', color: n === o.n ? 'var(--portal-text)' : 'var(--portal-text-secondary)',
              boxShadow: n === o.n ? '0 -1px 0 var(--portal-border) inset, 1px 0 0 var(--portal-border), -1px 0 0 var(--portal-border)' : 'none' }}>
            Opção {o.n} · {o.nome}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--portal-text)' }}>Opção {op.n} — {op.nome}.</b> {op.resumo}{' '}
        Carros &quot;sem uso&quot; ficam separados no fim. Os sem setor ainda vão aparecer em &quot;Sem setor&quot; até alguém escolher na ficha.
      </div>
      {erro && <div style={{ color: '#b91c1c', fontSize: 13 }}>{erro}</div>}

      {n === 1 && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[{ id: 'todos', rotulo: 'Todos', cor: '#1e40af' }, ...grupos].map((g) => {
              const qtd = g.id === 'todos' ? total : porGrupo.get(g.id)!.length;
              const ativo = aba === g.id;
              return (
                <button key={g.id} onClick={() => setAba(g.id)}
                  style={{ padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
                    border: `1px solid ${ativo ? g.cor : 'var(--portal-border)'}`, background: ativo ? g.cor : 'var(--portal-bg-card)', color: ativo ? '#fff' : 'var(--portal-text)' }}>
                  {g.rotulo} <span style={{ opacity: 0.8 }}>{qtd}</span>
                </button>
              );
            })}
          </div>
          <Grade lista={aba === 'todos' ? grupos.flatMap((g) => porGrupo.get(g.id)!) : porGrupo.get(aba) || []} />
        </div>
      )}

      {n === 2 && grupos.map((g) => (
        <section key={g.id} style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: `2px solid ${g.cor}`, paddingBottom: 4 }}>
            <strong style={{ fontSize: 16, color: g.cor }}>{g.rotulo}</strong>
            <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>{porGrupo.get(g.id)!.length} carro(s)</span>
          </div>
          <Grade lista={porGrupo.get(g.id)!} />
        </section>
      ))}

      {n === 3 && (
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(260px, 1fr)', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
          {grupos.map((g) => (
            <div key={g.id} style={{ display: 'grid', gap: 8, alignContent: 'start', background: 'var(--portal-bg-secondary)', padding: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: g.cor, color: '#fff', padding: '6px 10px', fontWeight: 800, fontSize: 13 }}>
                {g.rotulo} <span>{porGrupo.get(g.id)!.length}</span>
              </div>
              {porGrupo.get(g.id)!.map((v) => <Cartao key={v.id} v={v} compacto />)}
              {!porGrupo.get(g.id)!.length && <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', padding: 6 }}>Nenhum carro.</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
