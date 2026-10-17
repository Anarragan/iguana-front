import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.css';
import { api, ApiError } from './api.js';

const DRAFT_KEY = 'iguana.borrador.v3';
const VOL_KEY = 'iguana.aplicadaPor';
const CONSENTIMIENTO_VERSION = 'v1';

// ---------- utilidades ----------
const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* sin almacenamiento */ } }
};
const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const isBlank = v => v === null || v === undefined || String(v).trim() === '';
const toInt = v => (/^\d+$/.test(String(v).trim()) ? Number(v) : NaN);
const text = v => String(v).trim();
const PHONE_RE = /^[0-9+()\-\s]{7,30}$/;

const blankData = () => ({
  aplicadaPor: storage.get(VOL_KEY) || '', autorizaTratamiento: null, autorizaSeguimiento: null, sector: '',
  direccion: '', interior: '', callejon: '', nombreReferencia: '', telefonoContacto: '', observaciones: '',
  respEsJefe: null, respParentesco: '', respGenero: '', respEdad: '',
  numPersonas: '', ninosEdades: [], conteos: {},
  escolarEstado: '', escolarDias: '', escolarManejo: '', escolarManejoOtro: '',
  materialParedes: '', nivelAgua: '', inundadaAntes: '',
  medioAlerta: '', medioAlertaOtro: '', pernocta: '', ingresos: '', ingresosOtro: '',
  electricaDanada: null, lodo: '', acceso: '', viviendaVista: null, danos: {},
  items: {}, urgentes: ['', '', ''], detalleOtro: '', apoyoEmocional: null, numMascotas: 0,
  visitas: {}, visitasOtro: '', censoPrevio: '', censoQuien: '', dictamen: '', inscritaRud: '',
  ofertaRecibida: null, ofertaAceptada: null, ayudas: {}, ayudasOtra: ''
});

const blankAvance = () => ({ loading: false, error: '', items: null, estado: '', mios: false, detail: null });

const ui = {
  view: 'home', stepKey: 'consentimiento', ref: null, codigo: null, data: blankData(), errors: {}, banner: [],
  saving: false, catalogs: null, catalogsState: 'loading', anim: null, avance: null, avanceError: '', result: null, lista: blankAvance()
};

const app = document.querySelector('#app');
const val = path => path.split('.').reduce((o, k) => o?.[k], ui.data);
function setVal(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), ui.data)[last] = value;
}
const persist = () => { if (ui.view === 'wizard') storage.set(DRAFT_KEY, { ref: ui.ref, codigo: ui.codigo, data: ui.data, stepKey: ui.stepKey }); };

// ---------- catálogos (toda opción sale de GET /catalogos) ----------
const options = name => (ui.catalogs?.[name] || []).map(o => ({ v: o.codigo, l: o.etiqueta }));
const labelOf = (name, code) => ui.catalogs?.[name]?.find(o => o.codigo === code)?.etiqueta ?? code;
const FALLBACK_SCALE = ['Sin daño', 'Leve', 'Moderado', 'Severo', 'Pérdida total'];
const escala = () => {
  const raw = ui.catalogs?.escalaDano;
  const list = Array.isArray(raw) && raw.length ? raw.map((e, i) => ({ v: Number(e.nivel ?? e.valor ?? e.codigo ?? i), l: e.etiqueta ?? FALLBACK_SCALE[i] })) : [];
  return list.length && list.every(e => Number.isInteger(e.v)) ? list : FALLBACK_SCALE.map((l, v) => ({ v, l }));
};

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

function choice(label, path, opts, { required = true, layout = 'chips', disabled = false, hint = '' } = {}) {
  const current = val(path);
  const buttons = opts.map(o => `<button type="button" class="opt ${current === o.v ? 'on' : ''}" data-choice="${path}" data-value="${esc(JSON.stringify(o.v))}" data-clear="${required ? 0 : 1}" aria-pressed="${current === o.v}" ${disabled ? 'disabled' : ''}>${esc(o.l)}</button>`).join('');
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
const summaryRow = (icon, title, textValue) => `<div class="summary-row"><i class="bi ${icon}"></i><span><strong>${esc(title)}</strong><small>${esc(textValue)}</small></span></div>`;

// ---------- pantallas ----------
// Cada grupo se envía en una sola petición (PUT del paso completo) al terminar su última pantalla visible.
const hasNinos = d => d.ninosEdades.length > 0;
const SCREENS = [
  { key: 'consentimiento', title: 'Consentimiento', group: 'hogar', render: consentimientoScreen, validate: validateConsentimiento },
  { key: 'contacto', title: 'Datos de contacto', group: 'contacto', render: contactoScreen, validate: validateContacto },
  { key: 'respondente', title: 'Quien responde', group: 'composicion', render: respondenteScreen, validate: validateRespondente },
  { key: 'integrantes', title: 'Integrantes', group: 'composicion', render: integrantesScreen, validate: validateIntegrantes },
  { key: 'escolaridad', title: 'Escolaridad', group: 'composicion', show: hasNinos, render: escolaridadScreen, validate: validateEscolaridad },
  { key: 'vivienda', title: 'Vivienda', group: 'vivienda', render: viviendaScreen, validate: validateVivienda },
  { key: 'situacion', title: 'Situación actual', group: 'vivienda', render: situacionScreen, validate: validateSituacion },
  { key: 'danos', title: 'Daños', group: 'vivienda', render: danosScreen, validate: validateDanos },
  { key: 'necesidades', title: 'Necesidades', group: 'necesidades', render: necesidadesScreen, validate: validateNecesidades },
  { key: 'visitas', title: 'Visitas recibidas', group: 'atencion', render: visitasScreen, validate: validateVisitas },
  { key: 'atencion', title: 'Atención recibida', group: 'atencion', render: atencionScreen, validate: validateAtencion },
  { key: 'cierre', title: 'Cierre', group: 'cierre', render: cierreScreen, validate: () => ({}) }
];
const visibleScreens = () => SCREENS.filter(s => !s.show || s.show(ui.data));
const currentScreen = () => SCREENS.find(s => s.key === ui.stepKey) || SCREENS[0];
const locked = () => Boolean(ui.ref);

function consentimientoScreen() {
  const d = ui.data;
  return card('Antes de empezar', 'bi-shield-check',
    '<div class="info-box"><i class="bi bi-info-circle"></i>Lee en voz alta: <em>«Con su autorización registraremos los datos de su hogar para apoyar la atención de las familias afectadas.»</em></div>' +
    field('Persona que aplica la ficha', 'aplicadaPor', { required: true, max: 100, placeholder: 'Tu nombre', disabled: locked(), hint: 'Se recordará en este dispositivo.' }) +
    field('Sector o zona', 'sector', { max: 80, placeholder: 'Ej. Zona alta', disabled: locked() }) +
    yesNo('¿Autoriza el tratamiento de sus datos?', 'autorizaTratamiento', { disabled: locked() }) +
    (d.autorizaTratamiento === true ? yesNo('¿Autoriza que le contactemos para seguimiento?', 'autorizaSeguimiento', { disabled: locked() }) : '') +
    (d.autorizaTratamiento === false ? '<div class="info-box warn"><i class="bi bi-slash-circle"></i>Sin autorización no se registran datos del hogar. La ficha terminará aquí.</div>' : ''));
}

function contactoScreen() {
  return (locked() ? '<div class="info-box"><i class="bi bi-pencil"></i>El hogar ya está registrado. Puedes corregir errores de digitación; los datos se reemplazan al pulsar «Siguiente».</div>' : '') +
    card('Ubicación', 'bi-geo-alt-fill',
      field('Dirección', 'direccion', { required: true, max: 200, placeholder: 'Ej. Cra 80 # 50-10' }) +
      '<div class="row-2">' + field('Interior', 'interior', { max: 30 }) + field('Callejón', 'callejon', { max: 100 }) + '</div>') +
    card('Contacto', 'bi-person-lines-fill',
      field('Nombre de referencia', 'nombreReferencia', { required: true, max: 150, placeholder: 'Ej. María Gómez' }) +
      field('Teléfono de contacto', 'telefonoContacto', { type: 'tel', inputmode: 'tel', max: 30, placeholder: 'Ej. 3001234567' }) +
      field('Observaciones', 'observaciones', { area: true, max: 500, placeholder: 'Información adicional' }));
}

function respondenteScreen() {
  return card('Persona que responde', 'bi-person-fill',
    yesNo('¿Es la persona jefe de hogar?', 'respEsJefe') +
    (ui.data.respEsJefe === false ? field('Parentesco con el jefe de hogar', 'respParentesco', { required: true, max: 50, placeholder: 'Ej. Hija' }) : '') +
    choice('Género', 'respGenero', options('generos'), { required: false }) +
    field('Edad', 'respEdad', { type: 'number', inputmode: 'numeric', min: 0, maxValue: 120, placeholder: 'Años' }));
}

function integrantesScreen() {
  const d = ui.data;
  const n = toInt(d.numPersonas);
  const maxCount = Number.isNaN(n) ? 0 : n;
  const edades = d.ninosEdades.map((age, i) => `<div class="menor-row ${ui.errors[`ninosEdades.${i}`] ? 'has-error' : ''}"><span class="number">${i + 1}</span>
      <input class="form-control" type="number" inputmode="numeric" min="0" max="17" placeholder="Edad (0–17)" data-path="ninosEdades.${i}" value="${esc(age)}" aria-label="Edad del niño o niña ${i + 1}">
      <button type="button" class="icon-btn" data-act="del-nino" data-index="${i}" aria-label="Quitar"><i class="bi bi-x-lg"></i></button></div>${errorOf(`ninosEdades.${i}`)}`).join('');
  const grupos = (ui.catalogs.gruposIntegrantes || []).map(g => stepper(esc(g.etiqueta), `conteos.${g.campo}`, { min: 0, max: maxCount })).join('');
  return card('Personas del hogar', 'bi-people-fill',
    stepper('Número de personas que viven en el hogar', 'numPersonas', { min: 1, max: 40, required: true }) +
    `<div class="field ${ui.errors.ninosEdades ? 'has-error' : ''}"><div class="label">Niños y niñas (menores de 18)${requiredMark(false)}</div>
      <div class="hint mb-2">Escribe la edad de cada uno. Total: <strong>${d.ninosEdades.length}</strong></div>${edades}
      <button type="button" class="btn btn-outline-primary btn-sm mt-1" data-act="add-nino"><i class="bi bi-plus-lg"></i> Agregar niño o niña</button>${errorOf('ninosEdades')}</div>`) +
    card('Grupos de integrantes', 'bi-diagram-3-fill', grupos, 'Deja en 0 los grupos que no aplican. Ninguno puede superar el número de personas.');
}

function escolaridadScreen() {
  const d = ui.data;
  return card('Escolaridad de niños y niñas', 'bi-backpack2-fill',
    choice('¿Cómo están asistiendo al estudio?', 'escolarEstado', options('escolarEstado'), { layout: 'list' }) +
    (d.escolarEstado === 'dejaron_de_asistir' ? stepper('Días sin asistir', 'escolarDias', { min: 0, max: 365, required: true }) : '') +
    choice('¿Cómo manejan los estudios ahora?', 'escolarManejo', options('escolarManejo'), { layout: 'list' }) +
    (d.escolarManejo === 'otro' ? field('¿Cuál?', 'escolarManejoOtro', { required: true, max: 200 }) : ''));
}

function viviendaScreen() {
  return card('La vivienda', 'bi-house-door-fill',
    choice('Material de las paredes', 'materialParedes', options('materialParedes'), { layout: 'list' }) +
    choice('Nivel máximo que alcanzó el agua', 'nivelAgua', options('nivelAgua')) +
    choice('¿La vivienda se había inundado antes?', 'inundadaAntes', options('triestado'), { layout: 'seg' }));
}

function situacionScreen() {
  const d = ui.data;
  return card('Durante la emergencia', 'bi-bell-fill',
    choice('¿Cómo se enteró de la emergencia?', 'medioAlerta', options('medioAlerta'), { required: false }) +
    (d.medioAlerta === 'otro' ? field('¿Cuál?', 'medioAlertaOtro', { required: true, max: 200 }) : '')) +
    card('Hoy', 'bi-compass-fill',
      choice('¿Dónde duerme el hogar estos días?', 'pernocta', options('pernocta'), { layout: 'list', hint: 'Elige el lugar donde pasan las noches desde la emergencia.' }) +
      choice('Ingresos del hogar', 'ingresos', options('ingresos'), { required: false }) +
      (d.ingresos === 'otro' ? field('¿Cuál?', 'ingresosOtro', { required: true, max: 200 }) : '')) +
    card('Estado de la vivienda', 'bi-house-gear-fill',
      yesNo('¿La instalación eléctrica quedó dañada?', 'electricaDanada') +
      choice('¿Cuánto lodo hay en la vivienda?', 'lodo', options('lodo'), { layout: 'seg' }) +
      choice('Acceso a la vivienda', 'acceso', options('acceso'), { layout: 'seg' }) +
      yesNo('¿Ha podido ver su vivienda después de la emergencia?', 'viviendaVista', { required: false }));
}

const danoTotal = () => Object.values(ui.data.danos).reduce((sum, v) => sum + (Number.isInteger(v) ? v : 0), 0);

function danosScreen() {
  const scale = escala();
  const cats = ui.catalogs.categoriasDano || [];
  const rows = cats.map(c => {
    const current = ui.data.danos[c.campo];
    return `<div class="dano-row ${ui.errors[`danos.${c.campo}`] ? 'has-error' : ''}"><div class="dano-name">${esc(c.etiqueta)}</div>
      <div class="scale" role="group" aria-label="${esc(c.etiqueta)}">${scale.map(n => `<button type="button" class="scale-btn lv${n.v} ${current === n.v ? 'on' : ''}" data-choice="danos.${c.campo}" data-value="${n.v}" data-clear="0" aria-pressed="${current === n.v}"><b>${n.v}</b><span>${esc(n.l)}</span></button>`).join('')}</div>${errorOf(`danos.${c.campo}`)}</div>`;
  }).join('');
  const top = Math.max(...scale.map(n => n.v));
  return card('Nivel de daño por categoría', 'bi-exclamation-triangle-fill', rows, 'Responde todas. «Sin daño» también es una respuesta.') +
    `<div class="total-pill"><span>Total de daño</span><strong>${danoTotal()}</strong><small>de ${cats.length * top}</small></div>`;
}

const itemLabel = code => (ui.catalogs.gruposNecesidad || []).flatMap(g => g.items).find(i => i.codigo === code)?.etiqueta ?? code;

function necesidadesScreen() {
  const d = ui.data;
  const groups = (ui.catalogs.gruposNecesidad || []).map(g => `<div class="need-group"><div class="need-title">${esc(g.etiqueta)}</div><div class="opts opts-chips">${g.items.map(i => {
    const on = Boolean(d.items[i.codigo]);
    return `<button type="button" class="opt ${on ? 'on' : ''}" data-toggle="items:${i.codigo}" aria-pressed="${on}">${esc(i.etiqueta)}</button>`;
  }).join('')}</div></div>`).join('');
  const selected = Object.keys(d.items).filter(k => d.items[k]);
  const otro = d.items.otro_condicion_especial ? field('Describe la condición especial', 'detalleOtro', { required: true, max: 300, placeholder: 'Ej. Pañales para adulto mayor' }) : '';
  const prios = selected.length
    ? `<div class="prio">${[0, 1, 2].map(i => `<div class="prio-row"><span class="number">${i + 1}</span><select class="form-select" data-prio="${i}" aria-label="Prioridad ${i + 1}"><option value="">${i === 0 ? 'Lo más urgente…' : 'Elegir…'}</option>${selected.filter(code => d.urgentes[i] === code || !d.urgentes.includes(code)).map(code => `<option value="${code}" ${d.urgentes[i] === code ? 'selected' : ''}>${esc(itemLabel(code))}</option>`).join('')}</select></div>`).join('')}</div>`
    : '<p class="card-note mb-0">Marca primero las necesidades para poder priorizarlas.</p>';
  return card('¿Qué necesita el hogar?', 'bi-heart-fill', groups + otro, 'Marca solo lo que necesitan. Puedes dejarlo vacío.') +
    card('Las 3 más urgentes', 'bi-sort-numeric-down', prios, 'Opcional. No se pueden repetir.') +
    card('Otros apoyos', 'bi-chat-heart-fill', yesNo('¿Necesita apoyo emocional?', 'apoyoEmocional', { required: false }) + stepper('Mascotas en el hogar', 'numMascotas', { min: 0, max: 30 }));
}

function multiChips(group, name, exclusive, errorKey) {
  const bag = ui.data[group];
  const chips = options(name).map(o => {
    const on = Boolean(bag[o.v]);
    const off = o.v !== exclusive && bag[exclusive];
    return `<button type="button" class="opt ${on ? 'on' : ''}" data-toggle="${group}:${o.v}" aria-pressed="${on}" ${off ? 'disabled' : ''}>${esc(o.l)}</button>`;
  }).join('');
  return `<div class="field ${ui.errors[errorKey] ? 'has-error' : ''}"><div class="opts opts-chips">${chips}</div>${errorOf(errorKey)}</div>`;
}

function visitasScreen() {
  return card('¿Quién ha visitado el hogar?', 'bi-signpost-split-fill',
    multiChips('visitas', 'visitas', 'nadie', 'visitas') +
    (ui.data.visitas.otro ? field('¿Quién más?', 'visitasOtro', { required: true, max: 200, placeholder: 'Ej. Parroquia' }) : ''),
    'Puedes marcar varias. «Nadie» desmarca las demás.');
}

function atencionScreen() {
  const d = ui.data;
  return card('Censo y evaluación', 'bi-clipboard2-check-fill',
    choice('¿Ya los habían censado antes?', 'censoPrevio', options('triestado'), { layout: 'seg' }) +
    (d.censoPrevio === 'si' ? field('¿Quién los censó?', 'censoQuien', { max: 150, placeholder: 'Ej. Alcaldía' }) : '') +
    choice('Dictamen de la vivienda', 'dictamen', options('dictamen'), { layout: 'list' }) +
    choice('¿Está inscrita en el RUD?', 'inscritaRud', options('triestado'), { layout: 'seg' })) +
    card('Ayudas', 'bi-box2-heart-fill',
      yesNo('¿Han recibido alguna oferta de atención?', 'ofertaRecibida') +
      (d.ofertaRecibida === true ? yesNo('¿La aceptaron?', 'ofertaAceptada') : '') +
      `<div class="label">Ayudas que dicen haber recibido${requiredMark(true)}</div>` + multiChips('ayudas', 'ayudasRecibidas', 'ninguna', 'ayudas') +
      (d.ayudas.otra ? field('¿Cuál otra?', 'ayudasOtra', { required: true, max: 200 }) : ''));
}

const ALERTAS = [
  ['duermeEnRiesgo', 'bi-moon-stars-fill', 'Duerme en un lugar de riesgo'],
  ['urgenteSalud', 'bi-heart-pulse-fill', 'Urgencia de salud'],
  ['urgenteAguaAlimento', 'bi-droplet-half', 'Urgencia de agua o alimento'],
  ['electricaRiesgo', 'bi-lightning-charge-fill', 'Riesgo eléctrico']
];
function alertsHtml(avance) {
  if (!avance?.alertas) return '';
  const partial = avance.estado === 'borrador' ? '<p class="card-note">Son parciales hasta tener todas las respuestas.</p>' : '';
  return `<section class="card-ui alerts"><h2><i class="bi bi-bell-fill"></i>Seguimiento urgente</h2>${partial}
    ${ALERTAS.map(([key, icon, label]) => `<div class="alert-row ${avance.alertas[key] ? 'on' : ''}"><i class="bi ${icon}"></i><span>${label}</span><b>${avance.alertas[key] ? 'Sí' : 'No'}</b></div>`).join('')}
    <div class="follow ${avance.requiereSeguimiento ? 'on' : ''}"><i class="bi bi-${avance.requiereSeguimiento ? 'exclamation-octagon-fill' : 'check-circle-fill'}"></i>${avance.requiereSeguimiento ? 'Requiere seguimiento' : 'No requiere seguimiento por ahora'}</div></section>`;
}

const PASOS = { contacto: 'Contacto', composicion: 'Composición', vivienda: 'Vivienda y daños', necesidades: 'Necesidades', atencion: 'Atención' };
const pasosHtml = pasos => `<div class="pasos">${Object.entries(PASOS).map(([k, l]) => `<span class="paso ${pasos?.[k] ? 'ok' : ''}"><i class="bi bi-${pasos?.[k] ? 'check-circle-fill' : 'circle'}"></i>${l}</span>`).join('')}</div>`;
const resumenRows = r => (r ? summaryRow('bi-people-fill', 'Personas', r.numPersonas) + summaryRow('bi-balloon-heart-fill', 'Niños y niñas', r.ninos) + summaryRow('bi-person-heart', 'Adultos mayores', r.adultosMayores) + summaryRow('bi-exclamation-triangle-fill', 'Total de daño', r.totalDano) : '');
const faltantesHtml = a => (a.faltantes?.length
  ? `<div class="alert alert-warning"><strong>Falta por responder:</strong><ul>${a.faltantes.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>`
  : '<div class="info-box"><i class="bi bi-check-circle"></i>Todo listo para completar la ficha.</div>');

function cierreScreen() {
  const a = ui.avance;
  if (!a || !a.pasos) {
    return card('Revisando la ficha…', 'bi-flag-fill', ui.avanceError
      ? `<div class="alert alert-warning">${esc(ui.avanceError)} <button class="btn btn-link p-0 align-baseline" data-act="refresh-avance">Reintentar</button></div>`
      : '<div class="text-center py-3"><span class="spinner-border text-primary"></span></div>');
  }
  return card('Resumen de la ficha', 'bi-flag-fill', faltantesHtml(a) + pasosHtml(a.pasos) + resumenRows(a.resumen), 'Al completar, la ficha se cierra y ya no se puede editar.') + alertsHtml(a);
}

// ---------- validación ----------
const needed = (errors, path, value, msg = 'Este dato es obligatorio.') => { if (isBlank(value)) errors[path] = msg; };
const picked = (errors, path, value, msg = 'Elige una opción.') => { if (value === null || value === undefined || value === '') errors[path] = msg; };

function validateConsentimiento() {
  const d = ui.data; const e = {};
  needed(e, 'aplicadaPor', d.aplicadaPor);
  picked(e, 'autorizaTratamiento', d.autorizaTratamiento);
  if (d.autorizaTratamiento === true) picked(e, 'autorizaSeguimiento', d.autorizaSeguimiento);
  return e;
}
function validateContacto() {
  const d = ui.data; const e = {};
  needed(e, 'direccion', d.direccion);
  needed(e, 'nombreReferencia', d.nombreReferencia);
  if (!isBlank(d.telefonoContacto) && !PHONE_RE.test(text(d.telefonoContacto))) e.telefonoContacto = 'Usa entre 7 y 30 caracteres: dígitos, + ( ) - y espacios.';
  return e;
}
function validateRespondente() {
  const d = ui.data; const e = {};
  picked(e, 'respEsJefe', d.respEsJefe);
  if (d.respEsJefe === false) needed(e, 'respParentesco', d.respParentesco, 'Indica el parentesco.');
  if (!isBlank(d.respEdad) && !(toInt(d.respEdad) <= 120)) e.respEdad = 'Edad entre 0 y 120.';
  return e;
}
function validateIntegrantes() {
  const d = ui.data; const e = {};
  const n = toInt(d.numPersonas);
  if (!(n >= 1)) e.numPersonas = 'Indica cuántas personas viven en el hogar (mínimo 1).';
  d.ninosEdades.forEach((age, i) => { if (!(toInt(age) <= 17)) e[`ninosEdades.${i}`] = 'Edad entre 0 y 17.'; });
  if (n >= 1) {
    const mayores = d.conteos.adultosMayores || 0;
    if (d.ninosEdades.length + mayores > n) e.ninosEdades = `Niños (${d.ninosEdades.length}) más adultos mayores (${mayores}) superan las ${n} personas del hogar.`;
    Object.entries(d.conteos).forEach(([campo, qty]) => { if (qty > n) e[`conteos.${campo}`] = `No puede superar ${n}.`; });
  }
  return e;
}
function validateEscolaridad() {
  const d = ui.data; const e = {};
  picked(e, 'escolarEstado', d.escolarEstado);
  if (d.escolarEstado === 'dejaron_de_asistir' && isBlank(d.escolarDias)) e.escolarDias = 'Indica los días.';
  picked(e, 'escolarManejo', d.escolarManejo);
  if (d.escolarManejo === 'otro') needed(e, 'escolarManejoOtro', d.escolarManejoOtro, 'Describe cuál.');
  return e;
}
function validateVivienda() {
  const d = ui.data; const e = {};
  picked(e, 'materialParedes', d.materialParedes);
  picked(e, 'nivelAgua', d.nivelAgua);
  picked(e, 'inundadaAntes', d.inundadaAntes);
  return e;
}
function validateSituacion() {
  const d = ui.data; const e = {};
  picked(e, 'pernocta', d.pernocta);
  picked(e, 'electricaDanada', d.electricaDanada);
  picked(e, 'lodo', d.lodo);
  picked(e, 'acceso', d.acceso);
  if (d.medioAlerta === 'otro') needed(e, 'medioAlertaOtro', d.medioAlertaOtro, 'Describe cuál.');
  if (d.ingresos === 'otro') needed(e, 'ingresosOtro', d.ingresosOtro, 'Describe cuál.');
  return e;
}
function validateDanos() {
  const e = {};
  (ui.catalogs.categoriasDano || []).forEach(c => { if (!Number.isInteger(ui.data.danos[c.campo])) e[`danos.${c.campo}`] = 'Elige un nivel.'; });
  return e;
}
function validateNecesidades() {
  const e = {};
  if (ui.data.items.otro_condicion_especial) needed(e, 'detalleOtro', ui.data.detalleOtro, 'Describe la condición.');
  return e;
}
function validateVisitas() {
  const d = ui.data; const e = {};
  if (!Object.values(d.visitas).some(Boolean)) e.visitas = 'Marca al menos una opción (o «Nadie»).';
  if (d.visitas.otro) needed(e, 'visitasOtro', d.visitasOtro, 'Indica quién.');
  return e;
}
function validateAtencion() {
  const d = ui.data; const e = {};
  picked(e, 'censoPrevio', d.censoPrevio);
  picked(e, 'dictamen', d.dictamen);
  picked(e, 'inscritaRud', d.inscritaRud);
  picked(e, 'ofertaRecibida', d.ofertaRecibida);
  if (d.ofertaRecibida === true) picked(e, 'ofertaAceptada', d.ofertaAceptada);
  if (!Object.values(d.ayudas).some(Boolean)) e.ayudas = 'Marca las ayudas recibidas o «Ninguna».';
  if (d.ayudas.otra) needed(e, 'ayudasOtra', d.ayudasOtra, 'Describe cuál.');
  return e;
}

// ---------- payloads: solo se envía lo visible (contrato §5.2) ----------
const optional = (obj, key, value) => { if (!isBlank(value)) obj[key] = typeof value === 'string' ? text(value) : value; };
const checked = bag => Object.keys(bag).filter(k => bag[k]);

function contactFields(d) {
  const body = { direccion: text(d.direccion), nombreReferencia: text(d.nombreReferencia) };
  optional(body, 'interior', d.interior); optional(body, 'callejon', d.callejon);
  optional(body, 'telefonoContacto', d.telefonoContacto); optional(body, 'observaciones', d.observaciones);
  return body;
}

function hogarPayload() {
  const d = ui.data;
  const body = { aplicadaPor: text(d.aplicadaPor), autorizaTratamiento: d.autorizaTratamiento, versionConsentimiento: CONSENTIMIENTO_VERSION };
  optional(body, 'sector', d.sector);
  if (d.autorizaTratamiento !== true) return body;
  return { ...body, autorizaSeguimiento: d.autorizaSeguimiento, ...contactFields(d) };
}

const PAYLOADS = {
  composicion() {
    const d = ui.data;
    const body = { respEsJefe: d.respEsJefe, numPersonas: toInt(d.numPersonas), ninosEdades: d.ninosEdades.map(toInt) };
    if (d.respEsJefe === false) body.respParentesco = text(d.respParentesco);
    optional(body, 'respGenero', d.respGenero);
    if (!isBlank(d.respEdad)) body.respEdad = toInt(d.respEdad);
    (ui.catalogs.gruposIntegrantes || []).forEach(g => { body[g.campo] = d.conteos[g.campo] || 0; });
    if (hasNinos(d)) {
      body.escolarEstado = d.escolarEstado;
      if (d.escolarEstado === 'dejaron_de_asistir') body.escolarDias = toInt(d.escolarDias);
      body.escolarManejo = d.escolarManejo;
      if (d.escolarManejo === 'otro') body.escolarManejoOtro = text(d.escolarManejoOtro);
    }
    return body;
  },
  vivienda() {
    const d = ui.data;
    const body = { materialParedes: d.materialParedes, nivelAgua: d.nivelAgua, inundadaAntes: d.inundadaAntes, pernocta: d.pernocta, electricaDanada: d.electricaDanada, lodo: d.lodo, acceso: d.acceso };
    optional(body, 'medioAlerta', d.medioAlerta); optional(body, 'ingresos', d.ingresos);
    if (d.medioAlerta === 'otro') body.medioAlertaOtro = text(d.medioAlertaOtro);
    if (d.ingresos === 'otro') body.ingresosOtro = text(d.ingresosOtro);
    if (d.viviendaVista !== null) body.viviendaVista = d.viviendaVista;
    (ui.catalogs.categoriasDano || []).forEach(c => { body[c.campo] = d.danos[c.campo]; });
    return body;
  },
  necesidades() {
    const d = ui.data;
    const items = checked(d.items);
    const body = { items, urgentes: d.urgentes.filter(code => code && items.includes(code)), numMascotas: Number(d.numMascotas) || 0 };
    if (items.includes('otro_condicion_especial')) body.detalleOtro = text(d.detalleOtro);
    if (d.apoyoEmocional !== null) body.apoyoEmocional = d.apoyoEmocional;
    return body;
  },
  atencion() {
    const d = ui.data;
    const body = { visitas: d.visitas.nadie ? ['nadie'] : checked(d.visitas), censoPrevio: d.censoPrevio, dictamen: d.dictamen, inscritaRud: d.inscritaRud, ofertaRecibida: d.ofertaRecibida, ayudasRecibidas: d.ayudas.ninguna ? ['ninguna'] : checked(d.ayudas) };
    if (d.visitas.otro && !d.visitas.nadie) body.visitasOtro = text(d.visitasOtro);
    if (d.censoPrevio === 'si') optional(body, 'censoQuien', d.censoQuien);
    if (d.ofertaRecibida) body.ofertaAceptada = d.ofertaAceptada;
    if (d.ayudas.otra && !d.ayudas.ninguna) body.ayudasOtra = text(d.ayudasOtra);
    return body;
  }
};

// ---------- vistas ----------
function render({ keepScroll = true } = {}) {
  const scroll = window.scrollY;
  const views = { home: homeView, wizard: wizardView, end: endView, lista: listaView, detail: detailView };
  app.innerHTML = views[ui.view]();
  window.scrollTo(0, keepScroll ? scroll : 0);
  ui.anim = null;
}

function homeView() {
  const draft = storage.get(DRAFT_KEY);
  const status = ui.catalogsState === 'error'
    ? `<div class="alert alert-warning text-start"><i class="bi bi-wifi-off"></i> ${esc(ui.catalogsError || 'No se pudo cargar el formulario desde el servidor.')} <button class="btn btn-link p-0 align-baseline" data-act="retry-catalogs">Reintentar</button></div>`
    : ui.catalogsState === 'loading' ? '<p class="loading-line"><span class="spinner-border spinner-border-sm"></span> Conectando con el servidor…</p>' : '';
  return `<main class="welcome-page fade-in">
    <div class="welcome-mark"><i class="bi bi-house-heart-fill"></i></div>
    <p class="eyebrow">LA IGUANÁ · MEDELLÍN</p>
    <h1>Caracterización<br>de hogares</h1>
    <p class="lead">Una ficha por hogar, paso a paso. Tus respuestas se guardan mientras avanzas.</p>
    ${status}
    ${draft ? `<button class="btn btn-primary btn-lg w-100 mb-2" data-act="resume"><i class="bi bi-play-fill"></i> Continuar ficha en borrador${draft.codigo ? ` (${esc(draft.codigo)})` : ''}</button>
      <button class="btn btn-outline-primary w-100" data-act="start">Empezar una ficha nueva</button>
      <button class="btn btn-link text-danger mt-1" data-act="discard"><i class="bi bi-trash"></i> Descartar borrador</button>`
      : '<button class="btn btn-primary btn-lg w-100" data-act="start">Comenzar <i class="bi bi-arrow-right"></i></button>'}
    <button class="btn btn-link mt-2" data-act="lista"><i class="bi bi-bar-chart-steps"></i> Ver avance de hogares</button>
  </main>`;
}

function wizardView() {
  const screens = visibleScreens();
  const screen = currentScreen();
  const index = screens.findIndex(s => s.key === screen.key);
  const last = index === screens.length - 1;
  const endsHere = screen.key === 'consentimiento' && ui.data.autorizaTratamiento === false;
  const blocked = last && !ui.avance?.puedeCompletar;
  const banner = ui.banner.length ? `<div class="alert alert-danger alert-dismissible fade-in"><ul>${ui.banner.map(m => `<li>${esc(m)}</li>`).join('')}</ul><button class="btn-close" data-act="dismiss" aria-label="Cerrar"></button></div>` : '';
  const animClass = ui.anim === 'fwd' ? 'slide-fwd' : ui.anim === 'back' ? 'slide-back' : '';
  return `<div class="app-shell">
    <header class="topbar"><button class="icon-button" data-act="back" aria-label="Volver"><i class="bi bi-arrow-left"></i></button>
      <strong>${esc(screen.title)}</strong><span>${ui.codigo ? `${esc(ui.codigo)} · ` : ''}${index + 1}/${screens.length}</span></header>
    <div class="steps-bar" aria-hidden="true">${screens.map((_, i) => `<i class="${i < index ? 'done' : i === index ? 'now' : ''}"></i>`).join('')}</div>
    <main class="container form-container"><div class="step-body ${animClass}">${banner}${screen.render()}</div></main>
    <footer class="actions"><button class="btn btn-outline-primary" data-act="back" ${ui.saving ? 'disabled' : ''}><i class="bi bi-arrow-left"></i> Atrás</button>
      <button class="btn btn-primary" data-act="next" ${ui.saving || blocked ? 'disabled' : ''}>${ui.saving ? '<span class="spinner-border spinner-border-sm me-2"></span>Guardando…' : `${endsHere ? 'Finalizar' : last ? 'Completar ficha' : 'Siguiente'} <i class="bi bi-${last ? 'check2' : 'arrow-right'}"></i>`}</button></footer>
  </div>`;
}

function endView() {
  const r = ui.result;
  if (r.estado === 'sin_autorizacion') {
    return `<main class="success-page fade-in"><div class="success-icon muted"><i class="bi bi-slash-lg"></i></div><h1>Ficha cerrada</h1>
      <p>La persona no autorizó el tratamiento de sus datos, así que no se registró información del hogar.</p>
      <button class="btn btn-primary w-100" data-act="start"><i class="bi bi-plus-lg"></i> Nueva ficha</button><button class="btn btn-link mt-2" data-act="home">Volver al inicio</button></main>`;
  }
  return `<main class="success-page fade-in"><div class="success-icon"><i class="bi bi-check-lg"></i></div><h1>¡Ficha completada!</h1><p>Los datos se guardaron correctamente. Dile este código a la familia:</p>
    <div class="codes"><div class="solo"><small>Código del hogar</small><strong>${esc(r.codigo)}</strong></div></div>
    <section class="card-ui w-100 text-start"><h2><i class="bi bi-clipboard-data-fill"></i>Resumen</h2>${resumenRows(r.resumen)}</section>
    <div class="w-100 text-start">${alertsHtml(r)}</div>
    <button class="btn btn-primary w-100" data-act="start"><i class="bi bi-plus-lg"></i> Nueva ficha</button>
    <button class="btn btn-outline-primary w-100 mt-2" data-act="lista"><i class="bi bi-bar-chart-steps"></i> Ver avance de hogares</button></main>`;
}

// ---------- avance de hogares (la API no devuelve datos personales) ----------
const estadoBadge = estado => `<span class="badge-estado ${esc(estado)}">${esc(labelOf('estados', estado))}</span>`;
const fechaCorta = v => String(v ?? '').slice(0, 10);

function listaView() {
  const l = ui.lista;
  const chips = [{ v: '', l: 'Todos' }, ...options('estados')].map(o => `<button class="opt ${l.estado === o.v ? 'on' : ''}" data-act="filtro-estado" data-value="${esc(o.v)}">${esc(o.l)}</button>`).join('');
  const cards = (l.items || []).map(i => `<button class="ficha-card" data-act="open-hogar" data-ref="${esc(i.ref)}">
    <div class="d-flex justify-content-between gap-2"><strong>${esc(i.codigo)}</strong>${estadoBadge(i.estado)}</div>
    <small class="text-muted">${esc(i.sector || 'Sin sector')} · ${esc(fechaCorta(i.fechaAplicacion))} · ${esc(i.aplicadaPor || '')}</small>
    ${pasosHtml(i.pasos)}${i.requiereSeguimiento ? '<span class="seg-flag"><i class="bi bi-exclamation-octagon-fill"></i> Requiere seguimiento</span>' : ''}</button>`).join('');
  return `<div class="app-shell"><header class="topbar"><button class="icon-button" data-act="home" aria-label="Volver"><i class="bi bi-arrow-left"></i></button><strong>Avance de hogares</strong><span></span></header>
    <main class="container form-container fade-in">
      <div class="opts opts-chips mb-3">${chips}</div>
      <label class="form-check mb-3"><input class="form-check-input" type="checkbox" data-mios ${l.mios ? 'checked' : ''}> Solo los que apliqué yo (${esc(storage.get(VOL_KEY) || 'sin nombre')})</label>
      ${l.loading ? '<div class="text-center py-5"><span class="spinner-border text-primary"></span></div>' : ''}
      ${l.error ? `<div class="alert alert-danger">${esc(l.error)} <button class="btn btn-link p-0 align-baseline" data-act="lista">Reintentar</button></div>` : ''}
      ${l.items && !l.items.length ? '<p class="empty">No hay hogares con ese filtro.</p>' : cards}
      <p class="card-note text-center mt-3">Por seguridad, aquí no se muestran nombres, direcciones ni teléfonos. Coordinación los consulta en la base de datos.</p></main></div>`;
}

async function loadLista() {
  const l = ui.lista;
  Object.assign(l, { loading: true, error: '' });
  render();
  const params = new URLSearchParams({ limite: '100' });
  if (l.estado) params.set('estado', l.estado);
  const vol = storage.get(VOL_KEY);
  if (l.mios && vol) params.set('aplicadaPor', vol);
  try {
    l.items = await api('GET', `/hogares?${params}`);
  } catch (error) {
    l.error = error.messages[0];
  }
  l.loading = false;
  if (ui.view === 'lista') render();
}

async function openHogar(ref) {
  try {
    ui.lista.detail = await api('GET', `/hogares/${encodeURIComponent(ref)}/progreso`);
    ui.view = 'detail';
  } catch (error) {
    ui.lista.error = error.messages[0];
  }
  render({ keepScroll: false });
}

function detailView() {
  const a = ui.lista.detail;
  return `<div class="app-shell"><header class="topbar"><button class="icon-button" data-act="lista" aria-label="Volver"><i class="bi bi-arrow-left"></i></button><strong>${esc(a.codigo)}</strong>${estadoBadge(a.estado)}</header>
    <main class="container form-container fade-in">
      ${card('Hogar', 'bi-house-heart-fill', summaryRow('bi-geo', 'Sector', a.sector || '—') + summaryRow('bi-calendar-event', 'Aplicada', `${fechaCorta(a.fechaAplicacion)} por ${a.aplicadaPor || '—'}`) + summaryRow('bi-clock-history', 'Última actualización', String(a.actualizadoEn ?? '').replace('T', ' ').slice(0, 16)))}
      ${card('Avance', 'bi-list-check', faltantesHtml(a) + pasosHtml(a.pasos))}
      ${a.resumen ? card('Resumen', 'bi-clipboard-data-fill', resumenRows(a.resumen)) : ''}
      ${alertsHtml(a)}
    </main></div>`;
}

// ---------- flujo ----------
async function loadCatalogs() {
  ui.catalogsState = 'loading';
  if (ui.view === 'home') render();
  try {
    ui.catalogs = await api('GET', '/catalogos', undefined, { timeout: 12000 });
    ui.catalogsState = 'ok';
  } catch (error) {
    ui.catalogsState = 'error';
    ui.catalogsError = error.messages[0];
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
  if (key === 'cierre') refreshAvance();
}

async function refreshAvance() {
  ui.avanceError = '';
  try {
    ui.avance = await api('GET', `/hogares/${encodeURIComponent(ui.ref)}/progreso`);
  } catch (error) {
    ui.avanceError = error.messages[0];
  }
  if (ui.view === 'wizard' && ui.stepKey === 'cierre') render();
}

function previous() {
  const screens = visibleScreens();
  const index = screens.findIndex(s => s.key === ui.stepKey);
  if (index <= 0) { ui.view = 'home'; render({ keepScroll: false }); return; }
  goTo(screens[index - 1].key, 'back');
}

const clearDraft = () => storage.del(DRAFT_KEY);

// Envía lo que corresponda al terminar la pantalla. Devuelve 'next' | 'fin-sin-autorizacion' | 'fin-completo'
async function save(screen) {
  const d = ui.data;
  if (screen.key === 'consentimiento') {
    storage.set(VOL_KEY, text(d.aplicadaPor));
    if (d.autorizaTratamiento === false && !ui.ref) {
      ui.result = await api('POST', '/hogares', hogarPayload());
      return 'fin-sin-autorizacion';
    }
    return 'next';
  }
  if (screen.key === 'contacto') {
    if (!ui.ref) {
      const res = await api('POST', '/hogares', hogarPayload());
      ui.ref = res.ref; ui.codigo = res.codigo; ui.avance = res;
    } else {
      await api('PUT', `/hogares/${ui.ref}/contacto`, contactFields(d));
    }
    return 'next';
  }
  if (screen.key === 'cierre') {
    ui.result = await api('POST', `/hogares/${ui.ref}/completar`);
    return 'fin-completo';
  }
  const screens = visibleScreens();
  const following = screens[screens.findIndex(s => s.key === screen.key) + 1];
  if (following.group !== screen.group) ui.avance = await api('PUT', `/hogares/${ui.ref}/${screen.group}`, PAYLOADS[screen.group]());
  return 'next';
}

async function next() {
  const screen = currentScreen();
  ui.errors = screen.validate();
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
    const outcome = await save(screen);
    ui.saving = false;
    if (outcome.startsWith('fin')) {
      clearDraft(); // contrato §5.8: no se conservan datos personales tras cerrar la ficha
      ui.data = blankData(); ui.ref = null; ui.codigo = null; ui.avance = null;
      ui.view = 'end';
      render({ keepScroll: false });
    } else {
      const screens = visibleScreens();
      flash('Guardado');
      goTo(screens[screens.findIndex(s => s.key === screen.key) + 1].key, 'fwd');
    }
  } catch (error) {
    ui.saving = false;
    ui.banner = error instanceof ApiError ? [...error.messages] : ['Ocurrió un error inesperado.'];
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

async function ensureCatalogs() {
  if (ui.catalogsState !== 'ok') await loadCatalogs();
  return ui.catalogsState === 'ok';
}

async function startNew() {
  if (!(await ensureCatalogs())) return;
  clearDraft();
  Object.assign(ui, { view: 'wizard', stepKey: 'consentimiento', ref: null, codigo: null, avance: null, data: blankData(), errors: {}, banner: [], anim: 'fwd' });
  render({ keepScroll: false });
}

async function resume() {
  const draft = storage.get(DRAFT_KEY);
  if (!draft || !(await ensureCatalogs())) return;
  Object.assign(ui, { view: 'wizard', stepKey: draft.stepKey, ref: draft.ref, codigo: draft.codigo, avance: null, data: { ...blankData(), ...draft.data }, errors: {}, banner: [], anim: 'fwd' });
  render({ keepScroll: false });
  if (draft.stepKey === 'cierre') refreshAvance();
}

// ---------- eventos (delegados, se registran una sola vez) ----------
function toggleMulti(group, code) {
  const bag = ui.data[group];
  if (group === 'items') {
    if (bag[code]) { delete bag[code]; ui.data.urgentes = ui.data.urgentes.map(p => (p === code ? '' : p)); } else bag[code] = true;
    return;
  }
  const exclusive = group === 'visitas' ? 'nadie' : 'ninguna';
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
    setVal(stepPath, empty ? (min === 0 ? Math.max(0, Math.min(max, delta)) : min) : Math.min(max, Math.max(min, Number(current) + delta)));
    delete ui.errors[stepPath];
    persist(); render(); return;
  }
  const actions = {
    start: startNew, resume, next, back: () => (ui.view === 'wizard' ? previous() : null),
    home: () => { ui.view = 'home'; render({ keepScroll: false }); },
    discard: () => { if (confirm('¿Descartar el borrador de este dispositivo? Lo ya enviado al servidor no se borra.')) { clearDraft(); render(); } },
    lista: () => { const keep = ui.view === 'detail' || ui.view === 'lista' ? ui.lista : blankAvance(); ui.lista = keep; ui.view = 'lista'; loadLista(); },
    'filtro-estado': () => { ui.lista.estado = t.dataset.value; loadLista(); },
    'open-hogar': () => openHogar(t.dataset.ref),
    'retry-catalogs': loadCatalogs,
    'refresh-avance': refreshAvance,
    dismiss: () => { ui.banner = []; render(); },
    'add-nino': () => { ui.data.ninosEdades.push(''); persist(); render(); },
    'del-nino': () => { ui.data.ninosEdades.splice(Number(t.dataset.index), 1); ui.errors = {}; persist(); render(); }
  };
  actions[act]?.();
});

app.addEventListener('input', event => {
  const el = event.target;
  if (!el.dataset.path) return;
  setVal(el.dataset.path, el.value);
  delete ui.errors[el.dataset.path];
  el.closest('.field, .menor-row')?.classList.remove('has-error');
  persist();
});

app.addEventListener('change', event => {
  const el = event.target;
  if (el.dataset.mios !== undefined) { ui.lista.mios = el.checked; loadLista(); return; }
  if (el.dataset.prio === undefined) return;
  const slots = ui.data.urgentes;
  const index = Number(el.dataset.prio);
  slots[index] = el.value;
  slots.forEach((code, i) => { if (code && code === el.value && i !== index) slots[i] = ''; });
  persist(); render();
});

render();
loadCatalogs();
