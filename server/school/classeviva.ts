const CV_BASE = "https://web.spaggiari.eu/rest/v1";
const CV_HEADERS = {
  "Content-Type": "application/json",
  "Z-Dev-ApiKey": "+zorro+",
  "User-Agent": "zorro/1.0",
  "Z-Auth-Token": "",
};

export interface CvSession {
  token: string;
  studentId: string;
  firstName: string;
  lastName: string;
}

export interface CvGrade {
  subjectName: string;
  grade: number | null;
  gradeStr: string;
  type: string;
  date: Date;
  notes: string;
  externalId: string;
}

export interface CvAbsence {
  date: Date;
  type: string;
  minutes: number | null;
  justified: boolean;
  notes: string;
  externalId: string;
}

export interface CvHomework {
  subjectName: string;
  description: string;
  dueDate: Date | null;
  givenAt: Date | null;
  externalId: string;
}

export interface CvNotice {
  title: string;
  content: string;
  date: Date | null;
  externalId: string;
}

async function cvFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${CV_BASE}${path}`, {
    ...options,
    headers: {
      ...CV_HEADERS,
      "Z-Auth-Token": token,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`ClasseViva HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function classevivaLogin(username: string, password: string): Promise<CvSession> {
  const res = await fetch(`${CV_BASE}/auth/login`, {
    method: "POST",
    headers: CV_HEADERS,
    body: JSON.stringify({ uid: username, pass: password, showAttemptedLoginCheck: "1" }),
  });
  if (!res.ok) throw new Error(`Login ClasseViva fallito: ${res.status}`);
  const data = await res.json();
  const token = data.token;
  const studentId = data.ident;
  const firstName = data.firstName || "";
  const lastName = data.lastName || "";
  if (!token || !studentId) throw new Error("Risposta login ClasseViva non valida");
  return { token, studentId, firstName, lastName };
}

function yearRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    from: `${year}0901`,
    to: `${year + 1}0630`,
  };
}

export async function classevivaGrades(session: CvSession): Promise<CvGrade[]> {
  try {
    const data = await cvFetch(`/students/${session.studentId}/grades`, session.token);
    const grades: any[] = data.grades || [];
    return grades.map((g: any) => ({
      subjectName: g.subjectDesc || g.subjectCode || "Materia sconosciuta",
      grade: g.decimalValue != null ? parseFloat(g.decimalValue) : null,
      gradeStr: g.displayValue || g.decimalValue?.toString() || "–",
      type: g.componentDesc || "–",
      date: new Date(g.evtDate || Date.now()),
      notes: g.notesForFamily || "",
      externalId: `cv-grade-${g.evtId}`,
    }));
  } catch {
    return [];
  }
}

export async function classevivaAbsences(session: CvSession): Promise<CvAbsence[]> {
  try {
    const data = await cvFetch(`/students/${session.studentId}/absences/details`, session.token);
    const events: any[] = data.events || [];
    return events.map((e: any) => ({
      date: new Date(e.evtDate || Date.now()),
      type: e.evtCode === "ABA0" ? "assenza" : e.evtCode === "ITR0" ? "ritardo" : e.evtCode === "USR0" ? "uscita_anticipata" : e.evtCode || "assenza",
      minutes: e.evtHMin ? parseInt(e.evtHMin) * 60 + (parseInt(e.evtMMin) || 0) : null,
      justified: e.isJustified === true || e.isJustified === "true",
      notes: e.evtValue || "",
      externalId: `cv-abs-${e.evtId}`,
    }));
  } catch {
    return [];
  }
}

export async function classevivaHomework(session: CvSession): Promise<CvHomework[]> {
  try {
    const { from, to } = yearRange();
    const data = await cvFetch(`/students/${session.studentId}/agenda/all/${from}/${to}`, session.token);
    const agenda: any[] = data.agenda || [];
    return agenda
      .filter((a: any) => a.evtCode === "AGNT" || a.notes)
      .map((a: any) => ({
        subjectName: a.subjectDesc || a.subjectCode || "Generale",
        description: a.notes || a.evtCode || "–",
        dueDate: a.evtDatetimeEnd ? new Date(a.evtDatetimeEnd) : null,
        givenAt: a.evtDatetimeBegin ? new Date(a.evtDatetimeBegin) : null,
        externalId: `cv-hw-${a.evtId}`,
      }));
  } catch {
    return [];
  }
}

export async function classevivaNotices(session: CvSession): Promise<CvNotice[]> {
  try {
    const data = await cvFetch(`/students/${session.studentId}/noticeboard`, session.token);
    const items: any[] = data.items || [];
    return items.map((n: any) => ({
      title: n.cntTitle || n.evtCode || "Comunicazione",
      content: n.cntText || "",
      date: n.pubDT ? new Date(n.pubDT) : null,
      externalId: `cv-notice-${n.pubId}`,
    }));
  } catch {
    return [];
  }
}
