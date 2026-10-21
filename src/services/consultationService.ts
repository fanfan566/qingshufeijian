import { patientService, type PatientData } from './patientService';
import { userService, type User } from './userService';

export type ConsultationMessageType = 'doctor_advice' | 'doctor_message' | 'patient_message';
export type ConsultationStatus = PatientData['status'];

export interface ConsultationMessage {
  id: string;
  conversationId: string;
  patientId: string;
  doctorId: string;
  senderId: string;
  senderName: string;
  type: ConsultationMessageType;
  content: string;
  timestamp: string;
  readByDoctor: boolean;
  readByPatient: boolean;
}

export interface ConsultationConversation {
  conversationId: string;
  patientId: string;
  doctorId: string;
  patientName: string;
  doctorName: string;
  status: ConsultationStatus;
  advicePreview: string;
  lastMessage: string;
  lastTimestamp: string;
  unreadCount: number;
  messages: ConsultationMessage[];
}

export interface ConsultationConversationSummary {
  conversationId: string;
  patientId: string;
  doctorId: string;
  title: string;
  subtitle: string;
  status: ConsultationStatus;
  lastMessage: string;
  lastTimestamp: string;
  unreadCount: number;
  advicePreview: string;
  hasUnread: boolean;
}

type CurrentUser = Omit<User, 'password'> | null;

type StoredConversationMap = Record<string, ConsultationConversation>;

const CONSULTATION_STORAGE_KEY = 'consultation_feedback_conversations_v2';
const CONSULTATION_SEED_KEY = 'consultation_feedback_seeded_v2';
const DEFAULT_DOCTOR_ID = 'doctor_default';
const DEFAULT_DOCTOR_NAME = '张医生';

const nowIso = (): string => new Date().toISOString();

const createId = (prefix: string): string => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const sortMessages = (messages: ConsultationMessage[]): ConsultationMessage[] => {
  return [...messages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
};

const getCurrentUserSafe = (): CurrentUser => {
  try {
    return userService.getCurrentUser();
  } catch (error) {
    console.error('获取当前用户失败:', error);
    return null;
  }
};

const getAllUsersSafe = (): User[] => {
  try {
    return userService.getAllUsers();
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return [];
  }
};

const getAllPatientsSafe = (): PatientData[] => {
  try {
    return patientService.getAllPatients();
  } catch (error) {
    console.error('获取患者列表失败:', error);
    return [];
  }
};

const getPatientByIdSafe = (patientId: string): PatientData | undefined => {
  try {
    return patientService.getPatientById(patientId);
  } catch (error) {
    console.error('获取患者详情失败:', error);
    return undefined;
  }
};

const buildConversationId = (patientId: string, doctorId: string): string => `consultation_${patientId}_${doctorId}`;

const getDoctorUser = (doctorId?: string): Pick<User, 'id' | 'username' | 'email' | 'avatar' | 'role'> => {
  const currentUser = getCurrentUserSafe();
  const users = getAllUsersSafe();
  const doctors = users.filter((user) => user.role === 'doctor');

  if (doctorId) {
    const matchedDoctor = doctors.find((doctor) => doctor.id === doctorId) || users.find((user) => user.id === doctorId);
    if (matchedDoctor) {
      return matchedDoctor;
    }
  }

  if (currentUser?.role === 'doctor') {
    return {
      id: currentUser.id,
      username: currentUser.username,
      email: currentUser.email,
      avatar: currentUser.avatar,
      role: 'doctor'
    };
  }

  if (doctorId) {
    return {
      id: doctorId,
      username: doctorId,
      email: '',
      avatar: '',
      role: 'doctor'
    };
  }

  if (doctors.length > 0) {
    return doctors[0];
  }

  return {
    id: DEFAULT_DOCTOR_ID,
    username: DEFAULT_DOCTOR_NAME,
    email: '',
    avatar: '',
    role: 'doctor'
  };
};

const getPatientDisplay = (patientId: string): PatientData => {
  const patient = getPatientByIdSafe(patientId);
  if (patient) {
    return patient;
  }

  const matchedUser = getAllUsersSafe().find((user) => user.id === patientId);

  return {
    id: patientId,
    userId: patientId,
    name: matchedUser?.username || patientId,
    fev1: 0,
    fvc: 0,
    fev1Fvc: 0,
    pef: 0,
    status: 'stable',
    advice: ''
  };
};

const normalizeMessage = (
  conversationId: string,
  patientId: string,
  doctorId: string,
  message: Partial<ConsultationMessage>
): ConsultationMessage => {
  const patient = getPatientDisplay(patientId);
  const doctor = getDoctorUser(doctorId);
  const fallbackType: ConsultationMessageType = 'doctor_message';

  return {
    id: typeof message.id === 'string' ? message.id : createId('message'),
    conversationId,
    patientId,
    doctorId,
    senderId: typeof message.senderId === 'string'
      ? message.senderId
      : message.type === 'patient_message'
        ? patient.userId || patient.id
        : doctor.id,
    senderName: typeof message.senderName === 'string'
      ? message.senderName
      : message.type === 'patient_message'
        ? patient.name
        : doctor.username,
    type: message.type === 'doctor_advice' || message.type === 'doctor_message' || message.type === 'patient_message'
      ? message.type
      : fallbackType,
    content: typeof message.content === 'string' ? message.content : '',
    timestamp: typeof message.timestamp === 'string' ? message.timestamp : nowIso(),
    readByDoctor: typeof message.readByDoctor === 'boolean' ? message.readByDoctor : message.type !== 'patient_message',
    readByPatient: typeof message.readByPatient === 'boolean' ? message.readByPatient : message.type === 'patient_message'
  };
};

const createWelcomeMessage = (
  conversationId: string,
  patientId: string,
  doctorId: string,
  patientName: string,
  doctorName: string,
  timestamp: string
): ConsultationMessage => {
  return {
    id: createId('message'),
    conversationId,
    patientId,
    doctorId,
    senderId: doctorId,
    senderName: doctorName,
    type: 'doctor_message',
    content: `您好，${patientName}，这里是${doctorName}的咨询反馈窗口。您可以随时描述近期症状、用药感受与康复进展。`,
    timestamp,
    readByDoctor: true,
    readByPatient: false
  };
};

const readStoredConversations = (): StoredConversationMap => {
  try {
    const raw = localStorage.getItem(CONSULTATION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const entries = Object.entries(parsed).map(([conversationId, conversation]) => {
      if (!conversation || typeof conversation !== 'object') {
        return [conversationId, undefined] as const;
      }

      const partialConversation = conversation as Partial<ConsultationConversation>;
      const patientId = typeof partialConversation.patientId === 'string'
        ? partialConversation.patientId
        : conversationId.replace(/^consultation_/, '').split('_')[0] || '';
      const doctorId = typeof partialConversation.doctorId === 'string'
        ? partialConversation.doctorId
        : getDoctorUser().id;
      const patient = getPatientDisplay(patientId);
      const doctor = getDoctorUser(doctorId);
      const messages = Array.isArray(partialConversation.messages)
        ? partialConversation.messages.map((message) => normalizeMessage(conversationId, patientId, doctorId, message))
        : [];
      const sortedMessages = sortMessages(messages);
      const lastAdvice = [...sortedMessages].reverse().find((message) => message.type === 'doctor_advice');

      const normalizedConversation: ConsultationConversation = {
        conversationId,
        patientId,
        doctorId,
        patientName: patient.name,
        doctorName: doctor.username,
        status: patient.status,
        advicePreview: typeof partialConversation.advicePreview === 'string' && partialConversation.advicePreview.trim()
          ? partialConversation.advicePreview
          : patient.advice || lastAdvice?.content || '',
        lastMessage: typeof partialConversation.lastMessage === 'string' && partialConversation.lastMessage.trim()
          ? partialConversation.lastMessage
          : sortedMessages[sortedMessages.length - 1]?.content || '',
        lastTimestamp: typeof partialConversation.lastTimestamp === 'string'
          ? partialConversation.lastTimestamp
          : sortedMessages[sortedMessages.length - 1]?.timestamp || nowIso(),
        unreadCount: 0,
        messages: sortedMessages
      };

      return [conversationId, normalizedConversation] as const;
    });

    return Object.fromEntries(entries.filter((entry): entry is [string, ConsultationConversation] => Boolean(entry[1])));
  } catch (error) {
    console.error('读取咨询反馈会话失败:', error);
    return {};
  }
};

const writeStoredConversations = (conversations: StoredConversationMap): void => {
  localStorage.setItem(CONSULTATION_STORAGE_KEY, JSON.stringify(conversations));
};

const computeUnreadCount = (conversation: ConsultationConversation, currentUser: CurrentUser): number => {
  if (!currentUser) {
    return 0;
  }

  if (currentUser.role === 'patient') {
    return conversation.messages.filter((message) => !message.readByPatient && message.senderId !== currentUser.id).length;
  }

  if (currentUser.role === 'doctor') {
    return conversation.messages.filter((message) => !message.readByDoctor && message.senderId !== currentUser.id).length;
  }

  return 0;
};

const hydrateConversation = (conversation: ConsultationConversation, currentUser: CurrentUser = getCurrentUserSafe()): ConsultationConversation => {
  const patient = getPatientDisplay(conversation.patientId);
  const doctor = getDoctorUser(conversation.doctorId);
  const messages = sortMessages(conversation.messages || []);
  const lastMessage = messages[messages.length - 1];
  const advicePreview = [...messages].reverse().find((message) => message.type === 'doctor_advice')?.content || patient.advice || conversation.advicePreview || '';

  return {
    ...conversation,
    patientName: patient.name,
    doctorName: doctor.username,
    status: patient.status,
    advicePreview,
    lastMessage: lastMessage?.content || conversation.lastMessage || '',
    lastTimestamp: lastMessage?.timestamp || conversation.lastTimestamp || nowIso(),
    unreadCount: computeUnreadCount(
      {
        ...conversation,
        messages,
        patientName: patient.name,
        doctorName: doctor.username,
        status: patient.status,
        advicePreview,
        lastMessage: lastMessage?.content || '',
        lastTimestamp: lastMessage?.timestamp || nowIso(),
        unreadCount: 0
      },
      currentUser
    ),
    messages
  };
};

const ensureSeededConversations = (): StoredConversationMap => {
  const stored = readStoredConversations();
  let changed = !localStorage.getItem(CONSULTATION_SEED_KEY);

  Object.entries(stored).forEach(([conversationId, conversation]) => {
    const hydrated = hydrateConversation(conversation, getCurrentUserSafe());
    if (JSON.stringify(hydrated) !== JSON.stringify(conversation)) {
      stored[conversationId] = hydrated;
      changed = true;
    }
  });

  if (changed) {
    writeStoredConversations(stored);
    localStorage.setItem(CONSULTATION_SEED_KEY, 'true');
  }

  return stored;
};

const saveConversation = (conversation: ConsultationConversation): ConsultationConversation => {
  const stored = ensureSeededConversations();
  const hydrated = hydrateConversation(conversation, getCurrentUserSafe());
  stored[hydrated.conversationId] = hydrated;
  writeStoredConversations(stored);
  return hydrated;
};

class ConsultationService {
  getConversationSummaries(): ConsultationConversationSummary[] {
    const currentUser = getCurrentUserSafe();
    const stored = ensureSeededConversations();
    const conversations = Object.values(stored).map((conversation) => hydrateConversation(conversation, currentUser));

    const filtered = currentUser?.role === 'patient'
      ? conversations.filter((conversation) => conversation.patientId === currentUser.id)
      : currentUser?.role === 'doctor'
        ? conversations.filter((conversation) => conversation.doctorId === currentUser.id)
        : [];

    return filtered
      .sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime())
      .map((conversation) => ({
        conversationId: conversation.conversationId,
        patientId: conversation.patientId,
        doctorId: conversation.doctorId,
        title: currentUser?.role === 'patient' ? conversation.doctorName : conversation.patientName,
        subtitle: currentUser?.role === 'patient'
          ? '您的专属医生沟通窗口'
          : `当前状态：${conversation.status === 'stable' ? '稳定' : conversation.status === 'attention' ? '需关注' : '重点关注'}`,
        status: conversation.status,
        lastMessage: conversation.lastMessage,
        lastTimestamp: conversation.lastTimestamp,
        unreadCount: conversation.unreadCount,
        hasUnread: conversation.unreadCount > 0,
        advicePreview: conversation.advicePreview
      }));
  }

  getConversationById(conversationId: string): ConsultationConversation | null {
    const stored = ensureSeededConversations();
    const conversation = stored[conversationId];
    if (!conversation) {
      return null;
    }

    const currentUser = getCurrentUserSafe();
    if (currentUser?.role === 'patient' && conversation.patientId !== currentUser.id) {
      return null;
    }
    if (currentUser?.role === 'doctor' && conversation.doctorId !== currentUser.id) {
      return null;
    }

    let updatedMessages = conversation.messages;

    if (currentUser?.role === 'patient') {
      updatedMessages = conversation.messages.map((message) => ({
        ...message,
        readByPatient: true
      }));
    } else if (currentUser?.role === 'doctor') {
      updatedMessages = conversation.messages.map((message) => ({
        ...message,
        readByDoctor: true
      }));
    }

    const updatedConversation = hydrateConversation(
      {
        ...conversation,
        messages: updatedMessages
      },
      currentUser
    );

    stored[conversationId] = updatedConversation;
    writeStoredConversations(stored);
    return updatedConversation;
  }

  getCurrentConversationForUser(): ConsultationConversation | null {
    const currentUser = getCurrentUserSafe();

    if (currentUser?.role === 'patient') {
      const conversation = this.ensureConversationForPatient(currentUser.id);
      return this.getConversationById(conversation.conversationId);
    }

    const summaries = this.getConversationSummaries();
    if (summaries.length === 0) {
      return null;
    }

    return this.getConversationById(summaries[0].conversationId);
  }

  ensureConversationForPatient(patientId: string, doctorId?: string): ConsultationConversation {
    const currentUser = getCurrentUserSafe();
    const patient = getPatientDisplay(patientId);
    const resolvedDoctorId = doctorId || (currentUser?.role === 'doctor' ? currentUser.id : undefined);
    const doctor = getDoctorUser(resolvedDoctorId);
    const conversationId = buildConversationId(patient.userId || patient.id, doctor.id);
    const stored = ensureSeededConversations();
    const existingConversation = stored[conversationId];

    if (existingConversation) {
      const hydrated = hydrateConversation(existingConversation, getCurrentUserSafe());
      stored[conversationId] = hydrated;
      writeStoredConversations(stored);
      return hydrated;
    }

    const timestamp = nowIso();
    const conversation: ConsultationConversation = {
      conversationId,
      patientId: patient.userId || patient.id,
      doctorId: doctor.id,
      patientName: patient.name,
      doctorName: doctor.username,
      status: patient.status,
      advicePreview: patient.advice || '',
      lastMessage: '',
      lastTimestamp: timestamp,
      unreadCount: 0,
      messages: [createWelcomeMessage(conversationId, patient.userId || patient.id, doctor.id, patient.name, doctor.username, timestamp)]
    };

    return saveConversation(conversation);
  }

  sendMessage(conversationId: string, content: string): ConsultationConversation | null {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return this.getConversationById(conversationId);
    }

    const currentUser = getCurrentUserSafe();
    const stored = ensureSeededConversations();
    const existingConversation = stored[conversationId];

    if (!existingConversation) {
      return null;
    }

    if (currentUser?.role === 'patient' && existingConversation.patientId !== currentUser.id) {
      return null;
    }
    if (currentUser?.role === 'doctor' && existingConversation.doctorId !== currentUser.id) {
      return null;
    }

    const patient = getPatientDisplay(existingConversation.patientId);
    const doctor = getDoctorUser(existingConversation.doctorId);
    const isPatient = currentUser?.role === 'patient';
    const messageType: ConsultationMessageType = isPatient ? 'patient_message' : 'doctor_message';

    const message: ConsultationMessage = {
      id: createId('message'),
      conversationId,
      patientId: existingConversation.patientId,
      doctorId: existingConversation.doctorId,
      senderId: isPatient ? patient.userId || patient.id : doctor.id,
      senderName: isPatient ? patient.name : doctor.username,
      type: messageType,
      content: trimmedContent,
      timestamp: nowIso(),
      readByDoctor: !isPatient,
      readByPatient: isPatient
    };

    const updatedConversation: ConsultationConversation = {
      ...existingConversation,
      messages: sortMessages([...(existingConversation.messages || []), message])
    };

    return saveConversation(updatedConversation);
  }

  pushDoctorAdvice(patientId: string, advice: string, doctorId?: string): ConsultationConversation | null {
    const trimmedAdvice = advice.trim();
    if (!trimmedAdvice) {
      return this.ensureConversationForPatient(patientId, doctorId);
    }

    const currentUser = getCurrentUserSafe();
    const effectiveDoctorId = doctorId || (currentUser?.role === 'doctor' ? currentUser.id : undefined);
    const conversation = this.ensureConversationForPatient(patientId, effectiveDoctorId);
    const lastAdvice = [...conversation.messages].reverse().find((message) => message.type === 'doctor_advice');

    if (currentUser?.role === 'doctor' && conversation.doctorId !== currentUser.id) {
      return null;
    }

    if (lastAdvice && lastAdvice.content.trim() === trimmedAdvice) {
      const refreshedConversation = {
        ...conversation,
        advicePreview: trimmedAdvice
      };
      return saveConversation(refreshedConversation);
    }

    const doctor = getDoctorUser(effectiveDoctorId || conversation.doctorId);
    const message: ConsultationMessage = {
      id: createId('message'),
      conversationId: conversation.conversationId,
      patientId: conversation.patientId,
      doctorId: doctor.id,
      senderId: doctor.id,
      senderName: doctor.username,
      type: 'doctor_advice',
      content: trimmedAdvice,
      timestamp: nowIso(),
      readByDoctor: true,
      readByPatient: false
    };

    const updatedConversation: ConsultationConversation = {
      ...conversation,
      doctorId: doctor.id,
      doctorName: doctor.username,
      advicePreview: trimmedAdvice,
      messages: sortMessages([...(conversation.messages || []), message])
    };

    return saveConversation(updatedConversation);
  }

  formatRelativeTime(timestamp: string): string {
    const target = new Date(timestamp).getTime();
    if (Number.isNaN(target)) {
      return '';
    }

    const now = Date.now();
    const diff = now - target;
    const minute = 1000 * 60;
    const hour = minute * 60;
    const day = hour * 24;

    if (diff < minute) {
      return '刚刚';
    }

    if (diff < hour) {
      return `${Math.floor(diff / minute)} 分钟前`;
    }

    if (diff < day) {
      return `${Math.floor(diff / hour)} 小时前`;
    }

    if (diff < day * 7) {
      return `${Math.floor(diff / day)} 天前`;
    }

    return new Date(timestamp).toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit'
    });
  }

  // 创建与特定用户的对话
  createConversationWithUser(targetUserId: string): ConsultationConversation | null {
    const currentUser = getCurrentUserSafe();
    if (!currentUser) {
      return null;
    }

    const targetUser = getAllUsersSafe().find(user => user.id === targetUserId);
    if (!targetUser) {
      return null;
    }

    // 确定谁是医生，谁是患者
    let patientId: string;
    let doctorId: string;

    if (currentUser.role === 'doctor' && targetUser.role === 'patient') {
      patientId = targetUser.id;
      doctorId = currentUser.id;
    } else if (currentUser.role === 'patient' && targetUser.role === 'doctor') {
      patientId = currentUser.id;
      doctorId = targetUser.id;
    } else {
      // 不支持医生找医生或患者找患者
      return null;
    }

    // 检查是否已有对话
    const conversationId = buildConversationId(patientId, doctorId);
    const existingConversation = this.getConversationById(conversationId);
    if (existingConversation) {
      return existingConversation;
    }

    // 创建新对话
    return this.ensureConversationForPatient(patientId, doctorId);
  }
}

export const consultationService = new ConsultationService();
