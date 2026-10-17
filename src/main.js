import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.css';
import { api, ApiError } from './api.js';
import { OPTIONS, NIVELES_DANO, labelOf } from './options.js';

const DRAFT_KEY = 'iguana.borrador.v2';
const VOL_KEY = 'iguana.voluntario';
const CONSENTIMIENTO_VERSION = 'v1';

// ---------- utilidades ----------
const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* sin almacenamiento */ } }
};
const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const isBlank = v => v === null || v === undefined || String(v).trim() === '';
const toInt = v => (/^\d+$/.test(String(v).trim()) ? Number(v) : NaN);
const sortByOrder = list => [...(list || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
const PHONE_RE = /^[0-9+()\-\s]{7,30}$/;

const blankData = () => ({
  voluntario: storage.get(VOL_KEY) || '', fechaAplicacion: todayStr(), autorizaTratamiento: null, autorizaSeguimiento: null,
  vivienda: { direccion: '', interior: '', callejon: '', materialParedes: '', nivelAguaMax: '', inundadaAntes: '' },
  hogar: { nombreReferencia: '', telefonoContacto: '' }, observaciones: '',
  respondente: { esJefe: null, parentesco: '', genero: '', edad: '' },
  numPersonas: '', menores: [], grupos: {},
  escolaridad: { dejaronDeAsistir: null, diasSinAsistir: '', manejoEstudios: '', manejoOtro: '' },
  situacion: { medioAlerta: '', medioAlertaOtro: '', lugarPernocta: '', ingresos: '', ingresosOtro: '', electricaDanada: null, lodo: '', acceso: '', viviendaVista: null, apoyoEmocional: null, numMascotas: 0 },
  danos: {},
  necesidades: {}, prioridades: ['', '', ''],
  visitantes: {}, visitanteOtro: '',
  atencion: { censoPrevio: '', censoQuien: '', dictamen: '', inscritaRud: '', ofertaRecibida: null, ofertaAceptada: null },
  ayudas: {}
});

const blankConsulta = () => ({ loading: false, error: '', items: null, q: '', detail: null });

const ui = {
  view: 'home', stepKey: 'consentimiento', idFicha: null, data: blankData(), errors: {}, banner: [],
  saving: false, catalogs: null, catalogsState: 'loading', anim: null, result: null, consulta: blankConsulta()
};

const app = document.querySelector('#app');
const val = path => path.split('.').reduce((o, k) => o?.[k], ui.data);
function setVal(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), ui.data)[last] = value;
}
const cat = (list, code) => ui.catalogs?.[list]?.find(i => i.codigo === code)?.etiqueta || code;
const persist = () => { if (ui.view === 'wizard') storage.set(DRAFT_KEY, { idFicha: ui.idFicha, data: ui.data, stepKey: ui.stepKey }); };

// ---------- componentes ----------
const requiredMark = required => (required ? ' <span class="required">*</span>' : ' <span class="optional">(opcional)</span>');
const errorOf = path => (ui.errors[path] ? `<div class="field-error"><i class="bi bi-exclamation-circle"></i> ${esc(ui.errors[path])}</div>` : '');

function field(label, path, { type = 'text', required = false, max = '', placeholder = '', inputmode = '', hint = '', min = '', maxValue = '', disabled = false, area = false } = {}) {
  const common = `class="form-control" id="${path}" data-path="${path}" placeholder="${esc(placeholder)}" ${max ? `maxlength="${max}"` : ''} ${disabled ? 'disabled' : ''}`;
  const control = area
    ? `<textarea ${common} rows="3">${esc(val(path) ?? '')}</textarea>`
    : `<input ${common} type="${type}" value="${esc(val(path) ?? '')}" ${inputmode ? `inputmode="${inputmode}"` : ''} ${min !== '' ? `min="${min}"` : ''} ${maxValue !== '' ? `max="${maxValue}"` : ''}>`;
  return `<div class="field ${ui.errors[path] ? 'has-error' : ''}"><label for="${path}">${label}${requiredMark(required)}</label>${control}${hint ? `<div class="hint">${hint}</div>` : ''}${errorOf(path)}</div>`;
}

function choice(label, path, options, { required = true, layout = 'chips', disabled = false, hint = '' } = {}) {
  const current = val(path);
  const buttons = options.map(o => `<button type="button" class="opt ${current === o.v ? 'on' : ''}" data-choice="${path}" data-value="${esc(JSON.stringify(o.v))}" data-clear="${required ? 0 : 1}" aria-pressed="${current === o.v}" ${disabled ? 'disabled' : ''}>${esc(o.l)}</button>`).join('');
  return `<div class="field ${ui.errors[path] ? 'has-error' : ''}"><div class="label">${label}${requiredMark(required)}</div>${hint ? `<div class="hint mb-2">${hint}</div>` : ''}<div class="opts opts-${layout}" role="group">${buttons}</div>${errorOf(path)}</div>`;
}
const YES_NO = [{ v: true, l: 'Sí' }, { v: false, l: 'No' }];
const yesNo = (label, path, opts = {}) => choice(label, path, YES_NO, { layout: 'seg', ...opts });

function stepper(label, path, { min = 0, max = 99, required = false, hint = '' } = {}) {
  const raw = val(path);
  const shown = raw === '' || raw === undefined ? (min === 0 ? 0 : '—') : raw;
  return `<div class="field stepper-row ${ui.errors[path] ? 'has-error' : ''}"><div class="stepper-label"><div class="label">${label}${required ? ' <span class="required">*</span>' : ''}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>
    <div class="stepper"><button type="button" data-stepper="${path}" data-delta="-1" data-min="${min}" data-max="${max}" aria-label="Menos">−</button><output>${shown}</output><button type="button" data-stepper="${path}" data-delta="1" data-min="${min}" data-max="${max}" aria-label="Más">+</button></div>${errorOf(path)}</div>`;
}

const card = (title, icon, body, note = '') => `<section class="card-ui"><h2><i class="bi ${icon}"></i>${title}</h2>${note ? `<p class="card-note">${note}</p>` : ''}${body}</section>`;

// ---------- pasos ----------
const hasMenores = d => d.menores.length > 0;
const locked = () => Boolean(ui.idFicha);

const STEPS = [
  { key: 'consentimiento', title: 'Consentimiento', icon: 'bi-shield-check', render: consentimientoStep, validate: validateConsentimiento },
  { key: 'vivienda', title: 'Vivienda y hogar', icon: 'bi-house-heart-fill', render: viviendaStep, validate: validateVivienda },
  { key: 'respondente', title: 'Quien responde', icon: 'bi-person-fill', render: respondenteStep, validate: validateRespondente },
  { key: 'grupos', title: 'Integrantes', icon: 'bi-people-fill', render: gruposStep, validate: validateGrupos },
  { key: 'escolaridad', title: 'Escolaridad', icon: 'bi-backpack2-fill', show: hasMenores, render: escolaridadStep, validate: validateEscolaridad },
  { key: 'situacion', title: 'Situación actual', icon: 'bi-compass-fill', render: situacionStep, validate: validateSituacion },
  { key: 'danos', title: 'Daños', icon: 'bi-exclamation-triangle-fill', render: danosStep, validate: validateDanos },
  { key: 'necesidades', title: 'Necesidades', icon: 'bi-heart-fill', render: necesidadesStep, validate: validateNecesidades },
  { key: 'visitantes', title: 'Visitas recibidas', icon: 'bi-signpost-split-fill', render: visitantesStep, validate: validateVisitantes },
  { key: 'atencion', title: 'Atención recibida', icon: 'bi-hand-thumbs-up-fill', render: atencionStep, validate: validateAtencion },
  { key: 'cierre', title: 'Cierre', icon: 'bi-flag-fill', render: cierreStep, validate: () => ({}) }
];
const visibleSteps = () => STEPS.filter(s => !s.show || s.show(ui.data));
const currentStep = () => STEPS.find(s => s.key === ui.stepKey) || STEPS[0];

function consentimientoStep() {
  const d = ui.data;
  return card('Antes de empezar', 'bi-shield-check',
    `<div class="info-box"><i class="bi bi-info-circle"></i>Lee en voz alta: <em>«Con su autorización registraremos los datos de su hogar para apoyar la atención de las familias afectadas.»</em></div>` +
    field('Persona que aplica la ficha', 'voluntario', { required: true, max: 100, placeholder: 'Tu nombre', disabled: locked(), hint: 'Se recordará en este dispositivo.' }) +
    field('Fecha de aplicación', 'fechaAplicacion', { type: 'date', required: true, maxValue: todayStr(), disabled: locked() }) +
    yesNo('¿Autoriza el tratamiento de sus datos?', 'autorizaTratamiento', { disabled: locked() }) +
    (d.autorizaTratamiento === true ? yesNo('¿Autoriza que le contactemos para seguimiento?', 'autorizaSeguimiento', { disabled: locked() }) : '') +
    (d.autorizaTratamiento === false ? '<div class="info-box warn"><i class="bi bi-slash-circle"></i>Sin autorización no se registran más datos. La ficha terminará aquí.</div>' : ''));
}

function viviendaStep() {
  const lock = locked();
  return (lock ? '<div class="info-box"><i class="bi bi-lock"></i>Estos datos ya se guardaron y no se pueden cambiar aquí.</div>' : '') +
    card('Vivienda', 'bi-house-door-fill',
      field('Dirección', 'vivienda.direccion', { required: true, max: 200, placeholder: 'Ej. Cra 80 # 50-10', disabled: lock }) +
      '<div class="row-2">' + field('Interior', 'vivienda.interior', { max: 30, disabled: lock }) + field('Callejón', 'vivienda.callejon', { max: 100, disabled: lock }) + '</div>' +
      choice('Material de las paredes', 'vivienda.materialParedes', OPTIONS.materialParedes, { layout: 'list', disabled: lock }) +
      choice('Nivel máximo que alcanzó el agua', 'vivienda.nivelAguaMax', OPTIONS.nivelAguaMax, { disabled: lock }) +
      choice('¿La vivienda se había inundado antes?', 'vivienda.inundadaAntes', OPTIONS.inundadaAntes, { layout: 'seg', disabled: lock })) +
    card('Hogar', 'bi-people-fill',
      field('Nombre de referencia', 'hogar.nombreReferencia', { required: true, max: 150, placeholder: 'Ej. María Gómez', disabled: lock }) +
      field('Teléfono de contacto', 'hogar.telefonoContacto', { type: 'tel', inputmode: 'tel', max: 30, placeholder: 'Ej. 3001234567', disabled: lock }) +
      field('Observaciones', 'observaciones', { area: true, max: 500, placeholder: 'Información adicional', disabled: lock }));
}

function respondenteStep() {
  const r = ui.data.respondente;
  return card('Persona que responde', 'bi-person-fill',
    yesNo('¿Es la persona jefe de hogar?', 'respondente.esJefe') +
    (r.esJefe === false ? field('Parentesco con el jefe de hogar', 'respondente.parentesco', { required: true, max: 50, placeholder: 'Ej. Hija' }) : '') +
    choice('Género', 'respondente.genero', OPTIONS.genero, { required: false }) +
    field('Edad', 'respondente.edad', { type: 'number', inputmode: 'numeric', min: 0, maxValue: 120, placeholder: 'Años' }));
}

function gruposStep() {
  const d = ui.data;
  const n = toInt(d.numPersonas);
  const maxCount = Number.isNaN(n) ? 0 : n;
  const menores = d.menores.map((age, i) => `<div class="menor-row ${ui.errors[`menores.${i}`] ? 'has-error' : ''}"><span class="number">${i + 1}</span>
      <input class="form-control" type="number" inputmode="numeric" min="0" max="17" placeholder="Edad (0–17)" data-path="menores.${i}" value="${esc(age)}" aria-label="Edad del niño o niña ${i + 1}">
      <button type="button" class="icon-btn" data-act="del-menor" data-index="${i}" aria-label="Quitar"><i class="bi bi-x-lg"></i></button></div>${errorOf(`menores.${i}`)}`).join('');
  const grupos = sortByOrder(ui.catalogs.gruposIntegrantes).map(g => stepper(esc(g.etiqueta), `grupos.${g.codigo}`, { min: 0, max: maxCount || 0 })).join('');
  return card('Personas del hogar', 'bi-people-fill',
    stepper('Número de personas que viven en el hogar', 'numPersonas', { min: 1, max: 40, required: true }) +
    `<div class="field ${ui.errors.menores ? 'has-error' : ''}"><div class="label">Niños y niñas (menores de 18)${requiredMark(false)}</div>
      <div class="hint mb-2">Escribe la edad de cada uno. Total: <strong>${d.menores.length}</strong></div>${menores}
      <button type="button" class="btn btn-outline-primary btn-sm mt-1" data-act="add-menor"><i class="bi bi-plus-lg"></i> Agregar niño o niña</button>${errorOf('menores')}</div>`) +
    card('Grupos de integrantes', 'bi-diagram-3-fill', grupos, 'Deja en 0 los grupos que no aplican. Ninguno puede superar el número de personas.');
}

function escolaridadStep() {
  const e = ui.data.escolaridad;
  return card('Escolaridad de niños y niñas', 'bi-backpack2-fill',
    yesNo('¿Dejaron de asistir al estudio por la emergencia?', 'escolaridad.dejaronDeAsistir') +
    (e.dejaronDeAsistir === true ? stepper('Días sin asistir', 'escolaridad.diasSinAsistir', { min: 0, max: 365, required: true }) : '') +
    choice('¿Cómo manejan los estudios ahora?', 'escolaridad.manejoEstudios', OPTIONS.manejoEstudios) +
    (e.manejoEstudios === 'otro' ? field('¿Cuál?', 'escolaridad.manejoOtro', { required: true, max: 200 }) : ''));
}

function situacionStep() {
  const s = ui.data.situacion;
  return card('Durante la emergencia', 'bi-bell-fill',
    choice('¿Cómo se enteró de la emergencia?', 'situacion.medioAlerta', OPTIONS.medioAlerta, { required: false }) +
    (s.medioAlerta === 'otro' ? field('¿Cuál?', 'situacion.medioAlertaOtro', { required: true, max: 200 }) : '')) +
    card('Hoy', 'bi-compass-fill',
      choice('¿Dónde duerme el hogar estos días?', 'situacion.lugarPernocta', OPTIONS.lugarPernocta, { layout: 'list', hint: 'Elige el lugar donde pasan las noches desde la emergencia.' }) +
      choice('Ingresos del hogar', 'situacion.ingresos', OPTIONS.ingresos, { required: false }) +
      (s.ingresos === 'otro' ? field('¿Cuál?', 'situacion.ingresosOtro', { required: true, max: 200 }) : '')) +
    card('Estado de la vivienda', 'bi-house-gear-fill',
      yesNo('¿La instalación eléctrica quedó dañada?', 'situacion.electricaDanada') +
      choice('¿Cuánto lodo hay en la vivienda?', 'situacion.lodo', OPTIONS.lodo, { layout: 'seg' }) +
      choice('Acceso a la vivienda', 'situacion.acceso', OPTIONS.acceso, { layout: 'seg' }) +
      yesNo('¿Ha podido ver su vivienda después de la emergencia?', 'situacion.viviendaVista', { required: false }) +
      yesNo('¿Necesita apoyo emocional?', 'situacion.apoyoEmocional', { required: false }) +
      stepper('Mascotas en el hogar', 'situacion.numMascotas', { min: 0, max: 30 }));
}

const danoTotal = () => Object.values(ui.data.danos).reduce((sum, v) => sum + (Number.isInteger(v) ? v : 0), 0);

function danosStep() {
  const rows = sortByOrder(ui.catalogs.categoriasDano).map(c => {
    const current = ui.data.danos[c.codigo];
    return `<div class="dano-row ${ui.errors[`danos.${c.codigo}`] ? 'has-error' : ''}"><div class="dano-name">${esc(c.etiqueta)}</div>
      <div class="scale" role="group" aria-label="${esc(c.etiqueta)}">${NIVELES_DANO.map(n => `<button type="button" class="scale-btn lv${n.v} ${current === n.v ? 'on' : ''}" data-choice="danos.${c.codigo}" data-value="${n.v}" data-clear="0" aria-pressed="${current === n.v}"><b>${n.v}</b><span>${n.l}</span></button>`).join('')}</div>${errorOf(`danos.${c.codigo}`)}</div>`;
  }).join('');
  return card('Nivel de daño por categoría', 'bi-exclamation-triangle-fill', rows, 'Responde las 8. «Sin daño» también es una respuesta.') +
    `<div class="total-pill"><span>Total de daño</span><strong>${danoTotal()}</strong><small>de ${sortByOrder(ui.catalogs.categoriasDano).length * 4}</small></div>`;
}

function necesidadesStep() {
  const d = ui.data;
  const items = ui.catalogs.itemsNecesidad;
  const groups = sortByOrder(ui.catalogs.gruposNecesidad).map(g => {
    const list = sortByOrder(items.filter(i => i.grupo === g.codigo));
    if (!list.length) return '';
    return `<div class="need-group"><div class="need-title">${esc(g.etiqueta)}</div><div class="opts opts-chips">${list.map(i => {
      const on = i.codigo in d.necesidades;
      return `<button type="button" class="opt ${on ? 'on' : ''}" data-toggle="necesidades:${i.codigo}" aria-pressed="${on}">${esc(i.etiqueta)}</button>`;
    }).join('')}</div>${g.codigo === 'salud_cuidado' && 'otro_condicion_especial' in d.necesidades ? field('Describe la condición especial', 'necesidades.otro_condicion_especial.detalle', { required: true, max: 300, placeholder: 'Ej. Pañales para adulto mayor' }) : ''}</div>`;
  }).join('');
  const selected = Object.keys(d.necesidades);
  const prios = selected.length ? `<div class="prio">${[0, 1, 2].map(i => `<div class="prio-row"><span class="number">${i + 1}</span><select class="form-select" data-prio="${i}" aria-label="Prioridad ${i + 1}"><option value="">${i === 0 ? 'Lo más urgente…' : 'Elegir…'}</option>${selected.filter(code => d.prioridades[i] === code || !d.prioridades.includes(code)).map(code => `<option value="${code}" ${d.prioridades[i] === code ? 'selected' : ''}>${esc(cat('itemsNecesidad', code))}</option>`).join('')}</select></div>`).join('')}</div>` : '<p class="card-note mb-0">Marca primero las necesidades para poder priorizarlas.</p>';
  return card('¿Qué necesita el hogar?', 'bi-heart-fill', groups, 'Marca solo lo que necesitan. Puedes dejarlo vacío.') +
    card('Las 3 más urgentes', 'bi-sort-numeric-down', prios, 'Opcional. No se pueden repetir.');
}

function visitantesStep() {
  const d = ui.data;
  const buttons = sortByOrder(ui.catalogs.actores).map(a => {
    const on = Boolean(d.visitantes[a.codigo]);
    const off = a.codigo !== 'nadie' && d.visitantes.nadie;
    return `<button type="button" class="opt ${on ? 'on' : ''}" data-toggle="visitantes:${a.codigo}" aria-pressed="${on}" ${off ? 'disabled' : ''}>${esc(a.etiqueta)}</button>`;
  }).join('');
  return card('¿Quién ha visitado el hogar?', 'bi-signpost-split-fill',
    `<div class="field ${ui.errors.visitantes ? 'has-error' : ''}"><div class="opts opts-chips">${buttons}</div>${errorOf('visitantes')}</div>` +
    (d.visitantes.otro ? field('¿Quién más?', 'visitanteOtro', { required: true, max: 200, placeholder: 'Ej. Parroquia' }) : ''),
    'Puedes marcar varias. «Nadie» desmarca las demás.');
}

function atencionStep() {
  const a = ui.data.atencion;
  const ayudas = sortByOrder(ui.catalogs.tiposAyuda).map(t => {
    const on = Boolean(ui.data.ayudas[t.codigo]);
    return `<button type="button" class="opt ${on ? 'on' : ''}" data-toggle="ayudas:${t.codigo}" aria-pressed="${on}" ${ui.data.ayudas.ninguna ? 'disabled' : ''}>${esc(t.etiqueta)}</button>`;
  }).join('') + `<button type="button" class="opt ${ui.data.ayudas.ninguna ? 'on' : ''}" data-toggle="ayudas:ninguna" aria-pressed="${Boolean(ui.data.ayudas.ninguna)}">Ninguna</button>`;
  return card('Censo y evaluación', 'bi-clipboard2-check-fill',
    choice('¿Ya los habían censado antes?', 'atencion.censoPrevio', OPTIONS.censoPrevio, { layout: 'seg' }) +
    (a.censoPrevio === 'si' ? field('¿Quién los censó?', 'atencion.censoQuien', { max: 150, placeholder: 'Ej. Alcaldía' }) : '') +
    choice('Dictamen de la vivienda', 'atencion.dictamen', OPTIONS.dictamen, { layout: 'list' }) +
    choice('¿Está inscrita en el RUD?', 'atencion.inscritaRud', OPTIONS.inscritaRud, { layout: 'seg' })) +
    card('Ayudas', 'bi-box2-heart-fill',
      yesNo('¿Han recibido alguna oferta de atención?', 'atencion.ofertaRecibida') +
      (a.ofertaRecibida === true ? yesNo('¿La aceptaron?', 'atencion.ofertaAceptada') : '') +
      `<div class="field ${ui.errors.ayudas ? 'has-error' : ''}"><div class="label">Ayudas recibidas${requiredMark(true)}</div><div class="opts opts-chips">${ayudas}</div>${errorOf('ayudas')}</div>`);
}

function cierreStep() {
  const d = ui.data;
  const rows = [
    ['bi-person-fill', 'Quien responde', d.respondente.esJefe ? 'Jefe de hogar' : `Parentesco: ${d.respondente.parentesco || '—'}`],
    ['bi-people-fill', 'Personas en el hogar', `${d.numPersonas || 0} (${d.menores.length} niños y niñas)`],
    ['bi-house-door-fill', 'Duerme en', labelOf(OPTIONS.lugarPernocta, d.situacion.lugarPernocta) || '—'],
    ['bi-exclamation-triangle-fill', 'Total de daño', `${danoTotal()} de ${sortByOrder(ui.catalogs.categoriasDano).length * 4}`],
    ['bi-heart-fill', 'Necesidades marcadas', Object.keys(d.necesidades).length],
    ['bi-signpost-split-fill', 'Visitas', Object.keys(d.visitantes).filter(k => d.visitantes[k]).length || 0]
  ];
  return card('Resumen de la ficha', 'bi-flag-fill', rows.map(([icon, title, text]) => summaryRow(icon, title, text)).join(''), 'Al completar, la ficha se cierra y ya no se puede editar. Las alertas de seguimiento se calcularán con lo respondido.');
}

function summaryRow(icon, title, text) {
  return `<div class="summary-row"><i class="bi ${icon}"></i><span><strong>${esc(title)}</strong><small>${esc(text)}</small></span></div>`;
}

// ---------- validación ----------
const needed = (errors, path, value, msg = 'Este dato es obligatorio.') => { if (isBlank(value)) errors[path] = msg; };
const picked = (errors, path, value, msg = 'Elige una opción.') => { if (value === null || value === undefined || value === '') errors[path] = msg; };

function validateConsentimiento() {
  const d = ui.data; const e = {};
  needed(e, 'voluntario', d.voluntario);
  if (isBlank(d.fechaAplicacion)) e.fechaAplicacion = 'Indica la fecha.';
  else if (d.fechaAplicacion > todayStr()) e.fechaAplicacion = 'La fecha no puede ser futura.';
  picked(e, 'autorizaTratamiento', d.autorizaTratamiento);
  if (d.autorizaTratamiento === true) picked(e, 'autorizaSeguimiento', d.autorizaSeguimiento);
  return e;
}
function validateVivienda() {
  const d = ui.data; const e = {};
  if (locked()) return e;
  needed(e, 'vivienda.direccion', d.vivienda.direccion);
  picked(e, 'vivienda.materialParedes', d.vivienda.materialParedes);
  picked(e, 'vivienda.nivelAguaMax', d.vivienda.nivelAguaMax);
  picked(e, 'vivienda.inundadaAntes', d.vivienda.inundadaAntes);
  needed(e, 'hogar.nombreReferencia', d.hogar.nombreReferencia);
  if (!isBlank(d.hogar.telefonoContacto) && !PHONE_RE.test(d.hogar.telefonoContacto.trim())) e['hogar.telefonoContacto'] = 'Usa entre 7 y 30 caracteres: dígitos, + ( ) - y espacios.';
  return e;
}
function validateRespondente() {
  const r = ui.data.respondente; const e = {};
  picked(e, 'respondente.esJefe', r.esJefe);
  if (r.esJefe === false) needed(e, 'respondente.parentesco', r.parentesco, 'Indica el parentesco.');
  if (!isBlank(r.edad) && !(toInt(r.edad) <= 120)) e['respondente.edad'] = 'Edad entre 0 y 120.';
  return e;
}
function validateGrupos() {
  const d = ui.data; const e = {};
  const n = toInt(d.numPersonas);
  if (!(n >= 1)) e.numPersonas = 'Indica cuántas personas viven en el hogar (mínimo 1).';
  d.menores.forEach((age, i) => { if (!(toInt(age) <= 17)) e[`menores.${i}`] = 'Edad entre 0 y 17.'; });
  if (n >= 1) {
    if (d.menores.length > n) e.menores = `Hay más niños y niñas (${d.menores.length}) que personas en el hogar (${n}).`;
    Object.entries(d.grupos).forEach(([code, qty]) => { if (qty > n) e[`grupos.${code}`] = `No puede superar ${n}.`; });
  }
  return e;
}
function validateEscolaridad() {
  const s = ui.data.escolaridad; const e = {};
  picked(e, 'escolaridad.dejaronDeAsistir', s.dejaronDeAsistir);
  if (s.dejaronDeAsistir === true && isBlank(s.diasSinAsistir)) e['escolaridad.diasSinAsistir'] = 'Indica los días.';
  picked(e, 'escolaridad.manejoEstudios', s.manejoEstudios);
  if (s.manejoEstudios === 'otro') needed(e, 'escolaridad.manejoOtro', s.manejoOtro, 'Describe cuál.');
  return e;
}
function validateSituacion() {
  const s = ui.data.situacion; const e = {};
  picked(e, 'situacion.lugarPernocta', s.lugarPernocta);
  picked(e, 'situacion.electricaDanada', s.electricaDanada);
  picked(e, 'situacion.lodo', s.lodo);
  picked(e, 'situacion.acceso', s.acceso);
  if (s.medioAlerta === 'otro') needed(e, 'situacion.medioAlertaOtro', s.medioAlertaOtro, 'Describe cuál.');
  if (s.ingresos === 'otro') needed(e, 'situacion.ingresosOtro', s.ingresosOtro, 'Describe cuál.');
  return e;
}
function validateDanos() {
  const e = {};
  ui.catalogs.categoriasDano.forEach(c => { if (!Number.isInteger(ui.data.danos[c.codigo])) e[`danos.${c.codigo}`] = 'Elige un nivel.'; });
  return e;
}
function validateNecesidades() {
  const e = {};
  if ('otro_condicion_especial' in ui.data.necesidades) needed(e, 'necesidades.otro_condicion_especial.detalle', ui.data.necesidades.otro_condicion_especial.detalle, 'Describe la condición.');
  return e;
}
function validateVisitantes() {
  const d = ui.data; const e = {};
  if (!Object.values(d.visitantes).some(Boolean)) e.visitantes = 'Marca al menos una opción (o «Nadie»).';
  if (d.visitantes.otro) needed(e, 'visitanteOtro', d.visitanteOtro, 'Indica quién.');
  return e;
}
function validateAtencion() {
  const d = ui.data; const a = d.atencion; const e = {};
  picked(e, 'atencion.censoPrevio', a.censoPrevio);
  picked(e, 'atencion.dictamen', a.dictamen);
  picked(e, 'atencion.inscritaRud', a.inscritaRud);
  picked(e, 'atencion.ofertaRecibida', a.ofertaRecibida);
  if (a.ofertaRecibida === true) picked(e, 'atencion.ofertaAceptada', a.ofertaAceptada);
  if (!Object.values(d.ayudas).some(Boolean)) e.ayudas = 'Marca las ayudas recibidas o «Ninguna».';
  return e;
}

// ---------- payloads (solo se envía lo visible) ----------
const text = v => String(v).trim();
const optional = (obj, key, value) => { if (!isBlank(value)) obj[key] = typeof value === 'string' ? text(value) : value; };

function fichaPayload() {
  const d = ui.data;
  const base = { voluntario: text(d.voluntario), fechaAplicacion: d.fechaAplicacion, autorizaTratamiento: d.autorizaTratamiento, versionConsentimiento: CONSENTIMIENTO_VERSION };
  if (d.autorizaTratamiento !== true) return base;
  const vivienda = { direccion: text(d.vivienda.direccion), materialParedes: d.vivienda.materialParedes, nivelAguaMax: d.vivienda.nivelAguaMax, inundadaAntes: d.vivienda.inundadaAntes };
  optional(vivienda, 'interior', d.vivienda.interior); optional(vivienda, 'callejon', d.vivienda.callejon);
  const hogar = { nombreReferencia: text(d.hogar.nombreReferencia) };
  optional(hogar, 'telefonoContacto', d.hogar.telefonoContacto);
  const body = { ...base, autorizaSeguimiento: d.autorizaSeguimiento, vivienda, hogar };
  optional(body, 'observaciones', d.observaciones);
  return body;
}

const PAYLOADS = {
  respondente() {
    const r = ui.data.respondente;
    const body = { esJefe: r.esJefe };
    if (r.esJefe === false) body.parentesco = text(r.parentesco);
    optional(body, 'genero', r.genero);
    if (!isBlank(r.edad)) body.edad = toInt(r.edad);
    return body;
  },
  grupos() {
    const d = ui.data;
    return {
      numPersonas: toInt(d.numPersonas), menores: d.menores.map(toInt),
      grupos: Object.entries(d.grupos).filter(([, qty]) => qty > 0).map(([grupo, cantidad]) => ({ grupo, cantidad }))
    };
  },
  escolaridad() {
    const s = ui.data.escolaridad;
    const body = { dejaronDeAsistir: s.dejaronDeAsistir, manejoEstudios: s.manejoEstudios };
    if (s.dejaronDeAsistir) body.diasSinAsistir = toInt(s.diasSinAsistir);
    if (s.manejoEstudios === 'otro') body.manejoOtro = text(s.manejoOtro);
    return body;
  },
  situacion() {
    const s = ui.data.situacion;
    const body = { lugarPernocta: s.lugarPernocta, electricaDanada: s.electricaDanada, lodo: s.lodo, acceso: s.acceso, numMascotas: Number(s.numMascotas) || 0 };
    optional(body, 'medioAlerta', s.medioAlerta); optional(body, 'ingresos', s.ingresos);
    if (s.medioAlerta === 'otro') body.medioAlertaOtro = text(s.medioAlertaOtro);
    if (s.ingresos === 'otro') body.ingresosOtro = text(s.ingresosOtro);
    if (s.viviendaVista !== null) body.viviendaVista = s.viviendaVista;
    if (s.apoyoEmocional !== null) body.apoyoEmocional = s.apoyoEmocional;
    return body;
  },
  danos() {
    return { danos: sortByOrder(ui.catalogs.categoriasDano).map(c => ({ categoria: c.codigo, nivel: ui.data.danos[c.codigo] })) };
  },
  necesidades() {
    const d = ui.data;
    return {
      necesidades: Object.keys(d.necesidades).map(item => {
        const entry = { item };
        const prio = d.prioridades.indexOf(item);
        if (prio >= 0) entry.prioridad = prio + 1;
        if (item === 'otro_condicion_especial') entry.detalle = text(d.necesidades[item].detalle);
        return entry;
      })
    };
  },
  visitantes() {
    const d = ui.data;
    const actors = d.visitantes.nadie ? ['nadie'] : Object.keys(d.visitantes).filter(k => d.visitantes[k]);
    return { visitantes: actors.map(actor => (actor === 'otro' ? { actor, detalle: text(d.visitanteOtro) } : { actor })) };
  },
  atencion() {
    const d = ui.data; const a = d.atencion;
    const body = { censoPrevio: a.censoPrevio, dictamen: a.dictamen, inscritaRud: a.inscritaRud, ofertaRecibida: a.ofertaRecibida, ayudasRecibidas: d.ayudas.ninguna ? [] : Object.keys(d.ayudas).filter(k => d.ayudas[k]) };
    if (a.censoPrevio === 'si') optional(body, 'censoQuien', a.censoQuien);
    if (a.ofertaRecibida) body.ofertaAceptada = a.ofertaAceptada;
    return body;
  }
};

// ---------- vistas ----------
function render({ keepScroll = true } = {}) {
  const scroll = window.scrollY;
  const views = { home: homeView, wizard: wizardView, end: endView, consulta: consultaView, detail: detailView };
  app.innerHTML = views[ui.view]();
  if (ui.view === 'consulta' && ui.consulta.items) document.querySelector('#lista').innerHTML = listHtml();
  window.scrollTo(0, keepScroll ? scroll : 0);
  ui.anim = null;
}

function homeView() {
  const draft = storage.get(DRAFT_KEY);
  const status = ui.catalogsState === 'error'
    ? `<div class="alert alert-warning text-start"><i class="bi bi-wifi-off"></i> No se pudo cargar el formulario desde el servidor. <button class="btn btn-link p-0 align-baseline" data-act="retry-catalogs">Reintentar</button></div>`
    : ui.catalogsState === 'loading' ? '<p class="loading-line"><span class="spinner-border spinner-border-sm"></span> Conectando con el servidor…</p>' : '';
  return `<main class="welcome-page fade-in">
    <div class="welcome-mark"><i class="bi bi-house-heart-fill"></i></div>
    <p class="eyebrow">LA IGUANÁ · MEDELLÍN</p>
    <h1>Caracterización<br>de hogares</h1>
    <p class="lead">Una ficha por hogar, paso a paso. Tus respuestas se guardan mientras avanzas.</p>
    ${status}
    ${draft ? `<button class="btn btn-primary btn-lg w-100 mb-2" data-act="resume"><i class="bi bi-play-fill"></i> Continuar ficha en borrador</button>
      <button class="btn btn-outline-primary w-100" data-act="start">Empezar una ficha nueva</button>`
      : '<button class="btn btn-primary btn-lg w-100" data-act="start">Comenzar <i class="bi bi-arrow-right"></i></button>'}
    <button class="btn btn-link mt-3" data-act="consulta"><i class="bi bi-search"></i> Consultar fichas registradas</button>
  </main>`;
}

function wizardView() {
  const steps = visibleSteps();
  const step = currentStep();
  const index = steps.findIndex(s => s.key === step.key);
  const last = index === steps.length - 1;
  const endsHere = step.key === 'consentimiento' && ui.data.autorizaTratamiento === false;
  const banner = ui.banner.length ? `<div class="alert alert-danger alert-dismissible fade-in"><ul>${ui.banner.map(m => `<li>${esc(m)}</li>`).join('')}</ul><button class="btn-close" data-act="dismiss" aria-label="Cerrar"></button></div>` : '';
  const animClass = ui.anim === 'fwd' ? 'slide-fwd' : ui.anim === 'back' ? 'slide-back' : '';
  return `<div class="app-shell">
    <header class="topbar"><button class="icon-button" data-act="back" aria-label="Volver"><i class="bi bi-arrow-left"></i></button>
      <strong>${esc(step.title)}</strong><span>${index + 1}/${steps.length}</span></header>
    <div class="steps-bar" aria-hidden="true">${steps.map((_, i) => `<i class="${i < index ? 'done' : i === index ? 'now' : ''}"></i>`).join('')}</div>
    <main class="container form-container"><div class="step-body ${animClass}">${banner}${step.render()}</div></main>
    <footer class="actions"><button class="btn btn-outline-primary" data-act="back" ${ui.saving ? 'disabled' : ''}><i class="bi bi-arrow-left"></i> Atrás</button>
      <button class="btn btn-primary" data-act="next" ${ui.saving ? 'disabled' : ''}>${ui.saving ? '<span class="spinner-border spinner-border-sm me-2"></span>Guardando…' : `${endsHere ? 'Finalizar' : last ? 'Completar ficha' : 'Siguiente'} <i class="bi bi-${last ? 'check2' : 'arrow-right'}"></i>`}</button></footer>
  </div>`;
}

const ALERTAS = [
  ['duermeEnRiesgo', 'bi-moon-stars-fill', 'Duerme en un lugar de riesgo'],
  ['urgenteSalud', 'bi-heart-pulse-fill', 'Urgencia de salud'],
  ['urgenteAguaAlimento', 'bi-droplet-half', 'Urgencia de agua o alimento'],
  ['electricaRiesgo', 'bi-lightning-charge-fill', 'Riesgo eléctrico']
];
function alertsHtml(seguimiento) {
  if (!seguimiento) return '';
  return `<section class="card-ui alerts"><h2><i class="bi bi-bell-fill"></i>Seguimiento urgente</h2>
    ${ALERTAS.map(([key, icon, label]) => `<div class="alert-row ${seguimiento[key] ? 'on' : ''}"><i class="bi ${icon}"></i><span>${label}</span><b>${seguimiento[key] ? 'Sí' : 'No'}</b></div>`).join('')}
    <div class="follow ${seguimiento.requiereSeguimiento ? 'on' : ''}"><i class="bi bi-${seguimiento.requiereSeguimiento ? 'exclamation-octagon-fill' : 'check-circle-fill'}"></i>${seguimiento.requiereSeguimiento ? 'Requiere seguimiento' : 'No requiere seguimiento por ahora'}</div></section>`;
}

function endView() {
  const r = ui.result;
  if (r.sinAutorizacion) {
    return `<main class="success-page fade-in"><div class="success-icon muted"><i class="bi bi-slash-lg"></i></div><h1>Ficha cerrada</h1>
      <p>La persona no autorizó el tratamiento de sus datos, así que no se registró información del hogar.</p>
      <button class="btn btn-primary w-100" data-act="start"><i class="bi bi-plus-lg"></i> Nueva ficha</button><button class="btn btn-link mt-2" data-act="home">Volver al inicio</button></main>`;
  }
  const f = r.ficha;
  return `<main class="success-page fade-in"><div class="success-icon"><i class="bi bi-check-lg"></i></div><h1>¡Ficha completada!</h1><p>Los datos se guardaron correctamente.</p>
    <div class="codes"><div><small>Código del hogar</small><strong>${esc(f.hogar?.codigoHogar || '—')}</strong></div><div><small>Ficha</small><strong>#${esc(f.idFicha)}</strong></div></div>
    <section class="card-ui w-100 text-start"><h2><i class="bi bi-clipboard-data-fill"></i>Resumen</h2>
      ${summaryRow('bi-people-fill', 'Personas', f.resumen?.numPersonas ?? '—')}${summaryRow('bi-balloon-heart-fill', 'Niños y niñas', f.resumen?.ninos ?? '—')}
      ${summaryRow('bi-person-heart', 'Adultos mayores', f.resumen?.adultosMayores ?? '—')}${summaryRow('bi-exclamation-triangle-fill', 'Total de daño', f.resumen?.totalDano ?? '—')}</section>
    <div class="w-100 text-start">${alertsHtml(f.seguimiento)}</div>
    <button class="btn btn-primary w-100" data-act="start"><i class="bi bi-plus-lg"></i> Nueva ficha</button>
    <button class="btn btn-outline-primary w-100 mt-2" data-act="consulta"><i class="bi bi-search"></i> Consultar fichas</button></main>`;
}

// ---------- consulta ----------
const estadoBadge = estado => `<span class="badge-estado ${esc(estado)}">${esc({ borrador: 'Borrador', completa: 'Completa', sin_autorizacion: 'Sin autorización' }[estado] || estado)}</span>`;

function listHtml() {
  const c = ui.consulta;
  const q = c.q.trim().toLowerCase();
  const items = c.items.filter(i => !q || [i.codigoHogar, i.nombreReferencia, i.direccion, i.idFicha].some(v => String(v ?? '').toLowerCase().includes(q)));
  if (!items.length) return '<p class="empty">No hay fichas que coincidan.</p>';
  return items.map(i => `<button class="ficha-card" data-act="open-ficha" data-id="${esc(i.idFicha)}">
    <div class="d-flex justify-content-between gap-2"><strong>${esc(i.codigoHogar || `Ficha #${i.idFicha}`)}</strong>${estadoBadge(i.estado)}</div>
    <div>${esc(i.nombreReferencia || 'Sin nombre')}</div><small class="text-muted">${esc(i.direccion || '')}</small>
    <small class="meta">${i.numPersonas ?? '–'} personas · ${i.ninos ?? 0} niños · daño ${i.totalDano ?? 0}</small></button>`).join('');
}

function consultaView() {
  const c = ui.consulta;
  return `<div class="app-shell"><header class="topbar"><button class="icon-button" data-act="home" aria-label="Volver"><i class="bi bi-arrow-left"></i></button><strong>Fichas registradas</strong><span></span></header>
    <main class="container form-container fade-in">
      <div class="search-box"><i class="bi bi-search"></i><input class="form-control" data-filter placeholder="Buscar por código, nombre, dirección o ID" value="${esc(c.q)}"></div>
      ${c.loading ? '<div class="text-center py-5"><span class="spinner-border text-primary"></span></div>' : ''}
      ${c.error ? `<div class="alert alert-danger">${esc(c.error)} <button class="btn btn-link p-0 align-baseline" data-act="consulta">Reintentar</button></div>` : ''}
      <div id="lista"></div></main></div>`;
}

async function openConsulta() {
  ui.view = 'consulta';
  ui.consulta = { ...blankConsulta(), loading: true };
  render({ keepScroll: false });
  try {
    ui.consulta.items = await api('GET', '/fichas?limite=100');
  } catch (error) {
    ui.consulta.error = error.messages[0];
  }
  ui.consulta.loading = false;
  if (ui.view === 'consulta') render();
}

async function openFicha(id) {
  ui.consulta.loading = true;
  try {
    ui.consulta.detail = await api('GET', `/fichas/${id}`);
    ui.view = 'detail';
  } catch (error) {
    ui.consulta.error = error.messages[0];
  }
  ui.consulta.loading = false;
  render({ keepScroll: false });
}

function detailView() {
  const f = ui.consulta.detail;
  const list = (title, icon, rows) => (rows.length ? card(title, icon, `<ul class="detail-list">${rows.map(r => `<li>${r}</li>`).join('')}</ul>`) : '');
  const v = f.hogar?.vivienda || {};
  return `<div class="app-shell"><header class="topbar"><button class="icon-button" data-act="consulta" aria-label="Volver"><i class="bi bi-arrow-left"></i></button><strong>${esc(f.hogar?.codigoHogar || `Ficha #${f.idFicha}`)}</strong>${estadoBadge(f.estado)}</header>
    <main class="container form-container fade-in">
      ${card('Hogar', 'bi-house-heart-fill', summaryRow('bi-person-fill', 'Referencia', `${f.hogar?.nombreReferencia || '—'}${f.hogar?.telefonoContacto ? ` · ${f.hogar.telefonoContacto}` : ''}`) +
        summaryRow('bi-geo-alt-fill', 'Dirección', [v.direccion, v.interior && `Int. ${v.interior}`, v.callejon].filter(Boolean).join(', ') || '—') +
        summaryRow('bi-bricks', 'Paredes', labelOf(OPTIONS.materialParedes, v.materialParedes) || '—') + summaryRow('bi-water', 'Nivel del agua', labelOf(OPTIONS.nivelAguaMax, v.nivelAguaMax) || '—') +
        summaryRow('bi-calendar-event', 'Aplicada', `${String(f.fechaAplicacion).slice(0, 10)} por ${f.voluntario || '—'}`))}
      ${f.resumen ? card('Resumen', 'bi-clipboard-data-fill', summaryRow('bi-people-fill', 'Personas', f.resumen.numPersonas) + summaryRow('bi-balloon-heart-fill', 'Niños y niñas', f.resumen.ninos) + summaryRow('bi-person-heart', 'Adultos mayores', f.resumen.adultosMayores) + summaryRow('bi-exclamation-triangle-fill', 'Total de daño', f.resumen.totalDano)) : ''}
      ${alertsHtml(f.seguimiento)}
      ${list('Integrantes', 'bi-diagram-3-fill', [...(f.menores?.length ? [`Menores: ${f.menores.map(m => `${esc(m)} años`).join(', ')}`] : []), ...(f.grupos || []).map(g => `${esc(cat('gruposIntegrantes', g.grupo))}: <b>${esc(g.cantidad)}</b>`)])}
      ${list('Daños', 'bi-exclamation-triangle-fill', (f.danos || []).map(x => `${esc(cat('categoriasDano', x.categoria))}: <b>${esc(NIVELES_DANO.find(n => n.v === x.nivel)?.l ?? x.nivel)}</b>`))}
      ${list('Necesidades', 'bi-heart-fill', (f.necesidades || []).map(n => `${n.prioridad ? `<b>#${esc(n.prioridad)}</b> ` : ''}${esc(cat('itemsNecesidad', n.item))}${n.detalle ? ` — ${esc(n.detalle)}` : ''}`))}
      ${list('Visitas', 'bi-signpost-split-fill', (f.visitantes || []).map(x => `${esc(cat('actores', x.actor))}${x.detalle ? ` — ${esc(x.detalle)}` : ''}`))}
      ${list('Ayudas recibidas', 'bi-box2-heart-fill', (f.ayudasRecibidas || []).map(x => esc(cat('tiposAyuda', x.tipoAyuda))))}
    </main></div>`;
}

// ---------- flujo ----------
async function loadCatalogs() {
  ui.catalogsState = 'loading';
  if (ui.view === 'home') render();
  try {
    ui.catalogs = await api('GET', '/catalogos', undefined, { timeout: 12000 });
    ui.catalogsState = 'ok';
  } catch {
    ui.catalogsState = 'error';
  }
  if (ui.view === 'home') render();
}

function goTo(key, anim) {
  ui.stepKey = key;
  ui.errors = {};
  ui.banner = [];
  ui.anim = anim;
  persist();
  render({ keepScroll: false });
}

function previous() {
  const steps = visibleSteps();
  const index = steps.findIndex(s => s.key === ui.stepKey);
  if (index <= 0) { ui.view = 'home'; render({ keepScroll: false }); return; }
  goTo(steps[index - 1].key, 'back');
}

async function save(step) {
  const d = ui.data;
  if (step.key === 'consentimiento') {
    storage.set(VOL_KEY, text(d.voluntario));
    if (d.autorizaTratamiento === false && !ui.idFicha) {
      await api('POST', '/fichas', fichaPayload());
      return 'end-sin-autorizacion';
    }
  } else if (step.key === 'vivienda') {
    if (!ui.idFicha) ui.idFicha = (await api('POST', '/fichas', fichaPayload())).idFicha;
  } else if (step.key === 'cierre') {
    await api('POST', `/fichas/${ui.idFicha}/completar`);
    return 'end-completa';
  } else if (PAYLOADS[step.key]) {
    await api('PUT', `/fichas/${ui.idFicha}/${step.key}`, PAYLOADS[step.key]());
  }
  return 'next';
}

async function next() {
  const step = currentStep();
  ui.errors = step.validate();
  ui.banner = [];
  if (Object.keys(ui.errors).length) {
    ui.banner = ['Revisa los campos marcados antes de continuar.'];
    render();
    document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  ui.saving = true;
  render();
  try {
    const outcome = await save(step);
    ui.saving = false;
    if (outcome === 'end-sin-autorizacion') {
      storage.del(DRAFT_KEY);
      ui.result = { sinAutorizacion: true };
      ui.view = 'end';
      render({ keepScroll: false });
    } else if (outcome === 'end-completa') {
      const ficha = await api('GET', `/fichas/${ui.idFicha}`).catch(() => ({ idFicha: ui.idFicha }));
      storage.del(DRAFT_KEY);
      ui.result = { ficha };
      ui.view = 'end';
      render({ keepScroll: false });
    } else {
      const steps = visibleSteps();
      flash('Guardado');
      goTo(steps[steps.findIndex(s => s.key === step.key) + 1].key, 'fwd');
    }
  } catch (error) {
    ui.saving = false;
    ui.banner = error instanceof ApiError ? error.messages : ['Ocurrió un error inesperado.'];
    if (error.status === 409) ui.banner.push('Esta ficha ya no está en borrador. Empieza una ficha nueva desde el inicio.');
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function flash(message) {
  const el = document.createElement('div');
  el.className = 'toast-ui';
  el.innerHTML = `<i class="bi bi-check-circle-fill"></i> ${esc(message)}`;
  document.body.append(el);
  setTimeout(() => el.remove(), 1600);
}

async function startNew() {
  if (ui.catalogsState !== 'ok') await loadCatalogs();
  if (ui.catalogsState !== 'ok') return;
  storage.del(DRAFT_KEY);
  Object.assign(ui, { view: 'wizard', stepKey: 'consentimiento', idFicha: null, data: blankData(), errors: {}, banner: [], anim: 'fwd' });
  render({ keepScroll: false });
}

async function resume() {
  if (ui.catalogsState !== 'ok') await loadCatalogs();
  const draft = storage.get(DRAFT_KEY);
  if (ui.catalogsState !== 'ok' || !draft) return;
  Object.assign(ui, { view: 'wizard', stepKey: draft.stepKey, idFicha: draft.idFicha, data: { ...blankData(), ...draft.data }, errors: {}, banner: [], anim: 'fwd' });
  render({ keepScroll: false });
}

// ---------- eventos (delegados, se registran una sola vez) ----------
function toggleMulti(group, code) {
  if (group === 'necesidades') {
    const needs = ui.data.necesidades;
    if (code in needs) {
      delete needs[code];
      ui.data.prioridades = ui.data.prioridades.map(p => (p === code ? '' : p));
    } else {
      needs[code] = code === 'otro_condicion_especial' ? { detalle: '' } : {};
    }
    return;
  }
  const bag = ui.data[group];
  const exclusive = group === 'visitantes' ? 'nadie' : 'ninguna';
  if (code === exclusive) {
    const was = Boolean(bag[exclusive]);
    Object.keys(bag).forEach(k => delete bag[k]);
    if (!was) bag[exclusive] = true;
  } else {
    delete bag[exclusive];
    if (bag[code]) delete bag[code]; else bag[code] = true;
  }
}

app.addEventListener('click', event => {
  const t = event.target.closest('button');
  if (!t || t.disabled) return;
  const { act, choice: path, toggle, stepper: stepPath } = t.dataset;
  if (path) {
    const value = JSON.parse(t.dataset.value);
    setVal(path, val(path) === value && t.dataset.clear === '1' ? (typeof value === 'boolean' ? null : '') : value);
    delete ui.errors[path];
    persist(); render(); return;
  }
  if (toggle) { const [group, code] = toggle.split(':'); toggleMulti(group, code); delete ui.errors[group]; persist(); render(); return; }
  if (stepPath) {
    const current = val(stepPath);
    const { delta, min, max } = Object.fromEntries(['delta', 'min', 'max'].map(k => [k, Number(t.dataset[k])]));
    const empty = current === '' || current === undefined;
    const nextValue = empty ? (min === 0 ? Math.max(0, Math.min(max, delta)) : min) : Math.min(max, Math.max(min, Number(current) + delta));
    setVal(stepPath, nextValue);
    delete ui.errors[stepPath];
    persist(); render(); return;
  }
  const actions = {
    start: startNew, resume, next, back: () => (ui.view === 'wizard' ? previous() : null),
    home: () => { ui.view = 'home'; render({ keepScroll: false }); },
    consulta: openConsulta,
    'open-ficha': () => openFicha(t.dataset.id),
    'retry-catalogs': loadCatalogs,
    dismiss: () => { ui.banner = []; render(); },
    'add-menor': () => { ui.data.menores.push(''); persist(); render(); },
    'del-menor': () => { ui.data.menores.splice(Number(t.dataset.index), 1); ui.errors = {}; persist(); render(); }
  };
  actions[act]?.();
});

app.addEventListener('input', event => {
  const el = event.target;
  if (el.dataset.filter !== undefined) {
    ui.consulta.q = el.value;
    document.querySelector('#lista').innerHTML = listHtml();
    return;
  }
  if (!el.dataset.path) return;
  setVal(el.dataset.path, el.value);
  delete ui.errors[el.dataset.path];
  el.closest('.field, .menor-row')?.classList.remove('has-error');
  persist();
});

app.addEventListener('change', event => {
  const el = event.target;
  if (el.dataset.prio === undefined) return;
  const slots = ui.data.prioridades;
  slots[Number(el.dataset.prio)] = el.value;
  slots.forEach((code, i) => { if (code && code === el.value && i !== Number(el.dataset.prio)) slots[i] = ''; });
  persist(); render();
});

render();
loadCatalogs();
