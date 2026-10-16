import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';

const app = new Hono();

app.use('*', cors());

const itemSchema = z.object({
  id: z.string().trim().optional(),
  description: z.string().trim().min(1),
  price: z.number().finite().min(0).default(0),
  qty: z.number().int().min(1).default(1),
});

const invoiceSchema = z.object({
  number: z.string().trim().optional().default(''),
  date: z.string().trim().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  resellerName: z.string().trim().min(1),
  resellerAddress: z.string().trim().default(''),
  paymentMethod: z.string().trim().min(1).default('BCA Transfer'),
  paymentStatus: z.string().trim().min(1).default('LUNAS'),
  discount: z.number().finite().min(0).default(0),
  shipping: z.number().finite().min(0).default(0),
  notes: z.string().trim().default(''),
  items: z.array(itemSchema).min(1),
});

function rowToInvoice(row, items) {
  return {
    id: row.id,
    number: row.number,
    date: row.date,
    resellerName: row.reseller_name,
    resellerAddress: row.reseller_address || '',
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    discount: row.discount,
    shipping: row.shipping,
    notes: row.notes || '',
    subtotal: row.subtotal,
    total: row.total,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map((it) => ({
      id: it.id,
      description: it.description,
      price: it.price,
      qty: it.qty,
      total: it.total,
    })),
  };
}

async function getItems(db, invoiceId) {
  const result = await db.prepare(
    'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, rowid ASC'
  ).bind(invoiceId).all();
  return result.results || [];
}

async function nextInvoiceNumber(db, year) {
  const name = `invoice_seq_${year}`;
  await db.prepare('INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)').bind(name).run();
  await db.prepare('UPDATE counters SET value = value + 1 WHERE name = ?').bind(name).run();
  const row = await db.prepare('SELECT value FROM counters WHERE name = ?').bind(name).first();
  return `INV-${year}-${String(row.value).padStart(4, '0')}`;
}

function calculate(items, discount, shipping) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = Math.max(0, subtotal - discount + shipping);
  return { subtotal, total };
}

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', service: 'starcast-cloudflare', timestamp: new Date().toISOString() });
});

app.get('/api/invoices', async (c) => {
  const db = c.env.DB;
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
  const search = (c.req.query('search') || '').trim();

  let result;
  if (search) {
    result = await db.prepare(
      `SELECT * FROM invoices WHERE number LIKE ? OR reseller_name LIKE ? ORDER BY created_at DESC LIMIT ?`
    ).bind(`%${search}%`, `%${search}%`, limit).all();
  } else {
    result = await db.prepare('SELECT * FROM invoices ORDER BY created_at DESC LIMIT ?').bind(limit).all();
  }

  const rows = result.results || [];
  const invoices = [];
  for (const row of rows) {
    const items = await getItems(db, row.id);
    invoices.push(rowToInvoice(row, items));
  }
  return c.json({ invoices });
});

app.get('/api/invoices/:id', async (c) => {
  const db = c.env.DB;
  const row = await db.prepare('SELECT * FROM invoices WHERE id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ error: 'Invoice tidak ditemukan' }, 404);
  const items = await getItems(db, row.id);
  return c.json({ invoice: rowToInvoice(row, items) });
});

app.post('/api/invoices/next-number', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const year = Number(body.year || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return c.json({ error: 'Tahun tidak valid' }, 400);
  }
  const number = await nextInvoiceNumber(db, year);
  return c.json({ number });
});

app.post('/api/invoices', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));

  let parsed;
  try {
    parsed = invoiceSchema.parse(body);
  } catch (error) {
    return c.json({ error: error.issues[0]?.message || 'Data invoice tidak valid', issues: error.issues }, 400);
  }

  const { date, resellerName, resellerAddress, paymentMethod, paymentStatus, discount, shipping, notes, items } = parsed;
  const year = parseInt(date.slice(-4), 10);

  let number = parsed.number;
  if (!number) {
    number = await nextInvoiceNumber(db, year);
  } else {
    const exists = await db.prepare('SELECT 1 FROM invoices WHERE number = ?').bind(number).first();
    if (exists) return c.json({ error: 'Nomor invoice sudah digunakan' }, 409);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const normalizedItems = items.map((item, index) => ({
    id: item.id || crypto.randomUUID(),
    description: item.description,
    price: item.price,
    qty: item.qty,
    total: item.price * item.qty,
    sortOrder: index,
  }));

  const { subtotal, total } = calculate(normalizedItems, discount, shipping);

  const statements = [
    db.prepare(`
      INSERT INTO invoices (id, number, date, reseller_name, reseller_address, payment_method, payment_status,
        discount, shipping, notes, subtotal, total, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, number, date, resellerName, resellerAddress, paymentMethod, paymentStatus, discount, shipping, notes, subtotal, total, now, now),
  ];

  for (const item of normalizedItems) {
    statements.push(db.prepare(`
      INSERT INTO invoice_items (id, invoice_id, sort_order, description, price, qty, total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(item.id, id, item.sortOrder, item.description, item.price, item.qty, item.total));
  }

  try {
    await db.batch(statements);
  } catch (e) {
    return c.json({ error: 'Gagal menyimpan invoice ke database' }, 500);
  }

  const row = await db.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first();
  const itemRows = await getItems(db, id);
  return c.json({ invoice: rowToInvoice(row, itemRows) }, 201);
});

app.put('/api/invoices/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const existing = await db.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Invoice tidak ditemukan' }, 404);

  const body = await c.req.json().catch(() => ({}));
  let parsed;
  try {
    parsed = invoiceSchema.parse(body);
  } catch (error) {
    return c.json({ error: error.issues[0]?.message || 'Data invoice tidak valid', issues: error.issues }, 400);
  }

  const { date, resellerName, resellerAddress, paymentMethod, paymentStatus, discount, shipping, notes, items } = parsed;
  const now = new Date().toISOString();

  const normalizedItems = items.map((item, index) => ({
    id: item.id || crypto.randomUUID(),
    description: item.description,
    price: item.price,
    qty: item.qty,
    total: item.price * item.qty,
    sortOrder: index,
  }));

  const { subtotal, total } = calculate(normalizedItems, discount, shipping);

  const statements = [
    db.prepare(`
      UPDATE invoices SET
        date = ?, reseller_name = ?, reseller_address = ?, payment_method = ?, payment_status = ?,
        discount = ?, shipping = ?, notes = ?, subtotal = ?, total = ?, updated_at = ?
      WHERE id = ?
    `).bind(date, resellerName, resellerAddress, paymentMethod, paymentStatus, discount, shipping, notes, subtotal, total, now, id),
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').bind(id),
  ];

  for (const item of normalizedItems) {
    statements.push(db.prepare(`
      INSERT INTO invoice_items (id, invoice_id, sort_order, description, price, qty, total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(item.id, id, item.sortOrder, item.description, item.price, item.qty, item.total));
  }

  try {
    await db.batch(statements);
  } catch (e) {
    return c.json({ error: 'Gagal memperbarui invoice' }, 500);
  }

  const row = await db.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first();
  const itemRows = await getItems(db, id);
  return c.json({ invoice: rowToInvoice(row, itemRows) });
});

app.delete('/api/invoices/:id', async (c) => {
  const db = c.env.DB;
  const info = await db.prepare('DELETE FROM invoices WHERE id = ?').bind(c.req.param('id')).run();
  if (!info.success || (info.meta && info.meta.changes === 0)) {
    return c.json({ error: 'Invoice tidak ditemukan' }, 404);
  }
  return c.body(null, 204);
});

// Static assets fallback
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.notFound();
});

export default app;