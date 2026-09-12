# Realistic Scheduler V3 — owner acceptance

QA data only. September 2026. Local emulator rehearsal; hosted activation is separate.

## Fuel Station Demo

Πρατήριο 06–22. Πέντε κανονικοί εργαζόμενοι και ένας ρητός αναπληρωματικός. Η άδεια του Γιάννη δυσκολεύει την πρωινή κάλυψη.

Target domain: qa-fuel.shiftoryx.gr; active employees: 6.

| Εργαζόμενος | Συμμετοχή | Ρεπό | Στόχος | Τυπικό | Rotation / alternate / anchor |
| --- | --- | --- | --- | --- | --- |
| QA Άννα | Κανονική | Κυριακή | 40 | 06:00–14:00 | 14:00–22:00 / 2026-09-07 |
| QA Γιάννης | Κανονική | Τρίτη | 40 | 06:00–14:00 | Όχι |
| QA Μαρία | Κανονική | Τετάρτη | 32 | 14:00–22:00 | Όχι |
| QA Πέτρος | Κανονική | Πέμπτη | 40 | 14:00–22:00 | Όχι |
| QA Ελένη | Κανονική | Σάββατο | 20 | 06:00–14:00 | Όχι |
| QA Νίκος — αναπλήρωση | Μόνο αναπλήρωση | Κυριακή | 20 | 14:00–22:00 | Όχι |

Coverage by weekday (headcount, not roles):

| Day | 06:00–14:00 | 14:00–22:00 |
| --- | --- | --- |
| MONDAY | 2 | 2 |
| TUESDAY | 2 | 2 |
| WEDNESDAY | 2 | 2 |
| THURSDAY | 2 | 2 |
| FRIDAY | 2 | 2 |
| SATURDAY | 2 | 2 |
| SUNDAY | 1 | 1 |

Absences: QA Γιάννης: 2026-09-09–2026-09-11.

### Actual WEEK schedule

| Εργαζόμενος | 2026-09-07 | 2026-09-08 | 2026-09-09 | 2026-09-10 | 2026-09-11 | 2026-09-12 | 2026-09-13 | Ώρες |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA Άννα | 06:00–14:00 | 06:00–14:00 | 06:00–14:00 | 06:00–14:00 | 06:00–14:00 | 06:00–14:00 | — | 48 |
| QA Γιάννης | 06:00–14:00 | — | — | — | — | 06:00–14:00 | 06:00–14:00 | 24 |
| QA Μαρία | 14:00–22:00 | 14:00–22:00 | — | 14:00–22:00 | 14:00–22:00 | 14:00–22:00 | — | 40 |
| QA Πέτρος | 14:00–22:00 | 14:00–22:00 | 14:00–22:00 | — | 14:00–22:00 | 14:00–22:00 | 14:00–22:00 | 48 |
| QA Ελένη | — | 06:00–14:00 | 06:00–14:00 | 06:00–14:00 | 06:00–14:00 | — | — | 32 |
| QA Νίκος — αναπλήρωση | — | — | 14:00–22:00 | 14:00–22:00 | — | — | — | 16 |

### WEEK totals and weekly deltas

26 assignments. Standard-time matches: 26/26.

| Employee | Hours | Shifts |
| --- | --- | --- |
| QA Άννα | 48 | 6 |
| QA Γιάννης | 24 | 3 |
| QA Μαρία | 40 | 5 |
| QA Πέτρος | 48 | 6 |
| QA Ελένη | 32 | 4 |
| QA Νίκος — αναπλήρωση | 16 | 2 |

| Employee | Week | Actual | Target | Delta | Partial week |
| --- | --- | --- | --- | --- | --- |
| QA Άννα | 2026-09-07 | 48 | 40 | 8 | false |
| QA Γιάννης | 2026-09-07 | 24 | 40 | -16 | false |
| QA Μαρία | 2026-09-07 | 40 | 32 | 8 | false |
| QA Πέτρος | 2026-09-07 | 48 | 40 | 8 | false |
| QA Ελένη | 2026-09-07 | 32 | 20 | 12 | false |
| QA Νίκος — αναπλήρωση | 2026-09-07 | 16 | 20 | -4 | false |

Warnings (including coverage shortages/surplus):

| Code | Date | Shift | Employee | Message |
| --- | --- | --- | --- | --- |
| TARGET_HOURS_OVER | — | — | QA Άννα | Ώρες 48 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Γιάννης | Ώρες 24 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Μαρία | Ώρες 40 / στόχος 32 |
| TARGET_HOURS_OVER | — | — | QA Πέτρος | Ώρες 48 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Ελένη | Ώρες 32 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Νίκος — αναπλήρωση | Ώρες 16 / στόχος 20 |

### MONTH totals and weekly deltas

112 assignments. Standard-time matches: 105/112.

| Employee | Hours | Shifts |
| --- | --- | --- |
| QA Άννα | 200 | 25 |
| QA Γιάννης | 176 | 22 |
| QA Μαρία | 160 | 20 |
| QA Πέτρος | 192 | 24 |
| QA Ελένη | 152 | 19 |
| QA Νίκος — αναπλήρωση | 16 | 2 |

| Employee | Week | Actual | Target | Delta | Partial week |
| --- | --- | --- | --- | --- | --- |
| QA Άννα | 2026-08-31 | 40 | 40 | 0 | true |
| QA Άννα | 2026-09-07 | 48 | 40 | 8 | false |
| QA Άννα | 2026-09-14 | 40 | 40 | 0 | false |
| QA Άννα | 2026-09-21 | 48 | 40 | 8 | false |
| QA Άννα | 2026-09-28 | 24 | 40 | -16 | true |
| QA Γιάννης | 2026-08-31 | 40 | 40 | 0 | true |
| QA Γιάννης | 2026-09-07 | 24 | 40 | -16 | false |
| QA Γιάννης | 2026-09-14 | 48 | 40 | 8 | false |
| QA Γιάννης | 2026-09-21 | 48 | 40 | 8 | false |
| QA Γιάννης | 2026-09-28 | 16 | 40 | -24 | true |
| QA Μαρία | 2026-08-31 | 32 | 32 | 0 | true |
| QA Μαρία | 2026-09-07 | 40 | 32 | 8 | false |
| QA Μαρία | 2026-09-14 | 40 | 32 | 8 | false |
| QA Μαρία | 2026-09-21 | 40 | 32 | 8 | false |
| QA Μαρία | 2026-09-28 | 8 | 32 | -24 | true |
| QA Πέτρος | 2026-08-31 | 32 | 40 | -8 | true |
| QA Πέτρος | 2026-09-07 | 48 | 40 | 8 | false |
| QA Πέτρος | 2026-09-14 | 40 | 40 | 0 | false |
| QA Πέτρος | 2026-09-21 | 48 | 40 | 8 | false |
| QA Πέτρος | 2026-09-28 | 24 | 40 | -16 | true |
| QA Ελένη | 2026-08-31 | 32 | 20 | 12 | true |
| QA Ελένη | 2026-09-07 | 32 | 20 | 12 | false |
| QA Ελένη | 2026-09-14 | 40 | 20 | 20 | false |
| QA Ελένη | 2026-09-21 | 24 | 20 | 4 | false |
| QA Ελένη | 2026-09-28 | 24 | 20 | 4 | true |
| QA Νίκος — αναπλήρωση | 2026-08-31 | 0 | 20 | -20 | true |
| QA Νίκος — αναπλήρωση | 2026-09-07 | 16 | 20 | -4 | false |
| QA Νίκος — αναπλήρωση | 2026-09-14 | 0 | 20 | -20 | false |
| QA Νίκος — αναπλήρωση | 2026-09-21 | 0 | 20 | -20 | false |
| QA Νίκος — αναπλήρωση | 2026-09-28 | 0 | 20 | -20 | true |

Warnings (including coverage shortages/surplus):

| Code | Date | Shift | Employee | Message |
| --- | --- | --- | --- | --- |
| STANDARD_SHIFT_DEVIATION | 2026-09-01 | — | QA Άννα | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-05 | — | QA Μαρία | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-15 | — | QA Μαρία | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-19 | — | QA Άννα | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-23 | — | QA Ελένη | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-24 | — | QA Ελένη | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-29 | — | QA Μαρία | Απόκλιση από την τυπική βάρδια. |
| TARGET_HOURS_OVER | — | — | QA Άννα | Ώρες 48 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Άννα | Ώρες 48 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Άννα | Ώρες 24 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Γιάννης | Ώρες 24 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Γιάννης | Ώρες 48 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Γιάννης | Ώρες 48 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Γιάννης | Ώρες 16 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Μαρία | Ώρες 40 / στόχος 32 |
| TARGET_HOURS_OVER | — | — | QA Μαρία | Ώρες 40 / στόχος 32 |
| TARGET_HOURS_OVER | — | — | QA Μαρία | Ώρες 40 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Μαρία | Ώρες 8 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Πέτρος | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Πέτρος | Ώρες 48 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Πέτρος | Ώρες 48 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Πέτρος | Ώρες 24 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Ελένη | Ώρες 32 / στόχος 20 |
| TARGET_HOURS_OVER | — | — | QA Ελένη | Ώρες 32 / στόχος 20 |
| TARGET_HOURS_OVER | — | — | QA Ελένη | Ώρες 40 / στόχος 20 |
| TARGET_HOURS_OVER | — | — | QA Ελένη | Ώρες 24 / στόχος 20 |
| TARGET_HOURS_OVER | — | — | QA Ελένη | Ώρες 24 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Νίκος — αναπλήρωση | Ώρες 0 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Νίκος — αναπλήρωση | Ώρες 16 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Νίκος — αναπλήρωση | Ώρες 0 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Νίκος — αναπλήρωση | Ώρες 0 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Νίκος — αναπλήρωση | Ώρες 0 / στόχος 20 |

Manual scenario: QA Άννα, 2026-09-13, +8h; fixed-off warning visible; publishing after acknowledgment succeeds.

## Café Demo

Καφέ με πρωινή αιχμή και αυξημένη ζήτηση Παρασκευή/Σαββατοκύριακο. Η άδεια της Σοφίας απαιτεί ανακατανομή.

Target domain: qa-cafe.shiftoryx.gr; active employees: 8.

| Εργαζόμενος | Συμμετοχή | Ρεπό | Στόχος | Τυπικό | Rotation / alternate / anchor |
| --- | --- | --- | --- | --- | --- |
| QA Σοφία | Κανονική | Δευτέρα | 40 | 06:00–14:00 | Όχι |
| QA Κώστας | Κανονική | Τρίτη | 40 | 06:00–14:00 | Όχι |
| QA Δανάη | Κανονική | Τετάρτη | 32 | 10:00–18:00 | Όχι |
| QA Αλέξης | Κανονική | Πέμπτη | 40 | 14:00–22:00 | Όχι |
| QA Λένα | Κανονική | Παρασκευή | 20 | 10:00–18:00 | Όχι |
| QA Μάνος | Κανονική | Δευτέρα | 32 | 14:00–22:00 | Όχι |
| QA Ιωάννα | Κανονική | Τρίτη | 20 | 06:00–14:00 | Όχι |
| QA Ορέστης | Κανονική | Τετάρτη | 32 | 14:00–22:00 | Όχι |

Coverage by weekday (headcount, not roles):

| Day | 06:00–14:00 | 10:00–18:00 | 14:00–22:00 |
| --- | --- | --- | --- |
| MONDAY | 2 | 1 | 1 |
| TUESDAY | 2 | 1 | 1 |
| WEDNESDAY | 2 | 1 | 1 |
| THURSDAY | 2 | 1 | 2 |
| FRIDAY | 2 | 2 | 2 |
| SATURDAY | 3 | 2 | 3 |
| SUNDAY | 2 | 2 | 2 |

Absences: QA Σοφία: 2026-09-10–2026-09-12.

### Actual WEEK schedule

| Εργαζόμενος | 2026-09-07 | 2026-09-08 | 2026-09-09 | 2026-09-10 | 2026-09-11 | 2026-09-12 | 2026-09-13 | Ώρες |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA Σοφία | — | 06:00–14:00 | 06:00–14:00 | — | — | — | 06:00–14:00 | 24 |
| QA Κώστας | 06:00–14:00 | — | 06:00–14:00 | 06:00–14:00 | 06:00–14:00 | 06:00–14:00 | 06:00–14:00 | 48 |
| QA Δανάη | 10:00–18:00 | 10:00–18:00 | — | 10:00–18:00 | 10:00–18:00 | 10:00–18:00 | 10:00–18:00 | 48 |
| QA Αλέξης | 14:00–22:00 | — | 14:00–22:00 | — | 14:00–22:00 | 14:00–22:00 | 14:00–22:00 | 40 |
| QA Λένα | — | — | 10:00–18:00 | — | — | 06:00–14:00 | 10:00–18:00 | 24 |
| QA Μάνος | — | 06:00–14:00 | — | 14:00–22:00 | 14:00–22:00 | 14:00–22:00 | 14:00–22:00 | 40 |
| QA Ιωάννα | 06:00–14:00 | — | — | 06:00–14:00 | 06:00–14:00 | 06:00–14:00 | — | 32 |
| QA Ορέστης | — | 14:00–22:00 | — | 14:00–22:00 | 10:00–18:00 | 14:00–22:00 | — | 32 |

### WEEK totals and weekly deltas

36 assignments. Standard-time matches: 33/36.

| Employee | Hours | Shifts |
| --- | --- | --- |
| QA Σοφία | 24 | 3 |
| QA Κώστας | 48 | 6 |
| QA Δανάη | 48 | 6 |
| QA Αλέξης | 40 | 5 |
| QA Λένα | 24 | 3 |
| QA Μάνος | 40 | 5 |
| QA Ιωάννα | 32 | 4 |
| QA Ορέστης | 32 | 4 |

| Employee | Week | Actual | Target | Delta | Partial week |
| --- | --- | --- | --- | --- | --- |
| QA Σοφία | 2026-09-07 | 24 | 40 | -16 | false |
| QA Κώστας | 2026-09-07 | 48 | 40 | 8 | false |
| QA Δανάη | 2026-09-07 | 48 | 32 | 16 | false |
| QA Αλέξης | 2026-09-07 | 40 | 40 | 0 | false |
| QA Λένα | 2026-09-07 | 24 | 20 | 4 | false |
| QA Μάνος | 2026-09-07 | 40 | 32 | 8 | false |
| QA Ιωάννα | 2026-09-07 | 32 | 20 | 12 | false |
| QA Ορέστης | 2026-09-07 | 32 | 32 | 0 | false |

Warnings (including coverage shortages/surplus):

| Code | Date | Shift | Employee | Message |
| --- | --- | --- | --- | --- |
| COVERAGE_UNDER_TARGET | 2026-09-12 | 10:00–18:00 | — | Κάλυψη 1/2 στις 2026-09-12 |
| STANDARD_SHIFT_DEVIATION | 2026-09-08 | — | QA Μάνος | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-11 | — | QA Ορέστης | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-12 | — | QA Λένα | Απόκλιση από την τυπική βάρδια. |
| TARGET_HOURS_UNDER | — | — | QA Σοφία | Ώρες 24 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Κώστας | Ώρες 48 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Δανάη | Ώρες 48 / στόχος 32 |
| TARGET_HOURS_OVER | — | — | QA Λένα | Ώρες 24 / στόχος 20 |
| TARGET_HOURS_OVER | — | — | QA Μάνος | Ώρες 40 / στόχος 32 |
| TARGET_HOURS_OVER | — | — | QA Ιωάννα | Ώρες 32 / στόχος 20 |

### MONTH totals and weekly deltas

155 assignments. Standard-time matches: 145/155.

| Employee | Hours | Shifts |
| --- | --- | --- |
| QA Σοφία | 176 | 22 |
| QA Κώστας | 184 | 23 |
| QA Δανάη | 200 | 25 |
| QA Αλέξης | 176 | 22 |
| QA Λένα | 104 | 13 |
| QA Μάνος | 160 | 20 |
| QA Ιωάννα | 104 | 13 |
| QA Ορέστης | 136 | 17 |

| Employee | Week | Actual | Target | Delta | Partial week |
| --- | --- | --- | --- | --- | --- |
| QA Σοφία | 2026-08-31 | 40 | 40 | 0 | true |
| QA Σοφία | 2026-09-07 | 24 | 40 | -16 | false |
| QA Σοφία | 2026-09-14 | 48 | 40 | 8 | false |
| QA Σοφία | 2026-09-21 | 48 | 40 | 8 | false |
| QA Σοφία | 2026-09-28 | 16 | 40 | -24 | true |
| QA Κώστας | 2026-08-31 | 40 | 40 | 0 | true |
| QA Κώστας | 2026-09-07 | 48 | 40 | 8 | false |
| QA Κώστας | 2026-09-14 | 40 | 40 | 0 | false |
| QA Κώστας | 2026-09-21 | 40 | 40 | 0 | false |
| QA Κώστας | 2026-09-28 | 16 | 40 | -24 | true |
| QA Δανάη | 2026-08-31 | 40 | 32 | 8 | true |
| QA Δανάη | 2026-09-07 | 48 | 32 | 16 | false |
| QA Δανάη | 2026-09-14 | 48 | 32 | 16 | false |
| QA Δανάη | 2026-09-21 | 48 | 32 | 16 | false |
| QA Δανάη | 2026-09-28 | 16 | 32 | -16 | true |
| QA Αλέξης | 2026-08-31 | 40 | 40 | 0 | true |
| QA Αλέξης | 2026-09-07 | 40 | 40 | 0 | false |
| QA Αλέξης | 2026-09-14 | 40 | 40 | 0 | false |
| QA Αλέξης | 2026-09-21 | 40 | 40 | 0 | false |
| QA Αλέξης | 2026-09-28 | 16 | 40 | -24 | true |
| QA Λένα | 2026-08-31 | 24 | 20 | 4 | true |
| QA Λένα | 2026-09-07 | 24 | 20 | 4 | false |
| QA Λένα | 2026-09-14 | 24 | 20 | 4 | false |
| QA Λένα | 2026-09-21 | 24 | 20 | 4 | false |
| QA Λένα | 2026-09-28 | 8 | 20 | -12 | true |
| QA Μάνος | 2026-08-31 | 32 | 32 | 0 | true |
| QA Μάνος | 2026-09-07 | 40 | 32 | 8 | false |
| QA Μάνος | 2026-09-14 | 40 | 32 | 8 | false |
| QA Μάνος | 2026-09-21 | 40 | 32 | 8 | false |
| QA Μάνος | 2026-09-28 | 8 | 32 | -24 | true |
| QA Ιωάννα | 2026-08-31 | 16 | 20 | -4 | true |
| QA Ιωάννα | 2026-09-07 | 32 | 20 | 12 | false |
| QA Ιωάννα | 2026-09-14 | 24 | 20 | 4 | false |
| QA Ιωάννα | 2026-09-21 | 24 | 20 | 4 | false |
| QA Ιωάννα | 2026-09-28 | 8 | 20 | -12 | true |
| QA Ορέστης | 2026-08-31 | 32 | 32 | 0 | true |
| QA Ορέστης | 2026-09-07 | 32 | 32 | 0 | false |
| QA Ορέστης | 2026-09-14 | 32 | 32 | 0 | false |
| QA Ορέστης | 2026-09-21 | 32 | 32 | 0 | false |
| QA Ορέστης | 2026-09-28 | 8 | 32 | -24 | true |

Warnings (including coverage shortages/surplus):

| Code | Date | Shift | Employee | Message |
| --- | --- | --- | --- | --- |
| COVERAGE_UNDER_TARGET | 2026-09-12 | 10:00–18:00 | — | Κάλυψη 1/2 στις 2026-09-12 |
| STANDARD_SHIFT_DEVIATION | 2026-09-01 | — | QA Αλέξης | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-04 | — | QA Μάνος | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-08 | — | QA Μάνος | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-11 | — | QA Ορέστης | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-12 | — | QA Λένα | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-15 | — | QA Μάνος | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-18 | — | QA Ορέστης | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-22 | — | QA Μάνος | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-25 | — | QA Ορέστης | Απόκλιση από την τυπική βάρδια. |
| STANDARD_SHIFT_DEVIATION | 2026-09-29 | — | QA Μάνος | Απόκλιση από την τυπική βάρδια. |
| TARGET_HOURS_UNDER | — | — | QA Σοφία | Ώρες 24 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Σοφία | Ώρες 48 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Σοφία | Ώρες 48 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Σοφία | Ώρες 16 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Κώστας | Ώρες 48 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Κώστας | Ώρες 16 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Δανάη | Ώρες 40 / στόχος 32 |
| TARGET_HOURS_OVER | — | — | QA Δανάη | Ώρες 48 / στόχος 32 |
| TARGET_HOURS_OVER | — | — | QA Δανάη | Ώρες 48 / στόχος 32 |
| TARGET_HOURS_OVER | — | — | QA Δανάη | Ώρες 48 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Δανάη | Ώρες 16 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Αλέξης | Ώρες 16 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Λένα | Ώρες 24 / στόχος 20 |
| TARGET_HOURS_OVER | — | — | QA Λένα | Ώρες 24 / στόχος 20 |
| TARGET_HOURS_OVER | — | — | QA Λένα | Ώρες 24 / στόχος 20 |
| TARGET_HOURS_OVER | — | — | QA Λένα | Ώρες 24 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Λένα | Ώρες 8 / στόχος 20 |
| TARGET_HOURS_OVER | — | — | QA Μάνος | Ώρες 40 / στόχος 32 |
| TARGET_HOURS_OVER | — | — | QA Μάνος | Ώρες 40 / στόχος 32 |
| TARGET_HOURS_OVER | — | — | QA Μάνος | Ώρες 40 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Μάνος | Ώρες 8 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Ιωάννα | Ώρες 16 / στόχος 20 |
| TARGET_HOURS_OVER | — | — | QA Ιωάννα | Ώρες 32 / στόχος 20 |
| TARGET_HOURS_OVER | — | — | QA Ιωάννα | Ώρες 24 / στόχος 20 |
| TARGET_HOURS_OVER | — | — | QA Ιωάννα | Ώρες 24 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Ιωάννα | Ώρες 8 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Ορέστης | Ώρες 8 / στόχος 32 |

Manual scenario: QA Σοφία, 2026-09-07, +8h; fixed-off warning visible; publishing after acknowledgment succeeds.

## Hair Salon Demo

Κομμωτήριο Τρίτη–Σάββατο. Δύο ανεξάρτητες εναλλαγές εξάωρων βαρδιών και σταθερά προσωπικά ωράρια.

Target domain: qa-salon.shiftoryx.gr; active employees: 6.

| Εργαζόμενος | Συμμετοχή | Ρεπό | Στόχος | Τυπικό | Rotation / alternate / anchor |
| --- | --- | --- | --- | --- | --- |
| QA Χριστίνα | Κανονική | Δευτέρα | 32 | 08:00–14:00 | 14:00–20:00 / 2026-09-07 |
| QA Βασίλης | Κανονική | Κυριακή | 32 | 14:00–20:00 | 08:00–14:00 / 2026-09-07 |
| QA Νάντια | Κανονική | Δευτέρα | 40 | 10:00–18:00 | Όχι |
| QA Άρης | Κανονική | Κυριακή | 40 | 10:00–18:00 | Όχι |
| QA Ράνια | Κανονική | Τετάρτη | 32 | 14:00–20:00 | Όχι |
| QA Δήμητρα | Κανονική | Τρίτη | 32 | 08:00–14:00 | Όχι |

Coverage by weekday (headcount, not roles):

| Day | 08:00–14:00 | 10:00–18:00 | 14:00–20:00 |
| --- | --- | --- | --- |
| MONDAY | 0 | 0 | 0 |
| TUESDAY | 1 | 1 | 1 |
| WEDNESDAY | 1 | 1 | 1 |
| THURSDAY | 1 | 2 | 1 |
| FRIDAY | 1 | 2 | 1 |
| SATURDAY | 2 | 2 | 2 |
| SUNDAY | 0 | 0 | 0 |

Absences: None.

### Actual WEEK schedule

| Εργαζόμενος | 2026-09-07 | 2026-09-08 | 2026-09-09 | 2026-09-10 | 2026-09-11 | 2026-09-12 | 2026-09-13 | Ώρες |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA Χριστίνα | — | 08:00–14:00 | — | 08:00–14:00 | — | 08:00–14:00 | — | 18 |
| QA Βασίλης | — | 14:00–20:00 | 14:00–20:00 | — | — | 14:00–20:00 | — | 18 |
| QA Νάντια | — | 10:00–18:00 | — | 10:00–18:00 | 10:00–18:00 | 10:00–18:00 | — | 32 |
| QA Άρης | — | — | 10:00–18:00 | 10:00–18:00 | 10:00–18:00 | 10:00–18:00 | — | 32 |
| QA Ράνια | — | — | — | 14:00–20:00 | 14:00–20:00 | 14:00–20:00 | — | 18 |
| QA Δήμητρα | — | — | 08:00–14:00 | — | 08:00–14:00 | 08:00–14:00 | — | 18 |

### WEEK totals and weekly deltas

20 assignments. Standard-time matches: 20/20.

| Employee | Hours | Shifts |
| --- | --- | --- |
| QA Χριστίνα | 18 | 3 |
| QA Βασίλης | 18 | 3 |
| QA Νάντια | 32 | 4 |
| QA Άρης | 32 | 4 |
| QA Ράνια | 18 | 3 |
| QA Δήμητρα | 18 | 3 |

| Employee | Week | Actual | Target | Delta | Partial week |
| --- | --- | --- | --- | --- | --- |
| QA Χριστίνα | 2026-09-07 | 18 | 32 | -14 | false |
| QA Βασίλης | 2026-09-07 | 18 | 32 | -14 | false |
| QA Νάντια | 2026-09-07 | 32 | 40 | -8 | false |
| QA Άρης | 2026-09-07 | 32 | 40 | -8 | false |
| QA Ράνια | 2026-09-07 | 18 | 32 | -14 | false |
| QA Δήμητρα | 2026-09-07 | 18 | 32 | -14 | false |

Warnings (including coverage shortages/surplus):

| Code | Date | Shift | Employee | Message |
| --- | --- | --- | --- | --- |
| TARGET_HOURS_UNDER | — | — | QA Χριστίνα | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Βασίλης | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Νάντια | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Άρης | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Ράνια | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Δήμητρα | Ώρες 18 / στόχος 32 |

### MONTH totals and weekly deltas

86 assignments. Standard-time matches: 86/86.

| Employee | Hours | Shifts |
| --- | --- | --- |
| QA Χριστίνα | 84 | 14 |
| QA Βασίλης | 78 | 13 |
| QA Νάντια | 136 | 17 |
| QA Άρης | 136 | 17 |
| QA Ράνια | 72 | 12 |
| QA Δήμητρα | 78 | 13 |

| Employee | Week | Actual | Target | Delta | Partial week |
| --- | --- | --- | --- | --- | --- |
| QA Χριστίνα | 2026-08-31 | 18 | 32 | -14 | true |
| QA Χριστίνα | 2026-09-07 | 18 | 32 | -14 | false |
| QA Χριστίνα | 2026-09-14 | 18 | 32 | -14 | false |
| QA Χριστίνα | 2026-09-21 | 18 | 32 | -14 | false |
| QA Χριστίνα | 2026-09-28 | 12 | 32 | -20 | true |
| QA Βασίλης | 2026-08-31 | 18 | 32 | -14 | true |
| QA Βασίλης | 2026-09-07 | 18 | 32 | -14 | false |
| QA Βασίλης | 2026-09-14 | 18 | 32 | -14 | false |
| QA Βασίλης | 2026-09-21 | 18 | 32 | -14 | false |
| QA Βασίλης | 2026-09-28 | 6 | 32 | -26 | true |
| QA Νάντια | 2026-08-31 | 32 | 40 | -8 | true |
| QA Νάντια | 2026-09-07 | 32 | 40 | -8 | false |
| QA Νάντια | 2026-09-14 | 32 | 40 | -8 | false |
| QA Νάντια | 2026-09-21 | 32 | 40 | -8 | false |
| QA Νάντια | 2026-09-28 | 8 | 40 | -32 | true |
| QA Άρης | 2026-08-31 | 32 | 40 | -8 | true |
| QA Άρης | 2026-09-07 | 32 | 40 | -8 | false |
| QA Άρης | 2026-09-14 | 32 | 40 | -8 | false |
| QA Άρης | 2026-09-21 | 32 | 40 | -8 | false |
| QA Άρης | 2026-09-28 | 8 | 40 | -32 | true |
| QA Ράνια | 2026-08-31 | 18 | 32 | -14 | true |
| QA Ράνια | 2026-09-07 | 18 | 32 | -14 | false |
| QA Ράνια | 2026-09-14 | 18 | 32 | -14 | false |
| QA Ράνια | 2026-09-21 | 18 | 32 | -14 | false |
| QA Ράνια | 2026-09-28 | 0 | 32 | -32 | true |
| QA Δήμητρα | 2026-08-31 | 18 | 32 | -14 | true |
| QA Δήμητρα | 2026-09-07 | 18 | 32 | -14 | false |
| QA Δήμητρα | 2026-09-14 | 18 | 32 | -14 | false |
| QA Δήμητρα | 2026-09-21 | 18 | 32 | -14 | false |
| QA Δήμητρα | 2026-09-28 | 6 | 32 | -26 | true |

Warnings (including coverage shortages/surplus):

| Code | Date | Shift | Employee | Message |
| --- | --- | --- | --- | --- |
| TARGET_HOURS_UNDER | — | — | QA Χριστίνα | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Χριστίνα | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Χριστίνα | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Χριστίνα | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Χριστίνα | Ώρες 12 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Βασίλης | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Βασίλης | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Βασίλης | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Βασίλης | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Βασίλης | Ώρες 6 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Νάντια | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Νάντια | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Νάντια | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Νάντια | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Νάντια | Ώρες 8 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Άρης | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Άρης | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Άρης | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Άρης | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Άρης | Ώρες 8 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Ράνια | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Ράνια | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Ράνια | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Ράνια | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Ράνια | Ώρες 0 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Δήμητρα | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Δήμητρα | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Δήμητρα | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Δήμητρα | Ώρες 18 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Δήμητρα | Ώρες 6 / στόχος 32 |

Manual scenario: QA Χριστίνα, 2026-09-07, +6h; fixed-off warning visible; publishing after acknowledgment succeeds.

## Mini Market Demo

Mini market επτά ημερών με τρία άτομα ανά βάρδια το Σάββατο και μειωμένο απογευματινό προσωπικό Κυριακής.

Target domain: qa-market.shiftoryx.gr; active employees: 9.

| Εργαζόμενος | Συμμετοχή | Ρεπό | Στόχος | Τυπικό | Rotation / alternate / anchor |
| --- | --- | --- | --- | --- | --- |
| QA Γιώργος | Κανονική | Δευτέρα | 40 | 07:00–15:00 | Όχι |
| QA Κατερίνα | Κανονική | Τρίτη | 40 | 07:00–15:00 | Όχι |
| QA Στέλιος | Κανονική | Τετάρτη | 32 | 15:00–23:00 | Όχι |
| QA Αθηνά | Κανονική | Πέμπτη | 40 | 15:00–23:00 | Όχι |
| QA Θοδωρής | Κανονική | Παρασκευή | 32 | 07:00–15:00 | Όχι |
| QA Βίκυ | Κανονική | Σάββατο | 20 | 15:00–23:00 | Όχι |
| QA Ηλίας | Κανονική | Κυριακή | 40 | 07:00–15:00 | Όχι |
| QA Μυρτώ | Κανονική | Τρίτη | 32 | 15:00–23:00 | Όχι |
| QA Τάσος | Κανονική | Τετάρτη | 20 | 07:00–15:00 | Όχι |

Coverage by weekday (headcount, not roles):

| Day | 07:00–15:00 | 15:00–23:00 |
| --- | --- | --- |
| MONDAY | 2 | 2 |
| TUESDAY | 2 | 2 |
| WEDNESDAY | 2 | 2 |
| THURSDAY | 2 | 2 |
| FRIDAY | 2 | 2 |
| SATURDAY | 3 | 3 |
| SUNDAY | 3 | 2 |

Absences: QA Στέλιος: 2026-09-11–2026-09-13.

### Actual WEEK schedule

| Εργαζόμενος | 2026-09-07 | 2026-09-08 | 2026-09-09 | 2026-09-10 | 2026-09-11 | 2026-09-12 | 2026-09-13 | Ώρες |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA Γιώργος | — | 07:00–15:00 | 07:00–15:00 | — | 07:00–15:00 | 07:00–15:00 | 07:00–15:00 | 40 |
| QA Κατερίνα | 07:00–15:00 | — | — | 07:00–15:00 | — | 07:00–15:00 | 07:00–15:00 | 32 |
| QA Στέλιος | — | 15:00–23:00 | — | 15:00–23:00 | — | — | — | 16 |
| QA Αθηνά | 15:00–23:00 | 15:00–23:00 | 15:00–23:00 | — | 15:00–23:00 | 15:00–23:00 | — | 40 |
| QA Θοδωρής | — | 07:00–15:00 | — | 07:00–15:00 | — | 15:00–23:00 | — | 24 |
| QA Βίκυ | — | — | — | 15:00–23:00 | — | — | 15:00–23:00 | 16 |
| QA Ηλίας | 07:00–15:00 | — | 07:00–15:00 | — | 07:00–15:00 | — | — | 24 |
| QA Μυρτώ | 15:00–23:00 | — | 15:00–23:00 | — | 15:00–23:00 | 15:00–23:00 | 15:00–23:00 | 40 |
| QA Τάσος | — | — | — | — | — | 07:00–15:00 | 07:00–15:00 | 16 |

### WEEK totals and weekly deltas

31 assignments. Standard-time matches: 30/31.

| Employee | Hours | Shifts |
| --- | --- | --- |
| QA Γιώργος | 40 | 5 |
| QA Κατερίνα | 32 | 4 |
| QA Στέλιος | 16 | 2 |
| QA Αθηνά | 40 | 5 |
| QA Θοδωρής | 24 | 3 |
| QA Βίκυ | 16 | 2 |
| QA Ηλίας | 24 | 3 |
| QA Μυρτώ | 40 | 5 |
| QA Τάσος | 16 | 2 |

| Employee | Week | Actual | Target | Delta | Partial week |
| --- | --- | --- | --- | --- | --- |
| QA Γιώργος | 2026-09-07 | 40 | 40 | 0 | false |
| QA Κατερίνα | 2026-09-07 | 32 | 40 | -8 | false |
| QA Στέλιος | 2026-09-07 | 16 | 32 | -16 | false |
| QA Αθηνά | 2026-09-07 | 40 | 40 | 0 | false |
| QA Θοδωρής | 2026-09-07 | 24 | 32 | -8 | false |
| QA Βίκυ | 2026-09-07 | 16 | 20 | -4 | false |
| QA Ηλίας | 2026-09-07 | 24 | 40 | -16 | false |
| QA Μυρτώ | 2026-09-07 | 40 | 32 | 8 | false |
| QA Τάσος | 2026-09-07 | 16 | 20 | -4 | false |

Warnings (including coverage shortages/surplus):

| Code | Date | Shift | Employee | Message |
| --- | --- | --- | --- | --- |
| STANDARD_SHIFT_DEVIATION | 2026-09-12 | — | QA Θοδωρής | Απόκλιση από την τυπική βάρδια. |
| TARGET_HOURS_UNDER | — | — | QA Κατερίνα | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Στέλιος | Ώρες 16 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Θοδωρής | Ώρες 24 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Βίκυ | Ώρες 16 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Ηλίας | Ώρες 24 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Μυρτώ | Ώρες 40 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Τάσος | Ώρες 16 / στόχος 20 |

### MONTH totals and weekly deltas

132 assignments. Standard-time matches: 131/132.

| Employee | Hours | Shifts |
| --- | --- | --- |
| QA Γιώργος | 152 | 19 |
| QA Κατερίνα | 136 | 17 |
| QA Στέλιος | 112 | 14 |
| QA Αθηνά | 176 | 22 |
| QA Θοδωρής | 96 | 12 |
| QA Βίκυ | 64 | 8 |
| QA Ηλίας | 112 | 14 |
| QA Μυρτώ | 152 | 19 |
| QA Τάσος | 56 | 7 |

| Employee | Week | Actual | Target | Delta | Partial week |
| --- | --- | --- | --- | --- | --- |
| QA Γιώργος | 2026-08-31 | 32 | 40 | -8 | true |
| QA Γιώργος | 2026-09-07 | 40 | 40 | 0 | false |
| QA Γιώργος | 2026-09-14 | 32 | 40 | -8 | false |
| QA Γιώργος | 2026-09-21 | 32 | 40 | -8 | false |
| QA Γιώργος | 2026-09-28 | 16 | 40 | -24 | true |
| QA Κατερίνα | 2026-08-31 | 32 | 40 | -8 | true |
| QA Κατερίνα | 2026-09-07 | 32 | 40 | -8 | false |
| QA Κατερίνα | 2026-09-14 | 32 | 40 | -8 | false |
| QA Κατερίνα | 2026-09-21 | 32 | 40 | -8 | false |
| QA Κατερίνα | 2026-09-28 | 8 | 40 | -32 | true |
| QA Στέλιος | 2026-08-31 | 24 | 32 | -8 | true |
| QA Στέλιος | 2026-09-07 | 16 | 32 | -16 | false |
| QA Στέλιος | 2026-09-14 | 32 | 32 | 0 | false |
| QA Στέλιος | 2026-09-21 | 32 | 32 | 0 | false |
| QA Στέλιος | 2026-09-28 | 8 | 32 | -24 | true |
| QA Αθηνά | 2026-08-31 | 32 | 40 | -8 | true |
| QA Αθηνά | 2026-09-07 | 40 | 40 | 0 | false |
| QA Αθηνά | 2026-09-14 | 40 | 40 | 0 | false |
| QA Αθηνά | 2026-09-21 | 40 | 40 | 0 | false |
| QA Αθηνά | 2026-09-28 | 24 | 40 | -16 | true |
| QA Θοδωρής | 2026-08-31 | 16 | 32 | -16 | true |
| QA Θοδωρής | 2026-09-07 | 24 | 32 | -8 | false |
| QA Θοδωρής | 2026-09-14 | 24 | 32 | -8 | false |
| QA Θοδωρής | 2026-09-21 | 24 | 32 | -8 | false |
| QA Θοδωρής | 2026-09-28 | 8 | 32 | -24 | true |
| QA Βίκυ | 2026-08-31 | 16 | 20 | -4 | true |
| QA Βίκυ | 2026-09-07 | 16 | 20 | -4 | false |
| QA Βίκυ | 2026-09-14 | 16 | 20 | -4 | false |
| QA Βίκυ | 2026-09-21 | 16 | 20 | -4 | false |
| QA Βίκυ | 2026-09-28 | 0 | 20 | -20 | true |
| QA Ηλίας | 2026-08-31 | 24 | 40 | -16 | true |
| QA Ηλίας | 2026-09-07 | 24 | 40 | -16 | false |
| QA Ηλίας | 2026-09-14 | 24 | 40 | -16 | false |
| QA Ηλίας | 2026-09-21 | 24 | 40 | -16 | false |
| QA Ηλίας | 2026-09-28 | 16 | 40 | -24 | true |
| QA Μυρτώ | 2026-08-31 | 32 | 32 | 0 | true |
| QA Μυρτώ | 2026-09-07 | 40 | 32 | 8 | false |
| QA Μυρτώ | 2026-09-14 | 32 | 32 | 0 | false |
| QA Μυρτώ | 2026-09-21 | 32 | 32 | 0 | false |
| QA Μυρτώ | 2026-09-28 | 16 | 32 | -16 | true |
| QA Τάσος | 2026-08-31 | 8 | 20 | -12 | true |
| QA Τάσος | 2026-09-07 | 16 | 20 | -4 | false |
| QA Τάσος | 2026-09-14 | 16 | 20 | -4 | false |
| QA Τάσος | 2026-09-21 | 16 | 20 | -4 | false |
| QA Τάσος | 2026-09-28 | 0 | 20 | -20 | true |

Warnings (including coverage shortages/surplus):

| Code | Date | Shift | Employee | Message |
| --- | --- | --- | --- | --- |
| STANDARD_SHIFT_DEVIATION | 2026-09-12 | — | QA Θοδωρής | Απόκλιση από την τυπική βάρδια. |
| TARGET_HOURS_UNDER | — | — | QA Γιώργος | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Γιώργος | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Γιώργος | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Γιώργος | Ώρες 16 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Κατερίνα | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Κατερίνα | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Κατερίνα | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Κατερίνα | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Κατερίνα | Ώρες 8 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Στέλιος | Ώρες 24 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Στέλιος | Ώρες 16 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Στέλιος | Ώρες 8 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Αθηνά | Ώρες 32 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Αθηνά | Ώρες 24 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Θοδωρής | Ώρες 16 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Θοδωρής | Ώρες 24 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Θοδωρής | Ώρες 24 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Θοδωρής | Ώρες 24 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Θοδωρής | Ώρες 8 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Βίκυ | Ώρες 16 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Βίκυ | Ώρες 16 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Βίκυ | Ώρες 16 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Βίκυ | Ώρες 16 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Βίκυ | Ώρες 0 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Ηλίας | Ώρες 24 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Ηλίας | Ώρες 24 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Ηλίας | Ώρες 24 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Ηλίας | Ώρες 24 / στόχος 40 |
| TARGET_HOURS_UNDER | — | — | QA Ηλίας | Ώρες 16 / στόχος 40 |
| TARGET_HOURS_OVER | — | — | QA Μυρτώ | Ώρες 40 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Μυρτώ | Ώρες 16 / στόχος 32 |
| TARGET_HOURS_UNDER | — | — | QA Τάσος | Ώρες 8 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Τάσος | Ώρες 16 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Τάσος | Ώρες 16 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Τάσος | Ώρες 16 / στόχος 20 |
| TARGET_HOURS_UNDER | — | — | QA Τάσος | Ώρες 0 / στόχος 20 |

Manual scenario: QA Γιώργος, 2026-09-07, +8h; fixed-off warning visible; publishing after acknowledgment succeeds.

## Expected vs Actual

| Tenant | Rule | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| qa-fuel | WEEK fixed-off automatic violations | 0 | 0 | PASS |
| qa-fuel | WEEK absence automatic violations | 0 | 0 | PASS |
| qa-fuel | WEEK active workers in statistics | 6 | 6 | PASS |
| qa-fuel | WEEK business warnings non-blocking | true | true | PASS |
| qa-fuel | WEEK within current persistence capacity | true | true | PASS |
| qa-fuel | WEEK standard shift used where possible | true | true | PASS |
| qa-fuel | MONTH fixed-off automatic violations | 0 | 0 | PASS |
| qa-fuel | MONTH absence automatic violations | 0 | 0 | PASS |
| qa-fuel | MONTH active workers in statistics | 6 | 6 | PASS |
| qa-fuel | MONTH business warnings non-blocking | true | true | PASS |
| qa-fuel | MONTH within current persistence capacity | true | true | PASS |
| qa-fuel | MONTH standard shift used where possible | true | true | PASS |
| qa-fuel | quiet week retains every active zero-hour employee | 6 | 6 | PASS |
| qa-fuel | manual preview adds actual hours | 8 | 8 | PASS |
| qa-fuel | manual fixed-off warning visible | true | true | PASS |
| qa-fuel | publish acknowledged scheduling warnings | true | true | PASS |
| qa-fuel | v1 snapshot unchanged after v2 | unchanged | unchanged | PASS |
| qa-fuel | v1 rendered PDF unchanged after v2 | same bytes | same bytes | PASS |
| qa-fuel | PDF artifact is a PDF | true | true | PASS |
| qa-fuel | QA Άννα first rotation week uses own standard | true | true | PASS |
| qa-fuel | QA Άννα next rotation week uses own alternate | true | true | PASS |
| qa-cafe | WEEK fixed-off automatic violations | 0 | 0 | PASS |
| qa-cafe | WEEK absence automatic violations | 0 | 0 | PASS |
| qa-cafe | WEEK active workers in statistics | 8 | 8 | PASS |
| qa-cafe | WEEK business warnings non-blocking | true | true | PASS |
| qa-cafe | WEEK within current persistence capacity | true | true | PASS |
| qa-cafe | WEEK standard shift used where possible | true | true | PASS |
| qa-cafe | MONTH fixed-off automatic violations | 0 | 0 | PASS |
| qa-cafe | MONTH absence automatic violations | 0 | 0 | PASS |
| qa-cafe | MONTH active workers in statistics | 8 | 8 | PASS |
| qa-cafe | MONTH business warnings non-blocking | true | true | PASS |
| qa-cafe | MONTH within current persistence capacity | true | true | PASS |
| qa-cafe | MONTH standard shift used where possible | true | true | PASS |
| qa-cafe | quiet week retains every active zero-hour employee | 8 | 8 | PASS |
| qa-cafe | manual preview adds actual hours | 8 | 8 | PASS |
| qa-cafe | manual fixed-off warning visible | true | true | PASS |
| qa-cafe | publish acknowledged scheduling warnings | true | true | PASS |
| qa-cafe | v1 snapshot unchanged after v2 | unchanged | unchanged | PASS |
| qa-cafe | v1 rendered PDF unchanged after v2 | same bytes | same bytes | PASS |
| qa-cafe | PDF artifact is a PDF | true | true | PASS |
| qa-salon | WEEK fixed-off automatic violations | 0 | 0 | PASS |
| qa-salon | WEEK absence automatic violations | 0 | 0 | PASS |
| qa-salon | WEEK active workers in statistics | 6 | 6 | PASS |
| qa-salon | WEEK business warnings non-blocking | true | true | PASS |
| qa-salon | WEEK within current persistence capacity | true | true | PASS |
| qa-salon | WEEK standard shift used where possible | true | true | PASS |
| qa-salon | MONTH fixed-off automatic violations | 0 | 0 | PASS |
| qa-salon | MONTH absence automatic violations | 0 | 0 | PASS |
| qa-salon | MONTH active workers in statistics | 6 | 6 | PASS |
| qa-salon | MONTH business warnings non-blocking | true | true | PASS |
| qa-salon | MONTH within current persistence capacity | true | true | PASS |
| qa-salon | MONTH standard shift used where possible | true | true | PASS |
| qa-salon | quiet week retains every active zero-hour employee | 6 | 6 | PASS |
| qa-salon | manual preview adds actual hours | 6 | 6 | PASS |
| qa-salon | manual fixed-off warning visible | true | true | PASS |
| qa-salon | publish acknowledged scheduling warnings | true | true | PASS |
| qa-salon | v1 snapshot unchanged after v2 | unchanged | unchanged | PASS |
| qa-salon | v1 rendered PDF unchanged after v2 | same bytes | same bytes | PASS |
| qa-salon | PDF artifact is a PDF | true | true | PASS |
| qa-salon | QA Χριστίνα first rotation week uses own standard | true | true | PASS |
| qa-salon | QA Χριστίνα next rotation week uses own alternate | true | true | PASS |
| qa-salon | QA Βασίλης first rotation week uses own standard | true | true | PASS |
| qa-salon | QA Βασίλης next rotation week uses own alternate | true | true | PASS |
| qa-market | WEEK fixed-off automatic violations | 0 | 0 | PASS |
| qa-market | WEEK absence automatic violations | 0 | 0 | PASS |
| qa-market | WEEK active workers in statistics | 9 | 9 | PASS |
| qa-market | WEEK business warnings non-blocking | true | true | PASS |
| qa-market | WEEK within current persistence capacity | true | true | PASS |
| qa-market | WEEK standard shift used where possible | true | true | PASS |
| qa-market | MONTH fixed-off automatic violations | 0 | 0 | PASS |
| qa-market | MONTH absence automatic violations | 0 | 0 | PASS |
| qa-market | MONTH active workers in statistics | 9 | 9 | PASS |
| qa-market | MONTH business warnings non-blocking | true | true | PASS |
| qa-market | MONTH within current persistence capacity | true | true | PASS |
| qa-market | MONTH standard shift used where possible | true | true | PASS |
| qa-market | quiet week retains every active zero-hour employee | 9 | 9 | PASS |
| qa-market | manual preview adds actual hours | 8 | 8 | PASS |
| qa-market | manual fixed-off warning visible | true | true | PASS |
| qa-market | publish acknowledged scheduling warnings | true | true | PASS |
| qa-market | v1 snapshot unchanged after v2 | unchanged | unchanged | PASS |
| qa-market | v1 rendered PDF unchanged after v2 | same bytes | same bytes | PASS |
| qa-market | PDF artifact is a PDF | true | true | PASS |
| qa-fuel | explicit substitute is used during shortage | true | true | PASS |
| qa-fuel | weekly targets are soft: at least one exceeded | true | true | PASS |
| qa-cafe | busy Saturday shortage produces warning | true | true | PASS |
| qa-fuel | new employee defaults to NORMAL | NORMAL | NORMAL | PASS |
| qa-fuel | new NORMAL worker receives available coverage | true | true | PASS |

The publication checks above use the real services/PDF renderer with in-memory storage. Browser evidence separately verifies actual emulator persistence, auth broker and Rules. All complete generated WEEK/MONTH assignments are retained in acceptance.json.
