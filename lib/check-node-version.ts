/**
 * Node.js Version Check
 *
 * Validates that the application is running on a supported Node.js version.
 * This check runs at module load time and logs a warning if the version is unsupported.
 */

const MIN_NODE_VERSION = 22;

function checkNodeVersion(): void {
  const currentVersion = process.versions.node;
  const majorVersion = parseInt(currentVersion.split('.')[0], 10);

  const minorVersion = Number(currentVersion.split('.')[1]);
  if (!((majorVersion === 22 && minorVersion >= 12) || majorVersion === 24)) {
    console.warn(
      `\n⚠️  WARNING: Node.js ${currentVersion} is not supported.\n` +
      `   This application requires Node.js 22.12+ or 24 LTS.\n` +
      `   Some features may not work correctly.\n` +
      `   Please upgrade to Node.js 22 LTS or 24 LTS for full compatibility.\n`
    );
  }
}

// Run check on module load (server-side only)
if (typeof window === 'undefined') {
  checkNodeVersion();
}

export { checkNodeVersion, MIN_NODE_VERSION };
