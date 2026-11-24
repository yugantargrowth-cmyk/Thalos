// lib/objectionBank.ts — Indian B2B Objection Handling Framework & Hinglish Outreach Pitch Templates

export type ObjectionCategory =
  | "ALREADY_HAVE_AGENCY"
  | "SEND_PROFILE"
  | "BUDGET_HIGH"
  | "CALL_LATER"
  | "NOT_INTERESTED";

export interface ObjectionTemplate {
  key: ObjectionCategory;
  title: string;
  clientObjection: string;
  responseScript: string;
  talkingPoints: string[];
}

export const OBJECTION_BANK: Record<ObjectionCategory, ObjectionTemplate> = {
  ALREADY_HAVE_AGENCY: {
    key: "ALREADY_HAVE_AGENCY",
    title: "Existing Agency / In-House Developer",
    clientObjection: "Humare paas already agency ya website developer hai.",
    responseScript:
      "Bilkul samajh sakta hoon. Hum {company} ki existing agency ko replace karne nahi keh rahe. Hum sirf mobile conversion architecture (sub-2.0s load aur 1-click WhatsApp lead concierge) optimize karte hain taaki unke dwara laye gaye visitors me se 50% bounce na ho. Ek baar 1-page diagnostic roadmap dekh lijiye, pasand aaye toh existing team ke sath bhi share kar sakte hain.",
    talkingPoints: [
      "Complementary speed optimization layer, not replacing branding agency",
      "Specialized in sub-2s mobile latency and WhatsApp direct conversion",
      "No disruption to existing branding or hosting operations",
    ],
  },
  SEND_PROFILE: {
    key: "SEND_PROFILE",
    title: "Send Company Profile / Credentials First",
    clientObjection: "Apna company profile / work portfolio bhej dijiye pehle.",
    responseScript:
      "Zaroor! Generic PDF brochure bhejne ke bajaye humne specifically {company} ke liye 1-page digital bottleneck audit banaya hai jisme live load latency aur WhatsApp booking friction points mapped hain. Yahan WhatsApp pe share kar raha hoon — ek baar check karke batayiye kaunsa angle sabse relevant laga.",
    talkingPoints: [
      "Avoids generic agency brochure spam",
      "Sends client-specific 1-page audit instead",
      "Immediate conversational bridge back to WhatsApp",
    ],
  },
  BUDGET_HIGH: {
    key: "BUDGET_HIGH",
    title: "Budget Resistance / Advance Payment Hesitation",
    clientObjection: "Budget thoda zyada hai / Hum advance nahi dete.",
    responseScript:
      "Valid concern hai. Par sochiye: abhi mobile latency aur missing WhatsApp CTA ki wajah se har hafte kitne high-intent commercial clients drop ho rahe hain? ₹25,000 ka fixed 48-hour sprint deploy hota hai aur sirf 1-2 extra corporate leads me hi poora investment recover ho jata hai. Advance gate humare dedicated 48-hour turn-around guarantee ke liye standard protocol hai.",
    talkingPoints: [
      "Anchor price against lost client inquiry value",
      "Fixed 48h sprint pays for itself on first closed deal",
      "Advance gate strictly guarantees 48-hour delivery timeline",
    ],
  },
  CALL_LATER: {
    key: "CALL_LATER",
    title: "Timing Delay / After Festival Follow-up",
    clientObjection: "Abhi busy hoon / Agle mahine ya Diwali ke baad baat karte hain.",
    responseScript:
      "Samajh gaya! Calendar me mark kar diya hai next month ke liye. Tab tak ke liye humne aapke competitor benchmark aur mobile leaks ka 1-page sheet WhatsApp pe preserve kiya hai taaki rush me koi inquiry leak na ho. Agle mahine connect karte hain!",
    talkingPoints: [
      "Respect founder time without being pushy",
      "Drop value-add benchmark note to keep lead warm",
      "Set explicit callback date in CRM",
    ],
  },
  NOT_INTERESTED: {
    key: "NOT_INTERESTED",
    title: "General Disinterest / Passive Word-of-Mouth",
    clientObjection: "Humara kaam word of mouth se chalta hai, digital ki zaroorat nahi.",
    responseScript:
      "Word of mouth sabse strong foundation hai. Humare 90% clients bhi word-of-mouth pe hi depend karte hain. Par jab unka word-of-mouth reference smartphone pe unka website ya portfolio open karta hai, toh sub-2s speed aur direct WhatsApp contact unhe instantly impress karta hai. Closing the loop for now, all the best!",
    talkingPoints: [
      "Validate word-of-mouth as top acquisition channel",
      "Show how fast digital touchpoint validates word-of-mouth references",
      "Graceful, zero-pressure closure",
    ],
  },
};

export function getPersonalizedObjectionScript(category: ObjectionCategory, companyName: string): string {
  const template = OBJECTION_BANK[category] || OBJECTION_BANK.NOT_INTERESTED;
  return template.responseScript.replace(/{company}/g, companyName || "aapki company");
}

export function buildHinglishWhatsAppPitch(lead: {
  company: string;
  contact?: string;
  city?: string;
}): string {
  const contact = lead.contact || "Sir/Ma'am";
  const company = lead.company || "aapke business";
  const city = lead.city ? `(${lead.city})` : "";

  return `Namaste ${contact}! Main Shlok Pandya, Yugantar Growth Ahmedabad se.
Maine recently ${company} ${city} ka digital profile check kiya.
Aapka business kaafi solid hai, par mobile visitors ke liye direct 1-click WhatsApp concierge aur speed optimization se aapki inquiries 40%+ increase ho sakti hain.
Humne aapke liye ek quick 1-page speed & growth audit banaya hai.
Kya main yahan ek chhota preview share kar sakta hoon?`;
}
