'use client';
// "Esse grupo é para um evento?" (José, 23/11/2026) — aparece no formulário de grupo novo só para quem tem
// acesso ao Marketing. Liga o grupo a um evento/campanha aberto ou cria um novo (padrão: Evento interno).
// O vínculo é feito DEPOIS de o grupo ser criado, por ligarGrupoAoEvento(); falha ali não desfaz o grupo.
import { useEffect, useState } from 'react';
import { PartyPopper } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { TIPOS_ACAO } from '@/lib/marketing/tipos';

export type EscolhaEvento = { modo: 'nao' } | { modo: 'existente'; acao_id: string } | { modo: 'novo'; tipo: string; data_inicio: string };
type AcaoAberta = { id: string; nome: string; tipo: string; data_inicio: string | null };

/** Liga o grupo recém-criado ao evento escolhido. Devolve um aviso (texto) se não deu certo, ou null. */
export async function ligarGrupoAoEvento(grupoId: number, nomeGrupo: string, e: EscolhaEvento): Promise<string | null> {
  if (e.modo === 'nao') return null;
  try {
    const body = e.modo === 'existente' ? { grupo_id: grupoId, acao_id: e.acao_id } : { grupo_id: grupoId, criar: { nome: nomeGrupo, tipo: e.tipo, data_inicio: e.data_inicio || null } };
    const r = await fetchAuth('/api/marketing/acoes/grupo-requisicoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return `O grupo foi criado, mas não consegui ligar ao evento: ${j.error || r.status}`;
    return null;
  } catch (err) { return `O grupo foi criado, mas não consegui ligar ao evento: ${err instanceof Error ? err.message : String(err)}`; }
}

/** Seção do formulário. Não aparece para quem não tem o módulo Marketing (aí a escolha fica sempre "não"). */
export default function EventoDoGrupo({ valor, onChange }: { valor: EscolhaEvento; onChange: (e: EscolhaEvento) => void }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const temMarketing = pode('marketing');
  const [acoes, setAcoes] = useState<AcaoAberta[] | null>(null);

  useEffect(() => {
    if (!temMarketing || valor.modo !== 'existente' || acoes) return;
    fetchAuth('/api/marketing/acoes/grupo-requisicoes').then((r) => r.json()).then((j) => setAcoes(j.acoes || [])).catch(() => setAcoes([]));
  }, [temMarketing, valor.modo, acoes]);

  if (!temMarketing) return null;
  const opc = (modo: EscolhaEvento['modo'], t: string, d: string) => (
    <button key={modo} type="button"
      onClick={() => onChange(modo === 'nao' ? { modo } : modo === 'novo' ? { modo, tipo: 'evento_interno', data_inicio: '' } : { modo, acao_id: '' })}
      className={`text-left rounded-lg border p-3 min-h-[44px] ${valor.modo === modo ? 'border-pink-500 bg-white ring-2 ring-pink-500/20' : 'border-zinc-200 bg-white hover:border-zinc-400'}`}>
      <div className="text-[14px] font-medium text-zinc-900">{t}</div>
      <div className="text-[12.5px] text-zinc-500 leading-snug">{d}</div>
    </button>
  );

  return (
    <div className="rounded-xl border border-pink-200 bg-pink-50/40 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[14px] font-medium text-zinc-900"><PartyPopper size={16} className="text-pink-600" /> Esse grupo é para um evento?</div>
      <div className="text-[12.5px] text-zinc-500 -mt-2">Confraternização, feira, campanha… As requisições do grupo entram como custo do evento no Marketing.</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {opc('nao', 'Não', 'Grupo comum')}
        {opc('existente', 'Evento que já existe', 'Escolher na lista')}
        {opc('novo', 'Criar evento novo', 'Com o nome do grupo')}
      </div>
      {valor.modo === 'existente' && (
        <select value={valor.acao_id} onChange={(e) => onChange({ modo: 'existente', acao_id: e.target.value })}
          className="h-11 px-3 rounded-lg border border-zinc-300 bg-white text-[15px] outline-none focus:border-pink-400">
          <option value="">{acoes === null ? 'Carregando…' : acoes.length ? '— escolher o evento —' : 'Nenhum evento aberto'}</option>
          {(acoes || []).map((a) => (
            <option key={a.id} value={a.id}>{a.nome} · {TIPOS_ACAO.find((t) => t.id === a.tipo)?.label || a.tipo}{a.data_inicio ? ` · ${a.data_inicio.split('-').reverse().join('/')}` : ''}</option>
          ))}
        </select>
      )}
      {valor.modo === 'novo' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] text-zinc-600">Tipo</span>
            <select value={valor.tipo} onChange={(e) => onChange({ ...valor, tipo: e.target.value })}
              className="h-11 px-3 rounded-lg border border-zinc-300 bg-white text-[15px] outline-none focus:border-pink-400">
              {TIPOS_ACAO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] text-zinc-600">Data (opcional)</span>
            <input type="date" value={valor.data_inicio} onChange={(e) => onChange({ ...valor, data_inicio: e.target.value })}
              className="h-11 px-3 rounded-lg border border-zinc-300 bg-white text-[15px] outline-none focus:border-pink-400" />
          </label>
        </div>
      )}
    </div>
  );
}

/** true quando a escolha está incompleta (ex.: "evento que já existe" sem escolher qual). */
export const escolhaIncompleta = (e: EscolhaEvento) => e.modo === 'existente' && !e.acao_id;
