import chalk from 'chalk';

const WIDTH = Math.min(process.stdout.columns || 100, 120);
const MARKER_WIDTH = 2;
const KEY_WIDTH = 12;
const POINTS_WIDTH = 6;
const PADDING = 4; // 2 spaces indent + 2 spaces between parts
const SUMMARY_WIDTH = WIDTH - MARKER_WIDTH - KEY_WIDTH - POINTS_WIDTH - PADDING;

export function displaySprints(sprints) {
  const line = '━'.repeat(WIDTH);
  let totalPoints = 0;
  const criticalByLevel = new Map();

  for (let i = 0; i < sprints.length; i++) {
    const sprint = sprints[i];
    const points = sprint.reduce((sum, issue) => sum + issue.points, 0);
    totalPoints += points;

    console.log();
    console.log(chalk.cyan(line));
    console.log(
      chalk.cyan.bold(` Sprint ${i + 1}`) +
        chalk.gray(`${' '.repeat(WIDTH - 18 - String(points).length)}${points} pts`)
    );
    console.log(chalk.cyan(line));

    for (const issue of sprint) {
      const marker = issue.critical ? chalk.red('★ ') : '  ';
      const keyPart = issue.critical
        ? chalk.red.bold(issue.key.padEnd(KEY_WIDTH))
        : chalk.yellow(issue.key.padEnd(KEY_WIDTH));
      const summaryPart = truncate(issue.summary, SUMMARY_WIDTH);
      const pointsPart = chalk.gray(`${issue.points}pts`.padStart(POINTS_WIDTH));
      console.log(`  ${marker}${keyPart}${summaryPart} ${pointsPart}`);

      if (issue.blockedBy.length > 0) {
        const blockers = issue.blockedBy.join(', ');
        console.log(chalk.gray(`${' '.repeat(MARKER_WIDTH + KEY_WIDTH + 2)}← blocked by ${blockers}`));
      }

      if (issue.critical) {
        if (!criticalByLevel.has(issue.level)) {
          criticalByLevel.set(issue.level, []);
        }
        criticalByLevel.get(issue.level).push(issue);
      }
    }
  }

  console.log();
  console.log(chalk.green.bold(`Total: ${sprints.length} sprints, ${totalPoints} points`));

  // Display critical path grouped by level
  if (criticalByLevel.size > 0) {
    const levels = [...criticalByLevel.keys()].sort((a, b) => a - b);
    const minPoints = levels.reduce((sum, lvl) => {
      const issues = criticalByLevel.get(lvl);
      return sum + Math.max(...issues.map((i) => i.points));
    }, 0);

    console.log();
    console.log(chalk.red(`★ Critical path: ${levels.length} levels, ${minPoints} pts minimum`));

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
