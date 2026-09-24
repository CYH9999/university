/**
 * Optional starter templates. Nothing here is inserted automatically: the user explicitly
 * chooses a template when creating a roadmap, note or grade structure.
 */
import type { CyberTopic, GradeCategory, RoadmapTrack } from "./model/enums";
import { textToDoc } from "./utils/richtext";

type Lang = "ar" | "en";
type Bi = { en: string; ar: string };

const b = (en: string, ar: string): Bi => ({ en, ar });

export const ROADMAP_TEMPLATES: Record<Exclude<RoadmapTrack, "custom">, Bi[]> = {
  linux: [
    b("Filesystem hierarchy and navigation", "هيكل نظام الملفات والتنقل"),
    b("Users, groups and permissions (chmod, chown, sudo)", "المستخدمون والمجموعات والصلاحيات"),
    b("Processes, services and systemd", "العمليات والخدمات و systemd"),
    b("Package management (apt, dnf)", "إدارة الحزم (apt و dnf)"),
    b("Text processing: grep, sed, awk, pipes", "معالجة النصوص: grep و sed و awk والأنابيب"),
    b("Bash scripting basics", "أساسيات برمجة Bash"),
    b("Logs and journalctl", "السجلات و journalctl"),
    b("SSH and remote administration", "SSH والإدارة عن بعد"),
    b("Linux hardening checklist", "قائمة تحصين نظام Linux"),
  ],
  networking: [
    b("OSI and TCP/IP models", "نموذجا OSI و TCP/IP"),
    b("IP addressing and subnetting", "عنونة IP وتقسيم الشبكات الفرعية"),
    b("TCP, UDP and the three-way handshake", "بروتوكولا TCP و UDP والمصافحة الثلاثية"),
    b("DNS, DHCP and ARP", "DNS و DHCP و ARP"),
    b("Routing and switching basics, VLANs", "أساسيات التوجيه والتبديل و VLAN"),
    b("Packet analysis with Wireshark", "تحليل الحزم باستخدام Wireshark"),
    b("Firewalls, NAT and VPNs", "الجدران النارية و NAT و VPN"),
    b("Common network attacks and defenses", "هجمات الشبكات الشائعة وطرق الحماية"),
  ],
  web_security: [
    b("HTTP, cookies, sessions and headers", "HTTP وملفات تعريف الارتباط والجلسات والترويسات"),
    b("OWASP Top 10 overview", "نظرة عامة على OWASP Top 10"),
    b("SQL injection (theory and prevention)", "حقن SQL (النظرية والوقاية)"),
    b("Cross-site scripting (XSS)", "البرمجة عبر المواقع (XSS)"),
    b("Authentication and access control flaws", "ثغرات المصادقة والتحكم بالوصول"),
    b("CSRF and SSRF", "هجمات CSRF و SSRF"),
    b("Using Burp Suite in a legal lab", "استخدام Burp Suite في مختبر قانوني"),
    b("Secure coding practices", "ممارسات البرمجة الآمنة"),
  ],
  cryptography: [
    b("Classical ciphers and frequency analysis", "الشيفرات الكلاسيكية وتحليل التكرار"),
    b("Symmetric encryption (AES, modes of operation)", "التشفير المتماثل (AES وأنماط التشغيل)"),
    b("Asymmetric encryption (RSA, ECC)", "التشفير غير المتماثل (RSA و ECC)"),
    b("Hash functions and MACs", "دوال التجزئة و MAC"),
    b("Digital signatures and PKI", "التواقيع الرقمية والبنية التحتية للمفاتيح العامة"),
    b("TLS handshake", "مصافحة TLS"),
    b("Password storage (bcrypt, Argon2)", "تخزين كلمات المرور (bcrypt و Argon2)"),
  ],
  digital_forensics: [
    b("Forensic process and chain of custody", "المنهجية الجنائية وسلسلة الحيازة"),
    b("Disk imaging and hashing", "أخذ نسخ الأقراص والتجزئة"),
    b("File systems (NTFS, ext4) artifacts", "آثار أنظمة الملفات (NTFS و ext4)"),
    b("Windows artifacts: registry, prefetch, event logs", "آثار Windows: السجل و prefetch وسجلات الأحداث"),
    b("Memory forensics with Volatility", "التحليل الجنائي للذاكرة باستخدام Volatility"),
    b("Timeline analysis", "تحليل الخط الزمني"),
    b("Writing a forensic report", "كتابة تقرير جنائي"),
  ],
  soc: [
    b("SOC roles and workflow", "أدوار مركز العمليات الأمنية وسير العمل"),
    b("Log sources and normalization", "مصادر السجلات وتوحيدها"),
    b("SIEM basics and writing queries", "أساسيات SIEM وكتابة الاستعلامات"),
    b("Alert triage and false positives", "فرز التنبيهات والإنذارات الكاذبة"),
    b("MITRE ATT&CK framework", "إطار MITRE ATT&CK"),
    b("Threat intelligence basics", "أساسيات استخبارات التهديدات"),
    b("Incident response playbooks", "أدلة الاستجابة للحوادث"),
  ],
  penetration_testing: [
    b("Legal scope, rules of engagement and ethics", "النطاق القانوني وقواعد الاشتباك والأخلاقيات"),
    b("Reconnaissance and OSINT", "الاستطلاع وجمع المعلومات المفتوحة"),
    b("Scanning and enumeration", "المسح والتعداد"),
    b("Vulnerability assessment", "تقييم الثغرات"),
    b("Exploitation in lab environments", "الاستغلال في بيئات المختبر"),
    b("Privilege escalation (Linux/Windows)", "رفع الصلاحيات (Linux و Windows)"),
    b("Reporting and remediation advice", "كتابة التقارير وتوصيات المعالجة"),
  ],
  malware_analysis: [
    b("Safe lab setup (isolated VM, snapshots)", "إعداد مختبر آمن (آلة افتراضية معزولة ولقطات)"),
    b("Static analysis: strings, PE headers, hashes", "التحليل الساكن: النصوص وترويسات PE والتجزئة"),
    b("Dynamic analysis and sandboxes", "التحليل الديناميكي وبيئات العزل"),
    b("Common malware behaviors and persistence", "سلوكيات البرمجيات الخبيثة الشائعة والاستمرارية"),
    b("YARA rules", "قواعد YARA"),
    b("Writing an analysis report", "كتابة تقرير تحليل"),
  ],
  reverse_engineering: [
    b("x86/x64 assembly basics", "أساسيات لغة التجميع x86/x64"),
    b("Calling conventions and the stack", "اصطلاحات الاستدعاء والمكدس"),
    b("Using Ghidra", "استخدام Ghidra"),
    b("Debugging with x64dbg / GDB", "التنقيح باستخدام x64dbg و GDB"),
    b("Reversing crackmes (legal practice)", "حل تحديات crackme (تدريب قانوني)"),
    b("Obfuscation and packing basics", "أساسيات التعمية والضغط"),
  ],
};

export function roadmapTemplate(track: RoadmapTrack, lang: Lang): string[] {
  if (track === "custom") return [];
  return ROADMAP_TEMPLATES[track].map((x) => x[lang]);
}

const NOTE_SECTIONS: Record<Lang, Record<string, string[]>> = {
  en: {
    concept: ["Definition", "How it works", "Example", "Risks and attacks", "Defenses and mitigations", "Commands and tools", "References"],
    lab: ["Objective", "Environment", "Steps", "Findings", "Lessons learned"],
    ctf: ["Challenge", "Recon", "Approach", "Solution", "Flag", "What I learned"],
    incident: ["Summary", "Timeline", "Indicators of compromise", "Containment", "Eradication and recovery", "Lessons learned"],
    lecture: ["Main points", "Definitions", "Examples", "Questions to ask", "Summary"],
  },
  ar: {
    concept: ["التعريف", "آلية العمل", "مثال", "المخاطر والهجمات", "طرق الحماية والتخفيف", "الأوامر والأدوات", "المراجع"],
    lab: ["الهدف", "البيئة", "الخطوات", "النتائج", "الدروس المستفادة"],
    ctf: ["التحدي", "الاستطلاع", "طريقة الحل", "الحل", "العلم (Flag)", "ما تعلمته"],
    incident: ["الملخص", "الخط الزمني", "مؤشرات الاختراق", "الاحتواء", "الإزالة والتعافي", "الدروس المستفادة"],
    lecture: ["النقاط الرئيسية", "التعريفات", "أمثلة", "أسئلة لطرحها", "الخلاصة"],
  },
};

/** Note skeleton (headings only) for a cybersecurity topic or note type. */
export function noteTemplate(kind: "concept" | "lab" | "ctf" | "incident" | "lecture", lang: Lang): string {
  const sections = NOTE_SECTIONS[lang][kind];
  return JSON.stringify(textToDoc(sections.map((s) => `## ${s}\n\n`).join("\n\n")));
}

export function templateKindForTopic(topic: CyberTopic | null): "concept" | "incident" {
  return topic === "incident_response" ? "incident" : "concept";
}

export const GRADE_TEMPLATES: Record<string, { name: Bi; category: GradeCategory; weight: number }[]> = {
  iraqi_standard: [
    { name: b("Midterm exam", "امتحان نصف الفصل"), category: "midterm", weight: 20 },
    { name: b("Quizzes", "الاختبارات القصيرة"), category: "quiz", weight: 5 },
    { name: b("Assignments & reports", "الواجبات والتقارير"), category: "assignment", weight: 10 },
    { name: b("Lab work", "العملي"), category: "lab", weight: 5 },
    { name: b("Final exam", "الامتحان النهائي"), category: "final", weight: 60 },
  ],
  balanced: [
    { name: b("Assignments", "الواجبات"), category: "assignment", weight: 20 },
    { name: b("Quizzes", "الاختبارات القصيرة"), category: "quiz", weight: 10 },
    { name: b("Midterm exam", "امتحان نصف الفصل"), category: "midterm", weight: 25 },
    { name: b("Participation", "المشاركة"), category: "participation", weight: 5 },
    { name: b("Final exam", "الامتحان النهائي"), category: "final", weight: 40 },
  ],
  project_based: [
    { name: b("Project", "المشروع"), category: "project", weight: 40 },
    { name: b("Labs", "المختبرات"), category: "lab", weight: 20 },
    { name: b("Midterm exam", "امتحان نصف الفصل"), category: "midterm", weight: 15 },
    { name: b("Final exam", "الامتحان النهائي"), category: "final", weight: 25 },
  ],
};

export function gradeTemplate(key: string, lang: Lang) {
  return (GRADE_TEMPLATES[key] ?? []).map((x) => ({ name: x.name[lang], category: x.category, weight: x.weight }));
}
