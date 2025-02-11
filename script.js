const grid = document.getElementById('grid');
const diceResult = document.getElementById('diceResult');
let currentWidth = 0, currentHeight = 0;
let isDragging = false, offsetX = 0, offsetY = 0;
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

// Создание новой фигуры
function createRectangle(width, height) {
    rectangle = document.createElement('div');
    rectangle.classList.add('rectangle');
    updateRectangleStyle(rectangle, width, height, 120, 0, colorToggle);
    colorToggle = !colorToggle; // Переключаем цвет

    grid.appendChild(rectangle);

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

// Обновление стилей для прямоугольника
function updateRectangleStyle(rectangle, width, height, left, top, colorToggle) {
    rectangle.style.width = `${width * 20 - 8}px`;
    rectangle.style.height = `${height * 20 - 8}px`;
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

    // Исправление: привязка координат к сетке точно по её границам
    rectangle.style.left = `${gridX * 20 + 3}px`;
    rectangle.style.top = `${gridY * 20 + 3}px`;

    // Проверяем, можно ли поставить фигуру в это место
    if (!canPlaceRectangle(gridX, gridY, currentWidth, currentHeight)) {
        alert("Нельзя разместить фигуру здесь!");
        return;
    }

    // Фиксируем фигуру
    rectangle.classList.add('fixed');
    rectangle.style.cursor = 'default';

    markOccupiedCells(gridX, gridY, currentWidth, currentHeight);
}

// Поворот фигуры
function rotateRectangle() {
    if (!rectangle || rectangle.classList.contains("fixed")) return;

    // Получаем текущие размеры
    let width = rectangle.clientWidth;
    let height = rectangle.clientHeight;

    // Меняем ширину и высоту местами
    rectangle.style.width = `${height}px`;
    rectangle.style.height = `${width}px`;

    currentWidth = height / 20; // Обновляем размеры для дальнейшего использования
    currentHeight = width / 20;
}

// Проверяет, можно ли поставить фигуру
function canPlaceRectangle(gridX, gridY, width, height) {
    if (gridX + width > 20 || gridY + height > 20) return false;

    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            if (occupiedGrid[gridY + i][gridX + j]) {
                return false;
            }
        }
    }
    return true;
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
    for (let y = 0; y <= 20 - height; y++) {
        for (let x = 0; x <= 20 - width; x++) {
            if (canPlaceRectangle(x, y, width, height)) {
                return true;
            }
        }
    }
    return false;
}