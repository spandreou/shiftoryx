import { inferShiftType } from './scheduleUtils.js';
import { calculateShiftDurationMinutes, minutesToHours } from './time.js';

export const SHIFT_TYPES = {
  WORK: 'work',
  REST: 'rest',
  LEAVE: 'leave',
  SICK: 'sick',
};

export function getShiftTypeLabel(type) {
  switch (type) {
    case SHIFT_TYPES.REST:
      return 'Ρεπό';
    case SHIFT_TYPES.LEAVE:
      return 'Άδεια';
    case SHIFT_TYPES.SICK:
      return 'Ασθένεια';
    case SHIFT_TYPES.WORK:
    default:
      return 'Εργασία';
  }
}

export function getShiftDurationHours(shift) {
  if (shift?.schedulerSchemaVersion === 3 && shift.crossMidnight === true) {
    const valid = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!valid.test(shift.startTime) || !valid.test(shift.endTime) || shift.endTime >= shift.startTime) throw new Error('Μη έγκυρη νυχτερινή βάρδια.');
    const minutes = value => { const [h,m]=value.split(':').map(Number);return h*60+m; };
    return minutesToHours(1440 + minutes(shift.endTime) - minutes(shift.startTime));
  }
  const minutes = calculateShiftDurationMinutes(shift.startTime, shift.endTime);
  return minutesToHours(minutes);
}

export function isWorkingShift(shift) {
  return (shift?.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK;
}

function isSundayDate(dateValue) {
  if (!dateValue) return false;
  const parsed = new Date(`${dateValue}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.getDay() === 0;
}

function getDefaultDayStatus() {
  return {
    hasWork: false,
    hasRest: false,
    hasLeave: false,
    hasSick: false,
  };
}

function resolveNonWorkingCategory(dayStatus) {
  if (dayStatus.hasSick) return SHIFT_TYPES.SICK;
  if (dayStatus.hasLeave) return SHIFT_TYPES.LEAVE;
  if (dayStatus.hasRest) return SHIFT_TYPES.REST;
  return '';
}

export function calculateWeeklyTotals(shifts, employees, weekDays) {
  const visibleDays = [...new Set((weekDays || []).filter(Boolean))];
  const visibleSet = new Set(visibleDays);
  const hasAnyEntryByDate = Object.fromEntries(visibleDays.map((date) => [date, false]));

  const totalsByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = 0;
    return acc;
  }, {});

  const shiftsCountByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = 0;
    return acc;
  }, {});

  const workBreakdownByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = {
      morning: 0,
      intermediate: 0,
      evening: 0,
      custom: 0,
    };
    return acc;
  }, {});

  const leaveDaysByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = {
      restDays: 0,
      leaveDays: 0,
      sickDays: 0,
      nonWorkingSundays: 0,
      inferredRestDays: 0,
    };
    return acc;
  }, {});

  const dayStatusByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = {};
    return acc;
  }, {});

  let totalHours = 0;
  const totalsByType = { restDays: 0, leaveDays: 0, sickDays: 0, nonWorkingSundays: 0 };

  (shifts || []).forEach((shift) => {
    if (!visibleSet.has(shift.date)) return;
    hasAnyEntryByDate[shift.date] = true;

    const employeeId = shift.employeeId;
    if (!employeeId || !Object.prototype.hasOwnProperty.call(totalsByEmployee, employeeId)) return;

    const type = shift.type || SHIFT_TYPES.WORK;
    const employeeDayStatus = dayStatusByEmployee[employeeId] || {};
    const dayStatus = employeeDayStatus[shift.date] || getDefaultDayStatus();

    if (type === SHIFT_TYPES.WORK) {
      const shiftHours = getShiftDurationHours(shift);
      totalsByEmployee[employeeId] = (totalsByEmployee[employeeId] || 0) + shiftHours;
      shiftsCountByEmployee[employeeId] = (shiftsCountByEmployee[employeeId] || 0) + 1;

      const scheduleType = inferShiftType(shift);
      if (!workBreakdownByEmployee[employeeId]) {
        workBreakdownByEmployee[employeeId] = { morning: 0, intermediate: 0, evening: 0, custom: 0 };
      }
      workBreakdownByEmployee[employeeId][scheduleType] =
        (workBreakdownByEmployee[employeeId][scheduleType] || 0) + 1;

      dayStatus.hasWork = true;
      employeeDayStatus[shift.date] = dayStatus;
      dayStatusByEmployee[employeeId] = employeeDayStatus;

      totalHours += shiftHours;
      return;
    }

    if (type === SHIFT_TYPES.REST) {
      dayStatus.hasRest = true;
    } else if (type === SHIFT_TYPES.LEAVE) {
      dayStatus.hasLeave = true;
    } else if (type === SHIFT_TYPES.SICK) {
      dayStatus.hasSick = true;
    }

    employeeDayStatus[shift.date] = dayStatus;
    dayStatusByEmployee[employeeId] = employeeDayStatus;
  });

  employees.forEach((employee) => {
    const employeeId = employee.id;
    const employeeDayStatus = dayStatusByEmployee[employeeId] || {};

    let explicitRestDays = 0;
    let inferredRestDays = 0;
    let leaveDays = 0;
    let sickDays = 0;
    let nonWorkingSundays = 0;

    visibleDays.forEach((date) => {
      const dayStatus = employeeDayStatus[date] || getDefaultDayStatus();
      const hasWork = Boolean(dayStatus.hasWork);

      if (!hasWork) {
        const nonWorkingCategory = resolveNonWorkingCategory(dayStatus);
        if (nonWorkingCategory === SHIFT_TYPES.SICK) {
          sickDays += 1;
        } else if (nonWorkingCategory === SHIFT_TYPES.LEAVE) {
          leaveDays += 1;
        } else if (nonWorkingCategory === SHIFT_TYPES.REST) {
          explicitRestDays += 1;
        } else if (!isSundayDate(date) && hasAnyEntryByDate[date]) {
          // Treat empty assignment as inferred rest only when the day has schedule activity.
          inferredRestDays += 1;
        }
      }

      if (isSundayDate(date) && !hasWork) {
        nonWorkingSundays += 1;
      }
    });

    const weekdayRestDays = explicitRestDays + inferredRestDays;
    const restDays = weekdayRestDays > 0 ? weekdayRestDays : nonWorkingSundays;

    leaveDaysByEmployee[employeeId] = {
      restDays,
      leaveDays,
      sickDays,
      nonWorkingSundays,
      inferredRestDays,
    };

    totalsByType.restDays += restDays;
    totalsByType.leaveDays += leaveDays;
    totalsByType.sickDays += sickDays;
    totalsByType.nonWorkingSundays += nonWorkingSundays;
  });

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    totalsByEmployee: Object.fromEntries(
      Object.entries(totalsByEmployee).map(([employeeId, hours]) => [
        employeeId,
        Math.round(hours * 100) / 100,
      ]),
    ),
    shiftsCountByEmployee,
    workBreakdownByEmployee,
    leaveDaysByEmployee,
    totalsByType,
  };
}
