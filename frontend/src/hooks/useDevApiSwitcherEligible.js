import { useAuth } from './useAuth';
import { isTestAppEnvironment } from '../config/appRoutes';
import { userHasAnyRole, normalizeRole } from '../utils/userRoles';

/** Misma política que el antiguo `DevApiProfileSwitcherGate`: dev + (/test persistido en localStorage admin o modo test público). */
export function useDevApiSwitcherEligible(allowedRoles = ['admin', 'superuser']) {
  const { user, loading } = useAuth();

  if (process.env.NODE_ENV !== 'development') {
    return false;
  }

  if (isTestAppEnvironment()) {
    return true;
  }

  if (loading) {
    return false;
  }

  const role = normalizeRole(user?.role);
  if (!role || !userHasAnyRole(user, allowedRoles)) {
    return false;
  }

  return true;
}
