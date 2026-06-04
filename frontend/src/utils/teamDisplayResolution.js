/**
 * Unifica nombres de equipos entre el JOIN del partido (getGames) y el roster (getTeams)
 * para calendario, anotación y vistas similares: evita "Equipo local", "Por definir", etc.
 * cuando ya existe nombre real en el torneo.
 */

function normalizeComparableTeamLabel(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Textos marcador típicos en pool/bracket (BD o vistas). */
const KNOWN_GENERIC_EXACT = new Set([
  'equipo local',
  'equipo visitante',
  'equipo por definir',
  'por definir',
  'local',
  'visitante',
  'tbd',
  'pending',
  'por confirmar',
  'a definir'
]);

/** @returns {boolean} true si hay que ignorar ese nombre como “nombre real”. */
export function teamNameLooksGenericPlaceholder(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return true;
  const cmp = normalizeComparableTeamLabel(raw);
  if (KNOWN_GENERIC_EXACT.has(cmp)) return true;
  if (cmp.startsWith('equipo por definir')) return true;
  if (cmp === 'equipos por definir') return true;
  /** Texto por defecto de `resolveParticipantTeamDisplay` cuando no hay JOIN ni FK. */
  if (cmp === 'a definir') return true;
  return false;
}

/**
 * @param {object[]} teamsRows Respuesta GET teams (`data.teams`).
 * @returns {Map<number, { name: string, image: string }>}
 */
export function buildTorneoTeamLookup(teamsRows) {
  const map = new Map();
  if (!Array.isArray(teamsRows)) return map;
  for (const t of teamsRows) {
    const id = t.team_id != null ? Number(t.team_id) : NaN;
    if (!Number.isFinite(id) || id <= 0) continue;
    const name = t.name != null ? String(t.name).trim() : '';
    const image = t.url_imagen != null ? String(t.url_imagen).trim() : '';
    map.set(id, { name, image });
  }
  return map;
}

/**
 * @param {number|null} teamId
 * @param {string|null|undefined} joinName `local_name` / `visitor_name` del JOIN
 * @param {string|null|undefined} joinImage del JOIN
 * @param {Map<number, { name: string, image: string }>} lookup roster del torneo
 * @returns {{ name: string, image: string }}
 */
export function resolveParticipantTeamDisplay(teamId, joinName, joinImage, lookup) {
  const id =
    teamId != null && teamId !== '' && Number.isFinite(Number(teamId)) && Number(teamId) > 0
      ? Number(teamId)
      : null;
  const roster = id != null ? lookup.get(id) : undefined;

  const rosterName = roster?.name != null ? String(roster.name).trim() : '';
  const joint = joinName != null ? String(joinName).trim() : '';

  const pickName = () => {
    if (rosterName && !teamNameLooksGenericPlaceholder(rosterName)) return rosterName;
    if (joint && !teamNameLooksGenericPlaceholder(joint)) return joint;
    if (rosterName) return rosterName;
    if (joint) return joint;
    return 'A definir';
  };

  const rImg = roster?.image != null ? String(roster.image).trim() : '';
  const jImg = joinImage != null ? String(joinImage).trim() : '';
  const image = rImg || jImg || '';

  return { name: pickName(), image };
}
