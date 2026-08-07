'use client';
// Modal de ABASTECIMENTOS do veículo (aberto pela Ficha — sem redirecionar):
// todo o histórico da placa, agrupado por DIA, SEMANA ou MÊS.
import { useEffect, useMemo, useState } from 'react';
import { Fuel, X, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarPlaca } from '@/lib/frota/placa';

interface Props {
  placa: string;
  onClose: () => void;
}

interface Abast {
  data_transacao: string;
  litros: number;
  valor_total: number; // valor PAGO (com desconto da operadora)
  valor_economizado: number | null; // desconto da operadora
  combustivel: string | null;
  posto_nome: string | null;
  motorista_nome: string | null;
  hodometro: number | null;
}

type Visao = 'dia' | 'semana' | 'mes';

const fmtRS = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtL = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// dia local (Brasília) do abastecimento
const diaDe = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 10);
};

// segunda-feira da semana do dia (chave do agrupamento semanal)
function segundaDe(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=dom
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function rotuloSemana(segunda: string): string {
  const ini = new Date(`${segunda}T00:00:00Z`);
  const fim = new Date(ini);
  fim.setUTCDate(fim.getUTCDate() + 6);
  const dd = (x: Date) => String(x.getUTCDate()).padStart(2, '0');
  const mm = (x: Date) => String(x.getUTCMonth() + 1).padStart(2, '0');
  return `${dd(ini)}/${mm(ini)} – ${dd(fim)}/${mm(fim)}/${fim.getUTCFullYear()}`;
}

export default function AbastecimentosModal({ placa, onClose }: Props) {
  const [linhas, setLinhas] = useState<Abast[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [visao, setVisao] = useState<Visao>('dia');

  useEffect(() => {
    (async () => {
      const out: Abast[] = [];
      for (let off = 0; off < 20_000; off += 1000) {
        const { data } = await supabase
          .from('abastecimentos')
          .select('data_transacao, litros, valor_total, valor_economizado, combustivel, posto_nome, motorista_nome, hodometro')
          .eq('placa', placa)
          .order('data_transacao', { ascending: false })
          .range(off, off + 999);
        out.push(...((data || []) as Abast[]));
        if (!data || data.length < 1000) break;
      }
      setLinhas(out);
      setCarregando(false);
    })();
  }, [placa]);

  // grupos conforme a visão — cada grupo tem rótulo, subtotais e (no dia) as linhas
  const grupos = useMemo(() => {
    const porChave = new Map<string, { rotulo: string; itens: Abast[] }>();
    for (const l of linhas) {
      const dia = diaDe(l.data_transacao);
      let chave: string, rotulo: string;
      if (visao === 'dia') { chave = dia; rotulo = fmtData(`${dia}T12:00:00`); }
      else if (visao === 'semana') { chave = segundaDe(dia); rotulo = rotuloSemana(chave); }
      else { chave = dia.slice(0, 7); rotulo = `${MESES[Number(dia.slice(5, 7)) - 1]}/${dia.slice(0, 4)}`; }
      const g = porChave.get(chave) || { rotulo, itens: [] };
      g.itens.push(l);
      porChave.set(chave, g);
    }
    return [...porChave.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([chave, g]) => ({
        chave,
        rotulo: g.rotulo,
        itens: g.itens,
        litros: g.itens.reduce((s, i) => s + (Number(i.litros) || 0), 0),
        valor: g.itens.reduce((s, i) => s + (Number(i.valor_total) || 0), 0),
      }));
  }, [linhas, visao]);

  const totLitros = linhas.reduce((s, l) => s + (Number(l.litros) || 0), 0);
  const totValor = linhas.reduce((s, l) => s + (Number(l.valor_total) || 0), 0);
  const totEconomia = linhas.reduce((s, l) => s + (Number(l.valor_economizado) || 0), 0);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 96vw)', maxHeight: '85vh', background: 'var(--portal-bg)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Fuel size={17} color="#0d9488" />
          <strong style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)' }}>Abastecimentos · {formatarPlaca(placa)}</strong>
          <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
            {linhas.length} no total · {fmtL(totLitros)} L · <strong style={{ color: 'var(--portal-text)' }}>{fmtRS(totValor)}</strong>
            {totEconomia > 0 && <> · economia <strong style={{ color: '#16a34a' }}>{fmtRS(totEconomia)}</strong></>}
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', border: '1px solid var(--portal-border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['dia', 'semana', 'mes'] as Visao[]).map((v) => (
              <button key={v} onClick={() => setVisao(v)} style={{ padding: '5px 12px', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: visao === v ? '#0d9488' : 'var(--portal-bg-input)', color: visao === v ? '#fff' : 'var(--portal-text-secondary)' }}>
                {v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}><X size={18} /></button>
        </div>

        {/* Corpo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          {carregando && <div style={{ fontSize: 13, color: 'var(--portal-text-muted)', padding: 20, textAlign: 'center' }}>Carregando…</div>}
          {!carregando && linhas.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--portal-text-muted)', padding: 20, textAlign: 'center' }}>Nenhum abastecimento registrado.</div>
          )}
          {grupos.map((g) => (
            <div key={g.chave} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 8, fontSize: 12.5 }}>
                <strong style={{ color: 'var(--portal-text)', textTransform: 'capitalize' }}>{g.rotulo}</strong>
                <span style={{ color: 'var(--portal-text-muted)' }}>{g.itens.length} abastecimento{g.itens.length > 1 ? 's' : ''}</span>
                <div style={{ flex: 1 }} />
                <span style={{ color: 'var(--portal-text-secondary)' }}>{fmtL(g.litros)} L</span>
                <strong style={{ color: '#0d9488' }}>{fmtRS(g.valor)}</strong>
                {g.litros > 0 && <span style={{ color: 'var(--portal-text-muted)', fontSize: 11 }}>({fmtRS(g.valor / g.litros)}/L)</span>}
              </div>
              {/* nas visões semana/mês o grupo é só o resumo; no dia lista as linhas */}
              {visao === 'dia' && g.itens.map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px 5px 22px', fontSize: 12, color: 'var(--portal-text-secondary)', borderBottom: '1px dashed var(--portal-border)', flexWrap: 'wrap' }}>
                  <span style={{ minWidth: 38, color: 'var(--portal-text-muted)' }}>{fmtHora(l.data_transacao)}</span>
                  <strong style={{ minWidth: 52, color: 'var(--portal-text)' }}>{fmtL(Number(l.litros))} L</strong>
                  {l.combustivel && <span style={{ fontSize: 10.5, fontWeight: 700, color: /etanol|alcool|álcool/i.test(l.combustivel) ? '#15803d' : /gasolina/i.test(l.combustivel) ? '#b45309' : 'var(--portal-text-muted)', background: 'var(--portal-bg-secondary)', borderRadius: 999, padding: '1px 8px' }}>{l.combustivel}</span>}
                  <span style={{ flex: 1, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.posto_nome || '—'}</span>
                  {l.hodometro != null && <span style={{ color: 'var(--portal-text-muted)', fontSize: 11 }}>{Number(l.hodometro).toLocaleString('pt-BR')} km</span>}
                  {Number(l.valor_economizado) > 0 && (
                    <span title="Desconto da operadora" style={{ color: '#16a34a', fontSize: 11, fontWeight: 700 }}>−{fmtRS(Number(l.valor_economizado))}</span>
                  )}
                  <strong style={{ color: 'var(--portal-text)' }}>{fmtRS(Number(l.valor_total))}</strong>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Rodapé */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--portal-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <a href={`/frota/abastecimento?placa=${encodeURIComponent(placa)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--portal-text-muted)', textDecoration: 'none' }}>
            abrir a tela completa do Abastecimento <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
}
