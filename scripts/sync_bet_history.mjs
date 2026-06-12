import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const DATA_PATH = new URL('../data/weekend_payload.json', import.meta.url);
const HISTORY_PATH = new URL('../data/bet_history.json', import.meta.url);
const EMBEDDED_HISTORY_PATH = new URL('../src/embeddedBetHistory.js', import.meta.url);

function normalise(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAest(value) {
  return new Date(`${value}+10:00`);
}

function runVectorCalculations(marketItem) {
  const truePrice = Number.parseFloat(marketItem.true_price);
  const currentOdds = Number.parseFloat(marketItem.current_odds);

  if (!Number.isFinite(truePrice) || !Number.isFinite(currentOdds) || truePrice <= 1 || currentOdds <= 1) {
    return { ev: 0, qi: 0 };
  }

  const ev = ((currentOdds / truePrice) - 1) * 100;
  const p = 1 / truePrice;
  const b = currentOdds - 1;
  const betSize = Math.ceil((100 / Math.sqrt(b)) / 5) * 5;
  const fraction = betSize / 10000;
  const eg = (p * Math.log(1 + fraction * b) + (1 - p) * Math.log(1 - fraction)) * 100;
  const qi = Math.max(0, Math.min(100, Math.round(50 * (1 + (0.5 * Math.tanh(eg / 0.25) + 0.5 * Math.tanh(ev / 5))))));

  return {
    ev: Number.parseFloat(ev.toFixed(2)),
    qi
  };
}

function betId(fixture, marketItem) {
  const raw = [
    fixture.match_name,
    fixture.kickoff_time_aest,
    marketItem.market_matrix,
    marketItem.target_selection,
    marketItem.au_bookie
  ].map(normalise).join('|');

  return createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

async function readHistory() {
  try {
    return JSON.parse(await readFile(HISTORY_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function clvPercent(openingOdds, closingOdds) {
  if (!Number.isFinite(openingOdds) || !Number.isFinite(closingOdds) || openingOdds <= 1 || closingOdds <= 1) {
    return null;
  }

  return Number.parseFloat((((openingOdds / closingOdds) - 1) * 100).toFixed(2));
}

async function main() {
  const dataset = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  const history = await readHistory();
  const byId = new Map(history.map((entry) => [entry.bet_id, entry]));
  const now = process.env.BETMATE_NOW ? new Date(process.env.BETMATE_NOW) : new Date();
  const nowIso = now.toISOString();

  for (const fixture of dataset) {
    const kickoff = parseAest(fixture.kickoff_time_aest);

    for (const marketItem of fixture.markets || []) {
      const id = betId(fixture, marketItem);
      const metrics = runVectorCalculations(marketItem);
      const currentOdds = Number.parseFloat(marketItem.current_odds);
      const modelPrice = Number.parseFloat(marketItem.true_price);
      const existing = byId.get(id);

      const entry = existing || {
        bet_id: id,
        match_name: fixture.match_name,
        kickoff_time_aest: fixture.kickoff_time_aest,
        market_matrix: marketItem.market_matrix,
        target_selection: marketItem.target_selection,
        au_bookie: marketItem.au_bookie,
        first_seen_at: nowIso,
        opening_odds: currentOdds,
        opening_model_price: modelPrice,
        opening_ev: metrics.ev,
        opening_qi: metrics.qi,
        closing_odds: null,
        closing_captured_at: null,
        clv_percent: null
      };

      entry.current_odds = currentOdds;
      entry.current_model_price = modelPrice;
      entry.current_ev = metrics.ev;
      entry.current_qi = metrics.qi;
      entry.last_seen_at = nowIso;

      if (now >= kickoff && entry.closing_odds === null) {
        entry.closing_odds = currentOdds;
        entry.closing_captured_at = nowIso;
        entry.clv_percent = clvPercent(entry.opening_odds, entry.closing_odds);
      }

      byId.set(id, entry);
    }
  }

  const nextHistory = [...byId.values()].sort((a, b) => {
    const timeDiff = new Date(a.kickoff_time_aest) - new Date(b.kickoff_time_aest);
    if (timeDiff !== 0) return timeDiff;
    return b.current_qi - a.current_qi;
  });

  await writeFile(HISTORY_PATH, `${JSON.stringify(nextHistory, null, 2)}\n`);
  await writeFile(EMBEDDED_HISTORY_PATH, `window.embeddedBetHistory = ${JSON.stringify(nextHistory, null, 2)};\n`);

  console.log(`Synced ${nextHistory.length} bet history rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
