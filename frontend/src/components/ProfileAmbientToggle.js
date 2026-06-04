import { useUiAmbient } from '../context/UiAmbientProvider';
import './ProfileAmbientToggle.css';

/**
 * Interruptor día / habitual: alto contraste para ver la UI con mucha luz ambiental.
 */
export default function ProfileAmbientToggle({
  dense = false,
  className = '',
}) {
  const { isBright, toggle } = useUiAmbient();

  return (
    <div className={`profile-ambient-toggle${dense ? ' profile-ambient-toggle--dense' : ''} ${className}`.trim()}>
      <div className="profile-ambient-toggle-text">
        <span className="profile-ambient-toggle-label">Luz día (alto contraste)</span>
        <span className="profile-ambient-toggle-desc">
          {isBright
            ? 'Activo · texto y barras más legibles al sol.'
            : 'Colores estándar · mejor en interior.'}
        </span>
      </div>
      <button
        type="button"
        className={`hera-ambient-switch ${isBright ? 'hera-ambient-switch--on' : ''}`}
        onClick={(e) => {
          e.preventDefault();
          toggle();
        }}
        role="switch"
        aria-checked={isBright}
        aria-label={
          isBright
            ? 'Desactivar modo luz día, volver a colores habituales'
            : 'Activar modo luz día para más contraste'
        }
      >
        <span className="hera-ambient-switch-thumb" aria-hidden />
      </button>
    </div>
  );
}
