require('./db'); // initialize SQLite schema

const app = require('./app');
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Starcast backend berjalan di http://localhost:${PORT}`);
  console.log(`Frontend tersedia di http://localhost:${PORT}`);
});