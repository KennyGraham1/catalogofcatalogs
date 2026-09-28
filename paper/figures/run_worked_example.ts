/**
 * Command-line entry point for the worked example (called by generate_figures.py):
 *
 *   npx tsx paper/figures/run_worked_example.ts <catalogues.json> <results.json>
 *
 * Reads the synthetic catalogues written by synthetic_catalogues.py, runs the platform's
 * engine over them (worked_example_engine.ts) and writes every result as JSON.
 */
import { readFileSync, writeFileSync } from 'fs';
import { DEFAULT_OPTIONS, runWorkedExample, type WorkedExampleInput } from './worked_example_engine';

function main(): void {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    console.error('usage: npx tsx paper/figures/run_worked_example.ts <catalogues.json> <results.json>');
    process.exit(2);
  }
  const input = JSON.parse(readFileSync(inputPath, 'utf8')) as WorkedExampleInput & {
    options?: Partial<typeof DEFAULT_OPTIONS>;
  };
  const options = { ...DEFAULT_OPTIONS, ...(input.options ?? {}) };
  // The merge engine logs a line per merge and per validity-gate conflict; silence both so
  // the only output is the timing line below.
  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  const started = Date.now();
  let result;
  try {
    result = runWorkedExample(input, options);
  } finally {
    console.log = log;
    console.warn = warn;
  }
  writeFileSync(outputPath, JSON.stringify(result));
  console.error(`worked example computed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main();
