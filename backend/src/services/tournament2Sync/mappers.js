function asArray(payload, candidateKeys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of candidateKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === 'object') {
    for (const key of candidateKeys) {
      if (Array.isArray(payload.data[key])) return payload.data[key];
    }
  }
  return [];
}

function firstOf(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

function normalizeId(raw) {
  if (raw === undefined || raw === null) return '';
  const s = String(raw).trim();
  return s;
}

function normalizeText(raw, fallback = '') {
  if (raw === undefined || raw === null) return fallback;
  return String(raw).trim();
}

function normalizeInteger(raw, fallback = null) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function normalizeDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function normalizeTime(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.length === 5 ? `${s}:00` : s;
  }
  const isoDate = new Date(s);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate.toISOString().slice(11, 19);
  }
  const d = new Date(`1970-01-01T${s}`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(11, 19);
}

function normalizeStatus(raw) {
  const status = normalizeText(raw, '').toLowerCase();
  if (!status) return '';
  if (['finished', 'finalizado', 'completed', 'closed'].includes(status)) return 'Finished';
  if (
    ['ongoing', 'live', 'in_progress', 'en curso', 'playing', 'in_play', 'paused', 'timed'].includes(
      status
    )
  ) {
    return 'Ongoing';
  }
  return 'Upcoming';
}

function isFinishedStatus(raw) {
  return normalizeStatus(raw) === 'Finished';
}

function composePhaseName(stage, group) {
  const s = normalizeText(stage, '');
  const g = normalizeText(group, '');
  if (s && g) return `${s} - ${g}`;
  return s || g || 'Fase';
}

function composePhaseExternalId(stage, group) {
  const s = normalizeText(stage, '').toLowerCase().replace(/\s+/g, '_');
  const g = normalizeText(group, '').toLowerCase().replace(/\s+/g, '_');
  if (s && g) return `phase:${s}:${g}`;
  if (s) return `phase:${s}`;
  if (g) return `phase:${g}`;
  return 'phase:default';
}

function mapTeamsPayload(payload) {
  const rows = asArray(payload, ['teams']);
  return rows
    .map((item) => {
      const external_id = normalizeId(item?.id);
      const name = normalizeText(item?.name, '');
      if (!external_id || !name) return null;
      return {
        external_id,
        name,
        division: normalizeText(item?.area?.name, ''),
        group: '',
        url_imagen: normalizeText(item?.crest, '') || null,
        raw: item
      };
    })
    .filter(Boolean);
}

function mapPlayersPayload(payload) {
  const teams = asArray(payload, ['teams']);
  const players = [];
  for (const team of teams) {
    const teamExternalId = normalizeId(team?.id);
    if (!teamExternalId) continue;
    const squad = Array.isArray(team?.squad) ? team.squad : [];
    for (const person of squad) {
      const external_id = normalizeId(person?.id);
      const player_name = normalizeText(person?.name, '');
      if (!external_id || !player_name) continue;
      players.push({
        external_id,
        team_external_id: teamExternalId,
        player_number: normalizeInteger(person?.shirtNumber, null),
        player_name,
        nickname: null,
        position: normalizeText(person?.position, '') || null,
        raw: {
          ...person,
          source_team_id: teamExternalId
        }
      });
    }
  }
  return players;
}

function mapSchedulePayload(payload) {
  const rows = asArray(payload, ['matches']);
  return rows
    .map((item) => {
      const external_id = normalizeId(item?.id);
      if (!external_id) return null;
      const stage = normalizeText(item?.stage, '');
      const group = normalizeText(item?.group, '');
      const phase_name = composePhaseName(stage, group);
      const phase_external_id = composePhaseExternalId(stage, group);
      return {
        external_id,
        phase_external_id,
        phase_name,
        phase_num: normalizeInteger(item?.matchday, null),
        game_num: normalizeInteger(item?.matchday, normalizeInteger(item?.id, null)),
        game_date: normalizeDate(item?.utcDate),
        game_time: normalizeTime(item?.utcDate),
        game_location: normalizeText(item?.venue, '') || 'Sin ubicación',
        division: normalizeText(item?.competition?.name, ''),
        local_team_external_id: normalizeId(item?.homeTeam?.id),
        visitor_team_external_id: normalizeId(item?.awayTeam?.id),
        raw: item
      };
    })
    .filter(Boolean);
}

function mapScoresPayload(payload) {
  const rows = asArray(payload, ['matches']);
  return rows
    .map((item) => {
      const game_external_id = normalizeId(item?.id);
      if (!game_external_id) return null;
      return {
        game_external_id,
        local_score: normalizeInteger(item?.score?.fullTime?.home, null),
        visitor_score: normalizeInteger(item?.score?.fullTime?.away, null),
        status: normalizeStatus(item?.status),
        raw: item
      };
    })
    .filter(Boolean);
}

function mapGameEventsPayload(payload, { gameExternalId }) {
  if (!payload || !Array.isArray(payload.events)) return [];
  return payload.events
    .map((item) => {
      const type = normalizeText(item?.type, '').toUpperCase();
      if (!type) return null;
      const mappedType = type === 'GOAL' ? 'GOAL' : type === 'ASSIST' ? 'AST' : '';
      if (!mappedType) return null;
      return {
        external_id: normalizeId(item?.id) || `event:${normalizeId(item?.minute)}:${normalizeId(item?.player?.id)}`,
        game_external_id: normalizeId(gameExternalId),
        event_time: normalizeText(item?.minute, '00') + ':00',
        event_type: mappedType,
        player_external_id: normalizeId(item?.player?.id),
        team_external_id: normalizeId(item?.team?.id),
        goals: mappedType === 'GOAL' ? 1 : 0,
        assists: mappedType === 'AST' ? 1 : 0,
        raw: item
      };
    })
    .filter(Boolean);
}

module.exports = {
  asArray,
  normalizeStatus,
  isFinishedStatus,
  mapTeamsPayload,
  mapPlayersPayload,
  mapSchedulePayload,
  mapScoresPayload,
  mapGameEventsPayload
};
