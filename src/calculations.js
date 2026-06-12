function runVectorCalculations(marketItem) {
  const truePrice = Number.parseFloat(marketItem.true_price);
  const currentOdds = Number.parseFloat(marketItem.current_odds);

  if (!Number.isFinite(truePrice) || !Number.isFinite(currentOdds) || truePrice <= 1 || currentOdds <= 1) {
    return { ev: 0, qi: 0, bet_size: 0, expected_growth: 0 };
  }

  const ev = ((currentOdds / truePrice) - 1) * 100;
  const p = 1 / truePrice;
  const b = currentOdds - 1;
  const standardBet = 100;
  const betSize = Math.ceil((standardBet / Math.sqrt(b)) / 5) * 5;
  const fractionalFaction = betSize / 10000;

  const expectedGrowth = (
    p * Math.log(1 + fractionalFaction * b) +
    (1 - p) * Math.log(1 - fractionalFaction)
  ) * 100;

  const termEg = Math.tanh(expectedGrowth / 0.25);
  const termEv = Math.tanh(ev / 5);
  const rawQi = Math.round(50 * (1 + (0.5 * termEg + 0.5 * termEv)));
  const qi = Math.max(0, Math.min(100, rawQi));

  return {
    ev: Number.parseFloat(ev.toFixed(2)),
    qi: Number.parseInt(qi, 10),
    bet_size: betSize,
    expected_growth: Number.parseFloat(expectedGrowth.toFixed(4))
  };
}

function flattenMarkets(dataset) {
  return dataset.flatMap((fixture, fixtureIndex) =>
    fixture.markets.map((market, marketIndex) => ({
      ...market,
      fixture_index: fixtureIndex,
      market_index: marketIndex,
      match_name: fixture.match_name,
      kickoff_time_aest: fixture.kickoff_time_aest,
      metrics: runVectorCalculations(market)
    }))
  );
}

window.runVectorCalculations = runVectorCalculations;
window.flattenMarkets = flattenMarkets;
