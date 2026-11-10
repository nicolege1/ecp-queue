// Расчёт показателей очереди в браузере по выгруженному снимку data.js
// (повторяет build_data из server.py, чтобы сайт работал без сервера).
(function () {
  const D = window.QUEUE_DATA;
  const MONTHS = ["", "января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const START = Date.UTC(...D.excelStart.split("-").map((v, i) => (i === 1 ? v - 1 : +v)));
  const DAY = 86400000;

  const toSerial = (iso) => Math.round((Date.UTC(...iso.split("-").map((v, i) => (i === 1 ? v - 1 : +v))) - START) / DAY);
  const fromSerial = (serial) => new Date(START + serial * DAY);
  const iso = (d) => d.toISOString().slice(0, 10);
  const pad = (n) => String(n).padStart(2, "0");
  const dotted = (d) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  const longDate = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth() + 1]} ${d.getUTCFullYear()} г.`;

  const daxRound = (v) => (v === null || Number.isNaN(v) ? 0 : Math.floor(v + 0.5));
  const timeShort = (m) => { const t = m === null || Number.isNaN(m) ? 0 : Math.floor(m); return `${Math.floor(t / 60)}:${pad(t % 60)}`; };
  const timeLong = (m) => {
    const t = m === null || Number.isNaN(m) ? 0 : Math.floor(m);
    const h = Math.floor(t / 60), mins = t % 60;
    if (h && mins) return `${h} ч ${mins} мин`;
    if (h) return `${h} ч`;
    return `${mins} мин`;
  };
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  const max = (a) => (a.length ? Math.max(...a) : NaN);

  // Строки: [день, час, ожидание, приём, рабочее место, талон] + признаки
  const rows = D.rows.map(([day, hour, wait, service, p, ticket]) => {
    const place = D.places[p];
    const low = ticket.toLowerCase();
    const y = low.includes("ю");
    const v = low.includes("в");
    const room102 = place.toLowerCase().includes("102");
    return { day, hour, wait, service, place, ticket, y, room102, legal: y || (v && room102) };
  });
  const days = [...new Set(rows.map((r) => r.day))].sort((a, b) => a - b);

  // Номера талонов повторяются в разные дни, поэтому считаем внутри каждого дня.
  const uniqueTickets = (list) => {
    const byDay = new Map();
    list.forEach((r) => { if (!byDay.has(r.day)) byDay.set(r.day, new Set()); byDay.get(r.day).add(r.ticket); });
    let n = 0; byDay.forEach((s) => { n += s.size; }); return n;
  };

  function selectedErrors(first, last) {
    const E = D.errors;
    const inRange = (x) => first <= x.serial && x.serial <= last;
    const chosen = E.days.filter(inRange);
    const sum = (k) => chosen.reduce((s, d) => s + d[k], 0);
    return {
      days: chosen,
      doubles: E.doubles.filter(inRange),
      forgotten: E.forgotten.filter(inRange),
      longWait: E.longWait.filter(inRange),
      totals: { served: sum("served"), errors: sum("errors"), named: sum("named"), unknown: sum("unknown") },
      fromLabel: E.fromLabel,
    };
  }

  window.computeQueueData = function (dateFrom, dateTo) {
    let first = dateFrom ? toSerial(dateFrom) : null;
    let last = dateTo ? toSerial(dateTo) : null;
    if (first === null && last === null) first = last = days[days.length - 1];
    else if (first === null) first = last;
    else if (last === null) last = first;
    if (first > last) [first, last] = [last, first];

    let adjusted = false;
    if (!days.some((d) => first <= d && d <= last)) {
      const target = first;
      first = last = days.reduce((best, d) => (Math.abs(d - target) < Math.abs(best - target) ? d : best), days[0]);
      adjusted = true;
    }

    const sel = rows.filter((r) => r.day >= first && r.day <= last);
    const hours = [...new Set(sel.map((r) => r.hour))].sort((a, b) => a - b);
    const chart = hours.map((hour) => {
      const g = sel.filter((r) => r.hour === hour);
      return { hour, tickets: uniqueTickets(g.filter((r) => r.legal)), wait: daxRound(mean(g.filter((r) => r.y).map((r) => r.wait))) };
    });
    const pick = (key) => chart.reduce((best, item) => (item[key] > best[key] || (item[key] === best[key] && item.hour < best.hour) ? item : best), chart[0]);
    const peakTickets = pick("tickets");
    const peakWait = pick("wait");

    const maxWait = max(sel.filter((r) => r.room102).map((r) => r.wait));
    const real = (r) => r.service <= D.forgotten;
    const maxService = max(sel.filter((r) => r.room102 && real(r)).map((r) => r.service));

    const firstDate = fromSerial(first), lastDate = fromSerial(last);
    const single = first === last;

    return {
      from: iso(firstDate),
      to: iso(lastDate),
      singleDay: single,
      periodLabel: single ? longDate(firstDate) : `${dotted(firstDate)} - ${dotted(lastDate)}`,
      adjusted,
      availableDates: days.map((d) => iso(fromSerial(d))),
      metrics: {
        tickets: uniqueTickets(sel.filter((r) => r.legal)),
        avgWait: daxRound(mean(sel.map((r) => r.wait))),
        maxWait: timeShort(maxWait),
        maxWaitLong: timeLong(maxWait),
        avgService: daxRound(mean(sel.filter((r) => r.y && real(r)).map((r) => r.service))),
        maxService: timeShort(maxService),
        workplaces: new Set(sel.filter((r) => r.y).map((r) => r.place)).size,
      },
      chart,
      insights: {
        peakTickets: { hour: peakTickets.hour, value: peakTickets.tickets },
        peakWait: { hour: peakWait.hour, value: peakWait.wait },
      },
      errors: selectedErrors(first, last),
      sourceName: D.sourceName,
    };
  };
})();
