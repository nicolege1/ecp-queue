const queueSvg = document.querySelector("#queueChart");
const dateFrom = document.querySelector("#dateFrom");
const dateTo = document.querySelector("#dateTo");
const previousButton = document.querySelector("#previousDate");
const nextButton = document.querySelector("#nextDate");
const ns = "http://www.w3.org/2000/svg";

let queueData = [];
let availableDates = [];
let selectedFrom = null;
let selectedTo = null;

function node(name, attrs = {}, text = "") {
  const element = document.createElementNS(ns, name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  if (text) element.textContent = text;
  return element;
}

function setText(id, value) {
  document.querySelector(`#${id}`).textContent = value;
}

function wordForm(value, one, few, many) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function chartFrame(svg, minimumWidth = 650) {
  const box = svg.getBoundingClientRect();
  const width = Math.max(minimumWidth, Math.round(box.width));
  const height = Math.max(270, Math.round(box.height));
  const margin = { top: 30, right: 28, bottom: 42, left: 42 };
  return {
    width,
    height,
    margin,
    plotWidth: width - margin.left - margin.right,
    plotHeight: height - margin.top - margin.bottom
  };
}

function drawGrid(svg, frame, axisMax) {
  const tickStep = Math.max(5, Math.ceil(axisMax / 4 / 5) * 5);
  for (let value = 0; value <= axisMax; value += tickStep) {
    const y = frame.margin.top + frame.plotHeight - (value / axisMax) * frame.plotHeight;
    svg.append(node("line", { x1: frame.margin.left, y1: y, x2: frame.width - frame.margin.right, y2: y, stroke: "#e8eae6", "stroke-width": 1 }));
    svg.append(node("text", { x: frame.margin.left - 10, y: y + 4, fill: "#7b7f80", "font-size": 10, "text-anchor": "end" }, value));
  }
}

function renderQueueChart() {
  if (!queueData.length) return;
  const frame = chartFrame(queueSvg);
  const maxTickets = Math.max(...queueData.map((item) => item.tickets), 1);
  const maxWait = Math.max(...queueData.map((item) => item.wait), 1);
  const axisMax = Math.max(10, Math.ceil(Math.max(maxTickets, maxWait) / 10) * 10);
  const step = frame.plotWidth / queueData.length;
  const barWidth = Math.min(34, step * 0.52);

  queueSvg.replaceChildren();
  queueSvg.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height}`);
  drawGrid(queueSvg, frame, axisMax);

  const points = [];
  queueData.forEach((item, index) => {
    const center = frame.margin.left + step * index + step / 2;
    const barHeight = (item.wait / axisMax) * frame.plotHeight;
    const barY = frame.margin.top + frame.plotHeight - barHeight;
    const lineY = frame.margin.top + frame.plotHeight - (item.tickets / axisMax) * frame.plotHeight;
    const peakWait = Math.max(...queueData.map((row) => row.wait));

    queueSvg.append(node("rect", {
      x: center - barWidth / 2, y: barY, width: barWidth, height: barHeight, rx: 5,
      fill: item.wait === peakWait ? "#455120" : "#aab58a"
    }));
    queueSvg.append(node("text", { x: center - 9, y: barY - 7, fill: "#455120", "font-size": 10, "font-weight": 700, "text-anchor": "middle" }, item.wait));
    queueSvg.append(node("text", { x: center, y: frame.height - 14, fill: "#666b6d", "font-size": 10, "text-anchor": "middle" }, `${item.hour}:00`));
    points.push([center, lineY]);
  });

  drawLine(queueSvg, points, queueData.map((item) => item.tickets), "#dc291a", true);
}

function drawLine(svg, points, values, color, labelAll = false) {
  const peak = Math.max(...values);
  svg.append(node("path", {
    d: points.map((point, index) => `${index ? "L" : "M"}${point[0]},${point[1]}`).join(" "),
    fill: "none", stroke: color, "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round"
  }));
  points.forEach(([x, y], index) => {
    const isPeak = values[index] === peak;
    svg.append(node("circle", { cx: x, cy: y, r: isPeak ? 5 : 3.5, fill: color, stroke: "#fff", "stroke-width": 2 }));
    if (labelAll || isPeak) {
      svg.append(node("text", { x, y: y - 10, fill: color, "font-size": 10, "font-weight": isPeak ? 800 : 650, "text-anchor": "middle" }, values[index]));
    }
  });
}

function updateDateControls() {
  dateFrom.value = selectedFrom;
  dateTo.value = selectedTo;
  [dateFrom, dateTo].forEach((input) => {
    input.min = availableDates[0];
    input.max = availableDates[availableDates.length - 1];
  });
  previousButton.disabled = availableDates.indexOf(selectedFrom) <= 0;
  const lastIndex = availableDates.indexOf(selectedTo);
  nextButton.disabled = lastIndex < 0 || lastIndex >= availableDates.length - 1;
}

async function loadData(from = null, to = null) {
  try {
    setText("updateStatus", "Читаю файл с данными");
    const data = window.computeQueueData(from, to);

    queueData = data.chart;
    availableDates = data.availableDates;
    selectedFrom = data.from;
    selectedTo = data.to;
    updateDateControls();

    setText("ticketsCaption", data.singleDay ? "за выбранный день" : "за выбранный период");
    setText("avgWaitCaption", data.singleDay ? "за весь день" : "за весь период");
    setText("insightsEyebrow", data.singleDay ? "ГЛАВНОЕ ЗА ДЕНЬ" : "ГЛАВНОЕ ЗА ПЕРИОД");

    setText("ticketsValue", data.metrics.tickets);
    setText("avgWaitValue", data.metrics.avgWait);
    setText("maxWaitValue", data.metrics.maxWait);
    setText("avgServiceValue", data.metrics.avgService);
    setText("maxServiceValue", data.metrics.maxService);
    setText("workplacesValue", data.metrics.workplaces);
    setText("peakTicketsHour", `${data.insights.peakTickets.hour}:00`);
    const ticketWord = wordForm(data.insights.peakTickets.value, "талон", "талона", "талонов");
    const peakPeriod = data.singleDay ? "за час" : "в этот час за период";
    setText("peakTicketsText", `Пик потока: ${data.insights.peakTickets.value} ${ticketWord} ${peakPeriod}`);
    setText("peakWaitHour", `${data.insights.peakWait.hour}:00`);
    const minuteWord = wordForm(data.insights.peakWait.value, "минута", "минуты", "минут");
    setText("peakWaitText", `Самое высокое среднее ожидание: ${data.insights.peakWait.value} ${minuteWord}`);
    setText("maxWaitInsight", data.metrics.maxWaitLong);
    const adjustedNote = data.adjusted ? "За выбранные даты данных нет, показан ближайший день. " : "";
    setText("updateStatus", `${adjustedNote}${data.periodLabel} Данные на 10.11.2026`);
    renderQueueChart();
    renderErrors(data.errors, data.singleDay);
  } catch (error) {
    setText("updateStatus", "Не удалось прочитать файл с данными в папке Загрузки");
    console.error(error);
  }
}

function onPeriodChange() {
  if (dateFrom.value && dateTo.value) loadData(dateFrom.value, dateTo.value);
}

dateFrom.addEventListener("change", onPeriodChange);
dateTo.addEventListener("change", onPeriodChange);
previousButton.addEventListener("click", () => {
  const index = availableDates.indexOf(selectedFrom);
  if (index > 0) loadData(availableDates[index - 1], availableDates[index - 1]);
});
nextButton.addEventListener("click", () => {
  const index = availableDates.indexOf(selectedTo);
  if (index >= 0 && index < availableDates.length - 1) loadData(availableDates[index + 1], availableDates[index + 1]);
});

function errorCell(text, className) {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function peopleList(labels) {
  const list = document.createElement("div");
  list.className = "people";
  labels.forEach((label) => {
    const chip = document.createElement("span");
    chip.textContent = label;
    list.append(chip);
  });
  return list;
}

function renderDoubles(doubles) {
  const body = document.getElementById("doublesBody");
  setText("doublesTotals", doubles.length ? `Талонов: ${doubles.length}` : "");
  if (!doubles.length) {
    const row = document.createElement("tr");
    const cell = errorCell("За выбранные даты таких талонов нет");
    cell.colSpan = 4;
    row.append(cell);
    body.replaceChildren(row);
    return;
  }
  body.replaceChildren(...doubles.map((item) => {
    const row = document.createElement("tr");
    const names = document.createElement("td");
    names.append(peopleList(item.names));
    row.append(errorCell(item.date, "date"), errorCell(item.ticket), errorCell(item.place), names);
    return row;
  }));
}

function renderLongWait(items) {
  const body = document.getElementById("longWaitBody");
  setText("longWaitTotals", items.length ? `Талонов: ${items.length}` : "");
  if (!items.length) {
    const row = document.createElement("tr");
    const cell = errorCell("За выбранные даты таких случаев нет");
    cell.colSpan = 6;
    row.append(cell);
    body.replaceChildren(row);
    return;
  }
  body.replaceChildren(...items.map((item) => {
    const row = document.createElement("tr");
    row.append(
      errorCell(item.date, "date"),
      errorCell(item.ticket),
      errorCell(item.place),
      errorCell(item.wait, "strong"),
      errorCell(item.service),
      errorCell(item.name || "Не определено", item.name ? "" : "unknown")
    );
    return row;
  }));
}

function renderErrors(data, singleDay) {
  renderLongWait(data.longWait);
  renderDoubles(data.doubles);
  setText("statServed", data.totals.served);
  setText("statErrors", data.totals.errors);
  setText("statNamed", data.totals.named);
  setText("statUnknown", data.totals.unknown);
  document.getElementById("errorsDateHead").hidden = singleDay;

  const body = document.getElementById("errorsBody");
  const items = data.days.flatMap((day) => day.tickets.map((item) => ({ ...item, date: day.date })));
  if (!items.length) {
    const row = document.createElement("tr");
    const cell = errorCell(`За выбранные даты ошибок нет. Ошибки считаются с ${data.fromLabel}`);
    cell.colSpan = singleDay ? 4 : 5;
    row.append(cell);
    body.replaceChildren(row);
    return;
  }
  body.replaceChildren(...items.map((item) => {
    const row = document.createElement("tr");
    if (!singleDay) row.append(errorCell(item.date, "date"));
    row.append(
      errorCell(item.surname || "Не определено", item.surname ? "surname" : "unknown"),
      errorCell(item.ticket, "ticket"),
      errorCell(item.duration, "duration"),
      errorCell(item.reason, "reason")
    );
    return row;
  }));
}

loadData();
window.addEventListener("resize", () => {
  renderQueueChart();
});
