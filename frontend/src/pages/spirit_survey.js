import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchSpiritInvite, submitSpiritSurvey } from '../services/spiritSurveyPublicService';
import './spirit_survey.css';

function scoreOptions() {
  return [0, 1, 2, 3, 4];
}

function SpiritScaleRow({ label, name, value, onChange, disabled }) {
  return (
    <fieldset className="spirit_scale_row" disabled={disabled}>
      <legend className="spirit_scale_label">{label}</legend>
      <div className="spirit_scale_radios" role="group" aria-label={label}>
        {scoreOptions().map((n) => {
          const selected = value === n;
          return (
            <label
              key={n}
              className={`spirit_scale_opt${selected ? ' spirit_scale_opt--selected' : ''}`}
            >
              <input
                type="radio"
                className="spirit_scale_input"
                name={name}
                value={n}
                checked={selected}
                onChange={() => onChange(n)}
              />
              <span className="spirit_scale_num">{n}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SpiritSurveyPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);
  const [completed, setCompleted] = useState(false);

  const [rules, setRules] = useState(null);
  const [fouls, setFouls] = useState(null);
  const [fairmind, setFairmind] = useState(null);
  const [attitude, setAttitude] = useState(null);
  const [communication, setCommunication] = useState(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError('');
      setMeta(null);
      setCompleted(false);
      if (!token) {
        setLoading(false);
        setError('Falta el enlace de la encuesta (token).');
        return;
      }
      setLoading(true);
      try {
        const res = await fetchSpiritInvite(token);
        if (cancelled) return;
        if (!res?.success) {
          throw new Error(res?.message || 'No se pudo cargar la encuesta.');
        }
        const d = res.data || {};
        if (d.completed) {
          setCompleted(true);
        } else {
          setMeta(d);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.message || e.message || 'Error al cargar.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const canSubmit =
    rules != null &&
    fouls != null &&
    fairmind != null &&
    attitude != null &&
    communication != null &&
    !submitting &&
    !completed &&
    meta;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || !token) return;
    setSubmitting(true);
    setSubmitMessage('');
    try {
      const res = await submitSpiritSurvey({
        token,
        s_rules: rules,
        s_fouls: fouls,
        s_fairmind: fairmind,
        s_attitude: attitude,
        s_communication: communication,
        comments
      });
      if (!res?.success) {
        throw new Error(res?.message || 'No se pudo enviar.');
      }
      setCompleted(true);
      setSubmitMessage(res.message || 'Gracias.');
    } catch (err) {
      setSubmitMessage(err.response?.data?.message || err.message || 'Error al enviar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="spirit_page">
      <main className="spirit_main">
        <h1 className="spirit_title">Espíritu de juego</h1>
        {loading ? <p className="spirit_state">Cargando…</p> : null}
        {!loading && error ? <p className="spirit_state spirit_state_error">{error}</p> : null}
        {!loading && completed && !error ? (
          <p className="spirit_state spirit_state_ok">Gracias. Esta encuesta ya fue registrada o se envió correctamente.</p>
        ) : null}
        {!loading && meta && !completed ? (
          <>
            <p className="spirit_intro">
              Partido: <strong>{meta.localTeamName}</strong> vs <strong>{meta.visitorTeamName}</strong>.
              Evalúa al equipo rival: <strong>{meta.ratedTeamName}</strong>
              {meta.respondingTeamName ? (
                <>
                  {' '}
                  (representas a <strong>{meta.respondingTeamName}</strong>)
                </>
              ) : null}
              .
            </p>
            <p className="spirit_hint">Escala del 0 (pobre) al 4 (excelente).</p>
            <form className="spirit_form" onSubmit={handleSubmit}>
              <SpiritScaleRow
                label="Conocimiento y uso de las reglas"
                name="s_rules"
                value={rules}
                onChange={setRules}
                disabled={submitting}
              />
              <SpiritScaleRow
                label="Faltas y contacto físico"
                name="s_fouls"
                value={fouls}
                onChange={setFouls}
                disabled={submitting}
              />
              <SpiritScaleRow
                label="Imparcialidad"
                name="s_fairmind"
                value={fairmind}
                onChange={setFairmind}
                disabled={submitting}
              />
              <SpiritScaleRow
                label="Actitud positiva y autocontrol"
                name="s_attitude"
                value={attitude}
                onChange={setAttitude}
                disabled={submitting}
              />
              <SpiritScaleRow
                label="Comunicación"
                name="s_communication"
                value={communication}
                onChange={setCommunication}
                disabled={submitting}
              />
              <label className="spirit_comments">
                <span>Comentarios (opcional)</span>
                <textarea
                  value={comments}
                  onChange={(ev) => setComments(ev.target.value)}
                  rows={4}
                  maxLength={4000}
                  disabled={submitting}
                />
              </label>
              {submitMessage ? (
                <p
                  className={`spirit_state ${submitMessage.toLowerCase().includes('error') || submitMessage.includes('no válido') || submitMessage.includes('expirado') || submitMessage.includes('Falt') ? 'spirit_state_error' : 'spirit_state_ok'}`}
                >
                  {submitMessage}
                </p>
              ) : null}
              <button type="submit" className="spirit_submit" disabled={!canSubmit}>
                {submitting ? 'Enviando…' : 'Enviar encuesta'}
              </button>
            </form>
          </>
        ) : null}
      </main>
    </div>
  );
}

export default SpiritSurveyPage;
