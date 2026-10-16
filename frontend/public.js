/* Consulta pública: busca + navegação em camadas + mapa (Leaflet). */
const $ = id => document.getElementById(id);
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const GEOJSON_URL = 'https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-32-mun.json';

let state = { loc: null, uni: null, set: null };
let locs = [];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

document.querySelectorAll('.menu-item[data-view]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.menu-item[data-view]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const v = document.getElementById('view-' + btn.dataset.view);
    v.classList.remove('hidden');
    if (btn.dataset.view === 'mapa') initMapa();
  };
});

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

$('p-enviar').onclick = async () => {
  const corpo = { nome: $('p-nome').value.trim(), email: $('p-email').value.trim(),
                  usuario: $('p-user').value.trim(), motivo: $('p-motivo').value.trim() };
  const r = await fetch('/api/pedidos', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  $('p-status').textContent = r.ok
    ? 'Pedido enviado. O admin aprova na área administrativa.'
    : 'Erro: ' + await r.text();
};

/* ---- mapa ---- */
let mapaOK = false;
async function initMapa() {
  if (mapaOK || typeof L === 'undefined') {
    if (typeof L === 'undefined') $('map-msg').textContent = 'Leaflet não carregou (offline?) — use as localidades acima.';
    return;
  }
  mapaOK = true;
  const map = L.map('map').setView([-19.9, -40.6], 7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap' }).addTo(map);
  const dens = {};
  locs.forEach(l => { dens[norm(l.nome)] = l.total; });
  try {
    const gj = await (await fetch(GEOJSON_URL)).json();
    const layer = L.geoJSON(gj, {
      style: f => {
        const n = dens[norm(f.properties.name)] || 0;
        return { color: '#475569', weight: 1, fillOpacity: .55,
                 fillColor: !n ? '#e2e8f0' : n <= 3 ? '#bfdbfe' : '#2563eb' };
      },
      onEachFeature: (f, l) => {
        const nome = f.properties.name;
        l.bindTooltip(`${nome} (${dens[norm(nome)] || 0})`);
        l.on('click', () => {
          const loc = locs.find(x => norm(x.nome) === norm(nome));
          if (loc) {
            state = { loc: loc.id, uni: null, set: null }; sync();
            document.querySelector('.menu-item[data-view="consulta"]').click();
          }
        });
      }
    }).addTo(map);
    map.fitBounds(layer.getBounds());
  } catch (e) {
    $('map-msg').textContent = 'GeoJSON não carregou (offline?) — use as localidades na Consulta.';
  }
}

(async () => {
  locs = await (await fetch('/api/localidades')).json();
  renderChips();
  buscar();
})();
