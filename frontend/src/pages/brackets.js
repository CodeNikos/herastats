import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from '../components/navbar';
import FifaR32ThirdPlacePanel from '../components/FifaR32ThirdPlacePanel';
import { useResolvedTournamentId } from '../hooks/useResolvedTournamentId';
import TournamentBracket from '../components/TournamentBracket';
import PlacementsBracket from '../components/PlacementsBracket';
import { useTournamentSport } from '../hooks/useTournamentSport';
import { usesFifaWorldCupBracketAutoSlots } from '../utils/footballBracketSlotPolicy';
import { configService } from '../services/configService';
import './brackets.css';

function BracketsPage() {
  const location = useLocation();
  const tournamentId = useResolvedTournamentId();
  const isPoolMode = location.pathname.startsWith('/poolbrackets');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [activeBracketView, setActiveBracketView] = useState('all');
  const [rankedCanvasList, setRankedCanvasList] = useState([]);
  const { isFootballTournament, sportId } = useTournamentSport(tournamentId);
  const isFifaWorldCupBracket = usesFifaWorldCupBracketAutoSlots({ tournamentId, sportId });
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
          {tournamentId && !isFifaWorldCupBracket ? (
            <p className="brackets-stats-slots-hint">
              {isFootballTournament ? (
                <>
                  En el lienzo <strong>Principal</strong>, configura los cruces en <strong>Loc.</strong> /{' '}
                  <strong>Vis.</strong> (<strong>1A</strong>, <strong>2B</strong>, <strong>1C</strong>,{' '}
                  <strong>2F</strong>…). En fases siguientes usa <strong>W12</strong>/<strong>L7</strong> o{' '}
                  <strong>Conectar lineas manualmente</strong>.
                </>
              ) : (
                <>
                  En el lienzo <strong>Principal</strong> y en <strong>Posicionamiento</strong>, las columnas{' '}
                  <strong>Loc.</strong>/<strong>Vis.</strong> admiten la posición del grupo según estadísticas (p. ej.{' '}
                  <strong>1A</strong> o <strong>3B</strong>). En el mismo campo puedes indicar ganador o perdedor de otro
                  partido ya creado con el formato <strong>W</strong>/<strong>L</strong> + número de juego
                  (&quot;<strong>Juego N</strong>&quot; de la tarjeta), por ejemplo <strong>W12</strong> o <strong>L73</strong>.
                  También puedes usar <strong>Elegir equipo fijo</strong> si no quieres slot. El nombre visible se actualiza
                  con la tabla o con el resultado del origen cuando el partido fuente ya tiene marcador definitivo distinto del
                  empate (empates siguen como &quot;Por definir&quot;). También sirve <strong>Conectar lineas manualmente</strong>{' '}
                  como alternativa entre fases. Al guardar, la vista pública <strong>Pool &amp; Brackets</strong> puede
                  actualizarse en la misma pestaña o en otras abiertas.
                </>
              )}
            </p>
          ) : null}
        </header>

        {!tournamentId ? (
          <section className="brackets-empty">Selecciona un torneo para visualizar el bracket.</section>
        ) : (
          <>
            {isFifaWorldCupBracket && !isPoolMode ? (
              <FifaR32ThirdPlacePanel tournamentId={tournamentId} division={selectedDivision} />
            ) : null}
            <TournamentBracket
              tournamentId={tournamentId}
              selectedDivision={selectedDivision}
              onDivisionChange={setSelectedDivision}
              activeBracketView={isFifaWorldCupBracket ? 'main' : activeBracketView}
              onBracketViewChange={isFifaWorldCupBracket ? undefined : setActiveBracketView}
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
                    sportId={sportId}
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
                    sportId={sportId}
                  />
                </section>
              </div>
            ) : activeBracketView || isFifaWorldCupBracket ? (
              <PlacementsBracket
                tournamentId={tournamentId}
                selectedDivision={selectedDivision}
                activeBracketView={isFifaWorldCupBracket ? 'main' : activeBracketView}
                showToolbar={!isPoolMode && !isFifaWorldCupBracket}
                showRankedCanvasToolbar={!isFifaWorldCupBracket && activeBracketView !== 'ranked'}
                stickyRankedPhaseAddButtons={!isFifaWorldCupBracket && activeBracketView === 'ranked'}
                readOnly={isPoolMode}
                forcedRankedCanvasIds={
                  !isFootballTournament && activeBracketView === 'ranked' ? rankedCanvasIds : undefined
                }
                isFootballTournament={isFootballTournament}
                sportId={sportId}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

export default BracketsPage;
