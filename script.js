import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-database.js";
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

// Уникальный ID игрока (паспорт браузера)
if (!localStorage.getItem('cellsGame_myId')) {
    localStorage.setItem('cellsGame_myId', 'p_' + Math.random().toString(36).substr(2, 9));
}
const myId = localStorage.getItem('cellsGame_myId');

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
let lastProcessedRollTime = 0;

const gridElement = document.getElementById('grid');
const confirmBtn = document.getElementById('confirmMoveButton');
const turnDisplay = document.getElementById('turn-display');
const lobbyScreen = document.getElementById('lobby-screen');
const gameInterface = document.getElementById('game-interface');

const roomListContainer = document.getElementById('room-list-container');
const roomListElement = document.getElementById('room-list');
const roomInput = document.getElementById('room-input');

// Словари для перевода на русский
const translateMap = {
    'square': 'Квадрат',
    'octagon': 'Арена',
    'donut': 'Кольцо',
    'cross': 'Крест',
    'fortress': 'Крепость'
};

const translateMode = {
    'classic': 'Классика',
    'connected': 'Связность',
    'energy': 'Энергия'
};

function showToast(text) {
    const container = document.getElementById('toast-container');
    if (!container) return;
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

async function checkExistingSession() {
    const savedRoom = localStorage.getItem('cellsGame_room');
    const configMode = localStorage.getItem('cellsGame_configMode');
    if (savedRoom) {
        if (configMode === 'true') {
            currentRoom = savedRoom;
            document.getElementById('room-input').value = currentRoom;
            document.getElementById('lobby-main-step').style.display = 'none';
            document.getElementById('creator-settings').style.display = 'block';
        } else {
            const snap = await get(ref(db, `rooms/${savedRoom}`));
            if (snap.exists()) { 
                currentRoom = savedRoom; 
                startGame(); 
            } else { localStorage.clear(); }
        }
    }
}
checkExistingSession();

document.getElementById('btn-create-room').onclick = async () => {
    const name = roomInput.value.trim();
    if (!name) return showToast("Введите название!");
    
    // Проверка на уникальность
    const snap = await get(ref(db, `rooms/${name}`));
    if (snap.exists()) {
        const data = snap.val();
        if (Object.keys(data.players || {}).length >= 2) {
            return showToast("Комната уже занята и полна!");
        }
        return showModal("Комната существует", "Такая комната уже есть. Хотите войти в неё?", [
            { text: "Войти", value: "join", class: "btn-main" },
            { text: "Отмена", value: null, class: "btn-sub" }
        ]).then(res => {
            if (res === "join") joinRoom(null, false);
        });
    }

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
    const data = snap.val() || {};
    let players = data.players || {};

    if (isCreator) {
        currentMapType = document.getElementById('map-select').value;
        currentMode = document.getElementById('mode-select').value;
        
        const otherRole = (role === 'red' ? 'blue' : 'red');
        let newPlayers = {};

        // Находим, кто сейчас в комнате (кроме нас)
        let guestId = null;
        if (players.red && players.red !== myId) guestId = players.red;
        if (players.blue && players.blue !== myId) guestId = players.blue;

        // Себя ставим на выбранную роль
        newPlayers[role] = myId;
        // Если есть гость, ставим его на свободную роль
        if (guestId) newPlayers[otherRole] = guestId;

        await update(ref(db, `rooms/${currentRoom}`), {
            gameState: 'playing', 
            mapType: currentMapType, 
            gameMode: currentMode, 
            turn: 'red', 
            players: newPlayers, 
            totalArea: {red: 0, blue: 0}, 
            spentEnergy: {red: 0, blue: 0},
            pendingDice: null
        });
    } else {
        // Логика обычного входа
        if (!snap.exists()) return showToast("Комната не найдена!");
        if (players.red === myId) { /* уже зашел */ }
        else if (players.blue === myId) { /* уже зашел */ }
        else if (!players.red) await update(ref(db, `rooms/${currentRoom}/players`), { red: myId });
        else if (!players.blue) await update(ref(db, `rooms/${currentRoom}/players`), { blue: myId });
        else return showToast("Комната полна!");
    }

    localStorage.setItem('cellsGame_room', currentRoom);
    localStorage.removeItem('cellsGame_configMode');
    startGame();
}

function startGame() {
    lobbyScreen.style.display = 'none';
    gameInterface.style.display = 'flex';
    document.getElementById('display-room-name').innerText = currentRoom;
    initRoomListener();
}

let lastData = null;
function initRoomListener() {
    onValue(ref(db, `rooms/${currentRoom}`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        lastData = data;
        const players = data.players || {};

        // Если мы в игре, говорим базе: "Если я отключусь — удали мой ID из игроков"
        if (myRole) {
            const myPresenceRef = ref(db, `rooms/${currentRoom}/players/${myRole}`);
            onDisconnect(myPresenceRef).remove();
        }
        // Проверка: не появился ли в базе новый бросок кубиков?
        if (data.activeRoll && data.activeRoll.timestamp > lastProcessedRollTime) {
            lastProcessedRollTime = data.activeRoll.timestamp;
            runDiceAnimation(data.activeRoll.w, data.activeRoll.h, data.activeRoll.rollerId);
        }

        // 1. Пытаемся найти себя в списке
        if (players.red === myId) myRole = 'red';
        else if (players.blue === myId) myRole = 'blue';
        else {
            // 2. Если нас нет в списке (сброс настроек), занимаем свободное место
            if (!players.red) {
                myRole = 'red';
                update(ref(db, `rooms/${currentRoom}/players`), { red: myId });
            } else if (!players.blue) {
                myRole = 'blue';
                update(ref(db, `rooms/${currentRoom}/players`), { blue: myId });
            }
        }

        if (myRole) {
            document.getElementById('my-role-display').innerText = `Вы: ${myRole === 'red' ? 'КРАСНЫЙ' : 'СИНИЙ'}`;
            localStorage.setItem('cellsGame_role', myRole);
        }
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

    // Сначала найдем ID самой последней поставленной фигуры
    let latestId = null;
    let maxTime = 0;
    for (let id in figures) {
        const timestamp = parseInt(id.split('_')[1]);
        if (timestamp > maxTime) {
            maxTime = timestamp;
            latestId = id;
        }
    }

    for (let id in figures) {
        const f = figures[id];
        const rect = document.createElement('div');
        
        // Добавляем класс last-move, если это последняя фигура
        const isLast = (id === latestId);
        rect.className = 'rectangle fixed' + 
                        (targetingMode && f.color !== myRole ? ' targetable' : '') +
                        (isLast ? ' last-move' : '');
        
        rect.style.width = f.width * cs + 'px';
        rect.style.height = f.height * cs + 'px';
        rect.style.left = f.x * cs + 'px';
        rect.style.top = f.y * cs + 'px';
        rect.style.backgroundColor = f.color === 'red' ? '#e84393' : '#0984e3';
        
        if(targetingMode && f.color !== myRole) rect.onclick = () => executeDestroy(id);
        
        gridElement.appendChild(rect);
        
        // Заполнение сетки для логики
        for (let i = f.y; i < f.y + f.height; i++) {
            for (let j = f.x; j < f.x + f.width; j++) {
                occupiedGrid[i][j] = f.color;
            }
        }
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
        document.getElementById('red-energy').style.display = 'none';
        document.getElementById('blue-energy').style.display = 'none';
    }

    // Проверка кубиков: создаем, обновляем или УДАЛЯЕМ фигуру
    if (data.pendingDice && data.pendingDice.player === myRole) {
        if (!activeRectElement || currentDice.w !== data.pendingDice.w || currentDice.h !== data.pendingDice.h) {
            currentDice = { w: data.pendingDice.w, h: data.pendingDice.h };
            createDraggable(currentDice.w, currentDice.h);
        }
    } else {
        // Если в базе нет брошенных кубиков для нас, а на экране (или в превью) что-то висит — удаляем
        if (activeRectElement) {
            activeRectElement.remove();
            activeRectElement = null;
            confirmBtn.style.display = 'none';
            document.getElementById('preview-zone').innerHTML = '';
        }
    }

    if (currentGameState === 'finished' && !gameEndedAlertShown) {
        if(activeRectElement) { activeRectElement.remove(); activeRectElement = null; } // Убираем фигуру с экрана
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
    
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;

    // Записываем бросок в базу, чтобы его увидели ВСЕ
    await update(ref(db, `rooms/${currentRoom}`), {
        activeRoll: {
            w: d1,
            h: d2,
            rollerId: myId,
            timestamp: Date.now()
        },
        lastDice: `${d1}x${d2}`
    });
};

function runDiceAnimation(d1, d2, rollerId) {
    const overlay = document.getElementById('dice-overlay');
    const cube1 = document.getElementById('dice1');
    const cube2 = document.getElementById('dice2');

    overlay.style.display = 'flex';
    cube1.classList.add('cube-rolling');
    cube2.classList.add('cube-rolling');

    setTimeout(() => {
        cube1.classList.remove('cube-rolling');
        cube2.classList.remove('cube-rolling');
        applyFinalRotation(cube1, d1);
        applyFinalRotation(cube2, d2);
    }, 600);

    setTimeout(async () => {
        overlay.style.display = 'none';
        cube1.style.transform = '';
        cube2.style.transform = '';

        // Только тот, кто КИНУЛ кубики, обновляет состояние игры в базе
        if (myId === rollerId) {
            const canFit = canFitAnywhere(d1, d2);
            const roomRef = ref(db, `rooms/${currentRoom}`);
            
            if (!canFit) {
                if (currentMode === 'energy' && myEnergy >= 2) {
                    showToast("Мест нет! Воспользуйтесь способностью.");
                    await update(roomRef, { pendingDice: { w: d1, h: d2, player: myRole }, activeRoll: null });
                } else {
                    await update(roomRef, { gameState: "finished", activeRoll: null });
                }
            } else {
                await update(roomRef, { pendingDice: { w: d1, h: d2, player: myRole }, activeRoll: null });
            }
        }
    }, 1800);
}

// Функция расчета финального поворота
function applyFinalRotation(cube, value) {
    // Базовые повороты для каждой грани
    const rotations = {
        1: { x: 0,   y: 0 },
        2: { x: -90, y: 0 },
        3: { x: 0,   y: -90 },
        4: { x: 0,   y: 90 },
        5: { x: 90,  y: 0 },
        6: { x: 180, y: 0 }
    };

    const target = rotations[value];
    
    // Добавляем 3-4 полных оборота (1080-1440 градусов), 
    // чтобы кубик "докручивался" до цели реалистично
    const extraX = 1080; 
    const extraY = 1080;

    cube.style.transform = `rotateX(${target.x + extraX}deg) rotateY(${target.y + extraY}deg)`;
}

window.confirmMove = async () => {
    if (!activeRectElement || activeRectElement.parentElement !== gridElement) return showToast("Тяните на поле!");
    const cs = gridElement.clientWidth / 20;
    const x = Math.round(parseInt(activeRectElement.style.left) / cs), y = Math.round(parseInt(activeRectElement.style.top) / cs);
    if (!canPlace(x, y, currentDice.w, currentDice.h, myRole)) return showToast("Тут нельзя!");
    targetingMode = false;
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
        
        // Очищаем старое превью
        if(activeRectElement) { activeRectElement.remove(); activeRectElement = null; }
        document.getElementById('preview-zone').innerHTML = '';
        confirmBtn.style.display = 'none';

        const newSpent = spent + 2;
        const energyAfter = Math.max(0, Math.floor((lastData.totalArea[myRole] || 0) / 10) - newSpent);

        await update(roomRef, { 
            [`spentEnergy/${myRole}`]: newSpent, 
            pendingDice: { w: d1, h: d2, player: myRole },
            lastDice: `${d1}x${d2}`
        });

        showToast("Переброшено!");

        // Проверка: влезает ли новая фигура?
        if (!canFitAnywhere(d1, d2)) {
            if (energyAfter < 2) {
                // Если даже после переброса не лезет и энергии больше нет — КОНЕЦ
                await update(roomRef, { gameState: "finished" });
            } else {
                showToast("Все еще не лезет! Нужно перебросить еще раз.");
            }
        }
    } else if (type === 'destroy' && myEnergy >= 4) {
        targetingMode = !targetingMode;
        showToast(targetingMode ? "Выберите фигуру врага" : "Отмена");
        refreshUI();
        // Больше здесь ничего не нужно. Проверка будет в executeDestroy.
    } else if (type === 'max' && myEnergy >= 6) {
        const res = await showModal("Архитектор", "Создайте фигуру (1-6):", [{text:"Создать", value:"create", class:"btn-main"}, {text:"Отмена", value:null, class:"btn-sub"}], true);
        if (!res) return;
        const {w, h} = res;
        if (w<1 || w>6 || h<1 || h>6) return showToast("Размер 1-6!");
        if (!canFitAnywhere(w, h)) return showModal("Места нет", `Фигура ${w}x${h} не влезет!`, [{text:"Ок", class:"btn-main"}]);
        
        if(activeRectElement) { activeRectElement.remove(); activeRectElement = null; }
        document.getElementById('preview-zone').innerHTML = '';

        currentDice = {w, h};
        await update(roomRef, { [`spentEnergy/${myRole}`]: spent + 6, pendingDice: {w, h, player: myRole}, lastDice: `${w}x${h}` });
        showToast("Фигура создана!");
    }
};

async function executeDestroy(id) {
    targetingMode = false;
    const spent = lastData.spentEnergy ? (lastData.spentEnergy[myRole] || 0) : 0;
    const newSpent = spent + 4;
    
    // 1. Сначала удаляем фигуру и тратим энергию
    await remove(ref(db, `rooms/${currentRoom}/figures/${id}`));
    await update(ref(db, `rooms/${currentRoom}/spentEnergy`), { [myRole]: newSpent });
    
    showToast("Сжёг!");

    // 2. Ждем микро-паузу, чтобы локальная сетка occupiedGrid успела обновиться из refreshUI
    // Либо делаем проверку на основе данных из последнего снимка, но проще проверить через небольшую задержку
    setTimeout(async () => {
        if (lastData.pendingDice) {
            const { w, h } = lastData.pendingDice;
            const energyAfter = Math.max(0, Math.floor((lastData.totalArea[myRole] || 0) / 10) - newSpent);
            
            if (!canFitAnywhere(w, h)) {
                if (energyAfter < 2) {
                    await update(ref(db, `rooms/${currentRoom}`), { gameState: "finished" });
                } else {
                    showToast("Места все равно нет! Нужен переброс.");
                }
            }
        }
    }, 100);
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
        // Убрали players: null, чтобы второй игрок не вылетал из базы
        await update(ref(db, `rooms/${currentRoom}`), { 
            figures: null, 
            gameState: 'playing', 
            turn: 'red', 
            pendingDice: null, 
            totalArea: {red:0, blue:0}, 
            spentEnergy: {red:0, blue:0} 
        });
        localStorage.setItem('cellsGame_configMode', 'true');
        location.reload();
    } else if (type === "exit") {
        const roomRef = ref(db, `rooms/${currentRoom}`);
        const snap = await get(roomRef);
        
        if (snap.exists()) {
            let players = snap.val().players || {};
            // Удаляем только себя из списка игроков
            if (players.red === myId) delete players.red;
            if (players.blue === myId) delete players.blue;

            // Если в комнате больше никого нет — удаляем комнату
            if (Object.keys(players).length === 0) {
                await remove(roomRef);
            } else {
                // Если кто-то остался — просто обновляем список игроков в базе
                await set(ref(db, `rooms/${currentRoom}/players`), players);
            }
        }
        localStorage.clear(); 
        location.reload();
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

function initGlobalRoomList() {
    onValue(ref(db, 'rooms'), (snapshot) => {
        const roomsData = snapshot.val();
        if (!roomsData) {
            roomListContainer.style.display = 'none';
            return;
        }

        roomListContainer.style.display = 'block';
        roomListElement.innerHTML = '';

        const allRooms = Object.entries(roomsData);
        const searchFilter = roomInput.value.trim().toLowerCase();

        allRooms.sort(([nameA], [nameB]) => {
            if (nameA.toLowerCase() === searchFilter) return -1;
            if (nameB.toLowerCase() === searchFilter) return 1;
            return 0;
        });

        allRooms.forEach(([roomName, data]) => {
            const players = data.players || {};
            const pCount = Object.keys(players).length;

            if (pCount === 0) return; 
            
            // Перевод значений
            const mapName = translateMap[data.mapType] || data.mapType || 'Стандарт';
            const modeName = translateMode[data.gameMode] || data.gameMode || 'Классика';
            
            const item = document.createElement('div');
            item.className = 'room-item';
            item.onclick = () => {
                roomInput.value = roomName;
                joinRoom(null, false);
            };

            const statusClass = pCount < 2 ? 'status-waiting' : 'status-full';
            const statusText = pCount < 2 ? 'Свободно' : 'Мест нет';

            item.innerHTML = `
                <div style="flex: 1; min-width: 0;">
                    <div class="room-item-name">${roomName}</div>
                    <div class="room-item-info">
                        Карта: <b>${mapName}</b><br>
                        Режим: <b>${modeName}</b>
                    </div>
                </div>
                <div style="text-align: right; margin-left: 10px;">
                    <div class="room-item-status ${statusClass}">${pCount}/2</div>
                    <div style="font-size: 9px; color: #95a5a6; margin-top: 4px; font-weight: bold; text-transform: uppercase;">${statusText}</div>
                </div>
            `;
            roomListElement.appendChild(item);
        });
    });
}

// Вызываем функцию
initGlobalRoomList();

// Добавим обновление списка при вводе текста в инпут (чтобы сортировка работала на лету)
roomInput.oninput = () => initGlobalRoomList();

window.closeModal = closeModal;
window.rollDice = rollDice;
window.confirmMove = confirmMove;
window.rotatePiece = rotatePiece;
window.useAbility = useAbility;
window.handleManualReset = handleManualReset;