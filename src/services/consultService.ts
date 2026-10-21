import { patientService, type PatientData } from './patientService';
import { userService, type User } from './userService';

export type ConsultRole = 'doctor' | 'patient' | 'system';
export type ConsultMessageType = 'text' | 'recommendation' | 'system';

export interface ConsultParticipant {
  id: string;
  name: string;
  role: ConsultRole;
  avatar?: string;
  email?: string;
  patientId?: string;
  status?: PatientData['status'];
}

export interface ConsultMessage {
  id: string;
  patientId: string;
  content: string;
  type: ConsultMessageType;
  role: ConsultRole;
  source: ConsultRole;
  senderId: string;
  senderName: string;
  createdAt: string;
  readByDoctor: boolean;
  readByPatient: boolean;
}

export interface ConsultThread {
  patientId: string;
  patientName: string;
  patientStatus?: PatientData['status'];
  doctor: ConsultParticipant;
  patient: ConsultParticipant;
  messages: ConsultMessage[];
  unreadCount: number;
  unreadCountDoctor: number;
  unreadCountPatient: number;
  lastMessage?: ConsultMessage;
  updatedAt: string;
  adviceSummary?: string;
}

const CONSULT_STORAGE_KEY = 'consult_feedback_threads_v1';
const CONSULT_SEEDED_KEY = 'consult_feedback_seeded_v1';

const nowIso = (): string => new Date().toISOString();

const createMessageId = (): string => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const isUserRole = (role: string | undefined): role is 'doctor' | 'patient' | 'student' => {
  return role === 'doctor' || role === 'patient' || role === 'student';
};

const getAllUsersSafe = (): User[] => {
  try {
    return userService.getAllUsers();
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return [];
  }
};

const getCurrentUserSafe = (): Omit<User, 'password'> | null => {
  try {
    return userService.getCurrentUser();
  } catch (error) {
    console.error('获取当前用户失败:', error);
    return null;
  }
};

const getPatientsSafe = (): PatientData[] => {
  try {
    return patientService.getAllPatients();
  } catch (error) {
    console.error('获取患者列表失败:', error);
    return [];
  }
};

const getDoctorUsers = (): User[] => {
  return getAllUsersSafe().filter((user) => user.role === 'doctor');
};

const getPrimaryDoctor = (): ConsultParticipant => {
  const currentUser = getCurrentUserSafe();
  const doctorUsers = getDoctorUsers();
  const activeDoctor = currentUser?.role === 'doctor'
    ? doctorUsers.find((user) => user.id === currentUser.id) || currentUser
    : doctorUsers[0];

  return {
    id: activeDoctor?.id || 'doctor_default',
    name: activeDoctor?.username || '张医生',
    role: 'doctor',
    avatar: activeDoctor?.avatar,
    email: activeDoctor?.email
  };
};

const getDoctorForPatient = (_patientId: string): ConsultParticipant => {
  return getPrimaryDoctor();
};

const getPatientParticipant = (patient: PatientData): ConsultParticipant => {
  const matchedUser = getAllUsersSafe().find((user) => user.id === patient.userId || user.id === patient.id);

  return {
    id: patient.userId || patient.id,
    name: patient.name,
    role: 'patient',
    avatar: matchedUser?.avatar,
    email: matchedUser?.email,
    patientId: patient.id,
    status: patient.status
  };
};

const sortMessages = (messages: ConsultMessage[]): ConsultMessage[] => {
  return [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

const buildThread = (
  patient: PatientData,
  doctor: ConsultParticipant,
  messages: ConsultMessage[]
): ConsultThread => {
  const sortedMessages = sortMessages(messages);
  const lastMessage = sortedMessages[sortedMessages.length - 1];
  const unreadCountDoctor = sortedMessages.filter((message) => !message.readByDoctor && message.source !== 'doctor').length;
  const unreadCountPatient = sortedMessages.filter((message) => !message.readByPatient && message.source !== 'patient').length;

  return {
    patientId: patient.id,
    patientName: patient.name,
    patientStatus: patient.status,
    doctor,
    patient: getPatientParticipant(patient),
    messages: sortedMessages,
    unreadCount: unreadCountDoctor,
    unreadCountDoctor,
    unreadCountPatient,
    lastMessage,
    updatedAt: lastMessage?.createdAt || nowIso(),
    adviceSummary: patient.advice || sortedMessages.filter((message) => message.type === 'recommendation').slice(-1)[0]?.content || ''
  };
};

const createSystemMessage = (patientId: string, content: string, createdAt: string): ConsultMessage => {
  return {
    id: createMessageId(),
    patientId,
    content,
    type: 'system',
    role: 'system',
    source: 'system',
    senderId: 'system',
    senderName: '系统助手',
    createdAt,
    readByDoctor: true,
    readByPatient: true
  };
};

const createSeedMessages = (patient: PatientData, doctor: ConsultParticipant): ConsultMessage[] => {
  const recommendationText = patient.advice || '建议保持规律用药与肺功能监测，每日记录呼吸状态，如出现胸闷、气促加重请尽快复诊。';

  return [
    createSystemMessage(patient.id, `欢迎进入${doctor.name}与${patient.name}的咨询反馈通道。`, new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString()),
    {
      id: createMessageId(),
      patientId: patient.id,
      content: '医生您好，我这两天晨起时有点气短，活动后会明显一些。',
      type: 'text',
      role: 'patient',
      source: 'patient',
      senderId: patient.userId || patient.id,
      senderName: patient.name,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
      readByDoctor: false,
      readByPatient: true
    },
    {
      id: createMessageId(),
      patientId: patient.id,
      content: '已收到您的反馈，我会结合最近肺功能数据给出建议，请先注意减少剧烈运动并观察夜间症状。',
      type: 'text',
      role: 'doctor',
      source: 'doctor',
      senderId: doctor.id,
      senderName: doctor.name,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
      readByDoctor: true,
      readByPatient: false
    },
    {
      id: createMessageId(),
      patientId: patient.id,
      content: recommendationText,
      type: 'recommendation',
      role: 'doctor',
      source: 'doctor',
      senderId: doctor.id,
      senderName: doctor.name,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
      readByDoctor: true,
      readByPatient: false
    }
  ];
};

const readStoredThreads = (): Record<string, ConsultMessage[]> => {
  try {
    const raw = localStorage.getItem(CONSULT_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([patientId, messages]) => {
        if (!Array.isArray(messages)) {
          return [patientId, []];
        }

        const normalized = messages
          .filter((message): message is Partial<ConsultMessage> => Boolean(message && typeof message === 'object'))
          .map((message) => ({
            id: typeof message.id === 'string' ? message.id : createMessageId(),
            patientId: typeof message.patientId === 'string' ? message.patientId : patientId,
            content: typeof message.content === 'string' ? message.content : '',
            type: message.type === 'recommendation' || message.type === 'system' ? message.type : 'text',
            role: message.role === 'doctor' || message.role === 'patient' || message.role === 'system' ? message.role : 'system',
            source: message.source === 'doctor' || message.source === 'patient' || message.source === 'system' ? message.source : 'system',
            senderId: typeof message.senderId === 'string' ? message.senderId : 'system',
            senderName: typeof message.senderName === 'string' ? message.senderName : '系统助手',
            createdAt: typeof message.createdAt === 'string' ? message.createdAt : nowIso(),
            readByDoctor: typeof message.readByDoctor === 'boolean' ? message.readByDoctor : true,
            readByPatient: typeof message.readByPatient === 'boolean' ? message.readByPatient : true
          }));

        return [patientId, sortMessages(normalized)];
      })
    );
  } catch (error) {
    console.error('读取咨询会话失败:', error);
    return {};
  }
};

const writeStoredThreads = (threads: Record<string, ConsultMessage[]>): void => {
  localStorage.setItem(CONSULT_STORAGE_KEY, JSON.stringify(threads));
};

const ensureSeedData = (): Record<string, ConsultMessage[]> => {
  const patients = getPatientsSafe();
  const existingThreads = readStoredThreads();
  const doctor = getPrimaryDoctor();
  let changed = !localStorage.getItem(CONSULT_SEEDED_KEY);

  patients.forEach((patient, index) => {
    const existing = existingThreads[patient.id];
    if (!Array.isArray(existing) || existing.length === 0) {
      if (index < 3) {
        existingThreads[patient.id] = createSeedMessages(patient, doctor);
        changed = true;
      } else {
        existingThreads[patient.id] = [
          createSystemMessage(
            patient.id,
            `欢迎进入${doctor.name}与${patient.name}的咨询反馈通道。`,
            new Date(Date.now() - 1000 * 60 * (index + 1)).toISOString()
          )
        ];
        changed = true;
      }
    }
  });

  if (changed) {
    writeStoredThreads(existingThreads);
    localStorage.setItem(CONSULT_SEEDED_KEY, 'true');
  }

  return existingThreads;
};

const upsertMessage = (patientId: string, message: ConsultMessage): ConsultThread => {
  const threads = ensureSeedData();
  const currentMessages = Array.isArray(threads[patientId]) ? threads[patientId] : [];
  threads[patientId] = sortMessages([...currentMessages, message]);
  writeStoredThreads(threads);

  const patient = patientService.getPatientById(patientId) || getPatientsSafe().find((item) => item.id === patientId);
  const resolvedPatient = patient || {
    id: patientId,
    userId: patientId,
    name: patientId,
    fev1: 0,
    fvc: 0,
    fev1Fvc: 0,
    pef: 0,
    status: 'stable' as const,
    advice: ''
  };

  return buildThread(resolvedPatient, getDoctorForPatient(patientId), threads[patientId]);
};

class ConsultService {
  getStorageKey(): string {
    return CONSULT_STORAGE_KEY;
  }

  getDoctorPatients(): PatientData[] {
    const currentUser = getCurrentUserSafe();
    const patients = getPatientsSafe();

    if (currentUser?.role === 'patient') {
      return patients.filter((patient) => patient.id === currentUser.id || patient.userId === currentUser.id);
    }

    return patients;
  }

  getThreadSummaries(): ConsultThread[] {
    ensureSeedData();

    return this.getDoctorPatients()
      .map((patient) => this.getThreadByPatientId(patient.id))
      .sort((a, b) => {
        const unreadDiff = b.unreadCount - a.unreadCount;
        if (unreadDiff !== 0) {
          return unreadDiff;
        }

        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }

  getThreadByPatientId(patientId: string): ConsultThread {
    const threads = ensureSeedData();
    const patient = patientService.getPatientById(patientId) || this.getDoctorPatients().find((item) => item.id === patientId);

    const resolvedPatient = patient || {
      id: patientId,
      userId: patientId,
      name: patientId,
      fev1: 0,
      fvc: 0,
      fev1Fvc: 0,
      pef: 0,
      status: 'stable' as const,
      advice: ''
    };

    const doctor = getDoctorForPatient(patientId);
    const messages = Array.isArray(threads[patientId]) ? threads[patientId] : [];
    return buildThread(resolvedPatient, doctor, messages);
  }

  sendDoctorMessage(patientId: string, content: string): ConsultThread {
    const doctor = getDoctorForPatient(patientId);
    const message: ConsultMessage = {
      id: createMessageId(),
      patientId,
      content: content.trim(),
      type: 'text',
      role: 'doctor',
      source: 'doctor',
      senderId: doctor.id,
      senderName: doctor.name,
      createdAt: nowIso(),
      readByDoctor: true,
      readByPatient: false
    };

    return upsertMessage(patientId, message);
  }

  sendPatientMessage(patientId: string, content: string): ConsultThread {
    const patient = patientService.getPatientById(patientId) || this.getDoctorPatients().find((item) => item.id === patientId);
    const patientParticipant = patient
      ? getPatientParticipant(patient)
      : {
          id: patientId,
          name: patientId,
          role: 'patient' as const,
          patientId
        };

    const message: ConsultMessage = {
      id: createMessageId(),
      patientId,
      content: content.trim(),
      type: 'text',
      role: 'patient',
      source: 'patient',
      senderId: patientParticipant.id,
      senderName: patientParticipant.name,
      createdAt: nowIso(),
      readByDoctor: false,
      readByPatient: true
    };

    return upsertMessage(patientId, message);
  }

  seedRecommendationToThread(patientId: string, content: string): ConsultThread {
    const doctor = getDoctorForPatient(patientId);
    const trimmedContent = content.trim();

    if (trimmedContent) {
      patientService.updateAdvice(patientId, trimmedContent);
    }

    const message: ConsultMessage = {
      id: createMessageId(),
      patientId,
      content: trimmedContent,
      type: 'recommendation',
      role: 'doctor',
      source: 'doctor',
      senderId: doctor.id,
      senderName: doctor.name,
      createdAt: nowIso(),
      readByDoctor: true,
      readByPatient: false
    };

    return upsertMessage(patientId, message);
  }

  markThreadAsRead(patientId: string): ConsultThread {
    const currentUser = getCurrentUserSafe();
    const threads = ensureSeedData();
    const currentMessages = Array.isArray(threads[patientId]) ? threads[patientId] : [];

    threads[patientId] = currentMessages.map((message) => {
      if (currentUser?.role === 'patient') {
        return {
          ...message,
          readByPatient: true
        };
      }

      return {
        ...message,
        readByDoctor: true
      };
    });

    writeStoredThreads(threads);
    return this.getThreadByPatientId(patientId);
  }
}

export const consultService = new ConsultService();

export type { User } from './userService';