const express = require('express');
const taskRoutes = require('./routes/tasks');

const app = express();

app.use(express.json());

// Health check endpoint for deployment platforms (Render, Railway, etc.)
// Returns 200 with a simple status object so load balancers can verify the service is up.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/tasks', taskRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Task API running on port ${PORT}`);
  });
}

module.exports = app;
