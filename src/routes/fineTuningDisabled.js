const fs = require('fs');
const path = require('path');

/**
 * The OpenAI fine-tuning feature is retired.
 *
 * It was mounted without authentication, loaded any company's documents by id, and wrote their full
 * content to `uploads/training-<timestamp>.jsonl`, a folder served publicly. The generated examples
 * were boilerplate, and OpenAI's fine-tuning platform no longer accepts new users. No front end
 * calls these routes.
 *
 * Every `/api/fine-tuning/*` request now gets 410 Gone, whoever sends it, and training files are
 * never served from `uploads/` and are deleted at startup.
 */

const TRAINING_FILE = /^training-.*\.jsonl$/i;

function fineTuningGone(req, res) {
  res.status(410).json({ error: 'The fine-tuning API has been removed' });
}

/** Refuses `/uploads/training-*.jsonl` before express.static can serve it. */
function blockTrainingFiles(req, res, next) {
  let requested = req.path;
  try {
    requested = decodeURIComponent(req.path);
  } catch (error) {
    // malformed escape: test the raw path
  }
  if (TRAINING_FILE.test(path.basename(requested))) {
    return res.status(404).end();
  }
  return next();
}

/** Deletes the training files left in `uploadsDir` by the old feature. Returns the names removed. */
function purgeTrainingFiles(uploadsDir, log = console) {
  let names;
  try {
    names = fs.readdirSync(uploadsDir);
  } catch (error) {
    return [];
  }
  const removed = [];
  for (const name of names.filter((n) => TRAINING_FILE.test(n))) {
    try {
      fs.unlinkSync(path.join(uploadsDir, name));
      removed.push(name);
    } catch (error) {
      log.error(`Could not delete training file ${name}: ${error.message}`);
    }
  }
  if (removed.length) log.info(`Deleted ${removed.length} leftover fine-tuning training file(s) from uploads/`);
  return removed;
}

module.exports = { fineTuningGone, blockTrainingFiles, purgeTrainingFiles };
