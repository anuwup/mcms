# MCMS

**Meeting and Communication Management System for Power Users**

A full-stack application for running meetings, capturing outcomes, and staying productive—with real-time collaboration, keyboard shortcuts, and optional persistence.

---

## Features

- **Meetings** — Create, schedule, and manage meetings with agendas and host controls
- **Live transcription** — Real-time transcript feed during meetings (WebSocket/WebRTC)
- **Action items & outcomes** — Track action items and live outcomes in-session
- **Polls** — In-meeting polls and voting
- **Productivity dashboard** — Overview of meetings, stats, and schedule
- **Keyboard shortcuts** — ⌘K search, ⌘B sidebar, ⇧M new meeting, fullscreen, panel toggles, theme toggle
- **Profile & settings** — Avatar upload, profile settings, dark/light theme
- **Auth** — JWT-based login and signup
- **Persistence** — Optional MongoDB; runs with in-memory store if no DB is configured

---

## Tech stack

| Layer   | Stack |
|--------|--------|
| **Client** | React 19, Vite 5, React Router 7, Socket.io client |
| **Server** | Node.js, Express 5, Socket.io, JWT, bcrypt, multer, nodemailer |
| **Database** | Optional MongoDB (Mongoose); in-memory fallback |

---

## Quick start

### Prerequisites

- Node.js 18+
- (Optional) MongoDB for persistent data

### 1. Clone and install

```bash
git clone <repo-url>
cd mcms
```

Install server dependencies (from project root, if the server has its own `package.json`):

```bash
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 2. Configure environment

**Server** (`server/.env`):

- `PORT` — e.g. `5001`
- `JWT_SECRET` — Long random string (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `CLIENT_URL` — Frontend origin, e.g. `http://localhost:5173` for dev
- `MONGO_URI` — (Optional) MongoDB connection string; omit to use in-memory store

**Client** (dev): create `client/.env` with:

- `VITE_API_URL=http://localhost:5001/api`

### 3. Run

**Terminal 1 — API and static (serves built client if present):**

```bash
cd server
node index.js
```

**Terminal 2 — Dev client (Vite):**

```bash
cd client
npm run dev
```

Open **http://localhost:5173** and sign up or log in.

### 4. Production build

```bash
cd client
echo "VITE_API_URL=https://your-domain.com/api" > .env.production
npm run build
cd ..
```

Then run the server (it can serve `client/dist` under `/mcms`). See [DEPLOY.md](./DEPLOY.md) for nginx, path (`/mcms`), and subdomain deployment.

---

## Project structure

```
mcms/
├── client/                 # React SPA (Vite)
│   ├── src/
│   │   ├── components/     # UI (TopBar, Sidebar, VideoArea, PollVoting, etc.)
│   │   ├── context/        # Auth, Socket
│   │   ├── hooks/          # Keyboard shortcuts, WebRTC, transcription
│   │   └── pages/          # Login, Signup
│   └── vite.config.js      # base: /mcms/ in production
├── server/                 # Express API + Socket.io
│   ├── models/             # User, Meeting, Poll, Note, Transcript, RSVP, Notification
│   ├── middleware/         # auth
│   └── index.js            # Routes, WebSocket, optional MongoDB
├── DEPLOY.md               # Deployment (nginx, env, subdomain)
└── README.md
```

---

## Keyboard shortcuts (power users)

| Shortcut   | Action           |
|-----------|-------------------|
| `⌘K` / `Ctrl+K` | Focus search     |
| `⌘B` / `Ctrl+B` | Toggle sidebar   |
| `⇧M`      | New meeting      |
| `⌘[`      | Toggle agenda panel |
| `⌘]`      | Toggle right panel  |
| `F`       | Fullscreen       |
| `D`       | Toggle dark/light theme |
| `Esc`     | Close modals / exit fullscreen |

---

## License

See repository license file.
