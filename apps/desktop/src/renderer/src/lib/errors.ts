/**
 * ponytail: Electron wraps every IPC error as
 * "Error invoking remote method '<channel>': AppError: <real message>" —
 * that plumbing must never reach a user toast. Strip the wrapper and show
 * only the human sentence.
 */
export function friendlyErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!(error instanceof Error)) return fallback;
  let message = error.message;
  const ipcPrefix = message.match(/Error invoking remote method '[^']+':\s*/);
  if (ipcPrefix?.[0]) message = message.slice(ipcPrefix[0].length);
  message = message.replace(/^AppError:\s*/, '');
  message = message.replace(/^(Error|TypeError|RangeError):\s*/, '');
  return message.trim() !== '' ? message : fallback;
}
