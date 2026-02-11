import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get, remove } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBoDZITlAQRzK6D7rxOAHUMMSzXk1htu94",
    authDomain: "cellsgame-f7561.firebaseapp.com",
    databaseURL: "https://cellsgame-f7561-default-rtdb.firebaseio.com",
    projectId: "cellsgame-f7561",
    storageBucket: "cellsgame-f7561.appspot.com",
    messagingSenderId: "192058456770",
    appId: "1:192058456770:web:37ee69d5e45823807dd95b"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let myRole = null; 
let currentRoom = "";
let currentMapType = "square";
let currentMode = "classic";
let currentTurn = 'red';
let currentGameState = 'playing';
let occupiedGrid = Array(20).fill().map(() => Array(20).fill(null));
let mapMask = Array(20).fill().map(() => Array(20).fill(1));
let currentDice = { w: 0, h: 0 };
let activeRectElement = null;
let gameEndedAlertShown = false;

const lobbyScreen = document.getElementById('lobby-screen');
const gameInterface = document.getElementById('game-interface');
const gridElement = document.getElementById('grid');
const diceResult = document.getElementById('diceResult');
const previewZone = document.getElementById('preview-zone');
const confirmBtn = document.getElementById('confirmMoveButton');
const roleDisplay = document.getElementById('my-role-display');

const RULES = {
    general: "1. Бросайте кубики.\n2. Тяните фигуру на поле.\n3. Конец игры, если нельзя сходить.",
    classic: "РЕЖИМ КЛАССИКА:\nСтавьте где угодно!",
    connected: "РЕЖИМ СВЯЗНОСТЬ:\nФигура должна касаться ваших прошлых фигур. Красные от левого края, Синие - от правого."
};

function showToast(text) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast'; toast.innerText = text;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 2500);
}

// ПРОВЕРКА СЕССИИ
async function checkExistingSession() {
    const savedRoom = localStorage.getItem('cellsGame_room');
    const savedRole = localStorage.getItem('cellsGame_role');
    if (savedRoom && savedRole) {
        const snap = await get(ref(db, `rooms/${savedRoom}`));
        if (snap.exists()) {
            currentRoom = savedRoom; myRole = savedRole; startGame();
        } else { localStorage.clear(); }
    }
}
checkExistingSession();

// ЛОББИ
document.getElementById('btn-create-room').onclick = () => {
    const name = document.getElementById('room-input').value.trim();
    if (!name) return showToast("Введите название комнаты!");
    currentRoom = name;
    document.getElementById('lobby-main-step').style.display = 'none';
    document.getElementById('creator-settings').style.display = 'block';
};

document.getElementById('info-mode').onclick = () => {
    const mode = document.getElementById('mode-select').value;
    showModal("Правила", `${RULES.general}\n\n${RULES[mode]}`, "Понятно", "");
};

document.getElementById('pick-red').onclick = () => createRoom('red');
document.getElementById('pick-blue').onclick = () => createRoom('blue');

async function createRoom(role) {
    myRole = role;
    currentMapType = document.getElementById('map-select').value;
    currentMode = document.getElementById('mode-select').value;
    localStorage.setItem('cellsGame_room', currentRoom);
    localStorage.setItem('cellsGame_role', myRole);
    await set(ref(db, `rooms/${currentRoom}`), {
        gameState: 'playing', mapType: currentMapType, gameMode: currentMode, turn: 'red', lastDice: '?', players: { [role]: true }
    });
    startGame();
}

document.getElementById('btn-join-room').onclick = async () => {
    const name = document.getElementById('room-input').value.trim();
    if (!name) return showToast("Введите название!");
    const snap = await get(ref(db, `rooms/${name}`));
    if (!snap.exists()) return showToast("Комната не найдена!");
    const data = snap.val();
    currentRoom = name;
    if (localStorage.getItem('cellsGame_room') === currentRoom) {
        myRole = localStorage.getItem('cellsGame_role');
    } else {
        if (!data.players?.red) myRole = 'red';
        else if (!data.players?.blue) myRole = 'blue';
        else return showToast("Комната полна!");
    }
    localStorage.setItem('cellsGame_room', currentRoom);
    localStorage.setItem('cellsGame_role', myRole);
    await update(ref(db, `rooms/${currentRoom}/players`), { [myRole]: true });
    startGame();
};

function startGame() {
    lobbyScreen.style.display = 'none';
    gameInterface.style.display = 'flex';
    document.getElementById('display-room-name').innerText = currentRoom;
    roleDisplay.innerText = `Вы играете за: ${myRole === 'red' ? 'КРАСНЫХ' : 'СИНИХ'}`;
    roleDisplay.style.color = myRole === 'red' ? '#e84393' : '#0984e3';
    initRoomListener();
}

function generateMapMask(type) {
    let mask = Array(20).fill().map(() => Array(20).fill(1));
    if (type === 'octagon') {
        const cut = 5;
        for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 20; x++) {
                if (x + y < cut || (19 - x) + y < cut || x + (19 - y) < cut || (19 - x) + (19 - y) < cut) mask[y][x] = 0;
            }
        }
    } else if (type === 'donut') {
        for (let y = 6; y <= 13; y++) { for (let x = 6; x <= 13; x++) mask[y][x] = 0; }
    } else if (type === 'cross') {
        for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 20; x++) {
                if ((x < 6 && y < 6) || (x > 13 && y < 6) || (x < 6 && y > 13) || (x > 13 && y > 13)) mask[y][x] = 0;
            }
        }
    } else if (type === 'fortress') {
        for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 20; x++) {
                if (x >= 8 && x <= 11 && y < 6) mask[y][x] = 0;
                if (x >= 8 && x <= 11 && y > 13) mask[y][x] = 0;
                if (y >= 8 && y <= 11 && x < 6) mask[y][x] = 0;
                if (y >= 8 && y <= 11 && x > 13) mask[y][x] = 0;
            }
        }
    }
    return mask;
}

function initRoomListener() {
    onValue(ref(db, `rooms/${currentRoom}`), (snapshot) => {
        if (!snapshot.exists()) { localStorage.clear(); location.reload(); return; }
        const data = snapshot.val();
        currentTurn = data.turn || 'red';
        currentGameState = data.gameState || 'playing';
        currentMapType = data.mapType || 'square';
        currentMode = data.gameMode || 'classic';
        const figures = data.figures || {};

        mapMask = generateMapMask(currentMapType);
        occupiedGrid = Array(20).fill().map(() => Array(20).fill(null));
        gridElement.innerHTML = '';
        
        for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 20; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                if (mapMask[y][x] === 0) cell.classList.add('void');
                if (currentMode === 'connected') {
                    if (x === 0 && mapMask[y][x] === 1) cell.classList.add('start-red');
                    if (x === 19 && mapMask[y][x] === 1) cell.classList.add('start-blue');
                }
                gridElement.appendChild(cell);
            }
        }

        let rScore = 0, bScore = 0;
        const cellSize = gridElement.clientWidth / 20;
        for (let id in figures) {
            const f = figures[id];
            const rect = document.createElement('div');
            rect.className = 'rectangle fixed';
            rect.style.width = `${f.width * cellSize}px`;
            rect.style.height = `${f.height * cellSize}px`;
            rect.style.left = `${f.x * cellSize}px`;
            rect.style.top = `${f.y * cellSize}px`;
            rect.style.backgroundColor = f.color === 'red' ? '#e84393' : '#0984e3';
            gridElement.appendChild(rect);
            for (let i = f.y; i < f.y + f.height; i++) {
                for (let j = f.x; j < f.x + f.width; j++) occupiedGrid[i][j] = f.color;
            }
            f.color === 'red' ? rScore += f.width * f.height : bScore += f.width * f.height;
        }

        document.getElementById('red').innerText = `Красных: ${rScore}`;
        document.getElementById('blue').innerText = `Синих: ${bScore}`;

        if (data.pendingDice && data.pendingDice.player === myRole) {
            if (!activeRectElement) {
                currentDice = { w: data.pendingDice.w, h: data.pendingDice.h };
                createDraggable(currentDice.w, currentDice.h);
            }
        }

        if (currentGameState === 'finished') {
            diceResult.innerText = "ФИНАЛ";
            if (!gameEndedAlertShown) {
                gameEndedAlertShown = true;
                const winText = rScore > bScore ? "Победили КРАСНЫЕ" : (bScore > rScore ? "Победили СИНИЕ" : "НИЧЬЯ");
                const msg = `Выпала фигура ${data.lastDice}.\nМеста больше нет!\n${winText}\nСчет: ${rScore} : ${bScore}`;
                
                // Исправленный вызов модалки для конца игры
                showModal("ИГРА ОКОНЧЕНА", msg, "Сыграть снова", "Выйти в лобби").then(res => {
                    if (res === true) resetGameLogic(true); 
                    else if (res === false) resetGameLogic(false);
                });
            }
        } else {
            gameEndedAlertShown = false;
            diceResult.innerText = (currentTurn === myRole) ? `Ваш ход! (${data.lastDice})` : `Ждем противника...`;
        }
    });
}

window.rollDice = async function() {
    if (currentGameState === 'finished') return;
    if (currentTurn !== myRole) return showToast("Сейчас ход противника!");
    
    const snap = await get(ref(db, `rooms/${currentRoom}/pendingDice`));
    if ((snap.exists() && snap.val().player === myRole) || activeRectElement) {
        return showToast("Вы уже бросили кубики!");
    }

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    currentDice = { w: d1, h: d2 };
    
    if (!canFitAnywhere(d1, d2)) {
        update(ref(db, `rooms/${currentRoom}`), { gameState: "finished", lastDice: `${d1}x${d2}` });
    } else {
        await update(ref(db, `rooms/${currentRoom}`), { 
            lastDice: `${d1}x${d2}`,
            pendingDice: { w: d1, h: d2, player: myRole }
        });
    }
};

function canPlace(x, y, w, h, role) {
    if (x < 0 || y < 0 || x + w > 20 || y + h > 20) return false;
    let touchesSelf = false, touchesStart = false;
    for (let i = y; i < y + h; i++) {
        for (let j = x; j < x + w; j++) {
            if (occupiedGrid[i][j] !== null || mapMask[i][j] === 0) return false;
            if (currentMode === 'connected') {
                if (role === 'red' && j === 0) touchesStart = true;
                if (role === 'blue' && j + 1 === 20) touchesStart = true;
                [[i-1,j],[i+1,j],[i,j-1],[i,j+1]].forEach(([ny,nx]) => {
                    if (ny>=0 && ny<20 && nx>=0 && nx<20 && occupiedGrid[ny][nx]===role) touchesSelf = true;
                });
            }
        }
    }
    return currentMode === 'connected' ? (occupiedGrid.flat().some(c => c === role) ? touchesSelf : touchesStart) : true;
}

function canFitAnywhere(w, h) {
    for (let y = 0; y <= 20-h; y++) {
        for (let x = 0; x <= 20-w; x++) if (canPlace(x, y, w, h, myRole)) return true;
    }
    for (let y = 0; y <= 20-w; y++) {
        for (let x = 0; x <= 20-h; x++) if (canPlace(x, y, h, w, myRole)) return true;
    }
    return false;
}

function createDraggable(w, h) {
    if (activeRectElement) activeRectElement.remove();
    const cs = gridElement.clientWidth / 20;
    activeRectElement = document.createElement('div');
    activeRectElement.className = 'rectangle';
    activeRectElement.style.width = `${w * cs}px`;
    activeRectElement.style.height = `${h * cs}px`;
    activeRectElement.style.backgroundColor = myRole === 'red' ? '#e84393' : '#0984e3';
    previewZone.innerHTML = ''; previewZone.appendChild(activeRectElement);
    confirmBtn.style.display = 'block';

    let isDragging = false, isOnGrid = false;
    activeRectElement.onpointerdown = (e) => { isDragging = true; activeRectElement.setPointerCapture(e.pointerId); };
    activeRectElement.onpointermove = (e) => {
        if (!isDragging) return;
        if (!isOnGrid) { gridElement.appendChild(activeRectElement); isOnGrid = true; }
        const rect = gridElement.getBoundingClientRect();
        const csNow = gridElement.clientWidth / 20;
        let x = Math.round((e.clientX - rect.left - (currentDice.w * csNow) / 2) / csNow) * csNow;
        let y = Math.round((e.clientY - rect.top - (currentDice.h * csNow) / 2) / csNow) * csNow;
        x = Math.max(0, Math.min(x, (20 - currentDice.w) * csNow));
        y = Math.max(0, Math.min(y, (20 - currentDice.h) * csNow));
        activeRectElement.style.left = x + 'px'; activeRectElement.style.top = y + 'px';
    };
    activeRectElement.onpointerup = () => isDragging = false;
}

confirmBtn.onclick = async () => {
    if (!activeRectElement || activeRectElement.parentElement !== gridElement) return showToast("Перетащите фигуру!");
    const cs = gridElement.clientWidth / 20;
    const x = Math.round(parseInt(activeRectElement.style.left) / cs);
    const y = Math.round(parseInt(activeRectElement.style.top) / cs);
    if (!canPlace(x, y, currentDice.w, currentDice.h, myRole)) return showToast("Тут нельзя ставить!");
    const updates = {};
    updates[`figures/fig_${Date.now()}`] = { x, y, width: currentDice.w, height: currentDice.h, color: myRole };
    updates[`turn`] = myRole === 'red' ? 'blue' : 'red';
    updates[`pendingDice`] = null;
    await update(ref(db, `rooms/${currentRoom}`), updates);
    activeRectElement.remove(); activeRectElement = null; confirmBtn.style.display = 'none';
};

document.getElementById("rotateButton").onclick = () => {
    if (!activeRectElement) return;
    const cs = gridElement.clientWidth / 20;
    [currentDice.w, currentDice.h] = [currentDice.h, currentDice.w];
    activeRectElement.style.width = currentDice.w * cs + 'px';
    activeRectElement.style.height = currentDice.h * cs + 'px';
    if (activeRectElement.parentElement === gridElement) {
        let lx = Math.min(parseInt(activeRectElement.style.left), (20 - currentDice.w) * cs);
        let ty = Math.min(parseInt(activeRectElement.style.top), (20 - currentDice.h) * cs);
        activeRectElement.style.left = lx + 'px'; activeRectElement.style.top = ty + 'px';
    }
};

function showModal(title, message, okT, canT) {
    return new Promise((res) => {
        const ov = document.getElementById('custom-modal-overlay');
        const modal = document.getElementById('custom-modal');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-message').innerText = message;
        document.getElementById('modal-ok').innerText = okT;
        document.getElementById('modal-cancel').innerText = canT;
        document.getElementById('modal-cancel').style.display = canT ? 'block' : 'none';
        ov.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
        document.getElementById('modal-ok').onclick = () => { modal.classList.remove('show'); setTimeout(()=>ov.style.display='none', 200); res(true); };
        document.getElementById('modal-cancel').onclick = () => { modal.classList.remove('show'); setTimeout(()=>ov.style.display='none', 200); res(false); };
        document.getElementById('modal-close').onclick = () => { modal.classList.remove('show'); setTimeout(()=>ov.style.display='none', 200); res(null); };
    });
}

window.handleManualReset = async function() {
    const res = await showModal("Меню", "Что вы хотите сделать?", "Очистить карту", "Выйти в лобби");
    if (res !== null) resetGameLogic(res);
};

async function resetGameLogic(replay) {
    if (replay === true) {
        await set(ref(db, `rooms/${currentRoom}`), {
            gameState: 'playing', mapType: currentMapType, gameMode: currentMode, turn: 'red', lastDice: '?', players: { red: true, blue: true }
        });
        location.reload();
    } else if (replay === false) {
        await remove(ref(db, `rooms/${currentRoom}`));
        localStorage.clear();
        location.reload();
    }
}
