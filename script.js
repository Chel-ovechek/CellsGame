const grid = document.getElementById('grid');
    const diceResult = document.getElementById('diceResult');
    let currentWidth = 0, currentHeight = 0;
    let isDragging = false, offsetX = 0, offsetY = 0;
    let rectangle = null;
    let rotated = false;
    let colorToggle = true; // Чередование цветов
    let occupiedCells = new Set(); // Заполненные клетки

    // Создание поля 10x10
    const cells = [];
    for (let i = 0; i < 20*20; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.index = i; // Индекс клетки
        // cell.textContent = i; // Пронумеровываем каждую клетку
        grid.appendChild(cell);
        cells.push(cell);
    }

    // Бросок кубиков и создание новой фигуры
    function rollDice() {
        if (rectangle && !rectangle.classList.contains('fixed')) {
            alert("Сначала поставьте текущую фигуру!");
            return;
        }

        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        currentWidth = dice1;
        currentHeight = dice2;
        diceResult.textContent = `Выпало: ${currentWidth} x ${currentHeight}`;
        
        // Проверяем, есть ли место для новой фигуры
        if (!hasSpaceForRectangle(currentWidth, currentHeight)) {
            alert("Нет места для новой фигуры!");
            return;
        }

        createRectangle(currentWidth, currentHeight);
    }

    // Создание новой фигуры
    function createRectangle(width, height) {
        rectangle = document.createElement('div');
        rectangle.classList.add('rectangle');
        rectangle.style.width = `${width * 40-5}px`;
        rectangle.style.height = `${height * 40-5}px`;
        rectangle.style.left = '0px';
        rectangle.style.top = '0px';
        rectangle.style.backgroundColor = colorToggle ? '#0307ff81' : '#ff000081';
        rectangle.style.borderColor = colorToggle ? 'darkblue' : 'darkred';
        colorToggle = !colorToggle; // Переключаем цвет

        grid.appendChild(rectangle);

        rectangle.addEventListener('mousedown', startDrag);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('mousemove', drag);
        document.addEventListener('keydown', rotateRectangle);
    }

    // Перетаскивание фигуры
    function startDrag(event) {
        if (rectangle.classList.contains('fixed')) return;

        isDragging = true;
        offsetX = event.clientX - rectangle.getBoundingClientRect().left;
        offsetY = event.clientY - rectangle.getBoundingClientRect().top;
    }

    function stopDrag() {
        if (!isDragging) return;
        isDragging = false;
        snapToGrid();
    }

    function drag(event) {
        if (!isDragging) return;
        let x = event.clientX - offsetX - grid.getBoundingClientRect().left;
        let y = event.clientY - offsetY - grid.getBoundingClientRect().top;

        x = Math.max(0, Math.min(x, 20 * 40 - rectangle.offsetWidth)+20);
        y = Math.max(0, Math.min(y, 20 * 40 - rectangle.offsetHeight)+20);

        rectangle.style.left = `${x}px`;
        rectangle.style.top = `${y}px`;
    }

    // Привязка к сетке и установка фигуры
    function snapToGrid() {
        let left = parseInt(rectangle.style.left);
        let top = parseInt(rectangle.style.top);
    
        let gridX = Math.round(left / 40);
        let gridY = Math.round(top / 40);
    
        // Проверяем, можно ли поставить фигуру в это место
        if (!canPlaceRectangle(gridX, gridY, currentWidth, currentHeight) && !canPlaceRectangle(gridX, gridY, currentHeight, currentWidth)) {
            alert("Нельзя разместить фигуру здесь!");
            return;
        }
    
        // Исправление: привязка координат к сетке точно по её границам
        rectangle.style.left = `${gridX * 40 +3}px`;
        rectangle.style.top = `${gridY * 40 +3}px`;
    
        // Фиксируем фигуру
        rectangle.classList.add('fixed');
        rectangle.style.cursor = 'default';
    
        markOccupiedCells(gridX, gridY, currentWidth, currentHeight);
    }

    // Поворот фигуры
    document.getElementById("rotateButton").addEventListener("click", rotateRectangle);

    function rotateRectangle() {
        if (!rectangle || rectangle.classList.contains("fixed")) return; // Если фигуры нет или она поставлена, ничего не делаем
    
        // Получаем текущие размеры
        let width = rectangle.offsetWidth;
        
        let height = rectangle.offsetHeight;
    
        // Меняем ширину и высоту местами
        rectangle.style.width = `${height-4.5}px`;
        rectangle.style.height = `${width-4.5}px`;
    
    }

    // Проверяет, можно ли поставить фигуру
    function canPlaceRectangle(gridX, gridY, width, height) {
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                let cellIndex = (gridY + i-1) * 20 + (gridX + j);
                if (occupiedCells.has(cellIndex) || gridX + width > 20 || gridY + height > 20) {
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
                let cellIndex = (gridY + i-1) * 20 + (gridX + j);
                occupiedCells.add(cellIndex);
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