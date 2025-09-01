// Import dependencies
import { state } from './stateManager.js';
import { elements } from './domElements.js';

// === CELL CLASS WIDGET FUNCTIONS ===
function populateCellClassWidget() {
    if (!state.allCellClasses || state.allCellClasses.size === 0) {
        elements.cellClassList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No cell classes available</div>';
        return;
    }
    
    const cellClasses = Array.from(state.allCellClasses).sort();
    
    // Don't modify selectedCellClasses here - preserve the current state
    
    elements.cellClassList.innerHTML = '';
    
    cellClasses.forEach(cellClass => {
        const item = document.createElement('div');
        item.className = 'gene-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'gene-checkbox';
        checkbox.checked = state.selectedCellClasses.has(cellClass);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                state.selectedCellClasses.add(cellClass);
            } else {
                state.selectedCellClasses.delete(cellClass);
            }
            window.updateAllLayers();
            updateToggleAllCellClassesButton();
            
            // Sync to undocked window if it exists
            if (window.undockedCellClassWindow && !window.undockedCellClassWindow.closed) {
                const checkboxes = elements.cellClassList.querySelectorAll('.gene-checkbox');
                const checkboxStates = Array.from(checkboxes).map(cb => cb.checked);
                window.undockedCellClassWindow.postMessage({
                    type: 'updateCheckboxes',
                    checkboxStates: checkboxStates
                }, '*');
            }
        });
        
        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'gene-glyph';
        const color = state.cellClassColors.get(cellClass) || [192, 192, 192];
        colorSwatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        
        const name = document.createElement('span');
        name.className = 'gene-name';
        name.textContent = cellClass;
        
        item.appendChild(checkbox);
        item.appendChild(colorSwatch);
        item.appendChild(name);
        
        elements.cellClassList.appendChild(item);
    });
    
    updateToggleAllCellClassesButton();
}

function updateToggleAllCellClassesButton() {
    // Safety check: if allCellClasses hasn't been populated yet, show default state
    if (!state.allCellClasses || state.allCellClasses.size === 0) {
        elements.toggleAllCellClasses.textContent = 'Select All';
        elements.toggleAllCellClasses.className = 'toggle-all-btn';
        return;
    }
    
    const allSelected = state.selectedCellClasses.size === state.allCellClasses.size;
    elements.toggleAllCellClasses.textContent = allSelected ? 'Unselect All' : 'Select All';
    elements.toggleAllCellClasses.className = allSelected ? 'toggle-all-btn unselect' : 'toggle-all-btn';
}

function toggleAllCellClasses() {
    const shouldSelectAll = state.selectedCellClasses.size !== state.allCellClasses.size;
    
    if (shouldSelectAll) {
        state.allCellClasses.forEach(cellClass => state.selectedCellClasses.add(cellClass));
    } else {
        state.selectedCellClasses.clear();
    }
    
    // Update all checkboxes in the widget
    const checkboxes = elements.cellClassList.querySelectorAll('.gene-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = shouldSelectAll;
    });
    
    window.updateAllLayers();
    updateToggleAllCellClassesButton();
    
    // Sync to undocked window if it exists
    if (window.undockedCellClassWindow && !window.undockedCellClassWindow.closed) {
        const checkboxes = elements.cellClassList.querySelectorAll('.gene-checkbox');
        const checkboxStates = Array.from(checkboxes).map(cb => cb.checked);
        window.undockedCellClassWindow.postMessage({
            type: 'updateCheckboxes',
            checkboxStates: checkboxStates
        }, '*');
    }
}

function showCellClassWidget() {
    elements.cellClassWidget.classList.remove('hidden');
    elements.cellClassWidgetBackdrop.classList.remove('hidden');
    populateCellClassWidget();
    setupCellClassDragFunctionality();
}

function hideCellClassWidget() {
    elements.cellClassWidget.classList.add('hidden');
    elements.cellClassWidgetBackdrop.classList.add('hidden');
}

function setupCellClassDragFunctionality() {
    const widget = elements.cellClassWidget;
    const header = widget.querySelector('.gene-widget-header');
    let isDragging = false;
    let currentX = window.innerWidth - 420; // Start from right side
    let currentY = 100; // Start from top
    let initialX = 0;
    let initialY = 0;
    
    // Set initial position
    widget.style.left = currentX + 'px';
    widget.style.top = currentY + 'px';
    
    function dragStart(e) {
        if (e.target.tagName === 'BUTTON') return;
        
        initialX = e.clientX - currentX;
        initialY = e.clientY - currentY;
        
        if (e.target === header || header.contains(e.target)) {
            isDragging = true;
            widget.classList.add('dragging');
        }
    }
    
    function dragEnd() {
        isDragging = false;
        widget.classList.remove('dragging');
    }
    
    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            widget.style.left = currentX + 'px';
            widget.style.top = currentY + 'px';
        }
    }
    
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
}

function undockCellClassWidget() {
    // Create a new window with the cell class list
    const newWindow = window.open('', 'CellClassPanel', 'width=450,height=600,scrollbars=yes');
    
    // Store reference to undocked window
    window.undockedCellClassWindow = newWindow;
    
    if (newWindow) {
        newWindow.document.write(`
            <html>
                <head>
                    <title>Cell Class Panel</title>
                    <style>
                        body { 
                            margin: 0; 
                            padding: 20px; 
                            background: #1a1a1a; 
                            color: white; 
                            font-family: Arial, sans-serif; 
                        }
                        .gene-widget-content { 
                            max-height: none; 
                            overflow-y: auto; 
                        }
                        .gene-item {
                            display: flex;
                            align-items: center;
                            padding: 8px 0;
                            cursor: pointer;
                            transition: background-color 0.15s ease;
                            gap: 12px;
                        }
                        .gene-item:hover {
                            background: rgba(255, 255, 255, 0.05);
                        }
                        .gene-checkbox {
                            transform: scale(1.1);
                            accent-color: #007bff;
                        }
                        .gene-glyph {
                            width: 20px;
                            height: 20px;
                            border-radius: 2px;
                            background: rgba(255, 255, 255, 0.1);
                            flex-shrink: 0;
                        }
                        .gene-name {
                            color: white;
                            font-size: 13px;
                            font-family: monospace;
                            flex: 1;
                        }
                        h3 {
                            color: #0066cc;
                            margin-bottom: 20px;
                            border-bottom: 1px solid #333;
                            padding-bottom: 10px;
                        }
                        .gene-widget-search {
                            padding: 16px 0;
                            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                            display: flex;
                            gap: 12px;
                            align-items: center;
                            margin-bottom: 20px;
                        }
                        .gene-widget-search input {
                            flex: 1;
                            padding: 10px 12px;
                            background: rgba(255, 255, 255, 0.1);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            border-radius: 6px;
                            color: white;
                            font-size: 14px;
                            outline: none;
                        }
                        .gene-widget-search input::placeholder {
                            color: rgba(255, 255, 255, 0.5);
                        }
                        .gene-widget-search input:focus {
                            border-color: #007bff;
                            box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
                        }
                        .toggle-all-btn {
                            padding: 8px 16px;
                            background: #007bff;
                            border: none;
                            border-radius: 4px;
                            color: white;
                            font-size: 12px;
                            font-weight: 500;
                            cursor: pointer;
                            white-space: nowrap;
                            transition: background-color 0.15s ease;
                        }
                        .toggle-all-btn:hover {
                            background: #0056b3;
                        }
                        .toggle-all-btn.unselect {
                            background: #dc3545;
                        }
                        .toggle-all-btn.unselect:hover {
                            background: #c82333;
                        }
                    </style>
                </head>
                <body>
                    <h3>🔬 Cell Class Panel</h3>
                    <div class="gene-widget-search">
                        <input type="text" id="undockedCellClassSearch" placeholder="Search cell classes..."/>
                        <button id="undockedToggleAllCellClasses" class="toggle-all-btn">Unselect All</button>
                    </div>
                    <div class="gene-widget-content" id="undockedCellClassList"></div>
                    <script>
                        // Copy the current cell class list content
                        document.getElementById('undockedCellClassList').innerHTML = ${JSON.stringify(elements.cellClassList.innerHTML)};
                        
                        // Add event listeners to the new checkboxes
                        const checkboxes = document.querySelectorAll('.gene-checkbox');
                        checkboxes.forEach((checkbox, index) => {
                            checkbox.addEventListener('change', () => {
                                // Send message back to parent window
                                window.opener.postMessage({
                                    type: 'cellClassToggle',
                                    index: index,
                                    checked: checkbox.checked
                                }, '*');
                            });
                        });
                        
                        // Add search functionality
                        const searchInput = document.getElementById('undockedCellClassSearch');
                        searchInput.addEventListener('input', (e) => {
                            const term = e.target.value.toLowerCase();
                            const items = document.querySelectorAll('.gene-item');
                            items.forEach(item => {
                                const cellClassName = item.querySelector('.gene-name').textContent.toLowerCase();
                                if (cellClassName.includes(term)) {
                                    item.style.display = 'flex';
                                } else {
                                    item.style.display = 'none';
                                }
                            });
                        });
                        
                        // Add toggle all functionality
                        const toggleAllBtn = document.getElementById('undockedToggleAllCellClasses');
                        toggleAllBtn.addEventListener('click', () => {
                            // Send message back to parent window
                            window.opener.postMessage({
                                type: 'cellClassToggleAll'
                            }, '*');
                        });
                        
                        // Update toggle button based on current state
                        function updateToggleButton() {
                            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                            toggleAllBtn.textContent = allChecked ? 'Unselect All' : 'Select All';
                            toggleAllBtn.className = allChecked ? 'toggle-all-btn unselect' : 'toggle-all-btn';
                        }
                        
                        // Initial update
                        updateToggleButton();
                        
                        // Listen for checkbox changes to update toggle button
                        checkboxes.forEach(checkbox => {
                            checkbox.addEventListener('change', updateToggleButton);
                        });
                        
                        // Listen for messages from parent window
                        window.addEventListener('message', (event) => {
                            if (event.data.type === 'updateCheckboxes') {
                                event.data.checkboxStates.forEach((checked, index) => {
                                    if (checkboxes[index]) {
                                        checkboxes[index].checked = checked;
                                    }
                                });
                                updateToggleButton();
                            }
                        });
                    <\/script>
                </body>
            </html>
        `);
        newWindow.document.close();
        
        // Send initial checkbox states to undocked window
        setTimeout(() => {
            if (window.undockedCellClassWindow && !window.undockedCellClassWindow.closed) {
                const checkboxes = elements.cellClassList.querySelectorAll('.gene-checkbox');
                const checkboxStates = Array.from(checkboxes).map(cb => cb.checked);
                window.undockedCellClassWindow.postMessage({
                    type: 'updateCheckboxes',
                    checkboxStates: checkboxStates
                }, '*');
            }
        }, 100);
        
        // Listen for messages from the undocked window
        const messageHandler = (event) => {
            if (event.data.type === 'cellClassToggle') {
                const checkboxes = elements.cellClassList.querySelectorAll('.gene-checkbox');
                const checkbox = checkboxes[event.data.index];
                if (checkbox) {
                    checkbox.checked = event.data.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            } else if (event.data.type === 'cellClassToggleAll') {
                // Handle toggle all from undocked window
                toggleAllCellClasses();
                
                // Send updated state back to undocked window
                setTimeout(() => {
                    if (window.undockedCellClassWindow && !window.undockedCellClassWindow.closed) {
                        const checkboxes = elements.cellClassList.querySelectorAll('.gene-checkbox');
                        const checkboxStates = Array.from(checkboxes).map(cb => cb.checked);
                        window.undockedCellClassWindow.postMessage({
                            type: 'updateCheckboxes',
                            checkboxStates: checkboxStates
                        }, '*');
                    }
                }, 50);
            }
        };
        
        window.addEventListener('message', messageHandler);
        
        hideCellClassWidget();
    }
}

function filterCellClasses(searchTerm) {
    const items = elements.cellClassList.querySelectorAll('.gene-item');
    const term = searchTerm.toLowerCase();
    
    items.forEach(item => {
        const cellClassName = item.querySelector('.gene-name').textContent.toLowerCase();
        if (cellClassName.includes(term)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Expose functions globally for event handlers
window.showCellClassWidget = showCellClassWidget;
window.hideCellClassWidget = hideCellClassWidget;
window.filterCellClasses = filterCellClasses;
window.toggleAllCellClasses = toggleAllCellClasses;
window.undockCellClassWidget = undockCellClassWidget;

export {
    populateCellClassWidget,
    updateToggleAllCellClassesButton,
    toggleAllCellClasses,
    showCellClassWidget,
    hideCellClassWidget,
    setupCellClassDragFunctionality,
    undockCellClassWidget,
    filterCellClasses
};