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
let playerCount = 0;

const gridElement = document.getElementById('grid');
const confirmBtn = document.getElementById('confirmMoveButton');
const turnDisplay = document.getElementById('turn-display');
const lobbyScreen = document.getElementById('lobby-screen');
const gameInterface = document.getElementById('game-interface');

// СИСТЕМНЫЕ
function showToast(text) {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast'; t.innerText = text;
    container.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 400);
    }, 2500);
}

function showModal(title, message, buttons = [], isArchitect = false) {
    return new Promise((res) => {
        modalResolve = res;
        const ov = document.getElementById('custom-modal-overlay');
        const modal = document.getElementById('custom-modal');
        const btnContainer = document.getElementById('modal-buttons');
        const archUI = document.getElementById('architect-ui');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-message').innerText = message;
        btnContainer.innerHTML = '';
        archUI.style.display = isArchitect ? 'block' : 'none';
        buttons.forEach(b => {
            const btn = document.createElement('button');
            btn.className = `modal-btn ${b.class}`;
            btn.innerText = b.text;
            btn.onclick = () => {
                let result = b.value;
                if (isArchitect && b.value === 'create') {
                    result = {
                        w: parseInt(document.getElementById('arch-w').value),
                        h: parseInt(document.getElementById('arch-h').value)
                    };
                }
                ov.style.display='none'; res(result); 
            };
            btnContainer.appendChild(btn);
        });
        ov.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    });
}
window.closeModal = () => { document.getElementById('custom-modal-overlay').style.display = 'none'; if(modalResolve) modalResolve(null); };

// ЛОББИ
async function checkExistingSession() {
    const savedRoom = localStorage.getItem('cellsGame_room');
    const savedRole = localStorage.getItem('cellsGame_role');
    const configMode = localStorage.getItem('cellsGame_configMode');
    if (savedRoom) {
        if (configMode === 'true') {
            currentRoom = savedRoom;
            document.getElementById('room-input').value = currentRoom;
            document.getElementById('lobby-main-step').style.display = 'none';
            document.getElementById('creator-settings').style.display = 'block';
        } else if (savedRole) {
            const snap = await get(ref(db, `rooms/${savedRoom}`));
            if (snap.exists()) { currentRoom = savedRoom; myRole = savedRole; startGame(); } 
            else { localStorage.clear(); }
        }
    }
}
checkExistingSession();

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
            gameState: 'playing', mapType: currentMapType, gameMode: currentMode, turn: 'red', players: { [role]: true }, energy: {red: 0, blue: 0}, totalArea: {red: 0, blue: 0}, spentEnergy: {red: 0, blue: 0}
        });
    } else {
        if (!snap.exists()) return showToast("Комната не найдена!");
        const players = data.players || {};
        if (!players.red) myRole = 'red'; else if (!players.blue) myRole = 'blue'; else return showToast("Комната полна!");
        await update(ref(db, `rooms/${currentRoom}/players`), { [myRole]: true });
    }
    localStorage.setItem('cellsGame_room', currentRoom);
    localStorage.setItem('cellsGame_role', myRole);
    localStorage.removeItem('cellsGame_configMode');
    startGame();
}

function startGame() {
    lobbyScreen.style.display = 'none';
    gameInterface.style.display = 'flex';
    document.getElementById('display-room-name').innerText = currentRoom;
    document.getElementById('my-role-display').innerText = `Вы: ${myRole === 'red' ? 'КРАСНЫЙ' : 'СИНИЙ'}`;
    initRoomListener();
}

let lastData = null;
function initRoomListener() {
    onValue(ref(db, `rooms/${currentRoom}`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        lastData = data;
        refreshUI();
    });
}

function refreshUI() {
    const data = lastData;
    const pCount = Object.keys(data.players || {}).length;
    if (pCount > playerCount && pCount === 2) showToast("Второй игрок зашел!");
    playerCount = pCount;

    currentTurn = data.turn || 'red';
    currentGameState = data.gameState || 'playing';
    currentMapType = data.mapType || 'square';
    currentMode = data.gameMode || 'classic';
    const figures = data.figures || {};
    
    const totalArea = data.totalArea ? (data.totalArea[myRole] || 0) : 0;
    const spentEnergy = data.spentEnergy ? (data.spentEnergy[myRole] || 0) : 0;
    myEnergy = Math.max(0, Math.floor(totalArea / 10) - spentEnergy);

    mapMask = generateMapMask(currentMapType);
    occupiedGrid = Array(20).fill().map(() => Array(20).fill(null));
    
    // Очистка только стационарных объектов
    gridElement.querySelectorAll('.cell').forEach(c => c.remove());
    gridElement.querySelectorAll('.rectangle.fixed').forEach(r => r.remove());

    for (let y=0; y<20; y++) {
        for (let x=0; x<20; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell' + (mapMask[y][x] === 0 ? ' void' : '');
            if (currentMode === 'connected') {
                if (x === 0 && mapMask[y][x] === 1) cell.classList.add('start-red');
                if (x === 19 && mapMask[y][x] === 1) cell.classList.add('start-blue');
            }
            gridElement.appendChild(cell);
        }
    }

    const cs = gridElement.clientWidth / 20;
    let rScore = 0, bScore = 0;
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
    turnDisplay.innerText = `Ход: ${currentTurn === 'red' ? 'КРАСНЫХ' : 'СИНИХ'}`;
    turnDisplay.style.backgroundColor = currentTurn === 'red' ? 'var(--red)' : 'var(--blue)';

    if (currentMode === 'energy') {
        document.getElementById('ability-bar').style.display = 'flex';
        document.getElementById('red-energy').style.display = 'inline';
        document.getElementById('blue-energy').style.display = 'inline';
        const redE = Math.max(0, Math.min(10, Math.floor((data.totalArea?.red || 0) / 10) - (data.spentEnergy?.red || 0)));
        const blueE = Math.max(0, Math.min(10, Math.floor((data.totalArea?.blue || 0) / 10) - (data.spentEnergy?.blue || 0)));
        document.getElementById('red-energy').innerText = `⚡${redE}`;
        document.getElementById('blue-energy').innerText = `⚡${blueE}`;
        document.getElementById('ab-reroll').disabled = (myEnergy < 2 || currentTurn !== myRole || (!activeRectElement && !data.pendingDice));
        document.getElementById('ab-destroy').disabled = (myEnergy < 4 || currentTurn !== myRole);
        document.getElementById('ab-max').disabled = (myEnergy < 6 || currentTurn !== myRole);
    } else {
        document.getElementById('ability-bar').style.display = 'none';
    }

    if (data.pendingDice && data.pendingDice.player === myRole && !activeRectElement) {
        currentDice = { w: data.pendingDice.w, h: data.pendingDice.h };
        createDraggable(currentDice.w, currentDice.h);
    }

    if (currentGameState === 'finished' && !gameEndedAlertShown) {
        gameEndedAlertShown = true;
        const winner = rScore > bScore ? 'КРАСНЫЕ' : 'СИНИЕ';
        showModal("ИГРА ОКОНЧЕНА", `Выпало: ${data.lastDice}.\nМест нет!\nПобедили ${winner}\nСчет ${rScore}:${bScore}`, [
            { text: "Сыграть снова", value: "clear", class: "btn-main" },
            { text: "Выйти в лобби", value: "exit", class: "btn-sub" }
        ]).then(res => handleManualResetAction(res));
    } else {
        document.getElementById('diceResult').innerText = data.lastDice || '?';
    }
}

window.rollDice = async () => {
    if (currentGameState === 'finished') return;
    if (currentTurn !== myRole) return showToast("Ход противника!");
    const snap = await get(ref(db, `rooms/${currentRoom}/pendingDice`));
    if ((snap.exists() && snap.val().player === myRole) || activeRectElement) return showToast("Уже брошено!");
    const d1 = Math.floor(Math.random() * 6) + 1, d2 = Math.floor(Math.random() * 6) + 1;
    if (!canFitAnywhere(d1, d2)) {
        if (myEnergy >= 2) {
            showToast("Мест нет! Воспользуйтесь способностью.");
            update(ref(db, `rooms/${currentRoom}`), { lastDice: `${d1}x${d2}`, pendingDice: { w: d1, h: d2, player: myRole } });
        } else {
            update(ref(db, `rooms/${currentRoom}`), { gameState: "finished", lastDice: `${d1}x${d2}` });
        }
    } else {
        update(ref(db, `rooms/${currentRoom}`), { lastDice: `${d1}x${d2}`, pendingDice: { w: d1, h: d2, player: myRole } });
    }
};

window.confirmMove = async () => {
    if (!activeRectElement || activeRectElement.parentElement !== gridElement) return showToast("Тяните на поле!");
    const cs = gridElement.clientWidth / 20;
    const x = Math.round(parseInt(activeRectElement.style.left) / cs), y = Math.round(parseInt(activeRectElement.style.top) / cs);
    if (!canPlace(x, y, currentDice.w, currentDice.h, myRole)) return showToast("Тут нельзя!");
    const areaNow = lastData.totalArea ? (lastData.totalArea[myRole] || 0) : 0;
    const updates = {
        [`figures/fig_${Date.now()}`]: { x, y, width: currentDice.w, height: currentDice.h, color: myRole },
        turn: myRole === 'red' ? 'blue' : 'red', pendingDice: null, [`totalArea/${myRole}`]: areaNow + (currentDice.w * currentDice.h)
    };
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

window.useAbility = async (type) => {
    if (currentTurn !== myRole) return;
    const roomRef = ref(db, `rooms/${currentRoom}`);
    const spent = lastData.spentEnergy ? (lastData.spentEnergy[myRole] || 0) : 0;

    if (type === 'reroll' && myEnergy >= 2) {
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        await update(roomRef, { 
            [`spentEnergy/${myRole}`]: spent + 2, 
            pendingDice: { w: d1, h: d2, player: myRole },
            lastDice: `${d1}x${d2}`
        });
        if(activeRectElement) { activeRectElement.remove(); activeRectElement = null; confirmBtn.style.display = 'none'; }
        showToast("Переброшено!");
    } else if (type === 'destroy' && myEnergy >= 4) {
        targetingMode = !targetingMode;
        showToast(targetingMode ? "Выберите фигуру врага" : "Отмена");
        refreshUI();
    } else if (type === 'max' && myEnergy >= 6) {
        const res = await showModal("Архитектор", "Создайте фигуру (1-6):", [{text:"Создать", value:"create", class:"btn-main"}, {text:"Отмена", value:null, class:"btn-sub"}], true);
        if (!res) return;
        const {w, h} = res;
        if (w<1 || w>6 || h<1 || h>6) return showToast("Размер 1-6!");
        if (!canFitAnywhere(w, h)) return showModal("Места нет", `Фигура ${w}x${h} не влезет!`, [{text:"Ок", class:"btn-main"}]);
        if(activeRectElement) { activeRectElement.remove(); activeRectElement = null; }
        currentDice = {w, h};
        await update(roomRef, { [`spentEnergy/${myRole}`]: spent + 6, pendingDice: {w, h, player: myRole}, lastDice: `${w}x${h}` });
        showToast("Фигура создана!");
    }
};

async function executeDestroy(id) {
    targetingMode = false;
    const spent = lastData.spentEnergy ? (lastData.spentEnergy[myRole] || 0) : 0;
    await remove(ref(db, `rooms/${currentRoom}/figures/${id}`));
    await update(ref(db, `rooms/${currentRoom}/spentEnergy`), { [myRole]: spent + 4 });
    showToast("Сжёг!");
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
        const gridRect = gridElement.getBoundingClientRect();
        const csNow = gridElement.clientWidth / 20;
        if (!isOnGrid && e.clientX > gridRect.left && e.clientX < gridRect.right && e.clientY > gridRect.top && e.clientY < gridRect.bottom) {
            gridElement.appendChild(activeRectElement); isOnGrid = true;
        }
        if (isOnGrid) {
            let x = Math.round((e.clientX - gridRect.left - (currentDice.w * csNow) / 2) / csNow) * csNow;
            let y = Math.round((e.clientY - gridRect.top - (currentDice.h * csNow) / 2) / csNow) * csNow;
            activeRectElement.style.left = Math.max(0, Math.min(x, (20 - currentDice.w) * csNow)) + 'px';
            activeRectElement.style.top = Math.max(0, Math.min(y, (20 - currentDice.h) * csNow)) + 'px';
        }
    };
    activeRectElement.onpointerup = () => isDragging = false;
}

window.handleManualReset = async () => {
    const res = await showModal("Меню", "Действие:", [{text:"Очистить", value:"clear", class:"btn-main"}, {text:"Настройки", value:"config", class:"btn-main"}, {text:"Выход", value:"exit", class:"btn-sub"}]);
    if (res) handleManualResetAction(res);
};

async function handleManualResetAction(type) {
    if (!type) return;
    if (type === "clear") {
        await update(ref(db, `rooms/${currentRoom}`), { figures: null, gameState: 'playing', turn: 'red', pendingDice: null, totalArea: {red:0, blue:0}, spentEnergy: {red:0, blue:0} });
        location.reload();
    } else if (type === "config") {
        await update(ref(db, `rooms/${currentRoom}`), { figures: null, gameState: 'playing', turn: 'red', pendingDice: null, totalArea: {red:0, blue:0}, spentEnergy: {red:0, blue:0}, players: null });
        localStorage.setItem('cellsGame_configMode', 'true');
        location.reload();
    } else if (type === "exit") {
        await remove(ref(db, `rooms/${currentRoom}`));
        localStorage.clear(); location.reload();
    }
}

function generateMapMask(type) {
    let mask = Array(20).fill().map(() => Array(20).fill(1));
    if (type === 'octagon') for (let y=0; y<20; y++) for (let x=0; x<20; x++) if (x+y < 5 || (19-x)+y < 5 || x+(19-y) < 5 || (19-x)+(19-y) < 5) mask[y][x] = 0;
    if (type === 'donut') for (let y=6; y<=13; y++) for (let x=6; x<=13; x++) mask[y][x] = 0;
    if (type === 'cross') for (let y=0; y<20; y++) for (let x=0; x<20; x++) if ((x<6&&y<6) || (x>13&&y<6) || (x<6&&y>13) || (x>13&&y>13)) mask[y][x] = 0;
    if (type === 'fortress') for (let y=0; y<20; y++) for (let x=0; x<20; x++) if ((x>=8&&x<=11&&y<6)||(x>=8&&x<=11&&y>13)||(y>=8&&y<=11&&x<6)||(y>=8&&y<=11&&x>13)) mask[y][x] = 0;
    return mask;
}

function canFitAnywhere(w, h) {
    for (let y = 0; y <= 20-h; y++) for (let x = 0; x <= 20-w; x++) if (canPlace(x, y, w, h, myRole)) return true;
    for (let y = 0; y <= 20-w; y++) for (let x = 0; x <= 20-h; x++) if (canPlace(x, y, h, w, myRole)) return true;
    return false;
}

function canPlace(x, y, w, h, role) {
    if (x < 0 || y < 0 || x + w > 20 || y + h > 20) return false;
    let ts = false, tc = false;
    for (let i = y; i < y + h; i++) {
        for (let j = x; j < x + w; j++) {
            if (occupiedGrid[i][j] || mapMask[i][j] === 0) return false;
            if (currentMode === 'connected') {
                if (role === 'red' && j === 0) ts = true;
                if (role === 'blue' && j + w === 20) ts = true;
                [[i-1,j],[i+1,j],[i,j-1],[i,j+1]].forEach(([ny,nx]) => {
                    if (ny>=0 && ny<20 && nx>=0 && nx<20 && occupiedGrid[ny][nx]===role) tc = true;
                });
            }
        }
    }
    return currentMode === 'connected' ? (ts || tc) : true;
}

window.showRules = () => {
    const rules = {
        classic: "• Ставьте фигуры где угодно.\n• Цель: занять больше всех клеток.",
        connected: "• ВЫ МОЖЕТЕ СТАВИТЬ:\n  1. К своей стенке (Красные - слева, Синие - справа).\n  2. К своим фигурам.",
        energy: "• За 10 клеток = 1⚡.\n\nСПОСОБНОСТИ:\n• 2⚡ Переброс.\n• 4⚡ Сжечь врага.\n• 6⚡ Архитектор: Свои размеры (1-6)."
    };
    showModal("Правила", rules[document.getElementById('mode-select').value], [{text: "Ок", value: true, class: "btn-main"}]);
};

window.closeModal = closeModal;
window.rollDice = rollDice;
window.confirmMove = confirmMove;
window.rotatePiece = rotatePiece;
window.useAbility = useAbility;
window.handleManualReset = handleManualReset;
