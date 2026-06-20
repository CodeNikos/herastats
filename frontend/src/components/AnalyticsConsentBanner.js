import { useEffect, useState } from 'react';
import { getAnalyticsConsentStatus, initGa4IfConsented, setAnalyticsConsent } from '../utils/ga4';
import './AnalyticsConsentBanner.css';

export default function AnalyticsConsentBanner() {
  const [status, setStatus] = useState(() => getAnalyticsConsentStatus());

  useEffect(() => {
    if (status === 'granted') {
      initGa4IfConsented();
    }
  }, [status]);

  if (status !== 'pending') return null;

  const accept = () => {
    setAnalyticsConsent(true);
    initGa4IfConsented();
    setStatus('granted');
  };

  const reject = () => {
    setAnalyticsConsent(false);
    setStatus('denied');
  };

  return (
    <div className="analytics-consent-banner" role="dialog" aria-label="Consentimiento de cookies">
      <div className="analytics-consent-banner__inner">
        <p>
          Usamos cookies de analítica (Google Analytics) para mejorar el sitio. También registramos visitas
          agregadas de forma anónima en nuestro servidor.
        </p>
        <div className="analytics-consent-banner__actions">
          <button type="button" className="analytics-consent-banner__btn analytics-consent-banner__btn--secondary" onClick={reject}>
            Rechazar
          </button>
          <button type="button" className="analytics-consent-banner__btn analytics-consent-banner__btn--primary" onClick={accept}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
