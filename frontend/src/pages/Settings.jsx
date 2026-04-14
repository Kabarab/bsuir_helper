import { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Settings as SettingsIcon, Save, ChevronLeft, GraduationCap, Search, Check } from 'lucide-react';
import icon from '../assets/icon.png';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import WebApp from '@twa-dev/sdk';

export default function Settings() {
  const { 
    group, subgroup, studentId, isTeacher, teacherUrlId, 
    englishTeacherId: savedEngId, englishTeacherFio: savedEngFio, 
    updatePreferences 
  } = useUser();
  const navigate = useNavigate();
  
  const [inputGroup, setInputGroup] = useState(group || '');
  const [inputStudentId, setInputStudentId] = useState(studentId || '');
  const [inputSubgroup, setInputSubgroup] = useState(subgroup || 0);
  
  const [isTeacherLocal, setIsTeacherLocal] = useState(isTeacher);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  
  const [englishTeacherId, setEnglishTeacherId] = useState(savedEngId || null);
  const [englishTeacherFio, setEnglishTeacherFio] = useState(savedEngFio || null);
  const [englishTeacherSearch, setEnglishTeacherSearch] = useState('');
  const [englishTeachers, setEnglishTeachers] = useState([]);
  const [selectedEnglishTeacher, setSelectedEnglishTeacher] = useState(null);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setInputGroup(group || '');
    setInputSubgroup(subgroup || 0);
    setInputStudentId(studentId || '');
    setIsTeacherLocal(isTeacher);
  }, [group, subgroup, studentId, isTeacher]);

  useEffect(() => {
    setEnglishTeacherId(savedEngId || null);
    setEnglishTeacherFio(savedEngFio || null);
  }, [savedEngId, savedEngFio]);


  const handleSearchTeachers = async (val) => {
    setTeacherSearch(val);
    if (val.length < 2) {
      setTeachers([]);
      return;
    }
    try {
      const res = await axios.get('/api/bsuir/teachers');
      const filtered = res.data.filter(t => 
        t.fio.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 5);
      setTeachers(filtered);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearchEnglishTeachers = async (val) => {
    setEnglishTeacherSearch(val);
    if (val.length < 2) {
      setEnglishTeachers([]);
      return;
    }
    try {
      const res = await axios.get('/api/bsuir/teachers');
      const filtered = res.data.filter(t => 
        t.fio.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 5);
      setEnglishTeachers(filtered);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    if (!isTeacherLocal && !inputGroup.trim()) return;

    setIsSaving(true);
    WebApp.MainButton.showProgress();
    const success = await updatePreferences(
      isTeacherLocal ? null : inputGroup.trim(), 
      isTeacherLocal ? 0 : Number(inputSubgroup), 
      isTeacherLocal ? null : inputStudentId.trim(),
      isTeacherLocal,
      isTeacherLocal ? (selectedTeacher?.urlId || teacherUrlId) : null,
      isTeacherLocal ? null : (selectedEnglishTeacher?.urlId || englishTeacherId),
      isTeacherLocal ? null : (selectedEnglishTeacher?.fio || englishTeacherFio)
    );
    setIsSaving(false);
    WebApp.MainButton.hideProgress();
    if (success) {
      WebApp.MainButton.hide();
      navigate(-1);
    }
  };

  const hasChanges = () => {
    if (isTeacherLocal !== isTeacher) return true;
    if (isTeacherLocal) {
      return (selectedTeacher && selectedTeacher.urlId !== teacherUrlId);
    }
    return inputGroup !== (group || '') || 
           inputSubgroup !== (subgroup || 0) || 
           inputStudentId !== (studentId || '') || 
           (selectedEnglishTeacher && selectedEnglishTeacher.urlId !== englishTeacherId);
  };

  useEffect(() => {
    if (hasChanges() && !isSaving) {
      WebApp.MainButton.setText('СОХРАНИТЬ ИЗМЕНЕНИЯ');
      WebApp.MainButton.setParams({
        is_visible: true,
        is_active: true,
        color: '#31b545',
        text_color: '#ffffff'
      });
    } else {
      WebApp.MainButton.hide();
    }
  }, [isTeacherLocal, selectedTeacher, inputGroup, inputSubgroup, inputStudentId, selectedEnglishTeacher, isSaving]);

  useEffect(() => {
    const callback = () => handleSave();
    WebApp.MainButton.onClick(callback);
    return () => {
      WebApp.MainButton.offClick(callback);
      WebApp.MainButton.hide();
    };
  }, [handleSave]);


  return (
    <div className="p-4 relative min-h-[calc(100vh-4rem)] flex flex-col bg-tg-bg text-tg-text">
      <div className="flex items-center gap-3 mb-6">
        <button 
          onClick={() => navigate(-1)} 
          className="p-2 bg-tg-secondaryBg rounded-full hover:bg-tg-hint/10 transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold flex items-center gap-2 flex-1">
          <SettingsIcon size={28} className="text-tg-button" />
          Настройки
        </h1>
        {hasChanges() && (
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="p-2.5 bg-emerald-500 text-white rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-2 font-bold text-sm"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <Check size={20} />
                Сохранить
              </>
            )}
          </button>
        )}
      </div>

      <div className="bg-tg-secondaryBg p-5 rounded-3xl shadow-sm border border-tg-hint/10 mb-6">
        <h2 className="text-lg font-bold mb-4">Роль в приложении</h2>
        <label className="flex items-center gap-3 p-4 bg-tg-bg rounded-2xl cursor-pointer border-2 border-transparent focus-within:border-tg-button mb-4">
          <input 
            type="checkbox" 
            checked={isTeacherLocal}
            onChange={(e) => setIsTeacherLocal(e.target.checked)}
            className="w-5 h-5 accent-tg-button"
          />
          <span className="font-bold text-tg-text">Я преподаватель</span>
        </label>

        {isTeacherLocal ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">
                Поиск преподавателя
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  value={teacherSearch}
                  onChange={(e) => handleSearchTeachers(e.target.value)}
                  placeholder="Введите ФИО..." 
                  className="w-full px-4 py-3.5 rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border border-tg-hint/10 transition-all font-bold"
                />
                {teachers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-tg-secondaryBg border border-tg-button/20 rounded-2xl mt-2 overflow-hidden shadow-2xl z-50">
                    {teachers.map(t => (
                      <div 
                        key={t.id}
                        onClick={() => {
                          setSelectedTeacher(t);
                          setTeacherSearch(t.fio);
                          setTeachers([]);
                        }}
                        className="p-4 hover:bg-tg-button hover:text-tg-buttonText cursor-pointer font-bold border-b border-tg-hint/10 last:border-0"
                      >
                        {t.fio}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {selectedTeacher ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white">✓</div>
                 <div className="text-sm font-bold text-tg-text">Будет выбран: {selectedTeacher.fio}</div>
              </div>
            ) : teacherUrlId && (
              <div className="p-3 bg-tg-button/5 border border-tg-button/10 rounded-xl flex items-center gap-3">
                 <div className="w-8 h-8 bg-tg-button/10 rounded-lg flex items-center justify-center overflow-hidden">
                    <img src={icon} alt="Logo" className="w-5 h-5 object-contain" />
                 </div>
                 <div className="text-sm font-bold text-tg-text">Профиль преподавателя активен</div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">
                Учебная группа
              </label>
              <input 
                type="text" 
                value={inputGroup}
                onChange={(e) => setInputGroup(e.target.value)}
                placeholder="Напр. 114041" 
                className="w-full px-4 py-3.5 rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border border-tg-hint/10 transition-all font-bold text-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">
                Номер студенческого (для оценок)
              </label>
              <input 
                type="text" 
                value={inputStudentId}
                onChange={(e) => setInputStudentId(e.target.value)}
                placeholder="Напр. 1140412" 
                className="w-full px-4 py-3.5 rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border border-tg-hint/10 transition-all font-bold text-lg"
              />
            </div>

            <div>
               <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">
                Подгруппа (для расписания)
              </label>
              <div className="flex bg-tg-bg p-1 rounded-2xl border border-tg-hint/10">
                {[0, 1, 2].map(val => (
                  <button
                    key={val}
                    onClick={() => setInputSubgroup(val)}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                      inputSubgroup === val 
                        ? 'bg-tg-button text-tg-buttonText shadow-md' 
                        : 'text-tg-hint hover:bg-tg-hint/5'
                    }`}
                  >
                    {val === 0 ? 'Все' : `${val} подгруппа`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {!isTeacherLocal && (
        <div className="bg-tg-secondaryBg p-5 rounded-3xl shadow-sm border border-tg-hint/10 mb-6">
          <h2 className="text-lg font-bold mb-4">Преподаватель английского</h2>
          <p className="text-xs text-tg-hint mb-4 ml-1">Выберите преподавателя, чтобы в расписании не показывались занятия других групп по английскому.</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">
                Поиск преподавателя английского
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  value={englishTeacherSearch}
                  onChange={(e) => handleSearchEnglishTeachers(e.target.value)}
                  placeholder="Введите ФИО..." 
                  className="w-full px-4 py-3.5 rounded-2xl bg-tg-bg text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border border-tg-hint/10 transition-all font-bold"
                />
                {englishTeachers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-tg-secondaryBg border border-tg-button/20 rounded-2xl mt-2 overflow-hidden shadow-2xl z-50">
                    {englishTeachers.map(t => (
                      <div 
                        key={t.id}
                        onClick={() => {
                          setSelectedEnglishTeacher(t);
                          setEnglishTeacherSearch(t.fio);
                          setEnglishTeachers([]);
                        }}
                        className="p-4 hover:bg-tg-button hover:text-tg-buttonText cursor-pointer font-bold border-b border-tg-hint/10 last:border-0"
                      >
                        {t.fio}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {selectedEnglishTeacher ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white">✓</div>
                 <div className="text-sm font-bold text-tg-text">Выбран: {selectedEnglishTeacher.fio}</div>
                 <button 
                   onClick={() => {
                     setSelectedEnglishTeacher(null);
                     setEnglishTeacherSearch('');
                   }}
                   className="ml-auto text-xs text-tg-hint font-bold"
                 >
                   Сбросить
                 </button>
              </div>
            ) : englishTeacherId && !englishTeacherSearch && (
              <div className="p-3 bg-tg-button/5 border border-tg-button/10 rounded-xl flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-tg-button/20 flex items-center justify-center text-tg-button">✓</div>
                 <div className="text-sm font-bold text-tg-text">Выбран: {englishTeacherFio || "Преподаватель"}</div>
                 <button 
                   onClick={() => {
                     setEnglishTeacherSearch(' '); 
                     handleSearchEnglishTeachers('');
                   }}
                   className="ml-auto text-xs text-tg-hint font-bold"
                 >
                   Изменить
                 </button>
              </div>
            )}
          </div>
        </div>
      )}


      <button 
        onClick={handleSave}
        disabled={isSaving || !hasChanges() || (!isTeacherLocal && !inputGroup.trim())}
        className="w-full py-4 bg-tg-button text-tg-buttonText font-bold rounded-2xl mt-auto active:scale-[0.98] transition-all shadow-lg shadow-tg-button/30 text-base flex justify-center items-center gap-2 disabled:opacity-50 disabled:shadow-none"
      >
        {isSaving ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        ) : (
          <>
            <Save size={20} />
            Сохранить изменения
          </>
        )}
      </button>
    </div>
  );
}
