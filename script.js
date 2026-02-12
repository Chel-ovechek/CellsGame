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

// Состояние
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
let myEnergy = 0;
let targetingMode = false;
let modalResolve = null;

const gridElement = document.getElementById('grid');
const confirmBtn = document.getElementById('confirmMoveButton');

// ПРАВИЛА
window.showRules = () => {
    const mode = document.getElementById('mode-select').value;
    const rules = {
        classic: "• Ставьте фигуры где угодно.\n• Цель: занять больше всех клеток.",
        connected: "• ВЫ МОЖЕТЕ СТАВИТЬ:\n  1. Вплотную к своей стенке (Красные - слева, Синие - справа).\n  2. Вплотную к своим уже поставленным фигурам.\n• Новая фигура НЕ может висеть в воздухе.",
        energy: "• За каждые 10 клеток территории вы получаете 1⚡.\n\nСПОСОБНОСТИ:\n• 1⚡ Переброс: Новые кубики.\n• 3⚡ Сжечь: Удалить фигуру врага на поле.\n• 5⚡ Архитектор: Удлиняет одну из сторон текущей фигуры до 6 клеток."
    };
    showModal("Правила режима", rules[mode], "Понятно", "");
};

// ГЕЙМПЛЕЙ
window.rollDice = async () => {
    if (currentGameState === 'finished') return;
    if (currentTurn !== myRole) return showToast("Сейчас ход противника!");
    
    const snap = await get(ref(db, `rooms/${currentRoom}/pendingDice`));
    if ((snap.exists() && snap.val().player === myRole) || activeRectElement) {
        return showToast("Вы уже бросили кубики!");
    }

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    
    if (!canFitAnywhere(d1, d2)) {
        update(ref(db, `rooms/${currentRoom}`), { gameState: "finished", lastDice: `${d1}x${d2}` });
    } else {
        update(ref(db, `rooms/${currentRoom}`), { lastDice: `${d1}x${d2}`, pendingDice: { w: d1, h: d2, player: myRole } });
    }
};

window.confirmMove = async () => {
    if (!activeRectElement || activeRectElement.parentElement !== gridElement) return showToast("Перетащите на поле!");
    const cs = gridElement.clientWidth / 20;
    const x = Math.round(parseInt(activeRectElement.style.left) / cs);
    const y = Math.round(parseInt(activeRectElement.style.top) / cs);
    
    if (!canPlace(x, y, currentDice.w, currentDice.h, myRole)) return showToast("Тут нельзя ставить!");

    const area = currentDice.w * currentDice.h;
    const updates = {};
    updates[`figures/fig_${Date.now()}`] = { x, y, width: currentDice.w, height: currentDice.h, color: myRole };
    updates[`turn`] = myRole === 'red' ? 'blue' : 'red';
    updates[`pendingDice`] = null;

    if (currentMode === 'energy') {
        const added = Math.floor(area / 10);
        updates[`energy/${myRole}`] = Math.min(10, myEnergy + added);
    }

    await update(ref(db, `rooms/${currentRoom}`), updates);
    activeRectElement.remove(); activeRectElement = null; confirmBtn.style.display = 'none';
};

window.rotatePiece = () => {
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

// УСИЛЕНИЯ
window.useAbility = async (type) => {
    if (currentTurn !== myRole || currentGameState === 'finished') return;
    const roomRef = ref(db, `rooms/${currentRoom}`);

    if (type === 'reroll' && myEnergy >= 1 && activeRectElement) {
        await update(roomRef, { [`energy/${myRole}`]: myEnergy - 1, pendingDice: null });
        activeRectElement.remove(); activeRectElement = null; confirmBtn.style.display = 'none';
        showToast("Кубики переброшены!");
    } 
    else if (type === 'destroy' && myEnergy >= 3) {
        targetingMode = !targetingMode;
        showToast(targetingMode ? "Выберите фигуру врага" : "Отмена");
        refreshUI();
    } 
    else if (type === 'max' && myEnergy >= 5 && activeRectElement) {
        if (currentDice.w >= currentDice.h) currentDice.w = 6; else currentDice.h = 6;
        await update(roomRef, { 
            [`energy/${myRole}`]: myEnergy - 5, 
            pendingDice: { w: currentDice.w, h: currentDice.h, player: myRole } 
        });
        showToast("Архитектор: одна сторона теперь 6!");
    }
};

async function executeDestroy(id) {
    if (!targetingMode) return;
    targetingMode = false;
    await remove(ref(db, `rooms/${currentRoom}/figures/${id}`));
    await update(ref(db, `rooms/${currentRoom}/energy`), { [myRole]: myEnergy - 3 });
    showToast("Фигура уничтожена!");
}

// СИСТЕМНЫЕ
function showToast(text) {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast'; t.innerText = text;
    container.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}

function showModal(title, message, okT, canT) {
    return new Promise((res) => {
        modalResolve = res;
        const ov = document.getElementById('custom-modal-overlay');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-message').innerText = message;
        document.getElementById('modal-ok').innerText = okT;
        document.getElementById('modal-cancel').innerText = canT;
        document.getElementById('modal-cancel').style.display = canT ? 'block' : 'none';
        ov.style.display = 'flex';
        document.getElementById('modal-ok').onclick = () => { ov.style.display='none'; res(true); };
        document.getElementById('modal-cancel').onclick = () => { ov.style.display='none'; res(false); };
    });
}
window.closeModal = () => { document.getElementById('custom-modal-overlay').style.display = 'none'; if(modalResolve) modalResolve(null); };

function generateMapMask(type) {
    let mask = Array(20).fill().map(() => Array(20).fill(1));
    if (type === 'octagon') {
        for (let y=0; y<20; y++) for (let x=0; x<20; x++) if (x+y < 5 || (19-x)+y < 5 || x+(19-y) < 5 || (19-x)+(19-y) < 5) mask[y][x] = 0;
    } else if (type === 'donut') {
        for (let y=6; y<=13; y++) for (let x=6; x<=13; x++) mask[y][x] = 0;
    } else if (type === 'cross') {
        for (let y=0; y<20; y++) for (let x=0; x<20; x++) if ((x<6&&y<6) || (x>13&&y<6) || (x<6&&y>13) || (x>13&&y>13)) mask[y][x] = 0;
    } else if (type === 'fortress') {
        for (let y=0; y<20; y++) for (let x=0; x<20; x++) if ((x>=8&&x<=11&&y<6)||(x>=8&&x<=11&&y>13)||(y>=8&&y<=11&&x<6)||(y>=8&&y<=11&&x>13)) mask[y][x] = 0;
    }
    return mask;
}

// ЛОББИ
document.getElementById('btn-create-room').onclick = () => {
    const name = document.getElementById('room-input').value.trim();
    if (!name) return showToast("Введите название!");
    currentRoom = name;
    document.getElementById('lobby-main-step').style.display = 'none';
    document.getElementById('creator-settings').style.display = 'block';
};

document.getElementById('pick-red').onclick = () => joinRoom('red', true);
document.getElementById('pick-blue').onclick = () => joinRoom('blue', true);
document.getElementById('btn-join-room').onclick = () => joinRoom(null, false);

async function joinRoom(role, isCreator) {
    const name = document.getElementById('room-input').value.trim();
    if (!name) return showToast("Введите название!");
    currentRoom = name;
    const snap = await get(ref(db, `rooms/${currentRoom}`));
    const data = snap.val();

    if (isCreator) {
        myRole = role;
        currentMapType = document.getElementById('map-select').value;
        currentMode = document.getElementById('mode-select').value;
        await set(ref(db, `rooms/${currentRoom}`), {
            gameState: 'playing', mapType: currentMapType, gameMode: currentMode, turn: 'red', players: { [role]: true }, energy: {red: 0, blue: 0}
        });
    } else {
        if (!snap.exists()) return showToast("Нет комнаты!");
        if (localStorage.getItem('cellsGame_room') === currentRoom) myRole = localStorage.getItem('cellsGame_role');
        else {
            if (!data.players?.red) myRole = 'red'; else if (!data.players?.blue) myRole = 'blue'; else return showToast("Полная!");
        }
        await update(ref(db, `rooms/${currentRoom}/players`), { [myRole]: true });
    }
    localStorage.setItem('cellsGame_room', currentRoom);
    localStorage.setItem('cellsGame_role', myRole);
    startGame();
}

function startGame() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-interface').style.display = 'flex';
    document.getElementById('display-room-name').innerText = currentRoom;
    document.getElementById('my-role-display').innerText = `Вы: ${myRole === 'red' ? 'КРАСНЫЙ' : 'СИНИЙ'}`;
    initRoomListener();
}

let lastData = null;
function initRoomListener() {
    onValue(ref(db, `rooms/${currentRoom}`), (snapshot) => {
        const data = snapshot.val();
        if (!data) { localStorage.clear(); location.reload(); return; }
        lastData = data;
        refreshUI();
    });
}

function refreshUI() {
    const data = lastData;
    currentTurn = data.turn || 'red';
    currentGameState = data.gameState || 'playing';
    currentMapType = data.mapType || 'square';
    currentMode = data.gameMode || 'classic';
    const figures = data.figures || {};
    const energy = data.energy || {red: 0, blue: 0};
    myEnergy = energy[myRole] || 0;

    mapMask = generateMapMask(currentMapType);
    occupiedGrid = Array(20).fill().map(() => Array(20).fill(null));
    gridElement.innerHTML = '';
    
    for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell' + (mapMask[y][x] === 0 ? ' void' : '');
            if (currentMode === 'connected') {
                if (x === 0 && mapMask[y][x] === 1) cell.classList.add('start-red');
                if (x === 19 && mapMask[y][x] === 1) cell.classList.add('start-blue');
            }
            gridElement.appendChild(cell);
        }
    }

    let rScore = 0, bScore = 0;
    const cs = gridElement.clientWidth / 20;
    for (let id in figures) {
        const f = figures[id];
        const rect = document.createElement('div');
        rect.className = 'rectangle fixed' + (targetingMode && f.color !== myRole ? ' targetable' : '');
        rect.style.width = f.width * cs + 'px';
        rect.style.height = f.height * cs + 'px';
        rect.style.left = f.x * cs + 'px';
        rect.style.top = f.y * cs + 'px';
        rect.style.backgroundColor = f.color === 'red' ? '#e84393' : '#0984e3';
        if(targetingMode && f.color !== myRole) rect.onclick = () => executeDestroy(id);
        gridElement.appendChild(rect);
        for (let i = f.y; i < f.y + f.height; i++) for (let j = f.x; j < f.x + f.width; j++) occupiedGrid[i][j] = f.color;
        f.color === 'red' ? rScore += f.width * f.height : bScore += f.width * f.height;
    }

    document.getElementById('red').innerText = `Красных: ${rScore}`;
    document.getElementById('blue').innerText = `Синих: ${bScore}`;

    if (currentMode === 'energy') {
        document.getElementById('ability-bar').style.display = 'flex';
        document.getElementById('red-energy').style.display = 'inline';
        document.getElementById('blue-energy').style.display = 'inline';
        document.getElementById('red-energy').innerText = `⚡${energy.red || 0}`;
        document.getElementById('blue-energy').innerText = `⚡${energy.blue || 0}`;
        document.getElementById('ab-reroll').disabled = (myEnergy < 1 || !activeRectElement || currentTurn !== myRole);
        document.getElementById('ab-destroy').disabled = (myEnergy < 3 || currentTurn !== myRole);
        document.getElementById('ab-max').disabled = (myEnergy < 5 || !activeRectElement || currentTurn !== myRole);
    } else {
        document.getElementById('ability-bar').style.display = 'none';
        document.getElementById('red-energy').style.display = 'none';
        document.getElementById('blue-energy').style.display = 'none';
    }

    if (data.pendingDice && data.pendingDice.player === myRole && !activeRectElement) {
        currentDice = { w: data.pendingDice.w, h: data.pendingDice.h };
        createDraggable(currentDice.w, currentDice.h);
    }

    if (currentGameState === 'finished' && !gameEndedAlertShown) {
        gameEndedAlertShown = true;
        const winner = rScore > bScore ? 'КРАСНЫЕ' : 'СИНИЕ';
        showModal("ИГРА ОКОНЧЕНА", `Выпало: ${data.lastDice}.\nМеста нет!\nПобедили ${winner}\nСчет ${rScore}:${bScore}`, "Играть снова", "В лобби")
        .then(res => handleManualResetAction(res));
    } else {
        document.getElementById('diceResult').innerText = data.lastDice || '?';
        document.getElementById('diceResult').style.color = currentTurn === 'red' ? 'var(--red)' : 'var(--blue)';
    }
}

function canPlace(x, y, w, h, role) {
    if (x < 0 || y < 0 || x + w > 20 || y + h > 20) return false;
    let touchesSelf = false, touchesStart = false;
    for (let i = y; i < y + h; i++) {
        for (let j = x; j < x + w; j++) {
            if (occupiedGrid[i][j] || mapMask[i][j] === 0) return false;
            if (currentMode === 'connected') {
                if (role === 'red' && j === 0) touchesStart = true;
                if (role === 'blue' && j + w === 20) touchesStart = true;
                [[i-1,j],[i+1,j],[i,j-1],[i,j+1]].forEach(([ny,nx]) => {
                    if (ny>=0 && ny<20 && nx>=0 && nx<20 && occupiedGrid[ny][nx]===role) touchesSelf = true;
                });
            }
        }
    }
    return currentMode === 'connected' ? (touchesStart || touchesSelf) : true;
}

function canFitAnywhere(w, h) {
    for (let y = 0; y <= 20-h; y++) for (let x = 0; x <= 20-w; x++) if (canPlace(x, y, w, h, myRole)) return true;
    for (let y = 0; y <= 20-w; y++) for (let x = 0; x <= 20-h; x++) if (canPlace(x, y, h, w, myRole)) return true;
    return false;
}

function createDraggable(w, h) {
    if (activeRectElement) activeRectElement.remove();
    const cs = gridElement.clientWidth / 20;
    activeRectElement = document.createElement('div');
    activeRectElement.className = 'rectangle';
    activeRectElement.style.width = w * cs + 'px';
    activeRectElement.style.height = h * cs + 'px';
    activeRectElement.style.backgroundColor = myRole === 'red' ? '#e84393' : '#0984e3';
    document.getElementById('preview-zone').innerHTML = '';
    document.getElementById('preview-zone').appendChild(activeRectElement);
    confirmBtn.style.display = 'block';

    let isDragging = false, isOnGrid = false;
    activeRectElement.onpointerdown = (e) => { isDragging = true; activeRectElement.setPointerCapture(e.pointerId); };
    activeRectElement.onpointermove = (e) => {
        if (!isDragging) return;
        if (!isOnGrid) { gridElement.appendChild(activeRectElement); isOnGrid = true; }
        const rect = gridElement.getBoundingClientRect();
        let x = Math.round((e.clientX - rect.left - (currentDice.w * cs) / 2) / cs) * cs;
        let y = Math.round((e.clientY - rect.top - (currentDice.h * cs) / 2) / cs) * cs;
        x = Math.max(0, Math.min(x, (20 - currentDice.w) * cs));
        y = Math.max(0, Math.min(y, (20 - currentDice.h) * cs));
        activeRectElement.style.left = x + 'px'; activeRectElement.style.top = y + 'px';
    };
    activeRectElement.onpointerup = () => isDragging = false;
}

window.handleManualReset = async () => {
    const res = await showModal("Меню", "Выберите действие:", "Очистить карту", "Выйти в лобби");
    handleManualResetAction(res);
};

async function handleManualResetAction(res) {
    if (res === null) return;
    if (res) {
        await update(ref(db, `rooms/${currentRoom}`), { figures: null, gameState: 'playing', turn: 'red', pendingDice: null, energy: {red: 0, blue: 0} });
        location.reload();
    } else {
        await remove(ref(db, `rooms/${currentRoom}`));
        localStorage.clear(); location.reload();
    }
}
