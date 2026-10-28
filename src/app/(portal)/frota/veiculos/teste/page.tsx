'use client';
// PÁGINA DE TESTE — frota separada por setor no "Estilo POS NewPortal" (José, 22/10/2026).
// Opção 1 = abas por setor · 2 = blocos um embaixo do outro · 3 = colunas lado a lado.
// O cartão mostra o checklist do mês; clicar abre a FICHA NOVA (checklist em destaque,
// fotos em tela cheia, só pendências…). "Editar ficha" abre a ficha atual.
// Dados reais. A tela de Veículos de verdade não mudou.
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { SETORES_FROTA, corSetor } from '@/lib/frota/setores';
import type { VeiculoLista } from '@/lib/frota/tipos';
import type { ItemChecklistMes } from '@/lib/frota/checklists-mes';
import VeiculoDrawer from '@/components/frota/VeiculoDrawer';
import FichaVeiculoNova from '@/components/frota/novo/FichaVeiculoNova';
import { ESTILO_FROTA_NOVO } from '@/components/frota/novo/estilo';

type V = VeiculoLista & { sem_uso?: boolean | null };

const OPCOES = [
  { n: 1, nome: 'Abas por setor', resumo: 'Abas no topo (Todos · Comercial · Peças · Pós-Vendas · Pessoal), cada uma com a contagem e a cor do setor.' },
  { n: 2, nome: 'Blocos por setor', resumo: 'Uma tela só, com um bloco por setor, um embaixo do outro.' },
  { n: 3, nome: 'Colunas lado a lado', resumo: 'Cada setor é uma coluna, como um quadro: a frota inteira de uma vez.' },
];

const SEM_SETOR = '__sem';
const SEM_USO = '__sem_uso';
const GRUPOS = [
  ...SETORES_FROTA.map((s) => ({ id: s.id as string, rotulo: s.rotulo, cor: s.cor, ico: s.id === 'comercial' ? 'fa-handshake' : s.id === 'pecas' ? 'fa-gears' : s.id === 'pos_vendas' ? 'fa-screwdriver-wrench' : 'fa-user' })),
  { id: SEM_SETOR, rotulo: 'Sem setor', cor: '#64748b', ico: 'fa-circle-question' },
  { id: SEM_USO, rotulo: 'Sem uso', cor: '#d97706', ico: 'fa-circle-pause' },
];

const CHECK: Record<string, { rot: string; cor: string; ico: string }> = {
  ok: { rot: 'Checklist feito', cor: '#16a34a', ico: 'fa-circle-check' },
  suspeito: { rot: 'Checklist suspeito', cor: '#dc2626', ico: 'fa-shield-halved' },
  em_andamento: { rot: 'Checklist em andamento', cor: '#d97706', ico: 'fa-hourglass-half' },
  pendente: { rot: 'Checklist não feito', cor: '#dc2626', ico: 'fa-circle-exclamation' },
};

function Cartao({ v, ck, compacto, onAbrir }: { v: V; ck?: ItemChecklistMes; compacto?: boolean; onAbrir: () => void }) {
  const cor = corSetor(v.setor);
  const c = v.sem_uso ? { rot: 'Sem uso — sem checklist', cor: '#64748b', ico: 'fa-circle-pause' } : ck ? CHECK[ck.status] : null;
  const pend = (v.pendencias || []).length;
  return (
    <button className="fn-card fn-click fn-entra" onClick={onAbrir} style={{ ['--fn-cor' as string]: cor, display: 'grid', gap: 10, opacity: v.sem_uso ? 0.7 : 1, padding: compacto ? '12px 14px' : undefined }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'center', minWidth: 0 }}>
        {v.imagem_url && !compacto
          ? <img src={v.imagem_url} alt="" style={{ width: 52, height: 40, objectFit: 'cover', borderRadius: 10, flex: 'none' }} />
          : <span className="fn-ico"><i className="fa-solid fa-car-side" /></span>}
        <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
          <span><span className="fn-placa">{formatarPlaca(v.placa)}</span></span>
          <span style={{ fontSize: compacto ? 14.5 : 16, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[v.marca, v.modelo || v.descricao].filter(Boolean).join(' ') || '—'}</span>
        </div>
      </div>
      <div className="fn-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><i className="fa-regular fa-user" /> {v.responsavel_nome || 'sem responsável'}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {c && <span className="fn-pilula" style={{ ['--fn-cor' as string]: c.cor }}><i className={`fa-solid ${c.ico}`} /> {c.rot}</span>}
        {pend > 0 && <span className="fn-pilula" style={{ ['--fn-cor' as string]: '#dc2626' }}>{pend} pendência{pend > 1 ? 's' : ''}</span>}
        {v.multas_abertas > 0 && <span className="fn-pilula" style={{ ['--fn-cor' as string]: '#b45309' }}>{v.multas_abertas} multa(s)</span>}
      </div>
    </button>
  );
}

export default function FrotaSetoresTeste() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const [n, setN] = useState(1);
  const [veiculos, setVeiculos] = useState<V[]>([]);
  const [checks, setChecks] = useState<Map<string, ItemChecklistMes>>(new Map());
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('todos');
  const [aberto, setAberto] = useState<V | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const h = await authHeaders();
      const [r, rc] = await Promise.all([fetch('/api/frota/veiculos', { headers: h }), fetch('/api/frota/checklists-mes', { headers: h })]);
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); return; }
      setVeiculos(d.veiculos || []);
      const dc = await rc.json().catch(() => ({}));
      setChecks(new Map(((dc.itens || []) as ItemChecklistMes[]).map((i) => [i.placa_key, i])));
    } catch (e) { setErro(String(e)); }
  }, []);
  // carga inicial fora do corpo do efeito (regra set-state-in-effect do lint)
  useEffect(() => { void Promise.resolve().then(carregar); }, [carregar]);

  const porGrupo = useMemo(() => {
    const m = new Map<string, V[]>(GRUPOS.map((g) => [g.id, []]));
    const ativos = veiculos.filter((v) => v.tipo_registro === 'veiculo' && v.ativo && v.status !== 'vendido' && v.status !== 'arquivado');
    for (const v of ativos) m.get(v.sem_uso ? SEM_USO : v.setor && m.has(v.setor) ? v.setor : SEM_SETOR)!.push(v);
    return m;
  }, [veiculos]);
  const grupos = GRUPOS.filter((g) => (g.id !== SEM_SETOR && g.id !== SEM_USO) || porGrupo.get(g.id)!.length > 0);
  const total = grupos.reduce((s, g) => s + porGrupo.get(g.id)!.length, 0);
  const semChecklist = grupos.flatMap((g) => porGrupo.get(g.id)!).filter((v) => !v.sem_uso && checks.get(v.placa)?.status === 'pendente').length;
  const op = OPCOES[n - 1];

  const grade = (lista: V[]) => lista.length === 0
    ? <div className="fn-sub" style={{ padding: 8 }}>Nenhum carro aqui.</div>
    : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(290px, 100%), 1fr))', gap: 12 }}>
        {lista.map((v) => <Cartao key={v.id} v={v} ck={checks.get(v.placa)} onAbrir={() => setAberto(v)} />)}
      </div>
    );

  return (
    <div className="fn" style={{ padding: 'clamp(12px, 2vw, 28px)', display: 'grid', gap: 14 }}>
      <style>{ESTILO_FROTA_NOVO}</style>
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--fn-border)', overflowX: 'auto' }}>
        {OPCOES.map((o) => (
          <button key={o.n} onClick={() => setN(o.n)}
            style={{ padding: '9px 16px', border: 'none', borderRadius: '10px 10px 0 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, whiteSpace: 'nowrap',
              background: n === o.n ? 'var(--fn-surface)' : 'transparent', color: n === o.n ? 'var(--fn-text)' : 'var(--fn-text2)',
              boxShadow: n === o.n ? '0 -1px 0 var(--fn-border) inset, 1px 0 0 var(--fn-border), -1px 0 0 var(--fn-border)' : 'none' }}>
            Opção {o.n} · {o.nome}
          </button>
        ))}
      </div>
      <div className="fn-sub" style={{ lineHeight: 1.5 }}>
        <span style={{ color: 'var(--fn-text)' }}>Opção {op.n} — {op.nome}.</span> {op.resumo}{' '}
        Clique num carro para abrir a ficha nova, com o checklist do mês em destaque.
        {semChecklist > 0 && <span style={{ color: '#dc2626' }}> · {semChecklist} carro(s) ainda sem o checklist deste mês.</span>}
      </div>
      {erro && <div style={{ color: '#b91c1c' }}>{erro}</div>}

      {n === 1 && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--fn-border)', overflowX: 'auto' }}>
            {[{ id: 'todos', rotulo: 'Todos', cor: '#2563eb', ico: 'fa-car' }, ...grupos].map((g) => {
              const qtd = g.id === 'todos' ? total : porGrupo.get(g.id)!.length;
              const on = aba === g.id;
              return (
                <button key={g.id} onClick={() => setAba(g.id)}
                  style={{ ['--fn-cor' as string]: g.cor, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 14, whiteSpace: 'nowrap', color: 'var(--fn-text)',
                    background: on ? `color-mix(in srgb, ${g.cor} 9%, transparent)` : 'transparent', boxShadow: `inset 0 ${on ? -3 : -2}px 0 color-mix(in srgb, ${g.cor} ${on ? 100 : 35}%, transparent)` }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 12, color: on ? '#fefefe' : g.cor, background: on ? g.cor : `color-mix(in srgb, ${g.cor} 11%, transparent)` }}><i className={`fa-solid ${g.ico}`} /></span>
                  {g.rotulo}
                  <span style={{ fontSize: 12, padding: '0 8px', borderRadius: 999, color: on ? '#fefefe' : 'var(--fn-text)', background: on ? g.cor : `color-mix(in srgb, ${g.cor} 12%, transparent)` }}>{qtd}</span>
                </button>
              );
            })}
          </div>
          {grade(aba === 'todos' ? grupos.flatMap((g) => porGrupo.get(g.id)!) : porGrupo.get(aba) || [])}
        </div>
      )}

      {n === 2 && grupos.map((g) => (
        <section key={g.id} style={{ ['--fn-cor' as string]: g.cor, display: 'grid', gap: 10 }}>
          <h3 className="fn-titulo"><span className="fn-ico p"><i className={`fa-solid ${g.ico}`} /></span>{g.rotulo}<span className="fn-pilula">{porGrupo.get(g.id)!.length} carro(s)</span></h3>
          {grade(porGrupo.get(g.id)!)}
        </section>
      ))}

      {n === 3 && (
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(270px, 1fr)', gap: 12, overflowX: 'auto', paddingBottom: 6, alignItems: 'start' }}>
          {grupos.map((g) => (
            <div key={g.id} style={{ ['--fn-cor' as string]: g.cor, display: 'grid', gap: 10, alignContent: 'start', background: `color-mix(in srgb, ${g.cor} 4%, var(--fn-soft))`, border: '1px solid var(--fn-border)', borderRadius: 16, padding: 10 }}>
              <h3 className="fn-titulo" style={{ fontSize: 15 }}><span className="fn-ico p"><i className={`fa-solid ${g.ico}`} /></span>{g.rotulo}<span style={{ flex: 1 }} /><span className="fn-pilula">{porGrupo.get(g.id)!.length}</span></h3>
              {porGrupo.get(g.id)!.map((v) => <Cartao key={v.id} v={v} ck={checks.get(v.placa)} compacto onAbrir={() => setAberto(v)} />)}
              {!porGrupo.get(g.id)!.length && <div className="fn-sub" style={{ padding: 6 }}>Nenhum carro.</div>}
            </div>
          ))}
        </div>
      )}

      {aberto && (
        <FichaVeiculoNova placa={aberto.placa} pendencias={aberto.pendencias || []}
          onClose={() => setAberto(null)}
          onEditar={() => { setEditando(aberto.placa); setAberto(null); }} />
      )}
      {editando && (
        <VeiculoDrawer placa={editando}
          podeEditar={pode('frota', 'veiculos:editar')}
          podeInativar={pode('frota', 'veiculos:inativar')}
          podeResponsavel={pode('frota', 'veiculos:responsavel')}
          podeDocumentos={pode('frota', 'documentos:editar')}
          onClose={() => setEditando(null)}
          onMudou={carregar} />
      )}
    </div>
  );
}
