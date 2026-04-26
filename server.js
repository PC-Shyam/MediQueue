const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initDb, getEnrichedQueue, getTokenStatus } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

  // Auth routes (no auth required to reach login endpoint itself)
  const { router: authRouter } = require('./auth');
  app.use('/api/auth', authRouter);

  // Register API routes AFTER db is ready
  app.use('/api/doctors',      require('./doctors')(io));
  app.use('/api/appointments', require('./appointments')(io));
  app.use('/api/queue',        require('./queue')(io));

  // Catch-all MUST come last — serves the SPA for any non-API route
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Clean expired sessions every hour
  const { Q } = require('./db');
  setInterval(() => Q.cleanExpiredSessions(), 60 * 60 * 1000);

  server.listen(PORT, () => {
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
