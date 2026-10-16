// Carga familias de ejemplo en la API: npm run seed [-- URL_BASE]
const base = (process.argv[2] || process.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const familias = [
  { hogar: { direccionReferencia: 'Calle 10 #45-12, barrio La Iguaná', observaciones: 'Vivienda afectada por inundación' },
    familia: { nombreReferencia: 'María Pérez', telefonoContacto: '3001234567' },
    personas: [{ nombres: 'María Pérez', fechaNacimiento: '1985-03-21', requiereApoyo: false }, { nombres: 'Juan Pérez', fechaNacimiento: '2012-08-02', requiereApoyo: false }],
    afectaciones: [{ categoria: 'enseres', descripcion: 'Pérdida de electrodomésticos', nivelAfectacion: 'grave' }],
    necesidades: [{ categoria: 'alojamiento', descripcion: 'Refugio temporal', nivelUrgencia: 'alta' }] },
  { hogar: { direccionReferencia: 'Carrera 80 #12-30, La Iguaná' },
    familia: { nombreReferencia: 'Carlos Gómez' },
    personas: [{ nombres: 'Carlos Gómez', fechaNacimiento: '1950-11-05', requiereApoyo: true, observaciones: 'Movilidad reducida' }],
    afectaciones: [{ categoria: 'vivienda', descripcion: 'Pérdida total de la vivienda', nivelAfectacion: 'perdida_total' }, { categoria: 'ropa', descripcion: 'Ropa y cobijas dañadas', nivelAfectacion: 'moderado' }],
    necesidades: [{ categoria: 'salud', descripcion: 'Medicamentos para hipertensión', nivelUrgencia: 'alta' }, { categoria: 'aseo', descripcion: 'Kit de aseo', nivelUrgencia: 'media' }] },
  { hogar: { direccionReferencia: 'Calle 44 #78-05, La Iguaná', observaciones: 'Local comercial en el primer piso' },
    familia: { nombreReferencia: 'Luz Marina Restrepo', telefonoContacto: '3109876543' },
    personas: [{ nombres: 'Luz Marina Restrepo', fechaNacimiento: '1978-06-14', requiereApoyo: false }, { nombres: 'Sofía Restrepo', fechaNacimiento: '2019-01-30', requiereApoyo: false }, { nombres: 'Andrés Restrepo', requiereApoyo: false }],
    afectaciones: [{ categoria: 'comercio', descripcion: 'Mercancía perdida', nivelAfectacion: 'grave' }, { categoria: 'ingresos', descripcion: 'Sin ingresos por cierre del negocio', nivelAfectacion: 'grave' }],
    necesidades: [{ categoria: 'recuperacion_economica', descripcion: 'Capital semilla para reabrir el negocio', nivelUrgencia: 'media' }, { categoria: 'alimentacion', descripcion: 'Mercado familiar', nivelUrgencia: 'alta' }] },
  { hogar: { direccionReferencia: 'Transversal 39B #70-18, La Iguaná' },
    familia: { nombreReferencia: 'Pedro Alzate', telefonoContacto: '3205550101' },
    personas: [{ nombres: 'Pedro Alzate', fechaNacimiento: '1990-09-09', requiereApoyo: false }],
    afectaciones: [], necesidades: [] }
];

for (const data of familias) {
  try {
    const res = await fetch(`${base}/caracterizacion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const body = await res.json().catch(() => ({}));
    console.log(res.status, res.ok ? `${body.hogar.codigo} / ${body.familia.codigo}` : JSON.stringify(body));
  } catch (error) {
    console.error('No se pudo conectar con', base, '-', error.message);
    process.exit(1);
  }
}
