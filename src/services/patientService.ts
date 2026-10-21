export interface DailyData {
  date: string;
  fev1: number;
  fvc: number;
  fev1Fvc: number;
  pef: number;
}

export interface PatientData {
  id: string;
  userId: string;
  name: string;
  fev1: number;
  fvc: number;
  fev1Fvc: number;
  pef: number;
  status: 'stable' | 'attention' | 'critical';
  advice?: string;
  history?: DailyData[];
}

interface UserRecord {
  id: string;
  username: string;
  email?: string;
  role: string;
}

const DEFAULT_PATIENT_USERS: UserRecord[] = [
  {
    id: 'U171204820001',
    username: '健康守护者_老王',
    email: 'patient001@qq.com',
    role: 'patient'
  },
  {
    id: 'U171204820002',
    username: '阳光总在风雨后',
    email: 'patient002@qq.com',
    role: 'patient'
  },
  {
    id: 'U171204820003',
    username: '珍爱生命_远离香烟',
    email: 'patient003@qq.com',
    role: 'patient'
  },
  {
    id: 'U171204820004',
    username: '深呼吸_慢慢来',
    email: 'patient004@qq.com',
    role: 'patient'
  },
  {
    id: 'U171204820005',
    username: '肺部健康我最棒',
    email: 'patient005@qq.com',
    role: 'patient'
  }
];

const DEFAULT_PATIENT_BASELINE: Record<string, Pick<PatientData, 'fev1' | 'fvc' | 'pef' | 'status'>> = {
  U171204820001: { fev1: 86.2, fvc: 94.1, pef: 89.5, status: 'stable' },
  U171204820002: { fev1: 79.6, fvc: 89.4, pef: 82.7, status: 'stable' },
  U171204820003: { fev1: 71.8, fvc: 85.2, pef: 75.4, status: 'attention' },
  U171204820004: { fev1: 66.3, fvc: 81.5, pef: 69.8, status: 'attention' },
  U171204820005: { fev1: 58.4, fvc: 76.8, pef: 61.2, status: 'critical' }
};

const DEFAULT_PATIENT_UIDS = DEFAULT_PATIENT_USERS.map((user) => user.id);

const roundToOneDecimal = (value: number): number => Math.round(value * 10) / 10;

const calculateFev1Fvc = (fev1: number, fvc: number): number => {
  if (!fvc) return 0;
  return roundToOneDecimal((fev1 / fvc) * 100);
};

const calculateStatus = (fev1: number, fev1Fvc: number): 'stable' | 'attention' | 'critical' => {
  if (fev1Fvc < 70) {
    return 'critical';
  }

  if (fev1Fvc < 80 || fev1 < 70) {
    return 'attention';
  }

  return 'stable';
};

const generateHistoryData = (baseFev1: number, baseFvc: number, days: number = 90): DailyData[] => {
  const data: DailyData[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    const fev1Variation = (Math.random() - 0.5) * 10;
    const fvcVariation = (Math.random() - 0.5) * 8;

    const fev1 = Math.max(40, Math.min(100, baseFev1 + fev1Variation));
    const fvc = Math.max(50, Math.min(110, baseFvc + fvcVariation));
    const fev1Fvc = calculateFev1Fvc(fev1, fvc);
    const pef = roundToOneDecimal(fev1 * 2 + (Math.random() - 0.5) * 10);

    data.push({
      date: date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
      fev1: roundToOneDecimal(fev1),
      fvc: roundToOneDecimal(fvc),
      fev1Fvc,
      pef
    });
  }

  return data;
};

const createDefaultPatientData = (user: UserRecord): PatientData => {
  const baseline = DEFAULT_PATIENT_BASELINE[user.id] || {
    fev1: 85.0,
    fvc: 92.0,
    pef: 88.0,
    status: 'stable' as const
  };
  const fev1Fvc = calculateFev1Fvc(baseline.fev1, baseline.fvc);

  return {
    id: user.id,
    userId: user.id,
    name: user.username,
    fev1: baseline.fev1,
    fvc: baseline.fvc,
    fev1Fvc,
    pef: baseline.pef,
    status: baseline.status || calculateStatus(baseline.fev1, fev1Fvc),
    advice: '',
    history: generateHistoryData(baseline.fev1, baseline.fvc, 90)
  };
};

const normalizePatientData = (user: UserRecord, patient?: Partial<PatientData>): PatientData => {
  const fallback = createDefaultPatientData(user);
  const fev1 = typeof patient?.fev1 === 'number' ? patient.fev1 : fallback.fev1;
  const fvc = typeof patient?.fvc === 'number' ? patient.fvc : fallback.fvc;
  const pef = typeof patient?.pef === 'number' ? patient.pef : fallback.pef;
  const fev1Fvc = typeof patient?.fev1Fvc === 'number' ? patient.fev1Fvc : calculateFev1Fvc(fev1, fvc);
  const history = Array.isArray(patient?.history) && patient!.history.length > 0
    ? (patient!.history.length >= 90
        ? patient!.history.slice(-90)
        : [...(fallback.history || []).slice(0, 90 - patient!.history.length), ...patient!.history])
    : fallback.history;

  return {
    id: user.id,
    userId: user.id,
    name: user.username,
    fev1,
    fvc,
    fev1Fvc,
    pef,
    status: patient?.status || calculateStatus(fev1, fev1Fvc),
    advice: patient?.advice || '',
    history
  };
};

const getStoredUsers = (): UserRecord[] => {
  try {
    const usersData = localStorage.getItem('users');
    if (!usersData) {
      return DEFAULT_PATIENT_USERS;
    }

    const parsed = JSON.parse(usersData);
    const allUsers = Array.isArray(parsed) ? parsed : parsed?.users;

    if (!Array.isArray(allUsers)) {
      return DEFAULT_PATIENT_USERS;
    }

    const patientUsers = allUsers.filter((user: UserRecord) => user.role === 'patient');

    if (patientUsers.length === 0) {
      return DEFAULT_PATIENT_USERS;
    }

    const matchedDefaultUsers = DEFAULT_PATIENT_UIDS
      .map((uid) => patientUsers.find((user: UserRecord) => user.id === uid))
      .filter((user): user is UserRecord => Boolean(user));

    return matchedDefaultUsers.length > 0 ? matchedDefaultUsers : patientUsers;
  } catch (error) {
    console.error('获取患者用户失败:', error);
    return DEFAULT_PATIENT_USERS;
  }
};

const getPatientsFromUsers = (): PatientData[] => {
  const patientUsers = getStoredUsers();

  return patientUsers.map((user) => {
    try {
      const savedData = localStorage.getItem(`patient_health_${user.id}`);

      if (savedData) {
        const patient = normalizePatientData(user, JSON.parse(savedData));
        localStorage.setItem(`patient_health_${user.id}`, JSON.stringify(patient));
        return patient;
      }

      const defaultPatient = createDefaultPatientData(user);
      localStorage.setItem(`patient_health_${user.id}`, JSON.stringify(defaultPatient));
      return defaultPatient;
    } catch (error) {
      console.error(`初始化患者 ${user.id} 数据失败:`, error);
      const fallbackPatient = createDefaultPatientData(user);
      localStorage.setItem(`patient_health_${user.id}`, JSON.stringify(fallbackPatient));
      return fallbackPatient;
    }
  });
};

const getUserByUid = (uid: string): UserRecord => {
  const patientUsers = getStoredUsers();
  const matchedUser = patientUsers.find((user) => user.id === uid);

  if (matchedUser) {
    return matchedUser;
  }

  const defaultUser = DEFAULT_PATIENT_USERS.find((user) => user.id === uid);
  if (defaultUser) {
    return defaultUser;
  }

  return {
    id: uid,
    username: uid,
    role: 'patient'
  };
};

class PatientService {
  getAllPatients(): PatientData[] {
    return getPatientsFromUsers();
  }

  getPatientsByStatus(status: 'stable' | 'attention' | 'critical'): PatientData[] {
    const allPatients = this.getAllPatients();
    return allPatients.filter((patient) => patient.status === status);
  }

  getPatientById(id: string): PatientData | undefined {
    const allPatients = this.getAllPatients();
    return allPatients.find((patient) => patient.id === id || patient.userId === id);
  }

  updateDailyData(userId: string, fev1: number, fvc: number, pef: number): boolean {
    try {
      const user = getUserByUid(userId);
      const savedData = localStorage.getItem(`patient_health_${userId}`);
      const currentPatient = savedData ? JSON.parse(savedData) : undefined;
      const patient = normalizePatientData(user, currentPatient);
      const fev1Fvc = calculateFev1Fvc(fev1, fvc);
      const status = calculateStatus(fev1, fev1Fvc);
      const today = new Date().toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

      const history = Array.isArray(patient.history) ? [...patient.history] : [];
      const todayIndex = history.findIndex((item) => item.date === today);
      const dailyRecord: DailyData = {
        date: today,
        fev1: roundToOneDecimal(fev1),
        fvc: roundToOneDecimal(fvc),
        fev1Fvc,
        pef: roundToOneDecimal(pef)
      };

      if (todayIndex >= 0) {
        history[todayIndex] = dailyRecord;
      } else {
        history.push(dailyRecord);
      }

      const normalizedHistory = history.slice(-90);

      const updatedPatient: PatientData = {
        ...patient,
        id: userId,
        userId,
        name: user.username,
        fev1: roundToOneDecimal(fev1),
        fvc: roundToOneDecimal(fvc),
        fev1Fvc,
        pef: roundToOneDecimal(pef),
        status,
        history: normalizedHistory
      };

      localStorage.setItem(`patient_health_${userId}`, JSON.stringify(updatedPatient));
      return true;
    } catch (error) {
      console.error('更新患者数据失败:', error);
      return false;
    }
  }

  updateAdvice(userId: string, advice: string): boolean {
    try {
      const user = getUserByUid(userId);
      const savedData = localStorage.getItem(`patient_health_${userId}`);
      const currentPatient = savedData ? JSON.parse(savedData) : undefined;
      const patient = normalizePatientData(user, currentPatient);

      patient.advice = advice;
      patient.id = userId;
      patient.userId = userId;
      patient.name = user.username;

      localStorage.setItem(`patient_health_${userId}`, JSON.stringify(patient));
      return true;
    } catch (error) {
      console.error('更新建议失败:', error);
      return false;
    }
  }
}

export const patientService = new PatientService();
