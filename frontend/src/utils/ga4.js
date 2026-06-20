const CONSENT_KEY = 'herastats_analytics_consent';

export function getGa4MeasurementId() {
  const id = process.env.REACT_APP_GA4_MEASUREMENT_ID;
  if (!id || String(id).includes('REACT_APP_')) return null;
  return String(id).trim();
}

export function hasAnalyticsConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'granted';
  } catch {
    return false;
  }
}

export function setAnalyticsConsent(granted) {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
  } catch {
    // ignore
  }
}

export function getAnalyticsConsentStatus() {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    if (v === 'granted' || v === 'denied') return v;
    return 'pending';
  } catch {
    return 'pending';
  }
}

let gaInitialized = false;

export function initGa4IfConsented() {
  const measurementId = getGa4MeasurementId();
  if (!measurementId || !hasAnalyticsConsent() || gaInitialized) return false;

  if (typeof window === 'undefined') return false;

  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }

  window.gtag('config', measurementId, { send_page_view: false });
  gaInitialized = true;
  return true;
}

export function trackGa4PageView({ path, title }) {
  const measurementId = getGa4MeasurementId();
  if (!measurementId || !hasAnalyticsConsent() || typeof window === 'undefined' || !window.gtag) {
    return;
  }

  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title || document.title,
    send_to: measurementId
  });
}
