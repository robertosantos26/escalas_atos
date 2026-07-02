// ============================================================
// Meu Painel — lógica da aplicação
// ============================================================

const state = {
  user: null,
  tasks: [],
  goals: [],
  events: [],
  clients: [],
  taskCategoryFilter: 'todas',
  goalStatusFilter: 'ativa',
  clientCategoryFilter: 'todas',
  currentView: 'hoje',
  modalType: 'tarefa',
  isSignUpMode: false,
};

// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDateLong(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function formatDateShort(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

const CATEGORY_LABEL = { trabalho: 'Trabalho', pessoal: 'Pessoal' };
const STAGE_LABEL = {
  contato: 'Contato feito',
  reuniao_agendada: 'Reunião agendada',
  proposta_enviada: 'Proposta enviada',
  fechado: 'Fechado',
  perdido: 'Perdido',
};
const STAGES_ORDER = ['contato', 'reuniao_agendada', 'proposta_enviada', 'fechado', 'perdido'];

// ============================================================
// AUTENTICAÇÃO
// ============================================================

async function checkSession() {
  const { data } = await window.db.auth.getSession();
  if (data.session) {
    onAuthed(data.session.user);
  } else {
    showLogin();
  }
}

function showLogin() {
  $('#login-screen').style.display = 'flex';
  $('#app-screen').style.display = 'none';
}

async function onAuthed(user) {
  state.user = user;
  $('#user-email').textContent = user.email;
  $('#login-screen').style.display = 'none';
  $('#app-screen').style.display = 'block';
  await loadAll();
  renderAll();
}

function setLoginError(msg) {
  $('#login-error').textContent = msg || '';
}

$('#login-toggle-btn').addEventListener('click', () => {
  state.isSignUpMode = !state.isSignUpMode;
  if (state.isSignUpMode) {
    $('#login-subtitle').textContent = 'Crie seu acesso ao painel';
    $('#login-submit-btn').textContent = 'Criar conta';
    $('#login-toggle-text').textContent = 'Já tem conta?';
    $('#login-toggle-btn').textContent = 'Entrar';
  } else {
    $('#login-subtitle').textContent = 'Entre para acessar suas tarefas, metas, agenda e clientes';
    $('#login-submit-btn').textContent = 'Entrar';
    $('#login-toggle-text').textContent = 'Ainda não tem conta?';
    $('#login-toggle-btn').textContent = 'Criar conta';
  }
  setLoginError('');
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setLoginError('');
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  const submitBtn = $('#login-submit-btn');
  submitBtn.disabled = true;

  try {
    if (state.isSignUpMode) {
      const { data, error } = await window.db.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        onAuthed(data.user);
      } else {
        setLoginError('Conta criada! Verifique seu e-mail para confirmar o acesso.');
      }
    } else {
      const { data, error } = await window.db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onAuthed(data.user);
    }
  } catch (err) {
    setLoginError(traduzErro(err.message));
  } finally {
    submitBtn.disabled = false;
  }
});

function traduzErro(msg) {
  if (!msg) return 'Ocorreu um erro. Tente novamente.';
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha inválidos.';
  if (msg.includes('User already registered')) return 'Este e-mail já tem uma conta. Tente entrar.';
  if (msg.includes('Password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.';
  return msg;
}

$('#logout-btn').addEventListener('click', async () => {
  await window.db.auth.signOut();
  state.user = null;
  state.tasks = []; state.goals = []; state.events = []; state.clients = [];
  showLogin();
});

// ============================================================
// CARREGAMENTO DE DADOS
// ============================================================

async function loadAll() {
  const [tasksRes, goalsRes, eventsRes, clientsRes] = await Promise.all([
    window.db.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }),
    window.db.from('goals').select('*').order('created_at', { ascending: false }),
    window.db.from('events').select('*').order('event_date', { ascending: true }),
    window.db.from('clients').select('*').order('next_action_date', { ascending: true, nullsFirst: false }),
  ]);

  state.tasks = tasksRes.data || [];
  state.goals = goalsRes.data || [];
  state.events = eventsRes.data || [];
  state.clients = clientsRes.data || [];
}

function renderAll() {
  $('#today-date-stamp').textContent = formatDateLong(todayISO());
  renderHoje();
  renderTarefas();
  renderMetas();
  renderAgenda();
  renderClientes();
}

// ============================================================
// NAVEGAÇÃO ENTRE VIEWS
// ============================================================

$$('.nav-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.nav-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.dataset.view;
    state.currentView = view;
    $$('.view').forEach((v) => v.classList.remove('active'));
    $(`#view-${view}`).classList.add('active');
  });
});

// ============================================================
// RENDER: CARDS (elemento base)
// ============================================================

function taskCardHtml(task) {
  const overdue = task.due_date && task.due_date < todayISO() && task.status !== 'done';
  const dateBadge = task.due_date
    ? `<span class="${overdue ? 'badge badge-overdue' : ''}">${overdue ? '⚠ atrasada · ' : ''}${formatDateShort(task.due_date)}</span>`
    : '';
  return `
    <div class="item-card cat-${task.category}" data-id="${task.id}">
      <div class="item-main">
        <div class="item-title ${task.status === 'done' ? 'done' : ''}">${escapeHtml(task.title)}</div>
        ${task.description ? `<div class="item-desc">${escapeHtml(task.description)}</div>` : ''}
        <div class="item-meta">
          <span class="badge badge-${task.category}">${CATEGORY_LABEL[task.category]}</span>
          ${dateBadge}
        </div>
      </div>
      <div class="item-actions">
        ${task.status !== 'done'
          ? `<button class="icon-btn success" data-action="complete-task" data-id="${task.id}">✓ Concluir</button>`
          : `<button class="icon-btn" data-action="reopen-task" data-id="${task.id}">↺ Reabrir</button>`}
        <button class="icon-btn danger" data-action="delete-task" data-id="${task.id}">🗑</button>
      </div>
    </div>`;
}

function eventCardHtml(ev) {
  return `
    <div class="item-card cat-${ev.category}" data-id="${ev.id}">
      <div class="item-main">
        <div class="item-title">${escapeHtml(ev.title)}</div>
        ${ev.description ? `<div class="item-desc">${escapeHtml(ev.description)}</div>` : ''}
        <div class="item-meta">
          <span class="badge badge-${ev.category}">${CATEGORY_LABEL[ev.category]}</span>
          <span>${formatDateShort(ev.event_date)}${ev.event_time ? ' às ' + ev.event_time.slice(0, 5) : ''}</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="icon-btn danger" data-action="delete-event" data-id="${ev.id}">🗑</button>
      </div>
    </div>`;
}

function goalCardHtml(goal) {
  const statusLabel = { ativa: 'Ativa', concluida: 'Concluída', pausada: 'Pausada' }[goal.status];
  return `
    <div class="goal-card" data-id="${goal.id}">
      <div class="goal-top">
        <div>
          <div class="goal-title">${escapeHtml(goal.title)}</div>
          ${goal.description ? `<div class="goal-desc">${escapeHtml(goal.description)}</div>` : ''}
        </div>
        <span class="badge badge-${goal.category}">${CATEGORY_LABEL[goal.category]}</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${goal.progress}%;"></div></div>
      <div class="goal-footer">
        <span>${goal.period === 'mensal' ? 'Meta mensal' : 'Meta trimestral'} · ${statusLabel}${goal.target_date ? ' · até ' + formatDateShort(goal.target_date) : ''}</span>
        <span>${goal.progress}%</span>
      </div>
      <div class="progress-input-row">
        <input type="range" min="0" max="100" step="5" value="${goal.progress}" data-action="update-progress" data-id="${goal.id}" />
        ${goal.status !== 'concluida'
          ? `<button class="icon-btn success" data-action="conclude-goal" data-id="${goal.id}">✓ Concluir</button>`
          : `<button class="icon-btn" data-action="reactivate-goal" data-id="${goal.id}">↺ Reabrir</button>`}
        <button class="icon-btn danger" data-action="delete-goal" data-id="${goal.id}">🗑</button>
      </div>
    </div>`;
}

function clientCardHtml(client) {
  const contactLine = [client.phone, client.email].filter(Boolean).join(' · ');
  const overdueFollowup = client.next_action_date && client.next_action_date < todayISO();
  return `
    <div class="client-card" data-id="${client.id}">
      <div class="client-name">${escapeHtml(client.name)}</div>
      ${client.company ? `<div class="client-company">${escapeHtml(client.company)}</div>` : ''}
      ${contactLine ? `<div class="client-contact">${escapeHtml(contactLine)}</div>` : ''}
      ${client.next_action ? `
        <div class="client-next">
          <span class="label">Próxima ação:</span> ${escapeHtml(client.next_action)}
          ${client.next_action_date ? `<br><span class="${overdueFollowup ? 'badge badge-overdue' : ''}">${overdueFollowup ? '⚠ ' : ''}${formatDateShort(client.next_action_date)}</span>` : ''}
        </div>` : ''}
      <div class="client-controls">
        <select data-action="update-client-stage" data-id="${client.id}">
          ${STAGES_ORDER.map((s) => `<option value="${s}" ${s === client.stage ? 'selected' : ''}>${STAGE_LABEL[s]}</option>`).join('')}
        </select>
        <button class="icon-btn danger" data-action="delete-client" data-id="${client.id}">🗑</button>
      </div>
    </div>`;
}

// ============================================================
// RENDER: HOJE
// ============================================================

function renderHoje() {
  const today = todayISO();
  const tasksToday = state.tasks.filter((t) => t.due_date === today && t.status !== 'done');
  const overdue = state.tasks.filter((t) => t.due_date && t.due_date < today && t.status !== 'done');
  const goalsActive = state.goals.filter((g) => g.status === 'ativa');
  const upcomingEvents = state.events.filter((e) => e.event_date >= today).slice(0, 5);
  const clientsFollowup = state.clients
    .filter((c) => c.next_action_date && c.next_action_date <= today && c.stage !== 'fechado' && c.stage !== 'perdido')
    .sort((a, b) => (a.next_action_date > b.next_action_date ? 1 : -1));

  $('#stat-tasks-today').textContent = tasksToday.length;
  $('#stat-overdue').textContent = overdue.length;
  $('#stat-goals-active').textContent = goalsActive.length;
  $('#stat-clients-followup').textContent = clientsFollowup.length;

  const todayList = [...overdue, ...tasksToday];
  $('#today-tasks-list').innerHTML = todayList.length
    ? todayList.map(taskCardHtml).join('')
    : `<div class="empty-state">Nenhuma tarefa para hoje. Bom momento para revisar suas metas.</div>`;

  $('#today-events-list').innerHTML = upcomingEvents.length
    ? upcomingEvents.map(eventCardHtml).join('')
    : `<div class="empty-state">Nenhum compromisso agendado.</div>`;

  $('#today-clients-list').innerHTML = clientsFollowup.length
    ? clientsFollowup.map(clientCardHtml).join('')
    : `<div class="empty-state">Nenhum cliente com ação pendente para hoje.</div>`;

  $('#today-goals-list').innerHTML = goalsActive.length
    ? goalsActive.slice(0, 3).map(goalCardHtml).join('')
    : `<div class="empty-state">Nenhuma meta ativa no momento.</div>`;
}

// ============================================================
// RENDER: TAREFAS
// ============================================================

$('#tasks-filter-bar').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  state.taskCategoryFilter = btn.dataset.filterCat;
  $$('#tasks-filter-bar .chip').forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  renderTarefas();
});

function renderTarefas() {
  const filtered = state.tasks.filter((t) =>
    state.taskCategoryFilter === 'todas' || t.category === state.taskCategoryFilter
  );

  const quadrants = ['urgente_importante', 'importante_nao_urgente', 'urgente_nao_importante', 'nem_um_nem_outro'];
  quadrants.forEach((q) => {
    const items = filtered.filter((t) => t.quadrant === q && t.status !== 'done');
    $(`#quad-${q}`).innerHTML = items.length
      ? items.map(taskCardHtml).join('')
      : `<div class="empty-state" style="padding:12px;">Vazio</div>`;
  });

  const done = filtered.filter((t) => t.status === 'done').slice(0, 10);
  $('#tasks-done-list').innerHTML = done.length
    ? done.map(taskCardHtml).join('')
    : `<div class="empty-state">Nada concluído ainda por aqui.</div>`;
}

// ============================================================
// RENDER: METAS
// ============================================================

$('#goals-filter-bar').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  state.goalStatusFilter = btn.dataset.filterStatus;
  $$('#goals-filter-bar .chip').forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  renderMetas();
});

function renderMetas() {
  const filtered = state.goals.filter((g) => g.status === state.goalStatusFilter);
  $('#goals-list').innerHTML = filtered.length
    ? filtered.map(goalCardHtml).join('')
    : `<div class="empty-state">Nenhuma meta nessa categoria. Que tal criar uma?</div>`;
}

// ============================================================
// RENDER: AGENDA
// ============================================================

function renderAgenda() {
  const today = todayISO();
  const future = state.events.filter((e) => e.event_date >= today);
  const past = state.events.filter((e) => e.event_date < today).slice(-5).reverse();

  const grouped = {};
  future.forEach((e) => {
    grouped[e.event_date] = grouped[e.event_date] || [];
    grouped[e.event_date].push(e);
  });

  let html = '';
  const dates = Object.keys(grouped).sort();
  if (!dates.length) {
    html += `<div class="empty-state">Nenhum compromisso futuro agendado.</div>`;
  } else {
    dates.forEach((date) => {
      html += `<div class="agenda-day-group">
        <div class="agenda-day-label">${formatDateLong(date)}${date === today ? ' · hoje' : ''}</div>
        ${grouped[date].map(eventCardHtml).join('')}
      </div>`;
    });
  }

  if (past.length) {
    html += `<div class="section-title">Compromissos passados</div>`;
    html += past.map(eventCardHtml).join('');
  }

  $('#agenda-list').innerHTML = html;
}

// ============================================================
// RENDER: CLIENTES (pipeline)
// ============================================================

$('#clients-filter-bar').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  state.clientCategoryFilter = btn.dataset.filterCat;
  $$('#clients-filter-bar .chip').forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  renderClientes();
});

function renderClientes() {
  const filtered = state.clients.filter((c) =>
    state.clientCategoryFilter === 'todas' || c.category === state.clientCategoryFilter
  );

  STAGES_ORDER.forEach((stage) => {
    const items = filtered.filter((c) => c.stage === stage);
    $(`#pipeline-${stage}`).innerHTML = items.length
      ? items.map(clientCardHtml).join('')
      : `<div class="empty-state" style="padding:10px; font-size:11.5px;">Vazio</div>`;
  });
}

// ============================================================
// AÇÕES (delegação de eventos no documento)
// ============================================================

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  try {
    if (action === 'complete-task') await updateTask(id, { status: 'done' });
    if (action === 'reopen-task') await updateTask(id, { status: 'todo' });
    if (action === 'delete-task') { if (confirm('Excluir esta tarefa?')) await deleteRow('tasks', id); }
    if (action === 'delete-event') { if (confirm('Excluir este compromisso?')) await deleteRow('events', id); }
    if (action === 'conclude-goal') await updateGoal(id, { status: 'concluida', progress: 100 });
    if (action === 'reactivate-goal') await updateGoal(id, { status: 'ativa' });
    if (action === 'delete-goal') { if (confirm('Excluir esta meta?')) await deleteRow('goals', id); }
    if (action === 'delete-client') { if (confirm('Excluir este cliente?')) await deleteRow('clients', id); }
  } catch (err) {
    alert('Erro: ' + err.message);
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.dataset.action === 'update-progress') {
    const id = e.target.dataset.id;
    const value = Number(e.target.value);
    await updateGoal(id, { progress: value, status: value >= 100 ? 'concluida' : 'ativa' });
  }
  if (e.target.dataset.action === 'update-client-stage') {
    const id = e.target.dataset.id;
    await updateClient(id, { stage: e.target.value });
  }
});

document.addEventListener('input', (e) => {
  if (e.target.dataset.action === 'update-progress') {
    const value = Number(e.target.value);
    const card = e.target.closest('.goal-card');
    if (card) {
      const track = card.querySelector('.progress-fill');
      if (track) track.style.width = value + '%';
      const footerPct = card.querySelector('.goal-footer span:last-child');
      if (footerPct) footerPct.textContent = value + '%';
    }
  }
});

async function updateTask(id, patch) {
  const { error } = await window.db.from('tasks').update(patch).eq('id', id);
  if (error) throw error;
  await loadAll();
  renderAll();
}

async function updateGoal(id, patch) {
  const { error } = await window.db.from('goals').update(patch).eq('id', id);
  if (error) throw error;
  await loadAll();
  renderAll();
}

async function updateClient(id, patch) {
  const { error } = await window.db.from('clients').update(patch).eq('id', id);
  if (error) throw error;
  await loadAll();
  renderAll();
}

async function deleteRow(table, id) {
  const { error } = await window.db.from(table).delete().eq('id', id);
  if (error) throw error;
  await loadAll();
  renderAll();
}

// ============================================================
// MODAL: nova entrada (tarefa / meta / compromisso / cliente)
// ============================================================

function openModal(defaultType) {
  $('#modal-overlay').classList.add('active');
  $('#entry-form').reset();
  setModalType(defaultType || 'tarefa');
}

function closeModal() {
  $('#modal-overlay').classList.remove('active');
}

$('#fab-add').addEventListener('click', () => {
  const defaultType = state.currentView === 'clientes' ? 'cliente'
    : state.currentView === 'metas' ? 'meta'
    : state.currentView === 'agenda' ? 'evento'
    : 'tarefa';
  openModal(defaultType);
});
$('#modal-close').addEventListener('click', closeModal);
$('#modal-cancel').addEventListener('click', closeModal);
$('#modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'modal-overlay') closeModal(); });

function setModalType(type) {
  state.modalType = type;
  $$('#modal-type-tabs .chip').forEach((c) => c.classList.toggle('active', c.dataset.type === type));

  const isClient = type === 'cliente';

  $('#entry-title-wrap').style.display = isClient ? 'none' : 'block';
  $('#entry-title').required = !isClient;
  $('#client-fields').style.display = isClient ? 'block' : 'none';
  $('#client-name').required = isClient;

  $('#entry-cat-row').style.display = 'grid';
  $('#entry-quadrant-wrap').style.display = type === 'tarefa' ? 'block' : 'none';
  $('#entry-period-wrap').style.display = type === 'meta' ? 'block' : 'none';
  $('#entry-time-wrap').style.display = type === 'evento' ? 'block' : 'none';

  $('#entry-date-row').style.display = isClient ? 'none' : 'grid';
  $('#entry-desc-wrap').style.display = isClient ? 'none' : 'block';

  if (!isClient) {
    const dateLabel = { tarefa: 'Prazo (opcional)', meta: 'Data alvo (opcional)', evento: 'Data' }[type];
    $('#entry-date-label').textContent = dateLabel;
    $('#entry-date').required = type === 'evento';
  }

  const titles = { tarefa: 'Nova tarefa', meta: 'Nova meta', evento: 'Novo compromisso', cliente: 'Novo cliente' };
  $('#modal-title').textContent = titles[type];
}

$('#modal-type-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  setModalType(btn.dataset.type);
});

$('#entry-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = $('#entry-submit-btn');
  submitBtn.disabled = true;

  const category = $('#entry-category').value;
  const dateVal = $('#entry-date').value || null;

  try {
    if (state.modalType === 'tarefa') {
      const { error } = await window.db.from('tasks').insert({
        user_id: state.user.id,
        title: $('#entry-title').value.trim(),
        description: $('#entry-desc').value.trim() || null,
        category,
        quadrant: $('#entry-quadrant').value,
        due_date: dateVal,
      });
      if (error) throw error;
    } else if (state.modalType === 'meta') {
      const { error } = await window.db.from('goals').insert({
        user_id: state.user.id,
        title: $('#entry-title').value.trim(),
        description: $('#entry-desc').value.trim() || null,
        category,
        period: $('#entry-period').value,
        target_date: dateVal,
      });
      if (error) throw error;
    } else if (state.modalType === 'evento') {
      const { error } = await window.db.from('events').insert({
        user_id: state.user.id,
        title: $('#entry-title').value.trim(),
        description: $('#entry-desc').value.trim() || null,
        category,
        event_date: dateVal,
        event_time: $('#entry-time').value || null,
      });
      if (error) throw error;
    } else if (state.modalType === 'cliente') {
      const { error } = await window.db.from('clients').insert({
        user_id: state.user.id,
        name: $('#client-name').value.trim(),
        company: $('#client-company').value.trim() || null,
        phone: $('#client-phone').value.trim() || null,
        email: $('#client-email').value.trim() || null,
        stage: $('#client-stage').value,
        next_action: $('#client-next-action').value.trim() || null,
        next_action_date: $('#client-next-date').value || null,
        category,
      });
      if (error) throw error;
    }
    closeModal();
    await loadAll();
    renderAll();
  } catch (err) {
    alert('Erro ao salvar: ' + err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// ============================================================
// INICIALIZAÇÃO
// ============================================================

checkSession();
