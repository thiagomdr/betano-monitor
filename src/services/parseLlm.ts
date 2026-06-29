import { OPENAI_MODEL } from '../constants';
import type { ParsedGame } from '../types/game';
import { validateParsedGames } from './parseLocal';

interface LlmResponse {
  games: Array<{
    home_team: string;
    away_team: string;
    home_score: number | null;
    away_score: number | null;
    period: string;
    league: string | null;
  }>;
}

const SYSTEM_PROMPT = `Você extrai jogos de BASQUETE AO VIVO de texto copiado do site Betano.
Retorne APENAS JSON válido no schema:
{"games":[{"home_team":"string","away_team":"string","home_score":number,"away_score":number,"period":"Q1|Q2|Q3|Q4|Intervalo|OT|unknown","league":"string|null"}]}
Regras:
- Ignore eBasketball, NBA 2K e jogos simulados.
- Se não tiver certeza de placar ou período, use null e omita o jogo.
- Nunca invente dados.`;

export async function parseWithLlm(text: string): Promise<ParsedGame[] | null> {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text.slice(0, 12_000) },
        ],
      }),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as LlmResponse;
    const games: ParsedGame[] = (parsed.games ?? [])
      .filter(
        (g) =>
          g.home_team &&
          g.away_team &&
          g.home_score != null &&
          g.away_score != null &&
          g.period &&
          g.period !== 'unknown',
      )
      .map((g) => ({
        homeTeam: g.home_team,
        awayTeam: g.away_team,
        homeScore: g.home_score as number,
        awayScore: g.away_score as number,
        period: g.period as ParsedGame['period'],
        league: g.league,
      }));

    const valid = validateParsedGames(games);
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}
