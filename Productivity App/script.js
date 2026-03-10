// =============================================
// DISCIPLINE TRACKER - script.js
// =============================================

// --- STATE ---
let currentUser = null;
let userData = {
    username: '',
    chores: [],
    dailyGoal: 2,
    dailySessions: {},
    focusTimeData: { total: 0, daily: {} },
    examDate: null,
    badges: [],
    friends: [],
    friendRequests: [],
    streak: 0,
    lastActive: null
};

let timerInterval = null;
let timerSeconds = 0;
let timerTotal = 0;
let isRunning = false;
let lbMode = 'hours';

const today = new Date();
today.setHours(0, 0, 0, 0);
const dStr = today.toDateString();

const dates = [];
for (let i = 0; i <= 6; i++) {
    let d = new Date();
    d.setDate(today.getDate() + i);
    d.setHours(0, 0, 0, 0);
    dates.push(d);
}

// Badge definitions
const BADGES = [
    { id: 'week1',    icon: '🥇', name: '1-Week Streak',   desc: 'Scored 100% every day for 7 days',  days: 7   },
    { id: 'week2',    icon: '🔥', name: '2-Week Warrior',  desc: 'Scored 100% every day for 14 days', days: 14  },
    { id: 'month1',   icon: '💎', name: 'Monthly Master',  desc: 'Scored 100% every day for 30 days', days: 30  },
    { id: 'bi6month', icon: '🌟', name: '6-Month Legend',  desc: '100% every day for 180 days',       days: 180 },
    { id: 'year1',    icon: '👑', name: 'Year Champion',   desc: '100% every day for 365 days',       days: 365 },
];

const QUOTES = [
    "Discipline is the bridge between goals and accomplishment.",
    "Small daily improvements lead to staggering long-term results.",
    "The secret of getting ahead is getting started.",
    "Success is the sum of small efforts repeated day in and day out.",
    "Don't wish for it. Work for it.",
    "Push yourself because no one else is going to do it for you.",
    "Great things never come from comfort zones.",
    "Dream it. Wish it. Do it.",
    "Stay focused and never give up.",
    "Your only limit is your mind.",
];

// =============================================
// AUTH
// =============================================

auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists && doc.data().username) {
            Object.assign(userData, doc.data());
            showApp();
        } else {
            showScreen('usernameScreen');
        }
    } else {
        showScreen('authScreen');
    }
});

window.loginGoogle = function () {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => showAuthError(err.message));
};

window.loginEmail = function () {
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPassword').value;
    if (!email || !pass) { showAuthError('Enter email and password.'); return; }
    auth.signInWithEmailAndPassword(email, pass).catch(err => showAuthError(err.message));
};

window.registerEmail = function () {
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPassword').value;
    if (!email || !pass) { showAuthError('Enter email and password.'); return; }
    if (pass.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
    auth.createUserWithEmailAndPassword(email, pass).catch(err => showAuthError(err.message));
};

window.loginGuest = function () {
    auth.signInAnonymously().catch(err => showAuthError(err.message));
};

window.saveUsername = async function () {
    const val = document.getElementById('usernameInput').value.trim();
    if (!val || val.length < 3) { document.getElementById('usernameError').textContent = 'Username must be at least 3 characters.'; return; }
    if (val.length > 20) { document.getElementById('usernameError').textContent = 'Max 20 characters.'; return; }

    // Check uniqueness
    const snap = await db.collection('users').where('username', '==', val).get();
    if (!snap.empty) { document.getElementById('usernameError').textContent = 'Username already taken. Try another.'; return; }

    userData.username = val;
    await syncToCloud();
    showApp();
};

function showAuthError(msg) {
    const el = document.getElementById('authError');
    if (el) el.textContent = msg;
}

auth.signOut = auth.signOut.bind(auth);

// =============================================
// SCREENS & NAVIGATION
// =============================================

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const el = document.getElementById(id);
    el.classList.add('active');
    // appScreen uses flex row, auth screens use flex column
    el.style.display = (id === 'appScreen') ? 'flex' : 'flex';
}

function showApp() {
    showScreen('appScreen');
    updateSidebar();
    renderDashboard();
    loadLeaderboard();
    loadFriends();
    renderProfile();
}

window.showTab = function (name) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    event.currentTarget.classList.add('active');
    if (name === 'leaderboard') loadLeaderboard();
    if (name === 'friends') loadFriends();
    if (name === 'profile') renderProfile();
};

function updateSidebar() {
    const name = userData.username || currentUser.email || 'User';
    document.getElementById('sidebarName').textContent = name;
    document.getElementById('sidebarAvatar').textContent = name[0].toUpperCase();
}

// =============================================
// CLOUD SYNC
// =============================================

async function syncToCloud() {
    if (!currentUser) return;
    const scores = computeScores();
    const totalMins = Math.floor((userData.focusTimeData.total || 0) / 60);
    const todayPts = getTodayPoints();
    await db.collection('users').doc(currentUser.uid).set({
        username: userData.username,
        chores: userData.chores,
        dailyGoal: userData.dailyGoal,
        dailySessions: userData.dailySessions,
        focusTimeData: userData.focusTimeData,
        examDate: userData.examDate || null,
        badges: userData.badges,
        friends: userData.friends,
        friendRequests: userData.friendRequests,
        streak: userData.streak,
        lastActive: dStr,
        totalPoints: userData.totalPoints || 0,
        distractionPenalty: userData.distractionPenalty || 0,
        overallScore: Math.max(todayPts, 0),
        totalFocusMins: totalMins,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

// =============================================
// DASHBOARD RENDER
// =============================================

function renderDashboard() {
    document.getElementById('dailyQuote').textContent =
        `"${QUOTES[new Date().getDate() % QUOTES.length]}"`;
    updateCountdown();
    renderTable();
    updateScoreCards();
    renderBadges();
    updateStreak();
    updateTimeDisplay();
    updateSessionDisplay();
}

// =============================================
// SCORES
// =============================================

// =============================================
// POINTS SYSTEM
// 10 pts per subject done, 5 pts per habit done
// Distractions subtract points (can go negative)
// =============================================

// =============================================
// GOAL-BASED SCORING
// Target = (subjectGoal * 10) + (habitCount * 5)
// Over achieving = bonus pts + celebration
// =============================================

function getDailyTargetPts() {
    const subjectGoal = parseInt(userData.dailyGoal) || 2;
    const habitCount = userData.chores.filter(c => c.type === 'habit').length;
    return (subjectGoal * 10) + (habitCount * 5);
}

function getTodayPoints() {
    const subjects = userData.chores.filter(c => c.type === 'subject');
    const habits = userData.chores.filter(c => c.type === 'habit');
    const subjectPts = subjects.filter(c => c.history && c.history[dStr]).length * 10;
    const habitPts = habits.filter(c => c.history && c.history[dStr]).length * 5;
    const penalty = userData.distractionPenalty || 0;
    return subjectPts + habitPts - penalty;
}

function getTotalPoints() {
    return userData.totalPoints || 0;
}

function getSubjectScore(ds) {
    const subjects = userData.chores.filter(c => c.type === 'subject');
    const habits = userData.chores.filter(c => c.type === 'habit');
    const subjectPts = subjects.filter(c => c.history && c.history[ds]).length * 10;
    const habitPts = habits.filter(c => c.history && c.history[ds]).length * 5;
    return subjectPts + habitPts;
}

function allHabitsDoneOn(ds) {
    const habits = userData.chores.filter(c => c.type === 'habit');
    if (!habits.length) return false;
    return habits.every(c => c.history && c.history[ds]);
}

function computeScores() {
    const todayPts = getTodayPoints();
    const totalPts = getTotalPoints();
    const target = getDailyTargetPts();
    const penalty = userData.distractionPenalty || 0;
    return { today: todayPts, total: totalPts, target, penalty };
}

let lastCelebrated = false;

function updateScoreCards() {
    const s = computeScores();
    const dailyMins = Math.floor((userData.focusTimeData.daily[dStr] || 0) / 60);
    const totalMins = Math.floor((userData.focusTimeData.total || 0) / 60);
    const pct = s.target > 0 ? Math.min(Math.round((s.today / s.target) * 100), 150) : 0;
    const goalMet = s.today >= s.target && s.target > 0;
    const overAchieved = s.today > s.target && s.target > 0;

    // Today's Points card
    const todayEl = document.getElementById('dailyScore');
    if (todayEl) {
        todayEl.textContent = s.today + ' pts';
        todayEl.style.color = s.today < 0 ? '#ef4444' : goalMet ? '#10b981' : '';
    }

    // Target label
    const targetEl = document.getElementById('dailyTarget');
    if (targetEl) {
        targetEl.textContent = `Target: ${s.target} pts`;
        targetEl.style.color = goalMet ? '#10b981' : '#64748b';
    }

    // Progress bar — goes to 100% at goal, then overflows in gold
    const fill = document.getElementById('dailyFill');
    if (fill) {
        fill.style.width = '0%';
        setTimeout(() => {
            const barPct = Math.min(pct, 100);
            fill.style.width = barPct + '%';
            fill.style.background = overAchieved
                ? 'linear-gradient(90deg, #10b981, #f59e0b)'
                : goalMet
                ? '#10b981'
                : 'var(--accent)';
        }, 100);
    }

    // Over-achieve overflow bar
    const overflow = document.getElementById('dailyOverflow');
    if (overflow) {
        if (overAchieved) {
            const extra = Math.min(((s.today - s.target) / s.target) * 100, 50);
            overflow.style.width = extra + '%';
            overflow.style.display = 'block';
        } else {
            overflow.style.display = 'none';
        }
    }

    // Score card glow on goal met
    const card = document.getElementById('dailyScoreCard');
    if (card) {
        card.classList.toggle('goal-met', goalMet);
        card.classList.toggle('over-achieved', overAchieved);
    }

    // Celebration on first goal hit
    if (goalMet && !lastCelebrated) {
        lastCelebrated = true;
        triggerGoalCelebration(overAchieved);
    } else if (!goalMet) {
        lastCelebrated = false;
    }

    // Total points
    const totalEl = document.getElementById('weeklyScore');
    if (totalEl) {
        totalEl.textContent = s.total + ' pts';
        totalEl.style.color = s.total < 0 ? '#ef4444' : '';
    }

    // Penalty
    const penaltyEl = document.getElementById('overallScore');
    if (penaltyEl) {
        penaltyEl.textContent = (s.penalty > 0 ? '-' : '') + s.penalty + ' pts';
        penaltyEl.style.color = s.penalty > 0 ? '#ef4444' : '#10b981';
    }

    document.getElementById('focusToday').textContent = dailyMins + 'm';
    document.getElementById('focusTotal').textContent = totalMins + 'm';
}

// =============================================
// GOAL CELEBRATION
// =============================================
let celebrationShown = {};

function triggerGoalCelebration(isOverAchieve) {
    if (celebrationShown[dStr]) return;
    celebrationShown[dStr] = true;

    // Confetti burst
    if (window.confetti) {
        if (isOverAchieve) {
            // Gold confetti for over-achieving
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 },
                colors: ['#f59e0b', '#fbbf24', '#fcd34d', '#10b981', '#6366f1'] });
            setTimeout(() => confetti({ particleCount: 80, spread: 100, origin: { y: 0.5 },
                colors: ['#f59e0b', '#fbbf24'] }), 400);
        } else {
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        }
    }

    // Play cheer sound
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = isOverAchieve ? [523, 659, 784, 1047] : [523, 659, 784];
        notes.forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.frequency.value = freq;
            o.type = 'triangle';
            g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.12);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
            o.start(ctx.currentTime + i * 0.12);
            o.stop(ctx.currentTime + i * 0.12 + 0.3);
        });
    } catch(e) {}

    // Show celebration toast
    showCelebrationToast(isOverAchieve);
}

function showCelebrationToast(isOverAchieve) {
    const existing = document.getElementById('celebToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'celebToast';
    toast.className = 'celeb-toast' + (isOverAchieve ? ' celeb-over' : '');
    toast.innerHTML = isOverAchieve
        ? `<span class="celeb-icon">🌟</span><div><b>LEGENDARY!</b><br>You crushed your daily goal! Keep going! 🔥</div>`
        : `<span class="celeb-icon">🎯</span><div><b>Daily Goal Reached!</b><br>Amazing work today! You hit your target! 💪</div>`;

    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('celeb-show'), 50);
    setTimeout(() => {
        toast.classList.remove('celeb-show');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// =============================================
// STREAK
// =============================================

function updateStreak() {
    // Only count today for streak (future days don't count)
    // Use Firestore stored streak + today's score
    let streak = userData.streak || 0;
    const todayScore = getSubjectScore(dStr);
    // If today is 100%, increment streak, otherwise keep as is
    if (todayScore === 100) {
        streak = (userData.streak || 0);
        // Check if streak was already updated today
        if (userData.lastStreakDate !== dStr) {
            streak++;
            userData.lastStreakDate = dStr;
        }
    }
    userData.streak = streak;
    document.getElementById('streakCount').textContent = streak;
    checkBadges(streak);
}

// =============================================
// BADGES
// =============================================

function renderBadges() {
    const row = document.getElementById('badgeRow');
    const earned = userData.badges || [];
    row.innerHTML = '';
    let earnedCount = 0;
    BADGES.forEach(b => {
        const isEarned = earned.find(e => e.id === b.id);
        if (isEarned) earnedCount++;
        const div = document.createElement('div');
        div.className = 'badge-item ' + (isEarned ? 'earned' : 'locked');
        div.innerHTML = `
            <span class="badge-icon">${b.icon}</span>
            <div class="badge-name">${b.name}</div>
            ${isEarned ? `<div class="badge-earned-date">${isEarned.date}</div>` : '<div class="badge-earned-date" style="color:#475569">Locked</div>'}
        `;
        div.title = b.desc + (isEarned ? '' : ` — Need ${b.days} day streak`);
        row.appendChild(div);
    });
    document.getElementById('badgeCount').textContent = earnedCount + ' earned';
}

function checkBadges(streak) {
    const earned = userData.badges || [];
    const newBadges = [];
    BADGES.forEach(b => {
        if (streak >= b.days && !earned.find(e => e.id === b.id)) {
            const newBadge = { id: b.id, date: new Date().toLocaleDateString() };
            userData.badges.push(newBadge);
            newBadges.push(b);
        }
    });
    if (newBadges.length > 0) {
        renderBadges();
        showBadgeAward(newBadges[0]);
        syncToCloud();
    }
}

window.closeBadgeOverlay = function () {
    document.getElementById('badgeOverlay').classList.add('hidden');
};

function showBadgeAward(badge) {
    document.getElementById('badgeIconBig').textContent = badge.icon;
    document.getElementById('badgeTitleText').textContent = 'Badge Unlocked!';
    document.getElementById('badgeDescText').textContent = badge.desc;
    document.getElementById('badgeOverlay').classList.remove('hidden');

    // Sound effect
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [523, 659, 784, 1047].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
            osc.start(ctx.currentTime + i * 0.15);
            osc.stop(ctx.currentTime + i * 0.15 + 0.4);
        });
    } catch (e) {}

    confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, colors: ['#f59e0b', '#6366f1', '#10b981', '#fff'] });
}

// =============================================
// COUNTDOWN
// =============================================

window.saveExamDate = function () {
    userData.examDate = document.getElementById('examDateInput').value || null;
    updateCountdown();
    syncToCloud();
};

function updateCountdown() {
    const daysEl = document.getElementById('examDays');
    const labelEl = document.getElementById('examLabel');
    if (!userData.examDate) { daysEl.textContent = '--'; labelEl.textContent = 'No date set'; return; }
    const target = new Date(userData.examDate);
    target.setHours(0, 0, 0, 0);
    const diff = Math.ceil((target - today) / 86400000);
    if (diff > 0) { daysEl.textContent = diff; labelEl.textContent = `days until ${target.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`; }
    else if (diff === 0) { daysEl.textContent = '🎯'; labelEl.textContent = 'Exam is TODAY!'; }
    else { daysEl.textContent = Math.abs(diff); labelEl.textContent = `days since exam`; }
    if (userData.examDate) document.getElementById('examDateInput').value = userData.examDate;
}

// =============================================
// TIMER
// =============================================

window.setTimer = function () {
    if (isRunning) return;
    const mins = parseInt(document.getElementById('timerMins').value);
    if (!mins || mins < 1) return;
    timerTotal = mins * 60;
    timerSeconds = timerTotal;
    updateTimerDisplay();
};

window.startTimer = function () {
    if (isRunning || timerSeconds <= 0) return;
    isRunning = true;
    document.getElementById('startBtn').textContent = '⏱ Running';
    timerInterval = setInterval(() => {
        timerSeconds--;
        userData.focusTimeData.total = (userData.focusTimeData.total || 0) + 1;
        userData.focusTimeData.daily[dStr] = (userData.focusTimeData.daily[dStr] || 0) + 1;

        if (timerSeconds % 60 === 0) { updateTimeDisplay(); syncToCloud(); }

        updateTimerDisplay();

        if (timerSeconds <= 0) {
            clearInterval(timerInterval);
            isRunning = false;
            userData.dailySessions[dStr] = (userData.dailySessions[dStr] || 0) + 1;
            syncToCloud();
            updateSessionDisplay();
            updateTimeDisplay();
            updateScoreCards();
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            playChime();
            alert('🎉 Focus session complete! Great work!');
            timerSeconds = timerTotal;
            updateTimerDisplay();
            document.getElementById('startBtn').textContent = '▶ Start';
        }
    }, 1000);
};

window.pauseTimer = function () {
    clearInterval(timerInterval);
    isRunning = false;
    document.getElementById('startBtn').textContent = '▶ Resume';
    syncToCloud();
};

window.resetTimer = function () {
    clearInterval(timerInterval);
    isRunning = false;
    timerSeconds = timerTotal;
    updateTimerDisplay();
    document.getElementById('startBtn').textContent = '▶ Start';
};

function updateTimerDisplay() {
    const m = Math.floor(timerSeconds / 60);
    const s = timerSeconds % 60;
    document.getElementById('timerDisplay').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function updateTimeDisplay() {
    const dailyMins = Math.floor((userData.focusTimeData.daily[dStr] || 0) / 60);
    const totalMins = Math.floor((userData.focusTimeData.total || 0) / 60);
    document.getElementById('focusToday').textContent = dailyMins + 'm';
    document.getElementById('focusTotal').textContent = totalMins + 'm';
}

function updateSessionDisplay() {
    document.getElementById('sessionCount').textContent = userData.dailySessions[dStr] || 0;
}

function playChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [440, 550, 660].forEach((f, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.frequency.value = f;
            g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.2);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.5);
            o.start(ctx.currentTime + i * 0.2);
            o.stop(ctx.currentTime + i * 0.2 + 0.5);
        });
    } catch (e) {}
}

// =============================================
// TASKS
// =============================================

window.addSubject = function () {
    const input = document.getElementById('subjectInput');
    if (!input.value.trim()) return;
    userData.chores.push({ name: input.value.trim(), type: 'subject', history: {} });
    input.value = '';
    renderTable();
    syncToCloud();
};

window.addHabit = function () {
    const input = document.getElementById('habitInput');
    if (!input.value.trim()) return;
    userData.chores.push({ name: input.value.trim(), type: 'habit', history: {} });
    input.value = '';
    renderTable();
    syncToCloud();
};

window.saveGoal = function () {
    userData.dailyGoal = parseInt(document.getElementById('goalInput').value) || 2;
    renderTable();
    syncToCloud();
};

window.deleteItem = function (idx) {
    if (confirm('Remove this item?')) {
        userData.chores.splice(idx, 1);
        renderTable();
        syncToCloud();
    }
};

window.toggleCell = function (idx, ds) {
    // Block editing future days
    const cellDate = new Date(ds);
    cellDate.setHours(0,0,0,0);
    if (cellDate.getTime() > today.getTime()) return;
    if (!userData.chores[idx].history) userData.chores[idx].history = {};
    userData.chores[idx].history[ds] = !userData.chores[idx].history[ds];
    renderTable();
    syncToCloud();
};

function renderTable() {
    const header = document.getElementById('tableHeader');
    const tbody = document.getElementById('tableBody');
    if (!header || !tbody) return;

    header.innerHTML = '<th style="text-align:left; min-width:130px;">Activity</th>';
    dates.forEach(d => {
        const th = document.createElement('th');
        th.textContent = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
        if (d.getTime() === today.getTime()) { th.style.color = '#6366f1'; th.style.fontWeight = '900'; }
        header.appendChild(th);
    });
    header.innerHTML += '<th></th>';

    tbody.innerHTML = '';
    const sorted = [...userData.chores].map((c, i) => ({ c, i })).sort((a, b) => a.c.type === 'subject' ? -1 : 1);
    sorted.forEach(({ c, i }) => {
        const tr = document.createElement('tr');
        tr.className = c.type === 'subject' ? 'subject-row' : 'habit-row';
        const icon = c.type === 'subject' ? '📖' : '✅';
        let html = `<td>${icon} ${c.name}</td>`;
        dates.forEach(d => {
            const ds = d.toDateString();
            const done = c.history && c.history[ds];
            const isFuture = d.getTime() > today.getTime();
            if (isFuture) {
                html += `<td class="cell cell-locked" title="Future days — keep going!">${done ? '<span class="tick">✓</span>' : '<span style="color:#1e2d45;font-size:0.8rem;">🗓️</span>'}</td>`;
            } else {
                html += `<td class="cell" onclick="toggleCell(${i},'${ds}')">${done ? '<span class="tick">✓</span>' : ''}</td>`;
            }
        });
        html += `<td><button class="del-btn" onclick="deleteItem(${i})">✕</button></td>`;
        tr.innerHTML = html;
        tbody.appendChild(tr);
    });
    
    // Daily completion badge row
    renderDailyBadges();

    document.getElementById('goalInput').value = userData.dailyGoal;
    updateScoreCards();
    updateStreak();
}

// =============================================
// LEADERBOARD
// =============================================

window.switchLB = function (mode) {
    lbMode = mode;
    document.querySelectorAll('.lb-tab').forEach((t, i) => {
        t.classList.toggle('active', (i === 0 && mode === 'hours') || (i === 1 && mode === 'score'));
    });
    loadLeaderboard();
};

async function loadLeaderboard() {
    const list = document.getElementById('globalLBList');
    list.innerHTML = '<p style="color:#475569; text-align:center; padding:20px;">Loading...</p>';

    const field = lbMode === 'hours' ? 'totalFocusMins' : 'overallScore';
    const snap = await db.collection('users').orderBy(field, 'desc').limit(10).get();

    list.innerHTML = '';
    let rank = 1;
    snap.forEach(doc => {
        const d = doc.data();
        if (!d.username) return;
        const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
        const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
        const badges = (d.badges || []).map(b => { const def = BADGES.find(x => x.id === b.id); return def ? def.icon : ''; }).join('');
        const val = lbMode === 'hours' ? (d.totalFocusMins || 0) + ' mins' : (d.totalPoints || 0) + ' pts';
        list.innerHTML += `
            <div class="lb-item ${rankClass}" onclick="viewProfile('${doc.id}')">
                <div class="lb-rank">${rankEmoji}</div>
                <div class="lb-avatar">${(d.username || '?')[0].toUpperCase()}</div>
                <div class="lb-info">
                    <div class="lb-name">${d.username || 'Anonymous'}</div>
                    <div class="lb-meta"><span class="lb-badges">${badges || '—'}</span></div>
                </div>
                <div class="lb-value">${val}</div>
            </div>`;
        rank++;
    });

    if (rank === 1) list.innerHTML = '<p style="color:#475569;text-align:center;padding:20px;">No data yet!</p>';
}

// =============================================
// FRIENDS
// =============================================

async function loadFriends() {
    loadFriendRequests();
    loadFriendsLeaderboard();
}

async function loadFriendRequests() {
    const container = document.getElementById('friendRequests');
    const myData = (await db.collection('users').doc(currentUser.uid).get()).data();
    const requests = myData.friendRequests || [];
    if (!requests.length) { container.innerHTML = '<p style="color:#475569;font-size:0.85rem;">No pending requests.</p>'; return; }
    container.innerHTML = '';
    for (const uid of requests) {
        const u = (await db.collection('users').doc(uid).get()).data();
        if (!u) continue;
        container.innerHTML += `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <span style="font-weight:600;color:#f1f5f9;">${u.username}</span>
                <div style="display:flex;gap:6px;">
                    <button class="btn-sm btn-start" onclick="acceptFriend('${uid}')">Accept</button>
                    <button class="btn-sm btn-reset" onclick="rejectFriend('${uid}')">Decline</button>
                </div>
            </div>`;
    }
}

window.addFriend = async function () {
    const val = document.getElementById('friendInput').value.trim();
    const errEl = document.getElementById('friendError');
    errEl.textContent = '';
    if (!val) return;
    const snap = await db.collection('users').where('username', '==', val).get();
    if (snap.empty) { errEl.textContent = 'User not found.'; return; }
    const friendDoc = snap.docs[0];
    if (friendDoc.id === currentUser.uid) { errEl.textContent = "That's you!"; return; }
    if ((userData.friends || []).includes(friendDoc.id)) { errEl.textContent = 'Already friends.'; return; }

    // Send friend request
    await db.collection('users').doc(friendDoc.id).update({
        friendRequests: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
    errEl.style.color = '#10b981';
    errEl.textContent = `Friend request sent to ${val}!`;
    document.getElementById('friendInput').value = '';
    setTimeout(() => { errEl.textContent = ''; errEl.style.color = '#f87171'; }, 3000);
};

window.acceptFriend = async function (uid) {
    await db.collection('users').doc(currentUser.uid).update({
        friends: firebase.firestore.FieldValue.arrayUnion(uid),
        friendRequests: firebase.firestore.FieldValue.arrayRemove(uid)
    });
    await db.collection('users').doc(uid).update({
        friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
    userData.friends = userData.friends || [];
    userData.friends.push(uid);
    loadFriends();
};

window.rejectFriend = async function (uid) {
    await db.collection('users').doc(currentUser.uid).update({
        friendRequests: firebase.firestore.FieldValue.arrayRemove(uid)
    });
    loadFriendRequests();
};

async function loadFriendsLeaderboard() {
    const list = document.getElementById('friendsLBList');
    list.innerHTML = '<p style="color:#475569;text-align:center;padding:20px;">Loading...</p>';

    const myDoc = await db.collection('users').doc(currentUser.uid).get();
    const myData = myDoc.data();
    const friendIds = [currentUser.uid, ...(myData.friends || [])];

    const allUsers = await Promise.all(friendIds.map(id => db.collection('users').doc(id).get()));
    const sorted = allUsers
        .filter(d => d.exists && d.data().username)
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));

    list.innerHTML = '';
    sorted.forEach((u, i) => {
        const rank = i + 1;
        const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
        const isMe = u.id === currentUser.uid;
        const badges = (u.badges || []).map(b => { const def = BADGES.find(x => x.id === b.id); return def ? def.icon : ''; }).join('');
        list.innerHTML += `
            <div class="lb-item ${isMe ? 'rank-1' : ''}" onclick="viewProfile('${u.id}')">
                <div class="lb-rank">${rankEmoji}</div>
                <div class="lb-avatar">${(u.username || '?')[0].toUpperCase()}</div>
                <div class="lb-info">
                    <div class="lb-name">${u.username}${isMe ? ' (you)' : ''}</div>
                    <div class="lb-meta">${badges || 'No badges yet'}</div>
                </div>
                <div class="lb-value">${u.overallScore || 0}%</div>
            </div>`;
    });

    if (!sorted.length) list.innerHTML = '<p style="color:#475569;text-align:center;padding:20px;">Add friends to see their scores!</p>';
}

// =============================================
// PROFILE
// =============================================

function renderProfile() {
    const container = document.getElementById('profileContent');
    const name = userData.username || 'Anonymous';
    const earned = (userData.badges || []);
    const totalMins = Math.floor((userData.focusTimeData.total || 0) / 60);
    const scores = computeScores();
    const badgeIcons = BADGES.map(b => {
        const isEarned = earned.find(e => e.id === b.id);
        return `<div class="badge-item ${isEarned ? 'earned' : 'locked'}" title="${b.desc}">
            <span class="badge-icon">${b.icon}</span>
            <div class="badge-name">${b.name}</div>
            ${isEarned ? `<div class="badge-earned-date">${isEarned.date}</div>` : '<div class="badge-earned-date" style="color:#475569">Locked</div>'}
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="profile-header">
            <div class="profile-avatar-big">${name[0].toUpperCase()}</div>
            <div>
                <div class="profile-username">${name}</div>
                <div class="profile-stats-row">
                    <div class="profile-stat">🔥 Streak: <b>${userData.streak || 0} days</b></div>
                    <div class="profile-stat">⏱ Focus: <b>${totalMins} mins</b></div>
                    <div class="profile-stat">📊 Score: <b>${scores.overall}%</b></div>
                    <div class="profile-stat">🎖️ Badges: <b>${earned.length}</b></div>
                </div>
            </div>
        </div>
        <div class="panel">
            <h3 class="panel-title">🎖️ Badges</h3>
            <div class="badge-row">${badgeIcons}</div>
        </div>`;
}

// View another user's profile
window.viewProfile = async function (uid) {
    if (uid === currentUser.uid) { showTab('profile'); return; }
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return;
    const d = doc.data();
    const name = d.username || 'Anonymous';
    const earned = d.badges || [];
    const totalMins = Math.floor((d.totalFocusMins || 0));
    const isFriend = (userData.friends || []).includes(uid);
    const badgeIcons = BADGES.map(b => {
        const isEarned = earned.find(e => e.id === b.id);
        return `<div class="badge-item ${isEarned ? 'earned' : 'locked'}">
            <span class="badge-icon">${b.icon}</span>
            <div class="badge-name">${b.name}</div>
            ${isEarned ? `<div class="badge-earned-date">${isEarned.date}</div>` : '<div class="badge-earned-date" style="color:#475569">Locked</div>'}
        </div>`;
    }).join('');

    document.getElementById('profileModalContent').innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
            <div class="profile-avatar-big">${name[0].toUpperCase()}</div>
            <div>
                <div class="profile-username">${name}</div>
                <div class="profile-stats-row">
                    <div class="profile-stat">🔥 Streak: <b>${d.streak || 0} days</b></div>
                    <div class="profile-stat">⏱ Focus: <b>${totalMins} mins</b></div>
                    <div class="profile-stat">📊 Score: <b>${d.overallScore || 0}%</b></div>
                    <div class="profile-stat">🎖️ Badges: <b>${earned.length}</b></div>
                </div>
                ${!isFriend ? `<button class="btn-sm btn-start" style="margin-top:10px;" onclick="sendFriendFromModal('${uid}','${name}')">+ Add Friend</button>` : '<span style="color:#10b981;font-size:0.85rem;margin-top:8px;display:block;">✓ Friends</span>'}
            </div>
        </div>
        <h4 style="color:#94a3b8;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">Badges</h4>
        <div class="badge-row">${badgeIcons}</div>`;

    document.getElementById('profileModal').classList.remove('hidden');
};

window.sendFriendFromModal = async function (uid, name) {
    await db.collection('users').doc(uid).update({
        friendRequests: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
    alert(`Friend request sent to ${name}!`);
};

window.closeProfileModal = function () {
    document.getElementById('profileModal').classList.add('hidden');
};

// =============================================
// DAILY COMPLETION BADGES
// =============================================
function renderDailyBadges() {
    let container = document.getElementById('dailyBadgeRow');
    if (!container) return;
    container.innerHTML = '';
    dates.forEach(d => {
        const ds = d.toDateString();
        const score = getSubjectScore(ds);
        const habitsAll = allHabitsDoneOn(ds);
        const isToday = d.getTime() === today.getTime();
        const isPast = d.getTime() < today.getTime();
        const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
        
        const isFuture = d.getTime() > today.getTime();
        let icon = isFuture ? '🗓️' : '⬜';
        let title = isFuture ? 'Upcoming' : 'Not started yet';
        let cls = 'daily-badge-empty';

        if (!isFuture) {
            if (score === 100 && habitsAll) { icon = '🏅'; title = 'Perfect day!'; cls = 'daily-badge-perfect'; }
            else if (score === 100) { icon = '✅'; title = '100% subjects!'; cls = 'daily-badge-done'; }
            else if (score >= 50) { icon = '🔥'; title = score + '% done'; cls = 'daily-badge-partial'; }
            else if (isToday) { icon = '⬜'; title = 'In progress'; cls = 'daily-badge-empty'; }
        }

        container.innerHTML += `
            <div class="daily-badge-item ${cls} ${isToday ? 'daily-badge-today' : ''}" title="${title}">
                <span class="daily-badge-icon">${icon}</span>
                <span class="daily-badge-label">${dayLabel}</span>
                ${isToday ? '<span class="daily-badge-today-dot"></span>' : ''}
            </div>`;
    });
}

// =============================================
// DISTRACTION TRACKER
// No focus mode toggle — always watching tab switches
// Social media (except YouTube & Facebook) triggers check after 5 mins
// =============================================

const SOCIAL_MEDIA_SITES = [
    'instagram.com',
    'tiktok.com',
    'twitter.com',
    'x.com',
    'snapchat.com',
    'reddit.com',
    'twitch.tv',
    'pinterest.com',
    'tumblr.com',
    'discord.com',
];

// Sites always allowed
const ALLOWED_SITES = [
    'online.udvash-unmesh.com',
    'hulkenstein.com',
    'aparsclassroom.com',
    'acsfutureschool.com',
    'bondipathshala.com.bd',
    '10minuteschool.com',
    'mentors.com.bd',
    'meet.google.com',
    'zoom.us',
    'docs.google.com',
    'khanacademy.org',
    'classroom.google.com',
    'youtube.com',
    'facebook.com',
];

let tabHiddenTime = null;
let lastDistractionDomain = null;
let firstOffenseDomains = {}; // domain -> true if warned once

// Always track tab switches
document.addEventListener('visibilitychange', onVisibilityChange);
window.addEventListener('blur', () => { if (!tabHiddenTime) tabHiddenTime = Date.now(); });
window.addEventListener('focus', onWindowFocus);

function onVisibilityChange() {
    if (document.hidden) {
        tabHiddenTime = Date.now();
    } else {
        onWindowFocus();
    }
}

function onWindowFocus() {
    const away = tabHiddenTime ? Math.round((Date.now() - tabHiddenTime) / 1000) : 0;
    tabHiddenTime = null;
    // Only ask if away for more than 5 minutes (300 seconds)
    if (away >= 300) {
        setTimeout(() => showDistractionCheck(away), 600);
    }
}

function showDistractionCheck(secs) {
    const mins = Math.round(secs / 60);
    document.getElementById('distractionAwayTime').textContent = mins + ' min' + (mins !== 1 ? 's' : '');
    document.getElementById('urlCheckInput').value = '';
    document.getElementById('urlCheckResult').textContent = '';
    document.getElementById('urlCheckResult').className = 'url-result';
    document.getElementById('screenshotSection').style.display = 'none';
    document.getElementById('screenshotInput').value = '';
    document.getElementById('screenshotResult').textContent = '';
    document.getElementById('urlCheckPopup').style.display = 'flex';
}

window.checkUrl = function () {
    const raw = document.getElementById('urlCheckInput').value.trim();
    if (!raw) return;
    const resultEl = document.getElementById('urlCheckResult');

    let hostname = '';
    try {
        const u = new URL(raw.startsWith('http') ? raw : 'https://' + raw);
        hostname = u.hostname.replace('www.', '');
    } catch(e) {
        resultEl.textContent = '⚠️ Invalid URL.';
        resultEl.className = 'url-result warn';
        return;
    }

    // Check allowed
    for (const site of ALLOWED_SITES) {
        if (hostname.includes(site) || site.includes(hostname)) {
            resultEl.textContent = '✅ This is an allowed site — great job staying focused!';
            resultEl.className = 'url-result allowed';
            showPopupActions('allowed', hostname);
            return;
        }
    }

    // Check if social media
    const isSocial = SOCIAL_MEDIA_SITES.some(s => hostname.includes(s));
    if (isSocial) {
        const isRepeat = firstOffenseDomains[hostname] === true;
        if (isRepeat) {
            // Second visit — ask for screenshot
            lastDistractionDomain = hostname;
            resultEl.textContent = `⚠️ You visited ${hostname} again. Please upload a screenshot to verify.`;
            resultEl.className = 'url-result warn';
            document.getElementById('screenshotSection').style.display = 'block';
            showPopupActions('screenshot', hostname);
        } else {
            // First time seeing this domain — ask if distraction
            lastDistractionDomain = hostname;
            resultEl.textContent = `📱 ${hostname} is a social media site. Was this a distraction?`;
            resultEl.className = 'url-result unknown';
            showPopupActions('social-first', hostname);
        }
        return;
    }

    // Unknown site
    resultEl.textContent = `❓ Unknown site (${hostname}). Was this a distraction?`;
    resultEl.className = 'url-result unknown';
    showPopupActions('unknown', hostname);
};

function showPopupActions(type, domain) {
    const yesBtn = document.getElementById('urlPopupDistractBtn');
    const noBtn = document.getElementById('urlPopupAllowBtn');

    if (type === 'allowed') {
        yesBtn.style.display = 'none';
        noBtn.textContent = '✅ Got it!';
        noBtn.onclick = () => { closeUrlPopup(); };

    } else if (type === 'social-first') {
        yesBtn.style.display = 'inline-flex';
        yesBtn.textContent = '😔 Yes, it was';
        yesBtn.onclick = () => admitDistraction(domain, false);
        noBtn.textContent = '🙂 No, I had a reason';
        noBtn.onclick = () => denyDistraction(domain);

    } else if (type === 'screenshot') {
        yesBtn.style.display = 'none';
        noBtn.textContent = '📤 Submit Screenshot';
        noBtn.onclick = () => analyzeScreenshot(domain);

    } else if (type === 'unknown') {
        yesBtn.style.display = 'inline-flex';
        yesBtn.textContent = '❌ Yes, distraction';
        yesBtn.onclick = () => admitDistraction(domain, false);
        noBtn.textContent = '✅ No, educational';
        noBtn.onclick = () => denyDistraction(domain);
    }
}

function admitDistraction(domain, isRepeat) {
    firstOffenseDomains[domain] = true;
    const resultEl = document.getElementById('urlCheckResult');

    if (!isRepeat) {
        // First admission — warn, no penalty yet
        resultEl.innerHTML = `
            <b>🙏 Thank you for being honest!</b><br><br>
            ⚠️ <b>Warning:</b> Next time you visit ${domain} and admit it's a distraction, you'll lose <b>5 points</b>.<br><br>
            💡 <b>Advice:</b> Every minute on social media is a minute stolen from your future. You're stronger than the algorithm. Close the tab and come back to what matters. 💪`;
        resultEl.className = 'url-result warn';
        document.getElementById('urlPopupDistractBtn').style.display = 'none';
        document.getElementById('urlPopupAllowBtn').textContent = 'I understand 🙏';
        document.getElementById('urlPopupAllowBtn').onclick = () => closeUrlPopup();
    } else {
        // Second admission — subtract 5 points
        userData.distractionPenalty = (userData.distractionPenalty || 0) + 5;
        updateTotalPoints(-5);
        syncToCloud();
        updateScoreCards();
        resultEl.innerHTML = `
            <b>😔 -5 points deducted.</b><br><br>
            Your score has been reduced by 5 points for the distraction.<br><br>
            💡 <b>Remember:</b> Consistency beats perfection. One bad moment doesn't define you — but a pattern does. Get back on track right now. You've got this! 🔥`;
        resultEl.className = 'url-result blocked';
        document.getElementById('urlPopupDistractBtn').style.display = 'none';
        document.getElementById('urlPopupAllowBtn').textContent = 'Back to work 💪';
        document.getElementById('urlPopupAllowBtn').onclick = () => closeUrlPopup();
        playWarningSound();
    }
}

function denyDistraction(domain) {
    const resultEl = document.getElementById('urlCheckResult');
    resultEl.innerHTML = `✅ <b>Great — thanks for staying focused!</b><br>Keep up the good work! 🌟`;
    resultEl.className = 'url-result allowed';
    document.getElementById('urlPopupDistractBtn').style.display = 'none';
    document.getElementById('urlPopupAllowBtn').textContent = 'Thanks! 😊';
    document.getElementById('urlPopupAllowBtn').onclick = () => closeUrlPopup();
}

// ---- SCREENSHOT ANALYSIS via Claude API ----
window.analyzeScreenshot = async function (domain) {
    const input = document.getElementById('screenshotInput');
    const resultEl = document.getElementById('screenshotResult');
    if (!input.files || !input.files[0]) {
        resultEl.textContent = '⚠️ Please select a screenshot first.';
        return;
    }
    resultEl.textContent = '🔍 Analyzing screenshot...';
    resultEl.className = 'url-result warn';
    document.getElementById('urlPopupAllowBtn').disabled = true;

    const file = input.files[0];
    const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = () => rej();
        r.readAsDataURL(file);
    });

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': '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',
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 200,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: { type: 'base64', media_type: file.type, data: base64 }
                        },
                        {
                            type: 'text',
                            text: `You are a distraction detector for a student study app. Look at this screenshot and determine if it shows a social media feed, short video content, entertainment content, or any distraction (like Instagram, TikTok, Twitter, Snapchat feeds). 
                            
                            ONLY look for text, UI elements, app interfaces, and page content. Ignore any human beings, animals, food, or physical objects in photos/videos shown.
                            
                            Reply with ONLY one of these two responses:
                            DISTRACTION: [one sentence reason]
                            NOT_DISTRACTION: [one sentence reason]`
                        }
                    ]
                }]
            })
        });

        const data = await response.json();
        const text = data.content?.[0]?.text || '';

        if (text.startsWith('DISTRACTION')) {
            const reason = text.replace('DISTRACTION:', '').trim();
            userData.distractionPenalty = (userData.distractionPenalty || 0) + 7;
            updateTotalPoints(-7);
            syncToCloud();
            updateScoreCards();
            resultEl.innerHTML = `❌ <b>Distraction confirmed + Dishonesty detected.</b><br>${reason}<br><br><b>-5 pts</b> for distraction + <b>-2 pts</b> for dishonesty = <b>-7 pts total.</b><br><br>💡 Be honest next time — honesty costs 0 points. Dishonesty costs 7.`;
            resultEl.className = 'url-result blocked';
            playWarningSound();
        } else {
            const reason = text.replace('NOT_DISTRACTION:', '').trim();
            resultEl.innerHTML = `✅ <b>Screenshot verified — not a distraction.</b><br>${reason}<br><br>Thanks for your transparency! No points deducted. 🌟`;
            resultEl.className = 'url-result allowed';
        }

        document.getElementById('urlPopupDistractBtn').style.display = 'none';
        document.getElementById('urlPopupAllowBtn').textContent = 'Okay';
        document.getElementById('urlPopupAllowBtn').disabled = false;
        document.getElementById('urlPopupAllowBtn').onclick = () => closeUrlPopup();

    } catch(e) {
        resultEl.textContent = '⚠️ Could not analyze screenshot. Please try again.';
        resultEl.className = 'url-result warn';
        document.getElementById('urlPopupAllowBtn').disabled = false;
    }
};

function updateTotalPoints(delta) {
    userData.totalPoints = (userData.totalPoints || 0) + delta;
}

window.closeUrlPopup = function () {
    document.getElementById('urlCheckPopup').style.display = 'none';
};

function playWarningSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 220;
        o.type = 'sawtooth';
        g.gain.setValueAtTime(0.3, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        o.start(); o.stop(ctx.currentTime + 0.5);
    } catch(e) {}
}


// =============================================
// ALL-TIME CALENDAR
// =============================================
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

window.changeCalMonth = function(dir) {
    calMonth += dir;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    if (calMonth < 0)  { calMonth = 11; calYear--; }
    renderAllTimeCal();
};

function renderAllTimeCal() {
    const container = document.getElementById('allTimeCalendar');
    if (!container) return;

    const monthNames = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
    document.getElementById('calMonthLabel').textContent = monthNames[calMonth] + ' ' + calYear;

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const target = getDailyTargetPts();

    let html = '<div class="cal-grid">';
    // Day headers
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
        html += `<div class="cal-day-header">${d}</div>`;
    });

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="cal-cell cal-empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(calYear, calMonth, d);
        date.setHours(0,0,0,0);
        const ds = date.toDateString();
        const pts = getSubjectScore(ds);
        const isToday = ds === today.toDateString();
        const isFuture = date > today;
        const penalty = userData.distractionPenalty || 0;
        const net = pts - (isToday ? penalty : 0);

        let cls = 'cal-cell';
        let icon = '';
        let title = '';

        if (isFuture) {
            cls += ' cal-future';
        } else if (pts === 0) {
            cls += ' cal-miss';
            icon = '·';
            title = 'No activity';
        } else if (target > 0 && pts >= target * 1.2) {
            cls += ' cal-legendary';
            icon = '🌟';
            title = pts + ' pts — Legendary!';
        } else if (target > 0 && pts >= target) {
            cls += ' cal-goal';
            icon = '✅';
            title = pts + ' pts — Goal met!';
        } else if (pts > 0) {
            cls += ' cal-partial';
            icon = '🔥';
            title = pts + ' pts — Partial';
        }

        if (isToday) cls += ' cal-today';

        html += `<div class="${cls}" title="${title}">
            <span class="cal-date">${d}</span>
            <span class="cal-icon">${icon}</span>
            ${pts > 0 ? `<span class="cal-pts">${pts}</span>` : ''}
        </div>`;
    }

    html += '</div>';

    // Legend
    html += `<div class="cal-legend">
        <span class="cal-leg cal-goal">✅ Goal</span>
        <span class="cal-leg cal-legendary">🌟 Legendary</span>
        <span class="cal-leg cal-partial">🔥 Partial</span>
        <span class="cal-leg cal-miss">· Missed</span>
    </div>`;

    container.innerHTML = html;
}

// =============================================
// ONBOARDING TOUR
// =============================================
const TOUR_STEPS = [
    {
        target: null,
        text: "👋 Welcome to <b>Discipline Tracker</b>! I'm Spark, your personal study guide. Let me show you around in just 60 seconds. Ready? Let's go! 🚀"
    },
    {
        target: '#dailyScoreCard',
        text: "📊 These are your <b>Score Cards</b>. Your <b>daily target</b> is set automatically based on your subject goal and number of habits. Hit the target to celebrate — exceed it for legendary status! 🌟"
    },
    {
        target: '#badgeRow',
        text: "🏅 These are your <b>Achievement Badges</b>. Earn them by keeping your streak alive for 7, 14, 30, 180, and 365 days. Keep going!"
    },
    {
        target: '#dailyBadgeRow',
        text: "📅 The <b>Daily Badge Row</b> shows your week at a glance. Today is highlighted in purple. Complete all subjects to earn a daily badge!"
    },
    {
        target: '#goalInput',
        text: "🎯 This is your <b>Daily Subject Goal</b>. Set how many subjects you want to complete per day. Your daily target score is calculated as: <b>(goal × 10) + (habits × 5)</b>. Higher goal = higher target!"
    },
    {
        target: '#taskTable',
        text: "📋 This is your <b>Tracker Table</b>. Add your subjects and habits, then tick them off each day. Only today is editable — future days are locked until they arrive! 🗓️"
    },
    {
        target: '#allTimeCalendar',
        text: "📆 The <b>All-Time Record</b> calendar shows your entire history at a glance. ✅ Goal met · 🌟 Legendary · 🔥 Partial · · Missed. Navigate months with the arrows!"
    },
    {
        target: '#timerDisplay',
        text: "⏱️ Use the <b>Focus Timer</b> to time your study sessions. Set any duration you want. Every minute you study is recorded in your total focus time!"
    },
    {
        target: '#examDays',
        text: "📅 Set your <b>Next Exam</b> date here to see a live countdown. Nothing like a deadline to keep you focused! 😤"
    },
    {
        target: 'a[onclick*="leaderboard"]',
        switchTab: 'leaderboard',
        text: "🏆 The <b>Leaderboard</b> shows how you rank against other students by points or study hours. Friendly competition = extra motivation!"
    },
    {
        target: 'a[onclick*="friends"]',
        switchTab: 'friends',
        text: "👫 The <b>Friends</b> tab lets you search for classmates by username, send friend requests, and track their progress together!"
    },
    {
        target: 'a[onclick*="profile"]',
        switchTab: 'profile',
        text: "👤 Your <b>Profile</b> shows all your earned badges, streak, total focus time, and overall score. Keep the streak alive — it only takes one day to break it!"
    },
    {
        target: null,
        text: "🎉 That's everything! You're all set to start your discipline journey. Remember: <b>small consistent actions beat big occasional efforts</b>. Now go crush it! 🔥"
    }
];

let tourStep = 0;
let tourActive = false;

function startTour() {
    tourStep = 0;
    tourActive = true;
    const overlay = document.getElementById('tourOverlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('active');
    renderTourStep();
}

function renderTourStep() {
    const step = TOUR_STEPS[tourStep];
    document.getElementById('tourText').innerHTML = step.text;

    // Dots
    const dots = document.getElementById('tourDots');
    dots.innerHTML = TOUR_STEPS.map((_, i) =>
        `<div class="tour-dot ${i === tourStep ? 'active' : ''}"></div>`
    ).join('');

    // Next/Prev button labels
    document.getElementById('tourNextBtn').textContent =
        tourStep === TOUR_STEPS.length - 1 ? "Let's go! 🚀" : 'Next →';
    const prevBtn = document.getElementById('tourPrevBtn');
    if (prevBtn) prevBtn.style.display = tourStep === 0 ? 'none' : 'inline-flex';

    const card = document.getElementById('tourCard');

    function centerCard() {
        card.style.left = '50%';
        card.style.top = 'auto';
        card.style.bottom = '32px';
        card.style.transform = 'translateX(-50%)';
    }

    function positionCard(rect) {
        const cardW = 460;
        const cardH = 240;
        const margin = 16;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let left, top;

        // Try RIGHT of element
        if (rect.right + margin + cardW < vw) {
            left = rect.right + margin;
            top = rect.top + rect.height / 2 - cardH / 2;
        }
        // Try LEFT of element
        else if (rect.left - margin - cardW > 0) {
            left = rect.left - margin - cardW;
            top = rect.top + rect.height / 2 - cardH / 2;
        }
        // Try ABOVE element
        else if (rect.top - margin - cardH > 0) {
            left = vw / 2 - cardW / 2;
            top = rect.top - margin - cardH;
        }
        // Default BELOW element
        else {
            left = vw / 2 - cardW / 2;
            top = rect.bottom + margin;
        }

        // Clamp within viewport
        left = Math.max(margin, Math.min(left, vw - cardW - margin));
        top = Math.max(margin, Math.min(top, vh - cardH - margin));

        card.style.left = left + 'px';
        card.style.top = top + 'px';
        card.style.bottom = 'auto';
        card.style.transform = 'none';
    }

    // Update SVG overlay to create cutout effect
    function updateOverlay(rect) {
        const pad = 12;
        const x = rect.left - pad;
        const y = rect.top - pad;
        const w = rect.width + pad * 2;
        const h = rect.height + pad * 2;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const r = 14; // border radius

        const svgEl = document.getElementById('tourSvgOverlay');
        if (svgEl) {
            svgEl.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
            svgEl.setAttribute('width', vw);
            svgEl.setAttribute('height', vh);
            const pathEl = svgEl.querySelector('path');
            // Outer rect + rounded inner cutout using even-odd rule
            pathEl.setAttribute('d',
                `M0,0 H${vw} V${vh} H0 Z ` +
                `M${x+r},${y} H${x+w-r} Q${x+w},${y} ${x+w},${y+r} V${y+h-r} Q${x+w},${y+h} ${x+w-r},${y+h} H${x+r} Q${x},${y+h} ${x},${y+h-r} V${y+r} Q${x},${y} ${x+r},${y} Z`
            );
            // Highlight border
            const rectEl = svgEl.querySelector('rect.highlight');
            if (rectEl) {
                rectEl.setAttribute('x', x);
                rectEl.setAttribute('y', y);
                rectEl.setAttribute('width', w);
                rectEl.setAttribute('height', h);
                rectEl.setAttribute('rx', r);
            }
        }
    }

    if (step.target) {
        // Switch tab first if needed
        if (step.switchTab) {
            showTab(step.switchTab);
        } else {
            showTab('dashboard');
        }
        setTimeout(() => {
            const el = document.querySelector(step.target);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                    const rect = el.getBoundingClientRect();
                    updateOverlay(rect);
                    positionCard(rect);
                }, 400);
            } else {
                updateOverlay({ left: 0, top: 0, width: 0, height: 0 });
                centerCard();
            }
        }, 150);
    } else {
        showTab('dashboard');
        updateOverlay({ left: 0, top: 0, width: 0, height: 0 });
        centerCard();
    }
}

window.nextTourStep = function () {
    if (tourStep < TOUR_STEPS.length - 1) {
        tourStep++;
        renderTourStep();
    } else {
        endTour();
    }
};

window.prevTourStep = function () {
    if (tourStep > 0) {
        tourStep--;
        renderTourStep();
    }
};

window.skipTour = function () { endTour(); };

function endTour() {
    tourActive = false;
    document.getElementById('tourOverlay').classList.add('hidden');
    document.getElementById('tourOverlay').classList.remove('active');
    // Mark tour as seen in localStorage
    try { localStorage.setItem('dt_tour_seen', '1'); } catch(e) {}
}

window.restartTour = function () {
    startTour();
};

// Auto-start for new users
function maybeStartTour() {
    try {
        if (!localStorage.getItem('dt_tour_seen')) {
            setTimeout(startTour, 1200);
        }
    } catch(e) {}
}