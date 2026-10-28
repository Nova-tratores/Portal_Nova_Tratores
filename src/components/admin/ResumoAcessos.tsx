'use client';
// Topo da Administração (José, 21/10/2026: "coloca quantos devs também, e quais módulos admin pode acessar e
// quais devs devem acessar, e deixa mais bonito"): números que filtram a lista + o que cada nível libera.
import { Users, Shield, Code2, BadgeCheck, Smartphone, Wrench, Lock, Check } from 'lucide-react';

export type FiltroPapel = null | 'admin' | 'dev' | 'diretor' | 'vendedor' | 'mecanicos' | 'sem';
interface Pessoa { id: string; nome: string; avatar_url?: string }
interface Props {
  usuarios: Pessoa[];
  nivelDe: (id: string) => 'usuario' | 'admin' | 'dev';
  conta: Record<Exclude<FiltroPapel, null> | 'total', number>;
  totalModulos: number;
  filtro: FiltroPapel; onFiltro: (f: FiltroPapel) => void;
}

const KPIS: { id: FiltroPapel; rot: string; ic: React.ReactNode; cor: string; dica: string }[] = [
  { id: null, rot: 'Usuários', ic: <Users size={18} />, cor: '#0f172a', dica: 'contas ativas' },
  { id: 'admin', rot: 'Admins', ic: <Shield size={18} />, cor: '#d97706', dica: 'veem todo o portal (sem os Devs)' },
  { id: 'dev', rot: 'Devs', ic: <Code2 size={18} />, cor: '#334155', dica: 'admin + ferramentas de dev' },
  { id: 'diretor', rot: 'Diretores', ic: <BadgeCheck size={18} />, cor: '#059669', dica: 'autorizam comissões' },
  { id: 'vendedor', rot: 'Vendedores', ic: <Smartphone size={18} />, cor: '#dc2626', dica: 'app NT Vendas' },
  { id: 'mecanicos', rot: 'App Mecânicos', ic: <Wrench size={18} />, cor: '#2563eb', dica: 'técnicos e observadores' },
  { id: 'sem', rot: 'Sem acesso', ic: <Lock size={18} />, cor: '#94a3b8', dica: 'nenhum módulo liberado' },
];

export default function ResumoAcessos({ usuarios, nivelDe, conta, totalModulos, filtro, onFiltro }: Props) {
  const de = (n: 'usuario' | 'admin' | 'dev') => usuarios.filter((u) => nivelDe(u.id) === n);
  const niveis = [
    {
      id: 'usuario' as const, rot: 'Usuário', cor: '#475569', fundo: '#f8fafc', filtro: null as FiltroPapel,
      resumo: 'Vê só o que você liberar',
      itens: [`Os módulos marcados no modal de acessos (de ${totalModulos})`, 'Dentro de cada módulo, só as ações marcadas', 'Faturar OS e editar cards do financeiro só se marcados à parte'],
    },
    {
      id: 'admin' as const, rot: 'Admin', cor: '#b45309', fundo: '#fffbeb', filtro: 'admin' as FiltroPapel,
      resumo: `Todos os ${totalModulos} módulos, sem precisar marcar`,
      itens: ['Administração: usuários, papéis e acessos', 'Todas as ações dentro dos módulos', 'Editar cards do financeiro e modelos fiscais', 'Não fatura nem cancela nota sem um Dev liberar'],
    },
    {
      id: 'dev' as const, rot: 'Dev', cor: '#0f172a', fundo: '#f1f5f9', filtro: 'dev' as FiltroPapel,
      resumo: 'Tudo do Admin, mais as ferramentas de desenvolvedor',
      itens: ['Faturar OS, cancelar faturamento e trocar OS no Omie', 'Painel do Dev nas Requisições (valor alto)', 'Ideias, Envios de e-mail e Ensinar o Tratorilson', 'Vigia das Câmeras e "quem está acessando"', 'Dar ou tirar o nível Dev de alguém'],
    },
  ];
  return (
    <section className="ra">
      <style>{ESTILO_RA}</style>
      <div className="ra-kpis">
        {KPIS.map((k, i) => {
          const v = k.id ? conta[k.id] : conta.total;
          const on = filtro === k.id && (k.id !== null || filtro === null);
          return (
            <button key={k.rot} type="button" className={`ra-kpi ${on ? 'on' : ''}`} style={{ '--k': k.cor, '--d': `${i * 50}ms` } as React.CSSProperties} onClick={() => onFiltro(filtro === k.id ? null : k.id)} title={k.id ? `Mostrar só: ${k.rot}` : 'Mostrar todos'}>
              <span className="ra-ic">{k.ic}</span>
              <span className="ra-tx"><b>{v}</b><small>{k.rot}</small><em>{k.dica}</em></span>
            </button>
          );
        })}
      </div>

      <div className="ra-niveis">
        {niveis.map((n, i) => {
          const pessoas = de(n.id);
          return (
            <article key={n.id} className="ra-nv" style={{ '--c': n.cor, '--f': n.fundo, '--d': `${200 + i * 80}ms` } as React.CSSProperties}>
              <header>
                <span className="ra-nv-tag">{n.rot}</span>
                <button type="button" className="ra-nv-qtd" onClick={() => n.filtro && onFiltro(filtro === n.filtro ? null : n.filtro)} disabled={!n.filtro}>{pessoas.length} {pessoas.length === 1 ? 'pessoa' : 'pessoas'}</button>
              </header>
              <b className="ra-nv-res">{n.resumo}</b>
              <ul>{n.itens.map((t) => <li key={t}><Check size={13} />{t}</li>)}</ul>
              {n.id !== 'usuario' && pessoas.length > 0 && (
                <div className="ra-avs">
                  {pessoas.slice(0, 8).map((p) => <span key={p.id} title={p.nome}>{p.avatar_url ? <img src={p.avatar_url} alt="" /> : p.nome.charAt(0)}</span>)}
                  {pessoas.length > 8 && <span className="mais">+{pessoas.length - 8}</span>}
                </div>
              )}
            </article>
          );
        })}
        <article className="ra-nv extra" style={{ '--d': '460ms' } as React.CSSProperties}>
          <header><span className="ra-nv-tag">Papéis extras</span></header>
          <b className="ra-nv-res">Somam a qualquer nível</b>
          <ul>
            <li><Check size={13} /><span><b>Diretor</b> — autoriza o lançamento das comissões dos mecânicos</span></li>
            <li><Check size={13} /><span><b>Vendedor</b> — entra no app NT Vendas com o mesmo login</span></li>
            <li><Check size={13} /><span><b>App Mecânicos</b> — técnico (lança relatórios) ou observador</span></li>
          </ul>
        </article>
      </div>
    </section>
  );
}

const ESTILO_RA = `
@keyframes raEntra { from { opacity: 0; transform: translateY(10px) } }
.ra { display: grid; gap: 18px; margin-bottom: 26px }
.ra-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px }
.ra-kpi { position: relative; display: flex; gap: 12px; align-items: center; text-align: left; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 16px; padding: 14px 16px; font-family: inherit; cursor: pointer; overflow: hidden; animation: raEntra .4s var(--d) both; transition: transform .15s, box-shadow .2s, border-color .2s }
.ra-kpi::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--k); transform: scaleX(0); transform-origin: left; transition: transform .3s }
.ra-kpi:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,23,42,.08) } .ra-kpi:hover::after, .ra-kpi.on::after { transform: scaleX(1) }
.ra-kpi.on { border-color: color-mix(in srgb, var(--k) 45%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--k) 12%, transparent) }
.ra-ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; color: var(--k); background: color-mix(in srgb, var(--k) 10%, transparent) }
.ra-tx { display: grid; line-height: 1.15; min-width: 0 } .ra-tx b { font-size: 24px; font-weight: 600; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums } .ra-tx small { font-size: 13px; color: #334155 } .ra-tx em { font-style: normal; font-size: 11.5px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.ra-niveis { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px }
.ra-nv { --c: #475569; --f: #f8fafc; display: grid; gap: 8px; align-content: start; border: 1px solid var(--portal-border, #e2e8f0); background: linear-gradient(180deg, var(--f), var(--portal-bg-card, #fefefe) 70%); border-radius: 18px; padding: 16px 18px; animation: raEntra .45s var(--d) both }
.ra-nv header { display: flex; justify-content: space-between; align-items: center }
.ra-nv-tag { font-size: 12.5px; border-radius: 999px; padding: 4px 12px; color: #fefefe; background: var(--c) } .ra-nv.extra .ra-nv-tag { background: linear-gradient(135deg, #059669, #dc2626) }
.ra-nv-qtd { border: none; background: none; font-family: inherit; font-size: 12.5px; color: #64748b; cursor: pointer; text-decoration: underline; text-underline-offset: 3px } .ra-nv-qtd:disabled { cursor: default; text-decoration: none }
.ra-nv-res { font-size: 15px; font-weight: 500; color: #0f172a }
.ra-nv ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px } .ra-nv li { display: flex; gap: 7px; align-items: flex-start; font-size: 13px; color: #334155; line-height: 1.4 } .ra-nv li svg { color: var(--c); flex-shrink: 0; margin-top: 2px } .ra-nv.extra li svg { color: #059669 } .ra-nv li b { font-weight: 500; color: #0f172a }
.ra-avs { display: flex; margin-top: 4px } .ra-avs span { width: 30px; height: 30px; border-radius: 50%; border: 2px solid #fefefe; margin-left: -8px; overflow: hidden; display: grid; place-items: center; background: #e2e8f0; color: #475569; font-size: 12px; box-shadow: 0 1px 3px rgba(15,23,42,.15) } .ra-avs span:first-child { margin-left: 0 } .ra-avs img { width: 100%; height: 100%; object-fit: cover } .ra-avs .mais { background: #0f172a; color: #fefefe; font-size: 11px }
`;
