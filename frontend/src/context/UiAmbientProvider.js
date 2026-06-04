import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const STORAGE_KEY = 'herastats_ui_ambient';

export const UI_AMBIENT_STANDARD = 'standard';
export const UI_AMBIENT_BRIGHT = 'bright';

function readStored() {
  try {
    if (typeof window === 'undefined') return UI_AMBIENT_STANDARD;
    return localStorage.getItem(STORAGE_KEY) === UI_AMBIENT_BRIGHT
      ? UI_AMBIENT_BRIGHT
      : UI_AMBIENT_STANDARD;
  } catch {
    return UI_AMBIENT_STANDARD;
  }
}

const UiAmbientContext = createContext(null);

function applyAmbientDomAttributes(value) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-ui-ambient', value);
  if (document.body) {
    document.body.setAttribute('data-ui-ambient', value);
  }
}

export function UiAmbientProvider({ children }) {
  const [ambient, setAmbient] = useState(() => {
    const v = readStored();
    applyAmbientDomAttributes(v);
    return v;
  });

  useEffect(() => {
    applyAmbientDomAttributes(ambient);
    try {
      localStorage.setItem(STORAGE_KEY, ambient);
    } catch (_) {
      /* noop */
    }
  }, [ambient]);

  const toggle = useCallback(() => {
    setAmbient((a) =>
      a === UI_AMBIENT_BRIGHT ? UI_AMBIENT_STANDARD : UI_AMBIENT_BRIGHT
    );
  }, []);

  const value = useMemo(
    () => ({
      ambient,
      isBright: ambient === UI_AMBIENT_BRIGHT,
      setAmbient,
      toggle,
    }),
    [ambient, toggle]
  );

  return (
    <UiAmbientContext.Provider value={value}>
      {children}
    </UiAmbientContext.Provider>
  );
}

export function useUiAmbient() {
  const ctx = useContext(UiAmbientContext);
  if (!ctx) {
    throw new Error('useUiAmbient debe usarse dentro de UiAmbientProvider');
  }
  return ctx;
}
