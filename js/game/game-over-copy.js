import { getPercentileByMode, getComparisonLabelByMode } from './leaderboard-insights.js';

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

function buildLegacyNextTargetCopy({ score, rankPosition, entries }) {
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

function buildInsightsComparison(insights) {
  const mode = insights?.comparisonMode || 'none';
  if (mode === 'none') {
    return {
      text: 'Прогресс засчитан. Попробуй ещё раз!',
      isPercentileVisible: false,
      mode
    };
  }

  const percentileValue = getPercentileByMode(mode, insights);
  if (!Number.isFinite(percentileValue)) {
    return {
      text: 'Результат сохранён. Следующий заезд будет сильнее!',
      isPercentileVisible: false,
      mode
    };
  }

  return {
    text: getComparisonLabelByMode(mode).replace('X%', `${Math.round(percentileValue)}%`),
    isPercentileVisible: true,
    mode,
    percentile: Math.round(percentileValue)
  };
}

function buildInsightsTarget(insights, fallbackText) {
  const recommended = insights?.recommendedTarget;
  const list = Array.isArray(insights?.nextTargets) ? insights.nextTargets.filter(Boolean).slice(0, 3) : [];

  if (!recommended) {
    return {
      text: fallbackText,
      hasRecommendedTarget: false,
      list
    };
  }

  const delta = Number(recommended.delta);
  const safeDelta = Number.isFinite(delta) ? Math.max(0, Math.round(delta)) : 0;
  return {
    text: `Next: +${safeDelta} to ${recommended.label}`,
    hasRecommendedTarget: true,
    target: {
      type: recommended.type || 'unknown',
      label: recommended.label,
      delta: safeDelta
    },
    list
  };
}

function buildGameOverSummary({ score, runIndex, bestScoreBeforeRun, bestScoreAfterRun, entries, playerPosition, playerInsights }) {
  const isFirstRunLocal = runIndex <= 1;
  const hasPersonalBest = bestScoreAfterRun > Math.max(0, Number(bestScoreBeforeRun) || 0);
  const nextRankScore = Number.isFinite(playerPosition) && playerPosition > 1
    ? getTopScoreByRank(entries, playerPosition - 1)
    : null;
  const isCloseToPersonalBest = Number.isFinite(bestScoreAfterRun) && bestScoreAfterRun > 0
    && Math.abs(bestScoreAfterRun - score) <= 100;

  const insights = playerInsights || null;
  const isFirstRun = insights?.isFirstRun ?? isFirstRunLocal;
  const isPersonalBest = insights?.isPersonalBest ?? hasPersonalBest;
  const fallbackType = insights?.comparisonTextFallbackType || null;

  let title = 'GOOD RUN!';
  if (isFirstRun) title = 'FIRST RUN!';
  else if (isPersonalBest) title = 'NEW RECORD!';
  else if (isCloseToPersonalBest) title = 'PERSONAL BEST!';
  else if (fallbackType === 'weak_first_run' || fallbackType === 'weak_repeat_run') title = 'JUST A BIT MORE!';

  const legacyComparison = buildPercentileCopy({
    score,
    runIndex,
    hasPersonalBest,
    rankPosition: playerPosition
  }) || (isFirstRun ? 'Getting started!' : 'Let’s do better.');

  const comparison = insights
    ? buildInsightsComparison(insights)
    : {
      text: legacyComparison,
      isPercentileVisible: true,
      mode: 'legacy'
    };

  const fallbackTargetText = buildLegacyNextTargetCopy({ score, rankPosition: playerPosition, entries });
  const nextTarget = insights
    ? buildInsightsTarget(insights, fallbackTargetText)
    : { text: fallbackTargetText, hasRecommendedTarget: false, list: [] };

  return {
    title,
    comparison,
    nextTarget,
    meta: {
      fallbackType,
      comparisonMode: comparison.mode,
      hasInsights: Boolean(insights)
    }
  };
}

export {
  buildGameOverSummary,
  buildInsightsComparison,
  buildInsightsTarget
};
