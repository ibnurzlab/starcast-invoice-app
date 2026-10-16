const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');

const invoiceRoutes = require('./routes/invoices');

const app = express();
const frontendDir = path.join(__dirname, '..', '..', 'frontend');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'starcast-backend', timestamp: new Date().toISOString() });
});

app.use('/api/invoices', invoiceRoutes);

// Serve frontend from the same origin in production/dev.
app.use(express.static(frontendDir));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

module.exports = app;