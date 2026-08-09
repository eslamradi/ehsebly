import type { Env } from '../env';
import { jsonResponse } from '../http';
import type { RouteHandler } from '../router';
import { errorResponse } from '../errors';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.ADMIN_DASHBOARD_TOKEN) {
    return false;
  }
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  return token.length > 0 && timingSafeEqual(token, env.ADMIN_DASHBOARD_TOKEN);
}

type PeriodStats = {
  total_requests: number;
  accepted_count: number;
  total_cost_usd: number | null;
  gemini_cost_usd: number | null;
  sonnet_cost_usd: number | null;
};

const EMPTY_PERIOD_STATS: PeriodStats = {
  total_requests: 0,
  accepted_count: 0,
  total_cost_usd: 0,
  gemini_cost_usd: 0,
  sonnet_cost_usd: 0,
};

type DailyRow = {
  day: string;
  requests: number;
  accepted_count: number;
  total_cost_usd: number | null;
};

type RecentRow = {
  id: number;
  outcome: string;
  gemini_input_tokens: number | null;
  gemini_output_tokens: number | null;
  gemini_cost_usd: number | null;
  sonnet_used: number;
  sonnet_input_tokens: number | null;
  sonnet_output_tokens: number | null;
  sonnet_cost_usd: number | null;
  total_cost_usd: number;
  created_at: string;
};

const PERIOD_STATS_COLUMNS = `
  COUNT(*) AS total_requests,
  SUM(CASE WHEN outcome = 'accepted' THEN 1 ELSE 0 END) AS accepted_count,
  SUM(total_cost_usd) AS total_cost_usd,
  SUM(COALESCE(gemini_cost_usd, 0)) AS gemini_cost_usd,
  SUM(COALESCE(sonnet_cost_usd, 0)) AS sonnet_cost_usd
`;

/**
 * GET /admin/stats — the dashboard's only data source. Read-only aggregate
 * queries over extraction_requests (populated by extract.ts's
 * recordExtractionRequest on every extraction call); no request-side
 * pagination/filtering since the table is small enough for a handful of
 * full-table aggregates to stay fast.
 */
export const getAdminStatsRoute: RouteHandler<Env> = async (request, env) => {
  if (!isAuthorized(request, env)) {
    return errorResponse('unauthorized', 401);
  }

  const [overall, last24h, last7d, daily, recent] = await Promise.all([
    env.DB.prepare(`SELECT ${PERIOD_STATS_COLUMNS} FROM extraction_requests`).first<PeriodStats>(),
    env.DB
      .prepare(`SELECT ${PERIOD_STATS_COLUMNS} FROM extraction_requests WHERE created_at >= datetime('now', '-1 day')`)
      .first<PeriodStats>(),
    env.DB
      .prepare(`SELECT ${PERIOD_STATS_COLUMNS} FROM extraction_requests WHERE created_at >= datetime('now', '-7 days')`)
      .first<PeriodStats>(),
    env.DB
      .prepare(
        `SELECT
           date(created_at) AS day,
           COUNT(*) AS requests,
           SUM(CASE WHEN outcome = 'accepted' THEN 1 ELSE 0 END) AS accepted_count,
           SUM(total_cost_usd) AS total_cost_usd
         FROM extraction_requests
         WHERE created_at >= datetime('now', '-30 days')
         GROUP BY day
         ORDER BY day ASC`,
      )
      .all<DailyRow>(),
    env.DB
      .prepare(
        `SELECT id, outcome, gemini_input_tokens, gemini_output_tokens, gemini_cost_usd,
                sonnet_used, sonnet_input_tokens, sonnet_output_tokens, sonnet_cost_usd,
                total_cost_usd, created_at
         FROM extraction_requests
         ORDER BY id DESC
         LIMIT 50`,
      )
      .all<RecentRow>(),
  ]);

  return jsonResponse({
    status: 'ok',
    overall: overall ?? EMPTY_PERIOD_STATS,
    last_24h: last24h ?? EMPTY_PERIOD_STATS,
    last_7d: last7d ?? EMPTY_PERIOD_STATS,
    daily: daily.results,
    recent: recent.results,
  });
};
