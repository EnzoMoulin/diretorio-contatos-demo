/* Consulta pública: busca + navegação por níveis em cards + mapa. */
const $ = id => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

let sel = { loc: '', uni: '', set: '' };
let locs = [];

const get = async (url) => await (await fetch(url)).json();

function optLabel(selId) {
  const s = $(selId);
  return s.selectedIndex > 0 ? s.options[s.selectedIndex].text : '';
}

async function loadLocs() {
  $('sel-loc').innerHTML = '<option value="">Selecione um município</option>' +
    locs.map(l => `<option value="${l.id}">${esc(l.nome)} (${l.total})</option>`).join('');
}

async function onLoc(skip) {
  sel.loc = $('sel-loc').value; sel.uni = ''; sel.set = '';
  const su = $('sel-uni'), ss = $('sel-set');
  su.innerHTML = '<option value="">Unidade…</option>';
  ss.innerHTML = '<option value="">Setor…</option>';
  ss.disabled = true;
  if (sel.loc) {
    const unis = await get('/api/unidades?localidade_id=' + sel.loc);
    su.innerHTML += unis.map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join('');
    su.disabled = false;
  } else su.disabled = true;
  if (!skip) sync();
}

async function onUni(skip) {
  sel.uni = $('sel-uni').value; sel.set = '';
  const ss = $('sel-set');
  ss.innerHTML = '<option value="">Setor…</option>';
  if (sel.uni) {
    const sets = await get('/api/setores?unidade_id=' + sel.uni);
    ss.innerHTML += sets.map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join('');
    ss.disabled = false;
  } else ss.disabled = true;
  if (!skip) sync();
}

function onSet(skip) {
  sel.set = $('sel-set').value;
  if (!skip) sync();
}

async function navTo(loc, uni, set) {
  $('sel-loc').value = loc || '';
  await onLoc(true);
  if (uni) {
    $('sel-uni').value = uni;
    await onUni(true);
  }
  if (set) $('sel-set').value = set;
  onSet(true);
  sync();
}

function setLoc(id) { navTo(String(id)); }

function nomeLimpo(selId) {
  return optLabel(selId).replace(/ \(\d+\)( ✓)?$/, '').replace(/ ✓$/, '');
}

function renderCrumb() {
  const c = $('crumb');
  if (!sel.loc) { c.innerHTML = ''; c.classList.add('hidden'); return; }
  c.classList.remove('hidden');
  const loc = esc(nomeLimpo('sel-loc'));
  const uni = sel.uni ? esc(nomeLimpo('sel-uni')) : '';
  const set = sel.set ? esc(nomeLimpo('sel-set')) : '';
  c.innerHTML =
    (sel.uni || sel.set ? `<button type="button" data-c="loc">${loc}</button>` : `<span>${loc}</span>`) +
    (sel.uni ? ` › ` + (sel.set ? `<button type="button" data-c="uni">${uni}</button>` : `<span>${uni}</span>`) : '') +
    (sel.set ? ` › <span>${set}</span>` : '');
  c.querySelectorAll('[data-c]').forEach(b => {
    b.onclick = () => {
      if (b.dataset.c === 'loc') navTo(sel.loc);
      else navTo(sel.loc, sel.uni);
    };
  });
}

function sync() {
  renderCrumb();
  const row = $('sel-row');
  if (row) row.classList.toggle('hidden', !!(sel.uni || sel.set));
  $('loc-count').classList.toggle('hidden', !!sel.loc);
  $('panel-head').classList.toggle('hidden', !!sel.loc);
  $('btn-print').classList.toggle('hidden', !sel.loc);
  const bv = $('btn-voltar');
  if (!sel.loc && !sel.uni && !sel.set) bv.classList.add('hidden');
  else {
    bv.classList.remove('hidden');
    bv.onclick = () => {
      if (sel.set) navTo(sel.loc, sel.uni);
      else if (sel.uni) navTo(sel.loc);
      else if (sel.loc) navTo('');
      else { buscar(); }
    };
  }
  if (typeof destacarMunicipioMapa === 'function') {
    const loc = locs.find(x => String(x.id) === String(sel.loc));
    destacarMunicipioMapa(sel.loc && loc ? loc.nome : '');
  }
  buscar();
}

$('btn-topo').onclick = () =>
  document.querySelector('.fc-panel').scrollTo({ top: 0, behavior: 'smooth' });

function printRow(c, caminho) {
  return `<div class="fc-contato"><div class="fc-contato-main">` +
    `<span class="fc-contato-tipo">${esc(c.cargo || '')}${caminho ? ' · ' + esc(caminho) : ''}</span>` +
    `<h4>${esc(c.nome)}</h4></div><div class="fc-contato-side">` +
    (c.telefone ? `<span class="fc-contato-valor">${esc(c.telefone)}</span>` : '') +
    (c.email ? `<span class="fc-contato-valor">${esc(c.email)}</span>` : '') + `</div></div>`;
}

async function imprimirEscopo() {
  const params = new URLSearchParams();
  let titulo = '';
  if (sel.set) { params.set('setor_id', sel.set); titulo = optLabel('sel-set'); }
  else if (sel.uni) { params.set('unidade_id', sel.uni); titulo = optLabel('sel-uni'); }
  else if (sel.loc) { params.set('localidade_id', sel.loc); titulo = optLabel('sel-loc'); }
  else return;
  titulo = titulo.replace(/ \(\d+\)$/, '');
  const ctts = await get('/api/contatos?' + params);
  $('print-area').innerHTML = `<h2 class="fc-title">${esc(titulo)}</h2>` +
    `<p class="fc-subtitle">${ctts.length} contato(s)</p>` +
    ctts.map(c => printRow(c, sel.set ? '' : `${c.localidade} · ${c.unidade} · ${c.setor}`)).join('');
  window.print();
}
$('btn-print').onclick = imprimirEscopo;

const pill = (n, s, p) => `<span class="fc-pill">${n} ${n == 1 ? s : p}</span>`;

function cardNivel(tipo, id, nome, meta) {
  return `<div class="fc-card" data-nav="${tipo}" data-id="${id}">` +
    `<div class="fc-card-head"><div><h4>${esc(nome)}</h4></div></div>` +
    `<div class="fc-meta">${meta}</div></div>`;
}

function cardContato(c, caminho) {
  const tel = c.telefone ? `<a class="fc-contato-valor" href="tel:${esc(c.telefone.replace(/\D/g, ''))}">${esc(c.telefone)}</a>` : '';
  const mail = c.email ? `<a class="fc-contato-valor" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '';
  return `<div class="fc-contato"><div class="fc-contato-main">` +
    `<span class="fc-contato-tipo">${esc(c.cargo || '')}${caminho ? ' · ' + esc(caminho) : ''}</span>` +
    `<h4>${esc(c.nome)}</h4></div>` +
    `<div class="fc-contato-side">${tel}${mail}</div></div>`;
}

function bindNav() {
  document.querySelectorAll('#lista [data-nav]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.id, t = el.dataset.nav;
      if (t === 'loc') navTo(id);
      else if (t === 'uni') navTo(sel.loc, id);
      else if (t === 'set') navTo(sel.loc, sel.uni, id);
    };
  });
  document.querySelectorAll('#lista [data-back]').forEach(el => {
    el.onclick = () => {
      const t = el.dataset.back;
      if (t === 'home') navTo('');
      else if (t === 'loc') navTo(sel.loc);
      else if (t === 'uni') navTo(sel.loc, sel.uni);
    };
  });
}

async function buscar() {
  const q = '';
  const box = $('lista');
  const selRow = $('sel-row');
  if (selRow) document.querySelector('.fc-panel').insertBefore(selRow, box);
  if (!q && !sel.set && !sel.uni && !sel.loc) {
    document.querySelector('.fc-panel').insertBefore($('sel-row'), $('lista'));
    box.innerHTML = `<div class="fc-section"><h3>Municípios</h3>` + locs.map(l =>
      cardNivel('loc', l.id, l.nome,
        pill(l.n_unidades || 0, 'Unidade', 'Unidades') +
        pill(l.n_setores || 0, 'Setor', 'Setores') +
        pill(l.total, 'contato', 'contatos'))
    ).join('') + `</div>` || '<div class="fc-empty">Nenhum local.</div>';
  } else if (!sel.set && !sel.uni && sel.loc && !q) {
    const [unis, ctts] = await Promise.all([
      get('/api/unidades?localidade_id=' + sel.loc),
      get('/api/contatos?localidade_id=' + sel.loc),
    ]);
    const porUni = {};
    ctts.forEach(c => { porUni[c.unidade_id] = (porUni[c.unidade_id] || 0) + 1; });
    const loc = locs.find(x => String(x.id) === String(sel.loc));
    const nSet = unis.reduce((a, u) => a + (u.n_setores || 0), 0);
    box.innerHTML = `<button class="fc-back" data-back="home">← Municípios</button>` +
      `<div class="fc-head"><div><h2 class="fc-title">${esc(loc ? loc.nome : '')}</h2>` +
      `<p class="fc-subtitle">${unis.length} Unidades · ${nSet} Setores · ${ctts.length} Contatos</p></div></div>` +
      `<div id="sel-slot"></div>` +
      `<div class="fc-section"><h3>Unidades</h3>` +
      unis.map(u => cardNivel('uni', u.id, u.nome,
        `<span class="fc-pill fc-pill-type">Unidade</span>` +
        pill(u.n_setores || 0, 'Setor', 'Setores') +
        pill(porUni[u.id] || 0, 'contato', 'contatos'))).join('') + `</div>`;
  } else if (!sel.set && sel.uni) {
    const params = new URLSearchParams({ unidade_id: sel.uni, q });
    const [sets, ctts] = await Promise.all([
      q ? [] : get('/api/setores?unidade_id=' + sel.uni),
      get('/api/contatos?' + params),
    ]);
    const porSet = {};
    ctts.forEach(c => { porSet[c.setor_id] = (porSet[c.setor_id] || 0) + 1; });
    const uniNome = optLabel('sel-uni');
    box.innerHTML = `<button class="fc-back" data-back="loc">← ${esc(optLabel('sel-loc'))}</button>` +
      `<div class="fc-head"><div><h2 class="fc-title">${esc(uniNome)}</h2>` +
      `<p class="fc-subtitle">${sets.length} Setores · ${ctts.length} Contatos</p></div></div>` +
      `<div id="sel-slot"></div>` +
      `<div class="fc-section"><h3>Setores</h3>` +
      (q
        ? ctts.map(c => cardContato(c, c.setor)).join('') || '<div class="fc-empty">Nenhum contato.</div>'
        : sets.map(s => cardNivel('set', s.id, s.nome,
            `<span class="fc-pill fc-pill-type">Setor</span>` + pill(porSet[s.id] || 0, 'contato', 'contatos'))).join('') + `</div>`);
  } else {
    const params = new URLSearchParams({ q });
    if (sel.set) params.set('setor_id', sel.set);
    else if (sel.uni) params.set('unidade_id', sel.uni);
    else if (sel.loc) params.set('localidade_id', sel.loc);
    const ctts = await get('/api/contatos?' + params);
    const setNome = sel.set ? optLabel('sel-set') : '';
    box.innerHTML = (sel.set
      ? `<button class="fc-back" data-back="uni">← ${esc(optLabel('sel-uni'))}</button>` +
        `<div class="fc-head"><div><h2 class="fc-title">${esc(setNome)}</h2></div></div>` +
        `<div id="sel-slot"></div>`
      : '') +
      ctts.map(c => cardContato(c, sel.set ? '' : `${c.localidade} · ${c.unidade} · ${c.setor}`)).join('') ||
      '<div class="fc-empty">Nenhum contato.</div>';
  }
  const slot = $('sel-slot');
  const row2 = $('sel-row');
  if (slot && row2 && !sel.uni && !sel.set) slot.appendChild(row2);
  refreshTopo();
  bindNav();
}

function refreshTopo() {
  const panel = document.querySelector('.fc-panel');
  $('btn-topo').classList.toggle('hidden',
    panel.scrollHeight <= panel.clientHeight + 1);
}

/* busca removida — navegação por mapa, menu e cards */

function aplicarTema() {
  const dark = (localStorage.getItem('demo-theme') || 'light') === 'dark';
  document.body.dataset.theme = dark ? 'dark' : 'light';
  const t = $('toggle-dark-mode');
  if (t) t.checked = dark;
}
$('toggle-dark-mode').onchange = (e) => {
  localStorage.setItem('demo-theme', e.target.checked ? 'dark' : 'light');
  aplicarTema();
};
(async () => {
  aplicarTema();
  document.querySelectorAll('.menu-item[data-view]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.menu-item[data-view]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ['consulta', 'config', 'manual'].forEach(v => $('view-' + v).classList.add('hidden'));
      $('view-' + btn.dataset.view).classList.remove('hidden');
    };
  });
  locs = await get('/api/localidades');
  $('loc-count').textContent = `${locs.length} Municípios`;
  await loadLocs();
  $('sel-loc').onchange = () => onLoc();
  $('sel-uni').onchange = () => onUni();
  $('sel-set').onchange = () => onSet();
  sync();
  initMapa('map', 'map-msg', locs, nome => {
    const loc = locs.find(x => norm(x.nome) === norm(nome));
    if (loc) setLoc(loc.id);
  });
})();
