import { useEffect, useState } from 'react';
import { configService } from '../services/configService';
import {
  aggregateTeamCardStatsFromPlayerRows,
  computeBestThirdPlaceDashboard
} from '../utils/bestThirdPlace';

const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';

/**
 * Tabla Dieciseisavos — 1X vs mejor 3.º (Anexo C FIFA).
 * Torneo WC (sport_id=2, id=2).
 */
function FifaR32ThirdPlacePanel({ tournamentId, division }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    if (!tournamentId) {
      setDashboard(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [teamsRes, gamesRes, statsRes] = await Promise.all([
          configService.getTeams(tournamentId),
          configService.getGames(tournamentId),
          configService.getTournamentPlayerEventStats(tournamentId, {
            scope: 'groups',
            division: division || undefined
          })
        ]);

        if (cancelled) return;

        const teams = teamsRes?.success ? teamsRes?.data?.teams || teamsRes?.data || [] : [];
        const games = gamesRes?.success ? gamesRes?.data?.games || gamesRes?.data || [] : [];
        const playerRows = statsRes?.success
          ? statsRes?.data?.playerStats || statsRes?.data?.stats || statsRes?.data?.players || []
          : [];
        const cardStatsByTeamId = aggregateTeamCardStatsFromPlayerRows(playerRows);

        const divisionFilteredTeams = division
          ? teams.filter(
              (t) =>
                String(t.division || t.categoria || t.category || '')
                  .trim()
                  .toLowerCase() === String(division).trim().toLowerCase()
            )
          : teams;

        setDashboard(
          computeBestThirdPlaceDashboard(
            divisionFilteredTeams.length > 0 ? divisionFilteredTeams : teams,
            games,
            division || '',
            cardStatsByTeamId
          )
        );
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'No se pudieron calcular los mejores terceros.');
          setDashboard(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, division]);

  if (loading) {
    return (
      <section className="brackets-best-third brackets-best-third--compact" aria-live="polite">
        <h3 className="brackets-best-third-section-title">Dieciseisavos — 1X vs mejor 3.º (Anexo C FIFA)</h3>
        <p className="brackets-best-third-hint">Calculando llave de mejores terceros…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="brackets-best-third brackets-best-third--error brackets-best-third--compact">
        <h3 className="brackets-best-third-section-title">Dieciseisavos — 1X vs mejor 3.º (Anexo C FIFA)</h3>
        <p className="brackets-best-third-hint">{error}</p>
      </section>
    );
  }

  return (
    <section className="brackets-best-third brackets-best-third--compact" aria-labelledby="fifa-r32-third-place-heading">
      <h3 id="fifa-r32-third-place-heading" className="brackets-best-third-section-title">
        Dieciseisavos — 1X vs mejor 3.º (Anexo C FIFA)
      </h3>
      <div className="brackets-best-third-table-wrap">
        <table className="brackets-best-third-table">
          <thead>
            <tr>
              <th>Partido</th>
              <th>3.º asignado</th>
              <th>Equipo</th>
              <th>Grupo</th>
              <th>Pts</th>
              <th>GD</th>
              <th>GF</th>
            </tr>
          </thead>
          <tbody>
            {(dashboard?.r32Matchups || []).map((row) => (
              <tr key={row.matchupLabel}>
                <td>
                  <code className="brackets-best-third-slot">{row.matchupLabel}</code>
                </td>
                <td>{row.thirdSlot}</td>
                <td>
                  {row.team ? (
                    <span className="brackets-best-third-team">
                      <img
                        src={row.team.image || TEAM_FALLBACK_IMAGE}
                        alt=""
                        className="brackets-best-third-logo"
                        onError={(e) => {
                          if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                            e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                          }
                        }}
                      />
                      {row.team.name}
                    </span>
                  ) : (
                    <span className="brackets-best-third-pending">Por definir</span>
                  )}
                </td>
                <td>{row.thirdGroup || '—'}</td>
                <td>{row.team?.metrics?.points ?? '—'}</td>
                <td>{row.team?.metrics?.gd ?? '—'}</td>
                <td>{row.team?.metrics?.gf ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default FifaR32ThirdPlacePanel;
