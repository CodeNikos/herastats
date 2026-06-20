import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import Config from './pages/config';
import GamePages from './pages/GamePages';
import Home from './pages/home';
import Tourn_home from './pages/Tourn_home';
import Team from './pages/team';
import Players from './pages/players';
import GroupsConfig from './pages/groupsconfig';
import StatsPage from './pages/stats';
import TeamPlayersPage from './pages/team_players';
import CalendarPage from './pages/calendar';
import CalendarConfigPage from './pages/calendarconfig';
import AnotacionPage from './pages/anotacion';
import GameEventsPage from './pages/game_events';
import FootballEventsPage from './pages/football_events';
import LivePage from './pages/live';
import BracketsPage from './pages/brackets';
import PoolBracketsPage from './pages/poolbrackets';
import SpiritSurveyPage from './pages/spirit_survey';
import UsersPage from './pages/users';
import SportsPage from './pages/sports';
import SetPasswordPage from './pages/set_password';
import AppShell from './components/AppShell';
import { useAuth } from './hooks/useAuth';
import { userHasAnyRole } from './utils/userRoles';
import './styles/index.css';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    if (!userHasAnyRole(user, allowedRoles)) {
      return <Navigate to="/home" replace />;
    }
  }

  return children;
}


function App() {
  const adminRoles = ['admin', 'superuser'];
  const authenticatedRoles = ['anotador', 'admin', 'superuser'];

  return (
    <Router>
      <AppShell>
        <div className="App">
          <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<Navigate to="/analytics" replace />} />
          <Route path="/analytics" element={<ProtectedRoute allowedRoles={['superuser']}><AnalyticsDashboard /></ProtectedRoute>} />
          <Route path="/game" element={<GamePages />} />
          <Route path="/config/:id" element={<ProtectedRoute allowedRoles={adminRoles}><Config /></ProtectedRoute>} />
          <Route path="/config" element={<ProtectedRoute allowedRoles={adminRoles}><Config /></ProtectedRoute>} />
          <Route path="/team" element={<ProtectedRoute allowedRoles={adminRoles}><Team /></ProtectedRoute>} />
          <Route path="/players" element={<ProtectedRoute allowedRoles={adminRoles}><Players /></ProtectedRoute>} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/anotacion" element={<ProtectedRoute allowedRoles={authenticatedRoles}><AnotacionPage /></ProtectedRoute>} />
          <Route path="/game_events" element={<ProtectedRoute allowedRoles={authenticatedRoles}><GameEventsPage /></ProtectedRoute>} />
          <Route path="/football_events" element={<ProtectedRoute allowedRoles={adminRoles}><FootballEventsPage /></ProtectedRoute>} />
          <Route path="/live" element={<ProtectedRoute allowedRoles={authenticatedRoles}><LivePage /></ProtectedRoute>} />
          <Route path="/spirit-survey" element={<SpiritSurveyPage />} />
          <Route path="/users" element={<ProtectedRoute allowedRoles={['superuser']}><UsersPage /></ProtectedRoute>} />
          <Route path="/sports" element={<ProtectedRoute allowedRoles={['superuser']}><SportsPage /></ProtectedRoute>} />
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route path="/calendarconfig" element={<ProtectedRoute allowedRoles={adminRoles}><CalendarConfigPage /></ProtectedRoute>} />
          <Route path="/groupsconfig" element={<ProtectedRoute allowedRoles={adminRoles}><GroupsConfig /></ProtectedRoute>} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/team_players/:tournamentId/:teamId" element={<ProtectedRoute allowedRoles={adminRoles}><TeamPlayersPage /></ProtectedRoute>} />
          <Route path="/brackets" element={<ProtectedRoute allowedRoles={adminRoles}><BracketsPage /></ProtectedRoute>} />
          <Route path="/brackets/:id" element={<ProtectedRoute allowedRoles={adminRoles}><BracketsPage /></ProtectedRoute>} />
          <Route path="/poolbrackets" element={<PoolBracketsPage />} />
          <Route path="/poolbrackets/:id" element={<PoolBracketsPage />} />
          <Route path="/tourn_home/:id" element={<Tourn_home />} />
          <Route path="/" element={<Navigate to="/home" />} />
          </Routes>
        </div>
      </AppShell>
    </Router>
  );
}

export default App;
