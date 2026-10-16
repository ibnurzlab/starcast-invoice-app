const express = require('express');
const router = express.Router();
const db = require('../db');
const { invoiceSchema } = require('../validators');
const { nextInvoiceNumber } = require('../nextNumber');

// Use Node's built-in randomUUID to avoid dependency issues.
const { randomUUID } = require('crypto');

function rowToInvoice(invoiceRow, itemRows) {
  return {
    id: invoiceRow.id,
    number: invoiceRow.number,
    date: invoiceRow.date,
    resellerName: invoiceRow.reseller_name,
    resellerAddress: invoiceRow.reseller_address || '',
    paymentMethod: invoiceRow.payment_method,
    paymentStatus: invoiceRow.payment_status,
    discount: invoiceRow.discount,
    shipping: invoiceRow.shipping,
    notes: invoiceRow.notes || '',
    subtotal: invoiceRow.subtotal,
    total: invoiceRow.total,
    createdAt: invoiceRow.created_at,
    updatedAt: invoiceRow.updated_at,
    items: itemRows.map((row) => ({
      id: row.id,
      description: row.description,
      price: row.price,
      qty: row.qty,
      total: row.total,
    })),
  };
}

function getItems(invoiceId) {
  return db
    .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, rowid ASC')
    .all(invoiceId);
}

function calculate(items, discount, shipping) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = Math.max(0, subtotal - discount + shipping);
  return { subtotal, total };
}

// GET /api/invoices
router.get('/', (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const search = (req.query.search || '').trim();

  let rows;
  if (search) {
    rows = db
      .prepare(
        `SELECT * FROM invoices
         WHERE number LIKE ? OR reseller_name LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(`%${search}%`, `%${search}%`, limit);
  } else {
    rows = db
      .prepare('SELECT * FROM invoices ORDER BY created_at DESC LIMIT ?')
      .all(limit);
  }

  const invoices = rows.map((row) => {
    const items = getItems(row.id);
    return rowToInvoice(row, items);
  });

  res.json({ invoices });
});

// GET /api/invoices/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
  const items = getItems(row.id);
  res.json({ invoice: rowToInvoice(row, items) });
});

// POST /api/invoices/next-number
router.post('/next-number', (req, res) => {
  const year = Number((req.body && req.body.year) || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'Tahun tidak valid' });
  }
  const number = nextInvoiceNumber(year);
  res.json({ number });
});

// POST /api/invoices
router.post('/', (req, res) => {
  let parsed;
  try {
    parsed = invoiceSchema.parse(req.body || {});
  } catch (error) {
    return res.status(400).json({ error: error.issues[0]?.message || 'Data invoice tidak valid', issues: error.issues });
  }

  const { date, resellerName, resellerAddress, paymentMethod, paymentStatus, discount, shipping, notes, items } = parsed;
  const year = parseInt(date.slice(-4), 10);

  let number = parsed.number;
  if (!number) {
    number = nextInvoiceNumber(year);
  } else {
    const exists = db.prepare('SELECT 1 FROM invoices WHERE number = ?').get(number);
    if (exists) {
      return res.status(409).json({ error: 'Nomor invoice sudah digunakan' });
    }
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const normalizedItems = items.map((item, index) => ({
    id: item.id || randomUUID(),
    description: item.description,
    price: item.price,
    qty: item.qty,
    total: item.price * item.qty,
    sortOrder: index,
  }));

  const { subtotal, total } = calculate(normalizedItems, discount, shipping);

  const insertInvoice = db.prepare(`
    INSERT INTO invoices (id, number, date, reseller_name, reseller_address, payment_method, payment_status,
      discount, shipping, notes, subtotal, total, created_at, updated_at)
    VALUES (@id, @number, @date, @resellerName, @resellerAddress, @paymentMethod, @paymentStatus,
      @discount, @shipping, @notes, @subtotal, @total, @createdAt, @updatedAt)
  `);

  const insertItem = db.prepare(`
    INSERT INTO invoice_items (id, invoice_id, sort_order, description, price, qty, total)
    VALUES (@id, @invoiceId, @sortOrder, @description, @price, @qty, @total)
  `);

  const tx = db.transaction(() => {
    insertInvoice.run({
      id,
      number,
      date,
      resellerName,
      resellerAddress,
      paymentMethod,
      paymentStatus,
      discount,
      shipping,
      notes,
      subtotal,
      total,
      createdAt: now,
      updatedAt: now,
    });
    for (const item of normalizedItems) {
      insertItem.run({
        id: item.id,
        invoiceId: id,
        sortOrder: item.sortOrder,
        description: item.description,
        price: item.price,
        qty: item.qty,
        total: item.total,
      });
    }
  });

  try {
    tx();
  } catch (error) {
    return res.status(500).json({ error: 'Gagal menyimpan invoice ke database' });
  }

  const row = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  const itemRows = getItems(id);
  res.status(201).json({ invoice: rowToInvoice(row, itemRows) });
});

// PUT /api/invoices/:id
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Invoice tidak ditemukan' });

  let parsed;
  try {
    parsed = invoiceSchema.parse(req.body || {});
  } catch (error) {
    return res.status(400).json({ error: error.issues[0]?.message || 'Data invoice tidak valid', issues: error.issues });
  }

  const { date, resellerName, resellerAddress, paymentMethod, paymentStatus, discount, shipping, notes, items } = parsed;
  const id = req.params.id;
  const now = new Date().toISOString();

  const normalizedItems = items.map((item, index) => ({
    id: item.id || randomUUID(),
    description: item.description,
    price: item.price,
    qty: item.qty,
    total: item.price * item.qty,
    sortOrder: index,
  }));

  const { subtotal, total } = calculate(normalizedItems, discount, shipping);

  const updateInvoice = db.prepare(`
    UPDATE invoices SET
      date = @date,
      reseller_name = @resellerName,
      reseller_address = @resellerAddress,
      payment_method = @paymentMethod,
      payment_status = @paymentStatus,
      discount = @discount,
      shipping = @shipping,
      notes = @notes,
      subtotal = @subtotal,
      total = @total,
      updated_at = @updatedAt
    WHERE id = @id
  `);

  const deleteItems = db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?');
  const insertItem = db.prepare(`
    INSERT INTO invoice_items (id, invoice_id, sort_order, description, price, qty, total)
    VALUES (@id, @invoiceId, @sortOrder, @description, @price, @qty, @total)
  `);

  const tx = db.transaction(() => {
    updateInvoice.run({
      id,
      date,
      resellerName,
      resellerAddress,
      paymentMethod,
      paymentStatus,
      discount,
      shipping,
      notes,
      subtotal,
      total,
      updatedAt: now,
    });
    deleteItems.run(id);
    for (const item of normalizedItems) {
      insertItem.run({
        id: item.id,
        invoiceId: id,
        sortOrder: item.sortOrder,
        description: item.description,
        price: item.price,
        qty: item.qty,
        total: item.total,
      });
    }
  });

  try {
    tx();
  } catch (error) {
    return res.status(500).json({ error: 'Gagal memperbarui invoice' });
  }

  const row = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  const itemRows = getItems(id);
  res.json({ invoice: rowToInvoice(row, itemRows) });
});

// DELETE /api/invoices/:id
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
  res.status(204).send();
});

module.exports = router;