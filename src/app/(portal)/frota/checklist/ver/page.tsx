'use client';
// Checklist de veículo para ler/imprimir. O documento vem de
// /api/frota/checklist/print, que exige login (desde 21/10/2026): a página
// busca o HTML com o login de quem está no portal e mostra num iframe. O
// layout da Frota já barra quem não tem o módulo.
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';

function Documento() {
  const token = useSearchParams()?.get('token') || '';
  const [html, setHtml] = useState('');
  const [erro, setErro] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/frota/checklist/print?token=${encodeURIComponent(token)}`, { headers: await authHeaders() });
        const texto = await r.text();
        if (!vivo) return;
        if (r.ok) setHtml(texto);
        else setErro(r.status === 404 ? 'Checklist não encontrado.' : r.status === 403 ? 'Você não tem permissão para ver checklists da Frota.' : 'Não foi possível abrir o checklist.');
      } catch {
        if (vivo) setErro('Não foi possível abrir o checklist.');
      }
    })();
    return () => { vivo = false; };
  }, [token]);

  if (!token) return <p style={{ padding: 24, color: 'var(--portal-text)' }}>Link sem o código do checklist.</p>;
  if (erro) return <p style={{ padding: 24, color: '#b91c1c' }}>{erro}</p>;
  if (!html) return <p style={{ padding: 24, color: 'var(--portal-text)' }}>Abrindo o checklist…</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 84px)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px' }}>
        <button
          onClick={() => frame.current?.contentWindow?.print()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', background: '#1e40af', color: '#fefefe', fontWeight: 700, cursor: 'pointer' }}
        >
          <Printer size={15} /> Imprimir / salvar PDF
        </button>
      </div>
      {/* fundo branco fixo: o documento é sempre claro, como no papel */}
      <iframe ref={frame} srcDoc={html} title="Checklist do veículo" style={{ flex: 1, width: '100%', border: 'none', background: '#fefefe' }} />
    </div>
  );
}

export default function VerChecklistPage() {
  return (
    <Suspense fallback={null}>
      <Documento />
    </Suspense>
  );
}
