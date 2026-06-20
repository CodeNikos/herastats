import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getOrCreateSessionKey, sendPageViewBeacon } from '../utils/analyticsCollect';
import { initGa4IfConsented, trackGa4PageView } from '../utils/ga4';

const EXCLUDED_PREFIXES = [
  '/login',
  '/set-password',
  '/users',
  '/analytics',
  '/config',
  '/team',
  '/players',
  '/groupsconfig',
  '/calendarconfig',
  '/brackets',
  '/anotacion',
  '/game_events',
  '/football_events',
  '/live',
  '/sports'
];

function shouldTrack(pathname) {
  return !EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function usePageViewTracking() {
  const location = useLocation();
  const lastTracked = useRef('');

  useEffect(() => {
    initGa4IfConsented();
  }, []);

  useEffect(() => {
    const path = location.pathname || '/';
    if (!shouldTrack(path)) return;

    const signature = `${path}?${location.search || ''}`;
    if (lastTracked.current === signature) return;
    lastTracked.current = signature;

    const query = location.search ? location.search.replace(/^\?/, '') : '';
    const sessionKey = getOrCreateSessionKey();

    sendPageViewBeacon({
      path,
      query,
      referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
      sessionKey
    });

    trackGa4PageView({
      path: `${path}${location.search || ''}`,
      title: typeof document !== 'undefined' ? document.title : ''
    });
  }, [location.pathname, location.search]);
}
