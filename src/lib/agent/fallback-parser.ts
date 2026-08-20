import { rupeesToPaise } from "@/lib/money";
import type { CartItem, PurchaseIntent } from "@/schemas/agent";

export interface FallbackCatalogEntry {
  sku: string;
  name: string;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  single: 1,
  two: 2,
  pair: 2,
  couple: 2,
  three: 3,
  four: 4,
  five: 5,
};

const STOP_WORDS = new Set(["pack", "kit", "the", "and", "for", "with"]);

interface ItemMatch {
  sku: string;
  score: number;
  /** Index of the first matched keyword token, used for quantity lookup. */
  position: number;
}

function keywordsFor(entry: FallbackCatalogEntry): string[] {
  const normalized = entry.name.toLowerCase();
  const rawTokens = normalized
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9.]/g, ""))
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  return [...new Set(rawTokens)];
}

export class FallbackParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FallbackParseError";
  }
}

/**
 * Deterministic local intent parser used when OPENAI_API_KEY is absent or
 * the LLM call fails. Recognizes phrases like:
 *   "two SQL Pro Interview Packs under ₹800"
 *   "1 Next.js backend pack"
 *   "budget 1000"
 */
export function parseWithFallback(
  message: string,
  catalog: FallbackCatalogEntry[],
): PurchaseIntent {
  const text = message.toLowerCase();
  const tokens = text
    .replace(/[^a-z0-9.₹\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  // ---- Budget extraction -------------------------------------------------
  let maxBudgetPaise: number | undefined;
  const budgetPatterns = [
    /(?:under|below|less than|max(?:imum)?|upto|up to|within|budget(?: of)?)\s*(?:₹|rs\.?|inr\.?)?\s*([\d][\d,]*(?:\.\d+)?)/,
    /(?:₹|rs\.?|inr\.?)\s*([\d][\d,]*(?:\.\d+)?)/,
  ];
  for (const pattern of budgetPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = Number.parseFloat(match[1].replace(/,/g, ""));
      if (Number.isFinite(value) && value > 0) {
        maxBudgetPaise = rupeesToPaise(value);
        break;
      }
    }
  }

  // ---- Item matching -----------------------------------------------------
  const matches: ItemMatch[] = [];
  for (const entry of catalog) {
    const keywords = keywordsFor(entry).filter((k) => k.length > 2 || /\d/.test(k));
    let score = 0;
    let position = Number.POSITIVE_INFINITY;

    for (const keyword of keywords) {
      const index = tokens.indexOf(keyword);
      if (index >= 0) {
        score += 1;
        position = Math.min(position, index);
      }
    }

    if (score > 0 && Number.isFinite(position)) {
      matches.push({ sku: entry.sku, score, position });
    }
  }

  if (matches.length === 0) {
    throw new FallbackParseError(
      'I couldn\'t map your request to any item in the SkillForge Learning catalog. Try naming a product, e.g. "Buy two SQL Pro Interview Packs under ₹800".',
    );
  }

  matches.sort((a, b) => b.score - a.score || a.position - b.position);
  const topScore = matches[0].score;
  const winners = matches.filter((match) => match.score === topScore);

  let clarificationNeeded = false;
  let clarificationQuestion: string | undefined;

  if (winners.length > 1) {
    clarificationNeeded = true;
    const nameOf = (sku: string) => catalog.find((entry) => entry.sku === sku)?.name ?? sku;
    clarificationQuestion = `Did you mean "${nameOf(winners[0].sku)}" or "${nameOf(winners[1].sku)}"?`;
  }

  // ---- Quantity extraction ----------------------------------------------
  const items: CartItem[] = winners.map((match) => {
    let quantity = 1;

    for (let back = 1; back <= 3; back++) {
      const candidate = tokens[match.position - back];
      if (!candidate) break;
      const numeric = Number.parseInt(candidate, 10);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 5) {
        quantity = numeric;
        break;
      }
      const word = NUMBER_WORDS[candidate];
      if (word !== undefined) {
        quantity = word;
        break;
      }
    }

    return { sku: match.sku, quantity };
  });

  return {
    items,
    maxBudgetPaise,
    clarificationNeeded,
    clarificationQuestion,
  };
}
