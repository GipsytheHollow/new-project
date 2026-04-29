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
    const { memberId, name, email, joinDate, deptId, posId, phone, password } = req.body;

    if (!memberId || !name || !email || !password || !joinDate || !deptId || !posId || !phone) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        // Hash the password with bcrypt (Cost factor 10)
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert new member into the DB using parameterized query
        const sql = `INSERT INTO Member (Member_ID, Name, E_mail, Join_Date, Dept_ID, Pos_ID, Phone, password, Status, Cumulative_Points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', 0)`;
        await db.query(sql, [memberId, name, email, joinDate, deptId, posId, phone, hashedPassword]);

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
    let sql = `
        SELECT E.event_id, D.spot_name, DATE_FORMAT(E.event_date, '%Y-%m-%d') as event_date, E.budget 
        FROM Event E 
        JOIN Destination D ON E.dest_id = D.dest_id 
        WHERE E.event_type = 'Trekking'
    `;
    const params = [];
    if (req.query.date) {
        sql += ` AND DATE(E.event_date) > ?`;
        params.push(req.query.date);
    }
    sql += ` ORDER BY E.event_date ASC`;
    executeQuery(res, sql, params);
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
    let sql = `
        SELECT semester_name, year, SUM(budget) AS Total_Planned_Budget 
        FROM Event 
    `;
    const params = [];
    if (req.query.year) {
        sql += ` WHERE year = ?`;
        params.push(req.query.year);
    }
    sql += ` GROUP BY semester_name, year ORDER BY year DESC, semester_name ASC`;
    executeQuery(res, sql, params);
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

// 6. Active member roster
app.get('/api/members/active', (req, res) => {
    const sql = `
        SELECT Name, E_mail, DATE_FORMAT(Join_Date, '%Y-%m-%d') as Join_Date 
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
    let sql = `
        SELECT DATE_FORMAT(date, '%Y-%m-%d') as date, amount, source_type, description 
        FROM Finance 
        WHERE type = 'Income'
    `;
    const params = [];
    if (req.query.year) {
        sql += ` AND YEAR(date) = ?`;
        params.push(req.query.year);
    }
    sql += ` ORDER BY date DESC`;
    executeQuery(res, sql, params);
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

// 12. Explore destinations by district
app.get('/api/destinations/explore', (req, res) => {
    let district = req.query.district || 'Rangamati';
    const sql = `
        SELECT D.Spot_name, D.estimated_budget, COUNT(E.event_id) as times_visited
        FROM Destination D
        LEFT JOIN Event E ON D.dest_ID = E.dest_id
        WHERE D.District = ?
        GROUP BY D.dest_ID, D.Spot_name, D.estimated_budget
        ORDER BY times_visited DESC
    `;
    executeQuery(res, sql, [district]);
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
