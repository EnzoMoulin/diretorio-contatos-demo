/* Consulta pública — fluxo idêntico ao original (GAS):
   Início (Órgãos/Comarcas) > Fóruns | Órgão > Fórum > Nó.
   Dados: /api/hierarquia. Sem gestão (isso é papel do /admin). */
(function () {
  "use strict";

  var estado = { dados: { municipios: [] }, municipioId: "", forumId: "", noId: "",
    mapa: null, geojson: null, carregando: false, inicializado: false };

  function $(id) { return document.getElementById(id); }
  function host() { return $("lista"); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  function fmtTipoContato(tipo) {
    var t = String(tipo || "").trim().toUpperCase();
    if (t === "E_MAIL" || t === "EMAIL" || t === "E-MAIL") return "E-mail";
    if (t === "WHATSAPP") return "WhatsApp";
    if (t === "RAMAL") return "Ramal";
    if (t === "FAX") return "Fax";
    if (t === "TELEFONE") return "Telefone";
    return tipo || "Contato";
  }

  function fmtTipoNo(tipo) {
    var mapa = { UNIDADE: "Unidade", SECRETARIA: "Secretaria", VARA: "Vara",
      JUIZADO: "Juizado", SETOR: "Setor", GABINETE: "Gabinete",
      ASSESSORIA: "Assessoria", SALAAUDIENCIA: "Sala de audiência",
      GENERICO: "Unidade organizacional" };
    return mapa[String(tipo || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase()] ||
      String(tipo || "Unidade organizacional");
  }

  function fmtValor(tipo, valor) {
    var t = String(tipo || "").toUpperCase();
    var s = String(valor || "").trim();
    var n = s.replace(/\D/g, "");
    if (!s) return "";
    if ((t.indexOf("TELEFONE") >= 0 || t.indexOf("WHATSAPP") >= 0 || t === "CELULAR") && n.indexOf("27") === 0) {
      if (n.length === 10) return "(" + n.slice(0, 2) + ") " + n.slice(2, 6) + "-" + n.slice(6);
      if (n.length === 11) return "(" + n.slice(0, 2) + ") " + n.slice(2, 7) + "-" + n.slice(7);
    }
    return s;
  }

  function hrefContato(tipo, valor) {
    var t = String(tipo || "").toUpperCase();
    var s = String(valor || "").trim();
    var n = s.replace(/\D/g, "");
    if (!s) return "";
    if (t === "WHATSAPP" && n) return "https://wa.me/" + (n.indexOf("55") === 0 ? n : "55" + n);
    if ((t === "TELEFONE" || t === "CELULAR") && n) return "tel:+55" + (n.indexOf("55") === 0 ? n.slice(2) : n);
    if (t === "E-MAIL" || t === "EMAIL" || t === "E_MAIL") return "mailto:" + encodeURIComponent(s);
    return "";
  }

  function linkEndereco(endereco) {
    var texto = String(endereco || "").trim();
    if (!texto) return '<span class="fc-muted">Endereço não informado</span>';
    return '<span class="fc-address-inline"><a class="fc-endereco" href="https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(texto) + '" target="_blank" rel="noopener noreferrer">📍 ' + esc(texto) + "</a>" +
      '<button type="button" class="fc-icon-btn fc-copy-btn" data-copy-value="' + esc(texto) +
      '" data-copy-label="Endereço" title="Copiar endereço" aria-label="Copiar endereço">⧉</button></span>';
  }

  function copiarTexto(texto) {
    var valor = String(texto || "").trim();
    if (!valor) return;
    function flash() {
      var btn = document.activeElement;
      if (!btn || !btn.textContent) return;
      var t = btn.textContent;
      btn.textContent = "✓";
      setTimeout(function () { btn.textContent = t; }, 1200);
    }
    function fallback() {
      try {
        var area = document.createElement("textarea");
        area.value = valor;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
        flash();
      } catch (e) {}
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(valor).then(flash, fallback);
    } else fallback();
  }

  function vincularCopias() {
    var btns = document.querySelectorAll("[data-copy-value]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.onclick = function (e) {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          copiarTexto(btn.getAttribute("data-copy-value"));
        };
      })(btns[i]);
    }
  }

  function todosNos(lista, saida) {
    saida = saida || [];
    (lista || []).forEach(function (no) { saida.push(no); todosNos(no.filhos || [], saida); });
    return saida;
  }

  function qtdSetores(lista) {
    return todosNos(lista || [], []).filter(function (no) {
      return String(no.tipo || "").toUpperCase() === "SETOR";
    }).length;
  }

  function rotuloQuantidade(valor, singular, plural) {
    var total = Number(valor || 0);
    return total > 0 ? total + " " + (total === 1 ? singular : plural) : "";
  }

  function badgeQuantidade(valor, singular, plural) {
    var texto = rotuloQuantidade(valor, singular, plural);
    return texto ? '<span class="fc-pill">' + esc(texto) + "</span>" : "";
  }

  function resumoQuantidades(itens) { return itens.filter(Boolean).join(" • "); }

  function encontrarMunicipio(id) {
    return (estado.dados.municipios || []).filter(function (m) { return String(m.id) === String(id); })[0] || null;
  }

  function ehOrgao(municipio) {
    return String(municipio && municipio.tipo || "").toUpperCase() === "ORGAO";
  }

  function encontrarForum(id) {
    var achado = null;
    (estado.dados.municipios || []).some(function (m) {
      var f = (m.foruns || []).filter(function (item) { return String(item.id) === String(id); })[0];
      if (f) { achado = f; return true; }
      return false;
    });
    return achado;
  }

  function encontrarNo(lista, id) {
    for (var i = 0; i < (lista || []).length; i++) {
      if (String(lista[i].id) === String(id)) return lista[i];
      var filho = encontrarNo(lista[i].filhos || [], id);
      if (filho) return filho;
    }
    return null;
  }

  function municipioAtual() { return encontrarMunicipio(estado.municipioId); }
  function forumAtual() { return encontrarForum(estado.forumId); }
  function raizAtual() {
    var m = municipioAtual();
    return ehOrgao(m) ? m : forumAtual();
  }
  function noAtual() {
    var raiz = raizAtual();
    return raiz ? encontrarNo(raiz.nos || [], estado.noId) : null;
  }

  function caminhoAteNo(lista, id, caminho) {
    caminho = caminho || [];
    for (var i = 0; i < (lista || []).length; i++) {
      var atual = caminho.concat(lista[i]);
      if (String(lista[i].id) === String(id)) return atual;
      var encontrado = caminhoAteNo(lista[i].filhos || [], id, atual);
      if (encontrado) return encontrado;
    }
    return null;
  }

  function breadcrumbHtml(municipio, forum, no) {
    var itens = [{ tipo: "MUNICIPIO", id: municipio.id, nome: municipio.nome }];
    if (forum) itens.push({ tipo: "FORUM", id: forum.id, nome: forum.nome });
    if (no) {
      (caminhoAteNo((forum || municipio).nos || [], no.id, []) || []).forEach(function (item) {
        itens.push({ tipo: "NO", id: item.id, nome: item.nome });
      });
    }
    return '<nav class="***" aria-label="Caminho da estrutura">' + itens.map(function (item, indice) {
      var ultimo = indice === itens.length - 1;
      var conteudo = ultimo
        ? '<span class="fc-breadcrumb-current" aria-current="page">' + esc(item.nome) + "</span>"
        : '<button type="button" data-breadcrumb-type="' + esc(item.tipo) + '" data-breadcrumb-id="' +
          esc(item.id) + '">' + esc(item.nome) + "</button>";
      return conteudo + (ultimo ? "" : '<span class="fc-breadcrumb-separator" aria-hidden="true">›</span>');
    }).join("") + "</nav>";
  }

  function vincularBreadcrumbs() {
    var btns = document.querySelectorAll("[data-breadcrumb-type]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.onclick = function () {
          var tipo = btn.getAttribute("data-breadcrumb-type");
          var id = btn.getAttribute("data-breadcrumb-id");
          if (tipo === "MUNICIPIO") {
            estado.municipioId = id;
            estado.forumId = "";
            estado.noId = "";
            if (ehOrgao(municipioAtual())) renderOrgao();
            else renderForuns();
          } else if (tipo === "FORUM") {
            estado.forumId = id;
            estado.noId = "";
            renderForum();
          } else if (tipo === "NO") abrirNo(id);
        };
      })(btns[i]);
    }
  }

  function opcoesComarcas(municipios, selecionado) {
    return '<option value="">Selecione a Comarca/Órgão</option>' + (municipios || []).map(function (m) {
      return '<option value="' + esc(m.id) + '"' + (String(m.id) === String(selecionado) ? " selected" : "") + ">" + esc(m.nome) + "</option>";
    }).join("");
  }

  function botaoImpressaoLocalidade(tipo, tipoNo) {
    var rotulo = tipo === "MUNICIPIO" ? "Órgão" : (tipo === "FORUM" ? "Fórum" : (tipoNo === "Setor" ? "Setor" : "Unidade"));
    var artigo = rotulo === "Unidade" ? "da" : "do";
    var id = tipo === "FORUM" || tipo === "MUNICIPIO" ? "fc-print-forum" : "fc-print-unit";
    return '<div class="fc-print-footer"><button type="button" class="fc-btn" data-scroll-top title="Voltar ao início deste painel">↑ Voltar ao topo</button>' +
      '<button type="button" class="fc-btn" id="' + id + '" title="Imprimir / Salvar PDF dos contatos ' +
      artigo + " " + rotulo + '">🖨 Imprimir / Salvar PDF</button></div>';
  }

  function contatosCards(contatos) {
    if (!contatos || !contatos.length) return '<div class="fc-empty">Nenhum contato cadastrado.</div>';
    return '<div class="fc-contatos">' + contatos.map(function (c) {
      var tipo = fmtTipoContato(c.tipo);
      var valor = fmtValor(c.tipo, c.valor);
      var href = hrefContato(c.tipo, c.valor);
      var externo = /^(https?:|mailto:)/.test(href);
      var valorHtml = href
        ? '<a class="fc-contato-valor" href="' + esc(href) + '" ' +
          (externo ? 'target="_blank" rel="noopener noreferrer"' : "") + ">" + esc(valor) + "</a>"
        : '<span class="fc-contato-valor">' + esc(valor) + "</span>";
      var acoes = '<div class="fc-contato-actions">' +
        '<button type="button" class="fc-icon-btn fc-copy-btn" data-copy-value="' + esc(valor) +
        '" data-copy-label="' + esc(tipo) + '" title="Copiar ' + esc(tipo) + '" aria-label="Copiar ' + esc(tipo) + '">⧉</button></div>';
      var descricao = String(c.descricao || "").trim();
      var descricaoHtml = descricao && descricao.toLocaleLowerCase("pt-BR") !== String(tipo).toLocaleLowerCase("pt-BR")
        ? "<h4>" + esc(descricao) + "</h4>" : "";
      var observacao = String(c.observacao || "").trim();
      var observacaoHtml = observacao
        ? '<p class="fc-contato-observacao' + (/contato provis[oó]rio/i.test(observacao) ? " fc-contato-observacao--provisoria" : "") + '">' + esc(observacao) + "</p>"
        : "";
      return '<article class="fc-contato">' +
        '<div class="fc-contato-main"><span class="fc-contato-tipo">' + esc(tipo) + "</span>" + descricaoHtml + observacaoHtml + "</div>" +
        '<div class="fc-contato-side">' + valorHtml + acoes + "</div></article>";
    }).join("") + "</div>";
  }

  function vincularAcoes() {
    vincularCopias();
    var tops = document.querySelectorAll("[data-scroll-top]");
    for (var i = 0; i < tops.length; i++) {
      tops[i].onclick = function () {
        var painel = document.querySelector(".fc-panel");
        if (painel && typeof painel.scrollTo === "function") painel.scrollTo({ top: 0, behavior: "smooth" });
        else if (host()) host().scrollIntoView({ behavior: "smooth", block: "start" });
      };
    }
  }

  function renderInicio() {
    var c = host();
    if (!c) return;
    estado.municipioId = "";
    estado.forumId = "";
    estado.noId = "";
    var municipios = (estado.dados && estado.dados.municipios) || [];
    var uteis = (estado.dados && estado.dados.uteis) || [];
    var totalOrgaos = municipios.filter(ehOrgao).length;
    var totalComarcas = municipios.length - totalOrgaos;
    var cardsMunicipios = municipios.map(function (m) {
      var setores = ehOrgao(m)
        ? qtdSetores(m.nos || [])
        : (m.foruns || []).reduce(function (total, f) { return total + qtdSetores(f.nos || []); }, 0);
      return '<div class="fc-card" data-nav="municipio" data-mun="' + esc(m.id) + '">' +
        '<div class="fc-card-head"><div><h4>' + esc(m.nome) + "</h4></div>" +
        (ehOrgao(m) ? '<span class="fc-pill fc-total-orgaos">Órgão</span>' : "") + "</div>" +
        '<div class="fc-meta">' +
        (ehOrgao(m) ? "" : badgeQuantidade(m.qtdForuns, "Fórum", "Fóruns")) +
        badgeQuantidade(m.qtdUnidades, "Unidade", "Unidades") +
        badgeQuantidade(setores, "Setor", "Setores") +
        badgeQuantidade(m.qtdContatos, "Contato", "Contatos") + "</div></div>";
    }).join("");
    c.innerHTML = '<div class="fc-head"><div><h2 class="fc-title">Contatos do PJES</h2>' +
      '<p class="fc-subtitle fc-subtitle--intro">Consulte a estrutura completa por Comarca/Órgão, Fórum, Unidade e Setor. Selecione uma Comarca/Órgão no mapa, no menu suspenso ou na lista abaixo.</p></div></div>' +
      (municipios.length ? '<div class="fc-catalog-counts">' +
        (totalOrgaos ? '<span class="fc-pill fc-total-orgaos">' + esc(rotuloQuantidade(totalOrgaos, "Órgão", "Órgãos")) + "</span>" : "") +
        (totalComarcas ? '<span class="fc-pill fc-total-comarcas">' + esc(rotuloQuantidade(totalComarcas, "Comarca", "Comarcas")) + "</span>" : "") + "</div>" : "") +
      '<select id="fc-comarca" class="fc-select">' + opcoesComarcas(municipios, "") + "</select>" +
      '<button type="button" class="fc-btn fc-print-all" id="fc-print-all" title="Imprimir / Salvar PDF de todos os contatos">🖨 Imprimir / Salvar PDF</button>' +
      '<div class="fc-section"><h3>Comarcas e Órgãos</h3><div class="fc-municipios-grid">' + cardsMunicipios + "</div></div>" +
      (uteis.length ? '<div class="fc-section"><h3>Telefones úteis</h3><div class="fc-contatos">' + uteis.map(function (u) {
        var href = hrefContato(u.tipo, u.valor);
        var valorHtml = href ? '<a class="fc-contato-valor" href="' + esc(href) + '">' + esc(u.valor) + "</a>" : '<span class="fc-contato-valor">' + esc(u.valor) + "</span>";
        return '<article class="fc-contato"><div class="fc-contato-main"><span class="fc-contato-tipo">' + esc(fmtTipoContato(u.tipo)) + "</span><h4>" + esc(u.nome || u.valor) + "</h4></div>" +
          '<div class="fc-contato-side">' + valorHtml + "</div></article>";
      }).join("") + "</div></div>" : "");
    var seletor = document.getElementById("fc-comarca");
    if (seletor) seletor.onchange = function () { if (seletor.value) abrirMunicipio(seletor.value); };
    var imprimir = document.getElementById("fc-print-all");
    if (imprimir) imprimir.onclick = imprimirTudo;
    var cards = document.querySelectorAll("[data-mun]");
    for (var i = 0; i < cards.length; i++) {
      (function (el) {
        el.onclick = function () { abrirMunicipio(el.getAttribute("data-mun")); };
      })(cards[i]);
    }
    vincularAcoes();
    destacarMapa("");
  }

  function abrirMunicipio(id) {
    estado.municipioId = String(id);
    estado.forumId = "";
    estado.noId = "";
    var m = municipioAtual();
    if (!m) return;
    if (ehOrgao(m)) renderOrgao();
    else renderForuns();
    destacarMapa(m.codigoIbge);
  }

  function renderForuns() {
    var c = host();
    var m = municipioAtual();
    if (!c || !m) return;
    if (ehOrgao(m)) return renderOrgao();
    var resumo = resumoQuantidades([
      rotuloQuantidade(m.qtdForuns, "Fórum", "Fóruns"),
      rotuloQuantidade(m.qtdUnidades, "Unidade", "Unidades"),
      rotuloQuantidade((m.foruns || []).reduce(function (total, f) { return total + qtdSetores(f.nos || []); }, 0), "Setor", "Setores"),
      rotuloQuantidade(m.qtdContatos, "Contato", "Contatos")
    ]);
    c.innerHTML = '<button type="button" class="fc-back" id="fc-back-home">← Comarcas/Órgãos</button>' +
      '<div class="fc-head"><div><h2 class="fc-title">' + esc(m.nome) + "</h2>" +
      '<p class="fc-subtitle">' + esc(resumo) + "</p></div></div>" +
      '<select id="fc-comarca" class="fc-select">' + opcoesComarcas(estado.dados.municipios || [], m.id) + "</select>" +
      '<div class="fc-section"><h3>Fóruns</h3>' +
      (m.foruns || []).map(function (f) {
        return '<div class="fc-card" data-nav="forum" data-forum="' + esc(f.id) + '">' +
          '<div class="fc-card-head"><div><h4>' + esc(f.nome) + "</h4>" + linkEndereco(f.endereco) +
          "</div></div>" +
          '<div class="fc-meta">' + badgeQuantidade(f.qtdUnidades, "Unidade", "Unidades") +
          badgeQuantidade(qtdSetores(f.nos || []), "Setor", "Setores") +
          badgeQuantidade(f.qtdContatos, "Contato", "Contatos") + "</div></div>";
      }).join("") + "</div>";
    document.getElementById("fc-back-home").onclick = renderInicio;
    var seletor = document.getElementById("fc-comarca");
    if (seletor) seletor.onchange = function () { if (seletor.value) abrirMunicipio(seletor.value); };
    var cards = document.querySelectorAll('[data-nav="forum"]');
    for (var i = 0; i < cards.length; i++) {
      (function (el) {
        el.onclick = function () { abrirForum(el.getAttribute("data-forum")); };
      })(cards[i]);
    }
    vincularAcoes();
    destacarMapa(m.codigoIbge);
  }

  function renderOrgao() {
    var c = host();
    var m = municipioAtual();
    if (!c || !m || !ehOrgao(m)) return;
    var resumo = resumoQuantidades([
      rotuloQuantidade(m.qtdUnidades, "Unidade", "Unidades"),
      rotuloQuantidade(qtdSetores(m.nos || []), "Setor", "Setores"),
      rotuloQuantidade(m.qtdContatos, "Contato", "Contatos")
    ]);
    c.innerHTML = '<button type="button" class="fc-back" id="fc-back-home">← Comarcas/Órgãos</button>' +
      '<div class="fc-head"><div><h2 class="fc-title">' + esc(m.nome) + "</h2>" +
      '<p class="fc-subtitle">' + esc(resumo) + "</p>" + breadcrumbHtml(m, null, null) + "</div></div>" +
      '<select id="fc-comarca" class="fc-select">' + opcoesComarcas(estado.dados.municipios || [], m.id) + "</select>" +
      '<div class="fc-meta"><span class="fc-pill fc-total-orgaos">Órgão</span>' +
      badgeQuantidade(m.qtdUnidades, "Unidade", "Unidades") + "</div>" +
      '<div class="fc-address-row"><div class="fc-inherit"><strong>Endereço do órgão:</strong> ' + linkEndereco(m.endereco) +
      (m.cep ? " • CEP " + esc(m.cep) : "") + "</div></div>" +
      '<div class="fc-section"><div class="fc-section-title"><h3>Contatos gerais</h3></div>' +
      contatosCards(m.contatos || []) + "</div>" +
      '<div class="fc-section"><div class="fc-section-title"><h3>Unidades e Setores</h3></div>' +
      ((m.nos || []).length ? (m.nos || []).map(cardNo).join("") : '<div class="fc-empty">Nenhuma Unidade cadastrada.</div>') +
      "</div>" + botaoImpressaoLocalidade("MUNICIPIO");
    document.getElementById("fc-back-home").onclick = renderInicio;
    var seletor = document.getElementById("fc-comarca");
    if (seletor) seletor.onchange = function () {
      if (this.value && String(this.value) !== String(estado.municipioId)) abrirMunicipio(this.value);
    };
    document.getElementById("fc-print-forum").onclick = imprimirOrgao;
    var cards = document.querySelectorAll("[data-no]");
    for (var i = 0; i < cards.length; i++) {
      (function (el) {
        el.onclick = function () { abrirNo(el.getAttribute("data-no")); };
      })(cards[i]);
    }
    vincularBreadcrumbs();
    vincularAcoes();
    destacarMapa(m.codigoIbge);
  }

  function abrirForum(id) {
    estado.forumId = String(id);
    estado.noId = "";
    renderForum();
  }

  function cardNo(no) {
    var tipo = fmtTipoNo(no.tipo);
    return '<div class="fc-card" data-nav="no" data-no="' + esc(no.id) + '">' +
      '<div class="fc-card-head"><div><h4>' + esc(no.nome) + "</h4></div></div>" +
      '<div class="fc-meta"><span class="fc-pill fc-pill-type">' + esc(tipo) + "</span>" +
      badgeQuantidade(qtdSetores(no.filhos || []), "Setor", "Setores") +
      badgeQuantidade(no.qtdContatos, "Contato", "Contatos") + "</div></div>";
  }

  function renderForum() {
    var c = host();
    var f = forumAtual();
    var m = municipioAtual();
    if (!c || !f || !m) return;
    c.innerHTML = '<button type="button" class="fc-back" id="fc-back-municipio">← ' + esc(m.nome) + "</button>" +
      '<div class="fc-head"><div><h2 class="fc-title">' + esc(f.nome) + "</h2>" +
      breadcrumbHtml(m, f, null) + "</div></div>" +
      '<div class="fc-meta"><span class="fc-pill fc-pill-type">Fórum</span>' +
      badgeQuantidade(f.qtdUnidades, "Unidade", "Unidades") + "</div>" +
      '<div class="fc-address-row"><div class="fc-inherit"><strong>Endereço do Fórum:</strong> ' + linkEndereco(f.endereco) +
      (f.cep ? " • CEP " + esc(f.cep) : "") + "</div></div>" +
      '<div class="fc-section"><div class="fc-section-title"><h3>Contatos gerais</h3></div>' +
      contatosCards(f.contatos || []) + "</div>" +
      '<div class="fc-section"><div class="fc-section-title"><h3>Unidades e Setores</h3></div>' +
      ((f.nos || []).length ? (f.nos || []).map(cardNo).join("") : '<div class="fc-empty">Nenhuma Unidade cadastrada.</div>') +
      "</div>" + botaoImpressaoLocalidade("FORUM");
    document.getElementById("fc-back-municipio").onclick = renderForuns;
    document.getElementById("fc-print-forum").onclick = imprimirForum;
    var cards = document.querySelectorAll("[data-no]");
    for (var i = 0; i < cards.length; i++) {
      (function (el) {
        el.onclick = function () { abrirNo(el.getAttribute("data-no")); };
      })(cards[i]);
    }
    vincularBreadcrumbs();
    vincularAcoes();
    destacarMapa(m.codigoIbge);
  }

  function abrirNo(id) {
    estado.noId = String(id);
    renderNo();
  }

  function encontrarPai(lista, id, pai) {
    for (var i = 0; i < (lista || []).length; i++) {
      if (String(lista[i].id) === String(id)) return pai || null;
      var achado = encontrarPai(lista[i].filhos || [], id, lista[i]);
      if (achado) return achado;
    }
    return null;
  }

  function renderNo() {
    var c = host();
    var f = forumAtual();
    var m = municipioAtual();
    var raiz = raizAtual();
    var no = noAtual();
    if (!c || !raiz || !m || !no) return;
    var pai = encontrarPai(raiz.nos || [], no.id, null);
    var tipo = fmtTipoNo(no.tipo);
    var tipoTela = String(no.tipo || "").toUpperCase() === "SETOR" ? "Setor" : "Unidade";
    c.innerHTML =
      '<button type="button" class="fc-back" id="fc-back-no">← ' + esc(pai ? pai.nome : raiz.nome) + "</button>" +
      '<div class="fc-head"><div><h2 class="fc-title">' + esc(no.nome) + "</h2>" +
      breadcrumbHtml(m, f, no) + "</div></div>" +
      '<div class="fc-meta"><span class="fc-pill fc-pill-type">' + esc(tipo) + "</span>" +
      badgeQuantidade(qtdSetores(no.filhos || []), "Setor", "Setores") + "</div>" +
      '<div class="fc-address-row"><div class="fc-inherit"><strong>Endereço:</strong> ' + linkEndereco(no.enderecoExibicao) +
      (no.cepExibicao ? " • CEP " + esc(no.cepExibicao) : "") +
      (no.endereco ? "" : ' <span class="fc-muted">(' + (pai ? "herdado da Unidade" : (ehOrgao(m) ? "herdado do Órgão" : "herdado do Fórum")) + ")</span>") + "</div></div>" +
      '<div class="fc-section"><div class="fc-section-title"><h3>Contatos ' + (tipoTela === "Setor" ? "deste setor" : "desta Unidade") + "</h3></div>" +
      contatosCards(no.contatos || []) + "</div>" +
      ((no.filhos || []).length
        ? '<div class="fc-section"><div class="fc-section-title"><h3>Setores</h3></div>' +
          no.filhos.map(cardNo).join("") + "</div>"
        : "") +
      botaoImpressaoLocalidade("UNIDADE", tipoTela);
    document.getElementById("fc-back-no").onclick = function () {
      if (pai) abrirNo(pai.id);
      else { estado.noId = ""; if (ehOrgao(m)) renderOrgao(); else renderForum(); }
    };
    document.getElementById("fc-print-unit").onclick = imprimirUnidade;
    var cards = document.querySelectorAll("[data-no]");
    for (var i = 0; i < cards.length; i++) {
      (function (el) {
        el.onclick = function () { abrirNo(el.getAttribute("data-no")); };
      })(cards[i]);
    }
    vincularBreadcrumbs();
    vincularAcoes();
    destacarMapa(m.codigoIbge);
  }

  /* ---- impressão (janela de impressão, como no original) ---- */
  function contatoPrint(c) {
    var tipo = fmtTipoContato(c.tipo);
    var descricao = String(c.descricao || "").trim();
    var observacao = String(c.observacao || "").trim();
    var complemento = descricao && descricao.toLocaleLowerCase("pt-BR") !== String(tipo).toLocaleLowerCase("pt-BR")
      ? " — " + esc(descricao) : "";
    var nota = observacao ? '<small class="note">' + esc(observacao) + "</small>" : "";
    return "<li><strong>" + esc(tipo) + ":</strong> " + esc(c.valor || "") + complemento + nota + "</li>";
  }

  function noPrint(no, nivel) {
    nivel = nivel || 0;
    var titulo = Math.min(6, nivel + 3);
    var contatos = (no.contatos || []).length
      ? "<ul>" + (no.contatos || []).map(contatoPrint).join("") + "</ul>"
      : '<p class="muted">Sem contatos diretos.</p>';
    return '<section class="unit"><h' + titulo + ">" + esc(no.nome) + "</h" + titulo + ">" +
      '<p class="meta">' + esc(fmtTipoNo(no.tipo)) + " • " +
      esc(no.enderecoExibicao || "Endereço não informado") +
      (no.cepExibicao ? " • CEP " + esc(no.cepExibicao) : "") + "</p>" +
      contatos + (no.filhos || []).map(function (filho) { return noPrint(filho, nivel + 1); }).join("") +
      "</section>";
  }

  function forumPrint(f, municipioNome) {
    var contatos = (f.contatos || []).length
      ? "<ul>" + (f.contatos || []).map(contatoPrint).join("") + "</ul>"
      : '<p class="muted">Sem contatos gerais.</p>';
    return '<section class="forum"><h2>' + esc(f.nome) + "</h2>" +
      '<p class="meta">' + esc(municipioNome || "") + " • " +
      esc(f.endereco || "Endereço não informado") +
      (f.cep ? " • CEP " + esc(f.cep) : "") + "</p>" +
      contatos + (f.nos || []).map(function (no) { return noPrint(no, 0); }).join("") + "</section>";
  }

  function abrirImpressao(titulo, corpo) {
    var w = window.open("", "_blank");
    if (!w) return;
    var css =
      "body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:24px;line-height:1.45}" +
      "h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;border-bottom:2px solid #0f172a;padding-bottom:5px;margin-top:24px}" +
      "h3,h4,h5,h6{font-size:15px;margin:16px 0 4px}.meta{color:#64748b;font-size:11px;margin:0 0 8px}.muted{color:#94a3b8;font-style:italic;font-size:12px}" +
      "ul{margin:5px 0 10px;padding-left:20px}li{font-size:12px;margin:2px 0}.note{display:block;color:#64748b;font-size:9px;margin-top:1px}.forum{break-before:auto}.unit{break-inside:auto;page-break-inside:auto;border-left:2px solid #e2e8f0;padding-left:10px;margin:9px 0}.unit>h3,.unit>h4,.unit>h5,.unit>h6{break-after:avoid-page;page-break-after:avoid}.unit>ul{break-inside:avoid-page;page-break-inside:avoid}" +
      "@media print{@page{size:A4 portrait;margin:12mm}html,body{margin:0;padding:0}.forum,.unit{break-before:auto;page-break-before:auto}}";
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(titulo) +
      "</title><style>" + css + "</style></head><body><h1>" + esc(titulo) +
      '<p class="meta">Gerado em ' + esc(new Date().toLocaleString("pt-BR")) +
      "</p>" + corpo + "<script>window.onload=function(){setTimeout(function(){window.print();},250)}<\/script></body></html>";
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function imprimirTudo() {
    var municipios = estado.dados.municipios || [];
    var corpo = municipios.map(function (m) {
      if (ehOrgao(m)) return forumPrint({ nome: m.nome, endereco: m.endereco, cep: m.cep, contatos: m.contatos || [], nos: m.nos || [] }, "Órgão");
      return "<section><h2>" + esc(m.nome) + "</h2>" +
        (m.foruns || []).map(function (f) { return forumPrint(f, m.nome); }).join("") + "</section>";
    }).join("");
    abrirImpressao("Todos os contatos do PJES", corpo || '<p class="muted">Nenhum contato cadastrado.</p>');
  }

  function imprimirForum() {
    var f = raizAtual();
    var m = municipioAtual();
    if (!f || !m) return;
    abrirImpressao("Contatos — " + f.nome, forumPrint(f, ehOrgao(m) ? "Órgão" : m.nome));
  }

  function imprimirOrgao() {
    var m = municipioAtual();
    if (!m) return;
    abrirImpressao("Contatos — " + m.nome, forumPrint(
      { nome: m.nome, endereco: m.endereco, cep: m.cep, contatos: m.contatos || [], nos: m.nos || [] }, "Órgão"));
  }

  function imprimirUnidade() {
    var no = noAtual();
    var raiz = raizAtual();
    if (!no || !raiz) return;
    abrirImpressao("Contatos — " + no.nome, noPrint(no, 0));
  }

  /* ---- mapa (GeoJSON IBGE, como no original) ---- */
  var GEOJSON_URL = "https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-32-mun.json";

  function codigoMunicipio(feature) {
    var p = feature && feature.properties || {};
    return String(p.CD_MUN || p.codmun || p.id || p.code || "").replace(/\D/g, "");
  }

  function municipioComContatos(codigo) {
    return (estado.dados.municipios || []).some(function (m) {
      return String(m.codigoIbge || "").replace(/\D/g, "") === codigo && Number(m.qtdContatos || 0) > 0;
    });
  }

  function estiloMunicipio(feature) {
    var tem = municipioComContatos(codigoMunicipio(feature));
    return tem
      ? { color: "#2563eb", weight: 1.2, fillColor: "#60a5fa", fillOpacity: 0.42 }
      : { color: "#94a3b8", weight: 0.8, fillColor: "#cbd5e1", fillOpacity: 0.24 };
  }

  function destacarMapa(codigoIbge) {
    if (!estado.mapa || !estado.geojson) return;
    var alvo = String(codigoIbge || "").replace(/\D/g, "");
    estado.geojson.eachLayer(function (layer) {
      var cod = codigoMunicipio(layer.feature);
      var base = estiloMunicipio(layer.feature);
      if (!alvo) { layer.setStyle(base); return; }
      var ativo = cod === alvo;
      layer.setStyle({
        color: ativo ? "#0f172a" : base.color,
        weight: ativo ? 3 : base.weight,
        fillColor: ativo ? "#00adb5" : base.fillColor,
        fillOpacity: ativo ? 0.58 : base.fillOpacity
      });
    });
  }

  function iniciarMapa() {
    if (typeof L === "undefined") {
      var msg = $("map-msg");
      if (msg) msg.textContent = "Mapa indisponível offline — use os menus do painel.";
      setTimeout(iniciarMapa, 2000);
      return;
    }
    try {
      if (estado.mapa) estado.mapa.remove();
      estado.mapa = L.map("map", { scrollWheelZoom: true }).setView([-19.7, -40.5], 7.6);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap"
      }).addTo(estado.mapa);
      fetch(GEOJSON_URL).then(function (r) { return r.json(); }).then(function (data) {
        estado.geojson = L.geoJSON(data, {
          style: estiloMunicipio,
          onEachFeature: function (feature, layer) {
            var codigo = codigoMunicipio(feature);
            var p = feature.properties || {};
            var nome = String(p.name || "Comarca");
            var tem = municipioComContatos(codigo);
            layer.bindTooltip(
              esc(nome) + (tem ? "<br><small>Possui contatos cadastrados</small>" : "<br><small>Sem contatos cadastrados</small>"),
              { sticky: true });
            if (tem) {
              layer.on("click", function () {
                var m = (estado.dados.municipios || []).filter(function (x) {
                  return String(x.codigoIbge || "").replace(/\D/g, "") === codigo;
                })[0];
                if (m) abrirMunicipio(m.id);
              });
            }
          }
        }).addTo(estado.mapa);
        var legenda = L.control({ position: "bottomright" });
        legenda.onAdd = function () {
          var div = L.DomUtil.create("div", "fc-map-legenda");
          div.innerHTML = '<span class="tem-contato">● Comarcas com contatos</span>' +
            '<span class="sem-contato">● Sem contatos cadastrados</span>';
          return div;
        };
        legenda.addTo(estado.mapa);
        estado.mapa.fitBounds(estado.geojson.getBounds(), { padding: [3, 3] });
        var msg2 = $("map-msg");
        if (msg2) msg2.textContent = "";
      }).catch(function () {
        var msg3 = $("map-msg");
        if (msg3) msg3.textContent = "Mapa indisponível offline — use os menus do painel.";
      });
      if (window.ResizeObserver) {
        try {
          new ResizeObserver(function () {
            try { estado.mapa.invalidateSize(); } catch (e) {}
          }).observe(document.getElementById("map"));
        } catch (e) {}
      }
    } catch (e) {}
  }

  function recarregar(mostrarCarregando) {
    if (estado.carregando) return;
    estado.carregando = true;
    if (mostrarCarregando && host()) host().innerHTML = '<div class="fc-empty">Carregando contatos...</div>';
    fetch("/api/hierarquia").then(function (r) { return r.json(); }).then(function (dados) {
      estado.carregando = false;
      estado.dados = dados && dados.municipios ? dados : { municipios: [] };
      renderInicio();
    }).catch(function (erro) {
      estado.carregando = false;
      if (host()) {
        host().innerHTML = '<div class="fc-empty">Não foi possível carregar os contatos. ' +
          esc((erro && erro.message) || erro) + ' <button type="button" class="fc-btn" id="fc-retry">Tentar novamente</button></div>';
        var retry = document.getElementById("fc-retry");
        if (retry) retry.onclick = function () { recarregar(true); };
      }
    });
  }

  /* ---- menu + tema (padrão v2) ---- */
  function aplicarTema() {
    var dark = (localStorage.getItem("demo-theme") || "light") === "dark";
    document.body.dataset.theme = dark ? "dark" : "light";
    var t = $("toggle-dark-mode");
    if (t) t.checked = dark;
  }

  document.addEventListener("DOMContentLoaded", function () {
    aplicarTema();
    var tg = $("toggle-dark-mode");
    if (tg) tg.onchange = function (e) {
      localStorage.setItem("demo-theme", e.target.checked ? "dark" : "light");
      aplicarTema();
    };
    var itens = document.querySelectorAll('.menu-item[data-view]');
    for (var i = 0; i < itens.length; i++) {
      (function (btn) {
        btn.onclick = function () {
          var all = document.querySelectorAll(".menu-item");
          for (var j = 0; j < all.length; j++) all[j].classList.remove("active");
          btn.classList.add("active");
          var v = btn.getAttribute("data-view");
          ["consulta", "config", "manual"].forEach(function (x) { $("view-" + x).classList.add("hidden"); });
          $("view-" + v).classList.remove("hidden");
          if (v === "consulta") { recarregar(false); }
        };
      })(itens[i]);
    }
    recarregar(true);
    setTimeout(iniciarMapa, 0);
  });

  window.recarregarNavegacaoForum = function () { recarregar(false); };
  window.setLoc = function (id) { abrirMunicipio(String(id)); };
})();
