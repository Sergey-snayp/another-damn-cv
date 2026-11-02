/** A date without a time must never become an invented midnight appointment. */
export interface InterviewSchedule {
  date: string;
  time: string | null;
  timeZone: string;
}

export function interviewScheduleProblem(schedule: InterviewSchedule): string | null {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(schedule.date)) return 'Choose a valid interview date.';
  const date = new Date(`${schedule.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== schedule.date) {
    return 'Choose a valid interview date.';
  }
  if (schedule.time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) {
    return 'Choose a valid interview time, or leave it empty.';
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: schedule.timeZone }).format(date);
  } catch {
    return 'Choose a valid time zone, such as America/Vancouver.';
  }
  return null;
}
