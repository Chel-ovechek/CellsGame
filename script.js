// Импорт нужных модулей Firebase
import { initializeApp} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-database.js";

// Firebase конфигурация (бери из своей консоли Firebase)
const firebaseConfig = {
apiKey: "AIzaSyBoDZITlAQRzK6D7rxOAHUMMSzXk1htu94",
authDomain: "cellsgame-f7561.firebaseapp.com",
databaseURL: "https://cellsgame-f7561-default-rtdb.firebaseio.com",  // Добавь URL реального времени
projectId: "cellsgame-f7561",
storageBucket: "cellsgame-f7561.appspot.com",
messagingSenderId: "192058456770",
appId: "1:192058456770:web:37ee69d5e45823807dd95b",
measurementId: "G-HN8ZBPW1WP"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Подписка на изменения в Firebase (в реальном времени)
onValue(ref(db, "test/"), (snapshot) => {
    const data = snapshot.val();
    if (data) {
        console.log("🔥 Обновленные данные:", data);
    } else {
        console.warn("⚠️ Нет данных в Firebase!");
    }
});

const grid = document.getElementById('grid');
const diceResult = document.getElementById('diceResult');
let currentWidth = 0, currentHeight = 0;
let offsetX = 0, offsetY = 0;
let rectangle = null;
let colorToggle = true; // Чередование цветов
let occupiedGrid = Array(20).fill().map(() => Array(20).fill(false)); // Занятые клетки

// Создание поля 20x20
const cells = [];
for (let i = 0; i < 20 * 20; i++) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.dataset.index = i;
    grid.appendChild(cell);
    cells.push(cell);
}

// Функция для создания поля 20x20
function createField() {
    for (let gridX = 0; gridX < 20; gridX++) {
        for (let gridY = 0; gridY < 20; gridY++) {
            set(ref(db, `gameField/${gridX}-${gridY}`), {

                color: 'white' // Цвет клетки по умолчанию
            }).then(() => {
                console.log(`Cell ${gridX}-${gridY} created`);
            }).catch(error => {
                console.error("Error creating cell:", error);
            });
        }
    }
}

// Вызов функции
createField();

// Бросок кубиков и создание новой фигуры
function rollDice() {
    if (rectangle && !rectangle.classList.contains('fixed')) {
        alert("Сначала поставьте текущую фигуру!");
        return;
    }

    const [dice1, dice2] = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    currentWidth = dice1;
    currentHeight = dice2;
    diceResult.textContent = `Выпало: ${currentWidth} x ${currentHeight}`;

    // Проверяем, есть ли место для новой фигуры
    if (![currentWidth, currentHeight].some(w => hasSpaceForRectangle(w, w === currentWidth ? currentHeight : currentWidth))) {
        alert("Нет места для новой фигуры!");
        return;
    }

    createRectangle(currentWidth, currentHeight);
}

window.rollDice = rollDice;

// Функция перезапуска игры
async function resetGame() {
    try {
        await set(ref(db, "gameField"), null);
        await set(ref(db, "figures"), null);
        await set(ref(db, "lastMove"), null);
        console.log("🗑️ Firebase очищен");
    } catch (error) {
        console.error("❌ Ошибка очистки Firebase: ", error);
    }

    // Очистка UI
    document.querySelectorAll('.rectangle').forEach(rect => rect.remove());
    occupiedGrid = Array(20).fill().map(() => Array(20).fill(false));
    diceResult.textContent = "Бросьте кубики!";
    console.log("🔄 Игра перезапущена!");
}

// ✅ Делаем функцию глобальной
window.resetGame = resetGame;

async function getInitialColor() {
    let storedColor = localStorage.getItem("userColor");
    if (storedColor) return storedColor; // Если цвет уже сохранен, используем его

    return new Promise((resolve) => {
        onValue(ref(db, "figures"), (snapshot) => {
            let redCount = 0;
            let blueCount = 0;

            if (snapshot.exists()) {
                const figures = snapshot.val();
                for (let key in figures) {
                    if (figures[key].color === "red") redCount++;
                    if (figures[key].color === "blue") blueCount++;
                }
            }

            let userColor = redCount === blueCount ? "blue" : "red";
            localStorage.setItem("userColor", userColor);
            resolve(userColor);
        }, { onlyOnce: true });
    });
}

async function canMakeMove(userColor) {
    return new Promise((resolve) => {
        onValue(ref(db, "lastMove"), (snapshot) => {
            let lastMoveColor = snapshot.val();
            resolve(lastMoveColor !== userColor); // Можно ходить, если последний ход был другого цвета
        }, { onlyOnce: true });
    });
}

async function createRectangle(width, height) {
    const userColor = await getInitialColor(); // Получаем цвет устройства
    const moveAllowed = await canMakeMove(userColor); // Проверяем, можно ли ходить

    if (!moveAllowed) {
        alert("Сейчас не ваш ход! Дождитесь хода противника.");
        return;
    }

    rectangle = document.createElement('div');
    rectangle.classList.add('rectangle');
    updateRectangleStyle(rectangle, width, height, 120, 0, userColor === "red");

    grid.appendChild(rectangle);

    // Сохраняем информацию о ходе в Firebase
    set(ref(db, "lastMove"), userColor);

    // Добавляем обработчики событий для перетаскивания
    rectangle.addEventListener('mousedown', startDragCommon);
    document.addEventListener('mouseup', stopDragCommon);
    document.addEventListener('mousemove', dragCommon);

    rectangle.addEventListener('touchstart', startDragCommon);
    document.addEventListener('touchend', stopDragCommon);
    document.addEventListener('touchmove', dragCommon);

    // Добавляем обработчик для вращения
    document.getElementById("rotateButton").addEventListener("click", rotateRectangle);
}


window.createRectangle = createRectangle;

// Обновление стилей для прямоугольника
function updateRectangleStyle(rectangle, width, height, left, top, colorToggle) {
    rectangle.style.width = `${width * 20-4}px`;
    rectangle.style.height = `${height * 20-4}px`;
    rectangle.style.left = `${left}px`;
    rectangle.style.top = `${top}px`;
    rectangle.style.backgroundColor = colorToggle ? '#0307ff81' : '#ff000081';
    rectangle.style.borderColor = colorToggle ? 'darkblue' : 'darkred';
}

// Перетаскивание фигуры (универсальное для мыши и тачскринов)
let activeRectangle = null;
function startDragCommon(event) {
    let target = event.target.closest('.rectangle');
    if (!target || target.classList.contains('fixed')) return;

    activeRectangle = target;
    let rect = target.getBoundingClientRect();
    offsetX = (event.clientX || event.touches[0].clientX) - rect.left;
    offsetY = (event.clientY || event.touches[0].clientY) - rect.top;

    activeRectangle.style.position = 'absolute';
    activeRectangle.style.zIndex = '1000'; // Устанавливаем высокий z-index, чтобы фигура была поверх других
}

function dragCommon(event) {
    if (!activeRectangle) return;

    let x = (event.clientX || event.touches[0].clientX) - offsetX;
    let y = (event.clientY || event.touches[0].clientY) - offsetY;

    // Получаем координаты родительского элемента grid
    let gridRect = grid.getBoundingClientRect();

    // Корректируем x и y, чтобы фигура не выходила за пределы grid
    x = Math.max(gridRect.left, Math.min(x, gridRect.right - activeRectangle.offsetWidth));
    y = Math.max(gridRect.top, Math.min(y, gridRect.bottom - activeRectangle.offsetHeight));

    // Вычисляем позицию относительно самой сетки
    x -= gridRect.left;
    y -= gridRect.top;

    activeRectangle.style.left = `${x}px`;
    activeRectangle.style.top = `${y}px`;
}

function stopDragCommon() {
    if (!activeRectangle) return;

    // Фиксируем фигуру
    snapToGrid();

    // Вернуть нормальный z-index после завершения перетаскивания
    activeRectangle.style.zIndex = '';

    activeRectangle = null;
}



// Привязка к сетке и установка фигуры
function snapToGrid() {
    let left = parseInt(rectangle.style.left);
    let top = parseInt(rectangle.style.top);
    let gridX = Math.round(left / 20);
    let gridY = Math.round(top / 20);

    rectangle.style.left = `${gridX * 20 + 3}px`;
    rectangle.style.top = `${gridY * 20 + 3}px`;

    if (!canPlaceRectangle(gridX, gridY, currentWidth, currentHeight)) {
        alert("Нельзя разместить фигуру здесь!");
        return;
    }
    
    
    let confirmButton = null;
    function butConfirm(){
        // Добавляем кнопку подтверждения
        confirmButton = document.createElement("button");
        confirmButton.innerText = "✔";
        confirmButton.classList.add("confirm-button");

        // Размещаем кнопку в центре фигуры
        confirmButton.style.position = "absolute";
        confirmButton.style.left = `${rectangle.clientWidth / 2 - 10}px`;
        confirmButton.style.top = `${rectangle.clientHeight / 2 - 10}px`;

        // Добавляем кнопку в фигуру
        rectangle.appendChild(confirmButton);
    }

    butConfirm();

    // При нажатии фигура фиксируется
    confirmButton.addEventListener("click", () => {
        rectangle.classList.add('fixed');
        rectangle.style.cursor = 'default';
        markOccupiedCells(gridX, gridY, currentWidth, currentHeight);
        confirmButton.remove(); // Удаляем кнопку после подтверждения

        // ✅ Отправляем данные в Firebase
        set(ref(db, `figures/${gridX}-${gridY}`), {
            x: gridX,
            y: gridY,
            width: currentWidth,
            height: currentHeight,
            color: colorToggle ? 'red' : 'blue'
        })
        .then(() => console.log("✅ Фигура сохранена в Firebase"))
        .catch((error) => console.error("❌ Ошибка сохранения в Firebase: ", error));
    });
};

onValue(ref(db, "gameField"), (snapshot) => {
    try {
        if (!snapshot.exists()) {
            console.warn("⚠️ Данные gameField не найдены.");
            return;
        }

        const field = snapshot.val();
        const grid = document.getElementById("grid");

        grid.innerHTML = ''; // Очищаем перед отрисовкой

        for (let key in field) {
            const { x, y, width, height, color } = field[key];

            let cell = document.createElement('div');
            cell.classList.add('cell');
            cell.style.backgroundColor = color;
            cell.style.border = "1px solid #aaa";

            grid.appendChild(cell);
        }
    } catch (error) {
        console.error("❌ Ошибка в обработке onValue (gameField):", error);
    }

    // Теперь слушаем "figures" и добавляем их на поле
    onValue(ref(db, "figures"), (snapshot) => {
        try {
            if (!snapshot.exists()) {
                console.warn("⚠️ Нет данных в figures.");
                return;
            }
            
            const figures = snapshot.val();
            console.log("Получены данные figures:", figures);
        } catch (error) {
            console.error("❌ Ошибка при обработке данных:", error);
        }

        const figures = snapshot.val();
        let redCount = 0;
        let blueCount = 0;
                const redCounter = document.getElementById("red");
        const blueCounter = document.getElementById("blue");
        for (let key in figures) {
            const { x, y, width, height, color } = figures[key];

            let newRect = document.createElement('div');
            newRect.classList.add('rectangle', 'fixed');
            newRect.style.width = `${width * 20 - 5}px`;
            newRect.style.height = `${height * 20 - 5}px`;
            newRect.style.left = `${x * 20 + 3}px`;
            newRect.style.top = `${y * 20 + 3}px`;
            newRect.style.backgroundColor = color;
            newRect.style.cursor = 'default';

            if (color === "red") redCount+= width*height;
            if (color === "blue") blueCount+= width*height;

            grid.appendChild(newRect);
        }
            // Обновляем текст счётчиков
        redCounter.innerText = `Красных клеток: ${redCount}`;
        blueCounter.innerText = `Синих клеток: ${blueCount}`;
    });
});


// Поворот фигуры
function rotateRectangle() {
    if (!rectangle || rectangle.classList.contains("fixed")) return;

    // Удаляем старую кнопку подтверждения, если она есть
    const oldConfirmButton = rectangle.querySelector(".confirm-button");
    if (oldConfirmButton) {
        oldConfirmButton.remove();
    }

    // Получаем текущие размеры
    let width = rectangle.clientWidth;
    let height = rectangle.clientHeight;

    // Меняем ширину и высоту местами
    rectangle.style.width = `${height}px`;
    rectangle.style.height = `${width}px`;

    currentWidth = Math.round(height / 20);
    currentHeight = Math.round(width / 20);

    // Создаём новую кнопку подтверждения
    butConfirm();
}

// Проверяет, можно ли поставить фигуру
function canPlaceRectangle(gridX, gridY, width, height) {
    return !(gridX < 0 || gridY < 0 || gridX + width > 20 || gridY + height > 20 ||
        Array.from({ length: height }, (_, i) =>
            Array.from({ length: width }, (_, j) => occupiedGrid[gridY + i][gridX + j])
        ).some(row => row.some(cell => cell))
    );
}


// Помечает клетки как занятые
function markOccupiedCells(gridX, gridY, width, height) {
    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            occupiedGrid[gridY + i][gridX + j] = true;
        }
    }
}

// Проверяет, есть ли свободное место для новой фигуры
function hasSpaceForRectangle(width, height) {
    console.log("Проверяем наличие свободного места для:", width, "x", height);
    for (let y = 0; y <= 20 - height; y++) {
        for (let x = 0; x <= 20 - width; x++) {
            if (canPlaceRectangle(x, y, width, height)) {
                console.log("Нашли место:", x, y);
                return true;
            }
        }
    }
    console.log("Места нет");
    return false;
}