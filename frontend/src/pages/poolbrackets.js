import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/navbar';
import TournamentBracket from '../components/TournamentBracket';
import PlacementsBracket from '../components/PlacementsBracket';
import { configService } from '../services/configService';
import {
  broadcastTournamentCoherenceChanged,
  HERASTATS_GAMES_CHANGED_STORAGE,
  HERASTATS_TOURNAMENT_COHERENCE,
  normalizeTournamentIdForCoherence
} from '../utils/tournamentSync';
import './brackets.css';
import './poolbrackets.css';

const TEAM_FALLBACK_IMAGE = '/Hera_logo.png';

/** Orden preferido de columnas (como en la referencia WFDF). */
const PLACEMENT_DIVISION_ORDER = ['Open', "Women's", 'Mixed', 'Master Open', 'Master Mixed'];
const MIN_PLACEMENT_ROWS = 10;

function normalizeDivisionKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function sortPlacementDivisions(divisions) {
  const unique = [...new Set((divisions || []).map((d) => String(d).trim()).filter(Boolean))];
  const orderIndex = (name) => {
    const idx = PLACEMENT_DIVISION_ORDER.findIndex((label) => normalizeDivisionKey(label) === normalizeDivisionKey(name));
    return idx >= 0 ? idx : PLACEMENT_DIVISION_ORDER.length + unique.indexOf(name);
  };
  return unique.sort((a, b) => {
    const da = orderIndex(a);
    const db = orderIndex(b);
    if (da !== db) return da - db;
    return a.localeCompare(b, 'es', { sensitivity: 'base' });
  });
}

function buildPlacementGrid(rows) {
  const divisions = sortPlacementDivisions((rows || []).map((r) => r.division));
  const byKey = new Map();
  for (const row of rows || []) {
    const placementNum = Number(row.placement_number);
    const division = String(row.division ?? '').trim();
    if (!Number.isFinite(placementNum) || placementNum <= 0 || !division) continue;
    byKey.set(`${placementNum}::${normalizeDivisionKey(division)}`, row);
  }
  const maxFromData = (rows || []).reduce((max, row) => {
    const n = Number(row.placement_number);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  const rowCount = Math.max(MIN_PLACEMENT_ROWS, maxFromData);
  const tableRows = [];
  for (let placementNum = 1; placementNum <= rowCount; placementNum += 1) {
    const cells = divisions.map((division) => {
      const hit = byKey.get(`${placementNum}::${normalizeDivisionKey(division)}`);
      return hit || null;
    });
    tableRows.push({ placementNum, cells });
  }
  return { divisions, tableRows };
}

function placementRowLabel(placementNum) {
  if (placementNum === 1) return { text: 'Gold', tone: 'gold', medal: true };
  if (placementNum === 2) return { text: 'Silver', tone: 'silver', medal: true };
  if (placementNum === 3) return { text: 'Bronze', tone: 'bronze', medal: true };
  return { text: String(placementNum), tone: 'plain', medal: false };
}

/** Cada tarjeta de partido (PlacementsBracket) muestra fecha, hora y ubicación alineadas en la misma fila. */

function PoolBracketsPage() {
  const { id: routeTournamentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const queryTournamentId = queryParams.get('tournamentId');
  const tournamentId = routeTournamentId || queryTournamentId;
  const [selectedDivision, setSelectedDivision] = useState('');
  const [activeBracketView, setActiveBracketView] = useState('all');
  const [rankedCanvasList, setRankedCanvasList] = useState([]);
  /** Tabla estadísticas/grupos en TournamentBracket (spinner solo al entrar en ruta / torneo). */
  const [routeReloadNonce, setRouteReloadNonce] = useState(0);
  /** Lista de lienzos ranked y merge: solo cuando cambia calendario/estructura del bracket (no cada gol). */
  const [rankedStructureNonce, setRankedStructureNonce] = useState(0);
  const [showFinalPlacements, setShowFinalPlacements] = useState(false);
  const [finalPlacementsRows, setFinalPlacementsRows] = useState([]);
  const [finalPlacementsLoading, setFinalPlacementsLoading] = useState(false);
  const [finalPlacementsError, setFinalPlacementsError] = useState('');

  const rankedStructureBumpTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      window.clearTimeout(rankedStructureBumpTimerRef.current);
      rankedStructureBumpTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!tournamentId) return undefined;
    const tid = normalizeTournamentIdForCoherence(tournamentId);

    const bumpRankedStructureDebounced = () => {
      window.clearTimeout(rankedStructureBumpTimerRef.current);
      rankedStructureBumpTimerRef.current = window.setTimeout(() => {
        setRankedStructureNonce((n) => n + 1);
        rankedStructureBumpTimerRef.current = null;
      }, 380);
    };

    const onCoherence = (event) => {
      if (!event.detail || normalizeTournamentIdForCoherence(event.detail.tournamentId) !== tid) return;
      if (event.detail.fullBracketReload) bumpRankedStructureDebounced();
    };

    const onStorage = (event) => {
      if (!event?.newValue || event.key !== HERASTATS_GAMES_CHANGED_STORAGE) return;
      try {
        const payload = JSON.parse(event.newValue);
        if (payload && normalizeTournamentIdForCoherence(payload.tournamentId) === tid && payload.fullBracketReload) {
          bumpRankedStructureDebounced();
        }
      } catch (_) {
        /* ignorar */
      }
    };

    window.addEventListener(HERASTATS_TOURNAMENT_COHERENCE, onCoherence);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(HERASTATS_TOURNAMENT_COHERENCE, onCoherence);
      window.removeEventListener('storage', onStorage);
    };
  }, [tournamentId]);

  /** Al volver a la pestaña: refresco ligero de equipos (CustomEvent; PlacementsBracket / TournamentBracket lo escuchan). */
  useEffect(() => {
    if (!tournamentId) return undefined;
    const tid = normalizeTournamentIdForCoherence(tournamentId);
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        window.dispatchEvent(
          new CustomEvent(HERASTATS_TOURNAMENT_COHERENCE, {
            detail: { tournamentId: tid, fullBracketReload: false }
          })
        );
      } catch (_) {
        /* ignorar */
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [tournamentId]);

  /** Al entrar en la ruta o cambiar torneo/query: primera carga con spinner en la tabla de grupos. */
  useEffect(() => {
    if (!tournamentId) return;
    setRouteReloadNonce((n) => n + 1);
    setRankedStructureNonce((n) => n + 1);
  }, [tournamentId, location.pathname, location.search]);

  const rankedCanvasIds = useMemo(
    () => rankedCanvasList.map((canvas) => String(canvas.id)).filter(Boolean),
    [rankedCanvasList]
  );

  /** Cada cambio relevante desde el shell de Pool fuerza sync de marcadores / tablas auxiliares en PlacementsBracket. */
  const rankedCanvasFingerprint = useMemo(() => rankedCanvasIds.join('|'), [rankedCanvasIds]);
  const [rankedListHydrationEpoch, setRankedListHydrationEpoch] = useState(0);
  const lastRankedFpRef = useRef(undefined);

  useEffect(() => {
    lastRankedFpRef.current = undefined;
    setRankedListHydrationEpoch(0);
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    if (lastRankedFpRef.current === rankedCanvasFingerprint) return;
    lastRankedFpRef.current = rankedCanvasFingerprint;
    setRankedListHydrationEpoch((n) => n + 1);
  }, [tournamentId, rankedCanvasFingerprint]);

  const poolScoresSyncEpoch =
    Number(routeReloadNonce || 0) + Number(rankedStructureNonce || 0) + Number(rankedListHydrationEpoch || 0);

  /** Clic en tarjeta de partido → pantalla de detalle (`/game`, GamePages). */
  const handlePoolGameNavigate = useCallback(
    (gameId, match) => {
      if (!tournamentId || !gameId) return;
      const params = new URLSearchParams();
      params.set('tournamentId', String(tournamentId));
      params.set('gameId', String(gameId));
      const homeId = match?.teams?.[0]?.teamId;
      const awayId = match?.teams?.[1]?.teamId;
      if (homeId) params.set('homeTeamId', String(homeId));
      if (awayId) params.set('awayTeamId', String(awayId));
      navigate(`/game?${params.toString()}`);
    },
    [navigate, tournamentId]
  );

  /** Partidos Finalizado: servidor rellena W#/L# en la siguiente fase (ganador/perdedor del partido número N). Sesión obligatoria. */
  useEffect(() => {
    if (!tournamentId) return undefined;
    try {
      if (typeof window === 'undefined' || !window.localStorage?.getItem?.('token')) return undefined;
    } catch {
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await configService.syncPlayoffBracketAdvances(tournamentId);
        if (cancelled) return;
        const touched = Number(res?.data?.updatedGames ?? 0);
        if (res?.success && touched > 0) {
          broadcastTournamentCoherenceChanged(tournamentId, { fullBracketReload: true });
        }
      } catch {
        /* sin sesión / red: la vista sólo lectura sigue igual */
      }
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tournamentId, poolScoresSyncEpoch]);

  useEffect(() => {
    let cancelled = false;

    const loadRankedCanvases = async () => {
      if (!tournamentId || activeBracketView !== 'all') {
        setRankedCanvasList([]);
        return;
      }

      try {
        const response = await configService.getRankedCanvases(tournamentId, selectedDivision || undefined);
        const canvases = response?.success ? response?.data?.canvases || [] : [];
        if (!cancelled) {
          setRankedCanvasList(canvases);
          /** Lista ranked llegó después del lienzo principal: mismo torneo debe refrescar getGames/getTeams en lienzos. */
          broadcastTournamentCoherenceChanged(tournamentId, { fullBracketReload: false });
        }
      } catch {
        if (!cancelled) {
          setRankedCanvasList([]);
        }
      }
    };

    loadRankedCanvases();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, selectedDivision, activeBracketView, rankedStructureNonce, routeReloadNonce]);

  const finalPlacementsGrid = useMemo(
    () => buildPlacementGrid(finalPlacementsRows),
    [finalPlacementsRows]
  );

  const loadFinalPlacements = useCallback(async () => {
    if (!tournamentId) return;
    setFinalPlacementsLoading(true);
    setFinalPlacementsError('');
    try {
      const res = await configService.getTournamentPlacements(tournamentId);
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudieron cargar las posiciones finales.');
      }
      setFinalPlacementsRows(res.data?.placements || []);
    } catch (e) {
      setFinalPlacementsRows([]);
      setFinalPlacementsError(e.response?.data?.message || e.message || 'Error al cargar posiciones finales.');
    } finally {
      setFinalPlacementsLoading(false);
    }
  }, [tournamentId]);

  const handleToggleFinalPlacements = useCallback(() => {
    setShowFinalPlacements((prev) => {
      const next = !prev;
      if (next && tournamentId) {
        loadFinalPlacements();
      }
      return next;
    });
  }, [loadFinalPlacements, tournamentId]);

  useEffect(() => {
    setShowFinalPlacements(false);
    setFinalPlacementsRows([]);
    setFinalPlacementsError('');
  }, [tournamentId]);

  return (
    <div className="brackets-page poolbrackets-page" data-game-card-border-hover>
      <div className="brackets-topbar">
        <Navbar tournamentId={tournamentId} />
      </div>

      <main className="brackets-content">
        <header className="brackets-header">
          <h1>Pool & Brackets</h1>
          {tournamentId ? (
            <div className="poolbrackets-final-actions">
              <button
                type="button"
                className={`poolbrackets-final-toggle${showFinalPlacements ? ' poolbrackets-final-toggle--active' : ''}`}
                onClick={handleToggleFinalPlacements}
                aria-pressed={showFinalPlacements}
              >
                {showFinalPlacements ? 'Ocultar posiciones finales' : 'Ver posiciones finales'}
              </button>
            </div>
          ) : null}
        </header>

        {tournamentId && showFinalPlacements ? (
          <section className="poolbrackets-final-section" aria-labelledby="poolbrackets-final-title">
            <div className="poolbrackets-final-heading">
              <span className="poolbrackets-final-trophy" aria-hidden="true">
                🏆
              </span>
              <h2 id="poolbrackets-final-title" className="poolbrackets-final-title">
                Final Placements
              </h2>
            </div>

            {finalPlacementsLoading ? (
              <p className="poolbrackets-final-state">Cargando posiciones…</p>
            ) : null}
            {!finalPlacementsLoading && finalPlacementsError ? (
              <p className="poolbrackets-final-state poolbrackets-final-state--error">{finalPlacementsError}</p>
            ) : null}
            {!finalPlacementsLoading && !finalPlacementsError && finalPlacementsGrid.divisions.length === 0 ? (
              <p className="poolbrackets-final-state">No hay posiciones finales registradas para este torneo.</p>
            ) : null}

            {!finalPlacementsLoading && !finalPlacementsError && finalPlacementsGrid.divisions.length > 0 ? (
              <div className="poolbrackets-final-table-wrap">
                <table className="poolbrackets-final-table">
                  <thead>
                    <tr>
                      <th scope="col" className="poolbrackets-final-th poolbrackets-final-th--placement">
                        Final Placement
                      </th>
                      {finalPlacementsGrid.divisions.map((division) => (
                        <th key={division} scope="col" className="poolbrackets-final-th">
                          {division}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {finalPlacementsGrid.tableRows.map(({ placementNum, cells }) => {
                      const label = placementRowLabel(placementNum);
                      return (
                        <tr key={placementNum} className="poolbrackets-final-row">
                          <th
                            scope="row"
                            className={`poolbrackets-final-placement-label poolbrackets-final-placement-label--${label.tone}`}
                          >
                            {label.medal ? (
                              <span className="poolbrackets-final-medal" aria-hidden="true">
                                {placementNum === 1 ? '🥇' : placementNum === 2 ? '🥈' : '🥉'}
                              </span>
                            ) : null}
                            <span>{label.text}</span>
                          </th>
                          {cells.map((cell, cellIndex) => {
                            const division = finalPlacementsGrid.divisions[cellIndex];
                            const cellKey = `${placementNum}-${division}`;
                            if (!cell) {
                              return (
                                <td
                                  key={cellKey}
                                  className="poolbrackets-final-cell poolbrackets-final-cell--empty"
                                  data-division={division}
                                >
                                  —
                                </td>
                              );
                            }
                            const imgSrc =
                              cell.team_image && String(cell.team_image).trim() !== ''
                                ? String(cell.team_image).trim()
                                : TEAM_FALLBACK_IMAGE;
                            return (
                              <td
                                key={cellKey}
                                className="poolbrackets-final-cell"
                                data-division={division}
                              >
                                <div className="poolbrackets-final-team">
                                  <img
                                    className="poolbrackets-final-team-flag"
                                    src={imgSrc}
                                    alt=""
                                    onError={(e) => {
                                      if (!e.currentTarget.src.includes(TEAM_FALLBACK_IMAGE)) {
                                        e.currentTarget.src = TEAM_FALLBACK_IMAGE;
                                      }
                                    }}
                                  />
                                  <span className="poolbrackets-final-team-name">{cell.team_name}</span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}

        {!tournamentId ? (
          <section className="brackets-empty">
            Selecciona un torneo para visualizar el bracket.
          </section>
        ) : (
          <>
            <TournamentBracket
              tournamentId={tournamentId}
              selectedDivision={selectedDivision}
              onDivisionChange={setSelectedDivision}
              activeBracketView={activeBracketView}
              onBracketViewChange={setActiveBracketView}
              routeReloadNonce={routeReloadNonce}
            />
            {activeBracketView === 'all' ? (
              <div className="brackets-stacked-list">
                <section className="brackets-main-canvas-block">
                  <h3 className="brackets-ranked-canvas-title">Principal</h3>
                  <PlacementsBracket
                    tournamentId={tournamentId}
                    selectedDivision={selectedDivision}
                    activeBracketView="main"
                    showToolbar={false}
                    readOnly={true}
                    isPoolBracketsPage
                    useGoalTotalsForScores
                    poolScoresSyncEpoch={poolScoresSyncEpoch}
                    onGameNavigate={handlePoolGameNavigate}
                  />
                </section>
                <section className="brackets-ranked-canvas-block">
                  <h3 className="brackets-ranked-canvas-title">Posicionamiento</h3>
                  <PlacementsBracket
                    tournamentId={tournamentId}
                    selectedDivision={selectedDivision}
                    activeBracketView="ranked"
                    showToolbar={false}
                    readOnly={true}
                    forcedRankedCanvasIds={rankedCanvasIds}
                    isPoolRankedView={true}
                    isPoolBracketsPage
                    useGoalTotalsForScores
                    poolScoresSyncEpoch={poolScoresSyncEpoch}
                    onGameNavigate={handlePoolGameNavigate}
                  />
                </section>
              </div>
            ) : activeBracketView ? (
              <PlacementsBracket
                tournamentId={tournamentId}
                selectedDivision={selectedDivision}
                activeBracketView={activeBracketView}
                showToolbar={false}
                readOnly={true}
                forcedRankedCanvasIds={activeBracketView === 'ranked' ? rankedCanvasIds : undefined}
                isPoolRankedView={activeBracketView === 'ranked'}
                isPoolBracketsPage
                useGoalTotalsForScores
                poolScoresSyncEpoch={poolScoresSyncEpoch}
                onGameNavigate={handlePoolGameNavigate}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

export default PoolBracketsPage;
