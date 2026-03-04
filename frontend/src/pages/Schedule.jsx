import { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Users, Plus, X, List, Calendar as CalendarIcon, Trash2, Settings } from 'lucide-react';
import { format, addDays, subDays, startOfWeek, isSameDay, getDay, differenceInCalendarWeeks, parse, addMinutes, startOfDay, endOfDay } from 'date-fns';
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
  const { group, subgroup, telegramId } = useUser();
  const navigate = useNavigate();

  const [schedule, setSchedule] = useState(() => {
    if (!group) return null;
    try {
      const cached = localStorage.getItem(`schedule_${group}`);
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
  const [newPlan, setNewPlan] = useState({ title: '', startTime: '09:00', endTime: '10:30', type: 'CUSTOM', color: 'blue', date: '' });

  // Planner tasks for linking
  const [plannerTasks, setPlannerTasks] = useState(() => {
    const saved = localStorage.getItem('bsuir_tasks');
    return saved ? JSON.parse(saved) : [];
  });

  // Drag-to-create state
  const [dragState, setDragState] = useState({ isDragging: false, startY: 0, currentY: 0 });
  const gridRef = useRef(null);
  const scrollContainerRef = useRef(null);

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

    axios.get(`/api/bsuir/schedule/${g}`)
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

  useEffect(() => {
    if (!group) return;

    // Try to load cached schedule for this group
    const cachedSchedule = localStorage.getItem(`schedule_${group}`);
    if (cachedSchedule) {
      // Cache hit — show instantly, refresh in background
      try { setSchedule(JSON.parse(cachedSchedule)); } catch { /* ignore */ }
      setLoading(false);
      fetchSchedule(group, false); // background refresh without loader
    } else {
      // No cache — show loader
      setSchedule(null);
      fetchSchedule(group, true);
    }
  }, [group]);

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
    if (daysRef.current) {
       const activeEl = daysRef.current.querySelector('.active-date');
       if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
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
        return true;
      });
    }

    // Add custom plans for the selected date
    const plansForDay = customPlans.filter(plan => {
      // If plan has a specific date, match it, otherwise assume it's weekly (for simplicity here we can use day name or just date)
      // For now, let's just use date match if we want it specific, or day name match for repeating.
      // Let's stick to date match for now as "plans"
      return isSameDay(new Date(plan.date || selectedDate), selectedDate);
    });

    const formattedPlans = plansForDay.map(p => ({
      ...p,
      lessonTypeAbbrev: p.type || 'CUSTOM',
      startLessonTime: p.startTime,
      endLessonTime: p.endTime,
      subject: p.title,
      isCustom: true
    }));

    return [...lessons, ...formattedPlans].sort((a, b) => a.startLessonTime.localeCompare(b.startLessonTime));
  }, [schedule, selectedDayName, selectedWeekNumber, subgroup, customPlans, selectedDate]);

  const handleAddPlan = () => {
    if (!newPlan.title) return;
    const eventDate = newPlan.date || format(selectedDate, 'yyyy-MM-dd');
    const eventToCreate = { ...newPlan, date: eventDate };
    
    axios.post(`/api/events/${telegramId}`, eventToCreate)
      .then(res => {
        setCustomPlans([...customPlans, res.data]);
        setNewPlan({ title: '', startTime: '09:00', endTime: '10:30', type: 'CUSTOM', color: 'blue', date: '' });
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

  const getTimeFromY = (y) => {
    const totalMinutes = Math.floor((y / 80) * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor((totalMinutes % 60) / 5) * 5; // Round to 5 mins
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const handleTouchStart = (e) => {
    if (viewMode !== 'calendar' || dragState.isDragging) return;
    const rect = gridRef.current.getBoundingClientRect();
    const touchY = e.touches[0].clientY - rect.top;
    setDragState({ isDragging: true, startY: touchY, currentY: touchY });
  };

  const handleTouchMove = (e) => {
    if (!dragState.isDragging) return;
    const rect = gridRef.current.getBoundingClientRect();
    const touchY = e.touches[0].clientY - rect.top;
    setDragState(prev => ({ ...prev, currentY: touchY }));
    
    // Prevent scrolling and bubbling while dragging
    if (e.cancelable) e.preventDefault();
  };

  const handleTouchEnd = () => {
    if (!dragState.isDragging) return;
    
    const y1 = Math.min(dragState.startY, dragState.currentY);
    const y2 = Math.max(dragState.startY, dragState.currentY);
    
    // Minimum 15 mins drag to trigger
    if (y2 - y1 > 20) {
      setNewPlan({
        ...newPlan,
        startTime: getTimeFromY(y1),
        endTime: getTimeFromY(y2),
        type: 'CUSTOM',
        date: format(selectedDate, 'yyyy-MM-dd')
      });
      setIsModalOpen(true);
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
                setNewPlan({ title: '', startTime: '09:00', endTime: '10:30', type: 'CUSTOM', color: 'blue', date: format(selectedDate, 'yyyy-MM-dd') });
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
                  <div key={idx} className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active transition-opacity duration-300 ${isPast ? 'opacity-50' : ''}`}>
                    {/* Timeline dot */}
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-tg-bg shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-transform group-hover:scale-110 ${isActive ? 'bg-tg-button border-tg-button scale-110' : 'bg-[var(--tg-theme-bg-color)] group-hover:border-tg-button'}`}>
                      <span className={`text-xs font-black ${isActive ? 'text-tg-buttonText' : colors.text}`}>{isPast ? '✓' : idx + 1}</span>
                    </div>
                    
                    {/* Card */}
                    <div className={`w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] bg-tg-secondaryBg rounded-2xl p-4 shadow-sm border border-opacity-10 relative overflow-hidden transition-all hover:shadow-md hover:-translate-y-1 ${isActive ? 'border-tg-button ring-1 ring-tg-button/30 shadow-md' : 'border-[var(--tg-theme-hint-color)]'}`}>
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

                      {/* Delete Button for Custom Plans */}
                      {lesson.isCustom && (
                        <button 
                          onClick={() => deletePlan(lesson.id)}
                          className="absolute bottom-3 right-3 p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}

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
                className="relative touch-none"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
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
                      key={idx}
                      style={{ top: `${top}px`, height: `${height}px` }}
                      className={`absolute left-2 right-2 rounded-xl p-2 border-l-4 shadow-sm flex flex-col justify-between overflow-hidden transition-all hover:scale-[1.02] hover:z-20 ${colors.light} ${colors.border} ${isPast ? 'opacity-50' : ''} ${isActive ? 'ring-1 ring-tg-button/40 shadow-md z-10' : ''}`}
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
                          <button onClick={() => deletePlan(lesson.id)} className="text-red-500 scale-75">
                            <Trash2 size={12} />
                          </button>
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

      {/* PLAN ADD MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-tg-secondaryBg w-full max-w-md rounded-t-3xl shadow-2xl transition-transform animate-slide-up max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between p-6 pb-2">
              <h2 className="text-xl font-bold text-tg-text">Новый план</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-tg-hint bg-tg-bg p-2 rounded-full"><X size={20} /></button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); handleAddPlan(); }} className="overflow-y-auto px-6 pb-10 flex-1">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Название</label>
                <input 
                  type="text"
                  value={newPlan.title}
                  onChange={(e) => setNewPlan({...newPlan, title: e.target.value})}
                  placeholder="Напр. Подготовка к лабам"
                  className="w-full px-4 py-3.5 rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Дата</label>
                <input 
                  type="date"
                  value={newPlan.date || format(selectedDate, 'yyyy-MM-dd')}
                  onChange={(e) => setNewPlan({...newPlan, date: e.target.value})}
                  className="w-full px-4 py-3.5 rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Начало</label>
                  <input 
                    type="time"
                    value={newPlan.startTime}
                    onChange={(e) => setNewPlan({...newPlan, startTime: e.target.value})}
                    className="w-full px-4 py-3.5 rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">Конец</label>
                  <input 
                    type="time"
                    value={newPlan.endTime}
                    onChange={(e) => setNewPlan({...newPlan, endTime: e.target.value})}
                    className="w-full px-4 py-3.5 rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border-none transition-all font-medium"
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

              <button 
                type="submit"
                className="w-full py-4 bg-tg-button text-tg-buttonText font-bold rounded-2xl mt-4 active:scale-[0.98] transition-all shadow-lg shadow-tg-button/30 text-base"
              >
                Сохранить в расписание
              </button>
            </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
