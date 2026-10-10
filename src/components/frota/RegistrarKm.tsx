'use client';
// "Registrar km com foto" — feito para o celular: foto do painel, o número,
// confere e salva. Sem sinal, guarda na fila e envia sozinho depois.
// A conferência (voltou? saltou? dígito trocado?) é a mesma do servidor
// (validarLeitura em lib/frota/km.ts), feita ANTES de salvar.
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Gauge, Loader2, WifiOff, X } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';
import { validarLeitura, type ResultadoKm, type ValidacaoLeitura } from '@/lib/frota/km';
import { comprimirFoto, enfileirar, enviarLeitura, semRede, type LeituraPendente } from '@/lib/frota/fila-leituras';
import { AZUL_FROTA } from '@/components/frota/ui';

interface KmDoCarro {
  resultado: ResultadoKm;
  ancora: { km: number; em: string } | null;
  tipo: string;
}

const fmtKm = (n: number) => Math.round(n).toLocaleString('pt-BR');
const COR_SELO: Record<string, string> = { verde: '#15803d', ambar: '#b45309', vermelho: '#b91c1c', cinza: '#64748b' };

export default function RegistrarKm({ placa: placaInicial, placas, onClose, onSalvo }: {
  placa?: string | null;
  /** quando não vem a placa: lista para escolher o carro */
  placas?: { placa: string; rotulo: string }[];
  onClose: () => void;
  onSalvo?: () => void;
}) {
  const [placa, setPlaca] = useState(placaInicial || '');
  const [atual, setAtual] = useState<KmDoCarro | null>(null);
  const [foto, setFoto] = useState<{ blob: Blob; dataUrl: string } | null>(null);
  const [km, setKm] = useState('');
  const [conferencia, setConferencia] = useState<ValidacaoLeitura | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [fim, setFim] = useState<{ tom: 'ok' | 'aviso' | 'fila' | 'erro'; texto: string } | null>(null);
  const [erroFoto, setErroFoto] = useState('');
  const local = useRef<{ lat: number; lng: number } | null>(null);

  // km atual do carro (para mostrar "último: X" e conferir o novo)
  useEffect(() => {
    if (!placa) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/frota/km?placa=${encodeURIComponent(placa)}`, { headers: await authHeaders() });
        if (r.ok && vivo) setAtual((await r.json()) as KmDoCarro);
      } catch { /* sem rede: segue sem a referência */ }
    })();
    return () => { vivo = false; };
  }, [placa]);

  // posição (opcional): ajuda a conferir onde a foto foi tirada
  useEffect(() => {
    try {
      navigator.geolocation?.getCurrentPosition(
        (p) => { local.current = { lat: p.coords.latitude, lng: p.coords.longitude }; },
        () => { /* negou ou sem GPS: segue */ },
        { timeout: 5000, maximumAge: 600000 },
      );
    } catch { /* navegador sem geolocalização */ }
  }, []);

  const kmNum = Number(km.replace(/\D/g, ''));

  const escolherFoto = async (f: File | null) => {
    setErroFoto('');
    if (!f) return;
    try { setFoto(await comprimirFoto(f)); } catch (e) { setErroFoto((e as Error).message); }
  };

  const conferir = () => {
    const v = validarLeitura({ km: kmNum, em: new Date().toISOString() }, {
      anterior: atual?.ancora || null, esperado: atual?.resultado.km ?? null, tipo: atual?.tipo,
    });
    setConferencia(v);
    return v;
  };

  const salvar = async () => {
    if (!placa || !foto || !kmNum) return;
    setSalvando(true);
    const leitura: LeituraPendente = {
      client_uuid: crypto.randomUUID(), placa, km: kmNum, lida_em: new Date().toISOString(),
      foto_data_url: foto.dataUrl, lat: local.current?.lat ?? null, lng: local.current?.lng ?? null,
    };
    try {
      const r = await enviarLeitura(leitura, foto.blob);
      if (r.error) {
        setFim({ tom: 'erro', texto: r.error });
      } else if (r.situacao === 'suspeita') {
        setFim({ tom: 'aviso', texto: `Salvo para conferência: ${(r.motivos || []).join(' ')} Alguém da frota vai confirmar.` });
        onSalvo?.();
      } else {
        setFim({ tom: 'ok', texto: `${fmtKm(kmNum)} km registrados no ${formatarPlaca(placa)}.` });
        onSalvo?.();
      }
    } catch (e) {
      if (semRede(e) && enfileirar(leitura)) {
        setFim({ tom: 'fila', texto: 'Sem sinal agora. A leitura ficou guardada no celular e vai sozinha quando a internet voltar.' });
      } else {
        setFim({ tom: 'erro', texto: semRede(e) ? 'Sem sinal e a fila do celular está cheia. Tente de novo com internet.' : (e as Error).message });
      }
    } finally {
      setSalvando(false);
    }
  };

  const botao: React.CSSProperties = { width: '100%', minHeight: 52, border: 'none', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 };

  return (
    <div role="dialog" aria-modal="true" aria-label="Registrar km do painel"
      onClick={(e) => { if (e.target === e.currentTarget && !salvando) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 10600, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 460, maxHeight: '94vh', overflowY: 'auto', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Gauge size={20} color={AZUL_FROTA} />
          <strong style={{ flex: 1, fontSize: 17, color: 'var(--portal-text)' }}>Registrar km do painel</strong>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ width: 40, height: 40, border: 'none', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {fim ? (
          <>
            <div style={{
              padding: '14px 16px', fontSize: 15, lineHeight: 1.4,
              background: fim.tom === 'ok' ? 'rgba(21,128,61,.12)' : fim.tom === 'erro' ? 'rgba(185,28,28,.12)' : 'rgba(180,83,9,.12)',
              color: fim.tom === 'ok' ? '#15803d' : fim.tom === 'erro' ? '#b91c1c' : '#b45309',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              {fim.tom === 'fila' ? <WifiOff size={20} /> : <Check size={20} />}
              <span>{fim.texto}</span>
            </div>
            <button type="button" onClick={onClose} style={{ ...botao, background: AZUL_FROTA, color: '#fff' }}>Fechar</button>
          </>
        ) : (
          <>
            {!placaInicial && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>
                Veículo
                <select value={placa} onChange={(e) => { setPlaca(e.target.value); setAtual(null); setConferencia(null); }}
                  style={{ minHeight: 48, fontSize: 16, padding: '0 10px', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)' }}>
                  <option value="">Escolha o carro…</option>
                  {(placas || []).map((p) => <option key={p.placa} value={p.placa}>{p.rotulo}</option>)}
                </select>
              </label>
            )}

            {placa && (
              <div style={{ fontSize: 13.5, color: 'var(--portal-text-secondary)' }}>
                <strong style={{ color: 'var(--portal-text)', fontSize: 15 }}>{formatarPlaca(placa)}</strong>
                {atual?.resultado.km != null ? (
                  <> · último km conhecido <strong style={{ color: COR_SELO[atual.resultado.selo] }}>{fmtKm(atual.resultado.km)}</strong> ({atual.resultado.descricao})</>
                ) : atual ? <> · sem km conhecido</> : null}
              </div>
            )}

            <label style={{ ...botao, background: foto ? 'var(--portal-bg-secondary)' : AZUL_FROTA, color: foto ? 'var(--portal-text)' : '#fff', position: 'relative' }}>
              <Camera size={20} /> {foto ? 'Trocar a foto do painel' : 'Tirar foto do painel'}
              <input type="file" accept="image/*" capture="environment" onChange={(e) => escolherFoto(e.target.files?.[0] || null)}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Foto do painel" />
            </label>
            {erroFoto && <span style={{ color: '#b91c1c', fontSize: 13 }}>{erroFoto}</span>}
            {foto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto.dataUrl} alt="Foto do painel" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', background: '#000' }} />
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>
              Km que aparece no painel
              <input inputMode="numeric" autoComplete="off" value={km} placeholder="ex.: 48320"
                onChange={(e) => { setKm(e.target.value.replace(/\D/g, '').slice(0, 7)); setConferencia(null); }}
                style={{ minHeight: 56, fontSize: 26, fontWeight: 800, padding: '0 12px', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }} />
            </label>

            {conferencia?.situacao === 'suspeita' && (
              <div style={{ padding: '12px 14px', background: 'rgba(180,83,9,.12)', color: '#b45309', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span>{conferencia.motivos.join(' ')}</span>
                {conferencia.sugestao != null && (
                  <button type="button" onClick={() => { setKm(String(conferencia.sugestao)); setConferencia(null); }}
                    style={{ ...botao, minHeight: 44, background: 'var(--portal-bg-card)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}>
                    Você quis dizer {fmtKm(conferencia.sugestao)} km?
                  </button>
                )}
              </div>
            )}

            {conferencia ? (
              <button type="button" disabled={salvando} onClick={salvar}
                style={{ ...botao, background: conferencia.situacao === 'aceita' ? '#15803d' : '#b45309', color: '#fff' }}>
                {salvando ? <Loader2 size={20} className="spin" /> : <Check size={20} />}
                {conferencia.situacao === 'aceita' ? `${fmtKm(kmNum)} km, confere — salvar` : 'O número está certo — salvar assim'}
              </button>
            ) : (
              <button type="button" disabled={!placa || !foto || kmNum < 100} onClick={conferir}
                style={{ ...botao, background: AZUL_FROTA, color: '#fff', opacity: !placa || !foto || kmNum < 100 ? 0.5 : 1 }}>
                Conferir
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
