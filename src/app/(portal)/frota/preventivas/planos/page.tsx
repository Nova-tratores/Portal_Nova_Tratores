'use client';
// Frota > Preventivas > PLANOS POR MODELO. O José decidiu que os intervalos vêm
// do MANUAL de cada veículo: aqui se cadastra o modelo (ex.: "Fiat Strada
// Working 1.4 2024"), o manual (PDF ou link + a página), os itens com o
// intervalo em km / horas / meses e os carros que seguem esse plano.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Loader2, Plus, Save, Trash2, Upload } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { supabase } from '@/lib/supabase';
import { formatarPlaca } from '@/lib/frota/placa';
import { CabecalhoFrota, CarregandoFrota, VazioFrota, AZUL_FROTA } from '@/components/frota/ui';

interface ItemForm {
  id?: string; nome: string; componente_id: string; intervalo_km: string; intervalo_horas: string; intervalo_meses: string;
  aviso_km: string; aviso_dias: string; modo: 'deslizante' | 'fixo'; referencia: string;
}
interface Modelo {
  id: string; nome: string; manual_url: string | null; manual_referencia: string | null; obs: string | null;
  itens: (Omit<ItemForm, 'intervalo_km' | 'intervalo_horas' | 'intervalo_meses' | 'aviso_km' | 'aviso_dias' | 'componente_id' | 'referencia'> & {
    intervalo_km: number | null; intervalo_horas: number | null; intervalo_meses: number | null; aviso_km: number; aviso_dias: number;
    componente_id: string | null; referencia: string | null;
  })[];
  veiculos: string[];
}
interface Veiculo { id: string; placa: string; marca: string | null; modelo: string | null; descricao: string | null; ano: number | null; modelo_manutencao_id: string | null }
interface Componente { id: string; sistema: string; subsistema: string | null; componente: string | null }

const itemVazio = (): ItemForm => ({ nome: '', componente_id: '', intervalo_km: '', intervalo_horas: '', intervalo_meses: '', aviso_km: '1000', aviso_dias: '30', modo: 'deslizante', referencia: '' });
const descVeic = (v: Veiculo) => [v.marca, v.modelo || v.descricao, v.ano].filter(Boolean).join(' ');

export default function PlanosPage() {
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [componentes, setComponentes] = useState<Componente[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [aviso, setAviso] = useState('');
  const [editando, setEditando] = useState<{ id?: string; nome: string; manual_url: string; manual_referencia: string; obs: string; itens: ItemForm[]; veiculos: Set<string> } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviandoPdf, setEnviandoPdf] = useState(false);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/frota/planos', { headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setAviso(j.error || `Falha ao carregar (${r.status}).`); return; }
      setAviso(j.migracaoFaltando ? j.error : '');
      setModelos(j.modelos || []);
      setVeiculos(j.veiculos || []);
      setComponentes(j.componentes || []);
      setPodeEditar(!!j.podeEditar);
    } catch (e) { setAviso(String(e)); }
  }, []);
  // carregar só grava estado depois do fetch (assíncrono)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

  const nomeModelo = useMemo(() => new Map((modelos || []).map((m) => [m.id, m.nome])), [modelos]);
  const semModelo = veiculos.filter((v) => !v.modelo_manutencao_id);

  const abrir = (m?: Modelo) => {
    setMsg('');
    setEditando(m ? {
      id: m.id, nome: m.nome, manual_url: m.manual_url || '', manual_referencia: m.manual_referencia || '', obs: m.obs || '',
      veiculos: new Set(m.veiculos),
      itens: m.itens.map((i) => ({
        id: i.id, nome: i.nome, componente_id: i.componente_id || '', modo: i.modo, referencia: i.referencia || '',
        intervalo_km: i.intervalo_km ? String(i.intervalo_km) : '', intervalo_horas: i.intervalo_horas ? String(i.intervalo_horas) : '',
        intervalo_meses: i.intervalo_meses ? String(i.intervalo_meses) : '', aviso_km: String(i.aviso_km), aviso_dias: String(i.aviso_dias),
      })),
    } : { nome: '', manual_url: '', manual_referencia: '', obs: '', veiculos: new Set(), itens: [itemVazio()] });
  };

  const enviarPdf = async (f: File | null) => {
    if (!f || !editando) return;
    setEnviandoPdf(true); setMsg('');
    try {
      const caminho = `frota/manuais/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, '_')}`;
      const { error } = await supabase.storage.from('anexos').upload(caminho, f, { contentType: f.type || 'application/pdf' });
      if (error) throw new Error(error.message);
      const url = supabase.storage.from('anexos').getPublicUrl(caminho).data.publicUrl;
      setEditando((e) => (e ? { ...e, manual_url: url } : e));
    } catch (e) { setMsg(`Não deu para enviar o manual: ${(e as Error).message}`); }
    finally { setEnviandoPdf(false); }
  };

  const salvar = async () => {
    if (!editando) return;
    setSalvando(true); setMsg('');
    try {
      const r = await fetch('/api/frota/planos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          acao: 'salvar_modelo',
          modelo: { id: editando.id, nome: editando.nome, manual_url: editando.manual_url, manual_referencia: editando.manual_referencia, obs: editando.obs },
          itens: editando.itens.filter((i) => i.nome.trim()),
          veiculos: [...editando.veiculos],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error || 'Não deu para salvar.'); return; }
      setEditando(null);
      carregar();
    } catch { setMsg('Falha de conexão — tente de novo.'); }
    finally { setSalvando(false); }
  };

  const campo: React.CSSProperties = { minHeight: 36, padding: '0 8px', fontSize: 13.5, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', width: '100%', boxSizing: 'border-box', minWidth: 0 };
  const rot: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', minWidth: 0 };
  const setItem = (idx: number, patch: Partial<ItemForm>) =>
    setEditando((e) => (e ? { ...e, itens: e.itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)) } : e));

  return (
    <div className="frota-pg" style={{ padding: '28px 40px' }}>
      <CabecalhoFrota
        titulo="Planos por modelo"
        resumo="Os intervalos vêm do manual de cada veículo. Cadastre o modelo, anexe o manual, informe cada item com o intervalo em km, horas de motor ou meses e marque os carros que seguem esse plano."
        acoes={
          <>
            <Link href="/frota/preventivas" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: AZUL_FROTA, textDecoration: 'none' }}>
              <ArrowLeft size={15} /> Preventivas
            </Link>
            {podeEditar && !aviso && (
              <button type="button" onClick={() => abrir()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', background: AZUL_FROTA, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <Plus size={15} /> Novo modelo
              </button>
            )}
          </>
        }
      />

      {aviso && <VazioFrota titulo="Preventiva ainda não ativada" texto={aviso} />}
      {!modelos && !aviso && <CarregandoFrota linhas={4} />}

      {modelos && !aviso && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {semModelo.length > 0 && (
            <div style={{ padding: '10px 14px', background: 'rgba(180,83,9,.10)', color: '#b45309', fontSize: 13.5 }}>
              <strong>{semModelo.length} carro(s) sem plano:</strong> {semModelo.map((v) => `${formatarPlaca(v.placa)} (${descVeic(v) || 'sem modelo'})`).join(' · ')}
            </div>
          )}
          {!modelos.length && <VazioFrota titulo="Nenhum modelo cadastrado" texto="Comece pelo modelo com mais carros na frota e o manual dele em mãos." />}
          {modelos.map((m) => (
            <div key={m.id} style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderLeft: `4px solid ${AZUL_FROTA}`, padding: '12px 14px', display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 15.5, color: 'var(--portal-text)' }}>{m.nome}</strong>
                <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>{m.itens.length} itens · {m.veiculos.length} carro(s)</span>
                {m.manual_url && <a href={m.manual_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: AZUL_FROTA, fontWeight: 700 }}><FileText size={13} /> Manual</a>}
                {podeEditar && <button type="button" onClick={() => abrir(m)} className="frota-touch" style={{ marginLeft: 'auto', padding: '6px 12px', border: `1px solid ${AZUL_FROTA}`, background: 'none', color: AZUL_FROTA, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Editar</button>}
              </div>
              {m.manual_referencia && <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>{m.manual_referencia}</span>}
              <span style={{ fontSize: 13, color: 'var(--portal-text)' }}>
                {m.itens.map((i) => `${i.nome} (${[i.intervalo_km ? `${i.intervalo_km.toLocaleString('pt-BR')} km` : null, i.intervalo_horas ? `${i.intervalo_horas} h` : null, i.intervalo_meses ? `${i.intervalo_meses} meses` : null].filter(Boolean).join(' ou ')})`).join(' · ') || 'sem itens'}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
                {veiculos.filter((v) => m.veiculos.includes(v.id)).map((v) => formatarPlaca(v.placa)).join(' · ') || 'nenhum carro ligado'}
              </span>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <div role="dialog" aria-modal="true" aria-label="Plano do modelo" onClick={(e) => { if (e.target === e.currentTarget && !salvando) setEditando(null); }}
          className="m-tela-cheia-fundo" style={{ position: 'fixed', inset: 0, zIndex: 10500, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="m-tela-cheia" style={{ width: '100%', maxWidth: 980, maxHeight: '94vh', overflowY: 'auto', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', padding: 18, display: 'grid', gap: 14 }}>
            <strong style={{ fontSize: 17, color: 'var(--portal-text)' }}>{editando.id ? 'Editar plano' : 'Novo modelo de manutenção'}</strong>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 10 }}>
              <label style={rot}>Nome do modelo *
                <input value={editando.nome} placeholder="Fiat Strada Working 1.4 2024" onChange={(e) => setEditando({ ...editando, nome: e.target.value })} style={campo} />
              </label>
              <label style={rot}>Referência do manual
                <input value={editando.manual_referencia} placeholder="Manual do proprietário, pág. 142 — Plano de manutenção" onChange={(e) => setEditando({ ...editando, manual_referencia: e.target.value })} style={campo} />
              </label>
              <label style={rot}>Manual (link)
                <input value={editando.manual_url} placeholder="https://… ou envie o PDF" onChange={(e) => setEditando({ ...editando, manual_url: e.target.value })} style={campo} />
              </label>
              <label style={{ ...rot, alignContent: 'end' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 36, border: `1px solid ${AZUL_FROTA}`, color: AZUL_FROTA, cursor: 'pointer', position: 'relative' }}>
                  {enviandoPdf ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Enviar PDF do manual
                  <input type="file" accept="application/pdf" onChange={(e) => enviarPdf(e.target.files?.[0] || null)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="PDF do manual" />
                </span>
              </label>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <strong style={{ fontSize: 14, color: 'var(--portal-text)' }}>Itens do plano (do manual)</strong>
              <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>Preencha só os intervalos que o manual dá — vence o que chegar primeiro. “Marcos fixos” = o manual fala em 10.000, 20.000, 30.000 km (fazer antes não empurra o próximo).</span>
              <div className="m-tabela m-tabela-fixa" style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 860, fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--portal-text-secondary)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      <th style={{ padding: 4 }}>Item *</th><th style={{ padding: 4 }}>Componente</th><th style={{ padding: 4 }}>Km</th><th style={{ padding: 4 }}>Horas</th>
                      <th style={{ padding: 4 }}>Meses</th><th style={{ padding: 4 }}>Avisar (km / dias)</th><th style={{ padding: 4 }}>Modo</th><th style={{ padding: 4 }}>Página do manual</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {editando.itens.map((it, idx) => (
                      <tr key={it.id || `novo-${idx}`}>
                        <td style={{ padding: 4, minWidth: 170 }}><input value={it.nome} placeholder="Troca de óleo e filtro" onChange={(e) => setItem(idx, { nome: e.target.value })} style={campo} /></td>
                        <td style={{ padding: 4, minWidth: 150 }}>
                          <select value={it.componente_id} onChange={(e) => setItem(idx, { componente_id: e.target.value })} style={campo}>
                            <option value="">—</option>
                            {componentes.map((c) => <option key={c.id} value={c.id}>{[c.sistema, c.subsistema, c.componente].filter(Boolean).join(' › ')}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: 4, width: 90 }}><input inputMode="numeric" value={it.intervalo_km} onChange={(e) => setItem(idx, { intervalo_km: e.target.value.replace(/\D/g, '') })} style={campo} /></td>
                        <td style={{ padding: 4, width: 70 }}><input inputMode="numeric" value={it.intervalo_horas} onChange={(e) => setItem(idx, { intervalo_horas: e.target.value.replace(/\D/g, '') })} style={campo} /></td>
                        <td style={{ padding: 4, width: 60 }}><input inputMode="numeric" value={it.intervalo_meses} onChange={(e) => setItem(idx, { intervalo_meses: e.target.value.replace(/\D/g, '') })} style={campo} /></td>
                        <td style={{ padding: 4, width: 120 }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input inputMode="numeric" aria-label="Avisar com quantos km" value={it.aviso_km} onChange={(e) => setItem(idx, { aviso_km: e.target.value.replace(/\D/g, '') })} style={campo} />
                            <input inputMode="numeric" aria-label="Avisar com quantos dias" value={it.aviso_dias} onChange={(e) => setItem(idx, { aviso_dias: e.target.value.replace(/\D/g, '') })} style={campo} />
                          </div>
                        </td>
                        <td style={{ padding: 4, width: 120 }}>
                          <select value={it.modo} onChange={(e) => setItem(idx, { modo: e.target.value as ItemForm['modo'] })} style={campo}>
                            <option value="deslizante">Depois do feito</option>
                            <option value="fixo">Marcos fixos</option>
                          </select>
                        </td>
                        <td style={{ padding: 4, minWidth: 110 }}><input value={it.referencia} placeholder="pág. 142" onChange={(e) => setItem(idx, { referencia: e.target.value })} style={campo} /></td>
                        <td style={{ padding: 4 }}>
                          <button type="button" aria-label="Tirar item" onClick={() => setEditando({ ...editando, itens: editando.itens.filter((_, i) => i !== idx) })}
                            style={{ width: 34, height: 34, border: '1px solid var(--portal-border)', background: 'none', color: '#b91c1c', cursor: 'pointer' }}><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => setEditando({ ...editando, itens: [...editando.itens, itemVazio()] })}
                style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: `1px solid ${AZUL_FROTA}`, background: 'none', color: AZUL_FROTA, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <Plus size={14} /> Item
              </button>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <strong style={{ fontSize: 14, color: 'var(--portal-text)' }}>Carros que seguem este plano</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 4 }}>
                {veiculos.map((v) => {
                  const outro = v.modelo_manutencao_id && v.modelo_manutencao_id !== editando.id ? nomeModelo.get(v.modelo_manutencao_id) : null;
                  return (
                    <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--portal-text)', padding: '4px 0' }}>
                      <input type="checkbox" checked={editando.veiculos.has(v.id)}
                        onChange={() => setEditando((e) => { if (!e) return e; const n = new Set(e.veiculos); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); return { ...e, veiculos: n }; })} />
                      <span style={{ minWidth: 0 }}>
                        <strong>{formatarPlaca(v.placa)}</strong> {descVeic(v)}
                        {outro && <span style={{ display: 'block', fontSize: 11.5, color: '#b45309' }}>hoje no plano “{outro}” — marcar troca</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {msg && <span style={{ color: '#b91c1c', fontSize: 13 }}>{msg}</span>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setEditando(null)} style={{ padding: '9px 16px', border: '1px solid var(--portal-border)', background: 'none', color: 'var(--portal-text)', cursor: 'pointer' }}>Cancelar</button>
              <button type="button" disabled={salvando || !editando.nome.trim()} onClick={salvar}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: 'none', background: AZUL_FROTA, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {salvando ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Salvar plano
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
