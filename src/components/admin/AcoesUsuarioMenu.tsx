'use client';
// Ações da conta num menu "⋯" (José, 21/10/2026: "melhora esses botões") — resetar senha, trocar e-mail, inativar.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, KeyRound, Mail, Ban } from 'lucide-react';

interface Props { podeInativar: boolean; motivo?: string; onResetar: () => void; onEmail: () => void; onInativar: () => void }

export default function AcoesUsuarioMenu({ podeInativar, motivo, onResetar, onEmail, onInativar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('.au-menu') && !btn.current?.contains(e.target as Node)) setAberto(false); };
    const sair = () => setAberto(false);
    document.addEventListener('mousedown', fechar); window.addEventListener('scroll', sair, true);
    return () => { document.removeEventListener('mousedown', fechar); window.removeEventListener('scroll', sair, true); };
  }, [aberto]);
  const abrir = () => { const r = btn.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 6, left: r.right - 220 }); setAberto((v) => !v); };
  const item = (ic: React.ReactNode, rot: string, fn: () => void, perigo = false, off = false, dica?: string) => (
    <button type="button" className={`aum-it ${perigo ? 'p' : ''}`} disabled={off} title={dica} onClick={() => { setAberto(false); fn(); }}>{ic}<span>{rot}</span></button>
  );
  return (
    <>
      <style>{ESTILO_AUM}</style>
      <button ref={btn} type="button" className={`aum-btn ${aberto ? 'on' : ''}`} onClick={abrir} aria-label="Ações da conta" title="Ações da conta"><MoreHorizontal size={18} /></button>
      {aberto && pos && createPortal(
        <div className="au-menu" style={{ top: pos.top, left: Math.max(8, pos.left) }}>
          <style>{ESTILO_AUM}</style>
          {item(<KeyRound size={15} />, 'Enviar redefinição de senha', onResetar)}
          {item(<Mail size={15} />, 'Trocar e-mail de login', onEmail)}
          <div className="aum-sep" />
          {item(<Ban size={15} />, 'Inativar conta', onInativar, true, !podeInativar, motivo)}
        </div>, document.body)}
    </>
  );
}

const ESTILO_AUM = `
@keyframes aumEntra { from { opacity: 0; transform: translateY(-6px) } }
.aum-btn { width: 36px; height: 36px; border-radius: 50%; border: 1px solid #e2e8f0; background: #fefefe; color: #475569; display: grid; place-items: center; cursor: pointer; transition: all .15s } .aum-btn:hover, .aum-btn.on { border-color: #0f172a; color: #0f172a; box-shadow: 0 4px 12px rgba(15,23,42,.10) }
.au-menu { position: fixed; z-index: 100200; width: 220px; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 14px; padding: 6px; box-shadow: 0 20px 50px rgba(15,23,42,.22); animation: aumEntra .16s both; font-family: inherit }
.aum-it { width: 100%; display: flex; align-items: center; gap: 10px; border: none; background: none; border-radius: 9px; padding: 9px 10px; font-family: inherit; font-size: 13.5px; color: #0f172a; cursor: pointer; text-align: left } .aum-it:hover:not(:disabled) { background: #f1f5f9 } .aum-it svg { color: #64748b }
.aum-it.p, .aum-it.p svg { color: #dc2626 } .aum-it.p:hover:not(:disabled) { background: #fef2f2 } .aum-it:disabled { opacity: .45; cursor: not-allowed }
.aum-sep { height: 1px; background: #f1f5f9; margin: 4px }
`;
