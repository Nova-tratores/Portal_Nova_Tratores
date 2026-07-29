"use client";
// Detecta tela de celular (largura <= 768px) pra escolher a versão MOBILE de uma
// tela. É por LARGURA (matchMedia), não por user-agent — celular em pé/deitado e
// PC com janela estreita respondem certo. No PC (janela larga) sempre é false,
// então a experiência de desktop de hoje NÃO muda.
import { useEffect, useState } from "react";

export function useIsMobile(maxWidth = 768): boolean {
  // Começa null pra não "piscar" a versão errada; enquanto null, o chamador usa
  // o desktop (SSR não tem window). Depois do mount decide de verdade.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [maxWidth]);

  return isMobile;
}
