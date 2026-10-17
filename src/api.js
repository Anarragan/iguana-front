import { accessToken } from './auth.js';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, messages) {
    super(messages[0] || 'Error');
    this.status = status;
    this.messages = messages;
  }
}

// `message` del back puede ser texto o arreglo: siempre se normaliza a lista
const toList = message => (Array.isArray(message) ? message : message ? [message] : []).map(String);

const FALLBACK = {
  400: 'Los datos enviados no son válidos.',
  401: 'Sesión inválida o vencida: inicia sesión de nuevo.',
  404: 'No existe el hogar.',
  409: 'El hogar ya no se puede modificar.',
  429: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.',
  503: 'No se pudo verificar la sesión. Inténtalo de nuevo en unos segundos.',
  500: 'No fue posible guardar la información. Inténtalo de nuevo.'
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = handler => { onUnauthorized = handler; };

// Nunca se registran en consola ni se reportan los cuerpos: llevan datos personales (contrato §5.9)
export async function api(method, path, body, { timeout = 20000 } = {}) {
  const token = await accessToken();
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    });
  } catch {
    throw new ApiError(0, ['No fue posible conectar con el servidor. Revisa la conexión; tus respuestas siguen guardadas en este dispositivo.']);
  }
  const data = await response.json().catch(() => null);
  if (response.status === 401) onUnauthorized();
  if (!response.ok) {
    const messages = toList(data?.message);
    throw new ApiError(response.status, messages.length ? messages : [FALLBACK[response.status] || `Error ${response.status}`]);
  }
  return data;
}
