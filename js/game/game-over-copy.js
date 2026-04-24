function buildPercentileCopy({ score, runIndex, hasPersonalBest, rankPosition }) {
  if (Number.isFinite(rankPosition) && rankPosition > 0 && rankPosition <= 100) {
    const beatPercent = Math.max(1, Math.min(99, 100 - Math.round(rankPosition)));
    return `You beat ${beatPercent}% of players.`;
  }
  if (score >= 1200) return 'You outscored most first-run players.';
  if (score >= 600) return 'Solid pace — better than many first attempts.';
  if (runIndex <= 1) return 'You’re just getting started.';
  return hasPersonalBest ? 'Warm-up run.' : 'You can beat this.';
}

function getTopScoreByRank(entries, rank) {
  if (!Array.isArray(entries) || rank < 1) return null;
  const item = entries[rank - 1];
  const value = Number(item?.bestScore ?? item?.score ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildNextTargetCopy({ score, rankPosition, entries }) {
  const scoreNow = Math.max(0, Number(score) || 0);
  if (Number.isFinite(rankPosition) && rankPosition > 0) {
    if (rankPosition <= 10) {
      const targetRank = rankPosition >= 9 ? 7 : Math.max(1, rankPosition - 1);
      const targetScore = getTopScoreByRank(entries, targetRank);
      if (targetScore && targetScore > scoreNow) {
        return `🔥 Push now: +${Math.max(1, targetScore - scoreNow)} to take TOP ${targetRank}!`;
      }
      return '🔥 Top 10 is yours — attack the next place!';
    }
    if (rankPosition <= 100) return '⚡ One more run: break into TOP 10!';
    if (rankPosition <= 1000) return '⚡ Keep momentum: storm TOP 100!';
    if (rankPosition <= 10000) return '⚡ Full throttle: enter TOP 1000!';
    return '⚡ Start your climb: enter TOP 10000!';
  }

  const top10Score = getTopScoreByRank(entries, 10);
  if (top10Score && top10Score > scoreNow) {
    const gap = top10Score - scoreNow;
    if (gap <= 250) return `🔥 You’re close: +${gap} to TOP 10!`;
    if (gap <= 1000) return `🔥 Big leap incoming: +${Math.min(gap, 350)} this run!`;
  }
  return '🔥 Hit PLAY AGAIN and smash your new record!';
}

function buildGameOverSummary({ score, runIndex, bestScoreBeforeRun, bestScoreAfterRun, entries, playerPosition }) {
  const isFirstRun = runIndex <= 1;
  const isInLeaderboard = Number.isFinite(playerPosition) && playerPosition > 0 && playerPosition <= 10;
  const hasPersonalBest = bestScoreAfterRun > Math.max(0, Number(bestScoreBeforeRun) || 0);
  const nextRankScore = Number.isFinite(playerPosition) && playerPosition > 1
    ? getTopScoreByRank(entries, playerPosition - 1)
    : null;
  const isCloseToNextRank = Number.isFinite(nextRankScore) && nextRankScore > score && (nextRankScore - score) <= 150;

  let title = 'GOOD RUN!';
  if (isFirstRun) title = 'FIRST RUN!';
  else if (isInLeaderboard) title = 'NEW RECORD!';
  else if (hasPersonalBest) title = 'PERSONAL BEST!';
  else if (isCloseToNextRank) title = 'JUST A BIT MORE!';

  return {
    title,
    comparison: buildPercentileCopy({
      score,
      runIndex,
      hasPersonalBest,
      rankPosition: playerPosition
    }) || (isFirstRun ? 'Getting started!' : 'Let’s do better.'),
    nextTarget: buildNextTargetCopy({ score, rankPosition: playerPosition, entries })
  };
}

export {
  buildGameOverSummary
};
