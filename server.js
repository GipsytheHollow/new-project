const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json()); // Parses incoming JSON requests
app.use(express.static('./')); // Serves your static HTML/CSS files

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// SIGNUP ROUTE
app.post('/api/signup', async (req, res) => {
    const { memberId, name, email, password } = req.body;

    if (!memberId || !name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        // Hash the password with bcrypt (Cost factor 10)
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert new member into the DB using parameterized query
        const sql = `INSERT INTO Member (Member_ID, Name, E_mail, password, Status, Cumulative_Points) VALUES (?, ?, ?, ?, 'Active', 0)`;
        await db.query(sql, [memberId, name, email, hashedPassword]);

        res.status(201).json({ message: 'User registered successfully!' });
    } catch (error) {
        console.error('Signup Error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email or Member ID already exists.' });
        }
        res.status(500).json({ error: 'Database error during signup.' });
    }
});

// LOGIN ROUTE
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        // Fetch the user by email
        const sql = `SELECT * FROM Member WHERE E_mail = ?`;
        const [users] = await db.query(sql, [email]);

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = users[0];

        // Compare the provided password with the hashed password in the DB
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Login successful (In a real app, generate a JWT token here)
        res.status(200).json({ 
            message: 'Login successful!', 
            user: { 
                id: user.Member_ID, 
                name: user.Name, 
                email: user.E_mail 
            } 
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Database error during login.' });
    }
});

// ==========================================
// DASHBOARD API ROUTES (New 12 Queries)
// ==========================================

// Helper function to execute and handle standard SQL queries
const executeQuery = async (res, sql, params = []) => {
    try {
        const [results] = await db.query(sql, params);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 1. Upcoming Trekking events and destination
app.get('/api/events/trekking', (req, res) => {
    const sql = `
        SELECT E.event_id, D.spot_name, E.event_date, E.budget 
        FROM Event E 
        JOIN Destination D ON E.dest_id = D.dest_id 
        WHERE E.event_type = 'Trekking'
    `;
    executeQuery(res, sql);
});

// 2. Track member participation for a specific event
app.get('/api/events/:eventId/participants', (req, res) => {
    const sql = `
        SELECT M.Name, P.role, P.points 
        FROM Member M 
        JOIN Participation P ON M.Member_ID = P.member_id 
        WHERE P.event_id = ?
    `;
    executeQuery(res, sql, [req.params.eventId]);
});

// 3. Calculate total estimated budget per semester
app.get('/api/events/budget/semester', (req, res) => {
    const sql = `
        SELECT semester_name, year, SUM(budget) AS Total_Planned_Budget 
        FROM Event 
        GROUP BY semester_name, year
    `;
    executeQuery(res, sql);
});

// 4. Find an event which has a budget higher than average budget
app.get('/api/events/budget/above-average', (req, res) => {
    const sql = `
        SELECT event_id, event_type, budget 
        FROM Event 
        WHERE budget > (SELECT AVG(budget) FROM Event)
    `;
    executeQuery(res, sql);
});

// 5. Compare planned budget vs actual expenses
app.get('/api/events/budget/compare', (req, res) => {
    const sql = `
        SELECT E.event_id, E.budget AS Planned_Budget, COALESCE(SUM(EX.amount), 0) AS Actual_Expenses 
        FROM Event E 
        LEFT JOIN Expenses EX ON E.event_id = EX.event_id 
        GROUP BY E.event_id, E.budget
    `;
    executeQuery(res, sql);
});

// 6. Find a list of active members
app.get('/api/members/active', (req, res) => {
    const sql = `
        SELECT Name, E_mail 
        FROM Member 
        WHERE Status = 'Active'
    `;
    executeQuery(res, sql);
});

// 7. Same Department or Position as a given member
app.get('/api/members/colleagues', (req, res) => {
    const sql = `
        SELECT M.Name, D.Department_name, P.Position_name, M.Cumulative_Points
        FROM Member M
        JOIN Department D ON M.Dept_ID = D.Department_ID
        JOIN Position P ON M.Pos_ID = P.Position_id
        WHERE M.Dept_ID = (SELECT Dept_ID FROM Member WHERE Name = ?)
        OR M.Pos_ID = (SELECT Pos_ID FROM Member WHERE Name = ?)
    `;
    executeQuery(res, sql, [req.query.name, req.query.name]);
});

// 8. Identify top performer based on total participation points
app.get('/api/members/top-performers', (req, res) => {
    const sql = `
        SELECT M.Name, SUM(P.points) AS Total_Points 
        FROM Member M 
        JOIN Participation P ON M.Member_ID = P.member_id 
        GROUP BY M.Member_ID, M.Name 
        ORDER BY Total_Points DESC
    `;
    executeQuery(res, sql);
});

// 9. Find inactive members who haven't participated in any events
app.get('/api/members/inactive', (req, res) => {
    const sql = `
        SELECT Name, E_mail 
        FROM Member 
        WHERE Member_ID NOT IN (SELECT DISTINCT member_id FROM Participation)
    `;
    executeQuery(res, sql);
});

// 10. Generate a basic income statement
app.get('/api/finance/income', (req, res) => {
    const sql = `
        SELECT date, amount, source_type, description 
        FROM Finance 
        WHERE type = 'Income' 
        ORDER BY date DESC
    `;
    executeQuery(res, sql);
});

// 11. List all sponsors and total amount they have contributed
app.get('/api/finance/sponsors', (req, res) => {
    const sql = `
        SELECT S.brand_name, SUM(F.amount) AS Total_Contribution 
        FROM Sponsor S 
        JOIN Finance F ON S.sponsor_id = F.sponsor_id 
        WHERE F.type = 'Income' 
        GROUP BY S.sponsor_id, S.brand_name
    `;
    executeQuery(res, sql);
});

// 12. Unused destinations in Rangamati with budget <= 100k
app.get('/api/destinations/unused', (req, res) => {
    const sql = `
        SELECT Spot_name, District, estimated_budget
        FROM Destination
        WHERE District = 'Rangamati'
          AND estimated_budget <= 100000
          AND dest_ID NOT IN (SELECT DISTINCT dest_id FROM Event)
    `;
    executeQuery(res, sql);
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
