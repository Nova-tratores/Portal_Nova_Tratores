/*
 * Apontador de Falhas - widget em JavaScript puro.
 * Funciona em qualquer site: HTML/JS puro, Express, Next.js, etc.
 * Sem dependencias e sem build.
 *
 * Uso por tag <script> (auto-inicializa):
 *   <script src="bug-reporter.js"
 *           data-system-name="Nome do Sistema"
 *           data-supabase-url="https://xxxx.supabase.co"
 *           data-supabase-key="CHAVE_ANON"
 *           data-trigger="contextmenu"></script>
 *
 * Ou por JavaScript:
 *   BugReporter.init({
 *     systemName: "Nome do Sistema",
 *     supabaseUrl: "https://xxxx.supabase.co",
 *     supabaseKey: "CHAVE_ANON",
 *     trigger: "both",              // contextmenu | button | both
 *     user: { name: "", email: "" } // opcional
 *   });
 */
(function () {
  "use strict";

  if (window.BugReporter && window.BugReporter.__ready) return;

  var SCRIPT_EL = document.currentScript;

  var config = {
    systemName: "Sistema",
    supabaseUrl: "",
    supabaseKey: "",
    trigger: "contextmenu",
    user: null,
    categories: ["Bug", "Sugestao", "Duvida"],
    html2canvasCdn:
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
    // ponto de extensao opcional: o sistema host pode oferecer um
    // "encaminhar para" alguem. So aparece se forwardOptions tiver itens.
    forwardLabel: "Encaminhar para (opcional)",
    forwardOptions: [], // [{ value, label }]
    onForward: null, // function(value, reportData) -> Promise
    // ponto de extensao: acoes extras no menu do clique direito.
    // [{ id, label, svg?, capture? }] — capture !== false roda a MESMA
    // mecanica de print (captura + selecao da area) e entrega o resultado
    // em onAction(id, { canvas, dataUrl, selectionRect, viewport });
    // capture === false chama onAction(id, null) direto (so abre o modal
    // do host, ex.: abertura de ticket).
    extraActions: [],
    onAction: null, // function(id, captureData|null)
  };

  // estado de execucao
  var phase = "idle"; // idle | menu | capturing | selecting | form
  var submitting = false;
  var capture = null; // { canvas, dataUrl, viewport }
  var selectionRect = null;
  var croppedCanvas = null;
  var pendingAction = null; // acao extra em curso (fluxo de captura)
  var nodes = {}; // elementos da tela atual
  var refs = {}; // campos do formulario
  var initialized = false;

  var BUG_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 ' +
    '3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/>' +
    '<line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  // ============================================================
  // Estilos
  // ============================================================
  function injectStyles() {
    if (document.getElementById("bgr-styles")) return;
    var css = [
      ".bgr-fab,.bgr-ctx-menu,.bgr-capturing,.bgr-instruction,.bgr-modal-overlay{",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,",
      "Ubuntu,Cantarell,'Open Sans','Helvetica Neue',sans-serif;}",

      ".bgr-fab{position:fixed;right:20px;bottom:20px;z-index:2147483400;",
      "display:flex;align-items:center;gap:8px;background:#2563eb;color:#fff;",
      "border:none;border-radius:999px;padding:12px 18px;font-size:14px;",
      "font-weight:600;cursor:pointer;box-shadow:0 8px 22px rgba(37,99,235,.4);}",
      ".bgr-fab:hover{background:#1d4ed8;}",

      ".bgr-ctx-backdrop{position:fixed;inset:0;z-index:2147483500;}",
      ".bgr-ctx-menu{position:fixed;z-index:2147483550;min-width:196px;",
      "background:#fff;border:1px solid #e5e7eb;border-radius:10px;",
      "box-shadow:0 12px 32px rgba(0,0,0,.2);padding:6px;}",
      ".bgr-ctx-item{display:flex;align-items:center;gap:9px;width:100%;",
      "border:none;background:transparent;padding:10px;border-radius:7px;",
      "font-size:14px;color:#1f2937;cursor:pointer;text-align:left;}",
      ".bgr-ctx-item:hover{background:#f3f4f6;}",

      ".bgr-capturing{position:fixed;left:50%;top:18px;",
      "transform:translateX(-50%);z-index:2147483600;background:#1f2937;",
      "color:#fff;padding:9px 18px;border-radius:999px;font-size:13px;}",

      ".bgr-overlay{position:fixed;inset:0;z-index:2147483500;",
      "cursor:crosshair;user-select:none;overflow:hidden;}",
      ".bgr-screenshot{position:absolute;inset:0;width:100%;height:100%;",
      "object-fit:fill;pointer-events:none;}",
      ".bgr-dim{position:absolute;inset:0;background:rgba(0,0,0,.5);",
      "pointer-events:none;}",
      ".bgr-selbox{position:absolute;border:2px solid #2563eb;",
      "box-shadow:0 0 0 100vmax rgba(0,0,0,.5);pointer-events:none;}",
      ".bgr-instruction{position:absolute;left:50%;top:22px;",
      "transform:translateX(-50%);z-index:3;background:rgba(31,41,55,.95);",
      "color:#fff;padding:10px 18px;border-radius:999px;font-size:13px;",
      "pointer-events:none;white-space:nowrap;max-width:92vw;}",

      ".bgr-modal-overlay{position:fixed;inset:0;z-index:2147483600;",
      "background:rgba(17,24,39,.6);display:flex;align-items:center;",
      "justify-content:center;padding:20px;color:#1f2937;}",
      ".bgr-modal{background:#fff;border-radius:14px;width:100%;",
      "max-width:460px;max-height:90vh;overflow-y:auto;padding:20px 22px 22px;",
      "box-shadow:0 24px 60px rgba(0,0,0,.35);}",
      ".bgr-modal-header{display:flex;align-items:center;",
      "justify-content:space-between;margin-bottom:14px;}",
      ".bgr-modal-title{margin:0;font-size:18px;}",
      ".bgr-close{border:none;background:transparent;font-size:24px;",
      "line-height:1;color:#6b7280;cursor:pointer;padding:0 4px;}",
      ".bgr-close:hover{color:#1f2937;}",

      ".bgr-preview-wrap{margin-bottom:14px;}",
      ".bgr-preview{display:block;width:100%;max-height:220px;",
      "object-fit:contain;border:1px solid #e5e7eb;border-radius:8px;",
      "background:#f9fafb;}",
      ".bgr-preview-empty{display:flex;align-items:center;",
      "justify-content:center;height:90px;border:1px dashed #d1d5db;",
      "border-radius:8px;color:#9ca3af;font-size:13px;}",
      ".bgr-reselect{margin-top:8px;border:none;background:transparent;",
      "color:#2563eb;font-size:13px;font-weight:600;cursor:pointer;padding:2px 0;}",
      ".bgr-reselect:hover{text-decoration:underline;}",

      ".bgr-label{display:block;font-size:13px;font-weight:600;",
      "color:#374151;margin-bottom:12px;}",
      ".bgr-textarea,.bgr-input,.bgr-select{display:block;width:100%;",
      "margin-top:5px;padding:9px 10px;border:1px solid #d1d5db;",
      "border-radius:8px;font-size:14px;font-family:inherit;color:#1f2937;",
      "box-sizing:border-box;}",
      ".bgr-textarea{resize:vertical;min-height:84px;}",
      ".bgr-row{display:flex;gap:12px;}",
      ".bgr-row .bgr-label{flex:1;}",
      ".bgr-field-error{display:block;margin:-6px 0 12px;color:#dc2626;",
      "font-size:12px;}",
      ".bgr-error{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;",
      "border-radius:8px;padding:9px 12px;font-size:13px;margin-bottom:12px;}",

      ".bgr-actions{display:flex;justify-content:flex-end;gap:10px;",
      "margin-top:4px;}",
      ".bgr-btn-primary,.bgr-btn-secondary{border-radius:8px;padding:10px 18px;",
      "font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;}",
      ".bgr-btn-primary{background:#2563eb;color:#fff;border:none;}",
      ".bgr-btn-primary:hover{background:#1d4ed8;}",
      ".bgr-btn-primary:disabled{background:#93c5fd;cursor:default;}",
      ".bgr-btn-secondary{background:#fff;color:#374151;",
      "border:1px solid #d1d5db;}",
      ".bgr-btn-secondary:hover{background:#f9fafb;}",
      ".bgr-btn-secondary:disabled{opacity:.5;cursor:default;}",

      ".bgr-success{text-align:center;padding:12px 8px 4px;}",
      ".bgr-success-icon{width:52px;height:52px;margin:0 auto 14px;",
      "border-radius:50%;background:#dcfce7;color:#16a34a;font-size:28px;",
      "display:flex;align-items:center;justify-content:center;}",
      ".bgr-success-text{color:#4b5563;font-size:14px;line-height:1.5;",
      "margin:8px 0 18px;}",
    ].join("");
    var style = document.createElement("style");
    style.id = "bgr-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // Helper de criacao de elementos
  // ============================================================
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else if (k.indexOf("on") === 0 && typeof v === "function")
          node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  // ============================================================
  // Captura de tela (html2canvas via CDN)
  // ============================================================
  var html2canvasPromise = null;

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = config.html2canvasCdn;
      s.async = true;
      s.onload = function () {
        if (window.html2canvas) resolve(window.html2canvas);
        else reject(new Error("html2canvas nao ficou disponivel."));
      };
      s.onerror = function () {
        html2canvasPromise = null;
        reject(
          new Error(
            "Falha ao carregar o html2canvas (verifique a conexao com a internet)."
          )
        );
      };
      document.head.appendChild(s);
    });
    return html2canvasPromise;
  }

  function captureViewport() {
    return loadHtml2Canvas().then(function (html2canvas) {
      var viewport = {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      };
      return html2canvas(document.body, {
        x: window.scrollX,
        y: window.scrollY,
        width: viewport.width,
        height: viewport.height,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      }).then(function (canvas) {
        return {
          canvas: canvas,
          dataUrl: canvas.toDataURL("image/png"),
          viewport: viewport,
        };
      });
    });
  }

  function cropCanvas(src, rect, viewport) {
    var scaleX = src.width / viewport.width;
    var scaleY = src.height / viewport.height;
    var out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(rect.width * scaleX));
    out.height = Math.max(1, Math.round(rect.height * scaleY));
    out
      .getContext("2d")
      .drawImage(
        src,
        rect.x * scaleX,
        rect.y * scaleY,
        rect.width * scaleX,
        rect.height * scaleY,
        0,
        0,
        out.width,
        out.height
      );
    return out;
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem."));
      }, "image/png");
    });
  }

  // ============================================================
  // Envio para o Supabase (REST + Storage via fetch)
  // ============================================================
  function slugify(value) {
    return (
      String(value || "sistema")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "sistema"
    );
  }

  function submitReport(data) {
    if (!config.supabaseUrl || !config.supabaseKey) {
      return Promise.reject(
        new Error(
          "Supabase nao configurado: informe data-supabase-url e data-supabase-key."
        )
      );
    }
    var base = config.supabaseUrl.replace(/\/+$/, "");
    var auth = {
      apikey: config.supabaseKey,
      Authorization: "Bearer " + config.supabaseKey,
    };

    var uploadStep = Promise.resolve(null);
    if (data.screenshotCanvas) {
      uploadStep = canvasToBlob(data.screenshotCanvas).then(function (blob) {
        var path =
          slugify(config.systemName) +
          "/" +
          Date.now() +
          "-" +
          Math.random().toString(36).slice(2, 8) +
          ".png";
        return fetch(base + "/storage/v1/object/bug-reports/" + path, {
          method: "POST",
          headers: Object.assign({}, auth, { "Content-Type": "image/png" }),
          body: blob,
        }).then(function (res) {
          if (!res.ok) {
            return res.text().then(function (t) {
              throw new Error(
                "Falha ao enviar a imagem (HTTP " + res.status + "). " + t
              );
            });
          }
          return path;
        });
      });
    }

    return uploadStep.then(function (screenshotPath) {
      return fetch(base + "/rest/v1/bug_reports", {
        method: "POST",
        headers: Object.assign({}, auth, {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
        body: JSON.stringify({
          system_name: config.systemName || "Desconhecido",
          page_url: window.location.href,
          description: data.description,
          category: data.category,
          screenshot_path: screenshotPath,
          selection_rect: data.selectionRect || null,
          viewport: data.viewport || null,
          user_agent: navigator.userAgent,
          reporter_name: data.reporterName || null,
          reporter_email: data.reporterEmail || null,
        }),
      }).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            throw new Error(
              "Falha ao salvar o report (HTTP " + res.status + "). " + t
            );
          });
        }
      });
    });
  }

  // ============================================================
  // Limpeza / reset
  // ============================================================
  function removeNode(key) {
    if (nodes[key] && nodes[key].parentNode) {
      nodes[key].parentNode.removeChild(nodes[key]);
    }
    nodes[key] = null;
  }

  function reset() {
    removeNode("ctxBackdrop");
    removeNode("ctxMenu");
    removeNode("capturing");
    removeNode("overlay");
    removeNode("modalOverlay");
    phase = "idle";
    submitting = false;
    capture = null;
    selectionRect = null;
    croppedCanvas = null;
    pendingAction = null;
    refs = {};
  }

  // ============================================================
  // Menu de contexto (clique direito)
  // ============================================================
  function escolherAcaoExtra(acao) {
    removeNode("ctxBackdrop");
    removeNode("ctxMenu");
    if (typeof config.onAction !== "function") {
      reset();
      return;
    }
    if (acao.capture === false) {
      // sem print: entrega direto pro host (ex.: modal de ticket)
      reset();
      config.onAction(acao.id, null);
      return;
    }
    pendingAction = acao;
    startReport();
  }

  function openMenu(x, y) {
    phase = "menu";
    var extras = (config.extraActions || []).filter(function (a) {
      return a && a.id && a.label;
    });
    var altura = 26 + 44 * (1 + extras.length);
    var mx = Math.max(8, Math.min(x, window.innerWidth - 210));
    var my = Math.max(8, Math.min(y, window.innerHeight - altura));

    nodes.ctxBackdrop = el("div", {
      class: "bgr-ctx-backdrop",
      "data-html2canvas-ignore": "true",
      onclick: reset,
      oncontextmenu: function (e) {
        e.preventDefault();
        reset();
      },
    });
    var itens = [
      el("button", {
        type: "button",
        class: "bgr-ctx-item",
        html: BUG_SVG + "<span>Relatar problema</span>",
        onclick: startReport,
      }),
    ];
    extras.forEach(function (a) {
      itens.push(
        el("button", {
          type: "button",
          class: "bgr-ctx-item",
          html: (a.svg || BUG_SVG) + "<span>" + a.label + "</span>",
          onclick: function () {
            escolherAcaoExtra(a);
          },
        })
      );
    });
    nodes.ctxMenu = el(
      "div",
      {
        class: "bgr-ctx-menu",
        "data-html2canvas-ignore": "true",
        style: "left:" + mx + "px;top:" + my + "px;",
      },
      itens
    );
    document.body.appendChild(nodes.ctxBackdrop);
    document.body.appendChild(nodes.ctxMenu);
  }

  // ============================================================
  // Captura
  // ============================================================
  function startReport() {
    removeNode("ctxBackdrop");
    removeNode("ctxMenu");
    phase = "capturing";

    nodes.capturing = el("div", {
      class: "bgr-capturing",
      "data-html2canvas-ignore": "true",
      text: "Capturando a tela...",
    });
    document.body.appendChild(nodes.capturing);

    requestAnimationFrame(function () {
      captureViewport()
        .then(function (result) {
          removeNode("capturing");
          if (phase !== "capturing") return;
          capture = result;
          openSelection();
        })
        .catch(function (err) {
          console.error("[BugReporter] falha na captura:", err);
          removeNode("capturing");
          if (phase !== "capturing") return;
          capture = null;
          selectionRect = null;
          croppedCanvas = null;
          if (pendingAction) {
            // acao extra sem print possivel: abre o modal do host mesmo assim
            var acao = pendingAction;
            reset();
            config.onAction(acao.id, null);
            return;
          }
          openModal(
            "Nao foi possivel capturar a tela. Voce ainda pode descrever o problema."
          );
        });
    });
  }

  // ============================================================
  // Selecao da area
  // ============================================================
  function openSelection() {
    phase = "selecting";
    var rect = null;
    var start = null;
    var dragging = false;

    var img = el("img", {
      class: "bgr-screenshot",
      src: capture.dataUrl,
      alt: "",
      draggable: "false",
    });
    var dim = el("div", { class: "bgr-dim" });
    var selbox = el("div", { class: "bgr-selbox", style: "display:none;" });
    var instruction = el("div", {
      class: "bgr-instruction",
      text: "Arraste para selecionar a area com o problema · ESC para cancelar",
    });

    function norm(a, b) {
      return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y),
      };
    }
    function paint() {
      if (!rect) {
        selbox.style.display = "none";
        dim.style.display = "block";
        return;
      }
      dim.style.display = "none";
      selbox.style.display = "block";
      selbox.style.left = rect.x + "px";
      selbox.style.top = rect.y + "px";
      selbox.style.width = rect.width + "px";
      selbox.style.height = rect.height + "px";
    }

    nodes.overlay = el(
      "div",
      {
        class: "bgr-overlay",
        "data-html2canvas-ignore": "true",
        onmousedown: function (e) {
          if (e.button !== 0) return;
          e.preventDefault();
          dragging = true;
          start = { x: e.clientX, y: e.clientY };
          rect = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
          paint();
        },
        onmousemove: function (e) {
          if (!dragging) return;
          rect = norm(start, { x: e.clientX, y: e.clientY });
          paint();
        },
        onmouseup: function (e) {
          if (!dragging) return;
          dragging = false;
          var final = norm(start, { x: e.clientX, y: e.clientY });
          if (final.width < 8 || final.height < 8) {
            rect = null;
            paint();
            return;
          }
          finishSelection(final);
        },
      },
      [img, dim, selbox, instruction]
    );
    document.body.appendChild(nodes.overlay);
  }

  function finishSelection(rect) {
    croppedCanvas = cropCanvas(capture.canvas, rect, capture.viewport);
    selectionRect = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    removeNode("overlay");
    if (pendingAction) {
      // acao extra: entrega a captura pro host em vez do form padrao
      var acao = pendingAction;
      var payload = {
        canvas: croppedCanvas,
        dataUrl: croppedCanvas.toDataURL("image/png"),
        selectionRect: selectionRect,
        viewport: capture ? capture.viewport : null,
      };
      reset();
      config.onAction(acao.id, payload);
      return;
    }
    openModal(null);
  }

  // ============================================================
  // Modal de report
  // ============================================================
  function openModal(initialError) {
    phase = "form";
    var previewUrl = croppedCanvas
      ? croppedCanvas.toDataURL("image/png")
      : null;

    nodes.modalOverlay = el("div", {
      class: "bgr-modal-overlay",
      "data-html2canvas-ignore": "true",
      onmousedown: function (e) {
        if (e.target === e.currentTarget && !submitting) reset();
      },
    });
    nodes.modalCard = el("div", { class: "bgr-modal", role: "dialog" });
    nodes.modalOverlay.appendChild(nodes.modalCard);
    document.body.appendChild(nodes.modalOverlay);

    renderForm(previewUrl, initialError);
  }

  function renderForm(previewUrl, initialError) {
    var card = nodes.modalCard;
    card.innerHTML = "";

    var header = el("div", { class: "bgr-modal-header" }, [
      el("h3", { class: "bgr-modal-title", text: "Relatar problema" }),
      el("button", {
        type: "button",
        class: "bgr-close",
        text: "×",
        "aria-label": "Fechar",
        onclick: function () {
          if (!submitting) reset();
        },
      }),
    ]);

    var previewWrap = el("div", { class: "bgr-preview-wrap" }, [
      previewUrl
        ? el("img", {
            class: "bgr-preview",
            src: previewUrl,
            alt: "Area selecionada",
          })
        : el("div", {
            class: "bgr-preview-empty",
            text: "Sem imagem da tela",
          }),
      el("button", {
        type: "button",
        class: "bgr-reselect",
        text: previewUrl
          ? "Selecionar outra area"
          : "Selecionar uma area da tela",
        onclick: function () {
          if (submitting) return;
          removeNode("modalOverlay");
          if (capture) openSelection();
          else startReport();
        },
      }),
    ]);

    refs.textarea = el("textarea", {
      class: "bgr-textarea",
      rows: "4",
      placeholder: "Ex.: o botao Salvar nao funciona quando...",
    });
    var descLabel = el("label", { class: "bgr-label" }, [
      "Descreva o problema *",
      refs.textarea,
    ]);
    refs.fieldError = el("span", {
      class: "bgr-field-error",
      text: "Descreva o problema antes de enviar.",
      style: "display:none;",
    });

    refs.select = el(
      "select",
      { class: "bgr-select" },
      config.categories.map(function (c) {
        return el("option", { value: c, text: c });
      })
    );
    var catLabel = el("label", { class: "bgr-label" }, ["Tipo", refs.select]);

    var children = [header, previewWrap, descLabel, refs.fieldError, catLabel];

    // campo opcional de encaminhamento (so se o host forneceu opcoes)
    if (config.forwardOptions && config.forwardOptions.length) {
      refs.forwardSelect = el(
        "select",
        { class: "bgr-select" },
        [el("option", { value: "", text: "Nao encaminhar" })].concat(
          config.forwardOptions.map(function (o) {
            return el("option", { value: o.value, text: o.label });
          })
        )
      );
      children.push(
        el("label", { class: "bgr-label" }, [
          config.forwardLabel || "Encaminhar para (opcional)",
          refs.forwardSelect,
        ])
      );
    }

    if (!config.user) {
      refs.name = el("input", { class: "bgr-input", type: "text" });
      refs.email = el("input", { class: "bgr-input", type: "email" });
      children.push(
        el("div", { class: "bgr-row" }, [
          el("label", { class: "bgr-label" }, [
            "Seu nome (opcional)",
            refs.name,
          ]),
          el("label", { class: "bgr-label" }, [
            "Seu e-mail *",
            refs.email,
          ]),
        ])
      );
    }

    refs.errorBox = el("div", {
      class: "bgr-error",
      style: "display:none;",
    });
    if (initialError) {
      refs.errorBox.textContent = initialError;
      refs.errorBox.style.display = "block";
    }
    children.push(refs.errorBox);

    refs.cancelBtn = el("button", {
      type: "button",
      class: "bgr-btn-secondary",
      text: "Cancelar",
      onclick: function () {
        if (!submitting) reset();
      },
    });
    refs.submitBtn = el("button", {
      type: "button",
      class: "bgr-btn-primary",
      text: "Enviar report",
      onclick: handleSubmit,
    });
    children.push(
      el("div", { class: "bgr-actions" }, [refs.cancelBtn, refs.submitBtn])
    );

    children.forEach(function (c) {
      card.appendChild(c);
    });
    refs.textarea.focus();
  }

  function handleSubmit() {
    if (submitting) return;
    var description = refs.textarea.value.trim();
    if (!description) {
      refs.fieldError.style.display = "block";
      refs.textarea.focus();
      return;
    }
    refs.fieldError.style.display = "none";
    refs.errorBox.style.display = "none";

    if (refs.email) {
      var emailVal = refs.email.value.trim();
      if (!emailVal) {
        refs.errorBox.textContent = "Informe seu e-mail para enviar o report.";
        refs.errorBox.style.display = "block";
        refs.email.focus();
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        refs.errorBox.textContent = "O e-mail informado nao parece valido.";
        refs.errorBox.style.display = "block";
        refs.email.focus();
        return;
      }
    }

    submitting = true;
    refs.submitBtn.disabled = true;
    refs.cancelBtn.disabled = true;
    refs.submitBtn.textContent = "Enviando...";

    var rName = config.user
      ? config.user.name
      : refs.name
      ? refs.name.value.trim()
      : "";
    var rEmail = config.user
      ? config.user.email
      : refs.email
      ? refs.email.value.trim()
      : "";
    var category = refs.select.value;
    var forwardTo = refs.forwardSelect ? refs.forwardSelect.value : "";

    submitReport({
      screenshotCanvas: croppedCanvas,
      description: description,
      category: category,
      selectionRect: selectionRect,
      viewport: capture ? capture.viewport : null,
      reporterName: rName,
      reporterEmail: rEmail,
    })
      .then(function () {
        // encaminhamento opcional — best-effort: nao quebra o report
        if (forwardTo && typeof config.onForward === "function") {
          return Promise.resolve(
            config.onForward(forwardTo, {
              systemName: config.systemName,
              description: description,
              category: category,
              pageUrl: window.location.href,
              reporterName: rName,
              reporterEmail: rEmail,
              screenshotCanvas: croppedCanvas,
            })
          ).catch(function (err) {
            console.error("[BugReporter] falha ao encaminhar:", err);
          });
        }
      })
      .then(function () {
        submitting = false;
        renderSuccess();
      })
      .catch(function (err) {
        console.error("[BugReporter] falha ao enviar:", err);
        submitting = false;
        refs.submitBtn.disabled = false;
        refs.cancelBtn.disabled = false;
        refs.submitBtn.textContent = "Enviar report";
        refs.errorBox.textContent = err.message || "Erro ao enviar o report.";
        refs.errorBox.style.display = "block";
      });
  }

  function renderSuccess() {
    var card = nodes.modalCard;
    card.innerHTML = "";
    card.appendChild(
      el("div", { class: "bgr-success" }, [
        el("div", { class: "bgr-success-icon", text: "✓" }),
        el("h3", { class: "bgr-modal-title", text: "Falha reportada!" }),
        el("p", {
          class: "bgr-success-text",
          text:
            "Obrigado. Sua observacao foi registrada e sera analisada pela equipe.",
        }),
        el("button", {
          type: "button",
          class: "bgr-btn-primary",
          text: "Fechar",
          onclick: reset,
        }),
      ])
    );
  }

  // ============================================================
  // Botao flutuante
  // ============================================================
  function createFab() {
    if (document.getElementById("bgr-fab")) return;
    var fab = el("button", {
      id: "bgr-fab",
      type: "button",
      class: "bgr-fab",
      "data-html2canvas-ignore": "true",
      "aria-label": "Relatar problema",
      html: BUG_SVG + "<span>Relatar problema</span>",
      onclick: function () {
        if (phase === "idle") startReport();
      },
    });
    document.body.appendChild(fab);
  }

  // ============================================================
  // Eventos globais
  // ============================================================
  function onContextMenu(e) {
    // mantem o menu nativo do navegador quando o clique direito for em
    // cima de uma imagem (permite "salvar imagem como") ou de qualquer
    // elemento marcado com o atributo data-bug-reporter-ignore.
    var alvo = e.target;
    if (
      alvo &&
      alvo.closest &&
      alvo.closest("img, [data-bug-reporter-ignore]")
    ) {
      return;
    }
    e.preventDefault();
    if (phase !== "idle") return;
    openMenu(e.clientX, e.clientY);
  }

  function onKeyDown(e) {
    if (e.key !== "Escape") return;
    if (submitting) return;
    if (phase === "menu" || phase === "selecting" || phase === "form") reset();
  }

  // ============================================================
  // Inicializacao
  // ============================================================
  function applyConfig(opts) {
    if (!opts) return;
    Object.keys(opts).forEach(function (k) {
      if (opts[k] != null && opts[k] !== "") config[k] = opts[k];
    });
  }

  function setup() {
    injectStyles();
    var trigger = config.trigger;
    if (trigger === "contextmenu" || trigger === "both") {
      document.addEventListener("contextmenu", onContextMenu);
    }
    document.addEventListener("keydown", onKeyDown);
    if (trigger === "button" || trigger === "both") {
      createFab();
    }
  }

  function init(opts) {
    applyConfig(opts);
    if (initialized) return;
    initialized = true;
    if (!config.systemName) {
      console.warn("[BugReporter] 'systemName' nao informado.");
    }
    if (document.body) {
      setup();
    } else {
      document.addEventListener("DOMContentLoaded", setup);
    }
  }

  window.BugReporter = { init: init, __ready: true };

  // ---- auto-init a partir da tag <script> ----
  function autoInit() {
    var s = SCRIPT_EL;
    if (!s || !s.getAttribute("data-system-name")) {
      s = document.querySelector("script[data-system-name]");
    }
    if (s && s.getAttribute("data-system-name")) {
      init({
        systemName: s.getAttribute("data-system-name"),
        supabaseUrl: s.getAttribute("data-supabase-url"),
        supabaseKey: s.getAttribute("data-supabase-key"),
        trigger: s.getAttribute("data-trigger"),
      });
    } else if (window.BugReporterConfig) {
      init(window.BugReporterConfig);
    }
  }
  autoInit();
})();
