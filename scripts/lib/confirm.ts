/**
 * Shared write-confirmation gate for the maintenance/migration scripts (finding
 * gs#3: "every script ... requires confirmation before writing").
 *
 * The prompt/isTTY dependencies are injected so the decision logic is a pure
 * function of its inputs and can be unit tested without a real TTY or stdin.
 */

export interface ConfirmContext {
  /** --yes on the CLI: an explicit, informed opt-in (e.g. for scripted/CI use). */
  assumeYes: boolean;
  isTTY: boolean;
  prompt: (question: string) => Promise<string>;
}

export type ConfirmResult = { ok: true } | { ok: false; reason: string };

/**
 * Ask for confirmation before a write. In a non-interactive shell without --yes
 * this refuses rather than guessing (loud failure with guidance, not a silent
 * write) — the same posture the brief asks for from the clean-database scripts.
 *
 * @param expectedText What the operator must type back verbatim. Callers pass the
 *   resolved database name for destructive/high-consequence writes (dropping data,
 *   creating a privileged account) so the operator is forced to read and retype
 *   the exact target, or the literal "yes" for routine/idempotent corrections.
 */
export async function requireTypedConfirmation(
  message: string,
  expectedText: string,
  ctx: ConfirmContext,
): Promise<ConfirmResult> {
  if (ctx.assumeYes) return { ok: true };

  if (!ctx.isTTY) {
    return {
      ok: false,
      reason:
        `${message}\n` +
        'Refusing to write without confirmation in a non-interactive shell. ' +
        'Re-run with --yes once you have verified the target printed above.',
    };
  }

  const answer = await ctx.prompt(`${message}\nType "${expectedText}" to continue: `);
  if (answer.trim() !== expectedText) {
    return { ok: false, reason: 'Confirmation text did not match; aborting. No changes were written.' };
  }
  return { ok: true };
}

/** Real stdin/stdout prompt, used outside of tests. */
async function realPrompt(question: string): Promise<string> {
  const { createInterface } = await import('readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

export function defaultConfirmContext(assumeYes: boolean): ConfirmContext {
  return { assumeYes, isTTY: Boolean(process.stdin.isTTY), prompt: realPrompt };
}

/**
 * Convenience wrapper for the common case: print the resolved target (never the
 * full connection string — gs#4) and gate the write on requireTypedConfirmation.
 */
export async function confirmWrite(
  target: { host: string; db: { databaseName: string } },
  message: string,
  expectedText: string,
  assumeYes: boolean,
): Promise<ConfirmResult> {
  console.log(`   Host: ${target.host}\n   Database: ${target.db.databaseName}\n`);
  return requireTypedConfirmation(message, expectedText, defaultConfirmContext(assumeYes));
}
