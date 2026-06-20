import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import Navbar from '../components/navbar';
import SeoHead from '../components/SeoHead';
import { useAuth } from '../hooks/useAuth';
import { analyticsService } from '../services/analyticsService';
import { isSuperuser } from '../utils/userRoles';
import './analytics.css';

const defaultRange = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  };
};

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('es', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  } catch {
    return String(value);
  }
}

function formatDayLabel(day) {
  if (!day) return '';
  try {
    return new Date(`${day}T12:00:00`).toLocaleDateString('es', {
      day: '2-digit',
      month: 'short'
    });
  } catch {
    return String(day);
  }
}

const AnalyticsDashboard = () => {
  const { user, loading, isAuthenticated } = useAuth();
  const [range, setRange] = useState(defaultRange);
  const [summary, setSummary] = useState(null);
  const [timeseries, setTimeseries] = useState([]);
  const [visits, setVisits] = useState([]);
  const [visitsTotal, setVisitsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loadingData, setLoadingData] = useState(true);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !isSuperuser(user)) return;
    try {
      setLoadingData(true);
      setError('');
      const params = {
        from: `${range.from}T00:00:00.000Z`,
        to: `${range.to}T23:59:59.999Z`
      };

      const [summaryRes, timeseriesRes, visitsRes] = await Promise.all([
        analyticsService.getSummary(params),
        analyticsService.getTimeseries(params),
        analyticsService.getVisits({ ...params, page, limit: 25 })
      ]);

      setSummary(summaryRes?.data || null);
      setTimeseries(timeseriesRes?.data?.rows || []);
      setVisits(visitsRes?.data?.rows || []);
      setVisitsTotal(visitsRes?.data?.total || 0);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron cargar las métricas');
    } finally {
      setLoadingData(false);
    }
  }, [isAuthenticated, user, range, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return null;
  if (!isAuthenticated || !isSuperuser(user)) {
    return <Navigate to="/home" replace />;
  }

  const totals = summary?.totals || {};
  const topCountries = summary?.topCountries || [];
  const topPaths = summary?.topPaths || [];
  const maxCountryVisits = topCountries[0]?.visits || 1;

  return (
    <div className="analytics-page">
      <SeoHead title="Visitas del sitio | Herastats" description="Panel interno de analytics." pathname="/analytics" noindex />
      <Navbar />
      <main className="analytics-content">
        <header className="analytics-header">
          <h1>Visitas del sitio</h1>
          <p>Registro agregado de páginas públicas. Los bots se excluyen de las métricas.</p>
        </header>

        <div className="analytics-filters">
          <label>
            Desde
            <input
              type="date"
              value={range.from}
              onChange={(e) => {
                setPage(1);
                setRange((prev) => ({ ...prev, from: e.target.value }));
              }}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={range.to}
              onChange={(e) => {
                setPage(1);
                setRange((prev) => ({ ...prev, to: e.target.value }));
              }}
            />
          </label>
          <button type="button" className="analytics-refresh-btn" onClick={loadData}>
            Actualizar
          </button>
        </div>

        {error ? <div className="analytics-error">{error}</div> : null}
        {loadingData ? <div className="analytics-loading">Cargando métricas…</div> : null}

        {!loadingData && !error ? (
          <>
            <section className="analytics-kpi-grid">
              <article className="analytics-kpi-card">
                <span className="analytics-kpi-label">Hoy</span>
                <strong>{totals.today ?? 0}</strong>
              </article>
              <article className="analytics-kpi-card">
                <span className="analytics-kpi-label">Últimos 7 días</span>
                <strong>{totals.last_7d ?? 0}</strong>
              </article>
              <article className="analytics-kpi-card">
                <span className="analytics-kpi-label">Últimos 30 días</span>
                <strong>{totals.last_30d ?? 0}</strong>
              </article>
              <article className="analytics-kpi-card">
                <span className="analytics-kpi-label">En rango (únicas)</span>
                <strong>
                  {totals.filtered_total ?? 0}
                  <small> / {totals.unique_visitors ?? 0} visitantes</small>
                </strong>
              </article>
              <article className="analytics-kpi-card">
                <span className="analytics-kpi-label">Países distintos</span>
                <strong>{totals.countries ?? 0}</strong>
              </article>
            </section>

            <section className="analytics-panel">
              <h2>Visitas por día</h2>
              {timeseries.length === 0 ? (
                <p className="analytics-empty">Sin datos en el rango seleccionado.</p>
              ) : (
                <div className="analytics-chart-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={timeseries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="day" tickFormatter={formatDayLabel} />
                      <YAxis allowDecimals={false} />
                      <Tooltip
                        labelFormatter={formatDayLabel}
                        formatter={(value, name) => [
                          value,
                          name === 'unique_visitors' ? 'Visitantes únicos' : 'Visitas'
                        ]}
                      />
                      <Line type="monotone" dataKey="visits" stroke="#3d7a5f" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="unique_visitors" stroke="#1f2a44" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <div className="analytics-split">
              <section className="analytics-panel">
                <h2>Top países</h2>
                {topCountries.length === 0 ? (
                  <p className="analytics-empty">Sin datos de país (activa Cloudflare o GeoIP).</p>
                ) : (
                  <ul className="analytics-bar-list">
                    {topCountries.map((row) => (
                      <li key={row.country_code}>
                        <span className="analytics-bar-label">
                          {row.country_name || row.country_code}
                        </span>
                        <span className="analytics-bar-track">
                          <span
                            className="analytics-bar-fill"
                            style={{ width: `${Math.round((row.visits / maxCountryVisits) * 100)}%` }}
                          />
                        </span>
                        <span className="analytics-bar-value">{row.visits}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="analytics-panel">
                <h2>Top rutas</h2>
                {topPaths.length === 0 ? (
                  <p className="analytics-empty">Sin rutas registradas.</p>
                ) : (
                  <ul className="analytics-path-list">
                    {topPaths.map((row) => (
                      <li key={row.path}>
                        <code>{row.path}</code>
                        <span>{row.visits}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="analytics-panel">
              <h2>Visitas recientes</h2>
              <div className="analytics-table-wrap">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Ruta</th>
                      <th>País</th>
                      <th>Referrer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((visit) => (
                      <tr key={visit.id}>
                        <td>{formatDateTime(visit.visited_at)}</td>
                        <td>
                          <code>
                            {visit.path}
                            {visit.query_string ? `?${visit.query_string}` : ''}
                          </code>
                        </td>
                        <td>{visit.country_name || visit.country_code || '—'}</td>
                        <td className="analytics-referrer">
                          {visit.referrer ? (
                            <a href={visit.referrer} target="_blank" rel="noreferrer noopener">
                              {visit.referrer}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visitsTotal > 25 ? (
                <div className="analytics-pagination">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {page} · {visitsTotal} registros
                  </span>
                  <button
                    type="button"
                    disabled={page * 25 >= visitsTotal}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
};

export default AnalyticsDashboard;
