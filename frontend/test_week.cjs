const { differenceInCalendarWeeks } = require('date-fns');

const today = new Date();
const date = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); // next week

console.log(differenceInCalendarWeeks(date, today, { weekStartsOn: 1 }));

const currentWeekNum = 2; // say
const diffWeeks = differenceInCalendarWeeks(date, today, { weekStartsOn: 1 });
let targetWeek = ((currentWeekNum - 1 + diffWeeks) % 4) + 1;
if (targetWeek <= 0) targetWeek += 4;

console.log('Target week:', targetWeek);
