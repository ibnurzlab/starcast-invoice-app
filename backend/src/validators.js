const { z } = require('zod');

const itemSchema = z.object({
  id: z.string().trim().optional(),
  description: z.string().trim().min(1, 'Keterangan item wajib diisi'),
  price: z.number().finite().min(0).default(0),
  qty: z.number().int().min(1).default(1),
});

const invoiceSchema = z.object({
  number: z.string().trim().optional().default(''),
  date: z.string().trim().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Tanggal harus DD/MM/YYYY'),
  resellerName: z.string().trim().min(1, 'Nama reseller wajib diisi'),
  resellerAddress: z.string().trim().default(''),
  paymentMethod: z.string().trim().min(1).default('BCA Transfer'),
  paymentStatus: z.string().trim().min(1).default('LUNAS'),
  discount: z.number().finite().min(0).default(0),
  shipping: z.number().finite().min(0).default(0),
  notes: z.string().trim().default(''),
  items: z.array(itemSchema).min(1, 'Minimal satu item diecast'),
});

module.exports = { invoiceSchema, itemSchema };