import './home.css';
import { useState, useEffect, useMemo } from 'react';
import { configService } from '../services/configService';
import { useNavigate } from 'react-router-dom';
import { appPath } from '../config/appRoutes';
import Noauth_Navbar from '../components/noauth_Navbar';

function tournamentDateMs(t) {
  if (t.first_game_date != null && t.first_game_date !== '') {
    return new Date(t.first_game_date).getTime();
  }
  if (t.year != null && t.year !== '') {
    return new Date(Number(t.year), 0, 1).getTime();
  }
  if (t.created_at) {
    return new Date(t.created_at).getTime();
  }
  return 0;
}

function formatTournamentDate(dateVal) {
  if (dateVal == null || dateVal === '') return null;
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getTournamentTitleSizeClass(name) {
  const length = (name || '').trim().length;
  if (length > 50) return 'tournament_card_title--xlong';
  if (length > 35) return 'tournament_card_title--long';
  if (length > 22) return 'tournament_card_title--medium';
  return '';
}

function Home() {

  const navigate = useNavigate();

  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterName, setFilterName] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterYear, setFilterYear] = useState('');

  const countryOptions = useMemo(() => {
    const set = new Set();
    tournaments.forEach((t) => {
      const c = t.country != null ? String(t.country).trim() : '';
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [tournaments]);

  const yearOptions = useMemo(() => {
    const set = new Set();
    tournaments.forEach((t) => {
      if (t.year != null && t.year !== '') set.add(Number(t.year));
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [tournaments]);

  const filteredTournaments = useMemo(() => {
    const nameQ = filterName.trim().toLowerCase();
    return tournaments
      .filter((t) => {
        if (nameQ && !(t.name || '').toLowerCase().includes(nameQ)) return false;
        if (filterCountry && String(t.country || '').trim() !== filterCountry) return false;
        if (filterYear !== '' && Number(t.year) !== Number(filterYear)) return false;
        return true;
      })
      .sort((a, b) => tournamentDateMs(b) - tournamentDateMs(a));
  }, [tournaments, filterName, filterCountry, filterYear]);


  // Cargar torneos del usuario al montar el componente
  useEffect(() => {
    const loadTournaments = async () => {
      try {
        setLoading(true);
        const response = await configService.getTournaments();
        if (response.success) {
          setTournaments(response.data.tournaments || []);
        } else {
          setError('Error al cargar los torneos');
        }
      } catch (err) {
        console.error('Error al cargar torneos:', err);
        setError('Error al cargar los torneos. Asegúrate de estar autenticado.');
      } finally {
        setLoading(false);
      }
    };

    loadTournaments();
  }, []);

  return (
    <>
    <Noauth_Navbar showPublicNavLinks={false} />
    <div className='home_container'>
    <div className='body_container_home'>
      {loading ? (
        <div className='loading_message'>Cargando torneos...</div>
      ) : error ? (
        <div className='error_message'>{error}</div>
      ) : tournaments.length === 0 ? (
        <div className='empty_message'>
          <p>No tienes torneos creados aún.</p>
          <a href={appPath('/config')} className='create_tournament_link'>Crear tu primer torneo</a>
        </div>
      ) : (
        <main className="home_main">
          <div className="home_filters_bar" role="search">
            <label className="home_filter_field home_filter_name">
              <span className="home_filter_label">Nombre</span>
              <input
                type="search"
                className="home_filter_input"
                placeholder="Buscar por nombre"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="home_filter_field">
              <span className="home_filter_label">País</span>
              <select
                className="home_filter_select"
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
              >
                <option value="">Todos</option>
                {countryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="home_filter_field">
              <span className="home_filter_label">Año</span>
              <select
                className="home_filter_select"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
              >
                <option value="">Todos</option>
                {yearOptions.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </label>
          </div>
          {filteredTournaments.length === 0 ? (
            <div className="empty_message home_filter_empty">
              <p>No hay torneos que coincidan con los filtros.</p>
              <button type="button" className="home_filter_clear" onClick={() => { setFilterName(''); setFilterCountry(''); setFilterYear(''); }}>
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className='tournaments_grid'>
              {filteredTournaments.map((tournament) => {
                const fechaTorneo = formatTournamentDate(tournament.first_game_date);
                return (
                  <div key={tournament.torneo_id} className='tournament_card' onClick={() => navigate(`/tourn_home/${tournament.torneo_id}`)}>
                    {tournament.image_url ? (
                      <div className='tournament_card_image'>
                        <img
                          src={tournament.image_url}
                          alt={tournament.name}
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ) : (
                      <div className='tournament_card_placeholder'>
                        <span>Sin imagen</span>
                      </div>
                    )}
                    <div className='tournament_card_content'>
                      <h3 className={`tournament_card_title ${getTournamentTitleSizeClass(tournament.name)}`.trim()}>{tournament.name}</h3>
                      <div className='tournament_card_info'>
                        {fechaTorneo && (
                          <p className="tournament_card_date">{fechaTorneo}</p>
                        )}
                        <p className='tournament_card_year'>{tournament.year}</p>
                        {tournament.country && (
                          <p className='tournament_card_country'>{tournament.country}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}
    </div>
    </div>
    </>
  );
}

export default Home;