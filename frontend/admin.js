/* Área administrativa: consulta com gestão inline por escopo + solicitações + registro.
   Estados do botão inferior: sem cadastro -> "Solicitar acesso";
   com cadastro mas deslogado -> "Acesso administrativo"; logado -> "Sair do acesso administrativo". */
const $ = id => document.getElementById(id);
let token = localStorage.getItem('demo-token') || '';
let me = null;            // {id, usuario, admin, escopo}
let modoPublico = false;  // "saiu" mas continua na página (visão pública)
let state = { loc: null, uni: null, set: null };
let locs = [];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
const auth = () => ({ 'Content-Type': 'application/json', 'X-Admin-Token': token });
const logado = () => !!(me && !modoPublico);
const temCadastro = () => !!token;

document.querySelectorAll('.menu-item[data-view]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.menu-item[data-view]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['consulta', 'solicitacoes', 'registro'].forEach(v => $('view-' + v).classList.add('hidden'));
    $('view-' + btn.dataset.view).classList.remove('hidden');
    if (btn.dataset.view === 'solicitacoes') carregarPedidos();
    if (btn.dataset.view === 'registro') carregarHistorico();
  };
});

/* ---- consulta com camadas ---- */
function chip(label, active, onclick) {
  const b = document.createElement('button');
  b.className = 'chip' + (active ? ' active' : '');
  b.textContent = label;
  b.onclick = onclick;
  return b;
}
function renderChips() {
  const cl = $('chips-loc'); cl.innerHTML = '';
  locs.forEach(l => cl.appendChild(chip(`${l.nome} (${l.total})`, state.loc === l.id,
    () => { state = { loc: l.id, uni: null, set: null }; sync(); })));
  if (state.loc) {
    const all = chip('✕ limpar', false, () => { state = { loc: null, uni: null, set: null }; sync(); });
    all.classList.add('clear'); cl.appendChild(all);
  }
}
async function sync() {
  renderChips();
  const cu = $('chips-uni'); cu.innerHTML = '';
  const cs = $('chips-set'); cs.innerHTML = '';
  const parts = [];
  if (state.loc) {
    const l = locs.find(x => x.id === state.loc);
    parts.push(l ? l.nome : '');
    const unis = await (await fetch('/api/unidades?localidade_id=' + state.loc)).json();
    unis.forEach(u => cu.appendChild(chip(u.nome, state.uni === u.id,
      () => { state.uni = u.id; state.set = null; sync(); })));
    if (state.uni) {
      const u = unis.find(x => x.id === state.uni);
      parts.push(u ? u.nome : '');
      const sets = await (await fetch('/api/setores?unidade_id=' + state.uni)).json();
      sets.forEach(s => cs.appendChild(chip(s.nome, state.set === s.id,
        () => { state.set = s.id; sync(); })));
      if (state.set) {
        const s = sets.find(x => x.id === state.set);
        parts.push(s ? s.nome : '');
      }
    }
  }
  $('crumb').textContent = parts.length ? parts.join(' › ') : 'Todos os contatos';
  buscar();
}
function podeEditar(localidade) {
  if (!logado()) return false;
  if (me.escopo === 'all') return true;
  const l = locs.find(x => x.nome === localidade);
  return l && me.escopo.includes(l.id);
}
async function buscar() {
  const params = new URLSearchParams({ q: $('q').value.trim() });
  if (state.set) params.set('setor_id', state.set);
  else if (state.uni) params.set('unidade_id', state.uni);
  else if (state.loc) params.set('localidade_id', state.loc);
  const lista = await (await fetch('/api/contatos?' + params)).json();
  $('lista').innerHTML = lista.map(c =>
    `<tr><td>${esc(c.nome)}</td><td>${esc(c.cargo)}</td>` +
    `<td>${esc(c.localidade)} · ${esc(c.unidade)} · ${esc(c.setor)}</td>` +
    `<td>${esc(c.telefone)}</td><td>${esc(c.email)}</td>` +
    `<td>${podeEditar(c.localidade) ? `<button class="btn-del" data-id="${c.id}">remover</button>` : ''}</td></tr>`
  ).join('') || '<tr><td colspan="6">Nenhum contato.</td></tr>';
  document.querySelectorAll('.btn-del').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Remover este contato?')) return;
      const r = await fetch('/api/contatos/' + b.dataset.id, { method: 'DELETE', headers: auth() });
      if (!r.ok) alert('Erro: ' + await r.text());
      sync();
    };
  });
  // criar: visível se logado e setor atual editável
  const showCreate = logado() && state.set;
  $('create-box').classList.toggle('hidden', !showCreate);
  if (showCreate) {
    const s = state.set;
    const setorLoc = await locDeSetor(s);
    $('create-box').classList.toggle('hidden', !podeEditarNome(setorLoc));
    $('save-status').textContent = podeEditarNome(setorLoc)
      ? '' : 'Você não tem acesso a este local — peça acesso abaixo.';
  }
}
function podeEditarNome(nomeLoc) {
  if (!logado()) return false;
  if (me.escopo === 'all') return true;
  const l = locs.find(x => x.nome === nomeLoc);
  return l && me.escopo.includes(l.id);
}
async function locDeSetor(setorId) {
  // descobre a localidade do setor via breadcrumb atual
  const l = locs.find(x => x.id === state.loc);
  return l ? l.nome : null;
}
$('q').addEventListener('input', buscar);
$('salvar').onclick = async () => {
  const corpo = { setor_id: state.set, nome: $('f-nome').value.trim(),
                  cargo: $('f-cargo').value.trim(), telefone: $('f-tel').value.trim(),
                  email: $('f-email').value.trim() };
  const r = await fetch('/api/contatos', { method: 'POST', headers: auth(), body: JSON.stringify(corpo) });
  if (r.ok) { $('f-nome').value = ''; $('f-cargo').value = ''; $('f-tel').value = ''; $('f-email').value = ''; sync(); }
  else $('save-status').textContent = 'Erro: ' + await r.text();
};

/* ---- estado / login / acesso ---- */
async function refresh() {
  me = null;
  if (token) {
    const r = await fetch('/api/me', { headers: auth() });
    if (r.ok) me = await r.json();
    else { token = ''; localStorage.removeItem('demo-token'); }
  }
  const adminVis = logado();
  $('menu-sol').classList.toggle('hidden', !adminVis);
  $('menu-reg').classList.toggle('hidden', !adminVis);
  const btn = $('btn-estado');
  if (logado()) {
    btn.textContent = '🚪 Sair do acesso administrativo';
    btn.onclick = () => { modoPublico = true; refresh(); };
    $('estado-hint').textContent = 'Logado como ' + me.usuario +
      (me.escopo === 'all' ? ' (admin: todos os locais).' : ` (locais: ${me.escopo.length}).`);
  } else if (temCadastro()) {
    btn.textContent = '🔑 Acesso administrativo';
    btn.onclick = () => { modoPublico = false; refresh(); };
    $('estado-hint').textContent = 'Visão pública. Entre para gerenciar seus locais.';
  } else {
    btn.textContent = '📝 Solicitar acesso';
    btn.onclick = abrirPedido;
    $('estado-hint').textContent = 'Sem cadastro: só consulta. Peça acesso interno.';
  }
  $('escopo-hint').textContent = logado()
    ? (me.escopo === 'all' ? 'Você edita todos os locais.' : 'Você edita os locais liberados para você; nos demais, só consulta.')
    : 'Visão de consulta. Com acesso aprovado, você edita seus locais aqui mesmo.';
  const showLogin = !logado();
  $('btn-login').classList.toggle('hidden', !showLogin);
  $('btn-login').onclick = () => { $('modal-login').classList.remove('hidden'); $('l-status').textContent = ''; };
  if (adminVis) carregarPedidos();
  buscar();
}
$('login').onclick = async () => {
  const r = await fetch('/api/login', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: $('user').value, senha: $('pass').value }) });
  const j = await r.json();
  if (j.token) {
    token = j.token; localStorage.setItem('demo-token', token);
    modoPublico = false;
    $('modal-login').classList.add('hidden');
    refresh();
  } else $('l-status').textContent = j.erro || 'falhou';
};
$('l-cancel').onclick = () => $('modal-login').classList.add('hidden');

/* ---- modal pedir acesso (novo ou mais locais) ---- */
function abrirPedido() {
  $('modal-pedido').classList.remove('hidden');
  $('p-status').textContent = '';
  if (!$('p-loc').options.length) {
    $('p-loc').innerHTML = locs.map(l => `<option value="${l.id}">${esc(l.nome)}</option>`).join('');
  }
  if (logado()) {
    $('ped-hint').textContent = 'Pedir acesso a mais um local (entra como ' + me.usuario + ').';
    $('p-user').value = me.usuario;
    $('p-user').disabled = true;
  } else {
    $('ped-hint').textContent = 'O admin aprova e libera o local pedido.';
    $('p-user').disabled = false;
  }
}
$('p-cancel').onclick = () => $('modal-pedido').classList.add('hidden');
$('p-enviar').onclick = async () => {
  const corpo = { nome: $('p-nome').value.trim(), email: $('p-email').value.trim(),
                  usuario: (token && me) ? me.usuario : $('p-user').value.trim(),
                  motivo: $('p-motivo').value.trim(), localidade_id: $('p-loc').value };
  const r = await fetch('/api/pedidos', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  $('p-status').textContent = r.ok
    ? 'Pedido enviado. Aguarde a aprovação do administrador.'
    : 'Erro: ' + await r.text();
};

/* ---- solicitações / registro ---- */
async function carregarPedidos() {
  if (!logado()) { $('pedidos').innerHTML = '<li>Faça login.</li>'; return; }
  const lista = await (await fetch('/api/pedidos', { headers: auth() })).json();
  const n = Array.isArray(lista) ? lista.length : 0;
  $('ped-count').textContent = n || '';
  $('pedidos').innerHTML = (Array.isArray(lista) ? lista : []).map(p =>
    `<li><b>${esc(p.nome)}</b> (${esc(p.email)}) — usuário: <code>${esc(p.usuario_desejado)}</code>` +
    (p.localidade ? ` — local: <b>${esc(p.localidade)}</b>` : '') +
    (p.motivo ? ` — ${esc(p.motivo)}` : '') +
    ` <button class="btn-primary" data-id="${p.id}">aprovar</button></li>`
  ).join('') || '<li>Nenhuma solicitação pendente.</li>';
  document.querySelectorAll('#pedidos button').forEach(b => {
    b.onclick = async () => {
      const r = await fetch('/api/pedidos/' + b.dataset.id + '/aprovar',
        { method: 'POST', headers: auth() });
      const j = await r.json();
      alert(r.ok ? `Aprovado: ${j.usuario} (senha inicial: ${j.senha_inicial})` : 'Erro: ' + (j.erro || ''));
      carregarPedidos();
    };
  });
}
async function carregarHistorico() {
  if (!logado()) { $('hist').innerHTML = '<li>Faça login.</li>'; return; }
  const h = await (await fetch('/api/historico', { headers: auth() })).json();
  $('hist').innerHTML = (Array.isArray(h) ? h : []).map(x =>
    `<li><b>${esc(x.acao)}</b> — ${esc(x.detalhe)} <i>${esc(x.data)}</i></li>`
  ).join('') || '<li>Sem registros.</li>';
}

(async () => {
  locs = await (await fetch('/api/localidades')).json();
  renderChips();
  await refresh();
  initMapa('map', 'map-msg', locs, nome => {
    const loc = locs.find(x => norm(x.nome) === norm(nome));
    if (loc) { state = { loc: loc.id, uni: null, set: null }; sync(); }
  });
})();
