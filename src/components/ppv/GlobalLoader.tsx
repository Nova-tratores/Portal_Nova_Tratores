"use client";

interface GlobalLoaderProps {
  visible: boolean;
}

export default function GlobalLoader({ visible }: GlobalLoaderProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-4 bg-[#FEF5EE]/90">
      <div className="h-[50px] w-[50px] animate-spin rounded-full border-[5px] border-orange-200 border-t-red-600" />
      <div className="text-sm font-semibold text-red-600">
        Carregando informações do pedido...
      </div>
    </div>
  );
}
