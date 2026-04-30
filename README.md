# MSSS — Market Scoping & Survey System

MSSS is a full-stack web application for publishing procurement and market-scoping announcements, collecting structured supplier responses, and managing users and notifications.

Built with **Node.js + Express** on the backend and **React (Vite + Ant Design)** on the frontend, backed by a **PostgreSQL** database (Supabase-compatible).

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database & Migrations](#database--migrations)
- [Scripts](#scripts)
- [Deployment](#deployment)

---

## Features

- Publish and manage market-scoping / procurement announcements
- Collect and track structured supplier responses
- Role-based access control (admin, buyer, supplier)
- Email notifications via SMTP
- File uploads via Azure Blob Storage or Supabase Storage
- JWT-based authentication

---

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React, Vite, Ant Design           |
| Backend  | Node.js, Express                  |
| Database | PostgreSQL (Supabase-compatible)  |
| Auth     | JWT                               |
| Email    | Nodemailer (SMTP)                 |
| Storage  | Azure Blob Storage / Supabase     |
| Deploy   | Vercel (serverless) / Docker      |

---

## Project Structure
MSSS/
├── Backend/
│   ├── Server.js          # Express app entry point
│   ├── db.js              # Database connection
│   ├── migrations/        # SQL migration files
│   ├── resetPassword.js   # CLI utility for password reset
│   ├── Dockerfile
│   └── package.json
├── Frontend/
│   ├── src/               # React source files
│   └── package.json
├── docker-compose.yml
└── README.md

---

## Getting Started

### Prerequisites

- Node.js v18+
- PostgreSQL database (or a Supabase project)

### 1. Clone the repository

```bash
git clone https://github.com/your-org/msss.git
cd msss
```

### 2. Backend setup

```bash
cd Backend
cp .env.example .env   # fill in your values
npm install
npm run dev
```

The API runs on `http://localhost:3000` by default.

### 3. Frontend setup

```bash
cd Frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` via Vite.

---

## Environment Variables

Create a `.env` file inside `Backend/`. See `.env.example` for a template — never commit the actual file.

| Variable                          | Required | Description                                    |
|-----------------------------------|----------|------------------------------------------------|
| `DATABASE_URL`                    | ✅       | PostgreSQL connection string                   |
| `JWT_SECRET`                      | ✅       | Secret used to sign and verify JWTs            |
| `SYSTEM_EMAIL`                    | ✅       | Sender address for outgoing system emails      |
| `SYSTEM_EMAIL_APP_PASSWORD`       | ✅       | SMTP app password for the sender account       |
| `AZURE_STORAGE_CONNECTION_STRING` | ⬜       | Azure Blob Storage connection string           |
| `SUPABASE_URL`                    | ⬜       | Supabase project URL                           |
| `SUPABASE_SERVICE_ROLE_KEY`       | ⬜       | Supabase service role key                      |
| `FRONTEND_ORIGIN`                 | ⬜       | Deployed frontend URL, added to CORS allowlist |
| `CORS_ALLOW_CREDENTIALS`          | ⬜       | Set to `true` to allow credentials via CORS    |
| `PORT` / `APP_PORT`               | ⬜       | Port for the backend server (default: `3000`)  |
| `VERCEL`                          | ⬜       | Set automatically on Vercel deployments        |

---

## Database & Migrations

Migration files are in `Backend/migrations/`. Run them using any PostgreSQL-compatible migration tool or directly via your database client.

**To reset a user's password from the command line:**

```bash
cd Backend
node resetPassword.js --email user@example.com --password NewPass123
```

---

## Scripts

**Backend**

| Command       | Description                     |
|---------------|---------------------------------|
| `npm run dev` | Start with nodemon (hot reload) |
| `npm start`   | Start with Node.js              |

**Frontend**

| Command         | Description              |
|-----------------|--------------------------|
| `npm run dev`   | Start Vite dev server    |
| `npm run build` | Build for production     |

---

## Deployment

**Docker**

```bash
docker-compose up --build
```

A `Dockerfile` is included in `Backend/` for containerizing the API.

**Vercel**

The backend includes Vercel-aware code paths. Deploy via the Vercel dashboard or CLI and make sure all required environment variables are set in your project settings.