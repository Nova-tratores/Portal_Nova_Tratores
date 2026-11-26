'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Janela da requisição DENTRO do Marketing (24/11/2026, José: "tem que mostrar o número da requisição e o PDF
// dela, NÃO REDIRECIONAR O PDF" + "quem solicitou" + "todas as coisas anexadas… as notas, produtos").
// Tudo é lido AO VIVO da requisição (GET /api/marketing/custos/requisicao?req_id=): nota anexada depois lá
// aparece aqui sozinha. Os documentos abrem num visualizador embutido, não em outra aba.
import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, Receipt } from 'lucide-react';
import Modal from './Modal';
import { apiGet, brl, dataBR, Vazio, Erro } from './ui';

type Doc = { chave: string; label: string; url: string; tipo: 'folha' | 'pdf' | 'imagem' };

const tipoDoArquivo = (url: string): 'pdf' | 'imagem' => (/\.pdf(\?|$)/i.test(url) ? 'pdf' : 'imagem');

export default function RequisicaoDoCusto({ reqId, onFechar }: { reqId: string | number | null; onFechar: () => void }) {
  // resposta guardada junto do nº que a pediu: trocou de requisição, o que está guardado não vale (sem setState no efeito)
  const [carga, setCarga] = useState<{ id: string; d?: any; erro?: string } | null>(null);
  const [escolhido, setEscolhido] = useState<{ id: string; chave: string } | null>(null);

  useEffect(() => {
    if (!reqId) return;
    const id = String(reqId);
    apiGet<any>(`/api/marketing/custos/requisicao?req_id=${encodeURIComponent(id)}`)
      .then((d) => setCarga({ id, d }))
      .catch((e) => setCarga({ id, erro: e?.message || 'Não foi possível abrir a requisição.' }));
  }, [reqId]);

  const atualCarga = carga && carga.id === String(reqId) ? carga : null;
  const d = atualCarga?.d ?? null;
  const erro = atualCarga?.erro ?? null;
  const aberto = escolhido && escolhido.id === String(reqId) ? escolhido.chave : 'folha';
  const setAberto = (chave: string) => setEscolhido({ id: String(reqId), chave });

  const r = d?.req;
  const docs: Doc[] = r ? [
    { chave: 'folha', label: 'Folha da requisição', url: `/requisicoes/imprimir/${r.id}?embed=1`, tipo: 'folha' },
    ...r.anexos.filter((a: any) => a.url).map((a: any, i: number) => ({ chave: `a${i}`, label: a.label, url: a.url, tipo: tipoDoArquivo(a.url) })),
  ] : [];
  const atual = docs.find((x) => x.chave === aberto) ?? docs[0];
  const presosNoDrive = r ? r.anexos.filter((a: any) => !a.url && a.noDrive) : [];

  return (
    <Modal titulo={r ? `Requisição #${r.id}` : `Requisição #${reqId ?? ''}`} aberto={!!reqId} onFechar={onFechar} largura={1000}>
      {erro ? <Erro>{erro}</Erro> : !r ? <Vazio>Carregando…</Vazio> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* cabeçalho: o que é, quem pediu, quanto */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(190px, 100%), 1fr))', gap: 10 }}>
            {[
              ['Pedida por', r.solicitante || 'não informado'],
              ['Valor', brl(r.valor)],
              ['Fornecedor', r.fornecedor || 'não informado'],
              ['Data', dataBR(r.data)],
              ['Situação', r.status || 'não informada'],
              ...(r.numero_nota ? [['Nota fiscal', r.numero_nota]] : []),
            ].map(([k, v]) => (
              <div key={k as string} style={{ padding: '8px 10px', border: '1px solid var(--portal-border)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>{k}</div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--portal-text)', overflowWrap: 'anywhere' }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--portal-text)' }}>{r.titulo}</div>

          {r.obs && (
            <div>
              <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)', marginBottom: 4 }}>Produtos e observações</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'var(--portal-text)', padding: '10px 12px', borderRadius: 8, background: 'var(--portal-bg)', maxHeight: 180, overflowY: 'auto' }}>{r.obs}</div>
            </div>
          )}

          {d.custos?.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>
              É custo de: {d.custos.map((c: any) => <b key={c.id} style={{ marginRight: 8 }}>{c.acao_nome}</b>)}
            </div>
          )}

          {/* escolha do documento + visualizador embutido */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {docs.map((x) => {
              const Ic = x.tipo === 'folha' ? FileText : x.tipo === 'pdf' ? Receipt : ImageIcon;
              const ativo = atual?.chave === x.chave;
              return (
                <button key={x.chave} type="button" onClick={() => setAberto(x.chave)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 13, borderRadius: 999, cursor: 'pointer',
                    border: `1px solid ${ativo ? '#DB2777' : 'var(--portal-border)'}`, background: ativo ? '#fdf2f8' : 'var(--portal-bg-card)', color: ativo ? '#9D174D' : 'var(--portal-text)' }}>
                  <Ic size={14} /> {x.label}
                </button>
              );
            })}
            {docs.length === 1 && <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)' }}>Nenhuma nota, boleto ou recibo anexado na requisição.</span>}
            {atual && (
              <a href={atual.tipo === 'folha' ? `/requisicoes/imprimir/${r.id}` : atual.url} target="_blank" rel="noopener noreferrer" title="Abrir em outra aba (para imprimir ou baixar)"
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#2563eb', textDecoration: 'none' }}>
                <ExternalLink size={13} /> outra aba
              </a>
            )}
          </div>
          {presosNoDrive.length > 0 && (
            <div style={{ fontSize: 12.5, color: '#b45309' }}>
              {presosNoDrive.map((a: any) => a.label).join(', ')}: arquivo antigo do Google Drive, abre só pela tela de Requisições.
            </div>
          )}

          {atual && (
            <div style={{ border: '1px solid var(--portal-border)', borderRadius: 8, overflow: 'hidden', background: '#f8fafc' }}>
              {atual.tipo === 'imagem' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={atual.url} alt={atual.label} style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', margin: '0 auto', objectFit: 'contain' }} />
              ) : (
                <iframe key={atual.url} src={atual.url} title={atual.label} style={{ display: 'block', width: '100%', height: '70vh', border: 'none', background: '#fff' }} />
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
