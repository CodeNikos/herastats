-- procedure: ps_game_upd(IN tourn_id integer, IN ga_num integer, IN phase_num integer)
-- Extraído automáticamente. Aplicar con: npm run db:procedures
CREATE OR REPLACE PROCEDURE public.ps_game_upd(IN tourn_id integer, IN ga_num integer, IN phase_num integer)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    winner     INT;
    loser      INT;
    cant       INT;
    div        text;
    v_grupo    text;
    view_name  text;
    avanza_w   text;
    avanza_l   text;
    group_rec  RECORD;
    resultado  RECORD;
    upd_rec    RECORD;
BEGIN

    -- ────────────────────────────────────────────
    -- 1. Obtener ganador y perdedor
    -- ────────────────────────────────────────────
    SELECT
        CASE WHEN visitor_score > local_score THEN visitor ELSE local END,
        CASE WHEN visitor_score < local_score THEN visitor ELSE local END
    INTO winner, loser
    FROM game
    WHERE torneo_id = tourn_id
      AND game_num  = ga_num;

    IF winner IS NULL OR loser IS NULL THEN
        RAISE EXCEPTION 'No se encontró el partido torneo_id=% game_num=%', tourn_id, ga_num;
    END IF;

    -- ────────────────────────────────────────────
    -- 2. Obtener división y grupo
    -- ────────────────────────────────────────────
    SELECT DISTINCT division
    INTO div
    FROM team
    WHERE torneo_id = tourn_id
      AND team_id IN (winner, loser);

    SELECT DISTINCT "group"
    INTO v_grupo
    FROM team
    WHERE torneo_id = tourn_id
      AND team_id IN (winner, loser);

    SELECT COUNT(DISTINCT "group")
    INTO cant
    FROM team
    WHERE torneo_id = tourn_id
      AND team_id IN (winner, loser);

    RAISE NOTICE 'Ganador: %, Perdedor: %, División: %, Grupo: %, Cant grupos: %',
        winner, loser, div, v_grupo, cant;

    -- ────────────────────────────────────────────
    -- 3. FASE 1: ranking de grupo
    -- ────────────────────────────────────────────
    IF phase_num = 1 THEN

        DROP TABLE IF EXISTS tmp_group_rank;
        CREATE TEMP TABLE tmp_group_rank (
            rank    text,
            team_id int,
            name    text
        );

        IF cant > 1 THEN
            -- Equipos en grupos distintos → procesar cada grupo
            FOR group_rec IN
                SELECT DISTINCT "group"
                FROM team
                WHERE torneo_id = tourn_id
                  AND team_id IN (winner, loser)
            LOOP
                CALL create_ranked_view(tourn_id, div, group_rec."group");
                view_name := format('ranked_%s_%s_%s', tourn_id, div, group_rec."group");

                DROP TABLE IF EXISTS tmp_ranking;
                EXECUTE format('CREATE TEMP TABLE tmp_ranking AS SELECT * FROM %I', view_name);

                EXECUTE format(
                    'INSERT INTO tmp_group_rank (rank, team_id, name)
                     SELECT DISTINCT rank || %L, team_id, name FROM tmp_ranking',
                    group_rec."group"
                );

                DROP TABLE IF EXISTS tmp_ranking;
            END LOOP;

            FOR resultado IN SELECT * FROM tmp_group_rank LOOP
                RAISE NOTICE 'Rank: %, Equipo: %, Nombre: %',
                    resultado.rank, resultado.team_id, resultado.name;
            END LOOP;

        ELSE
            -- Ambos equipos en el mismo grupo
            CALL create_ranked_view(tourn_id, div, v_grupo);
            view_name := format('ranked_%s_%s_%s', tourn_id, div, v_grupo);

            DROP TABLE IF EXISTS tmp_ranking;
            EXECUTE format('CREATE TEMP TABLE tmp_ranking AS SELECT * FROM %I', view_name);

            INSERT INTO tmp_group_rank (rank, team_id, name)
            SELECT rank || v_grupo, team_id, name FROM tmp_ranking;

            DROP TABLE IF EXISTS tmp_ranking;

            FOR resultado IN SELECT * FROM tmp_group_rank LOOP
                RAISE NOTICE 'Procesando Rank: %, Equipo: %, Nombre: %',
                    resultado.rank, resultado.team_id, resultado.name;

                BEGIN
                    SELECT game_id, game_num, stats_slot_local, stats_slot_visitor,
                        CASE
                            WHEN stats_slot_local   = resultado.rank THEN 'local'
                            WHEN stats_slot_visitor = resultado.rank THEN 'visitor'
                        END AS campo_upd
                    INTO STRICT upd_rec
                    FROM game
                    WHERE torneo_id = tourn_id
                      AND division  = div
                      AND phas_id  <> 11
                      AND (stats_slot_local = resultado.rank OR stats_slot_visitor = resultado.rank);

                    IF upd_rec.campo_upd = 'local' THEN
                        UPDATE game SET "local" = resultado.team_id
                        WHERE torneo_id = tourn_id AND division = div
                          AND game_id   = upd_rec.game_id;
                    ELSE
                        UPDATE game SET visitor = resultado.team_id
                        WHERE torneo_id = tourn_id AND division = div
                          AND game_id   = upd_rec.game_id;
                    END IF;

                    RAISE NOTICE 'Actualizado game_id: % campo: % equipo: %',
                        upd_rec.game_id, upd_rec.campo_upd, resultado.team_id;

                EXCEPTION
                    WHEN NO_DATA_FOUND THEN
                        RAISE NOTICE 'Sin partido pendiente para slot: %', resultado.rank;
                    WHEN TOO_MANY_ROWS THEN
                        RAISE WARNING 'Múltiples partidos para slot: % — revisar datos', resultado.rank;
                END;

            END LOOP;
        END IF;

    -- ────────────────────────────────────────────
    -- 4. FASES 2 y 3: eliminación directa
    -- ────────────────────────────────────────────
    -- BUG ORIGINAL: "ELSE IF" debe ser "ELSIF" en PL/pgSQL
    ELSIF phase_num BETWEEN 2 AND 3 THEN

        -- BUG ORIGINAL: aliases innecesarios en SELECT con INTO
        SELECT 'W' || game_num, 'L' || game_num
        INTO avanza_w, avanza_l
        FROM game
        WHERE torneo_id = tourn_id
          AND game_num  = ga_num
          AND phas_num  = phase_num;

        RAISE NOTICE 'Slot ganador: %, Slot perdedor: %', avanza_w, avanza_l;

        -- ── Actualizar partido del GANADOR ──
        BEGIN
            -- BUG ORIGINAL: faltaba punto y coma al final del SELECT
            -- BUG ORIGINAL: faltaba STRICT para detectar si no hay filas
            SELECT game_num, game_id,
                CASE
                    WHEN stats_slot_local   = avanza_w THEN 'local'
                    WHEN stats_slot_visitor = avanza_w THEN 'visitor'
                END AS slot_upd
            INTO STRICT resultado
            FROM game
            WHERE torneo_id = tourn_id
              AND (stats_slot_local = avanza_w OR stats_slot_visitor = avanza_w);

            -- BUG ORIGINAL: el UPDATE del ELSE usaba avanza_w en lugar de avanza_w (ok aquí),
            -- pero en el bloque del perdedor ambos UPDATEs usaban avanza_w en vez de avanza_l
            IF resultado.slot_upd = 'local' THEN
                UPDATE game SET "local" = winner
                WHERE torneo_id = tourn_id
                  AND game_id   = resultado.game_id;
            ELSE
                UPDATE game SET visitor = winner
                WHERE torneo_id = tourn_id
                  AND game_id   = resultado.game_id;
            END IF;

            RAISE NOTICE 'Ganador % asignado a game_id: % slot: %',
                winner, resultado.game_id, resultado.slot_upd;

        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE NOTICE 'Sin partido pendiente para slot ganador: %', avanza_w;
            WHEN TOO_MANY_ROWS THEN
                RAISE WARNING 'Múltiples partidos para slot ganador: % — revisar datos', avanza_w;
        END;

        -- ── Actualizar partido del PERDEDOR ──
        BEGIN
            SELECT game_num, game_id,
                CASE
                    WHEN stats_slot_local   = avanza_l THEN 'local'
                    WHEN stats_slot_visitor = avanza_l THEN 'visitor'
                END AS slot_upd
            INTO STRICT resultado
            FROM game
            WHERE torneo_id = tourn_id
              AND (stats_slot_local = avanza_l OR stats_slot_visitor = avanza_l);

            -- BUG ORIGINAL: ambos UPDATE usaban avanza_w en el WHERE en vez de avanza_l
            IF resultado.slot_upd = 'local' THEN
                UPDATE game SET "local" = loser
                WHERE torneo_id = tourn_id
                  AND game_id   = resultado.game_id;
            ELSE
                UPDATE game SET visitor = loser
                WHERE torneo_id = tourn_id
                  AND game_id   = resultado.game_id;
            END IF;

            RAISE NOTICE 'Perdedor % asignado a game_id: % slot: %',
                loser, resultado.game_id, resultado.slot_upd;

        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE NOTICE 'Sin partido pendiente para slot perdedor: %', avanza_l;
            WHEN TOO_MANY_ROWS THEN
                RAISE WARNING 'Múltiples partidos para slot perdedor: % — revisar datos', avanza_l;
        END;

    END IF;

END;
$procedure$
