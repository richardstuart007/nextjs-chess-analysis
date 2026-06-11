-- ============================================================================
-- Chess Game Analyzer — Phase 1 Schema (Raw Storage)
-- ============================================================================
-- Database: chessdb
-- Naming: txx_name (tables), xx_column (columns)
-- IDs: xx_yid where yid is consistent across tables (e.g. gr_grid, sa_grid)
-- Run with: npm run migrate
-- ============================================================================

-- tpl_players: player profiles and ratings
CREATE TABLE IF NOT EXISTS tpl_players (
  pl_plid         SERIAL PRIMARY KEY,
  pl_username     VARCHAR(64) NOT NULL UNIQUE,
  pl_avatar       TEXT,
  pl_display_name VARCHAR(128),
  pl_rating_blitz INTEGER
);

-- tplr_player_ratings: latest rating per player per time class
CREATE TABLE IF NOT EXISTS tplr_player_ratings (
  plr_plrid      INTEGER PRIMARY KEY,
  plr_username   VARCHAR(64) NOT NULL,
  plr_time_class VARCHAR(16) NOT NULL,
  plr_rating     INTEGER     NOT NULL,
  UNIQUE(plr_username, plr_time_class)
);

CREATE INDEX IF NOT EXISTS idx_tplr_username ON tplr_player_ratings(plr_username);

-- tgr_gamesraw: raw chess.com API response per game
CREATE TABLE IF NOT EXISTS tgr_gamesraw (
  gr_grid            SERIAL PRIMARY KEY,
  gr_player_username VARCHAR(64) NOT NULL,
  gr_chesscom_uuid   VARCHAR(64) NOT NULL UNIQUE,
  gr_raw_data        JSONB NOT NULL,
  gr_pgn             TEXT,
  gr_end_time        INTEGER NOT NULL,
  gr_time_class      VARCHAR(16)
);

CREATE INDEX IF NOT EXISTS idx_tgr_player  ON tgr_gamesraw(gr_player_username);
CREATE INDEX IF NOT EXISTS idx_tgr_end_time ON tgr_gamesraw(gr_end_time DESC);
CREATE INDEX IF NOT EXISTS idx_tgr_has_pgn  ON tgr_gamesraw(gr_grid) WHERE gr_pgn IS NOT NULL;


-- tgd_gamesdecon: deconstructed game data extracted from raw
CREATE TABLE IF NOT EXISTS tgd_gamesdecon (
  gd_gdid              SERIAL PRIMARY KEY,
  gd_grid              INTEGER NOT NULL,
  gd_white_username    VARCHAR(64) NOT NULL,
  gd_black_username    VARCHAR(64) NOT NULL,
  gd_white_rating      INTEGER NOT NULL,
  gd_black_rating      INTEGER NOT NULL,
  gd_player_username   VARCHAR(64) NOT NULL,
  gd_player_color      VARCHAR(5) NOT NULL,
  gd_player_result     VARCHAR(8) NOT NULL,
  gd_opponent_username VARCHAR(64) NOT NULL,
  gd_opponent_rating   INTEGER NOT NULL,
  gd_time_class        VARCHAR(16) NOT NULL,
  gd_time_control      VARCHAR(32),
  gd_is_rated          BOOLEAN NOT NULL DEFAULT TRUE,
  gd_termination       VARCHAR(64),
  gd_end_time          INTEGER NOT NULL,
  gd_eco_code          VARCHAR(8),
  gd_opening_name      TEXT,
  gd_game_url          TEXT,
  gd_opening_moves     TEXT
);

CREATE UNIQUE INDEX idx_tgd_grid ON tgd_gamesdecon(gd_grid);
CREATE INDEX idx_tgd_player ON tgd_gamesdecon(gd_player_username);
CREATE INDEX idx_tgd_end_time ON tgd_gamesdecon(gd_end_time DESC);
CREATE INDEX idx_tgd_eco ON tgd_gamesdecon(gd_eco_code);
CREATE INDEX idx_tgd_opponent ON tgd_gamesdecon(gd_opponent_username);
CREATE INDEX idx_tgd_result ON tgd_gamesdecon(gd_player_result);
CREATE INDEX idx_tgd_time_class ON tgd_gamesdecon(gd_time_class);

-- tec_ecoreference: ECO code to opening name lookup
CREATE TABLE IF NOT EXISTS tec_ecoreference (
  ec_ecid          SERIAL PRIMARY KEY,
  ec_eco_code      VARCHAR(8) NOT NULL,
  ec_opening_name  TEXT NOT NULL,
  UNIQUE(ec_eco_code, ec_opening_name)
);

CREATE INDEX idx_tec_code ON tec_ecoreference(ec_eco_code);

-- ============================================================================
-- Chess Analysis System — Phase 2 Schema
-- New tables only — no existing tables altered
-- ============================================================================

-- ten_enrichment: per-game enrichment data (separate from tgr_gamesraw)
CREATE TABLE IF NOT EXISTS ten_enrichment (
  en_enid              SERIAL PRIMARY KEY,
  en_grid              INTEGER NOT NULL,
  en_player            VARCHAR(64) NOT NULL,
  en_termination       TEXT,
  en_time_loss_flag    CHAR(10),
  en_final_cp          INTEGER,
  en_volatility        INTEGER,
  en_lead_changes      INTEGER,
  en_max_advantage     INTEGER,
  en_max_disadvantage  INTEGER,
  en_phase_lost        CHAR(12),
  en_critical_move     INTEGER,
  en_critical_cp_drop  INTEGER,
  en_critical_fen      TEXT,
  en_avg_cp_loss       NUMERIC(6,1),
  en_blunders          INTEGER,
  en_mistakes          INTEGER,
  en_accuracy          NUMERIC(5,1),
  en_enriched          BOOLEAN DEFAULT FALSE,
  UNIQUE(en_grid, en_player)
);

CREATE INDEX IF NOT EXISTS idx_ten_grid ON ten_enrichment(en_grid);
CREATE INDEX IF NOT EXISTS idx_ten_player ON ten_enrichment(en_player);
CREATE INDEX IF NOT EXISTS idx_ten_enriched ON ten_enrichment(en_enriched);

-- tpos_positions: unique chess positions reached (keyed by FEN)
CREATE TABLE IF NOT EXISTS tpos_positions (
  pos_id        SERIAL PRIMARY KEY,
  pos_fen       TEXT NOT NULL UNIQUE,
  pos_reached   INTEGER DEFAULT 0,
  pos_color     CHAR(1),
  pos_depth_avg NUMERIC(5,1)
);

CREATE INDEX IF NOT EXISTS idx_tpos_reached ON tpos_positions(pos_reached DESC);

-- teva_evaluations: Stockfish evaluations per position and move
CREATE TABLE IF NOT EXISTS teva_evaluations (
  eva_id        SERIAL PRIMARY KEY,
  eva_pos_fen   TEXT NOT NULL,
  eva_move_san  TEXT,
  eva_cp        INTEGER,
  eva_mate      INTEGER,
  eva_best_move TEXT,
  eva_depth     INTEGER DEFAULT 20,
  UNIQUE(eva_pos_fen, eva_move_san)
);

CREATE INDEX IF NOT EXISTS idx_teva_pos ON teva_evaluations(eva_pos_fen);

-- tins_insights: AI-generated coaching insights per position
CREATE TABLE IF NOT EXISTS tins_insights (
  ins_id        SERIAL PRIMARY KEY,
  ins_pos_fen   TEXT NOT NULL UNIQUE,
  ins_theme     TEXT,
  ins_advice    TEXT,
  ins_priority  NUMERIC(8,2)
);

CREATE INDEX IF NOT EXISTS idx_tins_priority ON tins_insights(ins_priority DESC);

-- tgam_game_positions: per-game position hits
CREATE TABLE IF NOT EXISTS tgam_game_positions (
  gam_id            SERIAL PRIMARY KEY,
  gam_game_ref      TEXT NOT NULL,
  gam_player        TEXT NOT NULL,
  gam_pos_fen       TEXT NOT NULL,
  gam_move_played   TEXT NOT NULL,
  gam_move_uci      TEXT,
  gam_resulting_fen TEXT,
  gam_move_num      INTEGER,
  gam_cp_loss       INTEGER,
  gam_result        VARCHAR(5),
  gam_is_habit      BOOLEAN,
  gam_is_improved   BOOLEAN
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tgam_game_pos ON tgam_game_positions(gam_game_ref, gam_player, gam_pos_fen);
CREATE INDEX IF NOT EXISTS idx_tgam_player ON tgam_game_positions(gam_player);
CREATE INDEX IF NOT EXISTS idx_tgam_game ON tgam_game_positions(gam_game_ref);
CREATE INDEX IF NOT EXISTS idx_tgam_fen ON tgam_game_positions(gam_pos_fen);

-- tbre_briefings: briefing reports
CREATE TABLE IF NOT EXISTS tbre_briefings (
  bre_id         SERIAL PRIMARY KEY,
  bre_player     TEXT NOT NULL,
  bre_type       CHAR(1) NOT NULL,
  bre_date_from  DATE NOT NULL,
  bre_date_to    DATE NOT NULL,
  bre_games_ct   INTEGER DEFAULT 0,
  bre_mistakes   INTEGER DEFAULT 0,
  bre_improved   INTEGER DEFAULT 0,
  bre_narrative  TEXT
);

CREATE INDEX IF NOT EXISTS idx_tbre_player ON tbre_briefings(bre_player);

-- tbrd_briefing_detail: briefing detail rows
CREATE TABLE IF NOT EXISTS tbrd_briefing_detail (
  brd_id          SERIAL PRIMARY KEY,
  brd_bre_id      INTEGER,
  brd_pos_fen     TEXT NOT NULL,
  brd_move_played TEXT NOT NULL,
  brd_move_num    INTEGER,
  brd_cp_loss     INTEGER,
  brd_is_habit    BOOLEAN,
  brd_is_improved BOOLEAN,
  brd_game_ref    TEXT NOT NULL,
  brd_player      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tbrd_briefing ON tbrd_briefing_detail(brd_bre_id);

-- tqui_quiz: quiz session tracking
CREATE TABLE IF NOT EXISTS tqui_quiz (
  qui_id          SERIAL PRIMARY KEY,
  qui_session     TEXT NOT NULL,
  qui_pos_fen     TEXT NOT NULL,
  qui_move_played TEXT,
  qui_correct     BOOLEAN,
  qui_cp_loss     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tqui_session ON tqui_quiz(qui_session);

-- tgev_game_evals: per-move Stockfish evaluations from the /analyze single-game page
CREATE TABLE IF NOT EXISTS tgev_game_evals (
  gev_gevid          SERIAL      PRIMARY KEY,
  gev_game_ref       VARCHAR(64) NOT NULL,
  gev_player         VARCHAR(64) NOT NULL,
  gev_move_num       SMALLINT    NOT NULL,
  gev_san            TEXT        NOT NULL,
  gev_fen_before     TEXT        NOT NULL,
  gev_fen_after      TEXT        NOT NULL,
  gev_cp             INTEGER,
  gev_cp_before      INTEGER,
  gev_cp_loss        INTEGER,
  gev_best_move      TEXT,
  gev_best_move_san  TEXT,
  gev_best_line      JSONB,
  gev_classification VARCHAR(12),
  gev_depth          SMALLINT,
  UNIQUE(gev_game_ref, gev_player, gev_move_num)
);

CREATE INDEX IF NOT EXISTS idx_tgev_game   ON tgev_game_evals(gev_game_ref);
CREATE INDEX IF NOT EXISTS idx_tgev_player ON tgev_game_evals(gev_player);

-- tpip_pipelinelog: timing log for each pipeline batch run
CREATE TABLE IF NOT EXISTS tpip_pipelinelog (
  pip_pipid        SERIAL       PRIMARY KEY,
  pip_step         SMALLINT     NOT NULL,
  pip_step_name    VARCHAR(64)  NOT NULL DEFAULT '',
  pip_date_from    VARCHAR(10)  DEFAULT NULL,
  pip_date_to      VARCHAR(10)  DEFAULT NULL,
  pip_start         INTEGER      NOT NULL DEFAULT 0,
  pip_remaining     INTEGER      NOT NULL DEFAULT 0,
  pip_finish         INTEGER      NOT NULL DEFAULT 0,
  pip_attempted    INTEGER      NOT NULL DEFAULT 0,
  pip_processed    INTEGER      NOT NULL DEFAULT 0,
  pip_errors       INTEGER      NOT NULL DEFAULT 0,
  pip_skipped      INTEGER      NOT NULL DEFAULT 0,
  pip_duration_ms  INTEGER      NOT NULL DEFAULT 0
);
