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

function getRankByScore(entries, score) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const scoreNow = Math.max(0, Number(score) || 0);
  const betterCount = entries.filter((entry) => Number(entry?.score ?? entry?.bestScore ?? 0) > scoreNow).length;
  return betterCount + 1;
}

function getScoreDeltaToRank(entries, targetRank, score) {
  const scoreNow = Math.max(0, Number(score) || 0);
  const targetScore = getTopScoreByRank(entries, targetRank);
  if (!targetScore) return null;
  return Math.max(0, targetScore - scoreNow + 1);
}

function normalizePrompt(prompt) {
  if (!prompt || typeof prompt !== 'object') return null;
  return {
    title: String(prompt.title || '').trim(),
    hook: String(prompt.hook || '').trim(),
    boost: String(prompt.boost || '').trim(),
    rank: Number.isFinite(Number(prompt.rank)) ? Number(prompt.rank) : null,
    leaderboardSlice: prompt.leaderboardSlice && typeof prompt.leaderboardSlice === 'object'
      ? prompt.leaderboardSlice
      : null
  };
}

function getAchievedRank({ playerPosition, insights, prompt }) {
  if (Number.isFinite(Number(playerPosition)) && Number(playerPosition) > 0) return Number(playerPosition);
  if (Number.isFinite(Number(insights?.rank)) && Number(insights.rank) > 0) return Number(insights.rank);
  if (Number.isFinite(Number(prompt?.rank)) && Number(prompt.rank) > 0) return Number(prompt.rank);
  return null;
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

function buildLocalMotivationCopy({
  score,
  rankPosition,
  isFirstRun,
  isPersonalBest,
  bestScoreAfterRun,
  entries,
  insights
}) {
  const scoreNow = Math.max(0, Number(score) || 0);
  const rank = Number.isFinite(rankPosition) && rankPosition > 0 ? rankPosition : getRankByScore(entries, scoreNow);
  const percentile = Math.round(Number(getPercentileByMode(insights?.comparisonMode || 'none', insights) || 0));
  const scoreToNextRank = Number.isFinite(rank) && rank > 1 ? getScoreDeltaToRank(entries, rank - 1, scoreNow) : null;
  const scoreToTop1 = getScoreDeltaToRank(entries, 1, scoreNow);
  const scoreToTop3 = getScoreDeltaToRank(entries, 3, scoreNow);

  if (Number.isFinite(rank) && rank === 1) {
    return {
      title: '👑 NEW LEADER!',
      comparison: 'No one is above you.',
      nextTarget: '',
      hasRecommendedTarget: false,
      target: null
    };
  }

  if (Number.isFinite(rank) && rank <= 3) {
    return {
      title: '💥 YOU MADE IT TO TOP 3!',
      comparison: rank === 2 ? 'Only a few are ahead of you.' : 'You’re among the best players.',
      nextTarget: scoreToTop1 ? `Next +${scoreToTop1} to #1` : '',
      hasRecommendedTarget: Boolean(scoreToTop1),
      target: scoreToTop1 ? { type: 'rank', label: '#1', delta: scoreToTop1 } : null
    };
  }

  if (Number.isFinite(rank) && rank <= 10) {
    return {
      title: 'NEW RECORD!',
      comparison: rank <= 5 ? 'You’re among the best players.' : 'Only a few are ahead of you.',
      nextTarget: scoreToTop3 ? `+${scoreToTop3} points to TOP 3` : '',
      hasRecommendedTarget: Boolean(scoreToTop3),
      target: scoreToTop3 ? { type: 'rank', label: 'TOP 3', delta: scoreToTop3 } : null
    };
  }

  if (scoreToNextRank !== null && scoreToNextRank < 10) {
    return {
      title: 'SO CLOSE!',
      comparison: '',
      nextTarget: `+${scoreToNextRank} points to pass the next player`,
      hasRecommendedTarget: true,
      target: { type: 'rank', label: 'next rank', delta: scoreToNextRank }
    };
  }

  if (isFirstRun) {
    const strongFirstRun = percentile >= 60;
    const weakFirstRun = scoreNow <= 250;
    return {
      title: 'FIRST RUN!',
      comparison: strongFirstRun ? 'You’re off to a great start.' : 'Nice start.',
      nextTarget: strongFirstRun
        ? `Better than ${Math.max(60, percentile)}% of new players`
        : weakFirstRun
          ? 'Let’s beat it — you can go further.'
          : `+${Math.max(1, scoreToNextRank || 120)} to beat your best`,
      hasRecommendedTarget: !strongFirstRun,
      target: !strongFirstRun
        ? { type: 'score', label: 'your best', delta: Math.max(1, scoreToNextRank || 120) }
        : null
    };
  }

  if (isPersonalBest && Number.isFinite(rank)) {
    if (rank <= 100) {
      return {
        title: 'PERSONAL BEST!',
        comparison: 'You’re in TOP 100!',
        nextTarget: `+${Math.max(1, scoreToNextRank || 120)} points to break in`,
        hasRecommendedTarget: true,
        target: { type: 'rank', label: 'next place', delta: Math.max(1, scoreToNextRank || 120) }
      };
    }
    if (rank <= 1000) {
      return {
        title: 'PERSONAL BEST!',
        comparison: 'You’re in TOP 1000!',
        nextTarget: `+${Math.max(1, scoreToNextRank || 120)} points to break in`,
        hasRecommendedTarget: true,
        target: { type: 'rank', label: 'next place', delta: Math.max(1, scoreToNextRank || 120) }
      };
    }
    if (rank <= 10000) {
      return {
        title: 'PERSONAL BEST!',
        comparison: 'You’re in TOP 10000!',
        nextTarget: `+${Math.max(1, scoreToNextRank || 120)} points to break in`,
        hasRecommendedTarget: true,
        target: { type: 'rank', label: 'next place', delta: Math.max(1, scoreToNextRank || 120) }
      };
    }
  }

  const closeToBest = Number.isFinite(bestScoreAfterRun) && bestScoreAfterRun > 0 && Math.abs(bestScoreAfterRun - scoreNow) <= 100;
  const hasBestToChase = !closeToBest && Number.isFinite(bestScoreAfterRun) && bestScoreAfterRun > scoreNow;
  const weakRun = insights?.comparisonTextFallbackType === 'weak_first_run' || insights?.comparisonTextFallbackType === 'weak_repeat_run' || scoreNow < 300;
  const midRun = scoreNow < 900;
  const deltaToBest = hasBestToChase ? bestScoreAfterRun - scoreNow : null;
  return {
    title: 'GOOD RUN!',
    comparison: closeToBest ? 'Almost a new best.' : weakRun ? 'Warm-up run.' : midRun ? 'Keep climbing.' : 'You can beat this.',
    nextTarget: closeToBest
      ? `Only +${Math.max(1, Math.abs(bestScoreAfterRun - scoreNow) + 1)} to your record`
      : hasBestToChase
        ? `Beat your best score ${bestScoreAfterRun}`
        : `+${Math.max(1, scoreToNextRank || 120)} to the next rank`,
    hasRecommendedTarget: true,
    target: hasBestToChase
      ? { type: 'score', label: 'your best', delta: deltaToBest }
      : { type: 'rank', label: 'next rank', delta: Math.max(1, scoreToNextRank || 120) }
  };
}

function buildGameOverSummary({ score, runIndex, bestScoreBeforeRun, bestScoreAfterRun, entries, playerPosition, playerInsights, gameOverPrompt, isAuthenticated = true }) {
  const isFirstRunLocal = runIndex <= 1;
  const hasPersonalBest = bestScoreAfterRun > Math.max(0, Number(bestScoreBeforeRun) || 0);

  const insights = playerInsights || null;
  const prompt = normalizePrompt(gameOverPrompt);
  const isFirstRun = insights?.isFirstRun ?? isFirstRunLocal;
  const isPersonalBest = insights?.isPersonalBest ?? hasPersonalBest;
  const fallbackType = insights?.comparisonTextFallbackType || null; // analytics compatibility
  const achievedRank = getAchievedRank({ playerPosition, insights, prompt });
  const boostText = isAuthenticated && isPersonalBest && Number.isFinite(achievedRank) ? `You’re #${achievedRank}` : '';

  if (!isAuthenticated) {
    const practiceRank = Number.isFinite(prompt?.rank) ? prompt.rank : getRankByScore(entries, score);
    const practicePercent = Math.max(0, Math.round(Number(getPercentileByMode(insights?.comparisonMode || 'none', insights) || 0)));
    const betterThanText = practicePercent >= 60 ? `Better than ${practicePercent}% of new players` : '';
    const rankAndSaveText = Number.isFinite(practiceRank)
      ? `Your rank #${practiceRank} • Save your score & climb the leaderboard`
      : 'Save your score & climb the leaderboard';
    return {
      title: prompt?.title || 'GOOD RUN!',
      boostText,
      comparison: {
        text: prompt?.hook || 'You’re playing in practice mode',
        isPercentileVisible: false,
        mode: 'practice'
      },
      nextTarget: {
        text: prompt?.boost || (betterThanText || rankAndSaveText),
        hasRecommendedTarget: false,
        list: []
      },
      meta: {
        fallbackType,
        comparisonMode: 'practice',
        hasInsights: Boolean(insights),
        promptRank: prompt?.rank ?? null
      }
    };
  }

  if (prompt?.title || prompt?.hook || prompt?.boost) {
    return {
      title: prompt?.title || 'GOOD RUN!',
      boostText,
      comparison: {
        text: prompt?.hook || 'Keep climbing.',
        isPercentileVisible: false,
        mode: 'backend_prompt'
      },
      nextTarget: {
        text: prompt?.boost || '',
        hasRecommendedTarget: false,
        list: []
      },
      meta: {
        fallbackType,
        comparisonMode: 'backend_prompt',
        hasInsights: Boolean(insights),
        promptRank: prompt?.rank ?? null
      }
    };
  }

  const local = buildLocalMotivationCopy({
    score,
    rankPosition: playerPosition,
    isFirstRun,
    isPersonalBest,
    bestScoreAfterRun,
    entries,
    insights
  });
  const comparison = { text: local.comparison, isPercentileVisible: false, mode: 'local_rules' };

  const fallbackTargetText = buildLegacyNextTargetCopy({ score, rankPosition: playerPosition, entries });
  const nextTarget = insights
    ? buildInsightsTarget(insights, fallbackTargetText)
    : { text: fallbackTargetText, hasRecommendedTarget: false, list: [] };
  const localNextTarget = local.nextTarget || nextTarget.text;

  return {
    title: local.title,
    boostText,
    comparison,
    nextTarget: {
      ...nextTarget,
      text: localNextTarget,
      hasRecommendedTarget: local.hasRecommendedTarget ?? nextTarget.hasRecommendedTarget,
      target: local.target ?? nextTarget.target
    },
    meta: {
      fallbackType,
      comparisonMode: comparison.mode,
      hasInsights: Boolean(insights),
      promptRank: prompt?.rank ?? null
    }
  };
}

export {
  buildGameOverSummary,
  buildInsightsComparison,
  buildInsightsTarget
};
