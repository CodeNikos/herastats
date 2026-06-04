import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { GiDrippingSword, GiRosaShield } from 'react-icons/gi';
import Navbar from '../components/navbar';
import Noauth_Navbar from '../components/noauth_Navbar';
import { useAuth } from '../hooks/useAuth';
import { configService } from '../services/configService';
import './game_events.css';

function GameEventsPage() {
  const { isAuthenticated } = useAuth();
  const hasToken = localStorage.getItem('token') !== null;
  const isUserAuthenticated = isAuthenticated || hasToken;
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const tournamentId = searchParams.get('tournamentId');
  const gameId = searchParams.get('gameId');
  const gameNum = searchParams.get('gameNum');
  const homeTeamId = searchParams.get('homeTeamId');
  const awayTeamId = searchParams.get('awayTeamId');
  const homeTeamName = searchParams.get('homeTeamName') || 'Equipo local';
  const awayTeamName = searchParams.get('awayTeamName') || 'Equipo visitante';
  const divisionParam = searchParams.get('division') || '';

  const [activeTeam, setActiveTeam] = useState('home');
  const [divisionFromApi, setDivisionFromApi] = useState('');
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [possession, setPossession] = useState('offense');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startLoading, setStartLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importFeedback, setImportFeedback] = useState('');
  const [excelPanelOpen, setExcelPanelOpen] = useState(false);
  const [mixRatioFirst, setMixRatioFirst] = useState(null);
  const fileInputRef = useRef(null);
  /** Fallback a `game.local` / `game.visitor` cuando la URL no trae equipo (previo al START). */
  const [effectiveHomeTeamId, setEffectiveHomeTeamId] = useState('');
  const [effectiveAwayTeamId, setEffectiveAwayTeamId] = useState('');

  useEffect(() => {
    if (!tournamentId || !gameId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await configService.getGames(tournamentId);
        const g = res?.data?.games?.find((x) => Number(x.game_id) === Number(gameId));
        if (!cancelled && g?.division != null && String(g.division).trim() !== '') {
          setDivisionFromApi(String(g.division).trim());
        }
      } catch {
        /* ignorar: se usa solo división por URL */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, gameId]);

  const effectiveDivision = divisionParam || divisionFromApi;
  const isMixtoDivision = useMemo(
    () => /mixto/i.test(String(effectiveDivision || '')),
    [effectiveDivision]
  );

  const loadPlayers = useCallback(async () => {
    if (!tournamentId) {
      setError('Falta el identificador del torneo.');
      setHomePlayers([]);
      setAwayPlayers([]);
      setEffectiveHomeTeamId('');
      setEffectiveAwayTeamId('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      let effHome =
        homeTeamId != null && String(homeTeamId).trim() !== '' ? String(homeTeamId).trim() : '';
      let effAway =
        awayTeamId != null && String(awayTeamId).trim() !== '' ? String(awayTeamId).trim() : '';

      /** Si la anotación no pasó equipo en URL (p. ej. playoff), usar local/visitor del game en BD. */
      if (gameId && (!effHome || !effAway)) {
        try {
          const gRes = await configService.getGames(tournamentId);
          if (gRes?.success) {
            const gm = (gRes.data?.games || []).find((row) => Number(row.game_id) === Number(gameId));
            if (gm) {
              if (!effHome && gm.local != null && String(gm.local).trim() !== '')
                effHome = String(gm.local).trim();
              if (!effAway && gm.visitor != null && String(gm.visitor).trim() !== '')
                effAway = String(gm.visitor).trim();
            }
          }
        } catch {
          /* sólo filtros por URL */
        }
      }

      const res = await configService.getPlayers(tournamentId);
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudieron cargar los jugadores.');
      }
      const all = res.data?.players || [];
      const homeList = effHome ? all.filter((p) => String(p.team_id) === effHome) : [];
      const awayList = effAway ? all.filter((p) => String(p.team_id) === effAway) : [];

      const byNumber = (a, b) => (Number(a.player_number) || 0) - (Number(b.player_number) || 0);
      setHomePlayers([...homeList].sort(byNumber));
      setAwayPlayers([...awayList].sort(byNumber));
      setEffectiveHomeTeamId(effHome);
      setEffectiveAwayTeamId(effAway);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Error al cargar jugadores.');
      setHomePlayers([]);
      setAwayPlayers([]);
      setEffectiveHomeTeamId('');
      setEffectiveAwayTeamId('');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, homeTeamId, awayTeamId, gameId]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const currentPlayers = activeTeam === 'home' ? homePlayers : awayPlayers;

  const liveHref = useMemo(() => {
    const p = new URLSearchParams();
    if (gameId) p.set('gameId', gameId);
    if (tournamentId) p.set('tournamentId', tournamentId);
    if (homeTeamId) p.set('homeTeamId', homeTeamId);
    if (awayTeamId) p.set('awayTeamId', awayTeamId);
    if (homeTeamName) p.set('homeTeamName', homeTeamName);
    if (awayTeamName) p.set('awayTeamName', awayTeamName);
    if (gameNum != null && String(gameNum).trim() !== '') p.set('gameNum', String(gameNum));
    const q = p.toString();
    return q ? `/live?${q}` : '/live';
  }, [gameId, tournamentId, homeTeamId, awayTeamId, homeTeamName, awayTeamName, gameNum]);

  const displayNumber = (player, index) => {
    const n = player.player_number;
    if (n != null && n !== '' && Number.isFinite(Number(n))) return Number(n);
    return index + 1;
  };

  const playerName = (p) => String(p.player_name || p.name || '—').trim() || '—';

  const rowKey = (p, index) => (p.player_id != null ? `p-${p.player_id}` : `idx-${index}`);

  const selectedTeamName = activeTeam === 'home' ? homeTeamName : awayTeamName;

  const offenseTeamId = useMemo(() => {
    const h = effectiveHomeTeamId !== '' ? Number(effectiveHomeTeamId) : NaN;
    const a = effectiveAwayTeamId !== '' ? Number(effectiveAwayTeamId) : NaN;
    if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
    if (possession === 'offense') {
      return activeTeam === 'home' ? h : a;
    }
    return activeTeam === 'home' ? a : h;
  }, [possession, activeTeam, effectiveHomeTeamId, effectiveAwayTeamId]);

  const handleStartMatch = async () => {
    if (!isUserAuthenticated) {
      alert('Inicia sesión para registrar el inicio del partido.');
      return;
    }
    if (!tournamentId || !gameId || offenseTeamId == null) {
      alert('Faltan datos del partido o del equipo en ataque.');
      return;
    }
    if (isMixtoDivision && (mixRatioFirst !== '3H4M' && mixRatioFirst !== '4H3M')) {
      alert('En categoría mixta debes elegir el ratio (Regla A) del primer gol antes de comenzar.');
      return;
    }
    setStartLoading(true);
    try {
      const res = await configService.createGameEvent(tournamentId, gameId, {
        event_type: 'START',
        event_time: '00:00:00',
        team_id: offenseTeamId
      });
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudo registrar el inicio.');
      }
      const patchOpts =
        isMixtoDivision && (mixRatioFirst === '3H4M' || mixRatioFirst === '4H3M')
          ? { mix_ratio_first: mixRatioFirst }
          : undefined;
      const estadoRes = await configService.patchGameEstado(tournamentId, gameId, 'Ongoing', patchOpts);
      if (!estadoRes?.success) {
        throw new Error(estadoRes?.message || 'El inicio se registró pero no se pudo actualizar el estado del partido.');
      }
      const url = liveHref.includes('?') ? `${liveHref}&started=1` : `${liveHref}?started=1`;
      navigate(url);
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Error al iniciar el partido.');
    } finally {
      setStartLoading(false);
    }
  };

  const canExcelActions = Boolean(isUserAuthenticated && tournamentId && gameId);
  const canStartMatch =
    !isMixtoDivision || mixRatioFirst === '3H4M' || mixRatioFirst === '4H3M';

  const handleDownloadTemplate = async () => {
    if (!canExcelActions) return;
    setTemplateLoading(true);
    setImportFeedback('');
    try {
      await configService.downloadGameEventsTemplate(tournamentId, gameId);
    } catch (e) {
      let msg = e.response?.data?.message || e.message || 'No se pudo descargar la plantilla.';
      if (e.response?.data instanceof Blob) {
        try {
          const t = await e.response.data.text();
          const j = JSON.parse(t);
          if (j.message) msg = j.message;
        } catch {
          /* mantener msg */
        }
      }
      setImportFeedback(String(msg));
    } finally {
      setTemplateLoading(false);
    }
  };

  const handlePickImportFile = () => {
    if (!canExcelActions || importLoading) return;
    fileInputRef.current?.click();
  };

  const handleImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canExcelActions) return;
    setImportLoading(true);
    setImportFeedback('');
    try {
      const res = await configService.importGameEventsFromExcel(tournamentId, gameId, file);
      const data = res?.data;
      const failed = data?.failed ?? 0;
      const msg = res?.message || (res?.success ? 'Importación completada.' : 'Importación con errores.');
      let detail = msg;
      if (data?.results?.length && failed > 0) {
        const errs = data.results
          .filter((r) => !r.success)
          .slice(0, 5)
          .map((r) => `Fila ${r.row}: ${r.message}`)
          .join(' · ');
        detail = `${msg}${errs ? ` ${errs}` : ''}`;
      }
      setImportFeedback(detail);
    } catch (err) {
      setImportFeedback(
        err.response?.data?.message || err.message || 'No se pudo importar el archivo.'
      );
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="game-events-page">
      <div className="game-events-topbar">{isUserAuthenticated ? <Navbar /> : <Noauth_Navbar />}</div>

      <main className="game-events-main">
        <header className="game-events-header">
          <Link className="game-events-back-btn" to="/anotacion">
            <span className="game-events-back-btn-icon" aria-hidden="true">
              ←
            </span>
            Volver a anotaciones
          </Link>
          <h1 className="game-events-title">Previo al partido</h1>
          {gameNum != null && String(gameNum).trim() !== '' ? (
            <p className="game-events-sub">Partido #{gameNum}</p>
          ) : gameId ? (
            <p className="game-events-sub">Partido #{gameId}</p>
          ) : null}
          {canExcelActions ? (
            <div className="game-events-excel-block">
              <button
                type="button"
                className="game-events-excel-toggle"
                id="game-events-excel-toggle"
                aria-expanded={excelPanelOpen}
                aria-controls="game-events-excel-panel"
                onClick={() => setExcelPanelOpen((open) => !open)}
              >
                <span className="game-events-excel-toggle-text">Eventos por plantilla</span>
                <span className="game-events-excel-toggle-chevron" aria-hidden>
                  {excelPanelOpen ? '▲' : '▼'}
                </span>
              </button>
              {excelPanelOpen ? (
                <div
                  id="game-events-excel-panel"
                  className="game-events-excel"
                  role="region"
                  aria-labelledby="game-events-excel-toggle"
                >
                  <div className="game-events-excel-actions">
                    <button
                      type="button"
                      className="game-events-excel-btn"
                      onClick={handleDownloadTemplate}
                      disabled={templateLoading || importLoading}
                    >
                      {templateLoading ? 'Descargando…' : 'Descargar plantilla'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="game-events-excel-file"
                      onChange={handleImportFileChange}
                      aria-hidden
                    />
                    <button
                      type="button"
                      className="game-events-excel-btn"
                      onClick={handlePickImportFile}
                      disabled={importLoading || templateLoading}
                    >
                      {importLoading ? 'Importando…' : 'Subir archivo Excel'}
                    </button>
                  </div>
                  {importFeedback ? (
                    <p className="game-events-excel-feedback" role="status">
                      {importFeedback}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </header>

        {loading ? <div className="game-events-state">Cargando jugadores...</div> : null}
        {!loading && error ? <div className="game-events-state game-events-state-error">{error}</div> : null}

        {!loading && !error ? (
          <section className="game-events-card" aria-label="Rosters y posesión inicial">
            <div className="game-events-team-tabs" role="tablist" aria-label="Seleccionar equipo">
              <button
                type="button"
                role="tab"
                aria-selected={activeTeam === 'home'}
                className={`game-events-tab ${activeTeam === 'home' ? 'game-events-tab--active' : ''}`}
                onClick={() => setActiveTeam('home')}
              >
                {homeTeamName}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTeam === 'away'}
                className={`game-events-tab ${activeTeam === 'away' ? 'game-events-tab--active' : ''}`}
                onClick={() => setActiveTeam('away')}
              >
                {awayTeamName}
              </button>
            </div>

            <div className="game-events-panel" role="tabpanel">
              {currentPlayers.length === 0 ? (
                <p className="game-events-empty">No hay jugadores registrados para este equipo en el torneo.</p>
              ) : null}
              <ul className="game-events-player-list">
                {currentPlayers.map((player, index) => (
                  <li key={rowKey(player, index)} className="game-events-player-row">
                    <span className="game-events-player-index">{displayNumber(player, index)}</span>
                    <span className="game-events-player-name">{playerName(player)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="game-events-possession">
              <p className="game-events-section-label">Posesión inicial</p>
              <div className="game-events-possession-btns">
                <button
                  type="button"
                  className={`game-events-big-pick ${possession === 'offense' ? 'game-events-big-pick--active' : ''}`}
                  onClick={() => setPossession('offense')}
                >
                  <span className="game-events-big-pick-icon" aria-hidden>
                    <GiDrippingSword className="game-events-big-pick-icon-svg" aria-hidden />
                  </span>
                  <span className="game-events-big-pick-label">Ataque</span>
                </button>
                <button
                  type="button"
                  className={`game-events-big-pick ${possession === 'defense' ? 'game-events-big-pick--active' : ''}`}
                  onClick={() => setPossession('defense')}
                >
                  <span className="game-events-big-pick-icon" aria-hidden>
                    <GiRosaShield className="game-events-big-pick-icon-svg" aria-hidden />
                  </span>
                  <span className="game-events-big-pick-label">Defensa</span>
                </button>
              </div>
              <p className="game-events-possession-hint">
                {possession === 'offense'
                  ? `${selectedTeamName} recibe el disco`
                  : 'El rival inicia con el disco'}
              </p>
            </div>

            {isMixtoDivision ? (
              <div className="game-events-ratio" aria-label="Ratio regla A">
                <p className="game-events-section-label">Ratio - Regla A</p>
                <div className="game-events-ratio-btns">
                  <button
                    type="button"
                    className={`game-events-ratio-pick ${
                      mixRatioFirst === '3H4M' ? 'game-events-ratio-pick--active' : ''
                    }`}
                    onClick={() => setMixRatioFirst('3H4M')}
                  >
                    <img
                      className="game-events-ratio-img"
                      src="/3h_4m.jpg"
                      alt="Formación 3 hombres, 4 mujeres"
                    />
                  </button>
                  <button
                    type="button"
                    className={`game-events-ratio-pick ${
                      mixRatioFirst === '4H3M' ? 'game-events-ratio-pick--active' : ''
                    }`}
                    onClick={() => setMixRatioFirst('4H3M')}
                  >
                    <img
                      className="game-events-ratio-img"
                      src="/4h_3m.jpg"
                      alt="Formación 4 hombres, 3 mujeres"
                    />
                  </button>
                </div>
                <p className="game-events-ratio-hint" aria-live="polite">
                  {mixRatioFirst === '3H4M'
                    ? '4 mujeres 3 hombres'
                    : mixRatioFirst === '4H3M'
                      ? '4 hombres 3 mujeres'
                      : '\u00A0'}
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {!loading && !error ? (
          <div className="game-events-footer-actions">
            <button
              type="button"
              className="game-events-start"
              onClick={handleStartMatch}
              disabled={startLoading || !canStartMatch}
            >
              {startLoading ? 'Iniciando…' : 'Comenzar partido'}
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default GameEventsPage;
