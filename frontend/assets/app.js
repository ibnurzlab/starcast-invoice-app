const API_BASE = (location.protocol === 'file:' ? 'http://localhost:4000' : '') + '/api';

const state = {
  invoiceId: null,
  invoiceNumber: '',
  date: '',
  resellerName: '',
  resellerAddress: '',
  paymentMethod: 'BCA Transfer',
  paymentStatus: 'LUNAS',
  discount: 0,
  shipping: 0,
  notes: '',
  items: [],
  invoices: [],
};

function formatRupiah(amount) {
  if (isNaN(amount) || amount === null || amount === undefined) amount = 0;
  const formatted = Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'Rp ' + formatted;
}

function getTodayFormatted() {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function escapeHtml(string) {
  if (!string) return '';
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function api(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || `Request gagal (${response.status})`;
    throw new Error(message);
  }
  return data;
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const toastIcon = document.getElementById('toastIcon');

  toastMsg.innerText = msg;
  if (type === 'warning') toastIcon.className = 'fa-solid fa-triangle-exclamation text-amber-400';
  else if (type === 'success') toastIcon.className = 'fa-solid fa-circle-check text-emerald-400';
  else toastIcon.className = 'fa-solid fa-circle-info text-blue-400';

  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3500);
}

/* ---------------- View switching ---------------- */
function showEditor() {
  document.getElementById('editorView').classList.remove('view-hidden');
  document.getElementById('listView').classList.add('view-hidden');
}

function showList() {
  document.getElementById('editorView').classList.add('view-hidden');
  document.getElementById('listView').classList.remove('view-hidden');
  loadInvoices();
}

/* ---------------- Form rendering ---------------- */
function renderFormItems() {
  const container = document.getElementById('itemsFormContainer');
  container.innerHTML = '';

  state.items.forEach((item, index) => {
    const rowTotal = item.price * item.qty;
    const row = document.createElement('div');
    row.className = 'bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 transition-all hover:border-slate-300';
    row.dataset.rowId = item.id;
    row.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <span class="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px]">${index + 1}</span>
          Item Diecast
        </span>
        <button type="button" onclick="removeItemRow('${item.id}')" title="Hapus baris" class="text-rose-500 hover:text-rose-700 p-1 text-xs">
          <i class="fa-regular fa-trash-can"></i> Hapus
        </button>
      </div>

      <div>
        <input type="text" value="${escapeHtml(item.desc)}" oninput="updateItemField('${item.id}', 'desc', this.value)"
          placeholder="Contoh: Kaido House Datsun 510 Pro Street OG Green"
          class="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 placeholder-slate-400">
      </div>

      <div class="grid grid-cols-12 gap-2 items-center">
        <div class="col-span-5">
          <label class="block text-[10px] font-semibold text-slate-500 mb-0.5">Harga Satuan (Rp)</label>
          <input type="number" min="0" value="${item.price}" oninput="updateItemField('${item.id}', 'price', this.value)"
            class="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono text-slate-800" placeholder="0">
        </div>
        <div class="col-span-3">
          <label class="block text-[10px] font-semibold text-slate-500 mb-0.5">Qty</label>
          <input type="number" min="1" value="${item.qty}" oninput="updateItemField('${item.id}', 'qty', this.value)"
            class="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-center font-bold text-slate-800">
        </div>
        <div class="col-span-4 text-right">
          <label class="block text-[10px] font-semibold text-slate-500 mb-0.5">Total</label>
          <div class="row-total text-xs font-bold font-mono text-blue-700 py-1">${formatRupiah(rowTotal)}</div>
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  document.getElementById('itemCountDisplay').innerText = state.items.length;
}

function updateItemDomTotal(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const row = document.querySelector(`[data-row-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const totalEl = row.querySelector('.row-total');
  if (totalEl) totalEl.innerText = formatRupiah(item.price * item.qty);
}

function addNewItemRow(desc = '', price = 0, qty = 1) {
  state.items.push({
    id: crypto.randomUUID(),
    desc,
    price: Number(price) || 0,
    qty: Number(qty) >= 1 ? Number(qty) : 1,
  });
  renderFormItems();
  updateLivePreview();
}

function removeItemRow(id) {
  if (state.items.length <= 1) {
    showToast('Minimal harus ada 1 barang dalam invoice!', 'warning');
    return;
  }
  state.items = state.items.filter((item) => item.id !== id);
  renderFormItems();
  updateLivePreview();
}

function updateItemField(id, field, value) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;

  if (field === 'price') {
    let val = parseFloat(value);
    if (isNaN(val) || val < 0) val = 0;
    item.price = val;
  } else if (field === 'qty') {
    let val = parseInt(value, 10);
    if (isNaN(val) || val < 1) val = 1;
    item.qty = val;
  } else {
    item.desc = value;
  }

  updateItemDomTotal(id);
  document.getElementById('itemCountDisplay').innerText = state.items.length;
  updateLivePreview();
}

function bindEventListeners() {
  const bind = (id, cb) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', (e) => { cb(e.target.value); updateLivePreview(); });
  };
  const bindChange = (id, cb) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', (e) => { cb(e.target.value); updateLivePreview(); });
  };

  bind('invoiceNumberInput', (v) => { state.invoiceNumber = v; });
  bind('invoiceDateInput', (v) => { state.date = v; });
  bind('resellerNameInput', (v) => { state.resellerName = v; });
  bind('resellerAddressInput', (v) => { state.resellerAddress = v; });
  bindChange('paymentMethodInput', (v) => { state.paymentMethod = v; });
  bindChange('paymentStatusInput', (v) => { state.paymentStatus = v; });
  bind('discountInput', (v) => { state.discount = parseFloat(v) || 0; });
  bind('shippingInput', (v) => { state.shipping = parseFloat(v) || 0; });
  bind('notesInput', (v) => { state.notes = v; });
}

function syncFormToState() {
  document.getElementById('invoiceNumberInput').value = state.invoiceNumber || '';
  document.getElementById('invoiceDateInput').value = state.date || '';
  document.getElementById('resellerNameInput').value = state.resellerName || '';
  document.getElementById('resellerAddressInput').value = state.resellerAddress || '';
  document.getElementById('paymentMethodInput').value = state.paymentMethod || 'BCA Transfer';
  document.getElementById('paymentStatusInput').value = state.paymentStatus || 'LUNAS';
  document.getElementById('discountInput').value = state.discount || 0;
  document.getElementById('shippingInput').value = state.shipping || 0;
  document.getElementById('notesInput').value = state.notes || '';
}

function populateFromInvoice(invoice) {
  state.invoiceId = invoice.id;
  state.invoiceNumber = invoice.number;
  state.date = invoice.date;
  state.resellerName = invoice.resellerName;
  state.resellerAddress = invoice.resellerAddress;
  state.paymentMethod = invoice.paymentMethod;
  state.paymentStatus = invoice.paymentStatus;
  state.discount = invoice.discount;
  state.shipping = invoice.shipping;
  state.notes = invoice.notes || '';
  state.items = invoice.items.map((it) => ({ id: it.id, desc: it.description, price: it.price, qty: it.qty }));

  syncFormToState();
  renderFormItems();
  updateLivePreview();

  const label = document.getElementById('saveStateLabel');
  if (label) label.innerText = 'Tersimpan di database';
}

function updateLivePreview() {
  document.getElementById('prevInvoiceNo').innerText = state.invoiceNumber || 'INV-XXXX-XXXX';
  document.getElementById('prevDate').innerText = state.date || '-';

  const statusEl = document.getElementById('prevStatus');
  const statusVal = state.paymentStatus;
  statusEl.innerText = statusVal;
  if (statusVal === 'LUNAS') statusEl.className = 'inline-block px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800';
  else if (statusVal === 'BELUM LUNAS') statusEl.className = 'inline-block px-2.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800';
  else statusEl.className = 'inline-block px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800';

  document.getElementById('prevResellerName').innerText = (state.resellerName || '').trim() || 'Nama Reseller / Pelanggan';
  document.getElementById('prevResellerAddress').innerText = (state.resellerAddress || '').trim() || 'Alamat lengkap pengiriman reseller...';
  document.getElementById('prevPaymentMethod').innerText = state.paymentMethod || '';

  const tableBody = document.getElementById('previewTableBody');
  tableBody.innerHTML = '';
  let subtotal = 0;
  if (state.items.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400 italic">Belum ada barang ditambahkan.</td></tr>`;
  } else {
    state.items.forEach((item, idx) => {
      const itemTotal = item.price * item.qty;
      subtotal += itemTotal;
      const tr = document.createElement('tr');
      tr.className = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';
      tr.innerHTML = `
        <td class="py-2 px-3 text-center font-mono text-slate-500">${idx + 1}</td>
        <td class="py-2 px-3 font-semibold text-slate-800">${escapeHtml(item.desc || '(Item belum dinamai)')}</td>
        <td class="py-2 px-3 text-right font-mono text-slate-700">${formatRupiah(item.price)}</td>
        <td class="py-2 px-3 text-center font-bold text-slate-900">${item.qty}</td>
        <td class="py-2 px-3 text-right font-mono font-bold text-slate-900">${formatRupiah(itemTotal)}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  const total = Math.max(0, subtotal - (state.discount || 0) + (state.shipping || 0));
  document.getElementById('prevSubtotal').innerText = formatRupiah(subtotal);
  document.getElementById('prevDiscount').innerText = formatRupiah(state.discount || 0);
  document.getElementById('prevShipping').innerText = formatRupiah(state.shipping || 0);
  document.getElementById('prevGrandTotal').innerText = formatRupiah(total);
  document.getElementById('prevNotes').innerText = state.notes ? `Catatan: ${state.notes}` : '';
}

function invoicePayload() {
  return {
    number: state.invoiceNumber,
    date: state.date,
    resellerName: state.resellerName,
    resellerAddress: state.resellerAddress,
    paymentMethod: state.paymentMethod,
    paymentStatus: state.paymentStatus,
    discount: state.discount || 0,
    shipping: state.shipping || 0,
    notes: state.notes || '',
    items: state.items.map((it) => ({
      id: it.id,
      description: it.desc,
      price: it.price,
      qty: it.qty,
    })),
  };
}

async function saveInvoice(silent = false) {
  const errors = validateForSave();
  if (errors.length) {
    if (!silent) showToast(errors[0], 'warning');
    return null;
  }

  try {
    let result;
    if (state.invoiceId) {
      result = await api(`/invoices/${state.invoiceId}`, {
        method: 'PUT',
        body: JSON.stringify(invoicePayload()),
      });
    } else {
      result = await api('/invoices', {
        method: 'POST',
        body: JSON.stringify(invoicePayload()),
      });
    }
    state.invoiceId = result.invoice.id;
    state.invoiceNumber = result.invoice.number;
    syncFormToState();
    const label = document.getElementById('saveStateLabel');
    if (label) label.innerText = 'Tersimpan: ' + result.invoice.number;
    if (!silent) showToast('Invoice berhasil disimpan', 'success');
    return result.invoice;
  } catch (error) {
    if (!silent) showToast(error.message, 'warning');
    return null;
  }
}

function validateForSave() {
  const errors = [];
  if (!state.resellerName || !state.resellerName.trim()) errors.push('Nama reseller wajib diisi sebelum menyimpan!');
  if (!state.items.length) errors.push('Minimal harus ada 1 item diecast!');
  const invalid = state.items.some((i) => !i.desc || !i.desc.trim() || i.price < 0 || i.qty < 1);
  if (invalid) errors.push('Pastikan semua keterangan item terisi dan harga valid!');
  if (!state.date || !/^\d{2}\/\d{2}\/\d{4}$/.test(state.date)) errors.push('Tanggal harus format DD/MM/YYYY!');
  return errors;
}

async function generateNextInvoiceNumber() {
  try {
    const year = new Date().getFullYear();
    const result = await api('/invoices/next-number', {
      method: 'POST',
      body: JSON.stringify({ year }),
    });
    state.invoiceNumber = result.number;
    syncFormToState();
    updateLivePreview();
    showToast('Nomor invoice baru berhasil dibuat: ' + result.number, 'info');
  } catch (error) {
    showToast(error.message, 'warning');
  }
}

function resetInvoiceForm() {
  if (!confirm('Apakah Anda ingin membuat invoice baru?')) return;
  state.invoiceId = null;
  state.invoiceNumber = '';
  state.date = getTodayFormatted();
  state.resellerName = '';
  state.resellerAddress = '';
  state.paymentMethod = 'BCA Transfer';
  state.paymentStatus = 'LUNAS';
  state.discount = 0;
  state.shipping = 0;
  state.notes = '';
  state.items = [{ id: crypto.randomUUID(), desc: '', price: 0, qty: 1 }];

  const label = document.getElementById('saveStateLabel');
  if (label) label.innerText = 'Belum disimpan';

  syncFormToState();
  renderFormItems();
  updateLivePreview();
  generateNextInvoiceNumber();
}

function loadSampleData() {
  state.resellerName = 'Apex Diecast Garage (Bro Randy)';
  state.resellerAddress = 'Ruko Grand Galaxy City Blok RGA No. 12, Bekasi Selatan, Jawa Barat 17147\nTelp: 0819-8877-6655';
  state.items = [
    { id: crypto.randomUUID(), desc: 'Mini GT #522 Nissan Skyline GT-R R34 V-Spec II N1 Bayside Blue', price: 195000, qty: 3 },
    { id: crypto.randomUUID(), desc: 'Hot Wheels Car Culture Circuit Legends Mazda 787B Chase #0/5', price: 650000, qty: 1 },
    { id: crypto.randomUUID(), desc: 'Inno64 Honda Civic Ferio EG9 #14 Idemitsu Macau GP 1994', price: 275000, qty: 2 },
    { id: crypto.randomUUID(), desc: 'Kaido House x Mini GT Datsun Fairlady Z Kaido GT Matte Black', price: 320000, qty: 2 },
    { id: crypto.randomUUID(), desc: 'Protector Case Acrylic 0.5mm Premium Hotwheels/Mini GT', price: 12500, qty: 10 },
  ];
  state.discount = 0;
  state.shipping = 0;
  syncFormToState();
  renderFormItems();
  updateLivePreview();
  showToast('Data sampel diecast reseller berhasil dimuat!', 'success');
}

async function loadInvoices() {
  const tbody = document.getElementById('invoiceListBody');
  tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400">Memuat data...</td></tr>`;
  try {
    const result = await api('/invoices?limit=100');
    state.invoices = result.invoices || [];
    if (!state.invoices.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400">Belum ada invoice tersimpan.</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    state.invoices.forEach((inv) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50';
      tr.innerHTML = `
        <td class="px-4 py-3 font-mono font-semibold text-slate-900">${escapeHtml(inv.number)}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(inv.date)}</td>
        <td class="px-4 py-3 text-slate-700">${escapeHtml(inv.resellerName)}</td>
        <td class="px-4 py-3 text-right font-mono font-bold text-blue-700">${formatRupiah(inv.total)}</td>
        <td class="px-4 py-3 text-center">
          <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${inv.paymentStatus === 'LUNAS' ? 'bg-emerald-100 text-emerald-800' : inv.paymentStatus === 'BELUM LUNAS' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}">${escapeHtml(inv.paymentStatus)}</span>
        </td>
        <td class="px-4 py-3 text-center space-x-2">
          <button onclick="openInvoice('${inv.id}')" class="text-xs text-blue-600 hover:underline font-medium">Buka</button>
          <button onclick="deleteInvoice('${inv.id}')" class="text-xs text-rose-600 hover:underline font-medium">Hapus</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-6 text-center text-rose-500">${escapeHtml(error.message)}</td></tr>`;
    showToast(error.message, 'warning');
  }
}

async function openInvoice(id) {
  try {
    const result = await api(`/invoices/${id}`);
    populateFromInvoice(result.invoice);
    showEditor();
    showToast('Invoice ' + result.invoice.number + ' dibuka', 'info');
  } catch (error) {
    showToast(error.message, 'warning');
  }
}

async function deleteInvoice(id) {
  if (!confirm('Hapus invoice ini dari database?')) return;
  try {
    await api(`/invoices/${id}`, { method: 'DELETE' });
    showToast('Invoice berhasil dihapus', 'success');
    loadInvoices();
  } catch (error) {
    showToast(error.message, 'warning');
  }
}

async function printInvoice() {
  const errors = validateForSave();
  if (errors.length) {
    showToast(errors[0], 'warning');
    return;
  }
  await saveInvoice(true);
  window.print();
}

/* ---------------- Init ---------------- */
window.addEventListener('DOMContentLoaded', async () => {
  bindEventListeners();
  state.date = getTodayFormatted();
  state.items = [
    { id: crypto.randomUUID(), desc: 'Mini GT LBWK Nissan GT-R R35 Silhouette Black', price: 185000, qty: 2 },
    { id: crypto.randomUUID(), desc: 'Hot Wheels Premium Boulevard Porsche 911 GT3 RS', price: 135000, qty: 5 },
  ];
  syncFormToState();
  renderFormItems();
  updateLivePreview();
  showEditor();

  try {
    await generateNextInvoiceNumber();
  } catch (e) {
    // Backend may not be ready; keep local placeholder.
    showToast('Backend belum terhubung. Pastikan server berjalan di http://localhost:4000', 'warning');
  }
});

// Expose functions for inline handlers
window.showEditor = showEditor;
window.showList = showList;
window.saveInvoice = saveInvoice;
window.resetInvoiceForm = resetInvoiceForm;
window.loadSampleData = loadSampleData;
window.addNewItemRow = addNewItemRow;
window.removeItemRow = removeItemRow;
window.updateItemField = updateItemField;
window.generateNextInvoiceNumber = generateNextInvoiceNumber;
window.loadInvoices = loadInvoices;
window.openInvoice = openInvoice;
window.deleteInvoice = deleteInvoice;
window.printInvoice = printInvoice;