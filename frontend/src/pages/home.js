import './home.css';
import { useState, useEffect, useMemo } from 'react';
import { configService } from '../services/configService';
import { authService } from '../services/authService';
import { sportsService } from '../services/sportsService';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { isAdmin } from '../utils/userRoles';
import Noauth_Navbar from '../components/noauth_Navbar';
import SeoHead from '../components/SeoHead';
import { DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_TITLE } from '../config/siteConfig';
import { buildWebSiteJsonLd } from '../utils/seoJsonLd';

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

const EMPTY_CREATE_FORM = {
  torn_name: '',
  torn_year: String(new Date().getFullYear()),
  pais: '',
  sport_id: '',
};

function Home() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const userIsAdmin = isAdmin(user);

  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterName, setFilterName] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSport, setFilterSport] = useState('');

  const [creationEligibility, setCreationEligibility] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [sports, setSports] = useState([]);
  const [loadingSports, setLoadingSports] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const canCreateTournament =
    isAuthenticated &&
    userIsAdmin &&
    creationEligibility?.can_create &&
    (creationEligibility?.tokens_available || 0) > 0;

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

  const sportOptions = useMemo(() => {
    const byId = new Map();
    tournaments.forEach((t) => {
      if (t.sport_id == null || t.sport_id === '') return;
      const id = String(t.sport_id);
      const label = (t.sport_name || '').trim() || `Deporte #${id}`;
      if (!byId.has(id)) byId.set(id, label);
    });
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [tournaments]);

  const filteredTournaments = useMemo(() => {
    const nameQ = filterName.trim().toLowerCase();
    return tournaments
      .filter((t) => {
        if (nameQ && !(t.name || '').toLowerCase().includes(nameQ)) return false;
        if (filterCountry && String(t.country || '').trim() !== filterCountry) return false;
        if (filterYear !== '' && Number(t.year) !== Number(filterYear)) return false;
        if (filterSport !== '' && String(t.sport_id ?? '') !== filterSport) return false;
        return true;
      })
      .sort((a, b) => tournamentDateMs(b) - tournamentDateMs(a));
  }, [tournaments, filterName, filterCountry, filterYear, filterSport]);

  const loadTournaments = async () => {
    try {
      setLoading(true);
      setError(null);
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

  const loadCreationEligibility = async () => {
    if (!isAuthenticated || !userIsAdmin) {
      setCreationEligibility(null);
      return;
    }
    try {
      const response = await authService.getTournamentCreationEligibility();
      setCreationEligibility(response?.data || null);
    } catch {
      setCreationEligibility(null);
    }
  };

  useEffect(() => {
    loadTournaments();
  }, []);

  useEffect(() => {
    loadCreationEligibility();
  }, [isAuthenticated, userIsAdmin, user?.id]);

  const openCreateModal = async () => {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateError('');
    setCreateSuccess('');
    setCreateModalOpen(true);
    setLoadingSports(true);
    try {
      const response = await sportsService.getSports();
      const list = response?.data?.sports || [];
      setSports(list);
      if (list.length === 1) {
        setCreateForm((prev) => ({ ...prev, sport_id: String(list[0].sport_id) }));
      }
    } catch {
      setSports([]);
      setCreateError('No se pudieron cargar los deportes disponibles.');
    } finally {
      setLoadingSports(false);
    }
  };

  const handleCreateChange = (event) => {
    const { name, value } = event.target;
    setCreateForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateTournament = async (event) => {
    event.preventDefault();
    setCreateError('');
    setCreateSuccess('');

    if (!createForm.sport_id) {
      setCreateError('Selecciona un deporte');
      return;
    }
    if (!createForm.torn_name.trim()) {
      setCreateError('El nombre del torneo es obligatorio');
      return;
    }

    setCreating(true);
    try {
      const result = await configService.createTournament({
        torn_name: createForm.torn_name.trim(),
        torn_year: Number(createForm.torn_year),
        pais: createForm.pais.trim() || undefined,
        sport_id: Number(createForm.sport_id),
      });

      if (result?.success) {
        const newId = result.data?.tournament?.id;
        setCreateModalOpen(false);
        await loadTournaments();
        await loadCreationEligibility();
        if (newId) {
          navigate(`/config/${newId}`);
        }
      } else {
        setCreateError(result?.message || 'No se pudo crear el torneo');
      }
    } catch (err) {
      setCreateError(err.response?.data?.message || 'No se pudo crear el torneo');
    } finally {
      setCreating(false);
    }
  };

  const renderTournamentGrid = () => (
    <>
      {tournaments.length > 0 && (
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
            <span className="home_filter_label">Deporte</span>
            <select
              className="home_filter_select"
              value={filterSport}
              onChange={(e) => setFilterSport(e.target.value)}
            >
              <option value="">Todos</option>
              {sportOptions.map((sport) => (
                <option key={sport.id} value={sport.id}>{sport.name}</option>
              ))}
            </select>
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
      )}

      {tournaments.length > 0 && filteredTournaments.length === 0 ? (
        <div className="empty_message home_filter_empty">
          <p>No hay torneos que coincidan con los filtros.</p>
          <button
            type="button"
            className="home_filter_clear"
            onClick={() => {
              setFilterName('');
              setFilterCountry('');
              setFilterYear('');
              setFilterSport('');
            }}
          >
            Limpiar filtros
          </button>
        </div>
      ) : filteredTournaments.length > 0 ? (
        <div className="tournaments_grid">
          {filteredTournaments.map((tournament) => {
            const fechaTorneo = formatTournamentDate(tournament.first_game_date);
            return (
              <div
                key={tournament.torneo_id}
                className="tournament_card"
                onClick={() => navigate(`/tourn_home/${tournament.torneo_id}`)}
              >
                {tournament.image_url ? (
                  <div className="tournament_card_image">
                    <img
                      src={tournament.image_url}
                      alt={tournament.name}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ) : (
                  <div className="tournament_card_placeholder">
                    <span>Sin imagen</span>
                  </div>
                )}
                <div className="tournament_card_content">
                  {tournament.sport_name && (
                    <span className="tournament_card_sport">{tournament.sport_name}</span>
                  )}
                  <h3
                    className={`tournament_card_title ${getTournamentTitleSizeClass(tournament.name)}`.trim()}
                  >
                    {tournament.name}
                  </h3>
                  <div className="tournament_card_info">
                    {fechaTorneo && (
                      <p className="tournament_card_date">{fechaTorneo}</p>
                    )}
                    <p className="tournament_card_year">{tournament.year}</p>
                    {tournament.country && (
                      <p className="tournament_card_country">{tournament.country}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty_message">
          <p>No tienes torneos creados aún.</p>
          {canCreateTournament && (
            <p className="home_empty_hint">
              Tienes {creationEligibility.tokens_available} token
              {creationEligibility.tokens_available === 1 ? '' : 's'} para crear un torneo.
            </p>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      <SeoHead
        title={`${DEFAULT_SITE_TITLE} — Estadísticas y torneos deportivos`}
        description={DEFAULT_SITE_DESCRIPTION}
        pathname="/home"
        jsonLd={buildWebSiteJsonLd()}
      />
      <Noauth_Navbar showPublicNavLinks={false} />
      <div className="home_container">
        <div className="body_container_home">
          {canCreateTournament && (
            <section className="home_create_banner">
              <div className="home_create_banner_text">
                <h2 className="home_create_banner_title">¿Listo para un nuevo torneo?</h2>
                <p className="home_create_banner_desc">
                  Tienes{' '}
                  <strong>{creationEligibility.tokens_available}</strong>{' '}
                  token{creationEligibility.tokens_available === 1 ? '' : 's'} disponible
                  {creationEligibility.tokens_available === 1 ? '' : 's'}.
                  Elige el deporte y configura tu evento en pocos pasos.
                </p>
              </div>
              <button
                type="button"
                className="home_create_tournament_btn"
                onClick={openCreateModal}
              >
                <span className="home_create_tournament_btn_icon" aria-hidden>+</span>
                Crear torneo
              </button>
            </section>
          )}

          {loading ? (
            <div className="loading_message">Cargando torneos...</div>
          ) : error ? (
            <div className="error_message">{error}</div>
          ) : (
            <main className="home_main">{renderTournamentGrid()}</main>
          )}
        </div>
      </div>

      {createModalOpen && (
        <div
          className="home_create_modal_overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !creating) setCreateModalOpen(false);
          }}
        >
          <div
            className="home_create_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-create-tournament-title"
          >
            <h2 id="home-create-tournament-title" className="home_create_modal_title">
              Nuevo torneo
            </h2>
            <p className="home_create_modal_subtitle">
              Selecciona el deporte y completa los datos básicos. Se usará uno de tus tokens
              disponibles.
            </p>

            {createError && <div className="home_create_modal_error">{createError}</div>}
            {createSuccess && <div className="home_create_modal_success">{createSuccess}</div>}

            <form onSubmit={handleCreateTournament}>
              <label className="home_create_label" htmlFor="create-sport">
                Deporte
              </label>
              <select
                id="create-sport"
                className="home_create_input"
                name="sport_id"
                value={createForm.sport_id}
                onChange={handleCreateChange}
                required
                disabled={creating || loadingSports}
              >
                <option value="">
                  {loadingSports ? 'Cargando deportes…' : 'Selecciona un deporte'}
                </option>
                {sports.map((sport) => (
                  <option key={sport.sport_id} value={String(sport.sport_id)}>
                    {sport.name}
                    {sport.brief_description ? ` — ${sport.brief_description}` : ''}
                  </option>
                ))}
              </select>

              <label className="home_create_label" htmlFor="create-name">
                Nombre del torneo
              </label>
              <input
                id="create-name"
                className="home_create_input"
                type="text"
                name="torn_name"
                value={createForm.torn_name}
                onChange={handleCreateChange}
                placeholder="Ej. Torneo Nacional 2026"
                required
                disabled={creating}
              />

              <label className="home_create_label" htmlFor="create-year">
                Año
              </label>
              <input
                id="create-year"
                className="home_create_input"
                type="number"
                name="torn_year"
                value={createForm.torn_year}
                onChange={handleCreateChange}
                min={1900}
                max={2100}
                required
                disabled={creating}
              />

              <label className="home_create_label" htmlFor="create-country">
                País (opcional)
              </label>
              <input
                id="create-country"
                className="home_create_input"
                type="text"
                name="pais"
                value={createForm.pais}
                onChange={handleCreateChange}
                placeholder="Ej. Argentina"
                disabled={creating}
              />

              <div className="home_create_modal_actions">
                <button
                  type="button"
                  className="home_create_modal_btn home_create_modal_btn_secondary"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="home_create_modal_btn home_create_modal_btn_primary"
                  disabled={creating || loadingSports || sports.length === 0}
                >
                  {creating ? 'Creando…' : 'Crear torneo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Home;
