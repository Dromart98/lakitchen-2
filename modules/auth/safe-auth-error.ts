export const GENERIC_AUTH_ERROR_MESSAGE =
  "No se pudo completar la autenticación. Inténtalo de nuevo.";

export const RATE_LIMIT_AUTH_ERROR_MESSAGE =
  "Has hecho demasiados intentos. Espera un momento y vuelve a intentarlo.";

export function getSafeAuthErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 429
  ) {
    return RATE_LIMIT_AUTH_ERROR_MESSAGE;
  }

  return GENERIC_AUTH_ERROR_MESSAGE;
}
