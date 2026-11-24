// lib/csvParser.ts — Delimited Text Parser, Auto-Detect Column Mapper, Multi-Factor Deduplication, & CSV Exporter
import { cleanIndianPhone, triageLead } from "./leadTriageEngine";

export interface ParsedCsvLead {
  company: string;
  contact: string;
  phone: string;
  email: string;
  website: string;
  city: string;
  category: string;
  notes: string;
  value: number;
  stage: string;
  tier: "A" | "B" | "C" | "D";
  fitScore: number;
  triageReasons: string[];
}

export interface DedupeReport {
  totalParsed: number;
  newLeads: ParsedCsvLead[];
  duplicates: Array<{ lead: ParsedCsvLead; reason: string }>;
}

export function parseDelimitedText(text: string, delimiter: string = ","): string[][] {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === delimiter && !insideQuote) {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !insideQuote) {
      if (char === "\r" && nextChar === "\n") i++;
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      lines.push(currentRow);
    }
  }

  return lines;
}

export function detectDelimiter(headerLine: string): string {
  const tabs = (headerLine.match(/\t/g) || []).length;
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  if (tabs > commas && tabs > semicolons) return "\t";
  if (semicolons > commas && semicolons > tabs) return ";";
  return ",";
}

export function identifyColumnField(header: string): string | null {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (h.includes("email") || h.includes("mail")) return "email";
  if (h.includes("phone") || h.includes("mobile") || h.includes("whatsapp") || h.includes("tel") || h === "contactno") return "phone";
  if (h.includes("website") || h.includes("url") || h.includes("site") || h.includes("link")) return "website";
  if (h.includes("city") || h.includes("town") || h.includes("location")) return "city";
  if (h.includes("category") || h.includes("industry") || h.includes("sector") || h.includes("niche")) return "category";
  if (h.includes("contact") || h.includes("person") || h.includes("founder") || h.includes("owner") || h.includes("name")) {
    if (!h.includes("company") && !h.includes("business") && !h.includes("firm")) return "contact";
  }
  if (h.includes("company") || h.includes("business") || h.includes("firm") || h.includes("brand") || h.includes("title") || h === "name") return "company";
  if (h.includes("notes") || h.includes("comment") || h.includes("remark") || h.includes("desc")) return "notes";
  if (h.includes("value") || h.includes("budget") || h.includes("amount") || h.includes("deal")) return "value";
  if (h.includes("stage") || h.includes("status")) return "stage";
  return null;
}

export function getCSVPreview(rawContent: string, maxRows: number = 6): {
  headers: string[];
  previewRows: string[][];
  detectedMapping: Record<string, string>;
  totalRows: number;
} {
  if (!rawContent || !rawContent.trim()) {
    return { headers: [], previewRows: [], detectedMapping: {}, totalRows: 0 };
  }

  const delimiter = detectDelimiter(rawContent.split(/\r?\n/)[0] || "");
  const allRows = parseDelimitedText(rawContent.trim(), delimiter);
  if (allRows.length === 0) {
    return { headers: [], previewRows: [], detectedMapping: {}, totalRows: 0 };
  }

  const headers = allRows[0];
  const detectedMapping: Record<string, string> = {};

  headers.forEach((h) => {
    const id = identifyColumnField(h);
    if (id) detectedMapping[h] = id;
  });

  return {
    headers,
    previewRows: allRows.slice(1, maxRows + 1),
    detectedMapping,
    totalRows: Math.max(0, allRows.length - 1),
  };
}

export function parseAndTriageCSV(
  rawContent: string,
  existingLeads: Array<{ company: string; phone?: string; email?: string }>,
  customMapping?: Record<string, string>
): DedupeReport {
  if (!rawContent || !rawContent.trim()) {
    return { totalParsed: 0, newLeads: [], duplicates: [] };
  }

  const delimiter = detectDelimiter(rawContent.split(/\r?\n/)[0] || "");
  const rows = parseDelimitedText(rawContent.trim(), delimiter);
  if (rows.length < 2) {
    return { totalParsed: 0, newLeads: [], duplicates: [] };
  }

  const headers = rows[0];
  const colMap: Record<number, string> = {};

  headers.forEach((h, i) => {
    const field = customMapping?.[h] || identifyColumnField(h);
    if (field) colMap[i] = field;
  });

  const parsedLeads: ParsedCsvLead[] = [];
  const duplicates: Array<{ lead: ParsedCsvLead; reason: string }> = [];

  const existingPhoneSet = new Set(
    existingLeads
      .map((l) => (l.phone ? l.phone.replace(/[^0-9]/g, "") : ""))
      .filter((p) => p.length >= 10)
  );
  const existingCompanySet = new Set(
    existingLeads.map((l) => (l.company || "").toLowerCase().trim())
  );

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const item: Record<string, any> = {};

    headers.forEach((_, idx) => {
      const field = colMap[idx];
      if (field) {
        item[field] = row[idx] || "";
      }
    });

    const companyName = (item.company || row[0] || "").trim();
    if (!companyName) continue;

    const rawPhone = item.phone || "";
    const cleanPhone = cleanIndianPhone(rawPhone);
    const numericPhone = cleanPhone.replace(/[^0-9]/g, "");

    const triage = triageLead({
      company: companyName,
      contact: item.contact,
      phone: cleanPhone,
      website: item.website,
      city: item.city,
      category: item.category,
      notes: item.notes,
    });

    const valNumber = Number(String(item.value || "").replace(/[^0-9]/g, "")) || (triage.tier === "A" ? 25000 : triage.tier === "B" ? 15000 : 8000);

    const lead: ParsedCsvLead = {
      company: companyName,
      contact: item.contact || "Business Owner",
      phone: cleanPhone,
      email: item.email || "",
      website: item.website || "",
      city: item.city || "Ahmedabad",
      category: item.category || "General Commercial",
      notes: item.notes || "",
      value: valNumber,
      stage: item.stage || "New",
      tier: triage.tier,
      fitScore: triage.fitScore,
      triageReasons: triage.reasons,
    };

    // Deduplication check
    let dupReason = "";
    if (numericPhone && numericPhone.length >= 10 && existingPhoneSet.has(numericPhone)) {
      dupReason = `Phone number ${cleanPhone} already exists in CRM.`;
    } else if (existingCompanySet.has(companyName.toLowerCase())) {
      dupReason = `Company name '${companyName}' already exists in CRM.`;
    }

    if (dupReason) {
      duplicates.push({ lead, reason: dupReason });
    } else {
      parsedLeads.push(lead);
      if (numericPhone && numericPhone.length >= 10) existingPhoneSet.add(numericPhone);
      existingCompanySet.add(companyName.toLowerCase());
    }
  }

  return {
    totalParsed: parsedLeads.length + duplicates.length,
    newLeads: parsedLeads,
    duplicates,
  };
}

export function exportLeadsToCSV(leads: Array<Record<string, any>>): string {
  const headers = ["Company", "Contact", "Phone", "Email", "Website", "City", "Category", "Stage", "Value (INR)", "Tier", "Fit Score", "Notes"];
  const rows: string[] = [headers.join(",")];

  leads.forEach((l) => {
    const row = [
      `"${(l.company || "").replace(/"/g, '""')}"`,
      `"${(l.contact || "").replace(/"/g, '""')}"`,
      `"${(l.phone || "").replace(/"/g, '""')}"`,
      `"${(l.email || "").replace(/"/g, '""')}"`,
      `"${(l.website || "").replace(/"/g, '""')}"`,
      `"${(l.city || "").replace(/"/g, '""')}"`,
      `"${(l.category || "").replace(/"/g, '""')}"`,
      `"${(l.stage || "New").replace(/"/g, '""')}"`,
      `"${l.value || 0}"`,
      `"${l.tier || "B"}"`,
      `"${l.fitScore || 50}"`,
      `"${(l.notes || "").replace(/"/g, '""')}"`,
    ];
    rows.push(row.join(","));
  });

  return rows.join("\n");
}

export function triggerDownload(content: string, fileName: string, mimeType: string = "text/csv;charset=utf-8;"): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
