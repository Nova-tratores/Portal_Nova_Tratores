'use client';
// Janela de mudar a etapa da OS da frota, com as travas de campo:
//   entrar na oficina → km + foto do painel
//   aguardando peça   → qual peça + previsão
//   entregar o carro  → km + foto do painel + quem retirou
//   cancelar          → motivo
// A regra é a mesma do servidor (validarMudanca em lib/frota/oficina.ts).
import { useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { comprimirFoto, subirFoto } from '@/lib/frota/fila-leituras';
import { diaBR } from '@/lib/frota/mapa-vivo';
import { ETAPA_INFO, validarMudanca, type EtapaOS } from '@/lib/frota/oficina';
import { formatarPlaca } from '@/lib/frota/placa';
import { Janela, botao, campo, fmtKm, postOficina, rotulo, type OsFrota } from './comum';

const TITULO: Partial<Record<EtapaOS, string>> = {
  em_oficina: 'Entrar na oficina',
  aguardando_peca: 'Aguardando peça',
  pronta: 'Carro pronto',
  concluida: 'Entregar o carro',
  cancelada: 'Cancelar a OS',
};

export default function MudarEtapa({ os, para, onFechar, onFeito }: {
  os: OsFrota; para: EtapaOS; onFechar: () => void; onFeito: (msg: string) => void;
}) {
  const hoje = diaBR();
  const pedeKm = (para === 'em_oficina' && os.etapa === 'aberta') || para === 'concluida';
  const [km, setKm] = useState('');
  const [foto, setFoto] = useState<{ blob: Blob; dataUrl: string } | null>(null);
  const [peca, setPeca] = useState(os.peca || '');
  const [previsao, setPrevisao] = useState(os.previsao_peca && os.previsao_peca >= hoje ? os.previsao_peca : '');
  const [retirado, setRetirado] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const kmNum = Number(km.replace(/\D/g, '')) || null;
  const itensAbertos = os.itens.filter((i) => !i.feito).length;

  const confirmar = async () => {
    setErro('');
    const dados = { km: kmNum, foto_url: foto ? 'local' : null, peca, previsao_peca: previsao, retirado_por: retirado, motivo };
    const e = validarMudanca(os, para, dados, hoje);
    if (e) { setErro(e); return; }
    setSalvando(true);
    try {
      let fotoUrl: string | null = null;
      if (pedeKm && foto) fotoUrl = await subirFoto(os.placa, crypto.randomUUID(), foto.blob);
      const r = await postOficina({
        acao: 'mover', id: os.id, para, km: kmNum, foto_url: fotoUrl, peca, previsao_peca: previsao, retirado_por: retirado, motivo,
      });
      if (r.error) { setErro(r.error); return; }
      const resumo = r.resumo as { resolvidas: number; servicos: number; naoFeitos: number } | null;
      onFeito(resumo
        ? `${os.rotulo} entregue. ${resumo.resolvidas} pendência(s) resolvida(s), ${resumo.servicos} preventiva(s) registrada(s)${resumo.naoFeitos ? `, ${resumo.naoFeitos} item(ns) continuam abertos` : ''}.`
        : `${os.rotulo}: ${ETAPA_INFO[para].label}.`);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Janela titulo={`${TITULO[para] || ETAPA_INFO[para].label} · ${os.rotulo} · ${formatarPlaca(os.placa)}`} onFechar={onFechar}
      rodape={<>
        <button type="button" onClick={onFechar} style={botao()}>Voltar</button>
        <button type="button" onClick={confirmar} disabled={salvando} style={botao(para === 'cancelada' ? 'perigo' : 'primario')}>
          {salvando && <Loader2 size={15} className="animate-spin" />}{para === 'cancelada' ? 'Cancelar a OS' : `Confirmar: ${ETAPA_INFO[para].label}`}
        </button>
      </>}>
      {pedeKm && (
        <>
          <label style={rotulo}>
            Km no painel {os.km_entrada && para === 'concluida' ? <span style={{ fontWeight: 400 }}>(entrou com {fmtKm(os.km_entrada)})</span> : null}
            <input id="oficina-km" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Ex.: 48.320" style={campo} />
          </label>
          <label style={{ ...botao(foto ? 'secundario' : 'primario'), position: 'relative' }}>
            <Camera size={18} /> {foto ? 'Trocar a foto do painel' : 'Tirar foto do painel'}
            <input type="file" accept="image/*" capture="environment" aria-label="Foto do painel"
              onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setFoto(await comprimirFoto(f)); } catch (er) { setErro((er as Error).message); } }}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </label>
          {foto && <img src={foto.dataUrl} alt="Foto do painel" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', background: '#000' }} />}
        </>
      )}
      {para === 'concluida' && (
        <>
          <label style={rotulo}>
            Quem retirou o carro
            <input id="oficina-retirado" value={retirado} onChange={(e) => setRetirado(e.target.value)} placeholder="Nome de quem levou o carro" style={campo} />
          </label>
          {itensAbertos > 0 && (
            <p style={{ margin: 0, fontSize: 13, color: '#b45309' }}>
              {itensAbertos} item(ns) não foram marcados como feitos. As pendências deles continuam abertas no carro.
            </p>
          )}
        </>
      )}
      {para === 'aguardando_peca' && (
        <>
          <label style={rotulo}>
            Qual peça está faltando
            <input id="oficina-peca" value={peca} onChange={(e) => setPeca(e.target.value)} placeholder="Ex.: cilindro do freio traseiro" style={campo} />
          </label>
          <label style={rotulo}>
            Previsão de chegada
            <input id="oficina-previsao" type="date" min={hoje} value={previsao} onChange={(e) => setPrevisao(e.target.value)} style={campo} />
          </label>
        </>
      )}
      {para === 'cancelada' && (
        <label style={rotulo}>
          Por que a OS foi cancelada
          <textarea id="oficina-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} style={campo} />
        </label>
      )}
      {para === 'pronta' && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--portal-text)' }}>O carro deixa de contar como parado. A OS fecha quando o carro for entregue.</p>}
      {para === 'em_oficina' && os.etapa !== 'aberta' && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--portal-text)' }}>A OS volta para Em oficina.</p>}
      {erro && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b91c1c', fontWeight: 700 }}>{erro}</p>}
    </Janela>
  );
}
