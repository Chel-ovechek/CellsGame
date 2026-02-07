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

// Состояние игры
let myRole = null; 
let currentTurn = 'red';
let occupiedGrid = Array(20).fill().map(() => Array(20).fill(false));
let currentDice = { w: 0, h: 0 };
let activeRectElement = null;
let gameEndedAlertShown = false; // Чтобы окно победы не всплывало постоянно

const gridElement = document.getElementById('grid');
const diceResult = document.getElementById('diceResult');

// 1. ОПРЕДЕЛЕНИЕ РОЛИ
function assignRole() {
    const params = new URLSearchParams(window.location.search);
    myRole = params.get('player');
    if (!myRole) {
        myRole = confirm("Играть за КРАСНЫХ? (Ок - Красные, Отмена - Синие)") ? 'red' : 'blue';
    }
    document.querySelector('h1').innerText = `Клетки: ${myRole === 'red' ? 'КРАСНЫЙ' : 'СИНИЙ'} игрок`;
}
assignRole();

// 2. ОТРИСОВКА СЕТКИ
function drawVisualGrid() {
    gridElement.innerHTML = '';
    for (let i = 0; i < 400; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        gridElement.appendChild(cell);
    }
}
drawVisualGrid();

// 3. ПРОВЕРКА ВОЗМОЖНОСТИ ХОДА
function canPlaceRectangle(gridX, gridY, width, height) {
    if (gridX < 0 || gridY < 0 || gridX + width > 20 || gridY + height > 20) return false;
    for (let i = gridY; i < gridY + height; i++) {
        for (let j = gridX; j < gridX + width; j++) {
            if (occupiedGrid[i][j]) return false;
        }
    }
    return true;
}

function canFitAnywhere(w, h) {
    // Проверка обычного положения
    for (let y = 0; y <= 20 - h; y++) {
        for (let x = 0; x <= 20 - w; x++) {
            if (canPlaceRectangle(x, y, w, h)) return true;
        }
    }
    // Проверка повернутого положения
    if (w !== h) {
        for (let y = 0; y <= 20 - w; y++) {
            for (let x = 0; x <= 20 - h; x++) {
                if (canPlaceRectangle(x, y, h, w)) return true;
            }
        }
    }
    return false;
}

// 4. ГЛАВНЫЙ СЛУШАТЕЛЬ FIREBASE
onValue(ref(db, "/"), (snapshot) => {
    const data = snapshot.val() || {};
    currentTurn = data.turn || 'red';
    const figures = data.figures || {};
    const gameState = data.gameState || 'playing';

    occupiedGrid = Array(20).fill().map(() => Array(20).fill(false));
    document.querySelectorAll('.rectangle.fixed').forEach(el => el.remove());

    let redScore = 0;
    let blueScore = 0;

    for (let id in figures) {
        const f = figures[id];
        renderFixedRectangle(f);
        for (let y = f.y; y < f.y + f.height; y++) {
            for (let x = f.x; x < f.x + f.width; x++) {
                if (y < 20 && x < 20) occupiedGrid[y][x] = true;
            }
        }
        if (f.color === 'red') redScore += f.width * f.height;
        else blueScore += f.width * f.height;
    }

    document.getElementById('red').innerText = `Красных клеток: ${redScore}`;
    document.getElementById('blue').innerText = `Синих клеток: ${blueScore}`;
    
    // Обновление статуса
    if (gameState === 'finished') {
        diceResult.innerText = "ИГРА ОКОНЧЕНА";
        if (!gameEndedAlertShown) {
            gameEndedAlertShown = true;
            const winner = redScore > blueScore ? "КРАСНЫЕ" : (blueScore > redScore ? "СИНИЕ" : "НИЧЬЯ");
            setTimeout(() => {
                if (confirm(`МЕСТА НЕТ!\nПобедитель: ${winner}\nСчет: ${redScore} - ${blueScore}\nСыграть снова?`)) {
                    window.resetGame();
                }
            }, 500);
        }
    } else {
        gameEndedAlertShown = false;
        diceResult.innerText = (currentTurn === myRole) ? `Ваш ход! (Выпало: ${data.lastDice || '?'})` : `Ход противника...`;
    }
});

function renderFixedRectangle(f) {
    const rect = document.createElement('div');
    rect.classList.add('rectangle', 'fixed');
    rect.style.width = `${f.width * 20 - 4}px`;
    rect.style.height = `${f.height * 20 - 4}px`;
    rect.style.left = `${f.x * 20 + 2}px`;
    rect.style.top = `${f.y * 20 + 2}px`;
    rect.style.backgroundColor = f.color === 'red' ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 0, 255, 0.8)';
    gridElement.appendChild(rect);
}

// 5. ЛОГИКА БРОСКА И ХОДА
window.rollDice = function() {
    if (currentTurn !== myRole) {
        alert("Сейчас ход противника!");
        return;
    }
    if (activeRectElement) {
        alert("Фигура уже на поле!");
        return;
    }

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    currentDice = { w: d1, h: d2 };

    // Проверка на конец игры
    if (!canFitAnywhere(d1, d2)) {
        update(ref(db), { 
            gameState: "finished",
            lastDice: `${d1}x${d2} (Не влезло)`
        });
        return;
    }

    update(ref(db), { lastDice: `${d1}x${d2}` });
    createDraggableRectangle(d1, d2);
};

function createDraggableRectangle(w, h) {
    activeRectElement = document.createElement('div');
    activeRectElement.classList.add('rectangle');
    activeRectElement.style.width = `${w * 20 - 4}px`;
    activeRectElement.style.height = `${h * 20 - 4}px`;
    activeRectElement.style.backgroundColor = myRole === 'red' ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 0, 255, 0.5)';
    activeRectElement.style.left = '0px';
    activeRectElement.style.top = '0px';
    gridElement.appendChild(activeRectElement);

    let isDragging = false;

    activeRectElement.onpointerdown = (e) => {
        if (e.target.tagName === 'BUTTON') return; 
        isDragging = true;
        activeRectElement.setPointerCapture(e.pointerId);
    };

    activeRectElement.onpointermove = (e) => {
        if (!isDragging) return;
        const rect = gridElement.getBoundingClientRect();
        let x = e.clientX - rect.left - (currentDice.w * 20) / 2;
        let y = e.clientY - rect.top - (currentDice.h * 20) / 2;

        let gridX = Math.round(x / 20) * 20;
        let gridY = Math.round(y / 20) * 20;

        gridX = Math.max(0, Math.min(gridX, (20 - currentDice.w) * 20));
        gridY = Math.max(0, Math.min(gridY, (20 - currentDice.h) * 20));

        activeRectElement.style.left = `${gridX}px`;
        activeRectElement.style.top = `${gridY}px`;
    };

    activeRectElement.onpointerup = (e) => {
        if (!isDragging) return;
        isDragging = false;
        activeRectElement.releasePointerCapture(e.pointerId);
        showConfirmButton();
    };
}

function showConfirmButton() {
    if (activeRectElement.querySelector('.confirm-button')) return;
    const btn = document.createElement('button');
    btn.innerText = 'OK';
    btn.classList.add('confirm-button');
    btn.onclick = (e) => {
        e.stopPropagation();
        finishMove();
    };
    activeRectElement.appendChild(btn);
}

function finishMove() {
    const x = Math.round(parseInt(activeRectElement.style.left) / 20);
    const y = Math.round(parseInt(activeRectElement.style.top) / 20);
    const w = currentDice.w;
    const h = currentDice.h;

    if (!canPlaceRectangle(x, y, w, h)) {
        alert("Место занято или выходит за границы!");
        return;
    }

    const newFigKey = Date.now();
    const nextTurn = myRole === 'red' ? 'blue' : 'red';
    
    const updates = {};
    updates[`/figures/${newFigKey}`] = { x, y, width: w, height: h, color: myRole };
    updates[`/turn`] = nextTurn;

    update(ref(db), updates).then(() => {
        activeRectElement.remove();
        activeRectElement = null;
    });
}

document.getElementById("rotateButton").onclick = () => {
    if (!activeRectElement) return;
    [currentDice.w, currentDice.h] = [currentDice.h, currentDice.w];
    activeRectElement.style.width = `${currentDice.w * 20 - 4}px`;
    activeRectElement.style.height = `${currentDice.h * 20 - 4}px`;
};

window.resetGame = function() {
    if (confirm("Сбросить игру для всех?")) {
        set(ref(db), {
            turn: 'red',
            figures: {},
            lastDice: '?',
            gameState: 'playing'
        });
    }
};