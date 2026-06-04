-- =============================================================================
-- Clasificación por grupos (misma lógica que frontend/src/utils/groupStandings.js)
--
-- Fuentes: partidos Finished en fase de grupos (phas_num = 1 o nombre Groups/Grupo)
--          entre equipos del mismo torneo, división y "group".
--
-- Orden:
--   1) Victorias (W) descendente
--   2) Empate en W:
--        a) Si hubo al menos un partido de grupos entre los empatados → mini-liga
--           (W, GD, GF solo en esos enfrentamientos)
--        b) Si no hubo ningún enfrentamiento directo en el bloque → GD global,
--           luego GF global, luego nombre
--
-- Parámetros (editar en CTE params):
--   torneo_id, division, grupo  (valor exacto de team."group", ej. 'Grupo A')
-- =============================================================================

WITH params AS (
  SELECT
    1::integer        AS torneo_id,   -- <<< cambiar
    'Open'::text      AS division,    -- <<< cambiar
    'Grupo A'::text   AS grupo        -- <<< cambiar (como en team."group")
),

-- Equipos del grupo
teams AS (
  SELECT
    t.team_id,
    t.name,
    t."group",
    t.division
  FROM team t
  CROSS JOIN params p
  WHERE t.torneo_id = p.torneo_id
    AND LOWER(TRIM(COALESCE(t.division, ''))) = LOWER(TRIM(p.division))
    AND TRIM(COALESCE(t."group", '')) = TRIM(p.grupo)
),

-- Partidos de fase de grupos terminados, misma división, ambos equipos del grupo
group_phase_games AS (
  SELECT
    g.game_id,
    g."local"   AS local_id,
    g.visitor   AS visitor_id,
    COALESCE(NULLIF(TRIM(g.local_score), ''), '0')::integer   AS ls,
    COALESCE(NULLIF(TRIM(g.visitor_score), ''), '0')::integer AS vs
  FROM game g
  INNER JOIN phases ph ON ph.phas_id = g.phas_id
  CROSS JOIN params p
  WHERE g.torneo_id = p.torneo_id
    AND LOWER(TRIM(COALESCE(g.estado, ''))) IN ('finished', 'finalizado', 'completed')
    AND LOWER(TRIM(COALESCE(g.division, ''))) = LOWER(TRIM(p.division))
    AND (
      COALESCE(g.phas_num, ph.phase_num) = 1
      OR LOWER(COALESCE(ph.stage, '')) LIKE '%grupo%'
      OR LOWER(COALESCE(ph.stage, '')) LIKE '%group%'
      OR LOWER(TRIM(COALESCE(ph.stage, ''))) = 'groups'
    )
    AND g."local" IS NOT NULL
    AND g.visitor IS NOT NULL
    AND EXISTS (SELECT 1 FROM teams tl WHERE tl.team_id = g."local")
    AND EXISTS (SELECT 1 FROM teams tv WHERE tv.team_id = g.visitor)
),

-- Una fila por equipo y partido (local + visitante)
team_game_lines AS (
  SELECT local_id AS team_id, ls AS gf, vs AS ga,
         CASE WHEN ls > vs THEN 1 ELSE 0 END AS won,
         CASE WHEN ls < vs THEN 1 ELSE 0 END AS lost
  FROM group_phase_games
  UNION ALL
  SELECT visitor_id, vs, ls,
         CASE WHEN vs > ls THEN 1 ELSE 0 END,
         CASE WHEN vs < ls THEN 1 ELSE 0 END
  FROM group_phase_games
),

-- Estadísticas de temporada dentro del grupo (PG, W, L, GF, GA, GD)
season_stats AS (
  SELECT
    t.team_id,
    t.name,
    COUNT(tgl.team_id)::integer          AS pg,
    COALESCE(SUM(tgl.won), 0)::integer   AS wins,
    COALESCE(SUM(tgl.lost), 0)::integer  AS losses,
    COALESCE(SUM(tgl.gf), 0)::integer    AS gf,
    COALESCE(SUM(tgl.ga), 0)::integer    AS ga,
    COALESCE(SUM(tgl.gf), 0) - COALESCE(SUM(tgl.ga), 0) AS gd
  FROM teams t
  LEFT JOIN team_game_lines tgl ON tgl.team_id = t.team_id
  GROUP BY t.team_id, t.name
),

-- Bloques empatados en victorias
win_buckets AS (
  SELECT wins, COUNT(*)::integer AS n_teams
  FROM season_stats
  GROUP BY wins
),

-- Partidos de mini-liga: ambos equipos pertenecen al mismo bloque (mismas victorias)
bucket_h2h_games AS (
  SELECT
    b.wins AS bucket_wins,
    g.game_id,
    g.local_id,
    g.visitor_id,
    g.ls,
    g.vs
  FROM win_buckets b
  INNER JOIN group_phase_games g ON TRUE
  INNER JOIN season_stats s_loc
    ON s_loc.team_id = g.local_id AND s_loc.wins = b.wins
  INNER JOIN season_stats s_vis
    ON s_vis.team_id = g.visitor_id AND s_vis.wins = b.wins
),

bucket_h2h_match_count AS (
  SELECT bucket_wins, COUNT(DISTINCT game_id)::integer AS h2h_matches
  FROM bucket_h2h_games
  GROUP BY bucket_wins
),

h2h_team_lines AS (
  SELECT bucket_wins, local_id AS team_id, ls AS gf, vs AS ga,
         CASE WHEN ls > vs THEN 1 ELSE 0 END AS h2h_won
  FROM bucket_h2h_games
  UNION ALL
  SELECT bucket_wins, visitor_id, vs, ls,
         CASE WHEN vs > ls THEN 1 ELSE 0 END
  FROM bucket_h2h_games
),

h2h_agg AS (
  SELECT
    bucket_wins,
    team_id,
    COALESCE(SUM(h2h_won), 0)::integer AS h2h_w,
    COALESCE(SUM(gf), 0)::integer       AS h2h_gf,
    COALESCE(SUM(ga), 0)::integer       AS h2h_ga,
    COALESCE(SUM(gf), 0) - COALESCE(SUM(ga), 0) AS h2h_gd
  FROM h2h_team_lines
  GROUP BY bucket_wins, team_id
),

-- Posición dentro del bloque de victorias (desempate H2H o GD global)
ranked_in_bucket AS (
  SELECT
    s.team_id,
    s.name,
    s.pg,
    s.wins,
    s.losses,
    s.gf,
    s.ga,
    s.gd,
    COALESCE(h.h2h_w, 0)   AS h2h_w,
    COALESCE(h.h2h_gd, 0)  AS h2h_gd,
    COALESCE(h.h2h_gf, 0)  AS h2h_gf,
    COALESCE(c.h2h_matches, 0) AS h2h_matches,
    ROW_NUMBER() OVER (
      PARTITION BY s.wins
      ORDER BY
        /* Sin enfrentamientos en el bloque → GD global */
        CASE WHEN COALESCE(c.h2h_matches, 0) = 0 THEN s.gd END DESC NULLS LAST,
        CASE WHEN COALESCE(c.h2h_matches, 0) = 0 THEN s.gf END DESC NULLS LAST,
        /* Con enfrentamientos → mini-liga del bloque */
        CASE WHEN COALESCE(c.h2h_matches, 0) > 0 THEN COALESCE(h.h2h_w, 0) END DESC NULLS LAST,
        CASE WHEN COALESCE(c.h2h_matches, 0) > 0 THEN COALESCE(h.h2h_gd, 0) END DESC NULLS LAST,
        CASE WHEN COALESCE(c.h2h_matches, 0) > 0 THEN COALESCE(h.h2h_gf, 0) END DESC NULLS LAST,
        /* Respaldo */
        s.gd DESC,
        s.gf DESC,
        s.name ASC
    ) AS pos_in_bucket
  FROM season_stats s
  LEFT JOIN h2h_agg h
    ON h.team_id = s.team_id AND h.bucket_wins = s.wins
  LEFT JOIN bucket_h2h_match_count c
    ON c.bucket_wins = s.wins
)

SELECT
  ROW_NUMBER() OVER (
    ORDER BY wins DESC, pos_in_bucket ASC
  )::integer AS rank,
  team_id,
  name,
  pg,
  wins,
  losses,
  gf,
  ga,
  gd,
  h2h_matches,
  h2h_w,
  h2h_gd,
  h2h_gf,
  CASE
    WHEN h2h_matches > 0 THEN 'desempate_enfrentamiento_directo'
    ELSE 'desempate_diferencia_goles'
  END AS criterio_desempate_usado
FROM ranked_in_bucket
ORDER BY rank;
