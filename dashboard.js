document.addEventListener('DOMContentLoaded', () => {

    const storedUser = JSON.parse(localStorage.getItem('user'));
    if (storedUser && storedUser.name) {
        document.getElementById('userName').textContent = storedUser.name;
    }

    // Tab Navigation Logic
    const navLinks = document.querySelectorAll('#navMenu a');
    const sections = document.querySelectorAll('.view-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');

            navLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => {
                s.style.display = 'none';
                s.classList.remove('active-section');
            });

            link.classList.add('active');
            const targetSection = document.getElementById(targetId);
            targetSection.style.display = 'block';
            targetSection.classList.add('active-section');
        });
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    });

    // Auto-load all dashboard data
    loadEventModule();
    loadMemberModule();
    loadFinanceModule();
    // Fetch default data for input-based widgets
    setTimeout(() => {
        fetchParticipants();
        fetchColleagues();
        fetchDestinations();
    }, 500); // slight delay to let DOM settle if needed
});

// Helper function to fetch data and render HTML efficiently
async function fetchAndRender(url, containerId, emptyHtml, renderCallback) {
    const container = document.getElementById(containerId);
    try {
        const res = await fetch(`https://buac-system.onrender.com${url}`);
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        if (data.length === 0) {
            container.innerHTML = emptyHtml;
            return;
        }

        // .map().join('') is much faster than .forEach(innerHTML +=) as it only repaints the DOM once
        container.innerHTML = data.map(renderCallback).join('');
    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        container.innerHTML = `<p style="color: #ef4444; padding: 10px;">Error: ${error.message}</p>`;
    }
}

/* ==========================================
   MODULE 1: EVENT MANAGEMENT SYSTEM
   ========================================== */

function loadEventModule() {
    // Query 1: Upcoming Treks (Table)
    fetchTreks();

    // Query 2: Semester Planning (Stat Cards)
    fetchSemesterPlanning();

    // Query 3: High Budget Events (Alert List)
    fetchAndRender('/api/events/budget/above-average', 'highBudgetList', '<li>No high budget events found.</li>', e => `
        <li>
            <span class="item-title"><i class="fa-solid fa-circle-exclamation"></i> ${e.event_type} (${e.event_id})</span>
            <span class="item-value" style="color:#ef4444;">৳${e.budget.toLocaleString()}</span>
        </li>
    `);

    // Query 4: Destinations (Grid)
    // Initially fetched via fetchDestinations() in the setTimeout above
}

function fetchTreks() {
    const dateInput = document.getElementById('trekDateFilter');
    let url = '/api/events/trekking';
    if (dateInput && dateInput.value) {
        url += `?date=${encodeURIComponent(dateInput.value)}`;
    }
    document.getElementById('trekTableBody').innerHTML = '<tr><td colspan="3"><i class="fa-solid fa-spinner fa-spin" style="color: #f97316;"></i> Loading data...</td></tr>';

    fetchAndRender(url, 'trekTableBody', '<tr><td colspan="3">No treks planned.</td></tr>', t => {
        // Format date exactly as MM-DD-YYYY regardless of backend output
        const d = new Date(t.event_date);
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const yyyy = d.getUTCFullYear();
        const displayDate = `${mm}-${dd}-${yyyy}`;

        const budgetClass = t.budget < 50000 ? 'budget-safe' : 'budget-warn';
        return `
            <tr>
                <td><strong>${t.spot_name}</strong></td>
                <td>${displayDate}</td>
                <td class="${budgetClass}">৳${t.budget.toLocaleString()}</td>
            </tr>
        `;
    });
}

function fetchSemesterPlanning() {
    const yearInput = document.getElementById('semesterYearFilter');
    let url = '/api/events/budget/semester';
    if (yearInput && yearInput.value) {
        url += `?year=${encodeURIComponent(yearInput.value)}`;
    }
    document.getElementById('semesterCards').innerHTML = '<p><i class="fa-solid fa-spinner fa-spin" style="color: #f97316;"></i> Loading data...</p>';

    fetchAndRender(url, 'semesterCards', '<p>No semester data found for this year.</p>', s => `
        <div class="stat-card">
            <h4>${s.semester_name} ${s.year}</h4>
            <div class="stat-value">৳${parseInt(s.Total_Planned_Budget).toLocaleString()}</div>
        </div>
    `);
}

function fetchDestinations() {
    const districtInput = document.getElementById('districtFilter');
    let url = '/api/destinations/explore';
    if (districtInput && districtInput.value) {
        url += `?district=${encodeURIComponent(districtInput.value)}`;
    }
    document.getElementById('destGrid').innerHTML = '<p><i class="fa-solid fa-spinner fa-spin" style="color: #f97316;"></i> Loading data...</p>';

    fetchAndRender(url, 'destGrid', '<p>No destinations found in this district.</p>', d => `
        <div class="dest-card">
            <h4>${d.Spot_name}</h4>
            <p>Est. Budget: ৳${d.estimated_budget.toLocaleString()}</p>
            <p style="color: #f97316; font-size: 0.85rem; font-weight: bold; margin-top: 5px;">
                <i class="fa-solid fa-route"></i> Visited: ${d.times_visited} time(s)
            </p>
        </div>
    `);
}

/* ==========================================
   MODULE 2: MEMBER ENGAGEMENT ANALYTICS
   ========================================== */

function loadMemberModule() {
    // Query 4: Top Performers (Leaderboard)
    // Needs custom fetching due to slice(0,5) logic, but we can do it with fetchAndRender by slicing inside render or wrapping it.
    // To keep it simple, we use the helper and slice in the render logic if we want, but since map runs on everything, we'll manually fetch this one or use index.
    const leadList = document.getElementById('leaderboardList');
    fetch('http://localhost:3000/api/members/top-performers')
        .then(res => res.json())
        .then(tops => {
            if (tops.error) throw new Error(tops.error);
            if (tops.length === 0) { leadList.innerHTML = '<li>No performers found.</li>'; return; }
            leadList.innerHTML = tops.slice(0, 5).map((m, index) => {
                let medal = '';
                if (index === 0) medal = '<i class="fa-solid fa-medal" style="color: #fbbf24;"></i> '; // Gold
                else if (index === 1) medal = '<i class="fa-solid fa-medal" style="color: #94a3b8;"></i> '; // Silver
                else if (index === 2) medal = '<i class="fa-solid fa-medal" style="color: #b45309;"></i> '; // Bronze
                else medal = `<span style="color: #64748b; font-weight: bold; width: 20px; display:inline-block;">${index + 1}.</span> `;
                return `
                    <li>
                        <span class="item-title">${medal} ${m.Name}</span>
                        <span class="item-value">${m.Total_Points} pts</span>
                    </li>
                `;
            }).join('');
        }).catch(err => leadList.innerHTML = `<li>Error: ${err.message}</li>`);

    // Query 2: Active Members (Contact Roster Table)
    fetchAndRender('/api/members/active', 'activeMembersTable', '<tr><td colspan="3">No active members.</td></tr>', m => {
        let displayDate = 'N/A';
        if (m.Join_Date) {
            const d = new Date(m.Join_Date);
            const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(d.getUTCDate()).padStart(2, '0');
            const yyyy = d.getUTCFullYear();
            displayDate = `${mm}-${dd}-${yyyy}`;
        }

        return `
        <tr>
            <td><strong>${m.Name}</strong></td>
            <td>${m.E_mail}</td>
            <td style="color:#94a3b8;">${displayDate}</td>
        </tr>
        `;
    });
}

function fetchParticipants() {
    const eventId = document.getElementById('partEventId').value;
    document.getElementById('partResults').innerHTML = '<li>Loading...</li>';
    fetchAndRender(`/api/events/${eventId}/participants`, 'partResults', '<li>No participants found.</li>', p => {
        const roleColor = p.role.toLowerCase() === 'organizer' ? '#f97316' : '#94a3b8';
        return `
            <li>
                <span class="item-title">${p.Name} <span class="badge" style="background: ${roleColor}22; color: ${roleColor};">${p.role}</span></span>
                <span class="item-value">${p.points} pts</span>
            </li>
        `;
    });
}

function fetchColleagues() {
    const name = document.getElementById('colleagueName').value;
    document.getElementById('colleagueResultsGrid').innerHTML = '<p>Loading...</p>';
    fetchAndRender(`/api/members/colleagues?name=${encodeURIComponent(name)}`, 'colleagueResultsGrid', '<p>No peers found.</p>', peer => {
        if (peer.Name.toLowerCase() === name.toLowerCase()) return ''; // Exclude self
        return `
            <div class="dest-card" style="border-color: rgba(249,115,22,0.2);">
                <h4><i class="fa-solid fa-user"></i> ${peer.Name}</h4>
                <p style="color: #94a3b8; font-weight: normal; margin-top: 5px;">${peer.Department_name}</p>
                <p style="color: #94a3b8; font-weight: normal; font-size: 0.8rem;">${peer.Position_name}</p>
            </div>
        `;
    });
}

/* ==========================================
   MODULE 3: FINANCIAL TRANSPARENCY
   ========================================== */

function loadFinanceModule() {
    // Query 1: Budget Variance (Progress Bars)
    fetchAndRender('/api/events/budget/compare', 'budgetVarianceContainer', '<p>No budget data.</p>', v => {
        const actual = Number(v.Actual_Expenses);
        const planned = Number(v.Planned_Budget);
        const percent = planned > 0 ? Math.min((actual / planned) * 100, 100) : 0;
        const isOverBudget = actual > planned;
        return `
            <div class="progress-container">
                <div class="progress-header">
                    <span>Event ${v.event_id}</span>
                    <span>৳${actual.toLocaleString()} / ৳${planned.toLocaleString()}</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill ${isOverBudget ? 'over-budget' : ''}" style="width: ${percent}%;"></div>
                </div>
            </div>
        `;
    });

    // Query 2: Income Statement (Ledger Table)
    fetchIncomeLedger();

    // Query 3: Sponsor Contribution (Showcase Cards)
    fetchAndRender('/api/finance/sponsors', 'sponsorCards', '<p>No sponsors found.</p>', s => `
        <div class="stat-card" style="border-color: rgba(74, 222, 128, 0.2);">
            <h4><i class="fa-solid fa-handshake"></i> ${s.brand_name}</h4>
            <div class="stat-value" style="color: #4ade80;">৳${parseInt(s.Total_Contribution).toLocaleString()}</div>
        </div>
    `);

    // Query 4: Inactive Members (Actionable List)
    fetchAndRender('/api/members/inactive', 'inactiveMembersList', '<li>All members are active!</li>', m => `
        <li>
            <div>
                <span class="item-title">${m.Name}</span><br>
                <small style="color: #94a3b8;">${m.E_mail}</small>
            </div>
            <button class="action-btn"><i class="fa-solid fa-paper-plane"></i> Send Invite</button>
        </li>
    `);
}

function fetchIncomeLedger() {
    const yearInput = document.getElementById('incomeYearFilter');
    let url = '/api/finance/income';
    if (yearInput && yearInput.value) {
        url += `?year=${encodeURIComponent(yearInput.value)}`;
    }
    document.getElementById('incomeLedgerTable').innerHTML = '<tr><td colspan="3"><i class="fa-solid fa-spinner fa-spin" style="color: #f97316;"></i> Loading data...</td></tr>';

    fetchAndRender(url, 'incomeLedgerTable', '<tr><td colspan="3">No income records found for this year.</td></tr>', i => {
        // Date is already formatted as YYYY-MM-DD from the backend
        const d = new Date(i.date);
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const yyyy = d.getUTCFullYear();
        const displayDate = `${mm}-${dd}-${yyyy}`;

        return `
            <tr>
                <td>${displayDate}</td>
                <td><strong>${i.source_type}</strong><br><small style="color:#94a3b8;">${i.description}</small></td>
                <td class="text-income">+৳${i.amount.toLocaleString()}</td>
            </tr>
        `;
    });
}
