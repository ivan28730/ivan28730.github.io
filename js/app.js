'use strict';

(() => {
  const STORAGE_KEYS = {
    todos: 'dayboard.todos',
    notes: 'dayboard.notes',
    datasets: 'dayboard.datasets',
    activeDatasetId: 'dayboard.datasets.active',
    chartOptions: 'dayboard.chart.options'
  };

  const DEFAULT_CHART_OPTIONS = {
    showLegend: true,
    showGridX: true,
    showGridY: true,
    smoothLines: true,
    fillArea: false,
    stackedBars: false
  };

  const COLOR_PALETTES = {
    azure: ['#4c6ef5', '#339af0', '#5c7cfa', '#15aabf', '#82c91e', '#fcc419'],
    sunset: ['#f76707', '#f89222', '#ffa94d', '#ff6b6b', '#c92a2a', '#862e9c'],
    tropical: ['#12b886', '#0ca678', '#099268', '#51cf66', '#94d82d', '#ffd43b'],
    mono: ['#1f2937', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#f3f4f6'],
    citrus: ['#fab005', '#fd7e14', '#f76707', '#f08c00', '#ffd43b', '#94d82d']
  };

  const DEFAULT_PALETTE = 'azure';
  const chartIsAvailable = typeof Chart === 'function';

  function hexToRgba(hex, alpha = 1) {
    const normalized = hex.replace('#', '');
    const length = normalized.length;
    if (length !== 3 && length !== 6) {
      return hex;
    }
    const full = length === 3
      ? normalized.split('').map((char) => char + char).join('')
      : normalized;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const $ = (selector) => document.querySelector(selector);

  const todoForm = $('#todo-form');
  const todoInput = $('#todo-input');
  const todoList = $('#todo-list');
  const todoTemplate = $('#todo-item-template');

  const noteForm = $('#note-form');
  const noteTitleInput = $('#note-title');
  const noteBodyInput = $('#note-body');
  const noteList = $('#note-list');
  const noteTemplate = $('#note-card-template');

  const datasetForm = $('#dataset-form');
  const datasetNameInput = $('#dataset-name');
  const datasetChartTypeInput = $('#dataset-chart-type');
  const datasetList = $('#dataset-list');
  const datasetEmpty = $('#dataset-empty');
  const datasetEditor = $('#dataset-editor');
  const datasetTitle = $('#dataset-title');
  const datasetMeta = $('#dataset-meta');
  const datasetRenameBtn = $('#dataset-rename');
  const datasetDuplicateBtn = $('#dataset-duplicate');
  const datasetDeleteBtn = $('#dataset-delete');
  const datasetExportBtn = $('#dataset-export');
  const datasetImportInput = $('#dataset-import');
  const datapointForm = $('#datapoint-form');
  const datapointLabelInput = $('#datapoint-label');
  const datapointValueInput = $('#datapoint-value');
  const datapointList = $('#datapoint-list');
  const datasetSummary = $('#dataset-summary');
  const chartTypeSelect = $('#chart-type-select');
  const paletteSelect = $('#palette-select');
  const chartOptionsForm = $('#chart-options-form');
  const chartOptionLegend = $('#chart-option-legend');
  const chartOptionGridX = $('#chart-option-grid-x');
  const chartOptionGridY = $('#chart-option-grid-y');
  const chartOptionSmooth = $('#chart-option-smooth');
  const chartOptionFill = $('#chart-option-fill');
  const chartOptionStacked = $('#chart-option-stacked');
  const chartCanvas = $('#dataset-chart');
  const chartEmpty = $('#chart-empty');
  const chartContainer = chartCanvas ? chartCanvas.closest('.chart-area__inner') : null;

  let todos = [];
  let notes = [];
  let datasets = [];
  let activeDatasetId = null;
  let chartInstance = null;
  let chartOptions = { ...DEFAULT_CHART_OPTIONS };

  const chartState = {
    resizeObserver: null
  };

  function showChartPlaceholder(message) {
    if (!chartEmpty) {
      return;
    }
    chartEmpty.textContent = message;
    chartEmpty.classList.add('chart-empty--visible');
    if (chartCanvas) {
      chartCanvas.classList.add('chart-area__canvas--hidden');
    }
  }

  function hideChartPlaceholder() {
    if (!chartEmpty) {
      return;
    }
    chartEmpty.classList.remove('chart-empty--visible');
    chartEmpty.textContent = '';
    if (chartCanvas) {
      chartCanvas.classList.remove('chart-area__canvas--hidden');
    }
  }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `dataset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizePoint(point) {
    if (!point || typeof point.label !== 'string') {
      return null;
    }
    const label = point.label.trim();
    const value = Number(point.value);
    if (!label || !Number.isFinite(value)) {
      return null;
    }
    return { label, value };
  }

  function normalizeDataset(dataset) {
    if (!dataset || typeof dataset !== 'object') {
      return null;
    }

    const normalized = {
      id: dataset.id || generateId(),
      name: typeof dataset.name === 'string' && dataset.name.trim() ? dataset.name.trim() : 'Untitled dataset',
      chartType: ['bar', 'line', 'pie', 'doughnut', 'radar'].includes(dataset.chartType) ? dataset.chartType : 'bar',
      palette: COLOR_PALETTES[dataset.palette] ? dataset.palette : DEFAULT_PALETTE,
      points: Array.isArray(dataset.points) ? dataset.points.map(normalizePoint).filter(Boolean) : [],
      createdAt: typeof dataset.createdAt === 'number' ? dataset.createdAt : Date.now()
    };

    return normalized;
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEYS.todos, JSON.stringify(todos));
      window.localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
      window.localStorage.setItem(STORAGE_KEYS.datasets, JSON.stringify(datasets));
      window.localStorage.setItem(STORAGE_KEYS.activeDatasetId, activeDatasetId || '');
      window.localStorage.setItem(STORAGE_KEYS.chartOptions, JSON.stringify(chartOptions));
    } catch (error) {
      console.warn('Unable to save data:', error);
    }
  }

  function loadState() {
    try {
      const storedTodos = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.todos) || '[]');
      const storedNotes = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.notes) || '[]');
      const storedDatasets = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.datasets) || '[]');
      const storedActiveId = window.localStorage.getItem(STORAGE_KEYS.activeDatasetId) || '';
      const storedChartOptions = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.chartOptions) || 'null');

      todos = Array.isArray(storedTodos) ? storedTodos : [];
      notes = Array.isArray(storedNotes) ? storedNotes : [];
      datasets = Array.isArray(storedDatasets) ? storedDatasets.map(normalizeDataset).filter(Boolean) : [];
      chartOptions = storedChartOptions && typeof storedChartOptions === 'object'
        ? { ...DEFAULT_CHART_OPTIONS, ...storedChartOptions }
        : { ...DEFAULT_CHART_OPTIONS };

      if (datasets.some((dataset) => dataset.id === storedActiveId)) {
        activeDatasetId = storedActiveId;
      } else {
        activeDatasetId = datasets[0]?.id || null;
      }
    } catch (error) {
      console.warn('Unable to load saved data:', error);
      todos = [];
      notes = [];
      datasets = [];
      activeDatasetId = null;
      chartOptions = { ...DEFAULT_CHART_OPTIONS };
    }
  }

  function formatValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return '';
    }
    return Number.isInteger(number)
      ? number.toString()
      : number.toFixed(2).replace(/\.?0+$/, '');
  }

  function buildDatasetMeta(dataset) {
    const count = dataset.points.length;
    const paletteName = paletteLabel(dataset.palette);
    const typeLabel = describeChartType(dataset.chartType);
    if (!count) {
      return `No data points yet • ${typeLabel} • ${paletteName}`;
    }
    return `${count} ${count === 1 ? 'data point' : 'data points'} • ${typeLabel} • ${paletteName}`;
  }

  function describeChartType(type) {
    switch (type) {
      case 'line':
        return 'Line chart';
      case 'pie':
        return 'Pie chart';
      case 'doughnut':
        return 'Doughnut chart';
      case 'radar':
        return 'Radar chart';
      default:
        return 'Bar chart';
    }
  }

  function paletteLabel(key) {
    switch (key) {
      case 'sunset':
        return 'Sunset';
      case 'tropical':
        return 'Tropical';
      case 'mono':
        return 'Monochrome';
      case 'citrus':
        return 'Citrus';
      default:
        return 'Azure';
    }
  }

  function renderTodos() {
    if (!todoList || !todoTemplate) {
      return;
    }

    todoList.innerHTML = '';
    if (!todos.length) {
      const empty = document.createElement('li');
      empty.className = 'todo-empty';
      empty.textContent = 'No tasks yet. Add your first one above!';
      todoList.appendChild(empty);
      return;
    }

    todos.forEach((todo, index) => {
      const clone = todoTemplate.content.cloneNode(true);
      const item = clone.querySelector('.todo-item');
      const checkbox = clone.querySelector('.todo-item__checkbox');
      const text = clone.querySelector('.todo-item__text');
      const deleteBtn = clone.querySelector('.todo-item__delete');

      text.textContent = todo.text;
      checkbox.checked = Boolean(todo.completed);
      if (todo.completed) {
        item.classList.add('todo-item--completed');
      }

      checkbox.addEventListener('change', () => {
        todos[index].completed = checkbox.checked;
        saveState();
        renderTodos();
      });

      deleteBtn.addEventListener('click', () => {
        todos.splice(index, 1);
        saveState();
        renderTodos();
      });

      todoList.appendChild(clone);
    });
  }

  function renderNotes() {
    if (!noteList || !noteTemplate) {
      return;
    }

    noteList.innerHTML = '';
    if (!notes.length) {
      const empty = document.createElement('p');
      empty.className = 'note-empty';
      empty.textContent = 'Notes you save will appear here.';
      noteList.appendChild(empty);
      return;
    }

    notes.forEach((note, index) => {
      const clone = noteTemplate.content.cloneNode(true);
      const title = clone.querySelector('.note-card__title');
      const body = clone.querySelector('.note-card__body');
      const deleteBtn = clone.querySelector('.note-card__delete');

      title.textContent = note.title;
      body.textContent = note.body;

      deleteBtn.addEventListener('click', () => {
        notes.splice(index, 1);
        saveState();
        renderNotes();
      });

      noteList.appendChild(clone);
    });
  }

  function renderDatasets() {
    if (!datasetList) {
      return;
    }

    datasetList.innerHTML = '';

    if (!datasets.length) {
      datasetEmpty.hidden = false;
      datasetEmpty.textContent = 'Create a dataset to start charting your data.';
      datasetEditor.hidden = true;
      hideDatasetSummary();
      showChartPlaceholder('Add at least one data point to render a chart.');
      destroyChart();
      return;
    }

    datasetEmpty.hidden = true;

    datasets.forEach((dataset) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dataset-pill';
      button.textContent = dataset.name;
      if (dataset.id === activeDatasetId) {
        button.classList.add('dataset-pill--active');
      }
      button.addEventListener('click', () => {
        selectDataset(dataset.id);
      });
      datasetList.appendChild(button);
    });
  }

  function renderDatasetEditor() {
    if (!datasetEditor) {
      return;
    }

    const dataset = getActiveDataset();
    if (!dataset) {
      datasetEditor.hidden = true;
      datasetEmpty.hidden = false;
      datasetEmpty.textContent = datasets.length
        ? 'Select a dataset to view and edit its data.'
        : 'Create a dataset to start charting your data.';
      hideDatasetSummary();
      showChartPlaceholder(datasets.length
        ? 'Select a dataset to preview its chart.'
        : 'Add at least one data point to render a chart.');
      destroyChart();
      return;
    }

    datasetEditor.hidden = false;
    hideChartPlaceholder();
    datasetTitle.textContent = dataset.name;
    datasetMeta.textContent = buildDatasetMeta(dataset);
    chartTypeSelect.value = dataset.chartType;
    paletteSelect.value = dataset.palette;

    renderDataPoints(dataset);
    renderDatasetSummary(dataset);
    buildChart(dataset);
  }

  function hideDatasetSummary() {
    if (datasetSummary) {
      datasetSummary.hidden = true;
      datasetSummary.innerHTML = '';
    }
  }

  function renderDataPoints(dataset) {
    if (!datapointList) {
      return;
    }

    datapointList.innerHTML = '';
    if (!dataset.points.length) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'datapoint-empty';
      emptyItem.textContent = 'No data points yet. Add a label and value above.';
      datapointList.appendChild(emptyItem);
      return;
    }

    dataset.points.forEach((point, index) => {
      const item = document.createElement('li');
      item.className = 'datapoint-item';

      const label = document.createElement('span');
      label.className = 'datapoint-item__label';
      label.textContent = point.label;

      const value = document.createElement('span');
      value.className = 'datapoint-item__value';
      value.textContent = formatValue(point.value);

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'datapoint-item__edit';
      editBtn.setAttribute('aria-label', `Edit data point ${point.label}`);
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', () => {
        const nextLabelRaw = window.prompt('Update label', point.label);
        if (nextLabelRaw === null) {
          return;
        }
        const nextLabel = nextLabelRaw.trim();
        if (!nextLabel) {
          window.alert('Label cannot be empty.');
          return;
        }

        const nextValueRaw = window.prompt('Update value', String(point.value));
        if (nextValueRaw === null) {
          return;
        }
        const nextValue = Number.parseFloat(nextValueRaw);
        if (!Number.isFinite(nextValue)) {
          window.alert('Enter a valid number.');
          return;
        }

        dataset.points[index] = { label: nextLabel, value: nextValue };
        saveState();
        renderDatasetEditor();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'datapoint-item__delete';
      deleteBtn.setAttribute('aria-label', `Delete data point ${point.label}`);
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', () => {
        dataset.points.splice(index, 1);
        saveState();
        renderDatasetEditor();
      });

      item.appendChild(label);
      item.appendChild(value);
      item.appendChild(editBtn);
      item.appendChild(deleteBtn);
      datapointList.appendChild(item);
    });
  }

  function renderDatasetSummary(dataset) {
    if (!datasetSummary) {
      return;
    }

    if (!dataset || !dataset.points.length) {
      hideDatasetSummary();
      return;
    }

    const values = dataset.points
      .map((point) => Number(point.value))
      .filter((value) => Number.isFinite(value));

    if (!values.length) {
      hideDatasetSummary();
      return;
    }

    const total = values.reduce((sum, value) => sum + value, 0);
    const average = total / values.length;
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);

    const summaryItems = [
      { label: 'Points', value: values.length },
      { label: 'Total', value: formatValue(total) },
      { label: 'Average', value: formatValue(average) },
      { label: 'Minimum', value: formatValue(minimum) },
      { label: 'Maximum', value: formatValue(maximum) }
    ];

    datasetSummary.innerHTML = summaryItems.map((item) => `
      <div class="dataset-summary__item">
        <span class="dataset-summary__label">${item.label}</span>
        <span class="dataset-summary__value">${item.value}</span>
      </div>
    `).join('');
    datasetSummary.hidden = false;
  }

  function destroyChart() {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    if (chartCanvas) {
      chartCanvas.classList.add('chart-area__canvas--hidden');
    }
  }

  function ensureChartObserver() {
    if (!window.ResizeObserver || !chartContainer) {
      return;
    }
    if (chartState.resizeObserver) {
      return;
    }

    chartState.resizeObserver = new ResizeObserver(() => {
      if (chartInstance) {
        chartInstance.resize();
      }
    });

    chartState.resizeObserver.observe(chartContainer);
  }

  function getPaletteColors(key, count) {
    const palette = COLOR_PALETTES[key] || COLOR_PALETTES[DEFAULT_PALETTE];
    const colors = [];
    for (let i = 0; i < count; i += 1) {
      colors.push(palette[i % palette.length]);
    }
    return colors;
  }

  function buildChart(dataset) {
    destroyChart();

    if (!chartCanvas || !chartEmpty) {
      return;
    }

    ensureChartObserver();

    if (!chartIsAvailable) {
      showChartPlaceholder('Chart preview unavailable (Chart.js failed to load).');
      return;
    }

    if (!dataset.points.length) {
      showChartPlaceholder('Add at least one data point to render a chart.');
      return;
    }

    const labels = dataset.points.map((point) => point.label);
    const values = dataset.points.map((point) => Number(point.value));

    hideChartPlaceholder();

    const palette = getPaletteColors(dataset.palette, dataset.points.length);
    const primaryColor = palette[0];
    const fillAlpha = chartOptions.fillArea ? 0.35 : 0.12;

    const datasetConfig = {
      label: dataset.name,
      data: values,
      borderWidth: 1.5,
      tension: chartOptions.smoothLines ? 0.35 : 0,
      fill: (dataset.chartType === 'line' || dataset.chartType === 'radar') ? chartOptions.fillArea : false,
      hoverOffset: dataset.chartType === 'pie' || dataset.chartType === 'doughnut' ? 12 : 4
    };

    if (dataset.chartType === 'line') {
      datasetConfig.borderColor = primaryColor;
      datasetConfig.backgroundColor = hexToRgba(primaryColor, fillAlpha);
      datasetConfig.pointBackgroundColor = primaryColor;
      datasetConfig.pointBorderColor = '#ffffff';
      datasetConfig.pointHoverBackgroundColor = primaryColor;
    } else if (dataset.chartType === 'radar') {
      datasetConfig.borderColor = primaryColor;
      datasetConfig.backgroundColor = hexToRgba(primaryColor, fillAlpha);
    } else if (dataset.chartType === 'bar') {
      datasetConfig.backgroundColor = palette.map((color) => hexToRgba(color, 0.85));
      datasetConfig.borderColor = palette;
    } else {
      datasetConfig.backgroundColor = palette;
      datasetConfig.borderColor = '#ffffff';
    }

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 280 },
      plugins: {
        legend: { display: chartOptions.showLegend },
        title: { display: false },
        tooltip: { mode: 'index', intersect: false }
      }
    };

    if (dataset.chartType === 'bar' || dataset.chartType === 'line') {
      options.scales = {
        x: {
          ticks: { maxRotation: 45, minRotation: 0 },
          grid: { display: chartOptions.showGridX },
          stacked: dataset.chartType === 'bar' && chartOptions.stackedBars
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          grid: { display: chartOptions.showGridY },
          stacked: dataset.chartType === 'bar' && chartOptions.stackedBars
        }
      };
    } else if (dataset.chartType === 'radar') {
      options.scales = {
        r: {
          beginAtZero: true,
          ticks: { precision: 0 },
          grid: { color: chartOptions.showGridY ? undefined : 'transparent' }
        }
      };
    } else {
      options.scales = {};
    }

    chartInstance = new Chart(chartCanvas, {
      type: dataset.chartType,
      data: {
        labels,
        datasets: [datasetConfig]
      },
      options
    });
  }

  function getActiveDataset() {
    return datasets.find((dataset) => dataset.id === activeDatasetId) || null;
  }

  function selectDataset(datasetId) {
    if (activeDatasetId === datasetId) {
      return;
    }
    activeDatasetId = datasetId;
    saveState();
    renderDatasets();
    renderDatasetEditor();
  }

  function updateChartOptionsFromForm() {
    chartOptions = {
      showLegend: Boolean(chartOptionLegend?.checked),
      showGridX: Boolean(chartOptionGridX?.checked),
      showGridY: Boolean(chartOptionGridY?.checked),
      smoothLines: Boolean(chartOptionSmooth?.checked),
      fillArea: Boolean(chartOptionFill?.checked),
      stackedBars: Boolean(chartOptionStacked?.checked)
    };
    saveState();
    renderDatasetEditor();
  }

  function renderChartOptions() {
    if (!chartOptionsForm) {
      return;
    }
    chartOptionLegend.checked = chartOptions.showLegend;
    chartOptionGridX.checked = chartOptions.showGridX;
    chartOptionGridY.checked = chartOptions.showGridY;
    chartOptionSmooth.checked = chartOptions.smoothLines;
    chartOptionFill.checked = chartOptions.fillArea;
    chartOptionStacked.checked = chartOptions.stackedBars;
  }

  function duplicateDataset(dataset) {
    const clone = JSON.parse(JSON.stringify(dataset));
    clone.id = generateId();
    clone.name = `${dataset.name} copy`;
    clone.createdAt = Date.now();
    datasets.unshift(normalizeDataset(clone));
    activeDatasetId = clone.id;
    saveState();
    renderDatasets();
    renderDatasetEditor();
  }

  function exportDataset(dataset) {
    const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = dataset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dataset';
    link.href = url;
    link.download = `${safeName}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importDataset(file) {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      try {
        const parsed = JSON.parse(reader.result);
        const dataset = normalizeDataset(parsed);
        if (!dataset) {
          throw new Error('Invalid dataset file.');
        }
        datasets.unshift(dataset);
        activeDatasetId = dataset.id;
        saveState();
        renderDatasets();
        renderDatasetEditor();
      } catch (error) {
        window.alert(error.message || 'Unable to import dataset.');
      } finally {
        if (datasetImportInput) {
          datasetImportInput.value = '';
        }
      }
    });
    reader.readAsText(file);
  }

  // Event listeners
  if (todoForm) {
    todoForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = todoInput.value.trim();
      if (!text) {
        todoInput.focus();
        return;
      }
      todos.unshift({ text, completed: false, createdAt: Date.now() });
      todoInput.value = '';
      saveState();
      renderTodos();
      todoInput.focus();
    });
  }

  if (noteForm) {
    noteForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const titleValue = noteTitleInput.value.trim();
      const bodyValue = noteBodyInput.value.trim();
      if (!titleValue || !bodyValue) {
        return;
      }
      notes.unshift({ title: titleValue, body: bodyValue, createdAt: Date.now() });
      noteTitleInput.value = '';
      noteBodyInput.value = '';
      saveState();
      renderNotes();
      noteTitleInput.focus();
    });
  }

  if (datasetForm) {
    datasetForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = datasetNameInput.value.trim();
      const type = datasetChartTypeInput.value;
      if (!name) {
        datasetNameInput.focus();
        return;
      }
      const dataset = {
        id: generateId(),
        name,
        chartType: ['bar', 'line', 'pie', 'doughnut', 'radar'].includes(type) ? type : 'bar',
        palette: DEFAULT_PALETTE,
        points: [],
        createdAt: Date.now()
      };
      datasets.unshift(dataset);
      activeDatasetId = dataset.id;
      datasetNameInput.value = '';
      datasetChartTypeInput.value = 'bar';
      saveState();
      renderDatasets();
      renderDatasetEditor();
      datasetNameInput.focus();
    });
  }

  if (datapointForm) {
    datapointForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const dataset = getActiveDataset();
      if (!dataset) {
        return;
      }
      const label = datapointLabelInput.value.trim();
      const value = Number.parseFloat(datapointValueInput.value);
      if (!label) {
        datapointLabelInput.focus();
        return;
      }
      if (!Number.isFinite(value)) {
        datapointValueInput.focus();
        return;
      }
      dataset.points.push({ label, value });
      datapointLabelInput.value = '';
      datapointValueInput.value = '';
      saveState();
      renderDatasetEditor();
      datapointLabelInput.focus();
    });
  }

  if (datasetDeleteBtn) {
    datasetDeleteBtn.addEventListener('click', () => {
      const dataset = getActiveDataset();
      if (!dataset) {
        return;
      }
      const confirmDelete = window.confirm(`Delete dataset "${dataset.name}"? This cannot be undone.`);
      if (!confirmDelete) {
        return;
      }
      datasets = datasets.filter((item) => item.id !== dataset.id);
      activeDatasetId = datasets[0]?.id || null;
      saveState();
      renderDatasets();
      renderDatasetEditor();
    });
  }

  if (datasetRenameBtn) {
    datasetRenameBtn.addEventListener('click', () => {
      const dataset = getActiveDataset();
      if (!dataset) {
        window.alert('Select a dataset to rename.');
        return;
      }
      const nextNameRaw = window.prompt('Rename dataset', dataset.name);
      if (nextNameRaw === null) {
        return;
      }
      const nextName = nextNameRaw.trim();
      if (!nextName) {
        window.alert('Dataset name cannot be empty.');
        return;
      }
      dataset.name = nextName;
      saveState();
      renderDatasets();
      renderDatasetEditor();
    });
  }

  if (datasetDuplicateBtn) {
    datasetDuplicateBtn.addEventListener('click', () => {
      const dataset = getActiveDataset();
      if (!dataset) {
        window.alert('Select a dataset to duplicate.');
        return;
      }
      duplicateDataset(dataset);
    });
  }

  if (datasetExportBtn) {
    datasetExportBtn.addEventListener('click', () => {
      const dataset = getActiveDataset();
      if (!dataset) {
        window.alert('Select a dataset to export.');
        return;
      }
      exportDataset(dataset);
    });
  }

  if (datasetImportInput) {
    datasetImportInput.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      importDataset(file);
    });
  }

  if (chartTypeSelect) {
    chartTypeSelect.addEventListener('change', (event) => {
      const dataset = getActiveDataset();
      if (!dataset) {
        return;
      }
      const nextType = event.target.value;
      if (!['bar', 'line', 'pie', 'doughnut', 'radar'].includes(nextType)) {
        return;
      }
      dataset.chartType = nextType;
      datasetMeta.textContent = buildDatasetMeta(dataset);
      saveState();
      renderDatasetEditor();
    });
  }

  if (paletteSelect) {
    paletteSelect.addEventListener('change', (event) => {
      const dataset = getActiveDataset();
      if (!dataset) {
        return;
      }
      const nextPalette = event.target.value;
      dataset.palette = COLOR_PALETTES[nextPalette] ? nextPalette : DEFAULT_PALETTE;
      datasetMeta.textContent = buildDatasetMeta(dataset);
      saveState();
      renderDatasetEditor();
    });
  }

  if (chartOptionsForm) {
    chartOptionsForm.addEventListener('change', () => {
      updateChartOptionsFromForm();
    });
  }

  loadState();
  renderTodos();
  renderNotes();
  renderDatasets();
  renderDatasetEditor();
  renderChartOptions();
})();
