import { useEffect, useRef } from "react";

// Dispara `callback` quando a tecla `tecla` é pressionada 2x em < 500ms.
// Porta os atalhos secretos QQ (imagem) e EE (editar zonas) do app legado.
// Ignora quando o foco está em input/textarea/select.
export function useAtalhoDuplo(tecla: string, callback: () => void) {
  const ultimo = useRef(0);
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const tag = alvo?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || alvo?.isContentEditable) return;
      if (e.key.toLowerCase() !== tecla.toLowerCase()) return;
      const agora = Date.now();
      if (agora - ultimo.current < 500) {
        ultimo.current = 0;
        cbRef.current();
      } else {
        ultimo.current = agora;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tecla]);
}
