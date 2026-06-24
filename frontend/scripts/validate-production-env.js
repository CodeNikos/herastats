/**
 * Falla el build de producción si falta REACT_APP_API_URL.
 */
const isProd =
  process.env.NODE_ENV === 'production' ||
  process.argv.includes('--production');

if (isProd) {
  const url = (process.env.REACT_APP_API_URL || '').trim();
  if (!url) {
    console.error(
      '[Herastats] ERROR: REACT_APP_API_URL es obligatorio para npm run build.\n' +
        'Ejemplo: REACT_APP_API_URL=https://api.tudominio.com/api npm run build'
    );
    process.exit(1);
  }
  if (/localhost/i.test(url)) {
    console.warn(
      '[Herastats] AVISO: REACT_APP_API_URL apunta a localhost en build de producción.'
    );
  }

  const fifaWcId = (process.env.REACT_APP_FIFA_WC_TOURNAMENT_ID || '').trim();
  if (!fifaWcId) {
    console.warn(
      '[Herastats] AVISO: REACT_APP_FIFA_WC_TOURNAMENT_ID no está definido; se usará torneo id=2 (solo válido en local).'
    );
  }
}
