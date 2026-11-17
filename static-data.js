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
  const rows = D.rows.map(([day, hour, wait, service, p, ticket, served, direction]) => {
    const place = D.places[p];
    const low = ticket.toLowerCase();
    const y = low.includes("ю");
    const v = low.includes("в");
    const room102 = place.toLowerCase().includes("102");
    return {
      day, hour, wait, service, place, ticket, y, room102, legal: y || (v && room102), served: served === 1, direction: direction === 1,
      // Первичный приём: кабинет 101 без юридических талонов; МФЦ: талоны МФЦ
      primary: place.startsWith("Кабинет 101") && !y,
      mfc: ticket.toUpperCase().replace(/\s/g, "").includes("МФЦ"),
    };
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
      longService: E.longService.filter(inRange),
      shortService: E.shortService.filter(inRange),
      longWait: E.longWait.filter(inRange),
      totals: { served: sum("served"), errors: sum("errors"), named: sum("named"), unknown: sum("unknown") },
      fromLabel: E.fromLabel,
    };
  }

  const durationLabel = (minutes) => {
    const s = Number.isNaN(minutes) ? 0 : Math.round(minutes * 60);
    if (s < 60) return `${s} сек`;
    if (s < 3600) return s < 600 ? `${Math.floor(s / 60)} мин ${s % 60} сек` : `${Math.floor(s / 60)} мин`;
    return `${Math.floor(s / 3600)} ч ${Math.floor((s % 3600) / 60)} мин`;
  };
  const deskLabel = (place) => { const m = /стол\s*(\d+)/i.exec(place); return m ? `Стол ${m[1]}` : place || "Не указан"; };

  function resolvePeriod(list, dateFrom, dateTo) {
    let first = dateFrom ? toSerial(dateFrom) : null;
    let last = dateTo ? toSerial(dateTo) : null;
    if (first === null && last === null) first = last = list[list.length - 1];
    else if (first === null) first = last;
    else if (last === null) last = first;
    if (first > last) [first, last] = [last, first];
    let adjusted = false;
    if (!list.some((d) => first <= d && d <= last)) {
      const target = first;
      first = last = list.reduce((best, d) => (Math.abs(d - target) < Math.abs(best - target) ? d : best), list[0]);
      adjusted = true;
    }
    const firstDate = fromSerial(first), lastDate = fromSerial(last);
    const single = first === last;
    return {
      first, last,
      base: {
        from: iso(firstDate), to: iso(lastDate), singleDay: single,
        periodLabel: single ? longDate(firstDate) : `${dotted(firstDate)} - ${dotted(lastDate)}`,
        adjusted, availableDates: list.map((d) => iso(fromSerial(d))),
      },
    };
  }

  function contactData(dateFrom, dateTo) {
    const list = [...new Set(D.contact.map((r) => r[0]))].sort((a, b) => a - b);
    const { first, last, base } = resolvePeriod(list, dateFrom, dateTo);
    const chosen = D.contact.filter((r) => r[0] >= first && r[0] <= last);
    const byHour = new Map();
    chosen.forEach(([, hour, calls, wait, handled]) => {
      const item = byHour.get(hour) || [0, 0, 0];
      item[0] += calls; item[1] += wait; item[2] += handled; byHour.set(hour, item);
    });
    const chart = [...byHour].sort((a, b) => a[0] - b[0]).map(([hour, [calls, wait, handled]]) => ({ hour, tickets: handled, wait: Math.round(wait / calls) }));
    const sum = (i) => chosen.reduce((s, r) => s + r[i], 0);
    const perDay = new Map();
    chosen.forEach((r) => perDay.set(r[0], Math.max(perDay.get(r[0]) || 0, r[6])));
    const calls = sum(2);
    return {
      ...base, department: "contact",
      metrics: {
        operators: perDay.size ? Math.round([...perDay.values()].reduce((s, v) => s + v, 0) / perDay.size) : 0,
        avgWait: calls ? Math.round(sum(3) / calls) : 0,
        handled: sum(4),
        missed: sum(5),
      },
      chart, sourceName: "Показатели доступности Центр Береговой",
    };
  }

  function departmentData(dept, dateFrom, dateTo) {
    const { first, last, base } = resolvePeriod(days, dateFrom, dateTo);
    const own = rows.filter((r) => r.day >= first && r.day <= last && r[dept]);
    const served = own.filter((r) => r.served);
    const real = (r) => r.service <= D.forgotten;
    const hours = [...new Set(own.map((r) => r.hour))].sort((a, b) => a - b);
    let chart = hours.map((hour) => {
      const g = own.filter((r) => r.hour === hour);
      return { hour, tickets: uniqueTickets(g), wait: daxRound(mean(g.map((r) => r.wait))) };
    });
    if (!chart.length) chart = [{ hour: 9, tickets: 0, wait: 0 }];
    const pick = (key) => chart.reduce((best, item) => (item[key] > best[key] || (item[key] === best[key] && item.hour < best.hour) ? item : best), chart[0]);
    const maxWait = own.length ? max(own.map((r) => r.wait)) : 0;
    const realService = own.filter(real).map((r) => r.service);
    const maxService = realService.length ? max(realService) : 0;

    const byPlace = new Map();
    served.forEach((r) => { if (!byPlace.has(r.place)) byPlace.set(r.place, []); byPlace.get(r.place).push(r); });
    const desks = [...byPlace].map(([place, g]) => {
      const good = g.filter(real).map((r) => r.service);
      return {
        desk: deskLabel(place), place, served: uniqueTickets(g),
        avgService: good.length ? durationLabel(mean(good)) : "-",
        maxService: good.length ? durationLabel(max(good)) : "-",
        avgWait: durationLabel(mean(g.map((r) => r.wait))),
      };
    }).sort((a, b) => b.served - a.served || (Number(a.desk.replace(/\D/g, "")) || 0) - (Number(b.desk.replace(/\D/g, "")) || 0));

    const anomalies = (test, key, desc) => served.filter(test)
      .sort((a, b) => b.day - a.day || (desc ? b[key] - a[key] : a[key] - b[key]))
      .map((r) => ({ date: dotted(fromSerial(r.day)), ticket: r.ticket, place: deskLabel(r.place), wait: durationLabel(r.wait), service: durationLabel(r.service) }));
    let primaryErrors = null;
    if (dept === "primary") {
      const checked = served.filter((r) => r.day >= D.errorsFrom)
        .sort((a, b) => b.day - a.day || (a.place < b.place ? -1 : a.place > b.place ? 1 : 0) || (a.ticket < b.ticket ? -1 : a.ticket > b.ticket ? 1 : 0));
      const missing = checked.filter((r) => !r.direction);
      primaryErrors = {
        served: checked.length, errors: missing.length, found: checked.length - missing.length, fromLabel: D.errorsFromLabel,
        items: missing.map((r) => ({ date: dotted(fromSerial(r.day)), desk: deskLabel(r.place), ticket: r.ticket, duration: durationLabel(r.service), reason: "Талон не найден в направлениях" })),
      };
    }
    const L = D.limits;
    const peakTickets = pick("tickets"), peakWait = pick("wait");
    return {
      ...base,
      department: dept,
      metrics: {
        tickets: uniqueTickets(own),
        avgWait: own.length ? daxRound(mean(own.map((r) => r.wait))) : 0,
        maxWait: timeShort(maxWait),
        maxWaitLong: timeLong(maxWait),
        avgService: realService.length ? daxRound(mean(realService)) : 0,
        maxService: timeShort(maxService),
        workplaces: new Set(served.map((r) => r.place)).size,
        longWaitCount: served.filter((r) => r.wait > L.longWait).length,
        servedCount: served.length,
      },
      chart,
      insights: { peakTickets: { hour: peakTickets.hour, value: peakTickets.tickets }, peakWait: { hour: peakWait.hour, value: peakWait.wait } },
      desks,
      primaryErrors,
      errors: {
        longService: anomalies((r) => r.service > L.longService, "service", true),
        shortService: anomalies((r) => r.service < L.shortService, "service", false),
        longWait: anomalies((r) => r.wait > L.longWait, "wait", true),
      },
      sourceName: D.sourceName,
    };
  }

  window.computeQueueData = function (dateFrom, dateTo, dept) {
    if (dept === "contact") return contactData(dateFrom, dateTo);
    if (dept === "primary" || dept === "mfc") return departmentData(dept, dateFrom, dateTo);
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
