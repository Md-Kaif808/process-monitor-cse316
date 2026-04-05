"""
Real-Time Process Monitoring Dashboard
CSE-316 CA2 Project — Backend: Flask + psutil
"""

from flask import Flask, render_template, jsonify
import psutil
import datetime
import subprocess
import sys

app = Flask(__name__)

SKIP_NAMES = {'system idle process', 'system', 'registry', 'smss.exe', 'csrss.exe'}


def fmt_bytes(b):
    if b >= 1e9: return f"{b/1e9:.1f} GB"
    if b >= 1e6: return f"{b/1e6:.1f} MB"
    return f"{b/1e3:.0f} KB"


def get_system_stats():
    cpu  = psutil.cpu_percent(interval=0.1)
    mem  = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    net  = psutil.net_io_counters()
    return {
        "cpu_percent":    round(cpu, 1),
        "cpu_count":      psutil.cpu_count(),
        "memory_total":   mem.total,
        "memory_used":    mem.used,
        "memory_percent": round(mem.percent, 1),
        "disk_total":     disk.total,
        "disk_used":      disk.used,
        "disk_percent":   round(disk.percent, 1),
        "net_sent":       net.bytes_sent,
        "net_recv":       net.bytes_recv,
        "boot_time":      datetime.datetime.fromtimestamp(psutil.boot_time()).strftime("%H:%M:%S"),
        "timestamp":      datetime.datetime.now().strftime("%H:%M:%S"),
    }


def get_processes():
    procs = []
    for proc in psutil.process_iter(['pid','name','status','cpu_percent',
                                     'memory_percent','num_threads','username','create_time']):
        try:
            info = proc.info
            name = (info['name'] or 'unknown').strip()
            if name.lower() in SKIP_NAMES:
                continue

            status = info['status'] or 'unknown'
            if status not in ('running','sleeping','stopped','zombie','disk-sleep','idle'):
                status = 'sleeping'

            cpu = round(min(info['cpu_percent'] or 0, 100), 1)
            ct  = datetime.datetime.fromtimestamp(info['create_time']).strftime("%H:%M:%S")
            user = (info['username'] or 'N/A')
            if '\\' in user:
                user = user.split('\\')[-1]

            procs.append({
                "pid":            info['pid'],
                "name":           name,
                "status":         status,
                "cpu_percent":    cpu,
                "memory_percent": round(info['memory_percent'] or 0, 2),
                "threads":        info['num_threads'] or 1,
                "username":       user,
                "started":        ct,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass

    procs.sort(key=lambda x: x['cpu_percent'], reverse=True)
    return procs


def get_cpu_per_core():
    return psutil.cpu_percent(interval=0.1, percpu=True)


def kill_pid(pid):
    """
    Kill a process. Uses taskkill /F on Windows for guaranteed termination.
    Returns (success: bool, message: str)
    """
    # First check it exists
    try:
        proc = psutil.Process(pid)
        pname = proc.name()
    except psutil.NoSuchProcess:
        return True, f"PID {pid} is already gone."
    except psutil.AccessDenied:
        pname = f"PID {pid}"

    # On Windows: use taskkill /F /PID which forcefully kills even stubborn processes
    if sys.platform == "win32":
        try:
            result = subprocess.run(
                ["taskkill", "/F", "/PID", str(pid)],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                return True, f"'{pname}' (PID {pid}) killed successfully."
            else:
                err = result.stderr.strip() or result.stdout.strip()
                # taskkill returns error 5 for access denied
                if "5" in err or "Access" in err:
                    return False, f"Cannot kill '{pname}' — right-click app.py → Run as Administrator."
                # If process not found it's already gone
                if "not found" in err.lower() or "128" in err:
                    return True, f"'{pname}' is already gone."
                return False, f"taskkill error: {err}"
        except subprocess.TimeoutExpired:
            return False, "Kill command timed out."
        except FileNotFoundError:
            pass  # taskkill not found, fall through to psutil

    # Linux / macOS fallback
    try:
        proc = psutil.Process(pid)
        proc.kill()
        proc.wait(timeout=3)
        return True, f"'{pname}' (PID {pid}) killed."
    except psutil.NoSuchProcess:
        return True, f"'{pname}' is already gone."
    except psutil.AccessDenied:
        return False, f"Access denied for '{pname}'. Run as Administrator/sudo."
    except psutil.TimeoutExpired:
        if not psutil.pid_exists(pid):
            return True, f"'{pname}' is gone."
        return False, f"'{pname}' did not respond to kill."


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/stats")
def api_stats():
    return jsonify(get_system_stats())

@app.route("/api/processes")
def api_processes():
    return jsonify(get_processes())

@app.route("/api/cores")
def api_cores():
    return jsonify(get_cpu_per_core())

@app.route("/api/kill/<int:pid>", methods=["POST"])
def api_kill(pid):
    # taskkill /F is authoritative on Windows — if it returns 0, process is gone.
    # Do NOT do a pid_exists() re-check — PIDs linger briefly in OS even after kill,
    # which was causing false "still alive / run as Admin" errors for normal processes.
    success, message = kill_pid(pid)
    status_code = 200 if success else 403
    return jsonify({"success": success, "message": message}), status_code


if __name__ == "__main__":
    print("\n" + "="*52)
    print("   Real-Time Process Monitor  |  CSE-316 CA2")
    print("   http://127.0.0.1:5000")
    print("   TIP: Run as Administrator for full kill access")
    print("="*52 + "\n")
    app.run(debug=True, host="0.0.0.0", port=5000, use_reloader=False)
