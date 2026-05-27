import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { BookOpen, Star, GraduationCap, Settings, Info, Search, Trophy, Loader2, Clock, AlertTriangle, ChevronDown, CalendarDays, Users, Trash2, UserPlus, RefreshCw, X, ChevronRight, Pencil } from 'lucide-react';
import icon from '../assets/icon.png';
import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { getStudentGrades, fetchStudentRating } from '../utils/bsuirApi';
import WebApp from '@twa-dev/sdk';


export default function Study() {
  const { group, telegramId, studentId, isTeacher, updatePreferences } = useUser();
  const navigate = useNavigate();

  // Friends Rating Leaderboard states
  const [showFriendsRating, setShowFriendsRating] = useState(false);
  const [friendsList, setFriendsList] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('rating_friends_list')) || [];
    } catch {
      return [];
    }
  });
  const [friendSearch, setFriendSearch] = useState('');
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [refreshingFriends, setRefreshingFriends] = useState(false);
  const [addFriendError, setAddFriendError] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentMarks, setStudentMarks] = useState([]);
  const [loadingFriendMarks, setLoadingFriendMarks] = useState(false);
  const [editingFriendCard, setEditingFriendCard] = useState(null);
  const [editNicknameValue, setEditNicknameValue] = useState('');

  // Helper to get cache keys bound to a specific studentId
  const getCacheKey = (base, id) => id ? `${base}_${id}` : base;

  // Load cached data from localStorage on mount (keyed by current studentId)
  // Try backend cache first (study_grades_<telegramId>), then fall back to per-studentId cache
  const [grades, setGrades] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`study_grades_${telegramId}`)) || JSON.parse(localStorage.getItem('study_grades')); } catch { return null; }
  });
  const [xmlMarks, setXmlMarks] = useState(() => {
    try {
      // Priority: backend grades cache (has subjects) → per-studentId cache
      const backendCache = JSON.parse(localStorage.getItem(`study_grades_${telegramId}`));
      if (backendCache?.subjects?.length > 0) return backendCache.subjects;
      const key = studentId ? `study_xmlMarks_${studentId}` : 'study_xmlMarks';
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch { return []; }
  });
  const [loadingXml, setLoadingXml] = useState(false);
  const [studentCard, setStudentCard] = useState(studentId || '');
  const [errorXml, setErrorXml] = useState(null);
  const [omissionsData, setOmissionsData] = useState(() => {
    try {
      const key = studentId ? `study_omissions_${studentId}` : 'study_omissions';
      return JSON.parse(localStorage.getItem(key)) || null;
    } catch { return null; }
  });
  const [ratingData, setRatingData] = useState(() => {
    try {
      // Priority: backend grades cache → per-studentId cache
      const backendCache = JSON.parse(localStorage.getItem(`study_grades_${telegramId}`));
      if (backendCache?.is_real && backendCache?.average) {
        return {
          rank: backendCache.rating || '-',
          total: '-',
          student: { average: backendCache.average },
          specName: backendCache.specName || null
        };
      }
      const key = studentId ? `study_ratingData_${studentId}` : 'study_ratingData';
      return JSON.parse(localStorage.getItem(key));
    } catch { return null; }
  });
  const [loadingRating, setLoadingRating] = useState(false);
  const [expandedOmissionSubjects, setExpandedOmissionSubjects] = useState([]);
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
    if (!telegramId) return;
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
        // Cache by telegramId for fast restore on next mount
        localStorage.setItem(`study_grades_${telegramId}`, JSON.stringify(data));
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

        // Save omissions from backend response if present
        if (data.total_iis_hours !== undefined && data.subjects) {
          const omissions = {
            total_hours: data.total_iis_hours || 0,
            total_respectful_hours: data.total_respectful_hours || 0,
            subjects: data.subjects.filter(s => (s.skip_hours || 0) > 0).map(s => ({
              subject: s.subject,
              skip_hours: s.skip_hours || 0,
              respectful_hours: s.respectful_hours || 0
            }))
          };
          setOmissionsData(omissions);
          const omissionsKey = studentId ? `study_omissions_${studentId}` : 'study_omissions';
          localStorage.setItem(omissionsKey, JSON.stringify(omissions));
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
      const omissionsKey = `study_omissions_${studentId}`;
      const cachedMarks = localStorage.getItem(marksKey);
      const cachedRating = localStorage.getItem(ratingKey);
      const cachedOmissions = localStorage.getItem(omissionsKey);

      if (cachedMarks) {
        // Cache hit — show cached data immediately, refresh in background
        try { setXmlMarks(JSON.parse(cachedMarks)); } catch { /* ignore */ }
        try { setRatingData(JSON.parse(cachedRating)); } catch { /* ignore */ }
        try { if (cachedOmissions) setOmissionsData(JSON.parse(cachedOmissions)); } catch { /* ignore */ }
        fetchXmlMarksBackground(studentId);
      } else {
        // No cache — show loader and fetch
        setXmlMarks([]);
        setRatingData(null);
        setOmissionsData(null);
        const timer = setTimeout(() => {
          fetchXmlMarks(studentId);
        }, 300);
        return () => clearTimeout(timer);
      }
    } else {
      // No studentId — clear data
      setXmlMarks([]);
      setRatingData(null);
      setOmissionsData(null);
    }
  }, [studentId]);

  const fetchXmlMarksBackground = async (cardNum) => {
    setIsRefreshing(true);
    try {
      const [gradesResult, ratingInfo] = await Promise.all([
        getStudentGrades(cardNum),
        fetchStudentRating(cardNum)
      ]);
      const gradesData = gradesResult?.subjects || gradesResult || [];
      const omissions = gradesResult?.omissions || null;
      setXmlMarks(Array.isArray(gradesData) ? gradesData : []);
      setRatingData(ratingInfo);
      if (omissions) {
        setOmissionsData(omissions);
        localStorage.setItem(`study_omissions_${cardNum}`, JSON.stringify(omissions));
      }
      localStorage.setItem(`study_xmlMarks_${cardNum}`, JSON.stringify(Array.isArray(gradesData) ? gradesData : []));
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
      const [gradesResult, ratingInfo] = await Promise.all([
        getStudentGrades(cardNum),
        fetchStudentRating(cardNum)
      ]);
      
      console.log("getStudentGrades returned:", gradesResult);
      console.log("fetchStudentRating returned:", ratingInfo);
      
      const gradesData = gradesResult?.subjects || gradesResult || [];
      const omissions = gradesResult?.omissions || null;
      setXmlMarks(Array.isArray(gradesData) ? gradesData : []);
      setRatingData(ratingInfo);
      if (omissions) {
        setOmissionsData(omissions);
        localStorage.setItem(`study_omissions_${cardNum}`, JSON.stringify(omissions));
      }
      // Save to studentId-keyed cache
      localStorage.setItem(`study_xmlMarks_${cardNum}`, JSON.stringify(Array.isArray(gradesData) ? gradesData : []));
      localStorage.setItem(`study_ratingData_${cardNum}`, JSON.stringify(ratingInfo));
    } catch (err) {
      console.error("Error fetching XML marks or rating", err);
      setErrorXml("Не удалось загрузить данные. Проверьте номер зачетки.");
    } finally {
      setLoadingXml(false);
      setLoadingRating(false);
    }
  };

  const handleAddFriend = async (cardNumberToSearch) => {
    const cardToSearch = cardNumberToSearch || friendSearch;
    if (!cardToSearch || !cardToSearch.trim()) return;
    
    const cleanCard = cardToSearch.replace(/[^0-9]/g, '');
    if (cleanCard.length < 4) {
      setAddFriendError('Номер студенческого слишком короткий');
      return;
    }

    setAddFriendError('');
    // Check if duplicate
    const isDuplicate = friendsList.some(f => f.studentCardNumber?.replace(/[^0-9]/g, '') === cleanCard);
    if (isDuplicate) {
      setAddFriendError('Студент уже добавлен в ваш список');
      return;
    }

    setIsAddingFriend(true);
    try {
      const result = await fetchStudentRating(cleanCard);
      if (result && result.student) {
        const friendObj = {
          fio: result.student.fio,
          average: result.student.average,
          studentCardNumber: result.student.studentCardNumber,
          specName: result.specName || 'Специальность определена'
        };
        const newList = [...friendsList, friendObj].sort((a, b) => b.average - a.average);
        setFriendsList(newList);
        localStorage.setItem('rating_friends_list', JSON.stringify(newList));
        if (!cardNumberToSearch) setFriendSearch('');
      } else {
        setAddFriendError('Студент не найден. Проверьте номер студенческого.');
      }
    } catch (err) {
      console.error(err);
      setAddFriendError('Ошибка поиска студента. Попробуйте еще раз.');
    } finally {
      setIsAddingFriend(false);
    }
  };

  const handleRemoveFriend = (cardToRemove) => {
    const newList = friendsList.filter(f => f.studentCardNumber !== cardToRemove);
    setFriendsList(newList);
    localStorage.setItem('rating_friends_list', JSON.stringify(newList));
  };

  const handleRefreshFriends = async () => {
    if (friendsList.length === 0) return;
    setRefreshingFriends(true);
    try {
      const updatedList = await Promise.all(
        friendsList.map(async (friend) => {
          try {
            const result = await fetchStudentRating(friend.studentCardNumber);
            if (result && result.student) {
              return {
                ...friend,
                average: result.student.average,
                fio: result.student.fio,
                specName: result.specName || friend.specName
              };
            }
          } catch (e) {
            console.error(`Failed to refresh friend ${friend.studentCardNumber}:`, e);
          }
          return friend;
        })
      );
      const sortedList = updatedList.sort((a, b) => b.average - a.average);
      setFriendsList(sortedList);
      localStorage.setItem('rating_friends_list', JSON.stringify(sortedList));
    } catch (err) {
      console.error('Error refreshing friends list:', err);
    } finally {
      setRefreshingFriends(false);
    }
  };

  const fetchFriendMarks = async (student) => {
    setSelectedStudent(student);
    setStudentMarks([]);
    setLoadingFriendMarks(true);
    try {
      const marks = await getStudentGrades(student.studentCardNumber);
      const marksData = marks?.subjects || marks || [];
      setStudentMarks(Array.isArray(marksData) ? marksData : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFriendMarks(false);
    }
  };

  const handleSaveNickname = (cardNumber) => {
    const newList = friendsList.map(f => {
      if (f.studentCardNumber === cardNumber) {
        return { ...f, nickname: editNicknameValue.trim() || null };
      }
      return f;
    });
    setFriendsList(newList);
    localStorage.setItem('rating_friends_list', JSON.stringify(newList));
    setEditingFriendCard(null);
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
        <div className="flex flex-col items-center justify-center text-center py-20 px-6 space-y-4 bg-tg-secondaryBg rounded-3xl border border-tg-hint border-opacity-10 overflow-hidden">
          <div className="w-20 h-20 bg-tg-button/10 rounded-full flex items-center justify-center">
            <img src={icon} alt="Logo" className="w-12 h-12 object-contain" />
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
                        placeholder="Пример: 56841038 (8 цифр)" 
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
                  {studentCard && studentCard.length !== 8 && (
                    <p className="text-[10px] text-red-500 font-bold ml-1 animate-pulse">Обычно в номере зачетки 8 цифр</p>
                  )}
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

                          <div className="h-px bg-tg-hint opacity-10 my-3"></div>

                          <button 
                            onClick={() => setShowFriendsRating(!showFriendsRating)}
                            className="w-full py-2 bg-tg-button/10 text-tg-button hover:bg-tg-button hover:text-tg-buttonText rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 mb-2"
                          >
                            <Users size={14} /> {showFriendsRating ? 'Скрыть рейтинг' : 'Соревноваться с друзьями'}
                          </button>

                          {showFriendsRating && (
                            <div className="space-y-4 mt-4 pt-4 border-t border-tg-hint border-opacity-10 animate-in fade-in duration-200">
                              {/* Add Friend Form */}
                              <div className="bg-tg-secondaryBg p-3 rounded-xl border border-tg-hint border-opacity-10 space-y-2 text-left">
                                <div className="flex justify-between items-center">
                                  <label className="text-[9px] uppercase font-bold text-tg-hint ml-0.5 tracking-wider">Добавить друга в рейтинг</label>
                                  {studentId && !friendsList.some(f => f.studentCardNumber?.replace(/[^0-9]/g, '') === studentId.replace(/[^0-9]/g, '')) && (
                                    <button 
                                      onClick={() => handleAddFriend(studentId)}
                                      disabled={isAddingFriend}
                                      className="text-[9px] font-bold text-tg-button hover:underline flex items-center gap-1 active:scale-95 transition-all"
                                    >
                                      <UserPlus size={10} /> Добавить себя
                                    </button>
                                  )}
                                </div>
                                <form 
                                  onSubmit={(e) => { e.preventDefault(); handleAddFriend(); }} 
                                  className="flex gap-2"
                                >
                                  <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tg-hint" size={14} />
                                    <input 
                                      type="text" 
                                      placeholder="Номер зачетки друга..." 
                                      value={friendSearch}
                                      onChange={e => setFriendSearch(e.target.value)}
                                      className="w-full bg-tg-bg text-tg-text pl-8 pr-3 py-2 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-tg-button border border-tg-hint border-opacity-15"
                                    />
                                  </div>
                                  <button 
                                    type="submit"
                                    disabled={isAddingFriend || !friendSearch.trim()}
                                    className="bg-tg-button text-tg-buttonText px-3 py-2 rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center w-10 shrink-0"
                                  >
                                    {isAddingFriend ? '...' : <UserPlus size={14} />}
                                  </button>
                                </form>

                                {addFriendError && (
                                  <div className="text-[9px] text-red-500 font-bold ml-0.5 animate-pulse">{addFriendError}</div>
                                )}
                              </div>

                              {/* Friends Leaderboard List */}
                              {friendsList.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center px-1">
                                    <h3 className="font-bold text-xs flex items-center gap-1.5">
                                      <Trophy size={14} className="text-yellow-500" /> Рейтинг с друзьями
                                      <span className="text-[9px] text-tg-hint font-normal">({friendsList.length})</span>
                                    </h3>
                                    <button 
                                      onClick={handleRefreshFriends}
                                      disabled={refreshingFriends}
                                      className={`p-1.5 bg-tg-secondaryBg text-tg-hint hover:text-tg-button rounded-lg border border-[var(--tg-theme-hint-color)] border-opacity-10 shadow-sm active:scale-90 transition-all ${refreshingFriends ? 'opacity-50' : ''}`}
                                      title="Обновить баллы"
                                    >
                                      <RefreshCw size={12} className={refreshingFriends ? "animate-spin" : ""} />
                                    </button>
                                  </div>

                                  <div className="bg-tg-secondaryBg rounded-xl overflow-hidden shadow-sm divide-y divide-tg-hint divide-opacity-10 text-left">
                                    {friendsList.map((student, idx) => {
                                      const isYou = studentId && student.studentCardNumber?.replace(/[^0-9]/g, '') === studentId.replace(/[^0-9]/g, '');
                                      
                                      return (
                                        <div 
                                          key={student.studentCardNumber} 
                                          onClick={() => fetchFriendMarks(student)}
                                          className={`p-3 flex items-center gap-3 active:bg-tg-bg transition-all cursor-pointer group relative ${isYou ? 'bg-tg-button/5 border-l-2 border-tg-button' : ''}`}
                                        >
                                          {/* Rank badge */}
                                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                            idx === 0 ? 'bg-yellow-500/20 text-yellow-600 border border-yellow-500/30' : 
                                            idx === 1 ? 'bg-gray-400/20 text-gray-500 border border-gray-400/30' : 
                                            idx === 2 ? 'bg-orange-600/20 text-orange-700 border border-orange-600/30' : 
                                            'bg-tg-bg text-tg-hint'
                                          }`}>
                                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                                          </div>

                                          <div className="flex-1 min-w-0">
                                            {editingFriendCard === student.studentCardNumber ? (
                                              <div className="flex gap-1.5 items-center" onClick={e => e.stopPropagation()}>
                                                <input
                                                  type="text"
                                                  value={editNicknameValue}
                                                  onChange={e => setEditNicknameValue(e.target.value)}
                                                  placeholder="Имя друга..."
                                                  className="bg-tg-bg text-tg-text px-2 py-1 rounded text-xs focus:outline-none focus:ring-1 focus:ring-tg-button border border-tg-hint border-opacity-15 w-full font-bold"
                                                  autoFocus
                                                />
                                                <button
                                                  onClick={() => handleSaveNickname(student.studentCardNumber)}
                                                  className="px-2 py-1 bg-tg-button text-tg-buttonText rounded text-[10px] font-black shrink-0 active:scale-90 transition-all"
                                                >
                                                  OK
                                                </button>
                                                <button
                                                  onClick={() => setEditingFriendCard(null)}
                                                  className="px-2 py-1 bg-tg-bg text-tg-hint rounded text-[10px] font-bold shrink-0 active:scale-90 transition-all border border-tg-hint border-opacity-10"
                                                >
                                                  Отмена
                                                </button>
                                              </div>
                                            ) : (
                                              <>
                                                <div className="font-bold text-xs text-tg-text group-hover:text-tg-button transition-colors flex items-center gap-1">
                                                  <span className="truncate">{student.nickname || student.fio || 'Студент БГУИР'}</span>
                                                  {isYou && (
                                                    <span className="text-[7px] font-black uppercase bg-tg-button text-tg-buttonText px-1 py-0.5 rounded shadow-sm shrink-0">Ты</span>
                                                  )}
                                                </div>
                                                <div className="text-[9px] text-tg-hint truncate mt-0.5">
                                                  {student.nickname && student.fio && (
                                                    <span className="opacity-60 italic mr-1">({(student.fio || '').split(' ')[0]})</span>
                                                  )}
                                                  Зачетка: {student.studentCardNumber} • {student.specName}
                                                </div>
                                              </>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="font-black text-sm text-tg-button">{student.average.toFixed(1)}</span>
                                            {editingFriendCard !== student.studentCardNumber && (
                                              <button 
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditingFriendCard(student.studentCardNumber);
                                                  setEditNicknameValue(student.nickname || student.fio);
                                                }}
                                                className="p-1 text-tg-hint hover:text-tg-button rounded transition-colors opacity-0 group-hover:opacity-100 max-sm:opacity-100"
                                                title="Задать имя"
                                              >
                                                <Pencil size={12} />
                                              </button>
                                            )}
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveFriend(student.studentCardNumber);
                                              }}
                                              className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100 max-sm:opacity-100"
                                              title="Удалить из рейтинга"
                                            >
                                              <Trash2 size={12} />
                                            </button>
                                            <ChevronRight size={12} className="text-tg-hint opacity-30 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center py-8 text-tg-hint text-xs bg-tg-secondaryBg rounded-2xl border border-dashed border-[var(--tg-theme-hint-color)] border-opacity-15 flex flex-col items-center gap-2 px-4">
                                  <div className="w-10 h-10 bg-tg-button/10 rounded-full flex items-center justify-center text-tg-button">
                                    <Users size={20} />
                                  </div>
                                  <div className="space-y-0.5">
                                    <h4 className="font-bold text-tg-text">Соревнуйтесь с друзьями!</h4>
                                    <p className="text-[10px] text-tg-hint max-w-[200px] mx-auto leading-relaxed">
                                      Добавьте друзей по номеру студенческого, чтобы соревноваться по среднему баллу!
                                    </p>
                                  </div>
                                  {studentId && (
                                    <button 
                                      onClick={() => handleAddFriend(studentId)}
                                      disabled={isAddingFriend}
                                      className="mt-1 px-4 py-2 bg-tg-button text-tg-buttonText rounded-lg font-bold text-[10px] shadow-sm active:scale-95 transition-all flex items-center gap-1"
                                    >
                                      <UserPlus size={12} /> Добавить себя первым
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
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
                            <div className="flex items-center gap-1.5">
                              {(() => {
                                const vals = (m.marks || [])
                                  .map(mk => (mk && typeof mk === 'object') ? mk.val : mk)
                                  .filter(v => typeof v === 'number' && !isNaN(v));
                                if (vals.length === 0) return null;
                                const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                                return (
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                    avg >= 8 ? 'text-green-600 bg-green-500/10 border-green-500/20' :
                                    avg >= 4 ? 'text-tg-button bg-tg-button/10 border-tg-button/20' :
                                    'text-red-600 bg-red-500/10 border-red-500/20'
                                  }`}>
                                    Ø {avg.toFixed(1)}
                                  </span>
                                );
                              })()}
                              {m.marks && m.marks.length > 3 && (
                                <span className="text-[10px] text-tg-hint opacity-50 px-2 py-0.5 bg-tg-secondaryBg rounded-full border border-tg-hint border-opacity-10">
                                  {m.marks.length} оц.
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-2.5">
                            {m.marks && m.marks.length > 0 ? m.marks.map((mark, midx) => {
                              if (mark === null || mark === undefined) return null;
                              const val = (typeof mark === 'object' && mark !== null) ? mark.val : mark;
                              const date = (typeof mark === 'object' && mark !== null) ? mark.date : null;
                              const lessonType = (typeof mark === 'object' && mark !== null) ? mark.lessonType : null;
                              if (val === undefined || val === null) return null;

                              return (
                                <div key={midx} className="flex flex-col items-center gap-1">
                                  <span 
                                    title={date ? `Выставлена: ${date}` : ''}
                                    onClick={() => {
                                      const parts = [];
                                      parts.push(`Оценка ${val}`);
                                      if (lessonType) parts.push(`Тип: ${lessonType === 'ЛК' ? 'Лекция' : lessonType === 'ПЗ' ? 'Практика' : lessonType === 'ЛР' ? 'Лаб. работа' : lessonType}`);
                                      if (date) parts.push(`Дата: ${date}`);
                                      WebApp.showAlert(parts.join('\n'));
                                    }}
                                    className={`w-10 h-10 flex items-center justify-center rounded-xl text-sm font-black border shadow-sm transition-all active:scale-90 ${
                                      val >= 8 ? 'bg-green-500/10 text-green-600 border-green-500/20' : 
                                      val >= 4 ? 'bg-tg-button/10 text-tg-button border-tg-button/20' : 
                                      'bg-red-500/10 text-red-600 border-red-500/20'
                                    }`}
                                  >
                                    {val}
                                  </span>
                                  {lessonType && (
                                    <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-md border ${
                                      lessonType === 'ЛК' ? 'bg-purple-500/10 text-purple-500 border-purple-500/15' :
                                      lessonType === 'ПЗ' ? 'bg-blue-500/10 text-blue-500 border-blue-500/15' :
                                      lessonType === 'ЛР' ? 'bg-green-500/10 text-green-500 border-green-500/15' :
                                      'bg-tg-hint/10 text-tg-hint border-tg-hint/15'
                                    }`}>
                                      {lessonType}
                                    </span>
                                  )}
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
              {(isRefreshing || loadingXml) && <Loader2 size={14} className="animate-spin text-tg-hint ml-auto" />}
            </div>
            <div className="p-4">
              {omissionsData ? (
                <>
                  {/* Summary stats */}
                  <div className="bg-tg-bg p-4 rounded-xl border border-tg-button border-opacity-20">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-tg-hint tracking-wider">Всего пропущено</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className={`text-2xl font-black ${(omissionsData.total_hours || 0) > 30 ? 'text-red-500' : 'text-tg-text'}`}>
                            {omissionsData.total_hours || 0}
                          </span>
                          <span className="text-xs text-tg-hint font-medium">акад. ч</span>
                        </div>
                      </div>
                      <div className="h-10 w-px bg-tg-hint opacity-10"></div>
                      <div className="flex flex-col text-right">
                        <span className="text-[10px] uppercase font-bold text-tg-hint tracking-wider">Предметов</span>
                        <div className="flex items-baseline justify-end gap-1 mt-0.5">
                          <span className="text-xl font-black text-tg-text">
                            {omissionsData.subjects?.length || 0}
                          </span>
                          <AlertTriangle size={14} className="text-red-500 opacity-20 mb-0.5" />
                        </div>
                      </div>
                    </div>
                    

                  </div>
                  
                  {/* Subject-level breakdown with expandable details */}
                  {omissionsData.subjects?.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <span className="text-[10px] uppercase font-black text-tg-hint tracking-widest ml-1">Детализация по предметам</span>
                      {omissionsData.subjects.map(s => {
                        const isExpanded = expandedOmissionSubjects.includes(s.subject);
                        
                        return (
                          <div key={s.subject} className="bg-tg-bg/50 rounded-xl border border-tg-hint border-opacity-5 overflow-hidden">
                            {/* Subject header - clickable */}
                            <button
                              onClick={() => {
                                setExpandedOmissionSubjects(prev =>
                                  prev.includes(s.subject)
                                    ? prev.filter(x => x !== s.subject)
                                    : [...prev, s.subject]
                                );
                              }}
                              className="w-full flex justify-between items-center p-3 active:bg-tg-hint/5 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ChevronDown
                                  size={14}
                                  className={`text-tg-hint flex-shrink-0 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
                                />
                                <span className="text-xs font-bold text-tg-text truncate">{s.subject}</span>
                              </div>
                              <span className="text-xs font-black text-red-500 flex-shrink-0 ml-2">{s.skip_hours} ч</span>
                            </button>
                            
                            {/* Expanded detail records */}
                            {isExpanded && s.records && s.records.length > 0 && (
                              <div className="border-t border-tg-hint border-opacity-5 px-3 pb-3">
                                {s.records.map((r, idx) => (
                                  <div key={idx} className="flex items-center justify-between py-2.5 border-b border-tg-hint border-opacity-5 last:border-0">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      {/* Lesson type badge */}
                                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                                        r.lessonType === 'ЛК' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/15' :
                                        r.lessonType === 'ПЗ' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/15' :
                                        r.lessonType === 'ЛР' ? 'bg-green-500/10 text-green-500 border border-green-500/15' :
                                        'bg-tg-hint/10 text-tg-hint border border-tg-hint/15'
                                      }`}>
                                        {r.lessonType || '—'}
                                      </span>
                                      {/* Date */}
                                      <span className="text-xs text-tg-text font-medium">
                                        {r.date || 'Нет даты'}
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-bold text-red-500">{r.hours} ч</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {omissionsData.total_hours === 0 && (
                    <div className="text-center py-6">
                      <div className="text-2xl mb-2">🎉</div>
                      <div className="text-sm font-bold text-tg-text">Пропусков нет!</div>
                      <div className="text-[11px] text-tg-hint mt-1">Официальные пропуски появятся здесь автоматически.</div>
                    </div>
                  )}
                </>
              ) : studentId ? (
                <div className="text-center py-6 opacity-60">
                  <div className="text-sm font-medium text-tg-hint">Загрузка данных о пропусках...</div>
                </div>
              ) : (
                <div className="text-center py-6 opacity-60">
                  <div className="text-sm font-medium text-tg-hint">Нет данных из ИИС</div>
                  <div className="text-[10px] text-tg-hint mt-1">Убедитесь, что номер зачетки введен верно (8 цифр)</div>
                </div>
              )}
            </div>
          </div>

          {/* This month's non-respectful omissions */}
          {omissionsData && (() => {
            const now = new Date();
            const curMonth = String(now.getMonth() + 1).padStart(2, '0');
            const curYear = String(now.getFullYear());
            const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
            const monthLabel = monthNames[now.getMonth()];

            const thisMonthNonResp = (omissionsData.records || []).filter(r => {
              if (!r.date) return false;
              const parts = r.date.split('.');
              if (parts.length < 3) return false;
              return parts[1] === curMonth && parts[2] === curYear;
            });

            const totalHours = thisMonthNonResp.reduce((sum, r) => sum + (r.hours || 0), 0);

            return (
              <div className="bg-tg-secondaryBg rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[var(--tg-theme-hint-color)] opacity-80 flex items-center gap-2">
                  <CalendarDays size={20} className="text-red-500" />
                  <h2 className="font-semibold text-tg-text">Пропуски — {monthLabel}</h2>
                  {(isRefreshing || loadingXml) && <Loader2 size={14} className="animate-spin text-tg-hint ml-auto" />}
                </div>
                <div className="p-4">
                  {thisMonthNonResp.length > 0 ? (
                    <>
                      <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3 flex items-center justify-between mb-3">
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase font-bold text-red-500 tracking-wider opacity-80">За {monthLabel.toLowerCase()}</span>
                          <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-2xl font-black text-red-500">{totalHours}</span>
                            <span className="text-xs text-red-400 font-medium">акад. ч</span>
                          </div>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[9px] uppercase font-bold text-red-500 tracking-wider opacity-80">Записей</span>
                          <span className="text-xl font-black text-red-500 mt-0.5">{thisMonthNonResp.length}</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {thisMonthNonResp.map((r, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 bg-tg-bg/50 rounded-xl border border-tg-hint border-opacity-5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                                r.lessonType === 'ЛК' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/15' :
                                r.lessonType === 'ПЗ' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/15' :
                                r.lessonType === 'ЛР' ? 'bg-green-500/10 text-green-500 border border-green-500/15' :
                                'bg-tg-hint/10 text-tg-hint border border-tg-hint/15'
                              }`}>
                                {r.lessonType || '—'}
                              </span>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-tg-text truncate">{r.subject}</span>
                                <span className="text-[10px] text-tg-hint">{r.date}</span>
                              </div>
                            </div>
                            <span className="text-xs font-black text-red-500 flex-shrink-0 ml-2">{r.hours} ч</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-6">
                      <div className="text-2xl mb-2">✅</div>
                      <div className="text-sm font-bold text-tg-text">Нет пропусков за {monthLabel.toLowerCase()}</div>
                      <div className="text-[11px] text-tg-hint mt-1">Так держать!</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </>
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
              {loadingFriendMarks ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                   <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-button"></div>
                   <span className="text-xs text-tg-hint">Загрузка оценок...</span>
                </div>
              ) : studentMarks.length > 0 ? (
                studentMarks.map((m, idx) => (
                  <div key={idx} className="p-3 bg-tg-bg rounded-xl border border-tg-hint border-opacity-10 space-y-2">
                    <span className="text-sm font-medium block">{m.subject}</span>
                    <div className="flex flex-wrap gap-2 justify-start">
                      {m.marks && m.marks.length > 0 ? m.marks.map((mark, midx) => {
                        const val = (typeof mark === 'object' && mark !== null) ? mark.val : mark;
                        const lessonType = (typeof mark === 'object' && mark !== null) ? mark.lessonType : null;
                        const date = (typeof mark === 'object' && mark !== null) ? mark.date : null;
                        if (val === undefined || val === null) return null;
                        return (
                          <div key={midx} className="flex flex-col items-center gap-0.5">
                            <span className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold border ${
                              val >= 8 ? 'bg-green-500/10 text-green-600 border-green-500/20' : 
                              val >= 4 ? 'bg-tg-button/10 text-tg-button border-tg-button/20' : 
                              'bg-red-500/10 text-red-600 border-red-500/20'
                            }`}>
                              {val}
                            </span>
                            {lessonType && (
                              <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded border ${
                                lessonType === 'ЛК' ? 'bg-purple-500/10 text-purple-500 border-purple-500/15' :
                                lessonType === 'ПЗ' ? 'bg-blue-500/10 text-blue-500 border-blue-500/15' :
                                lessonType === 'ЛР' ? 'bg-green-500/10 text-green-500 border-green-500/15' :
                                'bg-tg-hint/10 text-tg-hint border-tg-hint/15'
                              }`}>
                                {lessonType}
                              </span>
                            )}
                            {date && typeof date === 'string' && (
                              <span className="text-[7px] text-tg-hint opacity-60 font-medium">
                                {date.includes('.') ? date.split('.').slice(0, 2).join('.') : date}
                              </span>
                            )}
                          </div>
                        );
                      }) : (
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
