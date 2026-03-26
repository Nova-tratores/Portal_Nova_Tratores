"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import SemPermissao from "@/components/SemPermissao";
import { Trator, REVISOES_LISTA } from "@/lib/revisoes/types";
import { calcularPrevisao } from "@/lib/revisoes/utils";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";

interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  part: string;
}

interface EmailRevisao {
  subject: string;
  date: string;
  uid: number;
  horas: string | null;
  modelo: string | null;
  chassisFinal: string | null;
  attachments: EmailAttachment[];
  body: string;
}

interface Destinatario {
  nome: string;
  email: string;
}

const DESTINATARIOS_FIXOS: Destinatario[] = [
  { nome: "Marcel", email: "marcel.ochsenhofer@mahindrabrazil.com" },
  { nome: "Vinicius", email: "ferreira.Vinicius@mahindrabrazil.com" },
];

// Persistência de destinatários no Supabase (antes era localStorage e sumia)
async function loadDestinatariosSupabase(): Promise<Destinatario[]> {
  try {
    const { data } = await supabase
      .from("revisao_destinatarios")
      .select("nome, email")
      .order("nome", { ascending: true });
    const extras = (data || []) as Destinatario[];
    // Mescla fixos + extras do banco (sem duplicar)
    const emailsFixos = new Set(DESTINATARIOS_FIXOS.map(d => d.email.toLowerCase()));
    return [...DESTINATARIOS_FIXOS, ...extras.filter(d => !emailsFixos.has(d.email.toLowerCase()))];
  } catch {
    return [...DESTINATARIOS_FIXOS];
  }
}

async function saveDestinatarioSupabase(dest: Destinatario): Promise<boolean> {
  const { error } = await supabase
    .from("revisao_destinatarios")
    .upsert({ nome: dest.nome, email: dest.email }, { onConflict: "email" });
  return !error;
}

async function removeDestinatarioSupabase(email: string): Promise<boolean> {
  const { error } = await supabase
    .from("revisao_destinatarios")
    .delete()
    .eq("email", email);
  return !error;
}

function formatarData(valor: string | undefined | null): string {
  if (!valor) return "—";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) return valor;
  const d = new Date(valor);
  if (isNaN(d.getTime())) return valor;
  return d.toLocaleDateString("pt-BR");
}

function DashboardAgrupadoInner() {
  const { log: auditLog } = useAuditLog();
  const [tratores, setTratores] = useState<Trator[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [selecionado, setSelecionado] = useState<Trator | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msgEnvio, setMsgEnvio] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [emails, setEmails] = useState<EmailRevisao[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [emailsCarregados, setEmailsCarregados] = useState(false);
  const [emailExpandido, setEmailExpandido] = useState<string | null>(null);
  const [tabModal, setTabModal] = useState<"timeline" | "emails" | "enviar">("timeline");
  const [revisaoEnvio, setRevisaoEnvio] = useState("");
  const [nomeRemetente, setNomeRemetente] = useState("");
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
  const [destinatariosSelecionados, setDestinatariosSelecionados] = useState<Set<string>>(
    new Set(DESTINATARIOS_FIXOS.map(d => d.email))
  );
  const [novoDestNome, setNovoDestNome] = useState("");
  const [novoDestEmail, setNovoDestEmail] = useState("");
  const [horimetroEnvio, setHorimetroEnvio] = useState("");
  const [editandoMotor, setEditandoMotor] = useState(false);
  const [motorTemp, setMotorTemp] = useState("");
  const [showNovoTrator, setShowNovoTrator] = useState(false);
  const [novoTrator, setNovoTrator] = useState<Partial<Trator>>({});
  const [salvandoTrator, setSalvandoTrator] = useState(false);
  const [msgNovoTrator, setMsgNovoTrator] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    loadDestinatariosSupabase().then(setDestinatarios);
  }, []);

  const fetchEmails = async (forceRefresh = false) => {
    setLoadingEmails(true);
    try {
      const res = await fetch(`/api/revisoes/emails${forceRefresh ? "?refresh=1" : ""}`);
      if (!res.ok) throw new Error("Erro ao buscar emails");
      const data = await res.json();
      setEmails(prev => {
        const serverKeys = new Set(
          data.emails.map((e: EmailRevisao) => `${e.chassisFinal}-${e.horas}`)
        );
        const otimistasRestantes = prev.filter(
          e => e.uid > 1_000_000_000 && !serverKeys.has(`${e.chassisFinal}-${e.horas}`)
        );
        return [...data.emails, ...otimistasRestantes];
      });
      setEmailsCarregados(true);
    } catch {
      console.error("Falha ao buscar emails do Gmail.");
    } finally {
      setLoadingEmails(false);
    }
  };

  // Refresh ao voltar para a aba
  const refreshRevisoes = useCallback(async () => {
    const { data } = await supabase.from("tratores").select("*").order("Cliente", { ascending: true });
    if (data) setTratores(data);
  }, []);
  useRefreshOnFocus(refreshRevisoes);

  // Carregar tratores do Supabase (rápido) e emails do Gmail (lento) separadamente
  useEffect(() => {
    const fetchTratores = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tratores")
        .select("*")
        .order("Cliente", { ascending: true });
      if (error) {
        setErro("Falha ao carregar dados. Verifique sua conexão.");
      } else if (data) {
        setTratores(data);
      }
      setLoading(false);
    };
    fetchTratores();
    // Emails carregam em background — não bloqueiam a tela
    fetchEmails();
  }, []);

  // Mapa de emails por sufixo de chassis (últimos 4 dígitos) para evitar O(emails×tratores) a cada render
  const emailsByChassisSuffix = useMemo(() => {
    const map = new Map<string, EmailRevisao[]>();
    for (const e of emails) {
      if (!e.chassisFinal) continue;
      // Normalizar para últimos 4 dígitos para bater com chassis.slice(-4)
      const key = e.chassisFinal.slice(-4);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [emails]);

  const emailsDoChassis = useCallback((chassis: string): EmailRevisao[] => {
    if (!chassis) return [];
    const suffix = chassis.slice(-4);
    return emailsByChassisSuffix.get(suffix) || [];
  }, [emailsByChassisSuffix]);

  const emailDaRevisao = useCallback((chassis: string, rev: string): EmailRevisao | null => {
    const horasRev = rev.replace("h", "");
    return emailsDoChassis(chassis).find(e => e.horas === horasRev) || null;
  }, [emailsDoChassis]);

  const grupos = useMemo(() => {
    let filtrados = tratores;

    if (busca) {
      filtrados = filtrados.filter(t =>
        (t.Chassis ?? "").toLowerCase().includes(busca.toLowerCase()) ||
        (t.Cliente ?? "").toLowerCase().includes(busca.toLowerCase()) ||
        (t.Numero_Motor ?? "").toLowerCase().includes(busca.toLowerCase())
      );
    }

    if (filtroCliente) {
      filtrados = filtrados.filter(t =>
        (t.Cliente || "Sem Cliente").toLowerCase().includes(filtroCliente.toLowerCase())
      );
    }

    return filtrados.reduce((acc, trator) => {
      const nomeCliente = trator.Cliente || "Cliente Não Identificado";
      if (!acc[nomeCliente]) acc[nomeCliente] = [];
      acc[nomeCliente].push(trator);
      return acc;
    }, {} as Record<string, Trator[]>);
  }, [tratores, busca, filtroCliente]);

  const adicionarDestinatario = async () => {
    if (!novoDestNome.trim() || !novoDestEmail.trim()) return;
    const novo: Destinatario = { nome: novoDestNome.trim(), email: novoDestEmail.trim() };
    // Atualiza UI imediatamente
    setDestinatarios(prev => [...prev, novo]);
    setNovoDestNome("");
    setNovoDestEmail("");
    // Salva no Supabase
    const ok = await saveDestinatarioSupabase(novo);
    if (!ok) {
      // Reverte se falhou
      setDestinatarios(prev => prev.filter(d => d.email !== novo.email));
    }
  };

  const removerDestinatario = async (email: string) => {
    setDestinatarios(prev => prev.filter(d => d.email !== email));
    setDestinatariosSelecionados(prev => {
      const next = new Set(prev);
      next.delete(email);
      return next;
    });
    await removeDestinatarioSupabase(email);
  };

  const toggleDestinatario = (email: string) => {
    setDestinatariosSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const salvarMotor = async () => {
    if (!selecionado) return;
    const { error } = await supabase
      .from("tratores")
      .update({ Numero_Motor: motorTemp })
      .eq("ID", selecionado.ID);
    if (!error) {
      auditLog({ sistema: 'revisoes', acao: 'editar', entidade: 'trator', entidade_id: selecionado.ID, entidade_label: `${selecionado.Modelo} - ${selecionado.Chassis}`, detalhes: { campo: 'Numero_Motor', de: selecionado.Numero_Motor || '', para: motorTemp } });
      const updated = { ...selecionado, Numero_Motor: motorTemp };
      setSelecionado(updated);
      setTratores(prev => prev.map(t => t.ID === selecionado.ID ? updated : t));
      setEditandoMotor(false);
    }
  };

  const salvarNovoTrator = async () => {
    if (!novoTrator.Modelo?.trim() || !novoTrator.Chassis?.trim() || !novoTrator.Cliente?.trim()) {
      setMsgNovoTrator("Preencha pelo menos Modelo, Chassis e Cliente.");
      return;
    }
    setSalvandoTrator(true);
    setMsgNovoTrator("");
    const novoId = String(Date.now());
    const { data, error } = await supabase
      .from("tratores")
      .insert([{ ID: novoId, ...novoTrator }])
      .select();
    if (error) {
      setMsgNovoTrator("Erro ao salvar: " + error.message);
    } else if (data && data.length > 0) {
      auditLog({ sistema: 'revisoes', acao: 'criar', entidade: 'trator', entidade_id: data[0].ID, entidade_label: `${data[0].Modelo} - ${data[0].Chassis}` });
      setTratores(prev => [...prev, data[0]]);
      setShowNovoTrator(false);
      setNovoTrator({});
      setMsgNovoTrator("");
    }
    setSalvandoTrator(false);
  };

  const notificarAdminsFalha = async (titulo: string, descricao: string) => {
    try {
      const { data: admins } = await supabase
        .from("portal_permissoes")
        .select("user_id")
        .eq("is_admin", true);
      if (!admins || admins.length === 0) return;
      await supabase.from("portal_notificacoes").insert(
        admins.map((a: { user_id: string }) => ({
          user_id: a.user_id,
          tipo: "revisao",
          titulo,
          descricao,
          link: "/revisoes",
        }))
      );
    } catch {
      // Falha silenciosa — não travar o fluxo por causa de notificação
    }
  };

  const enviarEmail = async () => {
    if (!selecionado) return;
    if (!revisaoEnvio) { setMsgEnvio("Selecione a revisão."); return; }
    if (!horimetroEnvio.trim()) { setMsgEnvio("Preencha o horímetro."); return; }
    if (!nomeRemetente.trim()) { setMsgEnvio("Preencha seu nome."); return; }
    if (destinatariosSelecionados.size === 0) { setMsgEnvio("Selecione pelo menos um destinatário."); return; }
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) { setMsgEnvio("Selecione pelo menos um arquivo."); return; }

    setEnviando(true);
    setMsgEnvio("");

    const emailsDest = Array.from(destinatariosSelecionados);

    let emailEnviado = false;
    let pdfUrl: string | null = null;
    try {
      // Preparar todos os FormData
      const requests = Array.from(files).map((file) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("chassis", selecionado.Chassis);
        formData.append("horas", revisaoEnvio.replace("h", ""));
        formData.append("modelo", selecionado.Modelo);
        formData.append("cliente", selecionado.Cliente || "");
        formData.append("nome", nomeRemetente.trim());
        formData.append("destinatarios", JSON.stringify(emailsDest));
        return fetch("/api/revisoes", { method: "POST", body: formData });
      });
      // Enviar todos em paralelo
      const results = await Promise.all(requests);
      for (const res of results) {
        if (!res.ok) throw new Error("Erro no envio");
        emailEnviado = true;
        const resData = await res.json();
        if (resData.pdfUrl) pdfUrl = resData.pdfUrl;
      }
    } catch {
      if (!emailEnviado) {
        setMsgEnvio("Falha ao enviar email. Tente novamente.");
        notificarAdminsFalha(
          `Falha ao enviar cheque de revisão ${revisaoEnvio}`,
          `Trator ${selecionado.Modelo} - Chassis ${selecionado.Chassis} (${selecionado.Cliente}). O email não foi enviado.`
        );
        setEnviando(false);
        return;
      }
    }

    // Salvar revisão no banco SEMPRE que pelo menos um email foi enviado
    try {
      const hoje = new Date().toLocaleDateString("pt-BR");
      const updateData: Record<string, string | null> = {
        [`${revisaoEnvio} Data`]: hoje,
        [`${revisaoEnvio} Horimetro`]: horimetroEnvio.trim(),
      };
      if (pdfUrl) {
        updateData[`${revisaoEnvio} PDF`] = pdfUrl;
      }
      const { error: dbError } = await supabase
        .from("tratores")
        .update(updateData)
        .eq("ID", selecionado.ID);

      if (dbError) {
        setMsgEnvio("Email enviado, mas erro ao atualizar revisão: " + dbError.message);
        notificarAdminsFalha(
          `Erro ao salvar revisão ${revisaoEnvio} no banco`,
          `Trator ${selecionado.Modelo} - Chassis ${selecionado.Chassis} (${selecionado.Cliente}). Email foi enviado mas o banco não atualizou: ${dbError.message}`
        );
      } else {
        const updated: Record<string, any> = {
          ...selecionado,
          [`${revisaoEnvio} Data`]: hoje,
          [`${revisaoEnvio} Horimetro`]: horimetroEnvio.trim(),
        };
        if (pdfUrl) updated[`${revisaoEnvio} PDF`] = pdfUrl;
        setSelecionado(updated as Trator);
        setTratores(prev => prev.map(t => t.ID === selecionado.ID ? updated as Trator : t));
        setMsgEnvio("Email enviado e revisão atualizada!");
        auditLog({ sistema: 'revisoes', acao: 'enviar_email', entidade: 'trator', entidade_id: selecionado.ID, entidade_label: `${selecionado.Modelo} - ${selecionado.Chassis}`, detalhes: { revisao: revisaoEnvio, horimetro: horimetroEnvio.trim(), destinatarios: Array.from(destinatariosSelecionados) } });
      }
    } catch {
      setMsgEnvio("Email enviado, mas erro ao salvar revisão no banco.");
      notificarAdminsFalha(
        `Erro ao salvar revisão ${revisaoEnvio} no banco`,
        `Trator ${selecionado.Modelo} - Chassis ${selecionado.Chassis} (${selecionado.Cliente}). Email foi enviado mas ocorreu erro ao salvar no banco.`
      );
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    setHorimetroEnvio("");

    const horasEnvio = revisaoEnvio.replace("h", "");
    const chassisFinal = selecionado.Chassis.slice(-4);
    const emailOtimista: EmailRevisao = {
      subject: `CHEQUE DE REVISÃO - ${horasEnvio} HORAS - ${selecionado.Modelo} ${chassisFinal}`,
      date: new Date().toISOString(),
      uid: Date.now(),
      horas: horasEnvio,
      modelo: selecionado.Modelo,
      chassisFinal,
      attachments: [],
      body: "",
    };
    setEmails(prev => [...prev, emailOtimista]);

    setTimeout(() => fetchEmails(true), 5000);
    setEnviando(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const emailsDoSelecionado = useMemo(() => selecionado
    ? emailsDoChassis(selecionado.Chassis).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [], [selecionado, emailsDoChassis]);

  return (
    <div className="min-h-screen text-zinc-800 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h1 className="text-4xl font-semibold text-zinc-900 tracking-tight">Controle Revisões</h1>
              <p className="text-zinc-500 text-base mt-1">
                {tratores.length} unidades
                {loadingEmails && <span className="text-zinc-500 ml-3 animate-pulse">carregando emails...</span>}
                {emailsCarregados && <span className="text-zinc-500 ml-3">{emails.length} emails</span>}
              </p>
            </div>
            <button
              onClick={() => { setShowNovoTrator(true); setNovoTrator({}); setMsgNovoTrator(""); }}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors text-sm shrink-0"
            >
              + Novo Trator
            </button>
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Buscar chassis, cliente ou motor..."
              className="flex-1 px-4 py-3 rounded-lg bg-white border border-zinc-200 text-zinc-800 text-base placeholder-zinc-400 focus:ring-1 focus:ring-red-300 focus:border-red-300 outline-none transition-colors"
              onChange={(e) => setBusca(e.target.value)}
            />
            <input
              type="text"
              placeholder="Filtrar cliente..."
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="flex-1 px-4 py-3 rounded-lg bg-white border border-zinc-200 text-zinc-800 text-base placeholder-zinc-400 focus:ring-1 focus:ring-red-300 focus:border-red-300 outline-none transition-colors"
            />
          </div>
        </header>

        {loading && <p className="text-center py-20 text-zinc-400 text-sm">Carregando...</p>}
        {erro && <p className="text-center py-20 text-red-500 text-sm">{erro}</p>}
        {!loading && !erro && Object.keys(grupos).length === 0 && (
          <p className="text-center py-20 text-zinc-400 text-sm">Nenhum trator encontrado.</p>
        )}

        <div className="space-y-10">
          {(Object.entries(grupos) as [string, Trator[]][]).map(([cliente, lista]) => (
            <section key={cliente}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-base font-medium text-zinc-400">{cliente}</h2>
                <div className="flex-1 h-px bg-zinc-200"></div>
                <span className="text-sm text-zinc-400">{lista.length}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {lista.map(t => {
                  const previsao = calcularPrevisao(t);
                  const emailsCount = emailsCarregados ? emailsDoChassis(t.Chassis).length : 0;
                  return (
                    <div
                      key={t.ID}
                      onClick={() => {
                        setSelecionado(t); setEmailExpandido(null); setTabModal("timeline");
                        auditLog({ sistema: 'revisoes', acao: 'visualizar', entidade: 'trator', entidade_id: t.ID, entidade_label: `${t.Modelo} - ${t.Chassis}` });
                      }}
                      className="bg-white p-5 rounded-xl border border-zinc-200 hover:border-red-200 transition-all cursor-pointer group"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <span className="text-base text-zinc-500 font-medium">{t.Modelo}</span>
                        <span className={`text-base font-medium px-2 py-0.5 rounded-md ${
                          previsao.atrasada
                            ? "bg-red-50 text-red-600"
                            : "bg-emerald-50 text-emerald-600"
                        }`}>
                          {previsao.atrasada ? "Pendente" : "Em dia"}
                        </span>
                      </div>

                      <h3 className="text-2xl font-semibold text-zinc-900 mb-3 group-hover:text-zinc-800">{t.Chassis}</h3>

                      {emailsCarregados && (
                        <div className="mb-3">
                          <span className={`text-base font-medium ${emailsCount > 0 ? "text-zinc-400" : "text-zinc-600"}`}>
                            {emailsCount > 0 ? `${emailsCount} email(s)` : "Nenhum email"}
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-base">
                        <div>
                          <p className="text-zinc-400 text-sm">Motor</p>
                          <p className="text-zinc-800 font-medium text-lg">{t.Numero_Motor || "—"}</p>
                        </div>
                        <div>
                          <p className="text-zinc-400 text-sm">Entrega</p>
                          <p className="text-zinc-600 text-lg">{formatarData(t.Entrega)}</p>
                        </div>
                        <div>
                          <p className="text-zinc-400 text-sm">Vendedor</p>
                          <p className="text-zinc-600 text-base truncate">{t.Vendedor || "—"}</p>
                        </div>
                        <div>
                          <p className="text-zinc-400 text-sm">Cidade</p>
                          <p className="text-zinc-600 text-base truncate">{t.Cidade || "—"}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-200">
                        <div className="flex-1">
                          <p className="text-zinc-400 text-base">Próxima</p>
                          <p className="text-zinc-900 font-semibold text-lg">{previsao.proximaRevHoras}h</p>
                        </div>
                        <div className="flex-1">
                          <p className="text-zinc-400 text-base">Última</p>
                          <p className="text-zinc-600 font-semibold text-lg">{previsao.ultimaRevHoras > 0 ? `${previsao.ultimaRevHoras}h` : "—"}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Modal Detalhes */}
      {selecionado && (() => {
        const prev = calcularPrevisao(selecionado);
        const revisoesFeitas = REVISOES_LISTA.filter((rev: string) => selecionado[`${rev} Data`]).length;
        const totalRevisoes = REVISOES_LISTA.length;
        const progressoPct = Math.round((revisoesFeitas / totalRevisoes) * 100);
        const emailsComEmail = REVISOES_LISTA.filter((rev: string) => emailsCarregados && emailDaRevisao(selecionado.Chassis, rev)).length;

        return (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setSelecionado(null); }}
        >
          <div className="modal-enter bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border border-zinc-200 shadow-xl flex flex-col">
            <div className="px-8 pt-6 pb-4 border-b border-zinc-100">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-3xl font-semibold text-zinc-900">{selecionado.Chassis}</h2>
                      <span className={`text-sm font-medium px-2.5 py-1 rounded-full ${
                        prev.atrasada
                          ? "bg-red-50 text-red-600 border border-red-200"
                          : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                      }`}>
                        {prev.atrasada ? "Pendente" : "Em dia"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-base text-zinc-400">{selecionado.Modelo}</span>
                      <span className="text-zinc-700">·</span>
                      <span className="text-base text-zinc-400">{selecionado.Cliente}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelecionado(null)}
                  className="text-zinc-400 hover:text-zinc-600 transition-colors p-1.5 hover:bg-zinc-100 rounded-lg"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200">
                  <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Motor</p>
                  {editandoMotor ? (
                    <div className="mt-1">
                      <input
                        type="text"
                        value={motorTemp}
                        onChange={(e) => setMotorTemp(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") salvarMotor(); if (e.key === "Escape") setEditandoMotor(false); }}
                        autoFocus
                        className="w-full px-2 py-1 rounded-md bg-white border border-zinc-200 text-zinc-800 text-lg font-semibold focus:ring-1 focus:ring-red-300 outline-none"
                      />
                      <div className="flex gap-2 mt-1.5">
                        <button onClick={salvarMotor} className="text-emerald-600 hover:text-emerald-500 text-xs font-medium">Salvar</button>
                        <button onClick={() => setEditandoMotor(false)} className="text-zinc-400 hover:text-zinc-600 text-xs">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className="text-2xl font-semibold text-zinc-900 mt-0.5 cursor-pointer hover:text-red-500 transition-colors group/motor"
                      onClick={() => { setMotorTemp(selecionado.Numero_Motor || ""); setEditandoMotor(true); }}
                      title="Clique para editar"
                    >
                      {selecionado.Numero_Motor || <span className="text-zinc-400">—</span>}
                      <span className="text-xs text-zinc-400 group-hover/motor:text-red-500 ml-1 font-normal">editar</span>
                    </p>
                  )}
                </div>
                <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200">
                  <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Progresso</p>
                  <p className="text-2xl font-semibold text-zinc-900 mt-0.5">{revisoesFeitas}<span className="text-zinc-600 text-base font-normal">/{totalRevisoes}</span></p>
                  <div className="mt-2 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                    <div className="progress-bar-fill h-full bg-red-500 rounded-full transition-all" style={{ width: `${progressoPct}%` }}></div>
                  </div>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200">
                  <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Próxima</p>
                  <p className="text-2xl font-semibold text-zinc-900 mt-0.5">{prev.proximaRevHoras}<span className="text-zinc-600 text-base font-normal">h</span></p>
                  <p className="text-sm text-zinc-400 mt-1">{prev.dataEstimada.toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200">
                  <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Emails</p>
                  <p className="text-2xl font-semibold text-zinc-900 mt-0.5">
                    {emailsCarregados ? emailsDoSelecionado.length : <span className="text-zinc-400">—</span>}
                  </p>
                  <p className="text-sm text-zinc-400 mt-1">
                    {emailsCarregados ? `${emailsComEmail} revisões notificadas` : "carregando..."}
                  </p>
                </div>
              </div>

              <div className="flex gap-1">
                {[
                  { key: "timeline" as const, label: "Timeline" },
                  { key: "emails" as const, label: `Emails${emailsDoSelecionado.length > 0 ? ` (${emailsDoSelecionado.length})` : ""}` },
                  { key: "enviar" as const, label: "Enviar" },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setTabModal(tab.key)}
                    className={`py-2 px-4 text-base font-medium rounded-lg transition-all ${
                      tabModal === tab.key
                        ? "bg-red-600 text-white"
                        : "text-zinc-500 hover:text-red-600 hover:bg-red-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              {tabModal === "timeline" && (
                <div key="timeline" className="tab-content-enter grid lg:grid-cols-3 gap-8">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Informações</h4>
                    <div className="space-y-2">
                      {[
                        ["Chassis", selecionado.Chassis || "—"],
                        ["Motor", selecionado.Numero_Motor || "—"],
                        ["Vendedor", selecionado.Vendedor || "—"],
                        ["Cidade", selecionado.Cidade || "—"],
                        ["Entrega", formatarData(selecionado.Entrega)],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-zinc-50 rounded-lg p-3 border border-zinc-100 flex items-center justify-between">
                          <p className="text-sm text-zinc-400 uppercase tracking-wider font-medium">{label}</p>
                          <p className="text-base text-zinc-800 font-medium">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Revisões</h4>
                      <span className="text-sm text-zinc-400">{revisoesFeitas} de {totalRevisoes} realizadas</span>
                    </div>
                    <div className="relative">
                      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-zinc-200"></div>
                      <div
                        className="absolute left-[15px] top-2 w-px bg-red-400/50 transition-all duration-700"
                        style={{ height: `${(revisoesFeitas / totalRevisoes) * 100}%` }}
                      ></div>

                      <div className="space-y-1">
                        {REVISOES_LISTA.map((rev: string, idx: number) => {
                          const data = selecionado[`${rev} Data`];
                          const horas = selecionado[`${rev} Horimetro`];
                          const pdfSalvo = selecionado[`${rev} PDF`] as string | undefined;
                          const email = emailsCarregados ? emailDaRevisao(selecionado.Chassis, rev) : null;
                          const isFeita = !!data;
                          const isProxima = !isFeita && (idx === 0 || selecionado[`${REVISOES_LISTA[idx - 1]} Data`]);
                          const isExpanded = emailExpandido === `tl-${rev}`;

                          return (
                            <div key={rev} className="relative">
                              <button
                                onClick={() => setEmailExpandido(isExpanded ? null : `tl-${rev}`)}
                                className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all text-left group ${
                                  isFeita
                                    ? "hover:bg-emerald-50"
                                    : isProxima
                                      ? "hover:bg-amber-50"
                                      : "hover:bg-zinc-50 opacity-40 hover:opacity-60"
                                }`}
                              >
                                <div className={`relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                                  isFeita
                                    ? "bg-emerald-100 border-emerald-500"
                                    : isProxima
                                      ? "bg-amber-100 border-amber-500 animate-pulse"
                                      : "bg-zinc-100 border-zinc-300"
                                }`}>
                                  {isFeita ? (
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  ) : isProxima ? (
                                    <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                                  ) : (
                                    <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full"></div>
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`font-semibold text-base ${isFeita ? "text-zinc-900" : isProxima ? "text-amber-600" : "text-zinc-500"}`}>
                                      {rev}
                                    </span>
                                    {isProxima && (
                                      <span className="text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">PRÓXIMA</span>
                                    )}
                                  </div>
                                  {data && (
                                    <div className="flex items-center gap-3 mt-0.5">
                                      <span className="text-sm text-zinc-400">{formatarData(data)}</span>
                                      {horas && <span className="text-sm text-emerald-400 font-medium">{horas}h</span>}
                                    </div>
                                  )}
                                </div>

                                {emailsCarregados && (
                                  <div className="shrink-0">
                                    {email ? (
                                      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-500/20">
                                        Notificado
                                      </span>
                                    ) : isFeita ? (
                                      <span className="inline-flex items-center gap-1.5 text-sm text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
                                        Sem email
                                      </span>
                                    ) : null}
                                  </div>
                                )}

                                <span className={`text-zinc-400 group-hover:text-zinc-600 transition-transform text-xs ${isExpanded ? "rotate-180" : ""}`}>
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </span>
                              </button>

                              {isExpanded && (
                                <div className="expand-enter ml-[46px] mr-3 mb-2 rounded-lg bg-zinc-50 border border-zinc-200 p-4">
                                  {isFeita ? (
                                    <div className="space-y-3">
                                      <div className="grid grid-cols-3 gap-3">
                                        <div>
                                          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Data</p>
                                          <p className="text-base text-zinc-700">{formatarData(data)}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Horímetro</p>
                                          <p className="text-base text-zinc-900 font-medium">{horas ? `${horas}h` : "—"}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Email</p>
                                          {email ? (
                                            <p className="text-base text-emerald-600">Enviado em {new Date(email.date).toLocaleDateString("pt-BR")}</p>
                                          ) : (
                                            <p className="text-base text-amber-600">Não enviado</p>
                                          )}
                                        </div>
                                      </div>
                                      {/* PDF salvo no banco — prioridade */}
                                      {pdfSalvo && (
                                        <div>
                                          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">Documento</p>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setPdfPreviewUrl(pdfSalvo); }}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-50 hover:bg-red-100 border border-red-200 transition-colors text-xs text-red-700 font-medium"
                                          >
                                            <i className="fas fa-file-pdf" /> Ver PDF
                                          </button>
                                        </div>
                                      )}
                                      {/* Anexos do email — fallback se não tem PDF no banco */}
                                      {!pdfSalvo && email && email.attachments.length > 0 && (
                                        <div>
                                          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">Anexos do email</p>
                                          <div className="flex flex-wrap gap-2">
                                            {email.attachments.map((att, i) => {
                                              const attUrl = `/api/revisoes/emails/attachment?uid=${email.uid}&part=${encodeURIComponent(att.part)}&filename=${encodeURIComponent(att.filename)}&type=${encodeURIComponent(att.contentType)}`;
                                              const isPdf = att.contentType.includes("pdf");
                                              return (
                                                <button
                                                  key={i}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isPdf) {
                                                      setPdfPreviewUrl(attUrl);
                                                    } else {
                                                      window.open(attUrl, "_blank");
                                                    }
                                                  }}
                                                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 transition-colors text-xs text-zinc-300"
                                                >
                                                  <span className="text-[10px] text-zinc-400 font-medium">
                                                    {isPdf ? "PDF" : att.contentType.includes("image") ? "IMG" : "ARQ"}
                                                  </span>
                                                  <span className="truncate max-w-[150px]">{att.filename}</span>
                                                  <span className="text-zinc-400">{formatFileSize(att.size)}</span>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : isProxima ? (
                                    <div className="flex items-center gap-3">
                                      <div className="flex-1">
                                        <p className="text-base text-amber-600">Próxima revisão estimada</p>
                                        <p className="text-sm text-zinc-400 mt-1">
                                          Previsão: {prev.dataEstimada.toLocaleDateString("pt-BR")} · {prev.mediaHorasDia} h/dia de uso médio
                                        </p>
                                      </div>
                                      <button
                                        onClick={() => { setTabModal("enviar"); setRevisaoEnvio(rev); }}
                                        className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors shrink-0"
                                      >
                                        Enviar cheque
                                      </button>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-zinc-400">Revisão ainda não realizada.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tabModal === "emails" && (
                <div key="emails" className="tab-content-enter space-y-2">
                  {emailsDoSelecionado.length === 0 ? (
                    <div className="text-center py-16">
                      <p className="text-zinc-600 text-base">Nenhum email encontrado para este chassis</p>
                      {!emailsCarregados && loadingEmails && (
                        <p className="text-zinc-500 text-xs mt-2 animate-pulse">Carregando emails...</p>
                      )}
                    </div>
                  ) : (
                    emailsDoSelecionado.map((email, idx) => {
                      const isExpanded = emailExpandido === `email-${idx}`;
                      return (
                        <div key={idx} className={`rounded-xl border transition-all ${isExpanded ? "border-red-200 bg-red-50/30" : "border-zinc-200 hover:border-red-200/60"}`}>
                          <button
                            onClick={() => setEmailExpandido(isExpanded ? null : `email-${idx}`)}
                            className="w-full p-4 flex items-center justify-between gap-4 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                email.horas ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"
                              }`}>
                                <span className="text-sm font-bold">{email.horas ? `${email.horas}` : "?"}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-base text-zinc-700 truncate">{email.subject}</p>
                                <p className="text-sm text-zinc-400 mt-0.5">
                                  {email.date ? new Date(email.date).toLocaleDateString("pt-BR", {
                                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                                  }) : "—"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {email.attachments.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs text-zinc-400 bg-zinc-100 px-2 py-1 rounded-md">
                                  {email.attachments.length} anexo(s)
                                </span>
                              )}
                              <span className={`text-zinc-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </span>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="expand-enter px-4 pb-4 border-t border-zinc-100 pt-3 space-y-3">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Data de envio</p>
                                  <p className="text-base text-zinc-700">
                                    {email.date ? new Date(email.date).toLocaleDateString("pt-BR", {
                                      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                                    }) : "—"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Revisão</p>
                                  <p className="text-base text-zinc-900 font-medium">{email.horas ? `${email.horas}h` : "—"}</p>
                                </div>
                              </div>
                              {email.body && (
                                <div>
                                  <p className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Corpo do email</p>
                                  <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-100">
                                    <pre className="text-base text-zinc-500 whitespace-pre-wrap font-sans leading-relaxed">{email.body}</pre>
                                  </div>
                                </div>
                              )}
                              {email.attachments.length > 0 && (
                                <div>
                                  <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">Anexos ({email.attachments.length})</p>
                                  <div className="flex flex-wrap gap-2">
                                    {email.attachments.map((att, i) => {
                                      const attUrl = `/api/revisoes/emails/attachment?uid=${email.uid}&part=${encodeURIComponent(att.part)}&filename=${encodeURIComponent(att.filename)}&type=${encodeURIComponent(att.contentType)}`;
                                      const isPdf = att.contentType.includes("pdf");
                                      return (
                                        <button
                                          key={i}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (isPdf) {
                                              setPdfPreviewUrl(attUrl);
                                            } else {
                                              window.open(attUrl, "_blank");
                                            }
                                          }}
                                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 transition-colors group/att text-left"
                                        >
                                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                            isPdf
                                              ? "bg-red-50 text-red-500"
                                              : att.contentType.includes("image")
                                                ? "bg-blue-50 text-blue-500"
                                                : "bg-zinc-200 text-zinc-500"
                                          }`}>
                                            {isPdf ? "PDF" : att.contentType.includes("image") ? "IMG" : "ARQ"}
                                          </span>
                                          <div className="min-w-0">
                                            <p className="text-xs text-zinc-300 truncate max-w-[180px] group-hover/att:text-white transition-colors">{att.filename}</p>
                                            <p className="text-[10px] text-zinc-400">{formatFileSize(att.size)}</p>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {tabModal === "enviar" && selecionado && (() => {
                const horasPreview = revisaoEnvio ? revisaoEnvio.replace("h", "") : "___";
                const chassisFinalPreview = selecionado.Chassis.slice(-4);
                return (
                  <div key="enviar" className="tab-content-enter grid lg:grid-cols-2 gap-8">
                    <div>
                      <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-3">Preview</h4>
                      <div className="rounded-xl border border-zinc-200 p-5 space-y-4">
                        <div>
                          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Assunto</p>
                          <p className="text-base text-zinc-900 font-medium">
                            CHEQUE DE REVISÃO - {horasPreview} HORAS - {selecionado.Modelo} {chassisFinalPreview}
                          </p>
                        </div>
                        <div className="border-t border-zinc-200 pt-4">
                          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Corpo</p>
                          <div className="text-base text-zinc-600 space-y-2 bg-zinc-50 p-4 rounded-lg border border-zinc-100">
                            <p>{new Date().getHours() < 12 ? 'Bom dia' : 'Boa tarde'}, segue em anexo o cheque de revisão de {horasPreview} Horas do Trator {selecionado.Modelo}.</p>
                            <p>
                              CHASSI: {selecionado.Chassis}<br />
                              CLIENTE: {selecionado.Cliente || "—"}
                            </p>
                            <p>Qualquer dúvida estou à disposição.</p>
                            <p>
                              {nomeRemetente || <span className="text-zinc-400 italic">seu nome</span>}<br />
                              <span className="text-zinc-400">&nbsp;&nbsp;&nbsp;Pós vendas</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-3">Destinatários</h4>
                        <div className="rounded-xl border border-zinc-200 p-4 space-y-2">
                          {destinatarios.length === 0 && (
                            <p className="text-zinc-400 text-sm py-2">Nenhum destinatário cadastrado.</p>
                          )}
                          {destinatarios.map(d => (
                            <label
                              key={d.email}
                              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={destinatariosSelecionados.has(d.email)}
                                onChange={() => toggleDestinatario(d.email)}
                                className="w-4 h-4 rounded bg-white border-zinc-300 accent-red-500"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-base text-zinc-800">{d.nome}</p>
                                <p className="text-sm text-zinc-400 truncate">{d.email}</p>
                              </div>
                              {!DESTINATARIOS_FIXOS.some(f => f.email.toLowerCase() === d.email.toLowerCase()) && (
                                <button
                                  onClick={(e) => { e.preventDefault(); removerDestinatario(d.email); }}
                                  className="text-zinc-400 hover:text-red-500 text-sm transition-colors shrink-0"
                                >
                                  remover
                                </button>
                              )}
                            </label>
                          ))}

                          <div className="flex gap-2 pt-2 border-t border-zinc-200">
                            <input
                              type="text"
                              placeholder="Nome"
                              value={novoDestNome}
                              onChange={(e) => setNovoDestNome(e.target.value)}
                              className="flex-1 px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-800 text-sm placeholder-zinc-400 focus:ring-1 focus:ring-red-300 outline-none transition-colors"
                            />
                            <input
                              type="email"
                              placeholder="Email"
                              value={novoDestEmail}
                              onChange={(e) => setNovoDestEmail(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") adicionarDestinatario(); }}
                              className="flex-1 px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-800 text-sm placeholder-zinc-400 focus:ring-1 focus:ring-red-300 outline-none transition-colors"
                            />
                            <button
                              onClick={adicionarDestinatario}
                              className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-3">Envio</h4>
                        <div className="rounded-xl border border-zinc-200 p-4 space-y-4">
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Revisão</label>
                              <select
                                value={revisaoEnvio}
                                onChange={(e) => setRevisaoEnvio(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-800 text-base focus:ring-1 focus:ring-red-300 outline-none transition-colors"
                              >
                                <option value="">Selecione...</option>
                                {REVISOES_LISTA.map((r: string) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Horímetro</label>
                              <input
                                type="text"
                                placeholder="Ex: 320"
                                value={horimetroEnvio}
                                onChange={(e) => setHorimetroEnvio(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-800 text-base placeholder-zinc-600 focus:ring-1 focus:ring-red-300 outline-none transition-colors"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Seu nome</label>
                              <input
                                type="text"
                                placeholder="Nome para assinatura"
                                value={nomeRemetente}
                                onChange={(e) => setNomeRemetente(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-800 text-base placeholder-zinc-600 focus:ring-1 focus:ring-red-300 outline-none transition-colors"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1 block">Anexo</label>
                            <input
                              ref={fileInputRef}
                              type="file"
                              multiple
                              className="w-full text-sm text-zinc-600 file:bg-red-50 file:text-red-600 file:border file:border-red-200 file:px-3 file:py-1.5 file:rounded-md file:cursor-pointer file:text-sm file:mr-2"
                            />
                          </div>

                          {msgEnvio && (
                            <div className={`text-sm font-medium p-3 rounded-lg ${
                              msgEnvio.includes("sucesso")
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                : "bg-red-50 text-red-600 border border-red-200"
                            }`}>
                              {msgEnvio}
                            </div>
                          )}

                          <button
                            onClick={enviarEmail}
                            disabled={enviando}
                            className="w-full bg-red-600 text-white py-3 rounded-xl text-base font-medium hover:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                          >
                            {enviando ? (
                              <span className="inline-flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                Enviando...
                              </span>
                            ) : "Enviar email"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal Novo Trator */}
      {showNovoTrator && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNovoTrator(false); }}
        >
          <div className="modal-enter bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-zinc-200 shadow-xl">
            <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-zinc-100 sticky top-0 bg-white z-10">
              <h2 className="text-xl font-semibold text-zinc-900">Novo Trator</h2>
              <button
                onClick={() => setShowNovoTrator(false)}
                className="text-zinc-400 hover:text-zinc-600 transition-colors p-1.5 hover:bg-zinc-100 rounded-lg"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>

            <div className="px-8 py-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: "Modelo", label: "Modelo", required: true },
                  { key: "Chassis", label: "Chassis", required: true },
                  { key: "Cliente", label: "Cliente", required: true },
                  { key: "Numero_Motor", label: "Nº Motor" },
                  { key: "Vendedor", label: "Vendedor" },
                  { key: "Cidade", label: "Cidade" },
                ].map(({ key, label, required }) => (
                  <div key={key}>
                    <label className="text-xs text-zinc-400 uppercase tracking-wider block mb-1.5">
                      {label} {required && <span className="text-red-400">*</span>}
                    </label>
                    <input
                      type="text"
                      value={(novoTrator as any)[key] || ""}
                      onChange={(e) => setNovoTrator(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-800 text-sm placeholder-zinc-400 focus:ring-1 focus:ring-red-300 focus:border-red-300 outline-none"
                      placeholder={label}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs text-zinc-400 uppercase tracking-wider block mb-1.5">Data de Entrega</label>
                <input
                  type="date"
                  value={novoTrator.Entrega || ""}
                  onChange={(e) => setNovoTrator(prev => ({ ...prev, Entrega: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-800 text-sm focus:ring-1 focus:ring-red-300 focus:border-red-300 outline-none"
                />
              </div>

              <div>
                <p className="text-xs text-zinc-400 uppercase tracking-wider mb-3">Revisões (opcional)</p>
                <div className="space-y-3">
                  {REVISOES_LISTA.map(rev => (
                    <div key={rev} className="grid grid-cols-[80px_1fr_1fr] gap-3 items-center">
                      <span className="text-sm text-zinc-500 font-medium">{rev}</span>
                      <input
                        type="date"
                        value={(novoTrator as any)[`${rev} Data`] || ""}
                        onChange={(e) => setNovoTrator(prev => ({ ...prev, [`${rev} Data`]: e.target.value }))}
                        placeholder="Data"
                        className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-800 text-sm focus:ring-1 focus:ring-red-300 focus:border-red-300 outline-none"
                      />
                      <input
                        type="text"
                        value={(novoTrator as any)[`${rev} Horimetro`] || ""}
                        onChange={(e) => setNovoTrator(prev => ({ ...prev, [`${rev} Horimetro`]: e.target.value }))}
                        placeholder="Horímetro"
                        className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-800 text-sm placeholder-zinc-400 focus:ring-1 focus:ring-red-300 focus:border-red-300 outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {msgNovoTrator && (
                <p className={`text-sm ${msgNovoTrator.startsWith("Erro") ? "text-red-400" : "text-emerald-400"}`}>
                  {msgNovoTrator}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowNovoTrator(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarNovoTrator}
                  disabled={salvandoTrator}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                >
                  {salvandoTrator ? "Salvando..." : "Salvar Trator"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal (PDF ou Imagem) */}
      {pdfPreviewUrl && (() => {
        const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(pdfPreviewUrl) || pdfPreviewUrl.includes("type=image");
        return (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]"
            onClick={() => setPdfPreviewUrl(null)}
          >
            <div
              className="relative w-full max-w-5xl h-[90vh] bg-white rounded-2xl overflow-hidden border border-zinc-200 shadow-xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 shrink-0">
                <span className="text-sm text-zinc-500">{isImage ? "Visualização da Imagem" : "Visualização do PDF"}</span>
                <div className="flex items-center gap-2">
                  <a
                    href={pdfPreviewUrl}
                    download
                    className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors px-2 py-1 rounded hover:bg-zinc-100"
                  >
                    <i className="fas fa-download" /> Baixar
                  </a>
                  <button onClick={() => setPdfPreviewUrl(null)} className="text-zinc-400 hover:text-zinc-700 transition-colors p-1">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-zinc-100 flex items-center justify-center">
                {isImage ? (
                  <img src={pdfPreviewUrl} alt="Anexo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                ) : (
                  <object data={pdfPreviewUrl} type="application/pdf" className="w-full h-full">
                    <iframe src={pdfPreviewUrl} className="w-full h-full" title="PDF" />
                  </object>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function DashboardAgrupado() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id);
  if (!loadingPerm && userProfile && !temAcesso('revisoes')) return <SemPermissao />;
  return <DashboardAgrupadoInner />;
}
