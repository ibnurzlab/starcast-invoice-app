const db = require('./db');

function nextInvoiceNumber(year) {
  const name = `invoice_seq_${year}`;

  const insertCounter = db.prepare('INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)');
  const increment = db.prepare('UPDATE counters SET value = value + 1 WHERE name = ?');
  const selectValue = db.prepare('SELECT value FROM counters WHERE name = ?');

  const tx = db.transaction(() => {
    insertCounter.run(name);
    increment.run(name);
    return selectValue.get(name).value;
  });

  const seq = tx();
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
}

module.exports = { nextInvoiceNumber };