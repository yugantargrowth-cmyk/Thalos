// lib/upiEngine.ts — NPCI UPI URI Generator, Scannable QR & Bank UTR Validation Engine
import { generateScannableQrSvg } from "./qrCode";

export interface UpiConfig {
  vpa: string;
  payeeName: string;
}

const STORAGE_KEY = "thalos_upi_settings";

export function getStoredUpiConfig(): UpiConfig {
  if (typeof window === "undefined") {
    return { vpa: "", payeeName: "Yugantar Growth" };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { vpa: "", payeeName: "Yugantar Growth" };
    const parsed = JSON.parse(raw);
    return {
      vpa: parsed.vpa || "",
      payeeName: parsed.payeeName || "Yugantar Growth",
    };
  } catch {
    return { vpa: "", payeeName: "Yugantar Growth" };
  }
}

export function saveStoredUpiConfig(config: UpiConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent("thalos_upi_settings_changed", { detail: config }));
  } catch (e) {
    console.warn("Failed to persist UPI settings:", e);
  }
}

export interface UpiPaymentRequest {
  amount: number;
  note: string;
  vpa?: string;
  payeeName?: string;
  transactionRef?: string;
}

export interface UpiPaymentDetails {
  vpa: string;
  payeeName: string;
  amount: number;
  note: string;
  upiUri: string;
  qrDataUrl: string;
  formattedAmount: string;
  isConfigured: boolean;
}

export function buildUpiUri(params: UpiPaymentRequest): string {
  const config = getStoredUpiConfig();
  const vpa = (params.vpa || config.vpa).trim();
  if (!vpa) return "";

  const payeeName = (params.payeeName || config.payeeName || "Yugantar Growth").trim();
  const amount = Math.max(0, Math.round(params.amount));
  const note = (params.note || "Project Payment").trim();
  const tr = params.transactionRef ? `&tr=${encodeURIComponent(params.transactionRef)}` : "";

  return `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}${tr}`;
}

export function generateUpiQrDataUrl(upiUri: string): string {
  if (!upiUri || !upiUri.trim()) return "";
  const svg = generateScannableQrSvg(upiUri.trim(), { size: 220, foreground: "#080808", background: "#ffffff" });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function generateUpiPaymentDetails(params: UpiPaymentRequest): UpiPaymentDetails {
  const config = getStoredUpiConfig();
  const rawVpa = (params.vpa || config.vpa).trim();
  const payeeName = (params.payeeName || config.payeeName || "Yugantar Growth").trim();
  const amount = Math.max(0, Math.round(params.amount));
  const note = params.note || "Project Advance Payment";
  const isConfigured = Boolean(rawVpa);

  const vpa = isConfigured ? rawVpa : "UPI VPA Not Configured (Set in Settings)";
  const upiUri = isConfigured ? buildUpiUri({ ...params, vpa: rawVpa, payeeName, amount, note }) : "";
  const qrDataUrl = upiUri ? generateUpiQrDataUrl(upiUri) : "";
  const formattedAmount = `₹${amount.toLocaleString("en-IN")}`;

  return {
    vpa,
    payeeName,
    amount,
    note,
    upiUri,
    qrDataUrl,
    formattedAmount,
    isConfigured,
  };
}

export function validateUpiReference(utr: string): { valid: boolean; normalized?: string; error?: string } {
  if (!utr || typeof utr !== "string") {
    return { valid: false, error: "UTR reference number is required." };
  }

  const clean = utr.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (clean.length < 6) {
    return {
      valid: false,
      error: "UTR reference number must be at least 6 alphanumeric characters.",
    };
  }

  if (clean.length > 30) {
    return {
      valid: false,
      error: "UTR reference number exceeds maximum permitted length (30 characters).",
    };
  }

  return { valid: true, normalized: clean };
}

export interface AdvancePaymentState {
  advanceReceived: boolean;
  utrReference?: string;
  amountPaid?: number;
  verifiedAt?: string;
  notes?: string;
}

export function evaluateAdvancePaymentGate(
  contractValue: number,
  paymentState: AdvancePaymentState,
  minAdvancePercentage: number = 50
): {
  allowed: boolean;
  reason?: string;
  requiredAdvance: number;
  shortfall: number;
} {
  const requiredAdvance = Math.round((contractValue * minAdvancePercentage) / 100);
  const paid = Math.max(0, paymentState.amountPaid || 0);
  const shortfall = Math.max(0, requiredAdvance - paid);

  if (!paymentState.advanceReceived) {
    return {
      allowed: false,
      reason: "Advance payment has not been marked as received.",
      requiredAdvance,
      shortfall,
    };
  }

  const utrCheck = validateUpiReference(paymentState.utrReference || "");
  if (!utrCheck.valid) {
    return {
      allowed: false,
      reason: `Invalid bank UTR reference: ${utrCheck.error}`,
      requiredAdvance,
      shortfall,
    };
  }

  if (shortfall > 0) {
    return {
      allowed: false,
      reason: `Insufficient advance payment: Received ₹${paid.toLocaleString("en-IN")}, minimum required is ₹${requiredAdvance.toLocaleString("en-IN")}.`,
      requiredAdvance,
      shortfall,
    };
  }

  return {
    allowed: true,
    requiredAdvance,
    shortfall: 0,
  };
}
