import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const STORE_KEY = 'iguana.registros';

const fallbackCatalogs = {
  categoriasAfectacion: [
    { valor: 'vivienda', etiqueta: 'Vivienda' }, { valor: 'enseres', etiqueta: 'Enseres' },
    { valor: 'alimentos', etiqueta: 'Alimentos' }, { valor: 'ropa', etiqueta: 'Ropa' },
    { valor: 'comercio', etiqueta: 'Comercio' }, { valor: 'ingresos', etiqueta: 'Ingresos' },
    { valor: 'otro', etiqueta: 'Otro' }
  ],
  nivelesAfectacion: [
    { valor: 'leve', etiqueta: 'Leve' }, { valor: 'moderado', etiqueta: 'Moderado' },
    { valor: 'grave', etiqueta: 'Grave' }, { valor: 'perdida_total', etiqueta: 'Pérdida total' }
  ],
  categoriasNecesidad: [
    { valor: 'alimentacion', etiqueta: 'Alimentación' }, { valor: 'alojamiento', etiqueta: 'Alojamiento' },
    { valor: 'aseo', etiqueta: 'Aseo' }, { valor: 'ropa', etiqueta: 'Ropa' },
    { valor: 'enseres', etiqueta: 'Enseres' }, { valor: 'salud', etiqueta: 'Salud' },
    { valor: 'recuperacion_economica', etiqueta: 'Recuperación económica' }, { valor: 'otro', etiqueta: 'Otro' }
  ],
  nivelesUrgencia: [
    { valor: 'baja', etiqueta: 'Baja' }, { valor: 'media', etiqueta: 'Media' }, { valor: 'alta', etiqueta: 'Alta' }
  ]
};

const blankConsulta = () => ({ query: '', loading: false, message: '', kind: 'info', items: null, detail: null });
const blankState = () => ({
  view: 'form', step: 0, submitted: null, apiError: '', fieldErrors: {}, consulta: blankConsulta(),
  hogar: { direccionReferencia: '', observaciones: '' },
  familia: { nombreReferencia: '', telefonoContacto: '' },
  personas: [{ nombres: '', fechaNacimiento: '', requiereApoyo: false, observaciones: '' }],
  afectaciones: [], necesidades: []
});

let state = blankState();
let catalogs = fallbackCatalogs;

const steps = ['Hogar', 'Familia', 'Personas', 'Afectaciones', 'Necesidades'];
const app = document.querySelector('#app');
const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const optionList = (items, selected = '') => items.map(item => `<option value="${esc(item.valor)}" ${item.valor === selected ? 'selected' : ''}>${esc(item.etiqueta)}</option>`).join('');
const labelFor = (items, value) => items.find(item => item.valor === value)?.etiqueta || value;

// Límites del contrato, por nombre de campo
const limits = { direccionReferencia: 200, observaciones: 500, observacionesHogar: 500, nombreReferencia: 150, telefonoContacto: 30, nombres: 150, descripcion: 1000 };
const maxFor = name => limits[name.split('.').pop()] || '';
const today = () => new Date().toISOString().slice(0, 10);

async function loadCatalogs() {
  try {
    const response = await fetch(`${API_BASE_URL}/caracterizacion/catalogos`);
    if (!response.ok) throw new Error(`Catálogos: ${response.status}`);
    catalogs = await response.json();
  } catch (error) {
    console.warn('No fue posible cargar catálogos; se usan los valores del contrato.', error);
  }
}

function render() {
  app.innerHTML = state.view === 'consulta' ? consultaView() : state.submitted ? successView() : state.step === -1 ? welcomeView() : formView();
  bindEvents();
}

function welcomeView() {
  return `<main class="welcome-page">
    <div class="welcome-mark"><i class="bi bi-house-heart-fill"></i></div>
    <p class="eyebrow">LA IGUANÁ · MEDELLÍN</p>
    <h1>Caracterización<br>de hogares</h1>
    <p class="lead">Registro rápido y sencillo para apoyar a las familias de la comunidad.</p>
    <button class="btn btn-primary btn-lg w-100" data-action="start">Comenzar <i class="bi bi-arrow-right"></i></button>
    <button class="btn btn-outline-primary w-100 mt-3" data-action="consulta"><i class="bi bi-search"></i> Consultar familias registradas</button>
    <small>Solo necesitas unos minutos</small>
  </main>`;
}

function formView() {
  const title = steps[state.step];
  return `<div class="app-shell">
    <header class="topbar"><button class="icon-button" data-action="back" aria-label="Volver"><i class="bi bi-arrow-left"></i></button>
      <strong>${state.step + 1}. ${title}</strong><span>${state.step + 1}/5</span></header>
    <div class="progress rounded-0"><div class="progress-bar" style="width:${((state.step + 1) / 5) * 100}%"></div></div>
    <main class="container form-container">
      ${state.apiError ? `<div class="alert alert-danger alert-dismissible">${esc(state.apiError)}<button class="btn-close" data-action="clear-error" aria-label="Cerrar"></button></div>` : ''}
      ${stepContent()}
    </main>
    <footer class="actions">${state.step > 0 ? '<button class="btn btn-outline-primary" data-action="previous"><i class="bi bi-arrow-left"></i> Atrás</button>' : '<span></span>'}
      <button class="btn btn-primary" data-action="next">${state.step === 4 ? 'Finalizar' : 'Siguiente'} <i class="bi bi-arrow-right"></i></button></footer>
  </div>`;
}

function card(title, icon, body) {
  return `<section class="form-card"><h2><i class="bi ${icon}"></i>${title}</h2>${body}</section>`;
}

function inputField(label, name, value, required = false, type = 'text', placeholder = '') {
  const error = state.fieldErrors[name];
  const max = maxFor(name);
  return `<div class="mb-3"><label class="form-label" for="${name}">${label}${required ? ' <span class="required">*</span>' : ' <span class="optional">(opcional)</span>'}</label>
    <input class="form-control ${error ? 'is-invalid' : ''}" id="${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${placeholder}" ${required ? 'required' : ''} ${max ? `maxlength="${max}"` : ''} ${type === 'date' ? `max="${today()}"` : ''}>
    ${error ? `<div class="invalid-feedback">${esc(error)}</div>` : ''}</div>`;
}

function selectField(label, name, value, items, required = true) {
  const error = state.fieldErrors[name];
  return `<div class="mb-3"><label class="form-label" for="${name}">${label}${required ? ' <span class="required">*</span>' : ''}</label>
    <select class="form-select ${error ? 'is-invalid' : ''}" id="${name}" name="${name}" ${required ? 'required' : ''}><option value="">Selecciona una opción</option>${optionList(items, value)}</select>
    ${error ? `<div class="invalid-feedback">${esc(error)}</div>` : ''}</div>`;
}

function stepContent() {
  if (state.step === 0) return card('Datos del hogar', 'bi-house-heart-fill',
    inputField('Dirección de referencia', 'direccionReferencia', state.hogar.direccionReferencia, true, 'text', 'Ej. Calle 10, barrio La Iguaná') +
    inputField('Observaciones', 'observacionesHogar', state.hogar.observaciones, false, 'text', 'Ej. Vivienda afectada por inundación'));
  if (state.step === 1) return card('Datos de la familia', 'bi-people-fill',
    inputField('Nombre de referencia', 'nombreReferencia', state.familia.nombreReferencia, true, 'text', 'Ej. María Pérez') +
    inputField('Teléfono de contacto', 'telefonoContacto', state.familia.telefonoContacto, false, 'tel', 'Ej. 3001234567'));
  if (state.step === 2) return peopleContent();
  if (state.step === 3) return collectionContent('afectaciones', 'Puedes dejar este apartado vacío si no hay afectaciones.', 'Agregar afectación');
  return collectionContent('necesidades', 'Puedes dejar este apartado vacío si no hay necesidades.', 'Agregar necesidad');
}

function peopleContent() {
  const people = state.personas.map((person, index) => `<div class="person-card">
    <div class="item-heading"><span class="number">${index + 1}</span><strong>Persona del hogar</strong>${state.personas.length > 1 ? `<button class="remove-button" data-remove-person="${index}" aria-label="Eliminar persona"><i class="bi bi-trash"></i></button>` : ''}</div>
    ${inputField('Nombres', `personas.${index}.nombres`, person.nombres, true, 'text', 'Ej. María Pérez')}
    ${inputField('Fecha de nacimiento', `personas.${index}.fechaNacimiento`, person.fechaNacimiento, false, 'date')}
    <fieldset><legend>¿Requiere apoyo? <span class="required">*</span></legend>
      <label class="form-check form-check-inline"><input class="form-check-input" type="radio" name="personas.${index}.requiereApoyo" value="false" ${!person.requiereApoyo ? 'checked' : ''}> No</label>
      <label class="form-check form-check-inline"><input class="form-check-input" type="radio" name="personas.${index}.requiereApoyo" value="true" ${person.requiereApoyo ? 'checked' : ''}> Sí</label>
    </fieldset>
    ${inputField('Observaciones', `personas.${index}.observaciones`, person.observaciones, false, 'text', 'Información adicional')}
  </div>`).join('');
  return `<div class="section-intro">${people}<button class="btn btn-link add-link" data-action="add-person"><i class="bi bi-plus-lg"></i> Agregar otra persona</button></div>`;
}

function collectionContent(type, hint, addText) {
  const isAfect = type === 'afectaciones';
  const levelKey = isAfect ? 'nivelAfectacion' : 'nivelUrgencia';
  const items = state[type].map((item, index) => `<div class="item-card">
    <div class="item-heading"><strong>${isAfect ? 'Afectación' : 'Necesidad'} ${index + 1}</strong><button class="remove-button" data-remove="${type}" data-index="${index}" aria-label="Eliminar"><i class="bi bi-trash"></i></button></div>
    ${selectField('Categoría', `${type}.${index}.categoria`, item.categoria, isAfect ? catalogs.categoriasAfectacion : catalogs.categoriasNecesidad)}
    ${inputField('Descripción', `${type}.${index}.descripcion`, item.descripcion, true, 'text', isAfect ? 'Ej. Pérdida de electrodomésticos' : 'Ej. Refugio temporal')}
    ${selectField(isAfect ? 'Nivel de afectación' : 'Nivel de urgencia', `${type}.${index}.${levelKey}`, item[levelKey], isAfect ? catalogs.nivelesAfectacion : catalogs.nivelesUrgencia)}
  </div>`).join('');
  return `<div class="section-intro"><div class="info-box"><i class="bi bi-info-circle"></i>${hint}</div>${items}<button class="btn btn-outline-primary add-button" data-add="${type}"><i class="bi bi-plus-lg"></i> ${addText}</button></div>`;
}

function successView() {
  const result = state.submitted;
  const count = n => `${n} registrada${n === 1 ? '' : 's'}`;
  return `<main class="success-page"><div class="success-icon"><i class="bi bi-check-lg"></i></div><h1>¡Caracterización registrada!</h1><p>${esc(result.mensaje || 'Los datos se han guardado correctamente en el sistema.')}</p>
    <div class="codes"><div><small>Código del hogar</small><strong>${esc(result.hogar.codigo)}</strong></div><div><small>Código de la familia</small><strong>${esc(result.familia.codigo)}</strong></div></div>
    <section class="summary-card"><h2>Resumen</h2>
      ${summaryRow('bi-house-heart-fill', 'Hogar', result.hogar.codigo, result.hogar.id)}
      ${summaryRow('bi-people-fill', 'Familia', result.familia.codigo, result.familia.id)}
      ${summaryRow('bi-person-fill', 'Personas', count(result.resumen.personas))}
      ${summaryRow('bi-exclamation-triangle-fill', 'Afectaciones', count(result.resumen.afectaciones))}
      ${summaryRow('bi-heart-fill', 'Necesidades', count(result.resumen.necesidades))}
    </section><button class="btn btn-primary w-100" data-action="new"><i class="bi bi-plus-lg"></i> Nueva caracterización</button>
    <button class="btn btn-outline-primary w-100 mt-2" data-action="consulta"><i class="bi bi-search"></i> Consultar familias registradas</button>
  </main>`;
}

function summaryRow(icon, title, text, id = '') {
  return `<div class="summary-row"><i class="bi ${icon}"></i><span><strong>${title}</strong><small>${esc(text)}${id ? ` · ID ${esc(id)}` : ''}</small></span></div>`;
}

// ---------- Consulta de familias registradas ----------

const readLocal = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } };
function saveLocalRecord(body) {
  try {
    const record = { hogar: body.hogar, familia: body.familia, resumen: body.resumen, fecha: new Date().toISOString() };
    localStorage.setItem(STORE_KEY, JSON.stringify([record, ...readLocal()].slice(0, 50)));
  } catch { /* almacenamiento no disponible */ }
}

function consultaView() {
  const c = state.consulta;
  const local = readLocal();
  const showLocal = !c.detail && !c.items && local.length;
  return `<div class="app-shell">
    <header class="topbar"><button class="icon-button" data-action="close-consulta" aria-label="Volver"><i class="bi bi-arrow-left"></i></button><strong>Familias registradas</strong><span></span></header>
    <main class="container form-container">
      <form class="search-box" data-form="buscar"><input class="form-control" name="query" value="${esc(c.query)}" placeholder="ID o código (ej. 3 o FAM-0003)">
        <button class="btn btn-primary" type="submit" ${c.loading ? 'disabled' : ''} aria-label="Buscar"><i class="bi bi-search"></i></button></form>
      <button class="btn btn-link p-0 mb-3" data-action="listar"><i class="bi bi-list-ul"></i> Ver todas las familias</button>
      ${c.message ? `<div class="alert alert-${c.kind}">${esc(c.message)}</div>` : ''}
      ${c.loading ? '<div class="text-center py-4"><span class="spinner-border text-primary"></span></div>' : ''}
      ${c.detail ? detailCard(c.detail) : ''}
      ${c.items ? c.items.map(item => detailCard(item, true)).join('') : ''}
      ${showLocal ? `<h2 class="section-title">Registradas desde este dispositivo</h2>${local.map(r => `<div class="item-card">
        <div class="d-flex justify-content-between gap-2"><strong>${esc(r.familia.codigo)} · ${esc(r.hogar.codigo)}</strong><small class="text-muted">${new Date(r.fecha).toLocaleString('es-CO')}</small></div>
        <small>${r.resumen.personas} persona(s) · ${r.resumen.afectaciones} afectación(es) · ${r.resumen.necesidades} necesidad(es)</small>
        <div><button class="btn btn-link p-0" data-lookup="${esc(r.familia.id)}">Consultar en la API</button></div></div>`).join('')}` : ''}
    </main></div>`;
}

function detailCard(data, compact = false) {
  const familia = data.familia || data;
  const hogar = data.hogar || familia.hogar || {};
  const list = (title, rows) => rows.length ? `<div class="mt-2"><small class="text-muted">${title}</small><ul class="mb-0">${rows.map(row => `<li>${row}</li>`).join('')}</ul></div>` : '';
  const personas = (data.personas || familia.personas || []).map(p => `${esc(p.nombres)}${p.fechaNacimiento ? ` (${esc(String(p.fechaNacimiento).slice(0, 10))})` : ''}${p.requiereApoyo ? ' · requiere apoyo' : ''}`);
  const afectaciones = (data.afectaciones || []).map(a => `${esc(labelFor(catalogs.categoriasAfectacion, a.categoria))} — ${esc(labelFor(catalogs.nivelesAfectacion, a.nivelAfectacion))}: ${esc(a.descripcion)}`);
  const necesidades = (data.necesidades || []).map(n => `${esc(labelFor(catalogs.categoriasNecesidad, n.categoria))} — urgencia ${esc(labelFor(catalogs.nivelesUrgencia, n.nivelUrgencia))}: ${esc(n.descripcion)}`);
  return `<div class="item-card"><div class="item-heading"><strong>${esc(familia.codigo || '')}${hogar.codigo ? ` · ${esc(hogar.codigo)}` : ''}</strong>${familia.id ? `<small class="text-muted">ID ${esc(familia.id)}</small>` : ''}</div>
    <div>${esc(familia.nombreReferencia || '')}${familia.telefonoContacto ? ` · ${esc(familia.telefonoContacto)}` : ''}</div>
    ${hogar.direccionReferencia ? `<small class="text-muted">${esc(hogar.direccionReferencia)}</small>` : ''}
    ${compact && data.resumen ? `<div><small>${data.resumen.personas} persona(s) · ${data.resumen.afectaciones} afectación(es) · ${data.resumen.necesidades} necesidad(es)</small></div><button class="btn btn-link p-0" data-lookup="${esc(familia.id)}">Ver detalle</button>` : ''}
    ${compact ? '' : list('Personas', personas) + list('Afectaciones', afectaciones) + list('Necesidades', necesidades)}</div>`;
}

async function runConsulta(path, onOk) {
  const c = state.consulta;
  Object.assign(c, { loading: true, message: '', detail: null, items: null });
  render();
  try {
    const response = await fetch(`${API_BASE_URL}${path}`);
    const body = await response.json().catch(() => null);
    if (response.ok) onOk(body);
    else if (response.status === 404) Object.assign(c, { kind: 'warning', message: `No se encontró información en ${path}. Si el registro existe, el back aún no expone este endpoint de consulta.` });
    else Object.assign(c, { kind: 'danger', message: `La consulta falló (${response.status}).` });
  } catch {
    Object.assign(c, { kind: 'danger', message: `No fue posible conectar con el servidor (${API_BASE_URL}).` });
  }
  c.loading = false;
  render();
}

function buscar(query) {
  const q = String(query).trim();
  state.consulta.query = q;
  const id = /^\d+$/.test(q) ? q : String(parseInt(q.replace(/\D/g, ''), 10) || '');
  if (!id) {
    Object.assign(state.consulta, { kind: 'warning', message: 'Escribe un ID numérico o un código como FAM-0003.', detail: null, items: null });
    render();
    return;
  }
  runConsulta(`/caracterizacion/${id}`, body => { state.consulta.detail = body; });
}

function listar() {
  runConsulta('/caracterizacion', body => {
    const items = Array.isArray(body) ? body : body?.items || body?.data || [];
    if (items.length) state.consulta.items = items;
    else Object.assign(state.consulta, { kind: 'info', message: 'Aún no hay familias registradas.' });
  });
}

// ---------- Formulario ----------

function update(path, value) {
  const [group, index, field] = path.split('.');
  if (field) state[group][Number(index)][field] = value;
  else if (group === 'observacionesHogar') state.hogar.observaciones = value;
  else if (group in state.hogar) state.hogar[group] = value;
  else if (group in state.familia) state.familia[group] = value;
}

function readForm() {
  app.querySelectorAll('.form-container input, .form-container select').forEach(element => {
    if (element.type === 'radio' && !element.checked) return;
    update(element.name, element.type === 'radio' ? element.value === 'true' : element.value);
  });
}

function validateStep() {
  readForm();
  state.fieldErrors = {};
  if (state.step === 0) {
    if (!state.hogar.direccionReferencia.trim()) state.fieldErrors.direccionReferencia = 'Ingresa la dirección de referencia.';
  } else if (state.step === 1) {
    if (!state.familia.nombreReferencia.trim()) state.fieldErrors.nombreReferencia = 'Ingresa el nombre de referencia.';
  } else if (state.step === 2) {
    state.personas.forEach((person, index) => {
      if (!person.nombres.trim()) state.fieldErrors[`personas.${index}.nombres`] = 'Ingresa los nombres.';
      if (person.fechaNacimiento && person.fechaNacimiento > today()) state.fieldErrors[`personas.${index}.fechaNacimiento`] = 'La fecha no puede ser futura.';
    });
  } else if (state.step === 3 || state.step === 4) {
    const type = state.step === 3 ? 'afectaciones' : 'necesidades';
    state[type].forEach((item, index) => {
      if (!item.categoria) state.fieldErrors[`${type}.${index}.categoria`] = 'Selecciona una categoría.';
      if (!item.descripcion.trim()) state.fieldErrors[`${type}.${index}.descripcion`] = 'Ingresa una descripción.';
      const level = type === 'afectaciones' ? 'nivelAfectacion' : 'nivelUrgencia';
      if (!item[level]) state.fieldErrors[`${type}.${index}.${level}`] = 'Selecciona un nivel.';
    });
  }
  if (Object.keys(state.fieldErrors).length) { render(); return false; }
  return true;
}

// Recorta textos y omite los opcionales vacíos: el back rechaza campos fuera del contrato
const clean = (obj, optional) => Object.fromEntries(Object.entries(obj)
  .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
  .filter(([key, value]) => !(optional.includes(key) && value === '')));

function payload() {
  return {
    hogar: clean(state.hogar, ['observaciones']),
    familia: clean(state.familia, ['telefonoContacto']),
    personas: state.personas.map(person => clean(person, ['fechaNacimiento', 'observaciones'])),
    afectaciones: state.afectaciones.map(item => clean(item, [])),
    necesidades: state.necesidades.map(item => clean(item, []))
  };
}

// Ruta del 400 (hogar.observaciones, personas.0.nombres) -> nombre del campo en el formulario
const routeToField = route => route === 'hogar.observaciones' ? 'observacionesHogar' : route.replace(/^(hogar|familia)\./, '');
const stepOfField = name => name.startsWith('personas') ? 2 : name.startsWith('afectaciones') ? 3 : name.startsWith('necesidades') ? 4
  : ['nombreReferencia', 'telefonoContacto'].includes(name) ? 1 : 0;
const spanishError = message => /longer than/.test(message) ? 'El texto es demasiado largo.'
  : /ISO 8601|date/i.test(message) ? 'La fecha no es válida.'
  : /empty|must be/.test(message) ? 'Este campo es obligatorio o no es válido.' : 'Revisa este campo.';

async function submit() {
  state.apiError = '';
  render();
  const button = app.querySelector('[data-action="next"]');
  button.disabled = true;
  button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';
  try {
    const response = await fetch(`${API_BASE_URL}/caracterizacion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
    const body = await response.json().catch(() => ({}));
    if (response.status === 400) {
      state.apiError = 'Revisa los campos marcados. Algunos datos no cumplen las reglas del formulario.';
      state.fieldErrors = {};
      (Array.isArray(body.message) ? body.message : []).forEach(message => {
        state.fieldErrors[routeToField(message.split(' ')[0])] = spanishError(message);
      });
      const errorSteps = Object.keys(state.fieldErrors).map(stepOfField);
      if (errorSteps.length) state.step = Math.min(...errorSteps);
      render();
      return;
    }
    if (response.status === 500) throw new Error('No fue posible registrar la caracterización. No se guardó nada; puedes intentarlo de nuevo con los mismos datos.');
    if (!response.ok) throw new Error(body.message || 'No fue posible registrar la caracterización.');
    saveLocalRecord(body);
    state.submitted = body;
    render();
  } catch (error) {
    state.apiError = error instanceof TypeError
      ? `No fue posible conectar con el servidor (${API_BASE_URL}). Verifica que la API esté corriendo y que este origen esté en CORS_ORIGIN.`
      : error.message;
    render();
  }
}

function bindEvents() {
  app.querySelectorAll('.form-container input, .form-container select').forEach(element => element.addEventListener('input', () => {
    if (element.closest('[data-form]')) return;
    update(element.name, element.type === 'radio' ? element.checked && element.value === 'true' : element.value);
    delete state.fieldErrors[element.name];
  }));
  app.querySelector('[data-form="buscar"]')?.addEventListener('submit', event => {
    event.preventDefault();
    buscar(new FormData(event.target).get('query') || '');
  });
  app.onclick = handleClick;
}

function handleClick(event) {
  const target = event.target.closest('[data-action], [data-add], [data-remove], [data-remove-person], [data-lookup]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'start') { state.step = 0; render(); }
  if (action === 'back') { state.step === 0 ? (state.step = -1) : state.step--; render(); }
  if (action === 'previous') { state.step--; render(); }
  if (action === 'clear-error') { state.apiError = ''; render(); }
  if (action === 'new') { state = blankState(); render(); }
  if (action === 'consulta') { state.view = 'consulta'; state.consulta = blankConsulta(); render(); }
  if (action === 'close-consulta') { state = blankState(); state.step = -1; render(); }
  if (action === 'listar') listar();
  if (target.dataset.lookup) buscar(target.dataset.lookup);
  if (action === 'add-person') { readForm(); state.personas.push({ nombres: '', fechaNacimiento: '', requiereApoyo: false, observaciones: '' }); render(); }
  if (action === 'next') { if (validateStep()) state.step === 4 ? submit() : (state.step++, render()); }
  if (target.dataset.add) {
    readForm(); state[target.dataset.add].push(target.dataset.add === 'afectaciones'
      ? { categoria: '', descripcion: '', nivelAfectacion: '' } : { categoria: '', descripcion: '', nivelUrgencia: '' }); render();
  }
  if (target.dataset.remove) { readForm(); state[target.dataset.remove].splice(Number(target.dataset.index), 1); render(); }
  if (target.dataset.removePerson) { readForm(); state.personas.splice(Number(target.dataset.removePerson), 1); render(); }
}

loadCatalogs().finally(() => { state.step = -1; render(); });
