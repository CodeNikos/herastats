function ensureLeadingSlash(path) {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function replaceTemplate(pathTemplate, values) {
  let out = pathTemplate;
  for (const [key, value] of Object.entries(values)) {
    out = out.replaceAll(`{${key}}`, encodeURIComponent(String(value)));
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createExternalApiClient(config) {
  const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
  const timeoutMs = Math.max(1000, Number(config.timeoutMs) || 15000);
  const retryCount = Math.max(0, Number(config.retryCount) || 0);

  const baseHeaders = {
    Accept: 'application/json'
  };

  if (config.apiKey) {
    const headerName = config.apiKeyHeader || 'Authorization';
    const prefix = String(config.apiKeyPrefix || '').trim();
    baseHeaders[headerName] = prefix ? `${prefix} ${config.apiKey}` : config.apiKey;
  }

  async function requestJson(path) {
    const url = `${baseUrl}${ensureLeadingSlash(path)}`;
    let attempt = 0;
    let lastError = null;

    while (attempt <= retryCount) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: baseHeaders,
          signal: controller.signal
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(
            `API externa respondió ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`
          );
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt >= retryCount) break;
        await sleep(500 * (attempt + 1));
      } finally {
        clearTimeout(timeout);
      }
      attempt += 1;
    }

    throw lastError || new Error('No se pudo consultar la API externa');
  }

  return {
    fetchTeams() {
      return requestJson(config.teamsPath);
    },
    fetchMatches() {
      return requestJson(config.schedulePath);
    },
    fetchSchedule() {
      return requestJson(config.schedulePath);
    },
    fetchScores() {
      return requestJson(config.scoresPath);
    },
    fetchGameEvents(gameExternalId) {
      if (!config.gameEventsPathTemplate) {
        return Promise.resolve({ events: [] });
      }
      const path = replaceTemplate(config.gameEventsPathTemplate, { gameId: gameExternalId });
      return requestJson(path);
    }
  };
}

module.exports = {
  createExternalApiClient
};
