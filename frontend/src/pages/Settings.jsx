import { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Settings as SettingsIcon, Save, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const { group, subgroup, englishSubgroup, studentId, updatePreferences } = useUser();
  const navigate = useNavigate();
  
  const [inputGroup, setInputGroup] = useState(group || '');
  const [inputStudentId, setInputStudentId] = useState(studentId || '');
  const [inputSubgroup, setInputSubgroup] = useState(subgroup || 0);
  const [inputEnglishSubgroup, setInputEnglishSubgroup] = useState(englishSubgroup || 0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setInputGroup(group || '');
    setInputSubgroup(subgroup || 0);
    setInputEnglishSubgroup(englishSubgroup || 0);
    setInputStudentId(studentId || '');
  }, [group, subgroup, englishSubgroup, studentId]);

  const handleSave = async () => {
    if (!inputGroup.trim()) return;
    setIsSaving(true);
    await updatePreferences(inputGroup.trim(), Number(inputSubgroup), Number(inputEnglishSubgroup), inputStudentId.trim());
    setIsSaving(false);
    navigate(-1); // Go back to the previous screen
  };

  return (
    <div className="p-4 relative min-h-[calc(100vh-4rem)] flex flex-col bg-tg-bg text-tg-text">
      <div className="flex items-center gap-3 mb-6">
        <button 
          onClick={() => navigate(-1)} 
          className="p-2 bg-tg-secondaryBg rounded-full hover:bg-tg-hint/10 transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon size={28} className="text-tg-button" />
          Настройки
        </h1>
      </div>

      <div className="bg-tg-secondaryBg p-5 rounded-3xl shadow-sm border border-tg-hint/10 mb-6">
        <h2 className="text-lg font-bold mb-4">Учебные данные</h2>
        
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
              className="w-full px-4 py-3.5 rounded-2xl bg-[var(--tg-theme-bg-color)] text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border border-tg-hint/10 transition-all font-bold text-lg"
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
              className="w-full px-4 py-3.5 rounded-2xl bg-[var(--tg-theme-bg-color)] text-tg-text focus:outline-none ring-2 ring-transparent focus:ring-tg-button/30 border border-tg-hint/10 transition-all font-bold text-lg"
            />
          </div>

          <div>
             <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">
              Подгруппа (для расписания)
            </label>
            <div className="flex bg-[var(--tg-theme-bg-color)] p-1 rounded-2xl border border-tg-hint/10">
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
          
          <div>
             <label className="block text-xs font-semibold uppercase text-tg-hint mb-1.5 ml-1">
              Подгруппа (Иностранный язык)
            </label>
            <div className="flex bg-[var(--tg-theme-bg-color)] p-1 rounded-2xl border border-tg-hint/10">
              {[0, 1, 2].map(val => (
                <button
                  key={val}
                  onClick={() => setInputEnglishSubgroup(val)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                    inputEnglishSubgroup === val 
                      ? 'bg-emerald-500 text-white shadow-md' 
                      : 'text-tg-hint hover:bg-tg-hint/5'
                  }`}
                >
                  {val === 0 ? 'Как основная' : `${val} подгруппа`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button 
        onClick={handleSave}
        disabled={isSaving || !inputGroup.trim() || (inputGroup === group && inputSubgroup === subgroup && inputEnglishSubgroup === englishSubgroup && inputStudentId === studentId)}
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
