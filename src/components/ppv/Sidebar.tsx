"use client";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onCriarProduto: () => void;
  onEditarProduto: () => void;
}

export default function Sidebar({ activeTab, onTabChange, onCriarProduto, onEditarProduto }: SidebarProps) {
  return (
    <aside className="z-20 flex w-[280px] shrink-0 flex-col bg-red-900 p-6 text-white shadow-[5px_0_15px_rgba(0,0,0,0.1)]">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-orange-500 text-2xl text-white">
          <i className="fas fa-file-invoice-dollar" />
        </div>
        <div className="text-xl font-bold tracking-wide">
          NOVA <span className="font-normal">PPV</span>
        </div>
      </div>

      <button
        onClick={() => onTabChange("formTab")}
        className="mb-5 flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border-none bg-gradient-to-br from-red-600 to-orange-500 px-5 py-4 text-base font-semibold text-white transition-transform hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(220,38,38,0.4)]"
      >
        <i className="fas fa-plus-circle text-lg" /> NOVO LANÇAMENTO
      </button>

      <button
        onClick={onCriarProduto}
        className="mb-5 flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border-none bg-gradient-to-br from-orange-500 to-orange-600 px-5 py-4 text-base font-semibold text-white transition-transform hover:-translate-y-0.5"
      >
        <i className="fas fa-box-open text-lg" /> CRIAR PRODUTO
      </button>

      <button
        onClick={onEditarProduto}
        className="mb-5 flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border-none bg-gradient-to-br from-orange-600 to-amber-600 px-5 py-4 text-base font-semibold text-white transition-transform hover:-translate-y-0.5"
      >
        <i className="fas fa-edit text-lg" /> EDITAR PRODUTO
      </button>

      <div className="mt-4 mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-red-300/60">
        Navegação
      </div>

      <div
        onClick={() => onTabChange("kanbanTab")}
        className={`mb-2 flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] font-medium transition-colors ${
          activeTab === "kanbanTab"
            ? "bg-white/15 text-white"
            : "text-red-200/60 hover:bg-white/10 hover:text-white"
        }`}
      >
        <i className="fas fa-th-large text-base" /> Gestão de Vendas
      </div>

      <div
        onClick={() => onTabChange("catalogoTab")}
        className={`mb-2 flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] font-medium transition-colors ${
          activeTab === "catalogoTab"
            ? "bg-white/15 text-white"
            : "text-red-200/60 hover:bg-white/10 hover:text-white"
        }`}
      >
        <i className="fas fa-cogs text-base" /> Catálogo de Peças
      </div>
    </aside>
  );
}
