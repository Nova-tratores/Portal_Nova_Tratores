"use client";

import { useState } from "react";

interface ClientDrawerProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function ClientDrawer({ visible, onClose, onSaved }: ClientDrawerProps) {
  const [form, setForm] = useState({ nome: "", cpf: "", email: "", telefone: "", endereco: "", cidade: "" });
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!form.nome) { alert("Nome obrigatório"); return; }
    setSaving(true);
    await fetch("/api/pos/clientes/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    alert("Cliente cadastrado!");
    setForm({ nome: "", cpf: "", email: "", telefone: "", endereco: "", cidade: "" });
    onSaved();
    onClose();
  };

  if (!visible) return null;

  return (
    <div className="drawer-overlay active">
      <div className="modal-container">
        <div className="drawer" style={{ width: 600, display: "block" }}>
          <div style={{ padding: "25px 40px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafafa" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Novo Cliente Manual</div>
            <button style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer" }} onClick={onClose}>&times;</button>
          </div>
          <div style={{ padding: "30px 40px" }}>
            <label>Nome Completo</label><input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <label>CPF / CNPJ</label><input type="text" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            <label>E-mail</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label>Telefone</label><input type="text" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            <label>Endereço</label><input type="text" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
            <label>Cidade</label><input type="text" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
          </div>
          <div style={{ padding: "20px 40px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", background: "#fafafa" }}>
            <button onClick={salvar} disabled={saving} style={{ padding: "12px 30px", background: "#10B981", color: "white", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
              {saving ? "Salvando..." : "Cadastrar Cliente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
