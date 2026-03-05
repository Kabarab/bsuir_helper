import { useState, useEffect, useRef, useMemo } from 'react';
import { CalendarDays, ChevronLeft, Clock, Calendar as CalendarIcon, List } from 'lucide-react';
import { format, addDays, isSameDay, getDay, differenceInCalendarWeeks } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getMinskNow } from '../utils/minskTime';

const COLOR_PRESETS = {
  blue: { bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500/30', light: 'bg-blue-500/10' },
  emerald: { bg: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500/30', light: 'bg-emerald-500/10' },
  rose: { bg: 'bg-rose-500', text: 'text-rose-500', border: 'border-rose-500/30', light: 'bg-rose-500/10' },
  violet: { bg: 'bg-indigo-500', text: 'text-indigo-500', border: 'border-indigo-500/30', light: 'bg-indigo-500/10' },
  amber: { bg: 'bg-amber-500', text: 'text-amber-500', border: 'border-amber-500/30', light: 'bg-amber-500/10' },
  slate: { bg: 'bg-slate-500', text: 'text-slate-500', border: 'border-slate-500/30', light: 'bg-slate-500/10' },
};

import axios from 'axios';
import { Search, Users, Building, GraduationCap, MapPin, Trophy, ChevronRight, X, Info, Pin } from 'lucide-react';
import { getFaculties, getSpecialities, getActiveSpecialities, getCourses, getRating, getStudentGrades } from '../utils/bsuirApi';

export default function University() {
  const [activeTab, setActiveTab] = useState('teachers'); // teachers, faculties, groups, rating
  
  // Teachers data
  const [teachers, setTeachers] = useState([]);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [teacherSchedule, setTeacherSchedule] = useState(null);
  const [visibleTeachersCount, setVisibleTeachersCount] = useState(30);
  
  // Faculties / Specialities (JSON API)
  const [faculties, setFaculties] = useState([]);
  const [specialities, setSpecialities] = useState([]);
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  
  // Groups (JSON API)
  const [groups, setGroups] = useState([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [visibleGroupsCount, setVisibleGroupsCount] = useState(50);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupSchedule, setGroupSchedule] = useState(null);

  const [selectedDate, setSelectedDate] = useState(getMinskNow());
  const [now, setNow] = useState(getMinskNow());
  const [scheduleViewMode, setScheduleViewMode] = useState('list');
  const [selectedSubgroup, setSelectedSubgroup] = useState(0); // 0 = all, 1 = first, 2 = second
  const daysRef = useRef(null);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(getMinskNow()), 60000);
    return () => clearInterval(timer);
  }, []);

  const dateStrip = useMemo(() => {
    const dates = [];
    const today = getMinskNow();
    for (let i = -7; i <= 21; i++) {
       dates.push(addDays(today, i));
    }
    return dates;
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (daysRef.current) {
         const activeEl = daysRef.current.querySelector('.active-date');
         if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [dateStrip, activeTab, selectedGroup, selectedTeacher, teacherSchedule, groupSchedule]);

  // Current Week logic
  const [currentWeekNum, setCurrentWeekNum] = useState(null);
  useEffect(() => {
    axios.get('/api/bsuir/week').then(res => setCurrentWeekNum(res.data)).catch(console.error);
  }, []);
  
  const getWeekNumberForDate = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // Находим 1 сентября текущего учебного года
    let year = d.getFullYear();
    if (d.getMonth() < 8) { // Если месяц до сентября (0-7), значит учебный год начался в прошлом году
      year -= 1;
    }
    const sept1 = new Date(year, 8, 1); // 1 сентября
    
    // Находим первый понедельник учебного года (или 1 сентября, если это понедельник)
    const firstMonday = new Date(sept1);
    const dayOfWeek = firstMonday.getDay();
    if (dayOfWeek !== 1) {
      const daysToAdd = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
      firstMonday.setDate(firstMonday.getDate() + daysToAdd);
    }

    // Если дата до первого понедельника, считаем это 1-й неделей
    if (d < firstMonday) return 1;

    // Считаем разницу в неделях между датой и первым понедельником
    const diffTime = d.getTime() - firstMonday.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekDiff = Math.floor(diffDays / 7);

    // Учебные недели циклично 1-4
    return (weekDiff % 4) + 1;
  };

  const getLessonColor = (lesson) => {
    const type = lesson.lessonTypeAbbrev;
    switch (type) {
      case 'ЛК': return COLOR_PRESETS.emerald;
      case 'ПЗ': return COLOR_PRESETS.blue;
      case 'ЛР': return COLOR_PRESETS.rose;
      default: return COLOR_PRESETS.blue;
    }
  };

  const getLessonProgress = (lesson) => {
    const isToday = isSameDay(selectedDate, now);
    if (!isToday) return lesson.startLessonTime <= format(now, 'HH:mm') ? -1 : null;
    const [sH, sM] = lesson.startLessonTime.split(':').map(Number);
    const [eH, eM] = lesson.endLessonTime.split(':').map(Number);
    const startMin = sH * 60 + sM;
    const endMin = eH * 60 + eM;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < startMin) return 0;
    if (nowMin >= endMin) return 1;
    return (nowMin - startMin) / (endMin - startMin);
  };


  const [pinnedGroups, setPinnedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('pinnedGroups');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('pinnedGroups', JSON.stringify(pinnedGroups));
  }, [pinnedGroups]);

  const togglePinGroup = (e, groupName) => {
    e.stopPropagation();
    setPinnedGroups(prev => {
      if (prev.includes(groupName)) {
        return prev.filter(name => name !== groupName);
      }
      return [...prev, groupName];
    });
  };

  const loadGroupSchedule = (groupName) => {
    setLoading(true);
    axios.get(`/api/bsuir/schedule/${groupName}`)
      .then(res => setGroupSchedule(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setVisibleTeachersCount(30);
  }, [teacherSearch]);

  useEffect(() => {
    setVisibleGroupsCount(50);
  }, [groupSearch]);

  // Rating (XML API)
  const [facultiesXml, setFacultiesXml] = useState([]);
  const [specsXml, setSpecsXml] = useState([]);
  const [coursesXml, setCoursesXml] = useState([]);
  const [selFaculty, setSelFaculty] = useState('');
  const [selSpec, setSelSpec] = useState('');
  const [selCourse, setSelCourse] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentMarks, setStudentMarks] = useState([]);
  const [loadingRating, setLoadingRating] = useState(false);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch initial data based on tab
    if (activeTab === 'teachers' && teachers.length === 0) {
      setLoading(true);
      axios.get('/api/bsuir/teachers')
        .then(res => setTeachers(res.data))
        .catch(console.error)
        .finally(() => setLoading(false));
    } else if (activeTab === 'faculties' && faculties.length === 0) {
      setLoading(true);
      Promise.all([
        axios.get('/api/bsuir/faculties'),
        axios.get('/api/bsuir/specialities')
      ]).then(([facRes, specRes]) => {
        setFaculties(facRes.data);
        setSpecialities(specRes.data);
      }).catch(console.error)
      .finally(() => setLoading(false));
    } else if (activeTab === 'groups' && groups.length === 0) {
      setLoading(true);
      axios.get('/api/bsuir/groups')
        .then(res => setGroups(res.data))
        .catch(console.error)
        .finally(() => setLoading(false));
    } else if (activeTab === 'rating' && facultiesXml.length === 0) {
      setLoading(true);
      getFaculties().then(setFacultiesXml).catch(console.error).finally(() => setLoading(false));
    }
  }, [activeTab]);

  // Hierarchical Filter Handlers
  const handleFacultyChange = (id) => {
    setSelFaculty(id);
    setSelSpec('');
    setSelCourse('');
    setSpecsXml([]);
    setCoursesXml([]);
    setLeaderboard([]);
    if (id) {
      setLoading(true);
      getActiveSpecialities(id).then(setSpecsXml).finally(() => setLoading(false));
    }
  };

  const handleSpecChange = (id) => {
    setSelSpec(id);
    setSelCourse('');
    setCoursesXml([]);
    setLeaderboard([]);
    if (id && selFaculty) {
      setLoading(true);
      getCourses(selFaculty, id).then(setCoursesXml).finally(() => setLoading(false));
    }
  };

  const handleCourseChange = (c) => {
    setSelCourse(c);
    if (c && selSpec) {
      setLoadingRating(true);
      getRating(selSpec, c)
        .then(setLeaderboard)
        .catch(console.error)
        .finally(() => setLoadingRating(false));
    } else {
      setLeaderboard([]);
    }
  };

  const fetchStudentMarks = async (student) => {
    setSelectedStudent(student);
    setStudentMarks([]);
    setLoading(true);
    try {
      const marks = await getStudentGrades(student.studentCardNumber);
      setStudentMarks(marks);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadTeacherSchedule = (urlId) => {
    setLoading(true);
    axios.get(`/api/bsuir/teachers/${urlId}/schedule`)
      .then(res => setTeacherSchedule(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const filteredTeachers = teachers.filter(t => 
    t.fio?.toLowerCase().includes(teacherSearch.toLowerCase()) || 
    t.lastName?.toLowerCase().includes(teacherSearch.toLowerCase())
  ).slice(0, visibleTeachersCount);

  const filteredGroups = groups.filter(g => 
    g.name?.includes(groupSearch)
  ).sort((a, b) => {
    const aPinned = pinnedGroups.includes(a.name);
    const bPinned = pinnedGroups.includes(b.name);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  }).slice(0, visibleGroupsCount);

  const handleScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    // 100px threshold from the bottom
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      if (activeTab === 'teachers') {
        setVisibleTeachersCount(prev => Math.min(prev + 20, teachers.length));
      } else if (activeTab === 'groups') {
        setVisibleGroupsCount(prev => Math.min(prev + 50, groups.length));
      }
    }
  };

  return (
    <div className="p-4 relative min-h-[calc(100vh-4rem)] flex flex-col">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-4 text-tg-text">
        <Building size={28} className="text-tg-button" />
        Университет
      </h1>

      {/* Tabs */}
      <div className="flex bg-tg-secondaryBg p-1 rounded-xl mb-4 text-[10px] sm:text-xs font-medium overflow-x-auto">
        <button 
          onClick={() => setActiveTab('teachers')}
          className={`shrink-0 flex-1 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'teachers' ? 'bg-[var(--tg-theme-bg-color)] text-tg-button shadow-sm' : 'text-tg-hint'}`}
        >
          <Users size={14} /> Преподаватели
        </button>
        <button 
          onClick={() => setActiveTab('faculties')}
          className={`shrink-0 flex-1 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'faculties' ? 'bg-[var(--tg-theme-bg-color)] text-tg-button shadow-sm' : 'text-tg-hint'}`}
        >
          <GraduationCap size={14} /> Факультеты
        </button>
        <button 
          onClick={() => setActiveTab('groups')}
          className={`shrink-0 flex-1 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'groups' ? 'bg-[var(--tg-theme-bg-color)] text-tg-button shadow-sm' : 'text-tg-hint'}`}
        >
          <Users size={14} /> Группы
        </button>
        <button 
          onClick={() => setActiveTab('rating')}
          className={`shrink-0 flex-1 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'rating' ? 'bg-[var(--tg-theme-bg-color)] text-tg-button shadow-sm' : 'text-tg-hint'}`}
        >
          <Trophy size={14} /> Рейтинг
        </button>
      </div>

      {loading && teachers.length === 0 && faculties.length === 0 && groups.length === 0 && facultiesXml.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-button"></div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
          {/* TEACHERS TAB */}
          {activeTab === 'teachers' && (
            <div className="space-y-4">
              {!selectedTeacher ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tg-hint" size={18} />
                    <input 
                      type="text" 
                      placeholder="Поиск преподавателя..." 
                      value={teacherSearch}
                      onChange={e => setTeacherSearch(e.target.value)}
                      className="w-full bg-tg-secondaryBg text-tg-text pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-tg-button"
                    />
                  </div>
                  
                  <div className="grid gap-3">
                    {filteredTeachers.map(t => (
                      <div 
                        key={t.id} 
                        onClick={() => {
                          setSelectedTeacher(t);
                          loadTeacherSchedule(t.urlId);
                        }}
                        className="bg-tg-secondaryBg p-3 rounded-xl flex items-center gap-4 cursor-pointer hover:bg-opacity-80 transition"
                      >
                        <img 
                          src={t.photoLink || 'https://via.placeholder.com/50'} 
                          alt={t.fio} 
                          className="w-12 h-12 rounded-full object-cover border border-tg-hint border-opacity-20"
                          onError={(e) => { e.target.src = 'https://via.placeholder.com/50'; }}
                        />
                        <div>
                          <div className="font-bold text-tg-text">{t.fio}</div>
                          <div className="text-xs text-tg-hint line-clamp-1">
                            {t.rank || 'Преподаватель'} • {t.academicDepartment?.join(', ') || 'Кафедра'}
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredTeachers.length === 0 && teacherSearch && (
                      <div className="text-center text-tg-hint py-8">Ничего не найдено</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <button 
                    onClick={() => { setSelectedTeacher(null); setTeacherSchedule(null); }}
                    className="text-tg-button text-sm font-medium flex items-center gap-1"
                  >
                    ← Назад к списку
                  </button>
                  
                  <div className="bg-tg-secondaryBg p-4 rounded-xl flex items-start gap-4">
                    <img 
                      src={selectedTeacher.photoLink || 'https://via.placeholder.com/100'} 
                      alt={selectedTeacher.fio} 
                      className="w-20 h-20 rounded-xl object-cover border border-tg-hint border-opacity-20"
                      onError={(e) => { e.target.src = 'https://via.placeholder.com/100'; }}
                    />
                    <div>
                      <h2 className="text-lg font-bold text-tg-text mb-1">{selectedTeacher.lastName} {selectedTeacher.firstName} {selectedTeacher.middleName}</h2>
                      <div className="text-sm text-tg-hint mb-2">
                        {selectedTeacher.rank} • {selectedTeacher.degree}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedTeacher.academicDepartment?.map(d => (
                          <span key={d} className="text-xs px-2 py-1 bg-[var(--tg-theme-bg-color)] rounded-md font-medium text-tg-hint">{d}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-button"></div></div>
                  ) : teacherSchedule?.schedules ? (
                    <div className="space-y-4">
                      {/* DATE STRIP */}
                      <div className="-mx-4 px-4 mb-4">
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

                      {/* Active Lessons for Selected Day */}
                      {(() => {
                        const selectedWeekNumber = getWeekNumberForDate(selectedDate);
                        const bsuirDayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
                        const selectedDayName = bsuirDayNames[getDay(selectedDate)];
                        
                        let activeLessons = [];
                        if (teacherSchedule.schedules[selectedDayName]) {
                          activeLessons = teacherSchedule.schedules[selectedDayName].filter(lesson => {
                            if (lesson.weekNumber && lesson.weekNumber.length > 0) {
                              if (!lesson.weekNumber.includes(selectedWeekNumber)) return false;
                            }
                            return true;
                          }).sort((a,b) => a.startLessonTime.localeCompare(b.startLessonTime));
                        }

                        return activeLessons.length > 0 ? (
                            <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[var(--tg-theme-hint-color)] before:to-transparent before:opacity-20">
                              {activeLessons.map((lesson, idx) => {
                                const colors = getLessonColor(lesson);
                                const progress = getLessonProgress(lesson);
                                const isPast = progress === 1;
                                const isActive = progress > 0 && progress < 1;
                                const progressPct = (typeof progress === 'number' && progress > 0 && progress < 1) ? Math.round(progress * 100) : 0;
                                return (
                                  <div key={idx} className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group transition-opacity duration-300 ${isPast ? 'opacity-50' : ''}`}>
                                    {/* Timeline dot */}
                                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-tg-bg shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-transform group-hover:scale-110 ${isActive ? 'bg-tg-button border-tg-button scale-110' : 'bg-[var(--tg-theme-bg-color)] group-hover:border-tg-button'}`}>
                                      <span className={`text-xs font-black ${isActive ? 'text-tg-buttonText' : colors.text}`}>{isPast ? '✓' : idx + 1}</span>
                                    </div>
                                    
                                    {/* Card */}
                                    <div 
                                      className={`w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] bg-tg-secondaryBg rounded-2xl p-4 shadow-sm border border-opacity-10 relative overflow-hidden transition-all hover:shadow-md hover:-translate-y-1 ${isActive ? 'border-tg-button ring-1 ring-tg-button/30 shadow-md' : 'border-[var(--tg-theme-hint-color)]'}`}
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
                                          {lesson.studentGroups && lesson.studentGroups.length > 0 ? (
                                            <p className="text-xs text-tg-hint mt-1 font-medium">
                                              {lesson.studentGroups.map(g => g.name).join(', ')}
                                            </p>
                                          ) : lesson.employees && lesson.employees.length > 0 ? (
                                            <p className="text-xs text-tg-hint mt-1 font-medium">
                                              {lesson.employees.map(e => `${e.lastName} ${e.firstName?.[0] || ''}.${e.middleName ? ` ${e.middleName[0]}.` : ''}`).join(', ')}
                                            </p>
                                          ) : null}
                                        </div>

                                        {/* Metadata */}
                                        <div className="grid gap-2 text-[13px] pt-3 border-t border-[var(--tg-theme-hint-color)] border-opacity-10">
                                          {(lesson.auditories && lesson.auditories.length > 0) || lesson.note ? (
                                            <div className="flex items-start gap-2 justify-between w-full">
                                              {lesson.auditories && lesson.auditories.length > 0 && (
                                                <div className="flex items-center gap-2 text-tg-hint">
                                                  <MapPin size={14} className="shrink-0 opacity-70" />
                                                  <span className="font-medium">{lesson.auditories.join(', ')}</span>
                                                </div>
                                              )}
                                              {lesson.note && (
                                                <span className="text-[10px] bg-[var(--tg-theme-bg-color)] px-1.5 py-0.5 rounded text-tg-hint truncate max-w-[120px]">
                                                  {lesson.note}
                                                </span>
                                              )}
                                            </div>
                                          ) : null}
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
                            <h3 className="text-lg font-bold text-tg-text mb-1">Выходной!</h3>
                            <p className="text-sm font-medium opacity-80 text-center max-w-[200px]">
                              Пар у преподавателя нет.
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="text-center text-tg-hint py-8">Не удалось загрузить расписание</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* FACULTIES TAB */}
          {activeTab === 'faculties' && (
            <div className="space-y-6">
              {!selectedFaculty ? (
                <div className="grid gap-3">
                  <h3 className="font-bold text-tg-hint uppercase text-xs tracking-wider mb-1">Факультеты ({faculties.length})</h3>
                  {faculties.map(f => (
                    <div 
                      key={f.id} 
                      onClick={() => setSelectedFaculty(f)}
                      className="bg-tg-secondaryBg p-3 rounded-xl flex items-center justify-between cursor-pointer hover:bg-opacity-80 transition"
                    >
                      <div>
                        <div className="font-bold text-tg-text">{f.abbrev}</div>
                        <div className="text-xs text-tg-hint">{f.name}</div>
                      </div>
                      <ChevronRight size={18} className="text-tg-hint opacity-50" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <button 
                    onClick={() => setSelectedFaculty(null)}
                    className="text-tg-button text-sm font-medium flex items-center gap-1"
                  >
                    ← Назад к факультетам
                  </button>
                  
                  <div className="bg-tg-secondaryBg p-4 rounded-xl mb-4">
                    <div className="font-bold text-tg-text text-lg">{selectedFaculty.abbrev}</div>
                    <div className="text-sm text-tg-hint">{selectedFaculty.name}</div>
                  </div>

                  <div className="grid gap-3">
                    <h3 className="font-bold text-tg-hint uppercase text-xs tracking-wider mb-1">Специальности</h3>
                    {specialities.filter(s => s.facultyId === selectedFaculty.id).map(s => (
                      <div key={s.id} className="bg-tg-secondaryBg p-3 rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-bold text-tg-text">{s.abbrev}</div>
                          <div className="text-xs font-mono bg-[var(--tg-theme-bg-color)] px-1.5 py-0.5 rounded text-tg-hint">{s.code}</div>
                        </div>
                        <div className="text-xs text-tg-hint line-clamp-2">{s.name}</div>
                      </div>
                    ))}
                    {specialities.filter(s => s.facultyId === selectedFaculty.id).length === 0 && (
                      <div className="text-center text-tg-hint py-4 text-sm">Нет специальностей</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* GROUPS TAB */}
          {activeTab === 'groups' && (
            <div className="space-y-4">
              {!selectedGroup ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tg-hint" size={18} />
                    <input 
                      type="text" 
                      placeholder="Поиск группы..." 
                      value={groupSearch}
                      onChange={e => setGroupSearch(e.target.value)}
                      className="w-full bg-tg-secondaryBg text-tg-text pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-tg-button"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {filteredGroups.map(g => (
                      <div 
                        key={g.id} 
                        onClick={() => {
                          setSelectedGroup(g);
                          loadGroupSchedule(g.name);
                        }}
                        className={`bg-tg-secondaryBg p-3 rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition relative ${pinnedGroups.includes(g.name) ? 'ring-2 ring-tg-button ring-opacity-50' : 'hover:bg-opacity-80'}`}
                      >
                        <button 
                          onClick={(e) => togglePinGroup(e, g.name)}
                          className={`absolute top-2 right-2 p-1.5 rounded-full transition-colors ${pinnedGroups.includes(g.name) ? 'text-tg-button bg-tg-button/10' : 'text-tg-hint opacity-50 hover:opacity-100 hover:bg-tg-bg'}`}
                        >
                          <Pin size={14} fill={pinnedGroups.includes(g.name) ? "currentColor" : "none"} />
                        </button>
                        <div className="font-bold text-lg text-tg-text">{g.name}</div>
                        <div className="text-xs text-tg-hint mt-1">{g.facultyAbbrev} • Курс {g.course}</div>
                      </div>
                    ))}
                    {filteredGroups.length === 0 && groupSearch && (
                      <div className="col-span-2 text-center text-tg-hint py-8">Ничего не найдено</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <button 
                    onClick={() => { setSelectedGroup(null); setGroupSchedule(null); }}
                    className="text-tg-button text-sm font-medium flex items-center gap-1"
                  >
                    ← Назад к списку
                  </button>
                  
                  <div className="bg-tg-secondaryBg p-4 rounded-xl">
                    <div className="font-bold text-tg-text text-xl mb-1">Группа {selectedGroup.name}</div>
                    <div className="text-sm text-tg-hint mb-3">
                      {selectedGroup.facultyAbbrev} • Специальность {selectedGroup.specialityName || `Код: ${selectedGroup.specialityDepartmentEducationFormId}`} • Курс {selectedGroup.course}
                    </div>
                    
                    <div className="flex bg-[var(--tg-theme-bg-color)] p-1 rounded-xl w-fit text-xs font-medium border border-[var(--tg-theme-hint-color)] border-opacity-10">
                      <button onClick={() => setSelectedSubgroup(0)} className={`px-3 py-1.5 rounded-lg transition-colors ${selectedSubgroup === 0 ? 'bg-tg-button text-tg-buttonText shadow-sm' : 'text-tg-hint hover:text-tg-text'}`}>Все подгруппы</button>
                      <button onClick={() => setSelectedSubgroup(1)} className={`px-3 py-1.5 rounded-lg transition-colors ${selectedSubgroup === 1 ? 'bg-tg-button text-tg-buttonText shadow-sm' : 'text-tg-hint hover:text-tg-text'}`}>1 подгр</button>
                      <button onClick={() => setSelectedSubgroup(2)} className={`px-3 py-1.5 rounded-lg transition-colors ${selectedSubgroup === 2 ? 'bg-tg-button text-tg-buttonText shadow-sm' : 'text-tg-hint hover:text-tg-text'}`}>2 подгр</button>
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-button"></div></div>
                  ) : groupSchedule?.schedules ? (
                    <div className="space-y-4">
                      {/* DATE STRIP */}
                      <div className="-mx-4 px-4 mb-4">
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

                      {/* Active Lessons for Selected Day */}
                      {(() => {
                        const selectedWeekNumber = getWeekNumberForDate(selectedDate);
                        const bsuirDayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
                        const selectedDayName = bsuirDayNames[getDay(selectedDate)];
                        
                        let activeLessons = [];
                        if (groupSchedule.schedules[selectedDayName]) {
                          activeLessons = groupSchedule.schedules[selectedDayName].filter(lesson => {
                            if (selectedSubgroup !== 0 && lesson.numSubgroup !== 0 && lesson.numSubgroup !== selectedSubgroup) return false;
                            if (lesson.weekNumber && lesson.weekNumber.length > 0) {
                              if (!lesson.weekNumber.includes(selectedWeekNumber)) return false;
                            }
                            return true;
                          }).sort((a,b) => a.startLessonTime.localeCompare(b.startLessonTime));
                        }

                        return activeLessons.length > 0 ? (
                            <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[var(--tg-theme-hint-color)] before:to-transparent before:opacity-20">
                              {activeLessons.map((lesson, idx) => {
                                const colors = getLessonColor(lesson);
                                const progress = getLessonProgress(lesson);
                                const isPast = progress === 1;
                                const isActive = progress > 0 && progress < 1;
                                const progressPct = (typeof progress === 'number' && progress > 0 && progress < 1) ? Math.round(progress * 100) : 0;
                                return (
                                  <div key={idx} className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group transition-opacity duration-300 ${isPast ? 'opacity-50' : ''}`}>
                                    {/* Timeline dot */}
                                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-tg-bg shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-transform group-hover:scale-110 ${isActive ? 'bg-tg-button border-tg-button scale-110' : 'bg-[var(--tg-theme-bg-color)] group-hover:border-tg-button'}`}>
                                      <span className={`text-xs font-black ${isActive ? 'text-tg-buttonText' : colors.text}`}>{isPast ? '✓' : idx + 1}</span>
                                    </div>
                                    
                                    {/* Card */}
                                    <div 
                                      className={`w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] bg-tg-secondaryBg rounded-2xl p-4 shadow-sm border border-opacity-10 relative overflow-hidden transition-all hover:shadow-md hover:-translate-y-1 ${isActive ? 'border-tg-button ring-1 ring-tg-button/30 shadow-md' : 'border-[var(--tg-theme-hint-color)]'}`}
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

                                        {/* Metadata */}
                                        <div className="grid gap-2 text-[13px] pt-3 border-t border-[var(--tg-theme-hint-color)] border-opacity-10">
                                          {(lesson.auditories && lesson.auditories.length > 0) || lesson.note ? (
                                            <div className="flex items-start gap-2 justify-between w-full">
                                              {lesson.auditories && lesson.auditories.length > 0 && (
                                                <div className="flex items-center gap-2 text-tg-hint">
                                                  <MapPin size={14} className="shrink-0 opacity-70" />
                                                  <span className="font-medium">{lesson.auditories.join(', ')}</span>
                                                </div>
                                              )}
                                              {lesson.note && (
                                                <span className="text-[10px] bg-[var(--tg-theme-bg-color)] px-1.5 py-0.5 rounded text-tg-hint truncate max-w-[120px]">
                                                  {lesson.note}
                                                </span>
                                              )}
                                            </div>
                                          ) : null}
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
                            <h3 className="text-lg font-bold text-tg-text mb-1">Выходной!</h3>
                            <p className="text-sm font-medium opacity-80 text-center max-w-[200px]">
                              Пар у группы нет.
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="text-center text-tg-hint py-8">Не удалось загрузить расписание</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* RATING TAB (Task 2) */}
          {activeTab === 'rating' && (
            <div className="space-y-5">
              <div className="grid gap-4 bg-tg-secondaryBg p-4 rounded-2xl shadow-sm border border-tg-hint border-opacity-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-tg-hint ml-1 tracking-wider">Факультет</label>
                  <select 
                    value={selFaculty}
                    onChange={(e) => handleFacultyChange(e.target.value)}
                    className="w-full bg-tg-bg text-tg-text p-2.5 rounded-xl border border-tg-hint border-opacity-10 focus:outline-none focus:ring-2 focus:ring-tg-button appearance-none text-sm"
                  >
                    <option value="">Выберите факультет...</option>
                    {facultiesXml.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>

                <div className={`space-y-1.5 transition-opacity ${!selFaculty ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                  <label className="text-[10px] uppercase font-bold text-tg-hint ml-1 tracking-wider">Специальность</label>
                  <select 
                    value={selSpec}
                    onChange={(e) => handleSpecChange(e.target.value)}
                    className="w-full bg-tg-bg text-tg-text p-2.5 rounded-xl border border-tg-hint border-opacity-10 focus:outline-none focus:ring-2 focus:ring-tg-button appearance-none text-sm"
                  >
                    <option value="">Выберите специальность...</option>
                    {specsXml.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.abbrev}) — {s.educationForm?.name || 'дневная'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`space-y-1.5 transition-opacity ${!selSpec ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                  <label className="text-[10px] uppercase font-bold text-tg-hint ml-1 tracking-wider">Курс</label>
                  <select 
                    value={selCourse}
                    onChange={(e) => handleCourseChange(e.target.value)}
                    className="w-full bg-tg-bg text-tg-text p-2.5 rounded-xl border border-tg-hint border-opacity-10 focus:outline-none focus:ring-2 focus:ring-tg-button appearance-none text-sm"
                  >
                    <option value="">Выберите курс...</option>
                    {coursesXml.map(c => <option key={c} value={c}>{c} курс</option>)}
                  </select>
                </div>
              </div>

              {loadingRating ? (
                <div className="flex flex-col items-center justify-center p-12 space-y-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-button"></div>
                  <span className="text-xs text-tg-hint">Загрузка рейтинга...</span>
                </div>
              ) : leaderboard.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="font-bold text-sm flex items-center gap-2 mb-2 px-1">
                    <Trophy size={16} className="text-yellow-500" /> Таблица лидеров
                  </h3>
                  <div className="bg-tg-secondaryBg rounded-2xl overflow-hidden shadow-sm divide-y divide-tg-hint divide-opacity-10">
                    {leaderboard.map((student, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => fetchStudentMarks(student)}
                        className="p-4 flex items-center gap-4 active:bg-tg-bg transition-colors cursor-pointer group"
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                          idx === 0 ? 'bg-yellow-500/20 text-yellow-600 border border-yellow-500/30' : 
                          idx === 1 ? 'bg-gray-400/20 text-gray-500 border border-gray-400/30' : 
                          idx === 2 ? 'bg-orange-600/20 text-orange-700 border border-orange-600/30' : 
                          'bg-tg-bg text-tg-hint'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-sm text-tg-text group-hover:text-tg-button transition-colors">{student.fio}</div>
                          <div className="text-[10px] text-tg-hint">Зачетка: {student.studentCardNumber}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-tg-button">{student.average.toFixed(1)}</span>
                          <ChevronRight size={14} className="text-tg-hint opacity-30 group-hover:opacity-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : selCourse ? (
                <div className="text-center py-12 text-tg-hint text-sm">Данные рейтинга не найдены</div>
              ) : (
                <div className="text-center py-12 text-tg-hint text-sm flex flex-col items-center gap-2">
                  <Info size={24} className="opacity-20" />
                  Выберите параметры для просмотра рейтинга
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Student Marks Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-tg-secondaryBg w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="p-4 border-b border-tg-hint border-opacity-10 flex justify-between items-center bg-tg-bg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-tg-button/10 flex items-center justify-center text-tg-button">
                  <GraduationCap size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-sm line-clamp-1">{selectedStudent.fio}</h3>
                  <div className="text-[10px] text-tg-hint">Ср. балл: {selectedStudent.average.toFixed(2)}</div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStudent(null)}
                className="p-2 hover:bg-tg-bg rounded-full text-tg-hint transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3 bg-tg-secondaryBg">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                   <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-button"></div>
                   <span className="text-xs text-tg-hint">Загрузка оценок...</span>
                </div>
              ) : studentMarks.length > 0 ? (
                studentMarks.map((m, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-tg-bg rounded-xl border border-tg-hint border-opacity-10">
                    <span className="text-sm font-medium">{m.subject}</span>
                    <div className="flex gap-1.5 overflow-x-auto max-w-[50%] justify-end">
                      {m.marks.length > 0 ? m.marks.map((mark, midx) => (
                        <span key={midx} className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold border ${
                          mark >= 8 ? 'bg-green-500/10 text-green-600 border-green-500/20' : 
                          mark >= 4 ? 'bg-tg-button/10 text-tg-button border-tg-button/20' : 
                          'bg-red-500/10 text-red-600 border-red-500/20'
                        }`}>
                          {mark}
                        </span>
                      )) : (
                        <span className="text-[10px] text-tg-hint italic">нет оценок</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-tg-hint text-sm">Оценки не найдены</div>
              )}
            </div>
            
            <div className="p-4 bg-tg-bg border-t border-tg-hint border-opacity-10">
              <button 
                onClick={() => setSelectedStudent(null)}
                className="w-full py-3 bg-tg-button text-white rounded-xl font-bold shadow-lg shadow-tg-button/20 active:scale-[0.98] transition-all"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
