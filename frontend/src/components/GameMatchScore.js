import { useGameMatchScore } from '../hooks/useGameMatchScore';

/**
 * Bloque de UI mínimo para marcador local–visitante (datos desde goal-totals).
 *
 * @param {object} props
 * @param {string|number} props.tournamentId
 * @param {string|number} props.gameId
 * @param {string} [props.className]
 * @param {{ enabled?: boolean, refetchIntervalMs?: number }} [props.queryOptions]
 * @param {(local: number, visitor: number) => import('react').ReactNode} [props.format]
 */
function GameMatchScore({ tournamentId, gameId, className, queryOptions, format }) {
  const { localGoals, visitorGoals, loading, error } = useGameMatchScore(tournamentId, gameId, queryOptions);

  const showPlaceholder = loading && localGoals === 0 && visitorGoals === 0;
  const inner = format ? format(localGoals, visitorGoals) : `${localGoals} – ${visitorGoals}`;

  return (
    <span
      className={className}
      role="status"
      aria-busy={loading ? 'true' : 'false'}
      aria-live="polite"
      title={error || undefined}
    >
      {showPlaceholder ? '—' : inner}
    </span>
  );
}

export default GameMatchScore;
