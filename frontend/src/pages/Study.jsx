import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { BookOpen, Star, GraduationCap, Settings, Info, Search, Trophy, Loader2, Clock, AlertTriangle } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { getStudentGrades, fetchStudentRating } from '../utils/bsuirApi';
import WebApp from '@twa-dev/sdk';


export default function Study() {
  const { group, telegramId, studentId, isTeacher, updatePreferences } = useUser();
  const navigate = useNavigate();

  // Helper to get cache keys bound to a specific studentId
  const getCacheKey = (base, id) => id ? `${base}_${id}` : base;

  // Load cached data from localStorage on mount (keyed by current studentId)
  const [grades, setGrades] = useState(() => {
    try { return JSON.parse(localStorage.getItem('study_grades')); } catch { return null; }
  });
  const [xmlMarks, setXmlMarks] = useState(() => {
    try {
      const key = studentId ? `study_xmlMarks_${studentId}` : 'study_xmlMarks';
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch { return []; }
  });
  const [loadingXml, setLoadingXml] = useState(false);
  const [studentCard, setStudentCard] = useState(studentId || '');
  const [errorXml, setErrorXml] = useState(null);
  const [ratingData, setRatingData] = useState(() => {
    try {
      const key = studentId ? `study_ratingData_${studentId}` : 'study_ratingData';
      return JSON.parse(localStorage.getItem(key));
    } catch { return null; }
  });
  const [loadingRating, setLoadingRating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Calculate display average (official from rating info OR local from xmlMarks)
  const displayAverage = useMemo(() => {
    // Priority 1: Official rating average
    if (ratingData?.student?.average) return parseFloat(ratingData.student.average);
    
    // Priority 2: Local calculation from xmlMarks
    if (Array.isArray(xmlMarks) && xmlMarks.length > 0) {
      const allValues = xmlMarks.flatMap(m => m.marks || [])
        .map(m => (m && typeof m === 'object') ? m.val : m)
        .filter(v => typeof v === 'number' && !isNaN(v));
        
      if (allValues.length > 0) {
        return allValues.reduce((a, b) => a + b, 0) / allValues.length;
      }
    }


    
    return 0;
  }, [ratingData, xmlMarks]);

  useEffect(() => {
    // Получаем реальные оценки через наш бэкенд (он сам делает авторизацию в IIS)
    axios.get(`/api/bsuir/grades/${telegramId}`)
      .then(res => {
        const data = res.data;
        
        // Don't overwrite real data with mock fallback from backend
        if (!data.is_real) {
          console.log("Backend returned mock data, skipping UI update.");
          return;
        }

        setGrades(data);
        localStorage.setItem('study_grades', JSON.stringify(data));
        
        // Update display data if subjects are present
        if (data.subjects && Array.isArray(data.subjects)) {
          setXmlMarks(data.subjects);
          const marksKey = studentId ? `study_xmlMarks_${studentId}` : 'study_xmlMarks';
          localStorage.setItem(marksKey, JSON.stringify(data.subjects));
          
          if (data.average) {
            setRatingData(prev => ({
              ...prev,
              rank: data.rating || prev?.rank || '-',
              total: prev?.total || '-',
              student: { ...prev?.student, average: data.average },
              specName: data.specName || prev?.specName
            }));
          }
        }


      })
      .catch(err => console.error("Backend grades fetch error:", err));

  }, [telegramId, studentId]);

  useEffect(() => {
    console.log("Study mount/update - studentId:", studentId);
    if (studentId) {
      setStudentCard(studentId);

      // Try to load cached data for this specific studentId
      const marksKey = `study_xmlMarks_${studentId}`;
      const ratingKey = `study_ratingData_${studentId}`;
      const cachedMarks = localStorage.getItem(marksKey);
      const cachedRating = localStorage.getItem(ratingKey);

      if (cachedMarks) {
        // Cache hit — show cached data immediately, refresh in background
        try { setXmlMarks(JSON.parse(cachedMarks)); } catch { /* ignore */ }
        try { setRatingData(JSON.parse(cachedRating)); } catch { /* ignore */ }
        fetchXmlMarksBackground(studentId);
      } else {
        // No cache — show loader and fetch
        setXmlMarks([]);
        setRatingData(null);
        const timer = setTimeout(() => {
          fetchXmlMarks(studentId);
        }, 300);
        return () => clearTimeout(timer);
      }
    } else {
      // No studentId — clear data
      setXmlMarks([]);
      setRatingData(null);
    }
  }, [studentId]);

  const fetchXmlMarksBackground = async (cardNum) => {
    setIsRefreshing(true);
    try {
      const [gradesData, ratingInfo] = await Promise.all([
        getStudentGrades(cardNum),
        fetchStudentRating(cardNum)
      ]);
      setXmlMarks(gradesData);
      setRatingData(ratingInfo);
      localStorage.setItem(`study_xmlMarks_${cardNum}`, JSON.stringify(gradesData));
      localStorage.setItem(`study_ratingData_${cardNum}`, JSON.stringify(ratingInfo));
    } catch (err) {
      console.error("Background refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchXmlMarks = async (cardNum) => {
    if (!cardNum) return;
    console.log("fetchXmlMarks triggered for:", cardNum);
    setLoadingXml(true);
    setLoadingRating(true);
    setErrorXml(null);
    setRatingData(null);
    
    try {
      // Parallel fetch for grades and rating
      const [gradesData, ratingInfo] = await Promise.all([
        getStudentGrades(cardNum),
        fetchStudentRating(cardNum)
      ]);
      
      console.log("getStudentGrades returned:", gradesData);
      console.log("fetchStudentRating returned:", ratingInfo);
      
      setXmlMarks(gradesData);
      setRatingData(ratingInfo);
      // Save to studentId-keyed cache
      localStorage.setItem(`study_xmlMarks_${cardNum}`, JSON.stringify(gradesData));
      localStorage.setItem(`study_ratingData_${cardNum}`, JSON.stringify(ratingInfo));
    } catch (err) {
      console.error("Error fetching XML marks or rating", err);
      setErrorXml("Не удалось загрузить данные. Проверьте номер зачетки.");
    } finally {
      setLoadingXml(false);
      setLoadingRating(false);
    }
  };

  const handleSaveStudentId = async () => {
    if (!studentCard) return;
    const success = await updatePreferences(group, 0, studentCard);
    if (success) {
      fetchXmlMarks(studentCard);
    }
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Учеба БГУИР</h1>
        <button 
          onClick={() => navigate('/settings')} 
          className="p-2.5 bg-tg-secondaryBg text-tg-hint hover:text-tg-button rounded-xl border border-[var(--tg-theme-hint-color)] border-opacity-10 shadow-sm transition-all"
        >
          <Settings size={20} />
        </button>
      </div>

      {isTeacher ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-6 space-y-4 bg-tg-secondaryBg rounded-3xl border border-tg-hint border-opacity-10">
          <div className="w-20 h-20 bg-tg-button/10 rounded-full flex items-center justify-center">
            <GraduationCap size={40} className="text-tg-button" />
          </div>
          <h2 className="text-xl font-bold text-tg-text">Вы — преподаватель</h2>
          <p className="text-tg-hint text-sm leading-relaxed max-w-xs">
            Раздел «Учеба» предназначен для студентов (оценки и рейтинг). Ваш основной рабочий инструмент — вкладка «Расписание».
          </p>
          <button 
            onClick={() => navigate('/schedule')}
            className="px-6 py-3 bg-tg-button text-tg-buttonText rounded-2xl font-bold shadow-lg shadow-tg-button/20"
          >
            Перейти к расписанию
          </button>
        </div>
      ) : (
        <>
          {/* Секция "Текущие оценки" */}
          <div className="bg-tg-secondaryBg rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[var(--tg-theme-hint-color)] opacity-80 flex justify-between items-center">
              <h2 className="font-semibold flex items-center gap-2">
                <BookOpen size={20}/> Текущие оценки
                {isRefreshing && (
                  <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 border border-tg-button text-tg-button rounded-full opacity-70">
                    <Loader2 size={12} className="animate-spin flex-shrink-0" />
                    <span className="text-[9px] font-bold tracking-wider uppercase">Кэш</span>
                  </div>
                )}
              </h2>
              {!studentId && <Info size={16} className="text-tg-hint" />}
            </div>
            <div className="p-4 space-y-4">
              {!studentId ? (
                <div className="space-y-3">
                  <p className="text-xs text-tg-hint">Введите номер студенческого билета для получения оценок:</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tg-hint" size={16} />
                      <input 
                        type="text" 
                        placeholder="Пример: 206554" 
                        value={studentCard}
                        onChange={e => setStudentCard(e.target.value)}
                        className="w-full bg-tg-bg text-tg-text pl-9 pr-4 py-2.5 rounded-xl border border-tg-hint border-opacity-20 focus:outline-none focus:ring-2 focus:ring-tg-button text-sm"
                      />
                    </div>
                    <button 
                      onClick={handleSaveStudentId}
                      className="px-4 py-2.5 bg-tg-button text-white rounded-xl font-medium text-sm hover:opacity-90 transition shadow-sm"
                    >
                      OK
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Rating Widget */}
                  {(loadingRating || ratingData) && (
                    <div className="bg-tg-bg p-4 rounded-xl border border-tg-button border-opacity-20 mb-4 relative">
                      {loadingRating ? (
                        <div className="w-full text-center text-xs text-tg-hint animate-pulse">Загрузка рейтинга...</div>
                      ) : ratingData ? (
                        <>
                          {isRefreshing && (
                            <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-tg-button text-tg-button opacity-70">
                              <Loader2 size={10} className="animate-spin flex-shrink-0" />
                              <span className="text-[8px] font-bold tracking-wider uppercase">Кэш / Обновляем</span>
                            </div>
                          )}
                          {ratingData.specName && (
                            <div className="text-center mb-3">
                              <span className="text-[10px] uppercase font-bold text-tg-hint tracking-wider">Специальность</span>
                              <div className="text-sm font-bold text-tg-text mt-0.5">{ratingData.specName}</div>
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold text-tg-hint tracking-wider">Ваше место</span>
                              <div className="flex items-baseline gap-1 mt-0.5">
                                <Trophy size={16} className="text-yellow-500 mb-0.5" />
                                <span className="text-xl font-black text-tg-text">{ratingData.rank}</span>
                                <span className="text-xs text-tg-hint font-medium">из {ratingData.total}</span>
                              </div>
                            </div>
                            <div className="h-10 w-px bg-tg-hint opacity-10"></div>
                            <div className="flex flex-col text-right">
                              <span className="text-[10px] uppercase font-bold text-tg-hint tracking-wider">Средний балл</span>
                              <div className="flex items-baseline justify-end gap-1 mt-0.5">
                                <span className="text-xl font-black text-tg-button">{displayAverage > 0 ? displayAverage.toFixed(1) : '0.0'}</span>
                                <Star size={14} className="text-tg-button fill-tg-button opacity-20 mb-0.5" />
                              </div>
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}

                  {loadingXml ? (
                    <div className="text-center py-4 text-tg-hint text-sm">Загрузка данных из IIS...</div>
                  ) : errorXml ? (
                    <div className="text-center py-4 text-red-500 text-sm bg-red-50 rounded-xl">{errorXml}</div>
                  ) : xmlMarks.length > 0 ? (
                    <div className="space-y-3">
                      {xmlMarks.map((m, idx) => (
                        <div key={idx} className="p-4 bg-tg-bg rounded-2xl border border-tg-hint border-opacity-10 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-tg-hint uppercase tracking-tight">{m.subject}</span>
                            {m.marks && m.marks.length > 3 && (
                              <span className="text-[10px] text-tg-hint opacity-50 px-2 py-0.5 bg-tg-secondaryBg rounded-full border border-tg-hint border-opacity-10">
                                {m.marks.length} оц.
                              </span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap gap-2.5">
                            {m.marks && m.marks.length > 0 ? m.marks.map((mark, midx) => {
                              if (mark === null || mark === undefined) return null;
                              const val = (typeof mark === 'object' && mark !== null) ? mark.val : mark;
                              const date = (typeof mark === 'object' && mark !== null) ? mark.date : null;
                              if (val === undefined || val === null) return null;

                              return (
                                <div key={midx} className="flex flex-col items-center gap-1.5">
                                  <span 
                                    title={date ? `Выставлена: ${date}` : ''}
                                    onClick={() => date && WebApp.showAlert(`Оценка ${val} выставлена ${date}`)}
                                    className={`w-10 h-10 flex items-center justify-center rounded-xl text-sm font-black border shadow-sm transition-all active:scale-90 ${
                                      val >= 8 ? 'bg-green-500/10 text-green-600 border-green-500/20' : 
                                      val >= 4 ? 'bg-tg-button/10 text-tg-button border-tg-button/20' : 
                                      'bg-red-500/10 text-red-600 border-red-500/20'
                                    }`}
                                  >
                                    {val}
                                  </span>
                                  {date && typeof date === 'string' && (
                                    <span className="text-[8px] text-tg-hint opacity-70 font-bold bg-tg-secondaryBg/30 px-1.5 py-0.5 rounded-md border border-tg-hint border-opacity-5">
                                      {date.includes('.') ? date.split('.').slice(0, 2).join('.') : date}
                                    </span>
                                  )}
                                </div>
                              );
                            }) : (
                              <span className="text-xs text-tg-hint italic opacity-60">Оценок пока нет</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-tg-hint text-sm">Оценок пока нет</div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Attendance Stats Widget - Official IIS Data */}
          <div className="bg-tg-secondaryBg rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[var(--tg-theme-hint-color)] opacity-80 flex items-center gap-2">
              <Clock size={20} className="text-tg-button" />
              <h2 className="font-semibold text-tg-text">Пропуски занятий (ИИС)</h2>
            </div>
            <div className="p-4">
              <div className="bg-tg-bg p-4 rounded-xl border border-tg-button border-opacity-20 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-tg-hint tracking-wider">Всего пропущено</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className={`text-2xl font-black ${(grades?.total_iis_hours || 0) > 30 ? 'text-red-500' : 'text-tg-text'}`}>
                      {grades?.total_iis_hours || 0}
                    </span>
                    <span className="text-xs text-tg-hint font-medium">акад. ч</span>
                  </div>
                  {grades?.total_respectful_hours > 0 && (
                    <span className="text-[9px] text-tg-button font-bold bg-tg-button/10 px-1.5 py-0.5 rounded-md mt-1 italic">
                      из них {grades.total_respectful_hours} ч — уваж.
                    </span>
                  )}
                </div>
                <div className="h-10 w-px bg-tg-hint opacity-10"></div>
                <div className="flex flex-col text-right">
                  <span className="text-[10px] uppercase font-bold text-tg-hint tracking-wider">Предметов</span>
                  <div className="flex items-baseline justify-end gap-1 mt-0.5">
                    <span className="text-xl font-black text-tg-text">
                      {grades?.subjects?.filter(s => (s.skips_count || 0) > 0).length || 0}
                    </span>
                    <AlertTriangle size={14} className="text-red-500 opacity-20 mb-0.5" />
                  </div>
                </div>
              </div>
              
              {grades?.subjects?.some((s) => (s.skip_hours || 0) > 0) && (
                <div className="mt-4 space-y-2">
                  <span className="text-[10px] uppercase font-black text-tg-hint tracking-widest ml-1">Детализация по предметам</span>
                  {grades.subjects.filter(s => (s.skip_hours || 0) > 0).map(s => (
                    <div key={s.subject} className="flex justify-between items-center p-3 bg-tg-bg/50 rounded-xl border border-tg-hint border-opacity-5">
                      <span className="text-xs font-bold text-tg-text truncate max-w-[200px]">{s.subject}</span>
                      <span className="text-xs font-black text-tg-button">{s.skip_hours} ч</span>
                    </div>
                  ))}
                </div>
              )}

              {!grades?.total_iis_hours && (
                <div className="text-center py-6">
                  <div className="text-2xl mb-2">🎉</div>
                  <div className="text-sm font-bold text-tg-text">Пропусков нет!</div>
                  <div className="text-[11px] text-tg-hint mt-1">Официальные пропуски (нули в журнале) появятся здесь автоматически.</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
