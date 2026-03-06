import { useState } from 'react';
import axios from 'axios';
import { useUser } from '../contexts/UserContext';
import { GraduationCap, ArrowRight } from 'lucide-react';

export default function Onboarding() {
  const { updatePreferences } = useUser();
  const [inputGroup, setInputGroup] = useState('');
  const [inputStudentId, setInputStudentId] = useState('');
  const [isTeacher, setIsTeacher] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [groupSuggestions, setGroupSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!isTeacher && !inputGroup.trim()) return;
    if (isTeacher && !selectedTeacher) return;

    setIsLoading(true);
    if (isTeacher) {
      await updatePreferences(null, 0, null, true, selectedTeacher.urlId);
    } else {
      await updatePreferences(inputGroup.trim(), 0, inputStudentId.trim(), false, null);
    }
    setIsLoading(false);
  };

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

  const handleGroupSearch = async (val) => {
    setInputGroup(val);
    if (val.length < 2) {
      setGroupSuggestions([]);
      return;
    }
    try {
      const res = await axios.get('/api/bsuir/groups');
      const filtered = res.data.filter(g => 
        g.name.includes(val)
      ).slice(0, 5);
      setGroupSuggestions(filtered);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-tg-button rounded-full blur-[100px] opacity-20"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-emerald-500 rounded-full blur-[100px] opacity-10"></div>
      
      <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
        <div className="w-20 h-20 bg-tg-button/10 rounded-3xl flex items-center justify-center mb-6 shadow-inner border border-tg-button/20">
          <GraduationCap size={40} className="text-tg-button" />
        </div>
        
        <h1 className="text-3xl font-black mb-2 text-center text-tg-text">Добро пожаловать</h1>
        <p className="text-tg-hint text-center mb-8 font-medium">
          Давайте настроим приложение под вас. Для начала, введите номер вашей группы или студенческого.
        </p>

        <div className="w-full space-y-4">
          <label className="flex items-center gap-3 p-4 bg-tg-secondaryBg rounded-2xl cursor-pointer hover:bg-opacity-80 transition-all border-2 border-transparent focus-within:border-tg-button">
            <input 
              type="checkbox" 
              checked={isTeacher}
              onChange={(e) => setIsTeacher(e.target.checked)}
              className="w-5 h-5 accent-tg-button"
            />
            <span className="font-bold text-tg-text">Я преподаватель</span>
          </label>

          {!isTeacher ? (
            <>
              <div className="relative">
                <input 
                  type="text" 
                  value={inputGroup}
                  onChange={(e) => handleGroupSearch(e.target.value)}
                  placeholder="Учебная группа (напр. 114041)" 
                  className="w-full p-4 pl-5 pr-12 rounded-2xl bg-tg-secondaryBg border-2 border-transparent focus:border-tg-button outline-none text-lg font-bold shadow-sm transition-all text-tg-text placeholder:font-medium placeholder:text-tg-hint/50"
                  autoComplete="off"
                />
                {groupSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-tg-secondaryBg border border-tg-button/20 rounded-2xl mt-2 overflow-hidden shadow-2xl z-50">
                    {groupSuggestions.map(g => (
                      <div 
                        key={g.id}
                        onClick={() => {
                          setInputGroup(g.name);
                          setGroupSuggestions([]);
                        }}
                        className="p-4 hover:bg-tg-button hover:text-tg-buttonText cursor-pointer font-bold border-b border-tg-hint/10 last:border-0"
                      >
                        <div className="flex justify-between items-center">
                          <span>{g.name}</span>
                          <span className="text-[10px] opacity-70">{g.facultyAbbrev}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <input 
                  type="text" 
                  value={inputStudentId}
                  onChange={(e) => setInputStudentId(e.target.value)}
                  placeholder="Номер студенческого (для оценок)" 
                  className="w-full p-4 pl-5 pr-12 rounded-2xl bg-tg-secondaryBg border-2 border-transparent focus:border-tg-button outline-none text-lg font-bold shadow-sm transition-all text-tg-text placeholder:font-medium placeholder:text-tg-hint/50"
                />
              </div>
            </>
          ) : (
            <div className="relative space-y-2">
              <input 
                type="text" 
                value={teacherSearch}
                onChange={(e) => handleSearchTeachers(e.target.value)}
                placeholder="Ваше ФИО" 
                className="w-full p-4 pl-5 pr-12 rounded-2xl bg-tg-secondaryBg border-2 border-transparent focus:border-tg-button outline-none text-lg font-bold shadow-sm transition-all text-tg-text placeholder:font-medium placeholder:text-tg-hint/50"
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
                      className={`p-4 hover:bg-tg-button hover:text-tg-buttonText cursor-pointer font-bold border-b border-tg-hint/10 last:border-0 ${selectedTeacher?.id === t.id ? 'bg-tg-button/20' : ''}`}
                    >
                      {t.fio}
                    </div>
                  ))}
                </div>
              )}
              {selectedTeacher && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white">✓</div>
                   <div className="text-sm font-bold text-tg-text">Выбран: {selectedTeacher.fio}</div>
                </div>
              )}
            </div>
          )}

          <button 
            onClick={handleSave}
            disabled={(isTeacher ? !selectedTeacher : !inputGroup.trim()) || isLoading}
            className="w-full bg-tg-button text-tg-buttonText p-4 rounded-2xl font-bold text-lg flex justify-center items-center gap-2 shadow-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>Начать <ArrowRight size={20} /></>
            )}
          </button>
        </div>

        <p className="text-xs text-tg-hint/60 mt-6 text-center">
          Номер студенческого необходим для получения рейтинга и оценок. Группа — для расписания.
        </p>
      </div>
    </div>
  );
}
