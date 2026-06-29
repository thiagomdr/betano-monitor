import * as SQLite from 'expo-sqlite';

import type { GamePeriod, GameState, ParsedGame } from '../types/game';
import { buildGameKeyFromGame } from './parseLocal';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('monitor.db');
  }
  return dbPromise;
}

export async function initStore(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS game_state (
      game_key TEXT PRIMARY KEY NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      league TEXT,
      last_period TEXT NOT NULL,
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      alert_sent INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}

export async function getGameState(gameKey: string): Promise<GameState | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    game_key: string;
    home_team: string;
    away_team: string;
    league: string | null;
    last_period: string;
    home_score: number;
    away_score: number;
    alert_sent: number;
    updated_at: string;
  }>('SELECT * FROM game_state WHERE game_key = ?', [gameKey]);

  if (!row) return null;

  return {
    gameKey: row.game_key,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    league: row.league,
    period: row.last_period as GamePeriod,
    homeScore: row.home_score,
    awayScore: row.away_score,
    alertSent: row.alert_sent === 1,
    updatedAt: row.updated_at,
  };
}

export async function upsertGameState(game: ParsedGame): Promise<GameState> {
  const db = await getDb();
  const gameKey = buildGameKeyFromGame(game);
  const existing = await getGameState(gameKey);
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO game_state (
      game_key, home_team, away_team, league, last_period,
      home_score, away_score, alert_sent, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(game_key) DO UPDATE SET
      home_team = excluded.home_team,
      away_team = excluded.away_team,
      league = excluded.league,
      last_period = excluded.last_period,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      updated_at = excluded.updated_at`,
    [
      gameKey,
      game.homeTeam,
      game.awayTeam,
      game.league,
      game.period,
      game.homeScore,
      game.awayScore,
      existing?.alertSent ? 1 : 0,
      now,
    ],
  );

  return (await getGameState(gameKey))!;
}

export async function markAlertSent(gameKey: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE game_state SET alert_sent = 1, updated_at = ? WHERE game_key = ?',
    [new Date().toISOString(), gameKey],
  );
}
