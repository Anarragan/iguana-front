# Iguana Front

Aplicación móvil web para registrar la caracterización completa de hogares afectados por la inundación en La Iguaná.

## Desarrollo

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

La aplicación consume `http://localhost:3000` por defecto. Para cambiar la URL de la API, crea un archivo `.env`:

```env
VITE_API_BASE_URL=http://localhost:3000
```

El envío se realiza únicamente al finalizar el quinto paso mediante `POST /caracterizacion`. Los catálogos se cargan desde `GET /caracterizacion/catalogos` y, si el servicio no está disponible, se muestran los valores definidos en el contrato.

```bash
npm run build
```