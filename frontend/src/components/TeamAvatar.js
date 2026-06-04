export const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';

export function teamImageOnError(e) {
  const img = e?.currentTarget;
  if (!img || img.dataset.fallbackApplied === '1') return;
  img.dataset.fallbackApplied = '1';
  img.src = TEAM_FALLBACK_IMAGE;
}

export default function TeamAvatar({ src, alt = '', className = '' }) {
  return (
    <img
      src={src || TEAM_FALLBACK_IMAGE}
      alt={alt}
      className={className}
      onError={teamImageOnError}
    />
  );
}
