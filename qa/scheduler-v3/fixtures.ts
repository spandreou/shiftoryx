import fixtures from '../../functions/src/public-demo/fixtures.json' with {type:'json'};

// One canonical fictional dataset is shared with hosted demo reset tooling.
export const QA_PROJECT = 'demo-shiftoryx-realistic';
export const QA_SUITE = 'scheduler-v3-realistic-v1';
export const PERIODS = { WEEK: ['2026-09-07','2026-09-13'], MONTH: ['2026-09-01','2026-09-30'] } as const;
export function realisticTenants(){return structuredClone(fixtures);}
