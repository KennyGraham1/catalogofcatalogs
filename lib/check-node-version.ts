/**
 * Node.js Version Check
 *
 * Validates that the application is running on a supported Node.js version.
 * This check runs at module load time and logs a warning if the version is unsupported.
 */

const MIN_NODE_VERSION = 18;

function checkNodeVersion(): void {
  const currentVersion = process.versions.node;
  const majorVersion = parseInt(currentVersion.split('.')[0], 10);

  if (majorVersion < MIN_NODE_VERSION) {
    console.warn(
      `\n⚠️  WARNING: Node.js ${currentVersion} is not supported.\n` +
      `   This application requires Node.js ${MIN_NODE_VERSION}.x or higher.\n` +
      `   Some features may not work correctly.\n` +
      `   Please upgrade to Node.js ${MIN_NODE_VERSION}+ for full compatibility.\n`
    );
  }
}

// Run check on module load (server-side only)
if (typeof window === 'undefined') {
  checkNodeVersion();
}

export { checkNodeVersion, MIN_NODE_VERSION };
