import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import AnalyticsConsentBanner from './AnalyticsConsentBanner';
import { usePageViewTracking } from '../hooks/usePageViewTracking';

function PageViewTracker() {
  usePageViewTracking();
  return null;
}

export default function AppShell({ children }) {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <>
      <PageViewTracker />
      {children}
      <AnalyticsConsentBanner />
    </>
  );
}
