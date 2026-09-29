# MediQueue — Integrated Patient Management & Smart Queue System

MediQueue is a complete hospital patient-management application built around its defining **Smart Queue / token** feature: patients book online, get a token, track the live queue, and only leave home when it's time. Every visit now feeds a **persistent electronic medical record** — patient profile → appointment → token → consultation → vitals → diagnosis → prescription → lab tests → reports → bill → follow-up.

---

## Features

### Smart Queue (core, preserved)
| Feature | Detail |
|---|---|
| **Live queue tracking** | Real-time position, estimated wait, expected call time (Socket.IO) |
| **Online booking** | Department → doctor → date → slot, token generated instantly |
| **Smart arrival** | Patient marks "arrived" only when at the hospital |
| **Doctor console** | Call next patient, record consultation, complete session |
| **Admin portal** | Live workload, stats, staff management |

### Patient Management (new)
| Module | Detail |
|---|---|
| **Patient profiles** | Persistent record with MRN (P10001…), demographics, blood group, allergies, conditions, medications, insurance |
| **Self-registration** | Patients sign up with phone + 4-digit PIN and get a patient ID |
| **EMR / consultations** | Every visit creates a new consultation record — history is never overwritten |
| **Vitals** | Temperature, BP, heart rate, resp rate, SpO₂, weight, height per visit |
| **Prescriptions** | Medicine, dosage, frequency, duration, instructions |
| **Lab tests** | REQUESTED → SAMPLE_COLLECTED → PROCESSING → COMPLETED workflow with results |
| **Medical reports** | Auto-generated lab/consultation documents viewable by the patient |
| **Billing** | Auto bill after consultation (consult fee + test charges), PAID/PENDING status |
| **Follow-ups** | Doctor recommends; patient converts to a real appointment in one tap |
| **Notifications** | In-app bell: bookings, results, bills, reminders |
| **Departments** | Database-driven, admin-manageable |
| **Role-based access** | Patients see only their own records; doctors only their patients; admin full |

---

## Quick Start

```bash
# 1. Install
npm run install:all

# 2. Seed demo data (departments, doctors, patients, appointments, medical history)
npm run seed

# 3. Build the frontend
npm run build

# 4. Start (serves API + built frontend on :3000)
npm start
```

Open **http://localhost:3000**. On first start with an empty database the server seeds demo data automatically.

> Development: `npm run dev` (backend, port 3000) + `npm run dev:frontend` (Vite on 5173, proxied).

## Demo credentials

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Doctor | `priya`, `meena`, `karthik`, … | `doctor123` |
| Patient | `9876543214` (Arjun Mehta) | `1234` |

Sample tokens to test the live queue: `CAR-005`, `CAR-007`, `GEN-004`, `ORT-002`.

---

## How to use each tab

### Patient
- **Home** — next appointment, live queue for today (token, position, wait, call time), recent history snapshot.
- **Queue** — the original tracker: look up by phone/token, mark *I've arrived*, watch position update live.
- **Book** — department → doctor → date → slot; identity prefilled from the patient record.
- **Visits** — upcoming / past / cancelled appointments; cancel; book a recommended follow-up.
- **Records** — full EMR: consultations (with vitals + prescriptions + tests), prescriptions, lab results, reports.
- **Bills** — itemised bills with payment status.
- **Profile** — update personal and medical details.

### Doctor (Console)
- Live queue, **Call next**, patient context (MRN, blood group, allergies, past consultations).
- **Record Consultation** — symptoms, vitals, diagnosis, prescriptions, lab requests, follow-up; saving completes the visit and auto-generates the bill.
- Review completed test results; view full patient records; mark no-shows.

### Admin (Portal)
- Overview with real statistics (patients, today's appointments, waiting, in-consult, completed, labs pending, bills due).
- Patients directory with search; Lab workflow (collect → process → complete with result); Billing (mark paid); Departments (add/remove); Staff management (add/remove doctors).

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js + Express + Socket.IO |
| **Database** | SQLite (sql.js, persisted to `backend/mediqueue.db`) |
| **Auth** | Session tokens, bcrypt password hashing, role middleware |
| **Frontend** | React 18 + Vite + React Router + Tailwind utility classes |
| **Real-time** | Socket.IO (token/queue/stats channels) |

## REST API (v2 additions in bold)

```
POST   /api/auth/login                      POST   /api/auth/register          (new)
POST   /api/auth/logout                     GET    /api/auth/me
GET    /api/auth/notifications              POST   /api/auth/notifications/read   (new)

GET    /api/doctors                         GET    /api/doctors/departments
GET    /api/doctors/by-dept/:dept           GET    /api/doctors/:id/slots?date=
GET    /api/doctors/:id/patients            PATCH  /api/doctors/:id/availability
POST   /api/doctors                         DELETE /api/doctors/:id

POST   /api/appointments                    GET    /api/appointments/token/:token
GET    /api/appointments/phone/:phone       GET    /api/appointments/doctor/:id
GET    /api/appointments/patient/:id        GET    /api/appointments/:id           (new)
PATCH  /api/appointments/:id/cancel         POST   /api/appointments/:id/reschedule (new)
PATCH  /api/appointments/:id/no-show        POST   /api/appointments/:id/arrive

GET    /api/queue/:doctorId                 POST   /api/queue/:doctorId/arrive
POST   /api/queue/:doctorId/call-next       POST   /api/queue/:doctorId/done
POST   /api/queue/:doctorId/no-show         POST   /api/queue/:doctorId/bill       (new)
GET    /api/queue/consultation-context/:apptId  (new)
GET    /api/queue/stats/overview            POST   /api/queue/reassign

GET    /api/patients/me/dashboard           GET    /api/patients/me                (new)
PUT    /api/patients/me                     GET    /api/patients/search?q=
GET    /api/patients/:id/record             POST   /api/patients                   (admin)
PUT    /api/patients/:id                    (admin)

POST   /api/medical/consultations           GET    /api/medical/consultations/patient/:id
GET    /api/medical/consultations/:id       PUT    /api/medical/consultations/:id
POST   /api/medical/prescriptions           DELETE /api/medical/prescriptions/:id
POST   /api/medical/lab-tests               PATCH  /api/medical/lab-tests/:id/status
GET    /api/medical/lab-tests/patient/:id   GET    /api/medical/lab-tests/doctor/:id
GET    /api/medical/reports/patient/:id     POST   /api/medical/reports
GET    /api/medical/follow-ups/patient/:id  POST   /api/medical/follow-ups/:id/book

GET    /api/admin/stats                     GET    /api/admin/patients?q=
GET    /api/admin/lab-tests                 GET    /api/admin/bills
PATCH  /api/admin/bills/:id/status          GET/POST/DELETE /api/admin/departments
GET    /api/admin/follow-ups                PUT    /api/admin/schedules/:doctorId
```

## Database

SQLite tables: `doctors`, `departments`, `patients`, `appointments`, `queue_log`, `consultations`, `vitals`, `prescriptions`, `lab_tests`, `medical_reports`, `bills`, `follow_ups`, `notifications`, `doctor_schedules`, `users`, `sessions`.

Schema is created idempotently (`CREATE TABLE IF NOT EXISTS` + guarded `ALTER TABLE` column migrations) — existing data is preserved on upgrade.

## Validation

```bash
npm test        # reseeds, starts server, runs backend/scripts/test_e2e.js (51 checks)
                # and backend/scripts/test_journey.js (13 checks)
```
