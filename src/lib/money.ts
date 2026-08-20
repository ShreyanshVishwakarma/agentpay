const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format an integer amount of paise as Indian rupees, e.g. 79800 -> "₹798.00".
 * All money in AgentPay is integer paise; this is the only formatting gate.
 */
export function formatPaise(paise: number): string {
  return inrFormatter.format(paise / 100);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
