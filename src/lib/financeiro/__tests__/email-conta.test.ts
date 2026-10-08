import { describe, expect, it } from "vitest";
import {
  escolherPasta, imapDoSmtp, precisaCopiaEnviados, provedorDoHost, seguroPorPorta, traduzirErroEmail,
} from "../email-conta";

describe("imapDoSmtp", () => {
  it("smtp.x vira imap.x; host sem smtp fica igual", () => {
    expect(imapDoSmtp("smtp.gmail.com")).toBe("imap.gmail.com");
    expect(imapDoSmtp("mail.novatratores.com.br")).toBe("mail.novatratores.com.br");
  });
  it("Office 365 usa outlook.office365.com", () => {
    expect(imapDoSmtp("smtp.office365.com")).toBe("outlook.office365.com");
  });
});

describe("seguroPorPorta", () => {
  it("465 = SSL, 587/25 = STARTTLS, mesmo se pedirem o contrário", () => {
    expect(seguroPorPorta(465, false)).toBe(true);
    expect(seguroPorPorta(587, true)).toBe(false);
    expect(seguroPorPorta(25, true)).toBe(false);
  });
  it("outra porta segue o pedido (padrão SSL)", () => {
    expect(seguroPorPorta(2525, false)).toBe(false);
    expect(seguroPorPorta(2525, null)).toBe(true);
  });
});

describe("provedorDoHost / precisaCopiaEnviados", () => {
  it("reconhece os presets", () => {
    expect(provedorDoHost("smtp.gmail.com")).toBe("gmail");
    expect(provedorDoHost("smtp.office365.com")).toBe("outlook");
    expect(provedorDoHost("mail.novatratores.com.br")).toBe("empresa");
    expect(provedorDoHost("smtp.cednet.com.br")).toBe("outro");
    expect(provedorDoHost("")).toBe("");
  });
  it("só Gmail/Office 365 dispensam a cópia em Enviados", () => {
    expect(precisaCopiaEnviados("smtp.gmail.com")).toBe(false);
    expect(precisaCopiaEnviados("smtp.office365.com")).toBe(false);
    expect(precisaCopiaEnviados("mail.novatratores.com.br")).toBe(true);
  });
});

describe("escolherPasta", () => {
  it("prefere a marca SPECIAL-USE", () => {
    const caixas = [{ path: "INBOX" }, { path: "[Gmail]/E-mails enviados", specialUse: "\\Sent" }, { path: "Sent" }];
    expect(escolherPasta(caixas, "enviados")).toBe("[Gmail]/E-mails enviados");
  });
  it("cai no nome no padrão do cPanel (INBOX.Sent / INBOX.spam)", () => {
    const caixas = [{ path: "INBOX" }, { path: "INBOX.Drafts" }, { path: "INBOX.Sent" }, { path: "INBOX.spam" }, { path: "INBOX.Trash" }];
    expect(escolherPasta(caixas, "enviados")).toBe("INBOX.Sent");
    expect(escolherPasta(caixas, "spam")).toBe("INBOX.spam");
  });
  it("nomes em português", () => {
    expect(escolherPasta([{ path: "Itens Enviados" }], "enviados")).toBe("Itens Enviados");
    expect(escolherPasta([{ path: "Lixo Eletrônico" }], "spam")).toBe("Lixo Eletrônico");
  });
  it("sem pasta → null", () => {
    expect(escolherPasta([{ path: "INBOX" }], "enviados")).toBeNull();
  });
});

describe("traduzirErroEmail", () => {
  it("senha recusada", () => {
    expect(traduzirErroEmail({ code: "EAUTH", message: "Invalid login: 535 Incorrect authentication data" }, "mail.x"))
      .toMatch(/senha recusados.*mail\.x/);
    expect(traduzirErroEmail({ authenticationFailed: true, message: "Command failed" })).toMatch(/senha recusados/);
  });
  it("servidor mudo / inexistente", () => {
    expect(traduzirErroEmail({ code: "ETIMEDOUT", message: "Connection timeout" })).toMatch(/não respondeu/);
    expect(traduzirErroEmail({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND x" })).toMatch(/não encontrado/);
  });
  it("erro desconhecido devolve o texto original", () => {
    expect(traduzirErroEmail(new Error("Mailbox full"))).toBe("Mailbox full");
  });
});
