export type CoachingChunk = {
  id: string
  category: string
  content: string
}

export const COACHING_CHUNKS: CoachingChunk[] = [
  // ─── Category 1: Progression Protocols by Training Age ───────────────────────
  {
    id: 'novice-linear-progression',
    category: 'progression',
    content:
      'Novice lifters (< 6 months training, experience_level: beginner) adapt session-to-session due to rapid neuromuscular adaptation. If all reps were completed at RPE below 9, mandate a direct weight increase for the very next session: +2.5 kg for upper-body compounds (bench press, overhead press, rows, pull-ups), +5 kg for lower-body compounds (squat, deadlift, leg press). Do not suggest undulating periodization or set/rep manipulation for novices — enforce uninterrupted linear progression to fully exploit the novice adaptation window.',
  },
  {
    id: 'two-for-two-rule',
    category: 'progression',
    content:
      'Apply the Two-for-Two overload rule: examine the last two sessions for this exercise. If the user completed reps at or above the top of their target rep range in BOTH sessions (e.g., 12+ reps when target is 8–12), command a load increase of 2.5–5% of total cumulative load. If reps are within the target range in either session, maintain current weight. This rule prevents premature increments that lead to form breakdown and connective tissue stress.',
  },
  {
    id: 'intermediate-undulating-progression',
    category: 'progression',
    content:
      'Intermediate lifters (6–24 months training, experience_level: intermediate) exhaust session-to-session linear gains. Approve a weight increase only if total weekly volume load (sets × reps × weight) exceeded the prior week AND average session RPE was below 8. If those conditions are NOT met, do not stagnate — suggest adding one extra working set OR reducing rest intervals by 30 seconds to maintain progressive overload via metabolic stress without adding absolute load.',
  },
  {
    id: 'advanced-step-loading',
    category: 'progression',
    content:
      "Advanced lifters (> 24 months training, experience_level: advanced) operate near their genetic ceiling. Weekly weight increases are explicitly prohibited. Enforce step-loading: have the user hold the same load for multiple sessions until the effort feels manageable (RPE drops from 8 to 6–7 at the same weight), then authorize a micro-increment of 1–2.5 kg. When current load is within 5 kg of the user's personal record, restrict any increment to 1–2.5 kg maximum — aggressive jumps near PR carry exponentially higher connective tissue injury risk.",
  },

  // ─── Category 2: Volume Landmark Navigation (MEV / MAV / MRV) ────────────────
  {
    id: 'mev-initialization',
    category: 'volume',
    content:
      'At the start of a hypertrophy block or accumulation phase, anchor weekly set volume at the Minimum Effective Volume (MEV) for the target muscle group. MEV baselines: quadriceps 6–8 sets/week, hamstrings 4–6 sets/week, chest/push category 6–8 sets/week, back/pull category 8–10 sets/week, anterior deltoids 0 direct sets (incidental volume from heavy pressing is sufficient). Initializing at MEV guarantees a sufficient runway to escalate volume across the mesocycle before hitting MRV. Never start a block at or near MRV.',
  },
  {
    id: 'mav-trajectory',
    category: 'volume',
    content:
      "Once past the first training week and while average session RPE remains below 8 with a positive performance slope, escalate total weekly sets per muscle category by 1–2 sets each microcycle, navigating through the Maximum Adaptive Volume (MAV) bandwidth. Prioritize adding sets to exercises where the user's RPE was lowest in the prior week — this indicates the highest localized recovery capacity. Do not increase absolute weight when adding volume sets; metabolic stress from added sets is the overload mechanism at this stage.",
  },
  {
    id: 'mrv-breach-detection',
    category: 'volume',
    content:
      'The Maximum Recoverable Volume (MRV) is breached when all of the following occur: (1) weekly volume load for a muscle category is flat or declining across 2+ consecutive weeks, (2) average RPE for that category has spiked to 9 or above, (3) repetition counts are falling below the prior week across multiple exercises in the same category. When these conditions coincide, immediately halt all volume progression and mandate a reduction in sets for that muscle group. Do not increase weight or volume when MRV signals are present.',
  },
  {
    id: 'data-sparsity-calibration',
    category: 'progression',
    content:
      'When an exercise has fewer than 3 completed sessions in the database, the system is in calibration mode. Restrict progression suggestions to a maximum 2–3% weight increase (rounded to nearest 2.5 kg). Include "Insufficient history — system is calibrating this exercise baseline" in the evidence array. Do not suggest complex set/rep manipulations during calibration. Conservative loading during the calibration phase prevents ingraining flawed motor patterns before a baseline is established.',
  },

  // ─── Category 3: Advanced Autoregulation ─────────────────────────────────────
  {
    id: 'rpe-rir-calibration',
    category: 'autoregulation',
    content:
      'For hypertrophy goals, target set termination at RPE 7–8 (2–3 reps left in reserve). RPE 8 is the exact repetition where bar speed noticeably and involuntarily decelerates — teach users to use this as an objective proxy. Explicitly warn that training to absolute failure (RPE 10) is counterproductive for hypertrophy: it amplifies CNS fatigue, degrades performance on all subsequent sets, and provides no additional hypertrophic benefit beyond RPE 8–9. If RPE data is missing from sets, note this in evidence and recommend the user begin logging RPE.',
  },
  {
    id: 'helms-rpe-stop-logic',
    category: 'autoregulation',
    content:
      "During strength or peaking phases, after the user logs a heavy top set, prescribe autoregulated back-off sets using RPE Stop Logic: reduce load by 4–6% from the top set weight, then instruct the user to continue performing sets of the same rep count until perceived exertion returns to match the top set's RPE. Do not prescribe a fixed number of back-off sets for strength phases — RPE determines volume. On high-readiness days the user accumulates 4–6 back-off sets; on fatigued days only 1–2. This is the optimal intra-session volume autoregulation mechanism.",
  },
  {
    id: 'daily-readiness-load-displacement',
    category: 'autoregulation',
    content:
      "If warm-up set RPE is notably higher than expected for the same load (e.g., a weight that normally feels like RPE 5 now feels like RPE 7+), the user's CNS readiness is compromised. Displace the absolute load downward until effort aligns with the originally prescribed submaximal RPE, while maintaining the target rep range. Do not push through with the planned heavy load on low-readiness days — this protects connective tissue and prevents overreaching. Note the readiness displacement in the evidence. If HRV data is unavailable, use the warm-up RPE delta as the readiness proxy.",
  },
  {
    id: 'recovery-frequency-constraint',
    category: 'autoregulation',
    content:
      'Muscle protein synthesis remains elevated for 48–72 hours post-session. If the same exercise or muscle category was trained fewer than 48 hours ago in a prior session, do not recommend aggressive weight increases for the current session. Instead, suggest redirecting volume to a fully recovered muscle group or enforcing a moderate load reduction for the under-recovered group. Prioritize recovery over intensity when intra-week training frequency is high. High-frequency training is only beneficial when recovery is adequately managed.',
  },

  // ─── Category 4: Fatigue Management and Deload Triggers ──────────────────────
  {
    id: 'volume-plateau-deload',
    category: 'deload',
    content:
      'If weekly volume load for an exercise or muscle category shows zero increase across 3 or more consecutive weeks, the user is in functional overreaching and requires a deload. Prescribe: maintain absolute weight on the bar (critical — to preserve neurological adaptations and heavy load familiarity), reduce total sets by 40–50%, pull target reps back by 2–3 per set. Alternatively, prescribe a flat 10% weight reduction across all exercises for one week. Clearly communicate that fatigue masks fitness — the deload is a biological prerequisite for the next performance breakthrough, not a regression.',
  },
  {
    id: 'rep-range-sticking-point',
    category: 'deload',
    content:
      'If a user has stalled at the same absolute weight for more than 2 sessions but the stall has lasted fewer than 3 weeks (below the deload threshold), prescribe rep range expansion before attempting further weight increases. Example: if stuck at 80 kg × 8 reps, instruct the user to push for 80 kg × 10 reps across 1–2 sessions. Only after the expanded rep target is successfully achieved does the system authorize a weight increment. This micro-progression strategy builds a physiological bridge to the next load level without dangerous ego-driven max-out attempts.',
  },
  {
    id: 'density-metabolic-overload',
    category: 'deload',
    content:
      "Progressive overload does not require adding weight. When equipment is limited, load is near the user's PR, or absolute weight cannot be increased, prescribe density-based overload: maintain the same weight and sets but reduce rest intervals from 90 seconds to 60 or 45 seconds. Increased metabolic stress and hypoxia from compressed rest drives the hypertrophic cascade independently of absolute tension. This provides an alternative overload pathway for home-gym users, hotel gyms, or any scenario where micro-loading plates are unavailable.",
  },

  // ─── Category 5: Exercise Selection and Specificity ───────────────────────────
  {
    id: 'form-degradation-response',
    category: 'specificity',
    content:
      'If the user notes form breakdown, joint pain, or a significant RPE spike suggesting technique failure, immediately halt weight progression regardless of volume metrics. Prescribe a load regression until form normalizes. If the issue persists across multiple sessions, suggest swapping the barbell compound for a stable machine equivalent that isolates the target musculature without the stability demand (e.g., barbell squat → hack squat, barbell bench → machine chest press). Do not resume weight increases until the user confirms form is restored.',
  },
  {
    id: 'adaptive-resistance-variation',
    category: 'specificity',
    content:
      'If an exercise has been performed without variation for more than 8 consecutive weeks AND the weekly progression rate has fallen below 1% per week, adaptive resistance has set in. Prescribe a strategic rotation to a functionally related variation that changes the force vector and recruits different regional motor units: barbell back squat → safety bar squat or front squat; barbell bench → close-grip bench or incline press; conventional deadlift → Romanian deadlift or trap bar. The variation must target the same primary mover — random substitution destroys the long-term overload trajectory.',
  },
  {
    id: 'competition-lift-specificity',
    category: 'specificity',
    content:
      'For users with a strength or powerlifting goal (goal: strength | powerlifting), the primary competition lifts (squat, bench press, deadlift) must never be substituted or removed from the program. The Principle of Specificity dictates that removal of competition lifts causes rapid detraining of the sport-specific motor pattern. While accessory exercises must be rotated to combat adaptive resistance, variation on core lifts must take the form of execution variability only: pause reps, tempo manipulation, eccentric emphasis, or accommodating resistance (bands/chains).',
  },
  {
    id: 'weak-point-diagnostics',
    category: 'specificity',
    content:
      'A compound lift stalls almost universally due to a localized muscular deficiency at a specific kinetic chain position, not total-body weakness. Match accessory prescriptions to failure patterns: failing at chest on bench press → prescribe heavy dumbbell flies or incline press; failing at lockout on bench → prescribe JM press or loaded triceps extensions; failing at knee level on deadlift → prescribe Romanian deadlifts or leg curls; failing out of the hole on squat → prescribe pause squats or leg press with full range. Identify the failure point and prescribe the targeted accessory, not a generic accessory for that muscle.',
  },

  // ─── Category 6: Phase Potentiation ──────────────────────────────────────────
  {
    id: 'phase-potentiation',
    category: 'periodization',
    content:
      'A muscle built in a high-volume hypertrophy block is not immediately strong — it requires a strength realization block to neurologically wire the new contractile tissue for maximal force output. After 8–12 weeks of accumulation/hypertrophy training (high volume, 60–75% 1RM, RPE 7–8), transition to a strength block: reduce total weekly sets by 40–50%, push load to 80–95% of 1RM, extend rest to 3–5 minutes. Inform the user that the "pump" will diminish — this is expected and correct. The adaptation driver has shifted from metabolic stress to high-threshold motor unit recruitment and rate coding.',
  },
]
