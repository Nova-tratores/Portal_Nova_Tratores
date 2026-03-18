"use client";

import { useState } from "react";

interface HeaderProps {
  searchTerm: string;
  onSearch: (term: string) => void;
  onNewOS: () => void;
  onNewClient: () => void;
  onGenerateReport: () => void;
  onSync?: () => Promise<void>;
  onLembretes?: () => void;
}

export default function Header({ searchTerm, onSearch, onNewOS, onNewClient, onGenerateReport, onSync, onLembretes }: HeaderProps) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!onSync || syncing) return;
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <header>
      <div className="brand-area">
        <div className="brand-icon"><i className="fas fa-tractor" /></div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>NOVA TRATORES</div>
      </div>
      <div className="search-box" style={{ position: "relative" }}>
        <i className="fas fa-search" style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: "#7A6E5D" }} />
        <input type="text" className="search-input" placeholder="Pesquisar cliente ou OS..." value={searchTerm} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <div className="header-actions">
        <button className="btn-top btn-report" onClick={handleSync} disabled={syncing} title="Sincronizar clientes e projetos do Omie">
          <i className={`fas fa-sync-alt${syncing ? " fa-spin" : ""}`} /> {syncing ? "SINCRONIZANDO..." : "SINCRONIZAR"}
        </button>
        <button className="btn-top btn-lembretes" onClick={onLembretes}><i className="fas fa-bell" /> LEMBRETES</button>
        <button className="btn-top btn-report" onClick={onGenerateReport}><i className="fas fa-file-invoice" /> GERAR RELATÓRIO</button>
        <button className="btn-top btn-cli" onClick={onNewClient}><i className="fas fa-user-plus" /> CRIAR CLIENTE</button>
        <button className="btn-top btn-new" onClick={onNewOS}><i className="fas fa-plus" /> NOVA ORDEM</button>
      </div>
    </header>
  );
}
