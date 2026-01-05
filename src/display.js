import chalk from 'chalk';
import { assignToPeople } from './scheduler.js';

const WIDTH = process.stdout.columns || 100;
const MARKER_WIDTH = 3; // globalMarker (2) + space
const DEPTH_WIDTH = 3; // sprint depth + space + symbol
const KEY_WIDTH = 12;
const POINTS_WIDTH = 7;
const PADDING = 5; // 2 spaces indent + 3 spaces between parts
const SUMMARY_WIDTH = WIDTH - MARKER_WIDTH - DEPTH_WIDTH - KEY_WIDTH - POINTS_WIDTH - PADDING;

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
      const blockerChains = blockersInDone.map((b) => ({
        key: b,
        len: chainLength.get(b) || 0,
      }));
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
  const ptsDisplay =
    seqPoints < points
      ? chalk.gray('seq ') + formatPts(seqPoints) + chalk.gray(' · total ') + formatPts(points)
      : formatPts(points);
  console.log(chalk.green.bold(` Completed`) + ' '.repeat(Math.max(1, WIDTH - 14 - ptsDisplayRaw.length)) + ptsDisplay);
  console.log(chalk.green(line));

  // Sort by chain position
  const inSeq = (i) => completedCritical.has(i.key);
  const bySeqFirst = (a, b) => (inSeq(a) === inSeq(b) ? 0 : inSeq(a) ? -1 : 1);
  const byChainLength = (a, b) => (chainLength.get(a.key) || 0) - (chainLength.get(b.key) || 0);
  const byRank = (a, b) => (a.rank || '').localeCompare(b.rank || '');
  const sorted = [...done].sort((a, b) => bySeqFirst(a, b) || byChainLength(a, b) || byRank(a, b));

  const seqTasks = sorted.filter(inSeq);
  const lastSeqKey = seqTasks.length > 0 ? seqTasks[seqTasks.length - 1].key : null;

  // Calculate depth within completed tasks
  const completedDepth = new Map();
  const calcCompletedDepth = (key) => {
    if (completedDepth.has(key)) return completedDepth.get(key);
    const issue = done.find((i) => i.key === key);
    const blockersInDone = issue.blockedBy.filter((b) => doneKeys.has(b));
    if (blockersInDone.length === 0) {
      completedDepth.set(key, 0);
      return 0;
    }
    const maxDepth = Math.max(...blockersInDone.map(calcCompletedDepth));
    completedDepth.set(key, maxDepth + 1);
    return maxDepth + 1;
  };
  for (const issue of done) calcCompletedDepth(issue.key);

  for (const issue of sorted) {
    const marker = chalk.green('✓ '); // 2 chars like globalMarker
    const depth = completedDepth.get(issue.key) || 0;
    const depthPart = depth > 0 ? chalk.gray(String(depth)) + '  ' : '   ';

    const keyPart = chalk.gray(issue.key.padEnd(KEY_WIDTH));

    const blockersRaw = formatBlockers(issue.blockedBy, SUMMARY_WIDTH);
    const blockersPart = blockersRaw ? chalk.gray(blockersRaw) : '';
    const summaryPart = chalk.gray(truncate(issue.summary, SUMMARY_WIDTH - blockersRaw.length));

    const pointsPart = chalk.white(String(issue.points).padStart(POINTS_WIDTH - 4)) + chalk.gray(' pts');
    console.log(` ${marker}${depthPart} ${keyPart}${summaryPart}${blockersPart} ${pointsPart}`);
  }
}

export function displaySprints(sprints, { verbose = false, startDate, sprintWeeks, numPeople, maxSeq } = {}) {
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
        const blockerChains = blockersInSprint.map((b) => ({
          key: b,
          len: chainLength.get(b) || 0,
        }));
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
    const ptsDisplay =
      seqPoints < points
        ? chalk.gray('seq ') + formatPts(seqPoints) + chalk.gray(' · total ') + formatPts(points)
        : formatPts(points);
    const sprintLabel = ` Sprint ${i + 1}`;
    const headerLen = sprintLabel.length + datesRaw.length + ptsDisplayRaw.length + 4; // +4 for right margin
    console.log(chalk.cyan.bold(sprintLabel) + datesDisplay + ' '.repeat(Math.max(1, WIDTH - headerLen)) + ptsDisplay);
    console.log(chalk.cyan(line));

    // Assign tasks to people if numPeople is specified
    const assignment = assignToPeople(sprint, maxSeq, numPeople);

    // Calculate sprint depth (how many layers before task can start)
    const sprintDepth = new Map();
    const calcSprintDepth = (key) => {
      if (sprintDepth.has(key)) return sprintDepth.get(key);
      const issue = sprint.find((i) => i.key === key);
      const blockersInSprint = issue.blockedBy.filter((b) => sprintKeys.has(b));
      if (blockersInSprint.length === 0) {
        sprintDepth.set(key, 0);
        return 0;
      }
      const maxDepth = Math.max(...blockersInSprint.map(calcSprintDepth));
      sprintDepth.set(key, maxDepth + 1);
      return maxDepth + 1;
    };
    for (const issue of sprint) calcSprintDepth(issue.key);

    // Sort: by sprint depth, then critical first, then seq first, then by rank
    const inSeq = (i) => sprintCritical.has(i.key);
    const byDepth = (a, b) => (sprintDepth.get(a.key) || 0) - (sprintDepth.get(b.key) || 0);
    const byCriticalFirst = (a, b) => (a.critical === b.critical ? 0 : a.critical ? -1 : 1);
    const bySeqFirst = (a, b) => (inSeq(a) === inSeq(b) ? 0 : inSeq(a) ? -1 : 1);
    const byRank = (a, b) => (a.rank || '').localeCompare(b.rank || '');
    const sortedSprint = [...sprint].sort(
      (a, b) => byDepth(a, b) || byCriticalFirst(a, b) || bySeqFirst(a, b) || byRank(a, b),
    );

    for (let idx = 0; idx < sortedSprint.length; idx++) {
      const issue = sortedSprint[idx];
      const isSprintCritical = inSeq(issue);
      const depth = sprintDepth.get(issue.key) || 0;
      const prevDepth = idx > 0 ? sprintDepth.get(sortedSprint[idx - 1].key) || 0 : -1;
      const nextDepth = idx < sortedSprint.length - 1 ? sprintDepth.get(sortedSprint[idx + 1].key) || 0 : -1;
      const isFirstOfGroup = depth !== prevDepth;
      const isLastOfGroup = depth !== nextDepth;

      // Global marker: critical path level or empty
      let globalMarker = '  ';
      if (issue.critical) {
        globalMarker = chalk.red(String(issue.level).padStart(2));
      }

      // Depth column: number on first, │ or └ below for grouping, › for seq chain
      let depthPart = '   ';
      const seqMarker = isSprintCritical ? chalk.magenta('›') : ' ';
      if (depth > 0) {
        if (isFirstOfGroup) {
          depthPart = chalk.gray(String(depth)) + ' ' + seqMarker;
        } else {
          const linePart = isLastOfGroup ? chalk.gray('└') : chalk.gray('│');
          depthPart = linePart + ' ' + seqMarker;
        }
      } else if (isSprintCritical) {
        depthPart = '  ' + seqMarker;
      }

      const keyPart = chalk.yellow(issue.key.padEnd(KEY_WIDTH));

      // Format blockers inline, showing as many as fit
      const blockersRaw = formatBlockers(issue.blockedBy, SUMMARY_WIDTH);
      const blockersPart = blockersRaw ? chalk.gray(blockersRaw) : '';

      const personWidth = assignment ? 5 : 0; // " [P1]" = 5 chars
      const summaryPart = truncate(issue.summary, SUMMARY_WIDTH - blockersRaw.length - personWidth);
      const pointsPart = chalk.white(String(issue.points).padStart(POINTS_WIDTH - 4)) + chalk.gray(' pts');
      const personPart = assignment ? chalk.blue(` [P${assignment.get(issue.key) + 1}]`) : '';
      console.log(` ${globalMarker} ${depthPart} ${keyPart}${summaryPart}${blockersPart} ${pointsPart}${personPart}`);

      if (issue.critical) {
        if (!criticalByLevel.has(issue.level)) {
          criticalByLevel.set(issue.level, []);
        }
        criticalByLevel.get(issue.level).push(issue);
      }

      // Add blank line between different depths
      const issueIdx = sortedSprint.indexOf(issue);
      const nextIssue = sortedSprint[issueIdx + 1];
      if (nextIssue && sprintDepth.get(issue.key) !== sprintDepth.get(nextIssue.key)) {
        console.log();
      }
    }

    // Show per-person task breakdown in verbose mode
    if (verbose && assignment) {
      const byPerson = new Map();
      for (const issue of sprint) {
        const personIdx = assignment.get(issue.key);
        if (!byPerson.has(personIdx)) byPerson.set(personIdx, []);
        byPerson.get(personIdx).push(issue);
      }

      console.log();
      console.log(chalk.gray('  Assignments:'));
      for (const [personIdx, tasks] of [...byPerson.entries()].sort((a, b) => a[0] - b[0])) {
        const pts = tasks.reduce((sum, t) => sum + t.points, 0);
        const keys = tasks.map((t) => t.key.replace(/^[A-Z]+-/, '')).join(', ');
        console.log(chalk.blue(`    P${personIdx + 1}`) + chalk.gray(` (${pts} pts): `) + chalk.white(keys));
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
  console.log(
    chalk.green.bold('Total: ') +
      chalk.white(sprints.length) +
      chalk.green.bold(' sprints, ') +
      chalk.white(totalPoints) +
      chalk.green.bold(' points') +
      endDateDisplay,
  );
  const legendParts = [
    chalk.red('N') + chalk.gray(' = critical path step'),
    chalk.gray('N') + chalk.gray(' = sprint depth'),
    chalk.magenta('›') + chalk.gray(' = longest sequence'),
  ];
  if (numPeople) {
    legendParts.push(chalk.blue('[PN]') + chalk.gray(' = person assignment'));
  }
  console.log(chalk.gray('Legend: ') + legendParts.join(chalk.gray(' · ')));

  // Display critical path grouped by level (only in verbose mode)
  if (verbose && criticalByLevel.size > 0) {
    const levels = [...criticalByLevel.keys()].sort((a, b) => a - b);
    const maxPointsPerLevel = levels.map((lvl) => Math.max(...criticalByLevel.get(lvl).map((i) => i.points)));
    const minPoints = maxPointsPerLevel.reduce((sum, pts) => sum + pts, 0);

    console.log();
    console.log(
      chalk.red('Critical path: ') +
        chalk.white(levels.length) +
        chalk.red(' levels, ') +
        chalk.white(minPoints) +
        chalk.red(' pts minimum'),
    );

    const maxLevelWidth = String(levels.length).length;
    const maxPtsWidth = Math.max(
      ...levels.map((lvl) => {
        const issues = criticalByLevel.get(lvl);
        return String(Math.max(...issues.map((i) => i.points))).length;
      }),
    );

    for (const lvl of levels) {
      const issues = criticalByLevel.get(lvl);
      const keys = issues.map((i) => i.key.replace(/^[A-Z]+-/, '')).join(', ');
      const maxPts = Math.max(...issues.map((i) => i.points));
      const parallel = issues.length > 1 ? chalk.gray(' (parallel)') : '';
      const lvlStr = String(lvl).padStart(maxLevelWidth);
      const ptsStr = String(maxPts).padStart(maxPtsWidth);
      console.log(
        chalk.gray(`  ${lvlStr}. `) + chalk.white(ptsStr) + chalk.gray(` pts → `) + chalk.white(`[${keys}]`) + parallel,
      );
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
