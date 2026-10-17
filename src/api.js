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

export async function api(method, path, body, { timeout = 20000 } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    });
  } catch {
    throw new ApiError(0, [`No fue posible conectar con el servidor (${API_BASE_URL}). Revisa la conexión; tus respuestas siguen guardadas en este dispositivo.`]);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback = { 404: 'No se encontró el registro.', 409: 'La ficha ya no se puede modificar.', 500: 'No fue posible guardar la ficha. Inténtalo de nuevo.' }[response.status] || `Error ${response.status}`;
    throw new ApiError(response.status, toList(data?.message).length ? toList(data.message) : [fallback]);
  }
  return data;
}
