const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initDb, getEnrichedQueue, getTokenStatus, Q } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Serve the built frontend (frontend/dist) if present, else fall back to the Vite dev server.
const DIST = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
}

// ─── Socket.IO ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌  Client connected: ${socket.id}`);

  socket.on('subscribe_token', (token) => {
    const t = token?.toUpperCase();
    socket.join(`token_${t}`);
    const status = getTokenStatus(t);
    if (status) socket.emit('token_update', status);
  });

  socket.on('subscribe_queue', (doctorId) => {
    socket.join(`queue_${doctorId}`);
    const queue = getEnrichedQueue(doctorId);
    socket.emit('queue_update', queue);
  });

  socket.on('subscribe_admin', () => socket.join('admin'));

  socket.on('disconnect', () => {
    console.log(`🔌  Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;

(async () => {
  console.log('\n  Initialising MediQueue...');
  await initDb();

  // First run on a fresh database: seed demo data automatically.
  if (Q.getAllDoctors().length === 0) {
    console.log('  Empty database — seeding demo data...');
    const { seedAll } = require('./seed');
    await seedAll();
  }

  // Auth routes (no auth required to reach login endpoint itself)
  const { router: authRouter } = require('./auth');
  app.use('/api/auth', authRouter);

  // Register API routes AFTER db is ready
  app.use('/api/doctors',      require('./doctors')(io));
  app.use('/api/appointments', require('./appointments')(io));
  app.use('/api/queue',        require('./queue')(io));
  app.use('/api/patients',     require('./patients')(io));
  app.use('/api/medical',      require('./medical')(io));
  app.use('/api/admin',        require('./admin')(io));

  // Catch-all MUST come last — serves the SPA for any non-API route
  app.get('*', (req, res) => {
    if (fs.existsSync(DIST)) {
      res.sendFile(path.join(DIST, 'index.html'));
    } else {
      res.status(200).send('MediQueue API is running. Build the frontend with: cd frontend && npm run build');
    }
  });

  // Clean expired sessions every hour
  setInterval(() => Q.cleanExpiredSessions(), 60 * 60 * 1000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║       MediQueue Server Running        ║');
    console.log(`  ║   http://localhost:${PORT}              ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
    console.log('  Default credentials:');
    console.log('  Admin:   admin / admin123');
    console.log('  Doctors: <firstname> / doctor123  (e.g. priya / doctor123)');
    console.log('  Patient: <phone> / 1234\n');
  });
})();

module.exports = { app, io };
