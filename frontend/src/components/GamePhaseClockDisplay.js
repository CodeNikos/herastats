import React from 'react';

function pad2(value) {
  return String(Math.floor(Number(value) || 0)).padStart(2, '0');
}

/**
 * Cronómetro de fase compartido (mismo `tiempo` que devuelve `useGamePhaseClock`).
 * @param {{ horas: number, minutos: number, segundos: number }} tiempo
 * @param {'live'|'gamepages'} [variant]
 */
export default function GamePhaseClockDisplay({
  tiempo,
  variant = 'live',
  className = '',
  ariaLabel = 'Cronómetro del partido'
}) {
  const t = tiempo || { horas: 0, minutos: 0, segundos: 0 };

  if (variant === 'gamepages') {
    return (
      <div className={`cronometer ${className}`.trim()}>
        <div className="crono_container">
          <div className="crono_display">
            <div className="crono_display_time" aria-label={ariaLabel}>
              <span className="crono_display_time_hours">{pad2(t.horas)}</span>
              <span>:</span>
              <span className="crono_display_time_minutes">{pad2(t.minutos)}</span>
              <span>:</span>
              <span className="crono_display_time_seconds">{pad2(t.segundos)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`live-crono ${className}`.trim()} aria-label={ariaLabel}>
      <div className="live-timer-box">
        <span className="live-timer-part">{pad2(t.horas)}</span>
        <span className="live-timer-sep">:</span>
        <span className="live-timer-part">{pad2(t.minutos)}</span>
        <span className="live-timer-sep">:</span>
        <span className="live-timer-part">{pad2(t.segundos)}</span>
      </div>
    </div>
  );
}
