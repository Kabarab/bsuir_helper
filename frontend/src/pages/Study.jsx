import { useState, useEffect } from 'react';
import axios from 'axios';
import { BookOpen, Star, GraduationCap, Settings, Info, Search, Trophy, Loader2 } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { getStudentGrades, fetchStudentRating } from '../utils/bsuirApi';

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

  useEffect(() => {
    // Получаем реальные оценки через API рейтинга (Legacy JSON proxy)
    axios.get(`/api/bsuir/grades/${telegramId}`)
      .then(res => {
        setGrades(res.data);
        localStorage.setItem('study_grades', JSON.stringify(res.data));
      })
      .catch(err => console.error(err));
  }, [telegramId]);

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
          {/* Секция "Текущие оценки" (XML Task) */}
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
                            <span className="text-xl font-black text-tg-button">{ratingData.average.toFixed(1)}</span>
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
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-tg-hint text-sm">Оценок пока нет</div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )}
</div>
);
}
