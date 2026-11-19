import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  serverTimestamp,
  runTransaction,
  collection,
  query,
  where
} from 'firebase/firestore';
import { db } from './firebase';
import { 
  LiveSessionState, 
  LiveQuestionItem, 
  LiveConnectedStudent, 
  LiveStudentAnswerSubmission,
  LiveStudentMessage,
  normalizeArabicText,
  QuizActiveState,
  QuizQuestionItem,
  QuizStudentProgress,
  QuizStudentAnswerDetail,
  LiveStreamConfig,
  ScriptSubtitleLine,
  LiveSubtitleState,
  AdminSheetUser,
  AdminAccessConfig,
  VoteOption,
  VotePresetQuestion,
  VotePresetOptionSet,
  VoteExtraGroup,
  VoteExtraItem,
  VoteChartType,
  ActivePollState,
  VotingConfigState,
  VoteParticipantRecord,
  VoteSubmissionRecord
} from '../types';

const LIVE_DOC_REF = doc(db, 'live_sessions', 'main');
const SUBTITLES_DOC_REF = doc(db, 'live_sessions', 'subtitles');
const ADMIN_ACCESS_DOC_REF = doc(db, 'live_sessions', 'admin_access');
const VOTING_DOC_REF = doc(db, 'live_sessions', 'voting');
const VOTING_PARTICIPANTS_COL = collection(db, 'live_sessions', 'voting', 'participants');
const VOTING_VOTES_COL = collection(db, 'live_sessions', 'voting', 'votes');

export const defaultLiveStreamConfig: LiveStreamConfig = {
  isActive: false,
  streamId: 'room_live_teacher',
  password: '',
  mode: 'video',
  useMeshcast: true,
  enableSubtitles: false,
  liveCaption: '',
  liveCaptionTh: '',
  liveCaptionEn: '',
  liveCaptionUpdatedAt: 0,
  startedAt: 0,
};

export const defaultSubtitleState: LiveSubtitleState = {
  showToStudents: false,
  trackingEnabled: false,
  filterByPdfPage: true,
  activeLineId: '',
  activePage: 1,
  activeLessonTitle: '',
  activeArabic: '',
  activeTh: '',
  activeEn: '',
  updatedAt: 0,
};

export const defaultLiveSessionState: LiveSessionState = {
  sessionId: 'live-main',
  sessionPin: '1234',
  isProgramActive: false,
  streamState: defaultLiveStreamConfig,
  subtitleState: defaultSubtitleState,
  accessMode: 'restricted',
  showLessonsListInRoom: false,
  showPinInRoom: false,
  showQrInRoom: false,
  showFinishLessonInRoom: false,
  showRevealInRoom: false,
  showResumeInRoom: false,
  showSkipInRoom: false,
  showPlayPauseInRoom: false,
  videoPlaying: false,
  showOptionCountsInRoom: false,
  showStudentTextAnswersInRoom: false,
  showChatInRoom: false,
  showConnectedCountInRoom: false,
  showPdfInRoom: false,
  showPdfToStudents: false,
  pdfUrl: '',
  pdfTitle: '',
  pdfPage: 1,
  messages: [],
  lessonTitle: '',
  videoLessonTitle: '',
  directLessonTitle: '',
  quizLessonTitle: '',
  videoUrl: '',
  mode: 'video',
  explanationText: '',
  status: 'idle',
  currentQuestionIndex: null,
  currentQuestion: null,
  questionTriggeredAt: null,
  timeLimit: 30,
  showResult: 'نعم',
  broadcastVolume: 1.0,
  connectedStudents: [],
  answersForCurrentQuestion: {},
  allSessionAnswers: {},
  videoAnswers: {},
  directAnswers: {},
  quizState: null,
};

export function generatePinCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// In-memory cache for ultra-fast local access
let cachedState: LiveSessionState = { ...defaultLiveSessionState };

export function getCachedLiveState(): LiveSessionState {
  return cachedState;
}

// Subscribe to real-time live session updates (replaces SSE)
export function subscribeToLiveSession(
  onUpdate: (state: LiveSessionState) => void,
  onError?: (err: any) => void
): () => void {
  // Return unsubscribe function
  const unsubscribe = onSnapshot(
    LIVE_DOC_REF,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as any;
        const now = Date.now();
        const rawStudents = Array.isArray(data.connectedStudents) ? data.connectedStudents : [];
        // Active heartbeat: lastPing or joinedAt within 60 seconds
        const activeStudents = rawStudents.filter((s: any) => {
          const lastActive = s.lastPing || s.joinedAt || 0;
          return (now - lastActive) < 60000;
        });

        const state: LiveSessionState = {
          sessionId: data.sessionId || 'live-main',
          sessionPin: data.sessionPin || '1234',
          isProgramActive: Boolean(data.isProgramActive),
          accessMode: (data.accessMode as 'restricted' | 'open') || 'restricted',
          showLessonsListInRoom: Boolean(data.showLessonsListInRoom),
          showPinInRoom: Boolean(data.showPinInRoom),
          showQrInRoom: Boolean(data.showQrInRoom),
          showFinishLessonInRoom: Boolean(data.showFinishLessonInRoom),
          showRevealInRoom: Boolean(data.showRevealInRoom),
          showResumeInRoom: Boolean(data.showResumeInRoom),
          showSkipInRoom: Boolean(data.showSkipInRoom),
          showPlayPauseInRoom: Boolean(data.showPlayPauseInRoom),
          videoPlaying: Boolean(data.videoPlaying),
          broadcastVolume: typeof data.broadcastVolume === 'number' ? data.broadcastVolume : 1.0,
          showOptionCountsInRoom: Boolean(data.showOptionCountsInRoom),
          showStudentTextAnswersInRoom: Boolean(data.showStudentTextAnswersInRoom),
          showChatInRoom: Boolean(data.showChatInRoom),
          showConnectedCountInRoom: Boolean(data.showConnectedCountInRoom),
          showPdfInRoom: Boolean(data.showPdfInRoom),
          showPdfToStudents: Boolean(data.showPdfToStudents),
          pdfUrl: data.pdfUrl || '',
          pdfTitle: data.pdfTitle || '',
          pdfPage: typeof data.pdfPage === 'number' ? data.pdfPage : 1,
          pdfTotalPages: typeof data.pdfTotalPages === 'number' ? data.pdfTotalPages : undefined,
          pdfLaser: data.pdfLaser || null,
          pdfFitMode: data.pdfFitMode === 'width' ? 'width' : 'contain',
          pdfZoom: typeof data.pdfZoom === 'number' ? data.pdfZoom : 1.0,
          pdfAnnotations: data.pdfAnnotations || {},
          messages: Array.isArray(data.messages) ? data.messages : [],
          lessonTitle: data.lessonTitle || '',
          videoLessonTitle: data.videoLessonTitle || (data.mode === 'video' ? data.lessonTitle : ''),
          directLessonTitle: data.directLessonTitle || (data.mode === 'direct' ? data.lessonTitle : ''),
          quizLessonTitle: data.quizLessonTitle || data.quizState?.quizTitle || '',
          videoUrl: data.videoUrl || '',
          mode: (data.mode as any) || (data.videoUrl ? 'video' : 'direct'),
          explanationText: data.explanationText || '',
          status: data.status || 'idle',
          currentQuestionIndex: data.currentQuestionIndex !== undefined ? data.currentQuestionIndex : null,
          currentQuestion: data.currentQuestion || null,
          questionTriggeredAt: data.questionTriggeredAt || null,
          timeLimit: data.timeLimit || 30,
          showResult: data.showResult || 'نعم',
          connectedStudents: activeStudents,
          answersForCurrentQuestion: data.answersForCurrentQuestion || {},
          allSessionAnswers: data.allSessionAnswers || {},
          videoAnswers: data.videoAnswers || {},
          directAnswers: data.directAnswers || {},
          quizState: data.quizState || null,
          streamState: data.streamState ? {
            isActive: Boolean(data.streamState.isActive),
            streamId: data.streamState.streamId || 'room_live_teacher',
            password: data.streamState.password || '',
            mode: data.streamState.mode === 'audio' ? 'audio' : 'video',
            useMeshcast: data.streamState.useMeshcast !== false,
            enableSubtitles: Boolean(data.streamState.enableSubtitles),
            liveCaption: data.streamState.liveCaption || '',
            liveCaptionTh: data.streamState.liveCaptionTh || '',
            liveCaptionEn: data.streamState.liveCaptionEn || '',
            liveCaptionUpdatedAt: data.streamState.liveCaptionUpdatedAt || 0,
            startedAt: data.streamState.startedAt || 0,
          } : defaultLiveStreamConfig,
          subtitleState: data.subtitleState ? {
            showToStudents: Boolean(data.subtitleState.showToStudents),
            trackingEnabled: Boolean(data.subtitleState.trackingEnabled),
            filterByPdfPage: data.subtitleState.filterByPdfPage !== false,
            activeLineId: data.subtitleState.activeLineId || '',
            activePage: data.subtitleState.activePage || 1,
            activeLessonTitle: data.subtitleState.activeLessonTitle || '',
            activeArabic: data.subtitleState.activeArabic || '',
            activeTh: data.subtitleState.activeTh || '',
            activeEn: data.subtitleState.activeEn || '',
            updatedAt: data.subtitleState.updatedAt || 0,
          } : defaultSubtitleState,
        };
        cachedState = state;
        onUpdate(state);
      } else {
        // Doc does not exist yet, initialize it
        setDoc(LIVE_DOC_REF, {
          ...defaultLiveSessionState,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((e) => console.warn('Failed to seed live session doc:', e));
        cachedState = defaultLiveSessionState;
        onUpdate(defaultLiveSessionState);
      }
    },
    (error) => {
      console.error('Firestore live stream error:', error);
      if (onError) onError(error);
    }
  );

  return unsubscribe;
}

// Fetch current session state once
export async function getLiveSessionState(): Promise<LiveSessionState | null> {
  try {
    const snap = await getDoc(LIVE_DOC_REF);
    if (snap.exists()) {
      const data = snap.data() as any;
      const now = Date.now();
      const rawStudents = Array.isArray(data.connectedStudents) ? data.connectedStudents : [];
      const activeStudents = rawStudents.filter((s: any) => {
        const lastActive = s.lastPing || s.joinedAt || 0;
        return (now - lastActive) < 60000;
      });

      const state: LiveSessionState = {
        sessionId: data.sessionId || 'live-main',
        sessionPin: data.sessionPin || '1234',
        isProgramActive: Boolean(data.isProgramActive),
        showLessonsListInRoom: Boolean(data.showLessonsListInRoom),
        showPinInRoom: Boolean(data.showPinInRoom),
        showQrInRoom: Boolean(data.showQrInRoom),
        showFinishLessonInRoom: Boolean(data.showFinishLessonInRoom),
        showRevealInRoom: Boolean(data.showRevealInRoom),
        showResumeInRoom: Boolean(data.showResumeInRoom),
        showSkipInRoom: Boolean(data.showSkipInRoom),
        showPlayPauseInRoom: Boolean(data.showPlayPauseInRoom),
        videoPlaying: Boolean(data.videoPlaying),
        showOptionCountsInRoom: Boolean(data.showOptionCountsInRoom),
        showStudentTextAnswersInRoom: Boolean(data.showStudentTextAnswersInRoom),
        showChatInRoom: Boolean(data.showChatInRoom),
        showConnectedCountInRoom: Boolean(data.showConnectedCountInRoom),
        showPdfInRoom: Boolean(data.showPdfInRoom),
        showPdfToStudents: Boolean(data.showPdfToStudents),
        pdfUrl: data.pdfUrl || '',
        pdfTitle: data.pdfTitle || '',
        pdfPage: typeof data.pdfPage === 'number' ? data.pdfPage : 1,
        pdfTotalPages: typeof data.pdfTotalPages === 'number' ? data.pdfTotalPages : undefined,
        pdfLaser: data.pdfLaser || null,
        pdfFitMode: data.pdfFitMode === 'width' ? 'width' : 'contain',
        pdfZoom: typeof data.pdfZoom === 'number' ? data.pdfZoom : 1.0,
        pdfAnnotations: data.pdfAnnotations || {},
        messages: Array.isArray(data.messages) ? data.messages : [],
        lessonTitle: data.lessonTitle || '',
        videoLessonTitle: data.videoLessonTitle || (data.mode === 'video' ? data.lessonTitle : ''),
        directLessonTitle: data.directLessonTitle || (data.mode === 'direct' ? data.lessonTitle : ''),
        quizLessonTitle: data.quizLessonTitle || data.quizState?.quizTitle || '',
        videoUrl: data.videoUrl || '',
        mode: (data.mode as any) || (data.videoUrl ? 'video' : 'direct'),
        explanationText: data.explanationText || '',
        status: data.status || 'idle',
        currentQuestionIndex: data.currentQuestionIndex !== undefined ? data.currentQuestionIndex : null,
        currentQuestion: data.currentQuestion || null,
        questionTriggeredAt: data.questionTriggeredAt || null,
        timeLimit: data.timeLimit || 30,
        showResult: data.showResult || 'نعم',
        connectedStudents: activeStudents,
        answersForCurrentQuestion: data.answersForCurrentQuestion || {},
        allSessionAnswers: data.allSessionAnswers || {},
        videoAnswers: data.videoAnswers || {},
        directAnswers: data.directAnswers || {},
        quizState: data.quizState || null,
        streamState: data.streamState ? {
          isActive: Boolean(data.streamState.isActive),
          streamId: data.streamState.streamId || 'room_live_teacher',
          password: data.streamState.password || '',
          mode: data.streamState.mode === 'audio' ? 'audio' : 'video',
          useMeshcast: data.streamState.useMeshcast !== false,
          enableSubtitles: Boolean(data.streamState.enableSubtitles),
          liveCaption: data.streamState.liveCaption || '',
          liveCaptionTh: data.streamState.liveCaptionTh || '',
          liveCaptionEn: data.streamState.liveCaptionEn || '',
          liveCaptionUpdatedAt: data.streamState.liveCaptionUpdatedAt || 0,
          startedAt: data.streamState.startedAt || 0,
        } : defaultLiveStreamConfig,
        subtitleState: data.subtitleState ? {
          showToStudents: Boolean(data.subtitleState.showToStudents),
          trackingEnabled: Boolean(data.subtitleState.trackingEnabled),
          filterByPdfPage: data.subtitleState.filterByPdfPage !== false,
          activeLineId: data.subtitleState.activeLineId || '',
          activePage: data.subtitleState.activePage || 1,
          activeLessonTitle: data.subtitleState.activeLessonTitle || '',
          activeArabic: data.subtitleState.activeArabic || '',
          activeTh: data.subtitleState.activeTh || '',
          activeEn: data.subtitleState.activeEn || '',
          updatedAt: data.subtitleState.updatedAt || 0,
        } : defaultSubtitleState,
      };
      cachedState = state;
      return state;
    } else {
      await setDoc(LIVE_DOC_REF, {
        ...defaultLiveSessionState,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return defaultLiveSessionState;
    }
  } catch (err) {
    console.warn('Error fetching live session from Firestore:', err);
    return cachedState;
  }
}

// Teacher starts program session (Generates PIN, activates program, resets students)
export async function startLiveProgram(): Promise<{ success: boolean; pin?: string; state?: LiveSessionState }> {
  try {
    const pin = generatePinCode();
    const updatedState: Partial<LiveSessionState> = {
      sessionId: 'live-' + Date.now(),
      sessionPin: pin,
      isProgramActive: true,
      status: 'idle',
      connectedStudents: [],
      answersForCurrentQuestion: {},
      allSessionAnswers: {},
      currentQuestion: null,
      currentQuestionIndex: null,
      questionTriggeredAt: null,
    };

    await setDoc(LIVE_DOC_REF, {
      ...updatedState,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    cachedState = { ...cachedState, ...updatedState };
    return { success: true, pin, state: cachedState };
  } catch (error: any) {
    console.error('Failed to start live program in Firebase:', error);
    throw new Error('فشل بدء البرنامج في السحاب: ' + (error?.message || 'خطأ غير معروف'));
  }
}

// Teacher ends program session (Kicks out students, marks program_ended)
export async function endLiveProgram(): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const updatedState: Partial<LiveSessionState> = {
      isProgramActive: false,
      status: 'program_ended',
      accessMode: 'restricted',
      videoPlaying: false,
      connectedStudents: [],
      answersForCurrentQuestion: {},
      currentQuestion: null,
      currentQuestionIndex: null,
      questionTriggeredAt: null,
      streamState: {
        ...(cachedState.streamState || defaultLiveStreamConfig),
        isActive: false,
      },
    };

    await setDoc(LIVE_DOC_REF, {
      ...updatedState,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    cachedState = { ...cachedState, ...updatedState };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to end live program in Firebase:', error);
    throw new Error('فشل إنهاء البرنامج في السحاب: ' + (error?.message || 'خطأ غير معروف'));
  }
}

// Clears session answers memory and active quiz state cleanly after saving
export async function clearSessionAnswersMemory(): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const resetPayload: Partial<LiveSessionState> = {
      answersForCurrentQuestion: {},
      allSessionAnswers: {},
      connectedStudents: [],
      quizState: null,
      currentQuestion: null,
      currentQuestionIndex: null,
      questionTriggeredAt: null,
    };

    await setDoc(LIVE_DOC_REF, {
      ...resetPayload,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    cachedState = { ...cachedState, ...resetPayload };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to clear session answers memory:', error);
    return { success: false };
  }
}

// Regenerate or update session PIN
export async function updateLivePin(customPin?: string): Promise<{ success: boolean; pin?: string; state?: LiveSessionState }> {
  try {
    const pin = customPin && customPin.trim().length > 0 ? customPin.trim() : generatePinCode();
    await updateDoc(LIVE_DOC_REF, {
      sessionPin: pin,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, sessionPin: pin };
    return { success: true, pin, state: cachedState };
  } catch (error: any) {
    console.error('Failed to update PIN in Firebase:', error);
    throw error;
  }
}

// Student joins session (Atomic transaction to prevent concurrent student overwriting)
export async function joinLiveSession(
  username: string, 
  sheetNumber: string, 
  pin?: string
): Promise<{ success: boolean; state?: LiveSessionState; pinVerified?: boolean; error?: string }> {
  try {
    let resultState: LiveSessionState | null = null;
    let isPinValid = true;
    let failureError: string | null = null;

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(LIVE_DOC_REF);
      if (!snap.exists()) {
        failureError = 'تعذر الاتصال بقاعدة بيانات الحصة المباشرة.';
        return;
      }

      const currentData = snap.data() as any;
      const isActive = Boolean(currentData.isProgramActive) || 
        (currentData.status !== 'program_ended' && currentData.status !== 'idle' && Boolean(currentData.lessonTitle));

      if (!isActive) {
        failureError = 'الحصة المباشرة مغلقة حالياً من قِبل المعلم. يرجى الانتظار حتى يبدأ المعلم الحصة.';
        return;
      }

      // Verify PIN if set
      const expectedPin = String(currentData.sessionPin || '').trim();
      const enteredPin = (pin || '').trim();
      if (expectedPin && expectedPin.length > 0) {
        if (!enteredPin || enteredPin !== expectedPin) {
          isPinValid = false;
          failureError = 'رمز الدخول غير صحيح! يرجى إدخال الرمز المعروض على شاشة الفصل.';
          return;
        }
      }

      const cleanUser = String(username || '').trim();
      const cleanSheet = String(sheetNumber || '').trim();
      const normUser = cleanUser.toLowerCase();

      const existingStudents: LiveConnectedStudent[] = Array.isArray(currentData.connectedStudents) 
        ? currentData.connectedStudents 
        : [];

      const oldStudent = existingStudents.find(
        (s) => String(s.username || '').trim().toLowerCase() === normUser || 
               (cleanSheet && String(s.sheetNumber || '').trim() === cleanSheet)
      );

      const effectiveSheetNumber = cleanSheet || (oldStudent ? String(oldStudent.sheetNumber || '').trim() : '');

      const filtered = existingStudents.filter((s) => {
        const sUser = String(s.username || '').trim().toLowerCase();
        const sSheet = String(s.sheetNumber || '').trim();
        if (sUser === normUser) return false;
        if (effectiveSheetNumber && sSheet && effectiveSheetNumber === sSheet) return false;
        return true;
      });

      const newStudent: LiveConnectedStudent = {
        username: cleanUser,
        sheetNumber: effectiveSheetNumber,
        joinedAt: oldStudent ? oldStudent.joinedAt : Date.now(),
        lastPing: Date.now(),
        pinVerified: true,
      };

      const updatedStudents = [...filtered, newStudent];

      transaction.update(LIVE_DOC_REF, {
        connectedStudents: updatedStudents,
        updatedAt: serverTimestamp(),
      });

      resultState = {
        sessionId: currentData.sessionId || 'live-main',
        sessionPin: currentData.sessionPin || '1234',
        isProgramActive: Boolean(currentData.isProgramActive),
        showLessonsListInRoom: Boolean(currentData.showLessonsListInRoom),
        showPinInRoom: Boolean(currentData.showPinInRoom),
        showQrInRoom: Boolean(currentData.showQrInRoom),
        showFinishLessonInRoom: Boolean(currentData.showFinishLessonInRoom),
        showRevealInRoom: Boolean(currentData.showRevealInRoom),
        showResumeInRoom: Boolean(currentData.showResumeInRoom),
        showSkipInRoom: Boolean(currentData.showSkipInRoom),
        showPlayPauseInRoom: Boolean(currentData.showPlayPauseInRoom),
        videoPlaying: Boolean(currentData.videoPlaying),
        showOptionCountsInRoom: Boolean(currentData.showOptionCountsInRoom),
        showStudentTextAnswersInRoom: Boolean(currentData.showStudentTextAnswersInRoom),
        showChatInRoom: Boolean(currentData.showChatInRoom),
        showConnectedCountInRoom: Boolean(currentData.showConnectedCountInRoom),
        showPdfInRoom: Boolean(currentData.showPdfInRoom),
        pdfUrl: currentData.pdfUrl || '',
        pdfTitle: currentData.pdfTitle || '',
        pdfPage: typeof currentData.pdfPage === 'number' ? currentData.pdfPage : 1,
        pdfTotalPages: typeof currentData.pdfTotalPages === 'number' ? currentData.pdfTotalPages : undefined,
        pdfLaser: currentData.pdfLaser || null,
        pdfFitMode: currentData.pdfFitMode === 'width' ? 'width' : 'contain',
        pdfZoom: typeof currentData.pdfZoom === 'number' ? currentData.pdfZoom : 1.0,
        pdfAnnotations: currentData.pdfAnnotations || {},
        messages: Array.isArray(currentData.messages) ? currentData.messages : [],
        lessonTitle: currentData.lessonTitle || '',
        videoUrl: currentData.videoUrl || '',
        status: currentData.status || 'idle',
        currentQuestionIndex: currentData.currentQuestionIndex !== undefined ? currentData.currentQuestionIndex : null,
        currentQuestion: currentData.currentQuestion || null,
        questionTriggeredAt: currentData.questionTriggeredAt || null,
        timeLimit: currentData.timeLimit || 30,
        showResult: currentData.showResult || 'نعم',
        connectedStudents: updatedStudents,
        answersForCurrentQuestion: currentData.answersForCurrentQuestion || {},
        allSessionAnswers: currentData.allSessionAnswers || {},
        quizState: currentData.quizState || null,
      };
    });

    if (failureError) {
      return { success: false, pinVerified: isPinValid, error: failureError };
    }

    if (resultState) {
      cachedState = resultState;
      return { success: true, state: resultState, pinVerified: true };
    }

    return { success: false, error: 'حدث خطأ أثناء الانضمام' };
  } catch (error: any) {
    console.error('Failed to join live session:', error);
    return { success: false, error: error?.message || 'حدث خطأ أثناء الانضمام' };
  }
}

// Student heartbeat ping (atomic transaction to never overwrite peers)
export async function pingLiveSession(username: string, sheetNumber?: string): Promise<void> {
  try {
    const cleanUser = String(username || '').trim().toLowerCase();
    if (!cleanUser) return;

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(LIVE_DOC_REF);
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const students: LiveConnectedStudent[] = Array.isArray(data.connectedStudents) 
        ? [...data.connectedStudents] 
        : [];

      const idx = students.findIndex((s) => String(s.username || '').trim().toLowerCase() === cleanUser);
      if (idx !== -1) {
        students[idx] = { 
          ...students[idx], 
          lastPing: Date.now(),
          sheetNumber: sheetNumber ? String(sheetNumber).trim() : students[idx].sheetNumber 
        };
        transaction.update(LIVE_DOC_REF, { connectedStudents: students });
      }
    });
  } catch {}
}

// Student leaves
export async function leaveLiveSession(username: string, sheetNumber?: string): Promise<void> {
  try {
    const state = await getLiveSessionState();
    if (!state) return;
    const cleanUser = String(username || '').trim().toLowerCase();
    const updatedStudents = (state.connectedStudents || []).filter(
      (s) => String(s.username || '').trim().toLowerCase() !== cleanUser
    );
    await updateDoc(LIVE_DOC_REF, {
      connectedStudents: updatedStudents,
      updatedAt: serverTimestamp(),
    });
  } catch {}
}

// Reset / Clear all connected students manually (e.g. by teacher)
export async function clearConnectedStudents(): Promise<{ success: boolean }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      connectedStudents: [],
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, connectedStudents: [] };
    return { success: true };
  } catch (err: any) {
    console.error('Failed to clear connected students:', err);
    return { success: false };
  }
}

// Teacher initializes a lesson theater
export async function initLiveSession(payload: {
  lessonTitle: string;
  videoUrl?: string;
  mode?: 'video' | 'direct';
  explanationText?: string;
  timeLimit?: number;
  showResult?: 'نعم' | 'لا';
}): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const isDirect = payload.mode === 'direct' || (!payload.videoUrl && payload.mode !== 'video');
    
    // Always fetch existing session state from Firestore to preserve active PIN, connected students, and answers
    let existingData: any = null;
    try {
      const snap = await getDoc(LIVE_DOC_REF);
      if (snap.exists()) {
        existingData = snap.data();
      }
    } catch (readErr) {
      console.warn('Could not read existing doc in initLiveSession, using cached state:', readErr);
    }

    const pin = (existingData?.sessionPin && String(existingData.sessionPin).trim().length > 0)
      ? String(existingData.sessionPin).trim()
      : (cachedState.sessionPin || '1234');

    const sessionId = existingData?.sessionId || cachedState.sessionId || ('live-' + Date.now());
    const isProgramActive = existingData?.isProgramActive ?? cachedState.isProgramActive ?? true;
    const connectedStudents = Array.isArray(existingData?.connectedStudents) 
      ? existingData.connectedStudents 
      : (cachedState.connectedStudents || []);

    const effectiveVideoLessonTitle = isDirect 
      ? (existingData?.videoLessonTitle || cachedState.videoLessonTitle || '')
      : payload.lessonTitle;
    const effectiveDirectLessonTitle = isDirect 
      ? payload.lessonTitle
      : (existingData?.directLessonTitle || cachedState.directLessonTitle || '');

    const videoAnswers = existingData?.videoAnswers || cachedState.videoAnswers || {};
    const directAnswers = existingData?.directAnswers || cachedState.directAnswers || {};

    const targetMode = isDirect ? 'direct' : 'video';

    const update: Partial<LiveSessionState> = {
      sessionId: sessionId,
      sessionPin: pin,
      isProgramActive: isProgramActive,
      lessonTitle: payload.lessonTitle,
      videoLessonTitle: effectiveVideoLessonTitle,
      directLessonTitle: effectiveDirectLessonTitle,
      videoUrl: isDirect ? (existingData?.videoUrl || cachedState.videoUrl || '') : (payload.videoUrl || ''),
      mode: targetMode,
      activeMode: targetMode,
      explanationText: payload.explanationText || (isDirect ? `موضوع الحصة: ${payload.lessonTitle}` : ''),
      timeLimit: payload.timeLimit ?? 30,
      showResult: payload.showResult ?? 'نعم',
      status: isDirect ? 'direct_explanation' : 'waiting',
      currentQuestionIndex: null,
      currentQuestion: null,
      questionTriggeredAt: null,
      connectedStudents: connectedStudents,
      answersForCurrentQuestion: {},
      allSessionAnswers: isDirect ? (directAnswers[payload.lessonTitle] || {}) : (videoAnswers[payload.lessonTitle] || {}),
      videoAnswers: videoAnswers,
      directAnswers: directAnswers,
    };

    await updateDoc(LIVE_DOC_REF, {
      ...update,
      updatedAt: serverTimestamp(),
    });

    // Also inform server of lesson init
    try {
      await fetch('/api/live/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonTitle: payload.lessonTitle,
          videoUrl: payload.videoUrl,
          mode: targetMode,
          explanationText: payload.explanationText,
          timeLimit: payload.timeLimit,
          showResult: payload.showResult,
          sessionPin: pin,
        })
      });
    } catch {}

    cachedState = { ...cachedState, ...update };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to init live lesson:', error);
    throw error;
  }
}

// Teacher returns to explanation mode (clears active question so students return to live listening screen)
export async function returnToLiveExplanation(payload?: {
  explanationText?: string;
}): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const update: Partial<LiveSessionState> = {
      status: 'direct_explanation',
      mode: 'direct',
      activeMode: 'direct',
      videoPlaying: false,
      currentQuestionIndex: null,
      currentQuestion: null,
      questionTriggeredAt: null,
      answersForCurrentQuestion: {},
      explanationText: payload?.explanationText ?? cachedState.explanationText ?? '',
    };
    await updateDoc(LIVE_DOC_REF, {
      ...update,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, ...update };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to return to live explanation:', error);
    throw error;
  }
}

// Teacher triggers a live question
export async function triggerLiveQuestion(payload: {
  questionIndex: number;
  question: LiveQuestionItem;
  timeLimit?: number;
  showResult?: 'نعم' | 'لا';
  channel?: 'video' | 'direct';
}): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const targetChannel = payload.channel || (cachedState.mode === 'direct' ? 'direct' : 'video');

    const update: Partial<LiveSessionState> & { channel?: 'video' | 'direct' } = {
      status: 'question_active',
      videoPlaying: false,
      mode: targetChannel,
      activeMode: targetChannel,
      channel: targetChannel,
      currentQuestionIndex: payload.questionIndex,
      currentQuestion: payload.question,
      questionTriggeredAt: Date.now(),
      timeLimit: payload.timeLimit ?? cachedState.timeLimit ?? 30,
      showResult: payload.showResult ?? cachedState.showResult ?? 'نعم',
      answersForCurrentQuestion: {}, // Clean slate for new question!
    };

    await updateDoc(LIVE_DOC_REF, {
      ...update,
      updatedAt: serverTimestamp(),
    });

    // Notify server as well
    try {
      await fetch('/api/live/trigger-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionIndex: payload.questionIndex,
          question: payload.question,
          timeLimit: payload.timeLimit,
          showResult: payload.showResult,
          channel: targetChannel,
        })
      });
    } catch {}

    cachedState = { ...cachedState, ...update };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to trigger question in Firebase:', error);
    throw error;
  }
}

// Student submits an answer
export async function submitLiveAnswer(payload: {
  username: string;
  sheetNumber: string;
  answer: string;
  questionIndex: number;
  isCorrect?: boolean | null;
  channel?: 'video' | 'direct';
}): Promise<{ success: boolean; state?: LiveSessionState; error?: string }> {
  try {
    const state = await getLiveSessionState() || cachedState;
    const currentAnswers = { ...(state.answersForCurrentQuestion || {}) };
    const allAnswers = { ...(state.allSessionAnswers || {}) };

    const cleanUser = String(payload.username || '').trim();
    let cleanSheet = String(payload.sheetNumber || '').trim();

    if (!cleanUser) {
      return { success: false, error: 'اسم الطالب مطلوب لتسجيل الإجابة.' };
    }

    const normClean = normalizeArabicText(cleanUser);

    // If student submitted without sheetNumber, recover from connectedStudents
    if (!cleanSheet) {
      const match = (state.connectedStudents || []).find(
        (s) => normalizeArabicText(String(s.username || '')) === normClean
      );
      if (match && match.sheetNumber) {
        cleanSheet = String(match.sheetNumber).trim();
      }
    }

    // Ensure student is registered and active in connectedStudents
    let updatedStudents = [...(state.connectedStudents || [])];
    const matchIdx = updatedStudents.findIndex(
      (s) => normalizeArabicText(String(s.username || '')) === normClean
    );
    if (matchIdx >= 0) {
      updatedStudents[matchIdx] = {
        ...updatedStudents[matchIdx],
        sheetNumber: cleanSheet || updatedStudents[matchIdx].sheetNumber,
        pinVerified: true,
        lastPing: Date.now(),
      };
    } else {
      updatedStudents.push({
        username: cleanUser,
        sheetNumber: cleanSheet,
        joinedAt: Date.now(),
        lastPing: Date.now(),
        pinVerified: true,
      });
    }

    const studentKey = cleanSheet ? `${cleanUser}_${cleanSheet}` : cleanUser;

    const submission: LiveStudentAnswerSubmission = {
      username: cleanUser,
      sheetNumber: cleanSheet,
      answer: String(payload.answer ?? '').trim(),
      isCorrect: payload.isCorrect,
      submittedAt: Date.now(),
    };

    // Deduplicate: Clean up any old or alternate keys for this same student so they never appear twice
    Object.keys(currentAnswers).forEach((k) => {
      const existingSub = currentAnswers[k];
      const existingUser = existingSub?.username ? String(existingSub.username).trim() : (k.includes('_') ? k.split('_')[0] : k);
      if (normalizeArabicText(existingUser) === normClean) {
        delete currentAnswers[k];
      }
    });

    currentAnswers[studentKey] = submission;

    // Deduplicate allSessionAnswers: merge and clean up any alternate keys
    Object.keys(allAnswers).forEach((k) => {
      const existingUser = k.includes('_') ? k.split('_')[0] : k;
      if (normalizeArabicText(existingUser) === normClean && k !== studentKey) {
        allAnswers[studentKey] = { ...(allAnswers[k] || {}), ...(allAnswers[studentKey] || {}) };
        delete allAnswers[k];
      }
    });

    if (!allAnswers[studentKey]) {
      allAnswers[studentKey] = {};
    }
    
    // Format answer cleanly as 'صح' or 'خطأ' if evaluation is available, or preserve text
    const formattedAnswer = payload.isCorrect === true
      ? 'صح'
      : payload.isCorrect === false
        ? 'خطأ'
        : String(payload.answer ?? '').trim();

    allAnswers[studentKey][payload.questionIndex] = formattedAnswer;

    // Scoped answers per lesson to avoid cross-lesson interference
    const targetChannel = payload.channel || (state.activeMode === 'direct' || state.mode === 'direct' ? 'direct' : 'video');
    const currentLesson = targetChannel === 'direct' 
      ? (state.directLessonTitle || state.lessonTitle || 'default') 
      : (state.videoLessonTitle || state.lessonTitle || 'default');

    const videoAnswers: Record<string, Record<string, Record<number, string>>> = { ...(state.videoAnswers || {}) };
    const directAnswers: Record<string, Record<string, Record<number, string>>> = { ...(state.directAnswers || {}) };

    if (targetChannel === 'direct') {
      if (!directAnswers[currentLesson]) directAnswers[currentLesson] = {};
      if (!directAnswers[currentLesson][studentKey]) directAnswers[currentLesson][studentKey] = {};
      directAnswers[currentLesson][studentKey][payload.questionIndex] = formattedAnswer;
    } else {
      if (!videoAnswers[currentLesson]) videoAnswers[currentLesson] = {};
      if (!videoAnswers[currentLesson][studentKey]) videoAnswers[currentLesson][studentKey] = {};
      videoAnswers[currentLesson][studentKey][payload.questionIndex] = formattedAnswer;
    }

    // Scoped active channel answers - NEVER leak video and direct into each other!
    const activeScopedAnswers = targetChannel === 'direct'
      ? (directAnswers[currentLesson] || {})
      : (videoAnswers[currentLesson] || {});

    await updateDoc(LIVE_DOC_REF, {
      answersForCurrentQuestion: currentAnswers,
      allSessionAnswers: activeScopedAnswers,
      videoAnswers: videoAnswers,
      directAnswers: directAnswers,
      connectedStudents: updatedStudents,
      updatedAt: serverTimestamp(),
    });

    // Also forward to server
    try {
      await fetch('/api/live/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          sheetNumber: cleanSheet,
          answer: payload.answer,
          questionIndex: payload.questionIndex,
          isCorrect: payload.isCorrect,
          channel: targetChannel,
        })
      });
    } catch {}

    cachedState = { 
      ...state, 
      answersForCurrentQuestion: currentAnswers, 
      allSessionAnswers: activeScopedAnswers,
      videoAnswers: videoAnswers,
      directAnswers: directAnswers,
      connectedStudents: updatedStudents,
    };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to submit answer in Firebase:', error);
    return { success: false, error: error?.message || 'فشل إرسال الإجابة لقاعدة البيانات' };
  }
}

// Clears direct lecture lesson answers cleanly for a specific lesson or all direct lessons AND purges server RAM
export async function clearLiveDirectLessonAnswers(lessonTitle?: string): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const state = await getLiveSessionState() || cachedState;
    const directAnswers = { ...(state.directAnswers || {}) };
    const allSessionAnswers = { ...(state.allSessionAnswers || {}) };
    const targetTitle = lessonTitle || state.directLessonTitle || state.lessonTitle;

    if (targetTitle && directAnswers[targetTitle]) {
      delete directAnswers[targetTitle];
    } else if (!lessonTitle) {
      Object.keys(directAnswers).forEach(k => delete directAnswers[k]);
    }

    let answersForCurrentQuestion = state.answersForCurrentQuestion || {};
    // If currently running this direct lesson, clear current question and unmark answered
    if (state.mode === 'direct' && (!lessonTitle || state.lessonTitle === lessonTitle)) {
      answersForCurrentQuestion = {};
      Object.keys(allSessionAnswers).forEach(studentKey => {
        delete allSessionAnswers[studentKey];
      });
    }

    const update: Partial<LiveSessionState> = {
      directAnswers,
      allSessionAnswers,
      answersForCurrentQuestion,
      currentQuestion: null,
      currentQuestionIndex: null,
      questionTriggeredAt: null,
    };

    await updateDoc(LIVE_DOC_REF, {
      ...update,
      updatedAt: serverTimestamp(),
    });

    // ⚡ CALL SERVER TO PURGE RAM & DISK BACKUP COMPLETELY!
    try {
      await fetch('/api/live/reset-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'direct', lessonTitle: targetTitle })
      });
    } catch (apiErr) {
      console.warn('Failed to call server reset-channel:', apiErr);
    }

    cachedState = { ...cachedState, ...update };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to clear live direct lesson answers:', error);
    return { success: false };
  }
}

// Clears interactive video answers cleanly for a specific lesson or all video lessons AND purges server RAM
export async function clearLiveVideoLessonAnswers(lessonTitle?: string): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const state = await getLiveSessionState() || cachedState;
    const videoAnswers = { ...(state.videoAnswers || {}) };
    const allSessionAnswers = { ...(state.allSessionAnswers || {}) };
    const targetTitle = lessonTitle || state.videoLessonTitle || state.lessonTitle;

    if (targetTitle) {
      delete videoAnswers[targetTitle];
    }
    if (lessonTitle) {
      delete videoAnswers[lessonTitle];
    }
    if (!lessonTitle && !targetTitle) {
      Object.keys(videoAnswers).forEach(k => delete videoAnswers[k]);
    }

    // Always clear answersForCurrentQuestion and wipe active session answers
    const answersForCurrentQuestion = {};
    Object.keys(allSessionAnswers).forEach(studentKey => {
      delete allSessionAnswers[studentKey];
    });

    const update: Partial<LiveSessionState> = {
      videoAnswers,
      allSessionAnswers,
      answersForCurrentQuestion,
      currentQuestion: null,
      currentQuestionIndex: null,
      questionTriggeredAt: null,
    };

    await updateDoc(LIVE_DOC_REF, {
      ...update,
      updatedAt: serverTimestamp(),
    });

    // ⚡ CALL SERVER TO PURGE RAM & DISK BACKUP COMPLETELY!
    try {
      await fetch('/api/live/reset-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'video', lessonTitle: targetTitle })
      });
    } catch (apiErr) {
      console.warn('Failed to call server reset-channel for video:', apiErr);
    }

    cachedState = { ...cachedState, ...update };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to clear live video lesson answers:', error);
    return { success: false };
  }
}

// Teacher reveals correct answer
export async function revealLiveAnswer(): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      status: 'revealed',
      videoPlaying: false,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, status: 'revealed', videoPlaying: false };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to reveal answer in Firebase:', error);
    throw error;
  }
}

// Teacher resumes video playback
export async function resumeLiveVideo(): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const update: Partial<LiveSessionState> = {
      status: 'playing',
      videoPlaying: true,
      currentQuestion: null,
      currentQuestionIndex: null,
      questionTriggeredAt: null,
      answersForCurrentQuestion: {},
    };

    await updateDoc(LIVE_DOC_REF, {
      ...update,
      updatedAt: serverTimestamp(),
    });

    cachedState = { ...cachedState, ...update };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to resume video in Firebase:', error);
    throw error;
  }
}

// Teacher finishes lesson
export async function finishLiveSession(): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const update: Partial<LiveSessionState> = {
      status: 'finished',
      accessMode: 'restricted',
      videoPlaying: false,
      currentQuestion: null,
      currentQuestionIndex: null,
      answersForCurrentQuestion: {},
    };

    await setDoc(LIVE_DOC_REF, {
      ...update,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    cachedState = { ...cachedState, ...update };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to finish live session:', error);
    throw error;
  }
}

// Reset session state
export async function resetLiveSession(): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const freshState: LiveSessionState = {
      ...defaultLiveSessionState,
      sessionId: 'live-' + Date.now(),
      sessionPin: cachedState.sessionPin || generatePinCode(),
      isProgramActive: cachedState.isProgramActive,
    };

    await setDoc(LIVE_DOC_REF, {
      ...freshState,
      updatedAt: serverTimestamp(),
    });

    // ⚡ Clear server RAM and wipe backup file completely
    try {
      await fetch('/api/live/reset-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'all' })
      });
    } catch {}

    cachedState = freshState;
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to reset live session in Firebase:', error);
    throw error;
  }
}

// Backup & Recovery
export async function getLiveBackup(): Promise<{ success: boolean; backup?: any }> {
  try {
    const state = await getLiveSessionState();
    return {
      success: true,
      backup: {
        savedAt: new Date().toISOString(),
        session: state || cachedState,
      }
    };
  } catch {
    return { success: false };
  }
}

export async function restoreLiveBackup(backupSession: any): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    if (!backupSession) return { success: false };
    await setDoc(LIVE_DOC_REF, {
      ...backupSession,
      updatedAt: serverTimestamp(),
    });
    cachedState = backupSession;
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to restore backup:', error);
    throw error;
  }
}

// Toggle student access mode between 'restricted' (verifies Settings sheet) and 'open' (free entry)
export async function toggleLiveAccessMode(mode: 'restricted' | 'open'): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await setDoc(LIVE_DOC_REF, {
      accessMode: mode,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    cachedState = { ...cachedState, accessMode: mode };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle accessMode in Firebase:', error);
    return { success: false };
  }
}

// Toggle showing lessons list selector in projector display screen
export async function toggleShowLessonsListInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      showLessonsListInRoom: show,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, showLessonsListInRoom: show };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle showLessonsListInRoom in Firebase:', error);
    return { success: false };
  }
}

// Toggle showing attendance PIN badge in projector display screen
export async function toggleShowPinInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      showPinInRoom: show,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, showPinInRoom: show };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle showPinInRoom in Firebase:', error);
    return { success: false };
  }
}

// Toggle showing join QR code in projector display screen
export async function toggleShowQrInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      showQrInRoom: show,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, showQrInRoom: show };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle showQrInRoom in Firebase:', error);
    return { success: false };
  }
}

// Toggle showing finish lesson button in projector display screen
export async function toggleShowFinishLessonInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      showFinishLessonInRoom: show,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, showFinishLessonInRoom: show };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle showFinishLessonInRoom in Firebase:', error);
    return { success: false };
  }
}

// Toggle showing "الإجابة" button in projector display screen
export async function toggleShowRevealInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      showRevealInRoom: show,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, showRevealInRoom: show };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle showRevealInRoom in Firebase:', error);
    return { success: false };
  }
}

// Toggle showing "تخطي" button in projector display screen
export async function toggleShowSkipInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      showSkipInRoom: show,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, showSkipInRoom: show };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle showSkipInRoom in Firebase:', error);
    return { success: false };
  }
}

// Toggle showing counts of students per option on projector display screen
export async function toggleShowOptionCountsInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      showOptionCountsInRoom: show,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, showOptionCountsInRoom: show };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle showOptionCountsInRoom in Firebase:', error);
    return { success: false };
  }
}

// Toggle showing student submitted text answers on projector display screen
export async function toggleShowStudentTextAnswersInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      showStudentTextAnswersInRoom: show,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, showStudentTextAnswersInRoom: show };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle showStudentTextAnswersInRoom in Firebase:', error);
    return { success: false };
  }
}

// Toggle showing "متابعة تشغيل الفيديو" button in projector display screen
export async function toggleShowResumeInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      showResumeInRoom: show,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, showResumeInRoom: show };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle showResumeInRoom in Firebase:', error);
    return { success: false };
  }
}

// Toggle showing Play/Pause video controls in projector display screen
export async function toggleShowPlayPauseInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      showPlayPauseInRoom: show,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, showPlayPauseInRoom: show };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle showPlayPauseInRoom in Firebase:', error);
    return { success: false };
  }
}

// Teacher sets Master Broadcast Volume for room / streaming display (0.0 to 1.0)
export async function setLiveBroadcastVolume(volume: number): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const safeVol = Math.max(0, Math.min(1, volume));
    // Instant cross-tab broadcast
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('live_video_control');
        bc.postMessage({ type: 'VOLUME_CHANGE', volume: safeVol });
        bc.close();
      }
    } catch {}

    await updateDoc(LIVE_DOC_REF, {
      broadcastVolume: safeVol,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, broadcastVolume: safeVol };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to update broadcastVolume:', error);
    return { success: false };
  }
}

// Teacher toggles Play/Pause state synced across room and admin
export async function toggleLiveVideoPlay(playing: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    // Instant cross-tab broadcast
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('live_video_control');
        bc.postMessage({ type: 'PLAY_PAUSE', playing });
        bc.close();
      }
    } catch {}

    const update: any = {
      videoPlaying: playing,
      mode: 'video',
      updatedAt: serverTimestamp(),
    };
    if (playing) {
      update.status = 'playing';
    } else if (cachedState.status === 'playing') {
      update.status = 'waiting';
    }

    await updateDoc(LIVE_DOC_REF, update);
    cachedState = { ...cachedState, ...update };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle videoPlay in Firebase:', error);
    return { success: false };
  }
}

// Student sends a message or reaction (Raise Hand, Agree, Disagree, Question, Clap)
export async function sendStudentMessage(payload: {
  senderName: string;
  sheetNumber?: string;
  type: 'question' | 'hand' | 'agree' | 'disagree' | 'clap';
  text?: string;
}): Promise<{ success: boolean; messageId: string }> {
  try {
    const newMessage: LiveStudentMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      senderName: payload.senderName.trim(),
      sheetNumber: payload.sheetNumber?.trim() || '',
      type: payload.type,
      text: payload.text?.trim() || '',
      createdAt: Date.now(),
    };

    const currentMessages = cachedState.messages || [];
    // Keep last 100 messages to prevent document size bloat
    const updatedMessages = [...currentMessages.slice(-99), newMessage];

    await updateDoc(LIVE_DOC_REF, {
      messages: updatedMessages,
      updatedAt: serverTimestamp(),
    });

    cachedState = { ...cachedState, messages: updatedMessages };
    return { success: true, messageId: newMessage.id };
  } catch (error: any) {
    console.error('Failed to send student message:', error);
    throw error;
  }
}

// Teacher replies to a student message (private or public)
export async function replyToStudentMessage(
  messageId: string,
  replyText: string,
  replyType: 'private' | 'public'
): Promise<{ success: boolean }> {
  try {
    const currentMessages = cachedState.messages || [];
    const updatedMessages = currentMessages.map((msg) => {
      if (msg.id === messageId) {
        return {
          ...msg,
          reply: {
            text: replyText.trim(),
            type: replyType,
            repliedAt: Date.now(),
            repliedBy: 'الأستاذ',
          },
        };
      }
      return msg;
    });

    await updateDoc(LIVE_DOC_REF, {
      messages: updatedMessages,
      updatedAt: serverTimestamp(),
    });

    cachedState = { ...cachedState, messages: updatedMessages };
    return { success: true };
  } catch (error: any) {
    console.error('Failed to reply to student message:', error);
    throw error;
  }
}

// Teacher deletes a specific student message
export async function deleteStudentMessage(messageId: string): Promise<{ success: boolean }> {
  try {
    const currentMessages = cachedState.messages || [];
    const updatedMessages = currentMessages.filter((m) => m.id !== messageId);

    await updateDoc(LIVE_DOC_REF, {
      messages: updatedMessages,
      updatedAt: serverTimestamp(),
    });

    cachedState = { ...cachedState, messages: updatedMessages };
    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete student message:', error);
    throw error;
  }
}

// Teacher clears all student messages
export async function clearAllStudentMessages(): Promise<{ success: boolean }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      messages: [],
      updatedAt: serverTimestamp(),
    });

    cachedState = { ...cachedState, messages: [] };
    return { success: true };
  } catch (error: any) {
    console.error('Failed to clear student messages:', error);
    throw error;
  }
}

// Teacher sends a broadcast message or direct private message to a specific student
export async function sendTeacherBroadcastMessage(payload: {
  text: string;
  recipientStudent?: string; // If empty, public broadcast to all
  recipientSheet?: string;
}): Promise<{ success: boolean; messageId: string }> {
  try {
    const isPrivate = Boolean(payload.recipientStudent && payload.recipientStudent.trim());
    const cleanText = payload.text.trim();
    const newMessage: LiveStudentMessage = {
      id: `teach_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      senderName: isPrivate ? (payload.recipientStudent?.trim() || 'المشترك') : 'الأستاذ 👨‍🏫',
      sheetNumber: payload.recipientSheet?.trim() || '',
      type: 'question',
      text: isPrivate ? `رسالة خاصة من الأستاذ: ${cleanText}` : cleanText,
      createdAt: Date.now(),
    };

    const currentMessages = cachedState.messages || [];
    const updatedMessages = [...currentMessages.slice(-99), newMessage];

    await updateDoc(LIVE_DOC_REF, {
      messages: updatedMessages,
      updatedAt: serverTimestamp(),
    });

    cachedState = { ...cachedState, messages: updatedMessages };
    return { success: true, messageId: newMessage.id };
  } catch (error: any) {
    console.error('Failed to send teacher broadcast message:', error);
    throw error;
  }
}

// Toggle showing chat / messages on projector display screen
export async function toggleShowChatInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      showChatInRoom: show,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, showChatInRoom: show };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle showChatInRoom in Firebase:', error);
    return { success: false };
  }
}

// Toggle showing connected students badge on projector display screen
export async function toggleShowConnectedCountInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      showConnectedCountInRoom: show,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, showConnectedCountInRoom: show };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to toggle showConnectedCountInRoom in Firebase:', error);
    return { success: false };
  }
}

// Toggle or update PDF presentation in projector display room
export async function updateLivePdfState({
  showPdfInRoom,
  pdfUrl,
  pdfTitle,
  pdfPage,
  pdfTotalPages,
  pdfFitMode,
  pdfZoom,
  showPdfToStudents,
}: {
  showPdfInRoom?: boolean;
  showPdfToStudents?: boolean;
  pdfUrl?: string;
  pdfTitle?: string;
  pdfPage?: number;
  pdfTotalPages?: number;
  pdfFitMode?: 'contain' | 'width';
  pdfZoom?: number;
}): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const updatePayload: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    if (showPdfInRoom !== undefined) updatePayload.showPdfInRoom = showPdfInRoom;
    if (showPdfToStudents !== undefined) updatePayload.showPdfToStudents = showPdfToStudents;
    if (pdfUrl !== undefined) updatePayload.pdfUrl = pdfUrl;
    if (pdfTitle !== undefined) updatePayload.pdfTitle = pdfTitle;
    if (pdfPage !== undefined) updatePayload.pdfPage = pdfPage;
    if (pdfTotalPages !== undefined) updatePayload.pdfTotalPages = pdfTotalPages;
    if (pdfFitMode !== undefined) updatePayload.pdfFitMode = pdfFitMode;
    if (pdfZoom !== undefined) updatePayload.pdfZoom = pdfZoom;

    await updateDoc(LIVE_DOC_REF, updatePayload);
    cachedState = {
      ...cachedState,
      ...(showPdfInRoom !== undefined ? { showPdfInRoom } : {}),
      ...(showPdfToStudents !== undefined ? { showPdfToStudents } : {}),
      ...(pdfUrl !== undefined ? { pdfUrl } : {}),
      ...(pdfTitle !== undefined ? { pdfTitle } : {}),
      ...(pdfPage !== undefined ? { pdfPage } : {}),
      ...(pdfTotalPages !== undefined ? { pdfTotalPages } : {}),
      ...(pdfFitMode !== undefined ? { pdfFitMode } : {}),
      ...(pdfZoom !== undefined ? { pdfZoom } : {}),
    };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to update live PDF state in Firebase:', error);
    return { success: false };
  }
}

export async function toggleShowPdfInRoom(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  return updateLivePdfState({ showPdfInRoom: show });
}

export async function toggleShowPdfToStudents(show: boolean): Promise<{ success: boolean; state?: LiveSessionState }> {
  return updateLivePdfState({ showPdfToStudents: show });
}

// Realtime sync of laser pointer or live pen tip (debounced/throttled on caller side)
export async function updateLivePdfLaser(laser: { x: number; y: number; active: boolean; timestamp: number; tool?: 'laser' | 'pen' | 'highlighter'; color?: string } | null): Promise<{ success: boolean }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      pdfLaser: laser,
    });
    cachedState = { ...cachedState, pdfLaser: laser };
    return { success: true };
  } catch (error: any) {
    return { success: false };
  }
}

// Realtime sync of drawings/annotations per page
export async function updateLivePdfAnnotations(
  annotations: Record<number, Array<{
    type: 'pen' | 'highlighter';
    color: string;
    width: number;
    points: Array<{ x: number; y: number }>;
  }>>
): Promise<{ success: boolean }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      pdfAnnotations: annotations,
    });
    cachedState = { ...cachedState, pdfAnnotations: annotations };
    return { success: true };
  } catch (error: any) {
    console.error('Failed to update pdfAnnotations in Firebase:', error);
    return { success: false };
  }
}

// ==========================================
// --- REAL-TIME LIVE QUIZ / CHALLENGE ARENA ---
// ==========================================

export async function openLiveQuizLobby(config: {
  title: string;
  questions: QuizQuestionItem[];
  timerDurationSeconds: number;
  shuffleQuestions: boolean;
  showInstantFeedback: boolean;
  allowRetryWrong: boolean;
  podiumCount: number;
}): Promise<{ success: boolean; quizState?: QuizActiveState }> {
  try {
    const quizState: QuizActiveState = {
      isActive: true,
      quizStatus: 'waiting', // Waiting in Lobby with students chart!
      quizTitle: config.title || 'مسابقة التحدي التفاعلي',
      questions: config.questions || [],
      timerDurationSeconds: config.timerDurationSeconds || 0,
      startTime: null,
      endTime: null,
      shuffleQuestions: Boolean(config.shuffleQuestions),
      showInstantFeedback: Boolean(config.showInstantFeedback),
      allowRetryWrong: Boolean(config.allowRetryWrong),
      podiumCount: config.podiumCount || 3,
      participants: {},
    };

    await updateDoc(LIVE_DOC_REF, {
      quizState,
      updatedAt: serverTimestamp(),
    });

    cachedState = { ...cachedState, quizState };
    return { success: true, quizState };
  } catch (err: any) {
    console.error('Failed to open live quiz lobby:', err);
    return { success: false };
  }
}

export async function launchLiveQuizQuestions(): Promise<{ success: boolean }> {
  try {
    if (!cachedState.quizState) return { success: false };
    const currentQuiz = { ...cachedState.quizState };
    currentQuiz.quizStatus = 'in_progress';
    currentQuiz.startTime = Date.now();
    currentQuiz.endTime = currentQuiz.timerDurationSeconds > 0
      ? Date.now() + (currentQuiz.timerDurationSeconds * 1000)
      : null;

    await updateDoc(LIVE_DOC_REF, {
      quizState: currentQuiz,
      updatedAt: serverTimestamp(),
    });

    cachedState = { ...cachedState, quizState: currentQuiz };
    return { success: true };
  } catch (err: any) {
    console.error('Failed to launch live quiz questions:', err);
    return { success: false };
  }
}

export async function startLiveQuiz(config: {
  title: string;
  questions: QuizQuestionItem[];
  timerDurationSeconds: number;
  shuffleQuestions: boolean;
  showInstantFeedback: boolean;
  allowRetryWrong: boolean;
  podiumCount: number;
  initialStatus?: 'waiting' | 'in_progress';
}): Promise<{ success: boolean; quizState?: QuizActiveState }> {
  try {
    const status = config.initialStatus || 'in_progress';
    const now = Date.now();
    const quizState: QuizActiveState = {
      isActive: true,
      quizStatus: status,
      quizTitle: config.title || 'مسابقة التحدي التفاعلي',
      questions: config.questions || [],
      timerDurationSeconds: config.timerDurationSeconds || 0,
      startTime: status === 'in_progress' ? now : null,
      endTime: (status === 'in_progress' && config.timerDurationSeconds > 0)
        ? now + (config.timerDurationSeconds * 1000)
        : null,
      shuffleQuestions: Boolean(config.shuffleQuestions),
      showInstantFeedback: Boolean(config.showInstantFeedback),
      allowRetryWrong: Boolean(config.allowRetryWrong),
      podiumCount: config.podiumCount || 3,
      participants: {},
    };

    await updateDoc(LIVE_DOC_REF, {
      quizState,
      updatedAt: serverTimestamp(),
    });

    cachedState = { ...cachedState, quizState };
    return { success: true, quizState };
  } catch (err: any) {
    console.error('Failed to start live quiz:', err);
    return { success: false };
  }
}

export async function launchActiveQuiz(): Promise<{ success: boolean }> {
  try {
    const snap = await getDoc(LIVE_DOC_REF);
    if (!snap.exists()) return { success: false };
    const data = snap.data() as any;
    const currentQuiz = data.quizState as QuizActiveState;
    if (!currentQuiz || !currentQuiz.isActive) return { success: false };

    const now = Date.now();
    const duration = currentQuiz.timerDurationSeconds || 0;
    const updatedQuiz: QuizActiveState = {
      ...currentQuiz,
      quizStatus: 'in_progress',
      startTime: now,
      endTime: duration > 0 ? now + (duration * 1000) : null,
    };

    await updateDoc(LIVE_DOC_REF, {
      quizState: updatedQuiz,
      updatedAt: serverTimestamp(),
    });

    cachedState = { ...cachedState, quizState: updatedQuiz };
    return { success: true };
  } catch (err: any) {
    console.error('Failed to launch active quiz:', err);
    return { success: false };
  }
}

export async function updateLiveQuizSettings(
  settings: Partial<QuizActiveState>
): Promise<{ success: boolean }> {
  try {
    if (!cachedState.quizState) return { success: false };
    const updatedQuiz = { ...cachedState.quizState, ...settings };
    await updateDoc(LIVE_DOC_REF, {
      quizState: updatedQuiz,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, quizState: updatedQuiz };
    return { success: true };
  } catch (err: any) {
    console.error('Failed to update quiz settings:', err);
    return { success: false };
  }
}

export async function joinQuizLobby(
  studentKey: string,
  payload: {
    username: string;
    studentName?: string;
    sheetNumber: string;
  }
): Promise<{ success: boolean }> {
  try {
    let updatedQuiz: QuizActiveState | null = null;
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(LIVE_DOC_REF);
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const currentQuiz = data.quizState as QuizActiveState;
      if (!currentQuiz || !currentQuiz.isActive) return;

      const participants = { ...(currentQuiz.participants || {}) };
      const totalQ = (Array.isArray(currentQuiz.questions) && currentQuiz.questions.length > 0)
        ? currentQuiz.questions.length 
        : 1;

      if (!participants[studentKey]) {
        participants[studentKey] = {
          studentKey,
          username: payload.username.trim(),
          studentName: (payload.studentName || payload.username || studentKey).trim(),
          sheetNumber: (payload.sheetNumber || '').trim(),
          currentQuestionIndex: 0,
          answers: {},
          totalScore: 0,
          correctCount: 0,
          wrongCount: 0,
          totalQuestions: totalQ,
          streak: 0,
          isFinished: false,
          totalTimeTaken: 0,
          wrongQuestionIndices: [],
        };
      } else {
        // Ensure student totalQuestions matches current questions count
        participants[studentKey].totalQuestions = totalQ;
      }

      currentQuiz.participants = participants;
      transaction.update(LIVE_DOC_REF, {
        quizState: currentQuiz,
        updatedAt: serverTimestamp(),
      });
      updatedQuiz = currentQuiz;
    });

    if (updatedQuiz) {
      cachedState = { ...cachedState, quizState: updatedQuiz };
      return { success: true };
    }
    return { success: false };
  } catch (err: any) {
    console.error('Failed to join quiz lobby:', err);
    return { success: false };
  }
}

export async function endLiveQuiz(): Promise<{ success: boolean }> {
  try {
    if (!cachedState.quizState) return { success: false };
    const currentQuiz = { ...cachedState.quizState };
    currentQuiz.quizStatus = 'ended';

    const totalQ = currentQuiz.questions?.length || 1;
    const participantsList = Object.values(currentQuiz.participants || {});

    // For any student who hasn't completed, mark their remaining unanswered questions as wrong
    participantsList.forEach((p) => {
      const answeredCount = Object.keys(p.answers || {}).length;
      if (!p.isFinished) {
        p.isFinished = true;
        const remainingUnanswered = Math.max(0, totalQ - answeredCount);
        p.wrongCount = (p.wrongCount || 0) + remainingUnanswered;
      }
    });

    // Calculate final ranks
    participantsList.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return (a.totalTimeTaken || 99999) - (b.totalTimeTaken || 99999);
    });

    participantsList.forEach((p, index) => {
      if (currentQuiz.participants[p.studentKey]) {
        currentQuiz.participants[p.studentKey].rank = index + 1;
      }
    });

    await updateDoc(LIVE_DOC_REF, {
      quizState: currentQuiz,
      updatedAt: serverTimestamp(),
    });

    cachedState = { ...cachedState, quizState: currentQuiz };
    return { success: true };
  } catch (err: any) {
    console.error('Failed to end live quiz:', err);
    return { success: false };
  }
}

export async function resetLiveQuiz(): Promise<{ success: boolean }> {
  try {
    await updateDoc(LIVE_DOC_REF, {
      quizState: null,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, quizState: null };
    return { success: true };
  } catch (err: any) {
    console.error('Failed to reset live quiz:', err);
    return { success: false };
  }
}

export async function submitStudentQuizAnswer(
  studentKey: string,
  payload: {
    username: string;
    studentName?: string;
    sheetNumber: string;
    questionIndex: number;
    questionText: string;
    answer: string;
    isCorrect: boolean;
    timeTaken: number;
    isRetry?: boolean;
    totalQuizQuestions: number;
  }
): Promise<{ success: boolean; student?: QuizStudentProgress }> {
  try {
    let savedStudent: QuizStudentProgress | null = null;
    let updatedQuizState: QuizActiveState | null = null;

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(LIVE_DOC_REF);
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const currentQuiz: QuizActiveState = data.quizState;
      if (!currentQuiz || !currentQuiz.isActive) return;

      const participants = { ...(currentQuiz.participants || {}) };
      let student = participants[studentKey];
      
      const actualQuizQuestions = Array.isArray(currentQuiz.questions) ? currentQuiz.questions.length : 0;
      const payloadQuestions = typeof payload.totalQuizQuestions === 'number' && payload.totalQuizQuestions > 0 ? payload.totalQuizQuestions : 0;
      const studentRecordedTotal = typeof student?.totalQuestions === 'number' && student.totalQuestions > 0 ? student.totalQuestions : 0;
      const trueTotalQuestions = Math.max(actualQuizQuestions, payloadQuestions, studentRecordedTotal, 1);

      if (!student) {
        student = {
          studentKey,
          username: payload.username.trim(),
          studentName: (payload.studentName || payload.username || studentKey).trim(),
          sheetNumber: (payload.sheetNumber || '').trim(),
          currentQuestionIndex: 0,
          answers: {},
          totalScore: 0,
          correctCount: 0,
          wrongCount: 0,
          totalQuestions: trueTotalQuestions,
          streak: 0,
          isFinished: false,
          totalTimeTaken: 0,
          wrongQuestionIndices: [],
        };
      } else {
        student.totalQuestions = trueTotalQuestions;
      }

      // Points calculation
      let points = 0;
      let newStreak = student.streak || 0;

      if (payload.isCorrect) {
        newStreak += 1;
        const basePoints = 1000;
        const speedBonus = Math.max(0, Math.round((30 - Math.min(payload.timeTaken, 30)) * 16.6));
        const streakBonus = Math.min((newStreak - 1) * 100, 500);
        points = payload.isRetry ? 500 : (basePoints + speedBonus + streakBonus);
      } else {
        newStreak = 0;
        points = 0;
      }

      const answerDetail: QuizStudentAnswerDetail = {
        questionIndex: payload.questionIndex,
        questionText: payload.questionText || '',
        answer: payload.answer || '',
        isCorrect: Boolean(payload.isCorrect),
        timeTaken: Number(payload.timeTaken) || 0,
        scoreEarned: points,
        isRetry: Boolean(payload.isRetry),
      };

      const updatedAnswers = { ...(student.answers || {}) };
      updatedAnswers[payload.questionIndex] = answerDetail;

      let updatedWrong = [...(student.wrongQuestionIndices || [])];
      if (!payload.isCorrect) {
        if (!updatedWrong.includes(payload.questionIndex)) {
          updatedWrong.push(payload.questionIndex);
        }
      } else if (payload.isRetry) {
        updatedWrong = updatedWrong.filter(idx => idx !== payload.questionIndex);
      }

      const newCorrectCount = Object.values(updatedAnswers).filter((a: any) => a.isCorrect).length;
      const newWrongCount = updatedWrong.length;
      const newTotalScore = Math.max(0, (student.totalScore || 0) + points);
      const newTotalTime = (student.totalTimeTaken || 0) + (Number(payload.timeTaken) || 0);
      const nextQIndex = payload.isRetry ? student.currentQuestionIndex : (student.currentQuestionIndex + 1);
      
      const totalAnswered = Object.keys(updatedAnswers).length;
      const isNowFinished = !payload.isRetry && 
        (totalAnswered >= trueTotalQuestions) && 
        (nextQIndex >= trueTotalQuestions);

      student = {
        ...student,
        currentQuestionIndex: nextQIndex,
        answers: updatedAnswers,
        totalScore: newTotalScore,
        streak: newStreak,
        correctCount: newCorrectCount,
        wrongCount: newWrongCount,
        totalTimeTaken: newTotalTime,
        wrongQuestionIndices: updatedWrong,
        isFinished: isNowFinished,
        finishTime: isNowFinished ? (student.finishTime || Date.now()) : null,
      };

      participants[studentKey] = student;

      // Recalculate leaderboard ranks
      const allParticipants = Object.values(participants);
      allParticipants.sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return (a.totalTimeTaken || 99999) - (b.totalTimeTaken || 99999);
      });

      allParticipants.forEach((p, idx) => {
        if (participants[p.studentKey]) {
          participants[p.studentKey].rank = idx + 1;
        }
      });

      currentQuiz.participants = participants;

      transaction.update(LIVE_DOC_REF, {
        quizState: currentQuiz,
        updatedAt: serverTimestamp(),
      });

      savedStudent = student;
      updatedQuizState = currentQuiz;
    });

    if (savedStudent && updatedQuizState) {
      cachedState = { ...cachedState, quizState: updatedQuizState };
      return { success: true, student: savedStudent };
    }
    return { success: false };
  } catch (err: any) {
    console.error('Failed to submit student quiz answer:', err);
    return { success: false };
  }
}

export async function markStudentQuizFinished(studentKey: string): Promise<{ success: boolean }> {
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(LIVE_DOC_REF);
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const currentQuiz = data.quizState as QuizActiveState;
      if (!currentQuiz || !currentQuiz.participants || !currentQuiz.participants[studentKey]) return;

      currentQuiz.participants[studentKey].isFinished = true;
      currentQuiz.participants[studentKey].finishTime = currentQuiz.participants[studentKey].finishTime || Date.now();

      transaction.update(LIVE_DOC_REF, {
        quizState: currentQuiz,
        updatedAt: serverTimestamp(),
      });
      cachedState = { ...cachedState, quizState: currentQuiz };
    });
    return { success: true };
  } catch (err: any) {
    console.error('Failed to mark quiz finished:', err);
    return { success: false };
  }
}

export async function setStudentQuizRetryMode(studentKey: string, inRetry: boolean): Promise<{ success: boolean }> {
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(LIVE_DOC_REF);
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const currentQuiz = data.quizState as QuizActiveState;
      if (!currentQuiz || !currentQuiz.participants || !currentQuiz.participants[studentKey]) return;

      currentQuiz.participants[studentKey].isInRetryRound = Boolean(inRetry);

      transaction.update(LIVE_DOC_REF, {
        quizState: currentQuiz,
        updatedAt: serverTimestamp(),
      });
      cachedState = { ...cachedState, quizState: currentQuiz };
    });
    return { success: true };
  } catch (err: any) {
    console.error('Failed to toggle retry mode:', err);
    return { success: false };
  }
}

export async function stopAllActiveBroadcasts(): Promise<{ success: boolean }> {
  try {
    const defaultStream = cachedState.streamState || defaultLiveStreamConfig;
    const streamOff = { ...defaultStream, isActive: false };
    await updateDoc(LIVE_DOC_REF, {
      isProgramActive: false,
      status: 'idle',
      currentQuestion: null,
      currentQuestionIndex: null,
      videoPlaying: false,
      quizState: null,
      streamState: streamOff,
      updatedAt: serverTimestamp(),
    });
    cachedState = {
      ...cachedState,
      isProgramActive: false,
      status: 'idle',
      currentQuestion: null,
      currentQuestionIndex: null,
      videoPlaying: false,
      quizState: null,
      streamState: streamOff,
    };
    return { success: true };
  } catch (err: any) {
    console.error('Failed to stop all active broadcasts:', err);
    return { success: false };
  }
}

// ==========================================
// --- LIVE STREAM & VDO.NINJA WEBRTC HELPERS ---
// ==========================================

export function generateStreamToken(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export async function updateLiveStreamState(
  streamConfig: Partial<LiveStreamConfig>
): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const currentStream = cachedState.streamState || defaultLiveStreamConfig;
    const merged: LiveStreamConfig = {
      ...currentStream,
      ...streamConfig,
      startedAt: streamConfig.isActive !== undefined 
        ? (streamConfig.isActive ? (currentStream.startedAt || Date.now()) : 0)
        : currentStream.startedAt,
    };

    await updateDoc(LIVE_DOC_REF, {
      streamState: merged,
      updatedAt: serverTimestamp(),
    });

    cachedState = { ...cachedState, streamState: merged };
    return { success: true, state: cachedState };
  } catch (error: any) {
    console.error('Failed to update live stream state in Firebase:', error);
    throw error;
  }
}

export async function toggleLiveStream(
  isActive: boolean
): Promise<{ success: boolean; state?: LiveSessionState }> {
  const currentStream = cachedState.streamState || defaultLiveStreamConfig;
  return updateLiveStreamState({
    ...currentStream,
    isActive,
    startedAt: isActive ? Date.now() : 0,
  });
}

export async function updateLiveCaption(
  caption: string,
  translations?: { th?: string; en?: string }
): Promise<void> {
  try {
    const currentStream = cachedState.streamState || defaultLiveStreamConfig;
    const merged = {
      ...currentStream,
      liveCaption: caption,
      liveCaptionTh: translations?.th !== undefined ? translations.th : (currentStream.liveCaptionTh || ''),
      liveCaptionEn: translations?.en !== undefined ? translations.en : (currentStream.liveCaptionEn || ''),
      liveCaptionUpdatedAt: Date.now(),
    };
    await updateDoc(LIVE_DOC_REF, {
      streamState: merged,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, streamState: merged };
  } catch (error) {
    console.warn('Failed to update live caption in Firebase:', error);
  }
}

export async function updateLiveSubtitleState(
  partial: Partial<LiveSubtitleState>
): Promise<{ success: boolean; state?: LiveSessionState }> {
  try {
    const currentSub = cachedState.subtitleState || defaultSubtitleState;
    const merged: LiveSubtitleState = {
      ...currentSub,
      ...partial,
      updatedAt: Date.now(),
    };
    await updateDoc(LIVE_DOC_REF, {
      subtitleState: merged,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, subtitleState: merged };
    return { success: true, state: cachedState };
  } catch (error) {
    console.warn('Failed to update live subtitle state in Firebase:', error);
    throw error;
  }
}

export async function setActiveScriptLine(
  line: ScriptSubtitleLine | null,
  extra?: Partial<LiveSubtitleState>
): Promise<void> {
  try {
    const currentSub = cachedState.subtitleState || defaultSubtitleState;
    const merged: LiveSubtitleState = {
      ...currentSub,
      ...extra,
      activeLineId: line ? line.id : '',
      activePage: line ? line.page : (extra?.activePage ?? currentSub.activePage ?? 1),
      activeLessonTitle: line ? (line.lessonTitle || '') : (extra?.activeLessonTitle ?? currentSub.activeLessonTitle ?? ''),
      activeArabic: line ? line.arabic : '',
      activeTh: line ? line.th : '',
      activeEn: line ? line.en : '',
      updatedAt: Date.now(),
    };
    await updateDoc(LIVE_DOC_REF, {
      subtitleState: merged,
      updatedAt: serverTimestamp(),
    });
    cachedState = { ...cachedState, subtitleState: merged };
  } catch (error) {
    console.warn('Failed to set active script line in Firebase:', error);
  }
}

export function subscribeToScriptSubtitles(
  onUpdate: (lines: ScriptSubtitleLine[]) => void
): () => void {
  return onSnapshot(
    SUBTITLES_DOC_REF,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const rawLines = Array.isArray(data?.lines) ? data.lines : [];
        onUpdate(
          rawLines.map((item: any, idx: number) => ({
            id: String(item.id || `line_${idx}`),
            lessonTitle: String(item.lessonTitle || '').trim(),
            page: Math.max(1, Number(item.page) || 1),
            order: typeof item.order === 'number' ? item.order : idx,
            arabic: String(item.arabic || '').trim(),
            th: String(item.th || '').trim(),
            en: String(item.en || '').trim(),
          }))
        );
      } else {
        onUpdate([]);
      }
    },
    (err) => {
      console.warn('Script subtitles snapshot listener warning:', err);
    }
  );
}

export async function getScriptSubtitles(): Promise<ScriptSubtitleLine[]> {
  try {
    const snap = await getDoc(SUBTITLES_DOC_REF);
    if (snap.exists()) {
      const data = snap.data();
      const rawLines = Array.isArray(data?.lines) ? data.lines : [];
      return rawLines.map((item: any, idx: number) => ({
        id: String(item.id || `line_${idx}`),
        lessonTitle: String(item.lessonTitle || '').trim(),
        page: Math.max(1, Number(item.page) || 1),
        order: typeof item.order === 'number' ? item.order : idx,
        arabic: String(item.arabic || '').trim(),
        th: String(item.th || '').trim(),
        en: String(item.en || '').trim(),
      }));
    }
    return [];
  } catch (err) {
    console.warn('Failed to get script subtitles from Firestore:', err);
    return [];
  }
}

export async function saveScriptSubtitles(lines: ScriptSubtitleLine[]): Promise<{ success: boolean }> {
  try {
    const sanitized = lines
      .filter((l) => (l.arabic || l.th || l.en).trim().length > 0)
      .map((l, idx) => ({
        id: l.id || `sub_${Date.now()}_${idx}`,
        lessonTitle: (l.lessonTitle || '').trim(),
        page: Math.max(1, Number(l.page) || 1),
        order: idx,
        arabic: (l.arabic || '').trim(),
        th: (l.th || '').trim(),
        en: (l.en || '').trim(),
      }));
    await setDoc(SUBTITLES_DOC_REF, {
      lines: sanitized,
      updatedAt: Date.now(),
      serverUpdatedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (err) {
    console.warn('Failed to save script subtitles to Firestore:', err);
    throw err;
  }
}

export const defaultAdminAccessConfig: AdminAccessConfig = {
  requireHomeLogin: true,
  requireAdminLogin: true,
  users: [],
  updatedAt: 0,
};

function sanitizeAdminUserList(rawUsers: any[]): AdminSheetUser[] {
  if (!Array.isArray(rawUsers)) return [];
  const normYesNo = (val: any, def: 'نعم' | 'لا'): 'نعم' | 'لا' => {
    const s = String(val ?? '').trim().toLowerCase();
    if (!s) return def;
    if (['لا', 'no', 'false', '0', 'غير مسموح', 'موقوف', 'معطل'].includes(s)) return 'لا';
    if (['نعم', 'yes', 'true', '1', 'مسموح', 'نشط', 'مفعل'].includes(s)) return 'نعم';
    return def;
  };
  return rawUsers
    .map((u: any, idx: number) => ({
      id: String(u.id || `adm_${idx}_${Date.now()}`),
      rowIndex: typeof u.rowIndex === 'number' ? u.rowIndex : idx + 2,
      name: String(u.name || u['الاسم'] || '').trim(),
      number: String(u.number ?? u.code ?? u['الرقم'] ?? '').trim(),
      allowHome: normYesNo(u.allowHome ?? u['الصفحة الرئيسية'], 'نعم'),
      allowAdmin: normYesNo(u.allowAdmin ?? u['لوحة التحكم'], 'لا'),
      status: normYesNo(u.status ?? u['الحالة'], 'نعم'),
      notes: String(u.notes ?? u['ملاحظات'] ?? '').trim(),
    }))
    .filter((u) => u.name.length > 0 && u.number.length > 0);
}

export function subscribeToAdminAccessConfig(
  onUpdate: (cfg: AdminAccessConfig) => void
): () => void {
  return onSnapshot(
    ADMIN_ACCESS_DOC_REF,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() || {};
        onUpdate({
          requireHomeLogin: data.requireHomeLogin !== false,
          requireAdminLogin: data.requireAdminLogin !== false,
          users: sanitizeAdminUserList(data.users),
          updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
        });
      } else {
        onUpdate({ ...defaultAdminAccessConfig });
      }
    },
    (err) => {
      console.warn('Admin access snapshot listener warning:', err);
    }
  );
}

export async function getAdminAccessConfig(): Promise<AdminAccessConfig> {
  try {
    const snap = await getDoc(ADMIN_ACCESS_DOC_REF);
    if (snap.exists()) {
      const data = snap.data() || {};
      return {
        requireHomeLogin: data.requireHomeLogin !== false,
        requireAdminLogin: data.requireAdminLogin !== false,
        users: sanitizeAdminUserList(data.users),
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
      };
    }
    return { ...defaultAdminAccessConfig };
  } catch (err) {
    console.warn('Failed to get admin access config from Firestore:', err);
    return { ...defaultAdminAccessConfig };
  }
}

export async function saveAdminAccessConfig(
  partial: Partial<AdminAccessConfig>
): Promise<{ success: boolean }> {
  try {
    const existing = await getAdminAccessConfig();
    const merged: AdminAccessConfig = {
      requireHomeLogin:
        partial.requireHomeLogin !== undefined
          ? partial.requireHomeLogin
          : existing.requireHomeLogin,
      requireAdminLogin:
        partial.requireAdminLogin !== undefined
          ? partial.requireAdminLogin
          : existing.requireAdminLogin,
      users:
        partial.users !== undefined
          ? sanitizeAdminUserList(partial.users)
          : existing.users,
      updatedAt: Date.now(),
    };
    await setDoc(ADMIN_ACCESS_DOC_REF, {
      ...merged,
      serverUpdatedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (err) {
    console.warn('Failed to save admin access config to Firestore:', err);
    throw err;
  }
}

// ==========================================
// --- LIVE VOTING & AUDIENCE POLLS SERVICE ---
// ==========================================

export const DEFAULT_VOTE_PRESET_OPTION_SETS: VotePresetOptionSet[] = [
  {
    id: 'yes_no',
    name: 'نعم / لا',
    nameI18n: { ar: 'نعم / لا', th: 'ใช่ / ไม่ใช่', en: 'Yes / No' },
    options: [
      { id: 'opt_yes', label: 'نعم', i18n: { ar: 'نعم', th: 'ใช่', en: 'Yes' }, color: 'emerald' },
      { id: 'opt_no', label: 'لا', i18n: { ar: 'لا', th: 'ไม่ใช่', en: 'No' }, color: 'rose' },
    ],
  },
  {
    id: 'gender',
    name: 'ذكر / أنثى',
    nameI18n: { ar: 'ذكر / أنثى', th: 'ชาย / หญิง', en: 'Male / Female' },
    options: [
      { id: 'opt_male', label: 'ذكر', i18n: { ar: 'ذكر', th: 'ชาย', en: 'Male' }, color: 'sky' },
      { id: 'opt_female', label: 'أنثى', i18n: { ar: 'أنثى', th: 'หญิง', en: 'Female' }, color: 'purple' },
    ],
  },
  {
    id: 'agree_disagree',
    name: 'موافق / غير موافق',
    nameI18n: { ar: 'موافق / غير موافق', th: 'เห็นด้วย / ไม่เห็นด้วย', en: 'Agree / Disagree' },
    options: [
      { id: 'opt_agree', label: 'موافق', i18n: { ar: 'موافق', th: 'เห็นด้วย', en: 'Agree' }, color: 'emerald' },
      { id: 'opt_disagree', label: 'غير موافق', i18n: { ar: 'غير موافق', th: 'ไม่เห็นด้วย', en: 'Disagree' }, color: 'rose' },
    ],
  },
  {
    id: 'clear_repeat',
    name: 'واضح / أعد الشرح',
    nameI18n: { ar: 'واضح / أعد الشرح', th: 'เข้าใจแล้ว / อธิบายอีกครั้ง', en: 'Clear / Explain Again' },
    options: [
      { id: 'opt_clear', label: 'واضح', i18n: { ar: 'واضح', th: 'เข้าใจแล้ว', en: 'Clear' }, color: 'emerald' },
      { id: 'opt_repeat', label: 'أعد الشرح', i18n: { ar: 'أعد الشرح', th: 'อธิบายอีกครั้ง', en: 'Explain Again' }, color: 'amber' },
    ],
  },
  {
    id: 'rating_3',
    name: 'ممتاز / جيد / يحتاج تحسين',
    nameI18n: { ar: 'ممتاز / جيد / يحتاج تحسين', th: 'ดีเยี่ยม / ดี / ควรปรับปรุง', en: 'Excellent / Good / Needs Improvement' },
    options: [
      { id: 'opt_exc', label: 'ممتاز', i18n: { ar: 'ممتاز', th: 'ดีเยี่ยม', en: 'Excellent' }, color: 'emerald' },
      { id: 'opt_good', label: 'جيد', i18n: { ar: 'جيد', th: 'ดี', en: 'Good' }, color: 'sky' },
      { id: 'opt_imp', label: 'يحتاج تحسين', i18n: { ar: 'يحتاج تحسين', th: 'ควรปรับปรุง', en: 'Needs Improvement' }, color: 'amber' },
    ],
  },
  {
    id: 'numbers_4',
    name: '1 / 2 / 3 / 4',
    nameI18n: { ar: '1 / 2 / 3 / 4', th: '1 / 2 / 3 / 4', en: '1 / 2 / 3 / 4' },
    options: [
      { id: 'opt_1', label: '1', i18n: { ar: '1', th: '1', en: '1' }, color: 'sky' },
      { id: 'opt_2', label: '2', i18n: { ar: '2', th: '2', en: '2' }, color: 'emerald' },
      { id: 'opt_3', label: '3', i18n: { ar: '3', th: '3', en: '3' }, color: 'amber' },
      { id: 'opt_4', label: '4', i18n: { ar: '4', th: '4', en: '4' }, color: 'purple' },
    ],
  },
];

export const DEFAULT_VOTE_PRESET_QUESTIONS: VotePresetQuestion[] = [
  {
    id: 'pq_clear',
    text: 'هل الشرح واضح ومفهوم؟',
    i18n: { ar: 'هل الشرح واضح ومفهوم؟', th: 'คำอธิบายชัดเจนและเข้าใจง่ายหรือไม่?', en: 'Is the explanation clear and easy to understand?' },
    defaultOptionSetId: 'yes_no',
  },
  {
    id: 'pq_next',
    text: 'هل ننتقل للفقرة التالية؟',
    i18n: { ar: 'هل ننتقل للفقرة التالية؟', th: 'เราควรไปหัวข้อถัดไปเลยหรือไม่?', en: 'Should we move on to the next section?' },
    defaultOptionSetId: 'yes_no',
  },
  {
    id: 'pq_gender',
    text: 'اختر الجنس للتقييم الصحيح',
    i18n: { ar: 'اختر الجنس للتقييم الصحيح', th: 'เลือกเพศเพื่อการประเมินที่ถูกต้อง', en: 'Select gender for accurate evaluation' },
    defaultOptionSetId: 'gender',
  },
  {
    id: 'pq_level',
    text: 'ما تقييمكم للدرس والتمرين؟',
    i18n: { ar: 'ما تقييمكم للدرس والتمرين؟', th: 'คุณประเมินบทเรียนและแบบฝึกหัดนี้อย่างไร?', en: 'How do you rate this lesson and exercise?' },
    defaultOptionSetId: 'rating_3',
  },
  {
    id: 'pq_audio',
    text: 'هل الصوت والصورة واضحان؟',
    i18n: { ar: 'هل الصوت والصورة واضحان؟', th: 'เสียงและภาพชัดเจนหรือไม่?', en: 'Are the audio and video clear?' },
    defaultOptionSetId: 'yes_no',
  },
  {
    id: 'pq_agree',
    text: 'هل توافقون على هذا المقترح؟',
    i18n: { ar: 'هل توافقون على هذا المقترح؟', th: 'คุณเห็นด้วยกับข้อเสนอนี้หรือไม่?', en: 'Do you agree with this proposal?' },
    defaultOptionSetId: 'agree_disagree',
  },
];

export const DEFAULT_VOTE_EXTRA_GROUPS: VoteExtraGroup[] = [
  {
    id: 'extra_gender',
    name: 'ذكر / أنثى',
    nameI18n: { ar: 'ذكر / أنثى', th: 'ชาย / หญิง', en: 'Male / Female' },
    required: true,
    items: [
      { id: 'ex_male', label: 'ذكر', i18n: { ar: 'ذكر', th: 'ชาย', en: 'Male' }, inputType: 'choice', color: 'sky' },
      { id: 'ex_female', label: 'أنثى', i18n: { ar: 'أنثى', th: 'หญิง', en: 'Female' }, inputType: 'choice', color: 'rose' },
    ],
  },
  {
    id: 'extra_age_group',
    name: 'العمر (صغير / كبير)',
    nameI18n: { ar: 'العمر (صغير / كبير)', th: 'อายุ (เด็ก / ผู้ใหญ่)', en: 'Age (Young / Adult)' },
    required: true,
    items: [
      { id: 'ex_young', label: 'صغير', i18n: { ar: 'صغير', th: 'เด็ก', en: 'Young' }, inputType: 'choice', color: 'amber' },
      { id: 'ex_adult', label: 'كبير', i18n: { ar: 'كبير', th: 'ผู้ใหญ่', en: 'Adult' }, inputType: 'choice', color: 'purple' },
    ],
  },
  {
    id: 'extra_age_number',
    name: 'العمر (إضافة عدد)',
    nameI18n: { ar: 'العمر (إضافة عدد)', th: 'อายุ (กรอกตัวเลข)', en: 'Age (Enter Number)' },
    required: true,
    items: [
      { id: 'ex_age_num', label: 'العمر', i18n: { ar: 'العمر', th: 'อายุ', en: 'Age' }, inputType: 'number', color: 'sky', splitAt: 18 },
    ],
  },
  {
    id: 'extra_gender_age',
    name: 'ذكر / أنثى + العمر (عدد)',
    nameI18n: { ar: 'ذكر / أنثى + العمر (عدد)', th: 'ชาย / หญิง + อายุ (ตัวเลข)', en: 'Male / Female + Age (Number)' },
    required: true,
    items: [
      { id: 'ex_ga_male', label: 'ذكر', i18n: { ar: 'ذكر', th: 'ชาย', en: 'Male' }, inputType: 'choice', color: 'sky' },
      { id: 'ex_ga_female', label: 'أنثى', i18n: { ar: 'أنثى', th: 'หญิง', en: 'Female' }, inputType: 'choice', color: 'rose' },
      { id: 'ex_ga_age', label: 'العمر', i18n: { ar: 'العمر', th: 'อายุ', en: 'Age' }, inputType: 'number', color: 'amber', splitAt: 18 },
    ],
  },
];

export const defaultVotingConfigState: VotingConfigState = {
  activePoll: {
    roundId: 'poll_initial',
    question: DEFAULT_VOTE_PRESET_QUESTIONS[0].text,
    questionI18n: DEFAULT_VOTE_PRESET_QUESTIONS[0].i18n,
    options: DEFAULT_VOTE_PRESET_OPTION_SETS[0].options,
    extraGroups: [],
    primaryChartType: 'horizontal_bar',
    extraChartType: 'horizontal_bar',
    status: 'idle',
    showResultsToVoters: false,
    showOnBigScreen: true,
    allowChangeVote: false,
    startedAt: null,
    closedAt: null,
    exitedAt: null,
  },
  presetQuestions: DEFAULT_VOTE_PRESET_QUESTIONS,
  presetOptionSets: DEFAULT_VOTE_PRESET_OPTION_SETS,
  presetExtraGroups: DEFAULT_VOTE_EXTRA_GROUPS,
  updatedAt: 0,
};

export function getGuestVoterId(): string {
  try {
    const existing = localStorage.getItem('liveVoteGuestToken');
    if (existing && existing.trim().length > 4) return existing.trim();
    const generated = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('liveVoteGuestToken', generated);
    return generated;
  } catch {
    return `guest_${Date.now().toString(36)}`;
  }
}

export function getStudentVoterId(username: string, sheetNumber?: string): string {
  const safeName = normalizeArabicText(username || 'student').replace(/[^a-z0-9\u0600-\u06FF]+/gi, '_') || 'student';
  const safeSheet = String(sheetNumber || '').trim().replace(/[^a-z0-9]+/gi, '');
  return safeSheet ? `stu_${safeName}_${safeSheet}` : `stu_${safeName}`;
}

function sanitizeChartType(val: any): VoteChartType {
  if (val === 'numbers' || val === 'horizontal_bar' || val === 'vertical_bar' || val === 'donut') {
    return val;
  }
  return 'horizontal_bar';
}

function sanitizeVoteI18n(raw: any): { ar?: string; th?: string; en?: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: { ar?: string; th?: string; en?: string } = {};
  if (typeof raw.ar === 'string' && raw.ar.trim()) out.ar = raw.ar.trim();
  if (typeof raw.th === 'string' && raw.th.trim()) out.th = raw.th.trim();
  if (typeof raw.en === 'string' && raw.en.trim()) out.en = raw.en.trim();
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeExtraGroups(rawGroups: any): VoteExtraGroup[] {
  if (!Array.isArray(rawGroups)) return [];
  return rawGroups
    .map((g: any, gIdx: number) => {
      const nameI18n = sanitizeVoteI18n(g?.nameI18n);
      const grp: VoteExtraGroup = {
        id: String(g?.id || `extra_grp_${gIdx + 1}`),
        name: String(g?.name || '').trim(),
        required: g?.required !== false,
        items: Array.isArray(g?.items)
          ? g.items
              .map((it: any, iIdx: number): VoteExtraItem => {
                const itI18n = sanitizeVoteI18n(it?.i18n);
                return {
                  id: String(it?.id || `ex_it_${iIdx + 1}`),
                  label: String(it?.label || '').trim(),
                  inputType: it?.inputType === 'number' ? 'number' : 'choice',
                  color: it?.color || 'sky',
                  ...(itI18n ? { i18n: itI18n } : {}),
                  ...(typeof it?.splitAt === 'number' && !isNaN(it.splitAt) ? { splitAt: it.splitAt } : {}),
                };
              })
              .filter((it: VoteExtraItem) => it.label.length > 0)
          : [],
      };
      if (nameI18n) grp.nameI18n = nameI18n;
      if (g?.isCustom !== undefined) grp.isCustom = Boolean(g.isCustom);
      return grp;
    })
    .filter((g: VoteExtraGroup) => g.name.length > 0 && g.items.length > 0);
}

function sanitizeVotingState(data: any): VotingConfigState {
  const rawPoll = data?.activePoll || {};
  const rawOptions: VoteOption[] = Array.isArray(rawPoll.options) && rawPoll.options.length > 0
    ? rawPoll.options.map((o: any, idx: number) => {
        const i18n = sanitizeVoteI18n(o?.i18n);
        return {
          id: String(o.id || `opt_${idx + 1}`),
          label: String(o.label || '').trim(),
          color: o.color || 'emerald',
          ...(i18n ? { i18n } : {}),
        };
      }).filter((o: VoteOption) => o.label.length > 0)
    : DEFAULT_VOTE_PRESET_OPTION_SETS[0].options;

  const presetQuestions: VotePresetQuestion[] = Array.isArray(data?.presetQuestions) && data.presetQuestions.length > 0
    ? data.presetQuestions
    : DEFAULT_VOTE_PRESET_QUESTIONS;

  const presetOptionSets: VotePresetOptionSet[] = Array.isArray(data?.presetOptionSets) && data.presetOptionSets.length > 0
    ? data.presetOptionSets
    : DEFAULT_VOTE_PRESET_OPTION_SETS;

  const presetExtraGroups: VoteExtraGroup[] = Array.isArray(data?.presetExtraGroups)
    ? (data.presetExtraGroups.length > 0 ? sanitizeExtraGroups(data.presetExtraGroups) : [])
    : DEFAULT_VOTE_EXTRA_GROUPS;

  const validStatus =
    rawPoll.status === 'active' ||
    rawPoll.status === 'closed' ||
    rawPoll.status === 'exited'
      ? rawPoll.status
      : 'idle';

  const qI18n = sanitizeVoteI18n(rawPoll.questionI18n);

  return {
    activePoll: {
      roundId: String(rawPoll.roundId || 'poll_initial'),
      question: String(rawPoll.question || DEFAULT_VOTE_PRESET_QUESTIONS[0].text),
      ...(qI18n ? { questionI18n: qI18n } : {}),
      options: rawOptions,
      extraGroups: sanitizeExtraGroups(rawPoll.extraGroups),
      primaryChartType: sanitizeChartType(rawPoll.primaryChartType),
      extraChartType: sanitizeChartType(rawPoll.extraChartType),
      status: validStatus,
      showResultsToVoters: Boolean(rawPoll.showResultsToVoters),
      showOnBigScreen: rawPoll.showOnBigScreen !== false,
      allowChangeVote: Boolean(rawPoll.allowChangeVote),
      startedAt: typeof rawPoll.startedAt === 'number' ? rawPoll.startedAt : null,
      closedAt: typeof rawPoll.closedAt === 'number' ? rawPoll.closedAt : null,
      exitedAt: typeof rawPoll.exitedAt === 'number' ? rawPoll.exitedAt : null,
    },
    presetQuestions,
    presetOptionSets,
    presetExtraGroups,
    updatedAt: typeof data?.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

export function subscribeToVotingConfig(
  onUpdate: (state: VotingConfigState) => void
): () => void {
  return onSnapshot(
    VOTING_DOC_REF,
    (snap) => {
      if (snap.exists()) {
        onUpdate(sanitizeVotingState(snap.data()));
      } else {
        onUpdate({ ...defaultVotingConfigState });
      }
    },
    (err) => {
      console.warn('Voting config snapshot warning:', err);
    }
  );
}

export async function getVotingConfig(): Promise<VotingConfigState> {
  try {
    const snap = await getDoc(VOTING_DOC_REF);
    if (snap.exists()) {
      return sanitizeVotingState(snap.data());
    }
    return { ...defaultVotingConfigState };
  } catch {
    return { ...defaultVotingConfigState };
  }
}

export function subscribeToVotingRoundActivity(
  roundId: string,
  onUpdate: (data: {
    participants: VoteParticipantRecord[];
    votes: VoteSubmissionRecord[];
  }) => void
): () => void {
  if (!roundId) {
    onUpdate({ participants: [], votes: [] });
    return () => {};
  }

  let latestParticipants: VoteParticipantRecord[] = [];
  let latestVotes: VoteSubmissionRecord[] = [];

  const emit = () => {
    onUpdate({
      participants: latestParticipants,
      votes: latestVotes,
    });
  };

  const pQuery = query(VOTING_PARTICIPANTS_COL, where('roundId', '==', roundId));
  const vQuery = query(VOTING_VOTES_COL, where('roundId', '==', roundId));

  const unsubP = onSnapshot(
    pQuery,
    (snap) => {
      latestParticipants = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      emit();
    },
    (err) => console.warn('Voting participants listener warning:', err)
  );

  const unsubV = onSnapshot(
    vQuery,
    (snap) => {
      latestVotes = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      emit();
    },
    (err) => console.warn('Voting votes listener warning:', err)
  );

  return () => {
    unsubP();
    unsubV();
  };
}

export async function startOrUpdatePoll(params: {
  question: string;
  questionI18n?: { ar?: string; th?: string; en?: string };
  options: VoteOption[];
  extraGroups?: VoteExtraGroup[];
  primaryChartType?: VoteChartType;
  extraChartType?: VoteChartType;
  showResultsToVoters?: boolean;
  showOnBigScreen?: boolean;
  allowChangeVote?: boolean;
  newRound?: boolean;
}): Promise<{ success: boolean; roundId: string }> {
  const existing = await getVotingConfig();
  const nextQuestion = String(params.question || '').trim() || DEFAULT_VOTE_PRESET_QUESTIONS[0].text;
  const cleanOptions: VoteOption[] = (params.options || [])
    .map((o, i) => {
      const i18n = sanitizeVoteI18n(o.i18n);
      return {
        id: o.id || `opt_${i + 1}`,
        label: String(o.label || '').trim(),
        color: o.color || 'emerald',
        ...(i18n ? { i18n } : {}),
      };
    })
    .filter((o) => o.label.length > 0);
  const effectiveOptions = cleanOptions.length > 0 ? cleanOptions : DEFAULT_VOTE_PRESET_OPTION_SETS[0].options;
  const effectiveExtraGroups = params.extraGroups !== undefined
    ? sanitizeExtraGroups(params.extraGroups)
    : sanitizeExtraGroups(existing.activePoll.extraGroups);

  // Detect if question or options or extraGroups changed compared to active poll -> always start fresh round!
  const questionChanged = nextQuestion !== String(existing.activePoll.question || '').trim();
  const optionsSignatureNew = effectiveOptions.map((o) => `${o.id}:${o.label}`).join('|');
  const optionsSignatureOld = (existing.activePoll.options || []).map((o) => `${o.id}:${o.label}`).join('|');
  const optionsChanged = optionsSignatureNew !== optionsSignatureOld;
  const extrasSigNew = effectiveExtraGroups.map((g) => `${g.id}:${g.items.map((i) => i.id).join(',')}`).join('|');
  const extrasSigOld = (existing.activePoll.extraGroups || []).map((g) => `${g.id}:${g.items.map((i) => i.id).join(',')}`).join('|');
  const extrasChanged = extrasSigNew !== extrasSigOld;

  const shouldStartFreshRound =
    Boolean(params.newRound) ||
    existing.activePoll.status !== 'active' ||
    questionChanged ||
    optionsChanged ||
    extrasChanged;

  const roundId = shouldStartFreshRound
    ? `poll_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    : existing.activePoll.roundId;

  const qI18n = sanitizeVoteI18n(params.questionI18n) || (questionChanged ? undefined : sanitizeVoteI18n(existing.activePoll.questionI18n));

  const nextPoll: ActivePollState = {
    roundId,
    question: nextQuestion,
    ...(qI18n ? { questionI18n: qI18n } : {}),
    options: effectiveOptions,
    extraGroups: effectiveExtraGroups,
    primaryChartType: params.primaryChartType || existing.activePoll.primaryChartType || 'horizontal_bar',
    extraChartType: params.extraChartType || existing.activePoll.extraChartType || 'horizontal_bar',
    status: 'active',
    showResultsToVoters:
      params.showResultsToVoters !== undefined
        ? params.showResultsToVoters
        : existing.activePoll.showResultsToVoters,
    showOnBigScreen:
      params.showOnBigScreen !== undefined
        ? params.showOnBigScreen
        : existing.activePoll.showOnBigScreen,
    allowChangeVote:
      params.allowChangeVote !== undefined
        ? params.allowChangeVote
        : existing.activePoll.allowChangeVote,
    startedAt: shouldStartFreshRound ? Date.now() : (existing.activePoll.startedAt || Date.now()),
    closedAt: null,
    exitedAt: null,
  };

  await setDoc(VOTING_DOC_REF, {
    ...existing,
    activePoll: nextPoll,
    updatedAt: Date.now(),
    serverUpdatedAt: serverTimestamp(),
  });

  return { success: true, roundId };
}

export async function closeActivePoll(): Promise<{ success: boolean }> {
  const existing = await getVotingConfig();
  await setDoc(VOTING_DOC_REF, {
    ...existing,
    activePoll: {
      ...existing.activePoll,
      status: 'closed',
      closedAt: Date.now(),
    },
    updatedAt: Date.now(),
    serverUpdatedAt: serverTimestamp(),
  });
  return { success: true };
}

export async function resetPollRound(keepIdle: boolean = false): Promise<{ success: boolean; roundId: string }> {
  const existing = await getVotingConfig();
  const nextRoundId = `poll_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await setDoc(VOTING_DOC_REF, {
    ...existing,
    activePoll: {
      ...existing.activePoll,
      roundId: nextRoundId,
      status: keepIdle ? 'idle' : 'active',
      startedAt: keepIdle ? null : Date.now(),
      closedAt: null,
      exitedAt: null,
    },
    updatedAt: Date.now(),
    serverUpdatedAt: serverTimestamp(),
  });
  return { success: true, roundId: nextRoundId };
}

export async function exitAndResetVotingSession(): Promise<{ success: boolean; roundId: string }> {
  const existing = await getVotingConfig();
  const nextRoundId = `poll_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();
  await setDoc(VOTING_DOC_REF, {
    ...existing,
    activePoll: {
      ...existing.activePoll,
      roundId: nextRoundId,
      status: 'exited',
      closedAt: now,
      exitedAt: now,
    },
    updatedAt: now,
    serverUpdatedAt: serverTimestamp(),
  });
  return { success: true, roundId: nextRoundId };
}

export async function updateVotingSettings(
  partial: Partial<
    Pick<
      ActivePollState,
      | 'showResultsToVoters'
      | 'showOnBigScreen'
      | 'allowChangeVote'
      | 'question'
      | 'options'
      | 'extraGroups'
      | 'primaryChartType'
      | 'extraChartType'
    >
  >
): Promise<{ success: boolean }> {
  const existing = await getVotingConfig();
  await setDoc(VOTING_DOC_REF, {
    ...existing,
    activePoll: {
      ...existing.activePoll,
      ...partial,
    },
    updatedAt: Date.now(),
    serverUpdatedAt: serverTimestamp(),
  });
  return { success: true };
}

export async function saveVotingPresets(
  presetQuestions: VotePresetQuestion[],
  presetOptionSets: VotePresetOptionSet[],
  presetExtraGroups?: VoteExtraGroup[]
): Promise<{ success: boolean }> {
  const existing = await getVotingConfig();
  await setDoc(VOTING_DOC_REF, {
    ...existing,
    presetQuestions,
    presetOptionSets,
    presetExtraGroups:
      presetExtraGroups !== undefined
        ? sanitizeExtraGroups(presetExtraGroups)
        : (existing.presetExtraGroups || DEFAULT_VOTE_EXTRA_GROUPS),
    updatedAt: Date.now(),
    serverUpdatedAt: serverTimestamp(),
  });
  return { success: true };
}

export async function registerVoteParticipant(
  roundId: string,
  voter: {
    voterId: string;
    voterType: 'student' | 'guest';
    name?: string;
    sheetNumber?: string;
  }
): Promise<void> {
  if (!roundId || !voter.voterId) return;
  const docId = `${roundId}_${voter.voterId}`.replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
  const now = Date.now();
  try {
    const ref = doc(db, 'live_sessions', 'voting', 'participants', docId);
    await setDoc(
      ref,
      {
        roundId,
        voterId: voter.voterId,
        voterType: voter.voterType,
        name: voter.name || '',
        sheetNumber: voter.sheetNumber || '',
        joinedAt: now,
        lastSeen: now,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('registerVoteParticipant warning:', err);
  }
}

export async function submitVoteChoice(
  roundId: string,
  voter: {
    voterId: string;
    voterType: 'student' | 'guest';
    name?: string;
    sheetNumber?: string;
  },
  option: VoteOption,
  allowChangeVote: boolean = false,
  extraPayload?: {
    extraChoices?: Record<string, { itemId: string; label: string }>;
    extraNumbers?: Record<string, number>;
    extraCompleted?: boolean;
  }
): Promise<{ success: boolean; alreadyVoted?: boolean }> {
  if (!roundId || !voter.voterId || !option?.id) {
    return { success: false };
  }
  const docId = `${roundId}_${voter.voterId}`.replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
  const voteRef = doc(db, 'live_sessions', 'voting', 'votes', docId);
  const partRef = doc(db, 'live_sessions', 'voting', 'participants', docId);
  const now = Date.now();

  if (!allowChangeVote) {
    const existingSnap = await getDoc(voteRef);
    if (existingSnap.exists()) {
      return { success: false, alreadyVoted: true };
    }
  }

  await Promise.all([
    setDoc(
      partRef,
      {
        roundId,
        voterId: voter.voterId,
        voterType: voter.voterType,
        name: voter.name || '',
        sheetNumber: voter.sheetNumber || '',
        joinedAt: now,
        lastSeen: now,
      },
      { merge: true }
    ),
    setDoc(
      voteRef,
      {
        roundId,
        voterId: voter.voterId,
        voterType: voter.voterType,
        name: voter.name || '',
        sheetNumber: voter.sheetNumber || '',
        optionId: option.id,
        optionLabel: option.label,
        extraChoices: extraPayload?.extraChoices || {},
        extraNumbers: extraPayload?.extraNumbers || {},
        extraCompleted: extraPayload?.extraCompleted !== undefined ? extraPayload.extraCompleted : true,
        votedAt: now,
      },
      { merge: true }
    ),
  ]);

  return { success: true };
}

export async function submitVoteExtraDetails(
  roundId: string,
  voter: {
    voterId: string;
    voterType: 'student' | 'guest';
    name?: string;
    sheetNumber?: string;
  },
  extraPayload: {
    extraChoices: Record<string, { itemId: string; label: string }>;
    extraNumbers: Record<string, number>;
    extraCompleted: boolean;
  }
): Promise<{ success: boolean }> {
  if (!roundId || !voter.voterId) return { success: false };
  const docId = `${roundId}_${voter.voterId}`.replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
  const voteRef = doc(db, 'live_sessions', 'voting', 'votes', docId);

  await setDoc(
    voteRef,
    {
      extraChoices: extraPayload.extraChoices || {},
      extraNumbers: extraPayload.extraNumbers || {},
      extraCompleted: extraPayload.extraCompleted,
    },
    { merge: true }
  );

  return { success: true };
}




