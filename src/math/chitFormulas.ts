/**
 * Isolated Chit Fund Math Formula Engine
 * Encapsulates all financial and actuarial calculations for ClearFlow.
 * Future formulas can be added as separate exported strategy objects.
 */

export interface ChitFormulaEngine {
  formula_id: string;
  name: string;
  description: string;
  calculatePayout: (t: number, N: number, U: number, D: number, F: number) => number;
  calculateMemberDueForMonth: (month: number, winMonth: number | null, U: number, D: number) => number;
  calculateTotalBilled: (activeMonth: number, winMonth: number | null, U: number, D: number) => number;
}

export const StandardChitFormula: ChitFormulaEngine = {
  formula_id: "standard_chit_v1",
  name: "Standard Linear Gradient Chit Formula",
  description: "Payout_t = [(t - 1) * (D - U)] + (N * U) - F",
  
  calculatePayout: (t: number, N: number, U: number, D: number, F: number): number => {
    // Payout_t = [(t - 1) * (D - U)] + (N * U) - F
    return ((t - 1) * (D - U)) + (N * U) - F;
  },

  calculateMemberDueForMonth: (month: number, winMonth: number | null, U: number, D: number): number => {
    // If member has won in this month or earlier, they pay Drawn Due (D). Otherwise Undrawn Due (U).
    const isDrawn = winMonth !== null && winMonth <= month;
    return isDrawn ? D : U;
  },

  calculateTotalBilled: (activeMonth: number, winMonth: number | null, U: number, D: number): number => {
    if (activeMonth <= 0) return 0;
    let total = 0;
    for (let m = 1; m <= activeMonth; m++) {
      total += StandardChitFormula.calculateMemberDueForMonth(m, winMonth, U, D);
    }
    return total;
  }
};

// Registry of all available math formula templates
export const AvailableMathTemplates: ChitFormulaEngine[] = [
  StandardChitFormula,
];

export function getMathTemplate(formulaId: string): ChitFormulaEngine {
  return AvailableMathTemplates.find(f => f.formula_id === formulaId) || StandardChitFormula;
}
