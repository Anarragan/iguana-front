// Carga fichas completas de ejemplo en la API: npm run seed [-- URL_BASE]
const base = (process.argv[2] || process.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const hoy = new Date().toISOString().slice(0, 10);

const call = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data.message)}`);
  return data;
};

const catalogos = await call('GET', '/catalogos');
const categorias = catalogos.categoriasDano.map(c => c.codigo);

const fichas = [
  { direccion: 'Cra 80 # 50-10', nombre: 'María Gómez', tel: '3001234567', paredes: 'concreto_ladrillo', agua: 'rodilla', menores: [4, 9], grupos: [['adulto_mayor', 1], ['sostiene_hogar', 2]], pernocta: 'albergue', danos: [2, 3, 2, 4, 3, 1, 0, 0], necesidades: ['agua_beber', 'alimentos', 'colchones_camas'], visitantes: ['jac'], ayudas: ['kit_aseo'] },
  { direccion: 'Calle 44 # 78-05', nombre: 'Carlos Restrepo', paredes: 'madera_tablaroca', agua: 'cintura', menores: [], grupos: [['adulto_mayor', 2], ['discapacidad', 1]], pernocta: 'familiares_amistades', danos: [3, 3, 3, 4, 4, 2, 4, 1], necesidades: ['medicamentos_atencion_medica', 'electrodomesticos'], visitantes: ['nadie'], ayudas: [] },
  { direccion: 'Transversal 39B # 70-18', nombre: 'Luz Alzate', tel: '3205550101', paredes: 'bahareque_adobe', agua: 'tobillo', menores: [2], grupos: [['embarazo_lactancia', 1]], pernocta: 'misma_vivienda', danos: [1, 0, 1, 1, 0, 0, 0, 0], necesidades: [], visitantes: ['alcaldia_dagrd'], ayudas: ['agua', 'alimentos'] }
];

for (const f of fichas) {
  try {
    const { idFicha } = await call('POST', '/fichas', {
      voluntario: 'Datos de ejemplo', fechaAplicacion: hoy, autorizaTratamiento: true, autorizaSeguimiento: true, versionConsentimiento: 'v1',
      vivienda: { direccion: f.direccion, materialParedes: f.paredes, nivelAguaMax: f.agua, inundadaAntes: 'si' },
      hogar: { nombreReferencia: f.nombre, ...(f.tel ? { telefonoContacto: f.tel } : {}) }
    });
    const put = (paso, body) => call('PUT', `/fichas/${idFicha}/${paso}`, body);
    await put('respondente', { esJefe: true, edad: 40 });
    await put('grupos', { numPersonas: 2 + f.menores.length, menores: f.menores, grupos: f.grupos.map(([grupo, cantidad]) => ({ grupo, cantidad })) });
    if (f.menores.length) await put('escolaridad', { dejaronDeAsistir: true, diasSinAsistir: 5, manejoEstudios: 'con_dificultades' });
    await put('situacion', { lugarPernocta: f.pernocta, electricaDanada: true, lodo: 'poco', acceso: 'con_escombros', numMascotas: 0 });
    await put('danos', { danos: categorias.map((categoria, i) => ({ categoria, nivel: f.danos[i] ?? 0 })) });
    await put('necesidades', { necesidades: f.necesidades.map((item, i) => (i < 3 ? { item, prioridad: i + 1 } : { item })) });
    await put('visitantes', { visitantes: f.visitantes.map(actor => ({ actor })) });
    await put('atencion', { censoPrevio: 'no', dictamen: 'nadie_ha_ido', inscritaRud: 'no_sabe', ofertaRecibida: false, ayudasRecibidas: f.ayudas });
    await call('POST', `/fichas/${idFicha}/completar`);
    console.log('OK ficha', idFicha, f.nombre);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}
