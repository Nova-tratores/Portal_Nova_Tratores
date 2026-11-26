'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// "Regras do retorno" (Fase 2, 23/11/2026): a empresa ajusta a margem padrão por tipo de máquina e o prazo
// que uma venda tem para contar para a ação. Grava em mkt_parametros via /api/marketing/parametros.
import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { TIPOS_ACAO, rotulo } from '@/lib/marketing/tipos';
import Modal from './Modal';
import { apiGet, apiEnviar, Campo, estiloInput, BotaoRosa, Erro, estiloBotaoContorno } from './ui';

const ROTULO_MAQUINA: Record<string, string> = { trator: 'Trator', implemento: 'Implemento', autopropelido: 'Autopropelido', outro: 'Outro / sem tipo' };

export default function RegrasRetorno({ onSalvo }: { onSalvo: () => void }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('marketing', 'acoes:editar');
  const [aberto, setAberto] = useState(false);
  const [margem, setMargem] = useState<Record<string, string>>({});
  const [janela, setJanela] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    apiGet('/api/marketing/parametros').then((j: any) => {
      setMargem(Object.fromEntries(Object.entries(j.regras.margemPadraoPct).map(([k, v]) => [k, String(v)])));
      setJanela(Object.fromEntries(Object.entries(j.regras.janelaDias).map(([k, v]) => [k, v === null ? '' : String(v)])));
    }).catch((e: any) => setErro(e?.message || 'Não consegui carregar.'));
  }, [aberto]);

  const salvar = async () => {
    setSalvando(true); setErro(null);
    try {
      await apiEnviar('/api/marketing/parametros', 'PATCH', {
        margemPadraoPct: Object.fromEntries(Object.entries(margem).map(([k, v]) => [k, Number(String(v).replace(',', '.'))])),
        janelaDias: Object.fromEntries(Object.entries(janela).map(([k, v]) => [k, v === '' ? null : Number(v)])),
      });
      setAberto(false); onSalvo();
    } catch (e: any) { setErro(e?.message || 'Não consegui salvar.'); } finally { setSalvando(false); }
  };

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} style={{ ...estiloBotaoContorno, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Settings2 size={15} /> Regras do retorno
      </button>
      <Modal titulo="Regras do retorno" aberto={aberto} onFechar={() => setAberto(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13.5, color: 'var(--portal-text-muted)' }}>
            Retorno = <b>margem</b> das vendas ÷ o que a empresa gastou (menos o apoio recebido). Quando a proposta não tem o custo da máquina cadastrado, usa a margem padrão abaixo.
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Margem padrão (%)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {Object.keys(margem).map((k) => (
                <Campo key={k} label={ROTULO_MAQUINA[k] || k} largura="1 1 130px">
                  <input inputMode="decimal" disabled={!podeEditar} style={estiloInput} value={margem[k]} onChange={(e) => setMargem((m) => ({ ...m, [k]: e.target.value }))} />
                </Campo>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>Prazo para a venda contar (dias depois do fim da ação)</div>
            <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', marginBottom: 6 }}>0 = só durante a ação. Vazio = sem prazo.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {Object.keys(janela).map((k) => (
                <Campo key={k} label={rotulo(TIPOS_ACAO, k)} largura="1 1 130px">
                  <input inputMode="numeric" disabled={!podeEditar} style={estiloInput} value={janela[k]} onChange={(e) => setJanela((j) => ({ ...j, [k]: e.target.value.replace(/\D/g, '') }))} />
                </Campo>
              ))}
            </div>
          </div>
          {erro && <Erro>{erro}</Erro>}
          {podeEditar && <div style={{ display: 'flex', justifyContent: 'flex-end' }}><BotaoRosa onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</BotaoRosa></div>}
        </div>
      </Modal>
    </>
  );
}
