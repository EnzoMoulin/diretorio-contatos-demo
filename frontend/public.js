/* Consulta pública: busca + camadas + mapa + modal de solicitação. */
const $ = id => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

let state = { loc: null, uni: null, set: null };
let locs = [];

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

async function buscar() {
  const params = new URLSearchParams({ q: $('q').value.trim() });
  if (state.set) params.set('setor_id', state.set);
  else if (state.uni) params.set('unidade_id', state.uni);
  else if (state.loc) params.set('localidade_id', state.loc);
  const lista = await (await fetch('/api/contatos?' + params)).json();
  $('lista').innerHTML = lista.map(c =>
    `<tr><td>${esc(c.nome)}</td><td>${esc(c.cargo)}</td>` +
    `<td>${esc(c.localidade)} · ${esc(c.unidade)} · ${esc(c.setor)}</td>` +
    `<td>${esc(c.telefone)}</td><td>${esc(c.email)}</td></tr>`
  ).join('') || '<tr><td colspan="5">Nenhum contato.</td></tr>';
}

$('q').addEventListener('input', buscar);

/* ---- modal solicitar acesso ---- */
function abrirPedido() {
  $('modal-pedido').classList.remove('hidden');
  $('p-status').textContent = '';
  if (!$('p-loc').options.length) {
    $('p-loc').innerHTML = locs.map(l => `<option value="${l.id}">${esc(l.nome)}</option>`).join('');
  }
}
$('btn-acesso').onclick = abrirPedido;
$('p-cancel').onclick = () => $('modal-pedido').classList.add('hidden');

$('p-enviar').onclick = async () => {
  const corpo = { nome: $('p-nome').value.trim(), email: $('p-email').value.trim(),
                  usuario: $('p-user').value.trim(), motivo: $('p-motivo').value.trim(),
                  localidade_id: $('p-loc').value };
  const r = await fetch('/api/pedidos', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  $('p-status').textContent = r.ok
    ? 'Pedido enviado. Aguarde a aprovação do administrador.'
    : 'Erro: ' + await r.text();
};

(async () => {
  locs = await (await fetch('/api/localidades')).json();
  renderChips();
  buscar();
  initMapa('map', 'map-msg', locs, nome => {
    const loc = locs.find(x => norm(x.nome) === norm(nome));
    if (loc) { state = { loc: loc.id, uni: null, set: null }; sync(); }
  });
})();
