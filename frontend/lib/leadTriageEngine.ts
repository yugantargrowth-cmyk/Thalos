// lib/leadTriageEngine.ts — Lead Triage & ICP Fit Scoring Engine for Indian/Gujarat Commercial Niches

export interface LeadTriage {
  fitScore: number;
  tier: "A" | "B" | "C" | "D";
  decision: "qualified" | "maybe" | "skip";
  reasons: string[];
  triagedAt: string;
}

export interface TriageRuleset {
  version: string;
  targetCategories: string[];
  disqualificationBrands: string[];
  priorityGeographies: string[];
}

export const DEFAULT_TRIAGE_RULESET: TriageRuleset = {
  version: "v1.0",
  targetCategories: [
    "clinic", "doctor", "dental", "aesthetic", "hospital",
    "coaching", "classes", "academy", "institute", "tuition",
    "salon", "spa", "beauty", "hair",
    "furniture", "interior", "decor", "architect", "studio",
    "textile", "fabric", "saree", "garment", "trader",
    "manufacturing", "industrial", "packaging", "hardware",
    "agency", "consulting", "logistics", "export", "b2b",
  ],
  disqualificationBrands: [
    "apollo", "mcdonald", "domino", "starbucks", "kfc", "subway",
    "reliance", "tata", "maruti suzuki", "honda", "hyundai",
    "pantaloons", "zudio", "croma", "westside", "decathlon",
    "fortis", "max healthcare", "dmart", "lenskart",
  ],
  priorityGeographies: ["ahmedabad", "gandhinagar", "surat", "vadodara", "rajkot", "gujarat", "mumbai"],
};

export function cleanIndianPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length > 10 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return phone;
}

export function triageLead(lead: {
  company: string;
  contact?: string;
  phone?: string;
  website?: string;
  city?: string;
  category?: string;
  notes?: string;
}): LeadTriage {
  const reasons: string[] = [];
  let fitScore = 0;
  let isDisqualified = false;

  const comp = (lead.company || "").toLowerCase();
  const cat = (lead.category || "").toLowerCase();
  const city = (lead.city || "").toLowerCase();
  const notes = (lead.notes || "").toLowerCase();
  const phone = lead.phone ? lead.phone.replace(/[^0-9]/g, "") : "";
  const website = (lead.website || "").trim().toLowerCase();

  // 1. Disqualification checks
  for (const brand of DEFAULT_TRIAGE_RULESET.disqualificationBrands) {
    if (comp.includes(brand)) {
      isDisqualified = true;
      reasons.push(`Disqualified: Recognized national/corporate chain (${brand}).`);
      break;
    }
  }

  if (notes.includes("permanently closed") || comp.includes("closed")) {
    isDisqualified = true;
    reasons.push("Disqualified: Listing marked permanently closed.");
  }

  // Mobile reachability check
  const isIndianMobile = (phone.length === 10 && /^[6-9]/.test(phone)) ||
    (phone.length === 12 && phone.startsWith("91") && /^91[6-9]/.test(phone));

  if (isIndianMobile) {
    fitScore += 25;
    reasons.push("Direct Indian mobile reachability (+91 WhatsApp ready).");
  } else if (!phone) {
    reasons.push("Warning: No phone number provided.");
  } else {
    fitScore += 10;
    reasons.push("Phone number present (landline/unformatted).");
  }

  // 2. Category Fit (+30 points)
  let matchedCat = false;
  for (const tc of DEFAULT_TRIAGE_RULESET.targetCategories) {
    if (cat.includes(tc) || comp.includes(tc)) {
      matchedCat = true;
      fitScore += 30;
      reasons.push(`High-value target industry: matches '${tc}'.`);
      break;
    }
  }
  if (!matchedCat) {
    fitScore += 15;
    reasons.push("General commercial business: standard conversion potential.");
  }

  // 3. Digital opportunity / website (+25 points)
  if (!website || website.includes("instagram.com") || website.includes("facebook.com")) {
    fitScore += 25;
    reasons.push("No independent website; prime candidate for digital build.");
  } else if (!website.startsWith("https://")) {
    fitScore += 20;
    reasons.push("Website missing SSL security certificate.");
  } else {
    fitScore += 15;
    reasons.push("Active website identified; candidate for conversion optimization.");
  }

  // 4. Geography (+20 points)
  let isPriorityGeo = false;
  for (const geo of DEFAULT_TRIAGE_RULESET.priorityGeographies) {
    if (city.includes(geo)) {
      isPriorityGeo = true;
      fitScore += 20;
      reasons.push(`Priority geography: Local business in ${lead.city || "Ahmedabad"}.`);
      break;
    }
  }
  if (!isPriorityGeo) {
    fitScore += 10;
    reasons.push(`Regional location (${lead.city || "India"}).`);
  }

  fitScore = Math.max(0, Math.min(100, fitScore));

  let tier: "A" | "B" | "C" | "D" = "C";
  let decision: "qualified" | "maybe" | "skip" = "maybe";

  if (isDisqualified || fitScore < 35) {
    tier = "D";
    decision = "skip";
    fitScore = 0;
  } else if (fitScore >= 75) {
    tier = "A";
    decision = "qualified";
  } else if (fitScore >= 55) {
    tier = "B";
    decision = "qualified";
  } else {
    tier = "C";
    decision = "maybe";
  }

  return {
    fitScore,
    tier,
    decision,
    reasons,
    triagedAt: new Date().toISOString(),
  };
}
