#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// caveman — shared configuration resolver + symlink-safe flag I/O.
//
// Resolution order for the default mode:
//   1. CAVEMAN_DEFAULT_MODE environment variable
//   2. config file `defaultMode`:  $XDG_CONFIG_HOME/caveman/config.json
//      | ~/.config/caveman/config.json | %APPDATA%\caveman\config.json
//   3. 'full'

const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_MODES = [
  'off', 'lite', 'full', 'ultra',
  'commit', 'review', 'compress'
];

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'caveman');
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'caveman');
  }
  return path.join(os.homedir(), '.config', 'caveman');
}
function getConfigPath() { return path.join(getConfigDir(), 'config.json'); }

function getDefaultMode() {
  const envMode = process.env.CAVEMAN_DEFAULT_MODE;
  if (envMode && VALID_MODES.includes(envMode.toLowerCase())) return envMode.toLowerCase();
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
    if (config.defaultMode && VALID_MODES.includes(config.defaultMode.toLowerCase())) return config.defaultMode.toLowerCase();
  } catch (e) {}
  return 'full';
}

// Symlink-safe flag write. Refuses symlinks at the target + immediate parent,
// O_NOFOLLOW where available, atomic temp+rename, 0600. Protects the predictable
// flag path (~/.claude/.caveman-active) from a local attacker's symlink redirect.
function safeWriteFlag(flagPath, content) {
  try {
    const flagDir = path.dirname(flagPath);
    fs.mkdirSync(flagDir, { recursive: true });
    try { if (fs.lstatSync(flagDir).isSymbolicLink()) return; } catch (e) { return; }
    try { if (fs.lstatSync(flagPath).isSymbolicLink()) return; } catch (e) { if (e.code !== 'ENOENT') return; }
    const tempPath = path.join(flagDir, '.caveman-active.' + process.pid + '.' + Date.now());
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, String(content));
      try { fs.fchmodSync(fd, 0o600); } catch (e) {}
    } finally { if (fd !== undefined) fs.closeSync(fd); }
    fs.renameSync(tempPath, flagPath);
  } catch (e) {}
}

// Symlink-safe, size-capped, whitelist-validated flag read. Symmetric with
// safeWriteFlag: refuses symlinks, caps the read, rejects unknown modes.
// Prevents a symlinked flag (→ ~/.ssh/id_rsa) leaking into terminal / context.
const MAX_FLAG_BYTES = 64;
function readFlag(flagPath) {
  try {
    let st; try { st = fs.lstatSync(flagPath); } catch (e) { return null; }
    if (st.isSymbolicLink() || !st.isFile() || st.size > MAX_FLAG_BYTES) return null;
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    let fd, out;
    try {
      fd = fs.openSync(flagPath, fs.constants.O_RDONLY | O_NOFOLLOW);
      const buf = Buffer.alloc(MAX_FLAG_BYTES);
      const n = fs.readSync(fd, buf, 0, MAX_FLAG_BYTES, 0);
      out = buf.slice(0, n).toString('utf8');
    } finally { if (fd !== undefined) fs.closeSync(fd); }
    const raw = out.trim().toLowerCase();
    return VALID_MODES.includes(raw) ? raw : null;
  } catch (e) { return null; }
}

module.exports = { getDefaultMode, getConfigDir, getConfigPath, VALID_MODES, safeWriteFlag, readFlag };
