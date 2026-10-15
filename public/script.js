// Global Configuration matching C++ backend exactly
const CONFIG = {
    TOTAL_SLOTS: 10,
    NORMAL_RATE: 40,    // Rs 40/hr
    RESERVED_RATE: 100  // Rs 100/hr
};

// API Endpoint
const API_BASE = '/api'; // relative: works on localhost, Docker and Kubernetes

// State Variables synced from C++ Backend
let slots = new Array(CONFIG.TOTAL_SLOTS).fill(null);
let vehicleHistory = [];
let feedbackEntries = [];
let totalRevenueNormal = 0;
let totalRevenueReserved = 0;

let checkoutTargetSlot = null; // Stores slot number (1-10) of vehicle being checked out

document.addEventListener('DOMContentLoaded', async () => {
    // Authentication Check
    const sessionAuth = sessionStorage.getItem('auth');
    if (!sessionAuth) {
        // Not logged in: show login screen
        document.getElementById('login-view').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        return; 
    }

    // Logged in: show app
    const authData = JSON.parse(sessionAuth);
    document.getElementById('user-profile-name').textContent = authData.name;
    document.getElementById('user-profile-role').textContent = authData.role;
    
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';

    updateDate();
    setupNavigation();
    
    // Initial fetch from C++ Backend
    await refreshStateFromBackend();
});

// ---- Authentication Flow ----
async function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value.trim();
    const errDiv = document.getElementById('login-error');
    errDiv.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        
        const result = await response.json();
        if (result.success) {
            sessionStorage.setItem('auth', JSON.stringify({
                name: result.name,
                role: result.role
            }));
            // Reload to initialize app
            window.location.reload();
        } else {
            errDiv.textContent = result.message || "Invalid credentials.";
            errDiv.style.display = 'block';
        }
    } catch (err) {
        console.error(err);
        errDiv.textContent = "Failed to connect to backend.";
        errDiv.style.display = 'block';
    }
}

function handleLogout() {
    sessionStorage.removeItem('auth');
    window.location.reload();
}

function updateDate() {
    const dateElement = document.getElementById('current-date');
    if (dateElement) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateElement.textContent = new Date().toLocaleDateString('en-US', options);
    }
}

// ---- API Integration ----

async function refreshStateFromBackend() {
    try {
        const response = await fetch(`${API_BASE}/status`);
        if (!response.ok) throw new Error('Status fetch failed');
        const data = await response.json();
        
        slots = data.slots;
        vehicleHistory = data.history;
        feedbackEntries = data.feedback || [];
        totalRevenueNormal = data.totalRevenueNormal;
        totalRevenueReserved = data.totalRevenueReserved;

        updateDashboard();
        renderSlots();
        renderHistory();
        renderFeedback();
        updateRevenueView();
    } catch (err) {
        console.error("Failed to connect to backend:", err);
        alert("Warning: Could not connect to the C++ backend server. Make sure node server.js is running!");
    }
}

// ---- Routing / Navigation ----
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const viewTarget = item.getAttribute('data-view');
            if(viewTarget) {
                switchView(viewTarget);
                navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');
            }
        });
    });
}

function switchView(viewId) {
    document.querySelectorAll('.app-view').forEach(view => {
        view.classList.add('hidden');
        view.classList.remove('active');
    });
    
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
        
        if(viewId === 'dashboard') updateDashboard();
        if(viewId === 'slots-view') renderSlots();
        if(viewId === 'revenue-view') updateRevenueView();
        if(viewId === 'history-view') renderHistory();
        if(viewId === 'feedback-list') renderFeedback();
    }
}

// ---- Feature 1: Park Vehicle ----
async function handleParkVehicle(e) {
    e.preventDefault();
    const typeInput = document.getElementById('vehicle-type').value;
    const plateInput = document.getElementById('plate-number').value.trim().toUpperCase();
    const ownerInput = document.getElementById('owner-name').value.trim();
    const isReserved = document.getElementById('reserved-status').value === "1";
    
    try {
        const response = await fetch(`${API_BASE}/park`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plate: plateInput,
                owner: ownerInput,
                type: typeInput,
                reserved: isReserved
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            e.target.reset(); // Reset form
            alert(`Vehicle parked at slot ${result.slot}`);
            await refreshStateFromBackend(); // Sync full state
            
            // Switch to dashboard view
            const dashNav = document.querySelector('.nav-item[data-view="dashboard"]');
            dashNav.click();
        } else {
            alert("Error: " + result.message);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to submit to backend!");
    }
}

// ---- Feature 2 & 3: Show Slots Dashboard ----
function updateDashboard() {
    const occupied = slots.filter(s => s !== null).length;
    const available = CONFIG.TOTAL_SLOTS - occupied;
    
    // Today's total parked: active + those from history matching today
    const todayStr = new Date().toDateString();
    
    let checkedOutToday = 0;
    vehicleHistory.forEach(h => {
        // C++ backend returns date as YYYY-MM-DD
        if (new Date(h.exitTime).toDateString() === todayStr) {
            checkedOutToday++;
        }
    });

    let activeParkedToday = 0;
    slots.forEach(s => {
        if (s !== null) {
            if (new Date(s.entryTime).toDateString() === todayStr) {
                activeParkedToday++;
            }
        }
    });
    
    const dashAv = document.getElementById('dash-available');
    if(dashAv) dashAv.textContent = available;

    const dashOcc = document.getElementById('dash-occupied');
    if(dashOcc) dashOcc.textContent = occupied;

    const dashTot = document.getElementById('dash-total');
    if(dashTot) dashTot.textContent = checkedOutToday + activeParkedToday;
}

// Feature 2 & 3 detailed lists
function renderSlots() {
    const tbody = document.querySelector('#occupied-table tbody');
    if (!tbody) return;

    const statusText = document.getElementById('slots-status');
    const availableList = document.getElementById('slots-available-list');
    
    let occupiedCount = 0;
    let availableArr = [];
    
    for(let i = 0; i < CONFIG.TOTAL_SLOTS; i++) {
        if(slots[i] === null) {
            availableArr.push(i + 1);
        } else {
            occupiedCount++;
        }
    }
    
    if(statusText) statusText.textContent = `Available: ${availableArr.length} | Occupied: ${occupiedCount}`;
    if(availableList) availableList.textContent = `Empty Slot Numbers: ${availableArr.join(', ')}`;
    
    tbody.innerHTML = '';
    
    if(occupiedCount === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No vehicles currently parked.</td></tr>`;
        return;
    }
    
    for(let i = 0; i < CONFIG.TOTAL_SLOTS; i++) {
        if(slots[i] !== null) {
            const vehicle = slots[i];
            const entryDate = new Date(vehicle.entryTime);
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${i + 1}</strong></td>
                <td><strong>${vehicle.plate}</strong></td>
                <td>${vehicle.owner}</td>
                <td>${vehicle.type}</td>
                <td>${vehicle.reserved ? 'Yes' : 'No'}</td>
                <td>${entryDate.toLocaleTimeString()}</td>
                <td><button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="initiateCheckout(${i + 1})">Checkout</button></td>
            `;
            tbody.appendChild(tr);
        }
    }
}

// ---- Feature 4: Checkout Vehicle ----
function initiateCheckout(slotNo) {
    const index = slotNo - 1;
    const vehicle = slots[index];
    if(!vehicle) {
        alert("Slot is already empty!");
        return;
    }
    
    checkoutTargetSlot = slotNo;
    const entryDate = new Date(vehicle.entryTime);
    const exitDate = new Date(); // local calc for UI prep
    
    // Duration in hours (ceil)
    let elapsedHours = Math.ceil(Math.abs(exitDate - entryDate) / 36e5);
    if(elapsedHours === 0) elapsedHours = 1;
    
    const rate = vehicle.reserved ? CONFIG.RESERVED_RATE : CONFIG.NORMAL_RATE;
    const totalFee = elapsedHours * rate;
    
    const detailsContainer = document.getElementById('checkout-details');
    detailsContainer.innerHTML = `
        <p><strong>Slot Number:</strong> ${slotNo}</p>
        <p><strong>Plate:</strong> ${vehicle.plate}</p>
        <p><strong>Owner:</strong> ${vehicle.owner}</p>
        <p><strong>Type:</strong> ${vehicle.type}</p>
        <p><strong>Status:</strong> ${vehicle.reserved ? 'Reserved' : 'Normal'}</p>
        <p><strong>Entry:</strong> ${entryDate.toLocaleTimeString()}</p>
        <div class="checkout-total">To Pay (Est.): Rs ${totalFee}</div>
        <p style="font-size: 0.8rem; opacity: 0.8;">C++ engine will compute exact real-time fee.</p>
    `;
    
    document.getElementById('checkout-panel').classList.remove('hidden');
    document.getElementById('checkout-panel').scrollIntoView({ behavior: 'smooth' });
}

function cancelCheckout() {
    checkoutTargetSlot = null;
    document.getElementById('checkout-panel').classList.add('hidden');
}

async function confirmCheckout() {
    if(!checkoutTargetSlot) return;
    
    try {
        const response = await fetch(`${API_BASE}/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slot: checkoutTargetSlot })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(`Slot ${checkoutTargetSlot} is now free. Collected Rs ${result.fee} for ${result.hours} hours.`);
            cancelCheckout();
            await refreshStateFromBackend(); // Sync fresh data from C++ file
        } else {
            alert("Error: " + result.message);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to checkout via backend.");
    }
}

// ---- Feature 6 & 7: Revenue ----
function updateRevenueView() {
    const total = totalRevenueNormal + totalRevenueReserved;
    const revTotal = document.getElementById('rev-total');
    if(revTotal) revTotal.textContent = `Rs ${total}`;
    
    const revNorm = document.getElementById('rev-normal');
    if(revNorm) revNorm.textContent = `Rs ${totalRevenueNormal}`;
    
    const revRes = document.getElementById('rev-reserved');
    if(revRes) revRes.textContent = `Rs ${totalRevenueReserved}`;

    // Calculate All-Time Cumulative Total
    const allTimeTotal = vehicleHistory.reduce((sum, log) => sum + parseFloat(log.fee || 0), 0);
    const revAllTime = document.getElementById('rev-all-time');
    if(revAllTime) revAllTime.textContent = `Rs ${allTimeTotal}`;
}

async function resetRevenue() {
    if(confirm("Are you sure you want to reset today's revenue to zero?")) {
        try {
            const response = await fetch(`${API_BASE}/reset`, { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
                alert("Revenue reset in backend datastore.");
                await refreshStateFromBackend();
            } else {
                alert("Could not reset backend.");
            }
        } catch(err) {
            console.error(err);
        }
    }
}

// ---- Feature 8: History By Date ----
function renderHistory(filterDateStr = null, searchPlate = null) {
    const tbody = document.querySelector('#history-table tbody');
    if(!tbody) return;
    
    tbody.innerHTML = '';
    
    let displayHistory = vehicleHistory;
    
    // Multi-criteria filter
    if (filterDateStr || searchPlate) {
        displayHistory = vehicleHistory.filter(h => {
            let matchesDate = true;
            let matchesPlate = true;
            
            if (filterDateStr) {
                matchesDate = (h.date === filterDateStr);
            }
            
            if (searchPlate) {
                matchesPlate = h.plate.toLowerCase().includes(searchPlate.toLowerCase());
            }
            
            return matchesDate && matchesPlate;
        });
    }
    
    if(displayHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">No matching history records found.</td></tr>`;
        return;
    }
    
    displayHistory.forEach(log => {
        const tr = document.createElement('tr');
        // Backend returns: h.date, h.entryTime, h.exitTime strings from C++ buffer.
        tr.innerHTML = `
            <td>${log.date}</td>
            <td><strong>${log.plate}</strong></td>
            <td>${log.owner}</td>
            <td>${log.type}</td>
            <td>${log.entryTime.split(' ')[1] || log.entryTime}</td>
            <td>${log.exitTime.split(' ')[1] || log.exitTime}</td>
            <td>${log.durationHours} hr</td>
            <td class="text-cyan"><strong>Rs ${log.fee}</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

function filterHistory() {
    const dateInput = document.getElementById('filter-date').value;
    const plateInput = document.getElementById('search-plate').value.trim();
    renderHistory(dateInput || null, plateInput || null);
}

function clearDateFilter() {
    document.getElementById('filter-date').value = '';
    document.getElementById('search-plate').value = ''; // Also clear search
    renderHistory();
}

function exportToCSV() {
    if (vehicleHistory.length === 0) {
        alert("No history data available for export.");
        return;
    }

    const headers = ["Date", "Plate Number", "Owner", "Type", "Entry Time", "Exit Time", "Duration (hr)", "Paid (Rs)"];
    
    // Get currently displayed history or full history if no filter is active
    const dateInput = document.getElementById('filter-date').value;
    const plateInput = document.getElementById('search-plate').value.trim();
    
    let exportData = vehicleHistory;
    if (dateInput || plateInput) {
        exportData = vehicleHistory.filter(h => {
            let matchesDate = dateInput ? (h.date === dateInput) : true;
            let matchesPlate = plateInput ? h.plate.toLowerCase().includes(plateInput.toLowerCase()) : true;
            return matchesDate && matchesPlate;
        });
    }

    if (exportData.length === 0) {
        alert("No filtered results to export.");
        return;
    }

    const rows = exportData.map(log => [
        `"${log.date}"`,
        `"${log.plate}"`,
        `"${log.owner}"`,
        `"${log.type}"`,
        `"${log.entryTime}"`,
        `"${log.exitTime}"`,
        log.durationHours,
        log.fee
    ]);

    const csvContent = headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Parking_History_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ---- Feedback Feature ----
function setRating(val) {
    document.getElementById('feedback-rating').value = val;
    const stars = document.querySelectorAll('.star-rating');
    stars.forEach((star, index) => {
        if (index < val) {
            star.classList.add('active', 'fa-solid');
            star.classList.remove('fa-regular');
        } else {
            star.classList.remove('active', 'fa-solid');
            star.classList.add('fa-regular');
        }
    });
}

function renderFeedback() {
    const tbody = document.querySelector('#feedback-table tbody');
    if(!tbody) return;
    
    tbody.innerHTML = '';
    
    if(!feedbackEntries || feedbackEntries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No feedback recorded yet.</td></tr>`;
        return;
    }
    
    feedbackEntries.forEach(fb => {
        const tr = document.createElement('tr');
        let stars = '';
        for(let i = 0; i < 5; i++) {
            stars += `<i class="${i < fb.rating ? 'fa-solid' : 'fa-regular'} fa-star" style="color: #ffd700; font-size: 0.8rem;"></i>`;
        }
        
        tr.innerHTML = `
            <td>${fb.timestamp}</td>
            <td>${stars} (${fb.rating}/5)</td>
            <td style="max-width: 400px; overflow-wrap: break-word;">${fb.message}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function handleFeedbackSubmit(e) {
    e.preventDefault();
    const rating = document.getElementById('feedback-rating').value;
    const message = document.getElementById('feedback-message').value;
    
    if (rating == "0") {
        alert("Please select a star rating!");
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: parseInt(rating), message: message })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(`Thank you for your ${rating}-star rating! Your feedback has been stored successfully.`);
            e.target.reset();
            setRating(0);
            await refreshStateFromBackend();
            
            // Navigate back to dashboard
            const dashNav = document.querySelector('.nav-item[data-view="dashboard"]');
            if (dashNav) dashNav.click();
        } else {
            alert("Error saving feedback: " + result.message);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to send feedback to backend.");
    }
}
