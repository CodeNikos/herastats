import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import Navbar from '../components/navbar';
import TournamentBracket from '../components/TournamentBracket';
import PlacementsBracket from '../components/PlacementsBracket';
import { configService } from '../services/configService';
import './brackets.css';

/** Cada tarjeta de partido (PlacementsBracket) muestra fecha, hora y ubicación alineadas en la misma fila. */

function BracketsPage() {
  const { id: routeTournamentId } = useParams();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const queryTournamentId = queryParams.get('tournamentId');
  const tournamentId = routeTournamentId || queryTournamentId;
  const isPoolMode = location.pathname.startsWith('/poolbrackets');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [activeBracketView, setActiveBracketView] = useState('all');
  const [rankedCanvasList, setRankedCanvasList] = useState([]);
  const rankedCanvasIds = useMemo(
    () => rankedCanvasList.map((canvas) => String(canvas.id)).filter(Boolean),
    [rankedCanvasList]
  );

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
  }, [tournamentId, selectedDivision, activeBracketView]);

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
              En el lienzo <strong>Principal</strong> y en <strong>Posicionamiento</strong>, las columnas <strong>Loc.</strong>/{' '}
              <strong>Vis.</strong> admiten la posición del grupo según estadísticas (p. ej. <strong>1A</strong> o <strong>
                3B
              </strong>
              ). En el mismo campo puedes indicar ganador o perdedor de otro partido ya creado con el formato{' '}
              <strong>W</strong>/<strong>L</strong> + número de juego (&quot;<strong>Juego N</strong>&quot; de la tarjeta), por
              ejemplo <strong>W12</strong> o <strong>L73</strong>. También puedes usar <strong>Elegir equipo fijo</strong> si
              no quieres slot. El nombre visible se actualiza con la tabla o con el resultado del origen cuando el partido fuente ya
              tiene marcador definitivo distinto del empate (empates siguen como &quot;Por definir&quot;). También sirve{' '}
              <strong>Conectar lineas manualmente</strong> como alternativa entre fases. Al guardar, la vista pública{' '}
              <strong>Pool &amp; Brackets</strong> puede actualizarse en la misma pestaña o en otras abiertas.
            </p>
          ) : null}
        </header>

        {!tournamentId ? (
          <section className="brackets-empty">Selecciona un torneo para visualizar el bracket.</section>
        ) : (
          <>
            <TournamentBracket
              tournamentId={tournamentId}
              selectedDivision={selectedDivision}
              onDivisionChange={setSelectedDivision}
              activeBracketView={activeBracketView}
              onBracketViewChange={setActiveBracketView}
            />
            {activeBracketView === 'all' ? (
              <div className="brackets-stacked-list">
                <section className="brackets-main-canvas-block">
                  <h3 className="brackets-ranked-canvas-title">Principal</h3>
                  <PlacementsBracket
                    tournamentId={tournamentId}
                    selectedDivision={selectedDivision}
                    activeBracketView="main"
                    showToolbar={!isPoolMode}
                    readOnly={isPoolMode}
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
                forcedRankedCanvasIds={activeBracketView === 'ranked' ? rankedCanvasIds : undefined}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

export default BracketsPage;
