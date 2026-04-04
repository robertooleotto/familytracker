const ARGO_BASE = "https://www.portaleargo.it/famiglia/api/rest";
const ARGO_KEY = "ax6542sdru3217t4eesd9";
const ARGO_VERSION = "2.0.2";

export interface ArgoSession {
  token: string;
  schoolCode: string;
  username: string;
  studentId: string;
  firstName: string;
  lastName: string;
}

export interface ArgoGrade {
  subjectName: string;
  grade: number | null;
  gradeStr: string;
  type: string;
  date: Date;
  notes: string;
  externalId: string;
}

export interface ArgoAbsence {
  date: Date;
  type: string;
  minutes: number | null;
  justified: boolean;
  notes: string;
  externalId: string;
}

export interface ArgoHomework {
  subjectName: string;
  description: string;
  dueDate: Date | null;
  givenAt: Date | null;
  externalId: string;
}

export interface ArgoNotice {
  title: string;
  content: string;
  date: Date | null;
  externalId: string;
}

function argoHeaders(schoolCode: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "x-key-app": ARGO_KEY,
    "x-version": ARGO_VERSION,
    "x-cod-min": schoolCode,
    "User-Agent": "Mozilla/5.0 (compatible; FamilyTracker/1.0)",
    "Content-Type": "application/json",
    ...extra,
  };
}

async function argoFetch(path: string, session: ArgoSession, params: Record<string, string> = {}) {
  const url = new URL(`${ARGO_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: argoHeaders(session.schoolCode, {
      "x-auth-token": session.token,
      "x-prg-alunno": session.studentId,
    }),
  });
  if (!res.ok) throw new Error(`Argo HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function argoLogin(schoolCode: string, username: string, password: string): Promise<ArgoSession> {
  const res = await fetch(`${ARGO_BASE}/login`, {
    headers: argoHeaders(schoolCode, {
      "x-user-id": username,
      "x-pwd": password,
    }),
  });
  if (!res.ok) throw new Error(`Login Argo fallito: ${res.status}`);
  const data = await res.json();
  const token = data.token || data.authToken;
  if (!token) throw new Error("Risposta login Argo non valida");

  const schedeRes = await fetch(`${ARGO_BASE}/schede`, {
    headers: argoHeaders(schoolCode, { "x-auth-token": token }),
  });
  if (!schedeRes.ok) throw new Error(`Argo schede errore: ${schedeRes.status}`);
  const schedeData = await schedeRes.json();
  const scheda = Array.isArray(schedeData) ? schedeData[0] : schedeData;
  const studentId = scheda?.prgAlunno?.toString() || "0";
  const firstName = scheda?.alunno?.nome || "";
  const lastName = scheda?.alunno?.cognome || "";

  return { token, schoolCode, username, studentId, firstName, lastName };
}

export async function argoGrades(session: ArgoSession): Promise<ArgoGrade[]> {
  try {
    const data = await argoFetch("/votigiornalieri", session);
    const rows: any[] = data.dati || [];
    return rows.map((v: any, i: number) => {
      const gradeStr = v.decVoto?.toString() || v.strVoto || "–";
      const gradeNum = parseFloat(gradeStr.replace(",", "."));
      return {
        subjectName: v.desMateria || v.materia || "Materia",
        grade: isNaN(gradeNum) ? null : gradeNum,
        gradeStr,
        type: v.tipoValutazione || "voto",
        date: v.datGiorno ? new Date(v.datGiorno) : new Date(),
        notes: v.desCommento || "",
        externalId: `argo-grade-${session.studentId}-${i}`,
      };
    });
  } catch {
    return [];
  }
}

export async function argoAbsences(session: ArgoSession): Promise<ArgoAbsence[]> {
  try {
    const data = await argoFetch("/assenze", session);
    const rows: any[] = data.dati || [];
    return rows.map((a: any, i: number) => {
      const type = a.codEvento === "A" ? "assenza" : a.codEvento === "R" ? "ritardo" : a.codEvento === "U" ? "uscita_anticipata" : a.codEvento || "assenza";
      return {
        date: a.datAssenza ? new Date(a.datAssenza) : new Date(),
        type,
        minutes: a.numOra ? parseInt(a.numOra) * 60 : null,
        justified: a.flgGiustificata === "S" || a.giustificata === true,
        notes: a.desNota || "",
        externalId: `argo-abs-${session.studentId}-${i}`,
      };
    });
  } catch {
    return [];
  }
}

export async function argoHomework(session: ArgoSession): Promise<ArgoHomework[]> {
  try {
    const data = await argoFetch("/compiti", session);
    const rows: any[] = data.dati || [];
    return rows.map((c: any, i: number) => ({
      subjectName: c.desMateria || "Generale",
      description: c.desCompiti || c.desAttivita || "–",
      dueDate: c.datGiorno ? new Date(c.datGiorno) : null,
      givenAt: c.datAssegnazione ? new Date(c.datAssegnazione) : null,
      externalId: `argo-hw-${session.studentId}-${i}`,
    }));
  } catch {
    return [];
  }
}

export async function argoNotices(session: ArgoSession): Promise<ArgoNotice[]> {
  try {
    const data = await argoFetch("/comunicazioni", session);
    const rows: any[] = data.dati || [];
    return rows.map((n: any, i: number) => ({
      title: n.desOggetto || n.oggetto || "Comunicazione",
      content: n.desMessaggio || n.testo || "",
      date: n.datComunicazione ? new Date(n.datComunicazione) : null,
      externalId: `argo-notice-${session.studentId}-${i}`,
    }));
  } catch {
    return [];
  }
}
