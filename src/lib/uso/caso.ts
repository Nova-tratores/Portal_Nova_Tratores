// Monitor de uso — casca da JORNADA no navegador (sessionStorage + fetch).
// Regras puras em ./jornada.ts. Ao servidor só vão os booleanos da transição;
// os hashes do caso ficam no sessionStorage da aba.
//
// Telas que abrem o registro numa janela sem mudar a URL avisam qual caso está
// aberto com `useMarcarCaso({ os, ppv, doc, chassi, … })` — é isso que permite
// dizer "foi atrás do MESMO caso em outra tela".
import { useEffect } from 'react';
import { authHeaders } from '@/lib/auth/client';
import {
  alvosDoCaso, descarregarPendente, extrairAlvos, lerEstado, marcarNoEstado, proximoPasso,
  type Caso, type EstadoJornada, type Transicao,
} from './jornada';

const CHAVE = 'portal-jornada';
let ultimoAuth: Record<string, string> | null = null;

function emIframe(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

function ler(): EstadoJornada | null {
  try { return lerEstado(sessionStorage.getItem(CHAVE)); } catch { return null; }
}

function gravar(e: EstadoJornada | null) {
  try { if (e) sessionStorage.setItem(CHAVE, JSON.stringify(e)); } catch { /* bloqueado */ }
}

/** authHeaders com cópia guardada — no `pagehide` não dá para esperar promessa. */
export async function cabecalhos(): Promise<Record<string, string>> {
  const h = await authHeaders();
  if (h.Authorization) ultimoAuth = h;
  return h;
}

async function enviar(lista: Transicao[], saindo = false) {
  if (!lista.length) return;
  let h = ultimoAuth;
  if (!saindo) { try { h = await cabecalhos(); } catch { /* usa a cópia */ } }
  if (!h?.Authorization) return;
  for (const t of lista) {
    fetch('/api/uso/pagina', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', ...h },
      body: JSON.stringify({ rota: t.para, de: t.de, gapS: t.gapS, mesmoAlvo: t.mesmoAlvo, volta: t.volta, soTransicao: true }),
    }).catch(() => {});
  }
}

/** Chamado pelo PortalLayout a cada troca de rota. */
export function entrarNaRota(pathname: string, search: string, agora: number) {
  if (emIframe()) return;
  const passo = proximoPasso(ler(), pathname, extrairAlvos(pathname, search), agora);
  gravar(passo.estado);
  void enviar(passo.enviar);
}

/** Soma hashes ao caso aberto na tela atual. */
export function marcarAlvos(alvos: string[]) {
  if (typeof window === 'undefined' || emIframe() || !alvos.length) return;
  const r = marcarNoEstado(ler(), window.location.pathname, alvos);
  gravar(r.estado);
  if (r.enviar) void enviar([r.enviar]);
}

export function marcarCaso(caso: Caso) {
  marcarAlvos(alvosDoCaso(caso));
}

/** Marca o caso enquanto a janela do registro está aberta (null = nada aberto). */
export function useMarcarCaso(caso: Caso | null | false | undefined) {
  const chave = caso ? JSON.stringify(caso) : '';
  useEffect(() => {
    if (chave) marcarCaso(JSON.parse(chave) as Caso);
  }, [chave]);
}

function descarregarAoSair() {
  const r = descarregarPendente(ler());
  gravar(r.estado);
  if (r.enviar) void enviar([r.enviar], true);
}

if (typeof window !== 'undefined') {
  const g = globalThis as unknown as { __jornadaSair?: boolean };
  if (!g.__jornadaSair) {
    g.__jornadaSair = true;
    window.addEventListener('pagehide', descarregarAoSair);
  }
}
