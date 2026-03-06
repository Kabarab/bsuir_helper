import { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Users, Plus, X, List, Calendar as CalendarIcon, Trash2, Settings, Edit2, ClipboardList, MoreVertical, CheckCircle2, Bell } from 'lucide-react';
import { format, addDays, subDays, startOfWeek, isSameDay, getDay, differenceInCalendarWeeks, parse, addMinutes, startOfDay, endOfDay, differenceInHours, differenceInMonths, differenceInYears } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { getMinskNow } from '../utils/minskTime';

const COLOR_PRESETS = {
  blue: { bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500/30', light: 'bg-blue-500/10' },
  emerald: { bg: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500/30', light: 'bg-emerald-500/10' },
  rose: { bg: 'bg-rose-500', text: 'text-rose-500', border: 'border-rose-500/30', light: 'bg-rose-500/10' },
  violet: { bg: 'bg-indigo-500', text: 'text-indigo-500', border: 'border-indigo-500/30', light: 'bg-indigo-500/10' },
  amber: { bg: 'bg-amber-500', text: 'text-amber-500', border: 'border-amber-500/30', light: 'bg-amber-500/10' },
  slate: { bg: 'bg-slate-500', text: 'text-slate-500', border: 'border-slate-500/30', light: 'bg-slate-500/10' },
};

export default function Schedule() {
  const { group, subgroup, telegramId, isTeacher, teacherUrlId, englishTeacherId } = useUser();
  const navigate = useNavigate();

  const [schedule, setSchedule] = useState(() => {
    const key = isTeacher ? teacherUrlId : group;
    if (!key) return null;
    try {
      const cached = localStorage.getItem(`schedule_${key}`);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [currentWeekNum, setCurrentWeekNum] = useState(null);
  const [loading, setLoading] = useState(!schedule);

  const [selectedDate, setSelectedDate] = useState(getMinskNow());

  // Live Minsk time, updated every 60s for progress tracking
  const [now, setNow] = useState(getMinskNow());
  useEffect(() => {
    const timer = setInterval(() => setNow(getMinskNow()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'

  const [customPlans, setCustomPlans] = useState(() => {
    try {
      const saved = localStorage.getItem('bsuir_custom_plans');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPlan, setNewPlan] = useState({ title: '', startTime: '09:00', endTime: '10:30', type: 'CUSTOM', color: 'blue', date: '', is_recurring: false, recurrence_type: 'weekly', recurrence_end_date: '', recurrence_interval: 1 });

  // Context menu state
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, lesson: null });
  const [isEditing, setIsEditing] = useState(false);
  const [editEventId, setEditEventId] = useState(null);
  const eventLongPressTimer = useRef(null);
  const eventTouchStart = useRef({ x: 0, y: 0 });

  // Planner tasks for linking
  const [plannerTasks, setPlannerTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('bsuir_tasks');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Task modal for adding plans linked to events
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium', linkedEventId: null, linkedEventLabel: '', reminders: [] });

  // Expandable lesson state
  const [expandedLessonId, setExpandedLessonId] = useState(null);

  // Drag-to-create state
  const [dragState, setDragState] = useState({ isDragging: false, startY: 0, currentY: 0 });
  const gridRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const longPressTimer = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragCurrentYRef = useRef(0);

  const daysRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('bsuir_custom_plans', JSON.stringify(customPlans));
  }, [customPlans]);

  useEffect(() => {
    // Custom events are fetched using telegramId
    axios.get(`/api/events/${telegramId}`)
      .then(res => {
        setCustomPlans(Array.isArray(res.data) ? res.data : []);
      })
      .catch(console.error);
  }, [telegramId]);

  const getLessonColor = (lesson) => {
    const type = lesson.lessonTypeAbbrev;
    const customColor = lesson.color;

    if (customColor && COLOR_PRESETS[customColor]) {
      return COLOR_PRESETS[customColor];
    }

    switch (type) {
      case 'ЛК': return COLOR_PRESETS.emerald;
      case 'ПЗ': return COLOR_PRESETS.blue;
      case 'ЛР': return COLOR_PRESETS.rose;
      default: return COLOR_PRESETS.blue;
    }
  };

  const fetchSchedule = (g, showLoader = true) => {
    if (showLoader) setLoading(true);

    axios.get(`/api/bsuir/week`)
      .then(res => setCurrentWeekNum(res.data))
      .catch(console.error);

    const url = isTeacher ? `/api/bsuir/teachers/${g}/schedule` : `/api/bsuir/schedule/${g}`;
    axios.get(url)
      .then(res => {
         setSchedule(res.data);
         localStorage.setItem(`schedule_${g}`, JSON.stringify(res.data));
         setLoading(false);
      })
      .catch(err => {
         console.error(err);
         setLoading(false);
      });
  };
  
  // Helpers to find next/prev occurrence in schedule
  const findOccurrence = (direction, subjectTitle, typeAbbrev, fromDate) => {
    if (!schedule?.schedules) return null;
    
    // We'll search up to 30 days in the specified direction
    let currentDate = direction === 'next' ? addDays(fromDate, 1) : subDays(fromDate, 1);
    const maxSearchDays = 30;
    
    for (let i = 0; i < maxSearchDays; i++) {
       const dayIndex = getDay(currentDate);
       const dayName = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"][dayIndex];
       const weekNum = getWeekNumberForDate(currentDate);
       
       if (schedule.schedules[dayName]) {
         const foundLesson = schedule.schedules[dayName].find(l => {
            // Check subgroup match if necessary
            if (subgroup !== 0 && l.numSubgroup !== 0 && l.numSubgroup !== subgroup) return false;
            // Check week match
            if (l.weekNumber && l.weekNumber.length > 0 && !l.weekNumber.includes(weekNum)) return false;
            
            return l.subject === subjectTitle && l.lessonTypeAbbrev === typeAbbrev;
         });
         
         if (foundLesson) {
           return {
             date: currentDate,
             lesson: foundLesson
           };
         }
       }
       
       currentDate = direction === 'next' ? addDays(currentDate, 1) : subDays(currentDate, 1);
    }
    return null;
  };

  useEffect(() => {
    const key = isTeacher ? teacherUrlId : group;
    if (!key) return;

    // Try to load cached schedule for this key
    const cachedSchedule = localStorage.getItem(`schedule_${key}`);
    if (cachedSchedule) {
      // Cache hit — show instantly, refresh in background
      try { setSchedule(JSON.parse(cachedSchedule)); } catch { /* ignore */ }
      setLoading(false);
      fetchSchedule(key, false); // background refresh without loader
    } else {
      // No cache — show loader
      setSchedule(null);
      fetchSchedule(key, true);
    }
  }, [group, isTeacher, teacherUrlId]);

  // Generate an array of dates (-1 week to +3 weeks from today)
  const dateStrip = useMemo(() => {
    const dates = [];
    const today = getMinskNow();
    for (let i = -7; i <= 21; i++) {
       dates.push(addDays(today, i));
    }
    return dates;
  }, []);

  // Scroll active date into view on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (daysRef.current) {
         const activeEl = daysRef.current.querySelector('.active-date');
         if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [dateStrip]);

  // Auto-scroll calendar grid to current time
  useEffect(() => {
    if (viewMode === 'calendar' && scrollContainerRef.current && isSameDay(selectedDate, now)) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const scrollTo = Math.max(0, (nowMinutes / 60) * 80 - 200); // 200px above current time
      scrollContainerRef.current.scrollTop = scrollTo;
    }
  }, [viewMode]);

  // Calculate BSUIR week number for selected date
  // BSUIR weeks go 1 -> 2 -> 3 -> 4 -> 1...
  const getWeekNumberForDate = (date) => {
    if (!currentWeekNum) return 1; // Fallback
    const today = getMinskNow();
    
    const diffWeeks = differenceInCalendarWeeks(date, today, { weekStartsOn: 1 });
    
    let targetWeek = ((currentWeekNum - 1 + diffWeeks) % 4) + 1;
    if (targetWeek <= 0) targetWeek += 4;
    
    return targetWeek;
  };

  // Helper: compute lesson progress (0..1) for today only
  const getLessonProgress = (lesson) => {
    const isToday = isSameDay(selectedDate, now);
    if (!isToday) return lesson.startLessonTime <= format(now, 'HH:mm') ? -1 : null; // -1 = past day lessons irrelevant
    
    const [sH, sM] = lesson.startLessonTime.split(':').map(Number);
    const [eH, eM] = lesson.endLessonTime.split(':').map(Number);
    const startMin = sH * 60 + sM;
    const endMin = eH * 60 + eM;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    
    if (nowMin < startMin) return 0;   // future
    if (nowMin >= endMin) return 1;     // past
    return (nowMin - startMin) / (endMin - startMin); // in progress
  };

  const selectedWeekNumber = getWeekNumberForDate(selectedDate);
  const selectedDayIndex = getDay(selectedDate); // 0 = Sunday, 1 = Monday...
  
  // Mapping bsuir day names
  const bsuirDayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const selectedDayName = bsuirDayNames[selectedDayIndex];

  // Get active lessons for the selected day and week
  const activeLessons = useMemo(() => {
    let lessons = [];
    if (schedule?.schedules && schedule.schedules[selectedDayName]) {
      lessons = schedule.schedules[selectedDayName].filter(lesson => {
        if (subgroup !== 0 && lesson.numSubgroup !== 0 && lesson.numSubgroup !== subgroup) return false;
        if (lesson.weekNumber && lesson.weekNumber.length > 0) {
          if (!lesson.weekNumber.includes(selectedWeekNumber)) return false;
        }
        
        // English teacher filtering
        const isEnglish = (lesson.subject || "").toLowerCase().includes("иностранный язык");
        if (isEnglish && englishTeacherId) {
          const hasSelectedTeacher = lesson.employees?.some(emp => emp.urlId === englishTeacherId);
          if (!hasSelectedTeacher) return false;
        }

        return true;
      });
    }

    // Add custom plans for the selected date
    let expandedPlansForDay = [];
    
    customPlans.forEach(plan => {
      const planDate = new Date(plan.date || selectedDate);
      
      if (!plan.is_recurring) {
        if (isSameDay(planDate, selectedDate)) {
          expandedPlansForDay.push({...plan, generatedStartTime: plan.startTime, generatedEndTime: plan.endTime});
        }
        return;
      }
      
      // Handle recurring events
      const selected = startOfDay(selectedDate);
      const start = startOfDay(planDate);
      
      // Discard if selected date is before the plan starts
      if (selected < start) return;
      
      // Discard if selected date is after recurrence ends
      if (plan.recurrence_end_date) {
        const end = startOfDay(new Date(plan.recurrence_end_date));
        if (selected > end) return;
      }
      
      const interval = Math.max(1, plan.recurrence_interval || 1);
      
      if (plan.recurrence_type === 'hourly') {
        // Find if any instances fall on the selected date
        // Since we specify start time, we need to calculate exact instances based on the original start time
        // E.g., starts at 10:00, every 3 hours -> 10:00, 13:00, 16:00, 19:00
        
        let [sH, sM] = plan.startTime.split(':').map(Number);
        let [eH, eM] = plan.endTime.split(':').map(Number);
        const durationMins = (eH * 60 + eM) - (sH * 60 + sM);
        
        const originalDateTime = new Date(planDate);
        originalDateTime.setHours(sH, sM, 0, 0);
        
        const selectedStartOfDay = new Date(selectedDate);
        selectedStartOfDay.setHours(0, 0, 0, 0);
        const selectedEndOfDay = new Date(selectedDate);
        selectedEndOfDay.setHours(23, 59, 59, 999);
        
        // Let's generate instances until we hit the end of the selected day
        let currentInstance = new Date(originalDateTime);
        
        while (currentInstance <= selectedEndOfDay) {
          // If the instance is on the selected day, add it
          if (currentInstance >= selectedStartOfDay && currentInstance <= selectedEndOfDay) {
            const outStartH = currentInstance.getHours().toString().padStart(2, '0');
            const outStartM = currentInstance.getMinutes().toString().padStart(2, '0');
            
            const endInstance = new Date(currentInstance.getTime() + durationMins * 60000);
            const outEndH = endInstance.getHours().toString().padStart(2, '0');
            const outEndM = endInstance.getMinutes().toString().padStart(2, '0');
            
            expandedPlansForDay.push({
               ...plan,
               generatedStartTime: `${outStartH}:${outStartM}`,
               generatedEndTime: `${outEndH}:${outEndM}`,
               pseudoId: `${plan.id}_${format(selectedDate, 'yyyy-MM-dd')}_${outStartH}${outStartM}`
            });
          }
          currentInstance = new Date(currentInstance.getTime() + interval * 60 * 60 * 1000);
        }
        
        return; // Done with hourly
      }
      
      // Daily, Weekly, Biweekly
      const diffMs = selected.getTime() - start.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      let matchesDate = false;
      
      if (plan.recurrence_type === 'daily') {
        matchesDate = diffDays % interval === 0;
      } else if (plan.recurrence_type === 'weekly') {
        matchesDate = diffDays % (interval * 7) === 0;
      } else if (plan.recurrence_type === 'biweekly') {
        // Backwards compatibility
        matchesDate = diffDays % 14 === 0; 
      } else if (plan.recurrence_type === 'monthly') {
        const dMonths = differenceInMonths(selected, start);
        // Also check if days of month align (naive check: same day of month)
        // If start date was Jan 31, and selected is Feb 28, differenceInMonths handles it best effort, 
        // but let's just do a simple day of month check
        matchesDate = (dMonths % interval === 0) && (selected.getDate() === start.getDate());
      } else if (plan.recurrence_type === 'yearly') {
        const dYears = differenceInYears(selected, start);
        matchesDate = (dYears % interval === 0) && (selected.getDate() === start.getDate()) && (selected.getMonth() === start.getMonth());
      }
      
      if (matchesDate) {
        expandedPlansForDay.push({
           ...plan,
           generatedStartTime: plan.startTime,
           generatedEndTime: plan.endTime
        });
      }
    });

    const formattedPlans = expandedPlansForDay.map(p => ({
      ...p,
      lessonTypeAbbrev: p.type || 'CUSTOM',
      // Ensure we don't accidentally duplicate same event IDs if they repeat, 
      // though map index usually handles keying in rendering. Add a pseudo-id for keying if necessary.
      pseudoId: p.pseudoId || `${p.id}_${format(selectedDate, 'yyyy-MM-dd')}`,
      startLessonTime: p.generatedStartTime,
      endLessonTime: p.generatedEndTime,
      subject: p.title,
      isCustom: true
    }));

    return [...lessons, ...formattedPlans].sort((a, b) => a.startLessonTime.localeCompare(b.startLessonTime));
  }, [schedule, selectedDayName, selectedWeekNumber, subgroup, customPlans, selectedDate]);

  const handleAddPlan = () => {
    if (!newPlan.title) return;
    const eventDate = newPlan.date || format(selectedDate, 'yyyy-MM-dd');
    const eventToCreate = { ...newPlan, date: eventDate, recurrence_interval: parseInt(newPlan.recurrence_interval, 10) || 1 };
    
    // Cleanup empty strings for API
    if (!eventToCreate.recurrence_end_date) {
      eventToCreate.recurrence_end_date = null;
    }
    
    axios.post(`/api/events/${telegramId}`, eventToCreate)
      .then(res => {
        setCustomPlans([...customPlans, res.data]);
        setNewPlan({ title: '', startTime: '09:00', endTime: '10:30', type: 'CUSTOM', color: 'blue', date: format(selectedDate, 'yyyy-MM-dd'), is_recurring: false, recurrence_type: 'weekly', recurrence_end_date: '', recurrence_interval: 1 });
        setIsModalOpen(false);
      })
      .catch(console.error);
  };

  const deletePlan = (id) => {
    axios.delete(`/api/events/${id}`)
      .then(() => {
        setCustomPlans(customPlans.filter(p => p.id !== id));
      })
      .catch(console.error);
  };

  // --- Context Menu Handlers ---
  const showContextMenu = (e, lesson) => {
    e.preventDefault();
    e.stopPropagation();
    // Get position, clamped to viewport
    const x = Math.min(e.clientX || e.pageX, window.innerWidth - 200);
    const y = Math.min(e.clientY || e.pageY, window.innerHeight - 180);
    setContextMenu({ visible: true, x, y, lesson });
  };

  const handleEventTouchStart = (e, lesson) => {
    const touch = e.touches[0];
    eventTouchStart.current = { x: touch.clientX, y: touch.clientY };
    eventLongPressTimer.current = setTimeout(() => {
      eventLongPressTimer.current = null;
      if (window.navigator?.vibrate) window.navigator.vibrate(30);
      const x = Math.min(touch.clientX, window.innerWidth - 200);
      const y = Math.min(touch.clientY, window.innerHeight - 180);
      setContextMenu({ visible: true, x, y, lesson });
    }, 400);
  };

  const handleEventTouchMove = (e) => {
    if (eventLongPressTimer.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - eventTouchStart.current.x;
      const dy = touch.clientY - eventTouchStart.current.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearTimeout(eventLongPressTimer.current);
        eventLongPressTimer.current = null;
      }
    }
  };

  const handleEventTouchEnd = () => {
    if (eventLongPressTimer.current) {
      clearTimeout(eventLongPressTimer.current);
      eventLongPressTimer.current = null;
    }
  };

  const dismissContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, lesson: null });
  };

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu.visible) return;
    const handler = () => dismissContextMenu();
    window.addEventListener('click', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [contextMenu.visible]);

  const handleAddPlanForEvent = (lesson) => {
    dismissContextMenu();
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const eventId = `${dateKey}_${lesson.startLessonTime}_${lesson.subject}`;
    setNewTask({
      title: '',
      description: '',
      priority: 'medium',
      linkedEventId: eventId,
      linkedEventLabel: `${lesson.startLessonTime} - ${lesson.subject}`
    });
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = () => {
    if (!newTask.title.trim()) return;
    const taskToCreate = {
      title: newTask.title,
      description: newTask.description,
      priority: newTask.priority,
      linkedEventId: newTask.linkedEventId,
      created_at: Date.now(),
      reminders: (newTask.reminders || []).length > 0 ? JSON.stringify(newTask.reminders) : null
    };
    axios.post(`/api/tasks/${telegramId}`, taskToCreate)
      .then(res => {
        setPlannerTasks(prev => [res.data, ...(prev || [])]);
        // Also update localStorage for cross-page sync
        const currentTasks = Array.isArray(plannerTasks) ? plannerTasks : [];
        const updated = [res.data, ...currentTasks];
        localStorage.setItem('bsuir_tasks', JSON.stringify(updated));
        setIsTaskModalOpen(false);
        setNewTask({ title: '', description: '', priority: 'medium', linkedEventId: null, linkedEventLabel: '', reminders: [] });
      })
      .catch(console.error);
  };

  const handleEditEvent = (lesson) => {
    dismissContextMenu();
    setIsEditing(true);
    setEditEventId(lesson.id);
    setNewPlan({
      title: lesson.subject || lesson.title || '',
      startTime: lesson.startLessonTime || lesson.startTime,
      endTime: lesson.endLessonTime || lesson.endTime,
      type: lesson.lessonTypeAbbrev || lesson.type || 'CUSTOM',
      color: lesson.color || 'blue',
      date: lesson.date || format(selectedDate, 'yyyy-MM-dd'),
      is_recurring: lesson.is_recurring || false,
      recurrence_type: lesson.recurrence_type || 'weekly',
      recurrence_end_date: lesson.recurrence_end_date || '',
      recurrence_interval: lesson.recurrence_interval || 1
    });
    setIsModalOpen(true);
  };

  const handleDeleteFromMenu = (lesson) => {
    dismissContextMenu();
    deletePlan(lesson.id);
  };

  const handleUpdatePlan = () => {
    if (!newPlan.title || !editEventId) return;
    const eventData = { ...newPlan, recurrence_interval: parseInt(newPlan.recurrence_interval, 10) || 1 };
    if (!eventData.recurrence_end_date) eventData.recurrence_end_date = null;

    axios.put(`/api/events/${editEventId}`, eventData)
      .then(res => {
        setCustomPlans(customPlans.map(p => p.id === editEventId ? res.data : p));
        setIsEditing(false);
        setEditEventId(null);
        setNewPlan({ title: '', startTime: '09:00', endTime: '10:30', type: 'CUSTOM', color: 'blue', date: format(selectedDate, 'yyyy-MM-dd'), is_recurring: false, recurrence_type: 'weekly', recurrence_end_date: '', recurrence_interval: 1 });
        setIsModalOpen(false);
      })
      .catch(console.error);
  };

  const getTimeFromY = (y) => {
    const totalMinutes = Math.floor((y / 80) * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor((totalMinutes % 60) / 5) * 5; // Round to 5 mins
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const getClientPos = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
  };

  const handlePointerStart = (e) => {
    if (viewMode !== 'calendar' || dragState.isDragging) return;
    if (e.type === 'mousedown' && e.button !== 0) return; // Only left click for mouse
    
    const { clientX, clientY } = getClientPos(e);
    const rect = gridRef.current.getBoundingClientRect();
    const startY = clientY - rect.top;
    
    touchStartPos.current = { x: clientX, y: clientY };
    lastClientY.current = clientY;
    dragStartYRef.current = startY;
    dragCurrentYRef.current = startY;
    
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      isDraggingRef.current = true;
      setDragState({ isDragging: true, startY: startY, currentY: startY });
      if (window.navigator?.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 300);
  };

  useEffect(() => {
    const gridEl = gridRef.current;
    if (!gridEl) return;

    const onTouchStart = (e) => {
      handlePointerStart(e);
    };

    const onTouchMove = (e) => {
      if (isDraggingRef.current) {
        if (e.cancelable) e.preventDefault();
      }
      handlePointerMove(e);
    };

    const onTouchEnd = (e) => {
      handlePointerEnd();
    };

    gridEl.addEventListener('touchstart', onTouchStart, { passive: false });
    gridEl.addEventListener('touchmove', onTouchMove, { passive: false });
    gridEl.addEventListener('touchend', onTouchEnd, { passive: false });
    gridEl.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      gridEl.removeEventListener('touchstart', onTouchStart);
      gridEl.removeEventListener('touchmove', onTouchMove);
      gridEl.removeEventListener('touchend', onTouchEnd);
      gridEl.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [viewMode, dragState.isDragging]); // Re-attach if mode changes

  const autoScrollDir = useRef(0);
  const lastClientY = useRef(0);
  const autoScrollRaf = useRef(null);

  const handlePointerMove = (e) => {
    const { clientX, clientY } = getClientPos(e);

    if (!dragState.isDragging) {
      if (longPressTimer.current) {
        const dx = clientX - touchStartPos.current.x;
        const dy = clientY - touchStartPos.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }
      return;
    }
    
    lastClientY.current = clientY;
    const rect = gridRef.current.getBoundingClientRect();
    
    // Convert screen Y to relative Y in grid
    let pointerY = lastClientY.current - rect.top;
    
    // Allow dragging a bit below the visible area to trigger the scroll, but cap for visual
    const logicalHeight = 24 * 80; // 1920px
    const visualPointerY = Math.max(0, Math.min(pointerY, logicalHeight));

    dragCurrentYRef.current = visualPointerY;
    setDragState(prev => ({ ...prev, currentY: visualPointerY }));
    
    // Auto-scroll logic threshold detection
    if (scrollContainerRef.current) {
      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      
      // Top edge scroll
      if (lastClientY.current - containerRect.top < 60 || lastClientY.current < 140) {
        autoScrollDir.current = -8;
      } 
      // Bottom edge scroll - check near bottom menu
      else if (window.innerHeight - lastClientY.current < 120) {
        autoScrollDir.current = 8;
      } else {
        autoScrollDir.current = 0;
      }
    }
  };

  useEffect(() => {
    const handleAutoScroll = () => {
      if (dragState.isDragging && autoScrollDir.current !== 0 && scrollContainerRef.current && gridRef.current) {
        scrollContainerRef.current.scrollTop += autoScrollDir.current;
        
        const rect = gridRef.current.getBoundingClientRect();
        // Recalculate the touch coordinate against the grid's top
        let touchY = lastClientY.current - rect.top;
        
        // Ensure touchY doesn't exceed the logical height of the grid 
        // (1440px for 24h * 60m), and not just the visually compressed rect.height 
        // which might break on mobile.
        const logicalHeight = Array.from({ length: 24 }).length * 80; // 1920px (24 hours * 80px)
        const visualTouchY = Math.max(0, Math.min(touchY, logicalHeight));
        
        setDragState(prev => ({ ...prev, currentY: visualTouchY }));
      }
      autoScrollRaf.current = requestAnimationFrame(handleAutoScroll);
    };

    if (dragState.isDragging) {
      autoScrollRaf.current = requestAnimationFrame(handleAutoScroll);
    } else {
      autoScrollDir.current = 0;
      if (autoScrollRaf.current) cancelAnimationFrame(autoScrollRaf.current);
    }

    return () => {
      if (autoScrollRaf.current) cancelAnimationFrame(autoScrollRaf.current);
    };
  }, [dragState.isDragging]);

  const handlePointerEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    
    const y1 = Math.min(dragStartYRef.current, dragCurrentYRef.current);
    const y2 = Math.max(dragStartYRef.current, dragCurrentYRef.current);
    
    // Minimum 15 mins drag to trigger (20px)
    if (y2 - y1 > 20) {
      // Use set timeout to ensure the modal state actually triggers 
      // even if the drag state cleanup happens simultaneously
      setTimeout(() => {
        setNewPlan(prev => ({
          ...prev,
          startTime: getTimeFromY(y1),
          endTime: getTimeFromY(y2),
          type: 'CUSTOM',
          date: format(selectedDate, 'yyyy-MM-dd')
        }));
        setIsModalOpen(true);
      }, 50);
    }
    
    setDragState({ isDragging: false, startY: 0, currentY: 0 });
  };

  return (
    <div className="p-4 relative min-h-[calc(100vh-4rem)] flex flex-col max-w-2xl mx-auto w-full">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-tg-text">
            <CalendarDays size={28} className="text-tg-button" />
            Расписание
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-[11px] text-tg-hint font-bold bg-tg-secondaryBg px-2 py-0.5 rounded-lg border border-[var(--tg-theme-hint-color)] border-opacity-20 uppercase">
              {format(selectedDate, 'LLLL yyyy', { locale: ru })} • {selectedWeekNumber} неделя
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex bg-tg-secondaryBg p-1 rounded-xl border border-[var(--tg-theme-hint-color)] border-opacity-10 mr-2 shadow-sm">
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-[var(--tg-theme-bg-color)] text-tg-button shadow-sm' : 'text-tg-hint hover:text-tg-text'}`}
            >
              <List size={18} />
            </button>
            <button 
              onClick={() => setViewMode('calendar')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'calendar' ? 'bg-[var(--tg-theme-bg-color)] text-tg-button shadow-sm' : 'text-tg-hint hover:text-tg-text'}`}
            >
              <CalendarIcon size={18} />
            </button>
          </div>

          <button 
            onClick={() => navigate('/settings')}
            className="p-2.5 bg-tg-secondaryBg text-tg-hint hover:text-tg-button rounded-xl border border-[var(--tg-theme-hint-color)] border-opacity-10 shadow-sm transition-all"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* DATE STRIP */}
      <div className="-mx-4 px-4 mb-6">
        <div 
          ref={daysRef}
          className="flex overflow-x-auto gap-2 pb-2 hide-scrollbar snap-x snap-mandatory px-4 md:px-0"
        >
          {dateStrip.map((date, i) => {
            const isSelected = isSameDay(date, selectedDate);
            const isToday = isSameDay(date, now);
            
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center min-w-[50px] p-2 rounded-2xl snap-center transition-all duration-200 border ${
                  isSelected 
                    ? 'bg-tg-button text-tg-buttonText border-tg-button shadow-md active-date scale-105' 
                    : isToday 
                      ? 'bg-[var(--tg-theme-bg-color)] border-tg-button text-tg-text' 
                      : 'bg-tg-secondaryBg border-transparent text-tg-text hover:bg-[var(--tg-theme-bg-color)]'
                }`}
              >
                <span className={`text-[10px] font-bold uppercase mb-1 ${isSelected ? 'text-tg-buttonText opacity-90' : 'text-tg-hint'}`}>
                  {format(date, 'eee', { locale: ru })}
                </span>
                <span className={`text-lg font-black ${isSelected ? 'text-tg-buttonText' : ''}`}>
                  {format(date, 'd')}
                </span>
                {isToday && !isSelected && <div className="w-1 h-1 rounded-full bg-tg-button mt-1"></div>}
                {isSelected && <div className="w-1 h-1 rounded-full bg-white mt-1 opacity-80"></div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-y-auto hide-scrollbar pb-20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-tg-text capitalize">{format(selectedDate, 'EEEE, d MMMM', { locale: ru })}</h2>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setNewPlan({ title: '', startTime: '09:00', endTime: '10:30', type: 'CUSTOM', color: 'blue', date: format(selectedDate, 'yyyy-MM-dd'), is_recurring: false, recurrence_type: 'weekly', recurrence_end_date: '', recurrence_interval: 1 });
                setIsModalOpen(true);
              }}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-tg-button hover:bg-tg-button hover:text-tg-buttonText px-2 py-1 rounded-lg transition-all border border-tg-button"
            >
              <Plus size={14} /> План
            </button>
            <span className="text-[11px] font-bold text-tg-hint bg-tg-secondaryBg px-2 py-1 rounded-lg uppercase tracking-wider border border-[var(--tg-theme-hint-color)] border-opacity-10">
              {activeLessons.length} Событий
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-tg-hint">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-tg-button mb-4"></div>
            <p className="font-medium text-sm animate-pulse">Загрузка расписания...</p>
          </div>
        ) : viewMode === 'list' ? (
          activeLessons.length > 0 ? (
            <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[var(--tg-theme-hint-color)] before:to-transparent before:opacity-20">
              {activeLessons.map((lesson, idx) => {
                const colors = getLessonColor(lesson);
                const progress = getLessonProgress(lesson);
                const isPast = progress === 1;
                const isActive = progress > 0 && progress < 1;
                const progressPct = (typeof progress === 'number' && progress > 0 && progress < 1) ? Math.round(progress * 100) : 0;
                return (
                  <div key={lesson.pseudoId || idx} className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active transition-opacity duration-300 ${isPast ? 'opacity-50' : ''}`}>
                    {/* Timeline dot */}
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-tg-bg shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-transform group-hover:scale-110 ${isActive ? 'bg-tg-button border-tg-button scale-110' : 'bg-[var(--tg-theme-bg-color)] group-hover:border-tg-button'}`}>
                      <span className={`text-xs font-black ${isActive ? 'text-tg-buttonText' : colors.text}`}>{isPast ? '✓' : idx + 1}</span>
                    </div>
                    
                    {/* Card */}
                    <div 
                      onClick={() => setExpandedLessonId(expandedLessonId === (lesson.pseudoId || idx) ? null : (lesson.pseudoId || idx))}
                      onContextMenu={(e) => showContextMenu(e, lesson)}
                      onTouchStart={(e) => handleEventTouchStart(e, lesson)}
                      onTouchMove={handleEventTouchMove}
                      onTouchEnd={handleEventTouchEnd}
                      className={`w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] bg-tg-secondaryBg rounded-2xl p-4 shadow-sm border border-opacity-10 relative overflow-hidden select-none transition-all cursor-pointer hover:shadow-md hover:-translate-y-1 ${isActive ? 'border-tg-button ring-1 ring-tg-button/30 shadow-md' : 'border-[var(--tg-theme-hint-color)]'}`}
                    >
                      {/* Progress fill overlay */}
                      {isActive && (
                        <div 
                          className={`absolute bottom-0 left-0 right-0 ${colors.bg} opacity-[0.08] transition-all duration-1000 ease-linear`}
                          style={{ height: `${progressPct}%` }}
                        />
                      )}
                      {isPast && (
                        <div className="absolute inset-0 bg-[var(--tg-theme-hint-color)] opacity-[0.04]" />
                      )}
                      {/* Lesson Type Banner */}
                      <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl font-black text-[10px] tracking-widest uppercase ${colors.bg} text-tg-buttonText shadow-sm z-10`}>
                        {lesson.lessonTypeAbbrev}
                      </div>

                      {/* Subgroup Badge */}
                      {lesson.numSubgroup !== 0 && (
                        <div className="absolute top-0 right-[4.5rem] px-2 py-1 rounded-bl-xl font-black text-[10px] uppercase bg-orange-500 text-white z-10">
                          {lesson.numSubgroup} ПОДГР
                        </div>
                      )}

                      <div className="flex flex-col gap-3">
                        {/* Time */}
                        <div className={`flex items-center gap-1.5 font-bold text-sm ${colors.text} ${colors.light} w-max px-2 py-1 rounded-lg`}>
                          <Clock size={14} />
                          {lesson.startLessonTime} <span className="opacity-50 mx-0.5">-</span> {lesson.endLessonTime}
                        </div>

                         {/* Subject */}
                        <div className="pr-4">
                          <h3 className="font-bold text-[15px] leading-tight text-tg-text">
                            {lesson.subject}
                          </h3>
                          {lesson.subjectFullName && lesson.subjectFullName !== lesson.subject && (
                            <p className="text-xs text-tg-hint mt-1 line-clamp-1">{lesson.subjectFullName}</p>
                          )}
                          {lesson.employees && lesson.employees.length > 0 && (
                            <p className="text-xs text-tg-hint mt-1 font-medium">
                              {lesson.employees.map(e => `${e.lastName} ${e.firstName?.[0] || ''}.${e.middleName ? ` ${e.middleName[0]}.` : ''}`).join(', ')}
                            </p>
                          )}
                        </div>

                        {/* Linked Tasks */}
                        {(() => {
                          const dateKey = format(selectedDate, 'yyyy-MM-dd');
                          const eventId = `${dateKey}_${lesson.startLessonTime}_${lesson.subject}`;
                          const links = plannerTasks.filter(t => t.linkedEventId === eventId && !t.is_completed);
                          if (links.length === 0) return null;
                          return (
                            <div className="flex flex-col gap-1.5 mt-1 bg-tg-bg/40 p-2 rounded-xl border border-[var(--tg-theme-hint-color)] border-opacity-10">
                              <span className="text-[10px] font-black uppercase text-tg-hint flex items-center gap-1">
                                <CheckCircle2 size={10} /> Задачи ({links.length}):
                              </span>
                              {links.map(link => (
                                <div key={link.id} className="text-xs text-tg-text flex items-center gap-1.5 font-medium">
                                  <div className="w-1 h-1 rounded-full bg-tg-button" />
                                  <span className="truncate">{link.title}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Metadata */}
                        {!lesson.isCustom && (
                          <div className="grid gap-2 text-[13px] pt-3 border-t border-[var(--tg-theme-hint-color)] border-opacity-10">

                            {lesson.auditories && lesson.auditories.length > 0 && (
                              <div className="flex items-start gap-2 justify-between w-full">
                                <div className="flex items-center gap-2 text-tg-hint">
                                  <MapPin size={14} className="shrink-0 opacity-70" />
                                  <span className="font-medium">{lesson.auditories.join(', ')}</span>
                                </div>
                                {lesson.note && (
                                  <span className="text-[10px] bg-[var(--tg-theme-bg-color)] px-1.5 py-0.5 rounded text-tg-hint truncate max-w-[120px]">
                                    {lesson.note}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Expanded details */}
                        <div className={`grid transition-all duration-300 ease-in-out ${expandedLessonId === (lesson.pseudoId || idx) ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}>
                          <div className="overflow-hidden">
                            {!lesson.isCustom && (
                              <div className="flex flex-col gap-3 pt-3 border-t border-[var(--tg-theme-hint-color)] border-opacity-10">
                                {/* Teachers Info */}
                                {lesson.employees && lesson.employees.length > 0 && (
                                  <div className="flex flex-col gap-2">
                                    <span className="text-[10px] font-black uppercase text-tg-hint tracking-wider">Преподаватели</span>
                                    <div className="flex flex-col gap-2">
                                      {lesson.employees.map((emp, i) => (
                                        <div key={i} className="flex items-center gap-2.5 bg-tg-bg/50 p-2 rounded-xl border border-[var(--tg-theme-hint-color)] border-opacity-5">
                                          {emp.photoLink ? (
                                            <img src={emp.photoLink} alt="Avatar" className="w-8 h-8 rounded-full object-cover shrink-0" onError={(e) => { e.target.onerror = null; e.target.src = 'https://ui-avatars.com/api/?name=' + emp.lastName + '&background=random'; }} />
                                          ) : (
                                            <div className="w-8 h-8 rounded-full bg-tg-button/20 text-tg-button flex items-center justify-center font-bold text-xs shrink-0">
                                              {emp.lastName?.[0] || '?'}
                                            </div>
                                          )}
                                          <div className="flex flex-col">
                                            <span className="text-xs font-bold text-tg-text">{emp.lastName} {emp.firstName} {emp.middleName}</span>
                                            {emp.degree && <span className="text-[10px] text-tg-hint leading-tight">{emp.degree}</span>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Prev / Next occurrences */}
                                {(() => {
                                  const renderOccurrence = (occ, label) => {
                                    if (!occ) return (
                                      <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-tg-bg/30 border border-tg-hint/10 flex-1">
                                         <span className="text-[9px] uppercase font-black text-tg-hint/70 mb-0.5">{label}</span>
                                         <span className="text-xs font-medium text-tg-hint">Нет данных</span>
                                      </div>
                                    );
                                    return (
                                      <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-tg-bg/50 border border-tg-hint/10 flex-1 cursor-pointer hover:bg-tg-bg transition-colors"
                                           onClick={(e) => { e.stopPropagation(); setSelectedDate(occ.date); }}>
                                         <span className="text-[9px] uppercase font-black text-tg-hint mb-0.5">{label}</span>
                                         <span className="text-xs font-bold text-tg-text">{format(occ.date, 'd MMM', { locale: ru })}</span>
                                         <span className="text-[10px] font-medium text-tg-hint">{occ.lesson.startLessonTime}</span>
                                      </div>
                                    );
                                  };
                                  
                                  const isExpanded = expandedLessonId === (lesson.pseudoId || idx);
                                  // Compute only when expanded
                                  const prevOcc = isExpanded ? findOccurrence('prev', lesson.subject, lesson.lessonTypeAbbrev, selectedDate) : null;
                                  const nextOcc = isExpanded ? findOccurrence('next', lesson.subject, lesson.lessonTypeAbbrev, selectedDate) : null;
                                  
                                  return (
                                    <div className="flex items-stretch gap-2 mt-1">
                                       {renderOccurrence(prevOcc, "Прошлая")}
                                       {renderOccurrence(nextOcc, "Следующая")}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-tg-hint bg-tg-secondaryBg rounded-3xl border border-dashed border-[var(--tg-theme-hint-color)] border-opacity-30">
              <div className="w-16 h-16 bg-[var(--tg-theme-bg-color)] rounded-full flex items-center justify-center mb-4 shadow-inner">
                <span className="text-2xl opacity-60">🏖️</span>
              </div>
              <h3 className="text-lg font-bold text-tg-text mb-1">Пусто!</h3>
              <p className="text-sm font-medium opacity-80 text-center max-w-[200px]">
                На этот день нет занятий или планов.
              </p>
            </div>
          )
        ) : (
          /* CALENDAR GRID VIEW */
          <div className="relative bg-tg-secondaryBg rounded-3xl border border-[var(--tg-theme-hint-color)] border-opacity-10 overflow-hidden">
            <div 
              ref={scrollContainerRef}
              className="grid grid-cols-[50px_1fr] h-[600px] overflow-y-auto hide-scrollbar select-none"
            >
              {/* Time Column */}
              <div className="bg-tg-bg/50 border-r border-[var(--tg-theme-hint-color)] border-opacity-10 relative">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} className="h-20 text-[10px] text-tg-hint font-bold flex items-start justify-center pt-2 border-b border-[var(--tg-theme-hint-color)] border-opacity-5">
                    {i.toString().padStart(2, '0')}:00
                  </div>
                ))}
                {/* Current Time Label */}
                {isSameDay(selectedDate, now) && (() => {
                  const nowMinutes = now.getHours() * 60 + now.getMinutes();
                  const nowTop = (nowMinutes / 60) * 80;
                  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                  return (
                    <div 
                      className="absolute left-0 right-0 z-30 flex items-center justify-center pointer-events-none"
                      style={{ top: `${nowTop - 8}px` }}
                    >
                      <span className="text-[9px] font-black text-red-500 bg-red-500/10 px-1 py-0.5 rounded">{timeStr}</span>
                    </div>
                  );
                })()}
              </div>
              
              {/* Events Grid */}
              <div 
                ref={gridRef}
                className={`relative select-none ${dragState.isDragging ? 'touch-none overscroll-none' : ''}`}
                style={{ touchAction: dragState.isDragging ? 'none' : 'pan-y' }}
                onMouseDown={handlePointerStart}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerEnd}
                onMouseLeave={handlePointerEnd}
              >
                {/* Hour Lines */}
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} className="h-20 border-b border-[var(--tg-theme-hint-color)] border-opacity-5 w-full"></div>
                ))}

                {/* Current Time Indicator */}
                {isSameDay(selectedDate, now) && (() => {
                  const nowMinutes = now.getHours() * 60 + now.getMinutes();
                  const nowTop = (nowMinutes / 60) * 80;
                  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                  return (
                    <div 
                      className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                      style={{ top: `${nowTop}px` }}
                    >
                      {/* Red dot */}
                      <div className="w-3 h-3 rounded-full bg-red-500 -ml-1.5 shadow-lg shadow-red-500/50 animate-pulse shrink-0" />
                      {/* Red line */}
                      <div className="flex-1 h-[2px] bg-red-500 shadow-sm shadow-red-500/30" />
                    </div>
                  );
                })()}

                {/* Ghost Selection */}
                {dragState.isDragging && (
                  <>
                    {/* Interaction Shield */}
                    <div className="absolute inset-0 z-40 bg-transparent cursor-ns-resize" />
                    
                    <div 
                      style={{ 
                        top: `${Math.min(dragState.startY, dragState.currentY)}px`, 
                        height: `${Math.abs(dragState.currentY - dragState.startY)}px` 
                      }}
                      className="absolute left-2 right-2 bg-tg-button/30 border-2 border-dashed border-tg-button rounded-xl z-50 flex items-center justify-center shadow-lg"
                    >
                      <div className="bg-tg-button text-tg-buttonText text-[10px] font-black px-2 py-0.5 rounded-lg shadow-sm">
                        {getTimeFromY(Math.min(dragState.startY, dragState.currentY))} - {getTimeFromY(Math.max(dragState.startY, dragState.currentY))}
                      </div>
                    </div>
                  </>
                )}
                
                {/* Events */}
                {activeLessons.map((lesson, idx) => {
                  const [startH, startM] = lesson.startLessonTime.split(':').map(Number);
                  const [endH, endM] = lesson.endLessonTime.split(':').map(Number);
                  
                  const top = (startH * 80) + (startM / 60 * 80);
                  const duration = (endH * 60 + endM) - (startH * 60 + startM);
                  const height = (duration / 60 * 80);
                  const colors = getLessonColor(lesson);
                  const progress = getLessonProgress(lesson);
                  const isPast = progress === 1;
                  const isActive = progress > 0 && progress < 1;
                  const progressPct = (typeof progress === 'number' && progress > 0 && progress < 1) ? Math.round(progress * 100) : 0;
                                    return (
                      <div 
                        key={lesson.pseudoId || idx}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        onContextMenu={(e) => showContextMenu(e, lesson)}
                        onTouchStart={(e) => { if (!isDraggingRef.current) handleEventTouchStart(e, lesson); }}
                        onTouchMove={(e) => { if (!isDraggingRef.current) handleEventTouchMove(e); }}
                        onTouchEnd={(e) => { if (!isDraggingRef.current) handleEventTouchEnd(); }}
                        className={`absolute left-2 right-2 rounded-xl p-2 border-l-4 shadow-sm flex flex-col justify-between overflow-hidden select-none transition-all hover:scale-[1.02] hover:z-20 ${colors.light} ${colors.border} ${isPast ? 'opacity-50' : ''} ${isActive ? 'ring-1 ring-tg-button/40 shadow-md z-10' : ''}`}
                      >
                        {/* Progress fill overlay for calendar view */}
                        {isActive && (
                          <div 
                            className={`absolute bottom-0 left-0 right-0 ${colors.bg} opacity-[0.12] transition-all duration-1000 ease-linear`}
                            style={{ height: `${progressPct}%` }}
                          />
                        )}
                        {isPast && (
                          <div className="absolute inset-0 bg-[var(--tg-theme-hint-color)] opacity-[0.06]" />
                        )}
                        <div>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`text-[9px] font-black uppercase ${colors.text}`}>{lesson.lessonTypeAbbrev}</span>
                            <span className="text-[9px] font-bold text-tg-hint">{lesson.startLessonTime}</span>
                          </div>
                            <h4 className="text-[11px] font-bold leading-tight text-tg-text line-clamp-2">{lesson.subject}</h4>
                          {lesson.employees && lesson.employees.length > 0 && (
                            <div className="text-[9px] mt-0.5 truncate text-tg-hint font-medium">
                              {lesson.employees.map(e => `${e.lastName} ${e.firstName?.[0] || ''}.${e.middleName ? ` ${e.middleName[0]}.` : ''}`).join(', ')}
                            </div>
                          )}
                          
                          {/* Task Count Badge for Grid */}
                          {(() => {
                             const dateKey = format(selectedDate, 'yyyy-MM-dd');
                             const eventId = `${dateKey}_${lesson.startLessonTime}_${lesson.subject}`;
                             const count = plannerTasks.filter(t => t.linkedEventId === eventId && !t.is_completed).length;
                             if (count === 0) return null;
                             return (
                               <div className="mt-1 flex items-center gap-1 text-[9px] font-black p-1 rounded-md bg-white/20 text-white backdrop-blur-sm w-fit">
                                 <CheckCircle2 size={10} /> {count}
                               </div>
                             );
                          })()}

                          </div>
                          <div className="flex items-center justify-between mt-auto">
                          <span className="text-[9px] font-medium text-tg-hint truncate">
                            {lesson.auditories?.[0] || lesson.note || ''}
                          </span>
                          {lesson.isCustom && (
                            <span className="text-[9px] font-black text-tg-hint opacity-40 uppercase">Своё</span>
                          )}
                        </div>
                      </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CONTEXT MENU */}
      {contextMenu.visible && (
        <div 
          className="fixed z-[60] animate-fade-in"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-tg-secondaryBg rounded-2xl shadow-2xl border border-[var(--tg-theme-hint-color)] border-opacity-20 overflow-hidden min-w-[200px] backdrop-blur-xl">
            <button
              onClick={() => handleAddPlanForEvent(contextMenu.lesson)}
              className="flex items-center gap-3 w-full px-4 py-3 text-left text-sm font-semibold text-tg-text hover:bg-tg-bg transition-colors"
            >
              <ClipboardList size={16} className="text-tg-button" />
              Добавить план
            </button>
            {contextMenu.lesson?.isCustom && (
              <>
                <div className="h-px bg-[var(--tg-theme-hint-color)] opacity-10 mx-3" />
                <button
                  onClick={() => handleEditEvent(contextMenu.lesson)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left text-sm font-semibold text-tg-text hover:bg-tg-bg transition-colors"
                >
                  <Edit2 size={16} className="text-amber-500" />
                  Редактировать
                </button>
                <div className="h-px bg-[var(--tg-theme-hint-color)] opacity-10 mx-3" />
                <button
                  onClick={() => handleDeleteFromMenu(contextMenu.lesson)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left text-sm font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={16} />
                  Удалить
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* PLAN ADD / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setIsModalOpen(false); setIsEditing(false); setEditEventId(null); }} />
          <div className="relative bg-tg-secondaryBg w-full max-w-md rounded-t-3xl shadow-2xl transition-transform animate-slide-up max-h-[85vh] flex flex-col mb-[70px]">
            <div className="flex items-center justify-between p-6 pb-2">
              <h2 className="text-xl font-bold text-tg-text">{isEditing ? 'Редактировать' : 'Новый план'}</h2>
              <button type="button" onClick={() => { setIsModalOpen(false); setIsEditing(false); setEditEventId(null); }} className="text-tg-hint bg-tg-bg p-2 rounded-full"><X size={20} /></button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); isEditing ? handleUpdatePlan() : handleAddPlan(); }} className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto overflow-x-hidden px-6 flex-1">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Название</label>
                <input 
                  type="text"
                  value={newPlan.title}
                  onChange={(e) => setNewPlan({...newPlan, title: e.target.value})}
                  placeholder="Напр. Подготовка к лабам"
                  className="w-full px-4 h-[52px] rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium appearance-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Дата</label>
                <input 
                  type="date"
                  value={newPlan.date || format(selectedDate, 'yyyy-MM-dd')}
                  onChange={(e) => setNewPlan({...newPlan, date: e.target.value})}
                  className="w-full px-4 h-[52px] rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium appearance-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Начало</label>
                  <input 
                    type="time"
                    step="60"
                    value={newPlan.startTime}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      const updates = { startTime: newStart };
                      if (newStart >= newPlan.endTime) {
                        const [h, m] = newStart.split(':').map(Number);
                        const endMin = h * 60 + m + 30;
                        updates.endTime = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`;
                      }
                      setNewPlan({...newPlan, ...updates});
                    }}
                    className="w-full px-4 h-[52px] rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium appearance-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Конец</label>
                  <input 
                    type="time"
                    step="60"
                    value={newPlan.endTime}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val <= newPlan.startTime) {
                        const [h, m] = newPlan.startTime.split(':').map(Number);
                        const clamped = h * 60 + m + 1;
                        val = `${Math.floor(clamped / 60).toString().padStart(2,'0')}:${(clamped % 60).toString().padStart(2,'0')}`;
                      }
                      setNewPlan({...newPlan, endTime: val});
                    }}
                    className="w-full px-4 h-[52px] rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium appearance-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Тип</label>
                <div className="flex gap-2">
                  {['CUSTOM', 'ЛК', 'ПЗ', 'ЛР'].map(t => (
                    <button
                      key={t}
                      onClick={() => setNewPlan({...newPlan, type: t})}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border-2 ${
                        newPlan.type === t 
                          ? 'bg-tg-button text-tg-buttonText border-tg-button shadow-md' 
                          : 'bg-tg-bg text-tg-hint border-transparent'
                      }`}
                    >
                      {t === 'CUSTOM' ? 'Личное' : t}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="bg-tg-bg/50 p-4 rounded-2xl border border-[var(--tg-theme-hint-color)] border-opacity-10 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className="relative flex items-center justify-center w-6 h-6 rounded bg-tg-bg border-2 border-tg-hint/30 transition-all overflow-hidden shrink-0">
                    <input 
                      type="checkbox"
                      checked={newPlan.is_recurring}
                      onChange={(e) => setNewPlan({...newPlan, is_recurring: e.target.checked})}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer peer"
                    />
                    <div className="absolute inset-0 bg-tg-button opacity-0 peer-checked:opacity-100 transition-opacity" />
                    <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-tg-text">Повторять событие</span>
                </label>

                {newPlan.is_recurring && (
                  <div className="grid gap-4 mt-2 pt-4 border-t border-[var(--tg-theme-hint-color)] border-opacity-10 animate-fade-in">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Интервал</label>
                        <input 
                          type="number"
                          min="1"
                          max="99"
                          value={newPlan.recurrence_interval || 1}
                          onChange={(e) => setNewPlan({...newPlan, recurrence_interval: e.target.value})}
                          className="w-full px-4 h-[52px] rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium appearance-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Как часто?</label>
                        <select 
                          value={newPlan.recurrence_type}
                          onChange={(e) => setNewPlan({...newPlan, recurrence_type: e.target.value})}
                          className="w-full px-4 h-[52px] rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium appearance-none"
                        >
                          <option value="hourly">Часов</option>
                          <option value="daily">Дней</option>
                          <option value="weekly">Недель</option>
                          <option value="monthly">Месяцев</option>
                          <option value="yearly">Лет</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">
                        Повторять до (необязательно)
                      </label>
                      <input 
                        type="date"
                        value={newPlan.recurrence_end_date || ''}
                        onChange={(e) => setNewPlan({...newPlan, recurrence_end_date: e.target.value})}
                        className="w-full px-4 h-[52px] rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium appearance-none"
                        min={newPlan.date || format(selectedDate, 'yyyy-MM-dd')}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Цвет события</label>
                <div className="flex gap-2 items-center flex-wrap">
                  {Object.keys(COLOR_PRESETS).map(colorKey => (
                    <button
                      key={colorKey}
                      onClick={() => setNewPlan({...newPlan, color: colorKey})}
                      className={`w-10 h-10 rounded-full border-2 transition-all ${
                        newPlan.color === colorKey 
                          ? 'border-tg-button scale-110 shadow-lg' 
                          : 'border-transparent'
                      } ${COLOR_PRESETS[colorKey].bg}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--tg-theme-hint-color)] border-opacity-10">
              <button 
                type="submit"
                className={`w-full py-4 font-bold rounded-2xl active:scale-[0.98] transition-all shadow-lg text-base ${isEditing ? 'bg-amber-500 text-white shadow-amber-500/30' : 'bg-tg-button text-tg-buttonText shadow-tg-button/30'}`}
              >
                {isEditing ? 'Сохранить изменения' : 'Сохранить в расписание'}
              </button>
            </div>
            </form>
          </div>
        </div>
      )}
      {/* TASK CREATION MODAL (linked to event) */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-[55] flex items-end justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsTaskModalOpen(false)} />
          <div className="relative bg-tg-secondaryBg w-full max-w-md rounded-t-3xl shadow-2xl transition-transform animate-slide-up max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-6 pb-2">
              <h2 className="text-xl font-bold text-tg-text">Новая задача</h2>
              <button type="button" onClick={() => setIsTaskModalOpen(false)} className="text-tg-hint bg-tg-bg p-2 rounded-full"><X size={20} /></button>
            </div>
            
            {/* Linked event badge */}
            {newTask.linkedEventLabel && (
              <div className="mx-6 mb-2 flex items-center gap-2 text-xs font-bold text-tg-button bg-tg-button/10 px-3 py-2 rounded-xl border border-tg-button/20">
                <ClipboardList size={14} />
                Привязано к: {newTask.linkedEventLabel}
              </div>
            )}

            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto overflow-x-hidden px-6 flex-1">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Название</label>
                    <input 
                      type="text"
                      value={newTask.title}
                      onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                      placeholder="Что нужно сделать?"
                      className="w-full px-4 h-[52px] rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium appearance-none"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Описание</label>
                    <textarea 
                      value={newTask.description}
                      onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                      placeholder="Дополнительные детали..."
                      className="w-full px-4 py-3 rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium resize-none h-24 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Приоритет</label>
                    <div className="flex gap-2">
                      {[{key: 'low', label: 'Низкий', color: 'blue'}, {key: 'medium', label: 'Средний', color: 'amber'}, {key: 'high', label: 'Высокий', color: 'red'}].map(p => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setNewTask({...newTask, priority: p.key})}
                          className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all border-2 ${
                            newTask.priority === p.key 
                              ? `bg-${p.color}-500 text-white border-${p.color}-500 shadow-md` 
                              : 'bg-tg-bg text-tg-hint border-transparent'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Reminders */}
                  <div>
                    <label className="text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1 flex items-center gap-1.5">
                      <Bell size={12} /> Напомнить за
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 5, label: '5 мин' },
                        { value: 15, label: '15 мин' },
                        { value: 30, label: '30 мин' },
                        { value: 60, label: '1 час' },
                        { value: 120, label: '2 часа' },
                        { value: 1440, label: '1 день' },
                      ].map(r => {
                        const isActive = (newTask.reminders || []).includes(r.value);
                        return (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => {
                              setNewTask(prev => ({
                                ...prev,
                                reminders: isActive
                                  ? (prev.reminders || []).filter(v => v !== r.value)
                                  : [...(prev.reminders || []), r.value].sort((a, b) => a - b)
                              }));
                            }}
                            className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border-2 ${
                              isActive
                                ? 'bg-tg-button text-tg-buttonText border-tg-button shadow-md'
                                : 'bg-tg-bg text-tg-hint border-transparent'
                            }`}
                          >
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                    {(newTask.reminders || []).length > 0 && (
                      <div className="mt-2 text-[10px] text-tg-hint font-medium ml-1">
                        Выбрано: {(newTask.reminders || []).map(r => {
                          if (r >= 1440) return `${r / 1440} д`;
                          if (r >= 60) return `${r / 60} ч`;
                          return `${r} мин`;
                        }).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-[var(--tg-theme-hint-color)] border-opacity-10 mb-safe">
                <button 
                  type="button"
                  onClick={(e) => { 
                    e.preventDefault(); 
                    console.log('Task Add button clicked, calling handleSaveTask...', newTask);
                    handleSaveTask(); 
                  }}
                  className="w-full py-4 bg-tg-button text-tg-buttonText font-bold rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-tg-button/30 text-base flex justify-center items-center h-[56px]"
                >
                  Добавить задачу
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
