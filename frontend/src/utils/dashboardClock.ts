export interface DashboardClock {
  date: string;
  time: string;
  weekday: string;
}

function getDatePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find(part => part.type === type)?.value || '';
}

export function formatDashboardClock(date: Date, timeZone = 'Asia/Shanghai'): DashboardClock {
  const dateParts = new Intl.DateTimeFormat('zh-CN-u-ca-gregory', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const timeParts = new Intl.DateTimeFormat('zh-CN-u-ca-gregory', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const year = getDatePart(dateParts, 'year');
  const month = getDatePart(dateParts, 'month');
  const day = getDatePart(dateParts, 'day');
  const hour = getDatePart(timeParts, 'hour');
  const minute = getDatePart(timeParts, 'minute');
  const second = getDatePart(timeParts, 'second');
  const weekday = new Intl.DateTimeFormat('zh-CN-u-ca-gregory', {
    timeZone,
    weekday: 'short',
  }).format(date);

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`,
    weekday,
  };
}
