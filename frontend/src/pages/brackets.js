import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from '../components/navbar';
import { useResolvedTournamentId } from '../hooks/useResolvedTournamentId';
import TournamentBracket from '../components/TournamentBracket';
import PlacementsBracket from '../components/PlacementsBracket';
import { useTournamentSport } from '../hooks/useTournamentSport';
import { configService } from '../services/configService';
import {
  aggregateTeamCardStatsFromPlayerRows,
  computeBestThirdPlaceDashboard
} from '../utils/bestThirdPlace';
import './brackets.css';

const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';

/** Cada tarjeta de partido (PlacementsBracket) muestra fecha, hora y ubicación alineadas en la misma fila. */

function BestThirdPlacePanel({ tournamentId, division }) {
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
          ? statsRes?.data?.playerStats || statsRes?.data?.stats || []
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
      <section className="brackets-best-third" aria-live="polite">
        <h2 className="brackets-best-third-title">Mejores terceros</h2>
        <p className="brackets-best-third-hint">Calculando clasificación…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="brackets-best-third brackets-best-third--error">
        <h2 className="brackets-best-third-title">Mejores terceros</h2>
        <p className="brackets-best-third-hint">{error}</p>
      </section>
    );
  }

  return (
    <section className="brackets-best-third" aria-labelledby="brackets-best-third-heading">
      <h2 id="brackets-best-third-heading" className="brackets-best-third-title">
        Mejores terceros
      </h2>
      <p className="brackets-best-third-hint">
        Se comparan los terceros de cada grupo (A–L) con criterios en orden: puntos, diferencia de goles,
        goles a favor y fair play (tarjetas). Los <strong>8 mejores</strong> clasifican a eliminatorias. En
        Loc./Vis. del bracket usa el slot FIFA por partido, p. ej. <strong>3ABCDF</strong>.
      </p>

      {dashboard?.combinationKey ? (
        <p className="brackets-best-third-combination">
          Clave de los 8 clasificados:{' '}
          <code className="brackets-best-third-slot">{dashboard.combinationKey}</code>
        </p>
      ) : null}

      <h3 className="brackets-best-third-section-title">Clasificación global (3.º por grupo)</h3>
      <div className="brackets-best-third-table-wrap">
        <table className="brackets-best-third-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Grupo</th>
              <th>Equipo</th>
              <th>Pts</th>
              <th>GD</th>
              <th>GF</th>
              <th>FP</th>
              <th>YC</th>
              <th>RC</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {(dashboard?.allThirds || []).map((row) => (
              <tr
                key={`global-${row.groupLetter}-${row.teamId}`}
                className={row.qualified ? 'brackets-best-third-row--qualified' : undefined}
              >
                <td>{row.globalRank}</td>
                <td>{row.groupLetter}</td>
                <td>
                  <span className="brackets-best-third-team">
                    <img
                      src={row.image || TEAM_FALLBACK_IMAGE}
                      alt=""
                      className="brackets-best-third-logo"
                      onError={(e) => {
                        if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                          e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                        }
                      }}
                    />
                    {row.name}
                  </span>
                </td>
                <td>{row.metrics?.points ?? '—'}</td>
                <td>{row.metrics?.gd ?? '—'}</td>
                <td>{row.metrics?.gf ?? '—'}</td>
                <td>{row.metrics?.fairPlayScore ?? '—'}</td>
                <td>{row.metrics?.yellowcards ?? '—'}</td>
                <td>{row.metrics?.redcards ?? '—'}</td>
                <td>{row.qualified ? 'Clasificado' : 'Eliminado'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="brackets-best-third-section-title">Slots FIFA (asignación por partido)</h3>
      <div className="brackets-best-third-table-wrap">
        <table className="brackets-best-third-table">
          <thead>
            <tr>
              <th>Slot</th>
              <th>Grupos</th>
              <th>Equipo</th>
              <th>3.º de</th>
              <th>Pts</th>
              <th>GD</th>
              <th>GF</th>
              <th>YC</th>
              <th>RC</th>
            </tr>
          </thead>
          <tbody>
            {(dashboard?.slotResults || []).map((row) => (
              <tr key={row.slot}>
                <td>
                  <code className="brackets-best-third-slot">{row.slot}</code>
                </td>
                <td>{row.groups.join(', ')}</td>
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
                <td>{row.team?.groupLetter || '—'}</td>
                <td>{row.team?.metrics?.points ?? '—'}</td>
                <td>{row.team?.metrics?.gd ?? '—'}</td>
                <td>{row.team?.metrics?.gf ?? '—'}</td>
                <td>{row.team?.metrics?.yellowcards ?? '—'}</td>
                <td>{row.team?.metrics?.redcards ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BracketsPage() {
  const location = useLocation();
  const tournamentId = useResolvedTournamentId();
  const isPoolMode = location.pathname.startsWith('/poolbrackets');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [activeBracketView, setActiveBracketView] = useState('all');
  const [rankedCanvasList, setRankedCanvasList] = useState([]);
  const { isFootballTournament } = useTournamentSport(tournamentId);
  const rankedCanvasIds = useMemo(
    () => rankedCanvasList.map((canvas) => String(canvas.id)).filter(Boolean),
    [rankedCanvasList]
  );

  useEffect(() => {
    if (!isFootballTournament) return;
    if (activeBracketView === 'ranked' || activeBracketView === 'all') {
      setActiveBracketView('main');
    }
  }, [isFootballTournament, activeBracketView]);

  useEffect(() => {
    let cancelled = false;

    const loadRankedCanvases = async () => {
      if (!tournamentId || activeBracketView !== 'all' || isFootballTournament) {
        setRankedCanvasList([]);
        return;
      }

      try {
        const response = await configService.getRankedCanvases(tournamentId, selectedDivision || undefined);
        const canvases = response?.success ? response?.data?.canvases || [] : [];
        if (!cancelled) {
          setRankedCanvasList(canvases);
        }
      } catch (error) {
        if (!cancelled) {
          setRankedCanvasList([]);
        }
      }
    };

    loadRankedCanvases();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, selectedDivision, activeBracketView, isFootballTournament]);

  return (
    <div className="brackets-page">
      <div className="brackets-topbar">
        <Navbar tournamentId={tournamentId} />
      </div>

      <main className="brackets-content">
        <header className="brackets-header">
          <h1>{isPoolMode ? 'Pool & Brackets' : 'Brackets'}</h1>
          {tournamentId ? (
            <p className="brackets-stats-slots-hint">
              {isFootballTournament ? (
                <>
                  En el lienzo <strong>Principal</strong>, las columnas <strong>Loc.</strong> / <strong>Vis.</strong> admiten la
                  posición del grupo según estadísticas (p. ej. <strong>1A</strong>, <strong>2B</strong> o mejor tercero{' '}
                  <strong>3ABCDF</strong>). También puedes usar <strong>Conectar lineas manualmente</strong> entre fases.
                </>
              ) : (
                <>
                  En el lienzo <strong>Principal</strong> y en <strong>Posicionamiento</strong>, las columnas <strong>Loc.</strong>/{' '}
                  <strong>Vis.</strong> admiten la posición del grupo según estadísticas (p. ej. <strong>1A</strong> o <strong>3B</strong>
                  ). En el mismo campo puedes indicar ganador o perdedor de otro partido ya creado con el formato{' '}
                  <strong>W</strong>/<strong>L</strong> + número de juego (&quot;<strong>Juego N</strong>&quot; de la tarjeta), por
                  ejemplo <strong>W12</strong> o <strong>L73</strong>. También puedes usar <strong>Elegir equipo fijo</strong> si no
                  quieres slot. El nombre visible se actualiza con la tabla o con el resultado del origen cuando el partido fuente ya
                  tiene marcador definitivo distinto del empate (empates siguen como &quot;Por definir&quot;). También sirve{' '}
                  <strong>Conectar lineas manualmente</strong> como alternativa entre fases. Al guardar, la vista pública{' '}
                  <strong>Pool &amp; Brackets</strong> puede actualizarse en la misma pestaña o en otras abiertas.
                </>
              )}
            </p>
          ) : null}
        </header>

        {!tournamentId ? (
          <section className="brackets-empty">Selecciona un torneo para visualizar el bracket.</section>
        ) : (
          <>
            {isFootballTournament && !isPoolMode ? (
              <BestThirdPlacePanel tournamentId={tournamentId} division={selectedDivision} />
            ) : null}
            <TournamentBracket
              tournamentId={tournamentId}
              selectedDivision={selectedDivision}
              onDivisionChange={setSelectedDivision}
              activeBracketView={activeBracketView}
              onBracketViewChange={setActiveBracketView}
              hideBracketFilter={isFootballTournament}
              hideRankedBracketView={isFootballTournament}
            />
            {activeBracketView === 'all' && !isFootballTournament ? (
              <div className="brackets-stacked-list">
                <section className="brackets-main-canvas-block">
                  <h3 className="brackets-ranked-canvas-title">Principal</h3>
                  <PlacementsBracket
                    tournamentId={tournamentId}
                    selectedDivision={selectedDivision}
                    activeBracketView="main"
                    showToolbar={!isPoolMode}
                    readOnly={isPoolMode}
                    isFootballTournament={isFootballTournament}
                  />
                </section>
                <section className="brackets-ranked-canvas-block">
                  <h3 className="brackets-ranked-canvas-title">Posicionamiento</h3>
                  <PlacementsBracket
                    tournamentId={tournamentId}
                    selectedDivision={selectedDivision}
                    activeBracketView="ranked"
                    showToolbar={!isPoolMode}
                    showRankedCanvasToolbar={false}
                    stickyRankedPhaseAddButtons
                    readOnly={isPoolMode}
                    forcedRankedCanvasIds={rankedCanvasIds}
                    isFootballTournament={isFootballTournament}
                  />
                </section>
              </div>
            ) : activeBracketView ? (
              <PlacementsBracket
                tournamentId={tournamentId}
                selectedDivision={selectedDivision}
                activeBracketView={activeBracketView}
                showToolbar={!isPoolMode}
                showRankedCanvasToolbar={activeBracketView !== 'ranked'}
                stickyRankedPhaseAddButtons={activeBracketView === 'ranked'}
                readOnly={isPoolMode}
                forcedRankedCanvasIds={!isFootballTournament && activeBracketView === 'ranked' ? rankedCanvasIds : undefined}
                isFootballTournament={isFootballTournament}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

export default BracketsPage;
