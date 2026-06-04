/**
 * Formateo compartido para filas de calendario y anotación.
 */

export const formatDateHeader = (dateValue) => {
  if (!dateValue) return '';
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString('es-ES', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};

export const formatGameDateTime = (dateValue, timeValue) => {
  if (!dateValue) return '';
  const combined = timeValue ? `${dateValue}T${timeValue}:00` : `${dateValue}T00:00:00`;
  const parsed = new Date(combined);
  if (Number.isNaN(parsed.getTime())) return `${dateValue} ${timeValue || ''}`.trim();
  return parsed.toLocaleString('es-ES', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

export const formatGameNumCell = (gameNum) => {
  if (gameNum == null || gameNum === '') return '—';
  const n = Number(gameNum);
  return Number.isFinite(n) ? String(n) : '—';
};

export const parseScoreValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
};

export const getMatchWinner = (homeScore, awayScore) => {
  if (homeScore === null || awayScore === null) return null;
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return 'draw';
};
