export type GamePeriod =
  | 'Q1'
  | 'Q2'
  | 'Q3'
  | 'Q4'
  | 'Intervalo'
  | 'OT'
  | 'unknown';

export interface ParsedGame {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period: GamePeriod;
  league: string | null;
}

export interface GameState extends ParsedGame {
  gameKey: string;
  alertSent: boolean;
  updatedAt: string;
}

export interface ScrapeResult {
  text: string;
  scrapedAt: string;
}
