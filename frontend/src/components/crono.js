
function crearCronometro(horas = 0, minutos = 0, segundos = 0) {
    let tiempoObjetivo = horas * 3600 + minutos * 60 + segundos;
    let tiempoTranscurrido = 0;
    let intervalo = null;
    let enEjecucion = false;
    /** Segundos ya acumulados al iniciar el tramo actual (ancla de pared). */
    let wallBaseSec = 0;
    /** Marca de tiempo (ms) cuando empezó el tramo en curso; null si está parado. */
    let wallAnchorMs = null;
    let callbacks = {
        onTick: null,
        onComplete: null,
        onStart: null,
        onPause: null,
        onReset: null
    };

    function syncElapsedFromWall() {
        if (!enEjecucion || wallAnchorMs == null) return tiempoTranscurrido;
        const elapsed = wallBaseSec + Math.floor((Date.now() - wallAnchorMs) / 1000);
        tiempoTranscurrido = tiempoObjetivo > 0 ? Math.min(elapsed, tiempoObjetivo) : Math.max(0, elapsed);
        return tiempoTranscurrido;
    }

    function actualizarTiempo() {
        const prevSec = tiempoTranscurrido;
        syncElapsedFromWall();

        if (callbacks.onTick && tiempoTranscurrido !== prevSec) {
            callbacks.onTick(getTiempoTranscurrido());
        }

        if (tiempoObjetivo > 0 && tiempoTranscurrido >= tiempoObjetivo) {
            pausar();
            if (callbacks.onComplete) {
                callbacks.onComplete();
            }
        }
    }

    function iniciar() {
        if (enEjecucion || tiempoObjetivo <= 0) return false;

        wallBaseSec = tiempoTranscurrido;
        wallAnchorMs = Date.now();
        enEjecucion = true;
        intervalo = setInterval(actualizarTiempo, 250);

        if (callbacks.onStart) {
            callbacks.onStart();
        }

        return true;
    }

    function pausar() {
        if (!enEjecucion) return false;

        syncElapsedFromWall();
        enEjecucion = false;
        wallAnchorMs = null;
        clearInterval(intervalo);
        intervalo = null;

        if (callbacks.onPause) {
            callbacks.onPause();
        }

        return true;
    }

    function reiniciar() {
        const estabaEnEjecucion = enEjecucion;
        pausar();
        tiempoTranscurrido = 0;
        wallBaseSec = 0;

        if (callbacks.onReset) {
            callbacks.onReset();
        }

        if (estabaEnEjecucion) {
            iniciar();
        }

        return true;
    }

    function configurarTiempo(nuevasHoras, nuevosMinutos, nuevosSegundos) {
        const estabaEnEjecucion = enEjecucion;
        pausar();

        tiempoObjetivo = nuevasHoras * 3600 + nuevosMinutos * 60 + nuevosSegundos;
        tiempoTranscurrido = 0;
        wallBaseSec = 0;

        if (estabaEnEjecucion && tiempoObjetivo > 0) {
            iniciar();
        }

        return true;
    }

    /**
     * Restaura objetivo y transcurrido sin el reset a 0 de configurarTiempo (p. ej. rehidratación desde BD).
     * @param {{ tiempoObjetivoSeg: number, tiempoTranscurridoSeg: number, autoStart?: boolean }} opts
     */
    function aplicarEstadoPersistido(opts) {
        const obj = Math.max(0, Math.floor(Number(opts?.tiempoObjetivoSeg) || 0));
        let trans = Math.max(0, Math.floor(Number(opts?.tiempoTranscurridoSeg) || 0));
        if (obj > 0 && trans > obj) trans = obj;
        const wantAuto = Boolean(opts?.autoStart && obj > 0 && trans < obj);
        const wasRunning = enEjecucion;

        if (wasRunning === wantAuto && tiempoObjetivo === obj && tiempoTranscurrido === trans) {
            return true;
        }

        pausar();
        tiempoObjetivo = obj;
        tiempoTranscurrido = trans;
        wallBaseSec = trans;

        if (obj > 0 && trans >= obj) {
            if (callbacks.onComplete) callbacks.onComplete();
            return false;
        }
        if (wantAuto) {
            return iniciar();
        }
        return true;
    }

    function getTiempoRestante() {
        syncElapsedFromWall();
        const tiempoRestante = Math.max(0, tiempoObjetivo - tiempoTranscurrido);
        return {
            horas: Math.floor(tiempoRestante / 3600),
            minutos: Math.floor((tiempoRestante % 3600) / 60),
            segundos: tiempoRestante % 60,
            totalSegundos: tiempoRestante
        };
    }

    function getTiempoTranscurrido() {
        syncElapsedFromWall();
        return {
            horas: Math.floor(tiempoTranscurrido / 3600),
            minutos: Math.floor((tiempoTranscurrido % 3600) / 60),
            segundos: tiempoTranscurrido % 60,
            totalSegundos: tiempoTranscurrido
        };
    }

    function getEstado() {
        return {
            enEjecucion,
            tiempoObjetivo,
            tiempoTranscurrido,
            tiempoRestante: tiempoObjetivo - tiempoTranscurrido,
            porcentajeCompletado: tiempoObjetivo > 0 ? (tiempoTranscurrido / tiempoObjetivo) * 100 : 0
        };
    }

    function on(evento, callback) {
        if (callbacks.hasOwnProperty(evento)) {
            callbacks[evento] = callback;
        }
        return this;
    }

    // Inicializar con el tiempo proporcionado
    configurarTiempo(horas, minutos, segundos);

    return {
        iniciar,
        pausar,
        reiniciar,
        configurarTiempo,
        aplicarEstadoPersistido,
        getTiempoRestante,
        getTiempoTranscurrido,
        getEstado,
        on,
        
        // Métodos de conveniencia
        setTiempo: configurarTiempo,
        stop: pausar,
        start: iniciar,
        reset: reiniciar
    };
}

export default crearCronometro;

// Ejemplo de uso:
/*
const cronometro = crearCronometro(0, 1, 30); // 1 minuto 30 segundos

// Configurar callbacks
cronometro
    .on('onStart', () => console.log('Cronómetro iniciado'))
    .on('onPause', () => console.log('Cronómetro pausado'))
    .on('onReset', () => console.log('Cronómetro reiniciado'))
    .on('onComplete', () => console.log('¡Tiempo completado!'))
    .on('onTick', (tiempoTranscurrido) => {
        console.log(`Transcurrido: ${tiempoTranscurrido.minutos}:${tiempoTranscurrido.segundos}`);
    });

// Controlar el cronómetro
cronometro.iniciar();

// Después de 30 segundos...
// cronometro.pausar();

// Cambiar tiempo
// cronometro.configurarTiempo(0, 2, 0); // 2 minutos

// Obtener estado
// console.log(cronometro.getEstado());
*/