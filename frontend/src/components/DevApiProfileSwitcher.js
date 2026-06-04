import { TbDatabase, TbFlask } from 'react-icons/tb';
import {
  resolveApiBaseUrl,
  setDevApiProfile,
  getDevApiProfile,
  DEV_API_PROFILE_LOCAL,
  DEV_API_PROFILE_TEST,
  getDevApiLocalUrl,
  getDevApiTestUrl,
} from '../config/apiBaseUrl';
import { rewriteBrowserPathForProfile } from '../config/appRoutes';
import './DevApiProfileSwitcher.css';

export function applyProfileAndReload(profile) {
  setDevApiProfile(profile);
  localStorage.removeItem('token');
  window.location.assign(rewriteBrowserPathForProfile(profile));
}

/**
 * @param {'panel' | 'compact' | 'inline'} variant — panel en menú perfil; compact en móvil/login; inline en barra junto a Login.
 * @param {() => void} [onBeforeNavigate] — cerrar dropdowns antes de recargar.
 */
export function DevApiProfileMenuSection({ variant = 'panel', onBeforeNavigate }) {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const currentUrl = resolveApiBaseUrl();
  const stored = getDevApiProfile();
  const localUrl = getDevApiLocalUrl();
  const testUrl = getDevApiTestUrl();

  const isLocal = currentUrl === localUrl;
  const isTest = currentUrl === testUrl;
  const activeEnvLabel = isTest ? 'Test' : isLocal ? 'Producción' : 'Personalizado';

  const pick = (profile) => {
    onBeforeNavigate?.();
    applyProfileAndReload(profile);
  };

  if (variant === 'inline') {
    return (
      <div className="dev-api-switcher-menu dev-api-switcher-menu--inline" role="group" aria-label="Elegir entorno API">
        <button
          type="button"
          className={`dev-api-switcher__pill ${stored === DEV_API_PROFILE_LOCAL ? 'dev-api-switcher__pill--active' : ''}`}
          onClick={() => pick(DEV_API_PROFILE_LOCAL)}
          title="Producción"
        >
          Producción
        </button>
        <button
          type="button"
          className={`dev-api-switcher__pill ${stored === DEV_API_PROFILE_TEST ? 'dev-api-switcher__pill--active' : ''}`}
          onClick={() => pick(DEV_API_PROFILE_TEST)}
          title="Pruebas"
        >
          Pruebas
        </button>
      </div>
    );
  }

  const isCompactLike = variant === 'compact';
  const optionsSharedClass = isCompactLike
    ? 'dev-api-switcher__option dev-api-switcher__option--compact dev-api-switcher__option--text-only'
    : 'dev-api-switcher__option';
  const iconSize = variant === 'compact' ? 18 : 22;

  const optionButtons = (
    <div className="dev-api-switcher__options dev-api-switcher-menu__option-list" role="group" aria-label="Elegir entorno API">
      <button
        type="button"
        className={`${optionsSharedClass} ${stored === DEV_API_PROFILE_LOCAL ? 'dev-api-switcher__option--active' : ''}`}
        onClick={() => pick(DEV_API_PROFILE_LOCAL)}
      >
        {variant === 'compact' ? (
          <span className="dev-api-switcher__option-title">Producción</span>
        ) : (
          <>
            <span className="dev-api-switcher__option-icon" aria-hidden>
              <TbDatabase size={iconSize} stroke={1.5} />
            </span>
            <span className="dev-api-switcher__option-body">
              <span className="dev-api-switcher__option-title">Producción</span>
              <span className="dev-api-switcher__option-desc">Aplicación principal</span>
            </span>
            <span
              className={`dev-api-switcher__option-dot dev-api-switcher__option-dot--local ${isLocal ? 'dev-api-switcher__option-dot--on' : ''}`}
              aria-hidden
            />
          </>
        )}
      </button>

      <button
        type="button"
        className={`${optionsSharedClass} ${stored === DEV_API_PROFILE_TEST ? 'dev-api-switcher__option--active' : ''}`}
        onClick={() => pick(DEV_API_PROFILE_TEST)}
      >
        {variant === 'compact' ? (
          <span className="dev-api-switcher__option-title">Pruebas</span>
        ) : (
          <>
            <span className="dev-api-switcher__option-icon" aria-hidden>
              <TbFlask size={iconSize} stroke={1.5} />
            </span>
            <span className="dev-api-switcher__option-body">
              <span className="dev-api-switcher__option-title">Pruebas</span>
              <span className="dev-api-switcher__option-desc">Test aplicación alternativa</span>
            </span>
            <span
              className={`dev-api-switcher__option-dot dev-api-switcher__option-dot--test ${isTest ? 'dev-api-switcher__option-dot--on' : ''}`}
              aria-hidden
            />
          </>
        )}
      </button>
    </div>
  );

  if (variant === 'compact') {
    return <div className="dev-api-switcher-menu dev-api-switcher-menu--compact">{optionButtons}</div>;
  }

  return (
    <div className="dev-api-switcher-menu dev-api-switcher-menu--panel">
      <div className="dev-api-switcher-menu__head">
        <h3 className="dev-api-switcher-menu__title">Entorno API</h3>
        <span className="dev-api-switcher-menu__badge">Dev</span>
      </div>

      <p className="dev-api-switcher-menu__warning">
        Al cambiar entorno se cierra la sesión y se recarga la página.
      </p>

      {optionButtons}

      <p className="dev-api-switcher-menu__active-line">
        Activo ahora: <span className="dev-api-switcher-menu__active-value">{activeEnvLabel}</span>
      </p>
    </div>
  );
}
