import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { Readable } from "stream";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));
  app.use(express.raw({ type: 'application/pdf', limit: '100mb' }));

  // ==========================================
  // --- IN-MEMORY REALTIME LIVE CLASS STATE ---
  // ==========================================
  interface LiveQuestionPayload {
    index: number;
    time: number;
    timeFormatted?: string;
    question: string;
    options: string[];
    isTextAnswer?: boolean;
    correctAnswer: string;
    image?: string;
  }

  interface LiveConnectedStudent {
    username: string;
    sheetNumber: string;
    joinedAt: number;
    lastPing: number;
    pinVerified?: boolean;
  }

  interface LiveStudentAnswerSubmission {
    username: string;
    sheetNumber: string;
    answer: string;
    isCorrect?: boolean | null;
    submittedAt: number;
  }

  interface LiveChannelState {
    lessonTitle: string;
    videoUrl?: string;
    videoPlaying?: boolean;
    explanationText?: string;
    status: 'idle' | 'waiting' | 'playing' | 'question_active' | 'revealed' | 'finished' | 'program_ended' | 'direct_explanation';
    currentQuestionIndex: number | null;
    currentQuestion: LiveQuestionPayload | null;
    questionTriggeredAt: number | null;
    timeLimit: number;
    showResult: 'نعم' | 'لا';
    answersForCurrentQuestion: Record<string, LiveStudentAnswerSubmission>;
    allSessionAnswers: Record<string, Record<number, string>>;
    lessonAnswers: Record<string, Record<string, Record<number, string>>>;
  }

  function generatePinCode(): string {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  const BACKUP_FILE = path.join(process.cwd(), '.live_session_backup.json');

  let videoChannel: LiveChannelState = {
    lessonTitle: '',
    videoUrl: '',
    videoPlaying: false,
    status: 'idle',
    currentQuestionIndex: null,
    currentQuestion: null,
    questionTriggeredAt: null,
    timeLimit: 30,
    showResult: 'نعم',
    answersForCurrentQuestion: {},
    allSessionAnswers: {},
    lessonAnswers: {},
  };

  let directChannel: LiveChannelState = {
    lessonTitle: '',
    explanationText: '',
    status: 'idle',
    currentQuestionIndex: null,
    currentQuestion: null,
    questionTriggeredAt: null,
    timeLimit: 30,
    showResult: 'نعم',
    answersForCurrentQuestion: {},
    allSessionAnswers: {},
    lessonAnswers: {},
  };

  let currentLiveSession = {
    sessionId: 'live-main',
    sessionPin: '1234',
    isProgramActive: false,
    mode: 'video' as 'video' | 'direct',
    lessonTitle: '',
    videoLessonTitle: '',
    directLessonTitle: '',
    videoUrl: '',
    status: 'idle' as 'idle' | 'waiting' | 'playing' | 'question_active' | 'revealed' | 'finished' | 'program_ended' | 'direct_explanation',
    currentQuestionIndex: null as number | null,
    currentQuestion: null as LiveQuestionPayload | null,
    questionTriggeredAt: null as number | null,
    timeLimit: 30,
    showResult: 'نعم' as 'نعم' | 'لا',
    connectedStudents: [] as LiveConnectedStudent[],
    answersForCurrentQuestion: {} as Record<string, LiveStudentAnswerSubmission>,
    allSessionAnswers: {} as Record<string, Record<number, string>>,
    videoAnswers: {} as Record<string, Record<string, Record<number, string>>>,
    directAnswers: {} as Record<string, Record<string, Record<number, string>>>,
    videoChannel: {} as any,
    directChannel: {} as any,
  };

  function syncCurrentLiveSession() {
    const isDirect = currentLiveSession.mode === 'direct';
    const activeChan = isDirect ? directChannel : videoChannel;

    currentLiveSession.videoLessonTitle = videoChannel.lessonTitle;
    currentLiveSession.directLessonTitle = directChannel.lessonTitle;
    currentLiveSession.lessonTitle = activeChan.lessonTitle || (isDirect ? directChannel.lessonTitle : videoChannel.lessonTitle);
    currentLiveSession.videoUrl = videoChannel.videoUrl || '';
    currentLiveSession.status = activeChan.status;
    currentLiveSession.currentQuestionIndex = activeChan.currentQuestionIndex;
    currentLiveSession.currentQuestion = activeChan.currentQuestion;
    currentLiveSession.questionTriggeredAt = activeChan.questionTriggeredAt;
    currentLiveSession.timeLimit = activeChan.timeLimit;
    currentLiveSession.showResult = activeChan.showResult;
    currentLiveSession.answersForCurrentQuestion = activeChan.answersForCurrentQuestion;
    currentLiveSession.allSessionAnswers = activeChan.allSessionAnswers;
    currentLiveSession.videoAnswers = videoChannel.lessonAnswers;
    currentLiveSession.directAnswers = directChannel.lessonAnswers;

    currentLiveSession.videoChannel = {
      lessonTitle: videoChannel.lessonTitle,
      videoUrl: videoChannel.videoUrl,
      videoPlaying: videoChannel.videoPlaying,
      status: videoChannel.status,
      currentQuestionIndex: videoChannel.currentQuestionIndex,
      currentQuestion: videoChannel.currentQuestion,
      questionTriggeredAt: videoChannel.questionTriggeredAt,
      timeLimit: videoChannel.timeLimit,
      showResult: videoChannel.showResult,
      answersForCurrentQuestion: videoChannel.answersForCurrentQuestion,
      allSessionAnswers: videoChannel.allSessionAnswers,
    };

    currentLiveSession.directChannel = {
      lessonTitle: directChannel.lessonTitle,
      status: directChannel.status,
      currentQuestionIndex: directChannel.currentQuestionIndex,
      currentQuestion: directChannel.currentQuestion,
      questionTriggeredAt: directChannel.questionTriggeredAt,
      timeLimit: directChannel.timeLimit,
      showResult: directChannel.showResult,
      answersForCurrentQuestion: directChannel.answersForCurrentQuestion,
      allSessionAnswers: directChannel.allSessionAnswers,
    };
  }

  function saveBackup() {
    try {
      syncCurrentLiveSession();
      const dataToSave = {
        savedAt: new Date().toISOString(),
        session: currentLiveSession,
        videoChannel,
        directChannel,
      };
      fs.writeFileSync(BACKUP_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Failed to save session backup:', err);
    }
  }

  function loadBackup() {
    try {
      if (fs.existsSync(BACKUP_FILE)) {
        const raw = fs.readFileSync(BACKUP_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.session) {
          if (parsed.videoChannel) videoChannel = parsed.videoChannel;
          if (parsed.directChannel) directChannel = parsed.directChannel;
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Failed to load session backup:', err);
    }
    return null;
  }

  const sseClients = new Set<express.Response>();

  function broadcastLiveState() {
    const payload = JSON.stringify(currentLiveSession);
    for (const client of sseClients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (err) {
        sseClients.delete(client);
      }
    }
  }

  // SSE Stream for Real-time Instant Updates (<0.1s latency)
  app.get("/api/live/stream", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders?.();

    // Send immediate current state
    res.write(`data: ${JSON.stringify(currentLiveSession)}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // Get current state (REST fallback)
  app.get("/api/live/state", (req, res) => {
    res.json(currentLiveSession);
  });

  // Teacher starts program session (Generates PIN, activates program, resets students)
  app.post("/api/live/start-program", (req, res) => {
    const pin = generatePinCode();
    currentLiveSession.sessionId = 'live-' + Date.now();
    currentLiveSession.sessionPin = pin;
    currentLiveSession.isProgramActive = true;
    currentLiveSession.status = 'idle';
    currentLiveSession.connectedStudents = [];
    currentLiveSession.answersForCurrentQuestion = {};
    currentLiveSession.allSessionAnswers = {};
    currentLiveSession.currentQuestion = null;
    currentLiveSession.currentQuestionIndex = null;
    saveBackup();
    broadcastLiveState();
    res.json({ success: true, pin, state: currentLiveSession });
  });

  // Teacher ends program session (Expels all students, clears PIN, ends session)
  app.post("/api/live/end-program", (req, res) => {
    currentLiveSession.isProgramActive = false;
    currentLiveSession.status = 'program_ended';
    currentLiveSession.connectedStudents = []; // Expel / log out all connected students
    currentLiveSession.sessionPin = '';
    currentLiveSession.currentQuestion = null;
    currentLiveSession.currentQuestionIndex = null;
    currentLiveSession.answersForCurrentQuestion = {};
    saveBackup();
    broadcastLiveState();
    res.json({ success: true, state: currentLiveSession });
  });

  // Emergency Session Backup check & restore
  app.get("/api/live/backup", (req, res) => {
    const backup = loadBackup();
    res.json({ success: true, backup });
  });

  app.post("/api/live/restore-backup", (req, res) => {
    const backup = loadBackup();
    if (backup) {
      currentLiveSession = { ...backup };
      broadcastLiveState();
      return res.json({ success: true, state: currentLiveSession });
    }
    res.status(404).json({ success: false, error: 'لا توجد نسخة احتياطية محفوظة' });
  });

  // Teacher initializes or changes lesson (KEEPS current sessionPin if program is running!)
  app.post("/api/live/init", (req, res) => {
    const { lessonTitle, videoUrl, timeLimit, showResult, sessionPin, mode, explanationText } = req.body;
    currentLiveSession.sessionId = 'live-' + Date.now();
    
    // Preserve existing PIN so students stay joined across lesson/mode changes!
    if (sessionPin && String(sessionPin).trim()) {
      currentLiveSession.sessionPin = String(sessionPin).trim();
    } else if (!currentLiveSession.sessionPin) {
      currentLiveSession.sessionPin = generatePinCode();
    }
    
    currentLiveSession.isProgramActive = true;
    const targetMode = mode === 'direct' ? 'direct' : 'video';
    currentLiveSession.mode = targetMode;

    if (targetMode === 'direct') {
      directChannel.lessonTitle = lessonTitle || 'شرح مباشر';
      directChannel.status = 'direct_explanation';
      directChannel.currentQuestionIndex = null;
      directChannel.currentQuestion = null;
      directChannel.questionTriggeredAt = null;
      directChannel.explanationText = explanationText || `موضوع الحصة: ${lessonTitle || ''}`;
      if (typeof timeLimit === 'number' && timeLimit > 0) directChannel.timeLimit = timeLimit;
      if (showResult) directChannel.showResult = showResult;
      directChannel.answersForCurrentQuestion = {};
    } else {
      videoChannel.lessonTitle = lessonTitle || 'درس تفاعلي مباشر';
      videoChannel.videoUrl = videoUrl || '';
      videoChannel.status = 'waiting';
      videoChannel.currentQuestionIndex = null;
      videoChannel.currentQuestion = null;
      videoChannel.questionTriggeredAt = null;
      if (typeof timeLimit === 'number' && timeLimit > 0) videoChannel.timeLimit = timeLimit;
      if (showResult) videoChannel.showResult = showResult;
      videoChannel.answersForCurrentQuestion = {};
    }

    saveBackup();
    broadcastLiveState();
    res.json({ success: true, state: currentLiveSession });
  });

  // Teacher changes or regenerates PIN
  app.post("/api/live/update-pin", (req, res) => {
    const { pin } = req.body;
    currentLiveSession.sessionPin = pin && String(pin).trim() ? String(pin).trim() : generatePinCode();
    saveBackup();
    broadcastLiveState();
    res.json({ success: true, pin: currentLiveSession.sessionPin, state: currentLiveSession });
  });

  // Student joins room with PIN check
  app.post("/api/live/join", (req, res) => {
    const { username, sheetNumber, pin } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, error: 'اسم الطالب مطلوب' });
    }

    const enteredPin = String(pin || '').trim();
    const activePin = String(currentLiveSession.sessionPin || '').trim();

    // Check PIN if session requires it
    if (activePin && enteredPin !== activePin) {
      return res.status(401).json({ 
        success: false, 
        error: 'رقم تسجيل حضور الحصة غير صحيح! تأكد من الرقم المعروض على شاشة العرض.' 
      });
    }

    const cleanUser = String(username).trim();
    const cleanSheet = String(sheetNumber || '').trim();

    // Check if student already in list
    const existingIdx = currentLiveSession.connectedStudents.findIndex(
      s => s.username === cleanUser && s.sheetNumber === cleanSheet
    );

    const now = Date.now();
    if (existingIdx >= 0) {
      currentLiveSession.connectedStudents[existingIdx].lastPing = now;
      currentLiveSession.connectedStudents[existingIdx].pinVerified = true;
    } else {
      currentLiveSession.connectedStudents.push({
        username: cleanUser,
        sheetNumber: cleanSheet,
        joinedAt: now,
        lastPing: now,
        pinVerified: true,
      });
    }

    saveBackup();
    broadcastLiveState();
    res.json({ success: true, state: currentLiveSession });
  });

  // Student heartbeat ping
  app.post("/api/live/ping", (req, res) => {
    const { username, sheetNumber } = req.body;
    if (username) {
      const cleanUser = String(username).trim();
      const cleanSheet = String(sheetNumber || '').trim();
      const existing = currentLiveSession.connectedStudents.find(
        s => s.username === cleanUser && s.sheetNumber === cleanSheet
      );
      if (existing) {
        existing.lastPing = Date.now();
      }
    }
    res.json({ success: true });
  });

  // Student leaves or closes room
  app.post("/api/live/leave", (req, res) => {
    const { username, sheetNumber } = req.body;
    if (username) {
      const cleanUser = String(username).trim();
      const cleanSheet = String(sheetNumber || '').trim();
      const studentKey = `${cleanUser}_${cleanSheet}`;

      const initialLen = currentLiveSession.connectedStudents.length;
      currentLiveSession.connectedStudents = currentLiveSession.connectedStudents.filter(
        s => !(s.username === cleanUser && s.sheetNumber === cleanSheet)
      );

      // Clean up in-memory answers for leaving student across channels
      delete videoChannel.answersForCurrentQuestion[studentKey];
      delete videoChannel.allSessionAnswers[studentKey];
      delete directChannel.answersForCurrentQuestion[studentKey];
      delete directChannel.allSessionAnswers[studentKey];
      delete currentLiveSession.answersForCurrentQuestion[studentKey];
      delete currentLiveSession.allSessionAnswers[studentKey];

      if (currentLiveSession.connectedStudents.length !== initialLen) {
        saveBackup();
        broadcastLiveState();
      }
    }
    res.json({ success: true, state: currentLiveSession });
  });

  // Regular cleanup of disconnected / closed student sessions (if no ping for 45s)
  setInterval(() => {
    const now = Date.now();
    const activeThreshold = 45000;
    const initialLen = currentLiveSession.connectedStudents.length;
    currentLiveSession.connectedStudents = currentLiveSession.connectedStudents.filter(s => {
      return (now - (s.lastPing || 0)) < activeThreshold;
    });
    if (currentLiveSession.connectedStudents.length !== initialLen) {
      broadcastLiveState();
    }
  }, 5000);

  // Trigger a question in target channel ('video' | 'direct')
  app.post("/api/live/trigger-question", (req, res) => {
    const { questionIndex, question, timeLimit, showResult, channel } = req.body;
    const targetChannelType = channel || currentLiveSession.mode || 'video';
    const targetChannel = targetChannelType === 'direct' ? directChannel : videoChannel;

    targetChannel.status = 'question_active';
    targetChannel.currentQuestionIndex = questionIndex;
    targetChannel.currentQuestion = question;
    targetChannel.questionTriggeredAt = Date.now();
    if (timeLimit) targetChannel.timeLimit = Number(timeLimit);
    if (showResult) targetChannel.showResult = showResult;
    targetChannel.answersForCurrentQuestion = {}; // Reset answers so students get fresh clean state!

    currentLiveSession.mode = targetChannelType;
    saveBackup();
    broadcastLiveState();
    res.json({ success: true, state: currentLiveSession });
  });

  // Student submits an answer to active channel
  app.post("/api/live/submit-answer", (req, res) => {
    const { username, sheetNumber, answer, questionIndex, isCorrect, channel } = req.body;
    if (!username || answer === undefined) {
      return res.status(400).json({ success: false, error: 'بيانات غير مكتملة' });
    }

    const cleanUser = String(username).trim();
    const cleanSheet = String(sheetNumber || '').trim();
    const studentKey = cleanSheet ? `${cleanUser}_${cleanSheet}` : cleanUser;

    const targetChannelType = channel || currentLiveSession.mode || 'video';
    const targetChannel = targetChannelType === 'direct' ? directChannel : videoChannel;

    const submission: LiveStudentAnswerSubmission = {
      username: cleanUser,
      sheetNumber: cleanSheet,
      answer: String(answer),
      isCorrect: isCorrect,
      submittedAt: Date.now(),
    };

    targetChannel.answersForCurrentQuestion[studentKey] = submission;

    const qIdx = questionIndex !== undefined ? Number(questionIndex) : (targetChannel.currentQuestionIndex ?? 0);
    if (!targetChannel.allSessionAnswers[studentKey]) {
      targetChannel.allSessionAnswers[studentKey] = {};
    }
    targetChannel.allSessionAnswers[studentKey][qIdx] = String(answer);

    const lessonTitle = targetChannel.lessonTitle || 'default';
    if (!targetChannel.lessonAnswers[lessonTitle]) {
      targetChannel.lessonAnswers[lessonTitle] = {};
    }
    if (!targetChannel.lessonAnswers[lessonTitle][studentKey]) {
      targetChannel.lessonAnswers[lessonTitle][studentKey] = {};
    }
    targetChannel.lessonAnswers[lessonTitle][studentKey][qIdx] = String(answer);

    saveBackup();
    broadcastLiveState();
    res.json({ success: true, state: currentLiveSession });
  });

  // Teacher reveals correct answer
  app.post("/api/live/reveal-answer", (req, res) => {
    const { channel } = req.body;
    const targetChannel = (channel === 'direct' || currentLiveSession.mode === 'direct') ? directChannel : videoChannel;
    targetChannel.status = 'revealed';
    saveBackup();
    broadcastLiveState();
    res.json({ success: true, state: currentLiveSession });
  });

  // Teacher resumes video
  app.post("/api/live/resume", (req, res) => {
    videoChannel.status = 'playing';
    videoChannel.videoPlaying = true;
    videoChannel.currentQuestion = null;
    videoChannel.currentQuestionIndex = null;
    videoChannel.questionTriggeredAt = null;
    videoChannel.answersForCurrentQuestion = {};
    saveBackup();
    broadcastLiveState();
    res.json({ success: true, state: currentLiveSession });
  });

  // Teacher finishes session for active channel
  app.post("/api/live/finish", (req, res) => {
    const { channel } = req.body;
    const targetChannel = (channel === 'direct' || currentLiveSession.mode === 'direct') ? directChannel : videoChannel;
    targetChannel.status = 'finished';
    targetChannel.currentQuestion = null;
    targetChannel.currentQuestionIndex = null;
    targetChannel.questionTriggeredAt = null;
    targetChannel.answersForCurrentQuestion = {};
    targetChannel.allSessionAnswers = {};
    saveBackup();
    broadcastLiveState();
    res.json({ success: true, state: currentLiveSession });
  });

  // Explicit Channel RAM & Backup Reset (مسح وتصفير ذاكرة الرام الخاصة بقسم محدد تماماً)
  app.post("/api/live/reset-channel", (req, res) => {
    const { channel, lessonTitle } = req.body; // 'direct' | 'video' | 'all'
    const target = channel || (currentLiveSession.mode === 'direct' ? 'direct' : 'video');

    if (target === 'direct' || target === 'all') {
      directChannel.status = 'idle';
      directChannel.currentQuestionIndex = null;
      directChannel.currentQuestion = null;
      directChannel.questionTriggeredAt = null;
      directChannel.answersForCurrentQuestion = {};
      directChannel.allSessionAnswers = {};
      if (lessonTitle && directChannel.lessonAnswers[lessonTitle]) {
        delete directChannel.lessonAnswers[lessonTitle];
      } else {
        directChannel.lessonAnswers = {};
      }
    }

    if (target === 'video' || target === 'all') {
      videoChannel.status = 'idle';
      videoChannel.currentQuestionIndex = null;
      videoChannel.currentQuestion = null;
      videoChannel.questionTriggeredAt = null;
      videoChannel.answersForCurrentQuestion = {};
      videoChannel.allSessionAnswers = {};
      if (lessonTitle && videoChannel.lessonAnswers[lessonTitle]) {
        delete videoChannel.lessonAnswers[lessonTitle];
      } else {
        videoChannel.lessonAnswers = {};
      }
    }

    if (target === 'all') {
      try {
        if (fs.existsSync(BACKUP_FILE)) {
          fs.unlinkSync(BACKUP_FILE);
        }
      } catch (err) {
        console.warn('Backup file unlink error:', err);
      }
    } else {
      saveBackup();
    }

    syncCurrentLiveSession();
    broadcastLiveState();
    res.json({ success: true, message: `تم تصفير ذاكرة رام الخادم لقسم ${target} بنجاح`, state: currentLiveSession });
  });

  // Full Global Reset
  app.post("/api/live/reset", (req, res) => {
    videoChannel = {
      lessonTitle: '',
      videoUrl: '',
      videoPlaying: false,
      status: 'idle',
      currentQuestionIndex: null,
      currentQuestion: null,
      questionTriggeredAt: null,
      timeLimit: 30,
      showResult: 'نعم',
      answersForCurrentQuestion: {},
      allSessionAnswers: {},
      lessonAnswers: {},
    };
    directChannel = {
      lessonTitle: '',
      explanationText: '',
      status: 'idle',
      currentQuestionIndex: null,
      currentQuestion: null,
      questionTriggeredAt: null,
      timeLimit: 30,
      showResult: 'نعم',
      answersForCurrentQuestion: {},
      allSessionAnswers: {},
      lessonAnswers: {},
    };
    currentLiveSession = {
      sessionId: 'live-' + Date.now(),
      sessionPin: generatePinCode(),
      isProgramActive: false,
      mode: 'video',
      lessonTitle: '',
      videoLessonTitle: '',
      directLessonTitle: '',
      videoUrl: '',
      status: 'idle',
      currentQuestionIndex: null,
      currentQuestion: null,
      questionTriggeredAt: null,
      timeLimit: 30,
      showResult: 'نعم',
      connectedStudents: [],
      answersForCurrentQuestion: {},
      allSessionAnswers: {},
      videoAnswers: {},
      directAnswers: {},
      videoChannel: {},
      directChannel: {},
    };
    try {
      if (fs.existsSync(BACKUP_FILE)) {
        fs.unlinkSync(BACKUP_FILE);
      }
    } catch {}
    saveBackup();
    broadcastLiveState();
    res.json({ success: true, state: currentLiveSession });
  });

  // Google Drive Streaming Proxy Route with Auto Virus Warning Bypass
  app.get("/api/proxy-drive", async (req, res) => {
    const driveId = req.query.id as string;
    if (!driveId) {
      return res.status(400).send("Missing id parameter");
    }

    try {
      const headers: any = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };
      
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      let targetUrl = `https://drive.google.com/uc?export=download&id=${driveId}`;
      let response: Response;

      // Manual redirect follower loop (max 5 redirects) to ensure headers (like Range) are preserved
      let redirectCount = 0;
      while (true) {
        response = await fetch(targetUrl, {
          headers,
          redirect: 'manual'
        });

        if (
          response.status === 301 ||
          response.status === 302 ||
          response.status === 303 ||
          response.status === 307 ||
          response.status === 308
        ) {
          const redirectUrl = response.headers.get('location');
          if (redirectUrl && redirectCount < 5) {
            if (redirectUrl.startsWith('/')) {
              const urlObj = new URL(targetUrl);
              targetUrl = `${urlObj.origin}${redirectUrl}`;
            } else {
              targetUrl = redirectUrl;
            }
            redirectCount++;
            continue;
          }
        }
        break;
      }

      if (response.status === 404) {
        return res.status(404).send("الملف غير موجود في Google Drive أو تم حذفه");
      }
      if (response.status === 403) {
        return res.status(403).send("ملف Google Drive مقيد الوصول. يرجى ضبط المشاركة إلى: أي شخص لديه الرابط (Anyone with the link)");
      }

      const contentType = response.headers.get('content-type') || '';
      
      // If Google Drive returns HTML, it means a virus confirmation page is shown!
      if (contentType.includes('text/html')) {
        const html = await response.text();
        
        // Match token e.g. confirm=xxxx
        const confirmMatch = html.match(/confirm=([a-zA-Z0-9_-]+)/);
        
        if (confirmMatch && confirmMatch[1]) {
          const confirmToken = confirmMatch[1];
          let confirmedUrl = `https://drive.google.com/uc?export=download&id=${driveId}&confirm=${confirmToken}`;

          let confirmResponse: Response;
          let confirmRedirectCount = 0;
          while (true) {
            confirmResponse = await fetch(confirmedUrl, {
              headers,
              redirect: 'manual'
            });

            if (
              confirmResponse.status === 301 ||
              confirmResponse.status === 302 ||
              confirmResponse.status === 303 ||
              confirmResponse.status === 307 ||
              confirmResponse.status === 308
            ) {
              const redirectUrl = confirmResponse.headers.get('location');
              if (redirectUrl && confirmRedirectCount < 5) {
                if (redirectUrl.startsWith('/')) {
                  const urlObj = new URL(confirmedUrl);
                  confirmedUrl = `${urlObj.origin}${redirectUrl}`;
                } else {
                  confirmedUrl = redirectUrl;
                }
                confirmRedirectCount++;
                continue;
              }
            }
            break;
          }

          // Forward headers
          const sContentType = confirmResponse.headers.get('content-type');
          const sContentLength = confirmResponse.headers.get('content-length');
          const sContentRange = confirmResponse.headers.get('content-range');
          const sAcceptRanges = confirmResponse.headers.get('accept-ranges');

          if (sContentType) res.setHeader('content-type', sContentType);
          if (sContentLength) res.setHeader('content-length', sContentLength);
          if (sContentRange) res.setHeader('content-range', sContentRange);
          if (sAcceptRanges) res.setHeader('accept-ranges', sAcceptRanges);

          res.status(confirmResponse.status);
          if (confirmResponse.body) {
            Readable.fromWeb(confirmResponse.body as any).pipe(res);
          } else {
            res.end();
          }
          return;
        }
      }

      // Direct download worked (no virus confirmation screen)
      const fContentType = response.headers.get('content-type');
      const fContentLength = response.headers.get('content-length');
      const fContentRange = response.headers.get('content-range');
      const fAcceptRanges = response.headers.get('accept-ranges');

      if (fContentType) res.setHeader('content-type', fContentType);
      if (fContentLength) res.setHeader('content-length', fContentLength);
      if (fContentRange) res.setHeader('content-range', fContentRange);
      if (fAcceptRanges) res.setHeader('accept-ranges', fAcceptRanges);

      res.status(response.status);
      if (response.body) {
        Readable.fromWeb(response.body as any).pipe(res);
      } else {
        res.end();
      }

    } catch (error: any) {
      console.error("Error in proxy-drive server endpoint:", error.message);
      res.status(500).send("Error proxying video/audio from Google Drive");
    }
  });

  // ==========================================
  // --- NATIVE PDF STORAGE & STREAMING ---
  // ==========================================
  const PDF_UPLOADS_DIR = path.join(process.cwd(), 'public', 'pdf_uploads');
  if (!fs.existsSync(PDF_UPLOADS_DIR)) {
    fs.mkdirSync(PDF_UPLOADS_DIR, { recursive: true });
  }

  // Upload or sync PDF file to server
  app.post("/api/pdf/upload", (req, res) => {
    try {
      // Support id from query or JSON body
      const id = (req.query.id as string) || (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body.id : null);
      const name = (req.query.name as string) || (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body.name : '');
      const base64 = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body.base64 : null;

      if (!id) {
        return res.status(400).json({ error: "Missing id parameter" });
      }

      const safeId = String(id).replace(/^local:\/\//, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      const targetPath = path.join(PDF_UPLOADS_DIR, `${safeId}.pdf`);

      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        fs.writeFileSync(targetPath, req.body);
      } else if (base64) {
        const cleanBase64 = String(base64).replace(/^data:application\/pdf;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        fs.writeFileSync(targetPath, buffer);
      } else {
        return res.status(400).json({ error: "No PDF data provided" });
      }

      const fileSize = fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0;
      console.log(`[PDF Server] Successfully saved PDF ${safeId} (${name || 'unnamed'}) size: ${fileSize} bytes`);
      res.json({
        success: true,
        id: safeId,
        url: `/api/pdf/${safeId}`,
        size: fileSize,
      });
    } catch (err: any) {
      console.error("Failed to save PDF on server:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Serve PDF file with CORS and streaming support
  app.get("/api/pdf/:id", (req, res) => {
    try {
      const { id } = req.params;
      const safeId = String(id).replace(/^local:\/\//, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      let targetPath = path.join(PDF_UPLOADS_DIR, `${safeId}.pdf`);
      if (!fs.existsSync(targetPath)) {
        targetPath = path.join(PDF_UPLOADS_DIR, safeId);
      }

      if (!fs.existsSync(targetPath)) {
        return res.status(404).send("ملف الـ PDF غير موجود على الخادم");
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type, Accept");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.sendFile(targetPath);
    } catch (err: any) {
      console.error("Error reading PDF file:", err);
      res.status(500).send("Error reading PDF file");
    }
  });

  app.options("/api/pdf/:id", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type, Accept");
    res.status(204).end();
  });

  // Rich Dictionary for Arabic -> Thai & English educational and UI terms
  const UI_DICTIONARY: Record<string, { th: string; en: string }> = {
    'فيديو الدروس': { th: 'วิดีโอบทเรียน', en: 'Lesson Videos' },
    'بوابة التحكم الإداري وقاعدة البيانات': { th: 'พอร์ทัลควบคุมการจัดการและฐานข้อมูล', en: 'Admin Control Portal & Database' },
    'نظام القراءة والواجبات المطور': { th: 'ระบบการอ่านและการบ้านขั้นสูง', en: 'Advanced Reading & Homework System' },
    'إدارة الشيت، الأسئلة، وإعدادات الربط': { th: 'จัดการชีท คำถาม และการเชื่อมต่อ', en: 'Manage Sheets, Questions & Connection Settings' },
    'صفحة الطلاب 🎓': { th: 'หน้าสำหรับนักเรียน 🎓', en: 'Student Page 🎓' },
    'صفحة الإدارة 🔐': { th: 'หน้าการจัดการ 🔐', en: 'Admin Page 🔐' },
    'قفل الإدارة': { th: 'ล็อคการจัดการ', en: 'Lock Admin' },
    'تحديث البيانات': { th: 'รีเฟรชข้อมูล', en: 'Refresh Data' },
    'تطبيق ويب تفاعلي متقدم لتعليم الأطفال القراءة 📚': { th: 'แอปพลิเคชันเว็บแบบโต้ตอบเพื่อสอนการอ่านสำหรับเด็ก 📚', en: 'Interactive Web App for Teaching Kids Reading 📚' },
    'بوابة الطالب للحصة التفاعلية 📱': { th: 'พอร์ทัลนักเรียนสำหรับชั้นเรียนแบบโต้ตอบ 📱', en: 'Student Portal for Interactive Classroom 📱' },
    'سجل اسمك ورمز الحضور المعروض على الشاشة للإجابة على الأسئلة من جهازك مباشرة!': { th: 'กรอกชื่อและรหัส PIN ที่แสดงบนหน้าจอเพื่อตอบคำถามจากอุปกรณ์ของคุณ!', en: 'Enter your name and the PIN shown on screen to answer questions directly from your device!' },
    'مسح رمز QR بالكاميرا (بيانات الطالب أو رمز الحضور) 📷': { th: 'สแกนรหัส QR ด้วยกล้อง 📷', en: 'Scan QR Code with Camera 📷' },
    'اسم الطالب:': { th: 'ชื่อนักเรียน:', en: 'Student Name:' },
    'أدخل اسمك الكريم...': { th: 'กรุณากรอกชื่อของคุณ...', en: 'Please enter your name...' },
    'رقم الشيت (اختياري - للربط المباشر مع سجل الدرجات):': { th: 'หมายเลขชีท (ไม่บังคับ):', en: 'Sheet Number (Optional):' },
    'رمز الحضور (PIN):': { th: 'รหัสเข้าร่วม (PIN):', en: 'Attendance Code (PIN):' },
    'أدخل رمز الـ PIN المعروض على الشاشة...': { th: 'กรอกรหัส PIN ที่แสดงบนหน้าจอ...', en: 'Enter the PIN shown on screen...' },
    'دخول الحصة التفاعلية 🚀': { th: 'เข้าร่วมชั้นเรียนแบบโต้ตอบ 🚀', en: 'Join Interactive Class 🚀' },
    'جارٍ التحقق والدخول...': { th: 'กำลังตรวจสอบและเข้าร่วม...', en: 'Verifying and joining...' },
    'أنت متصل بالحصة الآن': { th: 'คุณเชื่อมต่อกับชั้นเรียนแล้ว', en: 'You are connected to class' },
    'في انتظار المعلم لإطلاق السؤال القادم...': { th: 'กำลังรอครูส่งคำถามถัดไป...', en: 'Waiting for teacher to launch next question...' },
    'أرسل إجابتك': { th: 'ส่งคำตอบของคุณ', en: 'Submit Your Answer' },
    'تم استلام إجابتك بنجاح!': { th: 'ได้รับคำตอบของคุณเรียบร้อยแล้ว!', en: 'Your answer has been received!' },
    'شكراً لمشاركتك المتميزة! 🎉': { th: 'ขอบคุณสำหรับการมีส่วนร่วมที่ยอดเยี่ยม! 🎉', en: 'Thank you for your excellent participation! 🎉' },
    'تسجيل الدخول لحصة جديدة': { th: 'เข้าสู่ระบบสำหรับชั้นเรียนใหม่', en: 'Sign in to a new class' },
    'العودة للصفحة الرئيسية': { th: 'กลับสู่หน้าหลัก', en: 'Back to Home Page' },
    'تحدي نهاية البرنامج المباشر': { th: 'การแข่งขันปิดท้ายชั้นเรียนสด', en: 'Live Program Grand Challenge' },
    'المعلم يستعد لإطلاق مسابقة التحدي النهائي! 🎯 هل أنت مستعد؟': { th: 'ครูกำลังเตรียมเปิดการแข่งขันรอบสุดท้าย! 🎯 คุณพร้อมไหม?', en: 'Teacher is preparing to launch the Final Challenge! 🎯 Are you ready?' },
    'اضغط أدناه لتأكيد حضورك والظهور فوراً على شاشة العرض مع زملائك ⚡': { th: 'กดด้านล่างเพื่อยืนยันการเข้าร่วมและแสดงชื่อบนหน้าจอพร้อมเพื่อนๆ ⚡', en: 'Tap below to confirm attendance and appear on the display screen with classmates ⚡' },
    'دخول تحدي الكويز الآن 🚀': { th: 'เข้าร่วมแบบทดสอบทันที 🚀', en: 'Enter Quiz Challenge Now 🚀' },
    'تبديل الطالب': { th: 'เปลี่ยนนักเรียน', en: 'Switch Student' },
    'محادثة': { th: 'แชท', en: 'Chat' },
    'رفع اليد ✋': { th: 'ยกมือ ✋', en: 'Raise Hand ✋' },
    'موافق 👍': { th: 'เห็นด้วย 👍', en: 'Agree 👍' },
    'غير موافق 👎': { th: 'ไม่เห็นด้วย 👎', en: 'Disagree 👎' },
    'سؤال ❓': { th: 'คำถาม ❓', en: 'Question ❓' },
    'تصفيق 👏': { th: 'ปรบมือ 👏', en: 'Clap 👏' },
  };

  function lookupFallbackTranslation(text: string, targetLang: 'th' | 'en'): string {
    const trimmed = text.trim();
    if (UI_DICTIONARY[trimmed]) {
      return UI_DICTIONARY[trimmed][targetLang];
    }
    // Partial search in dictionary
    for (const [key, val] of Object.entries(UI_DICTIONARY)) {
      if (trimmed.includes(key) || key.includes(trimmed)) {
        return val[targetLang];
      }
    }
    // Keyword based translation helper
    if (targetLang === 'th') {
      if (trimmed.includes('طالب')) return 'นักเรียน';
      if (trimmed.includes('معلم')) return 'คุณครู';
      if (trimmed.includes('سؤال')) return 'คำถาม';
      if (trimmed.includes('إجابة') || trimmed.includes('جواب')) return 'คำตอบ';
      if (trimmed.includes('حصة') || trimmed.includes('درس')) return 'บทเรียน';
      if (trimmed.includes('رمز') || trimmed.includes('كود')) return 'รหัส PIN';
      if (trimmed.includes('تحدي') || trimmed.includes('مسابقة')) return 'การแข่งขันแบบทดสอบ';
      if (trimmed.includes('شكراً') || trimmed.includes('شكر')) return 'ขอบคุณมาก';
      return `[TH] ${trimmed}`;
    } else {
      if (trimmed.includes('طالب')) return 'Student';
      if (trimmed.includes('معلم')) return 'Teacher';
      if (trimmed.includes('سؤال')) return 'Question';
      if (trimmed.includes('إجابة') || trimmed.includes('جواب')) return 'Answer';
      if (trimmed.includes('حصة') || trimmed.includes('درس')) return 'Lesson';
      if (trimmed.includes('رمز') || trimmed.includes('كود')) return 'PIN Code';
      if (trimmed.includes('تحدي') || trimmed.includes('مسابقة')) return 'Quiz Challenge';
      if (trimmed.includes('شكراً') || trimmed.includes('شكر')) return 'Thank you';
      return `[EN] ${trimmed}`;
    }
  }

  // Shared Gemini client factory (strictly server-side)
  async function getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) return null;
    const { GoogleGenAI } = await import("@google/genai");
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' }
      }
    });
  }

  // Fast free translation fallback when Gemini API key is unavailable or errors
  async function translateViaGoogleFree(text: string, targetLang: 'th' | 'en'): Promise<string | null> {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=${targetLang}&dt=t&q=${encodeURIComponent(text.slice(0, 800))}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; aistudio-build/1.0)' }
      });
      if (!r.ok) return null;
      const json: any = await r.json();
      if (Array.isArray(json?.[0])) {
        const joined = json[0].map((seg: any) => seg?.[0] || '').join('').trim();
        if (joined && joined !== text) return joined;
      }
      return null;
    } catch {
      return null;
    }
  }

  function cleanJsonText(raw: string): string {
    return String(raw || '')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();
  }

  // AI Single Translation Endpoint using @google/genai
  app.post("/api/translate-ai", async (req, res) => {
    try {
      const { text, targetLang } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false, error: "Text is required" });
      }

      const safeLang: 'th' | 'en' = targetLang === 'th' ? 'th' : 'en';
      const langName = safeLang === 'th' ? 'Thai' : 'English';
      const ai = await getGeminiClient();

      if (ai) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: `Translate the following educational text from Arabic to natural, idiomatic ${langName}. Return ONLY the direct translation text with no markdown, quotes, or conversational explanations:\n\n${text}`
          });
          const translated = (response.text || "").trim().replace(/^["']|["']$/g, '');
          if (translated && translated !== text) {
            return res.json({ success: true, translated, engine: 'gemini' });
          }
        } catch (apiErr: any) {
          console.warn("Gemini translate error, using fallback:", apiErr.message);
        }
      }

      const gFallback = await translateViaGoogleFree(text, safeLang);
      if (gFallback) {
        return res.json({ success: true, translated: gFallback, engine: 'google-free' });
      }

      // Dictionary fallback
      const fallback = lookupFallbackTranslation(text, safeLang);
      return res.json({ success: true, translated: fallback, engine: 'dictionary' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // AI Live Caption Dual-Language Translation Endpoint (Arabic -> Thai & English)
  app.post("/api/translate-live-caption", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false, error: "Text is required" });
      }

      const ai = await getGeminiClient();
      if (ai) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: `Translate this spoken Arabic educational sentence into natural, idiomatic Thai and English. Return ONLY a strict JSON object with keys "th" and "en" without markdown formatting or conversational text. Example: {"th": "...", "en": "..."}\n\nArabic: "${text}"`,
            config: {
              responseMimeType: "application/json"
            }
          });
          const parsed = JSON.parse(cleanJsonText(response.text || "{}"));
          if (parsed.th || parsed.en) {
            return res.json({
              success: true,
              th: String(parsed.th || '').trim(),
              en: String(parsed.en || '').trim()
            });
          }
        } catch (apiErr: any) {
          console.warn("Gemini live caption translation error:", apiErr.message);
        }
      }

      // Google Translate free fallback
      const [gTh, gEn] = await Promise.all([
        translateViaGoogleFree(text, 'th'),
        translateViaGoogleFree(text, 'en'),
      ]);
      return res.json({
        success: true,
        th: gTh || lookupFallbackTranslation(text, 'th'),
        en: gEn || lookupFallbackTranslation(text, 'en')
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // AI Batch Translation Endpoint (Supports Arabic -> Thai & English for Script Prompter / UI)
  app.post("/api/translate-batch", async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: "Items array required" });
      }

      const ai = await getGeminiClient();
      if (ai) {
        try {
          const prompt = `Translate each of the following Arabic educational phrases into natural Thai (th) and English (en).
Return ONLY a valid JSON object matching this exact schema (use the exact "key" values provided):
{
  "keyName": { "th": "Thai translation", "en": "English translation" }
}

Input items:
${JSON.stringify(items.map((i: any) => ({ key: String(i.key), ar: String(i.ar || '') })))}
`;
          const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: prompt,
            config: { responseMimeType: "application/json" }
          });
          const parsed = JSON.parse(cleanJsonText(response.text || "{}"));
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            return res.json({ success: true, translations: parsed, engine: 'gemini' });
          }
        } catch (apiErr: any) {
          console.warn("Gemini batch translation error:", apiErr.message);
        }
      }

      // Real HTTP translation fallback for each item if Gemini fails
      const fallbackTranslations: Record<string, { th: string; en: string }> = {};
      await Promise.all(
        items.map(async (item: any) => {
          const src = String(item.ar || item.key || '').trim();
          const [gTh, gEn] = await Promise.all([
            translateViaGoogleFree(src, 'th'),
            translateViaGoogleFree(src, 'en'),
          ]);
          fallbackTranslations[String(item.key)] = {
            th: gTh || lookupFallbackTranslation(src, 'th'),
            en: gEn || lookupFallbackTranslation(src, 'en')
          };
        })
      );
      return res.json({ success: true, translations: fallbackTranslations, engine: 'google-free' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Server-side TTS LRU Cache (ensures instant replay & zero Android/iOS voice-pack issues)
  const ttsCache = new Map<string, { audioDataUrl: string; source: string }>();
  const TTS_CACHE_MAX = 200;

  function setTtsCache(key: string, val: { audioDataUrl: string; source: string }) {
    if (ttsCache.has(key)) {
      ttsCache.delete(key);
    } else if (ttsCache.size >= TTS_CACHE_MAX) {
      const oldestKey = ttsCache.keys().next().value;
      if (oldestKey !== undefined) ttsCache.delete(oldestKey);
    }
    ttsCache.set(key, val);
  }

  // Server-side Text-to-Speech Endpoint (Arabic / Thai / English)
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, lang } = req.body || {};
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ success: false, error: "Text is required" });
      }

      const safeLang: 'ar' | 'th' | 'en' =
        lang === 'th' ? 'th' : lang === 'en' ? 'en' : 'ar';
      const cleanText = text.trim().slice(0, 600);
      const cacheKey = `${safeLang}:${cleanText}`;

      const cached = ttsCache.get(cacheKey);
      if (cached) {
        // Refresh LRU order
        setTtsCache(cacheKey, cached);
        return res.json({ success: true, audioDataUrl: cached.audioDataUrl, source: cached.source, cached: true });
      }

      // 1. Primary: Gemini 3.8 Flash Lite TTS (returns crisp 24kHz WAV)
      const ai = await getGeminiClient();
      if (ai) {
        try {
          const langLabel = safeLang === 'th' ? 'Thai' : safeLang === 'en' ? 'English' : 'Arabic';
          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash-lite-tts",
            contents: [{ parts: [{ text: `Read the following ${langLabel} sentence clearly and naturally at a comfortable classroom pace:\n\n${cleanText}` }] }],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Kore" },
                },
              },
            },
          });

          const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          if (inlineData?.data) {
            const mime = inlineData.mimeType || 'audio/wav';
            const audioDataUrl = `data:${mime};base64,${inlineData.data}`;
            setTtsCache(cacheKey, { audioDataUrl, source: 'gemini-tts' });
            return res.json({ success: true, audioDataUrl, source: 'gemini-tts' });
          }
        } catch (geminiErr: any) {
          console.warn("Gemini TTS error, trying Google TTS proxy:", geminiErr?.message || geminiErr);
        }
      }

      // 2. Fallback: Lightweight Google Translate TTS audio/mpeg proxy
      try {
        const gttsChunk = cleanText.slice(0, 200);
        const gttsUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${safeLang}&q=${encodeURIComponent(gttsChunk)}`;
        const audioRes = await fetch(gttsUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; aistudio-build/1.0)'
          }
        });
        if (audioRes.ok) {
          const arrBuf = await audioRes.arrayBuffer();
          if (arrBuf.byteLength > 256) {
            const b64 = Buffer.from(arrBuf).toString('base64');
            const audioDataUrl = `data:audio/mpeg;base64,${b64}`;
            setTtsCache(cacheKey, { audioDataUrl, source: 'google-tts' });
            return res.json({ success: true, audioDataUrl, source: 'google-tts' });
          }
        }
      } catch (gttsErr: any) {
        console.warn("Google TTS fallback failed:", gttsErr?.message || gttsErr);
      }

      // 3. Final fallback hint for browser SpeechSynthesis
      return res.json({ success: false, fallback: 'browser' });
    } catch (err: any) {
      console.error("/api/tts unexpected error:", err);
      return res.json({ success: false, fallback: 'browser' });
    }
  });


  // Vite development middleware vs production static server
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
