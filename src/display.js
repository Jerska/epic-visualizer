import chalk from 'chalk';

const WIDTH = Math.min(process.stdout.columns || 100, 120);
const KEY_WIDTH = 12;
const POINTS_WIDTH = 6;
const PADDING = 4; // 2 spaces indent + 2 spaces between parts
const SUMMARY_WIDTH = WIDTH - KEY_WIDTH - POINTS_WIDTH - PADDING;

export function displaySprints(sprints) {
  const line = '━'.repeat(WIDTH);
  let totalPoints = 0;

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
      const keyPart = chalk.yellow(issue.key.padEnd(KEY_WIDTH));
      const summaryPart = truncate(issue.summary, SUMMARY_WIDTH);
      const pointsPart = chalk.gray(`${issue.points}pts`.padStart(POINTS_WIDTH));
      console.log(`  ${keyPart}${summaryPart} ${pointsPart}`);

      if (issue.blockedBy.length > 0) {
        const blockers = issue.blockedBy.join(', ');
        console.log(chalk.gray(`${' '.repeat(KEY_WIDTH + 2)}← blocked by ${blockers}`));
      }
    }
  }

  console.log();
  console.log(chalk.green.bold(`Total: ${sprints.length} sprints, ${totalPoints} points`));
}

function truncate(str, len) {
  if (str.length <= len) return str.padEnd(len);
  return str.slice(0, len - 1) + '…';
}
