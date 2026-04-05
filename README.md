# Real-Time Process Monitoring Dashboard
## CSE-316 CA2 Project

---

## Project Overview
A web-based graphical dashboard that displays real-time information about system processes,
CPU usage, memory consumption, and disk usage. Built using Python (Flask + psutil) for the
backend and HTML/CSS/JavaScript for the frontend.

---

## Modules
1. **Data Collection Module** — `app.py` (Flask + psutil)
   - Collects CPU, memory, disk, network stats
   - Lists all running processes with PID, state, CPU%, memory%
   - Exposes REST API endpoints

2. **Visualization/GUI Module** — `templates/index.html`
   - Live sparkline history charts (Chart.js)
   - Per-core CPU bar graph
   - Color-coded process table with sorting & filtering

3. **Process Management Module** — Kill button + REST API
   - Search and filter processes by state
   - Terminate any process via the dashboard
   - High-CPU alerts

---

## Tech Stack
- **Backend**: Python 3, Flask, psutil
- **Frontend**: HTML5, CSS3, Vanilla JavaScript, Chart.js
- **Version Control**: Git / GitHub

---

## Setup & Run

### Step 1 — Install dependencies
```
pip install flask psutil
```

### Step 2 — Run the server
```
python app.py
```

### Step 3 — Open dashboard
Open your browser and go to:
```
http://127.0.0.1:5000
```

---

## API Endpoints
| Endpoint              | Method | Description                   |
|-----------------------|--------|-------------------------------|
| `/`                   | GET    | Dashboard HTML page           |
| `/api/stats`          | GET    | System-wide CPU/mem/disk data |
| `/api/processes`      | GET    | List of all processes         |
| `/api/cores`          | GET    | Per-core CPU percentages      |
| `/api/kill/<pid>`     | POST   | Terminate a process by PID    |

---

## Features
- Live updating every 2 seconds (stats) / 3 seconds (process list)
- Rolling 30-second CPU and memory history charts
- Per-core CPU visualization
- Process table: sort by any column, filter by state, search by name/user
- High-CPU alert banner (triggers at > 80%)
- Kill any process from the UI (with confirmation)
- Pause/Resume live feed

---

## File Structure
```
process_monitor/
├── app.py               # Flask backend + psutil data collection
├── requirements.txt     # Python dependencies
├── README.md            # This file
└── templates/
    └── index.html       # Frontend dashboard (HTML + CSS + JS)
```

---

## Author
CSE-316 CA2 — [Your Name] — [Roll Number]
