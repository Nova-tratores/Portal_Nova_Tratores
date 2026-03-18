"use client";

import { useState, useEffect, useRef } from "react";

interface SearchModalProps {
  title: string;
  placeholder: string;
  apiUrl: string;
  paramName: string;
  visible: boolean;
  onClose: () => void;
  onSelect: (item: { nome?: string; id?: string; descricao?: string }) => void;
  renderItem: (item: Record<string, string>) => string;
}

export default function SearchModal({ title, placeholder, apiUrl, paramName, visible, onClose, onSelect, renderItem }: SearchModalProps) {
  const [termo, setTermo] = useState("");
  const [results, setResults] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Auto-focus on open
  useEffect(() => {
    if (visible && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!visible) { setTermo(""); setResults([]); }
  }, [visible]);

  // Debounced search - auto-busca ao digitar
  useEffect(() => {
    if (!visible || termo.length < 2) { setResults([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`${apiUrl}?${paramName}=${encodeURIComponent(termo)}`);
      const data = await res.json();
      setResults(data);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [termo, visible, apiUrl, paramName]);

  if (!visible) return null;

  return (
    <div className="drawer-overlay active" style={{ zIndex: 1001 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="search-modal-container">
        <div className="search-modal-header">
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          <button className="search-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="search-modal-body">
          <div style={{ position: "relative", marginBottom: 12 }}>
            <i className="fas fa-search" style={{ position: "absolute", left: 14, top: 13, color: "#7A6E5D", fontSize: 15 }} />
            <input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              style={{ paddingLeft: 42, fontSize: 15, marginBottom: 0 }}
            />
          </div>
          <div className="search-modal-results">
            {loading ? (
              <div className="search-modal-msg"><div className="spinner-inner" style={{ width: 20, height: 20, borderColor: "var(--border)", borderTopColor: "var(--primary)" }} /> Buscando...</div>
            ) : termo.length < 2 ? (
              <div className="search-modal-msg" style={{ color: "#7A6E5D" }}>
                <i className="fas fa-keyboard" style={{ fontSize: 18, marginRight: 8 }} /> Digite ao menos 2 caracteres para buscar...
              </div>
            ) : results.length === 0 ? (
              <div className="search-modal-msg" style={{ color: "#7A6E5D" }}>Nenhum resultado encontrado</div>
            ) : (
              results.map((item, i) => (
                <div
                  key={i}
                  className="search-modal-item"
                  onClick={() => { onSelect(item); onClose(); setTermo(""); setResults([]); }}
                >
                  <i className="fas fa-cube" style={{ color: "var(--primary)", fontSize: 14, flexShrink: 0 }} />
                  <span style={{ fontSize: 14 }}>{renderItem(item)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
