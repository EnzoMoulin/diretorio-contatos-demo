/* Área administrativa: mesma consulta + login, gestão, pedidos, histórico. */
const $ = id => document.getElementById(id);
let token = localStorage.getItem('demo-token') || '';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
const auth = () => ({ 'Content-Type': 'application/json', 'X-Admin-Token': token });

document.querySelectorAll('.menu-item[data-view]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.menu-item[data-view]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-' + btn.dataset.view).classList.remove('hidden');
    if (btn.dataset.view === 'pedidos') carregarPedidos();
    if (btn.dataset.view === 'historico') carregarHistorico();
  };
});

async function buscar() {
  const lista = await (await fetch('/api/contatos?q=' + encodeURIComponent($('q').value.trim()))).json();
  $('lista').innerHTML = lista.map(c =>
    `<tr><td>${esc(c.nome)}</td><td>${esc(c.cargo)}</td>` +
    `<td>${esc(c.localidade)} · ${esc(c.unidade)} · ${esc(c.setor)}</td>` +
    `<td>${esc(c.telefone)}</td><td>${esc(c.email)}</td>` +
    `<td>${token ? `<button class="btn-del" data-id="${c.id}">remover</button>` : ''}</td></tr>`
  ).join('') || '<tr><td colspan="6">Nenhum contato.</td></tr>';
  document.querySelectorAll('.btn-del').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Remover este contato?')) return;
      await fetch('/api/contatos/' + b.dataset.id, { method: 'DELETE', headers: auth() });
      buscar(); carregarHistorico();
    };
  });
}
$('q').addEventListener('input', buscar);

/* ---- login (auto se token salvo) ---- */
async function refreshMe() {
  $('login-box').classList.toggle('hidden', !!token);
  $('who-box').classList.toggle('hidden', !token);
  if (!token) { $('status').textContent = ''; return; }
  const r = await fetch('/api/me', { headers: auth() });
  if (r.ok) {
    const me = await r.json();
    $('who').textContent = 'Logado como ' + me.usuario;
    $('status').textContent = '';
    $('gestao-hint').textContent = 'Adicionar contato no setor selecionado:';
  } else {
    token = ''; localStorage.removeItem('demo-token');
    refreshMe();
  }
  buscar();
}
$('login').onclick = async () => {
  const r = await fetch('/api/login', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: $('user').value, senha: $('pass').value }) });
  const j = await r.json();
  if (j.token) {
    token = j.token; localStorage.setItem('demo-token', token);
    refreshMe(); carregarPedidos(); carregarHistorico();
  } else {
    $('status').textContent = j.erro || 'falhou';
  }
};
$('sair').onclick = () => {
  token = ''; localStorage.removeItem('demo-token');
  refreshMe(); buscar();
};

/* ---- gestão: selects encadeados ---- */
async function carregarLocs() {
  const locs = await (await fetch('/api/localidades')).json();
  $('g-loc').innerHTML = locs.map(l => `<option value="${l.id}">${esc(l.nome)}</option>`).join('');
  carregarUnis();
}
async function carregarUnis() {
  const unis = await (await fetch('/api/unidades?localidade_id=' + $('g-loc').value)).json();
  $('g-uni').innerHTML = unis.map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join('');
  carregarSets();
}
async function carregarSets() {
  const sets = await (await fetch('/api/setores?unidade_id=' + $('g-uni').value)).json();
  $('g-set').innerHTML = sets.map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join('');
}
$('g-loc').onchange = carregarUnis;
$('g-uni').onchange = carregarSets;

$('salvar').onclick = async () => {
  if (!token) { alert('Faça o login primeiro.'); return; }
  const corpo = { setor_id: $('g-set').value, nome: $('f-nome').value,
                  cargo: $('f-cargo').value, telefone: $('f-tel').value,
                  email: $('f-email').value };
  const r = await fetch('/api/contatos', { method: 'POST', headers: auth(), body: JSON.stringify(corpo) });
  if (r.ok) { $('f-nome').value = ''; buscar(); }
  else { alert('Erro: ' + await r.text()); }
};

/* ---- pedidos ---- */
async function carregarPedidos() {
  if (!token) { $('pedidos').innerHTML = '<li>Faça login.</li>'; return; }
  const lista = await (await fetch('/api/pedidos', { headers: auth() })).json();
  const n = Array.isArray(lista) ? lista.length : 0;
  $('ped-count').textContent = n || '';
  $('pedidos').innerHTML = (Array.isArray(lista) ? lista : []).map(p =>
    `<li><b>${esc(p.nome)}</b> (${esc(p.email)}) — usuário: <code>${esc(p.usuario_desejado)}</code>` +
    (p.motivo ? ` — ${esc(p.motivo)}` : '') +
    ` <button class="btn-primary" data-id="${p.id}">aprovar</button></li>`
  ).join('') || '<li>Nenhum pedido pendente.</li>';
  document.querySelectorAll('#pedidos button').forEach(b => {
    b.onclick = async () => {
      const r = await fetch('/api/pedidos/' + b.dataset.id + '/aprovar',
        { method: 'POST', headers: auth() });
      const j = await r.json();
      alert(r.ok ? `Aprovado: ${j.usuario} (senha inicial: ${j.senha_inicial})` : 'Erro: ' + j.erro);
      carregarPedidos();
    };
  });
}

/* ---- histórico ---- */
async function carregarHistorico() {
  if (!token) { $('hist').innerHTML = '<li>Faça login.</li>'; return; }
  const h = await (await fetch('/api/historico', { headers: auth() })).json();
  $('hist').innerHTML = (Array.isArray(h) ? h : []).map(x =>
    `<li><b>${esc(x.acao)}</b> — ${esc(x.detalhe)} <i>${esc(x.data)}</i></li>`
  ).join('') || '<li>Sem registros.</li>';
}

refreshMe(); buscar(); carregarLocs();
