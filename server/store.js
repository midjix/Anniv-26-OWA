'use strict';
/*
 * Persistance JSON minimaliste et atomique (écriture dans un fichier
 * temporaire puis rename) : si le conteneur redémarre en pleine soirée,
 * la partie reprend exactement où elle en était.
 */
const fs = require('node:fs');
const path = require('node:path');

class Store {
  constructor(dir) {
    this.dir = dir;
    this.runsDir = path.join(dir, 'runs');
    fs.mkdirSync(this.runsDir, { recursive: true, mode: 0o700 });
    this.file = path.join(dir, 'state.json');
    this.timer = null;
    this.pending = null;
  }

  load() {
    try {
      const s = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return s && s.v === 1 ? s : null;
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('[store] état illisible, nouvelle partie :', e.message);
      return null;
    }
  }

  writeAtomic(file, data) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  /** Sauvegarde groupée (au plus une écriture toutes les 150 ms). */
  save(state) {
    this.pending = state;
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending) return;
    try { this.writeAtomic(this.file, this.pending); } catch (e) { console.error('[store] écriture impossible :', e.message); }
    this.pending = null;
  }

  /** Archive une partie terminée (relisible depuis la régie). */
  archive(runId, data) {
    const safe = String(runId).replace(/[^A-Za-z0-9_-]/g, '');
    try { this.writeAtomic(path.join(this.runsDir, `${safe}.json`), data); } catch (e) { console.error('[store] archive impossible :', e.message); }
  }

  listRuns() {
    try {
      return fs.readdirSync(this.runsDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse()
        .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(this.runsDir, f), 'utf8')); } catch { return null; } })
        .filter(Boolean);
    } catch { return []; }
  }
}

module.exports = { Store };
