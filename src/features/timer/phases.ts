export type WorkPhase = {
  key: "hazirlik" | "odak" | "tekrar";
  label: string;
  minutes: number;
};

// Çalışma modeli: 10-45-5 → toplam 1 saat.
// Süreleri değiştirmek için sadece bu listeyi düzenle.
export const WORK_PHASES: WorkPhase[] = [
  { key: "hazirlik", label: "Hazırlık", minutes: 1 },
  { key: "odak", label: "Odak", minutes: 2 },
  { key: "tekrar", label: "Tekrar", minutes: 1 },
];

export const phaseDurationMs = (phase: WorkPhase) => phase.minutes * 60_000;

// Faz bitince alarmın (bildirim + titreşim) süreceği pencere.
export const ALARM_WINDOW_MS = 5_000;
