# 🏥 MediQueue — Hospital Queue Management System

Eliminate hospital waiting time. Patients track their live queue position, book appointments online, and only leave home when it's time.

---

## ✨ Features

| Feature | Detail |
|---|---|
| **Live queue tracking** | Real-time position, estimated wait, expected call time |
| **Online booking** | Book appointment, get a token, select time slot |
| **Smart arrival** | Patient marks "arrived" only when at hospital |
| **Doctor dashboard** | Call next patient, mark done, see full day schedule |
| **Admin panel** | Workload overview, overload alerts, stats |
| **Real-time sync** | Socket.IO pushes all changes instantly to all clients |

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
cd mediqueue
npm install
```

### 2. Seed the database with doctors & sample data
```bash
npm run seed
```

### 3. Start the server
```bash
npm start
```
Open **http://localhost:3000** in your browser.

For development with auto-restart:
```bash
npm run dev
```

---

## 📱 How to use each tab

### My Queue
1. Enter your token (e.g. `CAR-005`) or mobile number
2. See your real-time position, estimated wait, expected call time
3. Click **"I've arrived"** when you reach the hospital
4. You'll get an alert when you're next

**Sample tokens to test:**
- `CAR-005` — Arjun Mehta, waiting, 1 ahead (Dr. Priya Nair)
- `CAR-007` — Mohan R., booked upcoming (Dr. Priya Nair)
- `GEN-004` — Preethi L., waiting (Dr. Meena Iyer)
- `ORT-002` — Geetha P., waiting, next up (Dr. Ananya Krishnan)

### Book Appointment
1. Select department → doctor → date → time slot
2. Enter name and mobile number
3. Confirm → get your token number
4. Click "Track this appointment" to monitor live

### Doctor View
1. Select your name from the dropdown
2. See your live queue (patients in consultation, waiting, upcoming)
3. Click **"Call next patient"** to advance the queue
4. Click **"Mark consultation done"** after each patient
5. Queue updates push to all connected patient browsers instantly

### Admin
- Live overview of all doctors' workload
- Load bar shows queue fill (green → amber → red)
- Overload alerts with redistribution suggestions
- Refreshes every 30 seconds + real-time on queue changes

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js + Express |
| **Database** | SQLite via better-sqlite3 |
| **Real-time** | Socket.IO (WebSockets) |
| **Frontend** | Vanilla JS, served by Express |
| **Fonts** | DM Sans + DM Mono (Google Fonts) |

---

## 📡 REST API

```
GET    /api/doctors                    → all doctors with live stats
GET    /api/doctors/departments        → list of departments
GET    /api/doctors/by-dept/:dept      → doctors in a department
GET    /api/doctors/:id/slots?date=    → available time slots

POST   /api/appointments               → book appointment
GET    /api/appointments/token/:token  → look up by token
GET    /api/appointments/phone/:phone  → look up by phone
GET    /api/appointments/doctor/:id    → doctor's full day list
PATCH  /api/appointments/:id/cancel   → cancel appointment

GET    /api/queue/:doctorId            → live enriched queue
POST   /api/queue/:doctorId/arrive     → patient marks arrival
POST   /api/queue/:doctorId/call-next  → doctor calls next patient
POST   /api/queue/:doctorId/done       → mark current patient done
POST   /api/queue/reassign             → admin reassigns patient
GET    /api/queue/stats/overview       → admin dashboard stats
```

## 📡 Socket.IO Events

```
Client → Server:
  subscribe_token  (token)     → get updates for one patient
  subscribe_queue  (doctorId)  → get updates for a doctor's queue
  subscribe_admin              → subscribe to hospital-wide stats

Server → Client:
  token_update     (appointment + wait estimate)
  queue_update     (full enriched queue array)
  patient_called   ({ token, name })
  stats_update     (trigger to reload stats)
```

---

## 🗂 Project Structure

```
mediqueue/
├── server.js          ← Express + Socket.IO entry point
├── db.js              ← SQLite schema, prepared statements, helpers
├── routes/
│   ├── doctors.js     ← Doctor endpoints
│   ├── appointments.js← Booking endpoints
│   └── queue.js       ← Queue management (call-next, done, reassign)
├── scripts/
│   └── seed.js        ← Populates sample doctors + appointments
├── public/
│   ├── index.html     ← SPA shell
│   ├── css/styles.css ← All styles
│   └── js/app.js      ← All frontend logic + Socket.IO client
└── mediqueue.db       ← Auto-created SQLite database
```

---

## 🔮 What to build next

- [ ] SMS notifications (Twilio) when patient is 2 spots away
- [ ] Patient location → auto "leave home" reminder
- [ ] Doctor schedules (days off, break times)
- [ ] Multi-hospital support
- [ ] Mobile app (React Native using same API)
- [ ] Analytics dashboard (avg wait trends, busy hours)
- [ ] Authentication (doctor login with password)
