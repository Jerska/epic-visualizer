import chalk from 'chalk';

const WIDTH = process.stdout.columns || 100;
const MARKER_WIDTH = 5; // globalMarker (3) + sprintMarker + space
const KEY_WIDTH = 12;
const POINTS_WIDTH = 7;
const PADDING = 4; // 2 spaces indent + 2 spaces between parts
const SUMMARY_WIDTH = WIDTH - MARKER_WIDTH - KEY_WIDTH - POINTS_WIDTH - PADDING;

export function displayCompleted(done) {
  if (done.length === 0) return;

  const line = '━'.repeat(WIDTH);
  const points = done.reduce((sum, issue) => sum + issue.points, 0);

  // Calculate chain lengths based on actual dependencies within completed tasks
  const doneKeys = new Set(done.map((i) => i.key));
  const chainLength = new Map();
  const chainPrev = new Map();

  // Compute levels for done tasks (dependency depth)
  const level = new Map();
  const calcLevel = (key) => {
    if (level.has(key)) return level.get(key);
    const issue = done.find((i) => i.key === key);
    if (!issue) return 0;
    const blockersInDone = issue.blockedBy.filter((b) => doneKeys.has(b));
    if (blockersInDone.length === 0) {
      level.set(key, 1);
      return 1;
    }
    const maxBlockerLevel = Math.max(...blockersInDone.map(calcLevel));
    level.set(key, maxBlockerLevel + 1);
    return maxBlockerLevel + 1;
  };
  for (const issue of done) calcLevel(issue.key);

  // Process in level order to ensure blockers are processed first
  const sortedByLevel = [...done].sort((a, b) => (level.get(a.key) || 0) - (level.get(b.key) || 0));
  for (const issue of sortedByLevel) {
    const blockersInDone = issue.blockedBy.filter((b) => doneKeys.has(b));
    if (blockersInDone.length === 0) {
      chainLength.set(issue.key, issue.points);
      chainPrev.set(issue.key, null);
    } else {
      const blockerChains = blockersInDone.map((b) => ({ key: b, len: chainLength.get(b) || 0 }));
      const maxBlocker = blockerChains.reduce((a, b) => (a.len >= b.len ? a : b));
      chainLength.set(issue.key, maxBlocker.len + issue.points);
      chainPrev.set(issue.key, maxBlocker.key);
    }
  }

  // Find longest chain
  const seqPoints = chainLength.size > 0 ? Math.max(...chainLength.values()) : points;
  const completedCritical = new Set();
  if (done.length > 1 && chainLength.size > 0) {
    let current = [...chainLength.entries()].reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
    while (current) {
      completedCritical.add(current);
      current = chainPrev.get(current);
    }
  }

  console.log();
  const ptsDisplayRaw = seqPoints < points ? `seq ${seqPoints} pts · total ${points} pts` : `${points} pts`;
  const ptsDisplay = seqPoints < points
    ? chalk.gray('seq ') + formatPts(seqPoints) + chalk.gray(' · total ') + formatPts(points)
    : formatPts(points);
  console.log(
    chalk.green.bold(` Completed`) +
      ' '.repeat(Math.max(1, WIDTH - 14 - ptsDisplayRaw.length)) + ptsDisplay
  );
  console.log(chalk.green(line));

  // Sort by chain position
  const inSeq = (i) => completedCritical.has(i.key);
  const bySeqFirst = (a, b) => (inSeq(a) === inSeq(b) ? 0 : inSeq(a) ? -1 : 1);
  const byChainLength = (a, b) => (chainLength.get(a.key) || 0) - (chainLength.get(b.key) || 0);
  const byRank = (a, b) => (a.rank || '').localeCompare(b.rank || '');
  const sorted = [...done].sort((a, b) => bySeqFirst(a, b) || byChainLength(a, b) || byRank(a, b));

  const seqTasks = sorted.filter(inSeq);
  const lastSeqKey = seqTasks.length > 0 ? seqTasks[seqTasks.length - 1].key : null;

  for (const issue of sorted) {
    const isSeqCritical = inSeq(issue);
    const marker = chalk.green(' ✓ '); // 3 chars like globalMarker

    let seqMarker = ' ';
    if (isSeqCritical && seqTasks.length > 1) {
      seqMarker = issue.key === lastSeqKey ? chalk.gray('└') : chalk.gray('│');
    }

    const keyPart = chalk.gray(issue.key.padEnd(KEY_WIDTH));

    const blockersRaw = formatBlockers(issue.blockedBy, SUMMARY_WIDTH);
    const blockersPart = blockersRaw ? chalk.gray(blockersRaw) : '';
    const summaryPart = chalk.gray(truncate(issue.summary, SUMMARY_WIDTH - blockersRaw.length));

    const pointsPart = chalk.white(String(issue.points).padStart(POINTS_WIDTH - 4)) + chalk.gray(' pts');
    console.log(` ${marker}${seqMarker} ${keyPart}${summaryPart}${blockersPart} ${pointsPart}`);
  }
}

export function displaySprints(sprints, { verbose = false, startDate, sprintWeeks } = {}) {
  const line = '━'.repeat(WIDTH);
  let totalPoints = 0;
  const criticalByLevel = new Map();

  const baseYear = startDate ? new Date(startDate).getFullYear() : null;
  const fmtDate = (d) => {
    const opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== baseYear) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  };

  const getSprintDates = (sprintIndex) => {
    if (!startDate || !sprintWeeks) return null;
    const start = new Date(startDate);
    start.setDate(start.getDate() + sprintIndex * sprintWeeks * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + sprintWeeks * 7 - 1);
    return `${fmtDate(start)} – ${fmtDate(end)}`;
  };

  for (let i = 0; i < sprints.length; i++) {
    const sprint = sprints[i];
    const points = sprint.reduce((sum, issue) => sum + issue.points, 0);
    totalPoints += points;

    // Calculate chain lengths based on actual dependencies within sprint
    const sprintKeys = new Set(sprint.map((i) => i.key));
    const chainLength = new Map();
    const chainPrev = new Map(); // Track which blocker contributes to longest chain

    // Process in level order to ensure blockers are processed first
    const sortedByLevel = [...sprint].sort((a, b) => a.level - b.level);
    for (const issue of sortedByLevel) {
      const blockersInSprint = issue.blockedBy.filter((b) => sprintKeys.has(b));
      if (blockersInSprint.length === 0) {
        chainLength.set(issue.key, issue.points);
        chainPrev.set(issue.key, null);
      } else {
        const blockerChains = blockersInSprint.map((b) => ({ key: b, len: chainLength.get(b) || 0 }));
        const maxBlocker = blockerChains.reduce((a, b) => (a.len >= b.len ? a : b));
        chainLength.set(issue.key, maxBlocker.len + issue.points);
        chainPrev.set(issue.key, maxBlocker.key);
      }
    }

    // Find longest chain and trace back to mark critical sequence
    const seqPoints = Math.max(...chainLength.values());
    const sprintCritical = new Set();
    if (sprint.length > 1) {
      // Find end of longest chain
      let current = [...chainLength.entries()].reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
      while (current) {
        sprintCritical.add(current);
        current = chainPrev.get(current);
      }
    }

    console.log();
    const dates = getSprintDates(i);
    const datesRaw = dates ? ` (${dates})` : '';
    const datesDisplay = dates ? chalk.gray(` (${dates})`) : '';
    const ptsDisplayRaw = seqPoints < points ? `seq ${seqPoints} pts · total ${points} pts` : `${points} pts`;
    const ptsDisplay = seqPoints < points
      ? chalk.gray('seq ') + formatPts(seqPoints) + chalk.gray(' · total ') + formatPts(points)
      : formatPts(points);
    const sprintLabel = ` Sprint ${i + 1}`;
    const headerLen = sprintLabel.length + datesRaw.length + ptsDisplayRaw.length;
    console.log(
      chalk.cyan.bold(sprintLabel) + datesDisplay +
        ' '.repeat(Math.max(1, WIDTH - headerLen)) + ptsDisplay
    );
    console.log(chalk.cyan(line));

    // Sort: sequence issues first (by chain position), then non-sequence (by rank)
    const inSeq = (i) => sprintCritical.has(i.key);
    const bySeqFirst = (a, b) => (inSeq(a) === inSeq(b) ? 0 : inSeq(a) ? -1 : 1);
    const byChainLength = (a, b) => (chainLength.get(a.key) || 0) - (chainLength.get(b.key) || 0);
    const byRank = (a, b) => (a.rank || '').localeCompare(b.rank || '');
    const sortedSprint = [...sprint].sort((a, b) => bySeqFirst(a, b) || byChainLength(a, b) || byRank(a, b));

    // Find the last task in the sequence chain
    const seqTasks = sortedSprint.filter(inSeq);
    const lastSeqKey = seqTasks.length > 0 ? seqTasks[seqTasks.length - 1].key : null;

    for (const issue of sortedSprint) {
      const isSprintCritical = inSeq(issue);
      let globalMarker = '   ';
      if (issue.critical) {
        globalMarker = chalk.red(String(issue.level).padStart(2)) + ' ';
      } else if (isSprintCritical) {
        globalMarker = chalk.magenta(' · ');
      }

      let sprintMarker = ' ';
      if (isSprintCritical && seqTasks.length > 1) {
        sprintMarker = issue.key === lastSeqKey ? chalk.magenta('└') : chalk.magenta('│');
      }

      let keyPart = chalk.yellow(issue.key.padEnd(KEY_WIDTH));
      if (issue.critical) {
        keyPart = chalk.red.bold(issue.key.padEnd(KEY_WIDTH));
      } else if (isSprintCritical) {
        keyPart = chalk.magenta(issue.key.padEnd(KEY_WIDTH));
      }

      // Format blockers inline, showing as many as fit
      const blockersRaw = formatBlockers(issue.blockedBy, SUMMARY_WIDTH);
      const blockersPart = blockersRaw ? chalk.gray(blockersRaw) : '';

      const summaryPart = truncate(issue.summary, SUMMARY_WIDTH - blockersRaw.length);
      const pointsPart = chalk.white(String(issue.points).padStart(POINTS_WIDTH - 4)) + chalk.gray(' pts');
      console.log(` ${globalMarker}${sprintMarker} ${keyPart}${summaryPart}${blockersPart} ${pointsPart}`);

      if (issue.critical) {
        if (!criticalByLevel.has(issue.level)) {
          criticalByLevel.set(issue.level, []);
        }
        criticalByLevel.get(issue.level).push(issue);
      }

      // Add blank line after sequence tasks, before non-sequence tasks (only if there's a real sequence)
      const hasNonSeqTasks = sortedSprint.some((i) => !inSeq(i));
      if (issue.key === lastSeqKey && hasNonSeqTasks && seqTasks.length > 1) {
        console.log();
      }
    }
  }

  console.log();
  let endDateDisplay = '';
  if (startDate && sprintWeeks) {
    const end = new Date(startDate);
    end.setDate(end.getDate() + sprints.length * sprintWeeks * 7 - 1);
    endDateDisplay = chalk.green.bold(', ends ') + chalk.white(fmtDate(end));
  }
  console.log(chalk.green.bold('Total: ') + chalk.white(sprints.length) + chalk.green.bold(' sprints, ') + chalk.white(totalPoints) + chalk.green.bold(' points') + endDateDisplay);
  console.log(chalk.gray(`Legend: `) + chalk.red('N') + chalk.gray(' = critical path step · ') + chalk.magenta('·│└') + chalk.gray(' = sprint sequence'));

  // Display critical path grouped by level (only in verbose mode)
  if (verbose && criticalByLevel.size > 0) {
    const levels = [...criticalByLevel.keys()].sort((a, b) => a - b);
    const maxPointsPerLevel = levels.map((lvl) => Math.max(...criticalByLevel.get(lvl).map((i) => i.points)));
    const minPoints = maxPointsPerLevel.reduce((sum, pts) => sum + pts, 0);

    console.log();
    console.log(chalk.red('Critical path: ') + chalk.white(levels.length) + chalk.red(' levels, ') + chalk.white(minPoints) + chalk.red(' pts minimum'));

    const maxLevelWidth = String(levels.length).length;
    const maxPtsWidth = Math.max(...levels.map((lvl) => {
      const issues = criticalByLevel.get(lvl);
      return String(Math.max(...issues.map((i) => i.points))).length;
    }));

    for (const lvl of levels) {
      const issues = criticalByLevel.get(lvl);
      const keys = issues.map((i) => i.key.replace(/^[A-Z]+-/, '')).join(', ');
      const maxPts = Math.max(...issues.map((i) => i.points));
      const parallel = issues.length > 1 ? chalk.gray(' (parallel)') : '';
      const lvlStr = String(lvl).padStart(maxLevelWidth);
      const ptsStr = String(maxPts).padStart(maxPtsWidth);
      console.log(chalk.gray(`  ${lvlStr}. `) + chalk.white(ptsStr) + chalk.gray(` pts → `) + chalk.white(`[${keys}]`) + parallel);
    }
  }
}

function truncate(str, len) {
  if (str.length <= len) return str.padEnd(len);
  return str.slice(0, len - 1) + '…';
}

function formatPts(n) {
  return chalk.white(n) + chalk.gray(' pts');
}

function formatBlockers(blockedBy, maxWidth) {
  if (blockedBy.length === 0) return '';

  const prefix = ' ← ';
  const shortKeys = blockedBy.map((k) => k.replace(/^[A-Z]+-/, ''));

  // Try to fit as many blockers as possible
  let result = prefix + shortKeys[0];
  let shown = 1;

  for (let i = 1; i < shortKeys.length; i++) {
    const remaining = shortKeys.length - shown;
    const suffix = remaining > 0 ? `+${remaining}` : '';
    const candidate = result + ', ' + shortKeys[i];
    const candidateWithSuffix = candidate + (remaining > 1 ? `+${remaining - 1}` : '');

    // Reserve space for suffix if not all shown
    if (candidateWithSuffix.length <= maxWidth * 0.4) {
      result = candidate;
      shown++;
    } else {
      break;
    }
  }

  const remaining = shortKeys.length - shown;
  if (remaining > 0) {
    result += `+${remaining}`;
  }

  return result;
}
