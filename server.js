const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const path = require('path');

const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Path to the C++ executable.
// - PARKING_BIN can override it (used by Docker and the unit tests)
// - Otherwise: parking_app.exe on Windows, ./parking_app on Linux/macOS
const EXEC_PATH =
    process.env.PARKING_BIN ||
    path.join(__dirname, process.platform === 'win32' ? 'parking_app.exe' : 'parking_app');

// The C++ program reads/writes "parking_data.txt" in its working directory.
// DATA_DIR lets us point that at a persistent volume (Kubernetes PVC).
const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(cors());
app.use(express.json());

// Serve ONLY the frontend folder (previously the whole project folder was
// exposed, including server.js and parking_data.txt)
app.use(express.static(path.join(__dirname, 'public')));

// Health check used by Kubernetes probes and the pipeline's Verification stage
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Backend server is running' });
});

// Helper function to safely execute the C++ CLI
function runCppBackend(args) {
    return new Promise((resolve, reject) => {
                 // If PARKING_BIN is a .js file (used by the tests), run it with Node itself.
        const isJs = EXEC_PATH.endsWith('.js');
        const file = isJs ? process.execPath : EXEC_PATH;
        const fileArgs = isJs ? [EXEC_PATH, ...args] : args;
        execFile(file, fileArgs, { cwd: DATA_DIR }, (error, stdout, stderr) => {
            if (error) {
                console.error("Backend Error:", stderr || error.message);
                return reject(error);
            }
            try {
                // Parse stdout as JSON
                const data = JSON.parse(stdout.trim());
                resolve(data);
            } catch (parseError) {
                console.error("Failed to parse C++ output:", stdout);
                reject(new Error("Invalid JSON from backend"));
            }
        });
    });
}

// 1. Get full status/dashboard data
app.get('/api/status', async (req, res) => {
    try {
        const data = await runCppBackend(['status']);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch status from backend' });
    }
});

// 2. Park a vehicle
app.post('/api/park', async (req, res) => {
    const { plate, owner, type, reserved } = req.body;
    
    // Validate inputs
    if (!plate || !owner || !type || reserved === undefined) {
        return res.status(400).json({ success: false, message: 'Missing fields' });
    }
    
    // Note: C++ args: park <plate> <owner> <type> <reserved(1/0)>
    // Double quotes are handled safely by execFile automatically
    const rsvFlag = reserved ? '1' : '0';
    
    try {
        const result = await runCppBackend(['park', plate, owner, type, rsvFlag]);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Backend error' });
    }
});

// 3. Checkout a vehicle
app.post('/api/checkout', async (req, res) => {
    const { slot } = req.body;
    
    if (!slot) {
        return res.status(400).json({ success: false, message: 'Missing slot number' });
    }
    
    try {
        const result = await runCppBackend(['checkout', slot.toString()]);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Backend error' });
    }
});

// 4. Reset revenue
app.post('/api/reset', async (req, res) => {
    try {
        const result = await runCppBackend(['reset']);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Backend error' });
    }
});

// 5. Auth Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Missing credentials' });
    }
    
    try {
        const result = await runCppBackend(['login', username, password]);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Backend error' });
    }
});

// 6. Submit feedback
app.post('/api/feedback', async (req, res) => {
    const { rating, message } = req.body;
    
    if (rating === undefined || !message) {
        return res.status(400).json({ success: false, message: 'Missing feedback fields' });
    }
    
    try {
        const result = await runCppBackend(['feedback', rating.toString(), message]);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Backend error' });
    }
});

// Only start listening when run directly (node server.js).
// Tests import `app` without opening a port.
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Parking System Middleware running on http://localhost:${PORT}`);
        console.log(`Connected to C++ Backend at: ${EXEC_PATH}`);
    });
}

module.exports = app;
