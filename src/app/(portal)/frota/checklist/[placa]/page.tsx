'use client';
// Checklist mensal de veículo NÃO-VINCULADO, feito pelo portal.
// Desktop: só vê (se existir) ou vê as perguntas + aviso "use o mobile".
// Mobile: preenche passo-a-passo (KM -> 20 itens com foto -> resumo -> concluir).
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Check, X, Loader2, ClipboardCheck, Smartphone, FileText, AlertTriangle, ShieldCheck } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { useIsMobile } from '@/hooks/useIsMobile';
import { CHECKLIST_ITEMS } from '@/lib/frota/checklist';
import { formatarPlaca } from '@/lib/frota/placa';

type Loc = { lat: number; lng: number } | null;
const getLoc = (): Promise<Loc> => new Promise((res) => {
  if (!navigator.geolocation) return res(null);
  navigator.geolocation.getCurrentPosition(
    (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
    () => res(null), { timeout: 5000 },
  );
});

export default function ChecklistVeiculoPage() {
  const params = useParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const placa = decodeURIComponent(String(params?.placa || ''));

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [checklist, setChecklist] = useState<any>(null);
  const [veiculo, setVeiculo] = useState<any>(null);
  const [itensSalvos, setItensSalvos] = useState<Record<string, any>>({});

  // wizard
  const [fase, setFase] = useState<'intro' | 'item' | 'resumo' | 'resultado'>('intro');
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [km, setKm] = useState('');
  const [idx, setIdx] = useState(0);
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPrev, setFotoPrev] = useState('');
  const [resposta, setResposta] = useState<'ok' | 'problema' | ''>('');
  const [obs, setObs] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const r = await fetch(`/api/frota/checklist?placa=${encodeURIComponent(placa)}`, { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); }
      else {
        setChecklist(d.checklist || null);
        setVeiculo(d.veiculo || null);
        const map: Record<string, any> = {};
        for (const it of d.itens || []) map[it.item_key] = it;
        setItensSalvos(map);
        if (d.checklist) setChecklistId(d.checklist.id);
      }
    } catch (e) { setErro(String(e)); }
    setCarregando(false);
  }, [placa]);
  useEffect(() => { carregar(); }, [carregar]);

  const concluido = checklist && (checklist.status === 'completo' || checklist.status === 'suspeito');
  const placaFmt = veiculo?.placa_exibicao || formatarPlaca(placa);
  const veicDesc = [veiculo?.marca, veiculo?.modelo].filter(Boolean).join(' ');

  const escolherFoto = (f: File | null) => {
    setFoto(f);
    setFotoPrev(f ? URL.createObjectURL(f) : '');
  };

  const iniciar = async () => {
    if (!km) return;
    setBusy(true); setErro('');
    try {
      const loc = await getLoc();
      const r = await fetch('/api/frota/checklist', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ action: 'iniciar', placa, km, loc }) });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao iniciar.'); setBusy(false); return; }
      setChecklistId(d.id);
      const map: Record<string, any> = {};
      for (const it of d.itens || []) map[it.item_key] = it;
      setItensSalvos(map);
      // retoma no primeiro item não respondido
      const primeiroPendente = CHECKLIST_ITEMS.findIndex((it) => !map[it.key]);
      setIdx(primeiroPendente < 0 ? 0 : primeiroPendente);
      setFase('item');
    } catch (e) { setErro(String(e)); }
    setBusy(false);
  };

  const carregarItemNaTela = (i: number) => {
    const it = CHECKLIST_ITEMS[i];
    const salvo = itensSalvos[it.key];
    setResposta(salvo?.resposta || '');
    setObs(salvo?.observacao || '');
    setFoto(null);
    setFotoPrev(salvo?.foto_url || '');
    setIdx(i);
  };

  const salvarItem = async () => {
    const it = CHECKLIST_ITEMS[idx];
    const jaTemFoto = foto || itensSalvos[it.key]?.foto_url;
    if (!jaTemFoto || !resposta) { setErro('Tire a foto e marque OK ou Problema.'); return; }
    setBusy(true); setErro('');
    try {
      const fd = new FormData();
      fd.append('action', 'salvar_item');
      fd.append('checklist_id', checklistId!);
      fd.append('item_key', it.key);
      fd.append('categoria', it.cat);
      fd.append('titulo', it.titulo);
      fd.append('resposta', resposta);
      fd.append('observacao', obs);
      if (foto) fd.append('foto', foto);
      const r = await fetch('/api/frota/checklist', { method: 'POST', headers: { ...(await authHeaders()) }, body: fd });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao salvar.'); setBusy(false); return; }
      setItensSalvos((m) => ({ ...m, [it.key]: { ...m[it.key], item_key: it.key, resposta, observacao: obs, foto_url: d.foto_url || m[it.key]?.foto_url } }));
      if (idx < CHECKLIST_ITEMS.length - 1) carregarItemNaTela(idx + 1);
      else setFase('resumo');
    } catch (e) { setErro(String(e)); }
    setBusy(false);
  };

  const concluir = async () => {
    setBusy(true); setErro('');
    try {
      const loc = await getLoc();
      const r = await fetch('/api/frota/checklist', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ action: 'concluir', checklist_id: checklistId, loc }) });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Falha ao concluir.'); setBusy(false); return; }
      setResultado(d);
      setFase('resultado');
    } catch (e) { setErro(String(e)); }
    setBusy(false);
  };

  // ── estilos ──
  const wrap: React.CSSProperties = { padding: 'clamp(12px,4vw,28px)', maxWidth: 760, margin: '0 auto' };
  const card: React.CSSProperties = { background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 0, padding: 18 };
  const btnPrim: React.CSSProperties = { width: '100%', padding: 14, borderRadius: 0, border: 'none', background: '#1e40af', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' };

  const voltar = (
    <button onClick={() => router.push('/frota/checklists')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text)', fontSize: 13, padding: '4px 0', marginBottom: 14 }}>
      <ArrowLeft size={16} /> Voltar
    </button>
  );
  const cabecalho = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <ClipboardCheck size={22} color="var(--portal-text)" />
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Checklist do veículo</h1>
        <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>{placaFmt}{veicDesc ? ` · ${veicDesc}` : ''}</div>
      </div>
    </div>
  );
  const avisoErro = erro && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 0, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, marginBottom: 14 }}>
      <AlertTriangle size={16} /> {erro}
    </div>
  );

  if (carregando) return <div style={wrap}>{voltar}<div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text)' }}><Loader2 size={22} className="spin" /><div>Carregando…</div></div></div>;

  // ── Já concluído (qualquer dispositivo pode ver) ──
  if (concluido) {
    const suspeito = checklist.status === 'suspeito';
    return (
      <div style={wrap}>{voltar}{cabecalho}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <ShieldCheck size={20} color={suspeito ? '#b45309' : '#15803d'} />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>Checklist do mês já foi feito</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: suspeito ? '#fef3c7' : '#dcfce7', color: suspeito ? '#b45309' : '#15803d' }}>{suspeito ? 'Suspeito' : 'Completo'}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--portal-text)', lineHeight: 1.7 }}>
            Feito por <b style={{ color: 'var(--portal-text)' }}>{checklist.tecnico_nome || '—'}</b>
            {checklist.km != null ? <> · {Number(checklist.km).toLocaleString('pt-BR')} km</> : null}
            {checklist.score_confianca != null ? <> · score {checklist.score_confianca}%</> : null}
          </div>
          {checklist.share_token && (
            <a href={`/api/frota/checklist/print?token=${encodeURIComponent(checklist.share_token)}`} target="_blank" rel="noopener noreferrer"
              style={{ ...btnPrim, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', marginTop: 16, background: '#1b2230' }}>
              <FileText size={16} /> Abrir checklist (PDF)
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── DESKTOP: não deixa preencher — mostra perguntas + aviso ──
  if (!isMobile) {
    const cats = [...new Set(CHECKLIST_ITEMS.map((i) => i.cat))];
    return (
      <div style={wrap}>{voltar}{cabecalho}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px', borderRadius: 0, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', marginBottom: 18 }}>
          <Smartphone size={20} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            <b>Para realizar o checklist, use o portal na versão mobile.</b><br />
            Abra esta mesma tela pelo celular para tirar as fotos e responder. No computador dá só para conferir os checklists já feitos.
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
          Perguntas do checklist ({CHECKLIST_ITEMS.length})
        </div>
        {cats.map((cat) => (
          <div key={cat} style={{ ...card, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>{cat}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CHECKLIST_ITEMS.filter((i) => i.cat === cat).map((it) => (
                <div key={it.key} style={{ display: 'flex', gap: 8 }}>
                  <Camera size={15} color="var(--portal-text-muted)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--portal-text)' }}>{it.titulo}</div>
                    <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>{it.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── MOBILE: preenchimento ──
  // resultado
  if (fase === 'resultado' && resultado) {
    const suspeito = resultado.status === 'suspeito';
    return (
      <div style={wrap}>{cabecalho}
        <div style={{ ...card, textAlign: 'center' }}>
          <ShieldCheck size={40} color={suspeito ? '#b45309' : '#15803d'} style={{ margin: '0 auto 10px' }} />
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--portal-text)' }}>Checklist concluído!</div>
          <div style={{ fontSize: 14, color: 'var(--portal-text)', marginTop: 4 }}>Score de confiança: <b style={{ color: suspeito ? '#b45309' : '#15803d' }}>{resultado.score}%</b></div>
          {suspeito && <div style={{ fontSize: 13.5, color: '#b45309', marginTop: 8 }}>Marcado como suspeito — a gestão pode revisar.</div>}
          {resultado.share_token && (
            <a href={`/api/frota/checklist/print?token=${encodeURIComponent(resultado.share_token)}`} target="_blank" rel="noopener noreferrer" style={{ ...btnPrim, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', marginTop: 16, background: '#1b2230', width: 'auto', padding: '12px 20px' }}>
              <FileText size={16} /> Ver documento (PDF)
            </a>
          )}
          <button onClick={() => router.push('/frota/checklists')} style={{ ...btnPrim, marginTop: 12 }}>Voltar</button>
        </div>
      </div>
    );
  }

  // intro (mobile, sem checklist concluído)
  if (fase === 'intro') {
    const emAndamento = checklist && !concluido;
    return (
      <div style={wrap}>{voltar}{cabecalho}{avisoErro}
        <div style={card}>
          <div style={{ fontSize: 14, color: 'var(--portal-text)', lineHeight: 1.6, marginBottom: 16 }}>
            {emAndamento ? 'Continue o checklist deste mês.' : 'Você vai fazer o checklist mensal deste veículo.'} São <b>{CHECKLIST_ITEMS.length} itens</b>, cada um com <b>uma foto</b> e a resposta <b>OK</b> ou <b>Problema</b>.
          </div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase' }}>Hodômetro (KM) *</label>
          <input type="number" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Ex: 51486"
            style={{ width: '100%', padding: 14, borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 16, marginTop: 6, marginBottom: 16, boxSizing: 'border-box' }} />
          <button onClick={iniciar} disabled={busy || !km} style={{ ...btnPrim, opacity: busy || !km ? 0.5 : 1 }}>
            {busy ? 'Iniciando…' : (emAndamento ? 'Continuar checklist' : 'Iniciar checklist')}
          </button>
        </div>
      </div>
    );
  }

  // item
  if (fase === 'item') {
    const it = CHECKLIST_ITEMS[idx];
    const respondidos = CHECKLIST_ITEMS.filter((x) => itensSalvos[x.key]?.resposta).length;
    return (
      <div style={wrap}>{cabecalho}{avisoErro}
        <div style={{ height: 5, borderRadius: 999, background: 'var(--portal-border)', marginBottom: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(idx / CHECKLIST_ITEMS.length) * 100}%`, background: '#1e40af' }} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--portal-text)', marginBottom: 12 }}>Item {idx + 1} de {CHECKLIST_ITEMS.length} · {respondidos} respondidos</div>
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.4 }}>{it.cat}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--portal-text)', marginTop: 2 }}>{it.titulo}</div>
          <div style={{ fontSize: 13, color: 'var(--portal-text)', marginTop: 4, marginBottom: 14 }}>{it.desc}</div>

          <label style={{ display: 'block', position: 'relative', borderRadius: 0, overflow: 'hidden', border: '1px solid var(--portal-border)', marginBottom: 14, cursor: 'pointer', background: 'var(--portal-bg-secondary)' }}>
            {fotoPrev ? (
              <img src={fotoPrev} alt="" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text)', gap: 6 }}>
                <Camera size={30} /> <span style={{ fontSize: 13, fontWeight: 600 }}>Tocar para tirar a foto</span>
              </div>
            )}
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => escolherFoto(e.target.files?.[0] || null)} />
          </label>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <button onClick={() => setResposta('ok')} style={{ flex: 1, padding: 12, borderRadius: 0, cursor: 'pointer', fontWeight: 700, fontSize: 14, border: `1.5px solid ${resposta === 'ok' ? '#15803d' : 'var(--portal-border)'}`, background: resposta === 'ok' ? '#dcfce7' : 'var(--portal-bg-card)', color: resposta === 'ok' ? '#15803d' : 'var(--portal-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Check size={16} /> OK
            </button>
            <button onClick={() => setResposta('problema')} style={{ flex: 1, padding: 12, borderRadius: 0, cursor: 'pointer', fontWeight: 700, fontSize: 14, border: `1.5px solid ${resposta === 'problema' ? '#b91c1c' : 'var(--portal-border)'}`, background: resposta === 'problema' ? '#fee2e2' : 'var(--portal-bg-card)', color: resposta === 'problema' ? '#b91c1c' : 'var(--portal-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <X size={16} /> Problema
            </button>
          </div>

          <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder={resposta === 'problema' ? 'Descreva o problema' : 'Observação (opcional)'}
            style={{ width: '100%', minHeight: 60, padding: 12, borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', marginBottom: 14 }} />

          <div style={{ display: 'flex', gap: 10 }}>
            {idx > 0 && <button onClick={() => carregarItemNaTela(idx - 1)} disabled={busy} style={{ padding: '12px 18px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontWeight: 600, cursor: 'pointer' }}>Voltar</button>}
            <button onClick={salvarItem} disabled={busy} style={{ ...btnPrim, flex: 1, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Salvando…' : (idx < CHECKLIST_ITEMS.length - 1 ? 'Salvar e próximo' : 'Salvar e revisar')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // resumo
  const respondidos = CHECKLIST_ITEMS.filter((x) => itensSalvos[x.key]?.resposta);
  const problemas = respondidos.filter((x) => itensSalvos[x.key]?.resposta === 'problema').length;
  const faltam = CHECKLIST_ITEMS.length - respondidos.length;
  return (
    <div style={wrap}>{cabecalho}{avisoErro}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ ...card, flex: 1, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#15803d' }}>{respondidos.length}</div><div style={{ fontSize: 12, color: 'var(--portal-text)' }}>Respondidos</div></div>
        <div style={{ ...card, flex: 1, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#b91c1c' }}>{problemas}</div><div style={{ fontSize: 12, color: 'var(--portal-text)' }}>Problemas</div></div>
        <div style={{ ...card, flex: 1, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: faltam ? '#b45309' : 'var(--portal-text-muted)' }}>{faltam}</div><div style={{ fontSize: 12, color: 'var(--portal-text)' }}>Faltam</div></div>
      </div>
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {CHECKLIST_ITEMS.map((it, i) => {
          const s = itensSalvos[it.key];
          const prob = s?.resposta === 'problema';
          return (
            <button key={it.key} onClick={() => { carregarItemNaTela(i); setFase('item'); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', border: 'none', borderBottom: '1px solid var(--portal-border)', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: !s?.resposta ? '#d1d5db' : prob ? '#b91c1c' : '#15803d', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: 'var(--portal-text)' }}>{it.titulo}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: !s?.resposta ? 'var(--portal-text-muted)' : prob ? '#b91c1c' : '#15803d' }}>{!s?.resposta ? 'pendente' : prob ? 'Problema' : 'OK'}</span>
            </button>
          );
        })}
      </div>
      <button onClick={concluir} disabled={busy || faltam > 0} style={{ ...btnPrim, opacity: busy || faltam > 0 ? 0.5 : 1 }}>
        {busy ? 'Concluindo…' : faltam > 0 ? `Faltam ${faltam} itens` : 'Concluir checklist'}
      </button>
    </div>
  );
}
