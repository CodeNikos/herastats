const nodemailer = require('nodemailer');

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  /**
   * Solo el puerto 465 usa TLS implícito desde el primer byte.
   * En 587 (y 25/2525) el servidor envía saludo SMTP en claro y luego STARTTLS;
   * poner secure:true ahí produce OpenSSL "wrong version number".
   */
  const secure = port === 465;
  if (process.env.SMTP_SECURE === 'true' && !secure) {
    console.warn(
      '[mail] SMTP_SECURE=true no aplica al puerto',
      port,
      '— se usa STARTTLS (secure=false). Para TLS implícito usa puerto 465.'
    );
  }

  if (!host || !user) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: pass ? { user, pass } : undefined
  });
}

/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.plainToken
 * @param {string} opts.localName
 * @param {string} opts.visitorName
 * @param {string} opts.ratedTeamName - rival a evaluar
 * @param {string} [opts.respondentLabel] - nombre del equipo que responde
 */
async function sendSpiritSurveyEmail(opts) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@herastats.local';
  const baseUrl = (process.env.FRONTEND_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const { to, plainToken, localName, visitorName, ratedTeamName, respondentLabel } = opts;

  const link = `${baseUrl}/spirit-survey?token=${encodeURIComponent(plainToken)}`;
  const subject = 'Encuesta de espíritu de juego — Herastats';
  const text = [
    'Hola,',
    '',
    `Tras el partido ${localName} vs ${visitorName}, te pedimos evaluar el espíritu de juego del equipo rival: ${ratedTeamName}.`,
    respondentLabel ? `(Respondes en representación de: ${respondentLabel})` : '',
    '',
    `Enlace (válido unos días): ${link}`,
    '',
    'Gracias por tu tiempo.'
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <p>Hola,</p>
    <p>Tras el partido <strong>${escapeHtml(localName)}</strong> vs <strong>${escapeHtml(visitorName)}</strong>,
    te pedimos evaluar el espíritu de juego del equipo rival: <strong>${escapeHtml(ratedTeamName)}</strong>.</p>
    ${
      respondentLabel
        ? `<p>Respondes en representación de: <strong>${escapeHtml(respondentLabel)}</strong>.</p>`
        : ''
    }
    <p><a href="${link}">Abrir encuesta</a></p>
    <p style="color:#666;font-size:12px;">Si el enlace no funciona, copia y pega en el navegador:<br>${escapeHtml(
      link
    )}</p>
  `;

  const transporter = createTransport();
  if (!transporter) {
    if (/^(true|1)$/i.test(String(process.env.LOG_MAIL_LINKS || '').trim())) {
      console.warn(
        '[mail] SMTP no configurado. Enlace de encuesta (solo dev):',
        link
      );
    } else {
      console.warn(
        '[mail] SMTP no configurado (SMTP_HOST / SMTP_USER). No se envía correo de encuesta.'
      );
    }
    return { skipped: true, link };
  }

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html
  });
  return { skipped: false };
}

/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.plainToken
 */
async function sendPasswordSetupEmail(opts) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@herastats.local';
  const baseUrl = (process.env.FRONTEND_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const { to, plainToken } = opts;

  const link = `${baseUrl}/set-password?token=${encodeURIComponent(plainToken)}`;
  const subject = 'Configura tu contraseña — Herastats';
  const text = [
    'Hola,',
    '',
    'Se creó tu usuario en Herastats.',
    'Usa este enlace para configurar o cambiar tu contraseña:',
    link,
    '',
    'Si no esperabas este correo, ignóralo.'
  ].join('\n');

  const html = `
    <p>Hola,</p>
    <p>Se creó tu usuario en <strong>Herastats</strong>.</p>
    <p>Usa este enlace para configurar o cambiar tu contraseña:</p>
    <p><a href="${link}">Configurar contraseña</a></p>
    <p style="color:#666;font-size:12px;">Si el enlace no funciona, copia y pega en el navegador:<br>${escapeHtml(
      link
    )}</p>
  `;

  const transporter = createTransport();
  if (!transporter) {
    if (/^(true|1)$/i.test(String(process.env.LOG_MAIL_LINKS || '').trim())) {
      console.warn(
        '[mail] SMTP no configurado. Enlace set-password (solo dev):',
        link
      );
    } else {
      console.warn(
        '[mail] SMTP no configurado. No se envía correo de configuración de contraseña.'
      );
    }
    return { skipped: true, link };
  }

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html
  });
  return { skipped: false };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { sendSpiritSurveyEmail, sendPasswordSetupEmail, createTransport };
