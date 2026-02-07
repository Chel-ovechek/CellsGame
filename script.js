import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-database.js";

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
let currentTurn = 'red';
let occupiedGrid = Array(20).fill().map(() => Array(20).fill(false));
let currentDice = { w: 0, h: 0 };
let activeRectElement = null;
let gameEndedAlertShown = false;

const gridElement = document.getElementById('grid');
const diceResult = document.getElementById('diceResult');
const previewZone = document.getElementById('preview-zone');
const confirmBtn = document.getElementById('confirmMoveButton');

function assignRole() {
    const params = new URLSearchParams(window.location.search);
    myRole = params.get('player');
    if (!myRole) {
        myRole = confirm("Играть за КРАСНЫХ? (Ок - Красные, Отмена - Синие)") ? 'red' : 'blue';
    }
    document.querySelector('h1').innerText = `Клетки: ${myRole === 'red' ? 'КРАСНЫЙ' : 'СИНИЙ'}`;
}
assignRole();

function getCellSize() {
    return gridElement.clientWidth / 20;
}

function drawVisualGrid() {
    gridElement.innerHTML = '';
    for (let i = 0; i < 400; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        gridElement.appendChild(cell);
    }
}
drawVisualGrid();

onValue(ref(db, "/"), (snapshot) => {
    const data = snapshot.val() || {};
    currentTurn = data.turn || 'red';
    const figures = data.figures || {};
    const gameState = data.gameState || 'playing';

    occupiedGrid = Array(20).fill().map(() => Array(20).fill(false));
    document.querySelectorAll('.rectangle.fixed').forEach(el => el.remove());

    let rScore = 0, bScore = 0;
    const cellSize = getCellSize();

    for (let id in figures) {
        const f = figures[id];
        const rect = document.createElement('div');
        rect.classList.add('rectangle', 'fixed');
        rect.style.width = `${f.width * cellSize}px`;
        rect.style.height = `${f.height * cellSize}px`;
        rect.style.left = `${f.x * cellSize}px`;
        rect.style.top = `${f.y * cellSize}px`;
        rect.style.backgroundColor = f.color === 'red' ? '#e84351' : '#0960e3';
        gridElement.appendChild(rect);

        for (let y = f.y; y < f.y + f.height; y++) {
            for (let x = f.x; x < f.x + f.width; x++) {
                if (y < 20 && x < 20) occupiedGrid[y][x] = true;
            }
        }
        if (f.color === 'red') rScore += f.width * f.height;
        else bScore += f.width * f.height;
    }

    document.getElementById('red').innerText = `Красных: ${rScore}`;
    document.getElementById('blue').innerText = `Синих: ${bScore}`;
    
    if (gameState === 'finished') {
        diceResult.innerText = "ФИНАЛ";
        if (!gameEndedAlertShown) {
            gameEndedAlertShown = true;
            const winner = rScore > bScore ? "КРАСНЫЕ" : (bScore > rScore ? "СИНИЕ" : "НИЧЬЯ");
            setTimeout(() => {
                if (confirm(`МЕСТА НЕТ!\nПобедитель: ${winner}\nСчет: ${rScore} - ${bScore}\nСыграть снова?`)) window.resetGame();
            }, 500);
        }
    } else {
        gameEndedAlertShown = false;
        diceResult.innerText = (currentTurn === myRole) ? `Ваш ход! (${data.lastDice || '?'})` : `Ждем противника...`;
    }
});

function canPlaceRectangle(x, y, w, h) {
    if (isNaN(x) || isNaN(y)) return false;
    if (x < 0 || y < 0 || x + w > 20 || y + h > 20) return false;
    for (let i = y; i < y + h; i++) {
        for (let j = x; j < x + w; j++) {
            if (occupiedGrid[i][j]) return false;
        }
    }
    return true;
}

function canFitAnywhere(w, h) {
    for (let y = 0; y <= 20 - h; y++) {
        for (let x = 0; x <= 20 - w; x++) {
            if (canPlaceRectangle(x, y, w, h)) return true;
        }
    }
    if (w !== h) {
        for (let y = 0; y <= 20 - w; y++) {
            for (let x = 0; x <= 20 - h; x++) {
                if (canPlaceRectangle(x, y, h, w)) return true;
            }
        }
    }
    return false;
}

window.rollDice = function() {
    if (currentTurn !== myRole) return alert("Сейчас ход противника!");
    if (activeRectElement) return alert("Фигура уже готова!");

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    currentDice = { w: d1, h: d2 };

    if (!canFitAnywhere(d1, d2)) {
        update(ref(db), { gameState: "finished", lastDice: `${d1}x${d2}` });
        return;
    }

    update(ref(db), { lastDice: `${d1}x${d2}` });
    createDraggableRectangle(d1, d2);
};

function createDraggableRectangle(w, h) {
    const cellSize = getCellSize();
    activeRectElement = document.createElement('div');
    activeRectElement.classList.add('rectangle');
    activeRectElement.style.width = `${w * cellSize}px`;
    activeRectElement.style.height = `${h * cellSize}px`;
    activeRectElement.style.backgroundColor = myRole === 'red' ? '#e84351' : '#0960e3';
    
    previewZone.innerHTML = '';
    previewZone.appendChild(activeRectElement);
    confirmBtn.style.display = 'block';

    let isDragging = false;
    let isOnGrid = false;

    activeRectElement.onpointerdown = (e) => {
        isDragging = true;
        activeRectElement.setPointerCapture(e.pointerId);
    };

    activeRectElement.onpointermove = (e) => {
        if (!isDragging) return;

        if (!isOnGrid) {
            gridElement.appendChild(activeRectElement);
            isOnGrid = true;
        }

        const rect = gridElement.getBoundingClientRect();
        const curCellSize = getCellSize();

        let x = e.clientX - rect.left - (currentDice.w * curCellSize) / 2;
        let y = e.clientY - rect.top - (currentDice.h * curCellSize) / 2;

        let gridX = Math.round(x / curCellSize) * curCellSize;
        let gridY = Math.round(y / curCellSize) * curCellSize;

        gridX = Math.max(0, Math.min(gridX, (20 - currentDice.w) * curCellSize));
        gridY = Math.max(0, Math.min(gridY, (20 - currentDice.h) * curCellSize));

        activeRectElement.style.left = `${gridX}px`;
        activeRectElement.style.top = `${gridY}px`;
    };

    activeRectElement.onpointerup = () => {
        isDragging = false;
    };
}

confirmBtn.onclick = () => {
    if (!activeRectElement || activeRectElement.parentElement !== gridElement) {
        return alert("Перетащите фигуру на поле!");
    }

    const curCellSize = getCellSize();
    const x = Math.round(parseInt(activeRectElement.style.left) / curCellSize);
    const y = Math.round(parseInt(activeRectElement.style.top) / curCellSize);
    
    if (!canPlaceRectangle(x, y, currentDice.w, currentDice.h)) {
        return alert("Место занято!");
    }

    const updates = {};
    const key = `fig_${Date.now()}`;
    updates[`/figures/${key}`] = { x, y, width: currentDice.w, height: currentDice.h, color: myRole };
    updates[`/turn`] = myRole === 'red' ? 'blue' : 'red';

    update(ref(db), updates).then(() => {
        activeRectElement.remove();
        activeRectElement = null;
        confirmBtn.style.display = 'none';
        previewZone.innerHTML = '';
    });
};

document.getElementById("rotateButton").onclick = () => {
    if (!activeRectElement) return;
    const curCellSize = getCellSize();
    [currentDice.w, currentDice.h] = [currentDice.h, currentDice.w];

    activeRectElement.style.width = `${currentDice.w * curCellSize}px`;
    activeRectElement.style.height = `${currentDice.h * curCellSize}px`;

    if (activeRectElement.parentElement === gridElement) {
        let lx = parseInt(activeRectElement.style.left) || 0;
        let ty = parseInt(activeRectElement.style.top) || 0;
        lx = Math.max(0, Math.min(lx, (20 - currentDice.w) * curCellSize));
        ty = Math.max(0, Math.min(ty, (20 - currentDice.h) * curCellSize));
        activeRectElement.style.left = `${lx}px`;
        activeRectElement.style.top = `${ty}px`;
    }
};

window.resetGame = function() {
    if (confirm("Сбросить игру?")) {
        set(ref(db), { turn: 'red', figures: {}, lastDice: '?', gameState: 'playing' })
        .then(() => location.reload());
    }
};
