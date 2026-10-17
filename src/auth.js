import { createClient } from '@supabase/supabase-js';

// La URL y la anon key de Supabase son públicas por diseño (contrato §7). No hay otros secretos en el front.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const authConfigured = Boolean(url && anonKey);

// Se lee antes de crear el cliente: supabase-js limpia el hash al procesar el enlace de invitación o recuperación
const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
export const linkInfo = { type: hash.get('type'), error: hash.get('error_description') };

const supabase = authConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

const MESSAGES = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'Aún no has aceptado la invitación. Revisa tu correo.'],
  [/rate limit|too many/i, 'Demasiados intentos. Espera unos minutos.'],
  [/password should be at least/i, 'La contraseña es demasiado corta.'],
  [/same password/i, 'La nueva contraseña debe ser distinta a la anterior.'],
  [/failed to fetch|network/i, 'No hay conexión con el servicio de inicio de sesión.']
];
const friendly = error => MESSAGES.find(([re]) => re.test(error?.message || ''))?.[1] || 'No fue posible completar la operación. Inténtalo de nuevo.';

export async function accessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendly(error));
  return data.session;
}

export async function signOut() {
  try { await supabase?.auth.signOut(); } catch { /* la sesión local se descarta igual */ }
}

export async function setPassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(friendly(error));
}

export async function sendReset(email) {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw new Error(friendly(error));
}

export function onSignedOut(callback) {
  supabase?.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') callback(); });
}
